const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// TODO: quando SupraSoy, Nova Oliva e Meu Biju tiverem property GA4, adicionar aqui.
const PROPERTY_ENV_BY_BRAND = {
  josapar: 'GA4_PROPERTY_ID_JOSAPAR_SITE',
  tiojoao: 'GA4_PROPERTY_ID_TIO_JOAO',
  armazem: 'GA4_PROPERTY_ID_ARMAZEM',
  feijaotiojoao: 'GA4_PROPERTY_ID_FEIJAO_TIO_JOAO',
};

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const rawKey = process.env.GA4_PRIVATE_KEY;
  const projectId = process.env.GA4_PROJECT_ID;
  if (!clientEmail || !rawKey || !projectId) {
    throw new Error('Credenciais GA4 ausentes (GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY / GA4_PROJECT_ID).');
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');
  cachedClient = new BetaAnalyticsDataClient({
    credentials: { client_email: clientEmail, private_key: privateKey },
    projectId,
  });
  return cachedClient;
}

function rangeFromDays(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}
function prevRangeFromDays(days) {
  const nowMs = Date.now();
  const endMs = nowMs - days * 86400000;
  const startMs = endMs - days * 86400000;
  const fmt = (ms) => new Date(ms).toISOString().split('T')[0];
  return { startDate: fmt(startMs), endDate: fmt(endMs) };
}
// para range personalizado, o "período anterior" é uma janela do mesmo tamanho, imediatamente antes.
function prevRangeFromCustom(startDate, endDate) {
  const spanMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  const prevEndMs = new Date(startDate).getTime() - 86400000;
  const prevStartMs = prevEndMs - spanMs;
  const fmt = (ms) => new Date(ms).toISOString().split('T')[0];
  return { startDate: fmt(prevStartMs), endDate: fmt(prevEndMs) };
}

async function getKPIs(ga, propertyId, range, prevRange) {
  const [res] = await ga.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [range, prevRange],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'newUsers' },
      { name: 'engagementRate' },
      { name: 'conversions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViews' },
    ],
  });
  const cur = (res.rows && res.rows[0] && res.rows[0].metricValues) || [];
  const prv = (res.rows && res.rows[1] && res.rows[1].metricValues) || [];
  const delta = (c, p) => {
    const cv = parseFloat((c && c.value) || '0');
    const pv = parseFloat((p && p.value) || '0');
    return pv === 0 ? 0 : ((cv - pv) / pv) * 100;
  };
  return {
    users: { value: parseInt((cur[0] && cur[0].value) || '0', 10), delta: delta(cur[0], prv[0]) },
    sessions: { value: parseInt((cur[1] && cur[1].value) || '0', 10), delta: delta(cur[1], prv[1]) },
    newUsers: { value: parseInt((cur[2] && cur[2].value) || '0', 10), delta: delta(cur[2], prv[2]) },
    engagementRate: { value: parseFloat((cur[3] && cur[3].value) || '0') * 100, delta: delta(cur[3], prv[3]) },
    conversions: { value: parseInt((cur[4] && cur[4].value) || '0', 10), delta: delta(cur[4], prv[4]) },
    engagedSessions: { value: parseInt((cur[5] && cur[5].value) || '0', 10), delta: delta(cur[5], prv[5]) },
    bounceRate: { value: parseFloat((cur[6] && cur[6].value) || '0') * 100, delta: delta(cur[6], prv[6]) },
    avgSessionDuration: { value: parseFloat((cur[7] && cur[7].value) || '0'), delta: delta(cur[7], prv[7]) },
    pageViews: { value: parseInt((cur[8] && cur[8].value) || '0', 10), delta: delta(cur[8], prv[8]) },
  };
}

async function getTimeline(ga, propertyId, range) {
  const [res] = await ga.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [range],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
  });
  const labels = [];
  const values = [];
  (res.rows || []).forEach((row) => {
    const date = (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || '';
    labels.push(date.slice(6, 8) + '/' + date.slice(4, 6));
    values.push(parseInt((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || '0', 10));
  });
  return { labels, values };
}

async function getCities(ga, propertyId, range) {
  // "Top cidades" é pra tráfego do site (deveria ser majoritariamente BR) — sem filtro de país,
  // tráfego de bot/VPN/crawler (Washington, Urumqi, Dublin etc.) aparecia misturado no ranking.
  const [res] = await ga.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [range],
    dimensions: [{ name: 'city' }, { name: 'country' }],
    metrics: [{ name: 'totalUsers' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { notExpression: { filter: { fieldName: 'city', stringFilter: { value: '(not set)' } } } },
          { filter: { fieldName: 'country', stringFilter: { value: 'Brazil' } } },
        ],
      },
    },
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 15,
  });
  return (res.rows || []).map((row) => ({
    name: (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || '—',
    users: parseInt((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || '0', 10),
  }));
}

async function getRegions(ga, propertyId, range) {
  const [res] = await ga.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [range],
    dimensions: [{ name: 'region' }],
    metrics: [{ name: 'totalUsers' }],
    dimensionFilter: {
      notExpression: { filter: { fieldName: 'region', stringFilter: { value: '(not set)' } } },
    },
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 30,
  });
  return (res.rows || []).map((row) => ({
    name: (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || '—',
    users: parseInt((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || '0', 10),
  }));
}

module.exports = async (req, res) => {
  const brand = req.query.brand;
  const days = parseInt(req.query.days || '30', 10);
  const dateFrom = req.query.date_from;
  const dateTo = req.query.date_to;

  const envKey = PROPERTY_ENV_BY_BRAND[brand];
  if (!envKey) {
    res.status(400).json({
      error: `Marca "${brand}" sem propriedade GA4 mapeada.`,
      brandsDisponiveis: Object.keys(PROPERTY_ENV_BY_BRAND),
    });
    return;
  }
  const propertyId = process.env[envKey];
  if (!propertyId) {
    res.status(404).json({ error: `Variável de ambiente ${envKey} não configurada.` });
    return;
  }

  const range = dateFrom && dateTo ? { startDate: dateFrom, endDate: dateTo } : rangeFromDays(days);
  const prevRange = dateFrom && dateTo ? prevRangeFromCustom(dateFrom, dateTo) : prevRangeFromDays(days);

  try {
    const ga = getClient();
    const [kpisR, timelineR, citiesR, regionsR, regionsPrevR] = await Promise.allSettled([
      getKPIs(ga, propertyId, range, prevRange),
      getTimeline(ga, propertyId, range),
      getCities(ga, propertyId, range),
      getRegions(ga, propertyId, range),
      getRegions(ga, propertyId, prevRange),
    ]);
    [kpisR, timelineR, citiesR, regionsR, regionsPrevR].forEach((r, i) => {
      if (r.status === 'rejected') console.error('[GA4 API] query ' + i + ' falhou:', r.reason && r.reason.message);
    });
    res.status(200).json({
      brand: brand, propertyId: propertyId, range: range, prevRange: prevRange,
      kpis: kpisR.status === 'fulfilled' ? kpisR.value : null,
      timeline: timelineR.status === 'fulfilled' ? timelineR.value : null,
      cities: citiesR.status === 'fulfilled' ? citiesR.value : null,
      regions: regionsR.status === 'fulfilled' ? regionsR.value : null,
      regionsPrev: regionsPrevR.status === 'fulfilled' ? regionsPrevR.value : null,
      regionsError: regionsR.status === 'rejected' ? regionsR.reason.message : null,
    });
  } catch (err) {
    console.error('[GA4 API]', (err && err.message) || err);
    res.status(500).json({ error: 'Falha ao consultar GA4', detail: (err && err.message) || String(err) });
  }
};

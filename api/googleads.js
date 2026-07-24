// Google Ads (mídia paga) — aba Performance de Mídia / Campanhas do dash
// Conta compartilhada entre marcas (mesmo padrão do Meta) — só existe UMA conta filha
// (3922087193 "Armazém Tio João") sob a MCC, e todas as marcas Josapar rodam campanhas nela.
// Segmentação por nome de campanha, não por conta separada.

const BRAND_PATTERNS = {
  josapar: ['josapar'],
  tiojoao: ['tiojoao'],
  armazem: ['armazem'],
  suprasoy: ['suprasoy'],
  meubiju: ['meubiju'],
  novaoliva: ['novaoliva', 'novaolica'],
};

const API_VERSION = 'v21';

function num(v) { return typeof v === 'number' ? v : parseFloat(v || '0') || 0; }
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function matchesBrand(campaignName, brand) {
  const norm = normalize(campaignName);
  return (BRAND_PATTERNS[brand] || []).some((p) => norm.indexOf(p) !== -1);
}

let cachedToken = null;
let cachedTokenExpiry = 0;
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60000) return cachedToken;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Credenciais OAuth do Google Ads ausentes.');
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const json = await r.json();
  if (!r.ok) throw new Error('OAuth ' + r.status + ': ' + JSON.stringify(json));
  cachedToken = json.access_token;
  cachedTokenExpiry = now + json.expires_in * 1000;
  return cachedToken;
}

async function gaqlSearch(query) {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!customerId || !loginCustomerId || !developerToken) throw new Error('GOOGLE_ADS_CUSTOMER_ID / LOGIN_CUSTOMER_ID / DEVELOPER_TOKEN ausentes.');
  const token = await getAccessToken();
  const r = await fetch('https://googleads.googleapis.com/' + API_VERSION + '/customers/' + customerId + '/googleAds:search', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'developer-token': developerToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: query }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error('GoogleAds ' + r.status + ': ' + JSON.stringify(json.error || json));
  return json.results || [];
}

function dateWindow(days, dateFrom, dateTo) {
  if (dateFrom && dateTo) return { start: dateFrom, end: dateTo };
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const fmt = (d) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end) };
}

module.exports = async (req, res) => {
  const brand = req.query.brand;
  const days = parseInt(req.query.days || '30', 10);
  const dateFrom = req.query.date_from;
  const dateTo = req.query.date_to;

  if (!BRAND_PATTERNS[brand]) {
    res.status(400).json({
      error: 'Marca "' + brand + '" sem padrão de campanha mapeado.',
      brandsDisponiveis: Object.keys(BRAND_PATTERNS),
    });
    return;
  }

  try {
    const { start, end } = dateWindow(days, dateFrom, dateTo);

    const campaignRows = await gaqlSearch(
      'SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, ' +
      'metrics.conversions, metrics.conversions_value FROM campaign ' +
      "WHERE segments.date BETWEEN '" + start + "' AND '" + end + "' LIMIT 300"
    );
    const matched = campaignRows.filter((r) => matchesBrand(r.campaign.name, brand));

    let impressions = 0, clicks = 0, spend = 0, conversions = 0, revenue = 0;
    const campaigns = matched.map((r) => {
      const m = r.metrics || {};
      const i = num(m.impressions), c = num(m.clicks), s = num(m.costMicros) / 1e6;
      const conv = num(m.conversions), rev = num(m.conversionsValue);
      impressions += i; clicks += c; spend += s; conversions += conv; revenue += rev;
      return {
        id: r.campaign.id, name: r.campaign.name, spend: s, impressions: i, clicks: c,
        ctr: i > 0 ? (c / i) * 100 : 0, cpc: c > 0 ? s / c : 0, conversions: conv, roas: s > 0 ? rev / s : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    let timeline = { labels: [], values: [] };
    let keywords = [];
    let ageGender = [];
    let device = [];
    let hourly = [];
    if (matched.length) {
      const ids = matched.map((r) => r.campaign.id).join(', ');
      const dateClause = "segments.date BETWEEN '" + start + "' AND '" + end + "'";
      const [dailyRows, keywordRows, ageRows, genderRows, deviceRows, hourRows] = await Promise.all([
        gaqlSearch('SELECT segments.date, metrics.cost_micros FROM campaign WHERE campaign.id IN (' + ids + ') AND ' + dateClause + ' ORDER BY segments.date'),
        // keyword_view só existe pra campanhas de Search — campanhas Display/Shopping/PMax da marca simplesmente não aparecem aqui (lista vazia, não é erro).
        gaqlSearch(
          'SELECT ad_group_criterion.keyword.text, metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view ' +
          'WHERE campaign.id IN (' + ids + ') AND ' + dateClause + ' LIMIT 500'
        ).catch(() => []),
        // age_range_view/gender_view/device/hour também só existem pra tipos de campanha com esse tipo de segmentação (Search/Display) — lista vazia é normal pra Shopping/PMax.
        gaqlSearch('SELECT ad_group_criterion.age_range.type, metrics.clicks, metrics.impressions FROM age_range_view WHERE campaign.id IN (' + ids + ') AND ' + dateClause).catch(() => []),
        gaqlSearch('SELECT ad_group_criterion.gender.type, metrics.clicks, metrics.impressions FROM gender_view WHERE campaign.id IN (' + ids + ') AND ' + dateClause).catch(() => []),
        gaqlSearch('SELECT segments.device, metrics.clicks, metrics.impressions FROM campaign WHERE campaign.id IN (' + ids + ') AND ' + dateClause).catch(() => []),
        gaqlSearch('SELECT segments.hour, metrics.clicks, metrics.impressions FROM campaign WHERE campaign.id IN (' + ids + ') AND ' + dateClause).catch(() => []),
      ]);
      const dailyMap = {};
      dailyRows.forEach((r) => {
        const d = r.segments.date;
        dailyMap[d] = (dailyMap[d] || 0) + num(r.metrics.costMicros) / 1e6;
      });
      const dates = Object.keys(dailyMap).sort();
      timeline = {
        labels: dates.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)),
        values: dates.map((d) => dailyMap[d]),
      };

      const kwMap = {};
      keywordRows.forEach((r) => {
        const text = (r.adGroupCriterion && r.adGroupCriterion.keyword && r.adGroupCriterion.keyword.text) || '—';
        const m = r.metrics || {};
        if (!kwMap[text]) kwMap[text] = { text: text, clicks: 0, impressions: 0, spend: 0 };
        kwMap[text].clicks += num(m.clicks);
        kwMap[text].impressions += num(m.impressions);
        kwMap[text].spend += num(m.costMicros) / 1e6;
      });
      keywords = Object.values(kwMap).sort((a, b) => b.clicks - a.clicks).slice(0, 12);

      const ageMap = {};
      ageRows.forEach((r) => {
        const age = (r.adGroupCriterion && r.adGroupCriterion.ageRange && r.adGroupCriterion.ageRange.type) || 'UNDETERMINED';
        if (!ageMap[age]) ageMap[age] = { age: age, clicks: 0, impressions: 0 };
        ageMap[age].clicks += num(r.metrics.clicks);
        ageMap[age].impressions += num(r.metrics.impressions);
      });
      const genderMap = {};
      genderRows.forEach((r) => {
        const gender = (r.adGroupCriterion && r.adGroupCriterion.gender && r.adGroupCriterion.gender.type) || 'UNDETERMINED';
        if (!genderMap[gender]) genderMap[gender] = { gender: gender, clicks: 0, impressions: 0 };
        genderMap[gender].clicks += num(r.metrics.clicks);
        genderMap[gender].impressions += num(r.metrics.impressions);
      });
      ageGender = { byAge: Object.values(ageMap), byGender: Object.values(genderMap) };

      const deviceMap = {};
      deviceRows.forEach((r) => {
        const dv = (r.segments && r.segments.device) || 'UNKNOWN';
        if (!deviceMap[dv]) deviceMap[dv] = { device: dv, clicks: 0, impressions: 0 };
        deviceMap[dv].clicks += num(r.metrics.clicks);
        deviceMap[dv].impressions += num(r.metrics.impressions);
      });
      device = Object.values(deviceMap);

      const hourMap = {};
      hourRows.forEach((r) => {
        const h = (r.segments && r.segments.hour) || 0;
        if (!hourMap[h]) hourMap[h] = { hour: h, clicks: 0, impressions: 0 };
        hourMap[h].clicks += num(r.metrics.clicks);
        hourMap[h].impressions += num(r.metrics.impressions);
      });
      hourly = Object.keys(hourMap).map((h) => hourMap[h]).sort((a, b) => a.hour - b.hour);
    }

    res.status(200).json({
      brand: brand,
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
      days: days,
      range: { startDate: start, endDate: end },
      kpis: { spend, impressions, clicks, ctr, cpc, conversions, cpa, revenue, roas },
      timeline: timeline,
      campaigns: campaigns.slice(0, 20),
      keywords: keywords,
      ageGender: ageGender,
      device: device,
      hourly: hourly,
      matchedCampaignsCount: matched.length,
      notes: {
        segmentacao: 'Conta de anúncio compartilhada entre marcas (única conta filha na MCC) — filtro por nome de campanha (padrões: ' + JSON.stringify(BRAND_PATTERNS[brand]) + '), não por conta separada.',
      },
    });
  } catch (err) {
    console.error('[Google Ads API]', (err && err.message) || err);
    res.status(500).json({ error: 'Falha ao consultar Google Ads', detail: (err && err.message) || String(err) });
  }
};

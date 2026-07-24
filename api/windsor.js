// Windsor.ai — Instagram orgânico (aba Social Media do dash)
// Doc do conector: https://windsor.ai/data-field/instagram/

const BRAND_ACCOUNT_ENV = {
  josapar: 'WINDSOR_ACCOUNT_ID_JOSAPAR',
  tiojoao: 'WINDSOR_ACCOUNT_ID_TIOJOAO',
  suprasoy: 'WINDSOR_ACCOUNT_ID_SUPRASOY',
  meubiju: 'WINDSOR_ACCOUNT_ID_MEUBIJU',
  // TODO: novaoliva e armazem ainda sem conta de Instagram própria mapeada
};

// media_product_type -> chave usada no gráfico "Engajamento por formato"
const FORMAT_MAP = { FEED: 'feed', REELS: 'reels', STORY: 'stories', CAROUSEL_CONTAINER: 'feed' };

function num(v) { return typeof v === 'number' ? v : parseFloat(v || '0') || 0; }

function datePresetFor(days) {
  if (days <= 7) return 'last_7d';
  if (days <= 30) return 'last_30d';
  return 'last_90d';
}

// janela principal da consulta: preset (7/30/90) OU range exato quando o usuário escolhe datas customizadas.
function windowParams(days, dateFrom, dateTo) {
  if (dateFrom && dateTo) return 'date_from=' + dateFrom + '&date_to=' + dateTo;
  return 'date_preset=' + datePresetFor(days);
}

// follower_count (fluxo diário) só aceita até 30 dias — se o range customizado for maior, usa só os últimos 30 dias dele.
function growthWindowParams(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 'date_preset=last_30d';
  const toMs = new Date(dateTo).getTime();
  const fromMs = Math.max(new Date(dateFrom).getTime(), toMs - 29 * 86400000);
  const fmt = (ms) => new Date(ms).toISOString().split('T')[0];
  return 'date_from=' + fmt(fromMs) + '&date_to=' + dateTo;
}

async function fetchWindsor(fields, dateParams, accountId) {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error('WINDSOR_API_KEY ausente.');
  const url = 'https://connectors.windsor.ai/instagram?api_key=' + encodeURIComponent(key) +
    '&' + dateParams + '&fields=' + fields.join(',') +
    '&select_accounts=' + accountId;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error('Windsor ' + r.status + ': ' + body);
  }
  const json = await r.json();
  return json.data || [];
}

module.exports = async (req, res) => {
  const brand = req.query.brand;
  const days = parseInt(req.query.days || '30', 10);
  const dateFrom = req.query.date_from;
  const dateTo = req.query.date_to;

  const envKey = BRAND_ACCOUNT_ENV[brand];
  if (!envKey) {
    res.status(400).json({
      error: 'Marca "' + brand + '" sem conta de Instagram mapeada no Windsor.',
      brandsDisponiveis: Object.keys(BRAND_ACCOUNT_ENV),
    });
    return;
  }
  const accountId = process.env[envKey];
  if (!accountId) {
    res.status(404).json({ error: 'Variável de ambiente ' + envKey + ' não configurada.' });
    return;
  }

  try {
    const mainWindow = windowParams(days, dateFrom, dateTo);
    const growthWindow = growthWindowParams(dateFrom, dateTo);

    // followers_count (plural) = total atual (foto do momento, 1 linha — sempre "hoje", não respeita range escolhido).
    // follower_count (singular) = novos seguidores POR DIA (fluxo) — não confundir os dois,
    // nem pedir juntos na mesma chamada (colidem e um deles volta null). Limite de 30 dias no fluxo diário.
    // follower_count (fluxo diário) só existe pra janelas dentro dos últimos 30 dias a partir de hoje —
    // se o range escolhido for mais antigo que isso, a Windsor rejeita a chamada inteira. Isolamos essa
    // busca pra não derrubar o endpoint todo quando isso acontecer (fica sem série de crescimento, só isso).
    let growthUnavailable = false;
    const [totalRows, dailyGrowthRows, accountRows, mediaRows] = await Promise.all([
      fetchWindsor(['account_id', 'followers_count'], 'date_preset=last_7d', accountId),
      fetchWindsor(['date', 'follower_count'], growthWindow, accountId).catch(() => { growthUnavailable = true; return []; }),
      fetchWindsor(['date', 'profile_views', 'website_clicks_1d'], mainWindow, accountId),
      fetchWindsor(
        ['date', 'media_id', 'media_type', 'media_product_type', 'media_reach', 'media_impressions',
         'media_engagement', 'media_like_count', 'media_comments_count', 'media_saved', 'media_shares',
         'media_reel_total_interactions', 'story_reach', 'story_views'],
        mainWindow, accountId
      ),
    ]);

    // ---- seguidores ----
    const followers = totalRows.length ? num(totalRows[0].followers_count) : 0;
    const dailyGrowthSorted = dailyGrowthRows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const netNewFollowers = dailyGrowthSorted.reduce((sum, r) => sum + num(r.follower_count), 0);
    const followersStart = followers - netNewFollowers;
    const growthPct = followersStart > 0 ? (netNewFollowers / followersStart) * 100 : 0;
    // série cumulativa (total estimado dia a dia) — mais legível no gráfico do que o delta bruto
    let running = followersStart;
    const followersCumulative = dailyGrowthSorted.map((r) => { running += num(r.follower_count); return running; });

    // ---- cliques / perfil (nível conta — 1 linha por dia, sem duplicar por post) ----
    let clicksTotal = 0, profileViewsTotal = 0;
    accountRows.forEach((row) => { clicksTotal += num(row.website_clicks_1d); profileViewsTotal += num(row.profile_views); });

    // ---- mídia (nível post) ----
    let reachTotal = 0, impressionsTotal = 0, engagementTotal = 0;
    let likesTotal = 0, commentsTotal = 0, savedTotal = 0, sharesTotal = 0;
    const byFormat = { feed: 0, reels: 0, stories: 0, outros: 0 };
    const dailyMap = {};
    mediaRows.forEach((row) => {
      const reach = num(row.media_reach), engagement = num(row.media_engagement);
      reachTotal += reach;
      impressionsTotal += num(row.media_impressions);
      engagementTotal += engagement;
      likesTotal += num(row.media_like_count);
      commentsTotal += num(row.media_comments_count);
      savedTotal += num(row.media_saved);
      sharesTotal += num(row.media_shares);

      const formatKey = FORMAT_MAP[row.media_product_type] || 'outros';
      byFormat[formatKey] += engagement;

      const d = row.date;
      if (!dailyMap[d]) dailyMap[d] = { reach: 0, engagement: 0 };
      dailyMap[d].reach += reach;
      dailyMap[d].engagement += engagement;
    });

    const dailyDatesSorted = Object.keys(dailyMap).sort();
    const timeline = {
      labels: dailyDatesSorted.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)),
      reach: dailyDatesSorted.map((d) => dailyMap[d].reach),
      engagement: dailyDatesSorted.map((d) => dailyMap[d].engagement),
    };

    const engagementRate = reachTotal > 0 ? (engagementTotal / reachTotal) * 100 : 0;

    res.status(200).json({
      brand: brand,
      accountId: accountId,
      days: days,
      range: (dateFrom && dateTo) ? { startDate: dateFrom, endDate: dateTo } : null,
      kpis: {
        followers: followers,
        growthPct: growthPct,
        reach: reachTotal,
        impressions: impressionsTotal,
        engagement: engagementTotal,
        engagementRate: engagementRate,
        clicks: clicksTotal,
        profileViews: profileViewsTotal,
        likes: likesTotal,
        comments: commentsTotal,
        saved: savedTotal,
        shares: sharesTotal,
        nonFollowerPct: null,
      },
      followersSeries: {
        labels: dailyGrowthSorted.map((r) => r.date.slice(8, 10) + '/' + r.date.slice(5, 7)),
        values: followersCumulative,
      },
      timeline: timeline,
      byFormat: byFormat,
      notes: {
        nonFollowerPct: 'Sem campo nativo no Windsor.ai (breakdown de reach por follow_type) — não disponível.',
        stories: 'story_reach/story_views só refletem a Story ativa no momento da consulta (a API do Instagram não guarda histórico de Stories expiradas).',
        growthPct: 'Calculado a partir do total atual (followers_count) menos o saldo de novos seguidores por dia (follower_count) no período — a API não expõe uma série histórica do total.',
        followersSnapshot: 'followers_count sempre reflete o total de HOJE, independente do range de datas escolhido (a API não guarda o total histórico por dia) — só a série de crescimento (follower_count) respeita o período selecionado.',
        impressions: 'media_impressions sempre null nos posts reais testados — a Meta descontinuou essa métrica no nível de post da API do Instagram desde 2023 (só reach continua disponível). "impressions" aqui provavelmente vai ficar 0 pra sempre, não é bug do endpoint.',
        clicks: 'profile_views e website_clicks_1d voltaram array vazio (sem nenhuma linha) nos testes — provável falta de escopo/permissão da conta conectada no Windsor, não confirmado como disponível ainda.',
        growthUnavailable: growthUnavailable ? 'Range de datas escolhido é mais antigo que os últimos 30 dias — a Windsor não permite consultar follower_count fora dessa janela, então crescimento/série de seguidores ficou vazio neste período.' : undefined,
      },
    });
  } catch (err) {
    console.error('[Windsor API]', (err && err.message) || err);
    res.status(500).json({ error: 'Falha ao consultar Windsor.ai', detail: (err && err.message) || String(err) });
  }
};

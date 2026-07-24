// Meta Ads (mídia paga) — aba Performance de Mídia / Campanhas do dash
// Conta compartilhada entre marcas — segmentação é por nome de campanha (taxonomia), não por conta separada.
// Ex: "v4-web_poa_traf_site_tio-joao_link_feijao" ou "[SUPRASOY] [VENDAS] [CONV]..."

const BRAND_PATTERNS = {
  josapar: ['josapar'],
  tiojoao: ['tiojoao'],
  armazem: ['armazem'],
  suprasoy: ['suprasoy'],
  meubiju: ['meubiju'],
  novaoliva: ['novaoliva', 'novaolica'], // "novaolica" é um typo real visto em campanha ativa
};

// action_types que contam como conversão/receita quando presentes (dependem do pixel/evento configurado na campanha)
const CONVERSION_ACTION_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'lead', 'onsite_conversion.lead_grouped', 'complete_registration'];
const REVENUE_ACTION_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
// engajamento (reações, comentários, compartilhamentos, cliques no post) — métrica padrão do Meta pra campanhas de Tráfego/Engajamento/Reconhecimento
const ENGAGEMENT_ACTION_TYPES = ['post_engagement', 'page_engagement'];

const API_VERSION = 'v21.0';

function num(v) { return typeof v === 'number' ? v : parseFloat(v || '0') || 0; }

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function matchesBrand(campaignName, brand) {
  const norm = normalize(campaignName);
  return (BRAND_PATTERNS[brand] || []).some((p) => norm.indexOf(p) !== -1);
}
function sumActions(actions, types) {
  if (!actions) return 0;
  return actions.reduce((total, a) => (types.indexOf(a.action_type) !== -1 ? total + num(a.value) : total), 0);
}

function timeParam(days, dateFrom, dateTo) {
  if (dateFrom && dateTo) return 'time_range=' + encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }));
  const preset = days <= 7 ? 'last_7d' : days <= 30 ? 'last_30d' : 'last_90d';
  return 'date_preset=' + preset;
}

async function fetchMeta(path, params) {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN ausente.');
  const url = 'https://graph.facebook.com/' + API_VERSION + '/' + path + '?' + params + '&access_token=' + encodeURIComponent(token);
  const r = await fetch(url);
  const json = await r.json();
  if (!r.ok) throw new Error('Meta ' + r.status + ': ' + JSON.stringify(json.error || json));
  return json;
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
  const adAccount = process.env.META_AD_ACCOUNT_ID;
  if (!adAccount) {
    res.status(404).json({ error: 'Variável de ambiente META_AD_ACCOUNT_ID não configurada.' });
    return;
  }

  try {
    const tParam = timeParam(days, dateFrom, dateTo);
    const campaignFields = 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions,action_values';
    const [campaignData, adData, ageGenderData, deviceData, hourData] = await Promise.all([
      fetchMeta('act_' + adAccount + '/insights', 'level=campaign&fields=' + campaignFields + '&' + tParam + '&limit=300'),
      fetchMeta('act_' + adAccount + '/insights', 'level=ad&fields=ad_id,ad_name,campaign_name,ctr,clicks,impressions,reach,spend,actions&' + tParam + '&limit=300'),
      fetchMeta('act_' + adAccount + '/insights', 'level=campaign&fields=campaign_name,clicks,impressions,spend&breakdowns=age,gender&' + tParam + '&limit=300').catch(() => ({ data: [] })),
      fetchMeta('act_' + adAccount + '/insights', 'level=campaign&fields=campaign_name,clicks,impressions&breakdowns=device_platform&' + tParam + '&limit=300').catch(() => ({ data: [] })),
      fetchMeta('act_' + adAccount + '/insights', 'level=campaign&fields=campaign_name,clicks,impressions&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&' + tParam + '&limit=500').catch(() => ({ data: [] })),
    ]);
    const matched = (campaignData.data || []).filter((r) => matchesBrand(r.campaign_name, brand));
    const matchedAds = (adData.data || []).filter((r) => matchesBrand(r.campaign_name, brand));
    const matchedAgeGender = (ageGenderData.data || []).filter((r) => matchesBrand(r.campaign_name, brand));
    const matchedDevice = (deviceData.data || []).filter((r) => matchesBrand(r.campaign_name, brand));
    const matchedHour = (hourData.data || []).filter((r) => matchesBrand(r.campaign_name, brand));

    let spend = 0, impressions = 0, clicks = 0, reach = 0, conversions = 0, revenue = 0, engagement = 0;
    const campaigns = matched.map((r) => {
      const s = num(r.spend), i = num(r.impressions), c = num(r.clicks);
      const conv = sumActions(r.actions, CONVERSION_ACTION_TYPES);
      const rev = sumActions(r.action_values, REVENUE_ACTION_TYPES);
      const eng = sumActions(r.actions, ENGAGEMENT_ACTION_TYPES);
      spend += s; impressions += i; clicks += c; reach += num(r.reach); conversions += conv; revenue += rev; engagement += eng;
      return {
        id: r.campaign_id, name: r.campaign_name, spend: s, impressions: i, clicks: c,
        ctr: num(r.ctr), cpc: num(r.cpc), conversions: conv, roas: s > 0 ? rev / s : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    // ---- demografia: idade x gênero, device, hora do dia ----
    const ageGenderMap = {};
    matchedAgeGender.forEach((r) => {
      const key = (r.age || '—') + '|' + (r.gender || '—');
      if (!ageGenderMap[key]) ageGenderMap[key] = { age: r.age || '—', gender: r.gender || '—', clicks: 0, impressions: 0 };
      ageGenderMap[key].clicks += num(r.clicks);
      ageGenderMap[key].impressions += num(r.impressions);
    });
    const ageGender = Object.values(ageGenderMap);

    const deviceMap = {};
    matchedDevice.forEach((r) => {
      const key = r.device_platform || '—';
      if (!deviceMap[key]) deviceMap[key] = { device: key, clicks: 0, impressions: 0 };
      deviceMap[key].clicks += num(r.clicks);
      deviceMap[key].impressions += num(r.impressions);
    });
    const device = Object.values(deviceMap);

    const hourMap = {};
    matchedHour.forEach((r) => {
      const h = parseInt(r.hourly_stats_aggregated_by_advertiser_time_zone, 10);
      if (!hourMap[h]) hourMap[h] = { hour: h, clicks: 0, impressions: 0 };
      hourMap[h].clicks += num(r.clicks);
      hourMap[h].impressions += num(r.impressions);
    });
    const hourly = Object.keys(hourMap).map((h) => hourMap[h]).sort((a, b) => a.hour - b.hour);

    // ---- criativos (nível anúncio) — top CTR e top conversões, com thumbnail ----
    // corta ruído por IMPRESSÕES (não cliques) — um anúncio de alcance/reconhecimento pode ter
    // milhares de impressões e poucos cliques por natureza; filtrar por clique excluía esses da lista.
    const adsWithMetrics = matchedAds.map((r) => ({
      id: r.ad_id, name: r.ad_name, ctr: num(r.ctr), clicks: num(r.clicks), impressions: num(r.impressions),
      reach: num(r.reach), engagement: sumActions(r.actions, ENGAGEMENT_ACTION_TYPES),
      conversions: sumActions(r.actions, CONVERSION_ACTION_TYPES),
    })).filter((a) => a.impressions >= 100);
    const topByCtr = adsWithMetrics.slice().sort((a, b) => b.ctr - a.ctr).slice(0, 5);
    const topByConv = adsWithMetrics.slice().sort((a, b) => b.conversions - a.conversions).slice(0, 5);
    const topByReach = adsWithMetrics.slice().sort((a, b) => b.reach - a.reach).slice(0, 5);
    const topByEngagement = adsWithMetrics.slice().sort((a, b) => b.engagement - a.engagement).slice(0, 5);
    const uniqueAdIds = Array.from(new Set(topByCtr.concat(topByConv, topByReach, topByEngagement).map((a) => a.id)));
    const thumbById = {};
    if (uniqueAdIds.length) {
      // 3 formatos de criativo, 3 jeitos de achar a imagem em boa resolução:
      // 1) imagem simples -> creative.image_url já vem em resolução real.
      // 2) Advantage+/Formato automático -> não tem imagem única no creative, só um HASH em
      //    asset_feed_spec.images; resolve via /adimages?hashes=[...] (devolve url real).
      // 3) anúncio de vídeo -> sem image_url, só thumbnail_url, que por padrão vem cortado em
      //    64x64; resolve pedindo thumbnail_url de novo direto no objeto creative com
      //    thumbnail_width/height (só funciona como parâmetro top-level, não aninhado em ad->creative).
      const creativeResults = await Promise.all(uniqueAdIds.map((id) =>
        fetchMeta(id, 'fields=creative%7Bid,image_url,thumbnail_url,asset_feed_spec%7Bimages%7D%7D').catch(() => null)
      ));
      const hashByAdId = {};
      const allHashes = new Set();
      const videoCreativeByAdId = {}; // adId -> creative.id, pra rebuscar thumbnail_url em tamanho maior
      creativeResults.forEach((r, i) => {
        const adId = uniqueAdIds[i];
        const creative = r && r.creative;
        if (!creative) return;
        const afsImages = creative.asset_feed_spec && creative.asset_feed_spec.images;
        if (afsImages && afsImages.length && afsImages[0].hash) {
          hashByAdId[adId] = afsImages[0].hash;
          allHashes.add(afsImages[0].hash);
        } else if (creative.image_url) {
          thumbById[adId] = creative.image_url;
        } else if (creative.id) {
          videoCreativeByAdId[adId] = creative.id;
        }
      });
      if (allHashes.size) {
        const hashList = Array.from(allHashes);
        const adImagesData = await fetchMeta(
          'act_' + adAccount + '/adimages',
          'hashes=' + encodeURIComponent(JSON.stringify(hashList)) + '&fields=hash,url'
        ).catch(() => ({ data: [] }));
        const urlByHash = {};
        (adImagesData.data || []).forEach((img) => { urlByHash[img.hash] = img.url; });
        Object.keys(hashByAdId).forEach((adId) => { thumbById[adId] = urlByHash[hashByAdId[adId]] || null; });
      }
      const videoAdIds = Object.keys(videoCreativeByAdId);
      if (videoAdIds.length) {
        const resizedResults = await Promise.all(videoAdIds.map((adId) =>
          fetchMeta(videoCreativeByAdId[adId], 'fields=thumbnail_url&thumbnail_width=1080&thumbnail_height=1080').catch(() => null)
        ));
        resizedResults.forEach((r, i) => { thumbById[videoAdIds[i]] = (r && r.thumbnail_url) || null; });
      }
    }
    const withThumb = (a) => ({ id: a.id, name: a.name, ctr: a.ctr, conversions: a.conversions, reach: a.reach, engagement: a.engagement, thumbnail: thumbById[a.id] || null });
    const creatives = {
      byCtr: topByCtr.map(withThumb), byConv: topByConv.map(withThumb),
      byReach: topByReach.map(withThumb), byEngagement: topByEngagement.map(withThumb),
    };

    let timeline = { labels: [], values: [] };
    if (matched.length) {
      const filtering = encodeURIComponent(JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: matched.map((r) => r.campaign_id) }]));
      const dailyData = await fetchMeta('act_' + adAccount + '/insights', 'level=account&fields=spend,impressions,clicks&time_increment=1&filtering=' + filtering + '&' + tParam + '&limit=500');
      const dailyRows = (dailyData.data || []).slice().sort((a, b) => a.date_start.localeCompare(b.date_start));
      timeline = {
        labels: dailyRows.map((r) => r.date_start.slice(8, 10) + '/' + r.date_start.slice(5, 7)),
        values: dailyRows.map((r) => num(r.spend)),
      };
    }

    res.status(200).json({
      brand: brand,
      adAccountId: adAccount,
      days: days,
      range: (dateFrom && dateTo) ? { startDate: dateFrom, endDate: dateTo } : null,
      kpis: { spend, impressions, clicks, ctr, cpc, conversions, cpa, revenue, roas, reach, engagement },
      timeline: timeline,
      campaigns: campaigns.slice(0, 20),
      matchedCampaignsCount: matched.length,
      creatives: creatives,
      ageGender: ageGender,
      device: device,
      hourly: hourly,
      notes: {
        segmentacao: 'Conta de anúncio compartilhada entre marcas — filtro por nome de campanha (padrões: ' + JSON.stringify(BRAND_PATTERNS[brand]) + '), não por conta separada.',
        conversoesReceita: 'Conversões/Receita somam action_types de conversão conhecidos (purchase, lead, complete_registration) quando presentes nas campanhas encontradas. Nas campanhas de tráfego/engajamento testadas nenhuma tinha esses eventos configurados — ficam 0 até a conta ter um pixel de conversão ativo nelas.',
      },
    });
  } catch (err) {
    console.error('[Meta API]', (err && err.message) || err);
    res.status(500).json({ error: 'Falha ao consultar Meta Ads', detail: (err && err.message) || String(err) });
  }
};

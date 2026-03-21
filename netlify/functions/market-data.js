/**
 * market-data.js — Netlify Function
 * Provides live Australian property market data:
 *   - RBA cash rate (cached 24h)
 *   - ABS Total Value of Dwellings — state median prices (cached 7 days)
 *   - Domain API suburb insights — median price/rent/sales (cached 30 days)
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  (existing)
 *   DOMAIN_CLIENT_ID      — from developer.domain.com.au
 *   DOMAIN_CLIENT_SECRET  — from developer.domain.com.au
 *
 * GET  /.netlify/functions/market-data?action=cashRate
 * GET  /.netlify/functions/market-data?action=statePrices
 * POST /.netlify/functions/market-data   {action:'suburbInsights', suburb:'Bondi Beach', state:'NSW'}
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const DOMAIN_CLIENT_ID     = process.env.DOMAIN_CLIENT_ID     || '';
const DOMAIN_CLIENT_SECRET = process.env.DOMAIN_CLIENT_SECRET || '';

const TTL_CASH_RATE    = 24 * 3600;       // 24 hours
const TTL_STATE_PRICES = 7  * 24 * 3600;  // 7 days
const TTL_SUBURB       = 30 * 24 * 3600;  // 30 days (Domain free tier: 500 calls/day)

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Redis helpers ──────────────────────────────────────────────────────────────

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) return null;
    return (await r.json()).result;
  } catch (e) {
    return null;
  }
}

async function rGet(key) {
  const raw = await redisCmd('GET', key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function rSet(key, val, ttl) {
  const v = typeof val === 'string' ? val : JSON.stringify(val);
  if (ttl) return redisCmd('SET', key, v, 'EX', ttl);
  return redisCmd('SET', key, v);
}

// ── RBA cash rate ──────────────────────────────────────────────────────────────

// Hardcoded fallback — updated Feb 2025 (first RBA cut in 4 years)
// Live API will override this when available.
const FALLBACK_CASH_RATE = { rate: 4.10, date: '2025-02-18', source: 'fallback' };

async function fetchCashRate() {
  // Try RBA Statistics API (multiple endpoint variants)
  const endpoints = [
    'https://api.rba.gov.au/statistics/tables/f4.1/data?seriesId=FIRMMCRT&startPeriod=2024&format=json',
    'https://api.rba.gov.au/statistics/tables/f1.1/data?startPeriod=2024&format=json',
    'https://api.rba.gov.au/statistics/f4/data?format=json',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const json = await res.json();

      // Try to extract rate from SDMX-JSON or RBA custom format
      const rate = parseRBARateResponse(json);
      if (rate !== null) {
        return { rate, date: new Date().toISOString().slice(0, 10), source: 'rba-api' };
      }
    } catch { /* try next */ }
  }

  return null; // all endpoints failed
}

function parseRBARateResponse(json) {
  try {
    // SDMX-JSON format: dataSets[0].series
    if (json.dataSets && json.dataSets[0] && json.dataSets[0].series) {
      const seriesKeys = Object.keys(json.dataSets[0].series);
      for (const key of seriesKeys) {
        const obs = json.dataSets[0].series[key].observations;
        if (!obs) continue;
        const periods = Object.keys(obs).map(Number).sort((a, b) => b - a);
        const latest = obs[periods[0]];
        if (latest && latest[0] != null) return parseFloat(latest[0]);
      }
    }
    // RBA custom flat format
    if (Array.isArray(json.data)) {
      const last = json.data[json.data.length - 1];
      if (last && last.value != null) return parseFloat(last.value);
    }
    if (json.value != null) return parseFloat(json.value);
  } catch { /* ignore */ }
  return null;
}

// ── ABS Total Value of Dwellings — state median prices ────────────────────────

// Fallback state median house prices (AUD) — sourced from ABS TVD Dec Q 2024 / CoreLogic
// These will be overridden by live API data when available.
const FALLBACK_STATE_PRICES = {
  NSW: { median: 1180000, mean: 1290000, date: '2024-12' },
  VIC: { median:  905000, mean:  990000, date: '2024-12' },
  QLD: { median:  840000, mean:  920000, date: '2024-12' },
  SA:  { median:  740000, mean:  810000, date: '2024-12' },
  WA:  { median:  790000, mean:  860000, date: '2024-12' },
  TAS: { median:  580000, mean:  630000, date: '2024-12' },
  ACT: { median:  960000, mean: 1040000, date: '2024-12' },
  NT:  { median:  510000, mean:  560000, date: '2024-12' },
  source: 'fallback',
};

// ABS state code → abbreviation mapping used in the API
const ABS_STATE_CODES = { '1': 'NSW', '2': 'VIC', '3': 'QLD', '4': 'SA', '5': 'WA', '6': 'TAS', '7': 'NT', '8': 'ACT' };

async function fetchStatePrices() {
  // Try ABS Data API for TVD dataset
  const absEndpoints = [
    'https://data.api.abs.gov.au/rest/data/ABS,TVD,1.0.0/all?startPeriod=2024-Q4&format=jsondata',
    'https://data.api.abs.gov.au/rest/data/ABS,TVD/all?startPeriod=2024-Q4&format=jsondata',
  ];

  for (const url of absEndpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const prices = parseABSTVDResponse(json);
      if (prices) return { ...prices, source: 'abs-api' };
    } catch { /* try next */ }
  }

  return null;
}

function parseABSTVDResponse(json) {
  try {
    if (!json.data || !json.data.dataSets || !json.data.structure) return null;
    const ds = json.data.dataSets[0];
    const dims = json.data.structure.dimensions.series;

    // Find the REGION dimension index
    const regionDimIdx = dims.findIndex(d => d.id === 'REGION' || d.id === 'STATE');
    if (regionDimIdx === -1) return null;

    const prices = {};
    for (const [seriesKey, seriesVal] of Object.entries(ds.series || {})) {
      const parts = seriesKey.split(':');
      const regionCode = dims[regionDimIdx] && dims[regionDimIdx].values && dims[regionDimIdx].values[parts[regionDimIdx]];
      if (!regionCode) continue;

      const stateAbbr = ABS_STATE_CODES[regionCode.id || regionCode];
      if (!stateAbbr) continue;

      const obs = seriesVal.observations;
      const latestKey = Object.keys(obs).map(Number).sort((a, b) => b - a)[0];
      const val = obs[latestKey] && obs[latestKey][0];
      if (val != null) prices[stateAbbr] = { median: Math.round(val), date: new Date().toISOString().slice(0, 7) };
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

// ── Domain API — suburb insights ───────────────────────────────────────────────

async function getDomainToken() {
  if (!DOMAIN_CLIENT_ID || !DOMAIN_CLIENT_SECRET) return null;
  try {
    const res = await fetch('https://auth.domain.com.au/v1/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        scope:         'api_addresslocate_readonly api_demographics_readonly api_listings_readonly api_suburbperformance_readonly',
        client_id:     DOMAIN_CLIENT_ID,
        client_secret: DOMAIN_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.access_token || null;
  } catch {
    return null;
  }
}

async function fetchSuburbInsights(suburb, state) {
  const token = await getDomainToken();
  if (!token) return null;

  // Try Domain API v2 suburb performance statistics
  // bedrooms=4 for houses (most representative)
  const slugSuburb = encodeURIComponent(suburb.toLowerCase().replace(/\s+/g, '-'));
  const slugState  = state.toLowerCase();

  const endpoints = [
    // v2 performance stats — all house types, last 1 year
    `https://api.domain.com.au/v2/suburbPerformanceStatistics/${slugState}/${slugSuburb}?bedrooms=4&propertyCategory=house&periodSize=years&startingPeriodRelativeToCurrent=1&totalPeriods=1`,
    `https://api.domain.com.au/v2/suburbPerformanceStatistics/${slugState}/${slugSuburb}?propertyCategory=house&periodSize=years&startingPeriodRelativeToCurrent=1&totalPeriods=1`,
    // v1 suburb insights fallback
    `https://api.domain.com.au/v1/suburbInsights/${encodeURIComponent(suburb)},${state}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const data = parseDomainResponse(json, suburb, state);
      if (data) return data;
    } catch { /* try next */ }
  }

  return null;
}

function parseDomainResponse(json, suburb, state) {
  try {
    // v2 suburbPerformanceStatistics format
    if (json.header && json.series && json.series.seriesInfo) {
      const info = json.series.seriesInfo[json.series.seriesInfo.length - 1];
      if (!info) return null;
      const medianSale = info.medianSalePrice || info.median;
      const count      = info.numberSold       || info.sold || 0;
      const medianRent = info.medianRent        || null;  // $/week
      const growth     = info.annualGrowth      || null;  // %
      if (!medianSale) return null;
      return {
        suburb, state,
        medianSalePrice: Math.round(medianSale),
        numberSold:      count,
        medianWeeklyRent: medianRent ? Math.round(medianRent) : null,
        annualGrowth:    growth     ? parseFloat(growth.toFixed(1)) : null,
        propertyType:    'house',
        periodLabel:     info.year ? `${info.year}` : 'last 12 months',
        source:          'domain-api',
      };
    }

    // v1 suburbInsights format
    if (json.medianSalePrice || json.medianPrice) {
      return {
        suburb, state,
        medianSalePrice:  Math.round(json.medianSalePrice || json.medianPrice || 0),
        numberSold:       json.numberSold || json.saleCount || 0,
        medianWeeklyRent: json.medianRent || null,
        annualGrowth:     json.annualGrowth || null,
        propertyType:     'house',
        periodLabel:      'last 12 months',
        source:           'domain-api-v1',
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ── Response helpers ──────────────────────────────────────────────────────────

const ok   = (body) => ({ statusCode: 200, headers: H, body: JSON.stringify(body) });
const fail = (msg, s = 400) => ({ statusCode: s, headers: H, body: JSON.stringify({ ok: false, error: msg }) });

// ── IP-based rate limit helper ────────────────────────────────────────────────

async function checkRateLimit(ip) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  const key = 'rl:mkt:' + ip;
  try {
    const count = await redisCmd('INCR', key);
    if (count === 1) await redisCmd('EXPIRE', key, '60');
    return count > 30; // 30 req/min per IP (suburbInsights only — cached hits are cheap)
  } catch { return false; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  // Parse action from GET query or POST body
  let action = event.queryStringParameters && event.queryStringParameters.action;
  let suburb, state;

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { }
    action  = action || body.action;
    suburb  = body.suburb;
    state   = body.state;
  }

  // ── GET cash rate ────────────────────────────────────────────────────────────
  if (action === 'cashRate') {
    const cacheKey = 'market:cashRate';
    const cached = await rGet(cacheKey);
    if (cached) return ok({ ok: true, ...cached, cached: true });

    const live = await fetchCashRate();
    const result = live || FALLBACK_CASH_RATE;
    if (live) await rSet(cacheKey, result, TTL_CASH_RATE);

    return ok({ ok: true, ...result, cached: false });
  }

  // ── GET state median prices ──────────────────────────────────────────────────
  if (action === 'statePrices') {
    const cacheKey = 'market:statePrices';
    const cached = await rGet(cacheKey);
    if (cached) return ok({ ok: true, prices: cached, cached: true });

    const live = await fetchStatePrices();
    const prices = live || FALLBACK_STATE_PRICES;
    if (live) await rSet(cacheKey, prices, TTL_STATE_PRICES);

    return ok({ ok: true, prices, cached: false, source: live ? 'abs-api' : 'fallback' });
  }

  // ── POST suburb insights ─────────────────────────────────────────────────────
  if (action === 'suburbInsights') {
    const clientIp = (event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    if (await checkRateLimit(clientIp)) return fail('Too many requests', 429);
    if (!suburb || !state) return fail('suburb and state required');
    const AU_STATES = ['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'];
    if (!AU_STATES.includes(String(state).toUpperCase())) return fail('Invalid state');
    if (String(suburb).length > 100) return fail('suburb too long');

    const cacheKey = `market:suburb:${suburb.toLowerCase().replace(/\s+/g, '_')}:${state.toUpperCase()}`;
    const cached = await rGet(cacheKey);
    if (cached) return ok({ ok: true, ...cached, cached: true });

    const live = await fetchSuburbInsights(suburb, state);
    if (!live) {
      return ok({ ok: true, found: false, suburb, state, cached: false,
        note: DOMAIN_CLIENT_ID ? 'No data returned from Domain API' : 'Domain API credentials not configured' });
    }

    await rSet(cacheKey, live, TTL_SUBURB);
    return ok({ ok: true, found: true, ...live, cached: false });
  }

  return fail('Unknown action. Valid: cashRate, statePrices, suburbInsights');
};

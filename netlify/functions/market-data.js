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
 *      (retired Nov 2026: answers 410)
 *
 * Limits (Nov 2026):
 *   - The caller chooses one of the fixed actions above and nothing else. No
 *     part of an upstream address comes from the request.
 *   - Requests are limited per IP (per /64 for IPv6). See "Per-IP rate limit"
 *     for what happens when Redis is down.
 *   - Requests sent by pages on other sites are refused. See "Origin".
 *   - Each running instance remembers its last answer for a few minutes (see
 *     "Per-instance memo"), so the RBA and the ABS are not asked again on every
 *     page view, with or without Redis.
 */

const log = require('./_log');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const DOMAIN_CLIENT_ID     = process.env.DOMAIN_CLIENT_ID     || '';
const DOMAIN_CLIENT_SECRET = process.env.DOMAIN_CLIENT_SECRET || '';

const TTL_CASH_RATE    = 24 * 3600;       // 24 hours
const TTL_STATE_PRICES = 7  * 24 * 3600;  // 7 days
const TTL_SUBURB       = 30 * 24 * 3600;  // 30 days (Domain free tier: 500 calls/day)
const TTL_SUBURB_MISS  = 7  * 24 * 3600;  // 7 days — negative cache: Domain has no data for
                                          // most of our ~14.6k suburbs, and every miss runs a
                                          // full OAuth + multi-endpoint Domain lookup. Caching
                                          // the "no data" verdict turns a re-crawl of an empty
                                          // suburb into a cheap Redis read instead. Shorter than
                                          // TTL_SUBURB so newly-available data / creds recover.

// ── Origin ────────────────────────────────────────────────────────────────────
// The only caller is market-rate.js on this site (and the service worker
// re-fetching for it), which uses a relative URL, so the browser sends a
// same-origin request with no Origin header. A page on another site can make
// its visitors' browsers send either a CORS request, which carries that site's
// Origin, or a no-cors one, which carries Sec-Fetch-Site: cross-site. Both are
// refused before they are counted or sent upstream. (Until Nov 2026 this
// answered every origin with Access-Control-Allow-Origin: *.) The allowlist is
// the one the other functions use (see auth.js), plus the request's own host.
const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());
// Only this site's own Netlify deploy and preview hosts, never any *.netlify.app.
const OWN_NETLIFY_ORIGIN = /^https:\/\/([a-z0-9]+(-[a-z0-9]+)*--)?equitysight\.netlify\.app$/;

function requestOrigin(event) {
  return String((event.headers && (event.headers.origin || event.headers.Origin)) || '');
}

function allowedOrigin(o, event) {
  if (!o) return false;
  if (ALLOWED_ORIGINS.includes(o) || OWN_NETLIFY_ORIGIN.test(o)) return true;
  const host = String((event.headers && (event.headers.host || event.headers.Host)) || '').toLowerCase();
  return !!host && o.toLowerCase() === 'https://' + host;
}

// True when the request was sent by a page on another site.
function fromOtherSite(event) {
  const o = requestOrigin(event);
  if (o) return !allowedOrigin(o, event);
  const h = event.headers || {};
  return String(h['sec-fetch-site'] || h['Sec-Fetch-Site'] || '').toLowerCase() === 'cross-site';
}

function headersFor(event) {
  const o = requestOrigin(event);
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin(o, event) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// ── Redis helpers ──────────────────────────────────────────────────────────────
// redisCmd returns the command's result, or null when Redis is not configured,
// answers with an error, or takes longer than REDIS_TIMEOUT_MS. After a failure
// Redis is skipped for REDIS_RETRY_MS, so an outage costs one slow request per
// running instance rather than one per page view.
const REDIS_TIMEOUT_MS = 3000;
const REDIS_RETRY_MS   = 30000;
let _redisDownUntil = 0;

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  if (Date.now() < _redisDownUntil) return null;
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error('Redis HTTP ' + r.status);
    return (await r.json()).result;
  } catch (e) {
    _redisDownUntil = Date.now() + REDIS_RETRY_MS;
    log.warn('market-data.redis_unavailable', { err: e && e.message });
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

// Hardcoded last resort, served only when the RBA API and Redis cache both fail.
// Clients (market-rate.js) suppress source==='fallback' so this stale figure is
// never rendered as live market context — it exists so the API shape stays stable.
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

// ── Per-instance memo ─────────────────────────────────────────────────────────
// These figures change rarely (the Redis copies above are kept for 24 hours and
// 7 days), so each running instance keeps its last answer in memory for ten
// minutes and serves it without reading Redis or calling an upstream API.
//
// When the upstream API gave no answer, the hardcoded fallback is remembered
// for one minute. Without that, every request would retry the RBA or the ABS
// for as long as they are failing, and with Redis down every request would
// call them even when they are working.
const MEMO_LIVE_MS     = 10 * 60 * 1000;
const MEMO_FALLBACK_MS = 60 * 1000;
const _memo = new Map();   // action → { body, until }

function memoGet(name) {
  const m = _memo.get(name);
  return m && m.until > Date.now() ? m.body : null;
}
function memoSet(name, body, ms) {
  _memo.set(name, { body, until: Date.now() + ms });
}

// ── Per-IP rate limit ─────────────────────────────────────────────────────────
// Sized for the pages that call this: three calculators load the cash rate once
// per page view (market-rate.js; the service worker answers from its own cache
// and still re-fetches in the background). 30 a minute from one address is well
// past a person clicking between them.
//
// The shared count lives in Redis (INCR, then EXPIRE on the first hit: the same
// pattern as rRateInc in auth.js). The key carries the window number, so a lost
// EXPIRE can never leave an address blocked past the end of its window.
//
// Every request is also counted in this instance's memory. That count does two
// jobs:
//   1. An address already over the limit inside this one instance is refused
//      without spending a Redis command on it.
//   2. If Redis is not configured or does not answer, the memory count decides,
//      against a smaller limit because every running instance keeps its own
//      count. A Redis outage therefore neither blocks every visitor nor leaves
//      the upstream APIs open to unlimited use.
const RL_WINDOW_SECS  = 60;
const RL_MAX          = 30;   // per IP per minute, counted in Redis
const RL_MAX_NO_REDIS = 10;   // per IP per minute, per instance, when Redis is down
const RL_MEM_MAX_KEYS = 5000;
const _rlMem = new Map();     // ip → { bucket, n }

// The key a request is counted under. An IPv4 address is used whole. An IPv6
// address is cut to its first four groups (its /64), because a home connection
// or a cloud server is normally given a whole /64 and can send from any address
// in it: counted one address at a time, one caller could skip the limit by
// changing address. An IPv4 address written as IPv6 (::ffff:1.2.3.4) counts as
// that IPv4 address. Anything that does not parse as an address counts as
// 'unknown'. The same code is in mapproxy.js and address-suggest.js.
function ipv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every(n => n <= 255) ? p.join('.') : null;
}

function clientIp(event) {
  const raw = String((event.headers && event.headers['x-nf-client-connection-ip']) || '').split(',')[0].trim().toLowerCase();
  if (raw.length > 64) return 'unknown';
  const v4 = ipv4(raw);
  if (v4) return v4;
  // IPv6. Drop a zone (%eth0) and write a dotted last 32 bits as two groups.
  let s = raw.replace(/%[0-9a-z._-]*$/, '');
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (dotted) {
    const v = ipv4(dotted[2]);
    if (!v) return 'unknown';
    const p = v.split('.').map(Number);
    s = dotted[1] + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return 'unknown';
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const gap  = 8 - head.length - tail.length;
  if (halves.length === 2 ? gap < 1 : gap !== 0) return 'unknown';
  const groups = head.concat(new Array(halves.length === 2 ? gap : 0).fill('0'), tail);
  if (!groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return 'unknown';
  const n = groups.map(g => parseInt(g, 16));
  if (n.slice(0, 5).every(x => x === 0) && n[5] === 0xffff) {
    return [n[6] >> 8, n[6] & 255, n[7] >> 8, n[7] & 255].join('.');
  }
  return n.slice(0, 4).map(x => x.toString(16)).join(':') + '::/64';
}

function memCount(ip, bucket) {
  let e = _rlMem.get(ip);
  if (!e || e.bucket !== bucket) {
    if (_rlMem.size >= RL_MEM_MAX_KEYS) {
      for (const [k, v] of _rlMem) if (v.bucket !== bucket) _rlMem.delete(k);
      if (_rlMem.size >= RL_MEM_MAX_KEYS) _rlMem.clear();
    }
    e = { bucket, n: 0 };
    _rlMem.set(ip, e);
  }
  return ++e.n;
}

// Resolves to 0 when the request may go ahead, or to the number of seconds
// until the window ends when it is over the limit.
async function rateLimited(ip) {
  const now = Date.now();
  const bucket = Math.floor(now / (RL_WINDOW_SECS * 1000));
  const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * RL_WINDOW_SECS * 1000 - now) / 1000));
  const local = memCount(ip, bucket);
  if (local > RL_MAX) return retryAfter;
  const key = 'ratelimit:market-data:' + ip + ':' + bucket;
  const count = parseInt(await redisCmd('INCR', key), 10);
  if (!Number.isFinite(count)) return local > RL_MAX_NO_REDIS ? retryAfter : 0;   // Redis is down
  if (count === 1) await redisCmd('EXPIRE', key, String(RL_WINDOW_SECS));
  return count > RL_MAX ? retryAfter : 0;
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const H = headersFor(event);
  const ok   = (body) => ({ statusCode: 200, headers: H, body: JSON.stringify(body) });
  const fail = (msg, s = 400, extra) => ({
    statusCode: s,
    headers: extra ? Object.assign({}, H, extra) : H,
    body: JSON.stringify({ ok: false, error: msg }),
  });
  const tooMany = (retryAfter) => fail('Too many requests', 429, { 'Retry-After': String(retryAfter) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return fail('Method not allowed', 405, { Allow: 'GET, POST, OPTIONS' });
  }
  if (fromOtherSite(event)) return fail('Forbidden', 403);

  // Parse action from GET query or POST body
  let action = event.queryStringParameters && event.queryStringParameters.action;
  let suburb, state;

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { }
    if (!isObj(body)) body = {};
    action  = action || body.action;
    suburb  = body.suburb;
    state   = body.state;
  }

  // ── GET cash rate ────────────────────────────────────────────────────────────
  if (action === 'cashRate') {
    const retryAfter = await rateLimited(clientIp(event));
    if (retryAfter) return tooMany(retryAfter);

    const remembered = memoGet('cashRate');
    if (remembered) return ok(remembered);

    const cacheKey = 'market:cashRate';
    const cached = await rGet(cacheKey);
    if (isObj(cached)) {
      const body = { ok: true, ...cached, cached: true };
      memoSet('cashRate', body, MEMO_LIVE_MS);
      return ok(body);
    }

    const live = await fetchCashRate();
    const result = live || FALLBACK_CASH_RATE;
    if (live) await rSet(cacheKey, result, TTL_CASH_RATE);
    memoSet('cashRate', { ok: true, ...result, cached: true }, live ? MEMO_LIVE_MS : MEMO_FALLBACK_MS);

    return ok({ ok: true, ...result, cached: false });
  }

  // ── GET state median prices ──────────────────────────────────────────────────
  if (action === 'statePrices') {
    const retryAfter = await rateLimited(clientIp(event));
    if (retryAfter) return tooMany(retryAfter);

    const remembered = memoGet('statePrices');
    if (remembered) return ok(remembered);

    const cacheKey = 'market:statePrices';
    const cached = await rGet(cacheKey);
    if (isObj(cached)) {
      const body = { ok: true, prices: cached, cached: true };
      memoSet('statePrices', body, MEMO_LIVE_MS);
      return ok(body);
    }

    const live = await fetchStatePrices();
    const prices = live || FALLBACK_STATE_PRICES;
    if (live) await rSet(cacheKey, prices, TTL_STATE_PRICES);
    const source = live ? 'abs-api' : 'fallback';
    memoSet('statePrices', { ok: true, prices, cached: true, source }, live ? MEMO_LIVE_MS : MEMO_FALLBACK_MS);

    return ok({ ok: true, prices, cached: false, source });
  }

  // ── POST suburb insights ─────────────────────────────────────────────────────
  if (action === 'suburbInsights') {
    // Retired Nov 2026: suburb pages no longer show third-party listing data,
    // so nothing calls this. It stays closed so an anonymous caller cannot
    // spend Domain API quota.
    return fail('This endpoint has been retired', 410);
    // Unreachable. If this is ever reopened it must sit behind rateLimited(),
    // as the two actions above do.
    if (!suburb || !state) return fail('suburb and state required');
    const AU_STATES = ['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'];
    if (!AU_STATES.includes(String(state).toUpperCase())) return fail('Invalid state');
    if (String(suburb).length > 100) return fail('suburb too long');

    const cacheKey = `market:suburb:${suburb.toLowerCase().replace(/\s+/g, '_')}:${state.toUpperCase()}`;
    // Cache stores the full verdict (found:true|false), so both hits and misses are
    // served straight from Redis without touching the Domain API.
    const cached = await rGet(cacheKey);
    if (cached) return ok({ ok: true, ...cached, cached: true });

    const live = await fetchSuburbInsights(suburb, state);

    if (!live) {
      // Negative cache the "no data" result so repeat hits (esp. crawlers walking
      // every suburb) don't re-run the OAuth + multi-endpoint Domain lookup each time.
      const miss = { found: false, suburb, state,
        note: DOMAIN_CLIENT_ID ? 'No data returned from Domain API' : 'Domain API credentials not configured' };
      await rSet(cacheKey, miss, TTL_SUBURB_MISS);
      return ok({ ok: true, ...miss, cached: false });
    }

    const hit = { found: true, ...live };
    await rSet(cacheKey, hit, TTL_SUBURB);
    return ok({ ok: true, ...hit, cached: false });
  }

  return fail('Unknown action. Valid: cashRate, statePrices, suburbInsights');
};

/**
 * address-suggest.js — Netlify Function
 * Australian property address autocomplete + geocoding.
 *
 * Primary:  Domain Address Suggestions API (higher AU accuracy)
 * Fallback: Nominatim / OpenStreetMap (free, no credentials)
 *
 * Required env vars (optional — falls back gracefully without them):
 *   DOMAIN_CLIENT_ID, DOMAIN_CLIENT_SECRET
 *
 * GET /.netlify/functions/address-suggest?q={query}&limit=6
 *   → { ok:true, results:[{address,suburb,state,postcode,lat?,lon?}], source }
 *
 * GET /.netlify/functions/address-suggest?q={query}&mode=geocode
 *   → { ok:true, lat, lon, source }   (first result only, for map lookup)
 *
 * What a caller can and cannot control (Nov 2026):
 *   - Both upstream hosts are fixed. The caller supplies only the search text
 *     (3 to 200 characters, control characters removed, always URL-encoded into
 *     one query parameter) and a result count (1 to 10). There is no way to
 *     point the proxy at another address.
 *   - Upstream answers are read with a size cap, and every field passed back is
 *     a length-capped string or a checked number.
 *   - Requests are limited per IP. See "Per-IP rate limit" below for what
 *     happens when Redis is down.
 */

const log = require('./_log');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const DOMAIN_CLIENT_ID     = process.env.DOMAIN_CLIENT_ID     || '';
const DOMAIN_CLIENT_SECRET = process.env.DOMAIN_CLIENT_SECRET || '';

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Redis helpers (token cache + rate limit) ─────────────────────────────────
// redisCmd returns the command's result, or null when Redis is not configured,
// answers with an error, or takes longer than REDIS_TIMEOUT_MS. After a failure
// Redis is skipped for REDIS_RETRY_MS, so an outage costs one slow request per
// running instance rather than one per keystroke.
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
    log.warn('address-suggest.redis_unavailable', { err: e && e.message });
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
  return ttl ? redisCmd('SET', key, v, 'EX', ttl) : redisCmd('SET', key, v);
}

// ── Upstream answers ──────────────────────────────────────────────────────────

// Ten address records are a few kilobytes. Anything past this is not an answer
// to the question that was asked, so it is dropped rather than parsed.
const MAX_UPSTREAM_BYTES = 512 * 1024;

// Reads a response body up to `max` bytes and parses it as JSON. Returns null
// when the body is larger than the cap or is not JSON.
async function readJsonCapped(res, max) {
  const declared = parseInt(res.headers && res.headers.get && res.headers.get('content-length'), 10);
  if (declared > max) {
    try { if (res.body && res.body.cancel) await res.body.cancel(); } catch { /* nothing to clean up */ }
    return null;
  }
  let buf;
  if (!res.body || typeof res.body.getReader !== 'function') {
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) return null;
  } else {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        try { await reader.cancel(); } catch { /* nothing to clean up */ }
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    buf = Buffer.concat(chunks, total);
  }
  try { return JSON.parse(buf.toString('utf8')); } catch { return null; }
}

// A string field from an upstream record: text only, no control characters,
// capped. A number is turned into text, in case a street number or postcode
// arrives as one.
function field(v, max) {
  const s = typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

// A latitude or longitude, or null.
function coordOrNull(v, limit) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : NaN);
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= limit ? n : null;
}

// ── Domain OAuth2 token (cached in Redis for 55 min) ────────────────────────

// The token is also kept in this instance's memory. If Redis is down, each
// lookup would otherwise ask Domain for a new token first.
let _memToken = null; // { token, until }

async function getDomainToken() {
  if (!DOMAIN_CLIENT_ID || !DOMAIN_CLIENT_SECRET) return null;

  if (_memToken && _memToken.until > Date.now()) return _memToken.token;

  // Check Redis cache first
  const cached = await rGet('domain:access_token');
  if (typeof cached === 'string' && cached) return cached;

  try {
    const res = await fetch('https://auth.domain.com.au/v1/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        scope:         'api_addresslocate_readonly',
        client_id:     DOMAIN_CLIENT_ID,
        client_secret: DOMAIN_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await readJsonCapped(res, MAX_UPSTREAM_BYTES);
    if (!json || typeof json.access_token !== 'string' || !json.access_token) return null;

    // Cache for 55 minutes (tokens expire at 60 min)
    _memToken = { token: json.access_token, until: Date.now() + 55 * 60 * 1000 };
    await rSet('domain:access_token', json.access_token, 55 * 60);
    return json.access_token;
  } catch { return null; }
}

// ── Domain Address Suggestions API ───────────────────────────────────────────

async function domainSuggest(query, limit) {
  const token = await getDomainToken();
  if (!token) return null;

  try {
    const url = 'https://api.domain.com.au/v1/addressLocate?terms='
      + encodeURIComponent(query) + '&channel=all';
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await readJsonCapped(res, MAX_UPSTREAM_BYTES);
    if (!Array.isArray(json) || !json.length) return null;

    const STATE_CODES = ['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'];
    const STATE_NAMES = {
      'new south wales':'NSW','victoria':'VIC','queensland':'QLD',
      'south australia':'SA','western australia':'WA','tasmania':'TAS',
      'northern territory':'NT','australian capital territory':'ACT',
    };

    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

    const results = json.filter(isObj).slice(0, limit).map(item => {
      const a   = isObj(item.address) ? item.address : {};
      const raw = field(a.state, 40);
      // A state the app does not know is left blank (it used to be passed
      // through as whatever text Domain sent).
      const state = STATE_CODES.includes(raw.toUpperCase())
        ? raw.toUpperCase()
        : (STATE_NAMES[raw.toLowerCase().replace(/^state of /, '')] || '');

      const streetParts = [field(a.streetNumber, 20), field(a.street, 120)].filter(Boolean);
      const unit        = field(a.unitNumber, 20);
      const unitParts   = unit ? ['Unit ' + unit] : [];
      const address     = [...unitParts, ...streetParts].join(' ') || field(item.displayAddress, 200);

      const coord = isObj(item.coordinate) ? item.coordinate : (isObj(item.geoLocation) ? item.geoLocation : {});
      return {
        address,
        suburb:   field(a.suburb, 80),
        state,
        postcode: field(a.postcode, 10),
        lat: coordOrNull(coord.lat != null ? coord.lat : coord.latitude, 90),
        lon: coordOrNull(coord.lon != null ? coord.lon : coord.longitude, 180),
      };
    }).filter(r => r.address);

    return results.length ? results : null;
  } catch { return null; }
}

// ── Nominatim fallback ────────────────────────────────────────────────────────

async function nominatimSuggest(query, limit) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1'
      + '&countrycodes=au&limit=' + limit + '&q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'EquitySight/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await readJsonCapped(res, MAX_UPSTREAM_BYTES);
    if (!Array.isArray(json) || !json.length) return null;

    const STATE_CODES = ['QLD','NSW','VIC','WA','SA','TAS','NT','ACT'];
    const STATE_NAMES = {
      'queensland':'QLD','new south wales':'NSW','victoria':'VIC',
      'western australia':'WA','south australia':'SA','tasmania':'TAS',
      'northern territory':'NT','australian capital territory':'ACT',
    };

    // Schema-validate each item before mapping — Nominatim occasionally returns
    // partial records or non-object entries. Drop anything that doesn't look
    // like a place.
    const isValidItem = (x) => x && typeof x === 'object'
      && (typeof x.display_name === 'string' || typeof x.address === 'object');
    const safeStr = (v) => typeof v === 'string' ? v : '';

    const results = json.filter(isValidItem).slice(0, limit).map(item => {
      const a        = (item.address && typeof item.address === 'object') ? item.address : {};
      const road     = safeStr(a.road) || safeStr(a.pedestrian) || safeStr(a.path);
      const houseNo  = safeStr(a.house_number);
      const address  = houseNo ? houseNo + ' ' + road : road;
      const rawState = safeStr(a.state_code || a.state).trim();
      const state    = STATE_CODES.includes(rawState.toUpperCase())
        ? rawState.toUpperCase()
        : (STATE_NAMES[rawState.toLowerCase().replace(/^state of /, '')] || '');
      const suburb   = safeStr(a.suburb) || safeStr(a.neighbourhood) || safeStr(a.city_district)
                     || safeStr(a.town)  || safeStr(a.village) || safeStr(a.hamlet);
      const display  = address || safeStr(item.display_name).split(',')[0];
      return {
        address:  field(display, 200),
        suburb:   field(suburb, 80),
        state,
        postcode: field(a.postcode, 10),
        lat: coordOrNull(item.lat, 90),
        lon: coordOrNull(item.lon, 180),
      };
    }).filter(r => r.address);

    return results.length ? results : null;
  } catch { return null; }
}

// ── Per-IP rate limit ─────────────────────────────────────────────────────────
// Sized for the one page that calls this: the address box on /app. It sends a
// lookup each time the typing pauses for 200 ms, so one address is roughly 25
// lookups in ten seconds, plus one more for the map button. 60 a minute covers
// two addresses typed back to back. (It was 120 a minute, and unlimited when
// Redis was down.)
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
//      the proxy open to unlimited use. 30 a minute still covers one address.
const RL_WINDOW_SECS  = 60;
const RL_MAX          = 60;   // per IP per minute, counted in Redis
const RL_MAX_NO_REDIS = 30;   // per IP per minute, per instance, when Redis is down
const RL_MEM_MAX_KEYS = 5000;
const _rlMem = new Map();     // ip → { bucket, n }

function clientIp(event) {
  const raw = String((event.headers && event.headers['x-nf-client-connection-ip']) || '').split(',')[0].trim();
  // The value goes into a Redis key, so accept only what an IPv4 or IPv6 address can contain.
  return /^[0-9a-fA-F:.]{2,45}$/.test(raw) ? raw.toLowerCase() : 'unknown';
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
  const key = 'ratelimit:address-suggest:' + ip + ':' + bucket;
  const count = parseInt(await redisCmd('INCR', key), 10);
  if (!Number.isFinite(count)) return local > RL_MAX_NO_REDIS ? retryAfter : 0;   // Redis is down
  if (count === 1) await redisCmd('EXPIRE', key, String(RL_WINDOW_SECS));
  return count > RL_MAX ? retryAfter : 0;
}

// ── Handler ───────────────────────────────────────────────────────────────────

const json = (statusCode, body, extra) => ({
  statusCode,
  headers: extra ? Object.assign({}, H, extra) : H,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' }, { Allow: 'GET, OPTIONS' });

  // Check the parameters first: a request that is answered here costs nothing
  // upstream, so it is not counted against the limit.
  const qs    = event.queryStringParameters || {};
  const query = (typeof qs.q === 'string' ? qs.q : '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const mode  = qs.mode === 'geocode' ? 'geocode' : 'suggest';
  const limit = Math.min(10, Math.max(1, parseInt(qs.limit, 10) || 6));

  // Too short, too long, or nothing a geocoder could match (no letter or digit).
  if (query.length < 3 || query.length > 200 || !/[\p{L}\p{N}]/u.test(query)) {
    return json(200, { ok: true, results: [] });
  }

  const retryAfter = await rateLimited(clientIp(event));
  if (retryAfter) return json(429, { ok: false, error: 'Too many requests' }, { 'Retry-After': String(retryAfter) });

  // Try Domain first, then fall back to Nominatim
  let results = await domainSuggest(query, limit);
  let source  = 'domain';

  if (!results) {
    results = await nominatimSuggest(query, limit);
    source  = 'nominatim';
  }

  if (!results || !results.length) {
    return json(200, { ok: true, results: [], source: 'none' });
  }

  if (mode === 'geocode') {
    // Return just the first result's coordinates for map lookup
    const first = results[0];
    if (!first.lat || !first.lon) {
      return json(200, { ok: false, error: 'No coordinates found', source });
    }
    return json(200, { ok: true, lat: first.lat, lon: first.lon, address: first.address, source });
  }

  return json(200, { ok: true, results, source });
};

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
 *   - Requests are limited per IP (per /64 for IPv6). See "Per-IP rate limit"
 *     below for what happens when Redis is down.
 *   - Requests sent by pages on other sites are refused. See "Origin" below.
 */

const log = require('./_log');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const DOMAIN_CLIENT_ID     = process.env.DOMAIN_CLIENT_ID     || '';
const DOMAIN_CLIENT_SECRET = process.env.DOMAIN_CLIENT_SECRET || '';

// ── Origin ────────────────────────────────────────────────────────────────────
// The only caller is /app on this site, which uses a relative URL, so the
// browser sends a same-origin request with no Origin header. A page on another
// site can make its visitors' browsers send either a CORS request, which carries
// that site's Origin, or a no-cors one, which carries Sec-Fetch-Site:
// cross-site. Both are refused before they are counted or sent upstream, so
// another site cannot use this as its own address autocomplete. (Until Nov 2026
// this answered every origin with Access-Control-Allow-Origin: *.) The allowlist
// is the one the other functions use (see auth.js), plus the request's own host.
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
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

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

// The key a request is counted under. An IPv4 address is used whole. An IPv6
// address is cut to its first four groups (its /64), because a home connection
// or a cloud server is normally given a whole /64 and can send from any address
// in it: counted one address at a time, one caller could skip the limit by
// changing address. An IPv4 address written as IPv6 (::ffff:1.2.3.4) counts as
// that IPv4 address. Anything that does not parse as an address counts as
// 'unknown'. The same code is in mapproxy.js and market-data.js.
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
  const key = 'ratelimit:address-suggest:' + ip + ':' + bucket;
  const count = parseInt(await redisCmd('INCR', key), 10);
  if (!Number.isFinite(count)) return local > RL_MAX_NO_REDIS ? retryAfter : 0;   // Redis is down
  if (count === 1) await redisCmd('EXPIRE', key, String(RL_WINDOW_SECS));
  return count > RL_MAX ? retryAfter : 0;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const H = headersFor(event);
  const json = (statusCode, body, extra) => ({
    statusCode,
    headers: extra ? Object.assign({}, H, extra) : H,
    body: JSON.stringify(body),
  });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' }, { Allow: 'GET, OPTIONS' });
  if (fromOtherSite(event)) return json(403, { ok: false, error: 'Forbidden' });

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

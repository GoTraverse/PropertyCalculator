/**
 * mapproxy.js — Netlify Function
 * Server-side proxy: fetches OSM tiles and returns them for client-side stitching.
 * Uses the main tile.openstreetmap.org servers which are far more reliable than staticmap.openstreetmap.de
 *
 * GET /.netlify/functions/mapproxy?lat={lat}&lon={lon}&zoom={12-18}
 *   → { ok:true, tiles:[9 PNG data URLs or null], cols:3, rows:3, tileSize:256 }
 *
 * What a caller can and cannot control (Nov 2026):
 *   - The upstream host is fixed (a/b/c.tile.openstreetmap.org). The caller only
 *     supplies lat, lon and zoom, and each is parsed to a number and checked
 *     before it is used, so the path is always /{zoom}/{x}/{y}.png with three
 *     integers. There is no way to point the proxy at another address.
 *   - lat/lon must fall inside a box around Australia (the only caller is the
 *     /app map button, which geocodes Australian addresses), so this cannot be
 *     used as a general world-map tile proxy.
 *   - Each tile is read with a size cap and must start with the PNG signature.
 *   - Requests are limited per IP. See "Per-IP rate limit" below for what
 *     happens when Redis is down.
 */

const log = require('./_log');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g, '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();

// ── Redis ─────────────────────────────────────────────────────────────────────
// Returns the command's result, or null when Redis is not configured, answers
// with an error, or takes longer than REDIS_TIMEOUT_MS. After a failure Redis is
// skipped for REDIS_RETRY_MS, so an outage costs one slow request per running
// instance rather than one per visitor.
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
    log.warn('mapproxy.redis_unavailable', { err: e && e.message });
    return null;
  }
}

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
};

const json = (statusCode, body, extra) => ({
  statusCode,
  headers: extra ? Object.assign({}, H, extra) : H,
  body: JSON.stringify(body),
});

// ── Per-IP rate limit ─────────────────────────────────────────────────────────
// One request here is nine tile downloads from OpenStreetMap, whose tile servers
// are run on donations, so the limit is sized for the one page that calls this:
// the "Get Map Image from Address" button on /app, pressed about once per
// property. 30 an hour is three times a busy session.
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
//      the proxy open to unlimited use.
const RL_WINDOW_SECS  = 3600;
const RL_MAX          = 30;   // per IP per hour, counted in Redis
const RL_MAX_NO_REDIS = 10;   // per IP per hour, per instance, when Redis is down
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
  const key = 'ratelimit:mapproxy:' + ip + ':' + bucket;
  const count = parseInt(await redisCmd('INCR', key), 10);
  if (!Number.isFinite(count)) return local > RL_MAX_NO_REDIS ? retryAfter : 0;   // Redis is down
  if (count === 1) await redisCmd('EXPIRE', key, String(RL_WINDOW_SECS));
  return count > RL_MAX ? retryAfter : 0;
}

// ── Parameters ────────────────────────────────────────────────────────────────

// A plain decimal number, or null. parseFloat would accept "12abc" and
// "Infinity", and both end up as NaN in the tile path.
function decimal(v) {
  if (typeof v !== 'string' || v.length > 24 || !/^-?\d{1,3}(\.\d{1,20})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Mainland Australia, Tasmania, the Torres Strait islands and Lord Howe Island.
const AU_BOX = { latMin: -45, latMax: -9, lonMin: 112, lonMax: 160 };

function latLonToTile(lat, lon, zoom){
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// ── Upstream ──────────────────────────────────────────────────────────────────

// A standard 256px OSM tile is usually under 60 KB. Nine tiles at this cap are
// about 3.1 MB once base64-encoded, which stays under the 6 MB function
// response limit.
const MAX_TILE_BYTES = 256 * 1024;
const PNG_SIGNATURE  = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// Reads a response body up to `max` bytes. Returns a Buffer, or null when the
// body is larger (the download is dropped, never cut short and passed on).
async function readCapped(res, max) {
  const declared = parseInt(res.headers && res.headers.get && res.headers.get('content-length'), 10);
  if (declared > max) {
    try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (e) { /* nothing to clean up */ }
    return null;
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const whole = Buffer.from(await res.arrayBuffer());
    return whole.length > max ? null : whole;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      try { await reader.cancel(); } catch (e) { /* nothing to clean up */ }
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function fetchTile(sub, zoom, x, y) {
  // sub is 'a', 'b' or 'c' and zoom/x/y are integers computed above.
  const url = `https://${sub}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'EquitySight/1.0 (https://equitysight.app)',
        'Accept': 'image/png',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const buf = await readCapped(r, MAX_TILE_BYTES);
    if (!buf || buf.length < PNG_SIGNATURE.length || !buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (e) {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if(event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' }, { Allow: 'GET, OPTIONS' });

  // Check the parameters first: a request that is refused here costs nothing
  // upstream, so it is not counted against the limit.
  const qs  = event.queryStringParameters || {};
  const lat = decimal(qs.lat);
  const lon = decimal(qs.lon);
  if(lat === null || lon === null) return json(400, { ok: false, error: 'lat and lon required' });
  if(lat < AU_BOX.latMin || lat > AU_BOX.latMax || lon < AU_BOX.lonMin || lon > AU_BOX.lonMax){
    return json(400, { ok: false, error: 'lat and lon must be in Australia' });
  }
  const zoomIn = (typeof qs.zoom === 'string' && /^\d{1,2}$/.test(qs.zoom)) ? parseInt(qs.zoom, 10) : 16;
  const zoom = Math.min(18, Math.max(12, zoomIn));

  const retryAfter = await rateLimited(clientIp(event));
  if(retryAfter) return json(429, { ok: false, error: 'Too many requests' }, { 'Retry-After': String(retryAfter) });

  const center = latLonToTile(lat, lon, zoom);
  const maxTile = Math.pow(2, zoom) - 1;

  // Fetch a 3x3 grid of tiles centred on the property
  const grid = [-1, 0, 1];
  const servers = ['a', 'b', 'c']; // round-robin across OSM tile CDN
  let si = 0;

  const tilePromises = [];
  for(const dy of grid){
    for(const dx of grid){
      const tx = Math.max(0, Math.min(maxTile, center.x + dx));
      const ty = Math.max(0, Math.min(maxTile, center.y + dy));
      tilePromises.push(fetchTile(servers[si++ % 3], zoom, tx, ty));
    }
  }

  const tiles = await Promise.all(tilePromises);
  if(tiles.every(t => t === null)) return json(502, { ok: false, error: 'All tile fetches failed' });

  return json(200, { ok: true, tiles, cols: 3, rows: 3, tileSize: 256 });
};

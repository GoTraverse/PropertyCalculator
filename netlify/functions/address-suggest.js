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
 */

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

// ── Redis helpers (token cache only) ─────────────────────────────────────────

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
  } catch { return null; }
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

// ── Domain OAuth2 token (cached in Redis for 55 min) ────────────────────────

async function getDomainToken() {
  if (!DOMAIN_CLIENT_ID || !DOMAIN_CLIENT_SECRET) return null;

  // Check Redis cache first
  const cached = await rGet('domain:access_token');
  if (cached) return cached;

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
    const json = await res.json();
    if (!json.access_token) return null;

    // Cache for 55 minutes (tokens expire at 60 min)
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
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) return null;

    const STATE_CODES = ['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'];
    const STATE_NAMES = {
      'new south wales':'NSW','victoria':'VIC','queensland':'QLD',
      'south australia':'SA','western australia':'WA','tasmania':'TAS',
      'northern territory':'NT','australian capital territory':'ACT',
    };

    const results = json.slice(0, limit).map(item => {
      const a   = item.address || {};
      const raw = (a.state || '').trim();
      const state = STATE_CODES.includes(raw.toUpperCase())
        ? raw.toUpperCase()
        : (STATE_NAMES[raw.toLowerCase().replace(/^state of /, '')] || raw);

      const streetParts = [a.streetNumber, a.street].filter(Boolean);
      const unitParts   = a.unitNumber ? ['Unit ' + a.unitNumber] : [];
      const address     = [...unitParts, ...streetParts].join(' ') || item.displayAddress || '';

      const coord = item.coordinate || item.geoLocation || {};
      return {
        address,
        suburb:   a.suburb   || '',
        state,
        postcode: a.postcode || '',
        lat: coord.lat  || coord.latitude  || null,
        lon: coord.lon  || coord.longitude || null,
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
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) return null;

    const STATE_CODES = ['QLD','NSW','VIC','WA','SA','TAS','NT','ACT'];
    const STATE_NAMES = {
      'queensland':'QLD','new south wales':'NSW','victoria':'VIC',
      'western australia':'WA','south australia':'SA','tasmania':'TAS',
      'northern territory':'NT','australian capital territory':'ACT',
    };

    const results = json.map(item => {
      const a        = item.address || {};
      const road     = a.road || a.pedestrian || a.path || '';
      const houseNo  = a.house_number || '';
      const address  = houseNo ? houseNo + ' ' + road : road;
      const rawState = (a.state_code || a.state || '').trim();
      const state    = STATE_CODES.includes(rawState.toUpperCase())
        ? rawState.toUpperCase()
        : (STATE_NAMES[rawState.toLowerCase().replace(/^state of /, '')] || '');
      const suburb   = a.suburb || a.neighbourhood || a.city_district
                     || a.town  || a.village || a.hamlet || '';
      const display  = address || item.display_name.split(',')[0];
      return {
        address:  display,
        suburb,
        state,
        postcode: a.postcode || '',
        lat: parseFloat(item.lat) || null,
        lon: parseFloat(item.lon) || null,
      };
    }).filter(r => r.address);

    return results.length ? results : null;
  } catch { return null; }
}

// ── IP-based rate limit helper ────────────────────────────────────────────────

async function checkRateLimit(ip) {
  if (!REDIS_URL || !REDIS_TOKEN) return false; // skip if Redis unavailable
  const key = 'rl:addr:' + ip;
  try {
    const count = await redisCmd('INCR', key);
    if (count === 1) await redisCmd('EXPIRE', key, '60');
    return count > 120; // 120 req/min per IP
  } catch { return false; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  const clientIp = (event.headers?.['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
  if (await checkRateLimit(clientIp)) {
    return { statusCode: 429, headers: H, body: JSON.stringify({ ok: false, error: 'Too many requests' }) };
  }

  const qs    = event.queryStringParameters || {};
  const query = (qs.q || '').trim();
  const mode  = qs.mode || 'suggest';   // 'suggest' | 'geocode'
  const limit = Math.min(parseInt(qs.limit, 10) || 6, 10);

  if (!query || query.length < 3 || query.length > 200) {
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, results: [] }) };
  }

  // Try Domain first, then fall back to Nominatim
  let results = await domainSuggest(query, limit);
  let source  = 'domain';

  if (!results) {
    results = await nominatimSuggest(query, limit);
    source  = 'nominatim';
  }

  if (!results || !results.length) {
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, results: [], source: 'none' }) };
  }

  if (mode === 'geocode') {
    // Return just the first result's coordinates for map lookup
    const first = results[0];
    if (!first.lat || !first.lon) {
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false, error: 'No coordinates found', source }) };
    }
    return { statusCode: 200, headers: H,
      body: JSON.stringify({ ok: true, lat: first.lat, lon: first.lon, address: first.address, source }) };
  }

  return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, results, source }) };
};

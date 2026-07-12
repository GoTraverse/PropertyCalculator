/**
 * journey.js — Netlify Function
 * First Home Journey: account sync, sharing/collaboration, admin visibility.
 *
 * AUTH:
 *   - User (es_session cookie): sync (save own journey), get (load own journey),
 *     shareCreate (mint view/edit link), shareRevoke
 *   - Public: shareResolve (open a shared journey by token — view needs no
 *     account; edit-mode writes still require a signed-in partner via sync)
 *   - Admin (role=admin): adminList, adminGet, adminDelete
 *
 * Redis keys:
 *   journey:<email>          → { state, updatedAt, email, name }
 *   journey:users            → SET of emails that have synced a journey
 *   journey:share:<token>    → { email, mode: 'view'|'edit', created_at }
 *   journey:shares:<email>   → { view: <token>, edit: <token> } (for reuse/revoke)
 *   ratelimit:journey:<ip>   → INCR+EXPIRE 3600, cap 120/hour
 *
 * Collaboration model (v1): a partner who opens an edit link and signs in
 * writes to the OWNER's journey record via sync{collab:token}. Last write
 * wins — the journey state is one small blob and both parties re-pull on
 * load. Documented in PRODUCT_JOURNEY.md.
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());
// CSRF defense-in-depth. See auth.js for the rationale.
function isAllowedOrigin(event){
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if(!o) return true;
  return ALLOWED_ORIGINS.includes(o) || o.endsWith('.netlify.app');
}
function getCorsHeaders(event) {
  const reqOrigin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin
    : reqOrigin.endsWith('.netlify.app') ? reqOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}
let H = {};

// ── Redis helpers ──────────────────────────────────────────────────────
async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  return (await r.json()).result;
}
async function rGet(key) {
  const raw = await redisCmd('GET', key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return raw; }
}
async function rSet(key, val) {
  return redisCmd('SET', key, typeof val === 'string' ? val : JSON.stringify(val));
}

// ── Auth (same pattern as reviews.js / comments.js) ────────────────────
function readCookieToken(event) {
  const raw = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  if (!raw) return '';
  for (const p of raw.split(/;\s*/)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === 'es_session') {
      try { return decodeURIComponent(p.slice(eq + 1)); } catch (e) { return p.slice(eq + 1); }
    }
  }
  return '';
}
async function verifyToken(event) {
  const token = readCookieToken(event);
  if (!token) return null;
  const raw = await redisCmd('GET', 'token:' + token);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch(e) { return null; }
  if (data.expires && Date.now() > data.expires) { await redisCmd('DEL', 'token:' + token); return null; }
  if (data.email) { const u = await redisCmd('GET', 'user:' + data.email); if (!u) return null; }
  return data;
}
async function verifyAdmin(event) {
  const data = await verifyToken(event);
  if (!data || data.role !== 'admin') return null;
  return data;
}

// ── Utilities ──────────────────────────────────────────────────────────
function ok(b)   { return { statusCode: 200, headers: H, body: JSON.stringify(b) }; }
function fail(msg, code) { return { statusCode: code || 200, headers: H, body: JSON.stringify({ ok: false, error: msg }) }; }

const STATE_MAX_BYTES = 32000; // journey blobs are ~2 KB; 32 KB is a generous ceiling

function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (state.v !== 1) return false;
  try { if (JSON.stringify(state).length > STATE_MAX_BYTES) return false; } catch (e) { return false; }
  return true;
}
function newShareToken() {
  return require('crypto').randomBytes(16).toString('base64url');
}
function summarise(rec) {
  const st = (rec && rec.state) || {};
  const done = st.done || {};
  let doneCount = 0;
  for (let i = 1; i <= 7; i++) if (done[i]) doneCount++;
  return {
    email: rec.email,
    name: rec.name || '',
    updatedAt: rec.updatedAt || 0,
    stage: (st.profile && st.profile.stage) || null,
    doneCount,
    price: (st.numbers && st.numbers.price) || null,
    saved: (st.numbers && st.numbers.saved) || null,
    state: (st.numbers && st.numbers.state) || null,
    cap: (st.budget && st.budget.cap) || null,
    fhb: !!(st.profile && st.profile.fhb),
    inspections: Array.isArray(st.inspections) ? st.inspections.length : 0,
    signedContract: !!(st.deal && st.deal.signed),
  };
}

async function rateLimit(event) {
  try {
    const clientIp = (event.headers['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
    const key = 'ratelimit:journey:' + clientIp;
    const n = parseInt(await redisCmd('INCR', key), 10);
    if (n === 1) await redisCmd('EXPIRE', key, '3600');
    return n <= 120;
  } catch (e) { return true; }
}

// Resolve which journey record a sync/get should touch: the caller's own,
// or — with a valid edit-mode collab token — the owner's.
async function resolveTarget(user, collabToken) {
  if (!collabToken) return { email: user.email, owner: null };
  const share = await rGet('journey:share:' + String(collabToken).slice(0, 64));
  if (!share || share.mode !== 'edit') return null;
  return { email: share.email, owner: share };
}

// ── Handler ────────────────────────────────────────────────────────────
exports.handler = async function(event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return fail('Method not allowed', 405);
  if (!isAllowedOrigin(event)) return fail('Forbidden', 403);

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error('[journey] Missing UPSTASH env vars');
    return fail('Storage not configured', 500);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return fail('Invalid JSON', 400); }
  const action = body.action;
  if (!action) return fail('action required');

  if (!(await rateLimit(event))) return fail('Too many requests — please slow down', 429);

  // ── Public: open a shared journey ──────────────────────────────────
  if (action === 'shareResolve') {
    const token = String(body.token || '').slice(0, 64);
    if (!token) return fail('token required');
    try {
      const share = await rGet('journey:share:' + token);
      if (!share) return fail('This share link is no longer active', 404);
      const rec = await rGet('journey:' + share.email);
      if (!rec) return fail('This journey has no saved data yet', 404);
      return ok({ ok: true, mode: share.mode,
                  ownerName: (rec.name || share.email.split('@')[0] || 'A buyer').split(' ')[0],
                  state: rec.state, updatedAt: rec.updatedAt || 0 });
    } catch (e) {
      console.error('[journey] shareResolve error:', e.message);
      return fail('Failed to open the shared journey. Please try again.', 500);
    }
  }

  // ── User actions ────────────────────────────────────────────────────
  const user = await verifyToken(event);

  if (action === 'sync') {
    if (!user) return fail('Please sign in to sync your journey', 401);
    if (!validState(body.state)) return fail('Invalid journey state');
    try {
      const target = await resolveTarget(user, body.collab);
      if (!target) return fail('That collaboration link is no longer active', 403);
      const rec = {
        email: target.email,
        name: target.owner ? undefined : (user.name || ''),
        state: body.state,
        updatedAt: Date.now(),
        lastEditor: user.email,
      };
      // keep the owner's display name when a partner writes
      if (target.owner) {
        const existing = await rGet('journey:' + target.email);
        rec.name = (existing && existing.name) || '';
      }
      await rSet('journey:' + target.email, rec);
      await redisCmd('SADD', 'journey:users', target.email);
      return ok({ ok: true, updatedAt: rec.updatedAt });
    } catch (e) {
      console.error('[journey] sync error:', e.message);
      return fail('Failed to sync. Please try again.', 500);
    }
  }

  if (action === 'get') {
    if (!user) return fail('Please sign in', 401);
    try {
      const target = await resolveTarget(user, body.collab);
      if (!target) return fail('That collaboration link is no longer active', 403);
      const rec = await rGet('journey:' + target.email);
      return ok({ ok: true, record: rec ? { state: rec.state, updatedAt: rec.updatedAt || 0 } : null });
    } catch (e) {
      console.error('[journey] get error:', e.message);
      return fail('Failed to load. Please try again.', 500);
    }
  }

  if (action === 'shareCreate') {
    if (!user) return fail('Please sign in to share your journey', 401);
    const mode = body.mode === 'edit' ? 'edit' : 'view';
    try {
      // one active link per mode per user — reuse unless rotate is asked
      const mapKey = 'journey:shares:' + user.email;
      const map = (await rGet(mapKey)) || {};
      if (map[mode] && !body.rotate) {
        const existing = await rGet('journey:share:' + map[mode]);
        if (existing) return ok({ ok: true, token: map[mode], mode, reused: true });
      }
      if (map[mode] && body.rotate) {
        await redisCmd('DEL', 'journey:share:' + map[mode]);
      }
      const token = newShareToken();
      await rSet('journey:share:' + token, { email: user.email, mode, created_at: Date.now() });
      map[mode] = token;
      await rSet(mapKey, map);
      return ok({ ok: true, token, mode });
    } catch (e) {
      console.error('[journey] shareCreate error:', e.message);
      return fail('Failed to create the link. Please try again.', 500);
    }
  }

  if (action === 'shareRevoke') {
    if (!user) return fail('Please sign in', 401);
    const mode = body.mode === 'edit' ? 'edit' : 'view';
    try {
      const mapKey = 'journey:shares:' + user.email;
      const map = (await rGet(mapKey)) || {};
      if (map[mode]) {
        await redisCmd('DEL', 'journey:share:' + map[mode]);
        delete map[mode];
        await rSet(mapKey, map);
      }
      return ok({ ok: true });
    } catch (e) { return fail('Failed to revoke. Please try again.', 500); }
  }

  // ── Admin actions ──────────────────────────────────────────────────
  const admin = await verifyAdmin(event);
  if (!admin) return fail('Admin access required', 401);

  if (action === 'adminList') {
    try {
      const emails = (await redisCmd('SMEMBERS', 'journey:users')) || [];
      const capped = emails.slice(0, 500);
      const items = [];
      if (capped.length) {
        const keys = capped.map(e => 'journey:' + e);
        const raws = await redisCmd('MGET', ...keys);
        for (let i = 0; i < capped.length; i++) {
          const raw = Array.isArray(raws) ? raws[i] : null;
          if (!raw) continue;
          try { items.push(summarise(JSON.parse(raw))); } catch (e) {}
        }
      }
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      return ok({ ok: true, items, total: emails.length });
    } catch (e) {
      console.error('[journey] adminList error:', e.message);
      return fail('Failed to list journeys. Please try again.', 500);
    }
  }

  if (action === 'adminGet') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return fail('email required');
    try {
      const rec = await rGet('journey:' + email);
      if (!rec) return fail('No journey for that user', 404);
      return ok({ ok: true, record: rec });
    } catch (e) { return fail('Failed to load. Please try again.', 500); }
  }

  if (action === 'adminDelete') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return fail('email required');
    try {
      await redisCmd('DEL', 'journey:' + email);
      await redisCmd('SREM', 'journey:users', email);
      return ok({ ok: true });
    } catch (e) { return fail('Failed to delete. Please try again.', 500); }
  }

  return fail('Unknown action');
};

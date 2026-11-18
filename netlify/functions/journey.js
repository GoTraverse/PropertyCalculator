/**
 * journey.js — Netlify Function
 * First Home Journey: account sync, sharing/collaboration, admin visibility.
 *
 * AUTH:
 *   - User (es_session cookie): sync (save own journey), get (load own journey),
 *     shareCreate (mint view/edit link), shareRevoke
 *   - User: detailsGet, detailsPut ("your details", shared/details.js: the
 *     visitor's own facts that the Journey, the calculators and /app share).
 *     Always the caller's own record: a collab token is ignored, so a
 *     partner never reads or writes the owner's details.
 *   - Public: shareResolve (open a shared journey by token — view needs no
 *     account; edit-mode writes still require a signed-in partner via sync)
 *   - Admin (role=admin): adminList, adminGet, adminDelete (also removes
 *     details:<email>)
 *
 * Redis keys:
 *   journey:<email>          → { state, updatedAt, email, name }
 *   journey:users            → SET of emails that have synced a journey
 *   journey:share:<token>    → { email, mode: 'view'|'edit', created_at }
 *   journey:shares:<email>   → { view: <token>, edit: <token> } (for reuse/revoke)
 *   details:<email>          → { f: { <field>: { v, at, by } }, updatedAt }, ≤ 4 KB
 *   details_lock:<email>     → held by one detailsPut at a time, EX 30
 *   ratelimit:journey:<ip>   → INCR+EXPIRE 3600, cap 120/hour
 *   ratelimit:details:<ip>   → the same cap, counted apart so pages reading
 *                              your details never use up the Journey's sync
 *
 * Collaboration model (v1): a partner who opens an edit link and signs in
 * writes to the OWNER's journey record via sync{collab:token}. Last write
 * wins — the journey state is one small blob and both parties re-pull on
 * load. Documented in PRODUCT_JOURNEY.md.
 */

const { isStaleSession } = require('./_session');
// Static path, so the esbuild bundler includes the file in the function.
const Details = require('../../shared/details');
const REDIS_URL  = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());
// Only this site's own Netlify deploy and preview hosts, never any *.netlify.app.
const OWN_NETLIFY_ORIGIN = /^https:\/\/([a-z0-9]+(-[a-z0-9]+)*--)?equitysight\.netlify\.app$/;
// CSRF defense-in-depth. See auth.js for the rationale.
function isAllowedOrigin(event){
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if(!o) return true;
  return ALLOWED_ORIGINS.includes(o) || OWN_NETLIFY_ORIGIN.test(o);
}
function getCorsHeaders(event) {
  const reqOrigin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin
    : OWN_NETLIFY_ORIGIN.test(reqOrigin) ? reqOrigin
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
  if (isStaleSession(data)) return null;
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
function gone(msg) { return { statusCode: 404, headers: H, body: JSON.stringify({ ok: false, gone: true, error: msg }) }; }

const STATE_MAX_BYTES = 32000; // journey blobs are ~2 KB; 32 KB is a generous ceiling

const STATE_CODES = ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt'];
// Journey fields that mirror "your details" (build plan 2.4) use the same
// ranges as shared/details.js.
const EMP_TYPES = Details.EMPLOYMENT;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{8}$/;
const FACT_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
const isNumIn = (v, min, max) => typeof v === 'number' && isFinite(v) && v >= min && v <= max;
const isIntIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const nullOr = (v, test) => v == null || test(v);
const isPair = (v, test) => Array.isArray(v) && v.length === 2 && v.every(test);
// The client normalises every field when it loads a state; this is the
// server's own floor, so a hand-made request cannot store values of the wrong
// type for another person (a partner, a follower, or the admin tab) to load.
function validState(state) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(state)) return false;
  if (state.v !== 1) return false;
  try { if (JSON.stringify(state).length > STATE_MAX_BYTES) return false; } catch (e) { return false; }
  for (const k of ['done', 'numbers', 'profile', 'budget', 'deal', 'settle']) {
    if (state[k] != null && !isObj(state[k])) return false;
  }
  if (state.numbers && state.numbers.state != null && !STATE_CODES.includes(state.numbers.state)) return false;
  if (state.profile && state.profile.stage != null && typeof state.profile.stage !== 'string') return false;
  // Fields added for "your details". Each may be absent or null.
  const P = state.profile || {}, N = state.numbers || {};
  if (!nullOr(P.incomes, v => isPair(v, x => isNumIn(x, 0, 1e7)))) return false;
  if (!nullOr(P.empTypes, v => isPair(v, x => EMP_TYPES.includes(x)))) return false;
  if (!nullOr(P.hecs, v => isPair(v, x => typeof x === 'boolean'))) return false;
  if (!nullOr(P.debtsMo, v => isNumIn(v, 0, 1e6))) return false;
  if (!nullOr(P.livingMo, v => isNumIn(v, 0, 1e6))) return false;
  if (!nullOr(P.dependants, v => isIntIn(v, 0, 10))) return false;
  if (!nullOr(N.rate, v => isNumIn(v, 0, 25))) return false;
  if (!nullOr(N.termYears, v => isIntIn(v, 1, 40))) return false;
  // factsAt: when the Journey last changed each answer, { <id>: ms }.
  if (state.factsAt != null) {
    if (!isObj(state.factsAt)) return false;
    const keys = Object.keys(state.factsAt);
    if (keys.length > 64 || keys.some(k => !FACT_KEY_RE.test(k) || !isNumIn(state.factsAt[k], 0, 1e14))) return false;
  }
  for (const k of ['inspections', 'scenarios']) {
    if (state[k] != null && (!Array.isArray(state[k]) || state[k].length > 60 || state[k].some(r => !isObj(r)))) return false;
  }
  if (Array.isArray(state.inspections) && state.inspections.some(r => (r.st != null && typeof r.st !== 'string') || (r.addr != null && typeof r.addr !== 'string') || (r.note != null && typeof r.note !== 'string'))) return false;
  // A place's id goes into /app?place=<id>, so it is 8 plain characters.
  if (Array.isArray(state.inspections) && state.inspections.some(r => r.id != null && (typeof r.id !== 'string' || !PLACE_ID_RE.test(r.id)))) return false;
  // `at` is the time a place was added or a scenario was saved, in ms. The
  // page prints it as a date, so it has to be a number when it is there.
  for (const k of ['inspections', 'scenarios']) {
    if (Array.isArray(state[k]) && state[k].some(r => r.at != null && (typeof r.at !== 'number' || !isFinite(r.at) || r.at < 0))) return false;
  }
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

// One detailsPut at a time per account. A put reads the whole record, merges
// field by field and writes it back, so two at once (two devices pushing in
// the same moment) could each write over the other's fields.
// details_lock:<email> is held from the read to the write; a second put waits
// for it (about a second at most), then is refused and the browser keeps the
// fields to send again. Same pattern as stripe.js lockCustomer. The prefix is
// not 'details:', so the lock never shows up as somebody's record.
const DETAILS_LOCK_TTL = 30;      // seconds: longer than this function can run
const DETAILS_LOCK_TRIES = 10;
const DETAILS_LOCK_WAIT_MS = 100;
async function lockDetails(email) {
  for (let i = 0; i < DETAILS_LOCK_TRIES; i++) {
    if (i) await new Promise(resolve => setTimeout(resolve, DETAILS_LOCK_WAIT_MS));
    const res = await redisCmd('SET', 'details_lock:' + email, '1', 'NX', 'EX', String(DETAILS_LOCK_TTL));
    if (res === 'OK') return true;
  }
  return false;
}
async function unlockDetails(email) {
  // Best effort: a lock that can't be released expires by itself.
  try { await redisCmd('DEL', 'details_lock:' + email); }
  catch (e) { console.warn('[journey] details lock not released, it expires in', DETAILS_LOCK_TTL, 's:', e.message); }
}

// bucket: 'journey' (sync, sharing, admin) or 'details' (detailsGet/Put).
// Same cap; separate counts, because every calculator page reads the details
// record and that must never block saving the Journey itself.
async function rateLimit(event, bucket) {
  try {
    const clientIp = (event.headers['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
    const key = 'ratelimit:' + (bucket === 'details' ? 'details' : 'journey') + ':' + clientIp;
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

  const isDetails = action === 'detailsGet' || action === 'detailsPut';
  if (!(await rateLimit(event, isDetails ? 'details' : 'journey'))) return fail('Too many requests — please slow down', 429);

  // ── Public: open a shared journey ──────────────────────────────────
  if (action === 'shareResolve') {
    const token = String(body.token || '').slice(0, 64);
    if (!token) return fail('token required');
    try {
      // gone:true tells the page the link itself is dead, as opposed to a
      // request that failed. It forgets a remembered invite only on gone.
      const share = await rGet('journey:share:' + token);
      if (!share) return gone('This share link is no longer active');
      const rec = await rGet('journey:' + share.email);
      if (!rec) return gone('This journey has no saved data yet');
      // mine: the signed-in caller owns this journey, so the page doesn't
      // ask them to join it. Says nothing about the owner to anyone else.
      let mine = false;
      try { const me = await verifyToken(event); mine = !!(me && me.email && me.email === share.email); } catch (e) {}
      return ok({ ok: true, mode: share.mode, mine,
                  ownerName: (rec.name || share.email.split('@')[0] || 'A buyer').split(' ')[0],
                  state: rec.state, updatedAt: rec.updatedAt || 0 });
    } catch (e) {
      console.error('[journey] shareResolve error:', e.message);
      return fail('Failed to open the shared journey. Please try again.', 500);
    }
  }

  // ── User actions ────────────────────────────────────────────────────
  const user = await verifyToken(event);

  // ── Your details (shared/details.js) ──────────────────────────────────
  // The caller's own record only. Values are never logged: log lines name
  // fields and counts.
  if (isDetails) {
    if (!user) return fail('Please sign in', 401);
    const email = String(user.email || '');
    // Keys are built from the address, as for the journey keys in auth.js.
    if (!email.includes('@') || email.includes(':')) return fail('Please sign in', 401);
    const key = 'details:' + email;

    if (action === 'detailsGet') {
      try {
        return ok({ ok: true, record: Details.accountRecord(await rGet(key)) });
      } catch (e) {
        console.error('[journey] detailsGet error:', e.message);
        return fail('Failed to load your details. Please try again.', 500);
      }
    }

    // detailsPut { f: { <field>: { v, at, by } } }: field by field, newest
    // wins (a tie keeps the stored value), times clamped to now + 60 s, bad
    // fields dropped, fields not sent left alone.
    const incoming = body.f;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return fail('Invalid details', 400);
    let size = 0;
    try { size = JSON.stringify(incoming).length; } catch (e) { return fail('Invalid details', 400); }
    if (size > Details.MAX_BYTES * 2) return fail('Too much in one request', 413);
    let locked = false;
    try {
      locked = await lockDetails(email);
      if (!locked) return fail('Your details are being saved from another page or device. Please try again.', 503);
      const stored = Details.accountRecord(await rGet(key));
      const now = Date.now();
      const m = Details.serverMerge(stored ? stored.f : {}, incoming, now);
      let updatedAt = stored ? stored.updatedAt : 0;
      if (m.accepted.length) {
        const rec = { f: m.f, updatedAt: Math.max(now, updatedAt + 1) };
        if (!Details.fitsCap(rec)) return fail('Your details are too large to save', 413);
        await rSet(key, rec);
        updatedAt = rec.updatedAt;
      }
      if (m.dropped.length) console.warn('[journey] detailsPut dropped', m.dropped.length, 'field(s):', m.dropped.join(','));
      return ok({ ok: true, record: { f: m.f, updatedAt }, accepted: m.accepted, stale: m.stale, dropped: m.dropped });
    } catch (e) {
      console.error('[journey] detailsPut error:', e.message);
      return fail('Failed to save your details. Please try again.', 500);
    } finally {
      if (locked) await unlockDetails(email);
    }
  }

  if (action === 'sync') {
    if (!user) return fail('Please sign in to sync your journey', 401);
    if (!validState(body.state)) return fail('Invalid journey state');
    try {
      const target = await resolveTarget(user, body.collab);
      if (!target) return fail('That collaboration link is no longer active', 403);
      const existing = await rGet('journey:' + target.email);
      // Stale-write guard. The client sends `base`: the updatedAt of the copy
      // its changes were made on. If the stored record is newer than that,
      // someone else (a partner, or another device) saved in between, and
      // writing this blob would erase their work. Refuse and hand back the
      // current record instead. Clients that send no base (cached older
      // script) keep the old last-write-wins behaviour.
      if (existing && typeof body.base === 'number' && (existing.updatedAt || 0) > body.base) {
        return ok({ ok: false, conflict: true, error: 'This journey was changed somewhere else',
                    record: { state: existing.state, updatedAt: existing.updatedAt || 0 } });
      }
      const rec = {
        email: target.email,
        name: target.owner ? undefined : (user.name || ''),
        state: body.state,
        updatedAt: Date.now(),
        lastEditor: user.email,
      };
      // keep the owner's display name when a partner writes
      if (target.owner) rec.name = (existing && existing.name) || '';
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

  // Which of the caller's links are live, so the page can offer to turn them off.
  if (action === 'shareList') {
    if (!user) return fail('Please sign in', 401);
    try {
      const map = (await rGet('journey:shares:' + user.email)) || {};
      const live = {};
      for (const mode of ['view', 'edit']) {
        live[mode] = !!(map[mode] && await rGet('journey:share:' + map[mode]));
      }
      return ok({ ok: true, view: live.view, edit: live.edit });
    } catch (e) { return fail('Failed to load your links. Please try again.', 500); }
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
    if (!email || !email.includes('@')) return fail('email required');
    try {
      const rec = await rGet('journey:' + email);
      if (!rec) return fail('No journey for that user', 404);
      return ok({ ok: true, record: rec });
    } catch (e) { return fail('Failed to load. Please try again.', 500); }
  }

  if (action === 'adminDelete') {
    const email = String(body.email || '').trim().toLowerCase();
    // Keys are built from this value. Requiring an address keeps a typo such
    // as "users" from deleting the journey:users index.
    if (!email || !email.includes('@')) return fail('email required');
    try {
      // revoke share/collab tokens too — otherwise they dangle and silently
      // come back to life if the user ever re-syncs
      const map = (await rGet('journey:shares:' + email)) || {};
      for (const mode of Object.keys(map)) await redisCmd('DEL', 'journey:share:' + map[mode]);
      await redisCmd('DEL', 'journey:shares:' + email);
      await redisCmd('DEL', 'journey:' + email);
      await redisCmd('SREM', 'journey:users', email);
      // The same person's "your details" record holds the same kind of
      // figures, so deleting their journey deletes it too.
      await redisCmd('DEL', 'details:' + email);
      return ok({ ok: true });
    } catch (e) { return fail('Failed to delete. Please try again.', 500); }
  }

  return fail('Unknown action');
};

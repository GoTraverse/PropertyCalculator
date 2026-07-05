/**
 * portfolio.js — Netlify Function
 * Portfolio Tracker backend — per-user list of property holdings.
 *
 * AUTH:
 *   HttpOnly es_session cookie only (Phase 6 — token never exposed to client JS).
 *   Every action requires a valid session — guests get 401 {ok:false,error:'auth'}
 *   and the client handles the guest experience.
 *
 * CAPS (server is the source of truth — NEVER trust the client):
 *   free          → 2 holdings max
 *   pro / adviser → 100 holdings max (sanity cap; adviser is a superset of pro)
 *   Cap is enforced on CREATE only — updates and deletes always allowed.
 *
 * RATE LIMITS (day one — the July 2026 credit incident):
 *   per-IP   30 requests/minute → ratelimit:portfolio:ip:<ip>      INCR+EXPIRE 60
 *   per-user 120 requests/hour  → ratelimit:portfolio:user:<uid>   INCR+EXPIRE 3600
 *
 * Redis keys:
 *   portfolio:<userId> → JSON array of holdings (~1KB each, ≤100 → one key is fine;
 *                        serialised array is rejected beyond 150 KB as a guard)
 *
 * API (POST only — anything else is 405):
 *   {action:'list'}                → {ok:true, holdings:[...], cap:{max,used,plan}}
 *   {action:'save', holding:{...}} → upsert (holding.id present = update own holding;
 *                                    absent = create with server-generated id).
 *                                    Returns the full updated list + cap.
 *   {action:'delete', id}          → removes own holding. Returns full list + cap.
 */

const log = require('./_log');

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

// ── Auth ───────────────────────────────────────────────────────────────
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
// Cookie-only auth — no Authorization-header fallback, matching the Phase 6
// posture (auth.js: "no Authorization header fallback since all clients are
// cookie-based"). The session token is never exposed to client JS.
async function verifyToken(event) {
  const token = readCookieToken(event);
  if (!token) return null;
  const raw = await redisCmd('GET', 'token:' + token);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch(e) { return null; }
  if (data.expires && Date.now() > data.expires) { await redisCmd('DEL', 'token:' + token); return null; }
  // Check user still exists — deleted users must not retain access. While we
  // have the record, refresh plan from it: the token snapshot goes stale after
  // Stripe upgrades / admin plan changes (same freshness rule as auth.js verify).
  if (data.email) {
    const u = await redisCmd('GET', 'user:' + data.email);
    if (!u) return null;
    try {
      const userData = JSON.parse(u);
      if (userData && userData.plan) data.plan = userData.plan;
    } catch(e) { /* keep token plan */ }
  }
  return data; // {userId, email, name, plan, role}
}

// ── Utilities ──────────────────────────────────────────────────────────
function ok(b)   { return { statusCode: 200, headers: H, body: JSON.stringify(b) }; }
function fail(msg, code) { return { statusCode: code || 200, headers: H, body: JSON.stringify({ ok: false, error: msg }) }; }
function vfail(field, message) {
  return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'validation', field, message }) };
}
function capFail(cap) {
  return { statusCode: 403, headers: H, body: JSON.stringify({ ok: false, error: 'cap', cap }) };
}

function newId() {
  return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function portfolioKey(uid) { return 'portfolio:' + uid; }
function capMax(plan) { return (plan === 'pro' || plan === 'adviser') ? 100 : 2; }
function capOf(plan, holdings) { return { max: capMax(plan), used: holdings.length, plan: plan || 'free' }; }

async function readPortfolio(uid) {
  const raw = await redisCmd('GET', portfolioKey(uid));
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch(e) { return []; }
}

// ── Holding validation ─────────────────────────────────────────────────
// Whitelist — any key outside this list is rejected (400 naming the key).
const HOLDING_KEYS = [
  'id', 'label', 'state', 'suburb', 'entity', 'ownershipPct', 'ppr',
  'purchasePrice', 'purchaseDate', 'currentValue', 'landValue',
  'loanBalance', 'interestRate', 'ioOrPi', 'loanTermYears',
  'ioExpiry', 'fixedExpiry', 'leaseExpiry',
  'weeklyRent', 'annualExpenses', 'notes', 'updatedAt',
];
const STATES   = ['nsw','vic','qld','sa','wa','tas','act','nt'];
const ENTITIES = ['individual','joint','company','trust','smsf'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Coerce to a finite number and clamp into [min,max]; anything unusable → def.
function numClamp(v, min, max, def) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
// 'YYYY-MM' or '' — returns null when invalid so the caller can name the field.
function monthOrEmpty(v) {
  const s = String(v == null ? '' : v).trim();
  if (s === '') return '';
  return MONTH_RE.test(s) ? s : null;
}

// Returns {holding} on success or {field, message} on validation failure.
// id + updatedAt are server-controlled and set by the handler, never here.
function sanitizeHolding(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { field: 'holding', message: 'holding object required' };
  }
  for (const k of Object.keys(raw)) {
    if (!HOLDING_KEYS.includes(k)) return { field: k, message: 'Unknown field: ' + k };
  }

  const label = String(raw.label == null ? '' : raw.label).trim();
  if (label.length < 1 || label.length > 80) {
    return { field: 'label', message: 'label is required (1–80 characters)' };
  }

  const state = String(raw.state || '').toLowerCase().trim();
  if (!STATES.includes(state)) {
    return { field: 'state', message: 'state must be one of ' + STATES.join('|') };
  }

  const entity = (raw.entity === undefined || raw.entity === null || raw.entity === '')
    ? 'individual' : String(raw.entity).toLowerCase().trim();
  if (!ENTITIES.includes(entity)) {
    return { field: 'entity', message: 'entity must be one of ' + ENTITIES.join('|') };
  }

  const ioOrPi = (raw.ioOrPi === undefined || raw.ioOrPi === null || raw.ioOrPi === '')
    ? 'pi' : String(raw.ioOrPi).toLowerCase().trim();
  if (ioOrPi !== 'io' && ioOrPi !== 'pi') {
    return { field: 'ioOrPi', message: "ioOrPi must be 'io' or 'pi'" };
  }

  const currentValue = Number(raw.currentValue);
  if (!isFinite(currentValue) || !(currentValue > 0)) {
    return { field: 'currentValue', message: 'currentValue is required and must be greater than 0' };
  }

  const dates = {};
  for (const f of ['purchaseDate', 'ioExpiry', 'fixedExpiry', 'leaseExpiry']) {
    const d = monthOrEmpty(raw[f]);
    if (d === null) return { field: f, message: f + " must be 'YYYY-MM' or empty" };
    dates[f] = d;
  }

  return { holding: {
    label,
    state,
    suburb: String(raw.suburb == null ? '' : raw.suburb).trim().slice(0, 60),
    entity,
    ownershipPct: numClamp(raw.ownershipPct, 1, 100, 100),
    ppr: !!raw.ppr,
    purchasePrice: numClamp(raw.purchasePrice, 0, 1e9, 0),
    purchaseDate: dates.purchaseDate,
    currentValue: Math.min(currentValue, 1e9),
    landValue: numClamp(raw.landValue, 0, 1e9, 0),
    loanBalance: numClamp(raw.loanBalance, 0, 1e9, 0),
    interestRate: numClamp(raw.interestRate, 0, 25, 0),
    ioOrPi,
    loanTermYears: numClamp(raw.loanTermYears, 1, 40, 30),
    ioExpiry: dates.ioExpiry,
    fixedExpiry: dates.fixedExpiry,
    leaseExpiry: dates.leaseExpiry,
    weeklyRent: numClamp(raw.weeklyRent, 0, 100000, 0),
    annualExpenses: numClamp(raw.annualExpenses, 0, 1e7, 0),
    notes: String(raw.notes == null ? '' : raw.notes).trim().slice(0, 280),
  } };
}

// ── Handler ────────────────────────────────────────────────────────────
exports.handler = async function(event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return fail('Method not allowed', 405);
  if (!isAllowedOrigin(event)) return fail('Forbidden', 403);

  if (!REDIS_URL || !REDIS_TOKEN) {
    log.error('portfolio.storage_unconfigured', {});
    return fail('storage', 500);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return fail('Invalid JSON', 400); }
  const action = body.action;
  if (!action) return fail('action required', 400);

  // Per-IP rate limit FIRST — cheapest guard, runs before any auth lookups so
  // unauthenticated bot floods (the July credit incident) are shed early.
  const clientIp = ((event.headers && event.headers['x-nf-client-connection-ip']) || 'unknown').split(',')[0].trim();
  try {
    const ipKey = 'ratelimit:portfolio:ip:' + clientIp;
    const ipCount = parseInt(await redisCmd('INCR', ipKey), 10);
    if (ipCount === 1) await redisCmd('EXPIRE', ipKey, '60');
    if (ipCount > 30) {
      log.warn('portfolio.rate_limited', { scope: 'ip', ip: clientIp, count: ipCount });
      return fail('Too many requests — please slow down and try again in a minute.', 429);
    }
  } catch(e) { console.warn('[portfolio] ip rate-limit error:', e.message); }

  // Auth — every action requires a valid session.
  let user;
  try { user = await verifyToken(event); }
  catch(e) {
    log.error('portfolio.auth_storage_error', { err: e.message });
    return fail('storage', 500);
  }
  if (!user || !user.userId) return fail('auth', 401);
  const uid  = user.userId;
  const plan = user.plan || 'free';

  // Per-user rate limit — 120/hour.
  try {
    const userKey = 'ratelimit:portfolio:user:' + uid;
    const userCount = parseInt(await redisCmd('INCR', userKey), 10);
    if (userCount === 1) await redisCmd('EXPIRE', userKey, '3600');
    if (userCount > 120) {
      log.warn('portfolio.rate_limited', { scope: 'user', userId: uid, count: userCount });
      return fail('Too many requests — please take a short break and try again soon.', 429);
    }
  } catch(e) { console.warn('[portfolio] user rate-limit error:', e.message); }

  try {
    // ── list ───────────────────────────────────────────────────────────
    if (action === 'list') {
      const holdings = await readPortfolio(uid);
      return ok({ ok: true, holdings, cap: capOf(plan, holdings) });
    }

    // ── save (upsert) ──────────────────────────────────────────────────
    if (action === 'save') {
      const v = sanitizeHolding(body.holding);
      if (v.field) return vfail(v.field, v.message);

      // Fresh read inside the mutation — never trust an earlier snapshot.
      const holdings = await readPortfolio(uid);
      const reqId = (body.holding && body.holding.id) ? String(body.holding.id) : '';

      if (reqId) {
        // UPDATE own holding — no cap check (cap applies to CREATE only).
        const idx = holdings.findIndex(h => h && h.id === reqId);
        if (idx < 0) return fail('not_found', 404);
        v.holding.id = reqId;
        v.holding.updatedAt = Date.now();
        holdings[idx] = v.holding;
      } else {
        // CREATE — server-enforced plan cap. Cap hits are upgrade signals.
        const max = capMax(plan);
        if (holdings.length >= max) {
          log.info('portfolio.cap_hit', { userId: uid, plan, used: holdings.length, max });
          return capFail(capOf(plan, holdings));
        }
        v.holding.id = newId();
        v.holding.updatedAt = Date.now();
        holdings.push(v.holding);
      }

      const serialised = JSON.stringify(holdings);
      if (serialised.length > 150000) {
        return fail('Portfolio too large — please shorten notes or remove a holding.', 413);
      }
      await redisCmd('SET', portfolioKey(uid), serialised);
      return ok({ ok: true, holdings, cap: capOf(plan, holdings) });
    }

    // ── delete ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      const id = String(body.id || '').trim();
      if (!id) return vfail('id', 'id required');
      const holdings = await readPortfolio(uid);
      const remaining = holdings.filter(h => h && h.id !== id);
      if (remaining.length !== holdings.length) {
        await redisCmd('SET', portfolioKey(uid), JSON.stringify(remaining));
      }
      return ok({ ok: true, holdings: remaining, cap: capOf(plan, remaining) });
    }

    return fail('Unknown action', 400);
  } catch (e) {
    log.error('portfolio.storage_error', { action, userId: uid, err: e.message });
    return fail('storage', 500);
  }
};

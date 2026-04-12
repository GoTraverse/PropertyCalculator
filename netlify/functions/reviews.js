/**
 * reviews.js — Netlify Function
 * Suburb reviews + star ratings.
 *
 * AUTH:
 *   - Public: listReviews (approved only)
 *   - User (Bearer token): submitReview (min 100-char body, 1 rating/day limit via Redis counter)
 *   - Admin (Bearer token + role=admin): adminPending, adminApprove, adminReject,
 *     adminDeleteReview, adminListAll, buildFetch (build-time scrape across suburbs)
 *
 * Redis keys:
 *   review:<id>                           → full review JSON
 *   reviews:<state>:<slug>                → LIST of approved review IDs (newest first)
 *   reviews:agg:<state>:<slug>            → HASH { count, sum } — avg computed on read
 *   reviews:queue                         → LIST of pending review IDs (newest first)
 *   reviews:all                           → LIST of every review ID (for admin browse)
 *   reviews:userCount:<userId>:<YYYYMMDD> → INCR+EXPIRE 86400, cap 3/day
 *   ratelimit:reviews:<ip>                → INCR+EXPIRE 3600, cap 10/hour
 *
 * Review schema:
 *   { id, suburbSlug, state, userId, userName, rating (1-5),
 *     title, body, created_at, status: 'pending'|'approved'|'rejected' }
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());
function getCorsHeaders(event) {
  const reqOrigin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin
    : reqOrigin.endsWith('.netlify.app') ? reqOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
async function rListRange(key, start, stop) {
  const r = await redisCmd('LRANGE', key, String(start), String(stop));
  return Array.isArray(r) ? r : [];
}
async function rListPrepend(key, val) {
  return redisCmd('LPUSH', key, typeof val === 'string' ? val : JSON.stringify(val));
}
async function rListRemove(key, val) {
  return redisCmd('LREM', key, '0', typeof val === 'string' ? val : JSON.stringify(val));
}
async function rHIncrBy(key, field, n) {
  return redisCmd('HINCRBY', key, field, String(n));
}
async function rHGetAll(key) {
  const r = await redisCmd('HGETALL', key);
  if (!Array.isArray(r) || !r.length) return {};
  const out = {};
  for (let i = 0; i < r.length; i += 2) out[r[i]] = r[i + 1];
  return out;
}

// ── Auth ───────────────────────────────────────────────────────────────
async function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const raw = await redisCmd('GET', 'token:' + token);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch(e) { return null; }
  if (data.expires && Date.now() > data.expires) { await redisCmd('DEL', 'token:' + token); return null; }
  if (data.email) { const u = await redisCmd('GET', 'user:' + data.email); if (!u) return null; }
  return data;
}
async function verifyAdmin(authHeader) {
  const data = await verifyToken(authHeader);
  if (!data || data.role !== 'admin') return null;
  return data;
}

// ── Utilities ──────────────────────────────────────────────────────────
function ok(b)   { return { statusCode: 200, headers: H, body: JSON.stringify(b) }; }
function fail(msg, code) { return { statusCode: code || 200, headers: H, body: JSON.stringify({ ok: false, error: msg }) }; }

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cleanSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80); }
function cleanState(s) {
  const u = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  return ['NSW','VIC','QLD','SA','WA','TAS','ACT','NT'].includes(u) ? u : '';
}
function newId() {
  return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function todayKey() {
  const d = new Date();
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}

function suburbListKey(state, slug) { return 'reviews:' + state + ':' + slug; }
function aggKey(state, slug)        { return 'reviews:agg:' + state + ':' + slug; }

// ── Handler ────────────────────────────────────────────────────────────
exports.handler = async function(event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error('[reviews] Missing UPSTASH env vars');
    return fail('Storage not configured', 500);
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';

  // ── GET — public list + build-time admin fetch ──────────────────────
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const action = q.action || 'list';

    if (action === 'list') {
      const state = cleanState(q.state);
      const slug  = cleanSlug(q.slug);
      if (!state || !slug) return fail('state and slug required');
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const pageSize = Math.min(20, Math.max(1, parseInt(q.pageSize, 10) || 10));
      const start = (page - 1) * pageSize;
      const stop  = start + pageSize - 1;
      try {
        const ids = await rListRange(suburbListKey(state, slug), start, stop);
        const items = [];
        for (const id of ids) {
          const r = await rGet('review:' + id);
          if (r && r.status === 'approved') {
            items.push({
              id: r.id, rating: r.rating, title: r.title, body: r.body,
              userName: r.userName, created_at: r.created_at,
            });
          }
        }
        const agg = await rHGetAll(aggKey(state, slug));
        const count = parseInt(agg.count, 10) || 0;
        const sum   = parseInt(agg.sum, 10) || 0;
        const avg   = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
        return ok({ ok: true, items, page, pageSize, totalCount: count, avg });
      } catch (e) {
        console.error('[reviews] list error:', e.message);
        return fail('Failed to load reviews: ' + e.message, 500);
      }
    }

    if (action === 'buildFetch') {
      // Admin-only: dump approved reviews for a list of suburbs at build time.
      // Body would be large via GET, so we accept CSV or a single suburb here;
      // for multi-suburb bulk use POST variant below.
      const admin = await verifyAdmin(authHeader);
      if (!admin) return fail('Admin access required', 401);
      const state = cleanState(q.state);
      const slug  = cleanSlug(q.slug);
      if (!state || !slug) return fail('state and slug required');
      const limit = Math.min(50, parseInt(q.limit, 10) || 10);
      try {
        const ids = await rListRange(suburbListKey(state, slug), 0, limit - 1);
        const items = [];
        for (const id of ids) {
          const r = await rGet('review:' + id);
          if (r && r.status === 'approved') items.push(r);
        }
        const agg = await rHGetAll(aggKey(state, slug));
        return ok({ ok: true, items, agg: {
          count: parseInt(agg.count, 10) || 0,
          sum: parseInt(agg.sum, 10) || 0,
        }});
      } catch (e) {
        return fail('buildFetch error: ' + e.message, 500);
      }
    }

    return fail('Unknown GET action');
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if (event.httpMethod !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return fail('Invalid JSON', 400); }

  const action = body.action;
  if (!action) return fail('action required');

  // ── User-facing: submit a review ───────────────────────────────────
  if (action === 'submitReview') {
    const user = await verifyToken(authHeader);
    if (!user) return fail('Please sign in to leave a review', 401);

    const state = cleanState(body.state);
    const slug  = cleanSlug(body.suburbSlug);
    if (!state || !slug) return fail('state and suburbSlug required');

    const rating = parseInt(body.rating, 10);
    if (!(rating >= 1 && rating <= 5)) return fail('Rating must be 1–5 stars');

    const title = String(body.title || '').trim();
    if (title.length < 4 || title.length > 120) return fail('Title must be 4–120 characters');

    const bodyText = String(body.body || '').trim();
    if (bodyText.length < 100) return fail('Review must be at least 100 characters');
    if (bodyText.length > 4000) return fail('Review must be under 4000 characters');

    // Rate limits ----------------------------------------------------
    try {
      const clientIp = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      const ipKey = 'ratelimit:reviews:' + clientIp;
      const ipCount = parseInt(await redisCmd('INCR', ipKey), 10);
      if (ipCount === 1) await redisCmd('EXPIRE', ipKey, '3600');
      if (ipCount > 10) return fail('Too many submissions — please try again later', 429);

      const userDayKey = 'reviews:userCount:' + user.userId + ':' + todayKey();
      const userCount = parseInt(await redisCmd('INCR', userDayKey), 10);
      if (userCount === 1) await redisCmd('EXPIRE', userDayKey, '86400');
      if (userCount > 3) return fail('You have reached the daily review limit (3/day)', 429);
    } catch(e) { console.warn('[reviews] rate limit error:', e.message); }

    const review = {
      id: newId(),
      suburbSlug: slug,
      state,
      userId: user.userId,
      userName: escHtml(user.name || user.email || 'Anonymous').slice(0, 60),
      rating,
      title: escHtml(title),
      body: escHtml(bodyText),
      created_at: Date.now(),
      status: 'pending',
    };

    try {
      await rSet('review:' + review.id, review);
      await rListPrepend('reviews:queue', review.id);
      await rListPrepend('reviews:all', review.id);
      return ok({ ok: true, id: review.id, status: 'pending',
                  message: 'Thanks — your review is pending moderation.' });
    } catch (e) {
      return fail('Failed to save review: ' + e.message, 500);
    }
  }

  // ── Admin actions ──────────────────────────────────────────────────
  const admin = await verifyAdmin(authHeader);
  if (!admin) return fail('Admin access required', 401);

  if (action === 'adminPending') {
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(body.pageSize, 10) || 25));
    const start = (page - 1) * pageSize;
    const stop  = start + pageSize - 1;
    try {
      const ids = await rListRange('reviews:queue', start, stop);
      const items = [];
      for (const id of ids) {
        const r = await rGet('review:' + id);
        if (r) items.push(r);
      }
      const totalRaw = await redisCmd('LLEN', 'reviews:queue');
      return ok({ ok: true, items, page, pageSize, total: parseInt(totalRaw, 10) || 0 });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminListAll') {
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(body.pageSize, 10) || 50));
    const start = (page - 1) * pageSize;
    const stop  = start + pageSize - 1;
    try {
      const ids = await rListRange('reviews:all', start, stop);
      const items = [];
      for (const id of ids) {
        const r = await rGet('review:' + id);
        if (r) items.push(r);
      }
      const totalRaw = await redisCmd('LLEN', 'reviews:all');
      return ok({ ok: true, items, page, pageSize, total: parseInt(totalRaw, 10) || 0 });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminApprove') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    try {
      const r = await rGet('review:' + id);
      if (!r) return fail('Review not found', 404);
      if (r.status === 'approved') return ok({ ok: true, already: true });
      r.status = 'approved';
      r.approved_at = Date.now();
      await rSet('review:' + id, r);
      await rListRemove('reviews:queue', id);
      await rListPrepend(suburbListKey(r.state, r.suburbSlug), id);
      await rHIncrBy(aggKey(r.state, r.suburbSlug), 'count', 1);
      await rHIncrBy(aggKey(r.state, r.suburbSlug), 'sum', r.rating);
      return ok({ ok: true });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminReject') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    try {
      const r = await rGet('review:' + id);
      if (!r) return fail('Review not found', 404);
      if (r.status === 'approved') {
        await rListRemove(suburbListKey(r.state, r.suburbSlug), id);
        await rHIncrBy(aggKey(r.state, r.suburbSlug), 'count', -1);
        await rHIncrBy(aggKey(r.state, r.suburbSlug), 'sum', -r.rating);
      }
      r.status = 'rejected';
      r.rejected_at = Date.now();
      await rSet('review:' + id, r);
      await rListRemove('reviews:queue', id);
      return ok({ ok: true });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminDeleteReview') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    try {
      const r = await rGet('review:' + id);
      if (!r) return ok({ ok: true, alreadyGone: true });
      if (r.status === 'approved') {
        await rListRemove(suburbListKey(r.state, r.suburbSlug), id);
        await rHIncrBy(aggKey(r.state, r.suburbSlug), 'count', -1);
        await rHIncrBy(aggKey(r.state, r.suburbSlug), 'sum', -r.rating);
      }
      await rListRemove('reviews:queue', id);
      await rListRemove('reviews:all', id);
      await redisCmd('DEL', 'review:' + id);
      return ok({ ok: true });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminGet') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    const r = await rGet('review:' + id);
    return ok({ ok: true, review: r || null });
  }

  return fail('Unknown action');
};

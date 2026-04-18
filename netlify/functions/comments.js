/**
 * comments.js — Netlify Function
 * Blog post comments (flat threading, moderated).
 *
 * AUTH:
 *   - Public GET: list approved comments for a post
 *   - User POST (Bearer token): submitComment (20–2000 char body, rate limited)
 *   - Admin POST (Bearer token + role=admin): adminPending, adminListAll,
 *     adminApprove, adminReject, adminDeleteComment, adminGet
 *
 * Redis keys:
 *   comment:<id>                            → full comment JSON
 *   comments:<postSlug>                     → LIST of approved comment IDs (newest first)
 *   comments:queue                          → LIST of pending IDs (newest first)
 *   comments:all                            → LIST of every comment ID (for admin browse)
 *   comments:userCount:<userId>:<YYYYMMDD>  → INCR+EXPIRE 86400, cap 5/day
 *   ratelimit:comments:<ip>                 → INCR+EXPIRE 3600, cap 10/hour
 *
 * Comment schema:
 *   { id, postSlug, userId, userName, body, created_at,
 *     status: 'pending'|'approved'|'rejected', approved_at?, rejected_at? }
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
async function rLen(key) {
  const r = await redisCmd('LLEN', key);
  return parseInt(r, 10) || 0;
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

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cleanSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120); }
function newId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function todayKey() {
  const d = new Date();
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}
function postListKey(slug) { return 'comments:' + slug; }

// ── Handler ────────────────────────────────────────────────────────────
exports.handler = async function(event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'GET' && !isAllowedOrigin(event)) return fail('Forbidden', 403);

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error('[comments] Missing UPSTASH env vars');
    return fail('Storage not configured', 500);
  }

  // ── GET — public list + build-time admin fetch ──────────────────────
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const action = q.action || 'list';

    if (action === 'list') {
      const slug = cleanSlug(q.slug);
      if (!slug) return fail('slug required');
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize, 10) || 20));
      const start = (page - 1) * pageSize;
      const stop  = start + pageSize - 1;
      try {
        const ids = await rListRange(postListKey(slug), start, stop);
        const items = [];
        for (const id of ids) {
          const c = await rGet('comment:' + id);
          if (c && c.status === 'approved') {
            items.push({
              id: c.id, body: c.body, userName: c.userName, created_at: c.created_at,
            });
          }
        }
        const totalCount = await rLen(postListKey(slug));
        return ok({ ok: true, items, page, pageSize, totalCount });
      } catch (e) {
        console.error('[comments] list error:', e.message);
        return fail('Failed to load comments: ' + e.message, 500);
      }
    }

    if (action === 'buildFetch') {
      // Admin-only: dump approved comments for a single post at build time.
      const admin = await verifyAdmin(event);
      if (!admin) return fail('Admin access required', 401);
      const slug = cleanSlug(q.slug);
      if (!slug) return fail('slug required');
      const limit = Math.min(100, parseInt(q.limit, 10) || 50);
      try {
        const ids = await rListRange(postListKey(slug), 0, limit - 1);
        const items = [];
        for (const id of ids) {
          const c = await rGet('comment:' + id);
          if (c && c.status === 'approved') items.push(c);
        }
        const totalCount = await rLen(postListKey(slug));
        return ok({ ok: true, items, totalCount });
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

  // ── User-facing: submit a comment ──────────────────────────────────
  if (action === 'submitComment') {
    const user = await verifyToken(event);
    if (!user) return fail('Please sign in to leave a comment', 401);

    const slug = cleanSlug(body.postSlug);
    if (!slug) return fail('postSlug required');

    const bodyText = String(body.body || '').trim();
    if (bodyText.length < 20) return fail('Comment must be at least 20 characters');
    if (bodyText.length > 2000) return fail('Comment must be under 2000 characters');

    // Rate limits ----------------------------------------------------
    try {
      const clientIp = (event.headers['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
      const ipKey = 'ratelimit:comments:' + clientIp;
      const ipCount = parseInt(await redisCmd('INCR', ipKey), 10);
      if (ipCount === 1) await redisCmd('EXPIRE', ipKey, '3600');
      if (ipCount > 10) return fail('Too many submissions — please try again later', 429);

      const userDayKey = 'comments:userCount:' + user.userId + ':' + todayKey();
      const userCount = parseInt(await redisCmd('INCR', userDayKey), 10);
      if (userCount === 1) await redisCmd('EXPIRE', userDayKey, '86400');
      if (userCount > 5) return fail('You have reached the daily comment limit (5/day)', 429);
    } catch(e) { console.warn('[comments] rate limit error:', e.message); }

    const comment = {
      id: newId(),
      postSlug: slug,
      userId: user.userId,
      userName: escHtml(user.name || user.email || 'Anonymous').slice(0, 60),
      body: escHtml(bodyText),
      created_at: Date.now(),
      status: 'pending',
    };

    try {
      await rSet('comment:' + comment.id, comment);
      await rListPrepend('comments:queue', comment.id);
      await rListPrepend('comments:all', comment.id);
      return ok({ ok: true, id: comment.id, status: 'pending',
                  message: 'Thanks — your comment is pending moderation.' });
    } catch (e) {
      return fail('Failed to save comment: ' + e.message, 500);
    }
  }

  // ── Admin actions ──────────────────────────────────────────────────
  const admin = await verifyAdmin(event);
  if (!admin) return fail('Admin access required', 401);

  if (action === 'adminPending') {
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(body.pageSize, 10) || 25));
    const start = (page - 1) * pageSize;
    const stop  = start + pageSize - 1;
    try {
      const ids = await rListRange('comments:queue', start, stop);
      const items = [];
      for (const id of ids) {
        const c = await rGet('comment:' + id);
        if (c) items.push(c);
      }
      const total = await rLen('comments:queue');
      return ok({ ok: true, items, page, pageSize, total });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminListAll') {
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(body.pageSize, 10) || 50));
    const start = (page - 1) * pageSize;
    const stop  = start + pageSize - 1;
    try {
      const ids = await rListRange('comments:all', start, stop);
      const items = [];
      for (const id of ids) {
        const c = await rGet('comment:' + id);
        if (c) items.push(c);
      }
      const total = await rLen('comments:all');
      return ok({ ok: true, items, page, pageSize, total });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminApprove') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    try {
      const c = await rGet('comment:' + id);
      if (!c) return fail('Comment not found', 404);
      if (c.status === 'approved') return ok({ ok: true, already: true });
      c.status = 'approved';
      c.approved_at = Date.now();
      await rSet('comment:' + id, c);
      await rListRemove('comments:queue', id);
      await rListPrepend(postListKey(c.postSlug), id);
      return ok({ ok: true });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminReject') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    try {
      const c = await rGet('comment:' + id);
      if (!c) return fail('Comment not found', 404);
      if (c.status === 'approved') {
        await rListRemove(postListKey(c.postSlug), id);
      }
      c.status = 'rejected';
      c.rejected_at = Date.now();
      await rSet('comment:' + id, c);
      await rListRemove('comments:queue', id);
      return ok({ ok: true });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminDeleteComment') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    try {
      const c = await rGet('comment:' + id);
      if (!c) return ok({ ok: true, alreadyGone: true });
      if (c.status === 'approved') {
        await rListRemove(postListKey(c.postSlug), id);
      }
      await rListRemove('comments:queue', id);
      await rListRemove('comments:all', id);
      await redisCmd('DEL', 'comment:' + id);
      return ok({ ok: true });
    } catch (e) { return fail('Error: ' + e.message, 500); }
  }

  if (action === 'adminGet') {
    const id = String(body.id || '').trim();
    if (!id) return fail('id required');
    const c = await rGet('comment:' + id);
    return ok({ ok: true, comment: c || null });
  }

  return fail('Unknown action');
};

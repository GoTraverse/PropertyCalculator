/**
 * blog.js — Netlify Function
 * Human-authored blog posts, stored in Upstash Redis, edited via admin.html.
 *
 * Rendered statically at build time by build/build-blog.js — this function is
 * therefore only hit by (a) admin UI CRUD traffic, (b) the build step pulling
 * the latest published posts. Public readers hit the static /blog/<slug>/ HTML.
 *
 * AUTH: Bearer token — all admin actions require session.role === 'admin'.
 *
 * Redis keys:
 *   blog:post:<id>          → full post JSON
 *   blog:slug:<slug>        → id   (unique slug index)
 *   blog:index              → list of all post IDs (newest first)
 *   blog:published          → list of published post IDs (newest first)
 *   blog:tag:<tag>          → list of post IDs (newest first) for a tag
 *
 * Post schema:
 *   { id, slug, title, excerpt, body_md, author, author_bio, author_email,
 *     cover_image, tags: [], status: 'draft'|'published',
 *     published_at, updated_at, created_at, comment_count }
 */
'use strict';

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
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}
let H = {};

// ── Redis ─────────────────────────────────────────────────────────────
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
  try { return JSON.parse(raw); } catch (e) { return raw; }
}
async function rSet(key, val) {
  return redisCmd('SET', key, typeof val === 'string' ? val : JSON.stringify(val));
}
async function rDel(key) { return redisCmd('DEL', key); }

// Helper: read a Redis LIST, newest-first, as an array.
async function rListGet(key) {
  try {
    const res = await redisCmd('LRANGE', key, '0', '-1');
    return Array.isArray(res) ? res : [];
  } catch (e) { return []; }
}
async function rListPrepend(key, val) { return redisCmd('LPUSH', key, String(val)); }
async function rListRemove(key, val) { return redisCmd('LREM', key, '0', String(val)); }

// ── Token verification ────────────────────────────────────────────────
async function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const raw = await redisCmd('GET', 'token:' + token);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return null; }
  if (data.expires && Date.now() > data.expires) { await redisCmd('DEL', 'token:' + token); return null; }
  if (data.email) {
    const u = await redisCmd('GET', 'user:' + data.email);
    if (!u) return null;
  }
  return data;
}
async function verifyAdmin(authHeader) {
  const data = await verifyToken(authHeader);
  if (!data || data.role !== 'admin') return null;
  return data;
}

function ok(b) { return { statusCode: 200, headers: H, body: JSON.stringify(b) }; }
function fail(msg, code) { return { statusCode: code || 200, headers: H, body: JSON.stringify({ ok: false, error: msg }) }; }

// ── Helpers ────────────────────────────────────────────────────────────
function makeSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}
function nowMs() { return Date.now(); }
function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function parseTags(input) {
  if (Array.isArray(input)) return input.slice(0, 6).map(t => String(t).trim().toLowerCase()).filter(Boolean);
  return String(input || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
}
function validatePost(p) {
  if (!p || typeof p !== 'object') return 'post required';
  if (!p.title || p.title.length < 4) return 'title must be at least 4 chars';
  if (p.title.length > 200) return 'title must be under 200 chars';
  if (!p.body_md || p.body_md.length < 200) return 'body_md must be at least 200 chars';
  if (p.body_md.length > 200000) return 'body_md too large (max 200 KB)';
  return null;
}
function sanitizePost(p) {
  // Strip anything that shouldn't round-trip
  return {
    id: p.id,
    slug: p.slug,
    title: String(p.title || '').trim(),
    excerpt: String(p.excerpt || '').trim().slice(0, 400),
    body_md: String(p.body_md || ''),
    author: String(p.author || '').trim().slice(0, 80),
    author_bio: String(p.author_bio || '').trim().slice(0, 400),
    author_email: String(p.author_email || '').trim().slice(0, 120),
    cover_image: String(p.cover_image || '').trim().slice(0, 400),
    tags: parseTags(p.tags),
    status: p.status === 'published' ? 'published' : 'draft',
    created_at: p.created_at || nowMs(),
    updated_at: nowMs(),
    published_at: p.published_at || null,
    comment_count: Number(p.comment_count || 0),
  };
}

// ── Handler ───────────────────────────────────────────────────────────
exports.handler = async function (event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  if (!REDIS_URL || !REDIS_TOKEN) {
    return fail('Storage not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.', 500);
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  let body = null;
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { return fail('Bad request body', 400); }
  }

  // ── GET public endpoints ─────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};

    // Public: list published posts
    if (q.action === 'list' || !q.action) {
      try {
        const ids = await rListGet('blog:published');
        const limit = Math.min(Number(q.limit) || 50, 100);
        const ids2 = ids.slice(0, limit);
        const posts = [];
        for (const id of ids2) {
          const p = await rGet('blog:post:' + id);
          if (p && p.status === 'published') {
            // Return lightweight card fields only
            posts.push({
              id: p.id, slug: p.slug, title: p.title, excerpt: p.excerpt,
              author: p.author, published_at: p.published_at,
              tags: p.tags || [], cover_image: p.cover_image || '',
            });
          }
        }
        return ok({ ok: true, posts });
      } catch (e) { return fail('list failed: ' + e.message, 500); }
    }

    // Public: get single post by slug
    if (q.action === 'get' && q.slug) {
      try {
        const id = await redisCmd('GET', 'blog:slug:' + makeSlug(q.slug));
        if (!id) return fail('Post not found', 404);
        const p = await rGet('blog:post:' + id);
        if (!p || p.status !== 'published') return fail('Post not found', 404);
        return ok({ ok: true, post: p });
      } catch (e) { return fail('get failed: ' + e.message, 500); }
    }

    // Admin: build-time fetch of all posts (including drafts optionally)
    if (q.action === 'buildFetch') {
      const admin = await verifyAdmin(authHeader);
      if (!admin) return fail('Admin access required', 401);
      try {
        const ids = await rListGet('blog:index');
        const posts = [];
        for (const id of ids) {
          const p = await rGet('blog:post:' + id);
          if (p) posts.push(p);
        }
        return ok({ ok: true, posts });
      } catch (e) { return fail('buildFetch failed: ' + e.message, 500); }
    }

    return fail('Unknown GET action', 400);
  }

  // ── POST (admin + build) ─────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    if (!body) return fail('Request body required', 400);
    const { action } = body;

    // All POST actions require admin
    const admin = await verifyAdmin(authHeader);
    if (!admin) return fail('Admin access required', 401);

    if (action === 'adminListPosts') {
      try {
        const ids = await rListGet('blog:index');
        const posts = [];
        for (const id of ids) {
          const p = await rGet('blog:post:' + id);
          if (p) {
            posts.push({
              id: p.id, slug: p.slug, title: p.title, status: p.status,
              author: p.author, tags: p.tags || [],
              created_at: p.created_at, updated_at: p.updated_at,
              published_at: p.published_at, comment_count: p.comment_count || 0,
            });
          }
        }
        return ok({ ok: true, posts });
      } catch (e) { return fail('list failed: ' + e.message, 500); }
    }

    if (action === 'adminGetPost') {
      const { id } = body;
      if (!id) return fail('id required');
      try {
        const p = await rGet('blog:post:' + id);
        if (!p) return fail('Post not found', 404);
        return ok({ ok: true, post: p });
      } catch (e) { return fail('get failed: ' + e.message, 500); }
    }

    if (action === 'adminSavePost') {
      const { post } = body;
      const err = validatePost(post);
      if (err) return fail(err);

      // Resolve slug — explicit slug or derived from title. Ensure uniqueness.
      let slug = makeSlug(post.slug || post.title);
      if (!slug) return fail('slug could not be derived from title');

      try {
        const existingIdForSlug = await redisCmd('GET', 'blog:slug:' + slug);
        let id = post.id;
        if (!id) {
          // Create flow — slug must be unique
          if (existingIdForSlug) return fail('Slug already in use — choose another');
          id = newId();
          post.id = id;
        } else if (existingIdForSlug && existingIdForSlug !== id) {
          return fail('Slug already in use by another post');
        }

        // If editing, release old slug if it changed
        const oldPost = await rGet('blog:post:' + id);
        if (oldPost && oldPost.slug && oldPost.slug !== slug) {
          await rDel('blog:slug:' + oldPost.slug);
        }

        const clean = sanitizePost({ ...post, slug });

        // Tag index maintenance
        const oldTags = (oldPost && oldPost.tags) || [];
        const removedTags = oldTags.filter(t => !clean.tags.includes(t));
        const addedTags = clean.tags.filter(t => !oldTags.includes(t));
        for (const t of removedTags) { await rListRemove('blog:tag:' + t, id); }
        for (const t of addedTags)   { await rListPrepend('blog:tag:' + t, id); }

        await rSet('blog:post:' + id, clean);
        await redisCmd('SET', 'blog:slug:' + slug, id);

        // Ensure id is in the main index
        if (!oldPost) {
          await rListPrepend('blog:index', id);
        }

        return ok({ ok: true, id, slug });
      } catch (e) { return fail('save failed: ' + e.message, 500); }
    }

    if (action === 'adminPublish') {
      const { id } = body;
      if (!id) return fail('id required');
      try {
        const p = await rGet('blog:post:' + id);
        if (!p) return fail('Post not found', 404);
        p.status = 'published';
        p.published_at = p.published_at || nowMs();
        p.updated_at = nowMs();
        await rSet('blog:post:' + id, p);
        // Ensure it's in published list (remove first to dedupe, then prepend)
        await rListRemove('blog:published', id);
        await rListPrepend('blog:published', id);
        return ok({ ok: true });
      } catch (e) { return fail('publish failed: ' + e.message, 500); }
    }

    if (action === 'adminUnpublish') {
      const { id } = body;
      if (!id) return fail('id required');
      try {
        const p = await rGet('blog:post:' + id);
        if (!p) return fail('Post not found', 404);
        p.status = 'draft';
        p.updated_at = nowMs();
        await rSet('blog:post:' + id, p);
        await rListRemove('blog:published', id);
        return ok({ ok: true });
      } catch (e) { return fail('unpublish failed: ' + e.message, 500); }
    }

    if (action === 'adminDeletePost') {
      const { id } = body;
      if (!id) return fail('id required');
      try {
        const p = await rGet('blog:post:' + id);
        if (p) {
          if (p.slug) await rDel('blog:slug:' + p.slug);
          for (const t of (p.tags || [])) { await rListRemove('blog:tag:' + t, id); }
        }
        await rDel('blog:post:' + id);
        await rListRemove('blog:index', id);
        await rListRemove('blog:published', id);
        return ok({ ok: true });
      } catch (e) { return fail('delete failed: ' + e.message, 500); }
    }

    return fail('Unknown action');
  }

  return fail('Method not allowed', 405);
};

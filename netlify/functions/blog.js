/**
 * blog.js — Netlify Function
 * Human-authored blog posts, stored in Upstash Redis, edited via admin.html.
 *
 * Published posts are also committed as JSON files to the GitHub repo
 * (data/blog-posts/{slug}.json). This triggers Netlify's auto-deploy so
 * posts appear on the site without a manual rebuild. At build time,
 * build-blog.js reads from the filesystem first, falling back to Redis.
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
  try { data = JSON.parse(raw); } catch (e) { return null; }
  if (data.expires && Date.now() > data.expires) { await redisCmd('DEL', 'token:' + token); return null; }
  if (data.email) {
    const u = await redisCmd('GET', 'user:' + data.email);
    if (!u) return null;
  }
  return data;
}
async function verifyAdmin(event) {
  const data = await verifyToken(event);
  if (!data || data.role !== 'admin') return null;
  return data;
}

// ── GitHub file sync (publish commits post JSON to the repo) ──────────
const GH_TOKEN  = (process.env.GITHUB_TOKEN || '').trim();
const GH_REPO   = (process.env.GITHUB_REPO || 'GoTraverse/PropertyCalculator').trim();
const GH_API    = 'https://api.github.com';
const GH_BRANCH = 'main';
const GH_HEADERS = GH_TOKEN ? {
  Authorization: 'token ' + GH_TOKEN,
  'User-Agent': 'EquitySight-Blog',
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github.v3+json',
} : null;

async function commitPostToGitHub(post) {
  if (!GH_HEADERS) return; // GITHUB_TOKEN not configured — skip silently
  const filePath = 'data/blog-posts/' + post.slug + '.json';
  const content = Buffer.from(JSON.stringify(post, null, 2)).toString('base64');
  // Get existing file SHA (required for updates)
  let sha;
  try {
    const r = await fetch(GH_API + '/repos/' + GH_REPO + '/contents/' + filePath + '?ref=' + GH_BRANCH, { headers: GH_HEADERS });
    if (r.ok) sha = (await r.json()).sha;
  } catch (e) { /* file doesn't exist yet */ }
  const putBody = { message: 'Publish: ' + post.title, content, branch: GH_BRANCH };
  if (sha) putBody.sha = sha;
  try {
    await fetch(GH_API + '/repos/' + GH_REPO + '/contents/' + filePath, {
      method: 'PUT', headers: GH_HEADERS, body: JSON.stringify(putBody),
    });
  } catch (e) { console.error('[blog] GitHub commit failed:', e.message); }
}

async function deletePostFromGitHub(slug) {
  if (!GH_HEADERS) return;
  const filePath = 'data/blog-posts/' + slug + '.json';
  let sha;
  try {
    const r = await fetch(GH_API + '/repos/' + GH_REPO + '/contents/' + filePath + '?ref=' + GH_BRANCH, { headers: GH_HEADERS });
    if (!r.ok) return; // file doesn't exist — nothing to delete
    sha = (await r.json()).sha;
  } catch (e) { return; }
  try {
    await fetch(GH_API + '/repos/' + GH_REPO + '/contents/' + filePath, {
      method: 'DELETE', headers: GH_HEADERS,
      body: JSON.stringify({ message: 'Unpublish: ' + slug, sha, branch: GH_BRANCH }),
    });
  } catch (e) { console.error('[blog] GitHub delete failed:', e.message); }
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
// Default sections pre-populated on first use.
const DEFAULT_SECTIONS = ['general', 'guides', 'market-insights', 'calculator-tips', 'suburb-spotlights', 'news'];
function validSectionSlug(s) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(s || ''));
}
function sanitizePost(p) {
  const rawSection = String(p.section || p.category || 'general').trim().toLowerCase().replace(/\s+/g, '-');
  const section = validSectionSlug(rawSection) ? rawSection : 'general';
  return {
    id: p.id,
    slug: p.slug,
    section,
    title: String(p.title || '').trim(),
    excerpt: String(p.excerpt || '').trim().slice(0, 400),
    meta_description: String(p.meta_description || '').trim().slice(0, 200),
    body_md: String(p.body_md || ''),
    author: String(p.author || '').trim().slice(0, 80),
    author_bio: String(p.author_bio || '').trim().slice(0, 400),
    author_email: String(p.author_email || '').trim().slice(0, 120),
    cover_image: String(p.cover_image || '').trim().slice(0, 400),
    tags: parseTags(p.tags),
    featured: !!p.featured,
    status: p.status === 'published' ? 'published' : 'draft',
    created_at: p.created_at || nowMs(),
    updated_at: nowMs(),
    published_at: p.published_at || null,
    comment_count: Number(p.comment_count || 0),
  };
}
async function getSections() {
  try {
    const raw = await redisCmd('GET', 'blog:sections');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* fall through */ }
  // First call — seed defaults
  await redisCmd('SET', 'blog:sections', JSON.stringify(DEFAULT_SECTIONS));
  return DEFAULT_SECTIONS;
}

// ── Handler ───────────────────────────────────────────────────────────
exports.handler = async function (event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'GET' && !isAllowedOrigin(event)) return fail('Forbidden', 403);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return fail('Storage not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.', 500);
  }

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
      const admin = await verifyAdmin(event);
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
    const admin = await verifyAdmin(event);
    if (!admin) return fail('Admin access required', 401);

    if (action === 'adminListPosts') {
      try {
        const ids = await rListGet('blog:index');
        const posts = [];
        for (const id of ids) {
          const p = await rGet('blog:post:' + id);
          if (p) {
            posts.push({
              id: p.id, slug: p.slug, section: p.section || 'general',
              title: p.title, status: p.status,
              author: p.author, tags: p.tags || [],
              created_at: p.created_at, updated_at: p.updated_at,
              published_at: p.published_at, comment_count: p.comment_count || 0,
            });
          }
        }
        return ok({ ok: true, posts });
      } catch (e) { return fail('list failed: ' + e.message, 500); }
    }

    if (action === 'adminListSections') {
      try {
        const sections = await getSections();
        return ok({ ok: true, sections });
      } catch (e) { return fail('listSections failed: ' + e.message, 500); }
    }

    if (action === 'adminCreateSection') {
      const { name } = body;
      const slug = String(name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slug || !validSectionSlug(slug)) return fail('Invalid section name');
      if (slug.length > 50) return fail('Section name too long');
      try {
        const sections = await getSections();
        if (sections.includes(slug)) return ok({ ok: true, sections, existing: true });
        sections.push(slug);
        await redisCmd('SET', 'blog:sections', JSON.stringify(sections));
        return ok({ ok: true, sections, slug });
      } catch (e) { return fail('createSection failed: ' + e.message, 500); }
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
        const oldPost = post.id ? await rGet('blog:post:' + post.id) : null;
        const id = oldPost ? post.id : newId();
        post.id = id;

        // Only re-claim the slug key when the slug is new or changed. Use
        // SET NX so two concurrent saves can't both succeed on the same slug.
        const slugChanged = !oldPost || oldPost.slug !== slug;
        if (slugChanged) {
          const claimed = await redisCmd('SET', 'blog:slug:' + slug, id, 'NX');
          if (claimed !== 'OK') {
            // Allow a retry where this same post already owns the slug.
            const currentOwner = await redisCmd('GET', 'blog:slug:' + slug);
            if (currentOwner !== id) return fail('Slug already in use — choose another');
          }
          if (oldPost && oldPost.slug) await rDel('blog:slug:' + oldPost.slug);
        }

        const clean = sanitizePost({ ...post, slug });

        // Tag index maintenance
        const oldTags = (oldPost && oldPost.tags) || [];
        const removedTags = oldTags.filter(t => !clean.tags.includes(t));
        const addedTags = clean.tags.filter(t => !oldTags.includes(t));
        for (const t of removedTags) { await rListRemove('blog:tag:' + t, id); }
        for (const t of addedTags)   { await rListPrepend('blog:tag:' + t, id); }

        await rSet('blog:post:' + id, clean);

        // Ensure id is in the main index
        if (!oldPost) {
          await rListPrepend('blog:index', id);
        }

        // If this post was previously published, handle GitHub file updates
        if (oldPost && oldPost.status === 'published') {
          if (oldPost.slug && oldPost.slug !== slug) {
            await deletePostFromGitHub(oldPost.slug);
          }
          await commitPostToGitHub(clean);
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
        // Commit to GitHub → triggers Netlify auto-deploy
        await commitPostToGitHub(p);
        return ok({ ok: true });
      } catch (e) { return fail('publish failed: ' + e.message, 500); }
    }

    if (action === 'adminUnpublish') {
      const { id } = body;
      if (!id) return fail('id required');
      try {
        const p = await rGet('blog:post:' + id);
        if (!p) return fail('Post not found', 404);
        const slug = p.slug;
        p.status = 'draft';
        p.updated_at = nowMs();
        await rSet('blog:post:' + id, p);
        await rListRemove('blog:published', id);
        // Remove from GitHub → triggers Netlify auto-deploy
        await deletePostFromGitHub(slug);
        return ok({ ok: true });
      } catch (e) { return fail('unpublish failed: ' + e.message, 500); }
    }

    if (action === 'adminDeletePost') {
      const { id } = body;
      if (!id) return fail('id required');
      try {
        const p = await rGet('blog:post:' + id);
        if (p) {
          if (p.slug) {
            await rDel('blog:slug:' + p.slug);
            await deletePostFromGitHub(p.slug);
          }
          for (const t of (p.tags || [])) { await rListRemove('blog:tag:' + t, id); }
        }
        await rDel('blog:post:' + id);
        await rListRemove('blog:index', id);
        await rListRemove('blog:published', id);
        return ok({ ok: true });
      } catch (e) { return fail('delete failed: ' + e.message, 500); }
    }

    // Sync all published posts to GitHub (migration helper)
    if (action === 'adminSyncAllToGitHub') {
      if (!GH_HEADERS) return fail('GITHUB_TOKEN not configured');
      try {
        const ids = await rListGet('blog:published');
        let synced = 0;
        for (const id of ids) {
          const p = await rGet('blog:post:' + id);
          if (p && p.status === 'published' && p.slug) {
            await commitPostToGitHub(p);
            synced++;
          }
        }
        return ok({ ok: true, synced });
      } catch (e) { return fail('sync failed: ' + e.message, 500); }
    }

    return fail('Unknown action');
  }

  return fail('Method not allowed', 405);
};

/**
 * build/build-blog.js — Static blog renderer.
 *
 * Pulls published posts from Upstash Redis (same env vars as the Netlify
 * functions) and emits static HTML into /blog/. Pages are fully static so
 * Googlebot + AdSense crawl them without JavaScript.
 *
 * Usage:
 *   node build/build-blog.js                  # build from Redis
 *   BLOG_FIXTURE=data/blog-fixture.json node build/build-blog.js
 *                                             # build from a local JSON fixture
 *                                             # (used when UPSTASH env vars absent)
 *   SKIP_BLOG_BUILD=true                      # skip entirely
 *
 * The build is idempotent — it rm -rf's /blog/ before writing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const md = require('./md');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const TEMPLATE_POST = path.join(ROOT, 'templates', 'blog-post.html');
const TEMPLATE_INDEX = path.join(ROOT, 'templates', 'blog-index.html');
const SITE_URL = 'https://equitysight.app';
// Slugify a tag the SAME way tag directories are written, so tag-pill hrefs and the
// sitemap URLs match the on-disk /blog/tag/<slug>/ path (was raw/encoded -> 404s).
function tagToSlug(t){ return String(t).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/^["']|["']$/g, '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();
const FIXTURE = process.env.BLOG_FIXTURE || '';
const SKIP = process.env.SKIP_BLOG_BUILD === 'true';
const PAGE_SIZE = 12;
// AdSense E-E-A-T floor. Posts shorter than this render but are marked noindex
// and excluded from sitemap, RSS, and the paged index. Default is 1200 (a
// realistic threshold against the current published set); raise to 1500 once
// every published post clears the AdSense long-form recommendation.
// Override via BLOG_MIN_WORDS env var.
const MIN_WORDS = parseInt(process.env.BLOG_MIN_WORDS || '1200', 10);

// ── Redis REST helpers ────────────────────────────────────────────────
async function redisCmd(...args) {
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

// ── Fetch approved comments for a single post ────────────────────────
// Returns { items: [...], totalCount: N }.  Non-fatal — any failure just
// produces an empty list so the build continues.
async function fetchCommentsForPost(slug) {
  if (FIXTURE) return { items: [], totalCount: 0 }; // fixture builds skip comments
  if (!REDIS_URL || !REDIS_TOKEN) return { items: [], totalCount: 0 };
  try {
    const listKey = 'comments:' + slug;
    const ids = await redisCmd('LRANGE', listKey, '0', '19'); // first 20 static; rest paged client-side
    if (!Array.isArray(ids) || !ids.length) return { items: [], totalCount: 0 };
    const items = [];
    for (const id of ids) {
      const c = await rGet('comment:' + id);
      if (c && c.status === 'approved') {
        items.push({
          id: c.id,
          body: c.body,
          userName: c.userName,
          created_at: c.created_at,
        });
      }
    }
    const totalRaw = await redisCmd('LLEN', listKey);
    const totalCount = parseInt(totalRaw, 10) || items.length;
    return { items, totalCount };
  } catch (e) {
    console.warn('[build-blog] fetchCommentsForPost failed for', slug, '—', e.message);
    return { items: [], totalCount: 0 };
  }
}

// ── Fetch published posts ─────────────────────────────────────────────
// Priority: data/blog-posts/*.json (filesystem) → Redis → fixture → empty
function fetchPostsFromFilesystem() {
  const dir = path.join(ROOT, 'data', 'blog-posts');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return null;
  const posts = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const p = JSON.parse(raw);
      if (p && p.status === 'published') posts.push(p);
    } catch (e) {
      console.warn('[build-blog] Bad JSON in', f, '—', e.message);
    }
  }
  console.log('[build-blog] Read', posts.length, 'published post(s) from data/blog-posts/');
  return posts;
}

async function fetchPosts() {
  // 1. Filesystem (committed JSON files — fastest, no network)
  const fsPosts = fetchPostsFromFilesystem();
  if (fsPosts !== null && fsPosts.length > 0) return fsPosts;

  // 2. Fixture file (local dev / testing)
  if (FIXTURE) {
    const p = path.resolve(ROOT, FIXTURE);
    if (!fs.existsSync(p)) throw new Error('Fixture not found: ' + p);
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return raw.filter(x => x && x.status === 'published');
  }

  // 3. Redis (legacy — for repos not yet synced to filesystem)
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('[build-blog] No blog posts found (no files, no Redis) — producing an empty /blog/ index.');
    return [];
  }
  try {
    const ids = await redisCmd('LRANGE', 'blog:published', '0', '-1');
    if (!Array.isArray(ids) || !ids.length) return [];
    const posts = [];
    for (const id of ids) {
      const p = await rGet('blog:post:' + id);
      if (p && p.status === 'published') posts.push(p);
    }
    console.log('[build-blog] Read', posts.length, 'published post(s) from Redis (legacy mode)');
    return posts;
  } catch (e) {
    console.warn('[build-blog] Redis fetch failed:', e.message, '— producing an empty /blog/ index.');
    return [];
  }
}

// ── String helpers ────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escJsonString(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ');
}
function humanDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
}
function isoDate(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString();
}
function readingMinutes(mdText) {
  const words = md.wordCount(mdText || '');
  return Math.max(1, Math.round(words / 220));
}
function replaceAll(tmpl, vars) {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split('{{' + k + '}}').join(v == null ? '' : String(v));
  }
  return out;
}

// ── Render the approved-comments block (empty when count === 0) ──────
function renderCommentsBlock(postSlug, comments) {
  const items = Array.isArray(comments.items) ? comments.items : [];
  const count = parseInt(comments.totalCount, 10) || 0;
  if (count === 0 || items.length === 0) return '';
  const cardsHtml = items.map(c => {
    // body is stored pre-escaped; preserve newlines as <br>
    const bodyHtml = String(c.body || '').replace(/\n/g, '<br>');
    const date = c.created_at ? humanDate(c.created_at) : '';
    const name = c.userName || 'Anonymous';
    const initial = (name.trim().charAt(0) || 'A').toUpperCase();
    return '<article class="blog-comment-card" data-initial="' + escHtml(initial) + '">' +
        '<header class="blog-comment-head">' +
          '<span class="blog-comment-user">' + escHtml(name) + '</span>' +
          (date ? ' <span class="blog-comment-dot">·</span> <span class="blog-comment-date">' + escHtml(date) + '</span>' : '') +
        '</header>' +
        '<div class="blog-comment-body">' + bodyHtml + '</div>' +
      '</article>';
  }).join('');
  const heading = count === 1 ? '1 comment' : count + ' comments';
  return '<section class="blog-comments-section" id="blog-comments" data-total="' + count + '">' +
           '<h2 class="blog-comments-heading">' + heading + '</h2>' +
           '<div class="blog-comments-list" id="blog-comments-list">' + cardsHtml + '</div>' +
         '</section>';
}

// Derive a human-readable label from a section slug.
// e.g. 'market-insights' → 'Market Insights'
function sectionLabel(slug) {
  return String(slug || 'general')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
// URL for a post — always /blog/<section>/<slug>/
function postUrl(p) {
  const section = (p.section || 'general').replace(/[^a-z0-9-]/g, '');
  return '/blog/' + section + '/' + escHtml(p.slug) + '/';
}
function postUrlRaw(p) {
  const section = (p.section || 'general').replace(/[^a-z0-9-]/g, '');
  return '/blog/' + section + '/' + (p.slug || '') + '/';
}

// ── Render a single blog post → HTML ──────────────────────────────────
function isBelowWordGate(post) {
  return md.wordCount(post.body_md || '') < MIN_WORDS;
}

function renderPost(post, allPosts, template, commentsData, neighbours) {
  const bodyHtml = md.render(post.body_md || '', { toc: false });
  const excerpt = post.excerpt && post.excerpt.length
    ? post.excerpt
    : md.excerpt(post.body_md || '', 200);
  const metaDescription = (post.meta_description && post.meta_description.length >= 50
    ? post.meta_description
    : excerpt).replace(/\s+/g, ' ').slice(0, 200);
  const tagsHtml = (post.tags || []).map(t =>
    '<a class="blog-tag-pill" href="/blog/tag/' + tagToSlug(t) + '/">' + escHtml(t) + '</a>'
  ).join(' ');
  const primaryTag = (post.tags && post.tags[0]) ? post.tags[0] : 'Insights';
  const coverImageAbs = post.cover_image
    ? (post.cover_image.startsWith('http') ? post.cover_image : SITE_URL + post.cover_image)
    : SITE_URL + '/images/og-image.png';
  const coverImageHtml = post.cover_image
    ? '<img class="blog-cover" src="' + escHtml(post.cover_image) + '" alt="' + escHtml(post.title) + '" loading="lazy">'
    : '';

  // Related: pick up to 3 other published posts with tag overlap, fall back to
  // most recent.
  const related = (allPosts || [])
    .filter(p => p.id !== post.id && p.status === 'published')
    .map(p => ({
      p,
      overlap: (p.tags || []).filter(t => (post.tags || []).includes(t)).length,
    }))
    .sort((a, b) => (b.overlap - a.overlap) || ((b.p.published_at || 0) - (a.p.published_at || 0)))
    .slice(0, 3)
    .map(x => x.p);
  const relatedHtml = related.length ? related.map(rp => {
    const rExcerpt = (rp.excerpt && rp.excerpt.length) ? rp.excerpt : md.excerpt(rp.body_md || '', 110);
    return '<a class="blog-related-card" href="' + postUrl(rp) + '">' +
      '<div class="blog-related-card-title">' + escHtml(rp.title) + '</div>' +
      '<div class="blog-related-card-excerpt">' + escHtml(rExcerpt) + '</div>' +
    '</a>';
  }).join('') : '<p style="font-size:12px;color:rgba(28,28,30,0.5);">More posts coming soon.</p>';

  const keywords = (post.tags || []).concat(['Australian property', 'EquitySight']).join(', ');
  const commentsHtml = renderCommentsBlock(post.slug, commentsData || { items: [], totalCount: 0 });

  // Author identity. We only emit a schema.org Person — and a visible "About the
  // author" bio card — when there is a genuine, non-empty author bio to back it
  // up. Otherwise the post is attributed to the EquitySight Organization (no
  // invented person, degree, credential, or email anywhere in the output).
  const authorName = post.author || 'EquitySight';
  const authorBio = (post.author_bio || '').trim();
  const hasRealBio = authorBio.length > 0;
  const authorJsonLd = hasRealBio
    ? '{"@type":"Person","name":"' + escJsonString(authorName) + '","description":"' + escJsonString(authorBio) + '"}'
    : '{"@type":"Organization","name":"EquitySight","url":"' + SITE_URL + '/"}';
  const authorCardHtml = hasRealBio
    ? '<div class="blog-author-card">' +
        '<div class="blog-author-head">About the author</div>' +
        '<div class="blog-author-name">' + escHtml(authorName) + '</div>' +
        '<div class="blog-author-bio">' + escHtml(authorBio) + '</div>' +
      '</div>'
    : '';

  // Prev / Next (chronological — newest-first array, so prev=next index, next=prev index)
  const prev = neighbours && neighbours.prev;
  const next = neighbours && neighbours.next;
  let prevNextHtml = '';
  if (prev || next) {
    const cell = (p, label) => p
      ? '<a class="blog-adj-card blog-adj-' + label.toLowerCase() + '" href="' + postUrl(p) + '">' +
          '<div class="blog-adj-label">' + label + '</div>' +
          '<div class="blog-adj-title">' + escHtml(p.title) + '</div>' +
        '</a>'
      : '<div class="blog-adj-card blog-adj-empty"></div>';
    prevNextHtml = '<nav class="blog-adj-nav" aria-label="More articles">' +
      cell(prev, 'Previous') + cell(next, 'Next') +
    '</nav>';
  }

  // Section badge in hero
  const categoryLabel = sectionLabel(post.section || post.category || 'general');

  const robotsMeta = isBelowWordGate(post) ? 'noindex, follow' : 'index, follow';

  // Section slug for canonical/og:url/JSON-LD — MUST match the served path
  // (/blog/<section>/<slug>/) and the sitemap, or Google sees a canonical
  // mismatch and parks the post under "crawled, currently not indexed".
  const sectionSlug = (post.section || 'general').replace(/[^a-z0-9-]/g, '') || 'general';

  return replaceAll(template, {
    ROBOTS_META: robotsMeta,
    TITLE: escHtml(post.title),
    TITLE_JSON: escJsonString(post.title),
    META_DESCRIPTION: escHtml(metaDescription),
    META_DESCRIPTION_JSON: escJsonString(metaDescription),
    KEYWORDS: escHtml(keywords),
    SECTION: sectionSlug,
    SLUG: escHtml(post.slug),
    AUTHOR: escHtml(authorName),
    AUTHOR_JSON: escJsonString(authorName),
    AUTHOR_JSON_LD: authorJsonLd,
    AUTHOR_CARD_HTML: authorCardHtml,
    PUBLISHED_AT_ISO: isoDate(post.published_at || post.created_at),
    PUBLISHED_AT_HUMAN: humanDate(post.published_at || post.created_at),
    UPDATED_AT_ISO: isoDate(post.updated_at || post.published_at || post.created_at),
    READING_MINUTES: String(readingMinutes(post.body_md)),
    WORD_COUNT: String(md.wordCount(post.body_md || '')),
    PRIMARY_TAG: escHtml(primaryTag),
    COVER_IMAGE_ABS: escHtml(coverImageAbs),
    COVER_IMAGE_HTML: coverImageHtml,
    EXCERPT: escHtml(excerpt),
    BODY_HTML: bodyHtml, // already escaped inside md.render()
    TAGS_HTML: tagsHtml,
    RELATED_HTML: relatedHtml,
    COMMENTS_HTML: commentsHtml,
    PREV_NEXT_HTML: prevNextHtml,
    CATEGORY_LABEL: escHtml(categoryLabel),
  });
}

// ── Render a single card (shared by grid + featured) ─────────────────
function renderCard(p, variant) {
  const excerpt = p.excerpt && p.excerpt.length
    ? p.excerpt
    : md.excerpt(p.body_md || '', variant === 'featured' ? 220 : 140);
  const tag = (p.tags && p.tags[0]) ? p.tags[0] : 'Insights';
  const mins = readingMinutes(p.body_md);
  const cover = p.cover_image
    ? '<img class="blog-card-cover" src="' + escHtml(p.cover_image) + '" alt="' + escHtml(p.title) + '" loading="lazy">'
    : '<div class="blog-card-cover blog-card-cover-placeholder" aria-hidden="true"></div>';
  const classes = variant === 'featured' ? 'blog-card blog-card-featured' : 'blog-card';
  return '<a class="' + classes + '" href="' + postUrl(p) + '">' +
    cover +
    '<div class="blog-card-body">' +
      '<div class="blog-card-tag">' + escHtml(tag) + '</div>' +
      '<div class="blog-card-title">' + escHtml(p.title) + '</div>' +
      '<div class="blog-card-excerpt">' + escHtml(excerpt) + '</div>' +
      '<div class="blog-card-meta">' +
        escHtml(p.author || 'EquitySight') + ' · ' +
        escHtml(humanDate(p.published_at || p.created_at)) + ' · ' +
        mins + ' min read' +
      '</div>' +
    '</div>' +
  '</a>';
}

// ── Render blog index (paged) ─────────────────────────────────────────
function renderIndex(posts, page, totalPages, template, opts) {
  opts = opts || {};
  const baseHref = opts.baseHref || '/blog/';
  const featured = opts.featured || null; // post to show in hero (page 1 only)

  const featuredHtml = featured
    ? '<section class="blog-featured"><div class="blog-featured-label">Featured</div>' + renderCard(featured, 'featured') + '</section>'
    : '';

  const catNavHtml = (opts.categoryNav && opts.categoryNav.length)
    ? '<nav class="blog-cat-nav" aria-label="Categories">' +
        opts.categoryNav.map(c => {
          const cls = c.active ? 'blog-cat-chip active' : 'blog-cat-chip';
          return '<a class="' + cls + '" href="' + c.href + '">' + escHtml(c.label) +
            (c.count != null ? ' <span class="blog-cat-count">' + c.count + '</span>' : '') +
          '</a>';
        }).join('') +
      '</nav>'
    : '';

  const cardsHtml = posts.length
    ? posts.map(p => renderCard(p, 'standard')).join('')
    : '<div class="blog-empty">No articles published yet — check back soon.</div>';

  let paginationHtml = '';
  if (totalPages > 1) {
    const parts = [];
    for (let i = 1; i <= totalPages; i++) {
      const href = i === 1 ? baseHref : baseHref + 'page/' + i + '/';
      parts.push(i === page
        ? '<span class="current">' + i + '</span>'
        : '<a href="' + href + '">' + i + '</a>');
    }
    paginationHtml = '<div class="blog-pagination">' + parts.join('') + '</div>';
  }

  let out = replaceAll(template, {
    POSTS_GRID: cardsHtml,
    PAGINATION_HTML: paginationHtml,
    FEATURED_HTML: featuredHtml,
    CATEGORY_NAV_HTML: catNavHtml,
  });
  // Self-canonicalise + retitle every variant that ISN'T the main /blog/ page 1, so
  // section, tag and paginated index pages no longer all canonicalise to /blog/ (which
  // de-indexes them) or share a single <title>. Exact-string replacements on head tags
  // only — a non-match is a no-op (never ships a literal placeholder).
  const isMainFirst = (baseHref === '/blog/' && page === 1);
  if (!isMainFirst) {
    const canonUrl = SITE_URL + ((page > 1) ? (baseHref + 'page/' + page + '/') : baseHref);
    const title = opts.pageTitle || ('EquitySight Blog — Page ' + page);
    out = out
      .replace('<link rel="canonical" href="https://equitysight.app/blog/">', '<link rel="canonical" href="' + canonUrl + '">')
      .replace('<link rel="alternate" hreflang="en-AU" href="https://equitysight.app/blog/">', '<link rel="alternate" hreflang="en-AU" href="' + canonUrl + '">')
      .replace('<link rel="alternate" hreflang="x-default" href="https://equitysight.app/blog/">', '<link rel="alternate" hreflang="x-default" href="' + canonUrl + '">')
      .replace('<meta property="og:url" content="https://equitysight.app/blog/">', '<meta property="og:url" content="' + canonUrl + '">')
      .replace('<title>EquitySight Blog — Australian Property Investment Insights</title>', '<title>' + escHtml(title) + '</title>')
      .replace('<meta property="og:title" content="EquitySight Blog — Australian Property Investment Insights">', '<meta property="og:title" content="' + escHtml(title) + '">')
      .replace('<meta name="twitter:title" content="EquitySight Blog — Australian Property Investment Insights">', '<meta name="twitter:title" content="' + escHtml(title) + '">');
  }
  return out;
}

// ── RSS feed ──────────────────────────────────────────────────────────
function renderRss(posts) {
  const items = posts.slice(0, 50).map(p => {
    const link = SITE_URL + postUrlRaw(p);
    const excerpt = (p.excerpt && p.excerpt.length) ? p.excerpt : md.excerpt(p.body_md || '', 260);
    return '<item>' +
      '<title>' + escHtml(p.title) + '</title>' +
      '<link>' + link + '</link>' +
      '<guid isPermaLink="true">' + link + '</guid>' +
      '<description>' + escHtml(excerpt) + '</description>' +
      '<pubDate>' + new Date(p.published_at || p.created_at).toUTCString() + '</pubDate>' +
      (p.author ? '<author>noreply@equitysight.app (' + escHtml(p.author) + ')</author>' : '') +
    '</item>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>' +
      '<title>EquitySight Blog</title>' +
      '<link>' + SITE_URL + '/blog/</link>' +
      '<description>Long-form analysis for Australian property investors.</description>' +
      '<language>en-AU</language>' +
      '<lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>' +
      items +
    '</channel></rss>';
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  if (SKIP) {
    console.log('[build-blog] SKIP_BLOG_BUILD=true — skipping');
    return;
  }

  if (!fs.existsSync(TEMPLATE_POST) || !fs.existsSync(TEMPLATE_INDEX)) {
    console.error('[build-blog] templates/blog-*.html missing — abort');
    return;
  }

  const posts = (await fetchPosts())
    .filter(p => p && p.status === 'published' && p.slug && p.title && p.body_md)
    .sort((a, b) => (b.published_at || 0) - (a.published_at || 0));

  const belowGate = posts.filter(isBelowWordGate);
  if (belowGate.length) {
    console.warn('[build-blog] ' + belowGate.length + ' post(s) below ' + MIN_WORDS + '-word floor — rendered with noindex, excluded from sitemap/RSS/index:');
    for (const p of belowGate) {
      console.warn('  - ' + p.slug + ' (' + md.wordCount(p.body_md || '') + ' words)');
    }
  }
  // Indexable subset — used for sitemap, RSS, paged index, tag pages, section pages.
  const indexablePosts = posts.filter(p => !isBelowWordGate(p));

  console.log('[build-blog] Rendering', posts.length, 'posts (' + indexablePosts.length + ' indexable)');

  // Wipe and recreate /blog/
  if (fs.existsSync(BLOG_DIR)) execSync(`rm -rf "${BLOG_DIR}"`);
  fs.mkdirSync(BLOG_DIR, { recursive: true });

  const postTpl = fs.readFileSync(TEMPLATE_POST, 'utf8');
  const indexTpl = fs.readFileSync(TEMPLATE_INDEX, 'utf8');

  // ── Individual posts ───────────────────────────────────────────────
  // posts[] is newest-first. Chronological "previous" means older (higher index),
  // "next" means newer (lower index).
  let totalComments = 0;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const section = (p.section || 'general').replace(/[^a-z0-9-]/g, '');
    const outDir = path.join(BLOG_DIR, section, p.slug);
    fs.mkdirSync(outDir, { recursive: true });
    const comments = await fetchCommentsForPost(p.slug);
    totalComments += (comments.totalCount || 0);
    const neighbours = { prev: posts[i + 1] || null, next: posts[i - 1] || null };
    const html = renderPost(p, posts, postTpl, comments, neighbours);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  }

  // ── Group by section + tag (indexable posts only — sub-gate posts don't
  //     appear in public listings) ─────────────────────────────────────
  const bySection = {};
  const byTag = {};
  for (const p of indexablePosts) {
    const sec = (p.section || 'general').replace(/[^a-z0-9-]/g, '');
    (bySection[sec] || (bySection[sec] = [])).push(p);
    for (const t of (p.tags || [])) {
      (byTag[t] || (byTag[t] = [])).push(p);
    }
  }

  // Build the shared section-nav used on every index variant
  function buildSectionNav(activeHref) {
    const nav = [{ href: '/blog/', label: 'All', count: indexablePosts.length, active: activeHref === '/blog/' }];
    for (const [sec, secPosts] of Object.entries(bySection)) {
      if (!secPosts.length) continue;
      const href = '/blog/' + sec + '/';
      nav.push({ href, label: sectionLabel(sec), count: secPosts.length, active: activeHref === href });
    }
    return nav;
  }

  // Pick a featured post for the hero (page 1 main index only) — only when
  // there are 2+ posts so the grid below is never left empty.
  const featuredPost = indexablePosts.length >= 2 ? (indexablePosts.find(p => p.featured) || indexablePosts[0] || null) : null;

  // ── Main index (paged) — indexable posts only ─────────────────────
  const totalPages = Math.max(1, Math.ceil(indexablePosts.length / PAGE_SIZE));
  for (let page = 1; page <= totalPages; page++) {
    const slice = indexablePosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const opts = {
      baseHref: '/blog/',
      featured: page === 1 ? featuredPost : null,
      categoryNav: buildSectionNav('/blog/'),
    };
    const gridSlice = (page === 1 && featuredPost)
      ? slice.filter(x => x.id !== featuredPost.id)
      : slice;
    const html = renderIndex(gridSlice, page, totalPages, indexTpl, opts);
    const outDir = page === 1 ? BLOG_DIR : path.join(BLOG_DIR, 'page', String(page));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  }

  // ── Section index pages ────────────────────────────────────────────
  for (const [sec, secPosts] of Object.entries(bySection)) {
    const outDir = path.join(BLOG_DIR, sec);
    fs.mkdirSync(outDir, { recursive: true });
    const opts = {
      baseHref: '/blog/' + sec + '/',
      pageTitle: sec.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' — EquitySight Blog',
      featured: null,
      categoryNav: buildSectionNav('/blog/' + sec + '/'),
    };
    const html = renderIndex(secPosts, 1, 1, indexTpl, opts);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  }

  // ── Tag index pages ────────────────────────────────────────────────
  for (const [tag, tagPosts] of Object.entries(byTag)) {
    const tagSlug = tag.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!tagSlug) continue;
    const outDir = path.join(BLOG_DIR, 'tag', tagSlug);
    fs.mkdirSync(outDir, { recursive: true });
    const opts = {
      baseHref: '/blog/tag/' + tagSlug + '/',
      pageTitle: 'Posts tagged “' + tag + '” — EquitySight Blog',
      featured: null,
      categoryNav: buildSectionNav(''),
    };
    const html = renderIndex(tagPosts, 1, 1, indexTpl, opts);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  }

  // ── RSS (indexable posts only) ─────────────────────────────────────
  fs.writeFileSync(path.join(BLOG_DIR, 'rss.xml'), renderRss(indexablePosts));

  // ── Sitemap supplement (indexable posts only) ──────────────────────
  const urls = [SITE_URL + '/blog/']
    .concat(indexablePosts.map(p => SITE_URL + postUrlRaw(p)))
    .concat(Object.keys(byTag).map(t => SITE_URL + '/blog/tag/' + tagToSlug(t) + '/'))
    .concat(Object.keys(bySection).map(sec => SITE_URL + '/blog/' + sec + '/'));
  const sitemapBlog = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + u + '</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>').join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap-blog.xml'), sitemapBlog);

  console.log('[build-blog] Built', posts.length, 'posts,', totalPages, 'index page(s),', Object.keys(bySection).length, 'section pages,', Object.keys(byTag).length, 'tag pages,', totalComments, 'approved comment(s) injected');
}

if (require.main === module) {
  main().catch(e => { console.error('[build-blog] FATAL:', e); process.exit(1); });
}

module.exports = { main };

/**
 * seo-metrics.js — Netlify Function
 *
 * Stores Google Search Console snapshots in Upstash Redis so we can track
 * indexed-page count, CTR, average position, and top-mover deltas over time
 * without paging through the GSC UI manually.
 *
 * Two ingest paths:
 *   1. Manual import — admin posts a GSC export (JSON) via the admin UI
 *      "Import GSC snapshot" button. Works today without any Google creds.
 *   2. Automated pull (`action: 'pull'`) — uses a Google service account JWT
 *      to call the GSC searchanalytics API. Requires GSC_SA_EMAIL +
 *      GSC_SA_PRIVATE_KEY env vars (a Service Account with the GSC user
 *      added as Owner/Full on the property). Until those are set, this
 *      endpoint returns a clear "not configured" error.
 *
 * Redis keys:
 *   seo:snapshot:<YYYY-MM-DD>  — full snapshot JSON (rows + summary)
 *   seo:snapshot:dates         — sorted set of YYYY-MM-DD strings (for index)
 *   seo:metrics:latest         — pointer to most recent snapshot
 *
 * All endpoints require admin role (verified via es_session cookie + Redis).
 */
'use strict';

const log = require('./_log');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g, '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();

const SITE_PROPERTY = process.env.GSC_SITE_PROPERTY || 'sc-domain:equitysight.app';
const GSC_SA_EMAIL       = (process.env.GSC_SA_EMAIL       || '').trim();
const GSC_SA_PRIVATE_KEY = (process.env.GSC_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

// Snapshots over this age get pruned automatically. 18 months is enough to
// span two re-pull cycles plus a year of week-over-week trend.
const SNAPSHOT_TTL_SEC = 60 * 60 * 24 * 30 * 18;

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());

function corsHeaders(event) {
  const reqOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
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

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

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

async function rSet(key, val, ttl) {
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return ttl ? redisCmd('SETEX', key, String(ttl), s) : redisCmd('SET', key, s);
}

async function verifyAdmin(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const token = cookies.es_session;
  if (!token) return null;
  const session = await rGet('token:' + token);
  if (!session || session.expires < Date.now()) return null;
  if (session.role !== 'admin') return null;
  return session;
}

// ── Snapshot shape ─────────────────────────────────────────────────────────
//
// {
//   date:           'YYYY-MM-DD' (ISO local date the snapshot was taken),
//   source:         'manual' | 'gsc-api',
//   summary: {
//     indexedPages,            number of pages currently indexed
//     totalKnownPages,         number of pages Google knows about
//     pagesWithRedirect,       count of "Page with redirect" excluded URLs
//     pagesCrawledNotIndexed,  count of "Crawled, currently not indexed"
//     pagesNoindex,            count of "Excluded by 'noindex' tag"
//     totalClicks,             clicks in window
//     totalImpressions,        impressions in window
//     siteCtr,                 click-through rate (clicks / impressions)
//     avgPosition,             average ranking position
//     suburbCtr,               CTR for suburb pages only (path matches /suburb/)
//     suburbImpressions,       impressions for suburb pages only
//   },
//   queries: [{ query, clicks, impressions, ctr, position }, ...],   top 1000
//   pages:   [{ url, clicks, impressions, ctr, position }, ...],     top 1000
// }
//
// On import we recompute the summary fields from `queries` + `pages` if the
// caller did not supply them, so partial uploads still produce a useful
// snapshot.

function computeSummary(rows) {
  const summary = {
    totalClicks: 0, totalImpressions: 0,
    siteCtr: 0, avgPosition: 0,
    suburbClicks: 0, suburbImpressions: 0, suburbCtr: 0,
    indexedPages: null, totalKnownPages: null,
    pagesWithRedirect: null, pagesCrawledNotIndexed: null, pagesNoindex: null,
  };
  if (!Array.isArray(rows)) return summary;
  let posWeight = 0;
  for (const r of rows) {
    const clicks = +r.clicks || 0;
    const impr   = +r.impressions || 0;
    summary.totalClicks      += clicks;
    summary.totalImpressions += impr;
    posWeight += (+r.position || 0) * impr;
    if (r.url && /\/suburb\//.test(r.url)) {
      summary.suburbClicks      += clicks;
      summary.suburbImpressions += impr;
    }
  }
  summary.siteCtr     = summary.totalImpressions ? summary.totalClicks / summary.totalImpressions : 0;
  summary.avgPosition = summary.totalImpressions ? posWeight / summary.totalImpressions : 0;
  summary.suburbCtr   = summary.suburbImpressions ? summary.suburbClicks / summary.suburbImpressions : 0;
  return summary;
}

async function importSnapshot(payload) {
  const date = (payload && payload.date) || new Date().toISOString().slice(0, 10);
  const source = (payload && payload.source) || 'manual';
  const queries = Array.isArray(payload && payload.queries) ? payload.queries.slice(0, 1000) : [];
  const pages   = Array.isArray(payload && payload.pages)   ? payload.pages.slice(0, 1000)   : [];

  const computed = computeSummary(pages);
  const provided = (payload && payload.summary) || {};
  // Merge — caller-supplied indexing-status counts (which can't be derived
  // from the row data) override the empty defaults; numeric metrics use
  // computed values when caller didn't provide them.
  const summary = Object.assign({}, computed, provided);

  const snapshot = { date, source, summary, queries, pages, importedAt: Date.now() };
  await rSet('seo:snapshot:' + date, snapshot, SNAPSHOT_TTL_SEC);
  await redisCmd('ZADD', 'seo:snapshot:dates', String(Date.now()), date);
  await rSet('seo:metrics:latest', { date, summary, importedAt: snapshot.importedAt });
  log.info('seo.import_snapshot', { date, source, queries: queries.length, pages: pages.length });

  return { ok: true, date, summary };
}

async function listDates(limit) {
  const max = Math.min(+limit || 50, 200);
  const raw = await redisCmd('ZREVRANGE', 'seo:snapshot:dates', '0', String(max - 1));
  return raw || [];
}

async function getTrend(payload) {
  const limit = (payload && payload.limit) || 12;
  const dates = await listDates(limit);
  const points = [];
  for (const d of dates) {
    const snap = await rGet('seo:snapshot:' + d);
    if (snap && snap.summary) points.push({ date: d, summary: snap.summary });
  }
  return { ok: true, points };
}

async function compare(payload) {
  if (!payload || !payload.from || !payload.to) {
    return { ok: false, error: 'from + to dates required' };
  }
  const a = await rGet('seo:snapshot:' + payload.from);
  const b = await rGet('seo:snapshot:' + payload.to);
  if (!a || !b) return { ok: false, error: 'snapshot not found' };

  const fields = ['totalClicks','totalImpressions','siteCtr','avgPosition','indexedPages','suburbCtr','suburbImpressions','pagesWithRedirect','pagesCrawledNotIndexed'];
  const summary = {};
  for (const f of fields) {
    const av = a.summary[f]; const bv = b.summary[f];
    summary[f] = { from: av, to: bv, delta: (av != null && bv != null) ? bv - av : null };
  }

  // Top movers — queries that gained or lost the most clicks
  const aMap = new Map((a.queries || []).map(q => [q.query, q]));
  const movers = [];
  for (const q of (b.queries || [])) {
    const prev = aMap.get(q.query);
    const prevClicks = prev ? prev.clicks : 0;
    const prevPos    = prev ? prev.position : null;
    movers.push({
      query: q.query,
      clicks:      { from: prevClicks, to: q.clicks, delta: q.clicks - prevClicks },
      position:    { from: prevPos,    to: q.position, delta: prevPos != null ? q.position - prevPos : null },
      impressions: q.impressions,
    });
  }
  movers.sort((x, y) => y.clicks.delta - x.clicks.delta);

  return {
    ok: true,
    from: payload.from,
    to: payload.to,
    summary,
    topGainers: movers.slice(0, 20),
    topLosers:  movers.slice(-20).reverse(),
  };
}

async function latest() {
  const ptr = await rGet('seo:metrics:latest');
  if (!ptr) return { ok: true, snapshot: null };
  const snap = await rGet('seo:snapshot:' + ptr.date);
  return { ok: true, snapshot: snap };
}

// ── Automated pull via GSC searchanalytics API ─────────────────────────────
//
// Requires a Google Service Account with the GSC user added as "Owner" on
// the property. To enable:
//   1. Cloud Console → IAM → Create service account
//   2. Generate JSON key, copy `client_email` → GSC_SA_EMAIL env var
//   3. Copy `private_key` (with newlines) → GSC_SA_PRIVATE_KEY env var
//   4. GSC → Settings → Users and permissions → add the service account
//      email as "Owner"
//   5. Optional: GSC_SITE_PROPERTY env (default sc-domain:equitysight.app)
//
// Until those are set, `pull` returns 501 with a clear message.

async function jwtAccessToken() {
  if (!GSC_SA_EMAIL || !GSC_SA_PRIVATE_KEY) {
    throw new Error('GSC_SA_EMAIL + GSC_SA_PRIVATE_KEY env vars not configured');
  }
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: GSC_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64(header) + '.' + b64(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), GSC_SA_PRIVATE_KEY).toString('base64url');
  const jwt = unsigned + '.' + sig;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error('GSC token exchange failed: ' + r.status + ' ' + txt);
  }
  const j = await r.json();
  return j.access_token;
}

async function gscQuery(token, body) {
  const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/'
    + encodeURIComponent(SITE_PROPERTY) + '/searchAnalytics/query';
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error('GSC API ' + r.status + ': ' + txt);
  }
  return r.json();
}

async function pullFromGsc() {
  if (!GSC_SA_EMAIL || !GSC_SA_PRIVATE_KEY) {
    return { ok: false, status: 501, error: 'GSC service account not configured. Set GSC_SA_EMAIL and GSC_SA_PRIVATE_KEY env vars to enable automated pulls. Manual import via the admin "Import GSC snapshot" button works today.' };
  }
  const token = await jwtAccessToken();
  // Use the last 28 days (Google delays GSC data ~3 days; 28d gives a
  // representative window even if the latest 3 are still settling).
  const today = new Date();
  const startDate = new Date(today.getTime() - 28 * 86400 * 1000).toISOString().slice(0, 10);
  const endDate   = new Date(today.getTime() -  3 * 86400 * 1000).toISOString().slice(0, 10);

  const [byPage, byQuery] = await Promise.all([
    gscQuery(token, { startDate, endDate, dimensions: ['page'],  rowLimit: 1000 }),
    gscQuery(token, { startDate, endDate, dimensions: ['query'], rowLimit: 1000 }),
  ]);

  const pages   = (byPage.rows  || []).map(r => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  const queries = (byQuery.rows || []).map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

  return importSnapshot({
    date: endDate,
    source: 'gsc-api',
    pages,
    queries,
    summary: { window: { startDate, endDate } },
  });
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  let payload = {};
  try { payload = event.body ? JSON.parse(event.body) : {}; }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'invalid JSON' }) }; }

  const action = payload.action || event.queryStringParameters?.action;
  if (!action) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'action required' }) };

  const session = await verifyAdmin(event);
  if (!session) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'admin only' }) };

  try {
    let result;
    switch (action) {
      case 'import':  result = await importSnapshot(payload); break;
      case 'latest':  result = await latest();                break;
      case 'trend':   result = await getTrend(payload);       break;
      case 'compare': result = await compare(payload);        break;
      case 'pull':    result = await pullFromGsc();           break;
      case 'list':    result = { ok: true, dates: await listDates(payload.limit) }; break;
      default:        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'unknown action' }) };
    }
    const status = result.status || (result.ok ? 200 : 400);
    return { statusCode: status, headers, body: JSON.stringify(result) };
  } catch (e) {
    log.error('seo.handler_error', { action, err: e.message });
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Internal error' }) };
  }
};

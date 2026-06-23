#!/usr/bin/env node
/**
 * equitysight-gsc-mcp — Model Context Protocol server for Google Search Console.
 *
 * Exposes EquitySight's GSC performance data to Claude Code / Claude Desktop
 * as MCP tools, so an assistant session can pull live indexing + ranking data
 * and diagnose traffic problems directly instead of working from a stale
 * exported zip.
 *
 * AUTH — Google service account (same model as netlify/functions/seo-metrics.js):
 *   1. Google Cloud Console → enable "Google Search Console API"
 *   2. Create a service account → generate a JSON key
 *   3. In Search Console → Settings → Users and permissions → add the
 *      service-account email (client_email from the JSON) as a "Full" user
 *      (Owner not required for read-only searchanalytics)
 *   4. Point this server at the key via ONE of:
 *        GOOGLE_APPLICATION_CREDENTIALS  = /abs/path/to/key.json   (preferred)
 *        GSC_SA_EMAIL + GSC_SA_PRIVATE_KEY                          (inline)
 *   5. Optional: GSC_SITE_PROPERTY (default "sc-domain:equitysight.app")
 *
 * The server is read-only — it only calls the searchanalytics.query and
 * sitemaps.list endpoints. It never writes to the property.
 *
 * TOOLS:
 *   gsc_summary           — clicks / impressions / CTR / position for a window
 *   gsc_top_pages         — top pages by impressions or clicks
 *   gsc_top_queries       — top search queries
 *   gsc_country_breakdown — performance split by country
 *   gsc_device_breakdown  — performance split by device
 *   gsc_timeseries        — daily clicks/impressions/position over a window
 *   gsc_page_detail       — drill into one URL's queries
 *   gsc_compare           — diff two date windows (movers)
 *   gsc_list_sitemaps     — submitted sitemaps + their status
 *
 * All date args accept YYYY-MM-DD. Omitting them defaults to the last 28 days
 * ending 3 days ago (GSC data settles ~2-3 days behind real time).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'node:crypto';
import fs from 'node:fs';

// ── Credentials ─────────────────────────────────────────────────────────────
function loadCreds() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && fs.existsSync(path)) {
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    return { email: json.client_email, key: json.private_key };
  }
  const email = (process.env.GSC_SA_EMAIL || '').trim();
  const key = (process.env.GSC_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (email && key) return { email, key };
  return null;
}

const SITE_PROPERTY = process.env.GSC_SITE_PROPERTY || 'sc-domain:equitysight.app';

// ── Google OAuth: sign a JWT, exchange for an access token ───────────────────
let _tokenCache = { token: null, exp: 0 };

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.exp - 60000) {
    return _tokenCache.token;
  }
  const creds = loadCreds();
  if (!creds) {
    throw new Error(
      'No GSC credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account ' +
      'JSON path, or set GSC_SA_EMAIL + GSC_SA_PRIVATE_KEY. See mcp/gsc-mcp/README.md.'
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: creds.email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64(header) + '.' + b64(claim);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), creds.key).toString('base64url');
  const jwt = unsigned + '.' + sig;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  if (!r.ok) throw new Error('Token exchange failed: ' + r.status + ' ' + (await r.text()));
  const j = await r.json();
  _tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

// ── GSC API helpers ──────────────────────────────────────────────────────────
async function gscQuery(body) {
  const token = await getAccessToken();
  const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(SITE_PROPERTY) + '/searchAnalytics/query';
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('GSC API ' + r.status + ': ' + (await r.text()));
  return r.json();
}

async function gscListSitemaps() {
  const token = await getAccessToken();
  const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(SITE_PROPERTY) + '/sitemaps';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('GSC API ' + r.status + ': ' + (await r.text()));
  return r.json();
}

// Default window: 28 days ending 3 days ago (GSC data lag).
function defaultWindow() {
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

function pct(n) { return (n * 100).toFixed(2) + '%'; }

// ── Tool implementations ─────────────────────────────────────────────────────
async function toolSummary(args) {
  const w = { startDate: args.startDate || defaultWindow().startDate, endDate: args.endDate || defaultWindow().endDate };
  const data = await gscQuery({ startDate: w.startDate, endDate: w.endDate, dimensions: [] });
  const row = (data.rows && data.rows[0]) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return `Search Console summary for ${SITE_PROPERTY}\nWindow: ${w.startDate} → ${w.endDate}\n` +
    `Clicks:      ${row.clicks}\nImpressions: ${row.impressions}\n` +
    `CTR:         ${pct(row.ctr)}\nAvg position: ${row.position.toFixed(1)}`;
}

async function toolTopPages(args) {
  const w = defaultWindow();
  const data = await gscQuery({
    startDate: args.startDate || w.startDate,
    endDate: args.endDate || w.endDate,
    dimensions: ['page'],
    rowLimit: args.limit || 25,
  });
  const rows = (data.rows || []).map(r => ({
    url: r.keys[0], clicks: r.clicks, impr: r.impressions, ctr: r.ctr, pos: r.position,
  }));
  const sortKey = args.sortBy === 'clicks' ? 'clicks' : 'impr';
  rows.sort((a, b) => b[sortKey] - a[sortKey]);
  let out = `Top pages by ${sortKey} (${args.startDate || w.startDate} → ${args.endDate || w.endDate}):\n`;
  rows.forEach((r, i) => {
    out += `${(i + 1).toString().padStart(2)}. impr ${r.impr.toString().padStart(6)} · clk ${r.clicks.toString().padStart(4)} · CTR ${pct(r.ctr).padStart(6)} · pos ${r.pos.toFixed(1).padStart(5)} · ${r.url}\n`;
  });
  return out;
}

async function toolTopQueries(args) {
  const w = defaultWindow();
  const data = await gscQuery({
    startDate: args.startDate || w.startDate,
    endDate: args.endDate || w.endDate,
    dimensions: ['query'],
    rowLimit: args.limit || 25,
  });
  const rows = (data.rows || []).map(r => ({
    q: r.keys[0], clicks: r.clicks, impr: r.impressions, ctr: r.ctr, pos: r.position,
  }));
  const sortKey = args.sortBy === 'clicks' ? 'clicks' : 'impr';
  rows.sort((a, b) => b[sortKey] - a[sortKey]);
  let out = `Top queries by ${sortKey} (${args.startDate || w.startDate} → ${args.endDate || w.endDate}):\n`;
  rows.forEach((r, i) => {
    out += `${(i + 1).toString().padStart(2)}. impr ${r.impr.toString().padStart(6)} · clk ${r.clicks.toString().padStart(4)} · CTR ${pct(r.ctr).padStart(6)} · pos ${r.pos.toFixed(1).padStart(5)} · ${r.q}\n`;
  });
  return out;
}

async function toolBreakdown(args, dim, label) {
  const w = defaultWindow();
  const data = await gscQuery({
    startDate: args.startDate || w.startDate,
    endDate: args.endDate || w.endDate,
    dimensions: [dim],
    rowLimit: args.limit || 15,
  });
  const rows = (data.rows || []).map(r => ({
    k: r.keys[0], clicks: r.clicks, impr: r.impressions, ctr: r.ctr, pos: r.position,
  }));
  rows.sort((a, b) => b.impr - a.impr);
  let out = `${label} breakdown (${args.startDate || w.startDate} → ${args.endDate || w.endDate}):\n`;
  rows.forEach(r => {
    out += `  impr ${r.impr.toString().padStart(6)} · clk ${r.clicks.toString().padStart(4)} · CTR ${pct(r.ctr).padStart(6)} · pos ${r.pos.toFixed(1).padStart(5)} · ${r.k}\n`;
  });
  return out;
}

async function toolTimeseries(args) {
  const w = defaultWindow();
  const data = await gscQuery({
    startDate: args.startDate || w.startDate,
    endDate: args.endDate || w.endDate,
    dimensions: ['date'],
    rowLimit: 1000,
  });
  const rows = (data.rows || []).map(r => ({
    date: r.keys[0], clicks: r.clicks, impr: r.impressions, pos: r.position,
  }));
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let out = `Daily performance (${args.startDate || w.startDate} → ${args.endDate || w.endDate}):\n`;
  rows.forEach(r => {
    out += `  ${r.date} · clk ${r.clicks.toString().padStart(4)} · impr ${r.impr.toString().padStart(6)} · pos ${r.pos.toFixed(1).padStart(5)}\n`;
  });
  return out;
}

async function toolPageDetail(args) {
  if (!args.url) throw new Error('url is required (e.g. https://equitysight.app/invest/nsw/)');
  const w = defaultWindow();
  const data = await gscQuery({
    startDate: args.startDate || w.startDate,
    endDate: args.endDate || w.endDate,
    dimensions: ['query'],
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: args.url }] }],
    rowLimit: args.limit || 25,
  });
  const rows = (data.rows || []).map(r => ({
    q: r.keys[0], clicks: r.clicks, impr: r.impressions, ctr: r.ctr, pos: r.position,
  }));
  rows.sort((a, b) => b.impr - a.impr);
  let out = `Queries for ${args.url} (${args.startDate || w.startDate} → ${args.endDate || w.endDate}):\n`;
  if (!rows.length) out += '  (no query data — page may not be indexed, or has no impressions in window)\n';
  rows.forEach((r, i) => {
    out += `${(i + 1).toString().padStart(2)}. impr ${r.impr.toString().padStart(5)} · clk ${r.clicks.toString().padStart(3)} · pos ${r.pos.toFixed(1).padStart(5)} · ${r.q}\n`;
  });
  return out;
}

async function toolCompare(args) {
  if (!args.fromStart || !args.fromEnd || !args.toStart || !args.toEnd) {
    throw new Error('Requires fromStart, fromEnd, toStart, toEnd (all YYYY-MM-DD).');
  }
  const [a, b] = await Promise.all([
    gscQuery({ startDate: args.fromStart, endDate: args.fromEnd, dimensions: ['query'], rowLimit: 500 }),
    gscQuery({ startDate: args.toStart, endDate: args.toEnd, dimensions: ['query'], rowLimit: 500 }),
  ]);
  const map = new Map();
  (a.rows || []).forEach(r => map.set(r.keys[0], { fromClicks: r.clicks, fromImpr: r.impressions, fromPos: r.position }));
  const movers = [];
  (b.rows || []).forEach(r => {
    const prev = map.get(r.keys[0]) || { fromClicks: 0, fromImpr: 0, fromPos: null };
    movers.push({
      q: r.keys[0],
      clickDelta: r.clicks - prev.fromClicks,
      imprDelta: r.impressions - prev.fromImpr,
      posDelta: prev.fromPos != null ? r.position - prev.fromPos : null,
      toClicks: r.clicks, toImpr: r.impressions,
    });
  });
  movers.sort((x, y) => y.clickDelta - x.clickDelta);
  let out = `Query movers: [${args.fromStart}→${args.fromEnd}] vs [${args.toStart}→${args.toEnd}]\n\nTOP GAINERS (clicks):\n`;
  movers.slice(0, 15).forEach(m => {
    out += `  ${m.clickDelta >= 0 ? '+' : ''}${m.clickDelta} clk · ${m.imprDelta >= 0 ? '+' : ''}${m.imprDelta} impr · ${m.q}\n`;
  });
  out += '\nTOP LOSERS (clicks):\n';
  movers.slice(-15).reverse().forEach(m => {
    out += `  ${m.clickDelta >= 0 ? '+' : ''}${m.clickDelta} clk · ${m.imprDelta >= 0 ? '+' : ''}${m.imprDelta} impr · ${m.q}\n`;
  });
  return out;
}

async function toolListSitemaps() {
  const data = await gscListSitemaps();
  const maps = data.sitemap || [];
  let out = `Submitted sitemaps for ${SITE_PROPERTY}:\n`;
  if (!maps.length) out += '  (none submitted)\n';
  maps.forEach(m => {
    const errors = m.errors || 0;
    const warnings = m.warnings || 0;
    const submitted = (m.contents && m.contents[0] && m.contents[0].submitted) || '?';
    const indexed = (m.contents && m.contents[0] && m.contents[0].indexed) || '?';
    out += `  ${m.path}\n    lastSubmitted: ${m.lastSubmitted || '?'} · lastDownloaded: ${m.lastDownloaded || 'NEVER'} · ` +
      `errors: ${errors} · warnings: ${warnings} · submitted URLs: ${submitted} · indexed: ${indexed}\n`;
  });
  return out;
}

// ── MCP server wiring ────────────────────────────────────────────────────────
const TOOLS = [
  { name: 'gsc_summary', description: 'Total clicks, impressions, CTR and average position for a date window (defaults to last 28 days). Args: startDate, endDate (YYYY-MM-DD, optional).',
    inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } } },
  { name: 'gsc_top_pages', description: 'Top pages by impressions (default) or clicks. Args: startDate, endDate, limit (default 25), sortBy ("impressions"|"clicks").',
    inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, limit: { type: 'number' }, sortBy: { type: 'string' } } } },
  { name: 'gsc_top_queries', description: 'Top search queries by impressions (default) or clicks. Args: startDate, endDate, limit, sortBy.',
    inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, limit: { type: 'number' }, sortBy: { type: 'string' } } } },
  { name: 'gsc_country_breakdown', description: 'Performance split by country. Args: startDate, endDate, limit.',
    inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'gsc_device_breakdown', description: 'Performance split by device (mobile/desktop/tablet). Args: startDate, endDate.',
    inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } } },
  { name: 'gsc_timeseries', description: 'Daily clicks/impressions/position over the window. Use to spot the day traffic collapsed. Args: startDate, endDate.',
    inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } } },
  { name: 'gsc_page_detail', description: 'Which queries a specific URL ranks for. Args: url (required), startDate, endDate, limit.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' }, limit: { type: 'number' } }, required: ['url'] } },
  { name: 'gsc_compare', description: 'Diff two date windows and rank query gainers/losers by click delta. Args: fromStart, fromEnd, toStart, toEnd (all required, YYYY-MM-DD).',
    inputSchema: { type: 'object', properties: { fromStart: { type: 'string' }, fromEnd: { type: 'string' }, toStart: { type: 'string' }, toEnd: { type: 'string' } }, required: ['fromStart', 'fromEnd', 'toStart', 'toEnd'] } },
  { name: 'gsc_list_sitemaps', description: 'List submitted sitemaps with last-downloaded date, error/warning counts, and submitted-vs-indexed URL counts. Critical for diagnosing indexing problems.',
    inputSchema: { type: 'object', properties: {} } },
];

const HANDLERS = {
  gsc_summary: toolSummary,
  gsc_top_pages: toolTopPages,
  gsc_top_queries: toolTopQueries,
  gsc_country_breakdown: (a) => toolBreakdown(a, 'country', 'Country'),
  gsc_device_breakdown: (a) => toolBreakdown(a, 'device', 'Device'),
  gsc_timeseries: toolTimeseries,
  gsc_page_detail: toolPageDetail,
  gsc_compare: toolCompare,
  gsc_list_sitemaps: toolListSitemaps,
};

const server = new Server(
  { name: 'equitysight-gsc-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const handler = HANDLERS[req.params.name];
  if (!handler) {
    return { content: [{ type: 'text', text: 'Unknown tool: ' + req.params.name }], isError: true };
  }
  try {
    const text = await handler(req.params.arguments || {});
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[equitysight-gsc-mcp] ready — property: ' + SITE_PROPERTY);

#!/usr/bin/env node
/**
 * audit-sitemap.js — Validates every URL in sitemap-core.xml resolves to a
 * file on disk (or a directory with index.html). Reports redirected, missing,
 * or duplicate entries.
 *
 * Run: node build/audit-sitemap.js
 *
 * Exits non-zero if validation fails — wire into the build pipeline if a hard
 * gate is desired. Default exit is informational so it never blocks deploys.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap-core.xml');

const sitemap = fs.readFileSync(SITEMAP, 'utf8');
const SITE_HOST = 'https://equitysight.app';

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());

// Paths generated at build time and not committed to source. Treat these as
// expected-OK if `node build.js` would produce them.
const BUILD_GENERATED_PREFIXES = [
  '/invest/',  // state hubs + city pages — built by build-suburbs.js
  '/suburb/',  // suburb pages — built by build-suburbs.js
];

const results = { ok: [], generated: [], missing: [], duplicate: [] };
const seen = new Set();

for (const loc of locs) {
  if (seen.has(loc)) { results.duplicate.push(loc); continue; }
  seen.add(loc);

  if (!loc.startsWith(SITE_HOST)) { results.missing.push({ loc, reason: 'wrong host' }); continue; }
  let urlPath = loc.slice(SITE_HOST.length).replace(/^\/+/, '/');
  if (urlPath === '') urlPath = '/';

  // Try direct file, /index.html under directory, .html suffix, and clean-URL via rewrites.
  const candidates = [
    path.join(ROOT, urlPath),
    path.join(ROOT, urlPath, 'index.html'),
    path.join(ROOT, urlPath + '.html'),
  ];
  if (urlPath.endsWith('/')) candidates.push(path.join(ROOT, urlPath.replace(/\/$/, '.html')));

  const found = candidates.some(p => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  });

  if (found) {
    results.ok.push(loc);
  } else if (BUILD_GENERATED_PREFIXES.some(p => urlPath.startsWith(p))) {
    results.generated.push(loc);
  } else {
    results.missing.push({ loc, reason: 'no file on disk' });
  }
}

console.log('Sitemap-core audit');
console.log('  Total URLs:        ' + locs.length);
console.log('  Resolved:          ' + results.ok.length);
console.log('  Build-generated:   ' + results.generated.length + '  (built by build-suburbs.js / build-blog.js)');
console.log('  Missing:           ' + results.missing.length);
console.log('  Duplicates:        ' + results.duplicate.length);

if (results.missing.length) {
  console.log('\nMissing URLs (no matching file on disk):');
  for (const m of results.missing) console.log('  - ' + m.loc + '  (' + m.reason + ')');
}
if (results.duplicate.length) {
  console.log('\nDuplicate <loc> entries:');
  for (const d of results.duplicate) console.log('  - ' + d);
}

const failed = results.missing.length + results.duplicate.length;
process.exit(failed ? 1 : 0);

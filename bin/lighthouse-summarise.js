#!/usr/bin/env node
/**
 * lighthouse-summarise.js — reads all *.report.json files in
 * .claude/tooling/lh-reports/ and emits a structured markdown audit report
 * to stdout, grouped by page archetype, with cross-page issue counts.
 *
 * Usage:
 *   bin/lighthouse-summarise.js > docs/lighthouse-site-audit-YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', '.claude', 'tooling', 'lh-reports');

if (!fs.existsSync(REPORTS_DIR)) {
  console.error('No reports found at', REPORTS_DIR);
  console.error('Run bin/lighthouse-local.sh first.');
  process.exit(1);
}

const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.report.json'));
if (!files.length) {
  console.error('No *.report.json files in', REPORTS_DIR);
  process.exit(1);
}

// ── Load each report ─────────────────────────────────────────────────────────
const audits = files.map(f => {
  const r = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
  const url = new URL(r.finalDisplayedUrl || r.requestedUrl).pathname;
  const c = r.categories;
  const a = r.audits;
  const sc = (cat) => Math.round((cat?.score ?? 0) * 100);
  const num = (k) => a[k]?.numericValue ?? null;
  return {
    url,
    file: f,
    perf: sc(c.performance),
    a11y: sc(c.accessibility),
    bp: sc(c['best-practices']),
    seo: sc(c.seo),
    lcp: num('largest-contentful-paint'),
    cls: num('cumulative-layout-shift'),
    tbt: num('total-blocking-time'),
    fcp: num('first-contentful-paint'),
    si:  num('speed-index'),
    failingAudits: Object.entries(a)
      .filter(([id, x]) => x && x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'manual' && x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'informative')
      .map(([id, x]) => ({ id, score: x.score, title: x.title, displayValue: x.displayValue || '' }))
  };
});

// Sort: archetype groups first, then by URL within group.
function archetype(url) {
  if (url === '/') return '01 Homepage';
  if (url.startsWith('/tools/') && url !== '/tools/') return '03 Calculator pages';
  if (url === '/tools/') return '02 Tools landing';
  if (url.startsWith('/suburb/')) return '07 Suburb pages';
  if (url.match(/^\/invest\/[a-z]+\/[^/]+\/?$/)) return '06 City pages';
  if (url.match(/^\/invest\/[a-z]+\/?$/)) return '05 State hub pages';
  if (url === '/blog/' || url.startsWith('/blog/')) return '08 Blog pages';
  return '04 Top-level pages';
}

audits.forEach(a => { a.archetype = archetype(a.url); });
audits.sort((a, b) => a.archetype.localeCompare(b.archetype) || a.url.localeCompare(b.url));

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMs = v => v == null ? '—' : `${Math.round(v)} ms`;
const fmtCls = v => v == null ? '—' : v.toFixed(3);
const cellScore = v => {
  if (v === null || v === undefined) return '—';
  if (v >= 90) return `**${v}**`;
  if (v < 50) return `\`${v}\``;
  return String(v);
};
const cellCls = v => {
  if (v == null) return '—';
  const s = v.toFixed(3);
  if (v > 0.25) return `\`${s}\``;
  if (v > 0.1)  return `_${s}_`;
  return `**${s}**`;
};

// ── Output ───────────────────────────────────────────────────────────────────
const out = [];
const date = new Date().toISOString().slice(0, 10);

out.push(`# Lighthouse site audit — ${date}`);
out.push('');
out.push(`Captured via \`bin/lighthouse-local.sh\` (Lighthouse 12, Chrome for Testing 138, mobile profile, simulated slow 4G) against a localhost static server hosting this repo. Production caveat: Anthropic's web sandbox blocks \`equitysight.app\` so audits run against a local copy. CDN/edge effects (Brotli, HTTP/3, geo) are not measured; everything else (HTML structure, SEO, a11y, lab Performance, CWV) transfers directly to production. See [\`docs/lighthouse-baseline-2026-04-30.md\`](lighthouse-baseline-2026-04-30.md) for the smaller initial baseline.`);
out.push('');
out.push(`**Pages audited:** ${audits.length}`);
out.push('');

// Archetype averages
const groups = {};
for (const a of audits) {
  groups[a.archetype] = groups[a.archetype] || [];
  groups[a.archetype].push(a);
}

out.push('## Per-archetype averages');
out.push('');
out.push('| Archetype | n | Perf | A11y | BP | SEO | LCP | CLS | TBT |');
out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [g, as] of Object.entries(groups).sort()) {
  const avg = (k) => Math.round(as.reduce((s, x) => s + (x[k] || 0), 0) / as.length);
  const avgN = (k) => as.reduce((s, x) => s + (x[k] || 0), 0) / as.length;
  out.push(`| ${g.replace(/^\d+ /, '')} | ${as.length} | ${avg('perf')} | ${avg('a11y')} | ${avg('bp')} | ${avg('seo')} | ${fmtMs(avgN('lcp'))} | ${fmtCls(avgN('cls'))} | ${fmtMs(avgN('tbt'))} |`);
}
out.push('');

// Worst-first overall table
out.push('## Worst pages (by Performance, ascending)');
out.push('');
out.push('Pages most likely to need fixes are at the top.');
out.push('');
out.push('| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |');
out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
const sortedByPerf = [...audits].sort((a, b) => a.perf - b.perf);
for (const a of sortedByPerf.slice(0, 12)) {
  out.push(`| \`${a.url}\` | ${cellScore(a.perf)} | ${cellScore(a.a11y)} | ${cellScore(a.bp)} | ${cellScore(a.seo)} | ${fmtMs(a.lcp)} | ${cellCls(a.cls)} | ${fmtMs(a.tbt)} |`);
}
out.push('');
out.push('Legend: **bold** = Good (≥ 90 / CLS ≤ 0.1), _italic_ = Needs improvement (CLS 0.1–0.25), `code` = Poor (< 50 / CLS > 0.25).');
out.push('');

// Per-archetype tables
out.push('## Full results by archetype');
out.push('');
for (const [g, as] of Object.entries(groups).sort()) {
  out.push(`### ${g.replace(/^\d+ /, '')}`);
  out.push('');
  out.push('| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of as) {
    out.push(`| \`${a.url}\` | ${cellScore(a.perf)} | ${cellScore(a.a11y)} | ${cellScore(a.bp)} | ${cellScore(a.seo)} | ${fmtMs(a.lcp)} | ${cellCls(a.cls)} | ${fmtMs(a.tbt)} |`);
  }
  out.push('');
}

// Cross-page failing audits — count how many pages each issue affects
const issueMap = {};
for (const a of audits) {
  for (const f of a.failingAudits) {
    issueMap[f.id] = issueMap[f.id] || { id: f.id, title: f.title, count: 0, urls: [], displayValues: new Set() };
    issueMap[f.id].count++;
    issueMap[f.id].urls.push(a.url);
    if (f.displayValue) issueMap[f.id].displayValues.add(f.displayValue);
  }
}

const issues = Object.values(issueMap).sort((a, b) => b.count - a.count);

if (issues.length) {
  out.push('## Cross-page issues');
  out.push('');
  out.push('Sorted by how many pages each issue affects. Fixing a high-count issue is high leverage.');
  out.push('');
  for (const i of issues.slice(0, 20)) {
    out.push(`### ${i.title} (${i.count} page${i.count === 1 ? '' : 's'})`);
    out.push('');
    out.push(`Audit ID: \`${i.id}\``);
    if (i.displayValues.size) {
      out.push('');
      out.push('Sample values: ' + [...i.displayValues].slice(0, 5).map(v => `\`${v}\``).join(', '));
    }
    out.push('');
    out.push('Affects:');
    for (const url of i.urls.slice(0, 10)) out.push(`- \`${url}\``);
    if (i.urls.length > 10) out.push(`- … and ${i.urls.length - 10} more`);
    out.push('');
  }
}

out.push('---');
out.push('');
out.push(`Generated by \`bin/lighthouse-summarise.js\` from ${audits.length} reports in \`.claude/tooling/lh-reports/\`. To regenerate after a fresh audit: \`node bin/lighthouse-summarise.js > docs/lighthouse-site-audit-${date}.md\`.`);

process.stdout.write(out.join('\n') + '\n');

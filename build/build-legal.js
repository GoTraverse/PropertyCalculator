#!/usr/bin/env node
/**
 * build/build-legal.js — pre-renders the 6 legal-stack pages so they ship with
 * fully-populated HTML instead of the empty <div id="legal-content"> shell that
 * legal.js fills client-side. The shell pattern was causing CLS 0.640 on every
 * legal page (verified by Lighthouse), because the markdown render injects
 * ~8000 px of content after first paint in a single shift.
 *
 * Run:
 *   node build/build-legal.js
 *
 * Wired into build.js so it runs alongside build-suburbs/build-blog.
 *
 * The .html files keep their original markup. This script:
 *   1. Reads <slug>.md
 *   2. Parses with the shared build/legal-md.js port of legal.js's parser
 *   3. Replaces the placeholder loading <p> inside #legal-content with the
 *      pre-rendered TOC + sections HTML.
 *   4. Sets #legal-tag, #legal-title, #legal-meta from the .md frontmatter.
 *
 * legal.js continues to run client-side and CAN still override the rendered
 * content (admin-edited via Redis getLegalPage). It now detects the
 * data-prerendered="true" marker added here and skips the .md-fallback path.
 */

const fs = require('fs');
const path = require('path');
const { renderLegalBody, esc } = require('./legal-md');

const ROOT = path.join(__dirname, '..');
const PAGES = ['privacy', 'terms', 'cookies', 'disclaimer', 'methodology', 'data-sources'];

// Tag inside #legal-content that build-legal.js writes; legal.js checks for it
// before deciding whether to load the .md fallback. Keeps the admin override
// path working without re-rendering identical content on every page load.
const PRERENDER_MARKER = ' data-prerendered="true"';

function buildOne(slug) {
  const mdPath = path.join(ROOT, slug + '.md');
  const htmlPath = path.join(ROOT, slug + '.html');

  if (!fs.existsSync(mdPath)) {
    console.warn(`[build-legal] Skip ${slug} — no ${slug}.md`);
    return false;
  }
  if (!fs.existsSync(htmlPath)) {
    console.warn(`[build-legal] Skip ${slug} — no ${slug}.html`);
    return false;
  }

  const mdText = fs.readFileSync(mdPath, 'utf8');
  const { fm, bodyHtml } = renderLegalBody(mdText);

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Replace the entire <div id="legal-content">…</div> body with pre-rendered
  // content. Match non-greedy across multiple lines.
  const contentRegex = /<div id="legal-content"(?:\s[^>]*)?>[\s\S]*?<\/div>/m;
  if (!contentRegex.test(html)) {
    console.warn(`[build-legal] Skip ${slug} — no <div id="legal-content"> in HTML`);
    return false;
  }
  html = html.replace(contentRegex,
    `<div id="legal-content"${PRERENDER_MARKER}>\n${bodyHtml}\n</div>`);

  // Update the hero meta if present.
  if (fm.tag) {
    html = html.replace(
      /<div class="legal-tag" id="legal-tag">[^<]*<\/div>/,
      `<div class="legal-tag" id="legal-tag">${esc(fm.tag)}</div>`);
  }
  if (fm.title) {
    html = html.replace(
      /<h1 class="legal-title" id="legal-title">[^<]*<\/h1>/,
      `<h1 class="legal-title" id="legal-title">${esc(fm.title)}</h1>`);
  }
  if (fm.date) {
    html = html.replace(
      /<div class="legal-meta" id="legal-meta">[\s\S]*?<\/div>/,
      `<div class="legal-meta" id="legal-meta">Last updated: ${esc(fm.date)}</div>`);
  }

  fs.writeFileSync(htmlPath, html);
  return true;
}

let n = 0;
for (const slug of PAGES) {
  if (buildOne(slug)) {
    n++;
    console.log(`[build-legal] Pre-rendered ${slug}.html`);
  }
}
console.log(`[build-legal] Done — ${n}/${PAGES.length} legal pages pre-rendered.`);

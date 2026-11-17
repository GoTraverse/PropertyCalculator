/**
 * faq-jsonld-sync-test.js — every FAQ question in a tool page's JSON-LD must
 * be visible on that page, word for word, with the same answer.
 *
 * A tool page can show FAQs in two places:
 *   • a static "Frequently asked questions" section in the HTML (h3 + p), or
 *   • the `faq` array in its ToolPage.init config, rendered by tool-page.js.
 *
 * Rule checked here: if the page has a static FAQ section, its FAQPage
 * JSON-LD must equal that section. Otherwise it must equal the `faq` config.
 * (Pages with no static FAQPage JSON-LD get it injected from the `faq` config
 * at runtime, which cannot drift, so they are skipped.)
 *
 * Also checks that every JSON-LD block on every tool page parses, and that no
 * breadcrumb points at the homepage "#tools" anchor, which does not exist.
 *
 * Run: node tests/faq-jsonld-sync-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOOLS = path.join(__dirname, '..', 'tools');

function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: false,
    style: {}, className: '', options: [], children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, focus() {}
  };
}

// Load a tool script against a stub DOM and capture the config it passes to
// ToolPage.init (that is where the `faq` array lives).
function captureConfig(name, html) {
  const els = {};
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) els[m[1]] = makeEl(m[1]);
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const first = m[2].match(/<option\b[^>]*value="([^"]*)"/);
    els[m[1]].value = first ? first[1] : '';
  }
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const id = (m[0].match(/\bid="([^"]+)"/) || [])[1];
    if (id) els[id].value = (m[0].match(/\bvalue="([^"]*)"/) || [])[1] || '';
  }
  const document = {
    getElementById(id) { return els[id] || null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return makeEl(''); }, addEventListener() {},
    body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html')
  };
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const sb = {
    document, localStorage: storage, sessionStorage: storage, console,
    setTimeout() { return 0; }, clearTimeout() {},
    fetch() { return Promise.reject(new Error('no network in tests')); },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    navigator: {}, location: { search: '', pathname: '/tools/' + name, hash: '' }
  };
  sb.window = sb; sb.self = sb;
  sb.matchMedia = () => ({ matches: false });
  sb.addEventListener = () => {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(TOOLS, 'tool-page.js'), 'utf8'), sb, { filename: 'tool-page.js' });
  vm.runInContext('var __cfg = null; ToolPage.init = function (c) { __cfg = c; };', sb);
  vm.runInContext(fs.readFileSync(path.join(TOOLS, name + '.js'), 'utf8'), sb, { filename: name + '.js' });
  return vm.runInContext('__cfg', sb);
}

const ENT = { '&amp;': '&', '&plusmn;': '±', '&minus;': '−', '&times;': '×', '&divide;': '÷', '&rarr;': '→',
  '&copy;': '©', '&asymp;': '≈', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
function text(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, (e) => (e in ENT ? ENT[e] : e)).replace(/\s+/g, ' ').trim();
}

// h3 + following <p> pairs under the "Frequently asked questions" heading.
function staticFaq(html) {
  const m = html.match(/<h[23][^>]*>\s*Frequently asked questions\s*<\/h[23]>/i);
  if (!m) return null;
  let rest = html.slice(m.index + m[0].length);
  const end = rest.search(/<h2[\s>]|<\/section>|<\/details>/);
  if (end >= 0) rest = rest.slice(0, end);
  const out = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[\s>]|$)/g;
  let x;
  while ((x = re.exec(rest))) {
    const ps = [...x[2].matchAll(/<p(?![^>]*tool-disclaimer)[^>]*>([\s\S]*?)<\/p>/g)].map((p) => text(p[1])).filter(Boolean);
    if (ps.length) out.push({ q: text(x[1]), a: ps.join(' ') });
  }
  return out.length ? out : null;
}

let fails = 0;
let checked = 0;
function fail(msg) { fails++; console.error('FAIL ' + msg); }

const pages = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.html'));
for (const f of pages) {
  const name = f.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(TOOLS, f), 'utf8');

  if (html.includes('equitysight.app/#tools')) fail(`${f}: breadcrumb points at /#tools (no such anchor) — use /tools/`);

  let faqNode = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let json;
    try { json = JSON.parse(m[1]); } catch (e) { fail(`${f}: JSON-LD does not parse (${e.message})`); continue; }
    (function walk(o) {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') { if (o['@type'] === 'FAQPage') faqNode = o; else Object.values(o).forEach(walk); }
    })(json);
  }
  if (name === 'index' || !faqNode) continue;

  const fromStatic = staticFaq(html);
  let visible = fromStatic;
  if (!visible) {
    const cfg = captureConfig(name, html);
    if (cfg && cfg.faq && cfg.faq.length && /id="tool-faq-root"/.test(html)) visible = cfg.faq.map((x) => ({ q: x.q, a: x.a }));
  }
  if (!visible) { fail(`${f}: has FAQPage JSON-LD but no visible FAQ`); continue; }

  const ld = (faqNode.mainEntity || []).map((e) => ({ q: e.name, a: e.acceptedAnswer && e.acceptedAnswer.text }));
  checked++;
  const where = fromStatic ? 'static FAQ section' : 'JS faq config';
  if (ld.length !== visible.length) { fail(`${f}: JSON-LD has ${ld.length} questions, the ${where} has ${visible.length}`); continue; }
  ld.forEach((e, i) => {
    if (e.q !== visible[i].q) fail(`${f}: question ${i + 1} differs from the ${where}: "${e.q}" vs "${visible[i].q}"`);
    else if (e.a !== visible[i].a) fail(`${f}: answer to "${e.q}" differs from the ${where}`);
  });
}

if (fails) {
  console.error(`\nfaq-jsonld-sync-test: ${fails} problem(s)`);
  process.exit(1);
}
console.log(`faq-jsonld-sync-test: FAQ JSON-LD matches the visible FAQ on ${checked} pages; all JSON-LD parses; no /#tools breadcrumbs ✓`);

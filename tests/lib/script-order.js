/**
 * script-order.js — does a page load shared/rules.js before its own script?
 * (dev-only test helper, not a test itself; bin/check.sh runs
 * tests/*-test.js only.)
 *
 * Used by tests/duty-sync-test.js and tests/state-duty-sync-test.js for a
 * page that no longer has its own copy of a rule.
 *
 *   rulesLoadsFirst(html, pagePath, ownScript)
 *     html       the page's HTML
 *     pagePath   its path from the site root, e.g. 'tools/deposit-calculator.html'
 *     ownScript  the page's own script, e.g. 'tools/deposit-calculator.js'
 *   returns { ok: true } or { ok: false, why }
 *
 * Each src is resolved against the page's own address, so "../shared/rules.js"
 * counts from tools/ and "shared/rules.js" counts only from the root. The
 * rules.js tag must come before the page's own script tag, must not be
 * async, and must not be deferred when the page's own script isn't (a
 * deferred script runs after every blocking one).
 */
'use strict';

const BASE = 'https://site.invalid/';

function scriptTags(html, pagePath) {
  const out = [];
  const re = /<script\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!src) continue;
    let pathname;
    try { pathname = new URL(src, BASE + pagePath).pathname; } catch (e) { continue; }
    out.push({
      src, pathname, index: m.index,
      defer: /\bdefer\b/i.test(attrs),
      async: /\basync\b/i.test(attrs),
      module: /\btype\s*=\s*["']module["']/i.test(attrs)
    });
  }
  return out;
}

function rulesLoadsFirst(html, pagePath, ownScript) {
  const tags = scriptTags(html, pagePath);
  const rules = tags.find((t) => t.pathname === '/shared/rules.js');
  if (!rules) return { ok: false, why: 'it has no <script> tag for /shared/rules.js' };
  const own = tags.find((t) => t.pathname === '/' + ownScript);
  if (!own) return { ok: false, why: 'it has no <script> tag for its own script /' + ownScript };
  if (rules.async) return { ok: false, why: 'its rules.js tag is async, so it may run after ' + ownScript };
  if (rules.module) return { ok: false, why: 'its rules.js tag is a module; load it as a classic script before ' + ownScript };
  if (rules.index > own.index) return { ok: false, why: 'its rules.js tag comes after the tag for ' + ownScript + '; put it first' };
  if (rules.defer && !own.defer && !own.module) return { ok: false, why: 'rules.js is deferred but ' + ownScript + ' is not, so rules.js runs second' };
  return { ok: true };
}

module.exports = { scriptTags, rulesLoadsFirst };

/**
 * source-defs.js — read rule definitions out of page scripts (dev-only test
 * helper, not a test itself; bin/check.sh runs tests/*-test.js only).
 *
 * Used by tests/one-engine-test.js (which files still define a copy of a
 * rule), tests/duty-sync-test.js (cut a copy out and run it against
 * shared/rules.js) and tests/fixtures/make-rules-golden.js.
 *
 *   stripComments(src)        comments blanked out, strings and line
 *                             numbers kept
 *   findDefs(src, patterns)   [{ name, line, index }] for every definition
 *                             of a matching identifier
 *   extractDefs(src, names)   the source text of each named definition
 *                             (whole function, or whole var statement), in
 *                             file order, ready for new Function()
 *   loadDefs(src, names)      { name: value } after running extractDefs
 */
'use strict';

const REGEX_PREV = '(,=:[!&|?{};+-*%<>~^';
const REGEX_WORDS = /\b(?:return|typeof|case|in|of|delete|void|throw|new|else|do)\s*$/;

// Walks the source once, calling onChar(i, kind) where kind is 'code',
// 'str' (inside a string, template or regex literal) or 'comment'.
function scan(src, onChar) {
  let i = 0;
  let lastSig = '';
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { onChar(i, 'comment'); i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      onChar(i, 'comment'); onChar(i + 1, 'comment'); i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { onChar(i, 'comment'); i++; }
      if (i < n) { onChar(i, 'comment'); onChar(i + 1, 'comment'); i += 2; }
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      onChar(i, 'str'); i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { onChar(i, 'str'); i++; }
        if (i < n) { onChar(i, 'str'); i++; }
      }
      if (i < n) { onChar(i, 'str'); i++; }
      lastSig = c;
      continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(0, i - 12), i);
      const isRegex = lastSig === '' || REGEX_PREV.indexOf(lastSig) !== -1 || REGEX_WORDS.test(before);
      if (isRegex) {
        let inClass = false;
        onChar(i, 'str'); i++;
        while (i < n && src[i] !== '\n') {
          const ch = src[i];
          if (ch === '\\') { onChar(i, 'str'); i++; if (i < n) { onChar(i, 'str'); i++; } continue; }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) break;
          onChar(i, 'str'); i++;
        }
        if (i < n && src[i] === '/') { onChar(i, 'str'); i++; }
        while (i < n && /[a-z]/i.test(src[i])) { onChar(i, 'str'); i++; }
        lastSig = '/';
        continue;
      }
    }
    onChar(i, 'code');
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
}

function stripComments(src) {
  const out = src.split('');
  scan(src, (i, kind) => { if (kind === 'comment' && out[i] !== '\n') out[i] = ' '; });
  return out.join('');
}

// Comments and string contents blanked (string quotes kept), so a pattern
// can only match real code.
function codeOnly(src) {
  const out = src.split('');
  scan(src, (i, kind) => {
    if (kind === 'comment' && out[i] !== '\n') out[i] = ' ';
    else if (kind === 'str' && out[i] !== '\n') out[i] = (out[i] === '\'' || out[i] === '"' || out[i] === '`') ? out[i] : ' ';
  });
  return out.join('');
}

function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

// patterns: identifier regex sources, e.g. 'calcDuty' or 'calc\\w*Duty'.
// A definition is a function declaration, a var/let/const binding (also the
// later names in a comma list), an assignment at the start of a statement
// (window.calcDuty = …), or an object key whose value is a function, an
// object or an array.
function findDefs(src, patterns) {
  const code = codeOnly(src);
  const idp = '(' + patterns.map((p) => '(?:' + p + ')').join('|') + ')';
  const res = [
    new RegExp('\\bfunction\\s*\\*?\\s+' + idp + '\\s*\\(', 'g'),
    new RegExp('\\b(?:var|let|const)\\s+' + idp + '\\b\\s*=(?!=)', 'g'),
    new RegExp('(?:^|[;{}\\n])[ \\t]*(?:[A-Za-z_$][\\w$]*\\.)*' + idp + '\\b\\s*=(?![=>])', 'g'),
    new RegExp('\\b(?:var|let|const)\\s[^;]*?,\\s*' + idp + '\\b\\s*=(?!=)', 'g'),
    new RegExp('[{,]\\s*' + idp + '\\b\\s*:\\s*(?:function\\b|\\{|\\[|\\()', 'g')
  ];
  const seen = new Set();
  const out = [];
  for (const re of res) {
    let m;
    while ((m = re.exec(code))) {
      const name = m[1];
      const index = m.index + m[0].lastIndexOf(name, m[0].length);
      const key = name + '@' + index;
      if (seen.has(key)) continue;
      // The whole identifier must match one pattern exactly.
      if (!patterns.some((p) => new RegExp('^(?:' + p + ')$').test(name))) continue;
      seen.add(key);
      out.push({ name, index, line: lineAt(src, index) });
    }
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

// End of the bracketed block that starts at the first `open` char at or
// after `from`, skipping strings and comments.
function matchBlock(src, from) {
  const kinds = new Array(src.length);
  scan(src, (i, kind) => { kinds[i] = kind; });
  let depth = 0, started = false;
  for (let i = from; i < src.length; i++) {
    if (kinds[i] !== 'code') continue;
    const c = src[i];
    if (c === '{' || c === '(' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ')' || c === ']') { depth--; if (started && depth === 0) return { end: i + 1, kinds }; }
  }
  return { end: -1, kinds };
}

// Source of each named definition. Function declarations are cut from
// `function` to their closing brace; var statements from `var` to the `;`
// that ends them (outside any bracket).
function extractDefs(src, names) {
  const pieces = [];
  const taken = [];
  const kindsAll = (() => { const k = new Array(src.length); scan(src, (i, kind) => { k[i] = kind; }); return k; })();
  for (const name of names) {
    const fn = new RegExp('\\bfunction\\s+' + name + '\\s*\\(').exec(codeOnly(src));
    let start = -1, end = -1;
    if (fn) {
      start = fn.index;
      const body = src.indexOf('{', src.indexOf(')', start));
      end = matchBlock(src, body).end;
    } else {
      const v = new RegExp('\\b(?:var|let|const)\\s+(?:[^;]*?,\\s*)?' + name + '\\b\\s*=(?!=)').exec(codeOnly(src));
      if (!v) continue;
      start = v.index;
      let depth = 0;
      for (let i = start; i < src.length; i++) {
        if (kindsAll[i] !== 'code') continue;
        const c = src[i];
        if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') depth--;
        else if (c === ';' && depth === 0) { end = i + 1; break; }
      }
    }
    if (start === -1 || end === -1) continue;
    if (taken.some((t) => t[0] === start)) continue;
    taken.push([start, end]);
  }
  taken.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of taken) pieces.push(src.slice(a, b));
  return pieces.join('\n');
}

function loadDefs(src, names, prelude) {
  const body = (prelude || '') + '\n' + extractDefs(src, names) + '\nreturn {' +
    names.map((n) => JSON.stringify(n) + ': (typeof ' + n + ' === "undefined" ? undefined : ' + n + ')').join(', ') + '};';
  return new Function(body)();
}

module.exports = { stripComments, codeOnly, findDefs, extractDefs, loadDefs, lineAt };

/**
 * build/legal-md.js — CommonJS port of legal.js's Markdown parser.
 * Runs at build time so legal pages can be rendered into static HTML
 * (avoiding the CLS 0.640 bug caused by client-side injection on first paint).
 *
 * Keep in lockstep with legal.js. Both files describe the same custom Markdown
 * dialect:
 *
 *   ## Heading      → wrapped in .legal-section with anchor ID + auto-TOC
 *   ### Heading     → <h3>
 *   > text          → gold highlight box (.legal-highlight)
 *   > ⚠ text        → red warning box (.legal-warning) (starts with ⚠ or **Warning or **Important)
 *   - item          → <ul><li>
 *   1. item         → <ol><li>
 *   | col | col |   → <table class="legal-table">
 *   **bold**        → <strong>
 *   *italic*        → <em>
 *   `code`          → <code>
 *   [text](url)     → <a href="url">text</a>
 */

'use strict';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function stripNum(s) {
  return s.replace(/^\d+\.\s*/, '');
}

function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?!\*)(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
      var safe = /^(https?:|mailto:|\/|#)/.test(u.trim());
      return safe ? '<a href="' + esc(u.trim()) + '">' + t + '</a>' : t;
    });
}

function parseFrontmatter(text) {
  var m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  var fm = {};
  m[1].split('\n').forEach(function (line) {
    var idx = line.indexOf(':');
    if (idx < 0) return;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return { fm: fm, body: m[2] };
}

function renderBlock(md) {
  var lines = md.split('\n');
  var out = '';
  var state = 'none';
  var buf = '';
  var tableHead = null;
  var tableRows = '';

  function flushPara() {
    if (state === 'para' && buf.trim()) {
      out += '<p>' + inline(buf.trim()) + '</p>';
      buf = '';
      state = 'none';
    }
  }
  function closeList() {
    if (state === 'ul') { out += '</ul>'; state = 'none'; }
    if (state === 'ol') { out += '</ol>'; state = 'none'; }
  }
  function closeBlockquote() {
    if (state !== 'blockquote') return;
    var content = buf.trim();
    var isWarning = /^[⚠️]/.test(content) ||
                    /^\*\*Warning/i.test(content) ||
                    /^\*\*Important/i.test(content);
    out += '<div class="' + (isWarning ? 'legal-warning' : 'legal-highlight') + '">' +
           inline(content) + '</div>';
    buf = '';
    state = 'none';
  }
  function closeTable() {
    if (state !== 'table') return;
    out += '<table class="legal-table"><thead><tr>';
    tableHead.forEach(function (h) { out += '<th>' + inline(h) + '</th>'; });
    out += '</tr></thead><tbody>' + tableRows + '</tbody></table>';
    tableHead = null;
    tableRows = '';
    state = 'none';
  }
  function closeAll() {
    flushPara();
    closeList();
    closeBlockquote();
    closeTable();
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (/^>[ \t]?/.test(line)) {
      var bqContent = line.replace(/^>[ \t]?/, '');
      if (state !== 'blockquote') {
        flushPara(); closeList(); closeTable();
        state = 'blockquote';
        buf = bqContent;
      } else {
        buf += (bqContent ? ' ' + bqContent : '');
      }
      continue;
    }
    if (state === 'blockquote') closeBlockquote();

    if (/^\|/.test(line)) {
      if (state !== 'table') { flushPara(); closeList(); }
      if (/^\|[-:\s|]+\|?$/.test(line)) continue;
      var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
      if (tableHead === null) {
        tableHead = cells;
        state = 'table';
      } else {
        tableRows += '<tr>';
        cells.forEach(function (c) { tableRows += '<td>' + inline(c) + '</td>'; });
        tableRows += '</tr>';
      }
      continue;
    }
    if (state === 'table') closeTable();

    if (/^[-*] /.test(line)) {
      flushPara();
      if (state !== 'ul') { out += '<ul>'; state = 'ul'; }
      out += '<li>' + inline(line.slice(2).trim()) + '</li>';
      continue;
    }
    if (/^\d+\. /.test(line)) {
      flushPara();
      if (state !== 'ol') { out += '<ol>'; state = 'ol'; }
      out += '<li>' + inline(line.replace(/^\d+\.\s*/, '').trim()) + '</li>';
      continue;
    }
    closeList();

    if (/^### /.test(line)) {
      flushPara();
      out += '<h3>' + inline(line.slice(4).trim()) + '</h3>';
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (state === 'para') {
      buf += ' ' + line;
    } else {
      state = 'para';
      buf = line;
    }
  }

  closeAll();
  return out;
}

function parsePage(body) {
  var chunks = body.split(/^## /m);
  var preHtml = renderBlock(chunks[0]);
  var sections = [];
  for (var i = 1; i < chunks.length; i++) {
    var lines = chunks[i].split('\n');
    var title = lines[0].trim();
    var content = lines.slice(1).join('\n');
    var id = slug(title);
    sections.push({ id: id, title: title, html: renderBlock(content) });
  }
  return { preHtml: preHtml, sections: sections };
}

// Render full HTML body for a legal page (TOC + sections), matching legal.js's
// client-side render() output exactly so a refresh after admin edit doesn't
// shift the layout.
function renderLegalBody(mdText) {
  var parsed = parseFrontmatter(mdText);
  var page = parsePage(parsed.body);

  var toc = '';
  if (page.sections.length >= 3) {
    toc = '<div class="legal-toc"><h3>Contents</h3><ol>';
    page.sections.forEach(function (s) {
      toc += '<li><a href="#' + esc(s.id) + '">' + esc(stripNum(s.title)) + '</a></li>';
    });
    toc += '</ol></div>';
  }

  var sectionsHtml = '';
  page.sections.forEach(function (s) {
    sectionsHtml +=
      '<div class="legal-section" id="' + esc(s.id) + '">' +
      '<h2>' + inline(s.title) + '</h2>' +
      s.html +
      '</div>';
  });

  return {
    fm: parsed.fm,
    bodyHtml: page.preHtml + toc + sectionsHtml
  };
}

module.exports = { renderLegalBody, parseFrontmatter, parsePage, renderBlock, inline, esc, slug, stripNum };

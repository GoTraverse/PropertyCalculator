/**
 * build/md.js — shared Markdown → HTML renderer.
 *
 * Originally extracted from legal.js so the browser loader and the Node.js
 * build scripts can produce byte-identical HTML from the same source file.
 * Works in both environments:
 *   - Node:   const md = require('./md'); md.render(markdownString);
 *   - Build:  md.parsePage(body).sections → structured sections
 *
 * Supported Markdown:
 *   ---frontmatter---        → parsed into { fm, body }
 *   ## Heading               → <h2> wrapped in .legal-section w/ anchor + auto-TOC
 *   ### Heading              → <h3>
 *   > text                   → gold highlight box (.legal-highlight)
 *   > ⚠ text                → red warning box (.legal-warning)
 *   - item                   → <ul><li>
 *   1. item                  → <ol><li>
 *   | col | col |            → <table class="legal-table">
 *   **bold**, *italic*       → <strong> / <em>
 *   `code`                   → <code>
 *   [text](url)              → <a href="url">text</a>  (https / mailto / anchors only)
 *   blank line               → paragraph break
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

function stripNum(s) { return s.replace(/^\d+\.\s*/, ''); }

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
    var isWarning = /^[\u26A0\uFE0F]/.test(content) ||
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

    if (line.trim() === '') { flushPara(); continue; }

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

/**
 * Full render — returns the composite HTML (pre + TOC + sections) used by
 * build-blog.js. Matches legal.js render() output structure exactly.
 */
function render(bodyMd, opts) {
  opts = opts || {};
  var page = parsePage(bodyMd);
  var toc = '';
  if (page.sections.length >= 3 && opts.toc !== false) {
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
  return page.preHtml + toc + sectionsHtml;
}

/**
 * Plain-text excerpt helper for blog listings + meta descriptions.
 */
function excerpt(bodyMd, max) {
  max = max || 180;
  var parsed = parseFrontmatter(bodyMd);
  var body = parsed.body || bodyMd;
  // Strip markdown syntax aggressively
  var plain = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\|.*\|/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  var cut = plain.slice(0, max);
  var lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.7) cut = cut.slice(0, lastSpace);
  return cut + '…';
}

/**
 * Word count for editor feedback + AdSense gating ("must be ≥1,500 words").
 */
function wordCount(bodyMd) {
  var parsed = parseFrontmatter(bodyMd);
  var body = parsed.body || bodyMd;
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|\[\]()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

module.exports = {
  esc: esc,
  slug: slug,
  inline: inline,
  parseFrontmatter: parseFrontmatter,
  parsePage: parsePage,
  renderBlock: renderBlock,
  render: render,
  excerpt: excerpt,
  wordCount: wordCount,
};

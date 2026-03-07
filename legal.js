/**
 * EquitySight.app — Legal page Markdown loader
 *
 * Fetches <pagename>.md, parses Markdown, and renders it into the page.
 *
 * Frontmatter (at top of .md file):
 *   ---
 *   title: Privacy Policy
 *   date: 1 January 2026
 *   tag: Legal
 *   ---
 *
 * Supported Markdown:
 *   ## Heading      → <h2> wrapped in .legal-section with anchor ID + auto-TOC
 *   ### Heading     → <h3>
 *   > text          → gold highlight box (.legal-highlight)
 *   > ⚠ text       → red warning box (.legal-warning)  (starts with ⚠ or **Warning or **Important)
 *   - item          → <ul><li>
 *   1. item         → <ol><li>
 *   | col | col |   → <table class="legal-table">
 *   **bold**        → <strong>
 *   *italic*        → <em>
 *   `code`          → <code>
 *   [text](url)     → <a href="url">text</a>
 *   blank line      → paragraph break
 */
(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  // Strip leading "1. " / "2. " numbering from section titles (for TOC display)
  function stripNum(s) {
    return s.replace(/^\d+\.\s*/, '');
  }

  // Inline Markdown → HTML (escapes first, then applies transforms)
  function inline(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?!\*)(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
        // Only allow safe URL schemes
        var safe = /^(https?:|mailto:|\/|#)/.test(u.trim());
        return safe ? '<a href="' + esc(u.trim()) + '">' + t + '</a>' : t;
      });
  }

  // ── Frontmatter parser ────────────────────────────────────────────────────

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

  // ── Block renderer ────────────────────────────────────────────────────────
  // Returns HTML string for a chunk of Markdown (no ## headings inside)

  function renderBlock(md) {
    var lines = md.split('\n');
    var out = '';
    var state = 'none'; // para | ul | ol | blockquote | table
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

      // Blockquote line
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

      // Close blockquote if we leave it
      if (state === 'blockquote') closeBlockquote();

      // Table row
      if (/^\|/.test(line)) {
        if (state !== 'table') { flushPara(); closeList(); }
        // Separator row (---|---|)
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

      // Unordered list item
      if (/^[-*] /.test(line)) {
        flushPara();
        if (state !== 'ul') { out += '<ul>'; state = 'ul'; }
        out += '<li>' + inline(line.slice(2).trim()) + '</li>';
        continue;
      }

      // Ordered list item
      if (/^\d+\. /.test(line)) {
        flushPara();
        if (state !== 'ol') { out += '<ol>'; state = 'ol'; }
        out += '<li>' + inline(line.replace(/^\d+\.\s*/, '').trim()) + '</li>';
        continue;
      }

      closeList();

      // H3
      if (/^### /.test(line)) {
        flushPara();
        out += '<h3>' + inline(line.slice(4).trim()) + '</h3>';
        continue;
      }

      // Blank line
      if (line.trim() === '') {
        flushPara();
        continue;
      }

      // Regular text → paragraph (accumulate)
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

  // ── Full page parser ──────────────────────────────────────────────────────

  function parsePage(body) {
    // Split on ## headings (keep the heading text in each chunk)
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

  // ── Render ────────────────────────────────────────────────────────────────

  function render(text) {
    var parsed = parseFrontmatter(text);
    var fm = parsed.fm;
    var body = parsed.body;

    // Update hero elements
    var tagEl   = document.getElementById('legal-tag');
    var titleEl = document.getElementById('legal-title');
    var metaEl  = document.getElementById('legal-meta');
    if (tagEl)   tagEl.textContent  = fm.tag   || 'Legal';
    if (titleEl) titleEl.textContent = fm.title || '';
    if (metaEl)  metaEl.innerHTML   = fm.date
      ? 'Last updated: ' + esc(fm.date)
      : '';

    var page = parsePage(body);

    // Build TOC (only if 3+ sections)
    var toc = '';
    if (page.sections.length >= 3) {
      toc = '<div class="legal-toc"><h3>Contents</h3><ol>';
      page.sections.forEach(function (s) {
        toc += '<li><a href="#' + esc(s.id) + '">' + esc(stripNum(s.title)) + '</a></li>';
      });
      toc += '</ol></div>';
    }

    // Build section HTML
    var sectionsHtml = '';
    page.sections.forEach(function (s) {
      sectionsHtml +=
        '<div class="legal-section" id="' + esc(s.id) + '">' +
        '<h2>' + inline(s.title) + '</h2>' +
        s.html +
        '</div>';
    });

    var el = document.getElementById('legal-content');
    if (el) el.innerHTML = page.preHtml + toc + sectionsHtml;

    // Update page title if title in frontmatter
    if (fm.title) {
      document.title = fm.title + ' \u2014 EquitySight.app';
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  var mdUrl = page + '.md';

  fetch(mdUrl)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(render)
    .catch(function (err) {
      var el = document.getElementById('legal-content');
      if (el) el.innerHTML =
        '<p style="color:rgba(28,28,30,0.4);text-align:center;padding:40px 0;">' +
        'Content unavailable. Please try refreshing the page.</p>';
      console.warn('[legal.js] Failed to load ' + mdUrl + ':', err);
    });

})();

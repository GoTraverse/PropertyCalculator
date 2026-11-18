/**
 * tool-page.js — Shared renderer for EquitySight free calculator pages
 *
 * Loaded in <head> so global utilities are available for oninput handlers.
 * ToolPage.init(config) called at bottom of page to render shared sections.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ADDING A NEW CALCULATOR:
 *   1. Copy any existing tools/*.html as a template
 *   2. Update <head> meta tags (title, description, canonical, OG, schema)
 *   3. Update hero section (eyebrow, h1, description)
 *   4. Replace calculator form + results HTML
 *   5. Update TOOL_CONFIG object (cta, resources, share, related, footer)
 *   6. Write your calculate() function
 *   7. Add to sitemap.xml, index.html tools grid, and other pages' related links
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Config shape:
 *   ToolPage.init({
 *     cta:       { eyebrow, title, description, buttonText, buttonHref },
 *     resources: { groups: [{ icon, title, links: [{ text, href }] }], disclaimer },
 *     share:     { url, text },
 *     related:   [{ href, icon, label }],
 *     footer:    [{ href, text }]
 *   });
 */

/* Dark mode init — runs immediately on parse to prevent FOUC */
(function(){ try{ if(localStorage.getItem('equitySight_theme')==='dark') document.documentElement.classList.add('dark-mode'); }catch(e){} })();

/* ══════════════════════════════════════════════════════════════════════
   GLOBAL UTILITIES — available immediately for oninput handlers
   ══════════════════════════════════════════════════════════════════════ */

/** Format an input element's value with thousands separators as the user
 *  types. Always en-AU grouping (comma thousands, dot decimal) so the text
 *  parseVal() reads back is the same in every browser locale. One decimal
 *  point and up to two decimal places are kept (e.g. a weekly rent of 562.50). */
function fmtInput(el) {
  var cleaned = String(el.value).replace(/[^0-9.]/g, '');
  var dot = cleaned.indexOf('.');
  var intPart = dot === -1 ? cleaned : cleaned.slice(0, dot);
  var decPart = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  intPart = intPart.replace(/^0+(?=\d)/, '');
  var out = intPart ? Number(intPart).toLocaleString('en-AU') : (decPart !== null ? '0' : '');
  if (decPart !== null) out += '.' + decPart;
  el.value = out;
}

/** Parse a DOM element's value to number by ID (strips thousands separators
 *  and spaces; pairs with fmtInput's en-AU formatting). */
function parseVal(id) {
  var el = document.getElementById(id);
  if (!el) return 0;
  return parseFloat(String(el.value || '0').replace(/[,\s]/g, '')) || 0;
}

/** Format number as $X,XXX (en-AU grouping). Negatives render as −$X,XXX. */
function fmt(n) {
  var r = Math.round(n);
  if (!isFinite(r)) return '—';
  return (r < 0 ? '\u2212$' : '$') + Math.abs(r).toLocaleString('en-AU');
}

/** Escape HTML to prevent XSS */
function escHtml(text) {
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
}

/** Set element text content by ID. Numbers get locale-formatted. */
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = typeof val === 'number' ? Math.round(val).toLocaleString('en-AU') : val;
}

/** Monthly mortgage repayment (P&I or interest-only) */
function monthlyRepayment(principal, annualRate, years, interestOnly) {
  if (interestOnly) return principal * (annualRate / 100 / 12);
  var r = annualRate / 100 / 12;
  var n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** Best-effort Australian state/territory code from the browser's IANA
 *  timezone — used to pre-select the user's state on calculators so the
 *  first result is already right for them (they can still change it).
 *  Heuristic by design: ACT shares Sydney's zone (→ NSW), and a couple of
 *  regional zones follow their clock, not their border. Returns '' when the
 *  zone isn't Australian or is unknown. */
function detectAUState() {
  var tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  var MAP = {
    'Australia/Sydney': 'NSW', 'Australia/Lord_Howe': 'NSW', 'Australia/NSW': 'NSW',
    'Australia/Melbourne': 'VIC', 'Australia/Victoria': 'VIC',
    'Australia/Brisbane': 'QLD', 'Australia/Lindeman': 'QLD', 'Australia/Queensland': 'QLD',
    'Australia/Perth': 'WA', 'Australia/West': 'WA',
    'Australia/Adelaide': 'SA', 'Australia/Broken_Hill': 'SA', 'Australia/Yancowinna': 'SA', 'Australia/South': 'SA',
    'Australia/Hobart': 'TAS', 'Australia/Currie': 'TAS', 'Australia/Tasmania': 'TAS',
    'Australia/Darwin': 'NT', 'Australia/North': 'NT',
    'Australia/Canberra': 'ACT', 'Australia/ACT': 'ACT'
  };
  return MAP[tz] || '';
}


/* ══════════════════════════════════════════════════════════════════════
   TOOLPAGE NAMESPACE — section renderers + init
   ══════════════════════════════════════════════════════════════════════ */

var ToolPage = (function() {

  /* ── Section Renderers ── */

  // The note under the result that points to the First Home Journey. It is a
  // plain paragraph with one link. The page's own script reveals #cta once a
  // result is on screen.
  function renderCTA(root, cfg) {
    if (!cfg) return;
    root.innerHTML =
      '<div class="tool-cta" id="cta" style="display:none">' +
        '<h2>' + escHtml(cfg.title) + '</h2>' +
        '<p>' + escHtml(cfg.description) + ' ' +
          '<a href="' + escHtml(cfg.buttonHref || '/journey') + '" class="tool-cta-btn">' +
            escHtml(cfg.buttonText || 'Open the First Home Journey') +
          '</a>' +
        '</p>' +
      '</div>';
  }

  // Government and regulator links for the page, as a plain list.
  function renderResources(root, cfg) {
    if (!cfg || !cfg.groups) return;
    var html = '<div class="tool-resources"><h2 class="tool-resources-title">Sources and further reading</h2>' +
      '<div class="tool-resources-grid">';
    cfg.groups.forEach(function(group) {
      html += '<div><h3>' + escHtml(group.title) + '</h3><ul>';
      group.links.forEach(function(link) {
        html += '<li><a href="' + escHtml(link.href) + '" rel="noopener">' + escHtml(link.text) + '</a></li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
    if (cfg.disclaimer) {
      html += '<p class="tool-resources-disclaimer">' + escHtml(cfg.disclaimer) + '</p>';
    }
    html += '</div>';
    root.innerHTML = html;
  }

  function renderRelated(root, links) {
    if (!links || !links.length) return;
    var html = '<div class="tool-related"><h2>Related calculators</h2><ul class="tool-related-grid">';
    links.forEach(function(link) {
      html += '<li><a href="' + escHtml(link.href) + '" class="tool-related-link">' + escHtml(link.label) + '</a></li>';
    });
    html += '</ul></div>';
    root.innerHTML = html;
  }

  function renderExamples(root, cfg) {
    if (!cfg || !cfg.length) return;
    var html = '<div class="tool-examples">' +
      '<h2>' + (cfg.length === 1 ? 'Worked example' : 'Worked examples') + '</h2>' +
      '<div class="tool-examples-grid">';
    cfg.forEach(function(ex) {
      html += '<div class="tool-example-card">';
      if (ex.label) html += '<h3 class="tool-example-label">' + escHtml(ex.label) + '</h3>';
      if (ex.inputs && ex.inputs.length) {
        html += '<div class="tool-example-section"><div class="tool-example-section-title">Inputs</div>';
        ex.inputs.forEach(function(row) {
          html += '<div class="tool-example-row"><span>' + escHtml(row.k) + '</span><span>' + escHtml(row.v) + '</span></div>';
        });
        html += '</div>';
      }
      if (ex.outputs && ex.outputs.length) {
        html += '<div class="tool-example-section tool-example-outputs"><div class="tool-example-section-title">Result</div>';
        ex.outputs.forEach(function(row) {
          html += '<div class="tool-example-row"><span>' + escHtml(row.k) + '</span><strong>' + escHtml(row.v) + '</strong></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
    root.innerHTML = html;
  }

  function renderFAQ(root, cfg) {
    if (!cfg || !cfg.length) return;
    var html = '<div class="tool-faq"><h2>Questions</h2>';
    cfg.forEach(function(qa) {
      html += '<details class="tool-faq-item">' +
        '<summary class="tool-faq-q">' + escHtml(qa.q) + '</summary>' +
        '<div class="tool-faq-a">' + escHtml(qa.a) + '</div>' +
        '</details>';
    });
    html += '</div>';
    root.innerHTML = html;

    // Add FAQPage JSON-LD for the rendered questions, unless the page already
    // carries one in its HTML (a second copy makes Search Console report
    // "Duplicate field FAQPage").
    try {
      var existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < existingScripts.length; i++) {
        if ((existingScripts[i].textContent || '').indexOf('"FAQPage"') !== -1) return;
      }
      var entities = cfg.map(function(qa) {
        return { '@type': 'Question', name: qa.q, acceptedAnswer: { '@type': 'Answer', text: qa.a } };
      });
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities });
      document.head.appendChild(script);
    } catch(e) { /* non-fatal */ }
  }

  // Calculator pages use the same footer as the rest of the site. footer.js
  // fills #site-footer-root as soon as it loads.
  function renderFooter(root) {
    if (document.getElementById('site-footer-root')) return;
    root.innerHTML = '<div id="site-footer-root"></div>';
    var sc = document.createElement('script');
    sc.src = '/footer.js';
    document.body.appendChild(sc);
  }

  /* ── Scroll the result into view after Calculate is clicked. On mobile
   *    the result sits below the button and is often off-screen — without
   *    this the user thinks nothing happened. Uses `prefers-reduced-motion`
   *    to decide between smooth and instant scroll.
   */
  function _installScrollToResult() {
    var btn = document.querySelector('.tool-main .tool-btn, #calc-btn');
    var result = document.querySelector('.tool-result');
    if (!btn || !result) return;
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.addEventListener('click', function () {
      // Defer past the calc() run so the result container is rendered/visible
      // before we scroll to it.
      setTimeout(function () {
        try {
          result.scrollIntoView({
            behavior: prefersReduced ? 'auto' : 'smooth',
            block: 'nearest',
          });
        } catch (e) { /* older browsers — noop */ }
      }, 60);
    });
  }

  /* ── Init ── */

  /* ── Persist tool inputs to localStorage so refreshing doesn't lose work ── */
  function _installInputPersistence(slug) {
    if (!slug) return;
    var key = 'tool_inputs_v1:' + slug;
    var inputs = document.querySelectorAll('.tool-main input, .tool-main select');
    if (!inputs.length) return;

    // Restore (if anything saved) before the page runs its initial calc
    try {
      var saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && typeof saved === 'object') {
        inputs.forEach(function (el) {
          if (!el.id || !(el.id in saved)) return;
          if (el.type === 'checkbox') el.checked = !!saved[el.id];
          else el.value = saved[el.id];
        });
      }
    } catch (e) { /* bad JSON — ignore */ }

    function snapshot() {
      var snap = {};
      inputs.forEach(function (el) {
        if (!el.id) return;
        snap[el.id] = (el.type === 'checkbox') ? el.checked : el.value;
      });
      try { localStorage.setItem(key, JSON.stringify(snap)); } catch (e) {}
    }
    // Debounced snapshot on any input/change (lightweight — only serialises
    // the ~10 inputs per tool form).
    var t;
    var sched = function () { clearTimeout(t); t = setTimeout(snapshot, 250); };
    inputs.forEach(function (el) {
      el.addEventListener('input', sched);
      el.addEventListener('change', sched);
    });
  }

  /* ── Pre-select the user's state/territory on first visit ──
   * Fires only when the tool declares config.stateSelectId AND the user has
   * no saved value for that select yet — a returning user's own choice always
   * wins. Sets the value silently (no event); the page's own initial
   * calculate() reads it on load. */
  function _applyAutoState(slug, selectId) {
    var sel = document.getElementById(selectId);
    if (!sel || !sel.options || !sel.options.length) return;
    try {
      var saved = JSON.parse(localStorage.getItem('tool_inputs_v1:' + slug) || 'null');
      if (saved && (selectId in saved)) return; // respect a saved choice
    } catch (e) {}
    var st = (typeof detectAUState === 'function') ? detectAUState() : '';
    if (!st) return;
    for (var i = 0; i < sel.options.length; i++) {
      if ((sel.options[i].value || '').toUpperCase() === st) {
        sel.value = sel.options[i].value;
        return;
      }
    }
  }

  function init(config) {
    var el;

    _installInputPersistence(config.slug);
    if (config.stateSelectId) _applyAutoState(config.slug, config.stateSelectId);
    _installScrollToResult();

    el = document.getElementById('tool-cta-root');
    if (el) renderCTA(el, config.cta);

    el = document.getElementById('tool-related-root');
    if (el) renderRelated(el, config.related);

    el = document.getElementById('tool-examples-root');
    if (el) renderExamples(el, config.examples);

    el = document.getElementById('tool-faq-root');
    if (el) renderFAQ(el, config.faq);

    el = document.getElementById('tool-resources-root');
    if (el) renderResources(el, config.resources);

    el = document.getElementById('tool-footer-root');
    if (el) renderFooter(el);

  }

  /* ── Live interest-rate suggestion ──
   * Puts the live suggested rate into a rate input, but only while the user
   * has not chosen their own rate. "Not chosen" = the input still holds the
   * page default, or the suggestion this helper wrote on an earlier visit
   * (input persistence restores that old suggestion, which would otherwise
   * sit there stale under a "Live" badge). Returns true when the input now
   * shows the live rate, so the caller can decide whether to show the badge. */
  function applyLiveRate(opts) {
    var el = document.getElementById(opts.inputId);
    if (!el || opts.rate == null || !isFinite(opts.rate)) return false;
    var key = 'tool_live_rate_v1:' + opts.slug;
    var last = null;
    try { last = localStorage.getItem(key); } catch (e) {}
    var rateStr = String(opts.rate);
    if (el.value === opts.defaultValue || (last !== null && el.value === last)) {
      el.value = rateStr;
      try { localStorage.setItem(key, rateStr); } catch (e) {}
    }
    return el.value === rateStr;
  }

  /* ── Public API ── */

  return { init: init, applyLiveRate: applyLiveRate };

})();

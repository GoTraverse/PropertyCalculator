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

/* ══════════════════════════════════════════════════════════════════════
   GLOBAL UTILITIES — available immediately for oninput handlers
   ══════════════════════════════════════════════════════════════════════ */

/** Format an input element's value with commas as user types (use in oninput="fmtInput(this)") */
function fmtInput(el) {
  var v = el.value.replace(/[^0-9]/g, '');
  el.value = v ? parseInt(v).toLocaleString() : '';
}

/** Parse a DOM element's value to number by ID (handles commas) */
function parseVal(id) {
  return parseFloat((document.getElementById(id).value || '0').replace(/,/g, '')) || 0;
}

/** Format number as $X,XXX */
function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
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


/* ══════════════════════════════════════════════════════════════════════
   TOOLPAGE NAMESPACE — section renderers + init
   ══════════════════════════════════════════════════════════════════════ */

var ToolPage = (function() {

  /* ── Section Renderers ── */

  function renderCTA(root, cfg) {
    if (!cfg) return;
    root.innerHTML =
      '<div class="tool-cta" id="cta" style="display:none">' +
        '<div class="tool-cta-eye">' + escHtml(cfg.eyebrow || 'Go deeper') + '</div>' +
        '<h3>' + escHtml(cfg.title) + '</h3>' +
        '<p>' + escHtml(cfg.description) + '</p>' +
        '<a href="' + escHtml(cfg.buttonHref || '../login.html?tab=signup') + '" class="tool-cta-btn">' +
          escHtml(cfg.buttonText || 'Get started free \u2192') +
        '</a>' +
      '</div>';
  }

  function renderResources(root, cfg) {
    if (!cfg || !cfg.groups) return;
    var html = '<div class="tool-resources">' +
      '<h3 class="tool-resources-title">\uD83D\uDCDA Government Resources & Further Reading</h3>' +
      '<div class="tool-resources-grid">';

    cfg.groups.forEach(function(group) {
      html += '<div><h4>' + group.icon + ' ' + escHtml(group.title) + '</h4><ul>';
      group.links.forEach(function(link) {
        html += '<li><a href="' + escHtml(link.href) + '" target="_blank" rel="noopener">' + escHtml(link.text) + '</a></li>';
      });
      html += '</ul></div>';
    });

    html += '</div>';
    if (cfg.disclaimer) {
      html += '<p class="tool-resources-disclaimer"><strong>Disclaimer:</strong> ' + escHtml(cfg.disclaimer) + '</p>';
    }
    html += '</div>';
    root.innerHTML = html;
  }

  function renderShare(root, cfg) {
    if (!cfg || !cfg.url) return;
    var url = encodeURIComponent(cfg.url);
    var text = encodeURIComponent(cfg.text || '');
    root.innerHTML =
      '<div class="tool-share">' +
        '<h3>\uD83D\uDCE4 Share This Calculator</h3>' +
        '<div class="tool-share-btns">' +
          '<a href="https://www.facebook.com/sharer/sharer.php?u=' + url + '" target="_blank" rel="noopener" class="tool-share-btn">\uD83D\uDCD8 Facebook</a>' +
          '<a href="https://twitter.com/intent/tweet?url=' + url + '&text=' + text + '" target="_blank" rel="noopener" class="tool-share-btn">\uD835\uDD4F Twitter</a>' +
          '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + url + '" target="_blank" rel="noopener" class="tool-share-btn">\uD83D\uDCBC LinkedIn</a>' +
        '</div>' +
      '</div>';
  }

  function renderRelated(root, links) {
    if (!links || !links.length) return;
    var html = '<div class="tool-related"><h3>\uD83D\uDD17 Related Calculators</h3><div class="tool-related-grid">';
    links.forEach(function(link) {
      html += '<a href="' + escHtml(link.href) + '" class="tool-related-link">' + link.icon + ' ' + escHtml(link.label) + '</a>';
    });
    html += '</div></div>';
    root.innerHTML = html;
  }

  function renderFooter(root, links) {
    if (!links) return;
    var html = '<footer class="tool-footer">';
    links.forEach(function(link, i) {
      if (i > 0) html += ' \u00B7 ';
      html += '<a href="' + escHtml(link.href) + '">' + escHtml(link.text) + '</a>';
    });
    html += '<div style="margin-top:8px;">\u00A9 2026 EquitySight. General information only \u2014 not financial advice.</div></footer>';
    root.innerHTML = html;
  }

  /* ── Save-results prompt ── */

  function _isLoggedIn() {
    try { var s = JSON.parse(localStorage.getItem('propCalc_session_v1')); return !!(s && s.token); } catch(e) { return false; }
  }

  function _savePromptDismissed() {
    try { return sessionStorage.getItem('esSavePromptDismissed') === '1'; } catch(e) { return false; }
  }

  function _injectSavePrompt(signupHref) {
    var el = document.createElement('div');
    el.id = 'tool-save-prompt';
    el.className = 'tool-save-prompt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Save your results');
    el.innerHTML =
      '<div class="tool-save-prompt-text">' +
        '<strong>Save these results</strong>' +
        '<span>Free account \u2014 save scenarios, compare properties, export PDF.</span>' +
      '</div>' +
      '<div class="tool-save-prompt-actions">' +
        '<a href="' + escHtml(signupHref || '../login.html?tab=signup') + '" class="tool-save-prompt-btn">Create free account \u2192</a>' +
        '<button class="tool-save-prompt-dismiss" id="tool-save-prompt-dismiss-btn" aria-label="Dismiss">Not now</button>' +
      '</div>';
    document.body.appendChild(el);
    var dismissBtn = document.getElementById('tool-save-prompt-dismiss-btn');
    if (dismissBtn) dismissBtn.addEventListener('click', dismissSavePrompt);
  }

  function _maybeShowSavePrompt() {
    if (_isLoggedIn() || _savePromptDismissed()) return;
    var el = document.getElementById('tool-save-prompt');
    if (!el) return;
    setTimeout(function() { el.classList.add('visible'); }, 1500);
  }

  function dismissSavePrompt() {
    var el = document.getElementById('tool-save-prompt');
    if (el) el.classList.remove('visible');
    try { sessionStorage.setItem('esSavePromptDismissed', '1'); } catch(e) {}
  }

  function _watchForResult(signupHref) {
    _injectSavePrompt(signupHref);
    var cta = document.getElementById('cta');
    if (!cta) return;
    var observer = new MutationObserver(function() {
      if (cta.style.display !== 'none') {
        _maybeShowSavePrompt();
        observer.disconnect();
      }
    });
    observer.observe(cta, { attributes: true, attributeFilter: ['style'] });
  }

  /* ── Init ── */

  function init(config) {
    var el;

    el = document.getElementById('tool-cta-root');
    if (el) renderCTA(el, config.cta);

    _watchForResult(config.cta && config.cta.buttonHref);

    el = document.getElementById('tool-resources-root');
    if (el) renderResources(el, config.resources);

    el = document.getElementById('tool-share-root');
    if (el) renderShare(el, config.share);

    el = document.getElementById('tool-related-root');
    if (el) renderRelated(el, config.related);

    el = document.getElementById('tool-footer-root');
    if (el) renderFooter(el, config.footer);
  }

  /* ── Public API ── */

  return { init: init, dismissSavePrompt: dismissSavePrompt };

})();

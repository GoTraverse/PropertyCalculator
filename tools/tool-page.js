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

/* Partner / referral card styles */
(function(){
  var s = document.createElement('style');
  s.textContent = [
    '.tool-partners{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:28px 24px;margin-bottom:24px;}',
    '.dark-mode .tool-partners{background:#1c1c1e;box-shadow:0 2px 12px rgba(0,0,0,.3);}',
    '.tool-partners-eye{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#C9A84C;margin-bottom:14px;}',
    '.tool-partners-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;}',
    '.tool-partner-tile{border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:6px;position:relative;}',
    '.dark-mode .tool-partner-tile{border-color:rgba(255,255,255,.1);}',
    '.tool-partner-badge{position:absolute;top:10px;right:10px;background:#C9A84C;color:#fff;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:20px;}',
    '.tool-partner-name{font-weight:600;font-size:15px;color:var(--ink,#1C1C1E);margin-top:2px;}',
    '.dark-mode .tool-partner-name{color:#f2f2f7;}',
    '.tool-partner-tagline{font-size:13px;color:var(--slate,#636366);flex:1;}',
    '.tool-partner-btn{display:inline-block;margin-top:10px;padding:8px 14px;background:#C9A84C;color:#fff;border-radius:7px;font-size:13px;font-weight:600;text-decoration:none;text-align:center;transition:opacity .15s;}',
    '.tool-partner-btn:hover{opacity:.85;}',
    '.tool-disclosure{font-size:11px;color:var(--slate,#636366);font-style:italic;text-align:center;max-width:640px;margin:0 auto 12px;padding:0 16px;}'
  ].join('');
  document.head.appendChild(s);
})();

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
        '<a href="' + escHtml(cfg.buttonHref || '/login?tab=signup') + '" class="tool-cta-btn">' +
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
    var fbSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
    var xSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
    var liSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
    root.innerHTML =
      '<div class="tool-share">' +
        '<h3>Share This Calculator</h3>' +
        '<div class="tool-share-btns">' +
          '<a href="https://www.facebook.com/sharer/sharer.php?u=' + url + '" target="_blank" rel="noopener" class="tool-share-btn tool-share-facebook">' + fbSvg + ' Facebook</a>' +
          '<a href="https://twitter.com/intent/tweet?url=' + url + '&text=' + text + '" target="_blank" rel="noopener" class="tool-share-btn tool-share-x">' + xSvg + ' Post</a>' +
          '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + url + '" target="_blank" rel="noopener" class="tool-share-btn tool-share-linkedin">' + liSvg + ' LinkedIn</a>' +
        '</div>' +
      '</div>';
  }

  function renderPartners(root, links) {
    if (!links || !links.length) return;
    var html = '<div class="tool-partners">' +
      '<div class="tool-partners-eye">\uD83E\uDD1D Recommended Partners</div>' +
      '<div class="tool-partners-grid">';
    links.forEach(function(p) {
      html += '<div class="tool-partner-tile">';
      if (p.badge) html += '<span class="tool-partner-badge">' + escHtml(p.badge) + '</span>';
      html += '<div class="tool-partner-name">' + escHtml(p.name) + '</div>' +
        '<div class="tool-partner-tagline">' + escHtml(p.tagline || '') + '</div>' +
        '<a href="' + escHtml(p.url) + '" target="_blank" rel="noopener sponsored" class="tool-partner-btn">Learn more \u2192</a>' +
        '</div>';
    });
    html += '</div></div>';
    root.innerHTML = html;
  }

  function renderDisclosure(root) {
    root.innerHTML = '<p class="tool-disclosure">Disclosure: Some links on this page are referral links. We may earn a small fee at no extra cost to you.</p>';
  }

  function renderTrust(root) {
    function badge(color, abbr) {
      return '<svg class="tool-trust-shield" viewBox="0 0 36 42" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M18 1L3 7.5v15c0 11 15 18 15 18s15-7 15-18v-15L18 1z" fill="' + color + '" opacity="0.12"/>' +
        '<path d="M18 1L3 7.5v15c0 11 15 18 15 18s15-7 15-18v-15L18 1z" fill="none" stroke="' + color + '" stroke-width="1.5"/>' +
        '<text x="18" y="26" text-anchor="middle" font-family="var(--font-mono),monospace" font-size="9" font-weight="700" letter-spacing="0.5" fill="' + color + '">' + abbr + '</text>' +
        '</svg>';
    }

    var badges = [
      { abbr: 'ATO',  name: 'Australian Taxation Office',                      color: '#1B4F72' },
      { abbr: 'RBA',  name: 'Reserve Bank of Australia',                       color: '#1A5632' },
      { abbr: 'APRA', name: 'Australian Prudential Regulation Authority',      color: '#6C3483' },
      { abbr: 'ASIC', name: 'Australian Securities & Investments Commission',  color: '#B7450D' },
      { abbr: 'SRO',  name: 'State Revenue Offices',                           color: '#1C6EA4' }
    ];

    var html = '<div class="tool-trust">' +
      '<div class="tool-trust-title">Data sourced from official Australian bodies</div>' +
      '<div class="tool-trust-logos">';
    badges.forEach(function(b) {
      html += '<span class="tool-trust-logo" title="' + escHtml(b.name) + '">' +
        badge(b.color, b.abbr) +
        '<span class="tool-trust-name">' + escHtml(b.name) + '</span>' +
        '</span>';
    });
    html += '</div></div>';
    root.innerHTML = html;
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
        '<a href="' + escHtml(signupHref || '/login?tab=signup') + '" class="tool-save-prompt-btn">Create free account \u2192</a>' +
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

  function _fetchPartners(slug) {
    var partnersRoot = document.getElementById('tool-partners-root');
    var disclosureRoot = document.getElementById('tool-disclosure-root');
    if (!partnersRoot && !disclosureRoot) return;
    fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getPublicConfig' })
    })
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var all = (data && data.config && data.config.partnerLinks) || {};
      var global = all['global'] || [];
      var specific = slug ? (all[slug] || []) : [];
      // Merge global + specific, dedupe by url
      var seen = {};
      var links = global.concat(specific).filter(function(p) {
        if (!p || !p.url || seen[p.url]) return false;
        seen[p.url] = true;
        return true;
      });
      if (!links.length) return;
      if (partnersRoot) renderPartners(partnersRoot, links);
      if (disclosureRoot) renderDisclosure(disclosureRoot);
    })
    .catch(function(){});
  }

  function init(config) {
    var el;

    el = document.getElementById('tool-cta-root');
    if (el) renderCTA(el, config.cta);

    _watchForResult(config.cta && config.cta.buttonHref);

    el = document.getElementById('tool-trust-root');
    if (el) renderTrust(el);

    el = document.getElementById('tool-resources-root');
    if (el) renderResources(el, config.resources);

    el = document.getElementById('tool-share-root');
    if (el) renderShare(el, config.share);

    el = document.getElementById('tool-related-root');
    if (el) renderRelated(el, config.related);

    el = document.getElementById('tool-footer-root');
    if (el) renderFooter(el, config.footer);

    _fetchPartners(config.partnerSlug || '');
  }

  /* ── Public API ── */

  return { init: init, dismissSavePrompt: dismissSavePrompt };

})();

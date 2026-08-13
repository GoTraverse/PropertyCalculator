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

  function renderCTA(root, cfg) {
    if (!cfg) return;
    root.innerHTML =
      '<div class="tool-cta" id="cta" style="display:none">' +
        '<div class="tool-cta-eye">' + escHtml(cfg.eyebrow || 'Go deeper') + '</div>' +
        '<h2>' + escHtml(cfg.title) + '</h2>' +
        '<p>' + escHtml(cfg.description) + '</p>' +
        '<a href="' + escHtml(cfg.buttonHref || '/journey') + '" class="tool-cta-btn">' +
          escHtml(cfg.buttonText || 'Start your first-home journey \u2192') +
        '</a>' +
      '</div>';
  }

  // Monoline SVG icons replacing the emoji formerly used as resource-group
  // headers (de-emoji pass). Keyed by base emoji (variation selector stripped)
  // so both surrogate+FE0F and surrogate resolve. Unknown -> no icon.
  var RES_ICON_WRAP = '<svg class="tool-res-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var RES_ICONS = {
    '\uD83D\uDCDA': '<path d="M4.5 5.5h4v13h-4zM9.5 5.5h4v13h-4z"/><path d="M15 6.6l3.6.9 0 12.4-3.6-.9z"/>', '\uD83D\uDCD6': '<path d="M4.5 5.5h4v13h-4zM9.5 5.5h4v13h-4z"/><path d="M15 6.6l3.6.9 0 12.4-3.6-.9z"/>',
    '\uD83C\uDFDB': '<path d="M12 3.4 3 9.4h18z"/><path d="M5 9.6v9M9.5 9.6v9M14.5 9.6v9M19 9.6v9"/><path d="M3.5 18.6h17M4 21h16"/>',
    '\uD83C\uDFAF': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="1.1"/>',
    '\uD83C\uDF81': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="1.1"/>',
    '\uD83D\uDCB0': '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8v10.4"/><path d="M14.6 9c-.6-.9-1.6-1.3-2.7-1.3-1.5 0-2.9.8-2.9 2.2 0 2.9 5.7 1.6 5.7 4.5 0 1.4-1.4 2.3-3 2.3-1.2 0-2.3-.5-2.9-1.4"/>', '\uD83D\uDCB5': '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8v10.4"/><path d="M14.6 9c-.6-.9-1.6-1.3-2.7-1.3-1.5 0-2.9.8-2.9 2.2 0 2.9 5.7 1.6 5.7 4.5 0 1.4-1.4 2.3-3 2.3-1.2 0-2.3-.5-2.9-1.4"/>', '\uD83E\uDE99': '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8v10.4"/><path d="M14.6 9c-.6-.9-1.6-1.3-2.7-1.3-1.5 0-2.9.8-2.9 2.2 0 2.9 5.7 1.6 5.7 4.5 0 1.4-1.4 2.3-3 2.3-1.2 0-2.3-.5-2.9-1.4"/>',
    '\uD83C\uDFE6': '<rect x="3.3" y="5" width="17.4" height="14" rx="2"/><path d="M16.5 5v14"/><circle cx="10" cy="12" r="3.3"/><path d="M10 7.5v1.2M10 15.3v1.2M5.5 12h1.2M13.3 12h1.2"/>',
    '\uD83C\uDFE0': '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.7V20h12V9.7"/><path d="M10 20v-5.5h4V20"/>',
    '\uD83C\uDFE2': '<rect x="5" y="3.4" width="14" height="17.1" rx="1"/><path d="M8.6 7h1.8M13.6 7h1.8M8.6 11h1.8M13.6 11h1.8M8.6 15h1.8M13.6 15h1.8"/><path d="M3.8 20.5h16.4"/>', '\uD83D\uDD28': '<rect x="5" y="3.4" width="14" height="17.1" rx="1"/><path d="M8.6 7h1.8M13.6 7h1.8M8.6 11h1.8M13.6 11h1.8M8.6 15h1.8M13.6 15h1.8"/><path d="M3.8 20.5h16.4"/>',
    '\uD83D\uDCCA': '<path d="M4 20.5h16"/><rect x="5.4" y="12" width="3" height="6.6" rx=".6"/><rect x="10.5" y="8" width="3" height="10.6" rx=".6"/><rect x="15.6" y="4.4" width="3" height="14.2" rx=".6"/>', '\uD83D\uDCC8': '<path d="M4 20.5h16"/><rect x="5.4" y="12" width="3" height="6.6" rx=".6"/><rect x="10.5" y="8" width="3" height="10.6" rx=".6"/><rect x="15.6" y="4.4" width="3" height="14.2" rx=".6"/>',
    '\uD83D\uDCCB': '<rect x="5" y="4.5" width="14" height="16" rx="1.8"/><rect x="8.5" y="2.9" width="7" height="3.3" rx="1"/><path d="M8.6 11h6.8M8.6 14.5h6.8"/>',
    '\uD83D\uDCB3': '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 9.9h18M6.5 14.2h4"/>',
    '\uD83D\uDCCD': '<path d="M12 21s6.5-6 6.5-10.6a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21Z"/><circle cx="12" cy="10.4" r="2.4"/>',
    '\u2696': '<circle cx="12" cy="4.7" r="1.25"/><path d="M12 6v13M8.5 19h7M5.5 8.3h13"/><path d="M5.5 8.3 3 12.6M5.5 8.3 8 12.6M3 12.6a2.5 2.5 0 0 0 5 0"/><path d="M18.5 8.3 16 12.6M18.5 8.3 21 12.6M16 12.6a2.5 2.5 0 0 0 5 0"/>'
  };
  function resIcon(emoji) {
    var k = (emoji || '').replace(/\uFE0F/g, '');
    return RES_ICONS[k] ? (RES_ICON_WRAP + RES_ICONS[k] + '</svg>') : '';
  }
  var TRUST_EMBLEM = '<svg class="tool-trust-emblem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 4.5 5.2V11c0 4.6 3.2 7.9 7.5 9.3 4.3-1.4 7.5-4.7 7.5-9.3V5.2z"/><path d="M9 11.2l2.1 2.1 4-4.2"/></svg>';

  function renderResources(root, cfg) {
    if (!cfg || !cfg.groups) return;
    var html = '<div class="tool-resources">' +
      '<h2 class="tool-resources-title"><svg class="tool-res-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 5.5h4v13h-4zM9.5 5.5h4v13h-4z"/><path d="M15 6.6l3.6.9 0 12.4-3.6-.9z"/></svg> Government resources &amp; further reading</h2>' +
      '<div class="tool-resources-grid">';

    cfg.groups.forEach(function(group) {
      html += '<div><h3>' + resIcon(group.icon) + escHtml(group.title) + '</h3><ul>';
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
        '<h2>Share this calculator</h2>' +
        '<div class="tool-share-btns">' +
          '<a href="https://www.facebook.com/sharer/sharer.php?u=' + url + '" target="_blank" rel="noopener" class="tool-share-btn tool-share-facebook">' + fbSvg + ' Facebook</a>' +
          '<a href="https://twitter.com/intent/tweet?url=' + url + '&text=' + text + '" target="_blank" rel="noopener" class="tool-share-btn tool-share-x">' + xSvg + ' Post</a>' +
          '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + url + '" target="_blank" rel="noopener" class="tool-share-btn tool-share-linkedin">' + liSvg + ' LinkedIn</a>' +
        '</div>' +
      '</div>';
  }

  function renderTrust(root) {
    // Each badge is an inline SVG shield with the agency's official brand
    // colour, a subtle vertical gradient fill, the abbreviation in
    // monospace, and a small accent bar at the bottom that doubles as a
    // visual anchor and reinforces the agency colour. Inline SVG (not
    // <img>) means there's nothing to fetch and the badges render before
    // any network round-trip.
    //
    // Why not use real agency logos? Government brand-asset rules
    // generally require written permission for logo reproduction even in
    // a "data sourced from..." attribution context. The custom shield
    // approach references each agency by its widely-recognised
    // abbreviation (factual, not branding) and keeps the row visually
    // cohesive across five very stylistically different agencies.
    var idCounter = 0;
    function badge(color, abbr, accent) {
      idCounter++;
      var grad = 'tt-grad-' + idCounter;
      var inner = 'tt-inner-' + idCounter;
      return '<svg class="tool-trust-shield" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="' + grad + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="' + color + '" stop-opacity="0.20"/>' +
            '<stop offset="1" stop-color="' + color + '" stop-opacity="0.06"/>' +
          '</linearGradient>' +
          '<linearGradient id="' + inner + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>' +
            '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>' +
        // Shield outline — refined geometry: clean shoulders, longer
        // point. Rounded join keeps the apex from looking spiky.
        '<path d="M20 2 L4 8 V24 C4 35 20 45 20 45 C20 45 36 35 36 24 V8 L20 2 Z" ' +
          'fill="url(#' + grad + ')" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round"/>' +
        // Soft inner highlight — a translucent white rim along the top
        // edge gives the shield an embossed, more "official" feel without
        // any drop-shadow filter (which would force a layout repaint).
        '<path d="M20 4 L6 9.2 V13 L20 8 L34 13 V9.2 L20 4 Z" fill="url(#' + inner + ')"/>' +
        // Accent bar — short horizontal line near the bottom in the
        // agency's secondary colour. Adds a hint of identity without
        // approaching trademark territory.
        '<rect x="13" y="33" width="14" height="1.6" rx="0.8" fill="' + (accent || color) + '" opacity="0.9"/>' +
        // Abbreviation
        '<text x="20" y="22" text-anchor="middle" dominant-baseline="central" ' +
          'font-family="var(--font-mono),ui-monospace,monospace" font-size="9.5" font-weight="700" letter-spacing="0.6" fill="' + color + '">' + abbr + '</text>' +
        '</svg>';
    }

    // Brand colours sourced from each agency's official style guide,
    // matched to the closest hex. Accent colour usually equals the
    // primary; only diverges when the agency's secondary palette gives
    // a more legible bottom-bar option.
    var badges = [
      { abbr: 'ATO',  name: 'Australian Taxation Office',                      color: '#00698F', accent: '#0095C8' },
      { abbr: 'RBA',  name: 'Reserve Bank of Australia',                       color: '#002B5C', accent: '#7B1F2A' },
      { abbr: 'APRA', name: 'Australian Prudential Regulation Authority',      color: '#00205B', accent: '#3D6FB4' },
      { abbr: 'ASIC', name: 'Australian Securities & Investments Commission',  color: '#002F6C', accent: '#0067B1' },
      { abbr: 'SRO',  name: 'State Revenue Offices',                           color: '#1C6EA4', accent: '#4FA3D1' }
    ];

    var html = '<div class="tool-trust">' +
      '<div class="tool-trust-title">Built on official Australian frameworks</div>' +
      '<div class="tool-trust-logos">';
    badges.forEach(function(b) {
      html += '<span class="tool-trust-logo" title="' + escHtml(b.name) + '">' +
        TRUST_EMBLEM +
        '<span class="tool-trust-abbr">' + escHtml(b.abbr) + '</span>' +
        '<span class="tool-trust-name">' + escHtml(b.name) + '</span>' +
        '</span>';
    });
    html += '</div></div>';
    root.innerHTML = html;
  }

  function renderRelated(root, links) {
    if (!links || !links.length) return;
    var html = '<div class="tool-related"><h2>Related calculators</h2><div class="tool-related-grid">';
    links.forEach(function(link) {
      html += '<a href="' + escHtml(link.href) + '" class="tool-related-link">' + escHtml(link.label) + '</a>';
    });
    html += '</div></div>';
    root.innerHTML = html;
  }

  function renderExamples(root, cfg) {
    if (!cfg || !cfg.length) return;
    var html = '<div class="tool-examples">' +
      '<h2>Example calculations</h2>' +
      '<div class="tool-examples-grid">';
    cfg.forEach(function(ex) {
      html += '<div class="tool-example-card">';
      if (ex.label) html += '<div class="tool-example-label">' + escHtml(ex.label) + '</div>';
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
    var html = '<div class="tool-faq"><h2>Frequently asked questions</h2>';
    cfg.forEach(function(qa) {
      html += '<details class="tool-faq-item">' +
        '<summary class="tool-faq-q">' + escHtml(qa.q) + '</summary>' +
        '<div class="tool-faq-a">' + escHtml(qa.a) + '</div>' +
        '</details>';
    });
    html += '</div>';
    root.innerHTML = html;

    // Inject FAQPage JSON-LD so the rendered Q&A is eligible for rich
    // snippets — but skip if the static HTML already carries one. 17 of
    // 23 tool pages ship FAQPage schema baked into the HTML (better for
    // crawlers + AdSense, which read pre-rendered markup), and the
    // runtime inject was producing a second copy. GSC reported
    // "Duplicate field FAQPage" → rich-result eligibility invalidated.
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

  function renderUsefulLinks(root, cfg) {
    if (!cfg || !cfg.length) return;
    var groups = {};
    var order = [];
    cfg.forEach(function(link) {
      var g = link.group || 'Useful Links';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(link);
    });
    var html = '<div class="tool-useful-links"><h2>Useful links</h2><div class="tool-useful-grid">';
    order.forEach(function(g) {
      html += '<div class="tool-useful-group"><h3>' + escHtml(g) + '</h3><ul>';
      groups[g].forEach(function(l) {
        html += '<li><a href="' + escHtml(l.href) + '" class="tool-useful-link">' + '→ ' + escHtml(l.label) + '</a></li>';
      });
      html += '</ul></div>';
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
    try { var s = JSON.parse(localStorage.getItem('propCalc_session_v1')); return !!(s && s.id); } catch(e) { return false; }
  }

  function _savePromptDismissed() {
    try { return sessionStorage.getItem('esSavePromptDismissed') === '1'; } catch(e) { return false; }
  }

  function _injectSavePrompt(signupHref) {
    var el = document.createElement('div');
    el.id = 'tool-save-prompt';
    el.className = 'tool-save-prompt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Keep going');
    el.innerHTML =
      '<div class="tool-save-prompt-text">' +
        '<strong>Keep going</strong>' +
        '<span>The free First Home Journey turns these numbers into a full plan \u2014 schemes compared, a budget with a firm maximum price, and your contract deadlines tracked.</span>' +
      '</div>' +
      '<div class="tool-save-prompt-actions">' +
        '<a href="' + escHtml(signupHref || '/journey') + '" class="tool-save-prompt-btn">Start the journey \u2192</a>' +
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

    // The "go deeper" CTA and the post-result prompt both route to the free
    // First Home Journey — the journey is the product; there is no signup
    // pitch on tool pages for logged-out visitors.
    _watchForResult('/journey');

    el = document.getElementById('tool-share-root');
    if (el) renderShare(el, config.share);

    el = document.getElementById('tool-related-root');
    if (el) renderRelated(el, config.related);

    el = document.getElementById('tool-examples-root');
    if (el) renderExamples(el, config.examples);

    el = document.getElementById('tool-faq-root');
    if (el) renderFAQ(el, config.faq);

    el = document.getElementById('tool-useful-links-root');
    if (el) renderUsefulLinks(el, config.usefulLinks);

    el = document.getElementById('tool-resources-root');
    if (el) renderResources(el, config.resources);

    el = document.getElementById('tool-trust-root');
    if (el) renderTrust(el);

    el = document.getElementById('tool-footer-root');
    if (el) renderFooter(el, config.footer);

  }

  /* ── Public API ── */

  return { init: init, dismissSavePrompt: dismissSavePrompt };

})();

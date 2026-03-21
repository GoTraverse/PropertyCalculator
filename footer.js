/**
 * EquitySight.app — Shared Site Footer Component
 * Usage: place <div id="site-footer-root"></div> where footer should appear,
 * then include this script.
 */
(function () {
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function safeSrc(u){ return (typeof u==='string'&&(/^data:image\/[a-z+]+;base64,/.test(u)||/^https:\/\//.test(u)))?u:''; }
  var cfg = {};
  try { cfg = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1') || '{}'); } catch(e) {}
  var logoMark    = cfg.logoMark || '🏠';
  var logoName    = esc(cfg.logoName || 'EquitySight');
  var logoTld     = esc(cfg.logoTld  !== undefined ? cfg.logoTld : '.app');
  var safeImg     = safeSrc(cfg.logoImage);
  var logoMarkHtml = safeImg
    ? '<img src="' + safeImg + '" style="width:100%;height:100%;object-fit:contain;border-radius:10px;" alt="">'
    : logoMark;

  var FOOTER_HTML = [
    '<footer class="site-footer">',
    '  <div class="site-footer-inner">',
    '    <div class="site-footer-grid">',
    '      <div class="footer-brand">',
    '        <a href="/index.html" class="site-logo" style="margin-bottom:14px;">',
    '          <div class="site-logo-mark">' + logoMarkHtml + '</div>',
    '          <div class="site-logo-text"><span class="site-logo-name">' + logoName + '</span><span class="site-logo-tld">' + logoTld + '</span></div>',
    '        </a>',
    '        <p>Australia\u0027s smartest property finance calculator for first home buyers.</p>',
    '      </div>',
    '      <div class="footer-col"><h4>Product</h4><ul>',
    '        <li><a href="/app.html">Calculator</a></li>',
    '        <li><a href="/pricing.html">Pricing</a></li>',
    '      </ul></div>',
    '      <div class="footer-col"><h4>Company</h4><ul>',
    '        <li><a href="/about.html">About</a></li>',
    '        <li><a href="/contact.html">Contact &amp; Support</a></li>',
    '      </ul></div>',
    '      <div class="footer-col"><h4>Legal</h4><ul>',
    '        <li><a href="/privacy.html">Privacy Policy</a></li>',
    '        <li><a href="/terms.html">Terms of Service</a></li>',
    '        <li><a href="/cookies.html">Cookie Policy</a></li>',
    '        <li><a href="/disclaimer.html">Disclaimer</a></li>',
    '      </ul></div>',
    '    </div>',
    '    <div class="footer-bottom">',
    '      <p>&#169; ' + new Date().getFullYear() + ' ' + logoName + logoTld + ' &middot; Not financial advice &middot; ABN pending.</p>',
    '      <div class="footer-bottom-links">',
    '        <a href="/privacy.html">Privacy</a>',
    '        <a href="/terms.html">Terms</a>',
    '        <a href="/contact.html">Contact</a>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</footer>'
  ].join('\n');

  function renderFooter() {
    var el = document.getElementById('site-footer-root');
    if (!el) return;
    el.innerHTML = FOOTER_HTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }
})();

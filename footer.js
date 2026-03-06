/**
 * EquitySight.app — Shared Site Footer Component
 * Usage: place <div id="site-footer-root"></div> where footer should appear,
 * then include this script.
 */
(function () {
  var FOOTER_HTML = [
    '<footer class="site-footer">',
    '  <div class="site-footer-inner">',
    '    <div class="site-footer-grid">',
    '      <div class="footer-brand">',
    '        <a href="index.html" class="site-logo" style="margin-bottom:14px;">',
    '          <div class="site-logo-mark">🏠</div>',
    '          <div class="site-logo-text"><span class="site-logo-name">EquitySight</span><span class="site-logo-tld">.app</span></div>',
    '        </a>',
    '        <p>Australia\'s smartest property finance calculator for first home buyers.</p>',
    '      </div>',
    '      <div class="footer-col"><h4>Product</h4><ul>',
    '        <li><a href="app.html">Calculator</a></li>',
    '        <li><a href="pricing.html">Pricing</a></li>',
    '      </ul></div>',
    '      <div class="footer-col"><h4>Company</h4><ul>',
    '        <li><a href="about.html">About</a></li>',
    '        <li><a href="contact.html">Contact &amp; Support</a></li>',
    '      </ul></div>',
    '      <div class="footer-col"><h4>Legal</h4><ul>',
    '        <li><a href="privacy.html">Privacy Policy</a></li>',
    '        <li><a href="terms.html">Terms of Service</a></li>',
    '        <li><a href="cookies.html">Cookie Policy</a></li>',
    '        <li><a href="disclaimer.html">Disclaimer</a></li>',
    '      </ul></div>',
    '    </div>',
    '    <div class="footer-bottom">',
    '      <p>&#169; 2025 EquitySight.app &middot; Not financial advice &middot; ABN pending.</p>',
    '      <div class="footer-bottom-links">',
    '        <a href="privacy.html">Privacy</a>',
    '        <a href="terms.html">Terms</a>',
    '        <a href="contact.html">Contact</a>',
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

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
    '    <div class="footer-bar">',
    '      <a href="/" class="site-logo" style="flex-shrink:0;">',
    '        <div class="site-logo-mark">' + logoMarkHtml + '</div>',
    '        <div class="site-logo-text"><span class="site-logo-name">' + logoName + '</span><span class="site-logo-tld">' + logoTld + '</span></div>',
    '      </a>',
    '      <nav class="footer-nav">',
    '        <a href="/pricing">Pricing</a>',
    '        <a href="/blog">Blog</a>',
    '        <a href="/about">About</a>',
    '        <a href="/contact">Support</a>',
    '        <a href="/privacy">Privacy</a>',
    '        <a href="/terms">Terms</a>',
    '      </nav>',
    '      <p class="footer-copy">&#169; ' + new Date().getFullYear() + ' ' + logoName + logoTld + ' &middot; Not financial advice</p>',
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

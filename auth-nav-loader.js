// auth-nav-loader.js — defer the heavy 32 KB auth-nav.js to after
// window.load + idle, while keeping the parts of the nav that the
// user can interact with on first paint (mobile hamburger toggle,
// "Sign in" / "Get started" buttons for unauthenticated visitors).
//
// PageSpeed Insights flagged "Reduce unused JavaScript" — most of
// auth-nav.js's code paths (profile dropdown, color picker, help
// modal, signout overlay) aren't exercised on landing pages.
// Deferring it keeps that ~30 KB of work out of the FCP/LCP critical
// path. When auth-nav.js eventually loads, it overwrites the unauth
// stub with the profile dropdown if a session is present.
(function () {
  // 1) Fill the empty .site-nav-actions slot with the unauthenticated
  //    state immediately. auth-nav.js does the same thing later but
  //    inline content avoids a CLS jump while we wait.
  var actions = document.querySelector('.site-nav-actions');
  if (actions && !actions.firstChild) {
    actions.innerHTML =
      '<a href="/login" class="btn-ghost">Sign in</a>' +
      '<a href="/app" class="btn-gold">' +
        '<span class="nav-btn-full">Try it free</span>' +
        '<span class="nav-btn-short">Try free</span>' +
      '</a>';
  }

  // 2) Wire the mobile hamburger immediately. This is the only way to
  //    reach the nav links on mobile, so we cannot wait for the heavy
  //    script. We mark it data-wired so auth-nav.js skips re-wiring.
  var ham = document.getElementById('nav-ham');
  if (ham && !ham.dataset.wired) {
    ham.dataset.wired = '1';
    ham.addEventListener('click', function () {
      var links = document.querySelector('.site-nav-links');
      if (!links) return;
      if (links.style.display === 'flex') {
        links.style.cssText = '';
      } else {
        links.style.cssText = 'display:flex;flex-direction:column;position:absolute;top:64px;left:0;right:0;background:var(--charcoal-soft);padding:12px 24px;border-top:1px solid rgba(255,255,255,0.06);z-index:999;';
      }
    });
  }

  // 3) Defer auth-nav.js to after window.load + idle.
  function load() {
    var s = document.createElement('script');
    s.src = '/auth-nav.js';
    s.async = true;
    document.head.appendChild(s);
  }
  function schedule() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(load, { timeout: 2500 });
    } else {
      setTimeout(load, 800);
    }
  }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();

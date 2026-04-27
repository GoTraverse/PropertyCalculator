// gtag-loader.js — defers Google Analytics until well after first paint.
//
// Was: <script async src=".../gtag/js?id=..."> + <script src="/gtag-init.js">
// in <head>. The 80 KB gtag.js script + its initialisation parsing/execution
// was being flagged by PageSpeed Insights as "Reduce unused JavaScript" and
// adding to FCP / LCP / TTI on the homepage. None of it is needed before the
// page is fully painted.
//
// Pattern: bind dataLayer + gtag() shim immediately so any early code that
// wants to call `gtag('event', …)` queues the event into dataLayer. Then
// inject the real GA script after window.load + a short idle window. When
// gtag.js eventually loads, it consumes the dataLayer and fires the queued
// events — nothing is lost, but the critical path stays light.
(function () {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }
  gtag('js', new Date());
  gtag('config', 'G-TYQXT24670');

  function inject() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-TYQXT24670';
    document.head.appendChild(s);
  }
  function schedule() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(inject, { timeout: 3000 });
    } else {
      setTimeout(inject, 1500);
    }
  }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();

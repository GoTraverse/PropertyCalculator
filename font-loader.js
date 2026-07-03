// font-loader.js — async-load Google Fonts so they don't block first paint.
//
// Why: a normal <link rel="stylesheet"> in <head> blocks render until the CSS
// arrives. SEOptimer / PageSpeed Insights flag this as a render-blocking
// resource (typically 200-600 ms on mobile). The HTML keeps a
// <link rel="preload" as="style"> so the browser still downloads the file
// in parallel; we just inject the stylesheet dynamically once that download
// is in flight, so the parser is never blocked.
//
// CSP-clean: pure JavaScript file, no inline event handlers needed.
(function () {
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600;700&family=Geist+Mono:wght@300..700&display=swap';
  document.head.appendChild(l);
})();

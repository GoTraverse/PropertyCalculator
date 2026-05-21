// adsense.js — central AdSense configuration
//
// Ads disabled (May 2026) — we don't currently run AdSense, and the empty
// ad-slot placeholders were leaving visible whitespace on calculator pages.
// To re-enable when ads go live: set window.EQUITYSIGHT_ADS_ENABLED = true
// in the page <head> BEFORE this script loads. The script then loads
// adsbygoogle.js and fills the .ad-slot placeholders as before.
//
// The .ad-slot DOM elements remain in place on the pages so that turning
// ads back on is a one-line change — no per-page HTML edits required.

if (window.EQUITYSIGHT_ADS_ENABLED) {
  // TODO: keep slot IDs current with the Google AdSense unit list.
  var ADSENSE_PUBLISHER_ID = 'ca-pub-8128501193606953';
  var ADSENSE_SLOTS = {
    suburb:     '9158606305',  // Ad slot ID for suburb insight pages
    calculator: '2056777808',  // Ad slot ID for calculator pages
  };

  // Dynamically load the AdSense library (avoids duplicating the src URL
  // across every page)
  (function () {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_PUBLISHER_ID;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }());

  // Fill in all .ad-slot[data-ad-type] placeholders on this page
  // This script is loaded with defer, so the DOM is already parsed when it runs.
  document.querySelectorAll('.ad-slot[data-ad-type]').forEach(function (container) {
    var slotId = ADSENSE_SLOTS[container.getAttribute('data-ad-type')];
    if (!slotId) return;
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_PUBLISHER_ID);
    ins.setAttribute('data-ad-slot', slotId);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    container.appendChild(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
}

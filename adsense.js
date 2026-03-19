// adsense.js — central AdSense configuration
// TODO: Replace slot IDs below with your actual ad unit slot IDs from Google AdSense.
// Get these from: https://www.google.com/adsense → Ads → By ad unit → Create new ad unit

var ADSENSE_PUBLISHER_ID = 'ca-pub-8128501193606953';

var ADSENSE_SLOTS = {
  suburb:     '9158606305',  // Ad slot ID for suburb insight pages
  calculator: '2056777808',  // Ad slot ID for calculator pages
};

// Dynamically load the AdSense library (avoids duplicating the src URL across every page)
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

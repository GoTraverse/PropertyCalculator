/**
 * error-capture.js
 * Captures unhandled JS errors and unhandled promise rejections,
 * then POSTs them to /.netlify/functions/client-errors for admin review.
 * Load this file early in every user-facing page (before other scripts).
 */
(function () {
  // Don't run inside admin or Netlify preview bar
  if (typeof window === 'undefined') return;

  var ENDPOINT = '/.netlify/functions/client-errors';
  var sent = [];  // deduplicate within a page session

  function send(entry) {
    // Deduplicate by message+source to avoid flooding on repeated errors
    var key = (entry.message || '') + '|' + (entry.source || '') + '|' + (entry.line || '');
    if (sent.indexOf(key) !== -1) return;
    sent.push(key);
    if (sent.length > 30) sent.shift(); // cap dedup list

    try {
      entry.url       = window.location.href;
      entry.userAgent = navigator.userAgent;
      navigator.sendBeacon
        ? navigator.sendBeacon(ENDPOINT, JSON.stringify({ action: 'logError', error: entry }))
        : fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logError', error: entry }), keepalive: true }).catch(function(){});
    } catch (e) { /* never throw from error handler */ }
  }

  var OWN_ORIGIN = window.location.origin; // e.g. https://equitysight.netlify.app

  window.addEventListener('error', function (e) {
    var src = e.filename || '';
    // Ignore errors from browser extensions or third-party scripts
    // Extension URLs look like: moz-extension://, chrome-extension://, safari-extension://
    if (src && (src.indexOf('extension://') !== -1 || src.indexOf('extension:') !== -1)) return;
    // Only log errors from our own origin or inline scripts (empty/same-page source)
    if (src && src.indexOf('://') !== -1 && src.indexOf(OWN_ORIGIN) !== 1 && src.indexOf(OWN_ORIGIN) !== 0) return;
    send({
      message: e.message || String(e),
      source:  src,
      line:    e.lineno  || null,
      col:     e.colno   || null,
      stack:   e.error && e.error.stack ? e.error.stack : '',
      at:      Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = e.reason
      ? (e.reason.message || String(e.reason))
      : 'Unhandled promise rejection';
    var stack = e.reason && e.reason.stack ? e.reason.stack : '';
    send({ message: msg, source: 'promise', line: null, col: null, stack: stack, at: Date.now() });
  });
})();

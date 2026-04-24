/**
 * error-capture.js
 * Captures unhandled JS errors and unhandled promise rejections,
 * then POSTs them to /.netlify/functions/client-errors for admin review.
 * Load this file early in every user-facing page (before other scripts).
 */
(function () {
  if (typeof window === 'undefined') return;

  var ENDPOINT = '/.netlify/functions/client-errors';
  var sent = [];  // deduplicate within a page session

  // Known noisy non-actionable network/environment errors — suppress entirely.
  // These are not app bugs; they're mobile network drops, offline states, etc.
  var SUPPRESS = [
    'Load failed',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource',
    'The Internet connection appears to be offline',
    'The network connection was lost',
    'cancelled',
    'fetch is aborted',
  ];

  // Substring match — suppress anywhere in the message. Used for third-party /
  // extension-injected parsers that crash on our JSON-LD; our own code never
  // reads `@context.toLowerCase()`, so this is always non-actionable noise.
  var SUPPRESS_CONTAINS = [
    '["@context"]',
    "['@context']",
  ];

  function shouldSuppress(msg) {
    var m = (msg || '').toLowerCase().trim();
    if (SUPPRESS.some(function(s){ return m === s.toLowerCase() || m.startsWith(s.toLowerCase() + ':'); })) return true;
    return SUPPRESS_CONTAINS.some(function(s){ return m.indexOf(s.toLowerCase()) !== -1; });
  }

  function getUser() {
    try {
      var s = JSON.parse(localStorage.getItem('propCalc_session_v1') || 'null');
      return s ? { userId: s.id || s.userId || '', userName: s.name || '', userEmail: s.email || '' } : {};
    } catch(e) { return {}; }
  }

  function send(entry) {
    if (shouldSuppress(entry.message)) return;

    // Deduplicate by message+source to avoid flooding on repeated errors
    var key = (entry.message || '') + '|' + (entry.source || '') + '|' + (entry.line || '');
    if (sent.indexOf(key) !== -1) return;
    sent.push(key);
    if (sent.length > 30) sent.shift(); // cap dedup list

    try {
      entry.url       = window.location.href;
      entry.userAgent = navigator.userAgent;
      var u = getUser();
      entry.userId    = u.userId    || '';
      entry.userName  = u.userName  || '';
      entry.userEmail = u.userEmail || '';
      navigator.sendBeacon
        ? navigator.sendBeacon(ENDPOINT, JSON.stringify({ action: 'logError', error: entry }))
        : fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logError', error: entry }), keepalive: true }).catch(function(){});
    } catch (e) { /* never throw from error handler */ }
  }

  var OWN_ORIGIN = window.location.origin;

  window.addEventListener('error', function (e) {
    var src = e.filename || '';
    // Ignore errors from browser extensions or third-party scripts
    if (src && (src.indexOf('extension://') !== -1 || src.indexOf('extension:') !== -1)) return;
    // Only log errors from our own origin or inline scripts
    if (src && src.indexOf('://') !== -1 && src.indexOf(OWN_ORIGIN) !== 1 && src.indexOf(OWN_ORIGIN) !== 0) return;
    var msg = e.message || String(e);
    send({
      message:  msg,
      source:   src,
      line:     e.lineno  || null,
      col:      e.colno   || null,
      stack:    e.error && e.error.stack ? e.error.stack : '',
      at:       Date.now(),
      severity: 'error',
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = e.reason
      ? (e.reason.message || String(e.reason))
      : 'Unhandled promise rejection';
    var stack = e.reason && e.reason.stack ? e.reason.stack : '';
    // Promise rejections with no stack are usually network noise — warn, don't error
    var severity = stack ? 'error' : 'warning';
    send({ message: msg, source: 'promise', line: null, col: null, stack: stack, at: Date.now(), severity: severity });
  });

  // Capture CSP violations (these fire as securitypolicyviolation events, not error events)
  document.addEventListener('securitypolicyviolation', function (e) {
    var src = e.sourceFile || '';
    // Drop violations originating from browser extensions (Safari/Chrome content blockers, password managers, etc.)
    if (src && (src.indexOf('extension://') !== -1 || src.indexOf('extension:') !== -1)) return;
    // Drop "inline" blocks that don't come from our own origin — these are almost always iOS
    // browser-injected content (autofill helpers, translation overlays, content blockers). Our own
    // inline scripts, if any, would report a sourceFile on OWN_ORIGIN and still surface here.
    if (e.blockedURI === 'inline' && (!src || src.indexOf(OWN_ORIGIN) !== 0)) return;
    var msg = 'CSP violation: ' + (e.violatedDirective || e.effectiveDirective || 'unknown') + ' — blocked "' + (e.blockedURI || '') + '"';
    send({
      message:  msg,
      source:   src || e.documentURI || '',
      line:     e.lineNumber || null,
      col:      e.columnNumber || null,
      stack:    '',
      at:       Date.now(),
      severity: 'error',
    });
  });
})();

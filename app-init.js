// Guest-friendly init for app.html.
// Loaded synchronously (no defer/async) so it runs before the page renders.
//
// Guest mode (Jun 2026): logged-out visitors may use the full /app as guests —
// the previous hard redirect to /login was the #1 signup leak (see APP_AUDIT.md).
// We no longer redirect anyone from here. We only CLEAR a genuinely corrupt or
// identity-less session blob so it can't confuse downstream code, then fall
// through to guest mode. /account and admin pages keep their own guards, and the
// server still rejects bad/absent tokens on protected actions.
(function(){
  try {
    var raw = localStorage.getItem('propCalc_session_v1');
    if (!raw || raw === 'null' || raw === '{}') { return; }   // no session → guest
    var user = JSON.parse(raw);
    // Structurally-valid JSON but no identity → normalise the dud blob, stay a guest.
    if (!user || (!user.id && !user.email && !user.name)) {
      try { localStorage.removeItem('propCalc_session_v1'); } catch(_){}
    }
    // Otherwise a real session → continue as a logged-in user.
  } catch(e) {
    // Genuinely corrupt session string → clear it, then continue as a guest (no redirect).
    try { localStorage.removeItem('propCalc_session_v1'); } catch(_){}
  }
})();

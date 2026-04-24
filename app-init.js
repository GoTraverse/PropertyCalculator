// Auth guard for app.html — redirect to login if no valid session exists.
// Loaded synchronously (no defer/async) so it runs before the page renders.
// Be permissive: any non-empty session object is accepted here.
// The server will reject bad tokens; this just prevents unauthenticated blank loads.
(function(){
  try {
    var raw = localStorage.getItem('propCalc_session_v1');
    if (!raw || raw === 'null' || raw === '{}') { location.replace('/login'); return; }
    var user = JSON.parse(raw);
    if (!user || (!user.id && !user.email && !user.name)) { location.replace('/login'); }
  } catch(e) {
    try { localStorage.removeItem('propCalc_session_v1'); } catch(_){}
    location.replace('/login');
  }
})();

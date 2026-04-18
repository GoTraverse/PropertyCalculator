// Apply saved theme before render to prevent flash of wrong theme.
// Loaded synchronously (no defer/async) so it runs before CSS paints.
(function(){ try{ if(localStorage.getItem('equitySight_theme')==='dark') document.documentElement.classList.add('dark-mode'); }catch(e){} })();
// Pre-signup page trail — record pages visited before the user creates an account.
// Stored in localStorage and sent to the server on signup/googleSignin so the admin
// panel can see the journey that led to conversion. Capped at 20 entries.
(function(){
  try{
    var KEY='es_page_trail';
    var s=localStorage.getItem('propCalc_session_v1');
    if(s&&JSON.parse(s).id) return; // already logged in — stop recording
    var trail=JSON.parse(localStorage.getItem(KEY)||'[]');
    var entry={p:location.pathname,t:Date.now()};
    if(location.search) entry.q=location.search.slice(0,120);
    // Skip duplicates of same page within 5 seconds (e.g. quick reloads)
    var last=trail[trail.length-1];
    if(last&&last.p===entry.p&&entry.t-last.t<5000) return;
    trail.push(entry);
    if(trail.length>20) trail=trail.slice(-20);
    localStorage.setItem(KEY,JSON.stringify(trail));
  }catch(e){}
})();

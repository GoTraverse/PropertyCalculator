// State hub suburb search + pagination
(function(){
  var BATCH=100, cards=document.querySelectorAll('#hub-suburb-list .hub-suburb-card');
  var shown=BATCH, btn=document.getElementById('hub-show-more'), search=document.getElementById('suburb-search');
  var noRes=document.getElementById('hub-no-results');
  // Also search the reference drawer (noindexed localities) so visitors can
  // still find smaller places by name/postcode. When a query matches inside
  // the drawer we auto-open it.
  var drawer=document.querySelector('.hub-reference-drawer');
  var refLinks=document.querySelectorAll('.hub-reference-drawer .hub-reference-link');
  if(!search||!btn||!cards.length) return;
  function showCards(n){for(var i=0;i<cards.length;i++)cards[i].style.display=i<n?'':'none';shown=n;btn.style.display=n<cards.length?'':'none';}
  function resetDrawer(){
    if(!drawer)return;
    drawer.open=false;
    for(var i=0;i<refLinks.length;i++)refLinks[i].style.display='';
  }
  showCards(BATCH);
  btn.onclick=function(){
    showCards(shown+BATCH);
    // Track "Show more" clicks on state hubs
    if(window.trackPageEvent) trackPageEvent('hub_show_more', {'suburbs_shown': shown+BATCH, 'total_suburbs': cards.length});
  };
  var timer;
  function doSearch(){
    clearTimeout(timer);
    timer=setTimeout(function(){
      var q=search.value.trim().toLowerCase();
      if(!q){showCards(BATCH);noRes.style.display='none';resetDrawer();return;}
      var count=0;
      for(var i=0;i<cards.length;i++){
        var text=cards[i].getAttribute('data-search')||(cards[i].textContent||'').toLowerCase();
        var match=text.indexOf(q)>=0;
        cards[i].style.display=match?'block':'none';
        if(match)count++;
      }
      btn.style.display='none';
      // Search drawer and auto-open on any hit
      var refMatches=0;
      for(var j=0;j<refLinks.length;j++){
        var rt=(refLinks[j].textContent||'').toLowerCase();
        var rm=rt.indexOf(q)>=0;
        refLinks[j].style.display=rm?'':'none';
        if(rm)refMatches++;
      }
      if(drawer)drawer.open=refMatches>0;
      var totalMatches=count+refMatches;
      noRes.style.display=totalMatches?'none':'block';
      // Track suburb searches
      if(window.trackPageEvent) trackPageEvent('suburb_search', {'search_query': q.substring(0, 50), 'results_count': totalMatches});
    },180);
  }
  search.addEventListener('input',doSearch);
  search.addEventListener('keyup',doSearch);
})();

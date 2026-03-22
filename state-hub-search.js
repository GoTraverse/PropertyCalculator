// State hub suburb search + pagination
(function(){
  var BATCH=100, cards=document.querySelectorAll('#hub-suburb-list .hub-suburb-card');
  var shown=BATCH, btn=document.getElementById('hub-show-more'), search=document.getElementById('suburb-search');
  var noRes=document.getElementById('hub-no-results');
  if(!search||!btn||!cards.length) return;
  function showCards(n){for(var i=0;i<cards.length;i++)cards[i].style.display=i<n?'':'none';shown=n;btn.style.display=n<cards.length?'':'none';}
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
      if(!q){showCards(BATCH);noRes.style.display='none';return;}
      var count=0;
      for(var i=0;i<cards.length;i++){
        var text=cards[i].getAttribute('data-search')||(cards[i].textContent||'').toLowerCase();
        var match=text.indexOf(q)>=0;
        cards[i].style.display=match?'block':'none';
        if(match)count++;
      }
      btn.style.display='none';
      noRes.style.display=count?'none':'block';
      // Track suburb searches
      if(window.trackPageEvent) trackPageEvent('suburb_search', {'search_query': q.substring(0, 50), 'results_count': count});
    },180);
  }
  search.addEventListener('input',doSearch);
  search.addEventListener('keyup',doSearch);
})();

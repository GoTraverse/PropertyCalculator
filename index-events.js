// index-events.js — Event listeners for index.html
var scrollToolsBtn = document.getElementById('scroll-to-tools-btn');
if(scrollToolsBtn) scrollToolsBtn.addEventListener('click', function(){
  document.getElementById('free-tools').scrollIntoView({behavior: 'smooth'});
});

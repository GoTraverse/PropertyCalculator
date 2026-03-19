// about-init.js — Load custom about page content if admin has edited it
(function(){
  try {
    var stored = localStorage.getItem('propCalc_aboutPage_v1');
    if(stored) {
      var data = JSON.parse(stored);
      if(data.heroH1) document.getElementById('about-h1').innerHTML = data.heroH1;
      if(data.heroLead) document.getElementById('about-lead').textContent = data.heroLead;
      if(data.storyH2) document.getElementById('about-story-h2').textContent = data.storyH2;
      if(data.storyP1) document.getElementById('about-story-p1').textContent = data.storyP1;
    }
  } catch(e) {}
})();

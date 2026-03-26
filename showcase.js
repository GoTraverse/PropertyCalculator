(function(){
  var lb    = document.getElementById('sc-lightbox');
  var lbImg = document.getElementById('sc-lb-img');
  var lbBtn = document.getElementById('sc-lb-close');
  if(!lb || !lbImg || !lbBtn) return;
  function openLb(src, alt){ lbImg.src = src; lbImg.alt = alt || ''; lb.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  function closeLb(){ lb.style.display = 'none'; document.body.style.overflow = ''; lbImg.src = ''; }
  document.querySelectorAll('.sc-slot img').forEach(function(img){
    img.addEventListener('click', function(){ openLb(img.src, img.alt); });
  });
  lbBtn.addEventListener('click', closeLb);
  lb.addEventListener('click', function(e){ if(e.target === lb) closeLb(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeLb(); });
})();

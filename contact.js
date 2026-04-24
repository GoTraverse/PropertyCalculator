// contact.js — Contact page logic

function showChatNotice(){
  alert('Live chat is available to Pro subscribers during business hours (AEST Mon\u2013Fri). Upgrade to Pro or send us an email and we\u2019ll get back to you within 24 hours.');
}

async function submitForm(){
  const fname = document.getElementById('cf-fname').value.trim();
  const lname = (document.getElementById('cf-lname')||{}).value||'';
  const email = document.getElementById('cf-email').value.trim();
  const subject = document.getElementById('cf-subject').value;
  const msg = document.getElementById('cf-message').value.trim();
  const errEl = document.getElementById('cf-error');
  const btn = document.getElementById('cf-submit');
  if(!fname||!email||!subject||!msg){ errEl.textContent='Please fill in all required fields.'; return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ errEl.textContent='Please enter a valid email address.'; return; }
  errEl.textContent='';
  btn.disabled=true; btn.textContent='Sending\u2026';
  try{
    const r=await fetch('/.netlify/functions/contact',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:(fname+' '+lname).trim(),email:email,subject:subject,message:msg})
    });
    const d=await r.json();
    if(!d.ok){ errEl.textContent=d.error||'Failed to send \u2014 please try again.'; btn.disabled=false; btn.textContent='Send Message \u2192'; return; }
  }catch(e){ errEl.textContent='Network error \u2014 please try again.'; btn.disabled=false; btn.textContent='Send Message \u2192'; return; }
  // Track form submission
  if(window.trackFormSubmission) trackFormSubmission('contact_form', true);
  document.getElementById('contact-form').style.display='none';
  document.getElementById('cf-success').style.display='block';
}

// Support cards
(function(){
  const cards = document.querySelectorAll('.support-card');
  if(cards[0]) cards[0].addEventListener('click', function(){ location.href='mailto:support@EquitySight.app'; });
  if(cards[1]) cards[1].addEventListener('click', showChatNotice);
  if(cards[2]) cards[2].addEventListener('click', function(){ location.href='/pricing#comparison'; });
})();

// Form submit button
const cfSubmit = document.getElementById('cf-submit');
if(cfSubmit) cfSubmit.addEventListener('click', submitForm);

// FAQ accordion
document.querySelectorAll('.faq-q').forEach(function(btn){
  btn.addEventListener('click', function(){
    this.closest('.faq-item').classList.toggle('open');
    // Track FAQ click
    const faqText = this.textContent.substring(0, 50).trim();
    if(window.trackHelpEngagement) trackHelpEngagement('faq_clicked', faqText);
  });
});

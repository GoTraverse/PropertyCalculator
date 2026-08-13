// pricing.js — Pricing page logic

var annual = false;

async function startCheckout(){
  var SK = 'propCalc_session_v1';
  var session = null;
  try { session = JSON.parse(localStorage.getItem(SK)); } catch(e){}

  // Not logged in → send to signup, then back here
  if(!session || !session.id){
    location.href = '/login?tab=signup&plan=pro&redirect=' + encodeURIComponent('/pricing?checkout=1');
    return;
  }

  var btn = document.getElementById('pro-cta-btn');
  btn.textContent = 'Loading…';
  btn.disabled = true;

  var priceId = annual
    ? (window.STRIPE_PRICES && window.STRIPE_PRICES.pro_annual)
    : (window.STRIPE_PRICES && window.STRIPE_PRICES.pro_monthly);

  try {
    var r = await fetch('/.netlify/functions/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createCheckout', priceId: priceId, plan: 'pro' }),
    });
    var d = await r.json();
    if(d.ok && d.url){
      location.href = d.url;
    } else {
      alert(d.error || 'Something went wrong. Please try again.');
      btn.textContent = 'Get Pro →';
      btn.disabled = false;
    }
  } catch(e){
    alert('Network error. Please try again.');
    btn.textContent = 'Get Pro →';
    btn.disabled = false;
  }
}

// The Pro price is hardcoded in pricing.html — do NOT overwrite
// them from localStorage. Older admin sessions still carry
// proMonthlyPrice=2.99 from the launch promo in their cached config and
// would clobber the post-launch $8.99 on every page load.
// Free scenario limit and tracking event remain config-driven.
(function(){
  try{
    var cfg = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}');
    var freeScenarioLimit = cfg.freeScenarioLimit || 1;

    if(window.trackPageEvent) {
      trackPageEvent('pricing_page_view', {
        'free_scenario_limit': freeScenarioLimit,
      });
    }

    var freeLimitText = freeScenarioLimit + ' saved scenario' + (freeScenarioLimit > 1 ? 's' : '');
    var freeLimitEl = document.getElementById('free-saved-limit');
    if(freeLimitEl) freeLimitEl.textContent = freeLimitText;
    var tblFreeLimitEl = document.getElementById('tbl-free-limit');
    if(tblFreeLimitEl) tblFreeLimitEl.textContent = freeScenarioLimit;
  }catch(e){ console.warn('[pricing] Config load error:', e); }
})();

// Auto-trigger checkout if redirected back after login
if(new URLSearchParams(location.search).get('checkout') === '1'){
  setTimeout(startCheckout, 800);
}

// Pro CTA button
var proCta = document.getElementById('pro-cta-btn');
if(proCta) proCta.addEventListener('click', function(){
  // Track pro upgrade CTA click
  if(window.trackFeatureGateCTA) trackFeatureGateCTA('pro_pricing_page', 'upgrade_cta');
  startCheckout();
});

// FAQ accordion — event delegation
document.querySelectorAll('.faq-q').forEach(function(btn){
  btn.addEventListener('click', function(){
    this.closest('.faq-item').classList.toggle('open');
    // Track FAQ click
    var faqText = this.textContent.substring(0, 50).trim();
    if(window.trackHelpEngagement) trackHelpEngagement('faq_clicked', faqText);
  });
});

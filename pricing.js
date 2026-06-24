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

// Load pricing from config
(function(){
  try{
    var cfg = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}');

    // ── Launch-pricing cutoff ──
    // The "$2.99 launch price" ran until 1 June 2026. After that the Pro
    // plan reverts to its full price. The actual Stripe-billed amount is
    // controlled by the Stripe Price ID in stripe-config.js — update there
    // (or in the Stripe dashboard) when you bump the price. This code only
    // affects what the marketing page displays.
    var LAUNCH_CUTOFF = new Date('2026-06-01T00:00:00+10:00');  // AEST
    var POST_LAUNCH_PRO_PRICE = cfg.proMonthlyPriceFull || 9;   // full price
    var launchActive = Date.now() < LAUNCH_CUTOFF.getTime();

    var proMonthly = launchActive
      ? (cfg.proMonthlyPrice || 2.99)
      : POST_LAUNCH_PRO_PRICE;
    var proAnnual = cfg.proAnnualPrice || 86;
    var adviserMonthly = cfg.adviserMonthlyPrice || 29;
    var freeScenarioLimit = cfg.freeScenarioLimit || 1;

    // Track feature discovery - viewing pricing comparison table
    if(window.trackPageEvent) {
      trackPageEvent('pricing_page_view', {
        'free_scenario_limit': freeScenarioLimit,
        'pro_monthly': proMonthly,
        'pro_annual': proAnnual,
        'launch_active': launchActive
      });
    }

    var proAmtEl = document.getElementById('pro-amt');
    if(proAmtEl) proAmtEl.textContent = 'A$' + proMonthly.toFixed(2);
    var proOrigEl = document.getElementById('pro-orig');
    if(proOrigEl) proOrigEl.textContent = 'A$' + POST_LAUNCH_PRO_PRICE.toFixed(0);
    var tblProEl = document.getElementById('tbl-pro');
    if(tblProEl) {
      tblProEl.innerHTML = launchActive
        ? '<span style="text-decoration:line-through;opacity:0.45;">$' + POST_LAUNCH_PRO_PRICE.toFixed(0) + '</span> $' + proMonthly.toFixed(2) + '/mo'
        : '$' + proMonthly.toFixed(2) + '/mo';
    }
    // Hide the "$2.99 until June 1st 2026" promo strip once the launch window closes
    var proPromoEl = document.getElementById('pro-promo');
    if(proPromoEl && !launchActive) proPromoEl.style.display = 'none';

    var advAmtEl = document.getElementById('adv-amt');
    if(advAmtEl) advAmtEl.textContent = 'A$' + adviserMonthly.toFixed(2);
    var tblAdvEl = document.getElementById('tbl-adv');
    if(tblAdvEl) tblAdvEl.textContent = 'A$' + adviserMonthly.toFixed(2) + '/mo';

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

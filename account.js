// account.js — Account page logic
// Extracted from account.html inline script block.

function safePhotoSrc(url){if(!url)return null;if(/^data:image\/(jpeg|png|gif|webp);base64,/.test(url))return url;try{var u=new URL(url);return u.protocol==='https:'?url:null;}catch(e){return null;}}
function escHtml(s){var m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};return String(s||'').replace(/[&<>"']/g,function(c){return m[c];});}

// ── Custom Dialog ─────────────────────────────────────────────────────────────
var _acctDialogResolveFn = null;
function _acctDialogResolve(val){
  var overlay = document.getElementById('acct-dialog-overlay');
  var input   = document.getElementById('acct-dialog-input');
  overlay.style.display='none'; overlay.style.alignItems=''; overlay.style.justifyContent='';
  if(_acctDialogResolveFn){
    var fn=_acctDialogResolveFn; _acctDialogResolveFn=null;
    fn(input && input.style.display!=='none' && val ? (input.value||'') : val);
  }
}
function _acctDialog(title, msg, opts){
  opts=opts||{};
  return new Promise(function(resolve){
    _acctDialogResolveFn=resolve;
    var o=document.getElementById('acct-dialog-overlay');
    document.getElementById('acct-dialog-icon').textContent=opts.icon||(opts.danger?'':'');
    document.getElementById('acct-dialog-title').textContent=title;
    document.getElementById('acct-dialog-msg').innerHTML=msg;
    var inp=document.getElementById('acct-dialog-input');
    var cancel=document.getElementById('acct-dialog-cancel');
    var confirm=document.getElementById('acct-dialog-confirm');
    cancel.style.display=opts.alertOnly?'none':'';
    confirm.textContent=opts.confirmLabel||(opts.danger?'Delete':'OK');
    confirm.style.background=opts.danger?'var(--risk-red)':'var(--charcoal)';
    confirm.style.borderColor=opts.danger?'var(--risk-red)':'var(--charcoal)';
    if(opts.inputType){inp.type=opts.inputType;inp.placeholder=opts.inputPlaceholder||'';inp.value='';inp.style.display='';setTimeout(function(){inp.focus();},60);}
    else{inp.style.display='none';setTimeout(function(){confirm.focus();},50);}
    o.style.display='flex'; o.style.alignItems='center'; o.style.justifyContent='center';
  });
}
function acctAlert(title,msg,opts){return _acctDialog(title,msg,Object.assign({alertOnly:true},opts));}
function acctConfirm(title,msg,opts){return _acctDialog(title,msg,opts);}
function acctPrompt(title,msg,opts){return _acctDialog(title,msg,Object.assign({inputType:'password'},opts));}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&document.getElementById('acct-dialog-overlay').style.display==='flex') _acctDialogResolve(false);
});

const SK = 'propCalc_session_v1';
const PK_BASE = 'propCalc_profile_v1';

let session = null;
let profileData = {name:'', email:'', color:'#C9A84C', photo:''};

function getProfileKey(){ return PK_BASE + '_' + (session?.id || session?.userId || 'guest'); }

function loadSession(){
  try{ const r=localStorage.getItem(SK); if(r) session=JSON.parse(r); }catch(e){}
  try{ const r=localStorage.getItem(getProfileKey()); if(r) profileData=Object.assign(profileData,JSON.parse(r)); }catch(e){}
}

function renderAccount(){
  if(!session){
    document.getElementById('gate-view').style.display='block';
    return;
  }
  document.getElementById('account-view').style.display='grid';
  document.getElementById('acct-name').value = session.name || profileData.name || '';
  document.getElementById('acct-email').value = session.email || '';
  renderAvatar();
  renderColorSwatches();
  renderPlan();
}

function renderAvatar(){
  const el = document.getElementById('acct-avatar');
  const removeBtn = document.getElementById('avatar-remove');
  if(!el) return;
  if(safePhotoSrc(profileData.photo)){
    el.innerHTML = '<img src="'+safePhotoSrc(profileData.photo)+'">';
    el.style.background = 'transparent';
    if(removeBtn) removeBtn.style.display='inline-block';
  } else {
    const name = session?.name || '';
    const initials = name ? name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : '?';
    el.textContent = initials;
    el.style.background = profileData.color || '#C9A84C';
    el.style.color = '#1C1C1E';
    if(removeBtn) removeBtn.style.display='none';
  }
}

function renderColorSwatches(){
  document.querySelectorAll('.color-swatch').forEach(function(s){
    s.classList.toggle('active', s.dataset.color === profileData.color);
  });
}

function renderPlan(){
  const plan = session?.plan || 'free';
  const badgeEl = document.getElementById('plan-badge-display');
  const upgradeEl = document.getElementById('plan-upgrade-btn');
  const featEl = document.getElementById('plan-features');
  const billCard = document.getElementById('billing-card');

  const badges = {
    free:'<span class="plan-badge plan-free">Free plan</span>',
    pro:'<span class="plan-badge plan-pro">Pro</span>',
    adviser:'<span class="plan-badge plan-adviser">Adviser</span>'
  };
  if(badgeEl) badgeEl.innerHTML = badges[plan] || badges.free;

  const statusHtml = [];
  if (plan !== 'free') {
    const canceledStatus = session?.canceledAt || session?.subscription_canceled_at;
    const expiresAt = session?.expiresAt || session?.subscription_expires_at;
    const renewsAt = session?.renewsAt || session?.subscription_renews_at;
    if (canceledStatus && expiresAt) {
      const expiryDate = new Date(expiresAt).toLocaleDateString('en-AU', {year:'numeric', month:'short', day:'numeric'});
      statusHtml.push('<div style="margin-bottom:12px;padding:10px 12px;background:rgba(196,90,90,0.08);border-left:3px solid #C45A5A;border-radius:3px;font-size:12px;color:#C45A5A;"><strong>Plan cancelled.</strong> It ends on ' + expiryDate + '</div>');
    } else if (renewsAt) {
      const renewDate = new Date(renewsAt).toLocaleDateString('en-AU', {year:'numeric', month:'short', day:'numeric'});
      statusHtml.push('<div style="margin-bottom:12px;padding:10px 12px;background:rgba(201,168,76,0.08);border-radius:3px;font-size:12px;color:var(--slate);">Renews ' + renewDate + '</div>');
    }
  }

  // Paid plans are no longer sold. Free accounts get a plain note instead of a
  // plan card; existing subscribers see their plan, its status and the billing
  // portal button. No feature comparison or upsell list is shown to anyone.
  const planCard = document.getElementById('plan-card');
  const freeNote = document.getElementById('plan-free-note');
  if(planCard) planCard.style.display = (plan==='free') ? 'none' : '';
  if(freeNote) freeNote.style.display = (plan==='free') ? '' : 'none';
  if(featEl) featEl.innerHTML = (plan==='free') ? '' : statusHtml.join('');

  if(upgradeEl){
    upgradeEl.innerHTML = plan==='free'
      ? ''
      : '<button class="acct-btn acct-btn-outline" id="manage-billing-btn-dynamic">Manage billing</button>';
    const dynBtn = upgradeEl.querySelector('#manage-billing-btn-dynamic');
    if(dynBtn) dynBtn.addEventListener('click', function(){ openBillingPortal(); });
  }
  if(billCard) billCard.style.display = (plan==='free') ? 'none' : 'block';
  // Also asked for a free account: its plan may have been removed after a
  // failed payment while the subscription still exists in Stripe. If so,
  // loadBillingStatus shows the billing card so the card can be updated or
  // the subscription cancelled.
  loadBillingStatus();
}

function pickColor(el){
  profileData.color = el.dataset.color;
  document.querySelectorAll('.color-swatch').forEach(function(s){ s.classList.toggle('active',s===el); });
  renderAvatar();
}

function handleAvatarUpload(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      cv.getContext('2d').drawImage(img,0,0,128,128);
      profileData.photo = cv.toDataURL('image/jpeg', 0.85);
      renderAvatar();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeAvatar(){
  profileData.photo = '';
  renderAvatar();
}

function saveProfile(){
  profileData.name = document.getElementById('acct-name').value.trim();
  profileData.color = profileData.color || '#C9A84C';
  localStorage.setItem(getProfileKey(), JSON.stringify(profileData));
  if(session){
    session.name = profileData.name;
    localStorage.setItem(SK, JSON.stringify(session));
  }
  const st = document.getElementById('profile-status');
  if(st){ st.textContent='Saved'; st.className='acct-status-msg ok'; setTimeout(function(){st.textContent='';},2000); }
  if (window.renderSiteNav) window.renderSiteNav();
}

function showPasswordForm(){
  document.getElementById('password-form').style.display='block';
}

async function changePassword(){
  const cur = document.getElementById('pw-current').value.trim();
  const nw  = document.getElementById('pw-new').value;
  const cf  = document.getElementById('pw-confirm').value;
  const st  = document.getElementById('pw-status');
  if(!cur || !nw){ st.textContent='Enter your current password and a new one'; st.className='acct-status-msg err'; return; }
  if(nw.length < 8){ st.textContent='New password must be at least 8 characters'; st.className='acct-status-msg err'; return; }
  if(nw !== cf){ st.textContent="New passwords don't match"; st.className='acct-status-msg err'; return; }
  st.textContent='Updating…'; st.className='acct-status-msg';
  try{
    const r = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'changePassword', currentPassword: cur, newPassword: nw })
    });
    const d = await r.json();
    if(d.ok){
      st.textContent = 'Password updated';
      st.className = 'acct-status-msg ok';
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
      if(document.getElementById('pw-strength-bar')) document.getElementById('pw-strength-bar').style.width='0%';
    } else {
      st.textContent = d.error || 'Password not changed. Check your current password.';
      st.className = 'acct-status-msg err';
    }
  } catch(e){ st.textContent = 'Network error. Try again.'; st.className = 'acct-status-msg err'; }
}

async function loadBillingStatus(){
  if(!session || !session.id) return;
  var pmEl   = document.getElementById('payment-method-text');
  var planEl = document.getElementById('billing-plan-text');
  if(pmEl) pmEl.textContent = 'Loading…';
  try{
    const r = await fetch('/.netlify/functions/stripe',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'getSubscriptionStatus'})
    });
    const d = await r.json();
    if(!d.ok){ if(pmEl) pmEl.textContent='—'; return; }
    if((session.plan||'free')==='free'){
      // Free plan: the billing card stays hidden unless Stripe still holds a
      // subscription for this account that can charge the card.
      if(['active','trialing','past_due','unpaid','incomplete','paused'].indexOf(d.status) < 0) return;
      var billCardEl = document.getElementById('billing-card');
      var freeNoteEl = document.getElementById('plan-free-note');
      if(billCardEl) billCardEl.style.display = 'block';
      if(freeNoteEl) freeNoteEl.style.display = 'none';
    }
    if(planEl){
      // lapsedPlan: the plan that was removed because the payment failed.
      var planWord = d.lapsedPlan || d.plan || '';
      var planLabel = planWord.charAt(0).toUpperCase()+planWord.slice(1)+(d.lapsedPlan ? ' (off)' : '');
      if(d.priceAmount != null && d.priceCurrency){
        var amt = (d.priceAmount/100).toLocaleString('en-AU',{style:'currency',currency:d.priceCurrency.toUpperCase()});
        var interval = d.priceInterval ? ' / '+d.priceInterval : '';
        planLabel += ', '+amt+interval;
      }
      planEl.textContent = planLabel;
    }
    if(pmEl){
      if(d.cardBrand && d.cardLast4){
        var brand = d.cardBrand.charAt(0).toUpperCase()+d.cardBrand.slice(1);
        pmEl.textContent = brand+' ending in '+d.cardLast4;
      } else {
        pmEl.textContent = 'Managed via Stripe';
      }
    }
    const periodEndEl = document.getElementById('next-billing-text');
    const cancelNote  = document.getElementById('cancel-at-note');
    if(d.currentPeriodEnd && periodEndEl){
      const dt = new Date(d.currentPeriodEnd * 1000);
      periodEndEl.textContent = dt.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
    } else if(periodEndEl && d.ok){
      periodEndEl.textContent = 'Active subscription';
    }
    if(d.cancelAtPeriodEnd && cancelNote){
      const endTs = d.cancelAt || d.currentPeriodEnd;
      const endDate = endTs ? new Date(endTs*1000).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}) : 'the end of the billing period';
      cancelNote.textContent = d.lapsedPlan
        ? 'Your subscription is cancelled. It ends on '+endDate+'.'
        : 'Your subscription is cancelled. You keep access until '+endDate+'.';
      cancelNote.style.display = 'block';
    }
    // "Cancel subscription" is hidden once the subscription is already set to
    // cancel, has ended, or there is none. "Manage" still opens the portal,
    // where a cancellation that hasn't taken effect yet can be undone.
    const cancelBtn = document.querySelector('#billing-card .acct-btn-danger');
    if(cancelBtn) cancelBtn.style.display = (d.cancelAtPeriodEnd || d.status==='none' || d.status==='canceled') ? 'none' : '';
    // Payment failed. The server reports it only while Stripe says the
    // subscription is past due or unpaid: graceEndsAt while the 3-day grace
    // is running, lapsedPlan once the plan has been removed, and
    // paymentFailedAt alone when the grace is over but the plan is still on.
    let failNote = document.getElementById('payment-failed-note');
    const planName = (d.lapsedPlan || d.plan)==='adviser' ? 'Adviser' : 'Pro';
    let failText = '';
    if(d.lapsedPlan){
      failText = 'Your last payment failed and '+planName+' is now off. Update your card and '+planName+' comes back when the payment goes through.';
    } else if(d.graceEndsAt){
      const graceDate = new Date(d.graceEndsAt).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
      failText = 'Your last payment failed. '+planName+' stays on until '+graceDate+'. Update your card before then to keep it.';
    } else if(d.paymentFailedAt){
      failText = d.plan==='free'
        ? 'Your last payment failed. Update your card, or cancel the subscription.'
        : 'Your last payment failed. Update your card to keep '+planName+'.';
    }
    if(failText && cancelNote){
      if(!failNote){
        failNote = document.createElement('div');
        failNote.id = 'payment-failed-note';
        failNote.style.cssText = cancelNote.style.cssText;
        cancelNote.parentNode.insertBefore(failNote, cancelNote);
      }
      failNote.textContent = failText;
      failNote.style.display = 'block';
    } else if(failNote){
      failNote.style.display = 'none';
    }
    if(cancelNote && !d.cancelAtPeriodEnd){
      const canceledStatus = session?.canceledAt || session?.subscription_canceled_at;
      const expiresAt = session?.expiresAt || session?.subscription_expires_at;
      const renewsAt = session?.renewsAt || session?.subscription_renews_at;
      if(canceledStatus && expiresAt){
        // Track churn - user has cancelled their subscription
        if(window.trackChurn) trackChurn('user_action', d.plan || 'unknown');
        const expiryDate = new Date(expiresAt).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
        cancelNote.textContent = 'Plan cancelled. Your access ends on '+expiryDate;
        cancelNote.style.display = 'block';
      } else if(renewsAt){
        const renewDate = new Date(renewsAt).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
        if(periodEndEl) periodEndEl.textContent = renewDate;
      }
    }
  }catch(e){ if(pmEl) pmEl.textContent='—'; }
}

// flow 'cancel' asks Stripe to open the portal on its cancel page for this
// account's subscription; anything else opens the portal's home page.
async function openBillingPortal(flow){
  if(!session || !session.id){ acctAlert('Not signed in', 'Sign in to manage billing.', {icon:''}); return; }
  const st = document.getElementById('delete-status');
  if(st){ st.textContent='Opening billing portal…'; st.className='acct-status-msg info'; }
  try{
    const r = await fetch('/.netlify/functions/stripe',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'createPortalSession',returnUrl:location.href,flow:flow==='cancel'?'cancel':undefined})
    });
    const d = await r.json();
    if(d.ok && d.url){
      location.href = d.url;
    } else {
      const msg = d.error && d.error.includes('not configured')
        ? 'The billing portal isn\'t set up yet. Email <a href="mailto:support@EquitySight.app">support@EquitySight.app</a> to manage your subscription.'
        : (escHtml(d.error) || 'Couldn\'t open the billing portal. Email support@equitysight.app.');
      acctAlert('Billing portal', msg, {icon:'', alertOnly:true, confirmLabel:'OK'});
      if(st){ st.textContent=''; st.className='acct-status-msg'; }
    }
  }catch(e){
    acctAlert('Billing portal', 'Email <a href="mailto:support@EquitySight.app">support@EquitySight.app</a> to manage your subscription.', {icon:'', alertOnly:true});
    if(st){ st.textContent=''; st.className='acct-status-msg'; }
  }
}

// Deletion reason options shown to user before account deletion
var DELETE_REASONS = [
  'No longer need it',
  'Too expensive',
  'Found a better alternative',
  'Missing features I need',
  'Too difficult to use',
  'Privacy concerns',
  'Just testing / temporary account',
  'Other'
];

async function pickDeleteReason(){
  return new Promise(function(resolve){
    _acctDialogResolveFn = null;
    var o = document.getElementById('acct-dialog-overlay');
    document.getElementById('acct-dialog-icon').textContent = '';
    document.getElementById('acct-dialog-title').textContent = 'Delete account';
    var reasonBtns = DELETE_REASONS.map(function(r){
      return '<button class="acct-reason-btn" style="display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;background:rgba(28,28,30,0.04);border:1px solid rgba(28,28,30,0.12);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;color:var(--charcoal);cursor:pointer;transition:background 0.15s;">'+escHtml(r)+'</button>';
    }).join('');
    document.getElementById('acct-dialog-msg').innerHTML =
      '<div style="margin-bottom:10px;font-size:13px;color:var(--slate);line-height:1.6;">Why are you leaving?</div>' +
      '<div id="acct-reason-list">'+reasonBtns+'</div>' +
      '<div style="margin-top:8px;font-size:11px;color:var(--slate);">Select a reason to continue, or cancel.</div>';
    var inp = document.getElementById('acct-dialog-input');
    inp.style.display = 'none';
    document.getElementById('acct-dialog-cancel').style.display = '';
    var confirmBtn = document.getElementById('acct-dialog-confirm');
    confirmBtn.style.display = 'none';
    _acctDialogResolveFn = resolve;
    o.style.display = 'flex'; o.style.alignItems = 'center'; o.style.justifyContent = 'center';
    // Attach click handlers to reason buttons
    document.querySelectorAll('.acct-reason-btn').forEach(function(btn){
      btn.onmouseenter = function(){ btn.style.background='rgba(28,28,30,0.09)'; };
      btn.onmouseleave = function(){ btn.style.background='rgba(28,28,30,0.04)'; };
      btn.onclick = function(){
        confirmBtn.style.display = '';
        o.style.display = 'none'; o.style.alignItems = ''; o.style.justifyContent = '';
        if(_acctDialogResolveFn){ var fn=_acctDialogResolveFn; _acctDialogResolveFn=null; fn(btn.textContent); }
      };
    });
  });
}

async function confirmDeleteAccount(){
  // Step 1: Ask for reason
  var reason = await pickDeleteReason();
  if(!reason) return;
  // Step 2: Ask for password
  const pw = await acctPrompt('Confirm deletion', 'Enter your password to delete your account. This can\'t be undone.', {danger:true, confirmLabel:'Delete account', inputPlaceholder:'Your password'});
  if(!pw) return;
  const st = document.getElementById('delete-status') || document.createElement('span');
  try{
    const r = await fetch('/.netlify/functions/auth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'deleteAccount',password:pw,deleteReason:reason})
    });
    const d = await r.json();
    if(d.ok){
      // Track account deletion
      if(window.trackAuthAction) trackAuthAction('account_deleted', 'success');
      localStorage.clear();
      await acctAlert('Account deleted', 'Your account has been deleted. The home page opens next.', {icon:''});
      location.href='/';
    } else {
      if(window.trackAuthAction) trackAuthAction('account_deleted', 'failure');
      await acctAlert('Error', d.error||'Couldn\'t delete the account. Try again.', {danger:true, icon:''});
    }
  }catch(e){
    localStorage.clear();
    await acctAlert('Error', 'Your data on this device was cleared, but the request to the server failed. Email support@equitysight.app to have the account deleted.', {icon:''});
    location.href='/';
  }
}

function doSignOut(){
  function track(){ if(window.trackPageEvent) trackPageEvent('user_signout', {}); }
  // auth-nav.js asks first, then signs out and removes this account's
  // figures from the browser (esForgetDevice). The sign-out is counted only
  // once the visitor has said yes.
  if(typeof window.esForgetDevice === 'function'){
    window.esForgetDevice({confirm:true, next:'/', onSignOut:track});
    return;
  }
  // auth-nav.js didn't load: end the session at least.
  track();
  fetch('/.netlify/functions/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signout'}),keepalive:true}).catch(()=>{});
  localStorage.removeItem(SK);
  location.href='/';
}

// Sign in from this page comes back to it (login.js checks the address).
function loginHref(tab){
  return '/login?'+(tab?'tab='+tab+'&':'')+'next='+encodeURIComponent(location.pathname+location.search);
}

function applyTheme(theme){
  if(theme==='dark'){ document.documentElement.classList.add('dark-mode'); localStorage.setItem('equitySight_theme','dark'); }
  else if(theme==='light'){ document.documentElement.classList.remove('dark-mode'); localStorage.setItem('equitySight_theme','light'); }
  else {
    localStorage.removeItem('equitySight_theme');
    if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches){
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }
}

function loadPreferences(){
  var prefs = profileData.prefs || {};
  var theme = prefs.theme || localStorage.getItem('equitySight_theme') || 'system';
  document.querySelectorAll('[name="pref-theme"]').forEach(function(r){ r.checked = r.value===theme; });
  var stateEl = document.getElementById('pref-state');
  if(stateEl) stateEl.value = prefs.defaultState || '';
  var termEl = document.getElementById('pref-loan-term');
  if(termEl) termEl.value = prefs.defaultLoanTerm || '';
  var secEl = document.getElementById('pref-notify-security');
  if(secEl) secEl.checked = prefs.notifySecurity !== false;
  var updEl = document.getElementById('pref-notify-updates');
  if(updEl) updEl.checked = !!prefs.notifyUpdates;
}

async function savePreferences(){
  var st = document.getElementById('prefs-status');
  var themeRadio = document.querySelector('[name="pref-theme"]:checked');
  var theme = themeRadio ? themeRadio.value : 'system';
  var prefs = {
    theme:           theme,
    defaultState:    (document.getElementById('pref-state')||{}).value || '',
    defaultLoanTerm: (document.getElementById('pref-loan-term')||{}).value || '',
    notifySecurity:  !!(document.getElementById('pref-notify-security')||{}).checked,
    notifyUpdates:   !!(document.getElementById('pref-notify-updates')||{}).checked,
  };
  profileData.prefs = prefs;
  applyTheme(theme);
  try{ localStorage.setItem(getProfileKey(), JSON.stringify(profileData)); }catch(e){}
  if(session && session.id){
    try{
      var r = await fetch('/.netlify/functions/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'setProfile', profile: profileData})
      });
      var d = await r.json();
      if(d.ok){
        if(st){ st.textContent='Preferences saved'; st.className='acct-status-msg ok'; setTimeout(function(){st.textContent='';},2000); }
      } else {
        if(st){ st.textContent='Couldn\'t save'; st.className='acct-status-msg err'; }
      }
    } catch(e){
      if(st){ st.textContent='Network error'; st.className='acct-status-msg err'; }
    }
  } else {
    if(st){ st.textContent='Saved on this device'; st.className='acct-status-msg ok'; setTimeout(function(){st.textContent='';},2000); }
  }
}

function showPanel(id, btn){
  document.querySelectorAll('.acct-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.acct-nav-item').forEach(function(b){ b.classList.remove('active'); });
  const panel = document.getElementById('panel-'+id);
  if(panel) panel.classList.add('active');
  if(btn) btn.classList.add('active');
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.getElementById('acct-dialog-cancel').addEventListener('click', function(){ _acctDialogResolve(false); });
document.getElementById('acct-dialog-confirm').addEventListener('click', function(){ _acctDialogResolve(true); });

// Gate view buttons
var signInGateBtn = document.getElementById('gate-signin-btn');
if(signInGateBtn) signInGateBtn.addEventListener('click', function(){ location.href=loginHref(''); });
var signUpGateBtn = document.getElementById('gate-signup-btn');
if(signUpGateBtn) signUpGateBtn.addEventListener('click', function(){ location.href=loginHref('signup'); });

// Nav panel switching (event delegation)
document.querySelectorAll('.acct-nav-item[data-panel]').forEach(function(btn){
  btn.addEventListener('click', function(){
    showPanel(this.dataset.panel, this);
    if(this.dataset.panel === 'preferences') loadPreferences();
  });
});
var signOutNavBtn = document.getElementById('nav-signout-btn');
if(signOutNavBtn) signOutNavBtn.addEventListener('click', doSignOut);

// Avatar
var avatarFileInput = document.getElementById('avatar-file-input');
if(avatarFileInput) avatarFileInput.addEventListener('change', function(){ handleAvatarUpload(this); });
var avatarRemoveBtn = document.getElementById('avatar-remove');
if(avatarRemoveBtn) avatarRemoveBtn.addEventListener('click', removeAvatar);

// Color swatches (event delegation)
document.querySelectorAll('.color-swatch').forEach(function(s){
  s.addEventListener('click', function(){ pickColor(this); });
});

// Profile save
var saveProfileBtn = document.getElementById('save-profile-btn');
if(saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);

// Billing buttons: "Manage" and "Update" open the Stripe billing portal, and
// the red "Cancel subscription" button opens it on the cancel page. They are
// matched by their place in the billing card as well as by class, because
// account.html gave each of them two class attributes and the browser dropped
// the second one (manage-billing-btn), which left all three unbound.
document.querySelectorAll('.manage-billing-btn, #billing-card button').forEach(function(btn){
  var isCancel = btn.classList.contains('acct-btn-danger');
  btn.addEventListener('click', function(){ openBillingPortal(isCancel ? 'cancel' : ''); });
});

// Security panel
var showPwFormBtn = document.getElementById('show-pw-form-btn');
if(showPwFormBtn) showPwFormBtn.addEventListener('click', showPasswordForm);
var changePwBtn = document.getElementById('change-pw-btn');
if(changePwBtn) changePwBtn.addEventListener('click', changePassword);
var cancelPwBtn = document.getElementById('cancel-pw-btn');
if(cancelPwBtn) cancelPwBtn.addEventListener('click', function(){ document.getElementById('password-form').style.display='none'; });
var signOutSecBtn = document.getElementById('security-signout-btn');
if(signOutSecBtn) signOutSecBtn.addEventListener('click', doSignOut);

// Prefs save
var savePrefsBtn = document.getElementById('save-prefs-btn');
if(savePrefsBtn) savePrefsBtn.addEventListener('click', savePreferences);

// Delete account
var deleteAccountBtn = document.getElementById('delete-account-btn');
if(deleteAccountBtn) deleteAccountBtn.addEventListener('click', confirmDeleteAccount);

// ── Init ─────────────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(location.search);
const requestedPanel = urlParams.get('panel');
if(requestedPanel==='subscription' || urlParams.get('checkout')==='1'){
  setTimeout(function(){
    showPanel('subscription', document.querySelector('.acct-nav-item[data-panel="subscription"]'));
  }, 300);
}

loadSession();
renderAccount();
loadPreferences();

if(session && session.id){
  const isUpgradeReturn = urlParams.has('upgraded');
  const oldPlan = session.plan;

  function applyProfileUpdate(d){
    const changed = d.plan !== session.plan || d.name !== session.name;
    if(changed){
      // Track plan change
      if(d.plan !== session.plan && window.trackPageEvent){
        trackPageEvent('plan_changed', {
          'old_plan': session.plan || 'unknown',
          'new_plan': d.plan || 'unknown',
          'timestamp': new Date().toISOString()
        });
      }
      session.plan = d.plan || session.plan;
      session.name = d.name || session.name;
      try{ localStorage.setItem(SK, JSON.stringify(session)); }catch(e){}
      renderPlan();
      if(window.renderSiteNav) window.renderSiteNav();
    }
    if(d.canceledAt || d.expiresAt || d.renewsAt){
      if(d.canceledAt) session.canceledAt = d.canceledAt;
      if(d.expiresAt) session.expiresAt = d.expiresAt;
      if(d.renewsAt) session.renewsAt = d.renewsAt;
      try{ localStorage.setItem(SK, JSON.stringify(session)); }catch(e){}
      renderPlan();
      if(session.plan !== 'free') loadBillingStatus();
    }
    return changed;
  }

  function fetchProfile(){
    return fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'getProfile'})
    }).then(function(r){ return r.ok ? r.json() : null; });
  }

  if(isUpgradeReturn){
    history.replaceState(null, '', location.pathname);
    var attempts = 0;
    var delays = [0, 2000, 2000, 3000, 3000];
    function pollPlan(){
      fetchProfile().then(function(d){
        if(!d || !d.ok) return;
        var planChanged = d.plan !== oldPlan;
        applyProfileUpdate(d);
        if(!planChanged && attempts < delays.length - 1){
          attempts++;
          setTimeout(pollPlan, delays[attempts]);
        }
      }).catch(function(){});
    }
    pollPlan();
  } else {
    fetchProfile().then(function(d){
      if(!d || !d.ok) return;
      applyProfileUpdate(d);
    }).catch(function(){});
  }
}

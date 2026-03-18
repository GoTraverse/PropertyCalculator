// account.js — Account page logic
// Extracted from account.html inline script block.

function safePhotoSrc(url){if(!url)return null;if(/^data:image\/(jpeg|png|gif|webp);base64,/.test(url))return url;try{var u=new URL(url);return u.protocol==='https:'?url:null;}catch(e){return null;}}

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
    document.getElementById('acct-dialog-icon').textContent=opts.icon||(opts.danger?'⚠️':'ℹ️');
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
    el.innerHTML = initials;
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
    pro:'<span class="plan-badge plan-pro">⭐ Pro</span>',
    adviser:'<span class="plan-badge plan-adviser">◆ Adviser</span>'
  };
  if(badgeEl) badgeEl.innerHTML = badges[plan] || badges.free;

  const statusHtml = [];
  if (plan !== 'free') {
    const canceledStatus = session?.canceledAt || session?.subscription_canceled_at;
    const expiresAt = session?.expiresAt || session?.subscription_expires_at;
    const renewsAt = session?.renewsAt || session?.subscription_renews_at;
    if (canceledStatus && expiresAt) {
      const expiryDate = new Date(expiresAt).toLocaleDateString('en-AU', {year:'numeric', month:'short', day:'numeric'});
      statusHtml.push('<div style="margin-bottom:12px;padding:10px 12px;background:rgba(196,90,90,0.08);border-left:3px solid #C45A5A;border-radius:3px;font-size:12px;color:#C45A5A;"><strong>Plan canceled</strong> — expires ' + expiryDate + '</div>');
    } else if (renewsAt) {
      const renewDate = new Date(renewsAt).toLocaleDateString('en-AU', {year:'numeric', month:'short', day:'numeric'});
      statusHtml.push('<div style="margin-bottom:12px;padding:10px 12px;background:rgba(201,168,76,0.08);border-radius:3px;font-size:12px;color:var(--slate);">Renews ' + renewDate + '</div>');
    }
  }

  const features = {
    free: [
      {ok:true, text:'Calculator with all core features'},
      {ok:true, text:'1 saved property scenario'},
      {ok:false, text:'30-year projection chart (Pro)'},
      {ok:false, text:'PDF export (Pro)'},
      {ok:false, text:'Unlimited library &amp; cloud sync (Pro)'},
    ],
    pro: [
      {ok:true, text:'All calculator features'},
      {ok:true, text:'Unlimited saved properties'},
      {ok:true, text:'30-year projection chart'},
      {ok:true, text:'PDF export'},
      {ok:true, text:'Cloud sync across devices'},
      {ok:true, text:'Priority email support'},
    ],
    adviser: [
      {ok:true, text:'Everything in Pro'},
      {ok:true, text:'Up to 5 client accounts'},
      {ok:true, text:'White-label PDF reports'},
      {ok:true, text:'Phone + email priority support'},
    ]
  };
  const fList = features[plan] || features.free;
  if(featEl) featEl.innerHTML = statusHtml.join('') + fList.map(function(f){
    return '<div class="plan-feature"><span class="'+(f.ok?'pf-check':'pf-lock')+'">'+(f.ok?'✓':'—')+'</span>'+f.text+'</div>';
  }).join('');

  if(upgradeEl){
    upgradeEl.innerHTML = plan==='free'
      ? '<a href="pricing.html" class="acct-btn acct-btn-gold">Upgrade to Pro →</a>'
      : '<button class="acct-btn acct-btn-outline" id="manage-billing-btn-dynamic">Manage billing</button>';
    const dynBtn = upgradeEl.querySelector('#manage-billing-btn-dynamic');
    if(dynBtn) dynBtn.addEventListener('click', openBillingPortal);
  }
  if(billCard) billCard.style.display = (plan==='free') ? 'none' : 'block';
  if(plan !== 'free') loadBillingStatus();
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
  if(st){ st.textContent='✓ Saved'; st.className='acct-status-msg ok'; setTimeout(function(){st.textContent='';},2000); }
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
  if(!cur || !nw){ st.textContent='Please fill in all password fields'; st.className='acct-status-msg err'; return; }
  if(nw.length < 8){ st.textContent='New password must be at least 8 characters'; st.className='acct-status-msg err'; return; }
  if(nw !== cf){ st.textContent="New passwords don't match"; st.className='acct-status-msg err'; return; }
  st.textContent='Updating…'; st.className='acct-status-msg';
  const token = session && session.token;
  try{
    const r = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') },
      body: JSON.stringify({ action: 'changePassword', currentPassword: cur, newPassword: nw })
    });
    const d = await r.json();
    if(d.ok){
      st.textContent = '✓ Password updated successfully';
      st.className = 'acct-status-msg ok';
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
      if(document.getElementById('pw-strength-bar')) document.getElementById('pw-strength-bar').style.width='0%';
    } else {
      st.textContent = d.error || 'Failed — please check your current password';
      st.className = 'acct-status-msg err';
    }
  } catch(e){ st.textContent = 'Network error — please try again'; st.className = 'acct-status-msg err'; }
}

async function loadBillingStatus(){
  const token = session && session.token;
  if(!token) return;
  var pmEl   = document.getElementById('payment-method-text');
  var planEl = document.getElementById('billing-plan-text');
  if(pmEl) pmEl.textContent = 'Loading…';
  try{
    const r = await fetch('/.netlify/functions/stripe',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action:'getSubscriptionStatus'})
    });
    const d = await r.json();
    if(!d.ok){ if(pmEl) pmEl.textContent='—'; return; }
    if(planEl){
      var planLabel = (d.plan||'').charAt(0).toUpperCase()+(d.plan||'').slice(1);
      if(d.priceAmount != null && d.priceCurrency){
        var amt = (d.priceAmount/100).toLocaleString('en-AU',{style:'currency',currency:d.priceCurrency.toUpperCase()});
        var interval = d.priceInterval ? ' / '+d.priceInterval : '';
        planLabel += ' — '+amt+interval;
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
      const endDate = d.currentPeriodEnd ? new Date(d.currentPeriodEnd*1000).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}) : 'end of billing period';
      cancelNote.textContent = '⚠️ Your subscription is cancelled and will end on '+endDate+'. You have full access until then.';
      cancelNote.style.display = 'block';
    }
    if(cancelNote && !d.cancelAtPeriodEnd){
      const canceledStatus = session?.canceledAt || session?.subscription_canceled_at;
      const expiresAt = session?.expiresAt || session?.subscription_expires_at;
      const renewsAt = session?.renewsAt || session?.subscription_renews_at;
      if(canceledStatus && expiresAt){
        const expiryDate = new Date(expiresAt).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
        cancelNote.textContent = '⚠️ Plan canceled — your access ends on '+expiryDate;
        cancelNote.style.display = 'block';
      } else if(renewsAt){
        const renewDate = new Date(renewsAt).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
        if(periodEndEl) periodEndEl.textContent = renewDate;
      }
    }
  }catch(e){ if(pmEl) pmEl.textContent='—'; }
}

async function openBillingPortal(){
  const token = session && session.token;
  if(!token){ acctAlert('Not signed in', 'Please sign in to manage billing.', {icon:'🔒'}); return; }
  const st = document.getElementById('delete-status');
  if(st){ st.textContent='Opening billing portal…'; st.className='acct-status-msg info'; }
  try{
    const r = await fetch('/.netlify/functions/stripe',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action:'createPortalSession',returnUrl:location.href})
    });
    const d = await r.json();
    if(d.ok && d.url){
      location.href = d.url;
    } else {
      const msg = d.error && d.error.includes('not configured')
        ? 'Billing portal is not yet configured. Email <a href="mailto:support@EquitySight.app">support@EquitySight.app</a> to manage your subscription.'
        : (d.error || 'Unable to open billing portal. Please contact support.');
      acctAlert('Billing Portal', msg, {icon:'💳', alertOnly:true, confirmLabel:'OK'});
      if(st){ st.textContent=''; st.className='acct-status-msg'; }
    }
  }catch(e){
    acctAlert('Billing Portal', 'Email <a href="mailto:support@EquitySight.app">support@EquitySight.app</a> to manage your subscription.', {icon:'💳', alertOnly:true});
    if(st){ st.textContent=''; st.className='acct-status-msg'; }
  }
}

async function confirmDeleteAccount(){
  const pw = await acctPrompt('Delete Account', 'Enter your password to confirm account deletion. This cannot be undone.', {danger:true, confirmLabel:'Delete Account', inputPlaceholder:'Your password'});
  if(!pw) return;
  const st = document.getElementById('delete-status') || document.createElement('span');
  try{
    const token = session && session.token;
    const r = await fetch('/.netlify/functions/auth',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+(token||'')},
      body:JSON.stringify({action:'deleteAccount',password:pw,token:token})
    });
    const d = await r.json();
    if(d.ok){
      localStorage.clear();
      await acctAlert('Account Deleted', 'Your account has been deleted. You will now be redirected.', {icon:'👋'});
      location.href='index.html';
    } else {
      await acctAlert('Error', d.error||'Failed to delete account. Please try again.', {danger:true, icon:'✗'});
    }
  }catch(e){
    localStorage.clear();
    await acctAlert('Error', 'Account data cleared locally. Contact support@EquitySight.app to remove server data.', {icon:'⚠️'});
    location.href='index.html';
  }
}

function doSignOut(){
  if(session?.token){
    fetch('/.netlify/functions/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signout',token:session.token})}).catch(()=>{});
  }
  localStorage.removeItem(SK);
  location.href='index.html';
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
  var token = session && session.token;
  if(token){
    try{
      var r = await fetch('/.netlify/functions/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({action:'setProfile', profile: profileData})
      });
      var d = await r.json();
      if(d.ok){
        if(st){ st.textContent='✓ Preferences saved'; st.className='acct-status-msg ok'; setTimeout(function(){st.textContent='';},2000); }
      } else {
        if(st){ st.textContent='Failed to save'; st.className='acct-status-msg err'; }
      }
    } catch(e){
      if(st){ st.textContent='Network error'; st.className='acct-status-msg err'; }
    }
  } else {
    if(st){ st.textContent='✓ Saved locally'; st.className='acct-status-msg ok'; setTimeout(function(){st.textContent='';},2000); }
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
if(signInGateBtn) signInGateBtn.addEventListener('click', function(){ location.href='login.html'; });
var signUpGateBtn = document.getElementById('gate-signup-btn');
if(signUpGateBtn) signUpGateBtn.addEventListener('click', function(){ location.href='login.html?tab=signup'; });

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

// Billing portal buttons
document.querySelectorAll('.manage-billing-btn').forEach(function(btn){
  btn.addEventListener('click', openBillingPortal);
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

if(session && session.token){
  const isUpgradeReturn = urlParams.has('upgraded');
  const oldPlan = session.plan;

  function applyProfileUpdate(d){
    const changed = d.plan !== session.plan || d.name !== session.name;
    if(changed){
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
      body: JSON.stringify({action: 'getProfile', token: session.token})
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

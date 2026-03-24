// login.js — Login/signup page logic
// Extracted from login.html inline script block.

const ALLOWED_NEXT = ['app', 'account', 'pricing'];

// Redirect if already logged in
(function(){
  try{
    const s = JSON.parse(localStorage.getItem('propCalc_session_v1'));
    if(s && (s.id || s.email)){
      const params = new URLSearchParams(location.search);
      const raw = params.get('next') || '';
      const clean = raw.replace(/\.html$/, '');
      const next = ALLOWED_NEXT.includes(clean) ? '/' + clean : '/app';
      goTo(next);
    }
  }catch(e){}
})();

// Read plan/ref from URL
const params = new URLSearchParams(location.search);
if(params.get('tab') === 'signup') setTab('signup');
if(params.get('plan') === 'pro') document.getElementById('su-plan').value = 'pro';
const refParam = (params.get('ref') || '').trim().toUpperCase().slice(0, 16);
if(refParam) localStorage.setItem('equitySight_pendingRef', refParam);

// ── Google Sign-In ────────────────────────────────────────────────────────────

// Initialise Google Identity Services once the GSI library is ready.
// GOOGLE_CLIENT_ID is injected by site-init.js from the site config,
// or falls back to the window global set by the script below.
function initGoogleSignIn(){
  var clientId = (window.GOOGLE_CLIENT_ID || '').trim();
  if(!clientId) return; // not configured — hide the button wrapper
  var wrap = document.getElementById('google-signin-wrap');
  if(wrap) wrap.style.display = '';

  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    {
      theme: 'filled_black',
      size: 'large',
      shape: 'rectangular',
      width: 320,
      text: 'continue_with',
      logo_alignment: 'left',
    }
  );
}

async function handleGoogleCredential(response){
  var errEl = document.getElementById('google-signin-error');
  if(errEl) errEl.textContent = '';
  var btn = document.getElementById('google-signin-btn');
  if(btn) btn.style.opacity = '0.5';

  var res = await callAuth('googleSignin', {credential: response.credential});
  if(btn) btn.style.opacity = '';

  if(res.ok){
    persistSession(res, {email: res.email});
    // Track Google Sign-In
    if(window.trackLogin) trackLogin('google');
    try{
      var authH = 'Bearer ' + (res.token||'');
      var profileRes = await fetch('/.netlify/functions/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':authH},
        body:JSON.stringify({action:'getProfile'})
      }).then(function(r){ return r.json(); });
      if(profileRes.ok && profileRes.profile){
        localStorage.setItem('propCalc_profile_v1_'+(res.id||res.email), JSON.stringify(profileRes.profile));
      }
    }catch(e){}
    goTo('/app');
  } else {
    if(errEl) errEl.textContent = res.error || 'Google sign-in failed — please try again or use email/password below';
  }
}

// Called by the GSI library once it loads
window.onGoogleLibraryLoad = initGoogleSignIn;
// Also try immediately in case the library already loaded
if(typeof google !== 'undefined' && google.accounts) initGoogleSignIn();

// Fetch public config to get the Google Client ID (no auth required).
// Hides the Google sign-in button if googleClientId is not configured.
(function(){
  // Try cached siteConfig first for instant render
  try{
    var cached = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}');
    if(cached.googleClientId){
      window.GOOGLE_CLIENT_ID = cached.googleClientId;
      // GSI library may already be loaded — try init immediately
      if(typeof google !== 'undefined' && google.accounts) initGoogleSignIn();
      return;
    }
  }catch(e){}

  // Otherwise fetch from backend
  fetch('/.netlify/functions/auth', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'getPublicConfig'})
  }).then(function(r){ return r.json(); }).then(function(d){
    if(d.ok && d.config && d.config.googleClientId){
      window.GOOGLE_CLIENT_ID = d.config.googleClientId;
      // Merge into cached siteConfig
      try{
        var c = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}');
        c.googleClientId = d.config.googleClientId;
        localStorage.setItem('propCalc_siteConfig_v1', JSON.stringify(c));
      }catch(e){}
      // Initialise now if GSI is ready, otherwise onGoogleLibraryLoad will call it
      if(typeof google !== 'undefined' && google.accounts) initGoogleSignIn();
    } else {
      var w = document.getElementById('google-signin-wrap');
      if(w) w.style.display = 'none';
    }
  }).catch(function(){
    var w = document.getElementById('google-signin-wrap');
    if(w) w.style.display = 'none';
  });
})();

// ── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('tab-signin').addEventListener('click', function(){ setTab('signin'); });
document.getElementById('tab-signup').addEventListener('click', function(){ setTab('signup'); });
document.getElementById('si-btn').addEventListener('click', doSignin);
document.getElementById('su-btn').addEventListener('click', doSignup);
document.getElementById('fp-btn').addEventListener('click', requestReset);
document.getElementById('fp-reset-btn').addEventListener('click', confirmReset);
document.getElementById('verify-btn').addEventListener('click', doVerifyEmail);
document.getElementById('resend-code-btn').addEventListener('click', resendVerificationCode);
document.getElementById('forgot-pw-btn').addEventListener('click', showForgotPassword);
document.getElementById('back-to-signin-btn').addEventListener('click', function(){ setTab('signin'); });
document.getElementById('si-email').addEventListener('keydown', function(e){ if(e.key==='Enter') doSignin(); });
document.getElementById('si-password').addEventListener('keydown', function(e){ if(e.key==='Enter') doSignin(); });
document.getElementById('fp-email').addEventListener('keydown', function(e){ if(e.key==='Enter') requestReset(); });
document.getElementById('fp-code').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('fp-newpw').focus(); });
document.getElementById('fp-newpw').addEventListener('keydown', function(e){ if(e.key==='Enter') confirmReset(); });
document.getElementById('su-name').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('su-email').focus(); });
document.getElementById('su-email').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('su-password').focus(); });
document.getElementById('su-password').addEventListener('keydown', function(e){ if(e.key==='Enter') doSignup(); });
document.getElementById('su-password').addEventListener('input', function(){ updatePwStrength(this.value); });
document.getElementById('su-verify-code').addEventListener('keydown', function(e){ if(e.key==='Enter') doVerifyEmail(); });

// ── Turnstile helper ─────────────────────────────────────────────────────────
function getTurnstileToken(widgetId){
  if(typeof turnstile==='undefined') return ''; // library not loaded yet
  var el=document.getElementById(widgetId);
  if(!el) return '';
  return turnstile.getResponse(el) || '';
}
function resetTurnstile(widgetId){
  if(typeof turnstile==='undefined') return;
  var el=document.getElementById(widgetId);
  if(el) turnstile.reset(el);
}

// ── Functions ────────────────────────────────────────────────────────────────

function setTab(t){
  document.getElementById('form-signin').style.display = t==='signin' ? '' : 'none';
  document.getElementById('form-signup').style.display = t==='signup' ? '' : 'none';
  document.getElementById('form-forgot').style.display = 'none';
  document.getElementById('tab-signin').classList.toggle('active', t==='signin');
  document.getElementById('tab-signup').classList.toggle('active', t==='signup');
  var h = document.getElementById('login-heading');
  var s = document.getElementById('login-sub');
  if(h) h.textContent = t==='signin' ? 'Welcome back' : 'Create your account';
  if(s) s.textContent = t==='signin' ? 'Sign in to access your property scenarios' : 'Start for free — no credit card required';
}

function showForgotPassword(){
  document.getElementById('form-signin').style.display = 'none';
  document.getElementById('form-signup').style.display = 'none';
  document.getElementById('form-forgot').style.display = '';
  document.getElementById('forgot-step-request').style.display = '';
  document.getElementById('forgot-step-reset').style.display = 'none';
  document.getElementById('fp-error').textContent = '';
  document.getElementById('fp-reset-error').textContent = '';
  var h = document.getElementById('login-heading');
  var s = document.getElementById('login-sub');
  if(h) h.textContent = 'Reset password';
  if(s) s.textContent = "We'll send a code to your email";
  var siEmail = document.getElementById('si-email').value;
  if(siEmail) document.getElementById('fp-email').value = siEmail;
  setTimeout(function(){ document.getElementById('fp-email').focus(); }, 80);
}

var _fpEmail = '';
async function requestReset(){
  const email = document.getElementById('fp-email').value.trim();
  const errEl = document.getElementById('fp-error');
  if(!email){ errEl.textContent = 'Please enter your email'; return; }
  const turnstileToken = getTurnstileToken('ts-forgot');
  if(!turnstileToken){ errEl.textContent = 'Please complete the security check'; return; }
  errEl.textContent = '';
  const btn = document.getElementById('fp-btn');
  btn.textContent = 'Sending…'; btn.disabled = true;
  _fpEmail = email;
  if(window.trackAuthAction) trackAuthAction('password_reset_requested', 'pending');
  await callAuth('requestPasswordReset', {email,turnstileToken});
  btn.textContent = 'Send Reset Code →'; btn.disabled = false;
  document.getElementById('forgot-step-request').style.display = 'none';
  document.getElementById('forgot-step-reset').style.display = '';
  setTimeout(function(){ document.getElementById('fp-code').focus(); }, 80);
}

async function confirmReset(){
  const code = document.getElementById('fp-code').value.trim();
  const newPw = document.getElementById('fp-newpw').value;
  const errEl = document.getElementById('fp-reset-error');
  if(!code){ errEl.textContent = 'Enter the reset code'; return; }
  if(!newPw || newPw.length < 8){ errEl.textContent = 'Password must be at least 8 characters'; return; }
  errEl.textContent = '';
  const btn = document.getElementById('fp-reset-btn');
  btn.textContent = 'Updating…'; btn.disabled = true;
  const res = await callAuth('resetPasswordWithToken', {email: _fpEmail, code, newPassword: newPw});
  btn.textContent = 'Set New Password →'; btn.disabled = false;
  if(res.ok){
    if(window.trackAuthAction) trackAuthAction('password_reset_confirmed', 'success');
    setTab('signin');
    var s = document.getElementById('login-sub');
    if(s){ s.textContent = '✓ Password updated — sign in with your new password'; s.style.color = '#5A9E7A'; }
  } else {
    if(window.trackAuthAction) trackAuthAction('password_reset_confirmed', 'failure');
    errEl.textContent = res.error || 'Invalid or expired code. Please try again.';
  }
}

async function callAuth(action, payload){
  try {
    const r = await fetch('/.netlify/functions/auth', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action,...payload})});
    return await r.json();
  } catch(e){ return {ok:false, error:'Network error — try again'}; }
}

function showSpinner(){ document.getElementById('page-spinner').classList.add('show'); }
function hideSpinner(){ document.getElementById('page-spinner').classList.remove('show'); }
function goTo(url){ showSpinner(); setTimeout(function(){ location.href=url; }, 80); }

function updatePwStrength(pw){
  var fill = document.getElementById('pw-strength-fill');
  var label = document.getElementById('pw-strength-label');
  if(!fill||!label) return;
  var score = 0;
  if(pw.length >= 8) score++;
  if(pw.length >= 12) score++;
  if(/[A-Z]/.test(pw)) score++;
  if(/[a-z]/.test(pw)) score++;
  if(/[0-9]/.test(pw)) score++;
  if(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) score++;
  var pct = Math.round((score/6)*100);
  var col = score<=2?'#C45A5A':score<=4?'#C9A84C':'#5A9E7A';
  var lbl = score<=2?'Weak':score<=4?'Fair':'Strong';
  fill.style.width = pct+'%';
  fill.style.background = col;
  label.textContent = pw.length ? lbl : '';
  label.style.color = col;
}

function persistSession(res, fallback){
  const session={
    id:res.id||fallback.email,
    name:res.name||fallback.name||fallback.email.split('@')[0],
    email:res.email||fallback.email,
    token:res.token||null,
    plan:res.plan||fallback.plan||'free',
    role:res.role||'user'
  };
  if(res.canceledAt) session.canceledAt=res.canceledAt;
  if(res.expiresAt) session.expiresAt=res.expiresAt;
  if(res.renewsAt) session.renewsAt=res.renewsAt;
  localStorage.setItem('propCalc_session_v1', JSON.stringify(session));
}

function postVerificationRedirect(plan){
  if(plan==='pro') goTo('/account?checkout=1&panel=subscription');
  else goTo('/account?panel=subscription');
}

function showVerificationStep(data){
  document.getElementById('signup-verify-step').style.display='block';
  document.getElementById('su-btn').style.display='none';
  const email = data.email || document.getElementById('su-email').value.trim();
  document.getElementById('verify-note').textContent = 'Enter the 6-digit code sent to '+email+'.';
}

async function doSignin(){
  const email = document.getElementById('si-email').value.trim();
  const password = document.getElementById('si-password').value;
  const errEl = document.getElementById('si-error');
  const btn = document.getElementById('si-btn');
  if(!email||!password){ errEl.textContent='Please enter email and password'; return; }
  const turnstileToken = getTurnstileToken('ts-signin');
  if(!turnstileToken){ errEl.textContent='Please complete the security check'; return; }
  btn.disabled=true; btn.textContent='Signing in…'; errEl.textContent='';
  showSpinner();
  const res = await callAuth('signin', {email,password,turnstileToken});
  if(res.ok){
    persistSession(res, {email});
    // Track email Sign-In
    if(window.trackLogin) trackLogin('email');
    try{
      const authH = 'Bearer ' + (res.token||'');
      const profileRes = await fetch('/.netlify/functions/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':authH},
        body:JSON.stringify({action:'getProfile'})
      }).then(r=>r.json());
      if(profileRes.ok && profileRes.profile){
        const profileKey = 'propCalc_profile_v1_' + (res.id || email);
        localStorage.setItem(profileKey, JSON.stringify(profileRes.profile));
      }
    }catch(e){}
    goTo('/app');
    return;
  }
  hideSpinner();
  if(res.requiresEmailVerification){
    setTab('signup');
    document.getElementById('su-email').value = email;
    document.getElementById('su-name').value = res.name || document.getElementById('su-name').value;
    document.getElementById('su-plan').value = res.plan || 'free';
    showVerificationStep(res);
    errEl.textContent = '';
  } else {
    errEl.textContent = res.error || 'Sign in failed — please try again';
  }
  resetTurnstile('ts-signin');
  btn.disabled=false; btn.textContent='Sign In →';
}

async function doSignup(){
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-password').value;
  const plan = document.getElementById('su-plan').value;
  const errEl = document.getElementById('su-error');
  const btn = document.getElementById('su-btn');
  const terms = document.getElementById('su-terms');
  if(!name||!email||!password){ errEl.textContent='Please fill in all fields'; return; }
  if(terms && !terms.checked){ errEl.textContent='Please accept the Terms & Conditions and Privacy Policy'; return; }
  const emailRx = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if(!emailRx.test(email)){ errEl.textContent='Please enter a valid email address'; return; }
  const pwErrors = [];
  if(password.length < 8) pwErrors.push('at least 8 characters');
  if(!/[A-Z]/.test(password)) pwErrors.push('one uppercase letter');
  if(!/[a-z]/.test(password)) pwErrors.push('one lowercase letter');
  if(!/[0-9]/.test(password)) pwErrors.push('one number');
  if(!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) pwErrors.push('one special character (!@#$…)');
  if(pwErrors.length){ errEl.textContent='Password needs: ' + pwErrors.join(', '); return; }
  const turnstileToken = getTurnstileToken('ts-signup');
  if(!turnstileToken){ errEl.textContent='Please complete the security check'; return; }
  btn.disabled=true; btn.textContent='Creating account…'; errEl.textContent='';
  const pendingRef = localStorage.getItem('equitySight_pendingRef') || '';
  const res = await callAuth('signup', {email,password,name,plan,ref:pendingRef,turnstileToken});
  if(res.ok && res.requiresEmailVerification){
    localStorage.removeItem('equitySight_pendingRef');
    showVerificationStep(res);
    document.getElementById('verify-error').textContent='';
  } else {
    errEl.textContent = res.error || 'Could not create account — please try again';
    resetTurnstile('ts-signup');
    btn.disabled=false; btn.textContent='Create Account →';
  }
}

async function doVerifyEmail(){
  const code = document.getElementById('su-verify-code').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const plan = document.getElementById('su-plan').value;
  const name = document.getElementById('su-name').value.trim();
  const errEl = document.getElementById('verify-error');
  const btn = document.getElementById('verify-btn');
  if(!code){ errEl.textContent='Enter your verification code'; return; }
  btn.disabled = true; btn.textContent = 'Verifying…'; errEl.textContent='';
  const res = await callAuth('verifyEmail', {email,code});
  if(res.ok){
    persistSession(res, {email,name,plan});
    // Track email signup and verification
    if(window.trackSignup) trackSignup('email');
    if(window.trackAuthAction) trackAuthAction('email_verified', 'success');
    try{
      const authH = 'Bearer ' + (res.token||'');
      const profileRes = await fetch('/.netlify/functions/auth', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':authH},
        body:JSON.stringify({action:'getProfile'})
      }).then(r=>r.json());
      if(profileRes.ok && profileRes.profile){
        const profileKey = 'propCalc_profile_v1_' + (res.id || email);
        localStorage.setItem(profileKey, JSON.stringify(profileRes.profile));
      }
    }catch(e){}
    postVerificationRedirect(res.plan || plan);
  } else {
    if(window.trackAuthAction) trackAuthAction('email_verified', 'failure');
    errEl.textContent = res.error || 'Could not verify email';
    btn.disabled = false; btn.textContent = 'Verify Email →';
  }
}

async function resendVerificationCode(){
  const email = document.getElementById('su-email').value.trim();
  const errEl = document.getElementById('verify-error');
  if(!email){ errEl.textContent='Enter your email first'; return; }
  const res = await callAuth('resendVerification', {email});
  if(res.ok){
    showVerificationStep(res);
    errEl.textContent='A fresh verification code has been sent.';
    errEl.style.color = '#5A9E7A';
    setTimeout(function(){ errEl.style.color=''; }, 1200);
  } else {
    errEl.textContent = res.error || 'Could not resend code';
  }
}

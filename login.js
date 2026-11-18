// login.js — Login/signup page logic
//
// Architectural principles (re-architected April 2026):
//   1. Tab handlers are bound at the TOP of the file so a tap registers
//      the moment the script parses — no waiting on lazy IIFEs.
//   2. Tab switch is a pure CSS attribute flip on `.login-forms[data-active]`.
//      Zero reflow, zero third-party work.
//   3. Cloudflare Turnstile pre-warms on first input focus (focusin
//      bubbling up from `.login-box`). The widget renders into the
//      active form's reserved 65px slot and runs its challenge while
//      the user types email + password. By the time they hit submit,
//      the token is cached and the call completes without an extra
//      "Verifying…" wait.
//   4. Google Sign-In script is loaded ~150ms after script parse —
//      long enough for the page to paint and tab handlers to be
//      hooked up, short enough for the button to appear within ~1s.
//   5. After a successful sign-in/signup, the profile fetch runs
//      fire-and-forget so it never blocks the redirect.
//   6. Nothing else third-party (gtag, analytics, auth-nav) loads on
//      the login page. They're stripped from login.html.

'use strict';

const TURNSTILE_SITEKEY = '0x4AAAAAACvWg4IZeEydKXQ3';

// ──────────────────────────────────────────────────────────────────────
// 1. Tab switching — bound first so clicks register immediately
// ──────────────────────────────────────────────────────────────────────

function setActiveForm(target) {
  const wrap = document.querySelector('.login-forms');
  if (wrap) wrap.setAttribute('data-active', target);

  const siBtn = document.getElementById('tab-signin');
  const suBtn = document.getElementById('tab-signup');
  if (siBtn) {
    siBtn.classList.toggle('active', target === 'signin');
    siBtn.setAttribute('aria-selected', target === 'signin' ? 'true' : 'false');
  }
  if (suBtn) {
    suBtn.classList.toggle('active', target === 'signup');
    suBtn.setAttribute('aria-selected', target === 'signup' ? 'true' : 'false');
  }

  const h = document.getElementById('login-heading');
  const s = document.getElementById('login-sub');
  if (h) {
    h.textContent = target === 'signin' ? 'Sign in'
                  : target === 'signup' ? 'Create an account'
                  : target === 'magic'  ? 'Sign in with email'
                  : 'Reset password';
  }
  if (s) {
    s.textContent = target === 'signin' ? ''
                  : target === 'signup' ? 'An account saves your journey so you can open it on another device or share it with a partner.'
                  : target === 'magic'  ? ''
                  : '';
    s.style.color = '';
  }

  ['form-signin', 'form-signup', 'form-forgot', 'form-magic'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id.replace('form-', '') === target;
    if (isActive) {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    } else {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    }
  });
}

// Bind tab + back-link clicks RIGHT NOW. The rest of the script sets up
// other handlers below, but tabs respond from the moment this line runs.
(function bindTabHandlersImmediately() {
  const siTab = document.getElementById('tab-signin');
  const suTab = document.getElementById('tab-signup');
  if (siTab) siTab.addEventListener('click', function () { setActiveForm('signin'); });
  if (suTab) suTab.addEventListener('click', function () { setActiveForm('signup'); });
  // Inert state for the inactive forms on first paint.
  ['form-signup', 'form-forgot', 'form-magic'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
  });
})();

// ──────────────────────────────────────────────────────────────────────
// 2. URL parameters
// ──────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
if (params.get('tab') === 'signup') setActiveForm('signup');
{
  const planEl = document.getElementById('su-plan');
}
const refParam = (params.get('ref') || '').trim().toUpperCase().slice(0, 16);
if (refParam) {
  try { localStorage.setItem('equitySight_pendingRef', refParam); } catch (e) {}
}
// Surface a friendly notice when admin.js / auth-nav.js bounced the user
// here after detecting a stale localStorage session (no HttpOnly cookie).
// Reason codes:
//   session-expired — token cookie missing or expired; need to sign back in.
// The notice slot is the existing #form-error element on the active form.
{
  const reason = params.get('reason');
  if (reason === 'session-expired') {
    const errEl = document.querySelector('.login-form:not([hidden]) .form-error, #form-signin .form-error');
    if (errEl) {
      errEl.textContent = 'Your session expired. Sign in again.';
      errEl.style.color = '#E8D080';
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 3. Already-logged-in redirect
// ──────────────────────────────────────────────────────────────────────

// Where sign-in may send the visitor afterwards. `next` comes from the
// address bar, so it is checked against this list: a page on this site,
// written in plain path characters. Anything else (another site, a
// protocol-relative //host, a backslash, a percent escape, markup) goes to
// /journey. A listed page with a query or #step it doesn't allow keeps the
// page and drops the rest.
const NEXT_DEFAULT = '/journey';
const NEXT_SLUG = '[a-z]+(?:-[a-z]+)*';          // tool slugs: letters and dashes
const NEXT_PAGES = [
  /^(?:journey|app|account|portfolio|pricing|admin)$/,
  /^tools\/?$/,
  new RegExp('^tools/' + NEXT_SLUG + '/?$'),
  /^suburb\/[a-z]{2,3}\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/,
];
const NEXT_FROM = 'from=(?:step[2-7]|app|journey|' + NEXT_SLUG + ')';
const NEXT_QUERIES = {
  // The journey's partner-invite link carries its join token through signup.
  journey: /^join=[A-Za-z0-9_-]{6,64}$/,
  // Saving a workup after sign-up, a Journey place, a saved workup.
  app: new RegExp('^(?:save=1|place=[A-Za-z0-9_-]{8}|w=[A-Za-z0-9_-]{1,64}|' + NEXT_FROM + ')$'),
  tools: new RegExp('^' + NEXT_FROM + '$'),
};
const NEXT_HASHES = { journey: /^step-[1-7]$/ };
function safeNextUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 200) return NEXT_DEFAULT;
  // One optional leading slash, then a letter or digit, then only plain
  // path characters. This alone refuses //host, /\host, https:, javascript:,
  // %2F escapes, spaces, tabs, quotes and angle brackets.
  if (!/^\/?[A-Za-z0-9][A-Za-z0-9/_.=&?#-]*$/.test(raw)) return NEXT_DEFAULT;
  let rest = raw.replace(/^\//, '');
  let hash = '', query = '';
  const h = rest.indexOf('#');
  if (h !== -1) { hash = rest.slice(h + 1); rest = rest.slice(0, h); }
  const q = rest.indexOf('?');
  if (q !== -1) { query = rest.slice(q + 1); rest = rest.slice(0, q); }
  const path = rest.replace(/\.html$/, '');
  if (!NEXT_PAGES.some(function (re) { return re.test(path); })) return NEXT_DEFAULT;
  const section = path.split('/')[0];
  const queryOk = query && NEXT_QUERIES[section] && NEXT_QUERIES[section].test(query);
  const hashOk = hash && NEXT_HASHES[path] && NEXT_HASHES[path].test(hash);
  return '/' + path + (queryOk ? '?' + query : '') + (hashOk ? '#' + hash : '');
}

// The page the visitor came from, when it is on this site. Covers a Sign in
// link that didn't carry `next` (the nav's first-paint stub, older pages).
function referrerNext() {
  try {
    if (!document.referrer) return '';
    const u = new URL(document.referrer);
    if (u.origin !== location.origin || /^\/login(\.html)?\/?$/.test(u.pathname)) return '';
    return u.pathname + u.search;
  } catch (e) { return ''; }
}

// The emailed sign-in link comes back as /login?magic=… with no `next`, often
// in a new tab. The return path chosen when the link was asked for is kept
// here for an hour (a page address only, checked again by safeNextUrl). It
// can hold a partner invite, so every sign-in removes it, whichever way it
// went, and so does sign-out (auth-nav.js).
const LOGIN_NEXT_KEY = 'propCalc_login_next';
function rememberNext(path) {
  try {
    if (path && path !== NEXT_DEFAULT) localStorage.setItem(LOGIN_NEXT_KEY, JSON.stringify({ p: path, at: Date.now() }));
    else localStorage.removeItem(LOGIN_NEXT_KEY);
  } catch (e) {}
}
function forgetRememberedNext() {
  try { localStorage.removeItem(LOGIN_NEXT_KEY); } catch (e) {}
}
// Reads the remembered path once and removes it.
function rememberedNext() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(LOGIN_NEXT_KEY) || 'null'); } catch (e) {}
  forgetRememberedNext();
  const age = r && typeof r.at === 'number' ? Date.now() - r.at : -1;
  if (r && typeof r.p === 'string' && age >= 0 && age < 3600000) return r.p;
  return '';
}

// A partner invite (/journey?join=<token>) that was opened in this browser
// before signing in. journey.js stores it for a day and removes it once the
// invite is accepted, declined or switched off. The emailed sign-in link
// comes back as /login?magic=… with no `next`, so without this the invite is
// lost on the way back.
function pendingJoinNext() {
  try {
    const p = JSON.parse(localStorage.getItem('propCalc_journey_pendingJoin') || 'null');
    const age = p ? Date.now() - p.at : -1;
    if (p && typeof p.t === 'string' && age >= 0 && age < 86400000) return 'journey?join=' + p.t;
  } catch (e) {}
  return '';
}
// Where to go once signed in: the page's own `next`, or else a waiting
// invite, or else the page the visitor came from. All go through
// safeNextUrl, so the same allowlist applies.
function nextAfterSignIn() {
  return safeNextUrl(params.get('next') || pendingJoinNext() || referrerNext());
}

(function redirectIfLoggedIn() {
  try {
    const s = JSON.parse(localStorage.getItem('propCalc_session_v1'));
    if (s && (s.id || s.email)) {
      forgetRememberedNext();
      location.href = nextAfterSignIn();
    }
  } catch (e) {}
})();

// ──────────────────────────────────────────────────────────────────────
// 3b. Magic-link clickable token — handle ?magic=TOKEN immediately
// ──────────────────────────────────────────────────────────────────────
// If the user arrives via a magic-link email, the URL contains
// ?magic=TOKEN. Verify it before anything else and redirect on success
// so the user never sees the login form. On failure, fall back to the
// magic-link form with an explanatory error.
(function consumeMagicTokenFromUrl() {
  const token = params.get('magic');
  if (!token) return;
  // Hide the form behind the spinner overlay so the user doesn't see
  // a flash of the unauth form before redirect.
  document.getElementById('page-spinner').classList.add('show');
  // Strip the token from the URL immediately so a refresh doesn't
  // re-trigger this flow with an already-consumed token.
  try { history.replaceState(null, '', '/login'); } catch (e) {}
  fetch('/.netlify/functions/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verifyMagicLink', token: token }),
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res && res.ok) {
      // Mirror what doSignin() does on success.
      const session = {
        id: res.id || res.email,
        name: res.name || (res.email || '').split('@')[0],
        email: res.email,
        plan: res.plan || 'free',
        role: res.role || 'user',
      };
      if (res.canceledAt) session.canceledAt = res.canceledAt;
      if (res.expiresAt) session.expiresAt = res.expiresAt;
      if (res.renewsAt) session.renewsAt = res.renewsAt;
      try { localStorage.setItem('propCalc_session_v1', JSON.stringify(session)); } catch (e) {}
      // Read (and so remove) the remembered path even when `next` or an
      // invite wins.
      const remembered = rememberedNext();
      location.href = safeNextUrl(params.get('next') || pendingJoinNext() || remembered);
    } else {
      document.getElementById('page-spinner').classList.remove('show');
      setActiveForm('magic');
      const ml = document.getElementById('ml-error');
      if (ml) ml.textContent = (res && res.error) || 'That sign-in link is invalid or has expired. Ask for a new one.';
    }
  }).catch(function () {
    document.getElementById('page-spinner').classList.remove('show');
    setActiveForm('magic');
    const ml = document.getElementById('ml-error');
    if (ml) ml.textContent = 'Network error. Try again.';
  });
})();

// ──────────────────────────────────────────────────────────────────────
// 4. Cloudflare Turnstile — load on first submit, never before
// ──────────────────────────────────────────────────────────────────────

let _turnstileScriptPromise = null;
function loadTurnstileScript() {
  if (_turnstileScriptPromise) return _turnstileScriptPromise;
  _turnstileScriptPromise = new Promise(function (resolve) {
    window.onTurnstileReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady';
    s.async = true;
    document.head.appendChild(s);
  });
  return _turnstileScriptPromise;
}

// One shared invisible Turnstile widget for the entire login page.
// Invisible mode means there's no UI rendered at all — the challenge
// runs as background JavaScript and we get a token via callback. This
// removes the visible widget entirely (and the 65 px slot it used to
// occupy in each form), which was the biggest remaining piece of
// friction in the form.
const TURNSTILE_HOST_ID = 'turnstile-host';
let _tsState = null; // { widgetId, lastToken, pendingResolve, pendingReject }

function _renderTurnstile() {
  const state = { widgetId: undefined, lastToken: null, pendingResolve: null, pendingReject: null };
  state.widgetId = turnstile.render('#' + TURNSTILE_HOST_ID, {
    sitekey: TURNSTILE_SITEKEY,
    size: 'invisible',
    callback: function (token) {
      if (state.pendingResolve) {
        const r = state.pendingResolve;
        state.pendingResolve = null;
        state.pendingReject = null;
        state.lastToken = null; // consumed by the awaiter
        r(token);
      } else {
        state.lastToken = token;
      }
    },
    'error-callback': function () {
      if (state.pendingReject) {
        const r = state.pendingReject;
        state.pendingResolve = null;
        state.pendingReject = null;
        r(new Error('Turnstile error'));
      }
    },
    'expired-callback': function () { state.lastToken = null; },
  });
  _tsState = state;
  return state;
}

// Lazy-load Turnstile, ensure the shared widget is rendered, and
// resolve with a fresh single-use token. The first call renders the
// widget; subsequent calls reset it to get a new token without
// re-creating any iframe.
async function getTurnstileToken() {
  await loadTurnstileScript();
  let state = _tsState;
  if (!state) {
    state = _renderTurnstile();
  } else if (!state.lastToken) {
    try { turnstile.reset(state.widgetId); } catch (e) {}
  }
  if (state.lastToken) {
    const t = state.lastToken;
    state.lastToken = null;
    return t;
  }
  return new Promise(function (resolve, reject) {
    state.pendingResolve = resolve;
    state.pendingReject = reject;
  });
}

function resetTurnstile() {
  if (typeof turnstile === 'undefined') return;
  if (!_tsState) return;
  _tsState.lastToken = null;
  try { turnstile.reset(_tsState.widgetId); } catch (e) {}
}

// ──────────────────────────────────────────────────────────────────────
// 5. Google Sign-In — deferred to after window.load + idle
// ──────────────────────────────────────────────────────────────────────

let _gsiScriptPromise = null;
function loadGoogleScript() {
  if (_gsiScriptPromise) return _gsiScriptPromise;
  _gsiScriptPromise = new Promise(function (resolve) {
    if (typeof google !== 'undefined' && google.accounts) return resolve();
    window.onGoogleLibraryLoad = resolve;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  });
  return _gsiScriptPromise;
}

async function initGoogleSignIn() {
  // Cache fast path: if we already know the client ID, just load the
  // GSI script and render. No network call needed.
  let clientId = '';
  try {
    const cached = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1') || '{}');
    if (cached.googleClientId) clientId = cached.googleClientId;
  } catch (e) {}

  if (clientId) {
    await loadGoogleScript();
  } else {
    // First visit: kick off the GSI script download and the config
    // fetch in PARALLEL, then await both. Was sequential before, costing
    // ~500 ms on cold loads.
    const scriptPromise = loadGoogleScript();
    let d = null;
    try {
      const r = await fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getPublicConfig' }),
      });
      d = await r.json();
    } catch (e) {}
    if (d && d.ok && d.config && d.config.googleClientId) {
      clientId = d.config.googleClientId;
      try {
        const c = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1') || '{}');
        c.googleClientId = clientId;
        localStorage.setItem('propCalc_siteConfig_v1', JSON.stringify(c));
      } catch (e) {}
    }
    await scriptPromise;
  }

  if (!clientId) {
    const w = document.getElementById('google-signin-wrap');
    if (w) w.style.display = 'none';
    return;
  }

  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  const btnHost = document.getElementById('google-signin-btn');
  if (btnHost) {
    btnHost.innerHTML = '';
    google.accounts.id.renderButton(btnHost, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      width: 320,
      text: 'continue_with',
      logo_alignment: 'left',
    });
  }
}

(function scheduleGoogleSignIn() {
  // Fire ~150ms after script parse. Long enough for the page to paint
  // and tab handlers to be hooked up; short enough that the Google
  // button visually appears within ~1s on a typical mobile connection.
  setTimeout(initGoogleSignIn, 150);
})();

async function handleGoogleCredential(response) {
  const errEl = document.getElementById('google-signin-error');
  if (errEl) errEl.textContent = '';
  const btn = document.getElementById('google-signin-btn');
  if (btn) btn.style.opacity = '0.5';

  let pageTrail = [];
  try { pageTrail = JSON.parse(localStorage.getItem('es_page_trail') || '[]'); } catch (e) {}
  const res = await callAuth('googleSignin', { credential: response.credential, pageTrail: pageTrail });
  if (btn) btn.style.opacity = '';

  if (res.ok) {
    try { localStorage.removeItem('es_page_trail'); } catch (e) {}
    persistSession(res, { email: res.email });
    refreshProfileInBackground(res.id || res.email);
    goTo(nextAfterSignIn());
  } else {
    if (errEl) errEl.textContent = res.error || 'Google sign-in failed. Try again, or use your email and password below.';
  }
}

// ──────────────────────────────────────────────────────────────────────
// 6. Helpers
// ──────────────────────────────────────────────────────────────────────

async function callAuth(action, payload) {
  try {
    const r = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: 'Network error. Try again.' };
  }
}

function showSpinner() { document.getElementById('page-spinner').classList.add('show'); }
function hideSpinner() { document.getElementById('page-spinner').classList.remove('show'); }
// Show the spinner and navigate immediately. The previous 60ms
// setTimeout was a hand-wavy "let the spinner paint first" delay; the
// browser commits the spinner class before initiating navigation
// anyway, so the timeout was pure dead time.
function goTo(url) { showSpinner(); location.href = url; }

// Fire-and-forget profile fetch. Called after sign-in/signup success
// so the user record is hot in localStorage by the time the next page
// loads, but DOES NOT block redirect — the next page will fall back
// to its own fetch if the data isn't there yet.
function refreshProfileInBackground(userKey) {
  fetch('/.netlify/functions/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getProfile' }),
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.ok && d.profile) {
      try { localStorage.setItem('propCalc_profile_v1_' + userKey, JSON.stringify(d.profile)); } catch (e) {}
    }
  }).catch(function () {});
}

function persistSession(res, fallback) {
  const session = {
    id: res.id || fallback.email,
    name: res.name || fallback.name || fallback.email.split('@')[0],
    email: res.email || fallback.email,
    plan: res.plan || fallback.plan || 'free',
    role: res.role || 'user',
  };
  if (res.canceledAt) session.canceledAt = res.canceledAt;
  if (res.expiresAt) session.expiresAt = res.expiresAt;
  if (res.renewsAt) session.renewsAt = res.renewsAt;
  localStorage.setItem('propCalc_session_v1', JSON.stringify(session));
  forgetRememberedNext();
}

function updatePwStrength(pw) {
  const fill = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');
  if (!fill || !label) return;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) score++;
  const pct = Math.round((score / 6) * 100);
  const col = score <= 2 ? '#C45A5A' : score <= 4 ? '#C9A84C' : '#5A9E7A';
  const lbl = score <= 2 ? 'Weak' : score <= 4 ? 'Fair' : 'Strong';
  fill.style.width = pct + '%';
  fill.style.background = col;
  label.textContent = pw.length ? lbl : '';
  label.style.color = col;
}

// ──────────────────────────────────────────────────────────────────────
// 7. Forgot-password flow
// ──────────────────────────────────────────────────────────────────────

let _fpEmail = '';

function showForgotPassword() {
  setActiveForm('forgot');
  document.getElementById('forgot-step-request').style.display = '';
  document.getElementById('forgot-step-reset').style.display = 'none';
  document.getElementById('fp-error').textContent = '';
  document.getElementById('fp-reset-error').textContent = '';
  const siEmail = document.getElementById('si-email').value;
  if (siEmail) document.getElementById('fp-email').value = siEmail;
  setTimeout(function () { document.getElementById('fp-email').focus({ preventScroll: true }); }, 80);
}

async function requestReset() {
  const email = document.getElementById('fp-email').value.trim();
  const errEl = document.getElementById('fp-error');
  const btn = document.getElementById('fp-btn');
  if (!email) { errEl.textContent = 'Enter your email.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Sending…';
  let token;
  try { token = await getTurnstileToken(); }
  catch (e) {
    btn.disabled = false; btn.textContent = 'Send reset code';
    errEl.textContent = 'The security check failed. Reload the page and try again.';
    return;
  }
  _fpEmail = email;
  await callAuth('requestPasswordReset', { email: email, turnstileToken: token });
  btn.textContent = 'Send reset code'; btn.disabled = false;
  document.getElementById('forgot-step-request').style.display = 'none';
  document.getElementById('forgot-step-reset').style.display = '';
  setTimeout(function () { document.getElementById('fp-code').focus({ preventScroll: true }); }, 80);
}

async function confirmReset() {
  const code = document.getElementById('fp-code').value.trim();
  const newPw = document.getElementById('fp-newpw').value;
  const errEl = document.getElementById('fp-reset-error');
  const btn = document.getElementById('fp-reset-btn');
  if (!code) { errEl.textContent = 'Enter the reset code.'; return; }
  if (!newPw || newPw.length < 8) { errEl.textContent = 'The password must be at least 8 characters.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Updating…';
  const res = await callAuth('resetPasswordWithToken', { email: _fpEmail, code: code, newPassword: newPw });
  btn.disabled = false; btn.textContent = 'Set new password';
  if (res.ok) {
    setActiveForm('signin');
    const s = document.getElementById('login-sub');
    if (s) { s.textContent = 'Password updated. Sign in with your new password.'; s.style.color = '#5A9E7A'; }
  } else {
    errEl.textContent = res.error || 'That code is invalid or has expired. Try again.';
  }
}

// ──────────────────────────────────────────────────────────────────────
// 8. Sign-in / sign-up / verify
// ──────────────────────────────────────────────────────────────────────

function showVerificationStep(data) {
  document.getElementById('signup-verify-step').style.display = 'block';
  document.getElementById('su-btn').style.display = 'none';
  const email = data.email || document.getElementById('su-email').value.trim();
  document.getElementById('verify-note').textContent = 'Enter the 8-character code sent to ' + email + '.';
}

function postVerificationRedirect(plan) {
  const next = nextAfterSignIn();
  // Guest-mode migration: a guest who clicked "Create a free account" to save their
  // scenario must land back on /app so the pending draft auto-migrates into the new
  // account. Without this, a free email signup with next=/app would be sent to
  // /account and the migration hook (in app.js init) would never run.
  let pendingSave = false;
  try { pendingSave = !!localStorage.getItem('propCalc_pendingSave'); } catch (e) {}
  // The migration hook only runs on /app. If we're routing elsewhere, clear the flag
  // so it can't get stuck and fire a stale migration on a later /app visit.
  const clearPending = function(){ try { localStorage.removeItem('propCalc_pendingSave'); } catch (e) {} };
  if (pendingSave && /^\/app(\?|$)/.test(next)) { goTo(next); }
  else { clearPending(); goTo(next); }
}

async function doSignin() {
  const email = document.getElementById('si-email').value.trim();
  const password = document.getElementById('si-password').value;
  const errEl = document.getElementById('si-error');
  const btn = document.getElementById('si-btn');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Signing in…';
  let token;
  try { token = await getTurnstileToken(); }
  catch (e) {
    btn.disabled = false; btn.textContent = 'Sign in';
    errEl.textContent = 'The security check failed. Reload the page and try again.';
    return;
  }
  // No fullscreen spinner — the disabled button + `Signing in…` text
  // is the loading signal. Stacking a spinner overlay on top adds
  // visual noise and a moment of flicker before the redirect.
  const res = await callAuth('signin', { email: email, password: password, turnstileToken: token });
  if (res.ok) {
    persistSession(res, { email: email });
    refreshProfileInBackground(res.id || email);
    goTo(nextAfterSignIn());
    return;
  }
  if (res.requiresEmailVerification) {
    setActiveForm('signup');
    document.getElementById('su-email').value = email;
    document.getElementById('su-name').value = res.name || document.getElementById('su-name').value;
    document.getElementById('su-plan').value = res.plan || 'free';
    showVerificationStep(res);
    errEl.textContent = '';
  } else {
    errEl.textContent = res.error || 'Sign in failed. Try again.';
  }
  resetTurnstile();
  btn.disabled = false; btn.textContent = 'Sign in';
}

async function doSignup() {
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-password').value;
  const plan = document.getElementById('su-plan').value;
  const errEl = document.getElementById('su-error');
  const btn = document.getElementById('su-btn');
  const terms = document.getElementById('su-terms');
  if (!name || !email || !password) { errEl.textContent = 'Fill in your name, email and password.'; return; }
  if (terms && !terms.checked) { errEl.textContent = 'Tick the box to accept the Terms of Service and Privacy Policy.'; return; }
  const emailRx = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRx.test(email)) { errEl.textContent = 'Enter a valid email address.'; return; }
  const pwErrors = [];
  if (password.length < 8) pwErrors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) pwErrors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) pwErrors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) pwErrors.push('one number');
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) pwErrors.push('one special character (!@#$…)');
  if (pwErrors.length) { errEl.textContent = 'Password needs: ' + pwErrors.join(', '); return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Creating account…';
  let token;
  try { token = await getTurnstileToken(); }
  catch (e) {
    btn.disabled = false; btn.textContent = 'Create account';
    errEl.textContent = 'The security check failed. Reload the page and try again.';
    return;
  }
  const pendingRef = localStorage.getItem('equitySight_pendingRef') || '';
  let pageTrail = [];
  try { pageTrail = JSON.parse(localStorage.getItem('es_page_trail') || '[]'); } catch (e) {}
  const res = await callAuth('signup', {
    email: email, password: password, name: name, plan: plan,
    ref: pendingRef, turnstileToken: token, pageTrail: pageTrail,
  });
  if (res.ok && res.requiresEmailVerification) {
    try { localStorage.removeItem('equitySight_pendingRef'); } catch (e) {}
    try { localStorage.removeItem('es_page_trail'); } catch (e) {}
    showVerificationStep(res);
    document.getElementById('verify-error').textContent = '';
  } else {
    errEl.textContent = res.error || "Couldn't create the account. Try again.";
    resetTurnstile();
    btn.disabled = false; btn.textContent = 'Create account';
  }
}

async function doVerifyEmail() {
  const code = document.getElementById('su-verify-code').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const plan = document.getElementById('su-plan').value;
  const name = document.getElementById('su-name').value.trim();
  const errEl = document.getElementById('verify-error');
  const btn = document.getElementById('verify-btn');
  if (!code) { errEl.textContent = 'Enter your verification code.'; return; }
  btn.disabled = true; btn.textContent = 'Verifying…'; errEl.textContent = '';
  const res = await callAuth('verifyEmail', { email: email, code: code });
  if (res.ok) {
    persistSession(res, { email: email, name: name, plan: plan });
    refreshProfileInBackground(res.id || email);
    postVerificationRedirect(res.plan || plan);
  } else {
    errEl.textContent = res.error || "Couldn't verify your email. Try again.";
    btn.disabled = false; btn.textContent = 'Verify email';
  }
}

async function resendVerificationCode() {
  const email = document.getElementById('su-email').value.trim();
  const errEl = document.getElementById('verify-error');
  if (!email) { errEl.textContent = 'Enter your email first.'; return; }
  const res = await callAuth('resendVerification', { email: email });
  if (res.ok) {
    showVerificationStep(res);
    errEl.textContent = 'A new verification code has been sent.';
    errEl.style.color = '#5A9E7A';
    setTimeout(function () { errEl.style.color = ''; }, 1200);
  } else {
    errEl.textContent = res.error || "Couldn't resend the code. Try again.";
  }
}

// ──────────────────────────────────────────────────────────────────────
// 8b. Magic-link sign-in (passwordless)
// ──────────────────────────────────────────────────────────────────────
let _mlEmail = ''; // remembered between request and verify steps

function showMagicLinkRequest() {
  setActiveForm('magic');
  document.getElementById('magic-step-request').style.display = '';
  document.getElementById('magic-step-verify').style.display = 'none';
  document.getElementById('ml-error').textContent = '';
  document.getElementById('ml-verify-error').textContent = '';
  // Pre-fill from the password sign-in form if the user typed an email there.
  const siEmail = document.getElementById('si-email').value;
  if (siEmail) document.getElementById('ml-email').value = siEmail;
}

function showMagicLinkVerify(email) {
  document.getElementById('magic-step-request').style.display = 'none';
  document.getElementById('magic-step-verify').style.display = '';
  document.getElementById('ml-verify-error').textContent = '';
  const note = document.getElementById('ml-verify-note');
  if (note) note.textContent = 'I sent a sign-in link and a 6-digit code to ' + email + '. Open the link or enter the code here.';
  setTimeout(function () { document.getElementById('ml-code').focus({ preventScroll: true }); }, 80);
}

async function requestMagicLink() {
  const email = document.getElementById('ml-email').value.trim();
  const errEl = document.getElementById('ml-error');
  const btn = document.getElementById('ml-send-btn');
  if (!email) { errEl.textContent = 'Enter your email.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Sending…';
  let token;
  try { token = await getTurnstileToken(); }
  catch (e) {
    btn.disabled = false; btn.textContent = 'Send sign-in link';
    errEl.textContent = 'The security check failed. Reload the page and try again.';
    return;
  }
  const res = await callAuth('sendMagicLink', { email: email, turnstileToken: token });
  btn.disabled = false; btn.textContent = 'Send sign-in link';
  if (res && res.ok) {
    rememberNext(nextAfterSignIn());
    _mlEmail = email;
    showMagicLinkVerify(email);
  } else {
    errEl.textContent = (res && res.error) || "Couldn't send the sign-in link. Try again.";
  }
}

async function verifyMagicCodeFlow() {
  const code = document.getElementById('ml-code').value.trim();
  const errEl = document.getElementById('ml-verify-error');
  const btn = document.getElementById('ml-verify-btn');
  const email = _mlEmail || document.getElementById('ml-email').value.trim();
  if (!code) { errEl.textContent = 'Enter the 6-digit code.'; return; }
  if (!email) { errEl.textContent = 'Ask for a new sign-in link.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Signing in…';
  const res = await callAuth('verifyMagicCode', { email: email, code: code });
  if (res && res.ok) {
    persistSession(res, { email: email });
    refreshProfileInBackground(res.id || email);
    goTo(nextAfterSignIn());
    return;
  }
  btn.disabled = false; btn.textContent = 'Verify code';
  errEl.textContent = (res && res.error) || 'That code is invalid or has expired.';
}

async function resendMagicLink() {
  const errEl = document.getElementById('ml-verify-error');
  const btn = document.getElementById('ml-resend-btn');
  if (!_mlEmail) { errEl.textContent = 'Enter your email and try again.'; return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  let token;
  try { token = await getTurnstileToken(); } catch (e) { token = ''; }
  const res = await callAuth('sendMagicLink', { email: _mlEmail, turnstileToken: token });
  btn.disabled = false; btn.textContent = 'Resend';
  if (res && res.ok) {
    errEl.textContent = 'A new sign-in link has been sent.';
    errEl.style.color = '#5A9E7A';
    setTimeout(function () { errEl.style.color = ''; errEl.textContent = ''; }, 2000);
  } else {
    errEl.textContent = (res && res.error) || "Couldn't resend. Try again.";
  }
}

// ──────────────────────────────────────────────────────────────────────
// 9. Wire submit + helper-button event listeners
// ──────────────────────────────────────────────────────────────────────

(function wireRemainingHandlers() {
  function on(id, ev, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }
  on('si-btn', 'click', doSignin);
  on('su-btn', 'click', doSignup);
  on('fp-btn', 'click', requestReset);
  on('fp-reset-btn', 'click', confirmReset);
  on('verify-btn', 'click', doVerifyEmail);
  on('resend-code-btn', 'click', resendVerificationCode);
  on('forgot-pw-btn', 'click', showForgotPassword);
  on('back-to-signin-btn', 'click', function () { setActiveForm('signin'); });
  // Magic-link flow buttons
  on('magic-link-btn', 'click', showMagicLinkRequest);
  on('ml-send-btn', 'click', requestMagicLink);
  on('ml-verify-btn', 'click', verifyMagicCodeFlow);
  on('ml-resend-btn', 'click', resendMagicLink);
  on('magic-back-btn', 'click', function () { setActiveForm('signin'); });

  on('si-email', 'keydown', function (e) { if (e.key === 'Enter') doSignin(); });
  on('si-password', 'keydown', function (e) { if (e.key === 'Enter') doSignin(); });
  on('fp-email', 'keydown', function (e) { if (e.key === 'Enter') requestReset(); });
  on('fp-code', 'keydown', function (e) { if (e.key === 'Enter') document.getElementById('fp-newpw').focus({ preventScroll: true }); });
  on('fp-newpw', 'keydown', function (e) { if (e.key === 'Enter') confirmReset(); });
  on('su-name', 'keydown', function (e) { if (e.key === 'Enter') document.getElementById('su-email').focus({ preventScroll: true }); });
  on('su-email', 'keydown', function (e) { if (e.key === 'Enter') document.getElementById('su-password').focus({ preventScroll: true }); });
  on('su-password', 'keydown', function (e) { if (e.key === 'Enter') doSignup(); });
  on('su-password', 'input', function () { updatePwStrength(this.value); });
  on('su-verify-code', 'keydown', function (e) { if (e.key === 'Enter') doVerifyEmail(); });
  on('ml-email', 'keydown', function (e) { if (e.key === 'Enter') requestMagicLink(); });
  on('ml-code', 'keydown', function (e) { if (e.key === 'Enter') verifyMagicCodeFlow(); });
  // Strip non-numeric input from the 6-digit code field as the user types.
  on('ml-code', 'input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });

  // ── Password show/hide toggles ──
  // Each .form-input-toggle has a data-toggle-pw attribute pointing to
  // the input it controls. Click flips the input's type between
  // 'password' and 'text' and updates the aria-pressed state and label.
  Array.prototype.forEach.call(document.querySelectorAll('.form-input-toggle'), function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-toggle-pw');
      const input = document.getElementById(id);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
      btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  // Pre-warm Turnstile after the user's first input focus. CRITICAL:
  // we DEFER the actual script load with requestIdleCallback (or a
  // 250ms setTimeout fallback). Loading + parsing the Turnstile script
  // synchronously inside the focus handler pinned the main thread for
  // ~1-3 seconds on mobile, which on iOS Safari delayed delivery of
  // the user's first keystrokes (iOS batches input events while the
  // main thread is busy). Deferring lets the focus complete, the
  // keyboard appear, and the user start typing before any third-party
  // script begins loading.
  let _tsPrewarmed = false;
  function prewarmTurnstile(e) {
    if (_tsPrewarmed) return;
    const target = e.target;
    if (!target) return;
    const tag = target.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;
    _tsPrewarmed = true;
    function go() { getTurnstileToken().catch(function () {}); }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(go, { timeout: 1500 });
    } else {
      setTimeout(go, 250);
    }
  }
  const box = document.querySelector('.login-box');
  if (box) box.addEventListener('focusin', prewarmTurnstile, { passive: true });
})();

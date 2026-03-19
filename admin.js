/**
 * admin.js — EquitySight Admin Dashboard Logic
 *
 * Loaded by admin.html. Requires role='admin' in the session — page redirects
 * unauthenticated or non-admin users on load.
 *
 * Tabs: Users | Config | Schemes | Stats | Tools
 *
 * Key functions:
 *   loadUsers()         — fetches all users via adminListUsers action
 *   renderUsers()       — builds the users table from allUsers[]
 *   filterUsers()       — filters/sorts allUsers[] and re-renders
 *   saveConfig()        — POSTs site config to adminSetConfig
 *   loadSchemes()       — fetches government grant schemes via adminGetSchemes
 *   saveSchemes()       — POSTs updated schemes to adminSetSchemes
 *   loadStats()         — fetches signup/login stats via adminGetStats
 *   callAuth(action)    — helper: POST to /.netlify/functions/auth with session token
 *
 * All backend calls go to /.netlify/functions/auth with { action, token, ...params }
 * Session token stored in localStorage 'propCalc_session_v1'.token
 */

const SESSION_KEY = 'propCalc_session_v1';
let adminSession = null;
let allUsers = [];
let resetTarget = null;
let _detailReturnEmail = null;
function _openFromDetail(email, fn){ _detailReturnEmail = email; fn(); }
function backToUserDetail(){ if(_detailReturnEmail) openUserDetails(_detailReturnEmail); }

function getSession(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e){ return null; }
}

async function callAuth(action, payload){
  const sess = getSession();
  const token = sess && sess.token;
  try {
    const r = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || '')
      },
      body: JSON.stringify(Object.assign({action}, payload || {}))
    });
    return r.json();
  } catch(e) {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
}

// ── Custom Dialog (replaces browser confirm/alert/prompt) ─────────────────
let _dialogResolveFn = null;

function _dialogResolve(val){
  const overlay = document.getElementById('custom-dialog-overlay');
  const input   = document.getElementById('custom-dialog-input');
  overlay.classList.remove('open');
  if(_dialogResolveFn){
    const fn = _dialogResolveFn;
    _dialogResolveFn = null;
    // For prompt-style: return input value if confirmed, null if cancelled
    if(input && input.style.display !== 'none' && val){
      fn(input.value || '');
    } else {
      fn(val);
    }
  }
}

function customConfirm(title, message, opts = {}){
  return new Promise(resolve => {
    _dialogResolveFn = resolve;
    const overlay   = document.getElementById('custom-dialog-overlay');
    const header    = document.getElementById('custom-dialog-header');
    const icon      = document.getElementById('custom-dialog-icon');
    const titleEl   = document.getElementById('custom-dialog-title');
    const msgEl     = document.getElementById('custom-dialog-message');
    const inputEl   = document.getElementById('custom-dialog-input');
    const cancelBtn = document.getElementById('custom-dialog-cancel');
    const confirmBtn= document.getElementById('custom-dialog-confirm');

    header.className = 'custom-dialog-header' + (opts.danger ? ' danger' : opts.warning ? ' warning' : '');
    icon.textContent   = opts.icon || (opts.danger ? '⚠️' : opts.warning ? '⚡' : 'ℹ️');
    titleEl.textContent = title;
    msgEl.innerHTML    = message;
    cancelBtn.style.display  = opts.alertOnly ? 'none' : '';
    confirmBtn.textContent   = opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm');
    confirmBtn.className     = opts.danger ? 'btn-admin' : 'btn-admin';
    confirmBtn.style.background = opts.danger ? 'var(--risk-red)' : '';
    confirmBtn.style.color      = opts.danger ? 'white' : '';
    inputEl.style.display = 'none';
    inputEl.value = '';
    overlay.classList.add('open');
    setTimeout(() => confirmBtn.focus(), 50);
  });
}

function customAlert(title, message, opts = {}){
  return customConfirm(title, message, { ...opts, alertOnly: true, confirmLabel: 'OK', icon: opts.icon || '✓' });
}

// Close dialog on overlay click
document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('custom-dialog-overlay').addEventListener('click', function(e){
    if(e.target === this) _dialogResolve(false);
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      var epOverlay = document.getElementById('email-preview-overlay');
      if(epOverlay && epOverlay.style.display === 'flex'){ closeEmailPreview(); return; }
      if(document.getElementById('stat-popup-overlay').classList.contains('open')){ closeStatPopup(); return; }
      if(document.getElementById('custom-dialog-overlay').classList.contains('open')){ _dialogResolve(false); }
    }
  });
});

async function init(){
  const sess = getSession();
  document.getElementById('loading-view').style.display = 'none';

  if(!sess || !(sess.id || sess.email)){
    showAccessDenied('Please sign in to access admin.');
    return;
  }

  // Verify token with backend to get current role
  let d = {};
  try { d = await callAuth('verify', {token: sess.token}); } catch(e){}

  const role = (d.ok ? d.role : sess.role) || 'user';

  if(role !== 'admin'){
    showAccessDenied('This page requires an admin account. Use the button below to claim admin (only works if no admin exists yet).');
    document.getElementById('bootstrap-btn').style.display = '';
    return;
  }

  adminSession = d.ok ? d : sess;
  document.getElementById('access-denied').style.display = 'none';
  document.getElementById('admin-layout').style.display = 'block';
  const email = (d.ok ? d.email : sess.email) || '';
  document.getElementById('self-admin-info').textContent = 'Logged in as: ' + email;

  loadUsers();
  loadStats(); // populate top stats row immediately
}

function showAccessDenied(msg){
  document.getElementById('access-denied').style.display = 'flex';
  document.getElementById('admin-layout').style.display = 'none';
  if(msg) document.getElementById('access-denied-msg').textContent = msg;
}

async function bootstrapAdmin(){
  const sess = getSession();
  if(!sess){ location.href='login.html'; return; }
  const st = document.getElementById('bootstrap-status');
  st.textContent = 'Claiming admin role…'; st.className = 'admin-status info';
  const d = await callAuth('setSelfAdmin');
  if(d.ok){
    // Update local session with new token and admin role
    const updated = Object.assign({}, sess, {token: d.token || sess.token, role: 'admin'});
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    st.textContent = '✓ Admin role granted! Reloading…'; st.className = 'admin-status ok';
    setTimeout(() => location.reload(), 1200);
  } else {
    st.textContent = '✗ ' + (d.error || 'Failed'); st.className = 'admin-status err';
  }
}

async function loadUsers(){
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--slate);padding:24px;font-style:italic;">Loading…</td></tr>';
  const d = await callAuth('adminListUsers');
  if(!d.ok){
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--risk-red);padding:24px;">'+escHtml(d.error||'Failed to load users')+'</td></tr>';
    return;
  }
  allUsers = (d.users || []).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  updateStats(allUsers);
  renderUsers(allUsers);
}

function updateStats(users){
  // Keep counts in sync when user list changes; sparklines come from loadStats()
  const nFree     = users.filter(u=>u.plan==='free'||!u.plan).length;
  const nPro      = users.filter(u=>u.plan==='pro').length;
  const nAdviser  = users.filter(u=>u.plan==='adviser').length;
  const nDiscount = users.filter(u=>u.stripeDiscountInfo && (u.plan==='pro'||u.plan==='adviser')).length;
  document.getElementById('stat-total').textContent   = users.length;
  document.getElementById('stat-free').textContent    = nFree;
  document.getElementById('stat-pro').textContent     = nPro;
  document.getElementById('stat-adviser').textContent = nAdviser;
  const discNote = document.getElementById('stat-discount-note');
  if(discNote){
    if(nDiscount > 0){
      discNote.textContent = `· ${nDiscount} discounted`;
      discNote.style.display = '';
    } else {
      discNote.style.display = 'none';
    }
  }
}

// ── 7-day SVG sparkline ──────────────────────────────────────────────────────
function renderSparkline(chartId, rawData, strokeColor, fillColor){
  const el = document.getElementById(chartId);
  if(!el) return;

  // Forward-fill nulls so gaps in history show flat lines
  let last = 0;
  const data = rawData.map(d => {
    const v = (d.value !== null && d.value !== undefined) ? d.value : last;
    last = v; return { date: d.date, value: v };
  });

  const vals   = data.map(d => d.value);
  const maxV   = Math.max(...vals, 1);
  const minV   = Math.min(...vals, 0);
  const range  = maxV - minV || 1;
  const W = 100, H = 36, n = data.length;

  const pts = data.map((d, i) => ({
    x: n > 1 ? (i / (n - 1)) * W : W / 2,
    y: H - ((d.value - minV) / range) * H,
  }));

  const poly  = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area  = `M ${pts[0].x.toFixed(1)},${H} ` +
                pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
                ` L ${pts[pts.length-1].x.toFixed(1)},${H} Z`;

  const first = vals[0], latest = vals[vals.length - 1];
  const delta = latest - first;
  const dStr  = (delta > 0 ? '+' : '') + delta;
  const dCol  = delta > 0 ? 'var(--reward-green)' : delta < 0 ? 'var(--risk-red)' : 'var(--slate)';

  // Short date labels (e.g. "28 Feb")
  const shortDate = s => { try { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}); } catch(e){ return s; } };

  const uid = chartId.replace(/[^a-z0-9]/gi,'');
  el.innerHTML = `
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" height="36">
      <defs>
        <linearGradient id="sg${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${fillColor||strokeColor}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${fillColor||strokeColor}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#sg${uid})"/>
      <polyline points="${poly}" fill="none" stroke="${strokeColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pts[pts.length-1].x.toFixed(1)}" cy="${pts[pts.length-1].y.toFixed(1)}" r="2.2" fill="${strokeColor}"/>
    </svg>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;">
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--slate);">${shortDate(data[0].date)} → ${shortDate(data[n-1].date)}</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:${dCol};">${dStr}</span>
    </div>`;
}

function filterUsers(){
  const search      = document.getElementById('user-search').value.toLowerCase();
  const plan        = document.getElementById('plan-filter').value;
  const loginFilter = (document.getElementById('login-filter') || {}).value || '';
  const sortMode    = (document.getElementById('sort-filter')  || {}).value || 'joined-desc';
  const now         = Date.now();
  const D30 = 30 * 24 * 3600 * 1000;
  const D7  =  7 * 24 * 3600 * 1000;

  let filtered = allUsers.filter(u => {
    const matchSearch = !search || (u.email||'').toLowerCase().includes(search) || (u.name||'').toLowerCase().includes(search);
    const matchPlan   = !plan || (u.plan||'free') === plan;
    let   matchLogin  = true;
    if(loginFilter === 'active-30') matchLogin = u.lastLoginAt && (now - u.lastLoginAt) < D30;
    if(loginFilter === 'active-7')  matchLogin = u.lastLoginAt && (now - u.lastLoginAt) < D7;
    if(loginFilter === 'never')     matchLogin = !u.lastLoginAt;
    return matchSearch && matchPlan && matchLogin;
  });

  // Sort
  filtered = filtered.slice().sort((a, b) => {
    if(sortMode === 'joined-desc')  return (b.createdAt||0)   - (a.createdAt||0);
    if(sortMode === 'joined-asc')   return (a.createdAt||0)   - (b.createdAt||0);
    if(sortMode === 'login-desc')   return (b.lastLoginAt||0) - (a.lastLoginAt||0);
    if(sortMode === 'login-asc')    return (a.lastLoginAt||0) - (b.lastLoginAt||0);
    return 0;
  });

  renderUsers(filtered);
}

// Cache for IP geolocation results to avoid duplicate lookups
var _ipGeoCache = {};

async function fetchIpGeo(ip){
  if(!ip || ip === '—') return null;
  if(_ipGeoCache[ip] !== undefined) return _ipGeoCache[ip];
  _ipGeoCache[ip] = null; // mark as in-flight

  // Try ipwho.is first — good IPv6 support, free, HTTPS
  try {
    const r = await fetch('https://ipwho.is/' + encodeURIComponent(ip), {signal: AbortSignal.timeout(5000)});
    if(r.ok){
      const d = await r.json();
      if(d.success !== false && (d.city || d.country)){
        const geo = { city: d.city||'', region: d.region_code||d.region||'', country: d.country||'', flag: d.country_code ? countryFlag(d.country_code) : '' };
        _ipGeoCache[ip] = geo;
        return geo;
      }
    }
  } catch(e){ /* fall through to backup */ }

  // Fallback: ipapi.co (may have rate limits, weaker IPv6 support)
  try {
    const r = await fetch('https://ipapi.co/' + encodeURIComponent(ip) + '/json/', {signal: AbortSignal.timeout(4000)});
    if(!r.ok) return (_ipGeoCache[ip] = null);
    const d = await r.json();
    if(d.error) return (_ipGeoCache[ip] = null);
    const geo = { city: d.city||'', region: d.region_code||'', country: d.country_name||'', flag: d.country_code ? countryFlag(d.country_code) : '' };
    _ipGeoCache[ip] = geo;
    return geo;
  } catch(e){ return (_ipGeoCache[ip] = null); }
}

function countryFlag(code){
  // Convert ISO 3166-1 alpha-2 country code to regional indicator emoji flag
  if(!code || code.length !== 2) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function renderUsers(users){
  const tbody = document.getElementById('users-tbody');
  if(!users.length){
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--slate);padding:24px;font-style:italic;">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => {
    const plan = u.plan || 'free';
    const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'}) : '—';
    const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-AU', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    const roleHtml = u.role === 'admin' ? '<span class="role-badge">admin</span>' : '<span style="font-size:11px;color:var(--slate);">user</span>';
    const roleAction = u.role !== 'admin' ? 'grant-admin' : 'revoke-admin';
    const roleLabel  = u.role !== 'admin' ? '→ Admin'      : 'Revoke Admin';
    return `<tr data-email="${escHtml(u.email)}" style="cursor:pointer;" title="Click to view user details">
      <td style="font-weight:500;">${escHtml(u.name||'—')}</td>
      <td><span class="user-email">${escHtml(u.email||'—')}</span></td>
      <td><span class="plan-badge plan-${escHtml(plan)}">${escHtml(plan)}</span>${u.stripeDiscountInfo?`<span title="${escHtml(u.stripeDiscountInfo.couponName||'Discounted')}" style="margin-left:4px;font-size:9px;font-family:var(--font-mono);background:rgba(201,168,76,0.15);color:#C9A84C;border:1px solid rgba(201,168,76,0.3);border-radius:3px;padding:1px 4px;letter-spacing:0.5px;">DISC</span>`:''}</td>
      <td style="font-family:var(--font-mono);font-size:11px;">${joined}</td>
      <td style="font-family:var(--font-mono);font-size:11px;">${lastLogin}</td>
      <td>${roleHtml}</td>
      <td>
        <div class="user-cog-wrap">
          <button class="user-cog-btn" data-cog-email="${escHtml(u.email)}" title="Actions" data-action="toggle-cog">⚙</button>
          <div class="user-cog-menu">
            <button class="cog-menu-item" data-action="reset-pw"     data-email="${escHtml(u.email)}">Reset Password</button>
            <button class="cog-menu-item" data-action="set-plan"     data-email="${escHtml(u.email)}" data-plan="${escHtml(plan)}">Change Plan</button>
            <button class="cog-menu-item" data-action="${roleAction}" data-email="${escHtml(u.email)}">${roleLabel}</button>
            <button class="cog-menu-item" data-action="view-history" data-userid="${escHtml(u.id)}" data-email="${escHtml(u.email)}">View History</button>
            <button class="cog-menu-item danger" data-action="delete-user" data-email="${escHtml(u.email)}">Delete</button>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

}

function toggleUserCog(e, btn){
  e.stopPropagation();
  const menu = btn.nextElementSibling;
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.user-cog-menu.open').forEach(m => m.classList.remove('open'));
  if(!isOpen){
    const rect = btn.getBoundingClientRect();
    // Estimate menu height (5 items ~38px each + padding)
    const estH = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    if(spaceBelow < estH && rect.top > estH){
      // Flip upward
      menu.style.top = '';
      menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      menu.style.bottom = '';
      menu.style.top = (rect.bottom + 4) + 'px';
    }
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    menu.classList.add('open');
  }
}

document.addEventListener('click', function(){
  document.querySelectorAll('.user-cog-menu.open').forEach(m => m.classList.remove('open'));
});

document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('users-tbody').addEventListener('click', function(e){
    const btn = e.target.closest('[data-action]');
    if(btn){
      // Close the cog menu
      document.querySelectorAll('.user-cog-menu.open').forEach(m => m.classList.remove('open'));
      // Action button clicked — handle action, don't open detail modal
      const action = btn.dataset.action;
      const email  = btn.dataset.email;
      if(action === 'reset-pw')    openResetPw(email);
      if(action === 'set-plan')    setPlan(email, btn.dataset.plan);
      if(action === 'grant-admin') setRole(email, 'admin');
      if(action === 'revoke-admin')setRole(email, 'user');
      if(action === 'delete-user') deleteUser(email);
      if(action === 'view-history') openUserHistory(btn.dataset.userid, email);
      return;
    }
    // Cog button — handled by onclick, stop propagation handled there
    if(e.target.closest('.user-cog-btn')) return;
    // Row click (not on a button) — open user detail modal
    const tr = e.target.closest('tr[data-email]');
    if(tr) openUserDetails(tr.dataset.email);
  });
});

function openResetPw(email){
  resetTarget = email;
  document.getElementById('reset-modal-desc').textContent = 'Set a new password for: ' + email;
  document.getElementById('reset-new-pw').value = '';
  document.getElementById('reset-modal-status').className = 'admin-status';
  document.getElementById('reset-back-btn').style.display = _detailReturnEmail ? '' : 'none';
  document.getElementById('reset-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('reset-new-pw').focus(), 100);
}
function closeResetModal(){
  document.getElementById('reset-modal-overlay').classList.remove('open');
  resetTarget = null;
}
async function confirmResetPw(){
  const pw = document.getElementById('reset-new-pw').value.trim();
  const st = document.getElementById('reset-modal-status');
  if(!pw || pw.length < 8){ st.textContent='Password must be at least 8 characters'; st.className='admin-status err'; return; }
  st.textContent='Updating…'; st.className='admin-status info';
  const d = await callAuth('adminResetPassword', {targetEmail: resetTarget, newPassword: pw});
  if(d.ok){ st.textContent='✓ Password updated'; st.className='admin-status ok'; setTimeout(closeResetModal, 1500); }
  else { st.textContent='✗ ' + (d.error||'Failed'); st.className='admin-status err'; }
}

let planTarget = null;
function openPlanModal(email, currentPlan){
  planTarget = email;
  document.getElementById('plan-modal-desc').textContent = 'Change plan for: ' + email;
  document.getElementById('plan-modal-current').textContent = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
  document.getElementById('plan-modal-select').value = currentPlan;
  document.getElementById('plan-modal-status').className = 'admin-status';
  document.getElementById('plan-back-btn').style.display = _detailReturnEmail ? '' : 'none';
  document.getElementById('plan-modal-overlay').classList.add('open');
}
function closePlanModal(){
  document.getElementById('plan-modal-overlay').classList.remove('open');
  planTarget = null;
}
async function confirmPlanChange(){
  const plan = document.getElementById('plan-modal-select').value;
  const st = document.getElementById('plan-modal-status');
  st.textContent = 'Updating…'; st.className = 'admin-status info';
  const d = await callAuth('adminSetPlan', {targetEmail: planTarget, plan});
  if(d.ok){
    st.textContent = '✓ Plan updated to ' + plan; st.className = 'admin-status ok';
    setTimeout(() => { closePlanModal(); loadUsers(); }, 1200);
  } else {
    st.textContent = '✗ ' + (d.error||'Failed'); st.className = 'admin-status err';
  }
}
async function setPlan(email, currentPlan){
  openPlanModal(email, currentPlan);
}

async function setRole(email, role){
  const title = role === 'admin' ? 'Grant Admin Access' : 'Revoke Admin Access';
  const msg   = role === 'admin'
    ? `Grant admin access to <strong>${escHtml(email)}</strong>? They will be able to manage all users and settings.`
    : `Revoke admin access from <strong>${escHtml(email)}</strong>?`;
  const ok = await customConfirm(title, msg, { warning: role === 'admin', danger: role !== 'admin' });
  if(!ok) return;
  const st = document.getElementById('users-status');
  st.textContent = 'Updating role…'; st.className = 'admin-status info';
  const d = await callAuth('adminSetRole', {targetEmail: email, role});
  if(d.ok){ st.textContent = '✓ Role updated'; st.className = 'admin-status ok'; loadUsers(); }
  else { st.textContent = '✗ ' + (d.error||'Failed'); st.className = 'admin-status err'; }
}

async function deleteUser(email){
  const confirmed = await customConfirm(
    'Delete Account',
    `Permanently delete the account for <strong>${escHtml(email)}</strong>?<br><br>This will remove all their data including saved scenarios and profile. This cannot be undone.`,
    { danger: true, confirmLabel: 'Delete Account' }
  );
  if(!confirmed) return;
  const st = document.getElementById('users-status');
  st.textContent = 'Deleting…'; st.className = 'admin-status info';
  const d = await callAuth('adminDeleteUser', {targetEmail: email});
  if(d.ok){ st.textContent = '✓ User deleted'; st.className = 'admin-status ok'; loadUsers(); }
  else { st.textContent = '✗ ' + (d.error||'Failed'); st.className = 'admin-status err'; }
}

async function openUserDetails(email){
  _detailReturnEmail = null;
  const overlay = document.getElementById('user-detail-overlay');
  const body    = document.getElementById('user-detail-body');
  document.getElementById('user-detail-title').textContent = email;
  body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--slate);font-style:italic;">Loading user details…</div>';
  overlay.classList.add('open');

  const d = await callAuth('adminGetUserDetails', {targetEmail: email});
  if(!d.ok){
    body.innerHTML = `<div style="color:var(--risk-red);padding:16px;">${escHtml(d.error||'Failed to load user details')}</div>`;
    return;
  }
  const u = d.user || {};
  const profile = d.profile || {};

  const fmt = ts => ts ? new Date(ts).toLocaleString('en-AU', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Never';
  const ip = u.lastLoginIp || '';
  const ipHtml = ip
    ? `<a href="https://ipinfo.io/${encodeURIComponent(ip)}" target="_blank" rel="noopener" style="color:var(--sky);font-family:var(--font-mono);font-size:12px;">${escHtml(ip)} ↗</a>`
    : '<span style="color:var(--slate);">Not recorded</span>';

  // Fetch geolocation for the IP address
  let geoHtml = ip ? '<span style="color:var(--slate);font-size:11px;">Looking up location…</span>' : '<span style="color:var(--slate);">—</span>';

  // Pre-compute action buttons (Task 7)
  const _udEmail = u.email || '';
  const _udPlan  = u.plan  || 'free';
  const _udId    = u.id    || '';
  const _udRoleBtn = u.role === 'admin'
    ? `<button class="btn-admin" data-udaction="revoke-admin" data-email="${escHtml(_udEmail)}">Revoke Admin</button>`
    : `<button class="btn-admin" data-udaction="grant-admin" data-email="${escHtml(_udEmail)}">Grant Admin</button>`;

  const _udActionsHtml = `<div style="padding:14px 0 4px;border-top:1px solid rgba(28,28,30,0.08);display:flex;flex-wrap:wrap;gap:8px;">
    <button class="btn-admin" data-udaction="reset-pw" data-email="${escHtml(_udEmail)}">Reset Password</button>
    <button class="btn-admin" data-udaction="change-plan" data-email="${escHtml(_udEmail)}" data-plan="${escHtml(_udPlan)}">Change Plan</button>
    ${_udRoleBtn}
    <button class="btn-admin" data-udaction="view-history" data-userid="${escHtml(_udId)}" data-email="${escHtml(_udEmail)}">View History</button>
    <button class="btn-admin" style="color:var(--risk-red);border-color:rgba(196,90,90,0.4);" data-udaction="delete-user" data-email="${escHtml(_udEmail)}">Delete User</button>
  </div>`;

  // Pre-compute user errors section (Task 5)
  const _udUserErrs = (_allClientErrors || []).filter(e => (e.userEmail || '').toLowerCase() === _udEmail.toLowerCase());
  let _udErrRows = '';
  if (!_allClientErrors || !_allClientErrors.length) {
    _udErrRows = '<div style="font-size:12px;color:var(--slate);padding:6px 0;">Load the Error Log tab first to populate errors.</div>';
  } else if (!_udUserErrs.length) {
    _udErrRows = '<div style="font-size:12px;color:var(--slate);padding:6px 0;">No errors logged for this user.</div>';
  } else {
    _udErrRows = _udUserErrs.slice(0, 10).map(e => {
      const t = e.at ? new Date(e.at).toLocaleString('en-AU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
      return `<div style="padding:8px;background:rgba(28,28,30,0.04);border-radius:4px;margin-bottom:6px;">
        <div style="font-size:12px;font-weight:600;color:var(--charcoal);">${escHtml(e.message||'')}</div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate);margin-top:3px;">${t}</div>
      </div>`;
    }).join('');
  }
  const _udErrorsHtml = `<details style="margin-top:14px;border-top:1px solid rgba(28,28,30,0.08);padding-top:12px;">
    <summary style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);cursor:pointer;user-select:none;">Recent Errors (${_udUserErrs.length})</summary>
    <div style="margin-top:10px;">${_udErrRows}</div>
  </details>`;

  // Pre-compute discount display HTML (Task 6)
  let _udDiscountHtml = '';
  if (u.stripeDiscountInfo) {
    const di = u.stripeDiscountInfo;
    const discLabel = di.percentOff
      ? `${di.percentOff}% off`
      : (di.amountOffCents ? `${(di.amountOffCents/100).toFixed(2)} off` : 'discounted');
    const effectiveLabel = di.effectiveAmountCents != null
      ? ` → $${(di.effectiveAmountCents/100).toFixed(2)}/${di.currency||'mo'}`
      : '';
    const appliedDate = di.appliedAt ? new Date(di.appliedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : '';
    _udDiscountHtml = `<span style="margin-left:6px;font-size:10px;font-family:var(--font-mono);background:rgba(201,168,76,0.12);color:#C9A84C;border:1px solid rgba(201,168,76,0.3);border-radius:3px;padding:2px 6px;">${escHtml(di.couponName||'Coupon')}: ${escHtml(discLabel)}${escHtml(effectiveLabel)}</span>${appliedDate?`<div style="font-size:10px;color:var(--slate);margin-top:3px;">Applied ${escHtml(appliedDate)}</div>`:''}`;
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;padding:8px 0 16px;">
      <div>
        <div class="config-label">Full Name</div>
        <div style="font-size:14px;margin-top:3px;">${escHtml(u.name||'—')}</div>
      </div>
      <div>
        <div class="config-label">Email</div>
        <div style="font-size:13px;font-family:var(--font-mono);margin-top:3px;word-break:break-all;">${escHtml(u.email||'—')}</div>
      </div>
      <div>
        <div class="config-label">Plan</div>
        <div style="margin-top:4px;"><span class="plan-badge plan-${escHtml(u.plan||'free')}">${escHtml(u.plan||'free')}</span>${_udDiscountHtml}</div>
      </div>
      <div>
        <div class="config-label">Role</div>
        <div style="margin-top:4px;">${u.role==='admin'?'<span class="role-badge">admin</span>':'<span style="color:var(--slate);font-size:13px;">user</span>'}</div>
      </div>
      <div>
        <div class="config-label">Login Status</div>
        <div style="margin-top:4px;"><span style="font-size:12px;padding:4px 8px;border-radius:3px;background:${u.emailVerified&&u.lastLoginAt?'rgba(90,158,111,0.15);color:#5A9E6F':u.emailVerified?'rgba(201,168,76,0.15);color:#C9A84C':u.emailVerificationCodeHash?'rgba(91,143,171,0.15);color:#5B8FAB':'rgba(107,127,128,0.15);color:#6B7F80'};font-weight:500;">${u.emailVerified&&u.lastLoginAt?'✓ Active':u.emailVerified?'✓ Email Verified':'⏳ Awaiting Verification'}</span></div>
      </div>
      <div>
        <div class="config-label">Date Joined</div>
        <div style="font-family:var(--font-mono);font-size:12px;margin-top:3px;">${fmt(u.createdAt)}</div>
      </div>
      <div>
        <div class="config-label">Last Login</div>
        <div style="font-family:var(--font-mono);font-size:12px;margin-top:3px;">${fmt(u.lastLoginAt)}</div>
      </div>
      <div>
        <div class="config-label">Total Logins</div>
        <div style="font-family:var(--font-mono);font-size:26px;font-weight:500;margin-top:2px;">${u.loginCount||0}</div>
      </div>
      <div>
        <div class="config-label">Active Login Tokens</div>
        <div style="font-family:var(--font-mono);font-size:26px;font-weight:500;margin-top:2px;">${d.activeTokens||0}
          <span style="font-size:11px;font-weight:400;color:var(--slate);">device(s)</span>
        </div>
      </div>
      <div>
        <div class="config-label">Saved Scenarios</div>
        <div style="font-family:var(--font-mono);font-size:26px;font-weight:500;margin-top:2px;">${d.scenarioCount||0}</div>
      </div>
      <div>
        <div class="config-label">Last Login IP</div>
        <div style="margin-top:4px;">${ipHtml}</div>
      </div>
      <div>
        <div class="config-label">Est. Login Location</div>
        <div style="margin-top:4px;" id="user-detail-geo">${geoHtml}</div>
      </div>
      ${profile.color ? `<div>
        <div class="config-label">Profile Colour</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <div style="width:22px;height:22px;border-radius:50%;background:${escHtml(profile.color)};border:1px solid rgba(0,0,0,0.12);flex-shrink:0;"></div>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--slate);">${escHtml(profile.color)}</span>
        </div>
      </div>` : ''}
      ${safePhotoSrc(profile.photo) ? `<div>
        <div class="config-label">Avatar</div>
        <img src="${safePhotoSrc(profile.photo)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;margin-top:4px;border:2px solid rgba(28,28,30,0.1);">
      </div>` : ''}
    </div>
    <div style="padding:12px 0;border-top:1px solid rgba(28,28,30,0.08);font-size:11px;color:var(--slate);font-family:var(--font-mono);">
      User ID: ${escHtml(u.id||'—')}
    </div>
    ${_udActionsHtml}
    ${_udErrorsHtml}
  `;

  // Wire user detail action buttons (inline handlers removed for CSP compliance)
  body.addEventListener('click', function _udHandler(e){
    var btn = e.target.closest('[data-udaction]');
    if(!btn) return;
    var action = btn.dataset.udaction;
    var email  = btn.dataset.email || '';
    var plan   = btn.dataset.plan  || 'free';
    var userid = btn.dataset.userid || '';
    if(action === 'reset-pw')    { _openFromDetail(email, ()=>openResetPw(email)); }
    else if(action === 'change-plan')   { _openFromDetail(email, ()=>setPlan(email, plan)); }
    else if(action === 'revoke-admin')  { document.getElementById('user-detail-overlay').classList.remove('open'); setRole(email,'user'); }
    else if(action === 'grant-admin')   { document.getElementById('user-detail-overlay').classList.remove('open'); setRole(email,'admin'); }
    else if(action === 'view-history')  { _openFromDetail(email, ()=>openUserHistory(userid, email)); }
    else if(action === 'delete-user')   { document.getElementById('user-detail-overlay').classList.remove('open'); deleteUser(email); }
    // Remove this one-shot listener after use (re-added each time panel opens)
    body.removeEventListener('click', _udHandler);
  });

  // Asynchronously populate geolocation for this IP
  if(ip){
    fetchIpGeo(ip).then(geo => {
      const el = document.getElementById('user-detail-geo');
      if(!el) return;
      if(geo && (geo.city || geo.country)){
        const label = [geo.flag, geo.city, geo.region, geo.country].filter(Boolean).join(' ');
        const mapsUrl = 'https://www.google.com/maps/search/' + encodeURIComponent([geo.city, geo.country].filter(Boolean).join(', '));
        el.innerHTML = `<span style="font-size:13px;">${escHtml(label)}</span> <a href="${escHtml(mapsUrl)}" target="_blank" rel="noopener" style="color:var(--sky);font-size:11px;font-family:var(--font-mono);">map ↗</a>`;
      } else {
        el.innerHTML = '<span style="color:var(--slate);font-size:11px;">Location unavailable</span>';
      }
    });
  }
}

function showAdminTab(tab, btn){
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  btn.classList.add('active');
  // Scroll tab button into view horizontally (inline only) without affecting vertical scroll
  setTimeout(function(){
    const savedY = window.scrollY;
    btn.scrollIntoView({behavior:'instant', block:'nearest', inline:'center'});
    window.scrollTo({ top: savedY, behavior: 'instant' });
  }, 30);
}

function getV(id, fallback){ const el=document.getElementById(id); return el?(el.type==='checkbox'?el.checked:el.value):fallback; }
function setV(id, val){ const el=document.getElementById(id); if(!el) return; if(el.type==='checkbox') el.checked=!!val; else el.value=val??''; }

async function loadConfig(){
  const st = document.getElementById('config-status');
  st.textContent = 'Loading configuration…'; st.className = 'admin-status info';
  const d = await callAuth('adminGetConfig');
  let c = {};
  if(d.ok){
    c = d.config || {};
    // Cache locally for app-side use
    try { localStorage.setItem('propCalc_siteConfig_v1', JSON.stringify(c)); } catch(e){}
  } else {
    // Fall back to locally cached config
    try { c = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1') || '{}'); } catch(e){ c = {}; }
    if(Object.keys(c).length){
      st.textContent = 'Using locally cached config (API unavailable)'; st.className = 'admin-status info';
    } else {
      st.textContent = '✗ ' + (d.error||'Failed to load config'); st.className = 'admin-status err'; return;
    }
  }
  setV('cfg-site-name',       c.siteName       || 'EquitySight.app');
  setV('cfg-site-tagline',    c.siteTagline    || '');
  setV('cfg-logo-mark',       c.logoMark       || '🏠');
  setV('cfg-logo-name',       c.logoName       || 'EquitySight');
  setV('cfg-logo-tld',        c.logoTld        !== undefined ? c.logoTld : '.app');
  setV('cfg-brand-color',     c.brandColor     || '#C9A84C');
  setV('cfg-brand-color-hex', c.brandColor     || '#C9A84C');
  setV('cfg-color-theme',     c.colorTheme     || '');
  if(c.colorTheme && BRAND_THEMES[c.colorTheme]) {
    selectTheme(c.colorTheme);
  } else {
    // Just highlight swatches without re-applying colors (color picker already set above)
    document.querySelectorAll('.brand-theme-swatch').forEach(function(el) {
      el.classList.remove('active');
    });
  }
  var bpMark = document.getElementById('brand-preview-mark');
  var bpName = document.getElementById('brand-preview-name');
  var bpTld  = document.getElementById('brand-preview-tld');
  if(bpMark) bpMark.textContent = c.logoMark || '🏠';
  if(bpName) bpName.textContent = c.logoName || 'EquitySight';
  if(bpTld)  bpTld.textContent  = c.logoTld  !== undefined ? c.logoTld : '.app';
  if(c.brandColor) applyBrandColor(c.brandColor);
  // Logo image
  _logoImageData = c.logoImage || null;
  if(c.logoImage){
    _applyLogoImagePreview(c.logoImage);
  } else {
    var emojiEl2 = document.getElementById('logo-img-emoji');
    var imgEl2   = document.getElementById('logo-img-preview');
    var clrBtn2  = document.getElementById('logo-img-clear-btn');
    if(emojiEl2) { emojiEl2.textContent = c.logoMark || '🏠'; emojiEl2.style.display = ''; }
    if(imgEl2)   { imgEl2.src = ''; imgEl2.style.display = 'none'; }
    if(clrBtn2)  clrBtn2.style.display = 'none';
  }
  setV('cfg-support-email',   c.supportEmail   || 'support@equitysight.app');
  setV('cfg-site-url',        c.siteUrl        || '');
  setV('cfg-discord',         c.contactDiscord || '');
  setV('cfg-twitter',         c.contactTwitter || '');
  setV('cfg-banner',          c.bannerText     || '');
  setV('cfg-banner-type',     c.bannerType     || 'info');
  setV('cfg-banner-expiry',   c.bannerExpiry   || '');
  setV('cfg-maintenance',     c.maintenanceMode|| false);
  setV('cfg-maintenance-msg', c.maintenanceMessage||'');
  setV('cfg-allow-signups',   c.allowSignups!==false);
  setV('cfg-guest-access',    c.enableGuestAccess!==false);
  setV('cfg-min-pw',          c.minPasswordLength||8);
  setV('cfg-email-domain',    c.requireEmailDomain||'');
  setV('cfg-enable-pdf',      c.enablePdfExport!==false);
  setV('cfg-enable-proj',     c.enableProjections!==false);
  setV('cfg-enable-referral', c.referralEnabled||false);
  setV('cfg-referral-bonus',  c.referralBonus||30);
  setV('cfg-max-upload',      c.maxUploadMb||5);
  setV('cfg-session-ttl',     c.sessionTtlDays||30);
  setV('cfg-free-limit',      c.freeScenarioLimit||1);
  setV('cfg-pro-limit',       c.proScenarioLimit!=null?c.proScenarioLimit:-1);
  setV('cfg-pro-monthly',     c.proMonthlyPrice||9);
  setV('cfg-pro-annual',      c.proAnnualPrice||86);
  setV('cfg-adviser-monthly', c.adviserMonthlyPrice||29);
  setV('stripe-pub-key',      c.stripePubKey||'');
  setV('stripe-pro-monthly',  c.stripeProMonthly||'');
  setV('stripe-pro-annual',   c.stripeProAnnual||'');
  setV('stripe-portal',       c.stripePortal||'');
  st.textContent = ''; st.className = 'admin-status';
  updateBannerPreview();
  // NOTE: stats are NOT auto-refreshed here — use the Refresh Stats button
}

// ── Logo image upload helpers ──────────────────────────────────────────────
var _logoImageData = null;

function handleLogoImageUpload(input){
  var file = input.files[0];
  if(!file) return;
  if(file.size > 200 * 1024){
    customAlert('Image too large', 'Please choose an image smaller than 200 KB.', {icon:'⚠'});
    input.value = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e){
    _logoImageData = e.target.result;
    _applyLogoImagePreview(_logoImageData);
  };
  reader.readAsDataURL(file);
}

function clearLogoImage(){
  _logoImageData = null;
  var inp  = document.getElementById('logo-img-input');
  var imgEl = document.getElementById('logo-img-preview');
  var emojiEl = document.getElementById('logo-img-emoji');
  var clearBtn = document.getElementById('logo-img-clear-btn');
  var previewMark = document.getElementById('brand-preview-mark');
  if(inp) inp.value = '';
  if(imgEl)  { imgEl.src = ''; imgEl.style.display = 'none'; }
  if(emojiEl) emojiEl.style.display = '';
  if(clearBtn) clearBtn.style.display = 'none';
  if(previewMark) previewMark.textContent = getV('cfg-logo-mark','') || '🏠';
}

function _applyLogoImagePreview(dataUri){
  var imgEl = document.getElementById('logo-img-preview');
  var emojiEl = document.getElementById('logo-img-emoji');
  var clearBtn = document.getElementById('logo-img-clear-btn');
  var previewMark = document.getElementById('brand-preview-mark');
  if(imgEl)  { imgEl.src = dataUri; imgEl.style.display = 'block'; }
  if(emojiEl) emojiEl.style.display = 'none';
  if(clearBtn) clearBtn.style.display = '';
  if(previewMark) previewMark.innerHTML = '<img src="'+dataUri+'" style="width:100%;height:100%;object-fit:contain;" alt="">';
}

function updateLogoEmojiPreview(val){
  var emojiEl = document.getElementById('logo-img-emoji');
  if(emojiEl) emojiEl.textContent = val || '🏠';
  if(!_logoImageData){
    var previewMark = document.getElementById('brand-preview-mark');
    if(previewMark) previewMark.textContent = val || '🏠';
  }
}
// ── Colour theme presets ───────────────────────────────────────────────────
var BRAND_THEMES = {
  gold:       { label: 'Classic Gold',    accent: '#C9A84C', accentLight: '#E8D080', dark: '#1C1C1E', darkSoft: '#2C2C2E' },
  navy:       { label: 'Deep Navy',       accent: '#4B88C8', accentLight: '#8AB8DC', dark: '#0D1B2A', darkSoft: '#162840' },
  forest:     { label: 'Forest Green',    accent: '#5A9E6F', accentLight: '#8DC4A0', dark: '#0F2318', darkSoft: '#1A3D28' },
  terracotta: { label: 'Terracotta',      accent: '#C4714A', accentLight: '#E0A880', dark: '#2B1407', darkSoft: '#4A2510' },
  indigo:     { label: 'Midnight Indigo', accent: '#7B6FD0', accentLight: '#A89EE0', dark: '#12102A', darkSoft: '#1E1B45' },
  slate:      { label: 'Cool Slate',      accent: '#6B8FAF', accentLight: '#9AB5CC', dark: '#14202E', darkSoft: '#1E3045' }
};

function selectTheme(key) {
  var theme = BRAND_THEMES[key];
  var themeInput = document.getElementById('cfg-color-theme');
  if(themeInput) themeInput.value = key || '';
  document.querySelectorAll('.brand-theme-swatch').forEach(function(el) {
    el.classList.toggle('active', el.dataset.theme === key);
  });
  if(!theme) return;
  var pickerEl = document.getElementById('cfg-brand-color');
  var hexEl    = document.getElementById('cfg-brand-color-hex');
  if(pickerEl) pickerEl.value = theme.accent;
  if(hexEl)    hexEl.value    = theme.accent;
  document.documentElement.style.setProperty('--gold',          theme.accent);
  document.documentElement.style.setProperty('--gold-light',    theme.accentLight);
  document.documentElement.style.setProperty('--charcoal',      theme.dark);
  document.documentElement.style.setProperty('--charcoal-soft', theme.darkSoft);
}

// ── Brand colour helpers ───────────────────────────────────────────────────
function applyBrandColor(hex){
  if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  document.documentElement.style.setProperty('--gold', hex);
}
function syncBrandColor(hex){
  // Called from color picker — deselects any preset theme
  var textEl = document.getElementById('cfg-brand-color-hex');
  if(textEl) textEl.value = hex;
  applyBrandColor(hex);
  selectTheme('');
}
function syncBrandColorHex(val){
  // Called from text input — deselects any preset theme
  if(/^#[0-9a-fA-F]{6}$/.test(val)){
    var pickerEl = document.getElementById('cfg-brand-color');
    if(pickerEl) pickerEl.value = val;
    applyBrandColor(val);
    selectTheme('');
  }
}

function updateBannerPreview(){
  const text = getV('cfg-banner','');
  const type = getV('cfg-banner-type','info');
  const prev = document.getElementById('cfg-banner-preview');
  if(!prev) return;
  if(!text){ prev.style.display='none'; return; }
  const colors = {info:'rgba(91,143,171,0.12)',success:'rgba(90,158,123,0.12)',warning:'rgba(201,168,76,0.12)',danger:'rgba(196,90,90,0.1)'};
  const textColors = {info:'var(--sky)',success:'var(--reward-green)',warning:'#9A7A2A',danger:'var(--risk-red)'};
  prev.style.display='block';
  prev.style.background=colors[type]||colors.info;
  prev.style.color=textColors[type]||textColors.info;
  prev.style.border='1px solid currentColor';
  prev.textContent='Preview: ' + text;
}
document.addEventListener('change', function(e){ if(e.target.id==='cfg-banner'||e.target.id==='cfg-banner-type') updateBannerPreview(); });
document.addEventListener('input',  function(e){ if(e.target.id==='cfg-banner') updateBannerPreview(); });

async function saveConfig(){
  const st  = document.getElementById('config-status');
  const stB = document.getElementById('branding-status');
  function setStatus(msg, cls) {
    if(st)  { st.textContent  = msg; st.className  = 'admin-status ' + cls; }
    if(stB) { stB.textContent = msg; stB.className = 'admin-status ' + cls; }
  }
  setStatus('Saving…', 'info');
  const config = {
    siteName:            getV('cfg-site-name',''),
    siteTagline:         getV('cfg-site-tagline',''),
    logoImage:           _logoImageData || '',
    logoMark:            getV('cfg-logo-mark','🏠'),
    logoName:            getV('cfg-logo-name','EquitySight'),
    logoTld:             getV('cfg-logo-tld','.app'),
    brandColor:          getV('cfg-brand-color','#C9A84C'),
    colorTheme:          getV('cfg-color-theme',''),
    supportEmail:        getV('cfg-support-email',''),
    siteUrl:             getV('cfg-site-url',''),
    contactDiscord:      getV('cfg-discord',''),
    contactTwitter:      getV('cfg-twitter',''),
    bannerText:          getV('cfg-banner',''),
    bannerType:          getV('cfg-banner-type','info'),
    bannerExpiry:        getV('cfg-banner-expiry',''),
    maintenanceMode:     getV('cfg-maintenance',false),
    maintenanceMessage:  getV('cfg-maintenance-msg',''),
    allowSignups:        getV('cfg-allow-signups',true),
    enableGuestAccess:   getV('cfg-guest-access',true),
    minPasswordLength:   parseInt(getV('cfg-min-pw','8'))||8,
    requireEmailDomain:  getV('cfg-email-domain',''),
    enablePdfExport:     getV('cfg-enable-pdf',true),
    enableProjections:   getV('cfg-enable-proj',true),
    referralEnabled:     getV('cfg-enable-referral',false),
    referralBonus:       parseInt(getV('cfg-referral-bonus','30'))||30,
    maxUploadMb:         parseInt(getV('cfg-max-upload','5'))||5,
    sessionTtlDays:      parseInt(getV('cfg-session-ttl','30'))||30,
    freeScenarioLimit:   parseInt(getV('cfg-free-limit','1'))||1,
    proScenarioLimit:    parseInt(getV('cfg-pro-limit','-1')),
    proMonthlyPrice:     parseFloat(getV('cfg-pro-monthly','9'))||9,
    proAnnualPrice:      parseFloat(getV('cfg-pro-annual','86'))||86,
    adviserMonthlyPrice: parseFloat(getV('cfg-adviser-monthly','29'))||29,
    stripePubKey:        getV('stripe-pub-key',''),
    stripeProMonthly:    getV('stripe-pro-monthly',''),
    stripeProAnnual:     getV('stripe-pro-annual',''),
    stripePortal:        getV('stripe-portal',''),
  };
  const d = await callAuth('adminSetConfig', {config});
  if(d.ok){
    // Also cache config locally so the app can apply settings without an API call
    try { localStorage.setItem('propCalc_siteConfig_v1', JSON.stringify(config)); } catch(e){}
    setStatus('✓ Configuration saved', 'ok');
    setTimeout(()=>{ setStatus('', ''); }, 3000);
  } else {
    // If API fails, still save locally so frontend settings are applied
    try { localStorage.setItem('propCalc_siteConfig_v1', JSON.stringify(config)); } catch(e){}
    setStatus('✓ Saved locally (API: ' + (d.error||'check backend') + ')', 'ok');
    setTimeout(()=>{ setStatus('', ''); }, 4000);
  }
}

function exportConfigJson(){
  const fields = ['cfg-site-name','cfg-site-tagline','cfg-support-email','cfg-site-url'];
  const config = {};
  document.querySelectorAll('[id^="cfg-"],[id^="stripe-"]').forEach(el=>{
    if(el.id) config[el.id] = el.type==='checkbox'?el.checked:el.value;
  });
  const blob = new Blob([JSON.stringify(config, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'equitysight-config-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
}

async function refreshStats(){
  const btn = document.getElementById('stats-refresh-btn');
  if(btn){ btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
  await loadStats();
  if(btn){ btn.disabled = false; btn.textContent = '↻ Refresh Stats'; }
}

async function loadStats(){
  // Show loading state immediately
  const spinner = '<div class="stat-spinner"></div>';
  const chartLoad = '<div class="stat-chart-loading"></div>';
  const statIds = ['stat-total','stat-free','stat-pro','stat-adviser','stat-sessions','stat-scenarios-top','stat-new-users','stat-revenue','stat-avg-scenarios'];
  const chartIds = ['stat-chart-total','stat-chart-free','stat-chart-pro','stat-chart-adviser','stat-chart-sessions','stat-chart-scenarios','stat-chart-new-users','stat-chart-revenue','stat-chart-avg'];
  statIds.forEach(id => { const e=document.getElementById(id); if(e) e.innerHTML=spinner; });
  chartIds.forEach(id => { const e=document.getElementById(id); if(e) e.innerHTML=chartLoad; });

  const d = await callAuth('adminGetStats');
  if(!d.ok){
    statIds.forEach(id => { const e=document.getElementById(id); if(e) e.textContent='—'; });
    chartIds.forEach(id => { const e=document.getElementById(id); if(e) e.innerHTML=''; });
    return;
  }
  const s = d.stats || {};
  const history = d.history || [];
  _statPopupAllHistory = history; // store for popup use
  const el = id => document.getElementById(id);

  // Update all stat card values from authoritative backend data
  if(el('stat-total'))         el('stat-total').textContent         = s.totalUsers         ?? '—';
  if(el('stat-free'))          el('stat-free').textContent          = s.freeUsers          ?? '—';
  if(el('stat-pro'))           el('stat-pro').textContent           = s.proUsers           ?? '—';
  if(el('stat-adviser'))       el('stat-adviser').textContent       = s.adviserUsers       ?? '—';
  if(el('stat-sessions'))      el('stat-sessions').textContent      = s.activeSessions     ?? '—';
  if(el('stat-scenarios-top')) el('stat-scenarios-top').textContent = s.totalScenarioLists ?? '—';
  if(el('stat-new-users'))     el('stat-new-users').textContent     = s.newUsersLast7      ?? '—';
  if(el('stat-revenue'))       el('stat-revenue').textContent       = s.revenueEstimate !== undefined ? '$' + s.revenueEstimate : '—';
  if(el('stat-avg-scenarios')) el('stat-avg-scenarios').textContent = s.avgScenariosPerUser ?? '—';

  // Render 7-day sparklines for every stat card
  const mk = (key) => history.map(h => ({ date: h.date, value: h[key] }));
  renderSparkline('stat-chart-total',     mk('totalUsers'),         'rgba(74,74,82,0.9)',        'rgba(74,74,82,0.5)');
  renderSparkline('stat-chart-free',      mk('freeUsers'),          'rgba(100,100,110,0.8)',     'rgba(100,100,110,0.4)');
  renderSparkline('stat-chart-pro',       mk('proUsers'),           'rgba(180,140,50,0.9)',      'rgba(201,168,76,0.5)');
  renderSparkline('stat-chart-adviser',   mk('adviserUsers'),       'rgba(60,120,165,0.9)',      'rgba(91,143,171,0.5)');
  renderSparkline('stat-chart-sessions',  mk('activeSessions'),     'rgba(91,143,171,0.85)',     'rgba(91,143,171,0.4)');
  renderSparkline('stat-chart-scenarios', mk('totalScenarioLists'), 'rgba(70,140,110,0.85)',     'rgba(90,158,123,0.4)');
  renderSparkline('stat-chart-new-users', mk('newUsersLast7'),      'rgba(90,158,123,0.9)',      'rgba(90,158,123,0.5)');
  renderSparkline('stat-chart-revenue',   mk('revenueEstimate'),    'rgba(201,168,76,0.9)',      'rgba(201,168,76,0.5)');
  renderSparkline('stat-chart-avg',       mk('avgScenariosPerUser'),'rgba(150,100,180,0.8)',     'rgba(150,100,180,0.4)');
}

function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function safePhotoSrc(url){
  if(!url) return '';
  var s = String(url);
  if(s.startsWith('data:image/') && s.includes(';base64,')) return s;
  if(s.startsWith('https://')) return s;
  return '';
}

// ── STAT POPUP ────────────────────────────────────────────────
var _statPopupKey = null;
var _statPopupAllHistory = [];

const STAT_META = {
  total:      { title: 'Total Users',        desc: 'All registered accounts',              valueId: 'stat-total',         histKey: 'totalUsers',          stroke: 'rgba(74,74,82,0.9)',      fill: 'rgba(74,74,82,0.5)',      prefix: '', suffix: '' },
  free:       { title: 'Free Plan Users',     desc: '1 saved scenario limit',               valueId: 'stat-free',          histKey: 'freeUsers',           stroke: 'rgba(100,100,110,0.8)',   fill: 'rgba(100,100,110,0.4)',   prefix: '', suffix: '' },
  pro:        { title: 'Pro Plan Users',      desc: 'Unlimited + PDF + Projection',         valueId: 'stat-pro',           histKey: 'proUsers',            stroke: 'rgba(180,140,50,0.9)',    fill: 'rgba(201,168,76,0.5)',    prefix: '', suffix: '' },
  adviser:    { title: 'Adviser Plan Users',  desc: 'Multi-client + white-label',           valueId: 'stat-adviser',       histKey: 'adviserUsers',        stroke: 'rgba(60,120,165,0.9)',    fill: 'rgba(91,143,171,0.5)',    prefix: '', suffix: '' },
  sessions:   { title: 'Login Tokens',        desc: 'One token per device/browser per user (30-day TTL). High counts are normal — each device sign-in creates a new token. Use Database → Purge Expired Sessions to clean up stale tokens.',   valueId: 'stat-sessions',      histKey: 'activeSessions',      stroke: 'rgba(91,143,171,0.85)',   fill: 'rgba(91,143,171,0.4)',    prefix: '', suffix: '' },
  scenarios:  { title: 'Scenario Sets',       desc: 'Saved property scenario lists',        valueId: 'stat-scenarios-top', histKey: 'totalScenarioLists',  stroke: 'rgba(70,140,110,0.85)',   fill: 'rgba(90,158,123,0.4)',    prefix: '', suffix: '' },
  'new-users':{ title: 'New This Week',       desc: 'Signups in last 7 days',               valueId: 'stat-new-users',     histKey: 'newUsersLast7',       stroke: 'rgba(90,158,123,0.9)',    fill: 'rgba(90,158,123,0.5)',    prefix: '', suffix: '' },
  revenue:    { title: 'Revenue Estimate',    desc: 'Monthly AUD from Pro + Adviser plans at list price — may differ if discounts are active', valueId: 'stat-revenue',       histKey: 'revenueEstimate',     stroke: 'rgba(201,168,76,0.9)',    fill: 'rgba(201,168,76,0.5)',    prefix: '$', suffix: '' },
  avg:        { title: 'Avg Scenarios/User',  desc: 'Average scenario lists per user',      valueId: 'stat-avg-scenarios', histKey: 'avgScenariosPerUser', stroke: 'rgba(150,100,180,0.8)',   fill: 'rgba(150,100,180,0.4)',   prefix: '', suffix: '' },
};

function openStatPopup(key){
  const meta = STAT_META[key];
  if(!meta) return;
  _statPopupKey = key;
  document.getElementById('stat-popup-title').textContent = meta.title;
  document.getElementById('stat-popup-desc').textContent = meta.desc;
  const valEl = document.getElementById(meta.valueId);
  document.getElementById('stat-popup-value').textContent = valEl ? valEl.textContent : '—';
  document.getElementById('stat-popup-overlay').classList.add('open');
  // Reset to 7-day view
  document.querySelectorAll('.stat-popup-filter-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  renderStatPopupChart(7);
}

function closeStatPopup(){
  document.getElementById('stat-popup-overlay').classList.remove('open');
}

function setStatPopupRange(days, btn){
  document.querySelectorAll('.stat-popup-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStatPopupChart(days);
}

function renderStatPopupChart(days){
  const meta = STAT_META[_statPopupKey];
  if(!meta || !_statPopupAllHistory.length) return;

  // Slice data to requested range (most recent N days)
  let data = _statPopupAllHistory.map(h => ({ date: h.date, value: h[meta.histKey] }));
  if(days > 0 && data.length > days) data = data.slice(data.length - days);

  // Pad missing days at the start with zeros so the chart always shows the full selected range
  if(days > 0 && data.length < days){
    const missing = days - data.length;
    const firstDate = data.length > 0 ? new Date(data[0].date + 'T12:00:00') : new Date();
    const pads = [];
    for(let i = missing; i > 0; i--){
      const d = new Date(firstDate);
      d.setDate(d.getDate() - i);
      pads.push({ date: d.toISOString().slice(0,10), value: 0 });
    }
    data = pads.concat(data);
  }

  // Forward-fill nulls
  let last = 0;
  data = data.map(d => { const v = (d.value !== null && d.value !== undefined) ? d.value : last; last = v; return { date: d.date, value: v }; });

  const chartEl = document.getElementById('stat-popup-chart');
  const W = 640, H = 200;
  const vals = data.map(d => d.value);
  const maxV = Math.max(...vals, 1);
  const minV = Math.min(...vals, 0);
  const range = maxV - minV || 1;
  const n = data.length;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;

  const pts = data.map((d, i) => ({
    x: pad.l + (n > 1 ? (i / (n - 1)) * cW : cW / 2),
    y: pad.t + cH - ((d.value - minV) / range) * cH,
    val: d.value, date: d.date
  }));

  // Y-axis gridlines
  const gridCount = 4;
  const gridLines = Array.from({length: gridCount + 1}, (_, i) => {
    const val = minV + (range / gridCount) * i;
    const y = pad.t + cH - ((val - minV) / range) * cH;
    return { y, val };
  });

  const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M ${pts[0].x.toFixed(1)},${pad.t + cH} ` + pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L ${pts[pts.length-1].x.toFixed(1)},${pad.t + cH} Z`;

  const shortDate = s => { try { return new Date(s+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}); } catch(e){ return s; } };
  // Show max 7 x-axis labels
  const labelStep = Math.max(1, Math.ceil(n / 7));
  const xLabels = pts.filter((_, i) => i % labelStep === 0 || i === n - 1).map(p =>
    `<text x="${p.x.toFixed(1)}" y="${pad.t + cH + 18}" text-anchor="middle" font-family="var(--font-mono)" font-size="9" fill="rgba(74,74,82,0.55)">${shortDate(p.date)}</text>`
  ).join('');

  const yLabels = gridLines.map(g =>
    `<line x1="${pad.l}" y1="${g.y.toFixed(1)}" x2="${pad.l + cW}" y2="${g.y.toFixed(1)}" stroke="rgba(28,28,30,0.06)" stroke-width="1"/>
     <text x="${pad.l - 4}" y="${(g.y + 4).toFixed(1)}" text-anchor="end" font-family="var(--font-mono)" font-size="9" fill="rgba(74,74,82,0.45)">${meta.prefix}${g.val % 1 === 0 ? g.val : g.val.toFixed(1)}${meta.suffix}</text>`
  ).join('');

  const uid = 'sp_' + _statPopupKey;
  chartEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">
      <defs>
        <linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${meta.fill}" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="${meta.fill}" stop-opacity="0.03"/>
        </linearGradient>
      </defs>
      ${yLabels}
      <path d="${area}" fill="url(#${uid}g)"/>
      <polyline points="${poly}" fill="none" stroke="${meta.stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${meta.stroke}" stroke="white" stroke-width="1.5" style="cursor:default;"><title>${shortDate(p.date)}: ${meta.prefix}${p.val}${meta.suffix}</title></circle>`).join('')}
      ${xLabels}
    </svg>`;

  // Range label
  const rangeLabel = n > 1 ? `${shortDate(data[0].date)} → ${shortDate(data[n-1].date)}` : (n === 1 ? shortDate(data[0].date) : '');
  document.getElementById('stat-popup-range-label').textContent = rangeLabel;

  // Summary stats row
  const first = vals[0], latest = vals[vals.length - 1];
  const minVal = Math.min(...vals), maxVal = Math.max(...vals);
  const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
  const delta = latest - first;
  const dStr = (delta > 0 ? '+' : '') + (Number.isInteger(delta) ? delta : delta.toFixed(2));
  const dCol = delta > 0 ? 'var(--reward-green)' : delta < 0 ? 'var(--risk-red)' : 'var(--slate)';
  document.getElementById('stat-popup-stats-row').innerHTML = `
    <div class="stat-popup-mini"><div class="stat-popup-mini-val">${meta.prefix}${latest}${meta.suffix}</div><div class="stat-popup-mini-lbl">Latest</div></div>
    <div class="stat-popup-mini"><div class="stat-popup-mini-val" style="color:${dCol};">${dStr}</div><div class="stat-popup-mini-lbl">Change</div></div>
    <div class="stat-popup-mini"><div class="stat-popup-mini-val">${meta.prefix}${minVal}${meta.suffix}</div><div class="stat-popup-mini-lbl">Min</div></div>
    <div class="stat-popup-mini"><div class="stat-popup-mini-val">${meta.prefix}${maxVal}${meta.suffix}</div><div class="stat-popup-mini-lbl">Max</div></div>
    <div class="stat-popup-mini"><div class="stat-popup-mini-val">${meta.prefix}${Number.isInteger(avg) ? avg : avg.toFixed(1)}${meta.suffix}</div><div class="stat-popup-mini-lbl">Avg</div></div>
    <div class="stat-popup-mini"><div class="stat-popup-mini-val">${n}</div><div class="stat-popup-mini-lbl">Data Points</div></div>
  `;
}

// ── SCENARIOS TAB ─────────────────────────────────────────────
// Cache for quick scenario lookup by id
var _scenarioDetailCache = {};

async function loadAllScenarios(){
  const wrap = document.getElementById('scenarios-list-wrap');
  const st   = document.getElementById('scenarios-tab-status');
  wrap.innerHTML = '<div style="text-align:center;color:var(--slate);padding:24px;font-style:italic;">Loading scenarios…</div>';
  const d = await callAuth('adminListUsers');
  if(!d.ok){ wrap.innerHTML='<div style="color:var(--risk-red);padding:24px;">'+escHtml(d.error||'Failed')+'</div>'; return; }
  const users = d.users || [];
  if(!users.length){ wrap.innerHTML='<div style="color:var(--slate);padding:24px;text-align:center;font-style:italic;">No users found</div>'; return; }
  const sess = getSession();
  const token = sess && sess.token;
  let totalScenarios = 0;
  _scenarioDetailCache = {};
  const rows = await Promise.all(users.map(async u => {
    if(!u.id) return null;
    try {
      const r = await fetch('/.netlify/functions/scenarios?' + new URLSearchParams({adminUserId: u.id}), {
        headers: token ? {'Authorization': 'Bearer ' + token} : {}
      });
      const arr = await r.json();
      const count = Array.isArray(arr) ? arr.length : 0;
      totalScenarios += count;
      if(count === 0) return null;
      const scenarios = Array.isArray(arr) ? arr : [];
      scenarios.forEach(s => { _scenarioDetailCache[s.id] = { scenario: s, userEmail: u.email, userId: u.id }; });
      return { user: u, scenarios };
    } catch(e){ return null; }
  }));
  const valid = rows.filter(Boolean);
  if(!valid.length){
    wrap.innerHTML='<div style="color:var(--slate);padding:24px;text-align:center;font-style:italic;">No saved scenarios found across all users</div>';
    return;
  }
  wrap.innerHTML = valid.map(({ user, scenarios }) => `
    <div style="margin-bottom:20px;">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);padding:10px 0 6px;border-bottom:1px solid rgba(28,28,30,0.08);margin-bottom:8px;display:flex;align-items:center;gap:10px;">
        <span>${escHtml(user.email)}</span>
        <span style="color:var(--charcoal);">${scenarios.length} scenario${scenarios.length!==1?'s':''}</span>
      </div>
      ${scenarios.map(s => `
        <div data-scenarioid="${escHtml(s.id)}" data-userid="${escHtml(user.id)}" data-addr="${escHtml(s.fullAddr||'this scenario')}"
             class="admin-scenario-row"
             style="display:flex;align-items:center;gap:12px;padding:9px 8px;border-bottom:1px solid rgba(28,28,30,0.04);font-size:13px;cursor:pointer;border-radius:4px;transition:background 0.12s;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.fullAddr||'Unnamed')}</div>
            ${s.type||s.state?.values?.['pd-type'] ? `<div style="font-size:11px;color:var(--slate);margin-top:2px;">${escHtml(s.type||s.state?.values?.['pd-type']||'')}${s.bed?` · ${s.bed}bd`:''}</div>` : ''}
          </div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate);white-space:nowrap;text-transform:capitalize;">${s.status||'browsing'}</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate);white-space:nowrap;">${s.savedAt ? new Date(s.savedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : '—'}</div>
          <button class="act-btn" style="font-size:9px;padding:3px 7px;" data-action="view-scenario" data-scenarioid="${escHtml(s.id)}">View</button>
          <button class="act-btn danger" data-action="del-scenario-admin" data-userid="${escHtml(user.id)}" data-scenarioid="${escHtml(s.id)}" data-addr="${escHtml(s.fullAddr||'this scenario')}">Delete</button>
        </div>`).join('')}
    </div>`).join('');
  st.textContent = '✓ Loaded ' + totalScenarios + ' scenario' + (totalScenarios!==1?'s':'') + ' across ' + valid.length + ' user' + (valid.length!==1?'s':'');
  st.className = 'admin-status ok';
  setTimeout(()=>{ st.className='admin-status'; }, 5000);
}

function openScenarioDetail(scenarioId){
  const cache = _scenarioDetailCache[scenarioId];
  if(!cache) return;
  const s = cache.scenario;
  const userEmail = cache.userEmail;

  document.getElementById('scenario-detail-overlay').classList.add('open');
  document.getElementById('scenario-detail-title').textContent = s.fullAddr || 'Scenario Overview';

  const vals  = (s.state && s.state.values) || {};
  const fmt$  = v => (v !== '' && v !== null && v !== undefined) ? '$' + parseFloat(v).toLocaleString('en-AU', {minimumFractionDigits:0,maximumFractionDigits:0}) : null;
  const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-AU', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

  // Resolve the selected government scheme
  const selectedSchemeId = vals['scheme-select'] || '';
  const allSchemesPool = (_schemes && _schemes.length) ? _schemes : DEFAULT_SCHEMES;
  const appliedScheme = selectedSchemeId ? allSchemesPool.find(sc => sc.id === selectedSchemeId) : null;

  const priceNum  = parseFloat(vals['inp-price']  || s.price  || 0);
  const depNum    = parseFloat(vals['inp-deposit'] || 0);
  const govtPct   = parseFloat(vals['inp-govt'] || 0);
  const govtNum   = priceNum * govtPct / 100;
  const loanNum   = Math.max(0, priceNum - depNum - govtNum);
  const termNum   = parseFloat(vals['inp-term'] || vals['inp-loan-term'] || 30);
  const rateNum   = parseFloat(vals['inp-rate'] || 0);
  const rentNum   = parseFloat(vals['inp-rent'] || 0);
  const savingsNum= parseFloat(vals['inp-savings'] || 0);

  const price     = priceNum  ? fmt$(priceNum)  : null;
  const deposit   = depNum    ? fmt$(depNum)    : null;
  const loanTerm  = termNum   ? termNum         : null;
  const intRate   = rateNum   ? rateNum         : null;
  const rent      = rentNum   ? rentNum         : null;
  const bed  = s.bed  || vals['pd-bed']  || '';
  const bath = s.bath || vals['pd-bath'] || '';
  const car  = s.car  || vals['pd-car']  || '';
  const propType = s.type || vals['pd-type'] || '';

  // Compute monthly repayment
  let monthlyRep = null;
  if(loanNum > 0 && rateNum > 0 && termNum > 0){
    const r = rateNum/100/12, n = termNum*12;
    monthlyRep = loanNum * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
  }
  // Gross yield
  const grossYield = (rentNum > 0 && priceNum > 0) ? (rentNum * 52 / priceNum * 100).toFixed(1) + '%' : null;
  // Total upfront costs from dynCosts
  const dynCosts   = (s.state && s.state.dynCosts)   || [];
  const renoItems  = (s.state && s.state.renoItems)  || [];
  const totalCosts = dynCosts.reduce((acc, c) => acc + (parseFloat(c.amount)||0), 0);
  const renoTotal  = renoItems.reduce((acc, r) => acc + (parseFloat(r.amount)||0), 0);

  const row = (label, val, mono) => val
    ? `<div><div class="config-label">${label}</div><div style="font-size:13px;${mono?'font-family:var(--font-mono);':''} margin-top:3px;">${escHtml(String(val))}</div></div>`
    : '';

  const bigRow = (label, val, color) => val
    ? `<div><div class="config-label">${label}</div><div style="font-family:var(--font-mono);font-size:20px;font-weight:500;margin-top:3px;${color?'color:'+color+';':''}">${escHtml(String(val))}</div></div>`
    : '';

  // Cost items HTML
  const costsHtml = dynCosts.length ? `
    <div style="border-top:1px solid rgba(28,28,30,0.09);padding-top:14px;margin-top:4px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:10px;">Upfront Cost Items</div>
      ${dynCosts.map(c=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(28,28,30,0.05);font-size:13px;"><span style="color:var(--slate)">${escHtml(c.name||'Item')}</span><span style="font-family:var(--font-mono)">${fmt$(parseFloat(c.amount)||0)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;font-weight:600;margin-top:2px;border-top:1px solid rgba(28,28,30,0.1);">
        <span>Total</span><span style="font-family:var(--font-mono)">${fmt$(totalCosts)}</span>
      </div>
    </div>` : '';

  const renoHtml = renoItems.length ? `
    <div style="border-top:1px solid rgba(28,28,30,0.09);padding-top:14px;margin-top:4px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:10px;">Renovation Items</div>
      ${renoItems.map(r=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(28,28,30,0.05);font-size:13px;"><span style="color:var(--slate)">${escHtml(r.name||'Item')}</span><span style="font-family:var(--font-mono)">${fmt$(parseFloat(r.amount)||0)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;font-weight:600;margin-top:2px;border-top:1px solid rgba(28,28,30,0.1);">
        <span>Total</span><span style="font-family:var(--font-mono)">${fmt$(renoTotal)}</span>
      </div>
    </div>` : '';

  document.getElementById('scenario-detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;padding:8px 0 16px;">
      <div style="grid-column:1/-1;">
        <div class="config-label">Full Address</div>
        <div style="font-size:15px;font-weight:600;margin-top:3px;line-height:1.3;">${escHtml(s.fullAddr||'—')}</div>
      </div>
      ${row('Status', s.status||'browsing')}
      ${row('Property Type', propType)}
      ${(bed||bath||car) ? `<div>
        <div class="config-label">Bed / Bath / Car</div>
        <div style="font-family:var(--font-mono);font-size:15px;margin-top:3px;">${[bed,bath,car].map((v,i)=>v?v+['bd','ba','car'][i]:'').filter(Boolean).join(' · ')||'—'}</div>
      </div>` : ''}
      ${row('Last Saved', fmtTs(s.savedAt||s.timestamp), true)}
      ${s.exportCount !== undefined ? row('PDF Exports', s.exportCount + (s.exportCount === 1 ? ' export' : ' exports'), true) : ''}
    </div>
    ${price ? `<div style="border-top:1px solid rgba(28,28,30,0.09);padding-top:14px;margin-bottom:4px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:12px;">Financial Snapshot</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;">
        ${bigRow('Purchase Price', price)}
        ${deposit ? bigRow('Deposit', deposit) : ''}
        ${loanNum ? bigRow('Loan Amount', fmt$(loanNum), 'var(--risk-red)') : ''}
        ${monthlyRep ? bigRow('Monthly Repayment', fmt$(monthlyRep)) : ''}
        ${loanTerm ? row('Loan Term', loanTerm + ' years', true) : ''}
        ${intRate  ? row('Interest Rate', parseFloat(intRate).toFixed(2) + '%', true) : ''}
        ${rent     ? row('Weekly Rent', fmt$(rent) + '/wk', true) : ''}
        ${grossYield ? row('Gross Yield', grossYield, true) : ''}
        ${savingsNum ? row('Savings / Equity', fmt$(savingsNum), true) : ''}
      </div>
    </div>` : ''}
    ${costsHtml}
    ${renoHtml}
    ${appliedScheme ? `<div style="border-top:1px solid rgba(28,28,30,0.09);padding-top:14px;margin-top:4px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:12px;">Government Scheme Applied</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <span style="font-size:14px;font-weight:600;color:var(--charcoal);">${escHtml(appliedScheme.name)}</span>
        <span class="scheme-type-badge ${typeBadgeClass(appliedScheme.type||'shared-equity')}">${typeBadgeLabel(appliedScheme.type||'shared-equity')}</span>
        ${appliedScheme.country ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--slate);">${escHtml(appliedScheme.country)}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin-bottom:10px;">
        ${govtPct ? `<div><div class="config-label">Govt Equity Applied</div><div style="font-family:var(--font-mono);font-size:18px;font-weight:500;color:var(--sky);">${govtPct.toFixed(1)}%</div>${govtNum ? `<div style="font-size:11px;color:var(--slate);">${fmt$(govtNum)} contributed</div>` : ''}</div>` : ''}
        ${appliedScheme.maxPropertyPrice ? `<div><div class="config-label">Max Property Price</div><div style="font-family:var(--font-mono);font-size:14px;margin-top:2px;">${fmt$(appliedScheme.maxPropertyPrice)}</div>${priceNum > appliedScheme.maxPropertyPrice ? `<div style="font-size:10px;color:var(--risk-red);margin-top:2px;">⚠ Price exceeds limit</div>` : `<div style="font-size:10px;color:var(--reward-green);margin-top:2px;">✓ Within price cap</div>`}</div>` : ''}
        ${appliedScheme.govtMinPct || appliedScheme.govtMaxPct ? `<div><div class="config-label">Equity Range</div><div style="font-family:var(--font-mono);font-size:14px;margin-top:2px;">${appliedScheme.govtMinPct||0}% – ${appliedScheme.govtMaxPct||0}%</div></div>` : ''}
        ${appliedScheme.removesLMI ? `<div><div class="config-label">LMI</div><div style="font-size:13px;color:var(--reward-green);margin-top:2px;">✓ LMI Waived</div></div>` : ''}
        ${appliedScheme.fixedGrantAmount ? `<div><div class="config-label">Fixed Grant</div><div style="font-family:var(--font-mono);font-size:14px;margin-top:2px;">${fmt$(appliedScheme.fixedGrantAmount)}</div></div>` : ''}
      </div>
      ${appliedScheme.incomeThresholds && appliedScheme.incomeThresholds.length ? `
        <div style="margin-bottom:8px;">
          <div class="config-label" style="margin-bottom:6px;">Income Thresholds</div>
          ${appliedScheme.incomeThresholds.map(t=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(28,28,30,0.05);font-size:12px;"><span style="color:var(--slate);">${escHtml(t.label||'')}</span><span style="font-family:var(--font-mono);">max ${fmt$(t.maxIncome)}/yr</span></div>`).join('')}
        </div>` : ''}
      ${appliedScheme.eligibility ? `<div style="background:rgba(91,143,171,0.06);border:1px solid rgba(91,143,171,0.15);border-radius:4px;padding:8px 10px;font-size:11px;color:var(--slate);line-height:1.5;">${escHtml(appliedScheme.eligibility)}</div>` : ''}
    </div>` : govtPct > 0 ? `<div style="border-top:1px solid rgba(28,28,30,0.09);padding-top:14px;margin-top:4px;">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:8px;">Government Scheme</div>
      <div style="font-size:13px;color:var(--slate);">Manual entry — ${govtPct.toFixed(1)}% government equity (${fmt$(govtNum)})</div>
    </div>` : ''}
    <div style="border-top:1px solid rgba(28,28,30,0.09);padding-top:10px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate);">Owner: ${escHtml(userEmail)}</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate);">ID: ${escHtml(s.id||'—')}</div>
    </div>`;
}

async function adminDeleteScenario(userId, scenarioId, label){
  const confirmed = await customConfirm(
    'Delete Scenario',
    `Delete the scenario <strong>${escHtml(label)}</strong>?<br><br>This cannot be undone.`,
    { danger: true, confirmLabel: 'Delete' }
  );
  if(!confirmed) return;
  const sess = getSession();
  const token = sess && sess.token;
  const st = document.getElementById('scenarios-tab-status');
  st.textContent = 'Deleting…'; st.className = 'admin-status info';
  try {
    const r = await fetch('/.netlify/functions/scenarios?' + new URLSearchParams({id: scenarioId, adminUserId: userId}), {
      method: 'DELETE',
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    const d = await r.json();
    if(d.ok){
      st.textContent = '✓ Scenario deleted'; st.className = 'admin-status ok';
      loadAllScenarios();
    } else {
      st.textContent = '✗ ' + (d.error||'Failed'); st.className = 'admin-status err';
    }
  } catch(e){
    st.textContent = '✗ Network error'; st.className = 'admin-status err';
  }
}

// ── DATABASE PURGE ─────────────────────────────────────────────
async function purgeExpiredSessions(){
  const st = document.getElementById('database-status');
  const ok = await customConfirm('Purge Expired Sessions',
    'Remove all expired login tokens from the database. Active sessions will not be affected.',
    { icon: '🗑', confirmLabel: 'Purge' });
  if(!ok) return;
  st.textContent = 'Purging…'; st.className = 'admin-status info';
  const d = await callAuth('adminPurgeExpiredSessions');
  if(d.ok){
    st.textContent = '✓ Purged ' + (d.count||0) + ' expired sessions';
    st.className = 'admin-status ok';
    loadStats();
  } else {
    st.textContent = '✗ ' + (d.error||'Failed');
    st.className = 'admin-status err';
  }
}

async function purgeOrphanedProfiles(){
  const st = document.getElementById('database-status');
  const ok = await customConfirm('Purge Orphaned Profiles',
    'Remove profile data for accounts that no longer exist. This is safe to run.',
    { icon: '🗑', confirmLabel: 'Purge' });
  if(!ok) return;
  st.textContent = 'Purging…'; st.className = 'admin-status info';
  const d = await callAuth('adminPurgeOrphanedProfiles');
  if(d.ok){
    st.textContent = '✓ Purged ' + (d.count||0) + ' orphaned profiles';
    st.className = 'admin-status ok';
  } else {
    st.textContent = '✗ ' + (d.error||'Failed');
    st.className = 'admin-status err';
  }
}

async function purgeOrphanedScenarios(){
  const st = document.getElementById('database-status');
  const ok = await customConfirm('Purge Orphaned Scenarios',
    'Remove saved scenarios for deleted accounts. Active user scenarios will not be affected.',
    { icon: '🗑', confirmLabel: 'Purge' });
  if(!ok) return;
  st.textContent = 'Purging…'; st.className = 'admin-status info';
  const d = await callAuth('adminPurgeOrphanedScenarios');
  if(d.ok){
    st.textContent = '✓ Purged ' + (d.count||0) + ' orphaned scenario sets';
    st.className = 'admin-status ok';
    loadStats();
  } else {
    st.textContent = '✗ ' + (d.error||'Failed');
    st.className = 'admin-status err';
  }
}

async function exportAllUsers(){
  const st = document.getElementById('database-status');
  st.textContent = 'Exporting…'; st.className = 'admin-status info';
  const d = await callAuth('adminListUsers');
  if(!d.ok){ st.textContent='✗ '+(d.error||'Failed'); st.className='admin-status err'; return; }
  const blob = new Blob([JSON.stringify(d.users||[], null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'equitysight-users-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  st.textContent = '✓ Exported ' + (d.users||[]).length + ' users';
  st.className = 'admin-status ok';
  setTimeout(()=>{ st.className='admin-status'; }, 3000);
}

// ── SCHEMES TAB ─────────────────────────────────────────────
let _schemes = [];

const DEFAULT_SCHEMES = [
  {
    id: 'help-to-buy',
    name: 'Help to Buy',
    type: 'shared-equity',
    country: 'Australia',
    description: 'Federal government shared equity scheme. Government contributes up to 40% for new homes and 30% for existing homes.',
    govtMinPct: 2,
    govtMaxPct: 40,
    govtDefaultPct: 30,
    maxPropertyPrice: 700000,
    removesLMI: false,
    fixedGrantAmount: 0,
    eligibility: 'Australian citizen or permanent resident, first home buyer, income under $90k single / $120k couple',
    incomeThresholds: [
      { label: 'Single', maxIncome: 90000 },
      { label: 'Couple / Joint', maxIncome: 120000 }
    ],
    suburbBonuses: [],
    notes: '',
    active: true
  },
  {
    id: 'vic-homebuyer',
    name: 'VIC Homebuyer Fund',
    type: 'shared-equity',
    country: 'Australia – Victoria',
    description: 'Victorian government co-contribution up to 25% for eligible buyers purchasing in Victoria.',
    govtMinPct: 5,
    govtMaxPct: 25,
    govtDefaultPct: 25,
    maxPropertyPrice: 950000,
    removesLMI: false,
    fixedGrantAmount: 0,
    eligibility: 'Australian citizen, Victorian resident, first home buyer or single parent',
    incomeThresholds: [
      { label: 'Single', maxIncome: 128000 },
      { label: 'Couple / Joint', maxIncome: 204000 }
    ],
    suburbBonuses: [],
    notes: '',
    active: true
  },
  {
    id: 'first-home-guarantee',
    name: 'First Home Guarantee (FHBG)',
    type: 'lmi-waiver',
    country: 'Australia',
    description: 'Government guarantees up to 15% of the property value, allowing buyers to purchase with a 5% deposit without paying LMI.',
    govtMinPct: 0,
    govtMaxPct: 0,
    govtDefaultPct: 0,
    maxPropertyPrice: 700000,
    removesLMI: true,
    fixedGrantAmount: 0,
    eligibility: 'Australian citizen or permanent resident, first home buyer, income under $125k single / $200k couple',
    incomeThresholds: [
      { label: 'Single', maxIncome: 125000 },
      { label: 'Couple / Joint', maxIncome: 200000 }
    ],
    suburbBonuses: [],
    notes: 'Government does not contribute equity — it only guarantees the loan to remove LMI requirement.',
    active: true
  },
  {
    id: 'wa-keystart',
    name: 'WA Keystart',
    type: 'shared-equity',
    country: 'Australia – Western Australia',
    description: 'Keystart provides low-deposit home loans with shared equity options for eligible WA residents.',
    govtMinPct: 0,
    govtMaxPct: 30,
    govtDefaultPct: 20,
    maxPropertyPrice: 560000,
    removesLMI: false,
    fixedGrantAmount: 0,
    eligibility: 'WA resident, income limits apply, primary residence only',
    incomeThresholds: [],
    suburbBonuses: [],
    notes: '',
    active: false
  }
];

const SCHEME_TYPES = [
  { value: 'shared-equity', label: 'Shared Equity', desc: 'Government takes a % ownership stake' },
  { value: 'grant',         label: 'Grant',          desc: 'Fixed dollar amount gifted to buyer' },
  { value: 'lmi-waiver',    label: 'LMI Waiver',     desc: 'Removes Lenders Mortgage Insurance only' },
  { value: 'mixed',         label: 'Mixed',           desc: 'Combination of equity, grant, or LMI waiver' },
];

async function loadSchemes(){
  const d = await callAuth('adminGetSchemes');
  if(d.ok && d.schemes && d.schemes.length){
    _schemes = d.schemes.map(migrateScheme);
  } else {
    _schemes = JSON.parse(JSON.stringify(DEFAULT_SCHEMES));
  }
  renderSchemes();
}

// Migrate older scheme objects to new flexible format
function migrateScheme(s){
  return Object.assign({
    type: 'shared-equity',
    removesLMI: false,
    fixedGrantAmount: 0,
    incomeThresholds: [],
    suburbBonuses: [],
    notes: '',
  }, s);
}

function collapseAllSchemes(){
  document.querySelectorAll('.scheme-panel.open').forEach(p => p.classList.remove('open'));
}

function toggleSchemePanel(i){
  const panel = document.getElementById('scheme-panel-' + i);
  if(panel) panel.classList.toggle('open');
}

function typeBadgeClass(type){
  return { 'shared-equity':'type-shared-equity', 'grant':'type-grant', 'lmi-waiver':'type-lmi-waiver', 'mixed':'type-mixed' }[type] || 'type-shared-equity';
}
function typeBadgeLabel(type){
  return SCHEME_TYPES.find(t=>t.value===type)?.label || type;
}

function renderSchemes(){
  const list = document.getElementById('schemes-list');
  if(!_schemes.length){
    list.innerHTML='<div style="color:var(--slate);padding:24px;text-align:center;font-style:italic;">No schemes configured. Click + Add.</div>';
    return;
  }
  list.innerHTML = _schemes.map((s, i) => {
    const type = s.type || 'shared-equity';
    const isEquity  = type === 'shared-equity' || type === 'mixed';
    const isGrant   = type === 'grant' || type === 'mixed';
    const isLMI     = type === 'lmi-waiver' || type === 'mixed';

    const suburbRows = (s.suburbBonuses||[]).map((b, bi) => `
      <div class="suburb-bonus-row" data-bidx="${bi}">
        <input type="text" class="config-input" placeholder="Suburb name" value="${escHtml(b.suburb||'')}" data-field="suburb">
        <input type="number" class="config-input" placeholder="Bonus $" value="${b.bonusAmount||0}" min="0" step="1000" data-field="bonusAmount" style="max-width:110px;">
        <input type="text" class="config-input" placeholder="Notes (optional)" value="${escHtml(b.notes||'')}" data-field="notes">
        <button class="row-del-btn" data-action="del-suburb-bonus" data-bidx="${bi}">−</button>
      </div>`).join('');

    const incomeRows = (s.incomeThresholds||[]).map((t, ti) => `
      <div class="income-thresh-row" data-tidx="${ti}">
        <input type="text" class="config-input" placeholder="Label (e.g. Single)" value="${escHtml(t.label||'')}" data-field="label">
        <input type="number" class="config-input" placeholder="Max income $" value="${t.maxIncome||0}" min="0" step="1000" data-field="maxIncome" style="max-width:140px;">
        <button class="row-del-btn" data-action="del-income-thresh" data-tidx="${ti}">−</button>
      </div>`).join('');

    return `
    <div class="scheme-panel ${i === _schemes.length - 1 ? 'open' : ''}" id="scheme-panel-${i}" data-sidx="${i}">
      <div class="scheme-panel-header" data-action="toggle-scheme-panel">
        <div class="scheme-panel-toggle">▼</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:var(--charcoal);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.name)}</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate);margin-top:1px;">${escHtml(s.country||'')}</div>
        </div>
        <span class="scheme-type-badge ${typeBadgeClass(type)}">${typeBadgeLabel(type)}</span>
        <label style="display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:10px;cursor:pointer;white-space:nowrap;" data-stop-propagation>
          <input type="checkbox" ${s.active?'checked':''} data-field="active" style="accent-color:var(--gold);width:13px;height:13px;"> Active
        </label>
        <button class="act-btn danger" style="white-space:nowrap;" data-action="remove-scheme">Remove</button>
      </div>
      <div class="scheme-panel-body">

        <div class="scheme-section-label">Basic Info</div>
        <div class="config-grid" style="margin-bottom:10px;">
          <div class="config-field">
            <label class="config-label">Scheme Name</label>
            <input type="text" class="config-input" value="${escHtml(s.name)}" data-field="name">
          </div>
          <div class="config-field">
            <label class="config-label">Type</label>
            <select class="config-input" data-field="type">
              ${SCHEME_TYPES.map(t=>`<option value="${t.value}" ${type===t.value?'selected':''}>${t.label} — ${t.desc}</option>`).join('')}
            </select>
          </div>
          <div class="config-field">
            <label class="config-label">Country / State</label>
            <input type="text" class="config-input" value="${escHtml(s.country||'')}" data-field="country">
          </div>
          <div class="config-field">
            <label class="config-label">Max Property Price (AUD $)</label>
            <input type="number" class="config-input" value="${s.maxPropertyPrice||0}" min="0" step="10000" data-field="maxPropertyPrice">
          </div>
        </div>
        <div class="config-field" style="margin-bottom:10px;">
          <label class="config-label">Description</label>
          <input type="text" class="config-input" value="${escHtml(s.description||'')}" data-field="description">
        </div>
        <div class="config-field" style="margin-bottom:10px;">
          <label class="config-label">Eligibility Requirements</label>
          <input type="text" class="config-input" value="${escHtml(s.eligibility||'')}" data-field="eligibility">
        </div>
        <div class="config-field" style="margin-bottom:10px;">
          <label class="config-label">Official Government Website</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="url" class="config-input" value="${escHtml(s.websiteUrl||'')}" placeholder="https://www.housing.gov.au/..." data-field="websiteUrl" style="flex:1;">
            ${s.websiteUrl ? `<a href="${escHtml(s.websiteUrl)}" target="_blank" rel="noopener" style="flex-shrink:0;font-family:var(--font-mono);font-size:11px;color:var(--sky);text-decoration:none;white-space:nowrap;padding:6px 10px;border:1px solid rgba(91,143,171,0.3);border-radius:3px;" title="Open website">Visit ↗</a>` : ''}
          </div>
        </div>
        <div class="config-field" style="margin-bottom:4px;">
          <label class="config-label">Admin Notes (internal only)</label>
          <input type="text" class="config-input" value="${escHtml(s.notes||'')}" placeholder="Internal notes, caveats, links..." data-field="notes">
        </div>

        ${isEquity ? `
        <div class="scheme-section-label">Equity Contribution</div>
        <div class="config-grid" style="margin-bottom:4px;">
          <div class="config-field">
            <label class="config-label">Min Govt % Contribution</label>
            <input type="number" class="config-input" value="${s.govtMinPct||0}" min="0" max="50" step="0.5" data-field="govtMinPct">
          </div>
          <div class="config-field">
            <label class="config-label">Max Govt % Contribution</label>
            <input type="number" class="config-input" value="${s.govtMaxPct||0}" min="0" max="50" step="0.5" data-field="govtMaxPct">
          </div>
          <div class="config-field">
            <label class="config-label">Default Govt % (pre-fill in app)</label>
            <input type="number" class="config-input" value="${s.govtDefaultPct||0}" min="0" max="50" step="0.5" data-field="govtDefaultPct">
          </div>
        </div>` : ''}

        ${isGrant ? `
        <div class="scheme-section-label">Grant Amount</div>
        <div class="config-grid" style="margin-bottom:4px;">
          <div class="config-field">
            <label class="config-label">Fixed Grant Amount (AUD $)</label>
            <input type="number" class="config-input" value="${s.fixedGrantAmount||0}" min="0" step="500" data-field="fixedGrantAmount">
            <div style="font-size:11px;color:var(--slate);margin-top:3px;">Base grant amount. Use Suburb Bonuses below for location-specific variations.</div>
          </div>
        </div>` : ''}

        ${isLMI ? `
        <div class="scheme-section-label">LMI Waiver</div>
        <div class="config-field" style="margin-bottom:4px;">
          <label class="config-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" ${s.removesLMI?'checked':''} data-field="removesLMI" style="accent-color:var(--gold);width:14px;height:14px;">
            This scheme removes Lenders Mortgage Insurance (LMI)
          </label>
          <div style="font-size:11px;color:var(--slate);margin-top:3px;">When enabled, the calculator will show $0 LMI cost for this scheme.</div>
        </div>` : ''}

        <div class="scheme-section-label">Income Thresholds</div>
        <div id="income-rows-${i}">${incomeRows}</div>
        <button class="add-row-btn" data-action="add-income-thresh">＋ Add income threshold</button>

        <div class="scheme-section-label" style="margin-top:14px;">Suburb-Specific Bonuses</div>
        <div style="font-size:11px;color:var(--slate);margin-bottom:8px;">Some schemes pay more in certain suburbs or regions. Add suburb-specific bonus amounts here.</div>
        <div id="suburb-rows-${i}">${suburbRows}</div>
        <button class="add-row-btn" data-action="add-suburb-bonus">＋ Add suburb bonus</button>

      </div>
    </div>`;
  }).join('');
}

function updateSchemeHeaderName(i, val){
  const panel = document.getElementById('scheme-panel-' + i);
  if(!panel) return;
  const nameEl = panel.querySelector('.scheme-panel-header div div:first-child');
  if(nameEl) nameEl.textContent = val || 'Untitled Scheme';
}

function addSuburbBonus(i){
  if(!_schemes[i].suburbBonuses) _schemes[i].suburbBonuses = [];
  _schemes[i].suburbBonuses.push({ suburb: '', bonusAmount: 0, notes: '' });
  renderSchemes();
  // Reopen the panel after re-render
  const panel = document.getElementById('scheme-panel-' + i);
  if(panel) panel.classList.add('open');
}

function removeSuburbBonus(i, bi){
  _schemes[i].suburbBonuses.splice(bi, 1);
  renderSchemes();
  const panel = document.getElementById('scheme-panel-' + i);
  if(panel) panel.classList.add('open');
}

function addIncomeThreshold(i){
  if(!_schemes[i].incomeThresholds) _schemes[i].incomeThresholds = [];
  _schemes[i].incomeThresholds.push({ label: '', maxIncome: 0 });
  renderSchemes();
  const panel = document.getElementById('scheme-panel-' + i);
  if(panel) panel.classList.add('open');
}

function removeIncomeThreshold(i, ti){
  _schemes[i].incomeThresholds.splice(ti, 1);
  renderSchemes();
  const panel = document.getElementById('scheme-panel-' + i);
  if(panel) panel.classList.add('open');
}

function addScheme(){
  _schemes.push({
    id: 'scheme-' + Date.now(),
    name: 'New Scheme',
    type: 'shared-equity',
    country: 'Australia',
    description: '',
    websiteUrl: '',
    govtMinPct: 0,
    govtMaxPct: 30,
    govtDefaultPct: 20,
    maxPropertyPrice: 700000,
    removesLMI: false,
    fixedGrantAmount: 0,
    eligibility: '',
    incomeThresholds: [],
    suburbBonuses: [],
    notes: '',
    active: true
  });
  renderSchemes();
  // Auto-open the new scheme
  const lastIdx = _schemes.length - 1;
  const panel = document.getElementById('scheme-panel-' + lastIdx);
  if(panel) panel.classList.add('open');
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeScheme(i){
  const confirmed = await customConfirm(
    'Remove Scheme',
    `Remove the scheme <strong>${escHtml(_schemes[i]?.name||'this scheme')}</strong>? Remember to click Save All to persist changes.`,
    { danger: true, confirmLabel: 'Remove' }
  );
  if(!confirmed) return;
  _schemes.splice(i, 1);
  renderSchemes();
}

async function saveSchemes(){
  const st = document.getElementById('schemes-status');
  st.textContent = 'Saving…'; st.className = 'admin-status info';
  const d = await callAuth('adminSetSchemes', {schemes: _schemes});
  if(d.ok){
    try { localStorage.setItem('propCalc_schemes_v1', JSON.stringify(_schemes)); } catch(e){}
    st.textContent = '✓ Schemes saved'; st.className = 'admin-status ok';
    setTimeout(()=>{ st.className='admin-status'; }, 3000);
  } else if(d.error && d.error.includes('Unknown action')){
    try { localStorage.setItem('propCalc_schemes_v1', JSON.stringify(_schemes)); } catch(e){}
    st.textContent = '⚠ Saved locally (backend update needed for full persistence)'; st.className = 'admin-status info';
    setTimeout(()=>{ st.className='admin-status'; }, 5000);
  } else {
    st.textContent = '✗ ' + (d.error||'Failed'); st.className = 'admin-status err';
  }
}

// ── GROWTH DATA ───────────────────────────────────────────────────────────────
async function callGrowth(payload){
  const sess = getSession();
  const token = sess && sess.token;
  try {
    const r = await fetch('/.netlify/functions/growth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || '')
      },
      body: JSON.stringify(payload)
    });
    return r.json();
  } catch(e) {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
}

async function loadGrowthData(){
  const wrap = document.getElementById('growth-table-wrap');
  const loading = document.getElementById('growth-loading');
  if(loading) loading.style.display = 'block';
  const d = await callGrowth({action:'list'});
  if(loading) loading.style.display = 'none';
  if(!d.ok){ wrap.innerHTML = `<div style="padding:16px;color:#c45a5a;font-size:13px;">Error: ${escHtml(d.error||'Failed to load')}</div>`; return; }
  const entries = d.entries || [];
  if(!entries.length){
    wrap.innerHTML = '<div style="padding:16px;color:var(--slate);font-size:13px;">No growth data cached yet. Data is stored when users look up suburb growth rates.</div>';
    return;
  }
  const rows = entries.map(e => {
    const age = Math.floor((Date.now() - e.fetchedAt) / (1000*60*60*24));
    const expiry = 30 - age;
    return `<tr>
      <td style="font-weight:600;">${escHtml(e.suburb)}</td>
      <td>${escHtml(e.state)}</td>
      <td style="font-family:var(--font-mono);color:var(--gold);">${parseFloat(e.rate).toFixed(1)}%</td>
      <td style="font-size:11px;color:var(--slate);">${escHtml(e.note||'')}</td>
      <td style="font-size:11px;color:${expiry<=7?'#c45a5a':'var(--slate)'};">${expiry}d left</td>
      <td><button class="act-btn danger" data-action="del-growth" data-suburb="${escHtml(e.suburb)}" data-state="${escHtml(e.state)}">Delete</button></td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table class="user-table" style="min-width:600px;">
    <thead><tr><th>Suburb</th><th>State</th><th>Rate</th><th>Note</th><th>Expires</th><th>Action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function showAddGrowthEntry(){ document.getElementById('growth-add-form').style.display='block'; }
function hideAddGrowthEntry(){ document.getElementById('growth-add-form').style.display='none'; }

async function importGrowthCSV(input){
  const file = input.files[0];
  if(!file) return;
  input.value = '';
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length){ alert('CSV is empty'); return; }

  // Skip header row if first cell isn't a plausible suburb name (contains non-numeric alpha)
  const STATES = ['QLD','NSW','VIC','SA','WA','TAS','NT','ACT'];
  let rows = lines.map(l => l.split(',').map(c=>c.trim().replace(/^["']|["']$/g,'')));
  // Detect header: if state column (index 1) isn't a known state, skip first row
  if(rows.length > 1 && rows[0][1] && !STATES.includes(rows[0][1].toUpperCase())){
    rows = rows.slice(1);
  }

  const valid = rows.filter(r => r[0] && r[1] && !isNaN(parseFloat(r[2])));
  if(!valid.length){ alert('No valid rows found.\nExpected format: suburb,state,rate,note'); return; }

  const statusEl = document.getElementById('growth-loading');
  if(statusEl){ statusEl.style.display='block'; statusEl.textContent = `Importing ${valid.length} entries…`; }

  let ok=0, fail=0;
  for(const r of valid){
    const suburb = r[0], state = r[1].toUpperCase(), rate = parseFloat(r[2]), note = r[3]||'csv import';
    const d = await callGrowth({action:'set', suburb, state, rate, note});
    if(d.ok) ok++; else fail++;
  }

  if(statusEl) statusEl.style.display='none';
  alert(`Import complete: ${ok} saved, ${fail} failed.`);
  loadGrowthData();
}

async function saveGrowthEntry(){
  const suburb = document.getElementById('growth-add-suburb').value.trim();
  const state  = document.getElementById('growth-add-state').value;
  const rate   = parseFloat(document.getElementById('growth-add-rate').value);
  const note   = document.getElementById('growth-add-note').value.trim() || 'admin entry';
  if(!suburb || isNaN(rate)){ alert('Suburb and rate are required'); return; }
  const d = await callGrowth({action:'set', suburb, state, rate, note});
  if(d.ok){
    hideAddGrowthEntry();
    document.getElementById('growth-add-suburb').value='';
    document.getElementById('growth-add-rate').value='';
    document.getElementById('growth-add-note').value='';
    loadGrowthData();
  } else {
    alert('Failed: '+(d.error||'Unknown error'));
  }
}

async function deleteGrowthEntry(suburb, state){
  if(!confirm(`Delete growth data for ${suburb}, ${state}?`)) return;
  const d = await callGrowth({action:'delete', suburb, state});
  if(d.ok) loadGrowthData();
  else alert('Failed: '+(d.error||'Unknown error'));
}

// ── Client Error Log ─────────────────────────────────────────────────────────
async function callClientErrors(payload){
  const sess = getSession();
  const token = sess && sess.token;
  try {
    const r = await fetch('/.netlify/functions/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') },
      body: JSON.stringify(payload)
    });
    return r.json();
  } catch(e) {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
}

let _allClientErrors = [];

function parseBrowser(ua){
  if(!ua) return '—';
  if(/Edg\//.test(ua))     return 'Edge '    +(ua.match(/Edg\/([\d.]+)/)||[])[1];
  if(/Firefox\//.test(ua)) return 'Firefox ' +(ua.match(/Firefox\/([\d.]+)/)||[])[1];
  if(/Chrome\//.test(ua))  return 'Chrome '  +(ua.match(/Chrome\/([\d.]+)/)||[])[1];
  if(/Safari\//.test(ua))  return 'Safari '  +(ua.match(/Version\/([\d.]+)/)||[])[1];
  return ua.slice(0,30);
}

function renderClientErrors(errors){
  const wrap = document.getElementById('client-errors-wrap');
  const existingTbody = document.getElementById('ce-tbody');
  if(!errors.length){
    if(existingTbody){
      // Filters are already rendered — just show empty state inside the table
      existingTbody.innerHTML = `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--slate);font-size:13px;">No errors match the current filters.</td></tr>`;
      const countEl = document.getElementById('ce-count');
      if(countEl) countEl.textContent = `0 of ${_allClientErrors.length} error${_allClientErrors.length!==1?'s':''}`;
    } else {
      wrap.innerHTML = '<div style="padding:16px;color:var(--slate);font-size:13px;">No errors match the current filters.</div>';
    }
    return;
  }
  const SEV_STYLE = {
    error:   { badge: 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;', border: 'border-left:3px solid #f87171;' },
    warning: { badge: 'background:#fef9c3;color:#854d0e;border:1px solid #fde047;', border: 'border-left:3px solid #facc15;' },
    info:    { badge: 'background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;', border: 'border-left:3px solid #60a5fa;' },
  };
  const rows = errors.map(e => {
    const sev     = SEV_STYLE[e.severity] || SEV_STYLE.error;
    const sevLabel = e.severity || 'error';
    const time    = e.at ? new Date(e.at).toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
    const browser = parseBrowser(e.userAgent||'');
    const rawSrc  = e.source || '';
    const srcPath = rawSrc ? rawSrc.replace(/^https?:\/\/[^/]+/,'') : '';
    const pageUrl = e.url || '';
    const pagePath = pageUrl ? pageUrl.replace(/^https?:\/\/[^/]+/,'').split('?')[0] : '';
    const isInline = srcPath && pagePath && (srcPath === pagePath || srcPath.endsWith(pagePath));
    const srcLabel = isInline ? `[inline] ${escHtml(srcPath)}` : (srcPath ? escHtml(srcPath) : '');
    const src     = [srcLabel, e.line ? `line ${e.line}` : '', e.col ? `col ${e.col}` : ''].filter(Boolean).join(' · ');
    const page    = pageUrl ? escHtml(pagePath.slice(0,60)) : '';
    const user    = e.userEmail ? escHtml(e.userEmail) : (e.userName ? escHtml(e.userName) : '<span style="color:rgba(245,240,232,0.5)">guest</span>');
    const stack   = e.stack ? `<details style="margin-top:4px;"><summary style="font-size:10px;color:var(--slate);cursor:pointer;">Stack trace</summary><pre style="font-size:10px;white-space:pre-wrap;word-break:break-all;color:var(--slate);margin:4px 0 0;line-height:1.4;background:rgba(28,28,30,0.04);padding:6px;border-radius:3px;">${escHtml(e.stack.slice(0,800))}</pre></details>` : '';
    return `<tr style="border-bottom:1px solid rgba(28,28,30,0.07);${sev.border}">
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--slate);white-space:nowrap;vertical-align:top;padding:10px 8px 10px 6px;">${time}</td>
      <td style="vertical-align:top;padding:10px 8px;max-width:340px;">
        <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;${sev.badge}">${sevLabel}</span>
          <span style="font-size:12px;font-weight:600;color:var(--charcoal);">${escHtml(e.message||'')}</span>
        </div>
        ${src ? `<div style="font-family:var(--font-mono);font-size:10px;color:#C9A84C;margin-top:2px;">${src}</div>` : ''}
        ${page ? `<div style="font-size:10px;color:var(--slate);font-family:var(--font-mono);margin-top:1px;">${page}</div>` : ''}
        ${stack}
      </td>
      <td style="vertical-align:top;padding:10px 8px;font-size:11px;white-space:nowrap;color:var(--charcoal);">${user}</td>
      <td style="vertical-align:top;padding:10px 8px;font-family:var(--font-mono);font-size:10px;color:var(--slate);white-space:nowrap;">${escHtml(browser)}</td>
    </tr>`;
  }).join('');

  const countEl = document.getElementById('ce-count');
  if(countEl) countEl.textContent = `${errors.length} of ${_allClientErrors.length} error${_allClientErrors.length!==1?'s':''}`;

  const tbody = document.getElementById('ce-tbody');
  if(tbody){ tbody.innerHTML = rows; return; }

  wrap.innerHTML = `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
    <input id="ce-filter-msg"  class="config-input" placeholder="Search message…"  style="width:180px;font-size:11px;padding:6px 10px;">
    <input id="ce-filter-user" class="config-input" placeholder="User email/name…" style="width:160px;font-size:11px;padding:6px 10px;">
    <select id="ce-filter-severity" class="config-input" style="width:120px;font-size:11px;padding:6px 10px;">
      <option value="">All levels</option>
      <option value="error">🔴 Error</option>
      <option value="warning">🟡 Warning</option>
      <option value="info">🔵 Info</option>
    </select>
    <select id="ce-filter-browser" class="config-input" style="width:130px;font-size:11px;padding:6px 10px;">
      <option value="">All browsers</option>
      <option value="Firefox">Firefox</option>
      <option value="Chrome">Chrome</option>
      <option value="Safari">Safari</option>
      <option value="Edge">Edge</option>
    </select>
    <select id="ce-filter-time" class="config-input" style="width:130px;font-size:11px;padding:6px 10px;">
      <option value="">All time</option>
      <option value="1h">Last hour</option>
      <option value="24h">Last 24 hours</option>
      <option value="7d">Last 7 days</option>
    </select>
    <span id="ce-count" style="font-size:11px;color:var(--slate);margin-left:4px;"></span>
  </div>
  <div style="overflow-x:auto;border-radius:6px;border:1px solid rgba(28,28,30,0.1);">
  <table style="width:100%;border-collapse:collapse;min-width:600px;background:white;">
    <thead><tr style="background:rgba(28,28,30,0.04);">
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 8px 8px 0;border-bottom:1px solid rgba(28,28,30,0.1);white-space:nowrap;">Time</th>
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 8px 8px;border-bottom:1px solid rgba(28,28,30,0.1);">Error</th>
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 8px 8px;border-bottom:1px solid rgba(28,28,30,0.1);">User</th>
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 8px 8px;border-bottom:1px solid rgba(28,28,30,0.1);">Browser</th>
    </tr></thead>
    <tbody id="ce-tbody">${rows}</tbody>
  </table></div>`;
  // Wire filter inputs after initial render (IDs are now in DOM)
  ['ce-filter-msg','ce-filter-user'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', filterClientErrors);
  });
  ['ce-filter-severity','ce-filter-browser','ce-filter-time'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('change', filterClientErrors);
  });

  if(countEl) countEl.textContent = `${errors.length} of ${_allClientErrors.length} error${_allClientErrors.length!==1?'s':''}`;
  // set count after re-render
  const ce = document.getElementById('ce-count');
  if(ce) ce.textContent = `${errors.length} of ${_allClientErrors.length} error${_allClientErrors.length!==1?'s':''}`;
}

function filterClientErrors(){
  const msg      = (document.getElementById('ce-filter-msg')||{}).value||'';
  const user     = (document.getElementById('ce-filter-user')||{}).value||'';
  const severity = (document.getElementById('ce-filter-severity')||{}).value||'';
  const browser  = (document.getElementById('ce-filter-browser')||{}).value||'';
  const time     = (document.getElementById('ce-filter-time')||{}).value||'';
  const now      = Date.now();
  const cutoffs  = {'1h':3600000,'24h':86400000,'7d':604800000};

  let filtered = _allClientErrors;
  if(msg)      filtered = filtered.filter(e => (e.message||'').toLowerCase().includes(msg.toLowerCase()));
  if(user)     filtered = filtered.filter(e => ((e.userEmail||'')+(e.userName||'')).toLowerCase().includes(user.toLowerCase()));
  if(severity) filtered = filtered.filter(e => (e.severity||'error') === severity);
  if(browser)  filtered = filtered.filter(e => parseBrowser(e.userAgent||'').startsWith(browser));
  if(time && cutoffs[time]) filtered = filtered.filter(e => e.at && (now - e.at) <= cutoffs[time]);

  renderClientErrors(filtered);
}

async function loadClientErrors(){
  const wrap = document.getElementById('client-errors-wrap');
  const loading = document.getElementById('client-errors-loading');
  const refreshBtn = document.getElementById('ce-refresh-btn');
  if(loading){ loading.style.display='block'; loading.textContent='Loading…'; }
  if(refreshBtn){ refreshBtn.disabled=true; refreshBtn.textContent='↻ Refreshing…'; }
  const d = await callClientErrors({action:'adminGetClientErrors'});
  if(loading) loading.style.display='none';
  if(refreshBtn){ refreshBtn.disabled=false; refreshBtn.textContent='↻ Refresh'; }
  if(!d.ok){
    wrap.innerHTML = `<div style="padding:16px;color:#c45a5a;font-size:13px;">Error: ${escHtml(d.error||'Failed to load')}</div>`;
    return;
  }
  _allClientErrors = d.errors || [];
  if(!_allClientErrors.length){
    wrap.innerHTML = '<div style="padding:16px;color:var(--slate);font-size:13px;">No errors logged yet.</div>';
    return;
  }
  renderClientErrors(_allClientErrors);
}

async function syncErrorsToGitHub(){
  var btn = document.getElementById('ce-sync-btn');
  if(btn){ btn.disabled=true; btn.textContent='Syncing…'; }
  try{
    var d = await callClientErrors({action:'syncErrorsToGitHub'});
    if(d.ok){
      showAdminToast(d.message||'Errors synced to GitHub');
    } else {
      showAdminToast(d.error||'Sync failed', true);
    }
  }catch(e){
    showAdminToast('Sync failed: '+e.message, true);
  }
  if(btn){ btn.disabled=false; btn.textContent='⬆ Sync to GitHub'; }
}

async function clearClientErrors(){
  if(!confirm('Clear all logged client errors?')) return;
  const d = await callClientErrors({action:'adminClearClientErrors'});
  if(d.ok){ _allClientErrors=[]; loadClientErrors(); }
  else alert('Failed: '+(d.error||'Unknown error'));
}

// ── User Event History ────────────────────────────────────────────────────────
const EVENT_LABELS = {
  signup:               '🆕 Signed up',
  email_verified:       '✅ Email verified',
  signin:               '🔐 Signed in',
  password_changed:     '🔑 Password changed',
  password_reset:       '🔁 Password reset (self-service)',
  admin_password_reset: '🔧 Password reset by admin',
  plan_upgraded:        '⬆️ Plan upgraded',
  plan_downgraded:      '⬇️ Plan downgraded',
  role_changed:         '👤 Role changed',
};

function fmtEventTime(at){
  if(!at) return '—';
  try{ return new Date(at).toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(e){ return String(at); }
}

async function openUserHistory(userId, email){
  const overlay = document.getElementById('history-modal-overlay');
  const body    = document.getElementById('history-modal-body');
  const emailEl = document.getElementById('history-modal-email');
  overlay.style.display = 'flex';
  emailEl.textContent = email;
  document.getElementById('history-back-btn').style.display = _detailReturnEmail ? '' : 'none';
  body.innerHTML = '<div style="text-align:center;color:var(--slate);padding:32px;font-size:13px;">Loading…</div>';

  const d = await callAuth('adminGetUserEvents', { targetUserId: userId });
  if(!d.ok){
    body.innerHTML = `<div style="color:#c45a5a;font-size:13px;padding:16px;">Error: ${escHtml(d.error||'Failed to load')}</div>`;
    return;
  }
  const events = d.events || [];
  if(!events.length){
    body.innerHTML = '<div style="color:var(--slate);font-size:13px;padding:16px;">No events recorded yet. Events will be logged going forward.</div>';
    return;
  }

  const rows = events.map(ev => {
    const label = EVENT_LABELS[ev.type] || escHtml(ev.type);
    const meta = [];
    if(ev.plan)  meta.push('Plan: '+escHtml(ev.plan));
    if(ev.from && ev.to) meta.push(escHtml(ev.from)+' → '+escHtml(ev.to));
    if(ev.ip)    meta.push('IP: '+escHtml(ev.ip));
    if(ev.by)    meta.push('By: '+escHtml(ev.by));
    return `<tr style="border-bottom:1px solid rgba(28,28,30,0.07);">
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--slate);white-space:nowrap;padding:8px 8px 8px 0;vertical-align:top;">${fmtEventTime(ev.at)}</td>
      <td style="font-size:12px;color:var(--charcoal);padding:8px;vertical-align:top;">${label}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--slate);padding:8px 0 8px 8px;vertical-align:top;">${meta.join(' · ')}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 8px 8px 0;border-bottom:1px solid rgba(28,28,30,0.1);">Time</th>
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 8px 8px;border-bottom:1px solid rgba(28,28,30,0.1);">Event</th>
      <th style="text-align:left;font-size:11px;color:var(--slate);padding:4px 0 8px 8px;border-bottom:1px solid rgba(28,28,30,0.1);">Details</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function closeHistoryModal(){
  document.getElementById('history-modal-overlay').style.display = 'none';
}

// ── Email Templates ──────────────────────────────────────────────────────────
let _emailTemplates = {};

function formatHtml(html){
  if(!html) return '';
  // Simple HTML pretty-printer: add newlines and indentation
  const INLINE = /^(a|abbr|b|bdi|bdo|br|cite|code|data|dfn|em|i|kbd|mark|q|rp|rt|ruby|s|samp|small|span|strong|sub|sup|time|u|var|wbr)$/i;
  let out = '';
  let indent = 0;
  // Normalise: collapse whitespace between tags
  html = html.replace(/>\s+</g,'><').trim();
  const parts = html.split(/(<[^>]+>)/);
  parts.forEach(function(p){
    if(!p) return;
    if(p[0] !== '<'){ out += p; return; }
    const isClose  = p[1] === '/';
    const isSelf   = /\/>$/.test(p) || /^<(br|hr|img|input|link|meta|col|area|base|embed|param|source|track)[\s>]/i.test(p);
    const tagName  = (p.match(/<\/?([a-z0-9]+)/i)||[])[1]||'';
    const isInline = INLINE.test(tagName);
    if(isClose && !isInline){ indent = Math.max(0, indent - 2); }
    if(!isInline){ out += (out ? '\n' : '') + ' '.repeat(indent); }
    out += p;
    if(!isClose && !isSelf && !isInline){ indent += 2; }
  });
  return out;
}

const ET_VARS = {
  verification:  '{{code}}',
  welcome:       '{{firstName}}, {{name}}',
  password_reset:'{{code}}',
  subscription:  '{{firstName}}, {{name}}, {{plan}}',
  security_alert:'{{firstName}}, {{name}}, {{event}}',
  promotional:   '{{firstName}}, {{name}}',
};

async function loadEmailTemplates(){
  const d = await callAuth('adminGetEmailTemplates');
  if(!d.ok){ console.warn('Failed to load email templates'); return; }
  _emailTemplates = d.templates || {};
  onEmailTemplateTypeChange();
}

function onEmailTemplateTypeChange(){
  const type = (document.getElementById('et-type-select')||{}).value;
  if(!type) return;
  const tpl = _emailTemplates[type] || {};
  const subj = document.getElementById('et-subject');
  const html = document.getElementById('et-html');
  const vars = document.getElementById('et-vars');
  const badge = document.getElementById('et-custom-badge');
  if(subj) subj.value = tpl.subject || '';
  if(html) html.value = formatHtml(tpl.html || '');
  if(vars) vars.textContent = ET_VARS[type] || '';
  if(badge) badge.style.display = tpl._isCustom ? '' : 'none';
}

async function saveEmailTemplate(){
  const type    = (document.getElementById('et-type-select')||{}).value;
  const subject = (document.getElementById('et-subject')||{}).value||'';
  const html    = (document.getElementById('et-html')||{}).value||'';
  const st = document.getElementById('et-status');
  if(!subject||!html){ if(st){st.className='admin-status error';st.textContent='Subject and HTML are required.';} return; }
  if(st){st.className='admin-status';st.textContent='Saving…';}
  const d = await callAuth('adminSetEmailTemplate', {type, subject, html});
  if(d.ok){
    if(st){st.className='admin-status success';st.textContent='✓ Template saved';}
    if(_emailTemplates[type]){ _emailTemplates[type].subject=subject; _emailTemplates[type].html=html; _emailTemplates[type]._isCustom=true; }
    const badge = document.getElementById('et-custom-badge');
    if(badge) badge.style.display='';
    setTimeout(()=>{ if(st) st.className='admin-status'; },3000);
  } else {
    if(st){st.className='admin-status error';st.textContent='Error: '+(d.error||'Failed to save');}
  }
}

async function resetEmailTemplate(){
  const type = (document.getElementById('et-type-select')||{}).value;
  if(!type) return;
  const confirmed = await customConfirm('Reset template?', 'This will remove your custom template and revert to the built-in default.', {danger:true, confirmLabel:'Reset'});
  if(!confirmed) return;
  const d = await callAuth('adminResetEmailTemplate', {type});
  if(d.ok){
    if(_emailTemplates[type]){ _emailTemplates[type]={...d.template,_isCustom:false}; }
    onEmailTemplateTypeChange();
    const st = document.getElementById('et-status');
    if(st){st.className='admin-status success';st.textContent='✓ Reset to default';setTimeout(()=>{st.className='admin-status';},3000);}
  }
}

function previewEmailTemplate(){
  const html    = (document.getElementById('et-html')||{}).value||'';
  const subject = (document.getElementById('et-subject')||{}).value||'(no subject)';
  const sampleVars = { code:'123456', firstName:'Jamie', name:'Jamie Smith', plan:'Pro', event:'Password changed' };
  const fill = s => s.replace(/\{\{(\w+)\}\}/g, (m,k) => sampleVars[k]||m);
  const filledHtml = fill(html);
  const filledSubj = fill(subject);
  const overlay = document.getElementById('email-preview-overlay');
  const frame   = document.getElementById('email-preview-frame');
  const subjEl  = document.getElementById('email-preview-subject');
  if(!overlay || !frame) return;
  if(subjEl) subjEl.textContent = filledSubj;
  frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    +'<style>body{margin:0;padding:20px;background:#eeeeee;font-family:system-ui,sans-serif;}</style></head>'
    +'<body>'+filledHtml+'</body></html>';
  overlay.style.display = 'flex';
}

function closeEmailPreview(){
  const overlay = document.getElementById('email-preview-overlay');
  if(overlay) overlay.style.display = 'none';
}

async function sendTestEmail(){
  const type    = (document.getElementById('et-type-select')||{}).value;
  const subject = (document.getElementById('et-subject')||{}).value||'';
  const html    = (document.getElementById('et-html')||{}).value||'';
  const st = document.getElementById('et-status');
  const btn = document.getElementById('et-test-btn');
  if(!subject||!html){ if(st){st.className='admin-status error';st.textContent='Subject and HTML are required.';} return; }
  if(st){st.className='admin-status';st.textContent='Sending test email…';}
  if(btn){ btn.disabled=true; btn.textContent='Sending…'; }
  const d = await callAuth('adminSendTestEmail', {type, subject, html});
  if(btn){ btn.disabled=false; btn.textContent='Send Test Email'; }
  if(d.ok){
    if(st){st.className='admin-status success';st.textContent='✓ Test email sent to '+(d.sentTo||'your email');}
    setTimeout(()=>{ if(st) st.className='admin-status'; },4000);
  } else {
    if(st){st.className='admin-status error';st.textContent='Error: '+(d.error||'Failed to send');}
  }
}

// ── About Page Editor ─────────────────────────────────────────────────────
const ABOUT_PAGE_KEY = 'propCalc_aboutPage_v1';

const DEFAULT_ABOUT = {
  heroH1: 'Built by buyers,<br>for buyers.',
  heroLead: 'We got frustrated trying to understand the Shared Equity Scheme using government PDFs and a spreadsheet. So we built the tool we wished existed.',
  storyH2: 'The spreadsheet that became an app.',
  storyP1: 'In 2023, trying to figure out whether the Queensland Shared Equity Scheme actually made sense for our budget, we built a spreadsheet. It had 14 tabs, nested formulas, and still couldn\u0027t tell us what we owed the government in year 10.'
};

async function loadAboutPage(){
  const st = document.getElementById('about-page-status');
  st.textContent = 'Loading…'; st.className = 'admin-status info';

  const d = await callAuth('adminGetAboutPage');
  let aboutData = DEFAULT_ABOUT;

  if(d.ok && d.about){
    aboutData = d.about;
  }

  setV('about-hero-h1', aboutData.heroH1);
  setV('about-hero-lead', aboutData.heroLead);
  setV('about-story-h2', aboutData.storyH2);
  setV('about-story-p1', aboutData.storyP1);

  // Cache locally
  try { localStorage.setItem(ABOUT_PAGE_KEY, JSON.stringify(aboutData)); } catch(e){}

  st.textContent = '';
  st.className = 'admin-status';
}

async function saveAboutPage(){
  const st = document.getElementById('about-page-status');
  st.textContent = 'Saving…'; st.className = 'admin-status info';

  const aboutData = {
    heroH1: getV('about-hero-h1', ''),
    heroLead: getV('about-hero-lead', ''),
    storyH2: getV('about-story-h2', ''),
    storyP1: getV('about-story-p1', '')
  };

  const d = await callAuth('adminSetAboutPage', { about: aboutData });

  if(d.ok){
    try { localStorage.setItem(ABOUT_PAGE_KEY, JSON.stringify(aboutData)); } catch(e){}
    st.textContent = '✓ Changes saved'; st.className = 'admin-status success';
    setTimeout(()=>{ st.textContent = ''; st.className = 'admin-status'; }, 3000);
  } else {
    st.textContent = 'Error: ' + (d.error || 'Failed to save'); st.className = 'admin-status error';
  }
}

async function resetAboutPage(){
  const ok = await customConfirm('Reset about page?', 'This will restore the default content. Your custom changes will be lost.', { danger: true });
  if(!ok) return;

  const d = await callAuth('adminSetAboutPage', { about: DEFAULT_ABOUT });
  const st = document.getElementById('about-page-status');

  if(d.ok){
    try { localStorage.setItem(ABOUT_PAGE_KEY, JSON.stringify(DEFAULT_ABOUT)); } catch(e){}
    setV('about-hero-h1', DEFAULT_ABOUT.heroH1);
    setV('about-hero-lead', DEFAULT_ABOUT.heroLead);
    setV('about-story-h2', DEFAULT_ABOUT.storyH2);
    setV('about-story-p1', DEFAULT_ABOUT.storyP1);
    st.textContent = '✓ Reset to defaults'; st.className = 'admin-status success';
    setTimeout(()=>{ st.textContent = ''; st.className = 'admin-status'; }, 3000);
  } else {
    st.textContent = 'Error: ' + (d.error || 'Failed to reset'); st.className = 'admin-status error';
  }
}

// ── Legal Pages Editor ─────────────────────────────────────────────────────
const LEGAL_PAGES_KEY = 'propCalc_legalPages_v1';
const LEGAL_PAGES = ['privacy', 'terms', 'disclaimer', 'cookies'];

const DEFAULT_LEGAL_PAGES = {
  privacy: `---
title: Privacy Policy
date: 2026-03-08
tag: Legal
---

> **Summary:** We collect only what we need, never sell your data, and you can request deletion anytime.

## 1. Who we are

[COMPANY NAME] operates equitysight.app. This Privacy Policy explains how we collect and protect your information.

## 2. Information we collect

- Account information (name, email)
- Property scenarios you enter
- Device and usage data

## 3. How we use your information

We use your information to:
- Provide and operate the service
- Keep your account secure
- Respond to support requests
- Improve features based on usage

## 4. Data protection

Your data is protected with encryption and stored securely.

## 5. Your rights

You can request a copy of your data or deletion of your account at any time.
`,

  terms: `---
title: Terms of Service
date: 2026-03-08
tag: Legal
---

> **Summary:** EquitySight is provided as-is. Use it to model scenarios, not as financial advice.

## 1. Acceptance of terms

By using EquitySight, you agree to these terms.

## 2. Use license

You may use this service for personal, non-commercial property planning only.

## 3. Disclaimer

EquitySight is a calculator, not financial advice. Always consult a licensed adviser before major decisions.

## 4. Limitation of liability

We are not liable for indirect damages or loss of data.

## 5. Changes to terms

We may update these terms at any time.
`,

  disclaimer: `---
title: Disclaimer
date: 2026-03-08
tag: Legal
---

> ⚠ **Important:** EquitySight is a property finance calculator, not financial advice.

## What this tool does

EquitySight helps you model property investment scenarios and understand long-term costs.

## What this tool does NOT do

- Provide licensed financial advice
- Guarantee accuracy of government scheme details
- Replace consultation with professionals

## Important limitations

- Property values and growth are estimates
- Market conditions change frequently
- Tax and legal rules vary by jurisdiction
- Shared equity schemes have complex eligibility rules

## Always consult professionals

Before making any property decision, consult:
- A licensed financial adviser
- Your bank or mortgage broker
- A tax professional
- A lawyer (for legal matters)

Your decisions are your responsibility.
`,

  cookies: `---
title: Cookies Policy
date: 2026-03-08
tag: Legal
---

> **Summary:** We use minimal cookies. Your session is stored locally on your device.

## What are cookies?

Cookies are small text files stored on your device.

## How we use cookies

We use:
- Session tokens (30-day expiry, stored in localStorage)
- Theme preference (light/dark mode)
- No tracking cookies

## Third-party services

We use Stripe (payments) and Resend (email). They have their own privacy policies.

## Disabling cookies

Most browsers let you disable cookies in settings. You can still use EquitySight without cookies.

## Questions?

If you have questions about our privacy practices, contact us via the support form on the site.
`
};

async function loadLegalPagesList(){
  const st = document.getElementById('legal-page-status');
  st.textContent = 'Loading…'; st.className = 'admin-status info';

  const page = document.getElementById('legal-page-select').value || 'privacy';
  await loadLegalPage(page);
}

async function loadLegalPage(page){
  if(!LEGAL_PAGES.includes(page)) page = 'privacy';
  document.getElementById('legal-page-select').value = page;

  const st = document.getElementById('legal-page-status');
  st.textContent = 'Loading…'; st.className = 'admin-status info';

  const d = await callAuth('adminGetLegalPage', {page});

  let content = null;
  let source = 'default';

  if(d.ok && d.content){
    // Use Redis-stored version (previously edited by admin)
    content = d.content;
    source = 'saved';
  } else {
    // No Redis version yet — load the actual .md file from root
    try {
      const r = await fetch(`/${page}.md?_=${Date.now()}`);
      if(r.ok) {
        content = await r.text();
        source = 'file';
      } else {
        console.warn(`Failed to fetch ${page}.md: ${r.status}`);
      }
    } catch(e){
      console.warn(`Error fetching ${page}.md:`, e);
    }
    if(!content) {
      content = DEFAULT_LEGAL_PAGES[page] || '';
      source = 'default';
    }
  }

  const editor = document.getElementById('legal-content-editor');
  editor.value = content;

  if(source === 'saved') st.textContent = '(loaded from saved version in Redis)';
  else if(source === 'file') st.textContent = '✓ Loaded from current .md file';
  else st.textContent = '⚠ Using default template (run "Reload from .md" to sync the file)';

  st.className = source === 'file' ? 'admin-status success' : (source === 'default' ? 'admin-status warning' : 'admin-status info');
  setTimeout(()=>{ st.textContent = ''; st.className = 'admin-status'; }, 3000);
}

async function saveLegalPage(){
  const page = document.getElementById('legal-page-select').value || 'privacy';
  const content = document.getElementById('legal-content-editor').value;
  const st = document.getElementById('legal-page-status');

  st.textContent = 'Saving…'; st.className = 'admin-status info';

  const d = await callAuth('adminSetLegalPage', {page, content});

  if(d.ok){
    try {
      const pages = JSON.parse(localStorage.getItem(LEGAL_PAGES_KEY) || '{}');
      pages[page] = content;
      localStorage.setItem(LEGAL_PAGES_KEY, JSON.stringify(pages));
    } catch(e){}
    st.textContent = '✓ Saved. Page will update on next visit.'; st.className = 'admin-status success';
    setTimeout(()=>{ st.textContent = ''; st.className = 'admin-status'; }, 3000);
  } else {
    st.textContent = 'Error: ' + (d.error || 'Failed to save'); st.className = 'admin-status error';
  }
}

async function resetLegalPage(){
  const page = document.getElementById('legal-page-select').value || 'privacy';
  const ok = await customConfirm('Reset to default?', `This will restore the default ${page} page content.`, {danger: true});
  if(!ok) return;

  const d = await callAuth('adminResetLegalPage', {page});
  const st = document.getElementById('legal-page-status');

  if(d.ok){
    const content = DEFAULT_LEGAL_PAGES[page];
    document.getElementById('legal-content-editor').value = content;
    try {
      const pages = JSON.parse(localStorage.getItem(LEGAL_PAGES_KEY) || '{}');
      pages[page] = content;
      localStorage.setItem(LEGAL_PAGES_KEY, JSON.stringify(pages));
    } catch(e){}
    st.textContent = '✓ Reset to defaults'; st.className = 'admin-status success';
    setTimeout(()=>{ st.textContent = ''; st.className = 'admin-status'; }, 3000);
  } else {
    st.textContent = 'Error: ' + (d.error || 'Failed to reset'); st.className = 'admin-status error';
  }
}

async function reloadLegalFromFile(){
  const page = document.getElementById('legal-page-select').value || 'privacy';
  const st = document.getElementById('legal-page-status');

  st.textContent = 'Fetching current .md file…'; st.className = 'admin-status info';

  try {
    const timestamp = Date.now();
    const url = `/${page}.md?t=${timestamp}`;
    console.log(`Fetching legal page from: ${url}`);

    const r = await fetch(url);
    if(!r.ok) throw new Error(`HTTP ${r.status}: Could not fetch ${page}.md from server`);

    const content = await r.text();
    if(!content || content.trim().length === 0) {
      throw new Error(`${page}.md file is empty or missing`);
    }

    document.getElementById('legal-content-editor').value = content;
    st.textContent = `✓ Loaded ${page}.md (${Math.round(content.length / 1024)}KB). Click "Save & Update" to import into Redis.`;
    st.className = 'admin-status success';
    setTimeout(()=>{ st.textContent = ''; st.className = 'admin-status'; }, 4000);
    console.log(`Successfully loaded ${page}.md: ${content.length} bytes`);
  } catch(e) {
    console.error(`Error loading ${page}.md:`, e);
    st.textContent = `Error: ${e.message} — Check console for details. Make sure ${page}.md exists in the root directory.`;
    st.className = 'admin-status error';
  }
}

function previewLegalPage(){
  const content = document.getElementById('legal-content-editor').value;
  const overlay = document.getElementById('legal-preview-overlay');
  const titleEl = document.getElementById('legal-preview-title');
  const bodyEl = document.getElementById('legal-preview-body');

  // Simple frontmatter parser
  let title = 'Legal Page';
  let body = content;
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if(fmMatch){
    const fm = {};
    fmMatch[1].split('\n').forEach(line=>{
      const [k,v] = line.split(':');
      if(k) fm[k.trim()] = v.trim();
    });
    title = fm.title || 'Legal Page';
    body = fmMatch[2];
  }

  titleEl.textContent = title;

  // Basic markdown preview (just render as HTML-safe text with line breaks)
  const preview = body.split('\n').map(line=>{
    if(/^## /.test(line)) return '<h2 style="margin:20px 0 12px;font-size:18px;font-weight:600;">' + line.slice(3) + '</h2>';
    if(/^### /.test(line)) return '<h3 style="margin:16px 0 8px;font-size:15px;font-weight:600;">' + line.slice(4) + '</h3>';
    if(/^> /.test(line)) return '<div style="background:#F9F5ED;border-left:3px solid #C9A84C;padding:12px 16px;margin:12px 0;border-radius:0 4px 4px 0;">' + line.slice(2) + '</div>';
    if(/^- /.test(line)) return '<li style="margin-left:20px;">' + line.slice(2) + '</li>';
    if(line.trim() === '') return '<br>';
    return '<p style="margin:8px 0;">' + line + '</p>';
  }).join('');

  bodyEl.innerHTML = preview;
  overlay.style.display = 'flex';
}

// -- SUBURBS TAB --

var _suburbsData = null; // cached suburb data from suburbs.json
var _suburbsFilteredState = null;

async function loadSuburbsTab() {
  // Load suburbs.json if not cached
  if (!_suburbsData) {
    try {
      const resp = await fetch('/data/suburbs.json');
      _suburbsData = await resp.json();
    } catch (e) {
      document.getElementById('suburbs-loading').textContent = 'Failed to load suburbs data: ' + e.message;
      return;
    }
  }

  const data = _suburbsData;
  const total = data.length;
  const withPC = data.filter(s => s.postcode).length;

  document.getElementById('suburbs-total').textContent = total.toLocaleString();
  document.getElementById('suburbs-with-pc').textContent = withPC.toLocaleString() + ' (' + Math.round(100 * withPC / total) + '%)';

  // Load last build time from config
  try {
    const cfg = await callAuth('adminGetConfig');
    if (cfg && cfg.config && cfg.config.suburbLastBuild) {
      var d = new Date(cfg.config.suburbLastBuild);
      document.getElementById('suburbs-last-build').textContent = d.toLocaleDateString('en-AU') + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }
    if (cfg && cfg.config && cfg.config.suburbDeployHook) {
      document.getElementById('suburbs-deploy-hook').value = cfg.config.suburbDeployHook;
      showSuburbHookSaved(cfg.config.suburbDeployHook);
    }
  } catch (e) { /* ignore */ }

  // State breakdown
  var states = {};
  for (var i = 0; i < data.length; i++) {
    var st = data[i].state;
    states[st] = (states[st] || 0) + 1;
  }
  var breakdownHTML = '';
  var stateKeys = Object.keys(states).sort();
  for (var j = 0; j < stateKeys.length; j++) {
    var sk = stateKeys[j];
    breakdownHTML += '<button class="btn-admin-outline" data-action="filter-state" data-state="' + escHtml(sk) + '" style="font-size:11px;padding:8px 12px;text-align:left;">' +
      '<div style="font-weight:600;">' + escHtml(sk) + '</div>' +
      '<div style="font-size:10px;color:var(--slate);">' + states[sk].toLocaleString() + ' suburbs</div>' +
      '</button>';
  }
  document.getElementById('suburbs-state-breakdown').innerHTML = breakdownHTML;
}

function filterSuburbsByState(state) {
  _suburbsFilteredState = state;
  document.getElementById('suburbs-admin-search').value = '';
  renderSuburbTable(_suburbsData.filter(function(s) { return s.state === state; }).slice(0, 200), state);
}

function searchAdminSuburbs() {
  var q = (document.getElementById('suburbs-admin-search').value || '').trim().toLowerCase();
  if (q.length < 2) {
    if (_suburbsFilteredState) {
      renderSuburbTable(_suburbsData.filter(function(s) { return s.state === _suburbsFilteredState; }).slice(0, 200), _suburbsFilteredState);
    } else {
      document.getElementById('suburbs-table-wrap').innerHTML = '<div style="padding:24px;text-align:center;color:var(--slate);font-size:13px;">Type at least 2 characters to search</div>';
    }
    return;
  }
  var results = _suburbsData.filter(function(s) {
    return s.suburb.toLowerCase().indexOf(q) >= 0 || (s.postcode && s.postcode.indexOf(q) >= 0);
  });
  renderSuburbTable(results.slice(0, 200), null, results.length);
}

function renderSuburbTable(rows, stateLabel, totalMatches) {
  if (!rows || rows.length === 0) {
    document.getElementById('suburbs-table-wrap').innerHTML = '<div style="padding:24px;text-align:center;color:var(--slate);font-size:13px;">No suburbs found</div>';
    return;
  }
  var label = stateLabel ? escHtml(stateLabel) + ' — ' + rows.length + ' shown' : (totalMatches ? totalMatches + ' matches (showing ' + rows.length + ')' : rows.length + ' suburbs');
  var html = '<div style="font-size:10px;color:var(--slate);margin-bottom:8px;font-family:var(--font-mono);">' + label + '</div>';
  html += '<table class="admin-table"><thead><tr><th>Suburb</th><th>State</th><th>Postcode</th><th>Population</th><th>Type</th></tr></thead><tbody>';
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i];
    html += '<tr>' +
      '<td><a href="/suburb/' + s.state.toLowerCase() + '/' + escHtml(s.slug) + '/" target="_blank" style="color:var(--gold);text-decoration:none;">' + escHtml(s.suburb) + ' ↗</a></td>' +
      '<td>' + escHtml(s.state) + '</td>' +
      '<td>' + escHtml(s.postcode || '—') + '</td>' +
      '<td>' + (s.population || 0).toLocaleString() + '</td>' +
      '<td>' + escHtml(s.suburb_type) + '</td>' +
      '</tr>';
  }
  html += '</tbody></table>';
  document.getElementById('suburbs-table-wrap').innerHTML = html;
}

async function saveSuburbDeployHook() {
  var url = (document.getElementById('suburbs-deploy-hook').value || '').trim();
  if (!url) return;
  try {
    var result = await callAuth('adminSetConfig', { config: { suburbDeployHook: url } });
    if (result && result.ok) {
      showAdminToast('Deploy hook saved');
      showSuburbHookSaved(url);
    } else {
      showAdminToast('Save failed: ' + (result && result.error || 'unknown error'), true);
    }
  } catch (e) {
    showAdminToast('Failed to save: ' + e.message, true);
  }
}

function showSuburbHookSaved(url) {
  var masked = url.replace(/\/([^\/]{6})[^\/]*$/, '/\u2026$1');
  document.getElementById('suburbs-hook-display').textContent = masked;
  document.getElementById('suburbs-hook-edit').style.display = 'none';
  document.getElementById('suburbs-hook-saved').style.display = 'flex';
}

function editSuburbDeployHook() {
  document.getElementById('suburbs-hook-saved').style.display = 'none';
  document.getElementById('suburbs-hook-edit').style.display = 'flex';
  document.getElementById('suburbs-deploy-hook').focus();
}

async function triggerSuburbRebuild() {
  var hookUrl = (document.getElementById('suburbs-deploy-hook').value || '').trim();
  if (!hookUrl) {
    showAdminToast('Set a deploy hook URL first (Netlify → Site Configuration → Build hooks)', true);
    return;
  }
  if (!confirm('This will trigger a Netlify deploy that rebuilds all suburb pages. Continue?')) return;
  try {
    // Save hook URL first if not saved yet
    await saveSuburbDeployHook();
    // Trigger via server-side function (avoids CORS)
    var result = await callAuth('triggerSuburbBuild');
    if (result && result.ok) {
      showAdminToast('Suburb rebuild triggered! Deploy will start shortly.');
      document.getElementById('suburbs-last-build').textContent = 'Building now...';
    } else {
      showAdminToast((result && result.error) || 'Failed to trigger rebuild', true);
    }
  } catch (e) {
    showAdminToast('Failed: ' + e.message, true);
  }
}

function showAdminToast(msg, isError) {
  // Simple toast — reuse existing pattern if available, or create one
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;padding:12px 24px;border-radius:8px;font-size:13px;font-family:var(--font-body);color:white;max-width:400px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.3);' +
    (isError ? 'background:#C0392B;' : 'background:#27AE60;');
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 4000);
}

document.addEventListener('DOMContentLoaded', init);

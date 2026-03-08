/**
 * EquitySight.app — Standalone Account Settings Panel
 * Self-injects HTML/CSS and exposes window.openAccountPanel / closeAccountPanel.
 * Included automatically by auth-nav.js on every page except app.html
 * (which has the panel built-in).
 */
(function () {
  if (document.getElementById('ap-panel')) return; // already present

  var SESSION_KEY  = 'propCalc_session_v1';
  var PROFILE_BASE = 'propCalc_profile_v1';
  var AP_COLORS    = ['#C9A84C','#7B9E87','#5B8FAB','#C4704A','#C45A5A','#8B6FAE','#4A9E8A','#B0956E'];

  function getSession()  { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }  catch(e) { return null; } }
  function getProfileKey(){ var s = getSession(); return PROFILE_BASE + '_' + (s && (s.id || s.userId) || 'guest'); }
  function getProfile()  { try { return JSON.parse(localStorage.getItem(getProfileKey())) || {}; } catch(e) { return {}; } }
  function saveProfile(p){ localStorage.setItem(getProfileKey(), JSON.stringify(p)); }
  function getAuthHeader(){ var s = getSession(); return s && s.token ? 'Bearer ' + s.token : null; }
  // Only allow data:image/* (from canvas) or https:// URLs in photo src attributes
  function safePhotoSrc(url) {
    if (!url) return null;
    if (/^data:image\/(jpeg|png|gif|webp);base64,/.test(url)) return url;
    try { var u = new URL(url); return u.protocol === 'https:' ? url : null; } catch(e) { return null; }
  }

  // ── Inject CSS ──────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#ap-overlay{display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);}',
    '#ap-overlay.open{display:block;}',
    '#ap-panel{position:fixed;top:0;right:-480px;width:min(480px,100vw);height:100vh;',
      'background:#F5F3EE;z-index:3001;overflow-y:auto;',
      'transition:right 0.3s cubic-bezier(0.4,0,0.2,1);',
      'box-shadow:-8px 0 40px rgba(0,0,0,0.3);',
      'padding-top:env(safe-area-inset-top,0px);}',
    '#ap-panel.open{right:0;}',
    '.ap2-header{background:#1C1C1E;color:#F5F0E8;padding:16px 20px;',
      'display:flex;align-items:center;justify-content:space-between;',
      'position:sticky;top:0;z-index:1;}',
    '.ap2-header h2{font-family:"DM Mono",monospace;font-size:12px;letter-spacing:2px;',
      'text-transform:uppercase;color:rgba(245,240,232,0.7);margin:0;}',
    '.ap2-close{width:32px;height:32px;background:rgba(255,255,255,0.08);',
      'border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:#F5F0E8;',
      'cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;}',
    '.ap2-body{padding:24px;}',
    '.ap2-section{margin-bottom:24px;}',
    '.ap2-section-title{font-family:"DM Mono",monospace;font-size:9px;letter-spacing:2px;',
      'text-transform:uppercase;color:#4A4A52;margin-bottom:12px;',
      'padding-bottom:6px;border-bottom:1px solid rgba(28,28,30,0.08);}',
    '.ap2-card{background:white;border-radius:8px;border:1px solid rgba(28,28,30,0.08);padding:16px;margin-bottom:12px;}',
    '.ap2-field{margin-bottom:12px;}',
    '.ap2-label{font-family:"DM Mono",monospace;font-size:9px;letter-spacing:1.5px;',
      'text-transform:uppercase;color:#4A4A52;display:block;margin-bottom:5px;}',
    '.ap2-input{width:100%;background:#F5F3EE;border:1px solid rgba(28,28,30,0.12);',
      'border-radius:4px;padding:9px 12px;font-family:"DM Sans",sans-serif;font-size:14px;',
      'color:#1C1C1E;outline:none;box-sizing:border-box;}',
    '.ap2-input:focus{border-color:rgba(201,168,76,0.6);background:white;}',
    '.ap2-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '.ap2-btn{padding:10px 16px;border-radius:4px;font-family:"DM Mono",monospace;',
      'font-size:10px;letter-spacing:0.5px;cursor:pointer;border:none;font-weight:600;}',
    '.ap2-btn-primary{background:#1C1C1E;color:#F5F0E8;}.ap2-btn-primary:hover{opacity:0.85;}',
    '.ap2-btn-gold{background:#C9A84C;color:#1C1C1E;}.ap2-btn-gold:hover{opacity:0.88;}',
    '.ap2-btn-danger{background:transparent;border:1px solid rgba(196,90,90,0.4);color:#C45A5A;}',
    '.ap2-btn-danger:hover{background:rgba(196,90,90,0.06);}',
    '.ap2-status{font-size:12px;margin-top:8px;padding:6px 10px;border-radius:3px;display:none;}',
    '.ap2-status.ok{display:block;background:rgba(90,158,123,0.1);color:#5A9E7A;}',
    '.ap2-status.err{display:block;background:rgba(196,90,90,0.08);color:#C45A5A;}',
    '.ap2-avatar-row{display:flex;align-items:center;gap:16px;margin-bottom:16px;}',
    '.ap2-avatar{width:56px;height:56px;border-radius:50%;background:#C9A84C;',
      'display:flex;align-items:center;justify-content:center;',
      'font-family:"DM Mono",monospace;font-size:18px;font-weight:700;',
      'color:#1C1C1E;overflow:hidden;flex-shrink:0;}',
    '.ap2-plan-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;',
      'border-radius:4px;font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;',
      'border:1px solid rgba(201,168,76,0.3);background:rgba(201,168,76,0.08);color:#C9A84C;}',
    '.ap2-color-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;}',
    '.ap2-swatch{width:24px;height:24px;border-radius:50%;cursor:pointer;',
      'border:2px solid transparent;transition:transform 0.15s,border-color 0.15s;}',
    '.ap2-swatch:hover,.ap2-swatch.active{transform:scale(1.2);border-color:white;box-shadow:0 0 0 1px rgba(0,0,0,0.2);}'
  ].join('');
  document.head.appendChild(style);

  // ── Inject HTML ─────────────────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = 'ap-overlay';
  overlay.onclick = function () { window.closeAccountPanel(); };
  document.body.appendChild(overlay);

  var panel = document.createElement('div');
  panel.id = 'ap-panel';
  panel.innerHTML = [
    '<div class="ap2-header">',
      '<h2>Account Settings</h2>',
      '<button class="ap2-close" onclick="window.closeAccountPanel()">&#x2715;</button>',
    '</div>',
    '<div class="ap2-body">',

      // Profile
      '<div class="ap2-section">',
        '<div class="ap2-section-title">Profile</div>',
        '<div class="ap2-card">',
          '<div class="ap2-avatar-row">',
            '<div class="ap2-avatar" id="ap2-avatar">?</div>',
            '<div>',
              '<div style="font-size:14px;font-weight:600;color:#1C1C1E;" id="ap2-name-display">—</div>',
              '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:#4A4A52;margin-top:2px;" id="ap2-email-display"></div>',
              '<div class="ap2-plan-badge" id="ap2-plan-display" style="margin-top:8px;">Starter</div>',
            '</div>',
          '</div>',
          '<div class="ap2-field">',
            '<label class="ap2-label">Display Name</label>',
            '<input class="ap2-input" id="ap2-name" type="text" placeholder="Your name">',
          '</div>',
          '<div class="ap2-field">',
            '<label class="ap2-label">Avatar Colour</label>',
            '<div class="ap2-color-row" id="ap2-colors"></div>',
          '</div>',
          '<div class="ap2-field">',
            '<label class="ap2-label">Profile Photo</label>',
            '<input type="file" id="ap2-photo-input" accept="image/*" style="display:none" onchange="ap2LoadPhoto(this)">',
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
              '<button class="ap2-btn ap2-btn-primary" onclick="document.getElementById(\'ap2-photo-input\').click()">&#x1F4F7; Upload Photo</button>',
              '<button class="ap2-btn" style="background:rgba(196,90,90,0.08);color:#C45A5A;border:1px solid rgba(196,90,90,0.2);" onclick="ap2RemovePhoto()">Remove</button>',
            '</div>',
          '</div>',
          '<button class="ap2-btn ap2-btn-gold" onclick="ap2SaveProfile()">Save Profile</button>',
          '<div class="ap2-status" id="ap2-profile-status"></div>',
        '</div>',
      '</div>',

      // Subscription
      '<div class="ap2-section">',
        '<div class="ap2-section-title">Subscription</div>',
        '<div class="ap2-card">',
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">',
            '<div>',
              '<div style="font-size:13px;font-weight:600;color:#1C1C1E;" id="ap2-plan-name">Starter (Free)</div>',
              '<div style="font-size:12px;color:#4A4A52;margin-top:3px;" id="ap2-plan-desc">1 saved scenario · Core calculator</div>',
            '</div>',
            '<button class="ap2-btn ap2-btn-gold" id="ap2-upgrade-btn" onclick="location.href=\'pricing.html\'" style="display:none;">Upgrade to Pro &#x2192;</button>',
          '</div>',
        '</div>',
      '</div>',

      // Security
      '<div class="ap2-section">',
        '<div class="ap2-section-title">Security</div>',
        '<div class="ap2-card">',
          '<div class="ap2-field">',
            '<label class="ap2-label">Current Password</label>',
            '<input class="ap2-input" id="ap2-pw-current" type="password" placeholder="Enter current password" autocomplete="current-password">',
          '</div>',
          '<div class="ap2-row">',
            '<div class="ap2-field">',
              '<label class="ap2-label">New Password</label>',
              '<input class="ap2-input" id="ap2-pw-new" type="password" placeholder="8+ characters" autocomplete="new-password">',
            '</div>',
            '<div class="ap2-field">',
              '<label class="ap2-label">Confirm New</label>',
              '<input class="ap2-input" id="ap2-pw-confirm" type="password" placeholder="Repeat password" autocomplete="new-password">',
            '</div>',
          '</div>',
          '<button class="ap2-btn ap2-btn-primary" onclick="ap2ChangePassword()">Update Password</button>',
          '<div class="ap2-status" id="ap2-pw-status"></div>',
        '</div>',
      '</div>',

      // Referral
      '<div class="ap2-section">',
        '<div class="ap2-section-title">Refer a Friend</div>',
        '<div class="ap2-card">',
          '<div style="font-size:13px;color:#4A4A52;line-height:1.5;margin-bottom:12px;">Share your link. When a friend signs up and upgrades to a paid plan, you both get <strong style="color:#1C1C1E;">1 month at 50% off</strong>.</div>',
          '<div id="ap2-ref-loading" style="font-size:12px;color:#4A4A52;">Loading…</div>',
          '<div id="ap2-ref-content" style="display:none;">',
            '<div style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#4A4A52;margin-bottom:5px;">Your referral link</div>',
            '<div style="display:flex;gap:8px;align-items:center;">',
              '<input class="ap2-input" id="ap2-ref-link" type="text" readonly style="font-size:12px;color:#1C1C1E;cursor:default;">',
              '<button class="ap2-btn ap2-btn-gold" onclick="ap2CopyRefLink()" style="white-space:nowrap;flex-shrink:0;">Copy</button>',
            '</div>',
            '<div id="ap2-ref-count" style="font-size:12px;color:#4A4A52;margin-top:8px;"></div>',
          '</div>',
          '<div class="ap2-status" id="ap2-ref-status"></div>',
        '</div>',
      '</div>',

      // Danger
      '<div class="ap2-section">',
        '<div class="ap2-section-title">Danger Zone</div>',
        '<div class="ap2-card">',
          '<div style="font-size:12px;color:#4A4A52;margin-bottom:12px;">Permanently delete your account and all saved scenarios. This cannot be undone.</div>',
          '<button class="ap2-btn ap2-btn-danger" onclick="ap2DeleteAccount()">Delete My Account</button>',
        '</div>',
      '</div>',

    '</div>'
  ].join('');
  document.body.appendChild(panel);

  // ── Local state ─────────────────────────────────────────────────────────────
  var _apProfile = {};

  function el(id) { return document.getElementById(id); }

  // ── Render ───────────────────────────────────────────────────────────────────
  function apRenderPanel() {
    var sess = getSession();
    if (!sess) return;
    var p     = getProfile();
    _apProfile = Object.assign({}, p);
    var name  = sess.name  || p.name  || 'User';
    var email = sess.email || p.email || '';
    var plan  = sess.plan  || 'free';
    var color = p.color    || '#C9A84C';

    // Avatar
    var av = el('ap2-avatar');
    if (av) {
      var parts = name.trim().split(/\s+/).filter(Boolean);
      var ini = parts.length === 1 ? parts[0][0].toUpperCase()
              : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      if (p.photo && safePhotoSrc(p.photo)) {
        av.innerHTML = '<img src="' + safePhotoSrc(p.photo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        av.style.background = 'transparent';
      } else {
        av.textContent = ini;
        av.style.background = color;
      }
    }

    if (el('ap2-name-display'))  el('ap2-name-display').textContent  = name;
    if (el('ap2-email-display')) el('ap2-email-display').textContent = email;
    if (el('ap2-name'))          el('ap2-name').value                = name;

    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}'); } catch(e) {}
    var freeLimit = cfg.freeScenarioLimit || 1;
    var proPrice = cfg.proMonthlyPrice || 9;
    var advPrice = cfg.adviserMonthlyPrice || 29;
    var planLabel = plan === 'free' ? '&#x2B50; Starter' : (plan === 'pro' ? '&#x26A1; Pro' : '&#x1F451; Adviser');
    var planName  = plan === 'free' ? 'Starter (Free)'  : (plan === 'pro' ? `Pro \u2014 A$${proPrice.toFixed(2)}/mo AUD` : `Adviser \u2014 A$${advPrice.toFixed(2)}/mo AUD`);
    var planDesc  = plan === 'free' ? `${freeLimit} saved scenario${freeLimit > 1 ? 's' : ''} \u00B7 Core calculator` : 'Unlimited scenarios \u00B7 Cloud sync \u00B7 PDF export';

    if (el('ap2-plan-display')) el('ap2-plan-display').innerHTML   = planLabel;
    if (el('ap2-plan-name'))    el('ap2-plan-name').textContent     = planName;
    if (el('ap2-plan-desc'))    el('ap2-plan-desc').textContent     = planDesc;
    if (el('ap2-upgrade-btn'))  el('ap2-upgrade-btn').style.display = plan === 'free' ? '' : 'none';

    // Colour swatches
    var cr = el('ap2-colors');
    if (cr) {
      cr.innerHTML = AP_COLORS.map(function (c) {
        return '<div class="ap2-swatch' + (c === color ? ' active' : '') + '" style="background:' + c + ';" onclick="ap2SetColor(this,\'' + c + '\')"></div>';
      }).join('');
    }
  }

  // ── Colour swatch ────────────────────────────────────────────────────────────
  window.ap2SetColor = function (swatchEl, color) {
    document.querySelectorAll('.ap2-swatch').forEach(function (s) { s.classList.remove('active'); });
    swatchEl.classList.add('active');
    _apProfile.color = color;
    var av = el('ap2-avatar');
    if (av && !_apProfile.photo) av.style.background = color;
    // Immediately persist colour so it propagates across all pages without needing Save
    var current = getProfile();
    current.color = color;
    saveProfile(current);
    // Also update the nav avatar button if present on this page
    var navBtn = document.getElementById('site-profile-btn');
    if (navBtn && !_apProfile.photo) navBtn.style.background = color;
  };

  // ── Photo upload ─────────────────────────────────────────────────────────────
  window.ap2LoadPhoto = function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var size = Math.min(img.width, img.height, 320);
        canvas.width = size; canvas.height = size;
        canvas.getContext('2d').drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, size, size);
        _apProfile.photo = canvas.toDataURL('image/jpeg', 0.92);
        var av = el('ap2-avatar');
        if (av) {
          av.innerHTML = '<img src="' + safePhotoSrc(_apProfile.photo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
          av.style.background = 'transparent';
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.ap2RemovePhoto = function () {
    _apProfile.photo = '';
    apRenderPanel();
  };

  // ── Save profile ──────────────────────────────────────────────────────────────
  window.ap2SaveProfile = async function () {
    var st      = el('ap2-profile-status');
    var nameVal = (el('ap2-name').value || '').trim();
    if (!nameVal) { st.textContent = 'Name is required'; st.className = 'ap2-status err'; return; }
    st.textContent = 'Saving\u2026'; st.className = 'ap2-status ok';
    _apProfile.name = nameVal;

    // Update session name
    var sess = getSession();
    if (sess) { sess.name = nameVal; localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); }
    saveProfile(_apProfile);

    // Sync to backend
    var authH = getAuthHeader();
    if (authH) {
      try {
        var p2 = Object.assign({}, _apProfile); delete p2.photo;
        await fetch('/.netlify/functions/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authH }, body: JSON.stringify({ action: 'setProfile', profile: p2 }) });
        if (_apProfile.photo) {
          await fetch('/.netlify/functions/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authH }, body: JSON.stringify({ action: 'setPhoto', photo: _apProfile.photo }) });
        }
      } catch (e) {}
    }

    // Refresh the panel display
    if (el('ap2-name-display')) el('ap2-name-display').textContent = nameVal;
    // Refresh the site nav avatar button so it immediately reflects new name/colour
    var navBtn = document.getElementById('site-profile-btn');
    if (navBtn) {
      var parts = nameVal.trim().split(/\s+/).filter(Boolean);
      var ini = parts.length === 0 ? '?' : parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
      if (_apProfile.photo && safePhotoSrc(_apProfile.photo)) {
        navBtn.style.background = 'transparent';
        navBtn.innerHTML = '<img src="' + safePhotoSrc(_apProfile.photo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;">';
      } else {
        navBtn.style.background = _apProfile.color || '#C9A84C';
        navBtn.textContent = ini;
      }
    }
    st.textContent = '\u2713 Profile saved';
    setTimeout(function () { st.className = 'ap2-status'; }, 3000);
  };

  // ── Change password ───────────────────────────────────────────────────────────
  window.ap2ChangePassword = async function () {
    var cur = (el('ap2-pw-current').value || '').trim();
    var nw  = el('ap2-pw-new').value;
    var cf  = el('ap2-pw-confirm').value;
    var st  = el('ap2-pw-status');
    if (!cur || !nw) { st.textContent = 'Fill in all fields'; st.className = 'ap2-status err'; return; }
    if (nw.length < 8) { st.textContent = 'New password must be 8+ characters'; st.className = 'ap2-status err'; return; }
    if (nw !== cf) { st.textContent = "Passwords don\u2019t match"; st.className = 'ap2-status err'; return; }
    st.textContent = 'Updating\u2026'; st.className = 'ap2-status ok';
    try {
      var r = await fetch('/.netlify/functions/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() || '' }, body: JSON.stringify({ action: 'changePassword', currentPassword: cur, newPassword: nw }) });
      var d = await r.json();
      if (d.ok) {
        st.textContent = '\u2713 Password updated';
        el('ap2-pw-current').value = ''; el('ap2-pw-new').value = ''; el('ap2-pw-confirm').value = '';
        setTimeout(function () { st.className = 'ap2-status'; }, 3000);
      } else {
        st.textContent = d.error || 'Incorrect current password'; st.className = 'ap2-status err';
      }
    } catch (e) { st.textContent = 'Network error'; st.className = 'ap2-status err'; }
  };

  // ── Delete account ────────────────────────────────────────────────────────────
  window.ap2DeleteAccount = async function () {
    var pw = prompt('Enter your password to permanently delete your account. This cannot be undone.');
    if (!pw) return;
    try {
      var r = await fetch('/.netlify/functions/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() || '' }, body: JSON.stringify({ action: 'deleteAccount', password: pw }) });
      var d = await r.json();
      if (d.ok) { localStorage.clear(); alert('Account deleted. Goodbye!'); location.href = 'index.html'; }
      else alert(d.error || 'Incorrect password \u2014 account not deleted');
    } catch (e) { alert('Network error \u2014 try again'); }
  };

  // ── Public API ────────────────────────────────────────────────────────────────
  window.openAccountPanel = function () {
    var sess = getSession();
    if (!sess || !(sess.id || sess.email)) { location.href = 'login.html'; return; }
    el('ap-panel').classList.add('open');
    el('ap-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    apRenderPanel();
    ap2LoadReferralCode();
  };

  function ap2LoadReferralCode() {
    var auth = getAuthHeader();
    if (!auth) return;
    el('ap2-ref-loading').style.display = '';
    el('ap2-ref-content').style.display = 'none';
    fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify({ action: 'getReferralCode' })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      el('ap2-ref-loading').style.display = 'none';
      if (data.ok) {
        el('ap2-ref-link').value = data.link;
        var countEl = el('ap2-ref-count');
        if (countEl) countEl.textContent = data.referralCount > 0
          ? 'You\'ve referred ' + data.referralCount + ' user' + (data.referralCount === 1 ? '' : 's') + ' so far.'
          : 'No referrals yet — share your link to get started.';
        el('ap2-ref-content').style.display = '';
      }
    })
    .catch(function(){ el('ap2-ref-loading').textContent = 'Could not load referral link.'; });
  }

  window.ap2CopyRefLink = function() {
    var inp = el('ap2-ref-link');
    if (!inp || !inp.value) return;
    navigator.clipboard.writeText(inp.value).then(function(){
      var s = el('ap2-ref-status');
      if (s) { s.className = 'ap2-status ok'; s.textContent = 'Link copied!'; setTimeout(function(){ s.className = 'ap2-status'; }, 2000); }
    }).catch(function(){
      inp.select();
      document.execCommand('copy');
    });
  };

  window.closeAccountPanel = function () {
    el('ap-panel').classList.remove('open');
    el('ap-overlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el('ap-panel') && el('ap-panel').classList.contains('open')) {
      window.closeAccountPanel();
    }
  });

})();

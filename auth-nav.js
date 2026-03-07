/**
 * EquitySight.app — Shared Auth Header Nav
 */

// ── Theme (dark/light) — applied before render to avoid flash ──
(function(){
  try{
    if(localStorage.getItem('equitySight_theme')==='dark'){
      document.documentElement.classList.add('dark-mode');
    }
  }catch(e){}
})();

window.toggleTheme = function(){
  var isDark = document.documentElement.classList.toggle('dark-mode');
  try{ localStorage.setItem('equitySight_theme', isDark ? 'dark' : 'light'); }catch(e){}
  // Update all toggle button labels on the page
  document.querySelectorAll('[data-theme-toggle]').forEach(function(b){
    b.textContent = isDark ? '☀️ Light mode' : '🌙 Dark mode';
  });
};

(function() {
  const SESSION_KEY = 'propCalc_session_v1';
  const PK_BASE     = 'propCalc_profile_v1';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
  }
  function getProfile(userId) {
    try {
      return JSON.parse(localStorage.getItem(PK_BASE + '_' + (userId || 'guest')));
    } catch(e) { return null; }
  }

  // Inject dropdown + help modal CSS once
  function injectCSS() {
    if (document.getElementById('anav-css')) return;
    var s = document.createElement('style');
    s.id = 'anav-css';
    s.textContent = [
      '#site-profile-menu.open{display:block!important;}',
      '#site-profile-btn:hover{transform:scale(1.05);box-shadow:0 0 0 3px rgba(201,168,76,0.25);}',
      '.anav-item{display:flex;align-items:center;gap:10px;padding:11px 14px;',
        'color:rgba(245,240,232,0.75);font-size:14px;border-radius:5px;',
        'text-decoration:none;background:transparent;border:none;',
        'cursor:pointer;font-family:inherit;width:100%;text-align:left;',
        'transition:background 0.12s,color 0.12s;}',
      '.anav-item:hover{background:rgba(255,255,255,0.07);color:#F5F0E8;}',
      '.anav-item.active{background:rgba(255,255,255,0.06);}',
      '.anav-item-danger{color:rgba(245,240,232,0.4);}',
      '.anav-item-danger:hover{background:rgba(255,255,255,0.04);color:rgba(245,240,232,0.65);}',
      // Help button
      '#anav-help-btn{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.18);',
        'border:1.5px solid rgba(255,255,255,0.35);color:#F5F0E8;font-size:16px;font-weight:700;',
        'cursor:pointer;display:flex;align-items:center;justify-content:center;',
        'transition:background 0.15s,box-shadow 0.15s;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.25);}',
      '#anav-help-btn:hover{background:rgba(255,255,255,0.28);box-shadow:0 0 0 3px rgba(201,168,76,0.3);}',
      // Help modal
      '#anav-help-overlay{display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.65);',
        'align-items:center;justify-content:center;padding:16px;}',
      '#anav-help-overlay.open{display:flex!important;}',
      '#anav-help-modal{background:#F5F0E8;border-radius:8px;width:min(520px,96vw);',
        'max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.55);}',
      '.anav-cf-label{font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:1px;',
        'text-transform:uppercase;color:#4A4A52;display:block;margin-bottom:5px;}',
      '.anav-cf-input,.anav-cf-select,.anav-cf-textarea{width:100%;padding:9px 10px;',
        'border:1px solid rgba(28,28,30,0.15);border-radius:4px;',
        'font-family:inherit;font-size:13px;background:white;color:#1C1C1E;',
        'box-sizing:border-box;outline:none;}',
      '.anav-cf-input:focus,.anav-cf-select:focus,.anav-cf-textarea:focus{',
        'border-color:#C9A84C;box-shadow:0 0 0 2px rgba(201,168,76,0.15);}',
      '.anav-cf-textarea{min-height:110px;resize:vertical;}'
    ].join('');
    document.head.appendChild(s);
  }

  // Inject help modal HTML into body once
  function injectHelpModal() {
    if (document.getElementById('anav-help-overlay')) return;
    var el = document.createElement('div');
    el.id = 'anav-help-overlay';
    el.innerHTML =
      '<div id="anav-help-modal">' +
        '<div style="background:#1C1C1E;padding:18px 22px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;">' +
          '<div>' +
            '<div style="font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:3px;color:#C9A84C;margin-bottom:3px;">SUPPORT</div>' +
            '<div style="font-family:\'Playfair Display\',serif;font-size:17px;font-weight:700;color:#F5F0E8;">Send us a message</div>' +
          '</div>' +
          '<button onclick="window.closeHelpModal()" style="width:32px;height:32px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:#F5F0E8;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>' +
        '</div>' +
        '<div style="padding:22px;">' +
          '<div id="anav-cf-name-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div><label class="anav-cf-label">First name</label><input class="anav-cf-input" id="anav-cf-fname" type="text" placeholder="Jamie"></div>' +
            '<div><label class="anav-cf-label">Last name</label><input class="anav-cf-input" id="anav-cf-lname" type="text" placeholder="Smith"></div>' +
          '</div>' +
          '<div id="anav-cf-email-row" style="margin-bottom:14px;"><label class="anav-cf-label">Email</label><input class="anav-cf-input" id="anav-cf-email" type="email" placeholder="you@email.com"></div>' +
          '<div id="anav-cf-sending-as" style="display:none;margin-bottom:14px;font-size:12px;color:#6B7280;font-family:\'DM Mono\',monospace;padding:8px 10px;background:rgba(28,28,30,0.05);border-radius:4px;"></div>' +
          '<div style="margin-bottom:14px;"><label class="anav-cf-label">Subject</label>' +
            '<select class="anav-cf-select" id="anav-cf-subject">' +
              '<option value="">Select a topic...</option>' +
              '<option value="general">General question</option>' +
              '<option value="bug">Bug report</option>' +
              '<option value="feature">Feature request</option>' +
              '<option value="billing">Billing / subscription</option>' +
              '<option value="calculator">Calculator question</option>' +
              '<option value="other">Other</option>' +
            '</select>' +
          '</div>' +
          '<div style="margin-bottom:14px;"><label class="anav-cf-label">Message</label><textarea class="anav-cf-textarea" id="anav-cf-message" placeholder="Tell us what\'s on your mind..."></textarea></div>' +
          '<div style="font-size:11px;color:#6B7280;margin-bottom:14px;line-height:1.5;">By submitting you agree to our <a href="privacy.html" style="color:#C9A84C;">Privacy Policy</a>. We\'ll only use your email to respond.</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;">' +
            '<div id="anav-cf-error" style="font-size:12px;color:#C45A5A;flex:1;font-family:\'DM Mono\',monospace;"></div>' +
            '<button onclick="window.closeHelpModal()" style="padding:10px 18px;background:rgba(28,28,30,0.07);border:1px solid rgba(28,28,30,0.15);border-radius:4px;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;color:#1C1C1E;">Cancel</button>' +
            '<button id="anav-cf-submit" onclick="window.submitHelpForm()" style="padding:10px 22px;background:#1C1C1E;border:none;border-radius:4px;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;color:#C9A84C;font-weight:600;letter-spacing:0.5px;">Send Message →</button>' +
          '</div>' +
        '</div>' +
        '<div id="anav-cf-success" style="display:none;padding:40px 22px;text-align:center;">' +
          '<div style="font-size:36px;margin-bottom:12px;">✅</div>' +
          '<div style="font-size:20px;font-weight:700;color:#1C1C1E;margin-bottom:8px;">Message sent!</div>' +
          '<div style="color:#6B7280;font-size:14px;margin-bottom:20px;">We\'ll get back to you within 24 hours.</div>' +
          '<button onclick="window.closeHelpModal()" style="background:#1C1C1E;color:#C9A84C;border:none;padding:11px 24px;border-radius:4px;font-family:\'DM Mono\',monospace;font-size:11px;cursor:pointer;font-weight:600;">Close</button>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', function(e){ if(e.target===el) window.closeHelpModal(); });
    document.body.appendChild(el);
  }

  window.openHelpModal = function() {
    injectHelpModal();
    // Pre-fill from session and hide identity fields if logged in
    try {
      var sess = JSON.parse(localStorage.getItem('propCalc_session_v1')||'{}');
      var loggedIn = !!(sess && (sess.id || sess.email));
      var nameRow = document.getElementById('anav-cf-name-row');
      var emailRow = document.getElementById('anav-cf-email-row');
      var sendingAs = document.getElementById('anav-cf-sending-as');
      if(loggedIn && sess.email) {
        if(nameRow) nameRow.style.display = 'none';
        if(emailRow) emailRow.style.display = 'none';
        if(sendingAs) { sendingAs.style.display = ''; sendingAs.textContent = 'Sending as: ' + (sess.name || sess.email) + ' \u2014 ' + sess.email; }
        // Still fill hidden inputs so submitHelpForm can read them
        var emailEl = document.getElementById('anav-cf-email');
        if(emailEl) emailEl.value = sess.email;
        var fnEl = document.getElementById('anav-cf-fname');
        if(fnEl && sess.name) {
          var parts = sess.name.trim().split(/\s+/);
          fnEl.value = parts[0] || '';
          var lnEl = document.getElementById('anav-cf-lname');
          if(lnEl) lnEl.value = parts.length > 1 ? parts.slice(1).join(' ') : '';
        }
      } else {
        if(nameRow) nameRow.style.display = '';
        if(emailRow) emailRow.style.display = '';
        if(sendingAs) sendingAs.style.display = 'none';
        var emailEl = document.getElementById('anav-cf-email');
        if(emailEl && sess.email && !emailEl.value) emailEl.value = sess.email;
        var fnEl = document.getElementById('anav-cf-fname');
        if(fnEl && sess.name && !fnEl.value){
          var parts = sess.name.trim().split(/\s+/);
          fnEl.value = parts[0] || '';
          var lnEl = document.getElementById('anav-cf-lname');
          if(lnEl && parts.length > 1) lnEl.value = parts.slice(1).join(' ');
        }
      }
    }catch(e){}
    // Reset state
    var err = document.getElementById('anav-cf-error');
    if(err) err.textContent = '';
    var success = document.getElementById('anav-cf-success');
    var form = document.querySelector('#anav-help-modal > div:nth-child(2)');
    if(success) success.style.display = 'none';
    if(form) form.style.display = '';
    var btn = document.getElementById('anav-cf-submit');
    if(btn){ btn.disabled=false; btn.textContent='Send Message →'; }
    document.getElementById('anav-help-overlay').classList.add('open');
  };

  window.closeHelpModal = function() {
    var el = document.getElementById('anav-help-overlay');
    if(el) el.classList.remove('open');
  };

  window.submitHelpForm = async function() {
    var fname=(document.getElementById('anav-cf-fname')||{}).value||'';
    var lname=(document.getElementById('anav-cf-lname')||{}).value||'';
    var email=(document.getElementById('anav-cf-email')||{}).value||'';
    var subject=(document.getElementById('anav-cf-subject')||{}).value||'';
    var message=(document.getElementById('anav-cf-message')||{}).value||'';
    var errEl=document.getElementById('anav-cf-error');
    var btn=document.getElementById('anav-cf-submit');
    fname=fname.trim(); lname=lname.trim(); email=email.trim(); message=message.trim();
    if(!fname||!email||!subject||!message){ if(errEl)errEl.textContent='Please fill in all required fields.'; return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ if(errEl)errEl.textContent='Please enter a valid email address.'; return; }
    if(errEl)errEl.textContent='';
    btn.disabled=true; btn.textContent='Sending…';
    try{
      var r=await fetch('/.netlify/functions/contact',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:(fname+' '+lname).trim(),email,subject,message})
      });
      var d=await r.json();
      if(!d.ok){ if(errEl)errEl.textContent=d.error||'Failed to send — please try again.'; btn.disabled=false; btn.textContent='Send Message →'; return; }
    }catch(e){ if(errEl)errEl.textContent='Network error — please try again.'; btn.disabled=false; btn.textContent='Send Message →'; return; }
    var success=document.getElementById('anav-cf-success');
    var form=document.querySelector('#anav-help-modal > div:nth-child(2)');
    if(form)form.style.display='none';
    if(success)success.style.display='';
  };

  function getInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  window.siteSignOut = function() {
    var sess = getSession();
    if (sess && sess.token) {
      fetch('/.netlify/functions/auth', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({action:'signout', token:sess.token})
      }).catch(function(){});
    }
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  };

  function renderNav() {
    var actions = document.querySelector('.site-nav-actions');
    if (!actions) return;
    injectCSS();

    var session = getSession();
    var profile = session ? getProfile(session.id || session.userId) : null;

    if (session && (session.id || session.email)) {
      var name     = session.name || session.email || 'Account';
      var email    = session.email || '';
      var color    = (profile && profile.color) || '#C9A84C';
      var photo    = profile && profile.photo;
      var initials = getInitials(name);
      var page     = window.location.pathname.split('/').pop() || 'index.html';

      var avatarHTML = photo
        ? '<img src="' + photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : initials;

      actions.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<button id="anav-help-btn" onclick="window.openHelpModal()" title="Send us a message">?</button>' +
        '<div style="position:relative;" id="site-profile-wrap">' +
          '<button id="site-profile-btn"' +
          ' onclick="var m=document.getElementById(\'site-profile-menu\'),r=this.getBoundingClientRect();m.style.top=(r.bottom+6)+\'px\';m.style.right=(window.innerWidth-r.right)+\'px\';m.classList.toggle(\'open\')"' +
          ' style="width:42px;height:42px;border-radius:50%;background:' + (photo ? 'transparent' : color) + ';' +
          'border:2px solid rgba(201,168,76,0.5);cursor:pointer;display:flex;align-items:center;' +
          'justify-content:center;font-family:\'DM Mono\',monospace;font-size:15px;font-weight:700;' +
          'color:#1C1C1E;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s;flex-shrink:0;' +
          'box-shadow:0 3px 16px rgba(0,0,0,0.35);" title="' + name + '">' +
          avatarHTML +
          '</button>' +
          '<div id="site-profile-menu" style="display:none;position:fixed;top:0;right:0;' +
          'background:#1C1C1E;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px;' +
          'min-width:240px;box-shadow:0 16px 48px rgba(0,0,0,0.65);z-index:9999;">' +
            '<div style="padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:6px;">' +
              '<div style="font-size:15px;font-weight:600;color:#F5F0E8;">' + name + '</div>' +
              '<div style="font-family:\'DM Mono\',monospace;font-size:11px;color:rgba(245,240,232,0.4);margin-top:3px;">' + email + '</div>' +
            '</div>' +
            '<div style="padding:2px 0;">' +
              '<a href="app.html" class="anav-item' + (page==='app.html'?' active':'') + '">🏠 Open Calculator</a>' +
              '<a href="account.html" class="anav-item' + (page==='account.html'?' active':'') + '">⚙ Account Settings</a>' +
              (session.role === 'admin' ? '<a href="admin.html" class="anav-item' + (page==='admin.html'?' active':'') + '">🔒 Admin Dashboard</a>' : '') +
              '<div style="height:1px;background:rgba(255,255,255,0.07);margin:4px 0;"></div>' +
              '<button onclick="toggleTheme()" data-theme-toggle class="anav-item" style="justify-content:space-between;">' + (document.documentElement.classList.contains('dark-mode') ? '☀️ Light mode' : '🌙 Dark mode') + '</button>' +
              '<div style="height:1px;background:rgba(255,255,255,0.07);margin:4px 0;"></div>' +
              '<button onclick="siteSignOut()" class="anav-item anav-item-danger">→ Sign Out</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '</div>';

      document.addEventListener('click', function(e) {
        var wrap = document.getElementById('site-profile-wrap');
        if (wrap && !wrap.contains(e.target)) {
          var menu = document.getElementById('site-profile-menu');
          if (menu) menu.classList.remove('open');
        }
      });

    } else {
      actions.innerHTML =
        '<button class="btn-ghost" onclick="location.href=\'login.html\'">Sign in</button>' +
        '<button class="btn-gold" onclick="location.href=\'login.html?tab=signup\'">Get started free</button>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNav);
  } else {
    renderNav();
  }

  // Allow external code to re-render the nav (e.g. after profile update)
  window.renderSiteNav = renderNav;
})();

// Hamburger menu toggle — shared across all pages that include this script
(function () {
  function initHamburger() {
    var ham = document.getElementById('nav-ham');
    if (!ham) return;
    ham.addEventListener('click', function () {
      var links = document.querySelector('.site-nav-links');
      if (!links) return;
      if (links.style.display === 'flex') {
        links.style.cssText = '';
      } else {
        links.style.cssText = 'display:flex;flex-direction:column;position:absolute;top:64px;left:0;right:0;background:var(--charcoal-soft);padding:12px 24px;border-top:1px solid rgba(255,255,255,0.06);z-index:999;';
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHamburger);
  } else {
    initHamburger();
  }
})();
// and reloads the page if needed so feature gates update without re-login.
(function() {
  function refreshSession() {
    try {
      var raw = localStorage.getItem('propCalc_session_v1');
      if (!raw) return;
      var sess = JSON.parse(raw);
      if (!sess || !sess.token) return;
      fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: sess.token })
      }).then(function(r){ return r.json(); }).then(function(d){
        if (!d.ok) return;
        var changed = d.plan !== sess.plan || d.role !== sess.role;
        if (changed) {
          var updated = Object.assign({}, sess, { plan: d.plan, role: d.role });
          localStorage.setItem('propCalc_session_v1', JSON.stringify(updated));
          // Re-render nav to reflect new plan/role
          if (window.renderSiteNav) window.renderSiteNav();
        }
      }).catch(function(){});
    } catch(e) {}
  }
  // Refresh once after 5s then every 5 minutes
  setTimeout(refreshSession, 5000);
  setInterval(refreshSession, 5 * 60 * 1000);
})();

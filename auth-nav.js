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

  // Inject dropdown CSS once
  function injectCSS() {
    if (document.getElementById('anav-css')) return;
    var s = document.createElement('style');
    s.id = 'anav-css';
    s.textContent = [
      '#site-profile-menu.open{display:block!important;}',
      '#site-profile-btn:hover{transform:scale(1.05);box-shadow:0 0 0 3px rgba(201,168,76,0.25);}',
      '.anav-item{display:flex;align-items:center;gap:9px;padding:8px 12px;',
        'color:rgba(245,240,232,0.7);font-size:13px;border-radius:4px;',
        'text-decoration:none;background:transparent;border:none;',
        'cursor:pointer;font-family:inherit;width:100%;text-align:left;',
        'transition:background 0.12s,color 0.12s;}',
      '.anav-item:hover{background:rgba(255,255,255,0.07);color:#F5F0E8;}',
      '.anav-item.active{background:rgba(255,255,255,0.06);}',
      '.anav-item-danger{color:rgba(245,240,232,0.4);}',
      '.anav-item-danger:hover{background:rgba(255,255,255,0.04);color:rgba(245,240,232,0.65);}'
    ].join('');
    document.head.appendChild(s);
  }

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
        '<div style="position:relative;" id="site-profile-wrap">' +
          '<button id="site-profile-btn"' +
          ' onclick="var m=document.getElementById(\'site-profile-menu\');m.classList.toggle(\'open\')"' +
          ' style="width:36px;height:36px;border-radius:50%;background:' + (photo ? 'transparent' : color) + ';' +
          'border:2px solid rgba(255,255,255,0.2);cursor:pointer;display:flex;align-items:center;' +
          'justify-content:center;font-family:\'DM Mono\',monospace;font-size:13px;font-weight:700;' +
          'color:#1C1C1E;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s;flex-shrink:0;" title="' + name + '">' +
          avatarHTML +
          '</button>' +
          '<div id="site-profile-menu" style="display:none;position:absolute;top:46px;right:0;' +
          'background:#1C1C1E;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px;' +
          'min-width:210px;box-shadow:0 12px 40px rgba(0,0,0,0.6);z-index:9999;">' +
            '<div style="padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:4px;">' +
              '<div style="font-size:13px;font-weight:600;color:#F5F0E8;">' + name + '</div>' +
              '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:rgba(245,240,232,0.35);margin-top:2px;">' + email + '</div>' +
            '</div>' +
            '<div style="padding:2px 0;">' +
              '<a href="app.html" class="anav-item' + (page==='app.html'?' active':'') + '">🏠 Open Calculator</a>' +
              '<a href="account.html" class="anav-item' + (page==='account.html'?' active':'') + '">⚙ Account Settings</a>' +
              (session.role === 'admin' ? '<a href="admin.html" class="anav-item' + (page==='admin.html'?' active':'') + '">🔒 Admin Dashboard</a>' : '') +
              '<button onclick="toggleTheme()" data-theme-toggle class="anav-item" style="justify-content:space-between;">' + (document.documentElement.classList.contains('dark-mode') ? '☀️ Light mode' : '🌙 Dark mode') + '</button>' +
              '<button onclick="siteSignOut()" class="anav-item anav-item-danger">→ Sign Out</button>' +
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
          var actions = document.querySelector('.site-nav-actions');
          if (actions) { actions.innerHTML = ''; renderNav && renderNav(); }
        }
      }).catch(function(){});
    } catch(e) {}
  }
  // Refresh once after 5s then every 5 minutes
  setTimeout(refreshSession, 5000);
  setInterval(refreshSession, 5 * 60 * 1000);
})();

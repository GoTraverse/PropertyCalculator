/**
 * EquitySight.app — Shared Auth Header Nav
 */
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
              '<button onclick="if(window.openAccountPanel){openAccountPanel();}else{location.href=\'app.html?openAccount=1\';}" class="anav-item">⚙ Account Settings</button>' +
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

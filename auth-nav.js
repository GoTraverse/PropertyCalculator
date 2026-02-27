/**
 * mypropertymate.app — Shared Auth Header Nav
 * Renders a consistent profile avatar + dropdown in .site-nav-actions
 * on every page EXCEPT app.html (which has its own fixed widget).
 */
(function() {
  const SESSION_KEY  = 'propCalc_session_v1';
  const PK_BASE      = 'propCalc_profile_v1';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
  }
  function getProfile(userId) {
    try {
      const key = PK_BASE + '_' + (userId || 'guest');
      return JSON.parse(localStorage.getItem(key));
    } catch(e) { return null; }
  }

  window.siteSignOut = function() {
    const sess = getSession();
    if (sess && sess.token) {
      fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signout', token: sess.token })
      }).catch(function(){});
    }
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  };

  function renderNav() {
    const actions = document.querySelector('.site-nav-actions');
    if (!actions) return;

    const session = getSession();
    const profile = session ? getProfile(session.id || session.userId) : null;

    if (session && (session.id || session.email)) {
      const name     = session.name || session.email || 'Account';
      const email    = session.email || '';
      const color    = (profile && profile.color) || '#C9A84C';
      const photo    = profile && profile.photo;
      const initials = name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2) || '?';

      // Determine current page for active link
      const page = window.location.pathname.split('/').pop() || 'index.html';

      actions.innerHTML =
        '<a href="app.html" style="font-family:\'DM Mono\',monospace;font-size:11px;color:rgba(245,240,232,0.55);' +
        'padding:8px 14px;border-radius:3px;background:rgba(255,255,255,0.06);text-decoration:none;' +
        'border:1px solid rgba(255,255,255,0.1);white-space:nowrap;">Open App →</a>' +

        '<div style="position:relative;" id="site-profile-wrap">' +
          '<button id="site-profile-btn" onclick="document.getElementById(\'site-profile-menu\').classList.toggle(\'open\')" ' +
          'style="width:36px;height:36px;border-radius:50%;background:' + (photo ? 'transparent' : color) + ';' +
          'border:2px solid rgba(255,255,255,0.2);cursor:pointer;display:flex;align-items:center;' +
          'justify-content:center;font-family:\'DM Mono\',monospace;font-size:13px;font-weight:700;' +
          'color:#1C1C1E;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s;flex-shrink:0;" title="' + name + '">' +
          (photo
            ? '<img src="' + photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
            : initials) +
          '</button>' +

          '<div id="site-profile-menu" style="display:none;position:absolute;top:46px;right:0;' +
          'background:#1C1C1E;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px;' +
          'min-width:200px;box-shadow:0 12px 40px rgba(0,0,0,0.6);z-index:9999;">' +

            '<div style="padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:4px;">' +
              '<div style="font-size:13px;font-weight:600;color:#F5F0E8;">' + name + '</div>' +
              '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:rgba(245,240,232,0.35);margin-top:2px;">' + email + '</div>' +
            '</div>' +

            '<div style="padding:2px 0;">' +
              '<a href="app.html" style="display:flex;align-items:center;gap:9px;padding:8px 12px;' +
              'color:rgba(245,240,232,0.7);font-size:13px;border-radius:4px;text-decoration:none;' +
              (page==='app.html' ? 'background:rgba(255,255,255,0.06);' : '') + '"' +
              ' onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'' + (page==='app.html' ? 'rgba(255,255,255,0.06)' : '') + '\'">🏠 Open Calculator</a>' +

              '<a href="account.html" style="display:flex;align-items:center;gap:9px;padding:8px 12px;' +
              'color:rgba(245,240,232,0.7);font-size:13px;border-radius:4px;text-decoration:none;' +
              (page==='account.html' ? 'background:rgba(255,255,255,0.06);' : '') + '"' +
              ' onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'' + (page==='account.html' ? 'rgba(255,255,255,0.06)' : '') + '\'">⚙ Account Settings</a>' +

              '<button onclick="siteSignOut()" style="width:100%;text-align:left;display:flex;align-items:center;' +
              'gap:9px;padding:8px 12px;color:rgba(245,240,232,0.45);font-size:13px;border-radius:4px;' +
              'background:none;border:none;cursor:pointer;font-family:inherit;"' +
              ' onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'\'">→ Sign Out</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      // Close menu on outside click
      document.addEventListener('click', function(e) {
        const wrap = document.getElementById('site-profile-wrap');
        if (wrap && !wrap.contains(e.target)) {
          const menu = document.getElementById('site-profile-menu');
          if (menu) menu.classList.remove('open');
        }
      });

      // CSS for open state
      var style = document.createElement('style');
      style.textContent = '#site-profile-menu.open{display:block!important;}' +
        '#site-profile-btn:hover{transform:scale(1.1);box-shadow:0 0 0 3px rgba(201,168,76,0.25);}';
      document.head.appendChild(style);

    } else {
      // Not signed in — show default buttons
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

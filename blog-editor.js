/**
 * blog-editor.js — Dedicated blog editor page logic
 *
 * Self-contained: includes auth verification, all blog CRUD, toast, confirm.
 * Auth via HttpOnly es_session cookie (same as admin.js).
 * URL param: ?id=POST_ID to open a specific post on load.
 */

var SESSION_KEY = 'propCalc_session_v1';
var _currentPostId = null;
var _metaOpen = false;
var _toastTimer = null;
var _confirmResolveFn = null;

// ── Utilities ────────────────────────────────────────────────────────────────

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function callAuth(action, payload) {
  try {
    var r = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    return r.json();
  } catch (e) {
    return { ok: false, error: 'Network error — ' + e.message };
  }
}

async function callBlog(action, payload, opts) {
  opts = opts || {};
  try {
    var url = '/.netlify/functions/blog';
    var method = 'POST';
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    if (opts.get) {
      url += '?' + new URLSearchParams(Object.assign({ action: action }, payload || {})).toString();
      method = 'GET';
      body = undefined;
    }
    var r = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body
    });
    return r.json();
  } catch (e) {
    return { ok: false, error: 'Network error — ' + e.message };
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, isErr) {
  var el = document.getElementById('be-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'be-toast ' + (isErr ? 'err' : 'ok');
  el.style.display = 'block';
  el.style.opacity = '1';
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    el.style.opacity = '0';
    setTimeout(function () { el.style.display = 'none'; }, 300);
  }, isErr ? 4000 : 2500);
}

// ── Confirm dialog ───────────────────────────────────────────────────────────

function beConfirm(title, msg, confirmLabel) {
  return new Promise(function (resolve) {
    _confirmResolveFn = resolve;
    document.getElementById('be-confirm-title').textContent = title;
    document.getElementById('be-confirm-msg').textContent = msg;
    document.getElementById('be-confirm-ok').textContent = confirmLabel || 'Delete';
    document.getElementById('be-confirm-overlay').style.display = 'flex';
  });
}

function beConfirmClose(val) {
  document.getElementById('be-confirm-overlay').style.display = 'none';
  if (_confirmResolveFn) { var fn = _confirmResolveFn; _confirmResolveFn = null; fn(val); }
}

// ── Topbar save-status ───────────────────────────────────────────────────────

var _statusTimer = null;
function setTopbarStatus(msg, isErr) {
  var el = document.getElementById('be-save-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? '#f87171' : 'rgba(245,240,232,0.55)';
  if (_statusTimer) clearTimeout(_statusTimer);
  if (!isErr) _statusTimer = setTimeout(function () { el.textContent = ''; }, 3500);
}

// ── Blog helpers ─────────────────────────────────────────────────────────────

function blogSlugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function blogFormatDate(ms) {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (e) { return '—'; }
}

// ── Post list ────────────────────────────────────────────────────────────────

async function loadBlogPosts() {
  var listEl = document.getElementById('blog-posts-list');
  var statsEl = document.getElementById('blog-stats');
  if (!listEl) return;
  listEl.innerHTML = '<div class="be-list-loading">Loading…</div>';

  var res = await callBlog('adminListPosts');
  if (!res || !res.ok) {
    listEl.innerHTML = '<div class="be-list-loading" style="color:#c62828;">Failed: ' + escHtml(res && res.error || 'unknown error') + '</div>';
    return;
  }

  var posts = res.posts || [];
  var published = posts.filter(function (p) { return p.status === 'published'; }).length;
  if (statsEl) {
    statsEl.textContent = posts.length + ' post' + (posts.length === 1 ? '' : 's') + ' · ' + published + ' published · ' + (posts.length - published) + ' draft';
  }

  if (!posts.length) {
    listEl.innerHTML = '<div class="be-list-loading">No posts yet — click + New Post.</div>';
    return;
  }

  var html = posts.map(function (p) {
    var badge = p.status === 'published'
      ? '<span class="be-post-badge be-post-badge-pub">Live</span>'
      : '<span class="be-post-badge be-post-badge-draft">Draft</span>';
    var active = (p.id === _currentPostId) ? ' active' : '';
    return '<div class="be-post-item' + active + '" data-id="' + escHtml(p.id) + '">' +
      '<div class="be-post-item-title">' + escHtml(p.title || '(untitled)') + '</div>' +
      '<div class="be-post-item-meta">' + badge + escHtml(blogFormatDate(p.updated_at || p.created_at)) + '</div>' +
      '</div>';
  }).join('');
  listEl.innerHTML = html;

  listEl.querySelectorAll('.be-post-item').forEach(function (el) {
    el.addEventListener('click', function () {
      blogOpenEditor(this.dataset.id);
      // Mobile: close sidebar after selection
      if (window.innerWidth <= 720) {
        document.getElementById('be-sidebar').classList.remove('open');
      }
    });
  });
}

// ── Editor open / reset ──────────────────────────────────────────────────────

function blogResetEditor() {
  _currentPostId = null;
  document.getElementById('blog-edit-id').value = '';
  var fields = ['blog-edit-title', 'blog-edit-slug', 'blog-edit-excerpt', 'blog-edit-tags',
                'blog-edit-author', 'blog-edit-cover', 'blog-edit-author-bio',
                'blog-edit-body', 'blog-edit-meta-desc'];
  fields.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var cat = document.getElementById('blog-edit-category'); if (cat) cat.value = 'general';
  var feat = document.getElementById('blog-edit-featured'); if (feat) feat.checked = false;
  var slugEl = document.getElementById('blog-edit-slug');
  if (slugEl) slugEl.dataset.touched = '';
  document.getElementById('blog-edit-status').innerHTML = '';
  document.getElementById('blog-editor-title').textContent = 'New Post';
  // Hide unpublish + delete for brand-new posts
  setEditingExistingPost(false);
  blogSetEditorMode('write');
  blogUpdateWordCount();
  blogUpdateMetaDescCount();
  updateActiveListItem(null);
}

function setEditingExistingPost(exists) {
  var unpubBtn = document.getElementById('blog-unpublish-btn');
  var delBtn = document.getElementById('blog-delete-btn');
  if (unpubBtn) unpubBtn.style.display = exists ? '' : 'none';
  if (delBtn) delBtn.style.display = exists ? '' : 'none';
}

function updateActiveListItem(id) {
  document.querySelectorAll('.be-post-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

async function blogOpenEditor(id) {
  var emptyEl = document.getElementById('be-empty');
  var formEl = document.getElementById('blog-editor-form');
  if (emptyEl) emptyEl.style.display = 'none';
  if (formEl) formEl.style.display = '';

  if (!id) {
    blogResetEditor();
    return;
  }

  _currentPostId = id;
  updateActiveListItem(id);
  document.getElementById('blog-editor-title').textContent = 'Loading…';
  setEditingExistingPost(false);

  var res = await callBlog('adminGetPost', { id: id });
  if (!res || !res.ok || !res.post) {
    showToast('Failed to load post', true);
    return;
  }
  var p = res.post;
  _currentPostId = p.id;
  document.getElementById('blog-edit-id').value = p.id || '';
  document.getElementById('blog-edit-title').value = p.title || '';
  document.getElementById('blog-edit-slug').value = p.slug || '';
  document.getElementById('blog-edit-excerpt').value = p.excerpt || '';
  document.getElementById('blog-edit-tags').value = (p.tags || []).join(', ');
  document.getElementById('blog-edit-author').value = p.author || '';
  document.getElementById('blog-edit-cover').value = p.cover_image || '';
  document.getElementById('blog-edit-author-bio').value = p.author_bio || '';
  document.getElementById('blog-edit-body').value = p.body_md || '';
  var catEl = document.getElementById('blog-edit-category'); if (catEl) catEl.value = p.category || 'general';
  var featEl = document.getElementById('blog-edit-featured'); if (featEl) featEl.checked = !!p.featured;
  var metaEl = document.getElementById('blog-edit-meta-desc'); if (metaEl) metaEl.value = p.meta_description || '';
  document.getElementById('blog-editor-title').textContent = 'Editing: ' + (p.title || '(untitled)');
  document.getElementById('blog-edit-status').innerHTML = '';
  setEditingExistingPost(true);
  blogSetEditorMode('write');
  blogUpdateWordCount();
  blogUpdateMetaDescCount();
}

// ── Collect form ─────────────────────────────────────────────────────────────

function blogCollectForm() {
  var catEl = document.getElementById('blog-edit-category');
  var featEl = document.getElementById('blog-edit-featured');
  var metaEl = document.getElementById('blog-edit-meta-desc');
  return {
    id: document.getElementById('blog-edit-id').value || undefined,
    title: document.getElementById('blog-edit-title').value.trim(),
    slug: document.getElementById('blog-edit-slug').value.trim() || blogSlugify(document.getElementById('blog-edit-title').value),
    excerpt: document.getElementById('blog-edit-excerpt').value.trim(),
    tags: document.getElementById('blog-edit-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
    author: document.getElementById('blog-edit-author').value.trim(),
    author_bio: document.getElementById('blog-edit-author-bio').value.trim(),
    cover_image: document.getElementById('blog-edit-cover').value.trim(),
    body_md: document.getElementById('blog-edit-body').value,
    category: catEl ? (catEl.value || 'general') : 'general',
    featured: !!(featEl && featEl.checked),
    meta_description: metaEl ? metaEl.value.trim() : ''
  };
}

// ── Status in editor ─────────────────────────────────────────────────────────

function blogSetStatus(msg, isErr) {
  var el = document.getElementById('blog-edit-status');
  if (!el) return;
  el.innerHTML = '<span style="padding:6px 10px;border-radius:3px;font-size:11px;' +
    (isErr ? 'background:rgba(198,40,40,0.1);color:#c62828;'
           : 'background:rgba(46,125,50,0.1);color:#2e7d32;') +
    '">' + escHtml(msg) + '</span>';
}

// ── Save / publish ───────────────────────────────────────────────────────────

async function blogSavePost(publish) {
  var post = blogCollectForm();
  if (!post.title || post.title.length < 4) { blogSetStatus('Title must be at least 4 chars', true); return; }
  if (!post.body_md || post.body_md.length < 200) { blogSetStatus('Body must be at least 200 chars', true); return; }

  var draftBtn = document.getElementById('blog-save-draft-btn');
  var pubBtn = document.getElementById('blog-save-publish-btn');
  if (draftBtn) draftBtn.disabled = true;
  if (pubBtn) { pubBtn.disabled = true; pubBtn.textContent = publish ? 'Publishing…' : 'Saving…'; }

  try {
    var res = await callBlog('adminSavePost', { post: post });
    if (!res || !res.ok) {
      blogSetStatus('Save failed: ' + (res && res.error || 'unknown'), true);
      return;
    }
    // Update hidden ID field (in case this was a new post)
    document.getElementById('blog-edit-id').value = res.id;
    _currentPostId = res.id;
    setEditingExistingPost(true);

    if (publish) {
      var pub = await callBlog('adminPublish', { id: res.id });
      if (!pub || !pub.ok) {
        blogSetStatus('Saved but publish failed: ' + (pub && pub.error || 'unknown'), true);
        return;
      }
      setTopbarStatus('Published ✓');
      showToast('Post published ✓');
      document.getElementById('blog-editor-title').textContent = 'Editing: ' + post.title;
    } else {
      blogSetStatus('Draft saved ✓', false);
      setTopbarStatus('Saved as draft');
    }
    // Refresh post list to reflect status changes
    loadBlogPosts();
  } finally {
    if (draftBtn) draftBtn.disabled = false;
    if (pubBtn) { pubBtn.disabled = false; pubBtn.textContent = 'Save & Publish'; }
  }
}

// ── Unpublish ────────────────────────────────────────────────────────────────

async function blogUnpublish() {
  var id = document.getElementById('blog-edit-id').value;
  if (!id) return;
  var res = await callBlog('adminUnpublish', { id: id });
  if (!res || !res.ok) { blogSetStatus('Unpublish failed: ' + (res && res.error || 'unknown'), true); return; }
  blogSetStatus('Moved back to draft ✓', false);
  setTopbarStatus('Unpublished');
  loadBlogPosts();
}

// ── Delete ───────────────────────────────────────────────────────────────────

async function blogDeletePost() {
  var id = document.getElementById('blog-edit-id').value;
  if (!id) { blogSetStatus('Nothing to delete', true); return; }
  var confirmed = await beConfirm(
    'Delete this post?',
    'This permanently removes the post from Redis. It will disappear from the public blog on the next deploy.',
    'Delete'
  );
  if (!confirmed) return;
  var res = await callBlog('adminDeletePost', { id: id });
  if (!res || !res.ok) { blogSetStatus('Delete failed: ' + (res && res.error || 'unknown'), true); return; }
  showToast('Post deleted');
  // Close editor, show empty state
  document.getElementById('blog-editor-form').style.display = 'none';
  document.getElementById('be-empty').style.display = '';
  _currentPostId = null;
  loadBlogPosts();
}

// ── Word count ───────────────────────────────────────────────────────────────

function blogUpdateWordCount() {
  var el = document.getElementById('blog-edit-body');
  var out = document.getElementById('blog-edit-wordcount');
  if (!el || !out) return;
  var words = (el.value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|\[\]()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;
  var mins = Math.max(1, Math.round(words / 220));
  var gap = 1500 - words;
  out.textContent = words + ' words · ' + mins + ' min read · ' +
    (gap > 0 ? gap + ' to AdSense floor' : '✓ above 1,500-word floor');
  out.style.color = gap > 0 ? '' : '#2e7d32';
}

// ── Sync to GitHub ───────────────────────────────────────────────────────────

async function blogSyncAllToGitHub() {
  var btn = document.getElementById('blog-sync-github-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  var res = await callBlog('adminSyncAllToGitHub');
  if (btn) { btn.disabled = false; btn.textContent = 'Sync to GitHub'; }
  if (res && res.ok) {
    showToast('Synced ' + (res.synced || 0) + ' post(s) — deploy triggered');
  } else {
    showToast('Sync failed: ' + (res && res.error || 'unknown'), true);
  }
}

// ── Auto-slug from title ─────────────────────────────────────────────────────

function blogAutoSlug() {
  var titleEl = document.getElementById('blog-edit-title');
  var slugEl = document.getElementById('blog-edit-slug');
  var idEl = document.getElementById('blog-edit-id');
  if (!titleEl || !slugEl) return;
  if (idEl.value) return; // don't overwrite slug for existing posts
  if (slugEl.dataset.touched === '1') return;
  slugEl.value = blogSlugify(titleEl.value);
}

// ── Markdown preview renderer ────────────────────────────────────────────────

function blogRenderPreview(md) {
  if (!md) return '<p style="color:var(--slate);font-style:italic;">(Nothing to preview yet.)</p>';
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var out = esc(md);
  // Fenced code
  out = out.replace(/```([\s\S]*?)```/g, function (_, body) {
    return '<pre style="background:#f5f3ee;padding:12px 14px;border-radius:4px;overflow:auto;font-size:12px;"><code>' + body.replace(/^\n/, '') + '</code></pre>';
  });
  // Headings
  out = out.replace(/^### (.+)$/gm, '<h3 style="margin-top:22px;font-size:16px;">$1</h3>');
  out = out.replace(/^## (.+)$/gm, '<h2 style="margin-top:28px;font-size:19px;border-bottom:1px solid rgba(28,28,30,0.08);padding-bottom:6px;">$1</h2>');
  out = out.replace(/^# (.+)$/gm, '<h1 style="font-size:24px;margin-top:8px;">$1</h1>');
  // Blockquote
  out = out.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #C9A84C;padding:4px 14px;color:var(--slate);margin:10px 0;font-style:italic;">$1</blockquote>');
  // Inline
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code style="background:#f5f3ee;padding:2px 5px;border-radius:3px;font-size:0.92em;">$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#C9A84C;" target="_blank" rel="noopener">$1</a>');
  // Unordered lists
  out = out.replace(/(^|\n)((?:- .+\n?)+)/g, function (_, pre, block) {
    var items = block.trim().split(/\n/).map(function (l) { return '<li style="margin:4px 0;">' + l.replace(/^- /, '') + '</li>'; }).join('');
    return pre + '<ul style="margin:12px 0;padding-left:24px;">' + items + '</ul>';
  });
  // Paragraphs
  out = out.split(/\n\n+/).map(function (para) {
    if (/^\s*<(h\d|ul|ol|pre|blockquote)/.test(para)) return para;
    return '<p style="margin:10px 0;line-height:1.75;">' + para.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
  return out;
}

// ── Write / Preview mode ─────────────────────────────────────────────────────

function blogSetEditorMode(mode) {
  var body = document.getElementById('blog-edit-body');
  var prev = document.getElementById('blog-edit-preview');
  var wBtn = document.getElementById('blog-edit-mode-write');
  var pBtn = document.getElementById('blog-edit-mode-preview');
  if (!body || !prev) return;
  if (mode === 'preview') {
    prev.innerHTML = blogRenderPreview(body.value);
    body.style.display = 'none';
    prev.style.display = 'block';
    if (wBtn) wBtn.classList.remove('active');
    if (pBtn) pBtn.classList.add('active');
  } else {
    body.style.display = '';
    prev.style.display = 'none';
    if (wBtn) wBtn.classList.add('active');
    if (pBtn) pBtn.classList.remove('active');
  }
}

// ── Meta description counter ─────────────────────────────────────────────────

function blogUpdateMetaDescCount() {
  var el = document.getElementById('blog-edit-meta-desc');
  var out = document.getElementById('blog-edit-metadesc-count');
  if (!el || !out) return;
  var n = (el.value || '').trim().length;
  var hint = n === 0 ? '(uses excerpt)' : n < 50 ? 'too short — aim for 50–160' : n > 160 ? 'too long — Google truncates past 160' : '✓ good length';
  out.textContent = n + ' chars · ' + hint;
  out.style.color = (n === 0 || (n >= 50 && n <= 160)) ? 'var(--slate)' : '#c2410c';
}

// ── Post Settings toggle ─────────────────────────────────────────────────────

function toggleMeta() {
  _metaOpen = !_metaOpen;
  var extraEl = document.getElementById('be-meta-extra');
  var toggleBtn = document.getElementById('be-meta-toggle');
  if (extraEl) extraEl.classList.toggle('open', _metaOpen);
  if (toggleBtn) {
    toggleBtn.classList.toggle('open', _metaOpen);
    toggleBtn.querySelector('.be-meta-toggle-arrow').textContent = _metaOpen ? '▾' : '▸';
  }
}

// ── Auth & init ──────────────────────────────────────────────────────────────

function showAccessDenied(msg) {
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('editor-layout').style.display = 'none';
  var ad = document.getElementById('access-denied');
  ad.style.display = 'flex';
  if (msg) document.getElementById('access-denied-msg').textContent = msg;
}

async function init() {
  var sess = getSession();
  document.getElementById('loading-view').style.display = 'none';

  if (!sess || !(sess.id || sess.email)) {
    showAccessDenied('Please sign in to access the blog editor.');
    return;
  }

  var d = {};
  try { d = await callAuth('verify', {}); } catch (e) {
    showAccessDenied('Network error verifying session — check your connection.');
    return;
  }

  if (!d.ok) {
    showAccessDenied(d.error || 'Could not verify your session — please sign in again.');
    return;
  }

  if (d.role !== 'admin') {
    showAccessDenied('The blog editor requires an admin account.');
    return;
  }

  // Show editor
  var layout = document.getElementById('editor-layout');
  layout.style.display = 'flex';
  layout.style.flexDirection = 'column';

  // Load posts
  loadBlogPosts();

  // Open post from URL param (?id=...) if present
  var urlId = new URLSearchParams(window.location.search).get('id');
  if (urlId) {
    blogOpenEditor(urlId);
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  init();

  // Confirm dialog
  var confirmCancel = document.getElementById('be-confirm-cancel');
  if (confirmCancel) confirmCancel.addEventListener('click', function () { beConfirmClose(false); });
  var confirmOk = document.getElementById('be-confirm-ok');
  if (confirmOk) confirmOk.addEventListener('click', function () { beConfirmClose(true); });
  document.getElementById('be-confirm-overlay').addEventListener('click', function (e) {
    if (e.target === this) beConfirmClose(false);
  });

  // New Post buttons
  var newBtn = document.getElementById('blog-new-post-btn');
  if (newBtn) newBtn.addEventListener('click', function () {
    blogOpenEditor('');
    if (window.innerWidth <= 720) document.getElementById('be-sidebar').classList.remove('open');
  });
  var newBtn2 = document.getElementById('blog-new-post-btn-2');
  if (newBtn2) newBtn2.addEventListener('click', function () {
    blogOpenEditor('');
    if (window.innerWidth <= 720) document.getElementById('be-sidebar').classList.remove('open');
  });

  // Close editor
  var closeBtn = document.getElementById('blog-editor-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', function () {
    document.getElementById('blog-editor-form').style.display = 'none';
    document.getElementById('be-empty').style.display = '';
    _currentPostId = null;
    updateActiveListItem(null);
  });

  // Save / publish
  var saveDraftBtn = document.getElementById('blog-save-draft-btn');
  if (saveDraftBtn) saveDraftBtn.addEventListener('click', function () { blogSavePost(false); });
  var savePublishBtn = document.getElementById('blog-save-publish-btn');
  if (savePublishBtn) savePublishBtn.addEventListener('click', function () { blogSavePost(true); });

  // Unpublish
  var unpubBtn = document.getElementById('blog-unpublish-btn');
  if (unpubBtn) unpubBtn.addEventListener('click', blogUnpublish);

  // Delete
  var deleteBtn = document.getElementById('blog-delete-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', blogDeletePost);

  // Sync to GitHub
  var syncBtn = document.getElementById('blog-sync-github-btn');
  if (syncBtn) syncBtn.addEventListener('click', blogSyncAllToGitHub);

  // Body: word count on input
  var bodyEl = document.getElementById('blog-edit-body');
  if (bodyEl) bodyEl.addEventListener('input', blogUpdateWordCount);

  // Title: auto-slug
  var titleEl = document.getElementById('blog-edit-title');
  if (titleEl) titleEl.addEventListener('input', function () {
    blogAutoSlug();
    // Update editor header title live
    var headTitle = document.getElementById('blog-editor-title');
    var idVal = document.getElementById('blog-edit-id').value;
    if (!idVal) headTitle.textContent = 'New Post' + (this.value ? ': ' + this.value : '');
  });

  // Slug: mark as touched when manually edited
  var slugEl = document.getElementById('blog-edit-slug');
  if (slugEl) slugEl.addEventListener('input', function () { this.dataset.touched = '1'; });

  // Meta desc counter
  var metaEl = document.getElementById('blog-edit-meta-desc');
  if (metaEl) metaEl.addEventListener('input', blogUpdateMetaDescCount);

  // Write / Preview mode
  var writeModeBtn = document.getElementById('blog-edit-mode-write');
  if (writeModeBtn) writeModeBtn.addEventListener('click', function () { blogSetEditorMode('write'); });
  var previewModeBtn = document.getElementById('blog-edit-mode-preview');
  if (previewModeBtn) previewModeBtn.addEventListener('click', function () { blogSetEditorMode('preview'); });

  // Post Settings toggle
  var metaToggle = document.getElementById('be-meta-toggle');
  if (metaToggle) metaToggle.addEventListener('click', toggleMeta);

  // Mobile sidebar toggle
  var sidebarToggle = document.getElementById('be-sidebar-toggle');
  if (sidebarToggle) sidebarToggle.addEventListener('click', function () {
    document.getElementById('be-sidebar').classList.toggle('open');
  });

  // Keyboard shortcut: Ctrl/Cmd+S → save draft
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      var formVisible = document.getElementById('blog-editor-form').style.display !== 'none';
      if (formVisible) blogSavePost(false);
    }
    // Escape: close confirm
    if (e.key === 'Escape') {
      var overlay = document.getElementById('be-confirm-overlay');
      if (overlay && overlay.style.display !== 'none') beConfirmClose(false);
    }
  });
});

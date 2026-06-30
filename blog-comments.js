/**
 * blog-comments.js — Frontend hydration for blog post comment form + pagination
 *
 * - Reads session from propCalc_session_v1 (localStorage)
 * - Mounts comment form into #comment-form-mount
 * - Guest users see "Sign in to comment" CTA instead
 * - On submit POSTs to /.netlify/functions/comments — auth via es_session cookie
 * - "Show more comments" button loads additional approved comments via GET list
 *
 * Static (build-time) comments block lives at #blog-comments — this script
 * only extends it when the visitor clicks "Load more".
 */
(function () {
  'use strict';

  var SESSION_KEY = 'propCalc_session_v1';
  var API = '/.netlify/functions/comments';
  var PAGE_SIZE = 20;

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function getFormCtx() {
    var wrap = document.getElementById('comment-form');
    if (!wrap) return null;
    return {
      wrap: wrap,
      slug: wrap.getAttribute('data-post-slug') || '',
      title: wrap.getAttribute('data-post-title') || '',
      mount: document.getElementById('comment-form-mount'),
    };
  }

  function renderGuestCTA(ctx) {
    ctx.mount.innerHTML =
      '<div class="blog-comment-guest">' +
        '<p>Please sign in to join the discussion.</p>' +
        '<a class="tool-cta-btn" href="/login?tab=signin">Sign in →</a>' +
      '</div>';
  }

  function renderForm(ctx) {
    ctx.mount.innerHTML =
      '<form class="blog-comment-form" id="blog-comment-form" autocomplete="off">' +
        '<label class="blog-comment-field">' +
          '<span>Your comment <small>(min. 20 characters)</small></span>' +
          '<textarea name="body" id="blog-comment-body" rows="5" required minlength="20" maxlength="2000" placeholder="Share your thoughts, questions, or experience…"></textarea>' +
          '<small class="blog-comment-counter" id="blog-comment-counter">0 / 20 minimum</small>' +
        '</label>' +
        '<div class="blog-comment-form-actions">' +
          '<button type="submit" class="tool-cta-btn" id="blog-comment-submit">Post comment</button>' +
          '<span class="blog-comment-notice">Moderated before it appears.</span>' +
        '</div>' +
        '<div class="blog-comment-result" id="blog-comment-result" role="status" aria-live="polite"></div>' +
      '</form>';

    wireForm(ctx);
  }

  function wireForm(ctx) {
    var form = document.getElementById('blog-comment-form');
    var bodyEl = document.getElementById('blog-comment-body');
    var counter = document.getElementById('blog-comment-counter');
    var result = document.getElementById('blog-comment-result');
    var submit = document.getElementById('blog-comment-submit');

    bodyEl.addEventListener('input', function () {
      var len = bodyEl.value.length;
      if (len >= 20) {
        counter.textContent = len + ' characters';
        counter.classList.add('is-ok');
      } else {
        counter.textContent = len + ' / 20 minimum';
        counter.classList.remove('is-ok');
      }
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      result.textContent = '';
      result.className = 'blog-comment-result';

      var sess = getSession();
      if (!sess || !sess.id) {
        result.textContent = 'Your session has expired — please sign in again.';
        result.classList.add('is-error');
        return;
      }

      var body = bodyEl.value.trim();
      if (body.length < 20) {
        result.textContent = 'Comment must be at least 20 characters.';
        result.classList.add('is-error');
        return;
      }
      if (body.length > 2000) {
        result.textContent = 'Comment must be under 2000 characters.';
        result.classList.add('is-error');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Posting…';

      try {
        var r = await fetch(API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'submitComment',
            postSlug: ctx.slug,
            body: body,
          }),
        });
        var data = await r.json();
        if (data && data.ok) {
          form.reset();
          counter.textContent = '0 / 20 minimum';
          counter.classList.remove('is-ok');
          result.textContent = data.message || 'Thanks — your comment is pending moderation.';
          result.classList.add('is-success');
        } else {
          result.textContent = (data && data.error) || 'Failed to submit comment.';
          result.classList.add('is-error');
        }
      } catch (err) {
        result.textContent = 'Network error — please try again.';
        result.classList.add('is-error');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Post comment';
      }
    });
  }

  // ── "Show more comments" pagination ────────────────────────────────
  function wireLoadMore(ctx) {
    var section = document.getElementById('blog-comments');
    if (!section) return;
    var list = document.getElementById('blog-comments-list');
    if (!list) return;

    var total = parseInt(section.getAttribute('data-total'), 10) || 0;
    var rendered = list.querySelectorAll('.blog-comment-card').length;
    if (total <= rendered) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'blog-comment-more-btn';
    btn.textContent = 'Show more comments';
    list.parentNode.insertBefore(btn, list.nextSibling);

    var page = 2; // page 1 is already rendered server-side

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        var url = API + '?action=list&slug=' + encodeURIComponent(ctx.slug)
          + '&page=' + page + '&pageSize=' + PAGE_SIZE;
        var r = await fetch(url);
        var data = await r.json();
        if (!data || !data.ok || !Array.isArray(data.items)) throw new Error((data && data.error) || 'Failed');

        data.items.forEach(function (c) {
          var article = document.createElement('article');
          article.className = 'blog-comment-card';
          var name = c.userName || 'Anonymous';
          var initial = (String(name).trim().charAt(0) || 'A').toUpperCase();
          article.setAttribute('data-initial', initial);
          var date = '';
          if (c.created_at) {
            var d = new Date(c.created_at);
            if (!isNaN(d)) date = d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
          }
          // Body is escaped server-side at submit time; we also escape here as
          // defense-in-depth before insertion, then transform newlines to <br>.
          var bodyHtml = escHtml(String(c.body || '')).replace(/\n/g, '<br>');
          article.innerHTML =
            '<header class="blog-comment-head">' +
              '<span class="blog-comment-user">' + escHtml(name) + '</span>' +
              (date ? ' <span class="blog-comment-dot">·</span> <span class="blog-comment-date">' + escHtml(date) + '</span>' : '') +
            '</header>' +
            '<div class="blog-comment-body">' + bodyHtml + '</div>';
          list.appendChild(article);
        });
        rendered += data.items.length;
        page += 1;
        if (rendered >= total || data.items.length < PAGE_SIZE) {
          btn.remove();
        } else {
          btn.disabled = false;
          btn.textContent = 'Show more comments';
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Retry — load more';
      }
    });
  }

  function init() {
    var ctx = getFormCtx();
    if (!ctx || !ctx.mount) return;
    var sess = getSession();
    if (sess && sess.id) renderForm(ctx);
    else renderGuestCTA(ctx);
    wireLoadMore(ctx);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

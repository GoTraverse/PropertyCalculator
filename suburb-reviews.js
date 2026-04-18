/**
 * suburb-reviews.js — Frontend hydration for suburb review form + pagination
 *
 * - Reads session from propCalc_session_v1 (localStorage)
 * - Mounts star picker + form into #review-form-mount
 * - Guest users see "Sign in to leave a review" CTA instead
 * - On submit POSTs to /.netlify/functions/reviews with Bearer token
 * - "Show more reviews" button loads additional approved reviews via GET list
 *
 * Static (build-time) reviews block lives at #community-reviews — this script
 * only extends it when the visitor clicks "Load more".
 */
(function () {
  'use strict';

  var SESSION_KEY = 'propCalc_session_v1';
  var API = '/.netlify/functions/reviews';
  var PAGE_SIZE = 10;

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
    var wrap = document.getElementById('review-form');
    if (!wrap) return null;
    return {
      wrap: wrap,
      slug: wrap.getAttribute('data-suburb-slug') || '',
      state: wrap.getAttribute('data-state') || '',
      suburbName: wrap.getAttribute('data-suburb-name') || '',
      mount: document.getElementById('review-form-mount'),
    };
  }

  function renderGuestCTA(ctx) {
    var returnPath = '/suburb/' + encodeURIComponent(ctx.state) + '/' + encodeURIComponent(ctx.slug);
    ctx.mount.innerHTML =
      '<div class="suburb-review-guest">' +
        '<p>Please sign in to leave a review of ' + escHtml(ctx.suburbName) + '.</p>' +
        '<a class="tool-cta-btn" href="/login?tab=signin&next=' + encodeURIComponent(returnPath) + '">Sign in →</a>' +
      '</div>';
  }

  function renderForm(ctx) {
    ctx.mount.innerHTML =
      '<form class="suburb-review-form" id="suburb-review-form" autocomplete="off">' +
        '<fieldset class="suburb-review-stars-picker">' +
          '<legend>Your rating</legend>' +
          '<div class="suburb-review-stars-row" role="radiogroup" aria-label="Your rating (1-5 stars)">' +
            [1,2,3,4,5].map(function(n){
              return '<button type="button" class="suburb-review-star-btn" role="radio" aria-checked="false" data-value="' + n + '" aria-label="' + n + ' star' + (n===1?'':'s') + '">☆</button>';
            }).join('') +
          '</div>' +
          '<input type="hidden" name="rating" id="suburb-review-rating" value="0">' +
        '</fieldset>' +
        '<label class="suburb-review-field">' +
          '<span>Title (a short summary)</span>' +
          '<input type="text" name="title" id="suburb-review-title" maxlength="120" minlength="4" required placeholder="e.g. Great for young families, limited parking">' +
        '</label>' +
        '<label class="suburb-review-field">' +
          '<span>Review <small>(min. 100 characters)</small></span>' +
          '<textarea name="body" id="suburb-review-body" rows="6" required minlength="100" maxlength="4000" placeholder="Share your experience living in or visiting this suburb — lifestyle, transport, schools, safety, value for money..."></textarea>' +
          '<small class="suburb-review-counter" id="suburb-review-counter">0 / 100 minimum</small>' +
        '</label>' +
        '<div class="suburb-review-form-actions">' +
          '<button type="submit" class="tool-cta-btn" id="suburb-review-submit">Submit review</button>' +
          '<span class="suburb-review-notice">Moderated before it appears on site.</span>' +
        '</div>' +
        '<div class="suburb-review-result" id="suburb-review-result" role="status" aria-live="polite"></div>' +
      '</form>';

    wireForm(ctx);
  }

  function wireForm(ctx) {
    var form = document.getElementById('suburb-review-form');
    var ratingInput = document.getElementById('suburb-review-rating');
    var starBtns = form.querySelectorAll('.suburb-review-star-btn');
    var bodyEl = document.getElementById('suburb-review-body');
    var counter = document.getElementById('suburb-review-counter');
    var result = document.getElementById('suburb-review-result');
    var submit = document.getElementById('suburb-review-submit');

    starBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = parseInt(btn.getAttribute('data-value'), 10);
        ratingInput.value = String(val);
        starBtns.forEach(function (b, i) {
          var isOn = (i + 1) <= val;
          b.textContent = isOn ? '★' : '☆';
          b.classList.toggle('is-on', isOn);
          b.setAttribute('aria-checked', isOn && (i + 1) === val ? 'true' : 'false');
        });
      });
    });

    bodyEl.addEventListener('input', function () {
      var len = bodyEl.value.length;
      if (len >= 100) {
        counter.textContent = len + ' characters';
        counter.classList.add('is-ok');
      } else {
        counter.textContent = len + ' / 100 minimum';
        counter.classList.remove('is-ok');
      }
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      result.textContent = '';
      result.className = 'suburb-review-result';

      var sess = getSession();
      if (!sess || !sess.id) {
        result.textContent = 'Your session has expired — please sign in again.';
        result.classList.add('is-error');
        return;
      }

      var rating = parseInt(ratingInput.value, 10);
      var title = document.getElementById('suburb-review-title').value.trim();
      var body = bodyEl.value.trim();

      if (!(rating >= 1 && rating <= 5)) {
        result.textContent = 'Please choose a rating from 1 to 5 stars.';
        result.classList.add('is-error');
        return;
      }
      if (title.length < 4) {
        result.textContent = 'Title must be at least 4 characters.';
        result.classList.add('is-error');
        return;
      }
      if (body.length < 100) {
        result.textContent = 'Review body must be at least 100 characters.';
        result.classList.add('is-error');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Submitting…';

      try {
        var r = await fetch(API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'submitReview',
            state: ctx.state,
            suburbSlug: ctx.slug,
            rating: rating,
            title: title,
            body: body,
          }),
        });
        var data = await r.json();
        if (data && data.ok) {
          form.reset();
          ratingInput.value = '0';
          starBtns.forEach(function (b) { b.textContent = '☆'; b.classList.remove('is-on'); b.setAttribute('aria-checked', 'false'); });
          counter.textContent = '0 / 100 minimum';
          counter.classList.remove('is-ok');
          result.textContent = data.message || 'Thanks — your review is pending moderation.';
          result.classList.add('is-success');
        } else {
          result.textContent = (data && data.error) || 'Failed to submit review.';
          result.classList.add('is-error');
        }
      } catch (err) {
        result.textContent = 'Network error — please try again.';
        result.classList.add('is-error');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Submit review';
      }
    });
  }

  // ── "Show more reviews" pagination ─────────────────────────────────
  function wireLoadMore(ctx) {
    var list = document.querySelector('#community-reviews .suburb-reviews-list');
    var countEl = document.querySelector('#community-reviews .suburb-reviews-count');
    if (!list || !countEl) return;

    // Read total count from the rendered text (e.g. "from 23 reviews")
    var m = /from\s+(\d+)/.exec(countEl.textContent || '');
    var total = m ? parseInt(m[1], 10) : 0;
    var rendered = list.querySelectorAll('.suburb-review-card').length;
    if (total <= rendered) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suburb-review-more-btn';
    btn.textContent = 'Show more reviews';
    list.parentNode.insertBefore(btn, list.nextSibling);

    var page = 2; // server page 1 is already rendered server-side

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        var url = API + '?action=list&state=' + encodeURIComponent(ctx.state)
          + '&slug=' + encodeURIComponent(ctx.slug)
          + '&page=' + page + '&pageSize=' + PAGE_SIZE;
        var r = await fetch(url);
        var data = await r.json();
        if (!data || !data.ok || !Array.isArray(data.items)) throw new Error((data && data.error) || 'Failed');

        data.items.forEach(function (rv) {
          var article = document.createElement('article');
          article.className = 'suburb-review-card';
          var starOn = '★★★★★'.slice(0, Math.max(0, Math.min(5, rv.rating || 0)));
          var starOff = '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, rv.rating || 0)));
          var date = '';
          if (rv.created_at) {
            var d = new Date(rv.created_at);
            if (!isNaN(d)) date = d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short' });
          }
          // rv.title and rv.body are HTML-escaped at submit-time in the function,
          // so they are safe to insert. Newlines → <br>.
          var bodyHtml = String(rv.body || '').replace(/\n/g, '<br>');
          article.innerHTML =
            '<header class="suburb-review-head">' +
              '<div class="suburb-review-stars" aria-label="' + rv.rating + ' out of 5 stars">' + starOn + starOff + '</div>' +
              '<h3 class="suburb-review-title">' + (rv.title || '') + '</h3>' +
              '<div class="suburb-review-meta"><span>' + (rv.userName || 'Anonymous') + '</span>' + (date ? ' <span>·</span> <span>' + date + '</span>' : '') + '</div>' +
            '</header>' +
            '<p class="suburb-review-body">' + bodyHtml + '</p>';
          list.appendChild(article);
        });
        rendered += data.items.length;
        page += 1;
        if (rendered >= total || data.items.length < PAGE_SIZE) {
          btn.remove();
        } else {
          btn.disabled = false;
          btn.textContent = 'Show more reviews';
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

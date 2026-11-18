/**
 * journey.js — The First Home Journey (v4)
 *
 * v2 (owner feedback on live Phase 1a):
 *  - Stop 1 wizard asks the buyer's real profile (9 quick questions), not
 *    just four numbers.
 *  - Every stop is NATIVE — nothing on the trail links out to /app or the
 *    standalone tools. Stops 3/4/5/7 gained first native screens.
 *  - Projector v2: 5% Deposit Scheme with real per-state price caps, and
 *    federal Help to Buy (all states) with income + price eligibility —
 *    replacing the QLD-only shared-equity card.
 *  - /journey is a full guest demo: everything works without an account;
 *    after the first real milestone we ask once for signup, honestly framed
 *    ("guest data lives only in this browser").
 *
 * v4: stage question routes buyers to the stop matching their real-world
 * position; stop 3 is a budget wizard ending in a committed walk-away cap
 * (used by stops 4/5); stop 6 tracks the buyer's real contract deadlines
 * (per-state cooling-off prefill, days-left dashboard).
 *
 * State: localStorage 'propCalc_journey_v1' (guest-first).
 *
 * ⚠ SYNC COPIES (keep in sync with the source files — same rule as the
 * auction tool):
 *  - stateData / calcDuty / FHB concession logic ← tools/stamp-duty-calculator.js
 *    (FY2026-27, verified 5 Jul 2026).
 *  - Scheme constants (5% Deposit Scheme + Help to Buy price caps, H2B income
 *    caps + equity shares) ← tools/first-home-buyer-grants-calculator.js
 *    (verified in-file 12 Jul 2026: FDS has NO income caps from 1 Oct 2025;
 *    H2B $103k single / $165k joint from 1 Jul 2026; equity 40% new / 30%
 *    established; 2% minimum deposit).
 * Phase 1b extracts a shared module and kills these copies.
 */
(function () {
  'use strict';

  var KEY = 'propCalc_journey_v1';

  // ── State ────────────────────────────────────────────────────────────
  function blank() {
    return {
      v: 1,
      done: {},
      numbers: { price: 650000, saved: 60000, saveMo: 2000, state: 'qld' },
      profile: { stage: null, anchor: '', area: 'capital', buyers: 'single', fhb: true, build: 'established', income: null, timeframe: '12mo', dependants: 0, employment: 'payg', rentNow: 0, cardLimits: 0 },
      dealChecks: [false, false, false, false, false],
      settleChecks: [false, false, false, false, false],
      inspections: [],
      scenarios: [],
      budget: { depositPct: null, cap: null },
      deal: { signed: false, dates: {} },
      settle: { price: null, actuals: {} },
      pathPriority: 'soonest',
      signupDismissed: false,
      updatedAt: 0
    };
  }
  // Every state that enters this page — localStorage, the account copy from
  // the server, or a shared/collab journey — must pass through here. Older
  // clients persisted states without newer fields; renderers assume them.
  // It also whitelists every value: a shared or collaborative journey is
  // someone else's data, so nothing in it is trusted to be the right type.
  var ST_LIST = ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt'];
  var PLACE_ST = ['browsed', 'inspected', 'shortlist', 'offer', 'lost', 'passed', 'won'];
  function normalizeState(s) {
    var b = blank();
    if (!s || typeof s !== 'object' || Array.isArray(s)) return b;
    var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
    var num = function (v, def, max) { var x = Number(v); return isFinite(x) && x >= 0 ? Math.min(Math.round(x), max || 1e9) : def; };
    var numOrNull = function (v) { var x = Number(v); return v != null && v !== '' && isFinite(x) && x >= 0 ? Math.min(Math.round(x), 1e9) : null; };
    var str = function (v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; };
    var pick = function (v, list, def) { return list.indexOf(v) !== -1 ? v : def; };
    var isoOrNull = function (v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
    var bools = function (v, len) { var out = []; for (var i = 0; i < len; i++) out.push(!!(Array.isArray(v) && v[i])); return out; };

    var out = { v: 1, done: {} };
    var d = obj(s.done);
    for (var i = 1; i <= 7; i++) if (d[i]) out.done[i] = true;

    var N = obj(s.numbers);
    out.numbers = {
      price: Math.max(50000, num(N.price, b.numbers.price, 5e7)),
      saved: num(N.saved, b.numbers.saved),
      saveMo: num(N.saveMo, b.numbers.saveMo, 1e6),
      state: pick(N.state, ST_LIST, 'qld')
    };
    var P = obj(s.profile);
    out.profile = {
      stage: pick(P.stage, ['start', 'schemes', 'budget', 'ground', 'hunt', 'deal'], null),
      anchor: str(P.anchor, 60),
      area: pick(P.area, ['capital', 'regional'], 'capital'),
      buyers: pick(P.buyers, ['single', 'couple'], 'single'),
      fhb: P.fhb !== false,
      build: pick(P.build, ['established', 'new', 'unsure'], 'established'),
      income: numOrNull(P.income),
      timeframe: pick(P.timeframe, ['asap', '6mo', '12mo', '2yr'], '12mo'),
      dependants: Math.min(3, num(P.dependants, 0)),
      employment: pick(P.employment, ['payg', 'self', 'casual'], 'payg'),
      rentNow: num(P.rentNow, 0, 1e6),
      cardLimits: num(P.cardLimits, 0, 1e7)
    };
    out.dealChecks = bools(s.dealChecks, 5);
    out.settleChecks = bools(s.settleChecks, 5);
    out.inspections = (Array.isArray(s.inspections) ? s.inspections : []).filter(function (r) { return r && typeof r === 'object'; }).slice(0, 50).map(function (r) {
      return {
        addr: str(r.addr, 120),
        price: num(r.price, 0, 5e7),
        note: str(r.note, 160),
        st: pick(r.st, PLACE_ST, ['inspected', 'shortlist', 'passed'][r.v] || 'inspected'),
        at: num(r.at, 0, 1e14)
      };
    });
    out.scenarios = (Array.isArray(s.scenarios) ? s.scenarios : []).filter(function (c) { return c && typeof c === 'object'; }).slice(0, 12).map(function (c) {
      var cn = obj(c.numbers), cp = obj(c.profile);
      return {
        name: str(c.name, 80), at: num(c.at, 0, 1e14),
        numbers: { price: Math.max(50000, num(cn.price, b.numbers.price, 5e7)), saved: num(cn.saved, 0), saveMo: num(cn.saveMo, 0, 1e6), state: pick(cn.state, ST_LIST, 'qld') },
        profile: { fhb: cp.fhb !== false, area: pick(cp.area, ['capital', 'regional'], 'capital'), buyers: pick(cp.buyers, ['single', 'couple'], 'single'), build: pick(cp.build, ['established', 'new', 'unsure'], 'established'), income: numOrNull(cp.income) },
        bestName: str(c.bestName, 60), mo: num(c.mo, 0, 100000), buyBy: str(c.buyBy, 30),
        rep: num(c.rep, 0), need: num(c.need, 0), saved: num(c.saved, 0), saveMo: num(c.saveMo, 0, 1e6)
      };
    });
    var B = obj(s.budget);
    out.budget = { depositPct: pick(Number(B.depositPct), [0.02, 0.05, 0.1, 0.2], null), cap: numOrNull(B.cap) };
    if (out.budget.cap != null && out.budget.cap < 50000) out.budget.cap = null;
    var D = obj(s.deal), dd = obj(D.dates);
    out.deal = { signed: !!D.signed, dates: {} };
    ['contract', 'cooling', 'bp', 'finance', 'preapproval', 'settlement'].forEach(function (k) { var v = isoOrNull(dd[k]); if (v) out.deal.dates[k] = v; });
    var T = obj(s.settle), ta = obj(T.actuals);
    out.settle = { price: numOrNull(T.price), actuals: {} };
    ['duty', 'legals', 'bp', 'loan'].forEach(function (k) { var v = numOrNull(ta[k]); if (v != null) out.settle.actuals[k] = v; });
    out.pathPriority = pick(s.pathPriority, ['soonest', 'repay', 'interest', 'nolmi', 'own'], 'soonest');
    out.signupDismissed = s.signupDismissed === true;
    out.updatedAt = num(s.updatedAt, 0, 1e14);
    return out;
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) return normalizeState(s);
    } catch (e) { _storageBroken = true; }
    return blank();
  }
  var RO = false;           // read-only: viewing someone else's shared journey
  var COLLAB = null;        // edit-mode share token — writes go to the owner's record
  try { COLLAB = localStorage.getItem('propCalc_journey_collab') || null; } catch (e) {}
  var _storageBroken = false;
  function save() {
    if (RO) return;
    S.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { syncNote('This browser isn’t letting the page save, so your progress will be lost when you close it.', true); }
    scheduleSync();
  }
  var S = load();
  // Wizard-open flags. In memory only: a saved or synced flag would reopen a
  // wizard on another device.
  var _budgetEditing = false, _dealEditing = false;

  // ── Account sync + sharing (netlify/functions/journey.js) ───────────
  function api(payload, keepalive) {
    return fetch('/.netlify/functions/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: !!keepalive
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'network' }; });
  }
  // The line under the trail that says where progress is being kept.
  function syncNote(txt, bad) {
    var el = document.getElementById('jsaved-text');
    if (!el) return;
    el.textContent = txt;
    var row = el.closest('.jsaved');
    if (row) row.classList.toggle('bad', !!bad);
  }
  // _base is the server timestamp this copy was last level with. Every sync
  // sends it; the server refuses a write built on an older copy, so one
  // person's stale tab cannot wipe out what a partner (or another device)
  // has saved since. _remoteReady stays false until the account copy has been
  // read and reconciled: nothing is pushed before then, so a blank journey on
  // a new device can never overwrite the one in the account.
  var _base = 0, _remoteReady = false, _syncT = null, _view = 'home';
  function pushNow(keepalive) {
    var p = { action: 'sync', state: S, base: _base };
    if (COLLAB) p.collab = COLLAB;
    return api(p, keepalive).then(function (r) {
      if (r && r.ok) {
        _base = r.updatedAt || _base;
        syncNote(COLLAB ? 'Saved to the shared journey.' : 'Saved to your account.');
      } else if (r && r.conflict && r.record && r.record.state) {
        adoptRemote(r.record);
        syncNote('This journey was changed ' + (COLLAB ? 'by your partner' : 'on another device') + ' while this page was open. That version is showing now. Your last change wasn’t saved, so make it again.', true);
      } else if (r && r.error === 'network') {
        syncNote('No connection. Your changes are saved in this browser and go to your account with the next change you make online.', true);
      } else {
        syncNote('Not saved to ' + (COLLAB ? 'the shared journey' : 'your account') + ': ' + ((r && r.error) || 'something went wrong') + '. Your changes are saved in this browser only.', true);
      }
      return r;
    });
  }
  function scheduleSync() {
    if (RO || !isLoggedIn() || !_remoteReady) return;
    if (_syncT) clearTimeout(_syncT);
    _syncT = setTimeout(function () { _syncT = null; pushNow(false); }, 1500);
  }
  // A change made in the last second and a half before leaving still goes.
  window.addEventListener('pagehide', function () {
    if (_syncT) { clearTimeout(_syncT); _syncT = null; pushNow(true); }
  });
  function adoptRemote(record) {
    S = normalizeState(record.state);
    _base = record.updatedAt || 0;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    _budgetEditing = false; _dealEditing = false;
    rerender();
  }
  // Redraw whichever view is open without moving focus or scrolling.
  function rerender() {
    if (_view === 'projector') renderProjector();
    else if (_view === 'budget') renderBudget();
    else if (_view === 'ground') renderGround();
    else if (_view === 'hunt') renderHunt();
    else if (_view === 'deal') renderDeal();
    else if (_view === 'settle') renderSettle();
    else if (_view === 'home') renderTrail();
    else if (_view === 'wizard' && S.done[1] && !_wizOne) renderAnswers(false, true);
    refreshMarkButtons();
  }

  // Prefill (not complete) from the app draft if the user came from /app.
  try {
    var draft = JSON.parse(localStorage.getItem('propCalc_draft_v1') || 'null');
    if (draft && draft.state && draft.state.values) {
      var dv = draft.state.values;
      var dPrice = parseFloat(String(dv['inp-price'] || '').replace(/[^0-9.]/g, ''));
      if (dPrice > 0 && !S.done[1]) S.numbers.price = Math.round(dPrice);
      var dSav = parseFloat(String(dv['inp-savings'] || '').replace(/[^0-9.]/g, ''));
      if (dSav > 0 && !S.done[1]) S.numbers.saved = Math.round(dSav);
      var dState = String(dv['pd-state'] || '').toLowerCase();
      if (/^(qld|nsw|vic|sa|wa|tas|act|nt)$/.test(dState) && !S.done[1]) S.numbers.state = dState;
    }
  } catch (e) {}

  function isLoggedIn() {
    try { var s = JSON.parse(localStorage.getItem('propCalc_session_v1') || 'null'); return !!(s && s.id); } catch (e) { return false; }
  }
  function track(evt, params) {
    try { if (typeof gtag === 'function') gtag('event', evt, params || {}); } catch (e) {}
  }

  // ── Icons (house style: 24×24, stroke 1.6, round caps) ──────────────
  function icon(paths, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var IC = {
    compass: icon('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5z"/>'),
    signpost: icon('<path d="M12 3v18"/><path d="M12 5h7l2 2-2 2h-7"/><path d="M12 12H5L3 14l2 2h7"/>'),
    wallet: icon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1"/>'),
    pin: icon('<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    search: icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>'),
    pen: icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"/><path d="M17.5 3.5l3 3L13 14l-4 1 1-4z"/>'),
    key: icon('<circle cx="8" cy="14" r="4.5"/><path d="M11.5 10.5L20 2M16 6l2.5 2.5M13 9l2 2"/>'),
    flag: icon('<path d="M5 21V4"/><path d="M5 4h12l-2.5 3.5L17 11H5"/>'),
    check: icon('<path d="M4 12.5l5 5L20 6.5"/>', 3)
  };

  // ── The stops (ALL native — no external links) ───────────────────────
  var STOPS = [
    { n: 1, icon: 'compass', title: 'Your details', view: 'wizard', cta: 'Answer the questions (about 2 minutes)', blurb: 'Where you’re buying, what you earn, what you’ve saved and how far along you are. The other steps use your answers.', milestone: 'Questions answered' },
    { n: 2, icon: 'signpost', title: 'Compare the schemes', view: 'projector', cta: 'Compare the paths', blurb: 'The 5% Deposit Scheme and Help to Buy next to buying without a scheme, worked out on your numbers.', milestone: 'Path chosen' },
    { n: 3, icon: 'wallet', title: 'Set your budget', view: 'budget', cta: 'Set my maximum price', blurb: 'The costs on top of the price, a test of the repayments against your income, and your maximum price.', milestone: 'Maximum price set' },
    { n: 4, icon: 'pin', title: 'Where to buy', view: 'ground', cta: 'Look at suburbs', blurb: 'A price band from your budget, and suburb figures from state government data.', milestone: 'Suburbs chosen' },
    { n: 5, icon: 'search', title: 'Inspections and offers', view: 'hunt', cta: 'Open my list of places', blurb: 'A list of the places you look at, each checked against your maximum price.', milestone: 'Place found' },
    { n: 6, icon: 'pen', title: 'Contract deadlines', view: 'deal', cta: 'Track my deadlines', blurb: 'Enter the dates from your contract and see the days left on each.', milestone: 'Contract signed' },
    { n: 7, icon: 'key', title: 'Settlement', view: 'settle', cta: 'Open the checklist', blurb: 'A settlement checklist, and your final costs next to the estimates.', milestone: 'Settlement done' }
  ];

  // Real-world stage → the stop that matches it. Buyers can enter mid-journey;
  // earlier stops stay open ("catch up any time") rather than blocking.
  var STAGE_STOP = { start: 2, schemes: 2, budget: 3, ground: 4, hunt: 5, deal: 6 };
  function currentStop() {
    var first = null;
    for (var i = 0; i < STOPS.length; i++) if (!S.done[STOPS[i].n]) { first = STOPS[i].n; break; }
    if (first == null) return 7;
    var target = first;
    if (S.done[1] && S.profile.stage && STAGE_STOP[S.profile.stage]) {
      target = Math.max(first, STAGE_STOP[S.profile.stage]);
      while (target <= 7 && S.done[target]) target++;
      if (target > 7) target = first;
    }
    return target;
  }
  // ── Modal (confirm + milestone celebration) ─────────────────────────
  function jModal(opts) {
    var ov = document.getElementById('jmodal');
    if (!ov) { if (opts.buttons && opts.buttons[0] && opts.buttons[0].cb) opts.buttons[0].cb(); return; }
    var iconEl = document.getElementById('jmodal-icon');
    if (opts.icon) { iconEl.hidden = false; iconEl.style.display = 'grid'; iconEl.className = 'jmodal-icon' + (opts.iconCls ? ' ' + opts.iconCls : ''); iconEl.innerHTML = opts.icon; }
    else { iconEl.hidden = true; iconEl.style.display = 'none'; iconEl.innerHTML = ''; }
    document.getElementById('jmodal-title').innerHTML = (opts.kicker ? '<span class="jsc jsc-line">' + esc(opts.kicker) + '</span>' : '') + esc(opts.title);
    document.getElementById('jmodal-body').textContent = opts.body || '';
    var btns = document.getElementById('jmodal-btns');
    btns.innerHTML = '';
    (opts.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'jbtn' + (b.cls ? ' ' + b.cls : '');
      el.textContent = b.label;
      el.addEventListener('click', function () { closeModal(); if (b.cb) b.cb(); });
      btns.appendChild(el);
    });
    _modalReturn = document.activeElement;
    _modalDismiss = opts.onDismiss || null;
    ov.hidden = false;
    ov.style.display = 'grid';
    var first = btns.querySelector('.jbtn:not(.quiet):not(.danger)') || btns.firstChild;
    if (first) first.focus();
  }
  var _modalReturn = null, _modalDismiss = null;
  function closeModal() {
    var ov = document.getElementById('jmodal');
    if (!ov || ov.hidden) return;
    ov.hidden = true; ov.style.display = 'none';
    if (_modalReturn && document.contains(_modalReturn)) { try { _modalReturn.focus(); } catch (e) {} }
    _modalReturn = null; _modalDismiss = null;
  }
  // Escape, or a click outside the dialog. A dialog whose question can't be
  // left unanswered passes onDismiss, which runs in place of a button.
  function dismissModal() {
    var ov = document.getElementById('jmodal');
    if (!ov || ov.hidden) return;
    var d = _modalDismiss;
    closeModal();
    if (d) d();
  }
  // Keep Tab inside the open dialog.
  document.addEventListener('keydown', function (e) {
    var ov = document.getElementById('jmodal');
    if (e.key !== 'Tab' || !ov || ov.hidden) return;
    var f = ov.querySelectorAll('button');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!ov.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('click', function (e) {
    var ov = document.getElementById('jmodal');
    if (ov && !ov.hidden && e.target === ov) dismissModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') dismissModal();
  });

  function stopByN(n) { for (var i = 0; i < STOPS.length; i++) if (STOPS[i].n === n) return STOPS[i]; return null; }

  // Confirm → mark → celebrate. Milestones are a big deal now.
  function requestMarkDone(n) {
    var stop = stopByN(n);
    jModal({
      title: 'Mark “' + stop.title + '” done?',
      body: 'This moves you to the next step. You can reopen it any time.',
      icon: IC.flag,
      buttons: [
        { label: 'Not yet', cls: 'quiet' },
        { label: 'Mark it done', cb: function () { markDone(n); } }
      ]
    });
  }
  function markDone(n) {
    S.done[n] = true;
    save();
    track('journey_step_done', { step: n });
    var stop = stopByN(n);
    var doneCount = 0; STOPS.forEach(function (s) { if (S.done[s.n]) doneCount++; });
    var next = doneCount >= 7 ? null : stopByN(currentStop());
    jModal({
      kicker: 'Step ' + n + ' of 7 done',
      title: stop.milestone,
      body: doneCount >= 7
        ? 'All seven steps are done.'
        : (next ? 'Next step: ' + next.title + '. ' + next.blurb : ''),
      icon: IC.check,
      iconCls: 'sage',
      buttons: doneCount >= 7
        ? [{ label: 'Back to the journey', cb: function () { show('home'); } }]
        : [
            { label: 'Back to the journey', cls: 'quiet', cb: function () { show('home'); } },
            { label: 'Go to “' + (next ? next.title : '') + '”', cb: function () { show(next.view); } }
          ]
    });
  }

  function resetJourney() {
    if (COLLAB) {
      jModal({
        title: 'This is a shared journey',
        body: 'Starting over here would erase it for the person who shared it with you. Leave the shared journey first (the Leave button at the top), then start your own.',
        buttons: [{ label: 'OK' }]
      });
      return;
    }
    jModal({
      title: 'Start over?',
      body: (isLoggedIn()
        ? 'This erases your journey from this browser and from your account, so it’s gone on every device: '
        : 'This erases everything saved in this browser: ') + 'your answers, finished steps, places and checklists. It can’t be undone.',
      buttons: [
        { label: 'Keep my journey', cls: 'quiet' },
        { label: 'Erase and start over', cls: 'danger', cb: function () {
            S = blank(); bStep = 0; dStep = 0; wStep = 0;
            _budgetEditing = false; _dealEditing = false;
            _wizOne = false; _answersBack = null; _placeView = null;
            save();
            track('journey_reset', {});
            show('home');
          } }
      ]
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ── Trail ────────────────────────────────────────────────────────────
  function renderTrail() {
    var cur = currentStop();
    var doneCount = 0; STOPS.forEach(function (s) { if (S.done[s.n]) doneCount++; });
    var lbl = document.getElementById('jprog-label');
    if (lbl) lbl.textContent = doneCount >= 7 ? 'Journey complete' : 'Step ' + cur + ' of 7';
    var pct = Math.round(doneCount / 7 * 100);
    var fill = document.getElementById('jprog-fill'); if (fill) fill.style.width = pct + '%';
    var pctEl = document.getElementById('jprog-pct'); if (pctEl) pctEl.textContent = pct + '%';

    renderSignupCard();
    if (typeof renderShareCard === 'function') renderShareCard();
    if (typeof renderPlacesSummary === 'function') renderPlacesSummary();
    if (typeof renderScenSummary === 'function') renderScenSummary();

    var html = STOPS.map(function (s, i) {
      var side = i % 2 === 0 ? 'left' : 'right';
      var stateCls = S.done[s.n] ? 'done' : (s.n === cur ? 'current' : 'ahead');
      var stateLbl = S.done[s.n] ? '<span class="jstate done-t jsc">Done</span>'
        : (s.n === cur ? '<span class="jstate here jsc">You are here</span>'
          : '<span class="jstate jsc">' + (s.n === 7 ? 'Last step' : (s.n < cur ? 'Not done yet' : 'Ahead')) + '</span>');
      var isCurrent = s.n === cur && !S.done[s.n];
      var inner = stateLbl + '<h2>' + esc(s.title) + '</h2>';
      if (isCurrent) {
        inner += '<div class="jbody">' + esc(s.blurb) + '</div>' +
          '<div class="jcta-row"><span class="jbtn">' + esc(s.cta) + '</span></div>';
      } else {
        inner += '<p>' + esc(s.blurb) + '</p>';
      }
      return '<div class="jstop ' + side + ' ' + stateCls + '">' +
        '<span class="jnode" aria-hidden="true">' + (S.done[s.n] ? IC.check : IC[s.icon]) + '</span>' +
        '<button class="jstopcard" data-jgoto="' + s.view + '" data-stop="' + s.n + '">' + inner + '</button>' +
        '</div>';
    }).join('');
    var trail = document.getElementById('jtrail');
    if (trail) trail.innerHTML = html;
  }

  var _signupShown = false;
  // ── Guest demo → signup moment ───────────────────────────────────────
  function renderSignupCard() {
    var slot = document.getElementById('jsignup-slot');
    if (!slot) return;
    var doneCount = 0; STOPS.forEach(function (s) { if (S.done[s.n]) doneCount++; });
    // After the first real milestone beyond the wizard. Never on someone
    // else's shared journey: the card is about the visitor's own progress.
    var shouldShow = !RO && !isLoggedIn() && !S.signupDismissed && doneCount >= 2;
    if (!shouldShow) { slot.innerHTML = ''; return; }
    slot.innerHTML = '<div class="jcard jpad jsignup">' +
      '<div>' +
      '<span class="jsc jsc-gold jblock">Saving your journey</span>' +
      '<p>Your progress is saved only in this browser, and clearing the browser’s data deletes it. A free account keeps your journey on all your devices.</p>' +
      '</div>' +
      '<div class="jsignup-actions">' +
      '<a class="jbtn" href="/login?tab=signup&next=%2Fjourney">Create a free account</a>' +
      '<button type="button" class="jwiz-skip" id="jsignup-dismiss">Not now</button>' +
      '</div></div>';
    var d = document.getElementById('jsignup-dismiss');
    if (d) d.addEventListener('click', function () { S.signupDismissed = true; save(); renderSignupCard(); });
    var a = slot.querySelector('a.jbtn');
    if (a) a.addEventListener('click', function () { track('signup_prompt_accepted', { surface: 'journey' }); });
    if (!_signupShown) { _signupShown = true; track('signup_prompt_shown', { surface: 'journey' }); }
  }

  // ── SYNC COPY: duty engine (tools/stamp-duty-calculator.js) ──────────
  var stateData = {
    nsw: { fhbFull: 800000, fhbPartial: 1000000, tiers: [{ from: 0, rate: 0.0125 }, { from: 18000, rate: 0.015 }, { from: 38000, rate: 0.0175 }, { from: 103000, rate: 0.035 }, { from: 387000, rate: 0.045 }, { from: 1290000, rate: 0.055 }, { from: 3870000, rate: 0.07 }] },
    vic: { fhbFull: 600000, fhbPartial: 750000, tiers: [{ from: 0, rate: 0.014 }, { from: 25000, rate: 0.024 }, { from: 130000, rate: 0.06 }] },
    qld: { fhbFull: 700000, fhbPartial: 800000, tiers: [{ from: 0, rate: 0 }, { from: 5000, rate: 0.015 }, { from: 75000, rate: 0.035 }, { from: 540000, rate: 0.045 }, { from: 1000000, rate: 0.0575 }] },
    sa: { fhbFull: 0, fhbPartial: 0, tiers: [{ from: 0, rate: 0.01 }, { from: 12000, rate: 0.02 }, { from: 30000, rate: 0.03 }, { from: 50000, rate: 0.035 }, { from: 100000, rate: 0.04 }, { from: 200000, rate: 0.0425 }, { from: 250000, rate: 0.0475 }, { from: 300000, rate: 0.05 }, { from: 500000, rate: 0.055 }] },
    wa: { fhbFull: 600000, fhbPartial: 800000, tiers: [{ from: 0, rate: 0.019 }, { from: 120000, rate: 0.0285 }, { from: 150000, rate: 0.038 }, { from: 360000, rate: 0.0475 }, { from: 725000, rate: 0.0515 }] },
    tas: { fhbFull: 0, fhbPartial: 0, tiers: [{ from: 0, rate: 0 }, { from: 3000, rate: 0.0175 }, { from: 25000, rate: 0.0225 }, { from: 75000, rate: 0.035 }, { from: 200000, rate: 0.04 }, { from: 375000, rate: 0.0425 }, { from: 725000, rate: 0.045 }] },
    act: { fhbFull: Infinity, fhbPartial: Infinity, tiers: [{ from: 0, rate: 0.0028 }, { from: 260000, rate: 0.022 }, { from: 300000, rate: 0.034 }, { from: 500000, rate: 0.0432 }, { from: 750000, rate: 0.059 }, { from: 1000000, rate: 0.064 }] },
    nt: { fhbFull: 0, fhbPartial: 0, tiers: [] }
  };
  function calcDuty(st, v) {
    var data = stateData[st];
    if (!data || v <= 0) return 0;
    if (st === 'nt') {
      if (v < 525000) { var Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
      if (v <= 3000000) return v * 0.0495;
      if (v <= 5000000) return v * 0.0575;
      return v * 0.0595;
    }
    var duty = 0, tiers = data.tiers;
    for (var i = 0; i < tiers.length; i++) {
      var from = tiers[i].from;
      if (v <= from) break;
      var next = (i + 1 < tiers.length) ? tiers[i + 1].from : Infinity;
      duty += (Math.min(v, next) - from) * tiers[i].rate;
    }
    if (st === 'vic') {
      if (v > 960000 && v <= 2000000) duty = v * 0.055;
      else if (v > 2000000) duty = 110000 + (v - 2000000) * 0.065;
    } else if (st === 'act' && v > 1455000) {
      duty = v * 0.0454;
    } else if (st === 'tas') {
      duty = (v <= 3000) ? 50 : duty + 50;
    }
    return duty;
  }
  function qldHomeDuty(v) {
    if (v <= 350000) return v * 0.01;
    if (v <= 540000) return 3500 + (v - 350000) * 0.035;
    if (v <= 1000000) return 10150 + (v - 540000) * 0.045;
    return 30850 + (v - 1000000) * 0.0575;
  }
  function qldFhbConcessionAmt(v) {
    if (v < 710000) return 17350;
    if (v >= 800000) return 0;
    return 17350 - Math.floor((v - 700000) / 10000) * 1735;
  }
  function fhbDuty(st, v) {
    var data = stateData[st], base = calcDuty(st, v);
    if (!data) return base;
    if (st === 'qld') return Math.max(0, qldHomeDuty(v) - qldFhbConcessionAmt(v));
    if (v <= data.fhbFull) return 0;
    if (v <= data.fhbPartial && data.fhbPartial > data.fhbFull) {
      var slide = (data.fhbPartial - v) / (data.fhbPartial - data.fhbFull);
      return Math.max(0, base * (1 - slide));
    }
    return base;
  }
  // Buyer-specific duty: applies FHB concessions, plus the new-build full
  // reliefs documented in the grants engine (SA: new/off-the-plan only,
  // no cap, contracts from 6 Jun 2024; QLD: new homes duty nil, no cap,
  // contracts from 1 May 2025).
  function buyerDutyAt(v) {
    var st = S.numbers.state, P = S.profile;
    // Everyone on the journey is buying a home to live in, so a QLD buyer who
    // has owned before pays the home-concession rate, not the investor rate
    // (same rule as tools/stamp-duty-calculator.js).
    if (!P.fhb) return st === 'qld' ? qldHomeDuty(v) : calcDuty(st, v);
    if (P.build === 'new' && (st === 'sa' || st === 'qld')) return 0;
    return fhbDuty(st, v);
  }
  function buyerDuty() { return buyerDutyAt(S.numbers.price); }
  // ── end duty sync copy ───────────────────────────────────────────────

  // ── SYNC COPY: scheme constants (first-home-buyer-grants-calculator.js)
  var FDS_CAPS = { nsw: [1500000, 800000], vic: [950000, 650000], qld: [1000000, 700000], sa: [900000, 500000], wa: [850000, 600000], tas: [700000, 550000], act: [1000000, 1000000], nt: [750000, 600000] };
  var H2B_CAPS = { nsw: [1300000, 800000], vic: [950000, 650000], qld: [1000000, 700000], sa: [900000, 500000], wa: [850000, 600000], tas: [700000, 550000], act: [1000000, 1000000], nt: [600000, 600000] };
  var H2B_INCOME = { single: 103000, couple: 165000 };
  var H2B_EQUITY = { new: 0.40, established: 0.30, unsure: 0.30 };
  // ── end scheme sync copy ─────────────────────────────────────────────

  var RATE = 6.0, TERM = 360;
  // ── SYNC COPY: title-office registration fees ← tools/stamp-duty-calculator.js
  // (REG_FEES + regFeesTotal, verified there 6 Jul 2026). Mortgage + transfer
  // registration; QLD/VIC/SA/WA scale with price. tests/duty-sync-test.js
  // asserts this copy matches the source.
  var REG_FLAT = { nsw: 366, tas: 425, act: 680, nt: 362 };
  function regFeesTotal(state, val) {
    if (state === 'qld') return Math.round(248.04 + 248.04 + (val > 180000 ? Math.ceil((val - 180000) / 10000) * 46.56 : 0));
    if (state === 'vic') return Math.round(129.20 + Math.min(3614, Math.ceil(104.30 + Math.floor(val / 1000) * 2.34)));
    if (state === 'sa') {
      var st = val <= 5000 ? 204 : val <= 20000 ? 228 : val <= 40000 ? 251 : 353 + 105 * Math.ceil(Math.max(0, val - 50000) / 10000);
      return Math.round(204 + st);
    }
    if (state === 'wa') {
      var wt = val <= 85000 ? 225.10 : val <= 120000 ? 235.10 : val <= 200000 ? 255.10 : 255.10 + 20 * Math.ceil((val - 200000) / 100000);
      return Math.round(225.10 + wt);
    }
    return REG_FLAT[state] || 400;
  }
  // ── end registration sync copy ───────────────────────────────────────
  var CONVEYANCING = 1800; // mid-point of the $1,300–$2,200 range shown at step 3
  // Legal and registration costs carried in every cash figure, for this
  // buyer's state at price v, rounded to the nearest $50.
  function otherCosts(v) {
    return Math.round((regFeesTotal(S.numbers.state, v) + CONVEYANCING) / 50) * 50;
  }
  // SYNC COPY ← tools/first-home-buyer-grants-calculator.js (ATO FHSS caps)
  var FHSS_MAX_CONTRIB_ANNUAL = 15000, FHSS_MAX_TOTAL = 50000;
  var TF_MONTHS = { asap: 3, '6mo': 6, '12mo': 12, '2yr': 24 };
  function pay(P) { var r = RATE / 100 / 12; return P * r / (1 - Math.pow(1 + r, -TERM)); }
  // The ratio is rounded first: 0.9 * price / price can come out as
  // 0.9000000000000001 and land in the wrong tier.
  function lmiRate(lvr) { lvr = Math.round(lvr * 10000) / 10000; return lvr <= 0.80 ? 0 : lvr <= 0.85 ? 0.008 : lvr <= 0.90 ? 0.019 : lvr <= 0.95 ? 0.034 : 0.043; }

  // ── SYNC COPY: lender-style borrowing estimate ← tools/borrowing-power-calculator.js
  // (approxTax, hemMonthly, incomeTypeFactor; FY2026-27, verified there
  // 5 Jul 2026). tests/duty-sync-test.js asserts these match the source.
  function approxTax(gross) {
    var tax = 0;
    if (gross <= 18200) tax = 0;
    else if (gross <= 45000) tax = (gross - 18200) * 0.15;
    else if (gross <= 135000) tax = 4020 + (gross - 45000) * 0.30;
    else if (gross <= 190000) tax = 31020 + (gross - 135000) * 0.37;
    else tax = 51370 + (gross - 190000) * 0.45;
    if (gross > 35013) tax += gross * 0.02;
    else if (gross > 28011) tax += (gross - 28011) * 0.10;
    return tax;
  }
  function hemMonthly(I, adults, dependants) {
    var perAdult = I < 50000 ? 1750 : I < 80000 ? 1950 : I < 120000 ? 2150 : I < 180000 ? 2400 : I < 250000 ? 2700 : I < 350000 ? 3050 : 3400;
    var adultsCost = adults <= 1 ? perAdult : perAdult + (adults - 1) * Math.round(perAdult * 0.70);
    var depCost = I < 80000 ? 700 : I < 180000 ? 800 : I < 350000 ? 880 : 950;
    return adultsCost + dependants * depCost;
  }
  // ── end borrowing sync copy ──────────────────────────────────────────
  var INCOME_FACTOR = { payg: 1, self: 0.8, casual: 0.8 };

  // What a lender would probably approve, from the step 1 answers. This is
  // the one affordability test in the journey: step 2 flags paths against it
  // and step 3 sizes the maximum price with it. Simplifications, all stated
  // on the page: a couple is treated as two equal incomes, living costs are
  // my approximation of the benchmark lenders use, and no other debts are
  // counted (no car loan, no HELP debt).
  function borrowLimit() {
    var P = S.profile;
    if (!(P.income > 0)) return null;
    var adults = P.buyers === 'couple' ? 2 : 1;
    var each = P.income / adults;
    var net = (each - approxTax(each)) * adults * (INCOME_FACTOR[P.employment] || 1) / 12;
    var living = hemMonthly(P.income, adults, Math.min(3, P.dependants || 0));
    var card = (P.cardLimits || 0) * 0.03;
    var left = Math.max(0, net - living - card);
    var r = (RATE + 3) / 100 / 12;
    return { net: net, living: living, card: card, left: left, maxLoan: left * (1 - Math.pow(1 + r, -TERM)) / r };
  }
  function roundK(v) { return Math.round(v / 5000) * 5000; }
  // "a, b and c"
  function listAnd(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function h2bEquity() { return H2B_EQUITY[S.profile.build] || 0.30; }
  // Help to Buy eligibility on the step 1 answers (price cap + income cap).
  function h2bIssue(price) {
    var P = S.profile;
    var cap = schemeCaps(H2B_CAPS);
    var incCap = (P.buyers === 'couple' || (P.dependants || 0) > 0) ? H2B_INCOME.couple : H2B_INCOME.single;
    if (price > cap) return 'Above the ' + m$(cap) + ' price cap for your area';
    if (P.income != null && P.income > incCap) return 'Income above the ' + m$(incCap) + ' cap for ' + (P.buyers === 'couple' ? 'joint applicants' : ((P.dependants || 0) > 0 ? 'single parents (joint cap applies)' : 'single applicants without dependants'));
    return null;
  }
  function m$(v) { return '$' + Math.round(v).toLocaleString('en-AU'); }
  // "18 Nov 2026" from a stored timestamp, or '' when there isn't a usable
  // one. Scenarios and places saved before the date was kept or shown have
  // no timestamp (or a placeholder), and they get no date, never a wrong one.
  function dayLabel(at) {
    if (typeof at !== 'number' || !(at >= 1577836800000) || at > Date.now() + 172800000) return '';
    try { return new Date(at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }
  // Accepts "650,000", "$650000", "650k" and "1.2m".
  function parseNum(s) {
    var str = String(s == null ? '' : s).trim().toLowerCase();
    var mult = /[0-9.]\s*m\b/.test(str) ? 1000000 : /[0-9.]\s*k\b/.test(str) ? 1000 : 1;
    var n = parseFloat(str.replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n * mult : 0;
  }

  // ── Stop 1 wizard (one question at a time) ───────────────────────────
  // A first-time visitor answers every question in order. Once step 1 is
  // done the view is the list of answers, and each row opens its own
  // question, saves it and comes back to the list.
  var WQ = [
    { id: 'stage', label: 'How far along', kind: 'chips', cols: 2, q: 'How far along are you?', help: 'Pick the closest match. When you finish these questions the journey opens at the step that fits, and the earlier steps stay open.', helpOne: 'Pick the closest match. The journey opens at the step that fits, and the earlier steps stay open.', opts: [['start', 'Wondering if I can afford it'], ['schemes', 'Saving up and researching'], ['budget', 'Working out what I can borrow'], ['ground', 'Deciding where to buy'], ['hunt', 'Inspecting homes'], ['deal', 'I’ve signed a contract']], store: 'profile' },
    { id: 'state', label: 'State', kind: 'chips', q: 'Which state are you buying in?', help: 'Stamp duty, its first home concessions and the scheme price caps differ by state.', opts: [['qld', 'QLD'], ['nsw', 'NSW'], ['vic', 'VIC'], ['sa', 'SA'], ['wa', 'WA'], ['tas', 'TAS'], ['act', 'ACT'], ['nt', 'NT']], store: 'numbers' },
    { id: 'area', label: 'Area', kind: 'chips', q: 'Capital city or regional?', help: 'The schemes have a higher price cap for capital cities and the large regional centres, such as Newcastle, the Gold Coast and Geelong. The rest of each state has a lower cap.', opts: [['capital', 'Capital city or major regional centre'], ['regional', 'Rest of the state']], store: 'profile' },
    { id: 'anchor', label: 'Near', kind: 'text', optional: true, q: 'Is there a suburb or town you want to live near?', help: 'Optional. Step 4 uses it to sort suburbs by distance.', helpOne: 'Optional. Step 4 uses it to sort suburbs by distance. Leave it empty to remove it.', store: 'profile' },
    { id: 'buyers', label: 'Buying', kind: 'chips', q: 'Are you buying alone or with someone?', help: 'Help to Buy has a higher income cap for joint applicants.', opts: [['single', 'Just me'], ['couple', 'Two of us']], store: 'profile' },
    { id: 'fhb', label: 'First home', kind: 'chips', q: 'Is this your first home?', help: 'First home buyers pay less stamp duty in most states, and can use the federal schemes in every state.', opts: [[true, 'Yes'], [false, 'No, I’ve owned a home before']], store: 'profile' },
    { id: 'build', label: 'Home type', kind: 'chips', q: 'Established home or new build?', help: 'Some states give a bigger duty concession for a new build, and Help to Buy can take a larger share of a new home.', opts: [['established', 'Established'], ['new', 'New build'], ['unsure', 'Not sure yet']], store: 'profile' },
    { id: 'income', label: 'Household income', per: '/yr', kind: 'money', q: 'What is your household income before tax?', help: 'Yearly, and combined if you’re buying together. It’s used for the scheme income caps and the borrowing estimate.', def: 95000, min: 0, store: 'profile' },
    { id: 'price', label: 'Target price', kind: 'money', q: 'What price are you aiming for?', help: 'A rough figure is fine. You can change it later.', def: 650000, min: 50000, store: 'numbers' },
    { id: 'saved', label: 'Saved so far', kind: 'money', q: 'How much have you saved so far?', help: 'Deposit savings only. Don’t count your emergency buffer.', def: 60000, min: 0, store: 'numbers' },
    { id: 'saveMo', label: 'Saving', per: '/mo', kind: 'money', q: 'How much can you save each month?', help: 'Step 2 uses this to work out when you could buy, so pick an amount you can keep up.', def: 2000, min: 0, store: 'numbers' },
    { id: 'rentNow', label: 'Rent or board', per: '/mo', kind: 'money', q: 'What do you pay in rent or board each month?', help: 'Zero is fine. Step 3 compares the loan repayment with it.', def: 0, min: 0, store: 'profile' },
    { id: 'cardLimits', label: 'Card limits', kind: 'money', q: 'What is the total limit on your credit cards?', help: 'The limit, not the balance: lenders count the whole limit even when nothing is owing. Enter zero if you have none.', def: 0, min: 0, store: 'profile' },
    { id: 'employment', label: 'Income type', kind: 'chips', q: 'How do you earn your income?', help: 'Lenders usually count 80% of self-employed and casual income, and the borrowing estimate in step 3 does the same.', opts: [['payg', 'Salaried (PAYG)'], ['self', 'Self-employed'], ['casual', 'Casual or contract']], store: 'profile' },
    { id: 'dependants', label: 'Dependants', kind: 'chips', q: 'How many dependants do you have?', help: 'Lenders allow more for living costs with each dependant, and so does the borrowing estimate in step 3.', opts: [[0, 'None'], [1, '1'], [2, '2'], [3, '3 or more']], store: 'profile' },
    { id: 'timeframe', label: 'Timeframe', kind: 'chips', q: 'When do you want to buy?', help: 'Step 2 shows which paths fit this timeframe.', opts: [['asap', 'As soon as possible'], ['6mo', 'Within 6 months'], ['12mo', 'Within a year'], ['2yr', 'In 1–2 years or later']], store: 'profile' }
  ];
  var wStep = 0;
  var _wizNote = '';      // one-off line shown above the first question
  var _wizFocus = false;  // false on the very first render so page load does not grab focus
  // One answer being edited from the list. These are in memory only, like
  // the other wizard-open flags: none of them is ever saved or synced.
  var _wizOne = false;
  var _wizBefore;          // that answer as it was when its question opened
  var _answersNote = '';   // one-off line shown above the list of answers
  var _answersBack = null; // the view the list of answers was opened from
  // Move keyboard and screen-reader focus to the heading of a freshly drawn step.
  function focusHeading(root) {
    var h = root && root.querySelector('[tabindex="-1"]');
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }

  function wVal(q) { return q.store === 'profile' ? S.profile[q.id] : S.numbers[q.id]; }
  function wSet(q, v) {
    if (RO) return; if (q.store === 'profile') S.profile[q.id] = v; else S.numbers[q.id] = v; save(); }

  function renderWizard() {
    var box = document.getElementById('jwizard');
    if (!box) return;
    if (wStep >= WQ.length) { finishWizard(); return; }
    var q = WQ[wStep];
    var dots = WQ.map(function (_, i) { return '<span class="jwiz-dot' + (i <= wStep ? ' on' : '') + '"></span>'; }).join('');
    var body;
    if (q.kind === 'chips') {
      var cols = q.cols || (q.opts.length > 4 ? 4 : q.opts.length);
      body = '<div class="jwiz-states' + (cols === 2 && q.opts.length > 2 ? ' cols2' : '') + '" style="grid-template-columns:repeat(' + cols + ',1fr)">' + q.opts.map(function (o) {
        var sel = String(wVal(q)) === String(o[0]);
        return '<button type="button" class="jwiz-state' + (sel ? ' sel' : '') + '" aria-pressed="' + sel + '" data-wopt="' + esc(String(o[0])) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    } else if (q.kind === 'text') {
      body = '<div class="jwiz-input-row">' +
        '<input class="jwiz-input" id="jwiz-in" type="text" value="' + esc(wVal(q) || '') + '" placeholder="e.g. Chermside" aria-label="' + esc(q.q) + '" style="max-width:320px;font-size:20px"></div>';
    } else {
      var val = wVal(q) != null ? wVal(q) : q.def;
      body = '<div class="jwiz-input-row"><span class="jwiz-cur">$</span>' +
        '<input class="jwiz-input" id="jwiz-in" type="text" inputmode="decimal" value="' + Number(val).toLocaleString('en-AU') + '" aria-label="' + esc(q.q) + '"></div>';
    }
    box.innerHTML = '<div class="jwiz-card">' +
      (!_wizOne && wStep === 0 && _wizNote ? '<p class="jwiz-note" role="status">' + esc(_wizNote) + '</p>' : '') +
      (_wizOne ? '' : '<div class="jwiz-dots" aria-hidden="true">' + dots + '</div>' +
        '<p class="jwiz-count">Question ' + (wStep + 1) + ' of ' + WQ.length + '</p>') +
      '<h3 class="jwiz-q" tabindex="-1">' + esc(q.q) + '</h3>' +
      '<p class="jwiz-help">' + esc((_wizOne && q.helpOne) || q.help) + '</p>' + body +
      '<div class="jwiz-nav">' +
      (_wizOne ? '<button type="button" class="jwiz-skip" id="jwiz-back">← Back to my answers</button>'
        : (wStep > 0 ? '<button type="button" class="jwiz-skip" id="jwiz-back">← Back</button>' : '<span></span>')) +
      (q.kind === 'chips' ? '<span class="jmins">choose one</span>'
        : (_wizOne ? '<button type="button" class="jbtn" id="jwiz-next">Save</button>'
          : (q.optional ? '<span style="display:flex;gap:14px;align-items:center"><button type="button" class="jwiz-skip" id="jwiz-skipq">Skip</button><button type="button" class="jbtn" id="jwiz-next">Next</button></span>'
            : '<button type="button" class="jbtn" id="jwiz-next">Next</button>'))) +
      '</div></div>';
    var input = document.getElementById('jwiz-in');
    if (input) {
      input.focus();
      try { input.setSelectionRange(0, input.value.length); } catch (e) {}
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); wizardNext(); } });
    } else if (_wizFocus) {
      focusHeading(box);
    }
    _wizFocus = true;
    var nb = document.getElementById('jwiz-next');
    if (nb) nb.addEventListener('click', wizardNext);
    var sq = document.getElementById('jwiz-skipq');
    if (sq) sq.addEventListener('click', function () { wSet(WQ[wStep], ''); wStep++; renderWizard(); });
    var bb = document.getElementById('jwiz-back');
    if (bb) bb.addEventListener('click', function () {
      if (_wizOne) { closeAnswer(null); return; }
      wStep = Math.max(0, wStep - 1); renderWizard();
    });
    if (!_wizOne) track('journey_wizard_step', { step: wStep });
  }
  // After an answer is stored: the next question, or back to the list when
  // one answer was being edited.
  function wizAdvance(q) {
    if (_wizOne) { closeAnswer(q); return; }
    wStep++;
    renderWizard();
  }

  function wizardNext() {
    var q = WQ[wStep];
    if (q.kind === 'text') {
      var ti = document.getElementById('jwiz-in');
      wSet(q, (ti && ti.value ? ti.value : '').trim().slice(0, 60));
      wizAdvance(q);
      return;
    }
    if (q.kind === 'money') {
      var input = document.getElementById('jwiz-in');
      var n = parseNum(input ? input.value : '');
      if (!(n >= q.min) || n > 50000000) {
        fieldError(input, q.min > 0 ? 'Enter an amount of at least ' + m$(q.min) + ', for example ' + m$(q.def) + '.' : 'Enter an amount in dollars. Zero is fine.');
        return;
      }
      if (q.id === 'saveMo' && S.profile.income > 0 && n * 12 > S.profile.income) {
        fieldError(input, 'That’s more in a year than your household income of ' + m$(S.profile.income) + '. Enter what you save each month.');
        return;
      }
      // The same check from the other side, when income is changed on its
      // own from the list of answers. On a first run the saving question
      // comes later and still holds its default, so it isn't checked here.
      if (q.id === 'income' && _wizOne && n > 0 && (S.numbers.saveMo || 0) * 12 > n) {
        fieldError(input, 'You save ' + m$(S.numbers.saveMo) + ' a month, which is more in a year than ' + m$(n) + '. Enter your household income before tax, or change your monthly saving first.');
        return;
      }
      wSet(q, Math.round(n));
    }
    wizAdvance(q);
  }

  // A buyer who says the contract is signed goes straight to the deadline
  // tracker. True when that changed something.
  function syncStage() {
    if (S.profile.stage === 'deal' && !S.deal.signed) { S.deal.signed = true; return true; }
    return false;
  }
  function finishWizard() {
    S.done[1] = true;
    syncStage();
    save();
    track('journey_wizard_done', { stage: S.profile.stage || 'unset' });
    _wizNote = '';
    renderAnswers(true);
  }

  function wqById(id) { for (var i = 0; i < WQ.length; i++) if (WQ[i].id === id) return WQ[i]; return null; }
  // An answer as the list shows it. A choice is shown in the words of the
  // option that was picked.
  function wShown(q) {
    var v = wVal(q);
    if (q.kind === 'chips') {
      for (var i = 0; i < q.opts.length; i++) if (String(q.opts[i][0]) === String(v)) return q.opts[i][1];
      return 'Not answered';
    }
    if (q.kind === 'text') return v ? String(v) : 'Not set';
    return v == null ? 'Not answered' : m$(v) + (q.per || '');
  }
  var ANSWER_GROUPS = [
    ['You', ['state', 'area', 'buyers', 'fhb', 'build', 'employment', 'dependants']],
    ['Your money', ['income', 'saved', 'saveMo', 'rentNow', 'cardLimits']],
    ['Your plan', ['price', 'anchor', 'timeframe', 'stage']]
  ];
  // The step 1 answers as a list. justDone: the wizard has only now been
  // finished. quiet: a redraw that must not move focus.
  function renderAnswers(justDone, quiet) {
    var box = document.getElementById('jwizard');
    if (!box) return;
    var note = _answersNote; _answersNote = '';
    // A quiet redraw puts focus back on the Edit it was on.
    var held = quiet && document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('data-wedit') : null;
    var groups = ANSWER_GROUPS.map(function (g) {
      return '<div class="jsum-group"><span class="jsc jblock">' + g[0] + '</span>' + g[1].map(function (id) {
        var q = wqById(id);
        return '<div class="jsum-row"><span class="k">' + esc(q.label) + '</span>' +
          '<span class="v' + (q.kind === 'money' ? ' mono' : '') + '">' + esc(wShown(q)) + '</span>' +
          (RO ? '' : '<button type="button" class="jsum-edit" data-wedit="' + q.id + '" aria-label="Edit ' + esc(q.label.toLowerCase()) + '">Edit</button>') +
          '</div>';
      }).join('') + '</div>';
    }).join('');
    // Back to the step this was opened from, or on to the step that matches
    // how far along the buyer is.
    var back = null;
    for (var i = 0; i < STOPS.length; i++) if (STOPS[i].n > 1 && STOPS[i].view === _answersBack) back = STOPS[i];
    var go = back || stopByN(STAGE_STOP[S.profile.stage] > 2 ? STAGE_STOP[S.profile.stage] : 2);
    box.innerHTML = '<div class="jwiz-card">' +
      (note ? '<p class="jwiz-note" role="status">' + esc(note) + '</p>' : '') +
      (justDone ? '<div class="jwiz-done-icon">' + IC.check + '</div>' : '') +
      '<h3 class="jwiz-q" tabindex="-1">Your answers</h3>' +
      '<p class="jwiz-help">' + (justDone ? 'Step 1 is done. Check your answers below.'
        : RO ? 'The other steps are worked out from these answers.'
          : 'The other steps are worked out from these answers. Edit any of them here.') + '</p>' +
      '<div class="jsum">' + groups + '</div>' +
      '<div class="jwiz-nav" style="margin-top:22px"><span></span>' +
      '<button type="button" class="jbtn" data-jgoto="' + go.view + '">' + (back ? 'Back to' : 'Go to') + ' “' + esc(go.title) + '”</button>' +
      '</div></div>';
    if (!quiet) focusHeading(box);
    else if (held) { var again = box.querySelector('[data-wedit="' + held + '"]'); if (again) { try { again.focus({ preventScroll: true }); } catch (e) {} } }
  }
  // Open one question from the list of answers.
  function openAnswer(id) {
    var q = wqById(id);
    if (!q || RO) return;
    _wizOne = true; _wizFocus = true;
    wStep = WQ.indexOf(q);
    _wizBefore = wVal(q);
    renderWizard();
  }
  // Back to the list. q is the question that was saved, or null when the
  // visitor went back without saving.
  function closeAnswer(q) {
    _wizOne = false;
    if (q) {
      if (syncStage()) save();
      if (String(wVal(q)) !== String(_wizBefore)) {
        _answersNote = 'Saved. The other steps now use this answer.';
        track('journey_answer_edited', { q: q.id });
      }
    }
    renderAnswers(false);
  }

  // ── Stop 2: Scheme Pathway Projector v2 ──────────────────────────────
  // "Compare schemes" on a saved place opens this step at that place's
  // price: { addr, price }. It is held in memory only and never written to
  // the journey, so looking at a place can't change the saved target price.
  // It ends when the visitor opens any other view.
  var _placeView = null;
  // The lowest price step 2 will work with: the same floor the wizard and
  // normalizeState() put on the target price. A place saved with a lower
  // price (usually a typo, $600 for $600k) gets no Compare schemes button.
  var MIN_PRICE = 50000;
  var _placeNote = '';   // one-off line after a place's price is made the target
  function projPrice() { return _placeView ? _placeView.price : S.numbers.price; }
  function schemeCaps(table) {
    var caps = table[S.numbers.state] || [0, 0];
    return S.profile.area === 'capital' ? caps[0] : caps[1];
  }

  function computePaths() {
    var N = S.numbers, P = S.profile;
    var price = projPrice(), saved = N.saved, saveMo = Math.max(0, N.saveMo || 0);
    var duty = buyerDutyAt(price);
    var costs = otherCosts(price);
    var limit = borrowLimit();
    // Months until the cash is saved. Infinity when the buyer is short and
    // is not saving anything: that path has no date.
    var mUntil = function (need) {
      if (need <= saved) return 0;
      return saveMo > 0 ? Math.ceil((need - saved) / saveMo) : Infinity;
    };
    var buyBy = function (mo) {
      if (mo <= 0) return 'Ready now';
      if (!isFinite(mo)) return 'Not at $0 a month';
      var d = new Date(); d.setMonth(d.getMonth() + mo);
      return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    };
    var out = [];
    function add(name, why, dep, lmi, govShare, tags) {
      var need = dep + duty + costs;
      var mo = mUntil(need);
      var loan = price - dep - (govShare || 0) + (lmi || 0);
      out.push({
        name: name, why: why, mo: mo, buyBy: buyBy(mo), need: need,
        lmi: lmi || 0, loan: loan, rep: pay(loan), govShare: govShare || 0,
        equity: tags && tags.equity, warn: (tags && tags.warn) || null,
        eligible: !(tags && tags.warn),
        // false when the loan is more than the borrowing estimate allows
        fits: !limit || loan <= limit.maxLoan
      });
    }
    add('Save to 20%', 'No LMI and the smallest loan, but the longest wait.', price * 0.20, 0);
    var dep10 = price * 0.10, base10 = price - dep10;
    add('10% deposit + LMI', 'Buy sooner without a scheme. LMI is added to the loan.', dep10, base10 * lmiRate(base10 / price));
    if (P.fhb) {
      var fdsCap = schemeCaps(FDS_CAPS);
      add('5% Deposit Scheme', 'A 5% deposit. A government guarantee replaces LMI, and there’s no income cap.',
        price * 0.05, 0, 0,
        price > fdsCap ? { warn: 'Above the ' + m$(fdsCap) + ' price cap for your area' } : null);
      // Single parents (single + dependants) get the joint income cap \u2014 same
      // rule as tools/first-home-buyer-grants-calculator.js.
      var eq = h2bEquity();
      var h2bWarn = h2bIssue(price);
      add('Help to Buy', 'The government takes a share of up to ' + Math.round(eq * 100) + '% (' + (P.build === 'new' ? 'new build' : (P.build === 'unsure' ? 'assumes established' : 'established')) + ') and you need a 2% deposit.',
        price * 0.02, 0, price * eq,
        h2bWarn ? { warn: h2bWarn } : { equity: 'Government up to ' + Math.round(eq * 100) + '%' });
    }
    out.forEach(function (p) { p.interest = p.rep * TERM - p.loan; });
    var eligible = out.filter(function (p) { return p.eligible; });
    // Prefer paths whose loan sits inside the borrowing estimate. If none
    // does, the ranking still runs and the page says so.
    var fitting = eligible.filter(function (p) { return p.fits; });
    var pool = fitting.length ? fitting : eligible;
    var prio = S.pathPriority || 'soonest';
    if (!{ soonest: 1, repay: 1, interest: 1, nolmi: 1, own: 1 }[prio]) prio = 'soonest';
    var cmp = {
      // Ties go to the path with no government share, then the smaller loan.
      soonest: function (a, b) { return a.mo - b.mo || a.lmi - b.lmi || (a.govShare ? 1 : 0) - (b.govShare ? 1 : 0) || a.rep - b.rep; },
      repay: function (a, b) { return a.rep - b.rep || a.mo - b.mo; },
      interest: function (a, b) { return a.interest - b.interest || a.mo - b.mo; },
      nolmi: function (a, b) { return a.mo - b.mo || a.rep - b.rep; },
      own: function (a, b) { return a.mo - b.mo || a.lmi - b.lmi; }
    }[prio] || null;
    var prioPool = pool;
    if (prio === 'nolmi') { var nl = pool.filter(function (p) { return p.lmi === 0; }); if (nl.length) prioPool = nl; }
    if (prio === 'own') { var ow = pool.filter(function (p) { return !p.govShare; }); if (ow.length) prioPool = ow; }
    var best = prioPool.slice().sort(cmp)[0];
    out.forEach(function (p) { p.best = (p === best); });
    return { paths: out, duty: duty, costs: costs, best: best, prio: prio, limit: limit, noneFit: !!limit && !fitting.length };
  }

  // Remaining loan balance after n months at RATE over TERM (closed form).
  function balanceAfter(loan, months) {
    if (months >= TERM) return 0;
    var r = RATE / 100 / 12;
    var f = Math.pow(1 + r, months);
    return Math.max(0, loan * f - pay(loan) * (f - 1) / r);
  }
  // Your stake at flat value: price − what you'd still owe − the government's
  // share (Help to Buy). Deliberately NO capital-growth assumption.
  function stakeAt(p, price, months) {
    return Math.max(0, price - balanceAfter(p.loan, months) - p.govShare);
  }
  function renderFhss() {
    var box = document.getElementById('jfhss');
    if (!box) return;
    var P = S.profile, N = S.numbers;
    if (!P.fhb) { box.innerHTML = ''; var sec = box.closest('section'); if (sec) sec.hidden = true; return; }
    var sec2 = box.closest('section'); if (sec2) sec2.hidden = false;
    var people = P.buyers === 'couple' ? 2 : 1;
    var releaseCap = FHSS_MAX_TOTAL * people;
    var yearlyCap = FHSS_MAX_CONTRIB_ANNUAL * people;
    var html = '<p>The <strong>First Home Super Saver</strong> scheme works with any of these paths. Voluntary super contributions of up to <b class="mono-strong">' + m$(FHSS_MAX_CONTRIB_ANNUAL) + '</b> a year each count toward a release cap of <b class="mono-strong">' + m$(releaseCap) + '</b>' + (people === 2 ? ' between you' : '') + ' when you buy.</p>';
    if (N.saveMo >= 50) {
      var yearly = Math.min(N.saveMo * 12, yearlyCap);
      var yearsToCap = releaseCap / yearly;
      html += '<p style="margin-top:8px">At your ' + m$(N.saveMo) + '/mo, contributions would reach the release cap in about <b class="mono-strong">' + (Math.round(yearsToCap * 10) / 10) + ' years</b>' + (N.saveMo * 12 > yearlyCap ? ' (held back by the ' + m$(yearlyCap) + '/yr contribution cap, which is less than you save)' : '') + '.</p>';
    }
    html += '<p class="jcaveat" style="margin-top:10px">The tax saving depends on your marginal rate and the ATO’s deemed earnings, so I don’t estimate it here. Check the <a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme" target="_blank" rel="noopener">ATO’s FHSS pages</a> or the <a href="/tools/first-home-buyer-grants-calculator">grants calculator</a> before you contribute, because contributions are hard to reverse.</p>';
    box.innerHTML = html;
  }

  // "Questions you're probably asking" — facts mirrored from the verified
  // grants calculator page (tools/first-home-buyer-grants-calculator.html);
  // every figure below is computed from this buyer's own paths.
  function renderPathFaq(R) {
    var box = document.getElementById('jfaq');
    if (!box) return;
    var P = S.profile, N = S.numbers;
    var find = function (name) { for (var i = 0; i < R.paths.length; i++) if (R.paths[i].name === name) return R.paths[i]; return null; };
    var fds = find('5% Deposit Scheme'), h2b = find('Help to Buy'), p20 = find('Save to 20%');
    var b = R.best;
    var payAtRate = function (loan, rate) { var r = rate / 100 / 12; return loan * r / (1 - Math.pow(1 + r, -TERM)); };
    var qa = [];
    if (fds) {
      qa.push(['What are the limits of the 5% Deposit Scheme?',
        'It’s a loan guarantee, not a grant, so you still borrow the other 95%' + (p20 ? ', and the repayment is <b class="mono-strong">' + m$(fds.rep) + '/mo</b> against <b class="mono-strong">' + m$(p20.rep) + '/mo</b> on a 20% deposit' : '') + '. Since 1 October 2025 it has no income caps, no limit on places and no waitlist. The price cap for your area is <b class="mono-strong">' + m$(schemeCaps(FDS_CAPS)) + '</b>, you must live in the home, and only the lenders on Housing Australia’s panel offer it.']);
    }
    if (h2b) {
      qa.push(['What does Help to Buy cost me later?',
        'The government owns part of your home. When you sell or refinance, it takes the same proportion of any capital gain, and you can buy its part back in stages before then. From 1 July 2026 the income caps are $103,000 for a single applicant and $165,000 for joint applicants or single parents. There are 10,000 places in FY2026-27, and you apply through a participating lender (Housing Australia lists them).']);
      qa.push(['Can I combine the schemes?',
        'Mostly. Your state’s stamp duty concession, the First Home Owner Grant and the First Home Super Saver can all be used together, and with the 5% Deposit Scheme. Help to Buy and the 5% Deposit Scheme can’t be combined, so you pick one of those two.']);
    }
    qa.push(['What if rates rise?',
      'Every figure here assumes ' + RATE.toFixed(2) + '% for the life of the loan. At 1% higher, the repayment on \u201c' + esc(b.name) + '\u201d would be <b class="mono-strong">' + m$(payAtRate(b.loan, RATE + 1)) + '/mo</b> instead of <b class="mono-strong">' + m$(b.rep) + '/mo</b>. Step 3 tests your budget at the rate plus the 3% buffer lenders add.']);
    qa.push(['Why isn’t the First Home Owner Grant shown?',
      'It’s a state grant, mostly for new builds' + (P.build === 'new' ? ' (you chose a new build, so it may apply to you)' : '') + '. It lowers the cash you need but doesn’t change which path comes out ahead. The <a href="/tools/first-home-buyer-grants-calculator">grants calculator</a> works out the grant and your stamp duty saving for ' + esc(N.state.toUpperCase()) + '.']);
    qa.push(['How do I decide?',
      'Choose what matters most at the top of this step and see which path ranks first. If two paths are within a couple of months of each other, the one with less LMI and a smaller loan usually costs less over time. Confirm eligibility with the scheme administrator and a lender or broker before you commit.']);
    box.innerHTML = '<span class="jsc jblock">Questions about these paths</span>' +
      qa.map(function (item) {
        return '<details class="jfaq-item"><summary>' + item[0] + '</summary><p>' + item[1] + '</p></details>';
      }).join('');
  }

  function renderNetPosition(R) {
    var box = document.getElementById('jnet');
    if (!box) return;
    var price = projPrice();
    var head = '<div class="jnet-row jnet-head"><span class="nm"></span>' +
      ['5 yrs', '10 yrs', '30 yrs'].map(function (h) { return '<span>' + h + '</span>'; }).join('') + '</div>';
    var rows = R.paths.map(function (p) {
      var cells = [60, 120, 360].map(function (m) {
        return '<span class="v">' + m$(stakeAt(p, price, m)) + '</span>';
      }).join('');
      return '<div class="jnet-row' + (p.warn ? ' inelig' : '') + (p.best ? ' best' : '') + '">' +
        '<span class="nm">' + esc(p.name) + '</span>' + cells + '</div>';
    }).join('');
    box.innerHTML = head + rows +
      '<p class="jcaveat" style="margin-top:10px">What you’d own is the price paid, less what you’d still owe and less any government share, at ' + RATE.toFixed(2) + '% over 30 years from the day each path buys. The home stays valued at ' + m$(price) + ' because I don’t forecast price growth. The Help to Buy share is repaid at market value when you sell or buy it out.</p>';
  }

  // The card above the figures when step 2 is showing a saved place.
  function renderPlaceNote() {
    var slot = document.getElementById('jplace-note');
    if (!slot) {
      // A cached copy of the page from before this slot existed.
      var chips = document.getElementById('jctx-chips');
      if (!chips) return;
      slot = document.createElement('div');
      slot.id = 'jplace-note';
      chips.parentNode.insertBefore(slot, chips);
    }
    var said = _placeNote; _placeNote = '';
    var pv = _placeView;
    if (!pv) { slot.innerHTML = said ? '<p class="jwiz-note jplace-said" role="status">' + esc(said) + '</p>' : ''; return; }
    var target = S.numbers.price, same = pv.price === target;
    slot.innerHTML = '<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jblock">' + esc(pv.addr) + '</span>' +
      '<p>' + (same
        ? 'The ' + m$(pv.price) + ' you entered for this place is the same as your target price.'
        : 'These figures use the ' + m$(pv.price) + ' you entered for this place. Your target price is still ' + m$(target) + '.') + '</p></div>' +
      '<div class="jsignup-actions">' +
      '<button type="button" class="jbtn quiet" data-jgoto="hunt">Back to my places</button>' +
      (!same && !RO && pv.price >= MIN_PRICE ? '<button type="button" class="jwiz-skip" id="jplace-use">Make ' + m$(pv.price) + ' my target price</button>' : '') +
      '</div></div>';
    var use = document.getElementById('jplace-use');
    if (use) use.addEventListener('click', function () {
      if (RO) return;
      S.numbers.price = pv.price;
      _placeView = null;
      _placeNote = 'Your target price is now ' + m$(pv.price) + '.';
      save();
      renderProjector();
      var h = document.getElementById('jproj-title');
      if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) {} }
      track('journey_place_price_adopted', {});
    });
  }

  function renderProjector() {
    var N = S.numbers, P = S.profile;
    var price = projPrice();
    renderPlaceNote();
    var chips = document.getElementById('jctx-chips');
    if (chips) {
      chips.innerHTML =
        '<span class="chip"><b>' + esc(N.state.toUpperCase()) + '</b> ' + (P.area === 'capital' ? 'capital' : 'regional') + '</span>' +
        '<span class="chip">' + (P.fhb ? 'First home buyer' : 'Not a first home') + '</span>' +
        '<span class="chip">' + (_placeView ? 'This place' : 'Target') + ' <b>' + m$(price) + '</b></span>' +
        '<span class="chip">Saved <b>' + m$(N.saved) + '</b></span>' +
        '<span class="chip">Saving <b>' + m$(N.saveMo) + '/mo</b></span>' +
        '<button type="button" class="jwiz-skip" data-jgoto="wizard" style="align-self:center">Change my answers</button>';
    }

    var R = computePaths();
    var title = document.getElementById('jproj-title');
    if (title) title.textContent = R.paths.length + ' ways to buy your ' + m$(price) + (P.fhb ? ' first home' : ' home');

    var note = document.getElementById('jduty-note');
    if (note) {
      var dutyLabel = P.fhb ? 'first-home-buyer stamp duty' : 'stamp duty';
      var stUp = esc(N.state.toUpperCase());
      note.innerHTML = (R.duty < 1
        ? 'Estimated ' + dutyLabel + ' in ' + stUp + ' at this price' + (P.fhb && P.build === 'new' && (N.state === 'sa' || N.state === 'qld') ? ' (new build)' : '') + ': <b>$0</b>.'
        : 'Estimated ' + dutyLabel + ' in ' + stUp + ' at this price: <b>' + m$(R.duty) + '</b>.') +
        ' Legal and registration costs: about <b>' + m$(R.costs) + '</b>. Both are included in the cash needed for every path.' +
        (P.fhb && P.build === 'new' && N.state === 'nt' ? ' The NT has a duty exemption for house and land packages that may apply to a new build. This estimate doesn’t include it.' : '');
    }

    var PRIO_OPTS = [
      ['soonest', 'Buy soonest'],
      ['repay', 'Lowest repayment'],
      ['interest', 'Least interest over 30 years'],
      ['nolmi', 'No LMI'],
      ['own', 'No government share']
    ];
    var prioBox = document.getElementById('jprio');
    if (prioBox) {
      prioBox.innerHTML = '<span class="jsc jblock">Rank the paths by</span>' +
        '<div class="jprio-row">' + PRIO_OPTS.map(function (o) {
          return '<button type="button" class="jprio-chip' + (R.prio === o[0] ? ' sel' : '') + '" data-prio="' + o[0] + '">' + o[1] + '</button>';
        }).join('') + '</div>' +
        '<p class="jhint" style="margin-top:8px">This changes which path ranks first. The figures stay the same.</p>';
    }

    var paths = document.getElementById('jpaths');
    if (paths) paths.innerHTML = R.paths.map(function (p) {
      return '<div class="jpath' + (p.best ? ' best' : '') + (p.warn ? ' inelig' : '') + '">' +
        (p.best ? '<span class="jflag jsc">Ranked first</span>' : '') +
        '<h3>' + esc(p.name) + '</h3><div class="jwhy">' + esc(p.why) + '</div>' +
        '<span class="jsc">You could buy</span>' +
        '<div class="jbuyby' + (p.mo <= 0 ? ' now' : '') + '">' + p.buyBy + '</div>' +
        '<div class="jstat"><span class="k">Cash needed</span><span class="v">' + m$(p.need) + '</span></div>' +
        '<div class="jstat"><span class="k">Lenders mortgage insurance</span><span class="v ' + (p.lmi ? 'warn' : 'good') + '">' + (p.lmi ? m$(p.lmi) : '$0') + '</span></div>' +
        '<div class="jstat"><span class="k">Loan</span><span class="v">' + m$(p.loan) + '</span></div>' +
        '<div class="jstat"><span class="k">Repayment</span><span class="v">' + m$(p.rep) + '/mo</span></div>' +
        (p.equity ? '<div class="jstat"><span class="k">Equity share</span><span class="v warn">' + esc(p.equity) + '</span></div>' : '') +
        (p.warn ? '<div class="jelig">' + esc(p.warn) + ' (shown for comparison).</div>' : '') +
        (!p.warn && !p.fits ? '<div class="jelig">My estimate of what a lender would approve on your income is about ' + m$(roundK(R.limit.maxLoan)) + ', less than this loan.</div>' : '') +
        '</div>';
    }).join('');

    // Time-axis timeline: each path is a dot at its buy-ready month, not a bar
    var maxMo = Math.max.apply(null, R.paths.map(function (p) { return isFinite(p.mo) ? p.mo : 0; }).concat([6]));
    var scaleMo = Math.ceil(maxMo * 1.08); // breathing room so the last dot isn't flush right
    var monthLabel = function (mo) {
      var d = new Date(); d.setMonth(d.getMonth() + mo);
      return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }).replace(' ', ' ’');
    };
    var pos = function (mo) { return Math.min(100, Math.max(0, mo / scaleMo * 100)); };
    var bars = document.getElementById('jbars');
    if (bars) {
      var goalMo = TF_MONTHS[P.timeframe] || null;
      var midMo = Math.round(scaleMo / 2);
      var ticks = '<span class="jtl-tick" style="left:0">Now</span>' +
        (midMo >= 2 ? '<span class="jtl-tick" style="left:50%">' + monthLabel(midMo) + '</span>' : '') +
        '<span class="jtl-tick" style="left:100%">' + monthLabel(scaleMo) + '</span>' +
        (goalMo && goalMo <= scaleMo && Math.abs(pos(goalMo) - 50) > 9 && pos(goalMo) > 9 && pos(goalMo) < 91
          ? '<span class="jtl-tick jtl-goal" style="left:' + pos(goalMo).toFixed(1) + '%">your goal</span>' : '');
      bars.innerHTML =
        '<div class="jtl-axis"><span></span><span class="jtl-ticks">' + ticks + '</span><span></span></div>' +
        R.paths.map(function (p) {
          var cls = 'jtl-dot' + (p.mo <= 0 ? ' now' : '') + (p.best ? ' best' : '') + (p.warn ? ' inelig' : '');
          return '<div class="jtl-row"><span class="nm">' + esc(p.name) + '</span>' +
            '<span class="jtl-rail">' + (isFinite(p.mo) ? '<span class="' + cls + '" style="left:' + pos(p.mo).toFixed(1) + '%"></span>' : '') + '</span>' +
            '<span class="jtl-date' + (p.mo <= 0 ? ' now' : '') + '">' + (p.mo <= 0 ? 'Ready now' : p.buyBy) + '</span></div>';
        }).join('');
    }

    var read = document.getElementById('jread');
    if (read) {
      var b = R.best;
      var alt = R.paths.filter(function (p) { return !p.best && p.eligible; }).sort(function (a, b2) { return a.mo - b2.mo; })[0];
      var prioLead = {
        repay: 'It has the lowest repayment of any path you qualify for: <b class="mono-strong">' + m$(b.rep) + '/mo</b>' + (alt ? ', ' + m$(alt.rep - b.rep) + '/mo less than \u201c' + esc(alt.name) + '\u201d' : '') + '. ',
        interest: 'Over the full 30 years it pays the least interest: <b class="mono-strong">' + m$(b.interest) + '</b>' + (alt ? ' versus ' + m$(alt.interest) + ' on \u201c' + esc(alt.name) + '\u201d' : '') + '. ',
        nolmi: (b.lmi === 0 ? '' : 'None of the paths without LMI fits your numbers yet, so this is the closest. '),
        own: (!b.govShare ? 'There’s no government share to buy out later. ' : 'No path without a government share fits your numbers yet, so this is the closest. ')
      }[R.prio] || '';
      var months = function (n) { return n + ' month' + (n === 1 ? '' : 's'); };
      var txt = '<span class="jsc">My read</span>';
      if (R.noneFit) {
        // No path's loan fits the borrowing estimate: say so before anything else.
        txt += '<strong>At ' + m$(price) + ', every path needs a bigger loan than I estimate a lender would approve.</strong> ' +
          'On a household income of ' + m$(P.income) + ', the estimate is a loan of about <b class="mono-strong">' + m$(roundK(R.limit.maxLoan)) + '</b>. ' +
          'The smallest loan here is ' + m$(Math.min.apply(null, R.paths.map(function (p) { return p.loan; }))) + '. ' +
          'Step 3 works out the price your income supports. A lender or broker can give you a firm figure.';
      } else {
        txt += '<strong>' + esc(b.name) + ' ranks first.</strong> ' + prioLead;
        if (b.mo <= 0) txt += 'Your savings already cover the cash this path needs, so you could buy now';
        else if (!isFinite(b.mo)) txt += 'You’re ' + m$(b.need - N.saved) + ' short of the cash it needs, and saving $0 a month won’t close that gap';
        else txt += 'You could be ready in about ' + months(b.mo) + ' (' + b.buyBy + ')';
        // Only compare timing with another path when the timing differs.
        if (alt && alt.mo !== b.mo && isFinite(alt.mo)) txt += ', against ' + (alt.mo <= 0 ? 'now' : 'about ' + months(alt.mo)) + ' on \u201c' + esc(alt.name) + '\u201d. ';
        else txt += '. ';
        txt += b.lmi ? 'It carries ' + m$(b.lmi) + ' of LMI.' : 'It pays no lenders mortgage insurance.';
        var goal = TF_MONTHS[P.timeframe];
        if (goal && isFinite(b.mo)) {
          var tfLabel = { asap: 'as soon as possible', '6mo': 'within 6 months', '12mo': 'within a year', '2yr': 'in 1\u20132 years' }[P.timeframe];
          if (b.mo <= goal) txt += ' That fits your goal of buying ' + tfLabel + '.';
          else {
            txt += ' Your goal is to buy ' + tfLabel + ', and this path lands about ' + months(b.mo - goal) + ' past that';
            var extra = Math.ceil(Math.max(0, (b.need - N.saved) / Math.max(1, goal)) - N.saveMo);
            txt += extra > 0 ? ', unless you can lift saving to about ' + m$(N.saveMo + extra) + '/mo.' : '.';
          }
        }
        // The trade-off depends on the path, so each path gets its own.
        txt += ' ' + ({
          'Save to 20%': 'The trade-off is time: you keep renting while you save, and prices can change in the meantime.',
          '10% deposit + LMI': 'The trade-off is the LMI premium, which is added to the loan and paid off with interest.',
          '5% Deposit Scheme': 'The trade-off is the largest loan of the paths here, so the highest repayment.',
          'Help to Buy': 'The trade-off is that the government owns part of the home and takes the same share of any rise in its value.'
        }[b.name] || '');
        if (R.limit) {
          var unfit = R.paths.filter(function (p) { return p.eligible && !p.fits; }).map(function (p) { return '\u201c' + esc(p.name) + '\u201d'; });
          if (unfit.length) txt += ' I estimate a lender would approve a loan of about ' + m$(roundK(R.limit.maxLoan)) + ' on your income, which rules out ' + listAnd(unfit) + ' at this price.';
        }
      }
      read.innerHTML = txt;
    }
    renderNetPosition(R);
    renderFhss();
    renderPathFaq(R);
    renderScenarios(R);
    track('projector_update', { st: N.state });
  }

  // ── Scenarios: saved projector runs, compared side by side ──────────
  // The owner's architecture: one journey → many worked scenarios. Each is a
  // snapshot of the inputs + the best path at save time; Load restores the
  // inputs and the projector recomputes live.
  // Names are stored up to 80 characters. A place address fills whatever
  // room is left and is cut at a word, with an ellipsis, when it doesn't fit.
  function scenName() {
    var N = S.numbers, P = S.profile;
    var name = N.state.toUpperCase() + ' ' + m$(projPrice()) + (P.fhb ? '' : ', not first home');
    if (_placeView && _placeView.addr) name += ', ' + clipWords(_placeView.addr, 80 - name.length - 2);
    return name.slice(0, 80);
  }
  function clipWords(s, room) {
    s = String(s).trim();
    if (s.length <= room) return s;
    var cut = s.slice(0, Math.max(0, room - 1));
    var sp = cut.lastIndexOf(' ');
    // Back to the last space, unless that would throw away most of it (one
    // very long word).
    if (sp > room / 2) cut = cut.slice(0, sp);
    return cut.replace(/[\s,;:\/-]+$/, '') + '…';
  }
  function renderScenarios(R) {
    var box = document.getElementById('jscen');
    if (!box) return;
    var rows = S.scenarios.map(function (sc, i) {
      var when = dayLabel(sc.at);
      return '<div class="jscen-row">' +
        '<div class="jscen-main"><div class="jscen-name">' + esc(sc.name) + '</div>' +
        (when ? '<div class="jscen-when">Saved ' + when + '</div>' : '') +
        '<div class="jscen-meta">' + esc(sc.bestName) + ', ' + (sc.mo <= 0 ? 'ready now' : 'ready ' + esc(sc.buyBy)) + ', ' + m$(sc.rep) + '/mo, needs ' + m$(sc.need) + ', saved ' + m$(sc.saved) + ' at ' + m$(sc.saveMo) + '/mo</div></div>' +
        '<button type="button" class="jbtn quiet jscen-btn" data-scen-load="' + i + '">Load</button>' +
        '<button type="button" class="jinsp-del" data-scen-del="' + i + '" aria-label="Delete scenario">×</button>' +
        '</div>';
    }).join('');
    box.innerHTML = '<div class="jcard jpad">' +
      '<span class="jsc jblock">Saved scenarios</span>' +
      (rows ? '<div class="jscen-list">' + rows + '</div>'
        : '<p class="jcaveat" style="margin-top:2px">Save this comparison, then change your answers (a different price, state or saving rate) and save again. Each scenario keeps its own figures, and Load brings them back.</p>') +
      '<div class="jwiz-nav" style="margin-top:12px"><span class="jmins">' + (S.scenarios.length ? S.scenarios.length + ' of 12 saved' : '') + '</span>' +
      '<button type="button" class="jbtn" id="jscen-save"' + (S.scenarios.length >= 12 ? ' disabled' : '') + '>Save this as a scenario</button></div>' +
      '</div>';
    var sb = document.getElementById('jscen-save');
    if (sb) sb.addEventListener('click', function () {
      if (RO || S.scenarios.length >= 12) return;
      var N = S.numbers, P = S.profile, b = R.best;
      S.scenarios.unshift({
        name: scenName(),
        at: Date.now(),
        numbers: { price: projPrice(), saved: N.saved, saveMo: N.saveMo, state: N.state },
        profile: { fhb: P.fhb, area: P.area, buyers: P.buyers, build: P.build, income: P.income },
        bestName: b.name, mo: b.mo, buyBy: b.buyBy, rep: Math.round(b.rep), need: Math.round(b.need),
        saved: N.saved, saveMo: N.saveMo
      });
      S.scenarios = S.scenarios.slice(0, 12);
      save();
      renderScenarios(R);
      track('journey_scenario_saved', { st: N.state });
    });
  }

  function renderScenSummary() {
    var slot = document.getElementById('jscen-slot');
    if (!slot) return;
    if (!S.scenarios.length) { slot.innerHTML = ''; return; }
    var latest = S.scenarios[0];
    slot.innerHTML = '<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jblock">Your scenarios</span>' +
      '<p><b>' + S.scenarios.length + '</b> saved scenario' + (S.scenarios.length > 1 ? 's' : '') + '. The latest is ' + esc(latest.name) + ', with ' + esc(latest.bestName) + ' ranked first.</p></div>' +
      '<div class="jsignup-actions"><button type="button" class="jbtn quiet" data-jgoto="projector">Open the comparison</button></div></div>';
  }

  // ── Stop 3: budget wizard → a committed maximum price ────────────────
  var bStep = 0;
  function payAt(loan, rate) { var r = rate / 100 / 12; return loan * r / (1 - Math.pow(1 + r, -TERM)); }
  // A deposit of 0.02 means the Help to Buy path (2% deposit + government share).
  function isH2B(dep) { return Math.abs(dep - 0.02) < 0.001; }
  function fdsOk(price) { return !!S.profile.fhb && price <= schemeCaps(FDS_CAPS); }
  function budgetLmi(price, dep) {
    if (dep >= 0.20 || isH2B(dep)) return 0;
    // The 5% Deposit Scheme guarantee replaces LMI only for a first home
    // buyer whose price is under the scheme cap for their area.
    if (Math.abs(dep - 0.05) < 0.001 && fdsOk(price)) return 0;
    return price * (1 - dep) * lmiRate(1 - dep);
  }
  function budgetLoan(price, dep) {
    if (isH2B(dep)) return price * (1 - dep - h2bEquity());
    return price * (1 - dep) + budgetLmi(price, dep);
  }
  function h2bOpen(price) { return !!S.profile.fhb && !h2bIssue(price); }
  function bDepDefault() {
    var d = S.budget.depositPct;
    if (d && (!isH2B(d) || h2bOpen(S.budget.cap || S.numbers.price))) return d;
    return S.profile.fhb ? 0.05 : 0.10;
  }
  function depLabel(dep) { return isH2B(dep) ? 'Help to Buy (2% deposit)' : 'a ' + Math.round(dep * 100) + '% deposit'; }
  // Highest price whose loan fits the borrowing estimate at this deposit,
  // rounded down to $5,000. 0 when there is no income to test against.
  function incomeCeiling(dep) {
    var L = borrowLimit();
    if (!L) return 0;
    var lo = 0, hi = 6000000;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (budgetLoan(mid, dep) <= L.maxLoan) lo = mid; else hi = mid;
    }
    return Math.floor(lo / 5000) * 5000;
  }
  // Inline, announced validation message for a wizard field.
  function fieldError(input, msg) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    var row = input.closest('.jwiz-input-row') || input.parentNode;
    var e = row.parentNode.querySelector('.jerr');
    if (!e) {
      e = document.createElement('p');
      e.className = 'jerr';
      e.setAttribute('role', 'alert');
      row.parentNode.insertBefore(e, row.nextSibling);
    }
    e.textContent = msg;
    input.focus();
  }
  // What the borrowing estimate assumed, in one sentence per assumption.
  function limitCaveat() {
    var P = S.profile;
    return 'This is my estimate of the test a lender runs: your rate plus a 3% buffer, your income after tax at FY2026-27 rates, a living-cost benchmark for your household and 3% of your card limits each month.' +
      (P.buyers === 'couple' ? ' It treats the two of you as earning the same.' : '') +
      (P.employment === 'self' ? ' It counts 80% of your income, which is common for self-employed applicants.' : '') +
      (P.employment === 'casual' ? ' It counts 80% of your income, which is common for casual and contract work.' : '') +
      ' It leaves out other debts such as a car loan or a HELP debt. The <a href="/tools/borrowing-power-calculator">borrowing power calculator</a> lets you add those, and a lender or broker can give you a firm figure.';
  }

  function renderBudget() {
    var box = document.getElementById('jbudget');
    if (!box) return;
    if (S.budget.cap && !_budgetEditing) { renderBudgetDash(box); refreshMarkButtons(); return; }
    renderBudgetWizard(box);
  }

  function renderBudgetWizard(box) {
    var N = S.numbers, P = S.profile;
    var duty = buyerDuty();
    var costs = otherCosts(N.price);
    var dots = [0, 1, 2, 3].map(function (i) { return '<span class="jwiz-dot' + (i <= bStep ? ' on' : '') + '"></span>'; }).join('');
    var body = '', q = '', help = '', nav = '';
    var stUp = esc(N.state.toUpperCase());

    if (bStep === 0) {
      q = 'Costs on top of the price';
      help = 'You pay these from your savings as well as the deposit. Stamp duty and about ' + m$(costs) + ' of legal and registration costs are included in every figure after this screen. Allow for the inspection and loan fees on top.';
      body = '<div style="margin-top:18px">' +
        '<div class="jstat"><span class="k">Stamp duty (' + stUp + (P.fhb ? ', first home buyer' : '') + ')</span><span class="v ' + (duty < 1 ? 'good' : '') + '">' + (duty < 1 ? '$0' : m$(duty)) + '</span></div>' +
        '<div class="jstat"><span class="k">Title and mortgage registration (' + stUp + ', at ' + m$(N.price) + ')</span><span class="v">' + m$(regFeesTotal(N.state, N.price)) + '</span></div>' +
        '<div class="jstat"><span class="k">Conveyancing or solicitor</span><span class="v">$1,300–$2,200</span></div>' +
        '<div class="jstat"><span class="k">Building and pest inspection</span><span class="v">$400–$700</span></div>' +
        '<div class="jstat"><span class="k">Loan application or valuation fee</span><span class="v">$0–$600</span></div>' +
        '</div><p class="jcaveat" style="margin-top:10px">Duty and registration fees are the FY2026-27 schedules for ' + stUp + '. The conveyancing, inspection and loan fee ranges are my estimates of typical quotes, not official figures. The totals use ' + m$(CONVEYANCING) + ' for conveyancing.</p>';
      nav = '<span></span><button type="button" class="jbtn" id="jb-next">Next</button>';
    }

    if (bStep === 1) {
      q = 'Which deposit are you working toward?';
      help = 'Cash needed = deposit + stamp duty + ' + m$(costs) + ' of legal and registration costs, at your ' + m$(N.price) + ' target. You have ' + m$(N.saved) + ' saved.';
      var all = duty + costs;
      var sel = bDepDefault();
      var opts = [];
      if (h2bOpen(N.price)) opts.push([0.02, 'Help to Buy: 2% deposit', 'The government takes up to ' + Math.round(h2bEquity() * 100) + '% of the home. No LMI']);
      opts.push([0.05, P.fhb && fdsOk(N.price) ? '5% deposit with the 5% Deposit Scheme' : '5% deposit',
        P.fhb ? (fdsOk(N.price) ? 'No LMI with the scheme guarantee' : 'Over the scheme price cap for your area, so LMI applies') : 'LMI applies, at the highest rate']);
      opts.push([0.10, '10% deposit', 'LMI applies and is added to the loan']);
      opts.push([0.20, '20% deposit', 'No LMI and the smallest loan']);
      body = '<div style="display:flex;flex-direction:column;gap:9px;margin-top:18px">' +
        opts.map(function (o) {
          var need = N.price * o[0] + all;
          var ok = N.saved >= need;
          var on = Math.abs(sel - o[0]) < 0.001;
          return '<button type="button" class="jwiz-state jb-dep' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-bdep="' + o[0] + '" style="text-align:left;padding:14px 16px">' +
            '<span style="display:block;font-family:var(--font-body);font-weight:600">' + o[1] + '</span>' +
            '<span style="display:block;font-family:var(--font-body);font-size:12.5px;font-weight:400;opacity:0.75;margin-top:2px">' + o[2] + '. Needs ' + m$(need) + (ok ? ', which your savings cover' : ', so you’re short by ' + m$(need - N.saved)) + '</span></button>';
        }).join('') + '</div>';
      nav = '<button type="button" class="jwiz-skip" id="jb-back">← Back</button><span class="jmins">choose one</span>';
    }

    if (bStep === 2) {
      var dep = bDepDefault();
      var lmi = budgetLmi(N.price, dep);
      var loan = budgetLoan(N.price, dep);
      var actual = payAt(loan, RATE);
      var tested = payAt(loan, RATE + 3);
      var L = borrowLimit();
      q = 'Can your income carry the repayments?';
      help = 'Lenders don’t test a loan at today’s rate. They add 3%, so a ' + RATE.toFixed(2) + '% loan is tested at ' + (RATE + 3).toFixed(2) + '%.';
      body = '<div style="margin-top:18px">' +
        '<div class="jstat"><span class="k">Loan with ' + depLabel(dep) + (lmi ? ' (incl. ' + m$(lmi) + ' LMI)' : '') + '</span><span class="v">' + m$(loan) + '</span></div>' +
        '<div class="jstat"><span class="k">Repayment at ' + RATE.toFixed(2) + '%</span><span class="v">' + m$(actual) + '/mo</span></div>' +
        '<div class="jstat"><span class="k">Repayment the lender tests, at ' + (RATE + 3).toFixed(2) + '%</span><span class="v">' + m$(tested) + '/mo</span></div>' +
        '</div>';
      if (L) {
        var spare = L.left - tested;
        body += '<div style="margin-top:14px"><span class="jsc jblock">What’s left for repayments</span>' +
          '<div class="jstat"><span class="k">Income after tax' + (INCOME_FACTOR[P.employment] < 1 ? ' (80% counted)' : '') + '</span><span class="v">' + m$(L.net) + '/mo</span></div>' +
          '<div class="jstat"><span class="k">Living costs a lender assumes</span><span class="v">−' + m$(L.living) + '/mo</span></div>' +
          (L.card > 0 ? '<div class="jstat"><span class="k">Credit card limits (3% of ' + m$(P.cardLimits) + ')</span><span class="v">−' + m$(L.card) + '/mo</span></div>' : '') +
          '<div class="jstat"><span class="k">Left for repayments</span><span class="v">' + m$(L.left) + '/mo</span></div>' +
          '</div>' +
          '<p class="jverdict-line ' + (spare >= 0 ? 'good' : 'warn') + '" style="margin-top:12px">' + (spare >= 0
            ? 'The tested repayment fits, with ' + m$(spare) + ' a month to spare.'
            : 'The tested repayment is ' + m$(-spare) + ' a month more than what’s left, so a lender is unlikely to approve this loan. The next screen works out a price that fits.') + '</p>' +
          (L.card > 0 ? '<p class="jwiz-help" style="margin-top:8px">Lenders count your whole card limit, even with nothing owing. Closing unused cards raises what you can borrow.</p>' : '') +
          '<p class="jcaveat" style="margin-top:10px">' + limitCaveat() + '</p>';
      } else {
        body += '<p class="jcaveat" style="margin-top:12px">Add your household income at step 1 and this screen will test the repayment against it.</p>';
      }
      if (P.rentNow > 0) {
        body += '<p class="jwiz-help" style="margin-top:10px">' + (actual > P.rentNow
          ? 'The repayment at ' + RATE.toFixed(2) + '% is ' + m$(actual - P.rentNow) + ' a month more than your rent now. Saving that difference every month for a while is one way to test if you can carry it.'
          : 'The repayment at ' + RATE.toFixed(2) + '% is less than the ' + m$(P.rentNow) + ' a month you pay in rent now.') + '</p>';
      }
      nav = '<button type="button" class="jwiz-skip" id="jb-back">← Back</button><button type="button" class="jbtn" id="jb-next">Next</button>';
    }

    if (bStep === 3) {
      var dep3 = bDepDefault();
      var ceil = incomeCeiling(dep3);
      var suggest = ceil > 0 ? Math.min(N.price, ceil) : N.price;
      q = 'Your maximum price';
      help = 'The most you’ll pay for any property. Set it now, before you make an offer or bid. ' +
        (ceil > 0
          ? (ceil < N.price
            ? 'With ' + depLabel(dep3) + ', I estimate a lender would approve a loan for a home up to about ' + m$(ceil) + ' on your income. That’s below your ' + m$(N.price) + ' target, so it’s the starting figure here. '
            : 'Your ' + m$(N.price) + ' target is within the ' + m$(ceil) + ' I estimate a lender would approve with ' + depLabel(dep3) + '. ')
          : '') +
        'You can change it any time.';
      body = '<div class="jwiz-input-row"><span class="jwiz-cur">$</span>' +
        '<input class="jwiz-input" id="jb-cap" type="text" inputmode="decimal" value="' + Number(S.budget.cap || suggest).toLocaleString('en-AU') + '" aria-label="Maximum price"></div>';
      nav = '<button type="button" class="jwiz-skip" id="jb-back">← Back</button><button type="button" class="jbtn" id="jb-commit">Save my maximum price</button>';
    }

    box.innerHTML = '<div class="jwizard"><div class="jwiz-card">' +
      '<div class="jwiz-dots" aria-hidden="true">' + dots + '</div>' +
      '<h3 class="jwiz-q" tabindex="-1">' + q + '</h3>' +
      '<p class="jwiz-help">' + help + '</p>' + body +
      '<div class="jwiz-nav">' + nav + '</div>' +
      '</div></div>';
    focusHeading(box);

    var nx = document.getElementById('jb-next');
    if (nx) nx.addEventListener('click', function () { bStep++; renderBudget(); });
    var bk = document.getElementById('jb-back');
    if (bk) bk.addEventListener('click', function () { bStep = Math.max(0, bStep - 1); renderBudget(); });
    var deps = box.querySelectorAll('[data-bdep]');
    for (var i = 0; i < deps.length; i++) deps[i].addEventListener('click', function () {
      if (RO) return;
      S.budget.depositPct = parseFloat(this.getAttribute('data-bdep'));
      save(); bStep = 2; renderBudget();
    });
    var cm = document.getElementById('jb-commit');
    if (cm) cm.addEventListener('click', function () {
      if (RO) return;
      var capIn = document.getElementById('jb-cap');
      var v = parseNum(capIn.value);
      if (!(v >= 50000)) { fieldError(capIn, 'Enter a price of at least $50,000, for example 550,000.'); return; }
      S.budget.cap = Math.round(v);
      S.budget.depositPct = bDepDefault();
      _budgetEditing = false;
      save();
      track('journey_budget_cap_set', {});
      renderBudget();
    });
    var capField = document.getElementById('jb-cap');
    if (capField) capField.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); var b2 = document.getElementById('jb-commit'); if (b2) b2.click(); } });
  }

  function renderBudgetDash(box) {
    var N = S.numbers, P = S.profile;
    var cap = S.budget.cap, dep = bDepDefault();
    var duty = buyerDutyAt(cap);
    var costs = duty + otherCosts(cap);
    var lmi = budgetLmi(cap, dep);
    var loan = budgetLoan(cap, dep);
    var tested = payAt(loan, RATE + 3);
    var L = borrowLimit();
    var need = cap * dep + costs;
    var stUp = esc(N.state.toUpperCase());
    var html = '';

    html += '<section class="jcard jpad" style="text-align:center;margin-top:18px">' +
      '<span class="jsc jsc-gold jblock">Your maximum price</span>' +
      '<div class="jcap">' + m$(cap) + '</div>' +
      '<p class="jwiz-help" style="margin-top:6px">With ' + depLabel(dep) + (isH2B(dep) ? ', the government holding up to ' + Math.round(h2bEquity() * 100) + '%' : (lmi ? ' (LMI of ' + m$(lmi) + ' added to the loan)' : ', no LMI')) + '. Steps 4 and 5 use this figure.</p>' +
      '<div class="jwiz-nav" style="justify-content:center;margin-top:14px"><button type="button" class="jwiz-skip" id="jb-edit">Change my budget</button></div></section>';

    html += '<section class="jcard jpad"><span class="jsc jblock">Costs at your maximum price</span>' +
      '<div class="jstat"><span class="k">Stamp duty (' + stUp + (P.fhb ? ', first home buyer' : '') + ')</span><span class="v ' + (duty < 1 ? 'good' : '') + '">' + (duty < 1 ? '$0' : m$(duty)) + '</span></div>' +
      '<div class="jstat"><span class="k">Legal and registration costs (estimate)</span><span class="v">' + m$(otherCosts(cap)) + '</span></div>' +
      '<div class="jstat"><span class="k">Cash needed (deposit + costs)</span><span class="v ' + (N.saved >= need ? 'good' : '') + '">' + m$(need) + (N.saved >= need ? ', covered' : ', short ' + m$(need - N.saved)) + '</span></div>' +
      '<div class="jstat"><span class="k">Loan</span><span class="v">' + m$(loan) + '</span></div>' +
      '<div class="jstat"><span class="k">Repayment at ' + RATE.toFixed(2) + '%</span><span class="v">' + m$(payAt(loan, RATE)) + '/mo</span></div>' +
      '<div class="jstat"><span class="k">Repayment the lender tests, at ' + (RATE + 3).toFixed(2) + '%</span><span class="v">' + m$(tested) + '/mo</span></div>' +
      (L ? '<div class="jstat"><span class="k">Left for repayments on your income (estimate)</span><span class="v ' + (L.left >= tested ? 'good' : 'warn') + '">' + m$(L.left) + '/mo</span></div>' +
        (L.left < tested ? '<p class="jverdict-line warn" style="margin-top:10px">The tested repayment is ' + m$(tested - L.left) + ' a month more than my estimate of what’s left, so a lender may not approve this loan. A lower maximum or a larger deposit would close the gap.</p>' : '') : '') +
      '<p class="jcaveat" style="margin-top:10px">' + (L ? limitCaveat() + ' ' : '') + 'Your savings are ' + m$(N.saved) + '. General information, not financial advice.</p></section>';

    html += '<section class="jcard jpad jdone-row">' +
      '<button class="jbtn" data-jmark="3">Mark this step done</button></section>';
    box.innerHTML = html;
    var ed = document.getElementById('jb-edit');
    if (ed) ed.addEventListener('click', function () { _budgetEditing = true; bStep = 1; renderBudget(); });
  }

  // ── Stop 4: pick your ground — real-data suburb suggester ───────────
  // /journey-suburbs.json is generated by build/make-journey-suburbs.js from
  // the verified CC BY 4.0 market dataset. Sale medians exist for VIC +
  // metro Adelaide; QLD/SA/TAS rows carry current median rents (rents are
  // never presented as prices); NSW is postcode-geo only and excluded.
  var _subData = null, _subFetch = null;
  function fetchSuburbs() {
    if (_subData) return Promise.resolve(_subData);
    if (_subFetch) return _subFetch;
    _subFetch = fetch('/journey-suburbs.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && Array.isArray(j.rows)) { _subData = j; return j; } _subFetch = null; return null; })
      .catch(function () { _subFetch = null; return null; });
    return _subFetch;
  }
  function kmBetween(a, b) {
    var R = 6371, d2r = Math.PI / 180;
    var dLat = (b[0] - a[0]) * d2r, dLng = (b[1] - a[1]) * d2r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  // Coordinates are postcode centres, so short distances are not meaningful.
  function kmLabel(km) { return km < 2 ? 'under 2 km' : 'about ' + Math.round(km) + ' km'; }
  // The suburb the buyer named at step 1, matched in their own state only.
  function resolveAnchor(j) {
    var name = (S.profile.anchor || '').trim().toLowerCase();
    if (!name || !j) return null;
    for (var i = 0; i < j.rows.length; i++) {
      var r = j.rows[i];
      if (r[6] && r[0] === S.numbers.state && r[1].toLowerCase() === name) return r;
    }
    return null;
  }
  function subFigure(r) {
    var bits = [];
    if (r[3]) bits.push('<b>' + m$(r[3]) + '</b> <span class="jsub-kind">median, houses</span>');
    if (r[4]) bits.push('<b>' + m$(r[4]) + '</b> <span class="jsub-kind">median, units</span>');
    if (r[5]) bits.push('<b>$' + Number(r[5]).toLocaleString('en-AU') + '/wk</b> <span class="jsub-kind">median rent</span>');
    return bits.join('; ');
  }
  // The price band to search in. With a committed maximum the band stops at
  // it: a suburb whose median is above your maximum is one where most homes
  // sell for more than you can pay.
  function searchBand() {
    var cap = S.budget.cap;
    var r5 = function (v) { return Math.round(v / 5000) * 5000; };
    if (cap) return { target: cap, lo: r5(cap * 0.85), hi: cap, capped: true };
    return { target: S.numbers.price, lo: r5(S.numbers.price * 0.9), hi: r5(S.numbers.price * 1.1), capped: false };
  }
  // The dataset's own period labels, so a data refresh can never ship new
  // numbers under an old caption.
  function subSource(j) {
    var a = (j && j.asAt) || {};
    var prices = [a.vic_price, a.sa_price].filter(Boolean).join('; ');
    var rents = [a.qld_rent, a.sa_rent, a.tas_rent].filter(Boolean).join('; ');
    return (prices ? 'Sale medians: ' + esc(prices) + '. ' : '') + (rents ? 'Rents: ' + esc(rents) + '. ' : '') + 'State government open data, CC BY 4.0.';
  }
  function subRow(name, st, figure, slug) {
    return '<a class="jsub-row" href="/suburb/' + encodeURIComponent(st) + '/' + encodeURIComponent(slug) + '/">' +
      '<span class="jsub-name">' + esc(name) + ' <span class="jsub-st">' + esc(String(st).toUpperCase()) + '</span></span>' +
      '<span class="jsub-fig">' + figure + '</span></a>';
  }
  var PRICE_STATES = 'Victoria and metro Adelaide';

  function renderGroundNear(j) {
    var box = document.getElementById('jground-near');
    if (!box) return;
    var sec = box.closest('section');
    var asked = (S.profile.anchor || '').trim();
    if (!asked || !j) { if (sec) sec.hidden = true; return; }
    if (sec) sec.hidden = false;
    var a = resolveAnchor(j);
    if (!a) {
      box.innerHTML = '<p class="jcaveat" style="margin:0">“' + esc(asked) + '” isn’t in my data for ' + esc(S.numbers.state.toUpperCase()) + ', so I can’t sort suburbs by distance from it. I only hold suburbs with at least 2,000 residents and a government rent or sale figure. The search below covers all of them.</p>';
      return;
    }
    var withDist = j.rows.filter(function (r) { return r[6] && r[0] === a[0] && r[2] !== a[2]; })
      .map(function (r) { return { r: r, km: kmBetween([a[6], a[7]], [r[6], r[7]]) }; })
      .sort(function (x, y) { return x.km - y.km; })
      .slice(0, 8);
    box.innerHTML =
      '<p class="jhint" style="margin:0 0 8px">The suburbs in my data closest to ' + esc(a[1]) + '. Distances are rough, measured between postcode centres.' + (a[3] || a[4] ? '' : ' These are rents, not prices.') + '</p>' +
      '<div class="jsub-list">' +
      subRow(a[1] + ' (your pick)', a[0], subFigure(a), a[2]) +
      withDist.map(function (x) {
        return subRow(x.r[1], x.r[0], subFigure(x.r) + ' <span class="jsub-kind">' + kmLabel(x.km) + '</span>', x.r[2]);
      }).join('') + '</div>' +
      '<p class="jcaveat" style="margin-top:10px">' + subSource(j) + '</p>';
  }

  function renderGroundFits(j) {
    var box = document.getElementById('jground-fits');
    if (!box) return;
    if (!j) { box.innerHTML = '<p class="jcaveat">The suburb data didn’t load. <button type="button" class="jwiz-skip" id="jground-retry">Try again</button></p>'; var rt = document.getElementById('jground-retry'); if (rt) rt.addEventListener('click', renderGround); return; }
    var band = searchBand();
    var myState = S.numbers.state;
    var stUp = esc(myState.toUpperCase());
    var mine = j.rows.filter(function (r) { return r[0] === myState; });
    if (!mine.some(function (r) { return r[3] || r[4]; })) {
      // No sale medians for this state. Listing another state's suburbs would
      // be no use to this buyer, so say what is missing and stop.
      box.innerHTML = '<p class="jcaveat" style="margin:0">I have no suburb sale medians for ' + stUp + '. The only state government sale data I can republish at suburb level covers ' + PRICE_STATES + ', so I can’t tell you which ' + stUp + ' suburbs are inside your band.' +
        (mine.length ? ' I do have median rents for ' + stUp + ', in the search below.' : ' I have no suburb figures for ' + stUp + ' at all yet.') +
        ' For sale prices, compare recent sales in the suburbs you’re considering with your ' + m$(band.lo) + '–' + m$(band.hi) + ' band.</p>';
      track('journey_ground_matches', { n: 0 });
      return;
    }
    var fits = [];
    mine.forEach(function (r) {
      if (r[3] >= band.lo && r[3] <= band.hi) fits.push({ r: r, price: r[3], kind: 'houses' });
      else if (r[4] >= band.lo && r[4] <= band.hi) fits.push({ r: r, price: r[4], kind: 'units' });
    });
    var anch = resolveAnchor(j);
    if (anch) {
      fits.forEach(function (f) { f.km = f.r[6] ? kmBetween([anch[6], anch[7]], [f.r[6], f.r[7]]) : 1e9; });
      fits.sort(function (a, b) { return a.km - b.km; });
    } else {
      fits.sort(function (a, b) { return b.price - a.price; });
    }
    var top = fits.slice(0, 12);
    var html = '';
    if (top.length) {
      html += '<div class="jsub-list">' + top.map(function (f) {
        return subRow(f.r[1], f.r[0], '<b>' + m$(f.price) + '</b> <span class="jsub-kind">median, ' + f.kind + (f.km != null && f.km < 1e9 ? ', ' + kmLabel(f.km) : '') + '</span>', f.r[2]);
      }).join('') + '</div>';
      html += '<p class="jhint" style="margin-top:8px">' + fits.length + ' ' + stUp + ' suburb' + (fits.length === 1 ? ' has' : 's have') + ' a median between ' + m$(band.lo) + ' and ' + m$(band.hi) + '.' +
        (fits.length > top.length ? ' Showing the 12 ' + (anch ? 'closest to ' + esc(anch[1]) : 'nearest the top of your band') + '.' : '') + '</p>';
    } else {
      html += '<p class="jcaveat">No ' + stUp + ' suburb in my data has a median between ' + m$(band.lo) + ' and ' + m$(band.hi) + '. The unit median is often below the house median, so search for a suburb below to see both.</p>';
    }
    html += '<p class="jcaveat" style="margin-top:10px">' + subSource(j) + '</p>';
    box.innerHTML = html;
    track('journey_ground_matches', { n: fits.length });
  }

  function renderGroundSearch(j) {
    var res = document.getElementById('jsub-res');
    var q = document.getElementById('jsub-q');
    if (!res || !q || !j) return;
    var run = function () {
      var term = (q.value || '').trim().toLowerCase();
      if (term.length < 2) { res.innerHTML = ''; return; }
      // The buyer's own state first.
      var hits = j.rows.filter(function (r) { return r[1].toLowerCase().indexOf(term) !== -1; })
        .sort(function (a, b) { return (a[0] === S.numbers.state ? 0 : 1) - (b[0] === S.numbers.state ? 0 : 1) || a[1].localeCompare(b[1]); })
        .slice(0, 8);
      if (!hits.length) { res.innerHTML = '<p class="jcaveat" style="margin-top:10px" role="status">Nothing in my data matches “' + esc(term) + '”. It covers Queensland, Victoria, South Australia and Tasmania only.</p>'; return; }
      res.innerHTML = '<div class="jsub-list" style="margin-top:10px">' + hits.map(function (r) {
        return subRow(r[1], r[0], subFigure(r), r[2]);
      }).join('') + '</div>';
    };
    var t = null;
    q.addEventListener('input', function () { if (t) clearTimeout(t); t = setTimeout(run, 200); });
  }

  function renderGround() {
    var box = document.getElementById('jground');
    if (!box) return;
    var band = searchBand();
    box.innerHTML =
      '<section class="jcard jpad"><span class="jsc jblock">Your search band</span>' +
      '<p style="font-size:15px;line-height:1.65">' + (band.capped
        ? 'Your maximum is <b class="mono-strong">' + m$(band.target) + '</b>. Look at suburbs where the median sits between <b class="mono-strong">' + m$(band.lo) + '</b> and <b class="mono-strong">' + m$(band.hi) + '</b>. Where the median is above your maximum, more than half the homes sell for more than you can pay.'
        : 'With a target of <b class="mono-strong">' + m$(band.target) + '</b>, look at suburbs where the median sits between <b class="mono-strong">' + m$(band.lo) + '</b> and <b class="mono-strong">' + m$(band.hi) + '</b>. Once you set a maximum price at step 3, the band stops at it.') +
      '</p></section>' +
      '<section class="jcard jpad" hidden><span class="jsc jblock">Near ' + (S.profile.anchor ? esc(S.profile.anchor) : 'your pick') + '</span>' +
      '<div id="jground-near"></div></section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Suburbs inside your band</span>' +
      '<div id="jground-fits" aria-live="polite"><p class="jcaveat">Loading the suburb data…</p></div></section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Search for a suburb</span>' +
      '<p class="jcaveat" style="margin:0 0 10px">Each suburb has a government figure with its period: sale medians for ' + PRICE_STATES + ', median rents for Queensland, South Australia and Tasmania. Each result opens the suburb’s page.</p>' +
      '<input type="text" id="jsub-q" class="jsub-input" placeholder="Type a suburb name…" aria-label="Search suburbs">' +
      '<div id="jsub-res" aria-live="polite"></div></section>' +
      '<section class="jcard jpad jdone-row">' +
      '<button class="jbtn" data-jmark="4">Mark this step done</button></section>';
    fetchSuburbs().then(function (j) {
      renderGroundNear(j);
      renderGroundFits(j);
      renderGroundSearch(j);
    });
  }

  // ── Stop 5: the places library ───────────────────────────────────────
  // One library for the whole hunt: everything browsed, inspected, offered
  // on, lost at auction or won — the owner's "portfolio of places".
  var PLACE_STATUSES = [
    ['browsed', 'Browsed'],
    ['inspected', 'Inspected'],
    ['shortlist', 'Shortlist'],
    ['offer', 'Offer made'],
    ['lost', 'Lost auction'],
    ['passed', 'Passed'],
    ['won', 'Won']
  ];
  var PLACE_LABEL = {};
  PLACE_STATUSES.forEach(function (s) { PLACE_LABEL[s[0]] = s[1]; });
  function placeSt(r) { return r.st || ['inspected', 'shortlist', 'passed'][r.v] || 'inspected'; }
  var _huntFilter = 'all';
  var _huntOpen = -1;

  function capDelta(price) {
    var cap = S.budget.cap;
    if (!cap || !price) return '';
    var diff = price - cap;
    if (diff > 0) return ' <span class="jcapdelta over">' + m$(diff) + ' over your maximum</span>';
    return ' <span class="jcapdelta under">within your maximum</span>';
  }

  function renderHunt() {
    var box = document.getElementById('jhunt');
    if (!box) return;
    if (_huntOpen >= S.inspections.length) _huntOpen = -1;

    var counts = { all: S.inspections.length };
    S.inspections.forEach(function (r) { var k = placeSt(r); counts[k] = (counts[k] || 0) + 1; });
    if (!counts[_huntFilter]) _huntFilter = 'all';

    var filters = '<div class="jplace-filters">' +
      [['all', 'All']].concat(PLACE_STATUSES).map(function (s) {
        if (s[0] !== 'all' && !counts[s[0]]) return '';
        return '<button type="button" class="jplace-filter' + (_huntFilter === s[0] ? ' sel' : '') + '" data-place-filter="' + s[0] + '">' +
          s[1] + ' <b>' + (counts[s[0]] || 0) + '</b></button>';
      }).join('') + '</div>';

    var rows = S.inspections.map(function (r, i) {
      var st = placeSt(r);
      if (_huntFilter !== 'all' && st !== _huntFilter) return '';
      var when = dayLabel(r.at);
      var picker = '';
      if (_huntOpen === i) {
        picker = '<div class="jplace-pick">' + PLACE_STATUSES.map(function (s) {
          return '<button type="button" class="jplace-pick-chip st-' + s[0] + (st === s[0] ? ' sel' : '') + '" data-place-set="' + i + ':' + s[0] + '">' + s[1] + '</button>';
        }).join('') + '</div>';
      }
      return '<div class="jinsp' + (st === 'passed' || st === 'lost' ? ' muted' : '') + '">' +
        '<div class="jinsp-main"><div class="jinsp-addr">' + esc(r.addr) + '</div>' +
        '<div class="jinsp-meta">' + (r.price ? m$(r.price) + capDelta(r.price) + (r.note ? ', ' : '') : '') + esc(r.note || '') + '</div>' +
        (when ? '<div class="jinsp-when">Added ' + when + '</div>' : '') +
        (r.price && r.price < MIN_PRICE ? '<div class="jinsp-when">That price is under ' + m$(MIN_PRICE) + ', so I can’t compare schemes for it. If it’s a typo, remove the place and add it again.</div>' : '') + '</div>' +
        (r.price >= MIN_PRICE ? '<button type="button" class="jplace-proj" data-place-proj="' + i + '" title="Open step 2 at this price. Your target price stays as it is.">Compare schemes</button>' : '') +
        '<button type="button" class="jplace-st st-' + st + '" data-place-status="' + i + '" aria-expanded="' + (_huntOpen === i) + '">' + PLACE_LABEL[st] + ' ▾</button>' +
        '<button type="button" class="jinsp-del" data-insp-del="' + i + '" aria-label="Remove ' + esc(r.addr) + '">×</button>' +
        '</div>' + picker;
    }).join('');

    var won = null;
    for (var w = 0; w < S.inspections.length; w++) if (placeSt(S.inspections[w]) === 'won') { won = S.inspections[w]; break; }

    box.innerHTML =
      '<section class="jcard jpad"><span class="jsc jblock">Add a place</span>' +
      '<form id="jinsp-form" class="jinsp-form">' +
      '<input type="text" id="jinsp-addr" placeholder="12 Example St, Suburb" aria-label="Address" required>' +
      '<input type="text" id="jinsp-price" inputmode="decimal" placeholder="Asking price" aria-label="Asking price">' +
      '<input type="text" id="jinsp-note" placeholder="A note, such as a problem you noticed" aria-label="Note">' +
      '<button type="submit" class="jbtn">Add</button>' +
      '</form>' +
      '<p class="jerr" id="jinsp-msg" role="alert" hidden></p>' +
      (S.inspections.length
        ? filters + '<div class="jinsp-list">' + rows + '</div>'
        : '<p class="jcaveat" style="margin-top:12px">No places yet. Add the ones you’ve only seen online as well, with a note while you still remember it.</p>') +
      '</section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Making an offer or bidding</span>' +
      (S.budget.cap
        ? '<p class="joffer-cap">Your maximum price: <b class="mono-strong">' + m$(S.budget.cap) + '</b>, set at step 3. It applies to both options below.</p>'
        : '<p class="joffer-cap">Set your maximum price at step 3 first. Both options below start from it.</p>') +
      '<div class="joffer-grid">' +
      '<div><h3 class="joffer-h">Private sale</h3>' +
      '<p>Base the offer on recent sales of similar homes nearby, and start below your maximum. Talk to your solicitor before you waive the finance or building and pest condition.</p></div>' +
      '<div><h3 class="joffer-h">At auction</h3>' +
      '<p>An auction sale has no conditions, so get the building and pest inspection and loan approval done before the day, and take your maximum in writing. If you miss out, set the place to \u201cLost auction\u201d above.</p></div>' +
      '</div>' +
      '<div class="jwiz-nav" style="margin-top:14px"><span class="jmins">The auction budget calculator sets out bidding steps and prints a plan for the day.</span>' +
      '<a class="jbtn quiet" href="/tools/auction-budget-calculator">Open the auction budget calculator</a></div>' +
      '</section>' +
      '<section class="jcard jpad jdone-row"><div><div class="jdone-t">' +
      (won ? 'You won ' + esc(won.addr) + '.' : '') +
      '</div></div>' +
      '<button class="jbtn" data-jmark="5">Mark this step done</button></section>';

    var f = document.getElementById('jinsp-form');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (RO) return;
      var addr = (document.getElementById('jinsp-addr').value || '').trim();
      if (!addr) return;
      if (S.inspections.length >= 50) {
        // Never drop an old place silently to make room.
        var msg = document.getElementById('jinsp-msg');
        if (msg) { msg.hidden = false; msg.textContent = 'The list holds 50 places. Remove one you’ve ruled out to add another.'; }
        return;
      }
      S.inspections.unshift({
        addr: addr.slice(0, 120),
        price: parseNum(document.getElementById('jinsp-price').value) || 0,
        note: (document.getElementById('jinsp-note').value || '').trim().slice(0, 160),
        st: 'inspected',
        at: Date.now()
      });
      _huntOpen = -1;
      save(); renderHunt(); renderPlacesSummary();
      track('journey_place_added', {});
    });
  }

  // Compact library summary on the trail home.
  function renderPlacesSummary() {
    var slot = document.getElementById('jplaces-slot');
    if (!slot) return;
    if (!S.inspections.length) { slot.innerHTML = ''; return; }
    var counts = {};
    S.inspections.forEach(function (r) { var k = placeSt(r); counts[k] = (counts[k] || 0) + 1; });
    var bits = PLACE_STATUSES.filter(function (s) { return counts[s[0]]; })
      .map(function (s) { return '<b>' + counts[s[0]] + '</b> ' + (counts[s[0]] === 1 ? s[1].toLowerCase() : (s[0] === 'browsed' ? 'browsed' : s[0] === 'inspected' ? 'inspected' : s[0] === 'shortlist' ? 'shortlisted' : s[0] === 'offer' ? 'offers made' : s[0] === 'lost' ? 'lost at auction' : s[0] === 'passed' ? 'passed on' : 'won')); });
    slot.innerHTML = '<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jblock">Your places</span>' +
      '<p>' + bits.join(', ') + '</p></div>' +
      '<div class="jsignup-actions"><button type="button" class="jbtn quiet" data-jgoto="hunt">Open the list</button></div></div>';
  }

  // ── Stops 6 & 7 checklists ───────────────────────────────────────────
  var DEAL_CHECKS = [
    ['Send the contract to your solicitor', 'Budget $1,300 to $2,200'],
    ['Book the building and pest inspection', '$400 to $700. Book it in the first week.'],
    ['Send the contract to your lender or broker', 'This starts formal approval'],
    ['Confirm your place in the scheme', 'If you chose a scheme at step 2'],
    ['Arrange building insurance from the contract date', 'In some states risk passes to you at signing']
  ];
  var SETTLE_CHECKS = [
    ['Book the final inspection for the day before settlement', 'Check the place is in the same condition as when you signed'],
    ['Transfer the shortfall to your solicitor', 'They’ll give you the amount a few days before settlement'],
    ['Have building insurance in place from settlement day', 'Lenders want proof before they’ll settle'],
    ['Book utilities and internet for the move', 'About two weeks ahead'],
    ['Collect the keys', 'Once settlement is done']
  ];
  function renderChecklist(elId, items, stateKey) {
    var boxEl = document.getElementById(elId);
    if (!boxEl) return;
    boxEl.innerHTML = items.map(function (c, i) {
      var on = !!S[stateKey][i];
      return '<button type="button" class="jcheck' + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '" data-checklist="' + stateKey + '" data-check="' + i + '">' +
        '<span class="jbox">' + IC.check + '</span><span><span class="t">' + esc(c[0]) + '</span><span class="d" style="display:block">' + esc(c[1]) + '</span></span></button>';
    }).join('');
  }
  // ── Stop 6: real deadline tracking ───────────────────────────────────
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fromISO(s) { var p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDaysISO(s, n) { var d = fromISO(s); d.setDate(d.getDate() + n); return isoDate(d); }
  function addBizDaysISO(s, n) {
    var d = fromISO(s), left = n;
    while (left > 0) { d.setDate(d.getDate() + 1); var w = d.getDay(); if (w !== 0 && w !== 6) left--; }
    return isoDate(d);
  }
  function daysLeft(s) {
    var t = new Date(), today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((fromISO(s) - today) / 86400000);
  }
  function humanDate(s) { try { return fromISO(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
  // Statutory cooling-off, business days, private treaty sales (auctions have
  // none anywhere). WA and TAS have no statutory cooling-off period.
  var COOL_OFF_BIZ = { qld: 5, nsw: 5, vic: 3, sa: 2, act: 5, nt: 4 };
  // Prefill for the cooling-off end date. Queensland counts the day the buyer
  // is bound by the contract as day one when that is a business day (Property
  // Occupations Act 2014, s 166), so its period ends a business day earlier
  // than a count that starts the next day. Public holidays are not known
  // here, which is why the screen tells the buyer to confirm the date.
  function coolingDefault(st, c) {
    var biz = COOL_OFF_BIZ[st];
    if (!biz || !c) return '';
    var w = fromISO(c).getDay();
    if (st === 'qld' && w !== 0 && w !== 6) return addBizDaysISO(c, biz - 1);
    return addBizDaysISO(c, biz);
  }

  var dStep = 0;
  function dealDateQs() {
    var st = S.numbers.state;
    var biz = COOL_OFF_BIZ[st];
    var c = S.deal.dates.contract;
    return [
      { id: 'contract', q: 'When did you sign the contract?', help: 'Every other deadline counts from this date.', def: isoDate(new Date()) },
      { id: 'cooling', q: 'When does cooling-off end?',
        help: biz
          ? 'In ' + st.toUpperCase() + ' it’s ' + biz + ' business days for a private sale' + (st === 'qld' ? ', and the day you receive the signed contract counts as day one' : '') + '. The date shown skips weekends but not public holidays, which push it later, so use the date your solicitor confirms. Skip this if you bought at auction (there’s no cooling-off at auction) or waived it.'
          : st.toUpperCase() + ' has no cooling-off period set by law. Skip this unless your contract adds one.',
        def: coolingDefault(st, c), optional: true },
      { id: 'bp', q: 'When is the building and pest deadline?', help: 'The date by which the contract says the inspection must be done and acted on. The date shown is 14 days after signing, a common term. Use the date in your contract, or skip this if it has no building and pest condition.', def: c ? addDaysISO(c, 14) : '', optional: true },
      { id: 'finance', q: 'When is the finance approval deadline?', help: 'The “subject to finance” date. If the loan isn’t approved by then, you need to extend or end the contract, or you risk your deposit. 14–21 days is common.', def: c ? addDaysISO(c, 21) : '', optional: true },
      { id: 'preapproval', q: 'When does your pre-approval expire?', help: 'Usually about 90 days from when the lender issued it. Skip this if you don’t have one.', def: '', optional: true },
      { id: 'settlement', q: 'When is settlement?', help: 'The day the money changes hands and you get the keys. It’s in the contract, and 30 to 60 days after signing is common.', def: c ? addDaysISO(c, 42) : '' }
    ];
  }

  function renderDeal() {
    var box = document.getElementById('jdeal');
    if (!box) return;
    if (!S.deal.signed) { renderDealPre(box); refreshMarkButtons(); return; }
    if (!S.deal.dates.contract || _dealEditing) { renderDealWizard(box); return; }
    renderDealDash(box);
    refreshMarkButtons();
  }

  function renderDealPre(box) {
    box.innerHTML =
      '<section class="jcard jpad" style="margin-top:18px"><span class="jsc jblock">The deadlines after you sign</span>' +
      '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">These dates start running the day you sign. Once you’ve signed, come back with the contract and enter each one.</p>' +
      '<div class="jdl"><div><div>Cooling-off ends</div><div class="jwhen">set by your state</div></div><span class="jdays urgent">first</span></div>' +
      '<div class="jdl"><div><div>Building and pest deadline</div><div class="jwhen">often about 14 days</div></div><span class="jdays soon">next</span></div>' +
      '<div class="jdl"><div><div>Finance approval deadline</div><div class="jwhen">often 14–21 days</div></div><span class="jdays soon">next</span></div>' +
      '<div class="jdl"><div><div>Pre-approval expires</div><div class="jwhen">usually about 90 days after the lender issues it</div></div><span class="jdays ok">varies</span></div>' +
      '<div class="jdl"><div><div>Settlement</div><div class="jwhen">often 30–60 days after signing</div></div><span class="jdays ok">last</span></div>' +
      '<div class="jwiz-nav" style="margin-top:16px"><span></span><button type="button" class="jbtn" id="jd-signed">Enter my contract dates</button></div></section>';
    var b = document.getElementById('jd-signed');
    if (b) b.addEventListener('click', function () { S.deal.signed = true; dStep = 0; save(); renderDeal(); });
  }

  function renderDealWizard(box) {
    var qs = dealDateQs();
    if (dStep >= qs.length) {
      _dealEditing = false; save();
      track('journey_deal_dates_set', {});
      renderDeal();
      return;
    }
    var q = qs[dStep];
    var cur = S.deal.dates[q.id] || q.def || '';
    var dots = qs.map(function (_, i) { return '<span class="jwiz-dot' + (i <= dStep ? ' on' : '') + '"></span>'; }).join('');
    box.innerHTML = '<div class="jwizard"><div class="jwiz-card">' +
      '<div class="jwiz-dots" aria-hidden="true">' + dots + '</div>' +
      '<h3 class="jwiz-q" tabindex="-1">' + esc(q.q) + '</h3>' +
      '<p class="jwiz-help">' + esc(q.help) + '</p>' +
      '<div class="jwiz-input-row"><input class="jwiz-input jdate" id="jd-in" type="date" value="' + esc(cur) + '" aria-label="' + esc(q.q) + '"></div>' +
      '<div class="jwiz-nav">' +
      (dStep > 0 ? '<button type="button" class="jwiz-skip" id="jd-back">← Back</button>' : '<button type="button" class="jwiz-skip" id="jd-notyet">← Not signed yet</button>') +
      '<span style="display:flex;gap:14px;align-items:center">' +
      (q.optional ? '<button type="button" class="jwiz-skip" id="jd-skip">Skip</button>' : '') +
      '<button type="button" class="jbtn" id="jd-next">Next</button></span>' +
      '</div></div></div>';
    var nx = document.getElementById('jd-next');
    if (nx) nx.addEventListener('click', function () {
      var inp = document.getElementById('jd-in');
      var v = inp ? inp.value : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(fromISO(v).getTime())) {
        fieldError(inp, q.optional ? 'Choose a date, or press Skip if this doesn’t apply.' : 'Choose a date to continue.');
        return;
      }
      if (q.id !== 'contract' && q.id !== 'preapproval' && S.deal.dates.contract && v < S.deal.dates.contract) {
        fieldError(inp, 'That’s before the day you signed (' + humanDate(S.deal.dates.contract) + ').');
        return;
      }
      if (RO) return;
      S.deal.dates[q.id] = v; save();
      dStep++; renderDealWizard(box);
    });
    var sk = document.getElementById('jd-skip');
    if (sk) sk.addEventListener('click', function () { if (RO) return; delete S.deal.dates[q.id]; save(); dStep++; renderDealWizard(box); });
    var bk = document.getElementById('jd-back');
    if (bk) bk.addEventListener('click', function () { dStep = Math.max(0, dStep - 1); renderDealWizard(box); });
    var ny = document.getElementById('jd-notyet');
    if (ny) ny.addEventListener('click', function () { if (RO) return; S.deal.signed = false; save(); renderDeal(); });
    var di = document.getElementById('jd-in');
    if (di) { try { di.focus({ preventScroll: true }); } catch (e) {} }
  }

  // ICS export (RFC 5545): all-day VEVENTs, CRLF line endings, UID+DTSTAMP.
  function buildDealIcs() {
    var D = S.deal.dates;
    var labels = {
      cooling: 'Cooling-off ends', bp: 'Building and pest deadline',
      finance: 'Finance approval deadline', preapproval: 'Pre-approval expires',
      settlement: 'Settlement day'
    };
    var d = new Date();
    var stamp = d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EquitySight//First Home Journey//EN', 'CALSCALE:GREGORIAN'];
    Object.keys(labels).forEach(function (k) {
      if (!D[k]) return;
      var ymd = D[k].replace(/-/g, '');
      lines.push('BEGIN:VEVENT');
      lines.push('UID:journey-' + k + '-' + ymd + '@equitysight.app');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART;VALUE=DATE:' + ymd);
      lines.push('DTEND;VALUE=DATE:' + addDaysISO(D[k], 1).replace(/-/g, ''));
      lines.push('SUMMARY:' + labels[k] + ' (first home purchase)');
      lines.push('DESCRIPTION:From the First Home Journey deadline tracker at equitysight.app/journey. Check the date and terms in your contract.');
      // Reminder at 9am the day before (15 hours before the all-day start).
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT15H');
      lines.push('ACTION:DISPLAY');
      lines.push('DESCRIPTION:' + labels[k] + ' tomorrow');
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function downloadDealIcs() {
    try {
      var blob = new Blob([buildDealIcs()], { type: 'text/calendar' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'first-home-deadlines.ics';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      track('journey_ics_download', {});
    } catch (e) {}
  }

  var DEAL_DATE_LABELS = {
    contract: 'Contract signed', cooling: 'Cooling-off ends', bp: 'Building and pest deadline',
    finance: 'Finance approval deadline', preapproval: 'Pre-approval expires', settlement: 'Settlement day'
  };
  function renderDealDash(box) {
    var D = S.deal.dates;
    var rows = ['cooling', 'bp', 'finance', 'preapproval', 'settlement']
      .filter(function (k) { return D[k]; })
      .map(function (k) { return { k: k, date: D[k], left: daysLeft(D[k]) }; })
      .sort(function (a, b) { return a.left - b.left; })
      .map(function (r) {
        var chip;
        if (r.left < 0) chip = '<span class="jdays urgent">passed</span>';
        else if (r.left === 0) chip = '<span class="jdays urgent">today</span>';
        else if (r.left <= 7) chip = '<span class="jdays urgent">' + r.left + ' day' + (r.left > 1 ? 's' : '') + '</span>';
        else if (r.left <= 21) chip = '<span class="jdays soon">' + r.left + ' days</span>';
        else chip = '<span class="jdays ok">' + r.left + ' days</span>';
        return '<div class="jdl"><div><div>' + DEAL_DATE_LABELS[r.k] + '</div><div class="jwhen">' + humanDate(r.date) + '</div></div>' + chip + '</div>';
      }).join('');
    box.innerHTML =
      '<section class="jgrid2" style="margin-top:18px">' +
      '<div class="jcard jpad"><span class="jsc jblock">Checklist</span><div id="jdeal-checks"></div></div>' +
      '<div class="jcard jpad"><span class="jsc jblock">Your deadlines</span>' +
      '<div class="jdl"><div><div>Contract signed</div><div class="jwhen">' + humanDate(D.contract) + '</div></div><span class="jdays ok">done</span></div>' +
      rows +
      '<p class="jhint">Counted from today. The calendar file adds each date with a reminder the day before.</p>' +
      '<div class="jwiz-nav" style="margin-top:10px"><button type="button" class="jbtn quiet" id="jd-ics">Add these dates to my calendar</button><button type="button" class="jwiz-skip" id="jd-edit">Edit my dates</button></div>' +
      '</div></section>' +
      '<section class="jcard jpad jdone-row" style="margin-top:18px">' +
      '<button class="jbtn" data-jmark="6">' +
      'Mark this step done</button></section>';
    renderChecklist('jdeal-checks', DEAL_CHECKS, 'dealChecks');
    var ics = document.getElementById('jd-ics');
    if (ics) ics.addEventListener('click', downloadDealIcs);
    var ed = document.getElementById('jd-edit');
    if (ed) ed.addEventListener('click', function () { _dealEditing = true; dStep = 0; renderDeal(); });
  }
  var REC_ROWS = [
    ['duty', 'Stamp duty'],
    ['legals', 'Conveyancing, title and registration'],
    ['bp', 'Building and pest'],
    ['loan', 'Loan and valuation fees']
  ];
  function settleFinalPrice() {
    if (S.settle.price) return S.settle.price;
    for (var i = 0; i < S.inspections.length; i++) {
      var r = S.inspections[i];
      if (placeSt(r) === 'won' && r.price) return r.price;
    }
    return S.budget.cap || S.numbers.price;
  }
  function renderSettle() {
    var box = document.getElementById('jreconcile');
    if (box) {
      var price = settleFinalPrice();
      var duty = buyerDutyAt(price);
      var A = S.settle.actuals;
      var legalsEst = otherCosts(price);
      var estLabel = { duty: (duty < 1 ? '$0' : m$(duty)), legals: m$(legalsEst), bp: '$400–$700', loan: '$0–$600' };
      var rows = REC_ROWS.map(function (r) {
        var k = r[0];
        var have = A[k] != null && A[k] !== '';
        return '<div class="jrec-row"><span class="k">' + r[1] + '</span>' +
          '<span class="est">' + estLabel[k] + '</span>' +
          '<span class="act"><input type="text" inputmode="decimal" data-rec="' + k + '" aria-label="' + r[1] + ', what you paid" value="' + (have ? Number(A[k]).toLocaleString('en-AU') : '') + '" placeholder="$ paid"' + (RO ? ' disabled' : '') + '></span></div>';
      }).join('');
      var estTotal = duty + legalsEst;
      var actKeys = Object.keys(A).filter(function (k) { return A[k] != null && A[k] !== ''; });
      var actTotal = actKeys.reduce(function (t, k) { return t + (parseNum(A[k]) || 0); }, 0);
      var totals = '<div class="jrec-row jrec-total"><span class="k">Total</span>' +
        '<span class="est">' + m$(estTotal) + ' + inspection and loan fees</span>' +
        '<span class="act mono-strong">' + (actKeys.length ? m$(actTotal) : 'None yet') + '</span></div>';
      // Compare like with like: only the two rows that have a dollar
      // estimate, and only once both actual figures are in.
      var verdict = '';
      if (A.duty != null && A.legals != null) {
        var diff = (A.duty + A.legals) - estTotal;
        verdict = Math.abs(diff) < 1
          ? '<p class="jrec-verdict under">Stamp duty and legal costs matched the estimate.</p>'
          : (diff > 0
            ? '<p class="jrec-verdict over">Stamp duty and legal costs came to ' + m$(diff) + ' more than the estimate.</p>'
            : '<p class="jrec-verdict under">Stamp duty and legal costs came to ' + m$(-diff) + ' less than the estimate.</p>');
      }
      box.innerHTML =
        '<div class="jrec-price"><label for="jrec-price">Final purchase price</label>' +
        '<input type="text" id="jrec-price" inputmode="decimal" value="' + Number(price).toLocaleString('en-AU') + '"' + (RO ? ' disabled' : '') + '></div>' +
        '<div class="jrec-row jrec-head"><span class="k"></span><span class="est">Estimate</span><span class="act">You paid</span></div>' +
        rows + totals + verdict +
        '<p class="jcaveat" style="margin-top:10px">The estimates are worked out at your final price: stamp duty from the same schedule as the calculators, and ' + m$(legalsEst) + ' for conveyancing and registration. Enter what you paid as the bills come in.</p>';
      var pi = document.getElementById('jrec-price');
      if (pi) pi.addEventListener('change', function () {
        var v = parseNum(pi.value);
        S.settle.price = v > 0 ? Math.round(v) : null;
        save(); renderSettle();
      });
      var ins = box.querySelectorAll('[data-rec]');
      for (var i = 0; i < ins.length; i++) ins[i].addEventListener('change', function () {
        var v = parseNum(this.value);
        S.settle.actuals[this.getAttribute('data-rec')] = this.value === '' ? null : Math.round(v);
        save(); renderSettle();
      });
    }
    renderChecklist('jsettle-checks', SETTLE_CHECKS, 'settleChecks');
  }

  // ── View switching + delegated events ────────────────────────────────
  var VIEWS = { home: 'jv-home', wizard: 'jv-wizard', projector: 'jv-projector', budget: 'jv-budget', ground: 'jv-ground', hunt: 'jv-hunt', deal: 'jv-deal', settle: 'jv-settle' };
  function refreshMarkButtons() {
    var btns = document.querySelectorAll('[data-jmark]');
    for (var i = 0; i < btns.length; i++) {
      var n = +btns[i].getAttribute('data-jmark');
      if (S.done[n]) {
        btns[i].textContent = 'Reopen this step';
        btns[i].classList.add('quiet');
      } else {
        btns[i].textContent = n === 7 ? 'Mark the journey complete' : 'Mark this step done';
        btns[i].classList.remove('quiet');
      }
    }
  }

  // opt.place: open step 2 at a saved place's price (see _placeView).
  function show(view, opt) {
    // Steps 2 to 7 are worked out from the step 1 answers. Without them the
    // page would be showing example figures as if they were the visitor's.
    if (!S.done[1] && !RO && view !== 'home' && view !== 'wizard') {
      _wizNote = 'Step 1 comes first, because the other steps use your answers. It takes about two minutes.';
      view = 'wizard';
    }
    var prev = _view;
    _view = view;
    _placeView = (view === 'projector' && opt && opt.place) || null;
    Object.keys(VIEWS).forEach(function (k) {
      var el = document.getElementById(VIEWS[k]);
      if (el) el.classList.toggle('active', k === view);
    });
    if (view === 'wizard') {
      // A first-time visitor gets every question. After that the view is
      // the list of answers, each with its own Edit.
      _wizOne = false;
      if (prev !== 'wizard') _answersBack = prev;
      if (S.done[1]) renderAnswers(false);
      else { wStep = 0; renderWizard(); }
    }
    if (view === 'projector') renderProjector();
    if (view === 'budget') renderBudget();
    if (view === 'ground') renderGround();
    if (view === 'hunt') renderHunt();
    if (view === 'deal') renderDeal();
    if (view === 'settle') renderSettle();
    if (view === 'home') renderTrail();
    refreshMarkButtons();
    try { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    // Put keyboard and screen-reader focus on the new view's heading.
    var active = document.getElementById(VIEWS[view]);
    var inner = active && (active.querySelector('#jwiz-in') || active.querySelector('#jd-in'));
    if (active && !inner) {
      var h = active.querySelector('h1, h2, h3[tabindex="-1"]');
      if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) {} }
    }
    track('journey_view', { view: view });
  }

  document.addEventListener('click', function (e) {
    if (RO && e.target.closest('[data-jmark],[data-check],[data-wopt],[data-wedit],[data-place-set],[data-insp-del],[data-bdep],[data-scen-load],[data-scen-del],#jreset-btn')) return;
    var go = e.target.closest('[data-jgoto]');
    if (go) { show(go.getAttribute('data-jgoto')); return; }
    var mk = e.target.closest('[data-jmark]');
    if (mk) {
      var mn = +mk.getAttribute('data-jmark');
      if (S.done[mn]) {
        // Redo: reopen the stop — clear done, stay on the view so they can change things.
        S.done[mn] = false; save();
        track('journey_step_redo', { step: mn });
        refreshMarkButtons();
      } else {
        requestMarkDone(mn);
      }
      return;
    }
    var chk = e.target.closest('[data-check]');
    if (chk) {
      var key = chk.getAttribute('data-checklist') || 'dealChecks';
      var i = +chk.getAttribute('data-check');
      S[key][i] = !S[key][i];
      save();
      if (key === 'dealChecks') renderDeal(); else renderSettle();
      var again = document.querySelector('[data-checklist="' + key + '"][data-check="' + i + '"]');
      if (again) { try { again.focus({ preventScroll: true }); } catch (err) {} }
      return;
    }
    var wopt = e.target.closest('[data-wopt]');
    if (wopt) {
      var q = WQ[wStep];
      var raw = wopt.getAttribute('data-wopt');
      var val = raw === 'true' ? true : raw === 'false' ? false : (/^[0-9]+$/.test(raw) ? +raw : raw);
      wSet(q, val);
      wizAdvance(q);
      return;
    }
    var wed = e.target.closest('[data-wedit]');
    if (wed) { openAnswer(wed.getAttribute('data-wedit')); return; }
    var sl = e.target.closest('[data-scen-load]');
    if (sl) {
      var si = +sl.getAttribute('data-scen-load');
      var sc = S.scenarios[si];
      if (sc) {
        _placeView = null;
        S.numbers.price = sc.numbers.price; S.numbers.saved = sc.numbers.saved;
        S.numbers.saveMo = sc.numbers.saveMo; S.numbers.state = sc.numbers.state;
        S.profile.fhb = sc.profile.fhb; S.profile.area = sc.profile.area;
        S.profile.buyers = sc.profile.buyers; S.profile.build = sc.profile.build;
        S.profile.income = sc.profile.income;
        save();
        renderProjector();
        track('journey_scenario_loaded', {});
        try { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (err) { window.scrollTo(0, 0); }
      }
      return;
    }
    var sd = e.target.closest('[data-scen-del]');
    if (sd) {
      S.scenarios.splice(+sd.getAttribute('data-scen-del'), 1);
      save();
      var jsc = document.getElementById('jscen');
      if (jsc && document.getElementById('jv-projector').classList.contains('active')) renderProjector();
      renderScenSummary();
      return;
    }
    var pr = e.target.closest('[data-prio]');
    if (pr) {
      if (RO) return;
      S.pathPriority = pr.getAttribute('data-prio');
      save();
      renderProjector();
      track('journey_priority_set', { prio: S.pathPriority });
      return;
    }
    var pp = e.target.closest('[data-place-proj]');
    if (pp) {
      var place = S.inspections[+pp.getAttribute('data-place-proj')];
      if (place && place.price >= MIN_PRICE) {
        // Step 2 at this place's price. Nothing is saved: the target price
        // only changes if the buyer then asks for that on the step 2 screen.
        show('projector', { place: { addr: place.addr, price: place.price } });
        track('journey_place_projected', {});
      }
      return;
    }
    var pf = e.target.closest('[data-place-filter]');
    if (pf) { _huntFilter = pf.getAttribute('data-place-filter'); _huntOpen = -1; renderHunt(); return; }
    var ps = e.target.closest('[data-place-status]');
    if (ps) {
      var pi = +ps.getAttribute('data-place-status');
      _huntOpen = (_huntOpen === pi ? -1 : pi);
      renderHunt();
      return;
    }
    var pset = e.target.closest('[data-place-set]');
    if (pset) {
      var parts = pset.getAttribute('data-place-set').split(':');
      var idx = +parts[0], key = parts[1];
      if (S.inspections[idx] && PLACE_LABEL[key]) {
        S.inspections[idx].st = key;
        _huntOpen = -1;
        save(); renderHunt(); renderPlacesSummary();
        track('journey_place_status', { st: key });
      }
      return;
    }
    var db = e.target.closest('[data-insp-del]');
    if (db) {
      var di = +db.getAttribute('data-insp-del');
      var gone = S.inspections[di];
      if (!gone) return;
      jModal({
        title: 'Remove this place?',
        body: gone.addr + (gone.note ? '. Note: ' + gone.note : ''),
        buttons: [
          { label: 'Keep it', cls: 'quiet' },
          { label: 'Remove', cls: 'danger', cb: function () {
              var at = S.inspections.indexOf(gone);
              if (at === -1) return;
              S.inspections.splice(at, 1);
              _huntOpen = -1;
              save(); renderHunt(); renderPlacesSummary();
            } }
        ]
      });
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList && e.target.classList.contains('jcheck')) { e.preventDefault(); e.target.click(); }
  });

  var resetBtn = document.getElementById('jreset-btn');
  if (resetBtn) resetBtn.addEventListener('click', resetJourney);

  if (isLoggedIn()) syncNote('Checking your account\u2026');
  else if (_storageBroken) syncNote('This browser isn’t letting the page save, so your progress will be lost when you close it.', true);

  // ── Share / collaborate ──────────────────────────────────────────────
  function shareUrl(token) { return location.origin + '/journey?join=' + encodeURIComponent(token); }
  function copyText(txt, btn) {
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { window.prompt('Copy this link:', txt); });
    } else { window.prompt('Copy this link:', txt); }
  }
  function renderShareCard() {
    var slot = document.getElementById('jshare-slot');
    if (!slot) return;
    if (RO || COLLAB) { slot.innerHTML = ''; return; }
    if (!isLoggedIn()) {
      if (!S.done[1]) { slot.innerHTML = ''; return; }
      slot.innerHTML = '<div class="jcard jpad jsignup"><div>' +
        '<span class="jsc jblock">Sharing</span>' +
        '<p>With a free account you can share this journey: a view-only link for family, or a partner link that lets the two of you edit it.</p></div>' +
        '<div class="jsignup-actions"><a class="jbtn quiet" href="/login?tab=signup&next=%2Fjourney">Create a free account</a></div></div>';
      return;
    }
    slot.innerHTML = '<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jblock">Share this journey</span>' +
      '<p>A follow-along link lets someone see this journey. A partner link lets a signed-in partner edit it with you, and each of you sees the other’s changes the next time you open the page or come back to it.</p>' +
      '<p class="jcaveat" style="margin-top:6px">Anyone with either link can see everything here, including your income, savings and the addresses you’ve saved. You can turn a link off at any time.</p>' +
      '<div id="jshare-live" class="jshare-live"></div></div>' +
      '<div class="jsignup-actions">' +
      '<button type="button" class="jbtn quiet" id="jshare-view">Copy follow-along link</button>' +
      '<button type="button" class="jbtn" id="jshare-edit">Copy partner link</button>' +
      '</div></div>';
    var wire = function (id, mode) {
      var b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('click', function () {
        b.disabled = true;
        api({ action: 'shareCreate', mode: mode }).then(function (r) {
          b.disabled = false;
          if (r && r.ok && r.token) {
            copyText(shareUrl(r.token), b);
            renderShareLive();
            track('journey_share_created', { mode: mode });
          } else {
            b.textContent = (r && r.error) || 'Something went wrong';
            setTimeout(function () { b.textContent = mode === 'edit' ? 'Copy partner link' : 'Copy follow-along link'; }, 2400);
          }
        });
      });
    };
    wire('jshare-view', 'view');
    wire('jshare-edit', 'edit');
    renderShareLive();
  }
  // Which links are live, each with a way to turn it off.
  function renderShareLive() {
    var box = document.getElementById('jshare-live');
    if (!box) return;
    api({ action: 'shareList' }).then(function (r) {
      box = document.getElementById('jshare-live');
      if (!box || !r || !r.ok) return;
      var bits = [];
      if (r.view) bits.push('<span>Follow-along link is on. <button type="button" class="jwiz-skip" data-share-off="view">Turn it off</button></span>');
      if (r.edit) bits.push('<span>Partner link is on. <button type="button" class="jwiz-skip" data-share-off="edit">Turn it off</button></span>');
      box.innerHTML = bits.join('');
      var offs = box.querySelectorAll('[data-share-off]');
      for (var i = 0; i < offs.length; i++) offs[i].addEventListener('click', function () {
        var mode = this.getAttribute('data-share-off');
        this.disabled = true;
        api({ action: 'shareRevoke', mode: mode }).then(function () {
          renderShareLive();
          track('journey_share_revoked', { mode: mode });
        });
      });
    });
  }

  function setModeBanner(html) {
    var slot = document.getElementById('jmode-banner');
    if (slot) slot.innerHTML = html || '';
  }
  // Leaving clears the partner's journey from this device as well. Otherwise
  // the next edit here would copy their journey into the leaver's own account.
  function leaveCollab() {
    try { localStorage.removeItem('propCalc_journey_collab'); localStorage.removeItem(KEY); } catch (e) {}
    location.href = '/journey';
  }
  function collabBanner(title) {
    setModeBanner('<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jsc-gold jblock">' + esc(title) + '</span>' +
      '<p>Your changes are saved to the shared journey. You see the other person’s changes when you open or return to this page.</p></div>' +
      '<div class="jsignup-actions"><button type="button" class="jbtn quiet" id="jcollab-leave">Leave</button></div></div>');
    var lv = document.getElementById('jcollab-leave');
    if (lv) lv.addEventListener('click', leaveCollab);
  }
  function enterReadOnly(resp) {
    RO = true;
    S = normalizeState(resp.state);
    document.body.classList.add('jro');
    setModeBanner('<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jsc-gold jblock">Following ' + esc(resp.ownerName) + '’s journey</span>' +
      '<p>This is read-only. Nothing you do here changes their journey.</p></div>' +
      '<div class="jsignup-actions"><a class="jbtn quiet" href="/journey">Start my own journey</a></div></div>');
    renderTrail();
    track('journey_share_opened', { mode: 'view' });
  }
  function stripJoinParam() { try { history.replaceState(null, '', '/journey'); } catch (e) {} }
  // Which account this device's journey belongs to, so a journey started as a
  // guest (or by someone else on this device) is never pushed over an account
  // copy without asking.
  var OWNER_KEY = 'propCalc_journey_owner';
  function sessionId() {
    try { var x = JSON.parse(localStorage.getItem('propCalc_session_v1') || 'null'); return x && x.id ? String(x.id) : ''; } catch (e) { return ''; }
  }
  function markOwned() { try { localStorage.setItem(OWNER_KEY, sessionId()); } catch (e) {} }

  function pullCollab() {
    api({ action: 'get', collab: COLLAB }).then(function (r) {
      if (r && r.ok && r.record && r.record.state) {
        adoptRemote(r.record);
        _remoteReady = true;
        collabBanner('Shared journey');
        syncNote('Saved to the shared journey.');
      } else if (r && !r.ok && /no longer active/i.test(r.error || '')) {
        leaveCollab();
      } else {
        syncNote('Couldn’t reach the shared journey. Changes you make now stay in this browser.', true);
      }
    });
  }

  // A partner invite opened in this browser before signing in. Signing in
  // can come back without the link's token: the emailed sign-in link has no
  // return address, and neither does the Sign in link in the menu. So the
  // token is kept here for a day and the invite is offered again once the
  // visitor is signed in. It is removed when the invite is accepted,
  // declined or found to be switched off. login.js reads the same key.
  var PENDING_JOIN_KEY = 'propCalc_journey_pendingJoin';
  var JOIN_TOKEN_RE = /^[A-Za-z0-9_-]{6,64}$/;
  function rememberJoin(tok) {
    if (!JOIN_TOKEN_RE.test(tok)) return;
    try { localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ t: tok, at: Date.now() })); } catch (e) {}
  }
  function forgetJoin() { try { localStorage.removeItem(PENDING_JOIN_KEY); } catch (e) {} }
  function pendingJoin() {
    try {
      var p = JSON.parse(localStorage.getItem(PENDING_JOIN_KEY) || 'null');
      if (!p) return null;
      var age = Date.now() - p.at;
      if (typeof p.t === 'string' && JOIN_TOKEN_RE.test(p.t) && age >= 0 && age < 86400000) return p.t;
      forgetJoin();
    } catch (e) {}
    return null;
  }

  // The signed-in visitor's own boot: the shared journey they are already
  // on, or else their account's journey.
  function bootMine() {
    if (!isLoggedIn()) return;
    if (COLLAB) pullCollab(); else bootOwn();
  }

  function bootRemote() {
    var joinTok = null, fromLink = false;
    try { joinTok = new URLSearchParams(location.search).get('join'); } catch (e) {}
    if (joinTok) fromLink = true;
    else if (isLoggedIn()) joinTok = pendingJoin();

    // Already working on this shared journey: no need to ask again.
    if (joinTok && COLLAB === joinTok && isLoggedIn()) { stripJoinParam(); forgetJoin(); joinTok = null; }

    if (joinTok) {
      api({ action: 'shareResolve', token: joinTok }).then(function (r) {
        if (!r || !r.ok || !r.state) {
          if (r && r.gone) {
            // The server says this link is switched off, or never existed.
            // A remembered invite resolved when it was remembered, so for
            // that one the address can't be the cause.
            forgetJoin();
            setModeBanner('<div class="jcard jpad jsignup"><div>' +
              (fromLink
                ? '<span class="jsc jsc-gold jblock">This link no longer works</span>' +
                  '<p>The person who shared it has turned it off, or the address is incomplete. Ask them for a new link. The journey below is your own.</p>'
                : '<span class="jsc jsc-gold jblock">The partner link no longer works</span>' +
                  '<p>The link you opened earlier to join someone’s journey has been turned off. Ask them for a new link. The journey below is your own.</p>') +
              '</div></div>');
            stripJoinParam();
          } else if (fromLink) {
            // The link couldn't be checked (no connection, or the server
            // failed), so it may be fine. The address keeps its token and a
            // reload tries again. A remembered invite is kept the same way,
            // and nothing is said about it.
            setModeBanner('<div class="jcard jpad jsignup"><div>' +
              '<span class="jsc jsc-gold jblock">I couldn’t open this shared journey</span>' +
              '<p>The link couldn’t be checked, which usually means there’s no connection. Reload the page to try again. The journey below is your own.</p></div></div>');
          }
          bootMine();
          return;
        }
        if (r.mode === 'view') {
          if (!fromLink) { forgetJoin(); bootMine(); return; } // only a partner link is ever remembered
          enterReadOnly(r);
          return;
        }
        // edit link
        if (!isLoggedIn()) {
          rememberJoin(joinTok);
          enterReadOnly(r);
          setModeBanner('<div class="jcard jpad jsignup"><div>' +
            '<span class="jsc jsc-gold jblock">' + esc(r.ownerName) + ' invited you to their journey</span>' +
            '<p>Sign in and you can both edit the same journey. Until then it’s read-only.</p></div>' +
            '<div class="jsignup-actions"><a class="jbtn" href="/login?tab=signup&next=' + encodeURIComponent('/journey?join=' + joinTok) + '">Sign in to join</a></div></div>');
          return;
        }
        if (r.mine) {
          // The signed-in visitor opened their own partner link.
          forgetJoin(); stripJoinParam();
          setModeBanner('<div class="jcard jpad jsignup"><div>' +
            '<span class="jsc jsc-gold jblock">This is your own partner link</span>' +
            '<p>You’re already on this journey. Send the link to the person you want to share it with.</p></div></div>');
          bootMine();
          return;
        }
        var decline = function () { forgetJoin(); stripJoinParam(); bootMine(); };
        jModal({
          title: 'Join ' + r.ownerName + '’s journey?',
          body: 'You’ll both edit the same journey, and each of you sees the other’s changes when you open the page or come back to it. Their journey replaces the one in this browser. The one in your own account is kept and comes back when you leave.',
          onDismiss: decline,
          buttons: [
            { label: 'Not now', cls: 'quiet', cb: decline },
            { label: 'Join their journey', cb: function () {
                COLLAB = joinTok;
                try { localStorage.setItem('propCalc_journey_collab', joinTok); } catch (e) {}
                RO = false;
                forgetJoin();
                stripJoinParam();
                adoptRemote({ state: r.state, updatedAt: r.updatedAt || 0 });
                _remoteReady = true;
                collabBanner('On ' + r.ownerName + '’s journey');
                syncNote('Saved to the shared journey.');
                track('journey_collab_joined', {});
              } }
          ]
        });
      });
      return;
    }

    bootMine();
  }

  // Reconcile this device with the signed-in account's own journey.
  function bootOwn() {
    api({ action: 'get' }).then(function (r) {
      if (!r || !r.ok) {
        syncNote(r && r.error && r.error !== 'network'
          ? 'Not connected to your account: ' + r.error + '. Changes you make now stay in this browser.'
          : 'Couldn’t reach your account. Changes you make now stay in this browser.', true);
        return;
      }
      var rec = r.record && r.record.state ? r.record : null;
      var localStarted = !!S.done[1];
      var mine = sessionId() && (function () { try { return localStorage.getItem(OWNER_KEY) === sessionId(); } catch (e) { return false; } })();
      if (!rec) {
        // Nothing in the account yet: this device's journey becomes it.
        _remoteReady = true; markOwned();
        if (localStarted) scheduleSync();
        syncNote('Saved to your account.');
        return;
      }
      if (!localStarted) {
        // Nothing worth keeping here: take the account copy.
        adoptRemote(rec); _remoteReady = true; markOwned();
        syncNote('Saved to your account.');
        return;
      }
      if (mine) {
        // Same account on both sides: the newer copy wins, as before.
        if ((rec.updatedAt || 0) > (S.updatedAt || 0)) adoptRemote(rec);
        else { _base = rec.updatedAt || 0; }
        _remoteReady = true;
        if (!((rec.updatedAt || 0) > (S.updatedAt || 0))) scheduleSync();
        syncNote('Saved to your account.');
        return;
      }
      // This device holds a journey that was never linked to this account
      // (started as a guest, or by someone else). Ask which one to keep.
      jModal({
        title: 'Which journey do you want to keep?',
        body: 'Your account already has a saved journey, and this browser has a different one that was started without signing in. Keeping one replaces the other.',
        buttons: [
          { label: 'Keep the one in this browser', cls: 'quiet', cb: function () { _base = rec.updatedAt || 0; _remoteReady = true; markOwned(); save(); } },
          { label: 'Use the one in my account', cb: function () { adoptRemote(rec); _remoteReady = true; markOwned(); syncNote('Saved to your account.'); } }
        ]
      });
    });
  }

  // Coming back to the tab: pick up a partner's (or another device's) changes,
  // unless there is an unsent change here.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || RO || !_remoteReady || _syncT || !isLoggedIn()) return;
    var p = { action: 'get' };
    if (COLLAB) p.collab = COLLAB;
    api(p).then(function (r) {
      if (r && r.ok && r.record && r.record.state && (r.record.updatedAt || 0) > _base && !_syncT) adoptRemote(r.record);
    });
  });

  // ── Deep link from suburb/tool pages: /journey?near=Glenelg&st=sa ────
  // Pre-seeds the wizard's suburb + state for a FRESH visitor only — an
  // existing journey (wizard done, or an anchor already set) is never
  // touched, and share/collab links (?join=) take precedence.
  function bootDeepLink() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.get('join')) return;
    var near = (q.get('near') || '').trim().slice(0, 60);
    var st = (q.get('st') || '').trim().toLowerCase();
    if (!near && !st) return;
    var fresh = !S.done[1] && !(S.profile.anchor || '').trim();
    if (fresh) {
      if (near) S.profile.anchor = near;
      if (st && ST_LIST.indexOf(st) !== -1) S.numbers.state = st;
      save();
      track('journey_deeplink', { st: st || '(none)' });
    }
    try { history.replaceState(null, '', '/journey'); } catch (e) {}
  }

  bootDeepLink();
  renderTrail();
  bootRemote();
  track('journey_view', { view: 'home' });
})();

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
      profile: { stage: null, area: 'capital', buyers: 'single', fhb: true, build: 'established', income: null, timeframe: '12mo', dependants: 0, employment: 'payg', rentNow: 0, cardLimits: 0 },
      dealChecks: [false, false, false, false, false],
      settleChecks: [false, false, false, false, false],
      inspections: [],
      scenarios: [],
      budget: { depositPct: null, cap: null },
      deal: { signed: false, dates: {} },
      signupDismissed: false,
      updatedAt: 0
    };
  }
  // Every state that enters this page — localStorage, the account copy from
  // the server, or a shared/collab journey — must pass through here. Older
  // clients persisted states without newer fields; renderers assume them.
  function normalizeState(s) {
    var b = blank();
    s.done = s.done || {};
    s.numbers = s.numbers || b.numbers;
    for (var nk in b.numbers) if (!(nk in s.numbers)) s.numbers[nk] = b.numbers[nk];
    s.profile = s.profile || b.profile;
    for (var pk in b.profile) if (!(pk in s.profile)) s.profile[pk] = b.profile[pk];
    s.dealChecks = s.dealChecks || b.dealChecks;
    s.settleChecks = s.settleChecks || b.settleChecks;
    s.inspections = s.inspections || [];
    s.inspections.forEach(function (r) {
      if (!r.st) r.st = ['inspected', 'shortlist', 'passed'][r.v] || 'inspected';
    });
    s.scenarios = s.scenarios || [];
    s.budget = s.budget || b.budget;
    s.deal = s.deal || b.deal;
    s.deal.dates = s.deal.dates || {};
    // transient UI flags must never persist/sync — they re-open wizards on reload
    delete s.budget.editing;
    delete s.deal.editing;
    if (typeof s.signupDismissed !== 'boolean') s.signupDismissed = false;
    return s;
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) return normalizeState(s);
    } catch (e) {}
    return blank();
  }
  var RO = false;           // read-only: viewing someone else's shared journey
  var COLLAB = null;        // edit-mode share token — writes go to the owner's record
  try { COLLAB = localStorage.getItem('propCalc_journey_collab') || null; } catch (e) {}
  function save() {
    if (RO) return;
    S.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    scheduleSync();
  }
  var S = load();

  // ── Account sync + sharing (netlify/functions/journey.js) ───────────
  function api(payload) {
    return fetch('/.netlify/functions/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'network' }; });
  }
  var _syncT = null;
  function scheduleSync() {
    if (RO || !isLoggedIn()) return;
    if (_syncT) clearTimeout(_syncT);
    _syncT = setTimeout(function () {
      var p = { action: 'sync', state: S };
      if (COLLAB) p.collab = COLLAB;
      api(p).then(function (r) {
        if (r && r.ok) {
          var st = document.getElementById('jsaved-text');
          if (st) st.textContent = COLLAB ? 'Synced to the shared journey.' : 'Synced to your account.';
        }
      });
    }, 1500);
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
    { n: 1, icon: 'compass', title: 'Get your bearings', view: 'wizard', cta: 'Start — about 2 minutes', blurb: 'Quick questions about you, your money and your target — every answer powers a real number later.', milestone: 'You know your numbers.' },
    { n: 2, icon: 'signpost', title: 'Find your path', view: 'projector', cta: 'Compare my scheme paths', blurb: 'Which government scheme gets you in sooner — and what each really costs. Side by side, for your exact situation.', milestone: 'You know your path.' },
    { n: 3, icon: 'wallet', title: 'Set your real budget', view: 'budget', cta: 'Set my walk-away number', blurb: 'Every upfront cost — including the solicitor — an honest income check, and one committed walk-away number.', milestone: 'You have a real budget.' },
    { n: 4, icon: 'pin', title: 'Pick your ground', view: 'ground', cta: 'Work out where', blurb: 'The price band your budget really buys, and how to shortlist suburbs around the life you already have.', milestone: 'You know where.' },
    { n: 5, icon: 'search', title: 'Hunt & compare', view: 'hunt', cta: 'Open my places library', blurb: 'Every place you browse, inspect or bid on — one honest library, compared against your cap.', milestone: 'You found it.' },
    { n: 6, icon: 'pen', title: 'Seal the deal', view: 'deal', cta: 'Track my deadlines', blurb: 'Contract signed — now every deadline matters. Enter the dates from your contract; we keep count on every one.', milestone: 'Contract signed.' },
    { n: 7, icon: 'key', title: 'Settle & move in', view: 'settle', cta: 'The final stretch', blurb: 'Settlement day checklist and the last dollars — then the keys are yours.', milestone: 'Keys in hand.' }
  ];

  // Real-world stage → the stop that matches it. Buyers can enter mid-journey;
  // earlier stops stay open ("catch up any time") rather than blocking.
  var STAGE_STOP = { start: 2, schemes: 2, budget: 3, ground: 4, hunt: 5, deal: 6 };
  var STAGE_LABEL = { start: 'Early days', schemes: 'Saving & researching', budget: 'Working out borrowing', ground: 'Deciding where', hunt: 'Inspecting homes', deal: 'Contract signed' };
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
    ov.hidden = false;
    ov.style.display = 'grid';
    var first = btns.querySelector('.jbtn:not(.quiet):not(.danger)') || btns.firstChild;
    if (first) first.focus();
  }
  function closeModal() { var ov = document.getElementById('jmodal'); if (ov) { ov.hidden = true; ov.style.display = 'none'; } }
  document.addEventListener('click', function (e) {
    var ov = document.getElementById('jmodal');
    if (ov && !ov.hidden && e.target === ov) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  function stopByN(n) { for (var i = 0; i < STOPS.length; i++) if (STOPS[i].n === n) return STOPS[i]; return null; }

  // Confirm → mark → celebrate. Milestones are a big deal now.
  function requestMarkDone(n) {
    var stop = stopByN(n);
    jModal({
      kicker: 'Milestone ahead',
      title: stop.milestone,
      body: 'Marking “' + stop.title + '” done tells the journey you’re ready for the next stop. You can always come back and redo it.',
      icon: IC.flag,
      buttons: [
        { label: 'Not yet', cls: 'quiet' },
        { label: 'Yes — mark it done', cb: function () { markDone(n); } }
      ]
    });
  }
  function markDone(n) {
    S.done[n] = true;
    save();
    track('journey_step_done', { step: n });
    var stop = stopByN(n);
    var doneCount = 0; STOPS.forEach(function (s) { if (S.done[s.n]) doneCount++; });
    var next = null;
    for (var i = 0; i < STOPS.length; i++) if (!S.done[STOPS[i].n]) { next = STOPS[i]; break; }
    jModal({
      kicker: 'Milestone reached — stop ' + n + ' of 7',
      title: stop.milestone,
      body: doneCount >= 7
        ? 'That’s the whole journey. Keys in hand — congratulations.'
        : (next ? 'Next stop: ' + next.title + '. ' + next.blurb : ''),
      icon: IC.check,
      iconCls: 'sage',
      buttons: doneCount >= 7
        ? [{ label: 'Back to the journey', cb: function () { show('home'); } }]
        : [
            { label: 'Back to the journey', cls: 'quiet', cb: function () { show('home'); } },
            { label: 'Continue → ' + (next ? next.title : ''), cb: function () { show(next.view); } }
          ]
    });
  }

  function resetJourney() {
    jModal({
      title: 'Start the whole journey over?',
      body: 'This erases everything on this device — your answers, milestones, inspections and checklists. It can’t be undone.',
      buttons: [
        { label: 'Keep my journey', cls: 'quiet' },
        { label: 'Erase and start over', cls: 'danger', cb: function () {
            S = blank(); save();
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
    if (lbl) lbl.textContent = doneCount >= 7 ? 'Journey complete' : 'Stop ' + cur + ' of 7';
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
      var stateLbl = S.done[s.n] ? '<span class="jstate done-t jsc">Done — open to revisit</span>'
        : (s.n === cur ? '<span class="jstate here jsc">You are here</span>'
          : '<span class="jstate jsc">' + (s.n === 7 ? 'The finish' : (s.n < cur ? 'Open — catch up any time' : 'Ahead')) + '</span>');
      var isCurrent = s.n === cur && !S.done[s.n];
      var inner = stateLbl + '<h2>' + esc(s.title) + '</h2>';
      if (isCurrent) {
        inner += '<div class="jbody">' + esc(s.blurb) + '</div>' +
          '<div class="jcta-row"><span class="jbtn">' + esc(s.cta) + '</span></div>' +
          '<div class="jmilestone">' + IC.flag + ' Milestone: ' + esc(s.milestone) + '</div>';
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

  // ── Guest demo → signup moment ───────────────────────────────────────
  function renderSignupCard() {
    var slot = document.getElementById('jsignup-slot');
    if (!slot) return;
    var doneCount = 0; STOPS.forEach(function (s) { if (S.done[s.n]) doneCount++; });
    var shouldShow = !isLoggedIn() && !S.signupDismissed && doneCount >= 2; // after the first real milestone beyond the wizard
    if (!shouldShow) { slot.innerHTML = ''; return; }
    slot.innerHTML = '<div class="jcard jpad jsignup">' +
      '<div>' +
      '<span class="jsc jsc-gold jblock">Keep your journey</span>' +
      '<p>Everything here works without an account — but your progress lives only in this browser, and we can’t get it back if it’s cleared. A free account keeps your journey on any device.</p>' +
      '</div>' +
      '<div class="jsignup-actions">' +
      '<a class="jbtn" href="/login?tab=signup&next=%2Fjourney">Create a free account</a>' +
      '<button type="button" class="jwiz-skip" id="jsignup-dismiss">Maybe later</button>' +
      '</div></div>';
    var d = document.getElementById('jsignup-dismiss');
    if (d) d.addEventListener('click', function () { S.signupDismissed = true; save(); renderSignupCard(); });
    track('signup_prompt_shown', { surface: 'journey' });
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
    if (!P.fhb) return calcDuty(st, v);
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

  var RATE = 6.0, TERM = 360, OTHER_COSTS = 3500; // conveyancing + registration estimate
  var TF_MONTHS = { asap: 3, '6mo': 6, '12mo': 12, '2yr': 24 };
  function pay(P) { var r = RATE / 100 / 12; return P * r / (1 - Math.pow(1 + r, -TERM)); }
  function lmiRate(lvr) { return lvr <= 0.80 ? 0 : lvr <= 0.85 ? 0.008 : lvr <= 0.90 ? 0.019 : lvr <= 0.95 ? 0.034 : 0.043; }
  function m$(v) { return '$' + Math.round(v).toLocaleString('en-AU'); }
  function parseNum(s) { var n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; }

  // ── Stop 1 wizard (nine questions, one at a time) ────────────────────
  var WQ = [
    { id: 'stage', kind: 'chips', cols: 2, q: 'Where are you in your home-buying journey?', help: 'Everyone starts in a different place. Pick the closest match and we’ll take you straight to the part that helps today — you can go back over the earlier steps any time.', opts: [['start', 'Wondering if I can afford it'], ['schemes', 'Saving up and researching'], ['budget', 'Working out what I can borrow'], ['ground', 'Deciding where to buy'], ['hunt', 'Out inspecting homes'], ['deal', 'I’ve signed a contract']], store: 'profile' },
    { id: 'state', kind: 'chips', q: 'Where are you looking to buy?', help: 'Stamp duty, concessions and schemes all change at the border.', opts: [['qld', 'QLD'], ['nsw', 'NSW'], ['vic', 'VIC'], ['sa', 'SA'], ['wa', 'WA'], ['tas', 'TAS'], ['act', 'ACT'], ['nt', 'NT']], store: 'numbers' },
    { id: 'area', kind: 'chips', q: 'Capital city, or regional?', help: 'The government schemes use different price caps for capitals and the rest of the state.', opts: [['capital', 'Capital city'], ['regional', 'Regional']], store: 'profile' },
    { id: 'buyers', kind: 'chips', q: 'Buying alone or together?', help: 'Income caps for shared-equity schemes are different for joint applicants.', opts: [['single', 'Just me'], ['couple', 'Two of us']], store: 'profile' },
    { id: 'fhb', kind: 'chips', q: 'Is this your first home?', help: 'First home buyers get stamp duty concessions and access to the federal schemes.', opts: [[true, 'Yes, first home'], [false, 'Owned before']], store: 'profile' },
    { id: 'build', kind: 'chips', q: 'Established home, or a new build?', help: 'Some concessions and equity schemes are more generous for new builds.', opts: [['established', 'Established'], ['new', 'New build'], ['unsure', 'Not sure yet']], store: 'profile' },
    { id: 'income', kind: 'money', q: 'Household income, before tax?', help: 'Yearly, combined if you’re buying together. Used only to check scheme eligibility and give you an honest affordability guide.', def: 95000, min: 0, store: 'profile' },
    { id: 'price', kind: 'money', q: 'What price are you aiming for?', help: 'A rough target is fine — you can change it any time.', def: 650000, min: 50000, store: 'numbers' },
    { id: 'saved', kind: 'money', q: 'How much have you saved so far?', help: 'Deposit savings only — don’t count your emergency buffer.', def: 60000, min: 0, store: 'numbers' },
    { id: 'saveMo', kind: 'money', q: 'How much can you put away each month?', help: 'Be honest rather than hopeful — the projections use this.', def: 2000, min: 0, store: 'numbers' },
    { id: 'rentNow', kind: 'money', q: 'What do you pay in rent or board each month?', help: 'Zero is fine. We use it to show how a mortgage compares to what you already pay.', def: 0, min: 0, store: 'profile' },
    { id: 'cardLimits', kind: 'money', q: 'Total limit across your credit cards?', help: 'The limit, not the balance — lenders assess the whole limit even at $0 owing. Zero if you have none.', def: 0, min: 0, store: 'profile' },
    { id: 'employment', kind: 'chips', q: 'How do you earn your income?', help: 'Lenders treat salaried, self-employed and casual income differently.', opts: [['payg', 'Salaried (PAYG)'], ['self', 'Self-employed'], ['casual', 'Casual / contract']], store: 'profile' },
    { id: 'dependants', kind: 'chips', q: 'Any dependants?', help: 'Kids and dependants change what lenders assume you spend.', opts: [[0, 'None'], [1, '1'], [2, '2'], [3, '3 or more']], store: 'profile' },
    { id: 'timeframe', kind: 'chips', q: 'When do you want to be in?', help: 'We’ll flag which paths actually fit your timeframe.', opts: [['asap', 'As soon as possible'], ['6mo', 'Within 6 months'], ['12mo', 'Within a year'], ['2yr', '1–2 years plus']], store: 'profile' }
  ];
  var wStep = 0;

  function wVal(q) { return q.store === 'profile' ? S.profile[q.id] : S.numbers[q.id]; }
  function wSet(q, v) {
    if (RO) return; if (q.store === 'profile') S.profile[q.id] = v; else S.numbers[q.id] = v; save(); }

  function renderWizard() {
    var box = document.getElementById('jwizard');
    if (!box) return;
    if (wStep >= WQ.length) { renderWizardDone(); return; }
    var q = WQ[wStep];
    var dots = WQ.map(function (_, i) { return '<span class="jwiz-dot' + (i <= wStep ? ' on' : '') + '"></span>'; }).join('');
    var body;
    if (q.kind === 'chips') {
      var cols = q.cols || (q.opts.length > 4 ? 4 : q.opts.length);
      body = '<div class="jwiz-states' + (cols === 2 && q.opts.length > 2 ? ' cols2' : '') + '" style="grid-template-columns:repeat(' + cols + ',1fr)">' + q.opts.map(function (o) {
        var sel = String(wVal(q)) === String(o[0]);
        return '<button type="button" class="jwiz-state' + (sel ? ' sel' : '') + '" data-wopt="' + esc(String(o[0])) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    } else {
      var val = wVal(q) != null ? wVal(q) : q.def;
      body = '<div class="jwiz-input-row"><span class="jwiz-cur">$</span>' +
        '<input class="jwiz-input" id="jwiz-in" type="text" inputmode="decimal" value="' + Number(val).toLocaleString('en-AU') + '" aria-label="' + esc(q.q) + '"></div>';
    }
    box.innerHTML = '<div class="jwiz-card">' +
      '<div class="jwiz-dots">' + dots + '</div>' +
      '<div class="jwiz-q">' + esc(q.q) + '</div>' +
      '<p class="jwiz-help">' + esc(q.help) + '</p>' + body +
      '<div class="jwiz-nav">' +
      (wStep > 0 ? '<button type="button" class="jwiz-skip" id="jwiz-back">← Back</button>' : '<span></span>') +
      (q.kind === 'chips' ? '<span class="jmins">tap one</span>' : '<button type="button" class="jbtn" id="jwiz-next">Next</button>') +
      '</div></div>';
    var input = document.getElementById('jwiz-in');
    if (input) {
      input.focus();
      try { input.setSelectionRange(0, input.value.length); } catch (e) {}
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); wizardNext(); } });
    }
    var nb = document.getElementById('jwiz-next');
    if (nb) nb.addEventListener('click', wizardNext);
    var bb = document.getElementById('jwiz-back');
    if (bb) bb.addEventListener('click', function () { wStep = Math.max(0, wStep - 1); renderWizard(); });
    track('journey_wizard_step', { step: wStep });
  }

  function wizardNext() {
    var q = WQ[wStep];
    if (q.kind === 'money') {
      var input = document.getElementById('jwiz-in');
      var n = parseNum(input ? input.value : '');
      if (!(n >= q.min)) {
        if (input) { input.focus(); input.style.borderBottomColor = 'var(--terracotta)'; setTimeout(function () { input.style.borderBottomColor = ''; }, 1200); }
        return;
      }
      wSet(q, Math.round(n));
    }
    wStep++;
    renderWizard();
  }

  function renderWizardDone() {
    S.done[1] = true;
    if (S.numbers.saveMo < 1) S.numbers.saveMo = 1;
    if (S.profile.stage === 'deal' && !S.deal.signed) S.deal.signed = true;
    save();
    track('journey_wizard_done', { stage: S.profile.stage || 'unset' });
    var box = document.getElementById('jwizard');
    var N = S.numbers, P = S.profile;
    box.innerHTML = '<div class="jwiz-card">' +
      '<div class="jwiz-done-icon">' + IC.check + '</div>' +
      '<div class="jwiz-q">That’s your bearings.</div>' +
      '<p class="jwiz-help">First milestone reached — you know your numbers. Next comes the one most buyers never find out: which scheme path suits <em>your</em> situation.</p>' +
      '<div class="jwiz-summary">' +
      (STAGE_LABEL[P.stage] ? '<span class="chip">' + STAGE_LABEL[P.stage] + '</span>' : '') +
      '<span class="chip"><b>' + N.state.toUpperCase() + '</b> ' + (P.area === 'capital' ? 'capital' : 'regional') + '</span>' +
      '<span class="chip">' + (P.buyers === 'couple' ? 'Buying together' : 'Buying solo') + '</span>' +
      '<span class="chip">' + (P.fhb ? 'First home' : 'Owned before') + '</span>' +
      '<span class="chip">' + (P.build === 'new' ? 'New build' : P.build === 'unsure' ? 'Build: not sure' : 'Established') + '</span>' +
      '<span class="chip">Income <b>' + m$(P.income || 0) + '</b></span>' +
      '<span class="chip">Target <b>' + m$(N.price) + '</b></span>' +
      '<span class="chip">Saved <b>' + m$(N.saved) + '</b></span>' +
      '<span class="chip">Saving <b>' + m$(N.saveMo) + '/mo</b></span>' +
      (P.rentNow ? '<span class="chip">Rent now <b>' + m$(P.rentNow) + '/mo</b></span>' : '') +
      (P.cardLimits ? '<span class="chip">Card limits <b>' + m$(P.cardLimits) + '</b></span>' : '') +
      '<span class="chip">' + (P.employment === 'self' ? 'Self-employed' : P.employment === 'casual' ? 'Casual / contract' : 'Salaried') + '</span>' +
      (P.dependants ? '<span class="chip">' + P.dependants + (P.dependants >= 3 ? '+' : '') + ' dependant' + (P.dependants > 1 ? 's' : '') + '</span>' : '') +
      '<span class="chip">' + ({ asap: 'Buying ASAP', '6mo': 'Within 6 months', '12mo': 'Within a year', '2yr': '1–2 years+' })[P.timeframe] + '</span>' +
      '</div>' +
      '<div class="jwiz-nav" style="margin-top:22px">' +
      '<button type="button" class="jwiz-skip" data-jgoto="wizard">↺ Redo my answers</button>' +
      (STAGE_STOP[P.stage] > 2
        ? '<button type="button" class="jbtn" data-jgoto="' + stopByN(STAGE_STOP[P.stage]).view + '">Jump to where you are: ' + esc(stopByN(STAGE_STOP[P.stage]).title) + ' →</button>'
        : '<button type="button" class="jbtn" data-jgoto="projector">Next stop: find your path →</button>') +
      '</div></div>';
  }

  // ── Stop 2: Scheme Pathway Projector v2 ──────────────────────────────
  function schemeCaps(table) {
    var caps = table[S.numbers.state] || [0, 0];
    return S.profile.area === 'capital' ? caps[0] : caps[1];
  }

  function computePaths() {
    var N = S.numbers, P = S.profile;
    var price = N.price, saved = N.saved, saveMo = Math.max(1, N.saveMo);
    var duty = buyerDuty();
    var mUntil = function (need) { return Math.max(0, Math.ceil((need - saved) / saveMo)); };
    var buyBy = function (mo) {
      if (mo <= 0) return 'Ready now';
      var d = new Date(); d.setMonth(d.getMonth() + mo);
      return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    };
    var out = [];
    function add(name, why, dep, lmi, govShare, tags) {
      var need = dep + duty + OTHER_COSTS;
      var mo = mUntil(need);
      var loan = price - dep - (govShare || 0) + (lmi || 0);
      out.push({
        name: name, why: why, mo: mo, buyBy: buyBy(mo), need: need,
        lmi: lmi || 0, loan: loan, rep: pay(loan),
        equity: tags && tags.equity, warn: (tags && tags.warn) || null,
        eligible: !(tags && tags.warn)
      });
    }
    add('Save to 20%', 'The classic path — no LMI, smallest loan, longest wait.', price * 0.20, 0);
    var dep10 = price * 0.10, base10 = price - dep10;
    add('10% deposit + LMI', 'Buy sooner without a scheme place — LMI is added to the loan.', dep10, base10 * lmiRate(base10 / price));
    if (P.fhb) {
      var fdsCap = schemeCaps(FDS_CAPS);
      add('5% Deposit Scheme', '5% deposit, the government guarantees the rest — no LMI, no income cap.',
        price * 0.05, 0, 0,
        price > fdsCap ? { warn: 'Above the ' + m$(fdsCap) + ' price cap for your area' } : null);
      var h2bCap = schemeCaps(H2B_CAPS);
      var incCap = H2B_INCOME[P.buyers];
      var eq = H2B_EQUITY[P.build] || 0.30;
      var h2bWarn = null;
      if (price > h2bCap) h2bWarn = 'Above the ' + m$(h2bCap) + ' price cap for your area';
      else if (P.income != null && P.income > incCap) h2bWarn = 'Income above the ' + m$(incCap) + ' cap for ' + (P.buyers === 'couple' ? 'joint applicants' : 'single applicants');
      add('Help to Buy', 'Federal shared equity — the government takes up to ' + Math.round(eq * 100) + '% (' + (P.build === 'new' ? 'new build' : 'established') + '), you start from a 2% deposit.',
        price * 0.02, 0, price * eq,
        h2bWarn ? { warn: h2bWarn } : { equity: 'Gov up to ' + Math.round(eq * 100) + '%' });
    }
    var eligible = out.filter(function (p) { return p.eligible; });
    var pool = eligible.length ? eligible : out;
    var best = pool.slice().sort(function (a, b) { return a.mo - b.mo || a.lmi - b.lmi || a.rep - b.rep; })[0];
    out.forEach(function (p) { p.best = (p === best); });
    return { paths: out, duty: duty, best: best };
  }

  function renderProjector() {
    var N = S.numbers, P = S.profile;
    var chips = document.getElementById('jctx-chips');
    if (chips) {
      chips.innerHTML =
        '<span class="chip"><b>' + N.state.toUpperCase() + '</b> ' + (P.area === 'capital' ? 'capital' : 'regional') + '</span>' +
        '<span class="chip">' + (P.fhb ? 'First home buyer' : 'Not a first home') + '</span>' +
        '<span class="chip">Target <b>' + m$(N.price) + '</b></span>' +
        '<span class="chip">Saved <b>' + m$(N.saved) + '</b></span>' +
        '<span class="chip">Saving <b>' + m$(N.saveMo) + '/mo</b></span>' +
        '<button type="button" class="jwiz-skip" data-jgoto="wizard" style="align-self:center">Edit my answers</button>';
    }

    var R = computePaths();
    var title = document.getElementById('jproj-title');
    if (title) title.textContent = R.paths.length + ' ways to buy your ' + m$(N.price) + ' first home';

    var note = document.getElementById('jduty-note');
    if (note) {
      var dutyLabel = P.fhb ? 'first-home-buyer stamp duty' : 'stamp duty';
      note.innerHTML = R.duty < 1
        ? 'Estimated ' + dutyLabel + ' in ' + N.state.toUpperCase() + ' at this price' + (P.fhb && P.build === 'new' && (N.state === 'sa' || N.state === 'qld') ? ' (new build)' : '') + ': <b>$0</b> — included in every path below.'
        : 'Estimated ' + dutyLabel + ' in ' + N.state.toUpperCase() + ' at this price: <b>' + m$(R.duty) + '</b> — included in the cash needed for every path.';
    }

    var paths = document.getElementById('jpaths');
    if (paths) paths.innerHTML = R.paths.map(function (p) {
      return '<div class="jpath' + (p.best ? ' best' : '') + (p.warn ? ' inelig' : '') + '">' +
        (p.best ? '<span class="jflag jsc">Strongest for you</span>' : '') +
        '<h3>' + esc(p.name) + '</h3><div class="jwhy">' + esc(p.why) + '</div>' +
        '<span class="jsc">You could buy</span>' +
        '<div class="jbuyby' + (p.mo <= 0 ? ' now' : '') + '">' + p.buyBy + '</div>' +
        '<div class="jstat"><span class="k">Cash needed</span><span class="v">' + m$(p.need) + '</span></div>' +
        '<div class="jstat"><span class="k">Lenders mortgage insurance</span><span class="v ' + (p.lmi ? 'warn' : 'good') + '">' + (p.lmi ? m$(p.lmi) : '$0') + '</span></div>' +
        '<div class="jstat"><span class="k">Loan</span><span class="v">' + m$(p.loan) + '</span></div>' +
        '<div class="jstat"><span class="k">Repayment</span><span class="v">' + m$(p.rep) + '/mo</span></div>' +
        (p.equity ? '<div class="jstat"><span class="k">Equity share</span><span class="v warn">' + esc(p.equity) + '</span></div>' : '') +
        (p.warn ? '<div class="jelig">' + esc(p.warn) + ' — shown for comparison.</div>' : '') +
        '</div>';
    }).join('');

    // Time-axis timeline: each path is a dot at its buy-ready month, not a bar
    var maxMo = Math.max.apply(null, R.paths.map(function (p) { return p.mo; }).concat([6]));
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
            '<span class="jtl-rail"><span class="' + cls + '" style="left:' + pos(p.mo).toFixed(1) + '%"></span></span>' +
            '<span class="jtl-date' + (p.mo <= 0 ? ' now' : '') + '">' + (p.mo <= 0 ? 'Ready now' : p.buyBy) + '</span></div>';
        }).join('');
    }

    var read = document.getElementById('jread');
    if (read) {
      var b = R.best;
      var alt = R.paths.filter(function (p) { return !p.best && p.eligible; }).sort(function (a, b2) { return a.mo - b2.mo; })[0];
      var txt = '<span class="jsc">Our read</span><strong>' + esc(b.name) + ' looks strongest for you.</strong> ';
      if (b.mo <= 0) txt += 'Your savings already cover the cash this path needs — you could start now';
      else txt += 'You could be ready in about ' + b.mo + ' months (' + b.buyBy + ')';
      if (alt) txt += (b.mo <= 0 ? ',' : ' —') + ' versus ' + (alt.mo <= 0 ? 'now' : 'about ' + alt.mo + ' months') + ' on “' + esc(alt.name) + '”. ';
      else txt += '. ';
      txt += b.lmi ? 'It does carry ' + m$(b.lmi) + ' of LMI.' : 'It pays no lenders mortgage insurance.';
      var goal = TF_MONTHS[P.timeframe];
      if (goal) {
        var tfLabel = { asap: 'as soon as possible', '6mo': 'within 6 months', '12mo': 'within a year', '2yr': 'in 1–2 years' }[P.timeframe];
        if (b.mo <= goal) txt += ' That fits your goal of buying ' + tfLabel + '.';
        else {
          txt += ' Your goal is to buy ' + tfLabel + ' — this path lands about ' + (b.mo - goal) + ' month' + (b.mo - goal > 1 ? 's' : '') + ' past that';
          var extra = Math.ceil(Math.max(0, (b.need - S.numbers.saved) / Math.max(1, goal)) - S.numbers.saveMo);
          txt += extra > 0 ? ', unless you can lift saving to about ' + m$(S.numbers.saveMo + extra) + '/mo.' : '.';
        }
      }
      txt += ' The trade-offs: scheme places are limited each year, and a smaller deposit means a larger loan and higher repayments.';
      read.innerHTML = txt;
    }
    renderScenarios(R);
    track('projector_update', { st: N.state, price: N.price });
  }

  // ── Scenarios: saved projector runs, compared side by side ──────────
  // The owner's architecture: one journey → many worked scenarios. Each is a
  // snapshot of the inputs + the best path at save time; Load restores the
  // inputs and the projector recomputes live.
  function scenName() {
    var N = S.numbers, P = S.profile;
    return N.state.toUpperCase() + ' ' + m$(N.price) + (P.fhb ? '' : ' · not first home');
  }
  function renderScenarios(R) {
    var box = document.getElementById('jscen');
    if (!box) return;
    var rows = S.scenarios.map(function (sc, i) {
      return '<div class="jscen-row">' +
        '<div class="jscen-main"><div class="jscen-name">' + esc(sc.name) + '</div>' +
        '<div class="jscen-meta">' + esc(sc.bestName) + ' · ' + (sc.mo <= 0 ? 'ready now' : 'ready ' + esc(sc.buyBy)) + ' · ' + m$(sc.rep) + '/mo · needs ' + m$(sc.need) + ' · saved ' + m$(sc.saved) + ' at ' + m$(sc.saveMo) + '/mo</div></div>' +
        '<button type="button" class="jbtn quiet jscen-btn" data-scen-load="' + i + '">Load</button>' +
        '<button type="button" class="jinsp-del" data-scen-del="' + i + '" aria-label="Delete scenario">×</button>' +
        '</div>';
    }).join('');
    box.innerHTML = '<div class="jcard jpad">' +
      '<span class="jsc jblock">Worked scenarios</span>' +
      (rows ? '<div class="jscen-list">' + rows + '</div>'
        : '<p class="jcaveat" style="margin-top:2px">Save this run and try another — a different price, state or savings rate. Each saved scenario keeps its numbers so you can compare the versions of your plan side by side.</p>') +
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
        numbers: { price: N.price, saved: N.saved, saveMo: N.saveMo, state: N.state },
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
      '<p><b>' + S.scenarios.length + '</b> worked scenario' + (S.scenarios.length > 1 ? 's' : '') + ' — latest: ' + esc(latest.name) + ' via ' + esc(latest.bestName) + '.</p></div>' +
      '<div class="jsignup-actions"><button type="button" class="jbtn quiet" data-jgoto="projector">Compare paths</button></div></div>';
  }

  // ── Stop 3: budget wizard → a committed walk-away number ────────────
  var bStep = 0;
  function payAt(loan, rate) { var r = rate / 100 / 12; return loan * r / (1 - Math.pow(1 + r, -TERM)); }
  function budgetLmi(price, dep) {
    // Scheme path: an eligible FHB at 5% pays no LMI (the guarantee replaces it).
    if (dep >= 0.20) return 0;
    if (S.profile.fhb && dep <= 0.051) return 0;
    var loan = price * (1 - dep);
    return loan * lmiRate(loan / price);
  }
  function bDepDefault() {
    var b = S.budget.depositPct;
    if (b) return b;
    return S.profile.fhb ? 0.05 : 0.10;
  }
  function renderBudget() {
    var box = document.getElementById('jbudget');
    if (!box) return;
    if (S.budget.cap && !S.budget.editing) { renderBudgetDash(box); refreshMarkButtons(); return; }
    renderBudgetWizard(box);
  }

  function renderBudgetWizard(box) {
    var N = S.numbers, P = S.profile;
    var duty = buyerDuty();
    var dots = [0, 1, 2, 3].map(function (i) { return '<span class="jwiz-dot' + (i <= bStep ? ' on' : '') + '"></span>'; }).join('');
    var body = '', q = '', help = '', nav = '';

    if (bStep === 0) {
      q = 'First, the costs on top of the price.';
      help = 'These come out of your savings before the deposit does — every number that follows already includes them.';
      body = '<div style="margin-top:18px">' +
        '<div class="jstat"><span class="k">Stamp duty (' + N.state.toUpperCase() + (P.fhb ? ', first home buyer' : '') + ')</span><span class="v ' + (duty < 1 ? 'good' : '') + '">' + (duty < 1 ? '$0' : m$(duty)) + '</span></div>' +
        '<div class="jstat"><span class="k">Conveyancing / solicitor</span><span class="v">$1,300–$2,200</span></div>' +
        '<div class="jstat"><span class="k">Building &amp; pest inspection</span><span class="v">$400–$700</span></div>' +
        '<div class="jstat"><span class="k">Title &amp; mortgage registration</span><span class="v">varies by state</span></div>' +
        '<div class="jstat"><span class="k">Loan application / valuation</span><span class="v">$0–$600</span></div>' +
        '</div><p class="jcaveat" style="margin-top:10px">The solicitor line is the one that surprises everyone — it’s budgeted from day one here. We carry ' + m$(OTHER_COSTS) + ' for legals and registration in every projection.</p>';
      nav = '<span></span><button type="button" class="jbtn" id="jb-next">Next</button>';
    }

    if (bStep === 1) {
      q = 'Which deposit level are you working toward?';
      help = 'Cash needed = deposit + stamp duty + ' + m$(OTHER_COSTS) + ' of legals, at your ' + m$(N.price) + ' target. You have ' + m$(N.saved) + ' saved.';
      var costs = duty + OTHER_COSTS;
      var sel = bDepDefault();
      body = '<div style="display:flex;flex-direction:column;gap:9px;margin-top:18px">' +
        [[0.05, P.fhb ? '5% — the scheme path' : '5% deposit', P.fhb ? 'No LMI with a 5% Deposit Scheme place' : 'Carries the steepest LMI'],
         [0.10, '10% deposit', 'Buy sooner without a scheme place — LMI applies'],
         [0.20, '20% deposit', 'No LMI, smallest loan, longest save']].map(function (o) {
          var need = N.price * o[0] + costs;
          var ok = N.saved >= need;
          return '<button type="button" class="jwiz-state jb-dep' + (Math.abs(sel - o[0]) < 0.001 ? ' sel' : '') + '" data-bdep="' + o[0] + '" style="text-align:left;padding:14px 16px">' +
            '<span style="display:block;font-family:var(--font-body);font-weight:600">' + o[1] + '</span>' +
            '<span style="display:block;font-family:var(--font-body);font-size:12.5px;font-weight:400;opacity:0.75;margin-top:2px">' + o[2] + ' · needs ' + m$(need) + (ok ? ' — covered' : ' — short ' + m$(need - N.saved)) + '</span></button>';
        }).join('') + '</div>';
      nav = '<button type="button" class="jwiz-skip" id="jb-back">← Back</button><span class="jmins">tap one</span>';
    }

    if (bStep === 2) {
      var dep = bDepDefault();
      var lmi = budgetLmi(N.price, dep);
      var loan = N.price * (1 - dep) + lmi;
      var assessed = payAt(loan, RATE + 3);
      q = 'Can your income actually carry it?';
      help = 'Lenders don’t test you at today’s ' + RATE.toFixed(2) + '% — they add a 3% buffer.';
      body = '<div style="margin-top:18px">' +
        '<div class="jstat"><span class="k">Loan at a ' + Math.round(dep * 100) + '% deposit' + (lmi ? ' (incl. ' + m$(lmi) + ' LMI)' : '') + '</span><span class="v">' + m$(loan) + '</span></div>' +
        '<div class="jstat"><span class="k">Repayment at ' + RATE.toFixed(2) + '%</span><span class="v">' + m$(payAt(loan, RATE)) + '/mo</span></div>' +
        '<div class="jstat"><span class="k">Tested at ' + (RATE + 3).toFixed(2) + '%</span><span class="v">' + m$(assessed) + '/mo</span></div>' +
        (P.income > 0 ? '<div class="jstat"><span class="k">Share of your gross income</span><span class="v ' + (assessed / (P.income / 12) <= 0.30 ? 'good' : 'warn') + '">' + Math.round(assessed / (P.income / 12) * 100) + '%</span></div>' : '') +
        '</div>' +
        (P.rentNow > 0 ? '<p class="jwiz-help" style="margin-top:12px">' + (assessed > P.rentNow
          ? 'That’s ' + m$(assessed - P.rentNow) + '/mo more than your current rent. Bank the difference from this month and you’re proving the repayment to yourself before any lender asks.'
          : 'That’s less than the ' + m$(P.rentNow) + '/mo you already pay in rent — you’re living the payment now; the deposit is the only gap.') + '</p>' : '') +
        (P.cardLimits > 0 ? '<p class="jwiz-help" style="margin-top:8px">Your ' + m$(P.cardLimits) + ' of card limits also counts against you — lenders assess about 3% of the limit monthly (' + m$(P.cardLimits * 0.03) + '/mo) even at $0 owing. Cutting unused limits is the cheapest boost there is.</p>' : '');
      nav = '<button type="button" class="jwiz-skip" id="jb-back">← Back</button><button type="button" class="jbtn" id="jb-next">Next</button>';
    }

    if (bStep === 3) {
      var dep3 = bDepDefault();
      var suggest = N.price;
      var incomeCeil = 0;
      if (P.income > 0) {
        var factor = (function () { var r = (RATE + 3) / 100 / 12; return r / (1 - Math.pow(1 + r, -TERM)); })();
        var loanMax = (P.income / 12) * 0.35 / factor;
        incomeCeil = Math.floor(loanMax / (1 - dep3) / 5000) * 5000;
        suggest = Math.min(suggest, incomeCeil);
      }
      q = 'Set your walk-away number.';
      help = 'The most you’ll pay for any property — decided now, calmly, not in an auction room. ' +
        (incomeCeil > 0 ? 'On your income, tested repayments pass the common 35% line at about ' + m$(incomeCeil) + '. ' : '') +
        'You can change it any time.';
      body = '<div class="jwiz-input-row"><span class="jwiz-cur">$</span>' +
        '<input class="jwiz-input" id="jb-cap" type="text" inputmode="decimal" value="' + Number(S.budget.cap || suggest).toLocaleString('en-AU') + '" aria-label="Walk-away number"></div>';
      nav = '<button type="button" class="jwiz-skip" id="jb-back">← Back</button><button type="button" class="jbtn" id="jb-commit">Commit to this number</button>';
    }

    box.innerHTML = '<div class="jwizard"><div class="jwiz-card">' +
      '<div class="jwiz-dots">' + dots + '</div>' +
      '<div class="jwiz-q">' + q + '</div>' +
      '<p class="jwiz-help">' + help + '</p>' + body +
      '<div class="jwiz-nav">' + nav + '</div>' +
      '</div></div>';

    var nx = document.getElementById('jb-next');
    if (nx) nx.addEventListener('click', function () { bStep++; renderBudget(); });
    var bk = document.getElementById('jb-back');
    if (bk) bk.addEventListener('click', function () { bStep = Math.max(0, bStep - 1); renderBudget(); });
    var deps = box.querySelectorAll('[data-bdep]');
    for (var i = 0; i < deps.length; i++) deps[i].addEventListener('click', function () {
      S.budget.depositPct = parseFloat(this.getAttribute('data-bdep'));
      save(); bStep = 2; renderBudget();
    });
    var cm = document.getElementById('jb-commit');
    if (cm) cm.addEventListener('click', function () {
      var v = parseNum(document.getElementById('jb-cap').value);
      var capIn = document.getElementById('jb-cap');
      if (!(v >= 50000)) { if (capIn) { capIn.focus(); capIn.style.borderBottomColor = 'var(--terracotta)'; setTimeout(function () { capIn.style.borderBottomColor = ''; }, 1200); } return; }
      S.budget.cap = Math.round(v);
      S.budget.depositPct = bDepDefault();
      S.budget.editing = false;
      save();
      track('journey_budget_cap_set', { cap: S.budget.cap });
      renderBudget();
    });
    var capField = document.getElementById('jb-cap');
    if (capField) capField.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); var b2 = document.getElementById('jb-commit'); if (b2) b2.click(); } });
  }

  function renderBudgetDash(box) {
    var N = S.numbers, P = S.profile;
    var cap = S.budget.cap, dep = bDepDefault();
    var duty = buyerDutyAt(cap);
    var costs = duty + OTHER_COSTS;
    var lmi = budgetLmi(cap, dep);
    var loan = cap * (1 - dep) + lmi;
    var assessed = payAt(loan, RATE + 3);
    var html = '';

    html += '<section class="jcard jpad" style="text-align:center;margin-top:18px">' +
      '<span class="jsc jsc-gold jblock">Your walk-away number</span>' +
      '<div class="jcap">' + m$(cap) + '</div>' +
      '<p class="jwiz-help" style="margin-top:6px">At a ' + Math.round(dep * 100) + '% deposit' + (lmi ? ' (LMI ' + m$(lmi) + ' added to the loan)' : ', no LMI') + '. Set calmly, before any agent or auction room gets a say — it caps every search band and offer from here.</p>' +
      '<div class="jwiz-nav" style="justify-content:center;margin-top:14px"><button type="button" class="jwiz-skip" id="jb-edit">Adjust my budget</button></div></section>';

    html += '<section class="jcard jpad"><span class="jsc jblock">All-in at your cap</span>' +
      '<div class="jstat"><span class="k">Stamp duty (' + N.state.toUpperCase() + (P.fhb ? ', first home buyer' : '') + ')</span><span class="v ' + (duty < 1 ? 'good' : '') + '">' + (duty < 1 ? '$0' : m$(duty)) + '</span></div>' +
      '<div class="jstat"><span class="k">Legals &amp; registration (carried estimate)</span><span class="v">' + m$(OTHER_COSTS) + '</span></div>' +
      '<div class="jstat"><span class="k">Cash needed (' + Math.round(dep * 100) + '% deposit + costs)</span><span class="v ' + (N.saved >= cap * dep + costs ? 'good' : '') + '">' + m$(cap * dep + costs) + (N.saved >= cap * dep + costs ? ' — covered' : ' — short ' + m$(cap * dep + costs - N.saved)) + '</span></div>' +
      '<div class="jstat"><span class="k">Loan</span><span class="v">' + m$(loan) + '</span></div>' +
      '<div class="jstat"><span class="k">Repayment at ' + RATE.toFixed(2) + '%</span><span class="v">' + m$(payAt(loan, RATE)) + '/mo</span></div>' +
      '<div class="jstat"><span class="k">Lender-tested at ' + (RATE + 3).toFixed(2) + '%</span><span class="v">' + m$(assessed) + '/mo' + (P.income > 0 ? ' (' + Math.round(assessed / (P.income / 12) * 100) + '% of income)' : '') + '</span></div>' +
      '<p class="jcaveat" style="margin-top:10px">A guide only — real serviceability depends on expenses, debts and the lender’s own rules. Not financial advice. Your savings: ' + m$(N.saved) + '.</p></section>';

    html += '<section class="jcard jpad jdone-row"><div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">You have a real budget.</div></div>' +
      '<button class="jbtn" data-jmark="3">Mark this stop done</button></section>';
    box.innerHTML = html;
    var ed = document.getElementById('jb-edit');
    if (ed) ed.addEventListener('click', function () { S.budget.editing = true; bStep = 1; save(); renderBudget(); });
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
      .then(function (j) { _subData = j; return j; })
      .catch(function () { _subFetch = null; return null; });
    return _subFetch;
  }
  var SUB_SRC = 'Sale medians: Valuer-General Victoria 2025 (preliminary) · Valuer-General SA Q1 2026 (metro Adelaide). Rents: RTA Mar 2026 (QLD) · CBS SA Jan–Mar 2026 · Tas rental bonds May 2025–Apr 2026. All CC BY 4.0 state-government data.';

  function subRow(name, st, figure, slug) {
    return '<a class="jsub-row" href="/suburb/' + st + '/' + slug + '/">' +
      '<span class="jsub-name">' + esc(name) + ' <span class="jsub-st">' + st.toUpperCase() + '</span></span>' +
      '<span class="jsub-fig">' + figure + '</span></a>';
  }

  function renderGroundFits(j) {
    var box = document.getElementById('jground-fits');
    if (!box) return;
    if (!j) { box.innerHTML = '<p class="jcaveat">Couldn\u2019t load the suburb dataset just now — try again shortly.</p>'; return; }
    var target = S.budget.cap || S.numbers.price;
    var lo = Math.round(target * 0.9), hi = Math.round(target * 1.1);
    var fits = [];
    j.rows.forEach(function (r) {
      if (r[3] >= lo && r[3] <= hi) fits.push({ st: r[0], name: r[1], slug: r[2], price: r[3], kind: 'houses' });
      else if (r[4] >= lo && r[4] <= hi) fits.push({ st: r[0], name: r[1], slug: r[2], price: r[4], kind: 'units' });
    });
    fits.sort(function (a, b) { return Math.abs(a.price - target) - Math.abs(b.price - target); });
    var top = fits.slice(0, 12);
    var myState = S.numbers.state;
    var stateHasPrices = fits.some(function (f) { return f.st === myState; }) || myState === 'vic' || myState === 'sa';
    var html = '';
    if (!stateHasPrices) {
      html += '<p class="jcaveat" style="margin:0 0 10px">Verified suburb-level sale medians currently cover VIC and metro Adelaide — ' + myState.toUpperCase() + ' joins as soon as a licensed dataset is published. Across Australia, these suburbs\u2019 medians sit inside your band:</p>';
    }
    if (top.length) {
      html += '<div class="jsub-list">' + top.map(function (f) {
        return subRow(f.name, f.st, '<b>' + m$(f.price) + '</b> <span class="jsub-kind">median, ' + f.kind + '</span>', f.slug);
      }).join('') + '</div>';
      if (fits.length > top.length) html += '<p class="jhint" style="margin-top:8px">' + fits.length + ' suburbs fit your ' + m$(lo) + '\u2013' + m$(hi) + ' band — showing the 12 closest to ' + m$(target) + '.</p>';
    } else {
      html += '<p class="jcaveat">No suburb in the verified dataset has a median inside ' + m$(lo) + '\u2013' + m$(hi) + ' right now. Try widening the band by adjusting your budget at stop 3, or search the dataset below.</p>';
    }
    html += '<p class="jcaveat" style="margin-top:10px">' + SUB_SRC + '</p>';
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
      var hits = [];
      for (var i = 0; i < j.rows.length && hits.length < 8; i++) {
        var r = j.rows[i];
        if (r[1].toLowerCase().indexOf(term) !== -1) hits.push(r);
      }
      if (!hits.length) { res.innerHTML = '<p class="jcaveat" style="margin-top:10px">Nothing in the verified dataset matches \u201c' + esc(term) + '\u201d. (NSW/WA/ACT/NT suburbs join when licensed suburb-level data is published.)</p>'; return; }
      res.innerHTML = '<div class="jsub-list" style="margin-top:10px">' + hits.map(function (r) {
        var bits = [];
        if (r[3]) bits.push('<b>' + m$(r[3]) + '</b> <span class="jsub-kind">houses</span>');
        if (r[4]) bits.push('<b>' + m$(r[4]) + '</b> <span class="jsub-kind">units</span>');
        if (r[5]) bits.push('<b>$' + r[5] + '/wk</b> <span class="jsub-kind">median rent</span>');
        return subRow(r[1], r[0], bits.join(' · '), r[2]);
      }).join('') + '</div>';
    };
    var t = null;
    q.addEventListener('input', function () { if (t) clearTimeout(t); t = setTimeout(run, 200); });
  }

  function renderGround() {
    var box = document.getElementById('jground');
    if (!box) return;
    var N = S.numbers;
    var target = S.budget.cap || N.price;
    var lo = Math.round(target * 0.9 / 5000) * 5000, hi = Math.round(target * 1.1 / 5000) * 5000;
    box.innerHTML =
      '<section class="jcard jpad"><span class="jsc jblock">Your realistic search band</span>' +
      '<p style="font-size:15px;line-height:1.65">With ' + (S.budget.cap ? 'your committed cap of' : 'a target of') + ' <b class="mono-strong">' + m$(target) + '</b>, shortlist suburbs where typical listings sit between <b class="mono-strong">' + m$(lo) + '</b> and <b class="mono-strong">' + m$(hi) + '</b>. Below the band you\u2019re compromising more than you need to; above it you\u2019re auction fodder.</p></section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Suburbs your band actually buys</span>' +
      '<div id="jground-fits"><p class="jcaveat">Loading the verified dataset\u2026</p></div></section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Search the dataset</span>' +
      '<p class="jcaveat" style="margin:0 0 10px">1,473 suburbs with a current, licensed figure — sale medians (VIC, metro SA) or median rents (QLD, SA, TAS). Each links to its full profile.</p>' +
      '<input type="text" id="jsub-q" class="jsub-input" placeholder="Type a suburb name\u2026" aria-label="Search suburbs">' +
      '<div id="jsub-res"></div></section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Shortlist around your life, not the hype</span>' +
      '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">The best suburb filter isn\u2019t a score — it\u2019s the places your week already happens: work, family, church, the gym, mates. Write down your three non-negotiable places, then look at what\u2019s inside a 20-minute trip of each. Cross that with the list above and you have a real search map.</p></section>' +
      '<section class="jcard jpad jdone-row"><div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">You know where.</div></div>' +
      '<button class="jbtn" data-jmark="4">Mark this stop done</button></section>';
    fetchSuburbs().then(function (j) {
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
    if (diff > 0) return ' <span class="jcapdelta over">' + m$(diff) + ' over your cap</span>';
    return ' <span class="jcapdelta under">under cap</span>';
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
      var picker = '';
      if (_huntOpen === i) {
        picker = '<div class="jplace-pick">' + PLACE_STATUSES.map(function (s) {
          return '<button type="button" class="jplace-pick-chip st-' + s[0] + (st === s[0] ? ' sel' : '') + '" data-place-set="' + i + ':' + s[0] + '">' + s[1] + '</button>';
        }).join('') + '</div>';
      }
      return '<div class="jinsp' + (st === 'passed' || st === 'lost' ? ' muted' : '') + '">' +
        '<div class="jinsp-main"><div class="jinsp-addr">' + esc(r.addr) + '</div>' +
        '<div class="jinsp-meta">' + (r.price ? m$(r.price) + capDelta(r.price) + (r.note ? ' · ' : '') : '') + esc(r.note || '') + '</div></div>' +
        '<button type="button" class="jplace-st st-' + st + '" data-place-status="' + i + '" aria-expanded="' + (_huntOpen === i) + '">' + PLACE_LABEL[st] + ' ▾</button>' +
        '<button type="button" class="jinsp-del" data-insp-del="' + i + '" aria-label="Remove">×</button>' +
        '</div>' + picker;
    }).join('');

    var won = null;
    for (var w = 0; w < S.inspections.length; w++) if (placeSt(S.inspections[w]) === 'won') { won = S.inspections[w]; break; }

    box.innerHTML =
      '<section class="jcard jpad"><span class="jsc jblock">Add a place</span>' +
      '<form id="jinsp-form" class="jinsp-form">' +
      '<input type="text" id="jinsp-addr" placeholder="12 Example St, Suburb" aria-label="Address" required>' +
      '<input type="text" id="jinsp-price" inputmode="decimal" placeholder="Asking $" aria-label="Asking price">' +
      '<input type="text" id="jinsp-note" placeholder="One honest note (the flaw you noticed)" aria-label="Note">' +
      '<button type="submit" class="jbtn">Add</button>' +
      '</form>' +
      (S.inspections.length
        ? filters + '<div class="jinsp-list">' + rows + '</div>'
        : '<p class="jcaveat" style="margin-top:12px">Nothing here yet. Log every place — even the ones you only browsed online. The pattern of what you keep passing on teaches you what you actually want. Write the honest note before the car leaves the street.</p>') +
      '</section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Before any auction</span>' +
      (S.budget.cap
        ? '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">Your walk-away number is <b class="mono-strong">' + m$(S.budget.cap) + '</b> — you set it at stop 3, calmly. Write it down the night before and don\u2019t let the room move it a dollar. Lost one? Mark it \u201cLost auction\u201d and keep the note — it sharpens the next bid.</p>'
        : '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">Set your walk-away number at stop 3 first — decided in writing, when you\u2019re calm, it\u2019s the number the auction room can\u2019t argue with.</p>') + '</section>' +
      '<section class="jcard jpad jdone-row"><div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">' +
      (won ? 'You found it — ' + esc(won.addr) + '.' : 'You found it.') +
      '</div></div>' +
      '<button class="jbtn" data-jmark="5">Mark this stop done</button></section>';

    var f = document.getElementById('jinsp-form');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (RO) return;
      var addr = (document.getElementById('jinsp-addr').value || '').trim();
      if (!addr) return;
      S.inspections.unshift({
        addr: addr.slice(0, 120),
        price: parseNum(document.getElementById('jinsp-price').value) || 0,
        note: (document.getElementById('jinsp-note').value || '').trim().slice(0, 160),
        st: 'inspected'
      });
      S.inspections = S.inspections.slice(0, 50);
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
      '<p>' + bits.join(' · ') + '</p></div>' +
      '<div class="jsignup-actions"><button type="button" class="jbtn quiet" data-jgoto="hunt">Open the library</button></div></div>';
  }

  // ── Stops 6 & 7 checklists ───────────────────────────────────────────
  var DEAL_CHECKS = [
    ['Send the contract to your solicitor', 'Budget $1,300–$2,200 — the cost that surprises everyone'],
    ['Book the building and pest inspection', '$400–$700 · book inside the first week'],
    ['Send the contract to your lender or broker', 'Starts formal approval — don’t wait'],
    ['Confirm your scheme place is locked in', 'The path you chose at stop 2'],
    ['Arrange building insurance from the contract date', 'In some states risk passes to you at signing']
  ];
  var SETTLE_CHECKS = [
    ['Final inspection booked (day before settlement)', 'Same condition as when you signed — check every room'],
    ['Shortfall funds transferred to your solicitor', 'They’ll give you the exact figure a few days out'],
    ['Building insurance active from settlement day', 'Lenders require proof before they’ll settle'],
    ['Utilities and internet booked for move-in', 'Two weeks’ lead time saves cold showers'],
    ['Collect the keys', 'That’s it. That’s the journey.']
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

  var dStep = 0;
  function dealDateQs() {
    var st = S.numbers.state;
    var biz = COOL_OFF_BIZ[st];
    var c = S.deal.dates.contract;
    return [
      { id: 'contract', q: 'When did you sign the contract?', help: 'Every other deadline counts from this date.', def: isoDate(new Date()) },
      { id: 'cooling', q: 'When does cooling-off end?',
        help: biz
          ? 'In ' + st.toUpperCase() + ' it’s ' + biz + ' business days for a private treaty sale — auctions have none. Use the date your solicitor confirms.'
          : st.toUpperCase() + ' has no statutory cooling-off period. Skip this unless your contract adds one.',
        def: c && biz ? addBizDaysISO(c, biz) : '', optional: !biz },
      { id: 'bp', q: 'Building & pest deadline?', help: 'The date your contract gives you to get the inspection done and act on it — around 14 days is typical. Use your contract’s date.', def: c ? addDaysISO(c, 14) : '' },
      { id: 'finance', q: 'Finance approval deadline?', help: 'The “subject to finance” date. If the loan isn’t approved by then you must extend, terminate or risk your deposit. 14–21 days is common.', def: c ? addDaysISO(c, 21) : '', optional: true },
      { id: 'preapproval', q: 'When does your pre-approval expire?', help: 'Usually about 90 days from when the lender issued it — the deadline most buyers lose track of. Skip if you don’t have one.', def: '', optional: true },
      { id: 'settlement', q: 'Settlement day?', help: 'The day the money moves and the keys are yours. Check the contract — 30 to 60 days after signing is common.', def: c ? addDaysISO(c, 42) : '' }
    ];
  }

  function renderDeal() {
    var box = document.getElementById('jdeal');
    if (!box) return;
    if (!S.deal.signed) { renderDealPre(box); refreshMarkButtons(); return; }
    if (!S.deal.dates.contract || S.deal.editing) { renderDealWizard(box); return; }
    renderDealDash(box);
    refreshMarkButtons();
  }

  function renderDealPre(box) {
    box.innerHTML =
      '<section class="jcard jpad" style="margin-top:18px"><span class="jsc jblock">Not signed yet? Here’s what’s coming</span>' +
      '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">The moment you sign, a set of clocks starts: cooling-off, building &amp; pest, finance approval, your pre-approval’s own expiry, settlement. Miss one and you can lose your deposit or your loan. The day you sign, come back here with the contract and enter each date — we’ll keep count on every one.</p>' +
      '<div class="jdl"><div><div>Cooling-off ends</div><div class="jwhen">days after signing, set by your state</div></div><span class="jdays urgent">first</span></div>' +
      '<div class="jdl"><div><div>Building &amp; pest deadline</div><div class="jwhen">typically ~14 days</div></div><span class="jdays soon">soon after</span></div>' +
      '<div class="jdl"><div><div>Finance approval deadline</div><div class="jwhen">typically 14–21 days</div></div><span class="jdays soon">then</span></div>' +
      '<div class="jdl"><div><div>Pre-approval expires</div><div class="jwhen">~90 days from issue — the one buyers forget</div></div><span class="jdays ok">watch it</span></div>' +
      '<div class="jdl"><div><div>Settlement</div><div class="jwhen">30–60 days after signing</div></div><span class="jdays ok">the finish</span></div>' +
      '<div class="jwiz-nav" style="margin-top:16px"><span></span><button type="button" class="jbtn" id="jd-signed">I’ve signed — enter my dates</button></div></section>';
    var b = document.getElementById('jd-signed');
    if (b) b.addEventListener('click', function () { S.deal.signed = true; dStep = 0; save(); renderDeal(); });
  }

  function renderDealWizard(box) {
    var qs = dealDateQs();
    if (dStep >= qs.length) {
      S.deal.editing = false; save();
      track('journey_deal_dates_set', {});
      renderDeal();
      return;
    }
    var q = qs[dStep];
    var cur = S.deal.dates[q.id] || q.def || '';
    var dots = qs.map(function (_, i) { return '<span class="jwiz-dot' + (i <= dStep ? ' on' : '') + '"></span>'; }).join('');
    box.innerHTML = '<div class="jwizard"><div class="jwiz-card">' +
      '<div class="jwiz-dots">' + dots + '</div>' +
      '<div class="jwiz-q">' + esc(q.q) + '</div>' +
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        if (inp) { inp.focus(); inp.style.borderBottomColor = 'var(--terracotta)'; setTimeout(function () { inp.style.borderBottomColor = ''; }, 1200); }
        return;
      }
      S.deal.dates[q.id] = v; save();
      dStep++; renderDealWizard(box);
    });
    var sk = document.getElementById('jd-skip');
    if (sk) sk.addEventListener('click', function () { S.deal.dates[q.id] = null; save(); dStep++; renderDealWizard(box); });
    var bk = document.getElementById('jd-back');
    if (bk) bk.addEventListener('click', function () { dStep = Math.max(0, dStep - 1); renderDealWizard(box); });
    var ny = document.getElementById('jd-notyet');
    if (ny) ny.addEventListener('click', function () { S.deal.signed = false; save(); renderDeal(); });
  }

  // ICS export (RFC 5545): all-day VEVENTs, CRLF line endings, UID+DTSTAMP.
  function buildDealIcs() {
    var D = S.deal.dates;
    var labels = {
      cooling: 'Cooling-off ends', bp: 'Building & pest deadline',
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
      lines.push('SUMMARY:' + labels[k] + ' \u2014 first home purchase');
      lines.push('DESCRIPTION:From your First Home Journey deadline tracker (equitysight.app/journey). Check the exact terms in your contract.');
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
    contract: 'Contract signed', cooling: 'Cooling-off ends', bp: 'Building & pest deadline',
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
      '<p class="jhint">Counted from today, on this device. Email nudges before each date arrive with accounts.</p>' +
      '<div class="jwiz-nav" style="margin-top:10px"><button type="button" class="jbtn quiet" id="jd-ics">Add these dates to my calendar</button><button type="button" class="jwiz-skip" id="jd-edit">Edit my dates</button></div>' +
      '</div></section>' +
      '<section class="jcard jpad jdone-row" style="margin-top:18px">' +
      '<div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">Contract signed.</div></div>' +
      '<button class="jbtn" data-jmark="6">Mark this stop done</button></section>';
    renderChecklist('jdeal-checks', DEAL_CHECKS, 'dealChecks');
    var ics = document.getElementById('jd-ics');
    if (ics) ics.addEventListener('click', downloadDealIcs);
    var ed = document.getElementById('jd-edit');
    if (ed) ed.addEventListener('click', function () { S.deal.editing = true; dStep = 0; save(); renderDeal(); });
  }
  function renderSettle() {
    renderChecklist('jsettle-checks', SETTLE_CHECKS, 'settleChecks');
  }

  // ── View switching + delegated events ────────────────────────────────
  var VIEWS = { home: 'jv-home', wizard: 'jv-wizard', projector: 'jv-projector', budget: 'jv-budget', ground: 'jv-ground', hunt: 'jv-hunt', deal: 'jv-deal', settle: 'jv-settle' };
  function refreshMarkButtons() {
    var btns = document.querySelectorAll('[data-jmark]');
    for (var i = 0; i < btns.length; i++) {
      var n = +btns[i].getAttribute('data-jmark');
      if (S.done[n]) {
        btns[i].textContent = '↺ Redo this stop';
        btns[i].classList.add('quiet');
      } else {
        btns[i].textContent = n === 7 ? 'Mark the journey complete' : 'Mark this stop done';
        btns[i].classList.remove('quiet');
      }
    }
  }

  function show(view) {
    Object.keys(VIEWS).forEach(function (k) {
      var el = document.getElementById(VIEWS[k]);
      if (el) el.classList.toggle('active', k === view);
    });
    if (view === 'wizard') { wStep = 0; renderWizard(); }
    if (view === 'projector') renderProjector();
    if (view === 'budget') renderBudget();
    if (view === 'ground') renderGround();
    if (view === 'hunt') renderHunt();
    if (view === 'deal') renderDeal();
    if (view === 'settle') renderSettle();
    if (view === 'home') renderTrail();
    refreshMarkButtons();
    try { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    track('journey_view', { view: view });
  }

  document.addEventListener('click', function (e) {
    if (RO && e.target.closest('[data-jmark],[data-check],[data-wopt],[data-place-set],[data-insp-del],[data-bdep],[data-scen-load],[data-scen-del],#jreset-btn')) return;
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
      return;
    }
    var wopt = e.target.closest('[data-wopt]');
    if (wopt) {
      var q = WQ[wStep];
      var raw = wopt.getAttribute('data-wopt');
      var val = raw === 'true' ? true : raw === 'false' ? false : (/^[0-9]+$/.test(raw) ? +raw : raw);
      wSet(q, val);
      wStep++;
      renderWizard();
      return;
    }
    var sl = e.target.closest('[data-scen-load]');
    if (sl) {
      var si = +sl.getAttribute('data-scen-load');
      var sc = S.scenarios[si];
      if (sc) {
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
      S.inspections.splice(di, 1);
      if (_huntOpen === di) _huntOpen = -1; else if (_huntOpen > di) _huntOpen--;
      save(); renderHunt(); renderPlacesSummary();
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList && e.target.classList.contains('jcheck')) { e.preventDefault(); e.target.click(); }
  });

  var resetBtn = document.getElementById('jreset-btn');
  if (resetBtn) resetBtn.addEventListener('click', resetJourney);

  if (isLoggedIn()) {
    var st = document.getElementById('jsaved-text');
    if (st) st.textContent = 'Progress syncs to your account.';
  }

  // ── Share / collaborate ──────────────────────────────────────────────
  function shareUrl(token) { return location.origin + '/journey?join=' + encodeURIComponent(token); }
  function copyText(txt, btn) {
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Copied ✓';
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
        '<span class="jsc jblock">Bring someone along</span>' +
        '<p>Buying with a partner, or want family to follow along? A free account lets you share this journey — view-only, or a link that lets your partner edit it with you.</p></div>' +
        '<div class="jsignup-actions"><a class="jbtn quiet" href="/login?tab=signup&next=%2Fjourney">Create a free account</a></div></div>';
      return;
    }
    slot.innerHTML = '<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jblock">Bring someone along</span>' +
      '<p>Share a follow-along link with family, or a partner link that lets the two of you work the same journey — every change syncs both ways.</p></div>' +
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
  }

  function setModeBanner(html) {
    var slot = document.getElementById('jmode-banner');
    if (slot) slot.innerHTML = html || '';
  }
  function leaveCollab() {
    try { localStorage.removeItem('propCalc_journey_collab'); } catch (e) {}
    location.href = '/journey';
  }
  function enterReadOnly(resp) {
    RO = true;
    S = normalizeState(resp.state);
    document.body.classList.add('jro');
    setModeBanner('<div class="jcard jpad jsignup"><div>' +
      '<span class="jsc jsc-gold jblock">Following ' + esc(resp.ownerName) + '\u2019s journey</span>' +
      '<p>You\u2019re viewing read-only — nothing you tap here changes their journey.</p></div>' +
      '<div class="jsignup-actions"><a class="jbtn quiet" href="/journey">Start my own journey</a></div></div>');
    renderTrail();
    track('journey_share_opened', { mode: 'view' });
  }

  function bootRemote() {
    var joinTok = null;
    try { joinTok = new URLSearchParams(location.search).get('join'); } catch (e) {}

    if (joinTok) {
      api({ action: 'shareResolve', token: joinTok }).then(function (r) {
        if (!r || !r.ok || !r.state) return;
        if (r.mode === 'view') { enterReadOnly(r); return; }
        // edit link
        if (!isLoggedIn()) {
          enterReadOnly(r);
          setModeBanner('<div class="jcard jpad jsignup"><div>' +
            '<span class="jsc jsc-gold jblock">' + esc(r.ownerName) + ' invited you to their journey</span>' +
            '<p>Sign in (free) and the two of you can work the same journey — every change syncs both ways. Until then you\u2019re viewing read-only.</p></div>' +
            '<div class="jsignup-actions"><a class="jbtn" href="/login?tab=signup&next=' + encodeURIComponent('/journey?join=' + joinTok) + '">Sign in to join</a></div></div>');
          return;
        }
        jModal({
          kicker: 'Journey invite',
          title: 'Join ' + r.ownerName + '\u2019s journey?',
          body: 'You\u2019ll work on their journey together — every change either of you makes syncs to both. The journey saved on this device is replaced by theirs.',
          buttons: [
            { label: 'Not now', cls: 'quiet' },
            { label: 'Join their journey', cb: function () {
                COLLAB = joinTok;
                try { localStorage.setItem('propCalc_journey_collab', joinTok); } catch (e) {}
                RO = false;
                S = normalizeState(r.state);
                save();
                setModeBanner('<div class="jcard jpad jsignup"><div>' +
                  '<span class="jsc jsc-gold jblock">On ' + esc(r.ownerName) + '\u2019s journey</span>' +
                  '<p>Changes you make sync to the shared journey.</p></div>' +
                  '<div class="jsignup-actions"><button type="button" class="jbtn quiet" id="jcollab-leave">Leave</button></div></div>');
                var lv = document.getElementById('jcollab-leave');
                if (lv) lv.addEventListener('click', leaveCollab);
                renderTrail();
                track('journey_collab_joined', {});
              } }
          ]
        });
      });
      return;
    }

    if (COLLAB && isLoggedIn()) {
      api({ action: 'get', collab: COLLAB }).then(function (r) {
        if (r && r.ok && r.record && r.record.state) {
          S = normalizeState(r.record.state);
          try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
          setModeBanner('<div class="jcard jpad jsignup"><div>' +
            '<span class="jsc jsc-gold jblock">Shared journey</span>' +
            '<p>Changes you make sync to the shared journey.</p></div>' +
            '<div class="jsignup-actions"><button type="button" class="jbtn quiet" id="jcollab-leave">Leave</button></div></div>');
          var lv = document.getElementById('jcollab-leave');
          if (lv) lv.addEventListener('click', leaveCollab);
          renderTrail();
        } else if (r && !r.ok && /no longer active/i.test(r.error || '')) {
          leaveCollab();
        }
      });
      return;
    }

    if (isLoggedIn()) {
      api({ action: 'get' }).then(function (r) {
        if (r && r.ok && r.record && r.record.state && (r.record.updatedAt || 0) > (S.updatedAt || 0)) {
          S = normalizeState(r.record.state);
          try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
          renderTrail();
        } else if (r && r.ok && !r.record && S.done[1]) {
          // first login with local guest progress — push it up
          scheduleSync();
        }
      });
    }
  }

  renderTrail();
  bootRemote();
  track('journey_view', { view: 'home' });
})();

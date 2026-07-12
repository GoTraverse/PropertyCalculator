/**
 * journey.js — The First Home Journey (v2)
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
      profile: { area: 'capital', buyers: 'single', fhb: true, build: 'established', income: null },
      dealChecks: [false, false, false, false, false],
      settleChecks: [false, false, false, false, false],
      inspections: [],
      signupDismissed: false
    };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) {
        var b = blank();
        // forward-fill fields added since first ship
        s.profile = s.profile || b.profile;
        s.settleChecks = s.settleChecks || b.settleChecks;
        s.inspections = s.inspections || [];
        if (typeof s.signupDismissed !== 'boolean') s.signupDismissed = false;
        return s;
      }
    } catch (e) {}
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var S = load();

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
    { n: 1, icon: 'compass', title: 'Get your bearings', view: 'wizard', cta: 'Start — about 90 seconds', blurb: 'Nine quick questions about you and your target — they power everything after.', milestone: 'You know your numbers.' },
    { n: 2, icon: 'signpost', title: 'Find your path', view: 'projector', cta: 'Compare my scheme paths', blurb: 'Which government scheme gets you in sooner — and what each really costs. Side by side, for your exact situation.', milestone: 'You know your path.' },
    { n: 3, icon: 'wallet', title: 'Set your real budget', view: 'budget', cta: 'See my real numbers', blurb: 'Every upfront cost for your purchase — including the solicitor — and an honest check against your income.', milestone: 'You have a real budget.' },
    { n: 4, icon: 'pin', title: 'Pick your ground', view: 'ground', cta: 'Work out where', blurb: 'The price band your budget really buys, and how to shortlist suburbs around the life you already have.', milestone: 'You know where.' },
    { n: 5, icon: 'search', title: 'Hunt & compare', view: 'hunt', cta: 'Track my inspections', blurb: 'Log every place you inspect, keep honest notes, and shortlist without the rose-tinted glasses.', milestone: 'You found it.' },
    { n: 6, icon: 'pen', title: 'Seal the deal', view: 'deal', cta: 'See the deadlines', blurb: 'Contract signed — now every deadline matters. Track each one, get nudged before it bites.', milestone: 'Contract signed.' },
    { n: 7, icon: 'key', title: 'Settle & move in', view: 'settle', cta: 'The final stretch', blurb: 'Settlement day checklist and the last dollars — then the keys are yours.', milestone: 'Keys in hand.' }
  ];

  function currentStop() {
    for (var i = 0; i < STOPS.length; i++) if (!S.done[STOPS[i].n]) return STOPS[i].n;
    return 7;
  }
  function markDone(n) {
    S.done[n] = true;
    save();
    track('journey_step_done', { step: n });
    show('home');
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

    var html = STOPS.map(function (s, i) {
      var side = i % 2 === 0 ? 'left' : 'right';
      var stateCls = S.done[s.n] ? 'done' : (s.n === cur ? 'current' : 'ahead');
      var stateLbl = S.done[s.n] ? '<span class="jstate done-t jsc">Done — open to revisit</span>'
        : (s.n === cur ? '<span class="jstate here jsc">You are here</span>'
          : '<span class="jstate jsc">' + (s.n === 7 ? 'The finish' : 'Ahead') + '</span>');
      var isCurrent = s.n === cur && !S.done[s.n];
      var inner = stateLbl + '<h3>' + esc(s.title) + '</h3>';
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
  function buyerDuty() {
    var st = S.numbers.state, v = S.numbers.price, P = S.profile;
    if (!P.fhb) return calcDuty(st, v);
    if (P.build === 'new' && (st === 'sa' || st === 'qld')) return 0;
    return fhbDuty(st, v);
  }
  // ── end duty sync copy ───────────────────────────────────────────────

  // ── SYNC COPY: scheme constants (first-home-buyer-grants-calculator.js)
  var FDS_CAPS = { nsw: [1500000, 800000], vic: [950000, 650000], qld: [1000000, 700000], sa: [900000, 500000], wa: [850000, 600000], tas: [700000, 550000], act: [1000000, 1000000], nt: [750000, 600000] };
  var H2B_CAPS = { nsw: [1300000, 800000], vic: [950000, 650000], qld: [1000000, 700000], sa: [900000, 500000], wa: [850000, 600000], tas: [700000, 550000], act: [1000000, 1000000], nt: [600000, 600000] };
  var H2B_INCOME = { single: 103000, couple: 165000 };
  var H2B_EQUITY = { new: 0.40, established: 0.30, unsure: 0.30 };
  // ── end scheme sync copy ─────────────────────────────────────────────

  var RATE = 6.0, TERM = 360, OTHER_COSTS = 3500; // conveyancing + registration estimate
  function pay(P) { var r = RATE / 100 / 12; return P * r / (1 - Math.pow(1 + r, -TERM)); }
  function lmiRate(lvr) { return lvr <= 0.80 ? 0 : lvr <= 0.85 ? 0.008 : lvr <= 0.90 ? 0.019 : lvr <= 0.95 ? 0.034 : 0.043; }
  function m$(v) { return '$' + Math.round(v).toLocaleString('en-AU'); }
  function parseNum(s) { var n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; }

  // ── Stop 1 wizard (nine questions, one at a time) ────────────────────
  var WQ = [
    { id: 'state', kind: 'chips', q: 'Where are you looking to buy?', help: 'Stamp duty, concessions and schemes all change at the border.', opts: [['qld', 'QLD'], ['nsw', 'NSW'], ['vic', 'VIC'], ['sa', 'SA'], ['wa', 'WA'], ['tas', 'TAS'], ['act', 'ACT'], ['nt', 'NT']], store: 'numbers' },
    { id: 'area', kind: 'chips', q: 'Capital city, or regional?', help: 'The government schemes use different price caps for capitals and the rest of the state.', opts: [['capital', 'Capital city'], ['regional', 'Regional']], store: 'profile' },
    { id: 'buyers', kind: 'chips', q: 'Buying alone or together?', help: 'Income caps for shared-equity schemes are different for joint applicants.', opts: [['single', 'Just me'], ['couple', 'Two of us']], store: 'profile' },
    { id: 'fhb', kind: 'chips', q: 'Is this your first home?', help: 'First home buyers get stamp duty concessions and access to the federal schemes.', opts: [[true, 'Yes, first home'], [false, 'Owned before']], store: 'profile' },
    { id: 'build', kind: 'chips', q: 'Established home, or a new build?', help: 'Some concessions and equity schemes are more generous for new builds.', opts: [['established', 'Established'], ['new', 'New build'], ['unsure', 'Not sure yet']], store: 'profile' },
    { id: 'income', kind: 'money', q: 'Household income, before tax?', help: 'Yearly, combined if you’re buying together. Used only to check scheme eligibility and give you an honest affordability guide.', def: 95000, min: 0, store: 'profile' },
    { id: 'price', kind: 'money', q: 'What price are you aiming for?', help: 'A rough target is fine — you can change it any time.', def: 650000, min: 50000, store: 'numbers' },
    { id: 'saved', kind: 'money', q: 'How much have you saved so far?', help: 'Deposit savings only — don’t count your emergency buffer.', def: 60000, min: 0, store: 'numbers' },
    { id: 'saveMo', kind: 'money', q: 'How much can you put away each month?', help: 'Be honest rather than hopeful — the projections use this.', def: 2000, min: 0, store: 'numbers' }
  ];
  var wStep = 0;

  function wVal(q) { return q.store === 'profile' ? S.profile[q.id] : S.numbers[q.id]; }
  function wSet(q, v) { if (q.store === 'profile') S.profile[q.id] = v; else S.numbers[q.id] = v; save(); }

  function renderWizard() {
    var box = document.getElementById('jwizard');
    if (!box) return;
    if (wStep >= WQ.length) { renderWizardDone(); return; }
    var q = WQ[wStep];
    var dots = WQ.map(function (_, i) { return '<span class="jwiz-dot' + (i <= wStep ? ' on' : '') + '"></span>'; }).join('');
    var body;
    if (q.kind === 'chips') {
      var cols = q.opts.length > 4 ? 4 : q.opts.length;
      body = '<div class="jwiz-states" style="grid-template-columns:repeat(' + cols + ',1fr)">' + q.opts.map(function (o) {
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
    save();
    track('journey_wizard_done', {});
    var box = document.getElementById('jwizard');
    var N = S.numbers, P = S.profile;
    box.innerHTML = '<div class="jwiz-card">' +
      '<div class="jwiz-done-icon">' + IC.check + '</div>' +
      '<div class="jwiz-q">That’s your bearings.</div>' +
      '<p class="jwiz-help">First milestone reached — you know your numbers. Next comes the one most buyers never find out: which scheme path suits <em>your</em> situation.</p>' +
      '<div class="jwiz-summary">' +
      '<span class="chip"><b>' + N.state.toUpperCase() + '</b> ' + (P.area === 'capital' ? 'capital' : 'regional') + '</span>' +
      '<span class="chip">' + (P.buyers === 'couple' ? 'Buying together' : 'Buying solo') + '</span>' +
      '<span class="chip">' + (P.fhb ? 'First home' : 'Owned before') + '</span>' +
      '<span class="chip">' + (P.build === 'new' ? 'New build' : P.build === 'unsure' ? 'Build: not sure' : 'Established') + '</span>' +
      '<span class="chip">Income <b>' + m$(P.income || 0) + '</b></span>' +
      '<span class="chip">Target <b>' + m$(N.price) + '</b></span>' +
      '<span class="chip">Saved <b>' + m$(N.saved) + '</b></span>' +
      '<span class="chip">Saving <b>' + m$(N.saveMo) + '/mo</b></span>' +
      '</div>' +
      '<div class="jwiz-nav" style="margin-top:22px">' +
      '<button type="button" class="jwiz-skip" data-jgoto="home">Back to the journey</button>' +
      '<button type="button" class="jbtn" data-jgoto="projector">Next stop: find your path →</button>' +
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

    var maxMo = Math.max.apply(null, R.paths.map(function (p) { return p.mo; }).concat([1]));
    var bars = document.getElementById('jbars');
    if (bars) bars.innerHTML = R.paths.map(function (p) {
      var w = p.mo <= 0 ? 4 : Math.max(6, Math.round(p.mo / maxMo * 100));
      return '<div class="jbar-row"><span class="nm">' + esc(p.name) + '</span>' +
        '<span class="jrail"><span class="jfill' + (p.mo <= 0 ? ' zero' : '') + '" style="width:' + w + '%"></span></span>' +
        '<span class="jbar-val">' + (p.mo <= 0 ? 'now' : p.mo + ' months') + '</span></div>';
    }).join('');

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
      txt += ' The trade-offs: scheme places are limited each year, and a smaller deposit means a larger loan and higher repayments.';
      read.innerHTML = txt;
    }
    track('projector_update', { st: N.state, price: N.price });
  }

  // ── Stop 3: your real budget (native) ────────────────────────────────
  function renderBudget() {
    var box = document.getElementById('jbudget');
    if (!box) return;
    var N = S.numbers, P = S.profile;
    var duty = buyerDuty();
    var html = '';

    html += '<section class="jcard jpad"><span class="jsc jblock">Upfront costs at ' + m$(N.price) + '</span>' +
      '<div class="jstat"><span class="k">Stamp duty (' + N.state.toUpperCase() + (P.fhb ? ', first home buyer' : '') + ')</span><span class="v ' + (duty < 1 ? 'good' : '') + '">' + (duty < 1 ? '$0' : m$(duty)) + '</span></div>' +
      '<div class="jstat"><span class="k">Conveyancing / solicitor</span><span class="v">$1,300–$2,200</span></div>' +
      '<div class="jstat"><span class="k">Building & pest inspection</span><span class="v">$400–$700</span></div>' +
      '<div class="jstat"><span class="k">Title & mortgage registration</span><span class="v">varies by state</span></div>' +
      '<div class="jstat"><span class="k">Loan application / valuation</span><span class="v">$0–$600</span></div>' +
      '<p class="jcaveat" style="margin-top:10px">The solicitor line is the one that surprises everyone — budget for it from day one. Exact registration fees are computed at the deal stage.</p></section>';

    var costs = duty + OTHER_COSTS;
    html += '<section class="jcard jpad"><span class="jsc jblock">What each deposit level needs in cash</span>';
    [[0.05, '5% (scheme path)'], [0.10, '10%'], [0.20, '20%']].forEach(function (d) {
      var need = N.price * d[0] + costs;
      var ok = N.saved >= need;
      var short = need - N.saved;
      html += '<div class="jstat"><span class="k">' + d[1] + ' deposit</span><span class="v ' + (ok ? 'good' : '') + '">' + m$(need) + (ok ? ' — covered' : ' — short ' + m$(short)) + '</span></div>';
    });
    html += '<p class="jcaveat" style="margin-top:10px">Cash needed = deposit + stamp duty + a conservative estimate of legals and registration. Your savings: ' + m$(N.saved) + '.</p></section>';

    if (P.income > 0) {
      var loan95 = N.price * 0.95;
      var assessed = (function () { var r = (RATE + 3) / 100 / 12; return loan95 * r / (1 - Math.pow(1 + r, -TERM)); })();
      var moIncome = P.income / 12;
      var share = assessed / moIncome;
      var label = share <= 0.30 ? 'comfortably inside the common 30%-of-income guide'
        : share <= 0.40 ? 'stretching past the 30%-of-income guide'
          : 'well above the 30%-of-income guide — most lenders would push back';
      html += '<section class="jcard jpad"><span class="jsc jblock">Honest affordability guide</span>' +
        '<p style="font-size:14.5px;line-height:1.6">On a 95% loan, a lender won’t test you at today’s ' + RATE.toFixed(2) + '% — they add a 3% buffer. At ' + (RATE + 3).toFixed(2) + '%, the tested repayment is <b class="mono-strong">' + m$(assessed) + '/mo</b>, which is <b class="mono-strong">' + Math.round(share * 100) + '%</b> of your gross monthly income — ' + label + '.</p>' +
        '<p class="jcaveat" style="margin-top:8px">A guide only — real serviceability depends on expenses, debts and the lender’s own rules. Not financial advice.</p></section>';
    }

    html += '<section class="jcard jpad jdone-row"><div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">You have a real budget.</div></div>' +
      '<button class="jbtn" data-jdone="3">Mark this stop done</button></section>';
    box.innerHTML = html;
  }

  // ── Stop 4: pick your ground (native v1) ─────────────────────────────
  function renderGround() {
    var box = document.getElementById('jground');
    if (!box) return;
    var N = S.numbers;
    var lo = Math.round(N.price * 0.9 / 5000) * 5000, hi = Math.round(N.price * 1.1 / 5000) * 5000;
    box.innerHTML =
      '<section class="jcard jpad"><span class="jsc jblock">Your realistic search band</span>' +
      '<p style="font-size:15px;line-height:1.65">With a target of <b class="mono-strong">' + m$(N.price) + '</b>, shortlist suburbs where typical listings sit between <b class="mono-strong">' + m$(lo) + '</b> and <b class="mono-strong">' + m$(hi) + '</b>. Below the band you’re compromising more than you need to; above it you’re auction fodder.</p></section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Shortlist around your life, not the hype</span>' +
      '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">The best suburb filter isn’t a score — it’s the places your week already happens: work, family, church, the gym, mates. Write down your three non-negotiable places, then look at what’s inside a 20-minute trip of each. That intersection is your search map.</p>' +
      '<p class="jcaveat" style="margin-top:8px">Suburb shortlist tools land here next — price bands per suburb, travel-time filters and current rents from our data.</p></section>' +
      '<section class="jcard jpad jdone-row"><div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">You know where.</div></div>' +
      '<button class="jbtn" data-jdone="4">Mark this stop done</button></section>';
  }

  // ── Stop 5: hunt & compare (native inspection tracker v1) ────────────
  var VERDICTS = ['Looking', 'Shortlist', 'Pass'];
  function renderHunt() {
    var box = document.getElementById('jhunt');
    if (!box) return;
    var rows = S.inspections.map(function (r, i) {
      return '<div class="jinsp">' +
        '<div class="jinsp-main"><div class="jinsp-addr">' + esc(r.addr) + '</div>' +
        '<div class="jinsp-meta">' + (r.price ? m$(r.price) + ' · ' : '') + esc(r.note || '') + '</div></div>' +
        '<button type="button" class="jverdict v' + r.v + '" data-insp-verdict="' + i + '">' + VERDICTS[r.v] + '</button>' +
        '<button type="button" class="jinsp-del" data-insp-del="' + i + '" aria-label="Remove">×</button>' +
        '</div>';
    }).join('');
    box.innerHTML =
      '<section class="jcard jpad"><span class="jsc jblock">Log an inspection</span>' +
      '<form id="jinsp-form" class="jinsp-form">' +
      '<input type="text" id="jinsp-addr" placeholder="12 Example St, Suburb" aria-label="Address" required>' +
      '<input type="text" id="jinsp-price" inputmode="decimal" placeholder="Asking $" aria-label="Asking price">' +
      '<input type="text" id="jinsp-note" placeholder="One honest note (the flaw you noticed)" aria-label="Note">' +
      '<button type="submit" class="jbtn">Add</button>' +
      '</form>' +
      (rows ? '<div class="jinsp-list">' + rows + '</div>' : '<p class="jcaveat" style="margin-top:12px">Nothing logged yet. After every inspection, write the honest note before the car leaves the street — that’s the one you’ll trust later.</p>') +
      '</section>' +
      '<section class="jcard jpad"><span class="jsc jblock">Before any auction</span>' +
      '<p style="font-size:14.5px;line-height:1.65;color:var(--slate)">Set your walk-away number the night before, in writing, when you’re calm — it’s your budget cap from stop 3, not the number the room pushes you to. Auction-day planning tools land here next.</p></section>' +
      '<section class="jcard jpad jdone-row"><div><span class="jsc jsc-sage">Milestone</span><div class="jdone-t">You found it.</div></div>' +
      '<button class="jbtn" data-jdone="5">Mark this stop done</button></section>';
    var f = document.getElementById('jinsp-form');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault();
      var addr = (document.getElementById('jinsp-addr').value || '').trim();
      if (!addr) return;
      S.inspections.unshift({
        addr: addr.slice(0, 120),
        price: parseNum(document.getElementById('jinsp-price').value) || 0,
        note: (document.getElementById('jinsp-note').value || '').trim().slice(0, 160),
        v: 0
      });
      S.inspections = S.inspections.slice(0, 40);
      save(); renderHunt();
      track('journey_inspection_added', {});
    });
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
  function renderDeal() { renderChecklist('jdeal-checks', DEAL_CHECKS, 'dealChecks'); }
  function renderSettle() {
    renderChecklist('jsettle-checks', SETTLE_CHECKS, 'settleChecks');
  }

  // ── View switching + delegated events ────────────────────────────────
  var VIEWS = { home: 'jv-home', wizard: 'jv-wizard', projector: 'jv-projector', budget: 'jv-budget', ground: 'jv-ground', hunt: 'jv-hunt', deal: 'jv-deal', settle: 'jv-settle' };
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
    try { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    track('journey_view', { view: view });
  }

  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-jgoto]');
    if (go) { show(go.getAttribute('data-jgoto')); return; }
    var dn = e.target.closest('[data-jdone]');
    if (dn) { markDone(+dn.getAttribute('data-jdone')); return; }
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
      var val = raw === 'true' ? true : raw === 'false' ? false : raw;
      wSet(q, val);
      wStep++;
      renderWizard();
      return;
    }
    var vb = e.target.closest('[data-insp-verdict]');
    if (vb) {
      var vi = +vb.getAttribute('data-insp-verdict');
      if (S.inspections[vi]) { S.inspections[vi].v = (S.inspections[vi].v + 1) % VERDICTS.length; save(); renderHunt(); }
      return;
    }
    var db = e.target.closest('[data-insp-del]');
    if (db) {
      var di = +db.getAttribute('data-insp-del');
      S.inspections.splice(di, 1); save(); renderHunt();
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList && e.target.classList.contains('jcheck')) { e.preventDefault(); e.target.click(); }
  });

  var done2 = document.getElementById('jdone-2');
  if (done2) done2.addEventListener('click', function () { markDone(2); });

  if (isLoggedIn()) {
    var st = document.getElementById('jsaved-text');
    if (st) st.textContent = 'Progress saves on this device — account sync arrives with the full journey.';
  }

  renderTrail();
  track('journey_view', { view: 'home' });
})();

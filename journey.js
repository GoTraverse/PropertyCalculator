/**
 * journey.js — The First Home Journey (Phase 1a scaffold)
 *
 * The trail (7 stops), the Stop-2 Scheme Pathway Projector, and the Stop-6
 * preview. Design + scope locked in PRODUCT_JOURNEY.md (v3 mockup: stepping
 * stones, no drawn path, house rebrand styling).
 *
 * State: localStorage 'propCalc_journey_v1' (guest-first — same philosophy
 * as the app draft). Account sync lands in Phase 1b.
 *
 * ⚠ SYNC COPY: stateData / calcDuty / FHB concession logic below are copied
 * from tools/stamp-duty-calculator.js (FY2026-27, verified 5 Jul 2026).
 * If duty rates change there, update BOTH files — same rule as the
 * auction-budget calculator's copy. Phase 1b extracts a shared module.
 */
(function () {
  'use strict';

  var KEY = 'propCalc_journey_v1';

  // ── State ────────────────────────────────────────────────────────────
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) return s;
    } catch (e) {}
    return { v: 1, done: {}, numbers: { price: 650000, saved: 60000, saveMo: 2000, state: 'qld' }, dealChecks: [false, false, false, false, false] };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var S = load();

  // Stop 1 auto-completes when the app's onboarding/draft already has a
  // price — the wizard collected their numbers, that IS stop 1.
  try {
    var draft = JSON.parse(localStorage.getItem('propCalc_draft_v1') || 'null');
    var dPrice = draft && draft.state && draft.state.values && parseFloat(String(draft.state.values['inp-price'] || '').replace(/[^0-9.]/g, ''));
    if (dPrice > 0) {
      if (!S.done[1]) S.done[1] = true;
      S.numbers.price = Math.round(dPrice);
      var dSav = parseFloat(String(draft.state.values['inp-savings'] || '').replace(/[^0-9.]/g, ''));
      if (dSav > 0) S.numbers.saved = Math.round(dSav);
      var dState = String(draft.state.values['pd-state'] || '').toLowerCase();
      if (/^(qld|nsw|vic|sa|wa|tas|act|nt)$/.test(dState)) S.numbers.state = dState;
      save();
    }
  } catch (e) {}

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

  // ── The stops ────────────────────────────────────────────────────────
  var STOPS = [
    { n: 1, icon: 'compass', title: 'Get your bearings', blurb: 'Your target price, savings, and situation — the wizard in the calculator collects this.', link: '/app', linkLabel: 'Open the setup wizard' },
    { n: 2, icon: 'signpost', title: 'Find your path', blurb: 'Which government scheme gets you in sooner — and what each really costs. Side by side, for your numbers.', view: 'projector', cta: 'Compare my scheme paths', milestone: 'You know your path.' },
    { n: 3, icon: 'wallet', title: 'Set your real budget', blurb: 'Borrowing power with the bank’s buffer, plus every upfront cost — including the solicitor.', link: '/tools/borrowing-power-calculator', linkLabel: 'Open borrowing power' },
    { n: 4, icon: 'pin', title: 'Pick your ground', blurb: 'Suburbs that fit your budget — and your life.', link: '/invest/qld/', linkLabel: 'Browse suburbs' },
    { n: 5, icon: 'search', title: 'Hunt & compare', blurb: 'Track every inspection, compare properties properly, walk into auctions with a plan.', link: '/app', linkLabel: 'Open your library' },
    { n: 6, icon: 'pen', title: 'Seal the deal', blurb: 'Contract signed — now every deadline matters. Track each one, get nudged before it bites.', view: 'deal' },
    { n: 7, icon: 'key', title: 'Settle & move in', blurb: 'Settlement checklist, final costs, and the keys in your hand.', link: '/app', linkLabel: 'Open the calculator' }
  ];

  function currentStop() {
    for (var i = 0; i < STOPS.length; i++) if (!S.done[STOPS[i].n]) return STOPS[i].n;
    return 7;
  }

  // ── Trail render ─────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderTrail() {
    var cur = currentStop();
    var doneCount = 0; STOPS.forEach(function (s) { if (S.done[s.n]) doneCount++; });
    var lbl = document.getElementById('jprog-label');
    if (lbl) lbl.textContent = 'Stop ' + cur + ' of 7';
    var pct = Math.round(doneCount / 7 * 100);
    var fill = document.getElementById('jprog-fill'); if (fill) fill.style.width = pct + '%';
    var pctEl = document.getElementById('jprog-pct'); if (pctEl) pctEl.textContent = pct + '%';

    var html = STOPS.map(function (s, i) {
      var side = i % 2 === 0 ? 'left' : 'right';
      var stateCls = S.done[s.n] ? 'done' : (s.n === cur ? 'current' : 'ahead');
      var stateLbl = S.done[s.n] ? '<span class="jstate done-t jsc">Done</span>'
        : (s.n === cur ? '<span class="jstate here jsc">You are here</span>'
          : '<span class="jstate jsc">' + (s.n === 7 ? 'The finish' : 'Ahead') + '</span>');
      var inner = stateLbl + '<h3>' + esc(s.title) + '</h3>';
      var isCurrent = s.n === cur && !S.done[s.n];
      if (isCurrent) {
        inner += '<div class="jbody">' + esc(s.blurb) + '</div>';
        if (s.view) {
          inner += '<div class="jcta-row"><span class="jbtn">' + esc(s.cta || 'Open this stop') + '</span><span class="jmins">about 2 minutes</span></div>';
        } else if (s.link) {
          inner += '<div class="jcta-row"><span class="jbtn">' + esc(s.linkLabel) + '</span></div>';
        }
        if (s.milestone) inner += '<div class="jmilestone">' + IC.flag + ' Milestone: ' + esc(s.milestone) + '</div>';
      } else {
        inner += '<p>' + esc(s.blurb) + '</p>';
      }
      var clickable = s.view || s.link;
      var tag = clickable ? 'button' : 'div';
      var attrs = '';
      if (s.view) attrs = ' data-jgoto="' + s.view + '" data-stop="' + s.n + '"';
      else if (s.link) attrs = ' data-jlink="' + esc(s.link) + '" data-stop="' + s.n + '"';
      return '<div class="jstop ' + side + ' ' + stateCls + '">' +
        '<span class="jnode" aria-hidden="true">' + (S.done[s.n] ? IC.check : IC[s.icon]) + '</span>' +
        '<' + tag + ' class="jstopcard"' + attrs + '>' + inner + '</' + tag + '>' +
        '</div>';
    }).join('');
    var trail = document.getElementById('jtrail');
    if (trail) trail.innerHTML = html;
  }

  // ── SYNC COPY: duty engine (from tools/stamp-duty-calculator.js) ─────
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
  // ── end sync copy ────────────────────────────────────────────────────

  var RATE = 6.0, TERM = 360, OTHER_COSTS = 3500; // conveyancing + registration estimate
  function pay(P) { var r = RATE / 100 / 12; return P * r / (1 - Math.pow(1 + r, -TERM)); }
  function lmiRate(lvr) { return lvr <= 0.80 ? 0 : lvr <= 0.85 ? 0.008 : lvr <= 0.90 ? 0.019 : lvr <= 0.95 ? 0.034 : 0.043; }
  function m$(v) { return '$' + Math.round(v).toLocaleString('en-AU'); }
  function parseNum(s) { var n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; }
  function fmtIn(el) { var n = parseNum(el.value); el.value = n ? Math.round(n).toLocaleString('en-AU') : ''; }

  function computePaths() {
    var N = S.numbers, price = N.price, saved = N.saved, saveMo = Math.max(1, N.saveMo), st = N.state;
    var duty = fhbDuty(st, price);
    var mUntil = function (need) { return Math.max(0, Math.ceil((need - saved) / saveMo)); };
    var buyBy = function (mo) {
      if (mo <= 0) return 'Ready now';
      var d = new Date(); d.setMonth(d.getMonth() + mo);
      return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    };
    var out = [];
    function add(name, why, dep, lmi, govShare, extra) {
      var need = dep + duty + OTHER_COSTS;
      var mo = mUntil(need);
      var loan = price - dep - (govShare || 0) + (lmi || 0);
      out.push({ name: name, why: why, mo: mo, buyBy: buyBy(mo), need: need, lmi: lmi || 0, loan: loan, rep: pay(loan), equity: extra });
    }
    add('Save to 20%', 'The classic path — no LMI, smallest loan, longest wait.', price * 0.20, 0);
    add('First Home Guarantee', '5% deposit, the government guarantees the rest — no LMI.', price * 0.05, 0);
    var dep10 = price * 0.10, base10 = price - dep10;
    add('10% deposit + LMI', 'Buy sooner without a scheme place — LMI is added to the loan.', dep10, base10 * lmiRate(base10 / price));
    if (st === 'qld') {
      add('Boost to Buy (QLD)', 'The government takes up to a 30% stake — 2% deposit, a much smaller loan.', price * 0.02, 0, price * 0.30, 'Gov owns 30%');
    }
    // strongest: soonest; tie-break lower LMI, then lower repayment
    var best = out.slice().sort(function (a, b) { return a.mo - b.mo || a.lmi - b.lmi || a.rep - b.rep; })[0];
    out.forEach(function (p) { p.best = (p === best); });
    return { paths: out, duty: duty, best: best };
  }

  function renderProjector() {
    var N = S.numbers;
    var el;
    el = document.getElementById('jn-price'); if (el) el.value = N.price.toLocaleString('en-AU');
    el = document.getElementById('jn-saved'); if (el) el.value = N.saved.toLocaleString('en-AU');
    el = document.getElementById('jn-savemo'); if (el) el.value = N.saveMo.toLocaleString('en-AU');
    el = document.getElementById('jn-state'); if (el) el.value = N.state;

    var R = computePaths();
    var title = document.getElementById('jproj-title');
    if (title) title.textContent = R.paths.length + ' ways to buy your ' + m$(N.price) + ' first home';

    var note = document.getElementById('jduty-note');
    if (note) {
      note.innerHTML = R.duty < 1
        ? 'Stamp duty for an eligible first home buyer in ' + N.state.toUpperCase() + ' at this price: <b>$0</b> — already included in every path below.'
        : 'Estimated first-home-buyer stamp duty in ' + N.state.toUpperCase() + ' at this price: <b>' + m$(R.duty) + '</b> — included in the cash needed for every path.';
    }

    var paths = document.getElementById('jpaths');
    if (paths) paths.innerHTML = R.paths.map(function (p) {
      return '<div class="jpath' + (p.best ? ' best' : '') + '">' +
        (p.best ? '<span class="jflag jsc">Strongest for you</span>' : '') +
        '<h3>' + esc(p.name) + '</h3><div class="jwhy">' + esc(p.why) + '</div>' +
        '<span class="jsc">You could buy</span>' +
        '<div class="jbuyby' + (p.mo <= 0 ? ' now' : '') + '">' + p.buyBy + '</div>' +
        '<div class="jstat"><span class="k">Cash needed</span><span class="v">' + m$(p.need) + '</span></div>' +
        '<div class="jstat"><span class="k">Lenders mortgage insurance</span><span class="v ' + (p.lmi ? 'warn' : 'good') + '">' + (p.lmi ? m$(p.lmi) : '$0') + '</span></div>' +
        '<div class="jstat"><span class="k">Loan</span><span class="v">' + m$(p.loan) + '</span></div>' +
        '<div class="jstat"><span class="k">Repayment</span><span class="v">' + m$(p.rep) + '/mo</span></div>' +
        (p.equity ? '<div class="jstat"><span class="k">Equity share</span><span class="v warn">' + esc(p.equity) + '</span></div>' : '') +
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
      var b = R.best, alt = R.paths.filter(function (p) { return !p.best; }).sort(function (a, b2) { return a.mo - b2.mo; })[0];
      var txt = '<span class="jsc">Our read</span><strong>' + esc(b.name) + ' looks strongest for you.</strong> ';
      if (b.mo <= 0) txt += 'Your savings already cover the cash this path needs — you could start now';
      else txt += 'You could be ready in about ' + b.mo + ' months (' + b.buyBy + ')';
      if (alt) txt += (b.mo <= 0 ? ',' : ' —') + ' versus ' + (alt.mo <= 0 ? 'now' : 'about ' + alt.mo + ' months') + ' on “' + esc(alt.name) + '”. ';
      else txt += '. ';
      txt += b.lmi ? 'It does carry ' + m$(b.lmi) + ' of LMI.' : 'It pays no lenders mortgage insurance.';
      txt += ' The trade-offs: scheme places are capped each year, and a smaller deposit means a larger loan and higher repayments.';
      read.innerHTML = txt;
    }
    track('projector_update', { st: N.state, price: N.price });
  }

  // ── Stop 6 checklist ─────────────────────────────────────────────────
  var DEAL_CHECKS = [
    ['Send the contract to your solicitor', 'Budget $1,300–$2,200 — the cost that surprises everyone'],
    ['Book the building and pest inspection', '$400–$700 · book inside the first week'],
    ['Send the contract to your lender or broker', 'Starts formal approval — don’t wait'],
    ['Confirm your scheme place is locked in', 'The path you chose at stop 2'],
    ['Arrange building insurance from the contract date', 'In Queensland, risk can pass to you at signing']
  ];
  function renderDealChecks() {
    var box = document.getElementById('jdeal-checks');
    if (!box) return;
    box.innerHTML = DEAL_CHECKS.map(function (c, i) {
      var on = !!S.dealChecks[i];
      return '<button type="button" class="jcheck' + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '" data-check="' + i + '">' +
        '<span class="jbox">' + IC.check + '</span><span><span class="t">' + esc(c[0]) + '</span><span class="d" style="display:block">' + esc(c[1]) + '</span></span></button>';
    }).join('');
  }

  // ── View switching + events ──────────────────────────────────────────
  var VIEWS = { home: 'jv-home', projector: 'jv-projector', deal: 'jv-deal' };
  function show(view) {
    Object.keys(VIEWS).forEach(function (k) {
      var el = document.getElementById(VIEWS[k]);
      if (el) el.classList.toggle('active', k === view);
    });
    if (view === 'projector') renderProjector();
    if (view === 'deal') renderDealChecks();
    if (view === 'home') renderTrail();
    try { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    track('journey_view', { view: view });
  }

  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-jgoto]');
    if (go) { show(go.getAttribute('data-jgoto')); return; }
    var link = e.target.closest('[data-jlink]');
    if (link) { window.location.href = link.getAttribute('data-jlink'); return; }
    var chk = e.target.closest('[data-check]');
    if (chk) {
      var i = +chk.getAttribute('data-check');
      S.dealChecks[i] = !S.dealChecks[i];
      save(); renderDealChecks();
      return;
    }
  });

  var form = document.getElementById('jnumbers');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    S.numbers.price = Math.max(50000, parseNum(document.getElementById('jn-price').value) || 650000);
    S.numbers.saved = Math.max(0, parseNum(document.getElementById('jn-saved').value));
    S.numbers.saveMo = Math.max(1, parseNum(document.getElementById('jn-savemo').value) || 1);
    S.numbers.state = document.getElementById('jn-state').value;
    save(); renderProjector();
  });
  ['jn-price', 'jn-saved', 'jn-savemo'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('blur', function () { fmtIn(el); });
  });

  var done2 = document.getElementById('jdone-2');
  if (done2) done2.addEventListener('click', function () {
    S.done[2] = true; save();
    track('journey_step_done', { step: 2 });
    show('home');
  });

  // Signed-in? Adjust the saved-locally line.
  try {
    var sess = JSON.parse(localStorage.getItem('propCalc_session_v1') || 'null');
    if (sess && sess.id) {
      var st = document.getElementById('jsaved-text');
      if (st) st.textContent = 'Progress saves to this device — account sync arrives with the full journey.';
    }
  } catch (e) {}

  renderTrail();
  track('journey_view', { view: 'home' });
})();

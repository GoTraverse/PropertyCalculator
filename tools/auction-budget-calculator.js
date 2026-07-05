/* ═══ AUCTION BUDGET CALCULATOR ═══
 *
 * Pre-auction companion: solves the maximum hammer price ("walk-away price")
 * your funds can support all-in (price + stamp duty + registration fees +
 * conveyancing), renders a funding breakdown, a deposit-day check, an optional
 * suburb-median anchor (from /tools/market-medians.json), a bid-pacing plan
 * and an auction-day checklist. Print button emits a one-page plan.
 */

/* ═══════════════════════════════════════════════════════════════════════
 * SYNC: copied verbatim from stamp-duty-calculator.js (FY2026-27 schedules,
 * verified 5 Jul 2026 vs state revenue offices). If rates change, update BOTH
 * files. Blocks copied: stateData, calcDuty, REG_FEES, applyFhbConcession.
 * Do NOT modify the copied maths.
 * ═══════════════════════════════════════════════════════════════════════ */

/* ═══ STATE DATA ═══
 *
 * Each state is defined as a list of tiers `[from, rate]`, evaluated
 * cumulatively: tier i taxes the portion of dutiable value between
 * tier[i].from and tier[i+1].from at tier[i].rate. The duty payable at
 * value v is therefore:
 *
 *   sum_over_full_tiers(span × rate) + (v − last_full_tier.from) × last_tier.rate
 *
 * `calcDuty()` below implements that. Defining the data this way (instead
 * of inline `formula: function(v) { return base + (v - bracket_min) * rate }`
 * with hand-computed `base` constants) eliminates the bracket-discontinuity
 * bugs that crept into the previous representation — at multiple bracket
 * boundaries duty payable was dropping by hundreds of dollars going up by
 * one cent. See PR #223 follow-up commit and tests/stamp-duty-test.js.
 *
 * Source of rates: state revenue offices, FY 2026–27 published rates as
 * at 5 July 2026. Each state revenue office has the canonical reference; URLs
 * are listed in the `resources` block of each per-state calculator page
 * (e.g. tools/stamp-duty-calculator-nsw.js).
 */
var stateData = {
  // Rates verified against each state revenue office, FY2026-27 (as at 5 Jul 2026).
  // NOTE: VIC ($960k-$2M), ACT (>$1.455M) and NT use flat-of-total or quadratic
  // bands that the simple cumulative-tier model can't express — see calcDuty().
  nsw: {
    name: 'New South Wales', dutyName: 'Transfer Duty', foreignRate: 0.09,
    fhbFull: 800000, fhbPartial: 1000000, fhbExemption: Infinity,
    // Brackets CPI-indexed 1 Jul 2026 (FY2026-27; premium threshold $3,870,000).
    tiers: [
      { from: 0,       rate: 0.0125 },
      { from: 18000,   rate: 0.015  },
      { from: 38000,   rate: 0.0175 },
      { from: 103000,  rate: 0.035  },
      { from: 387000,  rate: 0.045  },
      { from: 1290000, rate: 0.055  },
      { from: 3870000, rate: 0.07   }
    ]
  },
  vic: {
    name: 'Victoria', dutyName: 'Land Transfer Duty', foreignRate: 0.08,
    fhbFull: 600000, fhbPartial: 750000, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0.014 },
      { from: 25000,   rate: 0.024 },
      { from: 130000,  rate: 0.06  }
    ]
  },
  qld: {
    name: 'Queensland', dutyName: 'Transfer Duty', foreignRate: 0.08,
    fhbFull: 700000, fhbPartial: 800000, fhbExemption: Infinity,
    landFhbFull: 350000, landFhbPartial: 500000,
    tiers: [
      { from: 0,        rate: 0      },
      { from: 5000,     rate: 0.015  },
      { from: 75000,    rate: 0.035  },
      { from: 540000,   rate: 0.045  },
      { from: 1000000,  rate: 0.0575 }
    ]
  },
  sa: {
    name: 'South Australia', dutyName: 'Stamp Duty', foreignRate: 0.07,
    // SA first-home relief is for NEW homes / vacant land only (no value taper),
    // so no automatic value-based FHB exemption is applied here.
    fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0.01   },
      { from: 12000,   rate: 0.02   },
      { from: 30000,   rate: 0.03   },
      { from: 50000,   rate: 0.035  },
      { from: 100000,  rate: 0.04   },
      { from: 200000,  rate: 0.0425 },
      { from: 250000,  rate: 0.0475 },
      { from: 300000,  rate: 0.05   },
      { from: 500000,  rate: 0.055  }
    ]
  },
  wa: {
    name: 'Western Australia', dutyName: 'Transfer Duty', foreignRate: 0.07,
    fhbFull: 600000, fhbPartial: 800000, fhbExemption: Infinity, // WA thresholds raised 7 May 2026
    tiers: [
      { from: 0,       rate: 0.019  },
      { from: 120000,  rate: 0.0285 },
      { from: 150000,  rate: 0.038  },
      { from: 360000,  rate: 0.0475 },
      { from: 725000,  rate: 0.0515 }
    ]
  },
  tas: {
    name: 'Tasmania', dutyName: 'Property Transfer Duty', foreignRate: 0.08,
    fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity, // TAS FHB exemption EXPIRED 30 Jun 2026
    tiers: [
      { from: 0,       rate: 0      },
      { from: 3000,    rate: 0.0175 },
      { from: 25000,   rate: 0.0225 },
      { from: 75000,   rate: 0.035  },
      { from: 200000,  rate: 0.04   },
      { from: 375000,  rate: 0.0425 },
      { from: 725000,  rate: 0.045  }
    ]
  },
  act: {
    name: 'Australian Capital Territory', dutyName: 'Conveyance Duty', foreignRate: 0,
    fhbFull: Infinity, fhbPartial: Infinity, fhbExemption: Infinity, // ACT HBCS uncapped from 1 Jul 2026
    tiers: [
      { from: 0,       rate: 0.0028 },
      { from: 260000,  rate: 0.022  },
      { from: 300000,  rate: 0.034  },
      { from: 500000,  rate: 0.0432 },
      { from: 750000,  rate: 0.059  },
      { from: 1000000, rate: 0.064  }
    ]
  },
  nt: {
    name: 'Northern Territory', dutyName: 'Stamp Duty', foreignRate: 0,
    // NT has no value-based FHB duty concession (relief is new-build exemption / grants).
    // Duty is a quadratic under $525k and a flat % of total above — see calcDuty().
    fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
    tiers: []
  }
};

// Cumulative tiered duty calculation. Given a tiers array and a value v,
// taxes each completed span (tiers[i+1].from - tiers[i].from) at tiers[i].rate
// and the residual (v - last_completed.from) at the last applicable rate.
// Continuous by construction — the bracket-cliff bugs in the previous
// hand-rolled formulas cannot recur with this implementation.
function calcDuty(state, v) {
  var data = stateData[state];
  if (!data || v <= 0) return 0;
  // NT: quadratic under $525k, flat % of TOTAL value above (not marginal).
  if (state === 'nt') {
    if (v < 525000) { var Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
    if (v <= 3000000) return v * 0.0495;
    if (v <= 5000000) return v * 0.0575;
    return v * 0.0595;
  }
  // Standard cumulative-marginal tiers.
  var tiers = data.tiers;
  var duty = 0;
  for (var i = 0; i < tiers.length; i++) {
    var from = tiers[i].from;
    if (v <= from) break;
    var nextFrom = (i + 1 < tiers.length) ? tiers[i + 1].from : Infinity;
    duty += (Math.min(v, nextFrom) - from) * tiers[i].rate;
  }
  // Bands that are a flat % of the TOTAL value (not marginal on the excess):
  if (state === 'vic') {
    if (v > 960000 && v <= 2000000) duty = v * 0.055;
    else if (v > 2000000) duty = 110000 + (v - 2000000) * 0.065;
  } else if (state === 'act' && v > 1455000) {
    duty = v * 0.0454;
  } else if (state === 'tas') {
    // $50 minimum is also the base at $3,000 that carries up through every band.
    duty = (v <= 3000) ? 50 : duty + 50;
  }
  return duty;
}

// ── Standard reference (FY 2026-27) ───────────────────────────────────────
// Mortgage registration fees + title transfer fees by state. These are
// nominal in dollar terms ($150-600 typically) but every legitimate
// upfront-cost calculator includes them. Values from state title office
// fee schedules; verify before settlement.
var REG_FEES = {
  nsw: { mortgage: 185, transfer: 185 },
  vic: { mortgage: 123, transfer: 124 },
  qld: { mortgage: 232, transfer: 250 },
  sa:  { mortgage: 200, transfer: 230 },
  wa:  { mortgage: 190, transfer: 200 },
  tas: { mortgage: 150, transfer: 250 },
  act: { mortgage: 200, transfer: 200 },
  nt:  { mortgage: 200, transfer: 200 }
};

// Apply FHB exemption / partial concession given a state's policy
function applyFhbConcession(state, val, baseDuty) {
  var data = stateData[state];
  if (!data) return { duty: baseDuty, note: '' };
  if (val <= data.fhbFull) {
    var ex = Math.min(data.fhbExemption || Infinity, baseDuty);
    return { duty: Math.max(0, baseDuty - ex), note: 'First home buyer exemption applied.' };
  }
  if (val <= data.fhbPartial && data.fhbPartial > data.fhbFull) {
    var slide = (data.fhbPartial - val) / (data.fhbPartial - data.fhbFull);
    return { duty: Math.max(0, baseDuty * (1 - slide)), note: 'First home buyer partial concession applied.' };
  }
  return { duty: baseDuty, note: '' };
}

/* ═══ END of blocks copied from stamp-duty-calculator.js ═══ */


/* ═══ MARKET MEDIANS (optional suburb anchor) ═══
 * Fetched from /tools/market-medians.json. Coverage is honestly partial:
 * VIC = house+unit SALE medians, QLD = weekly RENT medians only (no free
 * public sale-price data exists for QLD), SA = rent + metro-Adelaide house
 * sale medians. Other states: not in the file yet — the tool degrades
 * gracefully and the plan renders without an anchor. */
var _medians = null;
var _mediansFailed = false;
var _lastWalkAway = 0;

function _normSuburb(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function _titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|\s)([a-z])/g, function (m, sp, c) { return sp + c.toUpperCase(); });
}

// "as at {period}, {source}" caption for a key in the medians `sources` map.
function _srcCaption(key) {
  if (!_medians || !_medians.sources || !_medians.sources[key]) return '';
  var s = _medians.sources[key];
  var cap = 'as at ' + (s.period || 'n/a') + ', ' + (s.source || 'unknown source');
  if (s.note) cap += ' (' + s.note + ')';
  return cap;
}

function populateSuburbList() {
  var dl = document.getElementById('suburb-list');
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);
  if (!_medians || !_medians.states) return;
  var st = (document.getElementById('state').value || '').toUpperCase();
  var map = _medians.states[st];
  if (!map) return;
  Object.keys(map).sort().forEach(function (name) {
    var opt = document.createElement('option');
    opt.value = _titleCase(name);
    dl.appendChild(opt);
  });
}

var _SUBURB_HINTS = {
  vic: 'VIC data: median house + unit sale prices (Valuer-General Victoria, 2025 preliminary). No rent data yet.',
  qld: 'QLD data: current median weekly rents only (RTA, Mar 2026). No free public sale-price data exists for QLD.',
  sa: 'SA data: median weekly rents (Jan–Mar 2026) + median house sale prices for metro Adelaide (Q1 2026).',
  tas: 'TAS data: suburb median weekly rents (12 months of bond lodgements, Dept of Justice). No free public sale prices.'
};

function updateSuburbHint() {
  var el = document.getElementById('suburb-hint');
  if (!el) return;
  if (_mediansFailed) {
    el.textContent = 'Market medians are unavailable right now — the plan works without them.';
    return;
  }
  var st = document.getElementById('state').value;
  el.textContent = _SUBURB_HINTS[st] ||
    'No free public median data for this state yet — the anchor is optional; your plan works without it.';
}

function loadMedians() {
  if (!window.fetch) { _mediansFailed = true; updateSuburbHint(); return; }
  fetch('/tools/market-medians.json?v=2026Q2b').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (j) {
    _medians = j || null;
    populateSuburbList();
    updateSuburbHint();
    renderMedianAnchor(); // refresh the anchor if a result is already on screen
  }).catch(function () {
    _mediansFailed = true;
    updateSuburbHint();
  });
}

function _callout(cls, tag, innerHtml) {
  return '<div class="' + cls + '"><span class="mort-callout-tag">' + escHtml(tag) + '</span>' +
    '<span class="mort-callout-text">' + innerHtml + '</span></div>';
}

function renderMedianAnchor() {
  var box = document.getElementById('median-anchor');
  if (!box) return;
  var subEl = document.getElementById('suburb');
  var typed = subEl ? subEl.value.replace(/\s+/g, ' ').trim() : '';
  var resultEl = document.getElementById('result');
  var resultShown = resultEl && resultEl.style.display !== 'none';
  if (!typed || !_lastWalkAway || !resultShown) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  var W = _lastWalkAway;
  var SC = (document.getElementById('state').value || '').toUpperCase();
  var disp = escHtml(_titleCase(typed));

  if (!_medians || !_medians.states) {
    box.innerHTML = _callout('mort-callout', 'Suburb anchor', _mediansFailed
      ? 'Market medians are unavailable right now — your plan above is unaffected.'
      : 'Loading market medians…');
    box.style.display = '';
    return;
  }

  var map = _medians.states[SC];
  if (!map) {
    box.innerHTML = _callout('mort-callout', 'Suburb anchor',
      'There’s no free public median data for ' + escHtml(SC) + ' in our file yet, so we can’t show an anchor for ' +
      disp + '. Judge value the manual way: recent comparable sales, days on market, and an independent valuation if in doubt.');
    box.style.display = '';
    return;
  }

  var rec = map[_normSuburb(typed)];
  if (!rec) {
    box.innerHTML = _callout('mort-callout', 'Suburb anchor',
      'We don’t have ' + disp + ' in the current ' + escHtml(SC) +
      ' data set. Pick a suggestion from the list, or skip the anchor — the plan above is unaffected.');
    box.style.display = '';
    return;
  }

  var parts = [];
  var priceKey = SC + '_price';
  var rentKey = SC + '_rent';
  var anchor = null;
  if (typeof rec.h === 'number') anchor = { v: rec.h, label: 'house' };
  else if (typeof rec.u === 'number') anchor = { v: rec.u, label: 'unit' };

  if (anchor) {
    var pct = ((W - anchor.v) / anchor.v) * 100;
    var rel = Math.abs(pct) < 0.5 ? 'right on' : (Math.abs(pct).toFixed(0) + '% ' + (pct < 0 ? 'below' : 'above'));
    parts.push('<strong>' + disp + ' median ' + anchor.label + ' sale price: ' + fmt(anchor.v) + '</strong> — ' +
      escHtml(_srcCaption(priceKey)) + '. Your walk-away price (' + fmt(W) + ') sits ' + rel +
      ' this median — the market’s reference point, not a valuation of any specific property.');
    if (anchor.label === 'house' && typeof rec.u === 'number') {
      parts.push('Median unit sale price: ' + fmt(rec.u) + '.');
    }
  }
  if (typeof rec.r === 'number') {
    parts.push('Median weekly rent: $' + Math.round(rec.r).toLocaleString() + '/wk — ' + escHtml(_srcCaption(rentKey)) + '.');
  }
  if (!anchor && typeof rec.r === 'number') {
    parts.push('No free public sale-price data exists for ' + escHtml(SC) +
      ', so there’s no price anchor to compare your walk-away figure against — use recent comparable sales, or an independent valuation.');
  }

  if (!parts.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.innerHTML = _callout('mort-callout', 'Suburb anchor', parts.join(' '));
  box.style.display = '';
}


/* ═══ WALK-AWAY SOLVER ═══ */

// All-in cost of buying at hammer price P (duty computed on P, with FHB
// concession when ticked). Monotonically increasing in P for every state
// (duty only ever steps UP at concession cliffs), so binary search is safe.
function _allInAt(state, P, fhb, regTotal, legal) {
  var base = calcDuty(state, P);
  var duty = fhb ? applyFhbConcession(state, P, base).duty : base;
  return P + duty + regTotal + legal;
}

// Largest feasible hammer price: usableSavings + preapproval >= all-in cost.
// Rounded DOWN to the nearest $1,000 — a walk-away price is never optimistic.
function solveWalkAway(funds, state, fhb, regTotal, legal) {
  if (funds <= regTotal + legal) return 0;
  var lo = 0, hi = funds;
  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2;
    if (_allInAt(state, mid, fhb, regTotal, legal) <= funds) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}


/* ═══ BID PLAN ═══ */

function renderBidPlan(W) {
  var body = document.getElementById('bid-plan-body');
  if (!body) return;
  var open = Math.max(0, Math.floor((W * 0.9) / 1000) * 1000);
  var html = '<tr><td>Likely opening</td><td>~' + fmt(open) + '</td><td>—</td>' +
    '<td>Auctions often open around 10% under where they finish</td></tr>';
  var bands = [
    { label: 'Early bidding', to: W - 50000, inc: 20000, note: 'Prompt, confident, round numbers' },
    { label: 'Mid auction', to: W - 20000, inc: 10000, note: 'Hold a steady rhythm' },
    { label: 'Approaching your ceiling', to: W - 10000, inc: 5000, note: 'Slow the tempo' },
    { label: 'Final approach', to: W - 4000, inc: 2000, note: 'Odd, deliberate amounts' },
    { label: 'Last bids', to: W, inc: 1000, note: 'Stop at ' + fmt(W) + ' — no exceptions' }
  ];
  var from = open;
  bands.forEach(function (b) {
    if (b.to <= from || b.to <= 0) return;
    html += '<tr><td>' + b.label + '</td><td>' + fmt(Math.max(0, from)) + ' – ' + fmt(b.to) + '</td>' +
      '<td>' + fmt(b.inc) + '</td><td>' + b.note + '</td></tr>';
    from = b.to;
  });
  body.innerHTML = html;
}


/* ═══ MAIN CALC ═══ */

var _isInit = true;

function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t) { if (_msg) { _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var state = document.getElementById('state').value;
  var data = stateData[state];
  if (!data) return;
  var fhb = document.getElementById('fhb').checked;
  var savings = parseVal('savings');
  var preapproval = parseVal('preapproval');
  var legal = parseVal('legal');
  var bufEl = document.getElementById('buffer');
  var bufPct = parseFloat(bufEl ? bufEl.value : '5');
  if (!isFinite(bufPct) || bufPct < 0) bufPct = 0;
  if (bufPct > 90) bufPct = 90;

  if (savings <= 0 && preapproval <= 0) {
    if (!_isInit) _showErr('Enter your cash savings and/or your loan pre-approval amount.');
    return;
  }

  var bufferKept = savings * (bufPct / 100);
  var usable = savings - bufferKept;
  var funds = usable + preapproval;
  var reg = REG_FEES[state] || { mortgage: 200, transfer: 200 };
  var regTotal = reg.mortgage + reg.transfer;

  var W = solveWalkAway(funds, state, fhb, regTotal, legal);
  if (W <= 0) {
    if (!_isInit) _showErr('Your usable funds don’t cover the fixed purchase costs yet — add savings or pre-approval, or lower the buffer.');
    return;
  }

  var baseDuty = calcDuty(state, W);
  var dres = fhb ? applyFhbConcession(state, W, baseDuty) : { duty: baseDuty, note: '' };
  var duty = dres.duty;
  var allIn = W + duty + regTotal + legal;
  var loanUsed = Math.min(preapproval, allIn);
  var cashUsed = Math.max(0, allIn - loanUsed);
  var dep10 = W * 0.10;

  _lastWalkAway = W;

  // ── Hero + breakdown ──
  setText('r-walkaway', fmt(W));
  setText('r-hammer', fmt(W));
  var dutyLabelEl = document.getElementById('r-duty-label');
  if (dutyLabelEl) dutyLabelEl.textContent = data.dutyName + ' — ' + data.name;
  setText('r-duty', fmt(duty));
  var noteEl = document.getElementById('r-duty-note');
  if (noteEl) {
    noteEl.textContent = dres.note || '';
    noteEl.style.display = dres.note ? '' : 'none';
  }
  setText('r-reg', fmt(regTotal) + ' (mortgage $' + reg.mortgage + ' + transfer $' + reg.transfer + ')');
  setText('r-legal', fmt(legal));
  setText('r-allin', fmt(allIn));
  setText('r-loan', fmt(loanUsed));
  setText('r-cash', fmt(cashUsed));
  setText('r-buffer', fmt(bufferKept));

  // ── Deposit-on-the-day check ──
  var depBox = document.getElementById('deposit-callout');
  if (depBox) {
    if (usable >= dep10) {
      depBox.innerHTML = _callout('mort-callout', 'Deposit check',
        'Auctions are unconditional — a 10% deposit (' + fmt(dep10) +
        ' at your walk-away price) is typically payable on the day. Your usable savings (' + fmt(usable) +
        ') cover it. Confirm the payment method (bank cheque or transfer) with the agent and your bank before auction day.');
    } else {
      depBox.innerHTML = _callout('mort-callout mort-callout-gold', 'Deposit check',
        'A 10% deposit at your walk-away price is ' + fmt(dep10) +
        ', but your usable savings after the buffer are only ' + fmt(usable) +
        '. Auctions are unconditional and the deposit is typically payable on the day — arrange this with your lender and the agent BEFORE auction day (a reduced deposit or a deposit bond can sometimes be agreed in advance). Do not turn up hoping to sort it out after the hammer.');
    }
  }

  renderMedianAnchor();
  renderBidPlan(W);

  var disc = document.getElementById('disclaimer');
  if (disc) disc.textContent = 'Estimates only. ' + data.dutyName + ' is based on ' + data.name +
    ' FY2026-27 schedules (verified 5 Jul 2026); registration and conveyancing figures are indicative — verify with your conveyancer and state revenue office. Your lender’s formal approval, valuation and LVR limits can reduce what you can actually borrow. General information — not financial advice.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    var cta = document.getElementById('cta');
    if (cta) cta.style.display = '';
    if (window.trackCalculatorResult) trackCalculatorResult('auction-budget', {
      walkAwayPrice: W,
      stampDuty: Math.round(duty),
      allIn: Math.round(allIn),
      state: state,
      isFHB: fhb,
      savings: savings,
      preapproval: preapproval
    });
  }
}


/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'auction-budget',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full purchase before you bid',
    description: 'Stack stamp duty, LMI, repayments and a 30-year projection for the property you’re bidding on — free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State Revenue Offices',
        links: [
          { text: 'NSW Transfer Duty', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'VIC Land Transfer Duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'QLD Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'SA Stamp Duty', href: 'https://www.revenuesa.sa.gov.au/stampduty' },
          { text: 'WA Transfer Duty', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty' }
        ]
      },
      {
        icon: '\u2696\uFE0F', title: 'Auction Rules & Consumer Affairs',
        links: [
          { text: 'NSW Fair Trading: Buying property at auction', href: 'https://www.fairtrading.nsw.gov.au/housing-and-property/buying-and-selling-property/buying-a-property/buying-property-at-auction' },
          { text: 'Consumer Affairs Victoria: Buying & selling property', href: 'https://www.consumer.vic.gov.au/housing/buying-and-selling-property' },
          { text: 'QLD Government: Buying & owning a home', href: 'https://www.qld.gov.au/housing/buying-owning-home' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Money & Finance Guidance',
        links: [
          { text: 'Moneysmart: Buying a house', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Moneysmart: Home loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'First Home Guarantee (Housing Australia)', href: 'https://www.housingaustralia.gov.au/support-buy-home/first-home-guarantee' }
        ]
      }
    ],
    disclaimer: 'General information only — not financial or legal advice. Auction rules and duty rates change; confirm current rules with your state’s consumer affairs body and revenue office before auction day.'
  },
  share: {
    url: 'https://equitysight.app/tools/auction-budget-calculator',
    text: 'I just set my auction walk-away price — walking in with a plan.'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Stamp Duty' },
    { href: '/tools/borrowing-power-calculator', icon: '\uD83C\uDFE6', label: 'Borrowing Power' },
    { href: '/tools/deposit-calculator', icon: '\uD83E\uDE99', label: 'Deposit Calculator' },
    { href: '/tools/listing-price-checker', icon: '\uD83D\uDCCA', label: 'Listing Price Checker' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/', text: 'All Calculators' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/borrowing-power-calculator', text: 'Borrowing Power' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'VIC — savings $120,000, pre-approval $560,000, 5% buffer',
      inputs: [
        { k: 'Cash savings', v: '$120,000' },
        { k: 'Loan pre-approval', v: '$560,000' },
        { k: 'Safety buffer', v: '5% ($6,000 kept aside)' },
        { k: 'State / FHB', v: 'Victoria / No' },
        { k: 'Conveyancing', v: '$1,800' }
      ],
      outputs: [
        { k: 'Walk-away price', v: '$638,000' },
        { k: 'Land transfer duty (VIC)', v: '~$33,350' },
        { k: 'Total all-in cost', v: '~$673,400' },
        { k: 'Cash at settlement', v: '~$113,400' }
      ]
    },
    {
      label: 'QLD — first home buyer, savings $90,000, pre-approval $480,000',
      inputs: [
        { k: 'Cash savings', v: '$90,000' },
        { k: 'Loan pre-approval', v: '$480,000' },
        { k: 'Safety buffer', v: '5% ($4,500 kept aside)' },
        { k: 'State / FHB', v: 'Queensland / Yes' },
        { k: 'Conveyancing', v: '$1,800' }
      ],
      outputs: [
        { k: 'Walk-away price', v: '$563,000' },
        { k: 'Transfer duty', v: '$0 (QLD FHB concession ≤ $700k)' },
        { k: 'Total all-in cost', v: '~$565,300' },
        { k: '10% deposit on the day', v: '~$56,300' }
      ]
    }
  ],
  faq: [
    { q: 'Is the 10% deposit really due on auction day?',
      a: 'Yes — if you are the winning bidder you sign the contract and pay the deposit (usually 10% of the purchase price) immediately after the hammer falls. A smaller deposit can sometimes be negotiated with the vendor’s agent before auction day, but never assume it on the day. Arrange the payment method (bank cheque or transfer) with your bank and the agent in advance.' },
    { q: 'Can I bid past my loan pre-approval?',
      a: 'Legally yes, but you are gambling with your deposit. Pre-approval is not a guarantee of finance — if your lender won’t extend the extra amount, or their valuation comes in below your winning bid, you may be unable to settle. You can lose your 10% deposit and be sued for the vendor’s losses on a resale.' },
    { q: 'Do I get a cooling-off period when I buy at auction?',
      a: 'No. In every Australian state and territory, auction sales are exempt from statutory cooling-off. In several states the exemption also extends to contracts signed shortly before or after the auction. The contract is unconditional the moment the hammer falls.' },
    { q: 'What happens if the property passes in?',
      a: 'If bidding doesn’t reach the vendor’s reserve the property is passed in. The highest bidder usually gets the first right to negotiate with the vendor immediately afterwards. Your walk-away price still applies in that negotiation — a pass-in doesn’t make the property cheaper to own.' },
    { q: 'How accurate is the stamp duty figure?',
      a: 'Duty is computed from FY 2026-27 schedules for all eight Australian states and territories, including first home buyer concessions, verified against each state revenue office. It is still an estimate — confirm your exact assessment with your conveyancer or state revenue office before settlement.' },
    { q: 'Why keep a safety buffer?',
      a: 'Buying at auction is unconditional, and ownership generates immediate costs — moving, repairs, rates adjustments — plus the ongoing risk of rate rises. Spending your last dollar at the hammer leaves nothing for the first surprise. Many buyers keep 5–10% of savings untouched.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power Calculator' },
    { group: 'Other Tools', icon: '\uD83E\uDE99', href: '/tools/deposit-calculator', label: 'Deposit Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/listing-price-checker', label: 'Listing Price Checker' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/vic/', label: 'Victoria Suburb Guide' }
  ]
});


/* ═══ EVENT WIRING ═══ */

window.addEventListener('DOMContentLoaded', function () {
  if (window.trackCalculatorStart) trackCalculatorStart('auction-budget');
  updateSuburbHint();
  loadMedians();
  calculate();
  _isInit = false;

  ['savings', 'preapproval', 'legal'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { fmtInput(this); calculate(); });
  });

  var bufEl = document.getElementById('buffer');
  if (bufEl) bufEl.addEventListener('input', calculate);

  var stateEl = document.getElementById('state');
  if (stateEl) stateEl.addEventListener('change', function () {
    populateSuburbList();
    updateSuburbHint();
    calculate();
  });

  var fhbEl = document.getElementById('fhb');
  if (fhbEl) fhbEl.addEventListener('change', calculate);

  // Suburb only affects the anchor callout — no need to re-solve the price.
  var subEl = document.getElementById('suburb');
  if (subEl) subEl.addEventListener('input', renderMedianAnchor);

  var calcBtn = document.getElementById('calc-btn');
  if (calcBtn) calcBtn.addEventListener('click', function () {
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', { 'calculator': 'auction-budget' });
    calculate();
  });

  var printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.addEventListener('click', function () {
    if (window.trackPageEvent) trackPageEvent('auction_plan_print', { 'calculator': 'auction-budget' });
    window.print();
  });
});

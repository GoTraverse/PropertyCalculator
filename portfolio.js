/* ═══ PORTFOLIO TRACKER — /portfolio ═══
 *
 * Product frame (owner-locked): "Portfolio stores all your properties;
 * Scenarios is a way to visualise it and try new things."
 *
 * Server contract: POST /.netlify/functions/portfolio
 *   {action:'list'|'save'|'delete', holding?, id?}
 *   → {ok:true, holdings:[...], cap:{max,used,plan}}
 *   → {ok:false, error:'auth'|'cap'|'validation'|...}
 * Cookie auth (es_session) is automatic (credentials same-origin); guests
 * get error:'auth'. Free = 2 holdings, Pro = unlimited — the SERVER enforces
 * the cap; this UI just renders the upgrade prompt on a 'cap' response.
 *
 * All property values are the user's MANUAL entries. Government suburb
 * medians are shown as labelled CONTEXT only — never as the property's value.
 */

/* ══════════════════════════════════════════════════════════════════════
   HELPERS — copied from tools/tool-page.js (that file is for /tools pages
   and runs ToolPage.init, so root pages copy the small utilities instead).
   ══════════════════════════════════════════════════════════════════════ */

/** Escape HTML to prevent XSS */
function escHtml(text) {
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
}

/** Format number as $X,XXX */
function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

/** Format an input element's value with commas as user types */
function fmtInput(el) {
  var v = el.value.replace(/[^0-9]/g, '');
  el.value = v ? parseInt(v).toLocaleString() : '';
}

/** Parse a DOM element's value to number by ID (handles commas) */
function parseVal(id) {
  return parseFloat((document.getElementById(id).value || '0').replace(/,/g, '')) || 0;
}

/** Monthly mortgage repayment (P&I or interest-only) */
function monthlyRepayment(principal, annualRate, years, interestOnly) {
  if (interestOnly) return principal * (annualRate / 100 / 12);
  var r = annualRate / 100 / 12;
  var n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/* Signed currency (from tools/property-cashflow-calculator.js) —
 * renders -8595 as −$8,595 rather than $-8,595. */
function fmtS(n) {
  var r = Math.round(n);
  return (r < 0 ? '−$' : '$') + Math.abs(r).toLocaleString();
}

/* ══════════════════════════════════════════════════════════════════════
   LAND TAX SCHEDULES
   SYNC: copied verbatim from tools/land-tax-calculator.js — update BOTH
   files when rates change; verified FY2026-27 5 Jul 2026.
   Each returns { tax, threshold, band, mRate, mNote }.
   ══════════════════════════════════════════════════════════════════════ */

function ltR(tax, threshold, band, mRate, mNote) {
  return { tax: tax, threshold: threshold, band: band, mRate: mRate, mNote: mNote || null };
}

function schedNSW(V, otype) {
  if (otype === 'trust') {
    var tt = 'None — special/discretionary trusts have no NSW threshold';
    if (V <= 6571000) return ltR(0.016 * V, tt, 'Special trust: 1.6% of the entire land value', 0.016);
    return ltR(105136 + 0.02 * (V - 6571000), tt, 'Special trust above $6,571,000: $105,136 + 2% of the excess', 0.02);
  }
  var th = '$1,075,000 (general — individuals, companies & fixed trusts)';
  if (V <= 1075000) return ltR(0, th, 'At or below the general threshold — no land tax', 0, '0% until $1,075,000 (then $100 + 1.6% of the excess)');
  if (V <= 6571000) return ltR(100 + 0.016 * (V - 1075000), th, 'General: $100 + 1.6% of the value above $1,075,000', 0.016);
  return ltR(88036 + 0.02 * (V - 6571000), th, 'Premium: $88,036 + 2% of the value above $6,571,000', 0.02);
}

function schedVIC(V, otype) {
  if (otype === 'trust') {
    var tt = '$25,000 (VIC trust surcharge scale)';
    if (V < 25000) return ltR(0, tt, 'Below the trust threshold — no land tax', 0, '0% until $25,000');
    if (V < 50000) return ltR(82 + 0.00375 * (V - 25000), tt, '$25,000–<$50,000 (trust): $82 + 0.375% of the excess', 0.00375);
    if (V < 100000) return ltR(676 + 0.00375 * (V - 50000), tt, '$50,000–<$100,000 (trust): $676 + 0.375% of the excess', 0.00375);
    if (V < 250000) return ltR(1338 + 0.00375 * (V - 100000), tt, '$100,000–<$250,000 (trust): $1,338 + 0.375% of the excess', 0.00375);
    if (V < 600000) return ltR(1901 + 0.00675 * (V - 250000), tt, '$250,000–<$600,000 (trust): $1,901 + 0.675% of the excess', 0.00675);
    if (V < 1000000) return ltR(4263 + 0.00975 * (V - 600000), tt, '$600,000–<$1,000,000 (trust): $4,263 + 0.975% of the excess', 0.00975);
    if (V < 1800000) return ltR(8163 + 0.01275 * (V - 1000000), tt, '$1,000,000–<$1,800,000 (trust): $8,163 + 1.275% of the excess', 0.01275);
    if (V < 3000000) return ltR(18363 + 0.011072 * (V - 1800000), tt, '$1,800,000–<$3,000,000 (trust): $18,363 + 1.1072% of the excess', 0.011072);
    return ltR(31650 + 0.0265 * (V - 3000000), tt, '$3,000,000+ (trust converges with general): $31,650 + 2.65% of the excess', 0.0265);
  }
  var th = '$50,000 (general)';
  if (V < 50000) return ltR(0, th, 'Below $50,000 — no land tax', 0, '0% until $50,000');
  if (V < 100000) return ltR(500, th, '$50,000–<$100,000: flat $500', 0, 'Flat $500 across this band — $0 on the next dollar until $100,000');
  if (V < 300000) return ltR(975, th, '$100,000–<$300,000: flat $975', 0, 'Flat $975 across this band — $0 on the next dollar until $300,000');
  if (V < 600000) return ltR(1350 + 0.003 * (V - 300000), th, '$300,000–<$600,000: $1,350 + 0.3% of the excess', 0.003);
  if (V < 1000000) return ltR(2250 + 0.006 * (V - 600000), th, '$600,000–<$1,000,000: $2,250 + 0.6% of the excess', 0.006);
  if (V < 1800000) return ltR(4650 + 0.009 * (V - 1000000), th, '$1,000,000–<$1,800,000: $4,650 + 0.9% of the excess', 0.009);
  if (V < 3000000) return ltR(11850 + 0.0165 * (V - 1800000), th, '$1,800,000–<$3,000,000: $11,850 + 1.65% of the excess', 0.0165);
  return ltR(31650 + 0.0265 * (V - 3000000), th, '$3,000,000+: $31,650 + 2.65% of the excess', 0.0265);
}

function schedQLD(V, otype) {
  if (otype === 'individual') {
    var th = '$600,000 (resident individuals)';
    if (V < 600000) return ltR(0, th, 'Below $600,000 — no land tax', 0, '0% until $600,000');
    if (V < 1000000) return ltR(500 + 0.01 * (V - 600000), th, '$600,000–<$1,000,000: $500 + 1.0c per $1 of the excess', 0.01);
    if (V < 3000000) return ltR(4500 + 0.0165 * (V - 1000000), th, '$1,000,000–<$3,000,000: $4,500 + 1.65c per $1 of the excess', 0.0165);
    if (V < 5000000) return ltR(37500 + 0.0125 * (V - 3000000), th, '$3,000,000–<$5,000,000: $37,500 + 1.25c per $1 of the excess', 0.0125);
    if (V < 10000000) return ltR(62500 + 0.0175 * (V - 5000000), th, '$5,000,000–<$10,000,000: $62,500 + 1.75c per $1 of the excess', 0.0175);
    return ltR(150000 + 0.0225 * (V - 10000000), th, '$10,000,000+: $150,000 + 2.25c per $1 of the excess', 0.0225);
  }
  // Companies & trustees — absentees share the first three bands but have
  // different top bands (2.0c / 2.5c instead of 2.25c / 2.75c).
  var isAbs = (otype === 'foreign');
  var th2 = '$350,000 (' + (isAbs ? 'absentee/foreign schedule' : 'companies & trustees') + ')';
  if (V < 350000) return ltR(0, th2, 'Below $350,000 — no land tax', 0, '0% until $350,000');
  if (V < 2250000) return ltR(1450 + 0.017 * (V - 350000), th2, '$350,000–<$2,250,000: $1,450 + 1.7c per $1 of the excess', 0.017);
  if (V < 5000000) return ltR(33750 + 0.015 * (V - 2250000), th2, '$2,250,000–<$5,000,000: $33,750 + 1.5c per $1 of the excess', 0.015);
  if (isAbs) {
    if (V < 10000000) return ltR(75000 + 0.02 * (V - 5000000), th2, '$5,000,000–<$10,000,000 (absentee): $75,000 + 2.0c per $1 of the excess', 0.02);
    return ltR(175000 + 0.025 * (V - 10000000), th2, '$10,000,000+ (absentee): $175,000 + 2.5c per $1 of the excess', 0.025);
  }
  if (V < 10000000) return ltR(75000 + 0.0225 * (V - 5000000), th2, '$5,000,000–<$10,000,000: $75,000 + 2.25c per $1 of the excess', 0.0225);
  return ltR(187500 + 0.0275 * (V - 10000000), th2, '$10,000,000+: $187,500 + 2.75c per $1 of the excess', 0.0275);
}

// SA computes tax per "$100 or part of $100" — the excess over the band
// floor is rounded UP to whole hundreds before the per-$100 rate applies.
function saHundreds(excess) { return Math.ceil(excess / 100); }

function schedSA(V, otype) {
  if (otype === 'trust') {
    var tt = '$25,000 (SA trust scale, 2026-27)';
    if (V <= 25000) return ltR(0, tt, 'At or below $25,000 — no land tax', 0, '0% until $25,000');
    if (V <= 936000) return ltR(125 + 0.5 * saHundreds(V - 25000), tt, '$25,000–$936,000 (trust): $125 + $0.50 per $100 or part above $25,000', null, '$0.50 per $100 or part (≈ 0.5%)');
    if (V <= 1504000) return ltR(4680 + 1.0 * saHundreds(V - 936000), tt, '$936,000–$1,504,000 (trust): $4,680 + $1.00 per $100 or part above $936,000', null, '$1.00 per $100 or part (≈ 1.0%)');
    if (V <= 2188000) return ltR(10360 + 1.5 * saHundreds(V - 1504000), tt, '$1,504,000–$2,188,000 (trust): $10,360 + $1.50 per $100 or part above $1,504,000', null, '$1.50 per $100 or part (≈ 1.5%)');
    if (V <= 3504000) return ltR(20620 + 2.4 * saHundreds(V - 2188000), tt, '$2,188,000–$3,504,000 (trust): $20,620 + $2.40 per $100 or part above $2,188,000', null, '$2.40 per $100 or part (≈ 2.4%)');
    return ltR(52204 + 2.4 * saHundreds(V - 3504000), tt, 'Above $3,504,000 (trust): $52,204 + $2.40 per $100 or part above $3,504,000', null, '$2.40 per $100 or part (≈ 2.4%)');
  }
  var th = '$936,000 (general, 2026-27)';
  if (V <= 936000) return ltR(0, th, 'At or below $936,000 — no land tax', 0, '0% until $936,000');
  if (V <= 1504000) return ltR(0.5 * saHundreds(V - 936000), th, '$936,000–$1,504,000: $0.50 per $100 or part above $936,000', null, '$0.50 per $100 or part (≈ 0.5%)');
  if (V <= 2188000) return ltR(2840 + 1.0 * saHundreds(V - 1504000), th, '$1,504,000–$2,188,000: $2,840 + $1.00 per $100 or part above $1,504,000', null, '$1.00 per $100 or part (≈ 1.0%)');
  if (V <= 3504000) return ltR(9680 + 2.0 * saHundreds(V - 2188000), th, '$2,188,000–$3,504,000: $9,680 + $2.00 per $100 or part above $2,188,000', null, '$2.00 per $100 or part (≈ 2.0%)');
  return ltR(36000 + 2.4 * saHundreds(V - 3504000), th, 'Above $3,504,000: $36,000 + $2.40 per $100 or part above $3,504,000', null, '$2.40 per $100 or part (≈ 2.4%)');
}

function schedWA(V) {
  var th = '$300,000 (single scale for all owner types)';
  if (V <= 300000) return ltR(0, th, 'At or below $300,000 — no land tax', 0, '0% until $300,000');
  if (V <= 420000) return ltR(300, th, '$300,001–$420,000: flat $300', 0, 'Flat $300 across this band — $0 on the next dollar until $420,000');
  if (V <= 1000000) return ltR(300 + 0.0025 * (V - 420000), th, '$420,001–$1,000,000: $300 + 0.25c per $1 above $420,000', 0.0025);
  if (V <= 1800000) return ltR(1750 + 0.009 * (V - 1000000), th, '$1,000,001–$1,800,000: $1,750 + 0.9c per $1 above $1,000,000', 0.009);
  if (V <= 5000000) return ltR(8950 + 0.018 * (V - 1800000), th, '$1,800,001–$5,000,000: $8,950 + 1.8c per $1 above $1,800,000', 0.018);
  if (V <= 11000000) return ltR(66550 + 0.02 * (V - 5000000), th, '$5,000,001–$11,000,000: $66,550 + 2.0c per $1 above $5,000,000', 0.02);
  return ltR(186550 + 0.0267 * (V - 11000000), th, 'Above $11,000,000: $186,550 + 2.67c per $1 above $11,000,000', 0.0267);
}

function schedTAS(V) {
  var th = '$125,000 (General Land — same scale for all owner types)';
  if (V < 125000) return ltR(0, th, 'Below $125,000 — no land tax', 0, '0% until $125,000');
  if (V < 500000) return ltR(50 + 0.0045 * (V - 125000), th, '$125,000–<$500,000: $50 + 0.45% of the excess', 0.0045);
  return ltR(1737.5 + 0.015 * (V - 500000), th, '$500,000+: $1,737.50 + 1.5% of the excess', 0.015);
}

// ACT valuation charge — marginal on the property's 5-yr-average AUV.
// The $1,778 fixed charge (2026-27) is added per property by the caller.
function actValuation(a) {
  if (a <= 150000) return { tax: 0.0054 * a, band: 'AUV up to $150,000: 0.54%', rate: 0.0054 };
  if (a <= 275000) return { tax: 810 + 0.0064 * (a - 150000), band: 'AUV $150,000–$275,000: $810 + 0.64% of the excess', rate: 0.0064 };
  if (a <= 1000000) return { tax: 1610 + 0.0124 * (a - 275000), band: 'AUV $275,000–$1,000,000: $1,610 + 1.24% of the excess', rate: 0.0124 };
  if (a <= 2000000) return { tax: 10600 + 0.0125 * (a - 1000000), band: 'AUV $1,000,000–$2,000,000: $10,600 + 1.25% of the excess', rate: 0.0125 };
  return { tax: 23100 + 0.0126 * (a - 2000000), band: 'AUV above $2,000,000: $23,100 + 1.26% of the excess', rate: 0.0126 };
}

var ACT_FIXED_CHARGE = 1778; // 2026-27, per property

function ltSchedule(state, otype, V) {
  if (state === 'nsw') return schedNSW(V, otype);
  if (state === 'vic') return schedVIC(V, otype);
  if (state === 'qld') return schedQLD(V, otype);
  if (state === 'sa') return schedSA(V, otype);
  if (state === 'wa') return schedWA(V);
  if (state === 'tas') return schedTAS(V);
  return null;
}

/* ── Bracket edges (derived 1:1 from the schedule bands above — covered by
 *    the same SYNC note) for the "distance to next bracket" line. ── */
var LT_EDGES = {
  nsw: { general: [1075000, 6571000], trust: [6571000] },
  vic: { general: [50000, 100000, 300000, 600000, 1000000, 1800000, 3000000],
         trust: [25000, 50000, 100000, 250000, 600000, 1000000, 1800000, 3000000] },
  qld: { individual: [600000, 1000000, 3000000, 5000000, 10000000],
         company: [350000, 2250000, 5000000, 10000000] },
  sa:  { general: [936000, 1504000, 2188000, 3504000],
         trust: [25000, 936000, 1504000, 2188000, 3504000] },
  wa:  { general: [300000, 420000, 1000000, 1800000, 5000000, 11000000] },
  tas: { general: [125000, 500000] },
  act: { general: [150000, 275000, 1000000, 2000000] }
};

function nextStep(state, otype, V) {
  var m = LT_EDGES[state];
  if (!m) return null;
  var edges;
  if (state === 'nsw') edges = (otype === 'trust') ? m.trust : m.general;
  else if (state === 'vic') edges = (otype === 'trust') ? m.trust : m.general;
  else if (state === 'qld') edges = (otype === 'individual') ? m.individual : m.company;
  else if (state === 'sa') edges = (otype === 'trust') ? m.trust : m.general;
  else edges = m.general;
  for (var i = 0; i < edges.length; i++) {
    if (edges[i] > V) return edges[i];
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════ */

var STATE_NAMES = {
  nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia',
  wa: 'Western Australia', tas: 'Tasmania', act: 'Australian Capital Territory', nt: 'Northern Territory'
};

var ENTITY_LABELS = {
  individual: 'Individual', joint: 'Joint', company: 'Company', trust: 'Trust', smsf: 'SMSF'
};

/* Map holding entity → land-tax schedule owner type.
 * joint → individual (joint owners are assessed together as one owner);
 * smsf → company (complying super funds get the general/company scale, NOT
 * the trust-surcharge scales; in QLD the company scale IS the trustee scale). */
var ENTITY_OTYPE = {
  individual: 'individual', joint: 'individual', company: 'company', trust: 'trust', smsf: 'company'
};

/* Static land tax assessment dates per state (for the Upcoming dates panel). */
var LT_ASSESS = {
  nsw: { m: 12, d: 31, txt: 'midnight 31 Dec' },
  vic: { m: 12, d: 31, txt: 'midnight 31 Dec' },
  qld: { m: 6, d: 30, txt: '30 Jun' },
  sa:  { m: 6, d: 30, txt: '30 Jun' },
  wa:  { m: 6, d: 30, txt: '30 Jun' },
  tas: { m: 7, d: 1, txt: '1 Jul' }
};

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ══════════════════════════════════════════════════════════════════════
   STATE + SMALL UTILITIES
   ══════════════════════════════════════════════════════════════════════ */

var _session = null;
var _holdings = [];
var _cap = null;
var _medians = null;
var _editingId = null;

function byId(id) { return document.getElementById(id); }

function loadSession() {
  try { var r = localStorage.getItem('propCalc_session_v1'); if (r) _session = JSON.parse(r); } catch (e) { _session = null; }
}
function isLoggedIn() { return !!(_session && _session.id); }

function num(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }

function pctShare(h) {
  var p = num(h.ownershipPct);
  if (!p) p = 100;
  if (p < 1) p = 1;
  if (p > 100) p = 100;
  return p / 100;
}

function entityKey(h) {
  var e = String(h.entity || 'individual').toLowerCase();
  return ENTITY_LABELS[e] ? e : 'individual';
}

function signedPct(x) {
  var r = Math.round(x);
  return (r >= 0 ? '+' : '−') + Math.abs(r) + '%';
}

function parseMonth(s) {
  if (!s || !/^\d{4}-\d{2}$/.test(String(s))) return null;
  var y = parseInt(String(s).slice(0, 4), 10);
  var m = parseInt(String(s).slice(5, 7), 10);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
}

function monthLabel(d) { return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function dayLabel(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

function nextAnnual(month, day) {
  var now = new Date();
  var d = new Date(now.getFullYear(), month - 1, day);
  if (d < now) d = new Date(now.getFullYear() + 1, month - 1, day);
  return d;
}

function nextQuarterStart() {
  var now = new Date();
  var qm = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
  for (var i = 0; i < qm.length; i++) {
    var d = new Date(now.getFullYear(), qm[i], 1);
    if (d > now) return d;
  }
  return new Date(now.getFullYear() + 1, 0, 1);
}

/* Annual loan cost: IO = balance × rate; P&I = amortising repayment × 12. */
function holdingLoanAnnual(h) {
  var bal = num(h.loanBalance), rate = num(h.interestRate);
  if (bal <= 0) return 0;
  if (String(h.ioOrPi || 'pi') === 'io') return bal * rate / 100;
  var term = num(h.loanTermYears) || 30;
  return monthlyRepayment(bal, rate, term, false) * 12;
}

/* Pre-tax net annual cash flow: rent × 50 (2 weeks vacancy) − expenses − loan. */
function holdingNetAnnual(h) {
  return num(h.weeklyRent) * 50 - num(h.annualExpenses) - holdingLoanAnnual(h);
}

/* ══════════════════════════════════════════════════════════════════════
   API
   ══════════════════════════════════════════════════════════════════════ */

function pfApi(action, payload) {
  var body = { action: action };
  if (payload) {
    for (var k in payload) { if (payload.hasOwnProperty(k)) body[k] = payload[k]; }
  }
  return fetch('/.netlify/functions/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  }).then(function (r) {
    if (r.status === 401) return { ok: false, error: 'auth' };
    return r.json().catch(function () { return { ok: false, error: 'bad_response' }; });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   SUBURB MEDIANS — context only, never a valuation
   (same dataset + normalisation as tools/property-cashflow-calculator.js)
   ══════════════════════════════════════════════════════════════════════ */

function normSuburb(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadMedians() {
  if (!window.fetch) return;
  fetch('/tools/market-medians.json?v=2026Q2b').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (j) {
    _medians = j || null;
    // Holdings may already be on screen — refresh their median context lines.
    if (byId('pf-content') && byId('pf-content').style.display !== 'none') renderHoldings();
  }).catch(function () { /* honest absence — nothing shown without data */ });
}

function medianCaption(key) {
  if (!_medians || !_medians.sources || !_medians.sources[key]) return '';
  var s = _medians.sources[key];
  return 'as at ' + (s.period || 'n/a') + ', ' + (s.source || 'unknown source');
}

/* Context lines for one holding. Empty string when no data (honest absence). */
function medianLines(h) {
  if (!_medians || !_medians.states) return '';
  var SC = String(h.state || '').toUpperCase();
  var map = _medians.states[SC];
  if (!map) return '';
  var rec = map[normSuburb(h.suburb)];
  if (!rec) return '';
  var out = '';
  var rent = num(h.weeklyRent);
  if (typeof rec.r === 'number' && rec.r > 0 && rent > 0) {
    var cap = medianCaption(SC + '_rent');
    out += '<div class="pf-median">Suburb median rent ' + fmt(rec.r) + '/wk' +
      (cap ? ' (' + escHtml(cap) + ')' : '') +
      ' — your rent is ' + signedPct((rent - rec.r) / rec.r * 100) + ' vs the median.</div>';
  }
  var pv = num(h.currentValue);
  var pMedian = null, pLabel = '';
  if (typeof rec.h === 'number' && rec.h > 0) { pMedian = rec.h; pLabel = 'house'; }
  else if (typeof rec.u === 'number' && rec.u > 0) { pMedian = rec.u; pLabel = 'unit'; }
  if (pMedian && pv > 0) {
    var cap2 = medianCaption(SC + '_price');
    out += '<div class="pf-median">Suburb median ' + pLabel + ' price ' + fmt(pMedian) +
      (cap2 ? ' (' + escHtml(cap2) + ')' : '') +
      ' — your value entry is ' + signedPct((pv - pMedian) / pMedian * 100) + ' vs the median.</div>';
  }
  if (out) out += '<div class="pf-median-note">Suburb medians shown for context only — not a valuation of this property.</div>';
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — dashboard
   ══════════════════════════════════════════════════════════════════════ */

function statHtml(label, value, neg) {
  return '<div class="pf-stat"><div class="pf-stat-label">' + escHtml(label) + '</div>' +
    '<div class="pf-stat-value' + (neg ? ' pf-neg' : '') + '">' + escHtml(value) + '</div></div>';
}

function renderDashboard() {
  var el = byId('pf-dash');
  if (!el) return;
  var totV = 0, totD = 0, cashYr = 0, i, h, sh;
  for (i = 0; i < _holdings.length; i++) {
    h = _holdings[i];
    sh = pctShare(h);
    totV += num(h.currentValue) * sh;
    totD += num(h.loanBalance) * sh;
    if (!h.ppr) cashYr += holdingNetAnnual(h) * sh;
  }
  var eq = totV - totD;
  var lvr = totV > 0 ? (totD / totV * 100) : 0;
  var wk = cashYr / 52;
  el.innerHTML =
    statHtml('Total value', fmt(totV), false) +
    statHtml('Total debt', fmt(totD), false) +
    statHtml('Equity', fmtS(eq), eq < 0) +
    statHtml('Portfolio LVR', totV > 0 ? lvr.toFixed(1) + '%' : '—', lvr > 80) +
    statHtml('Net cash flow /wk', fmtS(wk), wk < 0);
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — land tax panel (the hero)
   ══════════════════════════════════════════════════════════════════════ */

function ltRow(label, value, strong) {
  return '<div class="pf-lt-row' + (strong ? ' pf-lt-tax' : '') + '">' +
    '<span>' + label + '</span><span>' + value + '</span></div>';
}

function renderLandTax() {
  var el = byId('pf-landtax');
  if (!el) return;
  var groups = {}, order = [], pprCount = 0, missingLand = 0;
  var i, h, st, key;

  for (i = 0; i < _holdings.length; i++) {
    h = _holdings[i];
    st = String(h.state || '').toLowerCase();
    if (!STATE_NAMES[st]) continue;
    if (h.ppr) { pprCount++; continue; }
    if (st !== 'nt' && num(h.landValue) <= 0) { missingLand++; continue; }
    key = st + '|' + entityKey(h);
    if (!groups[key]) {
      groups[key] = { state: st, entity: entityKey(h), V: 0, items: [] };
      order.push(key);
    }
    groups[key].V += num(h.landValue) * pctShare(h);
    groups[key].items.push({ label: h.label || 'Untitled property', auv: num(h.landValue) * pctShare(h) });
  }

  var total = 0;
  var html = '';

  order.forEach(function (k) {
    var g = groups[k];
    var title = STATE_NAMES[g.state] + ' · ' + ENTITY_LABELS[g.entity];
    var rows = '';
    var gTax = 0;

    if (g.state === 'nt') {
      rows += ltRow('Estimated annual land tax', '$0', true);
      rows += '<div class="pf-lt-note">The Northern Territory levies no land tax on any owner type.</div>';

    } else if (g.state === 'act') {
      /* ACT: per property (no aggregation), rentals only — fixed charge + marginal on AUV. */
      g.items.forEach(function (it) {
        var vres = actValuation(it.auv);
        var sub = ACT_FIXED_CHARGE + vres.tax;
        gTax += sub;
        rows += ltRow(escHtml(it.label) + ' — AUV share ' + fmt(it.auv), fmt(sub));
      });
      rows += ltRow('Fixed charge per property (2026-27)', fmt(ACT_FIXED_CHARGE));
      rows += ltRow('Estimated annual land tax', fmt(gTax), true);
      if (g.items.length === 1) {
        var edgeA = nextStep('act', 'general', g.items[0].auv);
        rows += ltRow('Distance to next bracket', edgeA
          ? fmt(edgeA - g.items[0].auv) + ' more land value before the next rate step'
          : 'Top band — the rate no longer steps up');
      }
      rows += '<div class="pf-lt-note">Assessed per property on AUV (no aggregation) — billed quarterly, about ' +
        fmt(gTax / 4) + ' per instalment. Applies to rentals only; an owner-occupied ACT home is out of scope.</div>';

    } else {
      var otype = ENTITY_OTYPE[g.entity] || 'individual';
      var res = ltSchedule(g.state, otype, g.V);
      if (!res) return;
      gTax = res.tax;
      rows += ltRow('Aggregate taxable land value (' + g.items.length + (g.items.length === 1 ? ' holding' : ' holdings') + ')', fmt(g.V));
      rows += ltRow('Tax-free threshold', escHtml(res.threshold));
      rows += ltRow('Estimated annual land tax', fmt(gTax), true);
      var edge = nextStep(g.state, otype, g.V);
      rows += ltRow('Distance to next bracket', edge
        ? fmt(edge - g.V) + ' more land value before the next rate step'
        : 'Top band — the rate no longer steps up');
    }

    total += gTax;
    html += '<div class="pf-lt-group"><div class="pf-lt-group-head">' + escHtml(title) + '</div>' + rows + '</div>';
  });

  var head = '<div class="pf-lt-total"><div class="pf-stat-label">Total estimated annual land tax</div>' +
    '<div class="pf-lt-total-num">' + fmt(total) + '</div></div>';

  if (!order.length) {
    html = '<p class="pf-empty">No taxable holdings yet — add an investment property with a land value to see the rollup.</p>';
    head = '';
  }

  var notes = '';
  if (pprCount > 0) {
    notes += '<div class="pf-lt-note">' + pprCount + (pprCount === 1 ? ' holding' : ' holdings') +
      ' marked PPR excluded — your principal place of residence is exempt from land tax.</div>';
  }
  if (missingLand > 0) {
    notes += '<div class="pf-lt-note">' + missingLand + (missingLand === 1 ? ' holding has' : ' holdings have') +
      ' no land value entered — add the unimproved/site value from the valuation notice to include ' +
      (missingLand === 1 ? 'it' : 'them') + '.</div>';
  }

  el.innerHTML = head + html + notes;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — upcoming dates
   ══════════════════════════════════════════════════════════════════════ */

function buildDateItems() {
  var items = [];
  var i, h, d;

  for (i = 0; i < _holdings.length; i++) {
    h = _holdings[i];
    var label = h.label || 'Untitled property';

    if (String(h.ioOrPi || '') === 'io' && h.ioExpiry) {
      d = parseMonth(h.ioExpiry);
      if (d) {
        var bal = num(h.loanBalance), rate = num(h.interestRate);
        var detail = 'Interest-only period ends.';
        if (bal > 0 && rate > 0) {
          var term = num(h.loanTermYears) || 30;
          var elapsed = 0;
          var pd = parseMonth(h.purchaseDate);
          if (pd && d > pd) elapsed = (d - pd) / (365.25 * 24 * 3600 * 1000);
          var remaining = Math.max(5, Math.round(term - elapsed));
          var ioWk = bal * rate / 100 / 52;
          var piWk = monthlyRepayment(bal, rate, remaining, false) * 12 / 52;
          var jump = Math.max(0, piWk - ioWk);
          detail = 'Repayments jump ~' + fmt(jump) + '/wk at P&I (est., ' + remaining + '-yr term remaining).';
        }
        items.push({ t: d.getTime(), when: monthLabel(d), date: d, label: label + ' — interest-only expiry', detail: detail });
      }
    }

    if (h.fixedExpiry) {
      d = parseMonth(h.fixedExpiry);
      if (d) items.push({ t: d.getTime(), when: monthLabel(d), date: d, label: label + ' — fixed rate ends', detail: 'The revert rate applies from here — reprice or refinance before it does.' });
    }

    if (h.leaseExpiry) {
      d = parseMonth(h.leaseExpiry);
      if (d) items.push({ t: d.getTime(), when: monthLabel(d), date: d, label: label + ' — lease expires', detail: 'Plan the renewal or relisting early to avoid a vacancy gap.' });
    }
  }

  /* Static land tax assessment dates for states present in the portfolio
   * (non-PPR holdings only — PPR is exempt everywhere). */
  var seen = {};
  for (i = 0; i < _holdings.length; i++) {
    h = _holdings[i];
    if (h.ppr) continue;
    var st = String(h.state || '').toLowerCase();
    if (seen[st] || !STATE_NAMES[st]) continue;
    seen[st] = true;
    if (LT_ASSESS[st]) {
      d = nextAnnual(LT_ASSESS[st].m, LT_ASSESS[st].d);
      items.push({ t: d.getTime(), when: dayLabel(d), date: d, label: st.toUpperCase() + ' land tax assessment date', detail: 'Holdings assessed at ' + LT_ASSESS[st].txt + ' — selling the day after still leaves the full year payable in most states.' });
    } else if (st === 'act') {
      d = nextQuarterStart();
      items.push({ t: d.getTime(), when: monthLabel(d), date: d, label: 'ACT land tax — billed quarterly', detail: 'Assessed per rented property each quarter; next instalment period shown.' });
    }
    /* NT: no land tax — no assessment date. */
  }

  items.sort(function (a, b) { return a.t - b.t; });
  return items;
}

function renderDates() {
  var el = byId('pf-dates');
  if (!el) return;
  var items = buildDateItems();
  if (!items.length) {
    el.innerHTML = '<li class="pf-empty">No upcoming dates — add interest-only, fixed-rate or lease expiry dates to your holdings to see them here.</li>';
    return;
  }
  var now = new Date();
  var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  var in90 = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
  var html = '';
  items.forEach(function (it) {
    var cls = '';
    if (it.date < startOfMonth) cls = ' pf-past';
    else if (it.date <= in90) cls = ' pf-due';
    html += '<li class="pf-date-item' + cls + '">' +
      '<span class="pf-date-when">' + escHtml(it.when) + '</span>' +
      '<span class="pf-date-body"><span class="pf-date-label">' + escHtml(it.label) +
      (it.date < startOfMonth ? ' <em class="pf-date-past-tag">(date passed)</em>' : '') +
      '</span><span class="pf-date-detail">' + escHtml(it.detail) + '</span></span></li>';
  });
  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — holdings list
   ══════════════════════════════════════════════════════════════════════ */

function metricHtml(label, value) {
  return '<div class="pf-metric"><div class="pf-metric-label">' + escHtml(label) + '</div>' +
    '<div class="pf-metric-value">' + escHtml(value) + '</div></div>';
}

function renderHoldings() {
  var el = byId('pf-holdings');
  if (!el) return;
  if (!_holdings.length) {
    el.innerHTML = '<p class="pf-empty">No properties yet. Add your first holding — it takes about a minute, and everything stays private to your account.</p>';
    return;
  }
  var html = '';
  _holdings.forEach(function (h) {
    var stU = String(h.state || '').toUpperCase();
    var pct = Math.round(pctShare(h) * 100);
    var v = num(h.currentValue), dbt = num(h.loanBalance);
    var eq = v - dbt;
    var lvrTxt = v > 0 ? (dbt / v * 100).toFixed(1) + '%' : '—';
    var metrics =
      metricHtml('Value', v > 0 ? fmt(v) : '—') +
      metricHtml('Loan', fmt(dbt)) +
      metricHtml('Equity', fmtS(eq)) +
      metricHtml('LVR', lvrTxt);
    if (!h.ppr) {
      metrics += metricHtml('Rent /wk', num(h.weeklyRent) > 0 ? fmt(num(h.weeklyRent)) : '—');
      metrics += metricHtml('Net cash /wk', fmtS(holdingNetAnnual(h) / 52));
    }
    html += '<article class="pf-holding">' +
      '<div class="pf-holding-head">' +
        '<span class="pf-holding-label">' + escHtml(h.label || 'Untitled property') + '</span>' +
        '<span class="pf-badge">' + escHtml(stU) + '</span>' +
        '<span class="pf-chip">' + escHtml(ENTITY_LABELS[entityKey(h)]) + (pct < 100 ? ' · ' + pct + '%' : '') + '</span>' +
        (h.ppr ? '<span class="pf-chip pf-chip-ppr">PPR</span>' : '') +
        (h.suburb ? '<span class="pf-holding-suburb">' + escHtml(h.suburb) + '</span>' : '') +
        '<button type="button" class="pf-btn-ghost" data-pf-edit="' + escHtml(String(h.id)) + '">Edit</button>' +
      '</div>' +
      '<div class="pf-holding-grid">' + metrics + '</div>' +
      medianLines(h) +
      (h.notes ? '<div class="pf-holding-notes">' + escHtml(h.notes) + '</div>' : '') +
      '</article>';
  });
  el.innerHTML = html;
}

function renderCapNote() {
  var el = byId('pf-cap-note');
  if (!el) return;
  if (!_cap || !_cap.max || _cap.plan !== 'free') { el.innerHTML = ''; return; }
  var atCap = _cap.used >= _cap.max;
  el.innerHTML = escHtml(_cap.used + ' of ' + _cap.max + ' free holdings used') +
    (atCap ? ' — the free plan tracks 2.' : '');
}

function render() {
  renderDashboard();
  renderLandTax();
  renderDates();
  renderHoldings();
  renderCapNote();
}

/* ══════════════════════════════════════════════════════════════════════
   FORM — add / edit / delete
   ══════════════════════════════════════════════════════════════════════ */

function setCurrencyField(id, val) {
  var el = byId(id);
  if (el) el.value = (num(val) > 0) ? Math.round(num(val)).toLocaleString() : '';
}
function setField(id, val) {
  var el = byId(id);
  if (el) el.value = (val === undefined || val === null) ? '' : String(val);
}
function fieldVal(id) {
  var el = byId(id);
  return el ? String(el.value || '').trim() : '';
}
function formMsg(t) {
  var el = byId('pf-form-msg');
  if (el) el.textContent = t || '';
}

function findHolding(id) {
  for (var i = 0; i < _holdings.length; i++) {
    if (String(_holdings[i].id) === String(id)) return _holdings[i];
  }
  return null;
}

function openForm(id) {
  var h = (id !== null && id !== undefined) ? findHolding(id) : null;
  _editingId = h ? h.id : null;

  byId('pf-form-title').textContent = h ? 'Edit property' : 'Add a property';
  setField('pf-f-label', h ? h.label : '');
  setField('pf-f-state', h && STATE_NAMES[String(h.state || '').toLowerCase()] ? String(h.state).toLowerCase() : 'nsw');
  setField('pf-f-suburb', h ? h.suburb : '');
  setField('pf-f-entity', h ? entityKey(h) : 'individual');
  setField('pf-f-pct', h ? (num(h.ownershipPct) || 100) : 100);
  var ppr = byId('pf-f-ppr');
  if (ppr) ppr.checked = !!(h && h.ppr);
  setCurrencyField('pf-f-purchase-price', h ? h.purchasePrice : 0);
  setField('pf-f-purchase-date', h ? h.purchaseDate : '');
  setCurrencyField('pf-f-current-value', h ? h.currentValue : 0);
  setCurrencyField('pf-f-land-value', h ? h.landValue : 0);
  setCurrencyField('pf-f-loan-balance', h ? h.loanBalance : 0);
  setField('pf-f-rate', h && num(h.interestRate) > 0 ? h.interestRate : '');
  setField('pf-f-iopi', h && String(h.ioOrPi) === 'io' ? 'io' : 'pi');
  setField('pf-f-term', h ? (num(h.loanTermYears) || 30) : 30);
  setField('pf-f-io-expiry', h ? h.ioExpiry : '');
  setField('pf-f-fixed-expiry', h ? h.fixedExpiry : '');
  setField('pf-f-lease-expiry', h ? h.leaseExpiry : '');
  setField('pf-f-notes', h ? h.notes : '');

  var del = byId('pf-delete-btn');
  if (del) del.style.display = h ? '' : 'none';
  var sug = byId('pf-suggest-hint');
  if (sug) sug.style.display = 'none';
  formMsg('');
  hideUpgrade();

  var wrap = byId('pf-form-wrap');
  wrap.style.display = '';
  try {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wrap.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  } catch (e) { /* older browsers — noop */ }
}

function hideForm() {
  byId('pf-form-wrap').style.display = 'none';
  _editingId = null;
  formMsg('');
}

function readForm() {
  var h = {};
  if (_editingId !== null && _editingId !== undefined) h.id = _editingId;
  h.label = fieldVal('pf-f-label').slice(0, 80);
  h.state = fieldVal('pf-f-state');
  h.suburb = fieldVal('pf-f-suburb').slice(0, 60);
  h.entity = fieldVal('pf-f-entity');
  var pct = parseFloat(fieldVal('pf-f-pct'));
  if (!isFinite(pct)) pct = 100;
  h.ownershipPct = Math.max(1, Math.min(100, Math.round(pct)));
  h.ppr = !!(byId('pf-f-ppr') && byId('pf-f-ppr').checked);
  h.purchasePrice = parseVal('pf-f-purchase-price');
  h.purchaseDate = fieldVal('pf-f-purchase-date');
  h.currentValue = parseVal('pf-f-current-value');
  h.landValue = parseVal('pf-f-land-value');
  h.loanBalance = parseVal('pf-f-loan-balance');
  var rate = parseFloat(fieldVal('pf-f-rate'));
  h.interestRate = isFinite(rate) && rate >= 0 ? rate : 0;
  h.ioOrPi = fieldVal('pf-f-iopi') === 'io' ? 'io' : 'pi';
  var term = parseInt(fieldVal('pf-f-term'), 10);
  h.loanTermYears = (isFinite(term) && term >= 1) ? term : 30;
  h.ioExpiry = fieldVal('pf-f-io-expiry');
  h.fixedExpiry = fieldVal('pf-f-fixed-expiry');
  h.leaseExpiry = fieldVal('pf-f-lease-expiry');
  h.weeklyRent = parseVal('pf-f-rent');
  h.annualExpenses = parseVal('pf-f-expenses');
  h.notes = fieldVal('pf-f-notes').slice(0, 280);
  return h;
}

function showUpgrade() {
  var el = byId('pf-upgrade');
  if (!el) return;
  el.innerHTML = '<div class="pf-upgrade-card">' +
    '<strong>You’ve reached the free limit.</strong>' +
    '<p>The free plan tracks 2 holdings.</p></div>';
  el.style.display = '';
  if (window.trackPageEvent) trackPageEvent('portfolio_cap_hit', { plan: _cap ? _cap.plan : 'free' });
}
function hideUpgrade() {
  var el = byId('pf-upgrade');
  if (el) el.style.display = 'none';
}

function submitSave() {
  var h = readForm();
  if (!h.label) { formMsg('Give this property a label.'); return; }
  if (!STATE_NAMES[h.state]) { formMsg('Pick a state.'); return; }
  var btn = byId('pf-save-btn');
  if (btn) btn.disabled = true;
  formMsg('Saving…');
  pfApi('save', { holding: h }).then(function (res) {
    if (btn) btn.disabled = false;
    if (res && res.ok) {
      _holdings = res.holdings || [];
      _cap = res.cap || _cap;
      hideForm();
      render();
      if (window.trackPageEvent) trackPageEvent('portfolio_save', { holdings: _holdings.length });
    } else if (res && res.error === 'cap') {
      formMsg('');
      hideForm();
      showUpgrade();
    } else if (res && res.error === 'auth') {
      sessionExpired();
    } else if (res && res.error === 'validation') {
      formMsg('The server rejected the entry — check the fields and try again.');
    } else {
      formMsg('Could not save — try again in a moment.');
    }
  }).catch(function () {
    if (btn) btn.disabled = false;
    formMsg('Network error — check your connection and try again.');
  });
}

function submitDelete() {
  if (_editingId === null || _editingId === undefined) return;
  var h = findHolding(_editingId);
  var name = h && h.label ? h.label : 'this property';
  if (!window.confirm('Delete "' + name + '" from your portfolio? This cannot be undone.')) return;
  var btn = byId('pf-delete-btn');
  if (btn) btn.disabled = true;
  formMsg('Deleting…');
  pfApi('delete', { id: _editingId }).then(function (res) {
    if (btn) btn.disabled = false;
    if (res && res.ok) {
      _holdings = res.holdings || [];
      _cap = res.cap || _cap;
      hideForm();
      render();
      if (window.trackPageEvent) trackPageEvent('portfolio_delete', { holdings: _holdings.length });
    } else if (res && res.error === 'auth') {
      sessionExpired();
    } else {
      formMsg('Could not delete — try again in a moment.');
    }
  }).catch(function () {
    if (btn) btn.disabled = false;
    formMsg('Network error — check your connection and try again.');
  });
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE STATES — guest / loading / error / content
   ══════════════════════════════════════════════════════════════════════ */

function showGuest(msg) {
  var g = byId('pf-guest'), a = byId('pf-app');
  if (a) a.style.display = 'none';
  if (g) g.style.display = '';
  if (msg) {
    var m = byId('pf-guest-msg');
    if (m) { m.textContent = msg; m.style.display = ''; }
  }
}

function showApp() {
  var g = byId('pf-guest'), a = byId('pf-app');
  if (g) g.style.display = 'none';
  if (a) a.style.display = '';
}

/* 401 mid-session: server says the cookie is gone — the localStorage session
 * blob is stale. Show the guest surface with an explanation. */
function sessionExpired() {
  hideForm();
  showGuest('Your session has expired — sign in again to view your portfolio.');
  if (window.trackPageEvent) trackPageEvent('portfolio_session_expired', {});
}

function showLoadError() {
  byId('pf-error').style.display = '';
  byId('pf-content').style.display = 'none';
}

function loadList() {
  byId('pf-loading').style.display = '';
  byId('pf-error').style.display = 'none';
  pfApi('list').then(function (res) {
    byId('pf-loading').style.display = 'none';
    if (res && res.ok) {
      _holdings = res.holdings || [];
      _cap = res.cap || null;
      byId('pf-content').style.display = '';
      render();
      if (window.trackPageEvent) trackPageEvent('portfolio_view', { holdings: _holdings.length });
    } else if (res && res.error === 'auth') {
      sessionExpired();
    } else {
      showLoadError();
    }
  }).catch(function () {
    byId('pf-loading').style.display = 'none';
    showLoadError();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   EVENT WIRING — no inline handlers (CSP), delegated where dynamic
   ══════════════════════════════════════════════════════════════════════ */

function wireEvents() {
  var addBtn = byId('pf-add-btn');
  if (addBtn) addBtn.addEventListener('click', function () { openForm(null); });

  var saveBtn = byId('pf-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', submitSave);

  var cancelBtn = byId('pf-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', hideForm);

  var delBtn = byId('pf-delete-btn');
  if (delBtn) delBtn.addEventListener('click', submitDelete);

  var retryBtn = byId('pf-retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', loadList);

  /* landValue "suggest" — rough heuristic: 55% of current value, nearest $10k. */
  var sugBtn = byId('pf-suggest-land');
  if (sugBtn) sugBtn.addEventListener('click', function () {
    var cv = parseVal('pf-f-current-value');
    if (cv <= 0) { formMsg('Enter the current value first — the suggestion works off it.'); return; }
    var land = Math.round(cv * 0.55 / 10000) * 10000;
    setCurrencyField('pf-f-land-value', land);
    var hint = byId('pf-suggest-hint');
    if (hint) hint.style.display = '';
    formMsg('');
  });

  /* Delegated: thousands-separator formatting on all currency inputs. */
  var formWrap = byId('pf-form-wrap');
  if (formWrap) formWrap.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.hasAttribute && t.hasAttribute('data-pf-currency')) fmtInput(t);
  });

  /* Delegated: Edit buttons on dynamically-rendered holding cards. */
  var holdingsEl = byId('pf-holdings');
  if (holdingsEl) holdingsEl.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== holdingsEl && !(t.hasAttribute && t.hasAttribute('data-pf-edit'))) {
      t = t.parentNode;
    }
    if (t && t !== holdingsEl && t.hasAttribute && t.hasAttribute('data-pf-edit')) {
      openForm(t.getAttribute('data-pf-edit'));
    }
  });

  /* Guest CTA analytics (guarded, like other pages). */
  var cta = byId('pf-signup-cta');
  if (cta) cta.addEventListener('click', function () {
    if (window.trackGuest) trackGuest('portfolio_signup_cta', {});
  });
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {
  loadSession();
  wireEvents();
  if (!isLoggedIn()) {
    showGuest();
    if (window.trackGuest) trackGuest('portfolio_guest_view', {});
    return;
  }
  showApp();
  loadMedians();
  loadList();
});

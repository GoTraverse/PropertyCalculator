/**
 * duty-sync-test.js — the old copies of the duty engine, registration fees,
 * tax, living-cost floor, LMI tiers and scheme settings agree with
 * shared/rules.js, until each copy is gone.
 *
 * shared/rules.js is the one source (build plan section 5). Each file listed
 * below held a copy on 18 Nov 2026. For every part of a file:
 *   - while the file still defines the copy, the copy is cut out of the file
 *     and run against shared/rules.js across every state and a price grid
 *     that crosses every bracket boundary, plus the hand-checked reference
 *     figures (Revenue NSW, RevenueWA, SRO Victoria, QRO);
 *   - once the copy is gone, the file's page must load /shared/rules.js,
 *     before its own script;
 *   - half a copy (some of its names still defined) fails.
 * Pages moving onto rules.js don't need to edit this test.
 *
 * Run: node tests/duty-sync-test.js
 */
const fs = require('fs');
const path = require('path');
const Rules = require('../shared/rules');
const { findDefs, extractDefs } = require('./lib/source-defs');
const { rulesLoadsFirst } = require('./lib/script-order');
const root = path.join(__dirname, '..');

const DUTY_TOOL = { names: ['stateData', 'calcDuty', 'qldHomeDuty', 'qldFhbConcessionAmt', 'applyFhbConcession'], fhb: (e) => (st, v) => e.applyFhbConcession(st, v, e.calcDuty(st, v)).duty };
const LISTED = [
  { file: 'tools/stamp-duty-calculator.js', page: 'tools/stamp-duty-calculator.html', parts: {
    duty: DUTY_TOOL,
    registration: { names: ['REG_FEES', 'SCALED_REG', 'regFeesTotal'] },
    lmi: { names: ['estimateLmiTier'], rate: (e) => (l) => e.estimateLmiTier(l).rate }
  } },
  { file: 'tools/auction-budget-calculator.js', page: 'tools/auction-budget-calculator.html', parts: {
    duty: DUTY_TOOL,
    registration: { names: ['REG_FEES', 'SCALED_REG', 'regFeesTotal'] },
    lmi: { names: ['lmiRate'], rate: (e) => e.lmiRate }
  } },
  { file: 'journey.js', page: 'journey.html', parts: {
    duty: { names: ['stateData', 'calcDuty', 'qldHomeDuty', 'qldFhbConcessionAmt', 'fhbDuty'], fhb: (e) => e.fhbDuty },
    registration: { names: ['REG_FLAT', 'regFeesTotal'] },
    tax: { names: ['approxTax', 'hemMonthly'] },
    lmi: { names: ['lmiRate'], rate: (e) => e.lmiRate },
    schemes: { names: ['FDS_CAPS', 'H2B_CAPS', 'H2B_INCOME', 'H2B_EQUITY'] },
    fhss: { names: ['FHSS_MAX_CONTRIB_ANNUAL', 'FHSS_MAX_TOTAL'] },
    incomeFactor: { names: ['INCOME_FACTOR'] }
  } },
  { file: 'tools/borrowing-power-calculator.js', page: 'tools/borrowing-power-calculator.html', parts: {
    tax: { names: ['approxTax', 'hemMonthly', 'hecsAnnual', 'incomeTypeFactor', 'maxLoanFromRepayment'] }
  } }
];

const STATES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
const PRICES = [1000, 250000, 350001, 525000, 540001, 550000, 600000, 600001,
  600100, 600101, 650000, 700001, 710000, 725001, 725050, 750000, 800000, 800001,
  850000, 900000, 960001, 990000, 999999, 1000000, 1000001, 1290001, 1455001,
  1500000, 2000001, 3000001, 3870001, 5000001];
const REG_PRICES = PRICES.concat([4000, 15000, 35000, 60000, 90000, 150000, 180000, 185000, 205000]);
const TAX_INCOMES = [0, 18200, 20000, 28011, 30000, 35013, 45000, 60000, 69528, 69529, 95000, 129717, 129718, 135000, 160000, 186050, 186051, 190000, 250000, 400000];
const LVRS = [0.5, 0.79, 0.8, 0.8000000000000002, 0.8001, 0.85, 0.8501, 0.9, 0.9000000000000001, 0.9001, 0.95, 0.9501, 0.99, 1.05];

let fails = 0, checks = 0;
function fail(msg) { fails++; if (fails <= 40) console.error(msg); }
function near(a, b, tol) { return typeof a === 'number' && Math.abs(a - b) <= tol; }
function expect(label, actual, expected, tol) {
  checks++;
  if (!near(actual, expected, tol == null ? 0.001 : tol)) fail('REF FAIL ' + label + ' → ' + actual + ' expected ' + expected);
}

// Reference figures, hand-derived from each office's published schedule
// (tests/stamp-duty-test.js has the derivations).
// NSW general duty to the cent (Revenue NSW's whole-dollar bracket bases).
const NSW_STD_REFS = [
  [103000, 1662.5], [103001, 1662.035], [387001, 11602.045], [400000, 12187],
  [650000, 23437], [1000000, 39187], [1290001, 52237.055], [3870001, 194137.07]
];
// First home buyer bands to the cent.
// NSW (s 78A): duty = (V - 800,000) / 200,000 x 39,187 (Revenue NSW's FHBAS
//   table for 2026-27: $9,796.75 at $850,000, $19,593.50 at $900,000,
//   $29,390.25 at $950,000, $37,227.65 at $990,000).
// WA (first home owner rate): $16.15 per $100 or part over $600,000.
// VIC (s 57JA): general duty x (V - 600,000) / 150,000.
const BAND_REFS = [
  ['nsw', 800000, 0], ['nsw', 800001, 0.195935], ['nsw', 850000, 9796.75],
  ['nsw', 900000, 19593.5], ['nsw', 950000, 29390.25], ['nsw', 990000, 37227.65],
  ['nsw', 999999, 39186.804065], ['nsw', 1000000, 39187],
  ['wa', 600000, 0], ['wa', 600001, 16.15], ['wa', 600100, 16.15], ['wa', 600101, 32.3],
  ['wa', 650000, 8075], ['wa', 700000, 16150], ['wa', 725050, 20203.65], ['wa', 800000, 32300],
  ['wa', 800001, 32315.0515],
  ['vic', 700000, 24713.333333],
  ['qld', 700000, 0], ['qld', 730000, 6555], ['qld', 750000, 10925],
  ['vic', 600000, 0]
];

// The reference engine: shared/rules.js itself.
const ref = {
  calcDuty: Rules.calcDuty,
  fhb: (st, v) => Rules.duty({ state: st, price: v, firstHome: true }).duty
};
for (const [v, want] of NSW_STD_REFS) expect('shared/rules.js NSW general $' + v, ref.calcDuty('nsw', v), want);
for (const [st, v, want] of BAND_REFS) expect('shared/rules.js first home ' + st + ' $' + v, ref.fhb(st, v), want);

// The page must load /shared/rules.js before its own script (src resolved
// from the page's own folder; see tests/lib/script-order.js).
const loadsRules = (page, ownScript) => rulesLoadsFirst(fs.readFileSync(path.join(root, page), 'utf8'), page, ownScript);

let compared = 0, moved = 0;
for (const item of LISTED) {
  const src = fs.readFileSync(path.join(root, item.file), 'utf8');
  const definedNames = new Set(findDefs(src, Object.values(item.parts).reduce((a, p) => a.concat(p.names), [])).map((d) => d.name));
  let needsRules = false;
  for (const [partName, part] of Object.entries(item.parts)) {
    const present = part.names.filter((n) => definedNames.has(n));
    if (!present.length) { needsRules = true; moved++; continue; }
    if (present.length < part.names.length) {
      fail(`PARTIAL ${item.file} ${partName}: still defines ${present.join(', ')} but not ${part.names.filter((n) => !definedNames.has(n)).join(', ')}. Remove the rest of the copy and use shared/rules.js.`);
      continue;
    }
    compared++;
    let e;
    try {
      e = new Function('Rules', extractDefs(src, part.names) + '\nreturn {' + part.names.map((n) => JSON.stringify(n) + ': ' + n).join(', ') + '};')(Rules);
    } catch (err) {
      fail(`LOAD ${item.file} ${partName}: the copy could not be cut out and run (${err.message})`);
      continue;
    }
    const who = item.file + ' ' + partName;
    if (partName === 'duty') {
      const fhb = part.fhb(e);
      for (const st of STATES) for (const v of PRICES) {
        checks += 2;
        if (!near(e.calcDuty(st, v), ref.calcDuty(st, v), 1e-6)) fail(`DRIFT general duty ${who} ${st} $${v} → ${e.calcDuty(st, v)} vs shared/rules.js ${ref.calcDuty(st, v)}`);
        if (!near(fhb(st, v), ref.fhb(st, v), 1e-6)) fail(`DRIFT first home duty ${who} ${st} $${v} → ${fhb(st, v)} vs shared/rules.js ${ref.fhb(st, v)}`);
      }
      for (const [v, want] of NSW_STD_REFS) expect(who + ' NSW general $' + v, e.calcDuty('nsw', v), want);
      for (const [st, v, want] of BAND_REFS) expect(who + ' first home ' + st + ' $' + v, fhb(st, v), want);
      for (const v of [250000, 650000, 1200000]) expect(who + ' QLD home concession $' + v, e.qldHomeDuty(v), Rules.qldHomeDuty(v), 1e-9);
    } else if (partName === 'registration') {
      for (const st of STATES) for (const v of REG_PRICES) {
        checks++;
        if (e.regFeesTotal(st, v) !== Rules.regFees(st, v)) fail(`DRIFT registration fees ${who} ${st} $${v} → ${e.regFeesTotal(st, v)} vs shared/rules.js ${Rules.regFees(st, v)}`);
      }
    } else if (partName === 'tax') {
      for (const g of TAX_INCOMES) {
        checks++;
        if (!near(e.approxTax(g), Rules.approxTax(g), 1e-9)) fail(`DRIFT approxTax ${who} $${g}`);
        if (e.hecsAnnual) { checks++; if (!near(e.hecsAnnual(g), Rules.hecsAnnual(g), 1e-9)) fail(`DRIFT hecsAnnual ${who} $${g}`); }
        for (const adults of [1, 2]) for (const deps of [0, 1, 2, 3, 5]) {
          checks++;
          if (e.hemMonthly(g, adults, deps) !== Rules.hemMonthly(g, adults, deps)) fail(`DRIFT hemMonthly ${who} $${g} ${adults} ${deps}`);
        }
      }
      if (e.incomeTypeFactor) for (const t of ['payg', 'paygVariable', 'casual', 'self-employed', 'rental', 'other']) {
        checks++; if (e.incomeTypeFactor(t) !== Rules.incomeTypeFactor(t)) fail(`DRIFT incomeTypeFactor ${who} ${t}`);
      }
      if (e.maxLoanFromRepayment) for (const b of [-5, 0, 1500, 6850]) for (const r of [0, 6, 9.25]) for (const y of [25, 30]) {
        checks++; if (!near(e.maxLoanFromRepayment(b, r, y), Rules.maxLoanFromRepayment(b, r, y), 1e-6)) fail(`DRIFT maxLoanFromRepayment ${who} ${b} ${r} ${y}`);
      }
    } else if (partName === 'lmi') {
      const rate = part.rate(e);
      for (const l of LVRS) { checks++; if (rate(l) !== Rules.lmiRate(l)) fail(`DRIFT LMI tier ${who} at LVR ${l}: ${rate(l)} vs shared/rules.js ${Rules.lmiRate(l)}`); }
    } else if (partName === 'schemes') {
      for (const st of STATES) {
        checks += 2;
        if (JSON.stringify(e.FDS_CAPS[st]) !== JSON.stringify(Rules.SCHEMES[st].fdsCap)) fail(`DRIFT 5% Deposit Scheme caps ${who} ${st}: ${JSON.stringify(e.FDS_CAPS[st])} vs ${JSON.stringify(Rules.SCHEMES[st].fdsCap)}`);
        if (JSON.stringify(e.H2B_CAPS[st]) !== JSON.stringify(Rules.SCHEMES[st].h2bCap)) fail(`DRIFT Help to Buy caps ${who} ${st}: ${JSON.stringify(e.H2B_CAPS[st])} vs ${JSON.stringify(Rules.SCHEMES[st].h2bCap)}`);
      }
      checks += 2;
      if (e.H2B_INCOME.single !== Rules.H2B.incomeCap.single || e.H2B_INCOME.couple !== Rules.H2B.incomeCap.couple) fail('DRIFT Help to Buy income caps ' + who);
      if (e.H2B_EQUITY.new !== Rules.H2B.equity.new || e.H2B_EQUITY.established !== Rules.H2B.equity.established || e.H2B_EQUITY.unsure !== Rules.H2B.equity.established) fail('DRIFT Help to Buy shares ' + who);
    } else if (partName === 'fhss') {
      checks++;
      if (e.FHSS_MAX_CONTRIB_ANNUAL !== Rules.FHSS.maxContribAnnual || e.FHSS_MAX_TOTAL !== Rules.FHSS.maxTotal) fail('DRIFT FHSS caps ' + who);
    } else if (partName === 'incomeFactor') {
      for (const k of Object.keys(e.INCOME_FACTOR)) { checks++; if (e.INCOME_FACTOR[k] !== Rules.incomeTypeFactor(k)) fail(`DRIFT income factor ${who} ${k}`); }
    }
  }
  if (needsRules) {
    checks++;
    const r = loadsRules(item.page, item.file);
    if (!r.ok) fail(`MISSING ${item.page} must load /shared/rules.js before ${item.file} (it no longer has its own copy of every part), but ${r.why}.`);
  }
}

if (fails) {
  console.error('\n' + fails + ' drift failure(s). shared/rules.js is the source: fix the copy, or better, remove it and use window.Rules.');
  process.exit(1);
}
console.log(`duty-sync-test: ${compared} old copies agree with shared/rules.js across ${STATES.length} states × ${PRICES.length} prices and the reference figures; ${moved} parts have moved onto it (${checks} checks) ✓`);

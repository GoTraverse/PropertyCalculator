/**
 * duty-sync-test.js — guards the duty-engine SYNC COPIES against drift.
 *
 * The FY2026-27 stamp-duty engine lives in THREE places by design (no build
 * step, no shared module yet — see PRODUCT_JOURNEY.md Phase 1b item 1):
 *   1. tools/stamp-duty-calculator.js   (source of truth)
 *   2. tools/auction-budget-calculator.js (sync copy)
 *   3. journey.js                        (sync copy)
 *
 * This test extracts the engine from each file and asserts identical output
 * across every state and a price grid that crosses every bracket boundary,
 * plus the journey's verified reference figures. Run: node tests/duty-sync-test.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function sliceEngine(file, startToken, endToken) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const a = src.indexOf(startToken);
  const b = src.indexOf(endToken, a);
  if (a === -1 || b === -1) throw new Error('engine anchors not found in ' + file);
  return src.slice(a, b);
}

function loadToolEngine(file) {
  // stateData … end of applyFhbConcession (returns {duty, note})
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const a = src.indexOf('var stateData');
  const fnIdx = src.indexOf('function applyFhbConcession', a);
  // end = the closing brace of applyFhbConcession: first "\n}" after fnIdx
  const b = src.indexOf('\n}', src.indexOf('return { duty: baseDuty', fnIdx)) + 2;
  const body = src.slice(a, b);
  return new Function(body + '\nreturn { calcDuty: calcDuty, fhb: function (st, v) { return applyFhbConcession(st, v, calcDuty(st, v)).duty; } };')();
}

function loadJourneyEngine() {
  const body = sliceEngine('journey.js', '  var stateData', '  // Buyer-specific duty');
  return new Function(body + '\nreturn { calcDuty: calcDuty, fhb: fhbDuty };')();
}

const engines = {
  'stamp-duty-calculator': loadToolEngine('tools/stamp-duty-calculator.js'),
  'auction-budget': loadToolEngine('tools/auction-budget-calculator.js'),
  'journey': loadJourneyEngine(),
};

const STATES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
const PRICES = [1000, 250000, 350001, 525000, 540001, 550000, 600000, 600001,
  600100, 600101, 650000, 700001, 710000, 725001, 725050, 750000, 800000, 800001,
  850000, 900000, 960001, 990000, 999999, 1000000, 1000001, 1290001, 1455001,
  1500000, 2000001, 3000001, 3870001, 5000001];

let fails = 0;
function close(a, b) { return Math.abs(a - b) < 0.51; } // sub-dollar rounding tolerance

const ref = engines['stamp-duty-calculator'];
for (const other of ['auction-budget', 'journey']) {
  const eng = engines[other];
  for (const st of STATES) {
    for (const v of PRICES) {
      const base0 = ref.calcDuty(st, v), base1 = eng.calcDuty(st, v);
      if (!close(base0, base1)) {
        fails++;
        console.error('DRIFT base duty', other, st, v, '→', base1, 'vs source', base0);
      }
      const fhb0 = ref.fhb(st, v), fhb1 = eng.fhb(st, v);
      if (!close(fhb0, fhb1)) {
        fails++;
        console.error('DRIFT FHB duty', other, st, v, '→', fhb1, 'vs source', fhb0);
      }
    }
  }
}

// Verified reference figures (adversarially checked Jul 2026)
function expect(label, actual, expected) {
  if (!close(actual, expected)) { fails++; console.error('REF FAIL', label, '→', actual, 'expected', expected); }
}
expect('QLD $750k FHB', engines['journey'].fhb('qld', 750000), 10925);

// NSW standard duty to the cent in every copy. The general check above
// allows 50c, which would not catch a copy that lost the whole-dollar
// bracket bases ($1,662, $11,602, $52,237, $194,137).
const NSW_STD_REFS = [
  [103000, 1662.5], [103001, 1662.035], [387001, 11602.045], [400000, 12187],
  [650000, 23437], [1000000, 39187], [1290001, 52237.055], [3870001, 194137.07]
];
for (const name of Object.keys(engines)) {
  for (const [v, want] of NSW_STD_REFS) {
    const got = engines[name].calcDuty('nsw', v);
    if (!(Math.abs(got - want) < 0.001)) { fails++; console.error('NSW STD FAIL', name, v, '→', got, 'expected', want); }
  }
}

// First home buyer bands, to the cent in every copy. The general check above
// allows 50c, which would not catch a copy that drifted by cents.
// NSW (s 78A): duty = (V - 800,000) / 200,000 x 39,187 (Revenue NSW's FHBAS
//   table for 2026-27: $9,796.75 at $850,000, $19,593.50 at $900,000,
//   $29,390.25 at $950,000, $37,227.65 at $990,000).
// WA (first home owner rate): $16.15 per $100 or part over $600,000.
// VIC (s 57JA): standard duty x (V - 600,000) / 150,000.
const BAND_REFS = [
  ['nsw', 800000, 0], ['nsw', 800001, 0.195935], ['nsw', 850000, 9796.75],
  ['nsw', 900000, 19593.5], ['nsw', 950000, 29390.25], ['nsw', 990000, 37227.65],
  ['nsw', 999999, 39186.804065], ['nsw', 1000000, 39187],
  ['wa', 600000, 0], ['wa', 600001, 16.15], ['wa', 600100, 16.15], ['wa', 600101, 32.3],
  ['wa', 650000, 8075], ['wa', 700000, 16150], ['wa', 725050, 20203.65], ['wa', 800000, 32300],
  ['wa', 800001, 32315.0515],
  ['vic', 700000, 24713.333333]
];
for (const name of Object.keys(engines)) {
  for (const [st, v, want] of BAND_REFS) {
    const got = engines[name].fhb(st, v);
    if (!(Math.abs(got - want) < 0.001)) { fails++; console.error('BAND FAIL', name, st, v, '→', got, 'expected', want); }
  }
}
expect('QLD $700k FHB (full exemption)', engines['journey'].fhb('qld', 700000), 0);
expect('VIC $600k FHB (full exemption)', engines['journey'].fhb('vic', 600000), 0);

// ── Other journey sync copies ────────────────────────────────────────────
// journey.js also carries the title-office registration fees (from
// tools/stamp-duty-calculator.js) and the tax + living-cost functions behind
// its borrowing estimate (from tools/borrowing-power-calculator.js).
function between(file, startToken, endToken) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const a = src.indexOf(startToken);
  const b = src.indexOf(endToken, a);
  if (a === -1 || b === -1) throw new Error('anchors not found in ' + file + ': ' + startToken);
  return src.slice(a, b);
}
const regSrc = new Function(between('tools/stamp-duty-calculator.js', 'var REG_FEES', 'function updateState') + '\nreturn regFeesTotal;')();
const regJourney = new Function(between('journey.js', '  var REG_FLAT', '  // ── end registration sync copy') + '\nreturn regFeesTotal;')();
for (const st of STATES) {
  for (const v of PRICES.concat([4000, 15000, 35000, 60000, 90000, 150000, 180000, 185000, 205000])) {
    const a = regSrc(st, v), b = regJourney(st, v);
    if (!close(a, b)) { fails++; console.error('DRIFT registration fees journey', st, v, '→', b, 'vs source', a); }
  }
}
const bpSrc = new Function(between('tools/borrowing-power-calculator.js', 'function approxTax', '// ── Lender-discount factor') + '\nreturn { approxTax: approxTax, hemMonthly: hemMonthly };')();
const bpJourney = new Function(between('journey.js', '  function approxTax', '  // ── end borrowing sync copy') + '\nreturn { approxTax: approxTax, hemMonthly: hemMonthly };')();
for (const g of [0, 18200, 20000, 28011, 30000, 35013, 45000, 60000, 95000, 135000, 160000, 190000, 250000, 400000]) {
  if (!close(bpSrc.approxTax(g), bpJourney.approxTax(g))) { fails++; console.error('DRIFT approxTax journey', g); }
  for (const adults of [1, 2]) for (const deps of [0, 1, 2, 3]) {
    if (!close(bpSrc.hemMonthly(g, adults, deps), bpJourney.hemMonthly(g, adults, deps))) { fails++; console.error('DRIFT hemMonthly journey', g, adults, deps); }
  }
}

if (fails) {
  console.error('\n' + fails + ' duty-engine drift failure(s). Update ALL sync copies together:');
  console.error('tools/stamp-duty-calculator.js → tools/auction-budget-calculator.js + journey.js');
  console.error('tools/borrowing-power-calculator.js (approxTax, hemMonthly) → journey.js');
  process.exit(1);
}
console.log('duty-sync-test: all 3 engines agree across', STATES.length, 'states ×', PRICES.length, 'prices ✓');
console.log('duty-sync-test: journey registration-fee and borrowing-estimate copies match their sources ✓');

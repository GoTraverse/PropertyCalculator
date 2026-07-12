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
const PRICES = [1000, 250000, 350001, 525000, 540001, 550000, 600000, 650000,
  700001, 710000, 725001, 750000, 800000, 900000, 960001, 1000000, 1290001,
  1455001, 1500000, 2000001, 3000001, 3870001, 5000001];

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
expect('QLD $700k FHB (full exemption)', engines['journey'].fhb('qld', 700000), 0);
expect('VIC $600k FHB (full exemption)', engines['journey'].fhb('vic', 600000), 0);

if (fails) {
  console.error('\n' + fails + ' duty-engine drift failure(s). Update ALL sync copies together:');
  console.error('tools/stamp-duty-calculator.js → tools/auction-budget-calculator.js + journey.js');
  process.exit(1);
}
console.log('duty-sync-test: all 3 engines agree across', STATES.length, 'states ×', PRICES.length, 'prices ✓');

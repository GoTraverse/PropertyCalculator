#!/usr/bin/env node
/**
 * stamp-duty-test.js — Regression coverage for the stamp duty calculators.
 *
 * v2 (Jul 2026): this test now LOADS THE SHIPPED FILE
 * (tools/stamp-duty-calculator.js) in a Node vm sandbox with DOM stubs and
 * exercises its real calcDuty / applyFhbConcession / qldHomeDuty /
 * qldFhbConcessionAmt / regFeesTotal functions.
 *
 * Why the rewrite: the previous version "deliberately re-implemented" the
 * tier tables as an embedded copy. That copy silently rotted — by Jul 2026
 * it still carried pre-2019 NSW brackets and a VIC table ~$14k off reality
 * at $700k, while the suite kept passing because it only ever asserted its
 * own copy against expectations derived from that same copy. A test that
 * can drift from the code it guards is worse than no test. Never reintroduce
 * an embedded rate table here.
 *
 * EXPECTED spot values below are derived BY HAND from each revenue office's
 * published FY2026-27 schedule (verified 5-6 Jul 2026 — see the derivation
 * comment on each line). When rates legitimately change, re-derive them from
 * the official schedule — never from the code (that would be circular).
 *
 * Run: node tests/stamp-duty-test.js   (exit 0 = pass)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CANONICAL = path.join(ROOT, 'tools', 'stamp-duty-calculator.js');
const AUCTION = path.join(ROOT, 'tools', 'auction-budget-calculator.js');

// ── Load the shipped calculator in a sandbox ───────────────────────────────
function loadShipped(file) {
  const src = fs.readFileSync(file, 'utf8');
  const el = () => ({
    addEventListener() {}, textContent: '', innerHTML: '', value: '',
    checked: false, style: {}, appendChild() {}, classList: { add() {}, remove() {} },
    hidden: false, disabled: false,
  });
  const sandbox = {
    console,
    document: {
      getElementById: () => el(),
      querySelector: () => el(),
      querySelectorAll: () => [],
      createElement: () => el(),
      addEventListener() {},
    },
    // tool-page.js globals the file references (never exercised by the test):
    ToolPage: { init() {} },
    fmt: (v) => '$' + Math.round(v).toLocaleString('en-AU'),
    parseVal: () => 0,
    fmtInput() {},
    trackPageEvent() {},
    trackCalculatorResult() {},
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {},
    removeEventListener() {},
    location: { pathname: '/tools/stamp-duty-calculator', search: '' },
    navigator: { userAgent: 'node-test' },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: path.basename(file) });
  return sandbox;
}

let shipped;
try {
  shipped = loadShipped(CANONICAL);
} catch (e) {
  console.error('FATAL: could not load tools/stamp-duty-calculator.js in the sandbox: ' + e.message);
  process.exit(1);
}
for (const fn of ['calcDuty', 'applyFhbConcession', 'qldHomeDuty', 'qldFhbConcessionAmt', 'regFeesTotal', 'stateData']) {
  if (typeof shipped[fn] === 'undefined') {
    console.error('FATAL: shipped calculator does not expose ' + fn + ' — test needs updating.');
    process.exit(1);
  }
}
const { calcDuty, applyFhbConcession, regFeesTotal, qldHomeDuty, stateData } = shipped;

let failed = 0;
const t = (label, ok, extra) => {
  if (ok) { console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label + (extra ? ' — ' + extra : '')); }
};

// ── Suite 1 — spot values vs official FY2026-27 schedules (hand-derived) ───
console.log('\nSpot values vs official schedules ($400k / $700k / $1.2M standard duty):');
const EXPECTED = {
  // NSW (Revenue NSW, brackets CPI-indexed 1 Jul 2026: 1.25% to 18k; 1.5% to
  // 38k; 1.75% to 103k; 3.5% to 387k; 4.5% to 1.29M):
  //   400k: 225 + 300 + 1,137.50 + 9,940 + 13,000*4.5% = 12,187.50
  //   700k: 11,602.50 (base at 387k) + 313,000*4.5%     = 25,687.50
  //   1.2M: 11,602.50 + 813,000*4.5%                     = 48,187.50
  nsw: { 400000: 12187.50, 700000: 25687.50, 1200000: 48187.50 },
  // VIC (SRO: 1.4% to 25k; 2.4% to 130k; $2,870 + 6% over 130k; $960,001-$2M
  // is 5.5% OF TOTAL value):
  //   400k: 2,870 + 270,000*6% = 19,070
  //   700k: 2,870 + 570,000*6% = 37,070
  //   1.2M: 1,200,000 * 5.5%   = 66,000
  vic: { 400000: 19070, 700000: 37070, 1200000: 66000 },
  // QLD (QRO: 1.5% 5k-75k; 3.5% to 540k; 4.5% to 1M; 5.75% above):
  //   400k: 1,050 + 325,000*3.5% = 12,425
  //   700k: 17,325 + 160,000*4.5% = 24,525
  //   1.2M: 38,025 + 200,000*5.75% = 49,525
  qld: { 400000: 12425, 700000: 24525, 1200000: 49525 },
  // SA (RevenueSA: 1%/2%/3%/3.5%/4%/4.25%/4.75%/5%/5.5% at
  // 12k/30k/50k/100k/200k/250k/300k/500k):
  //   400k: 120+360+600+1,750+4,000+2,125+2,375+100,000*5% = 16,330
  //   700k: 21,330 (base at 500k) + 200,000*5.5%            = 32,330
  //   1.2M: 21,330 + 700,000*5.5%                            = 59,830
  sa: { 400000: 16330, 700000: 32330, 1200000: 59830 },
  // WA (RevenueWA residential rate: 1.9% to 120k; 2.85% to 150k; 3.8% to
  // 360k; 4.75% to 725k; 5.15% above):
  //   400k: 2,280 + 855 + 7,980 + 40,000*4.75%  = 13,015
  //   700k: 2,280 + 855 + 7,980 + 340,000*4.75% = 27,265
  //   1.2M: 28,452.50 (base at 725k) + 475,000*5.15% = 52,915
  wa: { 400000: 13015, 700000: 27265, 1200000: 52915 },
  // TAS (SRO Tas: $50 base at $3k, then 1.75%/2.25%/3.5%/4%/4.25%/4.5% at
  // 3k/25k/75k/200k/375k/725k):
  //   400k: 50 + 385 + 1,125 + 4,375 + 7,000 + 25,000*4.25%  = 13,997.50
  //   700k: 50 + 12,885 (base at 375k) + 325,000*4.25%        = 26,747.50
  //   1.2M: 50 + 27,760 (base at 725k) + 475,000*4.5%         = 49,185
  tas: { 400000: 13997.50, 700000: 26747.50, 1200000: 49185 },
  // ACT (0.28% to 260k; 2.2% to 300k; 3.4% to 500k; 4.32% to 750k; 5.9% to
  // 1M; 6.4% above; >$1.455M is 4.54% OF TOTAL):
  //   400k: 728 + 880 + 100,000*3.4%                    = 5,008
  //   700k: 728 + 880 + 6,800 + 200,000*4.32%           = 17,048
  //   1.2M: 728 + 880 + 6,800 + 10,800 + 14,750 + 200,000*6.4% = 46,758
  act: { 400000: 5008, 700000: 17048, 1200000: 46758 },
  // NT (quadratic V<525k: 0.06571441*(V/1000)^2 + 15*(V/1000); 4.95% of
  // total 525k-3M):
  //   400k: 0.06571441*160,000 + 6,000 = 16,514.31 (2dp)
  //   700k: 700,000*4.95% = 34,650
  //   1.2M: 1,200,000*4.95% = 59,400
  nt: { 400000: 16514.31, 700000: 34650, 1200000: 59400 },
};

for (const state of Object.keys(EXPECTED)) {
  for (const [price, expected] of Object.entries(EXPECTED[state])) {
    const actual = calcDuty(state, Number(price));
    const ok = Math.abs(actual - expected) < 0.01;
    t(`${state.toUpperCase()} duty($${Number(price).toLocaleString('en-AU')}) = $${actual.toFixed(2)} (official: $${expected.toFixed(2)})`,
      ok, ok ? null : `delta $${(actual - expected).toFixed(2)}`);
  }
}

// ── Suite 2 — QLD FHB: QRO's exact $10k-band concession table ──────────────
// Verified 5-6 Jul 2026 vs qro.qld.gov.au concession-rates. Duty =
// max(0, homeConcessionDuty - bandConcession). QRO's own worked example:
// $730,000 -> $18,700 - $12,145 = $6,555.
console.log('\nQLD first home concession (QRO band table):');
const QLD_FHB = [
  [650000, 0],        // full exemption <= $700k
  [705000, 225],      // 17,575 home duty - 17,350 first band
  [730000, 6555],     // QRO's published worked example
  [750000, 10925],    // 19,600 - 8,675
  [820000, 22750],    // over $800k: home-concession rate still applies
  [1200000, 42350],   // 30,850 + 5.75% over $1M (home schedule top band)
];
for (const [price, expected] of QLD_FHB) {
  const got = applyFhbConcession('qld', price, calcDuty('qld', price)).duty;
  t(`QLD FHB duty($${price.toLocaleString('en-AU')}) = $${got.toFixed(2)} (QRO: $${expected.toLocaleString('en-AU')})`,
    Math.abs(got - expected) < 0.51, 'got ' + got);
}
t('QLD owner-occupier home duty($750k) = $19,600', Math.abs(qldHomeDuty(750000) - 19600) < 0.01, 'got ' + qldHomeDuty(750000));

// ── Suite 3 — title-office registration fees (FY2026-27, verified 6 Jul) ───
console.log('\nRegistration fees (regFeesTotal):');
const REG = [
  ['nsw', 750000, 366],   // NSW LRS $182.73 incl GST x2, code rounds to 183+183
  ['vic', 750000, 1989],  // 129.20 + ceil(104.30 + 750*2.34) = 129.20 + 1,860
  ['vic', 2000000, 3743], // transfer capped at $3,614
  ['sa', 45000, 557],     // 204 + 353 (>40k band, nothing above 50k)
  ['sa', 750000, 7907],   // 204 + 353 + 105*70
  ['sa', 1000000, 10532], // 204 + 353 + 105*95
  ['wa', 80000, 450],     // 225.10 + 225.10
  ['wa', 750000, 600],    // 225.10 + 255.10 + 20*6
  ['qld', 750000, 3150],  // 248.04*2 + 46.56*57
  ['tas', 750000, 425],   // 168 + 257 flat
  ['act', 750000, 680],   // 184 + 496 flat (DI2026-104)
  ['nt', 750000, 362],    // 181 + 181 flat
];
for (const [state, price, expected] of REG) {
  const got = regFeesTotal(state, price);
  t(`${state.toUpperCase()} regFeesTotal($${price.toLocaleString('en-AU')}) = $${got} (official: $${expected})`,
    got === expected, 'got ' + got);
}

// ── Suite 4 — continuity + monotonicity across the shipped calcDuty ────────
// Legislated flat-of-total bands create REAL (lawful) upward steps at VIC
// $960k and ACT $1.455M — upward jumps are allowed; any NEGATIVE step is the
// bracket-cliff bug class this suite exists to catch.
console.log('\nNon-negative + monotone non-decreasing ($0 → $4M, $1k steps):');
for (const state of Object.keys(EXPECTED)) {
  let ok = true, prev = 0, at = -1;
  for (let v = 0; v <= 4000000; v += 1000) {
    const d = calcDuty(state, v);
    if (d < 0 || d < prev - 0.011) { ok = false; at = v; break; }
    prev = d;
  }
  t(`${state.toUpperCase()} monotone across $0 → $4M`, ok, at >= 0 ? 'negative step at $' + at.toLocaleString('en-AU') : null);
}

// ── Suite 5 — SYNC: auction copy must stay byte-identical ──────────────────
// auction-budget-calculator.js declares its duty/fee blocks are copied
// verbatim from the canonical. This asserts it mechanically.
console.log('\nSync-block byte identity (canonical ↔ auction):');
const norm = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const canonSrc = norm(CANONICAL);
const auctionSrc = norm(AUCTION);
function block(src, startMark, endMark) {
  const i = src.indexOf(startMark);
  if (i < 0) return null;
  const j = src.indexOf(endMark, i);
  return j < 0 ? null : src.slice(i, j + endMark.length);
}
const SYNC_BLOCKS = [
  ['REG_FEES', 'var REG_FEES = {', '\n};'],
  ['SCALED_REG + regFeesTotal', 'var SCALED_REG = {', 'return reg.mortgage + reg.transfer;\n}'],
  ['qldHomeDuty', 'function qldHomeDuty(v) {', '\n}'],
  ['qldFhbConcessionAmt', 'function qldFhbConcessionAmt(v) {', '\n}'],
  ['applyFhbConcession', 'function applyFhbConcession(state, val, baseDuty) {', "return { duty: baseDuty, note: '' };\n}"],
];
for (const [name, sm, em] of SYNC_BLOCKS) {
  const a = block(canonSrc, sm, em);
  const b = block(auctionSrc, sm, em);
  t(`${name} identical in both files`, !!a && !!b && a === b,
    !a ? 'missing in canonical' : !b ? 'missing in auction' : 'content drift — re-copy from canonical');
}

// ── Result ──────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
  process.exit(0);
}

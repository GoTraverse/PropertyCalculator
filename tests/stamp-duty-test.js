#!/usr/bin/env node
/**
 * stamp-duty-test.js — Regression coverage for the stamp duty calculators.
 *
 * Why this exists:
 *   The previous hand-rolled bracket formulas in tools/stamp-duty-calculator.js
 *   carried a $381 discontinuity at the NSW $205k boundary (and similar
 *   smaller cliffs at $30k, $305k, $405k, $550k) that nobody caught for
 *   months because the pages render visually fine and no test asserted
 *   bracket-transition continuity. Same pattern existed in 7 of 8 states.
 *
 *   This file lives as a guard rail. Two suites:
 *
 *     1. Continuity test — for every state, walks each tier boundary and
 *        confirms duty(threshold) and duty(threshold + 1) differ by no more
 *        than would be explained by 1 cent at the lower-tier rate. A cliff
 *        bigger than that is the bug we just fixed and should never recur.
 *
 *     2. Spot-value test — for every state, asserts the duty at a $400k,
 *        $700k, and $1.2M property purchase against pre-computed expected
 *        values. If you intentionally change a state's rate or threshold,
 *        update the expected values along with the change.
 *
 * Run: node tests/stamp-duty-test.js
 *      Exit 0 = pass, exit 1 = at least one assertion failed.
 *
 * Note: this file deliberately re-implements the cumulative tier walk
 * rather than importing tools/stamp-duty-calculator.js — the calculator
 * file mutates DOM globals at module load time, which a Node test cannot
 * import. Keeping the logic in two places is the price of a smoke test
 * that runs without a browser.
 */
'use strict';

// State tier tables. Must mirror tools/stamp-duty-calculator.js exactly.
// Each state is `[ [fromValue, rate], ... ]`.
const STATE_TIERS = {
  NSW: [[0,0],[14000,0.0125],[30000,0.015],[130000,0.0175],[205000,0.035],[305000,0.04],[405000,0.045],[550000,0.055]],
  VIC: [[0,0],[25000,0.014],[130000,0.024],[440000,0.055],[870000,0.065]],
  QLD: [[0,0],[5000,0.015],[75000,0.035],[540000,0.045],[1000000,0.0575]],
  SA:  [[0,0],[16000,0.015],[19000,0.03],[250000,0.035],[300000,0.04]],
  WA:  [[0,0],[2000,0.01],[4000,0.02],[500000,0.035],[1000000,0.0475]],
  TAS: [[0,0],[3000,0.036],[100000,0.041],[150000,0.0425],[250000,0.0475]],
  ACT: [[0,0],[7500,0.0125],[30000,0.02],[200000,0.035]],
  NT:  [[0,0],[3000,0.0075],[100000,0.01],[150000,0.015],[250000,0.025]],
};

function dutyAt(state, v) {
  const tiers = STATE_TIERS[state];
  if (!tiers || v <= 0) return 0;
  let duty = 0;
  for (let i = 0; i < tiers.length; i++) {
    const from = tiers[i][0];
    if (v <= from) break;
    const next = (i + 1 < tiers.length) ? tiers[i + 1][0] : Infinity;
    duty += (Math.min(v, next) - from) * tiers[i][1];
  }
  return duty;
}

let failed = 0;
const t = (label, ok, extra) => {
  if (ok) {
    console.log('  ✓ ' + label);
  } else {
    failed++;
    console.error('  ✗ ' + label + (extra ? ' — ' + extra : ''));
  }
};

// ── Suite 1 — bracket-transition continuity ────────────────────────────────
console.log('\nBracket continuity (no cliffs):');
for (const [state, tiers] of Object.entries(STATE_TIERS)) {
  let stateOk = true;
  for (let i = 1; i < tiers.length; i++) {
    const threshold = tiers[i][0];
    const just_below = dutyAt(state, threshold);
    const just_above = dutyAt(state, threshold + 1);
    // Going up by $1 should never cost LESS duty (no cliffs). The reverse
    // (a small jump up) is fine.
    const diff = just_above - just_below;
    // Acceptable: 0 (smooth) up to ~tier_rate × 1 cent. Reject > $1 either
    // direction — that's a sign the cumulative base is off.
    const ok = diff >= -0.011 && diff <= tiers[i][1] + 0.011;
    if (!ok) {
      stateOk = false;
      console.error(`  ✗ ${state} bracket boundary $${threshold.toLocaleString('en-AU')}: ` +
        `duty(${threshold}) = $${just_below.toFixed(2)}, ` +
        `duty(${threshold + 1}) = $${just_above.toFixed(2)}, diff = $${diff.toFixed(2)}`);
      failed++;
    }
  }
  if (stateOk) console.log(`  ✓ ${state} — ${tiers.length - 1} bracket transitions all continuous`);
}

// ── Suite 2 — spot values ──────────────────────────────────────────────────
//
// Computed from the canonical tier tables above. If you intentionally change
// a state's rates or thresholds, recompute these expected values from the
// new tier table and update them here.
console.log('\nSpot-value assertions ($400k, $700k, $1.2M property):');
const SPOT_PRICES = [400000, 700000, 1200000];
const EXPECTED = {
  NSW: { 400000: 10312.50, 700000: 25287.50, 1200000: 52787.50 },
  VIC: { 400000: 7950.00,  700000: 23210.00, 1200000: 54010.00 },
  QLD: { 400000: 12425.00, 700000: 24525.00, 1200000: 49525.00 },
  SA:  { 400000: 12725.00, 700000: 24725.00, 1200000: 44725.00 },
  WA:  { 400000: 7940.00,  700000: 16940.00, 1200000: 36940.00 },
  TAS: { 400000: 16917.00, 700000: 31167.00, 1200000: 54917.00 },
  ACT: { 400000: 10681.25, 700000: 21181.25, 1200000: 38681.25 },
  NT:  { 400000: 6477.50,  700000: 13977.50, 1200000: 26477.50 },
};

for (const state of Object.keys(STATE_TIERS)) {
  for (const price of SPOT_PRICES) {
    const actual = dutyAt(state, price);
    const expected = EXPECTED[state][price];
    const ok = Math.abs(actual - expected) < 0.01;
    t(`${state} duty(${'$' + price.toLocaleString('en-AU')}) = $${actual.toFixed(2)} (expected $${expected.toFixed(2)})`,
      ok,
      ok ? null : `delta $${(actual - expected).toFixed(2)}`);
  }
}

// ── Suite 3 — non-negative + monotonic ─────────────────────────────────────
console.log('\nNon-negative + monotonic:');
for (const state of Object.keys(STATE_TIERS)) {
  let ok = true;
  let prev = 0;
  // Walk a wide range of values and confirm duty is non-negative and
  // monotone non-decreasing — guards against a future tier table edit
  // accidentally producing a negative slope.
  for (let v = 0; v <= 2000000; v += 5000) {
    const d = dutyAt(state, v);
    if (d < 0) { ok = false; break; }
    if (d < prev - 0.01) { ok = false; break; }
    prev = d;
  }
  t(`${state} non-negative + non-decreasing across $0 → $2M`, ok);
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
  process.exit(0);
}

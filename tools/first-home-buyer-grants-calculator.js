/* ═══ FHB GRANTS & CONCESSIONS CALCULATOR ═══
 *
 * Best-in-market Australian First Home Buyer assistance calculator.
 * What competitors don't do that this does:
 *
 *   • Computes the ACTUAL dollar saving per program for the user's
 *     specific situation, not just "Full exemption / Reduces with price".
 *     We compute baseline stamp duty for the price + state, then subtract
 *     concession, so the user sees "you save $24,757".
 *   • Federal schemes overlaid in the same view: the 5% Deposit Scheme
 *     (formerly First Home Guarantee — 5% deposit, no LMI), Help to Buy
 *     (2% shared-equity), First Home Super Saver ($50k withdrawal).
 *   • Separate price-cap tables for the 5% Deposit Scheme and Help to Buy
 *     (they differ per state) — most calculators use one table for both.
 *   • Total-assistance figure at the top: one clear number for "your
 *     household gets $X in first-home-buyer help on this purchase".
 *
 * Federal program settings (verified July 2026):
 *   • 5% Deposit Scheme: from 1 Oct 2025 there are NO income caps,
 *     unlimited places and no waitlist. Remaining rules: 5% min deposit,
 *     no LMI, owner-occupier, first home (or no property owned in the
 *     last 10 years). Price caps per state below (fdsCap*).
 *   • Help to Buy: OPEN — applications since 5 Dec 2025 via CBA + Bank
 *     Australia (more lenders during 2026). Income caps from 1 Jul 2026:
 *     $103,000 single / $165,000 joint or single-parent. Equity up to
 *     40% new / 30% existing. 10,000 places FY2026-27. Own price caps
 *     per state below (h2bCap*).
 *   • FHSS: max $15,000/yr contributions, $50,000 total withdrawal
 */

// ── State stamp duty + FHB schedule ───────────────────────────────────────
//
// Each state defines:
//   tiers            — cumulative-tiered standard duty (mirrors stamp-duty-calculator.js)
//   fhbFull          — full FHB exemption price (if FHB qualifies)
//   fhbPartial       — partial-concession upper bound
//   fhbNewHomeExempt — true if NEW-home purchases get duty nil with no value
//                      cap (QLD contracts ≥1 May 2025; SA new/off-the-plan
//                      ≥6 Jun 2024; NT house-and-land packages to 30 Jun 2027)
//   fhbNote          — one-line plain-English summary shown under the duty rows
//   fhog             — { amount, propertyCap, newBuildOnly }
//   fdsCapCapital    — Federal 5% Deposit Scheme price cap, capital city /
//                      regional centre; fdsCapOther — rest of state
//   h2bCapCapital    — Help to Buy price cap (capital); h2bCapOther — rest
//   revenueOffice    — name + URL
// Tiers verified against each state revenue office. NSW tiers are the
// FY2026-27 indexed schedule (from 1 Jul 2026); others unchanged FY2025-26.
// Scheme settings (grants, concessions, federal caps) verified against
// official government pages as at 5 Jul 2026. NOTE: VIC ($960k-$2M), ACT
// (>$1.455M), NT (quadratic/flat) and TAS ($50 base) use bands the plain
// cumulative-tier model can't express — handled in calcDuty().
const STATES = {
  nsw: {
    name: 'New South Wales',
    // FY2026-27 indexed brackets (rates unchanged, boundaries moved 1 Jul 2026).
    tiers: [[0,0.0125],[18000,0.015],[38000,0.0175],[103000,0.035],[387000,0.045],[1290000,0.055],[3870000,0.07]],
    fhbFull: 800000, fhbPartial: 1000000,
    fhbNote: 'Full exemption up to $800k, sliding concession to $1m — new and established homes.',
    fhog: { amount: 10000, propertyCap: 600000, newBuildOnly: true, note: 'New homes only — purchase ≤$600k (or land + build ≤$750k)' },
    fdsCapCapital: 1500000, fdsCapOther: 800000,
    h2bCapCapital: 1300000, h2bCapOther: 800000,
    revenueOffice: 'Revenue NSW',
    revenueUrl: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer'
  },
  vic: {
    name: 'Victoria',
    tiers: [[0,0.014],[25000,0.024],[130000,0.06]],
    fhbFull: 600000, fhbPartial: 750000,
    fhbNote: 'Full exemption up to $600k, sliding concession to $750k — new and established homes.',
    fhog: { amount: 10000, propertyCap: 750000, newBuildOnly: true, note: 'New homes only, ≤$750k' },
    fdsCapCapital: 950000, fdsCapOther: 650000,
    h2bCapCapital: 950000, h2bCapOther: 650000,
    revenueOffice: 'State Revenue Office Victoria',
    revenueUrl: 'https://www.sro.vic.gov.au/first-home-owner-grant'
  },
  qld: {
    name: 'Queensland',
    tiers: [[0,0],[5000,0.015],[75000,0.035],[540000,0.045],[1000000,0.0575]],
    // Established: full ≤$700k sliding to $800k. NEW homes: duty nil with NO
    // value cap for contracts from 1 May 2025 (fhbNewHomeExempt).
    fhbFull: 700000, fhbPartial: 800000, fhbNewHomeExempt: true,
    fhbNote: 'Established homes: full exemption to $700k, sliding to $800k. New homes: duty nil with no value cap (contracts from 1 May 2025). From 1 Aug 2026 buyers must be Australian citizens, permanent residents or specified foreign retirees.',
    // $30k FHOG CONTINUES for eligible contracts from 1 Jul 2026 (2026-27
    // Budget — the $15k reversion did not happen; pending Royal Assent).
    // capStrict: QLD's cap is "less than $750,000" (exclusive), unlike the
    // "not exceeding" caps elsewhere.
    fhog: { amount: 30000, propertyCap: 750000, capStrict: true, newBuildOnly: true, note: 'New homes only, <$750k — $30k extended to contracts from 1 Jul 2026 (2026-27 Budget, pending Royal Assent)' },
    // Gold Coast + Sunshine Coast count as regional centres = capital cap.
    fdsCapCapital: 1000000, fdsCapOther: 700000,
    h2bCapCapital: 1000000, h2bCapOther: 700000,
    revenueOffice: 'Queensland Revenue Office',
    revenueUrl: 'https://qro.qld.gov.au/grants/first-home-owner-grant/'
  },
  sa: {
    name: 'South Australia',
    // SA first-home duty relief is full (no value cap) for NEW homes,
    // off-the-plan and vacant land only — contracts ≥6 Jun 2024
    // (fhbNewHomeExempt). Nothing for established homes (fhbFull 0).
    tiers: [[0,0.01],[12000,0.02],[30000,0.03],[50000,0.035],[100000,0.04],[200000,0.0425],[250000,0.0475],[300000,0.05],[500000,0.055]],
    fhbFull: 0, fhbPartial: 0, fhbNewHomeExempt: true,
    fhbNote: 'Full relief on new homes, off-the-plan and vacant land only — no value cap (contracts from 6 Jun 2024). No relief for established homes.',
    // FHOG has NO property value cap for contracts on/after 6 Jun 2024.
    fhog: { amount: 15000, propertyCap: 0, newBuildOnly: true, note: 'New homes only, no property value cap (contracts on/after 6 Jun 2024)' },
    fdsCapCapital: 900000, fdsCapOther: 500000,
    h2bCapCapital: 900000, h2bCapOther: 500000,
    revenueOffice: 'RevenueSA',
    revenueUrl: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners'
  },
  wa: {
    name: 'Western Australia',
    tiers: [[0,0.019],[120000,0.0285],[150000,0.038],[360000,0.0475],[725000,0.0515]],
    // Exemption ≤$600k, concession to $800k for transactions from 7 May 2026
    // (was $500k/$700k). Enabling legislation expected late Jul 2026 —
    // retrospective refunds for the interim. Vacant land: ≤$450k / to $550k
    // (not modelled — no land property type here).
    fhbFull: 600000, fhbPartial: 800000,
    fhbNote: 'Exemption up to $600k, concession to $800k for transactions from 7 May 2026 (legislation expected late Jul 2026 — duty refunded retrospectively). Vacant land: exemption to $450k, concession to $550k.',
    // FHOG cap $800k south of the 26th parallel (transactions from 7 May
    // 2026, was $750k); $1m north. We apply the southern cap.
    fhog: { amount: 10000, propertyCap: 800000, newBuildOnly: true, note: 'New homes only — cap $800k south of the 26th parallel ($1m north), transactions from 7 May 2026' },
    fdsCapCapital: 850000, fdsCapOther: 600000,
    h2bCapCapital: 850000, h2bCapOther: 600000,
    revenueOffice: 'RevenueWA',
    revenueUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/first-home-owner-grant'
  },
  tas: {
    name: 'Tasmania',
    // TAS established-home FHB duty exemption EXPIRED 30 Jun 2026 — no duty
    // relief for settlements after that date (fhbFull 0).
    tiers: [[0,0],[3000,0.0175],[25000,0.0225],[75000,0.035],[200000,0.04],[375000,0.0425],[725000,0.045]],
    fhbFull: 0, fhbPartial: 0,
    fhbNote: 'Tasmania’s established-home FHB duty exemption ended 30 Jun 2026 — full duty now applies to first home buyers.',
    // $20k from 1 Jul 2026 ($10k base + $10k additional — additional
    // component subject to legislation passing). $30k window closed 30 Jun 2026.
    fhog: { amount: 20000, propertyCap: 0, newBuildOnly: true, note: '$20,000 from 1 Jul 2026 ($10k base + $10k additional, subject to legislation passing). New homes only' },
    fdsCapCapital: 700000, fdsCapOther: 550000,
    h2bCapCapital: 700000, h2bCapOther: 550000,
    revenueOffice: 'State Revenue Office Tasmania',
    revenueUrl: 'https://www.sro.tas.gov.au/about-us/grants'
  },
  act: {
    name: 'Australian Capital Territory',
    // Home Buyer Concession Scheme from 1 Jul 2026: NO duty for eligible
    // home buyers — no income test, NO property value limit. Eligibility:
    // no property owned in the previous 5 years + live in it for 1 year.
    tiers: [[0,0.0028],[260000,0.022],[300000,0.034],[500000,0.0432],[750000,0.059],[1000000,0.064]],
    fhbFull: Infinity, fhbPartial: Infinity,
    fhbNote: 'Home Buyer Concession Scheme from 1 Jul 2026: no duty for eligible buyers — no income test, no property value limit. Eligibility: no property owned in the previous 5 years + live in the home for 12 months.',
    fhog: { amount: 0, propertyCap: 0, newBuildOnly: false, note: 'ACT has no FHOG — the Home Buyer Concession Scheme (duty-free purchase) replaces it' },
    fdsCapCapital: 1000000, fdsCapOther: 1000000,
    h2bCapCapital: 1000000, h2bCapOther: 1000000,
    revenueOffice: 'ACT Revenue Office',
    revenueUrl: 'https://www.revenue.act.gov.au/home-buyer-assistance'
  },
  nt: {
    name: 'Northern Territory',
    // NT duty is a quadratic under $525k and a flat % of total above —
    // handled directly in calcDuty(); tiers left empty. FHB relief is the
    // House & Land Package Exemption: 100% duty exemption on house-and-land
    // packages, contracts 1 Jul 2022 – 30 Jun 2027, no cap, not means-tested
    // (fhbNewHomeExempt). No relief for established homes.
    tiers: [],
    fhbFull: 0, fhbPartial: 0, fhbNewHomeExempt: true,
    fhbNote: 'House & Land Package Exemption: 100% duty exemption on house-and-land packages (contracts 1 Jul 2022 – 30 Jun 2027, no cap, not means-tested). Off-the-plan apartments may not qualify. No relief for established homes.',
    // HomeGrown Territory grant $50k — NEW homes only, contracts
    // 1 Oct 2024 – 30 Sep 2027, no price cap, no income test. The old
    // $10k established-home stream ended 30 Sep 2025.
    fhog: { amount: 50000, propertyCap: 0, newBuildOnly: true, note: '$50,000 HomeGrown Territory grant — new homes only, contracts 1 Oct 2024 – 30 Sep 2027, no price cap, no income test (established-home stream ended 30 Sep 2025)' },
    // 5% Deposit Scheme NT split effective 1 Jul 2026: $750k Darwin / $600k rest.
    fdsCapCapital: 750000, fdsCapOther: 600000,
    h2bCapCapital: 600000, h2bCapOther: 600000,
    revenueOffice: 'Territory Revenue Office',
    revenueUrl: 'https://nt.gov.au/property/home-owner-assistance'
  }
};

// ── Federal scheme constants (verified July 2026) ─────────────────────────
// 5% Deposit Scheme: NO income caps since 1 Oct 2025 (the old $125k/$200k
// FHBG caps are gone), unlimited places, no waitlist — only the per-state
// price caps (fdsCap*) still gate eligibility.
const HELP_TO_BUY_INCOME_CAP_SINGLE = 103000; // from 1 Jul 2026
const HELP_TO_BUY_INCOME_CAP_COUPLE = 165000; // joint applicants OR single parents, from 1 Jul 2026
const HELP_TO_BUY_EQUITY_NEW = 0.40; // up to 40% government equity on new
const HELP_TO_BUY_EQUITY_EXIST = 0.30; // up to 30% on established
const FHSS_MAX_CONTRIB_ANNUAL = 15000;
const FHSS_MAX_TOTAL = 50000;

// ── Cumulative tiered duty (mirrors stamp-duty-calculator.js) ─────────────
function dutyAt(tiers, v) {
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

// State-aware standard duty. Mirrors stamp-duty-calculator.js calcDuty():
// most states are plain cumulative-marginal tiers, but VIC/ACT/NT/TAS have
// flat-of-total, quadratic or fixed-base bands the tier model can't express.
function calcDuty(stateCode, v) {
  const data = STATES[stateCode];
  if (!data || v <= 0) return 0;
  // NT: quadratic under $525k, flat % of TOTAL value above (not marginal).
  if (stateCode === 'nt') {
    if (v < 525000) { const Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
    if (v <= 3000000) return v * 0.0495;
    if (v <= 5000000) return v * 0.0575;
    return v * 0.0595;
  }
  let duty = dutyAt(data.tiers, v);
  // Bands that are a flat % of the TOTAL value (not marginal on the excess):
  if (stateCode === 'vic') {
    if (v > 960000 && v <= 2000000) duty = v * 0.055;
    else if (v > 2000000) duty = 110000 + (v - 2000000) * 0.065;
  } else if (stateCode === 'act' && v > 1455000) {
    duty = v * 0.0454;
  } else if (stateCode === 'tas') {
    // $50 minimum is also the base at $3,000 that carries up through every band.
    duty = (v <= 3000) ? 50 : duty + 50;
  }
  return duty;
}

// FHB stamp-duty payable (after concession), state-specific
function fhbDuty(stateData, stateCode, price, isNewBuild) {
  const stdDuty = calcDuty(stateCode, price);
  // New-home full exemptions with NO value cap: QLD (contracts ≥1 May 2025),
  // SA new/off-the-plan (≥6 Jun 2024), NT house-and-land packages (to 30 Jun 2027).
  if (stateData.fhbNewHomeExempt && isNewBuild) return 0;
  // No value-based relief: SA/NT established homes, TAS (established-home
  // exemption expired 30 Jun 2026).
  if (stateData.fhbFull <= 0) return stdDuty;
  // Full exemption (ACT uses Infinity — HBCS has no value limit from 1 Jul 2026).
  if (price <= stateData.fhbFull) {
    return 0;
  }
  // Taper between fhbFull and fhbPartial (NSW/VIC/QLD/WA).
  if (price <= stateData.fhbPartial && stateData.fhbPartial > stateData.fhbFull) {
    const slide = (stateData.fhbPartial - price) / (stateData.fhbPartial - stateData.fhbFull);
    return Math.max(0, stdDuty * (1 - slide));
  }
  return stdDuty;
}

// ── 5% Deposit Scheme eligibility (formerly First Home Guarantee) ─────────
// No income test since 1 Oct 2025 — only the per-state price cap applies.
function fdsEligibility(stateData, price, isCapitalCity) {
  const propertyCap = isCapitalCity ? stateData.fdsCapCapital : stateData.fdsCapOther;
  const priceOk = price <= propertyCap;
  return {
    eligible: priceOk,
    priceOk,
    propertyCap,
    lmiAvoided: priceOk ? estimateLmi(price * 0.95, price) : 0, // 95% LVR if using the scheme
  };
}

// LMI estimate (same tier table as mortgage-repayment)
function estimateLmi(loan, propertyValue) {
  if (!loan || !propertyValue) return 0;
  const lvr = loan / propertyValue;
  if (lvr <= 0.80) return 0;
  if (lvr <= 0.85) return Math.round(loan * 0.0080);
  if (lvr <= 0.90) return Math.round(loan * 0.0190);
  if (lvr <= 0.95) return Math.round(loan * 0.0340);
  return Math.round(loan * 0.0430);
}

// ── Help to Buy eligibility ───────────────────────────────────────────────
// Open since 5 Dec 2025 (CBA + Bank Australia; more lenders during 2026).
// Income caps from 1 Jul 2026 + the scheme's OWN price caps (differ from
// the 5% Deposit Scheme's).
function helpToBuyEligibility(stateData, price, income, isCouple, isNewBuild, isCapitalCity) {
  const cap = isCouple ? HELP_TO_BUY_INCOME_CAP_COUPLE : HELP_TO_BUY_INCOME_CAP_SINGLE;
  const propertyCap = isCapitalCity ? stateData.h2bCapCapital : stateData.h2bCapOther;
  const incomeOk = income <= cap;
  const priceOk = price <= propertyCap;
  const equityShare = isNewBuild ? HELP_TO_BUY_EQUITY_NEW : HELP_TO_BUY_EQUITY_EXIST;
  return {
    eligible: incomeOk && priceOk,
    incomeOk, priceOk,
    incomeCap: cap, propertyCap,
    equityShare,
    governmentEquity: Math.round(price * equityShare),
    yourBorrowingRequired: Math.round(price * (1 - equityShare - 0.02)), // 2% deposit
  };
}

// ── Render ────────────────────────────────────────────────────────────────
function calculate() {
  const stateCode = document.getElementById('state').value;
  const data = STATES[stateCode];
  const price = parseVal('price') || 0;
  const ptype = document.getElementById('ptype').value; // 'established' | 'new' | 'offplan'
  const income = parseVal('income') || 0;
  const isCouple = document.getElementById('couple').value === 'couple';
  const isCapitalCity = document.getElementById('location').value === 'capital';

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  if (!price || price <= 0) {
    if (!_isInit) _showErr('Please enter the property price.');
    return;
  }

  const isNewBuild = ptype === 'new' || ptype === 'offplan';

  // ── Stamp duty (without FHB) vs with FHB ───────────────────────────────
  const stdDuty = calcDuty(stateCode, price);
  const fhbDutyPayable = fhbDuty(data, stateCode, price, isNewBuild);
  const sdSaving = stdDuty - fhbDutyPayable;

  // ── FHOG ──────────────────────────────────────────────────────────────
  let fhog = 0;
  let fhogReason = '';
  if (data.fhog.amount > 0) {
    const underCap = data.fhog.propertyCap === 0
      || (data.fhog.capStrict ? price < data.fhog.propertyCap : price <= data.fhog.propertyCap);
    const isElig = (!data.fhog.newBuildOnly || isNewBuild) && underCap;
    if (isElig) {
      fhog = data.fhog.amount;
      fhogReason = data.fhog.note;
    } else if (data.fhog.newBuildOnly && !isNewBuild) {
      fhogReason = 'Not eligible — established home (FHOG is for new builds only)';
    } else if (data.fhog.propertyCap && !underCap) {
      fhogReason = 'Not eligible — price ' + (data.fhog.capStrict ? 'is not under' : 'exceeds') + ' the ' + fmt(data.fhog.propertyCap) + ' FHOG cap';
    } else {
      fhogReason = data.fhog.note;
    }
  } else {
    fhogReason = data.fhog.note || 'No FHOG in this state';
  }

  // ── 5% Deposit Scheme (formerly FHBG) — no income test since 1 Oct 2025 ─
  const fds = fdsEligibility(data, price, isCapitalCity);

  // ── Help to Buy (Federal shared-equity) — income still gates this one ──
  const helpToBuy = income > 0 ? helpToBuyEligibility(data, price, income, isCouple, isNewBuild, isCapitalCity) : null;

  // ── FHSS (Super withdrawal) ────────────────────────────────────────────
  // We don't have years of contributions data, so we surface the max
  // potential withdrawal as a planning figure.
  const fhssMaxPerPerson = isCouple ? FHSS_MAX_TOTAL * 2 : FHSS_MAX_TOTAL;

  // ── Total assistance (cash equivalents — direct $ benefit) ─────────────
  let totalCash = sdSaving + fhog;
  let totalCashNote = 'Stamp duty saving + FHOG';
  if (fds.eligible) {
    totalCash += fds.lmiAvoided;
    totalCashNote += ' + LMI avoided via 5% Deposit Scheme';
  }

  // ── Render output cards ────────────────────────────────────────────────
  let html = '';

  // Hero: total cash assistance
  html += '<div class="fhb-hero">' +
    '<div class="fhb-hero-label">Estimated total cash assistance</div>' +
    '<div class="fhb-hero-value">' + fmt(totalCash) + '</div>' +
    '<div class="fhb-hero-note">' + escHtml(totalCashNote) + '</div>' +
    '</div>';

  // Stamp duty section
  html += '<div class="fhb-section">' +
    '<div class="fhb-section-title">' + escHtml(data.name) + ' Stamp Duty</div>' +
    '<div class="fhb-row"><span>Standard duty payable</span><span class="fhb-row-val">' + fmt(stdDuty) + '</span></div>' +
    '<div class="fhb-row"><span>Your duty as a first home buyer</span><span class="fhb-row-val">' + fmt(fhbDutyPayable) + '</span></div>' +
    '<div class="fhb-row fhb-row-save"><span>Stamp duty saving</span><span class="fhb-row-val">' + fmt(sdSaving) + '</span></div>' +
    (data.fhbNote ? '<div class="fhb-row-note">' + escHtml(data.fhbNote) + '</div>' : '') +
    '</div>';

  // FHOG section
  html += '<div class="fhb-section">' +
    '<div class="fhb-section-title">' + escHtml(data.name) + ' First Home Owner Grant</div>' +
    (fhog > 0
      ? '<div class="fhb-row fhb-row-save"><span>You’re eligible for FHOG</span><span class="fhb-row-val">' + fmt(fhog) + '</span></div>'
      : '<div class="fhb-row fhb-row-na"><span>FHOG status</span><span class="fhb-row-val">Not eligible</span></div>'
    ) +
    '<div class="fhb-row-note">' + escHtml(fhogReason) + '</div>' +
    '</div>';

  // 5% Deposit Scheme section
  html += '<div class="fhb-section">' +
    '<div class="fhb-section-title">Federal 5% Deposit Scheme (was First Home Guarantee)</div>' +
    '<div class="fhb-row"><span>Income cap</span><span class="fhb-row-val">None — removed 1 Oct 2025</span></div>' +
    '<div class="fhb-row"><span>Property price cap (' + (isCapitalCity ? 'capital city / regional centre' : 'rest of state') + ')</span><span class="fhb-row-val">' + fmt(fds.propertyCap) + '</span></div>' +
    (fds.eligible
      ? '<div class="fhb-row fhb-row-save"><span>LMI avoided via 5% deposit</span><span class="fhb-row-val">' + fmt(fds.lmiAvoided) + '</span></div>' +
        '<div class="fhb-row-note">Eligible. Buy with a 5% deposit and pay no LMI. Since 1 Oct 2025: no income caps, unlimited places, no waitlist. Owner-occupiers who have never owned property in Australia — or haven’t owned in the last 10 years.</div>'
      : '<div class="fhb-row fhb-row-na"><span>5% Deposit Scheme status</span><span class="fhb-row-val">Not eligible</span></div>' +
        '<div class="fhb-row-note">Property price exceeds the ' + fmt(fds.propertyCap) + ' cap for this area. No income test applies — only the price cap.</div>'
    ) +
    '</div>';

  // Help to Buy section
  if (helpToBuy) {
    html += '<div class="fhb-section">' +
      '<div class="fhb-section-title">Federal Help to Buy (shared equity)</div>' +
      '<div class="fhb-row"><span>Income cap (' + (isCouple ? 'joint / single parent' : 'single') + ')</span><span class="fhb-row-val">' + fmt(helpToBuy.incomeCap) + '</span></div>' +
      '<div class="fhb-row"><span>Property price cap (' + (isCapitalCity ? 'capital city / regional centre' : 'rest of state') + ')</span><span class="fhb-row-val">' + fmt(helpToBuy.propertyCap) + '</span></div>' +
      (helpToBuy.eligible
        ? '<div class="fhb-row"><span>Government equity (' + Math.round(helpToBuy.equityShare * 100) + '% — ' + (isNewBuild ? 'new build' : 'established') + ')</span><span class="fhb-row-val">' + fmt(helpToBuy.governmentEquity) + '</span></div>' +
          '<div class="fhb-row fhb-row-save"><span>Your borrowing required (2% deposit + loan)</span><span class="fhb-row-val">' + fmt(helpToBuy.yourBorrowingRequired) + '</span></div>' +
          '<div class="fhb-row-note">Eligible. Applications open since 5 Dec 2025 via Commonwealth Bank and Bank Australia (more lenders during 2026); 10,000 places in FY2026-27. Income caps from 1 Jul 2026: $103,000 single / $165,000 joint or single-parent. The government takes its proportional share of any gain when you sell or refinance. Cannot be combined with the 5% Deposit Scheme — pick one.</div>'
        : '<div class="fhb-row fhb-row-na"><span>Help to Buy status</span><span class="fhb-row-val">Not eligible</span></div>' +
          '<div class="fhb-row-note">' + (!helpToBuy.incomeOk ? 'Income exceeds the ' + fmt(helpToBuy.incomeCap) + ' ' + (isCouple ? 'joint / single-parent' : 'single') + ' cap (from 1 Jul 2026). ' : '') +
          (!helpToBuy.priceOk ? 'Property price exceeds the ' + fmt(helpToBuy.propertyCap) + ' Help to Buy cap for this area. ' : '') + '</div>'
      ) +
      '</div>';
  }

  // FHSS section
  html += '<div class="fhb-section">' +
    '<div class="fhb-section-title">First Home Super Saver (FHSS)</div>' +
    '<div class="fhb-row"><span>Max voluntary contributions / year (per person)</span><span class="fhb-row-val">' + fmt(FHSS_MAX_CONTRIB_ANNUAL) + '</span></div>' +
    '<div class="fhb-row"><span>Max withdrawal cap (per person)</span><span class="fhb-row-val">' + fmt(FHSS_MAX_TOTAL) + '</span></div>' +
    (isCouple ? '<div class="fhb-row"><span>Combined as couple (both contributing)</span><span class="fhb-row-val">' + fmt(fhssMaxPerPerson) + '</span></div>' : '') +
    '<div class="fhb-row-note">Voluntary super contributions are taxed at 15% (vs your marginal rate), then withdrawn for the deposit at a concessional rate. Useful for buyers ~3-5 years from purchase. Doesn’t directly reduce purchase price — accumulates a tax-effective deposit.</div>' +
    '</div>';

  document.getElementById('results-container').innerHTML = html;
  document.getElementById('disclaimer').textContent = 'Estimates only. Eligibility varies by state and scheme. Help to Buy has annual place caps (10,000 in FY2026-27); the 5% Deposit Scheme is uncapped. Scheme settings as at July 2026 — verify your specific eligibility with the relevant authority (' + data.revenueOffice + ', Housing Australia, ATO) before relying on these figures.';
  document.getElementById('result').style.display = '';

  if (!_isInit) {
    const cta = document.getElementById('cta');
    if (cta) cta.style.display = 'block';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('fhb-grants', {
      propertyPrice: price,
      state: stateCode,
      propertyType: ptype,
      isCouple,
      sdSaving,
      fhog,
      fhbgEligible: fds.eligible,
      helpToBuyEligible: helpToBuy ? helpToBuy.eligible : null,
      totalCash
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'first-home-buyer',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan your purchase and investment',
    description: 'Model your full purchase costs, deposit timeline, and post-purchase cashflow — all free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '🎯', title: 'Federal Programs',
        links: [
          { text: '5% Deposit Scheme — firsthomebuyers.gov.au', href: 'https://www.firsthomebuyers.gov.au/' },
          { text: 'Housing Australia: First Home Guarantee (5% Deposit Scheme)', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'Help to Buy Scheme', href: 'https://www.housingaustralia.gov.au/help-to-buy' },
          { text: 'First Home Super Saver Scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home Guide', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      },
      {
        icon: '📍', title: 'State Revenue Offices',
        links: [
          { text: 'Revenue NSW: First Home Buyer', href: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer' },
          { text: 'SRO Victoria: First Home Owner Grant', href: 'https://www.sro.vic.gov.au/first-home-owner-grant' },
          { text: 'QRO: First Home Owner Grant', href: 'https://qro.qld.gov.au/grants/first-home-owner-grant/' },
          { text: 'RevenueSA: First Home Owners', href: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners' },
          { text: 'RevenueWA: First Home Owner Grant', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/first-home-owner-grant' }
        ]
      },
      {
        icon: '💰', title: 'Tax & Super',
        links: [
          { text: 'ATO: Capital Gains Tax Guide', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ATO: PPOR Exemption', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/property-and-capital-gains-tax/your-main-residence-home' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      }
    ],
    disclaimer: 'Grant eligibility and amounts change frequently. Verify with your state’s housing authority + Housing Australia + the ATO before purchasing. This calculator uses scheme settings verified as at July 2026.'
  },
  share: {
    url: 'https://equitysight.app/tools/first-home-buyer-grants-calculator',
    text: 'Just calculated my first home buyer assistance on EquitySight!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' },
    { href: '/tools/cost-of-purchase-calculator', icon: '💵', label: 'Cost of Purchase' },
    { href: '/tools/deposit-calculator', icon: '🪙', label: 'Deposit Calculator' },
    { href: '/tools/borrowing-power-calculator', icon: '🏦', label: 'Borrowing Power' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/cost-of-purchase-calculator', text: 'Cost of Purchase' },
    { href: '/tools/borrowing-power-calculator', text: 'Borrowing Power' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'QLD couple — $650k new build, $210k combined income, Brisbane',
      inputs: [
        { k: 'Price', v: '$650,000' },
        { k: 'State', v: 'QLD' },
        { k: 'Property type', v: 'New build' },
        { k: 'Couple income', v: '$210,000 combined' }
      ],
      outputs: [
        { k: 'Stamp duty saving', v: '$22,275 (new-home duty nil, no value cap)' },
        { k: 'FHOG (new builds)', v: '$30,000' },
        { k: '5% Deposit Scheme', v: 'Eligible — no income caps since Oct 2025' },
        { k: 'Total cash assistance', v: '~$73,270 (incl. ~$21,000 LMI avoided)' }
      ]
    },
    {
      label: 'VIC single — $580k established, $95k income, Melbourne',
      inputs: [
        { k: 'Price', v: '$580,000' },
        { k: 'State', v: 'VIC' },
        { k: 'Property type', v: 'Established' },
        { k: 'Single income', v: '$95,000' }
      ],
      outputs: [
        { k: 'Stamp duty saving', v: '$29,870 (full exemption ≤ $600k)' },
        { k: 'FHOG', v: '$0 (established homes not eligible)' },
        { k: '5% Deposit Scheme', v: 'Eligible — also under the $103k Help to Buy cap' },
        { k: 'Total cash assistance', v: '~$48,600 (incl. ~$18,700 LMI avoided)' }
      ]
    },
    {
      label: 'NSW couple — $920k apartment, $185k combined, Sydney',
      inputs: [
        { k: 'Price', v: '$920,000' },
        { k: 'State', v: 'NSW' },
        { k: 'Property type', v: 'Established' },
        { k: 'Couple income', v: '$185,000 combined' }
      ],
      outputs: [
        { k: 'Stamp duty saving', v: '~$14,235 (sliding concession $800k–$1m)' },
        { k: 'FHOG', v: '$0 (established)' },
        { k: '5% Deposit Scheme', v: 'Eligible — under the $1.5m Sydney cap, no income test' },
        { k: 'Total cash assistance', v: '~$43,950 (incl. ~$29,700 LMI avoided)' }
      ]
    }
  ],
  faq: [
    { q: 'Can I combine multiple first home buyer programs?',
      a: 'Yes, mostly. State stamp duty concessions stack with the state FHOG (if you qualify for both) and the FHSS. The federal 5% Deposit Scheme (5% deposit, no LMI) is a separate add-on. Help to Buy and the 5% Deposit Scheme are mutually exclusive — pick one. You can use Help to Buy in combination with state SD concession + FHOG + FHSS.' },
    { q: 'Am I eligible for the First Home Owner Grant?',
      a: 'You must be buying or building a NEW home (not established), be an Australian citizen or permanent resident, be 18+, intend to live in the home as principal residence for at least 12 months starting within 12 months of settlement, and meet the state’s price cap where one applies (SA, TAS and the NT have no FHOG price cap). Eligibility rules vary by state — see the FHOG section above for your state’s specifics.' },
    { q: 'What is the 5% Deposit Scheme (formerly the First Home Guarantee)?',
      a: 'Federal scheme letting eligible first home buyers purchase with as little as a 5% deposit — the government guarantees the lender against the shortfall, so you don’t pay LMI. From 1 October 2025 the scheme has NO income caps, unlimited places and no waitlist. You must be an owner-occupier and either a first home buyer or someone who hasn’t owned property in the last 10 years. Property price caps still apply by state and region — e.g. $1,500,000 in Sydney and NSW regional centres, $1,000,000 in Brisbane, the Gold Coast and the Sunshine Coast.' },
    { q: 'What is Help to Buy?',
      a: 'Federal shared-equity scheme where the government takes a property equity stake (up to 40% on new builds, 30% on established) in exchange for reducing your borrowing requirement. You contribute as little as 2% deposit. Applications opened 5 December 2025 through Commonwealth Bank and Bank Australia, with more lenders joining during 2026, and there are 10,000 places in FY2026-27. Income caps from 1 July 2026: $103,000 single / $165,000 for joint applicants or single parents. Help to Buy also has its own property price caps, which differ from the 5% Deposit Scheme’s (e.g. $1,300,000 in Sydney vs $1,500,000). When you sell, the government takes its proportional share of any capital gain. You can’t use Help to Buy + the 5% Deposit Scheme together — pick one.' },
    { q: 'What is the First Home Super Saver (FHSS)?',
      a: 'You can voluntarily contribute up to $15,000 per year (max $50,000 total) of pre-tax income into super, then later withdraw it (plus deemed earnings) for your deposit. The tax saving comes from contributions being taxed at 15% inside super vs your marginal rate (32-47%). Most useful for buyers 3-5 years away from purchase. Withdrawal application takes ~25 business days — start the paperwork before you start house hunting.' },
    { q: 'Does the stamp duty concession apply to established homes or only new builds?',
      a: 'It varies by state. NSW, VIC and WA cover both new and established homes. QLD covers both, and new homes get duty nil with no value cap (contracts from 1 May 2025). SA’s relief applies only to new builds, off-the-plan and vacant land. Tasmania’s established-home exemption expired 30 June 2026 — TAS first home buyers now pay full duty on established homes. From 1 July 2026 the ACT charges eligible home buyers no duty at all, with no income test and no value limit. The NT offers relief only via its House & Land Package Exemption. All states’ FHOG (separate cash grant) is restricted to new builds.' },
    { q: 'Can I get help if I’m buying as an investor?',
      a: 'No. Every first home buyer program requires you to live in the home as your principal place of residence (PPR) for at least 6-12 months starting within 12 months of settlement. If you buy as an investor or move out within the qualifying period, the concession is clawed back. The federal Help to Buy scheme and the 5% Deposit Scheme both disqualify investors entirely — owner-occupiers only.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '💵', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase' },
    { group: 'Other Tools', icon: '🪙', href: '/tools/deposit-calculator', label: 'Deposit Calculator' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/springfield-lakes/', label: 'Springfield Lakes QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'Our Methodology' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('fhb-grants');
  calculate();
  _isInit = false;

  ['price','income'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function(){ fmtInput(this); calculate(); });
  });
  ['state','ptype','couple','location'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', calculate);
  });
  var calcBtn = document.getElementById('fhb-calc-btn');
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'fhb-grants'});
    calculate();
  });
});

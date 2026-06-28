/* ═══ FHB GRANTS & CONCESSIONS CALCULATOR ═══
 *
 * Best-in-market Australian First Home Buyer assistance calculator.
 * What competitors don't do that this does:
 *
 *   • Computes the ACTUAL dollar saving per program for the user's
 *     specific situation, not just "Full exemption / Reduces with price".
 *     We compute baseline stamp duty for the price + state, then subtract
 *     concession, so the user sees "you save $24,757".
 *   • Federal schemes overlaid in the same view: First Home Guarantee
 *     (5% deposit, no LMI), Help to Buy (2% shared-equity), First Home
 *     Super Saver ($50k withdrawal).
 *   • Income + couple-status awareness for eligibility — most calculators
 *     ignore the income cap on FHBG ($125k single / $200k couple).
 *   • Total-assistance figure at the top: one clear number for "your
 *     household gets $X in first-home-buyer help on this purchase".
 *
 * Federal program caps (FY 2025-26):
 *   • FHBG income cap: $125,000 single, $200,000 combined couple
 *   • Help to Buy income cap: $90,000 single, $120,000 combined couple
 *   • FHSS: max $15,000/yr contributions, $50,000 total withdrawal
 *
 * State FHBG property price caps vary by capital city / regional / other.
 * We use the capital-city cap as the indicative figure here.
 */

// ── State stamp duty + FHB schedule (FY 2025-26) ──────────────────────────
//
// Each state defines:
//   tiers           — cumulative-tiered standard duty (mirrors stamp-duty-calculator.js)
//   fhbFull         — full FHB exemption price (if FHB qualifies)
//   fhbPartial      — partial-concession upper bound
//   fhbAppliesNewOnly — true if SD concession is restricted to new builds (SA)
//   fhog            — { amount, propertyCap, newBuildOnly }
//   fhbgCapCapital  — Federal First Home Guarantee property cap in this state's capital
//   fhbgCapOther    — Federal FHBG cap in regional / other areas
//   revenueOffice   — name + URL
const STATES = {
  nsw: {
    name: 'New South Wales',
    tiers: [[0,0],[14000,0.0125],[30000,0.015],[130000,0.0175],[205000,0.035],[305000,0.04],[405000,0.045],[550000,0.055]],
    fhbFull: 800000, fhbPartial: 1000000, fhbAppliesNewOnly: false,
    fhog: { amount: 10000, propertyCap: 600000, newBuildOnly: true, note: 'New homes only, ≤$600k' },
    fhbgCapCapital: 900000, fhbgCapOther: 750000,
    revenueOffice: 'Revenue NSW',
    revenueUrl: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer'
  },
  vic: {
    name: 'Victoria',
    tiers: [[0,0],[25000,0.014],[130000,0.024],[440000,0.055],[870000,0.065]],
    fhbFull: 600000, fhbPartial: 750000, fhbAppliesNewOnly: false,
    fhog: { amount: 10000, propertyCap: 750000, newBuildOnly: true, note: 'New homes only, ≤$750k' },
    fhbgCapCapital: 800000, fhbgCapOther: 650000,
    revenueOffice: 'State Revenue Office Victoria',
    revenueUrl: 'https://www.sro.vic.gov.au/first-home-owner-grant'
  },
  qld: {
    name: 'Queensland',
    tiers: [[0,0],[5000,0.015],[75000,0.035],[540000,0.045],[1000000,0.0575]],
    fhbFull: 500000, fhbPartial: 550000, fhbAppliesNewOnly: false,
    fhog: { amount: 30000, propertyCap: 750000, newBuildOnly: true, note: 'New homes only, ≤$750k (raised May 2024)' },
    fhbgCapCapital: 700000, fhbgCapOther: 550000,
    revenueOffice: 'Queensland Revenue Office',
    revenueUrl: 'https://qro.qld.gov.au/grants/first-home-owner-grant/'
  },
  sa: {
    name: 'South Australia',
    tiers: [[0,0],[16000,0.015],[19000,0.03],[250000,0.035],[300000,0.04]],
    fhbFull: 650000, fhbPartial: 700000, fhbAppliesNewOnly: true,
    fhog: { amount: 15000, propertyCap: 650000, newBuildOnly: true, note: 'New homes only, no price cap (FHOG)' },
    fhbgCapCapital: 600000, fhbgCapOther: 500000,
    revenueOffice: 'RevenueSA',
    revenueUrl: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners'
  },
  wa: {
    name: 'Western Australia',
    tiers: [[0,0],[2000,0.01],[4000,0.02],[500000,0.035],[1000000,0.0475]],
    fhbFull: 430000, fhbPartial: 530000, fhbAppliesNewOnly: false,
    fhog: { amount: 10000, propertyCap: 750000, newBuildOnly: true, note: 'New homes only, ≤$750k (south of 26th parallel)' },
    fhbgCapCapital: 600000, fhbgCapOther: 450000,
    revenueOffice: 'RevenueWA',
    revenueUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/first-home-owner-grant'
  },
  tas: {
    name: 'Tasmania',
    tiers: [[0,0],[3000,0.036],[100000,0.041],[150000,0.0425],[250000,0.0475]],
    fhbFull: 750000, fhbPartial: 750000, fhbAppliesNewOnly: false, fhbConcessionRate: 0.50, // 50% reduction not full exemption
    fhog: { amount: 10000, propertyCap: 0, newBuildOnly: true, note: 'New homes only' },
    fhbgCapCapital: 600000, fhbgCapOther: 450000,
    revenueOffice: 'State Revenue Office Tasmania',
    revenueUrl: 'https://www.sro.tas.gov.au/about-us/grants'
  },
  act: {
    name: 'Australian Capital Territory',
    tiers: [[0,0],[7500,0.0125],[30000,0.02],[200000,0.035]],
    fhbFull: 1000000, fhbPartial: 1000000, fhbAppliesNewOnly: false,
    fhog: { amount: 0, propertyCap: 0, newBuildOnly: false, note: 'ACT does not have an FHOG; HBCS replaces it' },
    fhbgCapCapital: 750000, fhbgCapOther: 750000,
    revenueOffice: 'ACT Revenue Office',
    revenueUrl: 'https://www.revenue.act.gov.au/home-buyer-assistance'
  },
  nt: {
    name: 'Northern Territory',
    tiers: [[0,0],[3000,0.0075],[100000,0.01],[150000,0.015],[250000,0.025]],
    fhbFull: 650000, fhbPartial: 650000, fhbAppliesNewOnly: false, fhbDiscountMax: 50000, // discount capped at $50k
    fhog: { amount: 10000, propertyCap: 0, newBuildOnly: true, note: 'New homes only, no price cap (FHOG)' },
    fhbgCapCapital: 600000, fhbgCapOther: 600000,
    revenueOffice: 'Territory Revenue Office',
    revenueUrl: 'https://nt.gov.au/property/home-owner-assistance'
  }
};

// ── Federal scheme constants (FY 2025-26) ─────────────────────────────────
const FHBG_INCOME_CAP_SINGLE = 125000;
const FHBG_INCOME_CAP_COUPLE = 200000;
const HELP_TO_BUY_INCOME_CAP_SINGLE = 90000;
const HELP_TO_BUY_INCOME_CAP_COUPLE = 120000;
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

// FHB stamp-duty payable (after concession), state-specific
function fhbDuty(stateData, price, isNewBuild) {
  const stdDuty = dutyAt(stateData.tiers, price);
  if (stateData.fhbAppliesNewOnly && !isNewBuild) return stdDuty; // SA: only new builds get FHB SD exemption
  if (price <= stateData.fhbFull) {
    if (stateData.fhbConcessionRate) return stdDuty * stateData.fhbConcessionRate; // TAS: 50% reduction
    if (stateData.fhbDiscountMax) return Math.max(0, stdDuty - stateData.fhbDiscountMax); // NT: cap discount
    return 0; // full exemption
  }
  if (price <= stateData.fhbPartial && stateData.fhbPartial > stateData.fhbFull) {
    const slide = (stateData.fhbPartial - price) / (stateData.fhbPartial - stateData.fhbFull);
    if (stateData.fhbConcessionRate) {
      const fullConcession = stdDuty * stateData.fhbConcessionRate;
      return fullConcession + (stdDuty - fullConcession) * (1 - slide);
    }
    return Math.max(0, stdDuty * (1 - slide));
  }
  return stdDuty;
}

// ── FHBG eligibility ──────────────────────────────────────────────────────
function fhbgEligibility(stateData, price, income, isCouple, isCapitalCity) {
  const incomeCap = isCouple ? FHBG_INCOME_CAP_COUPLE : FHBG_INCOME_CAP_SINGLE;
  const propertyCap = isCapitalCity ? stateData.fhbgCapCapital : stateData.fhbgCapOther;
  const incomeOk = income <= incomeCap;
  const priceOk = price <= propertyCap;
  return {
    eligible: incomeOk && priceOk,
    incomeOk, priceOk,
    incomeCap, propertyCap,
    lmiAvoided: incomeOk && priceOk ? estimateLmi(price * 0.95, price) : 0, // 95% LVR if using FHBG
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
function helpToBuyEligibility(price, income, isCouple, isNewBuild) {
  const cap = isCouple ? HELP_TO_BUY_INCOME_CAP_COUPLE : HELP_TO_BUY_INCOME_CAP_SINGLE;
  const equityShare = isNewBuild ? HELP_TO_BUY_EQUITY_NEW : HELP_TO_BUY_EQUITY_EXIST;
  return {
    eligible: income <= cap,
    incomeCap: cap,
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

  if (!price || price <= 0) {
    if (!_isInit) alert('Please enter the property price.');
    return;
  }

  const isNewBuild = ptype === 'new' || ptype === 'offplan';

  // ── Stamp duty (without FHB) vs with FHB ───────────────────────────────
  const stdDuty = dutyAt(data.tiers, price);
  const fhbDutyPayable = fhbDuty(data, price, isNewBuild);
  const sdSaving = stdDuty - fhbDutyPayable;

  // ── FHOG ──────────────────────────────────────────────────────────────
  let fhog = 0;
  let fhogReason = '';
  if (data.fhog.amount > 0) {
    const isElig = (!data.fhog.newBuildOnly || isNewBuild)
      && (data.fhog.propertyCap === 0 || price <= data.fhog.propertyCap);
    if (isElig) {
      fhog = data.fhog.amount;
      fhogReason = data.fhog.note;
    } else if (data.fhog.newBuildOnly && !isNewBuild) {
      fhogReason = 'Not eligible — established home (FHOG is for new builds only)';
    } else if (data.fhog.propertyCap && price > data.fhog.propertyCap) {
      fhogReason = 'Not eligible — price exceeds $' + fmt(data.fhog.propertyCap) + ' FHOG cap';
    } else {
      fhogReason = data.fhog.note;
    }
  } else {
    fhogReason = data.fhog.note || 'No FHOG in this state';
  }

  // ── FHBG (Federal First Home Guarantee) ────────────────────────────────
  const fhbg = income > 0 ? fhbgEligibility(data, price, income, isCouple, isCapitalCity) : null;

  // ── Help to Buy (Federal shared-equity) ────────────────────────────────
  const helpToBuy = income > 0 ? helpToBuyEligibility(price, income, isCouple, isNewBuild) : null;

  // ── FHSS (Super withdrawal) ────────────────────────────────────────────
  // We don't have years of contributions data, so we surface the max
  // potential withdrawal as a planning figure.
  const fhssMaxWithdrawal = FHSS_MAX_TOTAL;
  const fhssMaxPerPerson = isCouple ? FHSS_MAX_TOTAL * 2 : FHSS_MAX_TOTAL;

  // ── Total assistance (cash equivalents — direct $ benefit) ─────────────
  let totalCash = sdSaving + fhog;
  let totalCashNote = 'Stamp duty saving + FHOG';
  if (fhbg && fhbg.eligible) {
    totalCash += fhbg.lmiAvoided;
    totalCashNote += ' + LMI avoided via FHBG';
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

  // FHBG section
  if (fhbg) {
    html += '<div class="fhb-section">' +
      '<div class="fhb-section-title">Federal First Home Guarantee (FHBG)</div>' +
      '<div class="fhb-row"><span>Income cap (' + (isCouple ? 'couple' : 'single') + ')</span><span class="fhb-row-val">$' + fmt(fhbg.incomeCap) + '</span></div>' +
      '<div class="fhb-row"><span>Property price cap (' + (isCapitalCity ? 'capital city' : 'regional') + ')</span><span class="fhb-row-val">$' + fmt(fhbg.propertyCap) + '</span></div>' +
      (fhbg.eligible
        ? '<div class="fhb-row fhb-row-save"><span>LMI avoided via 5% deposit</span><span class="fhb-row-val">' + fmt(fhbg.lmiAvoided) + '</span></div>' +
          '<div class="fhb-row-note">Eligible. You can buy with a 5% deposit, no LMI. Annual scheme places capped — apply early via participating lenders.</div>'
        : '<div class="fhb-row fhb-row-na"><span>FHBG status</span><span class="fhb-row-val">Not eligible</span></div>' +
          '<div class="fhb-row-note">' + (!fhbg.incomeOk ? 'Income exceeds $' + fmt(fhbg.incomeCap) + ' ' + (isCouple ? 'couple' : 'single') + ' cap. ' : '') +
          (!fhbg.priceOk ? 'Property price exceeds $' + fmt(fhbg.propertyCap) + ' cap for this area. ' : '') + '</div>'
      ) +
      '</div>';
  }

  // Help to Buy section
  if (helpToBuy) {
    html += '<div class="fhb-section">' +
      '<div class="fhb-section-title">Federal Help to Buy (shared equity)</div>' +
      '<div class="fhb-row"><span>Income cap (' + (isCouple ? 'couple' : 'single') + ')</span><span class="fhb-row-val">$' + fmt(helpToBuy.incomeCap) + '</span></div>' +
      (helpToBuy.eligible
        ? '<div class="fhb-row"><span>Government equity (' + Math.round(helpToBuy.equityShare * 100) + '% — ' + (isNewBuild ? 'new build' : 'established') + ')</span><span class="fhb-row-val">' + fmt(helpToBuy.governmentEquity) + '</span></div>' +
          '<div class="fhb-row fhb-row-save"><span>Your borrowing required (2% deposit + loan)</span><span class="fhb-row-val">' + fmt(helpToBuy.yourBorrowingRequired) + '</span></div>' +
          '<div class="fhb-row-note">Eligible. Government takes equity stake — you pay back proportional gain when you sell or refinance. Annual places capped (~10,000/year nationwide). Different to FHBG (cash assistance) — you can only use one at a time.</div>'
        : '<div class="fhb-row fhb-row-na"><span>Help to Buy status</span><span class="fhb-row-val">Income exceeds $' + fmt(helpToBuy.incomeCap) + ' cap</span></div>'
      ) +
      '</div>';
  }

  // FHSS section
  html += '<div class="fhb-section">' +
    '<div class="fhb-section-title">First Home Super Saver (FHSS)</div>' +
    '<div class="fhb-row"><span>Max voluntary contributions / year (per person)</span><span class="fhb-row-val">$' + fmt(FHSS_MAX_CONTRIB_ANNUAL) + '</span></div>' +
    '<div class="fhb-row"><span>Max withdrawal cap (per person)</span><span class="fhb-row-val">$' + fmt(FHSS_MAX_TOTAL) + '</span></div>' +
    (isCouple ? '<div class="fhb-row"><span>Combined as couple (both contributing)</span><span class="fhb-row-val">$' + fmt(fhssMaxPerPerson) + '</span></div>' : '') +
    '<div class="fhb-row-note">Voluntary super contributions are taxed at 15% (vs your marginal rate), then withdrawn for the deposit at a concessional rate. Useful for buyers ~3-5 years from purchase. Doesn’t directly reduce purchase price — accumulates a tax-effective deposit.</div>' +
    '</div>';

  document.getElementById('results-container').innerHTML = html;
  document.getElementById('disclaimer').textContent = 'Estimates only. Eligibility varies by state and scheme. FHBG and Help to Buy have annual place caps. Verify your specific eligibility with the relevant authority (' + data.revenueOffice + ', Housing Australia, ATO) before relying on these figures.';
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
      fhbgEligible: fhbg ? fhbg.eligible : null,
      helpToBuyEligible: helpToBuy ? helpToBuy.eligible : null,
      totalCash
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'first-home-buyer',
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
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
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
    disclaimer: 'Grant eligibility and amounts change frequently. Verify with your state’s housing authority + Housing Australia + the ATO before purchasing. This calculator uses FY 2025-26 published figures.'
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
      label: 'QLD couple — $650k new build, $140k combined income, Brisbane',
      inputs: [
        { k: 'Price', v: '$650,000' },
        { k: 'State', v: 'QLD' },
        { k: 'Property type', v: 'New build' },
        { k: 'Couple income', v: '$140,000 combined' }
      ],
      outputs: [
        { k: 'Stamp duty saving', v: '~$12,000' },
        { k: 'FHOG (new builds)', v: '$30,000' },
        { k: 'FHBG eligible', v: 'Yes — 5% deposit, no LMI' },
        { k: 'Total cash assistance', v: '~$59,000+' }
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
        { k: 'Stamp duty saving', v: '~$31,070 (full exemption)' },
        { k: 'FHOG', v: '$0 (established homes not eligible)' },
        { k: 'FHBG eligible', v: 'Yes — 5% deposit, no LMI' },
        { k: 'Total cash assistance', v: '~$45,000' }
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
        { k: 'Stamp duty saving', v: '~$18,000 (partial concession)' },
        { k: 'FHOG', v: '$0 (established)' },
        { k: 'FHBG eligible', v: 'Yes (under $900k? — check FHBG cap)' },
        { k: 'Total cash assistance', v: '~$28,000' }
      ]
    }
  ],
  faq: [
    { q: 'Can I combine multiple first home buyer programs?',
      a: 'Yes, mostly. State stamp duty concessions stack with the state FHOG (if you qualify for both) and the FHSS. The federal FHBG (5% deposit, no LMI) is a separate add-on. Help to Buy and FHBG are mutually exclusive — pick one. You can use Help to Buy in combination with state SD concession + FHOG + FHSS.' },
    { q: 'Am I eligible for the First Home Owner Grant?',
      a: 'You must be buying or building a NEW home (not established), be an Australian citizen or permanent resident, be 18+, intend to live in the home as principal residence for at least 12 months starting within 12 months of settlement, and meet the state’s price cap. Eligibility rules vary by state — see the FHOG section above for your state’s specifics.' },
    { q: 'What is the First Home Guarantee Scheme (FHBG)?',
      a: 'Federal scheme letting eligible first home buyers purchase with as little as a 5% deposit — the government guarantees the lender against the LMI shortfall, so you don’t pay LMI. Income caps: $125,000 single / $200,000 combined couple. Property price caps vary by state and region. Annual scheme places are capped (~50,000 nationwide) — apply early in the financial year via a participating lender.' },
    { q: 'What is Help to Buy?',
      a: 'Federal shared-equity scheme where the government takes a property equity stake (up to 40% on new builds, 30% on established) in exchange for reducing your borrowing requirement. You contribute as little as 2% deposit. Lower income cap than FHBG: $90,000 single / $120,000 couple. When you sell, the government takes its proportional share of any capital gain. You can’t use Help to Buy + FHBG together — pick one.' },
    { q: 'What is the First Home Super Saver (FHSS)?',
      a: 'You can voluntarily contribute up to $15,000 per year (max $50,000 total) of pre-tax income into super, then later withdraw it (plus deemed earnings) for your deposit. The tax saving comes from contributions being taxed at 15% inside super vs your marginal rate (32-47%). Most useful for buyers 3-5 years away from purchase. Withdrawal application takes ~25 business days — start the paperwork before you start house hunting.' },
    { q: 'Does the stamp duty concession apply to established homes or only new builds?',
      a: 'Most states’ SD concessions apply to BOTH new and established homes — NSW, VIC, QLD, WA, TAS, ACT, NT. South Australia is the exception: SA’s first home buyer SD exemption applies only to new builds (and vacant land where a new home will be built). All states’ FHOG (separate cash grant) is restricted to new builds.' },
    { q: 'Can I get help if I’m buying as an investor?',
      a: 'No. Every first home buyer program requires you to live in the home as your principal place of residence (PPR) for at least 6-12 months starting within 12 months of settlement. If you buy as an investor or move out within the qualifying period, the concession is clawed back. The federal Help to Buy scheme also disqualifies investors entirely.' }
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

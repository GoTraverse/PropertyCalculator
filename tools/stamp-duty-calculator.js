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
 * at 5 July 2026 (NSW brackets CPI-indexed 1 Jul 2026; WA FHB thresholds
 * raised 7 May 2026; TAS established-home FHB exemption expired 30 Jun 2026;
 * ACT HBCS uncapped from 1 Jul 2026). Each state revenue office has the
 * canonical reference; URLs
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
    // FHB thresholds raised for transactions from 7 May 2026 (2026-27 Housing
    // Taxation Package; enabling legislation est. late Jul 2026, retrospective).
    fhbFull: 600000, fhbPartial: 800000, fhbExemption: Infinity,
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
    // FHB established-home exemption EXPIRED 30 Jun 2026 (SRO: "not available for
    // transactions settling after 30 June 2026") — no FHB duty relief in TAS now.
    fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
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
    // HBCS from 1 Jul 2026: NO income test, NO property value limit — eligible
    // buyers (no property owned in prior 5 yrs) pay $0 duty at any price.
    fhbFull: Infinity, fhbPartial: Infinity, fhbExemption: Infinity,
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

// LMI tier table (industry-average; see mortgage-repayment-calculator.js
// for the same table). Real LMI varies by lender + insurer + borrower.
function estimateLmiTier(lvr) {
  if (lvr <= 0.80) return { rate: 0, label: 'No LMI (LVR ≤ 80%)' };
  if (lvr <= 0.85) return { rate: 0.0080, label: '~0.8% of loan' };
  if (lvr <= 0.90) return { rate: 0.0190, label: '~1.9% of loan' };
  if (lvr <= 0.95) return { rate: 0.0340, label: '~3.4% of loan' };
  return { rate: 0.0430, label: '~4.3% of loan (>95% LVR)' };
}

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

function updateState() {
  var state = document.getElementById('state').value;
  var data = stateData[state];
  document.getElementById('r-duty-label').textContent = data.dutyName;
  document.getElementById('r-foreign-label').textContent = 'Foreign Surcharge (' + Math.round(data.foreignRate * 100) + '%)';
  var foreignCheck = document.getElementById('foreign-check');
  if (data.foreignRate > 0) {
    foreignCheck.style.display = '';
    document.getElementById('foreign').checked = false;
  } else {
    foreignCheck.style.display = 'none';
    document.getElementById('foreign').checked = false;
  }
}

function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var state = document.getElementById('state').value;
  var data = stateData[state];
  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) _showErr('Please enter the purchase price.'); return; }

  var isFHB = document.getElementById('fhb').checked;
  var isForeign = document.getElementById('foreign').checked;
  var isLand = document.getElementById('ptype').value === 'land';
  var depositPctEl = document.getElementById('deposit-pct');
  var depositPct = depositPctEl ? (parseFloat(depositPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;

  var baseDuty = calcDuty(state, val);
  var dutyResult = isFHB && !isLand ? applyFhbConcession(state, val, baseDuty) : { duty: baseDuty, note: '' };
  var duty = dutyResult.duty;
  var note = dutyResult.note;

  var foreignAmt = isForeign ? val * data.foreignRate : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // \u2500\u2500 Reg fees + LMI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var reg = REG_FEES[state] || { mortgage: 200, transfer: 200 };
  var regTotal = reg.mortgage + reg.transfer;
  // Conveyancing / legal: industry-typical $1,500-$2,500 \u2014 use mid-point
  var conveyancing = 1800;
  var lmiTier = estimateLmiTier(lvr);
  // FHBG eligibility shortcut: if FHB + LVR > 80%, assume FHBG removes LMI
  // (full eligibility check is in the FHB grants calculator)
  var lmi = (isFHB && lvr > 0.80) ? 0 : Math.round(loanAmount * lmiTier.rate);
  var lmiLabel = (isFHB && lvr > 0.80)
    ? '$0 (FHBG eligibility assumed \u2014 check FHB grants calc)'
    : lmi > 0 ? (fmt(lmi) + ' \u00b7 ' + lmiTier.label) : '$0 (no LMI)';

  var upfrontTotal = total + lmi + regTotal + conveyancing;

  // \u2500\u2500 Render core stats \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  document.getElementById('r-duty').textContent = fmt(duty);
  document.getElementById('r-foreign').textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';

  // \u2500\u2500 New: LMI + reg fees + upfront total \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var lvrEl = document.getElementById('r-lvr');
  if (lvrEl) lvrEl.textContent = (lvr * 100).toFixed(1) + '% (' + fmt(loanAmount) + ' loan)';
  var lmiEl = document.getElementById('r-lmi');
  if (lmiEl) lmiEl.textContent = lmiLabel;
  var regEl = document.getElementById('r-reg');
  if (regEl) regEl.textContent = fmt(regTotal) + ' (mortgage $' + reg.mortgage + ' + transfer $' + reg.transfer + ')';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (typical $1,500\u2013$2,500)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  // \u2500\u2500 Cross-state comparison \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Show what the SAME purchase would cost in each state \u2014 useful for
  // buyers considering a relocation or comparing interstate investment.
  var cmpBody = document.getElementById('sd-compare-body');
  if (cmpBody) {
    var rows = [];
    Object.keys(stateData).forEach(function(s) {
      var d = stateData[s];
      var base = calcDuty(s, val);
      var fhbAdj = isFHB && !isLand ? applyFhbConcession(s, val, base) : { duty: base };
      rows.push({ code: s.toUpperCase(), name: d.name, dutyName: d.dutyName, std: base, fhb: fhbAdj.duty, current: s === state });
    });
    rows.sort(function(a, b) { return (isFHB ? a.fhb - b.fhb : a.std - b.std); });
    var html = '';
    rows.forEach(function(r) {
      var saving = r.std - r.fhb;
      html += '<tr class="' + (r.current ? 'sd-current' : '') + '">' +
        '<td>' + escHtml(r.code) + ' \u2014 ' + escHtml(r.name) + '</td>' +
        '<td>' + fmt(r.std) + '</td>' +
        (isFHB ? '<td>' + fmt(r.fhb) + '</td><td class="' + (saving > 0 ? 'sd-save' : '') + '">' + (saving > 0 ? fmt(saving) : '\u2014') + '</td>' : '') +
        '</tr>';
    });
    cmpBody.innerHTML = html;
    var fhbCols = document.querySelectorAll('.sd-fhb-col');
    fhbCols.forEach(function(el) { el.style.display = isFHB ? '' : 'none'; });
  }

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on ' + data.name + ' 2026-27 thresholds (verified 5 July 2026). LMI is an industry-average estimate \u2014 get a formal quote. Verify all figures with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('stamp-duty', {
      purchasePrice: val,
      stampDuty: duty,
      foreignBuyerDuty: foreignAmt,
      totalCost: total,
      effectiveRate: rate.toFixed(2),
      state: state,
      isFHB: isFHB,
      isForeign: isForeign
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'stamp-duty',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full property investment',
    description: 'Add rental income, renovation costs, equity projections, and compare multiple properties side by side — all in EquitySight.',
    buttonText: 'Try it free \u2014 no signup \u2192',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State Revenue Offices',
        links: [
          { text: 'NSW Stamp Duty Guide', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'VIC Land Transfer Duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'QLD Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'SA Stamp Duty', href: 'https://www.revenuesa.sa.gov.au/stampduty' },
          { text: 'WA Land Titles Office', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty' },
          { text: 'TAS: State Revenue Office', href: 'https://www.sro.tas.gov.au/property-transfer-duties' },
          { text: 'ACT Stamp Duty', href: 'https://www.revenue.act.gov.au/duties/conveyance-duty' },
          { text: 'NT Land Titles Office', href: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Law Society Australia', href: 'https://www.lawsociety.com.au/' },
          { text: 'RBA Housing Guide', href: 'https://www.rba.gov.au/education/resources/explainers/' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Financial Planning',
        links: [
          { text: 'ATO: Shared Equity Schemes', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'MoneySmart Comparison', href: 'https://moneysmart.gov.au/' }
        ]
      }
    ],
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Rates change regularly \u2014 verify current rates with your state revenue office.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator',
    text: 'Just calculated my stamp duty instantly!'
  },
  related: [
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Total Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants' },
    { href: '/tools/deposit-calculator', icon: '\uD83E\uDE99', label: 'Deposit Calculator' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/mortgage-stress-calculator', text: 'Mortgage Stress' },
    { href: '/tools/cost-of-purchase-calculator', text: 'Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'QLD — First home buyer, $750,000',
      inputs: [
        { k: 'Property price', v: '$750,000' },
        { k: 'State', v: 'Queensland' },
        { k: 'First home buyer', v: 'Yes' },
        { k: 'Property type', v: 'Established dwelling' }
      ],
      outputs: [
        { k: 'Estimated stamp duty', v: '~$13,390' },
        { k: 'Includes FHB concession', v: 'Yes (partial — full exemption ends at $700k)' }
      ]
    },
    {
      label: 'NSW — Investor, $950,000',
      inputs: [
        { k: 'Property price', v: '$950,000' },
        { k: 'State', v: 'New South Wales' },
        { k: 'First home buyer', v: 'No' },
        { k: 'Foreign buyer', v: 'No' }
      ],
      outputs: [
        { k: 'Estimated stamp duty (FY2026-27 brackets)', v: '~$36,900' },
        { k: 'Mortgage registration', v: '~$185' }
      ]
    },
    {
      label: 'VIC — Owner-occupier, $1,200,000',
      inputs: [
        { k: 'Property price', v: '$1,200,000' },
        { k: 'State', v: 'Victoria' },
        { k: 'First home buyer', v: 'No' },
        { k: 'Property type', v: 'Established dwelling' }
      ],
      outputs: [
        { k: 'Estimated stamp duty', v: '~$66,000' },
        { k: 'Transfer fee', v: '~$1,900' }
      ]
    }
  ],
  faq: [
    { q: 'How is stamp duty calculated?',
      a: 'Stamp duty is a state tax based on the property purchase price and the state you buy in. Each state uses tiered brackets — higher prices attract a higher percentage. First home buyers, pensioners, and certain property types can attract concessions.' },
    { q: 'Do first home buyers pay less stamp duty?',
      a: 'Mostly, but it now varies sharply by state. The ACT charges eligible home buyers no duty at all from 1 July 2026 (no price cap or income test). NSW exempts first home buyers to $800,000, VIC to $600,000, QLD to $700,000 (and new homes at any price), WA to $600,000 from 7 May 2026. SA waives duty on new builds only. Tasmania\u2019s established-home exemption expired on 30 June 2026, so TAS first home buyers now pay full duty. Check your state\u2019s current threshold before you commit.' },
    { q: 'When do I have to pay stamp duty?',
      a: 'Most states require payment within 30 days of settlement. In NSW and VIC, duty can be deferred in limited circumstances. Unpaid duty accrues interest, so arrange funds as part of your settlement budget.' },
    { q: 'Is stamp duty tax deductible?',
      a: 'For investors, stamp duty is generally not immediately deductible — it forms part of the cost base of the property and reduces future capital gains tax when you sell. Owner-occupiers cannot claim it at all.' },
    { q: 'Does stamp duty apply to new builds?',
      a: 'New builds are taxed on the land value only in some states (e.g., ACT off-the-plan concession), while others tax the full contract price. Several states offer additional grants for new homes — check the First Home Owner Grant in your state.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDF81', href: '/tools/first-home-buyer-grants-calculator', label: 'First Home Buyer Grants' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Queensland Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if(window.trackCalculatorStart) trackCalculatorStart('stamp-duty');
  updateState();
  calculate();
  _isInit = false;
  var stateEl = document.getElementById('state');
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if(stateEl) stateEl.addEventListener('change', function(){ updateState(); calculate(); });
  if(priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); calculate(); });
  // Recompute on every input change so the comparison table stays in sync
  ['ptype','deposit-pct'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', calculate);
    if (el) el.addEventListener('change', calculate);
  });
  ['fhb','foreign'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', calculate);
  });
  if(calcBtn) calcBtn.addEventListener('click', function(){
    if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty'});
    calculate();
  });
});

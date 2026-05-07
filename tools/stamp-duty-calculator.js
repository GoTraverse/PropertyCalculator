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
 * Source of rates: state revenue offices, FY 2025–26 published rates as
 * at May 2026. Each state revenue office has the canonical reference; URLs
 * are listed in the `resources` block of each per-state calculator page
 * (e.g. tools/stamp-duty-calculator-nsw.js).
 */
var stateData = {
  nsw: {
    name: 'New South Wales', dutyName: 'Conveyancing Duty', foreignRate: 0.08,
    fhbFull: 800000, fhbPartial: 1000000, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0       },
      { from: 14000,   rate: 0.0125  },
      { from: 30000,   rate: 0.015   },
      { from: 130000,  rate: 0.0175  },
      { from: 205000,  rate: 0.035   },
      { from: 305000,  rate: 0.04    },
      { from: 405000,  rate: 0.045   },
      { from: 550000,  rate: 0.055   }
    ]
  },
  vic: {
    name: 'Victoria', dutyName: 'Duty of Transfer', foreignRate: 0.08,
    fhbFull: 600000, fhbPartial: 750000, fhbExemption: 25000,
    tiers: [
      { from: 0,       rate: 0      },
      { from: 25000,   rate: 0.014  },
      { from: 130000,  rate: 0.024  },
      { from: 440000,  rate: 0.055  },
      { from: 870000,  rate: 0.065  }
    ]
  },
  qld: {
    name: 'Queensland', dutyName: 'Transfer Duty', foreignRate: 0.08,
    fhbFull: 500000, fhbPartial: 550000, fhbExemption: Infinity,
    landFhbFull: 250000, landFhbPartial: 400000,
    tiers: [
      { from: 0,        rate: 0      },
      { from: 5000,     rate: 0.015  },
      { from: 75000,    rate: 0.035  },
      { from: 540000,   rate: 0.045  },
      { from: 1000000,  rate: 0.0575 }
    ]
  },
  sa: {
    name: 'South Australia', dutyName: 'Transfer Duty', foreignRate: 0.08,
    fhbFull: 575000, fhbPartial: 650000, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0     },
      { from: 16000,   rate: 0.015 },
      { from: 19000,   rate: 0.03  },
      { from: 250000,  rate: 0.035 },
      { from: 300000,  rate: 0.04  }
    ]
  },
  wa: {
    name: 'Western Australia', dutyName: 'Stamp Duty', foreignRate: 0.07,
    fhbFull: 430000, fhbPartial: 500000, fhbExemption: Infinity,
    tiers: [
      { from: 0,        rate: 0      },
      { from: 2000,     rate: 0.01   },
      { from: 4000,     rate: 0.02   },
      { from: 500000,   rate: 0.035  },
      { from: 1000000,  rate: 0.0475 }
    ]
  },
  tas: {
    name: 'Tasmania', dutyName: 'Conveyancing Duty', foreignRate: 0,
    fhbFull: 400000, fhbPartial: 500000, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0      },
      { from: 3000,    rate: 0.036  },
      { from: 100000,  rate: 0.041  },
      { from: 150000,  rate: 0.0425 },
      { from: 250000,  rate: 0.0475 }
    ]
  },
  act: {
    name: 'Australian Capital Territory', dutyName: 'Duty', foreignRate: 0.08,
    fhbFull: 1000000, fhbPartial: 1000000, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0      },
      { from: 7500,    rate: 0.0125 },
      { from: 30000,   rate: 0.02   },
      { from: 200000,  rate: 0.035  }
    ]
  },
  nt: {
    name: 'Northern Territory', dutyName: 'Duty', foreignRate: 0.08,
    fhbFull: 650000, fhbPartial: 650000, fhbExemption: Infinity,
    tiers: [
      { from: 0,       rate: 0      },
      { from: 3000,    rate: 0.0075 },
      { from: 100000,  rate: 0.01   },
      { from: 150000,  rate: 0.015  },
      { from: 250000,  rate: 0.025  }
    ]
  }
};

// Cumulative tiered duty calculation. Given a tiers array and a value v,
// taxes each completed span (tiers[i+1].from - tiers[i].from) at tiers[i].rate
// and the residual (v - last_completed.from) at the last applicable rate.
// Continuous by construction — the bracket-cliff bugs in the previous
// hand-rolled formulas cannot recur with this implementation.
function calcDuty(state, v) {
  var data = stateData[state];
  if (!data || !data.tiers || v <= 0) return 0;
  var tiers = data.tiers;
  var duty = 0;
  for (var i = 0; i < tiers.length; i++) {
    var from = tiers[i].from;
    if (v <= from) break;
    var nextFrom = (i + 1 < tiers.length) ? tiers[i + 1].from : Infinity;
    var span = Math.min(v, nextFrom) - from;
    duty += span * tiers[i].rate;
  }
  return duty;
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
  var state = document.getElementById('state').value;
  var data = stateData[state];
  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) alert('Please enter the purchase price.'); return; }

  var isFHB = document.getElementById('fhb').checked;
  var isForeign = document.getElementById('foreign').checked;
  var isLand = document.getElementById('ptype').value === 'land';
  var duty = calcDuty(state, val);
  var note = '';

  if (isFHB && !isLand) {
    var fullLimit = data.fhbFull;
    var partialLimit = data.fhbPartial;
    if (val <= fullLimit) {
      var exemption = Math.min(data.fhbExemption, duty);
      duty = Math.max(0, duty - exemption);
      note = 'First home buyer exemption applied.';
    } else if (val <= partialLimit) {
      var concession = duty * (partialLimit - val) / (partialLimit - fullLimit);
      duty = Math.max(0, duty - concession);
      note = 'First home buyer partial exemption applied.';
    }
  }

  var foreignAmt = isForeign ? val * data.foreignRate : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  document.getElementById('r-duty').textContent = fmt(duty);
  document.getElementById('r-foreign').textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';
  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on ' + data.name + ' 2025\u201326 thresholds. Verify with a solicitor before settlement.';

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
  partnerSlug: 'stamp-duty',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full property investment',
    description: 'Add rental income, renovation costs, equity projections, and compare multiple properties side by side — all in EquitySight.',
    buttonText: 'Get started free \u2192',
    buttonHref: '/login?tab=signup'
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
      label: 'QLD — First home buyer, $650,000',
      inputs: [
        { k: 'Property price', v: '$650,000' },
        { k: 'State', v: 'Queensland' },
        { k: 'First home buyer', v: 'Yes' },
        { k: 'Property type', v: 'Established dwelling' }
      ],
      outputs: [
        { k: 'Estimated stamp duty', v: '~$12,850' },
        { k: 'Includes FHB concession', v: 'Yes (partial)' }
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
        { k: 'Estimated stamp duty', v: '~$38,000' },
        { k: 'Mortgage registration', v: '~$165' }
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
      a: 'Yes. Every Australian state offers some form of first home buyer relief, ranging from full exemption (ACT: up to $1M; NSW: up to $800K) to a sliding concession. QLD offers a full concession up to $500,000. Check your state\u2019s threshold before you commit.' },
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
  if(stateEl) stateEl.addEventListener('change', updateState);
  if(priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if(calcBtn) calcBtn.addEventListener('click', function(){
    if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty'});
    calculate();
  });
});

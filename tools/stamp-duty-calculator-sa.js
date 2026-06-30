/* SA Stamp Duty Calculator — uses RevenueSA 2025–26 rates.
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for SA; this file exists so the SA-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var SA_FOREIGN_RATE = 0.07;
// SA first-home stamp-duty relief is for NEW homes / vacant land to build only
// (no value-based taper, and established homes do not qualify). This page cannot
// distinguish a new build from an established dwelling, so we apply NO automatic
// value-based exemption — FHBs are quoted full standard duty, matching the
// verified all-states calculator (which sets SA fhbFull/fhbPartial to 0).
var SA_FHB_FULL = 0;
var SA_FHB_PARTIAL = 0;

// State-standard transfer duty (investor / non-FHB).
function calcSAStandard(v) {
  if (v <= 0) return 0;
  if (v <= 12000) return v * 0.01;
  if (v <= 30000) return 120 + (v - 12000) * 0.02;
  if (v <= 50000) return 480 + (v - 30000) * 0.03;
  if (v <= 100000) return 1080 + (v - 50000) * 0.035;
  if (v <= 200000) return 2830 + (v - 100000) * 0.04;
  if (v <= 250000) return 6830 + (v - 200000) * 0.0425;
  if (v <= 300000) return 8955 + (v - 250000) * 0.0475;
  if (v <= 500000) return 11330 + (v - 300000) * 0.05;
  return 21330 + (v - 500000) * 0.055;
}

function calcSADuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcSAStandard(v);

  // SA first-home relief is NEW-build / vacant-land only with no value taper, and
  // established homes do not qualify. We do not auto-zero duty for FHBs here.
  if (fhb && SA_FHB_FULL > 0 && v <= SA_FHB_FULL) {
    return { duty: 0, note: 'First home buyer exemption applied.' };
  }
  if (fhb && SA_FHB_PARTIAL > SA_FHB_FULL && v <= SA_FHB_PARTIAL) {
    var slide = (SA_FHB_PARTIAL - v) / (SA_FHB_PARTIAL - SA_FHB_FULL);
    return { duty: Math.max(0, standard * (1 - slide)), note: 'First home buyer partial concession applied.' };
  }
  if (fhb) {
    return { duty: standard, note: 'SA first-home stamp-duty relief applies to new homes and vacant land only — established homes pay full duty.' };
  }

  return { duty: standard, note: '' };
}

function calculate() {
  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) alert('Please enter the purchase price.'); return; }

  var ptype = document.getElementById('ptype').value;
  var buyer = document.getElementById('buyer').value;
  var isFHB = document.getElementById('fhb').checked;
  var foreignEl = document.getElementById('foreign');
  var isForeign = foreignEl ? foreignEl.checked : false;

  var result = calcSADuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * SA_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  var regMortgage = 200;
  var regTransfer = 230;
  var regTotal = regMortgage + regTransfer;
  var conveyancing = 1800;
  function lmiRate(lvr) {
    if (lvr <= 0.80) return 0;
    if (lvr <= 0.85) return 0.0080;
    if (lvr <= 0.90) return 0.0190;
    if (lvr <= 0.95) return 0.0340;
    return 0.0430;
  }
  var lmi = (isFHB && lvr > 0.80) ? 0 : Math.round(loanAmount * lmiRate(lvr));
  var lmiLabel = (isFHB && lvr > 0.80)
    ? '$0 (FHBG eligibility assumed)'
    : (lmi > 0 ? fmt(lmi) : '$0 (no LMI)');
  var upfrontTotal = total + lmi + regTotal + conveyancing;

  document.getElementById('r-duty').textContent = fmt(duty);
  var foreignTextEl = document.getElementById('r-foreign');
  if (foreignTextEl) foreignTextEl.textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';

  var lvrEl = document.getElementById('r-lvr');
  if (lvrEl) lvrEl.textContent = (lvr * 100).toFixed(1) + '% (' + fmt(loanAmount) + ' loan)';
  var lmiEl = document.getElementById('r-lmi');
  if (lmiEl) lmiEl.textContent = lmiLabel;
  var regEl = document.getElementById('r-reg');
  if (regEl) regEl.textContent = fmt(regTotal) + ' (mortgage $' + regMortgage + ' + transfer $' + regTransfer + ')';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (typical $1,500–$2,500)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on South Australia 2025-26 stamp duty on conveyances. LMI is an industry-average estimate. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-sa', {
      purchasePrice: val,
      stampDuty: duty,
      foreignBuyerDuty: foreignAmt,
      totalCost: total,
      effectiveRate: rate.toFixed(2),
      buyer: buyer,
      propertyType: ptype,
      isFHB: isFHB,
      isForeign: isForeign
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'stamp-duty-sa',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full South Australia investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'RevenueSA',
        links: [
          { text: 'SA Stamp Duty on Conveyances', href: 'https://www.revenuesa.sa.gov.au/stampduty' },
          { text: 'First Home Owner Stamp Duty Relief (new builds)', href: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Financial Planning',
        links: [
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: Rental Properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' }
        ]
      }
    ],
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with RevenueSA.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-sa',
    text: 'Just calculated my South Australia stamp duty instantly!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'All-state Stamp Duty Calculator' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Total Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants Calculator' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'All States' },
    { href: '/tools/cost-of-purchase-calculator', text: 'Cost of Purchase' },
    { href: '/invest/sa/', text: 'SA Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "SA — $520,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$520,000"
      },
      {
        "k": "State",
        "v": "South Australia"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$22,430"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$22,430"
      },
      {
        "k": "First home buyer duty",
        "v": "$22,430 (established home — no relief)"
      }
    ]
  },
  {
    "label": "SA — $680,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$680,000"
      },
      {
        "k": "State",
        "v": "South Australia"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$31,230"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$31,230"
      },
      {
        "k": "First home buyer duty",
        "v": "$31,230 (established home — no relief)"
      }
    ]
  },
  {
    "label": "SA — $1,000,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,000,000"
      },
      {
        "k": "State",
        "v": "South Australia"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$48,830"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$48,830"
      },
      {
        "k": "First home buyer duty",
        "v": "$48,830 (established home — no relief)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in South Australia?",
    "a": "SA stamp duty on conveyances is charged by RevenueSA on the dutiable value of any property purchase. Rates step up across five brackets, from nil under $16,000 to 5.5% on the portion above $500,000. Owner-occupiers and investors pay the same standard rates on established dwellings."
  },
  {
    "q": "Do first home buyers pay stamp duty in SA?",
    "a": "SA first home buyer stamp duty relief is limited to new homes and vacant land used to build a new home — there is no value-based exemption and established (existing) homes do not qualify. Because this calculator cannot tell a new build from an established dwelling, it quotes full standard duty for first home buyers; if you are buying or building a new home, check RevenueSA for the current new-build relief."
  },
  {
    "q": "When is stamp duty due in SA?",
    "a": "SA stamp duty is payable within two months of the dutiable transaction — usually two months from contract date. Your conveyancer normally pays RevenueSA at settlement. Late payment attracts interest and penalty tax under the Taxation Administration Act 1996 (SA)."
  },
  {
    "q": "What is the SA foreign ownership surcharge?",
    "a": "A 7% foreign ownership surcharge applies in addition to standard stamp duty when a foreign person acquires residential property in South Australia. The surcharge is collected by RevenueSA at the same time as the standard duty. Australian citizens and permanent residents are not foreign persons for this surcharge."
  },
  {
    "q": "Why does SA not exempt established homes from FHB stamp duty?",
    "a": "The SA government has chosen to direct first home buyer stamp duty relief at new builds and vacant land specifically to incentivise housing supply growth. Established homes remain at full standard rates for first home buyers. The First Home Owner Grant (separate from stamp duty relief) is also limited to new builds in SA."
  },
  {
    "q": "Is SA stamp duty tax deductible?",
    "a": "No. Stamp duty paid on an investment property in SA is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all."
  }
],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/sa/adelaide/', label: 'Adelaide SA' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/sa/glenelg/', label: 'Glenelg SA' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/sa/norwood/', label: 'Norwood SA' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/sa/adelaide/', label: 'Adelaide Suburb Guide' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/sa/', label: 'South Australia Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-sa');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-sa'});
    calculate();
  });
});

/* SA Stamp Duty Calculator — uses RevenueSA 2025–26 rates.
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for SA; this file exists so the SA-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var SA_FOREIGN_RATE = 0.07;
var SA_FHB_FULL = 650000;
var SA_FHB_PARTIAL = 700000;

// State-standard transfer duty (investor / non-FHB).
function calcSAStandard(v) {
  if (v <= 16000) return 0 + (v - 0) * 0;
  if (v <= 19000) return 0 + (v - 16000) * 0.015;
  if (v <= 250000) return 45 + (v - 19000) * 0.03;
  if (v <= 300000) return 6975 + (v - 250000) * 0.035;
  return 8725 + (v - 300000) * 0.04;
}

function calcSADuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcSAStandard(v);

  if (fhb && v <= SA_FHB_FULL) {
    return { duty: 0, note: 'First home buyer exemption applied.' };
  }
  if (fhb && v <= SA_FHB_PARTIAL && SA_FHB_PARTIAL > SA_FHB_FULL) {
    var slide = (SA_FHB_PARTIAL - v) / (SA_FHB_PARTIAL - SA_FHB_FULL);
    return { duty: Math.max(0, standard * (1 - slide)), note: 'First home buyer partial concession applied.' };
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

  document.getElementById('r-duty').textContent = fmt(duty);
  var foreignTextEl = document.getElementById('r-foreign');
  if (foreignTextEl) foreignTextEl.textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';
  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on South Australia 2025–26 stamp duty on conveyances. Verify with a solicitor before settlement.';

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
  partnerSlug: 'stamp-duty-sa',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full South Australia investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
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
        "v": "$17,525"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$17,525"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
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
        "v": "$23,925"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$23,925"
      },
      {
        "k": "First home buyer duty",
        "v": "$14,355 (FHB concession)"
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
        "v": "$36,725"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$36,725"
      },
      {
        "k": "First home buyer duty",
        "v": "$36,725 (over cap)"
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
    "a": "Eligible first home buyers pay no stamp duty on new homes up to $650,000 (full exemption) with a partial concession to $700,000. The same thresholds apply to vacant land used to build a new home. Established homes do not qualify for the SA first home buyer stamp duty exemption — only new builds."
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

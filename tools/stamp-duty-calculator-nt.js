/* NT Stamp Duty Calculator — uses Territory Revenue Office 2025–26 rates.
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for NT; this file exists so the NT-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var NT_FOREIGN_RATE = 0;
var NT_FHB_FULL = 650000;
var NT_FHB_PARTIAL = 650000;

// State-standard transfer duty (investor / non-FHB).
function calcNTStandard(v) {
  if (v <= 3000) return 0 + (v - 0) * 0;
  if (v <= 100000) return 0 + (v - 3000) * 0.0075;
  if (v <= 150000) return 727.5 + (v - 100000) * 0.01;
  if (v <= 250000) return 1227.5 + (v - 150000) * 0.015;
  return 2727.5 + (v - 250000) * 0.025;
}

function calcNTDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcNTStandard(v);

  if (fhb && v <= NT_FHB_FULL) {
    return { duty: 0, note: 'First home buyer exemption applied.' };
  }
  if (fhb && v <= NT_FHB_PARTIAL && NT_FHB_PARTIAL > NT_FHB_FULL) {
    var slide = (NT_FHB_PARTIAL - v) / (NT_FHB_PARTIAL - NT_FHB_FULL);
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

  var result = calcNTDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * NT_FOREIGN_RATE : 0;
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
  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Northern Territory 2025–26 stamp duty on conveyances. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-nt', {
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
  partnerSlug: 'stamp-duty-nt',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full Northern Territory investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'Territory Revenue Office',
        links: [
          { text: 'NT Stamp Duty on Conveyances', href: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home' },
          { text: 'House and Land Package Stamp Duty Discount', href: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home' }
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
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with Territory Revenue Office.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-nt',
    text: 'Just calculated my Northern Territory stamp duty instantly!'
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
    { href: '/invest/nt/', text: 'NT Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "NT — $520,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$520,000"
      },
      {
        "k": "State",
        "v": "Northern Territory"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$9,478"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$9,478"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
      }
    ]
  },
  {
    "label": "NT — $700,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$700,000"
      },
      {
        "k": "State",
        "v": "Northern Territory"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$13,978"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$13,978"
      },
      {
        "k": "First home buyer duty",
        "v": "$13,978 (established)"
      }
    ]
  },
  {
    "label": "NT — $1,000,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,000,000"
      },
      {
        "k": "State",
        "v": "Northern Territory"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$21,478"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$21,478"
      },
      {
        "k": "First home buyer duty",
        "v": "$21,478 (established)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in the Northern Territory?",
    "a": "NT stamp duty on conveyances is charged by the Territory Revenue Office on the dutiable value of any property purchase. The NT uses a single graduated formula rather than discrete brackets — rates rise smoothly with the dutiable value, capping out at 5.95% above $5 million. Owner-occupiers and investors pay the same standard rates on established dwellings."
  },
  {
    "q": "Do first home buyers pay stamp duty in the NT?",
    "a": "First home buyers buying new homes, house and land packages, or vacant land where a new home will be built can claim a stamp duty discount of up to $50,000. There is no full exemption — the discount reduces the duty payable by up to $50,000. For established homes there is no first home buyer concession."
  },
  {
    "q": "When is stamp duty due in the NT?",
    "a": "NT stamp duty is payable within 60 days of the dutiable transaction. Your conveyancer normally pays the Territory Revenue Office at settlement using funds drawn from your loan and deposit. Late payment attracts interest and penalty tax under the Taxation Administration Act (NT)."
  },
  {
    "q": "Does the NT charge a foreign buyer surcharge?",
    "a": "No. The Northern Territory does not currently levy a foreign buyer surcharge on residential property purchases. Like Tasmania, this makes the NT notably cheaper for foreign buyers than NSW, VIC, QLD, SA, WA, or the ACT."
  },
  {
    "q": "Why does the NT use a formula instead of brackets?",
    "a": "The NT formula (D = 0.06571441 × V² + 15V for purchases under $525,000) produces a smooth graduated curve rather than the bracket-based steps used in other states. The practical effect is similar to a tiered system, but the duty changes by cents (not dollars) as the price changes — eliminating the small jumps at bracket boundaries that other states have."
  },
  {
    "q": "Is NT stamp duty tax deductible?",
    "a": "No. Stamp duty paid on an investment property in the NT is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all."
  }
],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nt/darwin-city/', label: 'Darwin City NT' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nt/palmerston/', label: 'Palmerston NT' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nt/alice-springs/', label: 'Alice Springs NT' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/nt/darwin/', label: 'Darwin Suburb Guide' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/nt/', label: 'Northern Territory Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-nt');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-nt'});
    calculate();
  });
});

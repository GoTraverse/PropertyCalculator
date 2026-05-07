/* WA Stamp Duty Calculator — uses RevenueWA 2025–26 rates.
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for WA; this file exists so the WA-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var WA_FOREIGN_RATE = 0.07;
var WA_FHB_FULL = 430000;
var WA_FHB_PARTIAL = 500000;

// State-standard transfer duty (investor / non-FHB).
function calcWAStandard(v) {
  if (v <= 2000) return 0 + (v - 0) * 0;
  if (v <= 4000) return 0 + (v - 2000) * 0.01;
  if (v <= 500000) return 20 + (v - 4000) * 0.02;
  if (v <= 1000000) return 9940 + (v - 500000) * 0.035;
  return 27440 + (v - 1000000) * 0.0475;
}

function calcWADuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcWAStandard(v);

  if (fhb && v <= WA_FHB_FULL) {
    return { duty: 0, note: 'First home buyer exemption applied.' };
  }
  if (fhb && v <= WA_FHB_PARTIAL && WA_FHB_PARTIAL > WA_FHB_FULL) {
    var slide = (WA_FHB_PARTIAL - v) / (WA_FHB_PARTIAL - WA_FHB_FULL);
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

  var result = calcWADuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * WA_FOREIGN_RATE : 0;
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
  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Western Australia 2025–26 transfer duty. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-wa', {
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
  partnerSlug: 'stamp-duty-wa',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full Western Australia investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'RevenueWA',
        links: [
          { text: 'WA Transfer Duty', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty' },
          { text: 'First Home Owner Rate of Duty', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/first-home-owner-rate-duty' }
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
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with RevenueWA.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-wa',
    text: 'Just calculated my Western Australia stamp duty instantly!'
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
    { href: '/invest/wa/', text: 'WA Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "WA — $340,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$340,000"
      },
      {
        "k": "State",
        "v": "Western Australia"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$6,740"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$6,740"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
      }
    ]
  },
  {
    "label": "WA — $470,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$470,000"
      },
      {
        "k": "State",
        "v": "Western Australia"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$9,340"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$9,340"
      },
      {
        "k": "First home buyer duty",
        "v": "$5,337 (FHB concession)"
      }
    ]
  },
  {
    "label": "WA — $1,000,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,000,000"
      },
      {
        "k": "State",
        "v": "Western Australia"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$27,440"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$27,440"
      },
      {
        "k": "First home buyer duty",
        "v": "$27,440 (over cap)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in Western Australia?",
    "a": "WA transfer duty is charged by RevenueWA on the dutiable value of any property purchase. Rates step up across five brackets, from nil under $2,000 to 4.75% on the portion above $1,000,000. Owner-occupiers buying a property up to $200,000 may qualify for a concessional residential rate; otherwise owner-occupiers and investors pay the same general rate."
  },
  {
    "q": "Do first home buyers pay stamp duty in WA?",
    "a": "Eligible first home buyers pay no transfer duty under the First Home Owner Rate of Duty (FHOR) on residential properties up to $430,000, with a sliding partial concession from $430,000 to $530,000. For vacant land the thresholds are $300,000 (full) to $400,000 (partial). Above the partial limit the standard rates apply."
  },
  {
    "q": "When is WA transfer duty due?",
    "a": "WA transfer duty is generally payable within two months of the dutiable transaction — usually two months from contract date. Your settlement agent normally pays RevenueWA at settlement using funds from your loan and deposit. Late payment attracts penalty tax and interest at the rate published by RevenueWA."
  },
  {
    "q": "Why is the WA foreign buyers duty 7% and not 8%?",
    "a": "WA introduced its 7% foreign buyers duty in 2019 — slightly lower than the 8% surcharge applied in most other states. The lower rate reflects WA government policy to maintain inbound investment in Perth and regional WA. The duty applies on top of the standard transfer duty whenever a foreign person acquires residential property."
  },
  {
    "q": "Is WA stamp duty tax deductible for investors?",
    "a": "No. Stamp duty paid on an investment property in WA is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all."
  },
  {
    "q": "How is \"stamp duty\" different from \"transfer duty\" in WA?",
    "a": "There is no difference — they are the same tax. WA formally calls it \"transfer duty\" in the Duties Act 2008, but everyday speech still uses \"stamp duty\". RevenueWA forms, settlement statements, and contract documents use \"transfer duty\"; lender quotes and buyer guides usually use \"stamp duty\"."
  }
],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/wa/subiaco/', label: 'Subiaco WA' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/wa/fremantle/', label: 'Fremantle WA' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/wa/yakamia/', label: 'Yakamia WA' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/wa/perth/', label: 'Perth Suburb Guide' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/wa/', label: 'Western Australia Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-wa');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-wa'});
    calculate();
  });
});

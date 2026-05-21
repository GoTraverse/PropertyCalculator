/* NSW Stamp Duty Calculator — uses Revenue NSW 2025–26 rates.
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for NSW; this file exists so the NSW-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var NSW_FOREIGN_RATE = 0.08;
var NSW_FHB_FULL = 800000;
var NSW_FHB_PARTIAL = 1000000;

// State-standard transfer duty (investor / non-FHB).
function calcNSWStandard(v) {
  if (v <= 14000) return 0 + (v - 0) * 0;
  if (v <= 30000) return 0 + (v - 14000) * 0.0125;
  if (v <= 130000) return 200 + (v - 30000) * 0.015;
  if (v <= 205000) return 1700 + (v - 130000) * 0.0175;
  if (v <= 305000) return 3012.5 + (v - 205000) * 0.035;
  if (v <= 405000) return 6512.5 + (v - 305000) * 0.04;
  if (v <= 550000) return 10512.5 + (v - 405000) * 0.045;
  return 17037.5 + (v - 550000) * 0.055;
}

function calcNSWDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcNSWStandard(v);

  if (fhb && v <= NSW_FHB_FULL) {
    return { duty: 0, note: 'First home buyer exemption applied.' };
  }
  if (fhb && v <= NSW_FHB_PARTIAL && NSW_FHB_PARTIAL > NSW_FHB_FULL) {
    var slide = (NSW_FHB_PARTIAL - v) / (NSW_FHB_PARTIAL - NSW_FHB_FULL);
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

  var result = calcNSWDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * NSW_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  var regMortgage = 185;
  var regTransfer = 185;
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

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on New South Wales 2025-26 conveyancing duty. LMI is an industry-average estimate. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-nsw', {
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
  partnerSlug: 'stamp-duty-nsw',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full New South Wales investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'Revenue NSW',
        links: [
          { text: 'NSW Conveyancing Duty', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'First Home Buyers Assistance Scheme (FHBAS)', href: 'https://www.revenue.nsw.gov.au/grants-schemes/previous-schemes/first-home-buyer-assistance' }
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
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with Revenue NSW.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-nsw',
    text: 'Just calculated my New South Wales stamp duty instantly!'
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
    { href: '/invest/nsw/', text: 'NSW Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "NSW — $640,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$640,000"
      },
      {
        "k": "State",
        "v": "New South Wales"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$21,988"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$21,988"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
      }
    ]
  },
  {
    "label": "NSW — $900,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$900,000"
      },
      {
        "k": "State",
        "v": "New South Wales"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$36,288"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$36,288"
      },
      {
        "k": "First home buyer duty",
        "v": "$18,144 (FHB concession)"
      }
    ]
  },
  {
    "label": "NSW — $1,200,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,200,000"
      },
      {
        "k": "State",
        "v": "New South Wales"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$52,788"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$52,788"
      },
      {
        "k": "First home buyer duty",
        "v": "$52,788 (over cap)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in NSW?",
    "a": "NSW transfer duty (still commonly called stamp duty) is charged by Revenue NSW on the dutiable value of any property purchase. The duty steps up across brackets from nil under $14,000 to 5.5% on the portion above $550,000. There is no owner-occupier \"home concession\" in NSW — owner-occupiers and investors pay the same standard rates. The main relief is the First Home Buyers Assistance Scheme."
  },
  {
    "q": "Do first home buyers pay stamp duty in NSW?",
    "a": "Eligible first home buyers pay no transfer duty on properties up to $800,000 and receive a sliding partial concession on properties between $800,000 and $1,000,000. Above $1,000,000 the standard rates apply with no concession. The same thresholds apply to both new and established homes under the First Home Buyers Assistance Scheme (FHBAS)."
  },
  {
    "q": "When is stamp duty due in NSW?",
    "a": "NSW transfer duty is payable within three months of liability — usually three months after the contract date. Most buyers pay duty at settlement through their solicitor or conveyancer. Late payment attracts interest and penalty tax under the Taxation Administration Act 1996 (NSW)."
  },
  {
    "q": "What is the NSW foreign buyer surcharge?",
    "a": "Foreign buyers (non-Australian citizens or permanent residents) pay an additional 8% surcharge purchaser duty on top of standard transfer duty. The surcharge applies to residential property purchases and is collected by Revenue NSW at the same time as the standard duty. New Zealand citizens with a Special Category Visa are treated as foreign for this surcharge unless they are also Australian permanent residents."
  },
  {
    "q": "Is stamp duty tax deductible for NSW investors?",
    "a": "No. Stamp duty paid by a property investor in NSW (or any state) is not immediately deductible against rental income. Instead it is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all."
  },
  {
    "q": "Stamp duty vs transfer duty in NSW — what is the difference?",
    "a": "There is no difference — they are the same tax. NSW formally calls it \"transfer duty\" in the Duties Act 1997, but most buyers, lenders, and solicitors still call it \"stamp duty\". The legislation, the contract documents, and Revenue NSW forms all use \"transfer duty\"; everyday speech still uses both terms interchangeably."
  }
],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/newtown/', label: 'Newtown NSW' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/chatswood/', label: 'Chatswood NSW' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/nsw/sydney/', label: 'Sydney Suburb Guide' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/nsw/', label: 'New South Wales Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-nsw');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-nsw'});
    calculate();
  });
});

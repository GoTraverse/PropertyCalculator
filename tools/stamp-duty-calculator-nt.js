/* NT Stamp Duty Calculator — uses Territory Revenue Office 2026–27 rates (verified 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for NT; this file exists so the NT-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var NT_FOREIGN_RATE = 0;
// NT first-home relief is new-build / house-and-land only (a duty discount of
// up to $50k), not a value-based exemption on established homes. Established-home
// FHBs pay full standard duty, so there is no value threshold that zeroes duty.
var NT_FHB_FULL = 0;
var NT_FHB_PARTIAL = 0;

// State-standard transfer duty (investor / non-FHB).
function calcNTStandard(v) {
  if (v <= 0) return 0;
  if (v < 525000) { var Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
  if (v <= 3000000) return v * 0.0495;
  if (v <= 5000000) return v * 0.0575;
  return v * 0.0595;
}

function calcNTDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcNTStandard(v);

  // NT has no value-based FHB exemption/concession on established homes — the
  // first-home relief is a new-build-only duty discount handled elsewhere. So we
  // never auto-zero duty here; established-home FHBs pay the full standard duty.
  if (fhb) {
    return { duty: standard, note: 'NT has no first home buyer concession on established homes — full duty applies. New-build/house-and-land buyers may claim a separate duty discount.' };
  }

  return { duty: standard, note: '' };
}

function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) _showErr('Please enter the purchase price.'); return; }

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

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  // NT Land Titles Office FY2026-27 (verified 6 Jul 2026): flat $181 per
  // dealing for both mortgage and transfer.
  var regMortgage = 181;
  var regTransfer = 181;
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

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Northern Territory 2026-27 stamp duty on conveyances. LMI is an industry-average estimate. Verify with a solicitor before settlement.';

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
  slug: 'stamp-duty-nt',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full Northern Territory investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
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
        "v": "$25,569"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$25,569"
      },
      {
        "k": "First home buyer duty",
        "v": "$25,569 (no value-based concession on established homes)"
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
        "v": "$34,650"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$34,650"
      },
      {
        "k": "First home buyer duty",
        "v": "$34,650 (established)"
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
        "v": "$49,500"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$49,500"
      },
      {
        "k": "First home buyer duty",
        "v": "$49,500 (established)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in the Northern Territory?",
    "a": "NT stamp duty on conveyances is charged by the Territory Revenue Office on the dutiable value of any property purchase. For values under $525,000 the NT uses a graduated formula rather than discrete brackets, so duty rises smoothly with the price. From $525,000 to $3 million duty is a flat 4.95% of the whole price; from $3 million to $5 million it is 5.75%; and above $5 million it is 5.95%. Owner-occupiers and investors pay the same standard rates on established dwellings."
  },
  {
    "q": "Do first home buyers pay stamp duty in the NT?",
    "a": "The NT's House and Land Package Exemption gives a FULL stamp duty exemption (no value cap, not means-tested) when you buy a house-and-land package from a building contractor in a single transaction — contracts signed 1 July 2022 to 30 June 2027. It is not limited to first home buyers. For established homes there is no duty concession; first home buyers of NEW homes may also qualify for the $50,000 HomeGrown Territory grant (a cash grant, separate from duty)."
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
    "a": "For purchases under $525,000 the NT formula (D = 0.06571441 × V² + 15V, where V is the dutiable value in thousands of dollars) produces a smooth graduated curve rather than the bracket-based steps used in other states. The practical effect is similar to a tiered system, but below $525,000 the duty changes by cents (not dollars) as the price changes — eliminating the small jumps at bracket boundaries that other states have. At $525,000 and above the NT switches to flat percentage rates (4.95% up to $3 million, then 5.75% and 5.95%)."
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

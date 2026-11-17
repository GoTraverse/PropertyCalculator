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
  var buyerEl = document.getElementById('buyer'); // only the QLD page has a buyer profile
  var buyer = buyerEl ? buyerEl.value : 'owner';
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
  // LMI is always estimated from the LVR. A first home buyer may pay none
  // under the federal 5% Deposit Scheme, but that depends on the scheme's
  // price cap and eligibility, which this page does not check.
  var lmi = Math.round(loanAmount * lmiRate(lvr));
  var lmiLabel = lmi > 0
    ? fmt(lmi) + (isFHB ? ' (may be $0 under the 5% Deposit Scheme if you and the price qualify)' : '')
    : '$0 (no LMI)';
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

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Northern Territory 2026-27 stamp duty on conveyances. LMI is a rough estimate. Verify with a solicitor before settlement.';

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
    title: 'Plan the full Northern Territory purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey?st=nt'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'Territory Revenue Office',
        links: [
          { text: 'NT Stamp Duty on Conveyances', href: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home' },
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
  // FAQ: shown once, as static HTML in the page (the same text is in its
  // JSON-LD). There is no JS copy here, so the two cannot drift apart.
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' }
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

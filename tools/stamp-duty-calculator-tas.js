/* TAS Stamp Duty Calculator — uses State Revenue Office Tasmania 2026–27 rates (verified 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for TAS; this file exists so the TAS-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

// Tasmania levies an 8% Foreign Investor Duty Surcharge (FIDS) on residential
// property acquired by foreign persons (since 1 April 2020).
var TAS_FOREIGN_RATE = 0.08;
var TAS_FHB_FULL = 0;      // established-home exemption EXPIRED 30 Jun 2026
var TAS_FHB_PARTIAL = 0;

// State-standard transfer duty (investor / non-FHB).
function calcTASStandard(v) {
  if (v <= 0) return 0;
  if (v <= 3000) return 50;
  var d;
  if (v <= 25000) d = (v - 3000) * 0.0175;
  else if (v <= 75000) d = 385 + (v - 25000) * 0.0225;
  else if (v <= 200000) d = 1510 + (v - 75000) * 0.035;
  else if (v <= 375000) d = 5885 + (v - 200000) * 0.04;
  else if (v <= 725000) d = 12885 + (v - 375000) * 0.0425;
  else d = 27760 + (v - 725000) * 0.045;
  return d + 50;
}

function calcTASDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcTASStandard(v);

  if (fhb) {
    // TAS's established-home FHB duty exemption (<= $750k) EXPIRED 30 June 2026
    // and was NOT extended (SRO: "not available for transactions settling after
    // 30 June 2026"). First home buyers now pay full standard duty.
    return { duty: standard, note: 'Tasmania’s first home buyer duty exemption ended 30 June 2026 — standard duty applies. (The First Home Owner Grant for NEW builds is separate: $20,000 from 1 July 2026, subject to legislation.)' };
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

  var result = calcTASDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * TAS_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  // TAS Land Titles Office FY2026-27 (verified 6 Jul 2026): mortgage $167.58,
  // transfer $256.76 — both flat.
  var regMortgage = 168;
  var regTransfer = 257;
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

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Tasmania 2026-27 property transfer duty (FHB exemption ended 30 June 2026). LMI is a rough estimate. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-tas', {
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
  slug: 'stamp-duty-tas',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the full Tasmania purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey?st=tas'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State Revenue Office Tasmania',
        links: [
          { text: 'TAS Property Transfer Duty', href: 'https://www.sro.tas.gov.au/property-transfer-duties' },
          { text: 'First Home Buyer Duty Relief (scheme ended 30 June 2026)', href: 'https://www.sro.tas.gov.au/property-transfer-duties/concessions-exemptions/first-home-buyers-of-established-homes-duty-relief' }
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
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with State Revenue Office Tasmania.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-tas',
    text: 'Just calculated my Tasmania stamp duty instantly!'
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
    { href: '/invest/tas/', text: 'TAS Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "TAS — $600,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$600,000"
      },
      {
        "k": "State",
        "v": "Tasmania"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$22,498"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$22,498"
      },
      {
        "k": "First home buyer duty",
        "v": "$22,498 (exemption ended 30 Jun 2026)"
      }
    ]
  },
  {
    "label": "TAS — $800,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$800,000"
      },
      {
        "k": "State",
        "v": "Tasmania"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$31,185"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$31,185"
      },
      {
        "k": "First home buyer duty",
        "v": "$31,185 (no FHB duty relief in TAS)"
      }
    ]
  },
  {
    "label": "TAS — $1,000,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,000,000"
      },
      {
        "k": "State",
        "v": "Tasmania"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$40,185"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$40,185"
      },
      {
        "k": "First home buyer duty",
        "v": "$40,185 (no FHB duty relief in TAS)"
      }
    ]
  }
],
  // FAQ: shown once, as static HTML in the page (the same text is in its
  // JSON-LD). There is no JS copy here, so the two cannot drift apart.
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/tas/hobart/', label: 'Hobart TAS' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/tas/launceston/', label: 'Launceston TAS' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/tas/devonport/', label: 'Devonport TAS' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/tas/', label: 'Tasmania Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-tas');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-tas'});
    calculate();
  });
});

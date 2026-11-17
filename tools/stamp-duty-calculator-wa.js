/* WA Stamp Duty Calculator — uses RevenueWA 2026–27 rates (FHB thresholds raised 7 May 2026; verified 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for WA; this file exists so the WA-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var WA_FOREIGN_RATE = 0.07;
var WA_FHB_FULL = 600000;   // raised from $500k for transactions from 7 May 2026
var WA_FHB_PARTIAL = 800000; // raised from $700k (2026-27 Budget; retrospective to 7 May 2026 — confirm status with RevenueWA)

// State-standard transfer duty (investor / non-FHB).
function calcWAStandard(v) {
  if (v <= 0) return 0;
  if (v <= 120000) return v * 0.019;
  if (v <= 150000) return 2280 + (v - 120000) * 0.0285;
  if (v <= 360000) return 3135 + (v - 150000) * 0.038;
  if (v <= 725000) return 11115 + (v - 360000) * 0.0475;
  return 28452.5 + (v - 725000) * 0.0515;
}

function calcWADuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcWAStandard(v);

  // Vacant land: same treatment as tools/stamp-duty-calculator.js, which only
  // applies first home buyer relief to dwellings (QLD land aside).
  if (fhb && ptype === 'land') {
    return { duty: standard, note: 'First home buyer relief for vacant land has different rules that this page does not model, so standard duty is shown.' };
  }

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

  var result = calcWADuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * WA_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  // Landgate FY2026-27 (verified 6 Jul 2026): transfer banded — <=$85k
  // $225.10; <=$120k $235.10; <=$200k $255.10; then + $20 per whole-or-part
  // $100,000 above $200,000. Mortgage $225.10 flat.
  var regMortgage = 225.10;
  var regTransfer = val <= 85000 ? 225.10 : val <= 120000 ? 235.10 : val <= 200000 ? 255.10
    : 255.10 + 20 * Math.ceil((val - 200000) / 100000);
  var regTotal = Math.round(regMortgage + regTransfer);
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
  if (regEl) regEl.textContent = fmt(regTotal) + ' (Landgate — transfer fee scales with price)';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (typical $1,500–$2,500)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Western Australia 2026-27 transfer duty (FHB thresholds announced in the 2026-27 Budget, applying retrospectively to transactions from 7 May 2026 — confirm the current legislative status with RevenueWA). LMI is a rough estimate. Verify with a solicitor before settlement.';

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
  slug: 'stamp-duty-wa',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the full Western Australia purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey?st=wa'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'RevenueWA',
        links: [
          { text: 'WA Transfer Duty', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty' },
          { text: 'First Home Owner Rate of Duty', href: 'https://www.wa.gov.au/government/publications/duties-fact-sheet-first-home-owner-rate' }
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
        "v": "$10,355"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$10,355"
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
        "v": "$16,340"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$16,340"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
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
        "v": "$42,615"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$42,615"
      },
      {
        "k": "First home buyer duty",
        "v": "$42,615 (over cap)"
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

/* SA Stamp Duty Calculator — uses RevenueSA 2026–27 rates (verified 5 Jul 2026).
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
  if (fhb && ptype === 'land') {
    return { duty: standard, note: 'SA first home relief can cover vacant land you build a new home on. This page doesn’t model it, so this is standard duty.' };
  }
  if (fhb) {
    return { duty: standard, note: 'SA first home relief covers new homes and land to build on, not established homes. This page doesn’t model it, so this is the full duty you’d pay on an established home.' };
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
  // Land Services SA FY2026-27 (verified 6 Jul 2026): transfer fee is ad
  // valorem with NO cap — <=$5k $204; <=$20k $228; <=$40k $251; then $353 +
  // $105 per $10,000 (or part) above $50,000 ($750k => $7,703, the highest
  // registration fee in the country). Mortgage $204 flat.
  var regMortgage = 204;
  var regTransfer = val <= 5000 ? 204 : val <= 20000 ? 228 : val <= 40000 ? 251
    : 353 + 105 * Math.ceil(Math.max(0, val - 50000) / 10000);
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
  var cta = document.getElementById('cta');
  if (cta) cta.style.display = '';

  var lvrEl = document.getElementById('r-lvr');
  if (lvrEl) lvrEl.textContent = (lvr * 100).toFixed(1) + '% (' + fmt(loanAmount) + ' loan)';
  var lmiEl = document.getElementById('r-lmi');
  if (lmiEl) lmiEl.textContent = lmiLabel;
  var regEl = document.getElementById('r-reg');
  if (regEl) regEl.textContent = fmt(regTotal) + ' (Land Services SA, transfer fee rises with the price)';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (my estimate; allow $1,300 to $2,200)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimate at RevenueSA’s 2026-27 rates. The LMI figure is my own estimate by LVR band, with no published rate table behind it, so ask your lender for the premium. Check the final figures with your conveyancer before settlement.';

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
    title: 'Buying your first home in South Australia',
    description: 'The First Home Journey adds this duty to a budget for the whole purchase and tracks your contract dates through to settlement.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey?st=sa'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'RevenueSA',
        links: [
          { text: 'Stamp duty on conveyances', href: 'https://www.revenuesa.sa.gov.au/stampduty' },
          { text: 'First home owner stamp duty relief (new homes)', href: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First home buyers',
        links: [
          { text: 'First Home Guarantee', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'Moneysmart: buying a house', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Home loans and rental property',
        links: [
          { text: 'Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'Moneysmart: choosing a home loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' }
        ]
      }
    ],
    disclaimer: 'This is general information, not advice. RevenueSA or your conveyancer can confirm the duty on your contract.'
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
    "label": "$520,000 property",
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
        "v": "$22,430 (established home, no relief)"
      }
    ]
  },
  {
    "label": "$680,000 property",
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
        "v": "$31,230 (established home, no relief)"
      }
    ]
  },
  {
    "label": "$1,000,000 property",
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
        "v": "$48,830 (established home, no relief)"
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
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/sa/adelaide/', label: 'Adelaide SA' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/sa/glenelg/', label: 'Glenelg SA' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/sa/norwood/', label: 'Norwood SA' },
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

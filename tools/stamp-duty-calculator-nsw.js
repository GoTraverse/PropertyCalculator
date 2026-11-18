/* NSW Stamp Duty Calculator — uses Revenue NSW 2026–27 rates
 * (brackets CPI-indexed 1 Jul 2026; verified vs Revenue NSW 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for NSW; this file exists so the NSW-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var NSW_FOREIGN_RATE = 0.09;
var NSW_FHB_FULL = 800000;
var NSW_FHB_PARTIAL = 1000000;

// State-standard transfer duty (investor / non-FHB).
function calcNSWStandard(v) {
  if (v <= 0) return 0;
  if (v <= 18000) return v * 0.0125;
  if (v <= 38000) return 225 + (v - 18000) * 0.015;
  if (v <= 103000) return 525 + (v - 38000) * 0.0175;
  if (v <= 387000) return 1662.5 + (v - 103000) * 0.035;
  if (v <= 1290000) return 11602.5 + (v - 387000) * 0.045;
  if (v <= 3870000) return 52237.5 + (v - 1290000) * 0.055;
  return 194137.5 + (v - 3870000) * 0.07;
}

function calcNSWDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcNSWStandard(v);

  // Vacant land: same treatment as tools/stamp-duty-calculator.js, which only
  // applies first home buyer relief to dwellings (QLD land aside).
  if (fhb && ptype === 'land') {
    return { duty: standard, note: 'First home buyer relief for vacant land has different rules that this page does not model, so standard duty is shown.' };
  }

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
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) _showErr('Enter the purchase price.'); return; }

  var ptype = document.getElementById('ptype').value;
  var buyerEl = document.getElementById('buyer'); // only the QLD page has a buyer profile
  var buyer = buyerEl ? buyerEl.value : 'owner';
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
  // NSW LRS FY2026-27 (verified 6 Jul 2026): $182.73 incl GST per dealing.
  var regMortgage = 183;
  var regTransfer = 183;
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
  var cta = document.getElementById('cta');
  if (cta) cta.style.display = '';

  var lvrEl = document.getElementById('r-lvr');
  if (lvrEl) lvrEl.textContent = (lvr * 100).toFixed(1) + '% (' + fmt(loanAmount) + ' loan)';
  var lmiEl = document.getElementById('r-lmi');
  if (lmiEl) lmiEl.textContent = lmiLabel;
  var regEl = document.getElementById('r-reg');
  if (regEl) regEl.textContent = fmt(regTotal) + ' (mortgage $' + regMortgage + ' + transfer $' + regTransfer + ')';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (my estimate; allow $1,300 to $2,200)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimate only, on the 2026-27 NSW transfer duty brackets (indexed 1 July 2026, checked 5 July 2026). The LMI figure is my own estimate by LVR band, with no published rate table behind it, so ask your lender for the premium. Check the figures with your solicitor before settlement.';

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
  slug: 'stamp-duty-nsw',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the rest of the NSW purchase',
    description: 'The First Home Journey builds a budget around this duty and the other upfront costs, then tracks your contract deadlines through to settlement.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey?st=nsw'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'Revenue NSW',
        links: [
          { text: 'Transfer duty', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'First Home Buyers Assistance Scheme', href: 'https://www.revenue.nsw.gov.au/grants-schemes/previous-schemes/first-home-buyer-assistance' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First home buyer schemes',
        links: [
          { text: 'First Home Guarantee (5% Deposit Scheme)', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'Moneysmart: buying a house', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Home loans and tax',
        links: [
          { text: 'Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'Moneysmart: choosing a home loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' }
        ]
      }
    ],
    disclaimer: 'Check the current rates with Revenue NSW before you sign.'
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
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "NSW, $640,000 property",
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
        "v": "$22,988"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$22,988"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
      }
    ]
  },
  {
    "label": "NSW, $900,000 property",
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
        "v": "$34,688"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$34,688"
      },
      {
        "k": "First home buyer duty",
        "v": "$17,344 (FHB concession)"
      }
    ]
  },
  {
    "label": "NSW, $1,200,000 property",
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
        "v": "$48,188"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$48,188"
      },
      {
        "k": "First home buyer duty",
        "v": "$48,188 (over cap)"
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

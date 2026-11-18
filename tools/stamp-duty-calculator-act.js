/* ACT Stamp Duty Calculator — uses ACT Revenue Office 2026–27 rates (HBCS uncapped from 1 Jul 2026; verified 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for ACT; this file exists so the ACT-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

// The ACT does NOT levy a one-off foreign-buyer stamp-duty surcharge (foreign
// owners pay a separate annual land-tax surcharge instead) — so no surcharge
// here and no foreign-buyer input on the page.
var ACT_FHB_FULL = Infinity;   // HBCS: no property value limit from 1 Jul 2026
var ACT_FHB_PARTIAL = Infinity; // (and no income test)

// State-standard transfer duty (investor / non-FHB).
function calcACTStandard(v) {
  if (v <= 0) return 0;
  if (v > 1455000) return v * 0.0454;
  if (v <= 260000) return v * 0.0028;
  if (v <= 300000) return 728 + (v - 260000) * 0.022;
  if (v <= 500000) return 1608 + (v - 300000) * 0.034;
  if (v <= 750000) return 8408 + (v - 500000) * 0.0432;
  if (v <= 1000000) return 19208 + (v - 750000) * 0.059;
  return 33958 + (v - 1000000) * 0.064;
}

function calcACTDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcACTStandard(v);

  // Vacant land: same treatment as tools/stamp-duty-calculator.js, which only
  // applies first home buyer relief to dwellings (QLD land aside).
  if (fhb && ptype === 'land') {
    return { duty: standard, note: 'The concession for vacant land has different rules that this page does not model, so standard duty is shown.' };
  }

  if (fhb && v <= ACT_FHB_FULL) {
    return { duty: 0, note: 'Home Buyer Concession Scheme applied, so no duty. From 1 July 2026 the scheme has no income test or property value limit.' };
  }
  if (fhb && v <= ACT_FHB_PARTIAL && ACT_FHB_PARTIAL > ACT_FHB_FULL) {
    var slide = (ACT_FHB_PARTIAL - v) / (ACT_FHB_PARTIAL - ACT_FHB_FULL);
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

  var result = calcACTDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var total = duty;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  // ACT Land Titles (Fees) Determination 2026 (No 2), from 1 Jul 2026:
  // mortgage $184, transfer $496 — both flat (verified 6 Jul 2026).
  var regMortgage = 184;
  var regTransfer = 496;
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

  document.getElementById('disclaimer').textContent = 'Estimate only, at the ACT\'s 2026-27 conveyance duty rates (HBCS uncapped from 1 July 2026). The LMI figure is my own estimate by LVR band, with no published rate table behind it, so ask your lender for the premium. Check the figures with your solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-act', {
      purchasePrice: val,
      stampDuty: duty,
      foreignBuyerDuty: 0,
      totalCost: total,
      effectiveRate: rate.toFixed(2),
      buyer: buyer,
      propertyType: ptype,
      isFHB: isFHB,
      isForeign: false
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'stamp-duty-act',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the rest of the ACT purchase',
    description: 'The First Home Journey builds a budget from your income and savings that includes the duty, the deposit and the other upfront costs.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey?st=act'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'ACT Revenue Office',
        links: [
          { text: 'Conveyance duty', href: 'https://www.revenue.act.gov.au/duties/conveyance-duty' },
          { text: 'Home Buyer Concession Scheme', href: 'https://www.revenue.act.gov.au/home-buyer-assistance/home-buyer-concession-scheme' }
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
    disclaimer: 'Check the current rates and the HBCS rules with the ACT Revenue Office before you sign.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-act',
    text: 'Just calculated my Australian Capital Territory stamp duty instantly!'
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
    "label": "ACT, $800,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$800,000"
      },
      {
        "k": "State",
        "v": "Australian Capital Territory"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$22,158"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$22,158"
      },
      {
        "k": "HBCS buyer duty",
        "v": "$0 (HBCS exemption)"
      }
    ]
  },
  {
    "label": "ACT, $1,050,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,050,000"
      },
      {
        "k": "State",
        "v": "Australian Capital Territory"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$37,158"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$37,158"
      },
      {
        "k": "HBCS buyer duty",
        "v": "$0 (HBCS, no price cap from 1 Jul 2026)"
      }
    ]
  },
  {
    "label": "ACT, $1,200,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,200,000"
      },
      {
        "k": "State",
        "v": "Australian Capital Territory"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$46,758"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$46,758"
      },
      {
        "k": "HBCS buyer duty",
        "v": "$0 (HBCS, no price cap from 1 Jul 2026)"
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
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-act');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-act'});
    calculate();
  });
});

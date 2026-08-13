/* ACT Stamp Duty Calculator — uses ACT Revenue Office 2026–27 rates (HBCS uncapped from 1 Jul 2026; verified 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for ACT; this file exists so the ACT-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

// The ACT does NOT levy a one-off foreign-buyer stamp-duty surcharge (foreign
// owners pay a separate annual land-tax surcharge instead) — so no surcharge here.
var ACT_FOREIGN_RATE = 0;
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

  if (fhb && v <= ACT_FHB_FULL) {
    return { duty: 0, note: 'Home Buyer Concession applied — $0 duty (no income test or property value limit from 1 July 2026).' };
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
  if (!val || val <= 0) { if (!_isInit) _showErr('Please enter the purchase price.'); return; }

  var ptype = document.getElementById('ptype').value;
  var buyer = document.getElementById('buyer').value;
  var isFHB = document.getElementById('fhb').checked;
  var foreignEl = document.getElementById('foreign');
  var isForeign = foreignEl ? foreignEl.checked : false;

  var result = calcACTDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * ACT_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
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

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Australian Capital Territory 2026-27 conveyance duty (HBCS uncapped from 1 July 2026). LMI is an industry-average estimate. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-act', {
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
  slug: 'stamp-duty-act',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the full ACT purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey?st=act'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'ACT Revenue Office',
        links: [
          { text: 'ACT Conveyance Duty', href: 'https://www.revenue.act.gov.au/duties/conveyance-duty' },
          { text: 'Home Buyer Concession Scheme (HBCS)', href: 'https://www.revenue.act.gov.au/home-buyer-assistance/home-buyer-concession-scheme' }
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
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with ACT Revenue Office.'
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
    { href: '/invest/act/', text: 'ACT Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "ACT — $800,000 property",
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
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
      }
    ]
  },
  {
    "label": "ACT — $1,050,000 property",
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
        "k": "First home buyer duty",
        "v": "$0 (HBCS — no price cap from 1 Jul 2026)"
      }
    ]
  },
  {
    "label": "ACT — $1,200,000 property",
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
        "k": "First home buyer duty",
        "v": "$0 (HBCS — no price cap from 1 Jul 2026)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in the ACT?",
    "a": "ACT conveyance duty is charged by the ACT Revenue Office on the dutiable value of any property purchase. Rates step up across multiple brackets: 0.28% up to $260,000, 2.2% to $300,000, 3.4% to $500,000, 4.32% to $750,000, 5.9% to $1,000,000, and 6.4% to $1,455,000. Above $1,455,000 a flat rate of 4.54% applies to the whole purchase price. From 1 July 2026, eligible home buyers (no property owned in the previous 5 years) pay no conveyance duty at all under the Home Buyer Concession Scheme — the income test and the $1,020,000 property value limit were both removed."
  },
  {
    "q": "Do first home buyers pay stamp duty in the ACT?",
    "a": "The ACT Home Buyer Concession Scheme (HBCS) is more generous than other states — from 1 July 2026 it covers all eligible buyers (no property owned in the previous 5 years) with NO income test and NO property value limit. Eligible ACT buyers pay no conveyance duty at any price."
  },
  {
    "q": "What is the ACT Home Buyer Concession Scheme?",
    "a": "From 1 July 2026 the HBCS provides full duty exemption for eligible owner-occupiers (not just first home buyers) with no income test and no property value limit. The scheme replaced the previous First Home Owner Grant + duty concession in 2019 and is materially more generous. To qualify you must occupy the property as your principal residence for at least 12 months continuously starting within 12 months of settlement."
  },
  {
    "q": "When is stamp duty due in the ACT?",
    "a": "ACT conveyance duty is payable within 14 days of receiving the assessment notice from the ACT Revenue Office — typically within 28 days of registration. Most buyers pay duty at settlement through their solicitor or conveyancer. Late payment attracts interest at the rate published by the ACT Revenue Office."
  },
  {
    "q": "Does the ACT charge a foreign buyer surcharge?",
    "a": "The ACT does not charge a one-off foreign buyer stamp duty surcharge. Instead, foreign owners of residential property pay an annual foreign ownership land tax surcharge of 0.75% per quarter (3% per year) of the unimproved land value. This is collected separately from stamp duty and applies for as long as the foreign person owns the property."
  },
  {
    "q": "Is ACT stamp duty being abolished?",
    "a": "The ACT government has been progressively reducing residential conveyance duty rates as part of a long-running tax reform. Duty rates today are materially lower than they were a decade ago, and the trade-off has been a gradual increase in general rates (council rates) on residential property. There is no firm date for full abolition, but the trend is downward."
  }
],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/act/', label: 'Australian Capital Territory Suburb Guide' }
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

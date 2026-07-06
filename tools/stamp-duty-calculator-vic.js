/* VIC Stamp Duty Calculator — uses State Revenue Office Victoria 2026–27 rates (verified 5 Jul 2026).
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for VIC; this file exists so the VIC-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var VIC_FOREIGN_RATE = 0.08;
var VIC_FHB_FULL = 600000;
var VIC_FHB_PARTIAL = 750000;

// State-standard transfer duty (investor / non-FHB).
function calcVICStandard(v) {
  if (v <= 0) return 0;
  var d;
  if (v <= 25000) d = v * 0.014;
  else if (v <= 130000) d = 350 + (v - 25000) * 0.024;
  else d = 2870 + (v - 130000) * 0.06;
  if (v > 960000 && v <= 2000000) d = v * 0.055;
  else if (v > 2000000) d = 110000 + (v - 2000000) * 0.065;
  return d;
}

function calcVICDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calcVICStandard(v);

  if (fhb && v <= VIC_FHB_FULL) {
    return { duty: 0, note: 'First home buyer exemption applied.' };
  }
  if (fhb && v <= VIC_FHB_PARTIAL && VIC_FHB_PARTIAL > VIC_FHB_FULL) {
    var slide = (VIC_FHB_PARTIAL - v) / (VIC_FHB_PARTIAL - VIC_FHB_FULL);
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

  var result = calcVICDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * VIC_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  // Land Use Victoria FY2026-27, electronic lodgement (verified 6 Jul 2026):
  // transfer $104.30 + $2.34 per whole $1,000 of price, rounded UP to the
  // next dollar, capped at $3,614; mortgage $129.20 flat.
  var regMortgage = 129.20;
  var regTransfer = Math.min(3614, Math.ceil(104.30 + Math.floor(val / 1000) * 2.34));
  var regTotal = Math.round(regMortgage + regTransfer);
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
  if (regEl) regEl.textContent = fmt(regTotal) + ' (Land Use Victoria — transfer fee scales with price)';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (typical $1,500–$2,500)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Victoria 2026-27 land transfer duty. LMI is an industry-average estimate. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-vic', {
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
  slug: 'stamp-duty-vic',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full Victoria investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State Revenue Office Victoria',
        links: [
          { text: 'VIC Land Transfer Duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'First Home Buyer Duty Exemption / Concession', href: 'https://www.sro.vic.gov.au/first-home-buyer-duty-exemption-or-concession' }
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
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with State Revenue Office Victoria.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-vic',
    text: 'Just calculated my Victoria stamp duty instantly!'
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
    { href: '/invest/vic/', text: 'VIC Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
  {
    "label": "VIC — $480,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$480,000"
      },
      {
        "k": "State",
        "v": "Victoria"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$23,870"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$23,870"
      },
      {
        "k": "First home buyer duty",
        "v": "$0 (FHB exemption)"
      }
    ]
  },
  {
    "label": "VIC — $680,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$680,000"
      },
      {
        "k": "State",
        "v": "Victoria"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$35,870"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$35,870"
      },
      {
        "k": "First home buyer duty",
        "v": "$19,131 (FHB concession)"
      }
    ]
  },
  {
    "label": "VIC — $1,000,000 property",
    "inputs": [
      {
        "k": "Property price",
        "v": "$1,000,000"
      },
      {
        "k": "State",
        "v": "Victoria"
      }
    ],
    "outputs": [
      {
        "k": "Investor duty",
        "v": "$55,000"
      },
      {
        "k": "Owner-occupier duty",
        "v": "$55,000"
      },
      {
        "k": "First home buyer duty",
        "v": "$55,000 (over cap)"
      }
    ]
  }
],
  faq: [
  {
    "q": "How does stamp duty work in Victoria?",
    "a": "Victorian stamp duty (officially \"land transfer duty\") is charged by the State Revenue Office Victoria (SRO) on the dutiable value of any property purchase. Duty is 1.4% up to $25,000, 2.4% on the portion from $25,000 to $130,000, and 6% on the portion from $130,000 to $960,000. From $960,000 to $2 million duty is a flat 5.5% of the whole price, and above $2 million it is $110,000 plus 6.5% of the amount over $2 million."
  },
  {
    "q": "Do first home buyers pay stamp duty in Victoria?",
    "a": "Eligible first home buyers pay no land transfer duty on properties up to $600,000, with a sliding partial concession from $600,000 to $750,000. Above $750,000 the standard rates apply. The exemption applies to both new and established homes used as a principal place of residence."
  },
  {
    "q": "What is the Victorian PPR concession?",
    "a": "The State Revenue Office offers a principal place of residence (PPR) concession for some owner-occupiers buying a home as their principal residence, separate from the first home buyer exemption. This calculator does not model the PPR concession — its owner-occupier figure uses the standard land transfer duty rates, so treat the owner-occupier result as the duty before any PPR concession you may separately qualify for. Confirm your eligibility and the current value limits with the SRO."
  },
  {
    "q": "When is stamp duty due in Victoria?",
    "a": "Land transfer duty in Victoria is payable within 30 days of settlement. In practice, your conveyancer pays the SRO at settlement using funds drawn from your loan and deposit. Late payment attracts interest at the rate published by the SRO, plus penalty tax in some circumstances."
  },
  {
    "q": "What is the foreign purchaser additional duty in Victoria?",
    "a": "Foreign purchasers pay an additional 8% foreign purchaser duty on top of standard land transfer duty when buying residential property in Victoria. The surcharge is collected by the SRO at the same time as the standard duty. Australian citizens, permanent residents (including New Zealand citizens with a Special Category Visa who satisfy the residency test) are not foreign purchasers."
  },
  {
    "q": "Is Victorian stamp duty tax deductible?",
    "a": "No. Stamp duty paid by a Victorian property investor is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all."
  }
],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/st-kilda/', label: 'St Kilda VIC' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/carlton/', label: 'Carlton VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/vic/melbourne/', label: 'Melbourne Suburb Guide' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/vic/', label: 'Victoria Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-vic');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-vic'});
    calculate();
  });
});

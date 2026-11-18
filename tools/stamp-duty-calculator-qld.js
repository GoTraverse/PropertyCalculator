/* QLD Transfer Duty calculator — uses Queensland Revenue Office (QRO) 2026–27 (thresholds unchanged; verified 5 Jul 2026)
 * rates as published at https://qro.qld.gov.au/duties/transfer-duty/. The
 * standard, home concession, and first home concession brackets here mirror
 * those already used by tools/stamp-duty-calculator.js for QLD; this file
 * exists so the QLD landing URL can run a state-locked version of the tool
 * without a state selector. */

var QLD_FOREIGN_RATE = 0.08;

// Standard transfer duty (investor / non-home).
function calcQldStandard(v) {
  if (v <= 5000) return 0;
  if (v <= 75000) return (v - 5000) * 0.015;
  if (v <= 540000) return 1050 + (v - 75000) * 0.035;
  if (v <= 1000000) return 17325 + (v - 540000) * 0.045;
  return 38025 + (v - 1000000) * 0.0575;
}

// Home concession rates — applies when the buyer occupies the property as
// their principal place of residence. Saves up to $7,175 compared to the
// standard rate.
function calcQldHome(v) {
  if (v <= 350000) return v * 0.01;
  if (v <= 540000) return 3500 + (v - 350000) * 0.035;
  // From $540k the concessional rate matches standard (4.5% then 5.75% above
  // $1M), so the saving versus standard stays flat at $7,175.
  if (v <= 1000000) return 10150 + (v - 540000) * 0.045;
  return 30850 + (v - 1000000) * 0.0575;
}

// First home concession amount — QRO's exact $10,000-band table (contracts on
// or after 9 Jun 2024; unchanged FY2026-27, verified 5 Jul 2026 vs
// qro.qld.gov.au/duties/transfer-duty/concessions/homes/concession-rates/):
// $17,350 at ≤$709,999.99, stepping down $1,735 per $10,000 band to nil at
// $800,000+. The amount is deducted from the HOME-concession duty (not the
// standard rate). QRO worked example: $730,000 → $18,700 − $12,145 = $6,555.
function qldFhbConcessionAmt(v) {
  if (v < 710000) return 17350;
  if (v >= 800000) return 0;
  return 17350 - Math.floor((v - 700000) / 10000) * 1735;
}
function calcQldFhbHome(v) {
  return Math.max(0, calcQldHome(v) - qldFhbConcessionAmt(v));
}

// First home vacant land concession — NO duty at any land value for
// agreements entered into from 1 May 2025 (QRO: "If the whole property is
// residential vacant land — no duty will be payable"). The old $250k/$400k
// and $350k/$500k tapers only apply to pre-1-May-2025 contracts.
function calcQldFhbLand(v) {
  return 0;
}

function calcQldDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  if (fhb && ptype === 'land') {
    return { duty: calcQldFhbLand(v), note: 'First home vacant land concession applied. No duty at any value for contracts from 1 May 2025.' };
  }
  if (fhb && ptype === 'home') {
    if (v <= 700000) return { duty: 0, note: 'First home concession applied. No duty to pay.' };
    if (v < 800000) return { duty: calcQldFhbHome(v), note: 'First home concession applied, using QRO\'s $10,000 price bands.' };
    return { duty: calcQldFhbHome(v), note: 'Home concession applied. The price is above the first home concession range.' };
  }
  if (buyer === 'owner' && ptype === 'home') {
    return { duty: calcQldHome(v), note: 'Home concession applied (owner-occupier).' };
  }
  return { duty: calcQldStandard(v), note: '' };
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
  var isForeign = document.getElementById('foreign').checked;

  var result = calcQldDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * QLD_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  // Titles Queensland FY2026-27 lodgement fees (from 1 Jul 2026; verified
  // 5 Jul 2026 vs the official schedule PDF). Unlike most states, the QLD
  // transfer fee SCALES with price: $248.04 base + $46.56 per $10,000 (or
  // part) of consideration above $180,000. Mortgage lodgement is flat.
  var regMortgage = 248.04;
  var regTransfer = 248.04 + (val > 180000 ? Math.ceil((val - 180000) / 10000) * 46.56 : 0);
  var regTotal = Math.round(regMortgage + regTransfer);
  var conveyancing = 1800;
  function lmiRate(lvr) {
    // Rounded first, as lmiRate() in journey.js does: price × 0.8 ÷ price
    // can come out as 0.8000000000000002 and land in the next tier.
    lvr = Math.round(lvr * 10000) / 10000;
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
  document.getElementById('r-foreign').textContent = isForeign ? fmt(foreignAmt) : 'N/A';
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
  if (regEl) regEl.textContent = fmt(regTotal) + ' (Titles Queensland; the transfer fee rises with the price)';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (my estimate; allow $1,300 to $2,200)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimate only, at Queensland\'s 2026–27 transfer duty rates. From 1 Aug 2026 the home concessions need Australian citizenship, permanent residency or specified foreign retiree status. The LMI figure is my own estimate by LVR band, with no published rate table behind it, so ask your lender for the premium. Registration fees are from the Titles Queensland FY2026-27 schedule. Check the figures with your solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-qld', {
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
  slug: 'stamp-duty-qld',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the rest of the Queensland purchase',
    description: 'The First Home Journey checks the government schemes against your income and savings, then builds a budget that includes this duty and the other upfront costs.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey?st=qld'
  },
  resources: {
    groups: [
      {
        icon: '🏛️', title: 'Queensland Revenue Office',
        links: [
          { text: 'Transfer duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'Home concession', href: 'https://qro.qld.gov.au/duties/transfer-duty/concessions/homes/' },
          { text: 'First home concession', href: 'https://qro.qld.gov.au/duties/transfer-duty/concessions/homes/first-home/' },
          { text: 'First home vacant land concession', href: 'https://qro.qld.gov.au/duties/transfer-duty/concessions/homes/first-home-vacant-land/' },
          { text: 'Lodging and paying transfer duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/lodging-and-paying/' }
        ]
      },
      {
        icon: '🎯', title: 'First home buyer schemes',
        links: [
          { text: 'Queensland First Home Owner Grant', href: 'https://qro.qld.gov.au/grants/first-home-owner-grant/' },
          { text: 'First Home Guarantee (5% Deposit Scheme)', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' }
        ]
      },
      {
        icon: '💰', title: 'Home loans and tax',
        links: [
          { text: 'Moneysmart: buying a house', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Moneysmart: choosing a home loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'ATO: residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' }
        ]
      }
    ],
    disclaimer: 'Check the current rates with the Queensland Revenue Office before you sign.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator-qld',
    text: 'Just calculated my Queensland stamp duty instantly!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'All-state Stamp Duty Calculator' },
    { href: '/tools/cost-of-purchase-calculator', icon: '💵', label: 'Total Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', icon: '📊', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '🎁', label: 'FHB Grants Calculator' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'All States' },
    { href: '/tools/cost-of-purchase-calculator', text: 'Cost of Purchase' },
    { href: '/invest/qld/', text: 'QLD Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'QLD investor, $750,000',
      inputs: [
        { k: 'Property price', v: '$750,000' },
        { k: 'Buyer profile', v: 'Investor' },
        { k: 'Property type', v: 'Residential dwelling' }
      ],
      outputs: [
        { k: 'Transfer duty', v: '$26,775' },
        { k: 'Effective rate', v: '3.57%' }
      ]
    },
    {
      label: 'QLD owner-occupier, $750,000',
      inputs: [
        { k: 'Property price', v: '$750,000' },
        { k: 'Buyer profile', v: 'Owner-occupier' },
        { k: 'Property type', v: 'Residential dwelling' }
      ],
      outputs: [
        { k: 'Transfer duty', v: '$19,600' },
        { k: 'Saving vs investor', v: '$7,175' }
      ]
    },
    {
      label: 'QLD first home buyer, $480,000',
      inputs: [
        { k: 'Property price', v: '$480,000' },
        { k: 'Buyer profile', v: 'Owner-occupier' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Transfer duty', v: '$0' },
        { k: 'Concession applied', v: 'Full first home exemption' }
      ]
    }
  ],
  faq: [
    { q: 'When is stamp duty due in QLD?',
      a: 'Transfer duty is payable within 30 days of the dutiable transaction, usually 30 days after the contract date or settlement, whichever is later. In practice your solicitor or conveyancer pays QRO at settlement. Duty isn\'t financed by your mortgage, so it has to come from your cash or your deposit. Late payment attracts unpaid tax interest at a rate QRO publishes each year.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '📊', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/new-farm/', label: 'New Farm QLD' },
    { group: 'Guides', icon: '📖', href: '/invest/qld/', label: 'Queensland Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-qld');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-qld'});
    calculate();
  });
});

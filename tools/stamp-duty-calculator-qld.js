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
  // Above $540k the concessional rate keeps growing at 4.5%, so the saving
  // versus standard ($7,175) stays flat.
  return 10150 + (v - 540000) * 0.045;
}

// First home concession (residential dwelling). From 1 May 2025 the QLD first
// home concession gives full exemption up to $700,000, with a sliding partial
// concession to $800,000, then the standard home concession.
function calcQldFhbHome(v) {
  if (v <= 700000) return 0;
  if (v <= 800000) {
    var home = calcQldHome(v);
    var slide = (800000 - v) / 100000; // 1.0 at $700k, 0 at $800k
    return Math.max(0, home * (1 - slide));
  }
  return calcQldHome(v);
}

// First home vacant land concession. Full exemption up to $250,000, sliding
// partial concession to $400,000, then standard.
function calcQldFhbLand(v) {
  if (v <= 250000) return 0;
  if (v <= 400000) {
    var std = calcQldStandard(v);
    var slide = (400000 - v) / 150000;
    return Math.max(0, std * (1 - slide));
  }
  return calcQldStandard(v);
}

function calcQldDuty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  if (fhb && ptype === 'land') {
    return { duty: calcQldFhbLand(v), note: 'First home vacant land concession applied.' };
  }
  if (fhb && ptype === 'home') {
    if (v <= 700000) return { duty: 0, note: 'First home concession — full exemption.' };
    if (v <= 800000) return { duty: calcQldFhbHome(v), note: 'First home concession — partial.' };
    return { duty: calcQldFhbHome(v), note: 'Home concession applied (over first home threshold).' };
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
  if (!val || val <= 0) { if (!_isInit) _showErr('Please enter the purchase price.'); return; }

  var ptype = document.getElementById('ptype').value;
  var buyer = document.getElementById('buyer').value;
  var isFHB = document.getElementById('fhb').checked;
  var isForeign = document.getElementById('foreign').checked;

  var result = calcQldDuty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * QLD_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  document.getElementById('r-duty').textContent = fmt(duty);
  document.getElementById('r-foreign').textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';
  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on Queensland 2026–27 transfer duty. From 1 Aug 2026, home concessions require Australian citizenship, permanent residency or specified foreign retiree status. Verify with a solicitor before settlement.';

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
    title: 'Model the full Queensland investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '🏛️', title: 'Queensland Revenue Office',
        links: [
          { text: 'QLD Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'Home Concession Rates', href: 'https://qro.qld.gov.au/duties/transfer-duty/concessions/homes/' },
          { text: 'First Home Concession', href: 'https://qro.qld.gov.au/duties/transfer-duty/concessions/homes/first-home/' },
          { text: 'First Home Vacant Land', href: 'https://qro.qld.gov.au/duties/transfer-duty/concessions/homes/first-home-vacant-land/' },
          { text: 'QRO: Pay Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/lodging-and-paying/' }
        ]
      },
      {
        icon: '🎯', title: 'First Home Buyer',
        links: [
          { text: 'QLD First Home Owner Grant', href: 'https://qro.qld.gov.au/grants/first-home-owner-grant/' },
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' }
        ]
      },
      {
        icon: '💰', title: 'Financial Planning',
        links: [
          { text: 'ASIC: Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'ATO: Rental Properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' }
        ]
      }
    ],
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with the Queensland Revenue Office.'
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
    { q: 'How does stamp duty work in Queensland?',
      a: 'Queensland calls stamp duty "transfer duty". It is charged by the Queensland Revenue Office (QRO) on the dutiable value of the property at settlement. Rates step up across price brackets — nil under $5,000 to 5.75% above $1 million. Owner-occupiers can apply for a home concession (saves up to $7,175) and first home buyers get a separate concession that fully exempts purchases up to $700,000.' },
    { q: 'What is the QLD home concession?',
      a: 'The home concession is a reduced transfer duty rate available to anyone buying a home as their principal place of residence — including non-first-home-buyers. It saves up to $7,175 compared to the investor rate. To qualify you must move in within 12 months of settlement and live there for at least 12 months.' },
    { q: 'What is the QLD first home buyer concession?',
      a: 'Eligible first home buyers pay no transfer duty on residential purchases up to $700,000 (thresholds lifted from 1 May 2025). A sliding partial concession applies between $700,000 and $800,000. For vacant land, the first home concession provides full exemption up to $250,000 with a partial concession to $400,000. You must intend to live in the home as your principal place of residence within 12 months of settlement.' },
    { q: 'When is stamp duty due in QLD?',
      a: 'Transfer duty is payable within 30 days of the dutiable transaction — usually 30 days after contract date or settlement. Most buyers pay duty at settlement through their solicitor or conveyancer.' },
    { q: 'What is the difference between stamp duty and transfer duty?',
      a: 'There is no difference — they are the same tax. Queensland officially renamed stamp duty to "transfer duty" in the Duties Act 2001 because the document no longer carries a physical stamp. Buyers, lenders, and solicitors still use both terms interchangeably.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '📊', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/new-farm/', label: 'New Farm QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/invest/qld/brisbane/', label: 'Brisbane Suburb Guide' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' },
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

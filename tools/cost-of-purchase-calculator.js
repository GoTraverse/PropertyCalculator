/* ═══ STATE COSTS ═══ */
var stateCosts = {
  NSW: { conveyancing: { min: 800, max: 1500 }, stampDutyRate: 0.045, fhbThreshold: 500000 },
  VIC: { conveyancing: { min: 1000, max: 1800 }, stampDutyRate: 0.04, fhbThreshold: 600000 },
  QLD: { conveyancing: { min: 600, max: 1200 }, stampDutyRate: 0.03, fhbThreshold: 500000 },
  SA:  { conveyancing: { min: 700, max: 1400 }, stampDutyRate: 0.032, fhbThreshold: 450000 },
  WA:  { conveyancing: { min: 900, max: 1600 }, stampDutyRate: 0.04, fhbThreshold: 600000 },
  TAS: { conveyancing: { min: 600, max: 1200 }, stampDutyRate: 0.03, fhbThreshold: 360000 },
  ACT: { conveyancing: { min: 800, max: 1500 }, stampDutyRate: 0.035, fhbThreshold: 475000 },
  NT:  { conveyancing: { min: 700, max: 1300 }, stampDutyRate: 0.03, fhbThreshold: 450000 }
};

function getNumVal(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function setTextContent(id, val) {
  document.getElementById(id).textContent = Math.round(val).toLocaleString('en-AU');
}

function calc() {
  var purchasePrice = getNumVal('purchasePrice');
  var depositPct = getNumVal('depositPct');
  var loan = getNumVal('loanAmount');
  var state = document.getElementById('state').value;
  var isFhb = document.getElementById('fhb').checked;
  var isForeignBuyer = document.getElementById('foreignBuyer').checked;
  var isRenting = document.getElementById('currentlyRenting').checked;
  var weeklyRent = getNumVal('weeklyRent');
  var leaseBreak = getNumVal('leaseBreak');

  var deposit = purchasePrice * (depositPct / 100);
  var calculatedLoan = purchasePrice - deposit;
  document.getElementById('loanAmount').value = Math.round(calculatedLoan);

  var stampDuty = 0;
  var costs = stateCosts[state];
  if (costs) {
    var baseRate = costs.stampDutyRate;
    stampDuty = purchasePrice * baseRate;
    if (isFhb && purchasePrice <= costs.fhbThreshold) stampDuty = stampDuty * 0.5;
    if (isForeignBuyer) stampDuty = stampDuty * 1.08;
  }

  var bankValuation = Math.max(300, Math.min(700, purchasePrice / 1000));
  var loanFee = Math.max(150, calculatedLoan * 0.002);
  var settlementFee = 250;
  var conveyancing = costs.conveyancing.min + (costs.conveyancing.max - costs.conveyancing.min) * 0.5;
  var inspection = 500;

  var lmi = 0;
  if (depositPct < 20) {
    var lvr = (calculatedLoan / purchasePrice) * 100;
    if (lvr >= 95) lmi = calculatedLoan * 0.018;
    else if (lvr >= 90) lmi = calculatedLoan * 0.012;
    else if (lvr >= 85) lmi = calculatedLoan * 0.008;
    else if (lvr >= 80) lmi = calculatedLoan * 0.005;
  }

  var buildingIns = purchasePrice * 0.004;
  var contentsIns = 500;
  var movingCosts = 2500;
  var leaseBreakCost = isRenting ? leaseBreak : 0;

  setTextContent('stampDuty', stampDuty);
  setTextContent('conveyancing', conveyancing);
  setTextContent('bankValuation', bankValuation);
  setTextContent('loanFee', loanFee);
  setTextContent('settlementFee', settlementFee);
  setTextContent('inspection', inspection);
  setTextContent('buildingIns', buildingIns);
  setTextContent('contentsIns', contentsIns);
  setTextContent('movingCosts', movingCosts);

  document.getElementById('lmiRow').style.display = depositPct < 20 ? 'flex' : 'none';
  setTextContent('lmi', lmi);
  document.getElementById('leaseBreakRow').style.display = isRenting ? 'flex' : 'none';
  setTextContent('leaseBreakCost', leaseBreakCost);
  document.getElementById('rentGroup').style.display = isRenting ? 'block' : 'none';

  var totalCosts = stampDuty + conveyancing + bankValuation + loanFee + settlementFee + inspection + buildingIns + contentsIns + movingCosts + lmi + leaseBreakCost;
  var totalPct = (totalCosts / purchasePrice) * 100;
  var cashNeeded = totalCosts + deposit;

  setTextContent('totalCosts', totalCosts);
  setTextContent('summaryUpfront', totalCosts);
  setTextContent('summaryPct', totalPct.toFixed(1));
  setTextContent('summaryCashNeeded', cashNeeded);

  document.getElementById('cta').style.display = '';

  // Track calculator result
  if(window.trackCalculatorResult) trackCalculatorResult('cost-of-purchase', {
    purchasePrice: purchasePrice,
    deposit: deposit,
    stampDuty: stampDuty,
    totalCosts: totalCosts,
    cashNeeded: cashNeeded,
    state: state,
    isFHB: isFhb,
    isForeignBuyer: isForeignBuyer
  });
}

var calcTimeout;
function dCalc() {
  clearTimeout(calcTimeout);
  calcTimeout = setTimeout(calc, 180);
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'cost-of-purchase',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Ready to buy?',
    description: 'Now that you know the upfront costs, use EquitySight to model your entire investment — including ongoing costs, rental income, and 30-year projections.',
    buttonText: 'Get started free \u2192',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83D\uDCB0', title: 'Stamp Duty',
        links: [
          { text: 'NSW Revenue: Stamp Duty', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'VIC: Land Transfer Duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'QLD: Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'ATO: Shared Equity Schemes', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' }
        ]
      },
      {
        icon: '\uD83C\uDFE6', title: 'Borrowing & LMI',
        links: [
          { text: 'ASIC: Mortgage Insurance', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'RBA: Interest Rates', href: 'https://www.rba.gov.au/education/' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: Tax Info', href: 'https://www.ato.gov.au/' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'FHSS Scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Law Society of Australia', href: 'https://www.lawsociety.com.au/' }
        ]
      }
    ],
    disclaimer: 'These are 2026 estimates based on typical costs. Actual costs vary by location, property, lender, and circumstance. Consult your lender, lawyer, and financial adviser before purchasing.'
  },
  share: {
    url: 'https://equitysight.app/tools/cost-of-purchase-calculator',
    text: 'Just calculated my property buying costs!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Stamp Duty' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants' },
    { href: '/tools/mortgage-stress-calculator', icon: '\uD83D\uDCC8', label: 'Mortgage Stress' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/house-flip-calculator', text: 'House Flip' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/privacy', text: 'Privacy' }
  ]
});

if(window.trackCalculatorStart) trackCalculatorStart('cost-of-purchase');
calc();
['purchasePrice','depositPct','weeklyRent','leaseBreak'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', dCalc);
});
var stateEl = document.getElementById('state');
if(stateEl) stateEl.addEventListener('change', dCalc);
['fhb','foreignBuyer','currentlyRenting'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('change', dCalc);
});
var calcBtn = document.getElementById('cop-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'cost-of-purchase'});
  calc();
});

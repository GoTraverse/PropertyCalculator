function updateContingency() {
  var reno = parseVal('reno');
  var cont = Math.round(reno * 0.15);
  document.getElementById('renocontingency').value = cont > 0 ? cont.toLocaleString('en-AU') : '';
}

function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var purchase = parseVal('purchase');
  var sale = parseVal('saleprice');
  if (!purchase || !sale) { if (!_isInit) _showErr('Enter the purchase price and the expected sale price.'); return; }

  var stamp = parseVal('stamp');
  var buyconvey = parseVal('buyconvey');
  var buyinspect = parseVal('buyinspect');
  var reno = parseVal('reno');
  var renocont = Math.round(reno * 0.15);
  var months = parseFloat(document.getElementById('months').value) || 0;
  var monthly = parseVal('monthly');
  var commission = (parseFloat(document.getElementById('commission').value) || 0) / 100;
  var sellconvey = parseVal('sellconvey');
  var staging = parseVal('staging');

  var holdingTotal = months * monthly;
  var agentFee = sale * commission;
  var totalCost = purchase + stamp + buyconvey + buyinspect + reno + renocont + holdingTotal;
  var netProceeds = sale - agentFee - sellconvey - staging;
  var netProfit = netProceeds - totalCost;
  var roi = totalCost > 0 ? (netProfit / totalCost * 100) : 0;
  var annualised = months > 0 ? roi / months * 12 : 0;

  var profitEl = document.getElementById('r-profit');
  profitEl.textContent = fmt(netProfit);
  profitEl.className = 'tool-stat-value ' + (netProfit > 0 ? 'green' : 'red');

  var verdict = '';
  if (netProfit <= 0) verdict = 'This flip makes no profit at these figures.';
  else if (months <= 0) verdict = 'Profit of ' + fmt(netProfit) + ' before tax, a ' + roi.toFixed(1) + '% return on total cost. Enter a hold period and holding costs to see the annualised return.';
  else if (annualised >= 20) verdict = 'Strong return on these figures (20% a year or more before tax). It rests on your renovation and sale price estimates.';
  else if (annualised >= 10) verdict = 'Reasonable return on these figures (10% to 20% a year before tax).';
  else verdict = 'Marginal return (under 10% a year before tax) for the risk and the work involved.';

  document.getElementById('r-cost').textContent = fmt(totalCost);
  document.getElementById('r-proceeds').textContent = fmt(netProceeds);
  document.getElementById('r-roi').textContent = roi.toFixed(1) + '%';
  document.getElementById('r-annual').textContent = months > 0 ? annualised.toFixed(1) + '% p.a.' : 'N/A';
  document.getElementById('r-verdict').textContent = verdict;

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('house-flip', {
      purchasePrice: purchase,
      salePrice: sale,
      renovationCost: reno,
      totalCost: totalCost,
      netProfit: netProfit,
      roi: roi.toFixed(1),
      annualisedReturn: annualised.toFixed(1),
      holdingMonths: months
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'house-flip',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Tax on the sale and the renovation budget',
    description: 'The capital gains tax calculator works out the tax on the sale. The renovation cost calculator estimates the budget.',
    buttonText: 'See all 18 calculators',
    buttonHref: '/tools/'
  },
  resources: {
    groups: [
      {
        icon: '\uD83D\uDCB0', title: 'Tax',
        links: [
          { text: 'ATO: capital gains tax', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ATO: GST', href: 'https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst' },
          { text: 'ATO: residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
        ]
      },
      {
        icon: '\uD83C\uDFE2', title: 'Buying',
        links: [
          { text: 'Consumer Affairs Victoria: housing', href: 'https://www.consumer.vic.gov.au/housing' },
          { text: 'ASIC Moneysmart: buying a house', href: 'https://moneysmart.gov.au/buying-a-house' },
        ]
      },
      {
        icon: '\uD83D\uDCCB', title: 'Investing',
        links: [
          { text: 'ASIC Moneysmart: property investment', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'RBA: explainers', href: 'https://www.rba.gov.au/education/resources/explainers/' },
        ]
      }
    ],
    disclaimer: 'General information, not tax or financial advice. How a flip is taxed depends on whether the ATO sees you as an investor or as running a business.'
  },
  share: {
    url: 'https://equitysight.app/tools/house-flip-calculator',
    text: 'Just calculated my house flip profit!'
  },
  related: [
    { href: '/tools/renovation-cost-calculator', icon: '\uD83D\uDD28', label: 'Renovation Costs' },
    { href: '/tools/mortgage-stress-calculator', icon: '\uD83D\uDCC8', label: 'Mortgage Stress' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/', text: 'All Calculators' },
    { href: '/tools/renovation-cost-calculator', text: 'Reno Cost' },
    { href: '/tools/capital-gains-calculator', text: 'CGT' },
    { href: '/privacy', text: 'Privacy' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🔨', href: '/tools/renovation-cost-calculator', label: 'Renovation Cost Estimator' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '💵', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase' },
    { group: 'Other Tools', icon: '📉', href: '/tools/capital-gains-calculator', label: 'Capital Gains Tax (on the resale)' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/invest/qld/', label: 'Queensland suburb directory' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'How we calculate (methodology)' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('house-flip');
calculate();
_isInit = false;
['purchase','stamp','buyconvey','buyinspect','monthly','saleprice','sellconvey','staging'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var renoEl = document.getElementById('reno');
if(renoEl) renoEl.addEventListener('input', function(){ fmtInput(this); updateContingency(); });
var calcBtn = document.getElementById('flip-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'house-flip'});
  calculate();
});

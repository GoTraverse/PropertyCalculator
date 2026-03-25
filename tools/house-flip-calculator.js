function updateContingency() {
  var reno = parseVal('reno');
  var cont = Math.round(reno * 0.15);
  document.getElementById('renocontingency').value = cont > 0 ? cont.toLocaleString() : '';
}

function calculate() {
  var purchase = parseVal('purchase');
  var sale = parseVal('saleprice');
  if (!purchase || !sale) { if (!_isInit) alert('Please enter purchase price and expected sale price.'); return; }

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
  if (netProfit <= 0) verdict = '\u26A0\uFE0F This flip appears unprofitable at these figures. Review costs or target a higher sale price.';
  else if (annualised >= 20) verdict = '\u2713 Strong projected return. Ensure your renovation and sale price estimates are realistic.';
  else if (annualised >= 10) verdict = '\u2713 Reasonable return. Verify renovation costs and allow for contingency.';
  else verdict = 'Marginal return. Consider whether the risk justifies the effort compared to other strategies.';

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
  partnerSlug: 'house-flip',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full buy\u2013hold\u2013sell strategy',
    description: 'Track equity, rental yield during hold, tax implications, and compare against a buy-and-hold strategy \u2014 in EquitySight.',
    buttonText: 'Get started free \u2192',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83D\uDCB0', title: 'Tax & Capital Gains',
        links: [
          { text: 'ATO: Capital Gains Tax Guide', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ATO: GST for Developers', href: 'https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst' },
          { text: 'ATO: Income Deductions', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ATO: Property Tax Guide', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' }
        ]
      },
      {
        icon: '\uD83C\uDFE2', title: 'Renovation & Building',
        links: [
          { text: 'Building Inspections Info', href: 'https://www.consumer.vic.gov.au/housing' },
          { text: 'ASIC: Buying a Home Guide', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Law Society Australia', href: 'https://www.lawsociety.com.au/' }
        ]
      },
      {
        icon: '\uD83D\uDCCB', title: 'Investment & Finance',
        links: [
          { text: 'MoneySmart: Property Investment', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'RBA: Housing & Mortgages', href: 'https://www.rba.gov.au/education/resources/explainers/' },
          { text: 'ASIC: Investment Loans', href: 'https://moneysmart.gov.au/property-investment' }
        ]
      }
    ],
    disclaimer: 'This is general information only. House flipping involves significant tax and financial complexity. Always consult a tax accountant, financial adviser, and lawyer before proceeding.'
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
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/renovation-cost-calculator', text: 'Reno Cost' },
    { href: '/tools/rental-yield-calculator', text: 'Rental Yield' },
    { href: '/privacy', text: 'Privacy' }
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

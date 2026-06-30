function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var propVal = parseVal('propval');
  var mortgage = parseVal('mortgage');
  var lvr = parseFloat(document.getElementById('lvr').value) / 100;

  if (!propVal || propVal <= 0) { if (!_isInit) _showErr('Please enter the property value.'); return; }
  if (!mortgage || mortgage < 0) { if (!_isInit) _showErr('Please enter the outstanding mortgage.'); return; }
  if (mortgage > propVal) { if (!_isInit) _showErr('Mortgage cannot exceed property value.'); return; }

  var equity = propVal - mortgage;
  var currentLvr = mortgage / propVal;
  var maxBorrow = propVal * lvr;
  var available = Math.max(0, maxBorrow - mortgage);

  document.getElementById('r-equity').textContent = fmt(equity);
  document.getElementById('r-current-lvr').textContent = (currentLvr * 100).toFixed(1) + '%';
  document.getElementById('r-max-borrow').textContent = fmt(maxBorrow);
  document.getElementById('r-available').textContent = fmt(available);

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('equity-release', {
      propertyValue: propVal,
      mortgage: mortgage,
      equity: equity,
      currentLVR: (currentLvr * 100).toFixed(1),
      maxBorrow: maxBorrow,
      available: available,
      targetLVR: (lvr * 100).toFixed(1)
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'equity-release',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan your renovation or investment',
    description: 'Use EquitySight to model how equity release affects your loan, plan renovations, and project rental returns.',
    buttonText: 'Try it free \u2014 no signup \u2192',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE6', title: 'Borrowing & LVR',
        links: [
          { text: 'ASIC: Lenders Mortgage Insurance', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'RBA: Housing & Mortgages', href: 'https://www.rba.gov.au/education/resources/explainers/' },
          { text: 'MoneySmart: Compare Lenders', href: 'https://moneysmart.gov.au/' }
        ]
      },
      {
        icon: '\uD83C\uDFE0', title: 'Property & Renovation',
        links: [
          { text: 'ASIC: Buying a Home Guide', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Consumer Affairs: Housing Info', href: 'https://www.consumer.vic.gov.au/housing' },
          { text: 'ASIC: Building Inspections', href: 'https://moneysmart.gov.au/home-loans/buying-a-house' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Tax & Investment',
        links: [
          { text: 'ATO: Rental Property Tax Guide', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ATO: Shared Equity Schemes', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ASIC: Financial Adviser Directory', href: 'https://moneysmart.gov.au/financial-advice' }
        ]
      }
    ],
    disclaimer: 'This information is general only. Always consult with a licensed financial adviser, accountant, and bank before using equity release for investment or renovation.'
  },
  share: {
    url: 'https://equitysight.app/tools/equity-release-calculator',
    text: 'Just calculated my home equity release options!'
  },
  related: [
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/mortgage-stress-calculator', icon: '\uD83D\uDCC8', label: 'Mortgage Stress' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: '/tools/renovation-cost-calculator', icon: '\uD83D\uDD28', label: 'Renovation Costs' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools', text: 'All Calculators' },
    { href: '/tools/borrowing-power-calculator', text: 'Borrowing Power' },
    { href: '/tools/deposit-calculator', text: 'Deposit' },
    { href: '/privacy', text: 'Privacy' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '🪙', href: '/tools/deposit-calculator', label: 'Deposit Calculator' },
    { group: 'Other Tools', icon: '🔨', href: '/tools/renovation-cost-calculator', label: 'Renovation Cost (use the equity for)' },
    { group: 'Other Tools', icon: '🏢', href: '/tools/rental-yield-calculator', label: 'Rental Yield (on a 2nd property)' },
    { group: 'Other Tools', icon: '⚖️', href: '/tools/interest-only-vs-principal-calculator', label: 'Interest Only vs P&I' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'How we calculate (methodology)' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('equity-release');
calculate();
_isInit = false;
['propval','mortgage'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var calcBtn = document.getElementById('equity-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'equity-release'});
  calculate();
});

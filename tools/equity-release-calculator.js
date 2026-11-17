function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var propVal = parseVal('propval');
  var mortgage = parseVal('mortgage');
  var lvrPct = parseFloat(document.getElementById('lvr').value);

  if (!propVal || propVal <= 0) { if (!_isInit) _showErr('Enter the property value.'); return; }
  // A blank or $0 mortgage is valid: the home is owned outright.
  if (mortgage > propVal) { if (!_isInit) _showErr('The mortgage can\'t be more than the property value.'); return; }
  if (!isFinite(lvrPct) || lvrPct <= 0 || lvrPct > 100) { if (!_isInit) _showErr('Enter a maximum LVR between 1 and 100.'); return; }
  var lvr = lvrPct / 100;

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
    title: 'Renovation cost, yield and mortgage stress',
    description: 'The renovation cost and rental yield calculators cover what the money is for. The mortgage stress calculator tests the bigger loan.',
    buttonText: 'See all 18 calculators',
    buttonHref: '/tools/'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE6', title: 'Borrowing',
        links: [
          { text: 'ASIC Moneysmart: mortgage calculator', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'ASIC Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'RBA: explainers', href: 'https://www.rba.gov.au/education/resources/explainers/' },
        ]
      },
      {
        icon: '\uD83C\uDFE0', title: 'Buying and housing',
        links: [
          { text: 'ASIC Moneysmart: buying a house', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Consumer Affairs Victoria: housing', href: 'https://www.consumer.vic.gov.au/housing' },
          { text: 'ASIC Moneysmart: home loans when buying a house', href: 'https://moneysmart.gov.au/home-loans/buying-a-house' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Tax and advice',
        links: [
          { text: 'ATO: residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ASIC Moneysmart: financial advice', href: 'https://moneysmart.gov.au/financial-advice' }
        ]
      }
    ],
    disclaimer: 'General information, not financial advice. Anything you release is secured against your home.'
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
    { href: '/tools/', text: 'All Calculators' },
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

function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;
  var propVal = parseVal('propval');
  var weekly = parseVal('weekly');
  if (!propVal || !weekly) { if (!_isInit) _showErr('Enter the property value and the weekly rent.'); return; }

  var vacancy = parseFloat(document.getElementById('vacancy').value) || 0;
  if (vacancy < 0 || vacancy > 52) { if (!_isInit) _showErr('Vacancy must be between 0 and 52 weeks a year.'); return; }
  var mgmtPct = parseFloat(document.getElementById('mgmt').value) || 0;
  var rates = parseVal('rates');
  var insurance = parseVal('insurance');
  var maint = parseVal('maintenance');

  var annualRent = weekly * (52 - vacancy);
  var mgmtCost = annualRent * (mgmtPct / 100);
  var totalExpenses = rates + insurance + maint + mgmtCost;
  var netRent = annualRent - totalExpenses;

  var grossYield = (weekly * 52 / propVal) * 100;
  var netYield = (netRent / propVal) * 100;

  // No loan is entered here, so the verdict does not claim the property is
  // positively or negatively geared. It states the test instead.
  var verdict = (totalExpenses > 0 ? '' : 'No expenses entered, so net yield equals gross yield. ') +
    'This calculator has no loan input, so it can\'t say whether the property is positively or negatively geared. ' +
    'Rent covers the loan interest when the net yield (' + netYield.toFixed(2) + '%) is higher than your interest rate multiplied by the share of the price you borrow. ' +
    'For example, a 6% rate on an 80% loan needs a net yield above 4.8%.';

  var netEl = document.getElementById('r-net');
  netEl.textContent = netYield.toFixed(2) + '%';
  netEl.className = 'tool-stat-value' + (netYield < 0 ? ' red' : '');

  document.getElementById('r-gross').textContent = grossYield.toFixed(2) + '%';
  document.getElementById('r-annualrent').textContent = fmt(annualRent);
  document.getElementById('r-expenses').textContent = totalExpenses > 0 ? fmt(totalExpenses) : 'Not entered';
  document.getElementById('r-verdict').textContent = verdict;

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('rental-yield', {
      grossYield: grossYield.toFixed(2),
      netYield: netYield.toFixed(2),
      propertyValue: propVal,
      weeklyRent: weekly,
      annualRent: annualRent,
      totalExpenses: totalExpenses
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'rental-yield',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Cash flow, land tax and CGT',
    description: 'Yield stops before the loan and tax. The property cash flow, land tax and capital gains calculators cover those.',
    buttonText: 'See all 18 calculators',
    buttonHref: '/tools/'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE2', title: 'Tax on a rental property',
        links: [
          { text: 'ATO: residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ATO: how to claim rental expenses', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/how-to-claim-rental-expenses' },
          { text: 'ATO: capital gains tax', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ATO: negative gearing', href: 'https://www.ato.gov.au/forms-and-instructions/rental-properties-2025/other-tax-considerations' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Investing',
        links: [
          { text: 'ASIC Moneysmart: property investment', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'ASIC Moneysmart: how to invest', href: 'https://moneysmart.gov.au/how-to-invest' }
        ]
      },
      {
        icon: '\uD83D\uDCCB', title: 'Renting rules',
        links: [
          { text: 'NSW Government: renting', href: 'https://www.nsw.gov.au/housing-and-construction/renting-a-place-to-live' },
          { text: 'Consumer Affairs Victoria: housing', href: 'https://www.consumer.vic.gov.au/housing' },
        ]
      }
    ],
    disclaimer: 'General information, not tax or financial advice. How a rental property is taxed depends on your circumstances.'
  },
  share: {
    url: 'https://equitysight.app/tools/rental-yield-calculator',
    text: 'Just calculated my rental yield!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Stamp Duty' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: '/tools/capital-gains-calculator', icon: '\uD83D\uDCC9', label: 'Capital Gains Tax' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/equity-release-calculator', text: 'Home Equity' },
    { href: '/tools/mortgage-stress-calculator', text: 'Mortgage Stress' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Unit, $520,000 at $510 a week',
      inputs: [
        { k: 'Property price', v: '$520,000' },
        { k: 'Weekly rent', v: '$510' },
        { k: 'Annual expenses', v: '$4,800' }
      ],
      outputs: [
        { k: 'Gross yield', v: '5.10%' },
        { k: 'Net yield', v: '4.18%' }
      ]
    },
    {
      label: 'House, $1,250,000 at $780 a week',
      inputs: [
        { k: 'Property price', v: '$1,250,000' },
        { k: 'Weekly rent', v: '$780' },
        { k: 'Annual expenses', v: '$9,200' }
      ],
      outputs: [
        { k: 'Gross yield', v: '3.24%' },
        { k: 'Net yield', v: '2.51%' }
      ]
    },
    {
      label: 'Townhouse, $395,000 at $445 a week',
      inputs: [
        { k: 'Property price', v: '$395,000' },
        { k: 'Weekly rent', v: '$445' },
        { k: 'Annual expenses', v: '$3,400' }
      ],
      outputs: [
        { k: 'Gross yield', v: '5.86%' },
        { k: 'Net yield', v: '5.00%' }
      ]
    }
  ],
  faq: [
    { q: 'What is a good rental yield?',
      a: 'The useful test is whether rent covers your loan interest. It does when the net yield is higher than your interest rate multiplied by the share of the price you borrow. A 6% rate on an 80% loan needs a net yield above 4.8%.' },
    { q: 'Should I use the purchase price or the current value?',
      a: 'For a property you\'re thinking of buying, use the price you expect to pay. For one you already own, use its current market value. As the value rises the same rent is a lower yield, which is one reason a property held for a long time can show a low yield.' },
    { q: 'Does yield include loan repayments?',
      a: 'No. Yield compares the rent with the full price of the property, whatever you borrowed. Loan repayments affect cash flow, which the property cash flow calculator works out.' },
    { q: 'What vacancy allowance should I use?',
      a: 'A rule of thumb is one to two weeks a year for a well-located property in a tight rental market, and three to four weeks or more where there is high supply, seasonal demand or older stock.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB5', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/logan-central/', label: 'Logan Central QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Queensland suburb directory' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('rental-yield');
calculate();
_isInit = false;
['propval','weekly','rates','insurance','maintenance'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var calcBtn = document.getElementById('rent-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'rental-yield'});
  calculate();
});

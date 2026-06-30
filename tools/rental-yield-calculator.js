function calculate() {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;
  var propVal = parseVal('propval');
  var weekly = parseVal('weekly');
  if (!propVal || !weekly) { if (!_isInit) _showErr('Please enter property value and weekly rent.'); return; }

  var vacancy = parseFloat(document.getElementById('vacancy').value) || 0;
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

  var verdict = '';
  if (netYield >= 6) verdict = 'Strong yield \u2014 this property is likely positively geared.';
  else if (netYield >= 4) verdict = 'Healthy yield \u2014 approaching cash-flow neutral.';
  else if (netYield >= 2) verdict = 'Moderate yield \u2014 likely negatively geared. Factor in tax benefits and capital growth.';
  else verdict = 'Low yield \u2014 significant negative gearing. Ensure capital growth outlook justifies the shortfall.';

  var netEl = document.getElementById('r-net');
  netEl.textContent = netYield.toFixed(2) + '%';
  netEl.className = 'tool-stat-value ' + (netYield >= 4 ? 'green' : netYield < 2 ? 'red' : '');

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
    title: 'Model the full investment scenario',
    description: 'Add mortgage repayments, capital growth projections, equity buildup, and compare multiple properties \u2014 free in EquitySight.',
    buttonText: 'Try it free \u2014 no signup \u2192',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE2', title: 'Investment Property Tax',
        links: [
          { text: 'ATO: Rental Property Guide', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ATO: Deductible Expenses', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/how-to-claim-rental-expenses' },
          { text: 'ATO: Capital Gains Tax', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ATO: Negative Gearing', href: 'https://www.ato.gov.au/forms-and-instructions/rental-properties-2025/other-tax-considerations' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Investment & Finance',
        links: [
          { text: 'ASIC: Investment Loans', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'MoneySmart: Property Investment', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'ASIC: Saving & Investing', href: 'https://moneysmart.gov.au/how-to-invest' }
        ]
      },
      {
        icon: '\uD83D\uDCCB', title: 'Landlord & Tenant Law',
        links: [
          { text: 'NSW Fair Trading: Renting', href: 'https://www.nsw.gov.au/housing-and-construction/renting-a-place-to-live' },
          { text: 'Consumer Affairs: Rental Law', href: 'https://www.consumer.vic.gov.au/housing' },
          { text: 'Tenants Union of Australia', href: 'https://www.tenants.org.au/' }
        ]
      }
    ],
    disclaimer: 'This is general information only. Tax treatment of rental properties varies by circumstances. Always consult a tax accountant and financial adviser before investing.'
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
    { href: '/tools/equity-release-calculator', text: 'Equity Release' },
    { href: '/tools/mortgage-stress-calculator', text: 'Mortgage Stress' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Brisbane unit — $520,000',
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
      label: 'Sydney house — $1,250,000',
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
      label: 'Ipswich townhouse — $395,000',
      inputs: [
        { k: 'Property price', v: '$395,000' },
        { k: 'Weekly rent', v: '$445' },
        { k: 'Annual expenses', v: '$3,400' }
      ],
      outputs: [
        { k: 'Gross yield', v: '5.86%' },
        { k: 'Net yield', v: '4.99%' }
      ]
    }
  ],
  faq: [
    { q: 'What is a good rental yield in Australia?',
      a: 'Gross yields typically sit between 3% and 6% across Australian capital cities. Inner-city apartments tend to deliver 3\u20134%, middle-ring houses 4\u20135%, and outer-metro or regional properties 5\u20136%+. Net yield (after costs) is usually about 1 percentage point lower.' },
    { q: 'What\u2019s the difference between gross and net yield?',
      a: 'Gross yield is annual rent \u00f7 property price. Net yield subtracts all ongoing costs (rates, insurance, management, repairs, strata) before dividing. Net yield is the more useful number for real investment decisions.' },
    { q: 'Does yield include loan repayments?',
      a: 'No. Yield is a property-level metric that measures rental return against the full purchase price. Loan repayments affect cash-flow, which you can model in the full EquitySight calculator.' },
    { q: 'Why is my yield lower in capital cities?',
      a: 'Higher property prices compress yield, even when rents are strong. Capital-city investors typically trade lower yield for better capital growth potential.' },
    { q: 'How often should I recalculate yield?',
      a: 'Annually, or whenever rents or major expenses change. Most landlords review rent at lease renewal \u2014 that\u2019s the right moment to recheck yield.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB5', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD (high yield)' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/logan-central/', label: 'Logan Central QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Best QLD Investment Suburbs' }
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

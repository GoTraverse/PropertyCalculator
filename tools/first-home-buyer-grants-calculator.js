/* ═══ STATE GRANTS DATA ═══ */
var stateGrants = {
  nsw: {
    name: 'New South Wales', stampExemptionPrice: 800000, stampPartialPrice: 1000000, stampExemptionAmt: Infinity,
    grants: [
      { label: 'First Home Owner Grant (New)', estimate: '$10,000', condition: 'New homes ≤ $600,000' },
      { label: 'Stamp Duty Exemption (≤$800k)', estimate: 'Full exemption', condition: 'Homes ≤ $800,000' },
      { label: 'Stamp Duty Partial Exemption', estimate: 'Reduces with price', condition: 'Homes $800k–$1,000k' }
    ]
  },
  vic: {
    name: 'Victoria', stampExemptionPrice: 600000, stampPartialPrice: 750000, stampExemptionAmt: 25000,
    grants: [
      { label: 'First Home Owner Grant (New)', estimate: '$10,000', condition: 'New homes ≤ $750,000' },
      { label: 'Stamp Duty Exemption (≤$600k)', estimate: 'Up to $25,000', condition: 'Homes ≤ $600,000' },
      { label: 'Stamp Duty Partial Exemption', estimate: 'Reduces with price', condition: 'Homes $600k–$750k' },
      { label: 'VicFirst Home Loan', estimate: 'Up to $195,000', condition: 'Eligible properties' }
    ]
  },
  qld: {
    name: 'Queensland', stampExemptionPrice: 500000, stampPartialPrice: 550000, stampExemptionAmt: 15000,
    grants: [
      { label: 'Stamp Duty Concession (≤$500k)', estimate: 'Full concession', condition: 'Homes ≤ $500,000' },
      { label: 'Stamp Duty Partial Concession', estimate: 'Reduces with price', condition: 'Homes $500k–$550k' },
      { label: 'First Home Buyer Grant', estimate: '$30,000', condition: 'New homes only, ≤$750k (raised May 2024)' }
    ]
  },
  sa: {
    name: 'South Australia', stampExemptionPrice: 575000, stampPartialPrice: 650000, stampExemptionAmt: 18000,
    grants: [
      { label: 'First Home Owner Grant (New)', estimate: '$15,000', condition: 'New homes (no price cap)' },
      { label: 'Stamp Duty Concession (≤$575k)', estimate: 'Full concession', condition: 'Homes ≤ $575,000' },
      { label: 'Stamp Duty Partial Concession', estimate: 'Reduces with price', condition: 'Homes $575k–$650k' }
    ]
  },
  wa: {
    name: 'Western Australia', stampExemptionPrice: 430000, stampPartialPrice: 500000, stampExemptionAmt: 12000,
    grants: [
      { label: 'First Home Owner Grant (New)', estimate: '$10,000', condition: 'New homes ≤ $750,000' },
      { label: 'Stamp Duty Exemption (≤$430k)', estimate: 'Full exemption', condition: 'Homes ≤ $430,000' },
      { label: 'Stamp Duty Partial Exemption', estimate: 'Reduces with price', condition: 'Homes $430k–$500k' }
    ]
  },
  tas: {
    name: 'Tasmania', stampExemptionPrice: 400000, stampPartialPrice: 500000, stampExemptionAmt: 15000,
    grants: [
      { label: 'Stamp Duty Concession (≤$400k)', estimate: 'Full concession', condition: 'Homes ≤ $400,000' },
      { label: 'Stamp Duty Partial Concession', estimate: 'Reduces with price', condition: 'Homes $400k–$500k' },
      { label: 'First Home Owner Grant', estimate: '$20,000', condition: 'New homes only (raised 2024)' }
    ]
  },
  act: {
    name: 'Australian Capital Territory', stampExemptionPrice: 1000000, stampPartialPrice: 1000000, stampExemptionAmt: Infinity,
    grants: [
      { label: 'Stamp Duty Exemption (≤$1M)', estimate: 'Full exemption', condition: 'All homes ≤ $1,000,000' },
      { label: 'Home Buyer Concession Scheme', estimate: 'Duty concession', condition: 'Income ≤ $160,000 combined' }
    ]
  },
  nt: {
    name: 'Northern Territory', stampExemptionPrice: 650000, stampPartialPrice: 650000, stampExemptionAmt: Infinity,
    grants: [
      { label: 'First Home Owner Grant (New)', estimate: '$10,000', condition: 'New homes' },
      { label: 'Stamp Duty Concession (≤$650k)', estimate: 'Full concession', condition: 'Homes ≤ $650,000' }
    ]
  }
};

function updateState() {}

function calculate() {
  var state = document.getElementById('state').value;
  var data = stateGrants[state];
  var price = parseVal('price');
  var ptype = document.getElementById('ptype').value;

  if (!price || price <= 0) { if (!_isInit) alert('Please enter the property price.'); return; }

  var html = '<div class="tool-grid">';
  data.grants.forEach(function(grant) {
    var applicable = true;
    if (grant.label.indexOf('≤') !== -1) {
      applicable = price <= data.stampExemptionPrice;
    } else if (grant.label.indexOf('Partial') !== -1) {
      applicable = price > data.stampExemptionPrice && price <= data.stampPartialPrice;
    }
    if (ptype === 'established' && grant.label.indexOf('New') !== -1) applicable = false;
    var statusClass = applicable ? '' : 'style="opacity:0.5"';
    html += '<div class="tool-stat" ' + statusClass + '>' +
      '<div class="tool-stat-label">' + escHtml(grant.label) + '</div>' +
      '<div class="tool-stat-value">' + escHtml(grant.estimate) + '</div>' +
      '<div style="font-size:12px;color:var(--slate);margin-top:4px;">' + escHtml(grant.condition) + '</div>' +
      '</div>';
  });
  html += '</div>';

  document.getElementById('results-container').innerHTML = html;
  document.getElementById('disclaimer').textContent = 'This is a general guide. Eligibility varies by scheme and personal circumstances. Verify with your state\'s revenue office or a mortgage broker.';
  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('fhb-grants', {
      propertyPrice: price,
      state: state,
      propertyType: ptype,
      applicableGrants: data.grants.length
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'first-home-buyer',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan your purchase and investment',
    description: 'Model your property purchase, plan renovations, and track how your investment grows over time in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '🎯', title: 'Federal Programs',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver Scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home Guide', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      },
      {
        icon: '📍', title: 'State Resources',
        links: [
          { text: 'NSW First Home Buyer', href: 'https://www.nsw.gov.au/housing-and-construction/first-home-buyer-grants-and-assistance' },
          { text: 'VIC First Home Buyer Scheme', href: 'https://www.sro.vic.gov.au/buying-property/first-home-owner-grant' },
          { text: 'QLD First Home Buyers', href: 'https://qro.qld.gov.au/property-concessions-grants/first-home-grant/' }
        ]
      },
      {
        icon: '💰', title: 'Stamp Duty & Tax',
        links: [
          { text: 'ATO: Capital Gains Tax Guide', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      }
    ],
    disclaimer: 'Grant eligibility changes by state and varies by scheme. Always verify with your state\'s housing authority and consult a financial adviser before purchasing.'
  },
  share: {
    url: 'https://equitysight.app/tools/first-home-buyer-grants-calculator',
    text: 'Just checked my FHB grant eligibility!'
  },
  related: [
    { href: '/tools/loan-serviceability-calculator', icon: '📊', label: 'Loan Serviceability' },
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' },
    { href: '/tools/cost-of-purchase-calculator', icon: '💵', label: 'Cost of Purchase' },
    { href: '/tools/mortgage-stress-calculator', icon: '📈', label: 'Mortgage Stress' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/mortgage-stress-calculator', text: 'Mortgage Stress' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'QLD — $480,000 first home',
      inputs: [
        { k: 'Property price', v: '$480,000' },
        { k: 'State', v: 'Queensland' },
        { k: 'Property type', v: 'Established' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Stamp duty concession', v: 'Full exemption' },
        { k: 'FHOG (new homes only)', v: '$30,000 if new build' },
        { k: 'Estimated savings', v: '~$8,500' }
      ]
    },
    {
      label: 'VIC — $580,000 new apartment',
      inputs: [
        { k: 'Property price', v: '$580,000' },
        { k: 'State', v: 'Victoria' },
        { k: 'Property type', v: 'New build' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Stamp duty', v: 'Full exemption' },
        { k: 'First Home Owner Grant', v: '$10,000' },
        { k: 'Estimated savings', v: '~$40,000' }
      ]
    },
    {
      label: 'NSW — $780,000 unit',
      inputs: [
        { k: 'Property price', v: '$780,000' },
        { k: 'State', v: 'New South Wales' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Stamp duty concession', v: 'Full exemption (under $800k)' },
        { k: 'First Home Guarantee', v: 'Eligible (5% deposit)' },
        { k: 'Estimated savings', v: '~$30,000' }
      ]
    }
  ],
  faq: [
    { q: 'Am I eligible for the First Home Owner Grant?',
      a: 'You must be buying or building a new home (not an established one), be an Australian citizen or permanent resident, be 18+, be buying with your spouse if applicable, and meet the state\u2019s price cap. Eligibility rules vary by state.' },
    { q: 'What is the First Home Guarantee Scheme?',
      a: 'The Federal First Home Guarantee lets eligible first home buyers purchase with as little as 5% deposit, with the government guaranteeing the shortfall to avoid LMI. Annual places are capped and subject to income and property price caps.' },
    { q: 'Can I use my super to buy a first home?',
      a: 'Yes, via the First Home Super Saver Scheme (FHSSS). You can voluntarily contribute up to $15,000/year (total $50,000) of pre-tax income into super, then withdraw it later for your deposit \u2014 taxed at a concessional rate.' },
    { q: 'Does the grant apply to established homes?',
      a: 'The First Home Owner Grant applies only to new builds and substantially renovated properties. Stamp duty concessions, however, usually apply to both established and new homes.' },
    { q: 'Can I get multiple grants?',
      a: 'Yes. You can typically combine stamp duty concessions, the FHOG (if building new), the First Home Guarantee, and the FHSSS \u2014 they\u2019re separate programs addressing different stages of the purchase.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB5', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/springfield-lakes/', label: 'Springfield Lakes QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Queensland Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if(window.trackCalculatorStart) trackCalculatorStart('fhb-grants');
  updateState();
  calculate();
  _isInit = false;
  var stateEl = document.getElementById('state');
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('fhb-calc-btn');
  if(stateEl) stateEl.addEventListener('change', updateState);
  if(priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if(calcBtn) calcBtn.addEventListener('click', function(){
    if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'fhb-grants'});
    calculate();
  });
});

/* ═══ STATE GRANTS DATA ═══ */
var stateGrants = {
  nsw: {
    name: 'New South Wales', stampExemptionPrice: 400000, stampPartialPrice: 530000, stampExemptionAmt: 8000,
    grants: [
      { label: 'Stamp Duty Exemption (≤$400k)', estimate: 'Full exemption', condition: 'Homes ≤ $400,000' },
      { label: 'Stamp Duty Partial Exemption', estimate: 'Reduces with price', condition: 'Homes $400k–$530k' }
    ]
  },
  vic: {
    name: 'Victoria', stampExemptionPrice: 600000, stampPartialPrice: 750000, stampExemptionAmt: 25000,
    grants: [
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
      { label: 'Stamp Duty Concession (≤$575k)', estimate: 'Full concession', condition: 'Homes ≤ $575,000' },
      { label: 'Stamp Duty Partial Concession', estimate: 'Reduces with price', condition: 'Homes $575k–$650k' }
    ]
  },
  wa: {
    name: 'Western Australia', stampExemptionPrice: 430000, stampPartialPrice: 500000, stampExemptionAmt: 12000,
    grants: [
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
    name: 'Australian Capital Territory', stampExemptionPrice: 450000, stampPartialPrice: 570000, stampExemptionAmt: 20000,
    grants: [
      { label: 'Stamp Duty Exemption (≤$450k)', estimate: 'Full exemption', condition: 'Homes ≤ $450,000' },
      { label: 'Stamp Duty Partial Exemption', estimate: 'Reduces with price', condition: 'Homes $450k–$570k' }
    ]
  },
  nt: {
    name: 'Northern Territory', stampExemptionPrice: 400000, stampPartialPrice: 500000, stampExemptionAmt: 12000,
    grants: [
      { label: 'Stamp Duty Exemption (≤$400k)', estimate: 'Full exemption', condition: 'Homes ≤ $400,000' },
      { label: 'Stamp Duty Partial Exemption', estimate: 'Reduces with price', condition: 'Homes $400k–$500k' }
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
  if (!_isInit) {
    document.getElementById('result').style.display = '';
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

/* ═══ STATE DATA ═══ */
var stateData = {
  nsw: {
    name: 'New South Wales', dutyName: 'Conveyancing Duty', foreignRate: 0.08,
    fhbFull: 400000, fhbPartial: 530000, fhbExemption: 8000,
    rates: [
      { min: 0, max: 14000, formula: function() { return 0; } },
      { min: 14001, max: 30000, formula: function(v) { return v * 0.0125; } },
      { min: 30001, max: 130000, formula: function(v) { return 200 + (v - 30000) * 0.015; } },
      { min: 130001, max: 205000, formula: function(v) { return 1700 + (v - 130000) * 0.0175; } },
      { min: 205001, max: 305000, formula: function(v) { return 2631.25 + (v - 205000) * 0.035; } },
      { min: 305001, max: 405000, formula: function(v) { return 6131.25 + (v - 305000) * 0.04; } },
      { min: 405001, max: 550000, formula: function(v) { return 10131.25 + (v - 405000) * 0.045; } },
      { min: 550001, max: Infinity, formula: function(v) { return 16256.25 + (v - 550000) * 0.055; } }
    ]
  },
  vic: {
    name: 'Victoria', dutyName: 'Duty of Transfer', foreignRate: 0.08,
    fhbFull: 600000, fhbPartial: 750000, fhbExemption: 25000,
    rates: [
      { min: 0, max: 25000, formula: function() { return 0; } },
      { min: 25001, max: 130000, formula: function(v) { return v * 0.014; } },
      { min: 130001, max: 440000, formula: function(v) { return 1470 + (v - 130000) * 0.024; } },
      { min: 440001, max: 870000, formula: function(v) { return 8910 + (v - 440000) * 0.055; } },
      { min: 870001, max: Infinity, formula: function(v) { return 43605 + (v - 870000) * 0.065; } }
    ]
  },
  qld: {
    name: 'Queensland', dutyName: 'Transfer Duty', foreignRate: 0.08,
    fhbFull: 500000, fhbPartial: 550000, fhbExemption: Infinity,
    landFhbFull: 250000, landFhbPartial: 400000,
    rates: [
      { min: 0, max: 5000, formula: function() { return 0; } },
      { min: 5001, max: 75000, formula: function(v) { return (v - 5000) * 0.015; } },
      { min: 75001, max: 540000, formula: function(v) { return 1050 + (v - 75000) * 0.035; } },
      { min: 540001, max: 1000000, formula: function(v) { return 17325 + (v - 540000) * 0.045; } },
      { min: 1000001, max: Infinity, formula: function(v) { return 38025 + (v - 1000000) * 0.0575; } }
    ]
  },
  sa: {
    name: 'South Australia', dutyName: 'Transfer Duty', foreignRate: 0.08,
    fhbFull: 575000, fhbPartial: 650000, fhbExemption: Infinity,
    rates: [
      { min: 0, max: 16000, formula: function() { return 0; } },
      { min: 16001, max: 19000, formula: function(v) { return v * 0.015; } },
      { min: 19001, max: 250000, formula: function(v) { return 45 + (v - 19000) * 0.03; } },
      { min: 250001, max: 300000, formula: function(v) { return 6915 + (v - 250000) * 0.035; } },
      { min: 300001, max: Infinity, formula: function(v) { return 8665 + (v - 300000) * 0.04; } }
    ]
  },
  wa: {
    name: 'Western Australia', dutyName: 'Stamp Duty', foreignRate: 0.07,
    fhbFull: 430000, fhbPartial: 500000, fhbExemption: Infinity,
    rates: [
      { min: 0, max: 2000, formula: function() { return 0; } },
      { min: 2001, max: 4000, formula: function(v) { return v * 0.01; } },
      { min: 4001, max: 500000, formula: function(v) { return 20 + (v - 4000) * 0.02; } },
      { min: 500001, max: 1000000, formula: function(v) { return 9920 + (v - 500000) * 0.035; } },
      { min: 1000001, max: Infinity, formula: function(v) { return 27420 + (v - 1000000) * 0.0475; } }
    ]
  },
  tas: {
    name: 'Tasmania', dutyName: 'Conveyancing Duty', foreignRate: 0,
    fhbFull: 400000, fhbPartial: 500000, fhbExemption: Infinity,
    rates: [
      { min: 0, max: 3000, formula: function() { return 0; } },
      { min: 3001, max: 100000, formula: function(v) { return v * 0.036; } },
      { min: 100001, max: 150000, formula: function(v) { return 3492 + (v - 100000) * 0.041; } },
      { min: 150001, max: 250000, formula: function(v) { return 5542 + (v - 150000) * 0.0425; } },
      { min: 250001, max: Infinity, formula: function(v) { return 9792 + (v - 250000) * 0.0475; } }
    ]
  },
  act: {
    name: 'Australian Capital Territory', dutyName: 'Duty', foreignRate: 0.08,
    fhbFull: 450000, fhbPartial: 570000, fhbExemption: Infinity,
    rates: [
      { min: 0, max: 7500, formula: function() { return 0; } },
      { min: 7501, max: 30000, formula: function(v) { return v * 0.0125; } },
      { min: 30001, max: 200000, formula: function(v) { return 281.25 + (v - 30000) * 0.02; } },
      { min: 200001, max: Infinity, formula: function(v) { return 4681.25 + (v - 200000) * 0.035; } }
    ]
  },
  nt: {
    name: 'Northern Territory', dutyName: 'Duty', foreignRate: 0.08,
    fhbFull: 400000, fhbPartial: 500000, fhbExemption: Infinity,
    rates: [
      { min: 0, max: 3000, formula: function() { return 0; } },
      { min: 3001, max: 100000, formula: function(v) { return v * 0.0075; } },
      { min: 100001, max: 150000, formula: function(v) { return 727.50 + (v - 100000) * 0.01; } },
      { min: 150001, max: 250000, formula: function(v) { return 1227.50 + (v - 150000) * 0.015; } },
      { min: 250001, max: Infinity, formula: function(v) { return 2727.50 + (v - 250000) * 0.025; } }
    ]
  }
};

function calcDuty(state, val) {
  var data = stateData[state];
  for (var i = 0; i < data.rates.length; i++) {
    var bracket = data.rates[i];
    if (val >= bracket.min && val <= bracket.max) return bracket.formula(val);
  }
  return 0;
}

function updateState() {
  var state = document.getElementById('state').value;
  var data = stateData[state];
  document.getElementById('r-duty-label').textContent = data.dutyName;
  document.getElementById('r-foreign-label').textContent = 'Foreign Surcharge (' + Math.round(data.foreignRate * 100) + '%)';
  var foreignCheck = document.getElementById('foreign-check');
  if (data.foreignRate > 0) {
    foreignCheck.style.display = '';
    document.getElementById('foreign').checked = false;
  } else {
    foreignCheck.style.display = 'none';
    document.getElementById('foreign').checked = false;
  }
}

function calculate() {
  var state = document.getElementById('state').value;
  var data = stateData[state];
  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) alert('Please enter the purchase price.'); return; }

  var isFHB = document.getElementById('fhb').checked;
  var isForeign = document.getElementById('foreign').checked;
  var isLand = document.getElementById('ptype').value === 'land';
  var duty = calcDuty(state, val);
  var note = '';

  if (isFHB && !isLand) {
    var fullLimit = data.fhbFull;
    var partialLimit = data.fhbPartial;
    if (val <= fullLimit) {
      var exemption = Math.min(data.fhbExemption, duty);
      duty = Math.max(0, duty - exemption);
      note = 'First home buyer exemption applied.';
    } else if (val <= partialLimit) {
      var concession = duty * (partialLimit - val) / (partialLimit - fullLimit);
      duty = Math.max(0, duty - concession);
      note = 'First home buyer partial exemption applied.';
    }
  }

  var foreignAmt = isForeign ? val * data.foreignRate : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  document.getElementById('r-duty').textContent = fmt(duty);
  document.getElementById('r-foreign').textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';
  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on ' + data.name + ' 2025\u201326 thresholds. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  document.getElementById('cta').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('stamp-duty', {
      purchasePrice: val,
      stampDuty: duty,
      foreignBuyerDuty: foreignAmt,
      totalCost: total,
      effectiveRate: rate.toFixed(2),
      state: state,
      isFHB: isFHB,
      isForeign: isForeign
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'stamp-duty',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full property investment',
    description: 'Add rental income, renovation costs, equity projections, and compare multiple properties side by side — all in EquitySight.',
    buttonText: 'Get started free \u2192',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State Revenue Offices',
        links: [
          { text: 'NSW Stamp Duty Guide', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'VIC Land Transfer Duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'QLD Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'SA Stamp Duty', href: 'https://www.revenuesa.sa.gov.au/stampduty' },
          { text: 'WA Land Titles Office', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty' },
          { text: 'TAS: State Revenue Office', href: 'https://www.sro.tas.gov.au/property-transfer-duties' },
          { text: 'ACT Stamp Duty', href: 'https://www.revenue.act.gov.au/duties/conveyance-duty' },
          { text: 'NT Land Titles Office', href: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Law Society Australia', href: 'https://www.lawsociety.com.au/' },
          { text: 'RBA Housing Guide', href: 'https://www.rba.gov.au/education/resources/explainers/' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Financial Planning',
        links: [
          { text: 'ATO: Shared Equity Schemes', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'MoneySmart Comparison', href: 'https://moneysmart.gov.au/' }
        ]
      }
    ],
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Rates change regularly \u2014 verify current rates with your state revenue office.'
  },
  share: {
    url: 'https://equitysight.app/tools/stamp-duty-calculator',
    text: 'Just calculated my stamp duty instantly!'
  },
  related: [
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Total Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants' },
    { href: '/tools/equity-release-calculator', icon: '\uD83D\uDCB0', label: 'Equity Release' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/mortgage-stress-calculator', text: 'Mortgage Stress' },
    { href: '/tools/cost-of-purchase-calculator', text: 'Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/privacy', text: 'Privacy' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if(window.trackCalculatorStart) trackCalculatorStart('stamp-duty');
  updateState();
  calculate();
  _isInit = false;
  var stateEl = document.getElementById('state');
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if(stateEl) stateEl.addEventListener('change', updateState);
  if(priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if(calcBtn) calcBtn.addEventListener('click', function(){
    if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty'});
    calculate();
  });
});

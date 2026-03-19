/* ═══ RATE DATA ═══ */
var RATES = {
  cosmetic: { budget: [200, 400],  mid: [400, 700],   premium: [700, 1200] },
  mid:      { budget: [600, 1000], mid: [1000, 1600],  premium: [1600, 2500] },
  full:     { budget: [1400, 2000],mid: [2000, 3500],  premium: [3500, 6000] }
};
var BATH = { budget: [8000, 15000], mid: [15000, 28000], premium: [28000, 60000] };
var KITCHEN_REFRESH = { budget: [5000, 10000], mid: [10000, 18000], premium: [18000, 35000] };
var KITCHEN_FULL    = { budget: [12000, 20000], mid: [20000, 45000], premium: [45000, 100000] };
var LANDSCAPE = { budget: [8000, 15000], mid: [15000, 30000], premium: [30000, 60000] };

function calculate() {
  var area = parseFloat(document.getElementById('area').value) || 0;
  var scope = document.getElementById('scope').value;
  var finish = document.getElementById('finish').value;
  var baths = parseInt(document.getElementById('bathrooms').value) || 0;
  var kitchen = document.getElementById('kitchen').value;
  var landscape = document.getElementById('landscaping').checked;
  var addCont = document.getElementById('contingency').checked;

  if (!area || area < 10) { if (!_isInit) alert('Please enter a floor area.'); return; }

  var r = RATES[scope][finish];
  var baseLow = area * r[0];
  var baseHigh = area * r[1];

  var br = BATH[finish];
  baseLow += baths * br[0];
  baseHigh += baths * br[1];

  if (kitchen === 'refresh') {
    var kr = KITCHEN_REFRESH[finish];
    baseLow += kr[0]; baseHigh += kr[1];
  } else if (kitchen === 'full') {
    var kf = KITCHEN_FULL[finish];
    baseLow += kf[0]; baseHigh += kf[1];
  }

  if (landscape) {
    var lr = LANDSCAPE[finish];
    baseLow += lr[0]; baseHigh += lr[1];
  }

  var contLow = 0, contHigh = 0;
  if (addCont) {
    contLow = baseLow * 0.15;
    contHigh = baseHigh * 0.15;
  }

  var totalLow = baseLow + contLow;
  var totalHigh = baseHigh + contHigh;
  var totalMid = (totalLow + totalHigh) / 2;

  document.getElementById('r-low').textContent = fmt(totalLow);
  document.getElementById('r-high').textContent = fmt(totalHigh);
  document.getElementById('r-mid').textContent = fmt(totalMid);
  document.getElementById('r-sqm').textContent = fmt(totalMid / area) + '/m\u00B2';
  document.getElementById('r-cont').textContent = addCont ? fmt((contLow + contHigh) / 2) : '$0';

  document.getElementById('result').style.display = '';
  document.getElementById('cta').style.display = '';
  if (!_isInit) document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  cta: {
    eyebrow: 'Go deeper',
    title: 'Does the renovation make financial sense?',
    description: 'Model whether your renovation will add more value than it costs \u2014 and compare before vs after scenarios in EquitySight.',
    buttonText: 'Analyse the numbers free \u2192',
    buttonHref: '../login.html?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE2', title: 'Building & Construction',
        links: [
          { text: 'ASIC: Buying a Home Guide', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'ASIC: Building Inspections', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Consumer Affairs: Building Info', href: 'https://www.consumer.vic.gov.au/housing' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Tax & Finance',
        links: [
          { text: 'ATO: Capital Gains Tax', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax' },
          { text: 'ATO: Property Tax Deductions', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'MoneySmart: Property Investment', href: 'https://moneysmart.gov.au/property-investment' }
        ]
      },
      {
        icon: '\uD83D\uDCCB', title: 'Legal & Compliance',
        links: [
          { text: 'Law Society Australia', href: 'https://www.lawsociety.com.au/' },
          { text: 'Master Builders Australia', href: 'https://www.masterbuilders.com.au/' },
          { text: 'RBA: Housing & Mortgages', href: 'https://www.rba.gov.au/education/resources/explainers/housing-and-mortgages.html' }
        ]
      }
    ],
    disclaimer: 'This is general information only. Renovation costs vary significantly by location, complexity, and contractor. Always get multiple quotes and consult a quantity surveyor and accountant before proceeding.'
  },
  share: {
    url: 'https://equitysight.app/tools/renovation-cost-calculator.html',
    text: 'Just calculated my renovation budget!'
  },
  related: [
    { href: 'house-flip-calculator.html', icon: '\uD83C\uDFE0', label: 'House Flip' },
    { href: 'cost-of-purchase-calculator.html', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: 'loan-serviceability-calculator.html', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: 'mortgage-stress-calculator.html', icon: '\uD83D\uDCC8', label: 'Mortgage Stress' }
  ],
  footer: [
    { href: '../index.html', text: 'EquitySight.app' },
    { href: 'stamp-duty-calculator.html', text: 'Stamp Duty' },
    { href: 'house-flip-calculator.html', text: 'House Flip' },
    { href: 'mortgage-stress-calculator.html', text: 'Mortgage Stress' },
    { href: '../privacy.html', text: 'Privacy' }
  ]
});

var _isInit = true;
calculate();
_isInit = false;
document.getElementById('reno-calc-btn').addEventListener('click', calculate);

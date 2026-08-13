/* ═══ STATE COSTS ═══
 *
 * Conveyancing band kept as-is. Stamp duty is now computed by the verified
 * cumulative-tier engine below (the same FY2025-26 schedules used in
 * tools/stamp-duty-calculator.js + app.js, reproduced against 34/34 state
 * revenue office worked examples) rather than the old flat 2-4%-of-price
 * approximation, which was materially wrong (e.g. VIC $600k real duty ~$31k
 * vs flat 4% = $24k). State codes here are UPPERCASE; the tier data uses the
 * stamp-duty file's lowercase keys, bridged via STATE_KEY.
 */
var stateCosts = {
  NSW: { conveyancing: { min: 800, max: 1500 } },
  VIC: { conveyancing: { min: 1000, max: 1800 } },
  QLD: { conveyancing: { min: 600, max: 1200 } },
  SA:  { conveyancing: { min: 700, max: 1400 } },
  WA:  { conveyancing: { min: 900, max: 1600 } },
  TAS: { conveyancing: { min: 600, max: 1200 } },
  ACT: { conveyancing: { min: 800, max: 1500 } },
  NT:  { conveyancing: { min: 700, max: 1300 } }
};

/* ═══ VERIFIED STAMP-DUTY TIER ENGINE (FY2025-26) ═══
 * Lifted verbatim from tools/stamp-duty-calculator.js. Cumulative-marginal
 * tiers `[from, rate]`; continuous by construction (no bracket-cliff bugs).
 * FHB: full exemption below fhbFull, linear taper to fhbPartial. NEW-home-only
 * reliefs (SA) are intentionally NOT auto-applied — established-home FHBs pay
 * full duty there. Foreign-buyer surcharge per state.
 */
var stateData = {
  // NSW brackets CPI-indexed 1 Jul 2026 (FY2026-27, verified vs Revenue NSW 5 Jul 2026)
  nsw: { name: 'New South Wales', foreignRate: 0.09, fhbFull: 800000, fhbPartial: 1000000, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0.0125 }, { from: 18000, rate: 0.015 }, { from: 38000, rate: 0.0175 },
             { from: 103000, rate: 0.035 }, { from: 387000, rate: 0.045 }, { from: 1290000, rate: 0.055 }, { from: 3870000, rate: 0.07 } ] },
  vic: { name: 'Victoria', foreignRate: 0.08, fhbFull: 600000, fhbPartial: 750000, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0.014 }, { from: 25000, rate: 0.024 }, { from: 130000, rate: 0.06 } ] },
  qld: { name: 'Queensland', foreignRate: 0.08, fhbFull: 700000, fhbPartial: 800000, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0 }, { from: 5000, rate: 0.015 }, { from: 75000, rate: 0.035 }, { from: 540000, rate: 0.045 }, { from: 1000000, rate: 0.0575 } ] },
  sa: { name: 'South Australia', foreignRate: 0.07, fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0.01 }, { from: 12000, rate: 0.02 }, { from: 30000, rate: 0.03 }, { from: 50000, rate: 0.035 },
             { from: 100000, rate: 0.04 }, { from: 200000, rate: 0.0425 }, { from: 250000, rate: 0.0475 }, { from: 300000, rate: 0.05 }, { from: 500000, rate: 0.055 } ] },
  // WA FHB thresholds raised 7 May 2026 (2026-27 Housing Taxation Package)
  wa: { name: 'Western Australia', foreignRate: 0.07, fhbFull: 600000, fhbPartial: 800000, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0.019 }, { from: 120000, rate: 0.0285 }, { from: 150000, rate: 0.038 }, { from: 360000, rate: 0.0475 }, { from: 725000, rate: 0.0515 } ] },
  // TAS established-home FHB exemption EXPIRED 30 Jun 2026 (not extended) — no FHB duty relief
  tas: { name: 'Tasmania', foreignRate: 0.08, fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0 }, { from: 3000, rate: 0.0175 }, { from: 25000, rate: 0.0225 }, { from: 75000, rate: 0.035 },
             { from: 200000, rate: 0.04 }, { from: 375000, rate: 0.0425 }, { from: 725000, rate: 0.045 } ] },
  // ACT: from 1 Jul 2026 the HBCS has NO income test and NO property value limit — eligible buyers pay $0 duty at any price
  act: { name: 'Australian Capital Territory', foreignRate: 0, fhbFull: Infinity, fhbPartial: Infinity, fhbExemption: Infinity,
    tiers: [ { from: 0, rate: 0.0028 }, { from: 260000, rate: 0.022 }, { from: 300000, rate: 0.034 }, { from: 500000, rate: 0.0432 }, { from: 750000, rate: 0.059 }, { from: 1000000, rate: 0.064 } ] },
  nt: { name: 'Northern Territory', foreignRate: 0, fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity, tiers: [] }
};

// Bridge: UPPERCASE select values -> lowercase stateData keys
var STATE_KEY = { NSW: 'nsw', VIC: 'vic', QLD: 'qld', SA: 'sa', WA: 'wa', TAS: 'tas', ACT: 'act', NT: 'nt' };

function calcDuty(state, v) {
  var data = stateData[state];
  if (!data || v <= 0) return 0;
  // NT: quadratic under $525k, flat % of TOTAL value above (not marginal).
  if (state === 'nt') {
    if (v < 525000) { var Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
    if (v <= 3000000) return v * 0.0495;
    if (v <= 5000000) return v * 0.0575;
    return v * 0.0595;
  }
  var tiers = data.tiers, duty = 0;
  for (var i = 0; i < tiers.length; i++) {
    var from = tiers[i].from;
    if (v <= from) break;
    var nextFrom = (i + 1 < tiers.length) ? tiers[i + 1].from : Infinity;
    duty += (Math.min(v, nextFrom) - from) * tiers[i].rate;
  }
  // Bands that are a flat % of the TOTAL value (not marginal on the excess):
  if (state === 'vic') {
    if (v > 960000 && v <= 2000000) duty = v * 0.055;
    else if (v > 2000000) duty = 110000 + (v - 2000000) * 0.065;
  } else if (state === 'act' && v > 1455000) {
    duty = v * 0.0454;
  } else if (state === 'tas') {
    duty = (v <= 3000) ? 50 : duty + 50;
  }
  return duty;
}

// FHB exemption / linear partial concession given a state's policy.
function applyFhbConcession(state, val, baseDuty) {
  var data = stateData[state];
  if (!data) return baseDuty;
  // QLD — QRO band-table method (verified 5 Jul 2026): a fixed concession
  // amount ($17,350 at <$710k, stepping down $1,735 per $10k band to nil at
  // $800k+) is deducted from the HOME-concession duty, not the standard
  // rate; above $800k the home-concession rate still applies (an FHB is an
  // owner-occupier). QRO worked example: $730k → $6,555.
  if (state === 'qld') {
    var qHome = val <= 350000 ? val * 0.01
      : val <= 540000 ? 3500 + (val - 350000) * 0.035
      : val <= 1000000 ? 10150 + (val - 540000) * 0.045
      : 30850 + (val - 1000000) * 0.0575;
    var qConc = val < 710000 ? 17350
      : (val >= 800000 ? 0 : 17350 - Math.floor((val - 700000) / 10000) * 1735);
    return Math.max(0, qHome - qConc);
  }
  if (val <= data.fhbFull) {
    var ex = Math.min(data.fhbExemption || Infinity, baseDuty);
    return Math.max(0, baseDuty - ex);
  }
  if (val <= data.fhbPartial && data.fhbPartial > data.fhbFull) {
    var slide = (data.fhbPartial - val) / (data.fhbPartial - data.fhbFull);
    return Math.max(0, baseDuty * (1 - slide));
  }
  return baseDuty;
}

// Title-office registration fees (mortgage + transfer), FY2026-27 — verified
// 6 Jul 2026 vs each registry's official schedule. SYNC: same schedules as
// regFeesTotal() in stamp-duty-calculator.js / auction-budget-calculator.js;
// QLD/VIC/SA/WA transfer fees scale with price, the rest are flat.
function regFeesTotal(state, val) {
  if (state === 'qld') {
    return Math.round(248.04 + 248.04 + (val > 180000 ? Math.ceil((val - 180000) / 10000) * 46.56 : 0));
  }
  if (state === 'vic') {
    var vt = Math.min(3614, Math.ceil(104.30 + Math.floor(val / 1000) * 2.34));
    return Math.round(129.20 + vt);
  }
  if (state === 'sa') {
    var st = val <= 5000 ? 204 : val <= 20000 ? 228 : val <= 40000 ? 251
      : 353 + 105 * Math.ceil(Math.max(0, val - 50000) / 10000);
    return Math.round(204 + st);
  }
  if (state === 'wa') {
    var wt = val <= 85000 ? 225.10 : val <= 120000 ? 235.10 : val <= 200000 ? 255.10
      : 255.10 + 20 * Math.ceil((val - 200000) / 100000);
    return Math.round(225.10 + wt);
  }
  var FLAT = { nsw: 366, tas: 425, act: 680, nt: 362 };
  return FLAT[state] || 400;
}

function getNumVal(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function setTextContent(id, val) {
  document.getElementById(id).textContent = Math.round(val).toLocaleString('en-AU');
}

function calc() {
  var purchasePrice = getNumVal('purchasePrice');
  var depositPct = getNumVal('depositPct');
  var loan = getNumVal('loanAmount');
  var state = document.getElementById('state').value;
  var isFhb = document.getElementById('fhb').checked;
  var isForeignBuyer = document.getElementById('foreignBuyer').checked;
  var isRenting = document.getElementById('currentlyRenting').checked;
  var weeklyRent = getNumVal('weeklyRent');
  var leaseBreak = getNumVal('leaseBreak');

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;
  if (!purchasePrice || purchasePrice <= 0) { _showErr('Please enter a purchase price.'); return; }

  var deposit = purchasePrice * (depositPct / 100);
  var calculatedLoan = purchasePrice - deposit;
  document.getElementById('loanAmount').value = Math.round(calculatedLoan);

  var stampDuty = 0;
  var costs = stateCosts[state];
  var sKey = STATE_KEY[state];
  if (sKey) {
    var baseDuty = calcDuty(sKey, purchasePrice);
    stampDuty = isFhb ? applyFhbConcession(sKey, purchasePrice, baseDuty) : baseDuty;
    if (isForeignBuyer) stampDuty += purchasePrice * (stateData[sKey].foreignRate || 0);
  }

  var bankValuation = Math.max(300, Math.min(700, purchasePrice / 1000));
  var loanFee = Math.max(150, calculatedLoan * 0.002);
  var settlementFee = 250;
  var regFees = sKey ? regFeesTotal(sKey, purchasePrice) : 400;
  var conveyancing = costs.conveyancing.min + (costs.conveyancing.max - costs.conveyancing.min) * 0.5;
  var inspection = 500;

  var lmi = 0;
  if (depositPct < 20) {
    var lvr = (calculatedLoan / purchasePrice) * 100;
    // Canonical LMI tiers (shared with deposit / mortgage-repayment / stamp-duty),
    // indicative of Helia/QBE rates per ASIC MoneySmart. Ascending <= bands so the
    // boundary handling matches the other tools (e.g. exactly 90% LVR -> 1.90%).
    if (lvr <= 85) lmi = calculatedLoan * 0.0080;
    else if (lvr <= 90) lmi = calculatedLoan * 0.0190;
    else if (lvr <= 95) lmi = calculatedLoan * 0.0340;
    else lmi = calculatedLoan * 0.0430;
  }

  var buildingIns = purchasePrice * 0.004;
  var contentsIns = 500;
  var movingCosts = 2500;
  var leaseBreakCost = isRenting ? leaseBreak : 0;

  setTextContent('stampDuty', stampDuty);
  setTextContent('regFees', regFees);
  setTextContent('conveyancing', conveyancing);
  setTextContent('bankValuation', bankValuation);
  setTextContent('loanFee', loanFee);
  setTextContent('settlementFee', settlementFee);
  setTextContent('inspection', inspection);
  setTextContent('buildingIns', buildingIns);
  setTextContent('contentsIns', contentsIns);
  setTextContent('movingCosts', movingCosts);

  document.getElementById('lmiRow').style.display = depositPct < 20 ? 'flex' : 'none';
  setTextContent('lmi', lmi);
  document.getElementById('leaseBreakRow').style.display = isRenting ? 'flex' : 'none';
  setTextContent('leaseBreakCost', leaseBreakCost);
  document.getElementById('rentGroup').style.display = isRenting ? 'block' : 'none';

  var totalCosts = stampDuty + regFees + conveyancing + bankValuation + loanFee + settlementFee + inspection + buildingIns + contentsIns + movingCosts + lmi + leaseBreakCost;
  var totalPct = (totalCosts / purchasePrice) * 100;
  var cashNeeded = totalCosts + deposit;

  setTextContent('totalCosts', totalCosts);
  setTextContent('summaryUpfront', totalCosts);
  setTextContent('summaryPct', totalPct.toFixed(1));
  setTextContent('summaryCashNeeded', cashNeeded);

  document.getElementById('cost-breakdown').style.display = '';
  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Track calculator result
  if(window.trackCalculatorResult) trackCalculatorResult('cost-of-purchase', {
    purchasePrice: purchasePrice,
    deposit: deposit,
    stampDuty: stampDuty,
    totalCosts: totalCosts,
    cashNeeded: cashNeeded,
    state: state,
    isFHB: isFhb,
    isForeignBuyer: isForeignBuyer
  });
}

var calcTimeout;
function dCalc() {
  clearTimeout(calcTimeout);
  calcTimeout = setTimeout(calc, 180);
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'cost-of-purchase',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Ready to buy?',
    description: 'Now that you know the upfront costs, use EquitySight to model your entire investment — including ongoing costs, rental income, and 30-year projections.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '\uD83D\uDCB0', title: 'Stamp Duty',
        links: [
          { text: 'NSW Revenue: Stamp Duty', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'VIC: Land Transfer Duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'QLD: Transfer Duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' },
          { text: 'ATO: Shared Equity Schemes', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' }
        ]
      },
      {
        icon: '\uD83C\uDFE6', title: 'Borrowing & LMI',
        links: [
          { text: 'ASIC: Mortgage Insurance', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'RBA: Interest Rates', href: 'https://www.rba.gov.au/education/' },
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: Tax Info', href: 'https://www.ato.gov.au/' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'FHSS Scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Law Society of Australia', href: 'https://www.lawsociety.com.au/' }
        ]
      }
    ],
    disclaimer: 'These are 2026 estimates based on typical costs. Actual costs vary by location, property, lender, and circumstance. Consult your lender, lawyer, and financial adviser before purchasing.'
  },
  share: {
    url: 'https://equitysight.app/tools/cost-of-purchase-calculator',
    text: 'Just calculated my property buying costs!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Stamp Duty' },
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants' },
    { href: '/tools/borrowing-power-calculator', icon: '\uD83C\uDFE6', label: 'Borrowing Power' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/house-flip-calculator', text: 'House Flip' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'QLD first home — $580,000',
      inputs: [
        { k: 'Property price', v: '$580,000' },
        { k: 'Deposit', v: '$58,000 (10%)' },
        { k: 'State', v: 'Queensland' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Stamp duty', v: '$0 (FHB exempt, under $700k)' },
        { k: 'Legal + conveyancing', v: '~$1,800' },
        { k: 'Building + pest inspection', v: '~$650' },
        { k: 'LMI (if applicable)', v: '~$11,400' },
        { k: 'Total upfront costs', v: '~$13,850' }
      ]
    },
    {
      label: 'NSW investor — $850,000',
      inputs: [
        { k: 'Property price', v: '$850,000' },
        { k: 'Deposit', v: '$170,000 (20%)' },
        { k: 'State', v: 'New South Wales' },
        { k: 'First home buyer', v: 'No' }
      ],
      outputs: [
        { k: 'Stamp duty', v: '~$33,800' },
        { k: 'Legal + conveyancing', v: '~$2,200' },
        { k: 'Mortgage + title fees', v: '~$365' },
        { k: 'Total upfront costs', v: '~$36,365' }
      ]
    },
    {
      label: 'VIC owner-occupier — $1,100,000',
      inputs: [
        { k: 'Property price', v: '$1,100,000' },
        { k: 'Deposit', v: '$220,000 (20%)' },
        { k: 'State', v: 'Victoria' }
      ],
      outputs: [
        { k: 'Stamp duty', v: '~$58,000' },
        { k: 'Title-office reg fees', v: '~$2,810 (VIC fee scales with price)' },
        { k: 'Legal + conveyancing', v: '~$2,300' },
        { k: 'Inspections + searches', v: '~$900' },
        { k: 'Total upfront costs', v: '~$64,000' }
      ]
    }
  ],
  faq: [
    { q: 'What are the total upfront costs of buying a house in Australia?',
      a: 'Expect 5\u20137% of the purchase price on top of your deposit. This covers stamp duty (the biggest), legal/conveyancing, inspections, mortgage fees, and possibly LMI if your deposit is under 20%.' },
    { q: 'What hidden costs do buyers forget?',
      a: 'Common surprises: council + water rate adjustments at settlement, first-year building insurance, landlord insurance for investors, moving costs, utility connection fees, and strata/body-corp levies for apartments.' },
    { q: 'Do I need Lenders Mortgage Insurance (LMI)?',
      a: 'LMI is required on most loans with a deposit under 20%. It can cost $8,000\u2013$25,000 depending on loan size. You can avoid it with a 20% deposit, a guarantor, or schemes like the First Home Guarantee.' },
    { q: 'How much are conveyancing and legal fees?',
      a: 'Conveyancing typically costs $1,500\u2013$3,000 depending on the state and property complexity. Solicitors charge more than licensed conveyancers but handle complex matters like deceased estates.' },
    { q: 'What about building and pest inspections?',
      a: 'Budget $400\u2013$800 for a combined building + pest inspection on an established home. These are optional but strongly recommended \u2014 they can reveal problems that save you tens of thousands.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDF81', href: '/tools/first-home-buyer-grants-calculator', label: 'First Home Buyer Grants' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/indooroopilly/', label: 'Indooroopilly QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/carindale/', label: 'Carindale QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Queensland Suburb Guide' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('cost-of-purchase');
calc();
_isInit = false;
['purchasePrice','depositPct','weeklyRent','leaseBreak'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', dCalc);
});
var stateEl = document.getElementById('state');
if(stateEl) stateEl.addEventListener('change', dCalc);
['fhb','foreignBuyer','currentlyRenting'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('change', dCalc);
});
var calcBtn = document.getElementById('cop-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'cost-of-purchase'});
  calc();
});

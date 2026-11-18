/* ═══ COSTS ═══
 *
 * Stamp duty is computed by the verified cumulative-tier engine below (the
 * same FY2026-27 schedules used in tools/stamp-duty-calculator.js + app.js,
 * reproduced against 34/34 state revenue office worked examples). State codes
 * here are UPPERCASE; the tier data uses the stamp-duty file's lowercase
 * keys, bridged via STATE_KEY.
 */
// Conveyancing: $1,800 on every page of the site (stamp duty pages, the
// First Home Journey, deposit, auction budget). My estimate, no official
// source; the journey shows the range $1,300 to $2,200. This replaced a
// per-state table that had no source either.
var CONVEYANCING = 1800;
// Building and pest inspection: my estimate, inside the $400 to $700 range
// the First Home Journey shows at step 3. Same figure as deposit-calculator.js.
var INSPECTION = 500;

/* ═══ VERIFIED STAMP-DUTY TIER ENGINE (FY2026-27) ═══
 * Lifted verbatim from tools/stamp-duty-calculator.js. Cumulative-marginal
 * tiers `[from, rate]`; continuous by construction (no bracket-cliff bugs).
 * FHB: full exemption below fhbFull, then each state's own rule up to
 * fhbPartial (see applyFhbConcession). NEW-home-only
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
    // Revenue NSW states each bracket's base in whole dollars ($1,662,
    // $11,602, $52,237, $194,137), so floor the running total at each
    // bracket NSW passes.
    if (state === 'nsw' && v > nextFrom) duty = Math.floor(duty);
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

// QLD home-concession duty (owner-occupier rate, QRO schedule): 1% to $350k;
// $3,500 + 3.5% to $540k; $10,150 + 4.5% to $1M; $30,850 + 5.75% above.
// SYNC: qldHomeDuty() in tools/stamp-duty-calculator.js.
function qldHomeDuty(v) {
  if (v <= 0) return 0;
  if (v <= 350000) return v * 0.01;
  if (v <= 540000) return 3500 + (v - 350000) * 0.035;
  if (v <= 1000000) return 10150 + (v - 540000) * 0.045;
  return 30850 + (v - 1000000) * 0.0575;
}

// FHB exemption / partial concession given a state's policy.
function applyFhbConcession(state, val, baseDuty) {
  var data = stateData[state];
  if (!data) return baseDuty;
  // QLD — QRO band-table method (verified 5 Jul 2026): a fixed concession
  // amount ($17,350 at <$710k, stepping down $1,735 per $10k band to nil at
  // $800k+) is deducted from the HOME-concession duty, not the standard
  // rate; above $800k the home-concession rate still applies (an FHB is an
  // owner-occupier). QRO worked example: $730k → $6,555.
  if (state === 'qld') {
    var qHome = qldHomeDuty(val);
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
    // NSW (s 78A): standard duty less slide × the standard duty on $800,000.
    if (state === 'nsw') return Math.max(0, baseDuty - slide * calcDuty('nsw', data.fhbFull));
    // WA first home owner rate: $16.15 per $100, or part, over $600,000.
    if (state === 'wa') return Math.round(Math.ceil((val - data.fhbFull) / 100) * 1615) / 100;
    // VIC (s 57JA): standard duty scaled in a straight line.
    return Math.max(0, baseDuty * (1 - slide));
  }
  return baseDuty;
}

// Duty before any foreign surcharge. Same rule as calculate() in
// tools/stamp-duty-calculator.js for an established home: a first home buyer
// gets the state's first home concession; otherwise a QLD buyer who will live
// in the home pays the home-concession rate; everyone else pays the general
// rate. One difference: from 1 Aug 2026 Queensland's home concessions (home
// and first home) need Australian citizenship, permanent residency or
// specified foreign retiree status, so a QLD foreign buyer pays the general
// rate here. stamp-duty-calculator.js doesn't check that rule. Victoria's
// principal place of residence concession (owner-occupied homes up to
// $550,000) isn't modelled here or there; the page says so.
function buyerDuty(state, val, isFhb, isOwner, isForeign) {
  var baseDuty = calcDuty(state, val);
  if (isForeign && state === 'qld') return baseDuty;
  if (isFhb) return applyFhbConcession(state, val, baseDuty);
  if (isOwner && state === 'qld') return qldHomeDuty(val);
  return baseDuty;
}

// My rough LMI scale by LVR band, with no published rate table behind it.
// Same tiers as lmiRate() in journey.js, lmiEstimate() in deposit-calculator.js
// and estimateLmiTier() in stamp-duty-calculator.js (tests/state-duty-sync-test.js
// checks they agree). The ratio is rounded first, as journey.js does: 0.9 *
// price / price can come out as 0.9000000000000001 and land in the wrong tier.
function lmiRate(lvr) {
  lvr = Math.round(lvr * 10000) / 10000;
  return lvr <= 0.80 ? 0 : lvr <= 0.85 ? 0.008 : lvr <= 0.90 ? 0.019 : lvr <= 0.95 ? 0.034 : 0.043;
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
  // "Buying to live in" only changes the duty in Queensland, and only for a
  // buyer who is neither a first home buyer nor a foreign buyer, so the box
  // is hidden everywhere else.
  var ownerEl = document.getElementById('owner');
  var isOwner = ownerEl ? ownerEl.checked : true;
  var ownerRow = document.getElementById('ownerCheck');
  if (ownerRow) ownerRow.style.display = (state === 'QLD' && !isFhb && !isForeignBuyer) ? '' : 'none';
  var isRenting = document.getElementById('currentlyRenting').checked;
  var leaseBreak = getNumVal('leaseBreak');

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;
  if (!purchasePrice || purchasePrice <= 0) { _showErr('Enter a purchase price.'); return; }
  if (depositPct < 0 || depositPct > 100) { _showErr('Deposit must be between 0% and 100%.'); return; }

  var deposit = purchasePrice * (depositPct / 100);
  var calculatedLoan = purchasePrice - deposit;
  document.getElementById('loanAmount').value = Math.round(calculatedLoan);

  var stampDuty = 0;
  var sKey = STATE_KEY[state];
  if (sKey) {
    stampDuty = buyerDuty(sKey, purchasePrice, isFhb, isOwner, isForeignBuyer);
    if (isForeignBuyer) stampDuty += purchasePrice * (stateData[sKey].foreignRate || 0);
  }

  // Lender fees, inspection, insurance and moving costs below are my rough
  // estimates, not sourced figures. The page says so.
  var bankValuation = Math.max(300, Math.min(700, purchasePrice / 1000));
  var loanFee = Math.max(150, calculatedLoan * 0.002);
  var settlementFee = 250;
  var regFees = sKey ? regFeesTotal(sKey, purchasePrice) : 400;
  var conveyancing = CONVEYANCING;
  var inspection = INSPECTION;

  var lmi = 0;
  if (depositPct < 20) lmi = calculatedLoan * lmiRate(calculatedLoan / purchasePrice);

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
  document.getElementById('summaryPct').textContent = totalPct.toFixed(1); // one decimal; setTextContent() would round it away
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
    title: 'Set a maximum price',
    description: 'Step 3 of the First Home Journey takes these costs out of your savings, checks the repayment against your income and gives you a maximum price to stick to.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '\uD83D\uDCB0', title: 'Stamp duty',
        links: [
          { text: 'Revenue NSW: transfer duty', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
          { text: 'SRO Victoria: land transfer duty', href: 'https://www.sro.vic.gov.au/land-transfer-duty' },
          { text: 'QRO: transfer duty', href: 'https://qro.qld.gov.au/duties/transfer-duty/' }
        ]
      },
      {
        icon: '\uD83C\uDFE6', title: 'Home loans',
        links: [
          { text: 'Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First home buyers',
        links: [
          { text: 'Housing Australia: 5% Deposit Scheme (First Home Guarantee)', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'ATO: First Home Super Saver scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'Moneysmart: buying a house', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      }
    ],
    disclaimer: 'Duty rates, concessions and registration fees change with state budgets, so check the figures with your state revenue office before you sign.'
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
      label: 'QLD first home buyer, $580,000, 10% deposit',
      inputs: [
        { k: 'Property price', v: '$580,000' },
        { k: 'Deposit', v: '$58,000 (10%)' },
        { k: 'State', v: 'Queensland' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Stamp duty', v: '$0 (first home concession)' },
        { k: 'Title office registration fees', v: '$2,358' },
        { k: 'Conveyancing and legal', v: '$1,800' },
        { k: 'LMI (10% deposit)', v: '$9,918' },
        { k: 'Total buying costs', v: '$21,770 (3.8% of price)' },
        { k: 'Cash needed incl. deposit', v: '$79,770' }
      ]
    },
    {
      label: 'NSW, not a first home buyer, $850,000, 20% deposit',
      inputs: [
        { k: 'Property price', v: '$850,000' },
        { k: 'Deposit', v: '$170,000 (20%)' },
        { k: 'State', v: 'New South Wales' },
        { k: 'First home buyer', v: 'No' }
      ],
      outputs: [
        { k: 'Stamp duty', v: '$32,437' },
        { k: 'Title office registration fees', v: '$366' },
        { k: 'Conveyancing and legal', v: '$1,800' },
        { k: 'Total buying costs', v: '$43,813 (5.2% of price)' },
        { k: 'Cash needed incl. deposit', v: '$213,813' }
      ]
    },
    {
      label: 'VIC, not a first home buyer, $1,100,000, 20% deposit',
      inputs: [
        { k: 'Property price', v: '$1,100,000' },
        { k: 'Deposit', v: '$220,000 (20%)' },
        { k: 'State', v: 'Victoria' }
      ],
      outputs: [
        { k: 'Stamp duty', v: '$60,500' },
        { k: 'Title office registration fees', v: '$2,808 (VIC fee scales with price)' },
        { k: 'Conveyancing and legal', v: '$1,800' },
        { k: 'Total buying costs', v: '$75,718 (6.9% of price)' },
        { k: 'Cash needed incl. deposit', v: '$295,718' }
      ]
    }
  ],
  faq: [
    { q: 'What are the total upfront costs of buying a house in Australia?',
      a: 'Mostly it depends on stamp duty. In the three examples on this page the total is 3.8%, 5.2% and 6.9% of the purchase price, on top of the deposit. That covers stamp duty, registration fees, conveyancing, lender fees, an inspection, first-year insurance, moving costs, and LMI if your deposit is under 20%.' },
    { q: 'Do I need Lenders Mortgage Insurance (LMI)?',
      a: 'LMI applies to most loans with a deposit under 20%. This calculator estimates it from the loan-to-value ratio: for a $650,000 purchase with a 10% deposit the estimate is $11,115. A 20% deposit, a guarantor or the 5% Deposit Scheme (formerly the First Home Guarantee) avoids it, and the scheme has its own eligibility rules and price caps.' },
    { q: 'How much are conveyancing and legal fees?',
      a: 'This calculator uses a flat $1,800 in every state. That is my estimate, and I would expect quotes between $1,300 and $2,200, so get one.' },
    { q: 'What about building and pest inspections?',
      a: 'This calculator allows $500 for a combined building and pest inspection on an established home. That is my estimate, and I would expect quotes between $400 and $700.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDF81', href: '/tools/first-home-buyer-grants-calculator', label: 'First Home Buyer Grants' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/indooroopilly/', label: 'Indooroopilly QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/carindale/', label: 'Carindale QLD' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Queensland Suburb Guide' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('cost-of-purchase');
calc();
_isInit = false;
['purchasePrice','depositPct','leaseBreak'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', dCalc);
});
var stateEl = document.getElementById('state');
if(stateEl) stateEl.addEventListener('change', dCalc);
['fhb','owner','foreignBuyer','currentlyRenting'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('change', dCalc);
});
var calcBtn = document.getElementById('cop-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'cost-of-purchase'});
  calc();
});

/* ═══ DEPOSIT CALCULATOR ═══ */

// Cumulative-tier stamp duty engine — verified against each state revenue
// office, FY2026-27 (34/34 worked examples reproduced within $1). This is the
// SAME logic as tools/stamp-duty-calculator.js; ported here so the deposit
// calculator stops under-stating cash needed (the old flat-rate-by-band
// approximation returned $0 for non-FHB buyers below each state threshold).
//
// `tiers` are [from, rate] pairs evaluated cumulatively: tier i taxes the
// portion of value between tiers[i].from and tiers[i+1].from at tiers[i].rate.
// VIC ($960k–$2M flat-of-total, >$2M), ACT (>$1.455M flat) and NT (quadratic
// under $525k / flat % above) use special cases — see _calcDutyTiered().
var _SD_STATE_DATA = {
  // fhbFull = full-exemption ceiling; fhbPartial = taper ceiling (===fhbFull
  // means hard cliff, no taper). SA + NT: NEW homes only / grants — no
  // value-based exemption, so fhbFull/fhbPartial are 0 (never auto-zeroed).
  // NSW brackets CPI-indexed 1 Jul 2026 (FY2026-27, verified vs Revenue NSW 5 Jul 2026)
  NSW: { fhbFull: 800000,  fhbPartial: 1000000, tiers: [[0,0.0125],[18000,0.015],[38000,0.0175],[103000,0.035],[387000,0.045],[1290000,0.055],[3870000,0.07]] },
  VIC: { fhbFull: 600000,  fhbPartial: 750000,  tiers: [[0,0.014],[25000,0.024],[130000,0.06]] },
  QLD: { fhbFull: 700000,  fhbPartial: 800000,  tiers: [[0,0],[5000,0.015],[75000,0.035],[540000,0.045],[1000000,0.0575]] },
  SA:  { fhbFull: 0,       fhbPartial: 0,        tiers: [[0,0.01],[12000,0.02],[30000,0.03],[50000,0.035],[100000,0.04],[200000,0.0425],[250000,0.0475],[300000,0.05],[500000,0.055]] },
  // WA FHB thresholds raised 7 May 2026; TAS established-home FHB exemption EXPIRED
  // 30 Jun 2026 (0/0 = no relief); ACT HBCS uncapped + no income test from 1 Jul 2026.
  WA:  { fhbFull: 600000,  fhbPartial: 800000,  tiers: [[0,0.019],[120000,0.0285],[150000,0.038],[360000,0.0475],[725000,0.0515]] },
  TAS: { fhbFull: 0,       fhbPartial: 0,        tiers: [[0,0],[3000,0.0175],[25000,0.0225],[75000,0.035],[200000,0.04],[375000,0.0425],[725000,0.045]] },
  ACT: { fhbFull: Infinity, fhbPartial: Infinity, tiers: [[0,0.0028],[260000,0.022],[300000,0.034],[500000,0.0432],[750000,0.059],[1000000,0.064]] },
  NT:  { fhbFull: 0,       fhbPartial: 0,        tiers: [] }
};

function _calcDutyTiered(state, v) {
  var data = _SD_STATE_DATA[state];
  if (!data || v <= 0) return 0;
  // NT: quadratic under $525k, flat % of TOTAL value above (not marginal).
  if (state === 'NT') {
    if (v < 525000) { var Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
    if (v <= 3000000) return v * 0.0495;
    if (v <= 5000000) return v * 0.0575;
    return v * 0.0595;
  }
  var tiers = data.tiers;
  var duty = 0;
  for (var i = 0; i < tiers.length; i++) {
    var from = tiers[i][0];
    if (v <= from) break;
    var nextFrom = (i + 1 < tiers.length) ? tiers[i + 1][0] : Infinity;
    duty += (Math.min(v, nextFrom) - from) * tiers[i][1];
  }
  // Bands that are a flat % of the TOTAL value (not marginal on the excess):
  if (state === 'VIC') {
    if (v > 960000 && v <= 2000000) duty = v * 0.055;
    else if (v > 2000000) duty = 110000 + (v - 2000000) * 0.065;
  } else if (state === 'ACT' && v > 1455000) {
    duty = v * 0.0454;
  } else if (state === 'TAS') {
    duty = (v <= 3000) ? 50 : duty + 50;
  }
  return duty;
}

function stampDutyEstimate(price, state, fhb) {
  // Owner-occupier transfer/stamp duty (FY2026-27), with first home buyer
  // concessions applied per state. Verified against the dedicated stamp duty
  // calculator. Use that page for foreign-buyer surcharge + land-only rules.
  var baseDuty = _calcDutyTiered(state, price);
  if (!fhb) return baseDuty;
  var data = _SD_STATE_DATA[state];
  if (!data) return baseDuty;
  // QLD — QRO band-table method (verified 5 Jul 2026): a fixed concession
  // amount ($17,350 at <$710k, stepping down $1,735 per $10k band to nil at
  // $800k+) is deducted from the HOME-concession duty, not the standard
  // rate; above $800k the home-concession rate still applies (an FHB is an
  // owner-occupier). QRO worked example: $730k → $6,555.
  if (state === 'QLD') {
    var qHome = price <= 350000 ? price * 0.01
      : price <= 540000 ? 3500 + (price - 350000) * 0.035
      : price <= 1000000 ? 10150 + (price - 540000) * 0.045
      : 30850 + (price - 1000000) * 0.0575;
    var qConc = price < 710000 ? 17350
      : (price >= 800000 ? 0 : 17350 - Math.floor((price - 700000) / 10000) * 1735);
    return Math.max(0, qHome - qConc);
  }
  // Full exemption at/below fhbFull (SA + NT have fhbFull === 0 → no value-based
  // exemption: relief is NEW-home only, so established buyers pay full duty).
  if (data.fhbFull > 0 && price <= data.fhbFull) return 0;
  // Sliding partial concession between fhbFull and fhbPartial (NSW/VIC/QLD/WA).
  // TAS + ACT have fhbPartial === fhbFull → hard cliff, no taper.
  if (data.fhbPartial > data.fhbFull && price <= data.fhbPartial) {
    var slide = (data.fhbPartial - price) / (data.fhbPartial - data.fhbFull);
    return Math.max(0, baseDuty * (1 - slide));
  }
  return baseDuty;
}

function lmiEstimate(loanAmount, lvr) {
  // Rough LMI scale — varies by lender and LVR band. This is indicative only.
  // Canonical LMI tiers (shared with mortgage-repayment + stamp-duty tools),
  // indicative of Helia/QBE rates per ASIC MoneySmart. LVR as a percentage.
  if (lvr <= 80) return 0;
  if (lvr <= 85) return loanAmount * 0.0080;
  if (lvr <= 90) return loanAmount * 0.0190;
  if (lvr <= 95) return loanAmount * 0.0340;
  return loanAmount * 0.0430;
}

function calc() {
  var price = parseVal('price');
  var depPct = parseFloat(document.getElementById('dep-pct').value) || 20;
  var state = document.getElementById('state').value;
  var fhb = document.getElementById('fhb').checked;

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  if (!price) {
    _showErr('Enter a property price.');
    setText('r-total', '—');
    setText('r-deposit', '—');
    setText('r-stamp', '—');
    setText('r-legal', '—');
    setText('r-lmi', '—');
    setText('r-loan', '—');
    return;
  }

  var deposit = price * (depPct / 100);
  var loan = price - deposit;
  var lvr = (loan / price) * 100;
  var stamp = stampDutyEstimate(price, state, fhb);
  var legal = 2500; // Conveyancing + inspections: my rough allowance, no official source
  var lmi = lmiEstimate(loan, lvr);
  var total = deposit + stamp + legal + lmi;

  setText('r-total', fmt(total));
  setText('r-deposit', fmt(deposit));
  setText('r-stamp', fmt(stamp));
  setText('r-legal', fmt(legal));
  setText('r-lmi', lmi > 0 ? fmt(lmi) : 'Not required');
  setText('r-loan', fmt(loan));

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'deposit',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Compare the schemes on your own numbers',
    description: 'Step 2 of the First Home Journey compares the government schemes against buying without one, using your savings and income.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '🏠', title: 'First home buyers',
        links: [
          { text: 'Housing Australia: First Home Guarantee (5% Deposit Scheme)', href: 'https://www.housingaustralia.gov.au/support-buy-home/first-home-guarantee' },
          { text: 'ATO: First Home Super Saver scheme', href: 'https://www.ato.gov.au/individuals/super/withdrawing-and-using-your-super/first-home-super-saver-scheme/' }
        ]
      },
      {
        icon: '💰', title: 'Lenders mortgage insurance',
        links: [
          { text: 'Moneysmart: lenders mortgage insurance', href: 'https://moneysmart.gov.au/home-loans/lenders-mortgage-insurance' }
        ]
      },
      {
        icon: '🏛️', title: 'State revenue offices',
        links: [
          { text: 'Revenue NSW', href: 'https://www.revenue.nsw.gov.au/' },
          { text: 'SRO Victoria', href: 'https://www.sro.vic.gov.au/' },
          { text: 'Queensland Revenue Office', href: 'https://qro.qld.gov.au/' }
        ]
      }
    ],
    disclaimer: 'Estimates only. LMI premiums vary by lender. Stamp duty thresholds and concessions change, so confirm them with your state revenue office.'
  },
  share: {
    url: 'https://equitysight.app/tools/deposit-calculator',
    text: 'Just worked out how much deposit I really need!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '🏠', label: 'First Home Buyer Grants' },
    { href: '/tools/borrowing-power-calculator', icon: '🏦', label: 'Borrowing Power' },
    { href: '/tools/mortgage-repayment-calculator', icon: '📊', label: 'Mortgage Repayment' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/first-home-buyer-grants-calculator', text: 'First Home Buyer Grants' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: '$650,000 first home in QLD with 10% deposit',
      inputs: [
        { k: 'Property price', v: '$650,000' },
        { k: 'Deposit', v: '10%' },
        { k: 'State', v: 'Queensland' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '$78,615' },
        { k: 'Deposit portion', v: '$65,000' },
        { k: 'Stamp duty (first home concession)', v: '$0' },
        { k: 'Legal and inspections', v: '$2,500' },
        { k: 'LMI estimate', v: '$11,115' }
      ]
    },
    {
      label: '$950,000 NSW purchase with 20% deposit, not a first home buyer',
      inputs: [
        { k: 'Property price', v: '$950,000' },
        { k: 'Deposit', v: '20%' },
        { k: 'State', v: 'NSW' },
        { k: 'First home buyer', v: 'No' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '$229,438' },
        { k: 'Deposit portion', v: '$190,000' },
        { k: 'Stamp duty', v: '$36,938' },
        { k: 'LMI estimate', v: 'Not required (20% deposit)' }
      ]
    },
    {
      label: '$500,000 VIC first home with 5% deposit',
      inputs: [
        { k: 'Property price', v: '$500,000' },
        { k: 'Deposit', v: '5%' },
        { k: 'State', v: 'Victoria' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '$43,650' },
        { k: 'Deposit portion', v: '$25,000' },
        { k: 'Stamp duty (first home exemption)', v: '$0' },
        { k: 'LMI estimate', v: '$16,150' },
        { k: 'If the 5% Deposit Scheme removes the LMI', v: '$27,500 cash needed' }
      ]
    }
  ],
  faq: [
    { q: 'Do I need a 20% deposit to buy a home in Australia?',
      a: 'No. 20% is the usual target because it avoids Lenders Mortgage Insurance (LMI). You can buy with 10% and pay LMI, or with as little as 5% through the 5% Deposit Scheme (formerly the First Home Guarantee). A smaller deposit means a larger loan and more interest over the life of the mortgage.' },
    { q: 'What is Lenders Mortgage Insurance (LMI) and when do I pay it?',
      a: 'LMI is insurance the lender takes out, and you pay for, when your deposit is below 20%. It protects the lender if you default. In this calculator, a $650,000 purchase gives an LMI estimate of $4,420 with a 15% deposit, $11,115 with 10% and $20,995 with 5%. It\'s usually added to the loan.' },
    { q: 'Can I use my super for a deposit?',
      a: 'Yes. The First Home Super Saver Scheme lets eligible first home buyers release voluntary super contributions (plus earnings) to put toward a deposit. You can withdraw up to $50,000 of contributions, which are taxed concessionally.' },
    { q: 'Do parents\' guarantees reduce the deposit I need?',
      a: 'A family guarantee (parental guarantor loan) uses the equity in a parent\'s home as additional security, which can reduce or remove the deposit and avoids LMI. It ties the guarantor\'s property to your loan, so get legal advice first. This calculator doesn\'t model one.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty' },
    { group: 'Other Tools', icon: '🏠', href: '/tools/first-home-buyer-grants-calculator', label: 'First Home Buyer Grants' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '📊', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' }
  ]
});

if (window.trackCalculatorStart) trackCalculatorStart('deposit');
calc();

['price'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
['dep-pct','state','fhb'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', calc);
});
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'deposit'});
  calc();
});

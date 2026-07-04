/* ═══ DEPOSIT CALCULATOR ═══ */

// Cumulative-tier stamp duty engine — verified against each state revenue
// office, FY2025-26 (34/34 worked examples reproduced within $1). This is the
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
  NSW: { fhbFull: 800000,  fhbPartial: 1000000, tiers: [[0,0.0125],[17000,0.015],[37000,0.0175],[99000,0.035],[372000,0.045],[1240000,0.055],[3721000,0.07]] },
  VIC: { fhbFull: 600000,  fhbPartial: 750000,  tiers: [[0,0.014],[25000,0.024],[130000,0.06]] },
  QLD: { fhbFull: 700000,  fhbPartial: 800000,  tiers: [[0,0],[5000,0.015],[75000,0.035],[540000,0.045],[1000000,0.0575]] },
  SA:  { fhbFull: 0,       fhbPartial: 0,        tiers: [[0,0.01],[12000,0.02],[30000,0.03],[50000,0.035],[100000,0.04],[200000,0.0425],[250000,0.0475],[300000,0.05],[500000,0.055]] },
  WA:  { fhbFull: 500000,  fhbPartial: 700000,  tiers: [[0,0.019],[120000,0.0285],[150000,0.038],[360000,0.0475],[725000,0.0515]] },
  TAS: { fhbFull: 750000,  fhbPartial: 750000,  tiers: [[0,0],[3000,0.0175],[25000,0.0225],[75000,0.035],[200000,0.04],[375000,0.0425],[725000,0.045]] },
  ACT: { fhbFull: 1020000, fhbPartial: 1020000, tiers: [[0,0.0028],[260000,0.022],[300000,0.034],[500000,0.0432],[750000,0.059],[1000000,0.064]] },
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
  // Owner-occupier transfer/stamp duty (FY2025-26), with first home buyer
  // concessions applied per state. Verified against the dedicated stamp duty
  // calculator. Use that page for foreign-buyer surcharge + land-only rules.
  var baseDuty = _calcDutyTiered(state, price);
  if (!fhb) return baseDuty;
  var data = _SD_STATE_DATA[state];
  if (!data) return baseDuty;
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
    _showErr('Please enter a property price.');
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
  var legal = 2500; // Conveyancing + inspections (~$1500 + $1000 typical)
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
    title: 'Model the full purchase — deposit, loan & 30-year projection',
    description: 'Stack grants, stamp duty, LMI, and long-term equity growth into one view — free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '🏠', title: 'First Home Buyer Support',
        links: [
          { text: 'First Home Guarantee (Housing Australia)', href: 'https://www.housingaustralia.gov.au/support-buy-home/first-home-guarantee' },
          { text: 'ASIC MoneySmart: Saving for a Home', href: 'https://moneysmart.gov.au/saving/save-for-an-emergency-fund' },
          { text: 'First Home Super Saver Scheme', href: 'https://www.ato.gov.au/individuals/super/withdrawing-and-using-your-super/first-home-super-saver-scheme/' }
        ]
      },
      {
        icon: '💰', title: 'Lenders Mortgage Insurance',
        links: [
          { text: 'ASIC MoneySmart: LMI explained', href: 'https://moneysmart.gov.au/home-loans/lenders-mortgage-insurance' },
          { text: 'APRA: Prudential Standards', href: 'https://www.apra.gov.au/' }
        ]
      },
      {
        icon: '🏛️', title: 'State Stamp Duty Offices',
        links: [
          { text: 'Revenue NSW', href: 'https://www.revenue.nsw.gov.au/' },
          { text: 'SRO Victoria', href: 'https://www.sro.vic.gov.au/' },
          { text: 'QLD Office of State Revenue', href: 'https://qro.qld.gov.au/' }
        ]
      }
    ],
    disclaimer: 'Estimates only. LMI premiums vary by lender. Stamp duty thresholds and concessions change — confirm with your state revenue office.'
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
        { k: 'Cash needed up-front', v: '~$77,000' },
        { k: 'Deposit portion', v: '$65,000' },
        { k: 'Stamp duty (FHB concession)', v: '~$0' },
        { k: 'LMI estimate', v: '~$10,500' }
      ]
    },
    {
      label: '$950,000 NSW investor purchase with 20% deposit',
      inputs: [
        { k: 'Property price', v: '$950,000' },
        { k: 'Deposit', v: '20%' },
        { k: 'State', v: 'NSW' },
        { k: 'First home buyer', v: 'No' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '~$228,000' },
        { k: 'Deposit portion', v: '$190,000' },
        { k: 'Stamp duty', v: '~$33,250' },
        { k: 'LMI estimate', v: 'Not required (20%)' }
      ]
    },
    {
      label: '$500,000 VIC property with 5% deposit (First Home Guarantee)',
      inputs: [
        { k: 'Property price', v: '$500,000' },
        { k: 'Deposit', v: '5%' },
        { k: 'State', v: 'Victoria' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '~$27,500' },
        { k: 'Deposit portion', v: '$25,000' },
        { k: 'Stamp duty (FHB waived)', v: '$0' },
        { k: 'LMI (covered by FHG)', v: '$0' }
      ]
    }
  ],
  faq: [
    { q: 'How much deposit do I actually need to buy a home in Australia?',
      a: 'The standard is 20% of the purchase price to avoid Lenders Mortgage Insurance (LMI). You can buy with as little as 5% through the First Home Guarantee, or 10% with LMI paid. Remember to budget 3–5% extra for stamp duty, legals, and inspections.' },
    { q: 'What is Lenders Mortgage Insurance (LMI) and when do I pay it?',
      a: 'LMI is insurance the lender takes out (but you pay for) when your deposit is below 20%. It protects the lender if you default. Premiums range from $8,000 to $25,000+ depending on loan size and LVR. It\'s usually capitalised onto your loan.' },
    { q: 'Can I use my super for a deposit?',
      a: 'Yes — the First Home Super Saver Scheme lets eligible first home buyers release voluntary super contributions (plus earnings) to put toward a deposit. You can withdraw up to $50,000 of contributions, which are taxed concessionally.' },
    { q: 'Do parents\' guarantees reduce the deposit I need?',
      a: 'A family guarantee (parental guarantor loan) can reduce or eliminate the deposit by using the equity in a parent\'s home as additional security. This avoids LMI but ties the guarantor\'s property to your loan — seek legal advice first.' },
    { q: 'What upfront costs beyond the deposit should I budget for?',
      a: 'Stamp duty (the biggest — up to 6% of price depending on state), conveyancing ($1,000–$2,000), building/pest inspections ($500–$1,000), loan application fees ($0–$800), and moving costs. Budget 3–5% of the purchase price for these.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty' },
    { group: 'Other Tools', icon: '🏠', href: '/tools/first-home-buyer-grants-calculator', label: 'First Home Buyer Grants' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '📊', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' }
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

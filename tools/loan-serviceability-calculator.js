/* ═══ LOAN SERVICEABILITY CALCULATOR ═══
 *
 * A net-surplus serviceability check:
 *   net income (after tax)
 *   − living expenses (the higher of what you enter or an expense floor)
 *   − existing debt repayments
 *   − 3% a month of total credit card limits
 *   = monthly surplus, which is the largest repayment the loan can have at
 *     the test rate (your rate + 3.00%) over 30 years, principal and interest.
 *
 * ⚠ SYNC COPY: approxTax() and hemMonthly() are copied from
 * tools/borrowing-power-calculator.js so both tools tax income and floor
 * expenses the same way. If you change one, change the other.
 */

// ── ATO resident individual tax (FY 2026-27) — SYNC COPY, see header ──────
function approxTax(gross) {
  var tax = 0;
  if (gross <= 18200) tax = 0;
  else if (gross <= 45000) tax = (gross - 18200) * 0.15;
  else if (gross <= 135000) tax = 4020 + (gross - 45000) * 0.30;
  else if (gross <= 190000) tax = 31020 + (gross - 135000) * 0.37;
  else tax = 51370 + (gross - 190000) * 0.45;
  // Medicare levy: 0% below $28,011; sliding 10% of excess in $28,011-$35,013;
  // flat 2% above $35,013 (singles). FY 2025-26 thresholds (latest published).
  if (gross > 35013) tax += gross * 0.02;
  else if (gross > 28011) tax += (gross - 28011) * 0.10;
  return tax;
}

// ── Living-expense floor — SYNC COPY, see header ──────────────────────────
// My own rough stand-in for the Household Expenditure Measure. The real HEM
// table is licensed data that I do not have, so this is not the lender figure.
function hemMonthly(annualHouseholdGrossIncome, adults, dependants) {
  var I = annualHouseholdGrossIncome;
  var perAdult;
  if (I < 50000) perAdult = 1750;
  else if (I < 80000) perAdult = 1950;
  else if (I < 120000) perAdult = 2150;
  else if (I < 180000) perAdult = 2400;
  else if (I < 250000) perAdult = 2700;
  else if (I < 350000) perAdult = 3050;
  else perAdult = 3400;
  var adultsCost = adults <= 1 ? perAdult : perAdult + (adults - 1) * Math.round(perAdult * 0.70);
  var depCost;
  if (I < 80000) depCost = 700;
  else if (I < 180000) depCost = 800;
  else if (I < 350000) depCost = 880;
  else depCost = 950;
  return adultsCost + dependants * depCost;
}

var SVC_OTHER_INCOME_SHADING = 0.75; // rental / other income counted at 75% (same as borrowing power)
var SVC_CARD_RATE = 0.03;            // credit cards assessed at 3% of the limit per month
var SVC_BUFFER = 3.0;                // APRA serviceability buffer, percentage points
var SVC_TERM_MONTHS = 360;           // 30-year principal-and-interest loan

// Pure calculation, shared by the page and by anything that wants to check it.
function serviceability(inp) {
  var salary = inp.salary || 0, partner = inp.partner || 0, other = inp.other || 0;
  var net1 = salary - approxTax(salary);
  // Other income is taxed on top of your salary, then counted at 75%.
  var net1WithOther = (salary + other) - approxTax(salary + other);
  var otherNet = (net1WithOther - net1) * SVC_OTHER_INCOME_SHADING;
  var net2 = partner > 0 ? partner - approxTax(partner) : 0;
  var netMonthly = (net1 + otherNet + net2) / 12;

  var adults = partner > 0 ? 2 : 1;
  var floor = hemMonthly(salary + partner + other, adults, 0);
  var entered = inp.expenses || 0;
  var expensesUsed = Math.max(entered, floor);
  var cardAssess = (inp.cards || 0) * SVC_CARD_RATE;
  var commitments = expensesUsed + (inp.debt || 0) + cardAssess;
  var surplus = netMonthly - commitments;

  var assessmentRate = inp.rate + SVC_BUFFER;
  var r = assessmentRate / 100 / 12;
  var repayFactor = r > 0 ? r / (1 - Math.pow(1 + r, -SVC_TERM_MONTHS)) : 1 / SVC_TERM_MONTHS;
  var maxLoan = surplus > 0 ? surplus / repayFactor : 0;
  var ra = inp.rate / 100 / 12;
  var actualFactor = ra > 0 ? ra / (1 - Math.pow(1 + ra, -SVC_TERM_MONTHS)) : 1 / SVC_TERM_MONTHS;

  return {
    netMonthly: netMonthly, floor: floor, entered: entered, expensesUsed: expensesUsed,
    floorApplied: floor > entered, cardAssess: cardAssess, commitments: commitments,
    surplus: surplus, assessmentRate: assessmentRate, maxLoan: maxLoan,
    repaymentAtActualRate: maxLoan * actualFactor
  };
}

// silent = true: recalculate without validation messages, scrolling or
// tracking (used on first load and when the live rate arrives).
function calculate(silent) {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg && !silent){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var salary = parseVal('salary');
  var partner = parseVal('partner');
  var other = parseVal('other');
  if (!salary && !partner && !other) { _showErr('Enter at least one income.'); return; }

  var rate = parseFloat(document.getElementById('base-rate').value);
  if (!isFinite(rate) || rate < 0) { _showErr('Enter the loan interest rate.'); return; }

  var s = serviceability({
    salary: salary, partner: partner, other: other,
    expenses: parseVal('expenses'), debt: parseVal('debt'), cards: parseVal('cards'), rate: rate
  });
  var debt = parseVal('debt');

  document.getElementById('r-income').textContent = fmt(s.netMonthly);
  document.getElementById('r-monthly').textContent = fmt(s.commitments);
  document.getElementById('r-disposable').textContent = fmt(Math.max(0, s.surplus));
  document.getElementById('r-borrow').textContent = fmt(s.maxLoan);

  var parts = [];
  parts.push(s.floorApplied
    ? 'Living expenses used: ' + fmt(s.expensesUsed) + ' a month. That is the expense floor for your household and income, because it is higher than the ' + fmt(s.entered) + ' you entered.'
    : 'Living expenses used: ' + fmt(s.expensesUsed) + ' a month (your figure, which is above the ' + fmt(s.floor) + ' floor).');
  if (debt > 0) parts.push('Existing repayments: ' + fmt(debt) + ' a month.');
  if (s.cardAssess > 0) parts.push('Credit cards: ' + fmt(s.cardAssess) + ' a month (3% of the limit).');
  parts.push('Test rate: ' + s.assessmentRate.toFixed(2) + '% (your rate + 3%), 30-year principal and interest.');
  if (s.surplus <= 0) {
    parts.push('Nothing is left for loan repayments after expenses and commitments, so the estimate is $0.');
  } else {
    parts.push('At your actual rate of ' + rate.toFixed(2) + '% that loan would cost about ' + fmt(s.repaymentAtActualRate) + ' a month.');
  }
  var noteEl = document.getElementById('r-note');
  noteEl.textContent = parts.join(' ');
  noteEl.style.display = '';

  document.getElementById('result').style.display = '';
  if (!silent) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if(window.trackCalculatorResult) trackCalculatorResult('loan-serviceability', {
      netMonthlyIncome: Math.round(s.netMonthly),
      monthlyCommitments: Math.round(s.commitments),
      monthlySurplus: Math.round(s.surplus),
      maxBorrowingCapacity: Math.round(s.maxLoan),
      assessmentRate: s.assessmentRate.toFixed(2)
    });
  }
}

/* ─ Rate suggestion: the RBA cash rate plus my estimated lender margin (see
 *   market-rate.js). It is not a quoted rate, so the note under the field,
 *   which market-rate.js words, always says what it is made of. The
 *   suggestion only replaces the rate while you have not typed your own, and
 *   the result is recalculated so the figures on screen always match the rate
 *   in the box. ─ */
if (typeof MarketRate !== 'undefined') {
  MarketRate.onReady(function(d) {
    if (!d) return;
    var showing = ToolPage.applyLiveRate({ inputId: 'base-rate', defaultValue: '6.25', slug: 'loan-serviceability', rate: d.suggestedRate });
    var badge = document.getElementById('rate-live-badge');
    var hint  = document.getElementById('rate-live-hint');
    if (badge) badge.style.display = showing ? '' : 'none';
    if (hint)  hint.textContent = MarketRate.rateNote(showing);
    if (hint) hint.style.display = '';
    calculate(true);
  });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'loan-serviceability',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Turn the estimate into a budget',
    description: 'Step 3 of the First Home Journey runs a similar borrowing test, takes stamp duty and the other upfront costs out of your savings, and sets a maximum price.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE6', title: 'Home loans',
        links: [
          { text: 'Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'Moneysmart: choosing a home loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' }
        ]
      }
    ],
    disclaimer: ''
  },
  share: {
    url: 'https://equitysight.app/tools/loan-serviceability-calculator',
    text: 'Just checked my loan serviceability!'
  },
  related: [
    { href: '/tools/mortgage-stress-calculator', icon: '\uD83D\uDCC8', label: 'Mortgage Stress' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: '/tools/borrowing-power-calculator', icon: '\uD83C\uDFE6', label: 'Borrowing Power' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/rental-yield-calculator', text: 'Rental Yield' },
    { href: '/tools/equity-release-calculator', text: 'Home Equity' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Single applicant on $95k',
      inputs: [
        { k: 'Gross income', v: '$95,000' },
        { k: 'Monthly living costs', v: '$2,400' },
        { k: 'Other debts (monthly)', v: '$400' },
        { k: 'Interest rate', v: '6.50%' }
      ],
      outputs: [
        { k: 'Surplus for repayments', v: '$3,373 a month' },
        { k: 'Estimated borrowing capacity', v: '$401,179' }
      ]
    },
    {
      label: 'Couple on $95k and $70k',
      inputs: [
        { k: 'Gross income', v: '$95,000 + $70,000' },
        { k: 'Monthly living costs', v: '$4,100' },
        { k: 'Other debts (monthly)', v: '$600' },
        { k: 'Interest rate', v: '6.50%' }
      ],
      outputs: [
        { k: 'Surplus for repayments', v: '$6,230 a month' },
        { k: 'Estimated borrowing capacity', v: '$740,913' }
      ]
    },
    {
      label: 'Investor with rental income',
      inputs: [
        { k: 'Gross income', v: '$130,000' },
        { k: 'Other (rental) income', v: '$30,000, counted at 75%' },
        { k: 'Monthly living costs', v: '$3,000' },
        { k: 'Interest rate', v: '6.75%' }
      ],
      outputs: [
        { k: 'Surplus for repayments', v: '$6,322 a month' },
        { k: 'Estimated borrowing capacity', v: '$735,874' }
      ]
    }
  ],
  faq: [
    { q: 'How much income do I need to borrow $1 million?',
      a: 'It depends on your expenses, debts and the rate. With no debts or credit cards and a 6.50% loan rate, this calculator gives about $1,068,000 for a single applicant on $200,000 and about $990,000 for a couple earning $100,000 each. A car loan, a credit card limit or a higher rate lowers both figures.' },
    { q: 'Why does my credit card limit reduce my borrowing power if I pay it off?',
      a: 'Lenders assume you could draw the full limit at any time, so they count a notional monthly repayment on the limit whatever the balance. This calculator uses 3% of the limit a month. In the worked example on this page, cutting the $10,000 limit to $5,000 lifts the estimate from $951,585 to $970,227.' },
    { q: 'Does rental income count?',
      a: 'Yes, but at a discount for vacancy and running costs, so a property earning $500/week might count as about $375/week. This calculator counts 75% of other income, after tax.' },
    { q: 'Does the 3% buffer ever change?',
      a: 'Yes. APRA sets the minimum buffer and reviews it. It was 2.5% before October 2021 and has been 3% since. Some lenders also use a minimum floor rate that is higher than your rate plus the buffer.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83D\uDCC8', href: '/tools/mortgage-stress-calculator', label: 'Mortgage Stress Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB5', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/toowong/', label: 'Toowong QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/methodology', label: 'Our Methodology' }
  ]
});

if(window.trackCalculatorStart) trackCalculatorStart('loan-serviceability');
calculate(true);
['salary','partner','other','expenses','debt','cards'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var calcBtn = document.getElementById('loan-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'loan-serviceability'});
  calculate(false);
});

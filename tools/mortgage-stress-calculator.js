// silent = true: recalculate without validation messages, scrolling or
// tracking (used on first load and when the live rate arrives).
function calculate(silent) {
  var loan = parseVal('loan');
  var rate = parseFloat(document.getElementById('rate').value) || 0;
  var term = parseInt(document.getElementById('term').value) || 30;
  var io = document.getElementById('ltype').value === 'io';
  var income = parseVal('income');
  var otherDebt = parseVal('expenses');
  var bufferPct = parseFloat(document.getElementById('buffer').value) || 3;

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg && !silent){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  if (!loan || !rate || !income) { _showErr('Please enter loan amount, interest rate, and monthly income.'); return; }

  var repay = monthlyRepayment(loan, rate, term, io);
  var stressed = monthlyRepayment(loan, rate + bufferPct, term, io);

  var dsrCurrent = (repay / income) * 100;
  var dsrStress = (stressed / income) * 100;
  var totalDebt = repay + otherDebt;
  var tdsr = (totalDebt / income) * 100;
  var surplus = income - totalDebt;
  var dti = loan / (income * 12);

  var isStressed = dsrCurrent >= 30;
  var isStressedUnderBuffer = dsrStress >= 30;

  // Check the CURRENT ratio first. The stressed ratio is always at least as
  // high as the current one, so testing it first would hide the "already in
  // stress" cases behind the "a rate rise would push you there" wording.
  var verdict = '';
  if (dsrCurrent >= 50) verdict = '\u26A0\uFE0F Severe stress. Repayments already take ' + dsrCurrent.toFixed(1) + '% of gross income at the current rate, above the 50% severe-stress line.';
  else if (dsrCurrent >= 30) verdict = '\u26A0\uFE0F Already in mortgage stress. Repayments take ' + dsrCurrent.toFixed(1) + '% of gross income at the current rate (the threshold is 30%). A ' + bufferPct + '% rate rise would lift that to ' + dsrStress.toFixed(1) + '%.';
  else if (dsrStress >= 50) verdict = '\u26A0\uFE0F High risk. Repayments are under 30% of gross income now, but a ' + bufferPct + '% rate rise would take them over 50%.';
  else if (dsrStress >= 30) verdict = '\u26A0\uFE0F Caution. Repayments are under 30% of gross income now, but a ' + bufferPct + '% rate rise would push them to ' + dsrStress.toFixed(1) + '%, past the 30% stress threshold.';
  else if (dsrStress < 25) verdict = '\u2713 Comfortable. Even with a ' + bufferPct + '% rate rise, repayments stay under 25% of gross income.';
  else verdict = '\u2713 Manageable. Repayments stay under the 30% threshold even with a ' + bufferPct + '% rate rise.';

  var dsrEl = document.getElementById('r-dsr');
  dsrEl.textContent = dsrCurrent.toFixed(1) + '%';
  dsrEl.className = 'tool-stat-value ' + (isStressed ? 'red' : 'green');

  var dsrSEl = document.getElementById('r-dsr-stress');
  dsrSEl.textContent = dsrStress.toFixed(1) + '%';
  dsrSEl.className = 'tool-stat-value ' + (isStressedUnderBuffer ? 'red' : '');

  var surplusEl = document.getElementById('r-surplus');
  surplusEl.textContent = fmt(surplus);
  surplusEl.className = 'tool-stat-value ' + (surplus < 0 ? 'red' : '');

  document.getElementById('r-repay').textContent = fmt(repay) + '/mo';
  document.getElementById('r-stressed').textContent = fmt(stressed) + '/mo';
  document.getElementById('r-tdsr').textContent = tdsr.toFixed(1) + '%  (DTI: ' + dti.toFixed(1) + '\u00D7)';
  document.getElementById('r-verdict').textContent = verdict;

  document.getElementById('result').style.display = '';
  if (!silent) {
    document.getElementById('cta').style.display = '';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('mortgage-stress', {
      loanAmount: loan,
      interestRate: rate,
      termYears: term,
      loanType: io ? 'interest-only' : 'principal-and-interest',
      monthlyRepayment: Math.round(repay),
      stressedMonthlyRepayment: Math.round(stressed),
      dsr: dsrCurrent.toFixed(1),
      dsr_stressed: dsrStress.toFixed(1),
      stressBuffer: bufferPct
    });
  }
}

/* ─ Hydrate interest rate from live RBA data ─ */
if (typeof MarketRate !== 'undefined') {
  MarketRate.onReady(function(d) {
    if (!d) return;
    // Only replaces the rate while you have not typed your own, then
    // recalculates so the result always matches the rate in the box.
    var showing = ToolPage.applyLiveRate({ inputId: 'rate', defaultValue: '6.25', slug: 'mortgage-stress', rate: d.suggestedRate });
    var badge = document.getElementById('rate-live-badge');
    var hint  = document.getElementById('rate-live-hint');
    if (badge) badge.style.display = showing ? '' : 'none';
    if (hint)  hint.textContent = 'RBA cash rate ' + d.cashRate.toFixed(2) + '% + lender margin '
      + d.lenderMargin.toFixed(2) + '% (my assumption) = ' + d.suggestedRate.toFixed(2) + '% suggested'
      + (d.rateDate ? ' (cash rate as at ' + d.rateDate + ')' : '');
    if (hint) hint.style.display = '';
    calculate(true);
  });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'mortgage-stress',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the full property purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE6', title: 'Interest Rates & Policy',
        links: [
          { text: 'Reserve Bank of Australia (RBA)', href: 'https://www.rba.gov.au/' },
          { text: 'RBA: Housing & Mortgages', href: 'https://www.rba.gov.au/education/resources/explainers/' },
          { text: 'APRA', href: 'https://www.apra.gov.au/' },
          { text: 'MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Borrowing Capacity',
        links: [
          { text: 'ASIC: Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
        ]
      },
      {
        icon: '\uD83D\uDCCA', title: 'Financial Management',
        links: [
          { text: 'ASIC: Budgeting Tools', href: 'https://moneysmart.gov.au/budgeting' },
          { text: 'Moneysmart (ASIC)', href: 'https://moneysmart.gov.au/' },
          { text: 'ASIC: Financial Difficulty Help', href: 'https://moneysmart.gov.au/justask' }
        ]
      }
    ],
    disclaimer: 'This is general information only. Interest rates, serviceability criteria, and lending standards change over time. Always consult your lender and a financial adviser about your situation.'
  },
  share: {
    url: 'https://equitysight.app/tools/mortgage-stress-calculator',
    text: 'Just tested my mortgage stress capacity!'
  },
  related: [
    { href: '/tools/loan-serviceability-calculator', icon: '\uD83D\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/borrowing-power-calculator', icon: '\uD83C\uDFE6', label: 'Borrowing Power' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\uD83C\uDF81', label: 'FHB Grants' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/', text: 'All Calculators' },
    { href: '/tools/borrowing-power-calculator', text: 'Borrowing Power' },
    { href: '/tools/mortgage-repayment-calculator', text: 'Repayment' },
    { href: '/privacy', text: 'Privacy' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power Calculator' },
    { group: 'Other Tools', icon: '💳', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Other Tools', icon: '⚖️', href: '/tools/interest-only-vs-principal-calculator', label: 'Interest Only vs P&I' },
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'How we calculate (methodology)' }
  ]
});

if(window.trackCalculatorStart) trackCalculatorStart('mortgage-stress');
calculate(true);
['loan','income','expenses'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var calcBtn = document.getElementById('stress-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'mortgage-stress'});
  calculate(false);
});

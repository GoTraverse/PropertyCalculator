function calculate() {
  var salary = parseVal('salary');
  var partner = parseVal('partner');
  var other = parseVal('other');
  var expenses = parseVal('expenses');
  var debt = parseVal('debt');

  if (!salary && !partner && !other) { if (!_isInit) alert('Please enter at least one income source.'); return; }

  var gross = salary + partner + (other * 0.7);
  var monthlyIncome = gross / 12;
  var monthlyCommitments = expenses + debt;
  var monthlyDisposable = monthlyIncome - monthlyCommitments;

  // Use live assessment rate (displayed to user) + 3% APRA buffer
  var baseRateInput = parseFloat(document.getElementById('base-rate').value) || 6.50;
  var assessmentRate = baseRateInput + 3.0; // APRA 3% buffer
  var monthlyAssessmentRate = assessmentRate / 100 / 12;
  // Monthly repayment factor for a 30-year P&I loan at the assessment rate
  var repayFactor = monthlyAssessmentRate > 0
    ? monthlyAssessmentRate / (1 - Math.pow(1 + monthlyAssessmentRate, -360))
    : 1 / 360;

  var maxMonthlyDebt = gross * 0.45 / 12;
  var maxMortgagePayment = maxMonthlyDebt - debt;
  var maxLoan = repayFactor > 0 ? maxMortgagePayment / repayFactor : 0;

  document.getElementById('r-income').textContent = fmt(gross);
  document.getElementById('r-monthly').textContent = fmt(monthlyCommitments);
  document.getElementById('r-disposable').textContent = fmt(Math.max(0, monthlyDisposable));
  document.getElementById('r-borrow').textContent = fmt(Math.max(0, maxLoan));

  var note = '';
  if (monthlyDisposable < 0) {
    note = 'Your current expenses exceed income. Consider reducing expenses or increasing income before applying for a mortgage.';
  } else if (maxLoan < 200000) {
    note = 'Your borrowing capacity is limited. A mortgage broker can help explore options or improve your serviceability.';
  }

  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';

  document.getElementById('result').style.display = '';
  document.getElementById('cta').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Track calculator result
    if(window.trackCalculatorResult) trackCalculatorResult('loan-serviceability', {
      grossIncome: gross,
      monthlyIncome: Math.round(monthlyIncome),
      monthlyCommitments: monthlyCommitments,
      monthlyDisposable: Math.round(monthlyDisposable),
      maxBorrowingCapacity: Math.round(maxLoan),
      assessmentRate: assessmentRate.toFixed(2)
    });
  }
}

/* ─ Hydrate assessment rate from live RBA data ─ */
if (typeof MarketRate !== 'undefined') {
  MarketRate.onReady(function(d) {
    if (!d) return;
    var el = document.getElementById('base-rate');
    if (el && el.value === '6.50') {
      el.value = d.suggestedRate;
    }
    var badge = document.getElementById('rate-live-badge');
    var hint  = document.getElementById('rate-live-hint');
    if (badge) badge.style.display = '';
    if (hint)  hint.textContent = 'RBA cash rate ' + d.cashRate.toFixed(2) + '% + lender margin '
      + d.lenderMargin.toFixed(2) + '% = ' + d.suggestedRate.toFixed(2) + '% (banks assess at this + 3% APRA buffer)'
      + (d.rateDate ? ' — ' + d.rateDate : '');
    if (hint) hint.style.display = '';
  });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full investment',
    description: 'See how a property fits into your investment plan. Model multiple properties, rental scenarios, and track equity growth \u2014 all in EquitySight.',
    buttonText: 'Get started free \u2192',
    buttonHref: '../login.html?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE6', title: 'Borrowing & Affordability',
        links: [
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ASIC: Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'RBA: Housing & Mortgages', href: 'https://www.rba.gov.au/education/resources/explainers/' },
          { text: 'MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '\uD83D\uDCCA', title: 'Income & Expenses',
        links: [
          { text: 'ASIC: Borrowing Guidance', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ASIC: Responsible Lending', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: Tax Deduction Guide', href: 'https://www.ato.gov.au/' }
        ]
      },
      {
        icon: '\uD83C\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.firsthome.gov.au/' },
          { text: 'First Home Super Saver', href: 'https://www.australia.gov.au/benefits/centrelink-payments-and-services/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      }
    ],
    disclaimer: 'This is general information only. Always consult with a financial adviser and your lender about your specific borrowing capacity, as calculations vary by circumstance.'
  },
  share: {
    url: 'https://equitysight.app/tools/loan-serviceability-calculator.html',
    text: 'Just checked my loan serviceability!'
  },
  related: [
    { href: 'mortgage-stress-calculator.html', icon: '\uD83D\uDCC8', label: 'Mortgage Stress' },
    { href: 'first-home-buyer-grants-calculator.html', icon: '\uD83C\uDF81', label: 'FHB Grants' },
    { href: 'cost-of-purchase-calculator.html', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: 'rental-yield-calculator.html', icon: '\uD83D\uDCB0', label: 'Rental Yield' }
  ],
  footer: [
    { href: '../index.html', text: 'EquitySight.app' },
    { href: 'rental-yield-calculator.html', text: 'Rental Yield' },
    { href: 'equity-release-calculator.html', text: 'Equity Release' },
    { href: 'stamp-duty-calculator.html', text: 'Stamp Duty' },
    { href: '../privacy.html', text: 'Privacy' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('loan-serviceability');
calculate();
_isInit = false;
['salary','partner','other','expenses','debt'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var calcBtn = document.getElementById('loan-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'loan-serviceability'});
  calculate();
});

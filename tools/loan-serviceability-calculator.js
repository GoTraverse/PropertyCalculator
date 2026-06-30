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

  // APRA serviceability buffer (Prudential Standard APS 220, current 3.00% since
  // Oct 2021). Verify at apra.gov.au if APRA revises.
  var baseRateInput = parseFloat(document.getElementById('base-rate').value) || 6.50;
  var assessmentRate = baseRateInput + 3.0;
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
  if (!_isInit) {
    document.getElementById('cta').style.display = '';
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
  slug: 'loan-serviceability',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full investment',
    description: 'See how a property fits into your investment plan. Model multiple properties, rental scenarios, and track equity growth \u2014 all in EquitySight.',
    buttonText: 'Try it free \u2014 no signup \u2192',
    buttonHref: '/app'
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
    { href: '/tools/equity-release-calculator', text: 'Equity Release' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Single applicant — $95k income',
      inputs: [
        { k: 'Gross income', v: '$95,000' },
        { k: 'Monthly living costs', v: '$2,400' },
        { k: 'Other debts (monthly)', v: '$400' },
        { k: 'Interest rate', v: '6.50%' }
      ],
      outputs: [
        { k: 'Estimated borrowing power', v: '~$520,000' },
        { k: 'Max repayment (monthly)', v: '~$3,290' }
      ]
    },
    {
      label: 'Couple — $165k combined income',
      inputs: [
        { k: 'Gross income', v: '$165,000' },
        { k: 'Monthly living costs', v: '$4,100' },
        { k: 'Other debts (monthly)', v: '$600' },
        { k: 'Interest rate', v: '6.50%' }
      ],
      outputs: [
        { k: 'Estimated borrowing power', v: '~$905,000' },
        { k: 'Max repayment (monthly)', v: '~$5,720' }
      ]
    },
    {
      label: 'Investor with rental income',
      inputs: [
        { k: 'Gross income', v: '$130,000' },
        { k: 'Rental income (80%)', v: '$24,000' },
        { k: 'Monthly living costs', v: '$3,000' },
        { k: 'Interest rate', v: '6.75%' }
      ],
      outputs: [
        { k: 'Estimated borrowing power', v: '~$760,000' },
        { k: 'Max repayment (monthly)', v: '~$4,930' }
      ]
    }
  ],
  faq: [
    { q: 'How is serviceability calculated?',
      a: 'Lenders take your net income, subtract living expenses and existing debt repayments, and stress-test your ability to service the new loan at an interest rate 3 percentage points above the current actual rate (APRA\u2019s serviceability buffer).' },
    { q: 'What expenses do lenders look at?',
      a: 'Lenders apply the higher of your declared expenses or the Household Expenditure Measure (HEM) for your household size and income band. HEM covers groceries, transport, utilities, insurance, childcare, and discretionary spending.' },
    { q: 'Why do banks use a stress-test rate?',
      a: 'APRA requires lenders to assess loans at the current rate plus a 3% buffer. This ensures you can keep servicing the loan if rates rise \u2014 a real-world risk most Australian borrowers have faced in recent years.' },
    { q: 'Does rental income count?',
      a: 'Yes, but lenders usually discount it by 20\u201330% to account for vacancy and ongoing costs. A property expected to earn $500/week might be counted as ~$350/week for serviceability.' },
    { q: 'How can I improve my borrowing power?',
      a: 'Reduce credit-card limits (even unused limits reduce capacity), pay down personal loans, increase declared income (bonus/overtime history helps), and reduce declared expenses by closing subscriptions you don\u2019t use.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83D\uDCC8', href: '/tools/mortgage-stress-calculator', label: 'Mortgage Stress Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB5', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/toowong/', label: 'Toowong QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/methodology.html', label: 'Our Methodology' }
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

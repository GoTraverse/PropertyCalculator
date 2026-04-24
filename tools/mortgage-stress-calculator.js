function calculate() {
  var loan = parseVal('loan');
  var rate = parseFloat(document.getElementById('rate').value) || 0;
  var term = parseInt(document.getElementById('term').value) || 30;
  var io = document.getElementById('ltype').value === 'io';
  var income = parseVal('income');
  var otherDebt = parseVal('expenses');
  var bufferPct = parseFloat(document.getElementById('buffer').value) || 3;

  if (!loan || !rate || !income) { if (!_isInit) alert('Please enter loan amount, interest rate, and monthly income.'); return; }

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

  var verdict = '';
  if (dsrStress >= 50) verdict = '\u26A0\uFE0F High risk. Even at current rates this is stretched \u2014 at the stressed rate, repayments would be over 50% of gross income.';
  else if (dsrStress >= 30) verdict = '\u26A0\uFE0F Caution. Repayments are manageable now, but a ' + bufferPct + '% rate rise would push you into mortgage stress territory (>30% of income).';
  else if (dsrCurrent >= 30) verdict = 'You are currently in mortgage stress territory (>30% of gross income). A rate rise would make this significantly harder.';
  else if (dsrStress < 25) verdict = '\u2713 Comfortable. Even with a ' + bufferPct + '% rate rise you remain well within the 30% threshold.';
  else verdict = '\u2713 Manageable. Repayments are within guidelines, with reasonable buffer against rate rises.';

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
  if (!_isInit) {
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
    var el = document.getElementById('rate');
    if (el && el.value === '6.25') { // only replace default, not user-set values
      el.value = d.suggestedRate;
    }
    var badge = document.getElementById('rate-live-badge');
    var hint  = document.getElementById('rate-live-hint');
    if (badge) badge.style.display = '';
    if (hint)  hint.textContent = 'RBA cash rate ' + d.cashRate.toFixed(2) + '% + lender margin '
      + d.lenderMargin.toFixed(2) + '% = ' + d.suggestedRate.toFixed(2) + '% suggested'
      + (d.rateDate ? ' (as of ' + d.rateDate + ')' : '');
    if (hint) hint.style.display = '';
  });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'mortgage-stress',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the full property purchase',
    description: 'Model equity buildup, offset account impact, and compare properties side by side \u2014 all free in EquitySight.',
    buttonText: 'Get started free \u2192',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE6', title: 'Interest Rates & Policy',
        links: [
          { text: 'Reserve Bank of Australia (RBA)', href: 'https://www.rba.gov.au/' },
          { text: 'RBA: Housing & Mortgages', href: 'https://www.rba.gov.au/education/resources/explainers/' },
          { text: 'APRA: Prudential Regulation', href: 'https://www.apra.gov.au/' },
          { text: 'MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Borrowing Capacity',
        links: [
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ASIC: Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'ASIC: Borrowing Guidance', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '\uD83D\uDCCA', title: 'Financial Management',
        links: [
          { text: 'ASIC: Budgeting Tools', href: 'https://moneysmart.gov.au/budgeting' },
          { text: 'MoneySmart: Money Management', href: 'https://moneysmart.gov.au/' },
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
    { href: '/tools', text: 'All Calculators' },
    { href: '/tools/borrowing-power-calculator', text: 'Borrowing Power' },
    { href: '/tools/mortgage-repayment-calculator', text: 'Repayment' },
    { href: '/privacy', text: 'Privacy' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power Calculator' },
    { group: 'Other Tools', icon: '💳', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Other Tools', icon: '⚖️', href: '/tools/interest-only-vs-principal-calculator', label: 'Interest Only vs P&I' },
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'How we calculate (methodology)' }
  ]
});

var _isInit = true;
if(window.trackCalculatorStart) trackCalculatorStart('mortgage-stress');
calculate();
_isInit = false;
['loan','income','expenses'].forEach(function(id) {
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){ fmtInput(this); });
});
var calcBtn = document.getElementById('stress-calc-btn');
if(calcBtn) calcBtn.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'mortgage-stress'});
  calculate();
});

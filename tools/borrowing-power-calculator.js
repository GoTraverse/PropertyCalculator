/* ═══ BORROWING POWER CALCULATOR ═══ */

function approxTax(gross) {
  // Simplified 2026 resident individual tax scale (Stage 3 post-adjustments, rounded).
  var tax = 0;
  if (gross <= 18200) tax = 0;
  else if (gross <= 45000) tax = (gross - 18200) * 0.16;
  else if (gross <= 135000) tax = 4288 + (gross - 45000) * 0.30;
  else if (gross <= 190000) tax = 31288 + (gross - 135000) * 0.37;
  else tax = 51638 + (gross - 190000) * 0.45;
  // Medicare levy (2%) for simplicity
  if (gross > 27222) tax += gross * 0.02;
  return tax;
}

function maxLoanFromRepayment(monthlyBudget, annualRate, years) {
  // Invert the amortisation formula to solve for principal.
  if (monthlyBudget <= 0) return 0;
  var r = annualRate / 100 / 12;
  var n = years * 12;
  if (r === 0) return monthlyBudget * n;
  return monthlyBudget * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
}

function calc() {
  var gross = parseVal('income');
  var expenses = parseVal('expenses');
  var debts = parseVal('debts');
  var deps = parseInt(document.getElementById('deps').value) || 0;
  var rate = parseFloat(document.getElementById('rate').value) || 0;
  var term = parseInt(document.getElementById('term').value) || 30;

  if (!gross || term <= 0) {
    setText('r-loan', '—');
    setText('r-assess', '—');
    setText('r-actual', '—');
    setText('r-net', '—');
    setText('r-buffer', '—');
    setText('r-price', '—');
    return;
  }

  var net = gross - approxTax(gross);
  var netMonthly = net / 12;

  // HEM floor roughly $2,200 single + $800 per dependant (indicative)
  var hemFloor = 2200 + deps * 800;
  var effectiveExpenses = Math.max(expenses, hemFloor);

  var available = netMonthly - effectiveExpenses - debts;

  // APRA 3% serviceability buffer
  var assessRate = rate + 3;
  var maxLoan = maxLoanFromRepayment(available, assessRate, term);
  if (maxLoan < 0) maxLoan = 0;

  var assessMonthly = monthlyRepayment(maxLoan, assessRate, term, false);
  var actualMonthly = monthlyRepayment(maxLoan, rate, term, false);
  var propertyPrice = maxLoan / 0.8; // Assume 80% LVR

  setText('r-loan', fmt(maxLoan));
  setText('r-assess', fmt(assessMonthly));
  setText('r-actual', fmt(actualMonthly));
  setText('r-net', fmt(netMonthly));
  setText('r-buffer', assessRate.toFixed(2) + '%');
  setText('r-price', fmt(propertyPrice));

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'borrowing-power',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Compare multiple purchase scenarios side-by-side',
    description: 'Test different deposits, rates, and properties — with long-term equity, cashflow, and tax impact — free in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Lending Standards',
        links: [
          { text: 'APRA: Prudential Practice Guide APG 223', href: 'https://www.apra.gov.au/sites/default/files/apg_223.pdf' },
          { text: 'APRA: Serviceability Buffer', href: 'https://www.apra.gov.au/' },
          { text: 'ASIC MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '💳', title: 'Debt & Living Expenses',
        links: [
          { text: 'ASIC: Managing Debt', href: 'https://moneysmart.gov.au/managing-debt' },
          { text: 'ATO: HECS/HELP Repayments', href: 'https://www.ato.gov.au/individuals/study-and-training-support-loans/' },
          { text: 'Melbourne Institute: HEM', href: 'https://melbourneinstitute.unimelb.edu.au/research/hem' }
        ]
      }
    ],
    disclaimer: 'Indicative only. Lenders apply different Household Expenditure Measure (HEM) benchmarks, credit scoring and negative gearing allowances. Get pre-approval for an accurate figure.'
  },
  share: {
    url: 'https://equitysight.app/tools/borrowing-power-calculator',
    text: 'Just calculated how much I can borrow for a home!'
  },
  related: [
    { href: '/tools/loan-serviceability-calculator', icon: '📊', label: 'Loan Serviceability' },
    { href: '/tools/mortgage-repayment-calculator', icon: '🏦', label: 'Mortgage Repayment' },
    { href: '/tools/deposit-calculator', icon: '💵', label: 'Deposit Calculator' },
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/tools/mortgage-repayment-calculator', text: 'Mortgage Repayment' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Single on $85,000 with no dependants',
      inputs: [
        { k: 'Gross income', v: '$85,000' },
        { k: 'Monthly expenses', v: '$2,800' },
        { k: 'Other debts', v: '$0' },
        { k: 'Rate', v: '6.25% (assess 9.25%)' }
      ],
      outputs: [
        { k: 'Max loan', v: '~$410,000' },
        { k: 'Indicative property', v: '~$512,000 at 80% LVR' }
      ]
    },
    {
      label: 'Couple on $180,000 combined with 2 kids',
      inputs: [
        { k: 'Gross income', v: '$180,000' },
        { k: 'Monthly expenses', v: '$5,200' },
        { k: 'Other debts', v: '$600' },
        { k: 'Dependants', v: '2' }
      ],
      outputs: [
        { k: 'Max loan', v: '~$760,000' },
        { k: 'Indicative property', v: '~$950,000 at 80% LVR' }
      ]
    },
    {
      label: 'Couple on $250,000 combined, no kids, $10k credit card limit',
      inputs: [
        { k: 'Gross income', v: '$250,000' },
        { k: 'Monthly expenses', v: '$6,000' },
        { k: 'Other debts', v: '$300 (card)' }
      ],
      outputs: [
        { k: 'Max loan', v: '~$1,180,000' },
        { k: 'Indicative property', v: '~$1,475,000 at 80% LVR' }
      ]
    }
  ],
  faq: [
    { q: 'Why does the bank test my loan at a rate 3% higher than offered?',
      a: 'APRA (the banking regulator) requires lenders to apply a serviceability buffer — currently 3% above the actual rate — to make sure you can still afford repayments if rates rise. This single rule typically reduces borrowing power by 20–30%.' },
    { q: 'Does a credit card limit affect my borrowing power even if I pay it off each month?',
      a: 'Yes. Banks assess your card limit at roughly 3% per month of the full limit, regardless of whether you carry a balance. A $20,000 limit reduces your borrowing power by around $60,000–$80,000. Reduce or close unused cards before applying.' },
    { q: 'How does HECS/HELP debt affect borrowing power?',
      a: 'HECS is treated as an ongoing commitment based on your income tier (4–10% of gross). On a $100,000 income, a HECS debt of any size reduces your monthly available income by ~$550, which translates to about $80,000 less borrowing power.' },
    { q: 'What is HEM and why do lenders use it?',
      a: 'The Household Expenditure Measure is a benchmark of minimum reasonable living expenses (food, transport, utilities, etc.) produced by the Melbourne Institute. Lenders use whichever is higher — your declared expenses or HEM — to prevent understated spending.' },
    { q: 'Can I borrow more by extending the loan term to 40 years?',
      a: 'Marginally. A 40-year term vs 30 years increases borrowing power by about 8–10% but costs substantially more interest over the life of the loan. Most lenders cap at 30 years for owner-occupiers; only a few offer 35–40.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Other Tools', icon: '💵', href: '/tools/deposit-calculator', label: 'Deposit Calculator' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/chermside/', label: 'Chermside QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' }
  ]
});

if (window.trackCalculatorStart) trackCalculatorStart('borrowing-power');
calc();

['income','expenses','debts'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
['deps','rate','term'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', calc);
});
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'borrowing-power'});
  calc();
});

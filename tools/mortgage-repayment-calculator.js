/* ═══ MORTGAGE REPAYMENT CALCULATOR ═══ */

function calc() {
  var amount = parseVal('amount');
  var rate = parseFloat(document.getElementById('rate').value) || 0;
  var term = parseInt(document.getElementById('term').value) || 30;
  var type = document.getElementById('type').value;

  if (!amount || term <= 0) {
    setText('r-monthly', '—');
    setText('r-fortnightly', '—');
    setText('r-weekly', '—');
    setText('r-interest', '—');
    setText('r-total', '—');
    return;
  }

  var monthly = monthlyRepayment(amount, rate, term, type === 'io');
  var totalRepaid, totalInterest;
  if (type === 'io') {
    var ioMonthly = monthly;
    // Assume full term is interest-only for total interest calc (worst case)
    totalInterest = ioMonthly * term * 12;
    totalRepaid = amount + totalInterest;
  } else {
    totalRepaid = monthly * term * 12;
    totalInterest = totalRepaid - amount;
  }

  setText('r-monthly', fmt(monthly));
  setText('r-fortnightly', fmt(monthly / 2));
  setText('r-weekly', fmt(monthly / 4));
  setText('r-interest', fmt(totalInterest));
  setText('r-total', fmt(totalRepaid));

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'mortgage-repayment',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full property investment',
    description: 'Add rental income, scenario comparisons, and 30-year projections — free in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Official Lending Guidance',
        links: [
          { text: 'ASIC MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ASIC: Mortgage Calculator', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'RBA: Cash Rate History', href: 'https://www.rba.gov.au/statistics/cash-rate/' },
          { text: 'APRA: Prudential Standards', href: 'https://www.apra.gov.au/' }
        ]
      },
      {
        icon: '💰', title: 'Interest & Rates',
        links: [
          { text: 'RBA: How Monetary Policy Works', href: 'https://www.rba.gov.au/education/resources/explainers/how-monetary-policy-works.html' },
          { text: 'ASIC: Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'ASIC: Fixed vs Variable Rates', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' }
        ]
      }
    ],
    disclaimer: 'Estimates only. Actual repayments depend on your lender, fees, and rate changes.'
  },
  share: {
    url: 'https://equitysight.app/tools/mortgage-repayment-calculator',
    text: 'Just calculated my home loan repayments!'
  },
  related: [
    { href: '/tools/loan-serviceability-calculator', icon: '📊', label: 'Loan Serviceability' },
    { href: '/tools/borrowing-power-calculator', icon: '🏦', label: 'Borrowing Power' },
    { href: '/tools/interest-only-vs-principal-calculator', icon: '⚖️', label: 'IO vs P&I' },
    { href: '/tools/deposit-calculator', icon: '💵', label: 'Deposit Calculator' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: '$600,000 loan over 30 years at 6.25%',
      inputs: [
        { k: 'Loan amount', v: '$600,000' },
        { k: 'Interest rate', v: '6.25%' },
        { k: 'Term', v: '30 years' },
        { k: 'Type', v: 'Principal + Interest' }
      ],
      outputs: [
        { k: 'Monthly repayment', v: '~$3,694' },
        { k: 'Total interest paid', v: '~$730,000' }
      ]
    },
    {
      label: '$850,000 loan over 30 years at 5.99%',
      inputs: [
        { k: 'Loan amount', v: '$850,000' },
        { k: 'Interest rate', v: '5.99%' },
        { k: 'Term', v: '30 years' },
        { k: 'Type', v: 'Principal + Interest' }
      ],
      outputs: [
        { k: 'Monthly repayment', v: '~$5,091' },
        { k: 'Fortnightly', v: '~$2,546' },
        { k: 'Total interest paid', v: '~$983,000' }
      ]
    },
    {
      label: '$400,000 interest-only for 5 years at 6.75%',
      inputs: [
        { k: 'Loan amount', v: '$400,000' },
        { k: 'Interest rate', v: '6.75%' },
        { k: 'Term', v: '5 years (IO)' }
      ],
      outputs: [
        { k: 'Monthly repayment', v: '$2,250' },
        { k: 'Total interest (5 yrs)', v: '$135,000' }
      ]
    }
  ],
  faq: [
    { q: 'Weekly, fortnightly, or monthly — which is best?',
      a: 'Fortnightly repayments save the most interest because you end up making an extra month of repayments per year (26 fortnights of half-monthly ≈ 13 monthly). Most lenders allow you to switch at no cost.' },
    { q: 'How much difference does 0.25% make to repayments?',
      a: 'On a $600,000 30-year loan, a 0.25% rate change shifts your monthly repayment by roughly $95. Over 30 years that’s around $34,000 of total interest.' },
    { q: 'Should I make extra repayments?',
      a: 'Yes if your loan allows them without penalty. Even $100/month extra on a $500,000 loan can save 3+ years and $70,000+ in interest over a 30-year term.' },
    { q: 'What is an offset account?',
      a: 'An offset is a transaction account linked to your loan. The balance reduces the loan amount on which interest is calculated. Keeping $20,000 in an offset on a $500,000 loan saves interest on $480,000 — effectively tax-free savings at your mortgage rate.' },
    { q: 'Fixed or variable rate?',
      a: 'Variable rates move with the RBA cash rate. Fixed rates lock in a rate for 1–5 years. Split loans (part fixed, part variable) give you both certainty and flexibility. Choose based on your risk tolerance and the current rate cycle.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '⚖️', href: '/tools/interest-only-vs-principal-calculator', label: 'Interest Only vs P&I' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/chermside/', label: 'Chermside QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/coorparoo/', label: 'Coorparoo QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '📖', href: '/methodology.html', label: 'Our Methodology' }
  ]
});

if (window.trackCalculatorStart) trackCalculatorStart('mortgage-repayment');
calc();

['amount'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
['rate','term'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', calc);
});
var typeEl = document.getElementById('type');
if (typeEl) typeEl.addEventListener('change', calc);
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'mortgage-repayment'});
  calc();
});

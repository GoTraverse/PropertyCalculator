/* ═══ INTEREST ONLY vs PRINCIPAL + INTEREST CALCULATOR ═══ */

function calc() {
  var amount = parseVal('amount');
  var ratePI = parseFloat(document.getElementById('rate-pi').value) || 0;
  var rateIO = parseFloat(document.getElementById('rate-io').value) || 0;
  var ioYears = parseInt(document.getElementById('io-years').value) || 0;
  var term = parseInt(document.getElementById('term').value) || 30;

  var msgEl = document.getElementById('calc-msg');
  function showMsg(text) {
    ['r-io-monthly','r-pi-monthly','r-io-revert','r-saving','r-io-total','r-pi-total','r-extra'].forEach(function (id) { setText(id, '—'); });
    if (msgEl) { msgEl.textContent = text; msgEl.hidden = false; }
  }
  if (!amount || amount <= 0) { showMsg('Enter a loan amount to compare.'); return; }
  if (term <= 0) { showMsg('Enter a loan term (in years).'); return; }
  if (ioYears >= term) { showMsg('The interest-only period must be shorter than the loan term.'); return; }
  if (msgEl) msgEl.hidden = true;

  // P&I path — full term amortisation
  var piMonthly = monthlyRepayment(amount, ratePI, term, false);
  var piTotalInterest = piMonthly * term * 12 - amount;

  // IO path — IO payments during IO period, then P&I for remainder at IO rate
  var ioMonthly = monthlyRepayment(amount, rateIO, term, true);
  var remainingYears = term - ioYears;
  var revertMonthly = monthlyRepayment(amount, rateIO, remainingYears, false);

  var ioInterestDuringIO = ioMonthly * ioYears * 12;
  var ioInterestAfter = revertMonthly * remainingYears * 12 - amount;
  var ioTotalInterest = ioInterestDuringIO + ioInterestAfter;

  var saving = piMonthly - ioMonthly;
  var extra = ioTotalInterest - piTotalInterest;

  setText('r-io-monthly', fmt(ioMonthly));
  setText('r-pi-monthly', fmt(piMonthly));
  setText('r-io-revert', fmt(revertMonthly));
  setText('r-saving', fmt(saving));
  setText('r-io-total', fmt(ioTotalInterest));
  setText('r-pi-total', fmt(piTotalInterest));
  setText('r-extra', fmt(extra));

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'io-vs-pi',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Plan the full purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Lending Guidance',
        links: [
          { text: 'APRA: Interest-Only Lending', href: 'https://www.apra.gov.au/' },
          { text: 'ASIC MoneySmart: Interest Only Loans', href: 'https://moneysmart.gov.au/home-loans/interest-only-home-loans' },
          { text: 'ASIC MoneySmart: Mortgage Calculator', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' }
        ]
      },
      {
        icon: '📊', title: 'Investor Tax',
        links: [
          { text: 'ATO: Rental Property Interest', href: 'https://www.ato.gov.au/individuals/investments-and-assets/residential-rental-properties/rental-property-expenses/interest-expenses/' },
          { text: 'ATO: Negative Gearing', href: 'https://www.ato.gov.au/' }
        ]
      }
    ],
    disclaimer: 'Estimates only. Assumes IO reverts to P&I at the same IO rate. Real lender behaviour, re-negotiation and refinancing change outcomes substantially.'
  },
  share: {
    url: 'https://equitysight.app/tools/interest-only-vs-principal-calculator',
    text: 'Just compared Interest Only vs P&I on my home loan!'
  },
  related: [
    { href: '/tools/mortgage-repayment-calculator', icon: '📊', label: 'Mortgage Repayment' },
    { href: '/tools/borrowing-power-calculator', icon: '🏦', label: 'Borrowing Power' },
    { href: '/tools/rental-yield-calculator', icon: '📈', label: 'Rental Yield' },
    { href: '/tools/capital-gains-calculator', icon: '🏛️', label: 'Capital Gains Tax' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/mortgage-repayment-calculator', text: 'Mortgage Repayment' },
    { href: '/tools/borrowing-power-calculator', text: 'Borrowing Power' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: '$600,000 investor loan, 5 years IO then revert',
      inputs: [
        { k: 'Loan amount', v: '$600,000' },
        { k: 'P&I rate', v: '6.25%' },
        { k: 'IO rate', v: '6.60%' },
        { k: 'IO period', v: '5 years' },
        { k: 'Total term', v: '30 years' }
      ],
      outputs: [
        { k: 'IO monthly (5 yr period)', v: '~$3,300' },
        { k: 'P&I monthly', v: '~$3,694' },
        { k: 'Extra interest vs P&I', v: '~$60,000+' }
      ]
    },
    {
      label: '$850,000 loan, 3 years IO',
      inputs: [
        { k: 'Loan amount', v: '$850,000' },
        { k: 'P&I rate', v: '5.99%' },
        { k: 'IO rate', v: '6.25%' },
        { k: 'IO period', v: '3 years' }
      ],
      outputs: [
        { k: 'IO monthly', v: '~$4,427' },
        { k: 'P&I monthly', v: '~$5,091' },
        { k: 'Cash-flow saving/month', v: '~$664' }
      ]
    },
    {
      label: '$400,000 owner-occupier 2-year IO bridge',
      inputs: [
        { k: 'Loan amount', v: '$400,000' },
        { k: 'P&I rate', v: '6.10%' },
        { k: 'IO rate', v: '6.35%' },
        { k: 'IO period', v: '2 years' }
      ],
      outputs: [
        { k: 'IO monthly', v: '~$2,117' },
        { k: 'P&I monthly', v: '~$2,423' },
        { k: 'Extra interest (IO path)', v: '~$18,000' }
      ]
    }
  ],
  faq: [
    { q: 'Why is the IO rate higher than the P&I rate?',
      a: 'APRA classifies IO loans as higher-risk (no amortisation buffer if values fall), so lenders add a premium — typically 0.15–0.40% — on top of the P&I rate. The gap is larger for investors than owner-occupiers.' },
    { q: 'Can I extend the IO period beyond 5 years?',
      a: 'Investors can usually get up to 10 years of IO (sometimes split across multiple renewals). Owner-occupiers are typically capped at 5 years. Each extension requires a new serviceability assessment.' },
    { q: 'What happens when the IO period ends?',
      a: 'The loan reverts to P&I over the remaining term. Because you have fewer years to amortise the full principal, repayments can jump 30–50%. This is called "payment shock." Plan for it — or refinance before it happens.' },
    { q: 'Is IO a tax advantage for investors?',
      a: 'IO maximises deductible interest expenses against rental income (and other income if negatively geared). But it does not create a tax deduction out of thin air — you still pay the interest. IO is mainly a cash-flow and portfolio-leverage play, not a tax trick.' },
    { q: 'Should owner-occupiers ever choose IO?',
      a: 'Rarely. IO can help during temporary income drops (parental leave, redundancy), construction periods, or bridging purchases. Beyond those, P&I almost always wins because you\'re building equity and paying less interest over time.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '📊', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '📈', href: '/tools/rental-yield-calculator', label: 'Rental Yield' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/capital-gains-calculator', label: 'Capital Gains Tax' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' }
  ]
});

if (window.trackCalculatorStart) trackCalculatorStart('io-vs-pi');
calc();

['amount'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
['rate-pi','rate-io','io-years','term'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', calc);
});
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'io-vs-pi'});
  calc();
});

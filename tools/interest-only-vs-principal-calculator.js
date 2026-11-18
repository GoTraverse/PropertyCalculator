/* ═══ INTEREST ONLY vs PRINCIPAL + INTEREST CALCULATOR ═══ */

function calc() {
  var amount = parseVal('amount');
  var ratePI = parseFloat(document.getElementById('rate-pi').value);
  var rateIO = parseFloat(document.getElementById('rate-io').value);
  var ioYears = parseInt(document.getElementById('io-years').value, 10) || 0;
  var term = parseInt(document.getElementById('term').value, 10);

  var msgEl = document.getElementById('calc-msg');
  function showMsg(text) {
    ['r-io-monthly','r-pi-monthly','r-io-revert','r-saving','r-io-total','r-pi-total','r-extra'].forEach(function (id) { setText(id, '—'); });
    if (msgEl) { msgEl.textContent = text; msgEl.hidden = false; }
  }
  if (!amount || amount <= 0) { showMsg('Enter a loan amount to compare.'); return; }
  // Blank or invalid inputs stop here instead of being replaced by a default.
  if (!(term > 0)) { showMsg('Enter a loan term (in years).'); return; }
  if (!(ratePI >= 0) || !(rateIO >= 0)) { showMsg('Enter both interest rates (0 or more).'); return; }
  if (ioYears < 0) { showMsg('The interest-only period can\'t be negative.'); return; }
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
    title: 'Buying a first home',
    description: 'The First Home Journey compares the government schemes using your savings and income, then builds a budget that includes stamp duty and the other upfront costs.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Interest-only loans',
        links: [
          { text: 'ASIC Moneysmart: interest-only home loans', href: 'https://moneysmart.gov.au/home-loans/interest-only-home-loans' },
          { text: 'ASIC Moneysmart: mortgage calculator', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' }
        ]
      },
      {
        icon: '📊', title: 'Tax for investors',
        links: [
          { text: 'ATO: interest expenses on a rental property', href: 'https://www.ato.gov.au/individuals/investments-and-assets/residential-rental-properties/rental-property-expenses/interest-expenses/' },
        ]
      }
    ],
    disclaimer: ''
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
        { k: 'IO monthly, first 5 years', v: '$3,300' },
        { k: 'P&I monthly', v: '$3,694' },
        { k: 'IO monthly after reverting to P&I', v: '$4,089' },
        { k: 'Extra interest vs P&I', v: '$94,695' }
      ]
    },
    {
      label: '$850,000 loan, 3 years IO',
      inputs: [
        { k: 'Loan amount', v: '$850,000' },
        { k: 'P&I rate', v: '5.99%' },
        { k: 'IO rate', v: '6.25%' },
        { k: 'IO period', v: '3 years' },
        { k: 'Total term', v: '30 years' }
      ],
      outputs: [
        { k: 'IO monthly', v: '$4,427' },
        { k: 'P&I monthly', v: '$5,091' },
        { k: 'Cash-flow saving a month', v: '$664' },
        { k: 'Extra interest vs P&I', v: '$88,401' }
      ]
    },
    {
      label: '$400,000 owner-occupier loan, 2 years IO',
      inputs: [
        { k: 'Loan amount', v: '$400,000' },
        { k: 'P&I rate', v: '6.10%' },
        { k: 'IO rate', v: '6.35%' },
        { k: 'IO period', v: '2 years' },
        { k: 'Total term', v: '30 years' }
      ],
      outputs: [
        { k: 'IO monthly', v: '$2,117' },
        { k: 'P&I monthly', v: '$2,424' },
        { k: 'Extra interest (IO path)', v: '$34,797' }
      ]
    }
  ],
  faq: [
    { q: 'Why is the IO rate higher than the P&I rate?',
      a: 'APRA treats IO loans as higher risk because the balance isn\'t being paid down, which leaves less of a buffer if values fall. Lenders add a premium to the P&I rate, usually 0.15–0.40%, and the gap is larger for investors than for owner-occupiers.' },
    { q: 'Can I extend the IO period beyond 5 years?',
      a: 'Investors can usually get up to 10 years of IO, sometimes split across more than one renewal. Owner-occupiers are generally capped at 5 years. Each extension is a new credit decision with a new serviceability assessment, so approval isn\'t automatic.' },
    { q: 'What happens when the IO period ends?',
      a: 'The loan reverts to P&I over the remaining term. The full principal has to be repaid in fewer years, so the repayment rises. A $600,000 30-year loan at 6.60% with 5 years of IO goes from $3,300 to $4,089 a month, a 24% rise. A longer IO period or a shorter remaining term makes the rise bigger.' },
    { q: 'Is the interest on an IO loan tax-deductible?',
      a: 'On an investment property the interest is generally deductible whether the loan is IO or P&I. Principal repayments are never deductible. On your own home, neither is.' }
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

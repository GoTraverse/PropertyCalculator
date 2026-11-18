/* ═══ CAPITAL GAINS TAX CALCULATOR ═══ */

function calcTax(taxable) {
  // FY2026-27 resident individual tax scale including Medicare levy.
  // Brackets per ATO (second rate cut 16% → 15% from 1 Jul 2026); AUD.
  var tax = 0;
  if (taxable <= 18200) tax = 0;
  else if (taxable <= 45000) tax = (taxable - 18200) * 0.15;
  else if (taxable <= 135000) tax = 4020 + (taxable - 45000) * 0.30;
  else if (taxable <= 190000) tax = 31020 + (taxable - 135000) * 0.37;
  else tax = 51370 + (taxable - 190000) * 0.45;
  // Medicare levy: 0% below $28,011; sliding 10% of excess in $28,011-$35,013
  // shading-in band; flat 2% of taxable above $35,013 (singles). FY2025-26
  // thresholds (latest published; 2026-27 legislated retrospectively each year).
  if (taxable > 35013) tax += taxable * 0.02;
  else if (taxable > 28011) tax += (taxable - 28011) * 0.10;
  return tax;
}

function calc() {
  var sale = parseVal('sale');
  var purchase = parseVal('purchase');
  var costs = parseVal('costs');
  var improvements = parseVal('improvements');
  var income = parseVal('income');
  var held = document.getElementById('held').value === 'yes';
  var ppor = document.getElementById('ppor').checked;

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  if (!sale || !purchase) {
    _showErr('Enter the sale price and the purchase price.');
    setText('r-cgt', '—');
    setText('r-gross', '—');
    setText('r-costbase', '—');
    setText('r-discount', '—');
    setText('r-newincome', '—');
    setText('r-net', '—');
    return;
  }

  var costBase = purchase + costs + improvements;
  var rawGain = sale - costBase;          // negative = sold below cost base
  var grossGain = Math.max(0, rawGain);

  if (ppor) {
    setText('r-cgt', '$0 (main residence exempt)');
    setText('r-gross', rawGain < 0 ? fmt(rawGain) + ' (a loss)' : fmt(grossGain));
    setText('r-costbase', fmt(costBase));
    setText('r-discount', '—');
    setText('r-newincome', fmt(income));
    setText('r-net', fmt(rawGain));
    var cta = document.getElementById('cta');
    if (cta) cta.style.display = 'block';
    return;
  }

  // Sold below the cost base: show the loss instead of a $0 "gain". A capital
  // loss creates no CGT and cannot reduce other income; it offsets capital
  // gains now or in later years, which this calculator does not model.
  if (rawGain < 0) {
    setText('r-cgt', '$0 (capital loss)');
    setText('r-gross', fmt(rawGain) + ' (capital loss)');
    setText('r-costbase', fmt(costBase));
    setText('r-discount', '—');
    setText('r-newincome', fmt(income));
    setText('r-net', fmt(rawGain));
    var ctaL = document.getElementById('cta');
    if (ctaL) ctaL.style.display = 'block';
    return;
  }

  var discountedGain = held ? grossGain * 0.5 : grossGain;
  var newIncome = income + discountedGain;

  var taxBefore = calcTax(income);
  var taxAfter = calcTax(newIncome);
  var cgt = taxAfter - taxBefore;

  var netProceeds = grossGain - cgt; // net GAIN after tax (sale − cost base − CGT), not sale proceeds

  setText('r-cgt', fmt(cgt));
  setText('r-gross', fmt(grossGain));
  setText('r-costbase', fmt(costBase));
  setText('r-discount', fmt(discountedGain));
  setText('r-newincome', fmt(newIncome));
  setText('r-net', fmt(netProceeds));

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'capital-gains',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Costs while you hold the property',
    description: 'The land tax, property cash flow and rental yield calculators cover the years before you sell.',
    buttonText: 'See all 18 calculators',
    buttonHref: '/tools/'
  },
  resources: {
    groups: [
      {
        icon: '🏛️', title: 'ATO on capital gains tax',
        links: [
          { text: 'Capital gains tax', href: 'https://www.ato.gov.au/individuals/capital-gains-tax/' },
          { text: 'Property and capital gains tax', href: 'https://www.ato.gov.au/individuals/capital-gains-tax/property-and-capital-gains-tax/' },
          { text: 'Your main residence', href: 'https://www.ato.gov.au/individuals/capital-gains-tax/property-and-capital-gains-tax/your-main-residence---home/' },
          { text: 'Individual income tax rates', href: 'https://www.ato.gov.au/rates/individual-income-tax-rates/' }
        ]
      },
      {
        icon: '📊', title: 'ATO on rental properties',
        links: [
          { text: 'Residential rental properties', href: 'https://www.ato.gov.au/individuals/investments-and-assets/residential-rental-properties/' },
          { text: 'Capital works deductions', href: 'https://www.ato.gov.au/individuals/investments-and-assets/residential-rental-properties/rental-property-expenses/capital-works-deductions/' }
        ]
      }
    ],
    disclaimer: ''
  },
  share: {
    url: 'https://equitysight.app/tools/capital-gains-calculator',
    text: 'Just calculated my capital gains tax on an Australian property sale!'
  },
  related: [
    { href: '/tools/rental-yield-calculator', icon: '📈', label: 'Rental Yield' },
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' },
    { href: '/tools/cost-of-purchase-calculator', icon: '💵', label: 'Cost of Purchase' },
    { href: '/tools/mortgage-repayment-calculator', icon: '🏦', label: 'Mortgage Repayment' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/rental-yield-calculator', text: 'Rental Yield' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Investor sells $900k property (bought $600k, held 5 years)',
      inputs: [
        { k: 'Sale price', v: '$900,000' },
        { k: 'Purchase price', v: '$600,000' },
        { k: 'Costs (buy + sell)', v: '$45,000' },
        { k: 'Other income', v: '$100,000' },
        { k: 'Held over 12 months', v: 'Yes' }
      ],
      outputs: [
        { k: 'Gross gain', v: '$255,000' },
        { k: 'Discounted gain', v: '$127,500' },
        { k: 'CGT payable', v: '$50,275 (includes Medicare levy)' },
        { k: 'Net gain after tax', v: '$204,725' }
      ]
    },
    {
      label: 'Flip sold within 9 months (no discount)',
      inputs: [
        { k: 'Sale price', v: '$820,000' },
        { k: 'Purchase price', v: '$700,000' },
        { k: 'Costs + reno', v: '$50,000' },
        { k: 'Other income', v: '$80,000' },
        { k: 'Held over 12 months', v: 'No' }
      ],
      outputs: [
        { k: 'Gross gain', v: '$70,000' },
        { k: 'CGT payable', v: '$23,450' },
        { k: 'Net gain after tax', v: '$46,550' }
      ]
    },
    {
      label: 'Main residence sold for $1.4M (bought $700k)',
      inputs: [
        { k: 'Sale price', v: '$1,400,000' },
        { k: 'Purchase price', v: '$700,000' },
        { k: 'Costs and improvements', v: '$0' },
        { k: 'Main residence', v: 'Yes' }
      ],
      outputs: [
        { k: 'CGT payable', v: '$0 (main residence exempt)' },
        { k: 'Net gain after tax', v: '$700,000' }
      ]
    }
  ],
  faq: [
    { q: 'When do I pay the CGT?',
      a: 'There is no separate CGT bill. The net gain is reported in your income tax return for the financial year the sale contract was signed, and it is assessed with the rest of your income for that year.' },
    { q: 'Can renovations reduce my CGT?',
      a: 'Yes. The cost of capital improvements is added to your cost base, which lowers the taxable gain. You need the invoices and receipts. Amounts already claimed as deductions, such as some capital works, may have to be taken back out of the cost base.' },
    { q: 'Do capital losses reduce my CGT?',
      a: 'Yes. Capital losses from other investments (shares, another property) can offset capital gains in the same year, and unused losses carry forward indefinitely. They can\'t reduce your salary or rental income. This calculator doesn\'t model losses.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '📈', href: '/tools/rental-yield-calculator', label: 'Rental Yield' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty' },
    { group: 'Other Tools', icon: '💵', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' }
  ]
});

if (window.trackCalculatorStart) trackCalculatorStart('capital-gains');
calc();

['sale','purchase','costs','improvements','income'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
['held','ppor'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', calc);
});
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'capital-gains'});
  calc();
});

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
    _showErr('Please enter both the sale price and the purchase price.');
    setText('r-cgt', '—');
    setText('r-gross', '—');
    setText('r-costbase', '—');
    setText('r-discount', '—');
    setText('r-newincome', '—');
    setText('r-net', '—');
    return;
  }

  var costBase = purchase + costs + improvements;
  var grossGain = Math.max(0, sale - costBase);

  if (ppor) {
    setText('r-cgt', '$0 (PPOR exempt)');
    setText('r-gross', fmt(grossGain));
    setText('r-costbase', fmt(costBase));
    setText('r-discount', '—');
    setText('r-newincome', fmt(income));
    setText('r-net', fmt(sale - costBase));
    var cta = document.getElementById('cta');
    if (cta) cta.style.display = 'block';
    return;
  }

  var discountedGain = held ? grossGain * 0.5 : grossGain;
  var newIncome = income + discountedGain;

  var taxBefore = calcTax(income);
  var taxAfter = calcTax(newIncome);
  var cgt = taxAfter - taxBefore;

  var netProceeds = grossGain - cgt;

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
    title: 'Model the tax impact across your entire portfolio',
    description: 'See CGT, depreciation, negative gearing, and net after-tax returns on every property — free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '🏛️', title: 'Official ATO Guidance',
        links: [
          { text: 'ATO: Capital Gains Tax', href: 'https://www.ato.gov.au/individuals/capital-gains-tax/' },
          { text: 'ATO: CGT on Real Estate', href: 'https://www.ato.gov.au/individuals/capital-gains-tax/property-and-capital-gains-tax/' },
          { text: 'ATO: Main Residence Exemption', href: 'https://www.ato.gov.au/individuals/capital-gains-tax/property-and-capital-gains-tax/your-main-residence---home/' },
          { text: 'ATO: Individual Tax Rates', href: 'https://www.ato.gov.au/rates/individual-income-tax-rates/' }
        ]
      },
      {
        icon: '📊', title: 'Property Tax Strategy',
        links: [
          { text: 'ATO: Rental Properties Guide', href: 'https://www.ato.gov.au/individuals/investments-and-assets/residential-rental-properties/' },
          { text: 'ATO: Capital Works Deductions', href: 'https://www.ato.gov.au/individuals/investments-and-assets/residential-rental-properties/rental-property-expenses/capital-works-deductions/' }
        ]
      }
    ],
    disclaimer: 'Simplified estimate. Your actual CGT depends on partial-year holding periods, offset losses, main-residence absences, and other ATO rules. This calculator applies current FY2026-27 law (50% discount); from 1 July 2027 legislated reforms (Treasury Laws Amendment (Tax Reform No. 1) Act 2026) replace the discount with cost-base indexation plus a 30% minimum tax rate on gains that accrue after that date. Always consult a registered tax agent.'
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
        { k: 'CGT payable', v: '~$50,300' }
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
        { k: 'CGT payable', v: '~$25,000' }
      ]
    },
    {
      label: 'Main residence sold for $1.4M (bought $700k)',
      inputs: [
        { k: 'Sale price', v: '$1,400,000' },
        { k: 'Purchase price', v: '$700,000' },
        { k: 'PPOR exemption', v: 'Yes' }
      ],
      outputs: [
        { k: 'CGT payable', v: '$0 (PPOR exempt)' },
        { k: 'Net proceeds', v: '$700,000' }
      ]
    }
  ],
  faq: [
    { q: 'How is capital gains tax calculated in Australia?',
      a: 'Sale price minus cost base (purchase + stamp duty + legal fees + capital improvements + selling costs) equals your gross gain. If held over 12 months, apply a 50% discount. Add the discounted gain to your taxable income and pay tax at your marginal rate.' },
    { q: 'Is my main residence (PPOR) exempt from CGT?',
      a: 'Yes, generally. Your principal place of residence is CGT-exempt if it was your home for the whole ownership period. Partial exemptions apply if you used part as a rental or home office, or lived away for extended periods.' },
    { q: 'What is the 6-year rule for rental properties?',
      a: 'If you move out of your main residence and rent it out, you can treat it as your PPOR for CGT purposes for up to 6 years while renting — provided you don\'t nominate another property as your PPOR. This can completely eliminate CGT.' },
    { q: 'Can I reduce CGT by timing the sale?',
      a: 'Yes. Because CGT is taxed at your marginal rate, selling in a low-income year (e.g. during retirement, parental leave, or a sabbatical) can drop you into lower brackets and dramatically reduce the tax bill.' },
    { q: 'Do capital losses reduce my CGT?',
      a: 'Yes. Capital losses from other investments (shares, another property) can offset capital gains in the same year. Unused losses carry forward indefinitely. Only capital losses — not ordinary income losses — can offset capital gains.' },
    { q: 'Is the 50% CGT discount changing?',
      a: 'Yes — from 1 July 2027. The 2026-27 Federal Budget reforms are now law (Treasury Laws Amendment (Tax Reform No. 1) Act 2026): for individuals, trusts and partnerships, the 50% CGT discount will be replaced by cost-base indexation plus a 30% minimum tax rate on gains that accrue after 1 July 2027. Gains accrued before that date keep the current treatment. This calculator applies current FY2026-27 law, so the 50% discount still applies in full to sales this financial year.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '📈', href: '/tools/rental-yield-calculator', label: 'Rental Yield' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty' },
    { group: 'Other Tools', icon: '💵', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
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

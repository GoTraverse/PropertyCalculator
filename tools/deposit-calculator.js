/* ═══ DEPOSIT CALCULATOR ═══ */

function stampDutyEstimate(price, state, fhb) {
  // Simplified tiered stamp duty estimate per state (2026 rates, owner-occupier).
  // FHB concessions are approximated — use the dedicated stamp duty calculator for exact figures.
  var rate;
  switch (state) {
    case 'NSW': rate = price <= 650000 ? 0 : (price <= 1500000 ? 0.035 : 0.045); break;
    case 'VIC': rate = price <= 600000 ? 0 : (price <= 1000000 ? 0.04 : 0.055); break;
    case 'QLD': rate = price <= 550000 ? 0 : (price <= 1000000 ? 0.03 : 0.045); break;
    case 'SA':  rate = price <= 650000 ? 0.03 : 0.05; break;
    case 'WA':  rate = price <= 530000 ? 0 : 0.04; break;
    case 'TAS': rate = price <= 500000 ? 0.025 : 0.04; break;
    case 'ACT': rate = price <= 700000 ? 0 : 0.045; break;
    case 'NT':  rate = price <= 650000 ? 0 : 0.05; break;
    default: rate = 0.04;
  }
  var duty = price * rate;
  if (fhb) {
    // FHB full exemption thresholds (simplified)
    if ((state === 'NSW' && price <= 800000) ||
        (state === 'VIC' && price <= 600000) ||
        (state === 'QLD' && price <= 700000) ||
        (state === 'WA'  && price <= 450000) ||
        (state === 'ACT' && price <= 1000000)) {
      duty = 0;
    } else {
      duty = duty * 0.5; // Partial concession approximation
    }
  }
  return duty;
}

function lmiEstimate(loanAmount, lvr) {
  // Rough LMI scale — varies by lender and LVR band. This is indicative only.
  if (lvr <= 80) return 0;
  if (lvr <= 85) return loanAmount * 0.009;
  if (lvr <= 90) return loanAmount * 0.018;
  if (lvr <= 95) return loanAmount * 0.035;
  return loanAmount * 0.045;
}

function calc() {
  var price = parseVal('price');
  var depPct = parseFloat(document.getElementById('dep-pct').value) || 20;
  var state = document.getElementById('state').value;
  var fhb = document.getElementById('fhb').checked;

  if (!price) {
    setText('r-total', '—');
    setText('r-deposit', '—');
    setText('r-stamp', '—');
    setText('r-legal', '—');
    setText('r-lmi', '—');
    setText('r-loan', '—');
    return;
  }

  var deposit = price * (depPct / 100);
  var loan = price - deposit;
  var lvr = (loan / price) * 100;
  var stamp = stampDutyEstimate(price, state, fhb);
  var legal = 2500; // Conveyancing + inspections (~$1500 + $1000 typical)
  var lmi = lmiEstimate(loan, lvr);
  var total = deposit + stamp + legal + lmi;

  setText('r-total', fmt(total));
  setText('r-deposit', fmt(deposit));
  setText('r-stamp', fmt(stamp));
  setText('r-legal', fmt(legal));
  setText('r-lmi', lmi > 0 ? fmt(lmi) : 'Not required');
  setText('r-loan', fmt(loan));

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'deposit',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full purchase — deposit, loan & 30-year projection',
    description: 'Stack grants, stamp duty, LMI, and long-term equity growth into one view — free in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '🏠', title: 'First Home Buyer Support',
        links: [
          { text: 'First Home Guarantee (Housing Australia)', href: 'https://www.housingaustralia.gov.au/support-buy-home/first-home-guarantee' },
          { text: 'ASIC MoneySmart: Saving for a Home', href: 'https://moneysmart.gov.au/saving/save-for-an-emergency-fund' },
          { text: 'First Home Super Saver Scheme', href: 'https://www.ato.gov.au/individuals/super/withdrawing-and-using-your-super/first-home-super-saver-scheme/' }
        ]
      },
      {
        icon: '💰', title: 'Lenders Mortgage Insurance',
        links: [
          { text: 'ASIC MoneySmart: LMI explained', href: 'https://moneysmart.gov.au/home-loans/lenders-mortgage-insurance' },
          { text: 'APRA: Prudential Standards', href: 'https://www.apra.gov.au/' }
        ]
      },
      {
        icon: '🏛️', title: 'State Stamp Duty Offices',
        links: [
          { text: 'Revenue NSW', href: 'https://www.revenue.nsw.gov.au/' },
          { text: 'SRO Victoria', href: 'https://www.sro.vic.gov.au/' },
          { text: 'QLD Office of State Revenue', href: 'https://qro.qld.gov.au/' }
        ]
      }
    ],
    disclaimer: 'Estimates only. LMI premiums vary by lender. Stamp duty thresholds and concessions change — confirm with your state revenue office.'
  },
  share: {
    url: 'https://equitysight.app/tools/deposit-calculator',
    text: 'Just worked out how much deposit I really need!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '🏠', label: 'First Home Buyer Grants' },
    { href: '/tools/borrowing-power-calculator', icon: '🏦', label: 'Borrowing Power' },
    { href: '/tools/mortgage-repayment-calculator', icon: '📊', label: 'Mortgage Repayment' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/first-home-buyer-grants-calculator', text: 'First Home Buyer Grants' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: '$650,000 first home in QLD with 10% deposit',
      inputs: [
        { k: 'Property price', v: '$650,000' },
        { k: 'Deposit', v: '10%' },
        { k: 'State', v: 'Queensland' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '~$77,000' },
        { k: 'Deposit portion', v: '$65,000' },
        { k: 'Stamp duty (FHB concession)', v: '~$0' },
        { k: 'LMI estimate', v: '~$10,500' }
      ]
    },
    {
      label: '$950,000 NSW investor purchase with 20% deposit',
      inputs: [
        { k: 'Property price', v: '$950,000' },
        { k: 'Deposit', v: '20%' },
        { k: 'State', v: 'NSW' },
        { k: 'First home buyer', v: 'No' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '~$228,000' },
        { k: 'Deposit portion', v: '$190,000' },
        { k: 'Stamp duty', v: '~$33,250' },
        { k: 'LMI estimate', v: 'Not required (20%)' }
      ]
    },
    {
      label: '$500,000 VIC property with 5% deposit (First Home Guarantee)',
      inputs: [
        { k: 'Property price', v: '$500,000' },
        { k: 'Deposit', v: '5%' },
        { k: 'State', v: 'Victoria' },
        { k: 'First home buyer', v: 'Yes' }
      ],
      outputs: [
        { k: 'Cash needed up-front', v: '~$27,500' },
        { k: 'Deposit portion', v: '$25,000' },
        { k: 'Stamp duty (FHB waived)', v: '$0' },
        { k: 'LMI (covered by FHG)', v: '$0' }
      ]
    }
  ],
  faq: [
    { q: 'How much deposit do I actually need to buy a home in Australia?',
      a: 'The standard is 20% of the purchase price to avoid Lenders Mortgage Insurance (LMI). You can buy with as little as 5% through the First Home Guarantee, or 10% with LMI paid. Remember to budget 3–5% extra for stamp duty, legals, and inspections.' },
    { q: 'What is Lenders Mortgage Insurance (LMI) and when do I pay it?',
      a: 'LMI is insurance the lender takes out (but you pay for) when your deposit is below 20%. It protects the lender if you default. Premiums range from $8,000 to $25,000+ depending on loan size and LVR. It\'s usually capitalised onto your loan.' },
    { q: 'Can I use my super for a deposit?',
      a: 'Yes — the First Home Super Saver Scheme lets eligible first home buyers release voluntary super contributions (plus earnings) to put toward a deposit. You can withdraw up to $50,000 of contributions, which are taxed concessionally.' },
    { q: 'Do parents\' guarantees reduce the deposit I need?',
      a: 'A family guarantee (parental guarantor loan) can reduce or eliminate the deposit by using the equity in a parent\'s home as additional security. This avoids LMI but ties the guarantor\'s property to your loan — seek legal advice first.' },
    { q: 'What upfront costs beyond the deposit should I budget for?',
      a: 'Stamp duty (the biggest — up to 6% of price depending on state), conveyancing ($1,000–$2,000), building/pest inspections ($500–$1,000), loan application fees ($0–$800), and moving costs. Budget 3–5% of the purchase price for these.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty' },
    { group: 'Other Tools', icon: '🏠', href: '/tools/first-home-buyer-grants-calculator', label: 'First Home Buyer Grants' },
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '📊', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' }
  ]
});

if (window.trackCalculatorStart) trackCalculatorStart('deposit');
calc();

['price'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
['dep-pct','state','fhb'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', calc);
});
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'deposit'});
  calc();
});

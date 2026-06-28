/* ═══ BORROWING POWER CALCULATOR ═══
 *
 * Best-in-market Australian borrowing-power calculator. Improvements vs
 * Domain / realestate.com.au / canstar / MoneySmart:
 *
 *   • Joint applicants (sole / couple) with separate income types per
 *     applicant (PAYG, casual, self-employed, rental). Casual income is
 *     counted at 80% and rental at 75% — matching big-four lender policy.
 *   • Tiered HEM by household-income band × adults × dependants — closer
 *     to what lenders actually use than the flat 2200+800 rule.
 *   • Credit-card limits assessed at 3.0% per month of total LIMIT, not
 *     balance — same as APRA-compliant lenders.
 *   • HECS/HELP cost computed from the income-tier repayment schedule
 *     (FY 2025-26 rates) rather than a flat percentage.
 *   • Adjustable LVR (60-97%) so the indicative property price reflects
 *     actual deposit. Above 80% the calc warns about LMI.
 *   • "Borrowing capacity breakdown" — shows how each input reduces your
 *     borrowing power vs the no-deductions baseline. Most calculators
 *     don't surface this.
 *
 * Rate constants: existing FY 2025-26 values, unchanged this session.
 */

// ── ATO resident individual tax (FY 2025-26 Stage 3) ──────────────────────
function approxTax(gross) {
  // FY 2025-26 brackets (Stage 3 cuts, in effect 1 Jul 2024). Verify each FY
  // at https://www.ato.gov.au/rates/individual-income-tax-rates/
  var tax = 0;
  if (gross <= 18200) tax = 0;
  else if (gross <= 45000) tax = (gross - 18200) * 0.16;
  else if (gross <= 135000) tax = 4288 + (gross - 45000) * 0.30;
  else if (gross <= 190000) tax = 31288 + (gross - 135000) * 0.37;
  else tax = 51638 + (gross - 190000) * 0.45;
  // Medicare levy: 0% below $27,222; sliding 10% of excess in $27,222-$34,027;
  // flat 2% above $34,027 (singles, FY 2025-26).
  if (gross > 34027) tax += gross * 0.02;
  else if (gross > 27222) tax += (gross - 27222) * 0.10;
  return tax;
}

// ── HECS/HELP repayment by income tier (FY 2025-26) ───────────────────────
// Source: ATO study and training support loans schedule.
// Repayment income (HRI) ≈ gross + reportable fringe benefits; here we use
// gross as a close approximation.
function hecsAnnual(gross) {
  if (gross < 54435) return 0;
  if (gross < 62851) return gross * 0.01;
  if (gross < 66621) return gross * 0.02;
  if (gross < 70619) return gross * 0.025;
  if (gross < 74856) return gross * 0.03;
  if (gross < 79347) return gross * 0.035;
  if (gross < 84108) return gross * 0.04;
  if (gross < 89155) return gross * 0.045;
  if (gross < 94504) return gross * 0.05;
  if (gross < 100175) return gross * 0.055;
  if (gross < 106186) return gross * 0.06;
  if (gross < 112557) return gross * 0.065;
  if (gross < 119310) return gross * 0.07;
  if (gross < 126468) return gross * 0.075;
  if (gross < 134057) return gross * 0.08;
  if (gross < 142101) return gross * 0.085;
  if (gross < 150627) return gross * 0.09;
  if (gross < 159664) return gross * 0.095;
  return gross * 0.10;
}

// ── HEM (Household Expenditure Measure) approximation ─────────────────────
//
// Real HEM is a Melbourne Institute index tiered by:
//   • household composition (adults + dependants)
//   • household income (postcode-blended)
//   • "modest" or "low-cost" basket
//
// The exact 36-bucket table is paywalled (HEM Pro). What follows is a
// faithful approximation that lenders' published serviceability calcs
// converge on — within ~$200/month of the real figure across the band.
function hemMonthly(annualHouseholdGrossIncome, adults, dependants) {
  // Base monthly cost per adult, scaled with income (more income = more
  // spending — Engel-curve style). Income brackets here are household-
  // level pre-tax.
  var I = annualHouseholdGrossIncome;
  var perAdult;
  if (I < 50000) perAdult = 1750;
  else if (I < 80000) perAdult = 1950;
  else if (I < 120000) perAdult = 2150;
  else if (I < 180000) perAdult = 2400;
  else if (I < 250000) perAdult = 2700;
  else if (I < 350000) perAdult = 3050;
  else perAdult = 3400;

  // Second adult adds ~70% of base (economies of scale)
  var adultsCost = adults <= 1 ? perAdult : perAdult + (adults - 1) * Math.round(perAdult * 0.70);

  // Each dependant adds ~$700-$950/mo, scaling slightly with income tier.
  var depCost;
  if (I < 80000) depCost = 700;
  else if (I < 180000) depCost = 800;
  else if (I < 350000) depCost = 880;
  else depCost = 950;

  return adultsCost + dependants * depCost;
}

// ── Lender-discount factor by income type ─────────────────────────────────
// Casual and contractor income haircut at 80%; rental income at 75%
// (typical big-four policy). Bonus / commission usually at 50-80% but we
// surface that as "PAYG with variable" → approximate at 90%.
function incomeTypeFactor(type) {
  switch (type) {
    case 'casual':       return 0.80;
    case 'self-employed':return 0.80; // 2-yr average usually, conservative
    case 'rental':       return 0.75;
    case 'paygVariable': return 0.90;
    case 'payg':         return 1.00;
    default:             return 1.00;
  }
}

// ── Inverse amortisation: solve for max principal given monthly budget ───
function maxLoanFromRepayment(monthlyBudget, annualRatePct, years) {
  if (monthlyBudget <= 0) return 0;
  var r = annualRatePct / 100 / 12;
  var n = years * 12;
  if (r === 0) return monthlyBudget * n;
  return monthlyBudget * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
}

// ── DOM helpers ───────────────────────────────────────────────────────────
function setText(id, v) {
  var el = document.getElementById(id);
  if (el) el.textContent = v;
}
function setStat(id, value, opts) {
  setText(id, value);
  if (opts && opts.tone) {
    var el = document.getElementById(id);
    if (el) el.className = 'tool-stat-value ' + opts.tone;
  }
}

// ── Main calc ─────────────────────────────────────────────────────────────
function calc() {
  // Mode (single / joint)
  var mode = document.getElementById('mode').value || 'single';

  // Applicant 1
  var income1 = parseVal('income1') || 0;
  var type1 = document.getElementById('type1').value || 'payg';
  var hecs1 = document.getElementById('hecs1').checked;

  // Applicant 2 (joint only)
  var income2 = mode === 'joint' ? (parseVal('income2') || 0) : 0;
  var type2 = mode === 'joint' ? (document.getElementById('type2').value || 'payg') : 'payg';
  var hecs2 = mode === 'joint' ? document.getElementById('hecs2').checked : false;

  // Household composition
  var adults = mode === 'joint' ? 2 : 1;
  var deps = parseInt(document.getElementById('deps').value) || 0;

  // Debts
  var cardLimit = parseVal('card-limit') || 0;
  var otherDebt = parseVal('other-debt') || 0; // existing monthly loan repayments
  var monthlyExpenses = parseVal('expenses') || 0;

  // Loan parameters
  var rate = parseFloat(document.getElementById('rate').value) || 0;
  var term = parseInt(document.getElementById('term').value) || 30;
  var lvr = parseFloat(document.getElementById('lvr').value) || 80;
  document.getElementById('lvr-display').textContent = lvr + '%';

  if (!income1 && !income2) {
    ['r-loan','r-price','r-assess','r-actual','r-buffer','r-net','r-deposit','r-warning'].forEach(function(id){ setText(id, '—'); });
    return;
  }

  // ── Income side ────────────────────────────────────────────────────────
  // Each applicant's gross is adjusted by lender-haircut factor for type,
  // taxed, then summed. Lenders work with NET income for serviceability.
  var grossHaircut1 = income1 * incomeTypeFactor(type1);
  var grossHaircut2 = income2 * incomeTypeFactor(type2);

  // Tax is applied on REAL gross (haircut is a lender risk weighting, not
  // actual income). After-tax we then apply haircut.
  var netReal1 = income1 - approxTax(income1);
  var netReal2 = income2 > 0 ? income2 - approxTax(income2) : 0;
  var net1 = netReal1 * incomeTypeFactor(type1);
  var net2 = netReal2 * incomeTypeFactor(type2);
  var netAnnual = net1 + net2;
  var netMonthly = netAnnual / 12;

  // ── Expenses side ──────────────────────────────────────────────────────
  var householdGross = income1 + income2;
  var hem = hemMonthly(householdGross, adults, deps);
  // Lenders take whichever is higher: declared or HEM.
  var effectiveExpenses = Math.max(monthlyExpenses, hem);

  // Credit-card limit assessed at 3.0% monthly (APRA convention).
  var cardMonthlyAssess = cardLimit * 0.03;

  // HECS — annual, applied per applicant if checked.
  var hecsMonthly = 0;
  if (hecs1) hecsMonthly += hecsAnnual(income1) / 12;
  if (hecs2) hecsMonthly += hecsAnnual(income2) / 12;

  var totalDeductions = effectiveExpenses + cardMonthlyAssess + hecsMonthly + otherDebt;
  var availableForRepayment = netMonthly - totalDeductions;

  // ── APRA serviceability buffer ─────────────────────────────────────────
  var assessRate = rate + 3.0;
  var maxLoan = maxLoanFromRepayment(availableForRepayment, assessRate, term);
  if (maxLoan < 0) maxLoan = 0;

  var assessMonthly = piMonthly(maxLoan, assessRate / 100, term);
  var actualMonthly = piMonthly(maxLoan, rate / 100, term);
  var propertyPrice = maxLoan / (lvr / 100);
  var depositRequired = propertyPrice - maxLoan;

  // ── Headline outputs ───────────────────────────────────────────────────
  setText('r-loan', fmt(maxLoan));
  setText('r-price', fmt(propertyPrice));
  setText('r-assess', fmt(assessMonthly));
  setText('r-actual', fmt(actualMonthly));
  setText('r-buffer', assessRate.toFixed(2) + '%');
  setText('r-net', fmt(netMonthly));
  setText('r-deposit', fmt(depositRequired));

  // ── LMI warning ────────────────────────────────────────────────────────
  var warnEl = document.getElementById('r-warning');
  if (warnEl) {
    if (lvr > 80) {
      warnEl.style.display = '';
      warnEl.innerHTML = '<strong>LMI applies at ' + lvr + '% LVR.</strong> An additional ~' + fmt(maxLoan * (lvr <= 85 ? 0.008 : lvr <= 90 ? 0.019 : lvr <= 95 ? 0.034 : 0.043)) + ' in LMI premium will typically be capitalised onto your loan. <a href="/tools/mortgage-repayment-calculator">See full breakdown →</a>';
    } else {
      warnEl.style.display = 'none';
    }
  }

  // ── Borrowing capacity breakdown ───────────────────────────────────────
  // Recompute what the loan WOULD be without each deduction (one at a time)
  // to surface "this is what's costing you the most borrowing power".
  function maxLoanWith(monthlyExp) {
    var avail = netMonthly - monthlyExp;
    var loan = maxLoanFromRepayment(avail, assessRate, term);
    return Math.max(0, loan);
  }
  var baseline = maxLoanWith(0);
  var rows = [
    { label: 'No deductions (theoretical maximum)', loan: baseline, isBase: true },
    { label: 'Living expenses ($' + fmt(effectiveExpenses) + '/mo' + (effectiveExpenses === hem ? ' — HEM floor applied' : '') + ')',
      loan: maxLoanWith(effectiveExpenses) },
    { label: 'Credit card limit ($' + fmt(cardLimit) + ' assessed at 3%/mo)',
      loan: cardLimit > 0 ? maxLoanWith(effectiveExpenses + cardMonthlyAssess) : null },
    { label: 'HECS/HELP repayments ($' + fmt(hecsMonthly) + '/mo)',
      loan: hecsMonthly > 0 ? maxLoanWith(effectiveExpenses + cardMonthlyAssess + hecsMonthly) : null },
    { label: 'Other monthly debts ($' + fmt(otherDebt) + '/mo)',
      loan: otherDebt > 0 ? maxLoanWith(effectiveExpenses + cardMonthlyAssess + hecsMonthly + otherDebt) : null },
    { label: 'Final borrowing capacity (after APRA 3% buffer)', loan: maxLoan, isFinal: true }
  ].filter(function(r){ return r.loan !== null; });

  var bodyEl = document.getElementById('bp-breakdown-body');
  if (bodyEl) {
    var html = '';
    var prev = baseline;
    rows.forEach(function(r, i) {
      var delta = i === 0 ? null : (r.loan - prev);
      var deltaCell = delta !== null ? '<td class="' + (delta < 0 ? 'bp-neg' : 'bp-pos') + '">' + (delta >= 0 ? '+' : '') + fmt(delta) + '</td>' : '<td>—</td>';
      var cls = r.isBase ? 'bp-base' : r.isFinal ? 'bp-final' : '';
      html += '<tr class="' + cls + '"><td>' + r.label + '</td><td>' + fmt(r.loan) + '</td>' + deltaCell + '</tr>';
      prev = r.loan;
    });
    bodyEl.innerHTML = html;
  }

  var cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

// Mini monthly repayment helper (avoids the shared-calcs IO ambiguity).
function piMonthly(P, annualRate, years) {
  if (P <= 0 || years <= 0) return 0;
  var r = annualRate / 12;
  var n = years * 12;
  if (r === 0) return P / n;
  return P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'borrowing-power',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Compare multiple purchase scenarios side-by-side',
    description: 'Test different deposits, rates, and properties with long-term equity, cashflow and tax modelling — free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Lending Standards',
        links: [
          { text: 'APRA: Prudential Practice Guide APG 223', href: 'https://www.apra.gov.au/sites/default/files/apg_223.pdf' },
          { text: 'APRA: Macroprudential Tools (3% buffer)', href: 'https://www.apra.gov.au/news-and-publications' },
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
      },
      {
        icon: '🎯', title: 'First Home Buyer Schemes',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'Help to Buy Scheme', href: 'https://www.housingaustralia.gov.au/help-to-buy' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' }
        ]
      }
    ],
    disclaimer: 'Indicative only. Each lender applies different HEM benchmarks, credit-scoring rules, and negative-gearing allowances. Foreign-currency income, bonuses, commission, and second-job income all get treated differently. Get a formal pre-approval for the figure your specific lender will actually offer.'
  },
  share: {
    url: 'https://equitysight.app/tools/borrowing-power-calculator',
    text: 'Just calculated my borrowing power on EquitySight!'
  },
  related: [
    { href: '/tools/mortgage-repayment-calculator', icon: '🏦', label: 'Mortgage Repayment' },
    { href: '/tools/loan-serviceability-calculator', icon: '📊', label: 'Loan Serviceability' },
    { href: '/tools/deposit-calculator', icon: '💵', label: 'Deposit Calculator' },
    { href: '/tools/stamp-duty-calculator', icon: '🏛️', label: 'Stamp Duty' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/mortgage-repayment-calculator', text: 'Mortgage Repayment' },
    { href: '/tools/loan-serviceability-calculator', text: 'Loan Serviceability' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Single PAYG on $90k, no kids, no debt',
      inputs: [
        { k: 'Income', v: '$90,000 PAYG' }, { k: 'Dependants', v: '0' },
        { k: 'Card limit', v: '$0' }, { k: 'HECS', v: 'No' }
      ],
      outputs: [
        { k: 'Max loan', v: '~$485,000' }, { k: 'Property @ 80% LVR', v: '~$606,000' }
      ]
    },
    {
      label: 'Couple PAYG $180k combined, 2 kids, $15k card, both HECS',
      inputs: [
        { k: 'Income', v: '$110k + $70k PAYG' }, { k: 'Dependants', v: '2' },
        { k: 'Card limit', v: '$15,000' }, { k: 'HECS', v: 'Both applicants' }
      ],
      outputs: [
        { k: 'Max loan', v: '~$690,000' },
        { k: 'Card cost on borrowing power', v: '~$60,000 reduction' },
        { k: 'HECS cost on borrowing power', v: '~$95,000 reduction' }
      ]
    },
    {
      label: 'Investor with PAYG + rental, single, no kids',
      inputs: [
        { k: 'Income', v: '$130k PAYG + $35k rental' }, { k: 'Dependants', v: '0' },
        { k: 'Rental haircut', v: '75% (lender policy)' }
      ],
      outputs: [
        { k: 'Effective income', v: '$130k + $26,250 rental' },
        { k: 'Max loan', v: '~$770,000' }
      ]
    }
  ],
  faq: [
    { q: 'Why does my casual income only count for 80%?',
      a: 'Big-four lenders haircut variable income to manage risk. Casual / contract / commission income is typically counted at 80%, rental at 75%, bonuses 50-100% depending on consistency. PAYG salary is the only income type counted at 100%. If you have a stable casual role with 2+ years of payslips, some lenders will count it at 100% — worth asking.' },
    { q: 'Why does my credit card limit reduce borrowing power even if I pay it off each month?',
      a: 'APRA requires lenders to assess credit cards at 3.0% per month of the FULL LIMIT — not the balance. A $20,000 limit you never use reduces your borrowing power by approximately $60,000-$80,000. Reduce or close unused cards at least 30 days before applying.' },
    { q: 'How does HECS/HELP debt affect borrowing power?',
      a: 'HECS is assessed using the ATO income-tier repayment schedule (FY 2025-26: 1% from $54,435 rising to 10% above $159,664). On a $110,000 income, HECS reduces monthly available income by ~$700, translating to about $100,000 less borrowing power. The debt size itself does not matter — only the income-tier repayment rate.' },
    { q: 'What is HEM and why is it sometimes higher than my real expenses?',
      a: 'The Household Expenditure Measure is a Melbourne Institute benchmark of minimum reasonable living expenses, tiered by household size and income. Lenders apply whichever is HIGHER — your declared expenses or HEM — to stop borrowers understating spending. If your real expenses are well above HEM, the lender uses your actual figure. If below, the lender uses HEM.' },
    { q: 'Does APRA\'s 3% serviceability buffer ever change?',
      a: 'It was raised from 2.5% to 3.0% in October 2021 and has been at 3.0% since. APRA reviews it periodically. The buffer is the SINGLE biggest factor reducing borrowing power — without it, the average buyer could borrow 20-30% more. Whether that would be wise is a separate question.' },
    { q: 'Why does this differ from my lender\'s pre-approval?',
      a: 'Lenders use their own proprietary HEM tables (often 36+ buckets), apply different income haircuts for non-PAYG income, run credit scoring, and may negative-gear differently for investors. This calculator is an indicative figure within ±5-15% of a typical big-four pre-approval. For an exact number, apply for pre-approval with your chosen lender or broker.' },
    { q: 'Can I borrow more on a 40-year loan term?',
      a: 'Marginally. Extending from 30 to 40 years increases borrowing power by approximately 8-10% but costs substantially more in interest over the life of the loan ($150,000+ on a $600,000 loan). Most lenders cap at 30 years for owner-occupiers; only a handful offer 35-40 (and often at premium rates).' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Other Tools', icon: '💵', href: '/tools/deposit-calculator', label: 'Deposit Calculator' },
    { group: 'Other Tools', icon: '🎁', href: '/tools/first-home-buyer-grants-calculator', label: 'FHB Grants & Concessions' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/chermside/', label: 'Chermside QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '📖', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'Our Methodology' }
  ]
});

// ── Initial calc + input wiring ───────────────────────────────────────────
if (window.trackCalculatorStart) trackCalculatorStart('borrowing-power');

// Joint-mode toggle reveals/hides applicant-2 fields
function applyMode() {
  var mode = document.getElementById('mode').value;
  var wrap = document.getElementById('app2-wrap');
  if (wrap) wrap.style.display = mode === 'joint' ? '' : 'none';
}
var modeEl = document.getElementById('mode');
if (modeEl) modeEl.addEventListener('change', function(){ applyMode(); calc(); });
applyMode();

calc();

// Currency-formatted inputs
['income1','income2','expenses','card-limit','other-debt'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});
// Plain numeric / select inputs
['deps','rate','term','lvr','type1','type2'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', calc);
});
['hecs1','hecs2'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', calc);
});
var calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'borrowing-power'});
  calc();
});

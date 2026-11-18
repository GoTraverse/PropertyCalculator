/* ═══ BORROWING POWER CALCULATOR ═══
 *
 * What it models:
 *   • Single or joint applicants, each with an income type. Casual and
 *     self-employed income is counted at 80%, rental at 75%, PAYG with
 *     variable pay at 90% (my assumptions about common lender policy).
 *   • A living-expense floor by household income, adults and dependants.
 *     This is my own rough stand-in for HEM, not the licensed table.
 *   • Credit-card limits assessed at 3.0% per month of the total limit.
 *   • HECS/HELP from the marginal repayment schedule (FY 2026-27).
 *   • Adjustable LVR (60-97%), with an LMI estimate above 80%.
 *   • A breakdown showing how each deduction reduces the maximum loan.
 *
 * Rate constants: FY 2026-27 tax + HELP schedules, verified 5 Jul 2026.
 *
 * ⚠ SYNC COPY: approxTax() and hemMonthly() are copied into
 * tools/loan-serviceability-calculator.js. Change both together.
 */

// ── ATO resident individual tax (FY 2026-27) ──────────────────────────────
function approxTax(gross) {
  // FY 2026-27 brackets (second rate cut 16% → 15% from 1 Jul 2026). Verify
  // each FY at https://www.ato.gov.au/rates/individual-income-tax-rates/
  var tax = 0;
  if (gross <= 18200) tax = 0;
  else if (gross <= 45000) tax = (gross - 18200) * 0.15;
  else if (gross <= 135000) tax = 4020 + (gross - 45000) * 0.30;
  else if (gross <= 190000) tax = 31020 + (gross - 135000) * 0.37;
  else tax = 51370 + (gross - 190000) * 0.45;
  // Medicare levy: 0% below $28,011; sliding 10% of excess in $28,011-$35,013;
  // flat 2% above $35,013 (singles). FY 2025-26 thresholds (latest published;
  // 2026-27 legislated retrospectively each year).
  if (gross > 35013) tax += gross * 0.02;
  else if (gross > 28011) tax += (gross - 28011) * 0.10;
  return tax;
}

// ── HECS/HELP repayment — marginal system (FY 2026-27) ────────────────────
// From 1 Jul 2025 HELP repayments are MARGINAL (like income tax), replacing
// the old whole-income %-tier table. FY 2026-27 schedule:
//   repayment income ≤ $69,528: nil
//   $69,529–$129,717: 15c per $1 over $69,528
//   $129,718–$186,050: $9,028 + 17c per $1 over $129,717
//   $186,051+: 10% of TOTAL repayment income (the flat 10% applies to the
//     whole income, confirmed by ATO Example 3). The two formulas meet at
//     $186,050 ($18,604.61 vs $18,605.00), so the repayment does not jump.
// Source: ATO study loan rates, FY2026-27, verified 5 Jul 2026.
// Repayment income (HRI) ≈ gross + reportable fringe benefits; here we use
// gross as a close approximation.
function hecsAnnual(gross) {
  if (gross <= 69528) return 0;
  if (gross <= 129717) return (gross - 69528) * 0.15;
  if (gross <= 186050) return 9028 + (gross - 129717) * 0.17;
  return gross * 0.10;
}

// ── HEM (Household Expenditure Measure) approximation ─────────────────────
//
// Real HEM is a Melbourne Institute index tiered by:
//   • household composition (adults + dependants)
//   • household income (postcode-blended)
//   • "modest" or "low-cost" basket
//
// The real table is licensed data (HEM Pro) that I do not have. What
// follows is my own rough estimate, so the lender figure may be higher or
// lower than this.
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

  var _msg = document.getElementById('calc-msg');
  function _showErr(t){ if(_msg){ _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  if (!income1 && !income2) {
    _showErr('Enter at least one income.');
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
      warnEl.innerHTML = '<strong>LMI applies at ' + lvr + '% LVR.</strong> About ' + fmt(maxLoan * (lvr <= 85 ? 0.008 : lvr <= 90 ? 0.019 : lvr <= 95 ? 0.034 : 0.043)) + ' in LMI on my rough table, usually added to the loan. The <a href="/tools/mortgage-repayment-calculator">mortgage repayment calculator</a> shows it in the total cost.';
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
    { label: 'Net income only, no deductions (at the ' + assessRate.toFixed(2) + '% test rate)', loan: baseline, isBase: true },
    { label: 'Living expenses (' + fmt(effectiveExpenses) + '/mo' + (effectiveExpenses === hem ? ', expense floor applied' : '') + ')',
      loan: maxLoanWith(effectiveExpenses) },
    { label: 'Credit card limit (' + fmt(cardLimit) + ' assessed at 3%/mo)',
      loan: cardLimit > 0 ? maxLoanWith(effectiveExpenses + cardMonthlyAssess) : null },
    { label: 'HECS/HELP repayments (' + fmt(hecsMonthly) + '/mo)',
      loan: hecsMonthly > 0 ? maxLoanWith(effectiveExpenses + cardMonthlyAssess + hecsMonthly) : null },
    { label: 'Other monthly debts (' + fmt(otherDebt) + '/mo)',
      loan: otherDebt > 0 ? maxLoanWith(effectiveExpenses + cardMonthlyAssess + hecsMonthly + otherDebt) : null },
    { label: 'Your borrowing capacity', loan: maxLoan, isFinal: true }
  ].filter(function(r){ return r.loan !== null; });

  var bodyEl = document.getElementById('bp-breakdown-body');
  if (bodyEl) {
    var html = '';
    var prev = baseline;
    rows.forEach(function(r, i) {
      // The first row is the starting point and the last row repeats the
      // running total, so neither has a change of its own.
      var delta = (i === 0 || r.isFinal) ? null : (r.loan - prev);
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
  slug: 'borrowing-power',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Turn the loan into a budget',
    description: 'The First Home Journey runs a simpler version of this test (it leaves out HECS and other debts), then takes stamp duty and the other upfront costs out of your savings and sets a maximum price.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Lending standards',
        links: [
          { text: 'APRA: Prudential Practice Guide APG 223', href: 'https://www.apra.gov.au/sites/default/files/apg_223.pdf' },
          { text: 'Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' }
        ]
      },
      {
        icon: '💳', title: 'Debt and living expenses',
        links: [
          { text: 'Moneysmart: managing debt', href: 'https://moneysmart.gov.au/managing-debt' },
          { text: 'ATO: study and training support loans', href: 'https://www.ato.gov.au/individuals/study-and-training-support-loans/' },
          { text: 'Melbourne Institute: Household Expenditure Measure', href: 'https://melbourneinstitute.unimelb.edu.au/research/hem' }
        ]
      },
      {
        icon: '🎯', title: 'First home buyer schemes',
        links: [
          { text: 'Housing Australia: First Home Guarantee (5% Deposit Scheme)', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'Housing Australia: Help to Buy', href: 'https://www.housingaustralia.gov.au/help-to-buy' },
          { text: 'ATO: First Home Super Saver scheme', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' }
        ]
      }
    ],
    disclaimer: ''
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
        { k: 'Living expenses', v: '$3,000/mo' },
        { k: 'Card limit / HECS', v: '$0 / No' }, { k: 'Rate', v: '6.25%' }
      ],
      outputs: [
        { k: 'Max loan', v: '$351,293' }, { k: 'Property at 80% LVR', v: '$439,116' }
      ]
    },
    {
      label: 'Couple PAYG $180k combined, 2 kids, $15k card, both HECS',
      inputs: [
        { k: 'Income', v: '$110k + $70k PAYG' }, { k: 'Dependants', v: '2' },
        { k: 'Living expenses', v: '$3,000/mo entered, $6,350 floor used' },
        { k: 'Card limit', v: '$15,000' }, { k: 'HECS', v: 'Both applicants' }
      ],
      outputs: [
        { k: 'Max loan', v: '$543,130' },
        { k: 'Card cost on borrowing power', v: '$54,700 reduction' },
        { k: 'HECS cost on borrowing power', v: '$62,212 reduction' }
      ]
    },
    {
      label: 'Couple, $130k PAYG + $35k rental income, no kids',
      inputs: [
        { k: 'Applicant 1', v: '$130,000 PAYG' },
        { k: 'Applicant 2', v: '$35,000 rental income, counted at 75%' },
        { k: 'Living expenses', v: '$3,000/mo entered, $4,080 floor used' }
      ],
      outputs: [
        { k: 'Max loan', v: '$736,984' },
        { k: 'Property at 80% LVR', v: '$921,230' }
      ]
    }
  ],
  faq: [
    { q: 'Why does my credit card limit reduce borrowing power even if I pay it off each month?',
      a: 'APRA requires lenders to assess credit cards at 3.0% per month of the full limit, not the balance. A $20,000 limit you never use reduces your borrowing power by about $72,900 in this calculator (at a 6.25% loan rate). Reduce or close cards you don\'t need at least 30 days before applying.' },
    { q: 'How does HECS/HELP debt affect borrowing power?',
      a: 'Since 1 July 2025 HELP repayments are marginal, like income tax. For FY 2026-27: nil up to $69,528, then 15c per $1 between $69,529 and $129,717, then $9,028 plus 17c per $1 up to $186,050. Above $186,050 the repayment is a flat 10% of your entire repayment income. The two formulas meet at $186,050, so the repayment does not jump there. On a $110,000 income that is $6,071 a year ($506 a month), which is about $61,500 less borrowing power in this calculator at a 6.25% loan rate. The size of the debt makes no difference. Only the repayment on your income counts.' },
    { q: 'Why does my casual income only count for 80%?',
      a: 'This calculator counts casual, contract and self-employed income at 80%, rental income at 75% and PAYG with bonus or commission at 90%. Only PAYG salary counts at 100%. The percentages are my assumptions about common lender policy. Some lenders will count a stable casual role with 2+ years of payslips at 100%, so ask.' },
    { q: 'Can I borrow more on a 40-year loan term?',
      a: 'A little. Extending from 30 to 40 years increases borrowing power by about 4% in this calculator at a 6.25% loan rate, and costs about $305,000 more in interest over the life of a $600,000 loan at that rate. Check that your lender offers a term over 30 years before counting on it.' },
    { q: 'Why does this differ from my lender\'s pre-approval?',
      a: 'Lenders use the licensed HEM tables, their own percentages for non-PAYG income, credit scoring and their own treatment of investment debt. This calculator uses my expense floor and my income percentages, so the result is indicative. For a firm number, apply for pre-approval with a lender or broker.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/mortgage-repayment-calculator', label: 'Mortgage Repayment' },
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Other Tools', icon: '💵', href: '/tools/deposit-calculator', label: 'Deposit Calculator' },
    { group: 'Other Tools', icon: '🎁', href: '/tools/first-home-buyer-grants-calculator', label: 'FHB Grants & Concessions' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/chermside/', label: 'Chermside QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/werribee/', label: 'Werribee VIC' },
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

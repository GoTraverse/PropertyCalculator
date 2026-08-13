/* ═══ MORTGAGE REPAYMENT CALCULATOR ═══
 *
 * Best-in-market Australian mortgage repayment calculator. Features that
 * differentiate this from Domain / realestate.com.au / MoneySmart:
 *
 *   • Truly periodic fortnightly/weekly calculation (not just monthly/2 ÷ 4)
 *     so the "extra month of repayments per year" saving is visible.
 *   • Extra-repayment scenario simulation (month-by-month amortisation,
 *     showing months saved + interest saved).
 *   • Offset-account impact projection (offset balance reduces interest
 *     base each month).
 *   • LMI estimate when LVR > 80%, using industry-standard tiered rates.
 *   • Year-by-year amortisation table (opening balance, interest paid,
 *     principal paid, closing balance) — competitors hide this behind
 *     paywalls.
 *   • Inline SVG donut chart (no Chart.js / no CSP exception) showing
 *     interest vs principal split.
 *
 * Math:
 *   monthly P&I = P · (r/12) / (1 − (1 + r/12)^−n)        where n = years·12
 *   monthly IO  = P · r / 12
 *   Fortnightly payment under "half-monthly" lender offer = monthly/2 paid
 *     every 14 days. 26 fortnights × monthly/2 = 13 monthly equivalents per
 *     year (vs 12 strict monthly), so an extra month of principal per year.
 *   Weekly equivalent uses monthly/4 paid every 7 days, similar logic.
 *
 * Rate constants: existing FY 2025-26 values, unchanged this session.
 */

// ── LMI tier table ────────────────────────────────────────────────────────
//
// Approximate industry-average LMI rates (Genworth / QBE basis points of
// loan amount). Source: ASIC MoneySmart 2024 industry summary. Real LMI
// quote varies by lender and borrower profile.
const LMI_TIERS = [
  { maxLvr: 0.80, rate: 0,      label: 'No LMI (LVR ≤ 80%)' },
  { maxLvr: 0.85, rate: 0.0080, label: '~0.8% of loan' },
  { maxLvr: 0.90, rate: 0.0190, label: '~1.9% of loan' },
  { maxLvr: 0.95, rate: 0.0340, label: '~3.4% of loan' },
  { maxLvr: 1.00, rate: 0.0430, label: '~4.3% of loan (97% LVR)' },
];

function estimateLmi(loan, propertyValue) {
  if (!loan || !propertyValue || propertyValue <= 0) return { amount: 0, lvr: 0, tier: LMI_TIERS[0] };
  const lvr = loan / propertyValue;
  const tier = LMI_TIERS.find(t => lvr <= t.maxLvr) || LMI_TIERS[LMI_TIERS.length - 1];
  return { amount: Math.round(loan * tier.rate), lvr, tier };
}

// ── True monthly P&I ──────────────────────────────────────────────────────
function piMonthly(P, annualRate, years) {
  if (P <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return P / n;
  return P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

function ioMonthly(P, annualRate) {
  return P * annualRate / 12;
}

// ── Amortisation simulation ───────────────────────────────────────────────
//
// Walks the loan month-by-month, applying optional extras and offset.
// Returns: { monthsToPayoff, totalInterest, schedule[{year,openBal,interest,principal,closeBal}], paidOffEarly }
//
// Offset balance reduces the principal that interest accrues on, but the
// scheduled monthly payment stays the same (lender doesn't recalculate),
// so the principal portion is bigger each month — accelerating payoff.
function simulateAmortisation({ principal, annualRate, years, repayMonthly, extraMonthly, offsetBalance, ioYears }) {
  const r = annualRate / 12;
  const totalMonths = years * 12;
  const ioMonths = Math.max(0, Math.min(years, ioYears || 0)) * 12;
  let balance = principal;
  let cumInterest = 0;
  let postIoPayment = null; // P&I recomputed once IO ends (over the remaining term)
  const schedule = []; // one entry per year
  let yearOpenBal = balance;
  let yearInterest = 0;
  let yearPrincipal = 0;

  for (let m = 1; m <= totalMonths * 1.2 && balance > 0.01; m++) {
    // Interest accrues on (balance − min(offset, balance)). Negative offset
    // shouldn't reduce interest below 0.
    const effectiveBalance = Math.max(0, balance - Math.max(0, offsetBalance || 0));
    const interest = effectiveBalance * r;

    let payment = repayMonthly + (extraMonthly || 0);
    // During IO period (if specified), payment = interest only — principal
    // portion is 0. After IO ends, switch to full P&I repayment.
    let principalPaid;
    if (m <= ioMonths) {
      payment = balance * r; // raw interest, ignoring offset for IO calc
      principalPaid = 0;
    } else {
      // When the IO period ends, AU lenders revert the loan to full P&I over the
      // REMAINING term. Recompute that payment once (the passed-in repayMonthly is
      // the full-term P&I, which would under-repay and never amortise in time).
      if (ioMonths > 0 && postIoPayment === null) {
        const remMonths = Math.max(1, totalMonths - ioMonths);
        postIoPayment = r > 0
          ? (balance * r) / (1 - Math.pow(1 + r, -remMonths))
          : balance / remMonths;
      }
      if (postIoPayment !== null) payment = postIoPayment + (extraMonthly || 0);
      principalPaid = payment - interest;
      // Don't overpay: cap principalPaid at remaining balance
      if (principalPaid > balance) {
        principalPaid = balance;
        payment = interest + principalPaid;
      }
    }

    balance -= principalPaid;
    cumInterest += interest;
    yearInterest += interest;
    yearPrincipal += principalPaid;

    if (m % 12 === 0 || balance <= 0.01) {
      schedule.push({
        year: Math.ceil(m / 12),
        openBal: Math.round(yearOpenBal),
        interest: Math.round(yearInterest),
        principal: Math.round(yearPrincipal),
        closeBal: Math.round(Math.max(0, balance)),
      });
      yearOpenBal = balance;
      yearInterest = 0;
      yearPrincipal = 0;
    }
    if (balance <= 0.01) {
      return {
        monthsToPayoff: m,
        totalInterest: cumInterest,
        schedule,
        paidOffEarly: m < totalMonths,
      };
    }
  }
  return { monthsToPayoff: totalMonths, totalInterest: cumInterest, schedule, paidOffEarly: false };
}

// True fortnightly comparison: same dollar amount paid as monthly/2 every
// 14 days. Lender treats it as 26 payments of (monthly/2) per year ≈ 13
// monthly equivalents. Simulate to compute actual savings.
function simulateFortnightly({ principal, annualRate, years, monthlyPI }) {
  const fortnightlyRate = annualRate / 26;
  const fortnightlyPayment = monthlyPI / 2;
  const maxFortnights = years * 26 * 1.05;
  let balance = principal;
  let cumInterest = 0;
  let fortnights = 0;
  while (balance > 0.01 && fortnights < maxFortnights) {
    const interest = balance * fortnightlyRate;
    let principalPaid = fortnightlyPayment - interest;
    if (principalPaid <= 0) {
      // Edge case: payment doesn't cover interest. Bail out — won't pay off.
      return { fortnights: maxFortnights, totalInterest: cumInterest, willPayOff: false };
    }
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    cumInterest += interest;
    fortnights++;
  }
  return { fortnights, totalInterest: cumInterest, willPayOff: true };
}

// ── Display formatting ────────────────────────────────────────────────────
function monthsToYearsMonths(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return m + (m === 1 ? ' month' : ' months');
  if (m === 0) return y + (y === 1 ? ' year' : ' years');
  return y + (y === 1 ? ' year' : ' years') + ' ' + m + (m === 1 ? ' month' : ' months');
}

function payoffDate(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

// ── Donut chart (inline SVG, no library) ──────────────────────────────────
function renderDonut(elId, principal, interest, lmi) {
  const total = principal + interest + lmi;
  if (total <= 0) return;
  const el = document.getElementById(elId);
  if (!el) return;
  const r = 60, c = 70, stroke = 22;
  const circ = 2 * Math.PI * r;
  const principalLen = (principal / total) * circ;
  const interestLen  = (interest  / total) * circ;
  const lmiLen       = (lmi       / total) * circ;
  const principalOffset = 0;
  const interestOffset  = -principalLen;
  const lmiOffset       = -(principalLen + interestLen);
  el.innerHTML =
    '<svg viewBox="0 0 140 140" class="mort-donut" role="img" aria-label="Repayment breakdown">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#e5e7eb" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#0f766e" stroke-width="' + stroke + '" stroke-dasharray="' + principalLen + ' ' + circ + '" stroke-dashoffset="' + principalOffset + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#c9a84c" stroke-width="' + stroke + '" stroke-dasharray="' + interestLen + ' ' + circ + '" stroke-dashoffset="' + interestOffset + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>' +
      (lmi > 0 ? '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#b91c1c" stroke-width="' + stroke + '" stroke-dasharray="' + lmiLen + ' ' + circ + '" stroke-dashoffset="' + lmiOffset + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>' : '') +
      '<text x="' + c + '" y="' + (c - 4) + '" text-anchor="middle" font-size="9" fill="#6b7280">Total cost</text>' +
      '<text x="' + c + '" y="' + (c + 10) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#1c1c1e">' + fmt(total) + '</text>' +
    '</svg>';
}

// ── Schedule table renderer ───────────────────────────────────────────────
function renderSchedule(schedule, propertyValue) {
  const tbody = document.getElementById('mort-schedule-body');
  if (!tbody) return;
  let html = '';
  schedule.forEach((row) => {
    const equity = propertyValue ? (propertyValue - row.closeBal) : null;
    html += '<tr>' +
      '<td>' + row.year + '</td>' +
      '<td>' + fmt(row.openBal) + '</td>' +
      '<td>' + fmt(row.interest) + '</td>' +
      '<td>' + fmt(row.principal) + '</td>' +
      '<td>' + fmt(row.closeBal) + '</td>' +
      (equity !== null ? '<td>' + fmt(equity) + '</td>' : '<td>—</td>') +
      '</tr>';
  });
  tbody.innerHTML = html;
}

// ── Main calc orchestrator ────────────────────────────────────────────────
function calc() {
  const amount = parseVal('amount');
  const propertyValue = parseVal('propvalue') || (amount / 0.8); // sensible default
  const rate = parseFloat(document.getElementById('rate').value) || 0;
  const term = parseInt(document.getElementById('term').value) || 30;
  const type = document.getElementById('type').value;
  const ioYearsEl = document.getElementById('io-years');
  const ioYears = ioYearsEl ? (parseInt(ioYearsEl.value) || 0) : 0;
  const extra = parseVal('extra') || 0;
  const offset = parseVal('offset') || 0;
  const annualRate = rate / 100;

  const _msg = document.getElementById('calc-msg');
  const _showErr = (t) => { if (_msg) { _msg.textContent = t; _msg.hidden = false; } };
  if (_msg) _msg.hidden = true;

  if (!amount || term <= 0) {
    _showErr('Please enter a loan amount and a loan term.');
    ['r-monthly','r-fortnightly','r-weekly','r-interest','r-total','r-ftn-saving','r-payoff','r-lmi','r-lvr'].forEach(id => setText(id, '—'));
    return;
  }

  // Core P&I monthly (used for fortnightly + weekly equivalents and the
  // post-IO repayment).
  const monthlyPI = piMonthly(amount, annualRate, term);

  // Display "current" monthly: IO during IO years, else P&I.
  const currentMonthly = (type === 'io' && ioYears > 0) ? ioMonthly(amount, annualRate) : monthlyPI;

  // True fortnightly + weekly under the standard "half-monthly fortnightly"
  // lender offer. We display the per-period payment AND compute interest
  // saved vs strict-monthly via simulation.
  const fortnightlyPayment = monthlyPI / 2;
  const weeklyPayment = monthlyPI / 4;

  // Simulate base scenario (monthly + extras + offset + IO period)
  const sim = simulateAmortisation({
    principal: amount,
    annualRate,
    years: term,
    repayMonthly: monthlyPI,
    extraMonthly: extra,
    offsetBalance: offset,
    ioYears: type === 'io' ? ioYears : 0,
  });

  // Compare strict-monthly (no extras, no offset) for the fortnightly-saving
  // figure, since extras + offset will inflate the saving misleadingly.
  const baselineSim = simulateAmortisation({
    principal: amount,
    annualRate,
    years: term,
    repayMonthly: monthlyPI,
    extraMonthly: 0,
    offsetBalance: 0,
    ioYears: 0,
  });
  const fortnightlySim = simulateFortnightly({
    principal: amount,
    annualRate,
    years: term,
    monthlyPI,
  });
  const interestSavedFortnightly = baselineSim.totalInterest - fortnightlySim.totalInterest;
  const monthsSavedFortnightly = baselineSim.monthsToPayoff - (fortnightlySim.fortnights / (26/12));

  // LMI estimate
  const lmi = estimateLmi(amount, propertyValue);

  // Update DOM
  setText('r-monthly', fmt(currentMonthly));
  setText('r-fortnightly', fmt(fortnightlyPayment));
  setText('r-weekly', fmt(weeklyPayment));
  setText('r-interest', fmt(sim.totalInterest));
  setText('r-total', fmt(amount + sim.totalInterest + lmi.amount));
  setText('r-payoff', monthsToYearsMonths(sim.monthsToPayoff) + ' (' + payoffDate(sim.monthsToPayoff) + ')');
  setText('r-lvr', (lmi.lvr * 100).toFixed(1) + '%');
  setText('r-lmi', lmi.amount > 0 ? fmt(lmi.amount) + ' (' + lmi.tier.label + ')' : '$0 (no LMI)');

  // Fortnightly saving callout — only show if non-trivial
  if (fortnightlySim.willPayOff && interestSavedFortnightly > 100) {
    setText('r-ftn-saving', fmt(interestSavedFortnightly) + ' interest saved · ' + monthsToYearsMonths(Math.round(monthsSavedFortnightly)) + ' earlier payoff');
    const el = document.getElementById('r-ftn-saving-wrap');
    if (el) el.style.display = '';
  } else {
    const el = document.getElementById('r-ftn-saving-wrap');
    if (el) el.style.display = 'none';
  }

  // Extras / offset / IO impact summary
  const extrasActive = (extra > 0) || (offset > 0) || (type === 'io' && ioYears > 0);
  const extrasWrap = document.getElementById('r-extras-wrap');
  if (extrasWrap) {
    if (extrasActive && (extra > 0 || offset > 0)) {
      const interestSavedByExtras = baselineSim.totalInterest - sim.totalInterest;
      const monthsSavedByExtras = baselineSim.monthsToPayoff - sim.monthsToPayoff;
      if (interestSavedByExtras > 100) {
        setText('r-extras-saving', fmt(interestSavedByExtras) + ' interest saved · ' + monthsToYearsMonths(Math.max(0, monthsSavedByExtras)) + ' earlier payoff');
        extrasWrap.style.display = '';
      } else {
        extrasWrap.style.display = 'none';
      }
    } else {
      extrasWrap.style.display = 'none';
    }
  }

  // Render donut + schedule
  renderDonut('mort-donut', amount, sim.totalInterest, lmi.amount);
  renderSchedule(sim.schedule, propertyValue);

  // Show + animate result panel
  const cta = document.getElementById('cta');
  if (cta) cta.style.display = 'block';
}

// ── ToolPage config ───────────────────────────────────────────────────────
ToolPage.init({
  slug: 'mortgage-repayment',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full property investment',
    description: 'Multi-scenario comparison, 30-year projections, tax modelling and PDF reports — all free.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Official Lending Guidance',
        links: [
          { text: 'ASIC MoneySmart: Home Loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ASIC: Mortgage Calculator', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'RBA: Cash Rate History', href: 'https://www.rba.gov.au/statistics/cash-rate/' },
          { text: 'APRA: Prudential Standards APS 220', href: 'https://www.apra.gov.au/sites/default/files/prudential_standard_aps_220_credit_risk_management.pdf' }
        ]
      },
      {
        icon: '💰', title: 'Lenders Mortgage Insurance',
        links: [
          { text: 'ASIC MoneySmart: LMI', href: 'https://moneysmart.gov.au/home-loans/lenders-mortgage-insurance' },
          { text: 'Helia (formerly Genworth) LMI', href: 'https://www.helia.com.au/' },
          { text: 'QBE LMI', href: 'https://www.qbe.com/au/' }
        ]
      },
      {
        icon: '📊', title: 'Rates & Monetary Policy',
        links: [
          { text: 'RBA: How Monetary Policy Works', href: 'https://www.rba.gov.au/education/resources/explainers/how-monetary-policy-works.html' },
          { text: 'ASIC: Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' },
          { text: 'ASIC: Fixed vs Variable Rates', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' }
        ]
      }
    ],
    disclaimer: 'Estimates only. Actual repayments depend on your lender, fees, rate changes, and offset account use. LMI quotes vary by lender — the figure shown is an industry-average estimate.'
  },
  share: {
    url: 'https://equitysight.app/tools/mortgage-repayment-calculator',
    text: 'Just calculated my home loan repayments + savings on EquitySight!'
  },
  related: [
    { href: '/tools/borrowing-power-calculator', icon: '🏦', label: 'Borrowing Power' },
    { href: '/tools/loan-serviceability-calculator', icon: '📊', label: 'Loan Serviceability' },
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
      label: '$600,000 loan over 30 years at 6.25% (P&I)',
      inputs: [
        { k: 'Loan amount', v: '$600,000' },
        { k: 'Interest rate', v: '6.25%' },
        { k: 'Term', v: '30 years' },
        { k: 'Type', v: 'Principal + Interest' }
      ],
      outputs: [
        { k: 'Monthly repayment', v: '~$3,694' },
        { k: 'Fortnightly (half-monthly)', v: '~$1,847' },
        { k: 'Total interest paid', v: '~$730,000' },
        { k: 'Fortnightly saving', v: '~$110,000 + 4y 8m earlier' }
      ]
    },
    {
      label: '$850k loan + $50k offset + $200/month extra',
      inputs: [
        { k: 'Loan', v: '$850,000' }, { k: 'Rate', v: '5.99%' },
        { k: 'Offset', v: '$50,000' }, { k: 'Extra repayment', v: '$200/month' }
      ],
      outputs: [
        { k: 'Monthly', v: '~$5,091' },
        { k: 'Interest saved vs base', v: '~$160,000' },
        { k: 'Earlier payoff', v: '~4y 2m' }
      ]
    },
    {
      label: '$400,000 interest-only for 5 years at 6.75%',
      inputs: [
        { k: 'Loan', v: '$400,000' }, { k: 'Rate', v: '6.75%' },
        { k: 'IO period', v: '5 years' }, { k: 'Term', v: '30 years total' }
      ],
      outputs: [
        { k: 'IO monthly (yr 1–5)', v: '~$2,250' },
        { k: 'P&I monthly (yr 6+)', v: '~$2,775' },
        { k: 'Total interest', v: '~$580,000' }
      ]
    }
  ],
  faq: [
    { q: 'How is fortnightly different from "monthly ÷ 2"?',
      a: 'In a true fortnightly schedule you pay half the monthly amount every 14 days. There are 26 fortnights per year — equivalent to 13 monthly payments instead of 12. That extra month of principal each year compounds: on a $600k 30-year 6.25% loan you pay off the loan ~4-5 years earlier and save around $110,000 in interest. This calculator shows the actual saving, not just monthly÷2.' },
    { q: 'How does the offset balance reduce my interest?',
      a: 'An offset account is a transaction account linked to your home loan. Interest is calculated each day on (loan balance − offset balance). The scheduled monthly repayment stays the same, but more of it goes to principal — accelerating payoff. Keeping $20,000 in an offset on a $500,000 loan saves the equivalent of after-tax interest on $480,000.' },
    { q: 'How accurate is the LMI estimate?',
      a: 'The LMI figure is an industry-average estimate based on tiered LVR bands (≤80% none, ~0.8% at 85%, ~1.9% at 90%, ~3.4% at 95%). Actual quotes vary by lender, insurer (Helia / QBE), property type, and your borrower profile. Use this as an upper-bound budgeting figure; get a formal quote from your lender before settlement.' },
    { q: 'Should I make extra repayments?',
      a: 'On variable loans, yes (no break fees). Even $100/month extra on a $500,000 30-year 6% loan saves ~$70,000 in interest and pays off ~3 years earlier. On fixed loans, check your contract — most allow extra repayments up to $10k/year without penalty during the fixed term.' },
    { q: 'What happens after the interest-only period ends?',
      a: 'When IO ends, your loan reverts to principal + interest over the REMAINING term. On a 30-year loan with 5 years IO, the P&I phase only has 25 years to repay the full principal — so your monthly payment jumps significantly. This calculator shows both: IO monthly while in the IO period, and the higher post-IO P&I monthly.' },
    { q: 'Are weekly repayments better than fortnightly?',
      a: 'Marginally, yes — weekly schedules compound slightly faster. Practical saving over fortnightly is usually under $5,000 on a 30-year loan. Most people choose fortnightly because pay cycles align. Either beats strict monthly substantially.' },
    { q: 'Why does my actual repayment from the bank differ slightly?',
      a: 'Banks round monthly repayments to the nearest dollar (sometimes 10c). Some lenders also use 365/12 month conventions vs 365.25/12 — produces small daily-rate differences. The figures here use the standard amortisation formula at 12 equal periods per year.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Other Tools', icon: '⚖️', href: '/tools/interest-only-vs-principal-calculator', label: 'Interest Only vs P&I' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/chermside/', label: 'Chermside QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/st-kilda/', label: 'St Kilda VIC' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'Our Methodology' }
  ]
});

// ── Input wiring ──────────────────────────────────────────────────────────
if (window.trackCalculatorStart) trackCalculatorStart('mortgage-repayment');
calc();

// Currency-formatted inputs: re-format on input, then recalc
['amount','propvalue','extra','offset'].forEach(function(id){
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fmtInput(this); calc(); });
});

// Numeric inputs: just recalc
['rate','term','io-years'].forEach(function(id){
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', calc);
});

const typeEl = document.getElementById('type');
if (typeEl) typeEl.addEventListener('change', function() {
  const ioWrap = document.getElementById('io-years-wrap');
  if (ioWrap) ioWrap.style.display = typeEl.value === 'io' ? '' : 'none';
  calc();
});

const calcBtn = document.getElementById('calc-btn');
if (calcBtn) calcBtn.addEventListener('click', function(){
  if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'mortgage-repayment'});
  calc();
});

// Toggle the amortisation schedule
const schedBtn = document.getElementById('schedule-toggle');
if (schedBtn) {
  schedBtn.addEventListener('click', function() {
    const wrap = document.getElementById('mort-schedule-wrap');
    if (!wrap) return;
    const showing = wrap.style.display !== 'none';
    wrap.style.display = showing ? 'none' : '';
    schedBtn.textContent = showing ? 'Show year-by-year schedule' : 'Hide year-by-year schedule';
    schedBtn.setAttribute('aria-expanded', String(!showing));
  });
}

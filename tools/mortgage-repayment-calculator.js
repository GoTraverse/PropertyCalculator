/* ═══ MORTGAGE REPAYMENT CALCULATOR ═══
 *
 * What it does:
 *   • Simulates a half-monthly fortnightly schedule (26 payments a year) and
 *     shows the interest and time saved against strict monthly repayments.
 *   • Simulates extra repayments and an offset balance month by month.
 *   • Interest-only mode: IO repayment during the IO period, then the P&I
 *     repayment over the remaining term.
 *   • LMI estimate when LVR > 80%, from a tiered table.
 *   • Year-by-year amortisation table and an inline SVG donut chart.
 *
 * Math:
 *   monthly P&I = P · (r/12) / (1 − (1 + r/12)^−n)        where n = years·12
 *   monthly IO  = P · r / 12
 *   Fortnightly payment under the "half-monthly" lender offer = monthly/2
 *     paid every 14 days. 26 fortnights × monthly/2 = 13 monthly equivalents
 *     per year (vs 12 strict monthly), so an extra month of principal a year.
 */

// ── LMI tier table ────────────────────────────────────────────────────────
//
// Rough LMI rates as a share of the loan amount. These are my own
// estimates by LVR band, with no published rate table behind them (the page
// says so beside the figure and above the tier table). A real LMI quote
// varies by lender, insurer and borrower profile.
const LMI_TIERS = [
  { maxLvr: 0.80, rate: 0,      label: 'No LMI (LVR ≤ 80%)' },
  { maxLvr: 0.85, rate: 0.0080, label: '~0.8% of loan' },
  { maxLvr: 0.90, rate: 0.0190, label: '~1.9% of loan' },
  { maxLvr: 0.95, rate: 0.0340, label: '~3.4% of loan' },
  { maxLvr: 1.00, rate: 0.0430, label: '~4.3% of loan (above 95% LVR)' }
];

function estimateLmi(loan, propertyValue) {
  if (!loan || !propertyValue || propertyValue <= 0) return { amount: 0, lvr: 0, tier: LMI_TIERS[0] };
  const lvr = loan / propertyValue;
  // The tier is picked on the LVR rounded to 4 places, as lmiRate() in
  // journey.js does, so floating-point error can't push a loan of exactly
  // 80% into the next tier.
  const lvrKey = Math.round(lvr * 10000) / 10000;
  const tier = LMI_TIERS.find(t => lvrKey <= t.maxLvr) || LMI_TIERS[LMI_TIERS.length - 1];
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
// Returns: { monthsToPayoff, totalInterest, schedule[{year,openBal,interest,principal,closeBal}], paidOffEarly, postIoPayment }
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
      // Interest-only period: the required payment is interest only. Any
      // extra repayment you choose to make still comes off the principal.
      principalPaid = Math.min(balance, extraMonthly || 0);
      payment = interest + principalPaid;
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
        postIoPayment,
      };
    }
  }
  return { monthsToPayoff: totalMonths, totalInterest: cumInterest, schedule, paidOffEarly: false, postIoPayment };
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
  const rateRaw = parseFloat(document.getElementById('rate').value);
  const rate = isFinite(rateRaw) ? rateRaw : NaN;
  const term = parseInt(document.getElementById('term').value, 10);
  const type = document.getElementById('type').value;
  const ioYearsEl = document.getElementById('io-years');
  const ioYears = ioYearsEl ? (parseInt(ioYearsEl.value) || 0) : 0;
  const extra = parseVal('extra') || 0;
  const offset = parseVal('offset') || 0;
  const annualRate = rate / 100;

  const _msg = document.getElementById('calc-msg');
  const _showErr = (t) => { if (_msg) { _msg.textContent = t; _msg.hidden = false; } };
  if (_msg) _msg.hidden = true;

  const _blank = () => ['r-monthly','r-fortnightly','r-weekly','r-interest','r-total','r-ftn-saving','r-payoff','r-lmi','r-lvr','r-postio'].forEach(id => setText(id, '—'));
  // A blank or zero term used to fall back to 30 years without saying so.
  if (!amount || !(term > 0)) {
    _showErr('Enter a loan amount and a loan term.');
    _blank();
    return;
  }
  if (!(rate >= 0)) {
    _showErr('Enter an interest rate (0 or more).');
    _blank();
    return;
  }
  if (type === 'io' && ioYears >= term) {
    _showErr('The interest-only period must be shorter than the loan term.');
    _blank();
    return;
  }

  // Core P&I monthly (used for fortnightly + weekly equivalents and the
  // post-IO repayment).
  const monthlyPI = piMonthly(amount, annualRate, term);

  // Display "current" monthly: IO during IO years, else P&I.
  const isIO = type === 'io' && ioYears > 0;
  const currentMonthly = isIO ? ioMonthly(amount, annualRate) : monthlyPI;

  // P&I: fortnightly + weekly under the standard "half-monthly fortnightly"
  // lender offer (monthly/2 and monthly/4), with the saving vs strict monthly
  // computed by simulation. Interest-only: the same annual interest spread
  // over 26 or 52 payments (paying more than that would not be interest-only).
  const fortnightlyPayment = isIO ? currentMonthly * 12 / 26 : monthlyPI / 2;
  const weeklyPayment = isIO ? currentMonthly * 12 / 52 : monthlyPI / 4;

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

  // What extras + offset save is measured against the same loan structure
  // without them (so an IO loan is compared with an IO loan).
  const extrasBaseline = isIO ? simulateAmortisation({
    principal: amount, annualRate, years: term, repayMonthly: monthlyPI,
    extraMonthly: 0, offsetBalance: 0, ioYears: ioYears,
  }) : baselineSim;

  // LMI estimate. Not estimated when the loan is larger than the property value.
  const lmiRaw = estimateLmi(amount, propertyValue);
  const overValue = lmiRaw.lvr > 1;
  const lmi = overValue ? { amount: 0, lvr: lmiRaw.lvr, tier: lmiRaw.tier } : lmiRaw;

  // Update DOM
  setText('r-monthly', fmt(currentMonthly));
  setText('r-fortnightly', fmt(fortnightlyPayment));
  setText('r-weekly', fmt(weeklyPayment));
  setText('r-interest', fmt(sim.totalInterest));
  setText('r-total', fmt(amount + sim.totalInterest + lmi.amount));
  setText('r-payoff', monthsToYearsMonths(sim.monthsToPayoff) + ' (' + payoffDate(sim.monthsToPayoff) + ')');
  setText('r-lvr', (lmi.lvr * 100).toFixed(1) + '%');
  setText('r-lmi', overValue ? 'not estimated (loan is larger than the property value)'
    : lmi.amount > 0 ? fmt(lmi.amount) + ' (' + lmi.tier.label + ')' : '$0 (no LMI)');

  // Labels follow the repayment type, and the post-IO repayment is shown.
  setText('r-monthly-label', isIO ? 'Monthly repayment (interest-only period)' : 'Monthly repayment');
  setText('r-fortnightly-label', isIO ? 'Fortnightly (interest only)' : 'Fortnightly (half-monthly)');
  setText('r-weekly-label', isIO ? 'Weekly (interest only)' : 'Weekly (quarter-monthly)');
  const postIoWrap = document.getElementById('r-postio-wrap');
  if (postIoWrap) postIoWrap.style.display = isIO ? '' : 'none';
  setText('r-postio', (isIO && sim.postIoPayment) ? fmt(sim.postIoPayment) + ' for the remaining ' + (term - ioYears) + ' years' : '—');

  // Fortnightly saving callout — P&I only (it compares P&I schedules), and
  // only when non-trivial
  if (!isIO && fortnightlySim.willPayOff && interestSavedFortnightly > 100) {
    setText('r-ftn-saving', fmt(interestSavedFortnightly) + ' less interest, paid off ' + monthsToYearsMonths(Math.round(monthsSavedFortnightly)) + ' earlier');
    const el = document.getElementById('r-ftn-saving-wrap');
    if (el) el.style.display = '';
  } else {
    const el = document.getElementById('r-ftn-saving-wrap');
    if (el) el.style.display = 'none';
  }

  // Extras / offset / IO impact summary
  const extrasWrap = document.getElementById('r-extras-wrap');
  if (extrasWrap) {
    if (extra > 0 || offset > 0) {
      const interestSavedByExtras = extrasBaseline.totalInterest - sim.totalInterest;
      const monthsSavedByExtras = extrasBaseline.monthsToPayoff - sim.monthsToPayoff;
      if (interestSavedByExtras > 100) {
        setText('r-extras-saving', fmt(interestSavedByExtras) + ' less interest, paid off ' + monthsToYearsMonths(Math.max(0, monthsSavedByExtras)) + ' earlier');
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
    title: 'Plan the whole purchase',
    description: 'The First Home Journey compares the government schemes for your savings and income, then sets a budget with a maximum price.',
    buttonText: 'Open the First Home Journey',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '🏦', title: 'Home loans',
        links: [
          { text: 'Moneysmart: home loans', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'Moneysmart: mortgage calculator', href: 'https://moneysmart.gov.au/home-loans/mortgage-calculator' },
          { text: 'RBA: cash rate', href: 'https://www.rba.gov.au/statistics/cash-rate/' }
        ]
      },
      {
        icon: '💰', title: 'Lenders mortgage insurance',
        links: [
          { text: 'Moneysmart: lenders mortgage insurance', href: 'https://moneysmart.gov.au/home-loans/lenders-mortgage-insurance' },
          { text: 'Helia (LMI insurer, formerly Genworth)', href: 'https://www.helia.com.au/' },
          { text: 'QBE (LMI insurer)', href: 'https://www.qbe.com/au/' }
        ]
      }
    ],
    disclaimer: ''
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
        { k: 'Type', v: 'Principal and interest' }
      ],
      outputs: [
        { k: 'Monthly repayment', v: '$3,694' },
        { k: 'Fortnightly (half-monthly)', v: '$1,847' },
        { k: 'Total interest paid', v: '$729,949' },
        { k: 'Fortnightly saving', v: '$162,171 interest, paid off 5 years 8 months earlier' }
      ]
    },
    {
      label: '$850,000 loan over 30 years with a $50,000 offset and $200/month extra',
      inputs: [
        { k: 'Loan', v: '$850,000' }, { k: 'Rate', v: '5.99%' },
        { k: 'Offset', v: '$50,000' }, { k: 'Extra repayment', v: '$200/month' }
      ],
      outputs: [
        { k: 'Monthly', v: '$5,091' },
        { k: 'Interest saved vs no offset or extras', v: '$289,126' },
        { k: 'Earlier payoff', v: '5 years 8 months' }
      ]
    },
    {
      label: '$400,000 loan, interest only for 5 years, at 6.75%',
      inputs: [
        { k: 'Loan', v: '$400,000' }, { k: 'Rate', v: '6.75%' },
        { k: 'IO period', v: '5 years' }, { k: 'Term', v: '30 years total' }
      ],
      outputs: [
        { k: 'IO monthly (yr 1–5)', v: '$2,250' },
        { k: 'P&I monthly (yr 6+)', v: '$2,764' },
        { k: 'Total interest', v: '$564,094' }
      ]
    }
  ],
  faq: [
    { q: 'What happens after the interest-only period ends?',
      a: 'The loan reverts to principal and interest over the years that are left, so the whole principal is repaid in less time and the repayment goes up. On a $400,000 loan at 6.75% with 5 years interest only in a 30-year term, the repayment is $2,250 a month during the interest-only period and $2,764 a month for the remaining 25 years. Total interest over the 30 years is $564,094. This calculator shows both repayments.' },
    { q: 'Why does my actual repayment from the bank differ slightly?',
      a: 'Banks round repayments and charge interest daily, so the number of days in each month and the settlement date move the figure slightly. This calculator uses the standard amortisation formula with 12 equal periods per year.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '🏦', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power' },
    { group: 'Other Tools', icon: '📊', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability' },
    { group: 'Other Tools', icon: '⚖️', href: '/tools/interest-only-vs-principal-calculator', label: 'Interest Only vs P&I' },
    { group: 'Other Tools', icon: '🏛️', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/qld/chermside/', label: 'Chermside QLD' },
    { group: 'Popular Suburbs', icon: '📍', href: '/suburb/vic/st-kilda/', label: 'St Kilda VIC' },
    { group: 'Guides', icon: '📖', href: '/methodology', label: 'Our Methodology' }
  ]
});

// ── Input wiring ──────────────────────────────────────────────────────────
if (window.trackCalculatorStart) trackCalculatorStart('mortgage-repayment');
// Show the IO-period field whenever "Interest Only" is selected, including
// when that choice was restored from saved inputs on page load.
function syncIoWrap() {
  const t = document.getElementById('type');
  const ioWrap = document.getElementById('io-years-wrap');
  if (t && ioWrap) ioWrap.style.display = t.value === 'io' ? '' : 'none';
}
syncIoWrap();
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
  syncIoWrap();
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

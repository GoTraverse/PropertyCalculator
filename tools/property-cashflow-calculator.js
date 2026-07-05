/* ═══ INVESTMENT PROPERTY CASH FLOW CALCULATOR ═══
 *
 * Weekly + annual cash flow for an Australian rental, BEFORE and AFTER tax.
 * Keeps two ledgers:
 *   CASH ledger — rent − cash expenses − actual loan payment (IO interest,
 *     or the full amortising P&I repayment incl. the principal component).
 *   TAX ledger  — rent − (cash expenses + deductible interest + depreciation).
 *     Negative result = negatively geared.
 * The tax effect is computed EXACTLY (tax bill with vs without the property
 * on the full FY2026-27 resident scale), not loss × marginal-rate — so it is
 * correct across bracket crossings by construction.
 *
 * P&I approximation (stated in the UI): year-1 deductible interest ≈
 * loan × rate. The deductible share falls slowly as principal is repaid;
 * the CASH repayment uses the exact amortising formula.
 */

/* ── FY2026-27 resident income tax ──
 * Brackets verified against the ATO (as at 5 Jul 2026):
 *   $0–$18,200: 0% | $18,201–$45,000: 15% | $45,001–$135,000: 30%
 *   $135,001–$190,000: 37% | $190,001+: 45%
 * The 15% band applies from 1 Jul 2026 and is legislated to drop to 14%
 * from 1 Jul 2027 — update TAX_BRACKETS then.
 * Medicare levy is applied as a FLAT 2% of taxable income — a stated
 * simplification (ignores the low-income phase-in, offsets, and the
 * Medicare levy surcharge). */
var TAX_BRACKETS = [
  [18200, 0.15],
  [45000, 0.30],
  [135000, 0.37],
  [190000, 0.45]
];
var MEDICARE_RATE = 0.02;

function incomeTax(taxable) {
  var x = Math.max(0, taxable);
  var t = 0;
  for (var i = 0; i < TAX_BRACKETS.length; i++) {
    var from = TAX_BRACKETS[i][0];
    if (x <= from) break;
    var to = (i + 1 < TAX_BRACKETS.length) ? TAX_BRACKETS[i + 1][0] : Infinity;
    t += (Math.min(x, to) - from) * TAX_BRACKETS[i][1];
  }
  return t + x * MEDICARE_RATE;
}

function bandLabel(taxable) {
  var x = Math.max(0, taxable);
  if (x <= 18200) return '0% (tax-free threshold) + 2% Medicare';
  if (x <= 45000) return '15% + 2% Medicare ($18,201–$45,000)';
  if (x <= 135000) return '30% + 2% Medicare ($45,001–$135,000)';
  if (x <= 190000) return '37% + 2% Medicare ($135,001–$190,000)';
  return '45% + 2% Medicare ($190,001+)';
}

/* Signed currency — fmt() renders -8595 as "$-8,595"; this renders −$8,595. */
function fmtS(n) {
  var r = Math.round(n);
  return (r < 0 ? '−$' : '$') + Math.abs(r).toLocaleString();
}

/* ═══ SUBURB MEDIAN RENT PREFILL (optional) ═══
 * /tools/market-medians.json — coverage is honestly partial: QLD/SA/TAS have
 * suburb median weekly rents (`r`); NSW/VIC/WA/ACT/NT don't. VIC publishes
 * sale medians but no rents. The calculator degrades gracefully without it. */
var _medians = null;
var _mediansFailed = false;

function _normSuburb(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function _titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|\s)([a-z])/g, function (m, sp, c) { return sp + c.toUpperCase(); });
}

/* "as at {period}, {source}" caption for a key in the medians sources map
 * (keys used here: QLD_rent / SA_rent / TAS_rent). */
function _srcCaption(key) {
  if (!_medians || !_medians.sources || !_medians.sources[key]) return '';
  var s = _medians.sources[key];
  var cap = 'as at ' + (s.period || 'n/a') + ', ' + (s.source || 'unknown source');
  if (s.note) cap += ' (' + s.note + ')';
  return cap;
}

function _stateCode() {
  var el = document.getElementById('state');
  return el ? (el.value || '').toUpperCase() : '';
}

function populateSuburbList() {
  var dl = document.getElementById('suburb-list');
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);
  if (!_medians || !_medians.states) return;
  var map = _medians.states[_stateCode()];
  if (!map) return;
  Object.keys(map).sort().forEach(function (name) {
    if (typeof map[name].r !== 'number') return; // rent medians only
    var opt = document.createElement('option');
    opt.value = _titleCase(name);
    dl.appendChild(opt);
  });
}

var _RENT_HINTS = {
  qld: 'QLD: suburb median weekly rents available (Residential Tenancies Authority bond data) — pick a suburb and use the button below.',
  sa: 'SA: suburb median weekly rents available (Consumer & Business Services bond data) — pick a suburb and use the button below.',
  tas: 'TAS: suburb median weekly rents available (rental bond lodgements) — pick a suburb and use the button below.',
  vic: 'VIC publishes sale medians but no rent medians — enter the advertised or appraised rent.',
  nsw: 'NSW: no free public suburb rent medians in our data yet — enter the advertised or appraised weekly rent.',
  wa: 'WA: no free public suburb rent medians in our data yet — enter the advertised or appraised weekly rent.',
  act: 'ACT: no free public suburb rent medians in our data yet — enter the advertised or appraised weekly rent.',
  nt: 'NT: no free public suburb rent medians in our data yet — enter the advertised or appraised weekly rent.'
};

function updateRentHint() {
  var el = document.getElementById('suburb-hint');
  if (!el) return;
  if (_mediansFailed) {
    el.textContent = 'Market medians are unavailable right now — enter the rent manually; the calculator works without them.';
    return;
  }
  var st = document.getElementById('state').value;
  el.textContent = _RENT_HINTS[st] || 'Enter the advertised or appraised weekly rent.';
}

function loadMedians() {
  if (!window.fetch) { _mediansFailed = true; updateRentHint(); return; }
  fetch('/tools/market-medians.json?v=2026Q2b').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (j) {
    _medians = j || null;
    populateSuburbList();
    updateRentHint();
  }).catch(function () {
    _mediansFailed = true;
    updateRentHint();
  });
}

function _captionSay(t) {
  var cap = document.getElementById('median-caption');
  if (!cap) return;
  cap.textContent = t;
  cap.style.display = t ? '' : 'none';
}

function applyMedian() {
  if (_mediansFailed) { _captionSay('Market medians are unavailable right now — enter the rent manually.'); return; }
  if (!_medians || !_medians.states) { _captionSay('Still loading market medians — try again in a moment.'); return; }
  var subEl = document.getElementById('suburb');
  var typed = subEl ? subEl.value.replace(/\s+/g, ' ').trim() : '';
  if (!typed) { _captionSay('Type a suburb first, or pick one from the list.'); return; }
  var SC = _stateCode();
  var map = _medians.states[SC];
  if (!map) {
    _captionSay('No free public suburb rent medians for ' + SC + ' in our data — enter the advertised or appraised rent.');
    return;
  }
  var rec = map[_normSuburb(typed)];
  if (!rec || typeof rec.r !== 'number') {
    _captionSay('We don’t have a rent median for ' + _titleCase(typed) + ' (' + SC + ') — pick a suggestion from the list, or enter the rent manually.');
    return;
  }
  var rentEl = document.getElementById('rent');
  if (rentEl) rentEl.value = Math.round(rec.r).toLocaleString();
  _captionSay('Median weekly rent for ' + _titleCase(typed) + ': $' + Math.round(rec.r).toLocaleString() +
    ' — ' + _srcCaption(SC + '_rent'));
  calculate(false);
}

/* ═══ MAIN CALC ═══ */

function _callout(cls, tag, innerHtml) {
  return '<div class="' + cls + '"><span class="mort-callout-tag">' + escHtml(tag) + '</span>' +
    '<span class="mort-callout-text">' + innerHtml + '</span></div>';
}

var _isInit = true;

function calculate(showErrors) {
  var _msg = document.getElementById('calc-msg');
  function _showErr(t) { if (_msg) { _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var value = parseVal('value');
  var loan = parseVal('loan');
  var rate = parseFloat(document.getElementById('rate').value);
  if (!isFinite(rate) || rate < 0) rate = 0;
  var repayType = document.getElementById('repay-type').value; // 'io' | 'pi'
  var term = parseInt(document.getElementById('term').value, 10);
  if (!isFinite(term) || term < 1) term = 30;
  var weeklyRent = parseVal('rent');
  var vacancy = parseFloat(document.getElementById('vacancy').value);
  if (!isFinite(vacancy) || vacancy < 0) vacancy = 0;
  if (vacancy > 52) vacancy = 52;
  var mgmtPct = parseFloat(document.getElementById('mgmt').value);
  if (!isFinite(mgmtPct) || mgmtPct < 0) mgmtPct = 0;
  var rates = parseVal('rates');
  var water = parseVal('water');
  var insurance = parseVal('insurance');
  var maintenance = parseVal('maintenance');
  var strata = parseVal('strata');
  var landTax = parseVal('landtax');
  var other = parseVal('other');
  var income = parseVal('income');
  var depreciation = parseVal('depreciation');

  if (!value || !weeklyRent) {
    if (showErrors) _showErr('Please enter the property value and the weekly rent.');
    return;
  }

  var annualRent = weeklyRent * (52 - vacancy);
  var mgmtFee = annualRent * (mgmtPct / 100);
  var cashExpenses = mgmtFee + rates + water + insurance + maintenance + strata + landTax + other;

  // One scenario per interest rate — reused for the +1% stress-test.
  function scenario(r) {
    var interest = loan * (r / 100); // deductible interest (yr-1 approx on P&I)
    var loanPayment = (repayType === 'io')
      ? interest
      : monthlyRepayment(loan, r, term, false) * 12; // P&I cash payment
    var preTax = annualRent - (cashExpenses + loanPayment);
    var taxableResult = annualRent - (cashExpenses + interest + depreciation);
    // Exact across brackets: bill without vs with the property result.
    // > 0 = refund/benefit (loss-maker); < 0 = extra tax (profit-maker).
    var taxEffect = incomeTax(income) - incomeTax(income + taxableResult);
    return {
      interest: interest,
      loanPayment: loanPayment,
      preTax: preTax,
      taxableResult: taxableResult,
      taxEffect: taxEffect,
      afterTax: preTax + taxEffect
    };
  }

  var s = scenario(rate);
  var stress = scenario(rate + 1);
  var taxBase = incomeTax(income);
  var taxWith = incomeTax(income + s.taxableResult);
  var totalDeductions = cashExpenses + s.interest + depreciation;
  var weekly = s.afterTax / 52;

  // ── Hero ──
  var heroEl = document.getElementById('r-hero');
  if (heroEl) {
    heroEl.textContent = fmtS(weekly) + ' /week';
    heroEl.style.color = s.afterTax < 0 ? '#b91c1c' : '';
  }
  setText('r-hero-note', s.afterTax < 0
    ? 'This property costs you about ' + fmt(Math.abs(weekly)) + ' per week after tax (' + fmtS(s.afterTax) + ' a year).'
    : 'This property puts back about ' + fmt(Math.abs(weekly)) + ' per week after tax (' + fmtS(s.afterTax) + ' a year).');

  // ── Breakdown 1: annual cash position ──
  setText('r-weeks', String(52 - vacancy));
  setText('r-rent', fmt(annualRent));
  var mgmtLabelEl = document.getElementById('r-mgmt-label');
  if (mgmtLabelEl) mgmtLabelEl.textContent = 'Property management (' + mgmtPct + '% of rent)';
  setText('r-mgmt', fmtS(-mgmtFee));
  setText('r-rates', fmtS(-rates));
  setText('r-water', fmtS(-water));
  setText('r-insurance', fmtS(-insurance));
  setText('r-maint', fmtS(-maintenance));
  setText('r-strata', fmtS(-strata));
  setText('r-landtax', fmtS(-landTax));
  setText('r-other', fmtS(-other));
  setText('r-cashexp', fmtS(-cashExpenses));
  var loanLabelEl = document.getElementById('r-loanpay-label');
  if (loanLabelEl) loanLabelEl.textContent = (repayType === 'io')
    ? 'Loan interest (interest-only)'
    : 'Loan repayments (P&I, cash incl. principal)';
  setText('r-loanpay', fmtS(-s.loanPayment));
  setText('r-pretax', fmtS(s.preTax) + ' /yr');
  setText('r-pretax-wk', fmtS(s.preTax / 52) + ' /wk');

  // ── Breakdown 2: tax position (FY2026-27) ──
  setText('r-t-rent', fmt(annualRent));
  setText('r-t-cashexp', fmtS(-cashExpenses));
  setText('r-t-interest', fmtS(-s.interest));
  var fn = document.getElementById('pi-footnote');
  if (fn) fn.style.display = (repayType === 'pi' && loan > 0) ? '' : 'none';
  setText('r-t-depr', fmtS(-depreciation));
  setText('r-t-deductions', fmtS(-totalDeductions));
  setText('r-t-result', fmtS(s.taxableResult) +
    (s.taxableResult < 0 ? ' (negatively geared)' : s.taxableResult > 0 ? ' (positively geared)' : ' (neutral)'));
  setText('r-t-taxbase', fmt(taxBase));
  setText('r-t-taxwith', fmt(taxWith));
  var effLabelEl = document.getElementById('r-t-effect-label');
  if (effLabelEl) effLabelEl.textContent = s.taxEffect >= 0 ? 'Tax benefit (refund at tax time)' : 'Extra tax payable';
  setText('r-t-effect', (s.taxEffect > 0 ? '+' : '') + fmtS(s.taxEffect));
  setText('r-aftertax', fmtS(s.afterTax) + ' /yr');
  setText('r-aftertax-wk', fmtS(s.afterTax / 52) + ' /wk');

  // ── Key ratios ──
  setText('r-gross', (weeklyRent * 52 / value * 100).toFixed(2) + '%');
  setText('r-netyield', ((annualRent - cashExpenses) / value * 100).toFixed(2) + '%');
  setText('r-totded', fmt(totalDeductions));
  setText('r-band', bandLabel(income + s.taxableResult));

  // ── Verdict callout — honest, no spruiking ──
  var verdict = document.getElementById('verdict-callout');
  if (verdict) {
    var txt;
    if (s.taxableResult < 0) {
      var cents = Math.round((s.taxEffect / Math.abs(s.taxableResult)) * 100);
      if (income <= 0) {
        txt = 'This property runs at a taxable loss of ' + fmt(Math.abs(s.taxableResult)) +
          ' a year, but with no taxable income entered there is nothing to deduct it against — no refund this year (rental losses carry forward). The shortfall is entirely real cash.';
      } else if (s.preTax >= 0) {
        txt = 'On paper this property makes a taxable loss of ' + fmt(Math.abs(s.taxableResult)) +
          ' a year, yet the cash position is positive — the loss comes from non-cash depreciation. That is the best-case version of gearing: a refund of about ' +
          fmt(s.taxEffect) + ' without a weekly out-of-pocket cost. Verify the depreciation figure against a real quantity surveyor schedule.';
      } else {
        txt = 'This property runs at a taxable loss of ' + fmt(Math.abs(s.taxableResult)) +
          ' a year. Negative gearing refunds only your marginal slice — here about ' + cents +
          'c per $1 of loss (' + fmt(s.taxEffect) + ' back at tax time). You spend $1 to get back ' + cents +
          'c; the rest is a real cash loss unless depreciation covers it. The investment must grow in value by more than the accumulated after-tax shortfall (plus buying, selling and CGT costs) to come out ahead.';
      }
      verdict.innerHTML = _callout('mort-callout mort-callout-gold', 'Negatively geared', escHtml(txt));
    } else if (s.taxableResult > 0) {
      txt = 'This property adds ' + fmt(s.taxableResult) + ' a year to your taxable income. Extra tax of about ' +
        fmt(Math.abs(s.taxEffect)) + ' applies, leaving ' + fmtS(s.afterTax) + ' a year (' + fmtS(s.afterTax / 52) +
        ' a week) in your pocket after tax. No growth assumptions needed to hold it — but check the +1% stress-test below.';
      verdict.innerHTML = _callout('mort-callout', 'Positively geared', escHtml(txt));
    } else {
      verdict.innerHTML = _callout('mort-callout', 'Neutrally geared',
        escHtml('Rent exactly covers the deductible costs — no tax effect either way this year.'));
    }
  }

  // ── Rate stress-test (+1%) ──
  var stressEl = document.getElementById('stress-callout');
  if (stressEl) {
    if (loan > 0) {
      var delta = stress.afterTax - s.afterTax;
      stressEl.innerHTML = _callout('mort-callout', 'Rate stress-test', escHtml(
        'At ' + (rate + 1).toFixed(2) + '% (your rate + 1%), after-tax cash flow becomes ' +
        fmtS(stress.afterTax / 52) + ' a week (' + fmtS(stress.afterTax) + ' a year) — a change of ' +
        fmtS(delta / 52) + ' a week. If that number breaks your budget, the deal has no buffer.'));
      stressEl.style.display = '';
    } else {
      stressEl.innerHTML = '';
      stressEl.style.display = 'none';
    }
  }

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    var cta = document.getElementById('cta');
    if (cta) cta.style.display = 'block';
    if (showErrors && window.trackCalculatorResult) trackCalculatorResult('property-cashflow', {
      propertyValue: value,
      loanAmount: loan,
      weeklyRent: weeklyRent,
      preTaxAnnual: Math.round(s.preTax),
      afterTaxAnnual: Math.round(s.afterTax),
      taxableResult: Math.round(s.taxableResult),
      repayType: repayType
    });
  }
}

/* ─ Hydrate interest rate from live RBA data (same pattern as
 *   loan-serviceability). Only replaces the untouched default. ─ */
if (typeof MarketRate !== 'undefined') {
  MarketRate.onReady(function (d) {
    if (!d) return;
    var el = document.getElementById('rate');
    if (el && el.value === '6.50') el.value = d.suggestedRate;
    var badge = document.getElementById('rate-live-badge');
    var hint = document.getElementById('rate-live-hint');
    if (badge) badge.style.display = '';
    if (hint) {
      hint.textContent = 'Live RBA-based suggestion: cash rate ' + d.cashRate.toFixed(2) +
        '% + typical lender margin ' + d.lenderMargin.toFixed(2) + '% = ' + d.suggestedRate.toFixed(2) + '%' +
        (d.rateDate ? ' — ' + d.rateDate : '');
      hint.style.display = '';
    }
    // Refresh only if a result is already on screen (avoids surfacing a
    // validation state the user never asked for).
    var res = document.getElementById('result');
    if (res && res.style.display !== 'none') calculate(false);
  });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'property-cashflow',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full investment — 30 years, not one',
    description: 'Stack purchase costs, rent growth, rate changes and equity buildup into a full 30-year projection — free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFE2', title: 'ATO: Rental Property Tax',
        links: [
          { text: 'ATO: Residential Rental Properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'ATO: How to Claim Rental Expenses', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/how-to-claim-rental-expenses' },
          { text: 'ATO: Tax Rates for Australian Residents', href: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Investment Guidance',
        links: [
          { text: 'Moneysmart: Property Investment', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'Moneysmart: Borrowing to Invest', href: 'https://moneysmart.gov.au/how-to-invest/borrowing-to-invest' },
          { text: 'RBA: Cash Rate', href: 'https://www.rba.gov.au/statistics/cash-rate/' }
        ]
      },
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State Land Tax',
        links: [
          { text: 'Revenue NSW: Land Tax', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax' },
          { text: 'SRO Victoria: Land Tax', href: 'https://www.sro.vic.gov.au/land-tax' },
          { text: 'QLD Revenue Office: Land Tax', href: 'https://qro.qld.gov.au/land-tax/' }
        ]
      }
    ],
    disclaimer: 'General information only — not tax advice. Deductibility depends on your circumstances; FY2026-27 rates apply to Australian residents. Confirm with a registered tax agent and the ATO.'
  },
  share: {
    url: 'https://equitysight.app/tools/property-cashflow-calculator',
    text: 'Just worked out my rental property’s real after-tax weekly cash flow!'
  },
  related: [
    { href: '/tools/rental-yield-calculator', icon: '\uD83D\uDCC8', label: 'Rental Yield' },
    { href: '/tools/land-tax-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Land Tax' },
    { href: '/tools/capital-gains-calculator', icon: '\uD83D\uDCC9', label: 'Capital Gains Tax' },
    { href: '/tools/borrowing-power-calculator', icon: '\uD83C\uDFE6', label: 'Borrowing Power' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/', text: 'All Calculators' },
    { href: '/tools/rental-yield-calculator', text: 'Rental Yield' },
    { href: '/tools/land-tax-calculator', text: 'Land Tax' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: '$650,000 unit, $520,000 interest-only loan at 5.5%',
      inputs: [
        { k: 'Weekly rent / vacancy', v: '$570 / 2 weeks' },
        { k: 'Cash expenses (incl. 7% mgmt)', v: '$8,495/yr' },
        { k: 'Taxable income', v: '$95,000' },
        { k: 'Depreciation', v: '$8,000/yr' }
      ],
      outputs: [
        { k: 'Pre-tax cash flow', v: '−$8,595/yr (−$165/wk)' },
        { k: 'Taxable result', v: '−$16,595 (negatively geared)' },
        { k: 'Tax benefit', v: '~$5,310' },
        { k: 'After-tax cash flow', v: '−$3,285/yr (−$63/wk)' }
      ]
    },
    {
      label: '$480,000 house, $240,000 interest-only loan at 6.0% (positively geared)',
      inputs: [
        { k: 'Weekly rent / vacancy', v: '$560 / 2 weeks' },
        { k: 'Cash expenses (incl. 7% mgmt)', v: '$7,260/yr' },
        { k: 'Taxable income', v: '$80,000' },
        { k: 'Depreciation', v: '$0' }
      ],
      outputs: [
        { k: 'Pre-tax cash flow', v: '+$6,340/yr ($122/wk)' },
        { k: 'Taxable result', v: '+$6,340 (positively geared)' },
        { k: 'Extra tax', v: '~$2,029' },
        { k: 'After-tax cash flow', v: '+$4,311/yr ($83/wk)' }
      ]
    },
    {
      label: '$750,000 house, $600,000 P&I loan at 6.0% over 30 years',
      inputs: [
        { k: 'Weekly rent / vacancy', v: '$650 / 2 weeks' },
        { k: 'Cash expenses (incl. 7% mgmt)', v: '$9,175/yr' },
        { k: 'Taxable income', v: '$120,000' },
        { k: 'Depreciation', v: '$10,000/yr' }
      ],
      outputs: [
        { k: 'P&I cash repayments', v: '~$43,168/yr' },
        { k: 'Pre-tax cash flow', v: '−$19,843/yr (−$382/wk)' },
        { k: 'Tax benefit (interest $36,000 deductible)', v: '~$7,256' },
        { k: 'After-tax cash flow', v: '−$12,587/yr (−$242/wk)' }
      ]
    }
  ],
  faq: [
    { q: 'What is negative gearing and how does the refund actually work?',
      a: 'A property is negatively geared when its deductible costs (loan interest, cash expenses, depreciation) exceed the rent. The loss reduces your taxable income, so the ATO effectively refunds it at your marginal rate. On a $16,595 loss in the 30% band (+2% Medicare), that is about $5,310 back at tax time — but you still wore the other $11,285. The refund softens a loss; it never turns a loss into a profit on its own.' },
    { q: 'Which tax rates does this calculator use?',
      a: 'FY2026-27 Australian resident rates: 0% to $18,200, 15% to $45,000, 30% to $135,000, 37% to $190,000 and 45% above, plus a flat 2% Medicare levy. The 15% band applies from 1 July 2026 and is legislated to fall to 14% from 1 July 2027. The tax effect is computed exactly across brackets, not with a single marginal-rate shortcut.' },
    { q: 'Why is my pre-tax cash flow different from my taxable result?',
      a: 'They are two different ledgers. Cash flow counts actual money movements, including the principal portion of P&I repayments (cash out, but not deductible). The taxable result counts only deductible items, including depreciation (deductible, but no cash leaves your pocket). A property can be cash-flow positive yet show a taxable loss — or the reverse.' },
    { q: 'Do I need a quantity surveyor to claim depreciation?',
      a: 'In practice, yes. The ATO accepts construction-cost estimates from a qualified quantity surveyor where the actual costs are unknown; a schedule typically costs a few hundred dollars and is itself deductible. Note that for established homes bought after 9 May 2017 you generally cannot claim depreciation on second-hand plant and equipment — capital works (Division 43) deductions may still apply for buildings constructed after September 1987.' },
    { q: 'What doesn’t this calculator cover?',
      a: 'Capital gains tax on sale (use our Capital Gains Calculator for that), LMI, borrowing-cost amortisation, PAYG withholding variations, Medicare levy fine print (the low-income phase-in, surcharge and offsets), and ownership through trusts or companies, which are taxed differently. It models one full year at a fixed rate and rent.' },
    { q: 'Is a negatively geared property a bad investment?',
      a: 'Not automatically — but the shortfall is real cash until growth exceeds it. A negatively geared property is a bet that capital growth will outrun the accumulated after-tax losses plus buying costs, selling costs and CGT. Run the +1% rate stress-test before you rely on the weekly figure, and make sure you can hold through a vacancy or a rate rise.' },
    { q: 'Do the legislated negative gearing changes affect this calculator?',
      a: 'Not for FY2026-27 — and not for grandfathered or new-build properties after that. The negative gearing reform is now law: from 1 July 2027, negative gearing deductions for residential property are limited to new builds. Properties held at 7:30pm AEST on 12 May 2026 are grandfathered, so existing holdings keep negative gearing. An established home purchased after that cut-off cannot be negatively geared from 1 July 2027. Separately, the 50% CGT discount is replaced by cost-base indexation plus a 30% minimum tax rate on gains that accrue after 1 July 2027 — that affects the exit, not the yearly cash flow modelled here. This calculator’s tax benefit computation remains correct for FY2026-27, and beyond that for grandfathered and new-build properties. Source: ATO new-legislation guidance on the Treasury Laws Amendment (Tax Reform No. 1) Act 2026.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83D\uDCC8', href: '/tools/rental-yield-calculator', label: 'Rental Yield Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/land-tax-calculator', label: 'Land Tax Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCC9', href: '/tools/capital-gains-calculator', label: 'Capital Gains Tax Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD (high yield)' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/qld/', label: 'Best QLD Investment Suburbs' }
  ]
});

/* ═══ EVENT WIRING ═══ */

window.addEventListener('DOMContentLoaded', function () {
  if (window.trackCalculatorStart) trackCalculatorStart('property-cashflow');
  updateRentHint();
  loadMedians();
  calculate(false); // renders immediately if persisted inputs are complete
  _isInit = false;

  // Currency-style inputs: thousands-separator formatting + silent recalc
  ['value', 'loan', 'rent', 'rates', 'water', 'insurance', 'maintenance',
   'strata', 'landtax', 'other', 'income', 'depreciation'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { fmtInput(this); calculate(false); });
  });

  // Pure numeric inputs: silent recalc
  ['rate', 'term', 'vacancy', 'mgmt'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { calculate(false); });
  });

  var typeEl = document.getElementById('repay-type');
  if (typeEl) typeEl.addEventListener('change', function () { calculate(false); });

  var stateEl = document.getElementById('state');
  if (stateEl) stateEl.addEventListener('change', function () {
    populateSuburbList();
    updateRentHint();
    _captionSay(''); // stale caption would misattribute the source
    calculate(false);
  });

  var medianBtn = document.getElementById('use-median-btn');
  if (medianBtn) medianBtn.addEventListener('click', function () {
    if (window.trackPageEvent) trackPageEvent('median_rent_prefill', { 'calculator': 'property-cashflow' });
    applyMedian();
  });

  var calcBtn = document.getElementById('calc-btn');
  if (calcBtn) calcBtn.addEventListener('click', function () {
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', { 'calculator': 'property-cashflow' });
    calculate(true);
  });
});

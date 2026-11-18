#!/usr/bin/env node
/**
 * make-rules-golden.js — writes tests/fixtures/rules-golden.json from the
 * OLD copies of the rules (not from shared/rules.js), so tests/rules-test.js
 * can prove that shared/rules.js gives the figures the site gave before any
 * page moved onto it.
 *
 * It was run once, against the code at tag review-base-b (commit b3ecf4d,
 * 18 Nov 2026). It reads the old copies in tools/stamp-duty-calculator.js,
 * tools/first-home-buyer-grants-calculator.js,
 * tools/borrowing-power-calculator.js, tools/mortgage-repayment-calculator.js,
 * tools/cost-of-purchase-calculator.js and journey.js. Once phases 4 to 6
 * remove those copies it no longer runs on the working tree; to re-run it,
 * check the tag out in a separate worktree:
 *
 *   git worktree add /tmp/rb review-base-b
 *   node tests/fixtures/make-rules-golden.js --root /tmp/rb --out tests/fixtures/rules-golden.json
 *
 * Never regenerate the fixture from shared/rules.js: that would be circular.
 * When a rule legitimately changes (the annual FY sweep), change the
 * expected rows by hand and say which rows and why in the commit.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractDefs } = require('../lib/source-defs');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..', '..')));
const OUT = path.resolve(arg('--out', path.join(__dirname, 'rules-golden.json')));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── Sandboxes ─────────────────────────────────────────────────────────────
// A page script with stub DOM. fmt() returns the raw number as text, so the
// figures a page writes into the DOM keep every digit.
// The real fmt() from tools/tool-page.js, for pages whose sentences carry
// formatted figures.
const realFmt = new Function(extractDefs(read('tools/tool-page.js'), ['fmt']) + '\nreturn fmt;')();
function pageSandbox(file, opts) {
  opts = opts || {};
  const els = {};
  const mk = (id) => ({
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: false, disabled: false,
    style: {}, className: '', options: [], dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, hasAttribute() { return false; }, appendChild(c) { return c; }, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {}, focus() {}, closest() { return null; }
  });
  const el = (id) => els[id] || (els[id] = mk(id));
  const tracked = [];
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const sb = {
    console, document: {
      getElementById: el, querySelector() { return null; }, querySelectorAll() { return []; },
      createElement() { return mk(''); }, addEventListener() {}, body: mk('body'), head: mk('head'), documentElement: mk('html')
    },
    ToolPage: { init() {} },
    fmt: opts.realFmt ? realFmt : (v) => String(v),
    parseVal: (id) => { const e = els[id]; return e ? (parseFloat(String(e.value || '0').replace(/[,\s]/g, '')) || 0) : 0; },
    fmtInput() {}, escHtml: (s) => String(s),
    trackCalculatorResult: (name, params) => tracked.push({ name, params }),
    trackCalculatorStart() {}, trackPageEvent() {},
    localStorage: storage, sessionStorage: storage,
    addEventListener() {}, removeEventListener() {},
    location: { search: '', pathname: '/tools/', hash: '' }, navigator: {},
    setTimeout() { return 0; }, clearTimeout() {},
    matchMedia: () => ({ matches: false })
  };
  sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(read(file), sb, { filename: file });
  return { el, run: (c) => vm.runInContext(c, sb), tracked };
}

const sd = pageSandbox('tools/stamp-duty-calculator.js');
// Figures from the grants page come from trackCalculatorResult() and its
// functions, so its sandbox keeps the real fmt() for the FHOG sentence.
const grants = pageSandbox('tools/first-home-buyer-grants-calculator.js', { realFmt: true });
const bp = pageSandbox('tools/borrowing-power-calculator.js');
const mr = pageSandbox('tools/mortgage-repayment-calculator.js');
const cop = pageSandbox('tools/cost-of-purchase-calculator.js');

// journey.js: its rules live inside an IIFE and read the visitor's state S.
// Cut the functions out and run them against an S this script controls.
const JOURNEY_NAMES = ['stateData', 'calcDuty', 'qldHomeDuty', 'qldFhbConcessionAmt', 'fhbDuty', 'buyerDutyAt',
  'FDS_CAPS', 'H2B_CAPS', 'H2B_INCOME', 'H2B_EQUITY', 'RATE', 'REG_FLAT', 'regFeesTotal', 'CONVEYANCING',
  'otherCosts', 'pay', 'lmiRate', 'approxTax', 'hemMonthly', 'INCOME_FACTOR', 'borrowLimit', 'h2bEquity',
  'h2bIssue', 'm$', 'parseNum', '_placeView', 'projPrice', 'schemeCaps', 'computePaths', 'payAt', 'isH2B',
  'fdsOk', 'budgetLmi', 'budgetLoan', 'h2bOpen', 'bDepDefault', 'incomeCeiling'];
const J = (() => {
  const src = read('journey.js');
  const body = extractDefs(src, JOURNEY_NAMES.map((n) => n.replace('$', '\\$')));
  const ret = '\nreturn {' + JOURNEY_NAMES.map((n) => JSON.stringify(n) + ': ' + n).join(', ') + '};';
  const S = {};
  const api = new Function('S', body + ret)(S);
  api.S = S;
  return api;
})();
function journeyState(p) {
  const S = J.S;
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    numbers: { price: p.price || 650000, saved: p.saved || 60000, saveMo: p.saveMo == null ? 2000 : p.saveMo, state: p.state || 'qld' },
    profile: { area: p.area || 'capital', buyers: p.buyers || 'single', fhb: p.fhb !== false, build: p.build || 'established',
      income: p.income == null ? null : p.income, dependants: p.dependants || 0, employment: p.employment || 'payg', cardLimits: p.cardLimits || 0 },
    budget: { depositPct: p.dep == null ? null : p.dep, cap: p.cap == null ? null : p.cap },
    pathPriority: 'soonest'
  });
  return S;
}

const STATES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
// The duty-sync price grid: crosses every bracket and band boundary.
const PRICES = [1000, 250000, 350001, 525000, 540001, 550000, 600000, 600001,
  600100, 600101, 650000, 700001, 710000, 725001, 725050, 750000, 800000, 800001,
  850000, 900000, 960001, 990000, 999999, 1000000, 1000001, 1290001, 1455001,
  1500000, 2000001, 3000001, 3870001, 5000001];
const REG_PRICES = PRICES.concat([4000, 15000, 35000, 60000, 90000, 150000, 180000, 185000, 205000, 450000]);

// ── Stamp duty, through the all-states page's own calculate() ─────────────
function sdRun(state, price, o) {
  const e = sd.el;
  e('state').value = state;
  sd.run('updateState()');
  e('price').value = String(price);
  e('ptype').value = o.land ? 'land' : 'home';
  e('buyer').value = o.owner ? 'owner' : 'investor';
  e('fhb').checked = !!o.fhb;
  e('foreign').checked = !!o.foreign;
  e('deposit-pct').value = String(o.depositPct == null ? 20 : o.depositPct);
  e('r-duty').textContent = '';
  sd.run('calculate()');
  return {
    duty: Number(e('r-duty').textContent),
    foreign: e('r-foreign').textContent === 'N/A' ? 0 : Number(e('r-foreign').textContent),
    total: Number(e('r-total').textContent),
    lmi: Number(String(e('r-lmi').textContent).split(/[ ,(]/)[0].replace('$', '')) || 0,
    reg: Number(String(e('r-reg').textContent).split(' ')[0]),
    note: e('r-note').textContent
  };
}
const num = (v) => Number(v);

const duty = {};
for (const st of STATES) {
  const row = { general: [], owner: [], firstHome: [], newBuild: [], firstHomeLand: [], foreignSurcharge: [] };
  for (const v of PRICES) {
    row.general.push(sdRun(st, v, { owner: false }).duty);
    row.owner.push(sdRun(st, v, { owner: true }).duty);
    row.firstHome.push(sdRun(st, v, { owner: true, fhb: true }).duty);
    // New homes: the grants calculator (documented source of the new-home
    // reliefs) and journey.js buyerDutyAt() give the same figure (checked
    // below).
    const neu = grants.run(`fhbDuty(STATES['${st}'], '${st}', ${v}, true)`);
    journeyState({ state: st, fhb: true, build: 'new' });
    const jneu = J.buyerDutyAt(v);
    if (Math.abs(neu - jneu) > 1e-9) throw new Error('new build sources disagree ' + st + ' ' + v);
    row.newBuild.push(neu);
    row.firstHomeLand.push(sdRun(st, v, { owner: true, fhb: true, land: true }).duty);
    row.foreignSurcharge.push(sdRun(st, v, { owner: false, foreign: true }).foreign);
  }
  duty[st] = row;
}
// The journey's step 1 duty for a buyer who has owned before (always a home
// to live in) is the all-states page's owner-occupier figure.
for (const st of STATES) PRICES.forEach((v, i) => {
  journeyState({ state: st, fhb: false });
  if (Math.abs(J.buyerDutyAt(v) - duty[st].owner[i]) > 1e-9) throw new Error('journey owner duty differs ' + st + ' ' + v);
  journeyState({ state: st, fhb: true });
  if (Math.abs(J.buyerDutyAt(v) - duty[st].firstHome[i]) > 1e-9) throw new Error('journey first home duty differs ' + st + ' ' + v);
});

// Notes the all-states page shows, by case, at three prices.
const dutyNotes = [];
for (const st of STATES) for (const v of [650000, 750000, 850000]) {
  for (const [label, o] of [['owner', { owner: true }], ['firstHome', { owner: true, fhb: true }], ['firstHomeLand', { owner: true, fhb: true, land: true }]]) {
    dutyNotes.push([st, v, label, sdRun(st, v, o).note]);
  }
}

// QLD and other foreign buyers: cost of purchase applies the 1 Aug 2026 QLD
// rule (general rate plus surcharge, whatever the first home and live-in
// boxes say). Figures are duty plus surcharge.
const foreign = [];
for (const st of STATES) for (const v of [450000, 650000, 750000, 1100000]) for (const fhb of [false, true]) for (const owner of [true, false]) {
  const d = cop.run(`buyerDuty('${st}', ${v}, ${fhb}, ${owner}, true)`) + v * (cop.run(`stateData['${st}'].foreignRate`) || 0);
  foreign.push([st, v, fhb, owner, d]);
}

// ── Registration ──────────────────────────────────────────────────────────
const registration = { prices: REG_PRICES };
for (const st of STATES) {
  registration[st] = REG_PRICES.map((v) => sd.run(`regFeesTotal('${st}', ${v})`));
  REG_PRICES.forEach((v, i) => { if (J.regFeesTotal(st, v) !== registration[st][i]) throw new Error('journey registration differs ' + st + ' ' + v); });
}
const legalAndRegistration = {};
for (const st of STATES) {
  journeyState({ state: st });
  legalAndRegistration[st] = REG_PRICES.map((v) => J.otherCosts(v));
}

// ── LMI ───────────────────────────────────────────────────────────────────
const LVRS = [0.5, 0.79, 0.8, 0.8000000000000002, 0.80004, 0.80005, 0.8001, 0.85, 0.8501, 0.9, 0.9000000000000001, 0.9001, 0.95, 0.9500000000000001, 0.9501, 0.98, 0.99, 1.05];
const lmiRates = LVRS.map((l) => [l, J.lmiRate(l), sd.run(`estimateLmiTier(${l}).label`)]);
LVRS.forEach((l) => { if (sd.run(`estimateLmiTier(${l}).rate`) !== J.lmiRate(l)) throw new Error('LMI tier copies differ at ' + l); });
// LMI with no scheme on a loan of price less the deposit, LMI added to the
// loan (journey.js budgetLmi / budgetLoan with a buyer who isn't a first
// home buyer, so no scheme waives it).
const LMI_PRICES = [145758, 146443, 300000, 450000, 585000, 650000, 777777, 800000, 1100000, 1500000];
const LMI_DEPS = [0.05, 0.1, 0.15, 0.19, 0.2, 0.25];
const lmiRows = [];
for (const v of LMI_PRICES) for (const dep of LMI_DEPS) {
  journeyState({ state: 'qld', fhb: false });
  lmiRows.push([v, Math.round(dep * 10000) / 100, J.budgetLmi(v, dep), J.budgetLoan(v, dep)]);
}
// The grants calculator's whole-dollar LMI (5% deposit) and the all-states
// page's whole-dollar LMI at its deposit box.
const lmiRounded = [];
for (const v of LMI_PRICES) lmiRounded.push([v, grants.run(`estimateLmi(${v} * 0.95, ${v})`)]);
const sdLmi = [];
for (const v of [450000, 650000, 900000]) for (const dp of [5, 10, 15, 20]) sdLmi.push([v, dp, sdRun('nsw', v, { owner: true, depositPct: dp }).lmi]);

// ── FHOG, schemes, FHSS ───────────────────────────────────────────────────
const FHOG_PRICES = [450000, 599999, 600000, 600001, 700000, 749999, 750000, 750001, 800000, 800001, 1200000];
function grantsRun(st, price, ptype, couple, location, income) {
  const e = grants.el;
  e('state').value = st; e('price').value = String(price); e('ptype').value = ptype;
  e('couple').value = couple; e('location').value = location; e('income').value = String(income);
  grants.tracked.length = 0;
  grants.run('_isInit = false; calculate(); _isInit = true;');
  const t = grants.tracked[0] && grants.tracked[0].params;
  const html = e('results-container').innerHTML;
  const fhogNote = (html.match(/First Home Owner Grant<\/div>[\s\S]*?<div class="fhb-row-note">([\s\S]*?)<\/div>/) || [])[1];
  return { t, fhogNote };
}
const fhog = [];
for (const st of STATES) for (const v of FHOG_PRICES) for (const ptype of ['established', 'new', 'offplan']) {
  const r = grantsRun(st, v, ptype, 'single', 'capital', 90000);
  fhog.push([st, v, ptype, r.t.fhog, r.fhogNote]);
}
const grantsTotals = [];
for (const st of STATES) for (const v of [450000, 650000, 750000, 950000]) for (const ptype of ['established', 'new']) for (const location of ['capital', 'other']) {
  const r = grantsRun(st, v, ptype, 'couple', location, 150000);
  grantsTotals.push([st, v, ptype, location, r.t.sdSaving, r.t.fhog, r.t.totalCash, r.t.fhbgEligible, r.t.helpToBuyEligible]);
}
const fds = [];
for (const st of STATES) for (const location of ['capital', 'other']) for (const v of [499999, 500000, 500001, 600000, 650000, 700000, 750000, 800000, 850000, 900000, 950000, 1000000, 1000001, 1500000, 1500001]) {
  const r = grants.run(`fdsEligibility(STATES['${st}'], ${v}, ${location === 'capital'})`);
  journeyState({ state: st, area: location === 'capital' ? 'capital' : 'regional', fhb: true });
  if (J.fdsOk(v) !== r.eligible) throw new Error('FDS copies differ ' + st + ' ' + v);
  fds.push([st, location === 'capital' ? 'capital' : 'regional', v, r.eligible, r.propertyCap, r.lmiAvoided]);
}
const h2b = [];
for (const st of STATES) for (const location of ['capital', 'other']) for (const v of [500000, 650000, 800000, 1000000, 1300000]) {
  for (const [buyers, deps, income] of [['single', 0, 90000], ['single', 0, 103000], ['single', 0, 103001], ['couple', 0, 165000], ['couple', 0, 165001], ['single', 2, 150000], ['single', 1, 170000], ['single', 0, null]]) {
    for (const build of ['established', 'new']) {
      // The Journey's rule: capFor couple or single parent.
      journeyState({ state: st, area: location === 'capital' ? 'capital' : 'regional', fhb: true, buyers, dependants: deps, income, build });
      // The Journey's sentence, as a code: 'price' (over the price cap) or
      // 'income' (over the income cap for this household).
      const text = J.h2bIssue(v);
      const issue = !text ? null : /price cap/.test(text) ? 'price' : /^Income above/.test(text) ? 'income' : 'other:' + text;
      const share = v * J.h2bEquity();
      // The grants calculator, which has no dependants input; skipped for
      // single parents and for no income (it shows nothing then).
      let g = null;
      if (deps === 0 && income != null) {
        const r = grants.run(`helpToBuyEligibility(STATES['${st}'], ${v}, ${income}, ${buyers === 'couple'}, ${build === 'new'}, ${location === 'capital'})`);
        g = [r.eligible, r.incomeCap, r.propertyCap, r.equityShare, r.governmentEquity, r.yourBorrowingRequired];
      }
      h2b.push([st, location === 'capital' ? 'capital' : 'regional', v, buyers, deps, income, build, issue, J.h2bOpen(v), share, g]);
    }
  }
}
const fhss = { maxContribAnnual: grants.run('FHSS_MAX_CONTRIB_ANNUAL'), maxTotal: grants.run('FHSS_MAX_TOTAL') };

// ── Tax, HELP, living costs ───────────────────────────────────────────────
const TAX_INCOMES = [0, 18200, 18201, 20000, 28011, 28012, 30000, 35013, 35014, 45000, 45001, 54435, 60000, 69528, 69529, 82500,
  90000, 95000, 120000, 129717, 129718, 135000, 135001, 160000, 186050, 186051, 190000, 190001, 250000, 400000];
const tax = TAX_INCOMES.map((g) => [g, bp.run(`approxTax(${g})`), bp.run(`hecsAnnual(${g})`)]);
TAX_INCOMES.forEach((g) => { if (bp.run(`approxTax(${g})`) !== J.approxTax(g)) throw new Error('approxTax copies differ ' + g); });
const hem = [];
for (const inc of [0, 49999, 50000, 79999, 80000, 119999, 120000, 165000, 179999, 180000, 249999, 250000, 349999, 350000, 500000]) {
  for (const adults of [1, 2]) for (const deps of [0, 1, 2, 3, 4, 6]) hem.push([inc, adults, deps, bp.run(`hemMonthly(${inc}, ${adults}, ${deps})`)]);
}
const incomeTypeFactor = {};
for (const t of ['payg', 'paygVariable', 'casual', 'self-employed', 'rental', 'unknown']) incomeTypeFactor[t] = bp.run(`incomeTypeFactor('${t}')`);
const journeyIncomeFactor = J.INCOME_FACTOR;

// ── Borrowing: the calculator's own calc() and the Journey's borrowLimit() ─
function bpRun(c) {
  const e = bp.el;
  e('mode').value = c.mode; e('income1').value = String(c.income1); e('type1').value = c.type1 || 'payg'; e('hecs1').checked = !!c.hecs1;
  e('income2').value = String(c.income2 || 0); e('type2').value = c.type2 || 'payg'; e('hecs2').checked = !!c.hecs2;
  e('deps').value = String(c.deps || 0); e('card-limit').value = String(c.card || 0); e('other-debt').value = String(c.debt || 0);
  e('expenses').value = String(c.expenses || 0); e('rate').value = String(c.rate); e('term').value = String(c.term || 30); e('lvr').value = '80';
  e('r-loan').textContent = ''; e('r-net').textContent = '';
  bp.run('calc()');
  return { maxLoan: num(e('r-loan').textContent), net: num(e('r-net').textContent) };
}
const BP_CASES = [
  { mode: 'joint', income1: 95000, income2: 70000, rate: 6.25 },
  { mode: 'joint', income1: 95000, income2: 70000, rate: 6.0 },
  { mode: 'single', income1: 95000, rate: 6.25 },
  { mode: 'single', income1: 60000, rate: 6.25, card: 10000 },
  { mode: 'joint', income1: 95000, income2: 70000, rate: 6.0, hecs1: true, debt: 450 },
  { mode: 'joint', income1: 82500, income2: 82500, rate: 6.0, card: 10000 },
  { mode: 'joint', income1: 120000, income2: 0, rate: 6.25, deps: 2, expenses: 6000 },
  { mode: 'single', income1: 140000, type1: 'self-employed', hecs1: true, rate: 5.89, term: 25 },
  { mode: 'joint', income1: 70000, type1: 'casual', income2: 55000, type2: 'paygVariable', rate: 6.25, deps: 1, card: 15000, debt: 300 },
  { mode: 'single', income1: 48000, type1: 'rental', rate: 6.25 },
  { mode: 'joint', income1: 250000, income2: 190000, hecs1: true, hecs2: true, rate: 7.1, deps: 4, expenses: 9000 },
  { mode: 'single', income1: 30000, rate: 6.25, card: 20000 }
];
const borrowCalculator = BP_CASES.map((c) => Object.assign({}, c, bpRun(c)));
const J_CASES = [
  { buyers: 'couple', income: 165000 },
  { buyers: 'couple', income: 165000, cardLimits: 10000 },
  { buyers: 'single', income: 95000 },
  { buyers: 'single', income: 95000, employment: 'self' },
  { buyers: 'couple', income: 120000, employment: 'casual', dependants: 2 },
  { buyers: 'couple', income: 210000, dependants: 3 },
  { buyers: 'couple', income: 210000, dependants: 5 },
  { buyers: 'single', income: 40000, cardLimits: 30000 },
  { buyers: 'single', income: 0 },
  { buyers: 'single', income: null }
];
const borrowJourney = J_CASES.map((c) => {
  journeyState(c);
  const L = J.borrowLimit();
  return Object.assign({}, c, { result: L });
});

// ── Repayments and schedules ──────────────────────────────────────────────
const repay = [];
for (const loan of [100000, 400000, 585000, 596115, 650000, 832649, 1200000]) for (const rate of [0, 3.5, 5.89, 6, 6.25, 9, 9.25]) for (const years of [25, 30]) {
  repay.push([loan, rate, years, mr.run(`piMonthly(${loan}, ${rate} / 100, ${years})`), J.payAt(loan, rate)]);
}
const schedules = [];
for (const c of [
  { loan: 585000, rate: 6.25, years: 30 },
  { loan: 500000, rate: 6.0, years: 30, extra: 500 },
  { loan: 500000, rate: 6.0, years: 30, offset: 50000 },
  { loan: 650000, rate: 6.5, years: 30, ioYears: 5 },
  { loan: 650000, rate: 6.5, years: 30, ioYears: 5, extra: 200, offset: 20000 },
  { loan: 300000, rate: 0, years: 20 },
  { loan: 450000, rate: 5.5, years: 25, extra: 2000 }
]) {
  const annual = c.rate / 100;
  const monthlyPI = mr.run(`piMonthly(${c.loan}, ${annual}, ${c.years})`);
  const s = mr.run(`simulateAmortisation({ principal: ${c.loan}, annualRate: ${annual}, years: ${c.years}, repayMonthly: ${monthlyPI}, extraMonthly: ${c.extra || 0}, offsetBalance: ${c.offset || 0}, ioYears: ${c.ioYears || 0} })`);
  const f = mr.run(`simulateFortnightly({ principal: ${c.loan}, annualRate: ${annual}, years: ${c.years}, monthlyPI: ${monthlyPI} })`);
  schedules.push(Object.assign({}, c, { monthly: monthlyPI, monthsToPayoff: s.monthsToPayoff, totalInterest: s.totalInterest, paidOffEarly: s.paidOffEarly, postIoPayment: s.postIoPayment, schedule: JSON.parse(JSON.stringify(s.schedule)), fortnightly: { fortnights: f.fortnights, totalInterest: f.totalInterest, willPayOff: f.willPayOff } }));
}

// ── Journey step 3 (budget) and step 2 (paths) ────────────────────────────
// Step 3 shows, at the committed maximum and the chosen deposit: duty,
// legal and registration, LMI, loan, cash needed and the repayment at 6.00%
// and at the 9.00% the lender tests. The deposit chips are 2% (Help to Buy,
// offered only when open), 5% (with the 5% Deposit Scheme for a first home
// buyer under the cap), 10% and 20%.
// Every row is a couple on $150,000 a year.
const journeyStep3 = { columns: ['state', 'price', 'firstHome', 'build', 'area', 'depositPct', 'scheme', 'duty', 'legalAndRegistration', 'lmi', 'loan', 'cashNeeded', 'repayAt6', 'testedAt9'], buyers: 'couple', income: 150000, rows: [] };
for (const st of STATES) for (const cap of [450000, 650000, 800000, 1100000]) {
  for (const [fhb, build, area] of [[true, 'established', 'capital'], [true, 'new', 'capital'], [true, 'established', 'regional'], [false, 'established', 'capital']]) {
    for (const dep of [0.02, 0.05, 0.1, 0.2]) {
      journeyState({ state: st, fhb, build, area, buyers: 'couple', income: 150000, cap, dep });
      if (dep === 0.02 && !J.h2bOpen(cap)) continue;
      const scheme = J.isH2B(dep) ? 'h2b' : (Math.abs(dep - 0.05) < 0.001 && J.fdsOk(cap) ? 'fds' : 'none');
      const d = J.buyerDutyAt(cap);
      const other = J.otherCosts(cap);
      const lmi = J.budgetLmi(cap, dep);
      const loan = J.budgetLoan(cap, dep);
      journeyStep3.rows.push([st, cap, fhb, build, area, Math.round(dep * 10000) / 100, scheme, d, other, lmi, loan, cap * dep + (d + other), J.payAt(loan, 6.0), J.payAt(loan, 9.0)]);
    }
  }
}
// Step 3's suggested maximum: the highest price whose loan fits the
// borrowing estimate, rounded down to $5,000.
const journeyCeiling = [];
for (const st of ['qld', 'nsw', 'vic', 'wa']) for (const [buyers, income, cards] of [['couple', 165000, 0], ['couple', 165000, 10000], ['single', 95000, 0], ['single', 60000, 5000]]) {
  for (const dep of [0.02, 0.05, 0.1, 0.2]) {
    journeyState({ state: st, fhb: true, buyers, income, cardLimits: cards, area: 'capital' });
    journeyCeiling.push({ state: st, buyers, income, cardLimits: cards, firstHome: true, area: 'capital', build: 'established', dep, ceiling: J.incomeCeiling(dep) });
  }
}
const journeyStep2 = [];
for (const st of ['qld', 'nsw', 'sa', 'wa']) for (const price of [500000, 650000, 900000]) {
  journeyState({ state: st, fhb: true, buyers: 'couple', income: 150000, price, saved: 60000, saveMo: 2000 });
  const R = J.computePaths();
  journeyStep2.push({ state: st, price, paths: R.paths.map((p) => ({ name: p.name, need: p.need, lmi: p.lmi, loan: p.loan, rep: p.rep, govShare: p.govShare, eligible: p.eligible })) });
}

// ── Money parser (journey.js parseNum) ────────────────────────────────────
const MONEY = ['650,000', '$650000', '650k', '650 K', '1.2m', '1.2M', '$1,250,000', '650 000', '0', '50000', '1,234.56', '.5m', '725050'];
const parseMoney = MONEY.map((s) => [s, J.parseNum(s)]);

// ── Intended moves: where today's pages and shared/rules.js part ─────────
const fhbInvestor = [];
for (const st of STATES) for (const v of [450000, 650000, 750000, 850000, 950000]) {
  const today = sdRun(st, v, { owner: false, fhb: true }).duty;
  const general = sdRun(st, v, { owner: false }).duty;
  if (today !== general) fhbInvestor.push([st, v, today, general]);
}
const qldLandInvestor = [];
for (const v of [300000, 650000]) qldLandInvestor.push(['qld', v, sdRun('qld', v, { owner: false, fhb: true, land: true }).duty, sdRun('qld', v, { owner: false, land: true }).duty]);
const newHomesAllStates = [];
for (const st of STATES) for (const v of [450000, 650000, 750000, 900000]) {
  const today = sdRun(st, v, { owner: true, fhb: true }).duty;
  const neu = grants.run(`fhbDuty(STATES['${st}'], '${st}', ${v}, true)`);
  if (today !== neu) newHomesAllStates.push([st, v, today, neu]);
}
const qldForeignAllStates = [];
for (const v of [450000, 650000, 750000]) for (const [fhb, owner] of [[true, true], [false, true]]) {
  const r = sdRun('qld', v, { owner, fhb, foreign: true });
  const general = sdRun('qld', v, { owner: false }).duty;
  qldForeignAllStates.push(['qld', v, fhb, owner, r.total, general + v * 0.08]);
}

const out = {
  about: 'Golden rows for tests/rules-test.js, generated by tests/fixtures/make-rules-golden.js from the old copies of the rules at tag review-base-b (commit b3ecf4d, 18 Nov 2026), never from shared/rules.js. Money is in dollars, not rounded, exactly as each source computed it. Synthetic inputs only.',
  generatedFrom: {
    tag: 'review-base-b', commit: 'b3ecf4d',
    duty: 'tools/stamp-duty-calculator.js calculate() (general, owner, firstHome, firstHomeLand, foreignSurcharge); tools/first-home-buyer-grants-calculator.js fhbDuty(…, true) for newBuild, checked against journey.js buyerDutyAt()',
    foreign: 'tools/cost-of-purchase-calculator.js buyerDuty() plus the surcharge (the QLD 1 Aug 2026 rule)',
    registration: 'tools/stamp-duty-calculator.js regFeesTotal(), checked against journey.js',
    legalAndRegistration: 'journey.js otherCosts()',
    lmi: 'journey.js lmiRate(), budgetLmi(), budgetLoan(); tools/stamp-duty-calculator.js estimateLmiTier() labels and on-screen LMI; tools/first-home-buyer-grants-calculator.js estimateLmi()',
    h2bColumns: 'state, area, price, buyers, dependants, income, build, journey issue (null, price or income), journey h2bOpen, share (price x journey equity), grants calculator [eligible, incomeCap, propertyCap, equityShare, governmentEquity, yourBorrowingRequired] or null (no dependants input, no income)',
    schemes: 'tools/first-home-buyer-grants-calculator.js calculate(), fdsEligibility(), helpToBuyEligibility(); journey.js fdsOk(), h2bIssue(), h2bOpen(), h2bEquity()',
    tax: 'tools/borrowing-power-calculator.js approxTax(), hecsAnnual(), hemMonthly(), incomeTypeFactor(), calc()',
    borrowJourney: 'journey.js borrowLimit() (dependants capped at 3, no HELP, debts or declared living costs, as today)',
    repay: 'tools/mortgage-repayment-calculator.js piMonthly() and journey.js payAt()',
    schedules: 'tools/mortgage-repayment-calculator.js simulateAmortisation() and simulateFortnightly()',
    journeyStep3: 'journey.js renderBudgetDash() figures: buyerDutyAt, otherCosts, budgetLmi, budgetLoan, cap x deposit + costs, payAt(loan, 6) and payAt(loan, 9)',
    journeyCeiling: 'journey.js incomeCeiling()',
    journeyStep2: 'journey.js computePaths()',
    parseMoney: 'journey.js parseNum()'
  },
  states: STATES,
  prices: PRICES,
  duty, dutyNotes, foreign,
  registration, legalAndRegistration,
  lmiRates, lmiRows, lmiRounded, sdLmi,
  fhog, grantsTotals, fds, h2b, fhss,
  tax, hem, incomeTypeFactor, journeyIncomeFactor,
  borrowCalculator, borrowJourney,
  repay, schedules,
  journeyStep3, journeyCeiling, journeyStep2,
  parseMoney,
  intendedMoves: [
    { id: 'fhb-investor', finding: 'p-search-calc-5', phase: '6 (lane A: the all-states page and the 8 state pages; lane B: deposit, cost of purchase, auction budget)',
      what: 'A first home buyer who chooses Investor pays the general rate. Today the pages give the first home concession. Rows: state, price, today, rules.', rows: fhbInvestor },
    { id: 'qld-land-investor', finding: 'p-search-calc-5', phase: '6 (lane A)',
      what: 'QLD first home vacant land bought as an investment pays the general rate. Today the all-states and QLD pages show $0. Rows: state, price, today, rules.', rows: qldLandInvestor },
    { id: 'new-homes-all-states', finding: 'x-calc-consistency', phase: '6 (lane A: a new-home choice on the all-states page)',
      what: 'A first home buyer’s new home pays no duty in QLD and SA. The all-states page has no new-home choice today, so it shows the established-home figure. Rows: state, price, today (established), rules (new home).', rows: newHomesAllStates },
    { id: 'qld-foreign', finding: null, phase: '6 (lane A: the all-states and QLD pages)',
      what: 'A QLD foreign buyer pays the general rate plus the 8% surcharge (cost of purchase already does). Today the all-states and QLD pages add the surcharge to the concessional duty. Rows: state, price, firstHome, owner-occupier, today (duty + surcharge), rules (duty + surcharge).', rows: qldForeignAllStates },
    { id: 'qld-owner-deposit-cop', finding: null, phase: 'none',
      what: 'QLD owner-occupier duty on the deposit and cost of purchase pages: none differ today (tests/state-duty-sync-test.js section 4a).', rows: [] },
    { id: 'lmi-on-loan', finding: 'p-search-calc-4, x-calcs-buy-3', phase: '6 (lanes A and B)',
      what: 'The stamp duty, deposit and cost of purchase pages count LMI in the cash needed today; purchase() adds it to the loan (the Journey’s rule). Not a change to any figure in this file.', rows: [] },
    { id: 'journey-dependants-cap', finding: null, phase: '4',
      what: 'journey.js borrowLimit() caps dependants at 3; borrow() does not. The Journey passes min(3, dependants) until phase 4 (see borrowJourney rows with 5 dependants).', rows: [] },
    { id: 'journey-h2b-ceiling', finding: null, phase: '4',
      what: 'journey.js incomeCeiling() at a 2% deposit always uses the Help to Buy loan, even above the Help to Buy price cap. purchase() applies a scheme only where it fits. journeyCeiling rows at dep 0.02 carry the old figure.', rows: [] }
  ]
};

// One top-level key per line, one row per line below that, so a changed
// figure shows up as a one-line diff.
function layout(v, depth) {
  const pad = ' '.repeat(depth + 1), end = ' '.repeat(depth);
  if (depth >= 2 || v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length || v.every((x) => x === null || typeof x !== 'object')) return JSON.stringify(v);
    return '[\n' + v.map((x) => pad + layout(x, depth + 1)).join(',\n') + '\n' + end + ']';
  }
  return '{\n' + Object.keys(v).map((k) => pad + JSON.stringify(k) + ': ' + layout(v[k], depth + 1)).join(',\n') + '\n' + end + '}';
}
fs.writeFileSync(OUT, layout(out, 0) + '\n');
console.log('wrote ' + path.relative(process.cwd(), OUT) + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');

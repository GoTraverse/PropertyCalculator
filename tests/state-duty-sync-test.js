/**
 * state-duty-sync-test.js — the duty, fee, tax and LMI figures on the
 * calculator pages agree with shared/rules.js, whether a page still has its
 * own copy of a rule or has moved onto the rules file.
 *
 * shared/rules.js is the one source (build plan section 5). Every page runs
 * in a sandbox with a stub DOM and shared/rules.js preloaded (window.Rules),
 * so a page that has moved works here as it does in a browser. For each
 * check:
 *   - a page or function that still holds its own copy is compared with
 *     shared/rules.js;
 *   - a copy that is gone is skipped, and the page's HTML must then load
 *     /shared/rules.js before the page's own script;
 *   - on-screen figures are always compared.
 * Intended moves (tests/fixtures/rules-golden.json, "intendedMoves"): only
 * while a page still has its own duty engine, a first home buyer who isn't
 * living in it may show today's first home figure (fhb-investor) and a QLD
 * foreign buyer on a duty page may show the concession plus the surcharge
 * (qld-foreign). Once the page is on the rules file it must show the rules
 * file's figure (p-search-calc-5). Pages moving onto rules.js don't need to
 * edit this test.
 *
 *   1. The all-states page and the 8 state pages: on-screen duty for
 *      dwelling and vacant land x standard and first home buyer x
 *      owner-occupier and investor x a price grid crossing every bracket;
 *      the registration line; the LMI line at every tier; the foreign
 *      surcharge and duty plus surcharge.
 *   2. The duty engines in deposit, cost of purchase and the grants
 *      calculator (general and first home duty, cost of purchase's
 *      registration fees, the grants calculator's new-home rule); the NSW,
 *      WA and VIC first home bands and NSW general duty to the cent in every
 *      copy; the grants calculator's FHOG and scheme tables, Help to Buy and
 *      FHSS constants and eligibility functions, and its on-screen total.
 *   3. Income tax and the living-cost floor in borrowing power and loan
 *      serviceability, and the cash flow and capital gains calculators'
 *      income tax, for every whole dollar from $0 to $260,000.
 *   4. The upfront-cost calculators (deposit, cost of purchase, auction
 *      budget), through their own calc functions: on-screen duty, the QLD
 *      foreign buyer rule on cost of purchase, one conveyancing figure and
 *      one building-and-pest figure everywhere; the LMI tier copies on the
 *      all-states page, the 8 state pages, deposit, cost of purchase, the
 *      auction budget, the grants and mortgage repayment calculators and
 *      journey.js; the mortgage repayment calculator's repayment and
 *      schedules; the auction plan on screen against the plan built from
 *      shared/rules.js (duty, every row, the walk-away price and the savings
 *      note) and its error path.
 * Not compared: app.js, whose figures differ and which phase 5 deletes
 * (its page says so).
 *
 * Run: node tests/state-duty-sync-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Rules = require('../shared/rules');
const { findDefs, extractDefs } = require('./lib/source-defs');
const { rulesLoadsFirst } = require('./lib/script-order');

const ROOT = path.join(__dirname, '..');
const TOOLS = path.join(ROOT, 'tools');
const RULES_SRC = fs.readFileSync(path.join(ROOT, 'shared', 'rules.js'), 'utf8');

/* ── Minimal DOM stub: enough for the tool scripts to load and calculate ── */
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: false,
    style: {}, className: '', options: [], children: [], dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, focus() {}, closest() { return null; }
  };
}

function loadPage(name) {
  const html = fs.readFileSync(path.join(TOOLS, name + '.html'), 'utf8');
  const els = {};
  let m;
  const reInput = /<input\b[^>]*>/g;
  while ((m = reInput.exec(html))) {
    const id = (m[0].match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const el = makeEl(id);
    el.value = (m[0].match(/\bvalue="([^"]*)"/) || [])[1] || '';
    el.checked = /\bchecked\b/.test(m[0]);
    els[id] = el;
  }
  const reSel = /<select\b[^>]*>([\s\S]*?)<\/select>/g;
  while ((m = reSel.exec(html))) {
    const id = (m[0].match(/<select\b[^>]*\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const el = makeEl(id);
    const first = m[1].match(/<option\b[^>]*value="([^"]*)"/);
    el.value = first ? first[1] : '';
    els[id] = el;
  }
  for (const mm of html.matchAll(/\bid="([^"]+)"/g)) if (!els[mm[1]]) els[mm[1]] = makeEl(mm[1]);
  els.cta = els.cta || makeEl('cta');

  const document = {
    getElementById(id) { return els[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeEl(''); },
    addEventListener() {},
    body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html')
  };
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const sb = {
    document, localStorage: storage, sessionStorage: storage, console,
    setTimeout() { return 0; }, clearTimeout() {},
    fetch() { return Promise.reject(new Error('no network in tests')); },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    navigator: {}, location: { search: '', pathname: '/tools/' + name, hash: '' }
  };
  sb.window = sb; sb.self = sb;
  sb.matchMedia = () => ({ matches: false });
  sb.addEventListener = () => {};
  vm.createContext(sb);
  vm.runInContext(RULES_SRC, sb, { filename: 'shared/rules.js' });
  vm.runInContext(fs.readFileSync(path.join(TOOLS, 'tool-page.js'), 'utf8'), sb, { filename: 'tool-page.js' });
  const js = fs.readFileSync(path.join(TOOLS, name + '.js'), 'utf8');
  vm.runInContext(js, sb, { filename: name + '.js' });
  return {
    name, els, html, js,
    run: (code) => vm.runInContext(code, sb),
    defines: (id) => findDefs(js, [id]).length > 0,
    // "/shared/rules.js" or "../shared/rules.js", before the page's own
    // script (the sandbox always preloads it, so only the HTML can show
    // the order).
    rulesCheck: () => rulesLoadsFirst(html, 'tools/' + name + '.html', 'tools/' + name + '.js')
  };
}

const STATES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
const PRICES = [1000, 14000, 250000, 300000, 350001, 400000, 450000, 500000, 525000,
  540001, 550000, 600000, 600001, 600100, 600101, 640000, 650000, 700000, 700001, 705000,
  710000, 725001, 725050, 750000, 780000, 799999, 800000, 800001, 850000, 900000, 950000,
  960001, 990000, 999999, 1000000, 1000001, 1100000, 1290001, 1455001, 1500000, 2000001,
  3000001, 3870001, 5000001];
// Duty engine identifiers: a page that defines none of them has no copy.
const ENGINE_IDS = ['stateData', '_SD_STATE_DATA', 'calcDuty', 'calc\\w*Duty', 'qldHomeDuty', '_qldHomeDuty', 'applyFhbConcession',
  'fhbDuty', 'stampDutyEstimate', 'calc(?:NSW|VIC|Qld|QLD|SA|WA|TAS|ACT|NT)\\w*'];

let checks = 0;
let fails = 0;
function fail(msg) { fails++; if (fails <= 40) console.error('FAIL ' + msg); }
const notes = [];
function close(a, b) { return Math.abs(a - b) < 0.51; }
function money(s) { // "$15,100", "15,100", "$1,800 (my flat estimate…)" → number
  const m = String(s).replace(/−/g, '-').match(/-?\$?\s*([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}
// A missing function or element in one of the tools is a failure, reported
// without stopping the run.
function part(name, fn) {
  try { fn(); } catch (e) { checks++; fail(`${name}: ${e.message}`); }
}
function hasCopy(page) { return findDefs(page.js, ENGINE_IDS).length > 0; }
const rulesChecked = new Set();
function requireRules(page, why) {
  if (rulesChecked.has(page.name)) return;
  rulesChecked.add(page.name);
  checks++;
  const r = page.rulesCheck();
  if (!r.ok) fail(`tools/${page.name}.html must load /shared/rules.js before tools/${page.name}.js (${why}), but ${r.why}`);
}
// A copy of one rule, cut out of a page's source (for functions nested
// inside calculate(), which the sandbox can't call). null when it's gone.
function cutOut(page, name) {
  if (!page.defines(name)) return null;
  try { return new Function(extractDefs(page.js, [name]) + '\nreturn ' + name + ';')(); } catch (e) { checks++; fail(`${page.name} ${name}(): could not be cut out and run (${e.message})`); return null; }
}

// Duty from shared/rules.js. occ: 'home' or 'invest'.
function rulesDuty(st, price, o) {
  return Rules.duty({ state: st, price, firstHome: !!o.fhb, occupancy: o.occ, land: !!o.land, foreign: !!o.foreign, build: o.build });
}
// The figures a page may show. While the page has its own copy, a first
// home buyer who chooses Investor may still get the first home figure
// (intended move fhb-investor, phase 6).
function allowedDuty(st, price, o, pageHasCopy) {
  const want = [rulesDuty(st, price, o).duty];
  if (o.fhb && o.occ === 'invest' && pageHasCopy) want.push(rulesDuty(st, price, Object.assign({}, o, { occ: 'home' })).duty);
  return want;
}

/* ── 1. The all-states page and the 8 state pages (on-screen duty) ── */
const main = loadPage('stamp-duty-calculator');
const DUTY_PAGES = [main].concat(STATES.map((st) => loadPage('stamp-duty-calculator-' + st)));
const statePage = (st) => DUTY_PAGES.find((p) => p.name === 'stamp-duty-calculator-' + st);
// Runs one of the 9 pages' calculate() and returns its elements.
// o: { ptype ('home' | 'land'), buyer ('owner' | 'investor'), fhb, foreign, depositPct }
function pageRun(page, state, price, o) {
  const e = page.els;
  if (e.state && page.name === 'stamp-duty-calculator') { e.state.value = state; page.run('updateState()'); }
  e.price.value = String(price);
  e.ptype.value = o.ptype || 'home';
  if (e.buyer) e.buyer.value = o.buyer || 'owner';
  e.fhb.checked = !!o.fhb;
  if (e.foreign) e.foreign.checked = !!o.foreign;
  if (e['deposit-pct']) e['deposit-pct'].value = String(o.depositPct == null ? 20 : o.depositPct);
  for (const id of ['r-duty', 'r-foreign', 'r-total', 'r-lmi', 'r-reg', 'r-conveyancing']) if (e[id]) e[id].textContent = '';
  page.run('calculate()');
  return e;
}
function pageDuty(page, state, price, ptype, buyer, fhb) {
  return pageRun(page, state, price, { ptype, buyer, fhb })['r-duty'].textContent;
}
const fmt = (v) => main.run(`fmt(${v})`);

for (const page of DUTY_PAGES) {
  const isMain = page.name === 'stamp-duty-calculator';
  const st0 = isMain ? null : page.name.slice('stamp-duty-calculator-'.length);
  const copy = hasCopy(page);
  if (!copy) requireRules(page, 'it has no duty engine of its own');
  const hasBuyer = !!page.els.buyer;
  if (!isMain) {
    checks++;
    if (st0 !== 'qld' && hasBuyer && copy) fail(st0 + ': state page has a buyer select that does nothing outside QLD');
    if (st0 === 'qld' && !hasBuyer) fail('qld: state page lost its buyer select');
  }
  // A page with no buyer select is for a home to live in.
  const buyers = hasBuyer ? ['owner', 'investor'] : ['owner'];
  for (const st of isMain ? STATES : [st0]) {
    for (const ptype of ['home', 'land']) {
      for (const fhb of [false, true]) {
        for (const buyer of buyers) {
          for (const price of PRICES) {
            const got = pageDuty(page, st, price, ptype, buyer, fhb);
            const o = { fhb, occ: buyer === 'owner' ? 'home' : 'invest', land: ptype === 'land' };
            const want = allowedDuty(st, price, o, copy).map(fmt);
            checks++;
            if (!got || want.indexOf(got) === -1) {
              fail(`${page.name} ${st} ${ptype} ${fhb ? 'FHB' : 'std'} ${buyer} $${price}: page "${got}" vs shared/rules.js "${want.join('" or "')}"`);
            }
          }
        }
      }
    }
  }
}
// The all-states page's registration line.
for (const st of STATES) for (const v of [250000, 650000, 1100000]) {
  pageDuty(main, st, v, 'home', 'owner', false);
  checks++;
  const got = money(main.els['r-reg'].textContent);
  if (got !== Rules.regFees(st, v)) fail(`stamp-duty-calculator registration ${st} $${v}: ${got} vs shared/rules.js ${Rules.regFees(st, v)}`);
}

// 1b. The LMI line on all 9 pages, at every tier, for a buyer who isn't a
// first home buyer (so no scheme comes into it): whole dollars.
for (const page of DUTY_PAGES) {
  const isMain = page.name === 'stamp-duty-calculator';
  for (const st of isMain ? STATES : [page.name.slice('stamp-duty-calculator-'.length)]) {
    for (const price of [450000, 650000, 1100000]) {
      for (const dep of [3, 5, 10, 12, 15, 19, 20, 25]) {
        const e = pageRun(page, st, price, { buyer: 'owner', fhb: false, depositPct: dep });
        checks++;
        const got = money(e['r-lmi'].textContent), want = Math.round(Rules.lmi(price, dep).lmi);
        if (!(Math.abs(got - want) <= 1)) fail(`${page.name} ${st} LMI $${price} at a ${dep}% deposit: page "${e['r-lmi'].textContent}" vs shared/rules.js ${want}`);
      }
    }
  }
}

// 1c. Foreign buyers, on the pages that have the box: the surcharge line,
// and duty plus surcharge. While a page has its own copy, the QLD figure
// may still be the concession plus the surcharge (intended move
// qld-foreign) and a first home investor may still get the first home
// figure (fhb-investor); once it is on the rules file, a QLD foreign buyer
// pays the general rate plus the surcharge.
for (const page of DUTY_PAGES) {
  if (!page.els.foreign) continue;
  const isMain = page.name === 'stamp-duty-calculator';
  const copy = hasCopy(page);
  const buyers = page.els.buyer ? ['owner', 'investor'] : ['owner'];
  for (const st of isMain ? STATES : [page.name.slice('stamp-duty-calculator-'.length)]) {
    for (const fhb of [false, true]) {
      for (const buyer of buyers) {
        for (const price of PRICES) {
          const e = pageRun(page, st, price, { buyer, fhb, foreign: true });
          const o = { fhb, occ: buyer === 'owner' ? 'home' : 'invest' };
          const r = rulesDuty(st, price, Object.assign({ foreign: true }, o));
          const who = `${page.name} ${st} foreign ${fhb ? 'FHB' : 'std'} ${buyer} $${price}`;
          checks++;
          if (!(Math.abs(money(e['r-foreign'].textContent) - r.surcharge) <= 0.51)) fail(`${who}: surcharge "${e['r-foreign'].textContent}" vs shared/rules.js ${fmt(r.surcharge)}`);
          const want = [r.total];
          if (copy) for (const d of allowedDuty(st, price, o, true)) want.push(d + r.surcharge);
          checks++;
          if (want.map(fmt).indexOf(e['r-total'].textContent) === -1) fail(`${who}: duty plus surcharge "${e['r-total'].textContent}" vs shared/rules.js "${Array.from(new Set(want.map(fmt))).join('" or "')}"`);
        }
      }
    }
  }
}

/* ── 2. Embedded duty engines (deposit, cost of purchase, FHB grants) ── */
const refStd = (st, v) => Rules.calcDuty(st, v);
const refFhb = (st, v) => Rules.duty({ state: st, price: v, firstHome: true }).duty;

const deposit = loadPage('deposit-calculator');
const cop = loadPage('cost-of-purchase-calculator');
const grants = loadPage('first-home-buyer-grants-calculator');
for (const page of [deposit, cop, grants]) if (!hasCopy(page)) requireRules(page, 'it has no duty engine of its own');

const ENGINE_CASES = [
  [deposit, 'stampDutyEstimate', 'deposit std', (st, v) => deposit.run(`stampDutyEstimate(${v}, '${st.toUpperCase()}', false)`), refStd],
  [deposit, 'stampDutyEstimate', 'deposit FHB', (st, v) => deposit.run(`stampDutyEstimate(${v}, '${st.toUpperCase()}', true)`), refFhb],
  [cop, 'calcDuty', 'cost-of-purchase std', (st, v) => cop.run(`calcDuty('${st}', ${v})`), refStd],
  [cop, 'applyFhbConcession', 'cost-of-purchase FHB', (st, v) => cop.run(`applyFhbConcession('${st}', ${v}, calcDuty('${st}', ${v}))`), refFhb],
  [cop, 'regFeesTotal', 'cost-of-purchase reg fees', (st, v) => cop.run(`regFeesTotal('${st}', ${v})`), (st, v) => Rules.regFees(st, v)],
  [grants, 'calcDuty', 'fhb-grants std', (st, v) => grants.run(`calcDuty('${st}', ${v})`), refStd],
  [grants, 'fhbDuty', 'fhb-grants FHB (established)', (st, v) => grants.run(`fhbDuty(STATES['${st}'], '${st}', ${v}, false)`), refFhb],
  [grants, 'fhbDuty', 'fhb-grants FHB (new home)', (st, v) => grants.run(`fhbDuty(STATES['${st}'], '${st}', ${v}, true)`), (st, v) => Rules.duty({ state: st, price: v, firstHome: true, build: 'new' }).duty]
];
for (const [page, fn, label, got, want] of ENGINE_CASES) {
  if (!page.defines(fn)) continue;
  for (const st of STATES) for (const v of PRICES) {
    checks++;
    const g = got(st, v), w = want(st, v);
    if (typeof g !== 'number' || !close(g, w)) fail(`${label} ${st} $${v}: ${g} vs shared/rules.js ${w}`);
  }
}

// 2b. First home buyer bands to the cent, in every copy that is left.
const nswPage = statePage('nsw');
const waPage = statePage('wa');
const vicPage = statePage('vic');
const auction = loadPage('auction-budget-calculator');
const BAND_PRICES = {
  nsw: [800000, 800001, 800100, 850000, 900000, 920000, 950000, 990000, 999999, 1000000, 1000001],
  wa: [600000, 600001, 600099, 600100, 600101, 650000, 700000, 725000, 725050, 750000, 799999, 800000, 800001],
  vic: [600000, 600001, 650000, 700000, 749999, 750000, 750001]
};
const STATE_PAGE = { nsw: [nswPage, 'calcNSWDuty'], wa: [waPage, 'calcWADuty'], vic: [vicPage, 'calcVICDuty'] };
for (const st of Object.keys(BAND_PRICES)) {
  const ST = st.toUpperCase();
  const [sp, spFn] = STATE_PAGE[st];
  for (const v of BAND_PRICES[st]) {
    const want = refFhb(st, v);
    const cases = [
      [sp, spFn, 'state page ' + st, () => sp.run(`${spFn}(${v}, 'home', 'owner', true).duty`)],
      [deposit, 'stampDutyEstimate', 'deposit', () => deposit.run(`stampDutyEstimate(${v}, '${ST}', true)`)],
      [cop, 'applyFhbConcession', 'cost-of-purchase', () => cop.run(`applyFhbConcession('${st}', ${v}, calcDuty('${st}', ${v}))`)],
      [grants, 'fhbDuty', 'fhb-grants', () => grants.run(`fhbDuty(STATES['${st}'], '${st}', ${v}, false)`)],
      [auction, 'applyFhbConcession', 'auction-budget', () => auction.run(`applyFhbConcession('${st}', ${v}, calcDuty('${st}', ${v})).duty`)],
      [main, 'applyFhbConcession', 'all-states', () => main.run(`applyFhbConcession('${st}', ${v}, calcDuty('${st}', ${v})).duty`)]
    ];
    for (const [page, fn, label, run] of cases) {
      if (!page.defines(fn)) continue;
      checks++;
      let got;
      try { got = run(); } catch (e) { fail(`${label} FHB band ${st} $${v}: ${e.message}`); continue; }
      if (typeof got !== 'number' || !(Math.abs(got - want) < 0.001)) fail(`${label} FHB band ${st} $${v}: ${got} vs shared/rules.js ${want} (to the cent)`);
    }
  }
}

// 2b2. NSW general duty to the cent. Revenue NSW states its bracket bases in
// whole dollars ($1,662, $11,602, $52,237, $194,137).
const NSW_STD_REFS = [
  [103000, 1662.5], [103001, 1662.035], [387001, 11602.045], [400000, 12187],
  [650000, 23437], [900000, 34687], [1000000, 39187], [1290001, 52237.055], [3870001, 194137.07]
];
for (const [v, want] of NSW_STD_REFS) {
  const cases = [
    [null, null, 'shared/rules.js', () => refStd('nsw', v)],
    [main, 'calcDuty', 'all-states', () => main.run(`calcDuty('nsw', ${v})`)],
    [nswPage, 'calcNSWStandard', 'state page nsw', () => nswPage.run(`calcNSWStandard(${v})`)],
    [deposit, 'stampDutyEstimate', 'deposit', () => deposit.run(`stampDutyEstimate(${v}, 'NSW', false)`)],
    [cop, 'calcDuty', 'cost-of-purchase', () => cop.run(`calcDuty('nsw', ${v})`)],
    [grants, 'calcDuty', 'fhb-grants', () => grants.run(`calcDuty('nsw', ${v})`)],
    [auction, 'calcDuty', 'auction-budget', () => auction.run(`calcDuty('nsw', ${v})`)]
  ];
  for (const [page, fn, label, run] of cases) {
    if (page && !page.defines(fn)) continue;
    checks++;
    let got;
    try { got = run(); } catch (e) { fail(`${label} NSW general $${v}: ${e.message}`); continue; }
    if (typeof got !== 'number' || !(Math.abs(got - want) < 0.001)) fail(`${label} NSW general $${v}: ${got} vs Revenue NSW ${want} (to the cent)`);
  }
}

// 2c. New homes: a first home buyer's new home pays no duty in QLD and SA
// only. Everywhere else (the NT included: its house and land package
// exemption isn't a first home concession) a new build pays the same first
// home duty as an established home.
for (const st of STATES) for (const v of PRICES) {
  checks++;
  const est = Rules.duty({ state: st, price: v, firstHome: true }).duty;
  const neu = Rules.duty({ state: st, price: v, firstHome: true, build: 'new' }).duty;
  const want = (st === 'qld' || st === 'sa') ? 0 : est;
  if (!close(neu, want)) fail(`shared/rules.js new build ${st} $${v}: ${neu} vs ${want}`);
}

// 2d. The grants calculator's scheme tables, constants and eligibility
// functions, while it has them; then its on-screen total, always.
part('grants calculator tables', () => {
  if (grants.defines('STATES')) {
    for (const st of STATES) {
      const g = grants.run(`STATES['${st}']`), r = Rules.SCHEMES[st];
      const pairs = [
        ['FHOG amount', g.fhog.amount, r.fhog.amount], ['FHOG price cap', g.fhog.propertyCap, r.fhog.propertyCap],
        ['FHOG cap is "under"', !!g.fhog.capStrict, r.fhog.capStrict], ['FHOG new homes only', g.fhog.newBuildOnly, r.fhog.newBuildOnly],
        ['FHOG note', g.fhog.note, r.fhog.note], ['first home duty note', g.fhbNote, r.fhbNote],
        ['5% Deposit Scheme caps', [g.fdsCapCapital, g.fdsCapOther], r.fdsCap], ['Help to Buy caps', [g.h2bCapCapital, g.h2bCapOther], r.h2bCap],
        ['revenue office', [g.revenueOffice, g.revenueUrl], [r.revenueOffice, r.revenueUrl]], ['state name', g.name, Rules.STATE_DATA[st].name]
      ];
      for (const [what, a, b] of pairs) {
        checks++;
        if (JSON.stringify(a) !== JSON.stringify(b)) fail(`fhb-grants ${st} ${what}: ${JSON.stringify(a)} vs shared/rules.js ${JSON.stringify(b)}`);
      }
    }
  }
  const CONSTS = [
    ['HELP_TO_BUY_INCOME_CAP_SINGLE', Rules.H2B.incomeCap.single], ['HELP_TO_BUY_INCOME_CAP_COUPLE', Rules.H2B.incomeCap.couple],
    ['HELP_TO_BUY_EQUITY_NEW', Rules.H2B.equity['new']], ['HELP_TO_BUY_EQUITY_EXIST', Rules.H2B.equity.established],
    ['FHSS_MAX_CONTRIB_ANNUAL', Rules.FHSS.maxContribAnnual], ['FHSS_MAX_TOTAL', Rules.FHSS.maxTotal]
  ];
  for (const [name, want] of CONSTS) {
    if (!grants.defines(name)) continue;
    checks++;
    if (grants.run(name) !== want) fail(`fhb-grants ${name} ${grants.run(name)} vs shared/rules.js ${want}`);
  }
  const GRANT_PRICES = [450000, 499999, 500000, 500001, 550000, 600000, 600001, 650000, 700000, 749999, 750000, 750001, 800000, 800001, 850000, 900000, 950000, 950001, 1000000, 1000001, 1300000, 1300001, 1500000, 1500001];
  for (const st of STATES) for (const v of GRANT_PRICES) {
    if (grants.defines('ownerOccupierDuty')) {
      checks++;
      const a = grants.run(`ownerOccupierDuty('${st}', ${v})`), b = Rules.duty({ state: st, price: v, occupancy: 'home' }).ownerRate;
      if (!close(a, b)) fail(`fhb-grants ownerOccupierDuty ${st} $${v}: ${a} vs shared/rules.js ${b}`);
    }
    for (const cap of [true, false]) {
      const area = cap ? 'capital' : 'other';
      if (grants.defines('fdsEligibility')) {
        checks++;
        const a = grants.run(`fdsEligibility(STATES['${st}'], ${v}, ${cap})`), b = Rules.fds({ state: st, area, price: v });
        if (a.eligible !== b.eligible || a.propertyCap !== b.cap || a.lmiAvoided !== Math.round(b.lmiAvoided)) fail(`fhb-grants fdsEligibility ${st} ${area} $${v}: ${JSON.stringify(a)} vs shared/rules.js ${JSON.stringify([b.eligible, b.cap, Math.round(b.lmiAvoided)])}`);
      }
      if (!grants.defines('helpToBuyEligibility')) continue;
      for (const couple of [false, true]) for (const isNew of [false, true]) for (const income of [80000, 103000, 103001, 165000, 165001]) {
        checks++;
        const a = grants.run(`helpToBuyEligibility(STATES['${st}'], ${v}, ${income}, ${couple}, ${isNew}, ${cap})`);
        const b = Rules.h2b({ state: st, area, price: v, income, buyers: couple ? 'couple' : 'single', build: isNew ? 'new' : 'established' });
        const bb = [b.eligible, b.incomeOk, b.priceOk, b.incomeCap, b.cap, b.equityShare, Math.round(b.share), Math.round(v * (1 - b.equityShare - b.minDepositPct / 100))];
        const aa = [a.eligible, a.incomeOk, a.priceOk, a.incomeCap, a.propertyCap, a.equityShare, a.governmentEquity, a.yourBorrowingRequired];
        if (JSON.stringify(aa) !== JSON.stringify(bb)) fail(`fhb-grants helpToBuyEligibility ${st} ${area} $${v} ${couple ? 'couple' : 'single'} ${isNew ? 'new' : 'established'} $${income}: ${JSON.stringify(aa)} vs shared/rules.js ${JSON.stringify(bb)}`);
      }
    }
  }
});
// The total on screen: first home duty saving + FHOG + LMI avoided under
// the 5% Deposit Scheme (whole dollars), as the page says.
part('grants calculator on-screen total', () => {
  grants.run('_isInit = false');
  for (const st of STATES) for (const v of [450000, 650000, 750000, 900000, 1200000]) {
    for (const ptype of ['established', 'new']) for (const area of ['capital', 'other']) {
      const e = grants.els;
      e.state.value = st; e.price.value = String(v); e.ptype.value = ptype; e.location.value = area;
      e.couple.value = 'couple'; e.income.value = '150000'; e['results-container'].innerHTML = '';
      grants.run('calculate()');
      const shown = money((e['results-container'].innerHTML.match(/fhb-hero-value">([^<]*)</) || [])[1]);
      const f = Rules.fds({ state: st, area, price: v });
      const want = Rules.duty({ state: st, price: v, firstHome: true, build: ptype }).firstHomeSaving + Rules.fhog({ state: st, price: v, build: ptype }).amount + (f.eligible ? Math.round(f.lmiAvoided) : 0);
      checks++;
      if (!(Math.abs(shown - want) <= 1)) fail(`fhb-grants on-screen total ${st} $${v} ${ptype} ${area}: ${shown} vs shared/rules.js ${Math.round(want)}`);
    }
  }
  grants.run('_isInit = true');
});

/* ── 3. Income tax and the living-cost floor ── */
const bp = loadPage('borrowing-power-calculator');
const svc = loadPage('loan-serviceability-calculator');
const cashflow = loadPage('property-cashflow-calculator');
const cgt = loadPage('capital-gains-calculator');
for (const [page, fn] of [[bp, 'approxTax'], [svc, 'approxTax'], [cashflow, 'incomeTax'], [cgt, 'calcTax']]) {
  if (!page.defines(fn)) { requireRules(page, `${fn}() is gone`); continue; }
  const copyTax = page.run(fn);
  let bad = 0, first = -1;
  // Every whole dollar from $0 to $260,000: all the tax brackets and both
  // Medicare thresholds.
  for (let g = 0; g <= 260000; g++) {
    if (!(Math.abs(copyTax(g) - Rules.approxTax(g)) < 1e-6)) { bad++; if (first < 0) first = g; }
  }
  checks++;
  if (bad) fail(`${page.name} ${fn}() differs from shared/rules.js approxTax at ${bad} whole-dollar incomes, first at $${first}: ${copyTax(first)} vs ${Rules.approxTax(first)}`);
}
for (const page of [bp, svc]) {
  if (!page.defines('hemMonthly')) { requireRules(page, 'hemMonthly() is gone'); continue; }
  for (const inc of [0, 49999, 50000, 79999, 80000, 119999, 120000, 179999, 180000, 249999, 250000, 349999, 350000, 500000]) {
    for (const adults of [1, 2]) for (const deps of [0, 1, 3]) {
      checks++;
      const a = page.run(`hemMonthly(${inc}, ${adults}, ${deps})`), b = Rules.hemMonthly(inc, adults, deps);
      if (a !== b) fail(`hemMonthly(${inc}, ${adults}, ${deps}): ${page.name} ${a} vs shared/rules.js ${b}`);
    }
  }
}
if (bp.defines('hecsAnnual')) {
  for (const g of [0, 69528, 69529, 100000, 129717, 129718, 186050, 186051, 250000]) {
    checks++;
    if (bp.run(`hecsAnnual(${g})`) !== Rules.hecsAnnual(g)) fail(`hecsAnnual(${g}): borrowing-power vs shared/rules.js`);
  }
}

/* ── 4. Upfront-cost calculators: duty, conveyancing, LMI, the solver ── */
const depCopy = hasCopy(deposit), copCopy = hasCopy(cop), aucCopy = hasCopy(auction);
if (!aucCopy) requireRules(auction, 'it has no duty engine of its own');

// 4a. On-screen duty, through each tool's own calc().
for (const [label, page] of [['deposit', deposit], ['cost-of-purchase', cop], ['auction-budget', auction]]) {
  checks++;
  if (!page.els.owner) fail(`${label}: the "Buying to live in" checkbox (id="owner") is missing, so a QLD owner-occupier cannot get the home concession`);
}
function depositDuty(st, price, fhb, owner) {
  deposit.els.price.value = String(price);
  deposit.els['dep-pct'].value = '20';
  deposit.els.state.value = st.toUpperCase();
  deposit.els.fhb.checked = fhb;
  deposit.els.owner.checked = owner;
  deposit.els['r-stamp'].textContent = '';
  deposit.run('calc()');
  return money(deposit.els['r-stamp'].textContent);
}
function copDuty(st, price, fhb, owner, foreign) {
  cop.els.purchasePrice.value = String(price);
  cop.els.depositPct.value = '20';
  cop.els.state.value = st.toUpperCase();
  cop.els.fhb.checked = fhb;
  cop.els.owner.checked = owner;
  cop.els.foreignBuyer.checked = !!foreign;
  cop.els.currentlyRenting.checked = false;
  cop.els.stampDuty.textContent = '';
  cop.run('calc()');
  return money(cop.els.stampDuty.textContent);
}
// A first home buyer with "Buying to live in" unticked is an intended move
// (fhb-investor): while a page still has its own duty engine it may give
// the first home figure (all three pages hide the box from a first home
// buyer today, so the box can't say otherwise). Once the page is on the
// rules file it must give the general rate, and it should show the box to
// a first home buyer so the choice can be made (p-search-calc-5).
function upfrontAllowed(st, v, fhb, owner, foreign, pageHasCopy) {
  const o = { fhb, occ: owner ? 'home' : 'invest', foreign };
  const out = [rulesDuty(st, v, o).total];
  if (fhb && !owner && pageHasCopy) out.push(rulesDuty(st, v, Object.assign({}, o, { occ: 'home' })).total);
  return out;
}
function upfrontFail(label, who, got, want, pageHasCopy, fhb, owner) {
  const why = (!pageHasCopy && fhb && !owner) ? ' (on the rules file a first home buyer who isn\'t living in it pays the general rate; show the "Buying to live in" box to first home buyers)' : '';
  fail(`${label} on-screen duty ${who}: ${got} vs shared/rules.js ${want.map(Math.round).join(' or ')}${why}`);
}
part('owner-occupier duty', () => {
  for (const st of STATES) {
    for (const fhb of [false, true]) {
      for (const owner of [true, false]) {
        for (const v of PRICES) {
          const who = `${st} ${fhb ? 'FHB' : 'std'} ${owner ? 'owner' : 'investor'} $${v}`;
          const cases = [
            ['deposit', depositDuty(st, v, fhb, owner), depCopy],
            ['cost-of-purchase', copDuty(st, v, fhb, owner), copCopy]
          ];
          // The auction page's duty function, while it has one (the page
          // itself shows duty only at the walk-away price: 4d).
          if (auction.defines('dutyAt')) cases.push(['auction-budget dutyAt()', Math.round(auction.run(`dutyAt('${st}', ${v}, ${fhb}, ${owner}).duty`)), aucCopy]);
          for (const [label, got, copy] of cases) {
            const want = upfrontAllowed(st, v, fhb, owner, false, copy);
            checks++;
            if (!want.some((w) => Math.abs(got - w) <= 1)) upfrontFail(label, who, got, want, copy, fhb, owner);
          }
        }
      }
    }
  }
});

// 4a (cont). Cost of purchase, foreign buyers: duty plus the surcharge. From
// 1 Aug 2026 the QLD home and first home concessions need citizenship,
// permanent residency or specified foreign retiree status, so a QLD foreign
// buyer pays the general rate plus the surcharge, and the "Buying to live
// in" box is hidden for them.
part('cost-of-purchase foreign buyer', () => {
  for (const st of STATES) {
    for (const fhb of [false, true]) {
      for (const owner of [true, false]) {
        for (const v of PRICES) {
          const who = `cost-of-purchase foreign ${st} ${fhb ? 'FHB' : 'std'} ${owner ? 'owner' : 'investor'} $${v}`;
          const want = upfrontAllowed(st, v, fhb, owner, true, copCopy);
          const got = copDuty(st, v, fhb, owner, true);
          checks++;
          if (!want.some((w) => Math.abs(got - w) <= 1)) upfrontFail('cost-of-purchase', `foreign ${st} ${fhb ? 'FHB' : 'std'} ${owner ? 'owner' : 'investor'} $${v}`, got, want, copCopy, fhb, owner);
          if (st === 'qld') {
            checks++;
            if (cop.els.ownerCheck.style.display !== 'none') fail(`${who}: the "Buying to live in" box is showing`);
          }
        }
      }
    }
  }
  copDuty('qld', 650000, false, true, false);
  checks++;
  if (cop.els.ownerCheck.style.display === 'none') fail('cost-of-purchase QLD, not foreign, not FHB: the "Buying to live in" box is hidden');
});

// 4b. One conveyancing figure and one building-and-pest figure.
const journeySrc = fs.readFileSync(path.join(ROOT, 'journey.js'), 'utf8');
part('conveyancing and inspection figures', () => {
  const conveyRef = Rules.CONVEYANCING;
  pageDuty(main, 'nsw', 650000, 'home', 'owner', false);
  const conveyCases = [
    ['all-states on-screen conveyancing', money(main.els['r-conveyancing'].textContent)],
    ['auction-budget default conveyancing input', money(auction.els.legal.value)]
  ];
  const jc = journeySrc.match(/\bCONVEYANCING\s*=\s*(\d+)/);
  if (jc) conveyCases.push(['journey.js CONVEYANCING', Number(jc[1])]);
  for (const [label, page] of [['deposit', deposit], ['cost-of-purchase', cop]]) {
    if (page.defines('CONVEYANCING')) conveyCases.push([label + ' CONVEYANCING', page.run('CONVEYANCING')]);
  }
  depositDuty('nsw', 650000, false, true);
  conveyCases.push(['deposit on-screen conveyancing', money(deposit.els['r-legal'].textContent)]);
  copDuty('nsw', 650000, false, true);
  conveyCases.push(['cost-of-purchase on-screen conveyancing', money(cop.els.conveyancing.textContent)]);
  for (const [label, got] of conveyCases) {
    checks++;
    if (got !== conveyRef) fail(`${label}: ${got} vs shared/rules.js CONVEYANCING ${conveyRef}`);
  }
  for (const [label, page] of [['deposit', deposit], ['cost-of-purchase', cop]]) {
    if (!page.defines('INSPECTION')) continue;
    checks++;
    if (page.run('INSPECTION') !== Rules.INSPECTION) fail(`building and pest: ${label} ${page.run('INSPECTION')} vs shared/rules.js ${Rules.INSPECTION}`);
  }
  checks++;
  if (money(deposit.els['r-inspect'].textContent) !== money(cop.els.inspection.textContent)) fail('building and pest: the deposit and cost of purchase pages show different figures');
});

// 4c. Every LMI tier copy that is left gives shared/rules.js's rate.
const journeyLmi = (() => {
  if (!findDefs(journeySrc, ['lmiRate']).length) return null;
  try { return new Function('Rules', extractDefs(journeySrc, ['lmiRate']) + '\nreturn lmiRate;')(Rules); } catch (e) { checks++; fail('journey.js lmiRate(): ' + e.message); return null; }
})();
const LMI_COPIES = [
  [main, 'estimateLmiTier', 'all-states estimateLmiTier', (l) => main.run(`estimateLmiTier(${l}).rate`)],
  [deposit, 'lmiEstimate', 'deposit lmiEstimate', (l) => deposit.run(`lmiEstimate(1000000, ${l} * 100)`) / 1000000],
  [cop, 'lmiRate', 'cost-of-purchase lmiRate', (l) => cop.run(`lmiRate(${l})`)],
  [auction, 'lmiRate', 'auction-budget lmiRate', (l) => auction.run(`lmiRate(${l})`)],
  [grants, 'estimateLmi', 'fhb-grants estimateLmi', (l) => grants.run(`estimateLmi(${l} * 1000000, 1000000)`) / (l * 1000000), 1e-6]
];
if (journeyLmi) LMI_COPIES.push([null, null, 'journey.js lmiRate', journeyLmi]);
// The 8 state pages each define lmiRate() inside calculate(), so it is cut
// out of the source and run on its own.
for (const st of STATES) {
  const sp = statePage(st), fn = cutOut(sp, 'lmiRate');
  if (fn) LMI_COPIES.push([null, null, `${sp.name} lmiRate`, fn]);
}
const mortgage = loadPage('mortgage-repayment-calculator');
LMI_COPIES.push([mortgage, 'estimateLmi', 'mortgage-repayment estimateLmi tier', (l) => mortgage.run(`estimateLmi(${l} * 1000000, 1000000).tier.rate`)]);
LMI_COPIES.push([mortgage, 'estimateLmi', 'mortgage-repayment estimateLmi amount', (l) => mortgage.run(`estimateLmi(${l} * 1000000, 1000000).amount`) / (l * 1000000), 1e-6]);
for (const [page, fn, label, rate, tol] of LMI_COPIES) {
  if (page && !page.defines(fn)) continue;
  part('LMI tier ' + label, () => {
    for (const l of [0.5, 0.79, 0.8, 0.8001, 0.85, 0.8501, 0.9, 0.9001, 0.95, 0.9501, 0.99, 1.05]) {
      checks++;
      const got = rate(l), want = Rules.lmiRate(l);
      if (!(Math.abs(got - want) < (tol || 1e-9))) fail(`LMI tier ${label} at LVR ${l}: ${got} vs shared/rules.js ${want}`);
    }
  });
}
// 4c (cont). The mortgage repayment calculator's monthly repayment and its
// two schedules, while it has its own copies.
part('mortgage repayment copies', () => {
  const CASES = [[585000, 6.25, 30, 0, 0, 0], [650000, 6.0, 30, 500, 0, 0], [480000, 5.89, 25, 0, 40000, 0], [700000, 6.5, 30, 0, 0, 5],
    [300000, 0, 20, 0, 0, 0], [900000, 7.1, 30, 1000, 25000, 3], [100000, 6.25, 1, 0, 0, 0]];
  for (const [P, rate, years, extra, offset, io] of CASES) {
    const who = `mortgage-repayment $${P} ${rate}% ${years}y extra ${extra} offset ${offset} io ${io}`;
    const monthly = Rules.repay(P, rate, years);
    if (mortgage.defines('piMonthly')) {
      checks++;
      const got = mortgage.run(`piMonthly(${P}, ${rate / 100}, ${years})`);
      if (!(Math.abs(got - monthly) < 1e-6)) fail(`${who} piMonthly: ${got} vs shared/rules.js repay ${monthly}`);
    }
    const p = { principal: P, annualRate: rate / 100, years, repayMonthly: monthly, extraMonthly: extra, offsetBalance: offset, ioYears: io };
    if (mortgage.defines('simulateAmortisation')) {
      checks++;
      const got = JSON.stringify(mortgage.run(`simulateAmortisation(${JSON.stringify(p)})`)), want = JSON.stringify(Rules.simulateAmortisation(p));
      if (got !== want) fail(`${who} simulateAmortisation differs from shared/rules.js`);
    }
    if (mortgage.defines('simulateFortnightly')) {
      checks++;
      const f = { principal: P, annualRate: rate / 100, years, monthlyPI: monthly };
      const got = JSON.stringify(mortgage.run(`simulateFortnightly(${JSON.stringify(f)})`)), want = JSON.stringify(Rules.simulateFortnightly(f));
      if (got !== want) fail(`${who} simulateFortnightly differs from shared/rules.js: ${got} vs ${want}`);
    }
  }
  if (!mortgage.defines('piMonthly') && !mortgage.defines('simulateAmortisation')) requireRules(mortgage, 'its repayment and schedule copies are gone');
  if (!mortgage.defines('estimateLmi')) requireRules(mortgage, 'estimateLmi() is gone');
});

// A 10% deposit is exactly 90% LVR whatever the price (no float drift into the next tier).
part('LMI at a 10% deposit', () => {
  for (const price of [145758, 146443, 650000, 777777]) {
    const dep = price * 0.1, loan = price - dep;
    if (deposit.defines('lmiEstimate')) {
      checks++;
      const got = deposit.run(`lmiEstimate(${loan}, ${(loan / price) * 100})`);
      if (!close(got, loan * 0.019)) fail(`deposit LMI at a 10% deposit on $${price}: ${got} vs ${loan * 0.019}`);
    }
    cop.els.purchasePrice.value = String(price); cop.els.depositPct.value = '10'; cop.run('calc()');
    checks++;
    if (Math.abs(money(cop.els.lmi.textContent) - Math.round(Rules.lmi(price, 10).lmi)) > 1) fail(`cost-of-purchase LMI at a 10% deposit on $${price}: ${cop.els.lmi.textContent} vs shared/rules.js ${Math.round(Rules.lmi(price, 10).lmi)}`);
  }
});

// 4d. Auction solver, through the page's calculate().
function auctionPlan(st, fhb, owner, savings, pre, buffer) {
  const e = auction.els;
  e.state.value = st; e.fhb.checked = fhb; e.owner.checked = owner;
  e.savings.value = String(savings); e.preapproval.value = String(pre);
  e.buffer.value = String(buffer); e.legal.value = '1,800';
  for (const id of ['r-walkaway', 'r-duty', 'r-allin', 'r-loan-base', 'r-lvr', 'r-lmi', 'r-loan', 'r-cash']) e[id].textContent = '';
  auction.run('calculate()');
  return { W: money(e['r-walkaway'].textContent), duty: money(e['r-duty'].textContent), allIn: money(e['r-allin'].textContent),
    loanBase: money(e['r-loan-base'].textContent), lvrText: e['r-lvr'].textContent, lmi: money(e['r-lmi'].textContent),
    loan: money(e['r-loan'].textContent), cash: money(e['r-cash'].textContent) };
}
// The plan the page describes, built from shared/rules.js: at hammer price
// P, all-in = P + duty + registration + conveyancing; the usable savings go
// in first and the rest is the loan, with LMI at its LVR added to it; the
// loan before LMI may be no more than 95% of the price. The checks below
// read only the page's inputs and on-screen rows, so they don't depend on
// how the page is written inside.
function refPlan(st, P, fhb, occ, legal, usable) {
  const duty = Rules.duty({ state: st, price: P, firstHome: fhb, occupancy: occ }).duty;
  const reg = Rules.regFees(st, P);
  const allIn = P + duty + reg + legal;
  const loan = Math.max(0, allIn - usable);
  const lmi = loan * Rules.lmiRate(P > 0 ? loan / P : 0);
  return { duty, reg, allIn, loan, lmi, totalLoan: loan + lmi, cash: allIn - loan };
}
const refFits = (pl, P, pre) => pl.totalLoan <= pre && pl.loan <= 0.95 * P + 1e-6;
// The occupancy readings the page may use (fhb-investor: while it has its
// own engine, a first home buyer who isn't living in it may still get the
// first home rate).
function auctionOccs(fhb, owner) {
  const occs = [owner ? 'home' : 'invest'];
  if (fhb && !owner && aucCopy) occs.push('home');
  return occs;
}
// Pairs of [savings, pre-approval]. The second line walks the pre-approval
// up so the walk-away price crosses the duty brackets in every state.
const FUNDS = [[120000, 560000], [90000, 480000], [60000, 600000], [200000, 500000], [400000, 300000],
  [150000, 900000], [35000, 450000], [250000, 0], [800000, 1200000],
  [180000, 250000], [180000, 375000], [180000, 625000], [180000, 750000], [180000, 1000000], [180000, 1250000], [180000, 1500000], [180000, 1750000]];
part('auction solver', () => {
for (const st of STATES) {
  for (const fhb of [false, true]) {
    for (const owner of [true, false]) {
      for (const [savings, pre] of FUNDS) {
        const p = auctionPlan(st, fhb, owner, savings, pre, 5);
        const who = `auction ${st} ${fhb ? 'FHB' : 'std'} ${owner ? 'owner' : 'investor'} savings $${savings} pre-approval $${pre}`;
        const usable = savings * 0.95;
        checks++;
        if (!(p.W > 0) || p.W % 1000 !== 0) { fail(`${who}: no walk-away price ("${auction.els['r-walkaway'].textContent}")`); continue; }
        // On-screen duty at the walk-away price.
        checks++;
        const occ = auctionOccs(fhb, owner).find((o) => Math.abs(p.duty - refPlan(st, p.W, fhb, o, 1800, usable).duty) <= 1);
        if (!occ) { upfrontFail('auction-budget', `${st} ${fhb ? 'FHB' : 'std'} ${owner ? 'owner' : 'investor'} at the walk-away price $${p.W}`, p.duty, upfrontAllowed(st, p.W, fhb, owner, false, aucCopy), aucCopy, fhb, owner); continue; }
        const plan = (P, use) => refPlan(st, P, fhb, occ, 1800, use);
        const ref = plan(p.W, usable);
        // Every row on screen is the plan at the walk-away price.
        for (const [row, got, want] of [['all-in cost', p.allIn, ref.allIn], ['loan before LMI', p.loanBase, ref.loan], ['LMI', p.lmi, ref.lmi], ['total loan', p.loan, ref.totalLoan], ['cash', p.cash, ref.cash]]) {
          checks++;
          if (!(Math.abs(got - want) <= 1)) fail(`${who}: ${row} at $${p.W} shows ${got} vs shared/rules.js ${Math.round(want)}`);
        }
        checks++;
        if (ref.loan > 0 && p.lvrText !== (ref.loan / p.W * 100).toFixed(1) + '%') fail(`${who}: LVR shows "${p.lvrText}" vs ${(ref.loan / p.W * 100).toFixed(1)}%`);
        checks++;
        if (p.loan > pre + 1) fail(`${who}: total loan ${p.loan} is over the pre-approval`);
        checks++;
        if (p.cash > usable + 1) fail(`${who}: cash ${p.cash} is over usable savings ${usable}`);
        checks++;
        if (Math.abs(p.cash + p.loanBase - p.allIn) > 2) fail(`${who}: cash ${p.cash} + loan ${p.loanBase} does not add up to all-in ${p.allIn}`);
        checks++;
        if (ref.loan > 0.95 * p.W + 1e-6) fail(`${who}: the loan before LMI is ${(ref.loan / p.W * 100).toFixed(2)}% of the price, over 95%`);
        // The walk-away price is the highest that fits, rounded down to $1,000.
        checks++;
        if (!refFits(ref, p.W, pre)) fail(`${who}: $${p.W} does not fit the pre-approval and the 95% limit`);
        checks++;
        if (refFits(plan(p.W + 1000, usable), p.W + 1000, pre)) fail(`${who}: $${p.W + 1000} would also fit, so $${p.W} is not the walk-away price`);
        // Savings set the price: the page must say so and give a savings
        // figure that does let the pre-approval set it.
        const capBinds = plan(p.W + 1000, usable).totalLoan <= pre;
        const note = auction.els['lmi-callout'].innerHTML;
        checks++;
        if (capBinds !== /Your savings are the limit here/.test(note)) fail(`${who}: savings ${capBinds ? 'set' : 'do not set'} the price but the note ${capBinds ? 'does not say so' : 'says they do'}`);
        if (capBinds) {
          const need = money((note.match(/you’d need about (\$[\d,]+)/) || [])[1]);
          checks++;
          if (!(need > usable)) { fail(`${who}: savings figure "${need}" missing or not above usable savings ${usable}`); continue; }
          const q = auctionPlan(st, fhb, owner, need, pre, 0);
          checks++;
          if (plan(q.W + 1000, need).totalLoan <= pre) fail(`${who}: with the $${need} of usable savings the page asks for, savings still set the price ($${q.W})`);
          const r = auctionPlan(st, fhb, owner, need - 5000, pre, 0);
          checks++;
          if (!(plan(r.W + 1000, need - 5000).totalLoan <= pre)) fail(`${who}: $${need} is more than needed; $${need - 5000} already lets the pre-approval set the price`);
        }
      }
    }
  }
}
});

// 4e. Too little saved for a 5% deposit plus costs at any price: an error,
// and the previous plan (rows and notes) is hidden, not left on screen.
part('auction error path', () => {
  auction.run('_isInit = false');
  for (const st of STATES) {
    for (const [savings, pre] of [[0, 560000], [1000, 560000], [1000, 0], [0, 0]]) {
      auctionPlan(st, false, true, 120000, 560000, 5); // a valid plan first
      auctionPlan(st, false, true, savings, pre, 5);
      const e = auction.els, who = `auction ${st} savings $${savings} pre-approval $${pre}`;
      checks++;
      if (e['calc-msg'].hidden || !e['calc-msg'].textContent) fail(`${who}: no error message`);
      checks++;
      if (e.result.style.display !== 'none') fail(`${who}: the old plan is still showing`);
      checks++;
      if (e['lmi-callout'].innerHTML || e['deposit-callout'].innerHTML) fail(`${who}: an old LMI or deposit note is still there`);
    }
  }
  auction.run('_isInit = true');
});

for (const n of notes) console.log('state-duty-sync-test: NOTE ' + n);
if (fails) {
  console.error(`\nstate-duty-sync-test: ${fails} FAILED of ${checks} checks`);
  process.exit(1);
}
console.log(`state-duty-sync-test: all ${checks} checks passed (the all-states page, 8 state pages, deposit, cost of purchase, FHB grants, borrowing power, loan serviceability, cash flow, capital gains, mortgage repayment and auction budget against shared/rules.js: on-screen duty, registration, LMI and foreign surcharge, every copy of the duty engine, NSW general duty and the NSW, WA and VIC first home bands to the cent, the new-home rule, the grants tables and total, income tax and the living-cost floor, the QLD foreign buyer rule, conveyancing, LMI tiers, repayments, the auction plan and its error path) ✓`);

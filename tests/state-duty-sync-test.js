/**
 * state-duty-sync-test.js — guards the duty copies that duty-sync-test.js
 * does not cover.
 *
 * tools/stamp-duty-calculator.js is the source of truth. This test checks:
 *
 *   1. The 8 state pages (tools/stamp-duty-calculator-<state>.js). Each page's
 *      real calculate() is run against a stub DOM and its on-screen duty is
 *      compared with the all-states calculator's on-screen duty for the same
 *      inputs: dwelling AND vacant land × standard / first home buyer ×
 *      owner-occupier / investor × a price grid crossing every bracket.
 *   2. The duty engines embedded in deposit-calculator.js,
 *      cost-of-purchase-calculator.js and first-home-buyer-grants-calculator.js
 *      (standard duty and established-home first home buyer duty).
 *   3. The income-tax and expense-floor functions copied from
 *      borrowing-power-calculator.js into loan-serviceability-calculator.js.
 *   4. The upfront-cost calculators (deposit, cost of purchase, auction
 *      budget), driven through their real calc functions:
 *        - on-screen duty vs the all-states calculator for owner-occupier /
 *          investor × standard / first home buyer (the QLD home concession);
 *        - the "Buying to live in" box exists on each page;
 *        - one conveyancing figure everywhere (the all-states calculator and
 *          journey.js included) and one building-and-pest figure;
 *        - every LMI tier copy (journey.js included) gives the same rate;
 *        - the auction solver: the plan at the walk-away price fits the
 *          pre-approval with LMI added to the loan, its rows add up, and
 *          $1,000 more does not fit.
 *
 * Run: node tests/state-duty-sync-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOOLS = path.join(__dirname, '..', 'tools');

/* ── Minimal DOM stub: enough for the tool scripts to load and calculate ── */
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: false,
    style: {}, className: '', options: [], children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, focus() {}
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
  vm.runInContext(fs.readFileSync(path.join(TOOLS, 'tool-page.js'), 'utf8'), sb, { filename: 'tool-page.js' });
  vm.runInContext(fs.readFileSync(path.join(TOOLS, name + '.js'), 'utf8'), sb, { filename: name + '.js' });
  return { els, run: (code) => vm.runInContext(code, sb) };
}

const STATES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
const PRICES = [1000, 14000, 250000, 300000, 350001, 400000, 450000, 500000, 525000,
  540001, 550000, 600000, 640000, 650000, 700000, 700001, 705000, 710000, 725001,
  750000, 780000, 799999, 800000, 850000, 900000, 950000, 960001, 1000000, 1100000,
  1290001, 1455001, 1500000, 2000001, 3000001, 3870001, 5000001];

let checks = 0;
let fails = 0;
function fail(msg) { fails++; if (fails <= 40) console.error('FAIL ' + msg); }

/* ── 1. State pages vs the all-states calculator (on-screen duty) ── */
const main = loadPage('stamp-duty-calculator');

function mainDuty(state, price, ptype, buyer, fhb) {
  main.els.state.value = state;
  main.run('updateState()');
  main.els.price.value = String(price);
  main.els.ptype.value = ptype;
  main.els.buyer.value = buyer;
  main.els.fhb.checked = fhb;
  main.els.foreign.checked = false;
  main.els['r-duty'].textContent = '';
  main.run('calculate()');
  return main.els['r-duty'].textContent;
}

for (const st of STATES) {
  const page = loadPage('stamp-duty-calculator-' + st);
  const hasBuyer = !!page.els.buyer;
  if (st !== 'qld' && hasBuyer) fail(st + ': state page has a buyer select that does nothing outside QLD');
  if (st === 'qld' && !hasBuyer) fail('qld: state page lost its buyer select');
  for (const ptype of ['home', 'land']) {
    for (const fhb of [false, true]) {
      for (const buyer of ['owner', 'investor']) {
        for (const price of PRICES) {
          page.els.price.value = String(price);
          page.els.ptype.value = ptype;
          if (hasBuyer) page.els.buyer.value = buyer;
          page.els.fhb.checked = fhb;
          if (page.els.foreign) page.els.foreign.checked = false;
          page.els['r-duty'].textContent = '';
          page.run('calculate()');
          const got = page.els['r-duty'].textContent;
          const want = mainDuty(st, price, ptype, buyer, fhb);
          checks++;
          if (!got || got !== want) {
            fail(`state page ${st} ${ptype} ${fhb ? 'FHB' : 'std'} ${buyer} $${price}: page "${got}" vs all-states "${want}"`);
          }
        }
      }
    }
  }
}

/* ── 2. Embedded duty engines (deposit, cost-of-purchase, FHB grants) ── */
function close(a, b) { return Math.abs(a - b) < 0.51; }
function refStd(st, v) { return main.run(`calcDuty('${st}', ${v})`); }
function refFhb(st, v) { return main.run(`applyFhbConcession('${st}', ${v}, calcDuty('${st}', ${v})).duty`); }

const deposit = loadPage('deposit-calculator');
const cop = loadPage('cost-of-purchase-calculator');
const grants = loadPage('first-home-buyer-grants-calculator');

for (const st of STATES) {
  const ST = st.toUpperCase();
  for (const v of PRICES) {
    const std = refStd(st, v), fhb = refFhb(st, v);
    const cases = [
      ['deposit std', deposit.run(`stampDutyEstimate(${v}, '${ST}', false)`), std],
      ['deposit FHB', deposit.run(`stampDutyEstimate(${v}, '${ST}', true)`), fhb],
      ['cost-of-purchase std', cop.run(`calcDuty('${st}', ${v})`), std],
      ['cost-of-purchase FHB', cop.run(`applyFhbConcession('${st}', ${v}, calcDuty('${st}', ${v}))`), fhb],
      ['cost-of-purchase reg fees', cop.run(`regFeesTotal('${st}', ${v})`), main.run(`regFeesTotal('${st}', ${v})`)],
      ['fhb-grants std', grants.run(`calcDuty('${st}', ${v})`), std],
      ['fhb-grants FHB (established)', grants.run(`fhbDuty(STATES['${st}'], '${st}', ${v}, false)`), fhb]
    ];
    for (const [label, got, want] of cases) {
      checks++;
      if (typeof got !== 'number' || !close(got, want)) fail(`${label} ${st} $${v}: ${got} vs source ${want}`);
    }
  }
}

/* ── 3. Tax + expense-floor sync copy (borrowing power → loan serviceability) ── */
const bp = loadPage('borrowing-power-calculator');
const svc = loadPage('loan-serviceability-calculator');
for (const g of [0, 18200, 18201, 28011, 30000, 35013, 35014, 45000, 45001, 60000, 90000, 120000, 135000, 135001, 190000, 190001, 250000, 400000]) {
  checks++;
  const a = bp.run(`approxTax(${g})`), b = svc.run(`approxTax(${g})`);
  if (!close(a, b)) fail(`approxTax(${g}): loan-serviceability ${b} vs borrowing-power ${a}`);
}
for (const inc of [0, 49999, 50000, 79999, 80000, 119999, 120000, 179999, 180000, 249999, 250000, 349999, 350000, 500000]) {
  for (const adults of [1, 2]) {
    for (const deps of [0, 1, 3]) {
      checks++;
      const a = bp.run(`hemMonthly(${inc}, ${adults}, ${deps})`), b = svc.run(`hemMonthly(${inc}, ${adults}, ${deps})`);
      if (a !== b) fail(`hemMonthly(${inc}, ${adults}, ${deps}): loan-serviceability ${b} vs borrowing-power ${a}`);
    }
  }
}

/* ── 4. Upfront-cost calculators: owner-occupier duty, conveyancing, LMI ── */
const auction = loadPage('auction-budget-calculator');
function money(s) { // "$15,100", "15,100", "$1,800 (my flat estimate…)" → number
  const m = String(s).replace(/\u2212/g, '-').match(/-?\$?\s*([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}
// A missing function or constant in one of the tools is drift too: report it
// as a failure and carry on, instead of dying on a ReferenceError.
function part(name, fn) {
  try { fn(); } catch (e) { checks++; fail(`${name}: ${e.message}`); }
}

// 4a. On-screen duty, through each tool's own calc(), vs the all-states page.
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
function copDuty(st, price, fhb, owner) {
  cop.els.purchasePrice.value = String(price);
  cop.els.depositPct.value = '20';
  cop.els.state.value = st.toUpperCase();
  cop.els.fhb.checked = fhb;
  cop.els.owner.checked = owner;
  cop.els.foreignBuyer.checked = false;
  cop.els.currentlyRenting.checked = false;
  cop.els.stampDuty.textContent = '';
  cop.run('calc()');
  return money(cop.els.stampDuty.textContent);
}
part('owner-occupier duty', () => {
  for (const st of STATES) {
    for (const fhb of [false, true]) {
      for (const owner of [true, false]) {
        for (const v of PRICES) {
          const want = money(mainDuty(st, v, 'home', owner ? 'owner' : 'investor', fhb));
          const who = `${st} ${fhb ? 'FHB' : 'std'} ${owner ? 'owner' : 'investor'} $${v}`;
          const cases = [
            ['deposit', depositDuty(st, v, fhb, owner)],
            ['cost-of-purchase', copDuty(st, v, fhb, owner)],
            ['auction-budget', Math.round(auction.run(`dutyAt('${st}', ${v}, ${fhb}, ${owner}).duty`))]
          ];
          for (const [label, got] of cases) {
            checks++;
            if (!(Math.abs(got - want) <= 1)) fail(`${label} on-screen duty ${who}: ${got} vs all-states ${want}`);
          }
        }
      }
    }
  }
});

// 4b. One conveyancing figure and one building-and-pest figure.
const journeySrc = fs.readFileSync(path.join(__dirname, '..', 'journey.js'), 'utf8');
part('conveyancing and inspection figures', () => {
  mainDuty('nsw', 650000, 'home', 'owner', false);
  const conveyRef = money(main.els['r-conveyancing'].textContent);
  const conveyCases = [
    ['journey.js CONVEYANCING', Number((journeySrc.match(/\bCONVEYANCING\s*=\s*(\d+)/) || [])[1])],
    ['auction-budget default conveyancing input', money(auction.els.legal.value)]
  ];
  for (const [label, page] of [['deposit', deposit], ['cost-of-purchase', cop]]) {
    part(label + ' CONVEYANCING', () => conveyCases.push([label + ' CONVEYANCING', page.run('CONVEYANCING')]));
  }
  depositDuty('nsw', 650000, false, true);
  conveyCases.push(['deposit on-screen conveyancing', money(deposit.els['r-legal'].textContent)]);
  copDuty('nsw', 650000, false, true);
  conveyCases.push(['cost-of-purchase on-screen conveyancing', money(cop.els.conveyancing.textContent)]);
  for (const [label, got] of conveyCases) {
    checks++;
    if (got !== conveyRef) fail(`${label}: ${got} vs the all-states calculator's ${conveyRef}`);
  }
  checks++;
  if (deposit.run('INSPECTION') !== cop.run('INSPECTION')) fail(`building and pest: deposit ${deposit.run('INSPECTION')} vs cost-of-purchase ${cop.run('INSPECTION')}`);
  checks++;
  if (money(deposit.els['r-inspect'].textContent) !== money(cop.els.inspection.textContent)) fail('building and pest: the two pages show different figures');
});

// 4c. LMI tier copies. journey.js lmiRate() is the reference for how LMI is
// treated; estimateLmiTier() in the all-states calculator has the same tiers.
const journeyLmi = (() => {
  // Cut lmiRate() out of journey.js by matching its braces, so the check does
  // not depend on how the function is laid out.
  const a = journeySrc.indexOf('function lmiRate(');
  let b = a === -1 ? -1 : journeySrc.indexOf('{', a), depth = 0, end = -1;
  for (let i = b; i !== -1 && i < journeySrc.length; i++) {
    if (journeySrc[i] === '{') depth++;
    else if (journeySrc[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (end === -1) { checks++; fail('journey.js: lmiRate() not found'); return () => NaN; }
  return new Function(journeySrc.slice(a, end) + '\nreturn lmiRate;')();
})();
const LMI_COPIES = [
  ['all-states estimateLmiTier', (l) => main.run(`estimateLmiTier(${l}).rate`)],
  ['deposit lmiEstimate', (l) => deposit.run(`lmiEstimate(1000000, ${l} * 100)`) / 1000000],
  ['cost-of-purchase lmiRate', (l) => cop.run(`lmiRate(${l})`)],
  ['auction-budget lmiRate', (l) => auction.run(`lmiRate(${l})`)]
];
for (const [label, rate] of LMI_COPIES) {
  part('LMI tier ' + label, () => {
    for (const l of [0.5, 0.79, 0.8, 0.8001, 0.85, 0.8501, 0.9, 0.9001, 0.95, 0.9501, 0.99, 1.05]) {
      checks++;
      const got = rate(l), want = journeyLmi(l);
      if (!(Math.abs(got - want) < 1e-9)) fail(`LMI tier ${label} at LVR ${l}: ${got} vs journey.js ${want}`);
    }
  });
}
// A 10% deposit is exactly 90% LVR whatever the price (no float drift into the next tier).
part('LMI at a 10% deposit', () => {
  for (const price of [145758, 146443, 650000, 777777]) {
    checks++;
    const dep = price * 0.1, loan = price - dep;
    const got = deposit.run(`lmiEstimate(${loan}, ${(loan / price) * 100})`);
    if (!close(got, loan * 0.019)) fail(`deposit LMI at a 10% deposit on $${price}: ${got} vs ${loan * 0.019}`);
    cop.els.purchasePrice.value = String(price); cop.els.depositPct.value = '10'; cop.run('calc()');
    checks++;
    if (Math.abs(money(cop.els.lmi.textContent) - Math.round(loan * 0.019)) > 1) fail(`cost-of-purchase LMI at a 10% deposit on $${price}: ${cop.els.lmi.textContent}`);
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
const FUNDS = [[120000, 560000], [90000, 480000], [60000, 600000], [200000, 500000], [400000, 300000],
  [150000, 900000], [35000, 450000], [250000, 0], [800000, 1200000]];
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
        checks++;
        const wantDuty = money(mainDuty(st, p.W, 'home', owner ? 'owner' : 'investor', fhb));
        if (Math.abs(p.duty - wantDuty) > 1) fail(`${who}: duty at $${p.W} shows ${p.duty} vs all-states ${wantDuty}`);
        checks++;
        if (p.loan > pre + 1) fail(`${who}: total loan ${p.loan} is over the pre-approval`);
        checks++;
        if (p.cash > usable + 1) fail(`${who}: cash ${p.cash} is over usable savings ${usable}`);
        checks++;
        if (Math.abs(p.cash + p.loanBase - p.allIn) > 2) fail(`${who}: cash ${p.cash} + loan ${p.loanBase} does not add up to all-in ${p.allIn}`);
        checks++;
        const exact = auction.run(`planAt(${p.W}, { state: '${st}', fhb: ${fhb}, owner: ${owner}, legal: 1800, usable: ${usable} })`);
        const wantLmi = exact.loan * journeyLmi(exact.loan / p.W);
        if (Math.abs(p.lmi - wantLmi) > 1 || Math.abs(p.loan - (exact.loan + wantLmi)) > 1) fail(`${who}: LMI shows ${p.lmi}, total loan ${p.loan}; journey tiers give ${wantLmi} on ${exact.loan}`);
        checks++;
        if (exact.loan > 0 && p.lvrText !== (exact.loan / p.W * 100).toFixed(1) + '%') fail(`${who}: LVR shows "${p.lvrText}" vs ${(exact.loan / p.W * 100).toFixed(1)}%`);
        checks++;
        const next = auction.run(`planAt(${p.W + 1000}, { state: '${st}', fhb: ${fhb}, owner: ${owner}, legal: 1800, usable: ${usable} }).totalLoan`);
        if (next <= pre) fail(`${who}: $${p.W + 1000} would also fit, so $${p.W} is not the walk-away price`);
      }
    }
  }
}
});

if (fails) {
  console.error(`\nstate-duty-sync-test: ${fails} FAILED of ${checks} checks`);
  process.exit(1);
}
console.log(`state-duty-sync-test: all ${checks} checks passed (8 state pages, deposit, cost-of-purchase, FHB grants vs tools/stamp-duty-calculator.js; serviceability tax/expense-floor copy vs borrowing power; owner-occupier duty, conveyancing, LMI tiers and the auction solver on the upfront-cost calculators)`);

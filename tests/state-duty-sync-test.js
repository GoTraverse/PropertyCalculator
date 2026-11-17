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

if (fails) {
  console.error(`\nstate-duty-sync-test: ${fails} FAILED of ${checks} checks`);
  process.exit(1);
}
console.log(`state-duty-sync-test: all ${checks} checks passed (8 state pages, deposit, cost-of-purchase, FHB grants vs tools/stamp-duty-calculator.js; serviceability tax/expense-floor copy vs borrowing power)`);

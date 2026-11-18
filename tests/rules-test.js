#!/usr/bin/env node
/**
 * rules-test.js — shared/rules.js gives the figures the site gave before any
 * page moved onto it.
 *
 * tests/fixtures/rules-golden.json was generated from the OLD copies of the
 * rules (tools/stamp-duty-calculator.js, the grants, borrowing power and
 * mortgage repayment calculators, cost of purchase and journey.js) at tag
 * review-base-b, by tests/fixtures/make-rules-golden.js. This test checks
 * shared/rules.js against every row, then:
 *   - the reference figures in the build plan (section 5.3), to the cent;
 *   - the differences between the old copies that rules.js settles (its
 *     header, items 1 to 7, including one reading of a missing first home
 *     answer in purchase()) and the intended moves listed in the fixture;
 *   - the scheme sentences (fds().text, h2b().text, purchase().schemeNote
 *     and firstHomeNote), word for word;
 *   - that the module loads in a page as window.Rules and in Node, adds no
 *     other global, stays ES5, touches no DOM, storage or network, and
 *     freezes its tables;
 *   - that its visitor-facing strings follow the voice rules on dashes,
 *     stock words and "we".
 *
 * Run: node tests/rules-test.js   (exit 0 = pass)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { codeOnly } = require('./lib/source-defs');

const ROOT = path.join(__dirname, '..');
const RULES_FILE = path.join(ROOT, 'shared', 'rules.js');
const Rules = require(RULES_FILE);
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'rules-golden.json'), 'utf8'));

let checks = 0, fails = 0;
function fail(msg) { fails++; if (fails <= 60) console.error('FAIL ' + msg); }
// Same code, same operations: equal to the last bit.
function same(label, got, want) {
  checks++;
  const ok = (typeof want === 'number' && typeof got === 'number') ? (got === want || (isNaN(got) && isNaN(want))) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail(`${label}: ${JSON.stringify(got)} vs golden ${JSON.stringify(want)}`);
}
// Same rule written another way (header item 6, or a different order of
// additions): well under a cent.
let maxDrift = 0;
function close(label, got, want, tol) {
  checks++;
  const d = Math.abs(got - want);
  if (typeof got !== 'number' || !(d <= (tol || 1e-6))) { fail(`${label}: ${got} vs golden ${want}`); return; }
  if (d > maxDrift) maxDrift = d;
}
function cent(label, got, want) {
  checks++;
  if (typeof got !== 'number' || !(Math.abs(got - want) < 0.005)) fail(`${label}: ${got} vs ${want} (to the cent)`);
}
const pct = (dep) => Math.round(dep * 10000) / 100;

/* ── 1. Stamp duty ──────────────────────────────────────────────────────── */
for (const st of G.states) {
  const row = G.duty[st];
  G.prices.forEach((v, i) => {
    same(`calcDuty ${st} $${v}`, Rules.calcDuty(st, v), row.general[i]);
    same(`duty investor ${st} $${v}`, Rules.duty({ state: st, price: v, occupancy: 'invest' }).duty, row.general[i]);
    same(`duty owner-occupier ${st} $${v}`, Rules.duty({ state: st, price: v, occupancy: 'home' }).duty, row.owner[i]);
    same(`duty first home ${st} $${v}`, Rules.duty({ state: st, price: v, firstHome: true }).duty, row.firstHome[i]);
    same(`applyFhbConcession ${st} $${v}`, Rules.applyFhbConcession(st, v, Rules.calcDuty(st, v)).duty, row.firstHome[i]);
    same(`duty first home new build ${st} $${v}`, Rules.duty({ state: st, price: v, firstHome: true, build: 'new' }).duty, row.newBuild[i]);
    same(`duty first home off the plan ${st} $${v}`, Rules.duty({ state: st, price: v, firstHome: true, build: 'offplan' }).duty, row.newBuild[i]);
    same(`duty first home vacant land ${st} $${v}`, Rules.duty({ state: st, price: v, firstHome: true, land: true }).duty, row.firstHomeLand[i]);
    same(`foreign surcharge ${st} $${v}`, Rules.duty({ state: st, price: v, occupancy: 'invest', foreign: true }).surcharge, row.foreignSurcharge[i]);
    same(`duty upper-case state ${st} $${v}`, Rules.duty({ state: st.toUpperCase(), price: v, firstHome: true }).duty, row.firstHome[i]);
  });
}
for (const [st, v, label, note] of G.dutyNotes) {
  const o = label === 'owner' ? { occupancy: 'home' } : label === 'firstHome' ? { firstHome: true } : { firstHome: true, land: true };
  same(`duty note ${label} ${st} $${v}`, Rules.duty(Object.assign({ state: st, price: v }, o)).note, note);
}
// Cost of purchase's foreign buyer rows (duty + surcharge). A first home
// buyer who isn't living in it is an intended move (fhb-investor): the old
// page gave the concession, so that row is checked with occupancy 'home'.
for (const [st, v, fhb, owner, want] of G.foreign) {
  const occ = (fhb && !owner && st !== 'qld') ? 'home' : (owner ? 'home' : 'invest');
  same(`foreign buyer ${st} $${v} ${fhb ? 'first home' : ''} ${owner ? 'live in' : 'invest'}`, Rules.duty({ state: st, price: v, firstHome: fhb, occupancy: occ, foreign: true }).total, want);
}
// Unknown state, no price, negative price: nothing.
same('duty unknown state', Rules.duty({ state: 'xx', price: 650000 }).duty, 0);
same('duty no price', Rules.duty({ state: 'qld' }).duty, 0);
same('duty negative price', Rules.duty({ state: 'nsw', price: -5 }).duty, 0);

/* ── 2. Registration, legal and registration ────────────────────────────── */
for (const st of G.states) {
  G.registration.prices.forEach((v, i) => {
    same(`regFees ${st} $${v}`, Rules.regFees(st, v), G.registration[st][i]);
    same(`legalAndRegistration ${st} $${v}`, Rules.legalAndRegistration(st, v), G.legalAndRegistration[st][i]);
  });
}
same('regFees unknown state (old fallback)', Rules.regFees('xx', 500000), 400);

/* ── 3. LMI ─────────────────────────────────────────────────────────────── */
for (const [lvr, rate, label] of G.lmiRates) {
  same(`lmiRate ${lvr}`, Rules.lmiRate(lvr), rate);
  same(`lmiTier label ${lvr}`, Rules.lmiTier(lvr).label, label);
  same(`lmiTier rate ${lvr}`, Rules.lmiTier(lvr).rate, rate);
}
for (const [v, dp, lmi, loan] of G.lmiRows) {
  const r = Rules.lmi(v, dp);
  same(`lmi $${v} at ${dp}%`, r.lmi, lmi);
  same(`loan with LMI $${v} at ${dp}%`, r.loan, loan);
  same(`purchase lmi $${v} at ${dp}%`, Rules.purchase({ state: 'qld', price: v, depositPct: dp }).lmi, lmi);
  same(`purchase loan $${v} at ${dp}%`, Rules.purchase({ state: 'qld', price: v, depositPct: dp }).loan, loan);
}
// Header item 1: the grants calculator's whole dollars are Math.round of
// the unrounded figure.
for (const [v, want] of G.lmiRounded) {
  same(`grants LMI at 5% $${v}, rounded`, Math.round(Rules.lmi(v, 5).lmi), want);
}
for (const [v, dp, want] of G.sdLmi) same(`stamp duty page LMI $${v} at ${dp}%`, Math.round(Rules.lmi(v, dp).lmi), want);

/* ── 4. Grants and schemes ──────────────────────────────────────────────── */
for (const [st, v, ptype, amount, text] of G.fhog) {
  const r = Rules.fhog({ state: st, price: v, build: ptype });
  same(`fhog ${st} $${v} ${ptype}`, r.amount, amount);
  same(`fhog text ${st} $${v} ${ptype}`, r.text, text);
}
for (const [st, v, ptype, location, sdSaving, fhogAmt, totalCash, fdsOk, h2bOk] of G.grantsTotals) {
  const area = location === 'capital' ? 'capital' : 'other';
  const saving = Rules.duty({ state: st, price: v, firstHome: true, build: ptype }).firstHomeSaving;
  const g = Rules.fhog({ state: st, price: v, build: ptype }).amount;
  const f = Rules.fds({ state: st, area, price: v });
  const h = Rules.h2b({ state: st, area, price: v, income: 150000, buyers: 'couple', build: ptype });
  same(`grants duty saving ${st} $${v} ${ptype}`, saving, sdSaving);
  same(`grants FHOG ${st} $${v} ${ptype}`, g, fhogAmt);
  same(`grants total ${st} $${v} ${ptype} ${location}`, saving + g + (f.eligible ? Math.round(f.lmiAvoided) : 0), totalCash);
  same(`grants 5% Deposit Scheme ${st} $${v} ${location}`, f.eligible, fdsOk);
  same(`grants Help to Buy ${st} $${v} ${location} ${ptype}`, h.eligible, h2bOk);
}
for (const [st, area, v, eligible, cap, lmiAvoided] of G.fds) {
  const r = Rules.fds({ state: st, area, price: v, firstHome: true });
  same(`fds eligible ${st} ${area} $${v}`, r.eligible, eligible);
  same(`fds cap ${st} ${area}`, r.cap, cap);
  same(`fds LMI avoided ${st} ${area} $${v}, rounded`, Math.round(r.lmiAvoided), lmiAvoided);
  same(`fds LMI avoided ${st} ${area} $${v}, unrounded`, r.lmiAvoided, eligible ? Rules.lmi(v, 5).lmi : 0);
  same(`schemeCap fds ${st} ${area}`, Rules.schemeCap('fds', st, area), cap);
}
for (const [st, area, v, buyers, deps, income, build, issue, open, share, g] of G.h2b) {
  const r = Rules.h2b({ state: st, area, price: v, firstHome: true, buyers, dependants: deps, income, build });
  const who = `h2b ${st} ${area} $${v} ${buyers} deps ${deps} income ${income} ${build}`;
  same(who + ' issue (journey)', r.issue, issue);
  same(who + ' eligible (journey)', r.eligible, open);
  same(who + ' share (journey)', r.share, share);
  if (g) {
    const [eligible, incomeCap, propertyCap, equityShare, governmentEquity, yourBorrowing] = g;
    same(who + ' eligible (grants)', r.eligible, eligible);
    same(who + ' income cap (grants)', r.incomeCap, incomeCap);
    same(who + ' price cap (grants)', r.cap, propertyCap);
    same(who + ' equity share (grants)', r.equityShare, equityShare);
    same(who + ' government equity (grants, rounded)', Math.round(r.share), governmentEquity);
    same(who + ' your loan (grants, rounded)', Math.round(v * (1 - r.equityShare - r.minDepositPct / 100)), yourBorrowing);
  }
}
same('FHSS caps', [Rules.FHSS.maxContribAnnual, Rules.FHSS.maxTotal], [G.fhss.maxContribAnnual, G.fhss.maxTotal]);

/* ── 5. Tax, HELP, living costs, income types ───────────────────────────── */
for (const [g, tax, hecs] of G.tax) {
  same(`approxTax $${g}`, Rules.approxTax(g), tax);
  same(`hecsAnnual $${g}`, Rules.hecsAnnual(g), hecs);
}
for (const [inc, adults, deps, want] of G.hem) same(`hemMonthly $${inc} ${adults} adults ${deps} deps`, Rules.hemMonthly(inc, adults, deps), want);
for (const t of Object.keys(G.incomeTypeFactor)) same(`incomeTypeFactor ${t}`, Rules.incomeTypeFactor(t), G.incomeTypeFactor[t]);
for (const t of Object.keys(G.journeyIncomeFactor)) same(`incomeTypeFactor ${t} (journey's name)`, Rules.incomeTypeFactor(t), G.journeyIncomeFactor[t]);

/* ── 6. The borrowing test ──────────────────────────────────────────────── */
for (const c of G.borrowCalculator) {
  const joint = c.mode === 'joint';
  const r = Rules.borrow({
    incomes: joint ? [c.income1, c.income2 || 0] : [c.income1],
    types: joint ? [c.type1 || 'payg', c.type2 || 'payg'] : [c.type1 || 'payg'],
    hecs: joint ? [!!c.hecs1, !!c.hecs2] : [!!c.hecs1],
    dependants: c.deps || 0, cardLimits: c.card || 0, debtsMonthly: c.debt || 0, livingMonthly: c.expenses || 0,
    rate: c.rate, termYears: c.term || 30
  });
  const who = `borrow (calculator) ${JSON.stringify(c)}`;
  if (!r) { checks++; fail(who + ': null'); continue; }
  same(who + ' net a month', r.net, c.net);
  close(who + ' maximum loan', r.maxLoan, c.maxLoan);
}
for (const c of G.borrowJourney) {
  const r = Rules.borrow({ income: c.income, buyers: c.buyers, employment: c.employment || 'payg', dependants: Math.min(3, c.dependants || 0), cardLimits: c.cardLimits || 0, rate: 6.0, termYears: 30 });
  const who = `borrow (journey) ${c.buyers} $${c.income} ${c.employment || 'payg'} deps ${c.dependants || 0} cards ${c.cardLimits || 0}`;
  if (c.result === null) { same(who + ' no income gives null', r, null); continue; }
  same(who + ' net', r.net, c.result.net);
  same(who + ' living', r.living, c.result.living);
  same(who + ' card', r.card, c.result.card);
  same(who + ' left', r.left, c.result.left);
  close(who + ' maximum loan', r.maxLoan, c.result.maxLoan);
  same(who + ' split equally', r.split, c.buyers === 'couple');
  if ((c.dependants || 0) > 3) {
    // Intended move journey-dependants-cap (phase 4): uncapped is lower.
    const un = Rules.borrow({ income: c.income, buyers: c.buyers, dependants: c.dependants, rate: 6.0, termYears: 30 });
    checks++;
    if (!(un.maxLoan < r.maxLoan)) fail(who + ': more than 3 dependants should lower the maximum loan once the cap goes');
  }
}

/* ── 7. Repayments and schedules ────────────────────────────────────────── */
for (const [loan, rate, years, mrMonthly, jMonthly] of G.repay) {
  same(`repay $${loan} ${rate}% ${years}y (mortgage repayment calculator)`, Rules.repay(loan, rate, years), mrMonthly);
  if (years === 30 && rate > 0) close(`repay $${loan} ${rate}% (journey payAt)`, Rules.repay(loan, rate, years), jMonthly);
}
for (const c of G.schedules) {
  const who = `schedule $${c.loan} ${c.rate}% ${c.years}y extra ${c.extra || 0} offset ${c.offset || 0} io ${c.ioYears || 0}`;
  const s = Rules.schedule(c.loan, c.rate, c.years, { extra: c.extra, offset: c.offset, ioYears: c.ioYears });
  same(who + ' monthly', s.monthly, c.monthly);
  same(who + ' months to pay off', s.monthsToPayoff, c.monthsToPayoff);
  same(who + ' total interest', s.totalInterest, c.totalInterest);
  same(who + ' paid off early', s.paidOffEarly, c.paidOffEarly);
  same(who + ' post interest-only repayment', s.postIoPayment, c.postIoPayment);
  same(who + ' year by year', s.schedule, c.schedule);
  const f = Rules.schedule(c.loan, c.rate, c.years, { fortnightly: true });
  same(who + ' fortnights', f.fortnights, c.fortnightly.fortnights);
  same(who + ' fortnightly interest', f.totalInterest, c.fortnightly.totalInterest);
  same(who + ' fortnightly pays off', f.willPayOff, c.fortnightly.willPayOff);
  same(who + ' fortnightly payment', f.payment, c.monthly / 2);
}

/* ── 8. Journey step 3, its maximum price, and step 2 ───────────────────── */
{
  const cols = G.journeyStep3.columns;
  for (const row of G.journeyStep3.rows) {
    const o = {}; cols.forEach((k, i) => { o[k] = row[i]; });
    const r = Rules.purchase({ state: o.state, price: o.price, firstHome: o.firstHome, build: o.build, area: o.area, depositPct: o.depositPct, scheme: o.scheme, buyers: G.journeyStep3.buyers, income: G.journeyStep3.income });
    const who = `journey step 3 ${o.state} $${o.price} ${o.firstHome ? 'first home' : 'owned before'} ${o.build} ${o.area} ${o.depositPct}% ${o.scheme}`;
    same(who + ' scheme applied', r.schemeApplied, o.scheme !== 'none');
    same(who + ' duty', r.duty, o.duty);
    same(who + ' legal and registration', r.legalAndRegistration, o.legalAndRegistration);
    same(who + ' LMI', r.lmi, o.lmi);
    same(who + ' loan', r.loan, o.loan);
    same(who + ' cash needed', r.cashNeeded, o.cashNeeded);
    close(who + ' repayment at 6.00%', Rules.repay(r.loan, 6.0, 30), o.repayAt6);
    close(who + ' tested at 9.00%', Rules.repay(r.loan, 9.0, 30), o.testedAt9);
  }
}
// The step 3 suggested maximum: the highest price whose loan fits the
// borrowing estimate, rounded down to $5,000, found the way journey.js
// incomeCeiling() finds it.
for (const c of G.journeyCeiling) {
  const L = Rules.borrow({ income: c.income, buyers: c.buyers, cardLimits: c.cardLimits, rate: 6.0, termYears: 30 });
  const scheme = c.dep === 0.02 ? 'h2b' : c.dep === 0.05 ? 'fds' : 'none';
  let lo = 0, hi = 6000000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const loan = Rules.purchase({ state: c.state, area: c.area, price: mid, firstHome: c.firstHome, build: c.build, depositPct: pct(c.dep), scheme, buyers: c.buyers, income: c.income }).loan;
    if (loan <= L.maxLoan) lo = mid; else hi = mid;
  }
  const got = Math.floor(lo / 5000) * 5000;
  const who = `journey maximum price ${c.state} ${c.buyers} $${c.income} cards ${c.cardLimits} at ${pct(c.dep)}%`;
  const h2bCap = Rules.schemeCap('h2b', c.state, c.area);
  if (scheme === 'h2b' && c.ceiling > h2bCap) {
    // Intended move journey-h2b-ceiling (phase 4): the old search kept the
    // Help to Buy loan above the scheme's price cap.
    checks++;
    if (!(got < c.ceiling)) fail(who + `: expected the documented difference (old ${c.ceiling} above the ${h2bCap} cap), got ${got}`);
  } else {
    same(who, got, c.ceiling);
  }
}
for (const s of G.journeyStep2) {
  for (const p of s.paths) {
    if (!p.eligible) continue;
    const who = `journey step 2 ${s.state} $${s.price} ${p.name}`;
    const o = { state: s.state, price: s.price, firstHome: true, area: 'capital', build: 'established', buyers: 'couple', income: 150000 };
    const r = /^Save to 20/.test(p.name) ? Rules.purchase(Object.assign(o, { depositPct: 20 }))
      : /^10%/.test(p.name) ? Rules.purchase(Object.assign(o, { depositPct: 10 }))
      : /^5%/.test(p.name) ? Rules.purchase(Object.assign(o, { depositPct: 5, scheme: 'fds' }))
      : Rules.purchase(Object.assign(o, { depositPct: 2, scheme: 'h2b' }));
    close(who + ' cash needed', r.cashNeeded, p.need);
    close(who + ' LMI', r.lmi, p.lmi);
    close(who + ' loan', r.loan, p.loan);
    close(who + ' repayment', Rules.repay(r.loan, 6.0, 30), p.rep);
    close(who + ' government share', r.h2bShare, p.govShare);
  }
}

/* ── 9. Money input ─────────────────────────────────────────────────────── */
for (const [s, want] of G.parseMoney) {
  same(`parseMoney "${s}"`, Rules.parseMoney(s).value, want);
  same(`parseNumLoose "${s}"`, Rules.parseNumLoose(s), want);
}
for (const [s, code] of [['', 'blank'], ['   ', 'blank'], [null, 'blank'], ['abc', 'letters'], ['1.2 million', 'letters'], ['about 600k', 'letters'],
  ['600k-650k', 'range'], ['600,000 to 650,000', 'range'], ['600–700k', 'range'], ['-5000', 'negative'], ['−650,000', 'negative'], ['$-650,000', 'negative'],
  ['1.2.3', 'invalid'], ['$', 'invalid'], ['.', 'invalid'], ['650,000!', 'invalid']]) {
  const r = Rules.parseMoney(s);
  same(`parseMoney refuses ${JSON.stringify(s)}`, [r.value, r.error], [null, code]);
  checks++;
  if (!r.message || /—| – /.test(r.message)) fail(`parseMoney ${JSON.stringify(s)}: message missing or has a dash pause`);
}
for (const [s, want] of [['AUD 650,000', 650000], ['$ 650,000', 650000], ['650000 aud', 650000], ['.5m', 500000], ['0', 0]]) same(`parseMoney accepts "${s}"`, Rules.parseMoney(s).value, want);

/* ── 10. The plan's reference figures (section 5.3), to the cent ────────── */
cent('QLD owner-occupier $650,000 duty', Rules.duty({ state: 'qld', price: 650000 }).duty, 15100);
cent('QLD investor $650,000 duty', Rules.duty({ state: 'qld', price: 650000, occupancy: 'invest' }).duty, 22275);
cent('NSW first home $850,000 duty', Rules.duty({ state: 'nsw', price: 850000, firstHome: true }).duty, 9796.75);
cent('NSW first home $900,000 duty (Revenue NSW table)', Rules.duty({ state: 'nsw', price: 900000, firstHome: true }).duty, 19593.5);
cent('WA first home $650,000 duty', Rules.duty({ state: 'wa', price: 650000, firstHome: true }).duty, 8075);
cent('WA first home $700,000 duty', Rules.duty({ state: 'wa', price: 700000, firstHome: true }).duty, 16150);
cent('QLD first home $650,000 duty', Rules.duty({ state: 'qld', price: 650000, firstHome: true }).duty, 0);
cent('QLD first home $730,000 duty (QRO worked example)', Rules.duty({ state: 'qld', price: 730000, firstHome: true }).duty, 6555);
cent('VIC first home $700,000 duty (SRO)', Math.round(Rules.duty({ state: 'vic', price: 700000, firstHome: true }).duty), 24713);
cent('NT first home new home $650,000 pays full duty', Rules.duty({ state: 'nt', price: 650000, firstHome: true, build: 'new' }).duty, Rules.calcDuty('nt', 650000));
cent('QLD registration at $650,000', Rules.regFees('qld', 650000), 2684);
cent('SA registration at $650,000', Rules.regFees('sa', 650000), 6857);
cent('QLD $650,000 at 10%: LMI', Rules.lmi(650000, 10).lmi, 11115);
cent('QLD $650,000 at 10%: loan with LMI', Rules.purchase({ state: 'qld', price: 650000, depositPct: 10 }).loan, 596115);
cent('$585,000 at 6.25% over 30 years', Rules.repay(585000, 6.25, 30), 3601.95);
{
  const b = Rules.borrow({ incomes: [95000, 70000], rate: 6.25, termYears: 30 });
  cent('couple $95,000 + $70,000: net a month', b.net, 10930);
  cent('couple $95,000 + $70,000: living-cost floor', b.living, 4080);
  cent('couple $95,000 + $70,000 at 6.25%: maximum loan, whole dollars', Math.round(b.maxLoan), 832649);
  cent('couple $95,000 + $70,000 at 6.00%: maximum loan, whole dollars', Math.round(Rules.borrow({ incomes: [95000, 70000], rate: 6.0, termYears: 30 }).maxLoan), 851331);
}
cent('NSW general duty $1,000,000 (whole-dollar bases)', Rules.calcDuty('nsw', 1000000), 39187);
cent('NSW general duty $103,001', Rules.calcDuty('nsw', 103001), 1662.04);
cent('conveyancing', Rules.CONVEYANCING, 1800);

/* ── 11. Settled differences (rules.js header, items 1 to 7) ────────────── */
{
  // 1. LMI is not rounded; a page that wants whole dollars rounds it.
  const x = Rules.lmi(777777, 5).lmi;
  checks++;
  if (x === Math.round(x)) fail('lmi(777777, 5) should keep its cents');
  same('lmi(777777, 5) rounded = the grants calculator', Math.round(x), (G.lmiRounded.find((r) => r[0] === 777777) || [])[1]);
  // 2. A single parent gets the joint Help to Buy income cap.
  const sp = Rules.h2b({ state: 'qld', area: 'capital', price: 650000, buyers: 'single', dependants: 1, income: 150000 });
  same('Help to Buy single parent: income cap', sp.incomeCap, 165000);
  same('Help to Buy single parent: capFor', sp.capFor, 'singleParent');
  same('Help to Buy single parent on $150,000: eligible', sp.eligible, true);
  same('Help to Buy single, no dependants, $150,000: not eligible on income', Rules.h2b({ state: 'qld', area: 'capital', price: 650000, buyers: 'single', income: 150000 }).issue, 'income');
  same('Help to Buy with no income given: not counted against the cap', Rules.h2b({ state: 'qld', area: 'capital', price: 650000 }).incomeOk, true);
  // 3. The 5% Deposit Scheme from 5% up to 20%.
  const base = { state: 'qld', area: 'capital', price: 650000, firstHome: true, scheme: 'fds' };
  const p10 = Rules.purchase(Object.assign({ depositPct: 10 }, base));
  same('5% Deposit Scheme at 10%: applied', p10.schemeApplied, true);
  same('5% Deposit Scheme at 10%: no LMI', p10.lmi, 0);
  same('5% Deposit Scheme at 10%: loan', p10.loan, 650000 * 0.9);
  const p4 = Rules.purchase(Object.assign({ depositPct: 4 }, base));
  same('5% Deposit Scheme at 4%: not applied (deposit)', [p4.schemeApplied, p4.schemeIssue], [false, 'deposit']);
  checks++; if (!(p4.lmi > 0)) fail('5% Deposit Scheme at 4%: LMI should apply');
  same('5% Deposit Scheme over the cap: not applied (price)', Rules.purchase(Object.assign({}, base, { price: 1100000, depositPct: 5 })).schemeIssue, 'price');
  same('5% Deposit Scheme for an investment: not applied', Rules.purchase(Object.assign({}, base, { depositPct: 5, occupancy: 'invest' })).schemeIssue, 'invest');
  same('5% Deposit Scheme for someone who has owned before: not applied', Rules.purchase(Object.assign({}, base, { depositPct: 5, firstHome: false })).schemeIssue, 'notFirstHome');
  same('FDS deposit range', [Rules.FDS.minDepositPct, Rules.FDS.maxDepositPct], [5, 20]);
  // At 20% or more there is no LMI to waive, so the scheme is not applied.
  for (const dp of [20, 30, 100]) {
    const p = Rules.purchase(Object.assign({ depositPct: dp }, base));
    same(`5% Deposit Scheme at ${dp}%: not applied (depositHigh)`, [p.schemeApplied, p.schemeIssue], [false, 'depositHigh']);
    same(`5% Deposit Scheme at ${dp}%: no LMI, loan is the price less the deposit`, [p.lmi, p.loan], [0, 650000 * (1 - dp / 100)]);
  }
  same('5% Deposit Scheme at 19.99%: applied', Rules.purchase(Object.assign({ depositPct: 19.99 }, base)).schemeApplied, true);
  // Not yet read on housingaustralia.gov.au (unreachable from the build
  // session). Once someone has read it there: set depositRangeChecked to
  // true and depositRangeSource to that page and the date, change FDS if
  // the range differs, and change false to true here. Needed before
  // phase 5, the first phase that shows the scheme at a deposit other
  // than 5%.
  same('the range is stated as not yet checked at Housing Australia', Rules.META.schemes.fds.depositRangeChecked, false);
  // 4. First home concessions need occupancy 'home'.
  for (const [st, v, today, rules] of G.intendedMoves.find((m) => m.id === 'fhb-investor').rows) {
    same(`intended move fhb-investor ${st} $${v}: rules`, Rules.duty({ state: st, price: v, firstHome: true, occupancy: 'invest' }).duty, rules);
    same(`intended move fhb-investor ${st} $${v}: today = the live-in figure`, Rules.duty({ state: st, price: v, firstHome: true, occupancy: 'home' }).duty, today);
    same(`intended move fhb-investor ${st} $${v}: no first home saving`, Rules.duty({ state: st, price: v, firstHome: true, occupancy: 'invest' }).firstHomeSaving, 0);
  }
  for (const [st, v, today, rules] of G.intendedMoves.find((m) => m.id === 'qld-land-investor').rows) {
    same(`intended move qld-land-investor $${v}: rules`, Rules.duty({ state: st, price: v, firstHome: true, occupancy: 'invest', land: true }).duty, rules);
    same(`intended move qld-land-investor $${v}: today`, Rules.duty({ state: st, price: v, firstHome: true, land: true }).duty, today);
  }
  for (const [st, v, today, rules] of G.intendedMoves.find((m) => m.id === 'new-homes-all-states').rows) {
    same(`intended move new-homes ${st} $${v}: rules`, Rules.duty({ state: st, price: v, firstHome: true, build: 'new' }).duty, rules);
    same(`intended move new-homes ${st} $${v}: today = established`, Rules.duty({ state: st, price: v, firstHome: true, build: 'established' }).duty, today);
    checks++; if (st !== 'qld' && st !== 'sa') fail(`new home relief outside QLD and SA: ${st}`);
  }
  // 5. QLD foreign buyers pay the general rate plus the surcharge.
  for (const [st, v, fhb, owner, today, rules] of G.intendedMoves.find((m) => m.id === 'qld-foreign').rows) {
    same(`intended move qld-foreign $${v} ${fhb ? 'first home' : 'owner'}: rules`, Rules.duty({ state: st, price: v, firstHome: fhb, occupancy: owner ? 'home' : 'invest', foreign: true }).total, rules);
    const domestic = Rules.duty({ state: st, price: v, firstHome: fhb, occupancy: owner ? 'home' : 'invest' }).duty;
    same(`intended move qld-foreign $${v} ${fhb ? 'first home' : 'owner'}: today = concession + surcharge`, domestic + v * 0.08, today);
  }
  same('QLD foreign first home buyer: basis', Rules.duty({ state: 'qld', price: 650000, firstHome: true, foreign: true }).basis, 'qldForeign');
  same('NSW foreign first home buyer keeps the concession (not modelled)', Rules.duty({ state: 'nsw', price: 650000, firstHome: true, foreign: true }).duty, 0);
  // 6. The repayment formulas agree to well under a cent.
  checks++;
  if (!(maxDrift < 1e-6)) fail('largest difference from the old formulas is ' + maxDrift);
  // The new-home relief is QLD and SA only.
  same('new-home duty relief states', Object.keys(Rules.NEW_HOME_DUTY_FREE).sort(), ['qld', 'sa']);
}
// purchase() odds and ends.
{
  const p = Rules.purchase({ state: 'nsw', price: 650000, depositPct: 10, foreign: true, extras: [{ amount: 500 }, 250] });
  same('purchase: the surcharge is in the costs', p.costs, p.duty + p.surcharge + p.legalAndRegistration);
  same('purchase: extras are added to cash needed', p.cashNeeded, p.deposit + p.costs + 750);
  const h = Rules.purchase({ state: 'qld', area: 'capital', price: 650000, firstHome: true, depositPct: 2, scheme: 'h2b', buyers: 'couple', income: 150000 });
  same('purchase Help to Buy: share', h.h2bShare, 650000 * 0.3);
  same('purchase Help to Buy: no LMI', h.lmi, 0);
  const hOver = Rules.purchase({ state: 'qld', area: 'capital', price: 650000, firstHome: true, depositPct: 2, scheme: 'h2b', buyers: 'single', income: 120000 });
  same('purchase Help to Buy over the income cap: not applied', [hOver.schemeApplied, hOver.schemeIssue, hOver.h2bShare], [false, 'income', 0]);
  checks++; if (!(hOver.lmi > 0)) fail('purchase Help to Buy not applied at 2%: LMI should apply');
  // A deposit that, with the government's full share, covers the whole
  // price: the scheme is not applied and the loan is never negative.
  const hb = { state: 'qld', area: 'capital', price: 650000, firstHome: true, scheme: 'h2b', buyers: 'couple', income: 150000 };
  for (const [build, dp, applied] of [['established', 69, true], ['established', 70, false], ['established', 75, false], ['established', 100, false], ['new', 59, true], ['new', 60, false], ['new', 90, false]]) {
    const p = Rules.purchase(Object.assign({ depositPct: dp, build }, hb));
    const who = `purchase Help to Buy ${build} at ${dp}%`;
    same(who + ': applied', [p.schemeApplied, p.schemeIssue], applied ? [true, null] : [false, 'depositHigh']);
    checks++; if (!(p.loan >= 0) || !(p.loanBase >= 0)) fail(who + ': negative loan ' + p.loan);
    checks++; if (Math.abs(p.deposit + p.h2bShare + p.loanBase - 650000) > 1e-6) fail(who + ': deposit, share and loan do not add up to the price');
    if (!applied) same(who + ': no share', p.h2bShare, 0);
  }
}
// 7. A missing first home answer (rules.js header, item 7). purchase() reads
// only true as a first home buyer and uses that one reading for duty, both
// schemes and the FHOG, so no call can mix a non-first-home duty with a
// first home scheme or grant.
{
  const q = Rules.purchase({ state: 'qld', area: 'capital', price: 650000, depositPct: 5, scheme: 'fds' });
  same('purchase QLD $650,000 5% Deposit Scheme, no first home answer: duty', [q.duty, q.dutyBasis], [15100, 'qldHome']);
  same('purchase QLD, no first home answer: scheme not applied', [q.schemeApplied, q.schemeIssue], [false, 'firstHomeUnknown']);
  same('purchase QLD, no first home answer: LMI applies', q.lmi, Rules.lmi(650000, 5).lmi);
  same('purchase QLD, no first home answer: firstHome', q.firstHome, null);
  checks++; if (!q.firstHomeNote) fail('purchase with no first home answer: firstHomeNote missing');
  const n = Rules.purchase({ state: 'nsw', area: 'capital', price: 700000, depositPct: 2, scheme: 'h2b', buyers: 'couple', income: 150000, build: 'new' });
  same('purchase NSW $700,000 Help to Buy, no first home answer: general duty', n.duty, Rules.calcDuty('nsw', 700000));
  same('purchase NSW, no first home answer: Help to Buy not applied', [n.schemeApplied, n.schemeIssue, n.h2bShare], [false, 'firstHomeUnknown', 0]);
  const g = Rules.purchase({ state: 'qld', area: 'capital', price: 600000, depositPct: 10, build: 'new' });
  same('purchase QLD new $600,000, no first home answer: no FHOG', [g.fhog.amount, g.fhog.eligible, g.fhog.reason], [0, false, 'firstHomeUnknown']);
  same('purchase QLD new $600,000, no first home answer: duty matches', g.duty, Rules.duty({ state: 'qld', price: 600000, build: 'new' }).duty);
  // Every state, price, build and scheme: no answer (or anything but true
  // or false) gives the same figures as "owned before", and never a scheme
  // or grant. true still gives the first home figures.
  for (const st of G.states) for (const v of [450000, 650000, 800000, 1100000]) for (const build of ['established', 'new']) {
    for (const [scheme, dp] of [['none', 10], ['fds', 5], ['fds', 10], ['h2b', 2]]) {
      const inp = { state: st, area: 'capital', price: v, build, depositPct: dp, scheme, buyers: 'couple', income: 150000 };
      const no = Rules.purchase(Object.assign({ firstHome: false }, inp));
      const yes = Rules.purchase(Object.assign({ firstHome: true }, inp));
      for (const [label, fh] of [['missing', undefined], ['null', null], ['"yes"', 'yes'], ['1', 1]]) {
        const p = Rules.purchase(fh === undefined ? inp : Object.assign({ firstHome: fh }, inp));
        const who = `purchase ${st} $${v} ${build} ${scheme} ${dp}% firstHome ${label}`;
        same(who + ': figures as owned before', [p.duty, p.lmi, p.loan, p.cashNeeded], [no.duty, no.lmi, no.loan, no.cashNeeded]);
        same(who + ': no scheme, no grant', [p.schemeApplied, p.h2bShare, p.fhog.amount, p.fds.eligible, p.h2b.eligible], [false, 0, 0, false, false]);
        same(who + ': issue', p.schemeIssue, scheme === 'none' ? null : 'firstHomeUnknown');
        same(who + ': firstHome', p.firstHome, null);
      }
      same(`purchase ${st} $${v} ${build} ${scheme} ${dp}% firstHome true: firstHome`, yes.firstHome, true);
      same(`purchase ${st} $${v} ${build} ${scheme} ${dp}% firstHome true: first home duty`, yes.duty, Rules.duty({ state: st, price: v, build, firstHome: true }).duty);
      same(`purchase ${st} $${v} ${build} ${scheme} ${dp}% firstHome false: no firstHomeNote`, no.firstHomeNote, '');
    }
  }
  same('purchase investment, no first home answer: no firstHomeNote', Rules.purchase({ state: 'qld', price: 650000, depositPct: 10, occupancy: 'invest' }).firstHomeNote, '');
  // depositFromSavings() reads firstHome the same way, so its costs match
  // purchase() for the same inputs.
  for (const st of G.states) for (const v of [450000, 650000, 900000]) for (const fh of [true, false, undefined, 'yes']) {
    const o = { state: st, price: v, build: 'established', saved: 120000 };
    if (fh !== undefined) o.firstHome = fh;
    same(`depositFromSavings ${st} $${v} firstHome ${fh}: costs = purchase() costs`, Rules.depositFromSavings(o).costs, Rules.purchase(Object.assign({ depositPct: 0 }, o)).costs);
  }
  // On their own, fhog(), fds() and h2b() keep the grants calculator's
  // default: no answer is a first home buyer (the golden rows rely on it).
  same('fhog on its own, no first home answer: the grants calculator default', Rules.fhog({ state: 'qld', price: 600000, build: 'new' }).amount, 30000);
  same('fds on its own, no first home answer: eligible', Rules.fds({ state: 'qld', area: 'capital', price: 650000 }).eligible, true);
  same('h2b on its own, no first home answer: eligible', Rules.h2b({ state: 'qld', area: 'capital', price: 650000, buyers: 'couple', income: 150000 }).eligible, true);
  same('fhog on its own, firstHome false', Rules.fhog({ state: 'qld', price: 600000, build: 'new', firstHome: false }).reason, 'notFirstHome');
  // Both schemes are for a home you live in; with no occupancy, a home.
  same('fds for an investment', [Rules.fds({ state: 'qld', area: 'capital', price: 650000, occupancy: 'invest' }).eligible, Rules.fds({ state: 'qld', area: 'capital', price: 650000, occupancy: 'invest' }).issue], [false, 'invest']);
  same('h2b for an investment', [Rules.h2b({ state: 'qld', area: 'capital', price: 650000, occupancy: 'invest' }).eligible, Rules.h2b({ state: 'qld', area: 'capital', price: 650000, occupancy: 'invest' }).issue], [false, 'invest']);
  same('fds for a home you live in', Rules.fds({ state: 'qld', area: 'capital', price: 650000, occupancy: 'home' }).eligible, true);
}

// The scheme sentences (rules.js header). Each eligibility sentence and
// each reason for not applying a scheme, pinned word for word, so a change
// to the wording is deliberate. Moved from the grants calculator and
// journey.js h2bIssue().
{
  const fdsBase = { state: 'qld', area: 'capital', price: 650000, firstHome: true };
  same('fds text: fits', Rules.fds(fdsBase).text, 'The price is within the $1,000,000 cap for this area, so the 5% Deposit Scheme fits. Its guarantee replaces LMI, and there’s no income cap (since 1 October 2025). Only lenders on Housing Australia’s panel offer it.');
  same('fds text: price', Rules.fds(Object.assign({}, fdsBase, { area: 'regional', price: 750000 })).text, 'The price is over the $700,000 cap for this area, so the 5% Deposit Scheme doesn’t fit.');
  same('fds text: not a first home buyer', Rules.fds(Object.assign({}, fdsBase, { firstHome: false })).text, 'The 5% Deposit Scheme is for people who have never owned property in Australia, or haven’t owned any in the last 10 years.');
  same('fds text: investment', Rules.fds(Object.assign({}, fdsBase, { occupancy: 'invest' })).text, 'The 5% Deposit Scheme is only for a home you will live in.');
  same('fds text: unknown state', Rules.fds({ state: 'xx', price: 650000 }).text, '');
  const hb = { state: 'qld', area: 'capital', price: 650000, firstHome: true, buyers: 'couple', income: 150000 };
  same('h2b text: fits', Rules.h2b(hb).text, 'The price is within the $1,000,000 Help to Buy cap for this area and the household income is within the $165,000 cap for joint applicants, so Help to Buy fits. You need a 2% deposit, and the government takes a share of up to 30%, as I’ve assumed an established home. It takes its proportional share of any gain when you sell or refinance.');
  same('h2b text: fits, new home', Rules.h2b(Object.assign({}, hb, { build: 'new' })).text, 'The price is within the $1,000,000 Help to Buy cap for this area and the household income is within the $165,000 cap for joint applicants, so Help to Buy fits. You need a 2% deposit, and the government takes a share of up to 40% of a new home. It takes its proportional share of any gain when you sell or refinance.');
  same('h2b text: no income given', Rules.h2b({ state: 'qld', area: 'capital', price: 650000, build: 'established' }).text, 'The price is within the $1,000,000 Help to Buy cap for this area. I haven’t checked the income caps ($103,000 single, $165,000 joint or single parent) because I don’t have your household income. You need a 2% deposit, and the government takes a share of up to 30% of an established home. It takes its proportional share of any gain when you sell or refinance.');
  same('h2b text: price', Rules.h2b(Object.assign({}, hb, { price: 1100000 })).text, 'The price is over the $1,000,000 Help to Buy cap for this area.');
  same('h2b text: income, single parent', Rules.h2b(Object.assign({}, hb, { buyers: 'single', dependants: 2, income: 170000 })).text, 'The household income is over the $165,000 Help to Buy cap for single parents, the same as for joint applicants (caps from 1 July 2026).');
  same('h2b text: income, single', Rules.h2b(Object.assign({}, hb, { buyers: 'single', income: 120000 })).text, 'The household income is over the $103,000 Help to Buy cap for single applicants without dependants (caps from 1 July 2026).');
  same('h2b text: not a first home buyer', Rules.h2b(Object.assign({}, hb, { firstHome: false })).text, 'I only work out Help to Buy for first home buyers.');
  same('h2b text: investment', Rules.h2b(Object.assign({}, hb, { occupancy: 'invest' })).text, 'Help to Buy is only for a home you will live in.');
  // purchase().schemeNote for every outcome.
  const P = (o) => Rules.purchase(Object.assign({ state: 'qld', area: 'capital', price: 650000, firstHome: true, buyers: 'couple', income: 150000, build: 'established' }, o));
  const notes = [
    ['no scheme', P({ depositPct: 10 }), null, ''],
    ['5% Deposit Scheme applied', P({ depositPct: 5, scheme: 'fds' }), null, 'The 5% Deposit Scheme’s guarantee replaces LMI, so there’s none on this loan.'],
    ['Help to Buy applied', P({ depositPct: 2, scheme: 'h2b' }), null, 'The government’s 30% share, $195,000, comes off the loan, and there’s no LMI.'],
    ['5% Deposit Scheme, investment', P({ depositPct: 5, scheme: 'fds', occupancy: 'invest' }), 'invest', 'The 5% Deposit Scheme is only for a home you will live in, so I haven’t applied it.'],
    ['Help to Buy, investment', P({ depositPct: 2, scheme: 'h2b', occupancy: 'invest' }), 'invest', 'Help to Buy is only for a home you will live in, so I haven’t applied it.'],
    ['5% Deposit Scheme, owned before', P({ depositPct: 5, scheme: 'fds', firstHome: false }), 'notFirstHome', 'The 5% Deposit Scheme is for people who have never owned property in Australia, or haven’t owned any in the last 10 years, so I haven’t applied it.'],
    ['Help to Buy, owned before', P({ depositPct: 2, scheme: 'h2b', firstHome: false }), 'notFirstHome', 'I only work out Help to Buy for first home buyers, so I haven’t applied it.'],
    ['5% Deposit Scheme, no first home answer', P({ depositPct: 5, scheme: 'fds', firstHome: undefined }), 'firstHomeUnknown', 'I don’t know yet whether this is your first home, so I haven’t applied the 5% Deposit Scheme.'],
    ['Help to Buy, no first home answer', P({ depositPct: 2, scheme: 'h2b', firstHome: undefined }), 'firstHomeUnknown', 'I don’t know yet whether this is your first home, so I haven’t applied Help to Buy.'],
    ['5% Deposit Scheme, over the cap', P({ depositPct: 5, scheme: 'fds', price: 1100000 }), 'price', 'The price is over the $1,000,000 cap for this area, so I haven’t applied the 5% Deposit Scheme.'],
    ['Help to Buy, over the cap', P({ depositPct: 2, scheme: 'h2b', price: 1100000 }), 'price', 'The price is over the $1,000,000 Help to Buy cap for this area, so I haven’t applied it.'],
    ['Help to Buy, income', P({ depositPct: 2, scheme: 'h2b', buyers: 'single', income: 120000 }), 'income', 'The household income is over the $103,000 Help to Buy cap for single applicants without dependants, so I haven’t applied it.'],
    ['5% Deposit Scheme, under 5%', P({ depositPct: 4, scheme: 'fds' }), 'deposit', 'The 5% Deposit Scheme needs a deposit of at least 5%, so I haven’t applied it.'],
    ['Help to Buy, under 2%', P({ depositPct: 1, scheme: 'h2b' }), 'deposit', 'Help to Buy needs a deposit of at least 2%, so I haven’t applied it.'],
    ['5% Deposit Scheme, 20% or more', P({ depositPct: 20, scheme: 'fds' }), 'depositHigh', 'With a deposit of 20% or more there’s no LMI for the 5% Deposit Scheme to replace, so I haven’t applied it.'],
    ['Help to Buy, nothing left to borrow', P({ depositPct: 70, scheme: 'h2b' }), 'depositHigh', 'With this deposit, the government’s 30% share would leave nothing to borrow, so I haven’t applied Help to Buy.']
  ];
  for (const [label, p, issue, note] of notes) {
    same(`schemeNote ${label}: issue`, p.schemeIssue, issue);
    same(`schemeNote ${label}`, p.schemeNote, note);
  }
  same('firstHomeNote', Rules.purchase({ state: 'qld', price: 650000, depositPct: 10 }).firstHomeNote, 'I don’t know yet whether this is your first home, so I’ve left out the first home duty concessions, the FHOG and the schemes.');
  same('FHOG with no first home answer (purchase)', Rules.purchase({ state: 'qld', price: 600000, depositPct: 10, build: 'new' }).fhog.text, 'I don’t know yet whether this is your first home, so I haven’t counted the FHOG.');
  // Each scheme's sentence in purchase() is there whichever scheme is chosen.
  const both = P({ depositPct: 10 });
  same('purchase carries both eligibility sentences', [both.fds.text, both.h2b.text], [Rules.fds({ state: 'qld', area: 'capital', price: 650000 }).text, Rules.h2b({ state: 'qld', area: 'capital', price: 650000, buyers: 'couple', income: 150000, build: 'established' }).text]);
}

// The exported low-level functions take a state code in any case, as
// duty(), regFees() and purchase() do (the deposit and cost of purchase
// pages use upper case).
for (const st of G.states) {
  for (const v of [250000, 650000, 850000, 1500000]) {
    same(`calcDuty ${st.toUpperCase()} $${v}`, Rules.calcDuty(st.toUpperCase(), v), Rules.calcDuty(st, v));
    same(`applyFhbConcession ${st.toUpperCase()} $${v}`, Rules.applyFhbConcession(st.toUpperCase(), v, Rules.calcDuty(st, v)), Rules.applyFhbConcession(st, v, Rules.calcDuty(st, v)));
    same(`regFeesTotal ${st.toUpperCase()} $${v}`, Rules.regFeesTotal(st.toUpperCase(), v), Rules.regFees(st, v));
  }
}
cent('calcDuty QLD in upper case', Rules.calcDuty('QLD', 650000), 22275);
cent('regFeesTotal QLD in upper case', Rules.regFeesTotal('QLD', 650000), 2684);
cent('applyFhbConcession NSW in upper case', Rules.applyFhbConcession('NSW', 850000, Rules.calcDuty('nsw', 850000)).duty, 9796.75);
// depositFromSavings(): all the savings left after duty, registration and
// conveyancing, no 20% cap.
{
  const d = Rules.depositFromSavings({ state: 'qld', price: 650000, firstHome: true, saved: 90000 });
  same('depositFromSavings QLD first home $650,000, $90,000 saved: costs', d.costs, 4500);
  same('depositFromSavings: deposit', d.deposit, 85500);
  cent('depositFromSavings: deposit %', d.depositPct, 85500 / 6500);
  const big = Rules.depositFromSavings({ state: 'qld', price: 650000, firstHome: true, saved: 300000 });
  same('depositFromSavings: no 20% cap', big.deposit, 295500);
  const short = Rules.depositFromSavings({ state: 'nsw', price: 650000, saved: 20000 });
  same('depositFromSavings: savings below the costs', [short.deposit, short.short], [0, short.costs - 20000]);
  same('depositFromSavings: never more than the price', Rules.depositFromSavings({ state: 'act', price: 100000, firstHome: true, saved: 900000 }).deposit, 100000);
}
// The rate nobody has chosen yet.
same('DEFAULT_RATE (owner decision pending; 6.00 keeps the Journey as it is)', Rules.DEFAULT_RATE, 6.0);
same('META.defaultRate.decided', Rules.META.defaultRate.decided, false);
same('DEFAULT_TERM_YEARS', Rules.DEFAULT_TERM_YEARS, 30);
same('borrow with no rate uses DEFAULT_RATE', Rules.borrow({ income: 100000 }).rate, Rules.DEFAULT_RATE);

/* ── 12. Sources for every caption ──────────────────────────────────────── */
for (const st of Rules.STATES) {
  const d = Rules.META.duty.sources[st];
  checks++; if (!d || !d.name || !/^https:\/\//.test(d.url)) fail(`META.duty.sources.${st} missing`);
  checks++; if (!Rules.META.registration.sources[st]) fail(`META.registration.sources.${st} missing`);
  checks++; if (!/^https:\/\//.test(Rules.SCHEMES[st].revenueUrl) || !Rules.SCHEMES[st].revenueOffice) fail(`SCHEMES.${st} source missing`);
  checks++; if (!Rules.STATE_DATA[st] || !Rules.STATE_DATA[st].name) fail(`STATE_DATA.${st} missing`);
}
for (const k of ['fy', 'duty', 'registration', 'conveyancing', 'lmi', 'schemes', 'tax', 'hecs', 'hem', 'borrowing', 'defaultRate']) {
  checks++; if (!Rules.META[k]) fail('META.' + k + ' missing');
}
same('META.fy', Rules.META.fy, '2026-27');

/* ── 13. The module itself ──────────────────────────────────────────────── */
const SRC = fs.readFileSync(RULES_FILE, 'utf8');
const CODE = codeOnly(SRC);
// ES5, so every browser the site supports runs it.
for (const [what, re] of [['an arrow function', /=>/], ['let or const', /\b(?:let|const)\s/], ['a class', /\bclass\s/], ['a template string', /`/], ['spread', /\.\.\.[A-Za-z_$[{(]/]]) {
  checks++; if (re.test(CODE)) fail('shared/rules.js uses ' + what + '; keep it ES5');
}
// No DOM, storage, network, analytics or logging: values never leave it.
for (const word of ['document', 'window', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'navigator', 'gtag', 'track', 'console', 'sendBeacon', 'location']) {
  checks++; if (new RegExp('\\b' + word + '\\b').test(CODE)) fail('shared/rules.js mentions ' + word);
}
// Loads in a page as window.Rules and adds nothing else.
{
  const sb = {};
  sb.self = sb; sb.window = sb;
  vm.createContext(sb);
  const before = Object.keys(sb).sort().join(',');
  vm.runInContext(SRC, sb, { filename: 'rules.js' });
  const added = Object.keys(sb).filter((k) => before.split(',').indexOf(k) === -1);
  same('page load: globals added', added, ['Rules']);
  same('page load: same API as Node', Object.keys(sb.Rules).sort(), Object.keys(Rules).sort());
  same('page load: a figure', sb.Rules.duty({ state: 'qld', price: 650000 }).duty, 15100);
}
// Frozen: a page can't change a rule for every other page.
{
  const frozen = [Rules, Rules.STATE_DATA, Rules.STATE_DATA.nsw, Rules.STATE_DATA.nsw.tiers, Rules.STATE_DATA.nsw.tiers[0], Rules.SCHEMES.qld.fhog,
    Rules.SCHEMES.qld.fdsCap, Rules.REG_FEES.nsw, Rules.LMI_TIERS[1], Rules.H2B.incomeCap, Rules.FDS, Rules.FHSS, Rules.META.duty.sources.nsw, Rules.STATES];
  frozen.forEach((o, i) => { checks++; if (!Object.isFrozen(o)) fail('table ' + i + ' is not frozen'); });
  checks++;
  try { (function () { 'use strict'; Rules.STATE_DATA.nsw.tiers[0].rate = 0; })(); fail('a rate could be changed'); } catch (e) { /* expected */ }
}
// Voice: no em dash and no spaced en dash in anything a visitor may read.
{
  const strings = [];
  (function walk(v) {
    if (typeof v === 'string') strings.push(v);
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k]));
  })({ META: Rules.META, SCHEMES: Rules.SCHEMES, LMI_TIERS: Rules.LMI_TIERS, MONEY: Rules.MONEY_MESSAGES });
  for (const st of Rules.STATES) for (const v of [400000, 650000, 750000, 850000, 1200000]) {
    for (const o of [{}, { firstHome: true }, { firstHome: true, build: 'new' }, { firstHome: true, land: true }, { firstHome: true, occupancy: 'invest' }, { foreign: true, firstHome: true }]) {
      strings.push(Rules.duty(Object.assign({ state: st, price: v }, o)).note);
    }
    for (const b of ['established', 'new']) for (const o of [{}, { firstHome: false }, { occupancy: 'invest' }]) strings.push(Rules.fhog(Object.assign({ state: st, price: v, build: b }, o)).text);
    // The scheme sentences, for every outcome purchase() can give.
    for (const area of ['capital', 'regional']) for (const build of ['established', 'new', 'unsure']) {
      for (const fh of [true, false, undefined]) for (const occupancy of ['home', 'invest']) {
        for (const [buyers, deps, income] of [['couple', 0, 150000], ['couple', 0, 200000], ['single', 0, 90000], ['single', 0, 120000], ['single', 2, 150000], ['single', 2, 170000], ['couple', 0, null]]) {
          for (const [scheme, dp] of [['none', 10], ['fds', 4], ['fds', 5], ['fds', 20], ['h2b', 1], ['h2b', 2], ['h2b', 70]]) {
            const p = Rules.purchase({ state: st, area, price: v, build, firstHome: fh, occupancy, buyers, dependants: deps, income, depositPct: dp, scheme });
            strings.push(p.schemeNote, p.firstHomeNote, p.fds.text, p.h2b.text, p.fhog.text, p.dutyNote);
          }
        }
      }
    }
  }
  const seen = new Set();
  for (const s of strings) {
    if (seen.has(s)) continue;
    seen.add(s);
    checks++;
    if (/—| – /.test(s)) fail('dash pause in: ' + s);
    if (/^https?:\/\//.test(s)) continue;
    // CLAUDE.md "Voice and design": stock words and phrases.
    const stock = /\b(?:seamless|powerful|comprehensive|unlock|empower|navigate|crucial|essential|ensure|peace of mind|everything you need|in one place|whether you’re|whether you're|guesswork|honest|real numbers|simply|just|actually|genuinely|here’s how|here's how|let’s|let's|think of it as)\b/i.exec(s);
    checks++;
    if (stock) fail(`stock phrase "${stock[0]}" in: ${s}`);
    checks++;
    if (/\b(?:we|our|us)\b/i.test(s)) fail('"we" or "our" (the site speaks as "I") in: ' + s);
  }
}

if (fails) {
  console.error(`\nrules-test: ${fails} FAILED of ${checks} checks`);
  process.exit(1);
}
console.log(`rules-test: all ${checks} checks passed (shared/rules.js reproduces the old duty, registration, LMI, grant, scheme, tax, borrowing, repayment and Journey step 2 and 3 figures; largest formula difference $${maxDrift.toExponential(1)}) ✓`);

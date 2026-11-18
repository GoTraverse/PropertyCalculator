#!/usr/bin/env node
// details-test.js — run with: node tests/details-test.js
// Covers "your details" (shared/details.js, build plan section 2) and its
// server side (netlify/functions/journey.js detailsGet/detailsPut, validState,
// adminDelete; auth.js account deletion and the database browser), against
// an in-memory Redis. No network. Every figure here is synthetic.
//
//   1. the field table, normalize() and the enums
//   2. unit conversions (Journey fraction deposit, weekly rent, form options)
//   3. classes: who may overwrite what; incomes and income; "3 or more"
//   4. migration from the Journey and the old /app draft (once per browser)
//   5. merge and tombstones
//   6. the clock clamp
//   7. Undo and the "changed elsewhere" line
//   8. sign-out: forget(), unsent(), the sign-out key list in auth-nav.js
//   9. the server: detailsGet/detailsPut, per-field merge, the 4 KB cap,
//      rate limit, logs without values, admin delete, account delete
//  10. validState and the new Journey fields of plan 2.4
//  11. the Journey mirror table round trip and planReconcile()
//  12. the browser runtime, two devices against the real handler; sends
//      that fail and are tried again
//  13. privacy: no tracking, no values in URLs or logs
'use strict';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
process.env.AUTH_SALT = 'salt';
delete process.env.RESEND_API_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.SITE_URL;
delete process.env.STRIPE_SECRET_KEY;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── In-memory Redis (Upstash REST) ───────────────────────────────────────────
const store = new Map(), expiry = new Map(), sets = new Map();
const live = k => { if (expiry.has(k) && expiry.get(k) <= Date.now()) { store.delete(k); expiry.delete(k); } return store.has(k); };
const seed = (k, v, ttlSec) => { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)); if (ttlSec) expiry.set(k, Date.now() + ttlSec * 1000); else expiry.delete(k); };
const read = k => live(k) ? store.get(k) : null;
const readJson = k => { const v = read(k); return v == null ? null : JSON.parse(v); };
// redisHook(cmd, key) may return { delay: ms } (the reply comes that much
// later, as a slow network would) or { fail: true } (the call throws).
let redisHook = null;
global.fetch = async (url, opts) => {
  if (!String(url).startsWith('https://redis.test')) return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  const a = JSON.parse(opts.body); const cmd = String(a[0]).toUpperCase(); let result = null;
  const hook = redisHook ? redisHook(cmd, String(a[1])) : null;
  if (hook && hook.fail) throw new Error('redis down');
  if (cmd === 'GET') {
    result = read(a[1]);
    if (hook && hook.delay) await new Promise(res => setTimeout(res, hook.delay));
  }
  else if (cmd === 'MGET') result = a.slice(1).map(read);
  else if (cmd === 'SET') {
    const o = a.slice(3).map(x => String(x).toUpperCase());
    if (o.includes('NX') && live(a[1])) result = null;
    else { const ex = o.indexOf('EX'); seed(a[1], String(a[2]), ex >= 0 ? Number(a[3 + ex + 1]) : 0); result = 'OK'; }
  }
  else if (cmd === 'SETEX') { seed(a[1], String(a[3]), Number(a[2])); result = 'OK'; }
  else if (cmd === 'DEL') { result = live(a[1]) ? 1 : 0; store.delete(a[1]); expiry.delete(a[1]); }
  else if (cmd === 'INCR') { const v = parseInt(read(a[1]) || '0', 10) + 1; store.set(a[1], String(v)); result = v; }
  else if (cmd === 'EXPIRE') { if (live(a[1])) { expiry.set(a[1], Date.now() + Number(a[2]) * 1000); result = 1; } else result = 0; }
  else if (cmd === 'SCAN') { const re = new RegExp('^' + a[3].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); result = ['0', [...store.keys()].filter(k => live(k) && re.test(k))]; }
  else if (cmd === 'SADD') { const s = sets.get(a[1]) || new Set(); a.slice(2).forEach(x => s.add(x)); sets.set(a[1], s); result = 1; }
  else if (cmd === 'SREM') { const s = sets.get(a[1]); if (s) a.slice(2).forEach(x => s.delete(x)); result = 1; }
  else if (cmd === 'SMEMBERS') result = [...(sets.get(a[1]) || [])];
  else result = 0;
  return { ok: true, status: 200, json: async () => ({ result }) };
};

// Server log lines are kept, so the privacy section can check them.
const logs = [];
const print = console.log.bind(console);
for (const m of ['warn', 'error', 'info']) console[m] = (...a) => logs.push(a.map(String).join(' '));
console.log = (...a) => { if (typeof a[0] === 'string' && /^\[(auth|journey)\]/.test(a[0])) logs.push(a.map(String).join(' ')); else print(...a); };

let clock = Date.parse('2026-11-18T03:00:00Z');
const realNow = Date.now;
Date.now = () => clock;

const D = require('../shared/details');
const fnDir = path.join(ROOT, 'netlify', 'functions');
const journey = require(path.join(fnDir, 'journey.js'));
const auth = require(path.join(fnDir, 'auth.js'));
const sess = require(path.join(fnDir, '_session.js'));

let fails = 0, passes = 0;
const t = (name, cond) => { if (cond) passes++; else fails++; print((cond ? '  ✓ ' : '  ✗ ') + name); };
const section = name => print('\n' + name);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TTL = sess.TOKEN_TTL_MS;

// Accounts and sessions
function seedAccount(email, id, token, extra) {
  seed('user:' + email, Object.assign({ id, email, name: 'Test', plan: 'free', role: 'user', emailVerified: true, hash: null }, extra || {}));
  seed('token:' + token, { userId: id, email, role: (extra && extra.role) || 'user', plan: 'free', expires: clock + TTL });
}
let ipSeq = 0;
const callJ = async (body, token, ip) => {
  const headers = { 'x-nf-client-connection-ip': ip || ('198.51.100.' + (++ipSeq % 250)) };
  if (token) headers.cookie = 'es_session=' + token;
  const r = await journey.handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) });
  let b = {}; try { b = JSON.parse(r.body); } catch (e) {}
  return { status: r.statusCode, b };
};
const callA = async (body, token) => {
  for (const k of [...store.keys()]) if (k.startsWith('authReq:')) store.delete(k);
  const headers = { 'x-nf-client-connection-ip': '203.0.113.9' };
  if (token) headers.cookie = 'es_session=' + token;
  const r = await auth.handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) });
  let b = {}; try { b = JSON.parse(r.body); } catch (e) {}
  return { status: r.statusCode, b };
};

// A Journey record shaped like the one journey.js saves, with the new
// fields of plan 2.4.
function journeyState(over) {
  const s = {
    v: 1, done: { 1: true, 2: true, 3: true },
    numbers: { price: 650000, saved: 90000, saveMo: 2500, state: 'qld', rate: 6.25, termYears: 30 },
    profile: { stage: 'budget', anchor: '', area: 'capital', buyers: 'couple', fhb: true, build: 'established', income: 165000,
      timeframe: '12mo', dependants: 1, employment: 'payg', rentNow: 1800, cardLimits: 10000,
      incomes: [95000, 70000], empTypes: ['payg', 'payg'], hecs: [true, false], debtsMo: 450, livingMo: 3500 },
    dealChecks: [false, false, false, false, false], settleChecks: [false, false, false, false, false],
    inspections: [{ addr: '12 Example St', price: 640000, note: '', st: 'shortlist', at: clock - 86400000, id: 'Ab3dE5gH' }],
    scenarios: [], budget: { depositPct: 0.05, cap: 700000 }, deal: { signed: false, dates: {} },
    settle: { price: null, actuals: {} }, pathPriority: 'soonest', signupDismissed: false,
    updatedAt: clock - 3600000
  };
  return Object.assign(s, over || {});
}
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()], m };
}

(async () => {
  // ───────────────────────────────────────────────────────────────────────────
  section('1. Fields, normalize() and enums');
  const PLAN_FIELDS = { state: 'S', area: 'P', firstHome: 'S', buyers: 'P', income: 'P', incomes: 'P', employment: 'P', hecs: 'P', dependants: 'P',
    cardLimits: 'P', debtsMonthly: 'P', livingMonthly: 'P', saved: 'P', saveMo: 'P', rentMonthly: 'P', build: 'S', occupancy: 'S',
    targetPrice: 'S', maxPrice: 'J', depositPct: 'S', scheme: 'S', rate: 'S', termYears: 'S', lastPrice: 'L' };
  t('the field table is exactly the 24 fields of plan 2.2', eq(D.NAMES.slice().sort(), Object.keys(PLAN_FIELDS).sort()));
  t('each field has the class the plan gives it', D.NAMES.every(n => D.FIELDS[n].cls === PLAN_FIELDS[n]));
  const cv = (n, v) => D.cleanValue(n, v);
  t('state takes the eight lower-case codes only', cv('state', 'qld').ok && cv('state', 'nt').ok && !cv('state', 'QLD').ok && !cv('state', 'xx').ok && !cv('state', 1).ok);
  t('enums: area, buyers, build, occupancy, scheme', cv('area', 'regional').ok && !cv('area', 'other').ok && cv('buyers', 'couple').ok && !cv('buyers', 'joint').ok
    && cv('build', 'unsure').ok && !cv('build', 'offplan').ok && cv('occupancy', 'invest').ok && cv('scheme', 'fds').ok && !cv('scheme', 'fhbg').ok);
  t('booleans must be booleans', cv('firstHome', true).ok && !cv('firstHome', 1).ok && !cv('firstHome', 'true').ok);
  t('money is whole dollars, never negative, cut to its maximum', cv('income', 95000.4).v === 95000 && !cv('income', -1).ok && cv('income', 2e7).v === 1e7 && !cv('income', '95000').ok && !cv('income', NaN).ok && !cv('income', Infinity).ok);
  t('rent keeps cents, deposit one decimal, rate two decimals', cv('rentMonthly', 1733.333).v === 1733.33 && cv('depositPct', 13.333).v === 13.3 && cv('rate', 6.249).v === 6.25);
  t('rate 0 to 25, term 1 to 40, dependants 0 to 10', cv('rate', 30).v === 25 && !cv('rate', -0.5).ok && !cv('termYears', 0).ok && cv('termYears', 45).v === 40 && cv('dependants', 12).v === 10 && cv('dependants', 2.4).v === 2);
  t('two-person fields need two good values', cv('incomes', [95000, 70000]).ok && !cv('incomes', [95000]).ok && !cv('incomes', [1, 'x']).ok && !cv('incomes', [1, -5]).ok
    && cv('employment', ['payg', 'self']).ok && !cv('employment', ['payg', 'self-employed']).ok && cv('hecs', [true, false]).ok && !cv('hecs', [true, 1]).ok);
  t('null (a cleared field) is valid for every field', D.NAMES.every(n => cv(n, null).ok && cv(n, null).v === null));
  t('undefined and unknown fields are refused', !cv('income', undefined).ok && !cv('nope', 1).ok && !cv('__proto__', 1).ok && !cv('toString', 1).ok);
  const ce = D.cleanEntry;
  t('an entry needs a number time and a known source', !!ce('income', { v: 1, at: 5, by: 'journey' }) && !ce('income', { v: 1, at: '5', by: 'journey' }) && !ce('income', { v: 1, at: -1, by: 'journey' })
    && !ce('income', { v: 1, at: 1e15, by: 'journey' }) && !ce('income', { v: 1, at: 5, by: 'Journey' }) && !ce('income', { v: 1, at: 5, by: 'tool:Bad Slug' }) && !!ce('income', { v: 1, at: 5, by: 'tool:stamp-duty-qld' }));
  t('"shared" (read from a partner\'s journey) is never stored', !ce('income', { v: 1, at: 5, by: 'shared' }));
  const n1 = D.normalize({ v: 1, owner: 'u'.repeat(80), mig: 1, seen: 7, f: { income: { v: 95000, at: 10, by: 'journey' }, nope: { v: 1, at: 1, by: 'journey' }, saved: { v: 'lots', at: 1, by: 'journey' }, ['__proto__']: { v: 1, at: 1, by: 'app' } },
    dirty: ['income', 'income', 'saved', 'nope', 5], replaced: [{ n: 'income', v: 1, at: 2, by: 'journey' }, { n: 'bad', v: 1, at: 2, by: 'journey' }, { n: 'state', v: 'xx', at: 2, by: 'journey' }] });
  t('normalize() drops unknown fields and wrong types', eq(Object.keys(n1.f), ['income']) && n1.f.income.v === 95000);
  t('…keeps dirty names that are known, present and listed once', eq(n1.dirty, ['income']));
  t('…cuts the owner to 64 characters and keeps mig and seen', n1.owner.length === 64 && n1.mig === 1 && n1.seen === 7);
  t('…keeps linked only on a record with an owner', D.normalize({ owner: 'u1', linked: 1 }).linked === 1 && D.normalize({ owner: 'u1' }).linked === 0 && D.normalize({ owner: '', linked: 1 }).linked === 0 && D.normalize({ owner: 'u1', linked: true }).linked === 0);
  t('…keeps only valid replaced entries', n1.replaced.length === 1 && n1.replaced[0].n === 'income');
  t('normalize() turns anything else into an empty record', [null, undefined, [], 'x', 5, true].every(x => eq(D.normalize(x), D.normalize({}))) && D.normalize({}).v === 1 && D.normalize({}).owner === '');

  // ───────────────────────────────────────────────────────────────────────────
  section('2. Units and form options');
  t('a weekly rent is stored monthly (x 52 / 12) and shown weekly (x 12 / 52, to the dollar)', D.monthlyFromWeekly(400) === 1733.33 && D.weeklyFromMonthly(1733.33) === 400 && D.weeklyFromMonthly(1800) === 415);
  t('the Journey\'s fraction deposit is a percent here (0.05 is 5, 0.02 is 2)', D.journeyValue({ budget: { depositPct: 0.05 } }, 'depositPct') === 5 && D.journeyValue({ budget: { depositPct: 0.02 } }, 'depositPct') === 2);
  const js = { budget: {} };
  t('…and goes back as a fraction, only for the Journey\'s four deposits', D.applyToJourney(js, 'depositPct', 10) && js.budget.depositPct === 0.1 && !D.applyToJourney(js, 'depositPct', 13.3) && js.budget.depositPct === 0.1 && !D.applyToJourney(js, 'depositPct', 15));
  t('form options map case-insensitively, with the calculators\' own names', D.optionValue('state', 'QLD') === 'qld' && D.optionValue('buyers', 'joint') === 'couple' && D.optionValue('area', 'other') === 'regional'
    && D.optionValue('employment', 'self-employed') === 'self' && D.optionValue('employment', 'paygVariable') === 'paygVariable' && D.optionValue('build', 'offplan') === 'new'
    && D.optionValue('occupancy', 'owner') === 'home' && D.optionValue('occupancy', 'investor') === 'invest' && D.optionValue('state', 'Queensland') === undefined && D.optionValue('income', '5') === undefined);
  t('…and back to the option a page has', D.toOption('state', 'qld', ['NSW', 'QLD']) === 'QLD' && D.toOption('buyers', 'couple', ['single', 'joint']) === 'joint' && D.toOption('area', 'regional', ['capital', 'other']) === 'other' && D.toOption('state', 'wa', ['NSW']) === undefined);

  // ───────────────────────────────────────────────────────────────────────────
  section('3. Classes: who may overwrite what');
  const W = (f, n, v, by, o) => D.writeField(f, n, v, by, Object.assign({ at: 1000 }, o || {}));
  let f0 = W({}, 'state', 'qld', 'journey').f;
  t('S: a calculator fills an empty field', W({}, 'state', 'nsw', 'tool:stamp-duty').changed.length === 1);
  t('S: a calculator never overwrites a set field (a what-if stays on the page)', W(f0, 'state', 'nsw', 'tool:stamp-duty').refused === 'set' && W(f0, 'state', 'nsw', 'tool:stamp-duty').f === f0);
  t('S: the Journey and the workup\'s "Your details" box overwrite', W(f0, 'state', 'nsw', 'journey', { at: 2000 }).f.state.v === 'nsw' && W(f0, 'state', 'nsw', 'app', { at: 2000 }).f.state.v === 'nsw');
  t('S: the workup\'s per-property fields only fill ({ fill: true })', W(f0, 'state', 'nsw', 'app', { fill: true }).refused === 'set' && W({}, 'state', 'nsw', 'app', { fill: true }).changed.length === 1);
  const fCleared = W(f0, 'state', null, 'journey', { at: 2000 }).f;
  t('S: a cleared field counts as empty', fCleared.state.v === null && W(fCleared, 'state', 'vic', 'tool:stamp-duty', { at: 3000 }).f.state.v === 'vic');
  t('J: only the Journey writes the maximum price', W({}, 'maxPrice', 700000, 'tool:auction-budget').refused === 'journey-only' && W({}, 'maxPrice', 700000, 'app').refused === 'journey-only' && W({}, 'maxPrice', 700000, 'journey').changed.length === 1);
  t('L: calculators and the workup write the last price; the Journey doesn\'t', W({}, 'lastPrice', 650000, 'journey').refused === 'not-here' && W({}, 'lastPrice', 650000, 'tool:deposit').changed.length === 1 && W({}, 'lastPrice', 650000, 'app').changed.length === 1);
  const fInc = W({}, 'cardLimits', 10000, 'journey').f;
  t('P: any page overwrites a person fact (newest wins)', W(fInc, 'cardLimits', 5000, 'tool:borrowing-power', { at: 2000 }).f.cardLimits.v === 5000);
  t('P with { fill: true } only fills', W(fInc, 'cardLimits', 5000, 'tool:x', { fill: true }).refused === 'set');
  t('{ force: true } skips the class rule', W(f0, 'state', 'nsw', 'tool:stamp-duty', { force: true }).f.state.v === 'nsw' && W({}, 'maxPrice', 1e6, 'tool:x', { force: true }).changed.length === 1);
  t('unknown fields, sources and bad values are refused', W({}, 'nope', 1, 'journey').refused === 'unknown' && W({}, 'income', 1, 'shared').refused === 'source' && W({}, 'income', 'x', 'journey').refused === 'value' && W({}, 'income', 1, undefined).refused === 'source');
  const same = W(fInc, 'cardLimits', 10000, 'tool:x', { at: 9000 });
  t('the same value again changes nothing (its time stays)', same.changed.length === 0 && same.f.cardLimits.at === 1000);
  const fSplit = W({}, 'incomes', [95000, 70000], 'tool:borrowing-power').f;
  t('writing both incomes writes their sum as the household income', fSplit.income.v === 165000 && fSplit.income.at === 1000 && fSplit.income.by === 'tool:borrowing-power');
  const fOne = W(fSplit, 'income', 170000, 'journey', { at: 2000 }).f;
  t('a page with one income figure clears the split', fOne.income.v === 170000 && fOne.incomes.v === null && fOne.incomes.at === 2000);
  t('…unless the figure is the split\'s sum', W(fSplit, 'income', 165000, 'journey', { at: 2000 }).changed.length === 0);
  t('…and clearing the split leaves the household income', W(fSplit, 'incomes', null, 'app', { at: 2000 }).f.income.v === 165000);
  const fDep = W({}, 'dependants', 5, 'tool:borrowing-power').f;
  t('the Journey\'s "3 or more" doesn\'t lower a higher number', W(fDep, 'dependants', 3, 'journey', { at: 2000 }).changed.length === 0
    && W(W({}, 'dependants', 2, 'journey').f, 'dependants', 3, 'journey', { at: 2000 }).f.dependants.v === 3
    && W(fDep, 'dependants', 3, 'tool:borrowing-power', { at: 2000 }).f.dependants.v === 3);
  t('writeField never changes the map it was given', eq(f0, { state: { v: 'qld', at: 1000, by: 'journey' } }));

  // ───────────────────────────────────────────────────────────────────────────
  section('4. Migration');
  const S1 = journeyState();
  const mig = (st, sid) => { const rec = D.normalize({}); const filled = D.migrateInto(rec, st, sid); return { rec, filled }; };
  let m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(S1) }), '');
  const expectFromJourney = { state: 'qld', area: 'capital', firstHome: true, buyers: 'couple', incomes: [95000, 70000], income: 165000, employment: ['payg', 'payg'], hecs: [true, false],
    dependants: 1, cardLimits: 10000, debtsMonthly: 450, livingMonthly: 3500, saved: 90000, saveMo: 2500, rentMonthly: 1800, build: 'established', targetPrice: 650000,
    maxPrice: 700000, depositPct: 5, rate: 6.25, termYears: 30 };
  const vals = r => { const o = {}; Object.keys(r.f).forEach(n => { o[n] = r.f[n].v; }); return o; };
  t('a journey with step 1 done gives every mirrored field it holds', eq(vals(m.rec), Object.assign({}, expectFromJourney)) || eq(Object.keys(vals(m.rec)).sort(), Object.keys(expectFromJourney).sort()) && Object.keys(expectFromJourney).every(k => eq(m.rec.f[k].v, expectFromJourney[k])));
  t('…at the journey\'s updatedAt, by "import"', Object.values(m.rec.f).every(e => e.at === S1.updatedAt && e.by === 'import') && m.rec.mig === 1);
  t('…but no scheme for a 5% deposit (the price cap check needs the rules)', !m.rec.f.scheme);
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(journeyState({ budget: { depositPct: 0.02, cap: 600000 } })) }), '');
  t('a Help to Buy deposit (0.02) gives scheme h2b and deposit 2', m.rec.f.scheme.v === 'h2b' && m.rec.f.depositPct.v === 2);
  const oldJ = journeyState(); delete oldJ.numbers.rate; delete oldJ.numbers.termYears; ['incomes', 'empTypes', 'hecs', 'debtsMo', 'livingMo'].forEach(k => delete oldJ.profile[k]); oldJ.budget = { depositPct: null, cap: null };
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(oldJ) }), '');
  t('a journey from today\'s journey.js gives its fields; its one income type covers both applicants', m.rec.f.employment && eq(m.rec.f.employment.v, ['payg', 'payg']) && !m.rec.f.rate && !m.rec.f.incomes && !m.rec.f.hecs && !m.rec.f.maxPrice && m.rec.f.income.v === 165000);
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(journeyState({ done: {} })) }), '');
  t('a journey without step 1 done gives nothing (its values may be the blank defaults)', m.filled.length === 0 && !Object.keys(m.rec.f).length);
  const draft = { state: { values: { 'inp-price': '650,000', 'inp-savings': '$90,000', 'inp-depp': '10', 'inp-rate': '6.5', 'inp-term': '30', 'inp-state': 'vic', 'pd-state': 'QLD', 'inp-fhb-checked': '1', 'inp-income': '120000' } } };
  m = mig(fakeStorage({ propCalc_draft_v1: JSON.stringify(draft) }), '');
  t('the old /app draft gives state (inp-state, not pd-state), first home, savings and the price as lastPrice', eq(vals(m.rec), { state: 'vic', firstHome: true, saved: 90000, lastPrice: 650000 }));
  t('…never its rate, term or deposit, and no income', !m.rec.f.rate && !m.rec.f.termYears && !m.rec.f.depositPct && !m.rec.f.income);
  t('…at 1 ms, so anything newer wins', Object.values(m.rec.f).every(e => e.at === 1 && e.by === 'import'));
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(S1), propCalc_draft_v1: JSON.stringify(draft) }), '');
  t('…and only where the journey left a field empty', m.rec.f.state.v === 'qld' && m.rec.f.saved.v === 90000 && m.rec.f.saved.at === S1.updatedAt && m.rec.f.lastPrice.v === 650000);
  m = mig(fakeStorage({ propCalc_draft_v1: JSON.stringify({ state: { values: { 'inp-price': '0', 'inp-savings': '0', 'inp-state': 'nsw', 'inp-fhb-checked': '1' } } }) }), '');
  t('a draft with no price and no savings was never used: nothing', m.filled.length === 0);
  // What today's /app saves when a price and savings are typed and the first
  // home box is left alone: the box starts unticked and is always saved.
  const untouched = { state: { values: { 'inp-price': '650000', 'inp-savings': '90000', 'inp-state': '', 'inp-fhb-checked': '0' } } };
  m = mig(fakeStorage({ propCalc_draft_v1: JSON.stringify(untouched) }), '');
  t('an unticked first home box ("0", the page default) gives no first home answer', eq(vals(m.rec), { saved: 90000, lastPrice: 650000 }) && eq(D.fromDraft(untouched), { saved: 90000, lastPrice: 650000 }));
  t('…so a fresh Journey keeps its own first home answer', !D.planReconcile({ v: 1, done: {}, profile: { fhb: true }, numbers: {}, budget: {} }, m.rec.f).toJourney.some(x => x.field === 'firstHome'));
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(S1), propCalc_journey_collab: 'tokX' }), 'u2');
  t('on a partner\'s device the shared journey is not imported', m.filled.length === 0);
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(S1), propCalc_journey_owner: 'u9' }), '');
  t('a journey that belongs to an account is not imported for a guest', m.filled.length === 0);
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(S1), propCalc_journey_owner: 'u9' }), 'u9');
  t('…and is imported for that account', m.filled.length > 10);
  m = mig(fakeStorage({ propCalc_journey_v1: JSON.stringify(S1) }), 'u1');
  t('a guest journey is left for the Journey page to reconcile when an account is signed in', m.filled.length === 0);
  t('garbage in storage gives nothing and never throws', mig(fakeStorage({ propCalc_journey_v1: '{bad', propCalc_draft_v1: '[1,2' }), '').filled.length === 0
    && mig({ getItem() { throw new Error('blocked'); } }, '').filled.length === 0);

  // runtime: once per browser, and nothing stored for a stranger
  const stranger = fakeStorage();
  D.createRuntime({ storage: stranger, now: () => clock }).start();
  t('a stranger with nothing to import gets no localStorage key', stranger.keys().length === 0);
  const once = fakeStorage({ propCalc_journey_v1: JSON.stringify(S1) });
  let rt = D.createRuntime({ storage: once, now: () => clock }); rt.start();
  t('the first load imports and stores the record with mig 1', rt.get('targetPrice') === 650000 && JSON.parse(once.getItem(D.KEY)).mig === 1);
  once.setItem('propCalc_journey_v1', JSON.stringify(journeyState({ numbers: Object.assign({}, S1.numbers, { price: 720000 }), updatedAt: clock })));
  rt = D.createRuntime({ storage: once, now: () => clock }); rt.start();
  t('a later load doesn\'t import again (the Journey reconciles from then on)', rt.get('targetPrice') === 650000);
  const lateStore = fakeStorage();
  rt = D.createRuntime({ storage: lateStore, now: () => clock }); rt.start();
  rt.set('cardLimits', 1000, 'tool:borrowing-power');
  t('a record first stored after an empty import is marked as migrated', JSON.parse(lateStore.getItem(D.KEY)).mig === 1);

  // ───────────────────────────────────────────────────────────────────────────
  section('5. Merge and tombstones');
  const A = { income: { v: 95000, at: 100, by: 'journey' }, saved: { v: 90000, at: 300, by: 'journey' } };
  const B = { income: { v: 170000, at: 200, by: 'tool:borrowing-power' }, saved: { v: 1, at: 300, by: 'app' }, state: { v: 'qld', at: 50, by: 'app' } };
  let mg = D.mergeFields(A, B);
  t('newest time wins, field by field', mg.f.income.v === 170000 && mg.f.state.v === 'qld');
  t('a tie keeps the stored value', mg.f.saved.v === 90000);
  t('…or the incoming one when asked (a browser reading the account copy)', D.mergeFields(A, B, { tie: 'incoming' }).f.saved.v === 1);
  const chInc = mg.changed.find(c => c.field === 'income');
  t('changed lists the fields whose value changed', eq(mg.changed.map(c => c.field).sort(), ['income', 'state']) && chInc.from.v === 95000 && chInc.to.v === 170000);
  mg = D.mergeFields(A, { income: { v: null, at: 150, by: 'app' } });
  t('a newer clear beats an older value', mg.f.income.v === null && mg.changed.length === 1);
  t('an older clear loses to a newer value', D.mergeFields({ income: { v: null, at: 500, by: 'app' } }, A).f.income.v === null);
  mg = D.mergeFields(A, { income: { v: 95000, at: 900, by: 'tool:x' } });
  t('a newer copy of the same value updates the time but is not a change', mg.f.income.at === 900 && mg.changed.length === 0);
  t('merge ignores junk on either side', eq(D.mergeFields({ nope: 1, income: 'x' }, { income: { v: 5, at: 1, by: 'app' }, __proto__: { polluted: true } }).f, { income: { v: 5, at: 1, by: 'app' } }) && ({}).polluted === undefined);

  // ───────────────────────────────────────────────────────────────────────────
  section('6. The clock clamp');
  t('a time more than 60 s ahead of the server is cut to server time + 60 s', D.clampAt(clock + 600000, clock) === clock + 60000 && D.clampAt(clock + 30000, clock) === clock + 30000 && D.clampAt(5, clock) === 5);
  let sm = D.serverMerge({}, { income: { v: 95000, at: clock + 3600000, by: 'journey' } }, clock);
  t('serverMerge clamps every incoming time', sm.f.income.at === clock + 60000);
  sm = D.serverMerge(sm.f, { income: { v: 100000, at: clock + 120000, by: 'tool:x' } }, clock + 90000);
  t('…so a fast clock can\'t win forever: an edit two minutes later replaces it', sm.f.income.v === 100000);

  // ───────────────────────────────────────────────────────────────────────────
  section('7. Undo and the "changed elsewhere" line');
  const st7 = fakeStorage();
  rt = D.createRuntime({ storage: st7, now: () => clock }); rt.start();
  rt.set('income', 165000, 'journey');
  clock += 1000;
  const ch7 = rt.set('income', 170000, 'tool:borrowing-power').changes[0];
  clock += 1000;
  const u7 = rt.undo(ch7, 'journey');
  t('Undo writes the previous value back with a new time', u7.ok && rt.get('income') === 165000 && rt.entry('income').at === clock && rt.entry('income').by === 'journey');
  t('…and does nothing once the field has moved again', !rt.undo(ch7, 'journey').ok);
  const chNew = rt.set('saveMo', 2000, 'tool:auction-budget').changes[0];
  t('Undo of a field that was empty clears it', rt.undo(chNew, 'journey').ok && rt.entry('saveMo').v === null && rt.get('saveMo') === undefined);
  t('Undo reaches S fields a calculator could not overwrite', (() => { rt.set('state', 'qld', 'journey'); const c = rt.set('state', 'nsw', 'app').changes[0]; return rt.undo(c, 'tool:stamp-duty').ok && rt.get('state') === 'qld'; })());
  const at18 = Date.parse('2026-11-18T03:00:00Z');
  const CL = (field, v, by, at) => D.changeLine({ field, to: { v, at: at === undefined ? at18 : at, by: by || 'journey' } }, at18);
  t('the line says what changed, where and when', CL('income', 170000, 'tool:borrowing-power') === 'Your household income changed to $170,000 a year in the borrowing power calculator on 18 Nov.');
  const wantLines = [
    [CL('cardLimits', null), 'Your credit card limits were cleared in the First Home Journey on 18 Nov.'],
    [CL('dependants', null), 'The number of dependants was cleared in the First Home Journey on 18 Nov.'],
    [CL('livingMonthly', null), 'Your living costs were cleared in the First Home Journey on 18 Nov.'],
    [CL('saved', 90000, 'import', 1), 'Your savings changed to $90,000 on an earlier visit.'],
    [CL('saved', 90000, 'import', Date.parse('2026-11-03T03:00:00Z')), 'Your savings changed to $90,000 during your visit on 3 Nov.'],
    [CL('buyers', 'couple', 'tool:borrowing-power'), "You're now buying together, as set in the borrowing power calculator on 18 Nov."],
    [CL('occupancy', 'invest', 'tool:stamp-duty'), 'You now plan to rent it out, as set in the stamp duty calculator on 18 Nov.'],
    [CL('area', 'regional', 'tool:first-home-buyer'), "You're now buying in the rest of the state, as set in the first home buyer grants calculator on 18 Nov."],
    [CL('firstHome', false, 'tool:stamp-duty'), "You're not a first home buyer, as set in the stamp duty calculator on 18 Nov."],
    [CL('hecs', [true, false], 'tool:borrowing-power'), 'The first applicant has a HELP debt, as set in the borrowing power calculator on 18 Nov.'],
    [CL('employment', ['payg', 'self'], 'tool:borrowing-power'), 'Your income types changed to PAYG salary and self-employed in the borrowing power calculator on 18 Nov.'],
    [CL('saveMo', 2000), 'What you save changed to $2,000 a month in the First Home Journey on 18 Nov.'],
    [CL('state', 'act', 'app'), 'Your state or territory changed to the ACT in the property workup on 18 Nov.']
  ];
  const badLines = wantLines.filter(([got, want]) => got !== want);
  t('…a clear, a plural, an earlier visit, a choice' + (badLines.length ? ': ' + JSON.stringify(badLines) : ''), badLines.length === 0);
  // Every field, every kind of value, and a clear: a whole sentence, with
  // no label used as a subject that doesn't fit its verb.
  const samples = n => {
    const F = D.FIELDS[n];
    if (F.kind === 'enum') return F.values.slice();
    if (F.kind === 'bool') return [true, false];
    if (F.kind === 'enum2') return [['payg', 'payg'], ['payg', 'self'], ['casual', 'rental']];
    if (F.kind === 'bool2') return [[true, true], [true, false], [false, true], [false, false]];
    if (F.kind === 'money2') return [[95000, 70000]];
    return [{ money: 650000, cents: 1733.33, int: 2, pct1: 5, rate2: 6.25 }[F.kind]];
  };
  const lineProblems = [];
  D.NAMES.forEach(n => samples(n).concat([null]).forEach(v => ['journey', 'tool:deposit', 'import', 'shared'].forEach(by => {
    const line = CL(n, v, by);
    const bad = !line || !/^[A-Z]/.test(line) || !/\.$/.test(line) || /—|\s–\s|\s-\s/.test(line) || /changed to (yes|no|together|alone|rent it out|live in it|none)\b/.test(line)
      || /^(Your (credit card limits|other loan repayments|living costs|savings|two incomes|income types)|Dependants|Credit card limits|Living costs|Savings) was\b/.test(line)
      || / were cleared/.test(line) && !/^Your (credit card limits|other loan repayments|living costs|savings) were cleared/.test(line)
      || /in an earlier visit|in the shared journey journey|undefined|NaN|null/.test(line);
    if (bad) lineProblems.push(n + ' ' + JSON.stringify(v) + ' ' + by + ': ' + line);
  })));
  t('every field reads as a sentence for every value and a clear (' + D.NAMES.length + ' fields)' + (lineProblems.length ? ': ' + lineProblems.slice(0, 5).join(' | ') : ''), lineProblems.length === 0);
  t('…a state, a rate, a weekly-to-monthly rent, both incomes', D.formatValue('state', 'qld') === 'Queensland' && D.formatValue('rate', 6) === '6.00%' && D.formatValue('rentMonthly', 1733.33) === '$1,733.33 a month'
    && D.formatValue('incomes', [95000, 70000]) === '$95,000 and $70,000 a year' && D.formatValue('termYears', 30) === '30 years' && D.formatValue('hecs', [true, false]) === 'the first applicant');
  t('…another year shows the year; an imported 1 ms value shows no date', D.dateLabel(Date.parse('2025-06-02T03:00:00Z'), at18) === '2 Jun 2025' && D.dateLabel(1, at18) === '' && D.sourceText({ v: 1, at: 1, by: 'import' }, at18) === 'an earlier visit');
  t('every calculator slug has a name (config slugs and file names)', ['auction-budget', 'borrowing-power', 'capital-gains', 'cost-of-purchase', 'deposit', 'equity-release', 'first-home-buyer', 'house-flip', 'io-vs-pi', 'land-tax', 'listing-price', 'loan-serviceability',
    'mortgage-repayment', 'mortgage-stress', 'property-cashflow', 'renovation-cost', 'rental-yield', 'stamp-duty', 'stamp-duty-qld', 'stamp-duty-nt', 'first-home-buyer-grants-calculator', 'interest-only-vs-principal-calculator', 'listing-price-checker', 'deposit-calculator']
    .every(s => D.sourceLabel('tool:' + s) !== 'a calculator on this site') && D.sourceLabel('tool:stamp-duty-qld') === 'the QLD stamp duty calculator' && D.sourceLabel('tool:zzz') === 'a calculator on this site');
  const words = [];
  D.NAMES.forEach(n => words.push(D.fieldLabel(n)));
  ['journey', 'app', 'import', 'shared', 'tool:deposit'].forEach(b => words.push(D.sourceLabel(b)));
  t('every label exists and none has a dash used as a pause', words.every(w => w && !/—|\s–\s|\s-\s/.test(w)));

  // ───────────────────────────────────────────────────────────────────────────
  section('8. Sign-out');
  const st8 = fakeStorage({ propCalc_session_v1: JSON.stringify({ id: 'u1' }) });
  st8.setItem(D.KEY, JSON.stringify({ v: 1, owner: 'u1', f: { income: { v: 1, at: 5, by: 'journey' } }, dirty: ['income'], mig: 1 }));
  rt = D.createRuntime({ storage: st8, now: () => clock, sessionId: () => 'u1' });
  t('unsent() is true while an owned record has dirty fields', rt.unsent());
  t('forget() removes a record that belongs to an account', rt.forget() === true && st8.getItem(D.KEY) === null && !rt.unsent());
  const stGuest = fakeStorage({ [D.KEY]: JSON.stringify({ v: 1, owner: '', f: { income: { v: 1, at: 5, by: 'journey' } }, mig: 1 }) });
  rt = D.createRuntime({ storage: stGuest, now: () => clock });
  t('…and keeps a guest record that was never linked to an account', rt.forget() === false && stGuest.getItem(D.KEY) !== null);
  const stLeft = fakeStorage({ [D.KEY]: JSON.stringify({ v: 1, owner: 'u1', f: { income: { v: 1, at: 5, by: 'journey' } }, mig: 1 }) });
  rt = D.createRuntime({ storage: stLeft, now: () => clock }); rt.start();
  t('a record left by an account with nobody signed in is dropped on load', stLeft.getItem(D.KEY) === null && rt.get('income') === undefined);
  const PLAN_SIGN_OUT_KEYS = ['propCalc_details_v1', 'propCalc_journey_v1', 'propCalc_journey_owner', 'propCalc_journey_collab', 'propCalc_journey_pendingJoin', 'propCalc_journey_unsent',
    'propCalc_workup_v2', 'propCalc_draft_v1', 'propCalc_pendingSave', 'propCalc_v5_index', 'propCalc_v5_ph_', 'tool_inputs_v1:', 'tool_live_rate_v1:', 'propCalc_profile_v1_'];
  const navSrc = fs.readFileSync(path.join(ROOT, 'auth-nav.js'), 'utf8');
  if (/esForgetDevice/.test(navSrc)) {
    const missing = PLAN_SIGN_OUT_KEYS.filter(k => navSrc.indexOf(k) === -1);
    t('auth-nav.js esForgetDevice() names every key of plan 3.6' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''), missing.length === 0);
  } else {
    print('  - auth-nav.js has no esForgetDevice() yet (phase 1, lane A): sign-out key list not checked');
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('9. The server: detailsGet and detailsPut');
  store.clear(); expiry.clear(); sets.clear();
  seedAccount('one@example.com', 'u1', 'TOK1');
  seedAccount('two@example.com', 'u2', 'TOK2');
  seedAccount('admin@example.com', 'a1', 'ADMIN', { role: 'admin' });
  let r = await callJ({ action: 'detailsGet' });
  t('detailsGet needs a session', r.status === 401 && r.b.ok === false);
  r = await callJ({ action: 'detailsPut', f: { income: { v: 1, at: 1, by: 'journey' } } });
  t('detailsPut needs a session', r.status === 401 && read('details:') === null);
  r = await callJ({ action: 'detailsGet' }, 'TOK1');
  t('a new account has no record', r.b.ok === true && r.b.record === null);
  r = await callJ({ action: 'detailsPut', f: { income: { v: 165000, at: clock - 5000, by: 'journey' }, saved: { v: 90000, at: clock - 5000, by: 'journey' } } }, 'TOK1');
  t('detailsPut stores the fields and answers with the record', r.b.ok && eq(r.b.accepted, ['income', 'saved']) && r.b.record.f.income.v === 165000 && readJson('details:one@example.com').f.saved.v === 90000);
  const firstUpdated = r.b.record.updatedAt;
  r = await callJ({ action: 'detailsPut', f: { state: { v: 'qld', at: clock - 4000, by: 'journey' } } }, 'TOK1');
  t('fields not sent are left alone', eq(Object.keys(readJson('details:one@example.com').f).sort(), ['income', 'saved', 'state']) && r.b.record.updatedAt > firstUpdated);
  r = await callJ({ action: 'detailsPut', f: { income: { v: 1, at: clock - 9000, by: 'tool:x' }, saved: { v: 2, at: clock - 5000, by: 'app' } } }, 'TOK1');
  t('an older value, and a tie, keep the stored one', r.b.ok && eq(r.b.stale, ['income', 'saved']) && r.b.accepted.length === 0 && readJson('details:one@example.com').f.income.v === 165000 && readJson('details:one@example.com').f.saved.v === 90000);
  r = await callJ({ action: 'detailsPut', f: { income: { v: null, at: clock - 1000, by: 'tool:borrowing-power' } } }, 'TOK1');
  t('a clear is stored as a tombstone', readJson('details:one@example.com').f.income.v === null);
  r = await callJ({ action: 'detailsPut', f: { nope: { v: 1, at: clock, by: 'app' }, saved: { v: 'lots', at: clock, by: 'app' }, rate: { v: 6.1, at: clock, by: 'shared' }, cardLimits: { v: 5000, at: clock, by: 'tool:borrowing-power' } } }, 'TOK1');
  t('bad fields are dropped by name and good ones kept', r.b.ok && eq(r.b.accepted, ['cardLimits']) && eq(r.b.dropped.sort(), ['nope', 'rate', 'saved']) && readJson('details:one@example.com').f.saved.v === 90000 && !readJson('details:one@example.com').f.rate);
  r = await callJ({ action: 'detailsPut', f: { rentMonthly: { v: 1800, at: clock + 3600000, by: 'journey' } } }, 'TOK1');
  t('the server clamps a future time to its time + 60 s', readJson('details:one@example.com').f.rentMonthly.at === clock + 60000);
  r = await callJ({ action: 'detailsPut', f: { termYears: { v: 30, at: clock, by: 'app' } }, collab: 'whatever' }, 'TOK2');
  t('a collab token is ignored: a partner writes only their own record', !!readJson('details:two@example.com') && !readJson('details:one@example.com').f.termYears);
  r = await callJ({ action: 'detailsGet', collab: 'whatever' }, 'TOK2');
  t('…and reads only their own', r.b.ok && eq(Object.keys(r.b.record.f), ['termYears']));
  for (const bad of [null, [], 'x', 5]) { r = await callJ({ action: 'detailsPut', f: bad }, 'TOK1'); if (!(r.status === 400 && r.b.ok === false)) break; }
  t('f must be an object', r.status === 400 && r.b.ok === false);
  seed('details:one@example.com', '{not json');
  r = await callJ({ action: 'detailsGet' }, 'TOK1');
  t('a damaged stored record reads as empty and never throws', r.b.ok === true && r.b.record === null);
  seed('details:one@example.com', { f: { income: { v: 'x', at: 1, by: 'journey' }, saved: { v: 5, at: 1, by: 'journey' } }, updatedAt: 9 });
  r = await callJ({ action: 'detailsGet' }, 'TOK1');
  t('stored fields are checked on the way out', eq(r.b.record, { f: { saved: { v: 5, at: 1, by: 'journey' } }, updatedAt: 9 }));

  // 4 KB cap
  const longBy = 'tool:' + 'x'.repeat(40);
  const worst = { f: {}, updatedAt: 1e14 - 1 };
  D.NAMES.forEach(n => {
    const F = D.FIELDS[n];
    const v = F.kind === 'enum' ? F.values.reduce((a, b) => (b.length > a.length ? b : a)) : F.kind === 'bool' ? false : F.kind === 'enum2' ? ['paygVariable', 'paygVariable']
      : F.kind === 'bool2' ? [false, false] : F.kind === 'money2' ? [F.max, F.max] : F.kind === 'cents' ? F.max - 0.01 : F.kind === 'pct1' ? 99.9 : F.kind === 'rate2' ? 24.99 : F.max;
    worst.f[n] = { v, at: 1e14 - 1, by: longBy };
    if (!D.cleanEntry(n, worst.f[n])) throw new Error('worst case for ' + n + ' is not valid');
  });
  const worstBytes = D.byteSize(JSON.stringify(worst));
  t('the largest valid record (' + worstBytes + ' bytes) fits the 4 KB cap', D.fitsCap(worst) && worstBytes <= D.MAX_BYTES);
  t('fitsCap refuses anything over 4 KB', !D.fitsCap({ f: { x: 'y'.repeat(4100) } }) && D.fitsCap({ f: { x: 'y'.repeat(4000) } }));
  const huge = {}; for (let i = 0; i < 400; i++) huge['f' + i] = { v: 1, at: 1, by: 'journey' };
  r = await callJ({ action: 'detailsPut', f: huge }, 'TOK1');
  t('a request over 8 KB is refused before anything is read', r.status === 413);
  r = await callJ({ action: 'detailsPut', f: worst.f }, 'TOK2');
  t('the worst case is accepted and stored under the cap', r.b.ok && D.byteSize(read('details:two@example.com')) <= D.MAX_BYTES);

  // Two devices pushing at the same moment. The record's read is slowed so
  // both reads would come before either write without the lock.
  store.delete('details:two@example.com');
  redisHook = (cmd, key) => (cmd === 'GET' && key.startsWith('details:') ? { delay: 25 } : null);
  let [pa, pb] = await Promise.all([
    callJ({ action: 'detailsPut', f: { income: { v: 95000, at: clock, by: 'journey' } } }, 'TOK2'),
    callJ({ action: 'detailsPut', f: { saved: { v: 90000, at: clock, by: 'tool:auction-budget' } } }, 'TOK2')
  ]);
  t('two puts at once for different fields both land (one waits for the other)', pa.b.ok && pb.b.ok && eq(Object.keys(readJson('details:two@example.com').f).sort(), ['income', 'saved'])
    && [pa, pb].some(x => x.b.record.f.income && x.b.record.f.saved));
  [pa, pb] = await Promise.all([
    callJ({ action: 'detailsPut', f: { cardLimits: { v: 5000, at: clock - 10, by: 'tool:borrowing-power' } } }, 'TOK2'),
    callJ({ action: 'detailsPut', f: { cardLimits: { v: 8000, at: clock - 20, by: 'journey' } } }, 'TOK2')
  ]);
  t('two puts at once for the same field: the newer edit wins, whichever is written last', pa.b.ok && pb.b.ok && readJson('details:two@example.com').f.cardLimits.v === 5000);
  redisHook = null;
  t('…and the lock is released after each put', read('details_lock:two@example.com') === null);
  seed('details_lock:two@example.com', '1', 30);
  const tBusy = realNow();
  r = await callJ({ action: 'detailsPut', f: { rate: { v: 6.1, at: clock, by: 'journey' } } }, 'TOK2');
  t('while another put holds the lock, a put waits about a second, then is refused and writes nothing', r.status === 503 && r.b.ok === false && realNow() - tBusy >= 800 && !readJson('details:two@example.com').f.rate);
  t('…a refused put leaves the other put\'s lock alone', read('details_lock:two@example.com') === '1');
  store.delete('details_lock:two@example.com');
  redisHook = (cmd, key) => (cmd === 'GET' && key === 'details:two@example.com' ? { fail: true } : null);
  r = await callJ({ action: 'detailsPut', f: { rate: { v: 6.1, at: clock, by: 'journey' } } }, 'TOK2');
  redisHook = null;
  t('a failure inside the lock answers 500 and still releases it', r.status === 500 && read('details_lock:two@example.com') === null);
  t('detailsGet never takes the lock', (await callJ({ action: 'detailsGet' }, 'TOK2')).b.ok && read('details_lock:two@example.com') === null);

  // Field names in the request reach the log line only as letters, digits, _ and ?
  const forged = { 'x\n[journey] signin ok for admin@example.com': { v: 1, at: 1, by: 'app' }, 'a b\r\u2028c': { v: 1, at: 1, by: 'app' }, '<script>': { v: 1, at: 1, by: 'app' } };
  const logsBefore = logs.length;
  r = await callJ({ action: 'detailsPut', f: forged }, 'TOK2');
  const newLogs = logs.slice(logsBefore);
  t('a field name with line breaks or markup can\'t forge a log line', r.b.ok && r.b.dropped.length === 3 && r.b.dropped.every(n => /^[A-Za-z0-9_?]{1,40}$/.test(n))
    && newLogs.length === 1 && !/[\n\r\u2028<>@]/.test(newLogs[0]) && /detailsPut dropped 3 field\(s\): x\?\?journey\?\?signin\?ok/.test(newLogs[0]));

  // rate limit: its own count, the Journey's sync untouched
  const ip = '192.0.2.77';
  let lastDetails;
  for (let i = 0; i < 121; i++) lastDetails = await callJ({ action: 'detailsGet' }, 'TOK1', ip);
  const jget = await callJ({ action: 'get' }, 'TOK1', ip);
  t('details calls have their own 120 an hour', lastDetails.status === 429 && read('ratelimit:details:' + ip) === '121');
  t('…and never use up the Journey\'s', jget.b.ok === true && read('ratelimit:journey:' + ip) === '1');

  // deletion
  seed('details:one@example.com', { f: { income: { v: 1, at: 1, by: 'journey' } }, updatedAt: 1 });
  seed('journey:one@example.com', { state: { v: 1 }, updatedAt: 1, email: 'one@example.com' });
  r = await callJ({ action: 'adminDelete', email: 'one@example.com' }, 'TOK1');
  t('adminDelete is admin only', r.b.ok === false && read('details:one@example.com') !== null);
  r = await callJ({ action: 'adminDelete', email: 'One@Example.com' }, 'ADMIN');
  t('admin "delete journey" removes details:<email> with the journey', r.b.ok && read('details:one@example.com') === null && read('journey:one@example.com') === null);
  seed('details:two@example.com', { f: { income: { v: 123456, at: 1, by: 'journey' }, saved: { v: 1, at: 1, by: 'journey' } }, updatedAt: 1 });
  r = await callA({ action: 'adminBrowseDatabase', pattern: 'details:*' }, 'ADMIN');
  t('the admin database browser never shows a details record\'s values', r.b.ok && r.b.keys.length === 1 && r.b.keys[0].value === '[not shown: 2 fields]' && !JSON.stringify(r.b).includes('123456'));
  r = await callA({ action: 'adminDeleteUser', targetEmail: 'two@example.com' }, 'ADMIN');
  t('deleting an account removes details:<email> (auth.js deleteUserKeys)', r.b.ok && read('details:two@example.com') === null && read('user:two@example.com') === null);
  seed('user:shares:x@example.com', { id: 'j9', email: 'shares:x@example.com', emailVerified: false });
  seed('details:shares:x@example.com', 'keep');
  r = await callA({ action: 'adminDeleteUser', targetEmail: 'shares:x@example.com' }, 'ADMIN');
  t('…with the journey keys\' address check (an address with a colon builds no key)', r.b.ok && read('details:shares:x@example.com') === 'keep');

  // ───────────────────────────────────────────────────────────────────────────
  section('10. validState: the new Journey fields (plan 2.4)');
  seedAccount('one@example.com', 'u1', 'TOK1');
  const sync = st => callJ({ action: 'sync', state: st }, 'TOK1');
  r = await sync(journeyState());
  t('a journey with every new field is accepted', r.b.ok === true);
  r = await sync({ v: 1, done: {}, numbers: { price: 650000, saved: 60000, saveMo: 2000, state: 'qld' }, profile: { stage: null, dependants: 3, employment: 'payg' }, inspections: [{ addr: 'x', at: 0 }] });
  t('a journey from today\'s journey.js (no new fields) is still accepted', r.b.ok === true);
  const nulls = journeyState(); Object.assign(nulls.profile, { incomes: null, empTypes: null, hecs: null, debtsMo: null, livingMo: null }); Object.assign(nulls.numbers, { rate: null, termYears: null }); nulls.factsAt = null;
  r = await sync(nulls);
  t('null is accepted for each new field', r.b.ok === true);
  const badCases = {
    'incomes [1]': s => { s.profile.incomes = [1]; }, 'incomes with text': s => { s.profile.incomes = ['a', 1]; }, 'a negative income': s => { s.profile.incomes = [-1, 5]; }, 'incomes over $10m': s => { s.profile.incomes = [2e7, 1]; },
    'an unknown income type': s => { s.profile.empTypes = ['payg', 'x']; }, 'one income type': s => { s.profile.empTypes = 'payg'; },
    'HELP as numbers': s => { s.profile.hecs = [1, 0]; }, 'debts as text': s => { s.profile.debtsMo = '450'; }, 'negative debts': s => { s.profile.debtsMo = -5; },
    'living costs over $1m a month': s => { s.profile.livingMo = 2e6; }, '11 dependants': s => { s.profile.dependants = 11; }, '2.5 dependants': s => { s.profile.dependants = 2.5; },
    'a 30% rate': s => { s.numbers.rate = 30; }, 'a rate as text': s => { s.numbers.rate = '6'; }, 'a 0 year term': s => { s.numbers.termYears = 0; }, 'a 41 year term': s => { s.numbers.termYears = 41; }, 'a 30.5 year term': s => { s.numbers.termYears = 30.5; },
    'factsAt as a list': s => { s.factsAt = [1]; }, 'a factsAt key with a dash': s => { s.factsAt = { 'a-b': 1 }; }, 'a negative factsAt time': s => { s.factsAt = { income: -1 }; }, 'a factsAt time as text': s => { s.factsAt = { income: '1' }; },
    '65 factsAt keys': s => { s.factsAt = {}; for (let i = 0; i < 65; i++) s.factsAt['k' + i] = 1; },
    'a 5-character place id': s => { s.inspections[0].id = 'short'; }, 'a number place id': s => { s.inspections[0].id = 12345678; }, 'a place id with a symbol': s => { s.inspections[0].id = 'abc$efgh'; }
  };
  const wrongly = [];
  for (const [label, mut] of Object.entries(badCases)) { const s = journeyState(); s.factsAt = { income: 1 }; mut(s); const x = await sync(s); if (x.b.ok !== false || x.b.error !== 'Invalid journey state') wrongly.push(label); }
  t('each wrong type is refused (' + Object.keys(badCases).length + ' cases)' + (wrongly.length ? ': accepted ' + wrongly.join(', ') : ''), wrongly.length === 0);
  const okFacts = journeyState(); okFacts.factsAt = { income: clock, firstHome: clock - 5, fhb: 0, stage: 1 };
  r = await sync(okFacts);
  t('factsAt with field and question ids is accepted', r.b.ok === true);

  // ───────────────────────────────────────────────────────────────────────────
  section('11. The Journey mirror and planReconcile()');
  t('the mirror covers every field the plan mirrors, and not occupancy or lastPrice', eq(D.MIRROR_FIELDS.slice().sort(), D.NAMES.filter(n => n !== 'occupancy' && n !== 'lastPrice').sort()));
  const pathOk = { state: 'numbers.state', area: 'profile.area', firstHome: 'profile.fhb', buyers: 'profile.buyers', income: 'profile.income', incomes: 'profile.incomes', employment: 'profile.empTypes', hecs: 'profile.hecs',
    dependants: 'profile.dependants', cardLimits: 'profile.cardLimits', debtsMonthly: 'profile.debtsMo', livingMonthly: 'profile.livingMo', saved: 'numbers.saved', saveMo: 'numbers.saveMo', rentMonthly: 'profile.rentNow',
    build: 'profile.build', targetPrice: 'numbers.price', maxPrice: 'budget.cap', depositPct: 'budget.depositPct', scheme: 'budget.depositPct', rate: 'numbers.rate', termYears: 'numbers.termYears' };
  t('each mirrored field sits where plan 2.2 says', D.MIRROR.every(mm => pathOk[mm.field] === mm.path));
  const fdsOk = price => price <= 1000000;
  const vals11 = D.fromJourney(S1, { fdsOk });
  t('with a cap check, a 5% deposit under the cap is the 5% Deposit Scheme', vals11.scheme === 'fds' && D.fromJourney(S1, { fdsOk: () => false }).scheme === 'none' && D.fromJourney(journeyState({ profile: Object.assign({}, S1.profile, { fhb: false }) })).scheme === 'none');
  const blankJ = { v: 1, done: {}, numbers: { price: 650000, saved: 60000, saveMo: 2000, state: 'qld' }, profile: { area: 'capital', buyers: 'single', fhb: true, build: 'established', income: null, dependants: 0, employment: 'payg', rentNow: 0, cardLimits: 0 }, budget: { depositPct: null, cap: null } };
  const round = JSON.parse(JSON.stringify(blankJ));
  const notPut = Object.keys(vals11).filter(n => !D.applyToJourney(round, n, vals11[n], clock));
  t('round trip: every value read from a journey writes back into a blank one (scheme is worked out, not written)', eq(notPut, ['scheme']));
  const back = D.fromJourney(round, { fdsOk });
  t('…and reads back the same', eq(back, vals11));
  t('…and records when, in factsAt', D.MIRROR_FIELDS.filter(n => n !== 'scheme').every(n => round.factsAt[n] === clock));
  t('employment follows profile.employment when both applicants match', round.profile.employment === 'payg' && (() => { const s = JSON.parse(JSON.stringify(blankJ)); s.profile.buyers = 'couple'; D.applyToJourney(s, 'employment', ['self', 'casual']); const a = s.profile.employment === 'payg'; D.applyToJourney(s, 'employment', ['casual', 'casual']); return a && s.profile.employment === 'casual'; })());
  t('rent goes into the Journey in whole dollars', (() => { const s = JSON.parse(JSON.stringify(blankJ)); D.applyToJourney(s, 'rentMonthly', 1733.33); return s.profile.rentNow === 1733 && D.MIRROR.find(x => x.field === 'rentMonthly').eq(1733, 1733.33); })());
  t('the Journey refuses a price under $50,000 and a cleared state', (() => { const s = JSON.parse(JSON.stringify(blankJ)); return !D.applyToJourney(s, 'targetPrice', 30000) && !D.applyToJourney(s, 'state', null) && s.numbers.price === 650000 && s.numbers.state === 'qld'; })());

  t('journeyFacts: factsAt when present, by field or question id', eq(D.journeyFacts({ factsAt: { income: 5, fhb: 7, price: 9, stage: 1 } }), { firstHome: 7, income: 5, targetPrice: 9 }));
  const oldFacts = D.journeyFacts(journeyState({ updatedAt: 1234 }), { fdsOk });
  const thinOld = journeyState({ updatedAt: 1234 }); thinOld.profile.income = null; thinOld.profile.incomes = null; delete thinOld.numbers.rate;
  const thinFacts = D.journeyFacts(thinOld, { fdsOk });
  t('…an older record with step 1 done: every field it holds at its updatedAt', D.MIRROR_FIELDS.every(n => oldFacts[n] === 1234));
  t('…and no time for a field it doesn\'t hold, so details can fill it', thinFacts.income === undefined && thinFacts.incomes === undefined && thinFacts.rate === undefined && thinFacts.saved === 1234
    && D.planReconcile(thinOld, { rate: { v: 6.1, at: 1000, by: 'tool:mortgage-repayment' } }).toJourney.some(x => x.field === 'rate' && x.v === 6.1));
  t('…and none for an empty one', eq(D.journeyFacts({ done: { 1: true }, updatedAt: 1234 }), {}));
  t('…step 1 not done: none', eq(D.journeyFacts({ done: {}, updatedAt: 1234 }), {}));

  const E = (v, at, by) => ({ v, at, by: by || 'tool:borrowing-power' });
  const T0 = S1.updatedAt;
  let plan = D.planReconcile(S1, { income: E(170000, T0 + 1000), saved: E(90000, T0 + 5000) });
  t('details newer than the Journey: the Journey takes it; equal values: nothing', eq(plan.toJourney, [{ field: 'income', v: 170000, at: T0 + 1000 }]) && !plan.toDetails.some(x => x.field === 'saved' || x.field === 'income'));
  t('a field details lacks goes from the Journey to details, at the Journey\'s time', plan.toDetails.some(x => x.field === 'state' && x.v === 'qld' && x.at === T0));
  plan = D.planReconcile(Object.assign(journeyState(), { factsAt: { cardLimits: T0 + 9000 } }), { cardLimits: E(5000, T0 + 1000) });
  t('the Journey\'s change newer: details takes the Journey\'s value at that time', eq(plan.toDetails.filter(x => x.field === 'cardLimits'), [{ field: 'cardLimits', v: 10000, at: T0 + 9000 }]));
  plan = D.planReconcile(Object.assign(journeyState({ profile: Object.assign({}, S1.profile, { income: null, incomes: null }) }), { factsAt: { income: T0 + 9000 } }), { income: E(120000, T0) });
  t('a null Journey value never overwrites details', !plan.toDetails.some(x => x.field === 'income') && !plan.toJourney.some(x => x.field === 'income'));
  plan = D.planReconcile(S1, { debtsMonthly: E(null, T0 + 1000) });
  t('a newer clear in details clears the Journey\'s copy', eq(plan.toJourney, [{ field: 'debtsMonthly', v: null, at: T0 + 1000 }]) && (() => { const s = journeyState(); D.applyToJourney(s, 'debtsMonthly', null, 1); return s.profile.debtsMo === null; })());
  // The Journey's chips end at "3 or more" (it writes 3); it holds up to 10.
  const withDeps = (n, at) => Object.assign(journeyState({ updatedAt: T0, profile: Object.assign({}, S1.profile, { dependants: n }) }), at === undefined ? {} : { factsAt: { dependants: at } });
  plan = D.planReconcile(withDeps(3, T0), { dependants: E(4, T0 + 1000) });
  t('"3 or more" in the Journey and a newer 4 in details: the Journey takes 4', eq(plan.toJourney, [{ field: 'dependants', v: 4, at: T0 + 1000 }]) && !plan.toDetails.some(x => x.field === 'dependants'));
  const j3 = withDeps(3, T0 + 9000);
  plan = D.planReconcile(j3, { dependants: E(5, T0 + 1000) });
  t('…and an older 5 as well (5 is also "3 or more"), at the Journey\'s later time; details isn\'t lowered', eq(plan.toJourney, [{ field: 'dependants', v: 5, at: T0 + 9000 }]) && !plan.toDetails.some(x => x.field === 'dependants'));
  plan.toJourney.forEach(x => D.applyToJourney(j3, x.field, x.v, x.at));
  plan = D.planReconcile(j3, { dependants: E(5, T0 + 1000) });
  t('…after which the two agree and nothing moves', j3.profile.dependants === 5 && j3.factsAt.dependants === T0 + 9000 && !plan.toJourney.length && !plan.mark.length && !plan.toDetails.some(x => x.field === 'dependants'));
  t('…and from an older record with no factsAt (at its updatedAt), or with no time for dependants (at details\' time)', eq(D.planReconcile(withDeps(3), { dependants: E(6, T0 - 5000) }).toJourney, [{ field: 'dependants', v: 6, at: T0 }])
    && eq(D.planReconcile(Object.assign(withDeps(3), { factsAt: { income: T0 } }), { dependants: E(6, T0 - 5000) }).toJourney, [{ field: 'dependants', v: 6, at: T0 - 5000 }]));
  t('a Journey holding 5 takes a newer 4, and gives an older 4 its 5', eq(D.planReconcile(withDeps(5, T0), { dependants: E(4, T0 + 1000) }).toJourney, [{ field: 'dependants', v: 4, at: T0 + 1000 }])
    && eq(D.planReconcile(withDeps(5, T0 + 9000), { dependants: E(4, T0 + 1000) }).toDetails.filter(x => x.field === 'dependants'), [{ field: 'dependants', v: 5, at: T0 + 9000 }]));
  t('a newer "3 or more" replaces an older 2 in details, and a newer 2 replaces the Journey\'s 3', eq(D.planReconcile(withDeps(3, T0 + 9000), { dependants: E(2, T0 + 1000) }).toDetails.filter(x => x.field === 'dependants'), [{ field: 'dependants', v: 3, at: T0 + 9000 }])
    && eq(D.planReconcile(withDeps(3, T0), { dependants: E(2, T0 + 1000) }).toJourney, [{ field: 'dependants', v: 2, at: T0 + 1000 }]));
  plan = D.planReconcile(S1, { depositPct: E(13.3, T0 + 1000, 'app'), targetPrice: E(30000, T0 + 1000, 'tool:deposit') });
  t('a value the Journey can\'t hold is left (13.3% deposit, a $30,000 price)', !plan.toJourney.length && !plan.toDetails.some(x => x.field === 'depositPct' || x.field === 'targetPrice'));
  plan = D.planReconcile(Object.assign(journeyState({ budget: { depositPct: 0.02, cap: 600000 } }), { factsAt: { depositPct: T0 + 100 } }), {});
  t('Help to Buy at step 3 gives details deposit 2 and scheme h2b at that time', plan.toDetails.some(x => x.field === 'depositPct' && x.v === 2 && x.at === T0 + 100) && plan.toDetails.some(x => x.field === 'scheme' && x.v === 'h2b' && x.at === T0 + 100));
  plan = D.planReconcile(journeyState({ done: {} }), {});
  t('a journey without step 1 and without factsAt gives details nothing', !plan.toDetails.length && !plan.toJourney.length);
  plan = D.planReconcile(journeyState({ done: {} }), { state: E('vic', clock, 'tool:stamp-duty'), firstHome: E(true, clock, 'tool:stamp-duty'), targetPrice: E(720000, clock, 'tool:stamp-duty') });
  t('…but takes what a calculator entered (state, price)', eq(plan.toJourney.map(x => x.field), ['state', 'targetPrice']));
  t('…and marks an answer that matches its blank value (first home), so the wizard counts it as answered', eq(plan.mark, [{ field: 'firstHome', v: true, at: clock }]));
  plan = D.planReconcile(S1, { firstHome: E(true, T0 + 9000) });
  t('nothing is marked when the Journey already has a time for the answer', !plan.mark.length && !plan.toJourney.length);
  // HELP: [false, false] is also a journey's value before the question was
  // ever asked (today's journey.js has no HELP question).
  const noHelp = journeyState({ profile: Object.assign({}, S1.profile, { hecs: [false, false] }) });
  plan = D.planReconcile(noHelp, {});
  t('a journey\'s HELP default [false, false] with no time for it sends nothing to details', !plan.toDetails.some(x => x.field === 'hecs') && D.fromJourney(noHelp).hecs === undefined
    && !D.migrateInto(D.normalize({}), fakeStorage({ propCalc_journey_v1: JSON.stringify(noHelp) }), '').includes('hecs'));
  plan = D.planReconcile(noHelp, { hecs: E([true, false], T0 - 5000) });
  t('…and doesn\'t count against a HELP debt entered on a calculator', eq(plan.toJourney.filter(x => x.field === 'hecs'), [{ field: 'hecs', v: [true, false], at: T0 - 5000 }]));
  const saidNo = Object.assign(journeyState({ profile: Object.assign({}, S1.profile, { hecs: [false, false] }) }), { factsAt: { hecs: T0 + 5 } });
  plan = D.planReconcile(saidNo, {});
  t('…but "no HELP debt" answered in the Journey (it has a time) goes to details', eq(plan.toDetails.filter(x => x.field === 'hecs'), [{ field: 'hecs', v: [false, false], at: T0 + 5 }]));
  t('…and a HELP debt the Journey holds counts without a time', D.planReconcile(S1, {}).toDetails.some(x => x.field === 'hecs' && eq(x.v, [true, false])));
  const clearedHelp = journeyState(); D.applyToJourney(clearedHelp, 'hecs', null, T0 + 7);
  t('a HELP answer cleared in details and written into the Journey stays agreed', eq(clearedHelp.profile.hecs, [false, false]) && (() => { const p = D.planReconcile(clearedHelp, { hecs: E(null, T0 + 7) }); return !p.toJourney.some(x => x.field === 'hecs') && !p.toDetails.some(x => x.field === 'hecs'); })());
  // convergence: apply a plan both ways and plan again
  const Sc = Object.assign(journeyState(), { factsAt: { saved: T0 + 50 } });
  let det = { income: E(170000, T0 + 1000), saved: E(1000, T0 + 10), hecs: E([false, true], T0 + 2000) };
  plan = D.planReconcile(Sc, det, { fdsOk });
  plan.toJourney.forEach(x => D.applyToJourney(Sc, x.field, x.v, x.at));
  plan.toDetails.forEach(x => { det = D.writeField(det, x.field, x.v, 'journey', { at: x.at }).f; });
  const again = D.planReconcile(Sc, det, { fdsOk });
  t('after one reconcile both sides agree: a second plan is empty', !again.toJourney.length && !again.toDetails.length && Sc.profile.income === 170000 && det.saved.v === 90000 && eq(Sc.profile.hecs, [false, true]));

  // ───────────────────────────────────────────────────────────────────────────
  section('12. The browser runtime, two devices, the real handler');
  store.clear(); expiry.clear(); sets.clear();
  seedAccount('one@example.com', 'u1', 'TOK1');
  seedAccount('two@example.com', 'u2', 'TOK2');
  const timers = [];
  const tick = () => new Promise(res => setImmediate(res));
  const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };
  const advance = async ms => {
    const until = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers.find(x => x.fn && x.at <= until);
      if (!next) break;
      clock = Math.max(clock, next.at);
      const fn = next.fn; next.fn = null; fn();
      await settle();
    }
    clock = until;
    await settle();
  };
  function device(name, storage, opts) {
    opts = opts || {};
    const posts = [], handlers = {};
    const env = {
      storage,
      now: () => clock + (opts.skew || 0),
      sessionId: () => { try { const s = JSON.parse(storage.getItem('propCalc_session_v1') || 'null'); return s && s.id ? String(s.id) : ''; } catch (e) { return ''; } },
      post: async (payload, keepalive) => {
        posts.push({ payload: JSON.parse(JSON.stringify(payload)), keepalive: !!keepalive });
        // opts.failGets: how many account reads are refused (a 429 from the
        // shared hourly limit), before they work again.
        if (payload.action === 'detailsGet' && opts.failGets > 0) { opts.failGets--; return { ok: false, error: 'Too many requests', status: 429 }; }
        // opts.putReplies: what the next account writes get instead of
        // reaching the server, in order ('offline' rejects, as a fetch
        // that never left would).
        if (payload.action === 'detailsPut' && opts.putReplies && opts.putReplies.length) {
          const x = opts.putReplies.shift();
          if (x === 'offline') throw new Error('offline');
          return JSON.parse(JSON.stringify(x));
        }
        const s = JSON.parse(storage.getItem('propCalc_session_v1') || 'null');
        const res = await callJ(payload, s && s.token);
        const j = res.b; j.status = res.status; return j;
      },
      setTimeout: (fn, ms) => { timers.push({ fn, at: clock + ms }); return timers.length; },
      clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
      on: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
      visible: () => true
    };
    const rt = D.createRuntime(env);
    const events = [];
    rt.onChange(e => events.push(e));
    return { name, rt, posts, handlers, events, storage, fire: (type, e) => (handlers[type] || []).forEach(fn => fn(e)) };
  }
  const signIn = (st, id, token) => st.setItem('propCalc_session_v1', JSON.stringify({ id, token }));

  // guest
  const stA = fakeStorage();
  let A1 = device('A', stA); A1.rt.start(); await settle();
  A1.rt.set('income', 95000, 'tool:borrowing-power');
  A1.rt.set('state', 'nsw', 'tool:stamp-duty');
  await advance(5000);
  t('a guest\'s edits stay in the browser: nothing is sent', A1.posts.length === 0 && JSON.parse(stA.getItem(D.KEY)).f.income.v === 95000);
  // the account already holds an older income and a newer state
  seed('details:one@example.com', { f: { income: { v: 80000, at: clock - 100000, by: 'journey' }, state: { v: 'qld', at: clock + 10, by: 'journey' } }, updatedAt: clock - 100000 });
  clock += 20;
  signIn(stA, 'u1', 'TOK1');
  A1 = device('A', stA); A1.rt.start(); await settle(); await advance(10);
  t('first load after signing in: the account copy is read and merged field by field', A1.rt.get('state') === 'qld' && A1.rt.get('income') === 95000 && JSON.parse(stA.getItem(D.KEY)).owner === 'u1');
  t('…the newer browser value goes to the account', readJson('details:one@example.com').f.income.v === 95000 && A1.posts.some(p => p.payload.action === 'detailsPut' && p.payload.f.income));
  t('…the account\'s newer value is announced as from the account', A1.events.some(e => e.source === 'account' && e.changes.some(c => c.field === 'state' && c.to.v === 'qld' && c.from.v === 'nsw')));
  const repl = A1.rt.takeReplaced();
  t('…and what the browser replaced is listed once, for Undo', repl.length === 1 && repl[0].field === 'income' && repl[0].from.v === 80000 && repl[0].to.v === 95000 && A1.rt.takeReplaced().length === 0);
  A1.rt.undo(repl[0], 'journey');
  await advance(2000);
  t('Undo puts the account value back everywhere', A1.rt.get('income') === 80000 && readJson('details:one@example.com').f.income.v === 80000 && !A1.rt.unsent());
  // second device
  const stB = fakeStorage(); signIn(stB, 'u1', 'TOK1');
  const B1 = device('B', stB); B1.rt.start(); await settle();
  t('a second device opens with the same details', B1.rt.get('income') === 80000 && B1.rt.get('state') === 'qld' && B1.rt.entry('income').by === 'journey');
  B1.rt.set('saved', 90000, 'journey');
  await advance(1000);
  t('an edit is sent 1.5 s later, not at once', !B1.posts.some(p => p.payload.action === 'detailsPut'));
  await advance(600);
  t('…then reaches the account', readJson('details:one@example.com').f.saved.v === 90000 && !B1.rt.unsent());
  clock += D.PULL_EVERY_MS;
  const A2 = device('A', stA); A2.rt.start(); await settle();
  t('the other device reads it on its next page load', A2.rt.get('saved') === 90000);
  A2.rt.set('cardLimits', 10000, 'journey');
  A2.fire('pagehide');
  await settle();
  t('leaving the page sends a waiting change with keepalive', A2.posts.some(p => p.keepalive && p.payload.action === 'detailsPut' && p.payload.f.cardLimits) && readJson('details:one@example.com').f.cardLimits.v === 10000);
  // other tab
  const tab2 = device('A tab 2', stA); tab2.rt.start(); await settle();
  A2.rt.set('saveMo', 2500, 'journey');
  tab2.fire('storage', { key: D.KEY });
  t('another tab hears the change (storage event)', tab2.events.some(e => e.source === 'other-tab' && e.changes.some(c => c.field === 'saveMo' && c.to.v === 2500)));
  await advance(2000);
  // a lost write heals itself
  const lost = readJson('details:one@example.com'); delete lost.f.saveMo; seed('details:one@example.com', lost);
  await A2.rt.pull(true); await advance(10);
  t('a value the account lost is sent again on the next read', readJson('details:one@example.com').f.saveMo.v === 2500);
  // fast clock
  const stF = fakeStorage(); signIn(stF, 'u1', 'TOK1');
  const F1 = device('fast', stF, { skew: 600000 }); F1.rt.start(); await settle();
  F1.rt.set('rentMonthly', 1800, 'journey'); await advance(2000);
  const putsBefore = F1.posts.filter(p => p.payload.action === 'detailsPut').length;
  await F1.rt.pull(true); await advance(10);
  t('a device with a fast clock takes the server\'s clamped time and doesn\'t resend', readJson('details:one@example.com').f.rentMonthly.at <= clock + 60000 && F1.posts.filter(p => p.payload.action === 'detailsPut').length === putsBefore);
  // another account on the same browser
  signIn(stA, 'u2', 'TOK2');
  const A3 = device('A as u2', stA); A3.rt.start(); await settle();
  t('a record that belongs to another account is dropped, and the new account\'s read', A3.rt.get('income') === undefined && JSON.parse(stA.getItem(D.KEY)).owner === 'u2');
  // partner mode
  const shared = journeyState({ updatedAt: clock - 500 });
  stA.setItem('propCalc_journey_v1', JSON.stringify(shared));
  stA.setItem('propCalc_journey_collab', 'tokP');
  const P1 = device('partner', stA); P1.rt.start(); await settle();
  t('on a partner\'s device, mirrored fields come from the shared journey, marked "shared"', P1.rt.get('income') === 165000 && P1.rt.entry('income').by === 'shared' && P1.rt.partner());
  t('…a change there stays on the page', P1.rt.set('income', 1, 'tool:borrowing-power').reason === 'partner' && P1.rt.get('income') === 165000);
  P1.rt.set('lastPrice', 640000, 'tool:deposit'); await advance(2000);
  t('…fields the Journey doesn\'t hold use the partner\'s own record', P1.rt.get('lastPrice') === 640000 && readJson('details:two@example.com').f.lastPrice.v === 640000 && !readJson('details:two@example.com').f.income);
  const shared2 = journeyState({ updatedAt: clock, profile: Object.assign({}, shared.profile, { cardLimits: 5000 }) });
  stA.setItem('propCalc_journey_v1', JSON.stringify(shared2));
  P1.fire('storage', { key: 'propCalc_journey_v1', oldValue: JSON.stringify(shared), newValue: JSON.stringify(shared2) });
  t('…and a change to the shared journey is announced', P1.events.some(e => e.source === 'shared' && e.changes.length === 1 && e.changes[0].field === 'cardLimits' && e.changes[0].to.v === 5000));
  stA.removeItem('propCalc_journey_collab');
  // expired session
  const stX = fakeStorage(); signIn(stX, 'u1', 'NOPE');
  const X1 = device('expired', stX); X1.rt.start(); await settle();
  X1.rt.set('income', 1, 'journey'); await advance(5000);
  t('with a dead session, one read is refused and nothing is pushed', X1.posts.length === 1 && X1.posts[0].payload.action === 'detailsGet' && readJson('details:one@example.com').f.income.v === 80000);
  // reads are throttled
  const stT = fakeStorage(); signIn(stT, 'u1', 'TOK1');
  let T1 = device('t', stT); T1.rt.start(); await settle();
  T1 = device('t', stT); T1.rt.start(); await settle();
  const gets1 = T1.posts.filter(p => p.payload.action === 'detailsGet').length;
  clock += D.PULL_EVERY_MS + 1;
  T1 = device('t', stT); T1.rt.start(); await settle();
  t('pages opened within 10 s of a read don\'t read again', gets1 === 0 && T1.posts.filter(p => p.payload.action === 'detailsGet').length === 1);
  // a newer version of the record makes this copy read-only
  const stV = fakeStorage({ [D.KEY]: JSON.stringify({ v: 2, owner: '', f: { income: { v: 5, at: 1, by: 'journey' } } }) });
  const V1 = device('v2', stV); V1.rt.start();
  t('a record from a newer version of this file is never overwritten', V1.rt.set('income', 9, 'journey').reason === 'version' && JSON.parse(stV.getItem(D.KEY)).v === 2);
  // blocked storage
  const stBlocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
  const Q1 = device('blocked', stBlocked); Q1.rt.start();
  Q1.rt.set('income', 95000, 'journey');
  t('with storage blocked the page still works for the visit', Q1.rt.get('income') === 95000);
  const N1 = device('no storage', null); N1.rt.start(); N1.rt.set('saved', 5000, 'journey');
  t('…and with no storage at all', N1.rt.get('saved') === 5000);

  // Signed in on a shared computer, and the first account read fails (a 429
  // from the hourly limit, or offline). What is typed then is still this
  // account's: sign-out removes it, and the next person never gets it.
  seedAccount('three@example.com', 'u3', 'TOK3');
  seedAccount('four@example.com', 'u4', 'TOK4');
  seed('details:three@example.com', { f: { income: { v: 80000, at: clock - 100000, by: 'journey' } }, updatedAt: clock - 100000 });
  const stL = fakeStorage(); signIn(stL, 'u3', 'TOK3');
  const L1 = device('library', stL, { failGets: 99 }); L1.rt.start(); await settle();
  L1.rt.set('income', 140000, 'tool:borrowing-power');
  L1.rt.set('debtsMonthly', 650, 'tool:borrowing-power');
  await advance(5000);
  const recL = JSON.parse(stL.getItem(D.KEY));
  t('an edit made before the first account read succeeds belongs to the account at once', recL.owner === 'u3' && recL.linked === 0 && eq(recL.dirty.slice().sort(), ['debtsMonthly', 'income']));
  t('…nothing is sent until the account copy has been read', !L1.posts.some(p => p.payload.action === 'detailsPut') && readJson('details:three@example.com').f.income.v === 80000
    && !readJson('details:three@example.com').f.debtsMonthly);
  t('…sign-out warns that it hasn\'t reached the account', L1.rt.unsent());
  await L1.rt.flush();
  t('…a push at sign-out tries the read again, and while it fails keeps the changes', L1.rt.unsent() && L1.posts.filter(p => p.payload.action === 'detailsGet').length >= 3 && !L1.posts.some(p => p.payload.action === 'detailsPut'));
  // auth-nav.js forgetPlan removes any record with an owner and reports
  // unsent when that owner has dirty fields: the stored record says both.
  t('sign-out removes it from the browser', L1.rt.forget() === true && stL.getItem(D.KEY) === null);
  stL.removeItem('propCalc_session_v1');
  signIn(stL, 'u4', 'TOK4');
  const L2 = device('library, next person', stL); L2.rt.start(); await settle(); await advance(3000);
  t('the next person to sign in there sees none of it, and none of it reaches their account', L2.rt.get('income') === undefined && L2.rt.get('debtsMonthly') === undefined
    && !L2.posts.some(p => p.payload.action === 'detailsPut') && !readJson('details:four@example.com'));
  // Same start, but the read works again before sign-out: the push reads the
  // account copy first, lists what this browser replaced, then sends.
  const stR = fakeStorage(); signIn(stR, 'u3', 'TOK3');
  const R1 = device('retry', stR, { failGets: 1 }); R1.rt.start(); await settle();
  clock += 1000;
  R1.rt.set('income', 140000, 'tool:borrowing-power');
  t('…an edit after a failed read is held back', !R1.posts.some(p => p.payload.action === 'detailsPut'));
  await advance(2000);
  t('…then its push reads the account copy first and sends', readJson('details:three@example.com').f.income.v === 140000 && JSON.parse(stR.getItem(D.KEY)).linked === 1 && !R1.rt.unsent()
    && R1.posts.map(p => p.payload.action).join(',') === 'detailsGet,detailsGet,detailsPut');
  const replR = R1.rt.takeReplaced();
  t('…and the account value it replaced is listed for Undo', replR.length === 1 && replR[0].field === 'income' && replR[0].from.v === 80000 && replR[0].to.v === 140000);
  // A signed-in visitor's own journey imported on the first load is theirs too.
  const stM = fakeStorage({ propCalc_journey_v1: JSON.stringify(S1), propCalc_journey_owner: 'u3' }); signIn(stM, 'u3', 'TOK3');
  const M1 = device('import, read fails', stM, { failGets: 99 }); M1.rt.start(); await settle();
  t('figures imported from the account\'s journey before a read succeeds belong to the account', JSON.parse(stM.getItem(D.KEY)).owner === 'u3' && M1.rt.get('income') === 165000 && M1.rt.forget() === true && stM.getItem(D.KEY) === null);
  // A guest record with nothing typed while signed in stays a guest's.
  const stG = fakeStorage({ [D.KEY]: JSON.stringify({ v: 1, owner: '', f: { saved: { v: 5000, at: 5, by: 'journey' } }, dirty: ['saved'], mig: 1 }) }); signIn(stG, 'u3', 'TOK3');
  const G1 = device('guest record, read fails', stG, { failGets: 99 }); G1.rt.start(); await settle();
  t('a guest\'s record isn\'t taken by an account whose read failed, if nothing was typed', JSON.parse(stG.getItem(D.KEY)).owner === '' && G1.rt.forget() === false);

  // A send that fails for a reason that may pass is tried again while the
  // page stays open (5 s, then 30 s), at once when the browser comes back
  // online, and with keepalive when the page goes.
  seedAccount('five@example.com', 'u5', 'TOK5');
  const busy = { ok: false, error: 'Your details are being saved from another page or device. Please try again.', status: 503 };
  const putsOf = d => d.posts.filter(p => p.payload.action === 'detailsPut');
  const stW1 = fakeStorage(); signIn(stW1, 'u5', 'TOK5');
  const W1 = device('put refused once', stW1, { putReplies: [busy] }); W1.rt.start(); await settle();
  W1.rt.set('saved', 41000, 'tool:deposit');
  await advance(1600);
  t('a put refused while another put holds the lock leaves the change unsent', putsOf(W1).length === 1 && W1.rt.unsent() && !readJson('details:five@example.com'));
  await advance(5000);
  t('…and is sent again 5 s later', putsOf(W1).length === 2 && readJson('details:five@example.com').f.saved.v === 41000 && !W1.rt.unsent());
  const stW2 = fakeStorage(); signIn(stW2, 'u5', 'TOK5');
  const W2 = device('put keeps failing', stW2, { putReplies: [{ ok: false, error: 'Too many requests', status: 429 }, { ok: false, error: 'network' }, 'offline'] }); W2.rt.start(); await settle();
  W2.rt.set('saveMo', 1300, 'tool:deposit');
  await advance(1600 + 5000 + 30000);
  t('…one that keeps failing (429, no reply, offline) is tried twice more, 5 s and 30 s later', putsOf(W2).length === 3 && W2.rt.unsent());
  await advance(600000);
  t('…then waits for an edit, the tab or the network', putsOf(W2).length === 3 && W2.rt.unsent());
  W2.fire('online'); await advance(10);
  t('…and goes as soon as the browser is back online', putsOf(W2).length === 4 && readJson('details:five@example.com').f.saveMo.v === 1300 && !W2.rt.unsent());
  const stW3 = fakeStorage(); signIn(stW3, 'u5', 'TOK5');
  const W3 = device('put fails, then the page goes', stW3, { putReplies: [busy, busy, busy] }); W3.rt.start(); await settle();
  W3.rt.set('cardLimits', 7000, 'tool:borrowing-power');
  await advance(1600 + 5000 + 30000);
  const before3 = putsOf(W3).length;
  W3.fire('pagehide'); await settle();
  t('leaving the page sends a change whose send failed, with keepalive', before3 === 3 && putsOf(W3).length === 4 && putsOf(W3)[3].keepalive && readJson('details:five@example.com').f.cardLimits.v === 7000);
  const stW4 = fakeStorage(); signIn(stW4, 'u5', 'TOK5');
  const W4 = device('put refused as invalid', stW4, { putReplies: [{ ok: false, error: 'Invalid details', status: 400 }] }); W4.rt.start(); await settle();
  W4.rt.set('rentMonthly', 1450, 'journey');
  await advance(60000);
  t('a put the server refused as invalid (400) isn\'t sent again by itself', putsOf(W4).length === 1 && W4.rt.unsent());
  const stW5 = fakeStorage(); signIn(stW5, 'u5', 'TOK5');
  const W5 = device('put fails, then an edit', stW5, { putReplies: [busy] }); W5.rt.start(); await settle();
  W5.rt.set('livingMonthly', 3100, 'tool:borrowing-power');
  await advance(1600);
  W5.rt.set('debtsMonthly', 320, 'tool:borrowing-power');
  await advance(1600);
  t('an edit while a retry waits sends both 1.5 s later, without waiting for the retry', putsOf(W5).length === 2 && !W5.rt.unsent() && readJson('details:five@example.com').f.livingMonthly.v === 3100 && readJson('details:five@example.com').f.debtsMonthly.v === 320);
  await advance(60000);
  t('…and nothing more is sent', putsOf(W5).length === 2);

  // ───────────────────────────────────────────────────────────────────────────
  section('13. Privacy');
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'details.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
  t('details.js has no tracking and logs nothing', !/gtag|dataLayer|trackGuest|trackUsage|trackCalculator|sendBeacon|console\./.test(code));
  t('details.js talks to one fixed address, with values only in a POST body', (code.match(/fetch\(/g) || []).length === 1 && /var ENDPOINT = '\/\.netlify\/functions\/journey';/.test(code) && !/ENDPOINT \+|\?[a-z]+=' \+/.test(code) && /method: 'POST'/.test(code));
  // Load the file as a page does: window.Details starts on its own and uses
  // the page's fetch. Every request must go to the one address, as a POST,
  // with credentials kept to this site.
  const vm = require('vm');
  const pageLS = fakeStorage({ propCalc_session_v1: JSON.stringify({ id: 'u1' }) });
  const requests = [], winHandlers = {};
  const win = {
    localStorage: pageLS, document: { visibilityState: 'visible', addEventListener: (ty, fn) => { winHandlers[ty] = fn; } },
    addEventListener: (ty, fn) => { winHandlers[ty] = fn; }, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout: x => clearTimeout(x),
    fetch: async (url, o) => { requests.push({ url, o }); const res = await callJ(JSON.parse(o.body), 'TOK1'); return { status: res.status, json: async () => res.b }; }
  };
  win.window = win; win.self = win;
  vm.runInNewContext(src, Object.assign(win, { Promise, JSON, Object, Array, Math, Date, String, Number, TextEncoder, unescape, encodeURIComponent, isFinite, parseFloat }));
  await new Promise(res => setTimeout(res, 30)); await settle();
  const PD = win.Details;
  t('in a page, window.Details starts by itself and reads the account copy', !!PD && typeof PD.set === 'function' && PD.get('saved') === 90000 && requests.length === 1);
  PD.set('debtsMonthly', 777, 'tool:borrowing-power');
  await new Promise(res => setTimeout(res, 30)); await settle();
  t('…sends an edit to the account', readJson('details:one@example.com').f.debtsMonthly.v === 777);
  t('every request goes to /.netlify/functions/journey as a same-site POST, with no value in the address', requests.length === 2 && requests.every(q => q.url === '/.netlify/functions/journey' && q.o.method === 'POST' && q.o.credentials === 'same-origin' && !/\d/.test(q.url))
    && JSON.parse(requests[1].o.body).f.debtsMonthly.v === 777);
  vm.runInContext(src, win); // win was made a context by runInNewContext above
  t('a second copy of the script on the page keeps the first runtime', win.Details === PD && requests.length === 2);
  const valueLike = /\b(95000|80000|90000|165000|123456|640000|1800|2500|10000)\b/;
  const leaked = logs.filter(l => valueLike.test(l));
  t('no server log line holds a value (' + logs.length + ' lines checked)', leaked.length === 0 && logs.some(l => /detailsPut dropped 3 field\(s\): /.test(l)));

  Date.now = realNow;
  print('\n' + (fails ? fails + ' failed, ' + passes + ' passed' : 'details-test: all ' + passes + ' checks passed ✓'));
  process.exit(fails ? 1 : 0);
})().catch(e => { Date.now = realNow; print('details-test crashed: ' + (e && e.stack || e)); process.exit(1); });

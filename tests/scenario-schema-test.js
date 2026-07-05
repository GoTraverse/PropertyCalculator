#!/usr/bin/env node
/**
 * scenario-schema-test.js — Regression coverage for shared/scenario-schema.js.
 *
 * Why this exists:
 *   Architecture-B step 3a introduces the typed scenario v2 schema that both
 *   the browser and the Netlify functions will share. The v1 -> v2 migration
 *   (fromV1) has to swallow a decade of DOM-dump variants without ever
 *   throwing, and validate() is the future server-side gate — so both get
 *   pinned here before any client cutover lands (step 5).
 *
 *   Suites:
 *     1. emptyV2 canonical defaults validate clean
 *     2. fromV1 with a realistic v1 fixture (field ids from app.js
 *        collectCurrentState(), "$850,000"-style money strings) maps every
 *        money field and every typed home correctly
 *     3. fromV1 garbage tolerance ({}, null, strings, numbers) — valid
 *        defaults + migrationWarnings, never a throw
 *     4. validate rejections — unknown key (top-level + nested), out-of-range
 *        rate, bad state, oversized title — each naming the field
 *     5. Round-trip: validate(fromV1(fixture)) is ok
 *     6. serialize / isOversized byte-size guard
 *
 * Run: node tests/scenario-schema-test.js
 *      Exit 0 = pass, exit 1 = at least one assertion failed.
 */
'use strict';

const Schema = require('../shared/scenario-schema.js');

let failed = 0;
const t = (label, ok, extra) => {
  if (ok) {
    console.log('  ✓ ' + label);
  } else {
    failed++;
    console.error('  ✗ ' + label + (extra ? ' — ' + extra : ''));
  }
};

// ── Fixture — realistic v1 library record ──────────────────────────────────
// Wrapper shape mirrors app.js saveScenario()'s `record`; state mirrors
// collectCurrentState() exactly (all element-id keys, string values).
// Money values use the "$850,000" display style fromV1 must coerce.
const V1_FIXTURE = {
  id: 'sc_1719900000000',
  addrKey: '12 wattle st, chermside, qld',
  fullAddr: '12 Wattle St, Chermside, QLD',
  timestamp: '05/07/2026 14:22',
  status: 'offered',
  bed: '3', bath: '2', car: '1',
  type: 'House',
  price: '$850,000',
  hasPhoto: true,
  thumb: '',
  exportCount: 2,
  savedAt: '2026-07-05T04:22:11.000Z',
  state: {
    values: {
      'inp-price': '$850,000',
      'inp-savings': '$120,000',
      'inp-depp': '10',
      'inp-govt': '5',
      'inp-rate': '5.9',
      'inp-term': '30',
      'inp-cont': '15',
      'inp-rent': '$450',
      'inp-weeks': '4',
      'inp-settle-date': '2026-09-15',
      'inp-offset': '$25,000',
      'pd-address': '12 Wattle St',
      'pd-suburb': 'Chermside',
      'pd-state': 'QLD',
      'pd-bed': '3',
      'pd-bath': '2',
      'pd-car': '1',
      'pd-land': '405',
      'pd-house': '120',
      'pd-year': '1985',
      'pd-type': 'House',
      'pd-url': 'https://www.realestate.com.au/property-house-qld-chermside-1234',
      'pd-notes': 'North-facing. Check roof and get building + pest done.',
      'pd-status': 'offered',
      'pd-status-date': '2026-07-12',
      'ag-agency': 'Ray White Chermside',
      'ag-name': 'Jane Agent',
      'ag-phone': '0400 000 000',
      'ag-email': 'jane.agent@raywhite.com',
      'scheme-select': 'fhbg',
      'inp-state': 'qld',
      'inp-fhb-checked': '1',
      'inp-new-prop-checked': '0',
      'pd-type-label': '🏠 House',
      renoEnabled: true,
      rentEnabled: true,
    },
    dynCostData: [
      { name: 'Building & pest', amount: 600, category: 'purchase' },
      { name: 'Conveyancing', amount: '$1,800', category: 'purchase' },
    ],
    renoItemData: [
      { emoji: '🔨', name: 'Paint interior', amount: 4500, note: 'DIY maybe' },
    ],
    keyDates: [
      { id: 'kd-1751690000000', date: '2026-07-12', label: 'Offer deadline' },
    ],
    commsLog: [
      { id: 'cm-1751600000000', date: '2026-07-03', type: '📞 Phone call', text: 'Agent says seller is motivated.' },
    ],
  },
};

// ── Suite 1 — emptyV2 ──────────────────────────────────────────────────────
console.log('\nemptyV2 canonical defaults:');
{
  const e = Schema.emptyV2();
  const res = Schema.validate(e);
  t('emptyV2() validates clean', res.ok === true, res.ok ? '' : res.field + ': ' + res.message);
  t('V2_VERSION is 2 and emptyV2().v matches', Schema.V2_VERSION === 2 && e.v === 2);
  t('status defaults to browsing', e.status === 'browsing');
  t('address.state defaults to empty (allowed)', e.address.state === '');
  t('lists default to empty arrays',
    Array.isArray(e.costs.items) && Array.isArray(e.renovation.items) &&
    Array.isArray(e.tracking.keyDates) && Array.isArray(e.meta.migrationWarnings));
  t('two emptyV2() calls are independent copies', (() => {
    const a = Schema.emptyV2(); const b = Schema.emptyV2();
    a.purchase.price = 1; a.costs.items.push({ name: 'x', amount: 1, category: 'purchase' });
    return b.purchase.price === 0 && b.costs.items.length === 0;
  })());
}

// ── Suite 2 — fromV1 realistic fixture ─────────────────────────────────────
console.log('\nfromV1 with realistic v1 record (money-string coercion + typed homes):');
{
  const v2 = Schema.fromV1(V1_FIXTURE);
  // Money fields
  t("inp-price '$850,000' -> purchase.price 850000", v2.purchase.price === 850000, String(v2.purchase.price));
  t("inp-savings '$120,000' -> purchase.savings 120000", v2.purchase.savings === 120000, String(v2.purchase.savings));
  t("inp-offset '$25,000' -> loan.offsetBalance 25000", v2.loan.offsetBalance === 25000, String(v2.loan.offsetBalance));
  t("inp-rent '$450' -> costs.currentRentWeekly 450 (NOT income.weeklyRent)",
    v2.costs.currentRentWeekly === 450 && v2.income.weeklyRent === 0,
    'currentRentWeekly=' + v2.costs.currentRentWeekly + ' income.weeklyRent=' + v2.income.weeklyRent);
  t("dynCost '$1,800' string -> costs.items[1].amount 1800", v2.costs.items[1].amount === 1800, String(v2.costs.items[1] && v2.costs.items[1].amount));
  // Percents / plain numerics
  t('inp-depp -> purchase.depositPct 10', v2.purchase.depositPct === 10);
  t('inp-govt -> purchase.govtSchemePct 5', v2.purchase.govtSchemePct === 5);
  t('inp-rate -> loan.rate 5.9', v2.loan.rate === 5.9);
  t('inp-term -> loan.termYears 30', v2.loan.termYears === 30);
  t('inp-cont -> renovation.contingencyPct 15', v2.renovation.contingencyPct === 15);
  t('inp-weeks -> costs.rentOverlapWeeks 4', v2.costs.rentOverlapWeeks === 4);
  // Address + identity
  t('pd-address -> address.street', v2.address.street === '12 Wattle St');
  t('pd-suburb -> address.suburb', v2.address.suburb === 'Chermside');
  t("pd-state 'QLD' -> address.state 'qld' (normalised)", v2.address.state === 'qld');
  t('record.fullAddr -> title', v2.title === '12 Wattle St, Chermside, QLD');
  t('record.id -> id', v2.id === 'sc_1719900000000');
  // Property
  t('pd-bed/bath/car -> property.beds/baths/cars 3/2/1',
    v2.property.beds === 3 && v2.property.baths === 2 && v2.property.cars === 1);
  t('pd-land -> property.landSize 405', v2.property.landSize === 405);
  t('pd-house -> property.floorSize 120', v2.property.floorSize === 120);
  t('pd-year -> property.yearBuilt 1985', v2.property.yearBuilt === 1985);
  t("pd-type -> property.type 'House'", v2.property.type === 'House');
  t('pd-url -> property.listingUrl', v2.property.listingUrl.indexOf('realestate.com.au') > 0);
  // Checkboxes + toggles
  t("inp-fhb-checked '1' -> purchase.firstHomeBuyer true", v2.purchase.firstHomeBuyer === true);
  t("inp-new-prop-checked '0' -> purchase.newBuild false", v2.purchase.newBuild === false);
  t('renoEnabled -> renovation.enabled true', v2.renovation.enabled === true);
  t('rentEnabled -> costs.rentOverlapEnabled true', v2.costs.rentOverlapEnabled === true);
  // Status mapping (7-value v1 -> 5-value v2)
  t("pd-status 'offered' -> status 'offer'", v2.status === 'offer');
  t('pd-status-date -> statusDate', v2.statusDate === '2026-07-12');
  t('inp-settle-date -> purchase.settlementDate', v2.purchase.settlementDate === '2026-09-15');
  // Agent
  t('ag-* -> agent {agency,name,phone,email}',
    v2.agent.agency === 'Ray White Chermside' && v2.agent.name === 'Jane Agent' &&
    v2.agent.phone === '0400 000 000' && v2.agent.email === 'jane.agent@raywhite.com');
  t('scheme-select -> purchase.scheme', v2.purchase.scheme === 'fhbg');
  // Arrays
  t('dynCostData -> costs.items (2 entries, category kept)',
    v2.costs.items.length === 2 && v2.costs.items[0].name === 'Building & pest' && v2.costs.items[0].category === 'purchase');
  t('renoItemData -> renovation.items (emoji dropped, note kept)',
    v2.renovation.items.length === 1 && v2.renovation.items[0].name === 'Paint interior' &&
    v2.renovation.items[0].amount === 4500 && v2.renovation.items[0].note === 'DIY maybe' &&
    v2.renovation.items[0].emoji === undefined);
  t('keyDates -> tracking.keyDates (id dropped)',
    v2.tracking.keyDates.length === 1 && v2.tracking.keyDates[0].label === 'Offer deadline' &&
    v2.tracking.keyDates[0].id === undefined);
  t('commsLog -> tracking.commsLog (id dropped, text kept)',
    v2.tracking.commsLog.length === 1 && v2.tracking.commsLog[0].text === 'Agent says seller is motivated.' &&
    v2.tracking.commsLog[0].id === undefined);
  // Notes + meta
  t('pd-notes -> notes', v2.notes.indexOf('North-facing') === 0);
  t('record.savedAt -> meta.createdAt/updatedAt',
    v2.meta.createdAt === '2026-07-05T04:22:11.000Z' && v2.meta.updatedAt === '2026-07-05T04:22:11.000Z');
  t('record.hasPhoto -> meta.photoKey = id', v2.meta.photoKey === 'sc_1719900000000');
  // Fields v1 never captured stay at defaults
  t('v1-less fields stay default (income 0s, loan.amount 0, investor false, postcode empty)',
    v2.income.salary === 0 && v2.income.partnerSalary === 0 && v2.income.otherIncome === 0 &&
    v2.loan.amount === 0 && v2.loan.ioYears === 0 && v2.loan.extraMonthly === 0 &&
    v2.purchase.investor === false && v2.address.postcode === '');
  t('clean fixture migration produces no warnings', v2.meta.migrationWarnings.length === 0,
    JSON.stringify(v2.meta.migrationWarnings));

  // Bare state blob (no wrapper) also accepted — title composed from address
  const bare = Schema.fromV1(V1_FIXTURE.state);
  t('bare state blob (no wrapper) maps price too', bare.purchase.price === 850000);
  t('bare blob composes title from street/suburb/state', bare.title === '12 Wattle St, Chermside, QLD', bare.title);
}

// ── Suite 3 — fromV1 garbage tolerance ─────────────────────────────────────
console.log('\nfromV1 garbage tolerance (never throws, always valid):');
{
  const cases = [
    ['empty object {}', {}],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not a scenario'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['wrapper with unparseable state string', { id: 'sc_x', state: '{nope' }],
    ['values full of junk', { values: { 'inp-price': 'abc', 'pd-state': 'Narnia', 'pd-status': 'ghosted' } }],
  ];
  for (const [label, input] of cases) {
    let v2 = null, threw = false;
    try { v2 = Schema.fromV1(input); } catch (e) { threw = true; }
    const res = v2 ? Schema.validate(v2) : { ok: false };
    t('fromV1(' + label + ') does not throw and validates',
      !threw && res.ok === true, threw ? 'THREW' : (res.field + ': ' + res.message));
  }
  const empty = Schema.fromV1({});
  t('fromV1({}) carries migrationWarnings', empty.meta.migrationWarnings.length > 0,
    JSON.stringify(empty.meta.migrationWarnings));
  const junk = Schema.fromV1({ values: { 'inp-price': 'abc', 'pd-state': 'Narnia', 'pd-status': 'ghosted' } });
  t('junk values produce specific warnings (price, state, status)',
    junk.meta.migrationWarnings.length >= 3, JSON.stringify(junk.meta.migrationWarnings));
  t('junk values fall back to defaults (price 0, state empty, status browsing)',
    junk.purchase.price === 0 && junk.address.state === '' && junk.status === 'browsing');
  const clamped = Schema.fromV1({ values: { 'inp-price': '$999,999,999,999' } });
  t('over-range money clamps into validate range (price capped at 100M) + warns',
    clamped.purchase.price === 100000000 && clamped.meta.migrationWarnings.length > 0);
  t("full state name 'Queensland' normalises to 'qld'",
    Schema.fromV1({ values: { 'pd-state': 'Queensland' } }).address.state === 'qld');
}

// ── Suite 4 — validate rejections (each naming the field) ──────────────────
console.log('\nvalidate() strict rejections:');
{
  const base = () => Schema.emptyV2();

  let v = base(); v.hax = 1;
  let r = Schema.validate(v);
  t("unknown top-level key rejected naming 'hax'", r.ok === false && r.field === 'hax', JSON.stringify(r));

  v = base(); v.purchase.hax = 1;
  r = Schema.validate(v);
  t("unknown nested key rejected naming 'purchase.hax'", r.ok === false && r.field === 'purchase.hax', JSON.stringify(r));

  v = base(); v.loan.rate = 99;
  r = Schema.validate(v);
  t("out-of-range rate rejected naming 'loan.rate'", r.ok === false && r.field === 'loan.rate', JSON.stringify(r));

  v = base(); v.purchase.price = 999999999999;
  r = Schema.validate(v);
  t("price > 100M rejected naming 'purchase.price'", r.ok === false && r.field === 'purchase.price', JSON.stringify(r));

  v = base(); v.address.state = 'zz';
  r = Schema.validate(v);
  t("bad state rejected naming 'address.state'", r.ok === false && r.field === 'address.state', JSON.stringify(r));

  v = base(); v.status = 'ghosted';
  r = Schema.validate(v);
  t("bad status rejected naming 'status'", r.ok === false && r.field === 'status', JSON.stringify(r));

  v = base(); v.title = new Array(122).join('x'); // 121 chars
  r = Schema.validate(v);
  t("oversized title (121 chars) rejected naming 'title'", r.ok === false && r.field === 'title', JSON.stringify(r));

  v = base(); v.v = 1;
  r = Schema.validate(v);
  t("wrong version rejected naming 'v'", r.ok === false && r.field === 'v', JSON.stringify(r));

  v = base(); v.costs.items = [{ name: 'ok', amount: 1, category: 'purchase', bogus: true }];
  r = Schema.validate(v);
  t('unknown key inside list item rejected with indexed path',
    r.ok === false && r.field === 'costs.items[0].bogus', JSON.stringify(r));

  v = base(); v.loan.rate = '5.9';
  r = Schema.validate(v);
  t("numeric string '5.9' coerced (clean.loan.rate === 5.9)", r.ok === true && r.clean.loan.rate === 5.9);

  v = base(); delete v.assumptions; delete v.agent;
  r = Schema.validate(v);
  t('missing sections tolerated and default-filled',
    r.ok === true && r.clean.assumptions.growthPct === 0 && r.clean.agent.name === '');

  t('validate(null) rejects at root', Schema.validate(null).ok === false && Schema.validate(null).field === 'root');
}

// ── Suite 5 — round trip ───────────────────────────────────────────────────
console.log('\nRound trip validate(fromV1(fixture)):');
{
  const v2 = Schema.fromV1(V1_FIXTURE);
  const r = Schema.validate(v2);
  t('validate(fromV1(fixture)).ok', r.ok === true, r.ok ? '' : r.field + ': ' + r.message);
  t('clean copy preserves mapped values (price, status, state)',
    r.ok && r.clean.purchase.price === 850000 && r.clean.status === 'offer' && r.clean.address.state === 'qld');
  t('clean is a deep copy (mutating clean does not touch source)', (() => {
    if (!r.ok) return false;
    r.clean.purchase.price = 1;
    r.clean.costs.items.push({ name: 'x', amount: 1, category: 'p' });
    return v2.purchase.price === 850000 && v2.costs.items.length === 2;
  })());
}

// ── Suite 6 — serialize + isOversized ──────────────────────────────────────
console.log('\nserialize / isOversized:');
{
  const v2 = Schema.fromV1(V1_FIXTURE);
  const s = Schema.serialize(v2);
  t('serialize returns parseable JSON', typeof s === 'string' && JSON.parse(s).v === 2);
  const kb = Math.round(Schema.byteSize(s) / 102.4) / 10;
  t('migrated v2 record is small (~2-4 KB, well under 32 KB default): ' + kb + ' KB',
    !Schema.isOversized(v2) && Schema.byteSize(s) < 8192, Schema.byteSize(s) + ' bytes');
  t('isOversized true when maxBytes tiny (10 bytes)', Schema.isOversized(v2, 10) === true);
  t('isOversized false at exact boundary (size === max)',
    Schema.isOversized(v2, Schema.byteSize(s)) === false);
  t('isOversized accepts a pre-serialized string', Schema.isOversized(s, 10) === true && Schema.isOversized(s) === false);
  t('multi-byte characters counted as UTF-8 bytes', Schema.byteSize('€') === 3); // euro sign = 3 bytes
  t('isOversized(circular) returns true instead of throwing', (() => {
    const c = {}; c.self = c;
    try { return Schema.isOversized(c) === true; } catch (e) { return false; }
  })());
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
  console.error(failed + ' assertion(s) FAILED');
  process.exit(1);
} else {
  console.log('All scenario-schema tests passed.');
  process.exit(0);
}

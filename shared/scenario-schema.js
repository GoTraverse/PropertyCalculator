/**
 * scenario-schema.js — Scenario v2 typed schema (shared browser + Node module).
 *
 * Architecture-B step 3a. The v1 scenario blob is a raw DOM dump keyed by
 * element ids (app.js collectCurrentState()) — opaque, untyped, and coupled to
 * the app's markup. v2 is a small typed object (~2-4 KB serialized vs the
 * 2 MB v1 ceiling) that both the browser (window.ScenarioSchema) and Netlify
 * functions (require('../../shared/scenario-schema')) share, so client and
 * server validate with byte-identical rules.
 *
 * Exports:
 *   V2_VERSION            — 2
 *   emptyV2()             — canonical fully-populated default v2 object
 *   fromV1(v1blob)        — lossy-but-never-throws v1 -> v2 migration
 *   validate(v2)          — {ok:true, clean} | {ok:false, field, message}
 *   serialize(v2)         — JSON string
 *   isOversized(v2, max)  — UTF-8 byte-size guard (default 32 KB)
 *   STATES / STATUSES     — enums (state codes match portfolio.js)
 *
 * ── V1 -> V2 FIELD MAP ──────────────────────────────────────────────────────
 * Derived from app.js collectCurrentState() (the authoritative v1 field list)
 * and app.html labels, July 2026. "values" ids first:
 *
 *   // v1 'inp-price'            -> purchase.price          (Purchase Price $)
 *   // v1 'inp-savings'          -> purchase.savings        (Your Savings $)
 *   // v1 'inp-depp'             -> purchase.depositPct     (Deposit %)
 *   // v1 'inp-govt'             -> purchase.govtSchemePct  (Govt Scheme % — a PERCENT of price, not $)
 *   // v1 'scheme-select'        -> purchase.scheme         (admin-configured scheme id)
 *   // v1 'inp-fhb-checked'      -> purchase.firstHomeBuyer ('1'/'0' checkbox -> boolean)
 *   // v1 'inp-new-prop-checked' -> purchase.newBuild       ('1'/'0' checkbox -> boolean)
 *   // v1 'inp-settle-date'      -> purchase.settlementDate (date input, yyyy-mm-dd; the
 *   //                              canonical settlementMonths stays a forward-planning field)
 *   // v1 'inp-rate'             -> loan.rate               (Interest Rate %)
 *   // v1 'inp-term'             -> loan.termYears          (Loan Term years)
 *   // v1 'inp-offset'           -> loan.offsetBalance      (Offset Account $)
 *   // v1 'inp-rent'             -> costs.currentRentWeekly (Current Rent/wk — rent the BUYER
 *   //                              PAYS today for the settlement-overlap cost model. NOT
 *   //                              rental income; income.weeklyRent stays 0 from v1.)
 *   // v1 'inp-weeks'            -> costs.rentOverlapWeeks  (Overlap Weeks, 0-26 in the UI)
 *   // v1 'rentEnabled'          -> costs.rentOverlapEnabled (rent-overlap section modelled;
 *   //                              v1 semantics: absent means true)
 *   // v1 'inp-cont'             -> renovation.contingencyPct (Contingency % applied to reno total)
 *   // v1 'renoEnabled'          -> renovation.enabled      (reno module on; absent means true)
 *   // v1 'inp-state'            -> address.state           (fallback when 'pd-state' empty;
 *   //                              select values nsw|vic|qld|sa|wa|tas|act|nt)
 *   // v1 'pd-address'           -> address.street
 *   // v1 'pd-suburb'            -> address.suburb
 *   // v1 'pd-state'             -> address.state           (free-text, e.g. "QLD" — normalised
 *   //                              to lowercase code; full state names also recognised)
 *   // v1 'pd-bed'               -> property.beds
 *   // v1 'pd-bath'              -> property.baths
 *   // v1 'pd-car'               -> property.cars
 *   // v1 'pd-land'              -> property.landSize       (m2)
 *   // v1 'pd-house'             -> property.floorSize      (House Size m2)
 *   // v1 'pd-year'              -> property.yearBuilt
 *   // v1 'pd-type'              -> property.type           (hidden input, 'House' etc.)
 *   // v1 'pd-url'               -> property.listingUrl
 *   // v1 'pd-notes'             -> notes                   (capped 500; truncation warned)
 *   // v1 'pd-status'            -> status                  (7-value v1 enum -> 5-value v2 enum:
 *   //                              browsing->browsing, for-sale/auction->shortlist,
 *   //                              offered/under-offer->offer, unconditional->settled, sold->sold)
 *   // v1 'pd-status-date'       -> statusDate              (Auction / Offer date)
 *   // v1 'ag-agency'            -> agent.agency
 *   // v1 'ag-name'              -> agent.name
 *   // v1 'ag-phone'             -> agent.phone
 *   // v1 'ag-email'             -> agent.email
 *
 * v1 sibling arrays (same collectCurrentState() return object):
 *   // v1 dynCostData[]  {name,amount,category} -> costs.items[]      (same three keys)
 *   // v1 renoItemData[] {emoji,name,amount,note} -> renovation.items[] {name,amount,note}
 *   // v1 keyDates[]     {id,date,label}        -> tracking.keyDates[] {date,label}
 *   // v1 commsLog[]     {id,date,type,text}    -> tracking.commsLog[] {date,type,text}
 *
 * v1 library-record wrapper (scenarios.js index entry / save payload), when
 * fromV1 is handed the whole record rather than the bare state blob:
 *   // v1 record.id       -> id
 *   // v1 record.fullAddr -> title
 *   // v1 record.savedAt  -> meta.createdAt + meta.updatedAt
 *   // v1 record.hasPhoto -> meta.photoKey (set to the scenario id — photos live at
 *   //                       scenarios:<uid>:photo:<id>, keyed by id)
 *   // v1 record.status   -> status (fallback when values['pd-status'] absent)
 *
 * ── DELIBERATELY DROPPED from v1 (and why) ─────────────────────────────────
 *   'pd-type-label'        — prop-type button TEXT incl. its emoji prefix; pure UI
 *                            duplicate of 'pd-type' (only used to re-highlight the button).
 *                            Used only as a derivation fallback when 'pd-type' is empty.
 *   renoItemData[].emoji   — decorative bullet icon, non-financial display state.
 *   keyDates[].id,
 *   commsLog[].id          — DOM list keys ('kd-<ts>'/'cm-<ts>'), regenerated on render.
 *   record.addrKey         — lowercase derivative of fullAddr, recomputed on demand.
 *   record.timestamp       — display string ('dd/mm/yyyy hh:mm'); meta carries ISO savedAt.
 *   record.thumb           — image data URL; photo payloads live in the photo store,
 *                            referenced by meta.photoKey, never inside the schema.
 *   record.exportCount     — server/index-level counter, not scenario content.
 *   record.bed/bath/car/
 *   record.price/type      — index-card duplicates of values already mapped above.
 *   (No style.display / button-text state is captured by collectCurrentState()
 *    beyond renoEnabled/rentEnabled, which ARE model state and are kept.)
 *
 * Fields v2 defines that v1 never captured (defaults until the app writes them):
 *   address.postcode, purchase.settlementMonths, purchase.investor, loan.amount,
 *   loan.ioYears, loan.extraMonthly, income.* (salary/partnerSalary/weeklyRent/
 *   otherIncome), costs.councilRates/water/insurance/maintenance/strata/mgmtPct/
 *   other, renovation.budget, assumptions.* (the app layer applies its own
 *   economic defaults — the schema stays opinion-free at 0).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ScenarioSchema = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var V2_VERSION = 2;
  var STATES   = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
  var STATUSES = ['browsing', 'shortlist', 'offer', 'settled', 'sold'];

  // Full state names -> codes ('pd-state' is a free-text input, placeholder "QLD").
  var STATE_NAMES = {
    'new south wales': 'nsw', 'victoria': 'vic', 'queensland': 'qld',
    'south australia': 'sa', 'western australia': 'wa', 'tasmania': 'tas',
    'australian capital territory': 'act', 'northern territory': 'nt'
  };

  // v1 7-value status enum (scenarios.js VALID_STATUSES) -> v2 5-value enum.
  var V1_STATUS_MAP = {
    'browsing': 'browsing',
    'for-sale': 'shortlist',
    'auction': 'shortlist',
    'offered': 'offer',
    'under-offer': 'offer',
    'unconditional': 'settled',
    'sold': 'sold'
  };

  // ── Schema descriptor ────────────────────────────────────────────────────
  // Every legal key, its type, and its bounds. validate() walks this
  // recursively: unknown keys reject, out-of-range numbers reject, over-cap
  // strings reject. emptyV2() derives the canonical defaults from it, so the
  // two can never drift apart.
  var SPEC = {
    v:     { t: 'const', value: V2_VERSION },
    id:    { t: 'str', max: 60 },
    title: { t: 'str', max: 120 },
    address: { t: 'obj', fields: {
      street:   { t: 'str', max: 120 },
      suburb:   { t: 'str', max: 80 },
      state:    { t: 'enum', vals: STATES, allowEmpty: true },
      postcode: { t: 'str', max: 10 }
    } },
    status:     { t: 'enum', vals: STATUSES },
    statusDate: { t: 'str', max: 20 },
    property: { t: 'obj', fields: {
      type:       { t: 'str', max: 40 },
      beds:       { t: 'num', min: 0, max: 20 },
      baths:      { t: 'num', min: 0, max: 20 },
      cars:       { t: 'num', min: 0, max: 20 },
      landSize:   { t: 'num', min: 0, max: 1000000 },
      floorSize:  { t: 'num', min: 0, max: 100000 },
      yearBuilt:  { t: 'num', min: 0, max: 2100 },
      listingUrl: { t: 'str', max: 300 }
    } },
    purchase: { t: 'obj', fields: {
      price:            { t: 'num', min: 0, max: 100000000 },
      depositPct:       { t: 'num', min: 0, max: 100 },
      settlementMonths: { t: 'num', min: 0, max: 60 },
      settlementDate:   { t: 'str', max: 20 },
      firstHomeBuyer:   { t: 'bool' },
      newBuild:         { t: 'bool' },
      investor:         { t: 'bool' },
      savings:          { t: 'num', min: 0, max: 1000000000 },
      govtSchemePct:    { t: 'num', min: 0, max: 100 },
      scheme:           { t: 'str', max: 60 }
    } },
    loan: { t: 'obj', fields: {
      amount:        { t: 'num', min: 0, max: 100000000 },
      rate:          { t: 'num', min: 0, max: 25 },
      termYears:     { t: 'num', min: 0, max: 50 },
      ioYears:       { t: 'num', min: 0, max: 15 },
      offsetBalance: { t: 'num', min: 0, max: 100000000 },
      extraMonthly:  { t: 'num', min: 0, max: 1000000 }
    } },
    income: { t: 'obj', fields: {
      salary:        { t: 'num', min: 0, max: 10000000 },
      partnerSalary: { t: 'num', min: 0, max: 10000000 },
      weeklyRent:    { t: 'num', min: 0, max: 100000 },
      otherIncome:   { t: 'num', min: 0, max: 10000000 }
    } },
    costs: { t: 'obj', fields: {
      councilRates:       { t: 'num', min: 0, max: 1000000 },
      water:              { t: 'num', min: 0, max: 1000000 },
      insurance:          { t: 'num', min: 0, max: 1000000 },
      maintenance:        { t: 'num', min: 0, max: 1000000 },
      strata:             { t: 'num', min: 0, max: 1000000 },
      mgmtPct:            { t: 'num', min: 0, max: 100 },
      other:              { t: 'num', min: 0, max: 1000000 },
      currentRentWeekly:  { t: 'num', min: 0, max: 100000 },
      rentOverlapWeeks:   { t: 'num', min: 0, max: 52 },
      rentOverlapEnabled: { t: 'bool' },
      items: { t: 'list', max: 50, item: { t: 'obj', fields: {
        name:     { t: 'str', max: 80 },
        amount:   { t: 'num', min: 0, max: 10000000 },
        category: { t: 'str', max: 30 }
      } } }
    } },
    renovation: { t: 'obj', fields: {
      budget:         { t: 'num', min: 0, max: 100000000 },
      contingencyPct: { t: 'num', min: 0, max: 100 },
      enabled:        { t: 'bool' },
      items: { t: 'list', max: 50, item: { t: 'obj', fields: {
        name:   { t: 'str', max: 80 },
        amount: { t: 'num', min: 0, max: 10000000 },
        note:   { t: 'str', max: 200 }
      } } }
    } },
    assumptions: { t: 'obj', fields: {
      growthPct:     { t: 'num', min: -25, max: 25 },
      rentGrowthPct: { t: 'num', min: -25, max: 25 },
      inflationPct:  { t: 'num', min: -25, max: 25 }
    } },
    agent: { t: 'obj', fields: {
      agency: { t: 'str', max: 80 },
      name:   { t: 'str', max: 80 },
      phone:  { t: 'str', max: 40 },
      email:  { t: 'str', max: 120 }
    } },
    tracking: { t: 'obj', fields: {
      keyDates: { t: 'list', max: 100, item: { t: 'obj', fields: {
        date:  { t: 'str', max: 20 },
        label: { t: 'str', max: 120 }
      } } },
      commsLog: { t: 'list', max: 200, item: { t: 'obj', fields: {
        date: { t: 'str', max: 20 },
        type: { t: 'str', max: 40 },
        text: { t: 'str', max: 500 }
      } } }
    } },
    notes: { t: 'str', max: 500 },
    meta: { t: 'obj', fields: {
      createdAt: { t: 'str', max: 30 },
      updatedAt: { t: 'str', max: 30 },
      photoKey:  { t: 'str', max: 60 },
      migrationWarnings: { t: 'list', max: 20, item: { t: 'str', max: 200 } }
    } }
  };

  // ── Small utilities ──────────────────────────────────────────────────────
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // "$1,234,567" / " 850 000 " / 850000 -> 1234567 / 850000 / 850000.
  // Returns null when unusable (caller decides the default).
  function parseMoney(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var s = String(v).replace(/[$,\s]/g, '');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  // UTF-8 byte length that works in Node and every browser.
  function byteSize(str) {
    if (typeof str !== 'string') return 0;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    var m = encodeURIComponent(str).match(/%[0-9A-F]{2}|./gi);
    return m ? m.length : 0;
  }

  // ── emptyV2 ──────────────────────────────────────────────────────────────
  function defaultsOf(spec) {
    var k, o;
    if (spec.t === 'const') return spec.value;
    if (spec.t === 'str') return '';
    if (spec.t === 'num') return 0;
    if (spec.t === 'bool') return false;
    if (spec.t === 'enum') return spec.allowEmpty ? '' : spec.vals[0];
    if (spec.t === 'list') return [];
    if (spec.t === 'obj') {
      o = {};
      for (k in spec.fields) {
        if (spec.fields.hasOwnProperty(k)) o[k] = defaultsOf(spec.fields[k]);
      }
      return o;
    }
    return null;
  }

  function emptyV2() {
    var o = {}, k;
    for (k in SPEC) {
      if (SPEC.hasOwnProperty(k)) o[k] = defaultsOf(SPEC[k]);
    }
    return o;
  }

  // ── validate ─────────────────────────────────────────────────────────────
  // Strict: unknown keys reject, out-of-range numbers reject, over-cap strings
  // reject — always naming the offending field. Missing fields are tolerated
  // (filled with defaults). Returns a cleaned deep copy on success. fromV1()
  // is the lenient path (it clamps + warns), so validate(fromV1(x)).ok is
  // guaranteed for any input x.
  function cleanNode(input, spec, path) {
    var i, k, res, out, s, n, ev, childPath;

    if (spec.t === 'const') {
      if (input === undefined || input === null) return { value: spec.value };
      if (Number(input) !== spec.value) return { field: path, message: 'must be ' + spec.value };
      return { value: spec.value };
    }

    if (spec.t === 'str') {
      if (input === undefined || input === null) return { value: '' };
      if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
        return { field: path, message: 'must be a string' };
      }
      s = String(input).replace(/^\s+|\s+$/g, '');
      if (s.length > spec.max) return { field: path, message: 'too long (max ' + spec.max + ' characters)' };
      return { value: s };
    }

    if (spec.t === 'num') {
      if (input === undefined || input === null || input === '') return { value: 0 };
      n = (typeof input === 'number') ? input : Number(String(input).replace(/^\s+|\s+$/g, ''));
      if (typeof n !== 'number' || !isFinite(n)) return { field: path, message: 'must be a number' };
      if (n < spec.min || n > spec.max) {
        return { field: path, message: 'out of range (' + spec.min + ' to ' + spec.max + ')' };
      }
      return { value: n };
    }

    if (spec.t === 'bool') {
      if (input === undefined || input === null || input === '') return { value: false };
      if (input === false || input === 0 || input === '0' || input === 'false') return { value: false };
      return { value: true };
    }

    if (spec.t === 'enum') {
      if (input === undefined || input === null || input === '') {
        return { value: spec.allowEmpty ? '' : spec.vals[0] };
      }
      if (typeof input !== 'string') return { field: path, message: 'must be one of ' + spec.vals.join('|') };
      ev = input.toLowerCase().replace(/^\s+|\s+$/g, '');
      if (ev === '' && spec.allowEmpty) return { value: '' };
      if (spec.vals.indexOf(ev) < 0) return { field: path, message: 'must be one of ' + spec.vals.join('|') };
      return { value: ev };
    }

    if (spec.t === 'list') {
      if (input === undefined || input === null) return { value: [] };
      if (!Array.isArray(input)) return { field: path, message: 'must be an array' };
      if (input.length > spec.max) return { field: path, message: 'too many entries (max ' + spec.max + ')' };
      out = [];
      for (i = 0; i < input.length; i++) {
        res = cleanNode(input[i], spec.item, path + '[' + i + ']');
        if (res.field) return res;
        out.push(res.value);
      }
      return { value: out };
    }

    if (spec.t === 'obj') {
      if (input === undefined || input === null) input = {};
      if (!isPlainObject(input)) return { field: path, message: 'must be an object' };
      for (k in input) {
        if (!input.hasOwnProperty(k)) continue;
        if (!spec.fields.hasOwnProperty(k)) {
          childPath = path ? path + '.' + k : k;
          return { field: childPath, message: 'Unknown field: ' + childPath };
        }
      }
      out = {};
      for (k in spec.fields) {
        if (!spec.fields.hasOwnProperty(k)) continue;
        childPath = path ? path + '.' + k : k;
        res = cleanNode(input[k], spec.fields[k], childPath);
        if (res.field) return res;
        out[k] = res.value;
      }
      return { value: out };
    }

    return { field: path, message: 'unknown spec type' };
  }

  function validate(v2) {
    if (!isPlainObject(v2)) return { ok: false, field: 'root', message: 'scenario object required' };
    var res = cleanNode(v2, { t: 'obj', fields: SPEC }, '');
    if (res.field) return { ok: false, field: res.field, message: res.message };
    return { ok: true, clean: res.value };
  }

  // ── fromV1 ───────────────────────────────────────────────────────────────
  // Pure conversion of a v1 record to v2. NEVER throws — garbage in produces
  // a valid default v2 with meta.migrationWarnings[] explaining what was lost.
  // Accepts either the library-record wrapper ({id, fullAddr, savedAt,
  // state:{values,...}} — state may still be a JSON string when read raw from
  // Redis) or the bare collectCurrentState() blob ({values,...}).
  function fromV1(v1) {
    var out = emptyV2();
    var warnings = out.meta.migrationWarnings; // same array instance — pushes land in out

    function warnPush(msg) {
      if (warnings.length < 20) warnings.push(String(msg).slice(0, 200));
    }

    try {
      if (!isPlainObject(v1)) {
        warnPush('v1 input was not an object — defaults used');
        return out;
      }

      // Wrapper vs bare-blob detection.
      var rec = null, st = null;
      if (isPlainObject(v1.values) || Array.isArray(v1.dynCostData)) {
        st = v1; // bare collectCurrentState() blob
      } else if (v1.state !== undefined) {
        rec = v1;
        if (typeof v1.state === 'string') {
          try { st = JSON.parse(v1.state); } catch (e) { warnPush('v1 state string could not be parsed'); }
        } else if (isPlainObject(v1.state)) {
          st = v1.state;
        }
        if (!isPlainObject(st)) { st = {}; }
      } else {
        st = v1; // unknown shape — treated as (probably empty) blob
      }

      var values = isPlainObject(st.values) ? st.values : null;
      var hasValues = !!values;
      if (!hasValues) {
        warnPush('No v1 values map found — defaults used');
        values = {};
      }

      // Lenient field readers — clamp + warn instead of rejecting.
      function num(id, min, max) {
        var raw = values[id];
        var n = parseMoney(raw);
        if (n === null) {
          if (raw !== undefined && raw !== null && String(raw).replace(/^\s+|\s+$/g, '') !== '') {
            warnPush("Could not parse '" + id + "' — 0 used");
          }
          return 0;
        }
        if (n < min) { warnPush("'" + id + "' below range — clamped to " + min); return min; }
        if (n > max) { warnPush("'" + id + "' above range — clamped to " + max); return max; }
        return n;
      }
      function str(id, max) {
        var raw = values[id];
        if (raw === undefined || raw === null) return '';
        var s = String(raw).replace(/^\s+|\s+$/g, '');
        if (s.length > max) {
          warnPush("'" + id + "' truncated to " + max + ' characters');
          s = s.slice(0, max);
        }
        return s;
      }
      function checked(id) {
        var raw = values[id];
        return raw === '1' || raw === 1 || raw === true;
      }
      function itemStr(v, max) {
        if (v === undefined || v === null) return '';
        var s = String(v).replace(/^\s+|\s+$/g, '');
        return s.length > max ? s.slice(0, max) : s;
      }
      function itemNum(v, min, max) {
        var n = parseMoney(v);
        if (n === null) return 0;
        if (n < min) return min;
        if (n > max) return max;
        return n;
      }
      function mapList(arr, max, label, fn) {
        var outArr = [], i, it;
        if (!Array.isArray(arr)) return outArr;
        if (arr.length > max) warnPush(label + ' truncated to ' + max + ' entries');
        for (i = 0; i < arr.length && i < max; i++) {
          it = arr[i];
          if (!isPlainObject(it)) continue;
          outArr.push(fn(it));
        }
        return outArr;
      }
      function normState(v) {
        if (v === undefined || v === null || v === '') return '';
        var s = String(v).toLowerCase().replace(/^\s+|\s+$/g, '');
        if (s === '') return '';
        if (STATES.indexOf(s) >= 0) return s;
        if (STATE_NAMES.hasOwnProperty(s)) return STATE_NAMES[s];
        warnPush("Unrecognised state '" + s.slice(0, 20) + "' — left blank");
        return '';
      }

      // Identity + title
      if (rec && rec.id !== undefined && rec.id !== null) out.id = String(rec.id).slice(0, 60);
      var street = str('pd-address', 120);
      var suburb = str('pd-suburb', 80);
      out.address.street = street;
      out.address.suburb = suburb;
      out.address.state = normState(values['pd-state'] !== undefined && values['pd-state'] !== '' ? values['pd-state'] : values['inp-state']);
      // postcode: not captured by v1 — stays ''.

      var title = (rec && rec.fullAddr) ? String(rec.fullAddr).replace(/^\s+|\s+$/g, '') : '';
      if (!title) {
        var parts = [];
        if (street) parts.push(street);
        if (suburb) parts.push(suburb);
        if (out.address.state) parts.push(out.address.state.toUpperCase());
        title = parts.join(', ');
      }
      if (title.length > 120) { warnPush('Title truncated to 120 characters'); title = title.slice(0, 120); }
      out.title = title;

      // Status (v1 7-value enum -> v2 5-value enum)
      var rawStatus = values['pd-status'] || (rec && rec.status) || 'browsing';
      var mappedStatus = V1_STATUS_MAP[String(rawStatus).toLowerCase().replace(/^\s+|\s+$/g, '')];
      if (!mappedStatus) {
        warnPush("Unrecognised v1 status '" + String(rawStatus).slice(0, 20) + "' — 'browsing' used");
        mappedStatus = 'browsing';
      }
      out.status = mappedStatus;
      out.statusDate = str('pd-status-date', 20);

      // Property
      var pType = str('pd-type', 40);
      if (!pType && values['pd-type-label']) {
        // Fallback only: strip the emoji prefix off the button label.
        pType = itemStr(String(values['pd-type-label']).replace(/[^\x20-\x7E]/g, ''), 40);
      }
      out.property.type = pType;
      out.property.beds = num('pd-bed', 0, 20);
      out.property.baths = num('pd-bath', 0, 20);
      out.property.cars = num('pd-car', 0, 20);
      out.property.landSize = num('pd-land', 0, 1000000);
      out.property.floorSize = num('pd-house', 0, 100000);
      out.property.yearBuilt = num('pd-year', 0, 2100);
      out.property.listingUrl = str('pd-url', 300);

      // Purchase
      out.purchase.price = num('inp-price', 0, 100000000);
      out.purchase.depositPct = num('inp-depp', 0, 100);
      out.purchase.settlementDate = str('inp-settle-date', 20);
      out.purchase.firstHomeBuyer = checked('inp-fhb-checked');
      out.purchase.newBuild = checked('inp-new-prop-checked');
      out.purchase.savings = num('inp-savings', 0, 1000000000);
      out.purchase.govtSchemePct = num('inp-govt', 0, 100);
      out.purchase.scheme = str('scheme-select', 60);
      // investor + settlementMonths: no v1 source — stay at defaults.

      // Loan
      out.loan.rate = num('inp-rate', 0, 25);
      out.loan.termYears = num('inp-term', 0, 50);
      out.loan.offsetBalance = num('inp-offset', 0, 100000000);
      // amount / ioYears / extraMonthly: no v1 source — stay at defaults.

      // Income: v1 captures none. NOTE: 'inp-rent' is the rent the buyer PAYS
      // today (overlap cost), not rental income — it maps to costs below.

      // Costs
      out.costs.currentRentWeekly = num('inp-rent', 0, 100000);
      out.costs.rentOverlapWeeks = num('inp-weeks', 0, 52);
      // v1 semantics (applyScenarioState): absent means enabled.
      out.costs.rentOverlapEnabled = hasValues ? values['rentEnabled'] !== false && values['rentEnabled'] !== 'false' : false;
      out.costs.items = mapList(st.dynCostData, 50, 'Purchase costs', function (c) {
        return {
          name: itemStr(c.name, 80),
          amount: itemNum(c.amount, 0, 10000000),
          category: itemStr(c.category, 30) || 'purchase'
        };
      });

      // Renovation (emoji deliberately dropped — decorative)
      out.renovation.contingencyPct = num('inp-cont', 0, 100);
      out.renovation.enabled = hasValues ? values['renoEnabled'] !== false && values['renoEnabled'] !== 'false' : false;
      out.renovation.items = mapList(st.renoItemData, 50, 'Renovation items', function (r) {
        return {
          name: itemStr(r.name, 80),
          amount: itemNum(r.amount, 0, 10000000),
          note: itemStr(r.note, 200)
        };
      });

      // Agent
      out.agent.agency = str('ag-agency', 80);
      out.agent.name = str('ag-name', 80);
      out.agent.phone = str('ag-phone', 40);
      out.agent.email = str('ag-email', 120);

      // Tracking (ids deliberately dropped — DOM list keys)
      out.tracking.keyDates = mapList(st.keyDates, 100, 'Key dates', function (d) {
        return { date: itemStr(d.date, 20), label: itemStr(d.label, 120) };
      });
      out.tracking.commsLog = mapList(st.commsLog, 200, 'Comms log', function (c) {
        return { date: itemStr(c.date, 20), type: itemStr(c.type, 40), text: itemStr(c.text, 500) };
      });

      // Notes
      out.notes = str('pd-notes', 500);

      // Meta
      if (rec && rec.savedAt) {
        var savedAt = String(rec.savedAt).slice(0, 30);
        out.meta.createdAt = savedAt;
        out.meta.updatedAt = savedAt;
      }
      if (rec && rec.hasPhoto && rec.id) out.meta.photoKey = String(rec.id).slice(0, 60);

      return out;
    } catch (e) {
      // Absolute backstop — fromV1 must never throw.
      var safe = emptyV2();
      safe.meta.migrationWarnings.push('v1 migration failed (' + String(e && e.message).slice(0, 120) + ') — defaults used');
      return safe;
    }
  }

  // ── serialize + size guard ───────────────────────────────────────────────
  function serialize(v2) {
    return JSON.stringify(v2);
  }

  // v2 records serialize to ~2-4 KB; 32 KB default leaves generous headroom
  // (vs the 2 MB v1 blob ceiling the backend has to tolerate until cutover).
  function isOversized(v2, maxBytes) {
    var limit = (typeof maxBytes === 'number' && isFinite(maxBytes) && maxBytes > 0) ? maxBytes : 32768;
    var s;
    try {
      s = (typeof v2 === 'string') ? v2 : serialize(v2);
    } catch (e) {
      return true; // unserialisable (circular etc.) — treat as oversized/reject
    }
    if (typeof s !== 'string') return true;
    return byteSize(s) > limit;
  }

  return {
    V2_VERSION: V2_VERSION,
    STATES: STATES,
    STATUSES: STATUSES,
    emptyV2: emptyV2,
    fromV1: fromV1,
    validate: validate,
    serialize: serialize,
    isOversized: isOversized,
    byteSize: byteSize
  };
});

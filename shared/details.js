/**
 * shared/details.js — "your details": the facts a visitor gives about
 * themselves, kept once and read by the First Home Journey, the calculators
 * and the property workup. One file for the browser (window.Details) and for
 * Node and the Netlify functions (require('../../shared/details')), like
 * shared/scenario-schema.js. Build plan for TODO item 50, section 2.
 *
 * ── Where it lives ──────────────────────────────────────────────────────────
 *   Browser  localStorage 'propCalc_details_v1'
 *            { v: 1, owner: '' | '<user id>', linked: 0 | 1,
 *              f: { <field>: { v, at, by } }, dirty: [<field>...],
 *              seen: <account updatedAt>, mig: 0 | 1,
 *              pulled: <ms of the last account read>, replaced: [...] }
 *            owner   the account the record belongs to. Anything written
 *                    while signed in belongs to that account at once, even
 *                    before the account copy has been read.
 *            linked  1 once the record has been merged with the account
 *                    copy. Until then nothing is sent.
 *   Account  Redis 'details:<email>' { f: { <field>: { v, at, by } }, updatedAt },
 *            at most MAX_BYTES (4 KB). Written only by detailsPut in
 *            netlify/functions/journey.js, which merges field by field.
 *
 *   v   the value, or null when the visitor cleared it (a tombstone, so the
 *       clear wins over older copies).
 *   at  when it was entered, in ms (client clock; the server clamps it to its
 *       own time plus CLOCK_SKEW_MS).
 *   by  'journey' | 'app' | 'import' | 'tool:<slug>'. 'shared' (a value read
 *       from a partner's shared journey) is only ever returned, never stored.
 *
 *   A field exists only once the visitor has given it. Page defaults,
 *   examples, time-zone guesses and live-rate suggestions are never written.
 *
 * ── Who may overwrite a value (class) ───────────────────────────────────────
 *   P  person facts: any page, on an edit the visitor made. Newest wins.
 *   S  seeded: the Journey and the workup's "Your details" box always; a
 *      calculator, or the workup with { fill: true }, only when the field is
 *      empty (absent or cleared). A what-if on a calculator never moves the
 *      Journey.
 *   J  the Journey only.
 *   L  calculators and the workup.
 *   { force: true } skips the class rule. Only undo() and clearAll() use it:
 *   both are the visitor asking for exactly that value.
 *
 * ── Conflict rule ───────────────────────────────────────────────────────────
 *   One value per field: the newest `at` wins. On the server a tie keeps the
 *   stored value. When a browser reads the account copy, a tie takes the
 *   account's value, so every device settles on the same one. A local value
 *   newer than the account's is marked dirty again on every read, so a push
 *   lost to a race is sent again.
 *
 * ── Pure API (browser and Node) ─────────────────────────────────────────────
 *   FIELDS, NAMES, KEY, VERSION, MAX_BYTES, CLOCK_SKEW_MS, PUSH_DELAY_MS
 *   cleanValue(name, v)            → { ok, v }
 *   cleanEntry(name, e)            → { v, at, by } | null
 *   normalizeFields(f), normalize(rec), accountRecord(rec)
 *   writeField(f, name, v, by, { at, fill, force }) → { f, changed, refused }
 *   mergeFields(base, incoming, { tie: 'incoming' }) → { f, changed }
 *   clampAt(at, now), serverMerge(storedF, incomingF, now), fitsCap(rec)
 *   MIRROR, MIRROR_FIELDS, journeyValue(S, name, opts), fromJourney(S, opts),
 *   applyToJourney(S, name, v, at), journeyFacts(S, opts),
 *   planReconcile(S, f, opts) → { toJourney, toDetails, mark }
 *   fromDraft(draft), migrateInto(rec, storage, sessionId)
 *   optionValue(name, raw), toOption(name, v, optionValues)
 *   monthlyFromWeekly(w), weeklyFromMonthly(m)
 *   fieldLabel, formatValue, sourceLabel, dateLabel, sourceText, changeLine
 *     (plain text: put it in with textContent, or through escHtml())
 *   createRuntime(env)             → the browser runtime below, for tests
 *
 * ── Browser runtime (window.Details, started when the script loads) ─────────
 *   get(name) → value | undefined     entry(name) → { v, at, by } | null
 *   all() → { name: entry }           set(name, v, by, opts) → { ok, changes, reason }
 *   clear(name, by, opts)             clearAll(by)
 *   undo(change, by)                  onChange(fn) → unsubscribe
 *   pull(force), flush({ keepalive }), whenSynced(), unsent(), forget()
 *   takeReplaced()                    partner()
 *   A change event is { source: 'local' | 'account' | 'other-tab' | 'shared',
 *   changes: [{ field, from: entry | null, to: entry | null }] }.
 *
 *   Signed in, the runtime reads the account copy on load (at most every
 *   PULL_EVERY_MS), merges it, and sends changed fields PUSH_DELAY_MS after an
 *   edit. A send that fails for a reason that may pass is tried again after
 *   5 s and 30 s (RETRY_MS), and when the browser comes back online or the
 *   tab is shown again; on pagehide anything unsent goes with keepalive.
 *   If that first read fails, an edit still
 *   makes the record the account's (so sign-out removes it, and warns that it
 *   wasn't sent); the next push reads the account copy first. Guests:
 *   localStorage only, nothing is sent. A record that belongs to another
 *   account, or to an account while nobody is signed in, is dropped.
 *   Partners on a shared journey ('propCalc_journey_collab' set) read the
 *   mirrored fields from the local copy of the shared journey, labelled
 *   'shared', and set() on a mirrored field does nothing; the owner's record
 *   is never read or written.
 *
 * ── Privacy ─────────────────────────────────────────────────────────────────
 *   Values go to localStorage and, signed in, in the POST body to
 *   /.netlify/functions/journey. Never in a URL, an analytics event, a log
 *   line or an error report. This file has no tracking and logs nothing.
 *
 * ── Versioning ──────────────────────────────────────────────────────────────
 *   v: 1. New fields are added to FIELDS (and MIRROR if the Journey holds
 *   them); nothing is renamed. normalize() drops unknown fields. The server
 *   never deletes a field it was not sent, so an older cached copy of this
 *   file cannot wipe a newer field from the account. A stored record with a
 *   higher version makes the runtime read-only.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Details = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var VERSION = 1;
  var KEY = 'propCalc_details_v1';
  var JOURNEY_KEY = 'propCalc_journey_v1';
  var JOURNEY_OWNER_KEY = 'propCalc_journey_owner';
  var COLLAB_KEY = 'propCalc_journey_collab';
  var DRAFT_KEY = 'propCalc_draft_v1';
  var SESSION_KEY = 'propCalc_session_v1';
  var ENDPOINT = '/.netlify/functions/journey';
  var MAX_BYTES = 4096;
  var CLOCK_SKEW_MS = 60000;
  var PUSH_DELAY_MS = 1500;
  // Pages opened within this long of the last account read don't read again
  // (moving between calculators). Short enough that a second device sees an
  // edit by the time someone picks it up.
  var PULL_EVERY_MS = 10000;
  var MAX_AT = 1e14;
  // After a send fails for a reason that may pass (offline, the hourly
  // limit, the server busy or the lock held by another put), it is tried
  // again this long later, then once more, while the page stays open. An
  // edit, the tab coming back or the browser going online starts again.
  var RETRY_MS = [5000, 30000];
  var REPLACED_MAX = 30;
  var BY_RE = /^(journey|app|import|tool:[a-z0-9-]{1,40})$/;

  var STATES = ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt'];
  var EMPLOYMENT = ['payg', 'paygVariable', 'casual', 'self', 'rental'];

  // kind: enum | bool | money (whole dollars) | cents (2 dp) | int | pct1 (1 dp)
  //       | rate2 (2 dp) | money2 / enum2 / bool2 (one per applicant)
  // A number over max is cut to max; under min (money: under 0) is refused.
  var FIELDS = {
    state:         { cls: 'S', kind: 'enum', values: STATES },
    area:          { cls: 'P', kind: 'enum', values: ['capital', 'regional'] },
    firstHome:     { cls: 'S', kind: 'bool' },
    buyers:        { cls: 'P', kind: 'enum', values: ['single', 'couple'] },
    income:        { cls: 'P', kind: 'money', max: 10000000, per: 'year' },
    incomes:       { cls: 'P', kind: 'money2', max: 10000000, per: 'year' },
    employment:    { cls: 'P', kind: 'enum2', values: EMPLOYMENT },
    hecs:          { cls: 'P', kind: 'bool2' },
    dependants:    { cls: 'P', kind: 'int', min: 0, max: 10 },
    cardLimits:    { cls: 'P', kind: 'money', max: 10000000 },
    debtsMonthly:  { cls: 'P', kind: 'money', max: 1000000, per: 'month' },
    livingMonthly: { cls: 'P', kind: 'money', max: 1000000, per: 'month' },
    saved:         { cls: 'P', kind: 'money', max: 100000000 },
    saveMo:        { cls: 'P', kind: 'money', max: 1000000, per: 'month' },
    rentMonthly:   { cls: 'P', kind: 'cents', max: 1000000, per: 'month' },
    build:         { cls: 'S', kind: 'enum', values: ['established', 'new', 'unsure'] },
    occupancy:     { cls: 'S', kind: 'enum', values: ['home', 'invest'] },
    targetPrice:   { cls: 'S', kind: 'money', max: 50000000 },
    maxPrice:      { cls: 'J', kind: 'money', max: 50000000 },
    depositPct:    { cls: 'S', kind: 'pct1', min: 0, max: 100 },
    scheme:        { cls: 'S', kind: 'enum', values: ['none', 'fds', 'h2b'] },
    rate:          { cls: 'S', kind: 'rate2', min: 0, max: 25 },
    termYears:     { cls: 'S', kind: 'int', min: 1, max: 40 },
    lastPrice:     { cls: 'L', kind: 'money', max: 50000000 }
  };
  var NAMES = Object.keys(FIELDS);

  // ── Small helpers ─────────────────────────────────────────────────────────
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function copyEntry(e) { return e ? { v: Array.isArray(e.v) ? e.v.slice() : e.v, at: e.at, by: e.by } : null; }
  function copyFields(f) { var o = {}; for (var k in f) if (own(f, k)) o[k] = copyEntry(f[k]); return o; }
  function num0(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= MAX_AT ? Math.floor(v) : 0; }
  function roundTo(x, dp) { var m = Math.pow(10, dp); return Math.round(x * m) / m; }
  function parseJSON(s) { if (s == null) return null; try { return JSON.parse(s); } catch (e) { return null; } }
  function byteSize(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }
  var BAD = { ok: false };
  function okv(v) { return { ok: true, v: v }; }

  // ── Values ────────────────────────────────────────────────────────────────
  function cleanNumber(v, dp, min, max) {
    if (typeof v !== 'number' || !isFinite(v)) return BAD;
    var x = roundTo(v, dp);
    if (x < min) return BAD;
    if (x > max) x = max;
    return okv(x);
  }
  function cleanOne(F, kind, v) {
    switch (kind) {
      case 'enum': return typeof v === 'string' && F.values.indexOf(v) !== -1 ? okv(v) : BAD;
      case 'bool': return typeof v === 'boolean' ? okv(v) : BAD;
      case 'money': return cleanNumber(v, 0, 0, F.max);
      case 'cents': return cleanNumber(v, 2, 0, F.max);
      case 'int': return cleanNumber(v, 0, F.min, F.max);
      case 'pct1': return cleanNumber(v, 1, F.min, F.max);
      case 'rate2': return cleanNumber(v, 2, F.min, F.max);
    }
    return BAD;
  }
  // The value for `name`, cleaned, or { ok: false }. null is always allowed.
  function cleanValue(name, v) {
    if (!own(FIELDS, name)) return BAD;
    if (v === null) return okv(null);
    var F = FIELDS[name];
    if (F.kind === 'money2' || F.kind === 'enum2' || F.kind === 'bool2') {
      if (!Array.isArray(v) || v.length !== 2) return BAD;
      var each = F.kind === 'money2' ? 'money' : F.kind === 'enum2' ? 'enum' : 'bool';
      var a = cleanOne(F, each, v[0]), b = cleanOne(F, each, v[1]);
      return a.ok && b.ok ? okv([a.v, b.v]) : BAD;
    }
    return cleanOne(F, F.kind, v);
  }
  function sameValue(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    return a === b;
  }
  function isEmpty(e) { return !e || e.v === null; }

  // ── Entries and records ───────────────────────────────────────────────────
  function cleanEntry(name, e) {
    if (!isObj(e)) return null;
    var c = cleanValue(name, e.v);
    if (!c.ok) return null;
    if (typeof e.at !== 'number' || !isFinite(e.at) || e.at < 0 || e.at > MAX_AT) return null;
    if (typeof e.by !== 'string' || !BY_RE.test(e.by)) return null;
    return { v: c.v, at: Math.floor(e.at), by: e.by };
  }
  function normalizeFields(f) {
    var out = {};
    if (!isObj(f)) return out;
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i];
      if (own(f, n)) { var e = cleanEntry(n, f[n]); if (e) out[n] = e; }
    }
    return out;
  }
  function blankRecord() { return { v: VERSION, owner: '', linked: 0, f: {}, dirty: [], seen: 0, mig: 0, pulled: 0, replaced: [] }; }
  // The browser record, with every part checked.
  function normalize(rec) {
    var r = isObj(rec) ? rec : {};
    var out = blankRecord();
    out.owner = typeof r.owner === 'string' ? r.owner.slice(0, 64) : '';
    out.linked = out.owner && r.linked === 1 ? 1 : 0;
    out.f = normalizeFields(r.f);
    var seenN = {};
    (Array.isArray(r.dirty) ? r.dirty : []).forEach(function (n) {
      if (typeof n === 'string' && own(out.f, n) && !seenN[n]) { seenN[n] = true; out.dirty.push(n); }
    });
    out.seen = num0(r.seen);
    out.mig = r.mig === 1 ? 1 : 0;
    out.pulled = num0(r.pulled);
    (Array.isArray(r.replaced) ? r.replaced : []).slice(-REPLACED_MAX).forEach(function (x) {
      if (!isObj(x) || typeof x.n !== 'string') return;
      var e = cleanEntry(x.n, x);
      if (e) out.replaced.push({ n: x.n, v: e.v, at: e.at, by: e.by });
    });
    return out;
  }
  // The account record as the server stores it, or null.
  function accountRecord(rec) {
    if (!isObj(rec)) return null;
    return { f: normalizeFields(rec.f), updatedAt: num0(rec.updatedAt) };
  }
  function fitsCap(rec) {
    var s;
    try { s = JSON.stringify(rec); } catch (e) { return false; }
    return typeof s === 'string' && byteSize(s) <= MAX_BYTES;
  }
  function recordIsEmpty(rec) { return !rec.owner && !Object.keys(rec.f).length; }

  // ── Writing one field (class rules, coupled fields) ───────────────────────
  function mayWrite(name, by, cur, opts) {
    if (opts.force) return '';
    var cls = FIELDS[name].cls;
    var tool = by.indexOf('tool:') === 0;
    if (cls === 'J') return by === 'journey' ? '' : 'journey-only';
    if (cls === 'L') return tool || by === 'app' ? '' : 'not-here';
    if (cls === 'S') {
      var authoritative = by === 'journey' || (by === 'app' && !opts.fill);
      return authoritative || isEmpty(cur) ? '' : 'set';
    }
    return opts.fill && !isEmpty(cur) ? 'set' : '';
  }
  // Pure: the field map after one edit. Never changes `f`. `changed` lists
  // every field that took a new value (coupled fields included); an entry
  // whose value is the same as before is left alone, with its old time.
  function writeField(f, name, value, by, opts) {
    opts = opts || {};
    var out = { f: f, changed: [], refused: '' };
    if (!own(FIELDS, name)) { out.refused = 'unknown'; return out; }
    if (typeof by !== 'string' || !BY_RE.test(by)) { out.refused = 'source'; return out; }
    var c = cleanValue(name, value);
    if (!c.ok) { out.refused = 'value'; return out; }
    var at = typeof opts.at === 'number' && isFinite(opts.at) && opts.at >= 0 && opts.at <= MAX_AT ? Math.floor(opts.at) : Date.now();
    var cur = f[name];
    var why = mayWrite(name, by, cur, opts);
    if (why) { out.refused = why; return out; }
    // The Journey's "3 or more" answer means at least 3: it doesn't lower a
    // higher number given elsewhere.
    if (name === 'dependants' && by === 'journey' && c.v === 3 && cur && typeof cur.v === 'number' && cur.v > 3) return out;
    var next = copyFields(f);
    function put(n, v) {
      var old = next[n] || null;
      if (old && sameValue(old.v, v)) return;
      next[n] = { v: Array.isArray(v) ? v.slice() : v, at: at, by: by };
      out.changed.push({ field: n, from: copyEntry(old), to: copyEntry(next[n]) });
    }
    put(name, c.v);
    // incomes and income travel together: writing both incomes writes their
    // sum, and a page with one income figure clears the split.
    if (name === 'incomes' && c.v !== null) put('income', Math.min(FIELDS.income.max, c.v[0] + c.v[1]));
    if (name === 'income' && next.incomes && Array.isArray(next.incomes.v) && (c.v === null || next.incomes.v[0] + next.incomes.v[1] !== c.v)) put('incomes', null);
    if (out.changed.length) out.f = next;
    return out;
  }

  // ── Merging two copies ────────────────────────────────────────────────────
  // Field by field, newest `at` wins. A tie keeps `base` unless
  // opts.tie === 'incoming'. `changed` lists fields whose value changed.
  function mergeFields(base, incoming, opts) {
    var tieIn = !!(opts && opts.tie === 'incoming');
    var b = normalizeFields(base), inc = normalizeFields(incoming);
    var out = copyFields(b), changed = [];
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i], x = inc[n], y = b[n];
      if (!x) continue;
      if (!y || x.at > y.at || (tieIn && x.at === y.at)) {
        out[n] = x;
        if (!y || !sameValue(x.v, y.v)) changed.push({ field: n, from: copyEntry(y || null), to: copyEntry(x) });
      }
    }
    return { f: out, changed: changed };
  }
  function clampAt(at, now) { return Math.min(at, now + CLOCK_SKEW_MS); }
  // The server's merge: every incoming entry cleaned and its time clamped,
  // then newest wins with ties kept. Fields not sent are never touched.
  // `dropped` names what was refused, for the log: a name comes from the
  // request, so anything but letters, digits and _ becomes ? (no line
  // breaks or other characters that could forge a log line).
  function serverMerge(storedF, incomingF, now) {
    var stored = normalizeFields(storedF), out = copyFields(stored);
    var accepted = [], dropped = [], stale = [];
    var src = isObj(incomingF) ? incomingF : {};
    Object.keys(src).forEach(function (n) {
      var e = own(FIELDS, n) ? cleanEntry(n, src[n]) : null;
      if (!e) { dropped.push(String(n).slice(0, 40).replace(/[^A-Za-z0-9_]/g, '?')); return; }
      e.at = clampAt(e.at, now);
      var s = stored[n];
      if (!s || e.at > s.at) { out[n] = e; accepted.push(n); }
      else stale.push(n);
    });
    return { f: out, accepted: accepted, dropped: dropped.slice(0, 40), stale: stale };
  }

  // ── The Journey mirror ────────────────────────────────────────────────────
  // The Journey's record (propCalc_journey_v1, journey:<email>) keeps its own
  // copy of these fields, because followers and partners load only that
  // record. journey.js reconciles the two with planReconcile(). Each entry:
  //   field  the details field;  q  the Journey question id (wizard);
  //   path   where the Journey keeps it;
  //   get(S, opts) → the Journey's value in details units, or undefined;
  //   accepts(v)   → whether the Journey can hold v;
  //   put(S, v)    → writes v into S, true when it did;
  //   eq(jv, dv)   → whether the two count as the same.
  function sect(S, k) { if (!isObj(S[k])) S[k] = {}; return S[k]; }
  function sget(S, k, key) { return isObj(S) && isObj(S[k]) && S[k][key] != null ? S[k][key] : undefined; }
  function mirror(field, q, sec, key, extra) {
    var m = {
      field: field, q: q, path: sec + '.' + key, nullable: false,
      get: function (S) { return sget(S, sec, key); },
      accepts: function (v) { return v === null ? m.nullable : cleanValue(field, v).ok; },
      write: function (S, v) { sect(S, sec)[key] = v; },
      put: function (S, v) { if (!m.accepts(v)) return false; m.write(S, v === null ? null : cleanValue(field, v).v); return true; },
      eq: function (jv, dv) { return sameValue(jv, dv); }
    };
    for (var k in extra) if (own(extra, k)) m[k] = extra[k];
    return m;
  }
  function near(tol) { return function (jv, dv) { return typeof jv === 'number' && typeof dv === 'number' ? Math.abs(jv - dv) < tol : jv === dv; }; }
  var JOURNEY_EMP = ['payg', 'self', 'casual'];
  var JOURNEY_DEPOSITS = [2, 5, 10, 20];
  var MIRROR = [
    mirror('state', 'state', 'numbers', 'state'),
    mirror('area', 'area', 'profile', 'area'),
    mirror('firstHome', 'fhb', 'profile', 'fhb'),
    mirror('buyers', 'buyers', 'profile', 'buyers'),
    // incomes before income: writing the split writes their sum as well, so
    // the household figure that follows already agrees.
    mirror('incomes', 'incomes', 'profile', 'incomes', { nullable: true }),
    mirror('income', 'income', 'profile', 'income', { nullable: true }),
    mirror('employment', 'employment', 'profile', 'empTypes', {
      nullable: true,
      get: function (S) {
        var t = sget(S, 'profile', 'empTypes');
        if (Array.isArray(t) && cleanValue('employment', t).ok) return t.slice();
        var e = sget(S, 'profile', 'employment');
        return JOURNEY_EMP.indexOf(e) !== -1 ? [e, e] : undefined;
      },
      write: function (S, v) {
        var P = sect(S, 'profile');
        P.empTypes = v === null ? null : v.slice();
        if (v === null) return;
        // profile.employment holds one of three answers; it follows when the
        // two agree, or when only the first applicant counts.
        if (JOURNEY_EMP.indexOf(v[0]) !== -1 && (v[0] === v[1] || P.buyers === 'single')) P.employment = v[0];
      }
    }),
    // [false, false] is also what a journey holds before anyone asked (and
    // what a cleared value is written as), so it counts as an answer only
    // when factsAt has a time for it.
    mirror('hecs', 'hecs', 'profile', 'hecs', {
      nullable: true,
      get: function (S) {
        var h = sget(S, 'profile', 'hecs');
        if (!Array.isArray(h) || h.length !== 2) return undefined;
        if (!h[0] && !h[1] && !(isObj(S.factsAt) && typeof S.factsAt.hecs === 'number')) return undefined;
        return h.slice();
      },
      write: function (S, v) { sect(S, 'profile').hecs = v === null ? [false, false] : v.slice(); },
      eq: function (jv, dv) {
        var none = function (x) { return x == null || (Array.isArray(x) && !x[0] && !x[1]); };
        return sameValue(jv, dv) || (none(jv) && none(dv));
      }
    }),
    // A Journey holding 3 against a higher number in details: see
    // planReconcile().
    mirror('dependants', 'dependants', 'profile', 'dependants'),
    mirror('cardLimits', 'cardLimits', 'profile', 'cardLimits'),
    mirror('debtsMonthly', 'debtsMo', 'profile', 'debtsMo', { nullable: true }),
    mirror('livingMonthly', 'livingMo', 'profile', 'livingMo', { nullable: true }),
    mirror('saved', 'saved', 'numbers', 'saved'),
    mirror('saveMo', 'saveMo', 'numbers', 'saveMo'),
    // The Journey keeps rent in whole dollars a month.
    mirror('rentMonthly', 'rentNow', 'profile', 'rentNow', {
      write: function (S, v) { sect(S, 'profile').rentNow = Math.round(v); },
      eq: function (jv, dv) { return typeof jv === 'number' && typeof dv === 'number' ? jv === Math.round(dv) : jv === dv; }
    }),
    mirror('build', 'build', 'profile', 'build'),
    // The Journey's prices start at $50,000.
    mirror('targetPrice', 'price', 'numbers', 'price', {
      accepts: function (v) { return v !== null && cleanValue('targetPrice', v).ok && v >= 50000; }
    }),
    mirror('maxPrice', 'cap', 'budget', 'cap', {
      nullable: true,
      accepts: function (v) { return v === null || (cleanValue('maxPrice', v).ok && v >= 50000); }
    }),
    // The Journey keeps a fraction (0.05) and offers four deposits.
    mirror('depositPct', 'depositPct', 'budget', 'depositPct', {
      nullable: true,
      get: function (S) { var d = sget(S, 'budget', 'depositPct'); return typeof d === 'number' && isFinite(d) ? roundTo(d * 100, 1) : undefined; },
      accepts: function (v) { return v === null || JOURNEY_DEPOSITS.indexOf(v) !== -1; },
      write: function (S, v) { sect(S, 'budget').depositPct = v === null ? null : v / 100; },
      eq: near(0.05)
    }),
    // Not held by the Journey: worked out from its deposit (0.02 is Help to
    // Buy; 0.05 is the 5% Deposit Scheme for a first home buyer under the
    // price cap). The cap check needs the rules, so without opts.fdsOk a 5%
    // deposit for a first home buyer gives no value.
    mirror('scheme', 'depositPct', 'budget', 'depositPct', {
      get: function (S, opts) {
        var d = sget(S, 'budget', 'depositPct');
        if (typeof d !== 'number' || !isFinite(d)) return undefined;
        if (Math.abs(d - 0.02) < 0.001) return 'h2b';
        if (Math.abs(d - 0.05) < 0.001) {
          if (sget(S, 'profile', 'fhb') === false) return 'none';
          if (!opts || typeof opts.fdsOk !== 'function') return undefined;
          return opts.fdsOk(sget(S, 'budget', 'cap') || sget(S, 'numbers', 'price') || 0) ? 'fds' : 'none';
        }
        return 'none';
      },
      accepts: function () { return false; }
    }),
    mirror('rate', 'rate', 'numbers', 'rate', { nullable: true, eq: near(0.005) }),
    mirror('termYears', 'termYears', 'numbers', 'termYears', { nullable: true })
  ];
  var MIRROR_BY = {};
  MIRROR.forEach(function (m) { MIRROR_BY[m.field] = m; });
  var MIRROR_FIELDS = MIRROR.map(function (m) { return m.field; });

  // The Journey's value for a mirrored field, cleaned, or undefined.
  function journeyValue(S, name, opts) {
    var m = MIRROR_BY[name];
    if (!m || !isObj(S)) return undefined;
    var raw;
    try { raw = m.get(S, opts); } catch (e) { return undefined; }
    if (raw === undefined || raw === null) return undefined;
    var c = cleanValue(name, raw);
    return c.ok ? c.v : undefined;
  }
  function fromJourney(S, opts) {
    var out = {};
    MIRROR.forEach(function (m) { var v = journeyValue(S, m.field, opts); if (v !== undefined) out[m.field] = v; });
    return out;
  }
  // Writes a details value into the Journey state and notes when. Returns
  // false when the Journey can't hold the value (then nothing changes).
  function applyToJourney(S, name, v, at) {
    var m = MIRROR_BY[name];
    if (!m || !isObj(S) || !m.put(S, v)) return false;
    if (typeof at === 'number') { if (!isObj(S.factsAt)) S.factsAt = {}; S.factsAt[name] = Math.floor(at); }
    return true;
  }
  // When the Journey last changed each mirrored field. A record saved by an
  // older journey.js has no factsAt: if step 1 is done, every field it holds
  // (a value journeyValue() reads) counts as changed at its updatedAt; if
  // not, none does, because its values can't be told from the blank
  // defaults. A field it doesn't hold has no time, so a value details has
  // fills it.
  function journeyFacts(S, opts) {
    var out = {};
    if (!isObj(S)) return out;
    if (isObj(S.factsAt)) {
      MIRROR.forEach(function (m) {
        var t = own(S.factsAt, m.field) ? S.factsAt[m.field] : own(S.factsAt, m.q) ? S.factsAt[m.q] : undefined;
        if (typeof t === 'number' && isFinite(t) && t >= 0) out[m.field] = t;
      });
      return out;
    }
    if (isObj(S.done) && S.done[1]) {
      var t = num0(S.updatedAt) || 1;
      MIRROR.forEach(function (m) { if (journeyValue(S, m.field, opts) !== undefined) out[m.field] = t; });
    }
    return out;
  }
  // Pure plan for one reconcile. detailsF is the details field map as the
  // page sees it. Returns { toJourney: [{ field, v, at }], toDetails: [...],
  // mark: [...] }:
  //  - the two agree: nothing, except that a value given elsewhere which the
  //    Journey holds without a time of its own goes in `mark`, so the
  //    Journey can note it in factsAt and show the question as answered;
  //  - details is newer than the Journey's change: the Journey takes it (if
  //    it can hold it) and notes `at` in factsAt;
  //  - the Journey's change is newer: details takes the Journey's value at
  //    that time. A null or missing Journey value never overwrites details.
  //  - dependants: the Journey's chips end at "3 or more", which writes 3. A
  //    Journey holding 3 while details holds more takes the higher number
  //    whichever is newer, since that number is also "3 or more" (the
  //    Journey holds up to 10), at the later of the two times. details is
  //    never lowered to 3 (writeField). If the Journey ever asks for an exact
  //    number above 3, this rule has to go.
  function planReconcile(S, detailsF, opts) {
    var plan = { toJourney: [], toDetails: [], mark: [] };
    var facts = journeyFacts(S, opts), f = normalizeFields(detailsF);
    MIRROR.forEach(function (m) {
      var n = m.field, jv = journeyValue(S, n, opts), de = f[n] || null, jt = facts[n];
      if (n === 'dependants' && jv === 3 && de && typeof de.v === 'number' && de.v > 3) {
        if (m.accepts(de.v)) plan.toJourney.push({ field: n, v: de.v, at: jt !== undefined && jt > de.at ? jt : de.at });
        return;
      }
      if (de && jv !== undefined && m.eq(jv, de.v)) {
        if (jt === undefined && de.v !== null && m.accepts(de.v)) plan.mark.push({ field: n, v: de.v, at: de.at });
        return;
      }
      if (de && jv === undefined && de.v === null) return;
      if (de && (jt === undefined || de.at > jt)) {
        if (m.accepts(de.v)) plan.toJourney.push({ field: n, v: de.v, at: de.at });
        return;
      }
      if (jt !== undefined && jv !== undefined && (!de || jt > de.at)) plan.toDetails.push({ field: n, v: jv, at: jt });
    });
    return plan;
  }

  // ── Migration (once per browser) ──────────────────────────────────────────
  function moneyText(s) {
    var x = parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, ''));
    return isFinite(x) && x > 0 ? Math.round(x) : 0;
  }
  // What the old /app draft may give. Only the state, the first home tick,
  // savings and price: the rate, term and deposit can't be told from what
  // "New" and the old setup questions filled in, and income was never saved.
  // A draft with no price and no savings was never used, so it gives nothing.
  // The first home box starts unticked and the draft always saves it ('0'),
  // so only a tick ('1') is the visitor's answer; '0' gives nothing.
  function fromDraft(draft) {
    var out = {};
    var vals = isObj(draft) && isObj(draft.state) && isObj(draft.state.values) ? draft.state.values : null;
    if (!vals) return out;
    var price = moneyText(vals['inp-price']), savings = moneyText(vals['inp-savings']);
    if (!price && !savings) return out;
    var st = String(vals['inp-state'] || '').toLowerCase();
    if (STATES.indexOf(st) !== -1) out.state = st;
    if (vals['inp-fhb-checked'] === '1') out.firstHome = true;
    if (savings > 0) out.saved = Math.min(FIELDS.saved.max, savings);
    if (price > 0) out.lastPrice = Math.min(FIELDS.lastPrice.max, price);
    return out;
  }
  function storageGet(storage, k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
  // Fills `rec` (in place) from what this browser already holds. Returns the
  // names it filled. The Journey counts only when step 1 is done, this isn't
  // a partner's device, and the journey belongs to whoever is here now (a
  // guest's journey for a guest, the account's for that account).
  function migrateInto(rec, storage, sessionId) {
    var filled = [];
    var me = sessionId || '';
    if (!storageGet(storage, COLLAB_KEY)) {
      var j = parseJSON(storageGet(storage, JOURNEY_KEY));
      var jOwner = storageGet(storage, JOURNEY_OWNER_KEY) || '';
      if (isObj(j) && j.v === 1 && isObj(j.done) && j.done[1] && jOwner === me) {
        var at = num0(j.updatedAt) || 1;
        var vals = fromJourney(j);
        Object.keys(vals).forEach(function (n) {
          var cur = rec.f[n];
          if (!cur || cur.at < at) { rec.f[n] = { v: vals[n], at: at, by: 'import' }; filled.push(n); }
        });
      }
    }
    var d = fromDraft(parseJSON(storageGet(storage, DRAFT_KEY)));
    Object.keys(d).forEach(function (n) {
      if (!rec.f[n]) { rec.f[n] = { v: d[n], at: 1, by: 'import' }; filled.push(n); }
    });
    rec.mig = 1;
    return filled;
  }

  // ── Form option values ────────────────────────────────────────────────────
  // Calculators use their own option values for the same answers.
  var ALIASES = {
    buyers: { joint: 'couple' },
    area: { other: 'regional' },
    employment: { 'self-employed': 'self' },
    build: { offplan: 'new' },
    occupancy: { owner: 'home', investor: 'invest' }
  };
  // A form control's value as a details value (one entry, for the two-person
  // fields), or undefined. Matching is case-insensitive.
  function optionValue(name, raw) {
    if (!own(FIELDS, name) || raw == null) return undefined;
    var F = FIELDS[name];
    if (!F.values) return undefined;
    var s = String(raw).trim(), low = s.toLowerCase();
    var al = ALIASES[name] || {};
    if (own(al, low)) return al[low];
    for (var i = 0; i < F.values.length; i++) if (F.values[i].toLowerCase() === low) return F.values[i];
    return undefined;
  }
  // The option among optionValues that means v, or undefined.
  function toOption(name, v, optionValues) {
    var list = Array.isArray(optionValues) ? optionValues : [];
    for (var i = 0; i < list.length; i++) if (optionValue(name, list[i]) === v) return list[i];
    return undefined;
  }
  function monthlyFromWeekly(w) { return typeof w === 'number' && isFinite(w) ? roundTo(w * 52 / 12, 2) : undefined; }
  function weeklyFromMonthly(m) { return typeof m === 'number' && isFinite(m) ? Math.round(m * 12 / 52) : undefined; }

  // ── Words ─────────────────────────────────────────────────────────────────
  var FIELD_LABELS = {
    state: 'State or territory', area: 'Capital city or regional', firstHome: 'First home buyer',
    buyers: 'Buying alone or together', income: 'Household income', incomes: 'Each income',
    employment: 'Income type', hecs: 'HELP debt', dependants: 'Dependants',
    cardLimits: 'Credit card limits', debtsMonthly: 'Other loan repayments', livingMonthly: 'Living costs',
    saved: 'Savings', saveMo: 'Monthly saving', rentMonthly: 'Rent', build: 'New or established',
    occupancy: 'Live in or rent out', targetPrice: 'Target price', maxPrice: 'Maximum price',
    depositPct: 'Deposit', scheme: 'Scheme', rate: 'Interest rate', termYears: 'Loan term',
    lastPrice: 'Last price entered'
  };
  var STATE_NAMES = { qld: 'Queensland', nsw: 'New South Wales', vic: 'Victoria', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', act: 'the ACT', nt: 'the Northern Territory' };
  var VALUE_WORDS = {
    area: { capital: 'capital city or major regional centre', regional: 'rest of the state' },
    buyers: { single: 'alone', couple: 'together' },
    employment: { payg: 'PAYG salary', paygVariable: 'PAYG with bonus or commission', casual: 'casual or contract', self: 'self-employed', rental: 'rental income only' },
    build: { established: 'established', 'new': 'new', unsure: 'not sure yet' },
    occupancy: { home: 'live in it', invest: 'rent it out' },
    scheme: { none: 'no scheme', fds: '5% Deposit Scheme', h2b: 'Help to Buy' }
  };
  var TOOL_NAMES = {
    'auction-budget': 'the auction budget calculator',
    'borrowing-power': 'the borrowing power calculator',
    'capital-gains': 'the capital gains tax calculator',
    'cost-of-purchase': 'the cost of purchase calculator',
    'deposit': 'the deposit calculator',
    'equity-release': 'the home equity calculator',
    'first-home-buyer': 'the first home buyer grants calculator',
    'first-home-buyer-grants': 'the first home buyer grants calculator',
    'house-flip': 'the house flip calculator',
    'io-vs-pi': 'the interest only or principal and interest calculator',
    'interest-only-vs-principal': 'the interest only or principal and interest calculator',
    'land-tax': 'the land tax calculator',
    'listing-price': 'the listing price checker',
    'listing-price-checker': 'the listing price checker',
    'loan-serviceability': 'the loan serviceability calculator',
    'mortgage-repayment': 'the mortgage repayment calculator',
    'mortgage-stress': 'the mortgage stress calculator',
    'property-cashflow': 'the property cash flow calculator',
    'renovation-cost': 'the renovation cost calculator',
    'rental-yield': 'the rental yield calculator',
    'stamp-duty': 'the stamp duty calculator'
  };
  STATES.forEach(function (s) { TOOL_NAMES['stamp-duty-' + s] = 'the ' + s.toUpperCase() + ' stamp duty calculator'; });
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dollars(x) {
    var neg = x < 0, s = String(Math.round(Math.abs(x)));
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-$' : '$') + s;
  }
  function fieldLabel(name) { return own(FIELD_LABELS, name) ? FIELD_LABELS[name] : ''; }
  // A value in words, for "changed to …" lines and summaries.
  function formatValue(name, v) {
    if (!own(FIELDS, name) || v === null || v === undefined) return '';
    var F = FIELDS[name], per = F.per === 'year' ? ' a year' : F.per === 'month' ? ' a month' : '';
    switch (name) {
      case 'state': return STATE_NAMES[v] || '';
      case 'firstHome': return v ? 'yes' : 'no';
      case 'incomes': return dollars(v[0]) + ' and ' + dollars(v[1]) + per;
      case 'employment': {
        var w = VALUE_WORDS.employment;
        return v[0] === v[1] ? w[v[0]] : w[v[0]] + ' and ' + w[v[1]];
      }
      case 'hecs': return v[0] && v[1] ? 'both of you' : v[0] ? 'the first applicant' : v[1] ? 'the second applicant' : 'none';
      case 'dependants': return String(v);
      case 'rentMonthly': {
        var whole = Math.round(v) === v;
        return (whole ? dollars(v) : dollars(Math.floor(v)) + '.' + String(Math.round((v - Math.floor(v)) * 100) + 100).slice(1)) + per;
      }
      case 'depositPct': return String(v) + '%';
      case 'rate': return v.toFixed(2) + '%';
      case 'termYears': return v + (v === 1 ? ' year' : ' years');
    }
    if (VALUE_WORDS[name]) return VALUE_WORDS[name][v] || '';
    if (F.kind === 'money') return dollars(v) + per;
    return String(v);
  }
  function sourceLabel(by) {
    if (by === 'journey') return 'the First Home Journey';
    if (by === 'app') return 'the property workup';
    if (by === 'import') return 'an earlier visit';
    if (by === 'shared') return 'the shared journey';
    if (typeof by === 'string' && by.indexOf('tool:') === 0) {
      var slug = by.slice(5).replace(/-calculator$/, '');
      return own(TOOL_NAMES, slug) ? TOOL_NAMES[slug] : own(TOOL_NAMES, by.slice(5)) ? TOOL_NAMES[by.slice(5)] : 'a calculator on this site';
    }
    return 'another page on this site';
  }
  // "18 Nov", with the year when it isn't this year. '' for a time that can't
  // be a real entry (the old /app draft is imported at 1 ms).
  function dateLabel(at, nowMs) {
    if (typeof at !== 'number' || !isFinite(at) || at < 1e12) return '';
    var d = new Date(at), n = new Date(typeof nowMs === 'number' ? nowMs : Date.now());
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() === n.getFullYear() ? '' : ' ' + d.getFullYear());
  }
  // "the borrowing power calculator, 18 Nov"
  function sourceText(e, nowMs) {
    if (!e) return '';
    var d = dateLabel(e.at, nowMs);
    return sourceLabel(e.by) + (d ? ', ' + d : '');
  }
  // The words of a "changed elsewhere" line, per field.
  //   subj   reads before "changed to <value>"; pl: plural, so "were cleared"
  //   fact   for a choice: the new answer as a sentence of its own
  //   clear  reads before "was cleared", when subj doesn't
  var CHANGE_WORDS = {
    state: { subj: 'Your state or territory' },
    area: {
      fact: function (v) { return v === 'capital' ? "You're now buying in a capital city or major regional centre" : "You're now buying in the rest of the state"; },
      clear: "Whether you're buying in a capital city or the rest of the state"
    },
    firstHome: {
      fact: function (v) { return v ? "You're a first home buyer" : "You're not a first home buyer"; },
      clear: "Whether you're a first home buyer"
    },
    buyers: {
      fact: function (v) { return v === 'couple' ? "You're now buying together" : "You're now buying alone"; },
      clear: "Whether you're buying alone or together"
    },
    income: { subj: 'Your household income' },
    incomes: { subj: 'Your two incomes', pl: true, clear: 'The split between your two incomes' },
    employment: { subj: 'Your income type' },
    hecs: {
      fact: function (v) { return v[0] && v[1] ? 'You both have a HELP debt' : v[0] ? 'The first applicant has a HELP debt' : v[1] ? 'The second applicant has a HELP debt' : 'You have no HELP debt'; },
      clear: 'Whether you have a HELP debt'
    },
    dependants: { subj: 'The number of dependants' },
    cardLimits: { subj: 'Your credit card limits', pl: true },
    debtsMonthly: { subj: 'Your other loan repayments', pl: true },
    livingMonthly: { subj: 'Your living costs', pl: true },
    saved: { subj: 'Your savings', pl: true },
    saveMo: { subj: 'What you save', clear: 'What you save each month' },
    rentMonthly: { subj: 'Your rent' },
    build: {
      fact: function (v) { return v === 'new' ? "You're now looking at new homes" : v === 'established' ? "You're now looking at established homes" : "You're not yet sure whether to buy new or established"; },
      clear: "Whether you're buying new or established"
    },
    occupancy: {
      fact: function (v) { return v === 'invest' ? 'You now plan to rent it out' : 'You now plan to live in it'; },
      clear: "Whether you'll live in it or rent it out"
    },
    targetPrice: { subj: 'Your target price' },
    maxPrice: { subj: 'Your maximum price' },
    depositPct: { subj: 'Your deposit' },
    scheme: {
      fact: function (v) { return v === 'fds' ? "You're now using the 5% Deposit Scheme" : v === 'h2b' ? "You're now using Help to Buy" : "You're now buying without a scheme"; },
      clear: 'Your choice of scheme'
    },
    rate: { subj: 'Your interest rate' },
    termYears: { subj: 'Your loan term' },
    lastPrice: { subj: 'The last price you entered' }
  };
  // "Your household income changed to $170,000 a year in the borrowing
  // power calculator on 18 Nov." / "You're now buying together, as set in
  // the First Home Journey on 18 Nov." / "Your credit card limits were
  // cleared in …". The page adds its own Undo control.
  function changeLine(change, nowMs) {
    if (!change || !change.to || !own(FIELDS, change.field) || !own(CHANGE_WORDS, change.field)) return '';
    var n = change.field, e = change.to, w = CHANGE_WORDS[n], d = dateLabel(e.at, nowMs);
    var where = e.by === 'import'
      ? (d ? ' during your visit on ' + d : ' on an earlier visit')
      : ' in ' + sourceLabel(e.by) + (d ? ' on ' + d : '');
    if (e.v === null) {
      var plural = !w.clear && w.pl;
      return (w.clear || w.subj) + (plural ? ' were' : ' was') + ' cleared' + where + '.';
    }
    if (w.fact) return w.fact(e.v) + ', as set' + where + '.';
    var subj = n === 'employment' && e.v[0] !== e.v[1] ? 'Your income types' : w.subj;
    return subj + ' changed to ' + formatValue(n, e.v) + where + '.';
  }

  // ── Browser runtime ───────────────────────────────────────────────────────
  // env: { storage, now(), sessionId(), post(payload, keepalive) → Promise of
  // the parsed reply (with .status), setTimeout, clearTimeout, on(type, fn),
  // visible() }. Every part is optional; without post nothing is sent.
  function createRuntime(env) {
    env = env || {};
    var storage = env.storage || null;
    var now = env.now || function () { return Date.now(); };
    var sid = env.sessionId || function () { return ''; };
    var setT = env.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var clearT = env.clearTimeout || function (t) { clearTimeout(t); };
    var listeners = [], mem = null, broken = false, inert = false, cache = blankRecord();
    var pushT = null, pulling = null, authFailed = false, started = false, retries = 0;
    var syncedResolve, synced = new Promise(function (res) { syncedResolve = res; });

    function rawGet(k) {
      if (!storage) { broken = true; return null; } // no storage: keep it in memory for the visit
      try { return storage.getItem(k); } catch (e) { broken = true; return null; }
    }
    function rawSet(k, v) {
      try { if (!storage) return false; storage.setItem(k, v); return true; } catch (e) { broken = true; return false; }
    }
    function rawDel(k) { try { if (storage) storage.removeItem(k); } catch (e) {} }
    function load() {
      var raw = rawGet(KEY);
      if (raw == null) return broken && mem ? normalize(mem) : blankRecord();
      var p = parseJSON(raw);
      if (isObj(p) && typeof p.v === 'number' && p.v > VERSION) inert = true;
      return normalize(p);
    }
    function save(rec) {
      // start() has already looked for older data, so the first stored copy
      // records that, even when the look found nothing.
      if (started) rec.mig = 1;
      mem = rec; cache = normalize(rec);
      if (inert) return;
      if (recordIsEmpty(rec) && rawGet(KEY) == null) return; // nothing to keep yet
      rawSet(KEY, JSON.stringify(rec));
    }
    function emit(source, changes) {
      if (!changes || !changes.length) return;
      var ev = { source: source, changes: changes };
      listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) {} });
    }
    function partner() { return !!rawGet(COLLAB_KEY); }
    function sharedEntry(name) {
      var j = parseJSON(rawGet(JOURNEY_KEY));
      if (!isObj(j) || !isObj(j.done) || !j.done[1]) return null;
      var v = journeyValue(j, name);
      return v === undefined ? null : { v: v, at: num0(j.updatedAt), by: 'shared' };
    }
    // The record as this visitor may see it: never another account's.
    function mine() {
      var rec = load(), me = sid();
      if (rec.owner && rec.owner !== me) { var b = blankRecord(); b.mig = 1; return b; }
      return rec;
    }
    // Whatever is written while someone is signed in is theirs from that
    // moment, even if the account copy hasn't been read yet (offline, a busy
    // server): sign-out then removes it, and the next person to sign in on
    // this browser never takes it into their account. `linked` stays 0 until
    // the first read merges it with the account copy.
    function claim(rec, me) {
      if (me && !rec.owner) { rec.owner = me; rec.linked = 0; }
    }

    function entry(name) {
      if (!own(FIELDS, name)) return null;
      if (MIRROR_BY[name] && partner()) return sharedEntry(name);
      var e = mine().f[name];
      return e ? copyEntry(e) : null;
    }
    function get(name) { var e = entry(name); return e && e.v !== null ? e.v : undefined; }
    function all() {
      var out = {};
      NAMES.forEach(function (n) { var e = entry(n); if (e) out[n] = e; });
      return out;
    }
    function set(name, value, by, opts) {
      if (inert) return { ok: false, changes: [], reason: 'version' };
      if (MIRROR_BY[name] && partner()) return { ok: false, changes: [], reason: 'partner' };
      var o = {};
      if (opts) for (var k in opts) if (own(opts, k)) o[k] = opts[k];
      if (typeof o.at !== 'number') o.at = now();
      var rec = mine();
      var res = writeField(rec.f, name, value, by, o);
      if (res.refused) return { ok: false, changes: [], reason: res.refused };
      if (!res.changed.length) return { ok: true, changes: [] };
      rec.f = res.f;
      res.changed.forEach(function (c) { if (rec.dirty.indexOf(c.field) === -1) rec.dirty.push(c.field); });
      claim(rec, sid());
      save(rec);
      emit('local', res.changed);
      retries = 0;
      schedulePush();
      return { ok: true, changes: res.changed };
    }
    function clear(name, by, opts) { return set(name, null, by, opts); }
    // Clears every field, with the time now, so the clear reaches the account.
    function clearAll(by) {
      var changes = [];
      NAMES.forEach(function (n) {
        if (MIRROR_BY[n] && partner()) return;
        var cur = mine().f[n];
        if (cur && cur.v !== null) { var r = set(n, null, by, { force: true }); changes = changes.concat(r.changes); }
      });
      return changes;
    }
    // Puts back the value a change replaced, with a new time, so it travels
    // like any edit. Does nothing if the field has changed again since.
    function undo(change, by) {
      if (!change || !own(FIELDS, change.field)) return { ok: false, changes: [], reason: 'unknown' };
      var cur = mine().f[change.field] || null, to = change.to || null;
      if (!(cur && to && sameValue(cur.v, to.v)) && !(!cur && !to)) return { ok: false, changes: [], reason: 'moved' };
      return set(change.field, change.from ? change.from.v : null, by, { force: true });
    }
    function onChange(fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    }

    // Takes the account copy into this browser. On the first read after
    // signing in (a guest record, or one written before a read succeeded),
    // the record becomes the account's, and any account value this browser's
    // newer value replaced is kept in `replaced` for the Journey to list
    // once, with Undo.
    function applyAccount(record, me, fromPull) {
      var server = accountRecord(record) || { f: {}, updatedAt: 0 };
      var rec = load();
      if (rec.owner && rec.owner !== me) { rec = blankRecord(); rec.mig = 1; }
      var first = !rec.linked;
      var before = rec.f;
      var m = mergeFields(before, server.f, { tie: 'incoming' });
      NAMES.forEach(function (n) {
        var l = before[n], s = server.f[n];
        if (l && (!s || l.at > s.at)) {
          if (rec.dirty.indexOf(n) === -1) rec.dirty.push(n);
          if (first && s && !sameValue(l.v, s.v)) rec.replaced.push({ n: n, v: s.v, at: s.at, by: s.by });
        }
      });
      rec.f = m.f;
      rec.owner = me;
      rec.linked = 1;
      rec.seen = server.updatedAt;
      if (fromPull) rec.pulled = now();
      rec.replaced = rec.replaced.slice(-REPLACED_MAX);
      save(rec);
      emit('account', m.changed);
      if (rec.dirty.length) schedulePush(0);
    }
    function pull(force) {
      var me = sid();
      if (!me || !env.post || authFailed || inert) { syncedResolve(); return Promise.resolve(false); }
      if (pulling) return pulling;
      var rec = load(), t = now();
      if (!force && rec.owner === me && rec.linked && rec.pulled && t >= rec.pulled && t - rec.pulled < PULL_EVERY_MS) {
        syncedResolve();
        if (rec.dirty.length) schedulePush(0);
        return Promise.resolve(false);
      }
      pulling = Promise.resolve(env.post({ action: 'detailsGet' })).then(function (r) {
        pulling = null;
        if (sid() !== me) return false;
        if (!r || !r.ok) { failed(r, me); return false; }
        applyAccount(r.record, me, true);
        return true;
      }, function () { pulling = null; failed(null, me); return false; }).then(function (x) { syncedResolve(); return x; });
      return pulling;
    }
    // A read or send that didn't go through. A 401 stops sending from this
    // page. A failure that may pass (no reply, 429, 5xx) is tried again
    // later (RETRY_MS) while this browser holds changes the account hasn't
    // got and no other send is waiting. A 400 or 413 would fail again.
    function failed(r, me) {
      if (r && r.status === 401) { authFailed = true; return; }
      var st = r && typeof r.status === 'number' ? r.status : 0;
      if (st && st !== 429 && st < 500) return;
      if (sid() !== me || pushT || retries >= RETRY_MS.length || !unsent()) return;
      schedulePush(RETRY_MS[retries++]);
    }
    function schedulePush(delay) {
      if (!sid() || !env.post || inert || authFailed) return;
      if (pushT) clearT(pushT);
      pushT = setT(function () { pushT = null; push(false); }, delay == null ? PUSH_DELAY_MS : delay);
    }
    function push(keepalive) {
      var me = sid(), rec = load();
      if (!me || !env.post || rec.owner !== me || !rec.dirty.length || inert) return Promise.resolve(true);
      // Never merged with the account copy (its first read failed): read it
      // now, so what this browser replaces is listed for Undo, then send.
      if (!rec.linked) {
        return pull(true).then(function (okRead) {
          if (!okRead || sid() !== me || !load().linked) return false;
          if (pushT) { clearT(pushT); pushT = null; }
          return push(keepalive);
        });
      }
      var sent = {};
      rec.dirty.forEach(function (n) { if (rec.f[n]) sent[n] = copyEntry(rec.f[n]); });
      return Promise.resolve(env.post({ action: 'detailsPut', f: sent }, !!keepalive)).then(function (r) {
        if (sid() !== me) return false;
        if (!r || !r.ok) { failed(r, me); return false; }
        var server = accountRecord(r.record) || { f: {}, updatedAt: 0 };
        var cur = load();
        if (cur.owner !== me) return false;
        var settled = {};
        Object.keys(sent).forEach(function (n) {
          var c = cur.f[n], s = sent[n], a = server.f[n];
          if (!c || c.at !== s.at || !sameValue(c.v, s.v)) return; // edited again since: still dirty
          settled[n] = true;
          // Take the account's copy of a value it accepted: same value, with
          // the time as the server clamped it.
          if (a && sameValue(a.v, c.v)) cur.f[n] = copyEntry(a);
        });
        var m = mergeFields(cur.f, server.f, { tie: 'incoming' });
        cur.f = m.f;
        cur.dirty = cur.dirty.filter(function (n) { return !settled[n]; });
        cur.seen = server.updatedAt;
        save(cur);
        retries = 0;
        emit('account', m.changed);
        return true;
      }, function () { failed(null, me); return false; });
    }
    function flush(opts) {
      if (pushT) { clearT(pushT); pushT = null; }
      return push(!!(opts && opts.keepalive));
    }
    function unsent() {
      var me = sid(), rec = load();
      return !!me && rec.owner === me && rec.dirty.length > 0;
    }
    function whenSynced() { return synced; }
    function takeReplaced() {
      var rec = mine();
      if (!rec.replaced.length) return [];
      var out = rec.replaced.map(function (x) {
        return { field: x.n, from: { v: x.v, at: x.at, by: x.by }, to: copyEntry(rec.f[x.n] || null) };
      });
      rec.replaced = [];
      save(rec);
      return out;
    }
    // Sign-out: removes the record when it belongs to an account (including
    // one written while signed in before the account copy could be read). A
    // guest record, never written while anyone was signed in, stays.
    function forget() {
      if (pushT) { clearT(pushT); pushT = null; }
      var rec = load();
      mem = null; cache = blankRecord();
      if (!rec.owner) return false;
      rawDel(KEY);
      return true;
    }

    function onStorage(e) {
      if (!e) return;
      if (e.key === KEY || e.key === null) {
        var before = cache, after = mine(), changes = [];
        NAMES.forEach(function (n) {
          var x = before.f[n] || null, y = after.f[n] || null;
          if (!x && !y) return;
          if (!x || !y || !sameValue(x.v, y.v)) changes.push({ field: n, from: copyEntry(x), to: copyEntry(y) });
        });
        cache = after;
        emit('other-tab', changes);
      } else if (e.key === JOURNEY_KEY && partner()) {
        var o = parseJSON(e.oldValue), p = parseJSON(e.newValue), ch = [];
        var ok = function (j) { return isObj(j) && isObj(j.done) && j.done[1]; };
        MIRROR_FIELDS.forEach(function (n) {
          var x = ok(o) ? journeyValue(o, n) : undefined, y = ok(p) ? journeyValue(p, n) : undefined;
          if (x === undefined && y === undefined) return;
          if (x === undefined || y === undefined || !sameValue(x, y)) {
            ch.push({ field: n, from: x === undefined ? null : { v: x, at: num0(o.updatedAt), by: 'shared' }, to: y === undefined ? null : { v: y, at: num0(p.updatedAt), by: 'shared' } });
          }
        });
        emit('shared', ch);
      }
    }

    function start() {
      if (started) return;
      started = true;
      var rec = load(), me = sid(), changed = false;
      if (rec.owner && rec.owner !== me) {
        // Left by an account that isn't signed in here now.
        rawDel(KEY); mem = null;
        rec = blankRecord();
      }
      if (!rec.mig && !inert) {
        // What a signed-in visitor's browser imports is theirs (their own
        // journey or this browser's old /app draft, which sign-out removes).
        if (migrateInto(rec, storage, me).length) { changed = true; claim(rec, me); }
      }
      if (changed) save(rec); else cache = rec;
      if (env.on) {
        env.on('storage', onStorage);
        // Leaving the page sends whatever the account hasn't got yet, with
        // keepalive: a change waiting to go, or one whose send failed.
        env.on('pagehide', function () {
          if (pushT) { clearT(pushT); pushT = null; }
          if (!authFailed && unsent()) push(true);
        });
        env.on('visibilitychange', function () { if (!env.visible || env.visible()) { retries = 0; pull(false); } });
        env.on('online', function () { if (!authFailed && unsent()) { retries = 0; schedulePush(0); } });
      }
      if (me) pull(false); else syncedResolve();
    }

    return {
      start: start, get: get, entry: entry, all: all, set: set, clear: clear, clearAll: clearAll,
      undo: undo, onChange: onChange, pull: pull, flush: flush, unsent: unsent,
      whenSynced: whenSynced, takeReplaced: takeReplaced, forget: forget, partner: partner
    };
  }

  function browserEnv(w) {
    var ls = null;
    try { ls = w.localStorage; } catch (e) { ls = null; }
    return {
      storage: ls,
      now: function () { return Date.now(); },
      sessionId: function () {
        try { var s = JSON.parse(ls.getItem(SESSION_KEY) || 'null'); return s && s.id ? String(s.id) : ''; } catch (e) { return ''; }
      },
      post: function (payload, keepalive) {
        if (typeof w.fetch !== 'function') return Promise.resolve({ ok: false, error: 'network' });
        return w.fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
          keepalive: !!keepalive
        }).then(function (r) {
          return r.json().then(function (j) { if (isObj(j)) j.status = r.status; return j; });
        }).catch(function () { return { ok: false, error: 'network' }; });
      },
      setTimeout: function (fn, ms) { return w.setTimeout(fn, ms); },
      clearTimeout: function (t) { w.clearTimeout(t); },
      on: function (type, fn) { (type === 'visibilitychange' ? w.document : w).addEventListener(type, fn); },
      visible: function () { return w.document.visibilityState === 'visible'; }
    };
  }

  var api = {
    VERSION: VERSION, KEY: KEY, FIELDS: FIELDS, NAMES: NAMES, STATES: STATES, EMPLOYMENT: EMPLOYMENT,
    MAX_BYTES: MAX_BYTES, CLOCK_SKEW_MS: CLOCK_SKEW_MS, PUSH_DELAY_MS: PUSH_DELAY_MS, PULL_EVERY_MS: PULL_EVERY_MS,
    cleanValue: cleanValue, cleanEntry: cleanEntry, sameValue: sameValue,
    normalizeFields: normalizeFields, normalize: normalize, accountRecord: accountRecord, fitsCap: fitsCap, byteSize: byteSize,
    writeField: writeField, mergeFields: mergeFields, clampAt: clampAt, serverMerge: serverMerge,
    MIRROR: MIRROR, MIRROR_FIELDS: MIRROR_FIELDS, journeyValue: journeyValue, fromJourney: fromJourney,
    applyToJourney: applyToJourney, journeyFacts: journeyFacts, planReconcile: planReconcile,
    fromDraft: fromDraft, migrateInto: migrateInto,
    optionValue: optionValue, toOption: toOption, monthlyFromWeekly: monthlyFromWeekly, weeklyFromMonthly: weeklyFromMonthly,
    fieldLabel: fieldLabel, formatValue: formatValue, sourceLabel: sourceLabel, dateLabel: dateLabel,
    sourceText: sourceText, changeLine: changeLine,
    createRuntime: createRuntime
  };

  // In a page: start the runtime and put its methods on window.Details. A
  // second copy of this script on the same page keeps the first runtime.
  var w = typeof window !== 'undefined' && root === window ? window : null;
  if (w && w.Details && typeof w.Details.createRuntime === 'function' && typeof w.Details.get === 'function') return w.Details;
  if (w && w.document) {
    var rt = createRuntime(browserEnv(w));
    for (var k in rt) if (own(rt, k) && k !== 'start') api[k] = rt[k];
    try { rt.start(); } catch (e) {}
  }
  return api;
});

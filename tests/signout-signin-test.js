// signout-signin-test.js — run with: node tests/signout-signin-test.js
// Loads auth-nav.js and login.js in a small fake browser (no network) and
// checks:
//   1. sign-out (esForgetDevice) removes what the browser holds for the
//      account and keeps the theme, site config and a journey that was never
//      linked to this account; a partner's device loses the shared copy
//   2. it pushes pending "your details" first, asks when changes haven't
//      reached the account, and does nothing if the visitor stays signed in
//   3. the nav's Sign in link carries next=<this page>
//   4. login.js safeNextUrl keeps the allowlist and refuses other sites,
//      protocol-relative and absolute URLs, escapes and markup
//   5. without `next`, sign-in returns to the referring page on this site,
//      and an emailed sign-in link returns to the page it was asked from
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const AUTH_NAV = fs.readFileSync(path.join(ROOT, 'auth-nav.js'), 'utf8');
const LOGIN = fs.readFileSync(path.join(ROOT, 'login.js'), 'utf8');

let failures = 0, passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; return; }
  failures++;
  console.log('FAIL ' + name + (detail !== undefined ? '\n     ' + JSON.stringify(detail) : ''));
}
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want }); }
const tick = () => new Promise(r => setImmediate(r));
async function settle(n) { for (let i = 0; i < (n || 20); i++) await tick(); }

// ── Fake browser ─────────────────────────────────────────────────────────────
function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  const writes = [];         // every setItem key, in order
  return {
    _m: m, writes,
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { writes.push(k); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
  };
}
function makeBrowser(opts) {
  opts = opts || {};
  const ids = new Map();     // id → element (elements get ids from innerHTML or .id)
  const listeners = {};      // window event listeners
  const docListeners = {};   // document event listeners
  const fetches = [];
  const order = [];
  function el(id) {
    const e = {
      _l: {}, style: {}, attrs: {}, _html: '', textContent: '',
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } },
      addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
      fire(t, ev) { (this._l[t] || []).forEach(fn => fn(Object.assign({ preventDefault() {}, target: e }, ev || {}))); },
      click() { this.fire('click'); },
      focus() { doc.activeElement = e; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild() {}, contains() { return false; },
      getBoundingClientRect() { return { bottom: 0, right: 0 }; },
    };
    Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; ids.set(v, e); } });
    Object.defineProperty(e, 'innerHTML', {
      get() { return e._html; },
      set(v) {
        e._html = String(v);
        const tags = e._html.match(/<[^>]+>/g) || [];
        tags.forEach(t => {
          const id = /\sid="([^"]+)"/.exec(t); if (!id) return;
          const c = el(id[1]); const href = /\shref="([^"]*)"/.exec(t);
          if (href) c.attrs.href = href[1].replace(/&amp;/g, '&');
        });
      },
    });
    if (id) e.id = id;
    return e;
  }
  const actions = opts.navActions ? el() : null;
  // Form fields on the page (opts.fields: how many).
  const fields = Array.from({ length: opts.fields || 0 }, () => el());
  const doc = {
    readyState: 'complete',
    activeElement: null,
    referrer: opts.referrer || '',
    documentElement: el(),
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement() { return el(); },
    getElementById(id) { return ids.get(id) || null; },
    querySelector(sel) { return sel === '.site-nav-actions' ? actions : null; },
    querySelectorAll(sel) { return /input/.test(sel) ? fields : []; },
    contains() { return true; },
    addEventListener(t, fn, cap) { (docListeners[t] = docListeners[t] || []).push(fn); },
    removeEventListener(t, fn) { docListeners[t] = (docListeners[t] || []).filter(f => f !== fn); },
  };
  const loc = {
    origin: 'https://equitysight.app',
    pathname: opts.pathname || '/',
    search: opts.search || '',
    hash: opts.hash || '',
    _href: null, reloaded: 0,
    set href(v) { this._href = v; order.push('navigate'); },
    get href() { return this._href; },
    reload() { this.reloaded++; },
  };
  const storage = makeStorage(opts.storage);
  const session = makeStorage(opts.session);
  const win = {
    document: doc, location: loc, localStorage: storage, navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
    matchMedia() { return { matches: false }; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    // The nav's 5-second session refresh is not run here.
    setTimeout(fn, ms) { return ms >= 5000 ? 0 : setTimeout(fn, ms); },
    clearTimeout, setInterval() { return 0; },
    requestIdleCallback() {},
    history: { replaceState() {} },
    URL, URLSearchParams, JSON, Promise, Date, console, Array, Object, String, RegExp, Math,
    alert() {},
    fetch(url, init) {
      const body = JSON.parse((init && init.body) || '{}');
      fetches.push({ url, body, keepalive: !!(init && init.keepalive) });
      order.push(body.action || url);
      // opts.fetchReply may return a reply object, or 'offline' for a
      // network error.
      const reply = opts.fetchReply ? opts.fetchReply(url, body) : { ok: true };
      if (reply === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reply) });
    },
  };
  win.window = win;
  win.screen = { width: 0, height: 0 };
  win.sessionStorage = session;
  // opts.nav: { type: 'navigate' | 'back_forward' | 'reload', entries: [keys], current: key }
  // Without it the page has no Navigation API and no navigation timing.
  if (opts.nav) {
    win.performance = { getEntriesByType(t) { return t === 'navigation' ? [{ type: opts.nav.type || 'navigate' }] : []; } };
    win.navigation = {
      entries() { return (opts.nav.entries || []).map(key => ({ key })); },
      get currentEntry() { return opts.nav.current ? { key: opts.nav.current } : null; },
    };
  }
  return { win, doc, loc, storage, session, ids, listeners, docListeners, fetches, order, actions, fields,
    fire(t, ev) { (listeners[t] || []).forEach(fn => fn(ev)); },
    key(k, extra) {
      const ev = Object.assign({ key: k, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, extra || {});
      (docListeners.keydown || []).slice().forEach(fn => fn(ev));
      return ev;
    } };
}
function load(src, b, name) { vm.runInNewContext(src, b.win, { filename: name }); return b; }

// ── 1. What sign-out removes ─────────────────────────────────────────────────
const SESSION = JSON.stringify({ id: 'u1', email: 'a@example.com', name: 'A', plan: 'free', role: 'user' });
const KEEP = {
  equitySight_theme: 'dark',
  propCalc_siteConfig_v1: '{}',
  propCalc_schemes_v1: '{}',
  propCalc_profile_v1_guest: '{}',
  propCalc_splash_seen: '1',
};
const ACCOUNT_DATA = {
  propCalc_session_v1: SESSION,
  propCalc_journey_v1: '{"v":1}',
  propCalc_journey_owner: 'u1',
  propCalc_journey_pendingJoin: '{"t":"abcdef","at":1}',
  // login.js's return path for an emailed sign-in link (can hold an invite)
  propCalc_login_next: JSON.stringify({ p: '/journey?join=tok_abcdef', at: Date.now() }),
  propCalc_journey_unsent: '',      // present but empty: not "unsent"
  propCalc_details_v1: JSON.stringify({ v: 1, owner: 'u1', f: {}, dirty: [], mig: 1 }),
  propCalc_workup_v2: '{}',
  propCalc_draft_v1: '{}',
  propCalc_pendingSave: '1',
  propCalc_v5_index: '[]',
  propCalc_v5_ph_sc_1: 'data:image/png;base64,AA==',
  'tool_inputs_v1:deposit-calculator': '{}',
  'tool_inputs_v1:land-tax:rows': '[]',
  'tool_live_rate_v1:mortgage-repayment-calculator': '{}',
  propCalc_profile_v1_u1: '{}',
  propCalc_profile_v1_u0: '{}',
};

async function testForgetOwn() {
  const b = load(AUTH_NAV, makeBrowser({ storage: Object.assign({}, KEEP, ACCOUNT_DATA) }), 'auth-nav.js');
  let navRendered = 0;
  const realRender = b.win.renderSiteNav;
  b.win.renderSiteNav = function () { navRendered++; return realRender(); };
  const plan = b.win.esForgetDevice.plan();
  eq('own: journey reported as own', plan.journey, 'own');
  eq('own: nothing unsent', plan.unsent, false);
  const done = await b.win.esForgetDevice();
  eq('own: resolves true', done, true);
  eq('own: only kept keys remain', Array.from(b.storage._m.keys()).sort(), Object.keys(KEEP).sort());
  const so = b.fetches.filter(f => f.body.action === 'signout');
  eq('own: one server sign-out, keepalive', so.map(f => f.keepalive), [true]);
  eq('own: no next means no navigation', b.loc.href, null);
  eq('own: nav re-rendered', navRendered, 1);
}

async function testForgetKeepsUnlinkedJourney() {
  // A guest journey (no owner key) stays; so does one whose owner is another account.
  for (const owner of [null, 'u2']) {
    const seed = Object.assign({}, KEEP, { propCalc_session_v1: SESSION, propCalc_journey_v1: '{"v":1}' });
    if (owner) seed.propCalc_journey_owner = owner;
    const b = load(AUTH_NAV, makeBrowser({ storage: seed }), 'auth-nav.js');
    eq('unlinked(' + owner + '): journey not reported', b.win.esForgetDevice.plan().journey, '');
    await b.win.esForgetDevice();
    check('unlinked(' + owner + '): journey kept', b.storage.getItem('propCalc_journey_v1') === '{"v":1}');
    check('unlinked(' + owner + '): owner key kept', b.storage.getItem('propCalc_journey_owner') === owner);
    check('unlinked(' + owner + '): session gone', b.storage.getItem('propCalc_session_v1') === null);
  }
}

async function testForgetPartnerDevice() {
  const seed = Object.assign({}, KEEP, {
    propCalc_session_v1: SESSION,
    propCalc_journey_v1: '{"v":1,"shared":true}',
    propCalc_journey_collab: 'tok_abcdef',
    propCalc_journey_pendingJoin: '{"t":"tok_abcdef","at":1}',
    propCalc_journey_owner: 'u1',
  });
  const b = load(AUTH_NAV, makeBrowser({ storage: seed }), 'auth-nav.js');
  const plan = b.win.esForgetDevice.plan();
  eq('partner: journey reported as shared', plan.journey, 'shared');
  eq('partner: shared flag', plan.shared, true);
  await b.win.esForgetDevice();
  eq('partner: only kept keys remain', Array.from(b.storage._m.keys()).sort(), Object.keys(KEEP).sort());
}

async function testDetailsOwnership() {
  const cases = [
    ['guest record (owner "") stays', { v: 1, owner: '', f: { income: { v: 1, at: 1, by: 'journey' } }, dirty: [] }, true],
    ['another account\'s record goes', { v: 1, owner: 'u2', f: {}, dirty: ['income'] }, false],
    ['this account\'s record goes', { v: 1, owner: 'u1', f: {}, dirty: [] }, false],
  ];
  for (const [name, rec, kept] of cases) {
    const b = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION, propCalc_details_v1: JSON.stringify(rec) } }), 'auth-nav.js');
    eq('details: ' + name + ' (no warning)', b.win.esForgetDevice.plan().unsent, false);
    await b.win.esForgetDevice();
    eq('details: ' + name, b.storage.getItem('propCalc_details_v1') !== null, kept);
  }
  const bad = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION, propCalc_details_v1: '{not json' } }), 'auth-nav.js');
  await bad.win.esForgetDevice();
  eq('details: unreadable record goes', bad.storage.getItem('propCalc_details_v1'), null);
}

// ── 2. Flush first, ask when unsent ──────────────────────────────────────────
async function testFlushBeforeSignOut() {
  const b = makeBrowser({ storage: Object.assign({}, KEEP, ACCOUNT_DATA) });
  b.win.Details = { flush() { b.order.push('flush'); return Promise.resolve(true); }, forget() { b.order.push('forget'); return true; } };
  load(AUTH_NAV, b, 'auth-nav.js');
  await b.win.esForgetDevice({ next: '/' });
  // 'get' is the journey check (the account's copy of the journey).
  eq('flush: journey checked and details pushed before the session ends; details.js told to forget; then navigate', b.order, ['get', 'flush', 'signout', 'forget', 'navigate']);
  eq('flush: went to next', b.loc.href, '/');
  // A late write from a page script is caught when the page goes.
  b.storage.setItem('tool_inputs_v1:deposit-calculator', '{}');
  b.fire('pagehide', {});
  eq('flush: late write removed at pagehide', b.storage.getItem('tool_inputs_v1:deposit-calculator'), null);
}

async function testUnsentAsks() {
  for (const how of ['details', 'journey']) {
    for (const choice of ['stay', 'go']) {
      const seed = Object.assign({}, KEEP, ACCOUNT_DATA);
      if (how === 'details') seed.propCalc_details_v1 = JSON.stringify({ v: 1, owner: 'u1', f: {}, dirty: ['income'] });
      else seed.propCalc_journey_unsent = '1';
      const b = load(AUTH_NAV, makeBrowser({ storage: seed }), 'auth-nav.js');
      eq('unsent(' + how + '): plan says unsent', b.win.esForgetDevice.plan().unsent, true);
      const p = b.win.esForgetDevice({ next: '/' });
      eq('unsent(' + how + '): same promise while running', b.win.esForgetDevice() === p, true);
      await settle();
      const title = b.ids.get('anav-signout-title');
      check('unsent(' + how + '): dialog shown', title && /haven’t reached your account yet/.test(title.textContent), title && title.textContent);
      eq('unsent(' + how + '): buttons', [b.ids.get('anav-signout-confirm-btn').textContent, b.ids.get('anav-signout-cancel-btn').textContent], ['Sign out anyway', 'Stay signed in']);
      eq('unsent(' + how + '): safe button has focus', b.doc.activeElement === b.ids.get('anav-signout-cancel-btn'), true);
      check('unsent(' + how + '): no sign-out before the answer', !b.fetches.some(f => f.body.action === 'signout'));
      b.ids.get(choice === 'stay' ? 'anav-signout-cancel-btn' : 'anav-signout-confirm-btn').click();
      const done = await p;
      if (choice === 'stay') {
        eq('unsent(' + how + ') stay: resolves false', done, false);
        eq('unsent(' + how + ') stay: nothing removed', b.storage._m.size, Object.keys(seed).length);
        check('unsent(' + how + ') stay: no sign-out', !b.fetches.some(f => f.body.action === 'signout'));
        eq('unsent(' + how + ') stay: no navigation', b.loc.href, null);
      } else {
        eq('unsent(' + how + ') go: resolves true', done, true);
        eq('unsent(' + how + ') go: only kept keys remain', Array.from(b.storage._m.keys()).sort(), Object.keys(KEEP).sort());
      }
    }
  }
}

async function testConfirmFirst() {
  const b = load(AUTH_NAV, makeBrowser({ storage: Object.assign({}, KEEP, ACCOUNT_DATA) }), 'auth-nav.js');
  const p = b.win.siteSignOut();           // the nav's Sign out
  await settle();
  eq('confirm: asks first', b.ids.get('anav-signout-title').textContent, 'Sign out?');
  check('confirm: says the journey stays in the account and leaves this browser',
    /stays saved in your account/.test(b.ids.get('anav-signout-body').textContent) && /removes it from this browser/.test(b.ids.get('anav-signout-body').textContent),
    b.ids.get('anav-signout-body').textContent);
  // Escape answers "Stay signed in", wherever focus is (clicking the text
  // can move it off the buttons).
  b.doc.activeElement = null;
  b.key('Escape');
  eq('confirm: Escape keeps the session', await p, false);
  eq('confirm: key listener removed once answered', (b.docListeners.keydown || []).length, 0);
  check('confirm: session still there', b.storage.getItem('propCalc_session_v1') === SESSION);
  const p2 = b.win.siteSignOut();
  await settle();
  b.ids.get('anav-signout-confirm-btn').click();
  eq('confirm: Sign out resolves true', await p2, true);
  eq('confirm: nav sign-out goes to the home page', b.loc.href, '/');
  eq('confirm: only kept keys remain', Array.from(b.storage._m.keys()).sort(), Object.keys(KEEP).sort());
}

// With confirm, pending details are pushed before the question, so a push
// that works means a plain "Sign out?", and one that fails the warning, once.
async function testConfirmAfterFlush() {
  for (const works of [true, false]) {
    const seed = Object.assign({}, KEEP, ACCOUNT_DATA, { propCalc_details_v1: JSON.stringify({ v: 1, owner: 'u1', f: {}, dirty: ['income'] }) });
    const b = makeBrowser({ storage: seed });
    let flushes = 0;
    b.win.Details = { flush() {
      flushes++;
      if (works) b.storage.setItem('propCalc_details_v1', JSON.stringify({ v: 1, owner: 'u1', f: {}, dirty: [] }));
      return Promise.resolve(works);
    } };
    load(AUTH_NAV, b, 'auth-nav.js');
    const p = b.win.siteSignOut();
    await settle();
    const tag = 'confirm+details(' + (works ? 'pushed' : 'not pushed') + ')';
    eq(tag + ': pushed before the question', flushes, 1);
    eq(tag + ': the question', b.ids.get('anav-signout-title').textContent, works ? 'Sign out?' : 'Some changes haven’t reached your account yet');
    b.ids.get('anav-signout-confirm-btn').click();
    await settle();
    eq(tag + ': no second question', b.ids.get('anav-signout-overlay').classList.contains('open'), false);
    eq(tag + ': signed out', await p, true);
  }
}

async function testFlushTimeout() {
  const b = makeBrowser({ storage: { propCalc_session_v1: SESSION } });
  b.win.Details = { flush() { return new Promise(() => {}); } };   // offline: never settles
  load(AUTH_NAV, b, 'auth-nav.js');
  const t0 = Date.now();
  const done = await b.win.esForgetDevice();
  const ms = Date.now() - t0;
  check('timeout: a stuck push gives up after about 4 s', done === true && ms >= 3900 && ms < 6000, ms);
}

async function testOtherTabs() {
  const b = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION } }), 'auth-nav.js');
  let navRendered = 0;
  const realRender = b.win.renderSiteNav;
  b.win.renderSiteNav = function () { navRendered++; return realRender(); };
  b.fire('storage', { key: 'tool_inputs_v1:x', oldValue: '{}', newValue: null });
  eq('tabs: other keys do not reload', b.loc.reloaded, 0);
  // Another tab dropped an expired session: redraw the nav, keep the page
  // (a half-written message must survive).
  b.fire('storage', { key: 'propCalc_session_v1', oldValue: SESSION, newValue: null });
  eq('tabs: an expired session elsewhere does not reload', b.loc.reloaded, 0);
  eq('tabs: an expired session elsewhere redraws the nav', navRendered, 1);
  b.fire('storage', { key: 'propCalc_signed_out', oldValue: null, newValue: '123' });
  eq('tabs: signed out elsewhere reloads', b.loc.reloaded, 1);
  b.fire('storage', { key: 'propCalc_signed_out', oldValue: '123', newValue: null });
  eq('tabs: the signal being removed does not reload again', b.loc.reloaded, 1);
  b.fire('storage', { key: null });
  eq('tabs: storage cleared elsewhere (account deleted) reloads', b.loc.reloaded, 2);
  b.fire('pageshow', { persisted: true });
  eq('bfcache: no reload unless signed out here', b.loc.reloaded, 2);
  await b.win.esForgetDevice();
  b.fire('pageshow', { persisted: true });
  eq('bfcache: page restored after sign-out reloads', b.loc.reloaded, 3);
  // Sign-out tells other tabs: the signal is written once and not left behind.
  eq('tabs: sign-out writes the signal once', b.storage.writes.filter(k => k === 'propCalc_signed_out').length, 1);
  eq('tabs: no signal key left', b.storage.getItem('propCalc_signed_out'), null);
  b.fire('pagehide', {});
  eq('tabs: forgetting again at pagehide sends no second signal', b.storage.writes.filter(k => k === 'propCalc_signed_out').length, 1);
}

// The dialog keeps the keyboard inside it: Tab and Shift+Tab move between
// the two buttons from anywhere, including from the box itself.
async function testDialogKeys() {
  const b = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION } }), 'auth-nav.js');
  const p = b.win.siteSignOut();
  await settle();
  const overlay = b.ids.get('anav-signout-overlay');
  check('keys: the box can take focus (tabindex -1)', /id="anav-signout-modal"[^>]*tabindex="-1"/.test(overlay._html), overlay._html.slice(0, 200));
  const cancel = b.ids.get('anav-signout-cancel-btn'), ok = b.ids.get('anav-signout-confirm-btn');
  eq('keys: Sign out has focus first', b.doc.activeElement === ok, true);
  b.doc.activeElement = b.ids.get('anav-signout-modal');   // clicked the text
  let ev = b.key('Tab');
  eq('keys: Tab from the box goes to the first button', b.doc.activeElement === cancel, true);
  eq('keys: Tab is kept from leaving', ev.defaultPrevented, true);
  b.key('Tab');
  eq('keys: Tab moves on to the second button', b.doc.activeElement === ok, true);
  b.key('Tab');
  eq('keys: Tab wraps to the first button', b.doc.activeElement === cancel, true);
  b.key('Tab', { shiftKey: true });
  eq('keys: Shift+Tab wraps back', b.doc.activeElement === ok, true);
  b.doc.activeElement = null;
  b.key('Tab', { shiftKey: true });
  eq('keys: Shift+Tab from outside goes to the last button', b.doc.activeElement === ok, true);
  b.key('Escape');
  eq('keys: Escape stays signed in', await p, false);
  b.key('Escape');   // nothing open: ignored
  eq('keys: session kept', b.storage.getItem('propCalc_session_v1'), SESSION);
}

// Back and Forward after sign-out: the browser refills form fields, or
// brings a page back from memory. Pages from before the sign-out load again
// from scratch.
async function testBackAfterSignOut() {
  const b = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION }, fields: 2,
    nav: { type: 'navigate', entries: ['k1', 'k2'], current: 'k2' }, session: { propCalc_forgot_entries: '["k0"]' } }), 'auth-nav.js');
  eq('back: no reload on a normal load', b.loc.reloaded, 0);
  await b.win.esForgetDevice({ next: '/' });
  eq('back: entries open at sign-out noted (added to earlier ones)', JSON.parse(b.session.getItem('propCalc_forgot_entries')), ['k0', 'k1', 'k2']);
  eq('back: this page\'s fields are not kept for Back', b.fields.map(f => f.getAttribute('autocomplete')), ['off', 'off']);

  const seen = JSON.stringify(['k0', 'k1', 'k2']);
  const cases = [
    ['back_forward', 'k1', 1, ['k0', 'k2']],
    ['back_forward', 'k9', 0, ['k0', 'k1', 'k2']],   // made after the sign-out
    ['reload', 'k1', 0, ['k0', 'k1', 'k2']],
    ['navigate', 'k1', 0, ['k0', 'k1', 'k2']],
  ];
  for (const [type, current, reloads, left] of cases) {
    const c = load(AUTH_NAV, makeBrowser({ fields: 1, nav: { type, entries: [current], current }, session: { propCalc_forgot_entries: seen } }), 'auth-nav.js');
    eq('back: ' + type + ' to ' + current + ' reloads ' + reloads, c.loc.reloaded, reloads);
    eq('back: ' + type + ' to ' + current + ' leaves the list', JSON.parse(c.session.getItem('propCalc_forgot_entries')), left);
    if (reloads) eq('back: fields cleared on the way', c.fields[0].getAttribute('autocomplete'), 'off');
  }
  // From memory (bfcache): an entry from before the sign-out reloads, once.
  const d = load(AUTH_NAV, makeBrowser({ nav: { type: 'navigate', entries: ['k2'], current: 'k2' }, session: { propCalc_forgot_entries: seen } }), 'auth-nav.js');
  d.fire('pageshow', { persisted: false });
  eq('back: an ordinary pageshow does nothing', d.loc.reloaded, 0);
  d.fire('pageshow', { persisted: true });
  eq('back: a page from memory reloads', d.loc.reloaded, 1);
  d.fire('pageshow', { persisted: true });
  eq('back: only once', d.loc.reloaded, 1);
  // No Navigation API: nothing breaks.
  const e = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION } }), 'auth-nav.js');
  eq('back: without the Navigation API sign-out still works', await e.win.esForgetDevice(), true);
}

// ── 1b. Has the journey reached the account? ─────────────────────────────────
const J_ACCT = { v: 1, done: { 1: true }, numbers: { state: 'qld', price: 650000 }, updatedAt: 1000 };
function jState(o) { return JSON.stringify(Object.assign({}, J_ACCT, o)); }
async function signOutWith(local, reply, opts) {
  opts = opts || {};
  const seed = Object.assign({}, KEEP, { propCalc_session_v1: SESSION, propCalc_journey_v1: local, propCalc_journey_owner: 'u1' });
  if (opts.collab) { seed.propCalc_journey_collab = opts.collab; delete seed.propCalc_journey_owner; }
  const b = load(AUTH_NAV, makeBrowser({ storage: seed, fetchReply: (url, body) => /journey/.test(url) ? reply : { ok: true } }), 'auth-nav.js');
  const p = b.win.esForgetDevice(opts.confirm ? { confirm: true, next: '/' } : { next: '/' });
  await settle();
  const overlay = b.ids.get('anav-signout-overlay');
  const shown = overlay && overlay.classList.contains('open') ? b.ids.get('anav-signout-title').textContent : '';
  return { b, p, shown, gets: b.fetches.filter(f => /journey/.test(f.url)) };
}
async function testJourneyCheck() {
  const rec = (state) => ({ ok: true, record: state ? { state: JSON.parse(state), updatedAt: 5000 } : null });
  // Saved: the account holds this save, or a later one, or the same journey.
  const saved = [
    ['same save', jState(), rec(jState())],
    ['account newer', jState(), rec(jState({ updatedAt: 3000, numbers: { state: 'qld', price: 700000 } }))],
    ['same journey, saved again here', jState({ updatedAt: 2000 }), rec(JSON.stringify({ updatedAt: 1000, numbers: { price: 650000, state: 'qld' }, done: { 1: true }, v: 1 }))],
    ['no account copy, step 1 not done', JSON.stringify({ v: 1, done: {}, updatedAt: 2000 }), rec(null)],
    ['shared link turned off', jState({ updatedAt: 2000, numbers: { price: 1 } }), { ok: false, error: 'That collaboration link is no longer active' }, 'tok_abcdef'],
  ];
  for (const [name, local, reply, collab] of saved) {
    const r = await signOutWith(local, reply, { collab });
    eq('journey ' + name + ': no question', r.shown, '');
    eq('journey ' + name + ': signed out', await r.p, true);
    eq('journey ' + name + ': journey removed', r.b.storage.getItem('propCalc_journey_v1'), null);
  }
  // Unsent: changed here after the account's copy, or never sent.
  const unsent = [
    ['changed offline', jState({ updatedAt: 2000, numbers: { state: 'qld', price: 777000 } }), rec(jState())],
    ['no account copy, step 1 done', jState({ updatedAt: 2000 }), rec(null)],
  ];
  for (const [name, local, reply] of unsent) {
    for (const choice of ['stay', 'go']) {
      const r = await signOutWith(local, reply);
      eq('journey ' + name + ' (' + choice + '): asks', r.shown, 'Some changes haven’t reached your account yet');
      check('journey ' + name + ' (' + choice + '): no sign-out before the answer', !r.b.fetches.some(f => f.body.action === 'signout'));
      r.b.ids.get(choice === 'stay' ? 'anav-signout-cancel-btn' : 'anav-signout-confirm-btn').click();
      const done = await r.p;
      eq('journey ' + name + ' (' + choice + '): result', done, choice === 'go');
      eq('journey ' + name + ' (' + choice + '): journey ' + (choice === 'stay' ? 'kept' : 'removed'), r.b.storage.getItem('propCalc_journey_v1'), choice === 'stay' ? local : null);
    }
  }
  // Couldn't reach the account: say so.
  for (const [name, reply] of [['offline', 'offline'], ['session expired', { ok: false, error: 'Please sign in' }]]) {
    const r = await signOutWith(jState({ updatedAt: 2000 }), reply);
    eq('journey ' + name + ': says it could not check', r.shown, 'I couldn’t reach your account');
    check('journey ' + name + ': explains', /can’t tell whether your latest journey changes are saved/.test(r.b.ids.get('anav-signout-body').textContent));
    eq('journey ' + name + ': safe button has focus', r.b.doc.activeElement === r.b.ids.get('anav-signout-cancel-btn'), true);
    r.b.ids.get('anav-signout-cancel-btn').click();
    eq('journey ' + name + ': stay keeps everything', [await r.p, r.b.storage.getItem('propCalc_session_v1')], [false, SESSION]);
  }
  // A partner's device checks the shared journey, with the share token.
  let r = await signOutWith(jState({ updatedAt: 2000, numbers: { price: 1 } }), rec(jState()), { collab: 'tok_abcdef' });
  eq('journey shared: asks about the shared journey', r.shown, 'Some changes haven’t reached the shared journey yet');
  eq('journey shared: the check carries the token', r.gets.map(g => g.body), [{ action: 'get', collab: 'tok_abcdef' }]);
  r.b.ids.get('anav-signout-cancel-btn').click(); await r.p;
  // With confirm: the warning replaces "Sign out?", so there is one question.
  r = await signOutWith(jState({ updatedAt: 2000, numbers: { price: 777000 } }), rec(jState()), { confirm: true });
  eq('journey confirm: the one question is the warning', r.shown, 'Some changes haven’t reached your account yet');
  r.b.ids.get('anav-signout-confirm-btn').click();
  await settle();
  eq('journey confirm: no second question', r.b.ids.get('anav-signout-overlay').classList.contains('open'), false);
  eq('journey confirm: signed out', await r.p, true);
  r = await signOutWith(jState(), rec(jState()), { confirm: true });
  eq('journey confirm, saved: "Sign out?"', r.shown, 'Sign out?');
  check('journey confirm, saved: says it stays in the account', /stays saved in your account/.test(r.b.ids.get('anav-signout-body').textContent));
  r.b.ids.get('anav-signout-cancel-btn').click(); await r.p;
  // A journey with no owner key (a guest's) is not checked: it stays.
  const g = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION, propCalc_journey_v1: jState() } }), 'auth-nav.js');
  await g.win.esForgetDevice();
  eq('journey guest: not checked', g.fetches.filter(f => /journey/.test(f.url)).length, 0);
  // A save in the last moment may still be going out: the check waits for it.
  const recent = jState({ updatedAt: Date.now() - 2000 });
  r = await signOutWith(recent, rec(recent));
  eq('journey recent: not checked straight away', r.gets.length, 0);
  await new Promise(res => setTimeout(res, 700));
  await settle();
  eq('journey recent: checked once the save has had time', r.b.fetches.filter(f => /journey/.test(f.url)).length, 1);
  eq('journey recent: signed out', await r.p, true);
}

// /account counts a sign-out only once the visitor has said yes.
async function testAccountTracking() {
  const ACCOUNT = fs.readFileSync(path.join(ROOT, 'account.js'), 'utf8');
  const m = /\nfunction doSignOut\(\)\{[\s\S]*?\n\}\n/.exec(ACCOUNT);
  check('account: doSignOut found', !!m);
  if (!m) return;
  for (const choice of ['stay', 'go']) {
    const b = load(AUTH_NAV, makeBrowser({ storage: Object.assign({}, KEEP, ACCOUNT_DATA) }), 'auth-nav.js');
    const tracked = [];
    b.win.trackPageEvent = (name) => { tracked.push(name); b.order.push('track:' + name); };
    b.win.SK = 'propCalc_session_v1';
    vm.runInNewContext(m[0] + ';doSignOut();', b.win);
    await settle();
    eq('account ' + choice + ': nothing counted while the question is open', tracked, []);
    b.ids.get(choice === 'stay' ? 'anav-signout-cancel-btn' : 'anav-signout-confirm-btn').click();
    await settle(40);
    if (choice === 'stay') eq('account stay: not counted', tracked, []);
    else {
      eq('account go: counted once', tracked, ['user_signout']);
      check('account go: counted before the page moves on', b.order.indexOf('track:user_signout') !== -1 && b.order.indexOf('track:user_signout') < b.order.indexOf('navigate'), b.order);
    }
  }
}

// ── 3. The nav's Sign in link ────────────────────────────────────────────────
function testSignInLink() {
  const cases = [
    [{ pathname: '/tools/deposit-calculator' }, '/login?next=%2Ftools%2Fdeposit-calculator'],
    [{ pathname: '/journey', search: '?join=abcdef' }, '/login?next=%2Fjourney%3Fjoin%3Dabcdef'],
    [{ pathname: '/journey', hash: '#step-3' }, '/login?next=%2Fjourney%23step-3'],
    [{ pathname: '/journey', hash: '#somewhere' }, '/login?next=%2Fjourney'],
    [{ pathname: '/' }, '/login'],
  ];
  for (const [where, want] of cases) {
    const b = load(AUTH_NAV, makeBrowser(Object.assign({ navActions: true }, where)), 'auth-nav.js');
    eq('sign-in link on ' + where.pathname + (where.search || '') + (where.hash || ''), b.ids.get('anav-signin-link').attrs.href, want);
  }
  // The address changed after the nav was drawn: the click brings it up to date.
  const b = load(AUTH_NAV, makeBrowser({ navActions: true, pathname: '/journey' }), 'auth-nav.js');
  b.loc.hash = '#step-5';
  b.ids.get('anav-signin-link').click();
  eq('sign-in link updated on click', b.ids.get('anav-signin-link').attrs.href, '/login?next=%2Fjourney%23step-5');
}

// ── 4. safeNextUrl ───────────────────────────────────────────────────────────
function loginPage(opts) { return load(LOGIN, makeBrowser(Object.assign({ pathname: '/login' }, opts)), 'login.js'); }
function testSafeNext() {
  const f = loginPage().win.safeNextUrl;
  const J = '/journey';
  const cases = [
    ['', J], [null, J], [undefined, J], [42, J],
    ['/journey', J], ['journey', J], ['/journey.html', J],
    ['/journey?join=abc_DEF-123', '/journey?join=abc_DEF-123'],
    ['journey?join=abcdef', '/journey?join=abcdef'],
    ['/journey.html?join=abcdef', '/journey?join=abcdef'],
    ['/journey?join=ab', J],
    ['/journey#step-3', '/journey#step-3'], ['/journey#step-9', J], ['/journey#x', J],
    ['/app', '/app'], ['/account', '/account'], ['/portfolio', '/portfolio'], ['/pricing', '/pricing'], ['/admin', '/admin'],
    ['/account?panel=subscription', '/account'],
    ['/app?save=1', '/app?save=1'], ['/app?save=2', '/app'],
    ['/app?place=ab12cd34', '/app?place=ab12cd34'], ['/app?place=ab12', '/app'],
    ['/app?place=<script>', J], ['/app?place=%3Cscript%3E', J], ['/app?place="x"', J],
    ['/app?w=sc_1712345678', '/app?w=sc_1712345678'], ['/app?w=jp_ab12cd34', '/app?w=jp_ab12cd34'],
    ['/app?from=step3', '/app?from=step3'], ['/app?place=ab12cd34&x=1', '/app'],
    ['/tools/', '/tools/'], ['/tools', '/tools'],
    ['/tools/deposit-calculator', '/tools/deposit-calculator'],
    ['/tools/stamp-duty-calculator-qld', '/tools/stamp-duty-calculator-qld'],
    ['/tools/deposit-calculator.html', '/tools/deposit-calculator'],
    ['/tools/deposit-calculator?from=step3', '/tools/deposit-calculator?from=step3'],
    ['/tools/deposit-calculator?x=1', '/tools/deposit-calculator'],
    ['/tools/deposit1', J], ['/tools/../admin', J], ['/tools/a/b', J],
    ['/suburb/qld/acacia-ridge', '/suburb/qld/acacia-ridge'], ['/suburb/qld/acacia-ridge/', '/suburb/qld/acacia-ridge/'],
    ['/suburb/qld/<b>', J], ['/suburb/qld/acacia-ridge?x=1', '/suburb/qld/acacia-ridge'],
    ['//evil.example', J], ['//evil.example/journey', J], ['https://x', J], ['https://evil.example/journey', J],
    ['/\\evil.example', J], ['\\\\evil.example', J], ['javascript:alert(1)', J], ['/%2F%2Fevil.example', J],
    ['/\t/evil.example', J], ['/journey\n', J], [' /journey', J], ['/journey ', J],
    ['evil.example', J], ['/about', J], ['/', J], ['/' + 'a'.repeat(200), J],
  ];
  for (const [raw, want] of cases) eq('safeNextUrl(' + JSON.stringify(raw) + ')', f(raw), want);
}

// ── 5. Return without `next` ─────────────────────────────────────────────────
async function testReturnPaths() {
  const signedIn = { propCalc_session_v1: SESSION };
  // Already signed in, arrived from a tool page with no next: back to it.
  let b = loginPage({ storage: signedIn, referrer: 'https://equitysight.app/tools/deposit-calculator' });
  eq('referrer: back to the tool page', b.loc.href, '/tools/deposit-calculator');
  b = loginPage({ storage: signedIn, referrer: 'https://evil.example/tools/deposit-calculator' });
  eq('referrer: another site is ignored', b.loc.href, '/journey');
  b = loginPage({ storage: signedIn, referrer: 'https://equitysight.app/login?next=x' });
  eq('referrer: the login page itself is ignored', b.loc.href, '/journey');
  b = loginPage({ storage: signedIn, search: '?next=%2Fpricing', referrer: 'https://equitysight.app/tools/deposit-calculator' });
  eq('referrer: an explicit next wins', b.loc.href, '/pricing');
  b = loginPage({ storage: signedIn, search: '?next=%2F%2Fevil.example', referrer: 'https://equitysight.app/tools/deposit-calculator' });
  eq('referrer: a refused next does not fall back to the referrer', b.loc.href, '/journey');

  // Emailed sign-in link: comes back with ?magic= only, in a new tab.
  const remembered = { propCalc_login_next: JSON.stringify({ p: '/tools/deposit-calculator', at: Date.now() }) };
  const ok = { ok: true, id: 'u1', email: 'a@example.com', name: 'A', plan: 'free', role: 'user' };
  b = makeBrowser({ pathname: '/login', search: '?magic=TOKEN', storage: remembered, fetchReply: () => ok });
  b.doc.getElementById = (id) => id === 'page-spinner' ? { classList: { add() {}, remove() {} } } : null;
  load(LOGIN, b, 'login.js');
  await settle();
  eq('magic link: back to the page it was asked from', b.loc.href, '/tools/deposit-calculator');
  eq('magic link: remembered path used once', b.storage.getItem('propCalc_login_next'), null);
  const stale = { propCalc_login_next: JSON.stringify({ p: '/tools/deposit-calculator', at: Date.now() - 2 * 3600000 }) };
  b = makeBrowser({ pathname: '/login', search: '?magic=TOKEN', storage: stale, fetchReply: () => ok });
  b.doc.getElementById = (id) => id === 'page-spinner' ? { classList: { add() {}, remove() {} } } : null;
  load(LOGIN, b, 'login.js');
  await settle();
  eq('magic link: an hour-old path is not used', b.loc.href, '/journey');
  eq('magic link: an hour-old path is removed', b.storage.getItem('propCalc_login_next'), null);

  // The remembered path can hold a partner invite: every sign-in removes it,
  // whichever return path won.
  const invite = () => ({ propCalc_login_next: JSON.stringify({ p: '/journey?join=tok_abcdef', at: Date.now() }) });
  b = makeBrowser({ pathname: '/login', search: '?magic=TOKEN&next=%2Fpricing', storage: invite(), fetchReply: () => ok });
  b.doc.getElementById = (id) => id === 'page-spinner' ? { classList: { add() {}, remove() {} } } : null;
  load(LOGIN, b, 'login.js');
  await settle();
  eq('magic link + next: next wins', b.loc.href, '/pricing');
  eq('magic link + next: remembered path removed', b.storage.getItem('propCalc_login_next'), null);
  b = makeBrowser({ pathname: '/login', search: '?magic=TOKEN', storage: Object.assign(invite(), { propCalc_journey_pendingJoin: JSON.stringify({ t: 'tok_zzzzzz', at: Date.now() }) }), fetchReply: () => ok });
  b.doc.getElementById = (id) => id === 'page-spinner' ? { classList: { add() {}, remove() {} } } : null;
  load(LOGIN, b, 'login.js');
  await settle();
  eq('magic link + invite: the invite wins', b.loc.href, '/journey?join=tok_zzzzzz');
  eq('magic link + invite: remembered path removed', b.storage.getItem('propCalc_login_next'), null);
  // Password, code and Google sign-in all store the session with persistSession.
  b = loginPage({ storage: invite() });
  b.win.persistSession({ id: 'u1', email: 'a@example.com' }, { email: 'a@example.com' });
  eq('persistSession: remembered path removed', b.storage.getItem('propCalc_login_next'), null);
  eq('persistSession: session stored', JSON.parse(b.storage.getItem('propCalc_session_v1')).id, 'u1');
  // Already signed in on /login: sent on, and the remembered path goes.
  b = loginPage({ storage: Object.assign(invite(), signedIn) });
  eq('already signed in: remembered path removed', b.storage.getItem('propCalc_login_next'), null);
  // The partner case from the review: a link asked for from an invite, a
  // code sign-in, a sign-out, then someone else's emailed link.
  b = loginPage({ search: '?next=%2Fjourney%3Fjoin%3Dtok_abcdef' });
  vm.runInNewContext('rememberNext(nextAfterSignIn())', b.win);
  eq('partner: return path remembered when the link is asked for', JSON.parse(b.storage.getItem('propCalc_login_next')).p, '/journey?join=tok_abcdef');
  const later = load(AUTH_NAV, makeBrowser({ storage: { propCalc_session_v1: SESSION, propCalc_login_next: b.storage.getItem('propCalc_login_next') } }), 'auth-nav.js');
  await later.win.esForgetDevice();
  eq('partner: sign-out removes the remembered path', later.storage.getItem('propCalc_login_next'), null);
}

let finished = false;
process.on('exit', () => { if (!finished) { console.log('FAIL: stopped before the last check (a promise never settled)'); process.exitCode = 1; } });
(async function main() {
  await testForgetOwn();
  await testForgetKeepsUnlinkedJourney();
  await testForgetPartnerDevice();
  await testDetailsOwnership();
  await testFlushBeforeSignOut();
  await testUnsentAsks();
  await testConfirmFirst();
  await testConfirmAfterFlush();
  await testOtherTabs();
  await testDialogKeys();
  await testBackAfterSignOut();
  await testJourneyCheck();
  await testAccountTracking();
  testSignInLink();
  testSafeNext();
  await testReturnPaths();
  await testFlushTimeout();
  finished = true;
  if (failures) { console.log(failures + ' failed, ' + passes + ' passed'); process.exit(1); }
  console.log('signout-signin-test: all ' + passes + ' checks passed');
  process.exit(0);
})().catch(e => { console.log('FAIL (threw) ' + (e && e.stack || e)); process.exit(1); });

// stripe-billing-test.js — run with: node tests/stripe-billing-test.js
// Offline. fetch is replaced by an in-memory stand-in for both the Upstash
// REST API and the Stripe API, so nothing here reaches a real service.
// Guards the billing rules listed at the top of netlify/functions/stripe.js:
//   1. a webhook event is recorded as handled only after it was applied
//   2. an older subscription event never overwrites a newer one
//   3. the 3-day payment-failed grace
//   4. checkout only accepts the price ids configured for this site
//   5. deleting an account cancels its Stripe subscription first
//   6. two events for one customer are never applied at the same time
//   7. a plan removed for non-payment comes back when the payment arrives
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
process.env.AUTH_SALT = 'salt';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy_secret';
delete process.env.SITE_URL;

const crypto = require('crypto');
const fnDir = require('path').join(__dirname, '..', 'netlify', 'functions') + '/';
const sess = require(fnDir + '_session.js');

// ── Clock ────────────────────────────────────────────────────────────────────
// A fixed clock, one day after the session epoch so test sessions are fresh.
let nowMs = sess.SESSION_EPOCH_MS + 86400000;
Date.now = () => nowMs;
const nowSec = () => Math.floor(nowMs / 1000);
const DAY = 86400;

// ── Module output is captured, not printed ───────────────────────────────────
const logs = [];
console.log = console.warn = console.error = (...a) => { logs.push(a.map(String).join(' ')); };
const out = s => process.stdout.write(s + '\n');

// ── In-memory Redis (Upstash REST) ───────────────────────────────────────────
const store = new Map(); // key → { v: string | string[], exp: ms | 0 }
const timeline = [];     // every Redis command and Stripe call, in order
let redisFail = null;    // (cmds, isPipeline) → true to answer HTTP 500
let redisHook = null;    // (cmds, isPipeline) → runs before the commands do
let redisGate = null;    // async (cmds, isPipeline) → can hold a call part-way
const entry = k => { const e = store.get(k); if (e && e.exp && e.exp <= nowMs) { store.delete(k); return null; } return e || null; };
const put = (k, v, ttlSec) => store.set(k, { v, exp: ttlSec ? nowMs + ttlSec * 1000 : 0 });
const get = k => { const e = entry(k); return e ? e.v : null; };
const getJson = k => { const v = get(k); return v == null ? null : JSON.parse(v); };
const has = k => entry(k) !== null;
const ttlOf = k => { const e = entry(k); return e && e.exp ? Math.round((e.exp - nowMs) / 1000) : null; };
const liveKeys = () => [...store.keys()].filter(has);
function redisExec(a) {
  timeline.push({ kind: 'redis', cmd: a });
  const cmd = String(a[0]).toUpperCase();
  if (cmd === 'GET') return get(a[1]);
  if (cmd === 'SET') {
    const opts = a.slice(3).map(x => String(x).toUpperCase());
    if (opts.includes('NX') && has(a[1])) return null;
    if (opts.includes('XX') && !has(a[1])) return null;
    const ex = opts.indexOf('EX');
    put(a[1], String(a[2]), ex >= 0 ? Number(a[3 + ex + 1]) : 0);
    return 'OK';
  }
  if (cmd === 'SETEX') { put(a[1], String(a[3]), Number(a[2])); return 'OK'; }
  if (cmd === 'DEL') { const had = has(a[1]); store.delete(a[1]); return had ? 1 : 0; }
  if (cmd === 'LPUSH' || cmd === 'RPUSH') {
    const list = Array.isArray(get(a[1])) ? get(a[1]) : [];
    if (cmd === 'LPUSH') list.unshift(String(a[2])); else list.push(String(a[2]));
    put(a[1], list, 0); return list.length;
  }
  if (cmd === 'KEYS' || cmd === 'SCAN') {
    const pattern = cmd === 'KEYS' ? a[1] : a[3];
    const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const keys = liveKeys().filter(k => re.test(k));
    return cmd === 'KEYS' ? keys : ['0', keys];
  }
  return 0; // LTRIM, EXPIRE, SREM, INCR…: not needed by these tests
}

// ── Stripe API stand-in ──────────────────────────────────────────────────────
let stripeApi = null; // (method, path, params) → { status, body }
const stripeCalls = [];
const stripeAuthHeaders = new Set(); // every Authorization header sent to Stripe
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

global.fetch = async (url, opts) => {
  url = String(url); opts = opts || {};
  if (url.startsWith('https://redis.test')) {
    const body = JSON.parse(opts.body);
    const isPipeline = url.endsWith('/pipeline');
    const cmds = isPipeline ? body : [body];
    if (redisGate) await redisGate(cmds, isPipeline);
    if (redisHook) redisHook(cmds, isPipeline);
    if (redisFail && redisFail(cmds, isPipeline)) return res(500, { error: 'ERR simulated outage' });
    return isPipeline ? res(200, cmds.map(c => ({ result: redisExec(c) }))) : res(200, { result: redisExec(body) });
  }
  if (url.startsWith('https://api.stripe.com')) {
    const method = (opts.method || 'GET').toUpperCase();
    const path = url.slice('https://api.stripe.com'.length);
    const params = {};
    if (opts.body) for (const [k, v] of new URLSearchParams(opts.body)) params[k] = v;
    stripeAuthHeaders.add(String((opts.headers || {}).Authorization));
    const call = { kind: 'stripe', method, path, params };
    stripeCalls.push(call); timeline.push(call);
    const r = stripeApi ? stripeApi(method, path, params) : null;
    if (r instanceof Error) throw r;
    return r ? res(r.status, r.body) : res(200, {});
  }
  return res(200, {}); // email provider etc.
};

const stripeFn = require(fnDir + 'stripe.js');
const billing = require(fnDir + '_billing.js');
const auth = require(fnDir + 'auth.js');

// ── Test helpers ─────────────────────────────────────────────────────────────
let fails = 0, count = 0;
const t = (name, cond) => { count++; if (!cond) { fails++; out('  ✗ ' + name); } else out('  ✓ ' + name); };
const section = name => out('\n' + name);

const EMAIL = 'sub@example.com';
const USER_KEY = 'user:' + EMAIL;
const GRACE_KEY = 'subscription_grace:' + EMAIL;
const PASSWORD = 'correct horse';
const pwSalt = Buffer.alloc(16, 7);
const PW_HASH = 'scrypt$' + pwSalt.toString('hex') + '$' + crypto.scryptSync(PASSWORD, pwSalt, 64).toString('hex');

function reset(userOver) {
  store.clear(); timeline.length = 0; stripeCalls.length = 0; logs.length = 0;
  redisFail = null; redisHook = null; redisGate = null; stripeApi = null;
  nowMs = sess.SESSION_EPOCH_MS + 86400000;
  if (userOver !== null) {
    put(USER_KEY, JSON.stringify(Object.assign({
      id: 'u1', email: EMAIL, name: 'Sub Scriber', plan: 'pro', role: 'user', hash: PW_HASH, emailVerified: true,
      stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1',
    }, userOver || {})));
    put('cid:cus_1', EMAIL);
    put('uid:u1', EMAIL);
  }
  put('token:TOK', JSON.stringify({ userId: 'u1', email: EMAIL, name: 'Sub Scriber', plan: 'pro', role: 'user', expires: nowMs + sess.TOKEN_TTL_MS }));
}
const user = () => getJson(USER_KEY);
const userEvents = type => (get('events:u1') || []).map(s => JSON.parse(s)).filter(e => e.type === type).length;
const deadLetters = () => (get('stripe_deadletter') || []).length;

let seq = 0;
const ev = (type, object, created, previous) => ({
  id: 'evt_' + (++seq), object: 'event', type, created: created == null ? nowSec() : created,
  data: Object.assign({ object }, previous ? { previous_attributes: previous } : {}),
});
const sub = (status, over) => Object.assign({
  id: 'sub_1', object: 'subscription', customer: 'cus_1', status, metadata: { plan: 'pro' },
  currency: 'aud', items: { data: [{ price: { unit_amount: 899 } }] },
}, over || {});
const invoice = over => Object.assign({ id: 'in_1', object: 'invoice', customer: 'cus_1', attempt_count: 1 }, over || {});

const sign = (body, ts, secret) => 't=' + ts + ',v1=' + crypto.createHmac('sha256', secret || process.env.STRIPE_WEBHOOK_SECRET).update(ts + '.' + body).digest('hex');
async function deliver(event, sigHeader) {
  const body = JSON.stringify(event);
  const r = await stripeFn.handler({ httpMethod: 'POST', headers: { 'stripe-signature': sigHeader || sign(body, nowSec()) }, body });
  return { status: r.statusCode, body: JSON.parse(r.body), raw: r.body };
}
async function api(handler, body, opts) {
  opts = opts || {};
  const headers = {};
  if (opts.cookie !== null) headers.cookie = 'es_session=' + (opts.cookie || 'TOK');
  if (opts.origin) headers.origin = opts.origin;
  const r = await handler.handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.statusCode, body: JSON.parse(r.body), raw: r.body, headers: r.headers || {} };
}
const stripeError = (status, code, message) => ({ status, body: { error: { type: 'invalid_request_error', code, message } } });

// A check that waits for something that never happens must fail, not hang.
const watchdog = setTimeout(() => { out('stripe-billing-test: timed out after 60 s, a delivery never finished'); process.exit(1); }, 60000);
watchdog.unref();

(async () => {
  let r, e, e2;

  // ───────────────────────────────────────────────────────────────────────────
  section('Webhook signature');
  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  const eBody = JSON.stringify(e);
  r = await deliver(e, 't=' + nowSec() + ',v1=' + '0'.repeat(64));
  t('wrong signature is rejected with 400', r.status === 400 && user().plan === 'pro');
  r = await deliver(e, sign(eBody, nowSec(), 'whsec_someone_else'));
  t('signature made with another secret is rejected', r.status === 400);
  r = await deliver(e, sign(JSON.stringify(Object.assign({}, e, { type: 'x' })), nowSec()));
  t('signature for a different body is rejected', r.status === 400);
  r = await deliver(e, sign(eBody, nowSec() - 301));
  t('correctly signed but 5 minutes stale is rejected', r.status === 400);
  r = await deliver(e, sign(eBody, nowSec() + 301));
  t('timestamp from the future is rejected', r.status === 400);
  r = await deliver(e, 't=' + nowSec());
  t('header without a v1 signature is rejected', r.status === 400);
  t('nothing was written by any rejected delivery', user().plan === 'pro' && !has('stripe_event:' + e.id) && !has('stripe_event_lock:' + e.id));
  r = await deliver(e, sign(eBody, nowSec() - 299));
  t('a valid signature inside the tolerance is accepted', r.status === 200 && user().plan === 'free');

  // ───────────────────────────────────────────────────────────────────────────
  section('Webhook idempotency');
  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  r = await deliver(e);
  t('first delivery is applied', r.status === 200 && user().plan === 'free' && userEvents('plan_downgraded') === 1);
  t('…recorded as done for 7 days, lock released', ttlOf('stripe_event:' + e.id) === 604800 && !has('stripe_event_lock:' + e.id));
  put(USER_KEY, JSON.stringify(Object.assign(user(), { plan: 'pro' }))); // would be undone if the event ran again
  r = await deliver(e);
  t('duplicate delivery of a handled event returns 200 and changes nothing', r.status === 200 && r.body.duplicate === true && user().plan === 'pro' && userEvents('plan_downgraded') === 1);

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  redisFail = (cmds, pipe) => pipe && cmds.some(c => c[0] === 'SET' && c[1] === USER_KEY);
  r = await deliver(e);
  t('a database failure while applying returns 500', r.status === 500 && r.body.received === false);
  t('…with no error detail in the reply', !/simulated|Redis|HTTP 500/i.test(r.raw));
  t('…the event is NOT recorded as done and the lock is released', !has('stripe_event:' + e.id) && !has('stripe_event_lock:' + e.id) && user().plan === 'pro');
  redisFail = null;
  r = await deliver(e);
  t('the retry is applied', r.status === 200 && !r.body.duplicate && user().plan === 'free');
  r = await deliver(e);
  t('…and applied once only', r.body.duplicate === true && userEvents('plan_downgraded') === 1);

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  redisFail = cmds => cmds.some(c => c[0] === 'SET' && c[1] === 'stripe_event:' + e.id);
  r = await deliver(e);
  t('failing to record the event as done also returns 500', r.status === 500 && !has('stripe_event:' + e.id) && !has('stripe_event_lock:' + e.id));
  redisFail = null;
  r = await deliver(e);
  t('…and the retry leaves one consistent result', r.status === 200 && user().plan === 'free' && has('stripe_event:' + e.id));

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  const both = await Promise.all([deliver(e), deliver(e)]);
  t('two overlapping deliveries: one 200, one 409', both.map(x => x.status).sort().join() === '200,409');
  t('…applied once', user().plan === 'free' && userEvents('plan_downgraded') === 1);
  r = await deliver(e);
  t('…and the retry of the 409 is a duplicate', r.status === 200 && r.body.duplicate === true && userEvents('plan_downgraded') === 1);

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  put('stripe_event_lock:' + e.id, '1', 120); // left behind by an invocation that died
  r = await deliver(e);
  t('a held lock gives a retryable 409 and applies nothing', r.status === 409 && user().plan === 'pro' && !has('stripe_event:' + e.id));
  nowMs += 121000;
  r = await deliver(e);
  t('…once the lock has expired the event is applied', r.status === 200 && user().plan === 'free');

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  redisFail = () => true;
  r = await deliver(e);
  t('database unreachable returns 503', r.status === 503);
  redisFail = null;
  t('…and nothing was recorded', !has('stripe_event:' + e.id) && user().plan === 'pro');

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  put('stripe_event:' + e.id, '1', 3600); // marker written by the old code
  r = await deliver(e);
  t('an event already marked by the old code is still a duplicate', r.status === 200 && r.body.duplicate === true && user().plan === 'pro');

  reset();
  timeline.length = 0;
  r = await deliver(ev('customer.created', { id: 'cus_9' }));
  t('an event type this site does not use returns 200 without touching the database', r.status === 200 && timeline.length === 0);
  r = await deliver({ id: 'evt_bad', type: 'customer.subscription.deleted' });
  t('a signed payload with no data.object is refused', r.status === 400);

  reset();
  e = ev('checkout.session.completed', { id: 'cs_1', customer_email: 'nobody@example.com', customer: 'cus_2', subscription: 'sub_2', metadata: { plan: 'pro' } });
  r = await deliver(e);
  t('an event that matches no user is dead-lettered and returns 200', r.status === 200 && deadLetters() === 1 && has('stripe_event:' + e.id));
  r = await deliver(e);
  t('…and is not dead-lettered twice', r.body.duplicate === true && deadLetters() === 1);
  e = ev('invoice.payment_failed', invoice({ customer: 'cus_unknown' }));
  r = await deliver(e);
  t('payment_failed for an unknown customer is dead-lettered and returns 200', r.status === 200 && deadLetters() === 2);
  e = ev('customer.subscription.deleted', sub('canceled', { customer: 'cus_unknown', id: 'sub_x' }));
  r = await deliver(e);
  t('a cancellation for an unknown customer returns 200 and creates no user', r.status === 200 && liveKeys().filter(k => k.startsWith('user:')).length === 1);

  reset(null);
  put('user:new@example.com', JSON.stringify({ id: 'u2', email: 'new@example.com', plan: 'free' }));
  e = ev('checkout.session.completed', { id: 'cs_2', customer_email: 'New@Example.com', customer: 'cus_2', subscription: 'sub_2', metadata: { plan: 'pro' } });
  r = await deliver(e);
  const upgraded = getJson('user:new@example.com');
  t('checkout.session.completed still upgrades the buyer', r.status === 200 && upgraded.plan === 'pro' && upgraded.stripeCustomerId === 'cus_2' && upgraded.stripeSubscriptionId === 'sub_2' && get('cid:cus_2') === 'new@example.com');

  // ───────────────────────────────────────────────────────────────────────────
  section('Out-of-order delivery');
  reset();
  const T = nowSec();
  r = await deliver(ev('customer.subscription.deleted', sub('canceled'), T));
  t('newer event (deleted) removes Pro', user().plan === 'free');
  r = await deliver(ev('customer.subscription.updated', sub('active'), T - 600));
  t('an older "active" update arriving later does not give Pro back', r.status === 200 && user().plan === 'free' && !user().stripeSubscriptionId);
  r = await deliver(ev('customer.subscription.updated', sub('active'), T));
  t('nor does an "active" update from the same second as the cancellation', user().plan === 'free');
  r = await deliver(ev('checkout.session.completed', { id: 'cs_3', customer_email: EMAIL, customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'pro' } }, T - 900));
  t('nor does a late checkout event for the ended subscription', r.status === 200 && user().plan === 'free');

  reset();
  r = await deliver(ev('customer.subscription.updated', sub('active'), T));
  r = await deliver(ev('customer.subscription.updated', sub('past_due'), T - 600, { status: 'active' }));
  t('an older past_due arriving after a newer active changes nothing', r.status === 200 && user().plan === 'pro' && !has(GRACE_KEY) && !user().paymentFailedAt);
  r = await deliver(ev('customer.subscription.updated', sub('canceled'), T - 300));
  t('an older "canceled" update arriving after a newer active keeps Pro', user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1');
  r = await deliver(ev('customer.subscription.deleted', sub('canceled'), T + 60));
  t('a newer event is still applied', user().plan === 'free');

  // The record tracks sub_1 and a different subscription of the same customer
  // ends. Stripe is asked whether sub_1 is still running.
  const trackedIs = status => (m, p) => (m === 'GET' && p === '/v1/subscriptions/sub_1') ? { status: 200, body: { id: 'sub_1', status } } : null;
  const otherEnded = () => ev('customer.subscription.deleted', sub('canceled', { id: 'sub_other' }));
  for (const st of ['active', 'trialing', 'past_due', 'unpaid']) {
    reset(); stripeApi = trackedIs(st);
    r = await deliver(otherEnded());
    t('the end of a different subscription keeps Pro while the tracked one is ' + st, r.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && stripeCalls.length === 1 && stripeCalls[0].path === '/v1/subscriptions/sub_1');
  }
  reset(); stripeApi = trackedIs('canceled');
  r = await deliver(otherEnded());
  t('…and removes Pro when the tracked id is out of date (Stripe says that one is canceled)', r.status === 200 && user().plan === 'free' && !user().stripeSubscriptionId && userEvents('plan_downgraded') === 1);
  reset(); stripeApi = () => stripeError(500, 'api_error', 'boom');
  e = otherEnded();
  r = await deliver(e);
  t('…if Stripe cannot be asked, the event is left for a retry and Pro stays', r.status === 500 && user().plan === 'pro' && !has('stripe_event:' + e.id));
  stripeApi = trackedIs('canceled');
  r = await deliver(e);
  t('…and the retry settles it', r.status === 200 && user().plan === 'free');
  reset(); stripeApi = () => stripeError(404, 'resource_missing', "No such subscription: 'sub_1'");
  r = await deliver(otherEnded());
  t('…if Stripe has never heard of the tracked id, Pro stays and the event is dead-lettered', r.status === 200 && user().plan === 'pro' && deadLetters() === 1);
  reset(); stripeApi = trackedIs('canceled');
  r = await deliver(ev('customer.subscription.updated', sub('unpaid', { id: 'sub_other', metadata: {} })));
  t('an unpaid other subscription, with the tracked one canceled, removes Pro and becomes the tracked one', user().plan === 'free' && user().stripeSubscriptionId === 'sub_other' && user().stripeLapsedPlan === 'pro');
  reset();
  r = await deliver(ev('customer.subscription.updated', sub('past_due', { id: 'sub_other' }), nowSec(), { status: 'active' }));
  t('a past_due update for a different subscription changes nothing and asks Stripe nothing', r.status === 200 && user().plan === 'pro' && !has(GRACE_KEY) && stripeCalls.length === 0);

  // ───────────────────────────────────────────────────────────────────────────
  section('Payment-failed grace');
  reset();
  const T0 = nowSec();
  r = await deliver(ev('invoice.payment_failed', invoice(), T0));
  t('invoice.payment_failed starts a 3-day grace and keeps Pro', r.status === 200 && user().plan === 'pro' && user().paymentFailedAt === T0 * 1000 && ttlOf(GRACE_KEY) === 3 * DAY);
  r = await deliver(ev('customer.subscription.updated', sub('past_due'), T0, { status: 'active' }));
  t('past_due within grace keeps Pro', r.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1');
  nowMs += 2 * DAY * 1000;
  r = await deliver(ev('invoice.payment_failed', invoice({ attempt_count: 2 })));
  t('a failed retry two days later does not extend the grace', user().paymentFailedAt === T0 * 1000 && ttlOf(GRACE_KEY) === DAY);
  r = await deliver(ev('customer.subscription.updated', sub('past_due'), nowSec(), { latest_invoice: 'in_0' }));
  t('past_due on day 2 still keeps Pro', user().plan === 'pro');
  nowMs += (DAY + 1) * 1000;
  t('the grace flag is gone after 3 days', !has(GRACE_KEY));
  r = await deliver(ev('invoice.payment_failed', invoice({ attempt_count: 3 })));
  t('a failed retry after the grace does not start a new one, and does not remove Pro by itself', !has(GRACE_KEY) && user().plan === 'pro');
  r = await deliver(ev('customer.subscription.updated', sub('past_due'), nowSec(), { latest_invoice: 'in_0' }));
  t('past_due after the grace has expired removes Pro', r.status === 200 && user().plan === 'free' && userEvents('plan_downgraded') === 1);
  t('…and the failure stays on record until Stripe reports a payment or the end', user().paymentFailedAt === T0 * 1000);
  t('…the subscription id stays, because the subscription is still alive in Stripe', user().stripeSubscriptionId === 'sub_1' && user().stripeLapsedPlan === 'pro');
  r = await deliver(ev('customer.subscription.updated', sub('active')));
  t('paying after that gives Pro back and clears the failure', user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && user().paymentFailedAt === undefined && user().paymentFailureReason === undefined && user().stripeLapsedPlan === undefined);

  reset();
  r = await deliver(ev('customer.subscription.updated', sub('past_due'), T0, { status: 'active' }));
  t('past_due arriving BEFORE invoice.payment_failed starts the grace instead of removing Pro', user().plan === 'pro' && ttlOf(GRACE_KEY) === 3 * DAY && user().paymentFailedAt === T0 * 1000);
  nowMs += 3600 * 1000;
  r = await deliver(ev('invoice.payment_failed', invoice(), T0));
  t('…and the payment_failed that follows does not move it', ttlOf(GRACE_KEY) === 3 * DAY - 3600 && user().paymentFailedAt === T0 * 1000);

  reset();
  nowMs += DAY * 1000;
  r = await deliver(ev('invoice.payment_failed', invoice(), T0)); // delivered a day late
  t('the grace is dated from the Stripe event, not from when it was delivered', ttlOf(GRACE_KEY) === 2 * DAY && user().paymentFailedAt === T0 * 1000);

  reset({ paymentFailedAt: (T0 - 40 * DAY) * 1000, paymentFailureReason: 'card declined' }); // never cleared by the old code
  r = await deliver(ev('customer.subscription.updated', sub('past_due'), T0, { status: 'active' }));
  t('a stale failure left by the old code does not cost a new failure its grace', user().plan === 'pro' && ttlOf(GRACE_KEY) === 3 * DAY && user().paymentFailedAt === T0 * 1000);

  for (const [label, event] of [
    ['customer.subscription.deleted', () => ev('customer.subscription.deleted', sub('canceled'))],
    ['status canceled', () => ev('customer.subscription.updated', sub('canceled'))],
    ['status incomplete_expired', () => ev('customer.subscription.updated', sub('incomplete_expired'))],
  ]) {
    reset();
    await deliver(ev('invoice.payment_failed', invoice()));
    r = await deliver(event());
    const u = user();
    t(label + ' removes Pro even inside the grace, and clears the failure', r.status === 200 && u.plan === 'free' && !u.stripeSubscriptionId && u.stripeLapsedPlan === undefined && u.paymentFailedAt === undefined && !has(GRACE_KEY));
  }
  // unpaid also removes Pro at once, but Stripe keeps that subscription and
  // reactivates it when the invoice is paid.
  reset();
  await deliver(ev('invoice.payment_failed', invoice()));
  r = await deliver(ev('customer.subscription.updated', sub('unpaid', { metadata: {} })));
  t('status unpaid removes Pro even inside the grace', r.status === 200 && user().plan === 'free' && userEvents('plan_downgraded') === 1);
  t('…and keeps the subscription id and the plan it had', user().stripeSubscriptionId === 'sub_1' && user().stripeLapsedPlan === 'pro');
  nowMs += 3600 * 1000;
  r = await deliver(ev('customer.subscription.updated', sub('active', { metadata: {} }), nowSec(), { status: 'unpaid' }));
  t('…so paying the invoice gives Pro back', user().plan === 'pro' && user().stripeLapsedPlan === undefined && user().paymentFailedAt === undefined && !has(GRACE_KEY));

  for (const type of ['invoice.paid', 'invoice.payment_succeeded']) {
    reset();
    await deliver(ev('invoice.payment_failed', invoice(), T0));
    r = await deliver(ev(type, invoice(), T0 - 30 * DAY));
    t(type + ' older than the failure does not clear it', r.status === 200 && has(GRACE_KEY) && user().paymentFailedAt === T0 * 1000);
    nowMs += 3600 * 1000;
    r = await deliver(ev(type, invoice()));
    t(type + ' clears the grace flag and paymentFailedAt, Pro stays', r.status === 200 && !has(GRACE_KEY) && user().paymentFailedAt === undefined && user().paymentFailureReason === undefined && user().plan === 'pro');
  }

  reset();
  await deliver(ev('invoice.payment_failed', invoice(), T0));
  nowMs += 3600 * 1000;
  r = await deliver(ev('customer.subscription.updated', sub('active'), nowSec(), { status: 'past_due' }));
  t('subscription back to active clears the grace flag and paymentFailedAt', !has(GRACE_KEY) && user().paymentFailedAt === undefined && user().plan === 'pro');
  nowMs += 30 * DAY * 1000;
  r = await deliver(ev('invoice.payment_failed', invoice({ id: 'in_2' })));
  t('a new failure next month gets its own 3 days', ttlOf(GRACE_KEY) === 3 * DAY && user().plan === 'pro');

  reset();
  put('token:TOK', JSON.stringify({ userId: 'u1', email: EMAIL, plan: 'pro', role: 'user', expires: nowMs + sess.TOKEN_TTL_MS }));
  timeline.length = 0;
  r = await deliver(ev('invoice.paid', invoice()));
  t('invoice.paid with nothing to clear does not rewrite the user record', r.status === 200 && !timeline.some(x => x.kind === 'redis' && x.cmd[0] === 'SET' && x.cmd[1] === USER_KEY));

  reset();
  await deliver(ev('invoice.payment_failed', invoice(), T0));
  stripeApi = (m, p) => p.startsWith('/v1/subscriptions/sub_1') ? { status: 200, body: { id: 'sub_1', status: 'past_due', cancel_at_period_end: false, current_period_end: T0 + 20 * DAY, items: { data: [{ price: { unit_amount: 899, currency: 'aud', recurring: { interval: 'month' } } }] } } } : null;
  r = await api(stripeFn, { action: 'getSubscriptionStatus' });
  t('billing status reports the failure and when the grace ends', r.body.ok === true && r.body.status === 'past_due' && r.body.paymentFailedAt === T0 * 1000 && r.body.graceEndsAt === (T0 + 3 * DAY) * 1000 && r.body.plan === 'pro');
  nowMs += (3 * DAY + 1) * 1000;
  put('token:TOK', JSON.stringify({ userId: 'u1', email: EMAIL, plan: 'pro', role: 'user', expires: nowMs + sess.TOKEN_TTL_MS }));
  r = await api(stripeFn, { action: 'getSubscriptionStatus' });
  t('…once the grace is over it still reports the failure, without an end date', r.body.ok === true && r.body.status === 'past_due' && r.body.plan === 'pro' && r.body.graceEndsAt === null && r.body.paymentFailedAt === T0 * 1000 && r.body.lapsedPlan === null);
  reset();
  await deliver(ev('invoice.payment_failed', invoice(), T0));
  stripeApi = () => ({ status: 200, body: { id: 'sub_1', status: 'active', cancel_at_period_end: false, cancel_at: T0 + 9 * DAY, items: { data: [{ current_period_end: T0 + 20 * DAY, price: { unit_amount: 899, currency: 'aud', recurring: { interval: 'month' } } }] } } });
  r = await api(stripeFn, { action: 'getSubscriptionStatus' });
  t('billing status shows no failure when Stripe says the subscription is active', r.body.status === 'active' && r.body.graceEndsAt === null && r.body.paymentFailedAt === null && r.body.lapsedPlan === null);
  t('billing status reads cancel_at and the item-level period end', r.body.cancelAtPeriodEnd === true && r.body.cancelAt === T0 + 9 * DAY && r.body.currentPeriodEnd === T0 + 20 * DAY);
  t('billing status still carries the fields account.js reads', ['status', 'plan', 'currentPeriodEnd', 'cancelAtPeriodEnd', 'priceAmount', 'priceCurrency', 'priceInterval', 'cardBrand', 'cardLast4'].every(k => k in r.body));

  // ───────────────────────────────────────────────────────────────────────────
  section('Plan removed for non-payment: late payment, account page');
  // The subscription carries no plan metadata, so nothing but the record says
  // which plan to give back.
  const bare = (status, over) => sub(status, Object.assign({ metadata: {} }, over || {}));
  const stripeSubIs = status => (m, p) => p.startsWith('/v1/subscriptions/sub_1') ? { status: 200, body: { id: 'sub_1', status, cancel_at_period_end: false, current_period_end: nowSec() + 20 * DAY, items: { data: [{ price: { unit_amount: 899, currency: 'aud', recurring: { interval: 'month' } } }] } } }
    : p === '/v1/billing_portal/sessions' ? { status: 200, body: { url: 'https://billing.stripe.test/p' } } : null;
  const freshToken = () => put('token:TOK', JSON.stringify({ userId: 'u1', email: EMAIL, plan: 'pro', role: 'user', expires: nowMs + sess.TOKEN_TTL_MS }));
  // Failure on day 0, then a past_due update on day 4 (the card was changed in the portal).
  async function lapse() {
    reset();
    const t0 = nowSec();
    await deliver(ev('invoice.payment_failed', invoice(), t0));
    await deliver(ev('customer.subscription.updated', bare('past_due'), t0, { status: 'active' }));
    nowMs += 4 * DAY * 1000;
    freshToken();
    await deliver(ev('customer.subscription.updated', bare('past_due'), nowSec(), { default_payment_method: 'pm_old' }));
    return t0;
  }
  let L0 = await lapse();
  t('past_due after the grace removes Pro and keeps the subscription id', user().plan === 'free' && user().stripeSubscriptionId === 'sub_1' && user().stripeLapsedPlan === 'pro' && user().paymentFailedAt === L0 * 1000);
  stripeApi = stripeSubIs('past_due');
  r = await api(stripeFn, { action: 'getSubscriptionStatus' });
  t('billing status then reports Stripe\'s real status, the failure and the plan that is off', r.body.ok === true && r.body.status === 'past_due' && r.body.plan === 'free' && r.body.lapsedPlan === 'pro' && r.body.paymentFailedAt === L0 * 1000 && r.body.graceEndsAt === null);
  put(GRACE_KEY, String(nowMs), 3 * DAY);
  r = await api(stripeFn, { action: 'getSubscriptionStatus' });
  t('…and never a "stays on until" date once the plan is off', r.body.graceEndsAt === null && r.body.lapsedPlan === 'pro');
  store.delete(GRACE_KEY);
  stripeCalls.length = 0;
  r = await api(stripeFn, { action: 'createPortalSession', returnUrl: 'https://equitysight.app/account', flow: 'cancel' });
  t('…and the cancel page still opens for that subscription', r.body.ok === true && stripeCalls.length === 1 && stripeCalls[0].params['flow_data[subscription_cancel][subscription]'] === 'sub_1');
  stripeApi = null;
  nowMs += 3600 * 1000;
  r = await deliver(ev('customer.subscription.updated', bare('past_due'), nowSec(), { default_payment_method: 'pm_older' }));
  t('another past_due update changes nothing and is not counted as a second downgrade', r.status === 200 && user().plan === 'free' && user().stripeLapsedPlan === 'pro' && user().stripeSubscriptionId === 'sub_1' && userEvents('plan_downgraded') === 1);
  nowMs += 60 * 1000;
  r = await deliver(ev('invoice.paid', invoice()));
  t('invoice.paid clears the failure', r.status === 200 && user().paymentFailedAt === undefined);
  r = await deliver(ev('customer.subscription.updated', bare('active'), nowSec(), { status: 'past_due' }));
  t('the late payment gives Pro back although the subscription has no plan metadata', r.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && user().stripeLapsedPlan === undefined && userEvents('plan_upgraded') === 1);

  L0 = await lapse();
  nowMs += 60 * 1000;
  r = await deliver(ev('customer.subscription.updated', bare('active'), nowSec(), { status: 'past_due' }));
  t('the same when the subscription update arrives before invoice.paid', user().plan === 'pro' && user().paymentFailedAt === undefined && user().stripeLapsedPlan === undefined);
  r = await deliver(ev('invoice.paid', invoice()));
  t('…and invoice.paid then leaves Pro on', r.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1');

  L0 = await lapse();
  r = await deliver(ev('customer.subscription.updated', bare('active'), L0 - 60));
  t('an "active" update older than the downgrade does not give Pro back', r.status === 200 && user().plan === 'free');
  r = await deliver(ev('customer.subscription.updated', bare('active', { id: 'sub_other' })));
  t('nor does an active subscription that is not the one that lapsed', r.status === 200 && user().plan === 'free' && user().stripeSubscriptionId === 'sub_1');
  nowMs += 60 * 1000;
  r = await deliver(ev('customer.subscription.deleted', bare('canceled')));
  t('cancelling the lapsed subscription clears the record', r.status === 200 && user().plan === 'free' && !user().stripeSubscriptionId && user().stripeLapsedPlan === undefined && user().paymentFailedAt === undefined);
  t('…and the downgrade is still counted once', userEvents('plan_downgraded') === 1);
  r = await deliver(ev('customer.subscription.updated', bare('active'), nowSec() + 60));
  t('…after which nothing gives Pro back', user().plan === 'free');

  reset({ plan: 'free', stripeSubscriptionId: undefined });
  r = await deliver(ev('customer.subscription.updated', bare('active')));
  t('a free account that never lapsed is not given Pro by an active subscription without metadata', r.status === 200 && user().plan === 'free');
  reset({ stripeSubscriptionId: undefined });
  await deliver(ev('invoice.payment_failed', invoice()));
  nowMs += 4 * DAY * 1000;
  r = await deliver(ev('customer.subscription.updated', bare('past_due'), nowSec(), { default_payment_method: 'pm_old' }));
  t('a record with no subscription id learns it when the plan is removed', user().plan === 'free' && user().stripeSubscriptionId === 'sub_1' && user().stripeLapsedPlan === 'pro');

  // ───────────────────────────────────────────────────────────────────────────
  section('One event at a time per customer');
  const CUS_LOCK = 'stripe_customer_lock:cus_1';
  const isUserWrite = cmds => cmds.some(c => c[0] === 'SET' && c[1] === USER_KEY);
  const isCustomerLock = cmds => cmds.some(c => c[0] === 'SET' && c[1] === CUS_LOCK);
  const noLocksLeft = () => !liveKeys().some(k => /_lock:/.test(k));
  // Holds the first Redis call matching `pred` until release() is called.
  const holdAt = pred => {
    let release, reachedFn, held = false;
    const reached = new Promise(resolve => { reachedFn = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    return { reached, release, check: async (cmds, pipe) => { if (!held && pred(cmds, pipe)) { held = true; reachedFn(); await gate; } } };
  };
  // Delivers `first` and holds it part-way (at `pred`), then delivers `second`.
  // ranThrough says whether `second` was applied while `first` was still held.
  async function overlap(first, pred, second) {
    const h = holdAt(pred);
    let lockTries = 0, queuedFn;
    const queued = new Promise(resolve => { queuedFn = resolve; });
    redisGate = async (cmds, pipe) => { if (isCustomerLock(cmds) && ++lockTries === 2) queuedFn(); await h.check(cmds, pipe); };
    const p1 = deliver(first); await h.reached;
    const p2 = deliver(second);
    const ranThrough = await Promise.race([p2.then(() => true), queued.then(() => false)]);
    const mid = user();
    h.release();
    const r1 = await p1, r2 = await p2;
    redisGate = null;
    return { ranThrough, mid, r1, r2 };
  }
  // Skips the real waiting between tries for the customer lock.
  const realSetTimeout = global.setTimeout;
  const fastTimers = on => { global.setTimeout = on ? (fn, ms, ...a) => realSetTimeout(fn, 0, ...a) : realSetTimeout; };
  let o;

  // A late payment after the plan was removed: invoice.paid is part-way
  // (about to write the user record) when the "active" update arrives.
  reset({ plan: 'free', stripeLapsedPlan: 'pro', paymentFailedAt: (nowSec() - 5 * DAY) * 1000, paymentFailureReason: 'card declined' });
  o = await overlap(ev('invoice.paid', invoice()), isUserWrite, ev('customer.subscription.updated', sub('active'), nowSec(), { status: 'past_due' }));
  t('a second event for the same customer waits while the first is part-way', o.ranThrough === false && o.mid.plan === 'free' && o.mid.paymentFailedAt !== undefined);
  t('…then both are applied and the paid-up subscriber is on Pro', o.r1.status === 200 && o.r2.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && user().paymentFailedAt === undefined);
  t('…with no lock left behind', noLocksLeft());

  // Inside the grace: a past_due update (card changed) is part-way, about to
  // read the grace flag, when the "active" update of the same second arrives.
  const inGrace = () => {
    reset();
    put(USER_KEY, JSON.stringify(Object.assign(user(), { paymentFailedAt: (nowSec() - DAY) * 1000, paymentFailureReason: 'card declined' })));
    put(GRACE_KEY, String((nowSec() - DAY) * 1000), 2 * DAY);
  };
  const cardChanged = created => ev('customer.subscription.updated', sub('past_due'), created, { default_payment_method: 'pm_old' });
  const paidUp = created => ev('customer.subscription.updated', sub('active'), created, { status: 'past_due' });
  const isGraceRead = cmds => cmds.some(c => c[0] === 'GET' && c[1] === GRACE_KEY);
  inGrace();
  o = await overlap(cardChanged(nowSec()), isGraceRead, paidUp(nowSec()));
  t('a card change overlapping the recovered payment leaves the subscriber on Pro', o.ranThrough === false && o.r1.status === 200 && o.r2.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && user().paymentFailedAt === undefined && !has(GRACE_KEY));
  inGrace();
  o = await overlap(cardChanged(nowSec() - 1), isGraceRead, paidUp(nowSec()));
  t('…also when the card change is one second older', o.ranThrough === false && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && user().paymentFailedAt === undefined);
  inGrace();
  o = await overlap(paidUp(nowSec()), isUserWrite, cardChanged(nowSec()));
  t('…and when the payment is the one part-way', o.ranThrough === false && o.r1.status === 200 && o.r2.status === 200 && user().plan === 'pro' && user().stripeSubscriptionId === 'sub_1' && noLocksLeft());

  // The first event stays part-way for longer than the second will wait.
  reset();
  const hold = holdAt(isUserWrite);
  let lockTries = 0;
  redisGate = async (cmds, pipe) => { if (isCustomerLock(cmds)) lockTries++; await hold.check(cmds, pipe); };
  e = ev('customer.subscription.deleted', sub('canceled'));
  e2 = ev('invoice.payment_failed', invoice());
  const pHeld = deliver(e); await hold.reached;
  fastTimers(true);
  r = await deliver(e2);
  fastTimers(false);
  t('an event that cannot have the customer within the wait gets a retryable 409', r.status === 409 && r.body.retry === true && lockTries > 2);
  t('…nothing of it is applied or recorded, and its own lock is released', !has('stripe_event:' + e2.id) && !has('stripe_event_lock:' + e2.id) && !has(GRACE_KEY) && user().plan === 'pro' && has(CUS_LOCK));
  hold.release(); redisGate = null;
  r = await pHeld;
  t('…the first event still completes', r.status === 200 && user().plan === 'free' && noLocksLeft());
  r = await deliver(e2);
  t('…and the retry of the second one is then handled', r.status === 200 && !r.body.duplicate && has('stripe_event:' + e2.id));

  reset();
  put(CUS_LOCK, '1', 120); // left behind by an invocation that died
  e = ev('customer.subscription.deleted', sub('canceled'));
  fastTimers(true);
  r = await deliver(e);
  fastTimers(false);
  t('a customer lock left behind gives a retryable 409 and applies nothing', r.status === 409 && user().plan === 'pro' && !has('stripe_event:' + e.id) && !has('stripe_event_lock:' + e.id));
  nowMs += 121000;
  r = await deliver(e);
  t('…once it has expired the event is applied', r.status === 200 && user().plan === 'free' && noLocksLeft());

  reset();
  put('user:other@example.com', JSON.stringify({ id: 'u2', email: 'other@example.com', plan: 'pro', stripeCustomerId: 'cus_2', stripeSubscriptionId: 'sub_2' }));
  put('cid:cus_2', 'other@example.com');
  const hold2 = holdAt(isUserWrite);
  redisGate = hold2.check;
  const pHeld2 = deliver(ev('customer.subscription.deleted', sub('canceled'))); await hold2.reached;
  r = await deliver(ev('customer.subscription.deleted', sub('canceled', { id: 'sub_2', customer: 'cus_2' })));
  t('an event for another customer is not held up', r.status === 200 && getJson('user:other@example.com').plan === 'free' && user().plan === 'pro');
  hold2.release(); redisGate = null;
  await pHeld2;

  reset();
  e = ev('customer.subscription.deleted', sub('canceled'));
  redisFail = (cmds, pipe) => pipe;
  r = await deliver(e);
  t('an event that fails releases the customer lock as well', r.status === 500 && noLocksLeft());
  redisFail = cmds => isCustomerLock(cmds);
  r = await deliver(e);
  t('if the customer lock cannot be asked for, the reply is 503 and nothing is recorded', r.status === 503 && !has('stripe_event:' + e.id) && noLocksLeft() && user().plan === 'pro');
  redisFail = null;
  timeline.length = 0;
  r = await deliver(e);
  const firstUserRead = timeline.findIndex(x => x.kind === 'redis' && x.cmd[1] === USER_KEY);
  const lockTaken = timeline.findIndex(x => x.kind === 'redis' && x.cmd[0] === 'SET' && x.cmd[1] === CUS_LOCK);
  t('the customer lock is taken before the user record is read', r.status === 200 && lockTaken >= 0 && lockTaken < firstUserRead);

  // ───────────────────────────────────────────────────────────────────────────
  section('Checkout price ids');
  const checkoutStripe = (m, p) => p === '/v1/checkout/sessions' ? { status: 200, body: { id: 'cs_new', url: 'https://checkout.stripe.test/cs_new' } } : stripeError(404, 'resource_missing', 'No such coupon');
  const lastCheckout = () => stripeCalls.filter(c => c.path === '/v1/checkout/sessions').pop();
  reset();
  put('config:site', JSON.stringify({ stripeProMonthly: 'price_cfgProM', stripeProAnnual: 'price_cfgProY', stripeAdviserMonthly: 'price_cfgAdvM' }));
  stripeApi = checkoutStripe;
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_cfgProM' }, { cookie: null });
  t('checkout without a session is refused with 401', r.status === 401 && stripeCalls.length === 0);
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_cfgProM' }, { origin: 'https://evil.example' });
  t('checkout from another origin is refused with 403', r.status === 403 && stripeCalls.length === 0);
  for (const bad of ['price_1CheapTestPrice', 'price_cfgprom', 'not-a-price', 'constructor', '__proto__', 'toString']) {
    r = await api(stripeFn, { action: 'createCheckout', priceId: bad, plan: 'pro' });
    t('unknown price id "' + bad + '" is refused with 400 and never reaches Stripe', r.status === 400 && r.body.ok === false && /price/i.test(r.body.error) && stripeCalls.length === 0);
  }
  r = await api(stripeFn, { action: 'createCheckout', priceId: { $ne: null } });
  t('a price id that is not a string is refused', r.status === 400 && stripeCalls.length === 0);
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_cfgProM', plan: 'adviser' });
  t('a configured price proceeds', r.status === 200 && r.body.ok === true && r.body.url === 'https://checkout.stripe.test/cs_new' && lastCheckout().params['line_items[0][price]'] === 'price_cfgProM');
  t('…with the plan taken from the server map, not from the request', lastCheckout().params['metadata[plan]'] === 'pro' && lastCheckout().params['subscription_data[metadata][plan]'] === 'pro');
  t('…for the signed-in user\'s own customer', lastCheckout().params.customer === 'cus_1');
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_cfgAdvM', plan: 'pro' });
  t('a configured Adviser price maps to adviser whatever the request says', r.status === 200 && lastCheckout().params['metadata[plan]'] === 'adviser');
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_1TlqgFHtPo8iuYxgBwZj1f2u' });
  t('the post-launch Pro price in stripe.js is accepted as pro', r.status === 200 && lastCheckout().params['metadata[plan]'] === 'pro');
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_1T9AdDHtPo8iuYxg6DJzXa8r' });
  t('the old launch price is still swapped for the post-launch one', r.status === 200 && lastCheckout().params['line_items[0][price]'] === 'price_1TlqgFHtPo8iuYxgBwZj1f2u');
  stripeApi = (m, p) => p === '/v1/checkout/sessions' ? stripeError(400, 'resource_missing', "No such price: 'price_cfgProM'; secret detail sk_live_LEAK") : stripeError(404, 'resource_missing', 'x');
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_cfgProM' });
  t('a Stripe error is not passed on to the browser', r.body.ok === false && !/No such price|LEAK|sk_/i.test(r.raw));
  stripeCalls.length = 0;
  redisFail = cmds => cmds.some(c => c[0] === 'GET' && c[1] === 'config:site');
  r = await api(stripeFn, { action: 'createCheckout', priceId: 'price_cfgProM' });
  t('if the configured prices cannot be read, checkout stops', r.status === 503 && stripeCalls.length === 0);

  // ───────────────────────────────────────────────────────────────────────────
  section('Billing portal');
  reset();
  stripeApi = (m, p) => p === '/v1/billing_portal/sessions' ? { status: 200, body: { url: 'https://billing.stripe.test/p' } } : null;
  r = await api(stripeFn, { action: 'createPortalSession', returnUrl: 'https://equitysight.app/account' }, { cookie: null });
  t('portal without a session is refused with 401', r.status === 401 && stripeCalls.length === 0);
  r = await api(stripeFn, { action: 'createPortalSession', returnUrl: 'https://equitysight.app/account', customer: 'cus_victim', stripeCustomerId: 'cus_victim' });
  t('portal opens for the signed-in user\'s own customer only', r.body.ok === true && r.body.url === 'https://billing.stripe.test/p' && stripeCalls.length === 1 && stripeCalls[0].params.customer === 'cus_1' && !('flow_data[type]' in stripeCalls[0].params));
  stripeCalls.length = 0;
  r = await api(stripeFn, { action: 'createPortalSession', returnUrl: 'https://equitysight.app/account', flow: 'cancel', subscription: 'sub_victim' });
  t('flow "cancel" opens the cancel page for the user\'s own subscription', r.body.ok === true && stripeCalls.length === 1 && stripeCalls[0].params['flow_data[type]'] === 'subscription_cancel' && stripeCalls[0].params['flow_data[subscription_cancel][subscription]'] === 'sub_1' && stripeCalls[0].params.customer === 'cus_1');
  stripeCalls.length = 0;
  stripeApi = (m, p, params) => params['flow_data[type]'] ? stripeError(400, 'invalid_request', 'cancellation disabled') : { status: 200, body: { url: 'https://billing.stripe.test/home' } };
  r = await api(stripeFn, { action: 'createPortalSession', returnUrl: 'https://equitysight.app/account', flow: 'cancel' });
  t('if Stripe refuses the cancel page, the portal home opens instead', r.body.ok === true && r.body.url === 'https://billing.stripe.test/home' && stripeCalls.length === 2);
  stripeApi = () => stripeError(400, 'invalid_request', "No such customer: 'cus_1' sk_live_LEAK");
  r = await api(stripeFn, { action: 'createPortalSession', returnUrl: 'https://equitysight.app/account' });
  t('a portal error is not passed on to the browser', r.body.ok === false && !/No such customer|LEAK|sk_/i.test(r.raw));
  reset({ stripeCustomerId: undefined });
  r = await api(stripeFn, { action: 'createPortalSession' });
  t('no Stripe customer on the account: nothing is sent to Stripe', r.body.ok === false && stripeCalls.length === 0);

  // ───────────────────────────────────────────────────────────────────────────
  section('Cancel helper (_billing.js)');
  const subsList = rows => ({ status: 200, body: { object: 'list', data: rows, has_more: false } });
  const cancelOk = id => ({ status: 200, body: { id, status: 'canceled' } });
  const deletes = () => stripeCalls.filter(c => c.method === 'DELETE').map(c => c.path);
  reset();
  r = await billing.cancelSubscriptionsForCustomer('');
  t('no customer id: ok and Stripe is not called', r.ok === true && stripeCalls.length === 0);
  stripeApi = (m, p) => m === 'GET' ? subsList([
    { id: 'sub_a', status: 'active' }, { id: 'sub_b', status: 'past_due' }, { id: 'sub_c', status: 'trialing' },
    { id: 'sub_d', status: 'canceled' }, { id: 'sub_e', status: 'incomplete_expired' }, { id: 'sub_f', status: 'unpaid' },
  ]) : cancelOk(p.split('/').pop());
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('lists every subscription of that customer', stripeCalls[0].method === 'GET' && /^\/v1\/subscriptions\?customer=cus_1&status=all/.test(stripeCalls[0].path));
  t('cancels each active, past-due, trialing and unpaid one', r.ok === true && deletes().join() === '/v1/subscriptions/sub_a,/v1/subscriptions/sub_b,/v1/subscriptions/sub_c,/v1/subscriptions/sub_f' && r.cancelled.join() === 'sub_a,sub_b,sub_c,sub_f');
  t('sends no parameters with the cancel (immediate, no final invoice: Stripe defaults)', stripeCalls.every(c => Object.keys(c.params).length === 0));
  stripeCalls.length = 0;
  stripeApi = (m, p) => m === 'GET' ? subsList([{ id: 'sub_a', status: 'active' }, { id: 'sub_b', status: 'past_due' }])
    : p.endsWith('sub_a') ? stripeError(500, 'api_error', 'boom') : cancelOk('sub_b');
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('reports failure when Stripe errors on a cancel, and still cancels the rest', r.ok === false && r.cancelled.join() === 'sub_b' && deletes().length === 2);
  stripeCalls.length = 0;
  stripeApi = (m, p) => m === 'GET' ? subsList([{ id: 'sub_a', status: 'active' }]) : { status: 200, body: { id: 'sub_a', status: 'active' } };
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('reports failure when Stripe answers 200 but the subscription is not canceled', r.ok === false);
  stripeCalls.length = 0;
  stripeApi = () => stripeError(500, 'api_error', 'boom');
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('reports failure when the list call errors, and cancels nothing', r.ok === false && deletes().length === 0);
  stripeApi = () => new Error('socket hang up');
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('reports failure when Stripe cannot be reached', r.ok === false);
  stripeApi = () => stripeError(400, 'resource_missing', "No such customer: 'cus_gone'");
  r = await billing.cancelSubscriptionsForCustomer('cus_gone');
  t('a customer Stripe does not know has nothing to cancel', r.ok === true && r.cancelled.length === 0);
  stripeApi = () => stripeError(404, 'resource_missing', "No such customer: 'cus_old'; a similar object exists in test mode, but a live mode key was used to make this request.");
  r = await billing.cancelSubscriptionsForCustomer('cus_old');
  t('a customer id left over from test mode has nothing to cancel', r.ok === true && r.cancelled.length === 0);
  stripeCalls.length = 0;
  stripeApi = () => stripeError(404, 'resource_missing', "No such customer: 'cus_1'; a similar object exists in live mode, but a test mode key was used to make this request.");
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('a test key against a live customer is a failure, not "nothing to cancel"', r.ok === false && r.cancelled.length === 0 && deletes().length === 0);
  stripeApi = () => subsList([{ id: 'sub_d', status: 'canceled' }]);
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('a customer with only ended subscriptions is ok', r.ok === true && r.cancelled.length === 0);
  stripeCalls.length = 0;
  stripeApi = (m, p) => m === 'DELETE' ? cancelOk(p.split('/').pop())
    : /starting_after=sub_p1/.test(p) ? subsList([{ id: 'sub_p2', status: 'active' }])
    : { status: 200, body: { data: [{ id: 'sub_p1', status: 'active' }], has_more: true } };
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('follows has_more to the next page', r.ok === true && r.cancelled.join() === 'sub_p1,sub_p2');
  const savedKey = process.env.STRIPE_SECRET_KEY; process.env.STRIPE_SECRET_KEY = '';
  stripeCalls.length = 0;
  r = await billing.cancelSubscriptionsForCustomer('cus_1');
  t('reports failure when the Stripe key is missing', r.ok === false && stripeCalls.length === 0);
  process.env.STRIPE_SECRET_KEY = savedKey;

  // ───────────────────────────────────────────────────────────────────────────
  section('Account deletion (auth.js) cancels the subscription first');
  const seedExtras = () => { put('scenarios:u1:index', JSON.stringify([{ id: 's1' }])); put('scenarios:u1:state:s1', '{}'); put('journey:' + EMAIL, '{}'); put('profile:u1', '{}'); };
  const firstRedisWrite = () => timeline.findIndex(x => x.kind === 'redis' && ['SET', 'SETEX', 'DEL', 'RPUSH', 'LPUSH', 'SREM'].includes(String(x.cmd[0]).toUpperCase()));
  const lastStripeDelete = () => timeline.map((x, i) => (x.kind === 'stripe' && x.method === 'DELETE') ? i : -1).filter(i => i >= 0).pop();

  reset(); seedExtras(); timeline.length = 0;
  stripeApi = (m, p) => m === 'GET' ? subsList([{ id: 'sub_1', status: 'active' }]) : cancelOk('sub_1');
  r = await api(auth, { action: 'deleteAccount', password: PASSWORD, deleteReason: 'Other' });
  t('deleteAccount cancels the Stripe subscription', deletes().join() === '/v1/subscriptions/sub_1');
  t('…before anything is written or deleted', lastStripeDelete() !== undefined && firstRedisWrite() > lastStripeDelete());
  t('…and then deletes the account', r.body.ok === true && !has(USER_KEY) && !has('cid:cus_1') && !has('journey:' + EMAIL) && !has('scenarios:u1:state:s1') && has('deleted:' + EMAIL));
  r = await deliver(ev('customer.subscription.deleted', sub('canceled')));
  t('the cancellation webhook that follows is acknowledged and recreates nothing', r.status === 200 && !has(USER_KEY) && !has('events:u1'));

  reset(); seedExtras(); timeline.length = 0;
  stripeApi = (m) => m === 'GET' ? subsList([{ id: 'sub_1', status: 'active' }]) : stripeError(500, 'api_error', 'boom sk_live_LEAK');
  const before = JSON.stringify([...store.entries()]);
  r = await api(auth, { action: 'deleteAccount', password: PASSWORD, deleteReason: 'Other' });
  t('if cancelling fails, deleteAccount stops with a plain error', r.body.ok === false && /Stripe/.test(r.body.error || '') && /has not been deleted/.test(r.body.error || '') && /support@equitysight\.app/.test(r.body.error || '') && !/boom|LEAK|sk_/.test(r.raw));
  t('…nothing at all is deleted or written', JSON.stringify([...store.entries()]) === before && firstRedisWrite() === -1);
  t('…and the session cookie is not cleared', !r.headers['Set-Cookie']);
  stripeCalls.length = 0;
  r = await api(auth, { action: 'deleteAccount', password: 'wrong password' });
  t('a wrong password never reaches Stripe', r.body.ok === false && stripeCalls.length === 0 && has(USER_KEY));

  reset({ stripeCustomerId: undefined, stripeSubscriptionId: undefined, plan: 'free' }); store.delete('cid:cus_1');
  r = await api(auth, { action: 'deleteAccount', password: PASSWORD });
  t('an account with no Stripe customer is deleted as before, without calling Stripe', r.body.ok === true && !has(USER_KEY) && stripeCalls.length === 0);

  const seedAdmin = () => { put('user:admin@example.com', JSON.stringify({ id: 'a1', email: 'admin@example.com', role: 'admin', plan: 'free' })); put('token:ADMIN', JSON.stringify({ userId: 'a1', email: 'admin@example.com', role: 'admin', plan: 'free', expires: nowMs + sess.TOKEN_TTL_MS })); };
  reset(); seedAdmin(); timeline.length = 0;
  stripeApi = (m) => m === 'GET' ? subsList([{ id: 'sub_1', status: 'past_due' }]) : cancelOk('sub_1');
  r = await api(auth, { action: 'adminDeleteUser', targetEmail: EMAIL }, { cookie: 'ADMIN' });
  t('adminDeleteUser cancels the subscription first, then deletes', r.body.ok === true && deletes().join() === '/v1/subscriptions/sub_1' && firstRedisWrite() > lastStripeDelete() && !has(USER_KEY));
  reset(); seedAdmin();
  stripeApi = () => stripeError(500, 'api_error', 'boom');
  r = await api(auth, { action: 'adminDeleteUser', targetEmail: EMAIL }, { cookie: 'ADMIN' });
  t('adminDeleteUser deletes nothing if cancelling fails', r.body.ok === false && /Stripe/.test(r.body.error || '') && /nothing was deleted/.test(r.body.error || '') && has(USER_KEY) && has('cid:cus_1') && !has('deleted:' + EMAIL));
  // A former subscriber with nothing left to cancel, while Stripe cannot be asked.
  reset({ plan: 'free', stripeSubscriptionId: undefined });
  stripeApi = () => stripeError(401, 'api_key_invalid', 'Invalid API Key provided');
  r = await api(auth, { action: 'deleteAccount', password: PASSWORD });
  t('if Stripe cannot be asked at all, a former subscriber is not deleted either, and the error does not claim a subscription', r.body.ok === false && has(USER_KEY) && !/your subscription/i.test(r.body.error || '') && /Stripe/.test(r.body.error || ''));
  reset();
  stripeApi = (m) => m === 'GET' ? subsList([{ id: 'sub_1', status: 'active' }]) : cancelOk('sub_1');
  r = await api(auth, { action: 'adminDeleteUser', targetEmail: EMAIL });
  t('adminDeleteUser by a non-admin is refused before Stripe is called', r.body.ok === false && stripeCalls.length === 0 && has(USER_KEY));

  reset();
  // The account is deleted between the webhook reading the user and writing it back.
  redisHook = (cmds, pipe) => { if (pipe && cmds.some(c => c[0] === 'SET' && c[1] === USER_KEY)) store.delete(USER_KEY); };
  r = await deliver(ev('customer.subscription.deleted', sub('canceled')));
  t('a webhook racing an account deletion does not recreate the user record', r.status === 200 && !has(USER_KEY) && !has('events:u1'));

  // ───────────────────────────────────────────────────────────────────────────
  section('Secrets');
  const everything = logs.join('\n');
  t('neither Stripe secret was written to the log', !everything.includes('sk_test_dummy_key') && !everything.includes('whsec_dummy_secret'));
  t('every Stripe call was authenticated with the secret key, as Basic auth', stripeAuthHeaders.size === 1 && stripeAuthHeaders.has('Basic ' + Buffer.from('sk_test_dummy_key:').toString('base64')));

  out('');
  // The account-deletion checks need netlify/functions/auth.js to call
  // cancelSubscriptionsForCustomer. Say so on the summary line when it doesn't.
  const authCancels = /cancelSubscriptionsForCustomer/.test(require('fs').readFileSync(fnDir + 'auth.js', 'utf8'));
  const hint = (fails && !authCancels) ? ' (netlify/functions/auth.js does not cancel the Stripe subscription before deleting an account yet; the account-deletion checks fail until it does)' : '';
  out(fails ? 'stripe-billing-test: ' + fails + ' of ' + count + ' checks FAILED' + hint : 'stripe-billing-test: all ' + count + ' checks passed ✓');
  process.exit(fails ? 1 : 0);
})().catch(err => {
  out('stripe-billing-test: crashed: ' + (err && err.stack || err));
  process.exit(1);
});

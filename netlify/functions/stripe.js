/**
 * stripe.js — Netlify Function
 * Stripe payment integration for EquitySight.app
 *
 * Environment variables required (Netlify Site Settings → Environment Variables):
 *   STRIPE_SECRET_KEY        — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe webhook dashboard)
 *   UPSTASH_REDIS_REST_URL   — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console
 *
 * Webhook endpoint to register in Stripe: /.netlify/functions/stripe
 * Events to subscribe to:
 *   checkout.session.completed
 *   customer.subscription.deleted
 *   customer.subscription.updated
 *   invoice.payment_failed
 *   invoice.paid               (clears the payment-failed grace; the handler
 *                               also accepts invoice.payment_succeeded)
 *
 * Billing rules (tests/stripe-billing-test.js guards them):
 *   - An event is recorded as handled only after it has been applied. A
 *     failure replies 5xx so Stripe sends the event again.
 *   - Events for one customer are applied one at a time.
 *   - An older subscription event never overwrites a newer one.
 *   - A failed payment starts a 3-day grace. past_due does not remove the plan
 *     while the grace flag exists. The plan is removed when Stripe ends the
 *     subscription (deleted, canceled, unpaid, incomplete_expired) or when a
 *     past_due update arrives after the grace has gone.
 *   - A plan removed for non-payment (grace over, or unpaid) comes back when
 *     that subscription is active again. Until then the record keeps the
 *     subscription id, so the account page can still open the billing portal.
 *   - A successful payment clears the grace flag and paymentFailedAt.
 *   - Checkout only accepts the price ids configured for this site.
 */

const crypto = require('crypto');
const { isStaleSession } = require('./_session');
const log    = require('./_log');

const STRIPE_SECRET_KEY    = (process.env.STRIPE_SECRET_KEY    || '').trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());
// CSRF defense-in-depth. Webhook callers (Stripe) are exempt — they're
// identified and authenticated by the Stripe-Signature header separately.
function isAllowedOrigin(event){
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if(!o) return true;
  return ALLOWED_ORIGINS.includes(o) || o.endsWith('.netlify.app');
}
function getCorsHeaders(event) {
  const reqOrigin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin
    : reqOrigin.endsWith('.netlify.app') ? reqOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Stripe-Signature',
    'Access-Control-Allow-Credentials': 'true',
  };
}
let H = {};

// ── Redis helpers ─────────────────────────────────────────────────────────────
async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  return (await r.json()).result;
}

// Upstash REST pipeline: takes an array of [cmd,arg,...] arrays, returns an
// array of results. All commands execute server-side in a single round-trip —
// if the HTTP call succeeds, all commands landed; if it fails, none did. Gives
// us the atomicity we need for "write user record + update cid: index".
async function redisPipe(cmds) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r = await fetch(REDIS_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('Redis pipeline HTTP ' + r.status);
  const out = await r.json();
  // A pipeline can answer 200 with an error for one command. Treat that as a
  // failure so the webhook is retried instead of recorded as handled.
  if (!Array.isArray(out) || out.some(x => x && x.error)) throw new Error('Redis pipeline command failed');
  return out;
}

async function rGet(key) {
  const raw = await redisCmd('GET', key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

async function rSet(key, val, ttl) {
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return ttl ? redisCmd('SETEX', key, String(ttl), s) : redisCmd('SET', key, s);
}
async function logEvent(userId, type, extra) {
  if (!userId) return;
  try {
    const s = JSON.stringify({ type, at: Date.now(), ...extra });
    await redisCmd('RPUSH', 'events:' + userId, s);
    await redisCmd('LTRIM', 'events:' + userId, '0', '199');
  } catch (e) { console.warn('[stripe] logEvent failed:', e.message); }
}

// ── Token verification ────────────────────────────────────────────────────────
function readCookieToken(event) {
  const raw = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  if (!raw) return '';
  for (const p of raw.split(/;\s*/)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === 'es_session') {
      try { return decodeURIComponent(p.slice(eq + 1)); } catch (e) { return p.slice(eq + 1); }
    }
  }
  return '';
}
async function verifyToken(event) {
  const token = readCookieToken(event);
  if (!token) return null;
  const data = await rGet('token:' + token);
  if (!data) return null;
  if (data.expires && Date.now() > data.expires) {
    await redisCmd('DEL', 'token:' + token);
    return null;
  }
  if (isStaleSession(data)) return null;
  return data;
}

// ── Stripe API helper ─────────────────────────────────────────────────────────
async function stripePost(path, params) {
  const body = Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  const r = await fetch('https://api.stripe.com' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Stripe API error ' + r.status);
  return data;
}

async function stripeGet(path) {
  const r = await fetch('https://api.stripe.com' + path, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64'),
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Stripe API error ' + r.status);
  return data;
}

// ── Stripe webhook signature verification ────────────────────────────────────
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  // Parse "t=...,v1=...,v1=..." format
  const parts = {};
  sigHeader.split(',').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (k === 'v1') {
      parts.v1 = parts.v1 || [];
      parts.v1.push(v);
    } else {
      parts[k] = v;
    }
  });

  const timestamp = parts.t;
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) return false;

  // Reject events older than 5 minutes (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    console.warn('[stripe] Webhook timestamp too old:', timestamp);
    return false;
  }

  const signedPayload = timestamp + '.' + rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  return signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch (e) { return false; }
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────
function ok(b)         { return { statusCode: 200, headers: H, body: JSON.stringify(b) }; }
function fail(msg, code) { return { statusCode: code || 400, headers: H, body: JSON.stringify({ ok: false, error: msg }) }; }

// ── Extract discount info from a Stripe discount object ───────────────────────
function extractDiscountInfo(discount, baseAmountCents, currency) {
  if (!discount || !discount.coupon) return null;
  const c = discount.coupon;
  let effectiveAmountCents = null;
  if (baseAmountCents != null) {
    if (c.percent_off)        effectiveAmountCents = Math.round(baseAmountCents * (1 - c.percent_off / 100));
    else if (c.amount_off != null) effectiveAmountCents = Math.max(0, baseAmountCents - c.amount_off);
  }
  return {
    couponId:            c.id || null,
    couponName:          c.name || c.id || null,
    percentOff:          c.percent_off || null,
    amountOffCents:      c.amount_off  || null,
    currency:            c.currency || currency || null,
    effectiveAmountCents,
    appliedAt:           Date.now(),
  };
}

// ── Webhook idempotency + dead-letter helpers ────────────────────────────────
// Stripe delivers an event at least once and sends it again after any reply
// that is not 2xx. Two keys per event id:
//   stripe_event_lock:<id> — short lock held while one invocation works on it
//   stripe_event:<id>      — written only AFTER the event has been applied
// A delivery that finds the done marker replies 200 at once. A delivery that
// finds the lock held replies 409, so Stripe sends it again later. If applying
// the event throws, the lock is released and the reply is 500, so the event is
// retried instead of lost. (Before Nov 2026 the marker was written first and a
// failure still replied 200, which dropped the event for good.)
const EVENT_DONE_TTL = 604800; // 7 days: well past Stripe's 3 days of retries
const EVENT_LOCK_TTL = 120;    // seconds: longer than this function can run

async function lockEvent(eventId) {
  // SET NX returns OK on first write, null if the key exists.
  const res = await redisCmd('SET', 'stripe_event_lock:' + eventId, '1', 'NX', 'EX', String(EVENT_LOCK_TTL));
  return res === 'OK';
}
async function unlockEvent(eventId) {
  // Best effort: a lock that cannot be released expires by itself.
  try { await redisCmd('DEL', 'stripe_event_lock:' + eventId); }
  catch (e) { console.warn('[stripe] event lock not released, it expires in', EVENT_LOCK_TTL, 's:', e.message); }
}
async function isEventDone(eventId) {
  return !!(await redisCmd('GET', 'stripe_event:' + eventId));
}
async function markEventDone(eventId) {
  await redisCmd('SET', 'stripe_event:' + eventId, '1', 'EX', String(EVENT_DONE_TTL));
}

// One event at a time per customer. Stripe sends the events of one payment
// (invoice.paid, customer.subscription.updated…) within the same second, to
// separate invocations. Each handler reads the whole user record and writes
// it back, so two running together could overwrite each other and leave a
// paid-up subscriber on the free plan. stripe_customer_lock:<customer id> is
// held while one event is applied. A second event for the same customer waits
// up to about 3 seconds for it, then replies 409 so Stripe sends it again.
const CUSTOMER_LOCK_TRIES = 15;
const CUSTOMER_LOCK_WAIT_MS = 200;
function eventCustomerId(stripeEvent) {
  const c = stripeEvent.data.object.customer;
  return typeof c === 'string' ? c : '';
}
async function lockCustomer(customerId) {
  for (let i = 0; i < CUSTOMER_LOCK_TRIES; i++) {
    if (i) await new Promise(resolve => setTimeout(resolve, CUSTOMER_LOCK_WAIT_MS));
    const res = await redisCmd('SET', 'stripe_customer_lock:' + customerId, '1', 'NX', 'EX', String(EVENT_LOCK_TTL));
    if (res === 'OK') return true;
  }
  return false;
}
async function unlockCustomer(customerId) {
  // Best effort, like unlockEvent.
  try { await redisCmd('DEL', 'stripe_customer_lock:' + customerId); }
  catch (e) { console.warn('[stripe] customer lock not released, it expires in', EVENT_LOCK_TTL, 's:', e.message); }
}

// When an event can't be matched to a user (race condition or account
// deletion), stash the full webhook for manual replay rather than losing it
// silently. Throws if the write fails, so the event is retried.
async function storeDeadLetter(event, reason) {
  const rec = { at: Date.now(), reason, event };
  await redisCmd('LPUSH', 'stripe_deadletter', JSON.stringify(rec));
  try { await redisCmd('LTRIM', 'stripe_deadletter', '0', '199'); } catch (e) {} // keep last 200
  console.error('[stripe] DEAD-LETTER stored:', reason, '(event:', event && event.id, ')');
}

// ── Out-of-order guard for subscription events ───────────────────────────────
// Stripe does not promise delivery order, and a retried event can arrive
// hours after a newer one. For each subscription id, remember the `created`
// time of the newest event applied; an older event for the same subscription
// is skipped. `created` has one-second resolution, so an event from the same
// second is applied unless the subscription has already finished for good
// (canceled or incomplete_expired; an unpaid one can still come back). The
// key is only written after the event has been applied to a user.
const SUB_STAMP_TTL = 3024000; // 35 days: Stripe keeps events for 30
async function readSubStamp(subId) {
  const raw = subId ? await redisCmd('GET', 'stripe_sub_applied:' + subId) : null;
  if (!raw) return { created: 0, ended: false };
  const s = String(raw);
  return { created: parseInt(s, 10) || 0, ended: /:ended$/.test(s) };
}
async function writeSubStamp(subId, created, ended) {
  await redisCmd('SET', 'stripe_sub_applied:' + subId, created + (ended ? ':ended' : ''), 'EX', String(SUB_STAMP_TTL));
}

// ── Payment-failure grace ─────────────────────────────────────────────────────
// subscription_grace:<email> exists for 3 days after a payment first fails.
// While it exists a past_due subscription keeps its plan. paymentFailedAt on
// the user record marks the failure as still open; both are cleared by the
// next successful payment.
const GRACE_SECONDS = 259200; // 3 days
function graceKey(email) { return 'subscription_grace:' + email; }

// Start the grace window. It is dated from Stripe's event time, so a retried
// delivery does not move it. Returns false, and writes nothing, if that
// window is already over. `SET ... XX` only writes a record that still
// exists, so an account deleted a moment ago is not recreated.
async function startGrace(email, userData, eventCreatedSec, reason) {
  // Never longer than 3 days from now, whatever the two clocks say.
  const ttl = Math.min(GRACE_SECONDS, eventCreatedSec + GRACE_SECONDS - Math.floor(Date.now() / 1000));
  if (ttl <= 0) return false;
  userData.paymentFailedAt = eventCreatedSec * 1000;
  userData.paymentFailureReason = reason || 'payment failed';
  await redisPipe([
    ['SET', 'user:' + email, JSON.stringify(userData), 'XX'],
    ['SET', graceKey(email), String(eventCreatedSec * 1000), 'EX', String(ttl)],
  ]);
  return true;
}

// A successful payment ends the failure. A payment event that is older than
// the recorded failure cannot have fixed it, so it clears nothing.
async function clearPaymentFailure(email, userData, eventCreatedSec) {
  if (userData.paymentFailedAt && eventCreatedSec * 1000 < userData.paymentFailedAt) return false;
  const hadRecord = userData.paymentFailedAt != null || userData.paymentFailureReason != null;
  delete userData.paymentFailedAt;
  delete userData.paymentFailureReason;
  const cmds = [['DEL', graceKey(email)]];
  // Only rewrite the user record when there is something to remove from it.
  if (hadRecord) cmds.unshift(['SET', 'user:' + email, JSON.stringify(userData), 'XX']);
  await redisPipe(cmds);
  return true;
}

// ── Upgrade user plan in Redis ────────────────────────────────────────────────
async function upgradePlan(email, plan, stripeCustomerId, stripeSubscriptionId, discountInfo) {
  const key = 'user:' + email.toLowerCase().trim();
  const userData = await rGet(key);
  if (!userData) {
    console.warn('[stripe] upgradePlan: user not found:', email);
    return { ok: false, reason: 'user_not_found', email };
  }
  userData.plan = plan;
  delete userData.stripeLapsedPlan; // the plan is back on (see downgradeUser)
  if (stripeCustomerId)     userData.stripeCustomerId    = stripeCustomerId;
  if (stripeSubscriptionId) userData.stripeSubscriptionId = stripeSubscriptionId;
  if (discountInfo)         userData.stripeDiscountInfo  = discountInfo;
  else if (discountInfo === null) delete userData.stripeDiscountInfo; // explicitly cleared
  // Atomic: both the user record and the `cid:` reverse index land together
  // (or neither does). Previously a mid-flight Redis failure could leave the
  // cid index stale, breaking lookups by customer id.
  const cmds = [['SET', key, JSON.stringify(userData)]];
  if (stripeCustomerId) cmds.push(['SET', 'cid:' + stripeCustomerId, email.toLowerCase().trim()]);
  await redisPipe(cmds);
  await logEvent(userData.id, 'plan_upgraded', { plan, stripeCustomerId, stripeSubscriptionId });
  console.log('[stripe] Upgraded', email, '→', plan, discountInfo ? '(discounted)' : '');
  return { ok: true };
}

// ── Lookup email by Stripe customerId (via cid: index, falls back to KEYS scan) ──
async function emailByCustomerId(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  const email = await rGet('cid:' + stripeCustomerId);
  if (email) return email;
  // Fallback: KEYS scan for existing users who predate the cid: index
  const userKeys = await redisCmd('KEYS', 'user:*');
  if (!userKeys || !userKeys.length) return null;
  const allUsers = await Promise.all(userKeys.map(k => rGet(k)));
  const found = allUsers.find(u => u && u.stripeCustomerId === stripeCustomerId);
  if (!found) return null;
  // Backfill the index so next lookup is fast
  await rSet('cid:' + stripeCustomerId, found.email.toLowerCase().trim());
  return found.email.toLowerCase().trim();
}

// ── Ensure the referral coupon exists in Stripe ───────────────────────────────
async function ensureReferralCoupon() {
  try {
    await stripeGet('/v1/coupons/REFERRAL_50_ONCE');
  } catch (e) {
    try {
      await stripePost('/v1/coupons', {
        'id': 'REFERRAL_50_ONCE',
        'percent_off': '50',
        'duration': 'once',
        'name': 'Referral Reward — 50% Off',
      });
    } catch (createErr) {
      if (!createErr.message.includes('already exists')) throw createErr;
    }
  }
}

// ── Reward referrer when a referred user subscribes ──────────────────────────
async function processReferralReward(newUserEmail) {
  const userKey = 'user:' + newUserEmail.toLowerCase().trim();
  const userData = await rGet(userKey);
  if (!userData || !userData.referredBy || userData.referralRewardClaimed) return;

  // Mark reward claimed on the new user
  userData.referralRewardClaimed = true;
  await rSet(userKey, userData);

  // Find referrer via uid: reverse index (avoids KEYS scan)
  const referrerEmail = await rGet('uid:' + userData.referredBy);
  if (!referrerEmail) return;
  const referrer = await rGet('user:' + referrerEmail);
  if (!referrer) return;

  referrer.referralCount = (referrer.referralCount || 0) + 1;
  await rSet('user:' + referrer.email.toLowerCase().trim(), referrer);
  await logEvent(referrer.id, 'referral_reward', { referredEmail: newUserEmail });

  // Apply 50% off coupon to referrer's next billing cycle if they have a subscription
  if (referrer.stripeSubscriptionId) {
    try {
      await ensureReferralCoupon();
      await stripePost('/v1/subscriptions/' + referrer.stripeSubscriptionId, { coupon: 'REFERRAL_50_ONCE' });
      console.log('[stripe] Referral coupon applied to referrer:', referrer.email);
    } catch (e) {
      console.warn('[stripe] Failed to apply referral coupon to referrer:', e.message);
    }
  }
}

// ── Downgrade a user to free ──────────────────────────────────────────────────
// over=true: Stripe says the subscription is finished for good (deleted,
// canceled, incomplete_expired). The subscription id, the payment-failure
// record and the grace flag all go.
// over=false: the plan is removed for non-payment (the grace ran out on a
// past_due subscription, or Stripe marked it unpaid), but the subscription
// still exists in Stripe and a payment brings it back. The subscription id
// stays, so the account page can still open the billing portal to fix the
// card or cancel. The plan is noted in stripeLapsedPlan, so a late payment
// restores it even when the subscription carries no plan metadata. The
// failure record stays, since the failure is still open until Stripe reports
// a payment or the end.
async function downgradeUser(email, userData, stripeCustomerId, over) {
  const hadPlan = !!userData.plan && userData.plan !== 'free';
  if (over) {
    delete userData.stripeSubscriptionId;
    delete userData.stripeLapsedPlan;
    delete userData.paymentFailedAt;
    delete userData.paymentFailureReason;
  } else if (hadPlan) {
    userData.stripeLapsedPlan = userData.plan;
  }
  userData.plan = 'free';
  delete userData.stripeDiscountInfo;
  const cmds = [['SET', 'user:' + email, JSON.stringify(userData), 'XX']];
  if (over) cmds.push(['DEL', graceKey(email)]);
  const res = await redisPipe(cmds);
  // SET ... XX answers null when the account was deleted in the meantime.
  // Logged once: not again when a lapsed subscription is later cancelled.
  if (hadPlan && res[0] && res[0].result === 'OK') {
    await logEvent(userData.id, 'plan_downgraded', { plan: 'free', stripeCustomerId });
    console.log('[stripe] Downgraded', email, '→ free');
  }
}

// ── Webhook event handlers ────────────────────────────────────────────────────
// Each returns a short outcome for the log and throws on any failure, which
// makes the webhook reply 5xx so Stripe sends the event again. Every handler
// can safely run twice for the same event.
const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'invoice.payment_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
];
// Statuses that mean the subscription no longer entitles the user to the plan.
const ENDED_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];
// Of those, the ones Stripe never brings back. An unpaid subscription becomes
// active again when its invoice is paid.
const OVER_STATUSES = ['canceled', 'incomplete_expired'];

function eventTime(stripeEvent) {
  return Number(stripeEvent.created) || Math.floor(Date.now() / 1000);
}

async function handleCheckoutCompleted(stripeEvent) {
  const session = stripeEvent.data.object;
  const email = (session.customer_email || session.customer_details?.email || '').toLowerCase().trim();
  const meta  = session.metadata || {};
  const plan  = meta.plan || 'pro';
  if (!email) {
    console.warn('[stripe] checkout.session.completed: no email in session');
    await storeDeadLetter(stripeEvent, 'no_email_in_session');
    return 'dead_letter';
  }
  // A checkout event that turns up after its subscription has already ended
  // must not hand the plan back.
  if (typeof session.subscription === 'string' && (await readSubStamp(session.subscription)).ended) {
    log.warn('stripe.checkout_for_ended_subscription', { eventId: stripeEvent.id });
    return 'stale';
  }
  // Extract discount from checkout session (total_details gives total discount in cents)
  const baseAmount = session.amount_subtotal;
  const currency   = session.currency;
  const discountInfo = extractDiscountInfo(session.discount, baseAmount, currency);
  const result = await upgradePlan(email, plan, session.customer, session.subscription, discountInfo);
  if (!result || !result.ok) {
    // User paid but we can't find their account — stash the full event
    // for manual replay so the payment isn't silently lost.
    await storeDeadLetter(stripeEvent, 'upgradePlan ' + (result && result.reason || 'unknown'));
    return 'dead_letter';
  }
  // Reward referrer only on successful upgrade
  await processReferralReward(email).catch(e => console.warn('[stripe] processReferralReward error:', e.message));
  return 'upgraded';
}

// past_due: keep the plan while the grace flag exists. Without a flag, the
// grace starts now if this event is the move into past_due (Stripe can send
// it before invoice.payment_failed) or if no failure has been recorded yet.
// Otherwise the grace has run out and the plan is removed.
async function applyPastDue(stripeEvent, email, userData) {
  const sub = stripeEvent.data.object;
  if (await redisCmd('GET', graceKey(email))) return 'past_due_in_grace';
  const previous = (stripeEvent.data.previous_attributes || {}).status;
  const justFailed = !!previous && previous !== 'past_due';
  if ((justFailed || !userData.paymentFailedAt) && await startGrace(email, userData, eventTime(stripeEvent), null)) {
    return 'grace_started';
  }
  await downgradeUser(email, userData, sub.customer, false);
  return 'grace_expired';
}

// A different subscription of the same customer has ended. The plan belongs
// to the subscription the record tracks, so ask Stripe about that one. If it
// is still running, nothing changes. If it is finished as well (the record
// held an out-of-date id), the plan goes, as it did before the two were told
// apart. Throws when Stripe can't be asked, so the event is retried.
async function endedOtherSubscription(stripeEvent, email, userData, over) {
  const sub = stripeEvent.data.object;
  const r = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(userData.stripeSubscriptionId), {
    headers: { 'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64') },
  });
  let tracked = null;
  try { tracked = await r.json(); } catch (e) { /* treated as a failed lookup below */ }
  if (r.ok && tracked && tracked.status) {
    if (!OVER_STATUSES.includes(tracked.status)) {
      log.warn('stripe.event_for_other_subscription', { eventId: stripeEvent.id, trackedStatus: tracked.status });
      return 'other_subscription';
    }
    userData.stripeSubscriptionId = sub.id; // the one this event is about takes its place
    await downgradeUser(email, userData, sub.customer, over);
    return 'ended_stale_id';
  }
  if (tracked && tracked.error && tracked.error.code === 'resource_missing') {
    // Stripe has no subscription with the tracked id, so nothing says whether
    // the plan is still paid for. Keep it and leave the event to be looked at.
    await storeDeadLetter(stripeEvent, 'subscription_ended: tracked_subscription_unknown_to_stripe');
    return 'dead_letter';
  }
  throw new Error('Stripe subscription lookup failed, HTTP ' + r.status);
}

async function handleSubscriptionEvent(stripeEvent) {
  const sub = stripeEvent.data.object;
  const created = Number(stripeEvent.created) || 0;
  const status = stripeEvent.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
  const live  = status === 'active' || status === 'trialing';
  const ended = ENDED_STATUSES.includes(status);
  const over  = OVER_STATUSES.includes(status);
  if (!live && !ended && status !== 'past_due') return 'no_change'; // incomplete, paused

  // Out-of-order guard (see readSubStamp).
  const last = await readSubStamp(sub.id);
  if (created && (created < last.created || (created === last.created && last.ended && !over))) {
    log.info('stripe.webhook_stale', { eventId: stripeEvent.id, type: stripeEvent.type, created, lastApplied: last.created });
    return 'stale';
  }

  const email = await emailByCustomerId(sub.customer);
  const userData = email ? await rGet('user:' + email) : null;
  if (!userData || typeof userData !== 'object') {
    if (live && (sub.metadata || {}).plan && sub.customer) {
      await storeDeadLetter(stripeEvent, email ? 'subscription_updated: user_record_missing' : 'subscription_updated: cid_not_mapped');
      return 'dead_letter';
    }
    console.warn('[stripe] subscription event for a customer with no account:', sub.customer);
    return 'no_user';
  }

  // The user record tracks one subscription. An event about a different one
  // (a second subscription on the same customer) must not remove the plan
  // that the tracked subscription pays for.
  const ours = !userData.stripeSubscriptionId || userData.stripeSubscriptionId === sub.id;
  let outcome;
  if (live) {
    // Back to active: the payment went through.
    if (ours) await clearPaymentFailure(email, userData, eventTime(stripeEvent));
    // Handle plan changes (e.g. pro → adviser or vice-versa). A subscription
    // whose plan was removed for non-payment gets back the plan it had, so a
    // late payment restores it even without plan metadata.
    const lapsed = (userData.plan || 'free') === 'free' && userData.stripeSubscriptionId === sub.id ? userData.stripeLapsedPlan : null;
    const plan = (sub.metadata || {}).plan || lapsed;
    if (plan && sub.customer) {
      const baseAmount   = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price ? sub.items.data[0].price.unit_amount : null;
      const currency     = sub.currency || null;
      const discountInfo = extractDiscountInfo(sub.discount, baseAmount, currency);
      if (userData.plan !== plan || JSON.stringify(userData.stripeDiscountInfo) !== JSON.stringify(discountInfo)) {
        await upgradePlan(userData.email, plan, sub.customer, sub.id, discountInfo);
      }
    }
    outcome = 'active';
  } else if (!ours) {
    if (ended) {
      outcome = await endedOtherSubscription(stripeEvent, email, userData, over);
    } else {
      log.warn('stripe.event_for_other_subscription', { eventId: stripeEvent.id, status });
      outcome = 'other_subscription';
    }
  } else {
    // From here the record names this subscription, so a later payment on it
    // can be matched (see downgradeUser).
    if (!userData.stripeSubscriptionId && sub.id) userData.stripeSubscriptionId = sub.id;
    if (ended) {
      await downgradeUser(email, userData, sub.customer, over);
      outcome = over ? 'ended' : 'unpaid';
    } else {
      outcome = await applyPastDue(stripeEvent, email, userData);
    }
  }
  if (sub.id && created) await writeSubStamp(sub.id, created, over);
  return outcome;
}

async function handlePaymentFailed(stripeEvent) {
  // Don't downgrade here — Stripe retries over several days and a transient
  // card decline shouldn't kick a paying user out mid-month. Start the 3-day
  // grace instead (see applyPastDue for how it ends).
  const invoice = stripeEvent.data.object;
  console.warn('[stripe] Payment failed for customer:', invoice.customer);
  const email = await emailByCustomerId(invoice.customer);
  if (!email) {
    await storeDeadLetter(stripeEvent, 'payment_failed: cid_not_mapped');
    return 'dead_letter';
  }
  const userData = await rGet('user:' + email);
  if (!userData || typeof userData !== 'object') {
    await storeDeadLetter(stripeEvent, 'payment_failed: user_record_missing');
    return 'dead_letter';
  }
  // One failure gets one grace window. Stripe sends this event again for
  // every failed retry of the same invoice; those must not extend it.
  if (userData.paymentFailedAt || await redisCmd('GET', graceKey(email))) return 'failure_already_recorded';
  const reason = (invoice.last_payment_error && invoice.last_payment_error.message) || 'card declined';
  return (await startGrace(email, userData, eventTime(stripeEvent), reason)) ? 'grace_started' : 'grace_already_over';
}

async function handleInvoicePaid(stripeEvent) {
  const invoice = stripeEvent.data.object;
  const email = await emailByCustomerId(invoice.customer);
  const userData = email ? await rGet('user:' + email) : null;
  if (!userData || typeof userData !== 'object') return 'no_user';
  return (await clearPaymentFailure(email, userData, eventTime(stripeEvent))) ? 'failure_cleared' : 'stale';
}

async function processStripeEvent(stripeEvent) {
  const type = stripeEvent.type;
  if (type === 'checkout.session.completed') return handleCheckoutCompleted(stripeEvent);
  if (type === 'customer.subscription.deleted' || type === 'customer.subscription.updated') return handleSubscriptionEvent(stripeEvent);
  if (type === 'invoice.payment_failed') return handlePaymentFailed(stripeEvent);
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') return handleInvoicePaid(stripeEvent);
  return 'ignored';
}

// Reply that makes Stripe send the event again. Nothing about the failure is
// put in the body.
function retryLater(code, reason) {
  return { statusCode: code, headers: H, body: JSON.stringify({ received: false, retry: true, reason }) };
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  H = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  // ── Stripe webhook (identified by stripe-signature header) ────────────────
  const stripeSignature = event.headers['stripe-signature'];
  if (!stripeSignature && event.httpMethod !== 'GET' && !isAllowedOrigin(event)) {
    return fail('Forbidden', 403);
  }
  if (stripeSignature) {
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error('[stripe] STRIPE_WEBHOOK_SECRET not set');
      return fail('Webhook secret not configured', 503);
    }
    if (!verifyStripeSignature(event.body || '', stripeSignature, STRIPE_WEBHOOK_SECRET)) {
      console.error('[stripe] Webhook signature verification failed');
      return fail('Invalid signature', 400);
    }

    let stripeEvent;
    try { stripeEvent = JSON.parse(event.body || '{}'); }
    catch (e) { return fail('Invalid JSON', 400); }

    const type = stripeEvent && stripeEvent.type;
    const eventId = stripeEvent && stripeEvent.id;
    // Every real Stripe event has an id, a type and data.object.
    if (!stripeEvent || typeof stripeEvent !== 'object' || !eventId || !type || !stripeEvent.data || !stripeEvent.data.object) {
      return fail('Invalid event', 400);
    }
    log.info('stripe.webhook_received', { type, eventId });
    if (!HANDLED_EVENTS.includes(type)) return ok({ received: true, ignored: true });

    // 1. Take the processing lock, then look for the done marker. In that
    //    order, a delivery that slips in just after another one finished
    //    still sees the marker and stops.
    let locked = false;
    try {
      locked = await lockEvent(eventId);
      if (await isEventDone(eventId)) {
        if (locked) await unlockEvent(eventId);
        log.info('stripe.webhook_duplicate', { eventId, type });
        return ok({ received: true, duplicate: true });
      }
    } catch (e) {
      // The database can't be reached, so the event can't be applied either.
      if (locked) await unlockEvent(eventId);
      log.error('stripe.webhook_store_unavailable', { eventId, type, err: e.message });
      return retryLater(503, 'temporarily_unavailable');
    }
    if (!locked) {
      // Another invocation is working on this same event right now.
      log.info('stripe.webhook_in_progress', { eventId, type });
      return retryLater(409, 'in_progress');
    }

    // 2. One event at a time for this customer (see lockCustomer).
    const customerId = eventCustomerId(stripeEvent);
    if (customerId) {
      let customerLocked = false;
      try { customerLocked = await lockCustomer(customerId); }
      catch (e) {
        await unlockEvent(eventId);
        log.error('stripe.webhook_store_unavailable', { eventId, type, err: e.message });
        return retryLater(503, 'temporarily_unavailable');
      }
      if (!customerLocked) {
        await unlockEvent(eventId);
        log.info('stripe.webhook_customer_busy', { eventId, type });
        return retryLater(409, 'in_progress');
      }
    }

    // 3. Apply the event. 4. Only then record it as handled. If either step
    //    fails, release the locks and reply 500 so Stripe sends it again.
    try {
      const outcome = await processStripeEvent(stripeEvent);
      await markEventDone(eventId);
      log.info('stripe.webhook_handled', { eventId, type, outcome });
    } catch (e) {
      log.error('stripe.webhook_failed', { eventId, type, err: e.message });
      if (customerId) await unlockCustomer(customerId);
      await unlockEvent(eventId);
      return retryLater(500, 'processing_failed');
    }
    if (customerId) await unlockCustomer(customerId);
    await unlockEvent(eventId);
    return ok({ received: true });
  }

  // ── Authenticated API actions ─────────────────────────────────────────────
  if (!STRIPE_SECRET_KEY) {
    return fail('Stripe not configured. Add STRIPE_SECRET_KEY to Netlify environment variables.', 503);
  }

  if (event.httpMethod !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return fail('Bad request', 400); }

  const user = await verifyToken(event);
  if (!user) return fail('Authentication required', 401);

  // ── createCheckout: start Stripe Checkout for plan upgrade ───────────────
  if (body.action === 'createCheckout') {
    let { priceId, plan } = body;

    // Post-launch Stripe Price IDs — server-side source of truth so stale
    // client caches of stripe-config.js (still pointing at the launch
    // $2.99 / $29.99 IDs) get upgraded before we hand off to Stripe.
    // Old launch IDs: price_1T9AdDHtPo8iuYxg6DJzXa8r ($2.99/mo),
    //                 price_1T9AdDHtPo8iuYxgFajx5SQW ($29.99/yr).
    const LAUNCH_PRO_MONTHLY = 'price_1T9AdDHtPo8iuYxg6DJzXa8r';
    const LAUNCH_PRO_ANNUAL  = 'price_1T9AdDHtPo8iuYxgFajx5SQW';
    const POST_PRO_MONTHLY   = 'price_1TlqgFHtPo8iuYxgBwZj1f2u';
    const POST_PRO_ANNUAL    = 'price_1TlqhtHtPo8iuYxg0ankxUYf';
    if (priceId === LAUNCH_PRO_MONTHLY) priceId = POST_PRO_MONTHLY;
    if (priceId === LAUNCH_PRO_ANNUAL)  priceId = POST_PRO_ANNUAL;
    // If no priceId at all, infer from plan field (legacy clients)
    if (!priceId) {
      if (plan === 'pro_annual') priceId = POST_PRO_ANNUAL;
      else if (plan === 'pro' || plan === 'pro_monthly') priceId = POST_PRO_MONTHLY;
    }
    if (!priceId) return fail('priceId required');

    // Only the prices configured for this site can be bought: the four ids
    // saved in site config (Admin → Integrations writes config:site) and the
    // two post-launch Pro ids above. The plan always comes from this map,
    // never from the request. Any other price id is refused. (It used to fall
    // back to 'pro', so any price on the Stripe account, however cheap, bought
    // the Pro plan.)
    let siteUrl = (process.env.SITE_URL || 'https://equitysight.app').replace(/\/$/, '');
    let cfg;
    try { cfg = await rGet('config:site') || {}; }
    catch (e) {
      console.error('[stripe] createCheckout: site config unavailable:', e.message);
      return fail('Checkout is unavailable right now. Try again in a few minutes.', 503);
    }
    if (!cfg || typeof cfg !== 'object') cfg = {};
    if (typeof cfg.siteUrl === 'string' && cfg.siteUrl) siteUrl = cfg.siteUrl.replace(/\/$/, '');
    const priceMap = Object.create(null); // no inherited keys such as "constructor"
    const allowPrice = (id, planName) => { if (typeof id === 'string' && id.trim()) priceMap[id.trim()] = planName; };
    allowPrice(cfg.stripeProMonthly, 'pro');
    allowPrice(cfg.stripeProAnnual, 'pro');
    allowPrice(cfg.stripeAdviserMonthly, 'adviser');
    allowPrice(cfg.stripeAdviserAnnual, 'adviser');
    // Known post-launch IDs always map to pro
    allowPrice(POST_PRO_MONTHLY, 'pro');
    allowPrice(POST_PRO_ANNUAL, 'pro');
    const resolvedPlan = typeof priceId === 'string' ? priceMap[priceId] : undefined;
    if (!resolvedPlan) return fail('Unknown priceId. Checkout only accepts the prices configured for this site.', 400);

    try {
      const params = {
        'payment_method_types[]': 'card',
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'customer_email': user.email,
        'success_url': siteUrl + '/account?upgraded=1&session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': siteUrl + '/pricing?cancelled=1',
        'metadata[plan]': resolvedPlan,
        'metadata[userId]': user.userId,
        'allow_promotion_codes': 'true',
        'subscription_data[metadata][plan]': resolvedPlan,
        'subscription_data[metadata][userId]': user.userId,
      };

      // If user already has a Stripe customer ID, reuse it
      const userData = await rGet('user:' + user.email);
      if (userData && userData.stripeCustomerId) {
        params['customer'] = userData.stripeCustomerId;
        delete params['customer_email'];
      }

      // Apply referral coupon if user was referred and hasn't claimed yet
      if (userData && userData.referredBy && !userData.referralRewardClaimed) {
        try {
          await ensureReferralCoupon();
          params['discounts[0][coupon]'] = 'REFERRAL_50_ONCE';
          delete params['allow_promotion_codes']; // cannot be used alongside discounts
        } catch (e) {
          console.warn('[stripe] Could not apply referral coupon at checkout:', e.message);
        }
      }

      const session = await stripePost('/v1/checkout/sessions', params);
      return ok({ ok: true, url: session.url, sessionId: session.id });
    } catch (e) {
      // Stripe's own error text stays in the log; it is not sent to the browser.
      console.error('[stripe] createCheckout error:', e.message);
      return fail('Checkout could not be started. Try again, or email support@equitysight.app.', 502);
    }
  }

  // ── createPortalSession: redirect to Stripe customer portal ─────────────
  if (body.action === 'createPortalSession') {
    const { returnUrl } = body;
    const userData = await rGet('user:' + user.email);
    if (!userData || !userData.stripeCustomerId) {
      return fail('No billing account found. Please subscribe first.');
    }

    let siteUrl = (process.env.SITE_URL || 'https://equitysight.app').replace(/\/$/, '');
    try {
      const cfg = await rGet('config:site') || {};
      if (cfg.siteUrl) siteUrl = cfg.siteUrl.replace(/\/$/, '');
    } catch (e) {}

    try {
      const params = {
        customer: userData.stripeCustomerId,
        return_url: returnUrl || siteUrl + '/account',
      };
      // flow:'cancel' opens the portal on its cancel page for the signed-in
      // user's own subscription (the id comes from their record, never from
      // the request). If Stripe refuses that (cancelling is switched off in
      // the portal settings, or the subscription is already set to cancel),
      // open the portal's home page instead.
      let session = null;
      if (body.flow === 'cancel' && userData.stripeSubscriptionId) {
        try {
          session = await stripePost('/v1/billing_portal/sessions', Object.assign({}, params, {
            'flow_data[type]': 'subscription_cancel',
            'flow_data[subscription_cancel][subscription]': userData.stripeSubscriptionId,
            'flow_data[after_completion][type]': 'redirect',
            'flow_data[after_completion][redirect][return_url]': params.return_url,
          }));
        } catch (e) {
          console.warn('[stripe] portal cancel flow unavailable, opening the portal home:', e.message);
        }
      }
      if (!session) session = await stripePost('/v1/billing_portal/sessions', params);
      return ok({ ok: true, url: session.url });
    } catch (e) {
      // Stripe's own error text stays in the log; it is not sent to the browser.
      console.error('[stripe] createPortalSession error:', e.message);
      return fail('The billing portal could not be opened. Try again, or email support@equitysight.app.', 502);
    }
  }

  // ── getSubscriptionStatus: check current subscription ───────────────────
  if (body.action === 'getSubscriptionStatus') {
    const userData = await rGet('user:' + user.email);
    if (!userData) return fail('User not found');
    if (!userData.stripeSubscriptionId) {
      return ok({ ok: true, status: 'none', plan: userData.plan || 'free' });
    }
    try {
      const sub = await stripeGet(
        '/v1/subscriptions/' + userData.stripeSubscriptionId +
        '?expand[]=default_payment_method&expand[]=customer.invoice_settings.default_payment_method'
      );

      // Price info
      const item = sub.items && sub.items.data && sub.items.data[0];
      const price = item && item.price;
      const priceAmount   = price ? price.unit_amount : null;
      const priceCurrency = price ? price.currency : null;
      const priceInterval = price && price.recurring ? price.recurring.interval : null;

      // Payment method: subscription default → customer default
      let pm = sub.default_payment_method;
      if (!pm && sub.customer && typeof sub.customer === 'object') {
        const inv = sub.customer.invoice_settings;
        pm = inv && inv.default_payment_method;
      }
      const card = pm && pm.card ? pm.card : null;

      // Newer Stripe API versions keep the period end on the subscription
      // item, and a cancellation booked in the portal can arrive as cancel_at
      // instead of cancel_at_period_end. Read both shapes.
      const currentPeriodEnd = sub.current_period_end || (item && item.current_period_end) || null;
      const cancelAt = sub.cancel_at || null;

      // Payment failed: only reported while Stripe says the subscription is
      // past_due or unpaid. graceEndsAt is sent while the grace flag exists
      // and the plan is still on. After that the failure is still reported,
      // without a date, for as long as it is open. lapsedPlan is the plan
      // that was removed for it.
      const unpaidNow = sub.status === 'past_due' || sub.status === 'unpaid';
      const planOff = (userData.plan || 'free') === 'free';
      let paymentFailedAt = null;
      let graceEndsAt = null;
      if (unpaidNow) {
        paymentFailedAt = Number(userData.paymentFailedAt) || null;
        if (sub.status === 'past_due' && !planOff) {
          try {
            const email = String(user.email || '').toLowerCase().trim();
            const startedMs = Number(await redisCmd('GET', graceKey(email)));
            if (startedMs > 0) {
              paymentFailedAt = startedMs;
              graceEndsAt = startedMs + GRACE_SECONDS * 1000;
            }
          } catch (e) { /* the notice is optional; the rest of the status still returns */ }
        }
      }
      const lapsedPlan = (unpaidNow && planOff && userData.stripeLapsedPlan) || null;

      return ok({
        ok: true,
        status: sub.status,
        plan: userData.plan || 'free',
        currentPeriodEnd,
        cancelAtPeriodEnd: !!(sub.cancel_at_period_end || cancelAt),
        cancelAt,
        paymentFailedAt,
        graceEndsAt,
        lapsedPlan,
        priceAmount,
        priceCurrency,
        priceInterval,
        cardBrand: card ? card.brand : null,
        cardLast4: card ? card.last4 : null,
      });
    } catch (e) {
      return ok({ ok: true, status: 'unknown', plan: userData.plan || 'free' });
    }
  }

  return fail('Unknown action');
};

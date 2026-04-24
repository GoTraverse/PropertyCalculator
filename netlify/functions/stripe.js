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
 */

const crypto = require('crypto');
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
  return await r.json();
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
// Stripe retries webhooks on timeouts / 5xx. Use a Redis SET NX with 7-day TTL
// so duplicate event IDs are short-circuited. Returns true if the caller should
// process the event (first time), false if already processed.
async function claimEvent(eventId) {
  if (!eventId) return true; // can't dedupe without an id — process anyway
  // SET NX returns OK on first write, null if key exists. TTL in seconds.
  const res = await redisCmd('SET', 'stripe_event:' + eventId, '1', 'NX', 'EX', '604800');
  return res === 'OK';
}

// When upgradePlan can't find the user (race condition or account deletion),
// stash the full webhook for manual replay rather than losing it silently.
async function storeDeadLetter(event, reason) {
  try {
    const rec = { at: Date.now(), reason, event };
    await redisCmd('LPUSH', 'stripe_deadletter', JSON.stringify(rec));
    await redisCmd('LTRIM', 'stripe_deadletter', '0', '199'); // keep last 200
    console.error('[stripe] DEAD-LETTER stored:', reason, '(event:', event && event.id, ')');
  } catch (e) { console.error('[stripe] dead-letter write failed:', e.message); }
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
  if (stripeCustomerId)     userData.stripeCustomerId    = stripeCustomerId;
  if (stripeSubscriptionId) userData.stripeSubscriptionId = stripeSubscriptionId;
  if (discountInfo)         userData.stripeDiscountInfo  = discountInfo;
  else if (discountInfo === null) delete userData.stripeDiscountInfo; // explicitly cleared
  // Atomic: both the user record and the `cid:` reverse index land together
  // (or neither does). Previously a mid-flight Redis failure could leave the
  // cid index stale, breaking downgradePlan lookups.
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

// ── Downgrade user to free by customer ID ────────────────────────────────────
async function downgradePlan(stripeCustomerId) {
  const email = await emailByCustomerId(stripeCustomerId);
  if (!email) {
    console.warn('[stripe] downgradePlan: no user with customerId:', stripeCustomerId);
    return false;
  }
  const userData = await rGet('user:' + email);
  if (!userData) return false;
  userData.plan = 'free';
  delete userData.stripeSubscriptionId;
  delete userData.stripeDiscountInfo;
  await rSet('user:' + email, userData);
  await logEvent(userData.id, 'plan_downgraded', { plan: 'free', stripeCustomerId });
  console.log('[stripe] Downgraded', email, '→ free');
  return true;
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

    const type = stripeEvent.type;
    log.info('stripe.webhook_received', { type, eventId: stripeEvent.id });

    // Idempotency — short-circuit if this event ID has been processed. Stripe
    // retries on timeouts/5xx, so without this we'd run upgradePlan twice for
    // the same checkout. 7-day TTL comfortably exceeds Stripe's retry window.
    try {
      const claimed = await claimEvent(stripeEvent.id);
      if (!claimed) {
        log.info('stripe.webhook_duplicate', { eventId: stripeEvent.id, type });
        return ok({ received: true, duplicate: true });
      }
    } catch (e) {
      // If Redis is down we'd rather process (possibly twice) than drop the
      // event — upgradePlan writes are effectively idempotent anyway.
      console.warn('[stripe] claimEvent failed, proceeding without dedupe:', e.message);
    }

    try {
      if (type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        const email = (session.customer_email || session.customer_details?.email || '').toLowerCase().trim();
        const meta  = session.metadata || {};
        const plan  = meta.plan || 'pro';
        if (email) {
          // Extract discount from checkout session (total_details gives total discount in cents)
          const baseAmount = session.amount_subtotal;
          const currency   = session.currency;
          const discountInfo = extractDiscountInfo(session.discount, baseAmount, currency);
          const result = await upgradePlan(email, plan, session.customer, session.subscription, discountInfo);
          if (!result || !result.ok) {
            // User paid but we can't find their account — stash the full event
            // for manual replay so the payment isn't silently lost.
            await storeDeadLetter(stripeEvent, 'upgradePlan ' + (result && result.reason || 'unknown'));
          } else {
            // Reward referrer only on successful upgrade
            await processReferralReward(email).catch(e => console.warn('[stripe] processReferralReward error:', e.message));
          }
        } else {
          console.warn('[stripe] checkout.session.completed: no email in session');
          await storeDeadLetter(stripeEvent, 'no_email_in_session');
        }
      }

      if (type === 'customer.subscription.deleted') {
        const sub = stripeEvent.data.object;
        await downgradePlan(sub.customer);
      }

      if (type === 'customer.subscription.updated') {
        const sub = stripeEvent.data.object;
        // Handle plan changes (e.g. pro → adviser or vice-versa)
        if (sub.status === 'active' || sub.status === 'trialing') {
          const meta = sub.metadata || {};
          const plan = meta.plan;
          if (plan && sub.customer) {
            const email = await emailByCustomerId(sub.customer);
            if (email) {
              const userData = await rGet('user:' + email);
              if (userData) {
                const baseAmount   = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price ? sub.items.data[0].price.unit_amount : null;
                const currency     = sub.currency || null;
                const discountInfo = extractDiscountInfo(sub.discount, baseAmount, currency);
                if (userData.plan !== plan || JSON.stringify(userData.stripeDiscountInfo) !== JSON.stringify(discountInfo)) {
                  await upgradePlan(userData.email, plan, sub.customer, sub.id, discountInfo);
                }
              } else {
                await storeDeadLetter(stripeEvent, 'subscription_updated: user_record_missing');
              }
            } else {
              await storeDeadLetter(stripeEvent, 'subscription_updated: cid_not_mapped');
            }
          }
        } else if (sub.status === 'past_due' || sub.status === 'unpaid' || sub.status === 'canceled') {
          await downgradePlan(sub.customer);
        }
      }

      if (type === 'invoice.payment_failed') {
        // Don't downgrade immediately — Stripe retries over several days and
        // a transient card decline shouldn't kick a paying user out mid-month.
        // Set a 3-day grace flag the client can read (on next verify) to show
        // a "Payment failed — update your card" banner. If Stripe eventually
        // hits `unpaid` / `canceled`, the customer.subscription.updated
        // handler above downgrades properly.
        const invoice = stripeEvent.data.object;
        console.warn('[stripe] Payment failed for customer:', invoice.customer);
        try {
          const email = await emailByCustomerId(invoice.customer);
          if (email) {
            const userData = await rGet('user:' + email);
            if (userData) {
              userData.paymentFailedAt = Date.now();
              userData.paymentFailureReason = (invoice.last_payment_error && invoice.last_payment_error.message) || 'card declined';
              await rSet('user:' + email, userData);
              // Separate TTL'd flag so downstream code can gate on presence
              // without parsing the user record. 3-day window.
              await redisCmd('SET', 'subscription_grace:' + email, String(Date.now()), 'EX', '259200');
            } else {
              await storeDeadLetter(stripeEvent, 'payment_failed: user_record_missing');
            }
          } else {
            await storeDeadLetter(stripeEvent, 'payment_failed: cid_not_mapped');
          }
        } catch (e) { console.warn('[stripe] payment_failed flag error:', e.message); }
      }

    } catch (e) {
      console.error('[stripe] Event handling error:', e.message);
      // Return 200 to prevent Stripe from retrying (already handled or non-fatal)
      return ok({ received: true, warning: e.message });
    }

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
    const { priceId } = body;
    if (!priceId) return fail('priceId required');

    // Fetch site config for URLs and to derive plan from priceId server-side
    let siteUrl = (process.env.SITE_URL || 'https://equitysight.app').replace(/\/$/, '');
    let resolvedPlan = null;
    try {
      const cfg = await rGet('config:site') || {};
      if (cfg.siteUrl) siteUrl = cfg.siteUrl.replace(/\/$/, '');
      // Build server-side price→plan map — never trust the client's plan value
      const priceMap = {};
      if (cfg.stripeProMonthly) priceMap[cfg.stripeProMonthly] = 'pro';
      if (cfg.stripeProAnnual)  priceMap[cfg.stripeProAnnual]  = 'pro';
      if (cfg.stripeAdviserMonthly) priceMap[cfg.stripeAdviserMonthly] = 'adviser';
      if (cfg.stripeAdviserAnnual)  priceMap[cfg.stripeAdviserAnnual]  = 'adviser';
      resolvedPlan = priceMap[priceId] || null;
    } catch (e) {}

    // If config has known prices, reject unknown priceIds to prevent plan spoofing.
    // If config has no prices set yet (fresh install), fall back to 'pro' for any valid price_ ID.
    if (resolvedPlan === null) {
      if (!/^price_[A-Za-z0-9]+$/.test(priceId)) return fail('Invalid priceId format', 400);
      resolvedPlan = 'pro'; // safe fallback: only one plan currently, so worst case user pays correct amount
    }

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
      console.error('[stripe] createCheckout error:', e.message);
      return fail('Checkout error: ' + e.message);
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
      const session = await stripePost('/v1/billing_portal/sessions', {
        customer: userData.stripeCustomerId,
        return_url: returnUrl || siteUrl + '/account',
      });
      return ok({ ok: true, url: session.url });
    } catch (e) {
      console.error('[stripe] createPortalSession error:', e.message);
      return fail('Portal session error: ' + e.message);
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

      return ok({
        ok: true,
        status: sub.status,
        plan: userData.plan || 'free',
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
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

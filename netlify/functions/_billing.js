/**
 * _billing.js — Stripe helper shared with functions other than stripe.js.
 *
 * Not a function endpoint: the leading underscore marks it as a helper, the
 * same convention as _session.js and _log.js.
 *
 * cancelSubscriptionsForCustomer(customerId) is called before an account is
 * deleted (auth.js deleteAccount and adminDeleteUser), so that nobody is still
 * charged for an account that no longer exists. The caller must stop the
 * deletion when it reports ok:false.
 *
 * Environment: STRIPE_SECRET_KEY (read at call time).
 */
'use strict';

const STRIPE_API = 'https://api.stripe.com';

// A subscription in any other status can still take money from the card:
// active, trialing (charges when the trial ends), past_due (Stripe is
// retrying), unpaid, incomplete and paused. All of those are cancelled.
const ALREADY_OVER = ['canceled', 'incomplete_expired'];

async function stripeRequest(key, method, path) {
  const r = await fetch(STRIPE_API + path, {
    method,
    headers: { 'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64') },
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* non-JSON body: treated as a failure below */ }
  return { ok: !!r.ok, status: r.status, data: data || {} };
}

// Only the HTTP status and Stripe's short error code go in the log. Stripe's
// error message can quote ids and is never passed back to the browser.
function describeFailure(res) {
  const err = (res.data && res.data.error) || {};
  return 'http_' + res.status + (err.code ? ':' + err.code : '');
}

/**
 * Cancel, immediately, every subscription of a Stripe customer that is not
 * already over. No final invoice and no proration (Stripe's defaults for a
 * DELETE on a subscription).
 *
 * Returns { ok, cancelled: [subscription ids], error? }.
 *   ok:true  — the customer has nothing left that can charge them. Either
 *              every live subscription was cancelled, there were none, or
 *              Stripe has no such customer.
 *   ok:false — at least one subscription may still be live, or Stripe could
 *              not be asked. Nothing should be deleted.
 */
async function cancelSubscriptionsForCustomer(customerId) {
  const cancelled = [];
  if (!customerId) return { ok: true, cancelled };

  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) {
    console.error('[billing] cannot cancel subscriptions: STRIPE_SECRET_KEY is not set');
    return { ok: false, cancelled, error: 'stripe_not_configured' };
  }

  try {
    // 1. Collect every subscription that is not already over.
    const live = [];
    let startingAfter = '';
    for (let page = 0; page < 10; page++) {
      const res = await stripeRequest(key, 'GET',
        '/v1/subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=100' +
        (startingAfter ? '&starting_after=' + encodeURIComponent(startingAfter) : ''));
      if (!res.ok) {
        // Stripe has no customer with this id (for example an id left over
        // from test mode), so there is no subscription to cancel.
        if (res.data.error && res.data.error.code === 'resource_missing') {
          console.warn('[billing] Stripe has no customer', customerId, ', nothing to cancel');
          return { ok: true, cancelled, customerMissing: true };
        }
        console.error('[billing] listing subscriptions failed for', customerId, describeFailure(res));
        return { ok: false, cancelled, error: 'list_failed' };
      }
      const rows = Array.isArray(res.data.data) ? res.data.data : null;
      if (!rows) {
        console.error('[billing] unexpected subscription list for', customerId);
        return { ok: false, cancelled, error: 'list_failed' };
      }
      for (const sub of rows) {
        if (sub && sub.id && !ALREADY_OVER.includes(sub.status)) live.push(sub.id);
      }
      if (!res.data.has_more || !rows.length) { startingAfter = ''; break; }
      startingAfter = rows[rows.length - 1].id;
    }
    if (startingAfter) {
      // More than 1,000 subscriptions on one customer: not something this
      // site can produce. Refuse rather than guess.
      console.error('[billing] too many subscriptions to list for', customerId);
      return { ok: false, cancelled, error: 'list_failed' };
    }

    // 2. Cancel each one. Keep going after a failure so as few as possible
    //    are left live, then report the failure.
    let failed = 0;
    for (const id of live) {
      const res = await stripeRequest(key, 'DELETE', '/v1/subscriptions/' + encodeURIComponent(id));
      if (res.ok && res.data.status === 'canceled') {
        cancelled.push(id);
      } else {
        failed++;
        console.error('[billing] cancelling', id, 'failed for', customerId, res.ok ? 'status_' + res.data.status : describeFailure(res));
      }
    }
    if (failed) return { ok: false, cancelled, error: 'cancel_failed' };
    if (cancelled.length) console.log('[billing] cancelled', cancelled.length, 'subscription(s) for', customerId);
    return { ok: true, cancelled };
  } catch (e) {
    // Network failure talking to Stripe.
    console.error('[billing] cancelling subscriptions failed for', customerId, e.message);
    return { ok: false, cancelled, error: 'stripe_unreachable' };
  }
}

module.exports = { cancelSubscriptionsForCustomer };

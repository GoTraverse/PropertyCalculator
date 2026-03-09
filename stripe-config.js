/**
 * stripe-config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side Stripe configuration.
 *
 * HOW TO FILL THIS IN:
 *   1. Go to https://dashboard.stripe.com/apikeys
 *   2. Copy your "Publishable key"  (starts with pk_live_ or pk_test_)
 *      → paste it as STRIPE_PUBLISHABLE_KEY below
 *
 *   3. Go to https://dashboard.stripe.com/products
 *   4. Open your Pro product and copy each Price ID (starts with price_...)
 *      → paste them into STRIPE_PRICES below
 *
 * The publishable key is safe to include in client-side code.
 * NEVER put your secret key (sk_...) here — that stays in Netlify env vars only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

window.STRIPE_PUBLISHABLE_KEY = 'pk_live_51T5NUPHtPo8iuYxgJGxUfWFWX1AiLCylPcJDG4I5KXf85xXabgzWbemRg2irrpxeVBPd5mnRFWCprTQxPwbWB9KN00bshOyNDQ';

window.STRIPE_PRICES = {
  pro_monthly: 'price_1T9AdDHtPo8iuYxg6DJzXa8r',
  pro_annual:  'price_1T9AdDHtPo8iuYxgFajx5SQW',
};

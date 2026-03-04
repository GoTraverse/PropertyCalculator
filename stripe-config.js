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

window.STRIPE_PUBLISHABLE_KEY = 'pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY';

window.STRIPE_PRICES = {
  pro_monthly: 'price_REPLACE_WITH_PRO_MONTHLY_PRICE_ID',
  pro_annual:  'price_REPLACE_WITH_PRO_ANNUAL_PRICE_ID',
};

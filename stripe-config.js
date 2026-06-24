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
  // Post-launch prices (created 24 Jun 2026) — replace the original launch
  // prices ($2.99/mo, $29.99/yr) once the launch window closed.
  //   pro_monthly_post_launch  → A$8.99/month  (lookup key: pro_monthly_post_launch)
  //   pro_yearly_post_launch   → A$89.99/year (lookup key: pro_yearly_post_launch)
  // Old launch IDs left in comments for reference / rollback:
  //   pro_monthly (launch): price_1T9AdDHtPo8iuYxg6DJzXa8r  → $2.99/mo
  //   pro_annual  (launch): price_1T9AdDHtPo8iuYxgFajx5SQW  → $29.99/yr
  // Existing $2.99 subscribers stay on the launch price (grandfathered) —
  // Stripe doesn't migrate subscriptions when the lookup ID changes.
  pro_monthly: 'price_1TlqgFHtPo8iuYxgBwZj1f2u',
  pro_annual:  'price_1TlqhtHtPo8iuYxg0ankxUYf',
};

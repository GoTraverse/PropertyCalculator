# EquitySight.app — Codebase Guide

Static HTML/CSS/JS site hosted on **Netlify** with **Netlify Functions** as the backend.
No framework, no build step — what you see in the repo is what gets deployed.

---

## Architecture

```
Browser (static files)
  │
  ├── HTML pages + per-page CSS/JS
  ├── shared.css       — design tokens & shared component styles
  ├── auth-nav.js      — injects nav header + session refresh into every page
  ├── footer.js        — injects site footer into every page
  ├── error-capture.js — captures JS errors and sends to client-errors function
  │
  └── /.netlify/functions/   (Node.js serverless, Netlify deploys automatically)
        ├── auth.js           — all user auth + admin actions (Upstash Redis)
        ├── scenarios.js      — save/load/delete property scenarios (Redis)
        ├── stripe.js         — subscription management + discount tracking (Stripe API)
        ├── contact.js        — contact/support form → Resend email
        ├── client-errors.js  — stores/retrieves JS error logs from browsers
        ├── growth.js         — suburb growth rate lookup + 30-day cache
        ├── mapproxy.js       — map tile proxy
        └── photo.js          — property photo proxy/upload
```

---

## File Map

| File | Purpose |
|------|---------|
| `index.html` + `index.css` | Marketing landing page |
| `app.html` + `app.css` + `app.js` | Main calculator app (authenticated) |
| `admin.html` + `admin.css` + `admin.js` | Admin dashboard (role=admin only) |
| `account.html` | User account / subscription management |
| `login.html` + `login.css` | Sign-in / sign-up page |
| `pricing.html` + `pricing.css` | Pricing page |
| `about.html` + `about.css` | About page |
| `contact.html` + `contact.css` | Contact / support page |
| `privacy.html`, `terms.html`, `cookies.html`, `disclaimer.html` | Legal pages |
| `shared.css` | CSS custom properties (design tokens), nav, footer, buttons — included on every page |
| `auth-nav.js` | Renders nav header into `.site-nav-actions`, help modal, session display, background session refresh |
| `footer.js` | Renders full site footer into `#site-footer-root` |
| `stripe-config.js` | Stripe publishable key + plan IDs (client-side only) |
| `account-panel.js` | Floating account panel shown from the app (plan info, sign out) |
| `error-capture.js` | Captures unhandled JS errors + promise rejections, posts to `client-errors` function |
| `netlify.toml` | Build config, CSP headers, CORS for functions, static asset cache headers |

---

## Shared Component Pattern

Every page that needs the nav and footer follows this pattern:

```html
<!-- In <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="shared.css">

<!-- Nav placeholder — auth-nav.js fills .site-nav-actions with login/profile buttons -->
<nav class="site-nav">
  <div class="site-nav-inner">
    <a href="index.html" class="site-logo">...</a>
    <ul class="site-nav-links">...</ul>
    <div class="site-nav-actions"></div>   <!-- filled by auth-nav.js -->
    <button class="nav-hamburger" id="nav-ham">☰</button>
  </div>
</nav>
<script src="auth-nav.js"></script>

<!-- Page content here -->

<!-- Footer placeholder -->
<div id="site-footer-root"></div>
<script src="footer.js"></script>
```

### auth-nav.js behaviour

- Reads `propCalc_session_v1` from localStorage and injects the profile avatar button + dropdown menu into `.site-nav-actions`
- Profile dropdown uses `position:fixed` to avoid being clipped by the nav's `backdrop-filter` stacking context
- Injects a **help/contact modal** (the `?` button); calls `/.netlify/functions/contact` on submit
- `window.renderSiteNav` is exposed so other scripts can re-render after profile changes
- Runs a background `verify` token check 5s after load and every 5 minutes; re-renders nav via `window.renderSiteNav()` if plan/role has changed

---

## Authentication & Session

- **Backend**: Netlify Function `auth.js`, backed by **Upstash Redis**
- **Session storage**: `localStorage` key `propCalc_session_v1`
  - Shape: `{ id, email, name, plan, token, role }`
- **Token**: 30-day TTL token stored in Redis as `token:<token>`
- **Plans**: `free` | `pro` | `adviser`
- **Roles**: `user` | `admin` (admin gets access to `admin.html`)
- **Auth guard**: Every authenticated page has an inline `<script>` at the top of `<head>` that checks localStorage and redirects to `login.html` if no session — this runs synchronously before any rendering

### Calling the auth function (client-side pattern)

```javascript
const resp = await fetch('/.netlify/functions/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.token },
  body: JSON.stringify({ action: 'getProfile' })
});
```

Available actions: `signup`, `signin`, `signout`, `verify`, `getProfile`, `setProfile`,
`changePassword`, `deleteAccount`, `adminListUsers`, `adminResetPassword`, `adminDeleteUser`,
`adminSetRole`, `adminSetPlan`, `adminGetConfig`, `adminSetConfig`, `adminGetStats`,
`adminGetSchemes`, `adminSetSchemes`, `adminGetUserDetails`, `adminGetClientErrors`, `getSchemes`

---

## Admin Dashboard (`admin.html` / `admin.js`)

Role=admin only. Tabs:

| Tab | Key features |
|-----|-------------|
| **Users** | Table of all users with plan badges + DISC badge for discounted subscriptions. Click row → user detail popup. Cog menu per row → quick actions. |
| **User Popup** | Full user details, collapsible Recent Errors section (from error log), all cog-wheel actions inline (Reset PW, Change Plan, Grant/Revoke Admin, View History, Delete). |
| **Scenarios** | Browse and delete user scenarios |
| **Gov Schemes** | Configure government grant/scheme eligibility per state |
| **Growth Data** | View and clear suburb growth cache |
| **Database** | Purge sessions / profiles / scenarios |
| **Error Log** | JS errors captured from user browsers via `error-capture.js`. Filter by message, user, browser, time. Filters persist when results are empty. Dark-themed table for readability. |
| **Configuration** | Site identity, pricing, Stripe keys, feature flags, email templates |
| **Email Templates** | Edit HTML + subject for 6 transactional email types. Content confined to max-width container. |

### Revenue / discount tracking

The Revenue Estimate stat uses list prices from config. If any paying users have active Stripe coupons:
- A gold **DISC** badge appears next to their plan in the users table
- The user popup shows coupon name, discount percentage/amount, and effective price
- The Revenue stat card shows `· N discounted` to flag that actuals may differ

---

## Stripe & Subscription Management (`stripe.js`)

- **Checkout**: `createCheckout` → Stripe Checkout session → redirect → webhook
- **Portal**: `createPortalSession` → Stripe billing portal for self-service
- **Status**: `getSubscriptionStatus` → current sub details including payment method

### Discount tracking

When `checkout.session.completed` fires, `extractDiscountInfo()` pulls coupon details from `session.discount`:
```
stripeDiscountInfo: {
  couponId, couponName,
  percentOff,           // e.g. 66.67
  amountOffCents,       // e.g. 600
  currency,             // e.g. "aud"
  effectiveAmountCents, // base price - discount
  appliedAt             // timestamp
}
```
Stored on the user Redis record. Cleared on downgrade. Updated on `customer.subscription.updated`.

---

## Contact Form (`contact.js`)

- Accepts: `name`, `email`, `subject` (enum), `message` (max 5000 chars)
- Sends email via **Resend API** to the `supportEmail` from `config:site` (or fallback)
- Requires `RESEND_API_KEY` env var; logs to console if not set (graceful dev fallback)
- HTML is escaped before embedding in email body

---

## Error Capture (`error-capture.js` + `client-errors.js`)

- `error-capture.js` loaded on authenticated pages — attaches `window.onerror` and `unhandledrejection` listeners
- Posts errors to `/.netlify/functions/client-errors` with: message, source, line, col, stack, userAgent, URL, userId/email
- `client-errors.js` stores up to 500 most recent errors in Redis (`client-errors:log`)
- Admin Error Log tab reads these via `adminGetClientErrors` action

---

## Scenarios (app.html)

- Saved via `/.netlify/functions/scenarios` (Redis, keyed by userId)
- Draft (unsaved current state) auto-saved to `localStorage` key `propCalc_draft_v1`
- Profile/preferences stored in `localStorage` key `propCalc_profile_v1_<userId>`
- Each scenario has: address, property type, all calculator inputs, reno items, cost items, photo URL, notes

---

## CSS Design Tokens (shared.css)

All colours and fonts are CSS custom properties on `:root`. Google Fonts are loaded via `<link>` tags in each page's `<head>` (with preconnect hints) — **not** via `@import` in shared.css, to avoid render-blocking delays.

```
--cream, --warm-white          background colours
--charcoal, --charcoal-soft    dark UI colours
--slate                        secondary text
--gold                         accent / CTA colour
--sage, --terracotta, --sky    semantic colours
--risk-red, --reward-green     risk indicator colours
--font-mono                    'DM Mono' — used for labels, numbers, badges
--font-display                 'Playfair Display' — used for headings
--radius-sm, --radius-md, --radius-lg   border radii
```

---

## Netlify Functions — Environment Variables Required

Set these in **Netlify → Site Settings → Environment Variables**:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `UPSTASH_REDIS_REST_URL` | auth.js, scenarios.js, client-errors.js | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | auth.js, scenarios.js, client-errors.js | Upstash Redis auth token |
| `AUTH_SALT` | auth.js | Password hashing salt — **required in production**, must be strong random secret. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | stripe.js | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | stripe.js | Stripe webhook signing secret |
| `RESEND_API_KEY` | contact.js | Resend API key for sending contact form emails |

---

## Content Security Policy (netlify.toml)

The CSP `connect-src` currently allows:
- `'self'` — same-origin Netlify Functions
- `https://api.stripe.com` — Stripe payment flow
- `https://nominatim.openstreetmap.org` — suburb geocoding / address lookup
- `https://ipwho.is`, `https://ipapi.co` — IP geolocation (admin user detail popup)

---

## Security Notes

- **XSS**: All user-supplied data rendered into HTML goes through `escHtml()` in admin.js / `_escBanner()` in app.js, which escape `&`, `<`, `>`. Do not embed user data in HTML without this.
- **Photo URLs**: Profile photos inserted via `innerHTML` must pass `safePhotoSrc()` (defined in `account-panel.js` and `auth-nav.js`). Only `data:image/(jpeg|png|gif|webp);base64,` and `https://` URLs are allowed.
- **Admin auth**: Every admin action in auth.js verifies `user.role === 'admin'` via token. Never skip this check. `growth.js set` action also requires admin.
- **Growth rate writes**: `growth.js` action `set` is admin-only and validates rate is a finite number between -30 and 100.
- **Stripe webhooks**: Verified via HMAC-SHA256 signature (`STRIPE_WEBHOOK_SECRET`) with replay protection (5-minute timestamp window).
- **AUTH_SALT**: Throws a hard error at startup if not set in production (`NODE_ENV=production` or `CONTEXT=production`). Never deploy without this set.
- **Password hashing**: HMAC-SHA256 with global salt. Adequate for this app's risk profile; consider bcrypt migration if requirements change.
- **CORS**: Functions return `Access-Control-Allow-Origin: *`. Sensitive actions are all token-gated.

---

## Key Patterns & Conventions

- **No build step**: edit files directly, push to git, Netlify deploys automatically
- **No framework**: plain JS, no React/Vue/etc. DOM manipulation is direct.
- **`recalc()` in app.js**: master recalculation function — called whenever any input changes. Reads all inputs, computes everything, updates all DOM output elements. Called directly for immediate updates (tab switch, load). Use `dRecalc()` from oninput handlers to debounce rapid user input (180ms).
- **`dRecalc()` in app.js**: debounced wrapper around `recalc()` — use this in all `oninput` HTML attributes to avoid firing recalc on every keystroke.
- **Tab system in app.js**: `showTab(id, btn)` shows/hides `<section id="tab-{id}">` panels
- **Pro features**: check `isPro()` before enabling. Plan stored in session (`session.plan === 'pro'`)
- **Mobile breakpoint**: `@media(max-width:600px)` is the main PWA/mobile breakpoint in app.css
- **PWA-only styles**: use `@media (display-mode: standalone)` to hide/show elements only in PWA mode (no JS needed)
- **Print/PDF**: `exportPDF()` in app.js generates a full standalone HTML document in a new window, captures current scenario state as a snapshot
- **Admin pages**: admin.css hides `.site-nav-links` and `.nav-hamburger` — profile icon stays pinned via `grid-column:3`

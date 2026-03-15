# EquitySight.app — Codebase Guide

**Australia's smartest property finance calculator** — Static HTML/CSS/JS site hosted on Netlify with Netlify Functions backend.
No framework, no build step — what you see in the repo is what gets deployed.

**Australian-focused:** Built specifically for Australian first home buyers, investors, and financial planners. All calculators use AUD currency, cover all 8 Australian states, and link to Australian regulatory bodies (ATO, ASIC, RBA, APRA, state revenue offices).

**20 HTML pages** (incl. 10 free calculators) | **9 Netlify functions** | **10 CSS files** | **4046+ lines** of calculator logic in app.js | **2651+ lines** of admin logic in admin.js

---

## Architecture

```
Browser (static files)
  │
  ├── HTML pages (19 total) + per-page CSS/JS
  ├── shared.css          — design tokens & shared component styles
  ├── auth-nav.js         — injects nav header + session refresh into every page
  ├── footer.js           — injects site footer into every page
  ├── error-capture.js    — captures JS errors and sends to client-errors function
  ├── account-panel.js    — standalone account settings panel
  ├── legal.js            — markdown parser for legal pages
  │
  └── /.netlify/functions/   (Node.js serverless, Netlify deploys automatically)
        ├── auth.js           — all user auth + admin actions (Upstash Redis)
        ├── scenarios.js      — save/load/delete property scenarios (Redis)
        ├── stripe.js         — subscription management + discount tracking (Stripe API)
        ├── contact.js        — contact/support form → Resend email
        ├── client-errors.js  — stores/retrieves JS error logs from browsers
        ├── growth.js         — suburb growth rate lookup + 30-day cache
        ├── photo.js          — property photo storage/retrieval proxy
        └── mapproxy.js       — OpenStreetMap tile proxy for map rendering
```

---

## File Map — Complete

### Core Application
| File | Size | Purpose |
|------|------|---------|
| `app.html` + `app.css` + `app.js` | 89K + 54K + 212K | **Main calculator app** (authenticated) — 30-year projections, cost breakdown, reno items, loan amortization, suburb growth, scenario save/load, PDF export, PWA capable |
| `admin.html` + `admin.css` + `admin.js` | 63K + 21K + 134K | **Admin dashboard** (role=admin only) — 8 tabs: Users, Config, Schemes, Stats, Growth Data, Database, Error Log, Emails |
| `account.html` | 52K | User account & subscription management panel |
| `login.html` + `login.css` | 21K + 3.9K | Sign-in & sign-up page — email verification flow |

### Marketing Pages
| File | Size | Purpose |
|------|------|---------|
| `index.html` + `index.css` | 15K + 17K | Landing/marketing page — hero, features, pricing preview, CTAs |
| `pricing.html` + `pricing.css` | 17K + 5.9K | Pricing page — plan cards, feature comparison |
| `about.html` + `about.css` | 9.1K + 3.5K | About page — company mission & values |
| `contact.html` + `contact.css` | 13K + 4.3K | Contact/support page — form submission via Resend |

### Legal Pages (rendered from .md sources)
| File | Purpose |
|------|---------|
| `privacy.html` + `privacy.md` | Privacy policy |
| `terms.html` + `terms.md` | Terms of service |
| `cookies.html` + `cookies.md` | Cookie policy |
| `disclaimer.html` + `disclaimer.md` | Financial disclaimer |

### Free SEO Tools (marketing lead generation)
| File | Size | Purpose |
|------|------|---------|
| `rental-yield-calculator.html` | 12K | Rental yield, cash flow, ROI calculator |
| `renovation-cost-calculator.html` | 13K | Renovation budget with itemized costs |
| `house-flip-calculator.html` | 14K | Buy/renovate/sell profit analysis |
| `mortgage-stress-calculator.html` | 14K | Loan repayment stress testing |
| `stamp-duty-calculator.html` | 18K | **All Australian states** stamp duty calculator (NSW, VIC, QLD, SA, WA, TAS, ACT, NT) with state dropdown |
| `cost-of-purchase-calculator.html` | 16K | **Total cost of purchase** breakdown — all costs when buying (stamp duty, legal, bank, inspections, insurance, moving, lease break) — all Australian states |
| `stamp-duty-qld.html` | 11K | Legacy QLD-specific stamp duty calculator |
| `equity-release-calculator.html` | 12K | Home equity release & borrowing capacity based on LVR |
| `loan-serviceability-calculator.html` | 13K | Mortgage affordability & borrowing capacity based on income/expenses |
| `first-home-buyer-grants-calculator.html` | 14K | State-specific FHB grants, exemptions, and concessions |
| `tools.css` | 7.6K | Shared styles for all calculators |

### Utilities & Configuration
| File | Size | Purpose |
|------|------|---------|
| `shared.css` | 15K | **Design system** — CSS variables (colors, fonts, radii, shadows), nav, footer, buttons, dark mode, responsive breakpoints |
| `auth-nav.js` | 489 lines | Injects sticky nav header with profile button, help modal, background session refresh (every 5 min) |
| `footer.js` | 65 lines | Injects site footer with dynamic branding from localStorage config |
| `error-capture.js` | 67 lines | Captures unhandled JS errors & promise rejections, POSTs to client-errors function |
| `account-panel.js` | 26K | Standalone account settings component — profile pic, color theme, plan info, sign out |
| `legal.js` | 300+ lines | Markdown → HTML parser — frontmatter, headings, TOC, safe links |
| `stripe-config.js` | 25 lines | Exports Stripe publishable key + plan IDs (client-safe config) |
| `manifest.json` | 1.2K | PWA manifest — app name, icons, start URL, display mode, theme colors |
| `netlify.toml` | 2.5K | Build config, CSP headers, CORS, cache headers for static assets |
| `404.html` + `import-test.html` | 3.1K + 697B | Error page & dev test page |
| `robots.txt` | Site crawling directives — allows public pages, blocks admin/app/account |
| `sitemap.xml` | XML sitemap for search engines — 10+ URLs with priority/change frequency |
| `favicon.svg` | SVG favicon (logo mark) |
| `BingSiteAuth.xml` + `ms43432176.txt` | Search engine verification tokens |

---

---

## Netlify Functions — Complete Reference

### auth.js (User Authentication & Admin)
**~800 lines** — Upstash Redis backed auth engine.

**User Actions:**
- `signup` — register with email, creates user record + sends verification email
- `signin` — lookup by email (not password) + sends verification code
- `verifyEmail` — verify code, set `emailVerified=true`, create token
- `verify` — validate token TTL + check user still exists (logs out deleted users)
- `signout` — delete token from Redis
- `getProfile` — retrieve profile settings + photo
- `setProfile` — save profile color/theme
- `setPhoto` — save base64 photo
- `changePassword` — update password hash
- `requestPasswordReset` — send reset code email
- `resetPasswordWithToken` — set new password with code
- `deleteAccount` — purge all user data from Redis

**Admin Actions** (require `role === 'admin'` + token):
- `adminListUsers` — returns all users (no passwords)
- `adminGetUserDetails` — full user record + profile + scenario count + active tokens + error count
- `adminSetPlan` — upgrade/downgrade plan
- `adminSetRole` — grant/revoke admin
- `adminResetPassword` — admin forces password reset
- `adminDeleteUser` — purge user from system
- `adminGetConfig` — site config (logo, pricing, feature flags)
- `adminSetConfig` — update site config
- `adminGetStats` — signup/login metrics + revenue estimate
- `adminGetSchemes` — government grant schemes per state
- `adminSetSchemes` — update schemes
- `adminGetClientErrors` — retrieve JS error logs with filters
- `adminGetEmailTemplates` — 6 transactional email templates
- `adminSetEmailTemplate` — update email template (HTML + subject)

**Data stored in Redis:**
- `user:<email>` → full user record (name, hash, id, plan, role, createdAt, lastLoginAt, loginCount, emailVerified, etc.)
- `token:<token>` → {userId, email, name, plan, role, expires} with 30-day TTL
- `profile:<userId>` → {color, ...settings}
- `photo:<userId>` → base64 image data
- `email-template:*` → 6 types (verification, welcome, password_reset, subscription, security_alert, promotional)
- `events:<userId>` → user action history

### scenarios.js (Scenario Save/Load)
**~300 lines** — Per-user property scenario library.

**Actions:**
- `listScenarios` — get all scenarios for user (index + metadata)
- `saveScenario` — create/update scenario with full state
- `deleteScenario` — purge scenario
- `getScenario` — retrieve single scenario full state
- `getScenarioIndex` — list of scenario IDs + metadata only (for listing)

**Data stored:**
- `scenarios:<userId>:index` → [{id, address, type, createdAt, ...}]
- `scenarios:<userId>:state:<id>` → full calculator state (inputs + outputs)
- `scenarios:<userId>:photo:<id>` → base64 property photo

### stripe.js (Payment Processing)
**~500 lines** — Stripe checkout, portal, webhooks, discount tracking.

**Actions:**
- `createCheckout` — create Stripe Checkout session, return redirect URL
- `createPortalSession` — create Stripe Billing Portal session URL for self-service
- `getSubscriptionStatus` — current subscription details for user

**Webhooks** (verified via STRIPE_WEBHOOK_SECRET HMAC):
- `checkout.session.completed` — new subscription, extract discount, upgrade plan
- `customer.subscription.updated` — plan/status change
- `customer.subscription.deleted` — downgrade to free
- `invoice.payment_failed` — send failure email (future)

**Discount tracking** — when coupon applied:
```
stripeDiscountInfo: {
  couponId, couponName, percentOff, amountOffCents,
  currency, effectiveAmountCents, appliedAt
}
```

### contact.js (Contact Form)
**~100 lines** — Contact form submission via Resend email.

**Action:**
- `POST /contact` with {name, email, subject, message, diagnostics}
- Validates email format, escapes HTML
- Sends via Resend API to `supportEmail` from `config:site`
- If RESEND_API_KEY missing, logs to console (dev fallback)

### client-errors.js (Error Logging)
**~150 lines** — Aggregates JS errors from browsers.

**Actions:**
- `submitError` — receives error log from `error-capture.js` (message, stack, userAgent, URL, userId, etc.)
- `adminGetClientErrors` — retrieve logs with filters (message, userEmail, browser, dateRange)

**Data stored:**
- `client-errors:log` → array of up to 500 recent errors (FIFO, oldest dropped)

### growth.js (Suburb Growth Cache)
**~200 lines** — Growth rate lookup + 30-day cache.

**Actions:**
- `get` → lookup growth rate for suburb:state (from cache or return null)
- `set` — **admin only** — store growth rate (validates: finite number, -30 to 100)
- `clear` — **admin only** — purge growth cache

**Data stored:**
- `growth:<suburb>:<state>` → {rate, timestamp} with 30-day TTL

### photo.js (Photo Storage)
**~80 lines** — Property photo proxy.

**Actions:**
- `get` — retrieve base64 photo by scenario ID (actually handled by scenarios.js)
- Stores base64 in `photo:<userId>` key

### mapproxy.js (Map Tile Proxy)
**~120 lines** — OpenStreetMap tile fetching.

**Actions:**
- `POST /mapproxy` with {lat, lng} — fetches 3×3 grid of map tiles
- Round-robins across tile servers (a/b/c.tile.openstreetmap.org)
- Returns base64-encoded PNG grid to client for stitching
- No auth required (public data)

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

**Role=admin only.** 8 tabs with full user/system management:

| Tab | Key features |
|-----|-------------|
| **Users** | Table of all users (sortable by name/email/plan/joined). Plan badges (free/pro/adviser) + DISC badge for coupon discounts. Click row → detailed popup. Cog menu per row → quick actions. |
| **User Popup** | Full user record (name, email, plan, role, dates, login count, tokens, scenarios, error count). **Login Status badge**: ✓ Active (green), ✓ Email Verified (gold), ⏳ Awaiting Verification (slate). Collapsible Recent Errors section. Inline action buttons (Reset PW, Change Plan, Grant/Revoke Admin, View History, Delete User). |
| **Scenarios** | Browse all saved property scenarios per user with details. Delete individual scenarios. |
| **Config** | Site branding (logo, name, colors), pricing plans, Stripe keys, feature flags, support email, mail provider. |
| **Schemes** | Government grant/scheme eligibility per Australian state (NSW, VIC, QLD, WA, SA, TAS). Edit scheme details, active status. |
| **Stats** | Signup/login metrics, revenue estimates, user growth chart, subscription breakdown. |
| **Growth Data** | Cached suburb growth rates (20-year average, LGA, etc.). Admin can update rates or clear entire cache. 30-day Redis TTL. |
| **Database** | Maintenance tools — purge sessions, profiles, or scenarios for testing/recovery. |
| **Error Log** | JS error logs captured from user browsers. Filter by message keyword, user email, browser type, date range. Errors include stack trace, user agent, page URL. Dark theme for readability. |
| **Emails** | Edit 6 transactional email templates (verification, welcome, password reset, subscription update, security alert, promotional). Supports `{{variable}}` interpolation. |

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

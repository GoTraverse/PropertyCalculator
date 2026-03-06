# EquitySight.app — Codebase Guide

Static HTML/CSS/JS site hosted on **Netlify** with **Netlify Functions** as the backend.
No framework, no build step — what you see in the repo is what gets deployed.

---

## Architecture

```
Browser (static files)
  │
  ├── HTML pages + per-page CSS/JS
  ├── shared.css     — design tokens & shared component styles
  ├── auth-nav.js    — injects nav header + session refresh into every page
  ├── footer.js      — injects site footer into every page
  │
  └── /.netlify/functions/   (Node.js serverless, Netlify deploys automatically)
        ├── auth.js          — all user auth + admin actions (Upstash Redis)
        ├── scenarios.js     — save/load/delete property scenarios (Redis)
        ├── stripe.js        — subscription management (Stripe API)
        └── photo.js         — property photo proxy/upload
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
| `auth-nav.js` | Renders nav header into `.site-nav-actions`, handles session display, hamburger toggle, background session refresh |
| `footer.js` | Renders full site footer into `#site-footer-root` |
| `stripe-config.js` | Stripe publishable key + plan IDs (client-side only) |
| `account-panel.js` | Floating account panel shown from the app (plan info, sign out) |
| `netlify.toml` | Build config, CSP headers, CORS for functions |

---

## Shared Component Pattern

Every page that needs the nav and footer follows this pattern:

```html
<!-- In <head> -->
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
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'getProfile', token: session.token })
});
```

Available actions: `signup`, `signin`, `signout`, `verify`, `getProfile`, `setProfile`,
`changePassword`, `deleteAccount`, `adminListUsers`, `adminResetPassword`, `adminDeleteUser`,
`adminSetRole`, `adminSetPlan`, `adminGetConfig`, `adminSetConfig`, `adminGetStats`,
`adminGetSchemes`, `adminSetSchemes`, `adminGetUserDetails`, `getSchemes`

---

## Scenarios (app.html)

- Saved via `/.netlify/functions/scenarios` (Redis, keyed by userId)
- Draft (unsaved current state) auto-saved to `localStorage` key `propCalc_draft_v1`
- Profile/preferences stored in `localStorage` key `propCalc_profile_v1_<userId>`
- Each scenario has: address, property type, all calculator inputs, reno items, cost items, photo URL, notes

---

## CSS Design Tokens (shared.css)

All colours and fonts are CSS custom properties on `:root`:

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
| `UPSTASH_REDIS_REST_URL` | auth.js, scenarios.js | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | auth.js, scenarios.js | Upstash Redis auth token |
| `AUTH_SALT` | auth.js | Password hashing salt — must be a strong random secret |
| `STRIPE_SECRET_KEY` | stripe.js | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | stripe.js | Stripe webhook signing secret |

---

## Content Security Policy (netlify.toml)

The CSP currently allows:
- `connect-src 'self' https://api.stripe.com` — **Note**: nominatim.openstreetmap.org is NOT whitelisted, which blocks suburb geocoding (TODO #5). To fix, add `https://nominatim.openstreetmap.org` to `connect-src`.

---

## TODO.txt

`TODO.txt` in the repo root is the live task list. Claude and devs update it as tasks complete.
Format: numbered list, `!` prefix = urgent. Remove completed items.

### Current open items summary (see TODO.txt for full detail)
1. Property image disappears after page refresh
2. Auto-fill suburb growth rate + cache (suburb data caching)
3. Projection tab: show quarter labels (Q1/Q2/Q3/Q4)
4. Stripe cancellation not reflecting in account settings
5. **CSP blocks nominatim.openstreetmap.org** (suburb geocoding broken)
6. Admin: IP location popup not showing location
7. Automated email (signup confirmation, invoices)
8. Better PDF export library
9. Dark mode / light mode toggle
10. Admin: suburb growth config + shared 30-day cache
11. Forgot password functionality
12. Collaborate / share scenario with another user
13. ~~Restructure~~ DONE
- PWA 7: Projection graph tooltip unusable on mobile — custom slider solution

---

## Key Patterns & Conventions

- **No build step**: edit files directly, push to git, Netlify deploys automatically
- **No framework**: plain JS, no React/Vue/etc. DOM manipulation is direct.
- **`recalc()` in app.js**: master recalculation function — called whenever any input changes. Reads all inputs, computes everything, updates all DOM output elements.
- **Tab system in app.js**: `showTab(id, btn)` shows/hides `<section id="tab-{id}">` panels
- **Pro features**: check `isPro()` before enabling. Plan stored in session (`session.plan === 'pro'`)
- **Mobile breakpoint**: `@media(max-width:600px)` is the main PWA/mobile breakpoint in app.css
- **Print/PDF**: `exportPDF()` in app.js generates a full standalone HTML document in a new window, captures current scenario state as a snapshot

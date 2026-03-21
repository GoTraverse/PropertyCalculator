# EquitySight.app

**Australia's smartest property investment calculator** — Built for Australian first home buyers and investors. Model property purchase costs, renovation budgets, loan repayments, rental overlap, 30-year projections, and risk indicators in one integrated platform.

🇦🇺 **Australian-focused:** All 8 states (NSW, VIC, QLD, SA, WA, TAS, ACT, NT), AUD currency, Australian regulatory frameworks (ATO, ASIC, RBA), and state-specific grant/duty rules.

---

## Core Features

### Main Calculator (`app.html`)
| Feature | What it does |
|---------|------------|
| **Costs Tab** | Full purchase cost breakdown — purchase price, stamp duty, legal fees, building inspection, valuation, lender fees, etc. LVR badge + auto stamp duty estimate + LMI calc + FHOG display |
| **Renovation Tab** | Itemised renovation budget — line items with costs, progress bar, totals by category |
| **Repayments Tab** | Loan amortisation table, monthly/fortnightly repayment schedule, fortnightly benefit, impact of extra repayments |
| **Rent Overlap** | Calculate cost of carrying both current rental and new mortgage simultaneously |
| **Projection (30-year)** | Equity/value growth chart, quarterly breakdown table, offset account modelling, early payoff scenarios |
| **Risk** | LVR (Loan-to-Value Ratio), debt-to-income ratio, interest rate stress testing, buffer runway analysis |

### Account Features
- **Scenarios** — save multiple property analyses per account, restore/delete saved scenarios (photo preserved on save/restore)
- **Government Schemes** — state-specific grant/scheme eligibility (NSW/VIC/QLD/WA/SA/TAS)
- **Suburb Growth Lookup** — auto-fetch 20-year suburb growth rates, 30-day cache
- **PDF Export** — print-optimised standalone snapshot of current scenario
- **Photo Attachment** — drag-and-drop or paste image URL for property
- **Profile Management** — color theme, profile picture, subscription management
- **PWA** — install as mobile app on iOS/Android, offline capable

### Admin Dashboard (`admin.html`)
**14 tabs for system & user management:**
- **Users** — table with sorting, plan badges, discount indicators; click to view full details + error history
- **Scenarios** — browse all saved property scenarios per user; delete individual scenarios
- **Gov Schemes** — government scheme eligibility editor per state
- **Growth Data** — suburb growth rate cache management
- **Database** — maintenance tools (purge sessions/profiles/scenarios)
- **Error Log** — JS error logs from user browsers, filterable by email/message/browser/date
- **Settings** — core site config: name, support email, session TTL, password policy, signup control
- **Features** — feature flags: PDF export, projections, referral program, upload limits
- **Integrations** — Stripe keys, Google Sign-In client ID, API credentials
- **Branding** — logo (emoji or image upload), brand colour, colour theme presets, banner message
- **Email Templates** — 6 transactional email templates (verification, welcome, password reset, subscription, security alert, promotional)
- **About Page** — edit the About page content from admin
- **Legal Pages** — edit privacy, terms, cookies, disclaimer from admin
- **Suburbs** — browse/search suburb data, state breakdown, trigger suburb page rebuilds via Netlify deploy hook

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Plain HTML + CSS + vanilla JS — no framework, no build step, no bundler |
| **Backend** | Netlify Functions (Node.js serverless) |
| **Database** | Upstash Redis (REST API) |
| **Authentication** | Custom token-based auth with Upstash Redis |
| **Payments** | Stripe (subscriptions, webhooks, discount tracking) |
| **Email** | Resend API (transactional & contact form emails) |
| **Hosting** | Netlify (automatic deployment on git push) |
| **Maps** | OpenStreetMap tiles (via mapproxy.js) |

---

## Project Structure (24 HTML pages + 14,512 suburb pages, 11 Netlify functions, 9 SEO tools)

### Application Pages
```
app.html                # Main calculator (authenticated)
admin.html              # Admin dashboard (role=admin only) — 14 tabs
account.html            # User account settings & subscription management
login.html              # Sign-up & sign-in with email verification + Google Sign-In
showcase.html           # App gallery — real mobile screenshots (light + dark)
```

### Marketing Pages
```
index.html              # Landing page with features & pricing preview
pricing.html            # Full pricing page with feature comparison
about.html              # About page
contact.html            # Contact form
```

### Free SEO Tool Calculators (lead generation — 9 tools in /tools/)
```
stamp-duty-calculator.html           # All 8 Australian states (NSW, VIC, QLD, SA, WA, TAS, ACT, NT) with state dropdown
cost-of-purchase-calculator.html     # Total cost breakdown — stamp duty, legal, bank fees, inspections, insurance, moving, lease break
equity-release-calculator.html       # Home equity release & borrowing capacity based on LVR
loan-serviceability-calculator.html  # Mortgage affordability based on income & expenses
first-home-buyer-grants-calculator.html # State-specific FHB grants & stamp duty exemptions
rental-yield-calculator.html         # Rental yield analysis
renovation-cost-calculator.html      # Renovation budget
house-flip-calculator.html           # Buy/renovate/sell profit
mortgage-stress-calculator.html      # Loan stress testing
```

All SEO tools feature:
- **Comprehensive SEO**: Meta tags, keywords, structured data (JSON-LD schema)
- **Mobile-optimized**: Responsive design, PWA-ready
- **Lead generation**: CTAs linking to main app signup
- **Educational**: Built-in content sections with explanations
- **Accurate rates**: 2025-26 Australian government rates, conditions, and thresholds
- **Live market data**: RBA cash rate + ABS state median prices via `market-rate.js`

### Legal Pages (rendered from Markdown)
```
privacy.html            # Privacy policy (privacy.md)
terms.html              # Terms of service (terms.md)
cookies.html            # Cookie policy (cookies.md)
disclaimer.html         # Financial disclaimer (disclaimer.md)
```

### Core Styles
```
shared.css              # Design tokens, nav, footer, buttons (included by all pages)
app.css                 # Main calculator styles
admin.css               # Admin dashboard styles
legal.css               # Legal page styles
index.css, pricing.css, about.css, login.css, contact.css, tools.css, suburb-insights.css
```

### Shared Scripts
```
auth-nav.js             # Nav header + profile menu + help modal (514 lines)
footer.js               # Site footer
error-capture.js        # JS error logging (on app/admin/account only)
account-panel.js        # Account settings component (483 lines)
account.js              # Account page logic — subscription, Stripe portal (555 lines)
legal.js                # Markdown → HTML parser for legal pages
stripe-config.js        # Stripe API key + plan IDs (client-safe)
shared-calcs.js         # Common calc utilities (fmt, parse, repayment, growth) — used by all calculators
market-rate.js          # Live RBA cash rate + ABS state median prices (window.MarketRate)
site-init.js            # Applies dark/light theme before first paint (synchronous)
adsense.js              # Google AdSense integration
gtag-init.js            # Google Analytics initialization
```

### Page-specific Scripts
```
app-init.js / app-events.js         # Main calculator init + event wiring
admin-events.js                     # Admin dashboard event wiring
index-init.js / index-events.js     # Landing page init + events
login.js                            # Login/signup page
pricing.js                          # Pricing page
about-init.js                       # About page init
contact.js                          # Contact form handling
suburb-insights.js                  # Suburb insights page JS
state-hub-search.js                 # State hub client-side search by name/postcode
```

### Backend Functions (`netlify/functions/`)
```
auth.js                 # User auth + admin management (~800 lines, 10+ actions)
scenarios.js            # Scenario CRUD operations (~300 lines)
stripe.js               # Stripe checkout, portal, webhooks (~500 lines)
contact.js              # Contact form email submission
client-errors.js        # JS error log aggregation
growth.js               # Suburb growth rate cache (30-day TTL)
photo.js                # Property photo storage proxy
mapproxy.js             # OpenStreetMap tile proxy
address-suggest.js      # Address autocomplete (rate-limited: 30 req/min)
market-data.js          # Suburb insights market data API
```

### Suburb Insights System (14,512 generated pages)
```
fetch-abs-data.js               # Downloads ABS 2021 Census suburb data → data/abs-suburbs.json
generate-suburbs-data.js        # Merges ABS data + postcodes → data/suburbs.json
build-suburbs.js                # Generates suburb pages + state hubs + sitemap from templates
data/suburbs.json               # 14,512 suburbs with real names, populations, postcodes
templates/suburb-page.html      # Suburb page template (schema.org, BreadcrumbList)
templates/state-hub.html        # State hub template (search, progressive loading)
suburb-insights.css             # Shared styles for suburb/state pages
suburb/{state}/{slug}/index.html  # Generated (gitignored, built on deploy)
invest/{state}/index.html         # Generated state hub pages (gitignored)
```

### Configuration
```
netlify.toml            # Netlify build config, CSP headers, cache rules, force-404 redirects for dev files
.netlifyignore          # Files excluded from Netlify CDN (dev docs, build scripts, ERRORS.json, raw data)
manifest.json           # PWA manifest (app name, icons, theme colors)
robots.txt              # Search engine crawling directives
sitemap.xml             # Sitemap index → sitemap-core.xml (70 URLs) + sitemap-suburbs.xml (14,520 URLs)
```

> **For detailed architecture, conventions, auth flows, and data models** — see **`CODEBASE.md`**

---

## Environment Variables

Set in **Netlify → Site Settings → Environment Variables**:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `UPSTASH_REDIS_REST_URL` | auth.js, scenarios.js, client-errors.js, growth.js | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | auth.js, scenarios.js, client-errors.js, growth.js | Upstash Redis auth token |
| `AUTH_SALT` | auth.js | Password hashing salt — **required in production**. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | stripe.js | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | stripe.js | Stripe webhook signing secret (for verifying webhooks) |
| `RESEND_API_KEY` | contact.js, auth.js | Resend API key for transactional & contact form emails |
| `VERIFY_EMAIL_FROM` | auth.js | Email sender address (default: noreply@equitysight.app) |
| `GITHUB_TOKEN` | client-errors.js | GitHub API token for auto-syncing errors to ERRORS.json in repo |

---

## Development & Workflow

**No build step.** Edit files directly, push to git — Netlify deploys automatically.

```bash
# Development with local functions
npx netlify dev

# This runs:
# - Static files on http://localhost:8888
# - Functions on /.netlify/functions/*
# - Requires .env or Netlify dashboard env vars
```

### Git Branches
- **`main`** — protected, read-only; pull current tasks from here
- **`Staging`** — staging/pre-production branch
- **`claude/***` — temporary feature branches (deleted after merge)
- **`TODO.md`** — source of truth for outstanding work; remove lines when tasks complete

### Plans & Roles
- **Plans**: `free` | `pro` | `adviser` — stored in localStorage session + Redis user record
- **Roles**: `user` | `admin` — admin role unlocks `admin.html` dashboard
- **Session**: localStorage key `propCalc_session_v1` = `{id, email, name, plan, token, role}`

### Important Notes
- **AUTH_SALT** — throws hard error at startup in production if not set. Never deploy without.
- **CSP Policy** — defined in `netlify.toml`; update if adding new external APIs
- **Mobile breakpoint** — `@media(max-width:600px)` for PWA/iOS
- **Password hashing** — HMAC-SHA256 with salt (adequate for this app; consider bcrypt if risk profile increases)
- **Dev file security** — `publish = "."` serves the entire repo; new dev/internal files must be added to `.netlifyignore` or they'll be publicly accessible. See `CODEBASE.md` Security Notes for full details.

---

## Subscription Plans

| Plan | Features |
|------|---------|
| **Free** | Single scenario, basic calculator tabs, limited export |
| **Pro** | Unlimited scenarios, 30-year projections, PDF export, suburb growth lookup, priority support |
| **Adviser** | Pro + multi-client management, white-label options (future) |

---

## Quick Start for New Contributors

1. **Read architecture** — `CODEBASE.md` (auth model, file map, conventions, data flows)
2. **Check open tasks** — `TODO.md` (lists work to be done)
3. **Set environment variables** — copy the table above into Netlify dashboard
4. **Run locally** — `npx netlify dev` (requires env vars)
5. **Make changes** — edit HTML/CSS/JS directly (no build step)
6. **Test** — open browser, check desktop + mobile (600px breakpoint)
7. **Security check** — if adding a new dev/internal file, add it to `.netlifyignore`
8. **Commit & push** — to `Staging` or feature branch
9. **Update docs** — if architecture changes, update `CODEBASE.md` and `README.md`
10. **Update TODO.md** — remove completed tasks, add new ones as discovered

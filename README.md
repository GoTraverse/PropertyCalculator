# EquitySight.app

**Australia's smartest property investment calculator** — Built for Australian first home buyers and investors. Model property purchase costs, renovation budgets, loan repayments, rental overlap, 30-year projections, and risk indicators in one integrated platform.

🇦🇺 **Australian-focused:** All 8 states (NSW, VIC, QLD, SA, WA, TAS, ACT, NT), AUD currency, Australian regulatory frameworks (ATO, ASIC, RBA), and state-specific grant/duty rules.

---

## Core Features

### Main Calculator (`app.html`)
| Feature | What it does |
|---------|------------|
| **Costs Tab** | Full purchase cost breakdown — purchase price, stamp duty, legal fees, building inspection, valuation, lender fees, etc. |
| **Renovation Tab** | Itemised renovation budget — line items with costs, progress bar, totals by category |
| **Repayments Tab** | Loan amortisation table, monthly repayment schedule, impact of extra repayments, comparison scenarios |
| **Rent Overlap** | Calculate cost of carrying both current rental and new mortgage simultaneously |
| **Projection (30-year)** | Equity/value growth chart, quarterly breakdown table, early payoff scenarios, compound growth visualisation |
| **Risk** | LVR (Loan-to-Value Ratio), debt-to-income ratio, interest rate stress testing, buffer runway analysis |

### Account Features
- **Scenarios** — save multiple property analyses per account, restore/delete saved scenarios
- **Government Schemes** — state-specific grant/scheme eligibility (NSW/VIC/QLD/WA/SA/TAS)
- **Suburb Growth Lookup** — auto-fetch 20-year suburb growth rates, 30-day cache
- **PDF Export** — print-optimised standalone snapshot of current scenario
- **Photo Attachment** — drag-and-drop or paste image URL for property
- **Profile Management** — color theme, profile picture, subscription management
- **PWA** — install as mobile app on iOS/Android, offline capable

### Admin Dashboard (`admin.html`)
**8 tabs for system & user management:**
- **Users** — table with sorting, plan badges, discount indicators; click to view full details + error history
- **Config** — site branding, logo, pricing plans, Stripe integration, feature flags
- **Schemes** — government scheme eligibility editor per state
- **Stats** — signup/login metrics, revenue estimate, subscription breakdown
- **Growth Data** — suburb growth rate cache management
- **Database** — maintenance tools (purge sessions/profiles/scenarios)
- **Error Log** — JS error logs from user browsers, filterable by email/message/browser/date
- **Emails** — transactional email template editor (6 types: verification, welcome, password reset, subscription, security, promotional)

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

## Project Structure (20 HTML pages + 14,512 suburb pages, 9 Netlify functions, 10 SEO tools)

### Application Pages
```
app.html                # Main calculator (authenticated)
admin.html              # Admin dashboard (role=admin only)
account.html            # User account settings
login.html              # Sign-up & sign-in with email verification
```

### Marketing Pages
```
index.html              # Landing page with features & pricing preview
pricing.html            # Full pricing page with feature comparison
about.html              # About page
contact.html            # Contact form
```

### Free SEO Tool Calculators (lead generation — 10 tools)
```
stamp-duty-calculator.html           # All 8 Australian states (NSW, VIC, QLD, SA, WA, TAS, ACT, NT) with state dropdown
cost-of-purchase-calculator.html     # **NEW** Total cost breakdown — stamp duty, legal, bank fees, inspections, insurance, moving, lease break
equity-release-calculator.html       # Home equity release & borrowing capacity based on LVR
loan-serviceability-calculator.html  # Mortgage affordability based on income & expenses
first-home-buyer-grants-calculator.html # State-specific FHB grants & stamp duty exemptions
rental-yield-calculator.html         # Rental yield analysis
renovation-cost-calculator.html      # Renovation budget
house-flip-calculator.html           # Buy/renovate/sell profit
mortgage-stress-calculator.html      # Loan stress testing
stamp-duty-qld.html                  # Legacy QLD-only stamp duty (backward compat)
```

All SEO tools feature:
- **Comprehensive SEO**: Meta tags, keywords, structured data (JSON-LD schema)
- **Mobile-optimized**: Responsive design, PWA-ready
- **Lead generation**: CTAs linking to main app signup
- **Educational**: Built-in content sections with explanations
- **Accurate rates**: 2025-26 Australian government rates, conditions, and thresholds

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
app.css                 # Main calculator styles (54K)
admin.css               # Admin dashboard styles (21K)
index.css, pricing.css, about.css, login.css, contact.css, tools.css
```

### Shared Scripts (injected on every page)
```
auth-nav.js             # Nav header + profile menu + help modal
footer.js               # Site footer
error-capture.js        # JS error logging (on app/admin/account only)
account-panel.js        # Account settings component
legal.js                # Markdown → HTML parser for legal pages
stripe-config.js        # Stripe API key + plan IDs (client-safe)
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
netlify.toml            # Netlify build config, CSP headers, cache rules
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
7. **Commit & push** — to `Staging` or feature branch
8. **Update docs** — if architecture changes, update `CODEBASE.md` and `README.md`
9. **Update TODO.md** — remove completed tasks, add new ones as discovered

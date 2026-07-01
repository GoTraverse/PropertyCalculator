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
**16 tabs for system & user management:**
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
- **Blog** — author posts in Markdown with live word count vs the `BLOG_MIN_WORDS` build gate (default 1200, AdSense target 1500), draft/publish workflow, slug collision check; posts stored in Upstash Redis and rendered to static HTML at deploy time. Sub-floor posts still render but are marked `noindex` and excluded from sitemap/RSS/index.
- **Moderation** — approve, reject, or delete user-submitted suburb reviews **and** blog comments; top-level kind switcher with nested Pending/All sub-tabs; atomic aggregate updates on approve/reject

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Plain HTML + CSS + vanilla JS — no framework, no build step, no bundler |
| **Backend** | Netlify Functions (Node.js serverless) |
| **Database** | Upstash Redis (REST API) |
| **Authentication** | HttpOnly cookie session auth with Upstash Redis |
| **Payments** | Stripe (subscriptions, webhooks, discount tracking) |
| **Email** | Resend API (transactional & contact form emails) |
| **Hosting** | Netlify (automatic deployment on git push) |
| **Maps** | OpenStreetMap tiles (via mapproxy.js) |

---

## Project Structure (~32 core HTML pages + 14,512 suburb pages + 19 city pages + Redis-backed blog + suburb reviews + blog comments, 13 Netlify functions + 1 shared helper, 14 SEO calculators + 8 state-specific stamp duty pages + landing page)

### Application Pages
```
app.html                # Main calculator (authenticated)
admin.html              # Admin dashboard (role=admin only) — 16 tabs (incl. Blog CMS + Moderation)
account.html            # User account settings & subscription management
login.html              # Sign-up & sign-in with email verification + Google Sign-In
showcase.html           # App gallery — real mobile screenshots (light + dark)
```

### Marketing Pages
```
index.html              # Landing page with features & pricing preview
tools/index.html        # /tools landing page — all 14 calculators grouped (Buying / Borrowing / Investment)
pricing.html            # Full pricing page with feature comparison
about.html              # About page (with Organization JSON-LD)
contact.html            # Contact form
methodology.html        # Methodology (formulas, thresholds) — rendered from methodology.md
data-sources.html       # Data sources + attribution — rendered from data-sources.md
```

### Free SEO Tool Calculators (lead generation — 14 tools + 8 state-stamp-duty pages in /tools/)
```
stamp-duty-calculator.html             # All-states + cross-state comparison + LMI + reg fees + total upfront
stamp-duty-calculator-{state}.html × 8 # NSW / VIC / QLD / WA / SA / TAS / ACT / NT dedicated state pages
                                       # generated by build/build-state-stamp-duty.js
cost-of-purchase-calculator.html       # Total cost breakdown incl. stamp duty, legal, bank fees, inspections
deposit-calculator.html                # How much deposit needed — LMI, stamp duty, FHB concessions
first-home-buyer-grants-calculator.html# Federal FHBG + Help to Buy + FHSS overlay on state SD + FHOG
                                       # Computes actual $ saving per program; hero total-assistance figure
borrowing-power-calculator.html        # Joint applicants, income-type haircuts (PAYG/casual/rental), tiered HEM,
                                       # credit-card 3% rule, HECS by income tier, APRA 3% buffer, LVR slider
loan-serviceability-calculator.html    # Mortgage affordability from income + expenses
mortgage-repayment-calculator.html     # True fortnightly schedule + extra repayments + offset + LMI estimate
                                       # + amortisation schedule + inline-SVG donut chart
interest-only-vs-principal-calculator.html # IO vs P&I side-by-side cost comparison
mortgage-stress-calculator.html        # Rate-rise stress test, DSR/TDSR/DTI
rental-yield-calculator.html           # Gross + net rental yield
capital-gains-calculator.html          # CGT with 50% discount + FY2025-26 marginal rates
equity-release-calculator.html         # Home equity release based on LVR
house-flip-calculator.html             # Buy / renovate / sell profit
renovation-cost-calculator.html        # Itemised renovation budget
```

All SEO tools feature:
- **Comprehensive SEO**: Meta tags, keywords, structured data (WebApplication + BreadcrumbList + FAQPage JSON-LD)
- **Shared site-nav**: every tool gets the standard 6-link nav (Calculators / Blog / Gallery / Pricing / About / Support) via `auth-nav.js`
- **Mobile-optimized**: responsive design, `inputmode="decimal"` on currency inputs for the right mobile keyboard, PWA-ready, SW pre-caches all 14 for first-visit offline
- **Accessibility**: `aria-live="polite"` on result containers, `aria-selected` on tabs, WAI-ARIA keyboard nav, `prefers-reduced-motion` respected
- **Input persistence**: inputs snapshot to localStorage so a refresh doesn't lose work
- **Lead generation**: CTAs linking to main app signup
- **Educational**: built-in content sections with explanations
- **Accurate rates**: FY2025-26 Australian government rates (ATO Stage 3 brackets, APRA APS 220 3% buffer, HEM, per-state stamp duty + FHB concessions)
- **Live market data**: RBA cash rate + ABS state median prices via `market-rate.js`
- **Cross-linking**: `related[]` + `footer[]` + `usefulLinks[]` (grouped Other Tools / Popular Suburbs / Guides) on every tool

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
auth-nav.js             # Site-nav renderer (SITE_NAV_LINKS source of truth) + profile menu + help modal (~606 lines)
footer.js               # Site footer (links to /methodology + /data-sources)
error-capture.js        # JS error logging, SUPPRESS list for network noise (~118 lines)
account-panel.js        # Account settings component (~488 lines)
account.js              # Account page logic — subscription, Stripe portal (~612 lines)
legal.js                # Markdown → HTML parser for legal pages
stripe-config.js        # Stripe API key + plan IDs (client-safe)
shared-calcs.js         # Common calc utilities (fmt, parse, repayment, growth) — used by all calculators
market-rate.js          # Live RBA cash rate + ABS state median prices (window.MarketRate)
site-init.js            # Applies dark/light theme before first paint + pre-signup page trail (~21 lines)
adsense.js              # Google AdSense integration
gtag-init.js            # Google Analytics initialization
```

### Page-specific Scripts
```
app-init.js / app-events.js         # Main calculator init + event wiring
onboarding.js                       # First-run guided setup wizard for /app
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
auth.js                 # User auth + admin management (~1480 lines, many actions). Per-email + per-IP signin rate limits.
scenarios.js            # Scenario CRUD (~503 lines). Share action has 20/day/user + 30/hr/IP caps.
stripe.js               # Stripe checkout, portal, webhooks (~643 lines). Idempotent via Redis SET NX, dead-letter list, atomic pipeline writes, 3-day payment-failed grace flag.
contact.js              # Contact form email submission
client-errors.js        # JS error log aggregation
growth.js               # Suburb growth rate cache (30-day TTL)
mapproxy.js             # OpenStreetMap tile proxy
address-suggest.js      # Address autocomplete (rate-limited: 30 req/min)
market-data.js          # Suburb insights market data API (GET is stale-while-revalidate cached by the SW)
blog.js                 # Blog CMS — admin CRUD over Upstash Redis (posts, slug index, tag lists)
reviews.js              # Suburb reviews & star ratings — auth, rate-limited, 3-state moderation queue
comments.js             # Blog post comments — auth, rate-limited, 3-state moderation queue (flat threading)
_log.js                 # Shared structured JSON-logging helper (not a Netlify function handler)
```

### Blog CMS (static-first, Redis-backed)
```
netlify/functions/blog.js         # Admin CRUD: save/publish/unpublish/delete + slug collision check
build/md.js                       # Shared Markdown parser (CommonJS) — mirrors legal.js
build/build-blog.js               # Deploy-time renderer: Redis → static HTML + sitemap-blog.xml + RSS
templates/blog-post.html          # BlogPosting + BreadcrumbList + Person JSON-LD
templates/blog-index.html         # Blog landing + paginated pages
blog.css                          # Layered on legal.css
data/blog-fixture.json            # Offline fixture for local builds (ignored on CDN)
blog/ (generated)                 # /blog/index.html, /blog/<slug>/, /blog/tag/<tag>/, /blog/rss.xml
```

Posts are authored in the admin Blog tab (Markdown editor with autosave + recovery + live word count vs `BLOG_MIN_WORDS` gate — default 1200, AdSense target 1500) → stored in Upstash Redis → rendered to static HTML at deploy time. Public `/blog/` pages are 100% pre-rendered so Googlebot/AdSense crawl complete JSON-LD without hydration. Sub-floor posts still render but are marked `noindex, follow` and are excluded from sitemap/RSS/paged index/section/tag pages.

### Suburb Reviews & Ratings (UGC, moderated)
```
netlify/functions/reviews.js      # Submit/list/admin actions, auth + rate limits (10/hr IP, 3/day user)
build/fetch-reviews.js            # Scans reviews:agg:* → JSON map to stdout (spawned by build-suburbs)
build/build-suburbs.js            # Injects up to 10 approved reviews as static HTML + AggregateRating JSON-LD
suburb-reviews.js                 # Frontend star picker + form hydration + "Show more" pagination
templates/suburb-page.html        # {{REVIEWS_HTML}} + {{AGGREGATE_RATING_JSON}} placeholders
```

Logged-in users post 100+ char reviews with 1–5 star ratings on non-noindexed suburb pages. Reviews enter a pending moderation queue, are approved from the admin **Moderation** tab, and are then injected at build time as static HTML so Google crawls real text (not JS-hydrated content). Empty review sections are never rendered (AdSense negative signal) — the zero state is an absent `<section>`, not a "0 reviews" heading. `AggregateRating` schema.org JSON-LD is emitted only when `count > 0`.

### Blog Comments (UGC, moderated)
```
netlify/functions/comments.js     # Submit/list/admin actions, auth + rate limits (10/hr IP, 5/day user)
build/build-blog.js               # Inline async fetch → injects up to 20 approved comments as static HTML
blog-comments.js                  # Frontend textarea + live counter + "Show more" pagination
templates/blog-post.html          # {{COMMENTS_HTML}} placeholder + login-gated form
blog.css                          # Comments styles (light + dark)
```

Logged-in users post 20–2000 char comments on any blog post. Flat threading (no nested replies in v1). Same pattern as suburb reviews — pending moderation queue, admin approves via the **Moderation** tab (kind switcher), then comments are injected at build time as static HTML. Empty comment sections render as absent `<section>`, never a "0 comments" heading.

### Suburb Insights System (14,512 suburb pages + 19 city pages)
```
fetch-abs-data.js               # Downloads ABS 2021 Census suburb data → data/abs-suburbs.json
generate-suburbs-data.js        # Merges ABS data + postcodes → data/suburbs.json
build-suburbs.js                # Generates suburb pages + city pages + state hubs + sitemap from templates
data/suburbs.json               # 14,512 suburbs with real names, populations, postcodes
templates/suburb-page.html      # Suburb page template (investment score, strategy, risks, outlook)
templates/city-page.html        # City page template (19 major cities, aggregate scores, top suburbs)
templates/state-hub.html        # State hub template (search, progressive loading, city links)
suburb-insights.css             # Shared styles for suburb/city/state pages
suburb/{state}/{slug}/index.html         # Generated suburb pages (gitignored, built on deploy)
invest/{state}/{city-slug}/index.html    # Generated city pages (gitignored, built on deploy)
invest/{state}/index.html                # Generated state hub pages (gitignored, built on deploy)
```

### Configuration
```
netlify.toml            # Netlify build config, CSP headers, cache rules, force-404 redirects for dev files
.netlifyignore          # Files excluded from Netlify CDN (dev docs, build scripts, ERRORS.json, raw data)
manifest.json           # PWA manifest (app name, icons, theme colors)
robots.txt              # Search engine crawling directives
sitemap.xml             # Sitemap index → sitemap-core.xml (~35 URLs) + sitemap-blog.xml + 19 state-grouped sitemap-suburbs-*.xml files (max 1000 per file)
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

### Git Branches + Merge Policy (April 2026 update)
- **`main`** — production. Netlify auto-deploys from here.
- **`Staging`** — legacy staging branch; kept around but no longer the default PR target.
- **`claude/***` — temporary feature branches.
- **PR target** — changes go directly to `main` with immediate squash-merge (the team-approved auto-merge policy). No Staging hop. Exception: payment-flow, schema migrations, or broad refactors still want a human review.
- **`TODO.md`** — source of truth for outstanding work; remove lines when tasks complete.

### Plans & Roles
- **Plans**: `free` | `pro` | `adviser` — stored in localStorage session + Redis user record
- **Roles**: `user` | `admin` — admin role unlocks `admin.html` dashboard
- **Session**: HttpOnly Secure cookie `es_session` (auth token); localStorage key `propCalc_session_v1` = `{id, email, name, plan, role}` (UI state only, no token)

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
8. **Commit & push** — to a `claude/***` feature branch
9. **PR → `main` with squash-merge** — direct to main per current policy. Netlify auto-deploys on merge.
10. **Update docs** — if architecture changes, update `CODEBASE.md` and `README.md`
11. **Update TODO.md** — remove completed tasks, add new ones as discovered

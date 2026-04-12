# CLAUDE.md — Working Notes for Claude Code

## Project Summary
**EquitySight.app** — Australia's smartest property investment calculator. Static HTML/CSS/JS site with Netlify Functions backend. No build step, no framework. Direct git push → auto-deploys to production.

**Australian-focused:** Designed for Australian first home buyers, investors & financial planners. All 8 Australian states, AUD currency, Australian tax/regulatory frameworks (ATO, ASIC, RBA, APRA, state revenue offices).

**24 HTML pages** (incl. 9 free calculators + showcase) + **14,512 generated suburb pages** (~3,022 indexed post-prune) + **19 city pages** + **8 state hub pages** + **human-authored blog** (Redis CMS → static HTML) + **suburb reviews & ratings** (UGC, moderated) | **13 Netlify functions** | **12 CSS files** | **4698+ lines** of calculator logic | **3100+ lines** of admin logic

See **`CODEBASE.md`** for complete architecture, auth model, file map, data flows, and security notes.
See **`README.md`** for feature overview and quick start guide.

## Git Workflow
- **Main branch** — production code, read-only; pull latest tasks from here
- **Staging branch** — pre-production/testing branch
- **Feature branches** — temporary `claude/***` branches (automatically cleaned up after merge)
- **Push targets**: Feature branches go to `claude/***` (with matching session ID), merge/PR to Staging

## Task Tracking
**`TODO.md`** is the source of truth. After completing a task, **remove its line** from the file.
- Urgent tasks marked with `!` at the start of the line
- Sections: General, Desktop, PWA/Mobile
- Never delete section headers

## Error Tracking
**`ERRORS.json`** — auto-synced from the production error log. Every client-side JS error is stored in Redis and auto-pushed to this file via GitHub API (throttled to max once per 5 min). Check this file at the start of each session and fix any listed errors. Admin can also manually sync via "Sync to GitHub" button on the Error Log tab. Requires `GITHUB_TOKEN` env var in Netlify.

## Core Files Reference

### Application Logic
| File | Lines | Key Functions |
|------|-------|----------------|
| `app.js` | 4698 | `recalc()` = master calculation function; `dRecalc()` = debounced wrapper; `showTab(id, btn)` = tab switcher; `exportPDF()` = snapshot export |
| `app-init.js` | — | App page initialization (auth guard, session restore, draft loading) |
| `app-events.js` | — | App page event listener wiring (inputs, buttons, tab switches) |
| `admin.js` | 2894 | `loadUsers()`, `openUserDetails(email)`, `showTab(id, btn)`, `callAuth(action, payload)`, admin dashboard logic |
| `admin-events.js` | — | Admin page event listener wiring |
| `auth-nav.js` | 514 | Injects nav header + profile dropdown + help modal; `window.renderSiteNav()` re-renders after profile changes |
| `account-panel.js` | 483 | Standalone account panel with profile pic upload, color theme selection, plan display |
| `account.js` | 555 | Account page logic — subscription status, plan display, Stripe portal |

### Styling & Injection
| File | Lines | Purpose |
|------|-------|---------|
| `shared.css` | 15K | CSS variables (colors, fonts, radii, shadows), nav, footer, buttons, dark mode, responsive breakpoints |
| `footer.js` | 65 | Renders footer into `#site-footer-root` with branding from localStorage config |
| `error-capture.js` | 67 | Global error handler — POSTs errors to `client-errors` function |
| `site-init.js` | 3 | Applies saved dark/light theme before first paint (synchronous, no defer) |
| `adsense.js` | 35 | Google AdSense integration |
| `gtag-init.js` | 4 | Google Analytics (gtag) initialization |

### Supporting Scripts
| File | Purpose |
|------|---------|
| `stripe-config.js` | Exports `STRIPE_PUBLISHABLE_KEY` and `STRIPE_PRICES` for client use |
| `legal.js` | Markdown → HTML parser for legal pages (frontmatter, TOC, safe links) |
| `shared-calcs.js` | Common calc utilities: `fmtNum()`, `fmt()`, `parseNum()`, `fmtPercent()`, `monthlyRepayment()`, `compoundGrowth()` |
| `market-rate.js` | Loads live RBA cash rate + ABS state median prices; exposes `window.MarketRate` for calculators |
| `index-init.js` / `index-events.js` | Landing page init and event wiring |
| `login.js` | Login/signup page logic |
| `pricing.js` | Pricing page logic |
| `about-init.js` | About page init |
| `contact.js` | Contact page form handling |
| `suburb-insights.js` | Suburb insights page JS |
| `state-hub-search.js` | State hub client-side search by name/postcode |

## Critical Patterns & Conventions

### Security
- **XSS Prevention**: Always use `escHtml()` before inserting user data into HTML
  ```javascript
  div.innerHTML = '<p>' + escHtml(userInput) + '</p>';
  ```
- **Photo URLs**: Validate via `safePhotoSrc()` — only `data:image/*;base64,` or `https://` allowed
- **Admin Actions**: Every admin function verifies `user.role === 'admin'` + bearer token
- **Token Auth**: Bearer token in Authorization header — verified on every backend call
- **Password Hashing**: HMAC-SHA256 with `AUTH_SALT` (required in production)

### Session Management
- **Session Key**: `propCalc_session_v1` in localStorage
- **Session Shape**: `{ id, email, name, plan, token, role, ...subscription fields }`
- **Token TTL**: 30 days (stored in Redis as `token:<token>`)
- **Verification**: `auth.js` action `verify` checks token + user existence (logs out deleted users)
- **Re-render Nav**: Call `window.renderSiteNav()` after session changes

### Feature Gating
- **Pro Check**: `isPro()` — returns true if `session.plan === 'pro'`
- **Admin Check**: `session.role === 'admin'` for admin.html access
- **Plan Types**: `free` | `pro` | `adviser` (stored in session + Redis)

### Calculator Logic
- **Master Function**: `recalc()` in app.js — reads all inputs, computes all outputs
- **Debouncing**: Use `dRecalc()` in oninput handlers (180ms debounce to avoid recalc on every keystroke)
- **Tab System**: `showTab(id, btn)` shows/hides sections, updates button states
- **PDF Export**: `exportPDF()` generates standalone HTML snapshot of current state

### Calculator Architecture (Unified Pattern)
- **9 free calculators** in `/tools/` use identical HTML/CSS structure + `tools.css` (no duplication)
- **Template pattern**: `.tool-header` → `.tool-hero` → `.tool-main` (inputs) → `.tool-result` (outputs) → `.tool-cta` → `.tool-resources` → footer div
- **Shared utilities**: `shared-calcs.js` contains `fmtNum()`, `fmt()`, `parseNum()`, `fmtPercent()`, `monthlyRepayment()`, `compoundGrowth()`, etc.
- **Live market data**: `market-rate.js` provides `window.MarketRate` (RBA cash rate, ABS state medians) — included in calculators that need current rates
- **Injected components**:
  - `auth-nav.js` — injects site nav + profile dropdown (optional for calculators)
  - `footer.js` — injects footer into `#site-footer-root` div
  - `error-capture.js` — global error handler POSTs to `client-errors` function
- **Cost breakdown styling**: `.tool-cost-breakdown` + `.tool-cost-row` for detailed cost displays (used by cost-of-purchase)
- **To update all calculators**: Edit `tools.css` (no need to touch individual HTML files)

### Suburb Insights System (14,512 suburb pages + 19 city pages)
- **Data pipeline**: `fetch-abs-data.js` → `data/abs-suburbs.json` → `generate-suburbs-data.js` → `data/suburbs.json` → `build-suburbs.js` → HTML pages
- **Real data**: Suburb names + populations from ABS 2021 Census (ArcGIS FeatureServer, SAL geography); postcodes from community dataset (`au_postcodes.csv`)
- **Placeholder data**: Income, distance to CBD, suburb type, scores — to be replaced with live data later
- **Build output**: `/suburb/{state}/{slug}/index.html` (14,512 pages) + `/invest/{state}/{city-slug}/index.html` (19 city pages) + `/invest/{state}/index.html` (8 state hubs) + directory index + sitemap
- **Templates**: `templates/suburb-page.html`, `templates/city-page.html`, and `templates/state-hub.html` — use `{{PLACEHOLDER}}` syntax
- **Styling**: `suburb-insights.css` — shared styles for suburb pages, city pages + state hubs
- **SEO**: BreadcrumbList + Place + CollectionPage schema.org JSON-LD, postcodes in titles/meta/keywords, structured data
- **Suburb investment sections**: Each suburb page includes Investment Score (0-100), Best Investment Strategy (Buy & Hold / Rental Yield / Renovation), Risk Factors (3-4 per suburb), and 2026 Outlook — all generated with deterministic phrase variation via `seedHash()`
- **City pages**: 19 major Australian cities (Brisbane, Sydney, Melbourne, Perth, Adelaide, Gold Coast, Newcastle, Canberra, Sunshine Coast, Wollongong, Geelong, Cairns, Townsville, Hobart, Toowoomba, Darwin, Ballarat, Bendigo, Launceston) — grouped by postcode ranges, with aggregate city investment score, strategy, risks, outlook, and top-12 suburbs ranking
- **State hubs**: Progressive loading (100 suburbs initially, "Show more" button) + client-side search by name/postcode + major city navigation cards
- **Performance**: Scripts use `defer` attribute; related suburbs pre-computed (O(n) not O(n²))
- **Build command**: `node build.js` — conditional build wrapper:
  - Normal deploys: restores cached suburb pages (instant, no rebuild)
  - Suburb rebuild: only when triggered by admin "Rebuild Suburb Pages" button (or REBUILD_SUBURBS=true env var)
  - Uses Netlify build cache to persist pages between deploys
- **Admin tab**: Admin → Suburbs — browse/search suburbs, state breakdown, trigger rebuilds via Netlify deploy hook
- **To regenerate data**: `node fetch-abs-data.js` then `node generate-suburbs-data.js`

### Blog CMS (Static-first, Redis-backed)
- **Architecture**: Posts are authored in the admin UI → stored in Upstash Redis → rendered to static HTML at build time via `build/build-blog.js`. Public pages under `/blog/` are 100% static for Googlebot/AdSense.
- **Why static**: AdSense/Google crawl pre-rendered HTML with full JSON-LD (`BlogPosting` + `BreadcrumbList` + `Person`) — no hydration required.
- **Shared markdown parser**: `build/md.js` (CommonJS) mirrors `legal.js` rendering exactly, so browser and Node emit byte-identical HTML from the same Markdown source. Build-only helpers: `excerpt()`, `wordCount()`.
- **Redis key schema**:
  - `blog:post:<id>` — full post JSON
  - `blog:slug:<slug>` — id (unique index for collision check)
  - `blog:index` — LIST of all post IDs
  - `blog:published` — LIST of published IDs (newest first)
  - `blog:tag:<tag>` — LIST of post IDs per tag
- **Post schema**: `{id, slug, title, excerpt, body_md, author, author_bio, author_email, cover_image, tags[], status: 'draft'|'published', created_at, updated_at, published_at, comment_count}`
- **Admin actions** (`netlify/functions/blog.js`, all admin-only): `adminListPosts`, `adminGetPost`, `adminSavePost` (slug collision check, tag index diff), `adminPublish`, `adminUnpublish`, `adminDeletePost`.
- **Build output**: `/blog/index.html`, `/blog/page/<N>/index.html` (paged 12/page), `/blog/<slug>/index.html`, `/blog/tag/<tag>/index.html`, `/blog/rss.xml`, `sitemap-blog.xml`.
- **Templates**: `templates/blog-post.html` (BlogPosting JSON-LD, author bio, 3 related posts by tag overlap) and `templates/blog-index.html`. Styled via `blog.css` layered on `legal.css`.
- **AdSense quality gate**: Admin editor shows live word count + remaining-to-1,500-floor so every authored post clears Google's E-E-A-T quality threshold. Target: 20+ posts at 1,500–3,000 words before AdSense resubmission.
- **Offline builds**: Missing `UPSTASH_REDIS_REST_URL` falls back to `BLOG_FIXTURE` JSON file (see `data/blog-fixture.json`) and ultimately to an empty index — build never fails.
- **Admin tab**: Admin → Blog — list/search posts, create/edit/delete, live Markdown word count, draft/publish toggle. `callBlog(action, payload)` helper in admin.js.
- **Build integration**: `build.js` calls `buildBlog()` after suburb restore/build. Sitemap index (`sitemap.xml`) references `sitemap-blog.xml` alongside suburb sitemaps.

### Layout & Responsive
- **Mobile Breakpoint**: `@media(max-width:600px)` for PWA/mobile
- **PWA Styles**: `@media(display-mode:standalone)` to hide/show elements in standalone mode (no JS needed)
- **Admin Layout**: Hides `.site-nav-links` + `.nav-hamburger` but keeps profile icon via `grid-column:3`
- **Sticky Header**: Nav is `position:sticky; top:0` with backdrop filter
- **Profile Dropdown**: Uses `position:fixed` to escape `backdrop-filter` stacking context
- **Tool layout**: `.tool-main` max-width 640px, centered, with consistent card + result patterns

### Data Flow
- **Frontend**: HTML → auth-nav.js/footer.js inject nav/footer → app.js/admin.js handle interactions
- **Backend**: POST to `/.netlify/functions/{name}` with JSON body + Authorization header
- **Storage**: Redis for user data (auth.js), scenarios (scenarios.js), errors (client-errors.js), growth (growth.js)
- **Cache**: localStorage for session, draft state, profile preferences, site config

## Dev Workflow
1. **Edit** files directly (no build step, no bundler)
2. **Test** in browser — check desktop (1200px) + mobile (600px breakpoint)
3. **Test browsers** — Chrome, Firefox (stricter about JS syntax), Safari (test notch styles)
4. **Validate** — no new external APIs without updating CSP in `netlify.toml`
5. **Security** — if adding a new dev/build/data file, add it to `.netlifyignore` (see Deployment Security under Known Gotchas)
6. **Commit** — clear commit message with why (not just what)
7. **Push** — to assigned feature branch (e.g., `claude/feature-abc-KVfMN`)
8. **PR/Merge** — to Staging for staging deploy, then to main for production

## Known Gotchas & Pitfalls

### CSP & External APIs
- **CSP in netlify.toml** — if adding new external API (Stripe, Nominatim, IP geo), update `connect-src` policy
- **Stripe JS** — loaded from Stripe CDN (allowed via CSP); check for CSP violations if checkout breaks

### Admin Pages
- **Nav Layout** — admin.css hides `.site-nav-links` + `.nav-hamburger` but keeps profile icon
- **Grid Column** — profile button stays via `grid-column:3` on admin pages
- **Profile Dropdown** — uses `position:fixed` to avoid being clipped by nav's `backdrop-filter` stacking context

### Browser Compatibility
- **Firefox** — stricter about invalid escape sequences in JS strings; test there
- **Safari** — check `env(safe-area-inset-*)` for notch devices; backdrop-filter support varies
- **Dark Mode** — toggle via `toggleTheme()`, persisted in localStorage `equitySight_theme`

### Common Mistakes
- ❌ Inserting user data without `escHtml()` → XSS vulnerability
- ❌ Using `innerHTML` with photo URLs without `safePhotoSrc()` → XSS or broken images
- ❌ Calling `recalc()` in oninput directly (not `dRecalc()`) → performance issues on rapid input
- ❌ Forgetting auth guard in `<head>` on authenticated pages → logged-out users see content briefly
- ❌ Changing `@media` breakpoint without checking mobile layout → layout breaks on PWA
- ❌ Adding external API without CSP update → network requests blocked by browser
- ❌ Adding a new dev/internal file without updating `.netlifyignore` → file is publicly accessible on production (see Deployment Security below)

### Deployment Security
`publish = "."` means Netlify serves the **entire repo root**. Every file in the repo is a potential public URL unless explicitly blocked.

**Two-layer defence:**
1. **`.netlifyignore`** (primary) — listed files are never uploaded to Netlify CDN at all
2. **`netlify.toml` force redirects** (safety net) — `force = true` redirects return 404 even if a file exists on CDN

**Rule: When adding any new dev/internal file, add it to `.netlifyignore` immediately.**

Files intentionally NOT blocked (needed at runtime):
- `privacy.md`, `terms.md`, `cookies.md`, `disclaimer.md` — fetched by `legal.js` to render legal pages

## Australian Geo-Targeting & SEO (March 2026)

### All 9 Calculators Now Australian-Optimized
- ✅ All titles include "Australian" for geo-targeting (e.g., "Australian Rental Yield Calculator")
- ✅ All meta descriptions emphasize Australian focus + no signup messaging
- ✅ Social sharing tags (og:image, twitter:image) added to all calculators
- ✅ Free calculator suite linked on landing page tools grid (responsive 2-col desktop, 1-col mobile)
- ✅ Government resources sections on all calculators (ATO, ASIC, RBA, APRA, state revenue offices)
- ✅ Social share buttons (Facebook, Twitter, LinkedIn) on key calculators
- ✅ Related calculator cross-links encourage exploration & reduce bounce rate
- ✅ Sitemap.xml updated with all calculator URLs + proper priorities

### For Google Search Console Setup
- Submit sitemap.xml: https://search.google.com/search-console
- Set target country to Australia in GSC settings
- Monitor search traffic by country & CTR from Australian searches

## Recent Changes (April 2026 — AdSense Content Substance Push)
- ✅ **Phase 1 — Aggressive prune** — multi-factor `shouldNoindex()` gate in `build/build-suburbs.js` reduces indexed suburb pages from 14,512 → ~3,022 (population ≥2,000 + postcode + median income present). Sitemap respects the gate; noindexed slugs still reachable via `<details>` drawer on state hubs for link equity.
- ✅ **Phase 2 — Formula-driven suburb prose** — replaced `pick(seed, [variants])` templating in `generateInsight`/`generateStrategy`/`generateRisks`/`generateOutlook` with if/else branches over real numeric ratios (gross yield, affordability, rent-to-income, dwelling mix, CBD-distance band). Added `numericProse()`, `generateComparisonTable()` (vs state medians), `generateInvestorChecklist()` (8 bullets), expanded FAQ (4→8). New `{{COMPARE_HTML}}`, `{{CHECKLIST_HTML}}`, `{{METHODOLOGY_HTML}}` placeholders in `templates/suburb-page.html`. New `methodology.md` / `methodology.html` + `data-sources.md` / `data-sources.html` E-E-A-T pages authored at ~1,200 words each.
- ✅ **Phase 3 — Human-authored blog CMS** — admin authors posts in Redis via the new Blog tab; `build/build-blog.js` renders to static HTML at deploy time. New `netlify/functions/blog.js` (admin CRUD + slug collision check + tag index maintenance), `build/md.js` (shared Markdown parser), `templates/blog-post.html` + `templates/blog-index.html` (BlogPosting + BreadcrumbList + Person JSON-LD), `blog.css`, `sitemap-blog.xml`, `/blog/rss.xml`. Editor shows live word count vs AdSense 1,500-word floor. Build-blog falls back to `BLOG_FIXTURE` JSON when Upstash env vars absent.
- ✅ **Phase 4 — Suburb reviews & star ratings (UGC)** — logged-in users post 100+ char reviews with 1–5 star ratings on non-noindexed suburb pages. New `netlify/functions/reviews.js` (submit/list/admin actions with auth + per-IP 10/hr and per-user 3/day rate limits, `escHtml()` on write, 3-state moderation: pending/approved/rejected, atomic `HINCRBY` on `{count,sum}` aggregate). New `build/fetch-reviews.js` — spawned via `execSync` from `build-suburbs.js` to keep the build sync; SCANs `reviews:agg:*` and prints a JSON map of approved reviews to stdout. `build-suburbs.js` injects up to 10 approved reviews as **static HTML** and writes `AggregateRating` JSON-LD into the schema.org array — **only when `count > 0`** so empty review shells never appear (AdSense negative signal). New `suburb-reviews.js` frontend — star picker, live char counter, submit form, "Show more" pagination. New `{{REVIEWS_HTML}}` + `{{AGGREGATE_RATING_JSON}}` placeholders in `templates/suburb-page.html`. New Admin → **Moderation** tab (16 admin tabs total now) with Pending/All sub-tabs and approve/reject/delete actions. Styles in `suburb-insights.css` (light + dark).

## Recent Changes (March 2026)
- ✅ Deleted user logout — `verify` action now checks user existence
- ✅ Admin auth hardened — verify action never falls back to localStorage role; access denied if token check fails
- ✅ Admin user login status — popup shows "Active", "Email Verified", or "Awaiting Verification"
- ✅ Header styling — increased bar height & button padding for mobile readability
- ✅ Australian geo-targeting — all calculator titles, descriptions, and resources emphasize Australia focus
- ✅ **14,512 suburb insight pages** generated from real ABS 2021 Census data (population + postcodes)
- ✅ **8 state hub pages** with search and progressive loading (100 suburbs at a time)
- ✅ **Schema.org structured data** — BreadcrumbList + Place + CollectionPage on all suburb/state pages
- ✅ **Postcodes** in page titles, meta descriptions, keywords, and schema.org for SEO
- ✅ **Build optimization** — defer scripts, pre-computed related suburbs (O(n) build), .gitignore cleanup
- ✅ Sitemap split: `sitemap-core.xml` (70 URLs) + 19 state-grouped `sitemap-suburbs-{state}.xml` files (max 1000 URLs each, 14,539 URLs total) indexed by `sitemap.xml`
- ✅ **Security: blocked dev files from public CDN** — `.netlifyignore` prevents CLAUDE.md, README.md, CODEBASE.md, TODO.md, ERRORS.json, build scripts, and raw data files from being uploaded; `netlify.toml` force-404 redirects act as secondary safety net
- ✅ **Admin Config tab split** into Settings, Features, Integrations, Branding (14 admin tabs total now)
- ✅ **Admin new tabs** — About Page, Legal Pages, Suburbs added to admin dashboard
- ✅ **showcase.html** — app gallery/showcase page with real mobile screenshots (light + dark)
- ✅ **Australian mortgage intelligence** — LVR badge, auto stamp duty estimate, LMI calc, FHOG display
- ✅ **Fortnightly repayment benefit** shown in Repayments tab
- ✅ **Offset account** factored into 30-year projection
- ✅ **Scenario improvements** — photo preserved on save/restore, saved count badge fixed
- ✅ **PWA button fixes** — removed touchend preventDefault that was blocking click events on iOS
- ✅ **Mobile scroll fixes** — sidebar, settle date, amortisation table no longer cause horizontal scroll
- ✅ **CSP inline handler fixes** — moved inline event handlers to JS to fix script-src-attr violations
- ✅ **Dark/light mode** — system-wide fix across app, admin, and account panel
- ✅ **Google Sign-In** added to login page
- ✅ **Google AdSense** integrated via `adsense.js`
- ✅ **market-rate.js** — live RBA cash rate + ABS state median prices for calculator pages
- ✅ **shared-calcs.js** — common utility functions extracted for reuse across all calculators
- ✅ **JS refactor** — page logic split into init + events files (app-init, app-events, admin-events, etc.)
- ✅ **address-suggest** Netlify function added (rate-limited, 30 req/min)
- ✅ **market-data** Netlify function added for suburb insights market data
- ✅ **lvrColor / st bug fixes** — ReferenceErrors in app.js and admin.js causing recalc crashes on iOS
- ✅ **Suburb investment sections** — Investment Score (0-100), Best Investment Strategy, Risk Factors, and 2026 Outlook added to all 14,512 suburb pages with deterministic phrase variation
- ✅ **19 city investment pages** — Major Australian cities (Brisbane, Sydney, Melbourne, Perth, Adelaide, Gold Coast, etc.) with aggregate investment scores, strategy, risks, outlook, and top-12 suburb rankings at `/invest/{state}/{city-slug}/`
- ✅ **State hub city navigation** — state hub pages now show major city cards linking to city investment pages

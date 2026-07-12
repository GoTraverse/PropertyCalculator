# CLAUDE.md — Working Notes for Claude Code

## Project Summary
**EquitySight.app** — Australian property finance calculators + suburb data, built on verified government sources. Static HTML/CSS/JS site with Netlify Functions backend. No build step, no framework. Direct git push → auto-deploys to production. North star: **value a chatbot/Google/a pro-without-a-tool can't give** — verified-current rates, real sourced data, persistent scenarios (roadmap in TODO.md "PRODUCT ROADMAP" + Claude's memory project-product-roadmap).

**Australian-focused:** Designed for Australian first home buyers, investors & financial planners. All 8 Australian states, AUD currency, Australian tax/regulatory frameworks (ATO, ASIC, RBA, APRA, state revenue offices).

**~36 core HTML pages** (17 root + 18 free calculators + `/tools` landing) + **`/journey` flagship** (guided first-home journey — see section below) + **8 state-specific stamp duty pages** (generated) + **14,512 generated suburb pages** (**1,475 indexed** — real-data gate: pop ≥ 2,000 + a genuine suburb-geo CC BY 4.0 current rent/price figure; QLD 583 / VIC 516 / SA 293 / TAS 83; NSW/WA/ACT/NT 0 pending suburb-level data) + **19 city pages** + **8 state hub pages** + **human-authored blog** (Redis CMS → static HTML) + **suburb reviews & ratings** (UGC, moderated) + **blog comments** (UGC, moderated) | **15 Netlify functions** (`auth`, `scenarios`, `stripe`, `contact`, `client-errors`, `growth`, `mapproxy`, `address-suggest`, `market-data`, `blog`, `reviews`, `comments`, `seo-metrics` [MCP-facing, not web-app], `share-view`, `journey` [journey sync + share/collab + admin visibility]) + `_log.js` structured-log helper (plus a leftover `db-health.js` Phase-0 spike with no caller) | **13 CSS files** | **5000+ lines** of calculator logic (`app.js`) | **3800+ lines** of admin logic (`admin.js`) | regression tests in `tests/stamp-duty-test.js`

**Current market data (Jul 2026):** suburb pages + newest tools carry REAL, CURRENT, CC BY 4.0 state-government data — `data/market-current.json` (suburb pages, folded in by `build/merge-market-current.js`) + `tools/market-medians.json` (tool pages) — QLD/SA/TAS suburb rents, VIC/SA-metro sale medians (+12-month trends), NSW postcode rents. Every figure captioned "as at [period], [source]". Pre-extracted + hand-verified quarterly (recipe in Claude's memory: project-suburb-data-architecture). Rules: strict-period only (drop suppressed suburbs — never mislabel an older quarter as current); 2021 Census figures are a clearly-dated fallback, never presented as current.

See **`CODEBASE.md`** for complete architecture, auth model, file map, data flows, and security notes.
See **`README.md`** for feature overview and quick start guide.

## Git Workflow (current policy)
- **Main branch** — production. Netlify auto-deploys from here.
- **Staging branch** — exists but no longer the default PR target; kept around for the previous Staging deploy preview URL.
- **Feature branches** — temporary `claude/***` branches.
- **PR target** — **open PRs directly to `main` and squash-merge immediately** (user-granted auto-merge policy, April 2026). No Staging intermediary, no waiting for review, no required CI gates.
- **Exception** — if a change is genuinely risky (schema migration, payment-flow refactor, broad refactor that can't be rolled back with a single revert), ask the user before auto-merging. Default is merge.
- **Never push directly to `main`**; always via a PR + `mcp__github__merge_pull_request` even when self-merging. This preserves a clean PR audit trail.

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
| `app.js` | 5007 | `recalc()` = master calculation function; `dRecalc()` = debounced wrapper; `showTab(id, btn)` = tab switcher; `exportPDF()` = snapshot export |
| `app-init.js` | — | App page initialization (auth guard, session restore, draft loading) |
| `app-events.js` | — | App page event listener wiring (inputs, buttons, tab switches, WAI-ARIA arrow-key tab nav) |
| `onboarding.js` | — | First-run guided setup wizard for `/app` — `shouldShow()` gate, `build()`/`render()` stepper, `finish()` populates `#inp-*` + `deriveDeposit()` sizes deposit to savings → Costs tab. Supersedes the welcome splash; runs for guests + freshly signed-in users. Fires `onboarding_shown/_step/_skipped/_completed` via `trackGuest`. |
| `admin.js` | 3816 | `loadUsers()`, `openUserDetails(email)`, `showAdminTab()`, `callAuth(action, payload)`, admin dashboard logic |
| `admin-events.js` | — | Admin page event listener wiring + WAI-ARIA arrow-key tab nav |
| `auth-nav.js` | 606 | Source of truth for the site nav link set (`SITE_NAV_LINKS`) — renders `<ul class="site-nav-links">` on every page + profile dropdown + help modal. `window.renderSiteNav()` re-renders after profile changes. |
| `account-panel.js` | 488 | Standalone account panel with profile pic upload, color theme selection, plan display |
| `account.js` | 612 | Account page logic — subscription status, plan display, Stripe portal |

### Styling & Injection
| File | Lines | Purpose |
|------|-------|---------|
| `shared.css` | ~540 | CSS variables, nav, footer, buttons, dark mode, responsive breakpoints, `prefers-reduced-motion` overrides |
| `footer.js` | 60 | Renders footer into `#site-footer-root`. Footer link set includes `/methodology` + `/data-sources` authority pages. |
| `error-capture.js` | 118 | Global error handler — POSTs errors to `client-errors` function. SUPPRESS list for network noise + third-party `@context` parser errors. |
| `site-init.js` | 21 | Dark-mode theme application + pre-signup page-trail recording (loaded with `defer`) |
| `adsense.js` | 35 | Google AdSense integration |
| `gtag-init.js` | 4 | Google Analytics (gtag) initialization |

### Supporting Scripts
| File | Purpose |
|------|---------|
| `stripe-config.js` | Exports `STRIPE_PUBLISHABLE_KEY` and `STRIPE_PRICES` for client use |
| `legal.js` | Markdown → HTML parser for legal pages (frontmatter, TOC, safe links) |
| `tools/tool-page.js` | Shared calculator engine (init, input persistence, scroll-to-result) + the calc utilities (`fmtNum()`, `parseNum()`, `monthlyRepayment()`, etc.) that the tool pages actually load. (The old `shared-calcs.js` was unused and was deleted.) |
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
- **Admin Actions**: Every admin function verifies `user.role === 'admin'` via session cookie
- **Session Auth**: HttpOnly Secure cookie (`es_session`) — set on login, cleared on signout; token never exposed to client JS
- **Password Hashing**: HMAC-SHA256 with `AUTH_SALT` (required in production)

### Session Management
- **Session Key**: `propCalc_session_v1` in localStorage (UI state only — no token)
- **Session Shape**: `{ id, email, name, plan, role, ...subscription fields }`
- **Auth Cookie**: `es_session` — HttpOnly, Secure, SameSite=Lax, 30-day TTL
- **Token TTL**: 30 days (stored in Redis as `token:<token>`, transmitted only via cookie)
- **Login Guard**: `isLoggedIn()` checks `session.id` (not token) on client side
- **Verification**: `auth.js` action `verify` reads token from cookie, checks user existence (logs out deleted users)
- **Re-render Nav**: Call `window.renderSiteNav()` after session changes

### Feature Gating
- **Pro Check**: `isPro()` (in `app.js`) — returns true if `plan === 'pro' || plan === 'adviser'`. `adviser` is a superset of `pro`.
- **Admin Check**: `session.role === 'admin'` for admin.html access
- **Plan Types**: `free` | `pro` | `adviser` (stored in session + Redis user record)

### Calculator Logic
- **Master Function**: `recalc()` in app.js — reads all inputs, computes all outputs
- **Debouncing**: Use `dRecalc()` in oninput handlers (180ms debounce to avoid recalc on every keystroke)
- **Tab System**: `showTab(id, btn)` shows/hides sections, updates button states
- **PDF Export**: `exportPDF()` generates standalone HTML snapshot of current state

### Calculator Architecture (Unified Pattern)
- **18 free calculators** in `/tools/` plus `/tools/index.html` landing page that groups them (Buying / Borrowing / Investment). All share identical HTML/CSS structure via `tools.css` (no duplication).
- **Template pattern**: `<nav class="site-nav">` (full site nav) → `.tool-hero` → `.tool-main` (inputs) → `.tool-result` (aria-live polite) → `.tool-cta` → `.tool-resources` → footer div
- **Currency inputs** use `type="text" inputmode="decimal"` with `fmtInput()` thousands-separator formatting. Pure numeric inputs (rate, term) use `type="number"`.
- **Shared utilities**: `tools/tool-page.js` provides the shared calc helpers (`fmtNum()`, `parseNum()`, `monthlyRepayment()`, etc.) loaded by every tool page (`shared-calcs.js` was removed — it was dead code).
- **Live market data**: `market-rate.js` provides `window.MarketRate` (RBA cash rate, ABS state medians) — included in calculators that need current rates
- **Input persistence**: `tool-page.js _installInputPersistence()` snapshots every input/select to `localStorage['tool_inputs_v1:<slug>']` on change (250ms debounce) and restores on load — refresh doesn't lose work.
- **Scroll-to-result**: `tool-page.js _installScrollToResult()` smooth-scrolls the result container into view 60ms after a Calculate click. Respects `prefers-reduced-motion`.
- **Injected components** (standard across all 18 tool pages):
  - `auth-nav.js` — injects full site-nav link list (`SITE_NAV_LINKS`) + auth controls
  - `footer.js` — injects footer into `#site-footer-root` div
  - `error-capture.js` — global error handler POSTs to `client-errors` function
- **Cross-linking**: Each tool config has `related[]` (4-card grid), `footer[]` (small link row), and `usefulLinks[]` (grouped sidebar: Other Tools / Popular Suburbs / Guides). Every tool links to `/tools` from its footer.
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

### The First Home Journey (flagship, /journey — Jul 2026)
- **The product**: 7 guided stops (bearings wizard → scheme projector → budget
  wizard w/ committed walk-away cap → suburb suggester → places library →
  deal-deadline tracker → settlement). Homepage, nav, footer, manifest
  start_url and the 19 buyer-tool CTAs all route here; 7 investor tools keep
  /app. Full spec + build log: `PRODUCT_JOURNEY.md` (internal, blocked from CDN).
- **Files**: `journey.html` / `journey.js` / `journey.css` +
  `journey-suburbs.json` (generated — regenerate with
  `node build/make-journey-suburbs.js` after each quarterly market-data
  refresh) + `netlify/functions/journey.js`.
- **State**: localStorage `propCalc_journey_v1`, guest-first. EVERY state
  entering the page (localStorage, server pull, share view, collab join) must
  pass `normalizeState()` — older persisted states lack newer fields and
  crash renderers otherwise. Transient flags (`budget.editing`,
  `deal.editing`) are purged there; never persist UI flags.
- **Sync/share**: logged-in users debounce-sync to Redis `journey:<email>`;
  share tokens `journey:share:<token>` (view = read-only for anyone, edit =
  a signed-in partner writes the OWNER's record, last-write-wins).
  login.js `safeNextUrl` explicitly allows `journey` and
  `journey?join=<token>` — don't break that allowlist.
- **Admin → Journeys tab**: list + read-only detail + delete (delete also
  revokes the user's share tokens).
- **⚠ SYNC COPIES**: journey.js embeds the duty engine (from
  tools/stamp-duty-calculator.js) and scheme caps (from
  first-home-buyer-grants-calculator.js). `node tests/duty-sync-test.js`
  asserts the three duty copies agree — run it after ANY duty change.
- **Verification**: `tests/journey-browser-harness.html` (dev-only) seeds a
  rich journey and drives any view for headless-Chrome screenshots — use it
  before merging journey UI changes (a CSS [hidden] conflict once shipped a
  page-blocking overlay that DOM-stub tests can't catch). Lighthouse (local):
  bin/lighthouse-local.sh /journey — currently 100/100/·/100, CLS 0.
- **SW rule**: bump the service-worker version whenever journey assets change
  (they're pre-cached since v30).

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
- **AdSense word-count gate (in the build, not just UI)**: `build/build-blog.js` defaults to `BLOG_MIN_WORDS=1200` (overridable via env). Posts below the floor still render (direct URLs work) but get `<meta robots="noindex, follow">` and are excluded from sitemap, RSS, paged index, section + tag pages. Raise to 1500 once borderline posts are expanded — per-post briefs are in `TODO.md`. Admin editor shows live word count vs the floor.
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
- **Backend**: POST to `/.netlify/functions/{name}` with JSON body; auth via HttpOnly `es_session` cookie (automatic)
- **Storage**: Redis for user data (auth.js), scenarios (scenarios.js), errors (client-errors.js), growth (growth.js)
- **Cache**: localStorage for session, draft state, profile preferences, site config

## Dev Workflow
1. **Edit** files directly (no build step, no bundler)
2. **Test** in browser — check desktop (1200px) + mobile (600px breakpoint)
3. **Test browsers** — Chrome, Firefox (stricter about JS syntax), Safari (test notch styles)
4. **Validate** — no new external APIs without updating CSP in `netlify.toml`
5. **Security** — if adding a new dev/build/data file, add it to `.netlifyignore` (see Deployment Security under Known Gotchas)
6. **Commit** — clear commit message with why (not just what)
7. **Push** — to a `claude/***` feature branch
8. **PR → `main` + squash-merge immediately** — direct to main, no Staging hop, no review gate. Netlify auto-deploys to production on merge. Use `mcp__github__merge_pull_request` with `merge_method: 'squash'` right after opening the PR. Exception: ask the user first for payment-flow, schema, or broad refactor changes.

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
- ❌ "Normalising" the `/tools/` canonical to the no-slash `/tools` → canonical→301→canonical loop, GSC "Redirect error", hub deindexed. `/tools` is a **directory index** (Netlify 301s `/tools` → `/tools/`), unlike `/pricing` etc. which are files. Canonical, hreflang, og:url, JSON-LD url and the `sitemap-core.xml` entry must ALL use `/tools/` **with** the trailing slash. Already regressed once (fixed #264 → broken #297 → re-fixed #310) — see the warning comment in `tools/index.html`.

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

## Recent Changes (Jul 2026 — Real-data pivot + 4 new calculators, PRs #335–#348)

The "beat a chatbot" roadmap sprint (S/A/B-tier bets in TODO.md "PRODUCT ROADMAP"; strategy
+ status in Claude's memory: project-product-roadmap). Prompted by Whirlpool "AI slop /
nothing Claude couldn't do natively" criticism. Highlights:

- **Real current market data** replaced the 5-year-old-Census / placeholder problem: free
  CC BY 4.0 state-gov datasets (QLD RTA rents Mar-2026, SA CBS rents + Valuer-General sale
  medians Q1-2026, VIC VGV house/unit sale medians 2025-prelim, TAS DoJ bond-derived rents,
  NSW DCJ postcode rents) pre-extracted by hand, verified, committed as
  `data/market-current.json` + `tools/market-medians.json` (with 12-month trend fields).
  Suburb pages render them with honest "as at" captions; 2021 Census = dated fallback.
- **Re-index**: `shouldNoindex()` in build-suburbs.js flipped from always-true to a
  real-data gate (pop ≥ 2,000 + suburb-geo CC-licensed current figure) → **1,475 indexed
  suburb pages**. Fabricated Investment Score + school/park counts REMOVED; real ABS
  income restored in Key Indicators; NSW PO-box postcodes fixed (Parramatta 1740 → 2150).
- **4 new calculators** (18 total): `/tools/listing-price-checker` (asking price vs real
  gov medians, verdict bands, yield mode for rent-only states, 12-month trends, linked
  sources), `/tools/auction-budget-calculator` (walk-away price solver + printable
  auction-day plan; **its stamp-duty tables are a SYNC copy of stamp-duty-calculator.js —
  update BOTH together**), `/tools/land-tax-calculator` (all 8 jurisdictions,
  adversarially verified Jul 2026 — schedules + refresh cycle in Claude's memory
  project-land-tax-verified), `/tools/property-cashflow-calculator` (exact FY2026-27
  negative gearing incl. the new 15% band, suburb-median rent prefill, land-tax link).
- **Auto-state**: `detectAUState()` in tool-page.js (IANA timezone → state) pre-selects
  the visitor's state on tools that declare `stateSelectId` in their config; a returning
  user's saved input always wins.
- Homepage title/desc trimmed to SERP limits (#336); mobile `.tool-cost-row` wrap +
  `.tool-field-hint` added to tools.css; SW at v22.
- **Data-honesty rules (bake into future work)**: strict-period only — if the source
  suppresses the latest period for a suburb, DROP it, never backfill with an older
  quarter labelled as current; suppress thin-volume trends (e.g. SA sale-price change
  hidden unless ≥10 sales in both quarters); postcode-geo figures are labelled "postcode"
  and never count as suburb-level data for indexing.

## Recent Changes (Jul 2026 — First-run onboarding wizard + first-view fixes, PR #308)

Follows guest-mode PR A. A new first-run experience for `/app` plus a review of the
guest vs signed-in first-view (live walkthrough + multi-agent code-path audit).

- **Guided onboarding wizard** — new `onboarding.js` (+ `#ob-overlay` styles in `app.css`,
  script tag in `app.html`). A blurred-backdrop stepper (welcome → state → first-home-buyer →
  price → savings → income → loan) that replaces the old blank `$0` form. On finish it
  populates the `#inp-*` fields by dispatching the same input/change events the UI fires
  (so `recalc()` runs identically), sizes the **deposit %** to the user's savings
  (`deriveDeposit()`: deposit = savings − upfront costs, read back from the app's own
  `cr-deposit`/`cb-remaining` so it respects state/FHB/scheme), then reveals the Costs tab
  with a coherent, personalised result. `shouldShow()` gates to genuine first-run (skips if
  onboarded before, splash already seen, a draft/scenario in progress, or a price loaded).
  **Runs for guests AND freshly signed-in users** (no login gate — owner decision).
- **Splash/wizard collision fixed (was HIGH).** The legacy welcome splash (z-index 8000)
  rendered on top of the wizard (was 4000) on every first run. `onboarding.js` now removes
  `#welcome-splash` outright on first run (so `showWelcomeSplash()` no-ops), `#ob-overlay`
  z-index → 9000, and `showWelcomeSplash()` re-checks `propCalc_splash_seen` at fire time.
- **Guest Save funnel fixed (was HIGH).** `saveScenario()` now runs the guest gate
  (`requireAccount`) BEFORE the address guard, so a wizard-onboarded guest (no address yet)
  gets the "create a free account" prompt instead of being bounced to the Property tab. The
  migration auto-save already guards on address, so an address-free scenario just won't
  auto-save post-signup (no bounce).
- **Wizard analytics** — `onboarding_shown/_step/_skipped/_completed` via `window.trackGuest`
  (the first-run funnel was previously invisible). **Value-moment CTA** — a guest gets the
  soft signup banner (`maybeShowGuestBanner`) at the Costs payoff (self-gated, so signed-in
  users never see it).
- **Hardening** — `deriveDeposit()` is event-driven (polls `cb-savings` until recalc has
  applied the inputs) instead of a fixed 280ms sleep; maintenance mode tears down any
  first-run surface. `service-worker.js` → v8 (pre-caches `/onboarding.js`).
- Verified CORRECT during the audit (no change): guest mode, auth guards, guest-only
  badge/banner suppression for signed-in users, and the signup-migration plumbing.

## Recent Changes (Jun 2026 — Honesty / E-E-A-T remediation)

A site-wide pass to remove fabricated/misleading content that Google's helpful-content
+ E-E-A-T systems penalise (it was the real cause of the calculators being "Crawled –
currently not indexed" and the AdSense "Low value content" rejection).

- **Fabricated identities removed.** `about.html`'s invented three-person "team" (Alex
  Chen / Sarah Williams / James Patel, fake degrees, a fake "Certified Practising
  Valuer", fake @equitysight.app emails) is gone — replaced with an honest solo-founder
  section (Jacoby; real first-home-buyer origin story; no invented credentials). The same
  fake personas were also bylined on blog posts with `Person` JSON-LD: all blog posts +
  `data/blog-fixture.json` now attribute to the **EquitySight Organization**, and
  `build/build-blog.js` + `templates/blog-post.html` emit an Organization node (no `Person`
  bio) unless a genuine bio exists. `blog-editor.html` placeholder hints de-faked.
- **Fabricated suburb data no longer presented as ABS fact.** `data/suburbs.json`'s
  `median_household_income` is a name-seeded placeholder (not ABS); transport/amenity
  scores are pseudo-random; school/park counts are population ratios; rent/mortgage/
  distance/lat-lng are unpopulated. Fixes: `shouldNoindex()` now noindexes **every** suburb
  page (placeholder data must not be indexed); the income figure is shown as `N/A`; the
  per-page "How we built this profile" block now states plainly that only population +
  postcode are real and the rest are estimates. State medians use a population threshold
  directly (decoupled from the now-always-true gate).
- **Provenance pages rewritten honestly.** `methodology.md` + `data-sources.md` no longer
  claim "every number from the ABS … no estimation" / "no AI writes our prose" / OSM
  amenity sourcing. They now state which fields are real (population, postcode, RBA cash
  rate) vs estimate/placeholder, disclose that the written calculator guides are
  AI-assisted + human-reviewed, and drop the public change-log + noindex-strategy sections.
  `build/build-legal.js` duplicate-render bug (each legal page rendered twice) fixed.
- **Marketing overclaims fixed.** Dropped the "Australia's smartest …" superlative (meta +
  JSON-LD across index/about/showcase + emails/export), removed pricing's unsupported "Most
  popular" badge, and corrected inflated "14,512 suburb profiles / for every suburb /
  amenity scores / Real ABS Census data for every suburb" coverage claims.
- **Calculator content depth.** The 11 thinnest calculator pages were expanded from
  ~95–535 words to ~1,000+ words of unique, Australian-specific content (formula + worked
  example + FAQ + scope note), drafted with AI and then **adversarially fact-checked**
  (formulas/arithmetic recomputed; time-sensitive figures framed as illustrative; a couple
  of figures corrected, e.g. a deposit-page LMI overstatement + QLD FHB stamp-duty example).
- **Net:** suburb pages are intentionally noindexed pending real ABS data; the indexable,
  honest surface is now the calculators + homepage + (de-faked) blog.

## Recent Changes (Jun 2026 — Guest mode on /app, PR A)

Removes the `/app` login wall (the #1 signup leak per `APP_AUDIT.md`) so logged-out
visitors use the full calculator as **guests**, with signup prompts at the value moment.
PR A = guest core; **PR B (scenario templates, HANDOFF.md item 6) is still TODO**.

- **Login wall removed** — `app-init.js` no longer redirects logged-out visitors to
  `/login`. It now only *clears* a genuinely corrupt / identity-less session blob and
  falls through to guest mode. `/account` + admin keep their own guards; server still
  enforces cookie auth on protected actions.
- **Guest gate helper** — new `requireAccount(actionLabel)` in `app.js` (mirrors
  `requirePro`), reuses the existing `appConfirm()` modal. Wired into `saveScenario()`
  (the activation moment, after the address check) and both Export entry points
  (`app-events.js` header button + the `_libExportAfterLoad` library path). Logged-in
  free users still get `requirePro` (Export stays Pro-gated); guests get "Create a free
  account" first. `window.isLoggedIn` / `window.requireAccount` now exported.
- **Guest→account migration** — on accept, `_goToSignup()` flushes the scenario to the
  draft, sets `propCalc_pendingSave`, and sends them to `/login?tab=signup&next=/app`.
  `login.js postVerificationRedirect` honours `next=/app` when `pendingSave` is set (so
  the email-signup funnel lands on /app, not /account) and clears the flag on other
  paths. On return, an init hook auto-saves the restored draft into the new account
  **once** (flag cleared first), gated on `saveScenario` returning a real persist.
- **"Saved locally" badge** — new `#saved-local-badge` shown to guests whenever a draft
  exists (guests see this instead of the "Unsaved" nag; logged-in UX unchanged).
- **Soft signup banner** — dismissible nudge after 45s or several real edits.
- **Guest analytics** — new `window.trackGuest(event,params)` in `analytics.js` (GA4,
  no session gate, unlike server-side `trackUsage`). Emits guest_session, returning_user,
  fields_edited (throttled, real-interaction-gated), signup_prompt_shown/_accepted,
  save_attempt, export_attempt, signup_completed, guest_migration. No CSP change (gtag
  already allowed). Verified in a real browser (no redirect, modal, badge, funnel).

## Recent Changes (May 2026 — Calculator Bulk Upgrade, Round 1)

Best-in-market rewrite of four headline calculator categories. All FY 2025-26 rate constants in code today are preserved; what's added is depth + features competitors don't offer.

- ✅ **Mortgage Repayment Calculator** — full rewrite. Fixed IO-mode bug (was using P&I formula). Added: true fortnightly schedule simulation (proper 26 fortnights/yr) with $-saving vs strict monthly; extra-repayment scenario (month-by-month amortisation); offset balance simulation; LMI estimate when LVR > 80% (industry-tier table); year-by-year amortisation schedule (collapsible, scrollable); inline-SVG donut chart (principal vs interest vs LMI, no Chart.js); payoff date display. New `mort-callout`, `mort-donut`, `mort-schedule` CSS components.
- ✅ **Borrowing Power Calculator** — full rewrite. Added: single/joint applicant mode with per-applicant income-type haircut (PAYG 100%, paygVariable 90%, casual/self-emp 80%, rental 75%); tiered 7-band HEM lookup by household income × adults × dependants; credit-card limits at 3%/month (APRA rule); HECS by FY 2025-26 income tier (1% from $54,435 to 10% above $159,664); adjustable LVR slider (60-97%) with LMI warning callout. New "What's reducing your borrowing capacity" breakdown table showing the effect of each deduction layer.
- ✅ **First Home Buyer Grants Calculator** — full rewrite. Computes ACTUAL dollar saving per program rather than showing label strings. Federal program overlay: First Home Guarantee (5% deposit, no LMI, income cap $125k single / $200k couple), Help to Buy (shared-equity, lower income caps), First Home Super Saver ($50k max withdrawal). State-by-state SD concession calculation. Couple/single + income inputs drive eligibility. Hero card shows total cash assistance figure. New `fhb-hero`, `fhb-section`, `fhb-row` CSS components.
- ✅ **Stamp Duty (all 9 pages)** — extended PR #223's bracket-cliff fix. Added to all 9 pages: LMI estimate (FHBG eligibility shortcut), title-office reg fees (mortgage + transfer, per state), conveyancing estimate, total upfront cost. The all-states `/tools/stamp-duty-calculator` now also renders a **cross-state comparison table** showing what the same purchase would cost in every state (sorted cheapest first). Deposit % input drives LMI. Generator (`build/build-state-stamp-duty.js`) updated to ship these features on all 8 state pages.
- ✅ **Comprehensive content sections** — every calculator now ships 1,500-2,500 word `<section class="tool-content">` with formulas, worked examples, state-by-state tables, "what we don't cover yet", FAQ refresh, and 2026 Australian context. Google E-E-A-T positive signal; AdSense substance requirement met.
- ✅ **Schema.org JSON-LD** — each calculator now consolidates WebApplication + BreadcrumbList + FAQPage into a single `@graph` block (eliminates the duplicate-FAQPage issue from PR #227, since the runtime injector in `tool-page.js` correctly suppresses when a static FAQPage is already present).
- ✅ **CSS additions to `tools.css`** — `mort-callout`, `mort-callout-gold`, `mort-donut-wrap`, `mort-legend`, `mort-schedule`, `bp-subheading`, `bp-breakdown`, `bp-pos`, `bp-neg`, `bp-base`, `bp-final`, `fhb-hero`, `fhb-section`, `fhb-row`, `fhb-row-save`, `tool-extras`, `tool-btn-secondary`, `tool-label-hint`, `sd-current`, `sd-save` — full dark-mode coverage on every component.

## Recent Changes (April 2026 — AdSense Content Substance Push)
- ✅ **Phase 1 — Aggressive prune** — multi-factor `shouldNoindex()` gate in `build/build-suburbs.js` reduces indexed suburb pages from 14,512 → ~3,022 (population ≥2,000 + postcode + median income present). Sitemap respects the gate; noindexed slugs still reachable via `<details>` drawer on state hubs for link equity. **(Jun 2026: gate tightened to pop ≥ 10,000 → ~641 indexed to fix calculator "Crawled – currently not indexed" — index-bloat remediation.)**
- ✅ **Phase 2 — Formula-driven suburb prose** — replaced `pick(seed, [variants])` templating in `generateInsight`/`generateStrategy`/`generateRisks`/`generateOutlook` with if/else branches over real numeric ratios (gross yield, affordability, rent-to-income, dwelling mix, CBD-distance band). Added `numericProse()`, `generateComparisonTable()` (vs state medians), `generateInvestorChecklist()` (8 bullets), expanded FAQ (4→8). New `{{COMPARE_HTML}}`, `{{CHECKLIST_HTML}}`, `{{METHODOLOGY_HTML}}` placeholders in `templates/suburb-page.html`. New `methodology.md` / `methodology.html` + `data-sources.md` / `data-sources.html` E-E-A-T pages authored at ~1,200 words each.
- ✅ **Phase 3 — Human-authored blog CMS** — admin authors posts in Redis via the new Blog tab; `build/build-blog.js` renders to static HTML at deploy time. New `netlify/functions/blog.js` (admin CRUD + slug collision check + tag index maintenance), `build/md.js` (shared Markdown parser), `templates/blog-post.html` + `templates/blog-index.html` (BlogPosting + BreadcrumbList + Person JSON-LD), `blog.css`, `sitemap-blog.xml`, `/blog/rss.xml`. Editor shows live word count vs AdSense 1,500-word floor. Build-blog falls back to `BLOG_FIXTURE` JSON when Upstash env vars absent.
- ✅ **Phase 4 — Suburb reviews & star ratings (UGC)** — logged-in users post 100+ char reviews with 1–5 star ratings on non-noindexed suburb pages. New `netlify/functions/reviews.js` (submit/list/admin actions with auth + per-IP 10/hr and per-user 3/day rate limits, `escHtml()` on write, 3-state moderation: pending/approved/rejected, atomic `HINCRBY` on `{count,sum}` aggregate). New `build/fetch-reviews.js` — spawned via `execSync` from `build-suburbs.js` to keep the build sync; SCANs `reviews:agg:*` and prints a JSON map of approved reviews to stdout. `build-suburbs.js` injects up to 10 approved reviews as **static HTML** and writes `AggregateRating` JSON-LD into the schema.org array — **only when `count > 0`** so empty review shells never appear (AdSense negative signal). New `suburb-reviews.js` frontend — star picker, live char counter, submit form, "Show more" pagination. New `{{REVIEWS_HTML}}` + `{{AGGREGATE_RATING_JSON}}` placeholders in `templates/suburb-page.html`. New Admin → **Moderation** tab (16 admin tabs total now) with Pending/All sub-tabs and approve/reject/delete actions. Styles in `suburb-insights.css` (light + dark).
- ✅ **Phase 5 — Blog comments (UGC)** — logged-in users post 20–2000 char comments on blog posts. New `netlify/functions/comments.js` — same architectural pattern as reviews.js (auth + IP 10/hr + user 5/day rate limits, `escHtml()` on write, 3-state moderation, flat threading — no nested replies in v1). `build/build-blog.js` now fetches approved comments per post **inline** (already async, unlike build-suburbs) and injects up to 20 comments as **static HTML** into a new `{{COMMENTS_HTML}}` placeholder — **returns empty string when count === 0**, so empty comment shells never render. New `blog-comments.js` frontend — live char counter, submit form, "Show more" pagination. New `templates/blog-post.html` placeholder + login-gated `#comment-form` section. Admin Moderation tab now has a **kind switcher** (Suburb reviews ↔ Blog comments) layered above the Pending/All sub-tabs — same approve/reject/delete UI pattern. Comment styles in `blog.css` (light + dark).

- ✅ **Phase 6 — HttpOnly cookie session migration** — session token moved from localStorage to HttpOnly Secure cookie (`es_session`). All Netlify functions read cookie first with Authorization header fallback. All client-side Authorization headers removed (app.js, account.js, account-panel.js, admin.js, login.js, auth-nav.js, pricing.js, blog-comments.js, suburb-reviews.js). `getAuthHeader()` replaced by `isLoggedIn()` (checks `session.id`). Token removed from auth response bodies and localStorage session. Cookie policy and privacy policy updated to reflect HttpOnly cookie usage.

## Recent Changes (April 2026 — Full-site audit, 5 rounds)

Rounds 1–5 of the "audit the whole site" pass. PR #197 merged 2026-04-24, follow-ups in PRs #200 + #201.

**Round 1 + 2** — baseline cleanup
- Removed 5 inline `onclick`/`oninput`/`onchange` CSP leaks in tool pages (deposit / capital-gains / borrowing-power / mortgage-repayment / interest-only-vs-principal).
- Replaced 6 hardcoded `.html` links with clean URLs (about, admin, blog-editor, `build-suburbs.js` × 2).
- `Organization` JSON-LD added to `about.html`.
- Added `/methodology` + `/data-sources` to the shared footer.
- `aria-selected` wired into `showTab()` + `showAdminTab()` + moderation sub-tabs.
- Dark-mode secondary text contrast bumped `rgba(245,240,232,0.45)` → `0.70`.
- Rasterised `og-image.svg` → `og-image.png` (1200×630, 65 KB); swapped 50 refs across all pages/templates. WebP for all 13 screenshots (2.3 MB saved).
- Capital-gains + borrowing-power Medicare levy fix (0→2% straight jump replaced with proper 10% sliding-scale in $27,222–$34,027 band).
- Blog word-count gate with `BLOG_MIN_WORDS` env (default **1200**). Sub-floor posts get `noindex, follow`, excluded from sitemap/RSS/index/section/tag.
- Scenarios `share` action now rate-limited (20/day/user + 30/hr/IP).
- Blog editor autosave to localStorage + `beforeunload` guard + recovery prompt.
- Service worker stale-while-revalidate for GET `/.netlify/functions/market-data`.
- Suppress `["@context"]` third-party errors in `error-capture.js`.

**Round 3** — nav + cross-linking
- `auth-nav.js` is the single source of truth for the site-nav link set (`SITE_NAV_LINKS` = Calculators / Blog / Gallery / Pricing / About / Support). Every page's `<ul class="site-nav-links">` is overwritten on load.
- All 14 tool pages got the full `<nav class="site-nav">` (was a minimal logo-only `<header class="tool-header">`).
- New `/tools/index.html` landing page (CollectionPage JSON-LD) grouping all calculators in Buying / Borrowing / Investment sections.
- All 4 calculators missing `usefulLinks[]` now have full blocks (house-flip, mortgage-stress, equity-release, renovation-cost). Orphan inbound counts boosted across the board.
- `inputmode="decimal"` on all 38 currency text inputs — correct mobile keyboard without breaking comma formatting.
- Year-marker comments on hardcoded FY2025-26 constants (ATO Stage 3, APRA APS 220 3% since Oct 2021, HEM).

**Round 4** — a11y + hardening + test harness (harness later removed)
- `aria-live="polite"` on every `.tool-result` container.
- Service worker v3 pre-caches all 14 tool URLs + `/tools` for first-visit offline.
- Stripe webhook idempotency via Redis `SET NX EX 604800` (`claimEvent`). Duplicate event IDs short-circuit.
- Stripe dead-letter list `stripe_deadletter` (capped at 200 via LPUSH+LTRIM) for webhooks that can't resolve to a user.
- `upgradePlan` now returns `{ok, reason, email}`; failures enqueue to dead-letter.
- (Round 4 also shipped Playwright + Lighthouse harnesses; Playwright was later removed per user request — PR #201.)

**Round 5** — perf + observability + security polish
- Per-IP signin cap (30 fails / 15 min) alongside existing per-email cap. Plugs credential stuffing.
- Stripe `upgradePlan` writes `user:<email>` + `cid:<customerId>` atomically via new `redisPipe()` helper (Upstash `/pipeline` endpoint).
- `invoice.payment_failed`: 3-day `subscription_grace:<email>` Redis flag + `paymentFailedAt` on user record. Banner hookup left to client.
- `auth.js verify` now refreshes the `token:<token>` record in place when plan/role has drifted, preserving TTL. Keeps cached session data consistent after Stripe upgrades / admin role changes.
- Tool-input persistence to `localStorage['tool_inputs_v1:<slug>']` — refresh no longer loses work.
- `tool-page.js` scrolls the result into view 60ms after any Calculate click (respects `prefers-reduced-motion`).
- WAI-ARIA arrow-key / Home / End keyboard pattern on `app.js` + `admin.js` tab switchers.
- `shared.css` `prefers-reduced-motion` block: disables animations, transitions and smooth-scroll for users with OS reduced motion.
- `<link rel="preload" as="style">` hint ahead of the Google Fonts stylesheet on 41 pages (+ template files).
- `netlify/functions/_log.js` — structured JSON logger (`log.info(event, data)`), wired into stripe webhook entry + dedupe path as a demo. Migration of remaining `console.log` sites happens gradually.

**Post-audit cleanup** — PR #201 removed the Playwright test harness + `.github/workflows/*.yml` canary + PR smoke workflows per user request.

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

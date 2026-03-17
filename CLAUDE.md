# CLAUDE.md — Working Notes for Claude Code

## Project Summary
**EquitySight.app** — Australia's smartest property investment calculator. Static HTML/CSS/JS site with Netlify Functions backend. No build step, no framework. Direct git push → auto-deploys to production.

**Australian-focused:** Designed for Australian first home buyers, investors & financial planners. All 8 Australian states, AUD currency, Australian tax/regulatory frameworks (ATO, ASIC, RBA, APRA, state revenue offices).

**20 HTML pages** (incl. 10 free calculators) + **14,512 generated suburb pages** + **8 state hub pages** | **9 Netlify functions** | **11 CSS files** | **4046+ lines** of calculator logic | **2651+ lines** of admin logic

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
**`ERRORS.json`** — auto-synced from the production error log. Every client-side JS error is stored in Redis and auto-pushed to this file via GitHub API (throttled to max once per 5 min). Admin can also manually sync via "Sync to GitHub" button on the Error Log tab. Requires `GITHUB_TOKEN` env var in Netlify.

**Run `/errors` to check for production errors** — reads `ERRORS.json`, traces each error to source code, fixes what's actionable, and removes processed errors from the file.

## Core Files Reference

### Application Logic
| File | Lines | Key Functions |
|------|-------|----------------|
| `app.js` | 4046 | `recalc()` = master calculation function; `dRecalc()` = debounced wrapper; `showTab(id, btn)` = tab switcher; `exportPDF()` = snapshot export |
| `admin.js` | 2651 | `loadUsers()`, `openUserDetails(email)`, `showTab(id, btn)`, `callAuth(action, payload)`, admin dashboard logic |
| `auth-nav.js` | 489 | Injects nav header + profile dropdown + help modal; `window.renderSiteNav()` re-renders after profile changes |
| `account-panel.js` | 26K | Standalone account panel with profile pic upload, color theme selection, plan display |

### Styling & Injection
| File | Lines | Purpose |
|------|-------|---------|
| `shared.css` | 15K | CSS variables (colors, fonts, radii, shadows), nav, footer, buttons, dark mode, responsive breakpoints |
| `footer.js` | 65 | Renders footer into `#site-footer-root` with branding from localStorage config |
| `error-capture.js` | 67 | Global error handler — POSTs errors to `client-errors` function |

### Supporting Scripts
| File | Purpose |
|------|---------|
| `stripe-config.js` | Exports `STRIPE_PUBLISHABLE_KEY` and `STRIPE_PRICES` for client use |
| `legal.js` | Markdown → HTML parser for legal pages (frontmatter, TOC, safe links) |

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
- **All 10 free calculators** use identical HTML/CSS structure + `tools.css` (no duplication)
- **Template pattern**: `.tool-header` → `.tool-hero` → `.tool-main` (inputs) → `.tool-result` (outputs) → `.tool-cta` → `.tool-resources` → footer div
- **Shared utilities**: `shared-calcs.js` contains `fmtNum()`, `fmt()`, `parseNum()`, `fmtPercent()`, `monthlyRepayment()`, `compoundGrowth()`, etc.
- **Injected components**:
  - `auth-nav.js` — injects site nav + profile dropdown (optional for calculators)
  - `footer.js` — injects footer into `#site-footer-root` div
  - `error-capture.js` — global error handler POSTs to `client-errors` function
- **Cost breakdown styling**: `.tool-cost-breakdown` + `.tool-cost-row` for detailed cost displays (used by cost-of-purchase)
- **To update all calculators**: Edit `tools.css` (no need to touch 10 HTML files)

### Suburb Insights System (14,512 pages)
- **Data pipeline**: `fetch-abs-data.js` → `data/abs-suburbs.json` → `generate-suburbs-data.js` → `data/suburbs.json` → `build-suburbs.js` → HTML pages
- **Real data**: Suburb names + populations from ABS 2021 Census (ArcGIS FeatureServer, SAL geography); postcodes from community dataset (`au_postcodes.csv`)
- **Placeholder data**: Income, distance to CBD, suburb type, scores — to be replaced with live data later
- **Build output**: `/suburb/{state}/{slug}/index.html` (14,512 pages) + `/invest/{state}/index.html` (8 state hubs) + directory index + sitemap
- **Templates**: `templates/suburb-page.html` and `templates/state-hub.html` — use `{{PLACEHOLDER}}` syntax
- **Styling**: `suburb-insights.css` — shared styles for suburb pages + state hubs
- **SEO**: BreadcrumbList + Place schema.org JSON-LD, postcodes in titles/meta/keywords, structured data
- **State hubs**: Progressive loading (100 suburbs initially, "Show more" button) + client-side search by name/postcode
- **Performance**: Scripts use `defer` attribute; related suburbs pre-computed (O(n) not O(n²))
- **Build command**: `node build.js` — conditional build wrapper:
  - Normal deploys: restores cached suburb pages (instant, no rebuild)
  - Suburb rebuild: only when triggered by admin "Rebuild Suburb Pages" button (or REBUILD_SUBURBS=true env var)
  - Uses Netlify build cache to persist pages between deploys
- **Admin tab**: Admin → Suburbs — browse/search suburbs, state breakdown, trigger rebuilds via Netlify deploy hook
- **To regenerate data**: `node fetch-abs-data.js` then `node generate-suburbs-data.js`

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
5. **Commit** — clear commit message with why (not just what)
6. **Push** — to assigned feature branch (e.g., `claude/feature-abc-KVfMN`)
7. **PR/Merge** — to Staging for staging deploy, then to main for production

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

## Australian Geo-Targeting & SEO (March 2026)

### All 10 Calculators Now Australian-Optimized
- ✅ All titles include "Australian" for geo-targeting (e.g., "Australian Rental Yield Calculator")
- ✅ All meta descriptions emphasize Australian focus + no signup messaging
- ✅ Social sharing tags (og:image, twitter:image) added to all 10 calculators
- ✅ 10-deep free calculator suite linked on landing page tools grid (responsive 2-col desktop, 1-col mobile)
- ✅ Government resources sections on all 10 calculators (ATO, ASIC, RBA, APRA, state revenue offices)
- ✅ Social share buttons (Facebook, Twitter, LinkedIn) on key calculators
- ✅ Related calculator cross-links encourage exploration & reduce bounce rate
- ✅ Sitemap.xml updated with all 10 calculator URLs + proper priorities

### For Google Search Console Setup
- Submit sitemap.xml: https://search.google.com/search-console
- Set target country to Australia in GSC settings
- Monitor search traffic by country & CTR from Australian searches

## Recent Changes (March 2026)
- ✅ Deleted user logout — `verify` action now checks user existence
- ✅ Admin user login status — popup shows "Active", "Email Verified", or "Awaiting Verification"
- ✅ Header styling — increased bar height & button padding for mobile readability
- ✅ Australian geo-targeting — all calculator titles, descriptions, and resources emphasize Australia focus
- ✅ **14,512 suburb insight pages** generated from real ABS 2021 Census data (population + postcodes)
- ✅ **8 state hub pages** with search and progressive loading (100 suburbs at a time)
- ✅ **Schema.org structured data** — BreadcrumbList + Place + CollectionPage on all suburb/state pages
- ✅ **Postcodes** in page titles, meta descriptions, keywords, and schema.org for SEO
- ✅ **Build optimization** — defer scripts, pre-computed related suburbs (O(n) build), .gitignore cleanup
- ✅ Sitemap split: `sitemap-core.xml` (70 URLs) + `sitemap-suburbs.xml` (14,520 URLs) indexed by `sitemap.xml`

# CLAUDE.md — Working Notes for Claude Code

## Project Summary
**EquitySight.app** — Australia's smartest property investment calculator. Static HTML/CSS/JS site with Netlify Functions backend. No build step, no framework. Direct git push → auto-deploys to production.

**Australian-focused:** Designed for Australian first home buyers, investors & financial planners. All 8 Australian states, AUD currency, Australian tax/regulatory frameworks (ATO, ASIC, RBA, APRA, state revenue offices).

**20 HTML pages** (incl. 10 free calculators) | **9 Netlify functions** | **10 CSS files** | **4046+ lines** of calculator logic | **2651+ lines** of admin logic

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
- ✅ All .md files updated with Australian focus and current page counts

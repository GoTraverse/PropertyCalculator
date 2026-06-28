# Session Handoff — for Claude Code (desktop / local)

Handoff from a **Claude Code on the web** session (sandboxed; its egress proxy
**blocked `equitysight.app`**, so it could never load production). You're running
**locally**, so you *can* reach the live site — **use that to test.**

Read `CLAUDE.md` first (project rules), then this. Pick up at **"Active task."**

---

## The big win you have that the previous session didn't
You can load the live site. Before/after any change:
- `curl`/fetch live pages and **deploy previews** (`*.netlify.app`).
- Run the cached **Lighthouse** (`bin/lighthouse-local.sh <path>`; Chrome +
  Lighthouse are in `.claude/tooling/`) to measure perf / CLS / a11y.
- Screenshot at desktop + mobile widths with the bundled Chromium.

**Limit:** you still can't log in without a **test account** (ask the user for a
throwaway free + Pro login). But the **guest flow below is the no-login path**,
so you can verify ~all of it yourself.

---

## Active task: guest-mode activation (build this next)

**Why:** `/app` is login-walled, which is the #1 signup leak. Full evidence in
**`APP_AUDIT.md`** (GA: 16 logins + 12 saves in 90 days; `/app.html` direct =
2s redirect bounce). Goal = **maximise free signups** by letting users feel the
value before asking for an account. Persona = **first home buyers**.

**Spec (user-approved, ChatGPT-refined):**
1. **Remove the login wall** — anyone can use the full `/app` as a guest.
2. **Guest data persists in `localStorage`** — already works (don't break it).
3. **Migrate guest scenario into the account on signup** (don't make them rebuild).
4. **Keep Pro features gated** as they are.
5. **Signup prompts at high-intent moments:** Save Scenario; Export; (optional)
   a small dismissible banner after meaningful engagement (~several edits / 45s).
6. **Scenario templates instead of auto-fill** for the empty first run — cards:
   🏠 First Home Buyer (Brisbane, $650k, 10% deposit) · 🏘 Investment Property ·
   🏡 Upgrade Home. Clicking loads realistic example data.
7. **"Saved locally" indicator** so guests trust their progress is kept.
8. **Analytics events:** guest_session, template_selected, fields_edited,
   signup_prompt_shown, signup_completed, guest_migration, save_attempt,
   export_attempt, returning_user.

**Suggested split:** PR A = items 1–5,7,8 (guest core). PR B = item 6 (templates).

### Integration points already mapped (saves you the rediscovery)
- **The login wall:** `app-init.js` line ~8 — `location.replace('/login')` for any
  empty session. This is the redirect to remove (let guests through; `/account`
  and admin keep their own guards on their own pages).
- **Draft persistence (works for guests already):** `app.js` ~513 — `DRAFT_KEY =
  'propCalc_draft_v1'`, `autosaveDraft()` / `restoreDraft()`. Login-independent.
- **Save flow / guest gate point:** `saveScenario()` `app.js` ~1642. Requires an
  address; enforces free-plan scenario limit via `isPro()`. Inject the guest
  signup prompt at the top (if `!isLoggedIn()`).
- **Auth helpers:** `isLoggedIn()` `app.js` ~4631 (checks `_currentUser.id`);
  `isPro()` ~4638; `requirePro()` ~4642 (model the signup modal on this).
- **Export:** `app-events.js` ~60 (`hdr-pdf-btn` → `isPro()?showPDFOptionsPopup
  ():requirePro('Export')`) and `app.js` ~1993. For a guest, prompt signup first.
- **Login redirect param is `next`** (`login.js` `safeNextUrl(params.get('next'))`)
  → send guests to `/login?tab=signup&next=/app`. Set a `propCalc_pendingSave`
  localStorage flag before redirecting; on return, if `isLoggedIn()` + flag, the
  restored draft auto-saves to the account (the migration moment) → clear flag.
- **Analytics caveat:** `trackUsage()` `app.js` ~62 only fires when logged in
  (`s.id`). For **guest** events use **GA/gtag** directly (a small `gtag('event',
  …)` wrapper) so guest_session/template_selected/etc. land in GA4.
- **Scenario state shape (for templates):** `collectCurrentState()` /
  `applyScenarioState()` in `app.js` — read these to build correct preset state
  objects for the 3 templates (map the real input IDs; don't guess).

### Verify live (you can now)
- Guest: open `/app` logged-out → full calculator usable, draft persists on
  reload, "Saved locally" shows, Save/Export prompt signup.
- Migration: as a test user, build as guest → sign up → scenario lands in account.
- Run Lighthouse on `/app` before/after (watch the CLS finding from the audit).

---

## Repo conventions (from CLAUDE.md)
- Branch `claude/***` → PR to **main** → **squash-merge immediately** (user
  granted auto-merge). Ask first only for payment/schema/broad-refactor changes.
- New dev/internal files **must** be added to `.netlifyignore` (+ a force-404 in
  `netlify.toml`) — `publish="."` serves the whole repo root.
- No build step for the frontend; Netlify Functions use esbuild + npm deps in
  `netlify/functions/package.json`.

## Other open threads (not urgent)
- **SEO recovery** pending Google recrawl (sitemap-core lastmod was refreshed;
  user did manual Request-Indexing). Re-check GSC in a week.
- **Platform Phase 1** (Postgres/Neon) is planned in `ARCHITECTURE.md` +
  `ROADMAP.md`; waiting on the user to create a Neon DB + set `DATABASE_URL`,
  then hit `/.netlify/functions/db-health` (admin) to confirm, then build the
  Suburb Timeline.
- **GA/GSC data:** the previous session queried them with the Google
  **service-account** JSON (the user has it; `claude@equity-sight.iam.gserviceaccount.com`,
  GA4 property `529155887`, GSC `sc-domain:equitysight.app`). Those one-off Node
  scripts lived in a scratchpad that does **not** transfer — re-create from the
  JSON if needed. **Never commit the private key.**

## Recently shipped (context)
Public shareable scenario links (`/s/:token`, no-login viewer) · 3 blog posts +
blog canonical fix · per-calculator OG images · Stripe post-launch $8.99 +
pricing fixes · admin cog/stats/autofill fixes · sitemap recrawl nudge.

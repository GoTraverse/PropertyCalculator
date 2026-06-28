# App Engagement Audit — Round 1

**Goal:** grow **free signups** · **Persona:** first home buyers · **Focus:** the
main `/app` experience (flagged as the weakest part) · **Lens:** brutally honest.

**Method:** GA4 (last 90 days, via service-account query) + a code read of the
`/app` first-run path (I can't load production directly — proxy blocks the
domain; see ARCHITECTURE/ tooling notes) + 2025 best-practice research (cited).

> ⚠️ **Data caveat:** GA shows ~14,300 "new users" in 90 days but only ~252
> homepage sessions and ~72 `/app` sessions. The 14k is almost certainly
> bot/crawler traffic (it tracks the ~14,500 suburb pages). The *human* funnel
> is the hundreds-level numbers below — and they're brutal.

---

## The funnel, in real numbers (90 days)

| Step | Signal | Reading |
|---|---|---|
| Homepage sessions | 252 | top of the human funnel |
| Reached `/app` | 72 sessions, 21s eng | most never get here |
| `/app.html` direct | 28 sessions, **2s** eng | **the login-wall bounce, measured** |
| `/login` | 43 sessions | |
| **`login` events** | **16** | ~16 logins in a quarter |
| **`scenario_save` events** | **12** | the activation moment fires 12× in a quarter |
| `pricing_page_view` | 26 | |
| Returning users | 49 | retention ≈ 0 |

**The core product is effectively unused, because you can't see it without an
account, and there's almost no reason to make one until *after* you've used it.**

---

## Findings, ranked by impact × ease

### 🔴 1. `/app` is login-walled — value is hidden behind the signup ask
`app-init.js` hard-redirects any logged-out visitor to `/login` **before the
page renders**:
```js
if (!raw || raw === 'null' || raw === '{}') { location.replace('/login'); return; }
```
A first-home-buyer who clicks "open the full calculator" hits a login screen
with zero context → bounces (the measured 2s on `/app.html`).

**Research:** the 2025 consensus is to *show the product before the signup wall*
and give "anonymous, functionally-limited access so they experience benefits
before committing." Products that hit the aha moment in <5 min see **+40% 30-day
retention**; every extra minute of pre-value friction costs ~3% conversion.
([taqwah], [getuserfeedback], [artisan])

**The kicker:** the app *already has guest plumbing* — `app.js` has
`/* guest: use localStorage */` paths and `scenarios.js` returns an empty list
for guests. Guest mode is built; it's just blocked by the redirect.

**Fix (highest ROI, low risk):** let logged-out users *use* `/app` as a guest
(inputs persist to localStorage, which already works). Move the signup ask to
the **value moment** — when they try to **Save**, **Export**, or build a 2nd
scenario: "Create a free account to save this." That converts intent that
doesn't exist today.

### 🔴 2. The activation action (Save) is both gated and buried
Saving a scenario is *the* reason to make an account — and it fires **12 times
in 90 days**. It's gated (needs login) and not framed as the payoff.

**Fix:** make Save the hero of the guest experience — visible, inviting, and the
natural trigger for "create a free account to keep this." Outcome-based CTA copy
("Save my scenario") — personalised/outcome CTAs convert up to **202%** better
than generic ones. ([sleeknote], [outgrow])

### 🟠 3. No "aha" on first run — blank inputs, no guidance
A new first-home-buyer lands on an empty calculator and has to know what to do.
Best practice: minimise steps to value, pre-fill a realistic **sample scenario**
they can edit, and use *in-context* nudges rather than an upfront tour (which
"almost nobody finishes"). ([taqwah])

**Fix:** open `/app` with a worked example pre-loaded ("$650k first home,
Brisbane, 10% deposit") so value is visible in 5 seconds; a one-line "edit any
number" hint; no modal tour.

### 🟠 4. Layout shift / jank — 20,266 CLS events
Cumulative Layout Shift is firing constantly. CLS hurts perceived quality,
engagement, *and* Google ranking (it's a Core Web Vital). On a calculator where
numbers move as you type, uncontrolled reflow feels broken.

**Fix:** reserve space for async-injected nav/footer/results; audit the top CLS
offenders with Lighthouse (needs site access — see tooling note).

### 🟠 5. 7,685 `suburb_market_data_not_found` errors
Suburb pages are firing thousands of failed market-data lookups — a visible
"data unavailable" experience that erodes the "trusted intelligence" brand.

**Fix:** investigate the `market-data` function / data coverage; fail gracefully
(hide the widget rather than showing an error) until data exists.

### 🟡 6. Retention has no engine
49 returning users. Nothing pulls people back. This is where saved scenarios +
(later) watchlists/alerts earn their keep — but step 1 is simply *having an
account worth returning to*, which #1–#2 create.

---

## Recommended sequence (for sign-off)

| # | Change | Effort | Expected effect |
|---|---|---|---|
| 1 | **Guest mode on `/app`** + signup at the Save/Export/2nd-scenario moment | M | the big signup unlock — value before ask |
| 2 | **Sample scenario pre-loaded** on first run + in-context hints | S–M | faster aha, higher engagement |
| 3 | **Save UX as the hero** with outcome-based CTA + "create account to keep" | S | converts the new intent |
| 4 | **CLS/perf pass** on `/app` (Lighthouse-driven) | M | smoother, ranks better |
| 5 | **Fix suburb market-data errors** (graceful fallback) | S–M | trust/quality |

Items 1–3 are one coherent piece of work: **"make `/app` usable without an
account, and ask for the account at the moment it pays off."** That's the single
highest-leverage thing we can do for free-signup growth.

---

## Open questions — round 2 (the guest-mode decision has real trade-offs)
1. **Guest scope:** should guests get the *full* app (all tabs, projection, etc.)
   or a sensible subset, with Pro-only bits still gated? (I lean: full free
   features as guest; Pro features still behind Pro.)
2. **The ask trigger:** signup prompt on **Save** only, or also on Export / 2nd
   scenario / after N minutes? (I lean: Save + Export, plus a soft inline banner.)
3. **Persistence:** if a guest builds a scenario then signs up, should we
   **migrate their localStorage draft into their new account** automatically?
   (I lean: yes — it's the magic moment; don't make them rebuild it.)
4. **Sample scenario:** OK to pre-load a worked first-home-buyer example on first
   visit? Any specific suburb/price you'd want as the default?
5. **Auth guard elsewhere:** `/account` and admin obviously stay gated — confirm
   only `/app` opens to guests.

Sources: [taqwah](https://taqwah.agency/blog/saas-onboarding-best-practices) ·
[getuserfeedback](https://getuserfeedback.com/blog/early-stage-saas-signup-flow-best-practice) ·
[artisan](https://www.artisangrowthstrategies.com/blog/saas-signup-conversion-optimization-best-practices-guide) ·
[sleeknote](https://sleeknote.com/tools/conversion-rate-calculator) ·
[outgrow](https://outgrow.co/blog/courses/lead-generation-with-calculators/ebook)

# EquitySight — The First Home Journey (flagship product spec)

**Status: proposed** — the align-before-build doc for the product pivot agreed
July 2026. Supersedes "calculators as the product"; calculators remain as the
SEO surface and as embedded tools *inside* the journey.

## Why (the founder braindump, verbatim signals)

Jacoby built EquitySight during his own (unfinished) first-home purchase. His
own pains, in his words:

1. "Didn't know what to pre-offer at auction … watched YT videos of how auctions work"
2. "Didn't know about FHBG and FHSSS and shared equity scheme etc"
3. "Kept projections in Excel to see if what we bought … would be better than no scheme"
4. "Kept reno budgets in notes"
5. "Googling government schemes and grants" (at 11pm, stressed)
6. "Picked the suburb because it was close to our church and … the only thing in our budget"
7. "Deadline for our loan pre-approval we had to keep track of"
8. "Surprised how much solicitors cost"
9. Dream tool: **"project how the different schemes affect our specific scenario"**

**He is buying again next year → he is user #1 on a live purchase.** Every step
gets dogfooded for real, one step ahead of his own journey.

## The product in one sentence

> **A guided walk from "can I even do this?" to keys-in-hand — wizards at every
> step, milestones you actually reach, and the deadlines that matter on a
> calendar — with Australia's only side-by-side government-scheme projection at
> its heart.**

The differentiator vs every bank/Canstar/Finder calculator: they answer
arithmetic; this **walks you through the purchase**. Retention is structural
(a purchase takes 6+ months), signup has a real reason (save your journey), and
the scheme projector is genuinely unique in the market.

## The Baby Steps (journey spine)

A horizontal progress line — 7 steps, each with a wizard, a checklist, embedded
tools, and a milestone moment when completed. State persists (guest localStorage
→ account on signup, using the already-shipped guest mode + migration).

| # | Step | The buyer's question | Wizard / tools (→ = already built) | Milestone |
|---|---|---|---|---|
| 1 | **Get your bearings** | Can I actually do this? | Numbers wizard (→ onboarding.js ships this), readiness checklist, savings timeline | "You know your numbers" |
| 2 | **Find your path** | Which schemes apply to ME? | **Scheme Pathway Projector** (new — the hero, below) | "You know your path" |
| 3 | **Set your real budget** | What can I spend all-in? | → borrowing power, → upfront-costs engine (incl. honest conveyancing — pain #8), buffer rule | "You have a real budget" |
| 4 | **Pick your ground** | Where, within budget? | Suburb shortlist vs budget; "near what matters" (pain #6); → suburb pages | "You know where" |
| 5 | **Hunt & compare** | Which of the homes I've seen? | Inspection tracker = → scenario library reframed; → auction-budget tool (pain #1); offer strategy | "You found it" |
| 6 | **Seal the deal** | What happens when? | **Deadline calendar** (pain #7): pre-approval expiry, finance clause, cooling-off, building & pest; → purchase timeline tab | "Contract signed" |
| 7 | **Settle & move in** | Am I done? What now? | Settlement checklist, final-costs reconciliation, → rent overlap, → reno budget (pain #4) | "Keys in hand 🎉" |

Buyers can enter at any step (someone mid-hunt starts at 5); the line shows
where they are and what's next. Steps are encouragement, not gates.

## The hero feature: Scheme Pathway Projector (step 2)

The tool Jacoby built in Excel (pains #2, #3, #5, #9). One screen: your numbers
(already collected by the wizard) → **pathways side by side**:

- **No scheme** — save to 20%, or buy sooner with LMI
- **First Home Guarantee** — 5% deposit, no LMI (eligibility + place caveats)
- **+ FHSS** — super-boosted deposit timeline
- **Shared equity** (state-dependent) — smaller loan, government stake
- State duty concessions applied automatically to every path

Per pathway: *when you can buy · cash needed upfront · LMI paid · monthly
repayment · net position at 5/10/30 years* — plus an honest "strongest for you,
because…" verdict with eligibility caveats.

**Every number from engines that already exist and were verified FY2026-27:**
FHB grants engine, stamp-duty engine (per-state FHB concessions), LMI tiers,
repayment engine, 30-year projection (already has a government-equity line).
Nothing hand-written (the #368 rule).

## What already exists (we are ~60% built)

Guest mode + signup-at-value-moment + draft migration (shipped) · onboarding
wizard (shipped, = step 1's wizard) · scenario library w/ photos+notes (= step 5)
· purchase timeline tab (= step 6 skeleton) · auction budget tool · all
calculation engines · share links · blog.

**The pivot is mostly re-architecture of the experience, not new engines:**
the journey line + step framing + checklists + calendar + the projector screen.

## MVP cut

- **Phase 1 (the pivot becomes visible):** journey line UI + step pages with
  checklists + persistence; **Scheme Pathway Projector** as step 2. `/app`
  opens into the journey (calculator tabs remain inside steps 3/5/7).
- **Phase 2 (dates & hunting):** deadline calendar with the real date types
  (pre-approval expiry first — pain #7); library reframed as inspection tracker
  with compare view.
- **Phase 3 (retention & depth):** email reminders for deadlines ("your
  pre-approval expires in 14 days"), suburb shortlist tooling, milestone shares
  (`/s/` links per milestone), moved-in tools.

## Positioning change

Homepage leads with the journey ("Your first home, step by step — free"), not
calculator tiles. Calculators keep their SEO URLs and feed the journey
("Continue your journey →"). Pro = the power layer (unlimited saved properties,
exports, projections depth) — unchanged mechanics, better reason.

## What we deliberately stop

Daily SEO watching (baked; review weekly) · further calculator polish beyond
maintenance · the heavy suburb-intelligence platform build (ARCHITECTURE.md
stays parked as a future layer — suburb data later enriches step 4).

## Dogfood loop

Jacoby's real purchase (next year) walks the steps as they ship. Every friction
he hits is a roadmap item. Target: the app is one step ahead of his journey at
all times.

---

## Build log

### Phase 1a — scaffold SHIPPED (12 Jul 2026, this PR)
Design locked from the approved v3 mockup: **stepping stones, no drawn path**,
house rebrand styling (small-caps labels, sentence-case headings, 24×24
stroke-1.6 line icons), stops alternating left/right (straight left rail on
mobile).

Files: `journey.html` · `journey.css` · `journey.js` (all public).

What works now at `/journey`:
- The trail: 7 stops, state-aware (done / you-are-here / ahead), progress bar.
- Stop 1 auto-completes from the app draft (`propCalc_draft_v1`) when the
  onboarding wizard has already collected numbers; price/savings/state are
  pulled into the journey.
- **Stop 2 — Scheme Pathway Projector v1**: editable numbers (price, saved,
  saving/mo, state), pathways computed for all 8 states — Save-to-20%, First
  Home Guarantee, 10%+LMI, and Boost to Buy (QLD only, until other states'
  shared-equity schemes are verified). FHB stamp duty included in cash-needed
  via a **sync copy** of the duty engine from `tools/stamp-duty-calculator.js`
  (marked in-file; keep both in sync — same rule as the auction tool). Verified
  against the calculator's reference figures (QLD $750k FHB = $10,925; 600k@6%
  = $3,597/mo). "Strongest for you" chosen by soonest-to-buy, tie-broken by
  LMI then repayment. Honest caveat block; "mark this stop done" milestone.
- Stop 6 preview: checklist (persisted) + example deadline list.
- Stops 3/4/5/7 deep-link to the existing tools.
- State: `propCalc_journey_v1` (localStorage, guest-first). GA events:
  `journey_view`, `projector_update`, `journey_step_done`.
- Page is **noindex** until Phase 2 makes it the front door (flip robots +
  add to sitemap-core in that PR).

### Phase 1a.3 — v3 milestones + timeline (12 Jul 2026)
- **Milestone moments**: marking a stop done now asks for confirmation, then
  celebrates with a modal (stop count, next-stop CTA); full-journey reset with
  a destructive-confirm modal (`#jreset-btn` on the trail).
- **Time-axis timeline** replaced the "soonness bars" (a longer bar read as
  *better*, which was backwards): each path is a dot positioned at its
  buy-ready month on a Now→horizon axis, with the buyer's own timeframe goal
  ticked on the axis when it fits the scale.
- **Wizard v3**: five new questions — current rent, credit-card limits,
  employment type, dependants, buying timeframe. All are *used*: rent
  comparison + card-limit (3%/mo assessment) notes in stop 3's affordability
  guide; timeframe verdict (fits / months past goal / save-rate to hit it) in
  stop 2's "Our read".

### Phase 1a.4 — v4 wizards everywhere + stage routing (12 Jul 2026)
- **Stage question** opens the wizard ("Where are you up to right now?" —
  working it out / comparing schemes / budget & lenders / choosing suburbs /
  inspecting / signed a contract). The trail drops the buyer at the matching
  stop; earlier undone stops read "Open — catch up any time". "Signed a
  contract" pre-arms stop 6.
- **Stop 3 is now a 4-step budget wizard** (upfront costs → deposit level →
  income stress-check → commit) ending in a **committed walk-away number**.
  The cap drives stop 4's search band and stop 5's auction advice; the
  dashboard shows all-in numbers at the cap. No cap → no milestone button.
- **Stop 6 is now real deadline tracking**: pre-contract explainer → 6-step
  date wizard (contract, per-state statutory cooling-off prefill in business
  days [WA/TAS none], building & pest, finance clause, pre-approval expiry —
  pain #7, settlement) → dashboard with live days-left chips
  (passed/today/urgent ≤7d/soon ≤21d), sorted by proximity. Email nudges
  still Phase 1b (needs accounts).

### Phase 1a.5 — sync, share/collaborate, admin visibility (12 Jul 2026)
- **Account sync**: new `netlify/functions/journey.js` (reviews.js auth
  pattern). Logged-in users debounce-sync their journey to Redis
  (`journey:<email>`) 1.5s after every save; on load the newer of
  local/server wins. A guest's first login pushes their local progress up.
  Guests generate zero API traffic.
- **Share / collaborate** (owner ask): "Bring someone along" card on the
  trail. Two links: **follow-along** (view — opens read-only, no account
  needed, all write paths blocked via `RO` guard + hidden chrome) and
  **partner** (edit — a signed-in partner joins via confirm modal and both
  write the SAME journey record; last write wins, both re-pull on load).
  Tokens: crypto-random, one active per mode, reusable, revocable
  (`shareRevoke`), stored `journey:share:<token>` +
  `journey:shares:<email>`. Join URL: `/journey?join=<token>`. Partner
  binding: localStorage `propCalc_journey_collab`.
- **Admin → Journeys tab** (owner ask: "see what journeys people have and
  load saved ones"): table of every synced journey (stage, stops done
  progress bar, state, target, cap, places logged, last update, ✓ contract
  flag) + read-only detail view (profile chips, money grid, per-stop ticks,
  deal dates, logged places incl. notes — escHtml'd) + delete (server copy
  only). Auto-loads on first tab visit; wired in admin-events.js.

### Phase 1a.6 — the places library (12 Jul 2026)
Owner's architecture locked: **one journey per user**; the multi-item layers
live inside it — scenarios (later) and the **places library** (this round).
- Stop 5's 3-state inspection tracker became the full library: statuses
  Browsed / Inspected / Shortlist / Offer made / Lost auction / Passed /
  Won, chosen from a tap-open picker (no more cycle button). Old `v`
  indexes migrate to `st` keys on load.
- Every priced place shows its delta against the stop-3 walk-away cap
  ("$15,000 over your cap" / "under cap"). Filter chips with live counts.
  Lost/passed rows muted + struck through. A "Won" place personalises the
  stop-5 milestone ("You found it — 14 Wattle St.").
- Trail home gets a compact "Your places" summary card (counts by status →
  open the library). Library capped at 50 places (server blob ceiling).
- Admin journey detail shows the new statuses (Won highlighted sage).
- **Browser harness**: `tests/journey-browser-harness.html` (dev-only,
  tests/ is .netlifyignore'd) — seeds a rich journey into localStorage and
  drives any view for headless-Chrome screenshots. Now part of the
  pre-merge routine after the v3 modal[hidden] regression proved DOM-stub
  tests can't catch CSS conflicts.

### Phase 1a.7 — worked scenarios (12 Jul 2026)
The second multi-item layer of the owner's architecture (journey → scenarios
+ places): the projector gains **"Save this as a scenario"** — a snapshot of
the inputs + best path (name auto-derived, e.g. "QLD $650,000"). Saved
scenarios list under the projector with best-path/ready-date/repayment/cash
meta, **Load** (restores the inputs, projector recomputes live) and delete;
capped at 12 (sync blob budget); a "Your scenarios" card on the trail home.
RO-guarded for shared views; rides along in account sync automatically.
Harness now mirrors the real projector markup (its earlier simplified copy
hid the strip — fidelity rule: harness views must match journey.html).

### Phase 1a.8 — stop-4 suburb suggester from the verified dataset (12 Jul 2026)
Owner ask: "pick your ground almost needs to search our DB of suburbs and
suggest some around aus that could fit."
- New generated `/journey-suburbs.json` (67 KB, lazy-fetched on stop 4) via
  `build/make-journey-suburbs.js`: joins `data/market-current.json` with
  suburb slugs/population — **1,473 suburbs, each linking to an indexed
  profile page** (pop ≥ 2,000 gate). Regenerate after each quarterly
  market-data refresh.
- **"Suburbs your band actually buys"**: suburbs whose verified sale median
  (VIC Valuer-General 2025 prelim · SA Valuer-General Q1 2026 metro) sits
  inside the ±10% band around the committed cap, 12 closest shown, houses/
  units labelled, full source captions. Rent-only states get an honest
  coverage note (their list is cross-country until a licensed price source
  ships).
- **Dataset search**: type-ahead over all 1,473 suburbs — sale medians
  and/or median weekly rents (labelled as rents, never prices), each row
  linking to the suburb page. NSW excluded (postcode-geo only, per the
  data-honesty rules).

### Phase 1a.9 — wording pass + infrastructure integration audit (12 Jul 2026)
- **Wizard wording** (owner: 'this page needs better wording'): the stage
  question no longer references stops/schemes a first-time visitor hasn't
  met — 'Where are you in your home-buying journey?' with plain chips
  (Wondering if I can afford it / Saving up and researching / Working out
  what I can borrow / Deciding where to buy / Out inspecting homes / I've
  signed a contract). Stage labels updated everywhere they surface.
- **Integration audit fixes** (owner: 'audit this workflow so we can
  integrate it better into the existing infrastructure'):
  1. login.js safeNextUrl now allows /journey AND the partner-invite
     journey?join=<token> URL — previously every journey signup bounced to
     /app and the collaboration token was dropped (broken funnel).
  2. Tool CTAs: 19 buyer tools (all stamp duty pages, borrowing power,
     deposit, FHB grants, repayment, serviceability, IO-vs-P&I, stress,
     auction budget, listing checker, cost of purchase) now send their
     'go deeper' CTA to /journey; 7 investor/owner tools keep /app.
  3. footer.js: legacy /portfolio link replaced with /journey.
  4. Service worker v30: pre-caches /journey + journey.css + journey.js.
     RULE: bump the SW version whenever journey assets change from now on.

### Phase 1a.10 — flagship audit round (12 Jul 2026, owner-requested deep pass)
- **Lighthouse (local) 100/100/·/100, CLS 0.286 → 0.000**: reserved space for
  the JS-rendered trail and the injected footer (the footer fix helps every
  page on the site); sage small-text now AA (--sage-dark); trail cards h3→h2
  (heading order); SEO-block links underlined (not color-only).
- **Bug fixes from the adversarial review**: (1) every adopted state — server
  pull, share view, collab join — now passes normalizeState(); previously a
  record synced by an older client crashed renderTrail and blanked the page.
  (2) transient budget/deal 'editing' flags no longer persist (wizards
  re-opened on reload). (3) adminDelete now revokes the user's share tokens
  (they used to dangle and come back to life on re-sync). (4) wizard writes
  RO-guarded directly.
- **Flagship SEO**: journey.html gained JSON-LD @graph (WebApplication +
  BreadcrumbList + FAQPage) and an always-visible content section (what it
  is, the 7 stops, 6-question FAQ matching the schema) — the tool-page
  pattern; the page previously had almost no indexable text. Sitemap
  priority 0.9 → 1.0.
- **Site setup**: manifest start_url /app.html → /journey (+ app shortcuts);
  suburb-page template CTAs → journey (primary) with investor /app secondary
  (takes effect on next suburb rebuild).
- **Guardrail**: tests/duty-sync-test.js — extracts the duty engine from its
  three sync-copy homes and asserts identical output across 8 states × 23
  bracket-crossing prices + the verified reference figures. Run after ANY
  duty change.
- CLAUDE.md gained a First Home Journey subsystem section.

### Phase 1a.11 — calendar export for deal deadlines (overnight, 12 Jul 2026)
Stop 6 dashboard: **Add these dates to my calendar** downloads an RFC 5545
.ics (all-day events for cooling-off, B&P, finance, pre-approval expiry,
settlement — skips unset dates) importable into Google/Apple/Outlook. The
no-infrastructure half of pain #7; Resend email nudges remain Phase 1b.
Unit-tested (event count, CRLF, DTSTART/DTEND); SW v32.

### Phase 1a.12 — journey OG image (overnight, 12 Jul 2026)
Dedicated 1200×630 social card at images/og/journey.png, rendered from
images/og-journey-template.html (netlifyignored) in the house per-calculator
OG style — charcoal, gold edge, stepping-stones motif (done/here/ahead).
journey.html og:image + twitter:image updated; SW v33.

### Phase 1a.13 — stake at 5/10/30 years per pathway (overnight, 12 Jul 2026)
The spec's missing projector column. New table under the timeline: your
stake per path at 5/10/30 years — price paid − closed-form amortised
balance (verified against iterative amortisation to 4dp) − government
equity share. Deliberately flat-valued at the target price (no growth
guessing, stated in the caveat); H2B share noted as repayable at market
value. Best path bolded, ineligible greyed. SW v34.

### Phase 1a.14 — FHSS booster card (overnight, 12 Jul 2026)
Spec asked for an FHSS path; an honest one needs marginal-rate + deemed-
earnings modelling we refuse to hand-write. Shipped instead as a booster
card on the projector (FHB only): verified ATO caps (SYNC COPY from the
grants engine: $15k/yr contributions, $50k/person release, doubled for
couples) + time-to-release-cap at the buyer's own save rate (pure
arithmetic). Tax edge explicitly NOT estimated — ATO + grants-calculator
links instead. SW v35.

### Phase 1a.15 — stop-7 final-costs reconciliation (overnight, 12 Jul 2026)
'The final dollars': final purchase price (auto-filled from the Won place
→ cap → target, editable) with duty recomputed by the engine at that
price; 'we carried vs you paid' rows (duty exact, $3,500 legals carried,
B&P + loan-fee ranges) with actual-$ inputs persisted in S.settle; totals
+ over/under verdict once 2+ actuals entered. Pain #8 closed end-to-end.
RO-disabled inputs; SW v36.

### Phase 1a.16 — stop-5 offer strategy (overnight, 12 Jul 2026)
'When you're ready to make a move': the walk-away cap headlines, then
private-sale guidance (open below cap, anchor to the stop-4 verified
median, clauses are the safety net) beside auction guidance (hammer is
unconditional — B&P + approval BEFORE the day) with a deep link into the
auction-budget tool's printable day plan. Pain #1. SW v37.

### Phase 1a.17 — place → projector linking (overnight, 12 Jul 2026)
Every priced place in the library gains a 'Project' chip: one tap sets
that asking price as the journey target and opens the scheme projector
recomputed at it — 'what would buying THIS one look like?' RO-guarded;
harness proj=1 drive verified the full click-through. SW v38.

### Phase 1b — next (desktop session; can verify live)
1. Extract the duty/LMI/repayment formulas into a shared module used by
   journey.js + the calculators (kill the sync copy).
2. ~~Account sync for journey state~~ — DONE (Phase 1a.5). Remaining:
   auto-adopt on signup redirect could be smoother (currently first /journey
   visit after login pulls/pushes correctly).
3. Eligibility checks in the projector (income caps, price caps per scheme/
   state) — verified sources only, same rigour as #350.
4. Stop 6 real dates: user-entered deadline dates, days-left computed, Resend
   email nudges (7d / 48h).
5. Stop 5: reframe the library as the inspection tracker inside the journey.
6. Homepage CTA → /journey (Phase 2 gate) once 1b lands and the owner has
   walked it on his own purchase.

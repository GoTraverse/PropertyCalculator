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

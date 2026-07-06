Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

General - (DO NOT REMOVE THIS LINE)
-
26. Add suburb-specific og:image generation (state + suburb name card) to replace favicon fallback
28. (External SEO audit round 6 — needs user input) Social profile URLs. If you create FB/X/Instagram/LinkedIn/YouTube accounts for EquitySight, paste the URLs and Claude will add them to: (a) `footer.js` social-icon row, (b) `about.html` Organization JSON-LD `sameAs` array. Recommend prioritising LinkedIn + X for fintech audience; skip YouTube/Instagram until you have content.
29. (External SEO audit round 6 — needs user input) Facebook Pixel ID. Paste a 16-digit Pixel ID and Claude will wire the standard FB Pixel base script into the head of every page (defer-safe, CSP-compliant — will need a CSP `connect-src` update for `connect.facebook.net`).
30. (External SEO audit round 6 — needs user input) Business address + phone. Decide whether to expose. If yes, Claude will add a `ContactPoint` to the `Organization` JSON-LD (about.html) and a contact block on contact.html. If staying private, mark this item resolved.
27. Expand 5 borderline blog posts from ~1,400 to 1,500+ words, then bump BLOG_MIN_WORDS back to 1500 in Netlify env vars. Per-post brief — add each section to reach the floor cleanly:
    - what-costs-are-involved-when-buying-property-in-qld: TEXT READY (2026-07-06) — replacement sections prepared (fixes the wrong "$400–$600" registration-fee claim to the real Titles Qld value-scaled schedule AND adds the QLD/NSW/VIC comparison table, ~1,640 words). Owner: paste from Claude's chat message into Admin → Blog, save, deploy.
    - is-it-better-to-pay-off-your-mortgage-or-invest (1,390 → 1,500): add a 110-word worked example at 6.25% mortgage vs 8% long-run equities return, with a break-even calculation using the repayment formula so readers can plug their own numbers.
    - what-is-negative-gearing-and-does-it-still-work-in-2026 (1,399 → 1,500): add a 110-word paragraph on recent federal policy stability (negative gearing untouched in 2025 budget) and what the ALP stance has been since the 2019 election — anchors E-E-A-T recency.
    - how-to-read-property-market-trends-like-an-investor (1,408 → 1,500): add a 100-word section on using RBA cash-rate history + ABS dwelling approvals as leading indicators; link to /methodology.
    - is-redbank-plains-a-good-investment-2026 (1,425 → 1,500): add a 90-word comparison vs neighbouring Collingwood Park + Bellbird Park (median price, gross yield, distance to CBD) pulled from the respective suburb pages.
    All target word counts verified via `node build/build-blog.js` with BLOG_MIN_WORDS=1500.
33. (SEO audit Jul 2026 — optional, marginal) Cut ~290ms homepage render-blocking: inline critical CSS and/or async-load the Google Fonts stylesheet. LCP already 1.5s so low payoff. NOTE (Jul 2026): the usual async-font trick (media="print" + onload attr) is an inline event handler — blocked by our CSP script-src-attr; needs a small site-init.js approach if ever done.


PRODUCT ROADMAP (S/A/B tier) - (DO NOT REMOVE THIS LINE)
- Goal: build value a chatbot/Google/a pro-without-a-tool/Notes/app-store-clone can't. Scorecard: https://claude.ai/code/artifact/4cf0348f-9d1f-4e13-a04d-d169cbbb2a80
- BUILD ORDER IS A CHAIN: real data -> tools that use it -> trust+traffic -> revenue. Don't parallelise.
- Constraints: no local Node (build runs on Netlify); suburb rebuild is credit-expensive — don't trigger casually.
R1. [S] Real suburb data. DONE + MERGED (#337/#338), awaiting owner's manual deploy which AUTO-REBUILDS all suburb pages + re-fetches real ABS: real ABS income restored in Key Indicators, postcode 1740->2150, honest disclaimer, dropped the invented Investment Score + school/park counts. REMAINING: (a) after the deploy, verify pages then staged re-index noindex->index (larger suburbs first) via shouldNoindex(); (b) drop the city/state "City Investment Score" too; (c) R1 part 2 = NSW Valuer-General sold prices (start NSW) -> feeds R3 overpriced-checker + R6 auction tool. (d) FRESHNESS FIX (see memory project-suburb-data-architecture): the Domain live-market pipeline is already built but DORMANT -> OWNER must set DOMAIN_CLIENT_ID/DOMAIN_CLIENT_SECRET Netlify env vars (free creds at developer.domain.com.au) to light up live current rent/price/growth/yield/DOM; the 2021 Census rent/mortgage are real-but-STALE (fast-tier) -> relabel "2021 Census", current comes from Domain. Claude: build build/fetch-abs-current.js (ABS Data API C21_G02_SAL -> real dated 2021 Census income replacing the placeholder) + honest "as at [period]" provenance labels; parse Domain daysOnMarket. OWNER also: email Domain to confirm statistics-endpoint caching/display rights BEFORE lifting noindex. 2026 Census refresh lands ~Jun 2027 (monitor mid-2026 release plan). STATUS: Domain unavailable to solo devs -> pivoted to FREE CC BY 4.0 state-gov open data, PRE-EXTRACTED + verified (no npm dep). Phase-1 data committed (#339): QLD rent 693, SA rent 667 + SA house sale 364, VIC house 711 + unit 437; build/merge-market-current.js folds current_* into suburbs.json. DONE (#340): rendered current_* (rent caption + new "Sale prices & yield" section) + honest labels + re-indexed SA/VIC/QLD (real-data noindex gate). ALL R1 data work (#337-340) ships on the owner's next suburb REBUILD (auto-triggers on next deploy — cache deps touched). Untested locally → watch the first Netlify rebuild log ([merge-market] counts + index stats). Quarterly refresh recipe in memory project-suburb-data-architecture.
R2. [S] Auto-state calculators — geolocate -> default the user's state/territory so answers are right without picking.
R3. [S] DONE (#343): /tools/listing-price-checker — asking price vs real gov suburb medians (VIC/SA price, QLD rent-yield mode) + honest coverage states. FOLLOW-UP at quarterly data refresh: add TAS rent to tools/market-medians.json AND update the tool's hardcoded coverage copy (it currently says TAS/NSW uncovered — true for the tool today).
R4. [S] Investor/landlord suite. PIECE 1 DONE (#347): /tools/land-tax-calculator — all 8 jurisdictions, adversarially-verified 2026 schedules (see memory project-land-tax-verified; re-verify each July + post-budgets), multi-property aggregation, owner types, surcharges, 17th calculator. PIECE 2 DONE (#348): /tools/property-cashflow-calculator — exact FY2026-27 negative gearing (new 15% band verified vs ATO), two-ledger cash/tax model, suburb median rent prefill, land-tax cross-link, rate stress test. 18 calculators total. PORTFOLIO TRACKER MVP SHIPPED (#352, 2026-07-05): /portfolio live on next deploy — guest pitch + dashboard + multi-state land-tax rollup (SYNC copy of verified schedules) + gov-median context + dates panel + holdings CRUD; netlify/functions/portfolio.js w/ server-enforced caps (free 2 / pro 100) + rate limits + cookie-only auth. UNTESTED IN BROWSER — smoke-test after deploy: guest state renders; sign in; add 2 holdings; 3rd hits upgrade card; land-tax rollup (QLD 2x holdings 400k+350k land = $2,000/yr check); dates panel; mobile; dark mode. FAST FOLLOWS (owner-locked order): (1) scenario<->holding bridge (Portfolio = own / Scenarios = sandbox), (2) next-purchase impact (portfolio-wide incl. marginal land tax per state), (3) EOFY ATO-category CSV export (Pro renewal engine), (4) shareable land-tax-exposure snapshot (launch motion), (5) email alerts once dates usage proves out. Also: consider main-nav link (footer-only now). ALSO: consider linking land-tax into /app's investment tabs. FY2026-27 SWEEP DONE (2026-07-05, verified vs official sources): NSW duty brackets indexed; TAS FHB exemption removed (expired); WA FHB 600k/800k; ACT HBCS uncapped; QLD citizenship note; 15% tax band + new HECS marginal system (borrowing-power); Medicare 28,011/35,013; FHB grants calc fully reworked (5% Deposit Scheme no income caps, new cap tables, H2B open 103k/165k, QLD 30k continues, NT 50k, TAS 20k); 1-Jul-2027 CGT/negative-gearing reform disclosures added to capital-gains + cashflow. Next annual sweep: July 2027 (major: 15%->14% band + the CGT/neg-gearing regime change applies).
R5. [A] Affordability map — income+deposit -> which suburbs are in reach at real median prices (needs R1).
R6. [A] DONE (#343): /tools/auction-budget-calculator — walk-away price solver (duty synced verbatim from stamp-duty-calculator.js — update BOTH on rate changes), 10%-deposit warning, bid ladder, printable checklist.
R7. [A] Lead-gen to brokers/buyers-agents/conveyancers = revenue engine (disclose all referrals).
R8. [A] MCP connector — expose verified calculators + data to Claude/ChatGPT (be the accurate source they call).
R9. [A] Grow moderated real-user suburb reviews (already built) — drive traffic, guard moderation.
R10. [A] Saved-suburb alerts + weekly PDF/email/RSS digests (after R1).
R11. [B] One-stop cross-device home-buying workspace (PWA already covers platforms; direction, not a rebuild).
R12. [B] Renter utility / NMI connection helper.
R13. [B] Aggregated "what Australians are modelling" insights (anonymised, aggregate-only).
R14. [B] Featured real AU property pros — blogs + contactable Q&A (E-E-A-T).
R15. [B] Insurance/agent/council B2B/B2G — later, needs scale.
Skipped (Tier C): air/noise/smell maps, crime warnings, native apps, physical print, video, Dave Ramsey brand, gamification/equity-bucks, cash-for-UGC.


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-

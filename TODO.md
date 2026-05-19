Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

General - (DO NOT REMOVE THIS LINE)
-
28. (External SEO audit round 6 — needs user input) Social profile URLs. If you create FB/X/Instagram/LinkedIn/YouTube accounts for EquitySight, paste the URLs and Claude will add them to: (a) `footer.js` social-icon row, (b) `about.html` Organization JSON-LD `sameAs` array. Recommend prioritising LinkedIn + X for fintech audience; skip YouTube/Instagram until you have content.
29. (External SEO audit round 6 — needs user input) Facebook Pixel ID. Paste a 16-digit Pixel ID and Claude will wire the standard FB Pixel base script into the head of every page (defer-safe, CSP-compliant — will need a CSP `connect-src` update for `connect.facebook.net`).
30. (External SEO audit round 6 — needs user input) Business address + phone. Decide whether to expose. If yes, Claude will add a `ContactPoint` to the `Organization` JSON-LD (about.html) and a contact block on contact.html. If staying private, mark this item resolved.
27. Expand 5 borderline blog posts from ~1,400 to 1,500+ words, then bump BLOG_MIN_WORDS back to 1500 in Netlify env vars. Per-post brief — add each section to reach the floor cleanly:
    - what-costs-are-involved-when-buying-property-in-qld (1,394 → 1,500): add a 120-word comparison table of QLD vs NSW/VIC stamp duty, FHOG and FHB concessions; cite revenue.qld.gov.au + sro.vic.gov.au as sources.
    - is-it-better-to-pay-off-your-mortgage-or-invest (1,390 → 1,500): add a 110-word worked example at 6.25% mortgage vs 8% long-run equities return, with a break-even calculation using the repayment formula so readers can plug their own numbers.
    - what-is-negative-gearing-and-does-it-still-work-in-2026 (1,399 → 1,500): add a 110-word paragraph on recent federal policy stability (negative gearing untouched in 2025 budget) and what the ALP stance has been since the 2019 election — anchors E-E-A-T recency.
    - how-to-read-property-market-trends-like-an-investor (1,408 → 1,500): add a 100-word section on using RBA cash-rate history + ABS dwelling approvals as leading indicators; link to /methodology.
    - is-redbank-plains-a-good-investment-2026 (1,425 → 1,500): add a 90-word comparison vs neighbouring Collingwood Park + Bellbird Park (median price, gross yield, distance to CBD) pulled from the respective suburb pages.
    All target word counts verified via `node build/build-blog.js` with BLOG_MIN_WORDS=1500.


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-

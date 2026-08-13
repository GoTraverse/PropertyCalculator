Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

STRATEGY (Aug 2026 — read CLAUDE.md "Strategy" first): EquitySight is ONE product — the First Home Journey — maintained for pride on a few hours a week. Only the ~1,475 real-data suburb pages are generated; blog is dark (BLOG_ENABLE); /app is parked; UGC submissions off; no posting/growth obligation. Old growth-era tasks below were closed or parked accordingly — don't resurrect them without the owner asking.

General - (DO NOT REMOVE THIS LINE)
-
35. Quarterly market-data refresh (next due ~Oct 2026): check whether Valuer-General Victoria has published the final 2025 series (current caption "2025 (preliminary)" is the oldest in the file), pull new QLD RTA / SA CBS / TAS bond quarters, then regenerate data/market-current.json → tools/market-medians.json → journey-suburbs.json (node build/make-journey-suburbs.js), update the “1,473 suburbs” count in journey.html if it changed, and let the suburb rebuild pick it up. Also per R3 follow-up: add TAS rent to tools/market-medians.json and update the listing-price-checker coverage copy when done.
36. Annual FY sweep (next: July 2027, a big one — 15%→14% tax band + the 1-Jul-2027 CGT/negative-gearing regime change): re-verify all duty/tax/scheme constants against official sources, run tests/duty-sync-test.js, update the three duty engine copies together (stamp-duty-calculator.js, auction-budget-calculator, journey.js).
34. (Downgraded from urgent — blog is dark, so the post is no longer served.) OPTIONAL Redis hygiene: the unpublished-in-practice post "stamp-duty-every-australian-state-750k-2026" still holds a fabricated $750k duty table in Redis. If the blog ever returns, this MUST be fixed or deleted first (corrected table in Claude's chat, 6 Jul 2026 audit), and the five borderline posts need their word-count expansions (briefs in git history of this file, PR #401-era version).
33. (Optional, marginal) Cut ~290ms homepage render-blocking: inline critical CSS and/or async-load Google Fonts. LCP already 1.5s so low payoff. CSP note: the media="print" onload trick is blocked by script-src-attr — needs a site-init.js approach if ever done.

Parked by the Aug 2026 strategy (revive only if the owner asks): suburb og:image cards (was 26); social profiles / FB pixel / business address JSON-LD (was 28–30); broker lead-gen (was R7); MCP connector (was R8); UGC review growth (was R9); alerts/digests (was R10); the rest of the old S/A/B roadmap chain (R5 affordability map, R11–R15).


PRODUCT ROADMAP - (DO NOT REMOVE THIS LINE)
- Aug 2026: the S/A/B growth roadmap is retired (see STRATEGY above). What remains of the old chain that still matters: the data refresh + FY sweep cycles (items 35–36) and keeping the journey excellent. Improvements to /journey that make the walk clearer or more trustworthy are always in-scope; new acquisition surfaces are not.


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-

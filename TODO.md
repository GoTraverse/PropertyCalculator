Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

STRATEGY (Aug 2026 — read CLAUDE.md "Strategy" first): EquitySight is ONE product — the First Home Journey — maintained for pride on a few hours a week. Only the ~1,475 real-data suburb pages are generated; blog is dark (BLOG_ENABLE); /app is parked; UGC submissions off; no posting/growth obligation. Old growth-era tasks below were closed or parked accordingly — don't resurrect them without the owner asking.

General - (DO NOT REMOVE THIS LINE)
-
37. ! PUBLISH ON NETLIFY. The live site is locked to a deploy from 14 Aug 2026, so nothing merged since has gone live, including the Nov 2026 login fix (#408). Netlify → Deploys → open the newest deploy → "Publish deploy" (or turn auto-publishing back on). Then: Admin → Database → "Sign everyone out", sign back in, change the admin password. Until this is done anyone who knows a verified account's email can sign in as it.
38. ! The GitHub repo is public and old commits of ERRORS.json contain the admin email. Decide: make the repo private, or accept it. (The file no longer carries names or emails.)
39. Stripe / billing (payment code is ask-first, so none of this was changed): (a) account.html lines ~281/288/299 have two class attributes on one button, so "Manage", "Update" and "Cancel subscription" do nothing — only the dynamic "Manage billing" button works; (b) the webhook marks an event as handled before processing it and returns 200 on failure, so a transient Redis error loses the event; (c) past_due downgrades at once despite the 3-day grace flag; (d) createCheckout accepts any price id; (e) deleting an account does not cancel its Stripe subscription.
40. Facts to re-check against the government sources (they are not reachable from Claude cloud sessions): QLD $30k FHOG (was "pending Royal Assent" in July); TAS $20k FHOG ("subject to legislation"); WA first-home thresholds; the NSW/WA first-home taper formula (the code uses a linear fraction of base duty; a per-$100 rate would put NSW $900k about $2,250 higher); NT new-build first-home duty (journey charges full duty with a note, grants calculator shows $0); Medicare low-income thresholds (FY2025-26 values in use); land tax years roll on 31 Dec 2026; the QLD cooling-off count (now day-one inclusive per Property Occupations Act 2014 s 166 — confirm) and the NT start day.
41. Data: (a) the quarterly refresh in item 35 is overdue (last done July 2026); (b) data/suburbs.json is public (the admin Suburbs tab fetches it) and still holds the placeholder income/score/count fields — strip them or serve it through an admin-only function; (c) the sale medians carry no sales count — add one to the extract and drop medians built on fewer than 10 sales.
42. Remaining security hardening (lower risk): CORS/Origin trusts any *.netlify.app; magic-link code is 6 digits; email format and length are not validated before being used in Redis keys; the email-verification attempt counter never resets; market-data / address-suggest / mapproxy have no or fail-open rate limits; share-view pages get no CSP headers and accept free-form style values; seo-metrics changes state on GET; accounts that have not signed in since the scrypt change still hold the old HMAC hash; netlify.toml CSP has two stale script hashes and hosts for features that are gone.
43. Journey leftovers: "Edit my answers" replays all 16 questions; a partner who signs in by magic link loses the ?join= invite; "Project" on a place overwrites the target price; saved scenarios show no saved-on date.
44. Calculator leftovers: Medicare levy is flat 2% in cash flow but phased in elsewhere; conveyancing estimates differ between tools; default rates are 6.25% on four pages and 6.50% on two; deposit and cost-of-purchase use Queensland's standard rate for non-first-home owner-occupiers; auction budget has no LVR/LMI check; the LMI tier table and market-rate.js's 2.15% lender margin have no source; land-tax extra rows are not saved across a refresh.
45. Cleanup: the admin "About Page" tab no longer changes anything visitors see; build/build-state-stamp-duty.js is stale and disabled; adsense.js and the ad-slot placeholders are unused; if Admin → Legal Pages holds an override for privacy/terms/cookies/disclaimer it will mask the rewritten text until cleared; sitemap-core.xml lastmod dates are from August.
46. Facts the Nov 2026 copy pass flagged but could not check (left as written): stamp duty page "Last reviewed 12 July 2026" vs result note "verified 5 July 2026"; WA FHOR "must be eligible for the FHOG" wording; the CGT reform claims on capital-gains and cash-flow pages (Tax Reform No. 1 Act 2026, 50% discount replaced from 1 July 2027); TAS foreign land tax surcharge 2%; the interest-only rate premium (0.15–0.40%, "about 0.25%") has no source; HEM "published quarterly"; ACT duty due date wording; NSW FHBAS link sits under /previous-schemes/; listing checker has no link to the TAS bond dataset and the SA CBS link goes to a homepage; renovation code has kitchen-refresh and landscaping allowances no table on the page shows.
47. Small leftovers from the Nov 2026 de-AI pass: /login has no h1; /account and the parked /app have inputs without labels; /portfolio (parked) still has a "Related tools" card grid; methodology doesn't describe the journey's borrowing estimate (borrowLimit); suburb pages can still render approved reviews with AggregateRating but no text page says so.
48. Database review (asked for in Nov 2026, not done): the Upstash host isn't reachable from Claude cloud sessions. To do it, give Claude the Upstash REST hostname so it can be allowed, and add the token through the session's credential prompt (never in chat). The review reads aggregate counts only (users, journeys, saved scenarios, errors) and writes no personal data anywhere.
49. After item 37: connect Google Search Console (the Claude connector failed to connect in Nov 2026), submit sitemap.xml and check which calculator pages Google indexes.
35. Quarterly market-data refresh (OVERDUE — due ~Oct 2026; the state government sites are not reachable from Claude cloud sessions unless their hosts are added to the session's allowed network domains): check whether Valuer-General Victoria has published the final 2025 series (current caption "2025 (preliminary)" is the oldest in the file), pull new QLD RTA / SA CBS / TAS bond quarters, then regenerate data/market-current.json → tools/market-medians.json → journey-suburbs.json (node build/make-journey-suburbs.js), update the “1,473 suburbs” count in journey.html if it changed, and let the suburb rebuild pick it up. Also per R3 follow-up: add TAS rent to tools/market-medians.json and update the listing-price-checker coverage copy when done.
36. Annual FY sweep (next: July 2027, a big one — 15%→14% tax band + the 1-Jul-2027 CGT/negative-gearing regime change): re-verify all duty/tax/scheme constants against official sources, run tests/duty-sync-test.js, update the three duty engine copies together (stamp-duty-calculator.js, auction-budget-calculator, journey.js).
34. (Downgraded from urgent — blog is dark, so the post is no longer served.) OPTIONAL Redis hygiene: the unpublished-in-practice post "stamp-duty-every-australian-state-750k-2026" still holds a fabricated $750k duty table in Redis. If the blog ever returns, this MUST be fixed or deleted first (corrected table in Claude's chat, 6 Jul 2026 audit), and the five borderline posts need their word-count expansions (briefs in git history of this file, PR #401-era version).

Parked by the Aug 2026 strategy (revive only if the owner asks): suburb og:image cards (was 26); social profiles / FB pixel / business address JSON-LD (was 28–30); broker lead-gen (was R7); MCP connector (was R8); UGC review growth (was R9); alerts/digests (was R10); the rest of the old S/A/B roadmap chain (R5 affordability map, R11–R15).


PRODUCT ROADMAP - (DO NOT REMOVE THIS LINE)
- Aug 2026: the S/A/B growth roadmap is retired (see STRATEGY above). What remains of the old chain that still matters: the data refresh + FY sweep cycles (items 35–36) and keeping the journey excellent. Improvements to /journey that make the walk clearer or more trustworthy are always in-scope; new acquisition surfaces are not.


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-

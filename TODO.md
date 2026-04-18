Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

General - (DO NOT REMOVE THIS LINE)
-
1. Convert screenshots to WebP format (Performance - High) — requires cwebp or similar tool
2. Create 1200x630px OG social sharing image (SEO - High) — requires image editor
!3. Move session cookie to SameSite=Strict (or add CSRF double-submit token) — netlify/functions/auth.js:51
!4. Revoke token:<token> in Redis on logout AND delete-user — netlify/functions/auth.js:253, 1380
!5. Drop legacy Authorization: Bearer fallback now that all clients are cookie-based — netlify/functions/auth.js:349
!6. Stop trusting x-forwarded-for in rate limits; use x-nf-client-connection-ip exclusively — auth.js:386, comments.js:218, reviews.js:249, address-suggest.js:199
!7. Make blog slug collision atomic with SET NX — netlify/functions/blog.js:332
!8. Fail the build (don't silently fall back to {}) when build/fetch-reviews.js errors — build/build-suburbs.js:1482
9. Pipeline approve/reject + queue-remove in comments.js and reviews.js to avoid mid-op desync — comments.js:299, reviews.js matching section
10. Expand methodology.html to 1,200+ words (currently ~275) — SEO/AdSense E-E-A-T
11. Expand data-sources.html to 1,200+ words (currently ~249) — SEO/AdSense E-E-A-T
12. Inline site-init.js theme-flash script into <head> so it stops being a render-blocking request
13. Add "Related calculators" cross-link block to all 9 /tools/*.html pages
14. Add meta description to account.html and admin.html (both noindex, low impact but clean up)
15. Pick trailing-slash policy and enforce via redirect (state hubs use /, suburb pages don't) — netlify.toml
16. Confirm city-page template emits real <a> links to its 12 featured suburbs — templates/city-page.html
17. Harden password reset: 8-char alphanumeric codes + 5-attempt-per-code lockout — auth.js:333, 775
18. Add content-type + size cap to profile photo upload; magic-byte sniff — auth.js:741
19. Drop script-src-attr 'unsafe-inline' from CSP (inline handlers already migrated) — netlify.toml:17
20. Schema-validate Nominatim response before mapping — address-suggest.js:140
21. Cap deposit >= 0 and loanAmt <= price in calculator input handling — app.js:600
22. Verify QLD FHB stamp-duty price ceiling matches current state schedule and add cap note — app.js:131
23. Document fortnightly-benefit formula in methodology.html (rate/100/26 approximation vs 13-payments/yr model) — app.js:219
24. Verify AggregateRating JSON-LD never emits on count=0 on five sample suburb pages
25. Confirm error-capture.js actually round-trips to ERRORS.json (currently empty — may be healthy or broken pipeline)
26. Add suburb-specific og:image generation (state + suburb name card) to replace favicon fallback
27. Refresh sitemap-core.xml lastmod dates when core pages change
28. Audit .netlifyignore for .env*, .git, package-lock.json, local build artefacts
29. Tighten CORS on mutating Netlify functions to https://equitysight.app (currently *)


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-
30. Comment/review moderation: make state transition + queue removal idempotent/transactional — netlify/functions/comments.js:299, reviews.js
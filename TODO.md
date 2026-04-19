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
9. Pipeline approve/reject + queue-remove in comments.js and reviews.js to avoid mid-op desync — comments.js:299, reviews.js matching section
10. Expand methodology.html to 1,200+ words (currently ~275) — SEO/AdSense E-E-A-T
11. Expand data-sources.html to 1,200+ words (currently ~249) — SEO/AdSense E-E-A-T
12. Inline site-init.js theme-flash script into <head> so it stops being a render-blocking request
13. Add "Related calculators" cross-link block to all 9 /tools/*.html pages
17. Harden password reset: 8-char alphanumeric codes + 5-attempt-per-code lockout — auth.js:333, 775
18. Add content-type + size cap to profile photo upload; magic-byte sniff — auth.js:741
26. Add suburb-specific og:image generation (state + suburb name card) to replace favicon fallback
30. Need to create a better blog post editor in the admin page, something more professional with more features and a way to add posts to different sections like tool, suburb or other blog content etc.
31. The Blog page on main site needs to be laid out like other proffesional blog sites, we need to upgrade this to be better.


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-
32. Comment/review moderation: make state transition + queue removal idempotent/transactional — netlify/functions/comments.js:299, reviews.js

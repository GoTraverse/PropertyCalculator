Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

General - (DO NOT REMOVE THIS LINE)
-
1. Migrate session token to HttpOnly Secure cookie (Security - High) — Phase 1+2+3a DONE (all server functions read es_session cookie; Authorization header removed from admin.js, account.js, pricing.js, blog-comments.js, suburb-reviews.js, and 2 inline calls in app.js). Phase 3b TODO: refactor app.js `getAuthHeader()` — currently used as both login guard and header builder across 20+ call sites; split into `isLoggedIn()` guard + remove remaining Authorization headers; then stop storing token in localStorage and remove token from auth response bodies.
2. Convert screenshots to WebP format (Performance - High) — requires cwebp or similar tool
3. Create 1200x630px OG social sharing image (SEO - High) — requires image editor


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-
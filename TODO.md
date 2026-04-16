Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

General - (DO NOT REMOVE THIS LINE)
-
1. Migrate session token to HttpOnly Secure cookie (Security - High) — Phase 1 DONE (auth.js now sets HttpOnly `es_session` cookie on signin/verifyEmail/googleSignin, clears on signout/deleteAccount, verifyToken reads cookie first then falls back to Authorization header; client still stores token in localStorage for backward compat). Phase 2 TODO: update client to stop storing token/stop sending Authorization header, extend cookie reading to the other 13 netlify/functions/*.js files, then remove the body `token` field from auth responses.
2. Convert screenshots to WebP format (Performance - High) — requires cwebp or similar tool
3. Create 1200x630px OG social sharing image (SEO - High) — requires image editor


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-



Tracking features: ✅ ALL DONE
- ✅ Pre-signup page trail — site-init.js records pages visited in localStorage (max 20), sent on signup/googleSignin, stored in user record as signupPageTrail, shown in admin user details under "Signup Page Trail" collapsible section.
- ✅ Feature usage tracking — track action in auth.js with Redis HINCRBY, 10 whitelisted events (recalc, pdf_export, save/load_scenario, tab_switch, pro_upgrade_prompt, etc.), 30s client debounce + 60/min IP rate limit, shown in admin user details under "Feature Usage" collapsible section.
- ✅ Last Active tracking — lastActiveAt field updated on verify calls (hourly throttle), separate from lastLoginAt (only set on real sign-ins), shown in admin user details.


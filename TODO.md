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



Tracking features:
- When a user signs up, need to know all the pagesthey came from so i can see that under the user section in admin portal.
- Once they are signed up i need to know what features are being used in the app etc.
- I need to not only know the last sign in from a user but when they are last active date and time, so they could still be logged in but refresh a page after not being on my app for a day.


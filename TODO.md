Please read this file to see what needs to be done.
Once a task is complete, remove the line from this file.

Do urgent tasks first. Urgent tasks have a "!" at the start of the line after the number.
Claude, only tackle the jobs in chunks you beleive you can finish well. I have limited Claude tokens so make sure you optimise your responses for this. i dont need to see super verbose output as long as you make the changes correctly and tell me its done and update this file.


Never delete anything above this line.
------------------------------------------

General - (DO NOT REMOVE THIS LINE)
-
1. Migrate session token to HttpOnly Secure cookie (Security - High) — Phase 1+2 DONE (all 7 non-auth functions now read es_session cookie first, falling back to Authorization header; client still sends Authorization header for backward compat). Phase 3 TODO: update client to stop sending Authorization header + stop storing token in localStorage, then remove token from auth response bodies.
2. Convert screenshots to WebP format (Performance - High) — requires cwebp or similar tool
3. Create 1200x630px OG social sharing image (SEO - High) — requires image editor


Desktop - (DO NOT REMOVE THIS LINE)
-

PWA/MOBILE- (DO NOT REMOVE THIS LINE)
-

Admin Portal- (DO NOT REMOVE THIS LINE)
-
# CLAUDE.md — Working Notes for Claude Code

## Project Summary
**EquitySight.app** — static HTML/CSS/JS site on Netlify. No build step, no framework. Push to git → auto-deploys.

See `CODEBASE.md` for full architecture, file map, auth patterns, and conventions.

## Git Branch
All Claude work goes on branch "main".
Read from main and push changes to main.

## Task Tracking
`TODO.md` is the source of truth for outstanding work. After completing a task, **remove its line** from the file. Urgent tasks are marked with `!`.

## Key Files at a Glance
| File | What it does |
|------|-------------|
| `app.js` | Main calculator — `recalc()` is master fn, `showTab()` for tabs |
| `auth-nav.js` | Injects nav + help modal into every page |
| `footer.js` | Injects footer into every page |
| `shared.css` | Design tokens (CSS custom properties), nav, footer styles |
| `error-capture.js` | Captures JS errors → sends to `client-errors` function |
| `netlify/functions/` | Serverless backend (auth, scenarios, stripe, contact, etc.) |

## Common Patterns
- **XSS**: always use `escHtml()` before inserting user data into HTML
- **Pro gate**: check `isPro()` before enabling premium features
- **Session**: `propCalc_session_v1` in localStorage → `{ id, email, name, plan, token, role }`
- **Auth guard**: inline `<script>` at top of `<head>` on every authenticated page
- **Nav**: `.site-nav-actions` div filled by `auth-nav.js`; `window.renderSiteNav()` to re-render

## Dev Workflow
1. Edit files directly (no build)
2. Test in browser — check both desktop and mobile (600px breakpoint)
3. Check Firefox compatibility (no invalid escape sequences, CSP issues)
4. Commit + push → Netlify deploys automatically

## Known Gotchas
- CSP in `netlify.toml` must be updated if new external domains are fetched
- Admin pages hide `.site-nav-links` and `.nav-hamburger` — profile icon stays via `grid-column:3`
- Profile dropdown uses `position:fixed` to avoid `backdrop-filter` stacking context clipping
- Firefox is stricter about JS syntax than Chrome — test there for escape sequence errors

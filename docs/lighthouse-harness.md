# Lighthouse harness

Wired up so Claude Code on the web can run real Lighthouse audits against this
repo's static pages without needing a manual setup each session.

## What's installed

- **Lighthouse** (`^12.x`) — the official Google performance auditor
- **`@puppeteer/browsers`** — manages a stable Chrome-for-Testing binary
- **`serve`** — small static-file server, used to host the repo locally so
  Lighthouse has something to crawl

All three live under `.claude/tooling/` (git-ignored, never deployed) and are
installed by `.claude/hooks/session-start.sh` on every fresh web session.

## How it runs

| Trigger | What happens |
| --- | --- |
| First Claude Code on the web session after this lands on `main` | `session-start.sh` runs — `npm install` + Puppeteer Chrome download. ~30–90 s on first run. |
| Subsequent sessions | The Claude container caches `.claude/tooling/`, so subsequent boots are near-instant (the hook detects existing installs and exits early). |
| Local dev on a laptop | The hook checks `CLAUDE_CODE_REMOTE` and exits early — your local machine is unaffected. Run Lighthouse locally with `npx lighthouse` if you want. |

## How to use it

From inside a Claude Code on the web session:

```bash
# Audit a default URL set (homepage, /tools/, QLD stamp duty calc, methodology)
bin/lighthouse-local.sh

# Audit a single path
bin/lighthouse-local.sh /tools/rental-yield-calculator

# Audit multiple paths
bin/lighthouse-local.sh / /pricing /tools/stamp-duty-calculator-qld
```

Reports land in `.claude/tooling/lh-reports/`:

- `<slug>.json` — full Lighthouse JSON (consumable by scripts)
- `<slug>.html` — visual HTML report
- `summary.tsv` — tab-separated scores + Core Web Vitals across every URL
  audited in the run

## Auditing suburb / state-hub / blog pages

`/invest/qld/`, `/suburb/{state}/{slug}/`, and `/blog/<post>/` are
build-time-generated and not in the source tree. To audit them, run the
build first:

```bash
node build.js                                   # uses cache when available
REBUILD_SUBURBS=true SKIP_ABS_FETCH=true node build.js   # full local rebuild
bin/lighthouse-local.sh /invest/qld/ /suburb/vic/clyde-north/
```

## Why it audits localhost, not equitysight.app

The Anthropic web sandbox proxy blocks general outbound HTTP — `equitysight.app`
returns "Host not in allowlist". The proxy DOES allow `npm` and Puppeteer's
Chrome CDN, so the install path works, but the audit URL must be a localhost
the sandbox itself is hosting.

Practically this means:

- ✅ Catches **HTML structure** issues — titles, meta descriptions, canonical,
  alt text, heading hierarchy, link targets, contrast.
- ✅ Catches **lab-grade Performance** issues — render-blocking JS, oversized
  images, layout shifts, font-loading regressions.
- ❌ Does NOT measure CDN/edge effects (Netlify's compression, HTTP/3,
  geo-distribution).
- ❌ Does NOT measure third-party scripts that only load against the prod
  origin (Stripe, AdSense, Google Analytics).

For real-world Performance + CWV numbers (with CDN, third-parties, real geo),
run from your laptop:

```bash
npx lighthouse https://equitysight.app/ \
  --output html --output-path=./lh-prod.html \
  --form-factor=mobile
```

Or use [PageSpeed Insights](https://pagespeed.web.dev/) for CrUX field data.

## File map

```
.claude/
  settings.json                  # registers the SessionStart hook
  hooks/
    session-start.sh             # installs Lighthouse + Chrome (idempotent)
  tooling/                       # git-ignored, never deployed
    package.json                 # pinned deps for the harness
    node_modules/                # Lighthouse + serve + @puppeteer/browsers
    chrome/                      # Puppeteer-managed Chrome for Testing
    lh-reports/                  # audit output (.json / .html / summary.tsv)
bin/
  lighthouse-local.sh            # wrapper: serve + lighthouse + score table
docs/
  lighthouse-harness.md          # this file
  lighthouse-baseline-2026-04-30.md   # baseline scores doc
```

## Customisation

Edit `bin/lighthouse-local.sh` to change:

- The default URL set (search for `PATHS=(`)
- The form factor (`--form-factor=mobile` → `desktop`)
- Output formats (`--output=json --output=html`)
- Chrome flags (`--chrome-flags=…`)

If you need to upgrade Lighthouse, edit `.claude/tooling/package.json` and
delete `.claude/tooling/node_modules/` — the next session-start hook run will
reinstall.

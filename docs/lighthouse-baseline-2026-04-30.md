# Lighthouse baseline — 2026-04-30

Captured via the in-repo Lighthouse harness (`bin/lighthouse-local.sh`)
that's auto-installed by `.claude/hooks/session-start.sh` in Claude Code on
the web. See [`docs/lighthouse-harness.md`](lighthouse-harness.md) for
setup details.

## Important caveat — what these numbers measure

These scores were captured against a **localhost static server** running this
repo's source files, not against `https://equitysight.app`. Anthropic's web
sandbox proxy blocks the production hostname (`Host not in allowlist`), so
audits from inside Claude Code on the web are forced to localhost.

What that means in practice:

- ✅ **HTML structure findings are accurate** — titles, meta descriptions,
  canonical, alt text, headings, link targets, contrast. SEO + Accessibility
  scores transfer directly to production.
- ✅ **Lab-grade Performance issues are accurate** — render-blocking JS,
  oversized images, layout shifts, font-loading regressions.
- ⚠️ **Network timing differs from production** — no Netlify CDN edge, no
  HTTP/3, no Brotli compression on the wire. Real-world LCP on prod is
  usually slightly faster than these local numbers.
- ❌ **Third-party scripts not measured** — Stripe / AdSense / GA only load
  against the prod origin. Their Performance impact won't show up here.

For the production-truth numbers, run from a laptop with a real browser:

```bash
npx lighthouse https://equitysight.app/ \
  --output html --output-path=./lh-prod.html \
  --form-factor=mobile
```

Or use [PageSpeed Insights](https://pagespeed.web.dev/) for CrUX field data.

## Localhost lab baseline (mobile, simulated slow 4G)

Captured 2026-04-30 with Lighthouse 12, Chrome for Testing 138.0.7204.0.

| URL                                  | Performance | Accessibility | Best Practices | SEO |
| ------------------------------------ | ----------- | ------------- | -------------- | --- |
| `/`                                  | 100         | 94            | 96             | 100 |
| `/tools/`                            | 100         | 93            | 96             | 100 |
| `/tools/stamp-duty-calculator`       | 100         | 95            | 96             | 100 |
| `/tools/stamp-duty-calculator-qld`   | 99          | 95            | 96             | 100 |
| `/tools/rental-yield-calculator`     | 100         | 95            | 96             | 100 |
| `/tools/cost-of-purchase-calculator` | 100         | 88            | 96             | 100 |
| `/methodology`                       | 77          | 90            | 96             | 100 |
| `/data-sources`                      | 76          | 90            | 96             | 100 |
| `/pricing`                           | 100         | 94            | 96             | 100 |
| `/about`                             | 100         | 93            | 96             | 100 |

### Core Web Vitals

| URL                                  | LCP    | CLS   | TBT   |
| ------------------------------------ | ------ | ----- | ----- |
| `/`                                  | 1393ms | 0.000 | 0ms   |
| `/tools/`                            | 1385ms | 0.002 | 0ms   |
| `/tools/stamp-duty-calculator`       | 1384ms | 0.002 | 25ms  |
| `/tools/stamp-duty-calculator-qld`   | 1501ms | 0.047 | 36ms  |
| `/tools/rental-yield-calculator`     | 1383ms | 0.002 | 21ms  |
| `/tools/cost-of-purchase-calculator` | 1385ms | 0.002 | 57ms  |
| `/methodology`                       | 1385ms | 0.640 | 0ms   |
| `/data-sources`                      | 1841ms | 0.640 | 0ms   |
| `/pricing`                           | 1383ms | 0.000 | 0ms   |
| `/about`                             | 1383ms | 0.000 | 0ms   |

CLS thresholds: **good ≤ 0.1, needs improvement ≤ 0.25, poor > 0.25**.

## Findings

### SEO — 100/100 across every audited page

Confirms the Task 1 + Task 9 title/meta rewrites land cleanly. No missing
descriptions, no duplicate titles, no missing canonical, no missing alt text,
no broken structured data.

### Accessibility — 88–95 range, lowest on `/tools/cost-of-purchase-calculator`

Worth a follow-up audit on cost-of-purchase. Common a11y dings on calculator
pages: form inputs missing labels, insufficient colour contrast on the
disabled state of "Calculate" buttons, or missing `aria-live` on dynamic
result regions. None blocking but a quick win.

### Performance + CLS — `/methodology` and `/data-sources` are broken

CLS **0.640** on both pages — far above the 0.1 "Good" threshold. Root cause
verified via Lighthouse `layout-shifts` audit:

> Single layout shift of 0.64 on `body > div.legal-body` (8448 px tall block)

The legal page architecture renders an empty `<div class="legal-body">`
shell, then `legal.js` fetches the markdown file at runtime and injects
parsed HTML. The injection happens after first paint, so the entire 8000 px
of content slams into place all at once.

**Affects: `/methodology`, `/data-sources`, `/privacy`, `/terms`, `/cookies`,
`/disclaimer`** — all six legal-stack pages share this pattern. Only the
first two were measured here, but the others almost certainly have the same
issue.

### Stamp-duty-QLD CLS 0.047 — minor

The new Task 3 page has a barely-noticeable shift (well under 0.1). Probably
the calculator's result panel revealing on initial calc. Not actionable.

## Top 3 fixable opportunities

1. **Pre-render the legal pages at build time** (high impact). Move legal
   markdown rendering out of `legal.js` and into a build script that emits
   pre-populated HTML — same pattern as `build/build-blog.js`. Eliminates
   the CLS 0.640 on six pages and lifts their Performance from 76–77 to
   ~95+. Estimated effort: 1 PR, 200–400 lines.

2. **A11y audit pass on `/tools/cost-of-purchase-calculator`** (low impact,
   small fix). Lighthouse's accessibility audit JSON in
   `.claude/tooling/lh-reports/tools_cost-of-purchase-calculator.report.json`
   pinpoints the specific control(s) that fail. Target: 88 → 95+.

3. **Re-baseline against production** (validation). The localhost numbers
   above are lab-grade. Run the same 10-URL set against `https://equitysight.app`
   from a laptop and append to the cadence table. CDN + HTTP/3 should knock
   ~100–300 ms off LCP across the board; the CLS finding will be identical.

## Re-baseline cadence

Re-run on the same 10 URLs every 4 weeks (or after any major template change)
and append rows below. Catches regressions early.

| Date       | Source     | Pages audited | Notable change |
| ---------- | ---------- | ------------- | -------------- |
| 2026-04-30 | localhost  | 10            | Initial baseline. Found CLS 0.640 on legal-stack pages. |

## How to reproduce

```bash
# from inside Claude Code on the web (after the SessionStart hook runs once)
bin/lighthouse-local.sh \
  / /tools/ \
  /tools/stamp-duty-calculator /tools/stamp-duty-calculator-qld \
  /tools/rental-yield-calculator /tools/cost-of-purchase-calculator \
  /methodology /data-sources /pricing /about

# Reports written to .claude/tooling/lh-reports/<slug>.report.{json,html}
# Summary table: .claude/tooling/lh-reports/summary.tsv
```

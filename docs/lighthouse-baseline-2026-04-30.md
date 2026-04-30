# Lighthouse baseline — 2026-04-30

Saved as part of the Apr 2026 SEO CTR fix push (P2 task 10). The actual
Lighthouse run requires Chrome + the `lighthouse` CLI, which the deploy
sandbox does not have available. Anyone with `npx` and a recent Chrome can
generate the live numbers and replace the placeholder rows below.

## How to run

```bash
# from your laptop, against production (or staging URL)
npx lighthouse https://equitysight.app/                                --output html --output-path=./lh-home.html       --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile
npx lighthouse https://equitysight.app/invest/qld/                     --output html --output-path=./lh-qld.html        --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile
npx lighthouse https://equitysight.app/suburb/vic/clyde-north/         --output html --output-path=./lh-clyde-north.html --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile
```

Run on a quiet network. Repeat each URL 3 times and take the median to filter
network jitter.

## Pages audited

The three highest-impression page archetypes per Apr 2026 GSC data:

1. **Homepage** — `/` (canonical landing, brand queries)
2. **State hub** — `/invest/qld/` (QLD ranks best in this template; baseline
   for the rest after Task 6 enrichment)
3. **Suburb page** — `/suburb/vic/clyde-north/` (representative of the 14,512
   generated suburb pages — 366 impr / pos 7 / 0 clicks pre-Task 1)

## Baseline scores (mobile, simulated slow 4G)

> Replace `?` placeholders with the actual scores once `npx lighthouse` runs.

| URL                          | Performance | Accessibility | Best Practices | SEO |
| ---------------------------- | ----------- | ------------- | -------------- | --- |
| `/`                          | ?           | ?             | ?              | ?   |
| `/invest/qld/`               | ?           | ?             | ?              | ?   |
| `/suburb/vic/clyde-north/`   | ?           | ?             | ?              | ?   |

## Core Web Vitals (LCP / INP / CLS)

| URL                          | LCP   | INP   | CLS   |
| ---------------------------- | ----- | ----- | ----- |
| `/`                          | ?     | ?     | ?     |
| `/invest/qld/`               | ?     | ?     | ?     |
| `/suburb/vic/clyde-north/`   | ?     | ?     | ?     |

CrUX (Chrome User Experience) field data is preferred where available — drop
the URL into [PageSpeed Insights](https://pagespeed.web.dev/) to see real-user
75th-percentile values from the last 28 days alongside the lab numbers.

## Static review — perf-impacting config already in place

A read of the source HTML / config confirms several common Lighthouse wins
are already wired:

- **Font loading**: `<link rel="preconnect">` to `fonts.googleapis.com` +
  `fonts.gstatic.com` followed by `<link rel="preload" as="style">` for the
  Google Fonts stylesheet — verified across all 33 root + tool HTML pages
  (PR #197 round 5).
- **Script loading**: `defer` on every `<script src=…>` tag in the document
  head (gtag, analytics, site-init, font-loader, etc.) — verified by grep.
- **Service worker** (`service-worker.js`): pre-caches all 14 tool URLs +
  `/tools` for offline first-visit (round 4) and uses stale-while-revalidate
  for the `/.netlify/functions/market-data` GET endpoint (round 2).
- **CSP**: configured in `netlify.toml` — limits external requests to the
  audited allowlist (Stripe, Google Fonts, ABS endpoints).
- **Image optimisation**: 13 hero/showcase screenshots ship as WebP (round
  2 conversion saved 2.3 MB). `og-image.png` rasterised from SVG @ 1200x630,
  65 KB.
- **Reduced motion**: `shared.css` has a `prefers-reduced-motion` block that
  disables animations, transitions, and smooth scroll.
- **A11y**: `aria-live="polite"` on every `.tool-result` container (round 4),
  `aria-selected` wired into all tab switchers.

These cover the most-cited Lighthouse opportunities (font preloading, render-
blocking JS, layout-shift from web-fonts, modern image formats). The expected
mobile Performance score should be in the 85–95 band; if it's below 80, the
likely culprits are:

- Third-party scripts (Stripe, AdSense, gtag) — bytes-on-wire we don't
  control. Lighthouse blames us regardless.
- The Google Fonts request — even with preload it's two round-trips. Self-
  hosting `Playfair Display` + `DM Sans` would likely lift the score 3–5
  points but cost cache portability.
- Suburb pages render an inline SVG locator card per page — verify that the
  per-page payload stays under ~80 KB.

## Top 3 fixable opportunities (to populate after first run)

1. _(populate after run)_
2. _(populate after run)_
3. _(populate after run)_

## Re-baseline cadence

Re-run on the same three URLs every 4 weeks (or after any major suburb-page
template change) and append the row to this file rather than overwriting.
Compare deltas to catch regressions early.

| Date       | Page                   | Performance | LCP   | INP   | CLS   |
| ---------- | ---------------------- | ----------- | ----- | ----- | ----- |
| 2026-04-30 | _(baseline pending)_   | -           | -     | -     | -     |

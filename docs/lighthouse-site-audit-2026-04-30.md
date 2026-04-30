# Lighthouse site audit — 2026-04-30

Captured via `bin/lighthouse-local.sh` (Lighthouse 12, Chrome for Testing 138, mobile profile, simulated slow 4G) against a localhost static server hosting this repo. Production caveat: Anthropic's web sandbox blocks `equitysight.app` so audits run against a local copy. CDN/edge effects (Brotli, HTTP/3, geo) are not measured; everything else (HTML structure, SEO, a11y, lab Performance, CWV) transfers directly to production. See [`docs/lighthouse-baseline-2026-04-30.md`](lighthouse-baseline-2026-04-30.md) for the smaller initial baseline.

**Pages audited:** 43

## Per-archetype averages

| Archetype | n | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Homepage | 1 | 100 | 94 | 96 | 100 | 1409 ms | 0.000 | 0 ms |
| Tools landing | 1 | 100 | 93 | 96 | 100 | 1385 ms | 0.002 | 0 ms |
| Calculator pages | 15 | 100 | 94 | 96 | 100 | 1400 ms | 0.013 | 32 ms |
| Top-level pages | 11 | 87 | 91 | 96 | 85 | 1629 ms | 0.349 | 0 ms |
| State hub pages | 8 | 100 | 94 | 96 | 100 | 1573 ms | 0.000 | 0 ms |
| City pages | 3 | 100 | 93 | 96 | 100 | 1537 ms | 0.000 | 0 ms |
| Suburb pages | 4 | 100 | 96 | 96 | 92 | 1384 ms | 0.000 | 0 ms |

## Worst pages (by Performance, ascending)

Pages most likely to need fixes are at the top.

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/cookies` | 77 | **90** | **96** | 69 | 1768 ms | `0.640` | 0 ms |
| `/data-sources` | 77 | **90** | **96** | **100** | 1383 ms | `0.640` | 0 ms |
| `/disclaimer` | 77 | **90** | **96** | 69 | 1769 ms | `0.640` | 0 ms |
| `/methodology` | 77 | **90** | **96** | **100** | 1385 ms | `0.640` | 0 ms |
| `/privacy` | 77 | **90** | **96** | 69 | 1696 ms | `0.640` | 0 ms |
| `/terms` | 77 | **90** | **96** | 69 | 1694 ms | `0.640` | 0 ms |
| `/tools/first-home-buyer-grants-calculator` | **98** | **95** | **96** | **100** | 1387 ms | **0.076** | 29 ms |
| `/showcase` | **98** | **93** | **96** | **100** | 2185 ms | **0.000** | 0 ms |
| `/invest/nsw/` | **98** | **94** | **96** | **100** | 1834 ms | **0.000** | 0 ms |
| `/tools/equity-release-calculator` | **99** | **94** | **96** | **100** | 1383 ms | **0.048** | 0 ms |
| `/tools/stamp-duty-calculator-qld` | **99** | **95** | **96** | **100** | 1386 ms | **0.047** | 30 ms |
| `/404` | **99** | 89 | **96** | 54 | 1883 ms | **0.000** | 0 ms |

Legend: **bold** = Good (≥ 90 / CLS ≤ 0.1), _italic_ = Needs improvement (CLS 0.1–0.25), `code` = Poor (< 50 / CLS > 0.25).

## Full results by archetype

### Homepage

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | **100** | **94** | **96** | **100** | 1409 ms | **0.000** | 0 ms |

### Tools landing

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/tools/` | **100** | **93** | **96** | **100** | 1385 ms | **0.002** | 0 ms |

### Calculator pages

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/tools/borrowing-power-calculator` | **100** | **94** | **96** | **100** | 1383 ms | **0.002** | 33 ms |
| `/tools/capital-gains-calculator` | **100** | **95** | **96** | **100** | 1391 ms | **0.002** | 35 ms |
| `/tools/cost-of-purchase-calculator` | **100** | 88 | **96** | **100** | 1399 ms | **0.002** | 58 ms |
| `/tools/deposit-calculator` | **100** | **95** | **96** | **100** | 1386 ms | **0.002** | 34 ms |
| `/tools/equity-release-calculator` | **99** | **94** | **96** | **100** | 1383 ms | **0.048** | 0 ms |
| `/tools/first-home-buyer-grants-calculator` | **98** | **95** | **96** | **100** | 1387 ms | **0.076** | 29 ms |
| `/tools/house-flip-calculator` | **100** | **94** | **96** | **100** | 1384 ms | **0.002** | 12 ms |
| `/tools/interest-only-vs-principal-calculator` | **100** | **94** | **96** | **100** | 1383 ms | **0.002** | 27 ms |
| `/tools/loan-serviceability-calculator` | **100** | **95** | **96** | **100** | 1385 ms | **0.002** | 62 ms |
| `/tools/mortgage-repayment-calculator` | **100** | **95** | **96** | **100** | 1515 ms | **0.002** | 56 ms |
| `/tools/mortgage-stress-calculator` | **100** | **95** | **96** | **100** | 1429 ms | **0.002** | 34 ms |
| `/tools/renovation-cost-calculator` | **100** | **95** | **93** | **100** | 1383 ms | **0.002** | 0 ms |
| `/tools/rental-yield-calculator` | **100** | **95** | **96** | **100** | 1388 ms | **0.002** | 28 ms |
| `/tools/stamp-duty-calculator` | **100** | **95** | **96** | **100** | 1414 ms | **0.002** | 37 ms |
| `/tools/stamp-duty-calculator-qld` | **99** | **95** | **96** | **100** | 1386 ms | **0.047** | 30 ms |

### Top-level pages

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/404` | **99** | 89 | **96** | 54 | 1883 ms | **0.000** | 0 ms |
| `/about` | **100** | **93** | **96** | **100** | 1384 ms | **0.000** | 0 ms |
| `/contact` | **100** | 89 | **96** | **100** | 1385 ms | **0.000** | 0 ms |
| `/cookies` | 77 | **90** | **96** | 69 | 1768 ms | `0.640` | 0 ms |
| `/data-sources` | 77 | **90** | **96** | **100** | 1383 ms | `0.640` | 0 ms |
| `/disclaimer` | 77 | **90** | **96** | 69 | 1769 ms | `0.640` | 0 ms |
| `/methodology` | 77 | **90** | **96** | **100** | 1385 ms | `0.640` | 0 ms |
| `/pricing` | **100** | **94** | **96** | **100** | 1383 ms | **0.000** | 0 ms |
| `/privacy` | 77 | **90** | **96** | 69 | 1696 ms | `0.640` | 0 ms |
| `/showcase` | **98** | **93** | **96** | **100** | 2185 ms | **0.000** | 0 ms |
| `/terms` | 77 | **90** | **96** | 69 | 1694 ms | `0.640` | 0 ms |

### State hub pages

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/invest/act/` | **100** | **93** | **96** | **100** | 1387 ms | **0.000** | 0 ms |
| `/invest/nsw/` | **98** | **94** | **96** | **100** | 1834 ms | **0.000** | 0 ms |
| `/invest/nt/` | **100** | **93** | **96** | **100** | 1384 ms | **0.000** | 0 ms |
| `/invest/qld/` | **99** | **94** | **96** | **100** | 1688 ms | **0.000** | 0 ms |
| `/invest/sa/` | **100** | **94** | **96** | **100** | 1536 ms | **0.000** | 0 ms |
| `/invest/tas/` | **100** | **93** | **96** | **100** | 1534 ms | **0.000** | 0 ms |
| `/invest/vic/` | **99** | **94** | **96** | **100** | 1683 ms | **0.000** | 0 ms |
| `/invest/wa/` | **100** | **94** | **96** | **100** | 1534 ms | **0.000** | 0 ms |

### City pages

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/invest/nsw/sydney/` | **100** | **93** | **96** | **100** | 1537 ms | **0.000** | 0 ms |
| `/invest/qld/brisbane/` | **100** | **93** | **96** | **100** | 1534 ms | **0.000** | 0 ms |
| `/invest/vic/melbourne/` | **100** | **94** | **96** | **100** | 1540 ms | **0.000** | 0 ms |

### Suburb pages

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/suburb/act/tharwa/` | **100** | **96** | **96** | 69 | 1385 ms | **0.000** | 0 ms |
| `/suburb/nsw/blacktown/` | **100** | **96** | **96** | **100** | 1383 ms | **0.000** | 0 ms |
| `/suburb/qld/southport/` | **100** | **96** | **96** | **100** | 1385 ms | **0.000** | 0 ms |
| `/suburb/vic/north-melbourne/` | **100** | **96** | **96** | **100** | 1383 ms | **0.000** | 0 ms |

## Cross-page issues

Sorted by how many pages each issue affects. Fixing a high-count issue is high leverage.

### Browser errors were logged to the console (43 pages)

Audit ID: `errors-in-console`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Background and foreground colors do not have a sufficient contrast ratio. (43 pages)

Audit ID: `color-contrast`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Serve static assets with an efficient cache policy (43 pages)

Audit ID: `uses-long-cache-ttl`

Sample values: `13 resources found`, `11 resources found`, `12 resources found`, `7 resources found`, `14 resources found`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Eliminate render-blocking resources (43 pages)

Audit ID: `render-blocking-resources`

Sample values: `Est savings of 0 ms`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Use efficient cache lifetimes (43 pages)

Audit ID: `cache-insight`

Sample values: `Est savings of 36 KiB`, `Est savings of 35 KiB`, `Est savings of 43 KiB`, `Est savings of 42 KiB`, `Est savings of 41 KiB`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Network dependency tree (43 pages)

Audit ID: `network-dependency-tree-insight`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Render blocking requests (43 pages)

Audit ID: `render-blocking-insight`

Affects:
- `/`
- `/tools/`
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- … and 33 more

### Heading elements are not in a sequentially-descending order (21 pages)

Audit ID: `heading-order`

Affects:
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- `/tools/loan-serviceability-calculator`
- `/tools/mortgage-repayment-calculator`
- … and 11 more

### Minify JavaScript (15 pages)

Audit ID: `unminified-javascript`

Sample values: `Est savings of 2 KiB`

Affects:
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/cost-of-purchase-calculator`
- `/tools/deposit-calculator`
- `/tools/equity-release-calculator`
- `/tools/first-home-buyer-grants-calculator`
- `/tools/house-flip-calculator`
- `/tools/interest-only-vs-principal-calculator`
- `/tools/loan-serviceability-calculator`
- `/tools/mortgage-repayment-calculator`
- … and 5 more

### Avoid an excessive DOM size (11 pages)

Audit ID: `dom-size`

Sample values: `951 elements`, `14,441 elements`, `946 elements`, `10,184 elements`, `5,141 elements`

Affects:
- `/invest/act/`
- `/invest/nsw/`
- `/invest/nt/`
- `/invest/qld/`
- `/invest/sa/`
- `/invest/tas/`
- `/invest/vic/`
- `/invest/wa/`
- `/invest/nsw/sydney/`
- `/invest/qld/brisbane/`
- … and 1 more

### Forced reflow (7 pages)

Audit ID: `forced-reflow-insight`

Affects:
- `/tools/`
- `/tools/renovation-cost-calculator`
- `/about`
- `/pricing`
- `/suburb/act/tharwa/`
- `/suburb/nsw/blacktown/`
- `/suburb/qld/southport/`

### Page is blocked from indexing (6 pages)

Audit ID: `is-crawlable`

Affects:
- `/404`
- `/cookies`
- `/disclaimer`
- `/privacy`
- `/terms`
- `/suburb/act/tharwa/`

### Cumulative Layout Shift (6 pages)

Audit ID: `cumulative-layout-shift`

Sample values: `0.64`

Affects:
- `/cookies`
- `/data-sources`
- `/disclaimer`
- `/methodology`
- `/privacy`
- `/terms`

### Avoid large layout shifts (6 pages)

Audit ID: `layout-shifts`

Sample values: `1 layout shift found`

Affects:
- `/cookies`
- `/data-sources`
- `/disclaimer`
- `/methodology`
- `/privacy`
- `/terms`

### Layout shift culprits (6 pages)

Audit ID: `cls-culprits-insight`

Affects:
- `/cookies`
- `/data-sources`
- `/disclaimer`
- `/methodology`
- `/privacy`
- `/terms`

### Max Potential First Input Delay (5 pages)

Audit ID: `max-potential-fid`

Sample values: `140 ms`, `130 ms`, `150 ms`

Affects:
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/deposit-calculator`
- `/tools/mortgage-repayment-calculator`
- `/tools/stamp-duty-calculator`

### Elements with visible text labels do not have matching accessible names. (5 pages)

Audit ID: `label-content-name-mismatch`

Affects:
- `/tools/borrowing-power-calculator`
- `/tools/capital-gains-calculator`
- `/tools/deposit-calculator`
- `/tools/interest-only-vs-principal-calculator`
- `/tools/mortgage-repayment-calculator`

### Select elements do not have associated label elements. (2 pages)

Audit ID: `select-name`

Affects:
- `/tools/cost-of-purchase-calculator`
- `/contact`

### Form elements do not have associated labels (1 page)

Audit ID: `label`

Affects:
- `/tools/cost-of-purchase-calculator`

### Document doesn't use legible font sizes (1 page)

Audit ID: `font-size`

Sample values: `58.32% legible text`

Affects:
- `/tools/renovation-cost-calculator`

---

Generated by `bin/lighthouse-summarise.js` from 43 reports in `.claude/tooling/lh-reports/`. To regenerate after a fresh audit: `node bin/lighthouse-summarise.js > docs/lighthouse-site-audit-2026-04-30.md`.

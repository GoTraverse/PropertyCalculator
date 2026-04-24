# EquitySight smoke tests

Playwright-based smoke tests. Scoped to this directory so the root deploy
model (`publish = "."`) stays bundler-free.

## First-time setup

```bash
cd tests
npm install
npm run install-browsers
```

## Running

```bash
# Default: hit production (https://equitysight.app)
npm test

# Against a deploy preview
BASE_URL=https://deploy-preview-123--equitysight.netlify.app npm test

# Against Netlify dev server locally
BASE_URL=http://localhost:8888 npm run test:local
```

## What's covered

- **Core pages** — every public page returns 200, renders an `<h1>`, and
  shows the canonical 6-link site nav (Calculators / Blog / Gallery /
  Pricing / About / Support).
- **Calculators** — for each of the 14 free calculators: page loads, the
  result container has `aria-live="polite"`, clicking Calculate fills at
  least one `.tool-stat-value` (guards against CSP regressions that would
  break the JS, and against regressions in the shared `calc-btn` id).
- **CSP hygiene** — no inline `on*` attributes in any tool page, no more
  than 3 CSP violation console messages on `/`.

## CI integration

Add to any CI that has Node 20+ available:

```yaml
- run: cd tests && npm ci && npm run install-browsers && npm test
```

Reporter emits GitHub annotations automatically when `CI=true`.

## Excluded from Netlify deploy

The `tests/` directory is listed in `.netlifyignore` so it is never
uploaded to the CDN — no risk of the tests file being publicly served.

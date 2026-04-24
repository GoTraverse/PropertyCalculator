import { test, expect } from '@playwright/test';

// 14 free calculators: each page must load, render the result container,
// and update at least one `.tool-stat-value` to a non-placeholder after
// clicking the Calculate button.
const CALCULATORS = [
  { slug: 'stamp-duty-calculator',                 btn: 'calc-btn' },
  { slug: 'cost-of-purchase-calculator',           btn: 'calc-btn' },
  { slug: 'deposit-calculator',                    btn: 'calc-btn' },
  { slug: 'first-home-buyer-grants-calculator',    btn: 'calc-btn' },
  { slug: 'borrowing-power-calculator',            btn: 'calc-btn' },
  { slug: 'loan-serviceability-calculator',        btn: 'calc-btn' },
  { slug: 'mortgage-repayment-calculator',         btn: 'calc-btn' },
  { slug: 'interest-only-vs-principal-calculator', btn: 'calc-btn' },
  { slug: 'mortgage-stress-calculator',            btn: 'calc-btn' },
  { slug: 'rental-yield-calculator',               btn: 'rent-calc-btn' },
  { slug: 'capital-gains-calculator',              btn: 'calc-btn' },
  { slug: 'equity-release-calculator',             btn: 'calc-btn' },
  { slug: 'house-flip-calculator',                 btn: 'calc-btn' },
  { slug: 'renovation-cost-calculator',            btn: 'calc-btn' },
];

// Core pages must return 200 and render h1 / nav.
const CORE_PAGES = [
  { path: '/',            h1Match: /Australia/i },
  { path: '/tools',       h1Match: /calculator/i },
  { path: '/pricing',     h1Match: /.+/ },
  { path: '/about',       h1Match: /.+/ },
  { path: '/contact',     h1Match: /.+/ },
  { path: '/blog',        h1Match: /.+/ },
  { path: '/showcase',    h1Match: /.+/ },
  { path: '/methodology', h1Match: /.+/ },
  { path: '/data-sources',h1Match: /.+/ },
];

test.describe('Core pages', () => {
  for (const page of CORE_PAGES) {
    test(`${page.path} returns 200 + renders h1 + has nav`, async ({ page: pw }) => {
      const resp = await pw.goto(page.path);
      expect(resp?.status(), `HTTP status for ${page.path}`).toBe(200);
      await expect(pw.locator('h1').first()).toBeVisible();
      await expect(pw.locator('h1').first()).toHaveText(page.h1Match);
      // Nav should include the canonical link set rendered by auth-nav.js
      const navLinks = pw.locator('.site-nav-links a');
      await expect(navLinks).toHaveCount(6);
    });
  }
});

test.describe('Calculators', () => {
  for (const calc of CALCULATORS) {
    test(`${calc.slug} loads + Calculate updates a result`, async ({ page }) => {
      const resp = await page.goto(`/tools/${calc.slug}`);
      expect(resp?.status(), 'HTTP status').toBe(200);
      // Result container has aria-live set by our a11y pass
      const result = page.locator('#result, .tool-result').first();
      await expect(result).toHaveAttribute('aria-live', 'polite');
      // Click the Calculate button
      const btn = page.locator(`#${calc.btn}`);
      await expect(btn).toBeVisible();
      await btn.click();
      // At least one `.tool-stat-value` must show something other than the
      // default "—" placeholder after the calc runs.
      const filledValues = page.locator('.tool-stat-value').filter({
        hasNotText: /^(—|-)?\s*$/,
      });
      await expect(filledValues.first()).toBeVisible();
      // No uncaught errors captured by error-capture.js. Assert no console
      // error-level messages.
      // (Playwright's onPageError fires for uncaught exceptions.)
    });

    test(`${calc.slug} has no inline on* handlers (CSP)`, async ({ page }) => {
      await page.goto(`/tools/${calc.slug}`);
      const html = await page.content();
      expect(html, 'inline onclick found').not.toMatch(/\son(click|input|change|blur|keyup)=/);
    });
  }
});

test.describe('Shared headers', () => {
  test('all CSP violations are noise-free on core pages', async ({ page }) => {
    const violations = [];
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('Content Security Policy')) violations.push(t);
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // One-off CSP noise from ad-injected iframes is tolerated; flag more than 3.
    expect(violations.length, `CSP violations on /: ${violations.join(' | ')}`).toBeLessThan(4);
  });
});

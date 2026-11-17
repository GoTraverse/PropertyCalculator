#!/usr/bin/env node
/**
 * bin/make-og-images.js — renders every share (Open Graph) image at exactly
 * 1200x630 into images/og/ and images/og-image.png.
 *
 *   node bin/make-og-images.js
 *
 * Needs Playwright with Chromium (present in Claude Code cloud sessions; on a
 * laptop: `npx playwright install chromium` in a scratch folder and run with
 * NODE_PATH pointing at it). Dev-only: bin/ is never deployed.
 *
 * The earlier images were captured in a browser window whose viewport was
 * shorter than 630px, which cut the footer line off and left a blank band at
 * the bottom. This script sets the viewport itself, so that cannot recur.
 *
 * Add a page: add a row to PAGES. Keep the sub line to what the page does;
 * it is the first thing someone sees when a link is shared.
 */
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const STATES = { act: 'ACT', nsw: 'NSW', nt: 'NT', qld: 'QLD', sa: 'SA', tas: 'TAS', vic: 'VIC', wa: 'WA' };

const PAGES = [
  // [output file, title (\n = line break), sub line, url shown bottom-left]
  ['og-image.png', 'A step-by-step planner for\nbuying your first home', 'For Australian first home buyers, with 18 calculators', 'equitysight.app'],
  ['og/journey.png', 'The First Home Journey', 'Seven steps from savings to settlement, worked out on your own numbers', 'equitysight.app/journey'],
  ['og/index.png', 'Property calculators', '18 calculators for Australian buyers: stamp duty, borrowing, deposits and more', 'equitysight.app/tools'],
  ['og/stamp-duty-calculator.png', 'Stamp duty calculator', 'All 8 states and territories, with first home concessions'],
  ['og/borrowing-power-calculator.png', 'Borrowing power calculator', 'Tested at your rate plus the 3% buffer'],
  ['og/mortgage-repayment-calculator.png', 'Mortgage repayment calculator', 'Monthly, fortnightly and weekly, with extra repayments and offset'],
  ['og/deposit-calculator.png', 'Deposit calculator', 'Deposit, stamp duty, LMI and legal costs'],
  ['og/first-home-buyer-grants-calculator.png', 'First home buyer grants', 'Grants, duty concessions and federal schemes by state'],
  ['og/cost-of-purchase-calculator.png', 'Cost of purchase calculator', 'The upfront costs of buying, added up'],
  ['og/loan-serviceability-calculator.png', 'Loan serviceability calculator', 'Income, expenses and the 3% buffer'],
  ['og/mortgage-stress-calculator.png', 'Mortgage stress test', 'What a rate rise does to your repayments'],
  ['og/interest-only-vs-principal-calculator.png', 'Interest only vs principal and interest', 'Repayments and total interest for both'],
  ['og/rental-yield-calculator.png', 'Rental yield calculator', 'Gross and net yield'],
  ['og/capital-gains-calculator.png', 'Capital gains tax calculator', 'CGT on a property sale, with the 50% discount'],
  ['og/equity-release-calculator.png', 'Home equity calculator', 'Usable equity at a lender’s LVR limit'],
  ['og/house-flip-calculator.png', 'House flip calculator', 'Profit, return and holding costs'],
  ['og/renovation-cost-calculator.png', 'Renovation cost estimator', 'A rough budget by size and finish'],
  ['og/listing-price-checker.png', 'Listing price checker', 'An asking price against government suburb medians'],
  ['og/auction-budget-calculator.png', 'Auction budget calculator', 'Your maximum bid and the full cost at that bid'],
  ['og/land-tax-calculator.png', 'Land tax calculator', 'All 8 states and territories'],
  ['og/property-cashflow-calculator.png', 'Property cash flow calculator', 'Weekly cost after tax, at FY2026-27 rates'],
].concat(Object.keys(STATES).map(st =>
  ['og/stamp-duty-calculator-' + st + '.png', STATES[st] + ' stamp duty calculator', 'FY2026-27 rates and first home buyer concessions']));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// A plain card: the page's title and one line under it, the address at the
// bottom. System font, white background, no decoration.
function html(title, sub, url) {
  const longest = Math.max.apply(null, title.split('\n').map(l => l.length));
  const size = longest > 30 ? 66 : longest > 24 ? 76 : 86;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1200px; height:630px; overflow:hidden; background:#FFFFFF; color:#1C1C1E;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
.wrap { position:absolute; left:90px; right:90px; top:0; bottom:120px; display:flex; flex-direction:column; justify-content:center; }
h1 { font-size:${size}px; font-weight:700; letter-spacing:-1.5px; line-height:1.08; }
.sub { color:#55555C; font-size:32px; margin-top:26px; line-height:1.3; }
.foot { position:absolute; left:90px; right:90px; bottom:56px; padding-top:24px; border-top:2px solid #1C1C1E;
  display:flex; align-items:center; gap:16px; font-size:30px; font-weight:600; }
.foot img { width:44px; height:44px; }
</style></head><body>
<div class="wrap"><h1>${esc(title).replace(/\n/g, '<br>')}</h1><div class="sub">${esc(sub)}</div></div>
<div class="foot"><img src="data:image/svg+xml;base64,${ICON}" alt="">${esc(url || 'equitysight.app')}</div>
</body></html>`;
}

const ICON = require('fs').readFileSync(path.join(ROOT, 'images', 'icon-dark.svg')).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const [file, title, sub, url] of PAGES) {
    await page.setContent(html(title, sub, url), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(ROOT, 'images', file), type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log('wrote images/' + file);
  }
  await browser.close();
})();

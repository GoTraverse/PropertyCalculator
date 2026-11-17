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
 * Add a page: add a row to PAGES. Keep the sub line to things the page really
 * does; it is the first thing someone sees when a link is shared.
 */
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const STATES = { act: 'ACT', nsw: 'NSW', nt: 'NT', qld: 'QLD', sa: 'SA', tas: 'TAS', vic: 'VIC', wa: 'WA' };

const CALC = 'Australian property calculator';
const PAGES = [
  // [output file, eyebrow, title (\n = line break), sub line, url shown bottom-left, show the 7 steps]
  ['og-image.png', 'For Australian first home buyers', 'Your first home,\nfrom no idea to keys.', 'The First Home Journey and 18 free calculators', 'EquitySight.app', true],
  ['og/journey.png', 'Your first home, step by step', 'The First Home Journey', 'Compare government schemes, set a budget, track every deadline', 'EquitySight.app/journey', true],
  ['og/index.png', 'Australian property calculators', 'Free Property Calculators', '18 calculators: stamp duty, borrowing, deposits and more', 'EquitySight.app/tools'],
  ['og/stamp-duty-calculator.png', CALC, 'Stamp Duty Calculator', 'All 8 states and territories, with first home concessions'],
  ['og/borrowing-power-calculator.png', CALC, 'Borrowing Power Calculator', 'Tested at your rate plus the 3% buffer'],
  ['og/mortgage-repayment-calculator.png', CALC, 'Mortgage Repayment Calculator', 'Monthly, fortnightly and weekly, with extra repayments and offset'],
  ['og/deposit-calculator.png', CALC, 'Deposit Calculator', 'Deposit, stamp duty, LMI and legal costs'],
  ['og/first-home-buyer-grants-calculator.png', CALC, 'First Home Buyer Grants', 'Grants, duty concessions and federal schemes by state'],
  ['og/cost-of-purchase-calculator.png', CALC, 'Cost of Purchase Calculator', 'Every upfront cost in one total'],
  ['og/loan-serviceability-calculator.png', CALC, 'Loan Serviceability Calculator', 'Income, expenses and the 3% buffer'],
  ['og/mortgage-stress-calculator.png', CALC, 'Mortgage Stress Test', 'What a rate rise does to your repayments'],
  ['og/interest-only-vs-principal-calculator.png', CALC, 'Interest Only vs P&I', 'Repayments and total interest, side by side'],
  ['og/rental-yield-calculator.png', CALC, 'Rental Yield Calculator', 'Gross and net yield'],
  ['og/capital-gains-calculator.png', CALC, 'Capital Gains Tax Calculator', 'CGT on a property sale, with the 50% discount'],
  ['og/equity-release-calculator.png', CALC, 'Home Equity Calculator', 'Usable equity at a lender’s LVR limit'],
  ['og/house-flip-calculator.png', CALC, 'House Flip Calculator', 'Profit, return and holding costs'],
  ['og/renovation-cost-calculator.png', CALC, 'Renovation Cost Estimator', 'A rough budget range by size and finish'],
  ['og/listing-price-checker.png', CALC, 'Listing Price Checker', 'An asking price against government suburb medians'],
  ['og/auction-budget-calculator.png', CALC, 'Auction Budget Calculator', 'Your maximum bid and the full cost at that bid'],
  ['og/land-tax-calculator.png', CALC, 'Land Tax Calculator', 'All 8 states and territories'],
  ['og/property-cashflow-calculator.png', CALC, 'Property Cash Flow Calculator', 'Weekly cost after tax, at FY2026-27 rates'],
].concat(Object.keys(STATES).map(st =>
  ['og/stamp-duty-calculator-' + st + '.png', CALC, STATES[st] + ' Stamp Duty Calculator', 'FY2026-27 rates and first home buyer concessions']));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html(eyebrow, title, sub, url, steps) {
  const longest = Math.max.apply(null, title.split('\n').map(l => l.length));
  const brand = esc(url || 'EquitySight.app').replace('.app', '<span>.app</span>');
  const stops = !steps ? '' : '<div class="stops">' +
    ['✓', '✓', '3', '4', '5', '6', '7'].map((t, i) =>
      '<div class="stop' + (i < 2 ? ' done' : i === 2 ? ' here' : '') + '">' + t + '</div>').join('<div class="dash"></div>') + '</div>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Hanken+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1200px; height:630px; overflow:hidden; background:#1C1C1E; font-family:'Hanken Grotesk', system-ui, Arial, sans-serif; }
.edge { position:absolute; left:0; top:0; bottom:0; width:14px; background:#C9A84C; }
.glow { position:absolute; right:0; top:0; bottom:0; width:420px;
  background: radial-gradient(120% 90% at 100% 40%, rgba(201,168,76,0.16), rgba(201,168,76,0.03) 55%, transparent 75%); }
.wrap { position:absolute; left:90px; right:90px; top:0; bottom:0; display:flex; flex-direction:column; justify-content:center; padding-bottom:90px; }
.eyebrow { color:#C9A84C; font-size:25px; font-weight:700; letter-spacing:5px; text-transform:uppercase; margin-bottom:22px; }
h1 { font-family:'Bricolage Grotesque', 'Hanken Grotesk', sans-serif; color:#FAF7F0; font-size:${longest > 30 ? 64 : longest > 24 ? 74 : 84}px; font-weight:700; letter-spacing:-1.5px; line-height:1.05; }
.sub { color:#A8A297; font-size:30px; font-weight:400; margin-top:24px; line-height:1.3; }
.stops { display:flex; gap:14px; align-items:center; margin-top:34px; }
.stop { width:40px; height:40px; border-radius:50%; border:2px solid rgba(250,247,240,0.25); color:rgba(250,247,240,0.55);
  font-size:19px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.stop.done { background:#7B9E87; border-color:#7B9E87; color:#fff; }
.stop.here { background:#C9A84C; border-color:#C9A84C; color:#1C1C1E; box-shadow:0 0 0 7px rgba(201,168,76,0.22); }
.dash { width:26px; height:2px; background:rgba(250,247,240,0.18); border-radius:1px; }
.rule { position:absolute; left:90px; right:90px; bottom:104px; height:1px; background:rgba(250,247,240,0.16); }
.brand { position:absolute; bottom:46px; left:90px; color:#FAF7F0; font-size:30px; font-weight:700; }
.brand span { color:#C9A84C; }
.free { position:absolute; bottom:48px; right:90px; color:#A8A297; font-size:26px; }
</style></head><body>
<div class="edge"></div><div class="glow"></div>
<div class="wrap"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title).replace(/\n/g, '<br>')}</h1><div class="sub">${esc(sub)}</div>${stops}</div>
<div class="rule"></div><div class="brand">${brand}</div><div class="free">Free · no signup to start</div>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const [file, eyebrow, title, sub, url, steps] of PAGES) {
    await page.setContent(html(eyebrow, title, sub, url, steps), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(ROOT, 'images', file), type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log('wrote images/' + file);
  }
  await browser.close();
})();

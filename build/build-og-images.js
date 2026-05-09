#!/usr/bin/env node
/**
 * build-og-images.js — Generates suburb-specific Open Graph images (1200×630 PNG)
 * for indexed suburb pages. Uses the EquitySight brand palette (dark bg, gold accent).
 *
 * Called from build-suburbs.js after HTML generation.
 * Output: /suburb/{state}/{slug}/og.png alongside each index.html
 */

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');
const SUBURB_DIR = path.join(ROOT, 'suburb');

const MIN_POPULATION_FOR_INDEX = 2000;

function shouldNoindex(s) {
  if (s.tiny) return true;
  if (!s.postcode) return true;
  if ((s.population || 0) < MIN_POPULATION_FOR_INDEX) return true;
  if (!s.median_household_income) return true;
  return false;
}

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 1) + '…';
}

function buildSvg(suburb) {
  const name = escXml(suburb.suburb);
  const state = escXml(suburb.state);
  const postcode = suburb.postcode ? escXml(suburb.postcode) : '';
  const fullState = escXml(STATE_NAMES[suburb.state] || suburb.state);
  const pop = suburb.population ? Number(suburb.population).toLocaleString('en-AU') : '';
  const income = suburb.median_household_income
    ? '$' + Math.round(suburb.median_household_income / 1000) + 'k'
    : '';

  const subLine = [postcode, fullState].filter(Boolean).join(' · ');
  const statsLine = [
    pop ? `Pop ${pop}` : '',
    income ? `Income ${income}` : '',
  ].filter(Boolean).join('  ·  ');

  // Adaptive font size for long suburb names
  let fontSize = 72;
  if (name.length > 22) fontSize = 58;
  if (name.length > 30) fontSize = 48;
  if (name.length > 40) fontSize = 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="glowA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.04)"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="#1A1A1A"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <circle cx="1080" cy="100" r="260" fill="url(#glowA)"/>
  <circle cx="120" cy="550" r="200" fill="url(#glowB)"/>

  <!-- EquitySight logo top-left -->
  <g transform="translate(72,52)">
    <g transform="scale(0.35)">
      <rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
      <rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
      <rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
      <rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
      <path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
    </g>
    <text x="75" y="48" font-family="Helvetica Neue,Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#FFFFFF">Equity</text>
    <text x="192" y="48" font-family="Helvetica Neue,Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#F2C94C">Sight</text>
  </g>

  <!-- Suburb Profile label -->
  <text x="72" y="190" font-family="Helvetica Neue,Arial,sans-serif" font-weight="400" font-size="22" letter-spacing="3" fill="rgba(242,201,76,0.8)">SUBURB PROFILE</text>

  <!-- Suburb name -->
  <text x="72" y="${190 + fontSize + 20}" font-family="Helvetica Neue,Arial,sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="-2" fill="#FFFFFF">${truncateText(name, 35)}</text>

  <!-- State + postcode -->
  <text x="72" y="${190 + fontSize + 60}" font-family="Helvetica Neue,Arial,sans-serif" font-weight="400" font-size="28" fill="rgba(255,255,255,0.6)">${subLine}</text>

  <!-- Stats line -->
  ${statsLine ? `<text x="72" y="${190 + fontSize + 100}" font-family="Helvetica Neue,Arial,sans-serif" font-weight="500" font-size="24" fill="rgba(242,201,76,0.7)">${statsLine}</text>` : ''}

  <!-- Divider line -->
  <rect x="72" y="520" width="200" height="2" rx="1" fill="rgba(242,201,76,0.3)"/>

  <!-- URL -->
  <text x="72" y="560" font-family="Helvetica Neue,Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="0.5" fill="rgba(255,255,255,0.4)">equitysight.app</text>

  <!-- Ghost chart right side -->
  <g transform="translate(880,280)" opacity="0.8">
    <rect x="30" y="100" width="36" height="66" rx="10" fill="rgba(242,201,76,0.12)"/>
    <rect x="90" y="65" width="36" height="101" rx="10" fill="rgba(242,201,76,0.22)"/>
    <rect x="150" y="25" width="36" height="141" rx="10" fill="rgba(242,201,76,0.42)"/>
    <rect x="156" y="-55" width="38" height="52" rx="6" fill="#F2C94C"/>
    <path d="M 14 80 Q -4 80 12 66 L 100 -5 Q 123 -18 146 -5 L 234 66 Q 250 80 232 80 Z" fill="rgba(255,255,255,0.05)"/>
  </g>
</svg>`;
}

function generateOgImages() {
  const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const indexed = suburbs.filter(s => !shouldNoindex(s));

  console.log(`[og-images] Generating ${indexed.length} suburb og:images...`);
  let count = 0;
  let errors = 0;

  for (const s of indexed) {
    const stateLower = s.state.toLowerCase();
    const slug = s.slug;
    const dir = path.join(SUBURB_DIR, stateLower, slug);

    if (!fs.existsSync(dir)) continue;

    try {
      const svg = buildSvg(s);
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();
      fs.writeFileSync(path.join(dir, 'og.png'), pngBuffer);
      count++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.warn(`[og-images] Failed: ${s.suburb}, ${s.state}: ${e.message}`);
    }
  }

  console.log(`[og-images] Generated ${count} images` + (errors ? ` (${errors} errors)` : ''));
  return count;
}

if (require.main === module) {
  generateOgImages();
}

module.exports = { generateOgImages };

#!/usr/bin/env node
/**
 * generate-og-images.js — Creates suburb-specific OG images (1200×630 PNG)
 * for social sharing. Each card shows the suburb name, state badge, postcode,
 * and EquitySight branding on a dark gradient background matching the site's
 * design language.
 *
 * Only indexed suburbs (~3,022) get a custom image; noindexed suburbs fall
 * back to the generic /images/og-image.png.
 *
 * Usage: node build/generate-og-images.js          (standalone)
 *        require('./generate-og-images').main()     (from build.js)
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');
const OUT_DIR = path.join(ROOT, 'images', 'suburbs');

const MIN_POPULATION_FOR_INDEX = 2000;

function shouldNoindex(s) {
  if (s.tiny) return true;
  if (!s.postcode) return true;
  if ((s.population || 0) < MIN_POPULATION_FOR_INDEX) return true;
  if (!s.median_household_income) return true;
  return false;
}

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function suburbFontSize(name) {
  if (name.length <= 14) return 72;
  if (name.length <= 20) return 60;
  if (name.length <= 28) return 48;
  return 40;
}

function generateSVG(suburb, state, stateName, postcode) {
  const fs = suburbFontSize(suburb);
  const pc = postcode ? ` ${postcode}` : '';
  const nameY = 272 + fs + 12;
  const subY = nameY + 40;

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

  <!-- Logo -->
  <g transform="translate(72,52)">
    <g transform="scale(0.32)">
      <rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
      <rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
      <rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
      <rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
      <path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
    </g>
    <text x="72" y="48" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#FFFFFF">Equity</text>
    <text x="183" y="48" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#F2C94C">Sight</text>
  </g>

  <!-- State badge -->
  <g transform="translate(1020,52)">
    <rect width="108" height="44" rx="8" fill="#F2C94C"/>
    <text x="54" y="30" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="22" text-anchor="middle" fill="#1A1A1A">${escXml(state)}</text>
  </g>

  <!-- Label -->
  <text x="72" y="272" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="500" font-size="20" letter-spacing="3" fill="#F2C94C">PROPERTY PROFILE</text>

  <!-- Suburb name -->
  <text x="72" y="${nameY}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="${fs}" letter-spacing="-2" fill="#FFFFFF">${escXml(suburb)}</text>

  <!-- State + postcode -->
  <text x="72" y="${subY}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="28" fill="rgba(255,255,255,0.6)">${escXml(stateName)}${escXml(pc)}</text>

  <!-- URL -->
  <text x="72" y="590" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="0.5" fill="rgba(255,255,255,0.35)">equitysight.app</text>

  <!-- Chart mark -->
  <g transform="translate(920,340)" opacity="0.7">
    <rect x="0" y="70" width="30" height="54" rx="9" fill="rgba(242,201,76,0.15)"/>
    <rect x="50" y="38" width="30" height="86" rx="9" fill="rgba(242,201,76,0.28)"/>
    <rect x="100" y="0" width="30" height="124" rx="9" fill="rgba(242,201,76,0.55)"/>
  </g>
</svg>`;
}

async function main() {
  const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const indexed = suburbs.filter(s => !shouldNoindex(s));

  console.log(`[og-images] Generating OG images for ${indexed.length} indexed suburbs...`);

  const states = [...new Set(indexed.map(s => s.state.toLowerCase()))];
  for (const st of states) {
    fs.mkdirSync(path.join(OUT_DIR, st), { recursive: true });
  }

  let count = 0;
  const BATCH = 50;

  for (let i = 0; i < indexed.length; i += BATCH) {
    const batch = indexed.slice(i, i + BATCH);
    await Promise.all(batch.map(async (s) => {
      const svg = generateSVG(s.suburb, s.state, s.state_name, s.postcode);
      const outPath = path.join(OUT_DIR, s.state.toLowerCase(), `${s.slug}.jpg`);
      await sharp(Buffer.from(svg))
        .jpeg({ quality: 80 })
        .toFile(outPath);
    }));
    count += batch.length;
    if (count % 500 < BATCH || count === indexed.length) {
      console.log(`[og-images] ${count}/${indexed.length}`);
    }
  }

  console.log(`[og-images] Done — ${count} OG images in images/suburbs/`);
}

module.exports = { main };

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

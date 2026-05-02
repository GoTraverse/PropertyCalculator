#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SUBURBS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'suburbs.json'), 'utf8'));
const BATCH = 80;

const STATE_NAMES = {
  ACT: 'Australian Capital Territory', NSW: 'New South Wales',
  NT: 'Northern Territory', QLD: 'Queensland',
  SA: 'South Australia', TAS: 'Tasmania',
  VIC: 'Victoria', WA: 'Western Australia'
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fontSize(name) {
  if (name.length <= 14) return 72;
  if (name.length <= 22) return 60;
  if (name.length <= 30) return 50;
  return 42;
}

function svg(suburb, stateName, postcode) {
  const fs = fontSize(suburb);
  const pc = postcode ? ` • ${esc(postcode)}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs>
<radialGradient id="a" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/><stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/><stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/></radialGradient>
<pattern id="d" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.04)"/></pattern>
</defs>
<rect width="1200" height="630" fill="#1A1A1A"/>
<rect width="1200" height="630" fill="url(#d)"/>
<circle cx="1080" cy="100" r="260" fill="url(#a)"/>
<circle cx="120" cy="550" r="200" fill="url(#b)"/>
<g transform="translate(72,64)">
<g transform="scale(0.4)">
<rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
<rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
<rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
<rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
<path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
</g>
<text x="90" y="58" font-family="Helvetica Neue,Arial,sans-serif" font-weight="600" font-size="46" letter-spacing="-1.2" fill="#FFFFFF">Equity</text>
<text x="226" y="58" font-family="Helvetica Neue,Arial,sans-serif" font-weight="600" font-size="46" letter-spacing="-1.2" fill="#F2C94C">Sight</text>
</g>
<text x="72" y="340" font-family="Helvetica Neue,Arial,sans-serif" font-weight="700" font-size="${fs}" letter-spacing="-2" fill="#FFFFFF">${esc(suburb)}</text>
<text x="72" y="400" font-family="Helvetica Neue,Arial,sans-serif" font-weight="400" font-size="32" fill="#F2C94C">${esc(stateName)}${pc}</text>
<text x="72" y="460" font-family="Helvetica Neue,Arial,sans-serif" font-weight="400" font-size="22" fill="rgba(255,255,255,0.5)">Property Investment Insights</text>
<text x="72" y="560" font-family="Helvetica Neue,Arial,sans-serif" font-weight="400" font-size="22" letter-spacing="0.5" fill="rgba(255,255,255,0.5)">equitysight.app</text>
<g transform="translate(900,320)" opacity="1">
<rect x="48" y="150" width="42" height="76" rx="13" fill="rgba(242,201,76,0.15)"/>
<rect x="120" y="105" width="42" height="121" rx="13" fill="rgba(242,201,76,0.28)"/>
<rect x="192" y="60" width="42" height="166" rx="13" fill="rgba(242,201,76,0.55)"/>
<rect x="200" y="-70" width="44" height="72" rx="7" fill="#F2C94C"/>
<path d="M 22 120 Q 0 120 18 104 L 132 12 Q 160 -4 188 12 L 302 104 Q 320 120 298 120 Z" fill="rgba(255,255,255,0.07)"/>
</g>
</svg>`;
}

async function generate(s) {
  const stateName = STATE_NAMES[s.state] || s.state;
  const pc = s.postcode || '';
  const buf = Buffer.from(svg(s.suburb, stateName, pc));
  const outDir = path.join(ROOT, 'suburb', s.state.toLowerCase(), s.slug);
  if (!fs.existsSync(outDir)) return;
  await sharp(buf).png({ compressionLevel: 9, palette: true }).toFile(path.join(outDir, 'og.png'));
}

async function main() {
  console.log(`[og-images] Generating OG images for ${SUBURBS.length} suburbs...`);
  const t0 = Date.now();
  let done = 0;
  for (let i = 0; i < SUBURBS.length; i += BATCH) {
    const batch = SUBURBS.slice(i, i + BATCH);
    await Promise.all(batch.map(s => generate(s).catch(e => {
      console.warn(`[og-images] Failed: ${s.suburb} (${s.state}) — ${e.message}`);
    })));
    done += batch.length;
    if (done % 2000 === 0 || done === SUBURBS.length) {
      console.log(`[og-images] ${done}/${SUBURBS.length} done`);
    }
  }
  console.log(`[og-images] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error('[og-images]', e); process.exit(1); });

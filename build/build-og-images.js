#!/usr/bin/env node
/**
 * build-og-images.js — Generates Open Graph card PNGs for suburb, city, and
 * state hub pages. Each image is a 1200×630 dark-theme card with the
 * location name, state, and key stats.
 *
 * Called from build.js during suburb rebuilds. Requires `sharp` (installed
 * from root package.json). Gracefully skips if sharp is unavailable.
 *
 * Output:
 *   /suburb/{state}/{slug}/og.png
 *   /invest/{state}/{city-slug}/og.png
 *   /invest/{state}/og.png
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  // sharp not installed — caller should check before invoking
}

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');

const MIN_POPULATION_FOR_INDEX = 2000;

const STATE_NAMES = {
  QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};

const STATE_ACCENTS = {
  NSW: '#4A90D9',
  VIC: '#6B8FCC',
  QLD: '#C96BA8',
  WA:  '#9B7FC9',
  SA:  '#C97B7B',
  TAS: '#7BC98F',
  NT:  '#C9A97B',
  ACT: '#7B9BC9',
};

const STATE_BG2 = {
  NSW: '#1E2E45',
  VIC: '#1B2440',
  QLD: '#3A2035',
  WA:  '#2A1E35',
  SA:  '#35202A',
  TAS: '#1E3528',
  NT:  '#3A3020',
  ACT: '#1E2840',
};

const CITY_DEFS = {
  'Brisbane':        { state: 'QLD', ranges: [[4000,4179],[4300,4310]] },
  'Gold Coast':      { state: 'QLD', ranges: [[4210,4230]] },
  'Sunshine Coast':  { state: 'QLD', ranges: [[4551,4581]] },
  'Cairns':          { state: 'QLD', ranges: [[4868,4885]] },
  'Townsville':      { state: 'QLD', ranges: [[4810,4825]] },
  'Toowoomba':       { state: 'QLD', ranges: [[4350,4365]] },
  'Sydney':          { state: 'NSW', ranges: [[2000,2250]] },
  'Newcastle':       { state: 'NSW', ranges: [[2280,2330]] },
  'Wollongong':      { state: 'NSW', ranges: [[2500,2535]] },
  'Melbourne':       { state: 'VIC', ranges: [[3000,3211]] },
  'Geelong':         { state: 'VIC', ranges: [[3212,3232]] },
  'Ballarat':        { state: 'VIC', ranges: [[3350,3360]] },
  'Bendigo':         { state: 'VIC', ranges: [[3550,3560]] },
  'Perth':           { state: 'WA', ranges: [[6000,6214]] },
  'Adelaide':        { state: 'SA', ranges: [[5000,5130]] },
  'Hobart':          { state: 'TAS', ranges: [[7000,7054]] },
  'Launceston':      { state: 'TAS', ranges: [[7248,7260]] },
  'Canberra':        { state: 'ACT', ranges: [[2600,2618],[2900,2920]] },
  'Darwin':          { state: 'NT', ranges: [[800,840]] },
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  return Number(n).toLocaleString('en-AU');
}

function shouldNoindex(s) {
  if (s.tiny) return true;
  if (!s.postcode) return true;
  if ((s.population || 0) < MIN_POPULATION_FOR_INDEX) return true;
  if (!s.median_household_income) return true;
  return false;
}

function titleFontSize(name) {
  if (name.length > 26) return 48;
  if (name.length > 20) return 56;
  if (name.length > 14) return 64;
  return 72;
}

function buildSuburbSvg(s) {
  const accent = STATE_ACCENTS[s.state] || '#D4A853';
  const bg2 = STATE_BG2[s.state] || '#2A2530';
  const fontSize = titleFontSize(s.suburb);
  const nameY = fontSize <= 48 ? 230 : fontSize <= 56 ? 245 : 260;

  const stats = [];
  if (s.population) stats.push({ label: 'POPULATION', value: fmt(s.population) });
  if (s.median_household_income) stats.push({ label: 'MEDIAN INCOME', value: '$' + fmt(s.median_household_income) });
  if (s.postcode) stats.push({ label: 'POSTCODE', value: s.postcode });

  const subtitle = (STATE_NAMES[s.state] || s.state) + (s.postcode ? ' · ' + s.postcode : '');

  return cardSvg({
    label: 'SUBURB PROFILE',
    title: s.suburb,
    subtitle,
    fontSize,
    nameY,
    stats,
    accent,
    bg2,
  });
}

function buildCitySvg(cityName, state) {
  const accent = STATE_ACCENTS[state] || '#D4A853';
  const bg2 = STATE_BG2[state] || '#2A2530';
  const fontSize = titleFontSize(cityName);
  const nameY = fontSize <= 48 ? 230 : fontSize <= 56 ? 245 : 260;
  const subtitle = (STATE_NAMES[state] || state) + ' · City Investment Insights';

  return cardSvg({
    label: 'CITY INSIGHTS',
    title: cityName,
    subtitle,
    fontSize,
    nameY,
    stats: [],
    accent,
    bg2,
  });
}

function buildStateSvg(state) {
  const name = STATE_NAMES[state] || state;
  const accent = STATE_ACCENTS[state] || '#D4A853';
  const bg2 = STATE_BG2[state] || '#2A2530';
  const fontSize = titleFontSize(name);
  const nameY = fontSize <= 48 ? 230 : fontSize <= 56 ? 245 : 260;

  return cardSvg({
    label: 'STATE PROPERTY HUB',
    title: name,
    subtitle: 'Top Suburbs for Property Investment',
    fontSize,
    nameY,
    stats: [],
    accent,
    bg2,
  });
}

function cardSvg({ label, title, subtitle, fontSize, nameY, stats, accent, bg2 }) {
  let statsBlock = '';
  if (stats.length > 0) {
    statsBlock = stats.map((st, i) => {
      const x = 80 + i * 260;
      return `  <text x="${x}" y="420" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="13" font-weight="400" letter-spacing="2" fill="rgba(245,240,232,0.4)">${esc(st.label)}</text>\n  <text x="${x}" y="455" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="28" font-weight="700" fill="${accent}">${esc(st.value)}</text>`;
    }).join('\n');
  }

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="5" fill="url(#bar)"/>
  <text x="80" y="90" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="${accent}" opacity="0.8">${esc(label)}</text>
  <text x="80" y="${nameY}" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="${fontSize}" font-weight="700" fill="#F5F0E8">${esc(title)}</text>
  <text x="80" y="${nameY + 45}" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="26" font-weight="400" fill="rgba(245,240,232,0.55)">${esc(subtitle)}</text>
  ${statsBlock}
  <line x1="80" y1="535" x2="1120" y2="535" stroke="rgba(245,240,232,0.08)" stroke-width="1"/>
  <text x="80" y="575" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="20" font-weight="700" fill="${accent}">EquitySight.app</text>
  <text x="80" y="602" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="14" font-weight="400" fill="rgba(245,240,232,0.35)">Property finance, finally clear.</text>
</svg>`;
}

async function svgToPng(svgString) {
  return sharp(Buffer.from(svgString))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generateAll() {
  if (!sharp) {
    console.warn('[og-images] sharp not available — skipping og:image generation');
    return { suburbs: 0, cities: 0, states: 0 };
  }

  const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const indexed = suburbs.filter(s => !shouldNoindex(s));

  console.log(`[og-images] Generating og:images for ${indexed.length} suburbs, ${Object.keys(CITY_DEFS).length} cities, ${Object.keys(STATE_NAMES).length} state hubs...`);

  const CONCURRENCY = 20;
  let suburbCount = 0;

  // Suburb og:images — batched for memory
  for (let i = 0; i < indexed.length; i += CONCURRENCY) {
    const batch = indexed.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (s) => {
      const outDir = path.join(ROOT, 'suburb', s.state.toLowerCase(), s.slug);
      if (!fs.existsSync(outDir)) return;
      const svg = buildSuburbSvg(s);
      const png = await svgToPng(svg);
      fs.writeFileSync(path.join(outDir, 'og.png'), png);
      suburbCount++;
    }));
  }

  // City og:images
  let cityCount = 0;
  for (const [cityName, cityDef] of Object.entries(CITY_DEFS)) {
    const slug = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
    const outDir = path.join(ROOT, 'invest', cityDef.state.toLowerCase(), slug);
    if (!fs.existsSync(outDir)) continue;
    const svg = buildCitySvg(cityName, cityDef.state);
    const png = await svgToPng(svg);
    fs.writeFileSync(path.join(outDir, 'og.png'), png);
    cityCount++;
  }

  // State hub og:images
  let stateCount = 0;
  for (const state of Object.keys(STATE_NAMES)) {
    const outDir = path.join(ROOT, 'invest', state.toLowerCase());
    if (!fs.existsSync(outDir)) continue;
    const svg = buildStateSvg(state);
    const png = await svgToPng(svg);
    fs.writeFileSync(path.join(outDir, 'og.png'), png);
    stateCount++;
  }

  console.log(`[og-images] Generated ${suburbCount} suburb + ${cityCount} city + ${stateCount} state og:images`);
  return { suburbs: suburbCount, cities: cityCount, states: stateCount };
}

module.exports = { generateAll };

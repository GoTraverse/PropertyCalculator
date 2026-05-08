/**
 * build-og-images.js
 * Generates suburb-specific og:image PNGs at build time.
 * Uses @resvg/resvg-js (NAPI) for SVG → PNG conversion.
 */
const { Resvg } = require('@resvg/resvg-js');

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('en-AU');
}

function generateOgSvg(s) {
  const name = escXml(s.suburb);
  const state = escXml(s.state);
  const stateName = escXml(s.state_name);
  const pc = s.postcode ? escXml(s.postcode) : '';
  const pop = s.population ? fmtNum(s.population) : '';
  const income = s.median_household_income ? '$' + fmtNum(s.median_household_income) : '';

  const nameLen = s.suburb.length;
  const fontSize = nameLen > 32 ? 40 : nameLen > 26 ? 48 : nameLen > 20 ? 56 : 68;
  const nameY = 340;

  const locationLine = pc ? `${stateName} ${pc}` : stateName;

  const statPills = [];
  if (pop) statPills.push({ label: 'Population', value: pop });
  if (income) statPills.push({ label: 'Median Income', value: income });

  let pillsSvg = '';
  let pillX = 72;
  for (const pill of statPills) {
    const text = `${pill.label}: ${pill.value}`;
    const w = text.length * 9.5 + 32;
    pillsSvg += `
      <rect x="${pillX}" y="430" width="${w}" height="36" rx="18" fill="rgba(242,201,76,0.12)" stroke="rgba(242,201,76,0.3)" stroke-width="1"/>
      <text x="${pillX + w / 2}" y="453" font-family="Arial,Helvetica,sans-serif" font-weight="500" font-size="14" fill="rgba(255,255,255,0.8)" text-anchor="middle">${escXml(text)}</text>`;
    pillX += w + 12;
  }

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glowA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="nameClip"><rect x="60" y="${nameY - fontSize}" width="860" height="${fontSize + 20}"/></clipPath>
  </defs>

  <rect width="1200" height="630" fill="#1A1A1A"/>
  <circle cx="1080" cy="100" r="260" fill="url(#glowA)"/>
  <circle cx="120" cy="550" r="200" fill="url(#glowB)"/>

  <!-- Logo -->
  <g transform="translate(72,56)">
    <g transform="scale(0.32)">
      <rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
      <rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
      <rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
      <rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
      <path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
    </g>
    <text x="72" y="46" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="36" letter-spacing="-0.8" fill="#FFFFFF">Equity</text>
    <text x="198" y="46" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="36" letter-spacing="-0.8" fill="#F2C94C">Sight</text>
  </g>

  <!-- Suburb label -->
  <text x="72" y="240" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="18" letter-spacing="3" fill="rgba(242,201,76,0.7)" text-transform="uppercase">SUBURB INSIGHTS</text>
  <line x1="72" y1="260" x2="220" y2="260" stroke="rgba(242,201,76,0.3)" stroke-width="2"/>

  <!-- Suburb name -->
  <text x="72" y="${nameY}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" clip-path="url(#nameClip)">${name}</text>

  <!-- State + postcode -->
  <text x="72" y="${nameY + 46}" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="28" fill="#F2C94C">${escXml(locationLine)}</text>

  <!-- Stat pills -->
  ${pillsSvg}

  <!-- Footer -->
  <text x="72" y="570" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="18" fill="rgba(255,255,255,0.35)">equitysight.app</text>

  <!-- Decorative bar chart -->
  <g transform="translate(920,250)" opacity="0.6">
    <rect x="0" y="110" width="36" height="60" rx="8" fill="rgba(242,201,76,0.15)"/>
    <rect x="56" y="70" width="36" height="100" rx="8" fill="rgba(242,201,76,0.28)"/>
    <rect x="112" y="20" width="36" height="150" rx="8" fill="rgba(242,201,76,0.50)"/>
    <rect x="168" y="50" width="36" height="120" rx="8" fill="rgba(242,201,76,0.35)"/>
    <rect x="224" y="90" width="36" height="80" rx="8" fill="rgba(242,201,76,0.20)"/>
  </g>

  <!-- Decorative house silhouette -->
  <g transform="translate(940,130)" opacity="0.08">
    <path d="M 22 100 Q 0 100 18 84 L 112 10 Q 130 -4 148 10 L 242 84 Q 260 100 238 100 Z" fill="#FFFFFF"/>
  </g>
</svg>`;
}

function renderPng(svgStr) {
  const resvg = new Resvg(svgStr, {
    fitTo: { mode: 'width', value: 1200 },
  });
  return resvg.render().asPng();
}

module.exports = { generateOgSvg, renderPng };

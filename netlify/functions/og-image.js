/**
 * og-image.js — Netlify Function
 * Generates suburb-specific Open Graph images (1200×630 PNG).
 *
 * GET /.netlify/functions/og-image?suburb=Springfield&state=QLD&postcode=4300
 *
 * Returns a PNG with aggressive cache headers (90 days) since suburb
 * data rarely changes. Social crawlers (Facebook, Twitter, LinkedIn)
 * hit this once and cache the result on their side too.
 */

const { Resvg } = require('@resvg/resvg-js');

const STATE_COLORS = {
  QLD: '#E6194B',
  NSW: '#3CB44B',
  VIC: '#4363D8',
  WA:  '#F58231',
  SA:  '#911EB4',
  TAS: '#42D4F4',
  NT:  '#F032E6',
  ACT: '#BFEF45',
};

function escSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function generateSvg(suburb, state, postcode) {
  const stateUpper = (state || '').toUpperCase();
  const accent = STATE_COLORS[stateUpper] || '#F2C94C';
  const suburbDisplay = escSvg(truncate(suburb || 'Suburb', 28));
  const regionDisplay = escSvg(postcode ? `${stateUpper} ${postcode}` : stateUpper);
  const suburbFontSize = (suburb || '').length > 20 ? 56 : 64;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="gA" cx="85%" cy="15%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gB" cx="10%" cy="90%" r="45%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#1A1A1A"/>
  <rect width="1200" height="630" fill="url(#gA)"/>
  <rect width="1200" height="630" fill="url(#gB)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="5" fill="${accent}"/>

  <!-- Logo area -->
  <g transform="translate(72,56)">
    <rect x="0" y="8" width="12" height="22" rx="4" fill="rgba(255,255,255,0.25)"/>
    <rect x="20" y="0" width="12" height="30" rx="4" fill="rgba(255,255,255,0.45)"/>
    <rect x="40" y="-10" width="12" height="40" rx="4" fill="${accent}"/>
    <text x="68" y="27" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="26" letter-spacing="-0.5" fill="#FFFFFF">Equity</text>
    <text x="162" y="27" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="26" letter-spacing="-0.5" fill="${accent}">Sight</text>
  </g>

  <!-- State badge -->
  <rect x="72" y="260" width="${stateUpper.length * 20 + 32}" height="38" rx="6" fill="${accent}" opacity="0.9"/>
  <text x="88" y="286" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="18" letter-spacing="1.5" fill="#FFFFFF">${regionDisplay}</text>

  <!-- Suburb name -->
  <text x="72" y="${suburbFontSize > 56 ? 366 : 370}" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${suburbFontSize}" letter-spacing="-1.5" fill="#FFFFFF">${suburbDisplay}</text>

  <!-- Subtitle -->
  <text x="72" y="420" font-family="Helvetica,Arial,sans-serif" font-weight="400" font-size="26" fill="rgba(255,255,255,0.55)">Suburb Investment Profile</text>

  <!-- Footer -->
  <line x1="72" y1="540" x2="1128" y2="540" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="72" y="580" font-family="Helvetica,Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="0.3" fill="rgba(255,255,255,0.4)">equitysight.app</text>
  <text x="1128" y="580" font-family="Helvetica,Arial,sans-serif" font-weight="400" font-size="18" text-anchor="end" fill="rgba(255,255,255,0.3)">Property finance, finally clear.</text>

  <!-- Decorative chart bars (right side) -->
  <g transform="translate(880,160)" opacity="0.6">
    <rect x="0" y="80" width="36" height="60" rx="6" fill="rgba(255,255,255,0.06)"/>
    <rect x="56" y="50" width="36" height="90" rx="6" fill="rgba(255,255,255,0.10)"/>
    <rect x="112" y="20" width="36" height="120" rx="6" fill="${accent}" opacity="0.35"/>
    <rect x="168" y="40" width="36" height="100" rx="6" fill="rgba(255,255,255,0.08)"/>
    <rect x="224" y="60" width="36" height="80" rx="6" fill="rgba(255,255,255,0.05)"/>
  </g>
</svg>`;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const params = event.queryStringParameters || {};
  const suburb = params.suburb || 'Suburb';
  const state = params.state || '';
  const postcode = params.postcode || '';

  if (!suburb || suburb.length > 60) {
    return { statusCode: 400, body: 'Invalid suburb parameter' };
  }

  const svg = generateSvg(suburb, state, postcode);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=7776000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
    body: pngBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};

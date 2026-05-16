/**
 * og-image.js — Dynamic OG image generator for suburb pages.
 * Returns an SVG card (1200×630) branded with EquitySight styling,
 * showing suburb name, state, and postcode.
 *
 * GET /.netlify/functions/og-image?suburb=Bondi+Beach&state=NSW&postcode=2026
 *
 * Response: image/svg+xml with aggressive cache headers (immutable, 30 days).
 * Social crawlers (Facebook, Twitter, LinkedIn) hit this once; CDN caches thereafter.
 */

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  NT: 'Northern Territory', ACT: 'Australian Capital Territory'
};

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncate(text, maxWidth, fontSize) {
  const avgCharWidth = fontSize * 0.52;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

function generateSvg(suburb, state, postcode) {
  const stateName = STATE_NAMES[state] || state;
  const locationLine = postcode ? `${state} ${postcode}` : state;
  const displaySuburb = truncate(suburb, 900, 64);

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
    <text x="78" y="48" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#FFFFFF">Equity</text>
    <text x="192" y="48" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#F2C94C">Sight</text>
  </g>

  <!-- Suburb name -->
  <text x="72" y="320" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="64" letter-spacing="-2" fill="#FFFFFF">${escXml(displaySuburb)}</text>

  <!-- State + Postcode -->
  <text x="72" y="390" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="500" font-size="32" fill="#F2C94C">${escXml(locationLine)}</text>

  <!-- Full state name -->
  <text x="72" y="435" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="22" fill="rgba(255,255,255,0.5)">${escXml(stateName)}</text>

  <!-- Category label -->
  <text x="72" y="560" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="1.5" fill="rgba(255,255,255,0.35)">SUBURB INVESTMENT INSIGHTS</text>

  <!-- URL bottom-right -->
  <text x="1128" y="590" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="18" fill="rgba(255,255,255,0.35)" text-anchor="end">equitysight.app</text>

  <!-- Decorative bar chart right side -->
  <g transform="translate(920,180)" opacity="0.6">
    <rect x="0" y="100" width="28" height="50" rx="8" fill="rgba(242,201,76,0.15)"/>
    <rect x="48" y="70" width="28" height="80" rx="8" fill="rgba(242,201,76,0.28)"/>
    <rect x="96" y="35" width="28" height="115" rx="8" fill="rgba(242,201,76,0.45)"/>
    <rect x="144" y="0" width="28" height="150" rx="8" fill="#F2C94C"/>
  </g>
</svg>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' }, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = event.queryStringParameters || {};
  const suburb = (params.suburb || 'Suburb').trim();
  const state = (params.state || '').toUpperCase().trim();
  const postcode = (params.postcode || '').trim();

  if (!suburb || !state) {
    return { statusCode: 400, body: 'Missing required params: suburb, state' };
  }

  const svg = generateSvg(suburb, state, postcode);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=2592000, immutable',
      'Access-Control-Allow-Origin': '*'
    },
    body: svg
  };
};

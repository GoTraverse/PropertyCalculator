/**
 * og-image.js — Dynamic Open Graph image generator
 * Returns an SVG card branded with suburb name, state, and postcode.
 * Served with long-lived cache headers so Netlify CDN caches aggressively.
 *
 * Query params: ?suburb=NAME&state=STATE&postcode=NNNN
 * Example: /.netlify/functions/og-image?suburb=Paddington&state=QLD&postcode=4064
 */

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  NT: 'Northern Territory', ACT: 'Australian Capital Territory'
};

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function generateSvg(suburb, state, postcode, type) {
  const stateLabel = STATE_NAMES[state] || state;
  const displaySuburb = escXml(truncate(suburb, 28));
  const displayState = escXml(stateLabel);
  const displayPostcode = postcode ? escXml(postcode) : '';
  const subtitleParts = [displayState, displayPostcode].filter(Boolean).join(' · ');
  const badge = type === 'city' ? 'CITY INSIGHTS' : 'SUBURB INSIGHTS';
  const badgeWidth = type === 'city' ? 170 : 200;

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

  <!-- Logo top-left -->
  <g transform="translate(72,56)">
    <g transform="scale(0.35)">
      <rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
      <rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
      <rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
      <rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
      <path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
    </g>
    <text x="76" y="50" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#FFFFFF">Equity</text>
    <text x="195" y="50" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="-1" fill="#F2C94C">Sight</text>
  </g>

  <!-- Category badge -->
  <rect x="72" y="220" width="${badgeWidth}" height="36" rx="18" fill="rgba(242,201,76,0.15)"/>
  <text x="${72 + badgeWidth / 2}" y="244" text-anchor="middle" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="15" letter-spacing="0.8" fill="#F2C94C">${badge}</text>

  <!-- Suburb name -->
  <text x="72" y="340" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="64" letter-spacing="-2" fill="#FFFFFF">${displaySuburb}</text>

  <!-- State + postcode -->
  <text x="72" y="400" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="28" letter-spacing="0.3" fill="rgba(255,255,255,0.6)">${subtitleParts}</text>

  <!-- Domain -->
  <text x="72" y="570" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="0.5" fill="rgba(255,255,255,0.35)">equitysight.app</text>

  <!-- Decorative bars right side -->
  <g transform="translate(920,280)" opacity="0.9">
    <rect x="0" y="120" width="36" height="64" rx="10" fill="rgba(242,201,76,0.15)"/>
    <rect x="60" y="80" width="36" height="104" rx="10" fill="rgba(242,201,76,0.28)"/>
    <rect x="120" y="40" width="36" height="144" rx="10" fill="rgba(242,201,76,0.55)"/>
    <rect x="180" y="0" width="36" height="184" rx="10" fill="#F2C94C"/>
  </g>
</svg>`;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const suburb = params.suburb || 'Suburb';
  const state = (params.state || 'NSW').toUpperCase();
  const postcode = params.postcode || '';

  const type = params.type || 'suburb';
  const svg = generateSvg(suburb, state, postcode, type);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
    body: svg,
  };
};

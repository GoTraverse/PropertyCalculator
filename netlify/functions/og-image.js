const { Resvg } = require('@resvg/resvg-js');

const FONT_DIRS = [
  '/usr/share/fonts/truetype/dejavu',
  '/usr/share/fonts/truetype/liberation',
  '/usr/share/fonts',
];

const CACHE_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
};

const STATE_COLORS = {
  QLD: '#800020',
  NSW: '#1A3A5C',
  VIC: '#1B2A4A',
  WA:  '#C19A2E',
  SA:  '#B22234',
  TAS: '#2E5339',
  ACT: '#1A3A5C',
  NT:  '#CC6600',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CACHE_HEADERS, body: '' };
  }

  const p = event.queryStringParameters || {};
  const suburb = decodeURIComponent(p.suburb || 'Suburb');
  const state = (p.state || 'AU').toUpperCase();
  const postcode = p.postcode || '';
  const type = p.type || 'suburb';

  const svg = type === 'city'
    ? buildCitySVG(suburb, state)
    : type === 'state'
      ? buildStateSVG(state)
      : buildSuburbSVG(suburb, state, postcode);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontDirs: FONT_DIRS, defaultFontFamily: 'DejaVu Sans' },
  });
  const png = resvg.render().asPng();

  return {
    statusCode: 200,
    headers: CACHE_HEADERS,
    body: Buffer.from(png).toString('base64'),
    isBase64Encoded: true,
  };
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleFontSize(text) {
  const len = text.length;
  if (len > 30) return 44;
  if (len > 24) return 52;
  if (len > 18) return 60;
  return 72;
}

function buildSuburbSVG(suburb, state, postcode) {
  const accent = STATE_COLORS[state] || '#C9A84C';
  const fs = titleFontSize(suburb);
  const badge = postcode ? `${state} ${postcode}` : state;
  const bw = badge.length * 13 + 36;
  const bx = 600 - bw / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#2A2A2D"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect y="0" width="1200" height="6" fill="${accent}"/>
  <rect x="80" y="180" width="1040" height="280" rx="16" fill="#262628"/>
  <text x="600" y="295" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-size="${fs}" font-weight="bold" fill="#F5F0E8">${esc(suburb)}</text>
  <rect x="${bx}" y="320" width="${bw}" height="36" rx="18" fill="${accent}"/>
  <text x="600" y="345" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="18" fill="#F5F0E8" letter-spacing="2">${esc(badge)}</text>
  <text x="600" y="420" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="18" fill="rgba(245,240,232,0.5)">Suburb Investment Profile</text>
  <text x="600" y="565" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-size="26" fill="rgba(245,240,232,0.4)">EquitySight.app</text>
  <rect y="624" width="1200" height="6" fill="${accent}"/>
</svg>`;
}

function buildCitySVG(city, state) {
  const accent = STATE_COLORS[state] || '#C9A84C';
  const fs = titleFontSize(city);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#2A2A2D"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect y="0" width="1200" height="6" fill="${accent}"/>
  <rect x="80" y="180" width="1040" height="280" rx="16" fill="#262628"/>
  <text x="600" y="295" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-size="${fs}" font-weight="bold" fill="#F5F0E8">${esc(city)}</text>
  <rect x="540" y="320" width="120" height="36" rx="18" fill="${accent}"/>
  <text x="600" y="345" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="18" fill="#F5F0E8" letter-spacing="2">${esc(state)}</text>
  <text x="600" y="420" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="18" fill="rgba(245,240,232,0.5)">City Investment Profile</text>
  <text x="600" y="565" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-size="26" fill="rgba(245,240,232,0.4)">EquitySight.app</text>
  <rect y="624" width="1200" height="6" fill="${accent}"/>
</svg>`;
}

function buildStateSVG(state) {
  const accent = STATE_COLORS[state] || '#C9A84C';
  const names = {
    QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
    WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
    ACT: 'Australian Capital Territory', NT: 'Northern Territory',
  };
  const name = names[state] || state;
  const fs = titleFontSize(name);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#2A2A2D"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect y="0" width="1200" height="6" fill="${accent}"/>
  <rect x="80" y="180" width="1040" height="280" rx="16" fill="#262628"/>
  <text x="600" y="295" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-size="${fs}" font-weight="bold" fill="#F5F0E8">${esc(name)}</text>
  <rect x="540" y="320" width="120" height="36" rx="18" fill="${accent}"/>
  <text x="600" y="345" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="18" fill="#F5F0E8" letter-spacing="2">${esc(state)}</text>
  <text x="600" y="420" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="18" fill="rgba(245,240,232,0.5)">Property Investment Hub</text>
  <text x="600" y="565" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-size="26" fill="rgba(245,240,232,0.4)">EquitySight.app</text>
  <rect y="624" width="1200" height="6" fill="${accent}"/>
</svg>`;
}

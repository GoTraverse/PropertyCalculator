const { Resvg } = require('@resvg/resvg-js');

const STATE_NAMES = {
  qld: 'Queensland', nsw: 'New South Wales', vic: 'Victoria',
  wa: 'Western Australia', sa: 'South Australia', tas: 'Tasmania',
  act: 'Australian Capital Territory', nt: 'Northern Territory'
};

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Content-Type': 'image/png',
};

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(suburb, state, postcode) {
  const stateLabel = STATE_NAMES[state] || state.toUpperCase();
  const subtitle = postcode ? `${stateLabel} ${postcode}` : stateLabel;
  const nameLen = suburb.length;
  const fontSize = nameLen > 24 ? 56 : nameLen > 18 ? 64 : 72;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111113"/>
      <stop offset="100%" stop-color="#1C1C2E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="590" width="1200" height="40" fill="#C9A84C" opacity="0.9"/>
  <!-- House icon -->
  <polygon points="980,200 1060,140 1140,200" fill="#3A3A4A"/>
  <rect x="995" y="200" width="130" height="100" fill="#3A3A4A"/>
  <rect x="1020" y="230" width="30" height="40" fill="#C9A84C" opacity="0.7"/>
  <rect x="1070" y="230" width="30" height="40" fill="#C9A84C" opacity="0.7"/>
  <rect x="1050" y="260" width="25" height="40" fill="#C9A84C" opacity="0.5"/>
  <!-- Bar chart -->
  <rect x="1000" y="320" width="28" height="80" rx="4" fill="#C9A84C" opacity="0.6"/>
  <rect x="1040" y="290" width="28" height="110" rx="4" fill="#C9A84C" opacity="0.75"/>
  <rect x="1080" y="260" width="28" height="140" rx="4" fill="#C9A84C" opacity="0.9"/>
  <!-- Logo text -->
  <text x="80" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="#FFFFFF">Equity</text>
  <text x="208" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="#C9A84C">Sight</text>
  <!-- Suburb label -->
  <text x="80" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500" fill="#C9A84C" letter-spacing="3" text-transform="uppercase">SUBURB INSIGHTS</text>
  <!-- Suburb name -->
  <text x="80" y="${200 + fontSize + 20}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${escXml(suburb)}</text>
  <!-- State + postcode -->
  <text x="80" y="${200 + fontSize + 70}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="rgba(245,240,232,0.7)">${escXml(subtitle)}</text>
  <!-- Tagline -->
  <text x="80" y="560" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="rgba(245,240,232,0.5)">equitysight.app</text>
</svg>`;
}

function buildCitySvg(city, state) {
  const stateLabel = STATE_NAMES[state] || state.toUpperCase();
  const nameLen = city.length;
  const fontSize = nameLen > 24 ? 56 : nameLen > 18 ? 64 : 72;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111113"/>
      <stop offset="100%" stop-color="#1C1C2E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="590" width="1200" height="40" fill="#C9A84C" opacity="0.9"/>
  <polygon points="980,200 1060,140 1140,200" fill="#3A3A4A"/>
  <rect x="995" y="200" width="130" height="100" fill="#3A3A4A"/>
  <rect x="1020" y="230" width="30" height="40" fill="#C9A84C" opacity="0.7"/>
  <rect x="1070" y="230" width="30" height="40" fill="#C9A84C" opacity="0.7"/>
  <rect x="1050" y="260" width="25" height="40" fill="#C9A84C" opacity="0.5"/>
  <rect x="1000" y="320" width="28" height="80" rx="4" fill="#C9A84C" opacity="0.6"/>
  <rect x="1040" y="290" width="28" height="110" rx="4" fill="#C9A84C" opacity="0.75"/>
  <rect x="1080" y="260" width="28" height="140" rx="4" fill="#C9A84C" opacity="0.9"/>
  <text x="80" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="#FFFFFF">Equity</text>
  <text x="208" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="#C9A84C">Sight</text>
  <text x="80" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500" fill="#C9A84C" letter-spacing="3">CITY INVESTMENT GUIDE</text>
  <text x="80" y="${200 + fontSize + 20}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${escXml(city)}</text>
  <text x="80" y="${200 + fontSize + 70}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="rgba(245,240,232,0.7)">${escXml(stateLabel)}</text>
  <text x="80" y="560" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="rgba(245,240,232,0.5)">equitysight.app</text>
</svg>`;
}

function titleCase(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const type = params.type || 'suburb';
  const state = (params.state || '').toLowerCase();
  const slug = params.slug || '';

  if (!state || !slug) {
    return { statusCode: 400, body: 'Missing state or slug' };
  }

  if (!STATE_NAMES[state]) {
    return { statusCode: 400, body: 'Invalid state' };
  }

  const name = titleCase(slug);
  const postcode = params.postcode || '';

  const svg = type === 'city'
    ? buildCitySvg(name, state)
    : buildSvg(name, state, postcode);

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return {
      statusCode: 200,
      headers: CACHE_HEADERS,
      body: pngBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: 'Image generation failed: ' + err.message };
  }
};

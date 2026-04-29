const sharp = require('sharp');

const STATE_NAMES = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
};

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function suburbFontSize(name) {
  const len = name.length;
  if (len <= 12) return 72;
  if (len <= 18) return 60;
  if (len <= 25) return 50;
  return 42;
}

function buildSvg(suburb, state, stateName, postcode, type) {
  const isState = type === 'state';
  const isCity = type === 'city';

  const headline = escXml(suburb);
  const fontSize = isState ? 56 : suburbFontSize(suburb);
  const subtitleParts = [];
  if (!isState && stateName) subtitleParts.push(escXml(stateName));
  if (postcode) subtitleParts.push(escXml(postcode));
  const subtitle = subtitleParts.join(' · ');

  const tagline = isState
    ? 'State Property Market Overview'
    : isCity
      ? 'City Property Market &amp; Investment Insights'
      : 'Property Market &amp; Investment Insights';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g1" cx="90%" cy="16%" r="43%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="10%" cy="87%" r="32%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.04)"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="#1A1A1A"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <rect width="1200" height="630" fill="url(#g2)"/>

  <text x="72" y="88" font-family="Helvetica,Arial,Liberation Sans,sans-serif" font-weight="bold" font-size="34">
    <tspan fill="#FFFFFF">Equity</tspan><tspan fill="#F2C94C">Sight</tspan>
  </text>
  <text x="72" y="116" font-family="Helvetica,Arial,Liberation Sans,sans-serif" font-size="16" fill="rgba(255,255,255,0.4)" letter-spacing="0.5">equitysight.app</text>

  <rect x="72" y="260" width="80" height="4" rx="2" fill="#F2C94C"/>

  <text x="72" y="${280 + fontSize}" font-family="Helvetica,Arial,Liberation Sans,sans-serif" font-weight="bold" font-size="${fontSize}" fill="#FFFFFF">${headline}</text>

  <text x="72" y="${295 + fontSize + 40}" font-family="Helvetica,Arial,Liberation Sans,sans-serif" font-size="28" fill="#F2C94C">${subtitle}</text>

  <text x="72" y="570" font-family="Helvetica,Arial,Liberation Sans,sans-serif" font-size="18" fill="rgba(255,255,255,0.4)">${tagline}</text>

  <rect x="960" y="340" width="30" height="70" rx="8" fill="rgba(242,201,76,0.15)"/>
  <rect x="1000" y="280" width="30" height="130" rx="8" fill="rgba(242,201,76,0.28)"/>
  <rect x="1040" y="210" width="30" height="200" rx="8" fill="rgba(242,201,76,0.55)"/>
  <rect x="1080" y="140" width="30" height="270" rx="8" fill="#F2C94C"/>

  <rect x="1074" y="62" width="34" height="50" rx="5" fill="#F2C94C"/>
  <path d="M 940 200 Q 930 200 945 190 L 1040 130 Q 1060 120 1080 130 L 1175 190 Q 1190 200 1180 200 Z" fill="rgba(255,255,255,0.06)"/>
</svg>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  const params = event.queryStringParameters || {};
  const suburb = params.suburb || '';
  const state = (params.state || '').toUpperCase();
  const postcode = params.postcode || '';
  const type = params.type || 'suburb';

  if (!suburb) {
    return { statusCode: 400, body: 'Missing suburb parameter' };
  }

  const stateName = STATE_NAMES[state] || state;

  try {
    const svg = buildSvg(suburb, state, stateName, postcode, type);
    const png = await sharp(Buffer.from(svg)).png({ quality: 80, compressionLevel: 9 }).toBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
      body: png.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image error:', err);
    return {
      statusCode: 302,
      headers: { Location: 'https://equitysight.app/images/og-image.png' },
      body: '',
    };
  }
};

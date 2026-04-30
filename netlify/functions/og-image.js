/**
 * og-image.js — Dynamic Open Graph image generator.
 *
 * Renders a branded 1200×630 PNG card with suburb name, state badge,
 * and postcode. Used as the og:image URL for suburb & city pages.
 *
 * Query params:
 *   ?suburb=Paddington&state=QLD&postcode=4064
 *   ?city=Brisbane&state=QLD         (city mode)
 *
 * Returns: image/png with a 1-year cache header.
 */

const { Resvg } = require('@resvg/resvg-js');

const ORIGIN = 'https://equitysight.app';

function getCorsHeaders(event) {
  const origin = (event.headers || {}).origin || ORIGIN;
  const allowed = origin === ORIGIN || /\.netlify\.app$/.test(origin) ? origin : ORIGIN;
  return { 'Access-Control-Allow-Origin': allowed };
}

function escSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

function buildSvg({ suburb, state, postcode, city }) {
  const isCity = !!city;
  const mainText = escSvg(truncate(isCity ? city : suburb, 28));
  const stateText = escSvg(state.toUpperCase());
  const postcodeText = postcode ? escSvg(postcode) : '';
  const subtitleText = isCity ? 'City Investment Insights' : 'Suburb Property Insights';

  const mainFontSize = mainText.length > 20 ? 56 : mainText.length > 14 ? 64 : 72;

  const postcodeBlock = postcodeText ? `
    <rect x="72" y="380" width="${36 + postcodeText.length * 14}" height="36" rx="6" fill="rgba(255,255,255,0.08)"/>
    <text x="90" y="405" font-family="'DM Mono','Courier New',monospace" font-weight="400" font-size="20" fill="rgba(255,255,255,0.6)">${postcodeText}</text>
  ` : '';

  const postcodeOffset = postcodeText ? 52 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="glA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.04)"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="#1A1A1A"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <circle cx="1080" cy="100" r="260" fill="url(#glA)"/>
  <circle cx="120" cy="550" r="200" fill="url(#glB)"/>

  <!-- Logo top-left -->
  <g transform="translate(72,52)">
    <g transform="scale(0.32)">
      <rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
      <rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
      <rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
      <rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
      <path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
    </g>
    <text x="72" y="46" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="36" letter-spacing="-1" fill="#FFFFFF">Equity</text>
    <text x="185" y="46" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="36" letter-spacing="-1" fill="#F2C94C">Sight</text>
  </g>

  <!-- State badge -->
  <rect x="72" y="160" width="${32 + stateText.length * 18}" height="40" rx="8" fill="#F2C94C"/>
  <text x="${88}" y="188" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="22" fill="#1A1A1A">${stateText}</text>

  <!-- Suburb / city name -->
  <text x="72" y="${260 + (72 - mainFontSize)}" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="${mainFontSize}" letter-spacing="-2" fill="#FFFFFF">${mainText}</text>

  <!-- Subtitle -->
  <text x="72" y="310" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="24" fill="rgba(255,255,255,0.55)">${escSvg(subtitleText)}</text>

  <!-- Postcode -->
  ${postcodeBlock}

  <!-- Divider -->
  <rect x="72" y="${440 + postcodeOffset}" width="180" height="2" rx="1" fill="#F2C94C" opacity="0.5"/>

  <!-- Domain -->
  <text x="72" y="${490 + postcodeOffset}" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="0.5" fill="rgba(255,255,255,0.45)">equitysight.app</text>

  <!-- Large ghost mark right side -->
  <g transform="translate(880,280)" opacity="0.7">
    <rect x="48" y="150" width="42" height="76" rx="13" fill="rgba(242,201,76,0.15)"/>
    <rect x="120" y="105" width="42" height="121" rx="13" fill="rgba(242,201,76,0.28)"/>
    <rect x="192" y="60" width="42" height="166" rx="13" fill="rgba(242,201,76,0.55)"/>
    <rect x="200" y="-70" width="44" height="72" rx="7" fill="#F2C94C"/>
    <path d="M 22 120 Q 0 120 18 104 L 132 12 Q 160 -4 188 12 L 302 104 Q 320 120 298 120 Z" fill="rgba(255,255,255,0.07)"/>
  </g>
</svg>`;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...getCorsHeaders(event), 'Access-Control-Allow-Methods': 'GET, OPTIONS' } };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const qs = event.queryStringParameters || {};
  const suburb = (qs.suburb || '').trim();
  const city = (qs.city || '').trim();
  const state = (qs.state || '').trim();
  const postcode = (qs.postcode || '').trim();

  if (!state || (!suburb && !city)) {
    return { statusCode: 400, body: 'Missing required params: state + (suburb or city)' };
  }

  try {
    const svg = buildSvg({ suburb, state, postcode, city });
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: false },
    });
    const png = resvg.render().asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...getCorsHeaders(event),
      },
      body: png.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image render failed:', err);
    return {
      statusCode: 302,
      headers: { Location: `${ORIGIN}/images/og-image.png` },
    };
  }
};

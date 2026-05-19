/**
 * og-image.js — Netlify Function
 * Generates suburb/city/state-specific Open Graph PNG cards (1200×630).
 *
 * Query params:
 *   t  = title text (suburb, city, or state name)        [required]
 *   s  = state abbreviation (e.g. NSW, QLD)              [optional]
 *   k  = kind: suburb | city | state                     [default: suburb]
 *   p  = postcode (shown in subtitle for suburb cards)   [optional]
 *
 * Example:
 *   /.netlify/functions/og-image?t=Bondi+Beach&s=NSW&k=suburb&p=2026
 *
 * Returns a 1200×630 PNG with 1-year cache headers.
 * Falls back to /images/og-image.png on render error.
 */

const { Resvg } = require('@resvg/resvg-js');

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function titleFontSize(text) {
  const len = text.length;
  if (len <= 14) return 72;
  if (len <= 22) return 60;
  if (len <= 32) return 50;
  if (len <= 42) return 42;
  return 36;
}

function generateSVG(title, subtitle, label) {
  const t = escXml(title);
  const sub = subtitle ? escXml(subtitle) : '';
  const lbl = escXml(label);
  const fs = titleFontSize(title);
  const titleY = 260 + fs + 16;
  const subY = titleY + 44;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="gA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/>
      <stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#1A1A1A"/>
  <circle cx="1080" cy="100" r="260" fill="url(#gA)"/>
  <circle cx="120" cy="550" r="200" fill="url(#gB)"/>
  <g transform="translate(72,56)">
    <g transform="scale(0.32)">
      <rect x="40" y="125" width="18" height="32" rx="6" fill="rgba(255,255,255,0.28)"/>
      <rect x="70" y="106" width="18" height="50" rx="6" fill="rgba(255,255,255,0.52)"/>
      <rect x="100" y="82" width="18" height="74" rx="6" fill="#F2C94C"/>
      <path d="M27 77Q17 77 25 71L72 31Q84 24 96 31L143 71Q151 77 141 77Z" fill="#FFF"/>
    </g>
    <text x="72" y="44" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="36" letter-spacing="-1" fill="#FFF">Equity</text>
    <text x="183" y="44" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="36" letter-spacing="-1" fill="#F2C94C">Sight</text>
  </g>
  <text x="72" y="260" font-family="Arial,Helvetica,sans-serif" font-weight="500" font-size="22" letter-spacing="3" fill="rgba(242,201,76,0.7)">${lbl}</text>
  <text x="72" y="${titleY}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fs}" letter-spacing="-1.5" fill="#FFF">${t}</text>${sub ? `
  <text x="72" y="${subY}" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="30" letter-spacing="-0.3" fill="rgba(255,255,255,0.55)">${sub}</text>` : ''}
  <text x="72" y="580" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="20" letter-spacing="0.5" fill="rgba(255,255,255,0.3)">equitysight.app</text>
  <g transform="translate(880,260)" opacity="0.6">
    <rect x="48" y="150" width="42" height="76" rx="13" fill="rgba(242,201,76,0.15)"/>
    <rect x="120" y="105" width="42" height="121" rx="13" fill="rgba(242,201,76,0.28)"/>
    <rect x="192" y="60" width="42" height="166" rx="13" fill="rgba(242,201,76,0.55)"/>
    <path d="M22 120Q0 120 18 104L132 12Q160-4 188 12L302 104Q320 120 298 120Z" fill="rgba(255,255,255,0.04)"/>
  </g>
</svg>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const p = event.queryStringParameters || {};
  const title = (p.t || '').trim().slice(0, 80);
  const state = (p.s || '').toUpperCase().trim().slice(0, 3);
  const kind = (p.k || 'suburb').toLowerCase();
  const postcode = (p.p || '').trim().slice(0, 6);

  if (!title) {
    return { statusCode: 400, body: 'Missing title (t)' };
  }

  let label, subtitle;
  if (kind === 'state') {
    label = 'STATE INVESTMENT HUB';
    subtitle = 'Australia';
  } else if (kind === 'city') {
    label = 'CITY INVESTMENT INSIGHTS';
    subtitle = STATE_NAMES[state] || state;
  } else {
    label = 'SUBURB INVESTMENT INSIGHTS';
    const sn = STATE_NAMES[state] || state;
    subtitle = postcode ? `${sn} ${postcode}` : sn;
  }

  try {
    const svg = generateSVG(title, subtitle, label);
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
    });
    const rendered = resvg.render();
    const pngBuffer = rendered.asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000',
      },
      body: Buffer.from(pngBuffer).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image render error:', err.message);
    return {
      statusCode: 302,
      headers: { Location: '/images/og-image.png' },
    };
  }
};

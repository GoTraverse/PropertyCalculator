/**
 * og-image.js — Netlify Function
 * Generates dynamic Open Graph images for suburb, city, and state pages.
 *
 * GET /.netlify/functions/og-image?title=Brisbane&subtitle=Queensland+·+4000&label=SUBURB+INSIGHTS
 *
 * Returns a 1200×630 PNG with brand-consistent card design.
 * Falls back to redirect to generic og-image.png on error.
 */

let Resvg;
try { Resvg = require('@resvg/resvg-js').Resvg; } catch (e) { Resvg = null; }

function escSvg(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function titleFontSize(text) {
  const len = text.length;
  if (len <= 14) return 72;
  if (len <= 20) return 64;
  if (len <= 28) return 54;
  if (len <= 38) return 46;
  return 40;
}

function generateSVG(title, subtitle, label) {
  const fontSize = titleFontSize(title);
  const titleY = 300;
  const subtitleY = titleY + Math.round(fontSize * 0.95);

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#232328"/>
      <stop offset="100%" stop-color="#1C1C1E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="5" fill="#C9A84C"/>
  <text x="80" y="100" font-family="DejaVu Sans, sans-serif" font-size="17" fill="#C9A84C" font-weight="700" letter-spacing="3.5">${escSvg(label)}</text>
  <rect x="80" y="118" width="60" height="2" fill="#C9A84C" rx="1"/>
  <text x="80" y="${titleY}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize}" fill="#F5F0E8" font-weight="700">${escSvg(title)}</text>
  <text x="80" y="${subtitleY}" font-family="DejaVu Sans, sans-serif" font-size="30" fill="#F5F0E8" fill-opacity="0.55">${escSvg(subtitle)}</text>
  <rect x="80" y="480" width="100" height="2" fill="#C9A84C" fill-opacity="0.4" rx="1"/>
  <text x="80" y="530" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#F5F0E8" fill-opacity="0.35">Property Investment Insights — Australia</text>
  <text x="1120" y="590" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#C9A84C" text-anchor="end" font-weight="700">equitysight.app</text>
  <circle cx="1080" cy="180" r="100" fill="none" stroke="#C9A84C" stroke-opacity="0.06" stroke-width="1"/>
  <circle cx="1080" cy="180" r="65" fill="none" stroke="#C9A84C" stroke-opacity="0.04" stroke-width="1"/>
</svg>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } };
  }

  const params = event.queryStringParameters || {};
  const title = (params.title || '').trim();
  const subtitle = (params.subtitle || '').trim();
  const label = (params.label || 'PROPERTY INSIGHTS').trim();

  if (!title || !Resvg) {
    return { statusCode: 302, headers: { Location: '/images/og-image.png', 'Cache-Control': 'public, max-age=86400' } };
  }

  try {
    const svg = generateSVG(title, subtitle, label);
    const resvg = new Resvg(svg, {
      font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
      fitTo: { mode: 'width', value: 1200 },
    });
    const png = resvg.render().asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
      body: Buffer.from(png).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image render error:', err.message);
    return { statusCode: 302, headers: { Location: '/images/og-image.png', 'Cache-Control': 'public, max-age=3600' } };
  }
};

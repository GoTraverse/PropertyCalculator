/**
 * og-image.js — Netlify Function
 * Generates suburb/city/state-specific Open Graph images as PNG.
 *
 * GET /.netlify/functions/og-image?name=Bondi+Beach&state=NSW&pc=2026
 * GET /.netlify/functions/og-image?name=Sydney&state=NSW&type=city
 * GET /.netlify/functions/og-image?name=New+South+Wales&state=NSW&type=state
 *
 * Returns a 1200×630 PNG with aggressive cache headers (1 year).
 * Falls back to a 302 redirect to the generic og-image.png on error.
 */

const path = require('path');
const fs = require('fs');

let Resvg;
try {
  Resvg = require('@resvg/resvg-js').Resvg;
} catch {
  Resvg = null;
}

const FONT_DIR = path.join(__dirname, 'fonts');
let fontFiles = [];
try {
  const bold = path.join(FONT_DIR, 'LiberationSans-Bold.ttf');
  const regular = path.join(FONT_DIR, 'LiberationSans-Regular.ttf');
  if (fs.existsSync(bold)) fontFiles.push(bold);
  if (fs.existsSync(regular)) fontFiles.push(regular);
} catch { /* no fonts bundled */ }

function escSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fontSize(name) {
  const len = name.length;
  if (len > 32) return 38;
  if (len > 26) return 44;
  if (len > 20) return 52;
  if (len > 14) return 60;
  return 68;
}

const TAGLINES = {
  suburb: 'Property Market &amp; Investment Insights',
  city: 'City Investment Profile',
  state: 'State Property Market Overview',
};

function generateSvg(name, state, postcode, type) {
  const fz = fontSize(name);
  const tagline = TAGLINES[type] || TAGLINES.suburb;
  const subtitle = [postcode, state].filter(Boolean).join(' · ');
  const badgeW = Math.max(60, state.length * 16 + 28);
  const badgeX = 72 + badgeW / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="g1" cx="90%" cy="10%" r="55%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="10%" cy="90%" r="45%">
      <stop offset="0%" stop-color="#F2C94C" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#F2C94C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#1A1A1A"/>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <rect width="1200" height="630" fill="url(#g2)"/>
  <rect width="1200" height="5" fill="#F2C94C"/>
  <rect y="625" width="1200" height="5" fill="#F2C94C" opacity="0.4"/>
  <rect x="72" y="56" width="${badgeW}" height="38" rx="8" fill="#F2C94C"/>
  <text x="${badgeX}" y="82" font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="#1A1A1A" text-anchor="middle">${escSvg(state)}</text>
  <text x="72" y="220" font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="${fz}" fill="#FFFFFF" letter-spacing="-1.5">${escSvg(name)}</text>
  ${subtitle ? `<text x="72" y="270" font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-weight="400" font-size="26" fill="rgba(255,255,255,0.50)">${escSvg(subtitle)}</text>` : ''}
  <line x1="72" y1="400" x2="360" y2="400" stroke="#F2C94C" stroke-width="2" opacity="0.35"/>
  <text x="72" y="440" font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-weight="400" font-size="20" fill="rgba(255,255,255,0.40)">${tagline}</text>
  <text x="72" y="580" font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-weight="400" font-size="22" fill="rgba(255,255,255,0.28)">equitysight.app</text>
  <g transform="translate(1030,470)" opacity="0.18">
    <rect x="0" y="56" width="16" height="30" rx="5" fill="#F2C94C"/>
    <rect x="28" y="38" width="16" height="48" rx="5" fill="#F2C94C"/>
    <rect x="56" y="14" width="16" height="72" rx="5" fill="#F2C94C"/>
    <rect x="59" y="-32" width="17" height="27" rx="3" fill="#FFFFFF"/>
    <path d="M -8 46 Q -16 46 -6 38 L 36 8 Q 46 0 56 8 L 98 38 Q 108 46 100 46 Z" fill="rgba(255,255,255,0.85)"/>
  </g>
</svg>`;
}

const FALLBACK_URL = 'https://equitysight.app/images/og-image.png';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' } };
  }

  if (!Resvg) {
    return { statusCode: 302, headers: { Location: FALLBACK_URL, 'Cache-Control': 'public, max-age=3600' } };
  }

  const p = event.queryStringParameters || {};
  const name = (p.name || '').trim();
  const state = (p.state || '').trim().toUpperCase();
  const postcode = (p.pc || '').trim();
  const type = (p.type || 'suburb').trim();

  if (!name) {
    return { statusCode: 302, headers: { Location: FALLBACK_URL } };
  }

  const svg = generateSvg(name, state, postcode, type);

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: {
        fontFiles: fontFiles,
        defaultFontFamily: 'Liberation Sans',
        loadSystemFonts: true,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
      body: pngBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch {
    return { statusCode: 302, headers: { Location: FALLBACK_URL, 'Cache-Control': 'public, max-age=3600' } };
  }
};

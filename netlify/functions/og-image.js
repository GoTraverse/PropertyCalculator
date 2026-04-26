/**
 * og-image.js — Netlify Function
 * Generates branded 1200×630 PNG og:image cards for suburb, city, and state pages.
 *
 * GET /.netlify/functions/og-image?title=Brisbane&subtitle=QLD+4000&score=78&label=Good
 *   → 200  image/png  (1200×630 branded card)
 *
 * Query params:
 *   title    — main heading (suburb name, city name, or state name)
 *   subtitle — secondary line (e.g. "Queensland · 4000" or "8 suburbs")
 *   score    — investment score 0–100 (omit to hide badge)
 *   label    — score band label: Strong / Good / Moderate / Weak
 *
 * Cache: immutable (params are deterministic per build).
 */
'use strict';

const { Resvg } = require('@resvg/resvg-js');

const HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Content-Type': 'image/png',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function scoreFill(label) {
  if (label === 'Strong') return '#27AE60';
  if (label === 'Good')   return '#F2C94C';
  if (label === 'Moderate') return '#E67E22';
  return '#E74C3C';
}

function titleFontSize(text) {
  const len = text.length;
  if (len <= 12) return 72;
  if (len <= 20) return 62;
  if (len <= 30) return 52;
  return 42;
}

function generateSVG(title, subtitle, score, label) {
  const t = escSvg(title);
  const sub = escSvg(subtitle);
  const fontSize = titleFontSize(title);
  const titleY = score ? 320 : 340;
  const subY = titleY + fontSize + 16;

  let scoreBadge = '';
  if (score && label) {
    const fill = scoreFill(label);
    scoreBadge = `
    <g transform="translate(940,60)">
      <rect x="0" y="0" width="190" height="190" rx="20" fill="rgba(255,255,255,0.06)"/>
      <text x="95" y="100" font-family="'DM Mono','Courier New',monospace" font-weight="500" font-size="64" fill="${fill}" text-anchor="middle" dominant-baseline="middle">${score}</text>
      <text x="95" y="140" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="16" fill="rgba(255,255,255,0.5)" text-anchor="middle">/ 100</text>
      <text x="95" y="170" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="18" fill="${fill}" text-anchor="middle">${escSvg(label)}</text>
    </g>`;
  }

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
  </defs>

  <rect width="1200" height="630" fill="#1A1A1A"/>
  <circle cx="1080" cy="100" r="260" fill="url(#glowA)"/>
  <circle cx="120" cy="550" r="200" fill="url(#glowB)"/>

  <!-- Logo -->
  <g transform="translate(72,64)">
    <g transform="scale(0.4)">
      <rect x="40.4" y="124.66" width="17.64" height="31.58" rx="5.64" fill="rgba(255,255,255,0.28)"/>
      <rect x="70.14" y="105.71" width="17.64" height="50.53" rx="5.64" fill="rgba(255,255,255,0.52)"/>
      <rect x="99.88" y="82.02" width="17.64" height="74.22" rx="5.64" fill="#F2C94C"/>
      <rect x="103.32" y="27.93" width="18.48" height="29.48" rx="2.77" fill="#FFFFFF"/>
      <path d="M 26.88 77.28 Q 16.8 77.28 24.54 70.83 L 72.24 31.08 Q 84 24.36 95.76 31.08 L 143.46 70.83 Q 151.2 77.28 141.12 77.28 Z" fill="#FFFFFF"/>
    </g>
    <text x="90" y="58" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="46" letter-spacing="-1.2" fill="#FFFFFF">Equity</text>
    <text x="226" y="58" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="46" letter-spacing="-1.2" fill="#F2C94C">Sight</text>
  </g>

  ${scoreBadge}

  <!-- Title -->
  <text x="72" y="${titleY}" font-family="'Sora','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="-2" fill="#FFFFFF">${t}</text>

  <!-- Subtitle -->
  <text x="72" y="${subY}" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="26" letter-spacing="0.5" fill="rgba(255,255,255,0.6)">${sub}</text>

  <!-- Tagline -->
  <text x="72" y="580" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-weight="400" font-size="20" letter-spacing="0.5" fill="rgba(255,255,255,0.35)">equitysight.app — Property finance, finally clear.</text>

  <!-- Decorative bars -->
  <g transform="translate(900,380)" opacity="0.6">
    <rect x="48" y="100" width="36" height="64" rx="10" fill="rgba(242,201,76,0.15)"/>
    <rect x="104" y="70" width="36" height="94" rx="10" fill="rgba(242,201,76,0.28)"/>
    <rect x="160" y="35" width="36" height="129" rx="10" fill="rgba(242,201,76,0.55)"/>
  </g>

  <!-- Gold accent line -->
  <rect x="72" y="${subY + 24}" width="80" height="4" rx="2" fill="#F2C94C"/>
</svg>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const p = event.queryStringParameters || {};
  const title = (p.title || 'EquitySight').substring(0, 80);
  const subtitle = (p.subtitle || '').substring(0, 120);
  const score = parseInt(p.score, 10) || 0;
  const label = (p.label || '').substring(0, 10);

  const svg = generateSVG(title, subtitle, score > 0 ? score : 0, score > 0 ? label : '');

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: false },
    });
    const png = resvg.render().asPng();

    return {
      statusCode: 200,
      headers: { ...HEADERS, ...CORS_HEADERS },
      body: png.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000, immutable', ...CORS_HEADERS },
      body: svg,
    };
  }
};

const { Resvg, initWasm } = require('@resvg/resvg-wasm');
const { readFileSync } = require('fs');
const { join } = require('path');

let wasmInitialized = false;

async function ensureWasm() {
  if (wasmInitialized) return;
  const candidates = [
    join(__dirname, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
    join(__dirname, '..', 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
    require.resolve('@resvg/resvg-wasm/index_bg.wasm'),
  ];
  let wasmBuf;
  for (const p of candidates) {
    try { wasmBuf = readFileSync(p); break; } catch (_) {}
  }
  if (!wasmBuf) throw new Error('Could not locate resvg WASM binary');
  await initWasm(wasmBuf);
  wasmInitialized = true;
}

const STATE_COLORS = {
  QLD: '#E63946',
  NSW: '#457B9D',
  VIC: '#1D3557',
  WA: '#F4A261',
  SA: '#2A9D8F',
  TAS: '#6A994E',
  NT: '#E76F51',
  ACT: '#264653',
};

function buildSvg(suburb, state) {
  const accent = STATE_COLORS[state] || '#457B9D';
  const suburbFontSize = suburb.length > 20 ? 52 : suburb.length > 14 ? 64 : 76;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#2C2C2E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="8" fill="${accent}"/>
  <rect x="60" y="520" width="1080" height="1" fill="rgba(245,240,232,0.15)"/>
  <circle cx="100" cy="315" r="140" fill="none" stroke="${accent}" stroke-width="2" opacity="0.2"/>
  <circle cx="1100" cy="315" r="200" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.12"/>
  <text x="600" y="200" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="400" fill="rgba(245,240,232,0.6)" letter-spacing="3">SUBURB INVESTMENT PROFILE</text>
  <text x="600" y="${suburbFontSize > 60 ? 320 : 330}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${suburbFontSize}" font-weight="700" fill="#F5F0E8">${escXml(suburb)}</text>
  <rect x="${600 - (state.length * 10 + 24) / 2}" y="370" width="${state.length * 10 + 24}" height="36" rx="4" fill="${accent}"/>
  <text x="600" y="394" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#fff" letter-spacing="1.5">${escXml(state)}</text>
  <text x="80" y="570" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500" fill="rgba(245,240,232,0.8)">EquitySight.app</text>
  <text x="1120" y="570" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="rgba(245,240,232,0.5)">Property finance, finally clear.</text>
</svg>`;
}

function escXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const suburb = (params.suburb || '').trim();
  const state = (params.state || '').trim().toUpperCase();

  if (!suburb || !state) {
    return { statusCode: 400, body: 'Missing suburb or state parameter' };
  }

  try {
    await ensureWasm();

    const svg = buildSvg(suburb, state);
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: Buffer.from(pngBuffer).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image error:', err);
    return { statusCode: 500, body: 'Image generation failed' };
  }
};

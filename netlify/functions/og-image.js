const { Resvg } = require('@resvg/resvg-js');

let fontBuffers = null;

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function loadFonts() {
  if (fontBuffers) return fontBuffers;
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap',
      { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }
    ).then(r => r.text());
    const urls = [];
    const re = /url\(([^)]+\.woff2)\)/g;
    let m;
    while ((m = re.exec(css)) !== null) urls.push(m[1]);
    fontBuffers = await Promise.all(urls.map(u => fetch(u).then(r => r.arrayBuffer()).then(b => Buffer.from(b))));
  } catch (_) {
    fontBuffers = [];
  }
  return fontBuffers;
}

const STATE_ACCENT = {
  QLD: '#C45A5A', NSW: '#5B8FAB', VIC: '#7B9E87', WA: '#C9A84C',
  SA: '#C4704A', TAS: '#5A9E7B', NT: '#E8A882', ACT: '#A8C4B0',
};

function buildSvg(name, state, postcode, type) {
  const safe = esc(name);
  const sState = esc(state);
  const sPc = esc(postcode);
  const accent = STATE_ACCENT[state] || '#C9A84C';

  let fontSize = 56;
  if (name.length > 25) fontSize = 42;
  else if (name.length > 18) fontSize = 48;

  const subtitle = type === 'city'
    ? `${sState} — City Investment Guide`
    : type === 'state'
    ? `${sState} — State Property Hub`
    : `${sState}${sPc ? ' ' + sPc : ''}`;

  const tagline = type === 'city' || type === 'state'
    ? 'Australian Property Investment Hub'
    : 'Property Investment Insights';

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#1E1E20"/>
      <stop offset="100%" stop-color="#28282A"/>
    </linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.3"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="6" fill="url(#ac)"/>
  <rect y="624" width="1200" height="6" fill="url(#ac)" opacity="0.4"/>
  <rect x="880" y="80" width="240" height="240" rx="12" fill="none" stroke="${accent}" stroke-opacity="0.08" stroke-width="1.5"/>
  <rect x="920" y="120" width="240" height="240" rx="12" fill="none" stroke="${accent}" stroke-opacity="0.05" stroke-width="1.5"/>
  <circle cx="1060" cy="480" r="80" fill="none" stroke="${accent}" stroke-opacity="0.06" stroke-width="1.5"/>
  <path d="M108 248 C108 228 122 216 132 216 C142 216 156 228 156 248 C156 268 132 292 132 292 C132 292 108 268 108 248 Z" fill="${accent}" opacity="0.9"/>
  <circle cx="132" cy="246" r="7" fill="#1E1E20"/>
  <text x="172" y="270" font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#F5F0E8" letter-spacing="-0.5">${safe}</text>
  <text x="172" y="${fontSize > 48 ? 330 : 325}" font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="28" fill="${accent}" letter-spacing="1">${subtitle}</text>
  <rect x="172" y="370" width="160" height="2" rx="1" fill="${accent}" opacity="0.25"/>
  <text x="172" y="420" font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="22" fill="#F5F0E8" opacity="0.55">${tagline}</text>
  <text x="172" y="555" font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="18" fill="#F5F0E8" opacity="0.35" letter-spacing="2">EQUITYSIGHT.APP</text>
</svg>`;
}

exports.handler = async (event) => {
  const p = event.queryStringParameters || {};
  const name = (p.suburb || p.name || 'Australia').substring(0, 60);
  const state = (p.state || '').substring(0, 5).toUpperCase();
  const postcode = (p.postcode || '').substring(0, 6);
  const type = ['suburb', 'city', 'state'].includes(p.type) ? p.type : 'suburb';

  try {
    const fonts = await loadFonts();
    const svg = buildSvg(name, state, postcode, type);
    const opts = {
      fitTo: { mode: 'width', value: 1200 },
      font: { defaultFontFamily: 'DM Sans', loadSystemFonts: true },
    };
    if (fonts.length) opts.font.fontBuffers = fonts;

    const png = new Resvg(svg, opts).render().asPng();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=2592000, s-maxage=31536000',
      },
      body: Buffer.from(png).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (_) {
    return {
      statusCode: 302,
      headers: { Location: '/images/og-image.png' },
    };
  }
};

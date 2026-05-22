/**
 * og-image — Netlify Function
 * Generates suburb/city/state-specific Open Graph PNG cards (1200×630).
 *
 * GET /.netlify/functions/og-image?type=suburb&name=Brisbane+City&state=QLD&postcode=4000
 * GET /.netlify/functions/og-image?type=city&name=Brisbane&state=QLD
 * GET /.netlify/functions/og-image?type=state&state=QLD
 *
 * Falls back to /images/og-image.png on any error.
 */

const satori = require('satori');
const { Resvg } = require('@resvg/resvg-js');

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  NT: 'Northern Territory', ACT: 'Australian Capital Territory',
};

const FALLBACK = '/images/og-image.png';

// Safari UA to get TTF format from Google Fonts
const FONT_UA = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

let fontsCache;

async function loadFonts() {
  if (fontsCache) return fontsCache;

  for (const family of ['Geist', 'Inter']) {
    try {
      const css = await fetch(
        `https://fonts.googleapis.com/css2?family=${family}:wght@400;700`,
        { headers: { 'User-Agent': FONT_UA } }
      ).then(r => r.text());

      const fonts = [];
      for (const block of css.split('@font-face')) {
        const wm = block.match(/font-weight:\s*(\d+)/);
        const um = block.match(/src:\s*url\(([^)]+)\)/);
        if (wm && um) {
          const data = await fetch(um[1]).then(r => r.arrayBuffer());
          fonts.push({ name: family, data, weight: parseInt(wm[1], 10), style: 'normal' });
        }
      }
      if (fonts.length >= 2) { fontsCache = fonts; return fonts; }
    } catch (_) { /* try next family */ }
  }
  throw new Error('No fonts loaded');
}

function buildCard(title, subtitle, label) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', backgroundColor: '#1C1C1E',
        display: 'flex', flexDirection: 'column',
      },
      children: [
        { type: 'div', props: { style: { width: '100%', height: '6px', background: 'linear-gradient(90deg, #D4A843, #B8922E)' } } },
        {
          type: 'div',
          props: {
            style: {
              flex: 1, display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between', padding: '48px 60px 44px',
            },
            children: [
              { type: 'div', props: { style: { color: '#D4A843', fontSize: 32, fontWeight: 700 }, children: 'EquitySight' } },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    { type: 'div', props: { style: { color: '#FFFFFF', fontSize: 58, fontWeight: 700, lineHeight: 1.15 }, children: title } },
                    subtitle ? { type: 'div', props: { style: { color: 'rgba(245,240,232,0.6)', fontSize: 28, marginTop: 14 }, children: subtitle } } : null,
                    label ? { type: 'div', props: { style: { color: 'rgba(245,240,232,0.45)', fontSize: 22, marginTop: 10 }, children: label } } : null,
                  ].filter(Boolean),
                },
              },
              { type: 'div', props: { style: { color: 'rgba(245,240,232,0.3)', fontSize: 20 }, children: 'equitysight.app' } },
            ],
          },
        },
      ],
    },
  };
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const type = q.type || 'suburb';

    let title, subtitle, label;

    if (type === 'state') {
      const st = (q.state || '').toUpperCase();
      title = STATE_NAMES[st] || st;
      subtitle = 'Australia';
      label = 'Property Investment Insights';
    } else if (type === 'city') {
      const name = decodeURIComponent(q.name || '');
      const st = (q.state || '').toUpperCase();
      title = name;
      subtitle = (STATE_NAMES[st] || st) + ', Australia';
      label = 'City Investment Insights';
    } else {
      const name = decodeURIComponent(q.name || '');
      const st = (q.state || '').toUpperCase();
      const pc = q.postcode || '';
      title = name;
      subtitle = [STATE_NAMES[st] || st, pc].filter(Boolean).join(' · ');
      label = 'Property Investment Insights';
    }

    if (!title) return { statusCode: 302, headers: { Location: FALLBACK } };

    const fonts = await loadFonts();
    const satoriMod = satori.default || satori;
    const svg = await satoriMod(buildCard(title, subtitle, label), {
      width: 1200, height: 630, fonts,
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
        'Netlify-CDN-Cache-Control': 'public, max-age=31536000, durable',
      },
      body: Buffer.from(png).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image error:', err.message || err);
    return { statusCode: 302, headers: { Location: FALLBACK } };
  }
};

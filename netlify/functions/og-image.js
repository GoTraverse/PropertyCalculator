/**
 * og-image.js — Generates suburb-specific Open Graph images (1200×630 PNG).
 *
 * GET /.netlify/functions/og-image?state=qld&slug=springfield-lakes
 * Or via redirect: /og/qld/springfield-lakes.png
 */

let satoriMod, resvgMod, fontCache;

const STATE_NAMES = {
  nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland',
  wa: 'Western Australia', sa: 'South Australia', tas: 'Tasmania',
  nt: 'Northern Territory', act: 'Australian Capital Territory',
};

function slugToName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function loadFont() {
  if (fontCache) return fontCache;
  // Fetch Google Fonts CSS with a user-agent that triggers woff format (satori needs woff/ttf/otf)
  const cssRes = await fetch(
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&display=swap',
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0' } }
  );
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\(([^)]+\.woff)\)/);
  if (!match) throw new Error('Could not extract font URL from Google Fonts CSS');
  const fontRes = await fetch(match[1]);
  fontCache = Buffer.from(await fontRes.arrayBuffer());
  return fontCache;
}

function makeCard(suburb, stateUpper, stateName) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', backgroundColor: '#1C1C1E', padding: '64px 72px',
        fontFamily: 'DM Sans',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', marginBottom: '8px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '36px', height: '36px', borderRadius: '8px',
                          backgroundColor: '#C9A84C', marginRight: '14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '20px', fontWeight: 700, color: '#1C1C1E',
                        },
                        children: 'E',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '22px', color: '#C9A84C', fontWeight: 500 },
                        children: 'EquitySight.app',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: suburb.length > 20 ? '52px' : '64px',
                    fontWeight: 700, color: '#F5F0E8', lineHeight: 1.1, marginBottom: '16px',
                  },
                  children: suburb,
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: '28px', color: 'rgba(245,240,232,0.6)', fontWeight: 400 },
                  children: `${stateUpper} · ${stateName}`,
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '18px', color: 'rgba(245,240,232,0.4)', fontWeight: 400,
                    borderTop: '1px solid rgba(245,240,232,0.12)', paddingTop: '16px',
                  },
                  children: 'Property Investment Insights · Australia',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  const { state, slug } = event.queryStringParameters || {};
  if (!state || !slug) {
    return { statusCode: 400, body: 'Missing state or slug' };
  }

  const stateLower = state.toLowerCase();
  const stateUpper = state.toUpperCase();
  const stateName = STATE_NAMES[stateLower] || stateUpper;
  const suburb = slugToName(slug);

  try {
    if (!satoriMod) satoriMod = (await import('satori')).default;
    if (!resvgMod) {
      const m = await import('@resvg/resvg-js');
      resvgMod = m.Resvg;
    }

    const font = await loadFont();

    const svg = await satoriMod(makeCard(suburb, stateUpper, stateName), {
      width: 1200,
      height: 630,
      fonts: [{ name: 'DM Sans', data: font, weight: 400, style: 'normal' }],
    });

    const resvg = new resvgMod(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const png = resvg.render().asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=2592000, s-maxage=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
      body: Buffer.from(png).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image error:', err);
    return {
      statusCode: 302,
      headers: { Location: '/images/og-image.png' },
      body: '',
    };
  }
};

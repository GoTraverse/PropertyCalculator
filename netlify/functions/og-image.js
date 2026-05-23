const satori = require('satori');
const { Resvg } = require('@resvg/resvg-js');

let fontRegular = null;
let fontBold = null;

const FONT_URLS = {
  regular: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  bold: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
};

async function loadFonts() {
  if (fontRegular && fontBold) return;
  const [r, b] = await Promise.all([
    fetch(FONT_URLS.regular).then(res => res.arrayBuffer()),
    fetch(FONT_URLS.bold).then(res => res.arrayBuffer()),
  ]);
  fontRegular = r;
  fontBold = b;
}

const STATE_NAMES = {
  qld: 'Queensland', nsw: 'New South Wales', vic: 'Victoria',
  wa: 'Western Australia', sa: 'South Australia', tas: 'Tasmania',
  act: 'ACT', nt: 'Northern Territory',
};

function slugToTitle(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildCard(title, subtitle, typeLabel) {
  const fontSize = title.length > 28 ? (title.length > 38 ? 44 : 54) : 68;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: 1200,
        height: 630,
        backgroundColor: '#1A1A1A',
        padding: '56px 72px 0 72px',
        position: 'relative',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: 0 },
            children: [
              { type: 'span', props: { style: { fontSize: 38, fontWeight: 700, color: '#FFFFFF', letterSpacing: -0.5 }, children: 'Equity' } },
              { type: 'span', props: { style: { fontSize: 38, fontWeight: 700, color: '#F2C94C', letterSpacing: -0.5 }, children: 'Sight' } },
            ],
          },
        },
        { type: 'div', props: { style: { display: 'flex', flex: 1 } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', fontSize, fontWeight: 700, color: '#FFFFFF', letterSpacing: -2, lineHeight: 1.1 },
            children: title,
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', fontSize: 30, fontWeight: 400, color: '#F2C94C', marginTop: 16 },
            children: subtitle + ' — ' + typeLabel,
          },
        },
        { type: 'div', props: { style: { display: 'flex', flex: 1 } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
            children: [
              { type: 'span', props: { style: { fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 }, children: 'equitysight.app' } },
              { type: 'span', props: { style: { fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.25)' }, children: 'Property finance, finally clear.' } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 1200,
              height: 14,
              backgroundColor: '#F2C94C',
            },
          },
        },
      ],
    },
  };
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const rawPath = (params.path || '').replace(/\.png$/, '');
    const parts = rawPath.split('/').filter(Boolean);

    let title, subtitle, typeLabel;

    if (parts[0] === 'suburb' && parts.length === 3) {
      title = slugToTitle(parts[2]);
      subtitle = parts[1].toUpperCase();
      typeLabel = 'Suburb Investment Insights';
    } else if (parts[0] === 'city' && parts.length === 3) {
      title = slugToTitle(parts[2]);
      subtitle = STATE_NAMES[parts[1]] || parts[1].toUpperCase();
      typeLabel = 'City Investment Insights';
    } else if (parts[0] === 'state' && parts.length === 2) {
      title = STATE_NAMES[parts[1]] || parts[1].toUpperCase();
      subtitle = 'Australia';
      typeLabel = 'State Property Hub';
    } else {
      return { statusCode: 302, headers: { Location: '/images/og-image.png' } };
    }

    await loadFonts();

    const svg = await satori(buildCard(title, subtitle, typeLabel), {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
      ],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000',
        'Netlify-CDN-Cache-Control': 'public, max-age=2592000',
      },
      body: Buffer.from(png).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('og-image error:', err);
    return { statusCode: 302, headers: { Location: '/images/og-image.png' } };
  }
};

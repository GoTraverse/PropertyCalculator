const path = require('path');
const fs = require('fs');
const satori = require('satori').default;
const { Resvg } = require('@resvg/resvg-js');

const fontRegular = fs.readFileSync(path.join(__dirname, 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff'));
const fontBold = fs.readFileSync(path.join(__dirname, 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff'));

function stateColor(type) {
  const colors = {
    suburb: { bg: '#1a2332', accent: '#3b82f6', glow: '#60a5fa' },
    city: { bg: '#1a2820', accent: '#10b981', glow: '#34d399' },
    state: { bg: '#2d1a33', accent: '#8b5cf6', glow: '#a78bfa' },
  };
  return colors[type] || colors.suburb;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const title = (params.title || 'EquitySight').slice(0, 60);
  const subtitle = (params.subtitle || '').slice(0, 80);
  const type = params.type || 'suburb';
  const { bg, accent, glow } = stateColor(type);

  const label = type === 'suburb' ? 'Suburb Insights' : type === 'city' ? 'City Investment Guide' : 'State Overview';

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: bg,
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '40px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '24px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: accent,
                            marginRight: '12px',
                          },
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '20px',
                            color: '#94a3b8',
                            letterSpacing: '2px',
                          },
                          children: label.toUpperCase(),
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: title.length > 20 ? '52px' : '64px',
                      fontWeight: 700,
                      color: '#f8fafc',
                      textAlign: 'center',
                      lineHeight: 1.1,
                      marginBottom: '16px',
                    },
                    children: title,
                  },
                },
                subtitle ? {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '28px',
                      color: glow,
                      letterSpacing: '1px',
                    },
                    children: subtitle,
                  },
                } : null,
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginTop: '40px',
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: `1px solid ${accent}44`,
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: '18px', color: '#64748b' },
                          children: 'equitysight.app',
                        },
                      },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
      ],
    }
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });
  const png = resvg.render().asPng();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: Buffer.from(png).toString('base64'),
    isBase64Encoded: true,
  };
};

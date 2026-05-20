const sharp = require('sharp');

const STATE_NAMES = {
  QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory'
};

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugToName(slug) {
  return slug.split('-').map(function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function generateSVG(opts) {
  var type = opts.type || 'suburb';
  var state = (opts.state || '').toUpperCase();
  var stateName = STATE_NAMES[state] || state;
  var subtitle, tagline;

  var name;
  if (type === 'state') {
    name = stateName;
    subtitle = 'Australia';
    tagline = 'Property Market Overview';
  } else if (type === 'city') {
    name = opts.name || slugToName(opts.slug || '');
    subtitle = stateName;
    tagline = 'City Investment Guide';
  } else {
    name = opts.name || slugToName(opts.slug || '');
    var pc = opts.postcode || '';
    subtitle = stateName + (pc ? ' · ' + pc : '');
    tagline = 'Property Investment Insights';
  }

  var fontSize = name.length > 28 ? 46 : name.length > 22 ? 52 : name.length > 16 ? 60 : 68;

  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">' +
    '<defs>' +
    '<radialGradient id="gA" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#F2C94C" stop-opacity="0.12"/>' +
    '<stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="gB" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#F2C94C" stop-opacity="0.07"/>' +
    '<stop offset="70%" stop-color="#F2C94C" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<rect width="1200" height="630" fill="#1A1A1A"/>' +
    '<circle cx="1080" cy="100" r="260" fill="url(#gA)"/>' +
    '<circle cx="120" cy="550" r="200" fill="url(#gB)"/>' +
    '<g transform="translate(72,56)">' +
    '<rect x="0" y="18" width="9" height="18" rx="3" fill="rgba(255,255,255,0.28)"/>' +
    '<rect x="15" y="10" width="9" height="26" rx="3" fill="rgba(255,255,255,0.52)"/>' +
    '<rect x="30" y="0" width="9" height="36" rx="3" fill="#F2C94C"/>' +
    '<text x="50" y="30" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="28" fill="#FFFFFF">Equity</text>' +
    '<text x="147" y="30" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="28" fill="#F2C94C">Sight</text>' +
    '</g>' +
    '<text x="72" y="280" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="' + fontSize + '" fill="#FFFFFF">' + escSvg(name) + '</text>' +
    '<text x="72" y="340" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="30" fill="#F2C94C">' + escSvg(subtitle) + '</text>' +
    '<text x="72" y="420" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="24" fill="rgba(255,255,255,0.55)">' + escSvg(tagline) + '</text>' +
    '<text x="72" y="570" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="20" fill="rgba(255,255,255,0.35)">equitysight.app</text>' +
    '<g transform="translate(930,250)" opacity="0.55">' +
    '<rect x="0" y="90" width="32" height="55" rx="8" fill="rgba(242,201,76,0.18)"/>' +
    '<rect x="52" y="55" width="32" height="90" rx="8" fill="rgba(242,201,76,0.32)"/>' +
    '<rect x="104" y="20" width="32" height="125" rx="8" fill="rgba(242,201,76,0.50)"/>' +
    '<rect x="156" y="0" width="32" height="145" rx="8" fill="rgba(242,201,76,0.70)"/>' +
    '</g>' +
    '</svg>';
}

exports.handler = async function (event) {
  var qs = event.queryStringParameters || {};
  var type = qs.type || 'suburb';
  var state = qs.state || '';
  var slug = qs.slug || '';
  var postcode = qs.postcode || '';

  if (!state) {
    return { statusCode: 302, headers: { Location: '/images/og-image.png' } };
  }

  try {
    var svg = generateSVG({ type: type, state: state, slug: slug, name: '', postcode: postcode });
    var png = await sharp(Buffer.from(svg)).png({ quality: 80 }).toBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable'
      },
      body: png.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    console.error('og-suburb error:', e);
    return { statusCode: 302, headers: { Location: '/images/og-image.png' } };
  }
};

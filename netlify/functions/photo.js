const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

async function redisCmd(...args) {
  const r = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const j = await r.json();
  return j.result;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  const id = (event.queryStringParameters || {}).id;
  if (!id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'missing id' }) };

  try {
    const photoSrc = await redisCmd('GET', 'prop_photo_' + id);
    if (!photoSrc) return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'not found' }) };
    return { statusCode: 200, headers: H, body: JSON.stringify({ photoSrc }) };
  } catch(e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};

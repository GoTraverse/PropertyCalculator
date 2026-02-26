const { getStore } = require('@netlify/blobs');

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  const id = (event.queryStringParameters || {}).id;
  if (!id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'missing id' }) };

  try {
    const store = getStore({ name: 'property-calc', consistency: 'strong' });
    const photoSrc = await store.get('photo:' + id, { type: 'text' });
    if (!photoSrc) return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'not found' }) };
    return { statusCode: 200, headers: H, body: JSON.stringify({ photoSrc }) };
  } catch(e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};

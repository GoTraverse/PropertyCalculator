const { getStore } = require('@netlify/blobs');

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  const store = getStore({ name: 'proper// Uses Upstash Redis for shared storage.
// Set these two env vars in Netlify dashboard → Site settings → Environment variables:
//   UPSTASH_REDIS_REST_URL   (from your Upstash console)
//   UPSTASH_REDIS_REST_TOKEN (from your Upstash console)
// Free tier: 10,000 requests/day, 256MB storage — plenty for personal use.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const INDEX_KEY   = 'prop_calc_index';

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  if (!REDIS_URL || !REDIS_TOKEN) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Redis env vars not set. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Netlify environment variables.' }) };
  }

  // GET — return all scenarios
  if (event.httpMethod === 'GET') {
    try {
      const raw = await redisCmd('GET', INDEX_KEY);
      return { statusCode: 200, headers: H, body: raw || '[]' };
    } catch(e) {
      return { statusCode: 200, headers: H, body: '[]' };
    }
  }

  // POST — save/update scenario
  if (event.httpMethod === 'POST') {
    try {
      const { record, photoSrc } = JSON.parse(event.body || '{}');
      if (!record?.id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'missing id' }) };

      // Store photo separately (large base64 strings kept out of index)
      if (photoSrc) await redisCmd('SET', 'prop_photo_' + record.id, photoSrc);

      // Update index
      let arr = [];
      try { const raw = await redisCmd('GET', INDEX_KEY); arr = raw ? JSON.parse(raw) : []; } catch(e) {}
      const slim = { ...record };
      slim.hasPhoto = !!(photoSrc || slim.hasPhoto);
      const i = arr.findIndex(s => s.id === record.id);
      if (i >= 0) arr[i] = slim; else arr.unshift(slim);
      await redisCmd('SET', INDEX_KEY, JSON.stringify(arr));

      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  // DELETE
  if (event.httpMethod === 'DELETE') {
    try {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'missing id' }) };
      try { await redisCmd('DEL', 'prop_photo_' + id); } catch(e) {}
      let arr = [];
      try { const raw = await redisCmd('GET', INDEX_KEY); arr = raw ? JSON.parse(raw) : []; } catch(e) {}
      await redisCmd('SET', INDEX_KEY, JSON.stringify(arr.filter(s => s.id !== id)));
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'method not allowed' }) };
};ty-calc', consistency: 'strong' });

  // GET
  if (event.httpMethod === 'GET') {
    try {
      const raw = await store.get('index', { type: 'text' });
      return { statusCode: 200, headers: H, body: raw || '[]' };
    } catch(e) {
      return { statusCode: 200, headers: H, body: '[]' };
    }
  }

  // POST
  if (event.httpMethod === 'POST') {
    try {
      const { record, photoSrc } = JSON.parse(event.body || '{}');
      if (!record?.id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'missing id' }) };

      if (photoSrc) await store.set('photo:' + record.id, photoSrc);

      let arr = [];
      try { const raw = await store.get('index', { type: 'text' }); arr = raw ? JSON.parse(raw) : []; } catch(e) {}

      const slim = { ...record };
      slim.hasPhoto = !!(photoSrc || slim.hasPhoto);
      const i = arr.findIndex(s => s.id === record.id);
      if (i >= 0) arr[i] = slim; else arr.unshift(slim);
      await store.set('index', JSON.stringify(arr));

      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  // DELETE
  if (event.httpMethod === 'DELETE') {
    try {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'missing id' }) };

      try { await store.delete('photo:' + id); } catch(e) {}

      let arr = [];
      try { const raw = await store.get('index', { type: 'text' }); arr = raw ? JSON.parse(raw) : []; } catch(e) {}
      await store.set('index', JSON.stringify(arr.filter(s => s.id !== id)));

      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'method not allowed' }) };
};

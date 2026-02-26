const { getStore } = require('@netlify/blobs');

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  const store = getStore({ name: 'property-calc', consistency: 'strong' });

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

/**
 * Netlify Serverless Function — Photo Retrieval
 * File: netlify/functions/photo.mjs
 *
 * GET /.netlify/functions/photo?id=SCENARIO_ID  → returns { photoSrc: "data:image/..." }
 */

import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: CORS });

  const url = new URL(req.url);
  const id  = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers: CORS });

  try {
    const store   = getStore({ name: 'property-scenarios', consistency: 'strong' });
    const photoSrc = await store.get('photo-' + id, { type: 'text' });
    if (!photoSrc) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: CORS });
    return new Response(JSON.stringify({ photoSrc }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}

export const config = { path: '/api/photo' };

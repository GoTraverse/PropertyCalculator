/**
 * Netlify Serverless Function — Shared Scenario Storage
 * File: netlify/functions/scenarios.mjs
 *
 * Handles GET, POST, DELETE for property scenarios.
 * Uses Netlify Blobs for persistence — data is shared across all devices/users.
 *
 * Requires: Netlify CLI v17+ or Netlify hosting (Blobs are available on all plans)
 *
 * Endpoints:
 *   GET  /.netlify/functions/scenarios         → list all scenarios (no photos)
 *   POST /.netlify/functions/scenarios         → save/update scenario
 *   DELETE /.netlify/functions/scenarios       → delete by id (id in query param or body)
 */

import { getStore } from '@netlify/blobs';

const SCENARIOS_KEY = 'all-scenarios';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const store = getStore({ name: 'property-scenarios', consistency: 'strong' });

  // ── GET — list all scenarios ──
  if (req.method === 'GET') {
    try {
      const raw = await store.get(SCENARIOS_KEY, { type: 'text' });
      const arr = raw ? JSON.parse(raw) : [];
      return new Response(JSON.stringify(arr), { status: 200, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify([]), { status: 200, headers: CORS });
    }
  }

  // ── POST — save/update scenario + optional photo ──
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { record, photoSrc } = body;
      if (!record || !record.id) {
        return new Response(JSON.stringify({ error: 'missing record.id' }), { status: 400, headers: CORS });
      }
      // Save photo separately (keyed by scenario id)
      if (photoSrc) {
        await store.set('photo-' + record.id, photoSrc);
        record.hasPhoto = true;
      }
      // Load, update, save index
      let arr = [];
      try {
        const raw = await store.get(SCENARIOS_KEY, { type: 'text' });
        arr = raw ? JSON.parse(raw) : [];
      } catch (e) { arr = []; }
      const slim = { ...record }; delete slim.photoSrc; // never store base64 in index
      const idx = arr.findIndex(s => s.id === record.id);
      if (idx >= 0) arr[idx] = slim; else arr.unshift(slim);
      await store.set(SCENARIOS_KEY, JSON.stringify(arr));
      return new Response(JSON.stringify({ ok: true, id: record.id }), { status: 200, headers: CORS });
    } catch (e) {
      console.error('POST error:', e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  }

  // ── DELETE — remove scenario by id ──
  if (req.method === 'DELETE') {
    try {
      const url = new URL(req.url);
      let id = url.searchParams.get('id');
      if (!id) {
        try { const body = await req.json(); id = body.id; } catch(e) {}
      }
      if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers: CORS });
      // Remove from index
      let arr = [];
      try { const raw = await store.get(SCENARIOS_KEY, { type: 'text' }); arr = raw ? JSON.parse(raw) : []; } catch (e) { arr = []; }
      await store.set(SCENARIOS_KEY, JSON.stringify(arr.filter(s => s.id !== id)));
      // Remove photo
      try { await store.delete('photo-' + id); } catch (e) {}
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
}

export const config = { path: ['/api/scenarios', '/api/scenarios/:id'] };

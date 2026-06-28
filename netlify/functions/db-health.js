/**
 * db-health.js — Netlify Function (Phase 0 spike)
 *
 * Proves a Netlify Function can reach Neon (serverless Postgres) before we
 * invest in the platform data layer. See ARCHITECTURE.md §9.
 *
 * - ADMIN ONLY (verifies the es_session cookie against Redis, same as the
 *   other admin endpoints) — it reports internal infra state.
 * - READ ONLY. Runs `SELECT now()` and lists which platform tables exist.
 * - SAFE WHEN UNCONFIGURED. With no DATABASE_URL it returns a clear
 *   "not configured" message and touches nothing.
 *
 * Uses the Neon HTTP driver (@neondatabase/serverless): each query goes over
 * HTTPS with no persistent socket, which is the right model for stateless
 * Functions (no connection-pool exhaustion). See ARCHITECTURE.md §3.
 */

'use strict';

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g, '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();
const DATABASE_URL = (process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '').trim();

const H = { 'Content-Type': 'application/json' };
function json(status, body) { return { statusCode: status, headers: H, body: JSON.stringify(body) }; }

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
  });
  if (!r.ok) return null;
  const raw = (await r.json()).result;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

async function verifyAdmin(event) {
  const token = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie)).es_session;
  if (!token) return false;
  const session = await redisGet('token:' + token);
  if (!session || (session.expires && session.expires < Date.now())) return false;
  return session.role === 'admin';
}

exports.handler = async (event) => {
  if (!(await verifyAdmin(event))) return json(401, { ok: false, error: 'admin only' });

  if (!DATABASE_URL) {
    return json(200, {
      ok: true,
      connected: false,
      configured: false,
      message: 'DATABASE_URL not set. Create a Neon project (or Netlify DB), add DATABASE_URL to the Netlify environment, then re-run. See ARCHITECTURE.md §9.',
    });
  }

  try {
    // Lazy-require so the function still loads if the dep isn't installed yet.
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(DATABASE_URL);

    const nowRows = await sql`SELECT now() AS now, version() AS version`;
    const tableRows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('suburbs','sources','suburb_metrics','suburb_events')
      ORDER BY table_name`;

    const tables = tableRows.map(r => r.table_name);
    return json(200, {
      ok: true,
      connected: true,
      configured: true,
      now: nowRows[0] && nowRows[0].now,
      version: (nowRows[0] && String(nowRows[0].version || '').split(' ').slice(0, 2).join(' ')) || null,
      tables,
      schemaApplied: tables.length === 4,
      hint: tables.length === 4
        ? 'Schema present — ready for Phase 1 ingestion.'
        : 'Connected, but platform tables are missing. Apply db/migrations/001_init.sql.',
    });
  } catch (e) {
    return json(200, {
      ok: false,
      connected: false,
      configured: true,
      error: e.message,
      hint: e.message && e.message.includes("Cannot find module")
        ? 'Install the driver: add "@neondatabase/serverless" to netlify/functions/package.json.'
        : 'Check DATABASE_URL is a valid Neon connection string.',
    });
  }
};

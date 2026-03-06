/**
 * client-errors.js — Netlify Function
 * Receives client-side JS/resource errors and stores in Redis.
 * Admin can view via adminGetClientErrors action.
 *
 * POST { action:'logError', error:{message,source,line,col,stack,url,userAgent,at} }
 * POST { action:'adminGetClientErrors' }  — admin only, requires Bearer token
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  return (await r.json()).result;
}

async function rGet(key) {
  const raw = await redisCmd('GET', key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

async function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const data = await rGet('token:' + token);
    if (!data || data.expires < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

const ok  = (b) => ({ statusCode: 200, headers: H, body: JSON.stringify(b) });
const fail = (msg, code) => ({ statusCode: code || 400, headers: H, body: JSON.stringify({ ok: false, error: msg }) });

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return fail('POST only', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return fail('Invalid JSON'); }

  const action = body.action || '';

  // ── Log a client error ────────────────────────────────────────────────────
  if (action === 'logError') {
    if (!REDIS_URL || !REDIS_TOKEN) return ok({ ok: true }); // silently drop if not configured
    const err = body.error || {};
    // Sanitise: cap string lengths
    const entry = {
      at:        Date.now(),
      message:   String(err.message || '').slice(0, 500),
      source:    String(err.source  || '').slice(0, 300),
      line:      err.line  || null,
      col:       err.col   || null,
      stack:     String(err.stack   || '').slice(0, 1500),
      url:       String(err.url     || '').slice(0, 300),
      userAgent: String(err.userAgent || '').slice(0, 250),
    };
    try {
      await redisCmd('RPUSH', 'client-errors', JSON.stringify(entry));
      await redisCmd('LTRIM', 'client-errors', '0', '499'); // keep last 500
    } catch (e) {
      console.warn('[client-errors] Failed to store error:', e.message);
    }
    return ok({ ok: true });
  }

  // ── Admin: fetch errors ───────────────────────────────────────────────────
  if (action === 'adminGetClientErrors') {
    const user = await verifyToken(event.headers?.authorization || event.headers?.Authorization);
    if (!user || user.role !== 'admin') return fail('Unauthorized', 401);
    try {
      const raw = await redisCmd('LRANGE', 'client-errors', '0', '-1');
      const errors = (raw || []).map(s => { try { return JSON.parse(s); } catch (e) { return { message: s, at: 0 }; } });
      errors.reverse(); // newest first
      return ok({ ok: true, errors });
    } catch (e) {
      return ok({ ok: true, errors: [] });
    }
  }

  // ── Admin: clear errors ───────────────────────────────────────────────────
  if (action === 'adminClearClientErrors') {
    const user = await verifyToken(event.headers?.authorization || event.headers?.Authorization);
    if (!user || user.role !== 'admin') return fail('Unauthorized', 401);
    try { await redisCmd('DEL', 'client-errors'); } catch (e) {}
    return ok({ ok: true });
  }

  return fail('Unknown action');
};

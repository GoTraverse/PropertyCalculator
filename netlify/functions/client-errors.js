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
const RESEND_API_KEY    = (process.env.RESEND_API_KEY    || '').trim();
const VERIFY_EMAIL_FROM = (process.env.VERIFY_EMAIL_FROM || 'noreply@equitysight.app').trim();

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
    if (!data) return null;
    if (data.expires && Date.now() > data.expires) return null;
    // Check user still exists — deleted users should not retain access
    if (data.email) { const u = await rGet('user:' + data.email); if (!u) return null; }
    return data;
  } catch (e) { return null; }
}

const ok  = (b) => ({ statusCode: 200, headers: H, body: JSON.stringify(b) });
const fail = (msg, code) => ({ statusCode: code || 400, headers: H, body: JSON.stringify({ ok: false, error: msg }) });

const SYNC_THROTTLE_MS  = 5 * 60 * 1000;        // 5 minutes
const ALERT_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours per alert type

// Critical integration patterns — fires an email alert the moment one is detected.
// Each pattern has a Redis throttle key so alerts don't spam (once per 24h per key).
const CRITICAL_ALERT_PATTERNS = [
  {
    key:   'ga-collect',
    label: 'Google Analytics data collection',
    test:  msg => /CSP violation.*(doubleclick\.net|google-analytics|analytics\.google)/i.test(msg),
  },
  {
    key:   'ga-script',
    label: 'Google Analytics script load',
    test:  msg => /CSP violation.*googletagmanager/i.test(msg),
  },
  {
    key:   'adsense',
    label: 'Google AdSense / Ad Quality',
    test:  msg => /CSP violation.*(adtrafficquality|googlesyndication)/i.test(msg),
  },
];

async function maybeSendCriticalAlert(entry) {
  if (!RESEND_API_KEY) return;
  const msg = entry.message || '';
  for (const pattern of CRITICAL_ALERT_PATTERNS) {
    if (!pattern.test(msg)) continue;
    // Throttle: only one alert per 24h per pattern key
    const throttleKey = 'alert:csp:' + pattern.key;
    try {
      const last = await rGet(throttleKey);
      if (last && (Date.now() - Number(last)) < ALERT_THROTTLE_MS) continue;
      await redisCmd('SET', throttleKey, String(Date.now()));
    } catch (e) { continue; }
    // Send alert
    try {
      // Use support email from admin config, falling back to env var
      let alertTo = VERIFY_EMAIL_FROM;
      try {
        const cfg = await rGet('config:site');
        if (cfg && cfg.supportEmail) alertTo = cfg.supportEmail;
      } catch (e) { /* use fallback */ }
      const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#DC2626;margin-bottom:4px;">Critical integration broken</h2>
  <p style="color:#6B7280;margin-top:0;font-size:13px;">EquitySight.app — automated alert</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr><td style="padding:6px 0;color:#6B7280;width:110px;">Integration</td><td style="padding:6px 0;font-weight:600;">${pattern.label}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280;">Error</td><td style="padding:6px 0;word-break:break-all;">${String(msg).slice(0, 300)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280;">Page</td><td style="padding:6px 0;">${String(entry.url || 'unknown').slice(0, 200)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280;">Browser</td><td style="padding:6px 0;font-size:12px;color:#6B7280;">${String(entry.userAgent || '').slice(0, 120)}</td></tr>
  </table>
  <p style="font-size:13px;color:#374151;">This is typically a CSP misconfiguration in <code>netlify.toml</code>. Check the <code>connect-src</code> or <code>script-src</code> directives and ensure the blocked domain is whitelisted.</p>
  <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">Next alert for this integration suppressed for 24 hours. View the <a href="https://equitysight.app/admin">admin error log</a> for the full list.</p>
</div>`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: VERIFY_EMAIL_FROM,
          to: [alertTo],
          subject: '[EquitySight] ' + pattern.label + ' broken (CSP violation)',
          html,
        }),
      });
    } catch (e) {
      console.warn('[client-errors] Alert email failed:', e.message);
    }
  }
}

async function syncToGitHubThrottled() {
  const ghToken = (process.env.GITHUB_TOKEN || '').trim();
  if (!ghToken) return; // silently skip if not configured
  // Check throttle: only sync if last sync was >5 min ago
  const lastSync = await rGet('client-errors:lastSync');
  if (lastSync && (Date.now() - lastSync) < SYNC_THROTTLE_MS) return;
  await redisCmd('SET', 'client-errors:lastSync', String(Date.now()));
  await pushErrorsToGitHub(ghToken);
}

async function pushErrorsToGitHub(ghToken) {
  const repo = (process.env.GITHUB_REPO || 'GoTraverse/PropertyCalculator').trim();
  const branch = 'main';
  const filePath = 'ERRORS.json';
  const ghApi = 'https://api.github.com';
  const ghHeaders = { Authorization: 'token ' + ghToken, 'User-Agent': 'EquitySight-Admin', 'Content-Type': 'application/json' };

  // Get all errors from Redis
  const raw = await redisCmd('LRANGE', 'client-errors', '0', '-1');
  const errors = (raw || []).map(s => { try { return JSON.parse(s); } catch (e) { return { message: s, at: 0 }; } });
  errors.reverse(); // newest first
  const content = JSON.stringify({ syncedAt: new Date().toISOString(), count: errors.length, errors }, null, 2);
  const encoded = Buffer.from(content).toString('base64');

  // Get current file SHA (needed for updates)
  let sha = null;
  const existing = await fetch(`${ghApi}/repos/${repo}/contents/${filePath}?ref=${branch}`, { headers: ghHeaders });
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }

  // Create or update file
  const putBody = { message: 'Auto-sync client errors (' + errors.length + ' errors)', content: encoded, branch };
  if (sha) putBody.sha = sha;
  const putResp = await fetch(`${ghApi}/repos/${repo}/contents/${filePath}`, {
    method: 'PUT', headers: ghHeaders, body: JSON.stringify(putBody),
  });
  if (!putResp.ok) {
    const errText = await putResp.text();
    throw new Error('GitHub API ' + putResp.status + ': ' + errText.slice(0, 200));
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return fail('POST only', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return fail('Invalid JSON'); }

  const action = body.action || '';

  // ── Log a client error ────────────────────────────────────────────────────
  if (action === 'logError') {
    if (!REDIS_URL || !REDIS_TOKEN) return ok({ ok: true }); // silently drop if not configured
    // Rate limit: 50 errors per IP per hour to prevent log flooding
    try {
      const clientIp = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      const rlKey = 'errl:' + clientIp;
      const count = await redisCmd('INCR', rlKey);
      if (count === 1) await redisCmd('EXPIRE', rlKey, '3600');
      if (count > 50) return ok({ ok: true }); // silently drop
    } catch (e) { /* don't block on rate limit errors */ }
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
      userId:    String(err.userId    || '').slice(0, 100),
      userName:  String(err.userName  || '').slice(0, 100),
      userEmail: String(err.userEmail || '').slice(0, 200),
      severity:  ['error','warning','info'].includes(err.severity) ? err.severity : 'error',
    };
    try {
      await redisCmd('RPUSH', 'client-errors', JSON.stringify(entry));
      await redisCmd('LTRIM', 'client-errors', '0', '499'); // keep last 500
    } catch (e) {
      console.warn('[client-errors] Failed to store error:', e.message);
    }
    // Alert on critical integration failures (throttled: once per 24h per pattern)
    try { await maybeSendCriticalAlert(entry); } catch (e) {
      console.warn('[client-errors] Alert check failed:', e.message);
    }
    // Auto-sync to GitHub (throttled: max once per 5 minutes)
    try { await syncToGitHubThrottled(); } catch (e) {
      console.warn('[client-errors] GitHub sync failed:', e.message);
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

  // ── Admin: sync errors to GitHub repo ─────────────────────────────────────
  if (action === 'syncErrorsToGitHub') {
    const user = await verifyToken(event.headers?.authorization || event.headers?.Authorization);
    if (!user || user.role !== 'admin') return fail('Unauthorized', 401);
    const ghToken = (process.env.GITHUB_TOKEN || '').trim();
    if (!ghToken) return fail('GITHUB_TOKEN env var not set. Add it in Netlify → Environment Variables.');
    try {
      await pushErrorsToGitHub(ghToken);
      await redisCmd('SET', 'client-errors:lastSync', String(Date.now()));
      return ok({ ok: true, message: 'Errors synced to GitHub' });
    } catch (e) {
      return fail('Sync failed: ' + e.message);
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

/**
 * contact.js — Netlify Function
 * Accepts contact form submissions and emails them to the supportEmail
 * configured in the site config (Redis key: config:site).
 *
 * POST { name, email, subject, message }
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const RESEND_API_KEY    = (process.env.RESEND_API_KEY    || '').trim();
const VERIFY_EMAIL_FROM = (process.env.VERIFY_EMAIL_FROM || 'noreply@equitysight.app').trim();

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Redis not configured');
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
  try { return JSON.parse(raw); } catch(e) { return raw; }
}

const ok   = b => ({ statusCode: 200, headers: H, body: JSON.stringify(b) });
const fail = (msg, code) => ({ statusCode: code || 400, headers: H, body: JSON.stringify({ ok: false, error: msg }) });

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return fail('POST only', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return fail('Invalid JSON'); }

  const { name, email, subject, message, diagnostics } = body;
  if (!name || !email || !subject || !message) return fail('All fields required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Invalid email');
  if (String(name).length > 100) return fail('Name too long');
  if (message.length > 5000) return fail('Message too long (max 5000 characters)');

  // Rate limit: max 5 contact submissions per IP per hour
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const clientIp = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      const rateKey = 'contact:' + clientIp;
      const count = await (async () => {
        const r = await fetch(REDIS_URL, { method:'POST', headers:{ Authorization:'Bearer '+REDIS_TOKEN, 'Content-Type':'application/json' }, body: JSON.stringify(['INCR', rateKey]) });
        const n = r.ok ? (await r.json()).result : 1;
        if (n === 1) await fetch(REDIS_URL, { method:'POST', headers:{ Authorization:'Bearer '+REDIS_TOKEN, 'Content-Type':'application/json' }, body: JSON.stringify(['EXPIRE', rateKey, '3600']) });
        return n;
      })();
      if (count > 5) return fail('Too many messages — please try again later');
    } catch(e) { /* don't block on rate limit errors */ }
  }

  // Get support email from config
  let toEmail = 'support@equitysight.app';
  try {
    const cfg = await rGet('config:site');
    if (cfg && cfg.supportEmail) toEmail = cfg.supportEmail;
  } catch(e) {}

  const subjectLabels = {
    general: 'General question',
    bug: 'Bug report',
    feature: 'Feature request',
    billing: 'Billing / subscription',
    calculator: 'Calculator question',
    other: 'Other',
  };
  if (!subjectLabels[subject]) return fail('Invalid subject');
  const subjectLabel = subjectLabels[subject];

  if (!RESEND_API_KEY) {
    console.log('[contact] No RESEND_API_KEY. Would send from %s to %s — %s', email, toEmail, subjectLabel);
    return ok({ ok: true });
  }

  function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  let diagHtml = '';
  if (subject === 'bug' && diagnostics && typeof diagnostics === 'object') {
    const rows = Object.entries(diagnostics).slice(0, 20)
      .map(([k, v]) => `<tr><td style="padding:3px 10px 3px 0;color:#9CA3AF;font-size:11px;white-space:nowrap;vertical-align:top;">${escHtml(k)}</td><td style="padding:3px 0;font-size:11px;color:#4B5563;word-break:break-all;">${escHtml(String(v))}</td></tr>`)
      .join('');
    diagHtml = `
  <div style="margin-top:20px;background:#F3F4F6;border-radius:4px;padding:12px 16px;">
    <div style="font-family:monospace;font-size:10px;font-weight:600;color:#9CA3AF;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Diagnostics</div>
    <table style="border-collapse:collapse;width:100%;font-family:monospace;">${rows}</table>
  </div>`;
  }

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1C1C1E;margin-bottom:4px;">New contact form submission</h2>
  <p style="color:#6B7280;margin-top:0;font-size:13px;">Via EquitySight contact form</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;width:100px;">From</td><td style="padding:8px 0;font-size:14px;">${escHtml(name)} &lt;${escHtml(email)}&gt;</td></tr>
    <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Subject</td><td style="padding:8px 0;font-size:14px;">${escHtml(subjectLabel)}</td></tr>
  </table>
  <div style="background:#F9FAFB;border-left:3px solid #C9A84C;padding:16px;border-radius:0 4px 4px 0;">
    <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escHtml(message)}</p>
  </div>${diagHtml}
  <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">Reply directly to this email to respond to ${escHtml(name)}.</p>
</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: VERIFY_EMAIL_FROM,
        to: [toEmail],
        reply_to: [email],
        subject: '[EquitySight] ' + subjectLabel + ' — from ' + name,
        html,
      }),
    });
    if (!r.ok) {
      let errMsg = 'Failed to send message — please try again';
      try {
        const errBody = await r.json();
        console.warn('[contact] Resend error %s: %j', r.status, errBody);
        if (errBody && errBody.message) errMsg = errBody.message;
      } catch(_) {
        const errText = await r.text().catch(() => '');
        console.warn('[contact] Resend error %s: %s', r.status, errText);
      }
      return fail(errMsg);
    }
    return ok({ ok: true });
  } catch(e) {
    console.warn('[contact] Send error:', e.message);
    return fail('Failed to send message — please try again');
  }
};

/**
 * auth.js — Netlify Function
 * Per-user auth backed by Upstash Redis.
 *
 * actions: signup, signin, verifyEmail, resendVerification, verify, signout, getProfile, setProfile
 *
 * Redis keys:
 *   user:<email>      → {name, hash, id, plan, email, createdAt}
 *   token:<token>     → {userId, email, name, plan, expires}   TTL=30d
 *   profile:<userId>  → {color, ...non-photo settings}
 */

const crypto = require('crypto');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const SALT = (process.env.AUTH_SALT || '').trim();
// AUTH_SALT is validated per-request — see handler below
const TOKEN_TTL   = 60 * 60 * 24 * 30; // 30 days

// HttpOnly session cookie — set on signin/verifyEmail/googleSignin, cleared on signout.
// Token is never exposed to client JS; verifyToken() reads this cookie only.
const SESSION_COOKIE_NAME = 'es_session';

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());

// Defense-in-depth CSRF check for mutating requests. SameSite=Lax already
// blocks cross-site POST cookies, but verifying the Origin header catches any
// browser or proxy that relaxes that rule. Returns false only when an Origin
// is present AND it's not in the allowlist. Missing Origin (same-origin GET,
// server-to-server, native app) is treated as safe.
function isAllowedOrigin(event){
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if(!o) return true;
  return ALLOWED_ORIGINS.includes(o) || o.endsWith('.netlify.app');
}

function getCorsHeaders(event) {
  const reqOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin
    : reqOrigin.endsWith('.netlify.app') ? reqOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Credentials':'true',
  };
}

// Build a Set-Cookie string for the session token. HttpOnly blocks JS access,
// Secure requires HTTPS, SameSite=Lax blocks cross-site POST but allows
// top-level navigation. Path=/ so every function receives it.
function buildSessionCookie(token, maxAgeSec){
  return SESSION_COOKIE_NAME+'='+encodeURIComponent(token)+
    '; Path=/'+
    '; Max-Age='+maxAgeSec+
    '; HttpOnly'+
    '; Secure'+
    '; SameSite=Lax';
}
// Build a Set-Cookie string that clears the session cookie (Max-Age=0).
function buildClearSessionCookie(){
  return SESSION_COOKIE_NAME+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}
// Read the session token from the request Cookie header, if present.
function readCookieToken(event){
  const raw = (event && event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  if(!raw) return '';
  const parts = raw.split(/;\s*/);
  for(const p of parts){
    const eq = p.indexOf('=');
    if(eq<0) continue;
    if(p.slice(0,eq)===SESSION_COOKIE_NAME){
      try{ return decodeURIComponent(p.slice(eq+1)); }catch(e){ return p.slice(eq+1); }
    }
  }
  return '';
}

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const VERIFY_EMAIL_FROM = (process.env.VERIFY_EMAIL_FROM || 'noreply@equitysight.app').trim();

// Default email templates — used when no custom template is saved in Redis
const DEFAULT_TEMPLATES = {
  verification: {
    subject: 'Verify your EquitySight account',
    html: '<p>Your verification code is <strong style="font-size:18px;letter-spacing:2px;">{{code}}</strong>.</p><p>This code expires in 15 minutes.</p>',
    variables: ['{{code}}'],
  },
  welcome: {
    subject: 'Welcome to EquitySight!',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">Welcome, {{firstName}}! 🎉</h2><p>Your EquitySight account is verified and ready to go.</p><p>You can now:</p><ul><li>Calculate property investment scenarios</li><li>Save and compare multiple properties</li><li>Track growth projections over time</li></ul><a href="https://equitysight.app/app" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">Open Calculator</a><p style="margin-top:24px;font-size:12px;color:#888;">If you have any questions, reply to this email.</p></div>',
    variables: ['{{firstName}}', '{{name}}'],
  },
  password_reset: {
    subject: 'Reset your EquitySight password',
    html: '<p>Your password reset code is <strong style="font-size:18px;letter-spacing:2px;">{{code}}</strong>.</p><p>This code expires in 30 minutes. If you did not request this, you can ignore this email.</p>',
    variables: ['{{code}}'],
  },
  magic_link: {
    subject: 'Your EquitySight sign-in link',
    // We send BOTH a clickable link and a 6-digit code. Email scanners
    // (Outlook Safe Links, Mimecast, Proofpoint, …) routinely prefetch
    // URLs to scan for malware, which can consume single-use magic-link
    // tokens before the legitimate user clicks them. The 6-digit code
    // can't be auto-extracted from prose, so it survives prefetch.
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;margin:0 0 12px;">Sign in to EquitySight</h2><p style="font-size:14px;line-height:1.6;">Click the button below to sign in. The link expires in 15 minutes and can only be used once.</p><p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Sign in to EquitySight</a></p><p style="font-size:14px;line-height:1.6;color:#4A4A52;">Or, if your email client blocks the link, enter this 6-digit code on the sign-in page:</p><p style="text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;color:#1C1C1E;margin:8px 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">{{code}}</p><p style="font-size:12px;color:#9CA3AF;line-height:1.6;">If you did not request this, you can safely ignore this email — your account stays secure.</p></div>',
    variables: ['{{link}}', '{{code}}'],
  },
  subscription: {
    subject: 'Your EquitySight plan has been updated',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">Plan updated</h2><p>Hi {{firstName}},</p><p>Your plan has been updated to <strong>{{plan}}</strong>.</p><p>You now have access to all features included in your new plan.</p><a href="https://equitysight.app/app" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">Open Calculator</a></div>',
    variables: ['{{firstName}}', '{{name}}', '{{plan}}'],
  },
  security_alert: {
    subject: 'Security alert — EquitySight',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C45A5A;">⚠ Security alert</h2><p>Hi {{firstName}},</p><p>We detected the following activity on your account: <strong>{{event}}</strong>.</p><p>If this was you, no action is needed. If you did not do this, please reset your password immediately.</p><a href="https://equitysight.app/login" style="display:inline-block;padding:12px 24px;background:#1C1C1E;color:#F5F0E8;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">Reset Password</a></div>',
    variables: ['{{firstName}}', '{{name}}', '{{event}}'],
  },
  promotional: {
    subject: 'What\'s new at EquitySight',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">What\'s new</h2><p>Hi {{firstName}},</p><p>We\'ve been working hard on new features for EquitySight. Here\'s what\'s new:</p><p style="background:#F9FAFB;border-left:3px solid #C9A84C;padding:12px 16px;border-radius:0 4px 4px 0;">Your message here...</p><a href="https://equitysight.app/app" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:16px;">Open Calculator</a><p style="margin-top:24px;font-size:11px;color:#9CA3AF;">You\'re receiving this because you have an EquitySight account.</p></div>',
    variables: ['{{firstName}}', '{{name}}'],
  },
  scenario_shared: {
    subject: '{{senderName}} shared a property scenario with you',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">Scenario shared with you</h2><p>Hi {{firstName}},</p><p><strong>{{senderName}}</strong> has shared a property scenario with you on EquitySight{{address}}.</p><p>Open your calculator to view the shared scenario:</p><a href="https://equitysight.app/app" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">View Scenario</a><p style="margin-top:24px;font-size:12px;color:#888;">You can find shared scenarios in your Saved Library.</p></div>',
    variables: ['{{firstName}}', '{{senderName}}', '{{address}}'],
  },
  scenario_invite: {
    subject: '{{senderName}} shared a property with you on EquitySight',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="font-size:20px;margin-bottom:8px;">You\'ve been invited to EquitySight</h2><p style="font-size:14px;color:#4A4A52;line-height:1.7;"><strong>{{senderName}}</strong> wants to share a property scenario with you{{address}}.</p><p style="font-size:14px;color:#4A4A52;line-height:1.7;">Sign up for a free EquitySight account to view it:</p><p style="text-align:center;margin:24px 0;"><a href="https://equitysight.app/login" style="display:inline-block;padding:12px 28px;background:#1C1C1E;color:#F5F0E8;border-radius:4px;text-decoration:none;font-size:14px;font-weight:600;">Create Free Account</a></p><p style="font-size:12px;color:#999;line-height:1.6;">EquitySight offers free Australian property finance calculators for all 8 states. Free to use, no credit card required.</p></div>',
    variables: ['{{senderName}}', '{{address}}'],
  },
};

// Substitute {{variable}} placeholders in a template string
function applyVars(str, vars){
  return Object.entries(vars).reduce((s,[k,v])=>s.replace(new RegExp('\\{\\{'+k+'\\}\\}','g'),v||''), str);
}

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function notifyAdminsNewUser(email, name, plan){
  if(!RESEND_API_KEY) return;
  try{
    const keys=await scanAll('user:*');
    if(!keys||!keys.length) return;
    const users=await Promise.all(keys.map(k=>rGet(k)));
    const admins=users.filter(u=>u&&u.role==='admin'&&u.email);
    if(!admins.length) return;
    const subject='New user signed up — EquitySight';
    const html='<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">New user signed up</h2><p><strong>Name:</strong> '+escHtml(name)+'</p><p><strong>Email:</strong> '+escHtml(email)+'</p><p><strong>Plan:</strong> '+escHtml(plan)+'</p><p><strong>Time:</strong> '+new Date().toISOString()+'</p><a href="https://equitysight.app/admin" style="display:inline-block;padding:10px 20px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">View in Admin</a></div>';
    await Promise.all(admins.map(a=>sendResend(a.email,subject,html)));
  }catch(e){ console.warn('[auth] Admin new-user notification failed:',e.message); }
}

async function getEmailTemplate(type){
  try{
    const saved = await rGet('email-template:'+type);
    if(saved && saved.subject && saved.html) return saved;
  }catch(e){}
  return DEFAULT_TEMPLATES[type] || null;
}

async function sendResend(to, subject, html){
  const r = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:VERIFY_EMAIL_FROM, to:[to], subject, html})
  });
  if(!r.ok){ const e=await r.text(); console.warn('[auth] Resend error %s: %s',r.status,e); return false; }
  return true;
}

async function sendVerificationEmail(email, code){
  if(!RESEND_API_KEY){
    console.log('[auth] RESEND_API_KEY not configured. Verification code for %s: %s', email, code);
    return {sent:false,provider:'log'};
  }
  try{
    const tpl = await getEmailTemplate('verification');
    const html = applyVars(tpl.html, {code});
    const sent = await sendResend(email, tpl.subject, html);
    if(!sent) return {sent:false,provider:'resend'};
    return {sent:true,provider:'resend'};
  }catch(e){
    console.warn('[auth] Verification email error for %s: %s', email, e.message);
    return {sent:false,provider:'resend'};
  }
}

async function sendWelcomeEmail(email, name){
  if(!RESEND_API_KEY) return {sent:false,provider:'log'};
  try{
    const firstName = (name||'').split(' ')[0] || 'there';
    const tpl = await getEmailTemplate('welcome');
    const html = applyVars(tpl.html, {firstName, name: name||'there'});
    await sendResend(email, tpl.subject, html);
    return {sent:true,provider:'resend'};
  }catch(e){
    return {sent:false,provider:'resend'};
  }
}

async function sendPasswordResetEmail(email, code){
  if(!RESEND_API_KEY){
    console.log('[auth] RESEND_API_KEY not configured. Password reset code for %s: %s', email, code);
    return {sent:false,provider:'log'};
  }
  try{
    const tpl = await getEmailTemplate('password_reset');
    const html = applyVars(tpl.html, {code});
    const sent = await sendResend(email, tpl.subject, html);
    if(!sent) return {sent:false};
    return {sent:true};
  }catch(e){ console.warn('[auth] Reset email error: %s',e.message); return {sent:false}; }
}

async function sendMagicLinkEmail(email, link, code){
  if(!RESEND_API_KEY){
    console.log('[auth] RESEND_API_KEY not configured. Magic link for %s: %s (code %s)', email, link, code);
    return {sent:false,provider:'log'};
  }
  try{
    const tpl = await getEmailTemplate('magic_link');
    const html = applyVars(tpl.html, {link, code});
    const sent = await sendResend(email, tpl.subject, html);
    if(!sent) return {sent:false};
    return {sent:true};
  }catch(e){ console.warn('[auth] Magic-link email error: %s',e.message); return {sent:false}; }
}

async function redisCmd(...args){
  if(!REDIS_URL||!REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r=await fetch(REDIS_URL,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok) throw new Error('Redis HTTP '+r.status);
  return (await r.json()).result;
}

async function rGet(key){
  const raw=await redisCmd('GET',key);
  if(!raw) return null;
  try{return JSON.parse(raw);}catch(e){return raw;}
}
async function rSet(key,val,ttl){
  const s=typeof val==='string'?val:JSON.stringify(val);
  return ttl ? redisCmd('SETEX',key,String(ttl),s) : redisCmd('SET',key,s);
}
async function rDel(key){ return redisCmd('DEL',key); }
// Push to a Redis list (RPUSH) and cap at 200 entries (LTRIM 0 199)
async function rListPush(key,val){
  const s=typeof val==='string'?val:JSON.stringify(val);
  await redisCmd('RPUSH',key,s);
  await redisCmd('LTRIM',key,'0','199');
}
async function rListRange(key,start,stop){ return redisCmd('LRANGE',key,String(start),String(stop)); }

// Soft-delete: archive user metadata before purging all keys.
// Stores a `deleted:<email>` record in Redis (90-day TTL) so admins can see who left and why.
async function softDeleteUser(userData, opts){
  opts = opts || {};
  const email = userData.email.toLowerCase().trim();
  const record = {
    email: email,
    name: userData.name || '',
    plan: userData.plan || 'free',
    role: userData.role || 'user',
    id: userData.id,
    createdAt: userData.createdAt || null,
    lastLoginAt: userData.lastLoginAt || null,
    loginCount: userData.loginCount || 0,
    deletedAt: Date.now(),
    deletedBy: opts.deletedBy || 'self',       // 'self' or admin email
    deleteReason: opts.deleteReason || '',       // user-provided reason
    stripeCustomerId: userData.stripeCustomerId || null,
  };
  // 90-day TTL (7,776,000 seconds) — enough time to review churn
  await rSet('deleted:'+email, record, 90*24*60*60);
}

// Delete all Redis keys associated with a user account.
// userData must contain: email, id (userId), and optionally stripeCustomerId.
// opts: { deleteReason, deletedBy } — passed to softDeleteUser for archival.
// Revoke every outstanding session token for a user. Scan-based — O(N) over
// all live tokens — but user deletion is rare, and leaving tokens to expire at
// their 30-day TTL leaves stale records in Redis referencing a ghost user.
async function revokeAllTokensForUser(uid){
  if(!uid) return;
  try{
    const keys = await scanAll('token:*');
    if(!keys.length) return;
    const toDelete = [];
    for(const k of keys){
      const data = await rGet(k);
      if(data && data.userId === uid) toDelete.push(rDel(k));
    }
    if(toDelete.length) await Promise.all(toDelete);
  }catch(e){ /* non-fatal — TTL will clean up any that slipped through */ }
}

async function deleteUserKeys(userData, opts){
  // Archive before purging
  await softDeleteUser(userData, opts);
  const uid = userData.id;
  const email = userData.email.toLowerCase().trim();
  // Revoke all sessions first so no concurrent request can touch the user
  // record mid-delete.
  await revokeAllTokensForUser(uid);
  const delOps = [
    rDel('user:'+email),
    rDel('profile:'+uid),
    rDel('photo:'+uid),
    rDel('uid:'+uid),
    rDel('events:'+uid),
  ];
  if(userData.stripeCustomerId) delOps.push(rDel('cid:'+userData.stripeCustomerId));
  // Delete all scenarios for this user
  try{
    const raw = await redisCmd('GET','scenarios:'+uid+':index');
    const index = raw ? (()=>{ try{return JSON.parse(raw);}catch(e){return[];} })() : [];
    if(Array.isArray(index) && index.length){
      for(const s of index){
        delOps.push(rDel('scenarios:'+uid+':state:'+s.id));
        delOps.push(rDel('scenarios:'+uid+':photo:'+s.id));
        delOps.push(rDel('share:'+uid+':'+s.id));
      }
    }
    delOps.push(rDel('scenarios:'+uid+':index'));
  }catch(e){ /* non-fatal — scenarios may not exist */ }
  await Promise.all(delOps);
}

// Scan all keys matching a pattern. Safer than KEYS for large datasets.
async function scanAll(pattern){
  const results=[];
  let cursor='0';
  do{
    const res=await redisCmd('SCAN',cursor,'MATCH',pattern,'COUNT','200');
    cursor=String(res[0]);
    if(res[1]&&res[1].length) results.push(...res[1]);
  }while(cursor!=='0');
  return results;
}

// Increment a rate-limit counter; sets TTL on first increment. Returns current count.
async function rRateInc(key,ttlSecs){
  const count=await redisCmd('INCR',key);
  if(count===1) await redisCmd('EXPIRE',key,String(ttlSecs));
  return count;
}

// Append a structured event for a userId
async function logEvent(userId,type,extra){
  if(!userId) return;
  try{
    await rListPush('events:'+userId, JSON.stringify({type,at:Date.now(),...extra}));
  }catch(e){ console.warn('[auth] logEvent failed:',e.message); }
}

const EMAIL_CODE_TTL_MS = 1000 * 60 * 15; // 15 minutes

// ── Cloudflare Turnstile CAPTCHA verification ────────────────────────────────
const TURNSTILE_SECRET = (process.env.TURNSTILE_SECRET_KEY || '').trim();

async function verifyTurnstile(token, ip){
  if(!TURNSTILE_SECRET) return true; // skip if not configured (dev)
  if(!token) return false;
  try{
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'secret='+encodeURIComponent(TURNSTILE_SECRET)+'&response='+encodeURIComponent(token)+'&remoteip='+encodeURIComponent(ip||'')
    });
    const data = await res.json();
    return data.success === true;
  }catch(e){
    console.warn('[auth] Turnstile verification error:', e.message);
    return false;
  }
}

function hashPw(pw){ return crypto.createHmac('sha256',SALT).update(pw).digest('hex'); }
function makeToken(){ return crypto.randomBytes(32).toString('hex'); }
// 8-char alphanumeric code from a readable alphabet (excludes 0/1/O/I to avoid
// transcription errors). 32^8 ≈ 1.1 × 10^12 — far beyond brute-force range
// even without the 5-attempt-per-code lockout applied in resetPasswordWithToken.
const EMAIL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeEmailCode(){
  let out = '';
  for(let i=0;i<8;i++) out += EMAIL_CODE_ALPHABET[crypto.randomInt(0, EMAIL_CODE_ALPHABET.length)];
  return out;
}
function hashEmailCode(code){ return crypto.createHmac('sha256',SALT).update('email-code:'+String(code).toUpperCase()).digest('hex'); }
// Constant-time string compare — prevents timing attacks on hash comparisons
function safeEqual(a,b){ try{ return a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex')); }catch(e){ return false; } }

// Issue a logged-in session for a magic-link verification (link or code).
// Mirrors what action='signin' does at success, so the response shape and
// cookie behaviour are identical from the client's perspective.
async function issueMagicSession(event, user, normalizedEmail){
  if(!await rGet('uid:'+user.id)) await rSet('uid:'+user.id,normalizedEmail);
  user.lastLoginAt=Date.now();
  user.loginCount=(user.loginCount||0)+1;
  user.lastLoginIp=(event.headers?.['x-nf-client-connection-ip']||'').split(',')[0].trim()||event.headers?.['x-real-ip']||'';
  await rSet('user:'+normalizedEmail,user);
  await logEvent(user.id,'signin_magic',{ip:user.lastLoginIp||''});
  const token=makeToken();
  await rSet('token:'+token,{userId:user.id,email:user.email||normalizedEmail,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
  const result={ok:true,id:user.id,name:user.name,email:user.email||normalizedEmail,plan:user.plan||'free',role:user.role||'user'};
  if(user.subscription_canceled_at) result.canceledAt=user.subscription_canceled_at;
  if(user.subscription_expires_at) result.expiresAt=user.subscription_expires_at;
  if(user.subscription_renews_at) result.renewsAt=user.subscription_renews_at;
  return ok(result, buildSessionCookie(token, TOKEN_TTL));
}
let H = {};
// ok() accepts an optional `setCookie` string which is attached as a Set-Cookie
// response header without mutating the shared H headers object.
function ok(b, setCookie){
  const headers = setCookie ? Object.assign({}, H, {'Set-Cookie': setCookie}) : H;
  return {statusCode:200,headers,body:JSON.stringify(b)};
}
function fail(msg,code){ return {statusCode:code||200,headers:H,body:JSON.stringify({ok:false,error:msg})}; }

// Verify a session token. Reads the HttpOnly es_session cookie only — no
// Authorization header fallback since all clients are cookie-based (Phase 6).
// Returns the token payload or null.
async function verifyToken(event){
  const token = readCookieToken(event);
  if(!token) return null;
  const data=await rGet('token:'+token);
  if(!data) return null;
  if(data.expires&&Date.now()>data.expires){ await rDel('token:'+token); return null; }
  return data;
}

exports.handler = async function(event){
  H = getCorsHeaders(event);
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};
  if(!SALT) return fail('Server configuration error — AUTH_SALT not set', 500);

  // Reject mutating requests whose Origin isn't in our allowlist (CSRF).
  if(event.httpMethod!=='GET' && !isAllowedOrigin(event)) return fail('Forbidden',403);

  // GET = verify cookie-backed session
  if(event.httpMethod==='GET'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    return ok({ok:true,...user});
  }

  if(!REDIS_URL||!REDIS_TOKEN){
    return fail('Auth not configured — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Netlify Site Settings → Environment variables');
  }

  // ── General per-IP rate limit: max 30 auth requests per 60 seconds ──────────
  const reqIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();
  try{
    const ipCount=await rRateInc('authReq:'+reqIp, 60);
    if(ipCount>30) return fail('Too many requests — please slow down', 429);
  }catch(e){ /* non-fatal — don't block if Redis hiccups */ }

  let body;
  try{body=JSON.parse(event.body||'{}');}catch(e){return fail('Bad request',400);}
  const {action}=body;

  if(action==='signup'){
    const {email,password,name,plan,ref,turnstileToken}=body;
    if(!email||!password) return fail('Email and password required');
    // Turnstile CAPTCHA verification
    const clientIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();
    if(TURNSTILE_SECRET && !await verifyTurnstile(turnstileToken, clientIp)) return fail('Security check failed — please try again', 403);
    // Rate limit signups per IP to prevent email-bombing the transactional email service
    const signupRateKey='signup:'+clientIp;
    const signupCount=await rRateInc(signupRateKey,3600); // 1-hour window
    if(signupCount>10) return fail('Too many signups from this IP — please try again later');
    const siteCfgSu=await rGet('config:site')||{};
    if(siteCfgSu.allowSignups===false) return fail('New signups are currently disabled. Please contact support.');
    const pwMin=parseInt(siteCfgSu.minPasswordLength)||8;
    if(password.length<pwMin) return fail('Password must be at least '+pwMin+' characters');
    if(siteCfgSu.requireEmailDomain){
      const domain=siteCfgSu.requireEmailDomain.toLowerCase().replace(/^@/,'');
      const emailDomain=normalizedEmail.split('@').pop();
      if(emailDomain!==domain) return fail('Signups are restricted to @'+domain+' email addresses');
    }
    const normalizedEmail=email.toLowerCase().trim();
    const ekey='user:'+normalizedEmail;
    if(await rGet(ekey)) return fail('An account with this email already exists');
    const userId=Date.now().toString(36)+crypto.randomBytes(4).toString('hex');
    const code=makeEmailCode();
    const refCode=(userId.slice(0,8)).toUpperCase();
    const user={
      name:(name||normalizedEmail.split('@')[0]).trim(),
      hash:hashPw(password),
      id:userId,
      plan:plan||'free',
      email:normalizedEmail,
      createdAt:Date.now(),
      emailVerified:false,
      emailVerificationCodeHash:hashEmailCode(code),
      emailVerificationExpiresAt:Date.now()+EMAIL_CODE_TTL_MS,
      emailVerificationAttempts:0,
      emailVerificationSentAt:Date.now(),
      referralCode:refCode,
      referralCount:0
    };
    // Store pre-signup page trail (max 20 entries from client, sanitised)
    if(Array.isArray(body.pageTrail)&&body.pageTrail.length){
      user.signupPageTrail=body.pageTrail.slice(-20).map(e=>({
        p:String(e.p||'').slice(0,200),
        t:typeof e.t==='number'?e.t:0,
        q:e.q?String(e.q).slice(0,120):undefined
      }));
    }
    // Handle incoming referral
    const incomingRef=(ref||'').trim().toUpperCase().slice(0,16);
    if(incomingRef){
      const referrerId=await rGet('referral:'+incomingRef);
      if(referrerId&&referrerId!==userId) user.referredBy=referrerId;
    }
    await rSet(ekey,user);
    await rSet('referral:'+refCode,userId);
    await rSet('uid:'+userId,normalizedEmail); // reverse index for scenarios auth
    await logEvent(userId,'signup',{name:user.name,email:normalizedEmail,plan:user.plan});
    await sendVerificationEmail(normalizedEmail, code);
    return ok({ok:true,requiresEmailVerification:true,email:user.email,plan:user.plan,name:user.name});
  }

  if(action==='signin'){
    const {email,password,turnstileToken}=body;
    if(!email||!password) return fail('Email and password required');
    // Turnstile CAPTCHA verification
    const signinIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();
    if(TURNSTILE_SECRET && !await verifyTurnstile(turnstileToken, signinIp)) return fail('Security check failed — please try again', 403);
    const normalizedEmail=email.toLowerCase().trim();
    // Rate limit — per-email cap prevents credential stuffing on a single
    // account; per-IP cap prevents low-and-slow attacks hitting many accounts
    // from one source.
    const failKey='loginFail:'+normalizedEmail;
    const failCount=Number(await rGet(failKey)||0);
    if(failCount>=10) return fail('Too many failed sign-in attempts. Please wait 15 minutes or reset your password.');
    const ipKey='loginFailIp:'+signinIp;
    const ipFailCount=Number(await rGet(ipKey)||0);
    if(ipFailCount>=30) return fail('Too many failed sign-in attempts from your network. Please wait 15 minutes.');
    const user=await rGet('user:'+normalizedEmail);
    if(!user){ await rRateInc(failKey,900); await rRateInc(ipKey,900); return fail('Email or password incorrect'); }
    if(!safeEqual(user.hash,hashPw(password))){ await rRateInc(failKey,900); await rRateInc(ipKey,900); return fail('Email or password incorrect'); }
    await rDel(failKey); // clear per-email counter on success (IP counter keeps
                        // its window — legitimate users rarely exceed 30/15min)
    if(!await rGet('uid:'+user.id)) await rSet('uid:'+user.id,normalizedEmail); // backfill reverse index
    if(user.emailVerified===false){
      return ok({ok:false,error:'Please verify your email before signing in.',requiresEmailVerification:true,email:user.email,name:user.name,plan:user.plan||'free'});
    }
    user.lastLoginAt=Date.now();
    user.loginCount=(user.loginCount||0)+1;
    user.lastLoginIp=(event.headers?.['x-nf-client-connection-ip']||'').split(',')[0].trim()||event.headers?.['x-real-ip']||'';
    await rSet('user:'+normalizedEmail,user);
    await logEvent(user.id,'signin',{ip:user.lastLoginIp||''});
    const token=makeToken();
    await rSet('token:'+token,{userId:user.id,email:user.email||email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    const result={ok:true,id:user.id,name:user.name,email:user.email||email,plan:user.plan||'free',role:user.role||'user'};
    if(user.subscription_canceled_at) result.canceledAt=user.subscription_canceled_at;
    if(user.subscription_expires_at) result.expiresAt=user.subscription_expires_at;
    if(user.subscription_renews_at) result.renewsAt=user.subscription_renews_at;
    return ok(result, buildSessionCookie(token, TOKEN_TTL));
  }

  if(action==='resendVerification'){
    const normalizedEmail=(body.email||'').toLowerCase().trim();
    if(!normalizedEmail) return fail('Email required');
    // Rate limit: max 3 resend requests per email per hour (prevent email bombing)
    const rvKey='resendVerif:'+normalizedEmail;
    const rvCount=await rRateInc(rvKey,3600);
    if(rvCount>3) return ok({ok:true,requiresEmailVerification:true,email:normalizedEmail}); // silent cap
    const user=await rGet('user:'+normalizedEmail);
    if(!user) return ok({ok:true,requiresEmailVerification:true,email:normalizedEmail}); // don't reveal existence
    if(user.emailVerified) return ok({ok:true,requiresEmailVerification:true,email:normalizedEmail}); // same response — don't reveal account state
    const code=makeEmailCode();
    user.emailVerificationCodeHash=hashEmailCode(code);
    user.emailVerificationExpiresAt=Date.now()+EMAIL_CODE_TTL_MS;
    user.emailVerificationSentAt=Date.now();
    await rSet('user:'+normalizedEmail,user);
    await sendVerificationEmail(normalizedEmail, code);
    return ok({ok:true,requiresEmailVerification:true,email:normalizedEmail});
  }

  if(action==='verifyEmail'){
    const normalizedEmail=(body.email||'').toLowerCase().trim();
    const code=String(body.code||'').trim();
    if(!normalizedEmail||!code) return fail('Email and code required');
    const user=await rGet('user:'+normalizedEmail);
    if(!user) return fail('No account found for this email');
    if(user.emailVerified){
      const token=makeToken();
      await rSet('token:'+token,{userId:user.id,email:user.email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
      return ok({ok:true,token,id:user.id,name:user.name,email:user.email,plan:user.plan||'free',role:user.role||'user',alreadyVerified:true}, buildSessionCookie(token, TOKEN_TTL));
    }
    if(!user.emailVerificationCodeHash||!user.emailVerificationExpiresAt||Date.now()>user.emailVerificationExpiresAt){
      return fail('Verification code expired. Please request a new code.');
    }
    user.emailVerificationAttempts=(user.emailVerificationAttempts||0)+1;
    if(user.emailVerificationAttempts>8) return fail('Too many attempts. Please request a new code.');
    if(user.emailVerificationCodeHash!==hashEmailCode(code)){
      await rSet('user:'+normalizedEmail,user);
      return fail('Incorrect verification code.');
    }
    user.emailVerified=true;
    user.emailVerifiedAt=Date.now();
    delete user.emailVerificationCodeHash;
    delete user.emailVerificationExpiresAt;
    delete user.emailVerificationAttempts;
    // Record first login stats (same fields captured on signin)
    user.lastLoginAt=Date.now();
    user.loginCount=1;
    user.lastLoginIp=(event.headers?.['x-nf-client-connection-ip']||'').split(',')[0].trim()||event.headers?.['x-real-ip']||'';
    await rSet('user:'+normalizedEmail,user);
    await logEvent(user.id,'email_verified',{ip:user.lastLoginIp||''});
    sendWelcomeEmail(normalizedEmail, user.name).catch(()=>{});
    notifyAdminsNewUser(normalizedEmail, user.name, user.plan||'free').catch(()=>{});
    const token=makeToken();
    await rSet('token:'+token,{userId:user.id,email:user.email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    const result={ok:true,id:user.id,name:user.name,email:user.email,plan:user.plan||'free',role:user.role||'user'};
    if(user.subscription_canceled_at) result.canceledAt=user.subscription_canceled_at;
    if(user.subscription_expires_at) result.expiresAt=user.subscription_expires_at;
    if(user.subscription_renews_at) result.renewsAt=user.subscription_renews_at;
    return ok(result, buildSessionCookie(token, TOKEN_TTL));
  }

  if(action==='googleSignin'){
    const {credential}=body;
    if(!credential) return fail('No credential provided');

    // Verify Google ID token via tokeninfo endpoint (stateless — no client secret needed)
    let tokenData;
    try{
      const res=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential));
      tokenData=await res.json();
    }catch(e){ return fail('Could not verify Google credential — please try again'); }

    if(tokenData.error||!tokenData.email||tokenData.email_verified==='false'){
      return fail('Google sign-in failed — unverified credential');
    }

    // Validate audience matches our client ID — mandatory.
    // Falls back to Redis config so the env var is optional (but recommended).
    const GOOGLE_CLIENT_ID=((process.env.GOOGLE_CLIENT_ID||'').trim())||((await rGet('config:site'))||{}).googleClientId||'';
    if(!GOOGLE_CLIENT_ID) return fail('Google Sign-In is not configured — add your Client ID in Admin → Configuration');
    if(tokenData.aud!==GOOGLE_CLIENT_ID) return fail('Google sign-in failed — client ID mismatch');

    const email=tokenData.email.toLowerCase().trim();
    const name=tokenData.name||tokenData.given_name||email.split('@')[0];
    const ekey='user:'+email;
    let user=await rGet(ekey);
    const clientIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();

    if(!user){
      // New user — create account (no password, no email verification needed)
      const siteCfg=await rGet('config:site')||{};
      if(siteCfg.allowSignups===false) return fail('New signups are currently disabled. Please contact support.');
      const userId=Date.now().toString(36)+crypto.randomBytes(4).toString('hex');
      const refCode=userId.slice(0,8).toUpperCase();
      user={
        name,
        hash:null,
        id:userId,
        plan:'free',
        email,
        createdAt:Date.now(),
        emailVerified:true,
        oauthProviders:['google'],
        referralCode:refCode,
        referralCount:0,
        lastLoginAt:Date.now(),
        loginCount:1,
        lastLoginIp:clientIp,
      };
      // Store pre-signup page trail for Google signups
      if(Array.isArray(body.pageTrail)&&body.pageTrail.length){
        user.signupPageTrail=body.pageTrail.slice(-20).map(e=>({
          p:String(e.p||'').slice(0,200),
          t:typeof e.t==='number'?e.t:0,
          q:e.q?String(e.q).slice(0,120):undefined
        }));
      }
      await rSet(ekey,user);
      await rSet('referral:'+refCode,userId);
      await rSet('uid:'+userId,email);
      await logEvent(userId,'signup',{name,email,plan:'free',provider:'google'});
      sendWelcomeEmail(email,name).catch(()=>{});
      notifyAdminsNewUser(email,name,'free').catch(()=>{});
    }else{
      // Existing user — sign in, flag as google-linked if not already
      if(!user.oauthProviders||!user.oauthProviders.includes('google')){
        user.oauthProviders=(user.oauthProviders||[]).concat('google');
      }
      user.lastLoginAt=Date.now();
      user.loginCount=(user.loginCount||0)+1;
      user.lastLoginIp=clientIp;
      await rSet(ekey,user);
      await logEvent(user.id,'signin',{provider:'google'});
    }

    const token=makeToken();
    await rSet('token:'+token,{userId:user.id,email:user.email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    const result={ok:true,id:user.id,name:user.name,email:user.email,plan:user.plan||'free',role:user.role||'user'};
    if(user.subscription_canceled_at) result.canceledAt=user.subscription_canceled_at;
    if(user.subscription_expires_at) result.expiresAt=user.subscription_expires_at;
    if(user.subscription_renews_at) result.renewsAt=user.subscription_renews_at;
    return ok(result, buildSessionCookie(token, TOKEN_TTL));
  }

  if(action==='verify'){
    // Token lives in the HttpOnly es_session cookie (Phase 6).
    const token = readCookieToken(event);
    if(!token) return fail('Token required');
    const data=await rGet('token:'+token);
    if(!data||(data.expires&&Date.now()>data.expires)) return fail('Invalid or expired session');
    // Check if user still exists (deleted users should be logged out)
    const userData=await rGet('user:'+data.email);
    if(!userData) return fail('User account has been deleted');
    // Always return latest plan/role from user record so admin changes + Stripe
    // webhook upgrades take effect immediately on the next verify poll.
    const freshPlan = userData.plan||data.plan;
    const freshRole = userData.role||data.role;
    const planDrifted = (data.plan !== freshPlan) || (data.role !== freshRole);
    try{
      data.plan = freshPlan;
      data.role = freshRole;
      // Include subscription status fields
      if(userData.subscription_canceled_at) data.canceledAt=userData.subscription_canceled_at;
      if(userData.subscription_expires_at) data.expiresAt=userData.subscription_expires_at;
      if(userData.subscription_renews_at) data.renewsAt=userData.subscription_renews_at;
      // Tighten cached token record when it's gone stale (plan upgrade /
      // admin role change). Preserves the TTL so we don't extend session
      // life silently.
      if (planDrifted) {
        const remaining = Math.max(1, Math.round(((data.expires||0) - Date.now())/1000));
        await rSet('token:'+token, data, remaining);
      }
    }catch(e){}
    // Throttled "last active" refresh: bump lastActiveAt at most once per hour
    // to record ongoing usage separate from explicit sign-ins. lastLoginAt is
    // only updated on real auth events (signin/googleSignin/verifyEmail).
    try{
      if(Date.now()-(userData.lastActiveAt||userData.lastLoginAt||0) > 60*60*1000){
        userData.lastActiveAt=Date.now();
        userData.lastActiveIp=(event.headers?.['x-nf-client-connection-ip']||'').split(',')[0].trim()||event.headers?.['x-real-ip']||userData.lastActiveIp||'';
        await rSet('user:'+data.email,userData);
      }
    }catch(e){}
    return ok({ok:true,...data});
  }

  if(action==='signout'){
    // Token is resolved from the HttpOnly cookie (Phase 6). The body/header
    // fallbacks are gone — a logged-out client has nothing to send anyway.
    const token = readCookieToken(event);
    if(token){
      const td=await rGet('token:'+token);
      if(td&&td.userId) logEvent(td.userId,'signout',{}).catch(()=>{});
      await rDel('token:'+token);
    }
    // Always clear the cookie on the client even if no server-side token was found.
    return ok({ok:true}, buildClearSessionCookie());
  }

  if(action==='getProfile'||action==='setProfile'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    if(action==='getProfile'){
      const p=await rGet('profile:'+user.userId)||{};
      const photo=await rGet('photo:'+user.userId);
      if(photo) p.photo=photo;
      const result={ok:true,profile:p};
      // Include latest plan and subscription status from user record
      try{
        const userData=await rGet('user:'+user.email);
        if(userData){
          result.plan=userData.plan||'free';
          result.name=userData.name||user.name;
          result.role=userData.role||'user';
          if(userData.subscription_canceled_at) result.canceledAt=userData.subscription_canceled_at;
          if(userData.subscription_expires_at) result.expiresAt=userData.subscription_expires_at;
          if(userData.subscription_renews_at) result.renewsAt=userData.subscription_renews_at;
        }
      }catch(e){}
      return ok(result);
    }
    const {profile}=body;
    const existing=await rGet('profile:'+user.userId)||{};
    // Whitelist profile fields and sanitise values to prevent CSS/HTML injection
    const sanitised={};
    if('name'  in profile) sanitised.name  = String(profile.name ||'').trim().slice(0,100);
    if('email' in profile) sanitised.email = String(profile.email||'').trim().slice(0,200);
    if('color' in profile){
      const c = String(profile.color||'');
      // Only accept hex colours — prevents CSS injection via style="" attributes
      if(/^#[0-9A-Fa-f]{3,8}$/.test(c)) sanitised.color = c;
    }
    if('theme' in profile) sanitised.theme = ['light','dark'].includes(profile.theme) ? profile.theme : 'light';
    const merged={...existing,...sanitised};
    delete merged.photo; // large photos use setPhoto action
    await rSet('profile:'+user.userId,merged);
    return ok({ok:true});
  }

  if(action==='setPhoto'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    const {photo}=body;
    if(photo){
      const s=String(photo);
      const m=/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
      if(!m) return fail('Invalid photo format');
      // Cap at ~800 KB (base64 of ~600 KB image) to prevent Redis abuse.
      if(s.length>1100000) return fail('Photo too large — maximum ~800 KB');
      const declaredType=m[1];
      let buf;
      try{ buf=Buffer.from(m[2],'base64'); }catch(e){ return fail('Invalid photo encoding'); }
      if(buf.length<8 || buf.length>800*1024) return fail('Invalid photo size');
      // Magic-byte sniff — prevents clients from declaring image/png while
      // shipping arbitrary bytes. Each format check mirrors the declared type.
      const sniffed =
        buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF ? 'jpeg' :
        buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47 &&
        buf[4]===0x0D && buf[5]===0x0A && buf[6]===0x1A && buf[7]===0x0A ? 'png' :
        buf.slice(0,4).toString('ascii')==='RIFF' && buf.slice(8,12).toString('ascii')==='WEBP' ? 'webp' :
        (buf.slice(0,6).toString('ascii')==='GIF87a' || buf.slice(0,6).toString('ascii')==='GIF89a') ? 'gif' :
        null;
      if(sniffed!==declaredType) return fail('Photo content does not match declared image type');
      await rSet('photo:'+user.userId,s);
    } else {
      await rDel('photo:'+user.userId);
    }
    return ok({ok:true});
  }

  if(action==='changePassword'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    const {currentPassword,newPassword}=body;
    if(!currentPassword||!newPassword) return fail('Both passwords required');
    if(newPassword.length<8) return fail('New password must be at least 8 characters');
    const userData=await rGet('user:'+user.email);
    if(!userData) return fail('Account not found');
    if(!safeEqual(userData.hash,hashPw(currentPassword))) return fail('Current password is incorrect');
    userData.hash=hashPw(newPassword);
    await rSet('user:'+user.email,userData);
    await logEvent(userData.id,'password_changed',{});
    return ok({ok:true});
  }

  if(action==='requestPasswordReset'){
    const {email,turnstileToken}=body;
    if(!email) return fail('Email required');
    // Turnstile CAPTCHA verification
    const resetIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();
    if(TURNSTILE_SECRET && !await verifyTurnstile(turnstileToken, resetIp)) return fail('Security check failed — please try again', 403);
    const normalizedEmail=email.toLowerCase().trim();
    // Rate limit: max 3 reset emails per email per hour (prevent email bombing)
    const rrKey='pwResetReq:'+normalizedEmail;
    const rrCount=await rRateInc(rrKey,3600);
    if(rrCount>3) return ok({ok:true,message:'If an account exists, a reset code has been sent.'}); // silent cap
    const userData=await rGet('user:'+normalizedEmail);
    // Always return ok to prevent email enumeration
    if(userData){
      const code=makeEmailCode();
      const hashed=hashEmailCode(code);
      // Store attempts counter alongside the hash. Each wrong guess increments
      // it; at 5 the code is invalidated. 30-minute TTL matches the email copy.
      await rSet('pwreset:'+normalizedEmail,{hash:hashed,email:normalizedEmail,attempts:0},1800);
      await sendPasswordResetEmail(normalizedEmail,code);
    }
    return ok({ok:true,message:'If an account exists, a reset code has been sent.'});
  }

  if(action==='resetPasswordWithToken'){
    const {email,code,newPassword}=body;
    if(!email||!code||!newPassword) return fail('Email, code and new password required');
    if(newPassword.length<8) return fail('Password must be at least 8 characters');
    const normalizedEmail=email.toLowerCase().trim();
    const resetData=await rGet('pwreset:'+normalizedEmail);
    if(!resetData) return fail('Invalid or expired reset code');
    const submitted=hashEmailCode(String(code).trim());
    if(!safeEqual(resetData.hash, submitted)){
      // Per-code lockout: burn the code after 5 wrong guesses so the attacker
      // can't keep guessing a different 8-char code for the same email.
      const attempts=(resetData.attempts||0)+1;
      if(attempts>=5){
        await rDel('pwreset:'+normalizedEmail);
        return fail('Too many incorrect attempts — request a new reset code.');
      }
      await rSet('pwreset:'+normalizedEmail,{...resetData,attempts},1800);
      return fail('Invalid or expired reset code');
    }
    const userData=await rGet('user:'+normalizedEmail);
    if(!userData) return fail('Account not found');
    userData.hash=hashPw(newPassword);
    await rSet('user:'+normalizedEmail,userData);
    await rDel('pwreset:'+normalizedEmail);
    await logEvent(userData.id,'password_reset',{});
    return ok({ok:true});
  }

  // ── Magic-link sign-in ───────────────────────────────────────────────
  // Sends an email containing both a clickable magic link AND a 6-digit
  // OTP code. Either path validates the same Redis-stored token and
  // produces the same session cookie that ?action=signin does. Always
  // returns ok:true to prevent account-existence enumeration.
  if(action==='sendMagicLink'){
    const {email,turnstileToken}=body;
    if(!email) return fail('Email required');
    const mlIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();
    if(TURNSTILE_SECRET && !await verifyTurnstile(turnstileToken, mlIp)) return fail('Security check failed — please try again', 403);
    const normalizedEmail=email.toLowerCase().trim();
    // Per-email rate limit: 5 magic-link requests per hour.
    const mlEmailKey='magicLinkReq:'+normalizedEmail;
    if((await rRateInc(mlEmailKey,3600))>5) return ok({ok:true,message:'If an account exists, a sign-in link has been sent.'});
    // Per-IP rate limit: 10 per hour (catches IP-rotated email-bombing).
    const mlIpKey='magicLinkReqIp:'+mlIp;
    if((await rRateInc(mlIpKey,3600))>10) return ok({ok:true,message:'If an account exists, a sign-in link has been sent.'});
    const userData=await rGet('user:'+normalizedEmail);
    if(userData && userData.emailVerified !== false){
      // 256-bit random token for the link, plus a separate 6-digit code
      // for users whose email scanner pre-fetches and consumes the link.
      const token=crypto.randomBytes(32).toString('hex');
      const code=String(crypto.randomInt(100000, 1000000));
      const expiresAt=Date.now() + 15*60*1000; // 15 minutes
      // Store under the token (link path) AND under email→token (code path).
      // Single-use: both keys are deleted when consumed.
      await rSet('magic:'+token, {
        email: normalizedEmail,
        userId: userData.id,
        codeHash: crypto.createHmac('sha256',SALT).update('magic-code:'+code).digest('hex'),
        attempts: 0,
        expiresAt,
      }, 15*60);
      await rSet('magicEmail:'+normalizedEmail, token, 15*60);
      const link='https://equitysight.app/login?magic='+encodeURIComponent(token);
      await sendMagicLinkEmail(normalizedEmail, link, code);
    }
    return ok({ok:true,message:'If an account exists, a sign-in link has been sent.'});
  }

  // Verify the clickable link path. The user lands on /login?magic=TOKEN
  // and the page calls this on page-load.
  if(action==='verifyMagicLink'){
    const {token}=body;
    if(!token) return fail('Token required');
    const data=await rGet('magic:'+token);
    if(!data || (data.expiresAt && Date.now()>data.expiresAt)) return fail('Sign-in link is invalid or has expired. Please request a new one.');
    const user=await rGet('user:'+data.email);
    if(!user) return fail('Account not found');
    // Single-use: delete BOTH keys atomically so a leaked link can't be
    // re-used and so the email→token reverse index doesn't dangle.
    await rDel('magic:'+token);
    await rDel('magicEmail:'+data.email);
    return await issueMagicSession(event, user, data.email);
  }

  // Verify the 6-digit code path. User typed the code from the email.
  if(action==='verifyMagicCode'){
    const {email,code}=body;
    if(!email||!code) return fail('Email and code required');
    const normalizedEmail=email.toLowerCase().trim();
    const token=await rGet('magicEmail:'+normalizedEmail);
    if(!token) return fail('Sign-in code is invalid or has expired. Please request a new one.');
    const data=await rGet('magic:'+token);
    if(!data || (data.expiresAt && Date.now()>data.expiresAt)) return fail('Sign-in code is invalid or has expired. Please request a new one.');
    const submittedHash=crypto.createHmac('sha256',SALT).update('magic-code:'+String(code).trim()).digest('hex');
    if(!safeEqual(data.codeHash, submittedHash)){
      // Burn the token after 5 wrong attempts so an attacker can't keep
      // brute-forcing the same email.
      const attempts=(data.attempts||0)+1;
      if(attempts>=5){
        await rDel('magic:'+token);
        await rDel('magicEmail:'+normalizedEmail);
        return fail('Too many incorrect attempts — request a new sign-in link.');
      }
      await rSet('magic:'+token,{...data,attempts},15*60);
      return fail('Sign-in code is invalid or has expired. Please request a new one.');
    }
    const user=await rGet('user:'+normalizedEmail);
    if(!user) return fail('Account not found');
    await rDel('magic:'+token);
    await rDel('magicEmail:'+normalizedEmail);
    return await issueMagicSession(event, user, normalizedEmail);
  }


  if(action==='deleteAccount'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    const {password,deleteReason}=body;
    if(!password) return fail('Password required to confirm deletion');
    const userData=await rGet('user:'+user.email);
    if(!userData) return fail('Account not found');
    if(!safeEqual(userData.hash,hashPw(password))) return fail('Incorrect password');
    // deleteUserKeys() now revokes every token for this user, so we just need
    // to clear the cookie on the browser.
    await deleteUserKeys(userData, {deleteReason: (deleteReason||'').slice(0,500), deletedBy:'self'});
    return ok({ok:true}, buildClearSessionCookie());
  }

  if(action==='adminListUsers'){
    // Admin only — verify token has admin role
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    // Return limited user data — no passwords
    const keys=await scanAll('user:*');
    if(!keys||!keys.length) return ok({ok:true,users:[]});
    const users=await Promise.all(keys.map(async k=>{
      const u=await rGet(k);
      return u?{email:u.email,name:u.name,plan:u.plan,id:u.id,createdAt:u.createdAt,role:u.role,
                lastLoginAt:u.lastLoginAt,lastActiveAt:u.lastActiveAt,loginCount:u.loginCount,lastLoginIp:u.lastLoginIp,
                stripeDiscountInfo:u.stripeDiscountInfo||null}:null;
    }));
    return ok({ok:true,users:users.filter(Boolean)});
  }

  if(action==='adminResetPassword'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail,newPassword}=body;
    if(!targetEmail||!newPassword) return fail('targetEmail and newPassword required');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    userData.hash=hashPw(newPassword);
    await rSet('user:'+targetEmail.toLowerCase().trim(),userData);
    await logEvent(userData.id,'admin_password_reset',{by:user.email});
    return ok({ok:true});
  }

  if(action==='adminDeleteUser'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail}=body;
    if(!targetEmail) return fail('targetEmail required');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    await deleteUserKeys(userData, {deletedBy: user.email});
    return ok({ok:true});
  }

  if(action==='adminListDeletedUsers'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const keys=await scanAll('deleted:*');
      if(!keys||!keys.length) return ok({ok:true,deletedUsers:[]});
      const records=await Promise.all(keys.map(k=>rGet(k)));
      const deletedUsers=records.filter(Boolean).sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
      return ok({ok:true,deletedUsers});
    }catch(e){ return fail('Error listing deleted users: '+e.message); }
  }

  if(action==='adminSetRole'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail,role}=body;
    if(!targetEmail||!role) return fail('targetEmail and role required');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    const prevRole=userData.role||'user';
    userData.role=role;
    await rSet('user:'+targetEmail.toLowerCase().trim(),userData);
    await logEvent(userData.id,'role_changed',{from:prevRole,to:role,by:user.email});
    return ok({ok:true});
  }

  if(action==='adminGetUserEvents'){
    const admin=await verifyToken(event);
    if(!admin||admin.role!=='admin') return fail('Unauthorized',401);
    const {targetUserId}=body;
    if(!targetUserId) return fail('targetUserId required');
    try{
      const raw=await rListRange('events:'+targetUserId,0,-1);
      const events=(raw||[]).map(s=>{ try{return JSON.parse(s);}catch(e){return {type:'unknown',at:0,raw:s};} });
      events.sort((a,b)=>b.at-a.at);
      return ok({ok:true,events});
    }catch(e){
      return ok({ok:true,events:[]});
    }
  }

  if(action==='setSelfAdmin'){
    // Bootstrap: first user can claim admin — only works if NO admin exists yet
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    // Check if any admin exists
    const keys=await scanAll('user:*');
    if(keys&&keys.length){
      const users=await Promise.all(keys.map(async k=>rGet(k)));
      const hasAdmin=users.some(u=>u&&u.role==='admin');
      if(hasAdmin) return fail('An admin already exists. Contact the existing admin.');
    }
    const userData=await rGet('user:'+user.email);
    if(!userData) return fail('Account not found');
    userData.role='admin';
    await rSet('user:'+user.email,userData);
    // Refresh token with admin role
    const token=makeToken();
    await rSet('token:'+token,{userId:user.userId,email:user.email,name:user.name,plan:user.plan,role:'admin',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    return ok({ok:true,role:'admin'}, buildSessionCookie(token, TOKEN_TTL));
  }

  if(action==='getPublicConfig'){
    // Returns a whitelist of public (non-secret) config values — no auth required.
    // Used by login.js to get googleClientId before a session exists.
    const cfg=await rGet('config:site')||{};
    return ok({ok:true,config:{
      googleClientId:cfg.googleClientId||'',
      allowSignups:cfg.allowSignups!==false,
      maintenanceMode:cfg.maintenanceMode||false,
      maintenanceMessage:cfg.maintenanceMessage||'',
      bannerText:cfg.bannerText||'',
      bannerType:cfg.bannerType||'info',
      bannerExpiry:cfg.bannerExpiry||null,
    }});
  }

  if(action==='adminGetConfig'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const cfg=await rGet('config:site')||{};
    return ok({ok:true,config:cfg});
  }

  if(action==='adminSetConfig'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {config}=body;
    if(!config||typeof config!=='object') return fail('config object required');
    // Whitelist safe keys — don't let arbitrary data overwrite system keys
    const allowed=['siteName','siteTagline','supportEmail','siteUrl',
      'maintenanceMode','maintenanceMessage','allowSignups','minPasswordLength',
      'bannerText','bannerType','bannerExpiry',
      'freeScenarioLimit','proScenarioLimit',
      'enablePdfExport','enableProjections','enableGuestAccess',
      'proMonthlyPrice','proAnnualPrice','adviserMonthlyPrice',
      'contactDiscord','contactTwitter','referralEnabled','referralBonus',
      'maxUploadMb','sessionTtlDays','requireEmailDomain',
      'stripePubKey','stripeProMonthly','stripeProAnnual','stripeAdviserMonthly','stripeAdviserAnnual','stripePortal',
      'suburbDeployHook','suburbLastBuild',
      'googleClientId',
      'logoImage','logoMark','logoName','logoTld','brandColor','colorTheme'];
    const sanitised={};
    for(const k of allowed) if(k in config) sanitised[k]=config[k];
    await rSet('config:site',sanitised);
    return ok({ok:true});
  }

  if(action==='triggerSuburbBuild'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const cfg=await rGet('config:site')||{};
    const hookUrl=cfg.suburbDeployHook;
    if(!hookUrl) return fail('No deploy hook URL configured');
    // Proxy the deploy hook call server-side (avoids CORS)
    const resp=await fetch(hookUrl+'?trigger_title=Suburb+rebuild+(admin)',{method:'POST'});
    if(!resp.ok) return fail('Deploy hook returned '+resp.status);
    // Save rebuild timestamp
    cfg.suburbLastBuild=new Date().toISOString();
    await rSet('config:site',cfg);
    return ok({ok:true,message:'Suburb rebuild triggered'});
  }

  if(action==='adminGetStats'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    // Short-lived cache — the 30-day historical backfill is the slow path
    // (N users × M events per user, sequential per day). Repeat loads
    // (tab switch, second admin viewing) hit the cache and return in
    // <50 ms instead of 3–5 s. The Refresh Stats button passes
    // forceRefresh:true to bypass the cache when a fresh snapshot is
    // actually wanted.
    const STATS_CACHE_KEY = 'stats:dashboard:cache:v1';
    const STATS_CACHE_TTL = 5 * 60;
    if(!body.forceRefresh){
      try{
        const cached = await rGet(STATS_CACHE_KEY);
        if(cached) return ok(Object.assign({}, cached, {cached:true}));
      }catch(e){ /* fall through to recompute */ }
    }
    try{
      // Parallelise the five scans — previously sequential, accounting for
      // ~70% of admin dashboard load time. Each scanAll is multiple round-
      // trips to Upstash (SCAN cursor loop), so running them concurrently
      // turns ~5×latency into ~1×latency.
      const [userKeys,tokenKeys,scenarioKeys,scenarioStateKeys,shareKeys]=await Promise.all([
        scanAll('user:*'),
        scanAll('token:*'),
        scanAll('scenarios:*:index'),
        scanAll('scenarios:*:state:*'),
        scanAll('share:*'),
      ]);
      // Get plan breakdown from user records — fan-out reads still in parallel
      const users=await Promise.all((userKeys||[]).map(k=>rGet(k)));
      const validUsers=users.filter(Boolean);
      const totalUsers=validUsers.length;
      const freeUsers=validUsers.filter(u=>!u.plan||u.plan==='free').length;
      const proUsers=validUsers.filter(u=>u.plan==='pro').length;
      const adviserUsers=validUsers.filter(u=>u.plan==='adviser').length;
      // Count active (non-expired) sessions + unique active users
      let activeSessions=0;
      const activeUserIds=new Set();
      if(tokenKeys&&tokenKeys.length){
        const tokenData=await Promise.all(tokenKeys.map(k=>rGet(k)));
        tokenData.forEach(d=>{
          if(d&&(!d.expires||Date.now()<d.expires)){
            activeSessions++;
            if(d.userId) activeUserIds.add(d.userId);
          }
        });
      }
      const activeUsers=activeUserIds.size;
      const totalScenarioLists=scenarioKeys?scenarioKeys.length:0;
      const totalScenarios=scenarioStateKeys?scenarioStateKeys.length:0;
      // Shared scenarios count
      let sharedScenarios=0;
      if(shareKeys&&shareKeys.length){
        const shareLists=await Promise.all(shareKeys.map(k=>rGet(k)));
        shareLists.forEach(sl=>{ if(Array.isArray(sl)) sharedScenarios+=sl.length; });
      }
      // Client errors (count from Redis list)
      let clientErrors=0;
      try{
        const errLen=await redisCmd('LLEN','client-errors');
        clientErrors=parseInt(errLen)||0;
      }catch(e){}
      // Database key counts by category
      const allKeys=await redisCmd('DBSIZE');
      const dbKeys=parseInt(allKeys)||0;
      // New users in the last 7 days
      const sevenDaysAgo=Date.now()-7*24*60*60*1000;
      const newUsersLast7=validUsers.filter(u=>u.createdAt&&u.createdAt>sevenDaysAgo).length;
      // Revenue estimate from config prices, net of Stripe fees (AU domestic: 1.75% + $0.30)
      const siteCfgStats=await rGet('config:site')||{};
      const proPrice=parseFloat(siteCfgStats.proMonthlyPrice)||2.99;
      const adviserPrice=parseFloat(siteCfgStats.adviserMonthlyPrice)||29;
      const stripeFee=(p)=>p*0.0175+0.30;
      const proNet=Math.max(0,proPrice-stripeFee(proPrice));
      const adviserNet=Math.max(0,adviserPrice-stripeFee(adviserPrice));
      const revenueEstimate=Math.round((proUsers*proNet+adviserUsers*adviserNet)*100)/100;
      // Avg scenario lists per user
      const avgScenariosPerUser=totalUsers>0?Math.round(totalScenarioLists/totalUsers*10)/10:0;
      // Store today's snapshot (95-day TTL so the 30-day chart has buffer
      // and we can backfill earlier dates by extending if needed)
      const today=new Date().toISOString().slice(0,10);
      const snapshot={date:today,totalUsers,freeUsers,proUsers,adviserUsers,activeSessions,totalScenarioLists,newUsersLast7,revenueEstimate,avgScenariosPerUser,activeUsers,totalScenarios,sharedScenarios,clientErrors,dbKeys};
      await rSet('stats:snapshot:'+today,snapshot,60*60*24*95);

      // Snapshot only — the 30-day historical backfill (N users × M events
      // per user, per day) now lives in adminGetStatsHistory so the
      // dashboard tiles paint immediately. Charts populate in a second
      // parallel call.
      const resp={ok:true,stats:{totalUsers,freeUsers,proUsers,adviserUsers,activeSessions,totalScenarioLists,newUsersLast7,revenueEstimate,avgScenariosPerUser,activeUsers,totalScenarios,sharedScenarios,clientErrors,dbKeys}};
      try{ await rSet(STATS_CACHE_KEY, resp, STATS_CACHE_TTL); }catch(e){ /* cache write best-effort */ }
      return ok(resp);
    }catch(e){ return fail('Stats error: '+e.message); }
  }

  if(action==='adminGetStatsHistory'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    // 30-day history derived by replaying per-user event logs. Heavy: N
    // user reads + N event-list reads + 30-day inner loop. Cached for
    // 10 minutes (longer than stats since the history changes much more
    // slowly than the current snapshot does — past days don't move).
    const HIST_CACHE_KEY='stats:history:cache:v1';
    const HIST_CACHE_TTL=10*60;
    if(!body.forceRefresh){
      try{
        const cached=await rGet(HIST_CACHE_KEY);
        if(cached) return ok(Object.assign({},cached,{cached:true}));
      }catch(e){}
    }
    try{
      const userKeys=await scanAll('user:*');
      const users=await Promise.all((userKeys||[]).map(k=>rGet(k)));
      const validUsers=users.filter(Boolean);
      const siteCfgStats=await rGet('config:site')||{};
      const proPrice=parseFloat(siteCfgStats.proMonthlyPrice)||8.99;
      const adviserPrice=parseFloat(siteCfgStats.adviserMonthlyPrice)||29;
      const stripeFee=(p)=>p*0.0175+0.30;
      const proNet=Math.max(0,proPrice-stripeFee(proPrice));
      const adviserNet=Math.max(0,adviserPrice-stripeFee(adviserPrice));
      const HIST_DAYS=30;
      const eventLists=await Promise.all(
        validUsers.map(u=>u&&u.id?rListRange('events:'+u.id,0,-1):Promise.resolve([]))
      );
      const userEvents=validUsers.map((u,i)=>{
        const events=(eventLists[i]||[]).map(s=>{
          try{return typeof s==='string'?JSON.parse(s):s;}catch(e){return null;}
        }).filter(Boolean).sort((a,b)=>(a.at||0)-(b.at||0));
        return {user:u,events};
      });
      function planAt(u,events,cutoffMs){
        const signupAt=u.createdAt||0;
        if(signupAt>cutoffMs) return null;
        let plan='free';
        let sawAnyEvent=false;
        for(const e of events){
          if(!e||(e.at||0)>cutoffMs) break;
          sawAnyEvent=true;
          if(e.type==='plan_upgraded') plan=e.plan||'pro';
          else if(e.type==='plan_downgraded') plan=e.plan||'free';
          else if(e.type==='signup'&&e.plan) plan=e.plan;
        }
        if(!sawAnyEvent&&(u.plan==='pro'||u.plan==='adviser')) plan=u.plan;
        return plan;
      }
      // Pre-fetch all snapshots in one batch instead of 30 serial GETs
      const dateStrs=[];
      const cutoffsMs=[];
      for(let i=HIST_DAYS-1;i>=0;i--){
        const d=new Date();d.setDate(d.getDate()-i);
        dateStrs.push(d.toISOString().slice(0,10));
        cutoffsMs.push(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),23,59,59,999));
      }
      const snapshots=await Promise.all(dateStrs.map(ds=>rGet('stats:snapshot:'+ds)));
      const history=dateStrs.map((dateStr,idx)=>{
        const cutoffMs=cutoffsMs[idx];
        let bfTotal=0,bfFree=0,bfPro=0,bfAdv=0;
        for(const {user,events} of userEvents){
          const plan=planAt(user,events,cutoffMs);
          if(plan===null) continue;
          bfTotal++;
          if(plan==='pro') bfPro++;
          else if(plan==='adviser') bfAdv++;
          else bfFree++;
        }
        const bfRevenue=Math.round((bfPro*proNet+bfAdv*adviserNet)*100)/100;
        const eph=snapshots[idx]||{};
        return {
          date:dateStr,
          totalUsers:bfTotal,freeUsers:bfFree,proUsers:bfPro,adviserUsers:bfAdv,revenueEstimate:bfRevenue,
          activeSessions:eph.activeSessions??null,
          totalScenarioLists:eph.totalScenarioLists??null,
          newUsersLast7:eph.newUsersLast7??null,
          avgScenariosPerUser:eph.avgScenariosPerUser??null,
          activeUsers:eph.activeUsers??null,
          totalScenarios:eph.totalScenarios??null,
          sharedScenarios:eph.sharedScenarios??null,
          clientErrors:eph.clientErrors??null,
          dbKeys:eph.dbKeys??null,
        };
      });
      const resp={ok:true,history};
      try{ await rSet(HIST_CACHE_KEY,resp,HIST_CACHE_TTL); }catch(e){}
      return ok(resp);
    }catch(e){ return fail('History error: '+e.message); }
  }

  if(action==='adminPurgeExpiredSessions'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const tokenKeys=await scanAll('token:*');
      if(!tokenKeys||!tokenKeys.length) return ok({ok:true,count:0});
      let count=0;
      await Promise.all(tokenKeys.map(async k=>{
        const d=await rGet(k);
        if(!d||(d.expires&&Date.now()>d.expires)){
          await rDel(k); count++;
        }
      }));
      return ok({ok:true,count});
    }catch(e){ return fail('Purge error: '+e.message); }
  }

  if(action==='adminPurgeOrphanedProfiles'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const profileKeys=await scanAll('profile:*');
      if(!profileKeys||!profileKeys.length) return ok({ok:true,count:0});
      const userKeys=await scanAll('user:*');
      // Build set of valid user IDs
      const users=await Promise.all((userKeys||[]).map(k=>rGet(k)));
      const validIds=new Set(users.filter(Boolean).map(u=>u.id));
      let count=0;
      await Promise.all(profileKeys.map(async k=>{
        const uid=k.replace('profile:','');
        if(!validIds.has(uid)){ await rDel(k); count++; }
      }));
      return ok({ok:true,count});
    }catch(e){ return fail('Purge error: '+e.message); }
  }

  if(action==='adminPurgeOrphanedScenarios'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const scenarioKeys=await scanAll('scenarios:*');
      if(!scenarioKeys||!scenarioKeys.length) return ok({ok:true,count:0});
      const userKeys=await scanAll('user:*');
      const users=await Promise.all((userKeys||[]).map(k=>rGet(k)));
      const validIds=new Set(users.filter(Boolean).map(u=>u.id));
      let count=0;
      await Promise.all(scenarioKeys.map(async k=>{
        // key format: scenarios:<userId>:index or scenarios:<userId>:state:<id> or scenarios:<userId>:photo:<id>
        const parts=k.split(':');
        const uid=parts[1];
        if(!validIds.has(uid)){ await rDel(k); count++; }
      }));
      return ok({ok:true,count});
    }catch(e){ return fail('Purge error: '+e.message); }
  }

  if(action==='adminExportScenarios'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const userKeys=await scanAll('user:*');
      const users=await Promise.all((userKeys||[]).map(k=>rGet(k)));
      const validUsers=users.filter(Boolean);
      const rows=[];
      for(const u of validUsers){
        if(!u.id) continue;
        const idx=await rGet('scenarios:'+u.id+':index');
        if(!Array.isArray(idx)||!idx.length) continue;
        for(const sc of idx){
          const state=await rGet('scenarios:'+u.id+':state:'+sc.id);
          const v=(state&&state.values)||{};
          rows.push({
            userEmail:u.email||'',userName:u.name||'',userPlan:u.plan||'free',
            scenarioId:sc.id,address:sc.fullAddr||'',status:sc.status||'browsing',
            savedAt:sc.savedAt?new Date(sc.savedAt).toISOString():'',
            price:v['inp-price']||'',deposit:v['inp-savings']||'',
            govtGrant:v['inp-govt']||'',rate:v['inp-rate']||'',term:v['inp-term']||'',
            rent:v['inp-rent']||'',offset:v['inp-offset']||'',
            state:v['pd-state']||v['inp-state']||'',suburb:v['pd-suburb']||'',
            propertyType:v['pd-type-label']||'',bed:v['pd-bed']||'',bath:v['pd-bath']||'',car:v['pd-car']||'',
            land:v['pd-land']||'',house:v['pd-house']||'',yearBuilt:v['pd-year']||'',
            fhb:v['inp-fhb-checked']==='1'?'Yes':'No',newBuild:v['inp-new-prop-checked']==='1'?'Yes':'No',
            agentName:v['ag-name']||'',agentAgency:v['ag-agency']||'',
            notes:v['pd-notes']||'',
            costItems:state&&state.dynCostData?state.dynCostData.map(c=>c.name+':$'+(c.amount||0)).join('; '):'',
            renoItems:state&&state.renoItemData?state.renoItemData.map(r=>r.name+':$'+(r.amount||0)).join('; '):'',
          });
        }
      }
      return ok({ok:true,rows});
    }catch(e){ return fail('Export error: '+e.message); }
  }

  if(action==='adminBrowseDatabase'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const pattern=(body.pattern||'*').replace(/[^a-zA-Z0-9:_*\-]/g,'');
      const keys=await scanAll(pattern);
      if(!keys||!keys.length) return ok({ok:true,keys:[],total:0});
      // Sort keys alphabetically
      keys.sort();
      // Paginate: return max 50 keys at a time
      const offset=parseInt(body.offset)||0;
      const limit=Math.min(parseInt(body.limit)||50,100);
      const page=keys.slice(offset,offset+limit);
      // Fetch values for the page (skip large photo keys — just show metadata)
      const entries=await Promise.all(page.map(async k=>{
        if(k.includes(':photo:')) return {key:k,value:'[base64 photo data]',type:'photo'};
        try{
          const v=await rGet(k);
          // Redact sensitive fields
          if(v&&typeof v==='object'){
            const c=Object.assign({},v);
            if(c.hash) c.hash='[redacted]';
            return {key:k,value:c};
          }
          return {key:k,value:v};
        }catch(e){ return {key:k,value:'[error reading]'}; }
      }));
      return ok({ok:true,keys:entries,total:keys.length,offset,limit});
    }catch(e){ return fail('Browse error: '+e.message); }
  }

  if(action==='adminGetSchemes'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const schemes=await rGet('config:schemes');
    return ok({ok:true,schemes:schemes||[]});
  }

  if(action==='adminSetSchemes'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {schemes}=body;
    if(!Array.isArray(schemes)) return fail('schemes must be an array');
    await rSet('config:schemes',schemes);
    return ok({ok:true});
  }

  if(action==='adminGetUserDetails'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail}=body;
    if(!targetEmail) return fail('targetEmail required');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    const {hash,...safeUser}=userData;
    const profile=await rGet('profile:'+userData.id)||{};
    // Count saved scenarios
    let scenarioCount=0;
    try{
      const scenarioIndex=await rGet('scenarios:'+userData.id+':index');
      scenarioCount=Array.isArray(scenarioIndex)?scenarioIndex.length:0;
    }catch(e){}
    // Count active tokens belonging to this user
    let activeTokens=0;
    try{
      const tokenKeys=await scanAll('token:*');
      if(tokenKeys&&tokenKeys.length){
        const tokens=await Promise.all(tokenKeys.map(k=>rGet(k)));
        activeTokens=tokens.filter(t=>t&&t.userId===userData.id&&(!t.expires||Date.now()<t.expires)).length;
      }
    }catch(e){}
    return ok({ok:true,user:safeUser,profile,scenarioCount,activeTokens});
  }

  if(action==='getSchemes'){
    // Public endpoint — any authenticated user can read active schemes
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    const schemes=await rGet('config:schemes');
    const active=(schemes||[]).filter(s=>s.active!==false);
    return ok({ok:true,schemes:active});
  }

  if(action==='adminSetPlan'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail,plan}=body;
    if(!targetEmail||!plan) return fail('targetEmail and plan required');
    const validPlans=['free','pro','adviser'];
    if(!validPlans.includes(plan)) return fail('Invalid plan. Use: free, pro, adviser');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    const oldPlan=userData.plan||'free';
    userData.plan=plan;
    await rSet('user:'+targetEmail.toLowerCase().trim(),userData);
    if(userData.id) await logEvent(userData.id,'plan_changed',{from:oldPlan,to:plan,by:user.email});
    // Also update any active tokens for this user
    return ok({ok:true,plan});
  }

  if(action==='adminGetEmailTemplates'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const types=Object.keys(DEFAULT_TEMPLATES);
    const templates={};
    for(const t of types){
      const saved=await rGet('email-template:'+t).catch(()=>null);
      templates[t]={ ...DEFAULT_TEMPLATES[t], ...(saved||{}), _isCustom:!!(saved&&saved.subject) };
    }
    return ok({ok:true,templates});
  }

  if(action==='adminSetEmailTemplate'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {type,subject,html}=body;
    if(!type||!DEFAULT_TEMPLATES[type]) return fail('Invalid template type');
    if(!subject||!html) return fail('subject and html required');
    await rSet('email-template:'+type, {subject:String(subject).slice(0,300), html:String(html).slice(0,20000)});
    return ok({ok:true});
  }

  if(action==='adminResetEmailTemplate'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {type}=body;
    if(!type||!DEFAULT_TEMPLATES[type]) return fail('Invalid template type');
    await rDel('email-template:'+type);
    return ok({ok:true, template:DEFAULT_TEMPLATES[type]});
  }

  if(action==='adminSendTestEmail'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    if(!RESEND_API_KEY) return fail('RESEND_API_KEY not configured — cannot send email',503);
    const {subject,html}=body;
    if(!subject||!html) return fail('subject and html required');
    const sampleVars={code:'123456',firstName:user.name?(user.name.split(' ')[0]):'Admin',name:user.name||'Admin',plan:'Pro',event:'Password changed',senderName:'Jane Smith',address:' — 42 Wallaby Way, Sydney NSW 2000'};
    const fill=s=>s.replace(/\{\{(\w+)\}\}/g,(m,k)=>sampleVars[k]||m);
    try{
      const sent=await sendResend(user.email,'[TEST] '+fill(subject),fill(html));
      if(!sent) return fail('Failed to send via Resend — check RESEND_API_KEY');
      return ok({ok:true,sentTo:user.email});
    }catch(e){ return fail('Send error: '+e.message); }
  }

  if(action==='getReferralCode'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    const userData=await rGet('user:'+user.email);
    if(!userData) return fail('User not found',404);
    let code=userData.referralCode;
    if(!code){
      code=(userData.id.slice(0,8)).toUpperCase();
      userData.referralCode=code;
      userData.referralCount=userData.referralCount||0;
      await rSet('user:'+user.email,userData);
      await rSet('referral:'+code,userData.id);
    }
    const siteUrl='https://equitysight.app';
    return ok({ok:true,code,link:siteUrl+'/login?ref='+code+'&tab=signup',referralCount:userData.referralCount||0});
  }

  if(action==='adminGetAboutPage'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const about=await rGet('siteConfig:aboutPage').catch(()=>null);
    return ok({ok:true, about: about || null});
  }

  if(action==='adminSetAboutPage'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {about}=body;
    if(!about) return fail('about data required');
    await rSet('siteConfig:aboutPage', about);
    return ok({ok:true});
  }

  // Public endpoint — no auth required (used by legal pages to check for admin-edited content)
  if(action==='getLegalPage'){
    const {page}=body;
    if(!page||!['privacy','terms','disclaimer','cookies'].includes(page)) return fail('Invalid page');
    const content=await rGet('siteConfig:legal:'+page).catch(()=>null);
    return ok({ok:true, content: content || null});
  }

  if(action==='adminGetLegalPage'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {page}=body;
    if(!page||!['privacy','terms','disclaimer','cookies'].includes(page)) return fail('Invalid page');
    const content=await rGet('siteConfig:legal:'+page).catch(()=>null);
    return ok({ok:true, content: content || null});
  }

  if(action==='adminSetLegalPage'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {page, content}=body;
    if(!page||!['privacy','terms','disclaimer','cookies'].includes(page)) return fail('Invalid page');
    if(!content) return fail('content required');
    await rSet('siteConfig:legal:'+page, String(content).slice(0,50000));
    return ok({ok:true});
  }

  if(action==='adminResetLegalPage'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {page}=body;
    if(!page||!['privacy','terms','disclaimer','cookies'].includes(page)) return fail('Invalid page');
    await rDel('siteConfig:legal:'+page);
    return ok({ok:true});
  }

  // ── Feature usage tracking ─────────────────────────────────────────────────
  // Lightweight event tracking for logged-in users. Stores per-user aggregate
  // counts in Redis hash `usage:<userId>`. Accepted events are whitelisted to
  // prevent abuse. Rate-limited to 60 calls/min per IP.
  if(action==='track'){
    const user=await verifyToken(event);
    if(!user) return fail('Unauthorized',401);
    const ALLOWED_EVENTS=['recalc','pdf_export','save_scenario','load_scenario','share_scenario','tab_switch','pro_upgrade_prompt','compare_view','amortisation_view','projection_view'];
    const evt=String(body.event||'').slice(0,50);
    if(!evt||!ALLOWED_EVENTS.includes(evt)) return ok({ok:true}); // silent drop for unknown events
    const trackIp=(event.headers['x-nf-client-connection-ip']||'unknown').split(',')[0].trim();
    try{
      const rc=await rRateInc('trackRate:'+trackIp,60);
      if(rc>60) return ok({ok:true}); // silent rate-limit
    }catch(e){}
    // Increment per-user usage count for this event
    try{
      await redisCmd('HINCRBY','usage:'+user.userId,evt,'1');
    }catch(e){
      // Fallback: read-merge-write if HINCRBY not available
      try{
        const usage=await rGet('usage:'+user.userId)||{};
        usage[evt]=(usage[evt]||0)+1;
        await rSet('usage:'+user.userId,usage);
      }catch(e2){}
    }
    return ok({ok:true});
  }

  // Admin: get usage stats for a specific user
  if(action==='adminGetUsage'){
    const user=await verifyToken(event);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetUserId}=body;
    if(!targetUserId) return fail('targetUserId required');
    let usage={};
    try{
      const raw=await redisCmd('HGETALL','usage:'+targetUserId);
      // Upstash HGETALL returns flat array: [key1, val1, key2, val2, ...]
      if(Array.isArray(raw)){
        for(let i=0;i<raw.length;i+=2) usage[raw[i]]=parseInt(raw[i+1])||0;
      } else if(raw&&typeof raw==='object'){
        usage=raw; // some Upstash SDK versions return an object directly
      }
    }catch(e){
      // Fallback: read as JSON (for the rGet/rSet fallback path)
      usage=await rGet('usage:'+targetUserId)||{};
    }
    return ok({ok:true,usage});
  }

  return fail('Unknown action');
};

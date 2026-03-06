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
const SALT        = process.env.AUTH_SALT || (() => {
  // ⚠️  AUTH_SALT is not set in environment variables.
  // For production security, add AUTH_SALT as a strong random secret
  // in Netlify → Site Settings → Environment Variables.
  // Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  console.warn('[auth] WARNING: AUTH_SALT env var not set — using insecure default. Set AUTH_SALT in Netlify env vars.');
  return 'propCalcSalt2024_v2';
})();
const TOKEN_TTL   = 60 * 60 * 24 * 30; // 30 days

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
};

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const VERIFY_EMAIL_FROM = (process.env.VERIFY_EMAIL_FROM || 'onboarding@resend.dev').trim();

// Default email templates — used when no custom template is saved in Redis
const DEFAULT_TEMPLATES = {
  verification: {
    subject: 'Verify your EquitySight account',
    html: '<p>Your verification code is <strong style="font-size:18px;letter-spacing:2px;">{{code}}</strong>.</p><p>This code expires in 15 minutes.</p>',
    variables: ['{{code}}'],
  },
  welcome: {
    subject: 'Welcome to EquitySight!',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">Welcome, {{firstName}}! 🎉</h2><p>Your EquitySight account is verified and ready to go.</p><p>You can now:</p><ul><li>Calculate property investment scenarios</li><li>Save and compare multiple properties</li><li>Track growth projections over time</li></ul><a href="https://equitysight.app/app.html" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">Open Calculator</a><p style="margin-top:24px;font-size:12px;color:#888;">If you have any questions, reply to this email.</p></div>',
    variables: ['{{firstName}}', '{{name}}'],
  },
  password_reset: {
    subject: 'Reset your EquitySight password',
    html: '<p>Your password reset code is <strong style="font-size:18px;letter-spacing:2px;">{{code}}</strong>.</p><p>This code expires in 30 minutes. If you did not request this, you can ignore this email.</p>',
    variables: ['{{code}}'],
  },
  subscription: {
    subject: 'Your EquitySight plan has been updated',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">Plan updated</h2><p>Hi {{firstName}},</p><p>Your plan has been updated to <strong>{{plan}}</strong>.</p><p>You now have access to all features included in your new plan.</p><a href="https://equitysight.app/app.html" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">Open Calculator</a></div>',
    variables: ['{{firstName}}', '{{name}}', '{{plan}}'],
  },
  security_alert: {
    subject: 'Security alert — EquitySight',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C45A5A;">⚠ Security alert</h2><p>Hi {{firstName}},</p><p>We detected the following activity on your account: <strong>{{event}}</strong>.</p><p>If this was you, no action is needed. If you did not do this, please reset your password immediately.</p><a href="https://equitysight.app/login.html" style="display:inline-block;padding:12px 24px;background:#1C1C1E;color:#F5F0E8;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">Reset Password</a></div>',
    variables: ['{{firstName}}', '{{name}}', '{{event}}'],
  },
  promotional: {
    subject: 'What\'s new at EquitySight',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">What\'s new</h2><p>Hi {{firstName}},</p><p>We\'ve been working hard on new features for EquitySight. Here\'s what\'s new:</p><p style="background:#F9FAFB;border-left:3px solid #C9A84C;padding:12px 16px;border-radius:0 4px 4px 0;">Your message here...</p><a href="https://equitysight.app/app.html" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:16px;">Open Calculator</a><p style="margin-top:24px;font-size:11px;color:#9CA3AF;">You\'re receiving this because you have an EquitySight account.</p></div>',
    variables: ['{{firstName}}', '{{name}}'],
  },
};

// Substitute {{variable}} placeholders in a template string
function applyVars(str, vars){
  return Object.entries(vars).reduce((s,[k,v])=>s.replace(new RegExp('\\{\\{'+k+'\\}\\}','g'),v||''), str);
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

// Append a structured event for a userId
async function logEvent(userId,type,extra){
  if(!userId) return;
  try{
    await rListPush('events:'+userId, JSON.stringify({type,at:Date.now(),...extra}));
  }catch(e){ console.warn('[auth] logEvent failed:',e.message); }
}

const EMAIL_CODE_TTL_MS = 1000 * 60 * 15; // 15 minutes

function hashPw(pw){ return crypto.createHmac('sha256',SALT).update(pw).digest('hex'); }
function makeToken(){ return crypto.randomBytes(32).toString('hex'); }
function makeEmailCode(){ return String(Math.floor(100000 + Math.random()*900000)); }
function hashEmailCode(code){ return crypto.createHmac('sha256',SALT).update('email-code:'+String(code)).digest('hex'); }
function ok(b){ return {statusCode:200,headers:H,body:JSON.stringify(b)}; }
function fail(msg,code){ return {statusCode:code||200,headers:H,body:JSON.stringify({ok:false,error:msg})}; }

async function verifyToken(authHeader){
  if(!authHeader||!authHeader.startsWith('Bearer ')) return null;
  const token=authHeader.slice(7).trim();
  if(!token) return null;
  const data=await rGet('token:'+token);
  if(!data) return null;
  if(data.expires&&Date.now()>data.expires){ await rDel('token:'+token); return null; }
  return data;
}

exports.handler = async function(event){
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};

  // GET = verify token from Authorization header
  if(event.httpMethod==='GET'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user) return fail('Unauthorized',401);
    return ok({ok:true,...user});
  }

  if(!REDIS_URL||!REDIS_TOKEN){
    return fail('Auth not configured — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Netlify Site Settings → Environment variables');
  }

  let body;
  try{body=JSON.parse(event.body||'{}');}catch(e){return fail('Bad request',400);}
  const {action}=body;

  if(action==='signup'){
    const {email,password,name,plan}=body;
    if(!email||!password) return fail('Email and password required');
    const siteCfgSu=await rGet('config:site')||{};
    if(siteCfgSu.allowSignups===false) return fail('New signups are currently disabled. Please contact support.');
    const pwMin=parseInt(siteCfgSu.minPasswordLength)||8;
    if(password.length<pwMin) return fail('Password must be at least '+pwMin+' characters');
    if(siteCfgSu.requireEmailDomain){
      const domain=siteCfgSu.requireEmailDomain.toLowerCase().replace(/^@/,'');
      if(!email.toLowerCase().trim().endsWith('@'+domain)) return fail('Signups are restricted to @'+domain+' email addresses');
    }
    const normalizedEmail=email.toLowerCase().trim();
    const ekey='user:'+normalizedEmail;
    if(await rGet(ekey)) return fail('An account with this email already exists');
    const userId=Date.now().toString(36)+crypto.randomBytes(4).toString('hex');
    const code=makeEmailCode();
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
      emailVerificationSentAt:Date.now()
    };
    await rSet(ekey,user);
    await logEvent(userId,'signup',{name:user.name,email:normalizedEmail,plan:user.plan});
    await sendVerificationEmail(normalizedEmail, code);
    return ok({ok:true,requiresEmailVerification:true,email:user.email,plan:user.plan,name:user.name});
  }

  if(action==='signin'){
    const {email,password}=body;
    if(!email||!password) return fail('Email and password required');
    const normalizedEmail=email.toLowerCase().trim();
    const user=await rGet('user:'+normalizedEmail);
    if(!user) return fail('No account found for this email');
    if(user.hash!==hashPw(password)) return fail('Incorrect password');
    if(user.emailVerified===false){
      return ok({ok:false,error:'Please verify your email before signing in.',requiresEmailVerification:true,email:user.email,name:user.name,plan:user.plan||'free'});
    }
    user.lastLoginAt=Date.now();
    user.loginCount=(user.loginCount||0)+1;
    user.lastLoginIp=(event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']||'').split(',')[0].trim()||event.headers?.['x-real-ip']||'';
    await rSet('user:'+normalizedEmail,user);
    await logEvent(user.id,'signin',{ip:user.lastLoginIp||''});
    const token=makeToken();
    await rSet('token:'+token,{userId:user.id,email:user.email||email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    return ok({ok:true,token,id:user.id,name:user.name,email:user.email||email,plan:user.plan||'free',role:user.role||'user'});
  }

  if(action==='resendVerification'){
    const normalizedEmail=(body.email||'').toLowerCase().trim();
    if(!normalizedEmail) return fail('Email required');
    const user=await rGet('user:'+normalizedEmail);
    if(!user) return fail('No account found for this email');
    if(user.emailVerified) return ok({ok:true,alreadyVerified:true});
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
      return ok({ok:true,token,id:user.id,name:user.name,email:user.email,plan:user.plan||'free',role:user.role||'user',alreadyVerified:true});
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
    await rSet('user:'+normalizedEmail,user);
    await logEvent(user.id,'email_verified',{});
    sendWelcomeEmail(normalizedEmail, user.name).catch(()=>{});
    const token=makeToken();
    await rSet('token:'+token,{userId:user.id,email:user.email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    return ok({ok:true,token,id:user.id,name:user.name,email:user.email,plan:user.plan||'free',role:user.role||'user'});
  }

  if(action==='verify'){
    const {token}=body;
    if(!token) return fail('Token required');
    const data=await rGet('token:'+token);
    if(!data||(data.expires&&Date.now()>data.expires)) return fail('Invalid or expired session');
    // Always return latest plan/role from user record so admin changes take effect immediately
    try{
      const userData=await rGet('user:'+data.email);
      if(userData){
        data.plan=userData.plan||data.plan;
        data.role=userData.role||data.role;
      }
    }catch(e){}
    return ok({ok:true,...data});
  }

  if(action==='signout'){
    const {token}=body;
    if(token) await rDel('token:'+token);
    return ok({ok:true});
  }

  if(action==='getProfile'||action==='setProfile'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user) return fail('Unauthorized',401);
    if(action==='getProfile'){
      const p=await rGet('profile:'+user.userId)||{};
      return ok({ok:true,profile:p});
    }
    const {profile}=body;
    const existing=await rGet('profile:'+user.userId)||{};
    const merged={...existing,...profile};
    delete merged.photo; // large photos use photo.js
    await rSet('profile:'+user.userId,merged);
    return ok({ok:true});
  }


  if(action==='changePassword'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user) return fail('Unauthorized',401);
    const {currentPassword,newPassword}=body;
    if(!currentPassword||!newPassword) return fail('Both passwords required');
    if(newPassword.length<8) return fail('New password must be at least 8 characters');
    const userData=await rGet('user:'+user.email);
    if(!userData) return fail('Account not found');
    if(userData.hash!==hashPw(currentPassword)) return fail('Current password is incorrect');
    userData.hash=hashPw(newPassword);
    await rSet('user:'+user.email,userData);
    await logEvent(userData.id,'password_changed',{});
    return ok({ok:true});
  }

  if(action==='requestPasswordReset'){
    const {email}=body;
    if(!email) return fail('Email required');
    const normalizedEmail=email.toLowerCase().trim();
    const userData=await rGet('user:'+normalizedEmail);
    // Always return ok to prevent email enumeration
    if(userData){
      const code=makeEmailCode();
      const hashed=hashEmailCode(code);
      await rSet('pwreset:'+normalizedEmail,{hash:hashed,email:normalizedEmail},1800); // 30 min
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
    if(!resetData||resetData.hash!==hashEmailCode(String(code).trim())) return fail('Invalid or expired reset code');
    const userData=await rGet('user:'+normalizedEmail);
    if(!userData) return fail('Account not found');
    userData.hash=hashPw(newPassword);
    await rSet('user:'+normalizedEmail,userData);
    await rDel('pwreset:'+normalizedEmail);
    await logEvent(userData.id,'password_reset',{});
    return ok({ok:true});
  }

  if(action==='deleteAccount'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user) return fail('Unauthorized',401);
    const {password}=body;
    if(!password) return fail('Password required to confirm deletion');
    const userData=await rGet('user:'+user.email);
    if(!userData) return fail('Account not found');
    if(userData.hash!==hashPw(password)) return fail('Incorrect password');
    // Delete all user data
    await rDel('user:'+user.email);
    await rDel('profile:'+user.userId);
    await rDel('token:'+(body.token||''));
    // Note: scenarios are stored client-side in localStorage — cleared on signout
    return ok({ok:true});
  }

  if(action==='adminListUsers'){
    // Admin only — verify token has admin role
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    // Return limited user data — no passwords
    const keys=await redisCmd('KEYS','user:*');
    if(!keys||!keys.length) return ok({ok:true,users:[]});
    const users=await Promise.all(keys.map(async k=>{
      const u=await rGet(k);
      return u?{email:u.email,name:u.name,plan:u.plan,id:u.id,createdAt:u.createdAt,role:u.role,
                lastLoginAt:u.lastLoginAt,loginCount:u.loginCount,lastLoginIp:u.lastLoginIp,
                stripeDiscountInfo:u.stripeDiscountInfo||null}:null;
    }));
    return ok({ok:true,users:users.filter(Boolean)});
  }

  if(action==='adminResetPassword'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
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
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail}=body;
    if(!targetEmail) return fail('targetEmail required');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    await rDel('user:'+targetEmail.toLowerCase().trim());
    await rDel('profile:'+userData.id);
    return ok({ok:true});
  }

  if(action==='adminSetRole'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
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
    const admin=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
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
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user) return fail('Unauthorized',401);
    // Check if any admin exists
    const keys=await redisCmd('KEYS','user:*');
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
    return ok({ok:true,token,role:'admin'});
  }

  if(action==='adminGetConfig'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const cfg=await rGet('config:site')||{};
    return ok({ok:true,config:cfg});
  }

  if(action==='adminSetConfig'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
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
      'stripePubKey','stripeProMonthly','stripeProAnnual','stripePortal'];
    const sanitised={};
    for(const k of allowed) if(k in config) sanitised[k]=config[k];
    await rSet('config:site',sanitised);
    return ok({ok:true});
  }

  if(action==='adminGetStats'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const userKeys=await redisCmd('KEYS','user:*');
      const tokenKeys=await redisCmd('KEYS','token:*');
      const scenarioKeys=await redisCmd('KEYS','scenarios:*:index');
      // Get plan breakdown from user records
      const users=await Promise.all((userKeys||[]).map(k=>rGet(k)));
      const validUsers=users.filter(Boolean);
      const totalUsers=validUsers.length;
      const freeUsers=validUsers.filter(u=>!u.plan||u.plan==='free').length;
      const proUsers=validUsers.filter(u=>u.plan==='pro').length;
      const adviserUsers=validUsers.filter(u=>u.plan==='adviser').length;
      // Count active (non-expired) sessions
      let activeSessions=0;
      if(tokenKeys&&tokenKeys.length){
        const tokenData=await Promise.all(tokenKeys.map(k=>rGet(k)));
        activeSessions=tokenData.filter(d=>d&&(!d.expires||Date.now()<d.expires)).length;
      }
      const totalScenarioLists=scenarioKeys?scenarioKeys.length:0;
      // New users in the last 7 days
      const sevenDaysAgo=Date.now()-7*24*60*60*1000;
      const newUsersLast7=validUsers.filter(u=>u.createdAt&&u.createdAt>sevenDaysAgo).length;
      // Revenue estimate from config prices
      const siteCfgStats=await rGet('config:site')||{};
      const proPrice=parseFloat(siteCfgStats.proMonthlyPrice)||9;
      const adviserPrice=parseFloat(siteCfgStats.adviserMonthlyPrice)||29;
      const revenueEstimate=Math.round(proUsers*proPrice+adviserUsers*adviserPrice);
      // Avg scenario lists per user
      const avgScenariosPerUser=totalUsers>0?Math.round(totalScenarioLists/totalUsers*10)/10:0;
      // Store today's snapshot (31-day TTL so we keep ~1 month of history)
      const today=new Date().toISOString().slice(0,10);
      await rSet('stats:snapshot:'+today,{date:today,totalUsers,freeUsers,proUsers,adviserUsers,activeSessions,totalScenarioLists,newUsersLast7,revenueEstimate,avgScenariosPerUser},60*60*24*31);
      // Fetch last 7 days of daily snapshots
      const history=[];
      for(let i=6;i>=0;i--){
        const d=new Date();d.setDate(d.getDate()-i);
        const dateStr=d.toISOString().slice(0,10);
        const snap=await rGet('stats:snapshot:'+dateStr);
        history.push(snap||{date:dateStr,totalUsers:null,freeUsers:null,proUsers:null,adviserUsers:null,activeSessions:null,totalScenarioLists:null,newUsersLast7:null,revenueEstimate:null,avgScenariosPerUser:null});
      }
      return ok({ok:true,stats:{totalUsers,freeUsers,proUsers,adviserUsers,activeSessions,totalScenarioLists,newUsersLast7,revenueEstimate,avgScenariosPerUser},history});
    }catch(e){ return fail('Stats error: '+e.message); }
  }

  if(action==='adminPurgeExpiredSessions'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const tokenKeys=await redisCmd('KEYS','token:*');
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
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const profileKeys=await redisCmd('KEYS','profile:*');
      if(!profileKeys||!profileKeys.length) return ok({ok:true,count:0});
      const userKeys=await redisCmd('KEYS','user:*');
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
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    try{
      const scenarioKeys=await redisCmd('KEYS','scenarios:*');
      if(!scenarioKeys||!scenarioKeys.length) return ok({ok:true,count:0});
      const userKeys=await redisCmd('KEYS','user:*');
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

  if(action==='adminGetSchemes'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const schemes=await rGet('config:schemes');
    return ok({ok:true,schemes:schemes||[]});
  }

  if(action==='adminSetSchemes'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {schemes}=body;
    if(!Array.isArray(schemes)) return fail('schemes must be an array');
    await rSet('config:schemes',schemes);
    return ok({ok:true});
  }

  if(action==='adminGetUserDetails'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
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
      const tokenKeys=await redisCmd('KEYS','token:*');
      if(tokenKeys&&tokenKeys.length){
        const tokens=await Promise.all(tokenKeys.map(k=>rGet(k)));
        activeTokens=tokens.filter(t=>t&&t.userId===userData.id&&(!t.expires||Date.now()<t.expires)).length;
      }
    }catch(e){}
    return ok({ok:true,user:safeUser,profile,scenarioCount,activeTokens});
  }

  if(action==='getSchemes'){
    // Public endpoint — any authenticated user can read active schemes
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user) return fail('Unauthorized',401);
    const schemes=await rGet('config:schemes');
    const active=(schemes||[]).filter(s=>s.active!==false);
    return ok({ok:true,schemes:active});
  }

  if(action==='adminSetPlan'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {targetEmail,plan}=body;
    if(!targetEmail||!plan) return fail('targetEmail and plan required');
    const validPlans=['free','pro','adviser'];
    if(!validPlans.includes(plan)) return fail('Invalid plan. Use: free, pro, adviser');
    const userData=await rGet('user:'+targetEmail.toLowerCase().trim());
    if(!userData) return fail('User not found');
    userData.plan=plan;
    await rSet('user:'+targetEmail.toLowerCase().trim(),userData);
    // Also update any active tokens for this user
    return ok({ok:true,plan});
  }

  if(action==='adminGetEmailTemplates'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
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
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {type,subject,html}=body;
    if(!type||!DEFAULT_TEMPLATES[type]) return fail('Invalid template type');
    if(!subject||!html) return fail('subject and html required');
    await rSet('email-template:'+type, {subject:String(subject).slice(0,300), html:String(html).slice(0,20000)});
    return ok({ok:true});
  }

  if(action==='adminResetEmailTemplate'){
    const user=await verifyToken(event.headers?.authorization||event.headers?.Authorization);
    if(!user||user.role!=='admin') return fail('Unauthorized',401);
    const {type}=body;
    if(!type||!DEFAULT_TEMPLATES[type]) return fail('Invalid template type');
    await rDel('email-template:'+type);
    return ok({ok:true, template:DEFAULT_TEMPLATES[type]});
  }

  return fail('Unknown action');
};

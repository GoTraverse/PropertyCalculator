/**
 * auth.js — Netlify Function
 * Per-user auth backed by Upstash Redis.
 *
 * actions: signup, signin, verify, signout, getProfile, setProfile
 *
 * Redis keys:
 *   user:<email>      → {name, hash, id, plan, email, createdAt}
 *   token:<token>     → {userId, email, name, plan, expires}   TTL=30d
 *   profile:<userId>  → {color, ...non-photo settings}
 */

const crypto = require('crypto');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const SALT        = process.env.AUTH_SALT || 'propCalcSalt2024_v2';
const TOKEN_TTL   = 60 * 60 * 24 * 30; // 30 days

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
};

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

function hashPw(pw){ return crypto.createHmac('sha256',SALT).update(pw).digest('hex'); }
function makeToken(){ return crypto.randomBytes(32).toString('hex'); }
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
    if(password.length<8) return fail('Password must be at least 8 characters');
    const ekey='user:'+email.toLowerCase().trim();
    if(await rGet(ekey)) return fail('An account with this email already exists');
    const userId=Date.now().toString(36)+crypto.randomBytes(4).toString('hex');
    const user={name:(name||email.split('@')[0]).trim(),hash:hashPw(password),id:userId,plan:plan||'free',email:email.toLowerCase().trim(),createdAt:Date.now()};
    await rSet(ekey,user);
    const token=makeToken();
    await rSet('token:'+token,{userId,email:user.email,name:user.name,plan:user.plan,expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    return ok({ok:true,token,id:userId,name:user.name,email:user.email,plan:user.plan});
  }

  if(action==='signin'){
    const {email,password}=body;
    if(!email||!password) return fail('Email and password required');
    const user=await rGet('user:'+email.toLowerCase().trim());
    if(!user) return fail('No account found for this email');
    if(user.hash!==hashPw(password)) return fail('Incorrect password');
    const token=makeToken();
    await rSet('token:'+token,{userId:user.id,email:user.email||email,name:user.name,plan:user.plan||'free',role:user.role||'user',expires:Date.now()+TOKEN_TTL*1000},TOKEN_TTL);
    return ok({ok:true,token,id:user.id,name:user.name,email:user.email||email,plan:user.plan||'free',role:user.role||'user'});
  }

  if(action==='verify'){
    const {token}=body;
    if(!token) return fail('Token required');
    const data=await rGet('token:'+token);
    if(!data||(data.expires&&Date.now()>data.expires)) return fail('Invalid or expired session');
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
      return u?{email:u.email,name:u.name,plan:u.plan,id:u.id,createdAt:u.createdAt,role:u.role}:null;
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
    userData.role=role;
    await rSet('user:'+targetEmail.toLowerCase().trim(),userData);
    // Update token if user is currently signed in
    return ok({ok:true});
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

  return fail('Unknown action');
};

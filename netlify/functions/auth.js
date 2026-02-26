const crypto = require('crypto');

// Simple auth backed by Upstash Redis
// Users stored as: user:<email> → {hash, name, id}
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd, ...args){
  const r = await fetch(`${REDIS_URL}/${cmd}/${args.map(encodeURIComponent).join('/')}`, {
    headers:{ Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const j = await r.json();
  return j.result;
}

function hashPw(pw){ return crypto.createHash('sha256').update(pw + 'propCalcSalt2024').digest('hex'); }

exports.handler = async function(event){
  const headers = { 'Access-Control-Allow-Origin':'*', 'Content-Type':'application/json' };
  if(event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if(!REDIS_URL || !REDIS_TOKEN) return { statusCode:200, headers, body: JSON.stringify({ok:false, error:'Auth not configured'}) };

  let body;
  try { body = JSON.parse(event.body||'{}'); } catch(e){ return { statusCode:400, headers, body: JSON.stringify({ok:false,error:'Bad request'}) }; }

  const { action, email, password, name } = body;
  if(!email || !password) return { statusCode:200, headers, body: JSON.stringify({ok:false,error:'Email and password required'}) };

  const key = 'user:' + email.toLowerCase().trim();

  if(action === 'signup'){
    const existing = await redis('get', key);
    if(existing) return { statusCode:200, headers, body: JSON.stringify({ok:false,error:'An account with this email already exists'}) };
    const user = { name: name||email.split('@')[0], hash: hashPw(password), id: Date.now().toString(36) };
    await redis('set', key, JSON.stringify(user));
    return { statusCode:200, headers, body: JSON.stringify({ok:true, id:user.id, name:user.name}) };
  }

  if(action === 'signin'){
    const raw = await redis('get', key);
    if(!raw){ return { statusCode:200, headers, body: JSON.stringify({ok:false,error:'No account found for this email'}) }; }
    const user = JSON.parse(raw);
    if(user.hash !== hashPw(password)) return { statusCode:200, headers, body: JSON.stringify({ok:false,error:'Incorrect password'}) };
    return { statusCode:200, headers, body: JSON.stringify({ok:true, id:user.id, name:user.name}) };
  }

  return { statusCode:200, headers, body: JSON.stringify({ok:false,error:'Unknown action'}) };
};

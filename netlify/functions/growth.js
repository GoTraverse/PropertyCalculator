/**
 * growth.js — Netlify Function
 * Shared suburb growth rate cache backed by Upstash Redis.
 * Entries expire after 30 days.
 *
 * Redis keys:
 *   growth:<suburb>:<state>   → {rate, note, fetchedAt}  (TTL 30d)
 *   growth:index              → [{suburb, state, rate, note, fetchedAt}] (full list for admin)
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const GROWTH_TTL  = 30 * 24 * 60 * 60; // 30 days in seconds

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
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
  if(ttl) return redisCmd('SET',key,typeof val==='string'?val:JSON.stringify(val),'EX',ttl);
  return redisCmd('SET',key,typeof val==='string'?val:JSON.stringify(val));
}
async function rDel(key){ return redisCmd('DEL',key); }

// Verify admin token
async function verifyAdmin(authHeader){
  if(!authHeader||!authHeader.startsWith('Bearer ')) return false;
  const token=authHeader.slice(7).trim();
  if(!token) return false;
  const raw=await redisCmd('GET','token:'+token);
  if(!raw) return false;
  let data;
  try{data=JSON.parse(raw);}catch(e){return false;}
  if(data.expires&&Date.now()>data.expires) return false;
  return data.role==='admin';
}

function gKey(suburb, state){
  return 'growth:'+suburb.toLowerCase().trim()+':'+((state||'QLD').toUpperCase().trim());
}

const ok  = (body, s=200) => ({statusCode:s, headers:H, body:JSON.stringify(body)});
const fail = (msg, s=400) => ({statusCode:s, headers:H, body:JSON.stringify({ok:false,error:msg})});

exports.handler = async (event) => {
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};

  let body={};
  try{ body=JSON.parse(event.body||'{}'); }catch(e){}
  const {action, suburb, state, rate, note} = body;

  if(action==='get'){
    if(!suburb) return fail('suburb required');
    const s = (state||'QLD').toUpperCase();
    const entry = await rGet(gKey(suburb, s));
    if(!entry) return ok({ok:true, found:false});
    return ok({ok:true, found:true, rate:entry.rate, note:entry.note, fetchedAt:entry.fetchedAt});
  }

  if(action==='set'){
    if(!suburb||rate==null) return fail('suburb and rate required');
    const s = (state||'QLD').toUpperCase();
    const entry = {rate:parseFloat(rate), note:note||'', fetchedAt:Date.now()};
    await rSet(gKey(suburb, s), entry, GROWTH_TTL);
    // Update index (no TTL on index — we prune stale entries on list)
    const key = suburb.toLowerCase().trim()+'|'+s;
    const index = (await rGet('growth:index')) || [];
    const existing = index.findIndex(e=>e.key===key);
    const indexEntry = {key, suburb:suburb.trim(), state:s, rate:entry.rate, note:entry.note, fetchedAt:entry.fetchedAt};
    if(existing>=0) index[existing]=indexEntry; else index.push(indexEntry);
    await rSet('growth:index', index);
    return ok({ok:true});
  }

  if(action==='list'){
    // Admin only
    const isAdmin = await verifyAdmin(event.headers.authorization||event.headers.Authorization||'');
    if(!isAdmin) return fail('Forbidden', 403);
    const index = (await rGet('growth:index')) || [];
    // Filter out expired entries (older than 30 days)
    const cutoff = Date.now() - GROWTH_TTL * 1000;
    const active = index.filter(e => e.fetchedAt > cutoff);
    // Prune if needed
    if(active.length !== index.length) await rSet('growth:index', active);
    return ok({ok:true, entries: active.sort((a,b)=>b.fetchedAt-a.fetchedAt)});
  }

  if(action==='delete'){
    const isAdmin = await verifyAdmin(event.headers.authorization||event.headers.Authorization||'');
    if(!isAdmin) return fail('Forbidden', 403);
    if(!suburb) return fail('suburb required');
    const s = (state||'QLD').toUpperCase();
    await rDel(gKey(suburb, s));
    const key = suburb.toLowerCase().trim()+'|'+s;
    const index = (await rGet('growth:index')) || [];
    await rSet('growth:index', index.filter(e=>e.key!==key));
    return ok({ok:true});
  }

  return fail('Unknown action');
};

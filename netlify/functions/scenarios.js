/**
 * scenarios.js — Netlify Function
 * Per-user property library backed by Upstash Redis.
 *
 * All requests MUST include:  Authorization: Bearer <token>
 * The token is verified by calling the auth function's GET handler.
 *
 * Redis keys (all per-user, never shared):
 *   scenarios:<userId>:index   → [{id, fullAddr, hasPhoto, status, savedAt, thumb}]  (JSON array)
 *   scenarios:<userId>:state:<id>  → scenario state JSON
 *   scenarios:<userId>:photo:<id>  → base64 photo data
 *
 * Methods:
 *   GET    → list all scenarios for this user
 *   POST   → save/update a scenario
 *   DELETE → delete a scenario  (?id=xxx)
 *
 * POST body actions:
 *   save   — upsert a scenario (id, fullAddr, state, hasPhoto, status, thumb)
 *   photo  — save photo for a scenario  (id, photo)
 *   getPhoto — retrieve photo (id)
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
};

// ── Redis ─────────────────────────────────────────────────────────────
async function redisCmd(...args){
  if(!REDIS_URL||!REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r=await fetch(REDIS_URL,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok) throw new Error('Redis HTTP '+r.status);
  return (await r.json()).result;
}
async function redisPipe(cmds){
  if(!REDIS_URL||!REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r=await fetch(REDIS_URL+'/pipeline',{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(cmds)});
  if(!r.ok) throw new Error('Redis pipeline HTTP '+r.status);
  return r.json();
}
async function rGet(key){
  const raw=await redisCmd('GET',key);
  if(!raw) return null;
  try{return JSON.parse(raw);}catch(e){return raw;}
}
async function rSet(key,val){ return redisCmd('SET',key,typeof val==='string'?val:JSON.stringify(val)); }

// ── Auth — verify Bearer token ────────────────────────────────────────
async function verifyToken(authHeader){
  if(!authHeader||!authHeader.startsWith('Bearer ')) return null;
  const token=authHeader.slice(7).trim();
  if(!token) return null;
  // Verify against Redis directly (same logic as auth.js)
  const raw=await redisCmd('GET','token:'+token);
  if(!raw) return null;
  let data;
  try{data=JSON.parse(raw);}catch(e){return null;}
  if(data.expires&&Date.now()>data.expires){ await redisCmd('DEL','token:'+token); return null; }
  return data; // {userId, email, name, plan}
}

function ok(b){ return {statusCode:200,headers:H,body:JSON.stringify(b)}; }
function fail(msg,code){ return {statusCode:code||200,headers:H,body:JSON.stringify({ok:false,error:msg})}; }

function indexKey(uid){ return 'scenarios:'+uid+':index'; }
function stateKey(uid,id){ return 'scenarios:'+uid+':state:'+id; }
function photoKey(uid,id){ return 'scenarios:'+uid+':photo:'+id; }

async function readIndex(uid){
  const raw=await redisCmd('GET',indexKey(uid));
  if(!raw) return [];
  try{const a=JSON.parse(raw);return Array.isArray(a)?a:[];}catch(e){return [];}
}
async function writeIndex(uid,arr){
  return rSet(indexKey(uid),arr);
}

// ── Handler ───────────────────────────────────────────────────────────
exports.handler = async function(event){
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};

  if(!REDIS_URL||!REDIS_TOKEN){
    console.error('[scenarios] Missing UPSTASH env vars');
    return fail('Storage not configured — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',500);
  }

  // ── Auth check ──────────────────────────────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  let currentUser = null;

  // Support both token auth (logged-in) and guest mode (no auth, localStorage only)
  if(authHeader){
    try{ currentUser = await verifyToken(authHeader); }catch(e){ console.warn('[scenarios] Token verify error:',e.message); }
    if(!currentUser) return fail('Invalid or expired session — please sign in again',401);
  }

  // Guest mode: no auth header → return empty (frontend uses localStorage)
  if(!currentUser){
    if(event.httpMethod==='GET') return ok([]);
    return fail('Authentication required',401);
  }

  const uid = currentUser.userId;

  // ── GET — list all scenarios ─────────────────────────────────────────
  if(event.httpMethod==='GET'){
    try{
      const index=await readIndex(uid);
      return ok(index);
    }catch(e){
      console.error('[scenarios] GET error:',e.message);
      return fail('Failed to load library: '+e.message,500);
    }
  }

  // ── POST — save/photo/getPhoto ───────────────────────────────────────
  if(event.httpMethod==='POST'){
    let body;
    try{body=JSON.parse(event.body||'{}');}catch(e){return fail('Bad request',400);}
    const {action}=body;

    // Save scenario state
    if(!action||action==='save'){
      const {id,fullAddr,state,hasPhoto,status,thumb}=body;
      if(!id||!fullAddr||!state) return fail('id, fullAddr and state required');

      // Save state blob
      await rSet(stateKey(uid,id), state);

      // Update index
      const index=await readIndex(uid);
      const existing=index.findIndex(s=>s.id===id);
      const entry={id,fullAddr,hasPhoto:!!hasPhoto,status:status||'browsing',savedAt:Date.now(),thumb:thumb||''};
      if(existing>=0) index[existing]=entry; else index.push(entry);
      await writeIndex(uid,index);

      return ok({ok:true,id});
    }

    // Save photo
    if(action==='photo'){
      const {id,photo}=body;
      if(!id) return fail('id required');
      if(photo){
        await rSet(photoKey(uid,id),photo);
        // Mark hasPhoto in index
        const index=await readIndex(uid);
        const idx=index.findIndex(s=>s.id===id);
        if(idx>=0){index[idx].hasPhoto=true;await writeIndex(uid,index);}
      } else {
        // Clearing photo
        await redisCmd('DEL',photoKey(uid,id));
        const index=await readIndex(uid);
        const idx=index.findIndex(s=>s.id===id);
        if(idx>=0){index[idx].hasPhoto=false;await writeIndex(uid,index);}
      }
      return ok({ok:true});
    }

    // Get scenario state
    if(action==='getState'){
      const {id}=body;
      if(!id) return fail('id required');
      const state=await rGet(stateKey(uid,id));
      return ok({ok:true,state});
    }

    // Get photo
    if(action==='getPhoto'){
      const {id}=body;
      if(!id) return fail('id required');
      const photo=await redisCmd('GET',photoKey(uid,id));
      return ok({ok:true,photo:photo||null});
    }

    // Update status only
    if(action==='updateStatus'){
      const {id,status}=body;
      const index=await readIndex(uid);
      const idx=index.findIndex(s=>s.id===id);
      if(idx>=0){index[idx].status=status;await writeIndex(uid,index);}
      return ok({ok:true});
    }

    return fail('Unknown action');
  }

  // ── DELETE — remove a scenario ────────────────────────────────────────
  if(event.httpMethod==='DELETE'){
    const id=event.queryStringParameters?.id;
    if(!id) return fail('id query param required');

    const index=await readIndex(uid);
    const newIndex=index.filter(s=>s.id!==id);
    await writeIndex(uid,newIndex);

    // Delete state and photo (best-effort, pipeline)
    try{
      await redisPipe([
        ['DEL',stateKey(uid,id)],
        ['DEL',photoKey(uid,id)],
      ]);
    }catch(e){ console.warn('[scenarios] DEL pipeline warn:',e.message); }

    return ok({ok:true});
  }

  return fail('Method not allowed',405);
};

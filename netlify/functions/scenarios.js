/**
 * scenarios.js — Netlify Function
 * Per-user property library backed by Upstash Redis.
 *
 * AUTH STRATEGY (two methods accepted):
 *   1. Bearer token  → Authorization: Bearer <token>   (preferred, issued by auth.js)
 *   2. userId in body → { userId: "..." }              (fallback for sessions without token)
 *
 * Redis keys (all per-user):
 *   scenarios:<userId>:index          → [{id, fullAddr, hasPhoto, status, savedAt, thumb}]
 *   scenarios:<userId>:state:<id>     → scenario state JSON
 *   scenarios:<userId>:photo:<id>     → base64 photo data
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

// ── Token verification ────────────────────────────────────────────────
async function verifyToken(authHeader){
  if(!authHeader||!authHeader.startsWith('Bearer ')) return null;
  const token=authHeader.slice(7).trim();
  if(!token) return null;
  const raw=await redisCmd('GET','token:'+token);
  if(!raw) return null;
  let data;
  try{data=JSON.parse(raw);}catch(e){return null;}
  if(data.expires&&Date.now()>data.expires){ await redisCmd('DEL','token:'+token); return null; }
  // Check user still exists — deleted users should not retain access
  if(data.email){ const u=await redisCmd('GET','user:'+data.email); if(!u) return null; }
  return data; // {userId, email, name, plan, role}
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
async function writeIndex(uid,arr){ return rSet(indexKey(uid),arr); }

// ── Resolve user from request ─────────────────────────────────────────
// Returns userId string or null. Requires a valid Bearer token — no fallback.
async function resolveUser(event, _body){
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if(!authHeader) return null;
  try{
    const user = await verifyToken(authHeader);
    return user ? user.userId : null;
  }catch(e){ console.warn('[scenarios] token verify error:', e.message); return null; }
}

// ── Admin: resolve admin token ────────────────────────────────────────
async function verifyAdminToken(authHeader){
  const data = await verifyToken(authHeader);
  if(!data || data.role !== 'admin') return null;
  return data;
}

// ── Handler ───────────────────────────────────────────────────────────
exports.handler = async function(event){
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};

  if(!REDIS_URL||!REDIS_TOKEN){
    console.error('[scenarios] Missing UPSTASH env vars');
    return fail('Storage not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Netlify → Site Settings → Environment Variables.',500);
  }

  // Parse body early so resolveUser can read userId fallback
  let body = null;
  if(event.body){
    try{ body = JSON.parse(event.body); }catch(e){ return fail('Bad request body',400); }
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';

  // ── GET — list all scenarios ─────────────────────────────────────────
  if(event.httpMethod==='GET'){
    // Admin override: admin can view any user's scenarios
    const adminTargetId = event.queryStringParameters?.adminUserId;
    if(adminTargetId){
      const admin = await verifyAdminToken(authHeader);
      if(!admin) return fail('Admin access required', 401);
      try{
        const index = await readIndex(adminTargetId);
        return ok(index);
      }catch(e){
        return fail('Failed to load scenarios: '+e.message, 500);
      }
    }

    const uid = await resolveUser(event, body);
    if(!uid) return ok([]); // guest mode — return empty, frontend uses localStorage
    try{
      const index = await readIndex(uid);
      return ok(index);
    }catch(e){
      console.error('[scenarios] GET error:', e.message);
      return fail('Failed to load library: '+e.message, 500);
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if(event.httpMethod==='POST'){
    if(!body) return fail('Request body required', 400);
    const uid = await resolveUser(event, body);
    if(!uid) return fail('Authentication required — please sign in', 401);

    const {action} = body;

    if(!action || action==='save'){
      const {id, fullAddr, state, hasPhoto, status, thumb} = body;
      if(!id || !fullAddr || !state) return fail('id, fullAddr and state are required');
      const stateStr = typeof state==='string' ? state : JSON.stringify(state);
      if(stateStr.length > 2_000_000) return fail('Scenario state too large');
      await rSet(stateKey(uid,id), stateStr);
      const index = await readIndex(uid);
      const existing = index.findIndex(s=>s.id===id);
      const entry = {id, fullAddr, hasPhoto:!!hasPhoto, status:status||'browsing', savedAt:Date.now(), thumb:thumb||''};
      if(existing>=0) index[existing]=entry; else index.push(entry);
      await writeIndex(uid, index);
      return ok({ok:true, id});
    }

    if(action==='photo'){
      const {id, photo} = body;
      if(!id) return fail('id required');
      if(photo){
        const ps = String(photo);
        if(!/^data:image\/(jpeg|png|webp|gif);base64,/.test(ps)) return fail('Invalid photo format');
        if(ps.length > 1100000) return fail('Photo too large — maximum ~800 KB');
        await rSet(photoKey(uid,id), ps);
        const index=await readIndex(uid);
        const idx=index.findIndex(s=>s.id===id);
        if(idx>=0){index[idx].hasPhoto=true; await writeIndex(uid,index);}
      } else {
        await redisCmd('DEL', photoKey(uid,id));
        const index=await readIndex(uid);
        const idx=index.findIndex(s=>s.id===id);
        if(idx>=0){index[idx].hasPhoto=false; await writeIndex(uid,index);}
      }
      return ok({ok:true});
    }

    if(action==='getState'){
      const {id} = body;
      if(!id) return fail('id required');
      const state = await rGet(stateKey(uid,id));
      return ok({ok:true, state});
    }

    if(action==='getPhoto'){
      const {id} = body;
      if(!id) return fail('id required');
      const photo = await redisCmd('GET', photoKey(uid,id));
      return ok({ok:true, photo: photo||null});
    }

    if(action==='updateStatus'){
      const {id, status} = body;
      const VALID_STATUSES = ['browsing','auction','for-sale','offered','under-offer','unconditional','sold'];
      if(!VALID_STATUSES.includes(status)) return fail('Invalid status value');
      const index = await readIndex(uid);
      const idx = index.findIndex(s=>s.id===id);
      if(idx>=0){index[idx].status=status; await writeIndex(uid,index);}
      return ok({ok:true});
    }

    if(action==='share'){
      const {scenarioId, targetEmail} = body;
      if(!scenarioId||!targetEmail) return fail('scenarioId and targetEmail required');
      // Verify caller identity from token (need name/email for share record)
      const ownerData = await verifyToken(authHeader);
      if(!ownerData||ownerData.userId!==uid) return fail('Auth error');
      // Look up target user
      const norm = targetEmail.toLowerCase().trim();
      const targetUser = await rGet('user:'+norm);
      if(!targetUser) return fail('No EquitySight account found for that email address');
      if(targetUser.id===uid) return fail('Cannot share with yourself');
      // Confirm scenario exists in owner's library
      const idx = await readIndex(uid);
      const sc = idx.find(s=>s.id===scenarioId);
      if(!sc) return fail('Scenario not found');
      // Update owner's share list for this scenario
      const shareKey = 'share:'+uid+':'+scenarioId;
      const shareList = (await rGet(shareKey)) || [];
      if(shareList.find(s=>s.userId===targetUser.id)) return ok({ok:true, already:true, name:targetUser.name||norm});
      shareList.push({userId:targetUser.id, email:targetUser.email, name:targetUser.name||norm, sharedAt:Date.now()});
      await rSet(shareKey, shareList);
      // Add to recipient's shared-with-me list
      const swKey = 'sharedwith:'+targetUser.id;
      const swList = (await rGet(swKey)) || [];
      swList.push({ownerId:uid, ownerEmail:ownerData.email, ownerName:ownerData.name||ownerData.email, scenarioId, fullAddr:sc.fullAddr, thumb:sc.thumb||'', hasPhoto:sc.hasPhoto||false, sharedAt:Date.now()});
      await rSet(swKey, swList);
      return ok({ok:true, name:targetUser.name||norm});
    }

    if(action==='getSharedWithMe'){
      const list = (await rGet('sharedwith:'+uid)) || [];
      return ok({ok:true, items:list});
    }

    if(action==='getSharedState'){
      const {ownerId, scenarioId} = body;
      if(!ownerId||!scenarioId) return fail('ownerId and scenarioId required');
      // Verify share record exists (owner hasn't revoked)
      const shareList = (await rGet('share:'+ownerId+':'+scenarioId)) || [];
      if(!shareList.find(s=>s.userId===uid)) return fail('Access denied — share may have been revoked');
      const state = await rGet(stateKey(ownerId, scenarioId));
      const photo = await redisCmd('GET', photoKey(ownerId, scenarioId));
      return ok({ok:true, state, photo:photo||null});
    }

    if(action==='getMyShares'){
      // Get list of who a specific scenario is shared with (owner only)
      const {scenarioId} = body;
      if(!scenarioId) return fail('scenarioId required');
      const shareList = (await rGet('share:'+uid+':'+scenarioId)) || [];
      return ok({ok:true, shares:shareList});
    }

    if(action==='removeShare'){
      const {scenarioId, targetUserId} = body;
      if(!scenarioId||!targetUserId) return fail('scenarioId and targetUserId required');
      const shareKey = 'share:'+uid+':'+scenarioId;
      let shareList = (await rGet(shareKey)) || [];
      shareList = shareList.filter(s=>s.userId!==targetUserId);
      await rSet(shareKey, shareList);
      // Remove from recipient's list
      const swKey = 'sharedwith:'+targetUserId;
      const swList = ((await rGet(swKey))||[]).filter(s=>!(s.ownerId===uid&&s.scenarioId===scenarioId));
      await rSet(swKey, swList);
      return ok({ok:true});
    }

    if(action==='dismissShared'){
      const {ownerId, scenarioId} = body;
      if(!ownerId||!scenarioId) return fail('ownerId and scenarioId required');
      const swKey = 'sharedwith:'+uid;
      const swList = ((await rGet(swKey))||[]).filter(s=>!(s.ownerId===ownerId&&s.scenarioId===scenarioId));
      await rSet(swKey, swList);
      return ok({ok:true});
    }

    return fail('Unknown action');
  }

  // ── DELETE ───────────────────────────────────────────────────────────
  if(event.httpMethod==='DELETE'){
    const id = event.queryStringParameters?.id;
    if(!id) return fail('id query param required');

    // Admin override: admin can delete any user's scenario
    const adminTargetId = event.queryStringParameters?.adminUserId;
    if(adminTargetId){
      const admin = await verifyAdminToken(authHeader);
      if(!admin) return fail('Admin access required', 401);
      const index = await readIndex(adminTargetId);
      await writeIndex(adminTargetId, index.filter(s=>s.id!==id));
      const adminDelCmds = [['DEL',stateKey(adminTargetId,id)],['DEL',photoKey(adminTargetId,id)]];
      try{
        const sk = 'share:'+adminTargetId+':'+id;
        const sl = await rGet(sk);
        if(sl && Array.isArray(sl)){
          for(const s of sl){
            const swk = 'sharedwith:'+s.userId;
            const swl = ((await rGet(swk))||[]).filter(x=>!(x.ownerId===adminTargetId&&x.scenarioId===id));
            await rSet(swk, swl);
          }
          adminDelCmds.push(['DEL', sk]);
        }
      }catch(e){ console.warn('[scenarios] admin share cleanup warn:', e.message); }
      try{ await redisPipe(adminDelCmds); }
      catch(e){ console.warn('[scenarios] admin DEL pipeline warn:', e.message); }
      return ok({ok:true});
    }

    const uid = await resolveUser(event, body);
    if(!uid) return fail('Authentication required', 401);
    const index = await readIndex(uid);
    await writeIndex(uid, index.filter(s=>s.id!==id));
    // Clean up state, photo, and share data
    const delCmds = [['DEL',stateKey(uid,id)],['DEL',photoKey(uid,id)]];
    try{
      // Remove share list and notify recipients
      const shareKey = 'share:'+uid+':'+id;
      const shareList = await rGet(shareKey);
      if(shareList && Array.isArray(shareList)){
        for(const s of shareList){
          const swKey = 'sharedwith:'+s.userId;
          const swList = ((await rGet(swKey))||[]).filter(x=>!(x.ownerId===uid&&x.scenarioId===id));
          await rSet(swKey, swList);
        }
        delCmds.push(['DEL', shareKey]);
      }
    }catch(e){ console.warn('[scenarios] share cleanup warn:', e.message); }
    try{ await redisPipe(delCmds); }
    catch(e){ console.warn('[scenarios] DEL pipeline warn:', e.message); }
    return ok({ok:true});
  }

  return fail('Method not allowed', 405);
};

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

const log = require('./_log');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const EMAIL_FROM = (process.env.VERIFY_EMAIL_FROM || 'noreply@equitysight.app').trim();

const ALLOWED_ORIGINS = (process.env.SITE_URL || 'https://equitysight.app').split(',').map(s => s.trim());
// CSRF defense-in-depth. See auth.js for the rationale.
function isAllowedOrigin(event){
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if(!o) return true;
  return ALLOWED_ORIGINS.includes(o) || o.endsWith('.netlify.app');
}
function getCorsHeaders(event) {
  const reqOrigin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin
    : reqOrigin.endsWith('.netlify.app') ? reqOrigin
    : ALLOWED_ORIGINS[0];
  return {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'Access-Control-Allow-Credentials':'true',
  };
}
let H = {};

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

// Append a structured event for a userId (shared with auth.js event log)
async function scanAll(pattern){
  const results=[];
  let cursor='0';
  do{
    const res=await redisCmd('SCAN',cursor,'MATCH',pattern,'COUNT','200');
    cursor=res[0]; if(res[1]) results.push(...res[1]);
  }while(cursor!=='0');
  return results;
}

async function logEvent(userId,type,extra){
  if(!userId) return;
  try{
    await redisCmd('RPUSH','events:'+userId, JSON.stringify({type,at:Date.now(),...extra}));
    await redisCmd('LTRIM','events:'+userId,'0','199');
  }catch(e){ console.warn('[scenarios] logEvent failed:',e.message); }
}

// Default templates (must match auth.js DEFAULT_TEMPLATES for these types)
const SHARE_DEFAULTS = {
  scenario_shared: {
    subject: '{{senderName}} shared a property scenario with you',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="color:#C9A84C;">Scenario shared with you</h2><p>Hi {{firstName}},</p><p><strong>{{senderName}}</strong> has shared a property scenario with you on EquitySight{{address}}.</p><p>Open your calculator to view the shared scenario:</p><a href="https://equitysight.app/app" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#1C1C1E;text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">View Scenario</a><p style="margin-top:24px;font-size:12px;color:#888;">You can find shared scenarios in your Saved Library.</p></div>',
  },
  scenario_invite: {
    subject: '{{senderName}} shared a property with you on EquitySight',
    html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E;"><h2 style="font-size:20px;margin-bottom:8px;">You\'ve been invited to EquitySight</h2><p style="font-size:14px;color:#4A4A52;line-height:1.7;"><strong>{{senderName}}</strong> wants to share a property scenario with you{{address}}.</p><p style="font-size:14px;color:#4A4A52;line-height:1.7;">Sign up for a free EquitySight account to view it:</p><p style="text-align:center;margin:24px 0;"><a href="https://equitysight.app/login" style="display:inline-block;padding:12px 28px;background:#1C1C1E;color:#F5F0E8;border-radius:4px;text-decoration:none;font-size:14px;font-weight:600;">Create Free Account</a></p><p style="font-size:12px;color:#999;line-height:1.6;">EquitySight offers free Australian property finance calculators for all 8 states. Free to use, no credit card required.</p></div>',
  },
};

function applyVars(str, vars){
  return Object.entries(vars).reduce((s,[k,v])=>s.replace(new RegExp('\\{\\{'+k+'\\}\\}','g'),v||''), str);
}

async function getEmailTemplate(type){
  try{
    const saved = await rGet('email-template:'+type);
    if(saved && saved.subject && saved.html) return saved;
  }catch(e){}
  return SHARE_DEFAULTS[type] || null;
}

// Send share email via Resend (template-based)
async function sendShareEmail(toEmail, templateType, vars){
  if(!RESEND_API_KEY) return false;
  try{
    const tpl = await getEmailTemplate(templateType);
    if(!tpl) return false;
    const subject = applyVars(tpl.subject, vars);
    const html = applyVars(tpl.html, vars);
    const r = await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({from:EMAIL_FROM, to:[toEmail], subject, html})
    });
    if(!r.ok){ console.warn('[scenarios] share email error:',r.status); return false; }
    return true;
  }catch(e){ console.warn('[scenarios] share email failed:',e.message); return false; }
}

// ── Token verification ────────────────────────────────────────────────
function readCookieToken(event) {
  const raw = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  if (!raw) return '';
  for (const p of raw.split(/;\s*/)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === 'es_session') {
      try { return decodeURIComponent(p.slice(eq + 1)); } catch (e) { return p.slice(eq + 1); }
    }
  }
  return '';
}
async function verifyToken(event){
  const token = readCookieToken(event);
  if(!token) return null;
  const raw=await redisCmd('GET','token:'+token);
  if(!raw) return null;
  let data;
  try{data=JSON.parse(raw);}catch(e){return null;}
  if(data.expires&&Date.now()>data.expires){ await redisCmd('DEL','token:'+token); return null; }
  // Check user still exists — deleted users should not retain access. While we
  // have the record, refresh plan from it: the token snapshot goes stale after
  // Stripe upgrades / admin plan changes (same freshness rule as portfolio.js —
  // matters here because the scenario cap is plan-based).
  if(data.email){
    const u=await redisCmd('GET','user:'+data.email);
    if(!u) return null;
    try{
      const userData=JSON.parse(u);
      if(userData && userData.plan) data.plan=userData.plan;
    }catch(e){ /* keep token plan */ }
  }
  return data; // {userId, email, name, plan, role}
}


function ok(b){ return {statusCode:200,headers:H,body:JSON.stringify(b)}; }
function fail(msg,code){ return {statusCode:code||200,headers:H,body:JSON.stringify({ok:false,error:msg})}; }
function capFail(cap){ return {statusCode:403,headers:H,body:JSON.stringify({ok:false,error:'cap',cap})}; }

// Scenario cap per plan — the SERVER is the source of truth, never the client.
// Free limit is the same admin-configurable value the client mirrors
// (config:site.freeScenarioLimit, cached client-side as propCalc_siteConfig_v1
// and read in app.js saveScenario()); pro/adviser get the portfolio.js-style
// 100 sanity cap. Enforced on CREATE only — updates always allowed.
function capMaxScenarios(plan, cfg){
  if(plan==='pro'||plan==='adviser') return 100;
  const n=parseInt(cfg&&cfg.freeScenarioLimit,10);
  return (isFinite(n)&&n>0)?n:1;
}

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
// Returns userId string or null. Requires a valid session (cookie or Bearer token).
async function resolveUser(event, _body){
  try{
    const user = await verifyToken(event);
    return user ? user.userId : null;
  }catch(e){ console.warn('[scenarios] token verify error:', e.message); return null; }
}

// ── Admin: resolve admin token ────────────────────────────────────────
async function verifyAdminToken(event){
  const data = await verifyToken(event);
  if(!data || data.role !== 'admin') return null;
  return data;
}

// ── Handler ───────────────────────────────────────────────────────────
exports.handler = async function(event){
  H = getCorsHeaders(event);
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};
  if(event.httpMethod!=='GET' && !isAllowedOrigin(event)) return fail('Forbidden',403);

  if(!REDIS_URL||!REDIS_TOKEN){
    console.error('[scenarios] Missing UPSTASH env vars');
    return fail('Storage not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Netlify → Site Settings → Environment Variables.',500);
  }

  // Per-IP rate limit FIRST — cheapest guard, runs before body parse and any
  // auth lookups so unauthenticated bot floods (the July 2026 credit incident)
  // are shed early. Mirrors portfolio.js verbatim, keys ratelimit:scenarios:ip:<ip>.
  const clientIp = ((event.headers && event.headers['x-nf-client-connection-ip']) || 'unknown').split(',')[0].trim();
  try {
    const ipKey = 'ratelimit:scenarios:ip:' + clientIp;
    const ipCount = parseInt(await redisCmd('INCR', ipKey), 10);
    if (ipCount === 1) await redisCmd('EXPIRE', ipKey, '60');
    if (ipCount > 30) {
      log.warn('scenarios.rate_limited', { scope: 'ip', ip: clientIp, count: ipCount });
      return fail('Too many requests — please slow down and try again in a minute.', 429);
    }
  } catch(e) { console.warn('[scenarios] ip rate-limit error:', e.message); }

  // Parse body early so resolveUser can read userId fallback
  let body = null;
  if(event.body){
    try{ body = JSON.parse(event.body); }catch(e){ return fail('Bad request body',400); }
  }

  // ── GET — list all scenarios ─────────────────────────────────────────
  if(event.httpMethod==='GET'){
    // Admin override: admin can view any user's scenarios
    const adminTargetId = event.queryStringParameters?.adminUserId;
    if(adminTargetId){
      const admin = await verifyAdminToken(event);
      if(!admin) return fail('Admin access required', 401);
      try{
        const index = await readIndex(adminTargetId);
        return ok(index);
      }catch(e){
        return fail('Failed to load scenarios. Please try again.', 500);
      }
    }

    const uid = await resolveUser(event, body);
    if(!uid) return ok([]); // guest mode — return empty, frontend uses localStorage
    try{
      const index = await readIndex(uid);
      return ok(index);
    }catch(e){
      console.error('[scenarios] GET error:', e.message);
      return fail('Failed to load library. Please try again.', 500);
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if(event.httpMethod==='POST'){
    if(!body) return fail('Request body required', 400);

    const {action} = body;

    // Admin: list all users' scenarios (no resolveUser needed — uses admin token)
    if(action==='adminListAllScenarios'){
      const admin=await verifyAdminToken(event);
      if(!admin) return fail('Admin access required',401);
      try{
        // Scan all scenario index keys and user keys
        const indexKeys=await scanAll('scenarios:*:index');
        const userKeys=await scanAll('user:*');
        // Build userId→{email,name} map
        const userMap={};
        await Promise.all((userKeys||[]).map(async k=>{
          const u=await rGet(k);
          if(u&&u.id) userMap[u.id]={email:u.email||k.replace('user:',''),name:u.name||''};
        }));
        // Build groups
        const groups=[];
        await Promise.all((indexKeys||[]).map(async k=>{
          const uid=k.replace('scenarios:','').replace(':index','');
          const idx=await rGet(k);
          if(!Array.isArray(idx)||!idx.length) return;
          const u=userMap[uid]||{email:'unknown',name:''};
          groups.push({userId:uid,userEmail:u.email,userName:u.name,scenarios:idx});
        }));
        return ok({ok:true,groups});
      }catch(e){ return fail('Error. Please try again.'); }
    }

    // Admin: get another user's scenario state
    if(action==='adminGetScenarioState'){
      const admin=await verifyAdminToken(event);
      if(!admin) return fail('Admin access required',401);
      const {userId:targetUid,id}=body;
      if(!targetUid||!id) return fail('userId and id required');
      try{
        const state=await rGet(stateKey(targetUid,id));
        const photo=await rGet(photoKey(targetUid,id));
        return ok({ok:true,state,photo:photo||null});
      }catch(e){ return fail('Error. Please try again.'); }
    }

    // Resolve the session ONCE and keep the whole record — the create cap below
    // needs plan, not just userId (same data resolveUser reads, so behaviour for
    // every other action is unchanged).
    let sessionUser = null;
    try{ sessionUser = await verifyToken(event); }
    catch(e){ console.warn('[scenarios] token verify error:', e.message); }
    const uid = sessionUser ? sessionUser.userId : null;
    if(!uid) return fail('Authentication required — please sign in', 401);

    if(!action || action==='save'){
      const {id, fullAddr, state, hasPhoto, status, thumb} = body;
      if(!id || !fullAddr || !state) return fail('id, fullAddr and state are required');
      const stateStr = typeof state==='string' ? state : JSON.stringify(state);
      // Server-side size guard — 256 KB temporary ceiling while v1 DOM-dump
      // blobs still exist (typed v2 records serialize to ~2-4 KB; the ceiling
      // drops once the step-5 client cutover lands). Oversized attempts are
      // logged for visibility, portfolio.js-style.
      if(stateStr.length > 262144){
        log.warn('scenarios.save_too_large', { userId: uid, bytes: stateStr.length });
        return {statusCode:413,headers:H,body:JSON.stringify({ok:false,error:'too_large'})};
      }
      // v2 accept-but-flag: records with v:2 (shared/scenario-schema.js) start
      // arriving with the step-5 client cutover. BOTH shapes are accepted and
      // stored verbatim — nothing below is v1-specific — the flag is rollout
      // monitoring only. Full v2 validation moves server-side at cutover.
      let isV2 = false;
      try{
        const st = typeof state==='string' ? JSON.parse(state) : state;
        isV2 = !!(st && st.v===2);
      }catch(e){ /* unparseable → treat as v1 blob */ }
      if(isV2) log.info('scenarios.v2_save', { userId: uid });

      const index = await readIndex(uid);
      const existing = index.findIndex(s=>s.id===id);
      const isNew = existing < 0;
      if(isNew){
        // CREATE — server-enforced plan cap (mirrors portfolio.js; the
        // client-side freeScenarioLimit gate in app.js is a UX nicety, never
        // the source of truth). Updates to an existing id are always allowed.
        const plan = (sessionUser && sessionUser.plan) || 'free';
        let cfg = {};
        try{ cfg = (await rGet('config:site')) || {}; }catch(e){ /* default limit */ }
        const max = capMaxScenarios(plan, cfg);
        if(index.length >= max){
          log.info('scenarios.cap_hit', { userId: uid, plan, used: index.length, max });
          return capFail({ max, used: index.length, plan });
        }
      }
      await rSet(stateKey(uid,id), stateStr);
      const entry = {id, fullAddr, hasPhoto:!!hasPhoto, status:status||'browsing', savedAt:Date.now(), thumb:thumb||''};
      if(isNew) index.push(entry); else index[existing]=entry;
      await writeIndex(uid, index);
      if(isNew) logEvent(uid,'scenario_created',{address:fullAddr}).catch(()=>{});
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
      const ownerData = await verifyToken(event);
      if(!ownerData||ownerData.userId!==uid) return fail('Auth error');
      // Rate-limit share-email blast: prevents one account from spamming
      // arbitrary addresses with "X invited you" notifications. Mirrors the
      // pattern used by comments.js / reviews.js.
      try {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const userDayKey = 'scenarios:shareCount:' + uid + ':' + today;
        const userCount = parseInt(await redisCmd('INCR', userDayKey), 10);
        if (userCount === 1) await redisCmd('EXPIRE', userDayKey, '86400');
        if (userCount > 20) return fail('You have reached the daily share limit (20/day)', 429);
        const clientIp = (event.headers['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
        const ipKey = 'ratelimit:scenarios-share:' + clientIp;
        const ipCount = parseInt(await redisCmd('INCR', ipKey), 10);
        if (ipCount === 1) await redisCmd('EXPIRE', ipKey, '3600');
        if (ipCount > 30) return fail('Too many share requests — please try again later', 429);
      } catch(e) { console.warn('[scenarios] share rate-limit error:', e.message); }
      // Look up target user
      const norm = targetEmail.toLowerCase().trim();
      const targetUser = await rGet('user:'+norm);
      if(!targetUser){
        // User doesn't exist — send invite email using scenario_invite template
        const idx2 = await readIndex(uid);
        const sc2 = idx2.find(s=>s.id===scenarioId);
        const addrStr = sc2&&sc2.fullAddr ? ' \u2014 <em>'+sc2.fullAddr.replace(/[<>&"]/g,'')+'</em>' : '';
        const sent = await sendShareEmail(norm, 'scenario_invite', {
          senderName: (ownerData.name||ownerData.email).replace(/[<>&"]/g,''),
          address: addrStr,
        });
        logEvent(uid,'share_invite_sent',{to:norm,address:sc2?sc2.fullAddr:''}).catch(()=>{});
        return ok({ok:true, invited:true, email:norm, sent});
      }
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
      // Send notification email to existing user using scenario_shared template
      const addrStr = sc.fullAddr ? ' \u2014 <em>'+sc.fullAddr.replace(/[<>&"]/g,'')+'</em>' : '';
      const recipientFirst = targetUser.name ? targetUser.name.split(' ')[0] : norm;
      sendShareEmail(norm, 'scenario_shared', {
        firstName: recipientFirst.replace(/[<>&"]/g,''),
        senderName: (ownerData.name||ownerData.email).replace(/[<>&"]/g,''),
        address: addrStr,
      }).catch(()=>{});
      logEvent(uid,'scenario_shared',{address:sc.fullAddr,to:norm}).catch(()=>{});
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

    // ── Public share links ───────────────────────────────────────────────
    // Distinct from the user-to-user `share` action above. A public share is
    // an unguessable-token, link-only, read-only snapshot anyone can view
    // WITHOUT an account — the growth/virality path (Reddit, socials, SMS).
    // We snapshot the already-computed display values the sharer is looking
    // at (not raw inputs), so the viewer renders byte-for-byte what they saw
    // with zero recompute risk. Rendered + escaped by share-view.js.
    if(action==='createPublicShare'){
      const ownerData = await verifyToken(event);
      if(!ownerData || ownerData.userId !== uid) return fail('Auth error', 401);
      const { snapshot, includeAddress } = body;
      if(!snapshot || typeof snapshot !== 'object') return fail('snapshot required');
      const snapStr = JSON.stringify(snapshot);
      // Cap sized to comfortably hold an embedded property/map photo. Photos
      // are validated at ≤1.1 MB at upload; base64 + the other fields land
      // well under 1.6 MB. The client also drops an oversized photo before
      // sending (graceful degradation) so this is a backstop, not the gate.
      if(snapStr.length > 1600000) return fail('Snapshot too large');

      // Rate limit — mirror the user-to-user share caps. Prevents a single
      // account minting thousands of public URLs.
      try {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const userDayKey = 'pubshare:count:' + uid + ':' + today;
        const userCount = parseInt(await redisCmd('INCR', userDayKey), 10);
        if (userCount === 1) await redisCmd('EXPIRE', userDayKey, '86400');
        if (userCount > 50) return fail('Daily share-link limit reached (50/day)', 429);
        const clientIp = (event.headers['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
        const ipKey = 'ratelimit:pubshare:' + clientIp;
        const ipCount = parseInt(await redisCmd('INCR', ipKey), 10);
        if (ipCount === 1) await redisCmd('EXPIRE', ipKey, '3600');
        if (ipCount > 60) return fail('Too many share links — please try again later', 429);
      } catch(e) { console.warn('[scenarios] pubshare rate-limit error:', e.message); }

      // URL-safe random token (16 bytes ≈ 22 chars). Unguessable.
      const token = require('crypto').randomBytes(16).toString('base64')
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const rec = {
        v: 1,
        ownerId: uid,
        createdAt: Date.now(),
        includeAddress: !!includeAddress,
        snapshot,
      };
      // Store with a 1-year TTL using SETEX (the proven TTL-write pattern
      // used elsewhere in this codebase). Then READ IT BACK: if the write
      // didn't land — almost always because the embedded photo made the
      // value too large for the Redis REST request — drop the photo and
      // retry. We only return ok once the record is confirmed stored, so a
      // generated /s/ link can never 404. (Numbers matter more than the pic.)
      const TTL = String(60 * 60 * 24 * 365);
      const shareKey = 'pubshare:' + token;
      async function storeAndVerify(record){
        try {
          await redisCmd('SETEX', shareKey, TTL, JSON.stringify(record));
          const back = await redisCmd('GET', shareKey);
          return !!back;
        } catch (e) { return false; }
      }
      let stored = await storeAndVerify(rec);
      if(!stored && rec.snapshot && rec.snapshot.photo){
        rec.snapshot.photo = '';
        rec.snapshot._photoDropped = true;
        stored = await storeAndVerify(rec);
      }
      if(!stored) return fail('Could not save the share link — please try again.');
      // Owner index for management / revoke.
      const listKey = 'pubshares:'+uid;
      const list = (await rGet(listKey)) || [];
      list.unshift({
        token,
        label: includeAddress ? (snapshot.addr || snapshot.suburbState || 'Scenario')
                              : (snapshot.suburbState || 'Scenario'),
        createdAt: Date.now(),
      });
      await rSet(listKey, list.slice(0,200));
      logEvent(uid,'public_share_created',{addr: snapshot.suburbState||''}).catch(()=>{});
      return ok({ ok:true, token, url: 'https://equitysight.app/s/'+token });
    }

    if(action==='listPublicShares'){
      const list = (await rGet('pubshares:'+uid)) || [];
      return ok({ ok:true, shares:list });
    }

    if(action==='revokePublicShare'){
      const { token } = body;
      if(!token) return fail('token required');
      // Only the owner can revoke — verify the stored record's ownerId.
      const rec = await rGet('pubshare:'+token);
      if(rec && rec.ownerId && rec.ownerId !== uid) return fail('Not your share', 403);
      await redisCmd('DEL', 'pubshare:'+token);
      const listKey = 'pubshares:'+uid;
      const list = ((await rGet(listKey))||[]).filter(s=>s.token!==token);
      await rSet(listKey, list);
      return ok({ ok:true });
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
      const admin = await verifyAdminToken(event);
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
    const deleted = index.find(s=>s.id===id);
    await writeIndex(uid, index.filter(s=>s.id!==id));
    if(deleted) logEvent(uid,'scenario_deleted',{address:deleted.fullAddr||''}).catch(()=>{});
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

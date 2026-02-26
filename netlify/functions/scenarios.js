const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || "").replace(/^["']|["']$/g, "").trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").replace(/^["']|["']$/g, "").trim();
const INDEX_KEY        = "prop_calc_index";
const INDEX_BACKUP_KEY = "prop_calc_index_backup"; // second copy — survives LRU eviction of the main key

var H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function redisCmd(args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("UPSTASH env vars missing");
  var r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error("Redis HTTP " + r.status);
  var j = await r.json();
  return j.result;
}

// Pipeline: run multiple commands in one round-trip
async function redisPipeline(cmds) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("UPSTASH env vars missing");
  var r = await fetch(REDIS_URL + "/pipeline", {
    method: "POST",
    headers: { "Authorization": "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error("Redis pipeline HTTP " + r.status);
  return await r.json();
}

async function readIndex() {
  // Try main key, auto-recover from backup if main was evicted
  var raw = await redisCmd(["GET", INDEX_KEY]);
  if (!raw || raw === "null") {
    console.log("[scenarios] Main index empty — trying backup key");
    raw = await redisCmd(["GET", INDEX_BACKUP_KEY]);
    if (raw && raw !== "null") {
      // Restore main key from backup
      await redisCmd(["SET", INDEX_KEY, raw]);
      console.log("[scenarios] Recovered index from backup");
    }
  }
  try {
    var arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch(e) { return []; }
}

async function writeIndex(arr) {
  var json = JSON.stringify(arr);
  // Write both keys in a single pipeline round-trip
  await redisPipeline([
    ["SET", INDEX_KEY,        json],
    ["SET", INDEX_BACKUP_KEY, json]
  ]);
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: H, body: "" };
  }

  console.log("[scenarios] ENV — URL:", !!REDIS_URL, "TOKEN:", !!REDIS_TOKEN, "method:", event.httpMethod);

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("[scenarios] MISSING ENV VARS — Netlify dashboard -> Site settings -> Environment variables");
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: "Storage not configured" }) };
  }

  // GET — return full list, auto-recovering from backup if needed
  if (event.httpMethod === "GET") {
    try {
      var arr = await readIndex();
      return { statusCode: 200, headers: H, body: JSON.stringify(arr) };
    } catch(e) {
      console.error("[scenarios] GET error:", e.message);
      return { statusCode: 200, headers: H, body: "[]" };
    }
  }

  // POST — save/update a property
  if (event.httpMethod === "POST") {
    try {
      var body   = JSON.parse(event.body || "{}");
      var record   = body.record;
      var photoSrc = body.photoSrc;

      if (!record || !record.id) {
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing record.id" }) };
      }

      // Photo-only background upload (sent separately from main save for speed)
      if (photoSrc && Object.keys(record).length === 1) {
        await redisCmd(["SET", "prop_photo_" + record.id, photoSrc]);
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, photoOnly: true }) };
      }

      if (photoSrc) {
        await redisCmd(["SET", "prop_photo_" + record.id, photoSrc]);
      }

      var arr  = await readIndex();
      var slim = Object.assign({}, record);
      slim.hasPhoto = !!(photoSrc || slim.hasPhoto);
      var idx = arr.findIndex(function(s) { return s.id === record.id; });
      if (idx >= 0) { arr[idx] = slim; } else { arr.unshift(slim); }
      await writeIndex(arr); // writes to both main + backup keys
      console.log("[scenarios] Saved", record.id, "— total:", arr.length);
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, total: arr.length }) };
    } catch(e) {
      console.error("[scenarios] POST error:", e.message);
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  // DELETE
  if (event.httpMethod === "DELETE") {
    try {
      var delId = (event.queryStringParameters || {}).id;
      if (!delId) {
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing id" }) };
      }
      await redisCmd(["DEL", "prop_photo_" + delId]);
      var delArr = await readIndex();
      delArr = delArr.filter(function(s) { return s.id !== delId; });
      await writeIndex(delArr);
      console.log("[scenarios] Deleted", delId, "— remaining:", delArr.length);
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      console.error("[scenarios] DELETE error:", e.message);
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: H, body: JSON.stringify({ error: "method not allowed" }) };
};

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || "").replace(/^["']|["']$/g, "").trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").replace(/^["']|["']$/g, "").trim();
const INDEX_KEY   = "prop_calc_index";

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
    headers: {
      "Authorization": "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error("Redis HTTP " + r.status);
  var j = await r.json();
  return j.result;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: H, body: "" };
  }

  // Visible in Netlify dashboard -> Functions -> scenarios -> Logs
  console.log("[scenarios] ENV check — URL set:", !!REDIS_URL, "| TOKEN set:", !!REDIS_TOKEN);

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("[scenarios] MISSING ENV VARS. Go to: Netlify dashboard -> Site settings -> Environment variables -> add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Set 'All scopes'. Redeploy.");
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: "Storage not configured" }) };
  }

  if (event.httpMethod === "GET") {
    try {
      var raw = await redisCmd(["GET", INDEX_KEY]);
      var parsed;
      try { parsed = JSON.parse(raw || "[]"); } catch(pe) { parsed = []; }
      if (!Array.isArray(parsed)) parsed = [];
      return { statusCode: 200, headers: H, body: JSON.stringify(parsed) };
    } catch(e) {
      console.error("[scenarios] GET error:", e.message);
      return { statusCode: 200, headers: H, body: "[]" };
    }
  }

  if (event.httpMethod === "POST") {
    try {
      var body = JSON.parse(event.body || "{}");
      var record   = body.record;
      var photoSrc = body.photoSrc;

      if (!record || !record.id) {
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing record.id" }) };
      }

      // Photo-only background upload
      if (photoSrc && Object.keys(record).length === 1) {
        await redisCmd(["SET", "prop_photo_" + record.id, photoSrc]);
        console.log("[scenarios] Photo stored for", record.id);
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, photoOnly: true }) };
      }

      if (photoSrc) {
        await redisCmd(["SET", "prop_photo_" + record.id, photoSrc]);
      }

      var arr = [];
      try {
        var existing = await redisCmd(["GET", INDEX_KEY]);
        arr = existing ? JSON.parse(existing) : [];
        if (!Array.isArray(arr)) arr = [];
      } catch(e2) { arr = []; }

      var slim = Object.assign({}, record);
      slim.hasPhoto = !!(photoSrc || slim.hasPhoto);
      var idx = arr.findIndex(function(s) { return s.id === record.id; });
      if (idx >= 0) { arr[idx] = slim; } else { arr.unshift(slim); }
      await redisCmd(["SET", INDEX_KEY, JSON.stringify(arr)]);
      console.log("[scenarios] Saved", record.id, "total:", arr.length);
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, total: arr.length }) };
    } catch(e) {
      console.error("[scenarios] POST error:", e.message);
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  if (event.httpMethod === "DELETE") {
    try {
      var delId = (event.queryStringParameters || {}).id;
      if (!delId) {
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing id" }) };
      }
      await redisCmd(["DEL", "prop_photo_" + delId]);
      var delArr = [];
      try {
        var delRaw = await redisCmd(["GET", INDEX_KEY]);
        delArr = delRaw ? JSON.parse(delRaw) : [];
        if (!Array.isArray(delArr)) delArr = [];
      } catch(e3) { delArr = []; }
      delArr = delArr.filter(function(s) { return s.id !== delId; });
      await redisCmd(["SET", INDEX_KEY, JSON.stringify(delArr)]);
      console.log("[scenarios] Deleted", delId, "remaining:", delArr.length);
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      console.error("[scenarios] DELETE error:", e.message);
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: H, body: JSON.stringify({ error: "method not allowed" }) };
};

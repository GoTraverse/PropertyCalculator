const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const INDEX_KEY = "prop_calc_index";

var H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function redisGet(key) {
  var r = await fetch(REDIS_URL + "/get/" + encodeURIComponent(key), {
    headers: { "Authorization": "Bearer " + REDIS_TOKEN }
  });
  var j = await r.json();
  return j.result;
}

async function redisSet(key, value) {
  var r = await fetch(REDIS_URL + "/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(value), {
    headers: { "Authorization": "Bearer " + REDIS_TOKEN }
  });
  return r.ok;
}

async function redisDel(key) {
  await fetch(REDIS_URL + "/del/" + encodeURIComponent(key), {
    headers: { "Authorization": "Bearer " + REDIS_TOKEN }
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: H, body: "" };
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars not set in Netlify" }) };
  }

  if (event.httpMethod === "GET") {
    try {
      var raw = await redisGet(INDEX_KEY);
      return { statusCode: 200, headers: H, body: raw || "[]" };
    } catch(e) {
      return { statusCode: 200, headers: H, body: "[]" };
    }
  }

  if (event.httpMethod === "POST") {
    try {
      var body = JSON.parse(event.body || "{}");
      var record = body.record;
      var photoSrc = body.photoSrc;
      if (!record || !record.id) {
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing id" }) };
      }
      if (photoSrc) {
        await redisSet("prop_photo_" + record.id, photoSrc);
      }
      var arr = [];
      try {
        var existing = await redisGet(INDEX_KEY);
        arr = existing ? JSON.parse(existing) : [];
      } catch(e2) { arr = []; }
      var slim = Object.assign({}, record);
      slim.hasPhoto = !!(photoSrc || slim.hasPhoto);
      var idx = arr.findIndex(function(s) { return s.id === record.id; });
      if (idx >= 0) { arr[idx] = slim; } else { arr.unshift(slim); }
      await redisSet(INDEX_KEY, JSON.stringify(arr));
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  if (event.httpMethod === "DELETE") {
    try {
      var delId = (event.queryStringParameters || {}).id;
      if (!delId) {
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing id" }) };
      }
      await redisDel("prop_photo_" + delId);
      var delArr = [];
      try {
        var delRaw = await redisGet(INDEX_KEY);
        delArr = delRaw ? JSON.parse(delRaw) : [];
      } catch(e3) { delArr = []; }
      delArr = delArr.filter(function(s) { return s.id !== delId; });
      await redisSet(INDEX_KEY, JSON.stringify(delArr));
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: H, body: JSON.stringify({ error: "method not allowed" }) };
};

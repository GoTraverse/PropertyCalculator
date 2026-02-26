const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

var H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: H, body: "" };
  }
  var id = (event.queryStringParameters || {}).id;
  if (!id) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: "missing id" }) };
  }
  try {
    var r = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + REDIS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(["GET", "prop_photo_" + id])
    });
    var j = await r.json();
    var photoSrc = j.result;
    if (!photoSrc) {
      return { statusCode: 404, headers: H, body: JSON.stringify({ error: "not found" }) };
    }
    return { statusCode: 200, headers: H, body: JSON.stringify({ photoSrc: photoSrc }) };
  } catch(e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};

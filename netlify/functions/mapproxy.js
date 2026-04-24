/**
 * mapproxy.js — Netlify Function
 * Server-side proxy: fetches OSM tiles and returns them for client-side stitching.
 * Uses the main tile.openstreetmap.org servers which are far more reliable than staticmap.openstreetmap.de
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g, '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) return null;
    return (await r.json()).result;
  } catch (e) { return null; }
}

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
};

function latLonToTile(lat, lon, zoom){
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  // Rate limit: 60 map requests per IP per hour (1/min average)
  const clientIp = (event.headers['x-nf-client-connection-ip'] || 'unknown').split(',')[0].trim();
  const rlKey = 'mapl:' + clientIp;
  const count = await redisCmd('INCR', rlKey);
  if (count === 1) await redisCmd('EXPIRE', rlKey, '3600');
  if (count > 60) return { statusCode: 429, headers: H, body: JSON.stringify({ ok: false, error: 'Too many requests' }) };

  const lat  = parseFloat(event.queryStringParameters?.lat);
  const lon  = parseFloat(event.queryStringParameters?.lon);
  const zoom = Math.min(18, Math.max(12, parseInt(event.queryStringParameters?.zoom || '16')));

  if(isNaN(lat) || isNaN(lon)) return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'lat and lon required' }) };

  const center = latLonToTile(lat, lon, zoom);
  const maxTile = Math.pow(2, zoom) - 1;

  // Fetch a 3x3 grid of tiles centred on the property
  const grid = [-1, 0, 1];
  const servers = ['a', 'b', 'c']; // round-robin across OSM tile CDN
  let si = 0;

  const tilePromises = [];
  for(const dy of grid){
    for(const dx of grid){
      const tx = Math.max(0, Math.min(maxTile, center.x + dx));
      const ty = Math.max(0, Math.min(maxTile, center.y + dy));
      const sub = servers[si++ % 3];
      const url = `https://${sub}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
      tilePromises.push(
        fetch(url, {
          headers: {
            'User-Agent': 'EquitySight/1.0 (https://equitysight.app)',
            'Accept': 'image/png',
          },
          signal: AbortSignal.timeout(8000),
        }).then(async r => {
          if(!r.ok) return null;
          const buf = await r.arrayBuffer();
          return 'data:image/png;base64,' + Buffer.from(buf).toString('base64');
        }).catch(() => null)
      );
    }
  }

  const tiles = await Promise.all(tilePromises);
  if(tiles.every(t => t === null)) return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'All tile fetches failed' }) };

  return {
    statusCode: 200,
    headers: H,
    body: JSON.stringify({ ok: true, tiles, cols: 3, rows: 3, tileSize: 256 }),
  };
};

/**
 * mapproxy.js — Netlify Function
 * Server-side proxy for static map images to bypass browser CORS restrictions.
 * Fetches the image and returns it as a base64 data URL.
 */

const H = {
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
};

exports.handler = async (event) => {
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:H,body:''};

  const lat = parseFloat(event.queryStringParameters?.lat);
  const lon = parseFloat(event.queryStringParameters?.lon);
  const zoom = parseInt(event.queryStringParameters?.zoom||'17');

  if(isNaN(lat)||isNaN(lon)) return {statusCode:400,headers:H,body:JSON.stringify({ok:false,error:'lat and lon required'})};

  // Clamp zoom to safe range
  const z = Math.min(19, Math.max(1, zoom));

  const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${z}&size=640x480&markers=${lat},${lon},red-pushpin`;

  try{
    const r = await fetch(mapUrl, {
      headers: {
        'User-Agent': 'EquitySight/1.0 (property-calculator)',
        'Accept': 'image/png,image/*',
      }
    });
    if(!r.ok) return {statusCode:502,headers:H,body:JSON.stringify({ok:false,error:'Map service returned '+r.status})};

    const contentType = r.headers.get('content-type') || 'image/png';
    const buffer = await r.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return {statusCode:200,headers:H,body:JSON.stringify({ok:true,dataUrl})};
  }catch(e){
    return {statusCode:502,headers:H,body:JSON.stringify({ok:false,error:e.message})};
  }
};

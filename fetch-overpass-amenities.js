#!/usr/bin/env node
/**
 * fetch-overpass-amenities.js
 *
 * Queries OpenStreetMap Overpass API for all named schools and parks in Australia
 * in a single request, then matches each suburb to nearby amenities using the
 * centroid coordinates from abs-enhanced.json.
 *
 * Reads:  data/abs-enhanced.json   (centroid_lat/lng, sal_code, bbox spans)
 * Writes: data/overpass-amenities.json
 *         { "<sal_code>": { schools: ["Name", ...], parks: ["Name", ...] } }
 *
 * Usage: node fetch-overpass-amenities.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ABS_FILE = path.join(__dirname, 'data', 'abs-enhanced.json');
const OUT_FILE = path.join(__dirname, 'data', 'overpass-amenities.json');

// Haversine distance in km
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function overpassPost(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const options = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'EquitySight/1.0 suburb-amenities-builder (+https://equitysight.app)',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Overpass JSON parse error: ' + data.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(ABS_FILE)) {
    console.error('Missing data/abs-enhanced.json — run fetch-abs-enhanced.js first');
    process.exit(1);
  }

  const absData = JSON.parse(fs.readFileSync(ABS_FILE, 'utf8'));
  const suburbs = absData.filter(s => s.centroid_lat && s.centroid_lng);
  console.log(`Loaded ${suburbs.length} suburbs with centroids`);

  // Single Australia-wide query — schools + parks + nature reserves, named only.
  // bbox format: south,west,north,east
  const query = `
[out:json][timeout:300][bbox:-44,113,-10,154];
(
  node["amenity"="school"]["name"];
  way["amenity"="school"]["name"];
  node["leisure"="park"]["name"];
  way["leisure"="park"]["name"];
  node["leisure"="nature_reserve"]["name"];
  way["leisure"="nature_reserve"]["name"];
  node["leisure"="garden"]["name"];
  way["leisure"="garden"]["name"];
);
out center tags;
`.trim();

  console.log('Querying Overpass API (Australia-wide, this may take 30–90s)...');
  const result = await overpassPost(query);
  const elements = result.elements || [];
  console.log(`Received ${elements.length} amenity features`);

  // Split into schools and parks arrays with just {name, lat, lng}
  const schools = [];
  const parks   = [];
  for (const el of elements) {
    const lat  = el.lat  ?? el.center?.lat;
    const lng  = el.lon  ?? el.center?.lon;
    const name = el.tags?.name;
    if (!lat || !lng || !name) continue;
    if (el.tags.amenity === 'school') {
      schools.push({ name, lat, lng });
    } else {
      parks.push({ name, lat, lng });
    }
  }
  console.log(`  Schools: ${schools.length}  Parks/reserves/gardens: ${parks.length}`);

  // Match suburbs to nearby amenities
  console.log('Matching suburbs to nearby amenities...');
  const output = {};
  let i = 0;

  for (const s of suburbs) {
    // Radius: suburb bbox size × 1.2, clamped 1.5–8 km
    const maxSpanDeg = Math.max(s.bbox_lat_span || 0, s.bbox_lng_span || 0);
    const radiusKm   = Math.max(1.5, Math.min(8, maxSpanDeg * 111 * 1.2));

    const nearSchools = schools
      .map(p => ({ name: p.name, d: distKm(s.centroid_lat, s.centroid_lng, p.lat, p.lng) }))
      .filter(p => p.d <= radiusKm)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(p => p.name);

    const nearParks = parks
      .map(p => ({ name: p.name, d: distKm(s.centroid_lat, s.centroid_lng, p.lat, p.lng) }))
      .filter(p => p.d <= radiusKm)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(p => p.name);

    if (nearSchools.length || nearParks.length) {
      output[s.sal_code] = { schools: nearSchools, parks: nearParks };
    }

    if (++i % 2000 === 0) process.stdout.write(`  ${i}/${suburbs.length}\r`);
  }

  const withSchools = Object.values(output).filter(v => v.schools.length).length;
  const withParks   = Object.values(output).filter(v => v.parks.length).length;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output));

  console.log(`\nSaved ${Object.keys(output).length} entries → ${OUT_FILE}`);
  console.log(`  With schools: ${withSchools}`);
  console.log(`  With parks:   ${withParks}`);
}

main().catch(err => { console.error(err); process.exit(1); });

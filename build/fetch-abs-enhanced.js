#!/usr/bin/env node
/**
 * fetch-abs-enhanced.js
 *
 * Fetches real ABS 2021 Census suburb data from ArcGIS FeatureServer with
 * all fields needed for accurate suburb pages:
 *
 *   - Population
 *   - Centroid coordinates (for real distance-to-CBD calculation)
 *   - Polygon geometry (simplified, maxAllowableOffset=0.01°) → bounding box
 *     spans used to derive accurate map zoom levels per suburb
 *   - Median weekly household income  → annual income
 *   - Median weekly rent
 *   - Median monthly mortgage repayment
 *   - Total occupied dwellings
 *   - Separate house count
 *   - Flat/apartment count
 *
 * Output: data/abs-enhanced.json  (gitignored — regenerate as needed)
 *
 * Usage: node fetch-abs-enhanced.js
 * Prereq: none (hits public ArcGIS endpoint)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://services1.arcgis.com/vHnIGBHHqDR6y0CR/arcgis/rest/services/2021_ABS_General_Community_Profile/FeatureServer/5/query';
const BATCH_SIZE = 2000;
const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'abs-enhanced.json');

const STATE_MAP = {
  '1': 'NSW', '2': 'VIC', '3': 'QLD', '4': 'SA',
  '5': 'WA', '6': 'TAS', '7': 'NT', '8': 'ACT', '9': 'OT'
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse error: ' + body.slice(0, 300))); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchAll() {
  const allRecords = [];
  let offset = 0;

  const fields = [
    'SAL_NAME_2021',
    'SAL_CODE_2021',
    'Tot_P_P',
    'Median_tot_hhd_inc_weekly',
    'Median_rent_weekly',
    'Median_mortgage_repay_monthly',
    'Total_PDs_Dwellings',
    'Total_DS_Sep_house',
    'Total_DS_Flat_apart',
  ].join(',');

  while (true) {
    const params = new URLSearchParams({
      where: 'Tot_P_P > 0',
      outFields: fields,
      returnGeometry: 'true',
      maxAllowableOffset: '0.01',   // ~1km simplification — enough for bbox, much smaller responses
      geometryPrecision: '4',       // 4 dp ≈ 11m — sufficient for bounding box
      returnCentroid: 'true',       // centroid for distance-to-CBD + nearby suburb matching
      orderByFields: 'SAL_CODE_2021 ASC',
      resultOffset: offset,
      resultRecordCount: BATCH_SIZE,
      f: 'json'
    });

    const url = `${BASE_URL}?${params}`;
    console.log(`Fetching offset ${offset}...`);
    const data = await fetch(url);

    if (!data.features || data.features.length === 0) break;

    for (const f of data.features) {
      const attrs = f.attributes;
      const code = String(attrs.SAL_CODE_2021);
      const stateDigit = code.charAt(0);
      const state = STATE_MAP[stateDigit];
      if (!state || state === 'OT') continue;

      const centroid = f.centroid || null;

      // Compute bounding box from polygon rings (handles multi-part polygons)
      let bboxLngSpan = null, bboxLatSpan = null;
      const geom = f.geometry;
      if (geom && geom.rings && geom.rings.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const ring of geom.rings) {
          for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        if (isFinite(minX)) {
          bboxLngSpan = Math.round((maxX - minX) * 1e4) / 1e4;
          bboxLatSpan = Math.round((maxY - minY) * 1e4) / 1e4;
        }
      }

      allRecords.push({
        sal_code: code,
        suburb: attrs.SAL_NAME_2021,
        state,
        population: attrs.Tot_P_P,
        median_weekly_income: attrs.Median_tot_hhd_inc_weekly || null,
        median_rent_weekly: attrs.Median_rent_weekly || null,
        median_mortgage_monthly: attrs.Median_mortgage_repay_monthly || null,
        total_dwellings: attrs.Total_PDs_Dwellings || null,
        sep_house_count: attrs.Total_DS_Sep_house || null,
        flat_count: attrs.Total_DS_Flat_apart || null,
        centroid_lng: centroid ? centroid.x : null,
        centroid_lat: centroid ? centroid.y : null,
        bbox_lng_span: bboxLngSpan,
        bbox_lat_span: bboxLatSpan,
      });
    }

    console.log(`  Got ${data.features.length} records (total: ${allRecords.length})`);
    if (!data.exceededTransferLimit && data.features.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(allRecords, null, 2));

  const withIncome   = allRecords.filter(r => r.median_weekly_income).length;
  const withCentroid = allRecords.filter(r => r.centroid_lat).length;
  const withRent     = allRecords.filter(r => r.median_rent_weekly).length;
  const withBbox     = allRecords.filter(r => r.bbox_lng_span).length;

  console.log(`\nSaved ${allRecords.length} records to ${OUT_FILE}`);
  console.log(`  With income:   ${withIncome}   (${Math.round(100 * withIncome   / allRecords.length)}%)`);
  console.log(`  With centroid: ${withCentroid} (${Math.round(100 * withCentroid / allRecords.length)}%)`);
  console.log(`  With rent:     ${withRent}     (${Math.round(100 * withRent     / allRecords.length)}%)`);
  console.log(`  With bbox:     ${withBbox}     (${Math.round(100 * withBbox     / allRecords.length)}%)`);
}

fetchAll().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env node
/**
 * Fetches real ABS 2021 Census suburb population data from ArcGIS FeatureServer.
 * Downloads all ~15,000 Australian suburbs with their official names and populations.
 * Outputs data/abs-suburbs.json for use by generate-suburbs-data.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://services1.arcgis.com/vHnIGBHHqDR6y0CR/arcgis/rest/services/2021_ABS_General_Community_Profile/FeatureServer/5/query';
const BATCH_SIZE = 2000;
const OUT_FILE = path.join(__dirname, 'data', 'abs-suburbs.json');

// SAL codes: first digit = state
// 1 = NSW, 2 = VIC, 3 = QLD, 4 = SA, 5 = WA, 6 = TAS, 7 = NT, 8 = ACT, 9 = Other Territories
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
        catch (e) { reject(new Error('JSON parse error: ' + body.slice(0, 200))); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchAll() {
  const allRecords = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      where: 'Tot_P_P > 0',
      outFields: 'SAL_NAME_2021,SAL_CODE_2021,Tot_P_P',
      returnGeometry: 'false',
      orderByFields: 'Tot_P_P DESC',
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

      if (!state || state === 'OT') continue; // skip other territories

      allRecords.push({
        suburb: attrs.SAL_NAME_2021,
        sal_code: code,
        state: state,
        population: attrs.Tot_P_P
      });
    }

    console.log(`  Got ${data.features.length} records (total so far: ${allRecords.length})`);

    if (!data.exceededTransferLimit && data.features.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  // Sort by state then population desc
  allRecords.sort((a, b) => a.state.localeCompare(b.state) || b.population - a.population);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(allRecords, null, 2));

  // Stats
  const states = {};
  for (const r of allRecords) {
    if (!states[r.state]) states[r.state] = 0;
    states[r.state]++;
  }
  console.log(`\nSaved ${allRecords.length} suburbs to ${OUT_FILE}`);
  for (const [s, c] of Object.entries(states).sort()) {
    console.log(`  ${s}: ${c} suburbs`);
  }
}

fetchAll().catch(err => { console.error(err); process.exit(1); });

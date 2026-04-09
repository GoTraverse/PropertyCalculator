#!/usr/bin/env node
/**
 * Generates data/suburbs.json from real ABS 2021 Census data (data/abs-suburbs.json).
 *
 * Real data:   suburb name, state, population (from ABS Census via ArcGIS FeatureServer)
 * Placeholder: all other fields (income, distance, scores, etc.) — to be replaced with live data later
 *
 * Usage: node generate-suburbs-data.js
 * Prereq: Run fetch-abs-data.js first (or use curl batches) to create data/abs-suburbs.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ABS_FILE = path.join(ROOT, 'data', 'abs-suburbs.json');
const PC_FILE = path.join(ROOT, 'data', 'au_postcodes.csv');
const OUT_FILE = path.join(ROOT, 'data', 'suburbs.json');

const absData = JSON.parse(fs.readFileSync(ABS_FILE, 'utf8'));

// Build postcode lookup from CSV: (SUBURB_UPPER, STATE) -> postcode
// CSV has quoted fields, so use a simple state-machine parser
const pcMap = {};
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}
const pcLines = fs.readFileSync(PC_FILE, 'utf8').split('\n');
const pcHeader = parseCSVLine(pcLines[0]);
const pcIdx = pcHeader.indexOf('postcode');
const locIdx = pcHeader.indexOf('locality');
const stIdx = pcHeader.indexOf('state');
for (let i = 1; i < pcLines.length; i++) {
  if (!pcLines[i].trim()) continue;
  const cols = parseCSVLine(pcLines[i]);
  const postcode = (cols[pcIdx] || '').trim();
  const locality = (cols[locIdx] || '').trim().toUpperCase();
  const state = (cols[stIdx] || '').trim().toUpperCase();
  if (!postcode || !locality) continue;
  const key = `${locality}|${state}`;
  if (!pcMap[key]) pcMap[key] = postcode;
}
console.log(`Loaded ${Object.keys(pcMap).length} postcode mappings`);

const stateNames = {
  QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory'
};

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

// Deterministic pseudo-random from string seed (for consistent placeholder values)
function seedHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pseudoRand(seed, min, max) {
  return min + (seed % (max - min + 1));
}

// Tiered postcode-based classification — mirrors apply-abs-data.js logic.
// Note: generate-suburbs-data.js is only used when regenerating from raw ABS data.
// For production updates, run fetch-abs-enhanced.js + apply-abs-data.js instead.
const INNER_RANGES = {
  QLD: [[4000, 4012]], NSW: [[2000, 2019]], VIC: [[3000, 3013]],
  WA:  [[6000, 6008]], SA:  [[5000, 5007]], TAS: [[7000, 7008]],
  ACT: [[2600, 2607]], NT:  [[800, 812]],
};
const MIDDLE_RANGES = {
  QLD: [[4013, 4122]], NSW: [[2020, 2150]], VIC: [[3014, 3152]],
  WA:  [[6009, 6112]], SA:  [[5008, 5097]], TAS: [[7009, 7054]],
  ACT: [[2608, 2618], [2900, 2914]], NT: [[813, 836]],
};
const METRO_RANGES = {
  QLD: [[4000, 4179], [4300, 4310]], NSW: [[2000, 2250]], VIC: [[3000, 3211]],
  WA:  [[6000, 6214]], SA: [[5000, 5130]], TAS: [[7000, 7054]],
  ACT: [[2600, 2618], [2900, 2920]], NT: [[800, 840]],
};
const COASTAL_RANGES = {
  QLD: [[4210, 4230], [4551, 4581], [4700, 4720], [4740, 4755], [4810, 4825], [4870, 4880]],
  NSW: [[2250, 2266], [2430, 2448], [2450, 2470], [2478, 2492], [2499, 2534], [2536, 2551]],
  VIC: [[3212, 3232], [3930, 3946]], WA: [[6215, 6215], [6280, 6298], [6330, 6338]],
  SA:  [[5160, 5176], [5600, 5641]], TAS: [[7150, 7155], [7180, 7190]],
  ACT: [], NT: [],
};

function inRangesG(pc, ranges) {
  if (!pc) return false;
  const n = parseInt(pc, 10);
  return !isNaN(n) && ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

function classifyType(pop, rank, total, state, postcode) {
  if (!postcode) return 'regional';
  if (inRangesG(postcode, INNER_RANGES[state]  || [])) return 'inner-city';
  if (inRangesG(postcode, MIDDLE_RANGES[state] || [])) return 'middle-ring';
  if (inRangesG(postcode, METRO_RANGES[state]  || [])) return 'outer-metro';
  if (inRangesG(postcode, COASTAL_RANGES[state]|| [])) return 'coastal';
  return 'regional';
}

// Generate placeholder values. Real data (income, distance, rent, mortgage)
// is applied post-hoc by apply-abs-data.js after an enhanced ABS fetch.
function makePlaceholders(name, state, pop, rank, total, salCode, postcode) {
  const h = seedHash(name + state);
  const type = classifyType(pop, rank, total, state, postcode);

  const isInner = type === 'inner-city';
  const isMiddle = type === 'middle-ring';
  const isOuter = type === 'outer-metro';
  const isRegional = type === 'regional';

  // Distance to CBD — placeholder removed. Only real Haversine distances
  // (from apply-abs-data.js using ABS centroid coordinates) are used.
  // Pages show "N/A" when distance is null.
  const distance_to_cbd = null;

  // population_growth removed — no reliable suburb-level source available.
  // See: https://abs.gov.au/census for population trend data.
  const population_growth = null;

  // Median household income (placeholder)
  const incBase = isInner ? 80000 : isMiddle ? 72000 : isOuter ? 65000 : 55000;
  const median_household_income = incBase + pseudoRand(h >> 5, 0, 35) * 1000;

  // School count (based on real population)
  const school_count = Math.max(1, Math.min(50, Math.round(pop / 4000)));

  // Park count
  const park_count = Math.max(1, Math.min(40, Math.round(pop / 2500)));

  // Transport score
  const tBase = isInner ? 8 : isMiddle ? 6 : isOuter ? 4 : 2;
  const transport_score = Math.min(10, tBase + pseudoRand(h >> 7, 0, 2));

  // Amenity score
  const aBase = isInner ? 8 : isMiddle ? 6 : isOuter ? 5 : 3;
  const amenity_score = Math.min(10, aBase + pseudoRand(h >> 9, 0, 2));

  return {
    population_growth,
    median_household_income,
    distance_to_cbd,
    suburb_type: type,
    school_count,
    park_count,
    transport_score,
    amenity_score
  };
}

// Clean suburb name — remove state suffix like "(ACT)", "(Qld)", "(Tas.)" etc.
function cleanName(name) {
  return name.replace(/\s*\([^)]+\)\s*$/, '').trim();
}

// Build the full suburbs.json
const stateSuburbs = {};
for (const r of absData) {
  if (!stateSuburbs[r.state]) stateSuburbs[r.state] = [];
  stateSuburbs[r.state].push(r);
}

const allSuburbs = [];
for (const [state, subs] of Object.entries(stateSuburbs)) {
  // Already sorted by population desc from the fetch
  const total = subs.length;
  for (let i = 0; i < total; i++) {
    const r = subs[i];
    const name = cleanName(r.suburb);
    const s = slug(name);

    // Skip suburbs with very short/empty names or duplicate slugs
    if (!s || s.length < 2) continue;

    // Lookup postcode first — needed for metro/regional classification
    const pcKey = `${name.toUpperCase()}|${state}`;
    const postcode = pcMap[pcKey] || '';

    const placeholders = makePlaceholders(name, state, r.population, i, total, r.sal_code, postcode);

    allSuburbs.push({
      suburb: name,
      slug: s,
      state: state,
      state_name: stateNames[state],
      postcode: postcode,              // REAL DATA — from au_postcodes.csv
      population: r.population,        // REAL ABS DATA
      ...placeholders                  // PLACEHOLDER — to be replaced with live data
    });
  }
}

// Check for duplicate slugs within same state
const seen = new Set();
const deduped = [];
for (const s of allSuburbs) {
  const key = `${s.state}/${s.slug}`;
  if (seen.has(key)) {
    // Append sal_code-based suffix for duplicates
    continue; // skip duplicates for now
  }
  seen.add(key);
  deduped.push(s);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(deduped, null, 2));

// Stats
const stats = {};
for (const s of deduped) {
  stats[s.state] = (stats[s.state] || 0) + 1;
}

const withPC = deduped.filter(s => s.postcode).length;
console.log(`Generated ${deduped.length} suburbs from real ABS data (${withPC} with postcodes, ${Math.round(100*withPC/deduped.length)}%)`);
for (const [s, c] of Object.entries(stats).sort()) {
  console.log(`  ${s}: ${c} suburbs`);
}

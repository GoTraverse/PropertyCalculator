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

const ABS_FILE = path.join(__dirname, 'data', 'abs-suburbs.json');
const OUT_FILE = path.join(__dirname, 'data', 'suburbs.json');

const absData = JSON.parse(fs.readFileSync(ABS_FILE, 'utf8'));

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

// Classify suburb type based on population and position in state ranking
function classifyType(pop, rank, total, salCode) {
  // Very rough heuristic — placeholder until real geo data is available
  const pct = rank / total; // 0 = biggest, 1 = smallest
  if (pop > 30000) return pct < 0.05 ? 'inner-city' : 'outer-metro';
  if (pop > 10000) return pct < 0.15 ? 'middle-ring' : 'outer-metro';
  if (pop > 3000) return pct < 0.4 ? 'middle-ring' : 'regional';
  return 'regional';
}

// Generate placeholder values for fields we don't have real data for yet
function makePlaceholders(name, state, pop, rank, total, salCode) {
  const h = seedHash(name + state);
  const type = classifyType(pop, rank, total, salCode);

  const isInner = type === 'inner-city';
  const isMiddle = type === 'middle-ring';
  const isOuter = type === 'outer-metro';
  const isRegional = type === 'regional';

  // Distance to CBD (placeholder)
  const distBase = isInner ? 3 : isMiddle ? 12 : isOuter ? 28 : 80;
  const distRange = isInner ? 8 : isMiddle ? 15 : isOuter ? 30 : 400;
  const distance_to_cbd = distBase + pseudoRand(h, 0, distRange);

  // Population growth (placeholder)
  const growthBase = isInner ? 3 : isOuter ? 8 : isMiddle ? 4 : 1;
  const population_growth = growthBase + pseudoRand(h >> 3, 0, 15);

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

    const placeholders = makePlaceholders(name, state, r.population, i, total, r.sal_code);

    allSuburbs.push({
      suburb: name,
      slug: s,
      state: state,
      state_name: stateNames[state],
      population: r.population,       // REAL ABS DATA
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

console.log(`Generated ${deduped.length} suburbs from real ABS data`);
for (const [s, c] of Object.entries(stats).sort()) {
  console.log(`  ${s}: ${c} suburbs`);
}

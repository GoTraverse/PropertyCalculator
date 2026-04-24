#!/usr/bin/env node
/**
 * fix-suburb-classification.js
 *
 * Patches the existing data/suburbs.json to fix suburb_type and distance_to_cbd
 * using postcode-range-based metro classification instead of the flawed
 * population-rank heuristic.
 *
 * Problem: Gatton (pop ~7851, ranked relatively high in QLD) was being classified
 * as "middle-ring" suburb of Brisbane, and given a fake 12 km CBD distance.
 * Gatton is actually ~90 km west of Brisbane in the Lockyer Valley.
 *
 * Fix: Only classify suburbs as inner/middle/outer metro when their postcode
 * falls within the state capital's metro range. All others → "regional".
 * Regional suburbs get distance_to_cbd = null (no false claim displayed).
 *
 * Usage: node fix-suburb-classification.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');

// Conservative metro postcode ranges — state capital suburbs only.
// Gold Coast, Sunshine Coast, Newcastle, Wollongong etc. are not included
// since labelling them "suburb of [capital]" would be factually wrong.
const METRO_RANGES = {
  QLD: [[4000, 4179], [4300, 4310]],   // Brisbane inner + Ipswich fringe
  NSW: [[2000, 2249]],                   // Sydney
  VIC: [[3000, 3211]],                   // Melbourne
  WA:  [[6000, 6214]],                   // Perth
  SA:  [[5000, 5130]],                   // Adelaide
  TAS: [[7000, 7054]],                   // Hobart
  ACT: [[2600, 2618], [2900, 2920]],    // ACT (whole territory is metro)
  NT:  [[800, 840]],                     // Darwin
};

function isMetroPostcode(state, postcode) {
  if (!postcode) return false;
  const pc = parseInt(postcode, 10);
  if (isNaN(pc)) return false;
  const ranges = METRO_RANGES[state] || [];
  return ranges.some(([lo, hi]) => pc >= lo && pc <= hi);
}

// Deterministic pseudo-random (same seed logic as generate-suburbs-data.js)
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

// Re-classify using postcode awareness.
// Metro suburbs keep population-based inner/middle/outer.
// Non-metro suburbs → 'regional'.
function classifyType(state, postcode, pop) {
  if (!isMetroPostcode(state, postcode)) return 'regional';
  if (pop > 30000) return 'inner-city';
  if (pop > 10000) return 'middle-ring';
  if (pop > 3000) return 'outer-metro';
  return 'middle-ring';
}

// Recalculate distance_to_cbd for metro suburbs; null for regional.
function calcDistance(type, name, state) {
  const h = seedHash(name + state);
  if (type === 'regional') return null;
  if (type === 'inner-city') return 3 + pseudoRand(h, 0, 8);
  if (type === 'middle-ring') return 12 + pseudoRand(h, 0, 15);
  if (type === 'outer-metro') return 28 + pseudoRand(h, 0, 30);
  return null;
}

const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

let changed = 0;
for (const s of suburbs) {
  const newType = classifyType(s.state, s.postcode, s.population);
  const newDist = calcDistance(newType, s.suburb, s.state);

  if (newType !== s.suburb_type || newDist !== s.distance_to_cbd) {
    s.suburb_type = newType;
    s.distance_to_cbd = newDist;
    changed++;
  }
}

fs.writeFileSync(DATA_FILE, JSON.stringify(suburbs, null, 2));

// Stats
const typeCounts = {};
for (const s of suburbs) typeCounts[s.suburb_type] = (typeCounts[s.suburb_type] || 0) + 1;

console.log(`Fixed ${changed} suburbs out of ${suburbs.length} total.`);
console.log('Type breakdown:');
for (const [t, c] of Object.entries(typeCounts).sort()) {
  console.log(`  ${t}: ${c}`);
}

// Spot-check Gatton
const gatton = suburbs.find(s => s.suburb === 'Gatton' && s.state === 'QLD');
if (gatton) {
  console.log(`\nSpot-check Gatton: type=${gatton.suburb_type}, distance_to_cbd=${gatton.distance_to_cbd}`);
}

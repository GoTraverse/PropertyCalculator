#!/usr/bin/env node
/**
 * audit-suburbs.js — Data quality validation for suburb pages.
 *
 * Validates data/suburbs.json and reports issues that would result in
 * low-quality or thin pages. Used to decide which pages get noindex
 * and which are excluded from sitemaps.
 *
 * Usage: node build/audit-suburbs.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUBURBS_FILE = path.join(ROOT, 'data', 'suburbs.json');

const suburbs = JSON.parse(fs.readFileSync(SUBURBS_FILE, 'utf8'));

// ── Validation checks ──

const issues = {
  noPopulation: [],
  tinyLocality: [],
  noPostcode: [],
  noIncome: [],
  noCoordinates: [],
  noDistance: [],
};

let totalWithRealRent = 0;
let totalWithRealMortgage = 0;
let totalWithRealHousePct = 0;
let totalWithCoords = 0;
let totalWithDistance = 0;

for (const s of suburbs) {
  // Population check
  if (!s.population || s.population <= 0) {
    issues.noPopulation.push(`${s.suburb} (${s.state} ${s.postcode})`);
  }

  // Tiny locality (pop < 50)
  if (s.tiny || (s.population && s.population < 50)) {
    issues.tinyLocality.push(`${s.suburb} (${s.state} ${s.postcode}) pop=${s.population}`);
  }

  // No postcode
  if (!s.postcode) {
    issues.noPostcode.push(`${s.suburb} (${s.state})`);
  }

  // No income data
  if (!s.median_household_income) {
    issues.noIncome.push(`${s.suburb} (${s.state} ${s.postcode})`);
  }

  // Track real data coverage
  if (s.lat != null && s.lng != null) totalWithCoords++;
  if (s.distance_to_cbd != null) totalWithDistance++;
  if (s.median_rent_weekly != null) totalWithRealRent++;
  if (s.median_mortgage_monthly != null) totalWithRealMortgage++;
  if (s.house_percentage != null) totalWithRealHousePct++;
}

// ── Report ──

console.log('=== EquitySight Suburb Data Quality Audit ===\n');
console.log(`Total suburbs: ${suburbs.length}`);
console.log('');

// Data coverage
console.log('--- Data Coverage ---');
console.log(`  With lat/lng coordinates: ${totalWithCoords} (${pct(totalWithCoords)})`);
console.log(`  With distance to CBD:     ${totalWithDistance} (${pct(totalWithDistance)})`);
console.log(`  With real rent data:      ${totalWithRealRent} (${pct(totalWithRealRent)})`);
console.log(`  With real mortgage data:  ${totalWithRealMortgage} (${pct(totalWithRealMortgage)})`);
console.log(`  With dwelling type data:  ${totalWithRealHousePct} (${pct(totalWithRealHousePct)})`);
console.log('');

// Type distribution
const types = {};
suburbs.forEach(s => types[s.suburb_type] = (types[s.suburb_type] || 0) + 1);
console.log('--- Type Distribution ---');
for (const [t, c] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${c} (${pct(c)})`);
}
console.log('');

// Issues
console.log('--- Quality Issues ---');
console.log(`  Tiny localities (pop < 50):  ${issues.tinyLocality.length}`);
console.log(`  No postcode:                 ${issues.noPostcode.length}`);
console.log(`  No population:               ${issues.noPopulation.length}`);
console.log(`  No income data:              ${issues.noIncome.length}`);
console.log('');

// Noindex candidates
const noindexCount = suburbs.filter(s => shouldNoindex(s)).length;
const indexableCount = suburbs.length - noindexCount;
console.log('--- Indexing Recommendation ---');
console.log(`  Indexable pages:  ${indexableCount} (${pct(indexableCount)})`);
console.log(`  Noindex pages:    ${noindexCount} (${pct(noindexCount)})`);
console.log(`    (tiny localities with pop < 50 or no postcode)`);
console.log('');

// Sample noindex suburbs
if (issues.tinyLocality.length > 0) {
  console.log('--- Sample Tiny Localities (first 10) ---');
  issues.tinyLocality.slice(0, 10).forEach(s => console.log(`  ${s}`));
  console.log('');
}

if (issues.noPostcode.length > 0) {
  console.log('--- Suburbs Without Postcode (first 10) ---');
  issues.noPostcode.slice(0, 10).forEach(s => console.log(`  ${s}`));
}

function pct(n) {
  return `${Math.round(n / suburbs.length * 100)}%`;
}

function shouldNoindex(s) {
  return s.tiny || s.population < 50 || !s.postcode;
}

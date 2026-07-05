#!/usr/bin/env node
/**
 * merge-market-current.js
 *
 * Folds CURRENT market data (median rent / sale price from FREE, CC BY 4.0
 * state-government open data) into data/suburbs.json.
 *
 * The source figures live in data/market-current.json — pre-extracted and
 * VERIFIED by hand from the government spreadsheets (QLD RTA, SA CBS +
 * Valuer-General, Valuer-General Victoria), NOT fetched at deploy time. This
 * keeps the build dependency-free (no XLSX parser) and means every number was
 * eyeballed before it shipped. Regenerate market-current.json quarterly.
 *
 * The 2021 Census fields (median_rent_weekly etc.) are LEFT INTACT as a dated
 * baseline — build-suburbs.js prefers current_* when present and falls back to
 * the Census figure (clearly labelled "2021 Census") otherwise.
 *
 * Coverage (Phase 1): QLD rent · SA rent + sale · VIC house + unit sale.
 * Run after apply-abs-data.js, before build-suburbs.js. Rebuild-only.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MC_FILE = path.join(ROOT, 'data', 'market-current.json');
const SUB_FILE = path.join(ROOT, 'data', 'suburbs.json');

// Same normalisation used when the JSON was built: uppercase, strip anything
// that isn't A–Z/0–9/space, collapse whitespace. Matches "St. Kilda" <-> "ST KILDA".
function norm(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

if (!fs.existsSync(MC_FILE)) {
  console.warn('[merge-market] data/market-current.json not found — skipping (current_* stay null).');
  process.exit(0);
}

let mc, subs;
try {
  mc = JSON.parse(fs.readFileSync(MC_FILE, 'utf8'));
  subs = JSON.parse(fs.readFileSync(SUB_FILE, 'utf8'));
} catch (e) {
  console.error('[merge-market] failed to read inputs:', e.message);
  process.exit(0); // non-fatal: don't break the whole build
}

const src = mc.sources || {};
const data = mc.data || {};
// Postcode-keyed data (coarser geography — e.g. NSW DCJ rents are published per
// postcode, not per suburb). Used only as a fallback when no suburb-level figure
// exists; the geo field then reads "postcode" so the page labels it honestly and
// shouldNoindex() does NOT count it as suburb-level data.
const pcData = mc.data_postcode || {};
let nRent = 0, nHouse = 0, nUnit = 0, nYield = 0, nRentPc = 0;

for (const s of subs) {
  // Reset (idempotent — avoids stale values on re-runs)
  s.current_rent = null; s.current_rent_period = null; s.current_rent_source = null;
  s.current_rent_geo = null; s.current_rent_licence = null;
  s.current_price_house = null; s.current_price_unit = null; s.current_price_period = null;
  s.current_price_source = null; s.current_price_geo = null; s.current_price_licence = null;
  s.current_gross_yield = null;

  // Postcode-level rent fallback (before the suburb lookup so a suburb match can
  // overwrite it below — suburb-geo data always wins over postcode-geo).
  const prow = pcData[s.state] && s.postcode && pcData[s.state][String(s.postcode)];
  if (prow && prow.rent) {
    const pm = src[s.state + '_rent'] || {};
    s.current_rent = prow.rent;
    s.current_rent_period = pm.period || null;
    s.current_rent_source = pm.source || null;
    s.current_rent_geo = pm.geo || 'postcode';
    s.current_rent_licence = pm.licence || null;
    nRentPc++;
  }

  const row = data[s.state] && data[s.state][norm(s.suburb)];
  if (!row) continue;

  if (row.rent) {
    const m = src[s.state + '_rent'] || {};
    s.current_rent = row.rent;
    s.current_rent_period = m.period || null;
    s.current_rent_source = m.source || null;
    s.current_rent_geo = m.geo || 'suburb';
    s.current_rent_licence = m.licence || null;
    nRent++;
  }
  if (row.price_house) {
    const m = src[s.state + '_price_house'] || {};
    s.current_price_house = row.price_house;
    s.current_price_period = m.period || null;
    s.current_price_source = m.source || null;
    s.current_price_geo = m.geo || 'suburb';
    s.current_price_licence = m.licence || null;
    nHouse++;
  }
  if (row.price_unit) {
    const m = src[s.state + '_price_unit'] || {};
    s.current_price_unit = row.price_unit;
    // If no house-price metadata was set, carry the unit source metadata.
    if (!s.current_price_period) {
      s.current_price_period = m.period || null;
      s.current_price_source = m.source || null;
      s.current_price_geo = m.geo || 'suburb';
      s.current_price_licence = m.licence || null;
    }
    nUnit++;
  }
  // Indicative gross yield — only when rent AND house price are both real for
  // the same suburb (both suburb-geo). rent is weekly → ×52.
  if (row.rent && row.price_house) {
    s.current_gross_yield = Math.round((row.rent * 52 / row.price_house) * 1000) / 10;
    nYield++;
  }
}

fs.writeFileSync(SUB_FILE, JSON.stringify(subs, null, 2));
console.log(
  `[merge-market] applied current data to ${subs.length} suburbs: ` +
  `rent=${nRent} rent-by-postcode=${nRentPc} house-price=${nHouse} unit-price=${nUnit} yield=${nYield}`
);

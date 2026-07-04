#!/usr/bin/env node
/**
 * apply-abs-data.js
 *
 * Applies real ABS 2021 Census data to suburbs.json and fixes all known
 * classification issues. Run after fetch-abs-enhanced.js.
 *
 * What this script does:
 *
 *  REAL DATA (from ABS 2021 via ArcGIS):
 *   - median_household_income  ← Median_tot_hhd_inc_weekly × 52 (annual)
 *   - distance_to_cbd          ← Haversine from centroid to state capital CBD
 *   - median_rent_weekly       ← new field (real ABS data)
 *   - median_mortgage_monthly  ← new field (real ABS data)
 *   - house_percentage         ← sep_house / total_dwellings × 100 (new field)
 *
 *  LOGIC FIXES:
 *   - Tiered suburb_type classification using postcode ranges:
 *       inner-city  → tight CBD-adjacent range per state
 *       middle-ring → mid-radius metro range
 *       outer-metro → remainder of metro range
 *       coastal     → known coastal postcodes outside metro
 *       regional    → everything else
 *   - Tiny locality filter: pop < 50 flagged via suburb.tiny = true
 *     (pages still generated but marked for potential noindex treatment)
 *   - NSW 1xxx PO Box postcodes resolved to correct street postcodes
 *
 *  REMOVED:
 *   - population_growth (was fake; no clean 2016-suburb-level source found)
 *     → replaced with population_growth: null (pages show ABS Census link)
 *
 * Usage: node apply-abs-data.js
 * Prereq: node fetch-abs-enhanced.js  (creates data/abs-enhanced.json)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENHANCED_FILE  = path.join(ROOT, 'data', 'abs-enhanced.json');
const OVERPASS_FILE  = path.join(ROOT, 'data', 'overpass-amenities.json');
const SUBURBS_FILE   = path.join(ROOT, 'data', 'suburbs.json');

const hasEnhanced = fs.existsSync(ENHANCED_FILE);
if (!hasEnhanced) {
  console.warn(`Warning: ${ENHANCED_FILE} not found — applying logic fixes only (no real ABS data).`);
  console.warn(`Run fetch-abs-enhanced.js first to get real income, distances, rent, and mortgage data.`);
}

const hasOverpass = fs.existsSync(OVERPASS_FILE);
if (!hasOverpass) {
  console.warn(`Warning: ${OVERPASS_FILE} not found — school/park names will be empty.`);
  console.warn(`Run fetch-overpass-amenities.js to get real school and park names.`);
}

const enhanced  = hasEnhanced  ? JSON.parse(fs.readFileSync(ENHANCED_FILE,  'utf8')) : [];
const overpass  = hasOverpass  ? JSON.parse(fs.readFileSync(OVERPASS_FILE,  'utf8')) : {};
const suburbs   = JSON.parse(fs.readFileSync(SUBURBS_FILE, 'utf8'));

// ── CBD coordinates for Haversine distance calculation ──

const CBD = {
  QLD: { lat: -27.4698, lng: 153.0251 },  // Brisbane
  NSW: { lat: -33.8688, lng: 151.2093 },  // Sydney
  VIC: { lat: -37.8136, lng: 144.9631 },  // Melbourne
  WA:  { lat: -31.9505, lng: 115.8605 },  // Perth
  SA:  { lat: -34.9285, lng: 138.6007 },  // Adelaide
  TAS: { lat: -42.8821, lng: 147.3272 },  // Hobart
  ACT: { lat: -35.2820, lng: 149.1286 },  // Canberra
  NT:  { lat: -12.4634, lng: 130.8456 },  // Darwin
};

// Derive Google Maps zoom level from suburb bounding box spans (in degrees).
// Formula: at zoom z, a 640px-wide viewport shows (640 * 360 / 256 / 2^z) degrees of longitude.
// We want the suburb's largest span to fit comfortably in the viewport.
// Uses max(latSpan, lngSpan) as the constraining dimension, clamped to 8–14.
function bboxToZoom(latSpan, lngSpan) {
  if (!latSpan || !lngSpan) return null;
  const maxSpan = Math.max(latSpan, lngSpan);
  // viewport_px=640, tile_px=256, world_degrees=360, padding factor=3.3 (generous zoom-out)
  const zoom = Math.log2(640 * 360 / (256 * maxSpan)) - 3.3;
  return Math.max(8, Math.min(14, Math.floor(zoom)));
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Postcode classification ranges ──
// Priority order: inner-city > middle-ring > outer-metro > coastal > regional

// Inner-city: tight CBD-adjacent zone
const INNER_RANGES = {
  QLD: [[4000, 4012]],                    // Brisbane CBD, Spring Hill, Fortitude Valley, New Farm, Kangaroo Point
  NSW: [[2000, 2019]],                    // Sydney CBD, Pyrmont, Surry Hills, Redfern, Newtown
  VIC: [[3000, 3013]],                    // Melbourne CBD, Carlton, Fitzroy, Collingwood, Richmond, Prahran
  WA:  [[6000, 6008]],                    // Perth CBD, Subiaco, Shenton Park, Mt Claremont
  SA:  [[5000, 5007]],                    // Adelaide CBD, North Adelaide, Norwood fringe
  TAS: [[7000, 7008]],                    // Hobart CBD, Battery Point, Sandy Bay, South Hobart
  ACT: [[2600, 2607]],                    // Canberra City, Braddon, Turner, O'Connor
  NT:  [[800, 812]],                      // Darwin CBD, Larrakeyah, Stuart Park, Parap
};

// Middle-ring: established suburbs within easy commuting distance of CBD
const MIDDLE_RANGES = {
  QLD: [[4013, 4122]],                    // Paddington through to Morningside / Mt Gravatt area
  NSW: [[2020, 2150]],                    // Mascot through to Parramatta (Strathfield, Burwood etc.)
  VIC: [[3014, 3152]],                    // Footscray through to Camberwell / Box Hill corridor
  WA:  [[6009, 6112]],                    // Cottesloe through to Midland / Kelmscott
  SA:  [[5008, 5097]],                    // Adelaide middle ring (Prospect, Glenelg fringe)
  TAS: [[7009, 7054]],                    // Hobart middle ring (Glenorchy, Moonah, Bellerive)
  ACT: [[2608, 2618], [2900, 2914]],      // Belconnen, Tuggeranong areas
  NT:  [[813, 836]],                      // Darwin middle (Coconut Grove, Rapid Creek, Nightcliff)
};

// Full metro range: outer-metro is anything in here but not inner or middle
const METRO_RANGES = {
  QLD: [[4000, 4179], [4300, 4310]],
  NSW: [[2000, 2250]],
  VIC: [[3000, 3211]],
  WA:  [[6000, 6214]],
  SA:  [[5000, 5130]],
  TAS: [[7000, 7054]],
  ACT: [[2600, 2618], [2900, 2920]],
  NT:  [[800, 840]],
};

// Coastal: known non-metro coastal areas
const COASTAL_RANGES = {
  QLD: [[4210, 4230], [4551, 4581], [4700, 4720], [4740, 4755], [4810, 4825], [4870, 4880]],
       // Gold Coast, Sunshine Coast, Rockhampton coast, Mackay, Townsville, Cairns
  NSW: [[2250, 2266], [2430, 2448], [2450, 2470], [2478, 2492], [2499, 2534], [2536, 2551]],
       // Central Coast, Taree/Port Macquarie, Coffs Harbour, Byron Bay, Wollongong, Shoalhaven
  VIC: [[3212, 3232], [3930, 3946]],
       // Surf Coast / Geelong coastal, Mornington Peninsula
  WA:  [[6215, 6215], [6280, 6298], [6330, 6338], [6525, 6537]],
       // Mandurah fringe, Busselton/Margaret River, Albany, Geraldton coast
  SA:  [[5160, 5176], [5600, 5641]],
       // Fleurieu Peninsula, Yorke Peninsula
  TAS: [[7150, 7155], [7180, 7190]],
       // Bruny Island, east coast
  ACT: [],
  NT:  [],
};

// NSW: some postcodes starting with 1xxx are PO Box ranges; map to real street postcode equivalents.
// This handles cases like Parramatta 1740 (PO Box) → 2150 (street).
const NSW_POBOX_MAP = {
  1010: 2010, 1020: 2000, 1023: 2023, 1025: 2025, 1026: 2026, 1027: 2027,
  1028: 2028, 1029: 2029, 1030: 2030, 1031: 2031, 1032: 2032, 1033: 2033,
  1034: 2034, 1035: 2035, 1036: 2036, 1037: 2037, 1038: 2038, 1040: 2040,
  1041: 2041, 1042: 2042, 1043: 2043, 1044: 2044, 1045: 2045, 1046: 2046,
  1047: 2047, 1048: 2048, 1049: 2049, 1050: 2050,
  1110: 2110, 1120: 2120, 1130: 2130, 1135: 2135, 1140: 2140, 1145: 2145,
  1150: 2150, 1153: 2153, 1160: 2160, 1163: 2163, 1165: 2165, 1168: 2168,
  1170: 2170, 1180: 2170, 1232: 2232, 1235: 2235, 1240: 2240, 1481: 2481,
  1560: 2560, 1585: 1585,
  // Parramatta range
  1740: 2150, 1741: 2150, 1750: 2150,
};

function resolvePostcode(state, postcode) {
  if (!postcode) return postcode;
  if (state !== 'NSW') return postcode;
  const pc = parseInt(postcode, 10);
  if (pc >= 1000 && pc < 2000) {
    return String(NSW_POBOX_MAP[pc] || postcode);
  }
  return postcode;
}

function inRanges(pc, ranges) {
  if (!pc) return false;
  const n = parseInt(pc, 10);
  if (isNaN(n)) return false;
  return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

function classifyType(state, rawPostcode) {
  const pc = resolvePostcode(state, rawPostcode);
  if (!pc) return 'regional';

  const inner   = INNER_RANGES[state]   || [];
  const middle  = MIDDLE_RANGES[state]  || [];
  const metro   = METRO_RANGES[state]   || [];
  const coastal = COASTAL_RANGES[state] || [];

  if (inRanges(pc, inner))   return 'inner-city';
  if (inRanges(pc, middle))  return 'middle-ring';
  if (inRanges(pc, metro))   return 'outer-metro';
  if (inRanges(pc, coastal)) return 'coastal';
  return 'regional';
}

// ── Build lookup: cleaned name + state → enhanced record ──

function cleanName(name) {
  return name.replace(/\s*\([^)]+\)\s*$/, '').trim().toUpperCase();
}

const enhancedMap = new Map();
for (const r of enhanced) {
  const key = `${cleanName(r.suburb)}|${r.state}`;
  if (!enhancedMap.has(key)) enhancedMap.set(key, r);
}

// ── Apply data to suburbs ──

let matched = 0, unmatched = 0, tiny = 0;
const typeCount = {};

for (const s of suburbs) {
  const key = `${cleanName(s.suburb)}|${s.state}`;
  const abs = enhancedMap.get(key);

  // Clear any placeholder distance — only real Haversine distances are kept
  s.distance_to_cbd = null;

  // Real ABS data
  if (abs) {
    matched++;

    // Income: weekly × 52, or keep placeholder if null
    if (abs.median_weekly_income) {
      s.median_household_income = abs.median_weekly_income * 52;
    }

    // Centroid coordinates — stored for geographic nearby-suburb matching
    if (abs.centroid_lat && abs.centroid_lng) {
      s.lat = Math.round(abs.centroid_lat * 1e6) / 1e6;   // 6 dp ≈ 0.1 m precision
      s.lng = Math.round(abs.centroid_lng * 1e6) / 1e6;
    } else {
      s.lat = null;
      s.lng = null;
    }

    // Distance to CBD: Haversine from centroid, rounded to nearest km
    if (abs.centroid_lat && abs.centroid_lng && CBD[s.state]) {
      const cbd = CBD[s.state];
      s.distance_to_cbd = haversineKm(abs.centroid_lat, abs.centroid_lng, cbd.lat, cbd.lng);
    }

    // Map zoom from bounding box — accurate zoom level for each suburb's geographic size
    s.map_zoom = bboxToZoom(abs.bbox_lat_span, abs.bbox_lng_span);

    // New fields
    s.median_rent_weekly     = abs.median_rent_weekly     || null;
    s.median_mortgage_monthly = abs.median_mortgage_monthly || null;

    if (abs.total_dwellings && abs.sep_house_count != null) {
      s.house_percentage = Math.round(abs.sep_house_count / abs.total_dwellings * 100);
    } else {
      s.house_percentage = null;
    }
  } else {
    unmatched++;
    s.lat                    = null;
    s.lng                    = null;
    s.map_zoom               = null;
    s.median_rent_weekly     = null;
    s.median_mortgage_monthly = null;
    s.house_percentage       = null;
  }

  // Overpass amenity names (school/park) — keyed by sal_code
  const amenities = overpass[s.sal_code] || {};
  s.school_names = amenities.schools || [];
  s.park_names   = amenities.parks   || [];

  // Remove fake population_growth
  s.population_growth = null;

  // Persist the resolved street postcode (e.g. NSW PO-box 1740 -> 2150) so the
  // DISPLAYED postcode is correct. resolvePostcode() was previously only used
  // internally for classification, leaving s.postcode showing the PO-box code
  // on the page (e.g. Parramatta rendered as "NSW 1740" instead of "2150").
  s.postcode = resolvePostcode(s.state, s.postcode);

  // Re-classify suburb type with tiered postcode ranges
  s.suburb_type = classifyType(s.state, s.postcode);

  // Flag tiny localities (pop < 50)
  s.tiny = (s.population < 50);
  if (s.tiny) tiny++;

  typeCount[s.suburb_type] = (typeCount[s.suburb_type] || 0) + 1;
}

fs.writeFileSync(SUBURBS_FILE, JSON.stringify(suburbs, null, 2));

console.log(`Applied ABS data to ${suburbs.length} suburbs:`);
console.log(`  Matched to ABS enhanced data: ${matched}`);
console.log(`  Unmatched (kept existing data): ${unmatched}`);
console.log(`  Tiny localities (pop < 50): ${tiny}`);
console.log('\nType breakdown:');
for (const [t, c] of Object.entries(typeCount).sort()) {
  console.log(`  ${t}: ${c}`);
}

// Spot-checks
const checks = ['Gatton', 'Bondi Beach', 'Blacktown', 'Noosa Heads', 'Parramatta', 'Byron Bay', 'Surfers Paradise'];
console.log('\nSpot-checks:');
for (const name of checks) {
  const s = suburbs.find(x => x.suburb === name);
  if (s) {
    console.log(`  ${s.suburb} (${s.state} ${s.postcode}): type=${s.suburb_type}, dist=${s.distance_to_cbd}km, income=$${s.median_household_income?.toLocaleString()}, rent=$${s.median_rent_weekly}/wk, tiny=${s.tiny}`);
  }
}

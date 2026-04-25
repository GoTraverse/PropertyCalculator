#!/usr/bin/env node
/**
 * build/simplify-state-outlines.js — one-shot build helper.
 *
 * Input : /tmp/states.geojson (rowanhogan/australian-states, public domain).
 * Output: /home/user/PropertyCalculator/data/state-outlines.js
 *
 * For each state / territory:
 *   1. Pick the largest polygon from the MultiPolygon (mainland). Islands
 *      are dropped — they matter for Tasmania (keep the largest ring, which
 *      is the main island; small islets cut). Keeps the silhouette legible.
 *   2. Run Douglas-Peucker simplification with a per-state epsilon so each
 *      ends up at ~60-120 points. Very crude and very dense states both
 *      look clean at the card size (~360×? px).
 *   3. Convert to our `[lat, lng]` outline format (GeoJSON is [lng, lat]).
 *   4. Compute tight bbox from simplified polygon.
 *   5. Preserve the hand-picked capital + name from the previous file.
 *
 * Run: node build/simplify-state-outlines.js
 *
 * Not part of the normal build — run manually any time we want to
 * regenerate state-outlines.js (e.g. after swapping to a different
 * source dataset or tightening/loosening detail).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = '/tmp/states.geojson';
const OUT = path.join(__dirname, '..', 'data', 'state-outlines.js');

// STATE_NAME (from GeoJSON) → our 2–3-letter code used as object key.
const NAME_TO_CODE = {
  'New South Wales': 'NSW',
  'Victoria': 'VIC',
  'Queensland': 'QLD',
  'South Australia': 'SA',
  'Western Australia': 'WA',
  'Tasmania': 'TAS',
  'Northern Territory': 'NT',
  'Australian Capital Territory': 'ACT',
};

// Per-state capital + name — carried forward from the previous (hand-authored)
// version of data/state-outlines.js so downstream code that reads these keys
// keeps working. Coordinates are [lat, lng].
const CAPITALS = {
  NSW: { latLng: [-33.8688, 151.2093], name: 'Sydney' },
  VIC: { latLng: [-37.8136, 144.9631], name: 'Melbourne' },
  QLD: { latLng: [-27.4698, 153.0251], name: 'Brisbane' },
  SA:  { latLng: [-34.9285, 138.6007], name: 'Adelaide' },
  WA:  { latLng: [-31.9505, 115.8605], name: 'Perth' },
  TAS: { latLng: [-42.8821, 147.3272], name: 'Hobart' },
  ACT: { latLng: [-35.2820, 149.1286], name: 'Canberra' },
  NT:  { latLng: [-12.4634, 130.8456], name: 'Darwin' },
};

// Target max point count after simplification. States that are geographically
// complex (TAS coastline, QLD cape york) get a higher ceiling.
const TARGET_POINTS = {
  NSW: 90, VIC: 80, QLD: 140, SA: 100, WA: 150, TAS: 110, NT: 110, ACT: 30,
};

// ── Douglas-Peucker simplification ──────────────────────────────────────
// Returns a subset of `pts` where every dropped point was within `eps`
// (perpendicular distance) of the line connecting its surviving neighbours.
// Operates on [[x, y], ...] in whatever unit you give it — here we pass
// lat/lng pairs and treat degrees as cartesian (fine for this visualisation;
// we're not doing geodesy-critical work).
function perpDistance(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = Math.abs(dy * px - dx * py + bx * ay - by * ax);
  return t / Math.sqrt(dx * dx + dy * dy);
}

function douglasPeucker(pts, eps) {
  if (pts.length <= 2) return pts.slice();
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > eps) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), eps);
    const right = douglasPeucker(pts.slice(maxIdx), eps);
    return left.slice(0, -1).concat(right);
  } else {
    return [pts[0], pts[pts.length - 1]];
  }
}

// Simplify until we're under `targetPoints`, tightening epsilon iteratively.
function simplifyToTarget(pts, targetPoints) {
  let eps = 0.01;
  let simplified = douglasPeucker(pts, eps);
  while (simplified.length > targetPoints && eps < 5) {
    eps *= 1.3;
    simplified = douglasPeucker(pts, eps);
  }
  return simplified;
}

// ── Main ────────────────────────────────────────────────────────────────

function extractLargestPolygon(geometry) {
  // GeoJSON: Polygon = [ring[]], MultiPolygon = [polygon[]], each polygon
  // is [ring[]], each ring is [[lng, lat], ...]. Outer ring is index 0.
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0];
  }
  if (geometry.type === 'MultiPolygon') {
    // Largest polygon by point count in its outer ring (proxy for size).
    let best = null;
    let bestLen = 0;
    for (const poly of geometry.coordinates) {
      const outerRing = poly[0];
      if (outerRing.length > bestLen) {
        best = outerRing;
        bestLen = outerRing.length;
      }
    }
    return best;
  }
  throw new Error('Unsupported geometry: ' + geometry.type);
}

function computeBbox(points) {
  let latMin = Infinity, latMax = -Infinity;
  let lngMin = Infinity, lngMax = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
    if (lng < lngMin) lngMin = lng;
    if (lng > lngMax) lngMax = lng;
  }
  // Round to 2 dp — 0.01° ≈ 1 km; plenty for our bbox.
  return {
    latMin: Math.round(latMin * 100) / 100,
    latMax: Math.round(latMax * 100) / 100,
    lngMin: Math.round(lngMin * 100) / 100,
    lngMax: Math.round(lngMax * 100) / 100,
  };
}

function main() {
  const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = {};

  for (const f of geo.features) {
    const name = f.properties.STATE_NAME;
    const code = NAME_TO_CODE[name];
    if (!code) { console.warn('Unknown state:', name); continue; }

    // GeoJSON uses [lng, lat]; simplify in that native order then swap at emit.
    const rawLngLat = extractLargestPolygon(f.geometry);
    const targetPoints = TARGET_POINTS[code] || 100;
    const simplified = simplifyToTarget(rawLngLat, targetPoints);

    // Convert to our [lat, lng] format + round to 3 dp (~100 m precision).
    const outline = simplified.map(([lng, lat]) => [
      Math.round(lat * 1000) / 1000,
      Math.round(lng * 1000) / 1000,
    ]);

    const bbox = computeBbox(outline);
    out[code] = { bbox, outline, capital: CAPITALS[code] };
    console.log(
      `${code}: ${rawLngLat.length} → ${outline.length} points`
      + ` (bbox ${bbox.latMin}..${bbox.latMax}, ${bbox.lngMin}..${bbox.lngMax})`
    );
  }

  const header = `/**
 * data/state-outlines.js
 *
 * Simplified outlines for Australian states + territories, used by
 * build/build-suburbs.js to render the suburb-locator card (inline SVG
 * state silhouette + red dot at the suburb's ABS centroid).
 *
 * Source: rowanhogan/australian-states (public domain GeoJSON derived
 * from ABS state boundaries). Original ~10,000 coordinates simplified
 * via Douglas-Peucker to ~60-150 per state by
 * build/simplify-state-outlines.js. Re-run that script to regenerate.
 *
 * Each entry has:
 *   - bbox      : { latMin, latMax, lngMin, lngMax }
 *   - outline   : array of [lat, lng] points tracing the coast + borders,
 *                 in order (single closed polygon — largest mainland
 *                 polygon, with islands dropped for clarity).
 *   - capital   : { latLng: [lat, lng], name } — state capital coords,
 *                 used as a fallback for suburbs lacking centroids and
 *                 drawn as a grey reference dot on the card.
 */
'use strict';

const STATE_OUTLINES = `;

  const body = JSON.stringify(out, null, 2);
  // Reformat arrays on one line for readability in diffs.
  const compact = body
    .replace(/\[\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?)\s+\]/g, '[$1, $2]');

  fs.writeFileSync(OUT, header + compact + ';\n\nmodule.exports = STATE_OUTLINES;\n');
  console.log('Wrote', OUT, '(' + fs.statSync(OUT).size + ' bytes)');
}

main();

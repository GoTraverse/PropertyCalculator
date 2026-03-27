#!/usr/bin/env node
/**
 * build-suburbs.js — Generates static suburb insight pages and state hub pages
 * from data/suburbs.json + templates.
 *
 * Usage: node build-suburbs.js
 * Output: /suburb/{state}/{slug}/index.html and /invest/{state}/index.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');
const SUBURB_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'suburb-page.html'), 'utf8');
const HUB_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'state-hub.html'), 'utf8');

const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// ── Helpers ──

function fmt(n) {
  return Number(n).toLocaleString('en-AU');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

const stateNames = {
  QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory'
};

const stateCapitals = {
  QLD: 'Brisbane', NSW: 'Sydney', VIC: 'Melbourne',
  WA: 'Perth', SA: 'Adelaide', TAS: 'Hobart',
  ACT: 'Canberra', NT: 'Darwin'
};

const stateResources = {
  QLD: [
    ['Queensland Government — Property', 'https://www.qld.gov.au/housing'],
    ['QLD Office of State Revenue', 'https://www.treasury.qld.gov.au/budget-and-financial-management/revenue/'],
    ['REIQ — Real Estate Institute of QLD', 'https://www.reiq.com/'],
  ],
  NSW: [
    ['NSW Revenue — Property Tax', 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty'],
    ['NSW Fair Trading — Property', 'https://www.fairtrading.nsw.gov.au/housing-and-property'],
    ['REINSW — Real Estate Institute of NSW', 'https://www.reinsw.com.au/'],
  ],
  VIC: [
    ['State Revenue Office Victoria', 'https://www.sro.vic.gov.au/'],
    ['Consumer Affairs Victoria — Renting', 'https://www.consumer.vic.gov.au/housing/renting'],
    ['REIV — Real Estate Institute of VIC', 'https://reiv.com.au/'],
  ],
  WA: [
    ['WA Department of Finance — Revenue', 'https://www.wa.gov.au/organisation/department-of-finance'],
    ['REIWA — Real Estate Institute of WA', 'https://reiwa.com.au/'],
    ['Landgate WA — Property Information', 'https://www.landgate.wa.gov.au/'],
  ],
  SA: [
    ['RevenueSA — Stamp Duty', 'https://www.revenuesa.sa.gov.au/'],
    ['SA Government — Housing', 'https://www.sa.gov.au/topics/housing'],
    ['REISA — Real Estate Institute of SA', 'https://www.reisa.com.au/'],
  ],
  TAS: [
    ['State Revenue Office Tasmania', 'https://www.sro.tas.gov.au/'],
    ['REIT — Real Estate Institute of TAS', 'https://www.reit.com.au/'],
    ['Tasmanian Government — Housing', 'https://www.housing.tas.gov.au/'],
  ],
  ACT: [
    ['ACT Revenue Office', 'https://www.revenue.act.gov.au/'],
    ['REIACT — Real Estate Institute of ACT', 'https://www.reiact.com.au/'],
    ['ACT Government — Housing', 'https://www.act.gov.au/homes-housing-and-community'],
  ],
  NT: [
    ['NT Revenue Office', 'https://treasury.nt.gov.au/dtf/territory-revenue-office'],
    ['REINT — Real Estate Institute of NT', 'https://www.reint.com.au/'],
    ['NT Government — Housing', 'https://nt.gov.au/property'],
  ],
};

// ── Content generators ──

function generateOverview(s) {
  const capital = stateCapitals[s.state];
  const typeLabel = {
    'inner-city': `an inner-city suburb of ${capital}`,
    'middle-ring': `a well-established middle-ring suburb of ${capital}`,
    'outer-metro': `an outer-metropolitan suburb of ${capital}`,
    'regional': `a regional centre in ${s.state_name}`,
    'coastal': `a coastal suburb in ${s.state_name}`,
  }[s.suburb_type] || `a suburb in ${s.state_name}`;

  const popDesc = s.population > 100000 ? 'a major population centre'
    : s.population > 50000 ? 'a significant urban area'
    : s.population > 20000 ? 'a sizeable community'
    : s.population > 5000 ? 'a smaller community'
    : 'a boutique locality';

  // Real distance from centroid (ABS 2021); omit sentence if unavailable
  let distSentence = '';
  if (s.distance_to_cbd != null) {
    const distDesc = s.distance_to_cbd <= 5
      ? `Located ${s.distance_to_cbd} km from the ${capital} CBD`
      : `Located approximately ${s.distance_to_cbd} km from the ${capital} CBD`;
    distSentence = ` ${distDesc},`;
  }

  const incomeDesc = s.median_household_income
    ? ` The median household income is $${fmt(s.median_household_income)} AUD per year (ABS 2021 Census).`
    : '';

  return `${s.suburb} is ${typeLabel}, Australia, with a population of approximately ${fmt(s.population)}, making it ${popDesc}.${distSentence} ${s.suburb} is a ${s.suburb_type.replace('-', ' ')} area in ${s.state_name}.${incomeDesc}`;
}

function generateInsight(s) {
  const parts = [];

  // Type-based insight
  if (s.suburb_type === 'inner-city') {
    parts.push(`As an inner-city location, ${s.suburb} benefits from proximity to employment, dining, and cultural precincts. Investment properties here typically attract young professionals and downsizers seeking walkable lifestyles.`);
  } else if (s.suburb_type === 'outer-metro') {
    parts.push(`${s.suburb}'s outer-metropolitan position means more affordable entry points for investors, with potential for capital growth as infrastructure extends outward. Demand is often driven by young families seeking space and value.`);
  } else if (s.suburb_type === 'coastal') {
    parts.push(`Coastal lifestyle is a strong draw for ${s.suburb}, supporting both long-term rental demand and holiday letting potential. Seaside suburbs in ${s.state_name} consistently attract interstate migration and lifestyle buyers.`);
  } else if (s.suburb_type === 'regional') {
    parts.push(`As a regional centre, ${s.suburb} serves a wide catchment area. Regional property can offer higher rental yields than metro equivalents, though investors should assess local employment diversity and infrastructure plans.`);
  } else if (s.suburb_type === 'middle-ring') {
    parts.push(`${s.suburb}'s middle-ring location balances affordability with accessibility. These suburbs often benefit from established infrastructure, good schools, and transport links — making them attractive to families and long-term tenants.`);
  }

  // Rent-based insight (real ABS data)
  if (s.median_rent_weekly) {
    const rentDesc = s.median_rent_weekly >= 600 ? 'a premium rental market'
      : s.median_rent_weekly >= 400 ? 'a mid-range rental market'
      : 'an affordable rental market';
    parts.push(`The median rent of $${fmt(s.median_rent_weekly)}/week (ABS 2021) indicates ${rentDesc}. ${s.median_mortgage_monthly ? `Owner-occupiers face a median mortgage repayment of $${fmt(s.median_mortgage_monthly)}/month.` : ''}`);
  }

  // Income-based (real ABS data)
  if (s.median_household_income >= 100000) {
    parts.push(`A median household income of $${fmt(s.median_household_income)}/year supports premium property values and indicates a well-employed resident base.`);
  } else if (s.median_household_income >= 75000) {
    parts.push(`The median household income of $${fmt(s.median_household_income)}/year reflects a solid demographic, supporting sustainable rental demand.`);
  }

  // Dwelling type insight (real ABS data)
  if (s.house_percentage != null) {
    if (s.house_percentage >= 75) {
      parts.push(`${s.house_percentage}% of dwellings are separate houses, indicating a predominantly family-oriented, land-rich market.`);
    } else if (s.house_percentage <= 40) {
      parts.push(`With only ${s.house_percentage}% separate houses, ${s.suburb} has a significant apartment and unit market — typical of inner-city investment corridors.`);
    }
  }

  if (!parts.length) {
    parts.push(`${s.suburb} is a ${s.suburb_type.replace('-', ' ')} area in ${s.state_name}. As with any property investment, conduct thorough due diligence on specific properties and current market conditions before committing.`);
  }

  return parts.join(' ');
}

function generateFAQ(s) {
  const capital = stateCapitals[s.state];
  const faqs = [
    {
      q: `Is ${s.suburb} a good suburb for investment?`,
      a: `${s.suburb} is a ${s.suburb_type.replace('-', ' ')} area in ${s.state_name} with a population of ${fmt(s.population)}. ${s.median_rent_weekly ? `The median rent is $${fmt(s.median_rent_weekly)}/week and ` : ''}the median household income is $${fmt(s.median_household_income)}/year (ABS 2021 Census). As with any property investment, conduct thorough due diligence on current listings, vacancy rates, and local infrastructure plans before committing.`
    },
    {
      q: `What drives property demand in ${s.suburb}?`,
      a: `Key demand drivers in ${s.suburb} include ${s.suburb_type === 'coastal' ? 'lifestyle appeal and proximity to the coast' : s.suburb_type === 'inner-city' ? 'employment proximity and urban lifestyle' : s.suburb_type === 'outer-metro' ? 'affordability relative to inner suburbs and expanding infrastructure' : s.suburb_type === 'regional' ? 'regional employment hubs, lifestyle, and affordability' : 'established amenities and transport access'}. ${s.house_percentage != null ? `${s.house_percentage}% of dwellings are separate houses. ` : ''}The area has approximately ${s.school_count} schools and ${s.park_count} parks nearby.`
    },
    {
      q: `What is the population of ${s.suburb}?`,
      a: `According to the ABS 2021 Census, ${s.suburb} has a population of approximately ${fmt(s.population)}. For historical population trends and intercensal estimates, visit the ABS Census Data Explorer at abs.gov.au.`
    },
    {
      q: `How far is ${s.suburb} from the ${capital} CBD?`,
      a: s.distance_to_cbd != null
        ? `${s.suburb} is approximately ${s.distance_to_cbd} km straight-line distance from the ${capital} CBD (calculated from ABS 2021 suburb centroid coordinates). ${s.distance_to_cbd <= 10 ? 'This close proximity means excellent access to employment, dining, and entertainment.' : s.distance_to_cbd <= 30 ? 'This is within comfortable commuting range with good transport links.' : s.distance_to_cbd <= 100 ? 'Road travel times will vary; check current mapping services for up-to-date routes.' : 'As a regional or remote location, travel to the capital is significant — local amenities and employment are important investment considerations.'}`
        : `Distance information is not available for ${s.suburb}. For current travel times to ${capital} and other centres, we recommend checking a current mapping service.`
    },
  ];

  return faqs.map(f =>
    `    <details>\n      <summary>${escHtml(f.q)}</summary>\n      <p>${escHtml(f.a)}</p>\n    </details>`
  ).join('\n');
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pre-compute related suburbs per state.
// Primary: Haversine distance when lat/lng available (real geographic proximity).
// Fallback: postcode proximity (expand ±postcode until 5 found).
// Last resort: population-size match within state.
function buildRelatedMap(allSuburbs) {
  const byState = {};
  for (const s of allSuburbs) {
    if (!byState[s.state]) byState[s.state] = [];
    byState[s.state].push(s);
  }

  const relatedMap = new Map();

  for (const state in byState) {
    const all = byState[state];

    // Postcode index for fallback: postcode (int) → suburbs sorted by population desc
    const byPostcode = {};
    for (const s of all) {
      if (!s.postcode) continue;
      const pc = parseInt(s.postcode, 10);
      if (!byPostcode[pc]) byPostcode[pc] = [];
      byPostcode[pc].push(s);
    }
    for (const pc in byPostcode) {
      byPostcode[pc].sort((a, b) => b.population - a.population);
    }

    // Suburbs with coords: sort into a spatial structure (just an array, sorted by lat then lng)
    const withCoords = all.filter(s => s.lat != null && s.lng != null);

    for (const s of all) {
      const selfKey = `${s.state}/${s.slug}`;
      const related = [];
      const seen = new Set([selfKey]);

      if (s.lat != null && s.lng != null && withCoords.length > 1) {
        // Haversine nearest neighbours — compute distances to all coords suburbs, sort, take 5
        const distances = withCoords
          .filter(o => {
            const k = `${o.state}/${o.slug}`;
            return !seen.has(k);
          })
          .map(o => ({ suburb: o, dist: haversineKm(s.lat, s.lng, o.lat, o.lng) }));
        distances.sort((a, b) => a.dist - b.dist);
        for (const { suburb: o } of distances) {
          const k = `${o.state}/${o.slug}`;
          if (seen.has(k)) continue;
          seen.add(k);
          related.push(o);
          if (related.length >= 5) break;
        }
      }

      // Postcode fallback for suburbs without coords (or to top up to 5)
      if (related.length < 5 && s.postcode) {
        const selfPc = parseInt(s.postcode, 10);
        for (let radius = 0; radius <= 30 && related.length < 5; radius++) {
          const toCheck = radius === 0 ? [selfPc] : [selfPc - radius, selfPc + radius];
          for (const pc of toCheck) {
            for (const o of (byPostcode[pc] || [])) {
              const k = `${o.state}/${o.slug}`;
              if (seen.has(k)) continue;
              seen.add(k);
              related.push(o);
              if (related.length >= 5) break;
            }
            if (related.length >= 5) break;
          }
        }
      }

      // Final fallback: population-size match within state
      if (related.length < 5) {
        const fallback = all
          .filter(o => !seen.has(`${o.state}/${o.slug}`))
          .sort((a, b) => Math.abs(a.population - s.population) - Math.abs(b.population - s.population));
        for (const o of fallback) {
          related.push(o);
          if (related.length >= 5) break;
        }
      }

      relatedMap.set(selfKey, related);
    }
  }

  return relatedMap;
}

function getRelatedSuburbs(suburb, relatedMap) {
  return relatedMap.get(`${suburb.state}/${suburb.slug}`) || [];
}

function generateRelatedHTML(related, state) {
  return related.map(r =>
    `      <a href="/suburb/${state.toLowerCase()}/${r.slug}/">\n        <div class="sr-name">${escHtml(r.suburb)}</div>\n        <div class="sr-type">${r.suburb_type}</div>\n      </a>`
  ).join('\n');
}

function generateResourcesHTML(state) {
  const resources = stateResources[state] || [];
  return resources.map(([name, url]) =>
    `      <a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(name)} →</a>`
  ).join('\n');
}

// ── Build suburb pages ──

// Build date injected into all pages so "last updated" is always accurate
const BUILD_DATE = new Date().toLocaleDateString('en-AU', {
  day: 'numeric', month: 'long', year: 'numeric'
}); // e.g. "23 March 2026"

let suburbCount = 0;
const stateGroups = {};

for (const s of suburbs) {
  if (!stateGroups[s.state]) stateGroups[s.state] = [];
  stateGroups[s.state].push(s);
}

const relatedMap = buildRelatedMap(suburbs);

for (const s of suburbs) {
  const related = getRelatedSuburbs(s, relatedMap);
  const pc = s.postcode || '';
  const pcTitle = pc ? `${pc} ` : '';
  const pcComma = pc ? ` ${pc},` : ',';
  const pcKw = pc ? `, ${pc} property` : '';
  const pcDisplay = pc || '—';

  // Meta description — no fake growth %, use type + real income instead
  const metaDesc = `Property investment insights for ${s.suburb}${pc ? ' ' + pc : ''}, ${s.state_name}. Population ${fmt(s.population)}, ${s.suburb_type} area${s.median_household_income ? ', median income $' + fmt(s.median_household_income) : ''}. ABS 2021 Census data.`;

  // Distance display: real km with note, or N/A
  const distDisplay = s.distance_to_cbd != null
    ? `${s.distance_to_cbd} km`
    : 'N/A';

  // Rent display
  const rentDisplay = s.median_rent_weekly
    ? `$${fmt(s.median_rent_weekly)}/wk`
    : 'N/A';

  // Income display
  const incomeDisplay = s.median_household_income
    ? `$${fmt(s.median_household_income)}/yr`
    : 'N/A';

  // Mortgage display
  const mortgageDisplay = s.median_mortgage_monthly
    ? `$${fmt(s.median_mortgage_monthly)}/mo`
    : 'N/A';

  // Dwelling type display
  const housePctDisplay = s.house_percentage != null
    ? `${s.house_percentage}% houses`
    : 'N/A';

  // School and park name lists for dropdown details
  // Use real Overpass names when available; fall back to count + external link
  const schoolNames = Array.isArray(s.school_names) ? s.school_names : [];
  const parkNames   = Array.isArray(s.park_names)   ? s.park_names   : [];

  const schoolCount = schoolNames.length || s.school_count;
  const parkCount   = parkNames.length   || s.park_count;

  const schoolsDetail = schoolNames.length
    ? `<ul class="suburb-amenity-list">${schoolNames.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul>`
      + `<a href="https://www.myschool.edu.au/school-finder?locationSuggestion=${encodeURIComponent(s.suburb + ' ' + s.state)}&radius=10" target="_blank" rel="noopener">View on My School →</a>`
    : `<p>Estimated ${s.school_count} school${s.school_count !== 1 ? 's' : ''} within or near this suburb based on ABS 2021 data.</p>`
      + `<a href="https://www.myschool.edu.au/school-finder?locationSuggestion=${encodeURIComponent(s.suburb + ' ' + s.state)}&radius=10" target="_blank" rel="noopener">Find schools near ${escHtml(s.suburb)} on My School →</a>`;

  const parksDetail = parkNames.length
    ? `<ul class="suburb-amenity-list">${parkNames.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul>`
    : `<p>Estimated ${s.park_count} park${s.park_count !== 1 ? 's' : ''} and green spaces near this suburb. Source: ABS 2021 data.</p>`;

  // Data source note for hero
  const dataSourceNote = `ABS 2021 Census · Updated ${BUILD_DATE}`;

  // Google Maps embed URL — zoom derived from real bounding box data when available,
  // otherwise falls back to suburb-type heuristic.
  const MAPS_ZOOM_FALLBACK = {
    'inner-city':  14,
    'middle-ring': 13,
    'outer-metro': 12,
    'coastal':     12,
    'regional':    11,
  };
  let mapsZoom = s.map_zoom;   // set by apply-abs-data.js from real polygon bbox
  if (!mapsZoom) {
    // Fallback: type-based heuristic; pull back one level for sparse regional localities
    const base = MAPS_ZOOM_FALLBACK[s.suburb_type] || 13;
    mapsZoom = (s.suburb_type === 'regional' && s.population < 500) ? base - 1 : base;
  }
  const mapsQuery = encodeURIComponent(`${s.suburb} ${s.state} Australia`);
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${mapsQuery}&output=embed&z=${mapsZoom}`;

  let html = SUBURB_TPL
    .replace(/\{\{SUBURB\}\}/g, escHtml(s.suburb))
    .replace(/\{\{STATE\}\}/g, escHtml(s.state))
    .replace(/\{\{STATE_LOWER\}\}/g, s.state.toLowerCase())
    .replace(/\{\{STATE_NAME\}\}/g, escHtml(s.state_name))
    .replace(/\{\{SLUG\}\}/g, s.slug)
    .replace(/\{\{POSTCODE\}\}/g, escHtml(pc))
    .replace(/\{\{POSTCODE_TITLE\}\}/g, escHtml(pcTitle))
    .replace(/\{\{POSTCODE_COMMA\}\}/g, escHtml(pcComma))
    .replace(/\{\{POSTCODE_KW\}\}/g, escHtml(pcKw))
    .replace(/\{\{POSTCODE_DISPLAY\}\}/g, escHtml(pcDisplay))
    .replace(/\{\{META_DESCRIPTION\}\}/g, escHtml(metaDesc))
    .replace(/\{\{OVERVIEW\}\}/g, generateOverview(s))
    .replace(/\{\{POPULATION\}\}/g, fmt(s.population))
    .replace(/\{\{DISTANCE_TO_CBD\}\}/g, distDisplay)
    .replace(/\{\{MEDIAN_RENT\}\}/g, rentDisplay)
    .replace(/\{\{MEDIAN_INCOME\}\}/g, incomeDisplay)
    .replace(/\{\{MEDIAN_MORTGAGE\}\}/g, mortgageDisplay)
    .replace(/\{\{HOUSE_PCT\}\}/g, housePctDisplay)
    .replace(/\{\{SCHOOL_COUNT\}\}/g, schoolCount)
    .replace(/\{\{PARK_COUNT\}\}/g, parkCount)
    .replace(/\{\{SCHOOLS_DETAIL\}\}/g, schoolsDetail)
    .replace(/\{\{PARKS_DETAIL\}\}/g, parksDetail)
    .replace(/\{\{DATA_SOURCE_NOTE\}\}/g, escHtml(dataSourceNote))
    .replace(/\{\{MAPS_EMBED_URL\}\}/g, mapsEmbedUrl)
    .replace(/\{\{INVESTMENT_INSIGHT\}\}/g, generateInsight(s))
    .replace(/\{\{FAQ_HTML\}\}/g, generateFAQ(s))
    .replace(/\{\{RELATED_SUBURBS_HTML\}\}/g, generateRelatedHTML(related, s.state))
    .replace(/\{\{RESOURCES_HTML\}\}/g, generateResourcesHTML(s.state));

  const outDir = path.join(ROOT, 'suburb', s.state.toLowerCase(), s.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  suburbCount++;
}

// ── Build state hub pages ──

const allStates = Object.keys(stateGroups).sort();
let hubCount = 0;

for (const state of allStates) {
  const stateSuburbs = stateGroups[state];
  const stateName = stateNames[state];
  const stateLower = state.toLowerCase();

  // State navigation
  const stateNavHTML = allStates.map(st =>
    `      <a href="/invest/${st.toLowerCase()}/"${st === state ? ' class="active"' : ''}>${st}</a>`
  ).join('\n');

  // Suburb list cards
  const suburbListHTML = stateSuburbs.map(s =>
    `      <a href="/suburb/${stateLower}/${s.slug}/" class="hub-suburb-card" data-search="${escHtml((s.suburb + ' ' + (s.postcode || '')).toLowerCase().trim())}">\n        <div class="hub-suburb-name">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-suburb-pc">${escHtml(s.postcode)}</span>` : ''}</div>\n        <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.distance_to_cbd != null ? s.distance_to_cbd + ' km to CBD' : 'Regional'}</span><span>$${fmt(s.median_household_income)}/yr</span></div>\n        <div class="hub-suburb-tag">${s.suburb_type}</div>\n      </a>`
  ).join('\n');

  let html = HUB_TPL
    .replace(/\{\{STATE\}\}/g, escHtml(state))
    .replace(/\{\{STATE_LOWER\}\}/g, stateLower)
    .replace(/\{\{STATE_NAME\}\}/g, escHtml(stateName))
    .replace(/\{\{SUBURB_COUNT\}\}/g, stateSuburbs.length)
    .replace(/\{\{STATE_NAV_HTML\}\}/g, stateNavHTML)
    .replace(/\{\{SUBURB_LIST_HTML\}\}/g, suburbListHTML);

  const outDir = path.join(ROOT, 'invest', stateLower);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  hubCount++;
}

// ── Generate suburb directory index ──

const dirSections = allStates.map(state => {
  const subs = stateGroups[state];
  const stateName = stateNames[state];
  const stateLower = state.toLowerCase();
  const links = subs.map(s =>
    `        <a href="/suburb/${stateLower}/${s.slug}/" class="hub-suburb-card">\n          <div class="hub-suburb-name">${escHtml(s.suburb)}</div>\n          <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.suburb_type}</span></div>\n        </a>`
  ).join('\n');
  return `    <section class="suburb-section">\n      <h2><a href="/invest/${stateLower}/">${escHtml(stateName)} (${state})</a> — ${subs.length} suburbs</h2>\n      <div class="hub-suburb-list">\n${links}\n      </div>\n    </section>`;
}).join('\n\n');

const dirIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script src="/site-init.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>All Australian Suburb Insights — ${suburbs.length} Suburbs | EquitySight</title>
<meta name="description" content="Browse property investment insights for ${suburbs.length} Australian suburbs across all states and territories. Population data, amenity scores, and investment context.">
<link rel="canonical" href="https://equitysight.app/suburb/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#1C1C1E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/shared.css">
<link rel="stylesheet" href="/tools.css">
<link rel="stylesheet" href="/suburb-insights.css">
</head>
<body>

<header class="tool-header">
  <a href="/" class="tool-logo">
    <span class="tool-logo-mark">🏠</span>
    <span class="tool-logo-name">EquitySight<span class="tool-logo-tld">.app</span></span>
  </a>
  <a href="/login?tab=signup" class="tool-header-link">Free full calculator →</a>
</header>
<script src="/auth-nav.js"></script>
<script src="/error-capture.js"></script>

<section class="tool-hero">
  <nav class="suburb-breadcrumb">
    <a href="/">Home</a> <span>›</span>
    <span>All Suburbs</span>
  </nav>
  <div class="tool-eyebrow">Suburb Insights · Australia</div>
  <h1>Australian Suburb Investment Insights</h1>
  <p>${suburbs.length} suburbs across ${allStates.length} states and territories — key indicators, amenity data, and investment context.</p>
</section>

<div class="suburb-main">

  <section class="suburb-section">
    <h2>Browse by State</h2>
    <div class="state-nav">
${allStates.map(st => `      <a href="#${st.toLowerCase()}">${st}</a>`).join('\n')}
    </div>
  </section>

${allStates.map(state => {
  const subs = stateGroups[state];
  const stateName = stateNames[state];
  const stateLower = state.toLowerCase();
  const links = subs.map(s =>
    `        <a href="/suburb/${stateLower}/${s.slug}/" class="hub-suburb-card">
          <div class="hub-suburb-name">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-suburb-pc">${escHtml(s.postcode)}</span>` : ''}</div>
          <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.suburb_type}</span></div>
        </a>`
  ).join('\n');
  return `  <section class="suburb-section" id="${stateLower}">
    <h2><a href="/invest/${stateLower}/" style="color:inherit;text-decoration:none;">${escHtml(stateName)} (${state})</a> <span style="font-family:var(--font-mono);font-size:13px;color:var(--slate);font-weight:400;">${subs.length} suburbs</span></h2>
    <div class="hub-suburb-list">
${links}
    </div>
  </section>`;
}).join('\n\n')}

  <section class="suburb-cta">
    <div class="tool-cta-eye">Full Property Analysis</div>
    <h3>Analyse any Australian property</h3>
    <p>30-year projections, scenario comparison, cash flow analysis, and PDF export.</p>
    <a href="/login?tab=signup" class="tool-cta-btn">Get started free →</a>
  </section>

</div>

<div id="site-footer-root"></div>
<script src="/footer.js"></script>
</body>
</html>`;

const suburbIndexDir = path.join(ROOT, 'suburb');
fs.mkdirSync(suburbIndexDir, { recursive: true });
fs.writeFileSync(path.join(suburbIndexDir, 'index.html'), dirIndexHTML);
console.log(`Generated suburb directory index (${suburbs.length} suburbs, ${allStates.length} states)`);

// ── Generate suburb sitemap ──

const sitemapHeader = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const sitemapFooter = '</urlset>';
const sitemapEntries = [];

// State hubs
for (const state of allStates) {
  sitemapEntries.push(`  <url>\n    <loc>https://equitysight.app/invest/${state.toLowerCase()}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
}

// Suburb pages
for (const s of suburbs) {
  sitemapEntries.push(`  <url>\n    <loc>https://equitysight.app/suburb/${s.state.toLowerCase()}/${s.slug}/</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
}

fs.writeFileSync(
  path.join(ROOT, 'sitemap-suburbs.xml'),
  sitemapHeader + '\n' + sitemapEntries.join('\n') + '\n' + sitemapFooter + '\n'
);

// ── Generate sitemap index ──

const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://equitysight.app/sitemap-core.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://equitysight.app/sitemap-suburbs.xml</loc>
  </sitemap>
</sitemapindex>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapIndex);

console.log(`Built ${suburbCount} suburb pages, ${hubCount} state hub pages`);
console.log(`Generated sitemap.xml (index) + sitemap-suburbs.xml (${sitemapEntries.length} URLs)`);

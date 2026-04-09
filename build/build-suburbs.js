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

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');
const SUBURB_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'suburb-page.html'), 'utf8');
const HUB_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'state-hub.html'), 'utf8');
const CITY_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'city-page.html'), 'utf8');

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
      a: `${s.suburb} is a ${s.suburb_type.replace('-', ' ')} area in ${s.state_name} with a population of ${fmt(s.population)}. ${s.median_rent_weekly ? `The median rent is $${fmt(s.median_rent_weekly)}/week and ` : ''}the median household income is $${fmt(s.median_household_income)}/year (ABS 2021 Census). As with any property investment, conduct thorough due diligence on current listings, market conditions, and local infrastructure plans before committing.`
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

// ── Deterministic phrase variation ──

function seedHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

// ── Investment Score ──

function computeScore(s) {
  // Income: 0–25 pts (scale $55k → 0, $115k → 25)
  const inc = s.median_household_income || 55000;
  const incomePts = Math.round(Math.min(25, Math.max(0, (inc - 55000) / (115000 - 55000) * 25)));

  // Distance to CBD: 0–20 pts
  let distPts = 10; // default when null
  if (s.distance_to_cbd != null) {
    const d = s.distance_to_cbd;
    distPts = d <= 5 ? 20 : d <= 15 ? 16 : d <= 30 ? 12 : d <= 50 ? 8 : 4;
  }

  // Suburb type: 0–20 pts
  const typePts = { 'inner-city': 18, 'middle-ring': 16, 'coastal': 14, 'outer-metro': 12, 'regional': 8 }[s.suburb_type] || 10;

  // Transport: 0–15 pts
  const transportPts = Math.round((s.transport_score || 5) / 10 * 15);

  // Amenity: 0–10 pts
  const amenityPts = Math.round((s.amenity_score || 5) / 10 * 10);

  // Rent: 0–10 pts
  let rentPts;
  if (s.median_rent_weekly) {
    const r = s.median_rent_weekly;
    rentPts = r >= 600 ? 10 : r >= 400 ? 7 : r >= 200 ? 5 : 3;
  } else {
    rentPts = { 'inner-city': 7, 'middle-ring': 6, 'outer-metro': 5, 'coastal': 5, 'regional': 4 }[s.suburb_type] || 5;
  }

  return Math.min(100, incomePts + distPts + typePts + transportPts + amenityPts + rentPts);
}

function generateInvestmentScore(s) {
  const score = computeScore(s);
  const h = seedHash(s.suburb + s.state);

  let label, cssClass;
  if (score >= 81) { label = 'Strong'; cssClass = 'suburb-score--strong'; }
  else if (score >= 61) { label = 'Good'; cssClass = 'suburb-score--good'; }
  else if (score >= 41) { label = 'Moderate'; cssClass = 'suburb-score--moderate'; }
  else { label = 'Weak'; cssClass = 'suburb-score--weak'; }

  // Build explanation from top factors
  const parts = [];
  const inc = s.median_household_income || 55000;

  // Income commentary
  if (inc >= 90000) {
    parts.push(pick(h, [
      `Strong household incomes in ${s.suburb} underpin solid property demand.`,
      `Above-average earnings in ${s.suburb} support sustained property values.`,
      `${s.suburb} benefits from a high-income resident base, supporting premium property pricing.`,
    ]));
  } else if (inc >= 72000) {
    parts.push(pick(h >> 1, [
      `Household incomes in ${s.suburb} sit in a comfortable mid-range for the ${s.state_name} market.`,
      `Moderate income levels in ${s.suburb} indicate steady rental demand from working households.`,
      `${s.suburb} has a solid income profile that supports reliable occupancy rates.`,
    ]));
  } else {
    parts.push(pick(h >> 2, [
      `Lower income levels in ${s.suburb} typically translate to more affordable entry points for investors.`,
      `${s.suburb}'s income profile suggests a value-oriented market with competitive purchase prices.`,
      `Household earnings in ${s.suburb} are below the state average, which may affect long-term capital growth.`,
    ]));
  }

  // Location commentary
  if (s.distance_to_cbd != null && s.distance_to_cbd <= 15) {
    parts.push(pick(h >> 3, [
      `Its proximity to the CBD adds a strong location premium.`,
      `Close CBD access strengthens tenant appeal and resale value.`,
      `The short commute to the city centre is a key demand driver.`,
    ]));
  } else if (s.suburb_type === 'coastal') {
    parts.push(pick(h >> 4, [
      `Coastal lifestyle appeal adds a premium that supports long-term demand.`,
      `Seaside positioning attracts both owner-occupiers and holiday rental demand.`,
      `The coastal setting provides a lifestyle factor that underpins property values.`,
    ]));
  } else if (s.suburb_type === 'regional') {
    parts.push(pick(h >> 5, [
      `As a regional location, growth prospects depend on local economic conditions and infrastructure investment.`,
      `Regional positioning means lower entry costs but potentially longer hold periods for capital gains.`,
      `Distance from major centres is a consideration, though regional markets can offer higher rental yields.`,
    ]));
  } else if (s.distance_to_cbd != null && s.distance_to_cbd > 30) {
    parts.push(pick(h >> 6, [
      `Greater distance from the CBD may temper short-term capital growth.`,
      `The outer location offers affordability but may see slower price appreciation.`,
      `While further from the city, improving transport links could boost future demand.`,
    ]));
  }

  // Cap at 2-3 sentences
  const explanation = parts.slice(0, 3).join(' ');

  return `<h2>Investment Score</h2>\n    <div class="suburb-score-badge">\n      <span class="suburb-score-value">${score}</span>\n      <span class="suburb-score-max">/ 100</span>\n      <span class="suburb-score-label ${cssClass}">${label}</span>\n    </div>\n    <p>${explanation}</p>`;
}

// ── Investment Strategy ──

function generateStrategy(s) {
  const h = seedHash(s.suburb + s.state);
  const inc = s.median_household_income || 55000;
  const type = s.suburb_type;
  const rent = s.median_rent_weekly;
  const pop = s.population;

  const strategies = [];

  // Buy & Hold
  let bhIcon, bhRating;
  if ((type === 'inner-city' || type === 'middle-ring') && inc >= 80000) {
    bhIcon = '\u2705'; bhRating = 'strong';
  } else if (type === 'regional' && inc < 65000) {
    bhIcon = '\u274C'; bhRating = 'limited';
  } else {
    bhIcon = '\u26A0\uFE0F'; bhRating = 'moderate';
  }

  const bhText = {
    strong: [
      `${s.suburb}'s established location and strong demographics make it well-suited to a long-term buy-and-hold strategy.`,
      `Solid fundamentals in ${s.suburb} support capital growth over a medium to long hold period.`,
      `With robust local demand and income levels, ${s.suburb} is a natural candidate for patient investors.`,
    ],
    moderate: [
      `A buy-and-hold approach in ${s.suburb} could work well with careful property selection and a longer time horizon.`,
      `${s.suburb} offers moderate buy-and-hold potential — look for properties with value-add opportunities.`,
      `Holding property in ${s.suburb} over the medium term may deliver steady, if unspectacular, returns.`,
    ],
    limited: [
      `Buy-and-hold in ${s.suburb} carries higher risk due to limited demand drivers and slower growth fundamentals.`,
      `Long-term holding in ${s.suburb} requires careful assessment of local economic resilience.`,
      `Capital growth in ${s.suburb} may be constrained — consider alternative strategies.`,
    ],
  };
  strategies.push({ name: 'Buy &amp; Hold', icon: bhIcon, text: pick(h, bhText[bhRating]) });

  // Rental Yield
  let ryIcon, ryRating;
  if (rent && rent >= 450) { ryIcon = '\u2705'; ryRating = 'strong'; }
  else if (!rent && (type === 'inner-city' || type === 'middle-ring')) { ryIcon = '\u2705'; ryRating = 'strong'; }
  else if (rent && rent >= 300) { ryIcon = '\u26A0\uFE0F'; ryRating = 'moderate'; }
  else if (type === 'outer-metro') { ryIcon = '\u26A0\uFE0F'; ryRating = 'moderate'; }
  else { ryIcon = '\u274C'; ryRating = 'limited'; }

  const ryText = {
    strong: [
      `Rental returns in ${s.suburb} are attractive relative to purchase prices, supporting positive cash flow.`,
      `Strong tenant demand in ${s.suburb} underpins consistent rental income and strong occupancy.`,
      `${s.suburb}'s rental market favours investors seeking yield — occupancy rates are typically strong in this area.`,
    ],
    moderate: [
      `Rental yields in ${s.suburb} are moderate — screen for properties that offer above-average returns.`,
      `${s.suburb} can deliver reasonable rental income, though yields are not the primary draw.`,
      `Expect competitive but not exceptional rental returns in ${s.suburb}'s current market.`,
    ],
    limited: [
      `Rental yields in ${s.suburb} tend to be lower — investors may need to rely on capital growth instead.`,
      `Achieving strong cash flow in ${s.suburb} is challenging at current rent-to-price ratios.`,
      `${s.suburb}'s rental market is softer — budget for potential gaps between tenancies.`,
    ],
  };
  strategies.push({ name: 'Rental Yield', icon: ryIcon, text: pick(h >> 2, ryText[ryRating]) });

  // Renovation / Flip
  let rfIcon, rfRating;
  if ((type === 'outer-metro' || type === 'middle-ring') && pop > 10000) { rfIcon = '\u2705'; rfRating = 'strong'; }
  else if ((type === 'coastal' || type === 'inner-city') && pop > 5000) { rfIcon = '\u26A0\uFE0F'; rfRating = 'moderate'; }
  else { rfIcon = '\u274C'; rfRating = 'limited'; }

  const rfText = {
    strong: [
      `Older housing stock in ${s.suburb} combined with strong buyer demand creates solid renovation upside.`,
      `${s.suburb}'s established market and growing population make it a viable location for value-add renovations.`,
      `Renovation projects in ${s.suburb} can capture the gap between unrenovated and updated property prices.`,
    ],
    moderate: [
      `Some renovation potential exists in ${s.suburb}, though margins may be tighter due to higher base prices or competition.`,
      `Selective flip opportunities exist in ${s.suburb} for investors with local market knowledge.`,
      `Renovation in ${s.suburb} requires careful cost analysis — the margin is there but not always wide.`,
    ],
    limited: [
      `Renovation or flip strategies in ${s.suburb} face headwinds from a smaller buyer pool and slower turnover.`,
      `The resale market in ${s.suburb} may not support quick-turnaround renovation projects.`,
      `Limited buyer depth in ${s.suburb} makes flip strategies higher-risk — consider rental conversion instead.`,
    ],
  };
  strategies.push({ name: 'Renovation / Flip', icon: rfIcon, text: pick(h >> 4, rfText[rfRating]) });

  const items = strategies.map(st =>
    `      <div class="suburb-strategy-item">\n        <span class="suburb-strategy-icon">${st.icon}</span>\n        <div>\n          <div class="suburb-strategy-name">${st.name}</div>\n          <p>${st.text}</p>\n        </div>\n      </div>`
  ).join('\n');

  return `<h2>Investment Strategy</h2>\n    <div class="suburb-strategy-list">\n${items}\n    </div>`;
}

// ── Risk Factors ──

function generateRisks(s) {
  const h = seedHash(s.suburb + s.state);
  const inc = s.median_household_income || 55000;
  const type = s.suburb_type;
  const pop = s.population;
  const dist = s.distance_to_cbd;

  // Pool of risks: [condition, variants[]]
  const pool = [];

  if (inc >= 95000) {
    pool.push([
      `High median incomes often correlate with premium property prices in ${s.suburb}, which can compress rental yields and raise the barrier to entry.`,
      `Elevated property values in ${s.suburb} may limit gross yields — investors should model cash flow carefully before committing.`,
      `Premium pricing in ${s.suburb} means larger mortgage commitments and greater exposure to interest rate movements.`,
    ]);
  }

  if (dist != null && dist > 30) {
    pool.push([
      `At ${dist} km from the CBD, ${s.suburb} may experience a narrower tenant pool compared to closer-in suburbs.`,
      `The distance from major employment hubs could limit rental demand during economic slowdowns.`,
      `Greater CBD distance in ${s.suburb} means growth is more dependent on local infrastructure and employment.`,
    ]);
  } else if (dist == null) {
    pool.push([
      `Limited proximity data for ${s.suburb} — investors should verify commute times and access to major centres.`,
      `Distance from key employment centres may affect tenant demand — conduct local due diligence.`,
      `Without confirmed CBD distance data, assess transport links and commute options independently.`,
    ]);
  }

  if (type === 'regional') {
    pool.push([
      `As a regional market, ${s.suburb}'s property values can be sensitive to changes in local industry and employment.`,
      `Regional markets like ${s.suburb} may experience longer selling times and thinner buyer pools.`,
      `Economic concentration risk is higher in regional areas — diversification of the local economy matters.`,
    ]);
  }

  if (inc < 70000) {
    pool.push([
      `Below-average household incomes in ${s.suburb} may cap rental price growth over time.`,
      `Lower income levels suggest tenants in ${s.suburb} are more price-sensitive, potentially limiting rent increases.`,
      `The income profile in ${s.suburb} means rental demand could soften during broader economic downturns.`,
    ]);
  }

  if (pop < 5000) {
    pool.push([
      `${s.suburb}'s smaller population means fewer potential tenants and buyers, increasing the time to find tenants.`,
      `A compact market like ${s.suburb} can see longer periods between tenancies — factor this into cash flow projections.`,
      `With a population under 5,000, liquidity risk is elevated — selling may take longer than in larger markets.`,
    ]);
  }

  if (type === 'inner-city') {
    pool.push([
      `Inner-city markets like ${s.suburb} face ongoing supply from new apartment developments, which can suppress price growth.`,
      `High-density living in ${s.suburb} means competition from new unit stock — differentiation matters for resale.`,
      `Strata levies and body corporate costs in ${s.suburb} can erode net rental returns on apartment investments.`,
    ]);
  }

  if (type === 'coastal') {
    pool.push([
      `Coastal locations like ${s.suburb} can experience seasonal rental demand fluctuations, affecting cash flow consistency.`,
      `Holiday rental potential in ${s.suburb} comes with higher management costs and regulatory uncertainty.`,
      `Insurance premiums in coastal areas can be elevated due to weather and flood risk — factor this into holding costs.`,
    ]);
  }

  if (type === 'outer-metro') {
    pool.push([
      `${s.suburb}'s outer-metro position means growth is partly contingent on future infrastructure and transport investment.`,
      `Newer estates in outer suburbs like ${s.suburb} may see depreciation of fixtures before meaningful land value gains.`,
      `Developing areas like ${s.suburb} can face delays in promised amenities and services, affecting liveability.`,
    ]);
  }

  // Always have at least a general risk
  pool.push([
    `As with any Australian property market, ${s.suburb} is subject to interest rate changes that affect borrowing costs and buyer demand.`,
    `Property markets are cyclical — ${s.suburb}'s current conditions may shift with broader economic trends.`,
    `Regulatory changes to tax concessions (e.g. negative gearing, CGT discount) could impact investor returns in ${s.suburb}.`,
  ]);

  // Select 3-4 risks
  const count = pool.length >= 4 ? 4 : Math.max(3, pool.length);
  const selected = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    selected.push(pick(h + i, pool[i]));
  }

  const items = selected.map(r => `      <li>${escHtml(r)}</li>`).join('\n');
  return `<h2>Risk Factors</h2>\n    <ul class="suburb-risk-list">\n${items}\n    </ul>`;
}

// ── 2026 Outlook ──

function generateOutlook(s) {
  const h = seedHash(s.suburb + s.state);
  const score = computeScore(s);
  const inc = s.median_household_income || 55000;
  const type = s.suburb_type;
  const pop = s.population;
  const rent = s.median_rent_weekly;

  // Growth outlook
  let growthLevel;
  if ((type === 'inner-city' || type === 'middle-ring') && inc >= 85000) growthLevel = 'strong';
  else if (type === 'regional' || inc < 70000) growthLevel = 'low';
  else growthLevel = 'moderate';

  // Rental demand outlook
  let rentalLevel;
  if ((type === 'inner-city' && (rent ? rent >= 400 : true)) || (type === 'middle-ring' && pop > 20000)) rentalLevel = 'strong';
  else if (type === 'regional' && pop < 5000) rentalLevel = 'low';
  else rentalLevel = 'moderate';

  // Investor sentiment
  let sentimentLevel;
  if (score >= 70) sentimentLevel = 'strong';
  else if (score >= 50) sentimentLevel = 'moderate';
  else sentimentLevel = 'low';

  function tagHtml(label, level) {
    return `<span class="suburb-outlook-tag suburb-outlook-tag--${level}">${escHtml(label)}: ${level.charAt(0).toUpperCase() + level.slice(1)}</span>`;
  }

  const tags = [
    tagHtml('Growth', growthLevel),
    tagHtml('Rental Demand', rentalLevel),
    tagHtml('Investor Sentiment', sentimentLevel),
  ].join('\n      ');

  // Narrative paragraph
  const parts = [];

  // Growth sentence
  if (growthLevel === 'strong') {
    parts.push(pick(h, [
      `${s.suburb} enters 2026 with positive growth momentum, supported by strong local demographics and sustained demand.`,
      `The outlook for capital growth in ${s.suburb} is encouraging heading into 2026, driven by constrained supply and buyer competition.`,
      `${s.suburb} is well-positioned for continued price appreciation through 2026, underpinned by high household incomes and location appeal.`,
    ]));
  } else if (growthLevel === 'moderate') {
    parts.push(pick(h >> 1, [
      `${s.suburb} is expected to see moderate price growth in 2026 as the broader ${s.state_name} market stabilises.`,
      `Growth in ${s.suburb} through 2026 will likely be steady rather than spectacular, tracking the wider market.`,
      `Property values in ${s.suburb} should hold firm in 2026, with gradual appreciation tied to infrastructure and population trends.`,
    ]));
  } else {
    parts.push(pick(h >> 2, [
      `Capital growth in ${s.suburb} may remain subdued in 2026, with limited demand drivers in the near term.`,
      `${s.suburb} faces a cautious growth outlook for 2026 — investors should focus on yield rather than short-term gains.`,
      `Price movement in ${s.suburb} is expected to be flat to modest in 2026, reflecting broader regional market conditions.`,
    ]));
  }

  // Rental sentence
  if (rentalLevel === 'strong') {
    parts.push(pick(h >> 3, [
      `Rental demand remains robust, with strong occupancy and growing tenant pools keeping yields competitive.`,
      `Tenant competition in ${s.suburb} continues to intensify, supporting landlords and rent stability.`,
      `Strong rental fundamentals in ${s.suburb} provide a reliable income base for investment properties.`,
    ]));
  } else if (rentalLevel === 'moderate') {
    parts.push(pick(h >> 4, [
      `Rental demand is expected to be stable, though landlords may need to remain competitive on pricing.`,
      `The rental market in ${s.suburb} should see steady occupancy, with moderate upward pressure on rents.`,
      `Tenants in ${s.suburb} have options — presenting well-maintained properties is key to minimising gaps between tenancies.`,
    ]));
  } else {
    parts.push(pick(h >> 5, [
      `Rental demand may be softer — budgeting for gaps between tenancies is prudent in ${s.suburb}'s 2026 outlook.`,
      `Landlords in ${s.suburb} may face longer tenant search times; competitive pricing will be important.`,
      `The rental pipeline in ${s.suburb} is thinner — flexible lease terms could help secure tenants faster.`,
    ]));
  }

  // Sentiment sentence
  if (sentimentLevel === 'strong') {
    parts.push(pick(h >> 6, [
      `Overall, investor sentiment toward ${s.suburb} is positive, backed by solid fundamentals.`,
      `${s.suburb} remains on the radar of active property investors in ${s.state_name}.`,
      `Confidence in ${s.suburb}'s medium-term prospects is reflected in sustained buyer interest.`,
    ]));
  } else if (sentimentLevel === 'moderate') {
    parts.push(pick(h >> 7, [
      `Investor sentiment is cautiously optimistic — selective opportunities exist for well-researched buyers.`,
      `${s.suburb} offers measured appeal for investors willing to look beyond headline metrics.`,
      `The market mood around ${s.suburb} is balanced — neither bullish nor bearish heading into 2026.`,
    ]));
  } else {
    parts.push(pick(h >> 8, [
      `Investor sentiment toward ${s.suburb} is currently lukewarm — value hunters may find opportunity here.`,
      `${s.suburb} is not a headline market, but contrarian investors may see long-term potential.`,
      `Sentiment is subdued, though improving local conditions could shift perceptions over time.`,
    ]));
  }

  return `<h2>2026 Outlook</h2>\n    <div class="suburb-outlook-tags">\n      ${tags}\n    </div>\n    <p>${parts.join(' ')}</p>`;
}

// ── City definitions (19 major Australian metro areas by postcode range) ──

const CITY_DEFS = {
  'Brisbane':        { state: 'QLD', ranges: [[4000,4179],[4300,4310]] },
  'Gold Coast':      { state: 'QLD', ranges: [[4210,4230]] },
  'Sunshine Coast':  { state: 'QLD', ranges: [[4551,4581]] },
  'Cairns':          { state: 'QLD', ranges: [[4868,4885]] },
  'Townsville':      { state: 'QLD', ranges: [[4810,4825]] },
  'Toowoomba':       { state: 'QLD', ranges: [[4350,4365]] },
  'Sydney':          { state: 'NSW', ranges: [[2000,2250]] },
  'Newcastle':       { state: 'NSW', ranges: [[2280,2330]] },
  'Wollongong':      { state: 'NSW', ranges: [[2500,2535]] },
  'Melbourne':       { state: 'VIC', ranges: [[3000,3211]] },
  'Geelong':         { state: 'VIC', ranges: [[3212,3232]] },
  'Ballarat':        { state: 'VIC', ranges: [[3350,3360]] },
  'Bendigo':         { state: 'VIC', ranges: [[3550,3560]] },
  'Perth':           { state: 'WA', ranges: [[6000,6214]] },
  'Adelaide':        { state: 'SA', ranges: [[5000,5130]] },
  'Hobart':          { state: 'TAS', ranges: [[7000,7054]] },
  'Launceston':      { state: 'TAS', ranges: [[7248,7260]] },
  'Canberra':        { state: 'ACT', ranges: [[2600,2618],[2900,2920]] },
  'Darwin':          { state: 'NT', ranges: [[800,840]] },
};

function citySlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

function inCityRange(postcode, ranges) {
  if (!postcode) return false;
  const n = parseInt(postcode, 10);
  return !isNaN(n) && ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

// ── City content generators ──

function computeCityScore(subs) {
  if (!subs.length) return 50;
  let totalPop = 0, weightedScore = 0;
  for (const s of subs) {
    const score = computeScore(s);
    weightedScore += score * s.population;
    totalPop += s.population;
  }
  return totalPop > 0 ? Math.round(weightedScore / totalPop) : 50;
}

function generateCityOverview(city, state, stateName, subs) {
  const h = seedHash(city + state);
  const totalPop = subs.reduce((a, s) => a + s.population, 0);
  const avgInc = Math.round(subs.reduce((a, s) => a + (s.median_household_income || 0), 0) / subs.length);
  const types = {};
  for (const s of subs) types[s.suburb_type] = (types[s.suburb_type] || 0) + 1;
  const dominantType = Object.entries(types).sort((a, b) => b[1] - a[1])[0][0];

  const sizeDesc = totalPop > 2000000 ? 'one of Australia\'s largest metropolitan areas'
    : totalPop > 500000 ? 'a major Australian city'
    : totalPop > 200000 ? 'a significant regional city'
    : totalPop > 100000 ? 'a growing regional centre'
    : 'a compact regional hub';

  const marketDesc = avgInc >= 85000
    ? pick(h, ['a premium property market with strong income fundamentals', 'a high-income market that supports robust property demand', 'a well-resourced market underpinned by above-average earnings'])
    : avgInc >= 75000
    ? pick(h >> 1, ['a solid mid-range property market', 'a balanced market with sustainable growth indicators', 'a stable market attractive to both investors and owner-occupiers'])
    : pick(h >> 2, ['an affordable entry point for property investors', 'a value-oriented market with potential for yield-focused strategies', 'a cost-effective market that can suit budget-conscious investors']);

  const typeDesc = dominantType === 'inner-city' ? 'an established inner-city fabric'
    : dominantType === 'middle-ring' ? 'a well-developed middle-ring profile'
    : dominantType === 'outer-metro' ? 'a mix of established and developing suburbs'
    : dominantType === 'coastal' ? 'significant coastal lifestyle appeal'
    : 'a diverse regional landscape';

  return `${city} is ${sizeDesc}, home to approximately ${fmt(totalPop)} residents across ${subs.length} suburbs in ${stateName}. The metro area represents ${marketDesc}, with a median household income of $${fmt(avgInc)} per year (ABS 2021 Census). The city features ${typeDesc}, offering varied opportunities for residential property investors.`;
}

function generateCityScoreHTML(city, state, subs) {
  const score = computeCityScore(subs);
  const h = seedHash(city + state);

  let label, cssClass;
  if (score >= 81) { label = 'Strong'; cssClass = 'suburb-score--strong'; }
  else if (score >= 61) { label = 'Good'; cssClass = 'suburb-score--good'; }
  else if (score >= 41) { label = 'Moderate'; cssClass = 'suburb-score--moderate'; }
  else { label = 'Weak'; cssClass = 'suburb-score--weak'; }

  const avgInc = Math.round(subs.reduce((a, s) => a + (s.median_household_income || 0), 0) / subs.length);
  const innerCount = subs.filter(s => s.suburb_type === 'inner-city' || s.suburb_type === 'middle-ring').length;
  const innerPct = Math.round(innerCount / subs.length * 100);

  const parts = [];
  if (avgInc >= 85000) {
    parts.push(pick(h, [
      `${city}'s strong household incomes provide a solid foundation for property values across the metro area.`,
      `High earning capacity across ${city} supports sustained demand and premium pricing.`,
      `Above-average incomes in ${city} underpin both owner-occupier and investor demand.`,
    ]));
  } else if (avgInc >= 75000) {
    parts.push(pick(h >> 1, [
      `${city}'s income profile sits in a healthy mid-range, supporting stable property demand.`,
      `Moderate income levels across ${city} sustain consistent rental and buyer activity.`,
      `${city} offers a balanced demographic that supports steady market conditions.`,
    ]));
  } else {
    parts.push(pick(h >> 2, [
      `Lower average incomes in ${city} create a more affordable market with yield-focused potential.`,
      `${city}'s income levels point toward a value market — entry prices are more accessible.`,
      `The income profile in ${city} favours investors seeking higher relative yields.`,
    ]));
  }

  if (innerPct >= 30) {
    parts.push(pick(h >> 3, [
      `With ${innerPct}% of suburbs classified as inner-city or middle-ring, location fundamentals are strong.`,
      `A significant proportion of established, well-located suburbs supports this score.`,
    ]));
  }

  return `<h2>City Investment Score</h2>\n    <div class="suburb-score-badge">\n      <span class="suburb-score-value">${score}</span>\n      <span class="suburb-score-max">/ 100</span>\n      <span class="suburb-score-label ${cssClass}">${label}</span>\n    </div>\n    <p>${parts.join(' ')}</p>`;
}

function generateCityStatsHTML(city, state, subs) {
  const totalPop = subs.reduce((a, s) => a + s.population, 0);
  const avgInc = Math.round(subs.reduce((a, s) => a + (s.median_household_income || 0), 0) / subs.length);
  const rents = subs.filter(s => s.median_rent_weekly).map(s => s.median_rent_weekly);
  const avgRent = rents.length ? Math.round(rents.reduce((a, r) => a + r, 0) / rents.length) : null;
  const dists = subs.filter(s => s.distance_to_cbd != null).map(s => s.distance_to_cbd);
  const avgDist = dists.length ? Math.round(dists.reduce((a, d) => a + d, 0) / dists.length) : null;

  const stats = [
    { label: 'Population', value: fmt(totalPop) },
    { label: 'Suburbs', value: subs.length.toString() },
    { label: 'Avg Household Income', value: `$${fmt(avgInc)}/yr` },
    { label: 'Avg Weekly Rent', value: avgRent ? `$${fmt(avgRent)}/wk` : 'N/A' },
    { label: 'Avg Distance to CBD', value: avgDist != null ? `${avgDist} km` : 'N/A' },
  ];

  return stats.map(s =>
    `      <div class="city-stat">\n        <div class="city-stat-label">${s.label}</div>\n        <div class="city-stat-value">${s.value}</div>\n      </div>`
  ).join('\n');
}

function generateCityStrategy(city, state, subs) {
  const h = seedHash(city + state);
  const avgInc = Math.round(subs.reduce((a, s) => a + (s.median_household_income || 0), 0) / subs.length);
  const totalPop = subs.reduce((a, s) => a + s.population, 0);
  const innerPct = subs.filter(s => s.suburb_type === 'inner-city' || s.suburb_type === 'middle-ring').length / subs.length;
  const outerPct = subs.filter(s => s.suburb_type === 'outer-metro').length / subs.length;

  const strategies = [];

  // Buy & Hold
  let bhIcon, bhRating;
  if (innerPct >= 0.25 && avgInc >= 80000) { bhIcon = '\u2705'; bhRating = 'strong'; }
  else if (avgInc < 65000 && totalPop < 100000) { bhIcon = '\u274C'; bhRating = 'limited'; }
  else { bhIcon = '\u26A0\uFE0F'; bhRating = 'moderate'; }

  const bhText = {
    strong: [
      `${city}'s established suburbs and strong demographics make it a compelling buy-and-hold market.`,
      `With a solid inner-ring profile, ${city} offers reliable long-term capital growth potential.`,
      `${city}'s market fundamentals support patient investors seeking steady appreciation.`,
    ],
    moderate: [
      `Buy-and-hold in ${city} can deliver solid results with careful suburb selection.`,
      `${city} offers pockets of strong growth potential — research individual suburbs carefully.`,
      `A hold strategy in ${city} is viable, particularly in suburbs with improving infrastructure.`,
    ],
    limited: [
      `Long-term holding in ${city} requires careful due diligence on local economic drivers.`,
      `Buy-and-hold prospects in ${city} are more uncertain — focus on well-located suburbs.`,
      `Capital growth in ${city} may be limited — consider yield-focused alternatives.`,
    ],
  };
  strategies.push({ name: 'Buy &amp; Hold', icon: bhIcon, text: pick(h, bhText[bhRating]) });

  // Rental Yield
  let ryIcon, ryRating;
  if (innerPct >= 0.2 || avgInc >= 80000) { ryIcon = '\u2705'; ryRating = 'strong'; }
  else if (outerPct >= 0.3) { ryIcon = '\u26A0\uFE0F'; ryRating = 'moderate'; }
  else { ryIcon = '\u26A0\uFE0F'; ryRating = 'moderate'; }

  const ryText = {
    strong: [
      `${city}'s rental market benefits from strong tenant demand driven by population and employment.`,
      `Consistent demand in ${city} supports reliable rental income and strong occupancy.`,
      `Investors in ${city} can expect competitive yields, particularly in well-connected suburbs.`,
    ],
    moderate: [
      `Rental yields in ${city} are achievable with the right suburb and property type selection.`,
      `${city} offers reasonable rental returns — target areas with strong tenant demographics.`,
      `Yields across ${city} vary — inner and middle-ring suburbs tend to offer better rental fundamentals.`,
    ],
  };
  strategies.push({ name: 'Rental Yield', icon: ryIcon, text: pick(h >> 2, ryText[ryRating]) });

  // Renovation / Flip
  let rfIcon, rfRating;
  if ((outerPct >= 0.2 || innerPct >= 0.15) && totalPop > 200000) { rfIcon = '\u2705'; rfRating = 'strong'; }
  else if (totalPop > 50000) { rfIcon = '\u26A0\uFE0F'; rfRating = 'moderate'; }
  else { rfIcon = '\u274C'; rfRating = 'limited'; }

  const rfText = {
    strong: [
      `${city}'s diverse market offers solid renovation opportunities across multiple price points.`,
      `Strong buyer depth in ${city} supports renovation margins — older stock is readily available.`,
      `With ${subs.length} suburbs to choose from, ${city} has ample scope for value-add projects.`,
    ],
    moderate: [
      `Selective renovation projects in ${city} can work well with careful suburb-level analysis.`,
      `Renovation potential in ${city} exists but margins may be tighter in a smaller market.`,
      `Flip strategies in ${city} are possible — focus on suburbs with growing buyer demand.`,
    ],
    limited: [
      `Limited buyer depth in ${city} makes renovation/flip strategies higher risk.`,
      `The resale market in ${city} may not consistently support quick-turnaround projects.`,
      `Consider rental conversion over flipping in ${city}'s current market conditions.`,
    ],
  };
  strategies.push({ name: 'Renovation / Flip', icon: rfIcon, text: pick(h >> 4, rfText[rfRating]) });

  const items = strategies.map(st =>
    `      <div class="suburb-strategy-item">\n        <span class="suburb-strategy-icon">${st.icon}</span>\n        <div>\n          <div class="suburb-strategy-name">${st.name}</div>\n          <p>${st.text}</p>\n        </div>\n      </div>`
  ).join('\n');

  return `<h2>Investment Strategy</h2>\n    <div class="suburb-strategy-list">\n${items}\n    </div>`;
}

function generateCityRisks(city, state, stateName, subs) {
  const h = seedHash(city + state);
  const avgInc = Math.round(subs.reduce((a, s) => a + (s.median_household_income || 0), 0) / subs.length);
  const totalPop = subs.reduce((a, s) => a + s.population, 0);
  const innerPct = subs.filter(s => s.suburb_type === 'inner-city').length / subs.length;
  const coastalPct = subs.filter(s => s.suburb_type === 'coastal').length / subs.length;

  const pool = [];

  if (avgInc >= 85000) {
    pool.push([
      `Premium property prices across ${city} raise the barrier to entry and can compress gross yields.`,
      `High income levels correlate with elevated property prices in ${city} — cash flow modelling is essential.`,
      `${city}'s premium market means larger mortgage commitments and greater interest rate sensitivity.`,
    ]);
  }

  if (totalPop > 1000000) {
    pool.push([
      `As a major metro, ${city} faces ongoing supply from new developments, particularly in high-density corridors.`,
      `New housing supply in ${city}'s growth corridors could moderate price gains in some suburbs.`,
      `${city}'s scale means infrastructure strain — transport and amenity access varies significantly by suburb.`,
    ]);
  } else if (totalPop < 200000) {
    pool.push([
      `${city}'s smaller market means thinner buyer pools — liquidity can be a concern during downturns.`,
      `As a regional city, ${city}'s property market is more sensitive to local economic conditions.`,
      `Limited population growth in ${city} may constrain long-term capital appreciation.`,
    ]);
  }

  if (innerPct >= 0.15) {
    pool.push([
      `High-density development in ${city}'s inner suburbs may increase supply competition for unit investors.`,
      `Inner-city unit markets in ${city} face potential oversupply — strata costs can also erode returns.`,
      `New apartment stock in ${city} could affect resale values for existing units.`,
    ]);
  }

  if (coastalPct >= 0.2) {
    pool.push([
      `Coastal areas in ${city} may experience seasonal rental fluctuations and higher insurance premiums.`,
      `Holiday rental regulatory changes in ${stateName} could impact coastal suburb returns.`,
      `Climate risk premiums for coastal properties in ${city} may increase over time.`,
    ]);
  }

  // Universal risks
  pool.push([
    `Interest rate movements remain the primary risk — ${city} investors should stress-test their cash flow at higher rates.`,
    `RBA rate decisions will directly affect borrowing costs and buyer sentiment across ${city}.`,
    `Changes to Australian tax settings (negative gearing, CGT discount) could reshape investor returns in ${city}.`,
  ]);

  pool.push([
    `Property markets are cyclical — ${city}'s current conditions may shift with broader ${stateName} economic trends.`,
    `National and state economic conditions will influence ${city}'s property trajectory in coming years.`,
    `Broader regulatory or economic shifts could moderate ${city}'s investment appeal.`,
  ]);

  const count = Math.min(4, pool.length);
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(pick(h + i, pool[i]));
  }

  const items = selected.map(r => `      <li>${escHtml(r)}</li>`).join('\n');
  return `<h2>Risk Factors</h2>\n    <ul class="suburb-risk-list">\n${items}\n    </ul>`;
}

function generateCityOutlook(city, state, subs) {
  const h = seedHash(city + state);
  const score = computeCityScore(subs);
  const avgInc = Math.round(subs.reduce((a, s) => a + (s.median_household_income || 0), 0) / subs.length);
  const totalPop = subs.reduce((a, s) => a + s.population, 0);
  const innerPct = subs.filter(s => s.suburb_type === 'inner-city' || s.suburb_type === 'middle-ring').length / subs.length;

  // Growth outlook
  let growthLevel;
  if (innerPct >= 0.25 && avgInc >= 82000) growthLevel = 'strong';
  else if (totalPop < 150000 || avgInc < 70000) growthLevel = 'low';
  else growthLevel = 'moderate';

  // Rental demand
  let rentalLevel;
  if (totalPop > 500000 || (innerPct >= 0.2 && avgInc >= 80000)) rentalLevel = 'strong';
  else if (totalPop < 100000) rentalLevel = 'low';
  else rentalLevel = 'moderate';

  // Sentiment
  let sentimentLevel;
  if (score >= 70) sentimentLevel = 'strong';
  else if (score >= 50) sentimentLevel = 'moderate';
  else sentimentLevel = 'low';

  function tagHtml(label, level) {
    return `<span class="suburb-outlook-tag suburb-outlook-tag--${level}">${escHtml(label)}: ${level.charAt(0).toUpperCase() + level.slice(1)}</span>`;
  }

  const tags = [
    tagHtml('Growth', growthLevel),
    tagHtml('Rental Demand', rentalLevel),
    tagHtml('Investor Sentiment', sentimentLevel),
  ].join('\n      ');

  const parts = [];

  if (growthLevel === 'strong') {
    parts.push(pick(h, [
      `${city} enters 2026 with strong growth fundamentals, supported by population inflows and constrained housing supply.`,
      `The outlook for property appreciation in ${city} is positive heading into 2026, driven by demand exceeding supply.`,
      `${city}'s growth trajectory remains encouraging for 2026, underpinned by robust employment and migration patterns.`,
    ]));
  } else if (growthLevel === 'moderate') {
    parts.push(pick(h >> 1, [
      `${city} is expected to see moderate price growth through 2026, broadly in line with the wider market.`,
      `Property values in ${city} should track steadily in 2026, with selective suburbs outperforming.`,
      `Growth across ${city} will likely be measured in 2026, with stronger results in well-located suburbs.`,
    ]));
  } else {
    parts.push(pick(h >> 2, [
      `Capital growth in ${city} may be subdued in 2026 as the market consolidates.`,
      `${city} faces a cautious growth outlook for 2026 — yield strategies may be more appropriate.`,
      `Price movement in ${city} is expected to be modest in 2026, reflecting current market dynamics.`,
    ]));
  }

  if (rentalLevel === 'strong') {
    parts.push(pick(h >> 3, [
      `Rental demand across the city remains robust, with strong occupancy near historic highs.`,
      `Tenant competition in ${city} supports landlords with strong occupancy and rent stability.`,
      `Solid rental fundamentals across ${city}'s suburbs provide a dependable income base.`,
    ]));
  } else if (rentalLevel === 'moderate') {
    parts.push(pick(h >> 4, [
      `Rental demand is expected to be stable, though competitive pricing will help minimise gaps between tenancies.`,
      `The rental market across ${city} should see steady occupancy through 2026.`,
      `Landlords in ${city} can expect consistent demand, particularly for well-presented properties.`,
    ]));
  } else {
    parts.push(pick(h >> 5, [
      `Rental demand may be softer in parts of ${city} — investors should budget for potential gaps between tenancies.`,
      `The rental outlook for ${city} is cautious — competitive pricing and property quality will matter.`,
      `Tenant demand in ${city} is modest — flexible lease strategies may help secure occupants.`,
    ]));
  }

  if (sentimentLevel === 'strong') {
    parts.push(pick(h >> 6, [
      `Overall investor sentiment toward ${city} is positive, with sustained buyer interest across key suburbs.`,
      `${city} remains a focus for active property investors seeking medium-term growth.`,
    ]));
  } else if (sentimentLevel === 'moderate') {
    parts.push(pick(h >> 7, [
      `Investor sentiment is cautiously optimistic — selective opportunities are available for well-researched buyers.`,
      `${city} offers balanced appeal for investors willing to look beyond headline metrics and identify suburb-level value.`,
    ]));
  } else {
    parts.push(pick(h >> 8, [
      `Investor sentiment toward ${city} is currently subdued — contrarian investors may find value.`,
      `${city} is not currently a headline market, but improving conditions could shift sentiment over time.`,
    ]));
  }

  return `<h2>2026 Outlook</h2>\n    <div class="suburb-outlook-tags">\n      ${tags}\n    </div>\n    <p>${parts.join(' ')}</p>`;
}

function generateTopSuburbsHTML(subs, state) {
  // Score and sort, take top 12
  const scored = subs.map(s => ({ suburb: s, score: computeScore(s) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 12);

  return top.map(({ suburb: s, score }) => {
    let label, cssClass;
    if (score >= 81) { label = 'Strong'; cssClass = 'suburb-score--strong'; }
    else if (score >= 61) { label = 'Good'; cssClass = 'suburb-score--good'; }
    else if (score >= 41) { label = 'Moderate'; cssClass = 'suburb-score--moderate'; }
    else { label = 'Weak'; cssClass = 'suburb-score--weak'; }

    return `      <a href="/suburb/${state.toLowerCase()}/${s.slug}/" class="city-top-card">
        <div class="city-top-name">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-suburb-pc">${escHtml(s.postcode)}</span>` : ''}</div>
        <div class="city-top-score"><span class="suburb-score-label ${cssClass}">${score}</span> ${label}</div>
        <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.suburb_type}</span></div>
      </a>`;
  }).join('\n');
}

// ── Build suburb pages ──

// Build date injected into all pages so "last updated" is always accurate
const BUILD_DATE = new Date().toLocaleDateString('en-AU', {
  day: 'numeric', month: 'long', year: 'numeric'
}); // e.g. "23 March 2026"

// Thin-page detection: suburbs that should get noindex, follow
function shouldNoindex(s) {
  return s.tiny || s.population < 50 || !s.postcode;
}

let suburbCount = 0;
let noindexCount = 0;
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

  // Meta description — compelling, search-focused
  const metaDesc = `Explore ${s.suburb}, ${s.state_name} property market data — median house prices, rental yield, capital growth trends and investment insights. Free 2026 suburb profile.`;

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

  const robotsMeta = shouldNoindex(s) ? '<meta name="robots" content="noindex, follow">\n' : '';
  if (shouldNoindex(s)) noindexCount++;

  let html = SUBURB_TPL
    .replace(/\{\{ROBOTS_META\}\}/g, robotsMeta)
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
    .replace(/\{\{INVESTMENT_SCORE_HTML\}\}/g, generateInvestmentScore(s))
    .replace(/\{\{STRATEGY_HTML\}\}/g, generateStrategy(s))
    .replace(/\{\{RISK_FACTORS_HTML\}\}/g, generateRisks(s))
    .replace(/\{\{OUTLOOK_HTML\}\}/g, generateOutlook(s))
    .replace(/\{\{FAQ_HTML\}\}/g, generateFAQ(s))
    .replace(/\{\{RELATED_SUBURBS_HTML\}\}/g, generateRelatedHTML(related, s.state))
    .replace(/\{\{RESOURCES_HTML\}\}/g, generateResourcesHTML(s.state));

  const outDir = path.join(ROOT, 'suburb', s.state.toLowerCase(), s.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  suburbCount++;
}

// ── Build city pages (before state hubs so cityByState is populated for hub links) ──

let cityCount = 0;
const cityByState = {}; // state → [{ name, slug, suburbCount, population }] for state hub links
const allStates = Object.keys(stateGroups).sort();

for (const [cityName, cityDef] of Object.entries(CITY_DEFS)) {
  const { state, ranges } = cityDef;
  const cStateName = stateNames[state];
  const cStateLower = state.toLowerCase();
  const cSlug = citySlug(cityName);

  // Filter suburbs belonging to this city
  const citySubs = suburbs.filter(s => s.state === state && inCityRange(s.postcode, ranges));
  if (!citySubs.length) continue;

  const totalPop = citySubs.reduce((a, s) => a + s.population, 0);

  // Track for state hub links
  if (!cityByState[state]) cityByState[state] = [];
  cityByState[state].push({ name: cityName, slug: cSlug, suburbCount: citySubs.length, population: totalPop });

  const metaDesc = `Property investment insights for ${cityName}, ${cStateName}. ${citySubs.length} suburbs, population ${fmt(totalPop)}, key indicators, investment scores, and 2026 outlook. ABS 2021 Census data.`;
  const dataSourceNote = `ABS 2021 Census \u00b7 Updated ${BUILD_DATE}`;

  // Suburb list cards (reuse state hub pattern)
  const citySuburbListHTML = citySubs.map(s =>
    `      <a href="/suburb/${cStateLower}/${s.slug}/" class="hub-suburb-card" data-search="${escHtml((s.suburb + ' ' + (s.postcode || '')).toLowerCase().trim())}">\n        <div class="hub-suburb-name">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-suburb-pc">${escHtml(s.postcode)}</span>` : ''}</div>\n        <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.distance_to_cbd != null ? s.distance_to_cbd + ' km to CBD' : 'Regional'}</span><span>$${fmt(s.median_household_income)}/yr</span></div>\n        <div class="hub-suburb-tag">${s.suburb_type}</div>\n      </a>`
  ).join('\n');

  let cityHtml = CITY_TPL
    .replace(/\{\{CITY\}\}/g, escHtml(cityName))
    .replace(/\{\{CITY_SLUG\}\}/g, cSlug)
    .replace(/\{\{STATE\}\}/g, escHtml(state))
    .replace(/\{\{STATE_LOWER\}\}/g, cStateLower)
    .replace(/\{\{STATE_NAME\}\}/g, escHtml(cStateName))
    .replace(/\{\{META_DESCRIPTION\}\}/g, escHtml(metaDesc))
    .replace(/\{\{DATA_SOURCE_NOTE\}\}/g, escHtml(dataSourceNote))
    .replace(/\{\{CITY_OVERVIEW\}\}/g, generateCityOverview(cityName, state, cStateName, citySubs))
    .replace(/\{\{CITY_SCORE_HTML\}\}/g, generateCityScoreHTML(cityName, state, citySubs))
    .replace(/\{\{CITY_STATS_HTML\}\}/g, generateCityStatsHTML(cityName, state, citySubs))
    .replace(/\{\{CITY_STRATEGY_HTML\}\}/g, generateCityStrategy(cityName, state, citySubs))
    .replace(/\{\{CITY_RISKS_HTML\}\}/g, generateCityRisks(cityName, state, cStateName, citySubs))
    .replace(/\{\{CITY_OUTLOOK_HTML\}\}/g, generateCityOutlook(cityName, state, citySubs))
    .replace(/\{\{TOP_SUBURBS_HTML\}\}/g, generateTopSuburbsHTML(citySubs, state))
    .replace(/\{\{SUBURB_COUNT\}\}/g, citySubs.length)
    .replace(/\{\{SUBURB_LIST_HTML\}\}/g, citySuburbListHTML)
    .replace(/\{\{RESOURCES_HTML\}\}/g, generateResourcesHTML(state));

  const cityOutDir = path.join(ROOT, 'invest', cStateLower, cSlug);
  fs.mkdirSync(cityOutDir, { recursive: true });
  fs.writeFileSync(path.join(cityOutDir, 'index.html'), cityHtml);
  cityCount++;
}

// ── Build state hub pages ──

let hubCount = 0;

for (const state of allStates) {
  const stateSuburbs = stateGroups[state];
  const stateName = stateNames[state];
  const stateLower = state.toLowerCase();

  // State navigation
  const stateNavHTML = allStates.map(st =>
    `      <a href="/invest/${st.toLowerCase()}/"${st === state ? ' class="active"' : ''}>${st}</a>`
  ).join('\n');

  // City navigation cards
  const cities = cityByState[state] || [];
  let cityNavHTML = '';
  if (cities.length) {
    cities.sort((a, b) => b.population - a.population);
    const cityCards = cities.map(c =>
      `      <a href="/invest/${stateLower}/${c.slug}/" class="city-card">\n        <div class="city-card-name">${escHtml(c.name)}</div>\n        <div class="city-card-meta">${c.suburbCount} suburbs · Pop. ${fmt(c.population)}</div>\n      </a>`
    ).join('\n');
    cityNavHTML = `  <section class="suburb-section">\n    <h2>Major Cities in ${escHtml(stateName)}</h2>\n    <div class="city-cards">\n${cityCards}\n    </div>\n  </section>\n`;
  }

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
    .replace(/\{\{CITY_NAV_HTML\}\}/g, cityNavHTML)
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

// ── Generate split sitemaps (max 1000 URLs per file, grouped by state) ──

const sitemapXmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const sitemapXmlFooter = '</urlset>';

function sitemapUrl(loc, changefreq, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

// Collect URLs grouped by state
const stateUrls = {};
for (const state of allStates) {
  stateUrls[state] = [];
  // State hub page
  stateUrls[state].push(sitemapUrl(`https://equitysight.app/invest/${state.toLowerCase()}/`, 'weekly', '0.8'));
}

// City pages → into their state bucket
for (const [cityName, cityDef] of Object.entries(CITY_DEFS)) {
  const cSlug = citySlug(cityName);
  const st = cityDef.state;
  if (!stateUrls[st]) stateUrls[st] = [];
  stateUrls[st].push(sitemapUrl(`https://equitysight.app/invest/${st.toLowerCase()}/${cSlug}/`, 'weekly', '0.75'));
}

// Suburb pages → into their state bucket (exclude noindex pages from sitemap)
let sitemapExcluded = 0;
for (const s of suburbs) {
  if (shouldNoindex(s)) { sitemapExcluded++; continue; }
  stateUrls[s.state].push(sitemapUrl(`https://equitysight.app/suburb/${s.state.toLowerCase()}/${s.slug}/`, 'monthly', '0.6'));
}

// Split each state into chunks of max 1000 and write files
const MAX_PER_SITEMAP = 1000;
const sitemapFiles = []; // { filename, urlCount }
let totalSitemapUrls = 0;

for (const state of allStates) {
  const urls = stateUrls[state];
  const chunks = [];
  for (let i = 0; i < urls.length; i += MAX_PER_SITEMAP) {
    chunks.push(urls.slice(i, i + MAX_PER_SITEMAP));
  }
  for (let i = 0; i < chunks.length; i++) {
    const suffix = chunks.length > 1 ? `-${i + 1}` : '';
    const filename = `sitemap-suburbs-${state.toLowerCase()}${suffix}.xml`;
    const content = sitemapXmlHeader + '\n' + chunks[i].join('\n') + '\n' + sitemapXmlFooter + '\n';
    fs.writeFileSync(path.join(ROOT, filename), content);
    sitemapFiles.push({ filename, urlCount: chunks[i].length });
    totalSitemapUrls += chunks[i].length;
  }
}

// ── Generate sitemap index ──

const sitemapIndexEntries = [
  '  <sitemap>\n    <loc>https://equitysight.app/sitemap-core.xml</loc>\n  </sitemap>',
  ...sitemapFiles.map(f =>
    `  <sitemap>\n    <loc>https://equitysight.app/${f.filename}</loc>\n  </sitemap>`
  ),
];

const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapIndexEntries.join('\n')}
</sitemapindex>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapIndex);

// Clean up old monolithic sitemap file if it exists
const oldSitemap = path.join(ROOT, 'sitemap-suburbs.xml');
if (fs.existsSync(oldSitemap)) fs.unlinkSync(oldSitemap);

console.log(`Built ${suburbCount} suburb pages (${noindexCount} noindexed), ${cityCount} city pages, ${hubCount} state hub pages`);
console.log(`Generated sitemap.xml (index) + ${sitemapFiles.length} sitemap files (${totalSitemapUrls} URLs, ${sitemapExcluded} excluded)`);
sitemapFiles.forEach(f => console.log(`  ${f.filename}: ${f.urlCount} URLs`));

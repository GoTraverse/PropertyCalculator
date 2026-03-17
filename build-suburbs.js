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
    'outer-metro': `a growing outer-metropolitan suburb of ${capital}`,
    'regional': `a regional centre in ${s.state_name}`,
    'coastal': `a coastal suburb in ${s.state_name}`,
  }[s.suburb_type] || `a suburb in ${s.state_name}`;

  const distDesc = s.distance_to_cbd === 0
    ? `At the heart of ${capital}`
    : `Located ${s.distance_to_cbd} km from the ${capital} CBD`;

  const popDesc = s.population > 100000 ? 'a major population centre'
    : s.population > 50000 ? 'a significant urban area'
    : s.population > 20000 ? 'a sizeable community'
    : s.population > 5000 ? 'a smaller community'
    : 'a boutique locality';

  return `${s.suburb} is ${typeLabel} with a population of approximately ${fmt(s.population)}, making it ${popDesc}. ${distDesc}, ${s.suburb} offers ${s.amenity_score >= 7 ? 'excellent' : s.amenity_score >= 5 ? 'good' : 'developing'} amenity access with a median household income of $${fmt(s.median_household_income)} per year.`;
}

function generateInsight(s) {
  const parts = [];

  // Growth analysis
  if (s.population_growth >= 15) {
    parts.push(`${s.suburb} is experiencing strong population growth of ${s.population_growth}%, indicating a high-demand growth corridor. Rapid population increases typically signal infrastructure investment, new housing developments, and rising property values.`);
  } else if (s.population_growth >= 8) {
    parts.push(`With ${s.population_growth}% population growth, ${s.suburb} shows healthy demand and steady expansion. This kind of moderate growth often reflects a suburb transitioning or gentrifying, attracting new residents and investment.`);
  } else {
    parts.push(`${s.suburb} has measured population growth of ${s.population_growth}%, suggesting a stable, established market. While rapid capital gains may be less likely, stable suburbs often deliver reliable rental yields and lower vacancy risk.`);
  }

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

  // Income-based
  if (s.median_household_income >= 100000) {
    parts.push(`High median household income ($${fmt(s.median_household_income)}) supports premium property values and indicates a well-employed, financially secure resident base.`);
  } else if (s.median_household_income >= 75000) {
    parts.push(`The median household income of $${fmt(s.median_household_income)} reflects a solid middle-class demographic, supporting sustainable rental demand and property values.`);
  }

  // Schools
  if (s.school_count >= 10) {
    parts.push(`With ${s.school_count} schools in the area, ${s.suburb} is well-positioned to attract families — a key driver of property demand in any market.`);
  }

  return parts.join(' ');
}

function generateFAQ(s) {
  const faqs = [
    {
      q: `Is ${s.suburb} a good suburb for investment?`,
      a: `${s.suburb} shows ${s.population_growth >= 10 ? 'strong' : 'steady'} population growth (${s.population_growth}%) and has ${s.amenity_score >= 7 ? 'excellent' : 'good'} amenity access. With a median household income of $${fmt(s.median_household_income)}, the local demographic supports ${s.median_household_income >= 80000 ? 'solid' : 'moderate'} rental demand. As with any investment, conduct thorough due diligence on specific properties and current market conditions.`
    },
    {
      q: `What drives property demand in ${s.suburb}?`,
      a: `Key demand drivers in ${s.suburb} include ${s.suburb_type === 'coastal' ? 'lifestyle appeal and proximity to the coast' : s.suburb_type === 'inner-city' ? 'employment proximity and urban lifestyle' : s.suburb_type === 'outer-metro' ? 'affordability relative to inner suburbs and new infrastructure' : s.suburb_type === 'regional' ? 'regional employment, lifestyle, and affordability' : 'established amenities and transport access'}. The area has ${s.school_count} schools and ${s.park_count} parks, supporting family demand. Transport access scores ${s.transport_score}/10.`
    },
    {
      q: `Is ${s.suburb} growing?`,
      a: `${s.suburb} has recorded population growth of ${s.population_growth}% to a current estimated population of ${fmt(s.population)}. ${s.population_growth >= 12 ? 'This is above-average growth, suggesting strong demand and potential for ongoing property value increases.' : 'This represents steady growth for the area.'}`
    },
    {
      q: `How far is ${s.suburb} from the CBD?`,
      a: `${s.suburb} is approximately ${s.distance_to_cbd} km from the ${stateCapitals[s.state]} CBD. ${s.distance_to_cbd <= 10 ? 'This close proximity means excellent access to employment, dining, and entertainment.' : s.distance_to_cbd <= 30 ? 'This is a comfortable commuting distance with good transport links.' : 'While further from the CBD, this can mean more affordable entry points for investors.'}`
    },
  ];

  return faqs.map(f =>
    `    <details>\n      <summary>${escHtml(f.q)}</summary>\n      <p>${escHtml(f.a)}</p>\n    </details>`
  ).join('\n');
}

function getRelatedSuburbs(suburb, allSuburbs) {
  // Get suburbs in the same state, sorted by proximity in distance_to_cbd
  const sameState = allSuburbs.filter(s => s.state === suburb.state && s.slug !== suburb.slug);
  sameState.sort((a, b) => Math.abs(a.distance_to_cbd - suburb.distance_to_cbd) - Math.abs(b.distance_to_cbd - suburb.distance_to_cbd));
  return sameState.slice(0, 5);
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

let suburbCount = 0;
const stateGroups = {};

for (const s of suburbs) {
  if (!stateGroups[s.state]) stateGroups[s.state] = [];
  stateGroups[s.state].push(s);
}

for (const s of suburbs) {
  const related = getRelatedSuburbs(s, suburbs);
  const metaDesc = `Property investment insights for ${s.suburb}, ${s.state_name}. Population ${fmt(s.population)}, ${s.population_growth}% growth, ${s.suburb_type} suburb. Key indicators, amenities, and investment analysis.`;

  let html = SUBURB_TPL
    .replace(/\{\{SUBURB\}\}/g, escHtml(s.suburb))
    .replace(/\{\{STATE\}\}/g, escHtml(s.state))
    .replace(/\{\{STATE_LOWER\}\}/g, s.state.toLowerCase())
    .replace(/\{\{STATE_NAME\}\}/g, escHtml(s.state_name))
    .replace(/\{\{SLUG\}\}/g, s.slug)
    .replace(/\{\{META_DESCRIPTION\}\}/g, escHtml(metaDesc))
    .replace(/\{\{OVERVIEW\}\}/g, generateOverview(s))
    .replace(/\{\{POPULATION\}\}/g, fmt(s.population))
    .replace(/\{\{POPULATION_GROWTH\}\}/g, s.population_growth)
    .replace(/\{\{DISTANCE_TO_CBD\}\}/g, s.distance_to_cbd)
    .replace(/\{\{MEDIAN_INCOME\}\}/g, fmt(s.median_household_income))
    .replace(/\{\{SCHOOL_COUNT\}\}/g, s.school_count)
    .replace(/\{\{PARK_COUNT\}\}/g, s.park_count)
    .replace(/\{\{TRANSPORT_SCORE\}\}/g, s.transport_score)
    .replace(/\{\{AMENITY_SCORE\}\}/g, s.amenity_score)
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
    `      <a href="/suburb/${stateLower}/${s.slug}/" class="hub-suburb-card">\n        <div class="hub-suburb-name">${escHtml(s.suburb)}</div>\n        <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.distance_to_cbd} km to CBD</span><span>$${fmt(s.median_household_income)}/yr</span></div>\n        <div class="hub-suburb-tag">${s.suburb_type}</div>\n      </a>`
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

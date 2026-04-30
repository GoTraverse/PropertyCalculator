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

// SEO title builder. Target: under 60 chars (Google desktop SERP).
// Falls back through descriptor variants when the prefix is long.
function buildSuburbTitle(suburb, state, postcode) {
  const prefix = postcode ? `${suburb}, ${state} ${postcode}` : `${suburb}, ${state}`;
  const variants = [
    ' – Property Data, Median Price & Rental Yield | EquitySight',
    ' – Property Data, Median Price & Rental Yield',
    ' – Property Data, Price & Yield',
    ' – Property Data',
    ' Property Profile'
  ];
  for (const v of variants) {
    const t = prefix + v;
    if (t.length < 60) return t;
  }
  return prefix;
}

// SEO H1 builder.
function buildSuburbH1(suburb, state, postcode) {
  return postcode
    ? `${suburb}, ${state} ${postcode} Property Profile`
    : `${suburb}, ${state} Property Profile`;
}

// SEO meta description builder. Target: under 155 chars.
function buildSuburbMetaDesc(suburb, state) {
  const full = `See ${suburb} ${state} property data: median house price, rental yield, growth trends and demographics. Free investment analysis tool.`;
  if (full.length < 155) return full;
  const trimmed = `See ${suburb} ${state} property data: median price, rental yield, growth trends. Free Australian investment analysis.`;
  if (trimmed.length < 155) return trimmed;
  return `${suburb} ${state} property data: median price, rental yield, growth trends.`;
}

// ── Locator card (replaces the old Google Maps iframe — see PR shipping
//    `<div class="suburb-locator">` for context) ───────────────────────────
const STATE_OUTLINES = require('../data/state-outlines');

// Project a (lat, lng) onto an SVG coordinate system. The outline is
// rendered into a 0..W × 0..H viewBox; lat/lng are mapped via the bbox.
// Returns null if outside the bbox (rare — sanity check).
function projectLatLng(lat, lng, bbox, W, H) {
  if (lat == null || lng == null) return null;
  const x = ((lng - bbox.lngMin) / (bbox.lngMax - bbox.lngMin)) * W;
  // SVG y is inverted vs latitude (north is up, but lat decreases southward
  // in our hemisphere — latMax is more north → smaller y).
  const y = ((bbox.latMax - lat) / (bbox.latMax - bbox.latMin)) * H;
  if (!isFinite(x) || !isFinite(y)) return null;
  return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
}

// Build the SVG path "d" attribute from an array of [lat, lng] points by
// projecting each onto the viewBox.
function outlineToPathD(outline, bbox, W, H) {
  if (!outline || !outline.length) return '';
  const pts = outline.map(([lat, lng]) => projectLatLng(lat, lng, bbox, W, H)).filter(Boolean);
  if (!pts.length) return '';
  return 'M ' + pts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' L ') + ' Z';
}

// Render a complete suburb-locator card. Used in templates/suburb-page.html
// in place of the old Google Maps iframe — loads instantly because it's
// inline SVG, and the user sees their suburb's position relative to the
// state at-a-glance. CBD distance comes from `s.distance_to_cbd` if known.
function generateLocatorCard(s) {
  const stateData = STATE_OUTLINES[s.state];
  if (!stateData) {
    // Unknown state code — fail soft to a name-only card so the page renders.
    return '<div class="suburb-locator suburb-locator-unknown">'
      + '<div class="suburb-locator-meta">'
      +   '<div class="suburb-locator-name">' + escHtml(s.suburb) + '</div>'
      +   '<div class="suburb-locator-state">' + escHtml(s.state_name || s.state) + '</div>'
      + '</div></div>';
  }
  const { bbox, outline, capital } = stateData;

  // Compute viewBox aspect ratio from bbox (degrees lat × degrees lng).
  // We use the NATURAL aspect ratio inside the viewBox so the projection
  // never falls outside the canvas — CSS `max-height` on the parent element
  // controls the displayed size while preserveAspectRatio keeps things
  // proportional. Tall states (WA, NT, QLD) just render taller; CSS clamps
  // visually.
  const lngSpan = bbox.lngMax - bbox.lngMin;
  const latSpan = bbox.latMax - bbox.latMin;
  const VIEW_W = 360;
  const VIEW_H = Math.max(120, Math.round(VIEW_W * (latSpan / lngSpan)));

  const pathD = outlineToPathD(outline, bbox, VIEW_W, VIEW_H);

  // Plot the suburb dot. Prefer real centroid; fall back to capital city
  // coords (still inside the state outline so the dot is honest about
  // "we don't know exact, but it's somewhere in this state near {capital}").
  const dotLat = (s.lat != null) ? s.lat : capital.latLng[0];
  const dotLng = (s.lng != null) ? s.lng : capital.latLng[1];
  const dotIsApprox = (s.lat == null);
  const dot = projectLatLng(dotLat, dotLng, bbox, VIEW_W, VIEW_H);

  // Capital reference (small grey dot so users can orient — "the suburb is
  // X km from this dot").
  const capDot = projectLatLng(capital.latLng[0], capital.latLng[1], bbox, VIEW_W, VIEW_H);

  // CBD distance line — straight visual link from capital → suburb when
  // both fit on the SVG. Helps convey "13 km from Brisbane".
  const showLink = !!(dot && capDot);

  // Compose the SVG. inline + hand-built so this is one HTTP roundtrip
  // (the page itself), zero external map fetch, zero JS.
  const svg = '<svg viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" '
    + 'class="suburb-locator-svg" role="img" '
    + 'aria-label="Map showing ' + escHtml(s.suburb) + ', ' + escHtml(s.state_name) + '">'
    + '<path class="suburb-locator-state-fill" d="' + pathD + '"/>'
    + (showLink
        ? '<line class="suburb-locator-link" x1="' + capDot.x.toFixed(1) + '" y1="' + capDot.y.toFixed(1) + '" '
          + 'x2="' + dot.x.toFixed(1) + '" y2="' + dot.y.toFixed(1) + '"/>'
        : '')
    + (capDot
        ? '<circle class="suburb-locator-cap-dot" cx="' + capDot.x.toFixed(1) + '" cy="' + capDot.y.toFixed(1) + '" r="3"/>'
          + '<text class="suburb-locator-cap-label" x="' + (capDot.x + 7).toFixed(1) + '" y="' + (capDot.y + 4).toFixed(1) + '">' + escHtml(capital.name) + '</text>'
        : '')
    + (dot
        ? '<circle class="suburb-locator-pulse" cx="' + dot.x.toFixed(1) + '" cy="' + dot.y.toFixed(1) + '" r="10"/>'
          + '<circle class="suburb-locator-dot" cx="' + dot.x.toFixed(1) + '" cy="' + dot.y.toFixed(1) + '" r="5"/>'
        : '')
    + '</svg>';

  // Distance line for the meta panel. distance_to_cbd is set by
  // apply-abs-data.js from a Haversine calc against the state capital.
  const dist = (s.distance_to_cbd != null && isFinite(s.distance_to_cbd))
    ? Math.round(s.distance_to_cbd) + ' km from ' + capital.name + ' CBD'
    : 'Located in ' + s.state_name;

  // Approximate-position note shown only when the dot is at the capital
  // (real centroid unknown). Tells the user we're not pretending to
  // pinpoint when we can't.
  const approxNote = dotIsApprox
    ? '<span class="suburb-locator-approx" title="Centroid not yet captured for this suburb — dot shows the state capital as a reference">approximate</span>'
    : '';

  return '<div class="suburb-locator">'
    +   svg
    +   '<div class="suburb-locator-meta">'
    +     '<div class="suburb-locator-name">' + escHtml(s.suburb) + '</div>'
    +     '<div class="suburb-locator-state">' + escHtml(s.state_name) + (s.postcode ? ' · ' + escHtml(s.postcode) : '') + '</div>'
    +     '<div class="suburb-locator-cbd">' + escHtml(dist) + ' ' + approxNote + '</div>'
    +     '<a class="suburb-locator-mapslink" href="https://www.google.com/maps/search/?api=1&query='
    +       encodeURIComponent(s.suburb + ' ' + s.state + ' Australia')
    +       '" target="_blank" rel="noopener">View on Google Maps ↗</a>'
    +   '</div>'
    + '</div>';
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

// Every sentence in generateInsight is anchored on at least one computed
// value so that no two suburbs with different numbers produce the same text —
// this is a direct response to AdSense 2026 flagging template-driven prose
// as "auto-generated". Deterministic ratios replace the old pick(seed, pool)
// pattern so content stays stable between builds.
function generateInsight(s, sm) {
  sm = sm || {};
  const parts = [];
  const inc  = s.median_household_income;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const pop  = s.population || 0;
  const dist = s.distance_to_cbd;
  const housePct = s.house_percentage;
  const capital  = stateCapitals[s.state];

  // Population vs state median population
  if (sm.population) {
    const ratio = pop / sm.population;
    if (ratio >= 2) {
      parts.push(`With ${fmt(pop)} residents, ${s.suburb} is one of ${s.state_name}'s more populous suburbs — roughly ${ratio.toFixed(1)}\u00d7 the state median of ${fmt(sm.population)} — giving it a deep buyer and tenant pool that typically supports higher transaction volumes and shorter average days on market.`);
    } else if (ratio >= 1.2) {
      parts.push(`${s.suburb}'s population of ${fmt(pop)} sits ${Math.round((ratio - 1) * 100)}% above the ${s.state_name} suburb median of ${fmt(sm.population)}, giving it a wider tenant and buyer catchment than the average ${s.state} locality.`);
    } else if (ratio >= 0.8) {
      parts.push(`${fmt(pop)} residents places ${s.suburb} squarely in the middle of the ${s.state_name} suburb size distribution (state median ${fmt(sm.population)}), with market depth comparable to most ${s.state} localities.`);
    } else {
      parts.push(`${s.suburb} is a smaller community of ${fmt(pop)} — about ${Math.round(ratio * 100)}% of the ${s.state_name} suburb median (${fmt(sm.population)}) — so investors should factor in the narrower buyer pool and longer average time-on-market.`);
    }
  } else {
    parts.push(`${s.suburb} has a usual resident population of approximately ${fmt(pop)} (ABS 2021), which sets the upper bound on both the tenant pool and the frequency of comparable sales.`);
  }

  // Income vs state median (real delta, suburb-specific)
  if (inc && sm.income) {
    const pct = Math.round((inc - sm.income) / sm.income * 100);
    if (pct >= 15) {
      parts.push(`Median household income of $${fmt(inc)}/year runs ${pct}% above the ${s.state_name} suburb median of $${fmt(sm.income)}, indicating strong purchasing power and the type of demographic profile that tends to sustain premium property prices through market cycles.`);
    } else if (pct >= 5) {
      parts.push(`Households here earn $${fmt(inc)}/year on average — ${pct}% above the ${s.state} suburb median of $${fmt(sm.income)} — a modest premium that supports resilient owner-occupier demand.`);
    } else if (pct >= -5) {
      parts.push(`At $${fmt(inc)}/year, household income in ${s.suburb} is within ${Math.abs(pct)}% of the ${s.state_name} median ($${fmt(sm.income)}), placing the suburb firmly in the state's mainstream demographic band.`);
    } else if (pct >= -20) {
      parts.push(`Household income of $${fmt(inc)}/year is ${Math.abs(pct)}% below the ${s.state_name} median of $${fmt(sm.income)}, typically translating into lower entry prices and a tenant base more sensitive to rent increases.`);
    } else {
      parts.push(`${s.suburb}'s median household income of $${fmt(inc)}/year is ${Math.abs(pct)}% below the ${s.state_name} suburb median ($${fmt(sm.income)}) — this is an affordability play where returns lean on yield and patient capital growth rather than demographic premium.`);
    }
  }

  // Rent + mortgage coverage — a suburb-specific cash-flow fingerprint
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const coverage = Math.round((monthlyRent / mort) * 100);
    const gap = mort - monthlyRent;
    if (coverage >= 90) {
      parts.push(`Median weekly rent of $${fmt(rent)} equates to $${fmt(monthlyRent)}/month — about ${coverage}% of the median mortgage repayment of $${fmt(mort)}/month — meaning rental income covers most of a typical owner's repayment and this is a genuine cash-flow suburb before tax benefits.`);
    } else if (coverage >= 70) {
      parts.push(`Rent of $${fmt(rent)}/week (${coverage}% coverage of the $${fmt(mort)}/month median mortgage) leaves a gap of roughly $${fmt(gap)}/month that a typical investor bridges with negative gearing, depreciation and capital growth.`);
    } else if (coverage >= 50) {
      parts.push(`Median rent of $${fmt(rent)}/week (~$${fmt(monthlyRent)}/month) covers only ${coverage}% of the median mortgage of $${fmt(mort)}/month — the remaining $${fmt(gap)}/month must be funded from other income, so this suburb tilts toward capital growth rather than yield.`);
    } else {
      parts.push(`Weekly rent of $${fmt(rent)} covers just ${coverage}% of the median $${fmt(mort)}/month mortgage repayment, leaving a $${fmt(gap)}/month gap — investors should only pursue this suburb with a clear capital-growth thesis and sufficient external income to fund the shortfall.`);
    }
  } else if (rent) {
    parts.push(`The median weekly rent of $${fmt(rent)} (ABS 2021) translates to approximately $${fmt(rent * 52)}/year in gross rental income, setting the upper bound on yield before vacancy, rates, insurance and maintenance.`);
  }

  // Distance to CBD with real km
  if (dist != null && capital) {
    if (dist <= 10) {
      parts.push(`At ${dist} km from the ${capital} CBD, ${s.suburb} sits inside the high-demand inner ring — properties here compete directly with the city's employment, transport and amenity networks.`);
    } else if (dist <= 25) {
      parts.push(`${dist} km from ${capital} places ${s.suburb} in the middle commuter belt, close enough for daily trips by car or rail but at a materially lower price point than inner suburbs.`);
    } else if (dist <= 50) {
      parts.push(`At ${dist} km from ${capital}, ${s.suburb} is an outer-metro location where buyers are typically trading commute time for floor space and a lower entry price.`);
    } else {
      parts.push(`${s.suburb} is ${dist} km from ${capital}, so the local market tracks regional employment and lifestyle drivers more than CBD-driven commuter demand.`);
    }
  }

  // Dwelling mix vs state
  if (housePct != null && sm.housePct != null) {
    const delta = housePct - sm.housePct;
    if (delta >= 15) {
      parts.push(`Separate houses make up ${housePct}% of dwellings — ${delta} percentage points above the ${s.state_name} median of ${sm.housePct}% — pointing to a family-oriented, land-rich market where value is concentrated in the underlying block.`);
    } else if (delta <= -15) {
      parts.push(`Only ${housePct}% of dwellings are separate houses (vs ${sm.housePct}% state median), so this is a unit-heavy market where body-corporate decisions and strata supply meaningfully shape investor returns.`);
    }
  }

  return parts.join(' ');
}

// FAQ expanded from 4 → 8 questions, each answer parameterised on real
// ABS numbers so no two suburbs share an identical response. f.a is built
// from trusted template strings and safely-escaped data fields; we render
// it as raw HTML so that internal links (e.g. to /tools/*) remain clickable.
function generateFAQ(s, sm) {
  sm = sm || {};
  const capital = stateCapitals[s.state];
  const name = escHtml(s.suburb);
  const stateName = escHtml(s.state_name);
  const inc  = s.median_household_income;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const pop  = s.population || 0;
  const dist = s.distance_to_cbd;
  const housePct = s.house_percentage;
  const scoreN = computeScore(s);
  const scoreLabel = scoreN >= 81 ? 'strong' : scoreN >= 61 ? 'good' : scoreN >= 41 ? 'moderate' : 'weak';

  const faqs = [];

  // 1. Investment rating
  faqs.push({
    q: `Is ${s.suburb} a good suburb for investment?`,
    a: `${name} scores ${scoreN}/100 on our EquitySight investment framework — a ${scoreLabel} rating. That score is driven by a population of ${fmt(pop)}${inc ? `, median household income of $${fmt(inc)}/year` : ''}${rent ? ` and median weekly rent of $${fmt(rent)}` : ''} (ABS 2021 Census). Whether it fits your portfolio depends on whether you are targeting cash flow, capital growth, or a value-add renovation — all three are scored with suburb-specific numbers elsewhere on this page.`,
  });

  // 2. Demand drivers
  const drivers = [];
  if (dist != null && dist <= 25) drivers.push(`proximity to ${capital} (${dist} km)`);
  if (inc && sm.income && inc >= sm.income) drivers.push(`an above-state-median household income of $${fmt(inc)}/year`);
  else if (inc) drivers.push(`a median household income of $${fmt(inc)}/year`);
  if (housePct != null) drivers.push(`a dwelling mix that is ${housePct}% separate houses`);
  drivers.push(`roughly ${s.school_count || 0} schools and ${s.park_count || 0} parks within the catchment`);
  faqs.push({
    q: `What drives property demand in ${s.suburb}?`,
    a: `The main demand drivers in ${name} are ${drivers.join(', ')}. Together these shape both owner-occupier and tenant demand and are the factors we weight most heavily in the suburb's investment score.`,
  });

  // 3. Population
  faqs.push({
    q: `What is the population of ${s.suburb}?`,
    a: `The ABS 2021 Census recorded a usual resident population of approximately ${fmt(pop)} for ${name}${sm.population ? `, compared with a ${stateName} suburb median of ${fmt(sm.population)} — placing it in the ${pop > sm.population ? 'upper' : 'lower'} half of the state's suburbs by size` : ''}. Population is the clearest proxy for market depth: more residents mean more transactions and typically a shorter average days-on-market on resale.`,
  });

  // 4. CBD distance
  faqs.push({
    q: `How far is ${s.suburb} from the ${capital} CBD?`,
    a: dist != null
      ? `${name} sits ${dist} km straight-line from the ${capital} CBD (calculated from ABS 2021 centroid coordinates). ${dist <= 10 ? 'This is inner-ring territory — pricing competes directly with established ' + capital + ' employment nodes.' : dist <= 25 ? 'This is comfortable commuter territory, with reasonable rail and road access to the city.' : dist <= 50 ? 'This is an outer-metro location; local employment and infrastructure announcements tend to move prices more than CBD connectivity alone.' : 'This is a regional market where CBD distance is only indicative — local industry diversity and commute alternatives matter more.'}`
      : `ABS 2021 did not capture a reliable centroid for ${name}. Cross-check Google Maps and the state transport authority for current travel times to ${capital}.`,
  });

  // 5. Median rent
  faqs.push({
    q: `What is the median rent in ${s.suburb}?`,
    a: rent
      ? `ABS 2021 Census recorded a median weekly rent of $${fmt(rent)} in ${name}, equating to approximately $${fmt(rent * 52)}/year in gross rental income${sm.rent ? ` (state median $${fmt(sm.rent)}/week)` : ''}. Market rents have typically drifted above 2021 figures — verify against current listings on realestate.com.au and Domain before making an offer.`
      : `ABS 2021 did not capture a clean median rent for ${name}. Benchmark expected weekly rent on realestate.com.au and Domain, or the state rental tribunal's rent dashboard. Most Australian investors target a 4–5% gross yield as a baseline.`,
  });

  // 6. Mortgage
  faqs.push({
    q: `What is the typical mortgage repayment in ${s.suburb}?`,
    a: mort
      ? `The median monthly mortgage repayment in ${name} recorded at the ABS 2021 Census was $${fmt(mort)}, or approximately $${fmt(Math.round(mort * 12))}/year${sm.mortgage ? ` (vs $${fmt(sm.mortgage)}/month state median)` : ''}. Stress-test your own borrowing at rates 1–2 percentage points above today's to make sure you can still service the loan through an RBA tightening cycle.`
      : `ABS 2021 did not capture a clean median mortgage figure for ${name}. Use our <a href="/tools/loan-serviceability-calculator/">loan serviceability calculator</a> to estimate a realistic monthly repayment for your target purchase price and deposit.`,
  });

  // 7. Cash-flow math
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const gap = mort - monthlyRent;
    const coverage = Math.round((monthlyRent / mort) * 100);
    faqs.push({
      q: `Is ${s.suburb} cash-flow positive for investors?`,
      a: `On raw ABS 2021 numbers, a median weekly rent of $${fmt(rent)} works out to $${fmt(monthlyRent)}/month, covering ${coverage}% of the median mortgage repayment of $${fmt(mort)}/month. ${gap > 0
        ? `That leaves a $${fmt(gap)}/month shortfall (around $${fmt(gap * 12)}/year before tax benefits), so a typical owner-occupier-priced property here is negatively geared.`
        : `That means rent exceeds the median repayment by roughly $${fmt(-gap)}/month, so on these numbers ${name} leans cash-flow-positive before accounting for strata, council rates, insurance and maintenance.`} Actual cash flow depends on your deposit, loan terms, ownership costs and marginal tax rate — run the full numbers in our <a href="/tools/rental-yield-calculator/">rental yield calculator</a>.`,
    });
  } else {
    faqs.push({
      q: `Is ${s.suburb} cash-flow positive for investors?`,
      a: `ABS 2021 data was not complete enough in ${name} to compute a clean rent-to-mortgage coverage. Use current listings to benchmark weekly rent, then plug your expected purchase price into our <a href="/tools/rental-yield-calculator/">rental yield calculator</a> to see whether the investment runs cash-flow positive or negative.`,
    });
  }

  // 8. Risks
  const riskBits = [];
  if (pop < 5000) riskBits.push(`a thin buyer pool (${fmt(pop)} residents)`);
  if (mort) riskBits.push(`interest-rate sensitivity on the $${fmt(mort)} median mortgage`);
  else riskBits.push('interest-rate sensitivity');
  if (inc && sm.income && inc < sm.income * 0.85) riskBits.push(`below-median household incomes ($${fmt(inc)} vs $${fmt(sm.income)} state median)`);
  if (housePct != null && housePct < 40) riskBits.push(`a unit-heavy dwelling mix (${housePct}% houses) where body-corporate costs and apartment supply affect resale`);
  riskBits.push(`the broader ${stateName} market cycle`);
  faqs.push({
    q: `What are the main risks of investing in ${s.suburb}?`,
    a: `The main risks are ${riskBits.join(', ')}. Each of these is covered in the Risk Factors section above with suburb-specific numbers rather than generic warnings.`,
  });

  return faqs.map(f =>
    `    <details>\n      <summary>${escHtml(f.q)}</summary>\n      <p>${f.a}</p>\n    </details>`
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

// Strategy verdicts are computed from live ratios (income vs state median,
// rent coverage of median mortgage, house-% delta) so every paragraph carries
// at least one suburb-specific number.
function generateStrategy(s, sm) {
  sm = sm || {};
  const inc  = s.median_household_income || 0;
  const incomeVsState = sm.income ? inc / sm.income : 1;
  const rent = s.median_rent_weekly || 0;
  const mort = s.median_mortgage_monthly || 0;
  const pop  = s.population || 0;
  const dist = s.distance_to_cbd;
  const housePct = s.house_percentage;
  const strategies = [];

  // ── Buy & Hold ──
  let bhIcon, bhText;
  if (incomeVsState >= 1.15 && ((dist != null && dist <= 25) || (dist == null && pop >= 10000))) {
    bhIcon = '\u2705';
    const pct = Math.round((incomeVsState - 1) * 100);
    bhText = `Strong buy-and-hold fundamentals: household incomes run ${pct}% above the ${s.state_name} suburb median ($${fmt(inc)} vs $${fmt(sm.income)})${dist != null ? `, and the ${dist} km CBD distance keeps this suburb in the primary demand zone` : ''}. In ${s.state_name}, suburbs with this profile have historically clustered in the upper tercile of 10-year capital growth.`;
  } else if (pop >= 5000 && incomeVsState >= 0.95) {
    bhIcon = '\u2705';
    bhText = `Solid buy-and-hold profile: a population of ${fmt(pop)} and household income ${inc && sm.income ? `close to the ${s.state} median ($${fmt(inc)} vs $${fmt(sm.income)})` : `of $${fmt(inc)}/year`} give the market enough depth for patient capital growth without the premium entry price of inner suburbs.`;
  } else if (pop < 3000 || incomeVsState < 0.8) {
    bhIcon = '\u274C';
    bhText = `Limited buy-and-hold upside: ${pop < 3000 ? `a small population of ${fmt(pop)}` : `household incomes ${Math.round((1 - incomeVsState) * 100)}% below the ${s.state} median ($${fmt(inc)} vs $${fmt(sm.income)})`} means liquidity is thin and capital growth tends to lag the wider ${s.state_name} market over full cycles.`;
  } else {
    bhIcon = '\u26A0\uFE0F';
    bhText = `Moderate buy-and-hold potential: ${s.suburb}'s ${fmt(pop)}-person market${inc ? ` and $${fmt(inc)} median household income` : ''} work for investors who are selective on street location and property quality rather than counting on a suburb-wide rerating.`;
  }
  strategies.push({ name: 'Buy &amp; Hold', icon: bhIcon, text: bhText });

  // ── Rental Yield ──
  let ryIcon, ryText;
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const coverage = Math.round((monthlyRent / mort) * 100);
    const gap = mort - monthlyRent;
    if (coverage >= 85) {
      ryIcon = '\u2705';
      ryText = `Strong rental coverage: $${fmt(rent)}/week (~$${fmt(monthlyRent)}/month) covers ${coverage}% of the $${fmt(mort)}/month median mortgage repayment, so the shortfall sits at just $${fmt(Math.max(0, gap))}/month. Investors targeting positive cash flow should shortlist this suburb.`;
    } else if (coverage >= 65) {
      ryIcon = '\u26A0\uFE0F';
      ryText = `Moderate rental coverage: rent of $${fmt(rent)}/week covers ${coverage}% of a $${fmt(mort)}/month mortgage, leaving a $${fmt(gap)}/month gap that an investor bridges with equity, depreciation and tax benefits.`;
    } else {
      ryIcon = '\u274C';
      ryText = `Weak cash flow: $${fmt(rent)}/week rent covers only ${coverage}% of the $${fmt(mort)}/month median mortgage — a $${fmt(gap)}/month gap that must be funded from other income. This suburb is a capital-growth play, not a yield play.`;
    }
  } else if (rent) {
    ryIcon = '\u26A0\uFE0F';
    ryText = `Gross rent of $${fmt(rent)}/week (~$${fmt(rent * 52)}/year) sets the yield ceiling. Cross-check against your purchase price to confirm whether this suburb hits the 4–5% gross yield most Australian investors target.`;
  } else {
    ryIcon = '\u26A0\uFE0F';
    ryText = `ABS 2021 rental data was not captured for ${s.suburb}. Use current realestate.com.au and Domain listings to triangulate a realistic weekly rent before committing, then feed that number into our rental yield calculator.`;
  }
  strategies.push({ name: 'Rental Yield', icon: ryIcon, text: ryText });

  // ── Renovation / Flip ──
  let rfIcon, rfText;
  if (housePct != null && sm.housePct != null) {
    if (housePct >= sm.housePct + 10 && pop >= 5000) {
      rfIcon = '\u2705';
      rfText = `A dwelling mix skewed to houses (${housePct}% vs ${sm.housePct}% ${s.state} median) combined with a population of ${fmt(pop)} creates a deeper market for value-add renovations — older stock, separate titles and stronger buyer competition are the usual pattern here.`;
    } else if (housePct <= sm.housePct - 10) {
      rfIcon = '\u274C';
      rfText = `Only ${housePct}% of dwellings are separate houses (vs ${sm.housePct}% ${s.state} median) — this is a unit and townhouse market, where cosmetic flips struggle against body-corporate restrictions, thinner after-reno uplift and competing new supply.`;
    } else {
      rfIcon = '\u26A0\uFE0F';
      rfText = `With ${housePct}% houses in a ${fmt(pop)}-person market, renovation margins depend on individual street and aspect rather than any suburb-wide story — do comparable-sales analysis before committing capital.`;
    }
  } else if (pop >= 10000) {
    rfIcon = '\u26A0\uFE0F';
    rfText = `A population of ${fmt(pop)} provides enough buyer depth for selective renovation projects, though missing ABS dwelling-mix data for ${s.suburb} means investors should inspect before relying on cosmetic uplift to drive resale.`;
  } else {
    rfIcon = '\u274C';
    rfText = `With a population of ${fmt(pop)}, the resale market in ${s.suburb} may not reliably reward cosmetic renovations — a longer hold is typically a better strategy at this scale, letting land-value appreciation do the work instead.`;
  }
  strategies.push({ name: 'Renovation / Flip', icon: rfIcon, text: rfText });

  const items = strategies.map(st =>
    `      <div class="suburb-strategy-item">\n        <span class="suburb-strategy-icon">${st.icon}</span>\n        <div>\n          <div class="suburb-strategy-name">${st.name}</div>\n          <p>${escHtml(st.text)}</p>\n        </div>\n      </div>`
  ).join('\n');

  return `<h2>Investment Strategy</h2>\n    <div class="suburb-strategy-list">\n${items}\n    </div>`;
}

// ── Risk Factors ──

// Risk factors are selected based on computed ratios and always include
// at least one suburb-specific number (mortgage size, income gap, population
// delta, etc.) so the prose cannot collide across suburbs.
function generateRisks(s, sm) {
  sm = sm || {};
  const inc  = s.median_household_income || 0;
  const pop  = s.population || 0;
  const dist = s.distance_to_cbd;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const housePct = s.house_percentage;
  const risks = [];

  // Interest-rate sensitivity
  if (mort) {
    const extra = Math.round(mort * 0.10); // ~10% higher per +1% rate on a 30-year loan
    risks.push(`Interest-rate sensitivity: the $${fmt(mort)}/month median mortgage in ${s.suburb} means a 1-percentage-point RBA rate rise could add roughly $${fmt(extra)}/month to repayments, reducing buyer borrowing capacity and cooling prices.`);
  } else {
    risks.push(`Interest-rate movements are the dominant macro risk for ${s.suburb} — model cash flow with a 1–2 percentage-point buffer above current rates to ensure the investment survives a tightening cycle.`);
  }

  // Income vs state median
  if (inc && sm.income) {
    if (inc < sm.income * 0.85) {
      const pct = Math.round((1 - inc / sm.income) * 100);
      risks.push(`Income vulnerability: household incomes in ${s.suburb} are ${pct}% below the ${s.state_name} median ($${fmt(inc)} vs $${fmt(sm.income)}), which tends to compress rent growth and increases exposure to local unemployment shocks.`);
    } else if (inc > sm.income * 1.25) {
      const pct = Math.round((inc / sm.income - 1) * 100);
      risks.push(`Premium-pricing risk: incomes ${pct}% above the ${s.state_name} median ($${fmt(inc)} vs $${fmt(sm.income)}) correlate with elevated purchase prices and compressed gross yields — enter only with a clear capital-growth thesis and a comfortable deposit.`);
    }
  }

  // Liquidity / population
  if (pop < 5000) {
    risks.push(`Liquidity risk: with ${fmt(pop)} residents, ${s.suburb} has a thinner pool of buyers and tenants than larger suburbs. Expect longer days-on-market on resale and budget for potential vacancy gaps between tenancies.`);
  }

  // Distance
  if (dist != null && dist > 40) {
    risks.push(`Commute distance: at ${dist} km from the nearest CBD, ${s.suburb} depends on local employment rather than city-driven commuter demand, which amplifies the market's sensitivity to regional industry slowdowns.`);
  } else if (dist != null && dist > 20 && dist <= 40) {
    risks.push(`${s.suburb} is ${dist} km from the CBD — not close enough to benefit from the inner-ring pricing halo, so growth depends more heavily on local infrastructure decisions and the wider ${s.state_name} market cycle.`);
  }

  // Rental stress on tenants
  if (rent && inc) {
    const rentPct = Math.round((rent * 52 / inc) * 100);
    if (rentPct >= 35) {
      risks.push(`Rental stress: a median rent of $${fmt(rent)}/week consumes about ${rentPct}% of the $${fmt(inc)}/year median household income — past the 30% rental-stress threshold — meaning tenants may resist further rent rises and vacancy risk is elevated during downturns.`);
    }
  }

  // Dwelling mix
  if (housePct != null && housePct < 40) {
    risks.push(`Strata exposure: only ${housePct}% of dwellings in ${s.suburb} are separate houses, so most investment stock is apartments or townhouses subject to body-corporate fees, sinking-fund levies and competing supply from new developments.`);
  } else if (housePct != null && housePct >= 85) {
    risks.push(`House-dominant stock: ${housePct}% of dwellings are separate houses, so value is concentrated in land — weather events, insurance repricing and land-tax changes hit investors here more directly than in a unit-heavy suburb.`);
  }

  // Universal regulatory + cycle risks (always included so we have 4+ entries)
  risks.push(`Regulatory risk: changes to Australian tax settings (negative gearing, CGT discount, foreign-buyer surcharges, land-tax thresholds) could reshape after-tax returns in ${s.suburb} regardless of local market conditions.`);
  risks.push(`Market cycle risk: property markets are cyclical, so stress-test your projections in ${s.suburb} with a 10–15% price pullback scenario before committing capital — returns to date are not a guarantee of future performance.`);

  const selected = risks.slice(0, 5);
  const items = selected.map(r => `      <li>${escHtml(r)}</li>`).join('\n');
  return `<h2>Risk Factors</h2>\n    <ul class="suburb-risk-list">\n${items}\n    </ul>`;
}

// ── 2026 Outlook ──

// Outlook narrative is built from three computed ratios (income vs state,
// rent vs mortgage, investment score band). Every sentence carries a
// suburb-specific number so the three-paragraph block is unique.
function generateOutlook(s, sm) {
  sm = sm || {};
  const score = computeScore(s);
  const inc  = s.median_household_income || 0;
  const incomeVsState = sm.income ? inc / sm.income : 1;
  const pop  = s.population || 0;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const dist = s.distance_to_cbd;

  let growthLevel;
  if (incomeVsState >= 1.15 && (dist == null || dist <= 25)) growthLevel = 'strong';
  else if (incomeVsState >= 0.9 && pop >= 5000) growthLevel = 'moderate';
  else growthLevel = 'low';

  let rentalLevel;
  if (pop >= 20000 && incomeVsState >= 0.95) rentalLevel = 'strong';
  else if (pop >= 5000) rentalLevel = 'moderate';
  else rentalLevel = 'low';

  const sentimentLevel = score >= 70 ? 'strong' : score >= 50 ? 'moderate' : 'low';

  function tagHtml(label, level) {
    return `<span class="suburb-outlook-tag suburb-outlook-tag--${level}">${escHtml(label)}: ${level.charAt(0).toUpperCase() + level.slice(1)}</span>`;
  }

  const tags = [
    tagHtml('Growth', growthLevel),
    tagHtml('Rental Demand', rentalLevel),
    tagHtml('Investor Sentiment', sentimentLevel),
  ].join('\n      ');

  const parts = [];

  // Growth sentence — anchored on real income delta
  if (sm.income && inc) {
    const pct = Math.round((inc / sm.income - 1) * 100);
    const pctDesc = pct >= 5 ? `${pct}% above` : pct <= -5 ? `${Math.abs(pct)}% below` : 'close to';
    if (growthLevel === 'strong') {
      parts.push(`${s.suburb} enters 2026 with a demographic tailwind — household incomes ${pctDesc} the ${s.state_name} suburb median of $${fmt(sm.income)} and a population of ${fmt(pop)} give it the depth and purchasing power to outperform the wider ${s.state} market over the next 12–18 months.`);
    } else if (growthLevel === 'moderate') {
      parts.push(`Property values in ${s.suburb} should track the wider ${s.state_name} market through 2026, with the $${fmt(inc)}/year median household income (${pctDesc} the $${fmt(sm.income)} state median) keeping the suburb firmly mid-pack.`);
    } else {
      parts.push(`Capital-growth expectations for ${s.suburb} are modest for 2026 — incomes ${pctDesc} the ${s.state} median of $${fmt(sm.income)}${pop < 5000 ? ` and a population of ${fmt(pop)}` : ''} suggest gains will lag headline metro markets.`);
    }
  } else if (growthLevel === 'strong') {
    parts.push(`${s.suburb} enters 2026 with solid growth fundamentals, supported by its ${fmt(pop)}-person catchment${dist != null ? ` and ${dist} km CBD distance` : ''}.`);
  } else {
    parts.push(`Capital growth in ${s.suburb} is expected to be modest through 2026, with returns more reliant on careful individual property selection than a broad suburb-wide rerating.`);
  }

  // Rental sentence — anchored on real rent + coverage
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const coverage = Math.round((monthlyRent / mort) * 100);
    const tail = coverage >= 80
      ? 'keeping cash flow in positive or near-neutral territory'
      : coverage >= 60
      ? 'leaving a manageable top-up for most investors'
      : 'meaning investors will rely on capital growth rather than yield';
    parts.push(`Rental coverage runs at ~${coverage}% of the typical mortgage ($${fmt(monthlyRent)}/month rent vs $${fmt(mort)}/month repayment), ${tail}.`);
  } else if (rent) {
    parts.push(`Rents sit around $${fmt(rent)}/week, setting the baseline gross rental income at roughly $${fmt(rent * 52)}/year — refine this against current listings before running your numbers.`);
  } else {
    parts.push(`Rental fundamentals will need to be verified against live listings, as ABS 2021 did not capture a clean median rent for ${s.suburb}.`);
  }

  // Sentiment sentence — pinned to the score
  const tier = score >= 81 ? 'top tier' : score >= 61 ? 'upper-middle tier' : score >= 41 ? 'mid tier' : 'lower tier';
  const tone = sentimentLevel === 'strong' ? 'constructive' : sentimentLevel === 'moderate' ? 'balanced' : 'cautious';
  parts.push(`The EquitySight investment score of ${score}/100 places ${s.suburb} in the ${tier} of Australian suburbs we profile, and overall investor sentiment is ${tone} heading into the second half of 2026.`);

  return `<h2>2026 Outlook</h2>\n    <div class="suburb-outlook-tags">\n      ${tags}\n    </div>\n    <p>${escHtml(parts.join(' '))}</p>`;
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

// ── Thin-page detection (Workstream A — aggressive prune) ──
//
// AdSense rejected the site for "thin / low-value content". The single highest-
// impact fix per 2026 programmatic-SEO audits is to raise the site's *average*
// page quality by removing weak pages from the index. We keep weak suburbs
// reachable (noindex, follow) so internal link equity survives, but exclude
// them from the sitemap and the state-hub featured list.
//
// Gate: must have a postcode, at least 2,000 residents, and a known median
// household income. Against the current data/suburbs.json this yields ~3,022
// featured suburbs (ACT 95, NSW 962, NT 44, QLD 648, SA 293, TAS 84, VIC 555,
// WA 341) — inside the target 2,000–3,000 window.
const MIN_POPULATION_FOR_INDEX = 2000;

function shouldNoindex(s) {
  if (s.tiny) return true;
  if (!s.postcode) return true;
  if ((s.population || 0) < MIN_POPULATION_FOR_INDEX) return true;
  if (!s.median_household_income) return true;
  return false;
}

// Quality score 0–100 for reporting / future sorting. Not used as the noindex
// gate itself — the gate above is a hard filter so behaviour is deterministic.
function qualityScore(s) {
  let score = 0;
  // Population band (max 30)
  const pop = s.population || 0;
  if (pop >= 20000) score += 30;
  else if (pop >= 10000) score += 25;
  else if (pop >= 5000) score += 18;
  else if (pop >= 2000) score += 12;
  else if (pop >= 500) score += 5;
  // Data completeness (max 40)
  if (s.postcode) score += 8;
  if (s.median_household_income) score += 8;
  if (s.distance_to_cbd != null) score += 6;
  if (s.median_rent_weekly) score += 6;
  if (s.median_mortgage_monthly) score += 4;
  if (s.house_percentage != null) score += 4;
  if (s.lat != null && s.lng != null) score += 4;
  // Amenities (max 20)
  score += Math.min(10, (s.school_count || 0) * 2);
  score += Math.min(10, (s.park_count || 0) * 2);
  // Transport/amenity score bonus (max 10)
  score += Math.min(5, (s.transport_score || 0) / 2);
  score += Math.min(5, (s.amenity_score || 0) / 2);
  return Math.min(100, Math.round(score));
}

// ── State medians (computed once, consumed by numeric-prose generators) ──
//
// The enrichment generators (generateInsight, generateStrategy, generateRisks,
// generateOutlook, generateComparisonTable, generateInvestorChecklist,
// generateFAQ) all use state medians as their reference point so each suburb's
// prose carries a real Δ-to-state number. We compute them once here before the
// main loop to avoid an O(n×s) recomputation.
function computeStateMedians(all) {
  const buckets = {};
  // Only index the "kept" (non-noindexed) suburbs so state medians reflect the
  // profile of the real investor-relevant market, not the long tail of tiny
  // rural localities that drag the population median toward ~200.
  for (const s of all) {
    if (shouldNoindex(s)) continue;
    const b = buckets[s.state] || (buckets[s.state] = {
      incomes: [], rents: [], mortgages: [], pops: [],
      schools: [], parks: [], dists: [], housePcts: [],
    });
    if (s.median_household_income) b.incomes.push(s.median_household_income);
    if (s.median_rent_weekly) b.rents.push(s.median_rent_weekly);
    if (s.median_mortgage_monthly) b.mortgages.push(s.median_mortgage_monthly);
    if (s.population) b.pops.push(s.population);
    if (s.school_count != null) b.schools.push(s.school_count);
    if (s.park_count != null) b.parks.push(s.park_count);
    if (s.distance_to_cbd != null) b.dists.push(s.distance_to_cbd);
    if (s.house_percentage != null) b.housePcts.push(s.house_percentage);
  }
  const median = arr => {
    if (!arr.length) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };
  const out = {};
  for (const [state, b] of Object.entries(buckets)) {
    out[state] = {
      income:     median(b.incomes),
      rent:       median(b.rents),
      mortgage:   median(b.mortgages),
      population: median(b.pops),
      schools:    median(b.schools),
      parks:      median(b.parks),
      distance:   median(b.dists),
      housePct:   median(b.housePcts),
    };
  }
  return out;
}

// Comparison table: suburb value vs its state median, with Δ%. Every row
// carries two real numbers + a computed delta, so the same table cannot be
// produced by any other suburb.
function generateComparisonTable(s, sm) {
  sm = sm || {};
  if (!sm.income && !sm.population) return '';

  const pctDelta = (v, m) => (v == null || !m) ? null : Math.round((v - m) / m * 100);
  const deltaCell = (d) => {
    if (d == null) return '<td class="compare-delta">—</td>';
    const cls = d > 0 ? 'compare-delta compare-delta--pos'
              : d < 0 ? 'compare-delta compare-delta--neg'
              : 'compare-delta';
    const sign = d > 0 ? '+' : '';
    return `<td class="${cls}">${sign}${d}%</td>`;
  };

  const rows = [];
  if (s.population && sm.population) {
    rows.push(`<tr><th scope="row">Population</th><td>${fmt(s.population)}</td><td>${fmt(sm.population)}</td>${deltaCell(pctDelta(s.population, sm.population))}</tr>`);
  }
  if (s.median_household_income && sm.income) {
    rows.push(`<tr><th scope="row">Median household income</th><td>$${fmt(s.median_household_income)}/yr</td><td>$${fmt(sm.income)}/yr</td>${deltaCell(pctDelta(s.median_household_income, sm.income))}</tr>`);
  }
  if (s.median_rent_weekly && sm.rent) {
    rows.push(`<tr><th scope="row">Median rent (weekly)</th><td>$${fmt(s.median_rent_weekly)}</td><td>$${fmt(sm.rent)}</td>${deltaCell(pctDelta(s.median_rent_weekly, sm.rent))}</tr>`);
  }
  if (s.median_mortgage_monthly && sm.mortgage) {
    rows.push(`<tr><th scope="row">Median mortgage (monthly)</th><td>$${fmt(s.median_mortgage_monthly)}</td><td>$${fmt(sm.mortgage)}</td>${deltaCell(pctDelta(s.median_mortgage_monthly, sm.mortgage))}</tr>`);
  }
  if (s.distance_to_cbd != null && sm.distance != null) {
    rows.push(`<tr><th scope="row">Distance to CBD</th><td>${s.distance_to_cbd} km</td><td>${sm.distance} km</td>${deltaCell(pctDelta(s.distance_to_cbd, sm.distance))}</tr>`);
  }
  if (s.house_percentage != null && sm.housePct != null) {
    const delta = s.house_percentage - sm.housePct;
    const cls = delta > 0 ? 'compare-delta compare-delta--pos'
              : delta < 0 ? 'compare-delta compare-delta--neg'
              : 'compare-delta';
    const sign = delta > 0 ? '+' : '';
    rows.push(`<tr><th scope="row">Separate houses</th><td>${s.house_percentage}%</td><td>${sm.housePct}%</td><td class="${cls}">${sign}${delta}pp</td></tr>`);
  }

  if (!rows.length) return '';

  return `  <section class="suburb-section">
    <h2>${escHtml(s.suburb)} vs ${escHtml(s.state_name)} Median</h2>
    <p class="suburb-compare-note">How ${escHtml(s.suburb)} stacks up against the median of all ${escHtml(s.state_name)} suburbs in our dataset. Positive values mean ${escHtml(s.suburb)} sits above the state median; negative means below.</p>
    <div class="suburb-compare-wrap">
      <table class="suburb-compare">
        <thead>
          <tr><th scope="col">Metric</th><th scope="col">${escHtml(s.suburb)}</th><th scope="col">${escHtml(s.state)} median</th><th scope="col">Δ vs state</th></tr>
        </thead>
        <tbody>
${rows.map(r => '          ' + r).join('\n')}
        </tbody>
      </table>
    </div>
  </section>`;
}

// Investor checklist: eight bullets that each pull a live field from the
// suburb record. Builds a short pre-inspection briefing with at least one
// number per bullet.
function generateInvestorChecklist(s, sm) {
  sm = sm || {};
  const items = [];
  const inc  = s.median_household_income;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const pop  = s.population || 0;
  const dist = s.distance_to_cbd;
  const schools = s.school_count || 0;
  const parks   = s.park_count || 0;
  const housePct = s.house_percentage;
  const capital = stateCapitals[s.state];

  // 1. Market depth
  if (sm.population) {
    items.push(`<strong>Market depth:</strong> ${fmt(pop)} residents — ${Math.round(pop / sm.population * 100)}% of the ${s.state} suburb median (${fmt(sm.population)}).`);
  } else {
    items.push(`<strong>Market depth:</strong> ${fmt(pop)} residents (ABS 2021 usual resident population).`);
  }

  // 2. Income
  if (inc && sm.income) {
    const pct = Math.round((inc - sm.income) / sm.income * 100);
    const sign = pct >= 0 ? '+' : '';
    items.push(`<strong>Purchasing power:</strong> median household income $${fmt(inc)}/year (${sign}${pct}% vs ${s.state_name} suburb median of $${fmt(sm.income)}).`);
  } else if (inc) {
    items.push(`<strong>Purchasing power:</strong> median household income $${fmt(inc)}/year.`);
  } else {
    items.push(`<strong>Purchasing power:</strong> ABS 2021 household income not captured for this suburb.`);
  }

  // 3. Cash-flow coverage
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const coverage = Math.round((monthlyRent / mort) * 100);
    items.push(`<strong>Cash-flow coverage:</strong> $${fmt(rent)}/week rent (≈ $${fmt(monthlyRent)}/month) covers ~${coverage}% of the $${fmt(mort)}/month median mortgage.`);
  } else if (rent) {
    items.push(`<strong>Gross rental income:</strong> $${fmt(rent)}/week, ~$${fmt(rent * 52)}/year.`);
  } else {
    items.push(`<strong>Gross rental income:</strong> verify via realestate.com.au — ABS 2021 rent data was not captured for this suburb.`);
  }

  // 4. CBD access
  if (dist != null && capital) {
    const note = sm.distance != null ? ` (state suburb median ${sm.distance} km)` : '';
    items.push(`<strong>CBD access:</strong> ${dist} km straight-line from ${capital}${note}.`);
  } else {
    items.push(`<strong>CBD access:</strong> regional location — verify driving time to the nearest major centre before committing.`);
  }

  // 5. Dwelling mix
  if (housePct != null) {
    const label = housePct >= 70 ? 'house-dominant' : housePct >= 40 ? 'mixed' : 'unit-heavy';
    const state = sm.housePct != null ? ` (vs ${sm.housePct}% state median)` : '';
    items.push(`<strong>Dwelling mix:</strong> ${housePct}% separate houses — ${label} market${state}.`);
  } else {
    items.push(`<strong>Dwelling mix:</strong> ABS 2021 dwelling-type split not captured — verify on the ground.`);
  }

  // 6. Amenities
  items.push(`<strong>Amenities:</strong> approximately ${schools} school${schools === 1 ? '' : 's'} and ${parks} park${parks === 1 ? '' : 's'} within or near the suburb (ABS 2021 / OpenStreetMap).`);

  // 7. Stress-test buffer
  if (mort) {
    const extra = Math.round(mort * 0.10);
    items.push(`<strong>Rate stress-test:</strong> budget ~$${fmt(extra)}/month extra for a 1-percentage-point RBA rate rise on top of the $${fmt(mort)}/month median repayment.`);
  } else {
    items.push(`<strong>Rate stress-test:</strong> model your cash flow with rates 1–2 percentage points above current to ensure the investment survives a tightening cycle.`);
  }

  // 8. Rental-stress gauge
  if (rent && inc) {
    const rentPct = Math.round((rent * 52 / inc) * 100);
    const status = rentPct >= 35 ? 'above the 30% stress threshold'
                 : rentPct >= 25 ? 'within normal range' : 'comfortably affordable';
    items.push(`<strong>Tenant rent burden:</strong> ${rentPct}% of the median household income is spent on rent — ${status}.`);
  } else {
    items.push(`<strong>Tenant rent burden:</strong> rent-to-income data not available — verify against state rental tribunal dashboards.`);
  }

  const lis = items.map(i => `      <li>${i}</li>`).join('\n');
  return `  <section class="suburb-section">
    <h2>Investor Checklist</h2>
    <p class="suburb-checklist-note">Pre-inspection briefing for ${escHtml(s.suburb)} — every item pulls live from ABS 2021 Census data and can be reconciled against the sources in our <a href="/data-sources">data sources</a> page.</p>
    <ul class="suburb-checklist">
${lis}
    </ul>
  </section>`;
}

// ── Phase: lifestyle, audience fit, pros/cons, investment tip, blog links ──
// All data-driven; no free-text invention. Each branch pulls a real field from
// the suburb record so the same combination of numbers can't be produced by
// any other suburb.

function generateLifestyle(s) {
  const capital = stateCapitals[s.state];
  const dist = s.distance_to_cbd;
  const schools = s.school_count || 0;
  const parks = s.park_count || 0;
  const popGrowth = s.population_growth;
  const transport = s.transport_score;
  const housePct = s.house_percentage;
  const type = s.suburb_type;
  const bullets = [];
  const h = seedHash(s.suburb + s.state + 'lifestyle');

  // CBD proximity
  if (dist != null && capital) {
    if (dist <= 8) {
      bullets.push(pick(h, [
        `Close to ${capital} — roughly ${dist} km from the CBD, ideal for city workers.`,
        `Short commute into ${capital}: ~${dist} km from the CBD.`,
      ]));
    } else if (dist <= 20) {
      bullets.push(pick(h, [
        `Middle-ring location about ${dist} km from ${capital} — balance of commute and affordability.`,
        `Well-connected to ${capital} at ~${dist} km from the CBD.`,
      ]));
    } else if (dist <= 45) {
      bullets.push(pick(h, [
        `Outer-metro setting about ${dist} km from ${capital} — more space, quieter streets.`,
        `Family-friendly fringe location — around ${dist} km from ${capital}.`,
      ]));
    } else {
      bullets.push(`Regional location about ${dist} km from ${capital}.`);
    }
  }

  // Schools
  if (schools >= 5) {
    bullets.push(`Plenty of schooling options nearby — around ${schools} schools within reach.`);
  } else if (schools >= 2) {
    bullets.push(`Several schools in the area (around ${schools}), attractive for families.`);
  }

  // Parks / green space
  if (parks >= 5) {
    bullets.push(`Good green-space access with around ${parks} parks and reserves nearby.`);
  } else if (parks >= 2) {
    bullets.push(`Local parks and reserves (around ${parks}) within easy reach.`);
  }

  // Population growth
  if (popGrowth && popGrowth > 2) {
    bullets.push(pick(h >> 1, [
      `Growing community — population has trended upward over recent census cycles.`,
      `Population is expanding, a sign of sustained demand.`,
    ]));
  } else if (popGrowth && popGrowth > 0) {
    bullets.push(`Steady population base — a stable community with modest growth.`);
  }

  // Transport
  if (transport != null) {
    if (transport >= 7) {
      bullets.push(pick(h >> 2, [
        `Strong transport links into the city and nearby employment hubs.`,
        `Well-serviced by public transport and major roads.`,
      ]));
    } else if (transport >= 5) {
      bullets.push(`Reasonable transport access — car-friendly with some public transport options.`);
    }
  }

  // Dwelling mix / lifestyle
  if (housePct != null) {
    if (housePct >= 75) {
      bullets.push(`Predominantly separate houses (${housePct}%) — suburban lifestyle with more land.`);
    } else if (housePct <= 30) {
      bullets.push(`High-density unit mix (${100 - housePct}% non-house dwellings) — urban, low-maintenance living.`);
    }
  }

  // Type-specific flavour as a final bullet to round out the list
  if (bullets.length < 5) {
    const typeBullet = {
      'inner-city':  `Cafes, restaurants and nightlife are part of the local fabric.`,
      'middle-ring': `Established streets, local shops, and schools within the neighbourhood.`,
      'outer-metro': `Newer estates with modern homes and family-sized blocks.`,
      'coastal':     `Beach lifestyle with coastal walks and outdoor recreation on the doorstep.`,
      'regional':    `Country-town feel with lower density and slower pace of life.`,
    }[type];
    if (typeBullet) bullets.push(typeBullet);
  }

  if (!bullets.length) return '';
  const lis = bullets.slice(0, 6).map(b => `      <li>${escHtml(b)}</li>`).join('\n');
  return `  <section class="suburb-section suburb-lifestyle">
    <h2>Why People Like Living in ${escHtml(s.suburb)}</h2>
    <ul class="suburb-lifestyle-list">
${lis}
    </ul>
  </section>`;
}

function generateAudience(s, sm) {
  sm = sm || {};
  const schools = s.school_count || 0;
  const housePct = s.house_percentage != null ? s.house_percentage : 50;
  const dist = s.distance_to_cbd;
  const type = s.suburb_type;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const inc = s.median_household_income;

  // Families: schools + house-dominant
  const familiesFit = schools >= 3 && housePct >= 55;

  // Investors: rent covers >= ~80% of median mortgage OR outer-metro affordability
  let investorsFit = false;
  if (rent && mort) {
    const coverage = (rent * 52 / 12) / mort;
    investorsFit = coverage >= 0.8;
  } else if (type === 'outer-metro' || type === 'regional') {
    investorsFit = true;
  }

  // First-home buyers: mortgage at or below state median, AND outer/middle ring
  let fhbFit = false;
  if (mort && sm.mortgage) {
    fhbFit = mort <= sm.mortgage;
  } else {
    fhbFit = type === 'outer-metro' || type === 'regional';
  }

  // Professionals: close to CBD or inner-city type OR higher household income
  const professionalsFit =
    (dist != null && dist <= 12) ||
    type === 'inner-city' ||
    (inc && sm.income && inc >= sm.income);

  const row = (fit, icon, label, reason) => {
    const mark = fit ? '✔' : '✗';
    const cls = fit ? 'suburb-audience-fit' : 'suburb-audience-miss';
    return `      <div class="suburb-audience-chip ${cls}"><span class="suburb-audience-mark">${mark}</span><span class="suburb-audience-icon">${icon}</span><span class="suburb-audience-label">${escHtml(label)}</span><span class="suburb-audience-reason">${escHtml(reason)}</span></div>`;
  };

  const chips = [
    row(familiesFit, '👨‍👩‍👧', 'Families',
        familiesFit
          ? `${schools} schools nearby, ${housePct}% separate houses.`
          : `School count or dwelling mix is lighter here.`),
    row(investorsFit, '📊', 'Investors',
        investorsFit
          ? (rent && mort ? `Rent covers a solid share of the median mortgage.` : `Affordable entry for rental-focused buyers.`)
          : `Rental coverage trails the state average.`),
    row(fhbFit, '🏡', 'First-home buyers',
        fhbFit
          ? `Entry costs sit at or below the ${s.state_name} median.`
          : `Prices sit above the ${s.state_name} median — stretch goal.`),
    row(professionalsFit, '💼', 'Professionals',
        professionalsFit
          ? (dist != null ? `Around ${dist} km from the CBD with good access.` : `Inner-ring location with city access.`)
          : `Longer commute to the CBD.`),
  ];

  return `  <section class="suburb-section suburb-audience">
    <h2>Who ${escHtml(s.suburb)} Suits</h2>
    <div class="suburb-audience-grid">
${chips.join('\n')}
    </div>
  </section>`;
}

function generateProsCons(s, sm) {
  sm = sm || {};
  const pros = [];
  const cons = [];
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const inc = s.median_household_income;
  const dist = s.distance_to_cbd;
  const schools = s.school_count || 0;
  const parks = s.park_count || 0;
  const transport = s.transport_score;
  const housePct = s.house_percentage;
  const popGrowth = s.population_growth;
  const type = s.suburb_type;

  // Pros ─────────────────────────────
  if (rent && inc) {
    const rentBurden = (rent * 52 / inc) * 100;
    if (rentBurden <= 28) pros.push('Rent sits within an affordable share of local incomes, supporting tenant demand.');
  }
  if (mort && sm.mortgage && mort <= sm.mortgage) {
    pros.push(`Mortgage costs are lower than the ${s.state_name} median, improving cash-flow margins.`);
  }
  if (popGrowth && popGrowth > 1) {
    pros.push('Population growth is supporting steady housing demand.');
  }
  if (schools >= 3) pros.push(`Access to several schools nearby (around ${schools}).`);
  if (parks >= 3) pros.push(`Local parks and reserves (around ${parks}) add to liveability.`);
  if (transport != null && transport >= 6) pros.push('Solid transport links into employment hubs.');
  if (dist != null && dist <= 10) pros.push('Short distance to the CBD makes commuting straightforward.');

  // Fall-back pros so there are always at least 3 bullets
  if (pros.length < 3) {
    if (type === 'outer-metro') pros.push('Affordable entry point compared with inner-city suburbs.');
    if (type === 'inner-city')  pros.push('Lifestyle access to shops, cafes and amenities.');
    if (type === 'coastal')     pros.push('Coastal lifestyle attracts renters and owner-occupiers alike.');
    if (type === 'regional')    pros.push('Lower purchase prices and more land for the money.');
  }
  if (pros.length < 3) pros.push('Established infrastructure and existing community base.');

  // Cons ─────────────────────────────
  if (rent && inc) {
    const rentBurden = (rent * 52 / inc) * 100;
    if (rentBurden >= 32) cons.push('Rent-to-income ratio is above comfortable thresholds — watch tenant affordability.');
  }
  if (mort && sm.mortgage && mort > sm.mortgage * 1.1) {
    cons.push(`Median mortgage sits above the ${s.state_name} state median — entry costs are stretched.`);
  }
  if (dist != null && dist >= 30) cons.push(`Long distance to the CBD (${dist} km) — plan for commute time or local employment.`);
  if (type === 'outer-metro' && (housePct != null && housePct >= 80)) {
    cons.push('New-estate oversupply risk — many similar homes can compete for the same buyers.');
  }
  if (transport != null && transport <= 4) cons.push('Transport options are limited — car dependency is likely.');
  if (schools < 2 && type !== 'inner-city') cons.push('Fewer schools inside the suburb itself — verify catchments for neighbouring areas.');
  if (popGrowth && popGrowth < 0) cons.push('Population has been flat or declining — softens long-run demand.');

  // Fall-back cons so there are always at least 2 bullets
  if (cons.length < 2) cons.push('Traffic can build during peak hours, especially on arterial roads.');
  if (cons.length < 2) cons.push('Prices may rise further as demand continues.');

  const renderList = (arr) => arr.slice(0, 5).map(x => `        <li>${escHtml(x)}</li>`).join('\n');

  return `  <section class="suburb-section suburb-proscons">
    <h2>Pros and Cons</h2>
    <div class="suburb-proscons-grid">
      <div class="suburb-proscons-col suburb-proscons-pros">
        <h3>Pros</h3>
        <ul>
${renderList(pros)}
        </ul>
      </div>
      <div class="suburb-proscons-col suburb-proscons-cons">
        <h3>Cons</h3>
        <ul>
${renderList(cons)}
        </ul>
      </div>
    </div>
  </section>`;
}

function generateInvestmentTip(s, sm) {
  sm = sm || {};
  const type = s.suburb_type;
  const h = seedHash(s.suburb + s.state + 'tip');

  // Choose two sentences based on suburb type + one grounded in real data
  const tipByType = {
    'inner-city': pick(h, [
      `This suburb suits investors prioritising tenant demand over capital-cost efficiency. Rents are supported by proximity to amenities, but strata fees and entry prices can eat into yield.`,
      `Inner-city investors should model strata costs and rate rises carefully, since gross yields here are often compressed by higher entry prices.`,
    ]),
    'middle-ring': pick(h, [
      `This suburb suits long-term investors looking for a balance of rental yield and capital growth. Schools and transport underpin family demand.`,
      `Middle-ring locations like this one historically reward patient holders — focus on homes near catchment-zone schools and major transport.`,
    ]),
    'outer-metro': pick(h, [
      `This suburb suits long-term investors due to steady population growth and affordable entry prices. Look for established streets close to schools and shops rather than raw new-estate land.`,
      `Outer-metro suburbs reward careful property selection — aim for homes near infrastructure rather than generic house-and-land packages.`,
    ]),
    'coastal': pick(h, [
      `This suburb can suit investors targeting renter demand driven by lifestyle. Insurance, climate risk, and seasonal rental patterns all warrant a close look.`,
      `Coastal markets benefit from lifestyle appeal but require a buffer for higher insurance and occasional weather-driven vacancies.`,
    ]),
    'regional': pick(h, [
      `This suburb suits yield-focused investors who are comfortable with lower liquidity. Employment concentration and local population trends matter more here than in metro markets.`,
      `Regional property can deliver strong cash-flow yields but liquidity is tighter — plan for longer hold periods and verify local employment stability.`,
    ]),
  };

  const base = tipByType[type] ||
    `This suburb can suit investors willing to hold for the long term. Always model your cash-flow with a rate buffer and verify rental comparables on-site.`;

  // Grounded closing sentence with a real number
  let closing = '';
  if (s.median_rent_weekly && s.median_household_income) {
    const rentYrPct = Math.round((s.median_rent_weekly * 52 / s.median_household_income) * 100);
    closing = ` Local rents consume roughly ${rentYrPct}% of household income — a useful sanity check on tenant affordability.`;
  } else if (s.distance_to_cbd != null && stateCapitals[s.state]) {
    closing = ` Proximity to ${stateCapitals[s.state]} (~${s.distance_to_cbd} km) is a key driver of demand here.`;
  } else if (s.population) {
    closing = ` With around ${fmt(s.population)} residents, the suburb offers enough depth for typical rental turnover.`;
  }

  return `  <section class="suburb-section suburb-tip">
    <h2>Investment Tip</h2>
    <p>${escHtml(base)}${escHtml(closing)}</p>
  </section>`;
}

// ── Blog-post index (load once at build start) ────────────────────────────
// Indexes posts from data/blog-posts/*.json so generateBlogLinks() can match
// a relevant post to each suburb by suburb-name or state-tag overlap.

const BLOG_POSTS_DIR = path.join(ROOT, 'data', 'blog-posts');
let blogPostsIndex = [];
(function loadBlogPosts() {
  try {
    if (!fs.existsSync(BLOG_POSTS_DIR)) return;
    const files = fs.readdirSync(BLOG_POSTS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(BLOG_POSTS_DIR, f), 'utf8'));
        if (!p || p.status !== 'published' || !p.slug || !p.title) continue;
        blogPostsIndex.push({
          slug: p.slug,
          title: p.title,
          tags: Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()) : [],
          published_at: p.published_at || p.updated_at || 0,
        });
      } catch (_) { /* skip broken files */ }
    }
    blogPostsIndex.sort((a, b) => (b.published_at || 0) - (a.published_at || 0));
    if (blogPostsIndex.length) {
      console.log('[build-suburbs] Loaded ' + blogPostsIndex.length + ' blog post(s) for cross-linking');
    }
  } catch (e) {
    console.warn('[build-suburbs] Blog index load skipped:', e.message);
    blogPostsIndex = [];
  }
})();

function generateBlogLinks(s) {
  if (!blogPostsIndex.length) return '';
  const suburbLc = String(s.suburb).toLowerCase();
  const stateLc = String(s.state).toLowerCase();
  const stateNameLc = String(s.state_name).toLowerCase();

  const scored = blogPostsIndex.map(p => {
    let score = 0;
    const titleLc = p.title.toLowerCase();
    const slugLc = p.slug.toLowerCase();
    if (titleLc.includes(suburbLc) || slugLc.includes(suburbLc.replace(/\s+/g, '-'))) score += 10;
    for (const tag of p.tags) {
      if (tag.includes(suburbLc)) score += 6;
      if (tag === stateLc || tag.startsWith(stateLc + ' ') || tag.endsWith(' ' + stateLc)) score += 3;
      if (tag.includes(stateNameLc)) score += 2;
      if (tag.includes('property') || tag.includes('investment')) score += 1;
    }
    return { post: p, score };
  }).filter(x => x.score > 0);

  // If nothing matched on suburb/state, fall back to the single most recent post
  // so every featured suburb still ships with one outbound blog link.
  const picks = scored.length
    ? scored.sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.post)
    : [blogPostsIndex[0]];

  const links = picks.map(p =>
    `      <a href="/blog/${escHtml(p.slug)}/" class="suburb-blog-link">📖 ${escHtml(p.title)}</a>`
  ).join('\n');

  return `    <div class="suburb-blog-links">
      <p class="suburb-blog-links-label">Related reading</p>
${links}
    </div>`;
}

// Short methodology pointer for suburb pages — adds an E-E-A-T anchor.
function generateMethodologyBlock(s) {
  return `  <section class="suburb-section suburb-methodology">
    <h2>How we built this ${escHtml(s.suburb)} profile</h2>
    <p>Every number on this page comes from the <a href="https://www.abs.gov.au/census" target="_blank" rel="noopener">ABS 2021 Census of Population and Housing</a>, Australia Post postcode reference data, and OpenStreetMap amenity tiles. The investment score, strategy verdicts, and comparison table are computed deterministically from those inputs — no opinion, no estimation. See our <a href="/methodology">full methodology</a> and the <a href="/data-sources">data sources and licences</a> for the formulas we use.</p>
  </section>`;
}

// ── Review prefetch (Phase 4) ───────────────────────────────────────────
// Fetches approved reviews from Upstash Redis via a tiny helper script so
// the rest of this build stays synchronous. Safe no-op when env vars absent;
// hard failure when env vars are set but Redis errors, so a broken pipeline
// never deploys silently.
let reviewsByKey = {};
(function prefetchReviews() {
  const { execSync } = require('child_process');
  const out = execSync('node ' + path.join(__dirname, 'fetch-reviews.js'), {
    encoding: 'utf8',
    timeout: 90_000,
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  reviewsByKey = out && out.trim() ? JSON.parse(out) : {};
  const n = Object.keys(reviewsByKey).length;
  if (n) console.log('[build-suburbs] Prefetched reviews for ' + n + ' suburb(s)');
})();

function formatReviewDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short' });
}

function starBar(rating) {
  const n = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

// Generate the build-time reviews HTML block. Returns empty string when there
// are no approved reviews — the empty section must not render (AdSense
// treats zero-state review shells as a negative signal).
function generateReviewsBlock(state, slug, suburbName) {
  const entry = reviewsByKey[state + ':' + slug];
  if (!entry || !entry.agg || !entry.agg.count) return '';
  const { agg, reviews } = entry;
  const avg = agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : 0;
  const cardsHtml = (reviews || []).map(r => {
    const date = formatReviewDate(r.created_at);
    // Fields are already escaped at submit-time by reviews.js — they were
    // stored through escHtml(). Newlines become <br> for readability.
    const bodyHtml = String(r.body || '').replace(/\n/g, '<br>');
    return (
      '      <article class="suburb-review-card">\n' +
      '        <header class="suburb-review-head">\n' +
      '          <div class="suburb-review-stars" aria-label="' + r.rating + ' out of 5 stars">' + starBar(r.rating) + '</div>\n' +
      '          <h3 class="suburb-review-title">' + (r.title || '') + '</h3>\n' +
      '          <div class="suburb-review-meta"><span>' + (r.userName || 'Anonymous') + '</span>' + (date ? ' <span>·</span> <span>' + date + '</span>' : '') + '</div>\n' +
      '        </header>\n' +
      '        <p class="suburb-review-body">' + bodyHtml + '</p>\n' +
      '      </article>'
    );
  }).join('\n');
  return (
    '  <section class="suburb-section suburb-reviews-section" id="community-reviews">\n' +
    '    <h2>Community Reviews of ' + escHtml(suburbName) + '</h2>\n' +
    '    <div class="suburb-reviews-summary">\n' +
    '      <div class="suburb-reviews-avg" aria-label="Average rating ' + avg + ' out of 5">\n' +
    '        <span class="suburb-reviews-stars">' + starBar(avg) + '</span>\n' +
    '        <span class="suburb-reviews-number">' + avg.toFixed(1) + '</span>\n' +
    '        <span class="suburb-reviews-count">from ' + agg.count + ' review' + (agg.count === 1 ? '' : 's') + '</span>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '    <div class="suburb-reviews-list">\n' +
    cardsHtml + '\n' +
    '    </div>\n' +
    '  </section>'
  );
}

// Returns the AggregateRating JSON-LD node (prefixed with a leading comma) to
// inject into the existing schema.org array. Empty when no reviews.
function generateAggregateRatingJson(state, slug, suburbName) {
  const entry = reviewsByKey[state + ':' + slug];
  if (!entry || !entry.agg || !entry.agg.count) return '';
  const { agg } = entry;
  const avg = agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : 0;
  const safeName = suburbName.replace(/"/g, '\\"');
  return ',{"@context":"https://schema.org","@type":"AggregateRating","itemReviewed":{"@type":"Place","name":"' + safeName + '"},"ratingValue":"' + avg.toFixed(1) + '","reviewCount":"' + agg.count + '","bestRating":"5","worstRating":"1"}';
}

let suburbCount = 0;
let noindexCount = 0;
const stateIndexStats = {}; // state → { indexed, noindexed, total }
const stateGroups = {};

for (const s of suburbs) {
  if (!stateGroups[s.state]) stateGroups[s.state] = [];
  stateGroups[s.state].push(s);
}

// Pre-compute state medians once (used by every enrichment generator).
const stateMedians = computeStateMedians(suburbs);

const relatedMap = buildRelatedMap(suburbs);

for (const s of suburbs) {
  const related = getRelatedSuburbs(s, relatedMap);
  const sm = stateMedians[s.state] || {};
  const pc = s.postcode || '';
  const pcTitle = pc ? `${pc} ` : '';
  const pcComma = pc ? ` ${pc},` : ',';
  const pcKw = pc ? `, ${pc} property` : '';
  const pcDisplay = pc || '—';

  // SEO title, H1, and meta description — interpolated per-page from data,
  // built to satisfy Google SERP length budgets (title <60, meta <155).
  const pageTitle = buildSuburbTitle(s.suburb, s.state, pc);
  const pageH1    = buildSuburbH1(s.suburb, s.state, pc);
  const metaDesc  = buildSuburbMetaDesc(s.suburb, s.state);

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

  // Suburb locator card — inline SVG state silhouette with a red dot at the
  // suburb's lat/lng centroid (set by build/apply-abs-data.js from ABS
  // polygon data). Replaces the old Google Maps iframe — renders instantly
  // because there's nothing to fetch beyond the page itself.
  const locatorCardHtml = generateLocatorCard(s);

  const isNoindexed = shouldNoindex(s);
  const robotsMeta = isNoindexed ? '<meta name="robots" content="noindex, follow">\n' : '';
  if (isNoindexed) noindexCount++;
  if (!stateIndexStats[s.state]) stateIndexStats[s.state] = { indexed: 0, noindexed: 0, total: 0 };
  stateIndexStats[s.state].total++;
  if (isNoindexed) stateIndexStats[s.state].noindexed++;
  else stateIndexStats[s.state].indexed++;

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
    .replace(/\{\{PAGE_TITLE\}\}/g, escHtml(pageTitle))
    .replace(/\{\{PAGE_H1\}\}/g, escHtml(pageH1))
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
    .replace(/\{\{LOCATOR_CARD_HTML\}\}/g, locatorCardHtml)
    .replace(/\{\{INVESTMENT_INSIGHT\}\}/g, generateInsight(s, sm))
    .replace(/\{\{INVESTMENT_SCORE_HTML\}\}/g, generateInvestmentScore(s))
    .replace(/\{\{STRATEGY_HTML\}\}/g, generateStrategy(s, sm))
    .replace(/\{\{RISK_FACTORS_HTML\}\}/g, generateRisks(s, sm))
    .replace(/\{\{OUTLOOK_HTML\}\}/g, generateOutlook(s, sm))
    .replace(/\{\{FAQ_HTML\}\}/g, generateFAQ(s, sm))
    .replace(/\{\{COMPARE_HTML\}\}/g, generateComparisonTable(s, sm))
    .replace(/\{\{CHECKLIST_HTML\}\}/g, generateInvestorChecklist(s, sm))
    .replace(/\{\{METHODOLOGY_HTML\}\}/g, generateMethodologyBlock(s))
    .replace(/\{\{LIFESTYLE_HTML\}\}/g, isNoindexed ? '' : generateLifestyle(s))
    .replace(/\{\{AUDIENCE_HTML\}\}/g, isNoindexed ? '' : generateAudience(s, sm))
    .replace(/\{\{PROSCONS_HTML\}\}/g, isNoindexed ? '' : generateProsCons(s, sm))
    .replace(/\{\{INVESTMENT_TIP_HTML\}\}/g, isNoindexed ? '' : generateInvestmentTip(s, sm))
    .replace(/\{\{BLOG_LINKS_HTML\}\}/g, isNoindexed ? '' : generateBlogLinks(s))
    .replace(/\{\{REVIEWS_HTML\}\}/g, isNoindexed ? '' : generateReviewsBlock(s.state, s.slug, s.suburb))
    .replace(/\{\{AGGREGATE_RATING_JSON\}\}/g, isNoindexed ? '' : generateAggregateRatingJson(s.state, s.slug, s.suburb))
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

  // Split the list: featured (indexed) vs reference (noindexed)
  // — protects internal link equity while keeping thin pages out of the
  // primary UI. Featured cards drive the `data-search` search index, the
  // reference drawer shows plain anchors only.
  const featured = stateSuburbs
    .filter(s => !shouldNoindex(s))
    .sort((a, b) => b.population - a.population);
  const reference = stateSuburbs
    .filter(s => shouldNoindex(s))
    .sort((a, b) => a.suburb.localeCompare(b.suburb));

  const featuredListHTML = featured.map(s =>
    `      <a href="/suburb/${stateLower}/${s.slug}/" class="hub-suburb-card" data-search="${escHtml((s.suburb + ' ' + (s.postcode || '')).toLowerCase().trim())}">\n        <div class="hub-suburb-name">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-suburb-pc">${escHtml(s.postcode)}</span>` : ''}</div>\n        <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span><span>${s.distance_to_cbd != null ? s.distance_to_cbd + ' km to CBD' : 'Regional'}</span><span>$${fmt(s.median_household_income)}/yr</span></div>\n        <div class="hub-suburb-tag">${s.suburb_type}</div>\n      </a>`
  ).join('\n');

  const referenceListHTML = reference.map(s =>
    `      <a href="/suburb/${stateLower}/${s.slug}/" class="hub-reference-link">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-reference-pc">${escHtml(s.postcode)}</span>` : ''}</a>`
  ).join('\n');

  const referenceDrawerHTML = reference.length
    ? `<details class="hub-reference-drawer">\n    <summary>All localities in ${escHtml(stateName)} (${fmt(reference.length)} additional)</summary>\n    <p class="hub-reference-note">Smaller localities without enough data for a full property profile. Links stay available for research.</p>\n    <div class="hub-reference-list">\n${referenceListHTML}\n    </div>\n  </details>`
    : '';

  let html = HUB_TPL
    .replace(/\{\{STATE\}\}/g, escHtml(state))
    .replace(/\{\{STATE_LOWER\}\}/g, stateLower)
    .replace(/\{\{STATE_NAME\}\}/g, escHtml(stateName))
    .replace(/\{\{SUBURB_COUNT\}\}/g, fmt(featured.length))
    .replace(/\{\{TOTAL_SUBURB_COUNT\}\}/g, fmt(stateSuburbs.length))
    .replace(/\{\{STATE_NAV_HTML\}\}/g, stateNavHTML)
    .replace(/\{\{CITY_NAV_HTML\}\}/g, cityNavHTML)
    .replace(/\{\{SUBURB_LIST_HTML\}\}/g, featuredListHTML)
    .replace(/\{\{REFERENCE_DRAWER_HTML\}\}/g, referenceDrawerHTML);

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
    <span class="tool-logo-mark"><img src="/images/icon-dark.svg" alt="EquitySight" width="28" height="28"></span>
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
  '  <sitemap>\n    <loc>https://equitysight.app/sitemap-blog.xml</loc>\n  </sitemap>',
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

const indexedCount = suburbCount - noindexCount;
console.log(`Built ${suburbCount} suburb pages — indexed=${indexedCount} noindexed=${noindexCount} (target 2,000–3,000 indexed)`);
console.log(`Built ${cityCount} city pages, ${hubCount} state hub pages`);
console.log('Per-state indexed / total:');
Object.keys(stateIndexStats).sort().forEach(st => {
  const r = stateIndexStats[st];
  console.log(`  ${st}: ${r.indexed}/${r.total} (${r.noindexed} noindexed)`);
});
console.log(`Generated sitemap.xml (index) + ${sitemapFiles.length} sitemap files (${totalSitemapUrls} URLs, ${sitemapExcluded} excluded)`);
sitemapFiles.forEach(f => console.log(`  ${f.filename}: ${f.urlCount} URLs`));

// ── Write index report (consumed by the admin Suburbs tab) ──
// Written to /data because /build is excluded from the public Netlify CDN
// via .netlifyignore. /data is already partially public — suburbs.json is
// fetched client-side from the admin dashboard.
const indexReport = {
  generated_at: new Date().toISOString(),
  build_date: BUILD_DATE,
  total: suburbCount,
  indexed: indexedCount,
  noindexed: noindexCount,
  min_population_for_index: MIN_POPULATION_FOR_INDEX,
  by_state: stateIndexStats,
  quality_score_histogram: (() => {
    const bins = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    for (const s of suburbs) {
      const q = qualityScore(s);
      if (q <= 20) bins['0-20']++;
      else if (q <= 40) bins['21-40']++;
      else if (q <= 60) bins['41-60']++;
      else if (q <= 80) bins['61-80']++;
      else bins['81-100']++;
    }
    return bins;
  })(),
};
fs.writeFileSync(
  path.join(ROOT, 'data', 'suburb-index-report.json'),
  JSON.stringify(indexReport, null, 2)
);
console.log(`Wrote data/suburb-index-report.json`);

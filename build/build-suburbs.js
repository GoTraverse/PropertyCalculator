#!/usr/bin/env node
/**
 * build-suburbs.js — Generates static suburb insight pages and state hub pages
 * from data/suburbs.json + templates.
 *
 * Aug 2026 product cut: ONLY suburbs that pass the shouldNoindex() real-data
 * gate are generated at all (~1,475 pages). The other ~13,000 records used to
 * render as noindexed shells; they now have no page (404 by design). The old
 * 19 city pages (/invest/{state}/{city}/) were cut entirely; state hubs are
 * plain honest directories of the surviving suburbs.
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

const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// median_household_income in data/suburbs.json is a name-seeded placeholder
// (generate-suburbs-data.js) unless apply-abs-data.js has overwritten it with
// the real ABS 2021 figure and tagged the record income_source = 'abs2021'.
// The placeholder must never render on any page, so untagged income is nulled
// here before any generator runs. Real ABS income re-enables display via the tag.
for (const s of suburbs) {
  if (s.income_source !== 'abs2021') s.median_household_income = null;
}

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

// ── Rent provenance helper (data-honesty pass, Jul 2026) ────────────────────
// Suburb records carry TWO rent tiers:
//   current_rent  — genuine current figure from state-government open data
//                   (QLD RTA, SA CBS, TAS DoJ, NSW DCJ postcode rents), folded
//                   in by build/merge-market-current.js with period + source.
//   median_rent_weekly — ABS 2021 Census median, five years stale.
// Site rule (strict-period honesty): every rent figure shown in prose, titles
// or tables must carry its period. Current figures get "as at <period>,
// <source>"; Census figures are ALWAYS labelled "2021 Census" and never
// presented as current. All generators consume THIS helper rather than
// reading median_rent_weekly directly.
function rentInfo(s) {
  if (s.current_rent) {
    const geo = String(s.current_rent_geo || 'suburb');
    return {
      value: s.current_rent,
      isCurrent: true,
      period: s.current_rent_period || 'the latest published period',
      source: s.current_rent_source || 'state government open data',
      // e.g. "as at Mar 2026, Residential Tenancies Authority (Qld)"
      label: `as at ${s.current_rent_period || 'the latest published period'}, ${s.current_rent_source || 'state government open data'}`,
      geo,
      // NSW DCJ rents are postcode-geo — say so wherever the figure appears.
      geoNote: geo.indexOf('suburb') === 0 ? '' : ` (${geo}-level figure)`,
    };
  }
  if (s.median_rent_weekly) {
    return {
      value: s.median_rent_weekly,
      isCurrent: false,
      period: '2021 Census',
      source: 'ABS 2021 Census',
      label: '2021 Census',
      geo: 'suburb',
      geoNote: '',
    };
  }
  return null;
}

// SEO title builder. Target: under 60 chars (Google SERP truncates at ~60 on
// desktop, ~55 on mobile). Builds a fact-first title that injects the most
// specific numeric data we have for the suburb so the SERP snippet answers
// the query rather than describing the page. Variants are tried in order
// of richness; the first one that fits the budget wins.
//
// Data-honesty (Jul 2026): rent-led variants use the CURRENT state-gov rent
// (current_rent) when present. A Census-only rent may still appear but MUST
// carry the "(2021 Census)" label — a 2021 figure is never presented bare as
// if it were today's rent. Current sale-price medians (VIC/SA) slot in when
// no current rent exists.
function buildSuburbTitle(s) {
  const pc = s.postcode || '';
  const region = pc ? `${s.state} ${pc}` : s.state;
  const incomeK = s.median_household_income
    ? '$' + Math.round(s.median_household_income / 1000) + 'k'
    : null;
  const popDisplay = s.population
    ? (s.population >= 1000
        ? Math.round(s.population / 1000) + 'k'
        : String(s.population))
    : null;

  const variants = [];
  // Best — a genuine CURRENT rent figure (state-government open data)
  if (s.current_rent) {
    variants.push(`${s.suburb} ${region} Median Rent $${s.current_rent}/wk Profile`);
    variants.push(`${s.suburb} ${region} Rent $${s.current_rent}/wk Suburb Profile`);
    variants.push(`${s.suburb} ${region} Rent $${s.current_rent}/wk Profile`);
  }
  // Current sale-price median (e.g. Valuer-General VIC/SA) when no current rent
  if (!s.current_rent && s.current_price_house) {
    const priceK = Math.round(s.current_price_house / 1000);
    variants.push(`${s.suburb} ${region} Median House Price $${priceK}k`);
    variants.push(`${s.suburb} ${region} House Price $${priceK}k Profile`);
  }
  // Census-only rent — always dated, never presented as current
  if (!s.current_rent && s.median_rent_weekly) {
    variants.push(`${s.suburb} ${region} Rent $${s.median_rent_weekly}/wk (2021 Census)`);
  }
  // Income-led variants (current real-data fallback for almost every suburb)
  if (incomeK) {
    variants.push(`${s.suburb} ${region} Suburb Profile · Median Income ${incomeK}`);
    variants.push(`${s.suburb} ${region} Suburb Profile · Income ${incomeK}`);
    variants.push(`${s.suburb} ${region} Profile · Income ${incomeK}`);
  }
  // Population-led
  if (popDisplay) {
    variants.push(`${s.suburb} ${region} Suburb Profile · Pop ${popDisplay}`);
    variants.push(`${s.suburb} ${region} Profile · Pop ${popDisplay}`);
  }
  // Generic fallback
  variants.push(`${s.suburb} ${region} Suburb Profile`);
  variants.push(`${s.suburb}, ${region} Profile`);

  for (const v of variants) {
    if (v.length <= 60) return v;
  }
  // Hard floor — bare prefix
  return `${s.suburb} ${region}`;
}

// SEO H1 builder.
function buildSuburbH1(suburb, state, postcode) {
  return postcode
    ? `${suburb}, ${state} ${postcode} Property Profile`
    : `${suburb}, ${state} Property Profile`;
}

// SEO meta description builder. Target: under 155 chars (Google SERP cap).
//
// Per Phase 3 of the May 2026 SEO remediation: lead with concrete numbers
// (rent, income, population, postcode) so the SERP snippet answers the user's
// query directly. Falls back through population + postcode + income when the
// richer rent/distance data isn't populated. Each variant is tried in order
// and the first one under the 155-char budget wins.
function buildSuburbMetaDesc(s) {
  const pc = s.postcode || '';
  const pop = s.population ? Number(s.population).toLocaleString('en-AU') : '';
  const inc = s.median_household_income;
  const incK = inc ? '$' + Math.round(inc / 1000) + 'k' : null;
  const dist = s.distance_to_cbd;
  const stateName = s.state_name || s.state;
  const region = pc ? `${s.state} ${pc}` : s.state;

  const variants = [];

  // Tier 0 — CURRENT rent (state-gov open data), always with its period
  if (s.current_rent && pop) {
    const per = s.current_rent_period || 'current';
    variants.push(
      `${s.suburb} ${region} median rent $${s.current_rent}/wk (as at ${per}). Population ${pop}. Free ${stateName} suburb profile, sourced data.`
    );
    variants.push(
      `${s.suburb} ${region}: median rent $${s.current_rent}/wk as at ${per}, pop ${pop}. Free suburb profile & investor data.`
    );
  }
  // Tier 0b — CURRENT house-price median when no current rent (VIC/SA)
  if (!s.current_rent && s.current_price_house && pop) {
    const per = s.current_price_period || 'current';
    variants.push(
      `${s.suburb} ${region} median house price $${Number(s.current_price_house).toLocaleString('en-AU')} (as at ${per}). Population ${pop}. Free suburb profile.`
    );
  }
  // Tier 1 — Census rent, clearly dated (only when no current figure exists)
  if (!s.current_rent && s.median_rent_weekly && pop) {
    variants.push(
      `${s.suburb} ${region} median rent $${s.median_rent_weekly}/wk at the 2021 Census. Population ${pop}. Free suburb profile & investor insights.`
    );
  }
  // Tier 3 — distance + income + population (when distance is populated)
  if (dist != null && inc && pop) {
    variants.push(
      `${s.suburb} ${region} suburb profile. Population ${pop}, median income ${incK}/yr, ${dist}km from CBD. Free 2026 investor data.`
    );
  }
  // Tier 4 — current default: income + population + postcode
  // (the user-preferred fallback per SOW Phase 3)
  if (inc && pop && pc) {
    variants.push(
      `${s.suburb} ${region}: median household income ${incK}/yr, population ${pop}. Free 2026 suburb profile & investor insights.`
    );
    variants.push(
      `${s.suburb} ${region} profile. Pop ${pop}, median income ${incK}/yr. Demographics & 2026 investor data.`
    );
  }
  // Tier 5 — population + postcode (no income)
  if (pop && pc) {
    variants.push(
      `${s.suburb} ${region} suburb profile. Population ${pop}. Demographics & 2026 investor insights for ${stateName}.`
    );
  }
  // Tier 6 — bare-bones fallback
  variants.push(
    `${s.suburb} ${s.state} suburb profile. ${stateName} demographics, investor insights & 2026 outlook.`
  );

  for (const v of variants) {
    if (v.length <= 155) return v;
  }
  // Hard floor
  return `${s.suburb} ${s.state} suburb profile — investor data & 2026 outlook.`;
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
    ['Queensland Revenue Office', 'https://qro.qld.gov.au/'],
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
    ? ` The median household income is $${fmt(s.median_household_income)} per year.`
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
  const ri   = rentInfo(s); // current state-gov rent when present, else labelled 2021 Census
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
    parts.push(`${s.suburb} has a usual resident population of approximately ${fmt(pop)}, which sets the upper bound on both the tenant pool and the frequency of comparable sales.`);
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

  // Rent + mortgage coverage — a suburb-specific cash-flow fingerprint.
  // Data honesty: the mortgage median is ALWAYS from the ABS 2021 Census. When
  // the rent is a current state-gov figure the two periods differ, so the
  // sentence names both periods and flags that repayments have risen since
  // 2021 rather than presenting the ratio as a clean current-day coverage.
  // The wording band is driven by whichever rent figure is actually shown.
  if (ri && mort) {
    const monthlyRent = Math.round(ri.value * 52 / 12);
    const coverage = Math.round((monthlyRent / mort) * 100);
    const gap = mort - monthlyRent;
    if (ri.isCurrent) {
      const rentDesc = `$${fmt(ri.value)}/week (${ri.label})${ri.geoNote}`;
      const mortDesc = `$${fmt(mort)}/month median mortgage repayment recorded at the 2021 Census`;
      if (coverage >= 90) {
        parts.push(`Median rent of ${rentDesc} equates to roughly $${fmt(monthlyRent)}/month — about ${coverage}% of the ${mortDesc}. On those figures rental income covers most or all of the recorded repayment, but repayments on new loans have risen with interest rates since 2021, so re-run the coverage at today's rates before treating this as a cash-flow suburb.`);
      } else if (coverage >= 70) {
        parts.push(`Median rent of ${rentDesc} covers about ${coverage}% of the ${mortDesc}, leaving a gap of roughly $${fmt(gap)}/month on those figures — and since the mortgage baseline predates the post-2021 rate rises, the real gap on a new loan is likely wider.`);
      } else if (coverage >= 50) {
        parts.push(`Median rent of ${rentDesc} (~$${fmt(monthlyRent)}/month) covers only ${coverage}% of the ${mortDesc} — and repayments on new loans have risen since 2021, so this suburb tilts firmly toward capital growth rather than yield.`);
      } else {
        parts.push(`Median rent of ${rentDesc} covers just ${coverage}% of the ${mortDesc}, a gap of $${fmt(gap)}/month on those figures alone — investors should only pursue this suburb with a clear capital-growth thesis and sufficient external income to fund the shortfall.`);
      }
    } else {
      // Census-to-Census — same period on both sides, but five years old, so
      // the whole claim is dated rather than presented as today's cash flow.
      if (coverage >= 90) {
        parts.push(`At the 2021 Census, median weekly rent of $${fmt(ri.value)} equated to $${fmt(monthlyRent)}/month — about ${coverage}% of the then-median mortgage repayment of $${fmt(mort)}/month. Both figures have moved substantially since 2021, so treat the ratio as a historical signal that this suburb leaned cash-flow-friendly, and verify against current listings and rates.`);
      } else if (coverage >= 70) {
        parts.push(`At the 2021 Census, rent of $${fmt(ri.value)}/week covered ${coverage}% of the $${fmt(mort)}/month median mortgage recorded at the same Census, leaving a gap of roughly $${fmt(gap)}/month at the time. Rents and repayments have both risen since — re-run the numbers with current figures before drawing conclusions.`);
      } else if (coverage >= 50) {
        parts.push(`At the 2021 Census, median rent of $${fmt(ri.value)}/week (~$${fmt(monthlyRent)}/month) covered only ${coverage}% of the $${fmt(mort)}/month median mortgage recorded at the same Census — a dated snapshot, but one that suggests this suburb tilted toward capital growth rather than yield.`);
      } else {
        parts.push(`At the 2021 Census, weekly rent of $${fmt(ri.value)} covered just ${coverage}% of the $${fmt(mort)}/month median mortgage recorded at the same Census, a $${fmt(gap)}/month gap at the time — verify current rents and repayments before pursuing this suburb, and only with a clear capital-growth thesis.`);
      }
    }
  } else if (ri) {
    if (ri.isCurrent) {
      parts.push(`The median weekly rent is $${fmt(ri.value)} (${ri.label})${ri.geoNote}, translating to approximately $${fmt(ri.value * 52)}/year in gross rental income — the upper bound on yield before vacancy, rates, insurance and maintenance.`);
    } else {
      parts.push(`At the 2021 Census the median weekly rent was $${fmt(ri.value)} (≈ $${fmt(ri.value * 52)}/year gross at the time). Market rents have moved substantially since 2021, so benchmark against current listings before running yield numbers.`);
    }
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
    a: `Whether ${name} suits you depends on your strategy, but the fundamentals are concrete: a population of ${fmt(pop)}${inc ? `, a median household income of $${fmt(inc)}/year` : ''}${rent ? ` and median weekly rent of $${fmt(rent)}` : ''}. Weigh those against your goal — cash flow, capital growth, or a value-add renovation — each of which we break down with suburb-specific ABS numbers elsewhere on this page.`,
  });

  // 2. Demand drivers
  const drivers = [];
  if (dist != null && dist <= 25) drivers.push(`proximity to ${capital} (${dist} km)`);
  if (inc && sm.income && inc >= sm.income) drivers.push(`an above-state-median household income of $${fmt(inc)}/year`);
  else if (inc) drivers.push(`a median household income of $${fmt(inc)}/year`);
  if (housePct != null) drivers.push(`a dwelling mix that is ${housePct}% separate houses`);
  faqs.push({
    q: `What drives property demand in ${s.suburb}?`,
    a: drivers.length
      ? `The main demand drivers in ${name} are ${drivers.join(', ')}. Together these shape both owner-occupier and tenant demand.`
      : `Demand in ${name} is shaped by its population of ${fmt(pop)} and its position within ${s.state_name}, alongside the market data shown above.`,
  });

  // 3. Population
  faqs.push({
    q: `What is the population of ${s.suburb}?`,
    a: `${name} has a usual resident population of approximately ${fmt(pop)}${sm.population ? `, compared with a ${stateName} suburb median of ${fmt(sm.population)} — placing it in the ${pop > sm.population ? 'upper' : 'lower'} half of the state's suburbs by size` : ''}. Population is the clearest proxy for market depth: more residents mean more transactions and typically a shorter average days-on-market on resale.`,
  });

  // 4. CBD distance
  faqs.push({
    q: `How far is ${s.suburb} from the ${capital} CBD?`,
    a: dist != null
      ? `${name} sits ${dist} km straight-line from the ${capital} CBD. ${dist <= 10 ? 'This is inner-ring territory — pricing competes directly with established ' + capital + ' employment nodes.' : dist <= 25 ? 'This is comfortable commuter territory, with reasonable rail and road access to the city.' : dist <= 50 ? 'This is an outer-metro location; local employment and infrastructure announcements tend to move prices more than CBD connectivity alone.' : 'This is a regional market where CBD distance is only indicative — local industry diversity and commute alternatives matter more.'}`
      : `Centroid coordinates were not captured for ${name}. Cross-check Google Maps and the state transport authority for current travel times to ${capital}.`,
  });

  // 5. Median rent
  {
    const ri = rentInfo(s);
    faqs.push({
      q: `What is the median rent in ${s.suburb}?`,
      a: ri && ri.isCurrent
        ? `The median weekly rent in ${name} is $${fmt(ri.value)} (${ri.label})${ri.geoNote}, equating to approximately $${fmt(ri.value * 52)}/year in gross rental income. Confirm against current listings on realestate.com.au and Domain before making an offer.`
        : rent
          ? `The most recent census recorded a median weekly rent of $${fmt(rent)} in ${name}, equating to approximately $${fmt(rent * 52)}/year in gross rental income${sm.rent ? ` (state median $${fmt(sm.rent)}/week)` : ''}. Market rents have typically drifted above the recorded figure — verify against current listings on realestate.com.au and Domain before making an offer.`
          : `A published median rent is not available for ${name}. Benchmark expected weekly rent on realestate.com.au and Domain, or the state rental tribunal's rent dashboard. Most Australian investors target a 4–5% gross yield as a baseline.`,
    });
  }

  // 6. Mortgage
  faqs.push({
    q: `What is the typical mortgage repayment in ${s.suburb}?`,
    a: mort
      ? `The median monthly mortgage repayment in ${name} is $${fmt(mort)}, or approximately $${fmt(Math.round(mort * 12))}/year${sm.mortgage ? ` (vs $${fmt(sm.mortgage)}/month state median)` : ''}. Stress-test your own borrowing at rates 1–2 percentage points above today's to make sure you can still service the loan through an RBA tightening cycle.`
      : `A reliable median mortgage figure was not captured for ${name}. Use our <a href="/tools/loan-serviceability-calculator/">loan serviceability calculator</a> to estimate a realistic monthly repayment for your target purchase price and deposit.`,
  });

  // 7. Cash-flow math
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const gap = mort - monthlyRent;
    const coverage = Math.round((monthlyRent / mort) * 100);
    faqs.push({
      q: `Is ${s.suburb} cash-flow positive for investors?`,
      a: `A median weekly rent of $${fmt(rent)} works out to $${fmt(monthlyRent)}/month, covering ${coverage}% of the median mortgage repayment of $${fmt(mort)}/month. ${gap > 0
        ? `That leaves a $${fmt(gap)}/month shortfall (around $${fmt(gap * 12)}/year before tax benefits), so a typical owner-occupier-priced property here is negatively geared.`
        : `That means rent exceeds the median repayment by roughly $${fmt(-gap)}/month, so on these numbers ${name} leans cash-flow-positive before accounting for strata, council rates, insurance and maintenance.`} Actual cash flow depends on your deposit, loan terms, ownership costs and marginal tax rate — run the full numbers in our <a href="/tools/rental-yield-calculator">rental yield calculator</a>.`,
    });
  } else {
    faqs.push({
      q: `Is ${s.suburb} cash-flow positive for investors?`,
      a: `Census data was not complete enough in ${name} to compute a clean rent-to-mortgage coverage. Use current listings to benchmark weekly rent, then plug your expected purchase price into our <a href="/tools/rental-yield-calculator">rental yield calculator</a> to see whether the investment runs cash-flow positive or negative.`,
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

// (generateInvestmentScore was removed Aug 2026 — the {{INVESTMENT_SCORE_HTML}}
// placeholder no longer exists in templates/suburb-page.html; the fabricated
// 0-100 score must not render. computeScore() itself stays: the FAQ and
// outlook generators still use it as an internal banding heuristic.)

// ── Investment Strategy ──

// Strategy verdicts are computed from live ratios (income vs state median,
// rent coverage of median mortgage, house-% delta) so every paragraph carries
// at least one suburb-specific number.
function generateStrategy(s, sm) {
  sm = sm || {};
  const inc  = s.median_household_income || 0;
  // Neutral ratio when either side is missing — a null income must never
  // read as "income far below median" or put a $0 figure in any sentence.
  const incomeVsState = (inc && sm.income) ? inc / sm.income : 1;
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
    const incClause = inc
      ? (sm.income
          ? ` and household income close to the ${s.state} median ($${fmt(inc)} vs $${fmt(sm.income)})`
          : ` and household income of $${fmt(inc)}/year`)
      : '';
    bhText = `Solid buy-and-hold profile: a population of ${fmt(pop)}${incClause} give${incClause ? '' : 's'} the market enough depth for patient capital growth without the premium entry price of inner suburbs.`;
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
      ryText = `Strong rental coverage at the 2021 Census: $${fmt(rent)}/week (~$${fmt(monthlyRent)}/month) covered ${coverage}% of the $${fmt(mort)}/month median mortgage, a shortfall of just $${fmt(Math.max(0, gap))}/month. Both rents and repayments have moved since 2021 — verify current figures, though this suburb has historically leaned cash-flow-friendly.`;
    } else if (coverage >= 65) {
      ryIcon = '\u26A0\uFE0F';
      ryText = `Moderate rental coverage at the 2021 Census: rent of $${fmt(rent)}/week covered ${coverage}% of a $${fmt(mort)}/month mortgage, a $${fmt(gap)}/month gap bridged with equity, depreciation and tax benefits. Re-check with current rents and rates before committing.`;
    } else {
      ryIcon = '\u274C';
      ryText = `Weak cash flow at the 2021 Census: $${fmt(rent)}/week rent covered only ${coverage}% of the $${fmt(mort)}/month median mortgage — a $${fmt(gap)}/month gap funded from other income. On the Census snapshot this reads as a capital-growth play, not a yield play; verify current rents before deciding.`;
    }
  } else if (rent) {
    ryIcon = '\u26A0\uFE0F';
    ryText = `Gross rent of $${fmt(rent)}/week (~$${fmt(rent * 52)}/year, 2021 Census) sets an indicative yield ceiling. Cross-check against current listings and your purchase price to confirm whether this suburb hits the 4–5% gross yield most Australian investors target.`;
  } else if (rentInfo(s) && rentInfo(s).isCurrent) {
    const ri = rentInfo(s);
    ryIcon = '\u26A0\uFE0F';
    ryText = `The current median rent is $${fmt(ri.value)}/week (${ri.label})${ri.geoNote}, ~$${fmt(ri.value * 52)}/year gross. Feed that number and your purchase price into our rental yield calculator to see whether this suburb hits the 4–5% gross yield most Australian investors target.`;
  } else {
    ryIcon = '\u26A0\uFE0F';
    ryText = `A published median rent is not available for ${s.suburb}. Use current realestate.com.au and Domain listings to triangulate a realistic weekly rent before committing, then feed that number into our rental yield calculator.`;
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

  return `<h2>Investment strategy</h2>\n    <div class="suburb-strategy-list">\n${items}\n    </div>`;
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
      risks.push(`Rental stress (2021 Census): a median rent of $${fmt(rent)}/week consumed about ${rentPct}% of the $${fmt(inc)}/year median household income at the Census — past the 30% stress threshold — signalling tenants may resist further rises and vacancy risk lifts in downturns. Both figures have moved since 2021; confirm with current data.`);
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
  return `<h2>Risk factors</h2>\n    <ul class="suburb-risk-list">\n${items}\n    </ul>`;
}

// ── 2026 Outlook ──

// Outlook narrative is built from three computed ratios (income vs state,
// rent vs mortgage, investment score band). Every sentence carries a
// suburb-specific number so the three-paragraph block is unique.
function generateOutlook(s, sm) {
  sm = sm || {};
  const score = computeScore(s);
  const inc  = s.median_household_income || 0;
  // Neutral ratio when income is missing — see generateStrategy.
  const incomeVsState = (inc && sm.income) ? inc / sm.income : 1;
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
    parts.push(`At the 2021 Census, rental coverage ran at ~${coverage}% of the typical mortgage ($${fmt(monthlyRent)}/month rent vs $${fmt(mort)}/month repayment), ${tail}. Verify against current rents and rates.`);
  } else if (rentInfo(s)) {
    const ri2 = rentInfo(s);
    parts.push(`Rents sit around $${fmt(ri2.value)}/week (${ri2.label})${ri2.geoNote}, a baseline gross rental income of roughly $${fmt(ri2.value * 52)}/year — refine against current listings before running your numbers.`);
  } else {
    parts.push(`Rental fundamentals will need to be verified against live listings, as a clean median rent was not recorded for ${s.suburb}.`);
  }

  // Sentiment sentence — pinned to the score
  const tier = score >= 81 ? 'top tier' : score >= 61 ? 'upper-middle tier' : score >= 41 ? 'mid tier' : 'lower tier';
  const tone = sentimentLevel === 'strong' ? 'constructive' : sentimentLevel === 'moderate' ? 'balanced' : 'cautious';
  parts.push(`Overall investor sentiment for ${s.suburb} is ${tone} heading into the second half of 2026, based on its income, rent and mortgage profile relative to the ${s.state_name} median.`);

  return `<h2>2026 outlook</h2>\n    <div class="suburb-outlook-tags">\n      ${tags}\n    </div>\n    <p>${escHtml(parts.join(' '))}</p>`;
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
// Gate: must have a postcode, at least 10,000 residents, and a known median
// household income. Against the current data/suburbs.json this yields ~641
// featured suburbs (NSW 217, VIC 209, QLD 126, WA 62, SA 21, TAS 4, ACT 2;
// NT has none at this threshold).
//
// Raised from 2,000 (~3,022 indexed) to 10,000 in Jun 2026 as an aggressive
// index-bloat cut: GSC showed the high-value calculator pages stuck at
// "Crawled - currently not indexed" while ~3k thin templated suburb pages
// (last crawled months earlier, ~0 clicks, ranking only for junk address
// queries) diluted site quality and ate crawl budget. Trimming to the ~641
// largest suburbs concentrates crawl budget + quality signal on the money
// pages. Cut suburbs remain reachable as noindex,follow (link equity to the
// calculators survives); they're just out of the sitemap + state-hub features.
// Lowered from 10000 → 2000 (Jul 2026): the real-current-data requirement in
// shouldNoindex() is now the quality gate, so smaller suburbs that carry genuine
// current rent/sale-price (e.g. Glenelg SA, pop ~3.5k) are legitimately indexable.
const MIN_POPULATION_FOR_INDEX = 2000;

function shouldNoindex(s) {
  // Real-data gate (Jul 2026): index a suburb page only when it carries genuine,
  // CURRENT, suburb-level, CC-licensed market data (median rent or sale price) from
  // build/merge-market-current.js — plus the usual population + postcode floor.
  // Aug 2026: this gate is now also the GENERATION gate — suburbs that fail it
  // get no page at all (their old noindexed-shell URLs 404 by design), so the
  // generated set and the sitemap set coincide by construction. This is what
  // makes the SA / VIC / QLD / TAS suburbs that have real rent/price figures
  // publishable, while the long tail has no page.
  if (s.tiny) return true;
  if (!s.postcode) return true;
  if ((s.population || 0) < MIN_POPULATION_FOR_INDEX) return true;
  const geoOk = g => typeof g === 'string' && g.indexOf('suburb') === 0;
  const realRent  = !!(s.current_rent && geoOk(s.current_rent_geo));
  const realPrice = !!((s.current_price_house || s.current_price_unit) && geoOk(s.current_price_geo));
  if (!realRent && !realPrice) return true;
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
    // Use a population threshold directly (not shouldNoindex, which now excludes
    // every suburb) so state medians still reflect substantial suburbs.
    if (!s.postcode || (s.population || 0) < MIN_POPULATION_FOR_INDEX) continue;
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
    rows.push(`<tr><th scope="row">Median rent (weekly, 2021 Census)</th><td>$${fmt(s.median_rent_weekly)}</td><td>$${fmt(sm.rent)}</td>${deltaCell(pctDelta(s.median_rent_weekly, sm.rent))}</tr>`);
  }
  if (s.median_mortgage_monthly && sm.mortgage) {
    rows.push(`<tr><th scope="row">Median mortgage (monthly, 2021 Census)</th><td>$${fmt(s.median_mortgage_monthly)}</td><td>$${fmt(sm.mortgage)}</td>${deltaCell(pctDelta(s.median_mortgage_monthly, sm.mortgage))}</tr>`);
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
    <h2>${escHtml(s.suburb)} vs ${escHtml(s.state_name)} median</h2>
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
  const housePct = s.house_percentage;
  const capital = stateCapitals[s.state];

  // 1. Market depth
  if (sm.population) {
    items.push(`<strong>Market depth:</strong> ${fmt(pop)} residents — ${Math.round(pop / sm.population * 100)}% of the ${s.state} suburb median (${fmt(sm.population)}).`);
  } else {
    items.push(`<strong>Market depth:</strong> ${fmt(pop)} usual residents.`);
  }

  // 2. Income — bullet is omitted entirely when no verified income exists.
  if (inc && sm.income) {
    const pct = Math.round((inc - sm.income) / sm.income * 100);
    const sign = pct >= 0 ? '+' : '';
    items.push(`<strong>Purchasing power:</strong> median household income $${fmt(inc)}/year (${sign}${pct}% vs ${s.state_name} suburb median of $${fmt(sm.income)}).`);
  } else if (inc) {
    items.push(`<strong>Purchasing power:</strong> median household income $${fmt(inc)}/year.`);
  }

  // 3. Cash-flow coverage (rent + mortgage are both 2021 Census — keep the
  //    ratio period-consistent; the current rent is shown in Key Indicators).
  const ri = rentInfo(s);
  if (rent && mort) {
    const monthlyRent = Math.round(rent * 52 / 12);
    const coverage = Math.round((monthlyRent / mort) * 100);
    items.push(`<strong>Cash-flow coverage (2021 Census):</strong> $${fmt(rent)}/week rent (≈ $${fmt(monthlyRent)}/month) covered ~${coverage}% of the $${fmt(mort)}/month median mortgage at the 2021 Census — verify against current rents and rates.`);
  } else if (ri) {
    items.push(`<strong>Gross rental income:</strong> $${fmt(ri.value)}/week (${ri.label})${ri.geoNote}, ~$${fmt(ri.value * 52)}/year.`);
  } else {
    items.push(`<strong>Gross rental income:</strong> verify via realestate.com.au — median rent data was not captured for this suburb.`);
  }

  // 4. CBD access
  if (dist != null && capital) {
    const note = sm.distance != null ? ` (state suburb median ${sm.distance} km)` : '';
    items.push(`<strong>CBD access:</strong> ${dist} km straight-line from ${capital}${note}.`);
  } else {
    items.push(`<strong>CBD access:</strong> distance not recorded for this suburb — check the driving time to your nearest major centre before committing.`);
  }

  // 5. Dwelling mix
  if (housePct != null) {
    const label = housePct >= 70 ? 'house-dominant' : housePct >= 40 ? 'mixed' : 'unit-heavy';
    const state = sm.housePct != null ? ` (vs ${sm.housePct}% state median)` : '';
    items.push(`<strong>Dwelling mix:</strong> ${housePct}% separate houses — ${label} market${state}.`);
  } else {
    items.push(`<strong>Home mix:</strong> the housing-type split was not captured — verify on the ground.`);
  }

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
    <h2>Investor checklist</h2>
    <p class="suburb-checklist-note">Pre-inspection briefing for ${escHtml(s.suburb)} — every item is derived from public datasets, with full citations in our <a href="/data-sources">data sources</a> page.</p>
    <ul class="suburb-checklist">
${lis}
    </ul>
  </section>`;
}

// ── Phase: lifestyle, audience fit, pros/cons, investment tip, blog links ──
// All data-driven; no free-text invention. Each branch pulls a real field from
// the suburb record so the same combination of numbers can't be produced by
// any other suburb.

// School/park counts are population-derived guesses and transport_score is a
// name-seeded placeholder (generate-suburbs-data.js) — none of them may render
// as fact, so this section only uses real fields (distance, dwelling mix).
function generateLifestyle(s) {
  const capital = stateCapitals[s.state];
  const dist = s.distance_to_cbd;
  const popGrowth = s.population_growth;
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

  // Population growth
  if (popGrowth && popGrowth > 2) {
    bullets.push(pick(h >> 1, [
      `Growing community — population has trended upward over recent census cycles.`,
      `Population is expanding, a sign of sustained demand.`,
    ]));
  } else if (popGrowth && popGrowth > 0) {
    bullets.push(`Steady population base — a stable community with modest growth.`);
  }

  // Dwelling mix / lifestyle
  if (housePct != null) {
    if (housePct >= 75) {
      bullets.push(`Predominantly separate houses (${housePct}%) — suburban lifestyle with more land.`);
    } else if (housePct <= 30) {
      bullets.push(`High-density unit mix (${100 - housePct}% non-house dwellings) — urban, low-maintenance living.`);
    }
  }

  // Type-specific flavour as a final bullet to round out the list. Only added
  // alongside at least one data-driven bullet — a section made purely of
  // generic boilerplate must not render.
  if (bullets.length && bullets.length < 5) {
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
    <h2>Why people like living in ${escHtml(s.suburb)}</h2>
    <ul class="suburb-lifestyle-list">
${lis}
    </ul>
  </section>`;
}

function generateAudience(s, sm) {
  sm = sm || {};
  const housePct = s.house_percentage != null ? s.house_percentage : 50;
  const dist = s.distance_to_cbd;
  const type = s.suburb_type;
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const inc = s.median_household_income;

  // Families: house-dominant dwelling mix (real ABS field). school_count is a
  // population-derived guess and must not drive or appear in this verdict.
  const familiesFit = housePct >= 55;

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
          ? `${housePct}% separate houses — a family-oriented dwelling mix.`
          : (s.house_percentage != null
              ? `Only ${housePct}% separate houses — lighter on family-sized homes.`
              : `Dwelling-mix data wasn't captured — check the local housing stock.`)),
    row(investorsFit, '📊', 'Investors',
        investorsFit
          ? (rent && mort ? `Rent covers a solid share of the median mortgage.` : `Affordable entry for rental-focused buyers.`)
          : (rent && mort ? `Rental coverage trails the state average.` : `Rent-to-mortgage data not recorded — run your own numbers.`)),
    row(fhbFit, '🏡', 'First-home buyers',
        fhbFit
          ? (mort && sm.mortgage ? `Entry costs sit at or below the ${s.state_name} median.` : `An outer-ring area, where entry prices typically run lower.`)
          : (mort && sm.mortgage ? `Median mortgage sits above the ${s.state_name} median.` : `An inner or middle-ring area, where entry prices typically run higher.`)),
    row(professionalsFit, '💼', 'Professionals',
        professionalsFit
          ? (dist != null ? `Around ${dist} km from the CBD with good access.` : `Inner-ring location with city access.`)
          : (dist != null ? `Longer commute to the CBD.` : `Not an inner-city area — weigh the commute to your workplace.`)),
  ];

  return `  <section class="suburb-section suburb-audience">
    <h2>Who ${escHtml(s.suburb)} suits</h2>
    <div class="suburb-audience-grid">
${chips.join('\n')}
    </div>
  </section>`;
}

// school_count / park_count are population-derived guesses and transport_score
// is a name-seeded placeholder — none may appear in a pro or con.
function generateProsCons(s, sm) {
  sm = sm || {};
  const pros = [];
  const cons = [];
  const rent = s.median_rent_weekly;
  const mort = s.median_mortgage_monthly;
  const inc = s.median_household_income;
  const dist = s.distance_to_cbd;
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
  if (dist != null && dist <= 10) pros.push('Short distance to the CBD makes commuting straightforward.');

  // Fall-back pros so there are always at least 3 bullets
  if (pros.length < 3) {
    if (type === 'outer-metro') pros.push('Affordable entry point compared with inner-city suburbs.');
    if (type === 'inner-city')  pros.push('Lifestyle access to shops, cafes and amenities.');
    if (type === 'middle-ring') pros.push('Established middle-ring position between the CBD and the urban fringe.');
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
  if (popGrowth && popGrowth < 0) cons.push('Population has been flat or declining — softens long-run demand.');

  // Fall-back cons so there are always at least 2 bullets
  if (cons.length < 2) cons.push('Traffic can build during peak hours, especially on arterial roads.');
  if (cons.length < 2) cons.push('Prices may rise further as demand continues.');

  const renderList = (arr) => arr.slice(0, 5).map(x => `        <li>${escHtml(x)}</li>`).join('\n');

  return `  <section class="suburb-section suburb-proscons">
    <h2>Pros and cons</h2>
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
    closing = ` At the 2021 Census, local rents consumed roughly ${rentYrPct}% of household income — a dated but useful sanity check on tenant affordability.`;
  } else if (s.distance_to_cbd != null && stateCapitals[s.state]) {
    closing = ` Proximity to ${stateCapitals[s.state]} (~${s.distance_to_cbd} km) is a key driver of demand here.`;
  } else if (s.population) {
    closing = ` With around ${fmt(s.population)} residents, the suburb offers enough depth for typical rental turnover.`;
  }

  return `  <section class="suburb-section suburb-tip">
    <h2>Investment tip</h2>
    <p>${escHtml(base)}${escHtml(closing)}</p>
  </section>`;
}

// (Blog cross-linking removed Aug 2026 — the blog is dark behind BLOG_ENABLE,
// so suburb pages must not link /blog/ posts. The {{BLOG_LINKS_HTML}}
// placeholder was removed from templates/suburb-page.html at the same time.)

// Short methodology pointer for suburb pages — adds an E-E-A-T anchor.
// Every claim in this paragraph is conditional on the field actually being
// present on the page. The old static version claimed income, dwelling mix and
// CBD distance as real ABS figures even when those fields were placeholder or
// null — a provenance paragraph must never overstate what's on the page.
function generateMethodologyBlock(s) {
  const bits = [];
  bits.push(`The population figure on this page comes from the <a href="https://www.abs.gov.au/census" target="_blank" rel="noopener">ABS 2021 Census</a>. The postcode comes from a community postcode dataset cross-checked against Australia Post.`);
  if (s.house_percentage != null) {
    bits.push(` The dwelling mix is from the ABS 2021 Census.`);
  }
  if (s.median_household_income) {
    // Only reachable when apply-abs-data.js has tagged real ABS income —
    // the placeholder is nulled before rendering.
    bits.push(` The median household income is the ABS 2021 Census median weekly household income, annualised.`);
  }
  if (s.distance_to_cbd != null) {
    bits.push(` Distance to the CBD is calculated from the suburb's ABS centroid.`);
  }
  if (s.median_rent_weekly || s.median_mortgage_monthly) {
    bits.push(` The Census median rent and mortgage figures are <strong>2021 figures</strong> and are labelled as such wherever they appear — they are five years old and have moved substantially since.`);
  }
  if (s.current_rent) {
    bits.push(` The <strong>current median weekly rent</strong> in Key indicators is a genuine recent figure from ${escHtml(s.current_rent_source || 'state-government open data')} (${escHtml(s.current_rent_period || 'latest published period')}), published under a Creative Commons licence and dated on the page.`);
  }
  if (s.current_price_house || s.current_price_unit) {
    bits.push(` The median sale price${s.current_price_house && s.current_price_unit ? 's' : ''} shown ${s.current_price_house && s.current_price_unit ? 'come' : 'comes'} from ${escHtml(s.current_price_source || 'state-government open data')} (${escHtml(s.current_price_period || 'latest published period')}), published under a Creative Commons licence and dated on the page.`);
  }
  bits.push(` We do not publish an investment score or school/park counts for this suburb. See our <a href="/methodology">methodology</a> and <a href="/data-sources">data sources</a> for exactly what's measured and what's estimated.`);
  return `  <section class="suburb-section suburb-methodology">
    <h2>How we built this ${escHtml(s.suburb)} profile</h2>
    <p>${bits.join('')}</p>
  </section>`;
}

// Current sale-price + yield section (state-government open data, CC BY 4.0).
// Rent lives in Key Indicators; this shows sale prices + derived yield when present.
function _statTile(label, value, detailHtml) {
  return `      <details class="suburb-stat">
        <summary>
          <div class="suburb-stat-label">${escHtml(label)}</div>
          <div class="suburb-stat-value">${escHtml(value)}</div>
        </summary>
        <div class="suburb-stat-detail"><p>${detailHtml}</p></div>
      </details>`;
}
function generateCurrentMarket(s) {
  const tiles = [];
  const cap = (label) => {
    const geo = (s.current_price_geo && s.current_price_geo !== 'suburb')
      ? ` Figure covers ${escHtml(s.current_price_geo)}.` : '';
    return `${escHtml(label)} — as at ${escHtml(s.current_price_period || '')}, ${escHtml(s.current_price_source || '')}${s.current_price_licence ? ` (${escHtml(s.current_price_licence)})` : ''}.${geo}`;
  };
  if (s.current_price_house) tiles.push(_statTile('Median house price', `$${fmt(s.current_price_house)}`, cap('Median house sale price')));
  if (s.current_price_unit)  tiles.push(_statTile('Median unit price',  `$${fmt(s.current_price_unit)}`,  cap('Median unit sale price')));
  if (s.current_gross_yield) tiles.push(_statTile('Indicative gross yield', `${s.current_gross_yield}%`,
    'Estimated as current median rent &#215; 52 &#247; current median house price. A guide only — not a guaranteed return; excludes costs, vacancy and buying expenses.'));
  if (!tiles.length) return '';
  return `  <section class="suburb-section">
    <h2>Sale prices &amp; yield</h2>
    <div class="suburb-grid">
${tiles.join('\n')}
    </div>
  </section>`;
}

// ── Review prefetch (Phase 4) ───────────────────────────────────────────
// Fetches approved reviews from Upstash Redis via a tiny helper script so
// the rest of this build stays synchronous. Safe no-op when env vars absent;
// hard failure when env vars are set but Redis errors, so a broken pipeline
// never deploys silently.
let reviewsByKey = {};
(function prefetchReviews() {
  try {
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
  } catch (e) {
    // Non-fatal: reviews are additive enrichment, so a transient Redis/network error
    // (or a >90s timeout) builds without them rather than aborting the entire deploy.
    console.warn('[build-suburbs] Review prefetch failed (non-fatal) — building without reviews:', e.message);
    reviewsByKey = {};
  }
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
    '    <h2>Community reviews of ' + escHtml(suburbName) + '</h2>\n' +
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

// ── The surviving set (Aug 2026 product cut) ────────────────────────────
// Only suburbs passing the real-data gate are generated at all. Everything
// downstream (pages, hubs, directory index, related links, search index,
// sitemap) is built from keptSuburbs so no generated page can link a slug
// that has no page.
const keptSuburbs = suburbs.filter(s => !shouldNoindex(s));

// Clean stale output up-front so pages cut from the dataset — and the old
// /invest/{state}/{city}/ city pages — can never survive a rebuild in a
// reused workspace or restored build cache.
fs.rmSync(path.join(ROOT, 'suburb'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'invest'), { recursive: true, force: true });
for (const f of fs.readdirSync(ROOT)) {
  if (/^sitemap-suburbs.*\.xml$/.test(f)) fs.unlinkSync(path.join(ROOT, f));
}

let suburbCount = 0;
const stateIndexStats = {}; // state → { indexed, noindexed, total } (shape kept for the admin Suburbs tab)
const stateGroups = {}; // state → surviving suburbs only

for (const s of keptSuburbs) {
  if (!stateGroups[s.state]) stateGroups[s.state] = [];
  stateGroups[s.state].push(s);
}

// Pre-compute state medians once (used by every enrichment generator).
// Still computed across the FULL dataset (population + postcode floor applied
// inside) so each suburb's Δ-to-state prose keeps a stable reference point.
const stateMedians = computeStateMedians(suburbs);

// Related/nearby suburbs are computed ONLY across the surviving set. The map
// is keyed and grouped by state+slug inside buildRelatedMap, so same-name
// suburbs in different states (e.g. Belmont VIC vs Belmont QLD) can't collide
// and every related link targets a page that exists.
const relatedMap = buildRelatedMap(keptSuburbs);

for (const s of keptSuburbs) {
  const related = getRelatedSuburbs(s, relatedMap);
  const sm = stateMedians[s.state] || {};
  const pc = s.postcode || '';
  const pcTitle = pc ? `${pc} ` : '';
  const pcComma = pc ? ` ${pc},` : ',';
  const pcKw = pc ? `, ${pc} property` : '';
  const pcDisplay = pc || '—';

  // SEO title, H1, and meta description — interpolated per-page from data,
  // built to satisfy Google SERP length budgets (title <60, meta <155).
  const pageTitle = buildSuburbTitle(s);
  const pageH1    = buildSuburbH1(s.suburb, s.state, pc);
  const metaDesc  = buildSuburbMetaDesc(s);

  // Distance display: real km with note, or N/A
  const distDisplay = s.distance_to_cbd != null
    ? `${s.distance_to_cbd} km`
    : 'N/A';

  // Rent display — prefer CURRENT state-gov median rent; fall back to the 2021
  // Census figure (clearly dated) only when no current figure exists.
  const rentIsCurrent = !!s.current_rent;
  const rentVal = s.current_rent || s.median_rent_weekly;
  const rentDisplay = rentVal ? `$${fmt(rentVal)}/wk` : 'N/A';
  const rentGeoNote = (rentIsCurrent && s.current_rent_geo && s.current_rent_geo !== 'suburb')
    ? ` Figure covers the ${escHtml(s.current_rent_geo)}, not the suburb alone.` : '';
  const rentDetail = rentIsCurrent
    ? `Median weekly rent — as at ${escHtml(s.current_rent_period || '')}, ${escHtml(s.current_rent_source || '')}${s.current_rent_licence ? ` (${escHtml(s.current_rent_licence)})` : ''}.${rentGeoNote}`
    : (s.median_rent_weekly
        ? `Median weekly rent recorded at the 2021 Census — market rents have risen since, so treat this as a dated baseline, not a current figure.`
        : `A current median rent has not been published for this suburb.`);

  // (No income display: the "Median household income" stat tile was removed
  // from templates/suburb-page.html — the committed income field is a
  // name-seeded placeholder unless tagged income_source = 'abs2021', and the
  // normalization pass at the top of this file nulls untagged values.)

  // Mortgage display
  const mortgageDisplay = s.median_mortgage_monthly
    ? `$${fmt(s.median_mortgage_monthly)}/mo`
    : 'N/A';

  // Dwelling type display
  const housePctDisplay = s.house_percentage != null
    ? `${s.house_percentage}% houses`
    : 'N/A';

  // (No school/park fills: the {{SCHOOL_COUNT}}/{{PARK_COUNT}} stat tiles were
  // removed from the template — the counts are population-derived guesses.)

  // Data source note for hero
  const dataSourceNote = `ABS 2021 Census demographics · current market data`;

  // Suburb locator card — inline SVG state silhouette with a red dot at the
  // suburb's lat/lng centroid (set by build/apply-abs-data.js from ABS
  // polygon data). Replaces the old Google Maps iframe — renders instantly
  // because there's nothing to fetch beyond the page itself.
  const locatorCardHtml = generateLocatorCard(s);

  // Every generated page passes the real-data gate → default index,follow
  // (no robots meta emitted), exactly as gate-passing pages rendered before.
  if (!stateIndexStats[s.state]) stateIndexStats[s.state] = { indexed: 0, noindexed: 0, total: 0 };
  stateIndexStats[s.state].total++;
  stateIndexStats[s.state].indexed++;

  // NOTE: function replacements throughout — generated HTML routinely contains
  // `$` (prices), which String.replace treats as a special pattern character.
  let html = SUBURB_TPL
    .replace(/\{\{ROBOTS_META\}\}/g, () => '')
    .replace(/\{\{JOURNEY_LINK\}\}/g, () => '/journey?near=' + encodeURIComponent(s.suburb) + '&amp;st=' + s.state.toLowerCase())
    .replace(/\{\{SUBURB\}\}/g, () => escHtml(s.suburb))
    .replace(/\{\{STATE\}\}/g, () => escHtml(s.state))
    .replace(/\{\{STATE_LOWER\}\}/g, () => s.state.toLowerCase())
    .replace(/\{\{STATE_NAME\}\}/g, () => escHtml(s.state_name))
    .replace(/\{\{SLUG\}\}/g, () => s.slug)
    .replace(/\{\{POSTCODE\}\}/g, () => escHtml(pc))
    .replace(/\{\{POSTCODE_TITLE\}\}/g, () => escHtml(pcTitle))
    .replace(/\{\{POSTCODE_COMMA\}\}/g, () => escHtml(pcComma))
    .replace(/\{\{POSTCODE_KW\}\}/g, () => escHtml(pcKw))
    .replace(/\{\{POSTCODE_DISPLAY\}\}/g, () => escHtml(pcDisplay))
    .replace(/\{\{PAGE_TITLE\}\}/g, () => escHtml(pageTitle))
    .replace(/\{\{PAGE_H1\}\}/g, () => escHtml(pageH1))
    .replace(/\{\{META_DESCRIPTION\}\}/g, () => escHtml(metaDesc))
    .replace(/\{\{OVERVIEW\}\}/g, () => generateOverview(s))
    .replace(/\{\{POPULATION\}\}/g, () => fmt(s.population))
    .replace(/\{\{DISTANCE_TO_CBD\}\}/g, () => distDisplay)
    .replace(/\{\{MEDIAN_RENT\}\}/g, () => rentDisplay)
    .replace(/\{\{RENT_DETAIL\}\}/g, () => rentDetail)
    .replace(/\{\{MEDIAN_MORTGAGE\}\}/g, () => mortgageDisplay)
    .replace(/\{\{HOUSE_PCT\}\}/g, () => housePctDisplay)
    .replace(/\{\{DATA_SOURCE_NOTE\}\}/g, () => escHtml(dataSourceNote))
    .replace(/\{\{LOCATOR_CARD_HTML\}\}/g, () => locatorCardHtml)
    .replace(/\{\{CURRENT_MARKET_HTML\}\}/g, () => generateCurrentMarket(s))
    .replace(/\{\{INVESTMENT_INSIGHT\}\}/g, () => generateInsight(s, sm))
    .replace(/\{\{STRATEGY_HTML\}\}/g, () => generateStrategy(s, sm))
    .replace(/\{\{RISK_FACTORS_HTML\}\}/g, () => generateRisks(s, sm))
    .replace(/\{\{OUTLOOK_HTML\}\}/g, () => generateOutlook(s, sm))
    .replace(/\{\{FAQ_HTML\}\}/g, () => generateFAQ(s, sm))
    .replace(/\{\{COMPARE_HTML\}\}/g, () => generateComparisonTable(s, sm))
    .replace(/\{\{CHECKLIST_HTML\}\}/g, () => generateInvestorChecklist(s, sm))
    .replace(/\{\{METHODOLOGY_HTML\}\}/g, () => generateMethodologyBlock(s))
    .replace(/\{\{LIFESTYLE_HTML\}\}/g, () => generateLifestyle(s))
    .replace(/\{\{AUDIENCE_HTML\}\}/g, () => generateAudience(s, sm))
    .replace(/\{\{PROSCONS_HTML\}\}/g, () => generateProsCons(s, sm))
    .replace(/\{\{INVESTMENT_TIP_HTML\}\}/g, () => generateInvestmentTip(s, sm))
    .replace(/\{\{REVIEWS_HTML\}\}/g, () => generateReviewsBlock(s.state, s.slug, s.suburb))
    .replace(/\{\{AGGREGATE_RATING_JSON\}\}/g, () => generateAggregateRatingJson(s.state, s.slug, s.suburb))
    .replace(/\{\{RELATED_SUBURBS_HTML\}\}/g, () => generateRelatedHTML(related, s.state))
    .replace(/\{\{RESOURCES_HTML\}\}/g, () => generateResourcesHTML(s.state));

  const outDir = path.join(ROOT, 'suburb', s.state.toLowerCase(), s.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  suburbCount++;
}

// (City pages cut Aug 2026 — the 19 /invest/{state}/{city-slug}/ pages and
// templates/city-page.html were removed; their aggregate scores rested on
// placeholder data and the product is now the /journey first-home planner.)

// All 8 states/territories keep a hub page — states with no surviving suburb
// profiles render an honest empty-state hub rather than disappearing.
const allStates = Object.keys(stateNames).sort();

// ── State-hub content generators ──

const stateMarketSummaries = {
  QLD: {
    body: `Queensland's property market is driven by population growth, interstate migration and lifestyle-led demand from Brisbane, the Gold Coast and the Sunshine Coast. First home buyers pay no transfer duty on established homes up to $700,000 (phasing out at $800,000) and none at all on new homes at any price (contracts from 1 May 2025). Foreign buyers pay an 8% surcharge.`,
    fhbThreshold: '$700,000 established (phasing to $800,000); new homes exempt, no cap',
    revenueOffice: 'Queensland Revenue Office (QRO)',
    revenueOfficeUrl: 'https://qro.qld.gov.au/',
    foreignSurcharge: '8%'
  },
  NSW: {
    body: `New South Wales is Australia's largest property market by capital value, anchored by Sydney's tier-one global-city economy. Revenue NSW applies progressive transfer duty (1.25%–7.0%) with first home buyer exemptions up to $800,000 and concessions to $1,000,000. Foreign buyers pay an additional 9% surcharge.`,
    fhbThreshold: '$800,000 (full exemption), $1,000,000 (sliding concession)',
    revenueOffice: 'Revenue NSW',
    revenueOfficeUrl: 'https://www.revenue.nsw.gov.au/',
    foreignSurcharge: '9%'
  },
  VIC: {
    body: `Victoria's property market is dominated by Melbourne, Australia's second-largest city, with strong satellite markets in Geelong, Ballarat, and Bendigo. The Victorian SRO charges progressive duty (1.4%–6.5%) and first home buyers are exempt up to $600,000 with concessions to $750,000. Foreign buyers pay 8% in addition.`,
    fhbThreshold: '$600,000 (full exemption), $750,000 (sliding concession)',
    revenueOffice: 'State Revenue Office Victoria',
    revenueOfficeUrl: 'https://www.sro.vic.gov.au/',
    foreignSurcharge: '8%'
  },
  SA: {
    body: `South Australia's property market is centred on Adelaide, with growing regional centres along the Yorke and Fleurieu peninsulas. Since 6 June 2024, first home buyer duty relief applies to new homes, off-the-plan purchases and vacant land only, with no value cap — established homes get no FHB relief. Foreign buyers pay a 7% surcharge.`,
    fhbThreshold: 'New homes and vacant land: no duty, no cap. Established homes: no FHB relief',
    revenueOffice: 'RevenueSA',
    revenueOfficeUrl: 'https://www.revenuesa.sa.gov.au/',
    foreignSurcharge: '7%'
  },
  WA: {
    body: `Western Australia's property market is anchored by Perth and supported by mining-driven regional centres, with some of the lowest duty rates nationally. First home buyers are exempt up to $600,000 with a sliding concession to $800,000 (transactions from 7 May 2026). The foreign buyer surcharge is 7%.`,
    fhbThreshold: '$600,000 (full exemption), $800,000 (sliding concession) — from 7 May 2026',
    revenueOffice: 'RevenueWA',
    revenueOfficeUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty',
    foreignSurcharge: '7%'
  },
  TAS: {
    body: `Tasmania's property market is driven by Hobart and Launceston, with lifestyle-led migration from mainland states keeping demand resilient. Tasmania's first home buyer duty exemption for established homes ended on 30 June 2026 — first home buyers now pay full duty, though the First Home Owner Grant still applies to new builds. Foreign buyers pay an 8% surcharge.`,
    fhbThreshold: 'No FHB duty relief (established-home exemption ended 30 Jun 2026)',
    revenueOffice: 'State Revenue Office Tasmania',
    revenueOfficeUrl: 'https://www.sro.tas.gov.au/',
    foreignSurcharge: '8%'
  },
  ACT: {
    body: `The Australian Capital Territory's market is dominated by Canberra, supported by stable Commonwealth Government employment. From 1 July 2026 the Home Buyer Concession Scheme has no income test and no property value limit — eligible buyers who haven't owned property in the previous five years pay no conveyance duty at any price. There is no foreign buyer surcharge.`,
    fhbThreshold: 'No duty for eligible buyers, no value limit (HBCS, from 1 Jul 2026)',
    revenueOffice: 'ACT Revenue Office',
    revenueOfficeUrl: 'https://www.revenue.act.gov.au/',
    foreignSurcharge: '0% (no surcharge)'
  },
  NT: {
    body: `The Northern Territory's market is dominated by Darwin, with regional centres in Alice Springs and Katherine. There is no value-based first home buyer duty concession — relief comes through the House & Land Package Exemption (no value cap, contracts to 30 June 2027) and the $50,000 HomeGrown Territory grant for new homes. There is no foreign buyer surcharge.`,
    fhbThreshold: 'No value-based FHB concession — house & land exemption + $50k grant instead',
    revenueOffice: 'Territory Revenue Office',
    revenueOfficeUrl: 'https://treasury.nt.gov.au/dtf/territory-revenue-office',
    foreignSurcharge: '0% (no surcharge)'
  }
};

// All three hub generators consume ONLY the surviving suburbs for the state
// (the pages that actually exist), so every count and average on a hub
// reflects real published profiles — never the cut catalogue.

function generateStateOverviewHTML(state, stateName, stateSubs) {
  const summary = stateMarketSummaries[state] || { body: `${stateName} is one of Australia's eight states and territories.` };
  const n = stateSubs.length;
  let dataSentence;
  if (n) {
    const totalPop = stateSubs.reduce((a, s) => a + (s.population || 0), 0);
    const incSubs = stateSubs.filter(s => s.median_household_income);
    const avgInc = incSubs.length ? Math.round(incSubs.reduce((a, s) => a + s.median_household_income, 0) / incSubs.length) : null;
    dataSentence = `We currently publish ${fmt(n)} ${stateName} suburb profiles — every one carries a current, suburb-level median rent or sale price from state-government open data. Their combined usual resident population is approximately ${fmt(totalPop)}${avgInc ? `, and the average median household income across them is $${fmt(avgInc)}/year (ABS 2021 Census)` : ''}.`;
  } else {
    dataSentence = `We don't currently publish suburb profiles for ${stateName}. A profile requires a genuine, current, suburb-level median rent or sale price from government open data, and ${stateName} doesn't yet publish one at suburb level. The state-wide costs below (stamp duty, concessions) still apply.`;
  }
  return `<p>${summary.body}</p><p>${dataSentence}</p>`;
}

function generateStateStatsHTML(state, stateName, stateSubs) {
  const summary = stateMarketSummaries[state] || {};
  const n = stateSubs.length;
  const totalPop = stateSubs.reduce((a, s) => a + (s.population || 0), 0);
  const incSubs = stateSubs.filter(s => s.median_household_income);
  const avgInc = incSubs.length ? Math.round(incSubs.reduce((a, s) => a + s.median_household_income, 0) / incSubs.length) : null;
  // Current (state-gov) figures only — the 2021 Census rent average that used
  // to sit here read as if it were today's market.
  const rentSubs = stateSubs.filter(s => s.current_rent);
  const avgRent = rentSubs.length ? Math.round(rentSubs.reduce((a, s) => a + s.current_rent, 0) / rentSubs.length) : null;
  const priceSubs = stateSubs.filter(s => s.current_price_house);
  const avgPrice = priceSubs.length ? Math.round(priceSubs.reduce((a, s) => a + s.current_price_house, 0) / priceSubs.length) : null;
  const rows = [
    ['Suburb profiles published', fmt(n)],
    n ? ['Combined population (profiled suburbs)', fmt(totalPop)] : null,
    avgInc ? ['Average median household income (2021 Census)', `$${fmt(avgInc)}/year`] : null,
    avgRent ? ['Average current median rent (gov. data)', `$${fmt(avgRent)}/week`] : null,
    avgPrice ? ['Average current median house price (gov. data)', `$${fmt(avgPrice)}`] : null,
    summary.fhbThreshold ? ['First home buyer concession', summary.fhbThreshold] : null,
    summary.foreignSurcharge ? ['Foreign buyer surcharge', summary.foreignSurcharge] : null,
    summary.revenueOffice ? ['Revenue office', `<a href="${summary.revenueOfficeUrl}" target="_blank" rel="noopener">${escHtml(summary.revenueOffice)} →</a>`] : null
  ].filter(Boolean);
  return `<table class="state-stats-table" style="width:100%;border-collapse:collapse;margin:8px 0">`
    + `<tbody>` + rows.map(([k, v]) => `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid currentColor;font-weight:500">${k}</th><td style="text-align:right;padding:8px;border-bottom:1px solid currentColor">${v}</td></tr>`).join('') + `</tbody></table>`;
}

function generateStateFaqHTML(state, stateName, stateSubs) {
  const summary = stateMarketSummaries[state] || {};
  const n = stateSubs.length;
  const incSubs = stateSubs.filter(s => s.median_household_income);
  const avgInc = incSubs.length ? Math.round(incSubs.reduce((a, s) => a + s.median_household_income, 0) / incSubs.length) : null;
  const faqs = [
    {
      q: `How many suburbs are profiled for ${stateName}?`,
      a: n
        ? `EquitySight publishes ${fmt(n)} ${stateName} suburb profiles. We only publish a suburb page when it can carry a genuine, current, suburb-level median rent or sale price from state-government open data — each profile pairs that figure with ABS 2021 Census population, strategy context and a 2026 outlook.`
        : `None yet. We only publish a suburb page when a genuine, current, suburb-level median rent or sale-price figure is available from state-government open data. ${stateName} figures published so far are postcode-level or not yet released at suburb level, so ${stateName} profiles will come online once that data is published.`
    },
    {
      q: `What stamp duty applies to ${stateName} property?`,
      a: `${stateName} stamp duty (transfer duty) is collected by the ${summary.revenueOffice || 'state revenue office'}. The first home buyer concession threshold is ${summary.fhbThreshold || 'set per state'}. Foreign buyer surcharge: ${summary.foreignSurcharge || 'check with the revenue office'}. Use our <a href="/tools/stamp-duty-calculator">all-states stamp duty calculator</a> or the dedicated <a href="/tools/stamp-duty-calculator-${state.toLowerCase()}">${state} stamp duty calculator</a> for an exact figure.`
    },
    // Income FAQ only when at least one surviving suburb carries a verified
    // (abs2021) income — otherwise the question is dropped rather than
    // answered with "no data".
    avgInc ? {
      q: `What's the average household income across ${stateName} suburbs?`,
      a: `The average median household income across the ${fmt(incSubs.length)} profiled ${stateName} suburbs is approximately $${fmt(avgInc)} per year (ABS 2021 Census). Income varies significantly by suburb — inner-city and middle-ring suburbs typically run 20–40% above this average, while regional and outer-metro localities run below.`
    } : null,
    // Only meaningful when there is a list above to browse.
    n ? {
      q: `Which ${stateName} suburbs are best for property investment?`,
      a: `"Best" depends on whether you are targeting capital growth, rental yield, or value-add renovation. Each ${stateName} suburb profile on EquitySight breaks down buy-and-hold, rental yield and renovation strategies against the public data available for that suburb. Browse the suburb list above, sorted by population, or use the search box to filter by name or postcode.`
    } : null,
    {
      q: `When was the data on these ${stateName} pages last updated?`,
      a: `Suburb populations come from the ABS 2021 Census of Population and Housing — the latest available; where shown, Census median rent and mortgage figures are 2021 figures and are labelled as such. Where shown, the current median rent and sale-price figures come from state-government open data (QLD RTA, SA CBS, TAS DoJ, VIC VGV) published under Creative Commons licences, each dated with its period on the page. Stamp duty rates and FHB thresholds are kept current to the 2026–27 financial year.`
    }
  ].filter(Boolean);
  return faqs.map(f => `<details class="suburb-faq-item"><summary>${escHtml(f.q)}</summary><div class="suburb-faq-detail"><p>${f.a}</p></div></details>`).join('\n    ');
}

// ── Build state hub pages ──

let hubCount = 0;

for (const state of allStates) {
  // Surviving suburbs only — hubs are honest directories of pages that exist.
  const stateSuburbs = (stateGroups[state] || []).slice().sort((a, b) => b.population - a.population);
  const stateName = stateNames[state];
  const stateLower = state.toLowerCase();
  const n = stateSuburbs.length;

  // State navigation
  const stateNavHTML = allStates.map(st =>
    `      <a href="/invest/${st.toLowerCase()}/"${st === state ? ' class="active"' : ''}>${st}</a>`
  ).join('\n');

  const suburbListHTML = stateSuburbs.map(s =>
    `      <a href="/suburb/${stateLower}/${s.slug}/" class="hub-suburb-card" data-search="${escHtml((s.suburb + ' ' + (s.postcode || '')).toLowerCase().trim())}">\n        <div class="hub-suburb-name">${escHtml(s.suburb)}${s.postcode ? ` <span class="hub-suburb-pc">${escHtml(s.postcode)}</span>` : ''}</div>\n        <div class="hub-suburb-meta"><span>Pop. ${fmt(s.population)}</span>${s.distance_to_cbd != null ? `<span>${s.distance_to_cbd} km to CBD</span>` : ''}${s.median_household_income ? `<span>$${fmt(s.median_household_income)}/yr</span>` : ''}</div>\n        <div class="hub-suburb-tag">${s.suburb_type}</div>\n      </a>`
  ).join('\n');

  // Count-dependent copy computed here so empty-state hubs stay honest.
  const hubTitle = n
    ? `${stateName} Suburb Profiles — ${fmt(n)} Suburbs with Current Market Data | EquitySight`
    : `${stateName} Suburb Profiles | EquitySight`;
  const hubMetaDesc = n
    ? `Browse ${fmt(n)} ${stateName} suburb profiles — each with a current, government-published median rent or sale price plus ABS Census population.`
    : `No ${stateName} suburb profiles yet — we only publish a suburb page when current, suburb-level market data is available from government open data.`;
  const hubHeroText = n
    ? `${fmt(n)} ${stateName} suburb profiles, each built on a current, government-published median rent or sale price plus ABS Census population and postcode.`
    : `No ${stateName} suburb profiles yet. We only publish a suburb page when a current, suburb-level median rent or sale price is available from government open data — ${stateName} doesn't publish one yet.`;
  const hubListIntro = n
    ? `${fmt(n)} suburbs with a current, government-published median rent or sale price, ordered by population. Every card links to a full profile.`
    : `Nothing to list yet — ${stateName} suburb-level market data hasn't been published by a government source. Browse other states via the navigation above.`;
  // Search box only renders when there are cards to search (state-hub-search.js
  // no-ops without it).
  const hubSearchHTML = n
    ? `<input type="text" id="suburb-search" class="hub-search" placeholder="Search suburbs by name or postcode..." aria-label="Search suburbs by name or postcode" autocomplete="off">`
    : '';

  const stateOverviewHTML = generateStateOverviewHTML(state, stateName, stateSuburbs);
  const stateStatsHTML    = generateStateStatsHTML(state, stateName, stateSuburbs);
  const stateFaqHTML      = generateStateFaqHTML(state, stateName, stateSuburbs);

  // Function replacements — generated HTML contains `$` (prices), which
  // String.replace treats as a special pattern character.
  let html = HUB_TPL
    .replace(/\{\{STATE\}\}/g, () => escHtml(state))
    .replace(/\{\{STATE_LOWER\}\}/g, () => stateLower)
    .replace(/\{\{STATE_NAME\}\}/g, () => escHtml(stateName))
    .replace(/\{\{HUB_TITLE\}\}/g, () => escHtml(hubTitle))
    .replace(/\{\{HUB_META_DESC\}\}/g, () => escHtml(hubMetaDesc))
    .replace(/\{\{HUB_HERO_TEXT\}\}/g, () => escHtml(hubHeroText))
    .replace(/\{\{HUB_LIST_INTRO\}\}/g, () => escHtml(hubListIntro))
    .replace(/\{\{HUB_SEARCH_HTML\}\}/g, () => hubSearchHTML)
    .replace(/\{\{STATE_NAV_HTML\}\}/g, () => stateNavHTML)
    .replace(/\{\{STATE_OVERVIEW_HTML\}\}/g, () => stateOverviewHTML)
    .replace(/\{\{STATE_STATS_HTML\}\}/g, () => stateStatsHTML)
    .replace(/\{\{STATE_FAQ_HTML\}\}/g, () => stateFaqHTML)
    .replace(/\{\{SUBURB_LIST_HTML\}\}/g, () => suburbListHTML);

  const outDir = path.join(ROOT, 'invest', stateLower);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  hubCount++;
}

// ── Generate suburb directory index ──
// Lists ONLY the surviving suburbs, grouped by the states that actually have
// profiles — every link on this page targets a generated file.

const keptStates = allStates.filter(st => (stateGroups[st] || []).length);
const keptStateNamesList = keptStates.map(st => stateNames[st]).join(', ');

const dirIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script src="/site-init.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>All Australian Suburb Profiles — ${fmt(keptSuburbs.length)} Suburbs | EquitySight</title>
<meta name="description" content="Browse ${fmt(keptSuburbs.length)} Australian suburb profiles — every page carries a current, government-published median rent or sale price plus ABS Census population.">
<link rel="canonical" href="https://equitysight.app/suburb/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#1C1C1E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Geist+Mono:wght@300..700&display=swap" rel="stylesheet">
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
  <a href="/journey" class="tool-header-link">Plan your first home — free →</a>
</header>
<script src="/auth-nav.js"></script>
<script src="/error-capture.js"></script>

<section class="tool-hero">
  <nav class="suburb-breadcrumb">
    <a href="/">Home</a> <span>›</span>
    <span>All Suburbs</span>
  </nav>
  <div class="tool-eyebrow">Suburb Profiles · Australia</div>
  <h1>Australian Suburb Profiles</h1>
  <p>${fmt(keptSuburbs.length)} suburb profiles across ${keptStateNamesList} — each built on a current, government-published median rent or sale price. More states come online as suburb-level data is published.</p>
</section>

<div class="suburb-main">

  <section class="suburb-section">
    <h2>Browse by state</h2>
    <div class="state-nav">
${keptStates.map(st => `      <a href="#${st.toLowerCase()}">${st}</a>`).join('\n')}
    </div>
  </section>

${keptStates.map(state => {
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
    <div class="tool-cta-eye">Buying your first home?</div>
    <h3>Turn suburb research into a plan</h3>
    <p>Seven guided stops — government schemes compared for your exact numbers, a real budget, suburb shortlisting and every contract deadline tracked. Free, no signup to start.</p>
    <a href="/journey" class="tool-cta-btn">Start your first-home journey →</a>
  </section>

</div>

<div id="site-footer-root"></div>
<script src="/footer.js"></script>
</body>
</html>`;

const suburbIndexDir = path.join(ROOT, 'suburb');
fs.mkdirSync(suburbIndexDir, { recursive: true });
fs.writeFileSync(path.join(suburbIndexDir, 'index.html'), dirIndexHTML);
console.log(`Generated suburb directory index (${keptSuburbs.length} suburbs, ${keptStates.length} states with profiles)`);

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
}

// NOTE: /invest/ state hubs stay noindex,follow (see templates/state-hub.html)
// and out of the sitemap — they're navigation, not destination pages.

// Suburb pages → into their state bucket. Every generated page passes the
// gate, so the sitemap set and the generated set coincide by construction.
for (const s of keptSuburbs) {
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

// sitemap-blog.xml only exists when the blog is enabled (BLOG_ENABLE=true;
// unset = blog dark) — referencing it while dark would point Google at a
// dead file on every suburb rebuild.
const sitemapIndexEntries = [
  '  <sitemap>\n    <loc>https://equitysight.app/sitemap-core.xml</loc>\n  </sitemap>',
  ...(process.env.BLOG_ENABLE === 'true'
    ? ['  <sitemap>\n    <loc>https://equitysight.app/sitemap-blog.xml</loc>\n  </sitemap>']
    : []),
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
// (Stale sitemap-suburbs*.xml files — including states that no longer have
// any surviving suburbs — are removed by the up-front output cleanup.)

console.log(`Built ${suburbCount} suburb pages — all pass the real-data gate (index,follow); ${suburbs.length - suburbCount} gate-failing records not generated`);
console.log(`Built ${hubCount} state hub pages (${keptStates.length} with profiles)`);
console.log('Per-state generated pages:');
Object.keys(stateIndexStats).sort().forEach(st => {
  const r = stateIndexStats[st];
  console.log(`  ${st}: ${r.indexed}`);
});
console.log(`Generated sitemap.xml (index) + ${sitemapFiles.length} sitemap files (${totalSitemapUrls} URLs)`);
sitemapFiles.forEach(f => console.log(`  ${f.filename}: ${f.urlCount} URLs`));

// ── Write index report (consumed by the admin Suburbs tab) ──
// Written to /data because /build is excluded from the public Netlify CDN
// via .netlifyignore. /data is already partially public — suburbs.json is
// fetched client-side from the admin dashboard.
const indexReport = {
  generated_at: new Date().toISOString(),
  build_date: BUILD_DATE,
  total: suburbCount,
  indexed: suburbCount, // every generated page passes the gate
  noindexed: 0, // gate-failing records are no longer generated at all
  not_generated: suburbs.length - suburbCount,
  min_population_for_index: MIN_POPULATION_FOR_INDEX,
  by_state: stateIndexStats,
  quality_score_histogram: (() => {
    const bins = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    for (const s of keptSuburbs) {
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

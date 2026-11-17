#!/usr/bin/env node
/**
 * build-suburbs.js — generates the suburb pages, the state hub pages, the
 * /suburb/ directory index and the suburb sitemaps from data/suburbs.json and
 * the two templates.
 *
 * What a suburb page may contain (Nov 2026 rewrite):
 *   - the postcode and the ABS 2021 Census population;
 *   - the current median rent and/or sale medians from state-government open
 *     data (folded in by build/merge-market-current.js), each printed with its
 *     period and source;
 *   - arithmetic on those figures (a deposit as a share of the median, a
 *     weekly rent expressed per month and per year);
 *   - the nearest other profiled suburbs with their own figures.
 * Nothing else. There is no strategy, outlook, sentiment, "who it suits" or
 * pros-and-cons text: those were written from a postcode-derived suburb class
 * and name-seeded placeholder fields (suburb_type, transport_score,
 * amenity_score, school_count, park_count, median_household_income), which
 * must never reach a page. If a field is not listed above, do not render it.
 *
 * Only suburbs that pass shouldNoindex()'s real-data gate get a page.
 *
 * Usage: node build/build-suburbs.js
 * Output: /suburb/{state}/{slug}/index.html, /invest/{state}/index.html,
 *         /suburb/index.html, sitemap.xml, sitemap-suburbs-*.xml
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'suburbs.json');
const SUBURB_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'suburb-page.html'), 'utf8');
const HUB_TPL = fs.readFileSync(path.join(ROOT, 'templates', 'state-hub.html'), 'utf8');

const suburbs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// Locality centroids (community postcode dataset, MIT). Postcode-level, so two
// suburbs that share a postcode sit on the same point: distances are a guide
// to "roughly how far", never a measurement.
let COORDS = {};
try { COORDS = require(path.join(ROOT, 'data', 'suburb-coords.json')).coords || {}; } catch (e) { COORDS = {}; }

// ── Helpers ──

function fmt(n) { return Number(n).toLocaleString('en-AU'); }
function money(n) { return '$' + fmt(Math.round(n)); }
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// "$1.32m" / "$875k" — for titles and cards, where space is short.
function shortMoney(n) {
  if (n >= 1000000) return '$' + (Math.round(n / 10000) / 100).toFixed(2) + 'm';
  return '$' + Math.round(n / 1000) + 'k';
}
// "as at 2025 (preliminary)" reads badly; "for 2025 (preliminary)" does not.
function periodPhrase(period) {
  return /^\d{4}\b/.test(String(period || '')) ? 'for ' + period : 'as at ' + period;
}

const stateNames = {
  QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory'
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

function generateResourcesHTML(state) {
  return (stateResources[state] || []).map(([name, url]) =>
    `      <a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(name)} →</a>`
  ).join('\n');
}

// ── The figures a page may show ──────────────────────────────────────────
// One place decides what is real. Everything on the page is drawn from this.
function figures(s) {
  const geoOk = g => typeof g === 'string' && g.indexOf('suburb') === 0;
  const f = { rent: null, house: null, unit: null };
  if (s.current_rent && geoOk(s.current_rent_geo)) {
    f.rent = { value: s.current_rent, period: s.current_rent_period || '', source: s.current_rent_source || '' };
  }
  if ((s.current_price_house || s.current_price_unit) && geoOk(s.current_price_geo)) {
    const meta = { period: s.current_price_period || '', source: s.current_price_source || '' };
    if (s.current_price_house) f.house = Object.assign({ value: s.current_price_house }, meta);
    if (s.current_price_unit) f.unit = Object.assign({ value: s.current_price_unit }, meta);
  }
  return f;
}
function caption(fig) { return `${fig.period} · ${fig.source}`; }

// Short figure line for cards and lists: "$1.32m houses · $750/wk rent".
function figureLine(s) {
  const f = figures(s);
  const bits = [];
  if (f.house) bits.push(`${shortMoney(f.house.value)} houses`);
  if (f.unit) bits.push(`${shortMoney(f.unit.value)} units`);
  if (f.rent) bits.push(`$${fmt(f.rent.value)}/wk rent`);
  return bits.join(' · ');
}

// ── Title and meta description ───────────────────────────────────────────
// Title budget 60 characters, description 155. Each leads with the figure.
function buildSuburbTitle(s) {
  const f = figures(s);
  const region = `${s.state} ${s.postcode}`;
  const variants = [];
  if (f.rent) {
    variants.push(`${s.suburb} ${region} Median Rent $${f.rent.value}/wk | EquitySight`);
    variants.push(`${s.suburb} ${region} Median Rent $${f.rent.value}/wk`);
  }
  if (f.house) {
    variants.push(`${s.suburb} ${region} Median House Price ${shortMoney(f.house.value)}`);
    variants.push(`${s.suburb} ${region} House Price ${shortMoney(f.house.value)}`);
  }
  if (f.unit) variants.push(`${s.suburb} ${region} Median Unit Price ${shortMoney(f.unit.value)}`);
  variants.push(`${s.suburb} ${region} Suburb Profile`);
  for (const v of variants) if (v.length <= 60) return v;
  return `${s.suburb} ${region}`;
}

function buildSuburbMetaDesc(s) {
  const f = figures(s);
  const region = `${s.state} ${s.postcode}`;
  const pop = fmt(s.population);
  const parts = [];
  if (f.house) parts.push(`median house price ${money(f.house.value)} (${f.house.period})`);
  if (f.unit && !f.house) parts.push(`median unit price ${money(f.unit.value)} (${f.unit.period})`);
  if (f.rent) parts.push(`median rent $${fmt(f.rent.value)} a week (${f.rent.period})`);
  const variants = [
    `${s.suburb} ${region}: ${parts.join(', ')}. Population ${pop} at the 2021 Census. Government figures, each with its source.`,
    `${s.suburb} ${region}: ${parts.join(', ')}. Population ${pop} (2021 Census).`,
    `${s.suburb} ${region}: ${parts[0]}. Population ${pop} (2021 Census).`,
  ];
  for (const v of variants) if (v.length <= 155) return v;
  return `${s.suburb} ${region} suburb profile with government rent and price figures.`;
}

// ── Page sections ────────────────────────────────────────────────────────

function heroLine(s) {
  const f = figures(s);
  const bits = [];
  if (f.house) bits.push(`Median house price ${money(f.house.value)}`);
  if (f.unit) bits.push(`${f.house ? 'units' : 'Median unit price'} ${money(f.unit.value)}`);
  if (f.rent) bits.push(`${bits.length ? 'median rent' : 'Median rent'} $${fmt(f.rent.value)} a week`);
  return bits.join(', ') + `. Population ${fmt(s.population)}.`;
}

function tile(label, value, cap) {
  return `      <div class="suburb-fig">
        <div class="suburb-fig-label">${escHtml(label)}</div>
        <div class="suburb-fig-value">${escHtml(value)}</div>
        <div class="suburb-fig-cap">${escHtml(cap)}</div>
      </div>`;
}

function generateFiguresHTML(s) {
  const f = figures(s);
  const tiles = [];
  if (f.house) tiles.push(tile('Median house price', money(f.house.value), caption(f.house)));
  if (f.unit) tiles.push(tile('Median unit price', money(f.unit.value), caption(f.unit)));
  if (f.rent) tiles.push(tile('Median weekly rent', `$${fmt(f.rent.value)}`, caption(f.rent)));
  tiles.push(tile('Population', fmt(s.population), '2021 Census · Australian Bureau of Statistics'));
  tiles.push(tile('Postcode', s.postcode, 'A postcode can cover more than one suburb'));
  return tiles.join('\n');
}

// Plain arithmetic on the published figures. No duty, no repayments, no
// eligibility: those depend on the buyer and live in the calculators and the
// journey, which this section links to.
function generateBuyerHTML(s) {
  const f = figures(s);
  const st = s.state.toLowerCase();
  const out = [];
  const priced = [f.house && ['Houses', f.house], f.unit && ['Units', f.unit]].filter(Boolean);
  if (priced.length) {
    const rows = priced.map(([label, fig]) =>
      `        <tr><th scope="row">${label}</th><td>${money(fig.value)}</td><td>${money(fig.value * 0.05)}</td><td>${money(fig.value * 0.10)}</td><td>${money(fig.value * 0.20)}</td></tr>`
    ).join('\n');
    out.push(`    <p>A deposit is a share of the price you pay. This table shows how big each deposit would be on a home bought at the ${escHtml(s.suburb)} median. Half of the sales in the period were above the median and half below, so treat it as a middle point and check recent sales for the kind of home you want.</p>
    <div class="suburb-table-wrap">
      <table class="suburb-dep-table">
        <thead><tr><th scope="col">At the median</th><th scope="col">Price</th><th scope="col">5% deposit</th><th scope="col">10% deposit</th><th scope="col">20% deposit</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <p class="suburb-fig-note">Medians: ${escHtml(caption(priced[0][1]))}.${/^Q\d/.test(priced[0][1].period) ? ' That is one quarter of sales. In a small suburb a quarter can hold only a few sales, so the median can move a lot from one quarter to the next.' : ''} Stamp duty, legal costs and any lenders mortgage insurance come on top of the deposit.</p>`);
  }
  if (f.rent) {
    const perMonth = Math.round(f.rent.value * 52 / 12 / 10) * 10;
    out.push(`    <p>The median rent of $${fmt(f.rent.value)} a week works out to about ${money(perMonth)} a month, or ${money(f.rent.value * 52)} a year. If you rent nearby now, that is a useful number to hold a mortgage repayment against. Rent figure: ${escHtml(caption(f.rent))}.</p>`);
  }
  if (!priced.length) {
    out.push(`    <p>There is no median sale price on this page. No state government dataset I can republish gives one at suburb level for ${escHtml(s.state_name)}, and I do not fill the gap with an estimate.</p>`);
  }
  out.push(`    <p>To turn these into your own numbers, the <a href="/tools/stamp-duty-calculator-${st}">${escHtml(s.state)} stamp duty calculator</a> works out the duty at any price, and the <a href="/journey?near=${encodeURIComponent(s.suburb)}&amp;st=${st}">First Home Journey</a> puts the deposit, duty, schemes and repayments together for your savings and income.</p>`);
  return out.join('\n');
}

function generateFAQ(s) {
  const f = figures(s);
  const qa = [];
  if (f.house) qa.push([`What is the median house price in ${s.suburb}?`,
    `The median house price in ${s.suburb} is ${money(f.house.value)} ${periodPhrase(f.house.period)}, from ${f.house.source}.`]);
  if (f.unit) qa.push([`What is the median unit price in ${s.suburb}?`,
    `The median unit price in ${s.suburb} is ${money(f.unit.value)} ${periodPhrase(f.unit.period)}, from ${f.unit.source}.`]);
  if (f.rent) qa.push([`What is the median rent in ${s.suburb}?`,
    `The median rent in ${s.suburb} is $${fmt(f.rent.value)} a week ${periodPhrase(f.rent.period)}, from ${f.rent.source}. A median covers every dwelling type and size in the data, so a particular home can rent for a lot more or less.`]);
  qa.push([`How many people live in ${s.suburb}?`,
    `${s.suburb} had ${fmt(s.population)} usual residents at the 2021 Census (Australian Bureau of Statistics).`]);
  qa.push([`What is the postcode for ${s.suburb}?`,
    `The postcode for ${s.suburb}, ${s.state_name} is ${s.postcode}.`]);
  return qa.map(([q, a]) =>
    `    <details><summary>${escHtml(q)}</summary><p>${escHtml(a)}</p></details>`
  ).join('\n');
}

function generateAboutHTML(s) {
  const f = figures(s);
  const bits = [];
  if (f.house || f.unit) {
    const fig = f.house || f.unit;
    bits.push(`The sale median${f.house && f.unit ? 's come' : ' comes'} from ${escHtml(fig.source)} (${escHtml(fig.period)}).`);
  }
  if (f.rent) bits.push(`The rent comes from ${escHtml(f.rent.source)} (${escHtml(f.rent.period)}).`);
  bits.push(`${(f.house || f.unit) && f.rent ? 'Both are' : 'It is'} state government open data published under a Creative Commons Attribution 4.0 licence. The population is from the <a href="https://www.abs.gov.au/census" target="_blank" rel="noopener">ABS 2021 Census</a>, and the postcode is from a community postcode list checked against Australia Post.`);
  bits.push(`This page has no investment score, growth forecast, school count or lifestyle rating, because I have no data for those that I could show you a source for. The <a href="/methodology">methodology</a> and <a href="/data-sources">data sources</a> pages have the detail.`);
  return bits.join(' ');
}

// ── Nearest profiled suburbs ─────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function coordOf(s) {
  const c = COORDS[s.state.toLowerCase() + '|' + String(s.suburb).toUpperCase()];
  return c && c[0] ? c : null;
}
// state/slug → up to 6 nearest profiled suburbs in the same state, within
// 60 km. Suburbs without a coordinate get no "nearby" list at all (the old
// postcode-number and population-size fallbacks listed places that were not
// near).
function buildNearbyMap(kept) {
  const byState = {};
  for (const s of kept) {
    const c = coordOf(s);
    if (!c) continue;
    (byState[s.state] = byState[s.state] || []).push({ s, c });
  }
  const map = new Map();
  for (const state in byState) {
    const list = byState[state];
    for (const a of list) {
      const near = list.filter(b => b.s !== a.s)
        .map(b => ({ s: b.s, km: haversineKm(a.c[0], a.c[1], b.c[0], b.c[1]) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, 6)
        .filter(x => x.km <= 60);
      map.set(`${a.s.state}/${a.s.slug}`, near);
    }
  }
  return map;
}
function kmLabel(km) { return km < 2 ? 'under 2 km' : `about ${Math.round(km)} km`; }
function generateNearbyHTML(s, near) {
  if (!near || !near.length) return '';
  const cards = near.map(n =>
    `      <a href="/suburb/${n.s.state.toLowerCase()}/${n.s.slug}/">
        <div class="sr-name">${escHtml(n.s.suburb)}</div>
        <div class="sr-fig">${escHtml(figureLine(n.s))}</div>
        <div class="sr-km">${kmLabel(n.km)}</div>
      </a>`).join('\n');
  return `  <section class="suburb-section">
    <h2>Suburbs near ${escHtml(s.suburb)}</h2>
    <div class="suburb-related">
${cards}
    </div>
    <p class="suburb-fig-note">Other profiled suburbs, nearest first. Distances are rough, measured between postcode centres.</p>
  </section>`;
}

// Build date for the index report.
const BUILD_DATE = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

// ── The real-data gate ───────────────────────────────────────────────────
// A suburb gets a page only when it has a postcode, at least 2,000 residents
// and a current, suburb-level, CC-licensed rent or sale median. Postcode-level
// figures (NSW rents) do not count.
const MIN_POPULATION_FOR_INDEX = 2000;

function shouldNoindex(s) {
  if (s.tiny) return true;
  if (!s.postcode) return true;
  if ((s.population || 0) < MIN_POPULATION_FOR_INDEX) return true;
  const f = figures(s);
  return !(f.rent || f.house || f.unit);
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

// ── Build suburb pages ───────────────────────────────────────────────────
const keptSuburbs = suburbs.filter(s => !shouldNoindex(s));

// Clear old output first so a page that has dropped out of the dataset cannot
// survive a rebuild in a reused workspace or a restored build cache.
fs.rmSync(path.join(ROOT, 'suburb'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'invest'), { recursive: true, force: true });
for (const f of fs.readdirSync(ROOT)) {
  if (/^sitemap-suburbs.*\.xml$/.test(f)) fs.unlinkSync(path.join(ROOT, f));
}

let suburbCount = 0;
const stateIndexStats = {}; // state → { indexed, noindexed, total } (shape the admin Suburbs tab reads)
const stateGroups = {};     // state → generated suburbs
for (const s of keptSuburbs) (stateGroups[s.state] = stateGroups[s.state] || []).push(s);

const nearbyMap = buildNearbyMap(keptSuburbs);

for (const s of keptSuburbs) {
  if (!stateIndexStats[s.state]) stateIndexStats[s.state] = { indexed: 0, noindexed: 0, total: 0 };
  stateIndexStats[s.state].total++;
  stateIndexStats[s.state].indexed++;

  const st = s.state.toLowerCase();
  // Function replacements throughout: generated text contains "$", which
  // String.replace would otherwise read as a replacement pattern.
  const html = SUBURB_TPL
    .replace(/\{\{JOURNEY_LINK\}\}/g, () => '/journey?near=' + encodeURIComponent(s.suburb) + '&amp;st=' + st)
    .replace(/\{\{SUBURB\}\}/g, () => escHtml(s.suburb))
    .replace(/\{\{STATE\}\}/g, () => escHtml(s.state))
    .replace(/\{\{STATE_LOWER\}\}/g, () => st)
    .replace(/\{\{STATE_NAME\}\}/g, () => escHtml(s.state_name))
    .replace(/\{\{SLUG\}\}/g, () => s.slug)
    .replace(/\{\{POSTCODE\}\}/g, () => escHtml(s.postcode))
    .replace(/\{\{PAGE_TITLE\}\}/g, () => escHtml(buildSuburbTitle(s)))
    .replace(/\{\{META_DESCRIPTION\}\}/g, () => escHtml(buildSuburbMetaDesc(s)))
    .replace(/\{\{HERO_LINE\}\}/g, () => escHtml(heroLine(s)))
    .replace(/\{\{FIGURES_HTML\}\}/g, () => generateFiguresHTML(s))
    .replace(/\{\{BUYER_HTML\}\}/g, () => generateBuyerHTML(s))
    .replace(/\{\{NEARBY_HTML\}\}/g, () => generateNearbyHTML(s, nearbyMap.get(`${s.state}/${s.slug}`)))
    .replace(/\{\{FAQ_HTML\}\}/g, () => generateFAQ(s))
    .replace(/\{\{ABOUT_HTML\}\}/g, () => generateAboutHTML(s))
    .replace(/\{\{REVIEWS_HTML\}\}/g, () => generateReviewsBlock(s.state, s.slug, s.suburb))
    .replace(/\{\{AGGREGATE_RATING_JSON\}\}/g, () => generateAggregateRatingJson(s.state, s.slug, s.suburb))
    .replace(/\{\{RESOURCES_HTML\}\}/g, () => generateResourcesHTML(s.state));

  const leftover = html.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder ${leftover[0]} in ${s.state}/${s.slug}`);

  const outDir = path.join(ROOT, 'suburb', st, s.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  suburbCount++;
}

// ── State hubs ───────────────────────────────────────────────────────────
// All 8 states keep a hub. A state with no profiles says so.
const allStates = Object.keys(stateNames).sort();

// Duty facts per state. These must track the FY duty engine
// (tools/stamp-duty-calculator.js): re-check them at each annual FY sweep.
const stateDuty = {
  QLD: {
    body: `First home buyers in Queensland pay no transfer duty on established homes up to $700,000, phasing out by $800,000, and none on new homes at any price (contracts from 1 May 2025). Foreign buyers pay an 8% surcharge.`,
    fhbThreshold: '$700,000 established (phasing out by $800,000); new homes exempt at any price',
    revenueOffice: 'Queensland Revenue Office', revenueOfficeUrl: 'https://qro.qld.gov.au/', foreignSurcharge: '8%'
  },
  NSW: {
    body: `First home buyers in New South Wales pay no transfer duty up to $800,000, with a concession up to $1,000,000. Foreign buyers pay a 9% surcharge.`,
    fhbThreshold: '$800,000 (full exemption), $1,000,000 (concession)',
    revenueOffice: 'Revenue NSW', revenueOfficeUrl: 'https://www.revenue.nsw.gov.au/', foreignSurcharge: '9%'
  },
  VIC: {
    body: `First home buyers in Victoria pay no duty up to $600,000, with a concession up to $750,000. Foreign buyers pay an 8% surcharge.`,
    fhbThreshold: '$600,000 (full exemption), $750,000 (concession)',
    revenueOffice: 'State Revenue Office Victoria', revenueOfficeUrl: 'https://www.sro.vic.gov.au/', foreignSurcharge: '8%'
  },
  SA: {
    body: `Since 6 June 2024, first home buyer duty relief in South Australia applies to new homes, off-the-plan purchases and vacant land only, with no value cap. Established homes get no first home buyer relief. Foreign buyers pay a 7% surcharge.`,
    fhbThreshold: 'New homes and vacant land: no duty, no cap. Established homes: no relief',
    revenueOffice: 'RevenueSA', revenueOfficeUrl: 'https://www.revenuesa.sa.gov.au/', foreignSurcharge: '7%'
  },
  WA: {
    body: `First home buyers in Western Australia pay no duty up to $600,000, with a concession up to $800,000 (transactions from 7 May 2026). Foreign buyers pay a 7% surcharge.`,
    fhbThreshold: '$600,000 (full exemption), $800,000 (concession), from 7 May 2026',
    revenueOffice: 'RevenueWA', revenueOfficeUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty', foreignSurcharge: '7%'
  },
  TAS: {
    body: `Tasmania's first home buyer duty exemption for established homes ended on 30 June 2026, so first home buyers now pay full duty. The First Home Owner Grant still applies to new builds. Foreign buyers pay an 8% surcharge.`,
    fhbThreshold: 'No first home buyer duty relief (the established-home exemption ended 30 June 2026)',
    revenueOffice: 'State Revenue Office Tasmania', revenueOfficeUrl: 'https://www.sro.tas.gov.au/', foreignSurcharge: '8%'
  },
  ACT: {
    body: `From 1 July 2026 the ACT Home Buyer Concession Scheme has no income test and no property value limit. Eligible buyers who have not owned property in the previous five years pay no conveyance duty. There is no foreign buyer surcharge.`,
    fhbThreshold: 'No duty for eligible buyers, no value limit (from 1 July 2026)',
    revenueOffice: 'ACT Revenue Office', revenueOfficeUrl: 'https://www.revenue.act.gov.au/', foreignSurcharge: 'None'
  },
  NT: {
    body: `The Northern Territory has no value-based first home buyer duty concession. Relief comes through the House and Land Package Exemption (no value cap, contracts to 30 June 2027) and the $50,000 HomeGrown Territory grant for new homes. There is no foreign buyer surcharge.`,
    fhbThreshold: 'No value-based concession; house and land exemption and a $50,000 grant instead',
    revenueOffice: 'Territory Revenue Office', revenueOfficeUrl: 'https://treasury.nt.gov.au/dtf/territory-revenue-office', foreignSurcharge: 'None'
  }
};

// Which figures a state's profiles carry, with their periods, read from the
// data itself so the hub can never state a period the pages do not.
function stateCoverage(stateSubs) {
  const seen = new Map();
  for (const s of stateSubs) {
    const f = figures(s);
    if (f.rent) seen.set('rent', `median rents (${f.rent.source}, ${f.rent.period})`);
    if (f.house || f.unit) { const p = f.house || f.unit; seen.set('price', `sale medians (${p.source}, ${p.period})`); }
  }
  return [seen.get('price'), seen.get('rent')].filter(Boolean);
}

function emptyStateNote(stateName) {
  return `There are no ${stateName} suburb profiles yet. I only publish a suburb page when I have a current suburb-level median from an openly licensed government dataset, and I have not found one for ${stateName}.`;
}

function generateStateOverviewHTML(state, stateName, stateSubs) {
  const d = stateDuty[state];
  const n = stateSubs.length;
  const cov = stateCoverage(stateSubs);
  const dataSentence = n
    ? `There are ${fmt(n)} ${escHtml(stateName)} suburb profiles here. Between them they carry ${escHtml(cov.join(' and '))}, and each has its 2021 Census population.`
    : `${escHtml(emptyStateNote(stateName))} The duty rules below still apply across the state.`;
  return `<p>${dataSentence}</p><p>${escHtml(d.body)} These are the FY2026-27 settings. The <a href="/tools/stamp-duty-calculator-${state.toLowerCase()}">${escHtml(state)} stamp duty calculator</a> works out the duty at any price.</p>`;
}

function generateStateStatsHTML(state, stateName, stateSubs) {
  const d = stateDuty[state];
  const rows = [
    ['Suburb profiles published', fmt(stateSubs.length)],
    ['First home buyer duty relief', escHtml(d.fhbThreshold)],
    ['Foreign buyer surcharge', escHtml(d.foreignSurcharge)],
    ['Revenue office', `<a href="${d.revenueOfficeUrl}" target="_blank" rel="noopener">${escHtml(d.revenueOffice)} →</a>`]
  ];
  return `<table class="state-stats-table"><tbody>`
    + rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')
    + `</tbody></table>`;
}

function generateStateFaqHTML(state, stateName, stateSubs) {
  const d = stateDuty[state];
  const n = stateSubs.length;
  const cov = stateCoverage(stateSubs);
  const faqs = [
    [`How many ${stateName} suburbs have a profile?`,
      n ? `${fmt(n)}. A suburb gets a page when it has at least 2,000 residents and a current suburb-level rent or sale median from state government open data.`
        : escHtml(emptyStateNote(stateName))],
    [`What stamp duty do first home buyers pay in ${stateName}?`,
      `${escHtml(d.body)} Duty is collected by the ${escHtml(d.revenueOffice)}. The <a href="/tools/stamp-duty-calculator-${state.toLowerCase()}">${escHtml(state)} stamp duty calculator</a> gives the figure for a specific price.`],
    n ? [`How current are the figures on the ${stateName} pages?`,
      `The pages carry ${escHtml(cov.join(' and '))}. Populations are from the ABS 2021 Census. Every figure is printed with its period, so the page itself tells you how old it is.`] : null
  ].filter(Boolean);
  return faqs.map(([q, a]) => `<details class="suburb-faq-item"><summary>${escHtml(q)}</summary><div class="suburb-faq-detail"><p>${a}</p></div></details>`).join('\n    ');
}

function suburbCard(s, searchable) {
  const st = s.state.toLowerCase();
  const search = searchable ? ` data-search="${escHtml((s.suburb + ' ' + s.postcode).toLowerCase().trim())}"` : '';
  return `      <a href="/suburb/${st}/${s.slug}/" class="hub-suburb-card"${search}>
        <div class="hub-suburb-name">${escHtml(s.suburb)} <span class="hub-suburb-pc">${escHtml(s.postcode)}</span></div>
        <div class="hub-suburb-meta"><span>${escHtml(figureLine(s))}</span></div>
      </a>`;
}

let hubCount = 0;
for (const state of allStates) {
  const stateSuburbs = (stateGroups[state] || []).slice().sort((a, b) => a.suburb.localeCompare(b.suburb));
  const stateName = stateNames[state];
  const stateLower = state.toLowerCase();
  const n = stateSuburbs.length;

  const stateNavHTML = allStates.map(st =>
    `      <a href="/invest/${st.toLowerCase()}/"${st === state ? ' class="active"' : ''}>${st}</a>`
  ).join('\n');
  const suburbListHTML = stateSuburbs.map(s => suburbCard(s, true)).join('\n');

  const hubTitle = n
    ? `${stateName} Suburb Profiles: ${fmt(n)} Suburbs | EquitySight`
    : `${stateName} Suburb Profiles | EquitySight`;
  const hubMetaDesc = n
    ? `${fmt(n)} ${stateName} suburb profiles, each with a government-published median rent or sale price and its 2021 Census population.`
    : emptyStateNote(stateName);
  const hubHeroText = n
    ? `${fmt(n)} suburbs, each with a median rent or sale price published by the state government, shown with its period and source.`
    : emptyStateNote(stateName);
  const hubListIntro = n
    ? `In alphabetical order. Each card shows the figure the profile carries.`
    : `Nothing to list yet. The other states are in the navigation above.`;
  const hubSearchHTML = n
    ? `<input type="text" id="suburb-search" class="hub-search" placeholder="Search by suburb name or postcode" aria-label="Search suburbs by name or postcode" autocomplete="off">`
    : '';

  const html = HUB_TPL
    .replace(/\{\{STATE\}\}/g, () => escHtml(state))
    .replace(/\{\{STATE_LOWER\}\}/g, () => stateLower)
    .replace(/\{\{STATE_NAME\}\}/g, () => escHtml(stateName))
    .replace(/\{\{HUB_TITLE\}\}/g, () => escHtml(hubTitle))
    .replace(/\{\{HUB_META_DESC\}\}/g, () => escHtml(hubMetaDesc))
    .replace(/\{\{HUB_HERO_TEXT\}\}/g, () => escHtml(hubHeroText))
    .replace(/\{\{HUB_LIST_INTRO\}\}/g, () => escHtml(hubListIntro))
    .replace(/\{\{HUB_SEARCH_HTML\}\}/g, () => hubSearchHTML)
    .replace(/\{\{STATE_NAV_HTML\}\}/g, () => stateNavHTML)
    .replace(/\{\{STATE_OVERVIEW_HTML\}\}/g, () => generateStateOverviewHTML(state, stateName, stateSuburbs))
    .replace(/\{\{STATE_STATS_HTML\}\}/g, () => generateStateStatsHTML(state, stateName, stateSuburbs))
    .replace(/\{\{STATE_FAQ_HTML\}\}/g, () => generateStateFaqHTML(state, stateName, stateSuburbs))
    .replace(/\{\{SUBURB_LIST_HTML\}\}/g, () => suburbListHTML);

  const outDir = path.join(ROOT, 'invest', stateLower);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  hubCount++;
}

// ── /suburb/ directory index ─────────────────────────────────────────────
const keptStates = allStates.filter(st => (stateGroups[st] || []).length);
const keptStateNamesList = keptStates.map(st => stateNames[st]).join(', ').replace(/, ([^,]*)$/, ' and $1');

const dirIndexHTML = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<script>try{if(localStorage.getItem("equitySight_theme")==="dark")document.documentElement.classList.add("dark-mode")}catch(e){}</script>
<script src="/site-init.js" defer></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, follow">
<title>Suburb Profiles: ${fmt(keptSuburbs.length)} Australian Suburbs | EquitySight</title>
<meta name="description" content="${fmt(keptSuburbs.length)} suburb profiles across ${keptStateNamesList}, each with a government-published median rent or sale price.">
<link rel="canonical" href="https://equitysight.app/suburb/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#1C1C1E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Geist+Mono:wght@300..700&display=swap">
<script src="/font-loader.js" defer></script>
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
  <a href="/journey" class="tool-header-link">Plan your first home →</a>
</header>
<script src="/auth-nav-loader.js" defer></script>
<script src="/error-capture.js" defer></script>

<section class="tool-hero">
  <nav class="suburb-breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a> <span>›</span>
    <span>All suburbs</span>
  </nav>
  <div class="tool-eyebrow">Suburb profiles</div>
  <h1>Suburb profiles</h1>
  <p>${fmt(keptSuburbs.length)} suburbs across ${keptStateNamesList}. Each profile carries a median rent or sale price published by the state government, shown with its period and source.</p>
</section>

<div class="suburb-main" role="main">

  <section class="suburb-section">
    <h2>Browse by state</h2>
    <div class="state-nav">
${keptStates.map(st => `      <a href="#${st.toLowerCase()}">${st}</a>`).join('\n')}
    </div>
  </section>

${keptStates.map(state => {
  const subs = stateGroups[state].slice().sort((a, b) => a.suburb.localeCompare(b.suburb));
  return `  <section class="suburb-section" id="${state.toLowerCase()}">
    <h2><a href="/invest/${state.toLowerCase()}/" class="suburb-h2-link">${escHtml(stateNames[state])}</a> <span class="suburb-h2-count">${subs.length} suburbs</span></h2>
    <div class="hub-suburb-list">
${subs.map(s => suburbCard(s, false)).join('\n')}
    </div>
  </section>`;
}).join('\n\n')}

  <section class="suburb-cta">
    <div class="tool-cta-eye">Buying your first home?</div>
    <h3>Turn a suburb into a plan</h3>
    <p>The First Home Journey takes your savings and income and works out the schemes, the budget and the deadlines. Free, and no signup to start.</p>
    <a href="/journey" class="tool-cta-btn">Start the First Home Journey →</a>
  </section>

</div>

<div id="site-footer-root"></div>
<script src="/footer.js" defer></script>
</body>
</html>`;

fs.mkdirSync(path.join(ROOT, 'suburb'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'suburb', 'index.html'), dirIndexHTML);
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

// ── Index report (read by the admin Suburbs tab) ─────────────────────────
// Written to /data because /build is not deployed.
const indexReport = {
  generated_at: new Date().toISOString(),
  build_date: BUILD_DATE,
  total: suburbCount,
  indexed: suburbCount,
  noindexed: 0,
  not_generated: suburbs.length - suburbCount,
  min_population_for_index: MIN_POPULATION_FOR_INDEX,
  by_state: stateIndexStats,
};
fs.writeFileSync(path.join(ROOT, 'data', 'suburb-index-report.json'), JSON.stringify(indexReport, null, 2));
console.log('Wrote data/suburb-index-report.json');

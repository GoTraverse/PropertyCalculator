---
title: Data Sources & Attribution
date: April 2026
tag: Transparency
---

## Where our numbers come from

EquitySight publishes one source of truth for every number that appears on a suburb profile. This page lists each dataset, when it was last refreshed, and the attribution terms we operate under. If you spot a stale link or an attribution we've missed, email [support@equitysight.app](mailto:support@equitysight.app) and we'll fix it immediately.

## 1. Australian Bureau of Statistics — 2021 Census of Population and Housing

- **Used for:** usual resident population, median household income, median weekly rent, median monthly mortgage repayment, dwelling-type percentages, Statistical Area Level 2 (SA2) geography, State Suburb (SAL) boundaries and centroids.
- **Source:** [abs.gov.au/census/find-census-data](https://www.abs.gov.au/census/find-census-data)
- **Geography layer:** ABS ArcGIS FeatureServer (SAL 2021 boundaries), queried via the public REST endpoint at build time and cached in `data/abs-suburbs.json`.
- **Licence:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Source: Australian Bureau of Statistics © Commonwealth of Australia.
- **Refreshed:** The 2021 Census is the current release. Census 2026 will be ingested as soon as the ABS publishes the release files (scheduled late 2026 / mid-2027). When that happens we will version this page and keep a snapshot of the 2021 tables available for reproducibility.

Every field we display from the ABS retains its original name in our internal schema (e.g. `median_household_income`), and our build script does not "smooth" or "impute" missing values — if the ABS reports nothing for a suburb, we show `—` rather than a guess.

### ABS fields used per suburb

The following Census fields feed directly into our suburb profiles and investment scores:

| ABS field | Profile usage |
|-----------|---------------|
| `usual_resident_population` | Population figure, noindex gate (minimum 2,000 for indexing) |
| `median_household_income` | Income display, investment score weighting (up to 25 pts), affordability ratios |
| `median_rent_weekly` | Rental yield estimate, cash-flow coverage ratio, rental stress calculation |
| `median_mortgage_repayment_monthly` | Mortgage burden, coverage percentage, rate sensitivity stress test |
| `dwelling_type_percentage` (houses vs units) | Renovation strategy verdict, comparison-to-state delta |
| SAL centroid coordinates | Straight-line distance to nearest capital city CBD |

All values are taken directly from the ABS 2021 Census release with no interpolation, seasonal adjustment, or third-party blending. Where the ABS suppresses a value for confidentiality (common in small suburbs), we leave the field blank rather than estimating it from neighbouring areas.

## 2. Australia Post postcode dataset

- **Used for:** matching ABS suburb names to postal postcodes, populating the Postcode field on every suburb page, and building state-level filters.
- **Source:** community-maintained postcode CSV (`au_postcodes.csv`) cross-referenced against the [Australia Post postcode finder](https://auspost.com.au/postcode).
- **Refreshed:** annually at major site rebuilds; last refresh noted in the Methodology change log.
- **Attribution:** Australia Post is the authoritative issuer of postcodes. Our dataset is a mechanical lookup only; we do not resell, redistribute, or claim ownership over postcode data.

Where a suburb has more than one postcode we display the primary one and list alternates in the page keywords. A postcode may cover multiple suburbs — that is expected.

## 3. OpenStreetMap — amenities and points of interest

- **Used for:** counting schools, parks and green space, cafes, train stations and other POIs within the suburb polygon for the amenity score.
- **Source:** [openstreetmap.org](https://www.openstreetmap.org) via the Overpass API.
- **Licence:** [Open Data Commons Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). © OpenStreetMap contributors.
- **Refreshed:** on major rebuilds. The OSM map for Australia is continuously edited by volunteers; counts can drift between refreshes.

Under ODbL we must credit OpenStreetMap wherever their data visibly appears. The credit line "© OpenStreetMap contributors" appears in the footer of every suburb profile that includes amenity counts.

## 4. Reserve Bank of Australia — cash-rate target

- **Used for:** driving the `window.MarketRate` module on our calculator pages and the rate-sensitivity stress test on suburb profiles.
- **Source:** [rba.gov.au/statistics/cash-rate](https://www.rba.gov.au/statistics/cash-rate/)
- **Refreshed:** at every site build. The value is read at page load via our `market-rate` Netlify function, which fetches the RBA public feed.
- **Attribution:** Reserve Bank of Australia. Figures are used descriptively and are not represented as RBA forecasts.

The cash rate is critical to our mortgage calculators. When a user opens any calculator that models repayments (Purchase Calculator, Mortgage Repayment, Loan Serviceability, Mortgage Stress Test), the current RBA cash rate is fetched and used as the baseline for variable-rate scenarios. We add a typical bank margin on top of the cash rate to estimate the effective borrowing rate. The rate-sensitivity stress test on suburb profiles uses this same feed to model the impact of a one-percentage-point rise on monthly repayments — see our [methodology page](/methodology.html) for the exact formula.

## 5. Capital city coordinates

- **Used for:** computing straight-line distance from a suburb centroid to the nearest capital city CBD.
- **Source:** hand-curated list of the eight capital city GPO coordinates (Sydney, Melbourne, Brisbane, Perth, Adelaide, Hobart, Darwin, Canberra), derived from public geographic datasets.
- **Note:** Straight-line distance is a rough proxy for commute. Always verify driving time on Google Maps for your own planning.

## 6. What we do NOT use

We want to be explicit about what is *not* in our dataset, because transparency about exclusions is as important as transparency about inclusions:

- **No paid agent data.** We do not buy feeds from Domain, realestate.com.au, CoreLogic, or PriceFinder. When we talk about "median rent" or "median mortgage" on a suburb page, we mean the ABS 2021 Census field — not a live listing aggregate. This means our rental and mortgage figures reflect the 2021 Census snapshot, not today's market prices. We consider this an acceptable trade-off: Census data is freely verifiable by anyone, whereas commercial feeds introduce opacity and potential conflicts of interest.
- **No sponsored content.** No developer, agent, buyer's agent, or mortgage broker can pay us to feature a suburb, move its score, or adjust its strategy verdict. Our revenue comes from subscriptions and advertising — never from data manipulation.
- **No AI-generated text.** The narrative on each suburb page is assembled by a deterministic JavaScript build step (`build/build-suburbs.js` in our public repository) from the numeric fields listed above. No large language model, chatbot, or generative system writes the prose. Given the same input data, the same output is produced every time — you can verify this by running the build yourself.
- **No personal data.** We do not collect, store, or infer anything about individual homeowners or tenants. Everything on our pages is an aggregated statistic from a government or community dataset.
- **No scraped listings.** We do not scrape property listing websites. Our suburb data is sourced entirely from the government and community datasets listed above.

## 7. Reproducing our numbers

Every derivation is documented in [our methodology page](/methodology.html). The relevant build scripts live in the `build/` directory of the repo and take the cached ABS JSON (`data/suburbs.json`) as their only input. Running `node build.js` with `REBUILD_SUBURBS=true` regenerates the full site; running it without the flag restores the cached build for faster deploys.

If you reproduce our numbers and land on a different answer, email [support@equitysight.app](mailto:support@equitysight.app) with the suburb slug and your calculation — we'll investigate and publish a correction in the Methodology change log.

## 8. Reporting a correction

We take data accuracy seriously. If any field on any of our pages is wrong:

1. Email [support@equitysight.app](mailto:support@equitysight.app) with the suburb URL, the field that's wrong, and (if you can) the correct ABS table reference.
2. We aim to respond within five business days.
3. Confirmed corrections are logged publicly in the [methodology change log](/methodology.html#11-change-log).

## 9. Change log

- **April 2026** — First published data-sources page. ABS 2021 Census, Australia Post postcode CSV, OpenStreetMap amenities, and RBA cash-rate feed documented.

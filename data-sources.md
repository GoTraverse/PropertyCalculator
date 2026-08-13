---
title: Data Sources & Attribution
date: August 2026
tag: Transparency
---

## Where my numbers come from

This page is a plain account of which fields on EquitySight are sourced from a public dataset, which datasets those are, when each was last refreshed, and the licence terms I operate under. I would rather under-claim than overstate what I have. If you spot a stale link, a mislabelled figure, or an attribution I've missed, email [support@equitysight.app](mailto:support@equitysight.app) and I'll fix it.

## 1. Australian Bureau of Statistics — 2021 Census of Population and Housing

- **Used for:** the usual-resident **population** figure on each suburb page, the State Suburb (SAL) geography I build pages from, and the 2021 Census median rent and mortgage figures where they appear (always labelled as 2021).
- **Source:** [abs.gov.au/census/find-census-data](https://www.abs.gov.au/census/find-census-data)
- **Geography layer:** ABS ArcGIS FeatureServer (SAL 2021 boundaries), queried via the public REST endpoint and cached at build time.
- **Licence:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Source: Australian Bureau of Statistics © Commonwealth of Australia.
- **Refreshed:** The 2021 Census is the current release. I will ingest the 2026 Census once the ABS publishes the release files.

## 2. Postcodes

- **Used for:** the postcode shown on every suburb page, matching suburb names to postal postcodes, and building state-level filters.
- **Source:** community-maintained postcode CSV (`au_postcodes.csv`) cross-referenced against the [Australia Post postcode finder](https://auspost.com.au/postcode).
- **Attribution:** Australia Post is the authoritative issuer of postcodes. My dataset is a mechanical lookup only; I do not resell, redistribute, or claim ownership over postcode data.

Where a suburb has more than one postcode I display the primary one. A postcode may cover multiple suburbs — that is expected.

## 3. Current market data — state government open data (CC BY 4.0)

The current rents and sale medians on suburb pages, and the suburb price data behind the [First Home Journey](/journey) suburb search and the auction budget and listing price tools, come from these datasets:

| Dataset | Publisher | Metric | Period | Level |
|---------|-----------|--------|--------|-------|
| Rental bond medians | Residential Tenancies Authority (Qld) | Median weekly rent | Mar 2026 quarter | Suburb |
| Private rental report | Consumer & Business Services (SA) | Median weekly rent | Jan–Mar 2026 | Suburb |
| Metro Adelaide sale medians | Valuer-General (SA) | Median house price | Q1 2026 | Suburb (metro Adelaide) |
| Victorian property sales | Valuer-General Victoria | Median house & unit prices | 2025 (preliminary) | Suburb |
| Rental bond data | Department of Justice (Tasmania) | Median weekly rent | May 2025 – Apr 2026 | Suburb |
| Rent and Sales Report | NSW Communities & Justice | Median weekly rent | Jan–Mar 2026 | Postcode |

All are published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) by the respective state governments. Every figure drawn from these datasets carries an "as at" caption on the page naming the source and period. I refresh this data quarterly as new releases appear; the period captions are the honest read of each figure's age.

Coverage is uneven and I say so on the pages: NSW rents exist only at postcode level, and Queensland has no free suburb-level sale-price dataset — where a figure doesn't exist, the page omits it rather than substituting a modelled number.

## 4. Reserve Bank of Australia — cash-rate target

- **Used for:** the live cash-rate context on the Loan Serviceability, Mortgage Stress Test and Property Cashflow calculators via the `window.MarketRate` module.
- **Source:** [rba.gov.au/statistics/cash-rate](https://www.rba.gov.au/statistics/cash-rate/)
- **Refreshed:** fetched from the RBA public feed and cached briefly. If the live feed is unavailable, the calculators simply omit the live-rate hint — they never display a stale rate as current.
- **Attribution:** Reserve Bank of Australia. Figures are used descriptively and are not represented as RBA forecasts.

## 5. Rates, duties and scheme settings

Stamp duty schedules come from each state revenue office, income tax rates from the ATO, the 3% serviceability buffer from APRA's APS 220, and first-home-buyer scheme settings (5% Deposit Scheme, Help to Buy, FHSS, state FHOGs and concessions) from Housing Australia, the ATO and the state revenue offices. Each calculator page notes when its figures were last verified against the official source. The formulas are documented on the [methodology page](/methodology).

## 6. Figures I removed rather than estimate

Earlier versions of the suburb pages included fields I could not verify — a generated household income figure, an investment score, and school/park counts. All were removed rather than labelled and left in place. The [methodology page](/methodology) section 3 covers what was removed and why. I would rather omit a field than publish a number I can't stand behind.

## 7. My written calculator guides

The long-form guides attached to each calculator are **drafted with AI assistance and then human-reviewed and edited** by me for accuracy and Australian relevance. I mention this plainly because I think you should know how the words are made. The numbers and formulas inside the calculators are coded by hand and documented on the [methodology page](/methodology); the prose around them is AI-assisted and human-checked.

## 8. What I do NOT do

- **No third-party listing data on suburb pages.** The figures on a suburb page are not drawn from Domain, realestate.com.au, CoreLogic, PriceFinder, or any other commercial listing feed.
- **No sponsored content.** No developer, agent, buyer's agent, or mortgage broker can pay me to feature a suburb or change a verdict.
- **No scraped listings.** I do not scrape property listing websites.
- **No personal data.** I do not collect, store, or infer anything about individual homeowners or tenants.

## 9. Independence and conflicts of interest

EquitySight is run by a single solo operator. It is not owned by, licensed to, or commercially affiliated with any real-estate agency, developer, mortgage broker, buyer's agent, or data reseller. The site carries no advertising. A small number of paid subscriptions exist from an earlier version of the product; no advertiser or subscriber has any influence over what any page says.

If this ever changes — for example if I accept investment from a party with an interest in specific suburbs — I will disclose it at the top of this page before the relationship begins.

## 10. Reporting a correction

If any field on any page is wrong or misleading:

1. Email [support@equitysight.app](mailto:support@equitysight.app) with the page URL and the field that's wrong (and, if you have it, the correct source reference).
2. I reply within 24 hours on weekdays; confirmed corrections can take up to five business days to verify and fix.
3. I'll fix confirmed issues and, where relevant, update this page.

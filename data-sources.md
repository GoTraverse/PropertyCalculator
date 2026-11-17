---
title: Data sources and attribution
date: November 2026
tag: Reference
---

## 1. Population (ABS 2021 Census)

The usual-resident population on each suburb page comes from the Australian Bureau of Statistics [2021 Census of Population and Housing](https://www.abs.gov.au/census/find-census-data). The suburbs I build pages from are the ABS State Suburb (SAL) 2021 boundaries, read from the ABS ArcGIS FeatureServer through its public REST endpoint and cached at build time.

Licence: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Source: Australian Bureau of Statistics © Commonwealth of Australia.

The 2021 Census is the current release. I'll move to the 2026 Census once the ABS publishes the release files.

## 2. Postcodes

The postcode on every suburb page comes from a community-maintained postcode CSV (`au_postcodes.csv`), checked against the [Australia Post postcode finder](https://auspost.com.au/postcode). I also use it to match suburb names to postcodes and to build the state filters.

Australia Post issues postcodes. My copy is a lookup only. I don't resell or redistribute postcode data, and I don't claim to own it.

Where a suburb has more than one postcode I show the primary one. One postcode can cover several suburbs.

The rough distances in the "Suburbs near" list on a suburb page are measured between postcode centres. The coordinates come from the matthewproctor/australianpostcodes community dataset (MIT licence).

## 3. Rents and sale prices (state government open data)

The current rents and sale medians on suburb pages come from the datasets below. So does the suburb price data behind the [First Home Journey](/journey) suburb search and the auction budget and listing price tools.

| Dataset | Publisher | Metric | Period | Level |
|---------|-----------|--------|--------|-------|
| Rental bond medians | Residential Tenancies Authority (Qld) | Median weekly rent | Mar 2026 quarter | Suburb |
| Private rental report | Consumer & Business Services (SA) | Median weekly rent | Jan–Mar 2026 | Suburb |
| Metro Adelaide sale medians | Valuer-General (SA) | Median house price | Q1 2026 | Suburb (metro Adelaide) |
| Victorian property sales | Valuer-General Victoria | Median house & unit prices | 2025 (preliminary) | Suburb |
| Rental bond data | Department of Justice (Tasmania) | Median weekly rent | May 2025 – Apr 2026 | Suburb |
| Rent and Sales Report | NSW Communities & Justice | Median weekly rent | Jan–Mar 2026 | Postcode |

All are published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) by the respective state governments. Every figure drawn from them is printed with its source and period. I refresh this data by hand and aim to do it each quarter. The last refresh was July 2026, so check the period under each figure.

Coverage is uneven. NSW rents exist only at postcode level, and Queensland has no free suburb-level sale-price dataset. Where a figure doesn't exist the page leaves it out. I don't substitute a modelled number.

## 4. Cash rate (Reserve Bank of Australia)

The Loan Serviceability, Mortgage Stress Test and Property Cashflow calculators show the current cash-rate target for context. It is fetched from the RBA's public feed ([rba.gov.au/statistics/cash-rate](https://www.rba.gov.au/statistics/cash-rate/)) by the `window.MarketRate` module and cached briefly. If the feed is unavailable the calculators leave the rate hint out. They never display a stale rate as current.

Attribution: Reserve Bank of Australia. The figure is used descriptively and is not presented as an RBA forecast.

## 5. Rates, duties and scheme settings

Stamp duty schedules come from each state revenue office, income tax rates from the ATO, the 3% serviceability buffer from APRA's APS 220, and first-home-buyer scheme settings (5% Deposit Scheme, Help to Buy, FHSS, state FHOGs and concessions) from Housing Australia, the ATO and the state revenue offices. Each calculator page notes when its figures were last verified against the official source. The repayment formulas are on the [methodology page](/methodology).

## 6. The written calculator guides

The long guides attached to each calculator are drafted with AI assistance and then reviewed and edited by me for accuracy and Australian relevance. The numbers and formulas inside the calculators are coded by hand.

## 7. What I don't use

The figures on a suburb page are not drawn from Domain, realestate.com.au, CoreLogic, PriceFinder or any other commercial listing feed. I don't scrape property listing websites. I don't collect, store or infer anything about individual homeowners or tenants.

Earlier versions of the suburb pages included fields I couldn't verify: a generated household income figure, an investment score, and school and park counts. I removed them. Section 3 of the [methodology page](/methodology) lists everything that was removed and why.

## 8. Independence and conflicts of interest

EquitySight is run by one person. It is not owned by, licensed to or commercially affiliated with any real-estate agency, developer, mortgage broker, buyer's agent or data reseller. The site carries no advertising and no sponsored content. I don't collect paid data from agents or developers, and no developer, agent, buyer's agent or mortgage broker can pay me to feature a suburb or change what a page says.

A small number of paid subscriptions exist from an earlier version of the product. No advertiser or subscriber has any influence over what any page says.

If this ever changes, for example if I accept investment from a party with an interest in specific suburbs, I will disclose it at the top of this page before the relationship begins.

## 9. Corrections

If a figure is wrong or mislabelled, a link is stale, or I've missed an attribution, email [support@equitysight.app](mailto:support@equitysight.app) with the page URL and the field that's wrong. Include the correct source reference if you have it.

I reply within 24 hours on weekdays. A confirmed correction can take up to five business days to verify and fix. Where it's relevant I update this page too.

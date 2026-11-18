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

The postcode on each suburb page comes from a community-maintained postcode CSV (`au_postcodes.csv`), checked against the [Australia Post postcode finder](https://auspost.com.au/postcode). I also use it to match suburb names to postcodes and to build the state filters. Where a suburb has more than one postcode I show the primary one. One postcode can cover several suburbs.

Australia Post issues postcodes. My copy is a lookup only. I don't resell or redistribute postcode data, and I don't claim to own it.

The distances in the "Suburbs near" list on a suburb page are rough. They're measured between postcode centres, using coordinates from the matthewproctor/australianpostcodes community dataset (MIT licence).

## 3. Rents and sale prices (state government open data)

The current rents and sale medians on suburb pages come from these datasets. So does the suburb price data behind the [First Home Journey](/journey) suburb search and the auction budget and listing price tools.

| Dataset | Publisher | Metric | Period | Level |
|---------|-----------|--------|--------|-------|
| Rental bond medians | Residential Tenancies Authority (Qld) | Median weekly rent | Mar 2026 quarter | Suburb |
| Private rental report | Consumer & Business Services (SA) | Median weekly rent | Jan–Mar 2026 | Suburb |
| Metro Adelaide sale medians | Valuer-General (SA) | Median house price | Q1 2026 | Suburb (metro Adelaide) |
| Victorian property sales | Valuer-General Victoria | Median house & unit prices | 2025 (preliminary) | Suburb |
| Rental bond data | Department of Justice (Tasmania) | Median weekly rent | May 2025 to Apr 2026 | Suburb |
| Rent and Sales Report | NSW Communities & Justice | Median weekly rent | Jan–Mar 2026 | Postcode |

The state governments publish all of these under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Every figure taken from them is printed with its source and period. I refresh this data by hand and aim to do it each quarter. The last refresh was July 2026, so check the period under each figure.

Coverage is uneven. NSW rents exist only at postcode level, and Queensland has no free suburb-level sale-price dataset. Where a figure doesn't exist the page leaves it out. I don't substitute a modelled number.

## 4. Cash rate (Reserve Bank of Australia)

The Loan Serviceability, Mortgage Stress Test and Property Cashflow calculators use the current cash-rate target. The `window.MarketRate` module fetches it from the RBA's public feed ([rba.gov.au/statistics/cash-rate](https://www.rba.gov.au/statistics/cash-rate/)) and caches it briefly. Until you type your own interest rate, the calculator fills the interest rate field with the cash rate plus a lender margin that is my own assumption, and the note under the field shows both figures. If the feed is unavailable the calculator keeps its default rate and leaves the note out. It never shows a stale rate as current.

Attribution: Reserve Bank of Australia. The cash rate is not presented as an RBA forecast.

## 5. Rates, duties and scheme settings

Stamp duty schedules come from each state revenue office, income tax rates from the ATO, the 3% serviceability buffer from APRA's APS 220, and first-home-buyer scheme settings (5% Deposit Scheme, Help to Buy, FHSS, state FHOGs and concessions) from Housing Australia, the ATO and the state revenue offices. Each calculator that uses these rates notes when they were last checked against the official source. The repayment formulas are on the [methodology page](/methodology).

The LMI table and the living-cost floor behind the borrowing estimates have no official source. They are my own estimates, and both are set out on the methodology page.

## 6. The written calculator guides

The long guides on the calculator pages are drafted with AI assistance, then reviewed and edited by me for accuracy and Australian relevance. The numbers and formulas inside the calculators are coded by hand.

## 7. Reviews on suburb pages

A suburb page can have a "Community reviews" section. Signed-in visitors wrote those reviews and gave the star ratings before I closed submissions in August 2026, and I approved each one before it appeared. A page shows up to ten of them and the average star rating, which is also in the page's structured data. They are those visitors' opinions. I don't count them as data, and no new reviews are accepted.

## 8. What I don't use

The figures on a suburb page are not drawn from Domain, realestate.com.au, CoreLogic, PriceFinder or any other commercial listing feed. I don't scrape property listing websites. I don't collect, store or infer anything about individual homeowners or tenants.

Section 3 of the [methodology page](/methodology) lists the fields I've removed from suburb pages because I couldn't verify them.

## 9. Independence and conflicts of interest

I run EquitySight on my own. It isn't owned by, licensed to or commercially affiliated with any real-estate agency, developer, mortgage broker, buyer's agent or data reseller. The site has no advertising and no sponsored content. I don't collect paid data from agents or developers, and no developer, agent, buyer's agent or mortgage broker can pay me to feature a suburb or change what a page says.

A small number of paid subscriptions from an earlier version of the product are still active. No advertiser or subscriber has any influence over what any page says.

If that changes, for example if I take investment from someone with an interest in particular suburbs, I'll say so at the top of this page before the arrangement begins.

## 10. Corrections

If a figure is wrong or mislabelled, a link is stale, or I've missed an attribution, email [support@equitysight.app](mailto:support@equitysight.app) with the page URL and the field that's wrong. Include the correct source reference if you have it.

I reply within 24 hours on weekdays. A confirmed correction can take up to five business days to check and fix. Where it's relevant I update this page too.

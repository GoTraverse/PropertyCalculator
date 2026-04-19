---
title: EquitySight Methodology
date: April 2026
tag: Transparency
---

## 1. Why we publish our methodology

Every number on an EquitySight suburb profile — investment score, strategy verdict, risk factor, outlook, comparison table — is **computed deterministically** from published government data. Nothing is guessed, estimated, or hand-written per suburb. This page documents the exact formulas so any reader can reproduce our output from the raw inputs.

We publish the methodology because:

- Investors should never rely on opaque "scores" without understanding what they measure.
- Australia's property industry has a long history of undisclosed conflicts and paid placements — we want ours out in the open.
- Formulas change when better data becomes available. Public documentation forces us to version and announce those changes rather than quietly re-tune them.

## 2. The EquitySight Investment Score (0–100)

The investment score is the weighted sum of six factors:

| Factor | Weight | Source field |
|--------|--------|--------------|
| Median household income (linear scale: $55k → 0, $115k → 25) | up to 25 pts | ABS 2021 Census — `median_household_income` |
| Straight-line distance to CBD | up to 20 pts | ABS 2021 SAL centroid + capital coordinates |
| Suburb type (inner-city / middle-ring / coastal / outer-metro / regional) | up to 20 pts | Derived from postcode range + population |
| Transport score | up to 15 pts | Composite from amenity proximity |
| Amenity score | up to 10 pts | OpenStreetMap POI density |
| Median weekly rent | up to 10 pts | ABS 2021 Census — `median_rent_weekly` |

The sum is capped at 100. Distance-to-CBD points decay in fixed bands: ≤5 km → 20, ≤15 km → 16, ≤30 km → 12, ≤50 km → 8, otherwise 4. Suburb-type points are lookup values: inner-city 18, middle-ring 16, coastal 14, outer-metro 12, regional 8.

Scores fall into four labels:

- **Strong** — 81 to 100
- **Good** — 61 to 80
- **Moderate** — 41 to 60
- **Weak** — 0 to 40

> The score is descriptive, not predictive. It describes what the ABS 2021 numbers say about current conditions — it does not forecast returns. Past performance is not a guarantee of future performance.

## 3. The noindex gate (thin-content prune)

To protect the overall quality of the site we do not serve a full indexed profile for every one of the 14,512 Australian suburbs in the ABS SAL dataset. A suburb is `noindex, follow` (reachable but excluded from Google) unless it meets **all four** of these conditions:

- Has a valid Australia Post postcode
- Has at least 2,000 usual residents at the 2021 Census
- Has a median household income recorded in the ABS 2021 dataset
- Is not flagged `tiny` in our source data

Against the current `data/suburbs.json` this leaves approximately 3,022 suburbs indexed. Noindexed suburbs stay linked from the "All localities" drawer on each state hub page so internal link equity is preserved.

## 4. Cash-flow coverage ratio

Where both a median weekly rent and a median monthly mortgage repayment are available, we convert the rent to a monthly equivalent:

```
monthly_rent   = round(weekly_rent × 52 ÷ 12)
coverage_pct   = round(monthly_rent ÷ monthly_mortgage × 100)
monthly_gap    = monthly_mortgage − monthly_rent
```

These three numbers drive every strategy verdict and FAQ answer about cash flow. A coverage percentage of 90%+ is labelled "strong" in strategy text, 70–89% "moderate", and below 70% "weak". The same thresholds apply across every suburb so investors can compare directly.

## 5. Comparison-to-state deltas

The comparison table on each suburb page shows the suburb's values alongside the **median of every indexed suburb in the same state**. The deltas are:

```
pct_delta       = round((suburb_value − state_median) ÷ state_median × 100)
```

The house-percentage row uses percentage points (pp) rather than percent because it is already a percentage. Positive deltas render green, negative deltas render red. State medians are computed once per build, not per page.

## 6. Rate sensitivity

The rate stress-test in the investor checklist and risk factors approximates the impact of a 1-percentage-point RBA cash-rate rise on a 30-year mortgage as:

```
extra_monthly  = round(median_monthly_mortgage × 0.10)
```

This is a rule-of-thumb approximation (a 30-year mortgage at 6% paying 1% more costs approximately 10% more per month). Real-world repricing depends on the original loan rate, loan term, and the degree to which the borrower is on fixed vs variable rates. Use our [loan serviceability calculator](/tools/loan-serviceability-calculator/) for a precise figure.

## 7. Rental stress threshold

We flag rental stress when:

```
rent_burden_pct = round(median_weekly_rent × 52 ÷ median_household_income × 100)
```

exceeds 30%. This is the long-standing definition used by the Productivity Commission and state housing authorities.

## 8. Investment-strategy verdict logic

Each strategy card (Buy & Hold, Rental Yield, Renovation/Flip) is assigned **strong / moderate / limited** by a rule set that consumes only computed ratios — no per-suburb hand-tuning:

- **Buy & Hold — strong** when income-vs-state ≥ 1.15 AND (distance ≤ 25 km OR population ≥ 10,000)
- **Buy & Hold — limited** when income-vs-state < 0.8 OR population < 3,000
- **Rental Yield — strong** when coverage ≥ 85%
- **Rental Yield — weak** when coverage < 65%
- **Renovation — strong** when house % ≥ state median + 10pp AND population ≥ 5,000
- **Renovation — weak** when house % ≤ state median − 10pp

Everything in between is labelled **moderate**. The exact thresholds are in `build/build-suburbs.js` in our public repository.

## 9. Data freshness

- ABS 2021 Census data is used where available (most fields).
- Australia Post postcodes are cross-checked against a community dataset refreshed annually.
- OpenStreetMap amenity data is refreshed on major site rebuilds.
- Live rental and sales data is not yet integrated — when it is, this page will be versioned and updated.

## 10. Known limitations

- ABS 2021 is four years old at time of writing. Census 2026 data will be incorporated as soon as the ABS releases it.
- Straight-line CBD distance is *not* driving time. Use Google Maps for commute checks.
- We do not collect any paid data from agents or developers, and we do not accept sponsored content.
- The investment score does not factor live sales prices, so it cannot be used as a gross-yield estimate in isolation.

## 11. Mortgage repayment formulas (main calculator)

The Purchase Calculator (`/app`) uses the standard monthly amortisation formula:

```
monthly = P × r / (1 − (1 + r)^−n)
```

where `P` is the loan amount, `r` is the **monthly** rate (annual rate ÷ 12 ÷ 100), and `n` is the number of monthly periods (term × 12). Total interest is `monthly × n − P`.

### Fortnightly-benefit figure

The "switching to fortnightly saves X years and $Y in interest" number is computed by full amortisation, not a closed form. Specifically:

- **Payment**: `monthly / 2` paid every 14 days. Because there are 26 fortnights per year (not 24), this is the equivalent of 13 monthly payments per year — an extra monthly payment vs. the strict 12-per-year schedule.
- **Periodic rate**: annual rate ÷ 26 (applied once per fortnight).
- **Loop**: we iterate fortnight-by-fortnight, applying interest then reducing the balance, until the balance hits zero. `yearsLess` = (term × 12 − monthsEquivalent) ÷ 12 and `interestSaved` = monthlyInterestTotal − fortnightlyInterestTotal.

This matches the "pay half the monthly amount every fortnight" offer most Australian lenders advertise. It is **not** the same as paying `annual / 26` every fortnight (which would just be monthly repayments relabelled and would save nothing).

## 12. Change log

- **April 2026** — First published methodology. Introduced multi-factor noindex gate, deterministic strategy verdicts, comparison tables, and formula-driven prose to replace templated phrase pools. Documented mortgage repayment formulas used by the Purchase Calculator.

## 13. Questions?

If anything on this page is unclear, or you find a calculation error, email us at [support@equitysight.app](mailto:support@equitysight.app). Corrections are logged in the change log above.

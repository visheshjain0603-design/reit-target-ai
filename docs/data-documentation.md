# Data Documentation — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**
**Vishesh Jain | 4 October 2026**

All data in this project is synthetic. No record describes a real property, tenant, listing, transaction or market, and no figure has been externally verified. Every figure in this document was computed from `public/data/portfolio.json`, `public/data/markets.json`, `public/data/observations.json` and `public/data/meta.json`, or is generated into the marked blocks by `data-pipeline/scripts/buildMeta.js`.

---

## 1. Key figures

<!-- canonical:BEGIN key-figures -->
| Fact | Value |
|---|---|
| Market segments | 50 across 8 cities and 3 property types |
| Simulated market observations | 2,156 (26–76 per segment) |
| Sample portfolio | 10 holdings, ₹500.00 Cr value, ₹33.275 Cr annual rent, 6.655% weighted gross yield |
| Default investment | ₹50.00 Cr (10% of the sample portfolio) |
| Gemini agents | 4 (Data & Statistical Analyst; Market Screening Analyst; Portfolio Risk & Scenario Analyst; Investment Orchestrator) |
| Weight presets | 4 (Balanced, Income Focused, Growth Focused, Diversification Focused) |
| Simulation-support screen | at least 30 simulated observations and Assumption Support Grade C or better — 25 of 50 segments pass |
| External calibration | 0 of 12 cited external sources verified; all 50 segments Unverified |
| Known synthetic anomalies | 24 (1.113% of observations) |
| Generator / seed / data as of | 2.0.0 / 20260919 / 2026-09-19 |
| Institution and author | NMIMS B.Sc. Finance, Business Analytics — Vishesh Jain |
<!-- canonical:END key-figures -->

Units used throughout: amounts in Indian rupees (₹); **Cr** is one crore, ₹10,000,000. Areas in square feet (sq ft). Yields and growth rates are annual. Scores are on a 0–100 scale.

---

## 2. Five analytical levels

The data has five levels with different units of analysis. They are kept apart in the Data Centre, and a figure from one level must not be described as a figure from another — in particular, statistics of the market segments are not statistics of the portfolio.

| # | Level | File | Unit of analysis (one row is…) | Shown in |
|---|---|---|---|---|
| 1 | Portfolio holdings | `public/data/portfolio.json` (sample); browser storage (custom) | one synthetic holding | Portfolio; Data Centre §1 |
| 2 | Market segment aggregates | `public/data/markets.json` | one candidate market segment; every statistical field is a **median** of that segment's simulated observations | Market Screener; Data Centre §2 |
| 3 | Simulated observation dataset | `public/data/observations.json` | one seeded draw for one segment — a **simulated market observation**, not a property, listing or transaction | Market Screener distributions; Statistical Analysis; Data Centre §3 |
| 4 | Source / calibration register | `data-pipeline/source_register.csv`, summarised in `public/data/meta.json` | one cited source and what verification found | Data Centre §4 |
| 5 | Data quality and cleaning | a CSV the user imports; fixtures in `tests/fixtures/` | one imported listing-style row | Data Centre §5 |

---

## 3. Level 1 — Portfolio holdings

### 3.1 Fields (`public/data/portfolio.json`, array `assets`)

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `assetId` | string | — | `REIT-001` … `REIT-010` |
| `assetName` | string | — | Invented name |
| `city` | string | — | City of the holding |
| `locality` | string | — | Locality label |
| `assetType` | string | — | Commercial Office, Retail or Residential |
| `propertyValue` | number | ₹ | Book value. HHI shares are computed on this field |
| `annualRent` | number | ₹ per year | Gross annual rent |
| `totalArea` | number | sq ft | Leasable area |
| `occupiedArea` | number | sq ft | Let area |
| `occupancyRate` | number | 0–1 | `occupiedArea ÷ totalArea` |
| `estimatedGrossYield` | number | 0–1 | `annualRent ÷ propertyValue` |
| `leaseExpiry` | string | YYYY-MM-DD | Lease expiry |
| `tenantSector` | string | — | Invented tenant sector |
| `isSynthetic` | boolean | — | `true` for every holding |
| `sourceType` | string | — | `synthetic_academic_demo` for every holding |

The file header records `currency: INR`, `areaUnit: sq_ft` and `dataAsOf: 2026-09-19`.

### 3.2 Holdings

| Asset | City | Asset type | Value | Annual rent | Gross yield | Occupancy | Lease expiry |
|---|---|---|---|---|---|---|---|
| REIT-001 | Mumbai | Commercial Office | ₹125.00 Cr | ₹9.000 Cr | 7.20% | 96.0% | 2030-03-31 |
| REIT-002 | Mumbai | Commercial Office | ₹85.00 Cr | ₹5.780 Cr | 6.80% | 94.0% | 2028-12-31 |
| REIT-003 | Mumbai | Commercial Office | ₹42.00 Cr | ₹2.352 Cr | 5.60% | 72.0% | 2027-09-30 |
| REIT-004 | Mumbai | Retail | ₹43.00 Cr | ₹2.494 Cr | 5.80% | 91.0% | 2029-06-30 |
| REIT-005 | Pune | Commercial Office | ₹65.00 Cr | ₹4.875 Cr | 7.50% | 97.0% | 2031-03-31 |
| REIT-006 | Pune | Residential | ₹25.00 Cr | ₹1.000 Cr | 4.00% | 88.0% | 2027-03-31 |
| REIT-007 | Bengaluru | Commercial Office | ₹58.00 Cr | ₹4.640 Cr | 8.00% | 95.0% | 2029-09-30 |
| REIT-008 | Bengaluru | Retail | ₹27.00 Cr | ₹1.674 Cr | 6.20% | 87.0% | 2030-06-30 |
| REIT-009 | Hyderabad | Commercial Office | ₹14.00 Cr | ₹0.980 Cr | 7.00% | 93.0% | 2028-03-31 |
| REIT-010 | Hyderabad | Residential | ₹16.00 Cr | ₹0.480 Cr | 3.00% | 85.0% | 2028-09-30 |

### 3.3 Allocation

By city (shares of total value):

| City | Holdings | Value | Share of value | Annual rent | Gross yield (rent ÷ value) |
|---|---|---|---|---|---|
| Mumbai | 4 | ₹295.00 Cr | 59.0% | ₹19.626 Cr | 6.653% |
| Pune | 2 | ₹90.00 Cr | 18.0% | ₹5.875 Cr | 6.528% |
| Bengaluru | 2 | ₹85.00 Cr | 17.0% | ₹6.314 Cr | 7.428% |
| Hyderabad | 2 | ₹30.00 Cr | 6.0% | ₹1.460 Cr | 4.867% |
| **Total** | **10** | **₹500.00 Cr** | **100.0%** | **₹33.275 Cr** | **6.655%** |

By asset type:

| Asset type | Holdings | Value | Share of value | Annual rent | Gross yield (rent ÷ value) |
|---|---|---|---|---|---|
| Commercial Office | 6 | ₹389.00 Cr | 77.8% | ₹27.627 Cr | 7.102% |
| Retail | 2 | ₹70.00 Cr | 14.0% | ₹4.168 Cr | 5.954% |
| Residential | 2 | ₹41.00 Cr | 8.2% | ₹1.480 Cr | 3.610% |
| **Total** | **10** | **₹500.00 Cr** | **100.0%** | **₹33.275 Cr** | **6.655%** |

The portfolio's weighted gross yield is total rent ÷ total value, not an average of the holdings' yields. Concentration before any investment, computed by `public/js/hhi.js` from the value shares above: city HHI 0.4130 and asset-type HHI 0.6316, both above the 0.25 band the application labels concentrated. The portfolio holds four of the eight cities in the market universe.

The default investment amount is 10% of the active portfolio's value. A custom portfolio, created on the Portfolio page and kept in browser storage, replaces the sample portfolio in every calculation while it is active and non-empty.

---

## 4. Level 2 — Market segment aggregates

### 4.1 Coverage

Segments by city, with the simulated observations behind them and the outcome of the simulation-support screen:

| City | Segments | Commercial Office | Retail | Residential | Simulated observations | Pass the screen | Below the 30-observation minimum |
|---|---|---|---|---|---|---|---|
| Bengaluru | 9 | 5 | 2 | 2 | 413 | 6 | 0 |
| Delhi NCR | 9 | 6 | 2 | 1 | 488 | 5 | 1 |
| Mumbai | 8 | 5 | 2 | 1 | 435 | 5 | 0 |
| Pune | 8 | 5 | 1 | 2 | 262 | 3 | 2 |
| Hyderabad | 6 | 3 | 1 | 2 | 240 | 3 | 1 |
| Chennai | 5 | 3 | 1 | 1 | 185 | 3 | 1 |
| Kolkata | 3 | 1 | 1 | 1 | 81 | 0 | 3 |
| Ahmedabad | 2 | 2 | 0 | 0 | 52 | 0 | 2 |
| **Total** | **50** | **30** | **10** | **10** | **2,156** | **25** | **10** |

No segment in Ahmedabad or Kolkata passes the screen.

By locality class:

| Locality class | Segments | Pass the screen |
|---|---|---|
| Established | 23 | 12 |
| Premium | 11 | 9 |
| Growth | 9 | 0 |
| Emerging | 4 | 4 |
| Peripheral | 3 | 0 |

By Assumption Support Grade (field `confidenceGrade`; no segment has grade A):

| Grade | Segments | Pass the screen | Below the 30-observation minimum |
|---|---|---|---|
| B | 7 | 7 | 0 |
| C | 20 | 18 | 2 |
| D | 20 | 0 | 5 |
| E | 3 | 0 | 3 |

Screen outcome across the universe: 25 pass; of those that fail, 15 fail on the grade alone, 2 on simulated observations alone, and 8 on both.

**Simulated observations per segment** range from 26 to 76; nine segments sit at the minimum of 26. The count is set by the generator's liquidity proxy (Section 5.2), so deep, prime segments in first-tier cities have more draws than thin segments in third-tier cities.

### 4.2 Ranges of the segment medians

| Measure | Lowest | Highest |
|---|---|---|
| Gross yield (median rent × 12 ÷ median value) | 2.66% — Banjara Hills, Hyderabad (Residential) | 9.87% — Pocharam, Hyderabad (Commercial Office) |
| Median value per sq ft | ₹4,130 — Undri / Pisoli, Pune (Residential) | ₹50,367 — Lower Parel, Mumbai (Retail) |
| Median monthly rent per sq ft | ₹16.32 — Undri / Pisoli, Pune (Residential) | ₹278.59 — Linking Road — Bandra, Mumbai (Retail) |
| Median annual rental growth | 4.70% — Noida — Sector 62, Delhi NCR (Retail) | 8.66% — Baner, Pune (Commercial Office) |
| Median demand score | 51.4 — Pocharam, Hyderabad | 76.6 — Banjara Hills, Hyderabad |
| Median risk score (higher = riskier) | 25.4 — Gurugram — Golf Course Road, Delhi NCR | 66.2 — Undri / Pisoli, Pune |

The median of the segments' gross yields is 7.90%. That is a statistic of the market universe, not of the portfolio.

### 4.3 Field dictionary (`public/data/markets.json`, array `markets`)

Every statistical field is the **median of the segment's simulated observations**, computed by `data-pipeline/scripts/deriveMarkets.js`. Provenance fields are carried through from the pipeline inputs unchanged.

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `marketId` | string | — | `MKT-001` … `MKT-050` |
| `city` | string | — | One of the eight cities |
| `locality` | string | — | Segment label. Two segments share the label "Noida — Sector 62" with different property types; `comparabilityWarning` says so |
| `propertyType` | string | — | Commercial Office, Retail or Residential |
| `medianCapitalValuePerSqFt` | number | ₹ per sq ft | Median of the draws' `sale_price_psf` |
| `medianMonthlyRentPerSqFt` | number | ₹ per sq ft per month | Median of the draws' `monthly_rent_psf` |
| `annualRentalGrowthRatio` | number | decimal per year | Median of the draws' `rental_growth_pct` ÷ 100 |
| `demandScore` | number | 0–100 index | Median of the draws' `demand_score` |
| `riskScore` | number | 0–100 index, higher = riskier | Median of the draws' `market_risk_score`. The scoring engine uses 100 − this as "low market risk" |
| `observationCount` | integer | simulated observations | Number of draws generated for the segment |
| `dataAsOf` | string | YYYY-MM-DD | 2026-09-19 for every segment |
| `isSynthetic` | boolean | — | `true` for every segment |
| `sourceType` | string | code | Internal code for how the assumption set was built — Section 4.4 |
| `confidenceGrade` | string | A–E | The segment's **Assumption Support Grade**. The field name is retained from an earlier revision for compatibility |
| `localityClass` | string | — | Premium, Established, Emerging, Growth or Peripheral |
| `dataClassification` | string | — | Derived, Estimated or Synthetic — Section 4.5 |
| `isSemiSynthetic` | boolean | — | `false` for every segment |
| `sourceIds` | string[] | — | Register entries the segment's assumptions cite. **External calibration is computed from this field only** |
| `assumptionIds` | string[] | — | Entries in `data-pipeline/assumptions.csv` |
| `methodologyNote` | string | — | Free text from the assumption set naming the publications the assumptions were meant to follow, and the seed |
| `classificationNote` | string | — | Free text describing the intended basis of the locality estimate |
| `comparabilityWarning` | string | — | `None`, or a warning (two segments) |
| `uncertainty` | object | — | P10 (`lower`), median (`central`) and P90 (`upper`) of the draws for `grossYieldPct`, `rentalGrowthPct`, `demandScore` and `riskScore`, with the basis stated |
| `derivedFrom` | object | — | Source file, generator version, observation count and the statistic used (median) |

**Gross yield is not stored.** The application computes it as `medianMonthlyRentPerSqFt × 12 ÷ medianCapitalValuePerSqFt`. Because a ratio of medians is not the median of ratios, this differs slightly from `uncertainty.grossYieldPct.central` (the median of the draws' own yields) — by at most 0.31 percentage points across the universe — and lies inside the P10–P90 band for all 50 segments.

**Read the two note fields with care.** `methodologyNote` and `classificationNote` were written when the assumption set was built and use phrases such as "parameterised on JLL/CBRE India Office Research Q4 2024" and "derived from REIT annual-report disclosures". None of the documents they refer to was located. Moreover, for every segment the publications named in `methodologyNote` are not the register entries listed in `sourceIds` (office segments cite SRC-001/SRC-002, retail segments SRC-003/SRC-004 and residential segments SRC-005/SRC-006). Treat the notes as a record of intent, not as sourced facts.

The file header carries `datasetName`, `dataAsOf`, `currency: INR`, `areaUnit: sqft`, `isSynthetic: true`, a disclaimer, `totalMarkets` and `derivedFrom`. Its dataset-level `sourceType` value (`synthetic_academic_placeholder`) is a label for the file as a whole; it does not describe each segment, whose codes are given below.

### 4.4 `sourceType` codes and their display labels

The codes are internal. The Data Centre shows the label from `SOURCE_TYPE_LABELS` in `public/js/appMeta.js` (column "Assumption basis"). No label says "reported", because no reported figure has been verified.

| Code | Display label | Segments |
|---|---|---|
| `synthetic_academic_placeholder` | Synthetic placeholder | 21 |
| `estimated_synthetic` | Estimated by synthetic interpolation | 19 |
| `estimated_tier3` | City benchmark × locality multiplier — Tier-3 source cited, not located | 9 |
| `reported_tier1` | Benchmark-based assumption — Tier-1 source cited, not located | 1 |

An unknown code would be shown as "Unclassified assumption". The code and the Assumption Support Grade were assigned separately and do not map one to one:

| Code | B | C | D | E |
|---|---|---|---|---|
| `synthetic_academic_placeholder` | 6 | 11 | 1 | 3 |
| `estimated_synthetic` | 0 | 0 | 19 | 0 |
| `estimated_tier3` | 0 | 9 | 0 | 0 |
| `reported_tier1` | 1 | 0 | 0 | 0 |

### 4.5 `dataClassification` values

| Value | Segments | Intended meaning (`data-pipeline/scripts/deriveMarkets.js`) |
|---|---|---|
| Derived | 8 | A REIT disclosure was intended to anchor the locality |
| Estimated | 39 | A city benchmark was extrapolated to the locality |
| Synthetic | 3 | No documented anchor at all |

These describe how each assumption set was meant to be built. They are not statements about evidence: no cited document was located, so "Derived" does not mean derived from a verified source. Separately, every statistical field of every segment is derived from simulated observations, whatever its classification.

### 4.6 Notional 1,000 sq ft columns (Data Centre)

The Data Centre's segment table adds two columns: **Notional value (1,000 sq ft)** = median value per sq ft × 1,000, and **Notional monthly rent (1,000 sq ft)** = median monthly rent per sq ft × 1,000. They put every segment on the same footing and in the same shape as an imported listing-style file. They are normalised representative amounts, not listings or prices of any real unit, and they are not used in scoring.

### 4.7 Statistics by group, and the confidence-interval unit

The Data Centre summarises segment medians by city and by city × property type. **The unit in both tables is the micro-market — one segment median — not the observation.** "Micro-markets" counts segments; "Simulated observations" counts the draws behind them.

A 95% confidence interval for the median gross yield would be bootstrapped across segment medians (500 resamples, seed 20260919) and requires at least ten micro-markets. The city × property-type table has 22 groups containing between one and six micro-markets each, so **no interval is computed**; the table shows "Not computed" and a reason stating how many micro-markets the group has and that a bootstrap of segment medians needs at least ten. Observation-level spread for each segment is shown as its P10–P90 range on the Market Screener.

---

## 5. Level 3 — Simulated observation dataset

### 5.1 Fields (`public/data/observations.json`, array `observations`)

| Field | Unit | Meaning |
|---|---|---|
| `obs_id` | — | `MKT-nnn_Dnnn`: segment and draw number |
| `market_id`, `city`, `locality`, `property_type`, `locality_class` | — | The segment the draw belongs to |
| `city_tier` | 1–3 | Tier 1: Mumbai, Delhi NCR, Bengaluru; tier 2: Pune, Hyderabad, Chennai; tier 3: Kolkata, Ahmedabad |
| `confidence_grade` | A–E | The segment's Assumption Support Grade |
| `draw_number`, `seed`, `generator_version`, `date_generated` | — | Provenance; `date_generated` is fixed at 2026-09-19 so the output is reproducible |
| `monthly_rent_psf` | ₹ per sq ft per month | Sampled rent |
| `sale_price_psf` | ₹ per sq ft | Value per sq ft, derived as rent × 12 ÷ modelled yield. The name is the generator's; it is not a sale |
| `gross_yield_pct` | % | Modelled gross yield |
| `rental_growth_pct`, `capital_growth_pct` | % per year | Growth rates |
| `occupancy_pct`, `vacancy_pct` | % | Occupancy and its complement |
| `demand_score`, `market_risk_score` | 0–100 index | Demand and risk indices |

The draws behind a segment are its simulated market observations. More draws narrow a segment's median around the **assumed** distribution; they are not market evidence.

### 5.2 Generator, seed and reproducibility

- **Script:** `data-pipeline/scripts/generateObservations.js`, generator version 2.0.0, seed 20260919, data as of 2026-09-19. The earlier generator, `generateSemiSyntheticData.js`, is retained unchanged for provenance and is not used.
- **Inputs:** `data-pipeline/market_universe.csv` (the segments, locality classes and grades) and `data-pipeline/market_estimates_long.csv` (lower, central and upper estimates for each metric of each segment, used as triangular marginals). `data-pipeline/assumptions.csv` and `data-pipeline/evidence_register.csv` record the assumptions and the figures they were intended to follow; none of those figures has been traced to a located document.
- **Model:** gross yield = base for the property type + adjustment for locality class + adjustment for city tier + noise; rent is sampled and value is derived from rent and yield, so the three never contradict one another. Other metrics are drawn through a Gaussian copula and mapped back through their triangular marginals. Dispersion is tighter in first-tier cities than in third-tier cities.
- **Draws per segment:** proportional to a liquidity proxy (locality class × city tier, with seeded noise), rescaled to the fixed total, with a minimum of 26 per segment.
- **Known synthetic anomalies:** the generator inserts anomalies of five kinds — subtle mispricing, distressed sale, trophy asset, data-entry error, and a bivariate-only kind detectable only by a multivariate method. Their identities are written to `data-pipeline/generated/outlier_truth.json` and are **not** included in the published observation records, so detection code cannot read the answer. The count and share are in the key-figures table above.
- **Pseudo-random generator:** Mulberry32 with a fixed seed. Nothing reads the clock or `Math.random`.
- **Reproducibility:** regenerating produces byte-identical output. Continuous integration (`.github/workflows/tests.yml`) regenerates `data-pipeline/generated/observations.v2.json` and fails if it differs from the committed file.

Regenerate the whole chain in this order:

```bash
node data-pipeline/scripts/generateObservations.js       # simulated observations + ground truth
node data-pipeline/scripts/deriveMarkets.js              # markets.json (medians) + public observations.json
node data-pipeline/scripts/computeStatistics.js          # statistics.json
node data-pipeline/scripts/buildObservationDistribution.js  # observation-distribution.json
node data-pipeline/scripts/buildMeta.js                  # meta.json, CANONICAL_FACTS.md, generated blocks
```

---

## 6. Level 4 — Source / calibration register

`data-pipeline/source_register.csv` lists every source the assumptions cite, with columns `source_id`, `tier`, `publisher`, `title`, `year`, `url`, `verification_status`, `verification_date`, `verification_method`, `secondary_host` and `notes`. The state before verification is kept as `source_register.pre-verification.csv`. It has twelve external sources (tier 1: REIT annual reports; tier 2: property-consultancy research; tier 3: press) and one internal entry, SRC-013, the project's own assumption set.

`buildMeta.js` classifies each `verification_status` as Verified, Partially supported, Unverified or Internal and writes the result to `meta.json`. A segment's **external calibration status** is then derived from the sources in its `sourceIds` alone — never from its observation count or grade:

- **Verified** — every external source it cites was located and the figure traced;
- **Partially supported** — at least one cited source was located and a figure traced;
- **Unverified** — no cited figure has been traced.

<!-- canonical:BEGIN screen-and-calibration -->
- **Composite attractiveness score** — the five weighted factors. Never changed by the screen.
- **Simulation support** — simulated observations behind a segment's medians, their P10–P90 spread, and the project's own Assumption Support Grade (A–E). A transparent project governance convention for simulation precision, not a regulatory or universal statistical threshold. Thirty draws keeps the P10–P90 spread of a segment's simulated medians reasonably narrow; grade C or better excludes segments whose assumptions the project itself classed as interpolated or placeholder. Passing the screen says nothing about real-market accuracy.
- **Simulation-support screen** — at least 30 simulated observations and Assumption Support Grade C or better. 25 of 50 segments pass.
- **External calibration** — from the source register only: 0 of 12 cited external sources verified; 0 partially supported. A segment is Verified only when every external source it cites is verified. Every segment is Unverified.
- **Wording** — the model output is a *shortlist candidate*: "Exploratory shortlist only. External calibration remains unverified — proceed to further evidence collection and due diligence before any real decision."
<!-- canonical:END screen-and-calibration -->

The verification method, the outcome for each source and the two factual errors found in the register's notes are documented in `docs/SOURCE_VERIFICATION_REPORT.md`.

---

## 7. Level 5 — Data quality and CSV cleaning

The Data Centre's import runs a listing-style CSV through `public/js/dataCleaner.js`. Imported files are checked only; they never change the market segments or the analysis.

**Columns.** Required: `city`, `locality`, `propertyType`, `areaSqFt`, `askingPriceINR`, `monthlyRentINR`. Optional: `recordId`, `sourceName`, `sourceUrl`, `collectionDate`, `datasetType`, `isSynthetic`, `listingType`. A template can be downloaded from the page.

**Steps, in order:**

1. `validateColumns` — required columns present; if any is missing, the pipeline stops there, counts every row as rejected and names the missing columns.
2. `standardiseNames` — trims names and normalises property-type spelling (for example "office" to Commercial Office).
3. `convertUnits` — parses Indian notation ("50 lakh", "1.2 crore", "₹1,20,000"); treats areas as square metres and converts them when the file's median area is below 500.
4. `rejectImpossible` — rejects area below 10 sq ft or above 100,000 sq ft, and asking price or monthly rent that is not a positive number.
5. `detectDuplicates` — flags exact repeats of source, locality, property type, area and price.
6. `flagOutliers` — flags price per sq ft outside 1.5 × IQR within a city + locality + property-type group that has at least four rows with a valid price.

Every input row is kept in the output with a status (OK, warning or rejected) and a stated reason; no row is silently dropped. The page reports totals and each step's result, and the report can be downloaded as CSV.

**Fixtures (`tests/fixtures/`).** Both files are synthetic, with deliberately round values. Running them through the pipeline gives:

| File | Rows | Result |
|---|---|---|
| `markets-valid.csv` | 6 | 6 OK, 0 rejected, 0 warnings, no missing columns |
| `markets-invalid.csv` | 6 | 0 OK, 6 rejected — each row breaks one rule (zero area, oversized area, zero price, negative rent, blank price, non-numeric area) |

For the blank price and the non-numeric area, the stated reason is the general one for that field ("askingPriceINR ≤ 0" and "areaSqFt < 10"), because a value that cannot be read as a number is treated as failing the same rule. `tests/fixtures/README.md` lists what each invalid row breaks, and the test suite asserts both outcomes.

The Data Centre also runs a ten-item **System Check** (`public/js/systemCheck.js`) that exercises the production engines — HHI, scoring, projections, the cleaning pipeline, the shared analysis run, the canonical counts and the stored agent commentary — against the current data, showing what each check expected and what it got.

---

## 8. Other files in `public/data/`

| File | Produced by | Contents |
|---|---|---|
| `meta.json` | `buildMeta.js` | Canonical counts, the source-verification summary, the per-preset results and the controlled terminology. Generated; do not edit |
| `statistics.json` | `computeStatistics.js` | Descriptive statistics, correlations, Simpson's-paradox and regression results, anomaly-detector results against the ground truth, sample-size summary |
| `observation-distribution.json` | `buildObservationDistribution.js` | Per-segment quantiles and ten-bin histograms for six metrics, used by the Market Screener |
| `agent-cache.json` | `buildAgentCache.js` | Stored agent commentary for the four presets at the canonical defaults, keyed by scenario key |

---

*REIT Target AI — Vishesh Jain — NMIMS B.Sc. Finance, Business Analytics, Theme 4. Academic demonstration on synthetic data; not investment advice.*

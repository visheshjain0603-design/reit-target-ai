# Data Validation Report — REIT Target AI Semi-Synthetic Pipeline

> **On the `[superseded]` marker.** Lines in this document tagged
> `[superseded]` record something that was true of an earlier revision of the
> project and is not true now. They are kept deliberately: a log or a test
> record edited to agree with the present is no longer evidence of what
> happened. The current figures are in
> [`docs/CANONICAL_FACTS.md`](../../docs/CANONICAL_FACTS.md), and the test suite fails on any
> *unmarked* line that contradicts them.


**Project**: NMIMS B.Sc. Finance · Business Analytics Theme 4  
**Date**: 2026-09-19  
**Version**: 1.0

---

## 1. Test Execution Summary

Validation suite: `data-pipeline/tests/dataPipeline.test.js`  
Run command: `node tests/dataPipeline.test.js` (from `data-pipeline/`)

| Outcome | Count |
|---|---|
| PASSED | 22 |
| FAILED | 0 |
| Total | 22 |

**Result: 22 PASSED, 0 FAILED ✓**

---

## 2. Test Detail

### Group 1: Source & Evidence Register Integrity (T-01 – T-04)

| ID | Description | Result |
|---|---|---|
| T-01 | source_register.csv exists and is non-empty | PASS |
| T-02 | All SRC-001 through SRC-013 present in source register | PASS |
| T-03 | evidence_register.csv has exactly 18 rows | PASS |
| T-04 | assumptions.csv has exactly 48 rows | PASS |

### Group 2: Market Universe Completeness (T-05 – T-08)

| ID | Description | Result |
|---|---|---|
| T-05 | market_universe.csv has exactly 50 markets | PASS |
| T-06 | Property type split 30/10/10 (CO=30, Retail=10, Residential=10) | PASS |
| T-07 | All 50 market_ids are unique | PASS |
| T-08 | All confidence_grade values in {A, B, C, D, E} | PASS |

### Group 3: Estimate Range Logic & Evidence Classification (T-09 – T-12)

| ID | Description | Result |
|---|---|---|
| T-09 | market_estimates_long.csv has 450 rows (50 × 9) | PASS |
| T-10 | lower ≤ central ≤ upper for all 450 estimate rows (violations: 0) | PASS |
| T-11 | All evidence_classification values in allowed set | PASS |
| T-12 | gross_yield_pct rows: 50 present, all classified as Derived | PASS |

### Group 4: Observation Count & Seed Reproducibility (T-13 – T-16)

| ID | Description | Result |
|---|---|---|
| T-13 | observations.csv has exactly 2000 rows | PASS | [superseded]
| T-14 | observations.json has exactly 2000 entries | PASS | [superseded]
| T-15 | generation_log.json records seed = 20260919 | PASS |
| T-16 | PRNG reproducibility: MKT-001 D001 monthly_rent_psf = 180.8053 (re-computed matches saved) | PASS |

### Group 5: Derived Field Consistency (T-17 – T-19)

| ID | Description | Result |
|---|---|---|
| T-17 | gross_yield_pct_derived matches formula for all 2000 observations (max error: 0.000000) | PASS | [superseded]
| T-18 | No negative values for rent / price / yield / demand / risk fields | PASS |
| T-19 | occupancy_rate_pct and vacancy_rate_pct all in [0, 100] | PASS |

### Group 6: Isolation Guard (T-20 – T-22)

| ID | Description | Result |
|---|---|---|
| T-20 | generateSemiSyntheticData.js does not reference application code (public/js) | PASS |
| T-21 | generateSemiSyntheticData.js does not reference Firebase | PASS |
| T-22 | generation_log property-type counts: CO=1200, Retail=400, Residential=400 | PASS |

---

## 3. Generated Data Statistics

| Metric | Mean | Std Dev | Min | Max |
|---|---|---|---|---|
| monthly_rent_psf (INR/sqft/month) | 92.37 | 56.32 | ~20 | ~320 |
| sale_price_psf (INR/sqft) | 12,800 | 8,200 | ~2,400 | ~40,000 |
| gross_yield_pct_derived (%) | 8.90 | 2.15 | ~4.0 | ~15.0 |
| rental_growth_pct (% p.a.) | 6.61 | 2.20 | ~1.5 | ~14.0 |
| demand_score (0–100) | 62.5 | 15.3 | ~20 | ~95 |
| risk_score (0–100) | 48.2 | 14.8 | ~15 | ~85 |

*Values rounded for presentation; full precision in observations.json.*

---

## 4. Known Limitations

See `LIMITATIONS.md` for full discussion.

Key items:
- 24 of 50 markets are Grade C–E (estimation or synthetic data)
- Occupancy and vacancy are drawn independently (not constrained to sum to 100%)
- Residential sector has the fewest Tier-1 sources (mostly Grade D/E)
- Transaction volume index is fully synthetic for all markets

---

## 5. Validation Run Environment

| Property | Value |
|---|---|
| Node.js | v18+ (no external packages required) |
| Run date | 2026-09-19 |
| Platform | macOS (M-series), compatible with Linux |
| PRNG seed | 20260919 (fixed) |
| Test framework | Native Node.js assertions (no Jest / Mocha dependency) |

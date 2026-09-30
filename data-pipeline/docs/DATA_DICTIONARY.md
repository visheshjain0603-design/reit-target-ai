# Data Dictionary — REIT Target AI Semi-Synthetic Pipeline

**Project**: NMIMS B.Sc. Finance · Business Analytics Theme 4  
**Date**: 2026-09-19  
**Version**: 1.0

---

## File: source_register.csv

| Field | Type | Description |
|---|---|---|
| source_id | string | Unique ID (SRC-001 … SRC-013) |
| name | string | Full source name |
| type | string | Source type (Annual Report, Broker Report, Regulator, etc.) |
| tier | integer | Credibility tier 1–5 (1 = highest) |
| publisher | string | Organisation that published the source |
| year | integer | Publication year |
| url | string | URL or reference (where publicly accessible) |
| notes | string | Additional context |

---

## File: evidence_register.csv

| Field | Type | Description |
|---|---|---|
| evidence_id | string | Unique ID (EVD-001 … EVD-018) |
| source_id | string | FK → source_register.source_id |
| city | string | City covered by this evidence record |
| property_type | string | Commercial Office / Retail / Residential |
| metric | string | Metric name this evidence supports |
| reported_value | string | Value as quoted from the source |
| unit | string | Unit of the reported value |
| date_as_of | string | YYYY-MM-DD when data was current |
| notes | string | Methodology notes or caveats |

---

## File: assumptions.csv

| Field | Type | Description |
|---|---|---|
| assumption_id | string | Unique ID (ASM-001 … ASM-048) |
| category | string | Assumption category (rent, growth, cap_rate, etc.) |
| scope | string | Market or city/type class this assumption applies to |
| description | string | Plain-English statement of the assumption |
| basis | string | Evidence or reasoning supporting it |
| confidence | string | A/B/C/D/E |

---

## File: market_universe.csv

| Field | Type | Description |
|---|---|---|
| market_id | string | Unique ID (MKT-001 … MKT-050) |
| city | string | City name |
| locality | string | Sub-market / micro-market name |
| property_type | string | Commercial Office / Retail / Residential |
| geography_level | string | Micro-market / Sub-city |
| locality_class | string | Premium / Established / Growth / Peripheral |
| existing_id | boolean | True if in the original 18-market dataset |
| analysis_ready | boolean | True if all required fields for scoring are present |
| evidence_ready | boolean | True if at least one Tier-1/2 evidence record exists |
| confidence_grade | string | Overall confidence A–E |
| data_as_of | string | Date of most recent data |
| notes | string | Data lineage notes |

---

## File: market_estimates_long.csv

One row per market × metric combination (50 × 9 = 450 rows).

| Field | Type | Description |
|---|---|---|
| market_id | string | FK → market_universe.market_id |
| metric_name | string | See Metric Names below |
| central_estimate | float | Point estimate (mode of triangular distribution) |
| lower_estimate | float | Lower bound (≤ central_estimate) |
| upper_estimate | float | Upper bound (≥ central_estimate) |
| unit | string | Measurement unit |
| evidence_classification | string | Reported / Derived / Estimated / Synthetic / Missing |
| uncertainty_type | string | Description of the uncertainty band |
| confidence_grade | string | A–E |
| evidence_ids | string | Pipe-separated EVD-xxx IDs supporting this estimate |
| assumption_ids | string | Pipe-separated ASM-xxx IDs used |
| calculation_method | string | How the estimate was produced |
| comparability_warning | string | Warnings about cross-market comparison |
| data_as_of | string | Reference date (YYYY-MM-DD) |

### Metric Names

| metric_name | Unit | Classification notes |
|---|---|---|
| monthly_rent_psf | INR/sqft/month | Reported for REIT markets; Estimated for others |
| sale_price_psf | INR/sqft | Always Derived (rent ÷ cap_rate) |
| gross_yield_pct | percent | Always Derived (rent × 12 ÷ price × 100); never independently sampled |
| rental_growth_pct | percent per annum | Estimated from broker reports; REIT contractual escalation |
| capital_growth_pct | percent per annum | Estimated; follows rental growth with city premium |
| vacancy_rate_pct | percent | Estimated; JLL / Cushman city averages |
| occupancy_rate_pct | percent | Estimated; approximately complement of vacancy |
| demand_score | 0–100 index | Estimated via formula from occupancy/growth/location inputs |
| risk_score | 0–100 index | Estimated via formula from vacancy/supply/liquidity inputs |
| transaction_volume_index | 0–100 index | Synthetic; relative market activity proxy |

---

## File: generated/observations.csv & observations.json

One row per observation (2 000 total: 50 markets × 40 draws).

| Field | Type | Description |
|---|---|---|
| obs_id | string | Unique ID: MKT-xxx_Dyyy |
| market_id | string | FK → market_universe.market_id |
| city | string | City |
| locality | string | Sub-market |
| property_type | string | Commercial Office / Retail / Residential |
| locality_class | string | Premium / Established / Growth / Peripheral |
| confidence_grade | string | A–E |
| draw_number | integer | Draw index within this market (1–40) |
| seed | integer | PRNG seed used (always 20260919) |
| date_generated | string | YYYY-MM-DD |
| monthly_rent_psf | float | Sampled rent (INR/sqft/month) |
| monthly_rent_psf_evidence_class | string | Evidence classification for this metric |
| monthly_rent_psf_uncertainty_type | string | Uncertainty band description |
| sale_price_psf | float | Sampled sale price (INR/sqft) |
| … (similar _evidence_class and _uncertainty_type for each metric) | | |
| gross_yield_pct_derived | float | Post-computed: (rent × 12 / price × 100); not independently sampled |

---

## File: generated/generation_log.json

Run metadata written after each generator execution.

| Field | Type | Description |
|---|---|---|
| generator_version | string | Script version |
| generated_at | string | Run date (YYYY-MM-DD) |
| seed | integer | PRNG seed |
| draws_per_market | integer | Draws per market (40) |
| markets_count | integer | Should be 50 |
| total_observations | integer | Should be 2000 |
| prng_algorithm | string | Algorithm name |
| distribution | string | Distribution name and parameterisation |
| isolation_note | string | Confirms pipeline isolation |
| outputs | object | Relative paths to output files |
| observations_by_property_type | object | Count by property type |
| observations_by_confidence | object | Count by confidence grade |
| summary_statistics | object | Per-metric mean, std_dev, min, max |

---

## Appendix: Fields Added in v2.0 (2026-09-20)

The following fields were added to `public/data/markets.json` for all 50 markets in the Stage 2–3 standardisation pass:

| Field | Type | Values | Description |
|---|---|---|---|
| `confidenceGrade` | string | A, B, C, D, E | Data confidence: A=Reported, B=Derived-high, C=Estimated-medium, D=Estimated-low, E=Synthetic |
| `localityClass` | string | Premium / Established / Emerging / Secondary / Peripheral / Industrial | Market maturity and quality tier |
| `dataClassification` | string | Synthetic / Semi-Synthetic / Estimated / Reported | Origin of data values |
| `isSemiSynthetic` | boolean | true/false | True for MKT-019 to MKT-050 (pipeline-generated) |
| `sourceIds` | string[] | SRC-001 to SRC-006 | Reference to source_register.csv entries |
| `assumptionIds` | string[] | ASM-xxx | Reference to assumptions.csv entries |
| `methodologyNote` | string | free text | Brief summary of estimation method |
| `comparabilityWarning` | string | free text or "None" | Notes on cross-market comparability issues |
| `uncertainty` | object | see below | Uncertainty ranges for key scoring metrics |

### uncertainty Object Structure

```json
{
  "uncertainty": {
    "grossYieldPct": { "lower": 7.2, "central": 8.18, "upper": 9.8, "basis": "Plausible range (±10-12%)" },
    "rentalGrowthPct": { "lower": 4.8, "central": 6.0, "upper": 7.2, "basis": "Plausible range (±20%)" },
    "demandScore": { "lower": 73.8, "central": 82.0, "upper": 90.2, "basis": "Plausible range (±10%)" },
    "riskScore": { "lower": 21.2, "central": 25.6, "upper": 30.9, "basis": "Plausible range (±10-12%)" }
  }
}
```

All ranges satisfy `lower ≤ central ≤ upper` (validated by test T-111).


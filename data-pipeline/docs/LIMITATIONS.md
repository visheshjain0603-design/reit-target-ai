# Limitations & Caveats — REIT Target AI Semi-Synthetic Pipeline

**Project**: NMIMS B.Sc. Finance · Business Analytics Theme 4  
**Date**: 2026-09-19  
**Version**: 1.0

---

## 1. Overview

This document is a frank record of what the data pipeline does and does not represent. Readers should treat these limitations as essential context, not as minor footnotes.

---

## 2. Data Availability Limitations

### 2.1 Limited Tier-1 Coverage

Only 26 of 50 markets have at least one Tier-1 or Tier-2 source record (`evidence_ready = True`). The remaining 24 markets are estimated from Tier-3 broker averages or constructed synthetically. These should be treated as placeholder scenarios, not investable intelligence.

### 2.2 Residential Sector Data Gap

Indian residential REIT investment is nascent. No publicly listed REIT in India (as of 2025) holds purely residential assets. The 10 residential markets in this pipeline rely almost entirely on broker resale databases (ANAROCK, JLL) and transaction portals (MagicBricks estimates). Grade D/E confidence is therefore expected across almost all residential metrics.

### 2.3 Retail Sector Footfall Data

Retail performance is driven by footfall, anchor tenant mix, and catchment demographics — none of which are captured in this pipeline. The occupancy and demand estimates for retail markets are derived from macro broker reports and carry meaningful uncertainty.

### 2.4 Sub-market vs. Building-level Variation

All estimates are at micro-market level. Within a single micro-market, building quality (Grade A vs. Grade B), floor level, and tenant creditworthiness create large intra-market spread that is not modelled here.

---

## 3. Methodological Limitations

### 3.1 Triangular Distribution Assumption

The triangular distribution assumes the central estimate is the most likely value and that the range is symmetric in shape. In reality, real estate returns exhibit skewness (long downside tails in stress periods). A more accurate model would use log-normal or empirical historical distributions.

### 3.2 Independent Metric Sampling

All 9 metrics are drawn independently in each observation. In practice, rent and vacancy are strongly negatively correlated; high-demand markets command both higher rents and lower vacancies. This correlation structure is not captured, which means some generated observations may be internally inconsistent (e.g., high vacancy with high rent). The `gross_yield_pct_derived` field is always computed from sampled rent and price to maintain that one consistency.

### 3.3 Static Estimates

All central/lower/upper estimates reflect conditions as of 2025–2026. They do not model time-series dynamics, cyclical effects, or structural shifts in demand.

### 3.4 Capital Value Derivation

Sale price is derived from rent via a capitalisation multiplier (cap rate), not directly observed. Cap rate assumptions (see ASM-034 to ASM-043) are themselves estimated from broker research and carry ±50–100 bps uncertainty, which propagates into sale price and gross yield.

### 3.5 Demand Score & Risk Score Formula

The demand and risk score formulas (see DATA_METHODOLOGY §6.5) are model constructs for this project. They are not industry-standard indices and should not be compared to commercial indices such as Knight Frank Prime Global Cities Index or JLL City Momentum Index.

---

## 4. Pipeline Isolation Limitations

### 4.1 Not Connected to Production Application

Generated data in `data-pipeline/generated/` is **not** imported by the Market Screener or any other application component. The 18-market production dataset in `public/data/markets.json` remains unchanged. Discrepancies between pipeline estimates and the production dataset are expected and intentional.

### 4.2 Academic Use Only

All estimates are constructed for academic illustration of data engineering and evidence-based estimation principles. They must not be used for actual REIT investment decisions, client reporting, or regulatory submissions.

---

## 5. Missing Data by Market

Markets with `confidence_grade = E` (3 markets: MKT-036, MKT-037-ish, MKT-048-ish) are the lowest-confidence in the pipeline. All their metrics are largely synthetic and should be excluded from any analysis requiring reliable data.

Markets with `evidence_ready = False` (24 markets) have no directly reported data; all metrics are derived or estimated.

---

## 6. Interpretation Cautions

- Do not compare absolute rent or price figures across property types without accounting for unit differences and local market context.
- Gross yield derived here is a simple calculation; levered returns, transaction costs, and management fees are excluded.
- The 2 000 simulated observations are draws from an assumed distribution — they are not historical transaction records. Treating them as empirical data would be methodologically incorrect.
- Confidence grade E markets should be used only to illustrate data gaps, not to derive conclusions about those markets.

---

## 7. Future Improvement Opportunities

The following enhancements would materially improve data quality:

1. Direct data-sharing agreements with Embassy REIT and Mindspace REIT investor-relations teams
2. Integration of government RERA transaction databases (state-level)
3. Correlated sampling (copula model) to capture rent-vacancy relationships
4. Time-series extension with quarterly updates
5. Building-level data collection for Tier-1 office markets

---

## 8. Data Quality Issues Identified and Resolved (Stage 4, 2026-09-20)

The following critical data quality issues were found during the Stage 1 audit and corrected:

### 8.1 riskScore = 0 Bug (Resolved)
All 32 markets added in the expansion phase (MKT-019 to MKT-050) had `riskScore = 0` due to a metric name mismatch in the conversion script (`"risk_score"` was used instead of `"market_risk_score"`). This inflated composite scores for all 32 markets by up to 8 points. Fixed by sourcing `riskScore` from `market_risk_score` in `market_estimates_long.csv`.

### 8.2 Duplicate Rent/Price Values (Partially Resolved)
Five groups of markets (11 markets total) had identical rent and capital value figures due to template copying in the pipeline construction script:
- MKT-020 / MKT-021 (now differentiated: 90/11,700 vs. 105/13,650)
- MKT-022 / MKT-024 (now differentiated: 125/17,500 vs. 135/18,900)
- MKT-025 / MKT-028 / MKT-029 (absolute values differ; note yield ratios differ for MKT-029)
- MKT-031 / MKT-036 (now differentiated)
- MKT-032 / MKT-033 (now differentiated)

**Remaining limitation:** Several market clusters still share identical scores in ALL five scoring dimensions (yield, growth, demand, risk) because the pipeline itself assigned identical values for these dimensions. Within-cluster tie-breaking uses ascending `marketId`, which has no economic meaning. Future pipeline versions should independently calibrate each market.

### 8.3 Uniform 12% Retail Yield (Resolved)
New retail markets MKT-040 to MKT-045 originally had mechanically identical 12.00% gross yield (rent = price/100). Corrected to plausible ranges 7.0–8.2% based on JLL India Retail Outlook 2024. Confidence grade D.

### 8.4 Uniform 4.29% Residential Yield (Resolved)
New residential markets MKT-046 to MKT-050 originally had identical 4.29% gross yield. Corrected to range 2.80–4.82% reflecting city-level residential yield differentials. Confidence grade D.

### 8.5 Global Min-Max Normalisation (Acknowledged, Not Changed)
The scoring engine uses global (all-property-type) min-max normalisation. Residential markets with yields of 2.8–5.3% are penalised relative to commercial markets (8–10.4%) on the yield factor. This is architecturally correct for cross-type comparison but makes residential-vs.-residential rankings unreliable on yield alone. Documented but not changed to preserve backward compatibility.


# Scoring Model Audit
**Date:** 2026-09-20  
**Stage:** 6 of 12  
**Auditor:** Claude Sonnet 4.6

---

## 1. Scoring Engine Overview

File: `public/js/scoringEngine.js`

### 1.1 Gross Yield Calculation
```
grossYield(market) = (medianMonthlyRentPerSqFt × 12) / medianCapitalValuePerSqFt
```
- Returns a decimal (e.g., 0.0818 for 8.18%).
- Not stored in `markets.json`; computed on the fly. ✅ Correct.

### 1.2 Normalisation
```
normalise(value, min, max) → 0–100
  → 50 if min === max (degenerate range)
  → ((value - min) / (max - min)) × 100 otherwise
```
- Applied globally across all 50 markets, regardless of property type.
- **Known limitation:** Residential yields (2.8–5.3%) will always score low on the yield factor vs. Commercial (8.1–10.4%). This is mathematically correct if the intent is cross-type comparison, but distorts intra-type rankings when comparing residential vs. residential. Disclosed in LIMITATIONS.md.

### 1.3 Factor Weights (4 Presets)

| Factor | Balanced | Income | Growth | Divers |
|---|---|---|---|---|
| Yield | 0.25 | 0.45 | 0.10 | 0.15 |
| Growth | 0.25 | 0.10 | 0.40 | 0.15 |
| Diversification | 0.20 | 0.15 | 0.20 | 0.45 |
| Demand | 0.20 | 0.20 | 0.20 | 0.15 |
| Risk | 0.10 | 0.10 | 0.10 | 0.10 |

All four weight sets sum to 1.0. ✅ Validated by `validateWeights()`.

### 1.4 Risk Inversion
```
lowRisk = 100 − riskScore
```
Lower raw riskScore → higher lowRisk → higher score contribution. Semantically correct.

---

## 2. Rankings Under Each Preset (Post-Fix, All 50 Markets)

### 2.1 Balanced Preset (25/25/20/20/10)

| Rank | Market | Score | Yield | Growth | Demand | Risk |
|---|---|---|---|---|---|---|
| 1 | MKT-010 HITEC City [Com] | 79.4 | 9.14% | 10% | 80 | 34 |
| 2 | MKT-005 Kharadi [Com] | 69.5 | 8.86% | 9% | 72 | 34 |
| 3 | MKT-007 Whitefield [Com] | 69.4 | 9.00% | 7% | 85 | 34 |
| 4 | MKT-004 Hinjewadi Ph1 [Com] | 68.9 | 8.84% | 8% | 78 | 34 |
| 5–9 | MKT-019,023,027,034,038 [Com] | 64.5 | 10.43% | 8% | 64.4 | 49 |
| 10 | MKT-036 Ambattur [Com] | 63.0 | 10.00% | 8% | 64.4 | 49 |
| 11–13 | MKT-022,024,026 [Com] | 62.9 | 8.57% | 7% | 75.2 | 26 |

**Observation:** Ranks 5–9 are a five-way tie (MKT-019, 023, 027, 034, 038). These markets have identical scores in all 5 dimensions from the pipeline source — a pipeline template-copy artefact. They are differentiated only by `marketId` tie-break (ascending). This is disclosed in LIMITATIONS.md as a known pipeline limitation.

### 2.2 Income-Focused Preset (45/10/15/20/10)

Top 3 unchanged (HITEC City, Whitefield, Hinjewadi). High-yield peripheral markets (MKT-019 group, 10.43%) rise to positions 4–8, overtaking lower-yield established markets.

### 2.3 Growth-Focused Preset (10/40/20/20/10)

MKT-010 (10% growth) remains #1 with score 81.9. MKT-005 (9% growth) #2. MKT-011 Gachibowli [Res] enters top 5 (rank 5, 9% growth) — high growth compensates for low residential yield.

### 2.4 Diversification-Focused Preset (15/15/45/15/10)

All scores compress; diversification weight dominates. MKT-010 remains #1. Low-risk markets (BKC, Golf Course Rd, Aerocity, Outer Ring Road — all riskScore 26) cluster in top 10.

---

## 3. Audit Findings

### F1 — Global Min-Max Normalisation Conflates Property Types

**Severity:** Moderate  
**Description:** `computeRanges()` computes yield/growth/demand/risk min and max across all 50 markets regardless of property type. A residential yield of 5.3% is normalised on the same 2.8–10.4% scale as commercial yields. Residential markets are structurally penalised on the yield factor.  
**Impact:** Residential markets rank lower than equivalent-quality commercial markets in income-focused presets. This is economically realistic (commercial does yield more) but makes cross-type comparisons misleading.  
**Recommendation:** Add a `propertyTypeAdjustedYield` derived field normalised within property type, disclosed as a supplementary metric. Do not change the primary scoring model (backward-compatibility).  
**Ranking impact:** Up to −15 points for residential markets on yield factor.

### F2 — Five-Way Score Tie for MKT-019, 023, 027, 034, 038

**Severity:** Low  
**Description:** Five peripheral commercial office markets sourced from the same pipeline template cluster share identical values in all five scoring dimensions (yield = 10.43%, growth = 8%, demand = 64.4, risk = 49). Tie-break is ascending `marketId`. Their relative order has no economic meaning.  
**Impact:** Ranking stability analysis shows these five always cluster together regardless of preset.  
**Recommendation:** Disclose in METHODOLOGY.md. Future pipeline version should differentiate these markets with independent estimates.

### F3 — demandScore: Raw vs Normalised Ambiguity

**Severity:** Low  
**Description:** `demandScore` is stored as a 0–100 index and fed directly into `scoreMarket()` where it is normalised. This double-normalisation is correct (normalise uses the dataset range, not the full 0–100 scale). However, two markets with demandScore=64.4 appear many times due to the same template-copy issue.

### F4 — riskScore Corrected (Post-Audit)

**Severity:** Critical (resolved)  
**Description:** 32 markets had riskScore=0 due to metric name mismatch in the conversion script. Fixed in Stage 4. All riskScores now sourced from `market_risk_score` column in `market_estimates_long.csv`.  
**Before fix:** 32 markets had `lowRisk = 100` (maximum), inflating composite scores by up to 8 points.  
**After fix:** riskScores range 26–65. Score spread increased; rankings reordered for all 32 affected markets.

### F5 — sensitivityAnalysis() Function Present but Untested

**Severity:** Low  
**Description:** `scoringEngine.js` exports `sensitivityAnalysis()` but no test covers it. Stage 7 adds T-31+ tests to cover this function.

---

## 4. Scoring Model Validation Status

| Check | Status | Note |
|---|---|---|
| Weight sums to 1.0 for all 4 presets | ✅ | `validateWeights()` |
| All 9 required fields present in all 50 markets | ✅ | `validateMarket()` |
| No NaN in computed scores | ✅ | Verified programmatically |
| Yield computed on-the-fly, not stored | ✅ | By design |
| Risk inversion correct direction | ✅ | `lowRisk = 100 − riskScore` |
| No market scores > 100 or < 0 | ✅ | Normalised 0-100 |
| Tie-break deterministic | ✅ | ascending marketId |
| Property-type-adjusted normalisation | ❌ | F1 — by design, documented |
| Markets differentiated within type clusters | ❌ | F2 — pipeline limitation |

---

## 5. Ranking Sensitivity Summary

HITEC City (MKT-010) is the most robust market: #1 in all four presets, with score range 69.3–81.9. It has the highest growth rate (10%), second-highest demand (80), and moderate risk (34).

Retail markets (MKT-040 to MKT-045) rank 30–43 in balanced and income presets due to lower yields relative to commercial office after yield fix (7.0–8.2% vs. 8.1–10.4% commercial). Pre-fix, they had 12% yields and would have ranked 1–15 — a clear data quality artefact that inflated their positions.

Residential markets (MKT-046 to MKT-050) rank 44–50 in income-focused preset, 38–49 in balanced. This is expected given low yields (2.8–4.8%). In growth-focused preset, high-growth residential markets (MKT-011, MKT-008) rise to positions 5–6.

---

*This audit report is an academic deliverable. All scoring parameters are illustrative only.*

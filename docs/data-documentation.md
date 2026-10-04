# Data Documentation — REIT Target AI

**NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo**

---

## 1. Overview

All data used in this project is **entirely synthetic** — hand-crafted for academic illustration. No real transaction, tenant, valuation, or market observation is included. Every file carries `"isSynthetic": true` and `"sourceType": "synthetic_academic_placeholder"` in its JSON records.

---

## 2. Portfolio data (`data/portfolio.json`)

### Schema

| Field | Type | Unit | Notes |
|-------|------|------|-------|
| `assetId` | string | — | Unique identifier, e.g. "P001" |
| `assetName` | string | — | Descriptive name |
| `city` | string | — | One of 7 Indian cities |
| `locality` | string | — | Sub-market / district |
| `assetType` | string | — | "Commercial Office", "Retail", or "Residential" |
| `propertyValue` | number | Rupees (not Crore) | Acquisition / book value |
| `annualRent` | number | Rupees (not Crore) | Gross annual contracted rent |
| `occupancyRate` | number | 0–1 decimal | Current occupancy fraction |
| `leaseExpiry` | string | YYYY-MM-DD | Weighted average lease expiry |
| `isSynthetic` | boolean | — | Always `true` |
| `sourceType` | string | — | Always `"synthetic_academic_placeholder"` |

### Summary statistics (computed)

| Metric | Value |
|--------|-------|
| Total assets | 10 |
| Total portfolio value | see [CANONICAL_FACTS.md](CANONICAL_FACTS.md) — derived from portfolio.json, not restated here |
| Total annual rent | ₹31.4 Cr (314,000,000 Rs) |
| Portfolio gross yield | ~6.98% |
| Cities covered | Mumbai, Bengaluru, Pune, Hyderabad, Chennai, Delhi NCR, Ahmedabad |
| Asset types | Commercial Office (5), Retail (2), Residential (3) |

### Asset allocation by city (approximate)

| City | Approx. share |
|------|--------------|
| Delhi NCR | 14.4% |
| Mumbai | 25.6% |
| Bengaluru | 20.0% |
| Pune | 15.6% |
| Hyderabad | 11.1% |
| Chennai | 7.8% |
| Ahmedabad | 5.6% |

### Design rationale
- Mumbai and Bengaluru were given higher weights to create a realistic concentration risk scenario (HHI above the "moderate" threshold), which the Diversification page can then visibly improve.
- Lease expiry dates were spread across 2026–2030 to demonstrate near-term lease risk in the Portfolio Analysis.
- Occupancy rates range from 0.82 to 0.95 to allow the portfolio page to flag assets below a threshold.

---

## 3. Market data (`data/markets.json`, `data/markets.csv`)

### Schema

| Field | Type | Unit | Notes |
|-------|------|------|-------|
| `marketId` | string | — | Unique identifier, e.g. "MKT-001" |
| `city` | string | — | One of 7 Indian cities |
| `locality` | string | — | Sub-market / district |
| `propertyType` | string | — | "Commercial Office", "Retail", or "Residential" |
| `medianCapitalValuePerSqFt` | number | ₹ per sq ft | Median transaction price |
| `medianMonthlyRentPerSqFt` | number | ₹ per sq ft per month | Median rental rate |
| `annualRentalGrowthRatio` | number | 0–1 decimal | Projected annual rent growth |
| `demandScore` | integer | 0–100 | Composite demand indicator |
| `riskScore` | integer | 0–100 | Higher = riskier |
| `observationCount` | integer | — | Simulated sample size |
| `dataAsOf` | string | YYYY-MM-DD | "2026-09-19" for all records |
| `isSynthetic` | boolean | — | Always `true` |
| `sourceType` | string | — | Always `"synthetic_academic_placeholder"` |

### Derived field in CSV (not in JSON)

| Field | Formula |
|-------|---------|
| `grossYieldPct` | `(medianMonthlyRentPerSqFt × 12 / medianCapitalValuePerSqFt) × 100` |

### Coverage

| Dimension | Values |
|-----------|--------|
| Markets | see [CANONICAL_FACTS.md](CANONICAL_FACTS.md) — derived from markets.json |
| Cities | Mumbai (3), Pune (3), Bengaluru (3), Hyderabad (3), Chennai (3), Delhi NCR (2), Ahmedabad (1) |
| Types | Commercial Office (9), Retail (4), Residential (5) |
| Gross yield range | 4.80% (Mumbai residential) to 9.14% (Hyderabad office) |
| Risk score range | 15 (Hyderabad Banjara Hills) to 40 (Delhi NCR Aerocity) |
| Capital value range | ₹5,500/sqft (Ahmedabad) to ₹22,000/sqft (Mumbai BKC) |

### Design rationale
- Capital values were set to reflect a realistic Mumbai premium over Tier-2 cities, with Ahmedabad at the lower end.
- Hyderabad HITEC City was given the highest yield and lowest risk to create an obvious "income + safety" pick under Income Focused weights, demonstrating meaningful variation in ranking across weight presets.
- Risk scores deliberately invert the expected intuition (Tier-1 = high risk because of valuation risk, not because of physical risk) to prompt discussion in viva sessions.
- `observationCount` varies (30–110) to suggest that some segments are based on smaller samples, though the application does not currently weight by observation count.

---

## 4. Data quality and validation

The `scoringEngine.js` `validateMarket()` function checks each market record at load time for:
- Presence of all required fields
- `medianCapitalValuePerSqFt` > 0 (prevents division by zero in yield formula)
- `medianMonthlyRentPerSqFt` ≥ 0
- `annualRentalGrowthRatio` in [0, 1]
- `demandScore` in [0, 100]
- `riskScore` in [0, 100]

Invalid records are excluded from ranking with a warning. Duplicate `marketId` values are flagged and the duplicate is excluded.

---

## 5. How to extend or replace with real data

To replace synthetic data with real observations:

1. Maintain the same JSON schema (all field names and types must match)
2. Set `"isSynthetic": false` and `"sourceType": "actual_transaction"` (or appropriate label)
3. Ensure `medianCapitalValuePerSqFt > 0` for all records (required by the yield formula)
4. Run `node tests/reit-tests.js` — the engine tests use their own inline data and will still pass
5. Note: the application banner ("Academic Demo — Synthetic Data Only") is hardcoded in `index.html` and should be updated for any production deployment

---

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

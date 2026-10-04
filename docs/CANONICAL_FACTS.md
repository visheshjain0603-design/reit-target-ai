# Canonical Facts

**REIT Target AI | NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**

**GENERATED FILE.** Produced by `data-pipeline/scripts/buildMeta.js`, which derives
every figure below from `public/data/`. Do not edit it by hand, and do not restate
these figures elsewhere — link to this file instead. If a number here is wrong, the
data is wrong; fix the data and regenerate.

All data in this project is synthetic. Nothing below describes a real market.

## Dataset

| Fact | Value |
|---|---|
| Market segments | 50 |
| Observation-level records | 2,156 |
| Observations per segment | 26 – 76 |
| Cities | 8 (Ahmedabad, Bengaluru, Chennai, Delhi NCR, Hyderabad, Kolkata, Mumbai, Pune) |
| Property types | 3 (Commercial Office, Residential, Retail) |
| Locality classes | 5 (Emerging, Established, Growth, Peripheral, Premium) |
| Confidence grades | B: 7, C: 20, D: 20, E: 3 |
| Segments below the 30-observation floor | 10 |
| Planted anomalies | 24 (1.113% contamination) |
| Generator version | 2.0.0 |
| Random seed | 20260919 |
| Data as of | 2026-09-19 |

## Portfolio

| Fact | Value |
|---|---|
| Holdings | 10 |
| Total value | ₹500.00 Cr |
| Annual rent | ₹33.275 Cr |
| Weighted gross yield | 6.655% |

## Application

| Fact | Value |
|---|---|
| Gemini agents | 4 (Data & Statistical Analyst; Market Screening Analyst; Portfolio Risk & Scenario Analyst; Investment Orchestrator) |
| Weight presets | 4 |
| Scoring methodology version | 1.0.0 |
| Recommendation evidence floor | at least 30 observations and confidence grade C or better |
| Assertion calls in tests/reit-tests.js | 581 |
| Distinct test identifiers (T-nnn) in tests/reit-tests.js | 68 |

## Regenerating

```bash
node data-pipeline/scripts/generateObservations.js
node data-pipeline/scripts/deriveMarkets.js
node data-pipeline/scripts/computeStatistics.js
node data-pipeline/scripts/buildMeta.js
```

The first three steps are seeded and reproduce byte-identical output; CI asserts this.
This file carries no build timestamp for the same reason.


# Final Validation Summary — 12-Stage Data Quality & Methodology Audit

**NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | Academic Demo**  
**Audit completed:** 20 September 2026  
**Auditor:** Claude (Cowork) acting on Vishesh Jain's brief

---

## Test suite result

| Metric | Value |
|--------|-------|
| Tests run | 392 |
| Tests passed | 392 |
| Tests failed | 0 |
| Command | `node tests/reit-tests.js` |
| Node version | v22.23.2 |

---

## Stage completion status

| Stage | Description | Status |
|-------|-------------|--------|
| 1 | Data audit → CURRENT_DATA_AUDIT.md | ✅ Complete |
| 2 | Standardise metadata (all 50 markets) | ✅ Complete |
| 3 | Add uncertainty ranges | ✅ Complete |
| 4 | Business reasonableness / data fixes | ✅ Complete |
| 5 | Source & assumption traceability | ✅ Complete |
| 6 | Scoring model audit → SCORING_AUDIT.md | ✅ Complete |
| 7 | 30 new tests T-100 to T-129 | ✅ Complete (373/373) |
| 8 | Ranking sensitivity → RANKING_SENSITIVITY_REPORT.md | ✅ Complete |
| 9 | UI verification (50 markets render, Data Centre) | ✅ Complete |
| 10 | UI refinements (confidence badges, uncertainty panel) | ✅ Complete |
| 11 | Documentation updates | ✅ Complete |
| 12 | Final validation | ✅ Complete |
| 13 | Evidence pipeline: dataClassification update (Derived/Estimated/Synthetic) + T-130–T-148 + EVIDENCE_UPGRADE_REPORT.md | ✅ Complete |

---

## Data quality issues resolved

| Issue | Markets affected | Resolution |
|-------|-----------------|------------|
| riskScore=0 bug (wrong pipeline key) | 32 markets (MKT-019 to MKT-050) | Corrected from pipeline `market_risk_score` metric |
| Duplicate rent/price pairs | 5 sibling groups | Differentiated ±10–20% per micro-market |
| Uniform retail yield at 12.00% | MKT-040 to MKT-045 | Rents adjusted; yields now 7.0–8.3% |
| Uniform residential yield at 4.29% | MKT-046 to MKT-050 | Rents adjusted; yields now 2.8–4.8% |
| uncertainty.rentalGrowthPct bounds in bps not % | All 50 markets | Divided lower/upper by 100 to normalise to % |
| uncertainty.demandScore non-monotone | 3 markets (MKT-004, MKT-007, MKT-010) | Upper capped at central × 1.10 |

---

## New fields added (v2.0, backward-compatible)

`confidenceGrade`, `localityClass`, `dataClassification`, `isSemiSynthetic`,
`sourceIds`, `assumptionIds`, `methodologyNote`, `comparabilityWarning`, `uncertainty`

All fields are additive. Existing scoring engine fields are unchanged.

---

## New documents produced

| Document | Location |
|----------|----------|
| CURRENT_DATA_AUDIT.md | data-pipeline/docs/ |
| SCORING_AUDIT.md | data-pipeline/docs/ |
| RANKING_SENSITIVITY_REPORT.md | data-pipeline/docs/ |
| FINAL_VALIDATION_SUMMARY.md | data-pipeline/docs/ |
| EVIDENCE_UPGRADE_REPORT.md | data-pipeline/docs/ |

---

## Known limitations (acknowledged, not blocking)

1. **Global min-max normalisation** conflates property types — documented in limitations.md §6.5  
2. **Several market clusters** share identical pipeline values (template-copy) — tie-breaks on marketId order  
3. **Uncertainty ranges** for demand and growth are illustrative (±15–25%) — see DATA_DICTIONARY.md Appendix  
4. **MKT-020 / MKT-021** still share 9.23% gross yield despite differentiated rent/price — same ratio preserved

---

*Safety rules observed: no markets removed, no Firebase/Gemini/portfolio data changed, no test expectations hardcoded, all value changes recorded with reasons.*

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026*

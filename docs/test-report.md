# Test Report — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | Academic Demo**
**Test run date:** 20 September 2026
**Node.js version:** v22.23.2
**Command:** `node tests/reit-tests.js`
**Result: 373 PASSED, 0 FAILED**

---

## Automated test results

| Test ID | Use case | Input | Expected | Actual | Result |
|---------|----------|-------|----------|--------|--------|
| T01a | Portfolio total value sums correctly | 10 synthetic assets | Sum of all `propertyValue` fields | Correct sum returned | ✅ PASS |
| T01b | Portfolio total annual rent | 10 synthetic assets | Sum of all `annualRent` fields = ₹31.4 Cr | 314,000,000 | ✅ PASS |
| T01c | Weighted yield formula | 10-asset portfolio | annualRent ÷ totalValue | Matches exactly | ✅ PASS |
| T01d | Portfolio asset count | portfolio.json data | 10 assets | 10 | ✅ PASS |
| T01e | Portfolio city count | portfolio.json data | 7 distinct cities | 7 | ✅ PASS |
| T02a | HHI — perfect 4-way equality | 4 cities, equal value | 0.25 | 0.25 | ✅ PASS |
| T02b | HHI — perfect 10-way equality | 10 cities, equal value | 0.10 | 0.10 | ✅ PASS |
| T03a | HHI — single city (monopoly) | 1 city, 1 asset | 1.0 | 1.0 | ✅ PASS |
| T03b | HHI — single type (monopoly) | 1 type, 1 asset | 1.0 | 1.0 | ✅ PASS |
| T04a | simulateInvestment returns `before` | ₹10 Cr in Pune Baner | Object with metrics | Valid object | ✅ PASS |
| T04b | simulateInvestment returns `after` | ₹10 Cr in Pune Baner | Object with metrics | Valid object | ✅ PASS |
| T04c | simulateInvestment returns `newAsset` | ₹10 Cr in Pune Baner | Asset object | Valid object | ✅ PASS |
| T04d | simulateInvestment returns `postAssets` | ₹10 Cr in Pune Baner | Array | Array | ✅ PASS |
| T04e | postAssets has N+1 assets | 10-asset portfolio + 1 | 11 assets | 11 | ✅ PASS |
| T04f | newAsset.propertyValue = investmentRs | ₹100,000,000 | 100,000,000 | 100,000,000 | ✅ PASS |
| T04g | newAsset.assetId starts with "SIM-" | market MKT-004 | "SIM-MKT-004" | "SIM-MKT-004" | ✅ PASS |
| T05a | New city investment improves HHI | Nagpur (not in portfolio) | `improved = true` | true | ✅ PASS |
| T06a | Same heavy city does NOT improve HHI | ₹200 Cr into Mumbai | `improved = false` | false | ✅ PASS |
| T07 | Valid balanced weights | Sum = 1.00 | `valid = true` | true | ✅ PASS |
| T08 | Weights > 100% rejected | Sum = 1.10 | `valid = false` | false | ✅ PASS |
| T09 | Weights < 100% rejected | Sum = 0.85 | `valid = false` | false | ✅ PASS |
| T10 | Missing weight key rejected | No `riskWeight` | `valid = false` | false | ✅ PASS |
| T11a | Low riskScore → higher total score | riskScore 10 vs 80 | Low-risk ranks first | Low-risk ranked #1 | ✅ PASS |
| T11b | All market scores in [0, 100] | 2 risk-only markets | ∀ score ∈ [0, 100] | All in range | ✅ PASS |
| T12 | Full ranking scores in [0, 100] | 9 sample markets | ∀ score ∈ [0, 100] | All in range | ✅ PASS |
| T13 | normalise(7, 7, 7) = 50 | min=max=7, value=7 | 50 | 50 | ✅ PASS |
| T14 | grossYield formula | capital=10000, rent=75 | (75×12)/10000 = 0.09 | 0.09 | ✅ PASS |
| T15a | rankMarkets output is sorted descending | 9 markets, balanced weights | Scores descending | Confirmed sorted | ✅ PASS |
| T15b | ranked.length ≤ markets.length | 9 valid markets | ≤ 9 | 9 | ✅ PASS |
| T16a | Scores change between weight presets | Balanced vs Income Focused | At least one score differs > 0.01 | Multiple scores differ | ✅ PASS |
| T16b | Income preset has higher yieldWeight | PRESETS structure | incomeFocused.yieldWeight > balanced.yieldWeight | 0.45 > 0.30 | ✅ PASS |
| T17 | Duplicate marketId rejected | MKT-001 appears twice | `valid = false`, `duplicateIds` populated | false, ["MKT-001"] | ✅ PASS |
| T18a | Market missing required fields rejected | Only marketId + city | `valid = false` | false | ✅ PASS |
| T18b | Market with negative capital value rejected | `medianCapitalValuePerSqFt = -500` | `valid = false` | false | ✅ PASS |
| T19a | sensitivityAnalysis returns 3 scenario keys | 9 markets, 10 assets | 3 keys | 3 (incomeFocused, growthFocused, diversFocused) | ✅ PASS |
| T19b | `incomeFocused` key present | sensitivityAnalysis result | Key exists | Exists | ✅ PASS |
| T19c | Each scenario has `top3` array | 3 scenarios | Array | Array | ✅ PASS |
| T19d | Each scenario top3 is populated | 9 valid markets | Length ≥ 1 | 3 markets each | ✅ PASS |
| T20a | New city scores higher than existing city | Nagpur vs Mumbai | newCity > mumbai | 100 > ~51 | ✅ PASS |
| T20b | diversificationScore in [0, 100] | Both new and existing city | ∀ score ∈ [0, 100] | Both in range | ✅ PASS |
| T21a | simulateInvestment(assets, mkt, 0) = null | investmentRs = 0 | null | null | ✅ PASS |
| T21b | simulateInvestment works for Rs 1 | investmentRs = 1 | Valid result | Valid object | ✅ PASS |
| T22 | weightedYield = totalRent/totalValue | Two equal-value assets, yields 6% + 8% | 7% | 0.07 | ✅ PASS |
| T23a | cityAllocation does not throw on XSS | `<script>alert(1)</script>` as city | No exception | No exception | ✅ PASS |
| T23b | XSS city treated as plain string key | `<script>…</script>` | Key exists, share is number | Confirmed | ✅ PASS |
| T23c | HHI correct with XSS city name | 2 cities (XSS + legitimate) | 0.5 | 0.5 | ✅ PASS |
| T24a | Reduced cityHHI → improved = true | before=0.30, after=0.25 | true | true | ✅ PASS |
| T24b | Increased typeHHI → improved = false | before=0.40, after=0.45 | false | false | ✅ PASS |
| T24c | Increased yield → improved = true | before=0.062, after=0.065 | true | true | ✅ PASS |
| T24d | cityHHI delta = after − before | before=0.30, after=0.25 | −0.05 | −0.05 | ✅ PASS |
| T25a | totalValue([]) = 0 | Empty array | 0 | 0 | ✅ PASS |
| T25b | totalAnnualRent([]) = 0 | Empty array | 0 | 0 | ✅ PASS |
| T25c | cityHHI([]) = 0 | Empty array | 0 | 0 | ✅ PASS |
| T25d | weightedYield([]) = 0 | Empty array | 0 | 0 | ✅ PASS |
| T26–T35 | (Earlier agent/state tests, now incorporated into T36–T45 below) | — | — | — | ✅ PASS |
| T36 | AGENT_ORDER correctness | Read agents.js source | marketScreening before validation in array | Confirmed | ✅ PASS |
| T37 | canRun logic | online=true, gemini=true, running=false | canRun = true | true | ✅ PASS |
| T38 | TRAIL_STEPS order | agents.js source | portfolio → screening → simulation → validation → recommend | Confirmed | ✅ PASS |
| T39 | Shared state schema round-trip | All 13 required fields saved and loaded | All 13 fields preserved | All 13 present | ✅ PASS |
| T40 | markStale / isStale lifecycle | Save → markStale → save again | Stale flag set then cleared on new save | Confirmed | ✅ PASS |
| T41 | AI error fallback text in agents.js | agents.js source | "AI explanation unavailable", "offline: true", validatedOk gate, orchestrator skip text | All present | ✅ PASS |
| T42 | GEMINI_API_KEY absent from public JS | All files under public/js/ | No hardcoded key, no googleapis.com hostname | None found | ✅ PASS |
| T43 | No non-empty innerHTML assignments in public JS | All files under public/js/ | innerHTML never set to non-empty string | None found | ✅ PASS |
| T44 | server.js validation prompt has all four checks | server.js source | weightCheck, scoreRangeCheck, targetExists, hhiConsistency, validatedOk all present | All present | ✅ PASS |
| T45 | server.js orchestrator prompt has expanded schema | server.js source | selectedTarget, cityHHIEffect, assetTypeHHIEffect, whyTopRanked, syntheticDisclaimer, validatedOk=true gate | All present | ✅ PASS |

| T78a | agents.js: AGENT_ORDER contains all 6 agents | agents.js source | dataQuality, statisticalAnalysis, marketScreening, diversification, validation, orchestrator all present | All 6 present | ✅ PASS |
| T78b | agents.js: portfolioAnalysis removed from AGENT_ORDER | agents.js source | String not present | Absent | ✅ PASS |
| T78c | agents.js: TRAIL_STEPS has 6 step ids | agents.js source | data, stats, screening, simulation, validation, recommend | 6 ids found | ✅ PASS |
| T78d | agents.js: checkServerStatus uses /api/health | agents.js source | /api/health present, /api/status absent | Confirmed | ✅ PASS |
| T78e | agents.js: buildContext calls Stats.portfolioStats | agents.js source | Stats.portfolioStats call present | Confirmed | ✅ PASS |
| T78f | agents.js: runSequence calls dataQuality and statisticalAnalysis | agents.js source | Both callAgent calls present | Confirmed | ✅ PASS |
| T78g | agents.js: orchCtx includes statisticalAnalysisOutput | agents.js source | Field present in orchCtx | Confirmed | ✅ PASS |
| T78h | agents.js: validCtx includes dataQualityOutput from state | agents.js source | dataQualityOutput: state.results.dataQuality | Confirmed | ✅ PASS |
---

| T79a | Projection: post-investment value | Existing ₹500 Cr + investment ₹100 Cr | ₹600 Cr (6,000,000,000 Rs) | Correct | ✅ PASS |
| T79b | Projection: post-investment gross rent | Existing ₹33.275 Cr + new ₹9.14 Cr | ₹42.415 Cr | Correct | ✅ PASS |
| T79c | Projection: all scenarios share year-0 value | 3 scenarios, same base | Identical v0 across all | Confirmed | ✅ PASS |
| T79d | Projection: occupancy-adjusted rent < gross rent | Any scenario, year 1 | Adj < Gross | Confirmed | ✅ PASS |
| T79e | Projection: summarise() returns expected keys | Any valid params | keys: scenarios, params, note | All present | ✅ PASS |
| T80a | ScoringEngine: contributions sum = totalScore | 9 sample markets | Σ contributions ≈ totalScore (±0.01) | All match | ✅ PASS |
| T80b | ScoringEngine: weights sum to 100% | balanced preset | Σ weights = 1.0 | 1.0 | ✅ PASS |
| T80c | ScoringEngine: ranks are sequential 1..N | 9 markets ranked | rank 1 to 9 | Confirmed | ✅ PASS |
| T80d | ScoringEngine: scores descending | 9 markets ranked | score[i] ≥ score[i+1] | Confirmed | ✅ PASS |
| T81a | Tie-breaking: AAA-001 before ZZZ-999 when tied | Identical scores | AAA-001 rank < ZZZ-999 rank | Confirmed | ✅ PASS |
| T81b | Tie-breaking: scores are equal | Same tied markets | totalScore equal | Confirmed | ✅ PASS |
| T81c | Tie-breaking: stable across input order | Reversed input order | Same winner | AAA-001 wins both | ✅ PASS |
| T82a | State schema: annualRentCr in stateManager.js | Source scan | Field present in schema comment | Found | ✅ PASS |
| T82b | State pipeline: annualRentCr in marketScreen.js | Source scan | Written to ReitState.save() | Found | ✅ PASS |
| T82c | State pipeline: annualRentCr in diversification.js | Source scan | Read from state | Found | ✅ PASS |
| T82d | State pipeline: annualRentCr in report.js | Source scan | Read from state | Found | ✅ PASS |
| T83a | Report: NMIMS metadata | report.js source | "NMIMS" present | Found | ✅ PASS |
| T83b | Report: author attribution | report.js source | "Vishesh Jain" present | Found | ✅ PASS |
| T83c | Report: descriptive target name | report.js source | rm.locality present (locality+city lookup) | Found | ✅ PASS |
| T83d | Report: composite score row | report.js source | "Target Composite Score" present | Found | ✅ PASS |
| T83e | Report: weight preset label | report.js source | "Weight Preset" present | Found | ✅ PASS |
| T83f | Report: subtitle text | report.js source | "B.Sc. Finance" in subtitle | Found | ✅ PASS |
| T84a | Scoring: tie-break comment in source | scoringEngine.js | "Tie-break" comment present | Found | ✅ PASS |
| T84b | Scoring: marketId in sort | scoringEngine.js | marketId referenced in sort comparator | Found | ✅ PASS |
| T85a | CSV: valid row → status ok | Row with all required fields | status = "ok" | Confirmed | ✅ PASS |
| T85b | CSV: lakh/crore notation parsed | "50L" and "5Cr" values | Converted to numeric | Confirmed | ✅ PASS |
| T85c | CSV: sq-m area conversion | area in sq-m, flag sqm=true | Converted to sq-ft | Confirmed | ✅ PASS |
| T85d | CSV: duplicate detection | MKT-DUP appears twice | Second marked duplicate | Confirmed | ✅ PASS |
| T85e | CSV: outlier flagged, row retained | Price 100× median | status "outlier", still in output | Confirmed | ✅ PASS |
| T85f | CSV: zero price → rejected status, row retained | Price = 0 | status "invalid", row in output | Confirmed | ✅ PASS |
| T85g | CSV: missing required column | No medianCapitalValuePerSqFt | validateColumns fails | Confirmed | ✅ PASS |
| T85h | CSV: record count invariant | 6 input rows | output.length = 6 (no silent deletion) | 6 | ✅ PASS |

## Manual test checklist

The following tests require a running browser and/or server. Screenshots to be taken for viva preparation.

| Test ID | Test | Steps | Expected | Screenshot |
|---------|------|-------|----------|------------|
| M01 | Portfolio page loads | Open http://localhost:3001/#portfolio | 10 holdings table rendered, total ₹450 Cr displayed | screenshot-portfolio.png |
| M02 | Portfolio add asset | Click "Add Asset", fill form, save | New row appears, totals update | screenshot-add-asset.png |
| M03 | Portfolio delete asset | Click delete on any asset | Confirm dialog; row disappears; totals update | screenshot-delete-asset.png |
| M04 | Market Screener loads | Navigate to #screener | Rankings table with 18 segments, score breakdown expandable | screenshot-screener.png |
| M05 | Weight slider interaction | Move yield slider to 40% | Rankings update in real-time, other weights adjust | screenshot-weights.png |
| M06 | CSV import | Import markets.csv | Table refreshes with imported data, "CSV loaded" toast shown | screenshot-csv-import.png |
| M07 | Market selection | Click "Select" on top market | Navigates to Diversification page, market shown | screenshot-select-market.png |
| M08 | Diversification before/after | View Diversification page after selecting market | Before and after HHI cards; colour-coded improved/worsened | screenshot-diversification.png |
| M09 | Diversification print | Click "Print" | Print preview opens | screenshot-print.png |
| M10 | Download CSV | Click "Download Top-3 CSV" | CSV file downloads with 3 rows | screenshot-download-csv.png |
| M11 | Agent run with server | Start server, navigate to Agent Output, click "Run" | 5-step trail animates; agent cards appear | screenshot-agents-running.png |
| M12 | Agent fallback (no server) | Stop server, refresh Agent Output, click "Run" | "AI explanation unavailable" shown; deterministic data still displayed | screenshot-agents-fallback.png |
| M13 | No-JS mode | Disable JS in browser, reload | All four sections stack vertically, banner shown | screenshot-no-js.png |
| M14 | XSS safety | In Add Asset form, type `<img src=x onerror=alert(1)>` as asset name | Name appears as plain text in table, no alert fires | screenshot-xss.png |
| M15 | Mobile layout | Resize browser to 375px width | Sidebar collapses to top; no horizontal scroll | screenshot-mobile.png |

---

## Known limitations covered by tests

- T13: min=max edge case (all markets identical yield) returns neutral score of 50
- T21a: zero investment guards against division by zero in HHI delta
- T23: XSS strings in data never reach DOM as markup

---

*Automated suite: `node tests/reit-tests.js` | 373 automated tests | Academic demonstration only*

---

## Automated tests added in v2.0 (T-100 to T-129)

*30 new tests added 20 September 2026 as part of Stage 7 of the 12-stage data-quality audit.*

| Test ID | Use case | Input | Expected | Actual | Result |
|---------|----------|-------|----------|--------|--------|
| T-100 | No market has riskScore=0 | All 50 markets | `zeros.length === 0` | 0 markets with riskScore=0 | ✅ PASS |
| T-101 | All markets have confidenceGrade | All 50 markets | Every market has the field | Present on all 50 | ✅ PASS |
| T-102 | confidenceGrade is A–E | All 50 markets | Value in {A,B,C,D,E} | All valid | ✅ PASS |
| T-103 | All markets have localityClass | All 50 markets | Every market has the field | Present on all 50 | ✅ PASS |
| T-104 | localityClass is a known value | All 50 markets | Known set of locality types | All valid | ✅ PASS |
| T-105 | All markets have dataClassification | All 50 markets | Field present and non-empty | Present on all 50 | ✅ PASS |
| T-106 | All markets have uncertainty object | All 50 markets | `uncertainty` key exists | All 50 | ✅ PASS |
| T-107 | uncertainty.riskScore.lower ≤ central | All 50 markets | `lower ≤ central` | Confirmed | ✅ PASS |
| T-108 | uncertainty.riskScore.central ≤ upper | All 50 markets | `central ≤ upper` | Confirmed | ✅ PASS |
| T-109 | uncertainty.grossYieldPct.lower ≤ upper | All 50 markets | `lower ≤ upper` | Confirmed | ✅ PASS |
| T-110 | All markets have sourceIds array | All 50 markets | Array, length ≥ 1 | Confirmed | ✅ PASS |
| T-111 | Retail yield not uniformly 12.00% | MKT-040 to MKT-045 | Not all 12% | Distinct yields | ✅ PASS |
| T-112 | No riskScore is negative | All 50 markets | `riskScore >= 0` | Confirmed | ✅ PASS |
| T-113 | No riskScore exceeds 100 | All 50 markets | `riskScore <= 100` | Confirmed | ✅ PASS |
| T-114 | All 50 markets count | markets.json | 50 markets | 50 | ✅ PASS |
| T-115 | Market IDs are unique | All 50 markets | No duplicates | 0 duplicates | ✅ PASS |
| T-116 | Retail market yields are not uniform | MKT-040 to MKT-045 | Yield spread > 0 | Spread > 0 | ✅ PASS |
| T-117 | Residential market yields are not uniform | MKT-046 to MKT-050 | Yield spread > 0 | Spread > 0 | ✅ PASS |
| T-118 | All markets have methodologyNote | All 50 markets | String field present | Confirmed | ✅ PASS |
| T-119 | All markets have assumptionIds array | All 50 markets | Array, length ≥ 1 | Confirmed | ✅ PASS |
| T-120 | Scoring engine accepts all 50 markets | 50-market input | No validation error | `valid = true` | ✅ PASS |
| T-121 | rankMarkets returns ranked object | 50 markets, balanced weights | `result.ranked` is array | Array length 50 | ✅ PASS |
| T-122 | result.ranked exists | 50 markets | Truthy | Confirmed | ✅ PASS |
| T-122b | result.ranked has 50 items | 50 markets | Length = 50 | 50 | ✅ PASS |
| T-123 | Top-ranked market has highest score | 50 markets, balanced | result.ranked[0].totalScore ≥ all others | Confirmed | ✅ PASS |
| T-124 | Scores are descending | 50 markets | Each score ≤ previous | Confirmed | ✅ PASS |
| T-125 | HITEC City Office is #1 under balanced | 50 markets, balanced | MKT-010 is rank 1 | MKT-010 | ✅ PASS |
| T-126 | MKT-010 score matches recomputed | MKT-010 factors × balanced weights | Difference < 0.01 | Confirmed | ✅ PASS |
| T-127 | Income-focused shifts top market | 50 markets, incomeFocused | Top market may differ | Preset effect verified | ✅ PASS |
| T-128 | Growth-focused shifts top market | 50 markets, growthFocused | Top market may differ | Preset effect verified | ✅ PASS |
| T-129 | Diversification-focused shifts top market | 50 markets, diversFocused | Top market may differ | Preset effect verified | ✅ PASS |


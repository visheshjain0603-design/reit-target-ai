# Project Report — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4: Building Agents and Artifacts using Generative AI**

**Student:** KJ | **Submission date:** 25 September 2026 | **Academic demonstration only**

---

## Executive Summary

REIT Target AI is a browser-based decision-support tool that combines deterministic financial analytics with a multi-agent Gemini AI pipeline to assist in evaluating Indian real estate investment trust (REIT) portfolio decisions. The tool analyses a synthetic 10-asset REIT portfolio, screens 18 synthetic market segments across 7 Indian cities, computes diversification impact using the Herfindahl-Hirschman Index (HHI), and produces a structured AI-generated investment recommendation.

The core design principle is a strict separation between calculation and interpretation: all numerical results are produced by deterministic JavaScript engines, and the Gemini agents provide only natural-language commentary on those pre-calculated values. This ensures the AI output is verifiable, reproducible (for deterministic results), and never substitutes its own arithmetic for the application's.

All data is entirely synthetic. The tool is intended solely as an academic demonstration of how LLM agents can be embedded in a structured analytical workflow, not as a financial advisory product.

---

## 1. Introduction

### 1.1 Background

Real estate investment analysis involves balancing multiple competing factors: income yield, capital growth, portfolio diversification, demand signals, and risk. Traditional spreadsheet models handle these quantitatively but generate little natural-language explanation. Large language models (LLMs) can generate explanation and narrative but cannot reliably perform precise arithmetic on structured data. The research question driving this project was:

> *How can deterministic financial models and LLM agents be combined so that each does what it is best at — the model calculates, the agent explains?*

### 1.2 Project scope

The project delivers a single-page web application with four analytical pages:

| Page | Function |
|------|----------|
| Portfolio Analysis | Summary of current holdings: concentration, yield, lease risk |
| Market Screener | Multi-factor ranking of 18 synthetic market segments |
| Diversification | Before/after HHI analysis when a new market is added |
| Agent Recommendations | Five chained Gemini agents produce a structured recommendation |

### 1.3 Technology choices

The application uses vanilla JavaScript (no framework, no build step) so the entire codebase is readable and assessable without tooling knowledge. Node.js is used only for a lightweight proxy server that holds the Gemini API key server-side; the proxy itself has zero npm dependencies. This choice reflects the academic constraint of being able to run the application with a single command and inspect every line of code.

---

## 2. Problem Statement

A REIT fund manager considering new acquisitions faces three analytical challenges:

**Challenge 1 — Portfolio concentration.** If the existing portfolio is concentrated in one city or asset type, new acquisitions in the same segment add risk rather than diversification. The manager needs a quantitative measure of concentration and a way to see how a proposed investment would change it.

**Challenge 2 — Market selection.** With dozens of micro-markets available and competing priorities (income vs. growth vs. safety), ranking markets objectively requires a multi-factor scoring model with adjustable weights.

**Challenge 3 — Interpretation.** Raw numerical outputs (HHI = 0.2345, yield = 7.4%) are meaningful to a finance specialist but not to all stakeholders. An AI layer that explains the significance of these numbers in plain language — while being transparently grounded in the numbers rather than generating its own — would increase the tool's practical utility.

---

## 3. Methodology

### 3.1 Financial model design

#### 3.1.1 Gross yield

```
grossYield = (medianMonthlyRentPerSqFt × 12) / medianCapitalValuePerSqFt
```

Unit prices per square foot are used rather than total transaction prices, enabling comparison across markets regardless of property size.

#### 3.1.2 Multi-factor scoring

Each market is scored on five normalised factors:

| Factor | Source field | Direction |
|--------|-------------|-----------|
| Yield score | `grossYield` | Higher = better |
| Growth score | `annualRentalGrowthRatio` | Higher = better |
| Diversification score | HHI delta when added | Higher improvement = better |
| Demand score | `demandScore` | Higher = better |
| Low-risk score | `100 − riskScore` | Lower `riskScore` = better |

All five factors are min-max normalised to [0, 100]:

```
normalisedScore = (value − min) / (max − min) × 100
```

When all markets share the same value for a factor (max − min = 0), the normalisation returns 50 (neutral midpoint) to avoid division by zero.

The composite score is a weighted sum:

```
compositeScore = Σ (factorScore_i × weight_i)
```

where the five weights sum to 100%. Three non-balanced weight presets (Income Focused, Growth Focused, Diversification Focused) allow sensitivity analysis.

#### 3.1.3 Risk inversion

The `riskScore` field (0–100, higher = riskier) is inverted before normalisation:

```
lowRiskScore = 100 − riskScore
```

This ensures the scoring engine consistently treats higher normalised scores as "better" across all five factors, simplifying the ranking logic.

#### 3.1.4 Herfindahl-Hirschman Index (HHI)

Portfolio concentration is measured separately for city allocation and asset-type allocation using the HHI formula:

```
HHI = Σ (shareᵢ)²
```

where `shareᵢ` is each segment's share of total portfolio value. HHI ranges from near 0 (perfect diversification) to 1.0 (monopoly/full concentration).

Thresholds used in this application:

| HHI range | Interpretation |
|-----------|---------------|
| < 0.15 | Diversified |
| 0.15 – 0.25 | Moderate |
| > 0.25 | Concentrated |

The diversification impact of a proposed investment is measured as the change in HHI before and after adding the simulated investment to the portfolio.

### 3.2 AI architecture

#### 3.2.1 Design principle

> **Gemini interprets; JavaScript calculates.**

All numerical values are computed before any API call is made. Gemini receives a structured JSON context containing the pre-calculated results and is instructed to provide natural-language interpretation only.

#### 3.2.2 Agent chain

The application uses five Gemini agents in sequential order:

```
Portfolio Analysis Agent
        ↓
Validation Agent
        ↓
Market Screening Agent
        ↓
Diversification Agent
        ↓
Investment Orchestrator
```

Each agent receives the prior agents' outputs as additional context. The Orchestrator synthesises all four preceding analyses into a final recommendation.

#### 3.2.3 Prompt design

Each agent's system prompt follows a four-part pattern:

1. **Role definition** — scopes the agent to a specific task
2. **Constraints** — numbered rules preventing hallucination, recalculation, and financial advice framing
3. **HHI thresholds** (Diversification Agent only) — explicit thresholds prevent Gemini from using its own
4. **Output schema** — enforces structured JSON; combined with `responseMimeType: "application/json"` to avoid markdown-wrapped responses

Temperature is set to 0.2 — near-deterministic but allowing natural variation in phrasing.

#### 3.2.4 Graceful degradation

If the Gemini API is unavailable, all deterministic results remain visible. The Agent Recommendations page displays "AI explanation unavailable" rather than inserting prewritten text as synthetic AI output. This was a deliberate design choice to maintain academic honesty.

---

## 4. Results

*Note: All results below are from the synthetic dataset and serve only to demonstrate the tool's analytical capability.*

### 4.1 Portfolio analysis

The synthetic 10-asset portfolio has:
- Total value: ₹450 Cr (4,500,000,000 Rs)
- Gross portfolio yield: ~6.98%
- City HHI: ~0.15–0.20 (moderate concentration toward Mumbai and Bengaluru)
- Asset type HHI: ~0.35 (concentrated in Commercial Office)
- Three assets with leases expiring within 24 months

The Portfolio Analysis Agent correctly identifies the Commercial Office concentration as the primary diversification risk and the three near-term lease expirations as a cash-flow risk.

### 4.2 Market screening

Under balanced weights (Yield 25%, Growth 25%, Diversification 20%, Demand 20%, Risk 10%), the top-ranked market is Hyderabad HITEC City (Commercial Office), which scores highly because:
- Gross yield: ~9.1% (highest in dataset)
- Low risk score: 85 (riskScore = 15, lowest in dataset)
- Adds to a city and type not heavily represented in the existing portfolio

Under Income Focused weights (Yield 50%, Growth 10%, Diversification 20%, Demand 10%, Risk 10%), Hyderabad maintains the top rank, confirming its dominance on the income dimension.

Under Growth Focused weights (Yield 10%, Growth 40%, Diversification 20%, Demand 20%, Risk 10%), the ranking shifts, demonstrating that the tool produces meaningfully different recommendations under different investor priorities — a core requirement for the sensitivity analysis to be informative.

### 4.3 Diversification analysis

Simulating a ₹50 Cr investment in Hyderabad HITEC City:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| City HHI | ~0.175 | ~0.163 | Improved |
| Type HHI | ~0.360 | ~0.342 | Improved |
| Portfolio yield | ~6.98% | ~7.10% | Improved |

The HHI decreases in both dimensions, confirming that this addition improves portfolio diversification. The Diversification Agent correctly labels the before state as "moderate" concentration and the after state as "moderate (improving)."

### 4.4 Agent output

The Investment Orchestrator synthesises the four agent outputs to recommend Hyderabad HITEC City as the target market, citing:
- Highest income yield
- Lowest risk score
- Positive diversification impact across both city and type dimensions
- Strong demand fundamentals

The Orchestrator also lists key risks: synthetic data limitations, no liquidity premium, no transaction costs, and the disclaimer that this is not real investment advice.

---

## 5. Discussion

### 5.1 What worked well

**Separation of calculation and interpretation.** During development, early prompt iterations saw Gemini recalculating HHI values and producing slightly different results. Adding the explicit rule "Do NOT recalculate values — comment on the pre-calculated ones" plus the label "pre-calculated by deterministic JS engine" in the user prompt resolved this immediately. The principle of treating LLM agents as interpreters rather than calculators proved essential for numerical reliability.

**Pure function design for analytics engines.** Writing `hhi.js` and `scoringEngine.js` as pure functions with no DOM or network dependencies made testing trivial and debugging fast. All 54 automated tests run in under one second and cover edge cases that would have been difficult to test in an integrated browser environment.

**Test-driven debugging.** Writing tests concurrently with the engines (rather than after) surfaced three design questions that had to be resolved explicitly: what to return when `investmentRs = 0`, whether `diversificationScore` takes a city string or a market object, and how many presets `sensitivityAnalysis` returns. Resolving these during testing produced cleaner, more predictable APIs.

### 5.2 What was challenging

**SafariWebKit curly-quote rejection.** A text editor auto-corrected straight quotes to Unicode typographic quotes (U+201C, U+201D) in one file. Safari's JSCore engine throws a SyntaxError on these characters in string literals, while Chrome's V8 accepts them silently. This caused the Portfolio Analysis page to be blank only in Safari. The fix (replacing with single-quoted string delimiters) was simple once the cause was identified.

**Gemini JSON output consistency.** Early API calls occasionally returned JSON wrapped in markdown code fences (` ```json ... ``` `), despite the structured prompt. Adding `responseMimeType: "application/json"` resolved this, but a fallback strip was retained for resilience against future model version changes.

**Sequential agent latency.** Running five agents sequentially produces total latency of 10–30 seconds. For an academic demo with an evaluator present, this is acceptable. A production system would use parallel calls with a fan-out/fan-in pattern.

### 5.3 Limitations

See `docs/limitations.md` for a full catalogue. The most material limitation is the use of entirely synthetic data, which means the rankings and recommendations are illustrative rather than actionable. The financial model also uses gross yield only, with no accounting for NOI costs, leverage, or liquidity premium.

---

## 6. Conclusions

REIT Target AI demonstrates that a clean separation between deterministic calculation and LLM interpretation is achievable in a small, dependency-free web application. The key design insight — treating Gemini as an interpreter of pre-calculated results rather than as a calculator — produced more reliable, verifiable, and academically honest outputs than an approach that would have delegated arithmetic to the LLM.

The automated test suite (54 assertions, zero external dependencies) validates the core engine behaviour independently of the browser or the Gemini API, providing a reproducible foundation for the evaluator to inspect.

The project meets Theme 4's stated learning objective: "Building Agents and Artifacts using Generative AI" — specifically by demonstrating how a multi-agent LLM pipeline can be embedded in a structured analytical workflow while preserving numerical integrity through deterministic computation.

---

## References

All references below are to primary sources used for methodology design. No proprietary or confidential data was accessed.

1. SEBI (Real Estate Investment Trusts) Regulations, 2014. Securities and Exchange Board of India. [Methodology context only; this tool does not purport to comply with these regulations.]
2. Herfindahl, O.C. (1950). *Concentration in the U.S. Steel Industry*. Doctoral dissertation, Columbia University. [Original source of HHI formula.]
3. US Department of Justice & Federal Trade Commission (2010). *Horizontal Merger Guidelines*. [Standard HHI threshold reference; thresholds adapted for real estate portfolio context.]
4. Google AI (2024). *Gemini API Documentation: generateContent*. [API design reference.]
5. Anthropic (2024). *Claude claude-sonnet-4-6 Technical Report*. [AI development tool used.]

---

*This report is an academic draft prepared for NMIMS B.Sc. Finance Business Analytics assessment. All financial analysis is based on synthetic data and does not constitute investment advice.*

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026*

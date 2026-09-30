# Viva Guide — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4 | Academic Demo**

Quick-reference formula sheet and anticipated evaluator Q&A.

---

## Part A — Formula Reference

### A1. Herfindahl-Hirschman Index (HHI)

```
HHI = Σ (shareᵢ)²
```

where `shareᵢ = (value of segment i) / (total portfolio value)`

**Range:** 0 (perfect diversification) → 1.0 (full concentration)

**Thresholds used in this application:**

| HHI | Label |
|-----|-------|
| < 0.15 | Diversified |
| 0.15 – 0.25 | Moderate |
| > 0.25 | Concentrated |

**Example — 4-way equal split:**  
shareᵢ = 0.25 for each → HHI = 4 × (0.25)² = **0.25**

**Example — monopoly:**  
One segment = 100% → HHI = 1.0²= **1.0**

---

### A2. Gross yield

```
grossYield = (medianMonthlyRentPerSqFt × 12) / medianCapitalValuePerSqFt
```

Per square foot units allow cross-market comparison regardless of property size.

**Example:** rent = ₹65/sqft/month, capital value = ₹8,000/sqft
```
grossYield = (65 × 12) / 8,000 = 780 / 8,000 = 9.75%
```

---

### A3. Min-max normalisation

```
normalisedScore = (value − min) / (max − min) × 100
```

**Edge case (min = max):** Returns 50 — neutral midpoint, never NaN.

All five scoring factors are normalised to [0, 100] before weighting.

---

### A4. Risk inversion

```
lowRiskScore = 100 − riskScore
```

`riskScore` (0–100) encodes higher values as riskier. Inverting it means higher scores are universally "better" across all five factors, simplifying the ranking logic.

---

### A5. Composite market score

```
compositeScore = (yieldScore × yieldWeight)
               + (growthScore × growthWeight)
               + (diversScore × diversWeight)
               + (demandScore × demandWeight)
               + (lowRiskScore × riskWeight)
```

Constraint: `yieldWeight + growthWeight + diversWeight + demandWeight + riskWeight = 1.0`

---

### A6. Diversification score (per market)

Used as one input factor in composite scoring. Measures how much HHI would improve (lower) if this market were added to the portfolio.

```
cityBenefit = max(0, currentCityHHI − newCityHHI)
typeBenefit = max(0, currentTypeHHI − newTypeHHI)
diversificationScore = (cityBenefit + typeBenefit) / 2
```

Markets in a new city or new asset type score higher than markets already heavily represented.

---

### A7. Weighted portfolio yield

```
weightedYield = Σ (annualRent_i / totalAnnualRent) × (annualRent_i / propertyValue_i)
```

Each asset's weight is its share of total annual rent; its yield is annual rent divided by property value.

---

## Part B — Architecture Quick-Reference

```
Browser
  ├── hhi.js                   ← HHI formula, simulateInvestment, diversificationScore
  ├── scoringEngine.js          ← normalise, rankMarkets, sensitivityAnalysis
  ├── portfolio.js              ← Portfolio Analysis page
  ├── marketScreen.js           ← Market Screener page
  ├── diversification.js        ← Diversification page
  └── agents.js                 ← Agent Recommendations page (calls proxy)
         ↓ fetch /api/gemini
  Node.js proxy (server.js)
         ↓ HTTPS
  Google Gemini API
```

**Why a proxy?** The Gemini API key must never appear in frontend code. The proxy holds the key in `server/.env`, which is excluded from git by `.gitignore`.

---

## Part C — Anticipated Evaluator Questions

### C1. General / system design

**Q: What does this application actually do?**

It helps a REIT fund manager evaluate which new market to invest in. It analyses the existing portfolio's concentration, scores 18 synthetic market segments on five factors (yield, growth, diversification, demand, risk), shows how a proposed investment would change portfolio HHI, and uses five chained Gemini AI agents to generate a structured natural-language recommendation.

---

**Q: Why did you use vanilla JavaScript instead of React or Vue?**

Three reasons: (1) No build step means the code is readable and runnable without tooling knowledge, which is important for academic assessment. (2) The application's UI state is simple enough that a framework adds more complexity than it removes. (3) Demonstrating that multi-agent AI integration works without a heavy front-end stack is itself part of the academic contribution.

---

**Q: What is the role of Node.js in this project?**

Solely to act as a proxy between the browser and the Gemini API. The proxy holds the API key server-side (in `server/.env`, excluded from git). It has zero npm dependencies — only Node.js built-in modules (`http`, `https`, `fs`, `path`, `url`) — so it requires no `npm install` and introduces no supply-chain risk.

---

**Q: Why does the application need a local server? Can't it run as a file?**

The browser's `fetch()` API cannot load local JSON files via `file://` URLs due to CORS restrictions. A local HTTP server (even one line of Python: `python3 -m http.server 3000`) satisfies this requirement. The Node.js proxy doubles as this file server.

---

### C2. Financial model

**Q: What is the HHI and how do you use it?**

The Herfindahl-Hirschman Index measures portfolio concentration. It equals the sum of squared market shares: Σ(shareᵢ)². A value of 1.0 means one segment holds the entire portfolio; a value near 0 means perfectly even distribution. We compute it separately for city allocation and asset-type allocation. The Diversification page shows the before/after HHI when a simulated investment is added, so the user can see concretely whether the proposed acquisition improves or worsens portfolio concentration.

---

**Q: What thresholds do you use for HHI and why?**

We use < 0.15 = diversified, 0.15–0.25 = moderate, > 0.25 = concentrated. These are adapted from the US Department of Justice Horizontal Merger Guidelines (which use different absolute thresholds for market power analysis, but the same conceptual framework). For a property portfolio context, these thresholds produce intuitive results: a 4-way equal city split gives HHI = 0.25 (just at the moderate boundary), and the existing synthetic portfolio's city HHI of ~0.175 correctly reads as "moderate."

---

**Q: Why do you use gross yield instead of net yield or cap rate?**

Because the synthetic data does not include operating costs (management fees, maintenance, insurance, vacancy). Gross yield (annual rent ÷ capital value) is the only reliable metric calculable from the available data. In a real underwriting model you would compute Net Operating Income (NOI = gross rent − operating costs) and then cap rate (NOI ÷ capital value). The Limitations document explicitly acknowledges this gap.

---

**Q: What does the risk inversion do?**

The `riskScore` field uses 0 = safest, 100 = riskiest (higher = worse). To keep the scoring engine consistent — so that higher normalised scores always mean "better" — we invert it: `lowRiskScore = 100 − riskScore`. A market with riskScore = 15 gets lowRiskScore = 85 (high, meaning good). This is documented in the code and in `docs/data-documentation.md`.

---

**Q: What happens when two markets have the same score for a factor?**

The normalisation function receives min = max. Rather than dividing by zero and returning NaN, it returns 50 — the neutral midpoint. Test T13 covers this case explicitly: `normalise(7, 7, 7) === 50`.

---

**Q: What are the five weight presets?**

| Preset | Yield | Growth | Diversification | Demand | Risk |
|--------|-------|--------|-----------------|--------|------|
| Balanced | 25% | 25% | 20% | 20% | 10% |
| Income Focused | 45% | 10% | 15% | 20% | 10% |
| Growth Focused | 10% | 40% | 20% | 20% | 10% |
| Diversification Focused | 15% | 15% | 45% | 15% | 10% |

The weight sliders redistribute remaining weight proportionally when one slider moves, always maintaining a 100% sum.

---

### C3. AI / Gemini agents

**Q: What do the Gemini agents actually do? Do they calculate anything?**

No — they are explicitly prohibited from calculating. Every number in the agents' input context was computed by `hhi.js` and `scoringEngine.js` before the API call. Gemini receives a structured JSON context and generates natural-language interpretation: explaining which concentration risks exist, why certain markets scored highly, what the HHI change means, and synthesising a recommendation. The user prompt labels the context "pre-calculated by deterministic JS engine" to reduce the likelihood of recalculation.

---

**Q: What happens if Gemini recalculates a value and gets it wrong?**

The system prompt rule "Do NOT recalculate values — comment on the pre-calculated ones" was added after early testing showed Gemini sometimes recomputed HHI and got a slightly different answer (iteration v1 of the prompt). The `responseMimeType: "application/json"` setting and temperature = 0.2 also reduce the tendency. However, the Limitations document acknowledges that Gemini can occasionally paraphrase numerical context inaccurately — this is an inherent limitation of LLM-based interpretation.

---

**Q: Why do you have five agents instead of one?**

Specialist agents with narrow, bounded roles tend to produce more reliable outputs than a single "do everything" prompt. The Portfolio Analysis Agent only knows about the existing portfolio. The Validation Agent only checks weights and data quality. The Market Screening Agent only explains the ranking. This decomposition also makes it easier to identify which agent produced an incorrect or inconsistent output during testing.

---

**Q: What is the Validation Agent checking?**

It checks: (1) do the five weights sum to 100%; (2) are all scores in the 0–100 range; (3) are there any obvious data inconsistencies; (4) what are the analytical limitations of this input (e.g., synthetic data, excluded costs). It returns `"weightCheck": "pass|fail"` — a strict string so the frontend can colour-code it without parsing prose.

---

**Q: What is the Orchestrator doing differently from the other agents?**

The Orchestrator receives a combined context object containing all four prior agents' structured outputs plus the original analytical context. It is the only agent that has the full picture. Its task is to synthesise — not add new analysis, but draw a coherent recommendation from what the other agents found. The system prompt explicitly prohibits inventing new financial figures or citing cities not in the data.

---

**Q: Why is the temperature set to 0.2?**

0.2 is near-deterministic but not zero. Temperature = 0 produces verbatim repetition across runs; temperature = 0.2 allows natural variation in phrasing while keeping the analysis consistent. For an academic demo where the evaluator may run the agents multiple times, slight phrasing variation is acceptable; meaningfully different conclusions would not be.

---

**Q: What happens if the Gemini API is unavailable?**

The application shows "AI explanation unavailable" on the Agent Recommendations page. All four other pages (Portfolio Analysis, Market Screener, Diversification) continue to work normally — they use only deterministic JavaScript. No prewritten text is displayed as if it were live AI output. This graceful degradation was a deliberate design requirement to maintain academic honesty.

---

### C4. Testing

**Q: How many tests does the test suite have?**

54 automated assertions, run with `node tests/reit-tests.js` (no external dependencies). The suite covers: portfolio aggregation, HHI formula, investment simulation, weight validation, risk inversion, normalisation edge cases, gross yield formula, market ranking, sensitivity analysis, diversification scoring, CSV/JSON validation, XSS safety, and portfolio edge cases (empty portfolio).

---

**Q: How do you run the tests?**

```
node tests/reit-tests.js
```

Output: `PASSED: 54 | FAILED: 0`

No npm install required. The test file uses only Node.js built-in `require()` and a hand-written `assert()` function.

---

**Q: Why no external test framework like Jest or Mocha?**

Keeping the test suite self-contained means it can be run immediately after cloning the repository, without any npm install step. The trade-off is no code coverage reporting or automatic test discovery, which are acceptable losses for an academic project of this scope.

---

**Q: What is test T23 checking?**

T23a-c check that XSS strings (e.g., `"<script>alert(1)</script>"`) used as field values are treated as plain string data throughout the analytics engines and never interpreted as markup. Because all DOM insertions use `textContent` rather than `innerHTML`, XSS strings cannot be executed. T23 verifies that the engines handle these values without throwing and that the strings survive through the pipeline unchanged.

---

### C5. Data

**Q: Is any of the data real?**

No. All 10 portfolio holdings and 18 market segments are entirely synthetic, hand-crafted for academic illustration. Every record carries `"isSynthetic": true` and `"sourceType": "synthetic_academic_placeholder"`. No real transaction, tenant, valuation, or market observation is included.

---

**Q: Why did you choose 18 market segments?**

Large enough to make ranking and normalisation meaningful (at least 3 per city, providing within-city variation across asset types) but small enough for the factor score breakdown table to be readable on a laptop screen. Eighteen segments also fit comfortably in a Gemini prompt context without truncation.

---

**Q: Why does the risk score seem counter-intuitive (Tier-1 cities are riskier)?**

Deliberately. The data was designed so that high capital-value cities (Mumbai BKC, Delhi NCR Aerocity) carry higher risk scores — reflecting valuation risk and overheating, not physical risk. This is intended to prompt discussion in viva sessions about the difference between yield risk, valuation risk, and physical/operational risk.

---

**Q: How would you replace the synthetic data with real data?**

Maintain the same JSON schema (all field names and types identical), set `"isSynthetic": false`, ensure `medianCapitalValuePerSqFt > 0` for all records (required by the yield formula), and update the "Academic Demo — Synthetic Data Only" banner in `index.html`. Run `node tests/reit-tests.js` — the engine tests use their own inline data and will still pass regardless of what is in `data/markets.json`.

---

### C6. Security and deployment

**Q: Where is the Gemini API key stored?**

In `server/.env`, a file that is excluded from git by `.gitignore`. It is never in any frontend file, never in `server.js` source code, and never logged. The `.env.example` file documents the required variable names without exposing real values.

---

**Q: What if someone inspects the browser's network requests — can they see the API key?**

No. The browser makes requests to the local Node.js proxy (`http://localhost:3001/api/gemini`). The proxy forwards the request to Google's API and adds the `Authorization` header server-side. The API key never travels from server to browser.

---

**Q: Can this application be deployed publicly?**

The current architecture is local-only — it is explicitly designed for a developer's laptop. For public deployment, you would need: (1) a hosting environment for the Node.js proxy with the API key stored as a server environment variable (not `.env`), (2) CORS configuration to restrict origins, (3) authentication (currently there is none), and (4) rate-limiting on the proxy to control API costs. The Limitations document lists these gaps.

---

## Part D — Five-minute demo sequence

1. **Portfolio Analysis** — point out city HHI (moderate) and asset type HHI (concentrated). Note the three near-term lease expirations.
2. **Market Screener** — run with Balanced weights. Show top-3 rankings. Change to Income Focused — observe Hyderabad HITEC City holding top rank. Change to Growth Focused — observe ranking shift.
3. **Diversification** — select Hyderabad HITEC City from the screener (it populates automatically). Set investment to ₹50 Cr. Show before/after HHI cards — both decrease. Show yield improvement.
4. **Agent Recommendations** — click "Run AI Analysis." Walk through the activity trail as each agent completes. Show the final Orchestrator recommendation. Point to the disclaimer on every card.
5. **Close with** — open `tests/reit-tests.js` in a terminal and run `node tests/reit-tests.js`. All 54 pass. This shows the deterministic engine is independently verified.

---

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

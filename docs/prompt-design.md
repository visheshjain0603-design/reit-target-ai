# Prompt Design — REIT Target AI Gemini Agents

**NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo**

---

## 1. Design philosophy

The six Gemini agents in REIT Target AI follow a single core principle:

> **Gemini interprets; JavaScript calculates.**

Every numerical value the agents reference — HHI scores, weighted yields, factor contributions, diversification improvements — is computed by `hhi.js` and `scoringEngine.js` before the API call is made. Gemini receives the pre-calculated results as a structured JSON context and is instructed to provide natural-language interpretation only.

This separation:
- Makes AI outputs verifiable against deterministic ground truth
- Prevents hallucinated or inconsistent numerical claims
- Ensures the application remains fully functional when Gemini is unavailable
- Makes the AI's reasoning transparent (the context it receives is visible in the browser console)

---

## 2. Prompt structure

Each agent call sends two components to the Gemini `generateContent` API:

### 2.1 System instruction (constant per agent type)

```
You are the [Role] Agent for REIT Target AI, an academic demonstration system.
Your role: [specific, bounded task].
Rules:
1. Base ALL observations on the JSON data provided. Do NOT invent values.
2. Do NOT recalculate values — comment on the pre-calculated ones.
3. Do NOT present this as real investment advice.
4. Flag that this is a SYNTHETIC academic dataset.
5. Respond ONLY with valid JSON: { [output schema] }
```

### 2.2 User message (assembled at runtime)

```
ANALYTICAL CONTEXT (pre-calculated by deterministic JS engine):
{
  [full JSON context object]
}

Provide your structured JSON analysis.
```

The label "pre-calculated by deterministic JS engine" was deliberate: it signals to Gemini that recalculating would be redundant, reducing the likelihood of the model substituting its own arithmetic.

---

## 3. Individual agent prompts

### 3.1 Data Quality Agent

**System prompt objective:** Assess the data-quality metrics produced by the cleaning pipeline and statistics engine and flag any issues that could affect downstream analysis.

**Key rules:**
- "Base ALL observations on the JSON data provided. Do NOT invent values."
- "Do NOT present cleaning statistics as investment indicators."
- "Flag any market with fewer than 30 observations as under-sampled."

**Output schema:**
```json
{
  "overallQuality": "...",
  "dataSummary": "...",
  "sampleSizeWarnings": ["..."],
  "outlierNotes": ["..."],
  "pipelineSummary": "...",
  "recommendations": ["..."],
  "disclaimer": "..."
}
```

**Design decisions:**
- `sampleSizeWarnings` and `outlierNotes` are separate arrays so the frontend can highlight each category distinctly.
- `recommendations` invites Gemini to propose remedies (e.g., "collect more observations for Hyderabad Hitec City Residential") without changing any values.
- Runs **first** in the chain so every downstream agent has access to data-quality context.

### 3.2 Statistical Analysis Agent

**System prompt objective:** Interpret the segment-level statistical metrics (medians, IQRs, yield ranges, city and asset-type comparisons) computed by the Stats engine.

**Key rules:**
- "Do NOT recalculate statistics — interpret the pre-calculated values provided."
- "Refer to confidence intervals as approximate 95% CIs from a bootstrap resampling (500 resamples, synthetic data)."
- "Do NOT present yield spreads or capital value ranges as trading signals."

**Output schema:**
```json
{
  "keyFindings": ["..."],
  "yieldAnalysis": "...",
  "capitalValueAnalysis": "...",
  "cityComparison": "...",
  "typeComparison": "...",
  "statisticalCaveats": ["..."],
  "disclaimer": "..."
}
```

**Design decisions:**
- `keyFindings` is an array of concise bullet-point observations, enabling the frontend to render them as a scannable list rather than a prose block.
- `statisticalCaveats` is a required field to ensure the agent acknowledges the synthetic data limitation and the bootstrap approximation.
- Runs **second** in the chain, after Data Quality, so statistical interpretation is grounded in clean data.

### 3.3 Portfolio Analysis Agent

**System prompt objective:** Explain existing portfolio concentration, yield, and lease risks.

**Key rules:**
- "Base ALL observations on the JSON data provided. Do NOT invent values."
- "Do NOT recalculate values — comment on the pre-calculated ones."

**Output schema:**
```json
{
  "summary": "...",
  "concentrationRisks": ["..."],
  "yieldObservations": ["..."],
  "leaseRisks": ["..."],
  "disclaimer": "..."
}
```

**Design decisions:**
- `concentrationRisks` and `leaseRisks` are arrays rather than a single string so the frontend can render them as bullet lists with clear visual separation.
- `disclaimer` is a required field, ensuring every agent response carries the synthetic-data caveat.

### 3.4 Market Screening Agent

**System prompt objective:** Explain why the top-ranked markets scored highly using pre-calculated factor scores.

**Key rules:**
- "Do NOT invent scores or rankings. Refer only to provided data."
- "Explain the scoring METHODOLOGY (yield, growth, diversification, demand, low-risk)."

**Output schema:**
```json
{
  "topPickExplanation": "...",
  "factorInsights": ["..."],
  "watchPoints": ["..."],
  "disclaimer": "..."
}
```

**Design decisions:**
- `watchPoints` invites Gemini to flag risks even for the top market, balancing the otherwise positive framing of a "recommended" pick.
- The system prompt names all five factors by name to anchor the explanation to the correct terminology.

### 3.5 Diversification Agent

**System prompt objective:** Interpret the before/after HHI change and yield impact.

**Key rules:**
- "Do NOT use the labels 'safe' or 'dangerous' for HHI levels — use 'concentrated', 'moderate', 'diversified'."
- "HHI above 0.25 = concentrated; 0.15–0.25 = moderate; below 0.15 = diversified."
- "Lower HHI after investment means improved diversification."

**Output schema:**
```json
{
  "cityHHIInterpretation": "...",
  "typeHHIInterpretation": "...",
  "yieldImpact": "...",
  "overallAssessment": "...",
  "disclaimer": "..."
}
```

**Design decisions:**
- The explicit HHI threshold rules in the system prompt prevent Gemini from using its own (potentially different) thresholds.
- Prohibiting "safe/dangerous" reduces over-confident language inappropriate for an academic demo.

### 3.6 Validation Agent

**System prompt objective:** Check inputs for completeness, consistency, and methodological limitations before the Orchestrator runs.

**Key rules:**
- "Check: are all five weight values present and summing to 100%? Return weightCheck='pass' or 'fail'."
- "Check: are all scores in the 0–100 range? Return scoreRangeCheck='pass' or 'fail'."
- "Check: does the selected target appear in the top-ranked markets list? Return targetExists=true/false."
- "Check: do the city HHI and asset-type HHI values in the context match what the simulation reports? Return hhiConsistency='pass' or 'fail'."
- "Return validatedOk=true ONLY if: weightCheck=pass AND scoreRangeCheck=pass AND targetExists=true AND hhiConsistency=pass AND no critical inconsistencies."

**Output schema:**
```json
{
  "weightCheck": "pass|fail",
  "scoreRangeCheck": "pass|fail",
  "targetExists": true,
  "hhiConsistency": "pass|fail",
  "dataQuality": "...",
  "inconsistencies": ["..."],
  "limitations": ["..."],
  "validatedOk": true,
  "disclaimer": "..."
}
```

**Design decisions:**
- Four binary checks (not prose) let the frontend colour-code each result without string parsing.
- `hhiConsistency` was added after observing that a stale state could have mismatched HHI values; the check guards the Orchestrator from synthesising a recommendation from inconsistent data.
- The Validation Agent runs **fifth** in the execution chain (Data Quality → Statistical Analysis → Market Screening → Diversification → **Validation** → Orchestrator). Its `validatedOk` flag gates the Orchestrator: if `validatedOk !== true`, the Orchestrator step is marked Failed and skipped.

### 3.7 Investment Orchestrator Agent

**System prompt objective:** Synthesise all validated outputs into a final structured recommendation.

**Key rules:**
- "Only include insights that are supported by the agent outputs and the analytical context provided."
- "Do NOT invent new analysis, recalculate scores, or cite financial figures not in the context."
- "Clearly state this is for ACADEMIC DEMONSTRATION on SYNTHETIC DATA."
- "A recommendation here is NOT real investment advice."
- "The 'selectedTarget' must be the highest-scoring market from the pre-calculated context."
- "You are called ONLY because the Validation Agent returned validatedOk=true."

**Output schema:**
```json
{
  "selectedTarget": "...",
  "investmentAmount": "₹<N> Cr",
  "compositeScore": 0,
  "expectedYieldPct": 0,
  "cityHHIEffect": "...",
  "assetTypeHHIEffect": "...",
  "whyTopRanked": "...",
  "importantRisks": ["..."],
  "syntheticDisclaimer": "...",
  "disclaimer": "..."
}
```

**Design decisions:**
- The Orchestrator is called **only when `validatedOk === true`**. If Validation fails, the Orchestrator step is set to `{ error: "Orchestrator skipped — validation did not pass." }` client-side, with no API call made.
- `selectedTarget` replaces the earlier `recommendedTarget` field to match the `selectedTargetId` from the shared state and prevent ambiguity.
- `cityHHIEffect` and `assetTypeHHIEffect` are explicit fields so the card can surface the diversification impact directly, rather than burying it in a prose rationale.
- `syntheticDisclaimer` is a separate field from `disclaimer` so the UI can render it prominently as a callout rather than footnote text.
- The Orchestrator receives a combined context object containing all four prior agents' outputs plus the original analytical context, allowing it to draw on the full analysis chain.

---

## 4. API configuration

```javascript
generationConfig: {
  responseMimeType: "application/json",  // Forces JSON output
  temperature: 0.2,                      // Near-deterministic but allows natural phrasing
  maxOutputTokens: 1024                  // Sufficient for structured JSON; limits cost
}
```

**`responseMimeType: "application/json"`** was the most important setting. Without it, Gemini sometimes wraps JSON in markdown code fences (` ```json ... ``` `), requiring a stripping step. With it, the response is always raw JSON. The server still includes a fallback strip in case an older model version ignores the MIME type.

**Temperature 0.2** was chosen to produce consistent, professional language while avoiding verbatim repetition across runs.

---

## 5. Prompt iteration log

| Iteration | Issue | Fix |
|-----------|-------|-----|
| v1 | Gemini recalculated HHI and got a different value | Added Rule 2: "Do NOT recalculate values" |
| v2 | Gemini used "risky" and "safe" loosely | Added explicit prohibition and defined HHI thresholds in diversification agent |
| v3 | Orchestrator invented a new city not in the data | Added Rule 1 to Orchestrator: "Only include insights that are supported by the agent outputs provided" |
| v4 | Validation agent returned `valid: true/false` instead of `pass/fail` | Changed `weightCheck` schema to strict string "pass\|fail" in system prompt |
| v5 | Occasional markdown-wrapped JSON (` ```json ` fences) | Added `responseMimeType: "application/json"` and retained strip fallback |
| v6 | Execution order was portfolio → validation → screening → simulation → orchestrator; Orchestrator could run before diversification was calculated | Corrected order to portfolio → screening → simulation → validation → orchestrator; Orchestrator gated on `validatedOk === true`; Validation prompt expanded to four checks (weightCheck, scoreRangeCheck, targetExists, hhiConsistency); Orchestrator output schema updated to `selectedTarget / cityHHIEffect / assetTypeHHIEffect / whyTopRanked / syntheticDisclaimer` |
| v7 | Stage 4 added segment statistics engine (Stats.js); portfolio-analysis agent had no access to statistical context | Added two new agents — Data Quality (first) and Statistical Analysis (second) — each receiving pre-calculated Stats engine output; chain extended to 6 agents: dataQuality → statisticalAnalysis → marketScreening → diversification → validation → orchestrator |

---

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

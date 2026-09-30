# AI Use Declaration — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | Academic Demo**

This document discloses all uses of AI tools during the development and documentation of this project, in accordance with academic integrity requirements.

---

## 1. AI tools used

| Tool | Version / Model | Purpose |
|------|----------------|---------|
| Claude (Anthropic) | claude-sonnet-4-6 | Primary development assistance (see §2) |
| Google Gemini API | gemini-1.5-flash | Runtime agent in the completed application (see §3) |

---

## 2. Use of Claude during development

Claude was used as a coding assistant and reviewer throughout the project. Specific uses:

### 2.1 Code generation and review
- Initial scaffolding of `hhi.js` and `scoringEngine.js` function signatures
- Code review and bug identification in `portfolio.js` (SafariWebKit curly-quote SyntaxError)
- Writing `server.js` Gemini proxy with zero npm dependencies
- Writing page controllers (`marketScreen.js`, `diversification.js`, `agents.js`)
- Writing the automated test suite (`tests/reit-tests.js`) — expanded to 342 tests across T01–T85
- Reliability pass: fixing annualRentCr propagation through shared state (stateManager → marketScreen → diversification → report)
- Implementing the System Check panel in Data Centre (CHK-01 through CHK-09 runtime validation)
- Improving the Agent Output offline mode: structured explanation with reasons and start-server command
- Correcting Decision Report metadata: NMIMS attribution, author name, descriptive target name, composite score, weight preset label

### 2.2 Documentation drafting
- All files in `docs/` were drafted with Claude's assistance and then reviewed
- README.md was drafted with Claude's assistance

### 2.3 Design decisions
- Architecture discussions (how to separate deterministic engines from AI agents)
- Prompt design for Gemini agents (§5 of this document)
- Security design (how to keep the API key server-side only)

### 2.4 What Claude did NOT do
- Claude did not choose the project topic, the academic framing, or the NMIMS submission requirements
- Claude did not supply real financial data or real market observations
- Claude did not generate the synthetic portfolio data — values were specified by the student based on the academic brief
- Claude's outputs were reviewed and modified before inclusion; no AI output was accepted uncritically

---

## 3. Use of Gemini API in the application

### 3.1 Role of Gemini at runtime
Gemini is embedded in the application as an **interpretation layer** only. It receives pre-calculated numerical outputs from the deterministic JavaScript engines and generates natural-language commentary.

### 3.2 What Gemini produces
Agents run sequentially in the following order:

1. `dataQuality agent`: reviews data quality metrics, sample-size warnings, outliers detected by the cleaning pipeline, and CSV provenance — returns a structured quality summary
2. `statisticalAnalysis agent`: interprets segment-level statistics (median yield, capital value ranges, IQR spread, city and asset-type comparisons) from the Stats engine output
3. `marketScreening agent`: explains why the top-ranked markets scored highly using pre-calculated factor scores
4. `diversification agent`: interprets the before/after HHI change for both city and asset-type dimensions
5. `validation agent`: checks four specific conditions — weights sum to 100%, all scores in 0–100 range, selected target in ranked list, city/type HHI values consistent — and returns `validatedOk: true|false`
6. `orchestrator agent`: synthesises all five prior outputs into a final recommendation; **runs only if** `validatedOk === true` from the Validation Agent

### 3.3 What Gemini does NOT do
Gemini's system prompts explicitly prohibit it from:
- Recalculating or overriding the numerical values it receives
- Presenting outputs as real investment advice
- Generating information beyond what is in the provided context
- Running the Orchestrator when the Validation Agent flags inconsistencies
- Presenting the dataQuality or statisticalAnalysis outputs as forward-looking market predictions

### 3.4 Graceful degradation
If the Gemini API is unavailable, the application shows "AI explanation unavailable" and continues to display all deterministic results. No prewritten fallback text is presented as live AI output.

---

## 4. Academic integrity statement

All ideas, problem framing, financial model design, and academic argument presented in this submission are the work of the student author. AI tools were used to accelerate implementation of the technical components and drafting of documentation — functions equivalent to those a developer or research assistant might perform. The student understands, has reviewed, and takes full academic responsibility for all submitted content.

The use of generative AI in this project is consistent with Theme 4's learning objective: "Building Agents and Artifacts using Generative AI."

---

## 5. Gemini system prompt design

The five agent prompts follow a consistent pattern to constrain Gemini's behaviour:

```
1. Role definition:
   "You are the [Role] Agent for REIT Target AI, an academic demonstration system."

2. Task scope (what the agent should do):
   "Your role: [specific task] using the pre-calculated factor scores and contributions provided."

3. Constraints (numbered rules):
   "Rules:
    1. Base ALL observations on the JSON data provided. Do NOT invent values.
    2. Do NOT recalculate values — comment on the pre-calculated ones.
    3. Do NOT present this as real investment advice.
    4. Flag that this is a SYNTHETIC academic dataset.
    5. Respond ONLY with valid JSON: { ... }"

4. Output schema:
   Strict JSON schema specified in rule 5, preventing prose or markdown.
```

The user prompt prepends the context with:
```
ANALYTICAL CONTEXT (pre-calculated by deterministic JS engine):
{ ... }

Provide your structured JSON analysis.
```

This two-layer approach (system prompt for role + rules; user prompt for data) keeps the context clean and prevents Gemini from confusing the analytical methodology with the specific values.

---

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

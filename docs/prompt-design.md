# Prompt Design — REIT Target AI Gemini Agents

**REIT Target AI | NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI | Vishesh Jain**

All data in this project is synthetic. Nothing described here is a real property,
listing, transaction or market.

This document describes the agent prompts, response schemas, agent context and
output checks as they are in the code now. The code is the reference:

| Concern | File |
|---|---|
| System prompts, Gemini call, proxy routes | `server/server.js` |
| Agent roster (names, purposes, order) | `public/js/appMeta.js` (`AGENTS`) |
| Context sent to every agent | `public/js/agentContext.js` (`fromRun()`) |
| Response schemas and the output checker | `public/js/agentOutputCheck.js` (`SCHEMAS`, `check()`) |
| Deterministic gate before the Orchestrator | `public/js/validator.js` |
| Pre-generated commentary and the revision loop | `data-pipeline/scripts/buildAgentCache.js` |
| Display of live or stored commentary | `public/js/agents.js` |

---

## 1. Principle

**Gemini interprets; the code calculates, ranks and validates.** Every figure an
agent may mention is computed before the call, by the same shared analysis run that
every page renders (`public/js/analysisRun.js`). A model reply is never a source of
figures: each card on the Agent Output page opens with headline figures taken from
the context (for the Orchestrator: selected target, investment, composite score,
expected gross yield, simulation support, external calibration), labelled "Figures
above are taken from the deterministic analysis, not from the model", and prints
the model's prose beneath them together with the result of a deterministic
consistency check.

A reply passes through five controls:

1. **Deterministic context.** `AgentContext.fromRun()` states every figure the agent
   may quote, under an explicit name and at display precision.
2. **System prompt.** A role statement for the agent plus fourteen shared rules
   (A–N) stated once in `COMMON_RULES`, so the four prompts cannot drift apart.
3. **Response schema.** A strict JSON schema with prose fields only, passed to
   Gemini as `responseSchema`.
4. **Output checker.** `AgentOutputCheck.check()` compares the prose with the
   context and reports every statement it can prove false.
5. **Storage gate.** Pre-generated commentary is written to
   `public/data/agent-cache.json` only when every reply for every preset passes the
   checker.

---

## 2. The agent chain

| Step | Agent (key) | Receives | Job |
|---|---|---|---|
| 1 | Data & Statistical Analyst (`dataStatistical`) | context | Describe the market-segment dataset, its simulation support, dispersion, segment-median outliers and known synthetic anomalies |
| 2 | Market Screening Analyst (`marketScreening`) | context + `dataStatisticalOutput` | Explain why the selected target scored as it did, compare it with `comparisonMarket`, explain the screen outcome for higher raw-score segments |
| 3 | Portfolio Risk & Scenario Analyst (`portfolioRisk`) | context + both earlier outputs | Interpret the HHI change, the weighted-yield change and the three-year projections |
| Gate | `validator.js` — eight deterministic checks | context, ranking, holdings | Factor weights total 100%; composite scores within 0–100; ranking sorted by descending score; selected target is in the ranking; portfolio HHI figures reproduce; weighted yield equals rent ÷ value; investment amount positive and finite; synthetic-data notice present in the context |
| 4 | Investment Orchestrator (`orchestrator`) | context + three outputs + `deterministicValidation` | Synthesise one summary of the selected target, its screening basis, risks and next steps |

The Orchestrator is reached only when all eight checks pass. In the browser a
failed gate leaves the Orchestrator card stating that no synthesis was produced and
naming the failed checks, while the deterministic-checks panel shows the figures
each check compared; the server's `/api/agents/analyse` route likewise skips the
Orchestrator unless `context.deterministicValidation.passed === true`.

The server still accepts the agent names of the earlier design
(`dataQuality`, `statisticalAnalysis`, `portfolioAnalysis`, `diversification`) and
routes them to the agent that now does that job. A request for `validation` is
refused with HTTP 410 and a pointer to `validator.js`: there is no model prompt for
validation, by design.

---

## 3. How a call is made

**Message.** The system instruction is `AGENT_PROMPTS[agent]`. The user message is:

```
ANALYTICAL CONTEXT (pre-calculated by deterministic JS engine):
{ ...the context object, pretty-printed JSON... }

Provide your structured JSON analysis.
```

**Generation settings** (`callGemini()` in `server/server.js`):

| Setting | Value | Reason |
|---|---|---|
| `responseMimeType` | `application/json` | Raw JSON, no prose wrapper |
| `responseSchema` | `AgentOutputCheck.SCHEMAS[agent]` | The exact shape the checker later verifies — one definition shared by server, cache builder and browser |
| `temperature` | 0.2 | Consistent wording without verbatim repetition |
| `thinkingConfig.thinkingBudget` | 0 | Gemini 3.x draws reasoning tokens from the output budget; the agents interpret computed figures and need no internal reasoning, and a non-zero budget truncated replies mid-JSON |
| `maxOutputTokens` | `GEMINI_MAX_OUTPUT_TOKENS`, default 4096 | Room for the full JSON object; a reply cut off at the limit is rejected with an explanatory error rather than parsed |

**Models and failures.** The model is `GEMINI_MODEL`; the models in
`GEMINI_FALLBACK_MODELS` are tried in order when a model's daily quota is exhausted
or the model name is unusable (HTTP 400/404). Transient errors (429, 500, 502, 503,
504, network errors) are retried on the same model with exponential back-off, up to
`GEMINI_MAX_RETRIES` (default 3), honouring any retry delay the API supplies.
`extractJson()` accepts clean JSON, fenced JSON or JSON surrounded by stray text, and
otherwise returns `{ raw: text }`, which the checker rejects as not the required
object. The proxy keeps an in-memory response cache keyed by agent and a hash of the
context (at most 50 entries; `/api/cache/clear` empties it).

**Where calls come from.** The browser calls `POST /api/agent` once per agent, and
only when the page is served by the proxy itself (`node server/server.js`, then
`http://localhost:3001`). On any other origin, including GitHub Pages, the proxy is
not probed and the page offers pre-generated commentary instead (§9). The cache
builder also uses `POST /api/agent`. The API key is read from `server/.env`
(git-ignored) and never reaches the browser.

---

## 4. Shared rules (`COMMON_RULES`)

Every system prompt ends with the same fourteen rules. They are quoted from
`server/server.js`; rule D is abridged and rule M omits its worked example, as noted.
The last column refers to the defect list in §10.

| Rule | Requirement | Defect addressed |
|---|---|---|
| A | "The data is SYNTHETIC. Say so. Nothing here describes a real property, market or transaction." | — |
| B | "You interpret figures that were computed deterministically. Never calculate, estimate, rank, re-rank or validate anything." | — |
| C | "Quote every figure EXACTLY as the context writes it, with the same decimals: "7.00%" not "7%", "0.4130" not "0.413", "67.71" not "67.7". Never introduce a figure that is not in the context." | 6 |
| D | "Use the context's vocabulary: raw rank, eligible rank, highest raw-score market, shortlist candidate, selected target, next eligible candidate, highest raw-score alternative, simulation-support screen, simulated observations, Assumption Support Grade, external calibration." The rule then names four retired terms the model must never write (abridged here; they are listed in §12). | 2, 8 |
| E | "A segment's rank is its rawRank (or its eligibleRank among segments passing the screen). Never say a segment "ranked first" unless its rawRank is 1." | 3 |
| F | "When you say why a segment fails the simulation-support screen, use ITS OWN exclusionReasons / failsScreenOn: some fail on simulated observations, some on Assumption Support Grade alone, some on both. Never attribute a grade-only failure to sample size." | 7 |
| G | "Simulation support is NOT evidence. More simulated observations narrow the estimate around the project's assumed distribution; they do not show that the figures are true of any real market. Thirty observations is a project governance convention, not a statistical guarantee. External calibration is Unverified for every segment." | 4, 8 |
| H | "Figures in marketDataset describe the 50 candidate market segments, NOT the portfolio. Figures in portfolio describe the existing holdings. Never mix them." | 1 |
| I | "Refer to records as simulated market observations — never properties, listings or transactions." | — |
| J | "If the context contains revisionNotes, your previous answer broke the rules listed there. Correct every one." | (revision loop, §9) |
| K | "Write plain English. Never write context field names such as rawRank, eligibleRank, factorScores, grossYieldPct or recommendedCandidate — say "raw rank 8", "rental yield factor score", "gross yield 7.00%"." | 10 |
| L | "selectionMode "auto" means the selected target IS the shortlist candidate; never call it manually selected. Only when selectionMode is "manual" is it a manually selected target." | 9 |
| M | "Write money as `₹<figure> Cr` … never a bare number." (worked example omitted) | — |
| N | "Respond ONLY with JSON matching the required schema. No markdown." | — |

---

## 5. The four agent prompts

Each prompt is a role statement followed by `COMMON_RULES`. The role statements,
quoted from `AGENT_PROMPTS`:

### 5.1 Data & Statistical Analyst (`dataStatistical`)

> You are the Data & Statistical Analyst for REIT Target AI, an academic demonstration system.
> Your role: describe the market-segment dataset (marketDataset), its simulation support (how many simulated observations stand behind each segment, by city), the spread of segment gross yields, the segment-median outliers (segmentMedianOutliers, using its definition), and the known synthetic anomalies (knownSyntheticAnomalies).
> Name cities and counts from segmentsBelowThresholdByCity, smallestSegmentObservations and segmentsBelowObservationThreshold. Write numbers, never field names.

The prompt names the exact context blocks to use, so outlier and anomaly statements
rest on the definitions the context supplies rather than on the model's own idea of
an outlier.

### 5.2 Market Screening Analyst (`marketScreening`)

> You are the Market Screening Analyst for REIT Target AI, an academic demonstration system.
> Your role: explain why the selected target (selectedTarget) scored as it did, using its contributions and factorScores; name its dominant factor; compare it with comparisonMarket, calling that segment by its exact role (comparisonMarket.role); and explain the simulation-support screen outcome for the segments listed in higherRawScoreExclusions.
> State the selected target's rawRank and eligibleRank exactly. If selectionMode is "manual", say it is a manually selected target and name the shortlist candidate (recommendedCandidate).
> The composite score measures attractiveness only. The screen is a separate test of simulation support. Never imply a score was adjusted.

The comparison segment is chosen in code and arrives with its role, so the model
does not decide which segment is "second". The dominant factor is also supplied
(`largestContribution`) and checked exactly (§8, rule 7b).

### 5.3 Portfolio Risk & Scenario Analyst (`portfolioRisk`)

> You are the Portfolio Risk & Scenario Analyst for REIT Target AI, an academic demonstration system.
> Your role: interpret the concentration block (city and asset-type HHI before and after investing in the selected target), the portfolio weighted yield before and after, and the three-year projections block.
> HHI above 0.25 is concentrated, 0.15 to 0.25 moderate, below 0.15 diversified — descriptive benchmarks, not regulatory thresholds. Never use 'safe' or 'dangerous'. A lower HHI is better diversified; state the concentration that REMAINS after the investment.
> State the projection assumptions (flat growth, no leverage, tax, fees or transaction costs) before what they show.

The HHI bands are stated in the prompt so the model does not substitute its own,
and the projection assumptions must precede the projected figures.

### 5.4 Investment Orchestrator (`orchestrator`)

> You are the Investment Orchestrator for REIT Target AI, an academic demonstration system.
> You receive the three analysts' outputs and the result of the deterministic checks performed in code. You are called only because those checks passed. The checks are arithmetic, not opinion: do not re-perform them or claim to have verified anything.
> Your role: synthesise the analyses into one structured summary of the SELECTED TARGET. recommendationSummary must name selectedTarget.name and its role: "shortlist candidate" (the highest-ranked candidate passing the simulation-support screen) or "manually selected target". This is an exploratory model candidate, never an investment recommendation.
> screeningBasis: why the screen produced this candidate, citing each higher raw-score segment's own exclusion reason. nextSteps MUST state that external calibration remains unverified and that further evidence collection and due diligence are required before any real decision.
> importantRisks must include at least one risk arising from the data itself (synthetic data, simulation-only support, unverified calibration).

---

## 6. Response schemas (`AgentOutputCheck.SCHEMAS`)

The schemas use Gemini's schema format (`OBJECT`, `STRING`, `ARRAY` of `STRING`).
Every property is required and `propertyOrdering` fixes the order. **There is no
number, integer or boolean field in any schema.** An earlier schema asked the
Orchestrator for a composite score, an expected yield and an investment amount, and
the model filled the expected yield inconsistently; the page now renders those
figures from the context. `AgentContext.applyDeterministicFigures()` remains only to read outputs
stored under the earlier schema: it overwrites any such field with the
deterministic value and keeps the model's differing value in `_modelFigures`.

| Agent | Fields (type) |
|---|---|
| `dataStatistical` | `datasetSummary` (string), `simulationSupportNotes` (list), `dispersionNotes` (list), `segmentOutlierNotes` (list), `knownAnomalyNote` (string), `caveats` (list), `disclaimer` (string) |
| `marketScreening` | `candidateExplanation` (string), `dominantFactor` (string — must be exactly the factor in `largestContribution`), `comparisonWithAlternative` (string — names the comparison segment by its role), `screenOutcome` (string), `factorInsights` (list), `watchPoints` (list — includes that external calibration is unverified), `disclaimer` (string) |
| `portfolioRisk` | `cityConcentration` (string — four-decimal HHI), `assetTypeConcentration` (string — four-decimal HHI), `residualConcentration` (string), `yieldImpact` (string), `scenarioInterpretation` (string — assumptions first), `projectionCaveats` (list), `overallAssessment` (string), `disclaimer` (string) |
| `orchestrator` | `recommendationSummary` (string — names the selected target and its role), `screeningBasis` (string), `concentrationEffect` (string), `keyStrengths` (list), `importantRisks` (list — at least one about the data), `nextSteps` (string — must say calibration is unverified and due diligence is required), `disclaimer` (string) |

Each property carries a one-line description that Gemini receives with the schema.
`FIELD_LABELS` in the same file gives the display label for every field, so the
cards and the Decision Report label fields identically.

---

## 7. The deterministic context (`AgentContext.fromRun(run, data)`)

The context is built from the shared analysis run, so the context the Agent Output
page sends, the context stored with pre-generated commentary, and the figures every
other page shows are one object. It is pure: no DOM, network or clock reads.

**Precision.** Figures the model may quote are fixed-decimal **strings**
(`fx(value, dp)`), not JSON numbers. A JSON number cannot carry its display
precision — 7.00 serialises as `7` and 0.4130 as `0.413` — so the model could not
know the interface shows "7.00%" and wrote "7%". As strings, the precision travels
with the figure, and the checker requires it to be quoted exactly. Scores, yields,
growth rates and factor values use 2 decimals; HHI uses 4; portfolio rent and
weighted yield use 3 (each field's precision is set in `fromRun()`).

### 7.1 Top-level fields

| Field | Content | Why it exists |
|---|---|---|
| `dataNote` | "SYNTHETIC ACADEMIC DATA — not real market values" | Rule A; also the subject of the validator's synthetic-notice check |
| `contextVersion` | Context version from the scenario descriptor | Part of the scenario key, so commentary written against an older context shape stops matching |
| `runNote` | Empty string | Reserved; currently unused |
| `terminology` | Definitions from `AppMeta.TERMS` and `AppMeta.SUPPORT_GRADES` (raw rank, eligible rank, highest raw-score market, shortlist candidate, selected target, simulation-support screen, Assumption Support Grade, external calibration, simulated observations) and a `wordsNotToUse` list | The model reads the same definitions the pages and documents use |
| `weights`, `weightsPct` | Engine weights as fractions; the same weights as whole percentages | The model can quote "25%"; the checker accepts weights as whole percentages |
| `preset`, `presetLabel`, `investmentCr`, `selectionMode`, `screenIgnored` | The run's inputs | `selectionMode` underlies rule L; `screenIgnored` records an explicit override of the screen |
| `portfolio` | `scope` ("PORTFOLIO — the existing holdings …"), holdings count, total value, annual rent, weighted yield, city HHI, asset-type HHI | Portfolio figures in their own labelled block, separate from the dataset (rule H) |
| `simulationSupportScreen` | Rule text, minimum simulated observations, minimum grade, `nature` (the governance rationale), `segmentsPassing`, `segmentsTotal` | Counts supplied so the model cannot miscount; `nature` states that the screen is a project convention for simulation precision |
| `externalCalibration` | `status`, `basis` (from `AppMeta.EXTERNAL_CALIBRATION`), `consequence` (the fixed candidate caveat) | States that no figure is externally verified. Note: this block's `status` is the literal "Unverified"; the per-segment `externalCalibrationStatus` values are derived from the source register (see `docs/SOURCE_VERIFICATION_REPORT.md`) |
| `highestRawScoreMarket` | Segment summary (§7.2) of raw rank 1 | Named explicitly whether or not it passes the screen |
| `recommendedCandidate` | Segment summary of the shortlist candidate | The screen's output, kept separate from the selected target |
| `selectedTarget` | Segment summary of the target every page analyses, plus `selectionMode` and `sameAsRecommendedCandidate` | The segment every agent writes about; in manual mode it can differ from the candidate |
| `comparisonMarket` | Segment summary plus `role`: "Highest raw-score alternative" when raw rank 1 is a different segment from the target, otherwise "Next eligible candidate" | One comparison segment, chosen in code and named for what it is |
| `nextEligibleCandidate` | Segment summary of the first eligible segment other than the target | Gives the role phrase "next eligible candidate" a definite referent |
| `rawTop5`, `eligibleTop3` | Segment summaries | Lets the model mention nearby segments without leaving the context |
| `higherRawScoreExclusions` | Every segment scoring above the selected target that fails the screen: raw rank, score, simulated observations, grade, `failsScreenOn`, `exclusionReasons` | Exact per-segment reasons (rule F). It is empty when the target is raw rank 1, which the checker uses to reject "excluded for scoring higher" claims |
| `concentration` | City and asset-type HHI before, after and change (4 decimals); weighted yield before and after; HHI benchmark text | Everything the Portfolio Risk analyst may quote about concentration |
| `projections` | Horizon (3 years), assumptions text, year-0 rent and value, the target's annual rent, and conservative/base/optimistic year-3 value, rent, gross yield, effective yield and value change | Projection figures with their assumptions attached |
| `marketDataset` | `scope` ("MARKET-SEGMENT DATASET — … NOT the portfolio"), segment count, simulated observations, median and range of segment gross yields, segments below the observation threshold, smallest and largest observation counts, segments below threshold by city | Dataset statistics under a name that cannot be read as the portfolio's (defect 1) |
| `segmentMedianOutliers` | Definition (Tukey 1.5×IQR fences on segment-median gross yield and capital value within each city with at least 4 segments) and per-city results | Outlier statements tied to one stated definition (defect 5) |
| `knownSyntheticAnomalies` | Definition, count and contamination percentage from `statistics.json` ground truth | The deliberately inserted anomalies, distinguished from detector results |

Later agents also receive the earlier agents' outputs (`dataStatisticalOutput`,
`marketScreeningOutput`, `portfolioRiskOutput`); the Orchestrator receives
`deterministicValidation` (pass/fail, summary, each check with its detail, and the
fixed limitations list). The cache builder adds `revisionNotes` on a revision (§9).

### 7.2 Segment summary (`marketSummary()`)

Every segment named in the context carries the same fields: `marketId`, `name`,
`city`, `propertyType`, `rawRank`, `eligibleRank` (null when the segment fails the
screen), `compositeScore`, `grossYieldPct`, `rentalGrowthPct`, `demandScore`,
`riskScore`, `factorScores` and `contributions` (five factors each),
`largestContribution` (`{ factor, contribution }` — the factor contributing most to
the score, supplied so it is never guessed), `passesSimulationSupportRule`,
`simulationObservationCount`, `supportGrade` (Assumption Support Grade),
`simulationSupportLevel`, `exclusionReasons`, `failsScreenOn` ("simulated
observations", "support grade" or "both"), `externalCalibrationStatus` and
`grossYieldP10toP90Pct`.

---

## 8. The output checker (`AgentOutputCheck.check(agentKey, output, ctx, universe)`)

The checker reads every prose field sentence by sentence and returns
`{ ok, issues: [{ field, message, text }] }`. It cannot prove prose true; it proves
specific kinds of statement false. The rules below carry the numbers used in the
source comments of `agentOutputCheck.js`, in the order they are applied; §10 cites
them by these numbers.

- **(1) Shape.** Every required field present, strings are strings, lists are lists
  of strings, no field outside the schema (fields beginning `_` are ignored). A
  reply that is not a JSON object fails outright.
- **(2) Retired terms and overclaims.** Any term in `AppMeta.RETIRED_TERMS`; phrases
  that call simulation support evidence (for example "robust evidence", "market
  evidence"); "statistically significant/reliable/robust/valid/sound"; a sentence
  tying 30 observations to a guarantee, reliability, validity or statistics; any
  claim that a figure "is verified" or is "externally verified"; "ranked first",
  "top-ranked", "number one" or "highest-ranked" said of a single named segment
  whose raw rank is not 1 (sentences about eligibility or the shortlist are
  exempt). The overclaim rules skip sentences containing a negation.
- **(2b) Selection mode and field names.** In an automatic run, describing the
  target as manually selected or chosen; in a manual run where the target differs
  from the candidate, calling the target the shortlist candidate; any context
  field name in prose (`rawRank`, `grossYieldPct`, `failsScreenOn` and others).
- **(3) Portfolio versus dataset.** A sentence that mentions the portfolio and
  quotes the dataset median gross yield; any "portfolio-wide … median".
- **(4) Markets.** Every segment mentioned, by ID or distinctive name, must exist
  and must appear in the context.
- **(5) Rank claims.** "rank N", "raw rank N", "eligible rank N" are attributed to
  the nearest preceding reference in the sentence — a segment name, an ID, or a
  role phrase such as "the selected target" or "the highest raw-score
  alternative", resolved through the context — and must match that segment's raw
  or eligible rank.
- **(6) Exclusion reasons.** In a sentence about exclusion: a segment that passes
  the screen must not be described as excluded by it; an observation-only reason
  for a grade-only failure (or the reverse) is rejected; a claim that segments were
  excluded for scoring higher is rejected when nothing scores above the target, and
  a segment said to score above the target must actually do so; a generic
  sample-size explanation is rejected when some higher raw-score segment failed on
  grade alone (a sentence describing the observation threshold itself is exempt).
- **(7a) Screen counts.** "N segments fail/pass the screen" must equal the
  context's counts.
- **(7) Figures.** Every number must equal a figure in the context at the same
  number of decimal places; a percentage can match only a percentage figure (or a
  weight quoted as a whole percentage). Not checked: four-digit numbers of the form
  19xx or 20xx (treated as years), whole numbers up to 12 without a percent sign,
  and numbers attached to letters, hyphens or a ₹ sign (segment IDs and money
  written as "₹… Cr").
- **(7b) Dominant factor.** For the Market Screening Analyst, `dominantFactor` must
  name exactly one factor and it must be the factor in
  `selectedTarget.largestContribution`.
- **(8) Orchestrator.** `recommendationSummary` names the selected target; no other
  segment is described as selected or recommended; `nextSteps` contains both
  "unverified" and "due diligence".

**Where it runs.** In `buildAgentCache.js` before anything is written; in
`agents.js` on every live or stored reply, with the result shown on each card ("✓
Consistency check passed …" or a list of the statements that do not match, with the
note that the figures above the text are authoritative); and in the test suite, on
every stored reply (T-160i1–i4) and on fixtures reproducing the defects (T-160m–s).

**Limits.** The checks are sentence-level patterns. The negation test is broad (it
treats any word beginning "un", such as "unverified", as a negation), so an
overclaim in a sentence that also says "unverified" is not flagged by the overclaim
rules. Money written after ₹ and small whole numbers are not compared with the
context. A live reply that fails is displayed with its warnings rather than
suppressed, and live mode has no revision loop; only the cache builder revises.

---

## 9. Pre-generated commentary and the revision loop (`buildAgentCache.js`)

**Scenarios.** One per weight preset, each computed by `AnalysisRun.compute()` at the
canonical defaults: sample portfolio, default investment (10% of portfolio value),
screen applied, automatic selection. The script refuses to run if a scenario is not
at those defaults or if two presets produce the same scenario key.

**Calls.** With the proxy running (`node server/server.js`, key in `server/.env`;
the script never reads the key), the chain runs in order for each preset:
`dataStatistical`, `marketScreening` (with the first output), `portfolioRisk` (with
both), then — only if the run's deterministic checks pass — `orchestrator` (with all
three and `deterministicValidation`).

**Revision.** Each reply is checked against the context it was given. A failing
reply is sent back with `context.revisionNotes`: one line per issue, giving the
field, the message and the offending text (rule J tells the model to correct every
one). At most two revisions are allowed (`MAX_REVISIONS = 2`, so at most three calls
per agent). If any reply still fails, or any call errors, the script exits with an
error and **nothing is written**: a partial or inconsistent cache would be worse than
none.

**Output.** `public/data/agent-cache.json`, format `scenarios-v2`, with the
methodology and context versions, the agent keys, the total API calls made
(`apiCalls`; a value above the number of replies means some replies needed
revision), and one entry per scenario key holding the label, preset, target, full
scenario descriptor and, per agent, the output, model, time, `checkedBy:
"agentOutputCheck.js"` and `checkPassed: true`. `--dry-run` builds every scenario,
context, key and deterministic check without calling the API or writing anything.

**Use.** When the page is not served by the proxy, "Show Pre-generated Analysis"
appears only if the current run's scenario key matches a stored key exactly; the
button then reads "Hide Pre-generated Analysis". The key covers the methodology
version, context version, dataset, portfolio, weights, investment amount, selected
target, selection mode, screen override, shortlist candidate and top-5 ranking
(`public/js/scenarioKey.js`). On a mismatch the page names the inputs that differ
(`ScenarioKey.diff()`) and shows no stored text. Stored replies are labelled as
stored text and checked again on display.

---

## 10. Defects found in the first cache build and the rule that now catches each

Defects 1–8 were found in the first pre-generated cache; 9–13 were found while
rebuilding the cache in the final correction pass. Numbers in the Checker rule
column are the rule numbers in §8.

| # | Defect | Context change | Prompt rule | Checker rule | Test |
|---|---|---|---|---|---|
| 1 | The median of segment gross yields across the dataset described as the portfolio's yield | Dataset figures moved to `marketDataset` with a scope saying "NOT the portfolio"; portfolio figures in `portfolio` | H | Portfolio versus dataset (3) | T-160c, T-160s |
| 2 | Two different segments each described as second place: one agent meant raw rank 2, another the next eligible segment | One `comparisonMarket` with an explicit `role`; `highestRawScoreMarket` and `nextEligibleCandidate` named separately | D | Retired terms (2) | T-160b, T-160n |
| 3 | A candidate at raw rank 8 (Aerocity, Income Focused) said to have "ranked first" | `rawRank` and `eligibleRank` on every segment | E | "Ranked first" (2); rank claims (5) | T-160m |
| 4 | Overstated meaning of 30 simulated observations | `simulationSupportScreen.nature` states the screen is a project convention | G | 30-observation and statistical overclaims (2) | — |
| 5 | Outlier claims not tied to anything in the context | `segmentMedianOutliers` and `knownSyntheticAnomalies`, each with its definition | Data & Statistical role text | No dedicated rule; caught indirectly by markets (4) and figures (7) | — |
| 6 | 7.00% written as 7% | Fixed-decimal strings | C | Figures at stated precision (7) | T-160d, T-160o |
| 7 | Grade-only failures blamed on sample size | `failsScreenOn` and `exclusionReasons` for every higher raw-score segment | F | Exclusion reasons (6) | T-160p |
| 8 | Simulation support treated as evidence | `externalCalibration` block; terminology definitions | D, G | Retired terms and evidence overclaims (2) | T-160q |
| 9 | An automatically selected target called manually selected | `selectionMode`, `selectedTarget.sameAsRecommendedCandidate` | L | Selection mode (2b) | — |
| 10 | Context field names written in prose | — | K | Field-name leakage (2b) | — |
| 11 | Wrong dominant factor | `largestContribution` on every segment; schema description of `dominantFactor` | Market Screening role text | Dominant factor (7b) | T-160r |
| 12 | Segments said to have been passed over for "higher raw scores" when the target is raw rank 1 | `higherRawScoreExclusions` is empty in that case | Market Screening role text; F | Exclusion reasons (6) | — |
| 13 | Wrong count of segments failing the screen | `segmentsPassing` and `segmentsTotal` | — | Screen counts (7a) | — |

A dash in the Test column means the rule is exercised by the stored replies
(T-160i1–i4) but has no dedicated failing fixture.

---

## 11. Vocabulary

The prompts, the context, the pages and this documentation use one glossary,
`AppMeta.TERMS`. The table below is generated from it.

<!-- canonical:BEGIN terminology -->
| Term | Meaning |
|---|---|
| Composite attractiveness score | The five-factor weighted score (rental yield, rental growth, diversification, demand, low market risk), 0–100. |
| Raw rank | Position among all segments by composite attractiveness score alone. |
| Highest raw-score market | Raw rank 1, whether or not it passes the simulation-support screen. |
| Simulation-support screen | At least 30 simulated observations and Assumption Support Grade C or better. A project governance convention for simulation precision. |
| Eligible rank | Position among the segments that pass the simulation-support screen. |
| Shortlist candidate | The highest-ranked candidate passing the simulation-support screen: an exploratory model output, not an investment recommendation. |
| Next eligible candidate | Eligible rank 2. |
| Selected target | The segment every page analyses. In automatic mode it is the shortlist candidate; in manual mode it is the user's choice. |
| Manually selected target | A selected target chosen by the user rather than by the screen. |
| Simulated market observations | Seeded draws from the project's generator. Not properties, listings or transactions. |
| Assumption Support Grade | The project's internal A–E classification of how a segment's assumptions were constructed and how wide a band was assumed around them. It is not an evidence grade: none of the benchmarks it refers to has been externally verified. |
| External calibration status | Verified, Partially supported or Unverified, from the source register only. |
| Known synthetic anomalies | Anomalies the generator inserted deliberately, recorded separately as ground truth. |
<!-- canonical:END terminology -->

---

## 12. Prompt version history

Lines in this section that name a retired design or term end with `[superseded]`:
they record what an earlier revision did, not what the code does now.

- v1–v5: single system prompt per agent plus a JSON context; rules added in turn against recalculated HHI, loose risk language, an invented city, a non-standard pass/fail format and fenced JSON; `responseMimeType` set to JSON. [superseded]
- v6: a model-run Validation agent made four pass/fail checks and its `validatedOk` flag gated the Orchestrator. [superseded]
- v7: six agents in sequence — Data Quality, Statistical Analysis, Market Screening, Diversification, Validation, Orchestrator. [superseded]
- v8: four agents; Data Quality and Statistical Analysis merged into one analyst, and the Validation agent replaced by deterministic checks in `validator.js`. The context (version 1) was assembled separately on each page and supplied dataset statistics under `portfolioStats`; the first pre-generated cache was built from it (§10). [superseded]
- Vocabulary used by earlier revisions and now retired (`AppMeta.RETIRED_TERMS`, rejected by the checker): "runner-up", "evidence floor", "meets the floor", "confidence grade", "strong evidence", "documented evidence", "planted anomalies", and a Central Limit Theorem justification of n = 30. [superseded]
- v9 (current, context version 2): context built by `fromRun()` from the shared analysis run with fixed-decimal figure strings; prose-only schemas passed as `responseSchema`; shared rules A–N; output checker; revision loop in the cache builder; cache rebuilt so that all four presets' replies pass the checker.

---

*NMIMS B.Sc. Finance | Business Analytics | Theme 4 | Academic demonstration only*

# AI Use Declaration — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**
**Author: Vishesh Jain**

Generative AI was used in two different ways in this project, and they are
declared separately:

- **Part A — inside the application.** Google Gemini is part of the artefact
  itself: four agents that interpret the deterministic analysis. This is the
  use of generative AI that Theme 4 asks for.
- **Part B — in building the project.** An AI coding assistant (Claude, by
  Anthropic) was used to write code, tests and documentation under the
  author's direction.

---

## Part A — Generative AI inside the application

### A1. What is used

| Item | Detail | Where |
|---|---|---|
| Provider | Google Gemini, through the Generative Language API (`generateContent`) | `server/server.js` |
| Caller | A local Node proxy only; the browser never calls Gemini directly | `server/server.js` |
| Model | Set by `GEMINI_MODEL` in `server/.env`, with `GEMINI_FALLBACK_MODELS` tried when a model's daily quota is exhausted. The template sets `gemini-3.1-flash-lite`; the stored commentary records the same model. | `server/.env.example`, `public/data/agent-cache.json` |
| Settings | Temperature 0.2; JSON output held to a per-agent `responseSchema` | `server/server.js` |
| Key | `GEMINI_API_KEY` in `server/.env`, which is git-ignored; never sent to the browser | `.gitignore` |

### A2. The four agents

The roster is defined once, in `public/js/appMeta.js` (`AGENTS`); the prompts
are in `server/server.js`.

| Order | Agent | What it interprets |
|---|---|---|
| 1 | Data & Statistical Analyst | The market-segment dataset: simulation support by city, dispersion, segment-median outliers, the known synthetic anomalies |
| 2 | Market Screening Analyst | Why the selected target scored as it did, its dominant factor, how it differs from the comparison segment, and why higher-scoring segments failed the simulation-support screen |
| 3 | Portfolio Risk & Scenario Analyst | The city and asset-type HHI change, the weighted-yield change and the scenario projections |
| — | *Deterministic input checks (code, no model call)* | Eight arithmetic checks in `public/js/validator.js` |
| 4 | Investment Orchestrator | A structured summary of the selected target, called only when all eight checks pass |

### A3. What the agents do not do

The agents never calculate, rank or validate. In particular, no language model:

- computes any score, rank, HHI, yield, projection or count;
- chooses the shortlist candidate or the selected target, or sets the weights;
- decides whether a segment passes the simulation-support screen or what its
  external calibration status is;
- validates the inputs (the eight checks are code);
- produces any figure shown as a headline on the agent cards or in the
  Decision Report — those are rendered from the deterministic analysis.

The shared rules in every prompt also forbid introducing a figure that is not
in the context, quoting one at a different precision, treating simulation
support as evidence, claiming that anything is verified, mixing market-dataset
figures with portfolio figures, and presenting the output as an investment
recommendation.

### A4. How the output is constrained and checked

1. **Context.** Each agent receives a context built deterministically from the
   shared analysis run (`public/js/agentContext.js`, `fromRun()`), with explicit
   fields for raw rank, eligible rank, the highest raw-score market, the
   shortlist candidate, the selected target, selection mode, screen result,
   simulated observations, Assumption Support Grade, external calibration and
   each segment's exact exclusion reasons. Figures are fixed-decimal strings so
   their display precision travels with them.
2. **Schema.** Each agent's reply must match a JSON schema of prose fields only,
   with no number fields (`public/js/agentOutputCheck.js`, `SCHEMAS`).
3. **Check.** `AgentOutputCheck.check()` compares every reply with the context
   it was given: markets, ranks, figures at their stated precision, counts,
   exclusion reasons, the dominant factor, retired terminology, claims of
   evidence or verification, and — for the Orchestrator — that it names the
   selected target and states that external calibration remains unverified and
   due diligence is required. The result is shown on each card. A live reply
   that fails is still displayed, with its problems listed.
4. **Cache gate.** Pre-generated commentary is built by
   `data-pipeline/scripts/buildAgentCache.js`. A failing reply is returned to
   the model with its specific problems, up to two revisions; nothing is
   written unless every reply for all four presets passes.

The check can prove certain kinds of statement false; it cannot prove the prose
true. The commentary is interpretation, not verified analysis.

### A5. Provenance

Every agent card says where its text came from: a live Gemini call made for this
exact run, stored commentary whose scenario key matches this run exactly, or no
commentary (deterministic figures only). Stored commentary exists only for the
four presets at their defaults. The Decision Report prints commentary only for
the run it was produced for.

---

## Part B — Generative AI used in building the project

### B1. Tool

Claude (Anthropic) was used as an AI coding and writing assistant. Some
documents in `data-pipeline/docs/` record the model or interface used for a
particular pass — Claude Sonnet 4.6 in `SCORING_AUDIT.md` and
`CURRENT_DATA_AUDIT.md`, and Claude working through Cowork in
`EVIDENCE_UPGRADE_REPORT.md` and `FINAL_VALIDATION_SUMMARY.md`. The model and
interface were not recorded for every session, so this declaration does not
claim a single version for the whole project.

### B2. What it was used for

Under the author's direction, AI assistance was used for:

- **Code:** the application modules in `public/js/`, the proxy
  `server/server.js`, and the data-pipeline scripts in
  `data-pipeline/scripts/` (generation, derivation, statistics, metadata, the
  agent cache and the analytics audit);
- **Tests:** `tests/reit-tests.js`, `data-pipeline/tests/dataPipeline.test.js`,
  `tests/browserAcceptance.js` and the CSV fixtures in `tests/fixtures/`;
- **Documentation:** the README, the documents in `docs/` and
  `data-pipeline/docs/`, including this declaration;
- **Review and audit passes:** including the audit documents in
  `data-pipeline/docs/` that name Claude as their auditor or author;
- **Prompt design** for the four Gemini agents.

The commit history does not mark which changes were AI-assisted, so this
declaration covers the repository as a whole.

### B3. What it was not used for

- No AI tool supplied real market data. The dataset is synthetic and produced
  by seeded scripts; regenerating it from the seed reproduces it byte for byte,
  and CI checks this.
- No language model computes, ranks or validates anything at runtime (Part A).

### B4. How AI-assisted work was checked

AI-assisted code and text were not taken on trust. The application and pipeline
test suites, an independent recomputation of every headline figure
(`data-pipeline/scripts/auditAnalytics.js`), the System Check in the Data
Centre, the browser acceptance script, and generated figures in the
documentation (`docs/CANONICAL_FACTS.md` and the blocks filled from
`public/data/meta.json`) exist so that errors are caught by checks rather than
by reading. These reduce the risk of error in AI-assisted work; they do not
remove it.

### B5. Responsibility

The author directed the work, reviewed what was produced, and is responsible
for the submission in full, including any error that remains in AI-assisted
code or text.

---

## History (superseded)

Earlier versions of this declaration were corrected as follows.

- They named a different Gemini model for the runtime agents. [superseded]
- They described more runtime agents than the current four, including a
  separate data-quality agent and a validation agent; the data agents were
  merged and validation became deterministic code. [superseded]
- They stated an application test count and System Check range that no longer
  apply; the current figures are reported by the latest test run and the Data
  Centre. [superseded]
- They named a single Claude model version for all development work; the
  repository records a model or interface only for some passes (B1). [superseded]

---

*NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI | Vishesh Jain | Academic demonstration only; not investment advice.*

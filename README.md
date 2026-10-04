# REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**
**Author: Vishesh Jain**

REIT Target AI is an academic decision-support prototype. For a sample REIT
portfolio it ranks candidate market segments for a new investment, tests whether
each segment's simulated figures are precise enough to shortlist, measures how
the investment would change portfolio concentration, projects the result under
three scenarios, and asks four Gemini agents to explain the outcome in plain
language. Every calculation is deterministic JavaScript. The language model only
interprets figures that have already been computed, and its replies are checked
against those figures before they are shown.

> **Synthetic data only.** Every holding, market segment, rent, valuation and
> simulated observation in this project was generated for academic
> demonstration. Nothing describes a real property, listing, transaction or
> market, no figure has been externally verified, and nothing here is
> investment advice.

- **Live site:** https://visheshjain0603-design.github.io/reit-target-ai/
- **Repository:** https://github.com/visheshjain0603-design/reit-target-ai

## Key figures

Generated from `public/data/` by `data-pipeline/scripts/buildMeta.js` — do not
edit by hand. The full set is in [docs/CANONICAL_FACTS.md](docs/CANONICAL_FACTS.md).

<!-- canonical:BEGIN key-figures -->
| Fact | Value |
|---|---|
| Market segments | 50 across 8 cities and 3 property types |
| Simulated market observations | 2,156 (26–76 per segment) |
| Sample portfolio | 10 holdings, ₹500.00 Cr value, ₹33.275 Cr annual rent, 6.655% weighted gross yield |
| Default investment | ₹50.00 Cr (10% of the sample portfolio) |
| Gemini agents | 4 (Data & Statistical Analyst; Market Screening Analyst; Portfolio Risk & Scenario Analyst; Investment Orchestrator) |
| Weight presets | 4 (Balanced, Income Focused, Growth Focused, Diversification Focused) |
| Simulation-support screen | at least 30 simulated observations and Assumption Support Grade C or better — 25 of 50 segments pass |
| External calibration | 0 of 12 cited external sources verified; all 50 segments Unverified |
| Known synthetic anomalies | 24 (1.113% of observations) |
| Generator / seed / data as of | 2.0.0 / 20260919 / 2026-09-19 |
| Institution and author | NMIMS B.Sc. Finance, Business Analytics — Vishesh Jain |
<!-- canonical:END key-figures -->

## Three separate questions

The application keeps three concepts apart and never lets one stand in for
another (`public/js/appMeta.js`, `public/js/governance.js`):

1. **Composite attractiveness score.** How attractive a segment looks on five
   normalised factors — rental yield, rental growth, diversification benefit,
   demand and low market risk — weighted by one of four presets (Balanced,
   Income Focused, Growth Focused, Diversification Focused) or by custom weights
   that sum to 100%. Computed by `scoringEngine.js`. Nothing else changes a
   score or a rank.
2. **Simulation support.** How many simulated observations stand behind a
   segment's medians, how wide their P10–P90 spread is, and the project's
   internal **Assumption Support Grade** (A–E), which records how the segment's
   assumptions were built and how wide a band was assumed around them. It is not
   an evidence grade. The **simulation-support screen** requires at least 30
   simulated observations and grade C or better — a transparent project
   governance convention for simulation precision, not a regulatory or universal
   statistical threshold. More draws narrow the estimate around the *assumed*
   distribution; they are not market evidence.
3. **External calibration.** Verified, Partially supported or Unverified,
   derived only from the source register (`data-pipeline/source_register.csv`).
   No cited document has been located, so every segment is Unverified — see
   [docs/SOURCE_VERIFICATION_REPORT.md](docs/SOURCE_VERIFICATION_REPORT.md).

The screen's output is the **shortlist candidate**: the highest-ranked candidate
passing the simulation-support screen. It is an exploratory model output, not an
investment recommendation, and it always carries the same caveat: "Exploratory
shortlist only. External calibration remains unverified — proceed to further
evidence collection and due diligence before any real decision." The highest
raw-score market is always shown beside it with the reason it failed the screen.
A user may ignore the screen; that choice is explicit and recorded in the report.

<!-- canonical:BEGIN screen-and-calibration -->
- **Composite attractiveness score** — the five weighted factors. Never changed by the screen.
- **Simulation support** — simulated observations behind a segment's medians, their P10–P90 spread, and the project's own Assumption Support Grade (A–E). A transparent project governance convention for simulation precision, not a regulatory or universal statistical threshold. Thirty draws keeps the P10–P90 spread of a segment's simulated medians reasonably narrow; grade C or better excludes segments whose assumptions the project itself classed as interpolated or placeholder. Passing the screen says nothing about real-market accuracy.
- **Simulation-support screen** — at least 30 simulated observations and Assumption Support Grade C or better. 25 of 50 segments pass.
- **External calibration** — from the source register only: 0 of 12 cited external sources verified; 0 partially supported. A segment is Verified only when every external source it cites is verified. Every segment is Unverified.
- **Wording** — the model output is a *shortlist candidate*: "Exploratory shortlist only. External calibration remains unverified — proceed to further evidence collection and due diligence before any real decision."
<!-- canonical:END screen-and-calibration -->

## One shared analysis run

Every page renders a single object: the analysis run computed by
`public/js/analysisRun.js`. It is recomputed deterministically from the persisted
inputs — preset, exact weights, investment amount (by default 10% of the active
portfolio's value), whether the screen is ignored, selection mode, manual target
and display filters — together with the active portfolio (the sample, or the
user's custom portfolio) and the data files. The run holds the full ranking (raw
rank, eligible rank, simulation support and external calibration for every
segment), the highest raw-score market, the shortlist candidate, the selected
target, HHI before and after, the scenario projections, a sensitivity table for
all four presets, the deterministic validation, the agent context and the
scenario key. Any input change goes through `AnalysisRun.update()`, which saves
the inputs (never the results), recomputes, and notifies every subscribed page in
the same tick. In **automatic** mode the selected target is the shortlist
candidate and follows every change. In **manual** mode the user's pick is kept,
labelled "Manually selected target" on every page, flagged when it differs from
the current candidate, and undone with "Return to automatic recommendation".
Reset Demo on the Overview asks for confirmation, restores the defaults and
recomputes at once. [docs/architecture.md](docs/architecture.md) explains the
design and the cross-page defect it replaced.

## Pages

1. **Overview** (`#overview`) — what the system is, the current analysis, its comparison with the highest raw-score alternative or next eligible candidate, what it must not be used for, and Reset Demo.
2. **Portfolio** (`#portfolio`) — the sample portfolio, or a custom portfolio the user builds (add, edit, delete).
3. **Market Screener** (`#screener`) — presets, weight sliders, investment amount, screen override, manual selection, filters and each segment's simulated distribution.
4. **Diversification** (`#diversification`) — HHI before and after for the selected target, raw-score and eligible-shortlist tables, sensitivity across all four presets (raw leader and candidate), projections.
5. **Agent Output** (`#agents`) — the four agents, the deterministic checks that gate the Orchestrator, and the consistency check on every reply.
6. **Data Centre** (`#datacentre`) — five data levels (portfolio holdings; market segment aggregates; simulated observation dataset; source/calibration register; data quality and cleaning results, with CSV import) and the System Check.
7. **Statistics** (`#statsdash`) — descriptive statistics, sample adequacy, stratified correlation and Simpson's paradox, a limited regression, detection of the known synthetic anomalies, limitations and key findings.
8. **Decision Report** (`#report`) — a printable record of the whole run; agent commentary is included only when it was produced for this exact run.

## Agents and the deterministic gate

```
Data & Statistical Analyst → Market Screening Analyst → Portfolio Risk & Scenario Analyst
    → [validator.js: eight deterministic checks] → Investment Orchestrator
```

The agents never calculate, rank or validate. Each receives a context built
deterministically by `AgentContext.fromRun()` (`public/js/agentContext.js`) with
explicit fields — raw rank, eligible rank, highest raw-score market, shortlist
candidate, selected target, selection mode, screen result and exact exclusion
reasons, simulated observations, support grade, external calibration — and
every figure supplied as a fixed-decimal string, so it is quoted at exactly the
precision the interface shows. Each must reply in a strict JSON schema of prose fields only
(`public/js/agentOutputCheck.js`), which the proxy passes to Gemini as
`responseSchema`. `validator.js` runs in code before the Orchestrator and the
Orchestrator is called only when every check passes. Every reply is then checked
by `AgentOutputCheck.check()`: markets exist and are in the context, ranks,
figures and exclusion reasons match, the dominant factor is the largest
contribution, retired terms, evidence overclaims and field-name leakage are
rejected, and the Orchestrator must name the selected target and state that
calibration is unverified and due diligence is required. Headline figures on
each card come from the context, never from the prose, and each card shows its
check result. Prompts are in `server/server.js`; see
[docs/prompt-design.md](docs/prompt-design.md).

## Running it

Requirements: Node.js 18 or later (no npm packages) and a modern browser. A
Gemini API key is needed only for live mode.

```bash
git clone https://github.com/visheshjain0603-design/reit-target-ai.git
cd reit-target-ai
```

### Static mode (no server, no key)

Open the live site, or serve `public/` with any static file server, for example
`python3 -m http.server 8080 --directory public`. Everything deterministic works.
On Agent Output the proxy is not contacted: **Show Pre-generated Analysis**
serves stored commentary from `public/data/agent-cache.json` only when the
current run's scenario key matches a stored scenario exactly (each preset at its
defaults), and the button then reads **Hide Pre-generated Analysis**. For any
other configuration the page lists the inputs that differ and shows no
commentary.

### Live mode (local proxy with a Gemini key)

```bash
cp server/.env.example server/.env   # then set GEMINI_API_KEY in server/.env
node server/server.js                 # then open http://localhost:3001
```

`server/.env` is git-ignored, along with every `server/.env.*` variant. Never
commit a real key; if one is ever pushed, treat it as compromised and rotate it.
Live calls are made only when the page is served by the proxy at
http://localhost:3001. The key stays on the server; `/api/health` reports only
whether one is configured.

## Tests and rebuilding

```bash
node tests/reit-tests.js                        # application suite (Node, no browser)
node data-pipeline/tests/dataPipeline.test.js   # data pipeline suite
node data-pipeline/scripts/auditAnalytics.js    # independent re-derivation; exit code 0 when it agrees
```

Each suite prints its own count; see the latest run and
[docs/test-report.md](docs/test-report.md). CI (`.github/workflows/tests.yml`)
runs the two Node suites and checks that regenerating the observations from the
fixed seed reproduces the committed data byte for byte. Browser acceptance
checks that drive all eight routes through their own controls are in
`tests/browserAcceptance.js` (run inside the application; instructions in its
header), with a Playwright smoke test in `tests/browserSmokeTest.js`; neither
runs in CI. `.github/workflows/pages.yml` publishes `public/` to GitHub Pages.
Documents carry generated blocks and the test suite fails if a block, a parsed
figure or a retired term is out of date.

Rebuild the data (seeded and reproducible):

```bash
node data-pipeline/scripts/generateObservations.js          # simulated observations + known synthetic anomalies
node data-pipeline/scripts/deriveMarkets.js                 # segment medians -> markets.json, observations.json
node data-pipeline/scripts/computeStatistics.js             # statistics.json
node data-pipeline/scripts/buildObservationDistribution.js  # observation-distribution.json
node data-pipeline/scripts/buildMeta.js                     # meta.json, CANONICAL_FACTS.md, generated blocks
```

Rebuild the pre-generated agent commentary (needs the proxy and a key;
`--dry-run` builds every scenario and calls nothing):

```bash
node server/server.js &
node data-pipeline/scripts/buildAgentCache.js
```

The builder computes each preset's run with the same `analysisRun.js`, checks
every reply with `AgentOutputCheck.check()`, sends a failing reply back with the
specific problems (up to two revisions), and writes nothing unless every reply
for every preset passes.

## Documentation

Code lives in `public/` (the browser application: `js/`, `data/`, `index.html`),
`server/` (the local proxy), `data-pipeline/` (generator and build scripts) and
`tests/`. The generated blocks in this README and the documents listed in
`data-pipeline/scripts/canonicalBlocks.js` are refilled by `buildMeta.js`.

- [docs/CANONICAL_FACTS.md](docs/CANONICAL_FACTS.md) — generated figures, preset results and terminology
- [docs/architecture.md](docs/architecture.md) — system design, the shared analysis run, the agent layer
- [docs/data-documentation.md](docs/data-documentation.md) — the synthetic dataset and its schema
- [docs/SOURCE_VERIFICATION_REPORT.md](docs/SOURCE_VERIFICATION_REPORT.md) — what was checked against external sources, and what was not found
- [docs/limitations.md](docs/limitations.md) — methodological and practical limitations
- [docs/prompt-design.md](docs/prompt-design.md) — agent prompts, schemas and the output check
- [docs/test-report.md](docs/test-report.md) — test suites and results
- [docs/project-report-draft.md](docs/project-report-draft.md) — the academic report
- [docs/viva-guide.md](docs/viva-guide.md) — formula reference and anticipated questions
- [docs/process-log.md](docs/process-log.md) — development decisions
- [docs/ai-use-declaration.md](docs/ai-use-declaration.md) — how AI tools were used
- [docs/verification-evidence.md](docs/verification-evidence.md) — record of the reliability pass and institution-name migration
- [data-pipeline/docs/](data-pipeline/docs/) — data methodology, data dictionary and the analytics audit

## Limitations

The data is synthetic, external calibration is Unverified for every segment, the
simulation-support screen is a project convention, yields are gross, projections
use flat rates, and the agents interpret but do not verify. The full list is in
[docs/limitations.md](docs/limitations.md); the Agent Output page also lists the
fixed limitations stated by `validator.js`. Built for academic assessment at
NMIMS; no part of it is investment advice or a regulated financial service.

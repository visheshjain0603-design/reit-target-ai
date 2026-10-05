# REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**
**Author: Vishesh Jain**

REIT Target AI is an academic decision-support prototype. For a REIT portfolio it
ranks candidate market segments for a new investment, shows how the investment
would change the portfolio's concentration, projects the result under three
scenarios, and asks four Gemini agents to explain the outcome in plain language.
Every calculation is deterministic JavaScript; the language model only
interprets figures that have already been computed, and its replies are checked
against those figures before they are shown.

> **Synthetic data only.** Every holding, market segment, rent, valuation and
> simulated observation was generated for academic demonstration. Nothing
> describes a real property, listing, transaction or market, no figure has been
> externally verified, and nothing here is investment advice.

- **Live site:** https://visheshjain0603-design.github.io/reit-target-ai/
- **Repository:** https://github.com/visheshjain0603-design/reit-target-ai
- **Final report:** [docs/project-report.md](docs/project-report.md) · **Live-demo runbook:** [docs/LIVE_DEMO_RUNBOOK.md](docs/LIVE_DEMO_RUNBOOK.md)

## Who it is for

<!-- canonical:BEGIN customer-and-use-cases -->
**Primary user.** REIT investment analysts and acquisition committees evaluating where a proposed new investment should be allocated.

**Business problem.** A REIT must balance income, growth, demand, risk and portfolio diversification when choosing its next target market, while understanding the reliability and limitations of the supporting data.

**Core use cases** (and the pages where each is carried out):

1. Diagnose geographic and asset-type concentration in the existing portfolio. *(Portfolio, Diversification)*
2. Rank target markets using adjustable business priorities. *(Market Screener)*
3. Compare the highest raw-score market with the highest-ranked market passing the simulation-support screen. *(Market Screener, Overview)*
4. Simulate yield, concentration and scenario effects of a proposed investment. *(Diversification)*
5. Produce deterministic validation and Gemini-assisted interpretation. *(Agent Output)*
6. Generate a printable decision report for management discussion. *(Decision Report)*
<!-- canonical:END customer-and-use-cases -->

## Quick start

**Public site — nothing to install.** Open the live site. Every calculation,
page and report works. The public site does not offer the Agent Output page or
any AI commentary: it cannot hold an API key, so the Gemini agents run only on a
local copy (below).

**Locally.** Requires Node.js 18 or later (no npm packages) and a modern browser.

```bash
git clone https://github.com/visheshjain0603-design/reit-target-ai.git
cd reit-target-ai
python3 -m http.server 8080 --directory public   # then open http://localhost:8080
```

**Live Gemini mode.** Needs a Gemini API key, kept on your machine only.

```bash
cp server/.env.example server/.env   # then set GEMINI_API_KEY=... in server/.env
node server/server.js                 # then open http://localhost:3001
```

`server/.env` and every `server/.env.*` variant are git-ignored; the key is read
only by the local proxy, which sends it to Google's Gemini endpoint to
authenticate each call; it never reaches the browser (`/api/health` reports only
whether a key is configured). The proxy listens on 127.0.0.1 only, so other
devices cannot use it unless you set `REIT_HOST=0.0.0.0` on purpose. Never commit
a key; if one is ever pushed, treat it as compromised and rotate it. Live calls
are made only when the page is served by the proxy at `http://localhost:3001`. If
a live call fails (quota, network), the page says fresh generation was
unavailable; it never substitutes stored commentary. A reply that fails the
consistency check is sent back once, and withheld if it fails again.

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

## User guide

The pages follow the order of the analysis. Every page shows the **same shared
analysis run**; a change made anywhere appears everywhere at once. The sidebar
always names the current analysis (target, preset, amount, selection mode).

### Overview

What the system is, who it is for, the current analysis on the dark *candidate
plate* — the selected target with its composite score, simulation support and
external calibration kept in separate cells — and a comparison with the highest
raw-score alternative or the next eligible candidate. It ends with the stated
limitations and **Reset demo…**.

**Reset the demo.** Press **Reset demo…**, read the panel, press **Reset to
defaults** (Cancel or Escape changes nothing). It restores the sample portfolio,
the Balanced preset and its weights, ₹50.00 Cr, the simulation-support screen
applied, automatic selection and no filters. A custom portfolio is kept but made
inactive; nothing outside this application's own browser storage is touched.

### Portfolio — and how to create a custom portfolio

Shows the holdings, their value, rent, yield, occupancy and lease expiry, and
concentration by city and asset type with HHI.

1. Press **Custom Portfolio** at the top of the page.
2. Press **Start Blank — Add First Asset**, or **Copy from Sample Portfolio** to edit a copy.
3. Fill the form — Asset ID, Asset Name, City, Locality, Property Type, Property
   Value (₹ Cr), Annual Rent (₹ Cr), Total Area and Occupied Area (sq ft), Lease
   Expiry (YYYY-MM-DD), Tenant Sector — and press **Add Asset**. Use **+ Add
   Asset**, **Edit** and **Delete** to change it.
4. While the custom portfolio is active and non-empty it replaces the sample in
   every calculation on every page; the default investment becomes 10% of its
   value. Press **Sample Portfolio** to switch back. The custom portfolio is
   stored only in this browser.

### Market Screener — weights, investment, ranks and the screen

- **Investment amount.** Type a positive amount in ₹ Cr and press Enter or leave
  the field.
- **Weights.** Press a preset (Balanced, Income Focused, Growth Focused,
  Diversification Focused), or move the five sliders (rental yield, rental
  growth, diversification, demand strength, low market risk). Custom weights are
  applied only when they total 100%; until then the total is shown in red and
  every page keeps the last valid analysis.
- **Raw rank** is a segment's position by composite attractiveness score among
  all segments. **Eligible rank** is its position among the segments that pass
  the **simulation-support screen** (at least 30 simulated observations and
  Assumption Support Grade C or better). The **shortlist candidate** is eligible
  rank 1. When the highest raw-score market fails the screen, the panel says
  exactly why.
- **Screen override.** Tick **Ignore the simulation-support screen** to make the
  highest raw-score market the candidate; the choice is recorded in the Decision
  Report. Untick to restore the screen.
- **Manual selection.** Press **Select** on any row to make it the selected
  target. Every page labels it "Manually selected target" and warns when it
  differs from the shortlist candidate; **Return to automatic recommendation**
  undoes it.
- **Details and filters.** **Show** on a row opens the score breakdown, the HHI
  impact, the P10–P90 spread and the simulated distribution. **Filters** hide
  rows from view; they never change a score, rank or the target.

### Diversification

City and asset-type HHI before and after investing in the selected target, the
weighted-yield change, the raw-score leaders beside the eligible shortlist,
sensitivity across all four presets, and 1-, 3- and 5-year scenario projections.
HHI bands (below 0.15 diversified, 0.15–0.25 moderate, above 0.25 concentrated)
are descriptive, not regulatory.

### Statistical Analysis

Key findings from the simulated observations: distributions, correlation pooled
and within each property type (Simpson's paradox), a limited regression, and how
well four detectors find the known synthetic anomalies (precision, recall, F1).

### Agent Output

The deterministic context the agents receive, the activity trail, the eight
deterministic input checks that gate the final agent, and the four agents'
commentary, each card showing its provenance and the result of the consistency
check. **This page appears only on a local copy, not on the public site.** In
live mode (`node server/server.js`, then http://localhost:3001) press **Run Agent
Analysis**: it works for any weights, amount, portfolio and target. On a local
static server (no key) press **Show Pre-generated Analysis**; it is available
only when the current run exactly matches a stored scenario (any preset at its
defaults), and otherwise the page names the inputs that differ. Add
`?publicSite=1` to the address to see the page as the public site shows it.

### Data Centre — and the System Check

The data in five labelled levels (portfolio holdings, segment aggregates,
simulated observations, the source register, data quality), CSV import with a
downloadable template, and **Run System Check**: ten checks of the production
engines against the current data, each showing what it expected and what it
got. Running it never changes the analysis.

The CSV import is a **cleaning demonstration**: it never replaces the market
segments or changes the analysis. Area units are never guessed from the numbers:
`areaSqFt` is square feet (a 300 sq ft shop stays 300 sq ft), `areaSqM` is square
metres converted once (1 m² = 10.7639 sq ft), and a generic `area` column needs an
`areaUnit` column (`sqft` or `sqm`) or the unit chosen in **Unit of a generic
"area" column**. A row with a missing or conflicting unit is rejected with the
reason. To replace the analysis dataset itself, use the data pipeline
([docs/data-documentation.md](docs/data-documentation.md), Section 9).

### Decision Report

A printable record of the current run: summary, raw-score and eligible-shortlist
tables, concentration, projections, the deterministic checks, the limitations
and — only when it was produced for this exact run — agent commentary with its
provenance. Press **Print / Save as PDF**.

## How the analysis works

The application keeps three questions apart and never lets one stand in for another:

<!-- canonical:BEGIN screen-and-calibration -->
- **Composite attractiveness score** — the five weighted factors. Never changed by the screen.
- **Simulation support** — simulated observations behind a segment's medians, their P10–P90 spread, and the project's own Assumption Support Grade (A–E). A transparent project convention chosen by the authors, not a regulatory or universal statistical threshold. More draws make a segment's estimated median more precise; they do not narrow the P10–P90 spread of its simulated observations. Thirty is a chosen minimum, not a proven sufficient sample. Grade C or better excludes the assumption sets the authors graded D (estimated from comparable segments) or E (placeholder). Passing the screen says nothing about real-market accuracy.
- **Simulation-support screen** — at least 30 simulated observations and Assumption Support Grade C or better. 25 of 50 segments pass.
- **External calibration** — from the source register only: 0 of 12 cited external sources verified; 0 partially supported. A segment is Verified only when every external source it cites is verified. Every segment is Unverified.
- **Wording** — the model output is a *shortlist candidate*: "Exploratory shortlist only. External calibration remains unverified — proceed to further evidence collection and due diligence before any real decision."
<!-- canonical:END screen-and-calibration -->

All of it is computed once, in `public/js/analysisRun.js`, from the stored
inputs (preset, weights, amount, screen setting, selection mode, manual target,
filters), the active portfolio and the data files; only the inputs are stored.
Four agents then interpret the run:

```
Data & Statistical Analyst → Market Screening Analyst → Portfolio Risk & Scenario Analyst
    → [validator.js: eight deterministic checks] → Investment Orchestrator
```

The agents never calculate, rank or validate. Each receives a context built
deterministically from the run, must reply in a prose-only JSON schema, and
every reply is checked by `AgentOutputCheck.check()` against that context. See
[docs/architecture.md](docs/architecture.md) and
[docs/prompt-design.md](docs/prompt-design.md).

## Tests

```bash
node tests/reit-tests.js                        # application suite
node data-pipeline/tests/dataPipeline.test.js   # data pipeline suite
node data-pipeline/scripts/auditAnalytics.js    # independent re-derivation; exit code 0 when it agrees
```

Browser acceptance checks run inside the application (instructions in the header
of `tests/browserAcceptance.js`); the latest results are in
`tests/acceptance-results.json`. CI (`.github/workflows/tests.yml`) runs the Node
suites and checks that regenerating the data from its seed reproduces the
committed file byte for byte. Documents carry generated blocks, and the suite
fails if a block, a stated figure or a retired term is out of date. Counts and a
use-case test table are in [docs/test-report.md](docs/test-report.md).

Rebuild the data (seeded and reproducible):

```bash
node data-pipeline/scripts/generateObservations.js
node data-pipeline/scripts/deriveMarkets.js
node data-pipeline/scripts/computeStatistics.js
node data-pipeline/scripts/buildObservationDistribution.js
node data-pipeline/scripts/buildMeta.js
node data-pipeline/scripts/screenSensitivity.js   # shortlist under other screen thresholds; median precision
node data-pipeline/scripts/runbookExpected.js     # every figure the demo runbook quotes, at full precision
```

`data-pipeline/scripts/reconcileProvenance.js` (already applied) keeps each
segment's provenance notes consistent with its `sourceIds`; running it again
changes nothing.

## Theme 4 deliverables

| Deliverable | Where |
|---|---|
| Working prototype and live demo | [Live site](https://visheshjain0603-design.github.io/reit-target-ai/); [docs/LIVE_DEMO_RUNBOOK.md](docs/LIVE_DEMO_RUNBOOK.md) |
| README / user manual | This file |
| Final academic report | [docs/project-report.md](docs/project-report.md) |
| Architecture diagram | [docs/architecture.md](docs/architecture.md) |
| Test report with use-case results and screenshots | [docs/test-report.md](docs/test-report.md), [docs/screenshots/](docs/screenshots/), `tests/acceptance-results.json` |
| Limitations | [docs/limitations.md](docs/limitations.md) |
| AI-use declaration | [docs/ai-use-declaration.md](docs/ai-use-declaration.md) |
| Source and data documentation | [docs/data-documentation.md](docs/data-documentation.md), [docs/SOURCE_VERIFICATION_REPORT.md](docs/SOURCE_VERIFICATION_REPORT.md), `data-pipeline/benchmark_checks.csv`, [docs/SCREEN_SENSITIVITY.md](docs/SCREEN_SENSITIVITY.md), [docs/CANONICAL_FACTS.md](docs/CANONICAL_FACTS.md), [data-pipeline/docs/](data-pipeline/docs/) |
| Process log | [docs/process-log.md](docs/process-log.md) |
| Prompt design | [docs/prompt-design.md](docs/prompt-design.md) |
| Viva preparation | [docs/viva-guide.md](docs/viva-guide.md) |
| CSV data and scripts | `data-pipeline/*.csv`, `data-pipeline/generated/`, `data-pipeline/scripts/`, `public/data/` |

[docs/verification-evidence.md](docs/verification-evidence.md) records an earlier
reliability pass and the institution-name migration; [HANDOFF.md](HANDOFF.md)
records the latest state of the work.

## Viva demonstration

Use the static site unless live agents are needed. Press **Reset demo…** first.
Then: Overview (customer and the candidate) → Portfolio (concentration) → Market
Screener (switch preset and change the amount; raw rank versus eligible rank) →
Diversification (both HHI dimensions; the yield–diversification trade-off) →
Statistical Analysis (Simpson's paradox) → Agent Output (commentary and checks)
→ Data Centre (System Check) → Decision Report → Reset demo. The full timed
sequence, three evaluator exercises with expected results, and recovery steps
are in [docs/LIVE_DEMO_RUNBOOK.md](docs/LIVE_DEMO_RUNBOOK.md); likely questions
are in [docs/viva-guide.md](docs/viva-guide.md).

## Limitations

The data is synthetic; external calibration is Unverified for every segment; the
simulation-support screen is a project convention; yields are gross;
projections use flat rates and are not forecasts; and the agents interpret but
do not verify. The full list — the same one the application shows — is in
[docs/limitations.md](docs/limitations.md). Built for academic assessment; no
part of it is investment advice or a regulated financial service.

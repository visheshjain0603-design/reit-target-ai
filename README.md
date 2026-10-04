# REIT Target AI — Academic Demo

**NMIMS B.Sc. Finance | Business Analytics Project Theme 4**
**Theme 4: Building Agents and Artifacts using Generative AI**

> **⚠ Academic Demo — Synthetic Data Only**
> All portfolio holdings, market segments, rental figures, and valuations are
> entirely fabricated for academic illustration. This project is not connected
> to any live database, real fund, or regulated financial service.

**Every headline figure in this project lives in one place:
[`docs/CANONICAL_FACTS.md`](docs/CANONICAL_FACTS.md).** That file is generated
from the data by `data-pipeline/scripts/buildMeta.js`, and the test suite fails
if any document in the repository contradicts it. Figures are not restated
here, because an earlier revision restated them and the copies drifted apart —
this README claimed 18 market segments while the dataset held 50. [superseded]

---

## Quick start

### Requirements
- Node.js ≥ 16 (no npm packages needed)
- Modern web browser (Chrome, Firefox, Safari, Edge)
- A free [Google AI Studio](https://aistudio.google.com/app/apikey) API key *(optional — all deterministic features work without it)*

### 1. Clone / download

```bash
git clone <repo-url>
cd reit-target-demo
```

### 2. Configure the Gemini API key (optional)

```bash
cp server/.env.example server/.env
# Edit server/.env and replace the placeholder with your real key:
#   GEMINI_API_KEY=AIza...
```

### 3. Start the local server

```bash
node server/server.js
```

Server starts at **http://localhost:3001**. Open that URL in your browser.

### 4. Run the automated test suite

```bash
node tests/reit-tests.js
```

Every assertion should pass, and the run prints its own count rather than this
file quoting one. There is a second suite for the data pipeline:

```bash
node data-pipeline/tests/dataPipeline.test.js
```

---

## Project structure

```
reit-target-demo/
├── public/
│   ├── index.html              # Single-page app shell (hash routing)
│   ├── css/
│   │   ├── styles.css          # Shared design tokens
│   │   ├── m-app.css           # App layout primitives
│   │   └── reit-components.css # REIT-specific component styles
│   ├── data/
│   │   ├── portfolio.json      # Synthetic REIT holdings
│   │   ├── markets.json        # Synthetic market segments, DERIVED from observations.json
│   │   ├── observations.json   # Observation-level simulated records (the source of truth)
│   │   ├── statistics.json     # Build-time statistics for the Statistics page
│   │   ├── observation-distribution.json  # Per-segment distribution summaries
│   │   ├── meta.json           # GENERATED canonical counts and labels
│   │   ├── agent-cache.json    # Pre-generated agent replies, scenario-keyed
│   │   └── markets.csv         # CSV form, for import testing
│   └── js/
│       ├── appMeta.js          # CANONICAL counts and labels — derived, not typed
│       ├── istTime.js          # IST date/time helpers (no Date() risk)
│       ├── uiHelpers.js        # Toast, formatINRCr, DOM helpers, hash router
│       ├── hhi.js              # HHI analytics engine (pure, no DOM)
│       ├── scoringEngine.js    # Market scoring & ranking engine (pure, no DOM)
│       ├── governance.js       # Evidence eligibility — a SEPARATE axis from score
│       ├── filters.js          # Screener filter model (pure, unit-tested)
│       ├── validator.js        # Deterministic input checks (replaced an agent)
│       ├── scenarioKey.js      # Canonical scenario identity for the agent cache
│       ├── stateManager.js     # Shared localStorage state (ReitState)
│       ├── stats.js  charts.js  projection.js  dataCleaner.js
│       ├── overview.js         # Executive Overview — the landing page
│       ├── portfolio.js        # Portfolio Analysis page controller
│       ├── marketScreen.js     # Market Screener page controller
│       ├── diversification.js  # Diversification (HHI) page controller
│       ├── dataCentre.js       # Data Centre page controller
│       ├── statsDashboard.js   # Statistics page controller
│       ├── report.js           # Decision Report page controller
│       └── agents.js           # Agent Recommendations page controller
├── server/
│   ├── server.js               # Node.js Gemini proxy (zero npm dependencies)
│   ├── package.json
│   ├── .env.example            # Template — copy to .env, add your key
│   └── .env                    # NOT committed (in .gitignore)
├── tests/
│   ├── reit-tests.js           # Application test suite (Node.js, no browser)
│   └── fixtures/               # Evaluator CSV fixtures: one valid, one invalid
├── docs/
│   ├── architecture.md         # System design + Mermaid diagram
│   ├── test-report.md          # Full test log with pass/fail table
│   ├── limitations.md          # Academic limitations and caveats
│   ├── ai-use-declaration.md   # How AI was used in this project
│   ├── data-documentation.md   # Synthetic data schema and rationale
│   ├── process-log.md          # Development decisions and rationale
│   ├── prompt-design.md        # Gemini prompt engineering notes
│   ├── project-report-draft.md # Full academic report draft
│   ├── CANONICAL_FACTS.md      # GENERATED — the only place figures are stated
│   ├── SOURCE_VERIFICATION_REPORT.md  # What was checked, and what was not
│   ├── verification-evidence.md       # Record of the institution-name migration
│   └── viva-guide.md           # Formula reference and Q&A prep
├── .gitignore
└── README.md
```

---

## How it works

### Architecture

```
Browser (Vanilla JS SPA)
  │
  ├── hhi.js + scoringEngine.js    ← deterministic analytics (no AI)
  │      Pure functions; unit-tested; no DOM, no fetch
  │
  ├── governance.js + filters.js   ← evidence eligibility and display filtering
  │      Neither rescores nor reorders anything. Separate axes from the score.
  │
  ├── validator.js                 ← eight deterministic input checks
  │      Gates the Orchestrator. No network, no API key, no quota.
  │
  ├── overview.js / portfolio.js / marketScreen.js / diversification.js /
  ├── statsDashboard.js / dataCentre.js / agents.js / report.js
  │      Page controllers; fetch JSON data; build DOM safely via textContent
  │
  └── fetch /api/agent  ──▶  server/server.js  ──▶  Gemini API
           (POST JSON)        (Node stdlib only)      (HTTPS; key never reaches browser)
```

### Three things kept deliberately separate

| Question | Answered by | Never affects |
|---|---|---|
| How attractive does a segment look? | the composite score (`scoringEngine.js`) | — |
| Can the evidence carry a recommendation? | the evidence floor (`governance.js`) | any score or rank |
| Which rows are on screen? | the filters (`filters.js`) | any score or rank |

A rank shown anywhere in the application is always the rank within the full
segment universe, so "rank 12" means the same thing on a filtered screen as it
does in the report.

### AI role and limits

Gemini is used **only to interpret** the deterministic outputs:

| Task | Who does it |
|------|-------------|
| HHI calculation | `hhi.js` (deterministic) |
| Market ranking | `scoringEngine.js` (deterministic) |
| Post-investment simulation | `hhi.js` (deterministic) |
| Evidence eligibility | `governance.js` (deterministic) |
| Input validation | `validator.js` (deterministic) |
| Explaining *why* the top market scored highly | Gemini |
| Interpreting HHI change in plain language | Gemini |
| Final recommendation narrative | Gemini (Investment Orchestrator) |

If Gemini is unavailable, all numerical analysis still works, including the
checks that gate the recommendation. The page says plainly that there is no AI
interpretation, and no fabricated text is inserted.

**Validation is not an agent.** It was, in an earlier design. Every check it
made — do the weights total 100%, are the scores within range, is the selected
target present in the ranking, do the HHI figures reproduce — has exactly one
correct answer that arithmetic establishes, so a model could get it wrong, and
its verdict gated the recommendation. Those checks are now `validator.js`:
deterministic, offline, reproducible, and they report the figures they
compared.

---

## Pages

| Page | Hash | Description |
|------|------|-------------|
| Executive Overview | `#overview` | The landing page: what the system is, what the current run concluded and on what evidence, where to look next, and what it must not be used for. Carries Reset Demo. |
| Portfolio Analysis | `#portfolio` | The synthetic holdings; add/remove; concentration warning |
| Market Screener | `#screener` | Every segment ranked by weighted score, with filters, the evidence floor, per-segment observation distributions, and CSV import |
| Diversification (HHI) | `#diversification` | Before/after HHI simulation; sensitivity analysis |
| Statistics | `#statsdash` | The whole observation-level dataset: distributions, correlation structure, regression, and anomaly-detection performance measured against known ground truth |
| Agent Output | `#agents` | The Gemini agents, plus the deterministic checks that gate the recommendation |
| Data Centre | `#datacentre` | Provenance, the cleaning pipeline, CSV import |
| Decision Report | `#report` | The whole chain in one printable document |

Segment and holding counts are in
[`docs/CANONICAL_FACTS.md`](docs/CANONICAL_FACTS.md), not here.

---

## Security notes

- `GEMINI_API_KEY` lives only in `server/.env`, which is git-ignored, along with
  every `server/.env.*` variant
- The key is never sent to the browser. `/api/health` reports only whether one
  is configured, as a boolean
- The server never logs the key's value
- All user-supplied text is inserted via `textContent` (never `innerHTML`), and
  the test suite fails on any non-empty `innerHTML` assignment in `public/js`
- Static server has path-traversal protection
- No secret appears in any generated document; the full git history has been
  scanned blob by blob and contains none

---

## Disclaimer

This project was built for **academic assessment purposes only**. No part of it
constitutes investment advice, financial analysis, or a regulated financial
service. All data, figures, and AI-generated narratives are synthetic and
should not be used for any real investment decision.

*Submitted for NMIMS B.Sc. Finance | Business Analytics — September 2026*

---

## Published version (no terminal needed)

The browser application is deployed to GitHub Pages from `public/` on every
push to `main`. Opening the published URL requires nothing installed.

**What works on the published site**

Everything deterministic: portfolio analysis, market screening, the scoring
engine, HHI diversification simulation, projections, the statistics dashboard,
and the decision report. All of it runs in the browser against committed data
files.

**What is different on the published site**

The Gemini agents are reached through the Node proxy in `server/`, which is a
server and therefore cannot run on GitHub Pages. The application detects the
missing proxy and serves `public/data/agent-cache.json` instead — a captured
run of the agents. Those cards are **labelled as pre-generated** on screen and
are not live calls, and a cached reply is served only when the scenario on
screen matches the stored one in every respect — the weights, the investment
amount, the selected target, the portfolio and the dataset version. If any of
those differ, the page shows the deterministic figures and says why there is no
commentary, rather than displaying confident prose about a market the table no
longer recommends.

To get live agent calls, run the proxy locally (see Quick start above).

### Regenerating everything

The data pipeline is seeded and reproducible — the same commands always
produce byte-identical output.

```bash
node data-pipeline/scripts/generateObservations.js            # observations + planted anomalies
node data-pipeline/scripts/deriveMarkets.js                  # market aggregates, derived
node data-pipeline/scripts/computeStatistics.js              # statistics.json for the dashboard
node data-pipeline/scripts/buildObservationDistribution.js   # per-segment distributions
node data-pipeline/scripts/buildMeta.js                      # meta.json + CANONICAL_FACTS.md
node tests/reit-tests.js                                     # application suite
node data-pipeline/tests/dataPipeline.test.js                # pipeline suite
```

To refresh the cached agent replies (needs a working API key):

```bash
node server/server.js &
node data-pipeline/scripts/buildAgentCache.js
```

Refresh the cache whenever the underlying data changes, or the cached
commentary will describe a dataset that no longer exists.

### A note on secrets

`server/.env` holds the Gemini API key and is git-ignored, along with any
`server/.env.*` backup. Only `server/.env.example`, which contains a
placeholder, is committed. Never commit a real key — if one is ever pushed,
treat it as compromised and rotate it immediately at
https://aistudio.google.com/app/apikey

# REIT Target AI — Academic Demo

**NMIMS B.Sc. Finance | Business Analytics Project Theme 4**
**Theme 4: Building Agents and Artifacts using Generative AI**

> **⚠ Academic Demo — Synthetic Data Only**
> All portfolio holdings, market segments, rental figures, and valuations are
> entirely fabricated for academic illustration. This project is not connected
> to any live database, real fund, or regulated financial service.

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

All assertions (T01–T45, ≥ 140 sub-assertions) should pass. No browser required.

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
│   │   ├── portfolio.json      # 10 synthetic REIT holdings (₹450 Cr)
│   │   ├── markets.json        # 18 synthetic market segments (18 cities/types)
│   │   └── markets.csv         # Same data as CSV for import testing
│   └── js/
│       ├── istTime.js          # IST date/time helpers (no Date() risk)
│       ├── uiHelpers.js        # Toast, formatINRCr, DOM helpers
│       ├── hhi.js              # HHI analytics engine (pure, no DOM)
│       ├── scoringEngine.js    # Market scoring & ranking engine (pure, no DOM)
│       ├── stateManager.js     # Shared localStorage state (ReitState)
│       ├── portfolio.js        # Portfolio Analysis page controller
│       ├── marketScreen.js     # Market Screener page controller
│       ├── diversification.js  # Diversification (HHI) page controller
│       └── agents.js           # Agent Recommendations page controller
├── server/
│   ├── server.js               # Node.js Gemini proxy (zero npm dependencies)
│   ├── package.json
│   ├── .env.example            # Template — copy to .env, add your key
│   └── .env                    # NOT committed (in .gitignore)
├── tests/
│   └── reit-tests.js           # T01–T45, ≥ 140 assertions (Node.js, no browser)
├── docs/
│   ├── architecture.md         # System design + Mermaid diagram
│   ├── test-report.md          # Full test log with pass/fail table
│   ├── limitations.md          # Academic limitations and caveats
│   ├── ai-use-declaration.md   # How AI was used in this project
│   ├── data-documentation.md   # Synthetic data schema and rationale
│   ├── process-log.md          # Development decisions and rationale
│   ├── prompt-design.md        # Gemini prompt engineering notes
│   ├── project-report-draft.md # Full academic report draft
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
  ├── portfolio.js / marketScreen.js / diversification.js / agents.js
  │      Page controllers; fetch JSON data; build DOM safely via textContent
  │
  └── fetch /api/agent  ──▶  server/server.js  ──▶  Gemini API
           (POST JSON)        (Node stdlib only)      (HTTPS; key never reaches browser)
```

### AI role and limits

Gemini is used **only to interpret** the deterministic outputs:

| Task | Who does it |
|------|-------------|
| HHI calculation | `hhi.js` (deterministic) |
| Market ranking | `scoringEngine.js` (deterministic) |
| Post-investment simulation | `hhi.js` (deterministic) |
| Explaining *why* the top market scored highly | Gemini |
| Interpreting HHI change in plain language | Gemini |
| Final recommendation narrative | Gemini (Investment Orchestrator) |

If Gemini is unavailable, all numerical analysis still works. The page shows "AI explanation unavailable" and no fabricated text is inserted.

---

## Pages

| Page | Hash | Description |
|------|------|-------------|
| Portfolio Analysis | `#portfolio` | 10 synthetic holdings; CRUD add/remove; concentration warning |
| Market Screener | `#screener` | 18 market segments ranked by weighted score; CSV import |
| Diversification (HHI) | `#diversification` | Before/after HHI simulation; sensitivity analysis |
| Agent Output | `#agents` | 5-agent sequential run (Portfolio → Screening → Diversification → Validation → Orchestrator) powered by Gemini |

---

## Security notes

- `GEMINI_API_KEY` lives only in `server/.env`, which is git-ignored
- The key is never sent to the browser
- All user-supplied text is inserted via `textContent` (never `innerHTML`)
- Static server has path-traversal protection

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
run of all six agents. Those cards are **labelled as pre-generated** on screen
and are not live calls.

To get live agent calls, run the proxy locally (see Quick start above).

### Regenerating everything

The data pipeline is seeded and reproducible — the same commands always
produce byte-identical output.

```bash
node data-pipeline/scripts/generateObservations.js   # 2,156 observations + planted outliers
node data-pipeline/scripts/deriveMarkets.js          # 50 market aggregates, derived
node data-pipeline/scripts/computeStatistics.js      # statistics.json for the dashboard
node tests/reit-tests.js                             # 392 assertions
node data-pipeline/tests/dataPipeline.test.js        # 22 assertions
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

> **Archived 5 October 2026.** These screenshots show the interface before the visual redesign. They were moved here from `docs/screenshots/`; the current screenshots are in that folder.

# Screenshots — final correction pass, 4 October 2026

Captured from the application served locally (static mode) after the final correction
pass. They illustrate the interface; the evidence that it behaves correctly is
`tests/acceptance-results.json` (the browser acceptance run) and the Node test suite.

| File | Shows |
|---|---|
| `overview.jpg` | Executive Overview: canonical facts, known synthetic anomalies, link to the canonical facts |
| `screener-ranking-and-scatter.jpg` | Market Screener ranking rows with simulation-support badges, and the yield-versus-growth scatter |
| `diversification-candidate-tables.jpg` | Diversification: raw-score leaders and the eligible shortlist for the active preset |
| `agents-pre-generated.jpg` | Agent Output: activity trail, "Hide Pre-generated Analysis", deterministic input checks |
| `datacentre-holdings.jpg` | Data Centre, level 1 (portfolio holdings) and level 2 (segment aggregates, 1,000 sq ft note) |
| `datacentre-register-and-quality.jpg` | Data Centre, level 4 (source register), level 5 (data quality) and the System Check |
| `report-screening-tables.jpg` | Decision Report: eligible shortlist table with raw and eligible ranks, HHI and projections |
| `report-commentary-and-checks.jpg` | Decision Report: agent commentary for the current run and the deterministic checks |

Earlier screenshots, which show the interface before the correction pass, are in
`archive/screenshots-pre-correction-20261004/`. `tests/browserSmokeTest.js` regenerates
PNG screenshots here when run with Playwright.

# Screenshots — final submission, 5 October 2026

Captured from the application served locally (static mode, default analysis:
Balanced preset, ₹50.00 Cr, sample portfolio, automatic selection, no filters,
simulation-support screen applied) after the visual redesign and the final
submission changes. Desktop images are 1440 px wide; the two phone images show a
390 px viewport at twice its pixel density. They illustrate the interface; the
evidence that it behaves correctly is `tests/acceptance-results.json` (the
browser acceptance run) and the Node test suite.

Animations were skipped while capturing, so each image shows the settled state.

| File | Shows |
|---|---|
| `overview.jpg` | Executive Overview: the dataset in four figures, provenance, and the start of the current analysis |
| `overview-customer.jpg` | "Who it is for": the primary user, the business problem and the six core use cases, each linked to its pages |
| `overview-candidate-plate.jpg` | The candidate plate: the shortlist candidate with its score, simulation support and external calibration kept separate, the investment and both HHI changes, then the screen note and the fixed caveat |
| `portfolio.jpg` | Portfolio Analysis: sample holdings summary and geographic concentration |
| `screener-candidate-plate.jpg` | Market Screener: the same plate, the screen explanation and the highest raw-score market |
| `screener-ranking.jpg` | Investment amount, presets, weights, filters and the ranked segments; the selected target marked in marigold, segments failing the screen marked in grey |
| `screener-breakdown.jpg` | An opened score breakdown: factor contributions, simulation support, HHI impact and the simulated spread |
| `diversification.jpg` | Current portfolio concentration with allocation bars |
| `diversification-candidate-tables.jpg` | Before/after concentration chart, then raw-score leaders and the eligible shortlist for the active preset |
| `agents-pre-generated.jpg` | Agent Output with the pre-generated analysis shown: provenance, deterministic headline figures, the consistency check and the agent's prose |
| `datacentre-system-check.jpg` | Data Centre System Check: 10 of 10 checks, each with what it expected and what it got |
| `statistics.jpg` | Statistical Analysis: key findings |
| `report.jpg` | Decision Report cover and analysis summary |
| `report-screening-tables.jpg` | Decision Report: raw-score and eligible-shortlist tables |
| `overview-mobile-390px.jpg` | The candidate plate on a 390 px phone |
| `screener-mobile-390px.jpg` | Market Screener on a 390 px phone, with the page navigation as a scrolling strip |

## Live Gemini evidence (not the default configuration)

Captured on 5 October 2026 from the application served by the local proxy
(`node server/server.js`, `http://localhost:3001`), for a configuration with no
stored commentary — Diversification Focused, ₹75 Cr, sample portfolio, automatic
selection — so the commentary could only come from live calls. The four agents
answered live (`gemini-3.1-flash-lite`) in 13.3 seconds in the browser run; these
captures were taken in the same proxy session and served from its in-memory
copy of that run, without further API calls. No key appears in any image.

| File | Shows |
|---|---|
| `live-agent-context.jpg` | Live-mode status bar and the deterministic context sent to the agents for the ₹75 Cr run |
| `live-agent-output.jpg` | A live agent card: provenance "Live Gemini interpretation — generated just now", model tag, deterministic headline figures, consistency check passed |
| `live-report-commentary.jpg` | Decision Report: commentary provenance "Live Gemini call made during this session for this exact run", HHI 0.4130 → 0.3429 and 0.6316 → 0.5132 |

Earlier screenshots are archived: before the redesign in
`archive/screenshots-pre-redesign-20261005/`, before the correction pass in
`archive/screenshots-pre-correction-20261004/`.

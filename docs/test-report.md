# Test Report — REIT Target AI

**REIT Target AI | NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI | Vishesh Jain**

All data in this project is synthetic. The tests establish that the application
computes, displays and explains its synthetic figures consistently. They do not,
and cannot, establish that any figure describes a real market: external
calibration is Unverified for every segment (`docs/SOURCE_VERIFICATION_REPORT.md`).

---

## 1. The system under test

The figures below are generated from `public/data/meta.json`; the tests check the
application against the same data.

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

---

## 1a. Results at a glance (final run, 5 October 2026)

| Check | Result | Evidence |
|---|---|---|
| Application suite (`node tests/reit-tests.js`) | 720 passed, 0 failed (assertions; see §3a for what kind) | §2.1 |
| Data-pipeline suite | 22 passed, 0 failed | `node data-pipeline/tests/dataPipeline.test.js` |
| Analytics audit | exit code 0 — every headline figure re-derives by an independent route | `data-pipeline/docs/ANALYTICS_AUDIT.md` |
| Seeded reproducibility | Two consecutive regenerations of the full data chain (observations, `markets.json`, `observations.json`, `statistics.json`, `observation-distribution.json`, `meta.json`) were byte-identical; observations and statistics are identical to the committed files | SHA-256 comparison; CI step |
| Browser acceptance, desktop (1440 px) | 76 / 76 passed, no console errors | `tests/acceptance-results.json` |
| Browser acceptance, phone (390 px) | 84 / 84 passed, no horizontal overflow on any route, no console errors (after the overflow fix in §4e) | `tests/acceptance-results.json` |
| System Check | 10 / 10 | browser acceptance SYSCHECK; T-161 |
| Fresh live Gemini run (§4b) | Exercise A2 (no stored commentary): 4 / 4 agents live, 4 / 4 consistency checks passed (one after a single revision), 24.3 s | `tests/evidence/live-gemini-run-20261005.json` |
| Failure handling (§4c) | Network failure, quota error, quarantine of a failing reply, and withholding from the next agent and the report — all behave as specified; no API calls used | `tests/evidence/agent-failure-handling-20261005.json` |
| Stale commentary (§4d) | Stored commentary appears only at an exact match, labelled as stored, and disappears when an input changes | `tests/evidence/stale-commentary-20261005.json` |
| CSV area units (§4f) | 300 sq ft stays 300 sq ft; square metres converted once; missing or conflicting units rejected with the reason | T-176, CSV-3 to CSV-5 |
| Runbook figures (§4g) | Exercises A, B, C and the live configuration recomputed independently; equal to the application at full precision | T-178; EX-A1 to EX-B3 |

---

## 1b. Use-case tests

Each core use case (Overview, "Who it is for") is exercised by automated tests
and by the browser acceptance run, and shown in a screenshot of the default run.

| # | Use case | Application-suite tests | Browser acceptance checks | Result | Screenshot |
|---|---|---|---|---|---|
| 1 | Diagnose concentration in the existing portfolio | T01–T06, T22, T-157 (HHI, weighted yield, portfolio totals) | R-portfolio, R-diversification, FOCUS-1/2 (custom portfolio form) | Pass | `portfolio.jpg`, `diversification.jpg` |
| 2 | Rank markets with adjustable priorities | T07–T16, T80–T81, T-162a (presets, weights, ranking order) | SYNC-*preset*-target for all four presets | Pass | `screener-ranking.jpg` |
| 3 | Compare the highest raw-score market with the highest-ranked market passing the screen | T-151, T-163, T-165 (screen, manual selection, report tables) | SYNC-*preset*-candidate, SYNC-*preset*-top3, MANUAL-1 to MANUAL-4 | Pass | `screener-candidate-plate.jpg`, `overview-candidate-plate.jpg`, `diversification-candidate-tables.jpg` |
| 4 | Simulate yield, concentration and scenario effects | T04–T06, T-157–T-158, T-162d–e (HHI after, year-0 rent, projections) | SYNC-*preset*-projection, SYNC-*preset*-rent | Pass | `diversification.jpg`, `screener-breakdown.jpg` |
| 5 | Deterministic validation and Gemini-assisted interpretation | T44, T-160 (context, cache, output checker), T-174 | CACHE-1 to CACHE-8 (static); live run §4a | Pass | `agents-pre-generated.jpg`, `live-agent-output.jpg` |
| 6 | Printable decision report | T-154, T-165 | SYNC-*preset*-report, CACHE-5, CACHE-7 | Pass | `report.jpg`, `report-screening-tables.jpg`, `live-report-commentary.jpg` |

Supporting behaviour: Reset Demo (T-155, T-164; RESET-1 to RESET-5, EX-RESET), the
System Check (T-161; SYSCHECK), the CSV cleaning pipeline (T-156, T-176; CSV-1 to
CSV-5), the runbook exercises through the controls (T-178; EX-A1 to EX-B3,
EX-INVALID), agent failure handling (T-180; §4c), provenance and benchmark checks
(T-177), the screen's sensitivity (T-179), and the customer and use-case statement
itself (T-173). Screenshots are in [screenshots/](screenshots/).

---

## 2. How to run each suite

No suite needs `npm install`: every script uses only the Node standard library or
the browser.

| Suite | Command | Covers | Run by CI |
|---|---|---|---|
| Application suite | `node tests/reit-tests.js` | Engines, data files, shared analysis run, agent context, output checker, pre-generated cache, page modules (source assertions), documentation drift | Yes |
| Data pipeline suite | `node data-pipeline/tests/dataPipeline.test.js` | 22 checks (T-01 to T-22) on the semi-synthetic pipeline: its input registers (sources, evidence, assumptions, market universe, long-form estimates), the first-generation observation files and generation log (seed, PRNG reproducibility, derived-yield formula, value ranges), and the generator's isolation from application code. The version-2 observations from which `markets.json` is derived are covered by T-149b, T-153 and the CI reproducibility step | Yes |
| Analytics audit | `node data-pipeline/scripts/auditAnalytics.js` | Recomputes every headline financial figure by a separate route — portfolio aggregates, both HHI figures, normalisation ranges, composite scores, contribution sums, every projection point — and compares it with the engines; exits non-zero on any disagreement and rewrites `data-pipeline/docs/ANALYTICS_AUDIT.md` | No (run by hand; the application suite checks that the script and its report exist, T-158k) |
| Browser acceptance | `tests/browserAcceptance.js`, run inside the application in a browser (§2.2) | Rendered pages of all eight routes, driven through the application's own controls | No (run by hand) |
| Reproducibility | CI step: regenerate the observations from the fixed seed and compare with the committed file | Byte-identical regeneration of `data-pipeline/generated/observations.v2.json` | Yes |

### 2.1 Application suite

```bash
node tests/reit-tests.js
```

The suite prints one `PASS` or `FAIL` line per assertion, prints a results line,
lists every failure at the end, and exits with status 1 if anything failed.

Latest full run, 5 October 2026: `node tests/reit-tests.js` → "Results: 720 passed, 0 failed" (also recorded in HANDOFF.md). Assertion T-170 fails if this line and the live count ever disagree.

### 2.2 Browser acceptance

1. Serve the **repository root** (not `public/`) with any static server, for
   example `python3 -m http.server 8778`, and open
   `http://localhost:8778/public/index.html`. Serving the root lets the script
   fetch the CSV fixtures in `tests/fixtures/`.
2. In the browser console:
   ```js
   const s = await (await fetch("../tests/browserAcceptance.js")).text();
   (0, eval)(s);
   const r = await runAcceptance();   // r.summary, r.results
   ```
3. Repeat at about 390 px wide with `runAcceptance({ mobile: true })` for the
   overflow checks.

The script clears the application's own storage keys before it starts and ends
with Reset Demo, so it leaves the canonical state behind. Served this way the page
is in static mode, so the pre-generated-commentary checks (CACHE-1 to CACHE-8) run;
when the page is served by the live proxy they are replaced by a single CACHE-LIVE
note. `tests/browserSmokeTest.js` is an older Playwright script with a
machine-specific Chromium path; it is not part of the acceptance run.

### 2.3 Continuous integration

`.github/workflows/tests.yml` runs on every push to `main`, on pull requests and on
manual dispatch, on Ubuntu with Node 20. Its steps: the application suite, the data
pipeline suite, and the reproducibility check (copy the committed
`observations.v2.json`, rerun `generateObservations.js`, and fail if the regenerated
file differs). No API key is available in CI, so no live Gemini call is ever tested
there; the stored replies in `public/data/agent-cache.json` are checked instead.

---

## 3a. What kind of evidence each check is

The application suite counts **assertions**, not independent test cases: one
behaviour is often checked by several lettered assertions, and many assertions
compare production output with metadata that the same production code generated.
Those comparisons catch drift between pages, data files and documents; they do
not show that a figure is right. The checks below are the ones that recompute
figures by a **separate route** and could catch a wrong formula:

| Independent check | What it recomputes | Separate from the application code? |
|---|---|---|
| `data-pipeline/scripts/auditAnalytics.js` | Portfolio aggregates, both HHI figures, normalisation ranges, composite scores, contribution sums, every projection point | Yes — its own implementation |
| T-178 | HHI, weighted yield, year-0 rent and 3-year value for exercises A, B, C and the live configuration, from the raw data files | Yes — code written in the test, not `analysisRun.js`; also cross-checked once in Python while preparing this report |
| T-176c–e, T-176i | Square-metre conversion against 1 ÷ 0.3048² | Yes — the factor is computed in the test |
| T-179e | That more draws tighten the median's bootstrap interval but not the P10–P90 spread | Recomputed by `screenSensitivity.js` from the observations |
| Worked examples (report Sections 9 and 10) | One composite score and one HHI by hand | Yes — by hand |
| Browser acceptance EX-*, SYNC-* | What the rendered pages show after the real controls are used | Reads the DOM, not the engine |

Tests such as T-167 (meta.json equals a fresh run), T-174 (limitations quoted word
for word) and T-170 (documented test count) are consistency checks of the second
kind. The exported Word and PDF documents are not covered by any automated test;
they were produced from the Markdown and inspected page by page when made.

## 3. What the application suite covers

Test identifiers are grouped by theme. Each identifier has several lettered
assertions (for example T-160a to T-160s).

| Identifiers | Theme |
|---|---|
| T01–T03 | Portfolio totals and basic HHI (equal shares, single-city monopoly) |
| T04–T06 | `simulateInvestment`: returned structure, a new city lowers city HHI, a large same-city investment does not |
| T07–T10 | Weight validation: valid presets, totals above or below 100%, missing factor |
| T11–T14 | Scoring internals: low risk scores higher, scores within 0–100, normalisation of a constant factor returns 50, gross-yield formula |
| T15–T16 | Ranking order and preset sensitivity of scores |
| T17–T19 | Market validation (duplicates, missing fields) and the engine's sensitivity analysis |
| T20–T22 | Diversification scoring, zero investment, weighted yield |
| T23 | Engine-level XSS safety of city names |
| T24–T25 | `compareMetrics` direction flags and empty-portfolio totals |
| T26–T35 | Preset weights, state save/load/reset, finite HHI deltas and scores |
| T36–T45 | Agents and server: four agents in the roster, run gating, trail steps, migration of an older saved state, scenario key changes with the investment amount, fallback wording, no API key or Google API host in browser code, no unsafe `innerHTML`, four server prompts and no validation prompt, Orchestrator schema |
| T46–T65 | Navigation markup; CSV cleaning (Indian number formats, unit conversion, required columns, impossible values, duplicates, IQR outliers, parser, template); projection engine (scenarios, compounding, summaries, zero investment); `markets.json` structure |
| T66–T77 | Statistics engine: primitives, gross yield, portfolio, city and segment statistics, bootstrap median CI, outlier summary, formatting, seeded PRNG determinism, exported constants |
| T78–T85 | `agents.js` structure (four agents, trail including the deterministic step, `/api/health`, context from the shared run), projection worked example, contributions sum to the composite score, deterministic tie-breaking, projection rent taken from the run, Decision Report fixes, CSV fixture battery |
| T-100–T-148 | Data quality of `markets.json`: score ranges, Assumption Support Grade and locality class present and valid, data classification, uncertainty bounds monotone with a stated basis, plausible yields by property type, no template-copied yields, presets valid, source and assumption IDs, register files present |
| T-149 | Canonical metadata: every headline count derived from the data files, `meta.json` matches a fresh derivation and carries no timestamp, methodology versions agree |
| T-150 | Documentation drift: no document states a superseded figure except on a line marked `[superseded]`; `CANONICAL_FACTS.md` is marked as generated; no source file names the wrong institution |
| T-151 | Simulation-support screen: thresholds of 30 simulated observations and grade C, eligibility rules, every failure reason stated, no score or rank changed by the screen, override recorded |
| T-152 | Screener filters: combinable, reversible, rank-preserving, explain an empty result |
| T-153 | Observation distribution: per-segment counts and medians match `markets.json`, histograms and quantiles consistent, records named "simulated market observations" |
| T-154 | Decision Report reads `totalScore`, states commentary provenance, deterministic checks, simulation support and external calibration separately |
| T-155 | Overview is the default route; Reset Demo uses an explicit confirmation panel and resets through `AnalysisRun.reset()` |
| T-156 | Evaluator CSV fixtures: the valid file is fully accepted, every row of the invalid file is rejected with a reason |
| T-157–T-158 | Financial baseline computed the way the application computes it; projection arithmetic (year-0 position, compounding, gross versus occupancy-adjusted yield); analytics audit present |
| T-159 | Source register honesty: no source marked Verified, statuses recorded, pre-verification register kept, report states its findings, dataset unchanged |
| T-160 | Agent context vocabulary and precision; pre-generated cache format, keys and per-preset scenarios; every stored reply passes the output checker; the scenario key changes with every relevant input; the checker rejects each defect found in the first cache build |
| T-161 | System Check: ten checks, all passing on the canonical data, each reporting expected and actual values, no probe key left behind, production field names and entry points, analysis state never written, a broken engine fails visibly |
| T-162 | Cross-page synchronisation for all four presets: ranking order, automatic selection, HHI, projection rent, agent context, validator and scenario key all describe the same target; each page module renders the shared run and computes no target itself; Diversification tables and sensitivity come from the run |
| T-163 | Automatic versus manual selection: manual choice honoured even when it fails the screen, flagged when it differs from the candidate, labelled "Manually selected target", kept across a preset change, return to automatic |
| T-164 | Reset Demo restores Balanced, canonical weights, ₹50 Cr, screen applied, automatic selection, no filters, and recomputes at once |
| T-165 | Decision Report: separate raw-score and eligible-shortlist tables with raw rank, eligibility, support grade, simulated observations, external calibration and exclusion reason; model candidate and manual target labelled separately; agent commentary printed only for its own run |
| T-166 | External calibration taken only from the source register; no page or module justifies the 30-observation threshold by a normal approximation or describes grade C as evidence; the screen described as a project convention; Data Centre five levels and the micro-market CI unit; plain labels for source types |
| T-167 | Generated documentation blocks: every listed document carries canonical blocks and each equals what `buildMeta.js` renders from `meta.json`; `CANONICAL_FACTS.md` contains every block; `meta.json` preset results and counts equal a fresh computation |
| T-168 | Figures stated in prose (city, agent and segment counts, observation totals, portfolio value and rent, authorship, institution, clone path, test counts, superseded recommendations) agree with `meta.json`; generated blocks and lines marked `[superseded]` are exempt |
| T-169 | No current document uses retired terminology or presents simulation support as evidence (quoted terms and `[superseded]` lines exempt) |
| T-170 | This report and `HANDOFF.md` state the application suite's own count for the run |
| T-171 | No `.env` file is tracked and no tracked file contains an API key |
| T-173 | Customer, business problem and six use cases stated once in `AppMeta.CUSTOMER`, rendered on the Overview with links to real routes, copied into `meta.json`, and present in the README, the project report and `CANONICAL_FACTS.md` |
| T-174 | The application's stated limitations (`validator.js`) appear word for word in `docs/limitations.md`, the project report and `CANONICAL_FACTS.md`, cover every required topic (including "not forecasts" and static versus live), and are read by the Overview, Agent Output and Decision Report |
| T-175 | Every relative link and image in the README, HANDOFF and the documentation resolves to a file |
| T-172 | Visual system: `index.html` loads one local stylesheet (`css/app.css`); every class the page scripts assign is defined in it or listed as a structural hook; every animation stops under `prefers-reduced-motion`; no CSS text-case transform (the browser checks read `innerText`); `motion.js` never writes text, markup or application state |

---

## 4. Browser acceptance checks (`tests/browserAcceptance.js`)

| Check IDs | What is verified in the rendered pages |
|---|---|
| R-*route*, A11Y-hidden-*route* | Each of the eight routes renders content; only the active page is exposed, the others are hidden and inert |
| MOBILE-*route* | No horizontal page overflow at the mobile width (mobile run only) |
| RESET-1 to RESET-5 | Reset Demo confirmation panel; Cancel changes nothing; reset restores the defaults; the Overview immediately shows a valid candidate at ₹50.00 Cr; focus lands on the current analysis |
| SYNC-*preset*-target, -candidate, -projection, -rent, -top3, -report | For each of the four presets, clicked on the Screener: Overview, Screener, Diversification, Agents and Report name the same target; it is the shortlist candidate; Diversification and Report show identical projections; year-0 rent uses the target's own yield; the raw-score table is the active preset's; the Report shows both tables |
| MANUAL-1 to MANUAL-4 | A manual selection reaches every page labelled manual; the Overview says "Manually selected target"; after a preset change the target is kept and a warning names the new candidate; Return to automatic restores the candidate |
| CACHE-1 to CACHE-8 (static mode) or CACHE-LIVE | Matching pre-generated analysis offered; four cards labelled as stored text, each passing the consistency check; button reads "Hide Pre-generated Analysis"; Report prints the commentary with provenance; changing the amount rejects the stored analysis and names the reason; the Report drops it; restoring ₹50 Cr makes it available again |
| SYSCHECK, SYSCHECK-state | All ten System Check results pass; running it does not change the analysis |
| CSV-1, CSV-2 | The valid fixture is accepted; every row of the invalid fixture is rejected or warned with a stated reason |
| FOCUS-1, FOCUS-2 | Focus moves into the Add Asset form and returns to its opener on Escape |
| A11Y-tables | Every principal table has a caption or an accessible name |

---

## 4a. Live Gemini test (5 October 2026, earlier run)

Run after the visual redesign through the local proxy (`node server/server.js`,
`http://localhost:3001`) with the configured key, on a configuration with no
stored commentary, so the text could only come from live calls.

| Item | Result |
|---|---|
| Configuration | Diversification Focused, ₹75 Cr, sample portfolio, automatic selection (scenario key `883fda7e`) |
| Agents | All four answered live, `gemini-3.1-flash-lite`, 13.3 seconds |
| Consistency check | Passed on all four replies |
| Deterministic gate | All 8 checks passed before the Orchestrator |
| Activity trail | All five steps Completed |
| Decision Report | Commentary provenance "Live Gemini call made during this session for this exact run"; HHI 0.4130 → 0.3429 (city) and 0.6316 → 0.5132 (asset type), as the engine computes for ₹75 Cr |
| Console | No application errors |
| Key exposure | No key-shaped string in the page, the loaded scripts, `/api/health`, browser storage or the proxy log |

The proxy was stopped afterwards. Screenshots: `screenshots/live-agent-context.jpg`,
`screenshots/live-agent-output.jpg`, `screenshots/live-report-commentary.jpg`.

## 4b. Fresh live Gemini run on a non-default configuration (final run)

After the prompt wording changed (context version 3), the stored commentary was
rebuilt (`buildAgentCache.js`: 16 replies, all passing the output check, 17 API
calls — one Orchestrator reply needed one revision) and one fresh run was made on
a configuration that has no stored commentary.

| Item | Result |
|---|---|
| Configuration | Runbook Exercise A2: custom weights 35/25/20/10/10, ₹75 Cr, sample portfolio, automatic selection |
| Scenario key | `f49bb7b8` (no stored entry matches it) |
| Started | 2026-10-05 13:22:32 UTC; 24.3 seconds from **Run Agent Analysis** to the last card |
| Served by | `node server/server.js` on 127.0.0.1:3001 (loopback); WebKit browser driven by `tests/browser/liveRunAndWait.js` |
| Model | `gemini-3.1-flash-lite` for all four agents |
| Consistency check | Market Screening, Portfolio Risk and Orchestrator passed first time. The Data & Statistical Analyst's first reply failed the check; it was sent back once with the problems and the revision passed — the bounded repair working on a real reply |
| Deterministic gate | All 8 deterministic checks passed before the Orchestrator |
| Key exposure | None in the evidence file, the page or the proxy log |

The four replies are stored in `tests/evidence/live-gemini-run-20261005.json`.

## 4c. Failure handling (no API calls)

`tests/browser/agentFailureTests.js` drives the real Agent Output page served by
the proxy, replacing only the `/api/agent` request:

| Case | Expected | Result |
|---|---|---|
| Network failure | Every card says "Fresh generation was unavailable"; no stored text substituted; deterministic checks still shown; the report prints no commentary | Pass |
| Quota error (HTTP 429) | As above, with the reason | Pass |
| Orchestrator reply contradicting the analysis (twice) | Sent back once with its problems; then **Withheld** — collapsed, not published to the report; the report says the reply was withheld | Pass (2 calls made; report does not contain the bad text) |
| First agent's reply fails twice | Withheld, and the next agent receives `dataStatisticalOutput: null` instead of the failing text | Pass |

## 4d. Stale commentary (static mode)

`tests/browser/staleCommentaryTest.js`: at the Balanced defaults the four cards
are labelled "Pre-generated interpretation … Stored text, not a live call" (key
`d881ea78`). After the amount changes to ₹75 Cr (key `d2a69bbf`) the cards are
removed, nothing is published to the report, the page says the configuration
"differs from the stored analysis by: investment amount", and the report says
"No agent commentary for this run."

## 4e. Mobile overflow found and fixed

The 390 px acceptance run in WebKit found horizontal overflow on Portfolio (63 px),
Market Screener (98 px), Diversification (675 px) and Decision Report (673 px). The
same overflow is present in the previously committed version, so the earlier
"0 px" result had been measured under different conditions. Causes: generic
`.reit-table` tables were not made scrollable on narrow screens, a fixed-width
chart did not scale, and screen-reader-only labels inside the ranked table were
positioned outside its scroll area. All three were fixed in `public/css/app.css`;
the run in §1a is after the fix.

## 4f. CSV area units

The cleaner no longer infers square metres from small numbers (it used to when a
file's median area was below 500). T-176 and the browser checks CSV-3 to CSV-5
confirm: 300, 250 and 180 sq ft stay as typed; `areaSqM`, `area` with `areaUnit`,
and a unit written after the number are converted once by 1 ÷ 0.3048²; a generic
area with no unit, a square-metre value in the square-foot column, two area
columns that disagree, or an unrecognised unit are each rejected with the reason;
the valid and invalid fixtures behave exactly as before.

## 4f2. Public site without the Agent Output page

The same page loaded with `?publicSite=1` (what the GitHub Pages host gets): the
navigation has seven links and no Agent Output; `#agents` falls back to the
Overview; the Overview lists Agent Output as "local copy only" without a link; the
Decision Report says "No agent commentary on the public site" and why; the System
Check passes 10 / 10; no page overflows at 390 px; no console errors. On a local
copy the page is unchanged (acceptance 76 / 76 and 84 / 84). Covered by T-181.

## 4g. Runbook figures

`data-pipeline/scripts/runbookExpected.js` computes every figure the runbook
quotes with the application's code; T-178 recomputes concentration, weighted
yield, year-0 rent and the 3-year value from the raw data by a separate route and
requires equality to 1 part in 10⁹; the browser checks EX-A1 to EX-B3 drive the
same exercises through the amount field, the weight sliders and the custom
portfolio form. One behaviour was documented rather than changed: an amount the
user has typed is kept when the portfolio changes (₹75 Cr on the custom portfolio
gives city HHI after 0.3339), while the default amount follows 10% of the active
portfolio.

---

## 5. Stage-13 acceptance checklist

| # | Requirement | Application suite | Browser acceptance |
|---|---|---|---|
| 1 | Balanced: every page shows the same target and figures | T-162a1–g1, T-162h1–h5, T-160h1 | SYNC-balanced-* |
| 2 | Income Focused: the same | T-162a2–g2, T-162h1–h5, T-160h2 | SYNC-incomeFocused-* |
| 3 | Growth Focused: the same | T-162a3–g3, T-162h1–h5, T-160h3 | SYNC-growthFocused-* |
| 4 | Diversification Focused: the same | T-162a4–g4, T-162h1–h5, T-160h4 | SYNC-diversFocused-* |
| 5 | Automatic versus manual selection | T-163a, T-163c, T-163e, T-163f, T-163g | MANUAL-1, MANUAL-2, MANUAL-4 |
| 6 | Warning when the manual target differs from the current candidate | T-163b, T-163d, T-163h | MANUAL-3 |
| 7 | Reset Demo restores the defaults and a valid analysis | T-155f, T-155g, T-164a–e | RESET-1 to RESET-5 |
| 8 | System Check passes and is meaningful | T-161a, T-161-CHK-01 to T-161-CHK-10, T-161b–f | SYSCHECK, SYSCHECK-state |
| 9 | Decision Report tables (raw-score and eligible shortlist) | T-165a–f, T-154a–g | SYNC-*preset*-report |
| 10 | HHI is computed for the selected target | T-162d1–d4, T-163f | SYNC-*preset*-target (Diversification simulation panel) |
| 11 | Projection rent uses the selected target's own yield | T-162e1–e4, T82, T-158a, T-158b | SYNC-*preset*-rent, SYNC-*preset*-projection |
| 12 | Agent context describes the selected target | T-160a, T-160e, T-162f1–f4, T-163f | SYNC-*preset*-target (Agents page context table) |
| 13 | Scenario key changes with every relevant input | T-160j1–j5, T-160k, T-160l, T40 | CACHE-6 |
| 14 | Stored commentary for a different scenario is rejected | T-160j1–j5, T-165e | CACHE-6, CACHE-7, CACHE-8 |
| 15 | Stored commentary matches the engine's scenario and passes the output checker | T-160f, T-160g, T-160h1–h4, T-160i1–i4 | CACHE-2, CACHE-3 |
| 16 | External calibration is not inferred from simulation count or grade | T-166a–d, T-159c | — |
| 17 | City × property-type CI uses the micro-market as its unit | T-166h, T-166i, T-166j | — |
| 18 | Documentation matches the canonical metadata | T-149a–j, T-150b, T-167a1–a9, T-167b1–b9, T-167c–e, T-168a–c, T-170 | — |
| 19 | No stale figures or retired terms in documents or source | T-150a, T-150c, T-168a, T-169a, T-169b | — |
| 20 | No secrets in browser code or the repository | T42a, T42b, T-171a, T-171b | — |

Item 20 rests on three controls: T42 asserts that no browser script contains an
API key pattern or calls the Google API host directly; T-171 asserts that no `.env`
file is tracked and that no tracked file contains an API key; and `.gitignore`
excludes `server/.env` and every variant of it except the committed template
`server/.env.example`.

---

## 6. What the tests do not establish

- **Market accuracy.** All figures are synthetic. The tests prove internal
  consistency — one analysis run, reproduced identically by every page, the cache
  and the documentation — not that any figure describes a real market.
- **Truth of model prose.** The output checker proves specific kinds of statement
  false (wrong rank, wrong figure or precision, wrong exclusion reason, retired
  term, evidence overclaim). It cannot prove a sentence true. See
  `docs/prompt-design.md`, §8.
- **Live Gemini behaviour.** CI has no key, so only stored replies are checked. A
  live reply is checked in the browser when it is displayed; a reply that fails is
  sent back once and, if it fails again, withheld (§4c). One fresh live run was
  made for this report (§4b); live output varies between runs.
- **Rendering in every browser.** The browser acceptance script is run by hand in
  WebKit (Safari's engine); it is not part of CI, and other engines were not run in
  this pass. Visual layout beyond page overflow and table labelling is checked by
  inspection.
- **The exported documents.** The Word and PDF files are generated from the
  Markdown and inspected page by page when made; no automated test reads them.

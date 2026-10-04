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

Latest full run, 5 October 2026: `node tests/reit-tests.js` → "Results: 666 passed, 0 failed" (also recorded in HANDOFF.md). Assertion T-170 fails if this line and the live count ever disagree.

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
  live reply is checked in the browser when it is displayed, and shown with its
  warnings if it fails.
- **Rendering in every browser.** The browser acceptance script is run by hand; it
  is not part of CI. Visual layout beyond page overflow and table labelling is
  checked by inspection.

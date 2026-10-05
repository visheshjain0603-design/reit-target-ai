# Process Log — REIT Target AI

> **On the `[superseded]` marker.** Lines in this document tagged
> `[superseded]` record something that was true of an earlier revision of the
> project and is not true now. They are kept deliberately: a log or a test
> record edited to agree with the present is no longer evidence of what
> happened. The current figures are in
> [`CANONICAL_FACTS.md`](CANONICAL_FACTS.md), and the test suite fails on any
> *unmarked* line that contradicts them.


**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI | Vishesh Jain**

This document records the key development decisions, rationale, and lessons learned during construction of the project. The summary below states the main choices in one place; the dated phases after it record how they were reached, including approaches that were later replaced.

---

## Summary of the process

**Initial problem.** A REIT choosing its next target market has to weigh income, growth, diversification, demand and risk, and an acquisition committee needs the reasoning, not only a ranking. The project set out to build a decision-support artefact in which generative AI explains a financial analysis without being trusted to perform it.

**Design alternatives considered.**

| Question | Alternatives | Chosen, and why |
|---|---|---|
| How to rank markets | A predictive model; a single metric such as yield; weighted multi-factor scoring | Weighted scoring: there is no labelled outcome to train a model on, and a committee must be able to see and change its priorities |
| What the language model does | Rank and recommend; validate inputs; interpret only | Interpret only: a model states wrong figures fluently, so it must never be the source of one |
| Where validation runs | A validation agent (the original design); deterministic code | Code: every check has one arithmetic answer; code is exact, offline and shows its working |
| How pages share the analysis | Each page reads a stored snapshot; one shared run | One shared run, after the snapshot design caused pages to disagree (4 October entry) |
| How support is reported | Folded into the score; one "quality" label; three separate concepts | Three separate concepts — attractiveness, simulation support, external calibration — so nothing is overstated |
| Data | Scraped listings; licensed data; a seeded synthetic generator | Seeded generator: reproducible, inspectable, and anomaly detection measurable against known truth |

**Why deterministic scoring.** Every score and rank must be reproducible, testable and explainable factor by factor in a viva; the same inputs always give the same output, which also lets the tests, the agent cache and the documents agree with the screen.

**Why Gemini was limited to interpretation.** Early agent output stated figures that were close to, but not, the computed ones. Restricting the agents to a fixed, deterministic context with prose-only replies — and checking every reply — turns a misstatement into a detectable error.

**Why the shared analysis run was introduced.** After a preset change, one page could analyse a different target from the others because each page read a stored snapshot at its own moment. Storing only inputs and computing one run removed that class of defect.

**Why simulation support and external calibration were separated.** Source verification found none of the cited documents. Language that implied evidence could no longer be defended, so simulation precision (a property of the generator) and external calibration (a property of located sources) became separate statuses, and the model output became an exploratory shortlist candidate.

**Major defects found and corrected.** Pages analysing different targets after a preset change; a System Check that tested the wrong field names and overwrote saved state; stored agent commentary that misquoted figures, misattributed exclusion reasons and called a dataset statistic the portfolio's; 88 test assertions written with swapped arguments that could never fail; stylesheets that left about 80 classes undefined; and a before/after HHI chart that was never drawn. Each is recorded below with its fix.

**Features deliberately rejected.** More agents (an earlier six-agent chain overlapped and disagreed); a model-based validation step; more statistical tests than the analysis needs; a larger market universe; a live data feed; a market-dataset importer in the interface (the CSV import demonstrates cleaning only). Each would have added surface area without strengthening the decision the tool supports.

**Final validation process.** Application test suite, data-pipeline suite and an independent analytics audit; browser acceptance at desktop and phone widths driving every page through its own controls; the ten-item System Check; a live Gemini run on a configuration with no stored commentary; seeded reproducibility in CI; and documentation whose figures, customer statement, statistics and limitations are generated from the code and checked by the test suite.

---

## Phase 1 — Portfolio Analysis page (baseline)

### Decision: Reuse existing design system
The project shares a CSS design system with a separate production application (a Rental Manager). Rather than starting from scratch, REIT Target AI was given its own component stylesheet (`reit-components.css`) that coexists with the shared CSS without redefining any shared class names. This saved approximately 4 hours of design work and produced a consistent visual language.

**Risk managed:** The production application's files (JS, JSON, Firestore config) were never opened, modified, or referenced. All new REIT files were written to a completely separate project folder. The shared CSS is a read-only dependency.

### Bug: curly quotes broke `portfolio.js` *(explanation corrected 5 October 2026)*
During testing, the Portfolio page was blank in Safari. Two string literals in `portfolio.js` contained Unicode curly double-quotes (U+201C, U+201D), probably introduced by an editor that auto-corrected straight quotes to typographic ones.

**Fix:** Replaced with single-quoted outer delimiters and straight double-quote content characters. Verified with a byte-level search that no curly quotes remain in the file.

**Corrected explanation.** The original entry said Safari's JavaScriptCore rejects curly quotes while Chrome's V8 accepts them. That is not right, and was re-tested on 5 October 2026 in both engines (Node's V8 and macOS JavaScriptCore): a curly quote used **as a string delimiter** (`var a = “abc”;`) is a SyntaxError in both; a curly quote **inside** an ordinary straight-quoted string (`"say “hi”"`) is a valid Unicode character in both. So the defect must have been curly quotes acting as delimiters, which would have failed in any browser; the claim that Chrome accepted the file could not be verified, because the bug predates the repository's first commit.

**Lesson (unchanged in substance):** check JavaScript for typographic quotes used as delimiters before browser testing; a linter or a pre-commit search catches them.

---

## Phase 2 — Synthetic data design

### Decision: 18 market segments across 7 cities [superseded]

> **Superseded.** This records the decision as it was taken. The dataset was
> later rebuilt from observation-level records; the current counts are in
> [CANONICAL_FACTS.md](CANONICAL_FACTS.md) and the reasons for the rebuild are in
> `data-pipeline/docs/DATA_REBUILD_RATIONALE.md`. The entry is kept because a
> decision log that is edited to match the present is no longer a log.
Eighteen segments were chosen to be large enough to make the ranking and normalisation meaningful (at least 3 per city, providing within-city variation) but small enough for the factor score breakdown table to be readable on a laptop screen. [superseded]

### Decision: Capital values in ₹ per sq ft, not total transaction price
Unit prices (per sq ft) allow comparison across markets regardless of property size. Total transaction prices would vary enormously with lot size and would be meaningless for relative comparison.

### Decision: `riskScore` as 0–100 where higher = riskier
The natural encoding for risk is that higher values mean more risk. The scoring engine then inverts this (`lowRiskScore = 100 - riskScore`) to make higher scores universally mean "better." This avoids confusion in the ranking logic at the cost of one extra variable in the breakdown table.

---

## Phase 3 — Analytics engines

### Decision: Dual CommonJS + browser-global export pattern
Both `hhi.js` and `scoringEngine.js` use the same export wrapper:

```javascript
(function (root) {
  "use strict";
  // ... all functions ...
  if (typeof module !== "undefined" && module.exports) {
    module.exports = HHIEngine;
  } else {
    root.HHIEngine = HHIEngine;
  }
}(this));
```

This means the same file works as a Node.js module (for `require()` in tests) and as a browser global (loaded via `<script>` tag in the SPA). No transpiler or bundler is needed.

### Decision: Pure functions only in the engines
Neither engine touches the DOM, makes fetch calls, or reads/writes globals. This makes them trivially testable: `require('./js/hhi.js')` in a test file gives immediate access to all functions with predictable, isolated behaviour.

### Decision: `normalise()` returns 50 when min === max
When all markets have identical values for a factor (e.g., all demand scores are 75), dividing by (max − min) would be a division by zero. Returning 50 gives a neutral midpoint rather than NaN, ensuring the scoring pipeline never produces undefined results. Test T13 covers this explicitly.

---

## Phase 4 — Market Screener

### Decision: Real-time weight sliders with sum-to-100 enforcement *(superseded)*
*Original design, kept for the record:* sliders updated in real time and, when one moved, the remaining weight was redistributed proportionally among the other four, so the total always stayed at 100%.

**Superseded by the current behaviour** (`public/js/marketScreen.js`): sliders move in steps of 5 and are **not** redistributed. While the five weights do not total exactly 100%, the total is shown in red with the reason, the draft is kept on the Market Screener, and nothing is applied — every page keeps the last valid analysis. At 100% the weights apply as the Custom preset. Automatic redistribution was dropped because it changed weights the user had not touched, which made it hard to set a specific weighting (such as the runbook's 35/25/20/10/10) and to explain a result. The engine still rejects invalid weights (T08, T09), and browser check EX-A2 confirms a 110% draft is not applied.

### Decision: `localStorage` for cross-page state
When the user selects a market on the Screener page, the `marketId` and `investmentCr` are written to `localStorage`. The Diversification page reads these on mount. This produces a seamless "select then analyse" flow without requiring URL parameters (which would conflict with the hash router) or a shared global variable (which would reset on page refresh). This design caused the cross-page synchronisation defect and was replaced by the shared analysis run; see the 4 October 2026 entry. [superseded]

### Decision: CSV import via FileReader (browser-side)
The CSV import feature was kept entirely in the browser to avoid a server round-trip for a file the user already has locally. The trade-off is that CSV parsing errors (malformed rows) are silent — rows that fail schema validation are dropped with a count shown in a toast, but the user does not see a per-row error report. The Data Centre now shows every imported row with its status and exclusion reason. [superseded]

---

## Phase 5 — Diversification analysis

### Decision: Show raw HHI values, not just "improved/worsened"
The before/after cards display the raw HHI number (e.g., "0.2345 → 0.2198") alongside the directional indicator. This allows the evaluator to cross-check against the formula independently, which is important for academic assessment.

### Decision: Sensitivity analysis as three preset scenarios
Rather than a full parametric sweep (which would take O(n×presets) API calls), the sensitivity analysis runs the three non-balanced presets (Income Focused, Growth Focused, Diversification Focused) deterministically and shows how the top-3 markets shift. This makes the analysis meaningful without excessive complexity. The Diversification page now shows all four presets, each with its highest raw-score market and its shortlist candidate. [superseded]

---

## Phase 6 — Gemini agents

### Decision: Sequential agent chain, not parallel
The five agents run in sequence — the Orchestrator explicitly waits for all four specialist agents. This was a deliberate design choice: the Orchestrator's system prompt says it receives "VALIDATED outputs" from the prior agents, implying validation happens first. Running in parallel would require merging partial results, complicating the activity trail UI. [superseded]

**Trade-off:** Sequential calls mean total latency can reach 20–30 seconds. For an academic demo with an evaluator present, this is acceptable. A production system would use parallel calls or streaming. (The chain is still sequential; it now has four agents, with validation done by deterministic checks in `validator.js` before the Orchestrator — see `docs/prompt-design.md`.)

### Decision: Zero npm dependencies in server.js
The Node.js proxy server uses only built-in modules (`http`, `https`, `fs`, `path`, `url`). This means:
- No `npm install` required to start the server
- No `node_modules/` directory in the repository
- No supply-chain vulnerabilities to audit

The trade-off is more boilerplate (manual `.env` parsing, manual JSON body reading, manual HTTPS calls) compared to using `dotenv`, `express`, and `node-fetch`. These are all well-understood patterns and the resulting code is approximately 330 lines. [superseded]

### Decision: API key in server/.env, not hardcoded
This is non-negotiable for any project that will be shared or submitted. The `.gitignore` excludes `server/.env`. The `.env.example` template documents all required variables without exposing real values. The server warns at startup if the key is missing but does not crash — deterministic features continue to work.

---

## Phase 7 — Testing

### Decision: Write tests before discovering bugs, not after
The test suite was written concurrently with the engines rather than as an afterthought. This led to discovering three design questions during testing:
1. Should `simulateInvestment` with `investmentRs=0` return null or a zero-delta result? → Chose null; test T21a documents this.
2. Should `diversificationScore` take a city string or a market object? → Market object (to check both city and type); test T20 reflects this.
3. Should `sensitivityAnalysis` return all four presets or only the non-balanced alternatives? → Three (the balanced run is handled separately by rankMarkets); test T19 was updated accordingly.

### Decision: No external test framework
The test suite uses a hand-written `assert()` function. This keeps the suite self-contained (no `npm install` required) and gives full control over the output format. The trade-off is that there is no test coverage reporting, no parallel test execution, and no automatic test discovery.

---

## Phase 8 — Documentation

### Decision: Mermaid for architecture diagram
Mermaid renders in GitHub's markdown preview and in many documentation tools without requiring image files. The diagram source lives in `docs/architecture.md` as a fenced code block, so it can be updated alongside code changes without regenerating a PNG.

---

## 4 October 2026 — final correction pass

### One shared analysis run, and the synchronisation root cause
**Defect.** After the preset was changed from Balanced to Income Focused, the Overview, Agent Output and Decision Report described Aerocity while Diversification went on analysing Gurugram — Cyber Hub, with the Balanced Top 3 and projections.

**Root cause.** The Market Screener wrote a computed snapshot to `localStorage`, and each page read that snapshot at a moment of its own choosing; Diversification read it only once, when the application loaded. No single page was wrong; the pages held different copies of the analysis.

**Fix.** `public/js/analysisRun.js` computes one analysis object, deterministically, from the persisted inputs (preset, exact weights, investment amount, screen override, selection mode, manual target, filters) and the active portfolio (sample or custom). Every page — Overview, Screener, Diversification, Agent Output, Report, Data Centre — renders that object and re-renders when an input changes through `AnalysisRun.update()`. No page computes a target, an HHI figure or a projection of its own (T-162). Two selection modes were added: automatic, where the selected target is the shortlist candidate and follows every input change, and manual, where the user's choice is kept, labelled "Manually selected target" on every page, flagged when it differs from the current candidate, and can be returned to automatic (T-163).

### System Check repaired and moved to `systemCheck.js`
The ten checks moved out of `dataCentre.js` into a pure module, `public/js/systemCheck.js`, so the same checks run in the browser and in the Node suite (T-161). Four were broken:
- CHK-01 built test holdings with `value` and `propertyType`, which the HHI engine does not read (it reads `propertyValue` and `assetType`), so it reported a city HHI of zero. It now uses the production field names.
- CHK-04 called `DataCleaner.clean`, which does not exist. It now calls `DataCleaner.cleanRecords(DataCleaner.parseCSV(...))`.
- CHK-05 overwrote the user's saved analysis with a test record every time it ran. It now uses a dedicated probe key and removes it afterwards; the System Check never writes the analysis state.
- CHK-08 printed an investment change and called it an HHI check. It now reports concentration before and after a simulated investment.

Every check now states what it expected and what it got.

### Evidence terminology corrected
Three concepts are now kept apart everywhere — pages, agent context, report and documentation: the composite attractiveness score; simulation support (simulated observations, their P10–P90 spread, and the project's own A–E grade, now called the Assumption Support Grade and described as an internal classification of how the assumptions were built, not an evidence grade); and external calibration (Verified, Partially supported or Unverified), derived only from the source register. The screen is now the simulation-support screen, described as a project governance convention for simulation precision, not a regulatory or universal statistical threshold. The CLT justification of n = 30 was removed: the project ranks medians of synthetic draws, not sample means. The screen's pick is called the shortlist candidate, with a fixed caveat that external calibration remains unverified (T-151, T-166).

### Reset Demo fixed
Reset Demo now opens an explicit confirmation panel ("Reset to defaults" / "Cancel") in place of a silent second click. It resets through `AnalysisRun.reset()`, which clears only the application's own storage keys, restores the sample portfolio (a custom portfolio is kept but no longer used), Balanced, the canonical weights, ₹50 Cr, the screen applied, automatic selection and no filters, recomputes at once and returns to the Overview with focus on the current analysis (T-155f–h, T-164).

### Report and Diversification tables
The Decision Report and the Diversification page now each show two tables taken from the run: the top 3 by raw attractiveness score and the top 3 of the eligible shortlist. In the Report each row carries raw rank, eligible rank, screen result, Assumption Support Grade, simulated observations, external calibration and exclusion reason; the selected target is shown even when it is in neither table; the model's shortlist candidate and a manually selected target are labelled separately; and agent commentary is printed only when it was produced for the exact run on screen. On Diversification each row carries raw rank, eligible rank, score, gross yield, screen result, the city and asset-type HHI changes and the segment's role. Diversification's sensitivity view covers all four presets, each with its highest raw-score market and its shortlist candidate (T-162i, T-162j, T-165).

### Data Centre levels and the CI unit
The Data Centre now separates five levels: Portfolio Holdings; Market Segment Aggregates; Simulated Observation Dataset; Source / Calibration Register; Data Quality and Cleaning Results. For city × property-type statistics, the bootstrap CI unit is the micro-market (segment median), not the observation. Each group has between one and six micro-markets and a CI needs at least ten, so no CI is computed and the table states why (T-166h–k).

### Agent schemas, output checker and cache rebuild
Every agent now returns a strict JSON schema with prose fields only, passed to Gemini as `responseSchema`; headline figures are rendered from the context. The context is built from the shared run with explicit fields and fixed-decimal figure strings. `AgentOutputCheck.check()` rejects statements the context contradicts, and the cache builder sends failing replies back with the specific problems, up to two revisions, writing nothing unless every reply passes. Rebuilding the cache exposed five further defects — an automatic selection called manual, context field names in prose, the wrong dominant factor, segments said to be passed over for higher scores when the target was raw rank 1, and a wrong count of segments failing the screen — and a prompt rule or checker rule was added for each. The rebuilt cache passes the checker for all four presets (T-160). Details: `docs/prompt-design.md`.

### Documentation blocks and drift tests
Headline figures in the documentation are no longer typed. Documents mark generated blocks (`key-figures`, `preset-results`, `terminology`, `screen-and-calibration`), and `data-pipeline/scripts/buildMeta.js` fills them from `public/data/meta.json` using `data-pipeline/scripts/canonicalBlocks.js`. The earlier drift test searched for a handful of exact stale strings and missed their variants. New tests compare every generated block with what `meta.json` renders (T-167), parse figures stated in prose against `meta.json` (T-168), reject retired terminology in current-state text (T-169), require the recorded application test count to equal the run's own count (T-170), and check that no secret is tracked (T-171).

---

## 5 October 2026 — visual redesign

### Decision: one stylesheet built from tokens
The shared design system described in Phase 1 had stopped serving the project: the pages loaded three stylesheets, defined some components twice with different values, and assigned about 80 classes that none of them defined, so those components rendered with browser defaults. The three files were archived (`archive/css-pre-redesign-20261005/`) and replaced by `public/css/app.css`, which defines every class the page scripts use from one set of colour, type, spacing and motion tokens. T-172b now fails if a script assigns a class the stylesheet does not define.

### Decision: one accent colour with one meaning
Marigold marks what is selected — the selected target, the current page, the active preset — and nothing else. Indigo marks what can be acted on. Status (passes, caution, fails) has its own three tones, always with a symbol and words, so no meaning depends on colour alone.

### Decision: motion only where something changed
Every page re-renders its whole root when the shared run changes, so naive entrance animations would replay on every click. `public/js/motion.js` instead compares each render with the previous one and animates only the difference: re-ranked rows, a new target, changed figures, newly opened content, charts whose data changed. It adds classes and transforms only — never text or state — and does nothing under `prefers-reduced-motion` (T-172c, T-172e).

### Fixed in passing
The before/after HHI chart on the Diversification page had never been drawn: it was rendered by element id before its container was attached to the page. `charts.js` also coloured an HHI of exactly 0.25 as concentrated while every other page calls it moderate; it now uses the same bands.

## 5 October 2026 — final submission preparation

### Customer and use cases stated once
The primary user, the business problem and six use cases were written into `AppMeta.CUSTOMER` and rendered on the Overview ("Who it is for"), with each use case linked to the pages that carry it out. `buildMeta.js` copies the statement into `meta.json`, and a generated block carries the same words into the README, the project report and `CANONICAL_FACTS.md`. T-173 fails if the statement or the blocks disappear; T-167 fails if a block is stale.

### Limitations agree in three places
Two items were added to the application's fixed list in `validator.js`: that scenario projections are illustrative paths, not forecasts, and that the public site serves stored commentary only for the four presets at their defaults. The list is now generated into `docs/limitations.md` and the project report from the same array, and T-174 checks that all three agree. The stored agent commentary does not depend on this list, so it remained valid.

### Statistics quoted from the data, not typed
The correlations, regression and anomaly-detector scores the report and viva guide quote are copied from `statistics.json` into `meta.json` and rendered as a generated block.

### Report finalised
`docs/project-report-draft.md` was preserved unchanged as `archive/project-report-draft-20261005.md` and finalised as `docs/project-report.md`, restructured around the customer, use cases, methodology, results, testing, limitations and AI use, with formulas and field definitions in appendices.

### Demonstration material
`docs/LIVE_DEMO_RUNBOOK.md` gives a timed demonstration and three evaluator exercises whose expected results were computed with the application's own engine; the viva guide was rewritten as fifty concise questions and answers.

## 5 October 2026 — assessment finalisation pass

A review of the submission raised specific issues; each was checked against the code and documents before anything changed.

### CSV area units no longer inferred
The cleaner treated every area as square metres whenever a file's median area was below 500, so a file of small shops in square feet was multiplied by 10.76. Units are now explicit: `areaSqFt` (square feet), `areaSqM` (square metres, converted once by 1 ÷ 0.3048²), or `area` with an `areaUnit` column or a unit chosen on the import page. Missing, unrecognised or conflicting units reject the row with the reason. Tests T-176 and browser checks CSV-3 to CSV-5 cover it. **Rejected alternative:** keeping a size heuristic with a warning — any threshold misreads some genuine files.

### P10–P90 and the thirty-draw screen described correctly
Some text said thirty draws keep "the P10–P90 spread of a segment's simulated medians reasonably narrow". The P10–P90 band is the spread of the simulated observations themselves; more draws make the estimated median more precise but do not narrow that spread. The wording was corrected in the screen rationale, the pages, prompt rule G, the limitations list and the documents, and two output-check rules now flag a reply that calls the band a confidence interval or says draws narrow it. `docs/SCREEN_SENSITIVITY.md` measures both quantities: within the same segments, using 25 to 60 draws leaves the spread at 0.86–0.92 percentage points while the bootstrap interval for the median narrows from 0.28 to 0.19. The prompt change made the stored commentary stale (context version 3), so it was rebuilt: 16 replies, 17 API calls.

### Grades, legacy labels and sensitivity
Fourteen segments graded B or C carry the legacy `sourceType` "synthetic_academic_placeholder", which contradicted the claim that grade C or better excludes placeholders. The fields measure different things — the grade is the authors' simulation convention; `sourceType` is a first-generation label — and the documents now say so; no grade was changed. A sensitivity analysis (25/30/40 observations × grade B or C × four presets) shows where the shortlist moves, and why the outcome follows from how the generator was built. The default stays at 30 and C.

### Source provenance reconciled; benchmarks compared
All 50 segments' methodology notes named publications that were not in their `sourceIds` and claimed calibration. The notes were rewritten from each segment's own fields (originals kept). A second verification pass read none of the 12 cited documents as cited, but compared 14 individual assumptions with figures in four related documents: 4 consistent, 2 partly consistent, 6 below the located figure (Bandra Kurla Complex office rent most clearly), 1 above and 1 context only. No assumption was changed to fit — a recalibration would need a documented method — and no status was upgraded. The test that demanded zero verified sources for ever was replaced by one that demands traced evidence whenever verification is claimed.

### Agent replies that fail the check are quarantined
A reply that failed the consistency check used to be shown with a warning and passed on to the next agent and the report. Now a live reply that fails is sent back once with its problems; if it fails again it is withheld — shown collapsed, not passed on, not printed in the report — and a failed live call is labelled "fresh generation was unavailable", never replaced by stored text. Tested in the browser with the agent endpoint mocked (network, quota, quarantine, withholding) and once on a real reply, which needed and passed one revision.

### Demo checked through the controls
Every runbook figure is now computed at full precision by `runbookExpected.js`, recomputed independently (T-178, and once in Python), and driven through the amount field, sliders and custom-portfolio form in the browser. The worked examples had multiplied rounded yields (7.03%, 8.90%); they now show 7.0275% and 8.9035%. An invalid amount now shows a message instead of reverting silently. One behaviour was documented: an amount the user typed is kept when the portfolio changes.

### Smaller corrections
The proxy now listens on 127.0.0.1 by default and its default model matches `.env.example`; documents no longer say the key "never leaves" the machine (the proxy sends it to Google to authenticate) or that having no dependencies means no vulnerabilities; the gross-yield limitation no longer claims every comparison overstates returns; the runbook no longer says a passing System Check guarantees its figures. The 390 px acceptance run found horizontal overflow on four pages that the earlier run had missed; wide tables now scroll within themselves.

### Agent Output removed from the public site
The public site could show AI commentary only for the four presets at their default settings, because a static host cannot hold an API key; any other weights or amount showed nothing, which looked like a limitation of the agents rather than of the hosting. The page is now offered only on a local copy: `public/js/siteMode.js` removes the link and the page on any host other than `localhost` before the router starts, the Overview lists the page as "local copy only", and the Decision Report says why there is no commentary. On a laptop the page works as before — live for any settings through the proxy, or the stored commentary on a local static server as a no-key fallback. **Rejected alternative:** a hosted serverless proxy, which would make live analysis public but expose the key's quota to anyone and needs a deployment. Tested with T-181 and in the browser with `?publicSite=1`.

---

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

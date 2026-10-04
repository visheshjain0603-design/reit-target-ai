# Process Log — REIT Target AI

> **On the `[superseded]` marker.** Lines in this document tagged
> `[superseded]` record something that was true of an earlier revision of the
> project and is not true now. They are kept deliberately: a log or a test
> record edited to agree with the present is no longer evidence of what
> happened. The current figures are in
> [`CANONICAL_FACTS.md`](CANONICAL_FACTS.md), and the test suite fails on any
> *unmarked* line that contradicts them.


**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI | Vishesh Jain**

This document records the key development decisions, rationale, and lessons learned during construction of the project.

---

## Phase 1 — Portfolio Analysis page (baseline)

### Decision: Reuse existing design system
The project shares a CSS design system with a separate production application (a Rental Manager). Rather than starting from scratch, REIT Target AI was given its own component stylesheet (`reit-components.css`) that coexists with the shared CSS without redefining any shared class names. This saved approximately 4 hours of design work and produced a consistent visual language.

**Risk managed:** The production application's files (JS, JSON, Firestore config) were never opened, modified, or referenced. All new REIT files were written to a completely separate project folder. The shared CSS is a read-only dependency.

### Bug: SafariWebKit rejects curly/smart quotes in string literals
During testing, the Portfolio page was blank in Safari. The root cause was two string literals in `portfolio.js` that contained Unicode curly double-quotes (U+201C, U+201D) — likely introduced by a text editor that auto-corrected straight quotes to typographic ones. Safari's JSCore engine throws a SyntaxError on these; Chrome's V8 accepts them.

**Fix:** Replaced with single-quoted outer delimiters and straight double-quote content characters. Verified with a Python byte-level search that no curly quotes remain anywhere in the file.

**Lesson:** Always lint JS files for Unicode typographic quotes before browser testing, especially on Safari. Consider adding an ESLint rule (`no-irregular-whitespace` catches some cases) or a pre-commit hook.

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

### Decision: Real-time weight sliders with sum-to-100 enforcement
Sliders update in real-time (on `input` event). When a slider moves, the remaining weight is proportionally redistributed among the other four sliders. This avoids the common UX problem where users move one slider and then need to manually adjust the others to sum to 100.

**Edge case:** If one slider is at 100% and another is moved, the first slider drops to 0. This is tested via T08 and T09 (the engine rejects invalid weights).

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

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

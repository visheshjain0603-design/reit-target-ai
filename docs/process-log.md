# Process Log — REIT Target AI

**NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo**

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

### Decision: 18 market segments across 7 cities
Eighteen segments were chosen to be large enough to make the ranking and normalisation meaningful (at least 3 per city, providing within-city variation) but small enough for the factor score breakdown table to be readable on a laptop screen.

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
When the user selects a market on the Screener page, the `marketId` and `investmentCr` are written to `localStorage`. The Diversification page reads these on mount. This produces a seamless "select then analyse" flow without requiring URL parameters (which would conflict with the hash router) or a shared global variable (which would reset on page refresh).

### Decision: CSV import via FileReader (browser-side)
The CSV import feature was kept entirely in the browser to avoid a server round-trip for a file the user already has locally. The trade-off is that CSV parsing errors (malformed rows) are silent — rows that fail schema validation are dropped with a count shown in a toast, but the user does not see a per-row error report.

---

## Phase 5 — Diversification analysis

### Decision: Show raw HHI values, not just "improved/worsened"
The before/after cards display the raw HHI number (e.g., "0.2345 → 0.2198") alongside the directional indicator. This allows the evaluator to cross-check against the formula independently, which is important for academic assessment.

### Decision: Sensitivity analysis as three preset scenarios
Rather than a full parametric sweep (which would take O(n×presets) API calls), the sensitivity analysis runs the three non-balanced presets (Income Focused, Growth Focused, Diversification Focused) deterministically and shows how the top-3 markets shift. This makes the analysis meaningful without excessive complexity.

---

## Phase 6 — Gemini agents

### Decision: Sequential agent chain, not parallel
The five agents run in sequence — the Orchestrator explicitly waits for all four specialist agents. This was a deliberate design choice: the Orchestrator's system prompt says it receives "VALIDATED outputs" from the prior agents, implying validation happens first. Running in parallel would require merging partial results, complicating the activity trail UI.

**Trade-off:** Sequential calls mean total latency can reach 20–30 seconds. For an academic demo with an evaluator present, this is acceptable. A production system would use parallel calls or streaming.

### Decision: Zero npm dependencies in server.js
The Node.js proxy server uses only built-in modules (`http`, `https`, `fs`, `path`, `url`). This means:
- No `npm install` required to start the server
- No `node_modules/` directory in the repository
- No supply-chain vulnerabilities to audit

The trade-off is more boilerplate (manual `.env` parsing, manual JSON body reading, manual HTTPS calls) compared to using `dotenv`, `express`, and `node-fetch`. These are all well-understood patterns and the resulting code is approximately 330 lines.

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

*NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | September 2026 | Academic demonstration only*

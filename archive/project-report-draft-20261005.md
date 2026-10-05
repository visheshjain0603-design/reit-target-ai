# REIT Target AI

**Project report**

| | |
|---|---|
| Author | Vishesh Jain |
| Institution | NMIMS — B.Sc. Finance |
| Course | Business Analytics, Theme 4 — Building Agents/Artifacts Using Generative AI |
| Date | 4 October 2026 |
| Repository | https://github.com/visheshjain0603-design/reit-target-ai |
| Live site | https://visheshjain0603-design.github.io/reit-target-ai/ |

*Academic demonstration. All data is synthetic. Nothing in this report describes a real property, tenant, transaction or market, and nothing in it is investment advice.*

---

## Executive Summary

REIT Target AI is a browser application that helps a real estate investment trust (REIT) analyst explore where a new investment might be placed. It ranks a universe of synthetic Indian market segments against a synthetic sample portfolio, measures how the investment would change the portfolio's concentration, projects the result under three scenarios, and asks four Gemini language-model agents to explain the figures in plain English.

The design rests on one division of labour: **deterministic code calculates; the language model only interprets.** Every score, rank, screen outcome, concentration figure and projection is computed in JavaScript from the data files. The agents receive those figures as a fixed context, may not introduce figures of their own, and every reply is checked against that context before it is shown.

Three ideas are kept strictly apart throughout the application:

1. the **composite attractiveness score** — five weighted factors, which never changes because of anything else;
2. **simulation support** — how many simulated market observations stand behind a segment's medians, how wide their spread is, and the project's internal **Assumption Support Grade**; and
3. **external calibration** — whether any cited source was located and a figure traced to it.

The model output is a **shortlist candidate**: the highest-ranked candidate passing the simulation-support screen (at least 30 simulated observations and Assumption Support Grade C or better). The screen is a project governance convention for simulation precision, not evidence about the real market. External calibration is Unverified for every segment, because none of the twelve cited external documents could be located (see `docs/SOURCE_VERIFICATION_REPORT.md`). Every candidate therefore carries the same caveat: *exploratory shortlist only; proceed to further evidence collection and due diligence before any real decision.*

The most important engineering change in the final version is a **single shared analysis run** (`public/js/analysisRun.js`). An earlier design let each page read a stored snapshot at a moment of its own choosing, so after a change of preset one page could analyse a different target from the others. Every page now renders one object computed from the user's inputs, and re-renders whenever it changes.

The headline results for each weight preset are generated from the application's own code and appear in Section 4. Under three of the four presets the highest raw-score market fails the simulation-support screen, and the shortlist candidate sits lower in the raw ranking; Section 4 explains why.

---

## 1. Introduction

### 1.1 Background

Choosing a target market for a REIT acquisition means weighing income, growth, diversification, demand and risk against one another. Spreadsheet models handle the arithmetic well but explain little. Large language models explain fluently but cannot be trusted to compute, rank or check figures, and they state wrong figures with the same confidence as right ones. The question behind this project was:

> How can a deterministic financial model and language-model agents be combined so that the model does all of the calculation, the agents only explain it, and the explanations can be checked against the calculation?

A second question emerged during development and shaped the final version: how should an analytical tool built on synthetic data describe the support behind its outputs without implying that the support is evidence about a real market?

### 1.2 Scope

The application has eight routes:

| Page | What it does |
|---|---|
| Overview | Landing page: the canonical facts, the current analysis, a comparison of the selected target with the highest raw-score alternative or the next eligible candidate, the limits of the tool, and Reset Demo |
| Portfolio | The sample portfolio, or a custom portfolio the user creates, edits and deletes |
| Market Screener | Weight presets and sliders, investment amount, the screen override, manual selection of a target, display filters, and the simulated distribution behind each segment |
| Diversification | Concentration (HHI) before and after investing in the selected target; raw-score and eligible-shortlist tables; sensitivity across all four presets, showing both the highest raw-score market and the shortlist candidate; scenario projections |
| Statistical Analysis | Descriptive statistics, sample adequacy, stratified correlation, Simpson's paradox, a limited regression, detection of known synthetic anomalies, limitations and Key Findings |
| Agent Output | The four agents' commentary, the eight deterministic checks, and the result of checking each reply |
| Data Centre | Five analytical levels of data, kept apart, and a ten-item System Check |
| Decision Report | A printable report of the current analysis |

Out of scope: real market data, transaction costs, leverage, tax, regulatory review, and any claim that a figure is externally verified.

### 1.3 Technology

The application is plain JavaScript with no framework and no build step, so every line can be read without tooling. The analytical modules (`scoringEngine.js`, `hhi.js`, `projection.js`, `governance.js`, `analysisRun.js`, `agentContext.js`, `validator.js`, `agentOutputCheck.js`, `scenarioKey.js`) are pure functions that run identically in the browser and in Node, which is what allows the test suites and the cache builder to use exactly the code the pages use.

A small Node proxy (`server/server.js`, no npm dependencies) holds the Gemini API key server-side and forwards agent calls. The data pipeline (`data-pipeline/scripts/`) generates and aggregates the synthetic data and writes `public/data/`. The site is published to GitHub Pages as static files; the proxy is not deployed there.

---

## 2. Problem statement

A REIT analyst considering a new acquisition faces four problems that this project addresses.

**Concentration.** If the existing portfolio is concentrated in one city or one asset type, an acquisition in the same place adds risk rather than diversification. The analyst needs a measure of concentration and a way to see how a proposed investment changes it.

**Market selection under competing priorities.** Income, growth and diversification pull in different directions. Ranking segments needs a multi-factor score whose weights the analyst can change and whose sensitivity to those weights is visible.

**Support behind a ranking.** A segment can score highly on figures that rest on thin or loosely constructed assumptions. The analyst needs to see how well each segment's figures are supported, kept separate from how attractive they look — and, in this project, needs to be told plainly that no figure has been externally verified.

**Explanation that can be trusted.** Plain-language explanation helps non-specialist readers, but a language model asked to explain figures may misstate them. The explanation layer must be grounded in the computed figures and checked against them.

---

## 3. Methodology

### 3.1 Synthetic data generation and segment aggregation

**The generator.** `data-pipeline/scripts/generateObservations.js` (generator version 2.0.0, seed 20260919) produces the simulated market observations. Each observation is one seeded draw for one segment: monthly rent per sq ft, value per sq ft, gross yield, rental growth, capital growth, occupancy, vacancy, demand score and market risk score. It is not a property, listing or transaction.

The generator is built so that the figures cannot contradict one another:

- **Rent is sampled, yield is modelled, value is derived.** Gross yield is modelled as a base for the property type plus adjustments for locality class and city tier plus noise; value per sq ft is then rent × 12 ÷ yield. Prime localities and first-tier cities receive yield compression, so the expected negative relationship between price and yield emerges from the construction.
- **Dependence between metrics.** The remaining metrics are drawn through a Gaussian copula (Cholesky factorisation of a stated correlation matrix) and mapped back through each metric's triangular marginal from `data-pipeline/market_estimates_long.csv`, so the assumed lower/central/upper ranges are preserved.
- **Dispersion by city tier.** First-tier cities are generated with tighter dispersion than third-tier cities.
- **Draws per segment.** The number of draws for each segment is proportional to a liquidity proxy (locality class × city tier, with seeded noise), rescaled to a fixed total, with a minimum per segment.
- **Known synthetic anomalies.** A documented set of anomalies of five kinds (subtle mispricing, distressed sale, trophy asset, data-entry error, and a bivariate-only kind visible only to a multivariate method) is inserted, and their identities are written to a separate ground-truth file (`data-pipeline/generated/outlier_truth.json`) so that detector precision and recall can be measured rather than asserted.

The pseudo-random generator is Mulberry32 with a fixed seed; nothing reads the clock or `Math.random`. Regenerating reproduces the committed output byte for byte, and continuous integration fails if it does not.

**Segment aggregation.** `data-pipeline/scripts/deriveMarkets.js` builds `public/data/markets.json` from the observations. Each segment's statistical fields — value per sq ft, monthly rent per sq ft, rental growth, demand score, risk score — are the **medians** of its simulated observations, and `observationCount` is the number of draws actually generated. An `uncertainty` block records the P10, median and P90 of the draws. Provenance fields (cited source IDs, assumption IDs, Assumption Support Grade, locality class, classification notes) are carried through unchanged. Field definitions and units are in `docs/data-documentation.md`.

**The sample portfolio.** `public/data/portfolio.json` holds ten synthetic holdings with value, annual rent, area, occupancy, lease expiry and tenant sector. Values and rents are in rupees.

### 3.2 Five-factor scoring and weight presets

`public/js/scoringEngine.js` scores every valid segment on five factors, each on a 0–100 scale.

| Factor | Raw input | Scaling |
|---|---|---|
| Rental yield | gross yield = median monthly rent × 12 ÷ median value per sq ft | min–max across the valid segments |
| Rental growth | median annual rental growth | min–max across the valid segments |
| Diversification benefit | the portfolio's existing share in the segment's city and property type | formula below, already 0–100 |
| Demand | median demand score | min–max across the valid segments |
| Low market risk | 100 − median risk score | fixed 0–100 scale |

Min–max scaling is `(value − min) ÷ (max − min) × 100`, returning 50 when every segment has the same value. The diversification benefit is computed from the portfolio, not from the segment's own figures: for the segment's city, the benefit is 1 if the portfolio holds nothing there and otherwise `max(0, 1 − 2 × share)`; the same is computed for the property type; the factor is `100 × (0.6 × city benefit + 0.4 × type benefit)`.

The **composite attractiveness score** is the weighted sum of the five factor scores, bounded to 0–100. Segments are sorted by score, highest first; ties are broken by segment ID so the ranking is deterministic. A segment's position in this list is its **raw rank**. Records that fail validation (missing fields, non-positive value, scores outside 0–100, negative growth) are excluded from ranking.

Four presets are provided. Custom weights are accepted only when the five weights total 100%.

| Preset | Rental yield | Rental growth | Diversification | Demand | Low market risk |
|---|---|---|---|---|---|
| Balanced | 25% | 25% | 20% | 20% | 10% |
| Income Focused | 45% | 10% | 15% | 20% | 10% |
| Growth Focused | 10% | 40% | 20% | 20% | 10% |
| Diversification Focused | 15% | 15% | 45% | 15% | 10% |

The scoring is deterministic: the same data, portfolio and weights always give the same scores and ranks.

### 3.3 Concentration (HHI) and projections

**Herfindahl–Hirschman Index.** `public/js/hhi.js` measures concentration separately by city and by asset type:

```
HHI = Σ shareᵢ²
```

where each share is that city's (or asset type's) fraction of total portfolio value. Values are book values from the portfolio file. The application labels HHI below 0.15 as diversified, 0.15 to 0.25 as moderate and above 0.25 as concentrated; these are descriptive bands for reading the figure, not regulatory thresholds.

**Simulating the investment.** The investment amount (by default 10% of the active portfolio's value) is added to the portfolio as one synthetic holding in the selected target's city and property type, with value equal to the amount and annual rent equal to the amount × the segment's gross yield. City HHI, asset-type HHI, weighted gross yield, total value and total rent are reported before and after.

**Projections.** `public/js/projection.js` projects the post-investment portfolio at one, three and five years under three scenarios with flat annual rates:

| Scenario | Rental growth | Capital growth | Occupancy |
|---|---|---|---|
| Conservative | 3% | 4% | 80% |
| Base | 6% | 8% | 90% |
| Optimistic | 10% | 12% | 95% |

Projected rent is `rent₀ × (1 + g)ⁿ`, projected value is `value₀ × (1 + c)ⁿ`, gross yield is rent ÷ value, and effective gross yield applies the scenario occupancy to rent. There is no leverage, tax, fee, transaction cost, correlation structure or stochastic simulation.

### 3.4 Simulation support, external calibration and the shortlist-candidate rule

**Simulation support.** Each segment carries three indications of how well its figures are pinned down by the simulation: the number of simulated observations behind its medians, the P10–P90 spread of those draws, and its **Assumption Support Grade**. The grade is the project's own A–E classification of how the segment's assumption set was constructed and how wide a band was assumed around it:

| Grade | Meaning (from `public/js/appMeta.js`) |
|---|---|
| A | Assumptions intended to follow a named primary benchmark; narrowest assumed band (±5–8%) |
| B | Assumptions intended to follow a primary or secondary benchmark with minor interpolation (±10–12%) |
| C | City-level benchmark adjusted by a locality-class multiplier (±15–20%) |
| D | Estimated from comparable segments; wide assumed band (±20–30%) |
| E | Placeholder assumptions; widest assumed band (±30–40%) |

The grade is **not an evidence grade**: none of the benchmarks it refers to has been externally verified. More simulated draws narrow a segment's median around the *assumed* distribution; they do not show that the assumption is true of any real market.

**The simulation-support screen** (`public/js/governance.js`) passes a segment when it has at least 30 simulated observations **and** Assumption Support Grade C or better. It reports each component separately — failing on simulated observations, on the grade, or on both — because those are different problems and the agents must not attribute an exclusion to the wrong one. The thresholds are a transparent project governance convention for simulation precision, not a regulatory or universal statistical threshold. A segment's position among the segments that pass is its **eligible rank**. The screen never changes a score or a raw rank; the test suite asserts this.

**External calibration** is a separate status — Verified, Partially supported or Unverified — derived only from the source register (`data-pipeline/source_register.csv`) by `data-pipeline/scripts/buildMeta.js`. A segment is Verified only when every external source it cites has been located and the figure traced; it cannot be inferred from observation count or grade. Because no cited document was located, every segment is Unverified.

**The shortlist-candidate rule.** The **shortlist candidate** is the highest-ranked candidate passing the simulation-support screen. Alongside it the application always shows the **highest raw-score market** (raw rank 1) and, when that segment fails the screen, the reason it failed. Every candidate carries the fixed caveat: "Exploratory shortlist only. External calibration remains unverified — proceed to further evidence collection and due diligence before any real decision." The user may ignore the screen explicitly, in which case the candidate is the highest raw-score market and the report records that the screen was ignored.

### 3.5 The shared analysis run

`public/js/analysisRun.js` computes one analysis object from two things:

- **Persisted inputs** — preset, exact weights, investment amount, screen override, selection mode, manual target and display filters (filters change what is displayed, never the analysis).
- **Data** — the market segments, the **active** portfolio (the sample portfolio, or the user's custom portfolio when it is active and non-empty), the source-verification outcomes and the statistics file.

The run holds the full ranking (raw rank, eligible rank, screen result and external calibration status for every segment), the highest raw-score market, the shortlist candidate, the selected target and selection mode, HHI before and after, projections, the per-preset sensitivity table (highest raw-score market and shortlist candidate for each preset), the result of the deterministic validation, the agent context and the scenario key.

Only the inputs are stored in the browser; the analysis itself is never stored. Any change of input goes through one update function, which recomputes the run and notifies every subscribed page in the same tick. No page computes a target, an HHI figure or a projection of its own. Overview, Market Screener, Diversification, Agent Output, Decision Report and Data Centre all render the same object.

**Selection modes.**

- **Automatic** — the selected target is the shortlist candidate and follows every change of preset, weights, amount, portfolio or screen setting.
- **Manual** — the user's chosen segment is kept across changes and labelled "Manually selected target" on every page. When it differs from the current shortlist candidate, every page says so, and a "Return to automatic recommendation" button restores automatic selection.

**Reset Demo** (on the Overview) opens an explicit confirmation panel with *Reset to defaults* and *Cancel*. Reset clears only the application's own storage keys, restores the sample portfolio (a custom portfolio is kept but made inactive), the Balanced preset and its weights, the default investment, the screen applied, automatic selection and no filters, then recomputes at once so the Overview shows a valid analysis immediately.

**The scenario key** (`public/js/scenarioKey.js`) reduces everything that can change the analysis — dataset, portfolio, weights, amount, selected target, selection mode, screen override, shortlist candidate, the top five of the ranking, methodology version 1.0.0 and agent-context version 2 — to one hash. It decides whether stored agent commentary describes the run on screen.

### 3.6 The four-agent interpretation layer, deterministic validation and output checking

**Agents.** Four Gemini agents run in sequence, with a deterministic gate before the last:

1. **Data & Statistical Analyst** — reads the dataset's quality and descriptive statistics together: sample sizes, dispersion, correlation structure and the anomalies the detectors found.
2. **Market Screening Analyst** — explains why the selected target scored as it did, and how it differs from the highest raw-score market and the next eligible candidate.
3. **Portfolio Risk & Scenario Analyst** — interprets the concentration change the investment would cause and what the scenario projections imply.
4. *Deterministic validation (code, no model call).*
5. **Investment Orchestrator** — combines the three analyses into one summary with rationale and risk warnings. It runs only after the deterministic checks pass.

The agents interpret; they never calculate, rank or validate.

**Deterministic validation.** `public/js/validator.js` runs eight checks before the Orchestrator is called, each reporting the figures it compared: the five weights total 100%; every composite score lies within 0–100; the ranking is sorted by descending score; the selected target appears in the ranking; city and asset-type HHI recomputed from the holdings match the context; weighted yield equals rent ÷ value; the investment amount is positive and finite; the synthetic-data notice is present in the context. The same module holds the fixed list of the project's limitations, so the limitations shown never depend on a model.

**The context.** `public/js/agentContext.js` builds the agents' context from the shared run (`fromRun()`), so the context the Agent Output page sends, the context stored commentary was written against, and the figures every other page shows are one object. It names every concept explicitly — raw rank, eligible rank, highest raw-score market, shortlist candidate, selected target, selection mode, whether the screen is passed, external calibration status, simulated-observation count, Assumption Support Grade, the largest factor contribution and the exact exclusion reason for every segment that outranks the target. Figures are supplied as fixed-decimal strings, so a figure displayed as "7.00%" is quoted as "7.00%" and not "7%". Market-dataset figures and portfolio figures are labelled separately so that one cannot be described as the other.

**Response schemas.** `public/js/agentOutputCheck.js` defines a strict JSON schema for each agent. The proxy passes it to Gemini as `responseSchema`. The schemas contain prose fields only — no number fields — and the interface renders headline figures from the context, never from the prose. Calls use JSON output and temperature 0.2.

**Output checking.** Every reply is checked by `AgentOutputCheck.check()` against the context it was given. The check rejects: markets that do not exist or are not in the context; rank claims that contradict the raw or eligible rank; figures that match nothing in the context at the stated precision (a percentage may only match a percentage figure); exclusion reasons that contradict the screen; a dominant factor other than the largest contribution; retired terminology and claims that simulated figures are evidence; leaked context field names; and, for the Orchestrator, failure to name the selected target or to state that calibration is unverified and due diligence is required. The result is shown on each agent card. The check can prove certain kinds of statement false; it cannot prove prose true.

**Live and static modes.** In live mode the page is served by the local proxy (`node server/server.js`, then `http://localhost:3001`) with `GEMINI_API_KEY` in the git-ignored `server/.env`. On any other origin, including GitHub Pages, the proxy is not probed. There, "Show Pre-generated Analysis" serves `public/data/agent-cache.json` only when the run's scenario key matches a stored scenario exactly; the button then reads "Hide Pre-generated Analysis". Otherwise only the deterministic figures are shown, with the reason.

**The cache.** `data-pipeline/scripts/buildAgentCache.js` builds one scenario per preset at the canonical defaults (sample portfolio, default investment, screen applied, automatic selection) — four presets × four agents. Each scenario is computed with the same `analysisRun.js` the browser uses. Every reply must pass the output check before it is written; a failing reply is sent back with its specific problems listed, up to two revisions; if any reply still fails, nothing is written.

**Tests.** `node tests/reit-tests.js` (application suite; for the current count see the latest run in `docs/test-report.md`), `node data-pipeline/tests/dataPipeline.test.js` (data pipeline), `node data-pipeline/scripts/auditAnalytics.js` (re-derives every headline figure by an independent route and exits non-zero on disagreement), and a browser acceptance script (`tests/browserAcceptance.js`) that runs inside the application, drives it through its own controls and reads what each of the eight routes shows. Continuous integration runs the two Node test suites and a reproducibility check of the generator on every push to `main` and on pull requests.

---

## 4. Results

All results below are produced by the application's own code at its defaults and describe synthetic data only.

### 4.1 Key figures

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

### 4.2 Results for each preset

<!-- canonical:BEGIN preset-results -->
| Preset | Highest raw-score market | Screen | Shortlist candidate (raw rank) | Score | Gross yield | City HHI after | Asset-type HHI after |
|---|---|---|---|---|---|---|---|
| Balanced | Ambattur, Chennai (72.45) | fails (simulated observations and support grade) | Gurugram — Cyber Hub, Delhi NCR (5) | 67.71 | 7.03% | 0.3496 | 0.6588 |
| Income Focused | GIFT City, Ahmedabad (75.40) | fails (simulated observations and support grade) | Aerocity, Delhi NCR (8) | 68.18 | 7.00% | 0.3496 | 0.6588 |
| Growth Focused | Banjara Hills, Hyderabad (77.36) | passes | Banjara Hills, Hyderabad (1) | 77.36 | 2.66% | 0.3595 | 0.5438 |
| Diversification Focused | New Town (Rajarhat), Kolkata (73.32) | fails (simulated observations and support grade) | Banjara Hills, Hyderabad (2) | 72.82 | 2.66% | 0.3595 | 0.5438 |

All at the defaults: sample portfolio, ₹50.00 Cr, screen applied, automatic selection. Generated by `data-pipeline/scripts/buildMeta.js` from the same `analysisRun.js` the application uses.
<!-- canonical:END preset-results -->

The table is generated by `data-pipeline/scripts/buildMeta.js` from the same analysis run the pages render, so it cannot disagree with the application.

**Balanced.** The shortlist candidate is Gurugram — Cyber Hub, Delhi NCR, at raw rank 5 and eligible rank 1. The four segments above it all fail the screen: Ambattur, Chennai (the highest raw-score market); Baner, Pune; Noida — Sector 62, Delhi NCR; and GIFT City, Ahmedabad. All four are Commercial Office segments in the Growth locality class with Assumption Support Grade D. Three of them also fall below the 30-observation minimum, so they fail on both counts; Noida — Sector 62 has enough simulated observations and fails on its grade alone. Gurugram — Cyber Hub has grade B and a large number of simulated observations, so it passes. Its largest factor contribution is demand. The next eligible candidate, Aerocity, Delhi NCR, is at raw rank 6 and almost level on score. The cost of applying the screen under Balanced is the difference between the two scores in the table.

**Income Focused.** The shortlist candidate is Aerocity, Delhi NCR, at raw rank 8 and eligible rank 1. Seven segments outrank it and all fail the screen, for different reasons: GIFT City, Ahmedabad (the highest raw-score market), Ambattur, Chennai, Baner, Pune and Park Street, Kolkata fail on both simulated observations and grade; SG Highway, Ahmedabad and Salt Lake Sector V, Kolkata have grade C but fall below the 30-observation minimum; Noida — Sector 62, Delhi NCR fails on its grade alone. Aerocity's largest contribution is rental yield. Income Focused is the preset with the largest gap between the highest raw score and the shortlist candidate's score, and so the one where the screen's convention matters most to the outcome.

**Why the candidate falls so far down the raw ranking under Balanced and Income Focused.** The cause is structural, not accidental. The generator models higher yields for the Growth and Peripheral locality classes and for the third-tier cities (Ahmedabad, Kolkata), and its liquidity proxy gives those same segments fewer simulated draws; the project also assigned lower Assumption Support Grades to Growth-class and Peripheral segments (every Growth-class segment is graded D and every Peripheral segment E). Prime, deep segments in first-tier cities receive yield compression but many draws and better grades. A preset that rewards rental yield therefore puts high-yield, thinly simulated, low-graded segments at the top of the raw ranking — exactly the segments the screen excludes. Across the four presets, the shortlist candidate's raw rank rises with the weight on rental yield: raw rank 1 under Growth Focused (10%), 2 under Diversification Focused (15%), 5 under Balanced (25%) and 8 under Income Focused (45%). The screen and the yield factor pull in opposite directions by construction, and a reader should understand that before reading the shortlist as a judgement about any segment.

**Growth Focused.** Banjara Hills, Hyderabad (Residential) is both the highest raw-score market and the shortlist candidate, and passes the screen. Its largest contribution is rental growth. It is also the segment with the lowest gross yield in the universe, so investing in it lowers the portfolio's weighted gross yield.

**Diversification Focused.** The highest raw-score market, New Town (Rajarhat), Kolkata, fails on both counts; the shortlist candidate is again Banjara Hills, Hyderabad, at raw rank 2. Its largest contribution is diversification: Residential is a small share of the sample portfolio.

### 4.3 Concentration

The sample portfolio's city HHI before investment is 0.4130 and its asset-type HHI is 0.6316, both above the 0.25 band: the portfolio is concentrated in Mumbai and in Commercial Office (see `docs/data-documentation.md` for the allocation).

- Under **Balanced** and **Income Focused** the candidate is a Delhi NCR office segment. Delhi NCR is a new city for the portfolio, so city HHI falls to the figure in the table — but the asset-type HHI *rises*, because the investment adds more Commercial Office to a portfolio already dominated by it.
- Under **Growth Focused** and **Diversification Focused** the candidate is a Hyderabad residential segment. Asset-type HHI falls substantially, and city HHI falls less, because Hyderabad is already held.

Under every preset both measures remain in the concentrated band after a single investment of the default size. The Portfolio Risk & Scenario Analyst is instructed to state the concentration that remains, not only the direction of change.

### 4.4 Validation and agent commentary

For each of the four default runs all eight deterministic checks pass. The stored commentary in `public/data/agent-cache.json` holds four scenarios, one per preset, keyed by the scenario keys that `meta.json` records for the same runs. Each of the sixteen stored replies is marked as having passed the output check; the build record shows seventeen API calls, meaning one reply was returned for revision once before it passed. The stored replies record the model `gemini-3.1-flash-lite`. Stored commentary is shown only for an exact scenario-key match and is labelled as stored text, not a live call.

---

## 5. Discussion

### 5.1 What worked

**Calculation and interpretation kept apart.** Treating the agents as interpreters of a fixed context, rather than as calculators, is what makes their output checkable at all. Because every figure an agent may quote is in the context at a known precision, a figure in the prose that matches nothing in the context is a detectable error rather than a matter of judgement.

**Validation in code, not in a model.** Every validation question — do the weights total 100%, is the target in the ranking, do the HHI figures reproduce — has one correct answer that arithmetic establishes. Moving these checks out of the agent chain made the verdict reproducible, available offline, and able to show the numbers it compared.

**Figures derived, never typed.** `public/js/appMeta.js` derives every count from the data files, and `buildMeta.js` writes `meta.json`, `docs/CANONICAL_FACTS.md` and the generated blocks in the documentation from that derivation. The test suite fails if a block is stale. This removed a recurring problem in which documents stated different facts about the same project.

**A reproducible synthetic dataset.** A seeded generator with an explicit model of yield, a copula for dependence and a separate ground-truth file for anomalies makes the data's structure inspectable and the anomaly detectors measurable.

### 5.2 What was hard

**The cross-page synchronisation defect.** In the earlier design the Market Screener computed an analysis and wrote a snapshot to browser storage, and every other page read that snapshot at a moment of its own choosing. The Diversification page read it only once, when the application loaded. After the user switched from Balanced to Income Focused, the Overview, Agent Output and Decision Report described Aerocity while Diversification went on analysing Gurugram — Cyber Hub and showed the Balanced Top 3 and projections. No single page was wrong; the pages held different copies of the analysis. The root cause was architectural — a stored computed result read at different times — so the fix had to be architectural too: store only the inputs, compute one run from them, and have every page subscribe to that run. Nothing remains that can go stale. For each preset, the browser acceptance script now checks that the Overview, Market Screener, Diversification, Agent Output and Decision Report name the same target, and that Diversification and the Report show identical projections and the active preset's raw-score table.

**Correcting the evidence terminology.** Earlier versions described the observation-and-grade threshold, and the A–E grade, in the language of evidence, and justified the 30-observation threshold with a general statistical argument. The source verification in `docs/SOURCE_VERIFICATION_REPORT.md` then established that none of the twelve cited external documents could be located and no figure could be traced. Language implying evidence could not be defended. The threshold was renamed the simulation-support screen and documented as a project convention for simulation precision; the grade became the Assumption Support Grade with an explicit statement that it is not an evidence grade; external calibration was introduced as a third, separate status derived only from the source register; and the model output became a shortlist candidate with a fixed caveat. The retired terms are listed in Section 5.3, and the output checker rejects them in agent replies. The lesson is that terminology is part of the method: a label that implies evidence is a claim, and it has to be supported like any other claim.

**Accuracy of the stored agent commentary.** The first build of the stored commentary was fluent and wrong in small ways that a reader would be unlikely to notice: the median gross yield across all market segments was described as the portfolio's yield; the agents used one informal word for "second place" to mean raw rank 2 in one reply and the next eligible candidate in another, so two different markets were each given that label; a candidate at raw rank 8 was said to have ranked first; exclusions were blamed on too few simulated observations when the segment had failed on its grade alone; "7.00%" was written as "7%"; and a model-written "expected yield" field held the target's yield in some scenarios and the portfolio's post-investment yield in others. Each of these is checkable against the context, so each is now checked. The context names every concept explicitly and supplies figures as fixed-decimal strings; the response schemas allow prose only; headline figures are rendered from the context; and `AgentOutputCheck.check()` runs before any reply is written to the cache and again whenever a reply is displayed. A failing reply is returned to the model with its problems listed, and nothing is written unless all sixteen replies pass.

**The diversification factor is a proxy.** The analytics audit (`data-pipeline/docs/ANALYTICS_AUDIT.md`) found that the factor correlates closely with the realised HHI change but takes only fifteen distinct values across all segments, because it depends only on the city and property type. It was recorded as a limitation rather than replaced, because replacing it would change every score and ranking.

### 5.3 History (superseded)

Kept short, for the audit trail only. None of the following describes the current system.

- The simulation-support screen was called the "evidence floor", and a segment that passed it "meets the floor". [superseded]
- The Assumption Support Grade was called a "confidence grade", and grade C was described as resting on "documented evidence". [superseded]
- Simulation-support levels were labelled with phrases such as "strong evidence". [superseded]
- The 30-observation threshold was justified by the Central Limit Theorem, which does not apply to medians of synthetic draws. [superseded]
- The comparison segment was called the "runner-up"; it is now the highest raw-score alternative or the next eligible candidate. [superseded]
- Known synthetic anomalies were called "planted anomalies". [superseded]
- The model output was called the "recommended target" or an "evidence-qualified recommendation"; it is now the shortlist candidate. [superseded]
- An earlier agent chain had six agents, including a Validation agent whose checks are now `validator.js`. [superseded]

---

## 6. Limitations

<!-- canonical:BEGIN screen-and-calibration -->
- **Composite attractiveness score** — the five weighted factors. Never changed by the screen.
- **Simulation support** — simulated observations behind a segment's medians, their P10–P90 spread, and the project's own Assumption Support Grade (A–E). A transparent project governance convention for simulation precision, not a regulatory or universal statistical threshold. Thirty draws keeps the P10–P90 spread of a segment's simulated medians reasonably narrow; grade C or better excludes segments whose assumptions the project itself classed as interpolated or placeholder. Passing the screen says nothing about real-market accuracy.
- **Simulation-support screen** — at least 30 simulated observations and Assumption Support Grade C or better. 25 of 50 segments pass.
- **External calibration** — from the source register only: 0 of 12 cited external sources verified; 0 partially supported. A segment is Verified only when every external source it cites is verified. Every segment is Unverified.
- **Wording** — the model output is a *shortlist candidate*: "Exploratory shortlist only. External calibration remains unverified — proceed to further evidence collection and due diligence before any real decision."
<!-- canonical:END screen-and-calibration -->

**Synthetic data.** Every portfolio holding, market segment and simulated observation is invented. The data's *relationships* — prime assets at lower yields, yield rising with risk within an asset class, thinner markets more dispersed — are built into the generator and can be checked by inspection. Its *levels* have not been shown to resemble Indian market levels.

**Unverified calibration.** None of the twelve cited external documents was located and no figure was traced to a source. Two register notes were found to be factually wrong and were corrected; no market value was changed to fit a source. Every segment's external calibration status is Unverified, and every candidate is exploratory.

**Simulation precision is not evidence.** Passing the simulation-support screen means that enough seeded draws stand behind a segment's medians and that its assumption set was graded C or better by the project itself. It says nothing about whether the figures are true of a real market. More draws narrow the estimate around the assumed distribution, not around reality.

**Model simplifications.** Gross yield only — no management fees, vacancy allowance, tax, leverage or transaction costs. HHI is computed on book value, not market value. The diversification factor is a coarse proxy for the realised HHI change. Projections use flat growth rates with no correlation structure and no stochastic simulation. No review against the SEBI (Real Estate Investment Trusts) Regulations, 2014 was carried out.

**Statistical limits.** City × property-type groups contain between one and six segments, so no bootstrap confidence interval is computed at that level (the unit is the micro-market and an interval needs at least ten); the Data Centre states this rather than showing an interval built on the wrong unit. Findings on the Statistical Analysis page describe the generator's construction, not the market.

**Agent layer.** The output check proves certain statements false; it cannot prove prose true. Stored commentary exists only for the four presets at the canonical defaults; any other configuration shows deterministic figures only unless the local proxy and an API key are available. Live calls depend on the availability and free-tier quota of the Gemini API.

---

## 7. Conclusions

REIT Target AI shows that a language-model layer can be added to a structured analytical workflow without letting it touch the arithmetic. The model computes; the agents explain; deterministic code validates the inputs before the final agent runs; and every reply is checked against the figures it was given.

Two lessons from the final version go beyond the specific application. First, consistency across a multi-page tool is an architectural property: one analysis object, computed from inputs and rendered everywhere, removed a class of defect that page-by-page fixes could not. Second, honesty about evidence is part of the method: separating attractiveness, simulation support and external calibration — and saying plainly that calibration is unverified — makes the tool's outputs weaker-sounding and more defensible.

The project meets the Theme 4 objective of building agents and artifacts with generative AI by embedding four Gemini agents in a reproducible analytical pipeline whose every figure can be traced to code and data. Its outputs are an exploratory shortlist on synthetic data, and further evidence collection and due diligence would be required before any real decision.

---

## References

The project cites the twelve external documents below in its source register (`data-pipeline/source_register.csv`). They were checked on 4 October 2026 by fetching each cited URL. **None of the cited documents was located, and no figure in the project has been traced to any of them.** The outcome of each check is recorded below and in `docs/SOURCE_VERIFICATION_REPORT.md`. They are listed as what the project cited, not as verified support for any figure.

| ID | Publisher | Cited document | Verification outcome |
|---|---|---|---|
| SRC-001 | Embassy Office Parks REIT | Embassy REIT Annual Report 2024-25 | URL corrected; publisher confirmed; document not located |
| SRC-002 | Mindspace Business Parks REIT | Mindspace REIT Annual Report 2024-25 | Publisher confirmed; document not located |
| SRC-003 | Brookfield India Real Estate Trust | Brookfield India REIT Annual Report 2024-25 | Access blocked; nothing confirmed |
| SRC-004 | Nexus Select Trust | Nexus Select Trust Annual Report 2024-25 | URL corrected; publisher confirmed; document not located |
| SRC-005 | JLL India | India Office Market Report Q4 2024 | URL corrected; publisher confirmed; document not located |
| SRC-006 | CBRE South Asia | India Real Estate Market Outlook 2025 | Publisher confirmed; document not located |
| SRC-007 | Knight Frank India | India Real Estate Outlook H1 2025 | Publisher confirmed; cited title not found; a comparable series exists |
| SRC-008 | Colliers India | Colliers India Office Market Q1 2025 | Access blocked; nothing confirmed |
| SRC-009 | ANAROCK Research | India Residential Market Report Q4 2024 | Access blocked; nothing confirmed |
| SRC-010 | Cushman & Wakefield India | India Office Leasing Outlook 2025 | Publisher confirmed; cited title not found; a comparable series exists |
| SRC-011 | Mint / Hindustan Times Media | India REIT market benchmark rentals 2024 (citing JLL) | Not verifiable as cited: the citation is a home page, not an article |
| SRC-012 | Economic Times Real Estate | Hyderabad commercial market overview citing Colliers 2024 | Not verifiable as cited: the citation is a section index, not an article |

The register also lists SRC-013, the project's own assumption set (`data-pipeline/assumptions.csv`). It is internal and makes no external claim.

The methods in Section 3 — the Herfindahl–Hirschman Index, min–max scaling, percentiles, the percentile bootstrap, Tukey fences and Mahalanobis distance — are standard techniques applied as described there. No textbook or regulatory text was checked for this report, and none is cited as the source of any figure. The use of AI tools in building the project is declared in `docs/ai-use-declaration.md`.

---

*REIT Target AI — Vishesh Jain — NMIMS B.Sc. Finance, Business Analytics, Theme 4 — 4 October 2026. Academic demonstration on synthetic data; not investment advice.*

# Limitations — REIT Target AI

**NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**
**Author: Vishesh Jain. All data in this project is synthetic.**

This document states what the project cannot establish, and why. It is meant to
be read alongside every result the application shows.

The application carries a fixed list of ten limitations in
`public/js/validator.js` (`LIMITATIONS`). The list is shown on the Agent Output
page under "Stated limitations of this analysis", passed to the Investment
Orchestrator, and does not depend on any model or network call. Each item is
expanded below, together with limitations the list does not cover. Headline
figures are carried by the generated block and by `docs/CANONICAL_FACTS.md`
rather than typed here.

---

## The application's fixed list

| # | Statement in the application (`validator.js`) | Section |
|---|---|---|
| 1 | All data is synthetic. No observation corresponds to a real property, tenant or transaction. | 1.1 |
| 2 | Gross yield only — no management fees, vacancy allowance, tax, leverage or transaction costs. | 4.1 |
| 3 | HHI is computed on book value, not on a mark-to-market valuation. | 4.2 |
| 4 | Scenario projections apply flat growth rates; no correlation structure or Monte Carlo simulation. | 4.5 |
| 5 | Market estimates are medians of a seeded simulation, not observed transaction prices. | 1.1, 2.1 |
| 6 | No regulatory review against the SEBI (Real Estate Investment Trusts) Regulations, 2014. | 8.1 |
| 7 | Language-model commentary interprets figures computed elsewhere; it neither verifies nor recalculates them. | 6 |
| 8 | External calibration is Unverified: none of the cited source documents was located and no figure was traced to a source (docs/SOURCE_VERIFICATION_REPORT.md). | 3 |
| 9 | More simulated observations narrow a segment's estimate around the project's assumed distribution; they are not market evidence. The simulation-support screen is a project convention, not a statistical or regulatory threshold. | 2 |
| 10 | The shortlist candidate is an exploratory model output, not an investment recommendation; further evidence collection and due diligence would be required. | 2.3, 8.3 |

## Simulation support and external calibration at a glance

<!-- canonical:BEGIN screen-and-calibration -->
- **Composite attractiveness score** — the five weighted factors. Never changed by the screen.
- **Simulation support** — simulated observations behind a segment's medians, their P10–P90 spread, and the project's own Assumption Support Grade (A–E). A transparent project governance convention for simulation precision, not a regulatory or universal statistical threshold. Thirty draws keeps the P10–P90 spread of a segment's simulated medians reasonably narrow; grade C or better excludes segments whose assumptions the project itself classed as interpolated or placeholder. Passing the screen says nothing about real-market accuracy.
- **Simulation-support screen** — at least 30 simulated observations and Assumption Support Grade C or better. 25 of 50 segments pass.
- **External calibration** — from the source register only: 0 of 12 cited external sources verified; 0 partially supported. A segment is Verified only when every external source it cites is verified. Every segment is Unverified.
- **Wording** — the model output is a *shortlist candidate*: "Exploratory shortlist only. External calibration remains unverified — proceed to further evidence collection and due diligence before any real decision."
<!-- canonical:END screen-and-calibration -->

---

## 1. Data

### 1.1 The data is synthetic

Every portfolio holding, market segment and simulated market observation in the
project is synthetic. Nothing describes a real property, tenant, listing or
transaction, and nothing may be used for an investment decision.

The market segments are not hand-typed. Each is the median of seeded simulated
observations produced by `data-pipeline/scripts/generateObservations.js`. Gross
yield is modelled from a cap-rate structure (property type, locality class, city
tier and noise); rent is sampled and capital value derived from rent and yield;
the remaining metrics are drawn through a Gaussian copula over triangular ranges
taken from `data-pipeline/market_estimates_long.csv`. This makes the dataset
internally consistent and exactly reproducible from its seed. It does not make
it real: the relationships are design decisions, and the levels are assumptions
(Section 3). The sample portfolio (`public/data/portfolio.json`) is a fixed
synthetic file.

### 1.2 A single snapshot, with no history

The data describes one date. There is no time series, no seasonality and no
market cycle; each segment's rental growth is a single assumed rate.

### 1.3 Limited coverage

The segment universe is small beside a real investable market and covers three
property types only. A real screen would draw on transaction databases,
regulatory and REIT disclosures and far more micro-markets.

---

## 2. Simulation precision is not real-world accuracy

### 2.1 More simulated draws are not evidence

The simulated observations are draws from distributions the project specified.
More draws make a segment's median converge on the median of its assumed
distribution, and narrow the P10–P90 spread around it. That reduces simulation
noise; it does nothing about whether the assumption is right. If an assumed
level is wrong, more draws estimate the wrong level more precisely. Simulation
support is therefore reported separately from external calibration on every
page, and the two are never combined into one quality figure.

### 2.2 The Assumption Support Grade is internal

The A–E grade is the project's own classification of how each segment's
assumption set was constructed — which kind of benchmark it was meant to follow
and how wide a band was assumed around it (`AppMeta.SUPPORT_GRADES`). None of
the benchmarks it refers to has been located, so it is not an evidence grade
and says nothing about real-market accuracy. For compatibility, the data field
that holds it is still named `confidenceGrade` in `markets.json`; the
application, the agent context and the report all use the label Assumption
Support Grade.

### 2.3 The simulation-support screen is a convention

The screen requires at least 30 simulated observations and Assumption Support
Grade C or better. Both thresholds were chosen, not derived. They are a
transparent project governance convention for simulation precision, not a
regulatory or universal statistical threshold, and the sampling-theory rule of
thumb about samples of thirty does not apply to medians of assumed
distributions. The screen has a hard edge: under the Income Focused preset, a
segment graded C is excluded for being one simulated observation short. Moving
either threshold would change the shortlist candidate under some presets.

The screen changes no score and no rank. The highest raw-score market is always
shown with the reason it failed; the user can ignore the screen or select any
segment manually, and both choices are labelled on every page and recorded in
the Decision Report. The resulting **shortlist candidate** is an exploratory
model output, not an investment recommendation.

---

## 3. External calibration is Unverified

External calibration asks whether the levels in the data match the sources the
project cites. A citation is verified only when the publisher exists, the cited
document is located, and the figure is found in it. The status is derived only
from `data-pipeline/source_register.csv`, through `buildMeta.js`, into
`public/data/meta.json`; it takes no account of simulated observations or grade,
so it cannot be inferred from simulation precision.

The verification pass located none of the cited documents (0 of 12) and traced
no figure (`docs/SOURCE_VERIFICATION_REPORT.md`). Some publishers were
confirmed, some sites blocked access, some cited titles do not exist as cited,
and two register notes were found to contain factual errors. Every segment is
therefore Unverified. No data value was changed to make a source appear to
support it.

What remains defensible without any document is the structure of the data —
for example, that yields are set by property type, locality class and city
tier. What is not established is that the levels resemble Indian market levels.

---

## 4. Financial model

### 4.1 Gross yield only

Gross yield is monthly rent × 12 divided by capital value. It ignores management
fees, vacancy, capital expenditure, insurance, taxes (GST, stamp duty, TDS on
rent), leverage and transaction costs. Net operating income and a true
capitalisation rate cannot be computed from the data, so every yield in the
project overstates what an investor would receive.

### 4.2 HHI on book value, with descriptive bands

The Herfindahl-Hirschman Index is computed on property (book) value, not on a
mark-to-market valuation, and is unadjusted for leverage. It measures two
dimensions only — city and asset type — and not tenant-sector or lease-expiry
concentration, although the portfolio file carries both fields. The bands used
in the interface (below 0.15 diversified, 0.15–0.25 moderate, above 0.25
concentrated) are descriptive benchmarks for illustration, not regulatory
classifications, and the interface says so wherever they appear.

### 4.3 The diversification factor is a proxy

One of the five scoring factors is a diversification benefit computed from the
portfolio's existing share in the segment's city and property type:
`max(0, 1 − 2 × share)` for each, weighted 60% city and 40% type, with full
benefit for a city or type not yet held. The coefficient of 2 was chosen, not
derived. Measured against the realised HHI change the same investment causes,
the factor is directionally sound but coarse, taking few distinct values
because it depends on city and type alone
(`data-pipeline/docs/ANALYTICS_AUDIT.md`, finding A2). It has not been replaced
with the realised change because that would alter every score and ranking; the
realised before-and-after HHI is displayed beside it so a reader can compare.

### 4.4 Scoring design choices

Factors are min–max normalised across all segments at once, not within property
type, so a residential segment's yield is scored against commercial yields. Low
market risk is normalised on a fixed 0–100 scale rather than the observed range.
The preset weights are judgements, not estimates, and the scoring has not been
tested against any outcome; there is no backtest or out-of-sample validation.

### 4.5 Flat-growth projections

The three scenarios (`public/js/projection.js`) apply fixed rental-growth,
capital-growth and occupancy assumptions to the whole portfolio. They are not
derived from the selected segment's own modelled growth, so the projections
compare scenarios rather than segments. There is no correlation structure, no
Monte Carlo simulation, no leverage, tax, fees or transaction costs.

Each scenario's occupancy rate affects only the occupancy-adjusted figures.
Gross yield is rent over value by definition and ignores vacancy; Effective
Yield applies the scenario's occupancy and is labelled separately. Earlier, the
occupancy assumption was listed beside the growth rates while changing no
displayed figure; the separate Effective Yield was added rather than redefining
gross yield, so no previously reported figure moved (finding A3).

### 4.6 No liquidity, exit or holding-period modelling

No illiquidity premium, exit capitalisation rate, holding-period choice or
financing structure is modelled.

---

## 5. Statistics

### 5.1 No group confidence intervals

In the Data Centre's city × property-type table the unit is the micro-market
(one segment median), not the simulated observation, because treating each draw
as independent evidence would overstate precision. A bootstrap interval needs
at least ten micro-markets (`Stats.MIN_OBS_CI` in `public/js/stats.js`), and no
group has that many, so no group interval is computed and the table states why
for each group. Spread within a segment is reported separately as the P10–P90 of
its simulated observations.

### 5.2 Association, not cause

The dependence between metrics was specified when the data was generated.
Correlations, the Simpson's paradox illustration and the limited regression on
the Statistical Analysis page therefore describe the generator's design; none is
evidence of cause or of real-market behaviour. With samples of this size, weak
associations become statistically visible while explaining very little.

### 5.3 Known-anomaly detection is measured only on generated anomalies

The known synthetic anomalies were inserted by the generator, and their
identities were written to a separate file the detectors never read, so
precision and recall are measured rather than asserted. They describe how the
detectors perform on anomalies of the kinds this generator creates, not on real
market data. The Mahalanobis methods' χ² cutoff assumes multivariate normality,
which this mixture of markets does not meet, so their nominal false-positive
rate is not achieved.

---

## 6. Language models

### 6.1 Interpretation only

The four Gemini agents interpret figures computed deterministically elsewhere.
They do not calculate, rank or validate, and they do not choose the target. The
eight input checks that gate the Investment Orchestrator are code
(`validator.js`), not a model. The commentary is not investment advice.

### 6.2 Checked, but not proven true

Every reply is held to a prose-only JSON schema and checked by
`AgentOutputCheck.check()` against the context it was given: markets, ranks,
figures at their stated precision, exclusion reasons, the dominant factor,
retired terminology and claims of evidence or verification. The check can prove
certain kinds of statement false; it cannot prove prose true. It skips small
whole numbers and ambiguous names, and a sentence with correct figures and
faulty reasoning passes. A live reply that fails is still displayed, with its
problems listed and a note that the deterministic figures are authoritative.
Headline figures on the agent cards and in the report are always taken from the
deterministic analysis, never from the prose.

### 6.3 Live output varies and is not kept

Live calls use temperature 0.2, so wording can differ between runs and between
model versions. Live commentary is not saved: the page holds it in memory and
discards it when the analysis changes or the page reloads, the proxy keeps an
in-memory copy only until it restarts, and the Decision Report prints it only
for the exact run it describes.

### 6.4 Free-tier quota

A free-tier key allows a small number of requests per model per day. The proxy
falls back through a configured list of models when one model's quota is
exhausted; when all are exhausted, live commentary is unavailable until the
quota resets. The deterministic analysis is unaffected. The four calls in a live
run are sequential, so a run can be slow.

### 6.5 Pre-generated commentary only at the four preset defaults

On a static host there is no proxy and no key. Stored commentary
(`public/data/agent-cache.json`) exists for the four presets at the canonical
defaults only — sample portfolio, default amount, screen applied, automatic
selection — and is shown only when the run's scenario key matches exactly. Any
other configuration gets no commentary, and the page names the inputs that
differ. Stored commentary passed the output check when it was built, but it is
stored text and does not reflect any later change to the model.

---

## 7. Application and environment

### 7.1 Browser storage scope

Only the analysis inputs, the portfolio mode and a custom portfolio are stored,
in the browser's `localStorage` under the application's own keys
(`public/js/stateManager.js`). They belong to one browser and one origin: the
public site and `http://localhost:3001` keep separate states, nothing is
synchronised, and clearing site data deletes a custom portfolio. There are no
accounts, no server-side storage and no export or import of a custom portfolio.
Reset Demo touches only the application's keys and keeps a custom portfolio,
inactive.

### 7.2 The local proxy is not a hosted service

`server/server.js` is a development proxy. It has no authentication and no rate
limiting, answers requests from any origin, and listens on Node's default
interfaces, so anyone who can reach its port can spend the key's quota. It
should be run only on a trusted machine and network. The key lives in
`server/.env`, which is git-ignored and never sent to the browser.

### 7.3 Other application limits

There is no offline support (no service worker). The CSV import on the Data
Centre demonstrates the cleaning pipeline only; imported files never change the
market segments or the analysis.

---

## 8. Scope and regulation

### 8.1 No regulatory review

The project was not designed for, or reviewed against, the SEBI (Real Estate
Investment Trusts) Regulations, 2014, or any other regulation.

### 8.2 No expert review

The data, the assumptions and the scoring method have not been reviewed by
licensed valuers, REIT managers or SEBI-registered investment advisers.

### 8.3 The output is a shortlist for further work

Every result is an exploratory shortlist. External calibration remains
unverified; further evidence collection and due diligence would be required
before any real decision.

---

*NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI | Vishesh Jain | Academic demonstration only; not investment advice.*

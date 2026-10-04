# Handoff — REIT Target AI, final-submission pass

**Read this first.** It states what was changed, what is verified, what is
deliberately NOT changed, and what remains. Written 4 October 2026; §11 records
a second pass the same evening, which closed the items in §10.

Committed in one commit on `main` after the second pass. The state before
either pass is the branch `checkpoint-pre-final-20261004-1100`.

---

## Current state

| Check | Result |
|---|---|
| `node tests/reit-tests.js` | **529 passed, 0 failed** — the earlier "516 passed" included 88 assertions that could not fail; see §11 |
| `node data-pipeline/tests/dataPipeline.test.js` | **22 passed, 0 failed** |
| `node data-pipeline/scripts/auditAnalytics.js` | exit 0 — every figure re-derives |
| Browser smoke test, 8 routes (first pass; Playwright not installed for the second, which was checked by hand — §11) | no page errors, no console errors except the expected `localhost:3001` refusal when the proxy is not running |
| Mobile 390px | no horizontal overflow, no errors |
| Financial baseline | portfolio ₹500.00 Cr, rent ₹33.275 Cr, yield 6.655%, city HHI 0.413, type HHI 0.631608 — all unchanged and now locked by tests T-157a–e |

Rebuild commands, in order:

```bash
node data-pipeline/scripts/generateObservations.js
node data-pipeline/scripts/deriveMarkets.js
node data-pipeline/scripts/computeStatistics.js
node data-pipeline/scripts/buildObservationDistribution.js
node data-pipeline/scripts/buildMeta.js
node data-pipeline/scripts/auditAnalytics.js
node data-pipeline/scripts/buildAgentCache.js --dry-run   # full run needs the proxy and a key
node tests/reit-tests.js
node data-pipeline/tests/dataPipeline.test.js
```

---

## 1. Canonical metadata — figures are derived, never typed

**New: `public/js/appMeta.js`.** The single source of counts and labels.
Counts come from `AppMeta.derive(docs)`, computed from the data files. Labels
(institution NMIMS, author, methodology version, agent roster, governance
thresholds) are declared once.

**New: `data-pipeline/scripts/buildMeta.js`** → `public/data/meta.json` and
`docs/CANONICAL_FACTS.md`. Prose documents link to that file instead of
restating figures. `meta.json` deliberately carries **no build timestamp**, so
regeneration stays byte-reproducible for CI (asserted by T-149j).

**Documentation drift fixed and now enforced.** Test T-150 scans every `.md`
and every source comment for figures that were true of an earlier revision —
₹450 Cr, 18 market segments, 7 cities, six agents, 2,000 observations, SPJIMR —
and fails on any *unmarked* occurrence. Sixteen were found and fixed across
README and eight documents.

Two narrow escapes exist, both deliberate: `docs/verification-evidence.md` is
exempt wholesale because its job is to record the institution-name migration,
and any single line tagged `[superseded]` is skipped. The tag is used in the
decision log, the prompt version history and two historical test records,
because deleting figures from a log to satisfy a test destroys the audit trail.

---

## 2. Six agents → four, and validation left the agent chain

| Now | Absorbed |
|---|---|
| Data & Statistical Analyst | `dataQuality` + `statisticalAnalysis` |
| Market Screening Analyst | `marketScreening` |
| Portfolio Risk & Scenario Analyst | `diversification` + `portfolioAnalysis` |
| Investment Orchestrator | `orchestrator` |

**`validation` is gone, and this is the substantive change.** Every check it
made — do the weights total 100%, are scores within 0–100, is the selected
target in the ranking, do the HHI figures reproduce — has exactly one correct
answer that arithmetic establishes. A model could get it wrong, and its verdict
gated the Orchestrator, so a wrong verdict either suppressed a valid
recommendation or admitted an invalid one.

**New: `public/js/validator.js`** — eight deterministic checks, run in the
browser before any model call, each reporting the figures it compared. The
Orchestrator is reached only when they pass. No network, no key, no quota, same
verdict every time. The fixed limitation list also lives here, so the report and
the Agent page cannot state different limitations for the same analysis.

`server/server.js` keeps `LEGACY_AGENT_ALIASES` so old names still resolve, and
`RETIRED_AGENTS` refuses `validation` with an explanation rather than silently
aliasing it. A run now costs four API calls instead of six.

---

## 3. Evidence governance — a second axis, never folded into the score

**New: `public/js/governance.js`.** Floor: at least 30 observations **and**
confidence grade C or better.

**This changes the default recommendation, and you should know why.** Under
three of the four presets the highest-scoring segment rests on 26 observations
at grade D — the dataset's minimum sample size and a below-median grade. Only
**25 of 50** segments meet the floor (15 fail on grade alone, 2 on sample size
alone, 8 on both).

| Preset | Highest score | Recommended |
|---|---|---|
| Balanced | MKT-036 Chennai/Ambattur, 72.45, 26 obs, D | MKT-016 Delhi NCR/Gurugram — Cyber Hub, rank 5 |
| Income | MKT-038 Ahmedabad/GIFT City, 75.40, 26 obs, D | MKT-024 Delhi NCR/Aerocity, rank 8 |
| Growth | MKT-012 Hyderabad/Banjara Hills, 77.36, 47 obs, C | MKT-012 — also meets the floor |
| Diversification | MKT-049 Kolkata/New Town, 73.32, 26 obs, D | MKT-012, rank 2 |

**No score and no rank was altered** — asserted by T-151g. The highest-scoring
segment is still displayed with its real score and the reason it was not
recommended. An explicit override lifts the floor and is recorded in the report.
An explicit click by the user always wins, floor or not.

---

## 4. Screener filters, and the observation panel

**New: `public/js/filters.js`** — city, property type, locality class,
confidence grade, yield range, growth range, maximum risk, minimum
observations, evidence-floor-only. Combinable as AND, resettable, with an empty
result reported in words and naming the filter that excluded the most segments.

Filters decide what is *displayed* only. A rank shown in a filtered view is
still the rank within all 50, so "rank 12" means the same thing everywhere
(T-152h).

**New: `data-pipeline/scripts/buildObservationDistribution.js`** →
`public/data/observation-distribution.json`. Per-segment quantiles and a
10-bin histogram for six metrics, computed at build time because reducing the
1.1 MB `observations.json` in the browser is what froze an earlier page. The
approved noun — *simulated market observation* — is carried in the file so no
page can choose a different one; T-153i fails if the panel labels the records as
properties, listings or transactions.

---

## 5. Executive Overview, now the landing page

**New: `public/js/overview.js`**, `#overview`, first sidebar link, the section
marked `page-active`. `uiHelpers.js` now derives the router's default page from
the first sidebar link instead of hardcoding `portfolio` in three places.

Answers four questions in order: what this is and what the data is; what the
current run concluded and on what evidence; where to look next; what it must not
be used for. Computes nothing itself. Says "no analysis has been run" rather
than showing defaults that read as results. Carries a target-vs-runner-up
comparison table and **Reset Demo** (two-click confirm, clears only this app's
own state — never `localStorage.clear()`).

---

## 6. Bugs fixed

**Decision Report score column.** `report.js` read `m.score`; ranked markets
carry `totalScore`. Every row printed an em dash while the screener showed real
numbers for the same markets. Fixed; T-154a/b lock both directions.

**Agent outputs never reached the report.** `report.js` reads
`window._reitAgentOutputs`; nothing wrote it, so section 5 always said "no agent
output available" even after a successful run. `agents.js` now publishes it
(T-41f).

**HHI before/after described the wrong market.** `marketScreen.js` recorded the
figures for rank 1 regardless of which target the user had selected, so the
Diversification page and the report could show the concentration effect of a
different market from the one named beside it. Now records the selected target.

**Chart title.** "Yield vs Capital Value" → "Gross Yield vs Rental Growth",
which is what `charts.js` actually plots.

---

## 7. Analytics audit — three findings, none silently "fixed"

`data-pipeline/scripts/auditAnalytics.js` recomputes every headline figure by a
separate route and exits non-zero on disagreement. **Everything re-derives
exactly**: portfolio aggregates, both HHI figures (and their mathematical
bounds), all eight normalisation ranges, every composite score, every
contribution sum, every projection point. Report:
`data-pipeline/docs/ANALYTICS_AUDIT.md`.

**A2 — the diversification factor is a proxy.** Computed as
`max(0, 1 − share × 2)`, 60% city / 40% type. The coefficient 2 has no
derivation. Measured against the realised HHI change the same investment
causes: correlation **0.93**, but only **15 distinct values** for 50 segments.
Directionally sound, numerically coarse. **Not changed** — substituting the
realised ΔHHI would move every score and ranking, which is your call.

**A3 — occupancy was inert, now fixed additively.** Each scenario declares 80 /
90 / 95% occupancy and the report listed it beside rental and capital growth,
but no displayed figure used it: the conservative scenario assumed a fifth of
the space empty and reported the yield as though fully let. `projection.js` now
also returns `effectiveGrossYield`, shown as a new column. `grossYield` is
**unchanged**, so no previously published figure moved.

**A4 — `projectHHI` can overstate the effect.** Its optimistic damping factor of
1.3 projects a concentration improvement 30% larger than the investment
actually produces. No page calls it. Marked `DO NOT WIRE THIS INTO A PAGE`;
T-158i fails if any page starts calling it.

---

## 8. Source verification — the honest result

`docs/SOURCE_VERIFICATION_REPORT.md`. Twelve external citations checked by
fetching each URL.

**Eight publishers confirmed. Zero documents located. Zero figures traced.
Nothing upgraded to Verified** — because a URL that opens proves a website
exists, which was never the question.

Four cited URLs were wrong (two 404, one 302); corrected in the register.
Three publishers return 403 to automated requests; recorded as blocked, not as
absent. Two cited titles are paraphrases of real series and cannot be looked up
— that one is the project's own error.

**Two factual errors found in the register's own notes:**

- **SRC-001 — Embassy REIT holds no BKC asset.** Its Mumbai assets are Express
  Towers, First International Finance Center and Embassy 247. BKC is MKT-001,
  this dataset's most prominent segment, and its evidence basis cited a REIT
  that owns nothing there.
- **SRC-004 — Nexus Select Trust has 19 consumption centres, not 17.**

**No market value was changed.** `source_register.pre-verification.csv` is kept
beside the register. T-159c fails if any row ever claims plain `Verified`.

---

## 9. Tests and evidence

(Second pass: this count was overstated — see §11.) 516 assertions, up from 374. Eighteen of the original assertions described the
six-agent design and were **rewritten, not relaxed** — each rewrite carries a
comment explaining that it asserted an architecture deliberately replaced, and
adds assertions that the old one has not crept back. New blocks: T-149
canonical metadata, T-150 documentation drift, T-151 governance, T-152 filters,
T-153 observation distribution, T-154 report, T-155 overview, T-156 evaluator
fixtures, T-157 financial baseline, T-158 projections, T-159 source honesty.

**`tests/fixtures/`** — `markets-valid.csv` (6 rows, all accepted) and
`markets-invalid.csv` (6 rows, each breaking exactly one rule so the rejection
reason is unambiguous), plus a README table of what each row breaks.

**`tests/browserSmokeTest.js`** and `docs/screenshots/` — Playwright run over
all 8 routes plus filter, override, row-expansion and mobile interactions.
`docs/screenshots/smoke-results.json` holds the captured assertions.

### One thing the test suite caught about itself

The earlier regression baseline called
`ScoringEngine.rankMarkets(markets, weights)` with no portfolio and no
diversification function. In that call the diversification factor falls back to
a flat 50, so the baseline recorded a ranking the application never produces —
it named MKT-034 as the Balanced leader where the app ranks MKT-036 first. A
baseline measuring something the app does not compute is worse than none,
because it passes while the real output changes. T-157 now captures the baseline
through the same call the screener makes, and T-157h fails if omitting the
portfolio ever stops changing the ranking.

---

## 10. What remains — all closed in the second pass (§11)

1. **Review the governance default.** The recommendation moving from rank 1 to
   rank 5 (Balanced) is the single biggest behavioural change. It is defensible
   and documented, but it is your decision to keep.
2. **`public/data/agent-cache.json` is still the old format** (`.agents`, not
   `.scenarios`) and names the retired agents. The app therefore serves
   deterministic-only output when the proxy is down — correct, but it means the
   published site shows no commentary. Rebuilding it needs a live key:
   `node server/server.js &` then `node data-pipeline/scripts/buildAgentCache.js`
   — and that script still targets the six-agent chain, so update its `CHAIN` to
   the four current keys and its output shape to `.scenarios` keyed by
   `ScenarioKey.compute()` first. Four presets × 4 agents = 16 calls.
3. **`buildAgentCache.js` header still says SPJIMR** and it writes the old
   format. It is excluded from the drift test only because the test strips
   comments; fix the header when you fix the format.
4. **Commit and push.** Nothing is committed yet. Suggested message at the
   bottom of this file.
5. **`public/data/_to_delete/` and `markets.backup-v1-20260920.json`** are still
   in `public/data/`, so they deploy to Pages. Move them out of `public/`.
6. **Live agent run not exercised.** No API key was used in this pass; the agent
   chain was verified structurally and offline, not against the real API.

### Constraints that were respected and should stay respected

- No API key read, printed or committed; `.env*` remains ignored; the full git
  history was scanned blob by blob in an earlier pass and contains no secret.
- No market value altered. No data deleted — superseded files were moved to
  explicitly named archive paths.
- Scoring, Firebase and portfolio data untouched. No market removed.
- Required field names preserved; all new metadata is additive.

### Suggested commit message (as written in the first pass; the commit used it plus §11)

```
Final-submission pass: canonical metadata, four agents, evidence governance

- appMeta.js + buildMeta.js: counts derived from data, never typed; meta.json
  and docs/CANONICAL_FACTS.md generated; doc-drift test (T-150) enforces it
- six agents to four; validation moved out of the agent chain into
  validator.js as eight deterministic checks that gate the Orchestrator
- governance.js: evidence floor (30 observations, grade C+) as a second axis;
  no score or rank altered
- filters.js + Observation Distribution panel on the screener
- overview.js: Executive Overview as the landing page, with Reset Demo
- fix: report read m.score instead of totalScore; agent outputs never reached
  the report; HHI before/after described rank 1 rather than the selected target
- auditAnalytics.js: every figure re-derives; three method findings recorded
- source verification: 8 publishers confirmed, 0 documents located, nothing
  upgraded to Verified; two factual errors found in the register
- tests 374 to 516; evaluator fixtures; browser smoke test and screenshots
```

---

## 11. Second pass — 4 October 2026, evening

### §10 closed

| Item | Outcome |
|---|---|
| 1. Governance default | **Kept.** The segments it passes over rest on 26 observations at grade D; the cost under Balanced is 72.45 → 67.71 for a grade-B, 73-observation segment. Income (rank 8, ~7 points) is the case to be ready to defend. |
| 2–3. Agent cache | Rebuilt: 4 presets × 4 agents, 16 live calls, all succeeded, `gemini-3.1-flash-lite`. `.scenarios` keyed by `ScenarioKey.compute()`. Builder rewritten; its header had already said NMIMS — the stale part was "six Gemini agents" and the chain. |
| 4. Commit and push | Done. |
| 5. Retired files in `public/` | Moved with `git mv` to `archive/retired-public-data-20261004/`, with a README. The old six-agent cache went there too. Nothing deleted. |
| 6. Live agent run | Exercised through the cache build — 16 real calls. |

### Defects found, all fixed

1. **88 assertions could not fail.** They called `assert(condition, id, description)`; `assert` takes `(id, description, condition)`, so it tested the description string — always truthy. **11 were false.** `assert` now recognises a non-string first argument and reads the call as intended. The 11 were rewritten, each with a comment: T78a/c/f/g/h and T83b/f asserted designs deliberately replaced; T-106 lacked `Growth` and T-108 lacked `Derived`, both documented classes present in the committed data (the data dictionary contradicted itself and is corrected); T-125/126 pinned MKT-010 as rank 1, true only of the dataset generator v2.0.0 replaced, and T-126 also omitted the flat diversification factor of 50 and so computed NaN.
2. **The published site could never show cached commentary.** The Run button required a live proxy, which a static host never has — true in the last commit as well. It is now enabled when a cache entry matches the scenario on screen, and reads "Show Pre-generated Analysis" so it cannot be taken for a live call. With no match it stays disabled and says why. (T-160k)
3. **The models were told the wrong target.** `selectedTarget` was looked up in the top 3 and fell back to rank 1, so under Balanced (recommendation at rank 5) the Orchestrator was told MKT-036 — the segment the floor had just rejected — beside a governance block naming MKT-016. (T-160c, d)
4. **The Agents page without a screener run chose rank 1**, while the Screener chooses the evidence-floor recommendation — two different targets, and two different cache keys, for identical inputs. (T-160a, b)
5. **The scenario key fingerprinted no scores.** It read `compositeScore`/`score`; ranked markets carry `totalScore`, so every score in the key was null. (T-160e)
6. **"Expected Gross Yield" was model-written and inconsistent.** The Orchestrator prompt does not define `expectedYieldPct`; in the cache build the model gave the target's gross yield for Balanced and Growth and the portfolio's post-investment yield for Income and Diversification — the card would have shown 6.29% for a segment whose gross yield is 2.66%. The headline score, yield and amount now come from the deterministic context (`AgentContext.applyDeterministicFigures`); a differing model figure is kept in `_modelFigures`, hidden, not discarded. The server prompt was **not** changed (Gemini integration out of scope); defining the field there is a reasonable follow-up. (T-160l, m)

### New

- **`public/js/agentContext.js`** — the agent context, built once for the Agents page and for `buildAgentCache.js`, so a cache hit is guaranteed to describe the context the page would have sent.
- **`buildAgentCache.js --dry-run`** — builds every context, key and deterministic check without calling anything.
- **T-160a–m.** T-160h–j fail whenever `agent-cache.json` is missing, in the old format, or stored under a key its descriptor does not hash to.

### Verified

- Every figure in the four Orchestrator replies checked against the engine: scores, HHI before/after, contributions, exclusion reasons, "6 of 8 cities" — all correct except `expectedYieldPct` (defect 6). No retired figure appears in any of the 16 replies.
- In the browser, proxy stopped: no-run → Balanced entry; Income and Diversification presets → their own entries; a changed investment amount → no match, button disabled with the reason. Decision Report §5 shows the corrected yield and the cache provenance.
- A stale, empty `.git/index.lock` from 15:54 (no git process running) was removed.

### Still open

- **Cache regeneration is manual.** Any change to the data, portfolio, presets or methodology changes the keys; the page then correctly shows deterministic output only until `buildAgentCache.js` is re-run.
- **`expectedYieldPct` is undefined in the Orchestrator prompt** (defect 6, display-side fix only).
- **A2 diversification proxy** — unchanged, your decision (§7).
- The 88 swapped calls are read correctly by `assert` but not rewritten at the call sites.


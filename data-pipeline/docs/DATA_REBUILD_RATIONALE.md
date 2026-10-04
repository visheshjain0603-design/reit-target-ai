# Data Rebuild Rationale — Observation Generator v2

**REIT Target AI | NMIMS B.Sc. Finance — Business Analytics Theme 4**
**All data in this project is synthetic. Nothing here is real market data.**

---

## Purpose of this document

`data-pipeline/scripts/generateObservations.js` cites this file in its header as
the record of why version 1 of the generator was replaced. This document is that
record.

It states four defects that were found by measurement against v1's own output,
what replaced them, and — equally important — which properties of the rebuild are
deliberate design decisions rather than accidents.

---

## 1. The four defects in generator v1

Each was verified by measuring v1's output, not inferred from reading its code.

### D1 — Four metrics were 100% null

`vacancy_rate_pct`, `occupancy_rate_pct`, `risk_score` and
`transaction_volume_index` were null in all 2,000 v1 observations.

**Cause.** v1's `METRICS` array named fields that `market_estimates_long.csv`
does not define. The evidence file defines `vacancy_pct`, `occupancy_pct` and
`market_risk_score`; it contains no transaction-volume metric at all. The lookup
missed and produced null silently.

**Why it mattered.** `market_risk_score` is an input to the scoring engine. A
silently null risk input is a correctness problem, not a cosmetic one.

**Fix.** The generator now throws if any required estimate is missing, naming the
market and the metric. Failing loudly is the point: a missing input should stop
the build, not propagate as a null.

### D2 — No dependence structure between metrics

Measured on v1 output:

| Relationship | v1 measured | Economically expected |
|---|---|---|
| gross yield vs capital value | **+0.10** | strongly negative |
| rental growth vs demand | **−0.02** | strongly positive |

**Cause.** v1 drew every metric independently from its own triangular
distribution. Independent draws cannot produce dependence.

**Consequence.** The scatter plot had no shape. Points formed a structureless
cloud because, statistically, that is exactly what they were.

### D3 — Economically impossible derived yields

Gross yield is derived as `rent × 12 ÷ price`. When rent and price are drawn
independently, their ratio is the ratio of two independent random variables,
which has far heavier tails than either input. v1 produced retail yields up to
**20.0%** and office yields up to **16.4%** — levels at which no asset trades.

### D4 — The documented yield structure was inverted

This was the most serious defect, because it sat in the evidence base rather than
the sampling code.

| Locality class | v1 documented mean yield |
|---|---|
| Premium | **9.93%** |
| Established | 9.07% |
| Peripheral | **8.38%** |

Prime assets showed the *highest* yields. This inverts the cap-rate
relationship: prime, liquid, low-risk assets trade at **lower** yields precisely
because buyers pay a premium for them.

Retail was additionally a single hardcoded **12.00%** across all ten retail
markets, and residential a single **4.29%** — zero variance in both.

---

## 2. What v2 does differently

### 2.1 A cap-rate model instead of a sampled yield

Yield is modelled from first principles:

```
yield = ( base(property type)
        + adjustment(locality class)
        + adjustment(city tier) )
        × exp( z × relative_sd(city tier) )
```

Base rates were chosen to follow published Indian yield ranges as the project understood them; the cited documents were not located, so this calibration is Unverified. The adjustments
encode cap-rate compression: Premium −0.95pp, Established 0.00, Growth +0.55,
Peripheral +1.15; city tier 1 −0.45, city tier 3 +0.65.

**On the multiplicative noise.** An earlier revision used additive dispersion in
percentage points. A standard deviation of 0.42pp is reasonable around an 8.4%
office yield but absurd around a 2.2% prime-residential yield, where it allowed
draws below 1%. Proportional noise scales with the level and cannot go negative.

### 2.2 Internal consistency by construction

Rent is sampled, yield is modelled, and **price is derived** as
`rent × 12 ÷ yield`.

Because price is derived rather than drawn, rent, yield and price can never
contradict one another, and the negative price/yield relationship emerges from
the arithmetic rather than being imposed on it.

### 2.3 A Gaussian copula for dependence

Correlated standard normals are drawn via Cholesky factorisation of a target
correlation matrix, mapped to uniforms through the normal CDF, then mapped back
through **each metric's original triangular marginal** from
`market_estimates_long.csv`.

This is the key property of the rebuild:

> The documented lower / central / upper ranges are preserved exactly. The
> evidence register and assumption register remain valid. Only the *dependence
> between* metrics changed — not the range of any metric.

Every non-zero entry in the correlation matrix has a stated economic reason:
yield against risk is the risk premium; growth against demand is demand driving
growth; rent against yield reflects better space renting higher and pricing
tighter.

The matrix is checked for positive definiteness before sampling. A
non-positive-definite target is treated as fatal, because it would mean the
specified relationships are mutually contradictory.

### 2.4 Deliberate heteroscedasticity

Relative dispersion is 0.055 for cities in tier 1, 0.080 for tier 2, 0.110 for
tier 3. Deep, liquid markets price tightly; thin markets disperse.

This is realistic, and it is also the mechanism that makes homogeneity-of-variance
tests genuinely reject — so the project's parametric/non-parametric reasoning has
something real to act on rather than always taking one branch.

### 2.5 Known synthetic anomalies with separated ground truth

24 anomalies (**1.11% contamination**) are injected by five mechanisms at graded
severities, from roughly 1.8 to 39 standard deviations from their market mean.

Their identities are written to **`outlier_truth.json`, a separate file**, so
detection code cannot read the answer even accidentally. Validation re-joins on
`obs_id`.

The `bivariate_only` mechanism is the methodologically interesting one: each
individual value stays inside its normal range and only the *combination* —
elevated yield with unusually low risk — is anomalous. It is invisible to any
single-variable rule by construction.

### 2.6 Observation allocation

v1 gave every market exactly 40 draws while `markets.json` simultaneously claimed
counts of 25–87; the two disagreed. v2 allocates counts proportional to a
liquidity proxy with seeded noise, rescaled to exactly 2,156, range 26–76.

`markets.json` is now **derived** from the observations rather than maintained
separately, so the headline figure and the underlying records cannot drift apart
again.

---

## 3. Measured outcome

Within asset class, on v2 output excluding the known synthetic anomalies:

| Relationship | v1 | v2 (within asset class) |
|---|---|---|
| yield vs capital value | +0.10 | **−0.82** |
| yield vs risk | n/a (null) | **+0.71** |
| growth vs demand | −0.02 | **+0.39 to +0.64** |

Cap rates are now monotonic within Commercial Office: Premium 6.97% <
Established 8.28% < Growth 8.80% < Peripheral 9.36%.

Yield ranges are economically plausible: Office 5.88–11.92%, Retail 5.63–11.30%,
Residential 2.10–5.74%.

---

## 4. A deliberate property, not a defect: Simpson's paradox

`yield vs risk` is positive within **every** asset class and **negative** when
the three are pooled:

```
Commercial Office   +0.61
Retail              +0.55      pooled:  −0.16
Residential         +0.67
```

This is not a generation error. It arises because residential carries both
markedly lower yields and different risk characteristics, so pooling asset
classes of different levels creates a spurious aggregate relationship.

It is retained because it is instructive, and because removing it would require
making the asset classes artificially similar — which would be less realistic,
not more. The analysis is stratified throughout for this reason, and the
Statistics page displays both figures side by side rather than the pooled one
alone.

The same effect governs outlier detection. Applying Tukey fences across all 2,156
observations pooled yields precision 0.023; applying the identical rule within
each market yields precision 0.472 and recall 0.708.

---

## 5. Reproducibility

- Mulberry32 PRNG, seed **20260919**, unchanged from v1 for continuity
- No `Math.random`, no wall-clock reads anywhere in the generation path
- Re-running produces **byte-identical** output, verified by checksum
- CI asserts this on every push: regenerating must reproduce the committed data exactly

Regenerate with:

```bash
node data-pipeline/scripts/generateObservations.js
node data-pipeline/scripts/deriveMarkets.js
node data-pipeline/scripts/computeStatistics.js
```

---

## 6. Honest limitations

- **The data is synthetic.** It was written to follow published benchmarks (unverified), but no
  observation corresponds to a real transaction. It must not be used for any
  real investment decision.
- **Calibration is unverified.** The source register cites tier-1 REIT filings
  and tier-2 brokerage research, but none of the cited documents has been located
  and no figure has been traced, so every segment's external calibration is
  `Unverified`. See `docs/SOURCE_VERIFICATION_REPORT.md` for the current state.
- **Anomaly detection results depend on the known synthetic anomalies.** Precision and
  recall are measured against anomalies this generator created. They demonstrate
  that the methods work on data with known structure; they are not evidence of
  performance on real market data.
- **The χ² cutoff used by the Mahalanobis detectors assumes multivariate
  normality.** This dataset is a mixture across markets even within one asset
  class, so the nominal 1% false-positive rate is not achieved and precision is
  correspondingly low. The recall figures remain informative.
- **v1 output is retained** in `data-pipeline/generated/` alongside v2 for
  provenance and comparison. It is not used by the application.

---

*Generator version 2.0.0 · seed 20260919 · 2,156 observations across 50 markets*

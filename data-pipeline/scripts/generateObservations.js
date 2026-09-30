/**
 * generateObservations.js — REIT Target AI observation-level data generator (v2)
 * SPJIMR — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * Supersedes scripts/generateSemiSyntheticData.js (v1), which is retained
 * unchanged for provenance.  Reasons v1 is superseded, each verified by
 * measurement against its output (see docs/DATA_REBUILD_RATIONALE.md):
 *
 *   D1  Four metrics were 100% null in v1 output (risk_score, vacancy,
 *       occupancy, transaction_volume): v1's METRICS array named fields that
 *       market_estimates_long.csv does not define (it defines vacancy_pct,
 *       occupancy_pct, market_risk_score).  The lookup silently produced null.
 *       market_risk_score feeds the scoring engine, so this was material.
 *
 *   D2  v1 drew every metric INDEPENDENTLY from its own triangular
 *       distribution.  Real property metrics are strongly dependent, so the
 *       resulting cloud had no shape: measured corr(price, yield) = +0.10,
 *       corr(growth, demand) = -0.02.
 *
 *   D3  Independent rent and price draws make the derived yield
 *       (rent x 12 / price) a ratio of two independent variables, which
 *       produced economically impossible values — retail yields up to 20.0%
 *       and office up to 16.4%.
 *
 *   D4  The documented central yields were themselves inverted: Premium
 *       localities averaged 9.93% against Peripheral 8.38%.  Prime assets
 *       trade at LOWER cap rates, not higher.  Retail was a single hardcoded
 *       12.00% across all ten retail markets (zero variance); Residential a
 *       single 4.29%.
 *
 * WHAT THIS GENERATOR DOES DIFFERENTLY
 *
 *   1. Cap-rate model.  Gross yield is modelled from first principles as
 *      base(property type) + adjustment(locality class) + adjustment(city
 *      tier) + idiosyncratic noise.  Compression is applied to prime assets,
 *      restoring the correct sign of the price/yield relationship.
 *
 *   2. Internal consistency by construction.  Rent is sampled; yield is
 *      modelled; price is DERIVED as rent x 12 / yield.  The three can
 *      therefore never contradict one another, and the strong negative
 *      price/yield relationship emerges naturally rather than being imposed.
 *
 *   3. Gaussian copula.  Remaining metrics are drawn with a specified
 *      correlation matrix via Cholesky factorisation, then mapped back
 *      through each metric's ORIGINAL triangular marginal from
 *      market_estimates_long.csv.  This is the key property: the documented
 *      evidence ranges (lower/central/upper) are preserved exactly, so the
 *      evidence and assumption registers remain valid.  Only the DEPENDENCE
 *      between metrics changes.
 *
 *   4. Heteroscedasticity by city tier.  Tier-1 markets are generated with
 *      tighter dispersion than tier-3, which is true of real markets and
 *      makes homogeneity-of-variance tests genuinely fail — so the project's
 *      parametric/non-parametric decision tree actually branches instead of
 *      always taking one path.
 *
 *   5. Planted outliers with ground truth.  A known, documented set of
 *      outliers is injected by four distinct mechanisms.  Ground truth is
 *      written to a SEPARATE file (outlier_truth.json) so detection code
 *      cannot read it by accident; validation joins on obs_id.  This makes
 *      precision/recall of the outlier detectors measurable.
 *
 * Reproducibility: Mulberry32 PRNG, fixed seed, no wall-clock or Math.random
 * anywhere.  Re-running regenerates byte-identical output.
 *
 * Run:  node data-pipeline/scripts/generateObservations.js
 */

"use strict";

var fs   = require("fs");
var path = require("path");

// ─── CONFIGURATION ──────────────────────────────────────────────────────────

var SEED              = 20260919;   // unchanged from v1 for continuity
var TOTAL_OBSERVATIONS = 2156;      // matches the total the application reports
var MIN_OBS_PER_MARKET = 26;        // keeps every segment above the n>=26 floor
var GENERATOR_VERSION  = "2.0.0";
var DATA_AS_OF         = "2026-09-19";

var ROOT     = path.join(__dirname, "..");
var PROJECT  = path.join(ROOT, "..");
var OUT_DIR  = path.join(ROOT, "generated");
var DATA_DIR = path.join(PROJECT, "public", "data");

// ─── SEEDED PRNG (Mulberry32) — same algorithm as v1 ────────────────────────

function mulberry32(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var rand = mulberry32(SEED);

/** Standard normal via Box-Muller. Guards u=0 which would give -Infinity. */
function randn() {
  var u1 = rand();
  var u2 = rand();
  if (u1 < 1e-12) { u1 = 1e-12; }
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── DISTRIBUTION MATHS ─────────────────────────────────────────────────────

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 error-function
 * approximation (|error| < 1.5e-7) — ample for mapping copula uniforms.
 */
function normalCDF(z) {
  var sign = z < 0 ? -1 : 1;
  var x = Math.abs(z) / Math.SQRT2;
  var t = 1 / (1 + 0.3275911 * x);
  var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Inverse CDF of Triangular(lower, mode, upper) — the marginal v1 used and
 * the one the evidence register documents. Preserving it is what keeps the
 * documented lower/central/upper ranges valid after the copula step.
 */
function triangularInvCDF(u, lower, mode, upper) {
  if (!(upper > lower)) { return lower; }
  if (mode < lower) { mode = lower; }
  if (mode > upper) { mode = upper; }
  var fc = (mode - lower) / (upper - lower);
  if (u < fc) {
    return lower + Math.sqrt(u * (upper - lower) * (mode - lower));
  }
  return upper - Math.sqrt((1 - u) * (upper - lower) * (upper - mode));
}

/**
 * Cholesky factorisation. Returns lower-triangular L with L*L' = A, or null
 * when A is not positive definite — the caller treats null as fatal rather
 * than silently generating data with a meaningless dependence structure.
 */
function cholesky(A) {
  var n = A.length;
  var L = [];
  var i, j, k;
  for (i = 0; i < n; i++) { L.push(new Array(n).fill(0)); }
  for (i = 0; i < n; i++) {
    for (j = 0; j <= i; j++) {
      var sum = 0;
      for (k = 0; k < j; k++) { sum += L[i][k] * L[j][k]; }
      if (i === j) {
        var d = A[i][i] - sum;
        if (d <= 1e-12) { return null; }        // not positive definite
        L[i][j] = Math.sqrt(d);
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/** Draw one correlated standard-normal vector given Cholesky factor L. */
function correlatedNormals(L) {
  var n = L.length;
  var z = [];
  var i, k;
  for (i = 0; i < n; i++) { z.push(randn()); }
  var out = new Array(n).fill(0);
  for (i = 0; i < n; i++) {
    var s = 0;
    for (k = 0; k <= i; k++) { s += L[i][k] * z[k]; }
    out[i] = s;
  }
  return out;
}

// ─── ECONOMIC MODEL ─────────────────────────────────────────────────────────

/*
 * Gross yield (cap rate) model.
 *
 * Base rates are calibrated to published Indian commercial/residential yield
 * ranges in the mid-2020s. The direction of every adjustment below is the
 * point of the rebuild: prime, liquid, low-risk assets trade at LOWER yields
 * because buyers pay a premium for them. v1 had this inverted.
 *
 * All figures are illustrative academic parameters, not market data.
 */
var YIELD_BASE = {
  "Commercial Office": 8.40,
  "Retail":            8.10,
  "Residential":       3.60
};

// Cap-rate compression for better locations (negative = lower yield).
var YIELD_BY_LOCALITY_CLASS = {
  "Premium":     -0.95,
  "Established":  0.00,
  "Growth":      +0.55,
  "Peripheral":  +1.15
};

// Deeper, more liquid city markets also price tighter.
var CITY_TIER = {
  "Mumbai": 1, "Delhi NCR": 1, "Bengaluru": 1,
  "Pune": 2, "Hyderabad": 2, "Chennai": 2,
  "Kolkata": 3, "Ahmedabad": 3
};
var YIELD_BY_TIER = { 1: -0.45, 2: 0.00, 3: +0.65 };

/*
 * Dispersion by tier — deliberate heteroscedasticity.
 * Tier-1 markets have many comparable transactions and price tightly;
 * tier-3 markets are thin and disperse. This is both realistic and the
 * mechanism that makes Levene / Brown-Forsythe tests genuinely reject,
 * exercising the non-parametric branch of the analysis.
 *
 * Expressed as RELATIVE (proportional) dispersion, not absolute percentage
 * points. An absolute s.d. of 0.42pp is reasonable around an 8.4% office
 * yield but absurd around a 2.2% prime-residential yield, where it allowed
 * draws below 1% — a level at which no asset would actually trade.
 * Multiplicative noise scales with the yield level and cannot go negative.
 */
var YIELD_REL_SD_BY_TIER = { 1: 0.055, 2: 0.080, 3: 0.110 };

/** Modelled gross yield (%) for one observation. */
function modelYield(propertyType, localityClass, city, z) {
  var tier = CITY_TIER[city] || 2;
  var base = YIELD_BASE[propertyType];
  if (base === undefined) { base = 8.0; }
  var adj    = (YIELD_BY_LOCALITY_CLASS[localityClass] || 0) + (YIELD_BY_TIER[tier] || 0);
  var centre = Math.max(base + adj, 1.20);
  var relSd  = YIELD_REL_SD_BY_TIER[tier] || 0.08;
  return centre * Math.exp(z * relSd);
}

// ─── COPULA CORRELATION STRUCTURE ───────────────────────────────────────────

/*
 * Variables carried through the copula, in matrix order.
 * 'yieldZ' is the standardised shock feeding modelYield() above, so the yield
 * participates in the joint structure rather than being bolted on afterwards.
 */
var COPULA_VARS = [
  "monthly_rent_psf",   // 0
  "yieldZ",             // 1
  "rental_growth_pct",  // 2
  "capital_growth_pct", // 3
  "occupancy_pct",      // 4
  "demand_score",       // 5
  "market_risk_score"   // 6
];

/*
 * Target correlation matrix. Every non-zero entry below has an economic
 * reason, stated in docs/DATA_REBUILD_RATIONALE.md:
 *
 *   rent  ~ yieldZ   -0.30  better space rents higher AND prices tighter
 *   rent  ~ demand   +0.46  demand bids rents up
 *   rent  ~ risk     -0.40  prime stock is lower risk
 *   yield ~ growth   -0.34  growth markets trade at lower cap rates
 *   yield ~ risk     +0.42  the risk premium — core finance relationship
 *   yield ~ occupancy-0.38  fully-let assets price tighter
 *   rgrow ~ cgrow    +0.58  rent and capital growth share drivers
 *   rgrow ~ demand   +0.60  demand is the growth driver
 *   occ   ~ demand   +0.52  demand fills space
 *   demand~ risk     -0.55  liquid, in-demand markets are safer
 */
var TARGET_CORR = [
  /* rent   */ [ 1.00, -0.30,  0.16,  0.18,  0.34,  0.46, -0.40],
  /* yieldZ */ [-0.30,  1.00, -0.34, -0.30, -0.38, -0.33,  0.42],
  /* rgrow  */ [ 0.16, -0.34,  1.00,  0.58,  0.38,  0.60, -0.31],
  /* cgrow  */ [ 0.18, -0.30,  0.58,  1.00,  0.33,  0.54, -0.34],
  /* occ    */ [ 0.34, -0.38,  0.38,  0.33,  1.00,  0.52, -0.48],
  /* demand */ [ 0.46, -0.33,  0.60,  0.54,  0.52,  1.00, -0.55],
  /* risk   */ [-0.40,  0.42, -0.31, -0.34, -0.48, -0.55,  1.00]
];

// ─── CSV PARSING (no external dependencies) ─────────────────────────────────

function parseCSV(filepath) {
  var text  = fs.readFileSync(filepath, "utf8").trim();
  var lines = text.split(/\r?\n/);
  var head  = lines[0].split(",");
  var out   = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) { continue; }
    // Fields in these registers contain no quoted commas; verified on load.
    var cells = lines[i].split(",");
    var row = {};
    for (var j = 0; j < head.length; j++) { row[head[j]] = (cells[j] || "").trim(); }
    out.push(row);
  }
  return out;
}

// ─── LOAD INPUTS ────────────────────────────────────────────────────────────

console.log("REIT Target AI — observation generator v" + GENERATOR_VERSION);
console.log("Seed " + SEED + " (deterministic; no Math.random)\n");

var universe  = parseCSV(path.join(ROOT, "market_universe.csv"));
var estimates = parseCSV(path.join(ROOT, "market_estimates_long.csv"));

var estByMarket = {};
estimates.forEach(function (r) {
  if (!estByMarket[r.market_id]) { estByMarket[r.market_id] = {}; }
  estByMarket[r.market_id][r.metric_name] = {
    lower:   parseFloat(r.lower_estimate),
    central: parseFloat(r.central_estimate),
    upper:   parseFloat(r.upper_estimate),
    unit:    r.unit,
    evidenceClass: r.evidence_classification,
    uncertaintyType: r.uncertainty_type
  };
});

var markets = universe.filter(function (u) { return estByMarket[u.market_id]; });
console.log("Markets loaded: " + markets.length);
if (markets.length !== 50) {
  throw new Error("Expected 50 markets in market_universe.csv, found " + markets.length);
}

// ─── ALLOCATE OBSERVATIONS ACROSS MARKETS ───────────────────────────────────

/*
 * v1 gave every market exactly 40 draws, which is both unrealistic and a
 * visible synthetic tell (markets.json simultaneously claimed counts of
 * 25-87, so the two disagreed). Here the count is proportional to a
 * liquidity proxy — deeper, more prime markets transact more often — with
 * seeded noise, then rescaled so the total is exactly TOTAL_OBSERVATIONS.
 */
var LIQUIDITY_BY_CLASS = { "Premium": 1.55, "Established": 1.15, "Growth": 0.85, "Peripheral": 0.60 };
var LIQUIDITY_BY_TIER  = { 1: 1.35, 2: 1.00, 3: 0.70 };

var weights = markets.map(function (m) {
  var tier = CITY_TIER[m.city] || 2;
  var w = (LIQUIDITY_BY_CLASS[m.locality_class] || 1.0) * (LIQUIDITY_BY_TIER[tier] || 1.0);
  return w * (0.80 + 0.40 * rand());        // +/-20% seeded idiosyncratic noise
});

var wSum = weights.reduce(function (a, b) { return a + b; }, 0);
var counts = weights.map(function (w) {
  return Math.max(MIN_OBS_PER_MARKET, Math.round(TOTAL_OBSERVATIONS * w / wSum));
});

// Rescale to hit the exact total, never dropping a market below the floor.
function rebalance(counts) {
  var total = counts.reduce(function (a, b) { return a + b; }, 0);
  var guard = 0;
  while (total !== TOTAL_OBSERVATIONS && guard++ < 100000) {
    var diff = TOTAL_OBSERVATIONS - total;
    var step = diff > 0 ? 1 : -1;
    // Adjust the largest markets first so small segments stay above the floor.
    var order = counts.map(function (c, i) { return i; })
                      .sort(function (a, b) { return counts[b] - counts[a]; });
    for (var k = 0; k < order.length && total !== TOTAL_OBSERVATIONS; k++) {
      var i = order[k];
      if (counts[i] + step >= MIN_OBS_PER_MARKET) { counts[i] += step; total += step; }
    }
  }
  return counts;
}
counts = rebalance(counts);
console.log("Observations allocated: " + counts.reduce(function (a, b) { return a + b; }, 0) +
            " across " + counts.length + " markets (min " + Math.min.apply(null, counts) +
            ", max " + Math.max.apply(null, counts) + ")");

// ─── BUILD COPULA ───────────────────────────────────────────────────────────

var L = cholesky(TARGET_CORR);
if (!L) {
  throw new Error("TARGET_CORR is not positive definite — the correlation " +
                  "structure is internally contradictory and cannot be sampled.");
}
console.log("Correlation matrix is positive definite; Cholesky factor obtained.\n");

// ─── GENERATE OBSERVATIONS ──────────────────────────────────────────────────

var observations = [];

markets.forEach(function (m, mi) {
  var est  = estByMarket[m.market_id];
  var n    = counts[mi];
  var tier = CITY_TIER[m.city] || 2;

  for (var d = 1; d <= n; d++) {
    var z = correlatedNormals(L);          // correlated standard normals
    var u = z.map(normalCDF);              // -> correlated uniforms (the copula)

    // Rent, growth, occupancy, demand and risk keep their ORIGINAL documented
    // triangular marginals; only their joint dependence has changed.
    function tri(metric, uu) {
      var e = est[metric];
      if (!e) { return null; }
      return triangularInvCDF(uu, e.lower, e.central, e.upper);
    }

    var rent      = tri("monthly_rent_psf",   u[0]);
    var rgrow     = tri("rental_growth_pct",  u[2]);
    var cgrow     = tri("capital_growth_pct", u[3]);
    var occupancy = tri("occupancy_pct",      u[4]);
    var demand    = tri("demand_score",       u[5]);
    var risk      = tri("market_risk_score",  u[6]);

    // Fail loudly rather than emitting nulls — this is defect D1's guard.
    if (rent === null || rgrow === null || cgrow === null ||
        occupancy === null || demand === null || risk === null) {
      throw new Error("Missing estimate for " + m.market_id +
                      " — required metrics: monthly_rent_psf, rental_growth_pct, " +
                      "capital_growth_pct, occupancy_pct, demand_score, market_risk_score");
    }

    // Yield from the cap-rate model, driven by its copula shock.
    var grossYield = modelYield(m.property_type, m.locality_class, m.city, z[1]);

    // Price DERIVED so rent, yield and price can never contradict each other.
    var price = (rent * 12) / (grossYield / 100);

    observations.push({
      obs_id:            m.market_id + "_D" + String(d).padStart(3, "0"),
      market_id:         m.market_id,
      city:              m.city,
      locality:          m.locality,
      property_type:     m.property_type,
      locality_class:    m.locality_class,
      city_tier:         tier,
      confidence_grade:  m.confidence_grade,
      draw_number:       d,
      seed:              SEED,
      generator_version: GENERATOR_VERSION,
      date_generated:    DATA_AS_OF,

      monthly_rent_psf:        round(rent, 4),
      sale_price_psf:          round(price, 4),
      gross_yield_pct:         round(grossYield, 4),
      rental_growth_pct:       round(rgrow, 4),
      capital_growth_pct:      round(cgrow, 4),
      occupancy_pct:           round(occupancy, 4),
      vacancy_pct:             round(100 - occupancy, 4),
      demand_score:            round(demand, 4),
      market_risk_score:       round(risk, 4),

      is_planted_outlier:      false,
      outlier_mechanism:       null
    });
  }
});

function round(v, dp) {
  var f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

console.log("Generated " + observations.length + " observations.");

// ─── PLANT OUTLIERS ─────────────────────────────────────────────────────────

/*
 * Four mechanisms, each mimicking a real data-quality or market phenomenon.
 * The fourth is deliberately invisible to any single-variable rule: each
 * value sits inside its own normal range, but the COMBINATION is impossible.
 * Only a multivariate method (Mahalanobis) can recover those, which is the
 * evidence base for comparing univariate and multivariate detectors.
 */
/*
 * Magnitudes are calibrated to land roughly 3-6 standard deviations from the
 * market mean: unambiguously outlying and recoverable by a detector, but not
 * so extreme that they compress the axis and make the honest 99% of the data
 * unreadable on a chart. An earlier calibration used a 10x rent error, which
 * produced 80% yields and wrecked the plot scale.
 */
var OUTLIER_PLAN = [
  { kind: "subtle_mispricing",  severity: "subtle",   count: 6, note: "Mildly mispriced against comparables — roughly 2.5-3.5 s.d. from its market. Near the detection boundary: the case that separates a sensitive detector from a blunt one." },
  { kind: "distressed_sale",    severity: "moderate", count: 5, note: "Forced or distressed disposal: price marked down, rent unchanged, so the yield rises to roughly 5-7 s.d. above its market." },
  { kind: "trophy_asset",       severity: "moderate", count: 4, note: "Trophy asset bid above comparables, compressing the yield to roughly 4-5 s.d. below its market." },
  { kind: "data_entry_error",   severity: "gross",    count: 3, note: "Keying error: a digit dropped from the sale price. Grossly outlying and should be caught by any method." },
  { kind: "bivariate_only",     severity: "subtle",   count: 6, note: "Each value individually unremarkable (each within ~1.5 s.d.); the COMBINATION of elevated yield with unusually low risk is not. Invisible to any single-variable rule — only a multivariate method can recover these." }
];

var plantedTotal = 0;
var used = {};

function pickUnusedIndex() {
  var guard = 0;
  while (guard++ < 100000) {
    var i = Math.floor(rand() * observations.length);
    if (!used[i]) { used[i] = true; return i; }
  }
  throw new Error("Could not find an unused observation to plant an outlier into.");
}

OUTLIER_PLAN.forEach(function (plan) {
  for (var c = 0; c < plan.count; c++) {
    var idx = pickUnusedIndex();
    var o = observations[idx];

    /*
     * Magnitudes are expressed against the market's RELATIVE yield s.d., so
     * a given multiplier lands the observation at a comparable z in any
     * market regardless of its yield level. relSd is the tier's relative
     * dispersion; shifting price by exp(k * relSd) moves the derived yield
     * by about k standard deviations.
     */
    var relSd = YIELD_REL_SD_BY_TIER[o.city_tier] || 0.08;
    function priceShiftForZ(k) { return Math.exp(-k * relSd); }   // +k on yield

    if (plan.kind === "subtle_mispricing") {
      o.sale_price_psf = round(o.sale_price_psf * priceShiftForZ(2.5 + rand()), 4);
    } else if (plan.kind === "distressed_sale") {
      o.sale_price_psf = round(o.sale_price_psf * priceShiftForZ(5.0 + 2.0 * rand()), 4);
    } else if (plan.kind === "trophy_asset") {
      o.sale_price_psf = round(o.sale_price_psf * priceShiftForZ(-(4.0 + rand())), 4);
    } else if (plan.kind === "data_entry_error") {
      o.sale_price_psf = round(o.sale_price_psf / (2.8 + 0.4 * rand()), 4);
    } else if (plan.kind === "bivariate_only") {
      // Opposite tails of two variables that are normally POSITIVELY
      // correlated (yield and risk). Each shift is small enough that neither
      // variable leaves its own plausible range; only the joint position is
      // anomalous, so univariate rules cannot see it.
      o.sale_price_psf    = round(o.sale_price_psf * priceShiftForZ(1.5), 4);
      o.market_risk_score = round(Math.max(10, o.market_risk_score * 0.62), 4);
    }

    // Yield is always recomputed from the (possibly altered) rent and price,
    // so the record stays internally consistent even after tampering.
    o.gross_yield_pct   = round((o.monthly_rent_psf * 12) / o.sale_price_psf * 100, 4);
    o.is_planted_outlier = true;
    o.outlier_mechanism  = plan.kind;
    plantedTotal++;
  }
});

console.log("Planted " + plantedTotal + " outliers (" +
            (100 * plantedTotal / observations.length).toFixed(2) + "% contamination).");

// ─── WRITE OUTPUTS ──────────────────────────────────────────────────────────

if (!fs.existsSync(OUT_DIR)) { fs.mkdirSync(OUT_DIR, { recursive: true }); }

/*
 * Ground truth goes to its OWN file, and the shipped observation records are
 * written without the two truth fields. Detection code therefore cannot read
 * the answer even by accident; validation re-joins on obs_id.
 */
var truth = observations
  .filter(function (o) { return o.is_planted_outlier; })
  .map(function (o) {
    var planNote = OUTLIER_PLAN.filter(function (p) { return p.kind === o.outlier_mechanism; })[0];
    return {
      obs_id: o.obs_id,
      market_id: o.market_id,
      city: o.city,
      property_type: o.property_type,
      mechanism: o.outlier_mechanism,
      note: planNote ? planNote.note : ""
    };
  });

var shipped = observations.map(function (o) {
  var copy = {};
  Object.keys(o).forEach(function (k) {
    if (k !== "is_planted_outlier" && k !== "outlier_mechanism") { copy[k] = o[k]; }
  });
  return copy;
});

fs.writeFileSync(path.join(OUT_DIR, "observations.v2.json"),
                 JSON.stringify(shipped, null, 1), "utf8");
fs.writeFileSync(path.join(OUT_DIR, "outlier_truth.json"),
                 JSON.stringify({
                   generator_version: GENERATOR_VERSION,
                   seed: SEED,
                   total_observations: observations.length,
                   planted_count: truth.length,
                   contamination_rate_pct: round(100 * truth.length / observations.length, 4),
                   mechanisms: OUTLIER_PLAN,
                   outliers: truth
                 }, null, 2), "utf8");

// CSV alongside, for anyone opening the dataset in Excel or SAS.
var csvCols = Object.keys(shipped[0]);
var csvLines = [csvCols.join(",")];
shipped.forEach(function (o) {
  csvLines.push(csvCols.map(function (c) { return o[c] === null ? "" : o[c]; }).join(","));
});
fs.writeFileSync(path.join(OUT_DIR, "observations.v2.csv"), csvLines.join("\n"), "utf8");

console.log("\nWrote:");
console.log("  generated/observations.v2.json   (" + shipped.length + " records)");
console.log("  generated/observations.v2.csv");
console.log("  generated/outlier_truth.json     (" + truth.length + " planted)");

module.exports = { observations: observations, shipped: shipped, truth: truth, counts: counts, markets: markets };

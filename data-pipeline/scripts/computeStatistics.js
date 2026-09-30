/**
 * computeStatistics.js — build-time statistical analysis for the dashboard
 * SPJIMR — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * WHY THIS RUNS AT BUILD TIME, NOT IN THE BROWSER
 * -----------------------------------------------
 * The dashboard has to show real statistics over 2,156 observations:
 * descriptives, stratified and pooled correlation matrices, an OLS fit, and
 * three competing outlier detectors scored against ground truth. Doing that
 * in the page means hundreds of passes over the data on the main thread —
 * which is how a browser tab freezes and looks, to the user, like a crash.
 *
 * So the analysis happens here, once, and is committed as statistics.json.
 * The dashboard becomes a pure renderer: it reads numbers and draws them.
 * It cannot hang, because it never computes. It also means the site works as
 * a plain static deployment (e.g. GitHub Pages) with no server at all.
 *
 * Everything here is deterministic — same input, same output, every run.
 *
 * Run (after generateObservations.js and deriveMarkets.js):
 *   node data-pipeline/scripts/computeStatistics.js
 */

"use strict";

var fs   = require("fs");
var path = require("path");

var ROOT     = path.join(__dirname, "..");
var PROJECT  = path.join(ROOT, "..");
var OBS_PATH   = path.join(ROOT, "generated", "observations.v2.json");
var TRUTH_PATH = path.join(ROOT, "generated", "outlier_truth.json");
var OUT_PATH   = path.join(PROJECT, "public", "data", "statistics.json");

var MIN_OBS_WARNING = 30;   // matches public/js/stats.js

// ─── Primitive statistics ───────────────────────────────────────────────────
// Every function returns null rather than NaN/Infinity on degenerate input
// (empty array, zero variance). The renderer shows "—" for null, so a thin
// or constant group produces a blank cell instead of breaking the page.

function clean(arr) {
  return arr.filter(function (v) { return typeof v === "number" && isFinite(v); });
}
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
function sortAsc(a) { return a.slice().sort(function (x, y) { return x - y; }); }

/** Linear-interpolation percentile (the definition R and NumPy default to). */
function percentile(sorted, p) {
  var n = sorted.length;
  if (!n) { return null; }
  if (n === 1) { return sorted[0]; }
  var i = (n - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function median(a) { return a.length ? percentile(sortAsc(a), 0.5) : null; }

/** Sample standard deviation (n-1). Needs at least two points. */
function sd(a) {
  if (a.length < 2) { return null; }
  var m = mean(a);
  var v = a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1);
  return Math.sqrt(v);
}

/** Fisher-Pearson standardised moment coefficient (population form). */
function skewness(a) {
  var n = a.length;
  if (n < 3) { return null; }
  var m = mean(a), s = sd(a);
  if (!s) { return null; }
  var sum = a.reduce(function (t, x) { return t + Math.pow((x - m) / s, 3); }, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

/** Excess kurtosis (0 for a normal distribution). */
function kurtosis(a) {
  var n = a.length;
  if (n < 4) { return null; }
  var m = mean(a), s = sd(a);
  if (!s) { return null; }
  var sum = a.reduce(function (t, x) { return t + Math.pow((x - m) / s, 4); }, 0);
  var g2  = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum;
  return g2 - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
}

/** Median absolute deviation, scaled to be comparable with s.d. under normality. */
function mad(a) {
  var med = median(a);
  if (med === null) { return null; }
  var dev = a.map(function (x) { return Math.abs(x - med); });
  var m = median(dev);
  return m === null ? null : m * 1.4826;
}

function pearson(x, y) {
  var n = Math.min(x.length, y.length);
  if (n < 3) { return null; }
  var mx = mean(x), my = mean(y);
  var num = 0, dx = 0, dy = 0;
  for (var i = 0; i < n; i++) {
    var a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) { return null; }
  return num / Math.sqrt(dx * dy);
}

function describe(values) {
  var a = clean(values);
  if (!a.length) { return { n: 0 }; }
  var s = sortAsc(a);
  var q1 = percentile(s, 0.25), q3 = percentile(s, 0.75);
  return {
    n:        a.length,
    mean:     round(mean(a), 4),
    median:   round(percentile(s, 0.5), 4),
    sd:       round(sd(a), 4),
    cv:       (mean(a) ? round(sd(a) / Math.abs(mean(a)), 4) : null),
    min:      round(s[0], 4),
    q1:       round(q1, 4),
    q3:       round(q3, 4),
    max:      round(s[s.length - 1], 4),
    iqr:      round(q3 - q1, 4),
    p10:      round(percentile(s, 0.10), 4),
    p90:      round(percentile(s, 0.90), 4),
    skewness: round(skewness(a), 4),
    kurtosis: round(kurtosis(a), 4),
    mad:      round(mad(a), 4)
  };
}

function round(v, dp) {
  if (v === null || v === undefined || !isFinite(v)) { return null; }
  var f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

// ─── Linear algebra (small matrices only) ───────────────────────────────────

/**
 * Gauss-Jordan inverse with partial pivoting. Returns null for a singular or
 * near-singular matrix, which the caller treats as "this detector cannot run"
 * rather than producing garbage distances.
 */
function invert(M) {
  var n = M.length;
  var A = M.map(function (row, i) {
    return row.slice().concat(row.map(function (_, j) { return i === j ? 1 : 0; }));
  });
  for (var col = 0; col < n; col++) {
    var piv = col;
    for (var r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) { piv = r; }
    }
    if (Math.abs(A[piv][col]) < 1e-12) { return null; }
    var tmp = A[col]; A[col] = A[piv]; A[piv] = tmp;
    var d = A[col][col];
    for (var k = 0; k < 2 * n; k++) { A[col][k] /= d; }
    for (var r2 = 0; r2 < n; r2++) {
      if (r2 === col) { continue; }
      var factor = A[r2][col];
      if (factor === 0) { continue; }
      for (var k2 = 0; k2 < 2 * n; k2++) { A[r2][k2] -= factor * A[col][k2]; }
    }
  }
  return A.map(function (row) { return row.slice(n); });
}

// ─── Outlier detectors ──────────────────────────────────────────────────────

/** Tukey fences: values outside Q1 - k*IQR .. Q3 + k*IQR. */
function tukeyFences(values, k) {
  var s = sortAsc(clean(values));
  if (s.length < 4) { return null; }
  var q1 = percentile(s, 0.25), q3 = percentile(s, 0.75);
  var iqr = q3 - q1;
  return { lower: q1 - k * iqr, upper: q3 + k * iqr, q1: q1, q3: q3, iqr: iqr };
}

/**
 * Squared Mahalanobis distance of every row from the centre, using either the
 * classical mean/covariance or a robust median/MAD-based estimate.
 *
 * The robust variant deliberately replaces a proper MCD estimator: MCD is
 * iterative and far heavier, and its cost is exactly what would make an
 * in-browser build stall. MAD-based scaling is slightly less efficient
 * statistically but stable and cheap, and is defensible in a write-up.
 */
function mahalanobis(rows, robust) {
  var k = rows[0].length;
  var cols = [];
  for (var j = 0; j < k; j++) {
    cols.push(rows.map(function (r) { return r[j]; }));
  }
  var centre = cols.map(function (c) { return robust ? median(c) : mean(c); });
  var scale  = cols.map(function (c) { return robust ? mad(c) : sd(c); });
  if (scale.some(function (s) { return !s; })) { return null; }

  // Standardise first, so the covariance we invert is a correlation matrix —
  // far better conditioned than a raw covariance across variables whose units
  // differ by orders of magnitude (rupees per sq ft versus a 0-100 score).
  var Z = rows.map(function (r) {
    return r.map(function (v, j) { return (v - centre[j]) / scale[j]; });
  });
  var C = [];
  for (var a = 0; a < k; a++) {
    C.push([]);
    for (var b = 0; b < k; b++) {
      C[a].push(a === b ? 1 : (pearson(Z.map(function (z) { return z[a]; }),
                                       Z.map(function (z) { return z[b]; })) || 0));
    }
  }
  var Cinv = invert(C);
  if (!Cinv) { return null; }

  return Z.map(function (z) {
    var d2 = 0;
    for (var i = 0; i < k; i++) {
      for (var j2 = 0; j2 < k; j2++) { d2 += z[i] * Cinv[i][j2] * z[j2]; }
    }
    return d2;
  });
}

/**
 * Upper-tail chi-square critical values, df = 1..8.
 * Hard-coded because computing the inverse chi-square CDF from scratch adds
 * meaningful complexity for values that never change.
 */
var CHISQ = {
  "0.99":  [6.635, 9.210, 11.345, 13.277, 15.086, 16.812, 18.475, 20.090],
  "0.975": [5.024, 7.378,  9.348, 11.143, 12.833, 14.449, 16.013, 17.535],
  "0.95":  [3.841, 5.991,  7.815,  9.488, 11.070, 12.592, 14.067, 15.507]
};

// ─── Detector scoring against ground truth ──────────────────────────────────

function scoreAgainstTruth(flaggedIds, truthIds) {
  var flagged = new Set(flaggedIds);
  var truth   = new Set(truthIds);
  var tp = 0, fp = 0, fn = 0;
  flagged.forEach(function (id) { if (truth.has(id)) { tp++; } else { fp++; } });
  truth.forEach(function (id) { if (!flagged.has(id)) { fn++; } });
  var precision = (tp + fp) ? tp / (tp + fp) : 0;
  var recall    = (tp + fn) ? tp / (tp + fn) : 0;
  var f1        = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    flagged: flagged.size,
    truePositives: tp, falsePositives: fp, falseNegatives: fn,
    precision: round(precision, 4),
    recall:    round(recall, 4),
    f1:        round(f1, 4)
  };
}

// ─── Load ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(OBS_PATH))   { throw new Error("observations.v2.json missing — run generateObservations.js first."); }
if (!fs.existsSync(TRUTH_PATH)) { throw new Error("outlier_truth.json missing — run generateObservations.js first."); }

var obs      = JSON.parse(fs.readFileSync(OBS_PATH, "utf8"));
var truthDoc = JSON.parse(fs.readFileSync(TRUTH_PATH, "utf8"));
var truthIds = truthDoc.outliers.map(function (o) { return o.obs_id; });
var truthById = {};
truthDoc.outliers.forEach(function (o) { truthById[o.obs_id] = o; });

console.log("REIT Target AI — statistics engine");
console.log("Observations: " + obs.length + "   planted outliers: " + truthIds.length + "\n");

var VARS = [
  { key: "gross_yield_pct",    label: "Gross Yield (%)" },
  { key: "sale_price_psf",     label: "Capital Value (₹/sq ft)" },
  { key: "monthly_rent_psf",   label: "Monthly Rent (₹/sq ft)" },
  { key: "rental_growth_pct",  label: "Rental Growth (% p.a.)" },
  { key: "capital_growth_pct", label: "Capital Growth (% p.a.)" },
  { key: "occupancy_pct",      label: "Occupancy (%)" },
  { key: "demand_score",       label: "Demand Score" },
  { key: "market_risk_score",  label: "Risk Score" }
];

function col(rows, key) { return rows.map(function (r) { return r[key]; }); }
function groupBy(rows, key) {
  var g = {};
  rows.forEach(function (r) { (g[r[key]] = g[r[key]] || []).push(r); });
  return g;
}

// ─── 1. Descriptive statistics ──────────────────────────────────────────────

var descriptives = { overall: {}, byPropertyType: {}, byCity: {} };
VARS.forEach(function (v) { descriptives.overall[v.key] = describe(col(obs, v.key)); });

var byType = groupBy(obs, "property_type");
Object.keys(byType).forEach(function (t) {
  descriptives.byPropertyType[t] = {};
  VARS.forEach(function (v) { descriptives.byPropertyType[t][v.key] = describe(col(byType[t], v.key)); });
});

var byCity = groupBy(obs, "city");
Object.keys(byCity).forEach(function (c) {
  descriptives.byCity[c] = {};
  VARS.forEach(function (v) { descriptives.byCity[c][v.key] = describe(col(byCity[c], v.key)); });
});
console.log("1. Descriptives: " + VARS.length + " variables, overall + " +
            Object.keys(byType).length + " types + " + Object.keys(byCity).length + " cities");

// ─── 2. Correlations, pooled AND stratified ─────────────────────────────────
/*
 * Both are reported because they disagree, and the disagreement is the point.
 * Pooling asset classes with very different yield levels reverses the sign of
 * the yield/risk relationship — a textbook Simpson's paradox. Showing only the
 * pooled matrix would state the opposite of what the data actually says.
 */

function corrMatrix(rows) {
  var m = {};
  VARS.forEach(function (a) {
    m[a.key] = {};
    VARS.forEach(function (b) {
      m[a.key][b.key] = a.key === b.key ? 1 : round(pearson(col(rows, a.key), col(rows, b.key)), 4);
    });
  });
  return m;
}

var correlations = { pooled: corrMatrix(obs), byPropertyType: {} };
Object.keys(byType).forEach(function (t) { correlations.byPropertyType[t] = corrMatrix(byType[t]); });

var KEY_PAIRS = [
  { a: "gross_yield_pct",   b: "sale_price_psf",     label: "Yield vs Capital Value",  expect: "negative", why: "Prime assets trade at lower cap rates" },
  { a: "gross_yield_pct",   b: "market_risk_score",  label: "Yield vs Risk",           expect: "positive", why: "The risk premium" },
  { a: "rental_growth_pct", b: "demand_score",       label: "Rental Growth vs Demand", expect: "positive", why: "Demand drives growth" },
  { a: "demand_score",      b: "market_risk_score",  label: "Demand vs Risk",          expect: "negative", why: "Liquid markets are safer" }
];

var simpson = KEY_PAIRS.map(function (p) {
  var strat = {};
  Object.keys(byType).forEach(function (t) {
    strat[t] = round(pearson(col(byType[t], p.a), col(byType[t], p.b)), 4);
  });
  var pooledVal = round(pearson(col(obs, p.a), col(obs, p.b)), 4);
  var stratVals = Object.keys(strat).map(function (t) { return strat[t]; }).filter(function (v) { return v !== null; });
  var signFlip = stratVals.length > 0 &&
                 stratVals.every(function (v) { return v > 0; }) && pooledVal < 0 ||
                 stratVals.every(function (v) { return v < 0; }) && pooledVal > 0;
  return {
    label: p.label, expect: p.expect, why: p.why,
    pooled: pooledVal, byPropertyType: strat, signFlip: signFlip
  };
});
console.log("2. Correlations: pooled + " + Object.keys(byType).length +
            " strata; sign flips detected: " + simpson.filter(function (s) { return s.signFlip; }).length);

// ─── 3. OLS regression for the scatter's fitted line and bands ──────────────

function ols(xs, ys) {
  var n = xs.length;
  if (n < 3) { return null; }
  var mx = mean(xs), my = mean(ys);
  var sxx = 0, sxy = 0;
  for (var i = 0; i < n; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
  if (sxx === 0) { return null; }
  var slope = sxy / sxx;
  var intercept = my - slope * mx;
  var ssRes = 0, ssTot = 0;
  for (var j = 0; j < n; j++) {
    var pred = intercept + slope * xs[j];
    ssRes += Math.pow(ys[j] - pred, 2);
    ssTot += Math.pow(ys[j] - my, 2);
  }
  var dfRes = n - 2;
  var mse   = ssRes / dfRes;
  return {
    n: n,
    slope: round(slope, 6), intercept: round(intercept, 6),
    r2: round(ssTot ? 1 - ssRes / ssTot : null, 4),
    rmse: round(Math.sqrt(mse), 4),
    seSlope: round(Math.sqrt(mse / sxx), 6),
    tSlope: round(slope / Math.sqrt(mse / sxx), 4),
    meanX: round(mx, 6), sxx: round(sxx, 6), df: dfRes
  };
}

var regression = {
  yieldOnGrowth: ols(col(obs, "rental_growth_pct"), col(obs, "gross_yield_pct")),
  byPropertyType: {}
};
Object.keys(byType).forEach(function (t) {
  regression.byPropertyType[t] = ols(col(byType[t], "rental_growth_pct"), col(byType[t], "gross_yield_pct"));
});
console.log("3. Regression: yield ~ growth, pooled R2 = " + (regression.yieldOnGrowth || {}).r2);

// ─── 4. Outlier detection — three methods, scored against ground truth ──────

var detectors = {};

// (a) Tukey fences on yield, POOLED across the whole dataset.
var pooledFences = tukeyFences(col(obs, "gross_yield_pct"), 1.5);
var pooledFlagged = obs.filter(function (o) {
  return o.gross_yield_pct < pooledFences.lower || o.gross_yield_pct > pooledFences.upper;
}).map(function (o) { return o.obs_id; });
detectors.tukeyPooled = {
  method: "Tukey fences (1.5 × IQR) on gross yield, all 2,156 observations pooled",
  family: "non-parametric",
  fences: { lower: round(pooledFences.lower, 4), upper: round(pooledFences.upper, 4) },
  score: scoreAgainstTruth(pooledFlagged, truthIds)
};

// (b) The same rule applied WITHIN each market.
var stratFlagged = [];
var byMarket = groupBy(obs, "market_id");
Object.keys(byMarket).forEach(function (m) {
  var f = tukeyFences(col(byMarket[m], "gross_yield_pct"), 1.5);
  if (!f) { return; }
  byMarket[m].forEach(function (o) {
    if (o.gross_yield_pct < f.lower || o.gross_yield_pct > f.upper) { stratFlagged.push(o.obs_id); }
  });
});
detectors.tukeyStratified = {
  method: "Tukey fences (1.5 × IQR) on gross yield, applied within each of the 50 markets",
  family: "non-parametric",
  score: scoreAgainstTruth(stratFlagged, truthIds)
};

// (c) Robust Mahalanobis distance over five standardised variables.
var MAHA_VARS = ["gross_yield_pct", "rental_growth_pct", "demand_score", "market_risk_score", "occupancy_pct"];
var mahaRows = obs.map(function (o) {
  return MAHA_VARS.map(function (k) { return o[k]; });
});
var d2 = mahalanobis(mahaRows, true);
if (d2) {
  var crit = CHISQ["0.99"][MAHA_VARS.length - 1];
  var mahaFlagged = obs.filter(function (_, i) { return d2[i] > crit; }).map(function (o) { return o.obs_id; });
  detectors.mahalanobisRobust = {
    method: "Robust (median/MAD) Mahalanobis distance over " + MAHA_VARS.length +
            " standardised variables, χ² cutoff at α = 0.01",
    family: "multivariate",
    variables: MAHA_VARS,
    criticalValue: crit,
    score: scoreAgainstTruth(mahaFlagged, truthIds)
  };
} else {
  detectors.mahalanobisRobust = { method: "Robust Mahalanobis", error: "covariance matrix not invertible — detector not run" };
}

/*
 * (d) The same robust Mahalanobis, but fitted WITHIN each property type.
 *
 * Pooled, it performs badly for exactly the reason the pooled Tukey rule does:
 * the dataset is a mixture of three asset classes with very different centres,
 * so a single ellipse drawn around all of them treats normal members of the
 * smaller classes as extreme. Fitting per class removes that, and is the
 * multivariate counterpart of stratifying the univariate rule.
 *
 * Stratifying by market rather than by type was rejected: with 26-76
 * observations per market and five variables, the covariance estimate would
 * rest on as few as ~5 observations per parameter.
 */
var mahaStratFlagged = [];
var mahaStratDetail = {};
Object.keys(byType).forEach(function (t) {
  var rowsT = byType[t];
  if (rowsT.length < 10 * MAHA_VARS.length) {
    mahaStratDetail[t] = { n: rowsT.length, run: false, reason: "too few observations for a stable covariance estimate" };
    return;
  }
  var dT = mahalanobis(rowsT.map(function (o) {
    return MAHA_VARS.map(function (k) { return o[k]; });
  }), true);
  if (!dT) {
    mahaStratDetail[t] = { n: rowsT.length, run: false, reason: "covariance matrix not invertible" };
    return;
  }
  var critT = CHISQ["0.99"][MAHA_VARS.length - 1];
  var flaggedT = 0;
  rowsT.forEach(function (o, i) {
    if (dT[i] > critT) { mahaStratFlagged.push(o.obs_id); flaggedT++; }
  });
  mahaStratDetail[t] = { n: rowsT.length, run: true, flagged: flaggedT };
});

detectors.mahalanobisStratified = {
  method: "Robust (median/MAD) Mahalanobis over " + MAHA_VARS.length +
          " standardised variables, fitted within each property type, χ² cutoff at α = 0.01",
  family: "multivariate",
  variables: MAHA_VARS,
  criticalValue: CHISQ["0.99"][MAHA_VARS.length - 1],
  perStratum: mahaStratDetail,
  score: scoreAgainstTruth(mahaStratFlagged, truthIds)
};

// Per-mechanism recall: which planted mechanisms each detector actually finds.
var mechanisms = {};
truthDoc.outliers.forEach(function (o) { mechanisms[o.mechanism] = (mechanisms[o.mechanism] || 0) + 1; });
var recallByMechanism = {};
[["tukeyPooled", pooledFlagged], ["tukeyStratified", stratFlagged],
 ["mahalanobisRobust", d2 ? obs.filter(function (_, i) { return d2[i] > CHISQ["0.99"][MAHA_VARS.length - 1]; }).map(function (o) { return o.obs_id; }) : []],
 ["mahalanobisStratified", mahaStratFlagged]
].forEach(function (pair) {
  var set = new Set(pair[1]);
  recallByMechanism[pair[0]] = {};
  Object.keys(mechanisms).forEach(function (mech) {
    var ids = truthDoc.outliers.filter(function (o) { return o.mechanism === mech; }).map(function (o) { return o.obs_id; });
    var found = ids.filter(function (id) { return set.has(id); }).length;
    recallByMechanism[pair[0]][mech] = { planted: ids.length, found: found };
  });
});

console.log("4. Outlier detectors:");
Object.keys(detectors).forEach(function (k) {
  var s = detectors[k].score;
  if (s) {
    console.log("   " + k.padEnd(20) + " flagged=" + String(s.flagged).padStart(4) +
                "  precision=" + s.precision.toFixed(3) +
                "  recall=" + s.recall.toFixed(3) + "  F1=" + s.f1.toFixed(3));
  }
});

// ─── 5. Sample-size panel ───────────────────────────────────────────────────

var sampleSize = {
  threshold: MIN_OBS_WARNING,
  totalMarkets: Object.keys(byMarket).length,
  belowThreshold: Object.keys(byMarket)
    .filter(function (m) { return byMarket[m].length < MIN_OBS_WARNING; })
    .map(function (m) {
      var r = byMarket[m][0];
      return { marketId: m, city: r.city, locality: r.locality, propertyType: r.property_type, n: byMarket[m].length };
    })
    .sort(function (a, b) { return a.n - b.n; })
};
console.log("5. Sample size: " + sampleSize.belowThreshold.length + " of " +
            sampleSize.totalMarkets + " markets below n=" + MIN_OBS_WARNING);

// ─── 6. Scatter payload ─────────────────────────────────────────────────────
/*
 * Points are emitted here rather than having the page re-read the 1.1 MB
 * observation file and derive them. Only what the chart draws is included.
 */
var truthSet = new Set(truthIds);
var scatter = {
  xVar: "rental_growth_pct", xLabel: "Rental Growth (% p.a.)",
  yVar: "gross_yield_pct",   yLabel: "Gross Yield (%)",
  points: obs.map(function (o) {
    return {
      x: round(o.rental_growth_pct, 3),
      y: round(o.gross_yield_pct, 3),
      t: o.property_type,
      id: o.obs_id,
      o: truthSet.has(o.obs_id) ? 1 : 0,
      m: truthSet.has(o.obs_id) ? truthById[o.obs_id].mechanism : null
    };
  }),
  fit: regression.yieldOnGrowth
};
console.log("6. Scatter: " + scatter.points.length + " points");

// ─── Write ──────────────────────────────────────────────────────────────────

var output = {
  generatedFrom: "data-pipeline/generated/observations.v2.json",
  generatorVersion: truthDoc.generator_version,
  seed: truthDoc.seed,
  totalObservations: obs.length,
  isSynthetic: true,
  disclaimer: "All figures derive from a synthetic academic dataset. Not real market data and not investment advice.",
  variables: VARS,
  descriptives: descriptives,
  correlations: correlations,
  simpsonsParadox: simpson,
  regression: regression,
  outlierDetection: {
    groundTruth: {
      planted: truthIds.length,
      contaminationPct: round(100 * truthIds.length / obs.length, 3),
      byMechanism: mechanisms,
      note: "Outliers were planted deliberately by the generator and their identities held " +
            "in a separate file, so detector performance can be measured rather than asserted."
    },
    detectors: detectors,
    recallByMechanism: recallByMechanism
  },
  sampleSize: sampleSize,
  scatter: scatter
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output), "utf8");
var kb = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
console.log("\nWrote public/data/statistics.json (" + kb + " KB)");

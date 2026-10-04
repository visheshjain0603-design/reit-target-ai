/**
 * buildObservationDistribution.js — per-segment observation summaries
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4.  ALL DATA IS SYNTHETIC.
 *
 * WHY A BUILD STEP
 * ----------------
 * The screener needs to show, for a chosen segment, the distribution of the
 * simulated observations that segment's median was computed from. The obvious
 * implementation — fetch observations.json and reduce it in the browser — was
 * rejected: that file is 1.1 MB, and summarising 2,156 records on every row
 * expansion is work the browser would repeat for a result that never changes.
 * An earlier version of the statistics page froze for exactly this reason.
 *
 * So the summaries are computed once, here, and written to a small file the
 * browser only reads. The application cannot hang computing them because it
 * never computes them.
 *
 * TERMINOLOGY — this is not negotiable wording
 * --------------------------------------------
 * Each record is a SIMULATED MARKET OBSERVATION: one draw from this project's
 * seeded generator. The output of this script must never be described as
 * properties, listings, transactions, comparables or deals. Those words all
 * assert that something real happened, and nothing real happened here. The
 * field is named `observations` and the display label is carried in this file
 * so no page can quietly choose a different word.
 *
 * Run:  node data-pipeline/scripts/buildObservationDistribution.js
 */

"use strict";

var fs   = require("fs");
var path = require("path");

var PROJECT = path.join(__dirname, "..", "..");
var DATA    = path.join(PROJECT, "public", "data");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

var obsDoc     = readJson(path.join(DATA, "observations.json"));
var marketsDoc = readJson(path.join(DATA, "markets.json"));

var observations = obsDoc.observations || [];
var markets      = marketsDoc.markets  || [];

if (!observations.length) {
  throw new Error("observations.json contains no observations — nothing to summarise.");
}

/* Metrics summarised per segment. Each needs a label and the number of decimal
 * places it is meaningful at; carrying both here stops every consumer from
 * inventing its own formatting. */
var METRICS = [
  { key: "gross_yield_pct",   label: "Gross yield",    unit: "%",          dp: 2 },
  { key: "monthly_rent_psf",  label: "Monthly rent",   unit: "₹/sq ft", dp: 1 },
  { key: "sale_price_psf",    label: "Capital value",  unit: "₹/sq ft", dp: 0 },
  { key: "rental_growth_pct", label: "Rental growth",  unit: "% p.a.",     dp: 2 },
  { key: "occupancy_pct",     label: "Occupancy",      unit: "%",          dp: 1 },
  { key: "market_risk_score", label: "Risk score",     unit: "/100",       dp: 1 }
];

var HISTOGRAM_BINS = 10;

function quantile(sorted, p) {
  if (!sorted.length) { return null; }
  if (sorted.length === 1) { return sorted[0]; }
  var idx = (sorted.length - 1) * p;
  var lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) { return sorted[lo]; }
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function round(v, dp) {
  if (typeof v !== "number" || !isFinite(v)) { return null; }
  var f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function summarise(values, dp) {
  var vals = values.filter(function (v) { return typeof v === "number" && isFinite(v); });
  if (!vals.length) { return null; }
  var sorted = vals.slice().sort(function (a, b) { return a - b; });
  var n = sorted.length;
  var mean = sorted.reduce(function (s, v) { return s + v; }, 0) / n;
  /* Sample standard deviation (n−1). These are draws from a simulated
   * population, so the sample form is the right one. */
  var variance = n > 1
    ? sorted.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (n - 1)
    : 0;
  var q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
  return {
    n:      n,
    min:    round(sorted[0], dp),
    p10:    round(quantile(sorted, 0.10), dp),
    q1:     round(q1, dp),
    median: round(quantile(sorted, 0.50), dp),
    q3:     round(q3, dp),
    p90:    round(quantile(sorted, 0.90), dp),
    max:    round(sorted[n - 1], dp),
    mean:   round(mean, dp),
    sd:     round(Math.sqrt(variance), dp),
    iqr:    round(q3 - q1, dp)
  };
}

/** Equal-width histogram over the segment's own range. */
function histogram(values, dp) {
  var vals = values.filter(function (v) { return typeof v === "number" && isFinite(v); });
  if (vals.length < 2) { return null; }
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi === lo) { return null; }
  var width = (hi - lo) / HISTOGRAM_BINS;
  var counts = new Array(HISTOGRAM_BINS);
  for (var i = 0; i < HISTOGRAM_BINS; i++) { counts[i] = 0; }
  vals.forEach(function (v) {
    var b = Math.floor((v - lo) / width);
    if (b >= HISTOGRAM_BINS) { b = HISTOGRAM_BINS - 1; }   // the maximum lands in the last bin
    if (b < 0) { b = 0; }
    counts[b]++;
  });
  return {
    lower:    round(lo, dp),
    upper:    round(hi, dp),
    binWidth: round(width, dp),
    counts:   counts
  };
}

// ─── Build ──────────────────────────────────────────────────────────────────

var byMarket = {};
observations.forEach(function (o) {
  var id = o.market_id;
  if (!byMarket[id]) { byMarket[id] = []; }
  byMarket[id].push(o);
});

var segments = {};
var missing  = [];

markets.forEach(function (m) {
  var rows = byMarket[m.marketId];
  if (!rows || !rows.length) { missing.push(m.marketId); return; }

  /* Cross-check: markets.json records an observationCount that deriveMarkets.js
   * wrote. If it disagrees with the records actually present, the two files
   * were built from different generator runs and the whole dataset is suspect.
   * Fail the build — a silent mismatch here is how "2,000 observations" and
   * "counts of 25–87" came to coexist in an earlier revision. */
  if (typeof m.observationCount === "number" && m.observationCount !== rows.length) {
    throw new Error(
      "Observation count mismatch for " + m.marketId + ": markets.json says " +
      m.observationCount + ", observations.json holds " + rows.length +
      ". Regenerate the whole pipeline."
    );
  }

  var metrics = {};
  METRICS.forEach(function (spec) {
    var values = rows.map(function (r) { return r[spec.key]; });
    metrics[spec.key] = {
      label:     spec.label,
      unit:      spec.unit,
      dp:        spec.dp,
      summary:   summarise(values, spec.dp),
      histogram: histogram(values, spec.dp)
    };
  });

  segments[m.marketId] = {
    marketId:      m.marketId,
    city:          m.city,
    locality:      m.locality,
    propertyType:  m.propertyType,
    localityClass: m.localityClass,
    observations:  rows.length,
    confidenceGrade: m.confidenceGrade || null,
    metrics:       metrics
  };
});

if (missing.length) {
  throw new Error("No observations found for: " + missing.join(", "));
}

var out = {
  note: "GENERATED FILE — do not edit by hand. Produced by " +
        "data-pipeline/scripts/buildObservationDistribution.js.",
  terminology: {
    recordNoun:      "simulated market observation",
    recordNounPlural: "simulated market observations",
    panelTitle:      "Observation Distribution",
    datasetLabel:    "Simulated Market Observations",
    forbidden:       ["property", "properties", "listing", "listings",
                      "transaction", "transactions", "comparable", "comparables", "deal", "deals"],
    explanation:     "Each record is one draw from this project's seeded simulation. " +
                     "No record corresponds to a real property, listing or transaction, and " +
                     "the segment figures shown elsewhere in this application are the medians " +
                     "of these draws."
  },
  generatorVersion: obsDoc.generatorVersion || null,
  isSynthetic:      true,
  disclaimer:       obsDoc.disclaimer ||
                    "All observations are synthetic and exist for academic demonstration only.",
  metricOrder:      METRICS.map(function (m) { return m.key; }),
  histogramBins:    HISTOGRAM_BINS,
  totalObservations: observations.length,
  segmentCount:     Object.keys(segments).length,
  segments:         segments
};

var target = path.join(DATA, "observation-distribution.json");
fs.writeFileSync(target, JSON.stringify(out, null, 1) + "\n", "utf8");

var bytes = fs.statSync(target).size;
console.log("Wrote public/data/observation-distribution.json — " +
            out.segmentCount + " segments, " + out.totalObservations +
            " observations, " + (bytes / 1024).toFixed(0) + " KB");

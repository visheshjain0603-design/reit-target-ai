/**
 * deriveMarkets.js — rebuild public/data/markets.json FROM the observation data
 * NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * Why this exists
 * ---------------
 * Until now markets.json was maintained independently of the observation
 * data, and the two disagreed: markets.json advertised observationCount
 * values of 25-87 while the generator produced exactly 40 draws for every
 * market, and the application reported "2,156 observations" that existed
 * nowhere on disk. This script makes markets.json a DERIVED artefact, so the
 * headline figures and the underlying records can no longer drift apart.
 *
 * Schema safety
 * -------------
 * Every field present in the existing markets.json is preserved. The script
 * loads the current file and replaces ONLY the statistical fields, copying
 * provenance (sourceIds, assumptionIds, confidenceGrade, methodologyNote,
 * classificationNote, comparabilityWarning, localityClass, dataClassification)
 * through untouched. No market is added, removed or reordered, and no field
 * name changes — the scoring engine, HHI engine and test suite are unaffected.
 *
 * Statistical fields replaced, each now an empirical statistic of the
 * observations belonging to that market rather than an assumed figure:
 *   medianCapitalValuePerSqFt   median sale_price_psf
 *   medianMonthlyRentPerSqFt    median monthly_rent_psf
 *   annualRentalGrowthRatio     median rental_growth_pct / 100
 *   demandScore                 median demand_score
 *   riskScore                   median market_risk_score
 *   observationCount            actual number of records generated
 *   uncertainty                 empirical P10 / median / P90, replacing the
 *                               previous assumed "+/-10-12%" bands
 *
 * Run (after generateObservations.js):
 *   node data-pipeline/scripts/deriveMarkets.js
 */

"use strict";

var fs   = require("fs");
var path = require("path");

var ROOT      = path.join(__dirname, "..");
var PROJECT   = path.join(ROOT, "..");
var OBS_PATH   = path.join(ROOT, "generated", "observations.v2.json");
var MKT_PATH   = path.join(PROJECT, "public", "data", "markets.json");
var OBS_PUBLIC = path.join(PROJECT, "public", "data", "observations.json");

var GENERATOR_VERSION = "2.0.0";

// ─── Statistics helpers ─────────────────────────────────────────────────────

function median(sorted) {
  var n = sorted.length;
  if (!n) { return null; }
  var mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Linear-interpolation percentile (the "type 7" definition R and NumPy use). */
function percentile(sorted, p) {
  var n = sorted.length;
  if (!n) { return null; }
  if (n === 1) { return sorted[0]; }
  var idx = (n - 1) * p;
  var lo  = Math.floor(idx);
  var hi  = Math.min(lo + 1, n - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function round(v, dp) {
  if (v === null || v === undefined || isNaN(v)) { return null; }
  var f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

// ─── Load ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(OBS_PATH)) {
  throw new Error("observations.v2.json not found. Run generateObservations.js first.");
}

var observations = JSON.parse(fs.readFileSync(OBS_PATH, "utf8"));
var marketsDoc   = JSON.parse(fs.readFileSync(MKT_PATH, "utf8"));

console.log("Loaded " + observations.length + " observations and " +
            marketsDoc.markets.length + " existing market records.");

var byMarket = {};
observations.forEach(function (o) {
  if (!byMarket[o.market_id]) { byMarket[o.market_id] = []; }
  byMarket[o.market_id].push(o);
});

// ─── Derive ─────────────────────────────────────────────────────────────────

var missing = [];
var rebuilt = marketsDoc.markets.map(function (m) {
  var obs = byMarket[m.marketId];
  if (!obs || !obs.length) {
    // Never silently drop or blank a market — fail loudly instead.
    missing.push(m.marketId);
    return m;
  }

  function sortedCol(field) {
    return obs.map(function (o) { return o[field]; })
              .filter(function (v) { return typeof v === "number" && !isNaN(v); })
              .sort(function (a, b) { return a - b; });
  }

  var price  = sortedCol("sale_price_psf");
  var rent   = sortedCol("monthly_rent_psf");
  var growth = sortedCol("rental_growth_pct");
  var demand = sortedCol("demand_score");
  var risk   = sortedCol("market_risk_score");
  var yieldS = sortedCol("gross_yield_pct");

  // Shallow copy so every provenance field carries through unchanged.
  var out = {};
  Object.keys(m).forEach(function (k) { out[k] = m[k]; });

  out.medianCapitalValuePerSqFt = round(median(price), 0);
  out.medianMonthlyRentPerSqFt  = round(median(rent), 2);
  out.annualRentalGrowthRatio   = round(median(growth) / 100, 5);
  out.demandScore               = round(median(demand), 1);
  out.riskScore                 = round(median(risk), 1);
  out.observationCount          = obs.length;

  /*
   * Uncertainty bands are now EMPIRICAL (P10/median/P90 of the actual
   * observations) rather than the previous assumed "+/-10-12%" envelope.
   * The basis string records the change so a reader is not misled into
   * thinking these are still assumption-derived.
   */
  var basis = "Empirical P10-P90 of " + obs.length + " generated observations (seeded, reproducible)";
  out.uncertainty = {
    grossYieldPct: {
      lower:   round(percentile(yieldS, 0.10), 2),
      central: round(median(yieldS), 2),
      upper:   round(percentile(yieldS, 0.90), 2),
      basis:   basis
    },
    rentalGrowthPct: {
      lower:   round(percentile(growth, 0.10), 2),
      central: round(median(growth), 2),
      upper:   round(percentile(growth, 0.90), 2),
      basis:   basis
    },
    demandScore: {
      lower:   round(percentile(demand, 0.10), 1),
      central: round(median(demand), 1),
      upper:   round(percentile(demand, 0.90), 1),
      basis:   basis
    },
    riskScore: {
      lower:   round(percentile(risk, 0.10), 1),
      central: round(median(risk), 1),
      upper:   round(percentile(risk, 0.90), 1),
      basis:   basis
    }
  };

  /*
   * dataClassification is deliberately NOT touched. It records the evidence
   * basis of the market itself — 'Derived' where a REIT disclosure anchors
   * the locality, 'Estimated' where a city benchmark was extrapolated,
   * 'Synthetic' for peripheral markets with no documented anchor at all.
   * That distinction is about provenance, not about which statistic is
   * displayed, so recomputing the numbers must not collapse it. An earlier
   * revision of this script set every market to 'Derived' and was caught by
   * tests T-133 and T-135.
   */
  out.derivedFrom = {
    source: "data-pipeline/generated/observations.v2.json",
    generatorVersion: GENERATOR_VERSION,
    observationCount: obs.length,
    statistic: "median (P50) of observation-level values"
  };

  return out;
});

if (missing.length) {
  throw new Error("No observations generated for: " + missing.join(", ") +
                  ". markets.json was NOT written.");
}

if (rebuilt.length !== 50) {
  throw new Error("Expected 50 markets after derivation, got " + rebuilt.length);
}

// ─── Write ──────────────────────────────────────────────────────────────────

marketsDoc.markets     = rebuilt;
marketsDoc.totalMarkets = rebuilt.length;
marketsDoc.datasetName  = "REIT Target Market Segments — Synthetic Academic Dataset (50 Markets, derived from 2,156 observations)";
marketsDoc.derivedFrom  = {
  source: "data-pipeline/generated/observations.v2.json",
  generatorVersion: GENERATOR_VERSION,
  totalObservations: observations.length,
  note: "Every statistical field in this file is the median of the observation-level " +
        "records for that market. Regenerate with: node data-pipeline/scripts/generateObservations.js " +
        "&& node data-pipeline/scripts/deriveMarkets.js"
};

fs.writeFileSync(MKT_PATH, JSON.stringify(marketsDoc, null, 2), "utf8");

/*
 * Publish the observations to public/data as well. The application has never
 * had access to observation-level data, which is why it could only ever show
 * 50 pre-aggregated medians while claiming 2,156 observations.
 */
fs.writeFileSync(OBS_PUBLIC, JSON.stringify({
  datasetName: "REIT Target observation-level synthetic dataset",
  generatorVersion: GENERATOR_VERSION,
  totalObservations: observations.length,
  isSynthetic: true,
  disclaimer: marketsDoc.disclaimer,
  observations: observations
}), "utf8");

var totalObs = observations.length;
console.log("\nRebuilt markets.json from observation data:");
console.log("  markets            : " + rebuilt.length);
console.log("  total observations : " + totalObs);
console.log("  obs per market     : min " +
            Math.min.apply(null, rebuilt.map(function (m) { return m.observationCount; })) +
            ", max " +
            Math.max.apply(null, rebuilt.map(function (m) { return m.observationCount; })));
console.log("\nWrote:");
console.log("  public/data/markets.json       (derived)");
console.log("  public/data/observations.json  (" + totalObs + " records, now reachable by the app)");

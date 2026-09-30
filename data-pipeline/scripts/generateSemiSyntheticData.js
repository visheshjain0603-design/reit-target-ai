/**
 * generateSemiSyntheticData.js
 * Semi-Synthetic Market Data Generator — REIT Target AI
 * NMIMS B.Sc. Finance | Business Analytics Project Theme 4
 *
 * Generates 2 000 simulated observations (50 markets × 40 draws) by
 * sampling a Triangular distribution anchored to evidence-backed
 * central / lower / upper estimates from market_estimates_long.csv.
 *
 * IMPORTANT ISOLATION RULE:
 *   Output goes ONLY to data-pipeline/generated/.
 *   This script MUST NOT be imported by or called from the application.
 *   It MUST NOT modify any file outside data-pipeline/.
 *
 * Seed   : 20260919  (fixed; from brief date 2026-09-19)
 * Outputs: observations.csv   — 2 000 rows, one observation per row
 *          observations.json  — same data as JSON array
 *          generation_log.json — run metadata and summary statistics
 *
 * Run: node scripts/generateSemiSyntheticData.js
 *      (from data-pipeline/ directory)
 *
 * Node built-ins only; no npm dependencies.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── CONFIGURATION ─────────────────────────────────────────────────────────
const SEED              = 20260919;
const DRAWS_PER_MARKET  = 40;         // 50 markets × 40 = 2 000 total
const EXPECTED_MARKETS  = 50;
const EXPECTED_TOTAL    = 2000;
const DATE_GENERATED    = "2026-09-19";

const BASE          = path.resolve(__dirname, "..");
const ESTIMATES_CSV = path.join(BASE, "market_estimates_long.csv");
const UNIVERSE_CSV  = path.join(BASE, "market_universe.csv");
const OUT_DIR       = path.join(BASE, "generated");

// ─── SEEDED PRNG (Mulberry32) ───────────────────────────────────────────────
// Mulberry32 — simple, fast, reproducible 32-bit PRNG.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

// ─── TRIANGULAR SAMPLER ─────────────────────────────────────────────────────
/**
 * Sample from Triangular(lower, central, upper) using the inverse-CDF method.
 * Returns a value in [lower, upper] with peak probability at central.
 *
 * @param {number} lower    - minimum value (lower_estimate from CSV)
 * @param {number} central  - mode / most-likely value (central_estimate)
 * @param {number} upper    - maximum value (upper_estimate)
 * @param {Function} rng    - uniform [0,1) sampler
 * @returns {number}
 */
function triangularSample(lower, central, upper, rng) {
  if (lower >= upper) return central;           // degenerate guard
  const u  = rng();
  const fc = (central - lower) / (upper - lower);
  if (u < fc) {
    return lower + Math.sqrt(u * (upper - lower) * (central - lower));
  } else {
    return upper - Math.sqrt((1 - u) * (upper - lower) * (upper - central));
  }
}

// ─── CSV PARSER (no external deps) ─────────────────────────────────────────
function parseCSV(filepath) {
  const raw  = fs.readFileSync(filepath, "utf8").trim();
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map(function (line) {
    const values = line.split(",");
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h.trim()] = (values[i] || "").trim();
    });
    return obj;
  });
}

// ─── LOAD INPUT FILES ───────────────────────────────────────────────────────
console.log("Loading input files…");

if (!fs.existsSync(ESTIMATES_CSV)) {
  console.error("ERROR: " + ESTIMATES_CSV + " not found. Run build_pipeline.py first.");
  process.exit(1);
}
if (!fs.existsSync(UNIVERSE_CSV)) {
  console.error("ERROR: " + UNIVERSE_CSV + " not found. Run build_pipeline.py first.");
  process.exit(1);
}

const estimatesRaw = parseCSV(ESTIMATES_CSV);
const universeRaw  = parseCSV(UNIVERSE_CSV);

// Index universe by market_id for quick lookup
const universeMap = {};
universeRaw.forEach(function (row) {
  universeMap[row.market_id] = row;
});

// Group estimates by market_id → metric_name → row
const estimateMap = {};
estimatesRaw.forEach(function (row) {
  const mid = row.market_id;
  if (!estimateMap[mid]) estimateMap[mid] = {};
  estimateMap[mid][row.metric_name] = row;
});

const marketIds = Object.keys(estimateMap).sort();
console.log("  Markets loaded : " + marketIds.length);
console.log("  Estimate rows  : " + estimatesRaw.length);

if (marketIds.length !== EXPECTED_MARKETS) {
  console.warn("WARN: Expected " + EXPECTED_MARKETS + " markets, found " + marketIds.length);
}

// ─── METRICS TO SAMPLE ──────────────────────────────────────────────────────
// For each observation we sample these 9 metrics independently.
// demand_score and risk_score are then derived (not independently sampled)
// to maintain the score-formula relationship.
const METRICS = [
  "monthly_rent_psf",
  "sale_price_psf",
  "rental_growth_pct",
  "capital_growth_pct",
  "vacancy_rate_pct",
  "occupancy_rate_pct",
  "demand_score",
  "risk_score",
  "transaction_volume_index"
];

// ─── GENERATE OBSERVATIONS ──────────────────────────────────────────────────
console.log("Generating observations (seed=" + SEED + ", draws=" + DRAWS_PER_MARKET + ")…");

const observations = [];

marketIds.forEach(function (mid) {
  const meta   = universeMap[mid] || {};
  const mMetrics = estimateMap[mid];

  for (let draw = 1; draw <= DRAWS_PER_MARKET; draw++) {
    const obs = {
      obs_id              : mid + "_D" + String(draw).padStart(3, "0"),
      market_id           : mid,
      city                : meta.city || "",
      locality            : meta.locality || "",
      property_type       : meta.property_type || "",
      locality_class      : meta.locality_class || "",
      confidence_grade    : meta.confidence_grade || "",
      draw_number         : draw,
      seed                : SEED,
      date_generated      : DATE_GENERATED
    };

    // Sample each metric
    METRICS.forEach(function (metric) {
      const mRow = mMetrics ? mMetrics[metric] : null;
      let sampledValue;

      if (mRow) {
        const lower   = parseFloat(mRow.lower_estimate);
        const central = parseFloat(mRow.central_estimate);
        const upper   = parseFloat(mRow.upper_estimate);
        const ev_class = mRow.evidence_classification || "Synthetic";

        if (!isNaN(lower) && !isNaN(central) && !isNaN(upper)) {
          sampledValue = triangularSample(lower, central, upper, rand);
        } else {
          sampledValue = central || 0;
        }
        obs[metric]                        = parseFloat(sampledValue.toFixed(4));
        obs[metric + "_evidence_class"]    = ev_class;
        obs[metric + "_uncertainty_type"]  = mRow.uncertainty_type || "";
      } else {
        // Metric not available for this market → missing
        obs[metric]                       = null;
        obs[metric + "_evidence_class"]   = "Missing";
        obs[metric + "_uncertainty_type"] = "Not available";
      }
    });

    // Derived: gross_yield_pct (never independently sampled — always derived)
    if (obs.monthly_rent_psf !== null && obs.sale_price_psf !== null && obs.sale_price_psf > 0) {
      obs.gross_yield_pct_derived = parseFloat(
        ((obs.monthly_rent_psf * 12) / obs.sale_price_psf * 100).toFixed(4)
      );
    } else {
      obs.gross_yield_pct_derived = null;
    }

    observations.push(obs);
  }
});

console.log("  Observations generated: " + observations.length);
if (observations.length !== EXPECTED_TOTAL) {
  console.warn("WARN: Expected " + EXPECTED_TOTAL + " observations, got " + observations.length);
}

// ─── WRITE OUTPUTS ──────────────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Helper: write CSV from array of objects
function writeCSV(filepath, rows) {
  if (!rows.length) { fs.writeFileSync(filepath, ""); return; }
  const headers = Object.keys(rows[0]);
  const lines   = [headers.join(",")];
  rows.forEach(function (row) {
    const vals = headers.map(function (h) {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const s = String(v);
      // Quote fields containing commas, quotes, or newlines
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    });
    lines.push(vals.join(","));
  });
  fs.writeFileSync(filepath, lines.join("\n"), "utf8");
}

// ── observations.csv ────────────────────────────────────────────────────────
const obsCSVPath = path.join(OUT_DIR, "observations.csv");
writeCSV(obsCSVPath, observations);
console.log("  Written: " + obsCSVPath + " (" + observations.length + " rows)");

// ── observations.json ───────────────────────────────────────────────────────
const obsJSONPath = path.join(OUT_DIR, "observations.json");
fs.writeFileSync(obsJSONPath, JSON.stringify(observations, null, 2), "utf8");
console.log("  Written: " + obsJSONPath);

// ─── SUMMARY STATISTICS ─────────────────────────────────────────────────────
function mean(arr) {
  const valid = arr.filter(function (v) { return v !== null && !isNaN(v); });
  if (!valid.length) return null;
  return valid.reduce(function (a, b) { return a + b; }, 0) / valid.length;
}
function stddev(arr) {
  const valid = arr.filter(function (v) { return v !== null && !isNaN(v); });
  if (valid.length < 2) return null;
  const m = mean(valid);
  const variance = valid.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (valid.length - 1);
  return Math.sqrt(variance);
}
function minVal(arr) {
  const valid = arr.filter(function (v) { return v !== null && !isNaN(v); });
  return valid.length ? Math.min.apply(null, valid) : null;
}
function maxVal(arr) {
  const valid = arr.filter(function (v) { return v !== null && !isNaN(v); });
  return valid.length ? Math.max.apply(null, valid) : null;
}

const summaryStats = {};
METRICS.concat(["gross_yield_pct_derived"]).forEach(function (metric) {
  const vals = observations.map(function (o) { return o[metric]; });
  summaryStats[metric] = {
    count    : vals.filter(function (v) { return v !== null; }).length,
    mean     : mean(vals) !== null ? parseFloat(mean(vals).toFixed(4)) : null,
    std_dev  : stddev(vals) !== null ? parseFloat(stddev(vals).toFixed(4)) : null,
    min      : minVal(vals) !== null ? parseFloat(minVal(vals).toFixed(4)) : null,
    max      : maxVal(vals) !== null ? parseFloat(maxVal(vals).toFixed(4)) : null
  };
});

// Property type breakdown
const byType = {};
observations.forEach(function (o) {
  const t = o.property_type;
  if (!byType[t]) byType[t] = 0;
  byType[t]++;
});

// Confidence grade breakdown
const byGrade = {};
observations.forEach(function (o) {
  const g = o.confidence_grade;
  if (!byGrade[g]) byGrade[g] = 0;
  byGrade[g]++;
});

// ── generation_log.json ─────────────────────────────────────────────────────
const log = {
  generator_version  : "1.0.0",
  generated_at       : DATE_GENERATED,
  seed               : SEED,
  draws_per_market   : DRAWS_PER_MARKET,
  markets_count      : marketIds.length,
  total_observations : observations.length,
  prng_algorithm     : "Mulberry32",
  distribution       : "Triangular(lower, central, upper) — inverse-CDF method",
  isolation_note     : "Output files are in data-pipeline/generated/ only. Not connected to application.",
  outputs            : {
    observations_csv  : "generated/observations.csv",
    observations_json : "generated/observations.json",
    generation_log    : "generated/generation_log.json"
  },
  observations_by_property_type : byType,
  observations_by_confidence    : byGrade,
  summary_statistics : summaryStats
};

const logPath = path.join(OUT_DIR, "generation_log.json");
fs.writeFileSync(logPath, JSON.stringify(log, null, 2), "utf8");
console.log("  Written: " + logPath);

// ─── FINAL SUMMARY ──────────────────────────────────────────────────────────
console.log("\n=== GENERATION COMPLETE ===");
console.log("Observations  : " + observations.length + " (expected " + EXPECTED_TOTAL + ")");
console.log("Markets       : " + marketIds.length);
console.log("Property types: " + JSON.stringify(byType));
console.log("Confidence    : " + JSON.stringify(byGrade));
console.log("Rent (mean)   : " + (summaryStats.monthly_rent_psf.mean || "n/a") + " INR/sqft/month");
console.log("Yield (mean)  : " + (summaryStats.gross_yield_pct_derived.mean || "n/a") + " %");
console.log("Growth (mean) : " + (summaryStats.rental_growth_pct.mean || "n/a") + " % p.a.");


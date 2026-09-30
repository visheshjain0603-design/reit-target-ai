/**
 * dataPipeline.test.js
 * 22-test validation suite for the REIT Target AI data pipeline
 * NMIMS B.Sc. Finance | Business Analytics Project Theme 4
 *
 * Run: node tests/dataPipeline.test.js  (from data-pipeline/ directory)
 * No external test framework — plain Node.js assertions.
 *
 * Test groups:
 *   T-01 – T-04  : Source & evidence register integrity
 *   T-05 – T-08  : Market universe completeness
 *   T-09 – T-12  : Estimate range logic & evidence classification
 *   T-13 – T-16  : Observation count & seed reproducibility
 *   T-17 – T-19  : Derived field consistency (gross yield)
 *   T-20 – T-22  : Isolation guard (no application file referenced)
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");

// ─── MINIATURE TEST RUNNER ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testId, description) {
  if (condition) {
    passed++;
    console.log("  PASS  " + testId + "  " + description);
  } else {
    failed++;
    failures.push(testId + ": " + description);
    console.log("  FAIL  " + testId + "  " + description);
  }
}

function assertApprox(actual, expected, tolerance, testId, description) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert(ok, testId,
    description + " (got " + actual.toFixed(4) + ", expected ~" + expected + " ±" + tolerance + ")"
  );
}

// ─── LOAD FILES ──────────────────────────────────────────────────────────────
function loadCSV(relPath) {
  const fp = path.join(BASE, relPath);
  if (!fs.existsSync(fp)) return null;
  const raw   = fs.readFileSync(fp, "utf8").trim();
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map(function (line) {
    const vals = line.split(",");
    const obj  = {};
    headers.forEach(function (h, i) { obj[h.trim()] = (vals[i] || "").trim(); });
    return obj;
  });
}

function loadJSON(relPath) {
  const fp = path.join(BASE, relPath);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

const SOURCES   = loadCSV("source_register.csv");
const EVIDENCE  = loadCSV("evidence_register.csv");
const ASSUMPTIONS = loadCSV("assumptions.csv");
const UNIVERSE  = loadCSV("market_universe.csv");
const ESTIMATES = loadCSV("market_estimates_long.csv");
const OBS_CSV   = loadCSV("generated/observations.csv");
const OBS_JSON  = loadJSON("generated/observations.json");
const GEN_LOG   = loadJSON("generated/generation_log.json");

console.log("\n=== REIT Target AI — Data Pipeline Validation (22 tests) ===\n");

// ─── T-01  Source register exists and has required columns ──────────────────
assert(
  SOURCES !== null && SOURCES.length > 0,
  "T-01", "source_register.csv exists and is non-empty"
);

// ─── T-02  All 13 sources present (SRC-001 to SRC-013) ─────────────────────
if (SOURCES) {
  const ids = SOURCES.map(function (r) { return r.source_id; });
  const allPresent = Array.from({ length: 13 }, function (_, i) {
    return "SRC-" + String(i + 1).padStart(3, "0");
  }).every(function (id) { return ids.includes(id); });
  assert(allPresent, "T-02", "All SRC-001 through SRC-013 present in source register");
}

// ─── T-03  Evidence register has 18 rows and required columns ───────────────
assert(
  EVIDENCE !== null && EVIDENCE.length === 18,
  "T-03", "evidence_register.csv has exactly 18 rows (got " + (EVIDENCE ? EVIDENCE.length : "null") + ")"
);

// ─── T-04  Assumptions register has 48 rows ─────────────────────────────────
assert(
  ASSUMPTIONS !== null && ASSUMPTIONS.length === 48,
  "T-04", "assumptions.csv has exactly 48 rows (got " + (ASSUMPTIONS ? ASSUMPTIONS.length : "null") + ")"
);

// ─── T-05  Market universe has exactly 50 markets ───────────────────────────
assert(
  UNIVERSE !== null && UNIVERSE.length === 50,
  "T-05", "market_universe.csv has exactly 50 markets (got " + (UNIVERSE ? UNIVERSE.length : "null") + ")"
);

// ─── T-06  Property type split: 30 CO / 10 Retail / 10 Residential ─────────
if (UNIVERSE) {
  const co  = UNIVERSE.filter(function (r) { return r.property_type === "Commercial Office"; }).length;
  const ret = UNIVERSE.filter(function (r) { return r.property_type === "Retail"; }).length;
  const res = UNIVERSE.filter(function (r) { return r.property_type === "Residential"; }).length;
  assert(
    co === 30 && ret === 10 && res === 10,
    "T-06",
    "Property type split 30/10/10 (CO=" + co + " Ret=" + ret + " Res=" + res + ")"
  );
}

// ─── T-07  All market IDs unique ─────────────────────────────────────────────
if (UNIVERSE) {
  const ids    = UNIVERSE.map(function (r) { return r.market_id; });
  const unique = new Set(ids).size === ids.length;
  assert(unique, "T-07", "All 50 market_ids are unique");
}

// ─── T-08  Confidence grades only A-E ────────────────────────────────────────
if (UNIVERSE) {
  const valid  = new Set(["A", "B", "C", "D", "E"]);
  const allOk  = UNIVERSE.every(function (r) { return valid.has(r.confidence_grade); });
  assert(allOk, "T-08", "All confidence_grade values are in {A,B,C,D,E}");
}

// ─── T-09  Estimates: 50 markets × 9 metrics = 450 rows ──────────────────────
assert(
  ESTIMATES !== null && ESTIMATES.length === 450,
  "T-09", "market_estimates_long.csv has 450 rows (50 × 9) — got " + (ESTIMATES ? ESTIMATES.length : "null")
);

// ─── T-10  lower ≤ central ≤ upper for all estimate rows ────────────────────
if (ESTIMATES) {
  const violations = ESTIMATES.filter(function (r) {
    const lo = parseFloat(r.lower_estimate);
    const ce = parseFloat(r.central_estimate);
    const up = parseFloat(r.upper_estimate);
    return isNaN(lo) || isNaN(ce) || isNaN(up) || lo > ce || ce > up;
  });
  assert(
    violations.length === 0,
    "T-10", "lower ≤ central ≤ upper for all 450 estimate rows (violations: " + violations.length + ")"
  );
}

// ─── T-11  Evidence classification values are in the allowed set ─────────────
if (ESTIMATES) {
  const allowed = new Set(["Reported", "Derived", "Estimated", "Synthetic", "Missing"]);
  const bad     = ESTIMATES.filter(function (r) {
    return !allowed.has(r.evidence_classification);
  });
  assert(
    bad.length === 0,
    "T-11", "All evidence_classification values in {Reported,Derived,Estimated,Synthetic,Missing} (bad: " + bad.length + ")"
  );
}

// ─── T-12  gross_yield_pct is always classified as Derived ───────────────────
if (ESTIMATES) {
  const yieldRows = ESTIMATES.filter(function (r) { return r.metric_name === "gross_yield_pct"; });
  const allDerived = yieldRows.every(function (r) { return r.evidence_classification === "Derived"; });
  assert(
    yieldRows.length === 50 && allDerived,
    "T-12", "gross_yield_pct rows: 50 present, all classified as Derived (rows=" + yieldRows.length + ")"
  );
}

// ─── T-13  Observations CSV has exactly 2000 rows ────────────────────────────
assert(
  OBS_CSV !== null && OBS_CSV.length === 2000,
  "T-13", "observations.csv has exactly 2000 rows (got " + (OBS_CSV ? OBS_CSV.length : "null") + ")"
);

// ─── T-14  Observations JSON has exactly 2000 entries ───────────────────────
assert(
  OBS_JSON !== null && Array.isArray(OBS_JSON) && OBS_JSON.length === 2000,
  "T-14", "observations.json has exactly 2000 entries"
);

// ─── T-15  Seed in generation_log matches SEED constant ──────────────────────
assert(
  GEN_LOG !== null && GEN_LOG.seed === 20260919,
  "T-15", "generation_log.json records seed = 20260919 (got " + (GEN_LOG ? GEN_LOG.seed : "null") + ")"
);

// ─── T-16  Reproducibility: first observation's monthly_rent_psf is stable ──
//  We re-run the PRNG from scratch for 1 draw of MKT-001 monthly_rent_psf
//  and compare to what was saved in the JSON.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function triangularSample(lo, ce, up, rng) {
  if (lo >= up) return ce;
  const u  = rng();
  const fc = (ce - lo) / (up - lo);
  return u < fc
    ? lo + Math.sqrt(u * (up - lo) * (ce - lo))
    : up - Math.sqrt((1 - u) * (up - lo) * (up - ce));
}

if (OBS_JSON && ESTIMATES) {
  // MKT-001 monthly_rent_psf is the FIRST metric drawn in the first iteration
  const rng2 = mulberry32(20260919);
  const mkt1Rent = ESTIMATES.find(function (r) {
    return r.market_id === "MKT-001" && r.metric_name === "monthly_rent_psf";
  });
  let expectedFirst = null;
  if (mkt1Rent) {
    const lo = parseFloat(mkt1Rent.lower_estimate);
    const ce = parseFloat(mkt1Rent.central_estimate);
    const up = parseFloat(mkt1Rent.upper_estimate);
    expectedFirst = parseFloat(triangularSample(lo, ce, up, rng2).toFixed(4));
  }
  const actualFirst = OBS_JSON[0] ? OBS_JSON[0].monthly_rent_psf : null;
  assert(
    expectedFirst !== null && actualFirst === expectedFirst,
    "T-16",
    "PRNG reproducibility: MKT-001 D001 monthly_rent_psf = " + expectedFirst +
    " (saved=" + actualFirst + ")"
  );
}

// ─── T-17  Derived gross yield consistent within ±0.05 percentage points ─────
if (OBS_JSON) {
  let maxError = 0;
  let errorCount = 0;
  OBS_JSON.forEach(function (o) {
    if (o.monthly_rent_psf !== null && o.sale_price_psf !== null &&
        o.sale_price_psf > 0 && o.gross_yield_pct_derived !== null) {
      const expected = parseFloat(((o.monthly_rent_psf * 12) / o.sale_price_psf * 100).toFixed(4));
      const diff = Math.abs(o.gross_yield_pct_derived - expected);
      if (diff > maxError) maxError = diff;
      if (diff > 0.005) errorCount++;  // > 0.005 pp tolerance for float rounding
    }
  });
  assert(
    errorCount === 0,
    "T-17", "Derived gross_yield_pct_derived matches formula for all observations (max error: " + maxError.toFixed(6) + ")"
  );
}

// ─── T-18  No negative values for rent, price, yield, growth, demand ─────────
if (OBS_JSON) {
  const nonNegFields = [
    "monthly_rent_psf", "sale_price_psf", "gross_yield_pct_derived",
    "demand_score", "risk_score", "transaction_volume_index"
  ];
  let negCount = 0;
  OBS_JSON.forEach(function (o) {
    nonNegFields.forEach(function (f) {
      if (o[f] !== null && o[f] < 0) negCount++;
    });
  });
  assert(negCount === 0, "T-18", "No negative values for rent/price/yield/demand/risk fields (violations: " + negCount + ")");
}

// ─── T-19  Occupancy + vacancy approximately ~100% (triangular draw of each) ─
//  Each is independently drawn from a triangular distribution anchored to
//  plausible ranges, so we only check they individually lie in [0,100].
if (OBS_JSON) {
  let outOfRange = 0;
  OBS_JSON.forEach(function (o) {
    if (o.occupancy_rate_pct !== null && (o.occupancy_rate_pct < 0 || o.occupancy_rate_pct > 100)) outOfRange++;
    if (o.vacancy_rate_pct  !== null && (o.vacancy_rate_pct  < 0 || o.vacancy_rate_pct  > 100)) outOfRange++;
  });
  assert(
    outOfRange === 0,
    "T-19", "occupancy_rate_pct and vacancy_rate_pct all in [0,100] range (violations: " + outOfRange + ")"
  );
}

// ─── T-20  Isolation: generator does not reference public/js/ ─────────────────
if (fs.existsSync(path.join(BASE, "scripts/generateSemiSyntheticData.js"))) {
  const genSrc = fs.readFileSync(
    path.join(BASE, "scripts/generateSemiSyntheticData.js"), "utf8"
  );
  const refsApp = genSrc.includes("public/js") || genSrc.includes("public\\js");
  assert(!refsApp, "T-20", "generateSemiSyntheticData.js does not reference application code (public/js)");
}

// ─── T-21  Isolation: generator does not reference firebase ──────────────────
if (fs.existsSync(path.join(BASE, "scripts/generateSemiSyntheticData.js"))) {
  const genSrc = fs.readFileSync(
    path.join(BASE, "scripts/generateSemiSyntheticData.js"), "utf8"
  );
  const refsFirebase = /firebase/i.test(genSrc);
  assert(!refsFirebase, "T-21", "generateSemiSyntheticData.js does not reference Firebase");
}

// ─── T-22  generation_log.json records correct property-type distribution ─────
if (GEN_LOG) {
  const byType = GEN_LOG.observations_by_property_type || {};
  assert(
    byType["Commercial Office"] === 1200 &&
    byType["Retail"] === 400 &&
    byType["Residential"] === 400,
    "T-22",
    "generation_log property-type counts: CO=1200, Retail=400, Residential=400"
  );
}

// ─── RESULTS ──────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log("Result: " + passed + " PASSED, " + failed + " FAILED  (of 22 total)");
if (failures.length) {
  console.log("\nFailed tests:");
  failures.forEach(function (f) { console.log("  ✗ " + f); });
}
console.log("─".repeat(60));

process.exit(failed > 0 ? 1 : 0);

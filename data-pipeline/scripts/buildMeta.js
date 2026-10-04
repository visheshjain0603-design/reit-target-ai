/**
 * buildMeta.js — write the canonical facts of this project to disk
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4.  ALL DATA IS SYNTHETIC.
 *
 * WHAT THIS SOLVES
 * ----------------
 * Prose documentation cannot import a JavaScript module, so until now every
 * document restated the project's headline figures by hand. Several of those
 * restatements were left behind when the dataset was rebuilt, and the
 * repository ended up asserting "18 market segments across 7 cities" in one
 * file and "50 markets across 8 cities" in another.
 *
 * This script derives every figure from the data files through the same
 * AppMeta.derive() the application uses, then writes:
 *
 *   public/data/meta.json      machine-readable, consumed by the app and tests
 *   docs/CANONICAL_FACTS.md    human-readable, the table every doc links to
 *
 * Documents now cite CANONICAL_FACTS.md instead of repeating numbers, and the
 * test suite asserts that no document contradicts meta.json. A figure can
 * therefore only be wrong in one place, and regenerating fixes it everywhere.
 *
 * Run:  node data-pipeline/scripts/buildMeta.js
 */

"use strict";

var fs   = require("fs");
var path = require("path");

var PROJECT = path.join(__dirname, "..", "..");
var DATA    = path.join(PROJECT, "public", "data");

var AppMeta = require(path.join(PROJECT, "public", "js", "appMeta.js"));
var ScenarioKey = require(path.join(PROJECT, "public", "js", "scenarioKey.js"));

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

var marketsDoc    = readJson(path.join(DATA, "markets.json"));
var portfolioDoc  = readJson(path.join(DATA, "portfolio.json"));
var statisticsDoc = readJson(path.join(DATA, "statistics.json"));

/* The methodology version is declared in two modules that must agree: AppMeta
 * states it for display, ScenarioKey hashes it into the cache identity. If they
 * drift, cached commentary could survive a methodology change. Fail the build
 * rather than writing a meta.json that disguises the disagreement. */
if (AppMeta.PROJECT.methodologyVersion !== ScenarioKey.METHODOLOGY_VERSION) {
  throw new Error(
    "Methodology version mismatch: appMeta.js says " +
    AppMeta.PROJECT.methodologyVersion + ", scenarioKey.js says " +
    ScenarioKey.METHODOLOGY_VERSION + ". Set both to the same value."
  );
}

/* ─── Source verification: the ONLY input to external calibration ──────── */

function parseCsv(text) {
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { q = false; }
      else { cell += ch; }
    } else if (ch === '"') { q = true; }
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") { i++; }
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") { rows.push(row); }
      row = [];
    } else { cell += ch; }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  var head = rows.shift();
  return rows.map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i] === undefined ? "" : r[i]; });
    return o;
  });
}

var register = parseCsv(fs.readFileSync(path.join(PROJECT, "data-pipeline", "source_register.csv"), "utf8"));
var outcomes = {};
var regRows = register.map(function (r) {
  var cls = AppMeta.sourceOutcome(r.verification_status);
  outcomes[r.source_id] = cls;
  return { id: r.source_id, publisher: r.publisher, title: r.title, outcome: r.verification_status,
           classification: cls };
});
var external = regRows.filter(function (r) { return r.classification !== "Internal"; });
var verifiedCount = external.filter(function (r) { return r.classification === "Verified"; }).length;
var partialCount  = external.filter(function (r) { return r.classification === "Partially supported"; }).length;
var segmentCalibration = {};
marketsDoc.markets.forEach(function (m) {
  var st = AppMeta.calibrationStatus(m.sourceIds, outcomes);
  segmentCalibration[st] = (segmentCalibration[st] || 0) + 1;
});
var sourceVerification = {
  derivedFrom: "data-pipeline/source_register.csv (verification_status)",
  externalSources: external.length,
  verified: verifiedCount,
  partiallySupported: partialCount,
  unverified: external.length - verifiedCount - partialCount,
  segmentCalibration: segmentCalibration,
  summary: verifiedCount + " of " + external.length + " cited external sources verified; " +
           partialCount + " partially supported. A segment is Verified only when every external " +
           "source it cites is verified.",
  outcomes: outcomes,
  rows: regRows
};

var counts = AppMeta.derive({
  marketsDoc:    marketsDoc,
  portfolioDoc:  portfolioDoc,
  statisticsDoc: statisticsDoc
});

/* Test-suite size is a fact about the repository, not about the dataset, so it
 * is counted here from the test file itself rather than typed into a document.
 * Previous revisions quoted a figure that had not been recounted in weeks. */
function countAssertions() {
  var p = path.join(PROJECT, "tests", "reit-tests.js");
  if (!fs.existsSync(p)) { return null; }
  var src = fs.readFileSync(p, "utf8");
  var ids = src.match(/\bT-\d{1,4}\b/g) || [];
  var unique = {};
  ids.forEach(function (i) { unique[i] = true; });
  return {
    file: "tests/reit-tests.js",
    testIdCount: Object.keys(unique).length,
    assertCallCount: (src.match(/\bassert\w*\s*\(/g) || []).length
  };
}

var meta = {
  note: "GENERATED FILE — do not edit by hand. Produced by " +
        "data-pipeline/scripts/buildMeta.js from the data files in public/data/. " +
        "Every figure here is computed, none is typed.",
  generatedBy: "data-pipeline/scripts/buildMeta.js",

  /* No build timestamp is recorded. A timestamp would change on every run and
   * make the committed file differ even when nothing about the project did,
   * which defeats the CI check that regeneration is reproducible. The dataset's
   * own dataAsOf date carries the time information that matters. */

  project: AppMeta.PROJECT,
  governance: AppMeta.GOVERNANCE,
  agents: AppMeta.AGENTS.map(function (a) {
    return { key: a.key, label: a.label, purpose: a.purpose };
  }),
  counts: counts,
  sourceVerification: sourceVerification,
  terminology: {
    terms: AppMeta.TERMS,
    supportGrades: AppMeta.SUPPORT_GRADES,
    externalCalibration: AppMeta.EXTERNAL_CALIBRATION,
    candidateCaveat: AppMeta.CANDIDATE_CAVEAT
  },
  tests: countAssertions()
};
var calibrationValues = Object.keys(segmentCalibration);
counts.externalCalibrationStatus = calibrationValues.length === 1 ? calibrationValues[0] : "Mixed";

fs.writeFileSync(path.join(DATA, "meta.json"), JSON.stringify(meta, null, 1) + "\n", "utf8");

// ─── docs/CANONICAL_FACTS.md ────────────────────────────────────────────────

function row(label, value) { return "| " + label + " | " + value + " |"; }

var c = counts;
var gradeList = Object.keys(c.confidenceGradeCounts).sort().map(function (g) {
  return g + ": " + c.confidenceGradeCounts[g];
}).join(", ");

var md = [
  "# Canonical Facts",
  "",
  "**REIT Target AI | " + AppMeta.attribution() + "**",
  "",
  "**GENERATED FILE.** Produced by `data-pipeline/scripts/buildMeta.js`, which derives",
  "every figure below from `public/data/`. Do not edit it by hand, and do not restate",
  "these figures elsewhere — link to this file instead. If a number here is wrong, the",
  "data is wrong; fix the data and regenerate.",
  "",
  "All data in this project is synthetic. Nothing below describes a real market.",
  "",
  "## Dataset",
  "",
  "| Fact | Value |",
  "|---|---|",
  row("Market segments", AppMeta.num(c.marketCount)),
  row("Observation-level records", AppMeta.num(c.observationCount)),
  row("Observations per segment", c.observationsPerMarketMin + " – " + c.observationsPerMarketMax),
  row("Cities", c.cityCount + " (" + c.cities.join(", ") + ")"),
  row("Property types", c.propertyTypeCount + " (" + c.propertyTypes.join(", ") + ")"),
  row("Locality classes", c.localityClasses.length + " (" + c.localityClasses.join(", ") + ")"),
  row("Confidence grades", gradeList),
  row("Segments below the " + AppMeta.GOVERNANCE.MIN_OBSERVATIONS + "-observation floor", c.marketsBelowObsFloor),
  row("Planted anomalies", c.plantedAnomalies + " (" + c.contaminationPct + "% contamination)"),
  row("Generator version", c.generatorVersion),
  row("Random seed", String(c.seed)),   // never grouped: a seed is an identifier, not a quantity
  row("Data as of", c.dataAsOf),
  "",
  "## Portfolio",
  "",
  "| Fact | Value |",
  "|---|---|",
  row("Holdings", c.assetCount),
  row("Total value", AppMeta.cr(c.portfolioValueRs)),
  row("Annual rent", AppMeta.cr(c.portfolioRentRs, 3)),
  row("Weighted gross yield", (c.portfolioWeightedYield * 100).toFixed(3) + "%"),
  "",
  "## Application",
  "",
  "| Fact | Value |",
  "|---|---|",
  row("Gemini agents", c.agentCount + " (" + AppMeta.AGENTS.map(function (a) { return a.label; }).join("; ") + ")"),
  row("Weight presets", c.presetCount),
  row("Scoring methodology version", c.methodologyVersion),
  row("Recommendation evidence floor",
      "at least " + AppMeta.GOVERNANCE.MIN_OBSERVATIONS + " observations and confidence grade " +
      AppMeta.GOVERNANCE.MIN_GRADE + " or better"),
  meta.tests ? row("Assertion calls in " + meta.tests.file, meta.tests.assertCallCount) : null,
  meta.tests ? row("Distinct test identifiers (T-nnn) in " + meta.tests.file, meta.tests.testIdCount) : null,
  "",
  "## Regenerating",
  "",
  "```bash",
  "node data-pipeline/scripts/generateObservations.js",
  "node data-pipeline/scripts/deriveMarkets.js",
  "node data-pipeline/scripts/computeStatistics.js",
  "node data-pipeline/scripts/buildMeta.js",
  "```",
  "",
  "The first three steps are seeded and reproduce byte-identical output; CI asserts this.",
  "This file carries no build timestamp for the same reason.",
  ""
].filter(function (l) { return l !== null; }).join("\n");   // null = omitted row; "" = a real blank line

fs.writeFileSync(path.join(PROJECT, "docs", "CANONICAL_FACTS.md"), md + "\n", "utf8");

console.log("Wrote public/data/meta.json and docs/CANONICAL_FACTS.md");
console.log("  " + c.marketCount + " markets, " + AppMeta.num(c.observationCount) +
            " observations, " + c.cityCount + " cities, " + c.assetCount + " holdings, " +
            AppMeta.cr(c.portfolioValueRs) + ", " + c.agentCount + " agents");

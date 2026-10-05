/**
 * reconcileProvenance.js — make each segment's narrative provenance agree
 * with its sourceIds and with what verification actually found.
 * NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo). ALL DATA IS SYNTHETIC.
 *
 * Why: the methodologyNote of every segment named publications (JLL/CBRE
 * office research, JLL/CBRE retail, Knight Frank/ANAROCK) that did not match
 * its sourceIds, and said in the present tense that estimates were
 * "parameterised on" or "calibrated to" them. No cited document has been
 * located and no figure traced (docs/SOURCE_VERIFICATION_REPORT.md), so those
 * sentences recorded the authors' intent, not a calibration.
 *
 * What it does: rewrites methodologyNote and classificationNote from the
 * segment's own fields, and keeps the original wording in
 * data-pipeline/provenance_notes.superseded-20261005.csv (written once, never
 * overwritten). No statistical field, grade, sourceType, dataClassification
 * or sourceIds value is changed. Idempotent.
 *
 * Run: node data-pipeline/scripts/reconcileProvenance.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var PROJECT = path.join(ROOT, "..");
var MKT = path.join(PROJECT, "public", "data", "markets.json");
var SUPERSEDED = path.join(ROOT, "provenance_notes.superseded-20261005.csv");
var REGISTER = path.join(ROOT, "source_register.csv");
var BENCH = path.join(ROOT, "benchmark_checks.csv");

function parseCSV(text) {
  var rows = [], row = [], f = "", q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') { q = false; } else { f += c; } }
    else if (c === '"') { q = true; }
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") { i++; } row.push(f); rows.push(row); row = []; f = ""; }
    else { f += c; }
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  var head = rows.shift();
  return rows.filter(function (r) { return r.length > 1; }).map(function (r) {
    var o = {}; head.forEach(function (h, k) { o[h] = r[k]; }); return o;
  });
}
function csvCell(s) { s = String(s == null ? "" : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

var doc = JSON.parse(fs.readFileSync(MKT, "utf8"));
var register = {};
parseCSV(fs.readFileSync(REGISTER, "utf8")).forEach(function (r) { register[r.source_id] = r; });
var bench = fs.existsSync(BENCH) ? parseCSV(fs.readFileSync(BENCH, "utf8")) : [];

if (!fs.existsSync(SUPERSEDED)) {
  var lines = ["marketId,methodologyNote,classificationNote"];
  doc.markets.forEach(function (m) { lines.push([m.marketId, m.methodologyNote, m.classificationNote].map(csvCell).join(",")); });
  fs.writeFileSync(SUPERSEDED, lines.join("\n") + "\n");
}

var CLASS_MEANING = {
  Derived:   "the authors intended to anchor this locality to a REIT disclosure",
  Estimated: "the authors intended to extrapolate this locality from a city-level benchmark",
  Synthetic: "the authors had no anchor in mind for this locality"
};

doc.markets.forEach(function (m) {
  var cited = (m.sourceIds || []).map(function (id) {
    var r = register[id];
    return r ? id + " (" + r.publisher + ", " + r.title + ")" : id;
  });
  var checks = bench.filter(function (b) { return b.segment_id === m.marketId; });
  m.methodologyNote =
    "Synthetic draws (generator 2.0.0, seed 20260919) around the authors' assumed lower, central and upper " +
    "values in data-pipeline/market_estimates_long.csv. Cited in the source register: " + cited.join("; ") +
    ". None of these documents has been located and no figure has been traced to them, so the assumptions " +
    "remain the authors' own. An earlier version of this note named other publications as the basis of the " +
    "estimates; that recorded the authors' intended benchmark, not a calibration (original wording kept in " +
    "data-pipeline/provenance_notes.superseded-20261005.csv)." +
    (checks.length ? " Benchmark comparison: " + checks.map(function (b) { return b.check_id + " " + b.relation; }).join(", ") +
                     " (data-pipeline/benchmark_checks.csv); a comparison does not verify the citation or the other parameters." : "");
  m.classificationNote =
    "dataClassification '" + m.dataClassification + "' records the authors' intended assumption basis: " +
    (CLASS_MEANING[m.dataClassification] || "not recorded") + ". No such anchor has been located, so it " +
    "describes intent, not evidence. It is separate from the Assumption Support Grade (" + m.confidenceGrade +
    ", the authors' A–E simulation convention) and from the legacy sourceType label (" + m.sourceType + ").";
});

fs.writeFileSync(MKT, JSON.stringify(doc, null, 2), "utf8");   // same format as deriveMarkets.js
console.log("provenance notes reconciled for " + doc.markets.length + " segments; superseded wording in " + path.relative(PROJECT, SUPERSEDED));

/**
 * screenSensitivity.js — how the shortlist depends on the simulation-support
 * screen's two chosen thresholds, and how precisely the simulation estimates
 * each segment's median.
 * NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo). ALL DATA IS SYNTHETIC.
 *
 * Part 1 re-runs the application's own shared analysis (analysisRun.js) for
 * every preset with the observation threshold at 25, 30 and 40 and the grade
 * cut-off at B or C. The application's default (30, C) is not changed.
 *
 * Part 2 measures the precision of each segment's median gross yield by a
 * seeded bootstrap of its simulated observations, and sets it beside the
 * P10–P90 spread of those observations. The two answer different questions:
 * the spread describes the assumed distribution; the bootstrap interval
 * describes how precisely a finite number of draws estimates its median.
 * Neither says anything about real-market accuracy.
 *
 * Writes data-pipeline/generated/screen_sensitivity.json and
 * docs/SCREEN_SENSITIVITY.md. Deterministic: same inputs, same output.
 *
 * Run: node data-pipeline/scripts/screenSensitivity.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT = path.join(__dirname, "..", "..");
var AppMeta = require(path.join(PROJECT, "public", "js", "appMeta.js"));
var AnalysisRun = require(path.join(PROJECT, "public", "js", "analysisRun.js"));

function load(rel) { return JSON.parse(fs.readFileSync(path.join(PROJECT, rel), "utf8")); }
var marketsDoc = load("public/data/markets.json");
var portfolioDoc = load("public/data/portfolio.json");
var statisticsDoc = load("public/data/statistics.json");
var observations = load("public/data/observations.json").observations;

/* Source outcomes exactly as buildMeta.js reads them, so the run matches the application. */
var meta = load("public/data/meta.json");
var outcomes = (meta.sourceVerification && meta.sourceVerification.outcomes) || {};

var runData = {
  marketsDoc: marketsDoc, sampleAssets: portfolioDoc.assets, portfolioMode: "sample",
  customAssets: [], statisticsDoc: statisticsDoc, sourceOutcomes: outcomes
};

var G = AppMeta.GOVERNANCE;
var DEFAULT = { obs: G.MIN_OBSERVATIONS, grade: G.MIN_GRADE };
var SETTINGS = [];
[25, 30, 40].forEach(function (obs) { ["C", "B"].forEach(function (grade) { SETTINGS.push({ obs: obs, grade: grade }); }); });

function withRules(obs, grade, fn) {
  var o = G.MIN_OBSERVATIONS, g = G.MIN_GRADE;
  G.MIN_OBSERVATIONS = obs; G.MIN_GRADE = grade;
  try { return fn(); } finally { G.MIN_OBSERVATIONS = o; G.MIN_GRADE = g; }
}

/* ── Part 1: the screen's thresholds ──────────────────────────────────── */
var part1 = [];
SETTINGS.forEach(function (s) {
  AnalysisRun.PRESET_KEYS.forEach(function (key) {
    var row = withRules(s.obs, s.grade, function () {
      var run = AnalysisRun.compute({ preset: key }, runData);
      var raw = AnalysisRun.rawLeader(run);
      var base = { minObservations: s.obs, minGrade: s.grade, isDefault: s.obs === DEFAULT.obs && s.grade === DEFAULT.grade,
                   preset: key, presetLabel: run.presetLabel, eligibleCount: run.eligibleCount,
                   highestRaw: AnalysisRun.name(raw), highestRawPasses: raw.governance.eligible };
      if (!run.eligibleCount) {
        return Object.assign(base, { candidate: null, note: "No segment passes this screen: no eligible candidate." });
      }
      var c = AnalysisRun.selected(run);
      return Object.assign(base, {
        candidate: AnalysisRun.name(c), marketId: c.marketId, rawRank: c.rank,
        score: +c.totalScore.toFixed(2), grossYieldPct: +(c.grossYield * 100).toFixed(2),
        observations: c.observationCount, grade: c.confidenceGrade,
        cityHHIAfter: +run.hhi.cityAfter.toFixed(4), typeHHIAfter: +run.hhi.typeAfter.toFixed(4),
        weightedYieldAfterPct: +(run.hhi.weightedYieldAfter * 100).toFixed(3)
      });
    });
    part1.push(row);
  });
});

var before = AnalysisRun.compute({ preset: "balanced" }, runData).hhi;

/* ── Part 2: precision of the median vs spread of the observations ─────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function q(sorted, p) {   // type-7 percentile, as deriveMarkets.js uses
  var i = p * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return q(s, 0.5); }

var BOOT_N = 2000, SEED = 20260919;
var byMarket = {};
observations.forEach(function (o) { (byMarket[o.market_id] = byMarket[o.market_id] || []).push(o.gross_yield_pct); });
var part2 = marketsDoc.markets.map(function (m, idx) {
  var ys = byMarket[m.marketId].slice().sort(function (a, b) { return a - b; });
  var rnd = mulberry32(SEED + idx);
  var meds = [];
  for (var b = 0; b < BOOT_N; b++) {
    var s = [];
    for (var k = 0; k < ys.length; k++) { s.push(ys[Math.floor(rnd() * ys.length)]); }
    meds.push(median(s));
  }
  meds.sort(function (a, b) { return a - b; });
  return {
    marketId: m.marketId, observations: ys.length, grade: m.confidenceGrade,
    spreadP10toP90Pp: +(q(ys, 0.9) - q(ys, 0.1)).toFixed(3),
    medianPct: +q(ys, 0.5).toFixed(3),
    bootstrap90Pp: +(q(meds, 0.95) - q(meds, 0.05)).toFixed(3)
  };
});
function band(n) { return n < 30 ? "26–29" : n < 40 ? "30–39" : n < 50 ? "40–49" : "50–76"; }
var bands = {};
part2.forEach(function (r) {
  var k = band(r.observations);
  (bands[k] = bands[k] || { band: k, segments: 0, spread: [], boot: [] });
  bands[k].segments++; bands[k].spread.push(r.spreadP10toP90Pp); bands[k].boot.push(r.bootstrap90Pp);
});
var bandRows = ["26–29", "30–39", "40–49", "50–76"].filter(function (k) { return bands[k]; }).map(function (k) {
  var b = bands[k];
  return { band: k, segments: b.segments, medianSpreadPp: +median(b.spread).toFixed(3), medianBootstrap90Pp: +median(b.boot).toFixed(3) };
});
/* Within-segment test: the same segments, first n draws only. Segments with
 * more draws were also given tighter assumed distributions (tier-1 cities,
 * established localities), so comparing ACROSS segments mixes the two effects;
 * subsampling WITHIN a segment isolates the effect of the number of draws. */
var drawsByMarket = {};
observations.forEach(function (o) { (drawsByMarket[o.market_id] = drawsByMarket[o.market_id] || []).push(o); });
var big = marketsDoc.markets.filter(function (m) { return m.observationCount >= 60; });
var SUBS = [25, 30, 40, 60];
var within = SUBS.map(function (n) {
  var spreads = [], boots = [];
  big.forEach(function (m, idx) {
    var ys = drawsByMarket[m.marketId].slice().sort(function (a, b) { return a.draw_number - b.draw_number; })
      .slice(0, n).map(function (o) { return o.gross_yield_pct; }).sort(function (a, b) { return a - b; });
    spreads.push(q(ys, 0.9) - q(ys, 0.1));
    var rnd = mulberry32(SEED + 1000 * n + idx), meds = [];
    for (var b = 0; b < BOOT_N; b++) {
      var smp = [];
      for (var k = 0; k < ys.length; k++) { smp.push(ys[Math.floor(rnd() * ys.length)]); }
      meds.push(median(smp));
    }
    meds.sort(function (a, b) { return a - b; });
    boots.push(q(meds, 0.95) - q(meds, 0.05));
  });
  var mean = function (a) { return a.reduce(function (t, x) { return t + x; }, 0) / a.length; };
  return { draws: n, segments: big.length, meanSpreadPp: +mean(spreads).toFixed(3), meanBootstrap90Pp: +mean(boots).toFixed(3) };
});

/* What kind of segment falls below 30 draws (construction, stated from the data). */
var thin = marketsDoc.markets.filter(function (m) { return m.observationCount < 30; });
var gradeCount = {};
thin.forEach(function (m) { gradeCount[m.confidenceGrade] = (gradeCount[m.confidenceGrade] || 0) + 1; });
var yieldOf = function (m) { return m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt * 100; };
var medYield = function (list) { return median(list.map(yieldOf)); };
var thinProfile = { segments: thin.length, grades: gradeCount,
  medianGrossYieldPct: +medYield(thin).toFixed(2),
  othersMedianGrossYieldPct: +medYield(marketsDoc.markets.filter(function (m) { return m.observationCount >= 30; })).toFixed(2) };

var out = {
  note: "Generated by data-pipeline/scripts/screenSensitivity.js. Synthetic data; describes the generator's construction, not a real market.",
  defaultScreen: DEFAULT,
  portfolioBefore: { cityHHI: +before.cityBefore.toFixed(4), typeHHI: +before.typeBefore.toFixed(4),
                     weightedYieldPct: +(before.weightedYieldBefore * 100).toFixed(3) },
  thresholds: part1,
  medianPrecision: { bootstrapResamples: BOOT_N, seed: SEED, statistic: "median gross yield (%)",
                     interval: "5th–95th percentile of bootstrap medians (90%)", byObservationBand: bandRows,
                     withinSegmentSubsamples: within, segments: part2 },
  thinSegments: thinProfile
};
fs.mkdirSync(path.join(PROJECT, "data-pipeline", "generated"), { recursive: true });
fs.writeFileSync(path.join(PROJECT, "data-pipeline", "generated", "screen_sensitivity.json"), JSON.stringify(out, null, 2) + "\n");

/* ── Markdown ─────────────────────────────────────────────────────────── */
var L = [];
L.push("# Screen Sensitivity — REIT Target AI", "");
L.push("**All data in this project is synthetic.** Generated by `data-pipeline/scripts/screenSensitivity.js` from the application's own shared analysis run; do not edit by hand.", "");
L.push("The simulation-support screen has two thresholds the group chose: at least **" + DEFAULT.obs + "** simulated observations and Assumption Support Grade **" + DEFAULT.grade + "** or better. They are a project convention, not a statistical or regulatory rule, and the default is unchanged. This page shows what the shortlist would be under nearby choices, so the effect of the convention is visible rather than assumed.", "");
L.push("## 1. Shortlist under alternative thresholds", "");
L.push("Sample portfolio before investing: city HHI " + out.portfolioBefore.cityHHI.toFixed(4) + ", asset-type HHI " + out.portfolioBefore.typeHHI.toFixed(4) + ", weighted gross yield " + out.portfolioBefore.weightedYieldPct.toFixed(3) + "%. Each run invests the default ₹50.00 Cr in the shortlist candidate.", "");
L.push("| Observations ≥ | Grade ≥ | Preset | Eligible | Shortlist candidate | Raw rank | Gross yield | Weighted yield after | City HHI after | Asset-type HHI after |");
L.push("|---|---|---|---|---|---|---|---|---|---|");
part1.forEach(function (r) {
  var tag = r.isDefault ? " (default)" : "";
  if (!r.candidate) {
    L.push("| " + r.minObservations + " | " + r.minGrade + tag + " | " + r.presetLabel + " | 0 | **No eligible candidate** | — | — | — | — | — |");
  } else {
    L.push("| " + r.minObservations + " | " + r.minGrade + tag + " | " + r.presetLabel + " | " + r.eligibleCount + " | " + r.candidate +
           " | " + r.rawRank + " | " + r.grossYieldPct.toFixed(2) + "% | " + r.weightedYieldAfterPct.toFixed(3) + "% | " +
           r.cityHHIAfter.toFixed(4) + " | " + r.typeHHIAfter.toFixed(4) + " |");
  }
});
L.push("");
var changed = {};
AnalysisRun.PRESET_KEYS.forEach(function (k) {
  var names = part1.filter(function (r) { return r.preset === k; }).map(function (r) { return r.candidate || "none"; });
  changed[k] = names.filter(function (n, i) { return names.indexOf(n) === i; });
});
L.push("**Reading the table.** " + AnalysisRun.PRESET_KEYS.map(function (k) {
  var lbl = part1.filter(function (r) { return r.preset === k; })[0].presetLabel;
  return lbl + ": " + (changed[k].length === 1 ? "the same candidate under every setting" : changed[k].length + " different candidates (" + changed[k].join("; ") + ")");
}).join(". ") + ".", "");
var noneCase = part1.filter(function (r) { return !r.candidate; }).length;
L.push(noneCase ? "Settings marked **No eligible candidate** leave nothing to shortlist; the application then reports that no segment passes rather than choosing one." :
  "No setting tested leaves the screen with no eligible segment; with very strict thresholds that could happen, and the application would then report that no segment passes rather than choosing one.", "");
L.push("**Why the outcome follows the construction.** The " + thinProfile.segments + " segments below 30 draws have grades " +
  Object.keys(gradeCount).sort().map(function (g) { return g + " (" + gradeCount[g] + ")"; }).join(", ") +
  " and a median gross yield of " + thinProfile.medianGrossYieldPct.toFixed(2) + "%, against " + thinProfile.othersMedianGrossYieldPct.toFixed(2) +
  "% for the rest. The generator gives fewer draws to growth and peripheral localities and third-tier cities (draws follow a liquidity proxy), the group's assumptions give those segments higher yields, and the group graded many of them D or E. A stricter screen therefore tends to remove high-yield, thinly simulated segments, and a looser one lets them back in. That is a property of how the synthetic data was built, not an empirical finding about any real market.", "");
L.push("## 2. Spread of the observations versus precision of the median", "");
L.push("For every segment, the **P10–P90 spread of simulated observations** (the middle 80% of its draws) was set beside a **bootstrap interval for its median gross yield** (" + BOOT_N + " seeded resamples; the 5th–95th percentile of the resampled medians). The bootstrap interval describes simulation estimation precision only — how much the median would move with a different finite set of draws from the same assumed distribution. It is not a confidence interval for any real market.", "");
L.push("| Simulated observations | Segments | Median P10–P90 spread (percentage points) | Median 90% bootstrap interval for the median (pp) |");
L.push("|---|---|---|---|");
bandRows.forEach(function (b) {
  L.push("| " + b.band + " | " + b.segments + " | " + b.medianSpreadPp.toFixed(3) + " | " + b.medianBootstrap90Pp.toFixed(3) + " |");
});
L.push("");
L.push("Across segments, those with more draws also show a narrower spread. That is the construction again: the generator gives more draws to tier-1, established segments, and the group assumed tighter distributions for them. To separate the two effects, the " + big.length + " segments with at least 60 draws were re-measured using only their first 25, 30, 40 and 60 draws:", "");
L.push("| Draws used | Segments | Mean P10–P90 spread (pp) | Mean 90% bootstrap interval for the median (pp) |");
L.push("|---|---|---|---|");
within.forEach(function (w) { L.push("| " + w.draws + " | " + w.segments + " | " + w.meanSpreadPp.toFixed(3) + " | " + w.meanBootstrap90Pp.toFixed(3) + " |"); });
L.push("");
L.push("Within the same segments, adding draws leaves the P10–P90 spread of the observations roughly where it was — it describes the assumed distribution — while the interval for the estimated median tightens. That is the only thing more draws buy. The 30-observation threshold was chosen as a convention before this was measured; these tables show the precision it corresponds to in this dataset, and nothing more.", "");
fs.writeFileSync(path.join(PROJECT, "docs", "SCREEN_SENSITIVITY.md"), L.join("\n") + "\n");
console.log("screen sensitivity: " + part1.length + " runs; median-precision bands: " + bandRows.map(function (b) { return b.band + " spread " + b.medianSpreadPp + " / boot " + b.medianBootstrap90Pp; }).join("; "));

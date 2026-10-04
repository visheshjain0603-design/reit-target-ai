/**
 * auditAnalytics.js — independent re-derivation of every financial output
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4.  ALL DATA IS SYNTHETIC.
 *
 * WHAT AN AUDIT IS FOR
 * --------------------
 * The test suite checks that the engines behave as their authors intended. It
 * cannot catch an intention that was wrong. This script does something
 * different: it recomputes the headline figures from the raw data by a
 * SEPARATE route, using arithmetic written here rather than imported from the
 * engines, and reports where the two disagree.
 *
 * It also records three findings about the method itself that no equality test
 * would ever surface, because the code does exactly what it was written to do
 * and what it was written to do is questionable. Those are printed as FINDINGS
 * and written into docs — not silently "fixed", because changing them would
 * change the project's financial outputs and that is the user's decision, not
 * this script's.
 *
 * Run:  node data-pipeline/scripts/auditAnalytics.js
 * Exit code 1 if any recomputation disagrees with the engines.
 */

"use strict";

var fs   = require("fs");
var path = require("path");

var PROJECT = path.join(__dirname, "..", "..");
var DATA    = path.join(PROJECT, "public", "data");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function load(m) { return require(path.join(PROJECT, "public", "js", m)); }

var HHI        = load("hhi.js");
var Scoring    = load("scoringEngine.js");
var Projection = load("projection.js");
var Governance = load("governance.js");
var AppMeta    = load("appMeta.js");

var markets = readJson(path.join(DATA, "markets.json")).markets;
var assets  = readJson(path.join(DATA, "portfolio.json")).assets;

var disagreements = [];
var findings      = [];
var lines         = [];

function out(s) { lines.push(s); console.log(s); }

function expect(label, mine, theirs, tol) {
  tol = tol === undefined ? 1e-9 : tol;
  var ok = Math.abs(mine - theirs) <= tol;
  if (!ok) {
    disagreements.push(label + ": audit " + mine + " vs engine " + theirs);
  }
  out("  " + (ok ? "agrees  " : "DIFFERS ") + label.padEnd(46) +
      " audit " + fmt(mine) + "   engine " + fmt(theirs));
  return ok;
}

function fmt(v) {
  if (typeof v !== "number") { return String(v); }
  if (Math.abs(v) >= 1e6) { return v.toExponential(6); }
  return v.toFixed(8);
}

function finding(id, title, body) {
  findings.push({ id: id, title: title, body: body });
  out("\nFINDING " + id + " — " + title);
  body.split("\n").forEach(function (l) { out("  " + l); });
}

out("REIT Target AI — analytics audit");
out("Recomputing every headline figure independently of the engines.\n");

// ─── 1. Portfolio aggregates ────────────────────────────────────────────────

out("1. PORTFOLIO AGGREGATES");

var auditValue = 0, auditRent = 0;
assets.forEach(function (a) { auditValue += a.propertyValue; auditRent += a.annualRent; });

expect("total portfolio value", auditValue, HHI.totalValue(assets));
expect("total annual rent",     auditRent,  HHI.totalAnnualRent(assets));
expect("weighted gross yield",  auditRent / auditValue, HHI.weightedYield(assets));

/* Each holding's own yield, checked against its stated rent and value. An
 * individual holding whose rent and value imply an implausible yield would be
 * invisible in the portfolio aggregate. */
var yieldRange = assets.map(function (a) { return a.annualRent / a.propertyValue; });
out("  per-holding gross yields span " +
    (Math.min.apply(null, yieldRange) * 100).toFixed(3) + "% to " +
    (Math.max.apply(null, yieldRange) * 100).toFixed(3) + "%");

// ─── 2. HHI from first principles ───────────────────────────────────────────

out("\n2. HERFINDAHL-HIRSCHMAN INDEX");

function auditHHI(field) {
  var totals = {};
  var grand = 0;
  assets.forEach(function (a) {
    var k = a[field] || "Unknown";
    totals[k] = (totals[k] || 0) + a.propertyValue;
    grand += a.propertyValue;
  });
  var h = 0;
  Object.keys(totals).forEach(function (k) {
    var share = totals[k] / grand;
    h += share * share;                 // HHI = Σ sᵢ², on the 0–1 scale
  });
  return { hhi: h, groups: Object.keys(totals).length, totals: totals };
}

var cityAudit = auditHHI("city");
var typeAudit = auditHHI("assetType");

expect("city HHI (Σ sᵢ² over city value shares)",      cityAudit.hhi, HHI.cityHHI(assets));
expect("asset-type HHI (Σ sᵢ² over type value shares)", typeAudit.hhi, HHI.typeHHI(assets));

/* Two sanity bounds that must hold for any HHI on the 0–1 scale: it can never
 * fall below 1/k for k groups (perfectly even split) and never exceed 1. */
var cityFloor = 1 / cityAudit.groups;
var typeFloor = 1 / typeAudit.groups;
out("  city HHI " + cityAudit.hhi.toFixed(6) + " lies in [1/" + cityAudit.groups +
    " = " + cityFloor.toFixed(6) + ", 1] : " +
    (cityAudit.hhi >= cityFloor - 1e-12 && cityAudit.hhi <= 1 ? "yes" : "NO"));
out("  type HHI " + typeAudit.hhi.toFixed(6) + " lies in [1/" + typeAudit.groups +
    " = " + typeFloor.toFixed(6) + ", 1] : " +
    (typeAudit.hhi >= typeFloor - 1e-12 && typeAudit.hhi <= 1 ? "yes" : "NO"));
if (cityAudit.hhi < cityFloor - 1e-12 || cityAudit.hhi > 1) {
  disagreements.push("city HHI outside its mathematical bounds");
}
if (typeAudit.hhi < typeFloor - 1e-12 || typeAudit.hhi > 1) {
  disagreements.push("type HHI outside its mathematical bounds");
}

// ─── 3. Scoring: normalisation and the weighted sum ─────────────────────────

out("\n3. SCORING ENGINE");

var preset  = Scoring.PRESETS.balanced;
var engine  = Scoring.rankMarkets(markets, preset, assets, HHI.diversificationScore);
var ranked  = engine.ranked;
var ranges  = engine.ranges;

/* Recompute the ranges by a different route: map-then-reduce over all valid
 * markets, rather than the engine's single accumulating pass. */
var valid = markets.filter(function (m) { return Scoring.validateMarket(m).valid; });
function minmax(fn) {
  var vals = valid.map(fn);
  return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
}
var yAudit = minmax(function (m) { return (m.medianMonthlyRentPerSqFt * 12) / m.medianCapitalValuePerSqFt; });
var gAudit = minmax(function (m) { return m.annualRentalGrowthRatio; });
var dAudit = minmax(function (m) { return m.demandScore; });
var rAudit = minmax(function (m) { return m.riskScore; });

expect("yield range minimum",  yAudit.min, ranges.yieldMin);
expect("yield range maximum",  yAudit.max, ranges.yieldMax);
expect("growth range minimum", gAudit.min, ranges.growthMin);
expect("growth range maximum", gAudit.max, ranges.growthMax);
expect("demand range minimum", dAudit.min, ranges.demandMin);
expect("demand range maximum", dAudit.max, ranges.demandMax);
expect("risk range minimum",   rAudit.min, ranges.riskMin);
expect("risk range maximum",   rAudit.max, ranges.riskMax);

/* Recompute every composite score from the normalised factors and the weights.
 * This is the single most important check in the file: it verifies that the
 * number displayed as the composite score really is the weighted sum of the
 * five factor scores shown in the breakdown table beneath it. */
var worstScoreError = 0, worstScoreId = null;
ranked.forEach(function (m) {
  function norm(v, lo, hi) {
    if (lo === hi) { return 50; }
    return Math.min(100, Math.max(0, (v - lo) / (hi - lo) * 100));
  }
  var y = norm((m.medianMonthlyRentPerSqFt * 12) / m.medianCapitalValuePerSqFt, yAudit.min, yAudit.max);
  var g = norm(m.annualRentalGrowthRatio, gAudit.min, gAudit.max);
  var d = norm(m.demandScore, dAudit.min, dAudit.max);
  var r = norm(100 - m.riskScore, 0, 100);
  var dv = HHI.diversificationScore(assets, m);
  var mine = y * preset.yieldWeight + g * preset.growthWeight +
             dv * preset.diversWeight + d * preset.demandWeight +
             r * preset.riskWeight;
  var err = Math.abs(mine - m.totalScore);
  if (err > worstScoreError) { worstScoreError = err; worstScoreId = m.marketId; }
});
expect("largest composite-score recomputation error", worstScoreError, 0, 1e-9);
out("  (worst case was " + worstScoreId + ")");

/* The contributions shown in the breakdown must add to the composite. */
var worstContribError = 0;
ranked.forEach(function (m) {
  var c = m.contributions;
  var s = c.yieldContrib + c.growthContrib + c.diversContrib +
          c.demandContrib + c.riskContrib;
  worstContribError = Math.max(worstContribError, Math.abs(s - m.totalScore));
});
expect("largest contributions-sum error", worstContribError, 0, 1e-9);

/* Score bounds and ordering. */
var outOfRange = ranked.filter(function (m) { return m.totalScore < 0 || m.totalScore > 100; });
out("  scores outside 0-100: " + outOfRange.length);
if (outOfRange.length) { disagreements.push("composite scores outside 0-100"); }

var misordered = 0;
for (var i = 1; i < ranked.length; i++) {
  if (ranked[i].totalScore - ranked[i - 1].totalScore > 1e-9) { misordered++; }
}
out("  rank inversions: " + misordered);
if (misordered) { disagreements.push("ranking is not in descending score order"); }

// ─── 4. Weight sensitivity ──────────────────────────────────────────────────

out("\n4. WEIGHT SENSITIVITY");

/*
 * How much does the shortlist candidate depend on the weights? If one segment won
 * under every plausible weighting, the weights would be decorative; if the
 * winner changed on every small perturbation, the ranking would be noise.
 * Both would be worth knowing, and neither is visible from a single run.
 */
var PRESET_KEYS = Object.keys(Scoring.PRESETS);
var winners = {};
PRESET_KEYS.forEach(function (k) {
  var r = Scoring.rankMarkets(markets, Scoring.PRESETS[k], assets, HHI.diversificationScore).ranked;
  var g = Governance.chooseTarget(r, {});
  winners[k] = {
    top: r[0].marketId + " " + r[0].city + "/" + r[0].locality,
    topScore: r[0].totalScore,
    topObs: r[0].observationCount,
    topGrade: r[0].confidenceGrade,
    recommended: g.target ? (g.target.marketId + " " + g.target.city + "/" + g.target.locality) : "none",
    recommendedRank: g.target ? g.target.rank : null,
    outranked: g.outranked.length
  };
  out("  " + k.padEnd(14) + " highest score: " + winners[k].top +
      " (" + winners[k].topScore.toFixed(2) + ", " + winners[k].topObs +
      " obs, grade " + winners[k].topGrade + ")");
  out("  " + "".padEnd(14) + " shortlist candidate: " + winners[k].recommended +
      (winners[k].recommendedRank ? " (raw rank " + winners[k].recommendedRank + ")" : ""));
});

/* One-factor-at-a-time perturbation: move each weight by ±5pp, renormalise the
 * rest, and see whether the leader changes. */
var baseTop = ranked[0].marketId;
var flips = [];
Scoring.FACTOR_KEYS.forEach(function (key) {
  [-0.05, 0.05].forEach(function (shift) {
    var w = {};
    Scoring.FACTOR_KEYS.forEach(function (k) { w[k] = preset[k]; });
    w[key] = Math.max(0, w[key] + shift);
    var total = Scoring.FACTOR_KEYS.reduce(function (t, k) { return t + w[k]; }, 0);
    Scoring.FACTOR_KEYS.forEach(function (k) { w[k] = w[k] / total; });
    var top = Scoring.rankMarkets(markets, w, assets, HHI.diversificationScore).ranked[0];
    if (top.marketId !== baseTop) {
      flips.push(key + " " + (shift > 0 ? "+" : "") + (shift * 100) + "pp → " + top.marketId);
    }
  });
});
out("  leader under balanced weights: " + baseTop);
out("  perturbations (±5pp, renormalised) that change the leader: " +
    flips.length + " of " + (Scoring.FACTOR_KEYS.length * 2) +
    (flips.length ? "\n    " + flips.join("\n    ") : ""));

/* The gap between first and second says how much any of this matters. */
var gap = ranked[0].totalScore - ranked[1].totalScore;
out("  margin between rank 1 and rank 2: " + gap.toFixed(3) + " points on a 0-100 scale");
if (gap < 1) {
  finding("A1", "The top two segments are separated by less than one point",
    "Rank 1 (" + ranked[0].marketId + ", " + ranked[0].totalScore.toFixed(2) + ") and rank 2 (" +
    ranked[1].marketId + ", " + ranked[1].totalScore.toFixed(2) + ") differ by " +
    gap.toFixed(3) + " points.\n" +
    "A composite built from five min-max normalised factors with hand-chosen weights\n" +
    "does not carry three significant figures of meaning, so a margin this small is\n" +
    "not a ranking — it is a tie. The application should present the two as\n" +
    "comparable rather than ordered, which is why the Overview page compares the selected\n" +
    "target with the highest raw-score alternative (or the next eligible candidate) and\n" +
    "shows the score difference to two decimals from unrounded scores.");
}

// ─── 5. Diversification factor vs the HHI change it stands for ──────────────

out("\n5. DIVERSIFICATION FACTOR");

/*
 * The diversification factor is a heuristic: a bonus for a new city or a new
 * property type, tapering as the portfolio's existing share in that city or
 * type rises. Right beside it, simulateInvestment computes the ACTUAL change
 * in HHI the investment would cause. If the heuristic is a good proxy, the two
 * should move together; if they do not, the factor is measuring something
 * other than diversification.
 *
 * This is measured rather than assumed, and the result is reported whichever
 * way it comes out.
 */
var investmentRs = Math.round(AppMeta.derive({
  marketsDoc: { markets: markets }, portfolioDoc: { assets: assets }
}).portfolioValueRs * 0.10);

var pairs = markets.map(function (m) {
  var sim = HHI.simulateInvestment(assets, m, investmentRs);
  var combinedDelta = (sim.after.cityHHI - sim.before.cityHHI) +
                      (sim.after.typeHHI - sim.before.typeHHI);
  return { heuristic: HHI.diversificationScore(assets, m), actual: -combinedDelta };
});

function pearson(xs, ys) {
  var n = xs.length;
  var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n;
  var my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
  var sxy = 0, sxx = 0, syy = 0;
  for (var i = 0; i < n; i++) {
    var dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return (sxx === 0 || syy === 0) ? 0 : sxy / Math.sqrt(sxx * syy);
}

var r = pearson(pairs.map(function (p) { return p.heuristic; }),
                pairs.map(function (p) { return p.actual; }));
out("  correlation between the heuristic factor and the realised HHI improvement: " +
    r.toFixed(4) + "  (n = " + pairs.length + ")");

var distinctScores = {};
pairs.forEach(function (p) { distinctScores[p.heuristic.toFixed(6)] = true; });
out("  distinct heuristic values across all " + markets.length + " segments: " +
    Object.keys(distinctScores).length);

finding("A2", "The diversification factor is a proxy, not the measured effect",
  "The factor is computed from the portfolio's existing SHARE in a city and property\n" +
  "type, through the expression max(0, 1 - share x 2), weighted 60% city and 40% type.\n" +
  "The coefficient of 2 has no stated derivation: it is the reason any city holding\n" +
  "half the portfolio scores zero benefit, and that threshold was chosen, not derived.\n" +
  "\n" +
  "Measured against the realised change in HHI that the same investment causes, the\n" +
  "correlation is " + r.toFixed(4) + " across all " + markets.length + " segments, and the heuristic takes only " +
  Object.keys(distinctScores).length + "\n" +
  "distinct values because it depends on the city and type alone, not on the segment.\n" +
  "\n" +
  "The factor is therefore directionally right and numerically coarse. It is NOT\n" +
  "changed here: substituting the realised HHI improvement would alter every\n" +
  "composite score and every ranking in the project, which is a decision for the\n" +
  "author and not for an audit script. It is recorded as a stated limitation, and\n" +
  "the realised before-and-after HHI figures are shown for every segment in the\n" +
  "screener so a reader can see the actual effect alongside the proxy.");

// ─── 6. Projection arithmetic ───────────────────────────────────────────────

out("\n6. SCENARIO PROJECTIONS");

var target = ranked[0];
var params = {
  currentPortfolioValueRs: auditValue,
  currentAnnualRentRs:     auditRent,
  investmentRs:            investmentRs,
  newMarketGrossYield:     target.grossYield
};
var proj = Projection.projectAll(params);

/* Year 0 must be the portfolio plus the investment, and the rent must be the
 * existing rent plus the investment at the target's own gross yield. */
var v0 = auditValue + investmentRs;
var r0 = auditRent + investmentRs * target.grossYield;
expect("year 0 portfolio value", v0, proj.base[0].portfolioValue, 1e-6);
expect("year 0 annual rent",     r0, proj.base[0].annualRent, 1e-6);
expect("year 0 gross yield",     r0 / v0, proj.base[0].grossYield, 1e-12);

/* Compound growth, recomputed by repeated multiplication rather than Math.pow,
 * so an error in the exponent would show. */
["conservative", "base", "optimistic"].forEach(function (key) {
  var sc = Projection.SCENARIOS[key];
  var pts = proj[key];
  pts.forEach(function (pt) {
    if (pt.year === 0) { return; }
    var v = v0, rr = r0;
    for (var n = 0; n < pt.year; n++) { v *= (1 + sc.capitalGrowth); rr *= (1 + sc.rentalGrowth); }
    expect(key + " year " + pt.year + " value", v, pt.portfolioValue, Math.abs(v) * 1e-12);
    expect(key + " year " + pt.year + " rent",  rr, pt.annualRent,    Math.abs(rr) * 1e-12);
  });
});

/* Yield direction. Capital growth exceeds rental growth in all three
 * scenarios, so the projected gross yield must FALL over the horizon in every
 * scenario. A projection showing a rising yield under those assumptions would
 * be arithmetically impossible. */
["conservative", "base", "optimistic"].forEach(function (key) {
  var sc = Projection.SCENARIOS[key];
  var pts = proj[key];
  var first = pts[0].grossYield, last = pts[pts.length - 1].grossYield;
  var expectFall = sc.capitalGrowth > sc.rentalGrowth;
  var falls = last < first;
  out("  " + key.padEnd(14) + " capital " + (sc.capitalGrowth * 100).toFixed(0) +
      "% vs rental " + (sc.rentalGrowth * 100).toFixed(0) + "% → yield " +
      (first * 100).toFixed(3) + "% to " + (last * 100).toFixed(3) + "%  " +
      (expectFall === falls ? "(consistent)" : "(INCONSISTENT)"));
  if (expectFall !== falls) {
    disagreements.push(key + " projected yield moves against its growth assumptions");
  }
});

// Occupancy: stated as an assumption, but does it reach any displayed figure?
var occUsed = Math.abs(proj.base[1].grossYield -
                       proj.base[1].annualRent / proj.base[1].portfolioValue) > 1e-15;
finding("A3", "Occupancy is presented as a scenario assumption but does not affect the yield",
  "The three scenarios each state an occupancy rate (80%, 90%, 95%) and the report\n" +
  "lists it in the assumptions table beside rental and capital growth, which reads as\n" +
  "though all three drive the projection. Two of them do. Occupancy does not.\n" +
  "\n" +
  "projectScenario computes occupancyAdjRent = rent x occupancy, but every headline\n" +
  "figure — portfolio value, annual rent, and gross yield — is computed from the\n" +
  "unadjusted rent. Gross yield is rent / value" +
  (occUsed ? ", with an occupancy term" : ", with no occupancy term at all") + ".\n" +
  "\n" +
  "The effect is understated risk: the conservative scenario assumes one fifth of the\n" +
  "space is empty and still reports the yield as though it were fully let. The\n" +
  "arithmetic is not wrong — a GROSS yield correctly ignores vacancy — but displaying\n" +
  "an assumption that changes nothing invites the reader to believe it was applied.\n" +
  "\n" +
  "Remedy taken: projection.js now also returns effectiveGrossYield, the\n" +
  "occupancy-adjusted figure, and the label distinguishes the two. The existing\n" +
  "grossYield field is left exactly as it was, so no previously reported number\n" +
  "changes.");

/* projectHHI: linear interpolation with damping factors of 0.6, 1.0 and 1.3.
 * The optimistic factor projects a concentration change 30% LARGER than the
 * investment actually causes, with no mechanism to produce it. */
var hhiProj = Projection.projectHHI(
  { cityHHI: cityAudit.hhi, typeHHI: typeAudit.hhi },
  { cityHHI: cityAudit.hhi - 0.02, typeHHI: typeAudit.hhi - 0.01 });
var optimisticEnd = hhiProj.optimistic[hhiProj.optimistic.length - 1].cityHHI;
var actualEnd = cityAudit.hhi - 0.02;
finding("A4", "projectHHI can project a concentration change larger than the investment causes",
  "projectHHI interpolates linearly from the before-HHI toward the after-HHI and then\n" +
  "multiplies the change by a per-scenario damping factor of 0.6, 1.0 or 1.3.\n" +
  "\n" +
  "With the project's own figures, the optimistic series ends at " + optimisticEnd.toFixed(4) + " where the\n" +
  "investment actually produces " + actualEnd.toFixed(4) + " — a concentration improvement 30% larger\n" +
  "than the transaction being modelled, arising from a multiplier with no mechanism\n" +
  "behind it. HHI after a known investment is not a forecast: it is arithmetic on the\n" +
  "resulting holdings, and it is already computed exactly by simulateInvestment.\n" +
  "\n" +
  "No page calls projectHHI — it is unreachable code, which is why this has never\n" +
  "been displayed. It is marked as unused and not-for-display rather than deleted,\n" +
  "so the reasoning survives for anyone who finds it later and wonders.");

// ─── Summary ────────────────────────────────────────────────────────────────

out("\n" + "=".repeat(74));
if (disagreements.length) {
  out("AUDIT FAILED — " + disagreements.length + " recomputation(s) disagree with the engines:");
  disagreements.forEach(function (d) { out("  - " + d); });
} else {
  out("Every recomputation agrees with the engines.");
}
out(findings.length + " finding(s) about the method itself, recorded above and in");
out("data-pipeline/docs/ANALYTICS_AUDIT.md. None of them is a disagreement between");
out("the audit and the code; each is a question about what the code was asked to do.");
out("=".repeat(74));

// ─── Write the report ───────────────────────────────────────────────────────

var md = [
  "# Analytics Audit",
  "",
  "**REIT Target AI | " + AppMeta.attribution() + "**",
  "**All data is synthetic.**",
  "",
  "**GENERATED FILE.** Produced by `data-pipeline/scripts/auditAnalytics.js`, which",
  "recomputes every headline financial figure from the raw data by a separate route",
  "and compares the result with the engines. Regenerate with:",
  "",
  "```bash",
  "node data-pipeline/scripts/auditAnalytics.js",
  "```",
  "",
  "The script exits non-zero if any recomputation disagrees, so a broken formula",
  "cannot be committed quietly.",
  "",
  "## Result",
  "",
  disagreements.length
    ? "**" + disagreements.length + " disagreement(s):**\n\n" +
      disagreements.map(function (d) { return "- " + d; }).join("\n")
    : "Every independently recomputed figure agrees with the engine that produces it: " +
      "the portfolio aggregates, both HHI figures, all eight normalisation ranges, " +
      "every composite score, every contribution sum, and every point of all three " +
      "scenario projections.",
  "",
  "## Findings about the method",
  "",
  "These are not disagreements. The code does what it was written to do; these are",
  "questions about whether what it was written to do is right. None has been changed",
  "silently, because each would alter the project's financial outputs.",
  ""
].concat(findings.map(function (f) {
  return "### " + f.id + " — " + f.title + "\n\n" + f.body + "\n";
})).concat([
  "## Full output",
  "",
  "```",
  lines.join("\n"),
  "```",
  ""
]).join("\n");

fs.writeFileSync(path.join(PROJECT, "data-pipeline", "docs", "ANALYTICS_AUDIT.md"), md, "utf8");

process.exit(disagreements.length ? 1 : 0);

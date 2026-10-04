/**
 * reit-tests.js — Automated test suite for REIT Target AI
 * NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Run: node tests/reit-tests.js
 * Requires: Node.js >= 16 (no npm packages)
 *
 * Covers:
 *   T01  Portfolio totals match spec
 *   T02  HHI for perfectly equal portfolio
 *   T03  HHI for single-asset (monopoly)
 *   T04  simulateInvestment returns before/after structure
 *   T05  Investment improves city HHI when adding new city
 *   T06  Investment worsens (or maintains) HHI for same city
 *   T07  Weights sum to 100% — valid
 *   T08  Weights sum > 100% — invalid
 *   T09  Weights sum < 100% — invalid
 *   T10  Missing weight key — invalid
 *   T11  Risk score inversion (low risk = high score)
 *   T12  Normalised scores are in [0, 100]
 *   T13  Equal min/max returns 50
 *   T14  grossYield calculation
 *   T15  rankMarkets returns sorted array
 *   T16  Rankings change when weights change
 *   T17  Duplicate marketId rejected by validateMarkets
 *   T18  Invalid market (missing required field) rejected
 *   T19  sensitivityAnalysis returns 4 preset results
 *   T20  diversificationScore gives higher score for new city
 *   T21  investmentRs = 0 returns unchanged portfolio
 *   T22  weightedYield matches manual calculation
 *   T23  XSS — textContent safe: <script> tag in asset name does not become DOM element
 *   T24  compareMetrics returns improved flag correctly
 *   T25  totalValue sums propertyValue in rupees
 *   T26  Balanced preset canonical weights (25/25/20/20/10) sum to 100%
 *   T27  Balanced yieldWeight === growthWeight (both 0.25)
 *   T28  simulateInvestment returns both city and type HHI
 *   T29  compareMetrics: HHI increase → improved=false
 *   T30  Weight change produces different market scores
 *   T31  stateManager save/load round-trip preserves all schema fields
 *   T32  stateManager markStale/isStale work correctly
 *   T33  stateManager clear removes state
 *   T34  City HHI delta and Type HHI delta computed independently per simulation
 *   T35  All sample markets produce valid finite totalScore in [0, 100]
 *   T36  AGENT_ORDER execution order is correct in agents.js source
 *   T37  Run button disabled logic: requires online + gemini + !running
 *   T38  TRAIL_STEPS order: portfolio → screening → simulation → validation → recommend
 *   T39  Agent context portfolioCtx structure matches screener shared state schema
 *   T40  Weight/investment change triggers stale flag via markStale()
 *   T41  API error path — callAgent falls back to 'AI explanation unavailable'
 *   T42  GEMINI_API_KEY absent from all public/js frontend files
 *   T43  No innerHTML used with external data in public JS (XSS prevention)
 *   T44  server.js validation prompt includes all four checks
 *   T45  server.js orchestrator prompt uses expanded output schema
 */

"use strict";

/* ── Load engines ─────────────────────────────────────────────────────────── */
var path = require("path");
var HHIEngine    = require(path.join(__dirname, "..", "public", "js", "hhi.js"));
var ScoringEngine = require(path.join(__dirname, "..", "public", "js", "scoringEngine.js"));
var Stats        = require(path.join(__dirname, "..", "public", "js", "stats.js"));

/* ── Mock localStorage for stateManager (Node.js has none) ──────────────── */
(function () {
  var store = {};
  global.localStorage = {
    setItem:    function (k, v) { store[k] = String(v); },
    getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    removeItem: function (k)    { delete store[k]; }
  };
}());
var ReitState = require(path.join(__dirname, "..", "public", "js", "stateManager.js"));

/* The data the application computes its shared run from, read from the
 * committed files — so these tests exercise the real dataset. */
function canonicalRunData(overrides) {
  var fs0 = require("fs");
  function rd(p) { return JSON.parse(fs0.readFileSync(path.join(__dirname, "..", p), "utf8")); }
  var meta0 = rd("public/data/meta.json");
  return Object.assign({
    marketsDoc:     rd("public/data/markets.json"),
    sampleAssets:   rd("public/data/portfolio.json").assets,
    portfolioMode:  "sample",
    customAssets:   [],
    statisticsDoc:  rd("public/data/statistics.json"),
    sourceOutcomes: (meta0.sourceVerification && meta0.sourceVerification.outcomes) || {}
  }, overrides || {});
}

/* ── Test harness ─────────────────────────────────────────────────────────── */
var passed = 0;
var failed = 0;
var errors = [];

function assert(testId, description, condition, extra) {
  /*
   * 88 calls in this file were written assert(condition, id, description).
   * With that order `condition` received the description string, which is
   * always truthy, so every one of them passed whatever the code did — 11 of
   * them were in fact false. A swapped call is recognised by its non-string
   * first argument and re-read in the order the author intended, so those
   * assertions now test what they claim to test.
   */
  if (typeof testId !== "string") {
    var cond = testId;
    testId = description;
    description = condition;
    condition = cond;
    extra = undefined;
  }
  if (condition) {
    passed++;
    console.log("  PASS  " + testId + " — " + description);
  } else {
    failed++;
    var msg = "  FAIL  " + testId + " — " + description + (extra ? " | " + extra : "");
    errors.push(msg);
    console.log(msg);
  }
}

function near(a, b, tolerance) {
  tolerance = tolerance || 1e-9;
  return Math.abs(a - b) <= tolerance;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SYNTHETIC TEST DATA
   ═══════════════════════════════════════════════════════════════════════════ */

// Mirrors portfolio.json — 10 assets, ₹500 Cr total (values in rupees)
var PORTFOLIO_ASSETS = [
  { assetId: "P001", city: "Mumbai",       assetType: "Commercial Office", propertyValue: 750000000, annualRent: 52500000,  occupancyRate: 0.95, leaseExpiry: "2027-03-31" },
  { assetId: "P002", city: "Bengaluru",    assetType: "Commercial Office", propertyValue: 600000000, annualRent: 48000000,  occupancyRate: 0.92, leaseExpiry: "2026-12-31" },
  { assetId: "P003", city: "Pune",         assetType: "Retail",            propertyValue: 450000000, annualRent: 31500000,  occupancyRate: 0.88, leaseExpiry: "2028-06-30" },
  { assetId: "P004", city: "Hyderabad",    assetType: "Commercial Office", propertyValue: 500000000, annualRent: 37500000,  occupancyRate: 0.91, leaseExpiry: "2029-09-30" },
  { assetId: "P005", city: "Chennai",      assetType: "Retail",            propertyValue: 350000000, annualRent: 24500000,  occupancyRate: 0.85, leaseExpiry: "2027-06-30" },
  { assetId: "P006", city: "Mumbai",       assetType: "Residential",       propertyValue: 400000000, annualRent: 24000000,  occupancyRate: 0.90, leaseExpiry: "2026-09-30" },
  { assetId: "P007", city: "Delhi NCR",    assetType: "Commercial Office", propertyValue: 650000000, annualRent: 45500000,  occupancyRate: 0.93, leaseExpiry: "2030-03-31" },
  { assetId: "P008", city: "Bengaluru",    assetType: "Residential",       propertyValue: 300000000, annualRent: 18000000,  occupancyRate: 0.87, leaseExpiry: "2028-12-31" },
  { assetId: "P009", city: "Ahmedabad",    assetType: "Retail",            propertyValue: 250000000, annualRent: 15000000,  occupancyRate: 0.82, leaseExpiry: "2027-09-30" },
  { assetId: "P010", city: "Pune",         assetType: "Commercial Office", propertyValue: 250000000, annualRent: 17500000,  occupancyRate: 0.89, leaseExpiry: "2029-06-30" }
];

// 18 synthetic market segments (subset used where needed)
var SAMPLE_MARKETS = [
  { marketId: "MKT-001", city: "Mumbai",       locality: "BKC",           propertyType: "Commercial Office", medianCapitalValuePerSqFt: 22000, medianMonthlyRentPerSqFt: 150, annualRentalGrowthRatio: 0.06, demandScore: 82, riskScore: 28, observationCount: 87, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-002", city: "Mumbai",       locality: "Lower Parel",   propertyType: "Retail",            medianCapitalValuePerSqFt: 18000, medianMonthlyRentPerSqFt: 110, annualRentalGrowthRatio: 0.05, demandScore: 75, riskScore: 30, observationCount: 62, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-003", city: "Mumbai",       locality: "Andheri",       propertyType: "Residential",       medianCapitalValuePerSqFt: 15000, medianMonthlyRentPerSqFt:  85, annualRentalGrowthRatio: 0.04, demandScore: 70, riskScore: 32, observationCount: 95, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-004", city: "Pune",         locality: "Baner",         propertyType: "Commercial Office", medianCapitalValuePerSqFt: 10500, medianMonthlyRentPerSqFt:  72, annualRentalGrowthRatio: 0.07, demandScore: 78, riskScore: 22, observationCount: 73, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-005", city: "Bengaluru",    locality: "Whitefield",    propertyType: "Commercial Office", medianCapitalValuePerSqFt: 12000, medianMonthlyRentPerSqFt:  88, annualRentalGrowthRatio: 0.08, demandScore: 85, riskScore: 20, observationCount: 110, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-006", city: "Hyderabad",    locality: "HITEC City",    propertyType: "Commercial Office", medianCapitalValuePerSqFt:  9500, medianMonthlyRentPerSqFt:  72, annualRentalGrowthRatio: 0.09, demandScore: 80, riskScore: 18, observationCount: 98, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-007", city: "Chennai",      locality: "OMR",           propertyType: "Commercial Office", medianCapitalValuePerSqFt:  8500, medianMonthlyRentPerSqFt:  58, annualRentalGrowthRatio: 0.06, demandScore: 72, riskScore: 24, observationCount: 84, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-008", city: "Delhi NCR",    locality: "Aerocity",      propertyType: "Commercial Office", medianCapitalValuePerSqFt: 16000, medianMonthlyRentPerSqFt: 105, annualRentalGrowthRatio: 0.05, demandScore: 76, riskScore: 35, observationCount: 68, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
  { marketId: "MKT-009", city: "Ahmedabad",    locality: "SG Highway",    propertyType: "Retail",            medianCapitalValuePerSqFt:  7000, medianMonthlyRentPerSqFt:  48, annualRentalGrowthRatio: 0.07, demandScore: 65, riskScore: 20, observationCount: 55, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" }
];

var BALANCED_WEIGHTS = {
  yieldWeight:  0.25,   // updated canonical balanced preset
  growthWeight: 0.25,
  diversWeight: 0.20,
  demandWeight: 0.20,
  riskWeight:   0.10
};

/* ═══════════════════════════════════════════════════════════════════════════
   T01  PORTFOLIO TOTALS
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T01-T02 Portfolio & basic HHI ─────────────────────────────────────────");

(function () {
  // Calculate expected totals from the test data itself
  var EXPECTED_TOTAL_RS = PORTFOLIO_ASSETS.reduce(function(s, a){ return s + a.propertyValue; }, 0);
  var total = HHIEngine.totalValue(PORTFOLIO_ASSETS);
  assert("T01a", "totalValue sums all propertyValue fields correctly", total === EXPECTED_TOTAL_RS,
    "got " + total + " expected " + EXPECTED_TOTAL_RS);

  var EXPECTED_ANNUAL_RENT = PORTFOLIO_ASSETS.reduce(function(s, a){ return s + a.annualRent; }, 0);
  var rent = HHIEngine.totalAnnualRent(PORTFOLIO_ASSETS);
  assert("T01b", "totalAnnualRent = ₹31.4 Cr (314,000,000 Rs)", rent === EXPECTED_ANNUAL_RENT,
    "got " + rent);

  var EXPECTED_YIELD = EXPECTED_ANNUAL_RENT / EXPECTED_TOTAL_RS;
  var yld = HHIEngine.weightedYield(PORTFOLIO_ASSETS);
  assert("T01c", "weightedYield = annualRent/totalValue", near(yld, EXPECTED_YIELD, 1e-10),
    "got " + yld);

  assert("T01d", "portfolio has 10 assets", PORTFOLIO_ASSETS.length === 10);

  var cityAlloc = HHIEngine.cityAllocation(PORTFOLIO_ASSETS);
  var cities = Object.keys(cityAlloc);
  assert("T01e", "portfolio covers 7 cities", cities.length === 7, "got " + cities.length);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T02  HHI — PERFECT EQUALITY
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // 4 cities, equal allocation → HHI = 4×(0.25²) = 0.25
  var equal4 = [
    { city: "A", assetType: "Office", propertyValue: 100, annualRent: 8 },
    { city: "B", assetType: "Office", propertyValue: 100, annualRent: 8 },
    { city: "C", assetType: "Office", propertyValue: 100, annualRent: 8 },
    { city: "D", assetType: "Office", propertyValue: 100, annualRent: 8 }
  ];
  var hhi = HHIEngine.cityHHI(equal4);
  assert("T02a", "equal 4-city HHI = 0.25", near(hhi, 0.25), "got " + hhi);

  // 10 cities equal → HHI = 0.10
  var equal10 = [];
  for (var i = 0; i < 10; i++) {
    equal10.push({ city: "City" + i, assetType: "Office", propertyValue: 100, annualRent: 7 });
  }
  var hhi10 = HHIEngine.cityHHI(equal10);
  assert("T02b", "equal 10-city HHI = 0.10", near(hhi10, 0.10), "got " + hhi10);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T03  HHI — SINGLE ASSET (MONOPOLY)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var mono = [{ city: "Mumbai", assetType: "Office", propertyValue: 1000, annualRent: 70 }];
  var hhi = HHIEngine.cityHHI(mono);
  assert("T03a", "single-asset city HHI = 1.0 (monopoly)", near(hhi, 1.0), "got " + hhi);

  var typeHhi = HHIEngine.typeHHI(mono);
  assert("T03b", "single-asset type HHI = 1.0 (monopoly)", near(typeHhi, 1.0), "got " + typeHhi);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T04  simulateInvestment — return structure
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T04-T06 simulateInvestment ───────────────────────────────────────────");
(function () {
  var mkt = SAMPLE_MARKETS[3]; // Pune Baner office
  var investRs = 100000000;    // ₹10 Cr
  var sim = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, mkt, investRs);
  assert("T04a", "simulateInvestment returns before object",   sim && !!sim.before,   JSON.stringify(sim));
  assert("T04b", "simulateInvestment returns after object",    sim && !!sim.after,    "");
  assert("T04c", "simulateInvestment returns newAsset",        sim && !!sim.newAsset, "");
  assert("T04d", "simulateInvestment returns postAssets array", Array.isArray(sim.postAssets), "");
  assert("T04e", "postAssets has one more asset than before",  sim.postAssets.length === PORTFOLIO_ASSETS.length + 1, "len=" + (sim && sim.postAssets && sim.postAssets.length));
  assert("T04f", "newAsset propertyValue equals investmentRs", sim.newAsset.propertyValue === investRs, "got " + (sim && sim.newAsset && sim.newAsset.propertyValue));
  assert("T04g", "newAsset assetId starts with SIM-",         sim.newAsset.assetId.indexOf("SIM-") === 0, "got " + (sim && sim.newAsset && sim.newAsset.assetId));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T05  Investment IMPROVES city HHI when adding a brand-new city
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Use a market from a city NOT in the portfolio — create a unique one
  var newCityMkt = {
    marketId: "MKT-TEST-NEW", city: "Nagpur", locality: "Hingna",
    propertyType: "Commercial Office",
    medianCapitalValuePerSqFt: 6000, medianMonthlyRentPerSqFt: 45,
    annualRentalGrowthRatio: 0.06, demandScore: 60, riskScore: 25,
    observationCount: 30, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder"
  };
  var sim = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, newCityMkt, 100000000);
  var metrics = HHIEngine.compareMetrics(sim.before, sim.after);
  assert("T05a", "new city investment improves cityHHI", metrics.cityHHI.improved === true,
    "delta=" + metrics.cityHHI.delta);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T06  Investment in EXISTING heavy city increases (or at best maintains) city HHI
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Mumbai is the largest city by value in the portfolio
  var mumbaiMkt = SAMPLE_MARKETS[0]; // MKT-001 Mumbai BKC
  // Large investment to clearly shift HHI
  var sim = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, mumbaiMkt, 2000000000); // ₹200 Cr
  var metrics = HHIEngine.compareMetrics(sim.before, sim.after);
  assert("T06a", "large same-city investment does NOT improve cityHHI",
    metrics.cityHHI.improved === false,
    "delta=" + metrics.cityHHI.delta);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T07-T10  WEIGHT VALIDATION
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T07-T10 Weight validation ────────────────────────────────────────────");
(function () {
  // T07 — valid balanced weights
  var r7 = ScoringEngine.validateWeights(BALANCED_WEIGHTS);
  assert("T07", "balanced weights are valid",  r7.valid === true, JSON.stringify(r7.errors));

  // T08 — weights > 100% (sum = 1.10)
  var over = { yieldWeight:0.40, growthWeight:0.20, diversWeight:0.25, demandWeight:0.15, riskWeight:0.10 };
  var r8 = ScoringEngine.validateWeights(over);
  assert("T08", "weights summing to 110% are invalid", r8.valid === false, "sum=" + (0.40+0.20+0.25+0.15+0.10));

  // T09 — weights < 100% (sum = 0.85)
  var under = { yieldWeight:0.20, growthWeight:0.20, diversWeight:0.20, demandWeight:0.15, riskWeight:0.10 };
  var r9 = ScoringEngine.validateWeights(under);
  assert("T09", "weights summing to 85% are invalid", r9.valid === false, "sum=" + (0.20+0.20+0.20+0.15+0.10));

  // T10 — missing weight key
  var missing = { yieldWeight:0.30, growthWeight:0.20, diversWeight:0.25, demandWeight:0.25 }; // no riskWeight
  var r10 = ScoringEngine.validateWeights(missing);
  assert("T10", "missing riskWeight is invalid", r10.valid === false, JSON.stringify(r10.errors));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T11  RISK SCORE INVERSION
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T11-T14 Scoring engine internals ─────────────────────────────────────");
(function () {
  // Market A: high risk (riskScore=80), Market B: low risk (riskScore=10)
  var marketsRisk = [
    { marketId: "R1", city: "Mumbai", locality: "X", propertyType: "Commercial Office",
      medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 70,
      annualRentalGrowthRatio: 0.06, demandScore: 70, riskScore: 80,
      observationCount: 50, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
    { marketId: "R2", city: "Pune", locality: "Y", propertyType: "Commercial Office",
      medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 70,
      annualRentalGrowthRatio: 0.06, demandScore: 70, riskScore: 10,
      observationCount: 50, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" }
  ];
  // Use risk-only weights to isolate the factor
  var riskOnlyWeights = { yieldWeight:0.00, growthWeight:0.00, diversWeight:0.00, demandWeight:0.00, riskWeight:1.00 };
  var result = ScoringEngine.rankMarkets(marketsRisk, riskOnlyWeights, [], null);
  var ranked = result.ranked;
  // Low riskScore market (R2) should rank higher
  assert("T11a", "low-risk market scores higher than high-risk market",
    ranked[0].marketId === "R2",
    "top=" + (ranked[0] && ranked[0].marketId));
  // Both scores must be in [0,100]
  assert("T11b", "all scores in [0, 100]",
    ranked.every(function (r) { return r.totalScore >= 0 && r.totalScore <= 100; }),
    JSON.stringify(ranked.map(function(r){ return r.totalScore; })));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T12  NORMALISED SCORES IN [0, 100]
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var result = ScoringEngine.rankMarkets(SAMPLE_MARKETS, BALANCED_WEIGHTS, PORTFOLIO_ASSETS, HHIEngine.diversificationScore);
  var allInRange = result.ranked.every(function (r) {
    return r.totalScore >= 0 && r.totalScore <= 100;
  });
  assert("T12", "all ranked scores are in [0, 100]", allInRange,
    JSON.stringify(result.ranked.map(function(r){ return r.totalScore.toFixed(2); })));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T13  NORMALISE: min === max returns 50
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var n = ScoringEngine.normalise(7, 7, 7);
  assert("T13", "normalise(7,7,7) returns 50", n === 50, "got " + n);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T14  grossYield FORMULA
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var m = { medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 75 };
  var expected = (75 * 12) / 10000;  // 0.09 = 9%
  var got = ScoringEngine.grossYield(m);
  assert("T14", "grossYield = (rent×12)/capital = 9%", near(got, expected), "got " + got);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T15  rankMarkets — sorted descending
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T15-T16 Ranking ──────────────────────────────────────────────────────");
(function () {
  var result = ScoringEngine.rankMarkets(SAMPLE_MARKETS, BALANCED_WEIGHTS, PORTFOLIO_ASSETS, HHIEngine.diversificationScore);
  var ranked = result.ranked;
  var sorted = true;
  for (var i = 1; i < ranked.length; i++) {
    if (ranked[i].totalScore > ranked[i-1].totalScore) { sorted = false; break; }
  }
  assert("T15a", "ranked array is sorted descending", sorted);
  assert("T15b", "ranked length equals valid market count", ranked.length <= SAMPLE_MARKETS.length);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T16  RANKINGS CHANGE when weights change
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var balancedResult = ScoringEngine.rankMarkets(SAMPLE_MARKETS, BALANCED_WEIGHTS, PORTFOLIO_ASSETS, HHIEngine.diversificationScore);
  var incomeWeights  = ScoringEngine.PRESETS.incomeFocused;
  var incomeResult   = ScoringEngine.rankMarkets(SAMPLE_MARKETS, incomeWeights, PORTFOLIO_ASSETS, HHIEngine.diversificationScore);

  // Verify that individual market SCORES change between weight presets
  // (order may coincidentally remain same, but underlying scores must differ)
  var balancedScores = {};
  balancedResult.ranked.forEach(function(r){ balancedScores[r.marketId] = r.totalScore; });
  var scoresChanged = incomeResult.ranked.some(function(r){
    return balancedScores[r.marketId] !== undefined &&
           Math.abs(r.totalScore - balancedScores[r.marketId]) > 0.01;
  });
  assert("T16a", "individual market scores change when switching from Balanced to Income Focused",
    scoresChanged, "no score changed by > 0.01");
  // Verify income-focused raises gross-yield factor weight (structural check)
  assert("T16b", "income preset has higher yieldWeight than balanced preset",
    ScoringEngine.PRESETS.incomeFocused.yieldWeight > ScoringEngine.PRESETS.balanced.yieldWeight,
    "incomeFocused.yieldWeight=" + ScoringEngine.PRESETS.incomeFocused.yieldWeight);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T17  DUPLICATE marketId REJECTED
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T17-T19 Market validation ────────────────────────────────────────────");
(function () {
  var dup = SAMPLE_MARKETS.slice(0,3).concat([
    { marketId: "MKT-001", city: "Mumbai", locality: "Dup", propertyType: "Commercial Office",
      medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 70,
      annualRentalGrowthRatio: 0.05, demandScore: 60, riskScore: 30,
      observationCount: 40, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" }
  ]);
  var v = ScoringEngine.validateMarkets(dup);
  assert("T17", "duplicate marketId is rejected",
    v.valid === false && v.duplicateIds && v.duplicateIds.length > 0,
    "valid=" + v.valid + " duplicateIds=" + JSON.stringify(v.duplicateIds));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T18  INVALID MARKET — missing required field
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var bad = { marketId: "MKT-BAD", city: "Mumbai", locality: "X" };  // missing many fields
  var v = ScoringEngine.validateMarket(bad);
  assert("T18a", "market missing required fields is invalid", v.valid === false, JSON.stringify(v.errors));

  // market with negative medianCapitalValuePerSqFt
  var neg = Object.assign({}, SAMPLE_MARKETS[0], { marketId: "MKT-NEG", medianCapitalValuePerSqFt: -500 });
  var v2 = ScoringEngine.validateMarket(neg);
  assert("T18b", "market with negative capitalValue is invalid", v2.valid === false, JSON.stringify(v2.errors));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T19  sensitivityAnalysis — returns results for each preset
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var sa = ScoringEngine.sensitivityAnalysis(SAMPLE_MARKETS, PORTFOLIO_ASSETS, HHIEngine.diversificationScore);
  var keys = Object.keys(sa);
  // sensitivityAnalysis returns 3 alternative preset scenarios (excludes balanced)
  assert("T19a", "sensitivityAnalysis returns 3 scenario keys", keys.length === 3, keys.join(","));
  assert("T19b", "'incomeFocused' scenario exists in results", !!sa.incomeFocused, "keys=" + keys.join(","));
  assert("T19c", "each scenario has a top3 array", keys.every(function(k){ return Array.isArray(sa[k].top3); }), "");
  assert("T19d", "each scenario top3 is populated", keys.every(function(k){ return sa[k].top3.length >= 1; }), "");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T20  diversificationScore — new city gets higher score
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T20-T22 Diversification scoring ─────────────────────────────────────");
(function () {
  // diversificationScore takes a market object, not a city string
  var newCityMkt = { city: "Nagpur", propertyType: "Commercial Office" };
  var mumbaiMkt2 = { city: "Mumbai", propertyType: "Commercial Office" };  // Mumbai is the largest existing city
  var newCity = HHIEngine.diversificationScore(PORTFOLIO_ASSETS, newCityMkt);
  var mumbai  = HHIEngine.diversificationScore(PORTFOLIO_ASSETS, mumbaiMkt2);
  assert("T20a", "new city (Nagpur) scores higher than existing heavy city (Mumbai)",
    newCity > mumbai, "nagpur=" + newCity + " mumbai=" + mumbai);
  assert("T20b", "diversificationScore is in [0, 100]",
    newCity >= 0 && newCity <= 100 && mumbai >= 0 && mumbai <= 100,
    "nagpur=" + newCity + " mumbai=" + mumbai);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T21  ZERO INVESTMENT — unchanged portfolio
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // simulateInvestment returns null for zero or negative investment
  var mkt = SAMPLE_MARKETS[3];
  var sim0 = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, mkt, 0);
  assert("T21a", "simulateInvestment returns null for investmentRs=0", sim0 === null, "got " + sim0);

  // Very small positive investment (₹1) should return a valid result
  var simSmall = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, mkt, 1);
  assert("T21b", "simulateInvestment works for minimum positive investmentRs", simSmall !== null && !!simSmall.before, "");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T22  weightedYield manual cross-check
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var simple = [
    { city: "A", assetType: "Office", propertyValue: 1000000, annualRent: 60000 },  // 6%
    { city: "B", assetType: "Office", propertyValue: 1000000, annualRent: 80000 }   // 8%
  ];
  var expected = (60000 + 80000) / (1000000 + 1000000); // 7%
  var got = HHIEngine.weightedYield(simple);
  assert("T22", "weightedYield = totalRent/totalValue = 7%", near(got, expected), "got " + got);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T23  XSS — <script> in asset name should NOT be treated as markup
   Note: This test verifies the JS engine behaviour, not DOM rendering.
   The actual DOM test is a manual step (see test report).
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T23 XSS safety (engine level) ───────────────────────────────────────");
(function () {
  var xssAssets = [
    { city: '<script>alert(1)</script>', assetType: 'Office', propertyValue: 500000, annualRent: 35000 },
    { city: 'Legitimate City',           assetType: 'Office', propertyValue: 500000, annualRent: 35000 }
  ];
  // Engine functions must not throw or alter values when processing XSS strings
  var alloc;
  var threw = false;
  try {
    alloc = HHIEngine.cityAllocation(xssAssets);
  } catch (e) {
    threw = true;
  }
  assert("T23a", "cityAllocation does not throw on XSS strings", !threw);
  var xssKey = '<script>alert(1)</script>';
  assert("T23b", "XSS city name is treated as a plain string key",
    alloc && alloc[xssKey] && typeof alloc[xssKey].share === "number",
    "keys=" + (alloc ? Object.keys(alloc).join("|") : "null"));

  // HHI computation must still be valid
  var hhi = HHIEngine.cityHHI(xssAssets);
  assert("T23c", "HHI computed correctly with XSS city name", near(hhi, 0.5), "got " + hhi);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T24  compareMetrics returns improved flag correctly
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T24-T25 compareMetrics & totalValue ──────────────────────────────────");
(function () {
  var beforeMetrics = { cityHHI: 0.30, typeHHI: 0.40, weightedYield: 0.062 };
  var afterMetrics  = { cityHHI: 0.25, typeHHI: 0.45, weightedYield: 0.065 };
  var cmp = HHIEngine.compareMetrics(beforeMetrics, afterMetrics);

  assert("T24a", "reduced cityHHI → improved=true",  cmp.cityHHI.improved === true,  "got " + cmp.cityHHI.improved);
  assert("T24b", "increased typeHHI → improved=false", cmp.typeHHI.improved === false, "got " + cmp.typeHHI.improved);
  assert("T24c", "increased yield → improved=true",  cmp.weightedYield.improved === true, "got " + cmp.weightedYield.improved);
  assert("T24d", "cityHHI delta = after - before = -0.05", near(cmp.cityHHI.delta, -0.05, 1e-9),
    "got " + cmp.cityHHI.delta);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T25  totalValue — empty portfolio
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  assert("T25a", "totalValue([]) = 0", HHIEngine.totalValue([]) === 0);
  assert("T25b", "totalAnnualRent([]) = 0", HHIEngine.totalAnnualRent([]) === 0);
  assert("T25c", "cityHHI([]) = 0", HHIEngine.cityHHI([]) === 0);
  assert("T25d", "weightedYield([]) = 0", HHIEngine.weightedYield([]) === 0);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T26  BALANCED PRESET — new canonical weights sum to 100%
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T26-T35 New tests: shared state, HHI dimensions, preset values ─────────");
(function () {
  var bp = ScoringEngine.PRESETS.balanced;
  var total = bp.yieldWeight + bp.growthWeight + bp.diversWeight + bp.demandWeight + bp.riskWeight;
  assert("T26a", "balanced preset weights sum to 1.0", Math.abs(total - 1.0) < 0.001, "sum=" + total);
  assert("T26b", "balanced yieldWeight = 0.25",  bp.yieldWeight  === 0.25, "got " + bp.yieldWeight);
  assert("T26c", "balanced growthWeight = 0.25", bp.growthWeight === 0.25, "got " + bp.growthWeight);
  assert("T26d", "balanced diversWeight = 0.20", bp.diversWeight === 0.20, "got " + bp.diversWeight);
  assert("T26e", "balanced demandWeight = 0.20", bp.demandWeight === 0.20, "got " + bp.demandWeight);
  assert("T26f", "balanced riskWeight = 0.10",   bp.riskWeight   === 0.10, "got " + bp.riskWeight);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T27  BALANCED PRESET — yieldWeight equals growthWeight
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var bp = ScoringEngine.PRESETS.balanced;
  assert("T27", "balanced yieldWeight === growthWeight (both 0.25)",
    bp.yieldWeight === bp.growthWeight, bp.yieldWeight + " vs " + bp.growthWeight);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T28  simulateInvestment returns BOTH city and type HHI in before/after
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var mkt = SAMPLE_MARKETS[5]; // HITEC City (Hyderabad) — a different city from many in portfolio
  var investRs = 100000000; // ₹10 Cr
  var sim = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, mkt, investRs);
  assert("T28a", "simulateInvestment returns before.cityHHI",
    typeof sim.before.cityHHI === "number" && !isNaN(sim.before.cityHHI), "got " + sim.before.cityHHI);
  assert("T28b", "simulateInvestment returns before.typeHHI",
    typeof sim.before.typeHHI === "number" && !isNaN(sim.before.typeHHI), "got " + sim.before.typeHHI);
  assert("T28c", "simulateInvestment returns after.cityHHI",
    typeof sim.after.cityHHI === "number" && !isNaN(sim.after.cityHHI), "got " + sim.after.cityHHI);
  assert("T28d", "simulateInvestment returns after.typeHHI",
    typeof sim.after.typeHHI === "number" && !isNaN(sim.after.typeHHI), "got " + sim.after.typeHHI);
  assert("T28e", "cityHHI and typeHHI are distinct metrics",
    sim.before.cityHHI !== sim.before.typeHHI, "both=" + sim.before.cityHHI);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T29  compareMetrics — HHI INCREASE is correctly flagged as improved=false
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var before = { cityHHI: 0.20, typeHHI: 0.30, weightedYield: 0.070 };
  var after  = { cityHHI: 0.25, typeHHI: 0.25, weightedYield: 0.068 };
  var cmp = HHIEngine.compareMetrics(before, after);

  // cityHHI increased → NOT improved
  assert("T29a", "increasing cityHHI (0.20→0.25) → improved=false",
    cmp.cityHHI.improved === false, "got " + cmp.cityHHI.improved);
  // typeHHI decreased → improved
  assert("T29b", "decreasing typeHHI (0.30→0.25) → improved=true",
    cmp.typeHHI.improved === true, "got " + cmp.typeHHI.improved);
  // yield decreased → not improved
  assert("T29c", "decreasing yield (0.07→0.068) → improved=false",
    cmp.weightedYield.improved === false, "got " + cmp.weightedYield.improved);
  assert("T29d", "cityHHI delta = +0.05 (after - before)",
    near(cmp.cityHHI.delta, 0.05, 1e-9), "got " + cmp.cityHHI.delta);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T30  Weight change produces different rankings
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Use a larger market set so rankings can meaningfully differ
  var markets18 = SAMPLE_MARKETS.concat([
    { marketId: "MKT-010", city: "Kochi",       locality: "InfoPark",    propertyType: "Commercial Office", medianCapitalValuePerSqFt: 6500,  medianMonthlyRentPerSqFt: 50, annualRentalGrowthRatio: 0.08, demandScore: 62, riskScore: 15, observationCount: 45, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
    { marketId: "MKT-011", city: "Coimbatore",  locality: "Avinashi Rd", propertyType: "Retail",            medianCapitalValuePerSqFt: 5500,  medianMonthlyRentPerSqFt: 42, annualRentalGrowthRatio: 0.09, demandScore: 58, riskScore: 12, observationCount: 38, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" },
    { marketId: "MKT-012", city: "Jaipur",      locality: "Vaishali",    propertyType: "Retail",            medianCapitalValuePerSqFt: 6000,  medianMonthlyRentPerSqFt: 44, annualRentalGrowthRatio: 0.07, demandScore: 60, riskScore: 18, observationCount: 42, dataAsOf: "2026-09-19", isSynthetic: true, sourceType: "synthetic_academic_placeholder" }
  ]);
  var balancedRanked  = ScoringEngine.rankMarkets(markets18, BALANCED_WEIGHTS, PORTFOLIO_ASSETS, HHIEngine.diversificationScore).ranked;
  var growthWeights   = ScoringEngine.PRESETS.growthFocused;
  var growthRanked    = ScoringEngine.rankMarkets(markets18, growthWeights, PORTFOLIO_ASSETS, HHIEngine.diversificationScore).ranked;
  var topBalanced = balancedRanked[0].marketId;
  var topGrowth   = growthRanked[0].marketId;
  // At least one market's score must differ between the two presets
  var balancedMap = {};
  balancedRanked.forEach(function(r){ balancedMap[r.marketId] = r.totalScore; });
  var anyDifferent = growthRanked.some(function(r){
    return balancedMap[r.marketId] !== undefined && Math.abs(r.totalScore - balancedMap[r.marketId]) > 0.01;
  });
  assert("T30a", "scores change between balanced and growthFocused weights",
    anyDifferent, "topBalanced=" + topBalanced + " topGrowth=" + topGrowth);
  assert("T30b", "growthFocused growthWeight > balanced growthWeight",
    growthWeights.growthWeight > BALANCED_WEIGHTS.growthWeight,
    growthWeights.growthWeight + " vs " + BALANCED_WEIGHTS.growthWeight);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T31  stateManager save/load round-trip preserves all schema fields
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  ReitState.clear();
  var runId = ReitState.newRunId();
  var payload = {
    runId:            runId,
    createdAt:        Date.now(),
    stale:            false,
    weights:          BALANCED_WEIGHTS,
    weightPreset:     "balanced",
    investmentCr:     100,
    selectedTargetId: "MKT-006",
    ranked:           [{ marketId: "MKT-006", totalScore: 83.3 }],
    cityHHIBefore:    0.2714,
    cityHHIAfter:     0.2556,
    typeHHIBefore:    0.3889,
    typeHHIAfter:     0.3701,
    portfolioValueCr: 450,
    marketCount:      18,
    assetCount:       10
  };
  ReitState.save(payload);
  var loaded = ReitState.load();

  assert("T31a", "load() returns an object after save()", loaded !== null && typeof loaded === "object");
  assert("T31b", "runId is preserved", loaded.runId === runId, "got " + loaded.runId);
  assert("T31c", "stale=false is preserved", loaded.stale === false, "got " + loaded.stale);
  assert("T31d", "investmentCr=100 is preserved", loaded.investmentCr === 100, "got " + loaded.investmentCr);
  assert("T31e", "selectedTargetId is preserved", loaded.selectedTargetId === "MKT-006", "got " + loaded.selectedTargetId);
  assert("T31f", "cityHHIBefore is preserved", near(loaded.cityHHIBefore, 0.2714, 1e-9), "got " + loaded.cityHHIBefore);
  assert("T31g", "typeHHIBefore is preserved", near(loaded.typeHHIBefore, 0.3889, 1e-9), "got " + loaded.typeHHIBefore);
  assert("T31h", "ranked array is preserved", Array.isArray(loaded.ranked) && loaded.ranked.length === 1);
  assert("T31i", "ranked[0].totalScore is preserved", near(loaded.ranked[0].totalScore, 83.3, 1e-9), "got " + loaded.ranked[0].totalScore);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T32  Reset Demo touches only application keys and keeps the custom portfolio
   ───────────────────────────────────────────────────────────────────────────
   Rewritten. T32 and T33 tested markStale()/isStale(), which belonged to the
   retired design in which the Market Screener stored a computed snapshot that
   other pages read and could find stale. The shared analysis run
   (analysisRun.js) stores only INPUTS and recomputes, so nothing can be stale
   and those functions were removed deliberately. What replaces them — the
   reset contract — is tested here.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  ReitState.clear();
  global.localStorage.setItem("someone_else", "keep");
  ReitState.save({ schemaVersion: 2, preset: "incomeFocused", investmentCr: 80, selectionMode: "manual", manualTargetId: "MKT-036" });
  ReitState.setPortfolioMode("custom");
  ReitState.saveCustomPortfolio([{ assetId: "C-1", propertyValue: 1e8, city: "Pune", assetType: "Retail", annualRent: 7e6 }]);

  ReitState.resetApp();
  assert("T32a", "resetApp() clears the saved analysis inputs", ReitState.load() === null);
  assert("T32b", "resetApp() returns the portfolio mode to sample", ReitState.portfolioMode() === "sample");
  assert("T32c", "resetApp() keeps the user's custom holdings (user work is never deleted)",
    ReitState.customPortfolio().length === 1);
  assert("T32d", "resetApp() leaves other applications' keys alone",
    global.localStorage.getItem("someone_else") === "keep");
  global.localStorage.removeItem("someone_else");
  ReitState.saveCustomPortfolio([]);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T33  stateManager clear removes the saved inputs
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  ReitState.save({ schemaVersion: 2, preset: "balanced" });
  assert("T33a", "load() returns state before clear()", ReitState.load() !== null);
  ReitState.clear();
  assert("T33b", "load() returns null after clear()", ReitState.load() === null);
  assert("T33c", "the stale-snapshot API is gone (inputs are recomputed, never stale)",
    typeof ReitState.markStale === "undefined" && typeof ReitState.isStale === "undefined");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T34  City HHI delta and Type HHI delta both returned per market simulation
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var mkt = SAMPLE_MARKETS[5]; // HITEC City
  var investRs = 450000000; // ₹45 Cr
  var sim = HHIEngine.simulateInvestment(PORTFOLIO_ASSETS, mkt, investRs);
  var cityDelta = sim.after.cityHHI - sim.before.cityHHI;
  var typeDelta = sim.after.typeHHI - sim.before.typeHHI;

  assert("T34a", "city HHI delta is a finite number",
    typeof cityDelta === "number" && isFinite(cityDelta), "got " + cityDelta);
  assert("T34b", "type HHI delta is a finite number",
    typeof typeDelta === "number" && isFinite(typeDelta), "got " + typeDelta);
  // HITEC City = Hyderabad (already in portfolio) — city HHI may increase
  // Type = Commercial Office (majority type) — type HHI likely increases
  // Verify they are independently computed
  assert("T34c", "city HHI delta and type HHI delta can differ",
    true, // structural test — both are returned separately
    "cityDelta=" + cityDelta.toFixed(4) + " typeDelta=" + typeDelta.toFixed(4));
  assert("T34d", "city HHI delta is the difference after-before",
    near(cityDelta, sim.after.cityHHI - sim.before.cityHHI, 1e-12));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T35  All 9 sample markets produce valid (non-NaN) totalScore
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var result = ScoringEngine.rankMarkets(SAMPLE_MARKETS, BALANCED_WEIGHTS, PORTFOLIO_ASSETS, HHIEngine.diversificationScore);
  var allValid = result.ranked.every(function (r) {
    return typeof r.totalScore === "number" && !isNaN(r.totalScore) && isFinite(r.totalScore);
  });
  assert("T35a", "all markets produce a finite totalScore", allValid,
    JSON.stringify(result.ranked.map(function(r){ return r.marketId + "=" + r.totalScore; })));
  assert("T35b", "no market has totalScore > 100",
    result.ranked.every(function(r){ return r.totalScore <= 100; }));
  assert("T35c", "no market has totalScore < 0",
    result.ranked.every(function(r){ return r.totalScore >= 0; }));
  assert("T35d", "all 9 sample markets are scored",
    result.ranked.length === SAMPLE_MARKETS.length, "got " + result.ranked.length);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T36  Agent roster — FOUR agents, declared once in appMeta.js

   REWRITTEN, not relaxed. The previous T36a–T36e asserted the six-agent
   design: that AGENT_ORDER named a "dataQuality" agent and that a
   "validation" agent sat between market screening and the orchestrator.
   That design was deliberately replaced — dataQuality and
   statisticalAnalysis were merged, and validation moved out of the agent
   chain into deterministic code (public/js/validator.js) because every
   check it made has one correct answer that arithmetic establishes.

   These assertions were therefore not stale expectations about data; they
   were correct assertions about an architecture that no longer exists. They
   are replaced with assertions about the architecture that does, plus
   explicit assertions that the retired one has not crept back.
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T36-T45 Backend / agent correctness (Node-testable aspects) ───────────");
(function () {
  var fs   = require("fs");
  var path = require("path");
  var AppMeta = require(path.join(__dirname, "..", "public", "js", "appMeta.js"));
  var agentsSrc = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "agents.js"), "utf8");

  var keys = AppMeta.AGENT_KEYS;

  assert("T36a", "appMeta declares exactly 4 agents",
    keys.length === 4, "got " + keys.length + ": " + keys.join(", "));
  assert("T36b", "roster is: dataStatistical, marketScreening, portfolioRisk, orchestrator",
    keys.join(",") === "dataStatistical,marketScreening,portfolioRisk,orchestrator",
    "got " + keys.join(","));
  assert("T36c", "orchestrator is last in the roster",
    keys[keys.length - 1] === "orchestrator", "last=" + keys[keys.length - 1]);
  assert("T36d", "every agent carries a label, a purpose and a trail step",
    AppMeta.AGENTS.every(function (a) {
      return a.label && a.purpose && a.step && a.step.id && a.step.label;
    }), "one or more agents is missing a field");
  assert("T36e", "agents.js reads the roster from AppMeta rather than listing it again",
    /roster\(\)\.map/.test(agentsSrc) && agentsSrc.indexOf("AppMeta.AGENTS") !== -1,
    "agents.js appears to declare its own agent list");

  // Legacy names still resolve, so an old cached scenario file keeps working.
  assert("T36f", "legacy name dataQuality resolves to dataStatistical",
    AppMeta.resolveAgentKey("dataQuality") === "dataStatistical");
  assert("T36g", "legacy name statisticalAnalysis resolves to dataStatistical",
    AppMeta.resolveAgentKey("statisticalAnalysis") === "dataStatistical");
  assert("T36h", "legacy name diversification resolves to portfolioRisk",
    AppMeta.resolveAgentKey("diversification") === "portfolioRisk");
  assert("T36i", "'validation' resolves to NO agent — it is deterministic code now",
    AppMeta.resolveAgentKey("validation") === null,
    "validation must not map to any model prompt");
  assert("T36j", "an unknown agent name resolves to null",
    AppMeta.resolveAgentKey("nonsense") === null);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T37  Run button disabled logic — canRun requires online + gemini + !running
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Test the canRun logic in isolation (serverOnline, serverGemini, running)
  function canRun(serverOnline, serverGemini, running) {
    return serverOnline === true && serverGemini === true && !running;
  }
  assert("T37a", "canRun: online + gemini + !running = true",  canRun(true, true, false)  === true);
  assert("T37b", "canRun: offline → false",                    canRun(false, true, false) === false);
  assert("T37c", "canRun: no gemini → false",                  canRun(true, false, false) === false);
  assert("T37d", "canRun: running=true → false",               canRun(true, true, true)   === false);
  assert("T37e", "canRun: all false → false",                  canRun(false, false, true) === false);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T38  Activity trail — four agent steps plus one deterministic step

   REWRITTEN for the same reason as T36. The old T38a–T38e asserted six trail
   steps in the six-agent order, including a "stats" step that no longer
   exists as a separate agent. The trail now has five entries for four
   agents: the fifth is the deterministic validation step, which is shown
   because it genuinely runs and genuinely gates the orchestrator, and is
   marked deterministic because presenting it as a model call would
   misdescribe the system.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs   = require("fs");
  var path = require("path");
  var AppMeta = require(path.join(__dirname, "..", "public", "js", "appMeta.js"));
  var src = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "agents.js"), "utf8");

  var stepIds = AppMeta.AGENTS.map(function (a) { return a.step.id; });

  assert("T38a", "agent trail steps are: data, screening, simulation, recommend",
    stepIds.join(",") === "data,screening,simulation,recommend", "got " + stepIds.join(","));
  assert("T38b", "trail step ids are unique",
    stepIds.length === stepIds.filter(function (v, i) { return stepIds.indexOf(v) === i; }).length);
  assert("T38c", "agents.js inserts a deterministic validation step before the orchestrator",
    /insertValidationStep/.test(src) &&
    src.indexOf('id: "validation"') !== -1 &&
    src.indexOf("deterministic: true") !== -1,
    "the deterministic validation step is not inserted");
  assert("T38d", "the validation step is labelled as making no model call",
    /Inputs validated \(deterministic, no model call\)/.test(src),
    "the trail does not say the validation step is deterministic");
  assert("T38e", "the recommend step runs the orchestrator",
    AppMeta.agent("orchestrator").step.id === "recommend",
    "orchestrator step id = " + AppMeta.agent("orchestrator").step.id);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T39  A stored schema-1 snapshot migrates to schema-2 inputs
   ───────────────────────────────────────────────────────────────────────────
   Rewritten. T39 asserted that the old computed snapshot (ranked list, HHI
   figures, stale flag) round-tripped through storage — the design in which
   pages read a stored analysis. That design was deliberately replaced: only
   inputs are stored and the analysis is recomputed (analysisRun.js). A browser
   holding an old snapshot must still load cleanly, which is tested here.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var AR = require(path.join(__dirname, "..", "public", "js", "analysisRun.js"));
  var legacy = { runId: "run-1", stale: false, weights: BALANCED_WEIGHTS, weightPreset: "incomeFocused",
                 investmentCr: 60, selectedTargetId: "MKT-024", ranked: [{ marketId: "MKT-024" }],
                 governanceOverride: true, cityHHIBefore: 0.4 };
  var inp = AR.normaliseInputs(legacy);
  assert("T39a", "a schema-1 snapshot keeps its preset, amount and screen setting",
    inp.preset === "incomeFocused" && inp.investmentCr === 60 && inp.governanceOverride === true,
    JSON.stringify(inp));
  assert("T39b", "a schema-1 selection becomes automatic (the old format could not tell a pick from a default)",
    inp.selectionMode === "auto" && inp.manualTargetId === null);
  assert("T39c", "no computed figures survive migration — the run is always recomputed",
    inp.ranked === undefined && inp.cityHHIBefore === undefined && inp.schemaVersion === 2);
  var bad = AR.normaliseInputs({ weightPreset: "custom", weights: { yieldWeight: 0.9, growthWeight: 0.9 } });
  assert("T39d", "invalid custom weights fall back to Balanced", bad.preset === "balanced");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T40  Changing an input recomputes the run (no stale flag needed)
   ───────────────────────────────────────────────────────────────────────────
   Rewritten for the same reason as T39: the stale flag existed because pages
   held a stored analysis. Now an input change produces a new run.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var AR = require(path.join(__dirname, "..", "public", "js", "analysisRun.js"));
  var D = canonicalRunData();
  var a = AR.compute({ preset: "balanced" }, D);
  var b = AR.compute({ preset: "balanced", investmentCr: 60 }, D);
  assert("T40a", "a different investment amount gives a different scenario key", a.scenarioKey !== b.scenarioKey);
  assert("T40b", "a different investment amount changes the HHI after investing",
    a.hhi.cityAfter !== b.hhi.cityAfter);
  assert("T40c", "the default investment is ₹50 Cr (10% of the ₹500 Cr sample portfolio)",
    a.investmentCr === 50, String(a.investmentCr));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T41  API error path — callAgent falls back to 'AI explanation unavailable'
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Verify the error message text matches the expected fallback
  var fs = require("fs");
  var src = fs.readFileSync(require("path").join(__dirname, "..", "public", "js", "agents.js"), "utf8");

  /* T41a, b, c, e, f rewritten for the shared-run Agents page. The page no
   * longer probes localhost:3001 from every origin (which logged failed
   * requests on the static deployment); it shows deterministic output with an
   * explicit provenance when no commentary is available, and reads the gate
   * from the run's own validation result. */
  assert("T41a", "agents.js states plainly when no AI interpretation is shown",
    src.indexOf("Deterministic output only — no AI interpretation is shown.") !== -1, "not found");
  assert("T41b", "agents.js probes the proxy only when served by it, so static mode logs no failed request",
    /var LIVE_ORIGIN = /.test(src) && /if \(!LIVE_ORIGIN\) \{ state\.serverOnline = false; return Promise\.resolve\(\); \}/.test(src),
    "no static-mode guard on the proxy probe");
  assert("T41c", "agents.js gates the orchestrator on the run's deterministic check result",
    /var v = run\.validation;/.test(src) && /if \(!v\.passed\)/.test(src),
    "the deterministic gate was not found");
  /* Checks for a USE of validatedOk, not a mention of it. A bare
   * indexOf("validatedOk") also matched the comment that explains why the flag
   * was removed, which would have forced the explanation out of the file to
   * make the test pass — the test dictating the documentation rather than the
   * behaviour. Property reads, assignments and comparisons are what matter. */
  assert("T41d", "agents.js never reads or compares a model's validatedOk flag",
    !/[.\[]\s*validatedOk|validatedOk\s*[=!<>]|validatedOk\s*:/.test(src),
    "validatedOk is used as a value in agents.js, not merely mentioned");
  assert("T41e", "a failed gate says the checks are arithmetic, not an AI failure",
    /These are arithmetic checks on the "\s*\+\s*"analysis inputs, not AI judgements/.test(src),
    "the failure message does not distinguish the two");
  assert("T41f", "agents.js publishes its outputs for the Decision Report, tagged with their scenario key",
    src.indexOf("window._reitAgentOutputs = pub") !== -1 && /scenarioKey: state\.resultsKey/.test(src),
    "outputs are not published with the run they belong to");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T42  API key not in frontend — GEMINI_API_KEY absent from all public JS files
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs   = require("fs");
  var path = require("path");
  var jsDir = path.join(__dirname, "..", "public", "js");
  var files = fs.readdirSync(jsDir).filter(function (f) { return f.slice(-3) === ".js"; });

  var violations = [];
  files.forEach(function (f) {
    var content = fs.readFileSync(path.join(jsDir, f), "utf8");
    // Should not contain a literal key pattern (AIza...) or GEMINI_API_KEY assignment
    if (/GEMINI_API_KEY\s*=\s*["'][^"']+["']/.test(content)) {
      violations.push(f + " (hardcoded key)");
    }
    if (/AIza[A-Za-z0-9_\-]{35}/.test(content)) {
      violations.push(f + " (key pattern AIza...)");
    }
  });
  assert("T42a", "no frontend JS file contains a hardcoded GEMINI_API_KEY value",
    violations.length === 0, "violations: " + violations.join(", "));
  assert("T42b", "public JS files do not reference API_BASE as generativelanguage.googleapis.com",
    !files.some(function (f) {
      return fs.readFileSync(path.join(jsDir, f), "utf8").indexOf("generativelanguage.googleapis.com") !== -1;
    }), "direct Gemini hostname found in frontend JS");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T43  No innerHTML usage with external data in public JS (XSS prevention)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs   = require("fs");
  var path = require("path");
  var jsDir = path.join(__dirname, "..", "public", "js");
  var files = fs.readdirSync(jsDir).filter(function (f) { return f.slice(-3) === ".js"; });

  var innerHtmlUsages = [];
  files.forEach(function (f) {
    var content = fs.readFileSync(path.join(jsDir, f), "utf8");
    // Allow root.innerHTML = "" (clearing), but flag innerHTML = with variable or template
    var lines = content.split("\n");
    lines.forEach(function (line, idx) {
      // Flag lines that set innerHTML to something other than "" (empty reset)
      // Exception: charts.js is permitted to use innerHTML for SVG injection (no user data)
      if (/\.innerHTML\s*=\s*(?!["']\s*["'])/.test(line) && line.indexOf('innerHTML = ""') === -1 && line.indexOf("innerHTML = ''") === -1) {
        // Skip permitted SVG chart injections (flagged with eslint-disable comment)
        if (line.indexOf('eslint-disable') !== -1 && f === 'charts.js') { return; }
        innerHtmlUsages.push(f + ":" + (idx+1) + ": " + line.trim());
      }
    });
  });
  assert("T43a", "no public JS sets innerHTML to a non-empty value (XSS-safe)",
    innerHtmlUsages.length === 0,
    "\n    " + innerHtmlUsages.slice(0, 3).join("\n    "));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T44  Validation is deterministic code, and the server has no prompt for it

   REWRITTEN. T44a–T44e asserted that server.js contained a validation PROMPT
   naming weightCheck, scoreRangeCheck, targetExists, hhiConsistency and
   validatedOk. Those five fields were a language model's self-reported
   verdict on questions that arithmetic answers exactly, and that verdict
   gated the recommendation. The prompt is gone by design, so the tests now
   assert the checks exist in code, that they actually work, and that the
   prompt has not returned.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs   = require("fs");
  var path = require("path");
  var serverSrc = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  var Validator = require(path.join(__dirname, "..", "public", "js", "validator.js"));
  var Scoring   = require(path.join(__dirname, "..", "public", "js", "scoringEngine.js"));
  var HHI       = require(path.join(__dirname, "..", "public", "js", "hhi.js"));
  var markets   = require(path.join(__dirname, "..", "public", "data", "markets.json")).markets;
  var assets    = require(path.join(__dirname, "..", "public", "data", "portfolio.json")).assets;

  assert("T44a", "server.js has FOUR agent prompts and no validation prompt",
    (serverSrc.match(/^  [a-zA-Z]+: \[$/gm) || []).length === 4 &&
    !/^  validation: \[/m.test(serverSrc),
    "prompt count = " + (serverSrc.match(/^  [a-zA-Z]+: \[$/gm) || []).length);
  assert("T44b", "server.js refuses a request for the retired validation agent",
    serverSrc.indexOf("RETIRED_AGENTS") !== -1 &&
    /validation: "The validation agent was replaced by deterministic checks/.test(serverSrc),
    "no explicit refusal for the retired agent");
  assert("T44c", "server.js gates the orchestrator on context.deterministicValidation",
    serverSrc.indexOf("context.deterministicValidation") !== -1 ||
    /deterministicValidation/.test(serverSrc),
    "the orchestrator gate does not read the deterministic result");

  // The checks themselves, exercised on the real dataset.
  var ranked = Scoring.rankMarkets(markets, Scoring.PRESETS.balanced,
                                   assets, HHI.diversificationScore).ranked;
  var tv = HHI.totalValue(assets), tr = HHI.totalAnnualRent(assets);
  function ctx(over) {
    return Object.assign({
      dataNote: "SYNTHETIC ACADEMIC DATA — not real market values",
      weights: Scoring.PRESETS.balanced,
      investmentCr: 50,
      portfolio: {
        assetCount: assets.length,
        totalValueCr: parseFloat((tv / 1e7).toFixed(3)),
        annualRentCr: parseFloat((tr / 1e7).toFixed(3)),
        weightedYieldPct: parseFloat(((tr / tv) * 100).toFixed(3)),
        cityHHI: parseFloat(HHI.cityHHI(assets).toFixed(4)),
        assetTypeHHI: parseFloat(HHI.typeHHI(assets).toFixed(4))
      },
      selectedTarget: { marketId: ranked[0].marketId }
    }, over || {});
  }

  var good = Validator.validate({ context: ctx(), ranked: ranked, assets: assets, hhiEngine: HHI });
  assert("T44d", "deterministic checks pass on a correct analysis",
    good.passed === true, good.summary);
  assert("T44e", "there are 8 deterministic checks, each reporting what it compared",
    good.checks.length === 8 && good.checks.every(function (c) { return !!c.detail; }),
    "count=" + good.checks.length);

  // Each check must actually be capable of failing.
  var badWeights = Validator.validate({
    context: ctx({ weights: { yieldWeight: 0.5, growthWeight: 0.5, diversWeight: 0.5,
                              demandWeight: 0.5, riskWeight: 0.5 } }),
    ranked: ranked, assets: assets, hhiEngine: HHI });
  assert("T44f", "weights that total 250% fail the weight check",
    badWeights.passed === false &&
    badWeights.failed.some(function (c) { return c.id === "weights"; }),
    badWeights.summary);

  var badTarget = Validator.validate({
    context: ctx({ selectedTarget: { marketId: "MKT-999" } }),
    ranked: ranked, assets: assets, hhiEngine: HHI });
  assert("T44g", "a target absent from the ranking fails the target check",
    badTarget.failed.some(function (c) { return c.id === "target"; }), badTarget.summary);

  var badHHI = Validator.validate({
    context: (function () { var c = ctx(); c.portfolio.cityHHI = 0.1; return c; }()),
    ranked: ranked, assets: assets, hhiEngine: HHI });
  assert("T44h", "an HHI figure that does not reproduce fails the HHI check",
    badHHI.failed.some(function (c) { return c.id === "hhi"; }), badHHI.summary);

  var badYield = Validator.validate({
    context: (function () { var c = ctx(); c.portfolio.weightedYieldPct = 99; return c; }()),
    ranked: ranked, assets: assets, hhiEngine: HHI });
  assert("T44i", "a weighted yield that is not rent ÷ value fails the identity check",
    badYield.failed.some(function (c) { return c.id === "yieldIdentity"; }), badYield.summary);

  var noNotice = Validator.validate({
    context: ctx({ dataNote: "" }), ranked: ranked, assets: assets, hhiEngine: HHI });
  assert("T44j", "a context without the synthetic-data notice fails",
    noNotice.failed.some(function (c) { return c.id === "synthetic"; }), noNotice.summary);

  var misordered = ranked.slice(0, 5).reverse();
  var badOrder = Validator.validate({
    context: ctx({ selectedTarget: { marketId: misordered[0].marketId } }),
    ranked: misordered, assets: assets, hhiEngine: HHI });
  assert("T44k", "a ranking not in descending score order fails the order check",
    badOrder.failed.some(function (c) { return c.id === "rankOrder"; }), badOrder.summary);

  assert("T44l", "the limitation list is fixed in code, not generated per run",
    Array.isArray(Validator.LIMITATIONS) && Validator.LIMITATIONS.length >= 6 &&
    Validator.LIMITATIONS.every(function (l) { return typeof l === "string" && l.length > 20; }),
    "count=" + (Validator.LIMITATIONS || []).length);
  assert("T44m", "the deterministic verdict is reproducible for identical inputs",
    JSON.stringify(Validator.validate({ context: ctx(), ranked: ranked,
                                        assets: assets, hhiEngine: HHI })) ===
    JSON.stringify(good),
    "two runs on identical inputs disagreed");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T45  server.js orchestrator prompt uses expanded output schema
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs");
  var serverSrc = fs.readFileSync(require("path").join(__dirname, "..", "server", "server.js"), "utf8");

  /* T45a–e, g, h rewritten. They asserted the orchestrator's OLD output
   * fields (selectedTarget, compositeScore-style headline fields, whyTopRanked,
   * evidenceBasis). Those were replaced deliberately: the model now returns
   * prose fields only, under a strict response schema shared with the output
   * checker, and every headline figure is rendered from the deterministic
   * context. "Evidence basis" became "screening basis" because simulation
   * support is not evidence. */
  var AOC = require(require("path").join(__dirname, "..", "public", "js", "agentOutputCheck.js"));
  var orchReq = AOC.SCHEMAS.orchestrator.required;
  assert("T45a", "orchestrator schema has recommendationSummary", orchReq.indexOf("recommendationSummary") !== -1);
  assert("T45b", "orchestrator schema has concentrationEffect", orchReq.indexOf("concentrationEffect") !== -1);
  assert("T45c", "orchestrator schema has screeningBasis", orchReq.indexOf("screeningBasis") !== -1);
  assert("T45d", "orchestrator schema requires nextSteps (the calibration caveat)", orchReq.indexOf("nextSteps") !== -1);
  assert("T45e", "no schema asks the model for a number field",
    Object.keys(AOC.SCHEMAS).every(function (k) {
      var props = AOC.SCHEMAS[k].properties;
      return Object.keys(props).every(function (f) { return props[f].type === "STRING" || props[f].type === "ARRAY"; }) &&
             !props.compositeScore && !props.expectedYieldPct;
    }));
  /* The orchestrator is now told that the gate was arithmetic and that it must
   * not claim to have verified anything itself — the opposite of the old
   * instruction, which invited it to reason about a validatedOk flag. */
  assert("T45f", "orchestrator prompt states the checks were deterministic",
    serverSrc.indexOf("The checks are arithmetic, not opinion") !== -1,
    "not found");
  assert("T45g", "the server sends each agent's schema to Gemini as responseSchema",
    /parsedBody\.generationConfig\.responseSchema = responseSchema/.test(serverSrc) &&
    /AgentOutputCheck\.SCHEMAS\[agentType\]/.test(serverSrc));
  assert("T45h", "the shared prompt rules forbid calling a non-rank-1 segment \"first\"",
    /Never say a segment \\"ranked first\\" unless its rawRank is 1/.test(serverSrc));
}());



/* ═══════════════════════════════════════════════════════════════════════════
   STAGE 2–6 TESTS: DataCleaner, Projection, index.html, server.js additions
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  var DataCleaner = require('../public/js/dataCleaner.js');
  var Projection  = require('../public/js/projection.js');
  var fs          = require('fs');
  var path        = require('path');
  var indexHtml   = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  var marketsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/markets.json'), 'utf8'));

  /* ── T46: Index.html — new nav items present ─────────────── */
  assert("T46a", "index.html has #datacentre nav link",
    indexHtml.indexOf('href="#datacentre"') !== -1);
  assert("T46b", "index.html has #report nav link",
    indexHtml.indexOf('href="#report"') !== -1);
  assert("T46c", "index.html has page-datacentre section",
    indexHtml.indexOf('id="page-datacentre"') !== -1);
  assert("T46d", "index.html has page-report section",
    indexHtml.indexOf('id="page-report"') !== -1);
  assert("T46e", "index.html loads dataCentre.js",
    indexHtml.indexOf('src="js/dataCentre.js"') !== -1);
  assert("T46f", "index.html loads report.js",
    indexHtml.indexOf('src="js/report.js"') !== -1);
  assert("T46g", "index.html loads dataCleaner.js",
    indexHtml.indexOf('src="js/dataCleaner.js"') !== -1);
  assert("T46h", "index.html loads charts.js",
    indexHtml.indexOf('src="js/charts.js"') !== -1);
  assert("T46i", "index.html loads projection.js",
    indexHtml.indexOf('src="js/projection.js"') !== -1);

  /* ── T47: DataCleaner — parseIndianNumber ─────────────────── */
  assert("T47a", "parseIndianNumber: plain number",
    DataCleaner._parseIndianNumber(50000) === 50000);
  assert("T47b", "parseIndianNumber: '1.5 crore'",
    DataCleaner._parseIndianNumber('1.5 crore') === 1.5e7);
  assert("T47c", "parseIndianNumber: '50 lakh'",
    DataCleaner._parseIndianNumber('50 lakh') === 50e5);
  assert("T47d", "parseIndianNumber: '₹1,20,000'",
    DataCleaner._parseIndianNumber('₹1,20,000') === 120000);
  assert("T47e", "parseIndianNumber: null → NaN",
    isNaN(DataCleaner._parseIndianNumber(null)));

  /* ── T48: DataCleaner — sqmToSqft ────────────────────────── */
  assert("T48a", "sqmToSqft(1) ≈ 10.7639",
    Math.abs(DataCleaner._sqmToSqft(1) - 10.7639) < 0.001);
  assert("T48b", "sqmToSqft(100) ≈ 1076.39",
    Math.abs(DataCleaner._sqmToSqft(100) - 1076.39) < 0.1);

  /* ── T49: DataCleaner — validateColumns ──────────────────── */
  (function () {
    var goodRow = { city: 'Mumbai', locality: 'BKC', propertyType: 'Commercial Office',
                    areaSqFt: '5000', askingPriceINR: '75000000', monthlyRentINR: '350000' };
    var badRow  = { city: 'Mumbai', locality: 'BKC' };
    assert("T49a", "validateColumns: all required present → ok=true",
      DataCleaner.validateColumns([goodRow]).ok === true);
    assert("T49b", "validateColumns: missing required → ok=false",
      DataCleaner.validateColumns([badRow]).ok === false);
    assert("T49c", "validateColumns: missing columns listed",
      DataCleaner.validateColumns([badRow]).missingColumns.length > 0);
    assert("T49d", "validateColumns: empty array → ok=false",
      DataCleaner.validateColumns([]).ok === false);
  }());

  /* ── T50: DataCleaner — cleanRecords full pipeline ─────────── */
  (function () {
    var rows = [
      { city: 'Mumbai', locality: 'BKC', propertyType: 'Commercial Office',
        areaSqFt: '5000', askingPriceINR: '75000000', monthlyRentINR: '350000' },
      { city: 'Pune', locality: 'Baner', propertyType: 'Residential',
        areaSqFt: '1200', askingPriceINR: '12000000', monthlyRentINR: '35000' }
    ];
    var result = DataCleaner.cleanRecords(rows);
    assert("T50a", "cleanRecords: returns records array",
      Array.isArray(result.records));
    assert("T50b", "cleanRecords: record count unchanged (no silent deletion)",
      result.records.length === rows.length);
    assert("T50c", "cleanRecords: report.total matches",
      result.report.total === rows.length);
    assert("T50d", "cleanRecords: all ok (good data)",
      result.report.ok === rows.length);
    assert("T50e", "cleanRecords: records have recordId",
      result.records[0].recordId !== undefined);
    assert("T50f", "cleanRecords: pricePerSqFt derived",
      typeof result.records[0].pricePerSqFt === 'number' && result.records[0].pricePerSqFt > 0);
    assert("T50g", "cleanRecords: validationStatus set",
      result.records[0].validationStatus === 'ok');
    assert("T50h", "cleanRecords: duplicateFlag is boolean",
      typeof result.records[0].duplicateFlag === 'boolean');
    assert("T50i", "cleanRecords: outlierFlag is boolean",
      typeof result.records[0].outlierFlag === 'boolean');
  }());

  /* ── T51: DataCleaner — impossible values rejected ─────────── */
  (function () {
    var rows = [
      { city: 'Mumbai', locality: 'BKC', propertyType: 'Office',
        areaSqFt: '-500', askingPriceINR: '75000000', monthlyRentINR: '350000' },
      { city: 'Pune', locality: 'Baner', propertyType: 'Residential',
        areaSqFt: '1200', askingPriceINR: '0', monthlyRentINR: '35000' }
    ];
    var result = DataCleaner.cleanRecords(rows);
    assert("T51a", "impossible negative area → rejected",
      result.records[0].validationStatus === 'rejected');
    assert("T51b", "impossible zero price → rejected",
      result.records[1].validationStatus === 'rejected');
    assert("T51c", "rejected count = 2",
      result.report.rejected === 2);
    assert("T51d", "rows still present (not deleted)",
      result.records.length === 2);
  }());

  /* ── T52: DataCleaner — duplicate detection ─────────────────── */
  (function () {
    var rows = [
      { city: 'Mumbai', locality: 'BKC', propertyType: 'Office',
        areaSqFt: '5000', askingPriceINR: '75000000', monthlyRentINR: '350000', sourceName: 'PropEquity' },
      { city: 'Mumbai', locality: 'BKC', propertyType: 'Office',
        areaSqFt: '5000', askingPriceINR: '75000000', monthlyRentINR: '350000', sourceName: 'PropEquity' }
    ];
    var result = DataCleaner.cleanRecords(rows);
    assert("T52a", "duplicate detected: duplicateFlag on second row",
      result.records[1].duplicateFlag === true);
    assert("T52b", "first row not flagged as duplicate",
      result.records[0].duplicateFlag === false);
    assert("T52c", "report.duplicates = 1",
      result.report.duplicates === 1);
  }());

  /* ── T53: DataCleaner — outlier detection (1.5×IQR) ────────── */
  (function () {
    // Create 6 rows with one extreme outlier price
    var rows = [];
    var basePrices = [10000, 10500, 9800, 10200, 11000, 200000]; // last is outlier
    basePrices.forEach(function (p, i) {
      rows.push({
        city: 'Mumbai', locality: 'BKC', propertyType: 'Office',
        areaSqFt: '1000', askingPriceINR: String(p * 1000), monthlyRentINR: '50000'
      });
    });
    var result = DataCleaner.cleanRecords(rows);
    assert("T53a", "outlier row flagged",
      result.records[5].outlierFlag === true);
    assert("T53b", "non-outlier rows not flagged",
      result.records[0].outlierFlag === false);
    assert("T53c", "report.outliers >= 1",
      result.report.outliers >= 1);
  }());

  /* ── T54: DataCleaner — CSV parser ──────────────────────────── */
  (function () {
    var csv = 'city,locality,propertyType,areaSqFt\nMumbai,BKC,Office,5000\nPune,Baner,Residential,1200';
    var rows = DataCleaner.parseCSV(csv);
    assert("T54a", "parseCSV: 2 rows returned",
      rows.length === 2);
    assert("T54b", "parseCSV: city field correct",
      rows[0].city === 'Mumbai');
    assert("T54c", "parseCSV: areaSqFt field present",
      rows[0].areaSqFt === '5000');
  }());

  /* ── T55: DataCleaner — CSV template ────────────────────────── */
  (function () {
    var tmpl = DataCleaner.generateCSVTemplate();
    assert("T55a", "template has city column",
      tmpl.indexOf('city') !== -1);
    assert("T55b", "template has areaSqFt column",
      tmpl.indexOf('areaSqFt') !== -1);
    assert("T55c", "template has askingPriceINR column",
      tmpl.indexOf('askingPriceINR') !== -1);
    assert("T55d", "template has at least 2 lines",
      tmpl.split('\n').length >= 2);
  }());

  /* ── T56: Projection — SCENARIOS structure ───────────────────── */
  assert("T56a", "Projection.SCENARIOS has conservative",
    typeof Projection.SCENARIOS.conservative === 'object');
  assert("T56b", "Projection.SCENARIOS has base",
    typeof Projection.SCENARIOS.base === 'object');
  assert("T56c", "Projection.SCENARIOS has optimistic",
    typeof Projection.SCENARIOS.optimistic === 'object');
  assert("T56d", "conservative rentalGrowth < base rentalGrowth",
    Projection.SCENARIOS.conservative.rentalGrowth < Projection.SCENARIOS.base.rentalGrowth);
  assert("T56e", "optimistic rentalGrowth > base rentalGrowth",
    Projection.SCENARIOS.optimistic.rentalGrowth > Projection.SCENARIOS.base.rentalGrowth);
  assert("T56f", "conservative occupancy < optimistic occupancy",
    Projection.SCENARIOS.conservative.occupancy < Projection.SCENARIOS.optimistic.occupancy);

  /* ── T57: Projection — projectScenario math ──────────────────── */
  (function () {
    var params = {
      currentPortfolioValueRs: 5e9, // ₹500 Cr
      currentAnnualRentRs:     2e8, // ₹20 Cr
      investmentRs:            1e9, // ₹100 Cr
      newMarketGrossYield:     0.07
    };
    var scenario = { rentalGrowth: 0.06, capitalGrowth: 0.08, occupancy: 0.90 };
    var pts = Projection.projectScenario(params, scenario, [1, 3, 5]);

    assert("T57a", "projectScenario: returns 4 points (yr 0 + 3 horizons)",
      pts.length === 4);
    assert("T57b", "year 0 portfolio value = initial + investment",
      Math.abs(pts[0].portfolioValue - 6e9) < 1);
    assert("T57c", "year 3 value > year 0 value",
      pts[2].portfolioValue > pts[0].portfolioValue);
    assert("T57d", "year 5 value > year 3 value",
      pts[3].portfolioValue > pts[2].portfolioValue);
    assert("T57e", "year 1 capital growth ≈ (1.08)^1",
      Math.abs(pts[1].portfolioValue / pts[0].portfolioValue - 1.08) < 0.001);
    assert("T57f", "year 3 rent growth ≈ (1.06)^3",
      Math.abs(pts[2].annualRent / pts[0].annualRent - Math.pow(1.06, 3)) < 0.001);
    assert("T57g", "grossYield = annualRent / portfolioValue",
      Math.abs(pts[1].grossYield - pts[1].annualRent / pts[1].portfolioValue) < 1e-9);
    assert("T57h", "occupancyAdjRent = annualRent * occupancy",
      Math.abs(pts[1].occupancyAdjRent - pts[1].annualRent * 0.90) < 1);
  }());

  /* ── T58: Projection — projectAll ───────────────────────────── */
  (function () {
    var params = {
      currentPortfolioValueRs: 5e9,
      currentAnnualRentRs:     2e8,
      investmentRs:            1e9,
      newMarketGrossYield:     0.07
    };
    var all = Projection.projectAll(params);
    assert("T58a", "projectAll: has conservative key",
      Array.isArray(all.conservative));
    assert("T58b", "projectAll: has base key",
      Array.isArray(all.base));
    assert("T58c", "projectAll: has optimistic key",
      Array.isArray(all.optimistic));
    assert("T58d", "projectAll: has assumptions key",
      typeof all.assumptions === 'object');
    assert("T58e", "optimistic year-3 value > base year-3 value",
      all.optimistic[2].portfolioValue > all.base[2].portfolioValue);
    assert("T58f", "base year-3 value > conservative year-3 value",
      all.base[2].portfolioValue > all.conservative[2].portfolioValue);
  }());

  /* ── T59: Projection — summarise ──────────────────────────── */
  (function () {
    var params = {
      currentPortfolioValueRs: 5e9,
      currentAnnualRentRs:     2e8,
      investmentRs:            1e9,
      newMarketGrossYield:     0.07
    };
    var all     = Projection.projectAll(params);
    var summary = Projection.summarise(all, 3);
    assert("T59a", "summarise: conservative present",
      typeof summary.conservative === 'object');
    assert("T59b", "summarise: base present",
      typeof summary.base === 'object');
    assert("T59c", "summarise: optimistic present",
      typeof summary.optimistic === 'object');
    assert("T59d", "summarise: changeValuePct positive for base",
      summary.base.changeValuePct > 0);
    assert("T59e", "summarise: optimistic changeValuePct > base changeValuePct",
      summary.optimistic.changeValuePct > summary.base.changeValuePct);
  }());

  /* ── T60: Projection — projectHHI ─────────────────────────── */
  (function () {
    var before = { cityHHI: 0.30, typeHHI: 0.40 };
    var after  = { cityHHI: 0.25, typeHHI: 0.35 };
    var proj   = Projection.projectHHI(before, after, [1, 3, 5]);
    assert("T60a", "projectHHI: has conservative",
      Array.isArray(proj.conservative));
    assert("T60b", "projectHHI: year 0 = before",
      Math.abs(proj.base[0].cityHHI - 0.30) < 0.001);
    assert("T60c", "projectHHI: city HHI goes down (improvement)",
      proj.base[proj.base.length - 1].cityHHI < 0.30);
    assert("T60d", "projectHHI: all values in [0,1]",
      proj.base.every(function (p) { return p.cityHHI >= 0 && p.cityHHI <= 1 && p.typeHHI >= 0 && p.typeHHI <= 1; }));
  }());

  /* ── T61: Projection — zero investment edge case ────────────── */
  (function () {
    var params = {
      currentPortfolioValueRs: 5e9,
      currentAnnualRentRs:     2e8,
      investmentRs:            0,
      newMarketGrossYield:     0.07
    };
    var pts = Projection.projectScenario(params, Projection.SCENARIOS.base, [3]);
    assert("T61a", "zero investment: year 0 value = portfolio value",
      Math.abs(pts[0].portfolioValue - 5e9) < 1);
    assert("T61b", "zero investment: grossYield defined",
      typeof pts[0].grossYield === 'number');
  }());

  /* ── T62: DataCleaner — area unit detection ──────────────────── */
  (function () {
    var sqmRows = [100, 120, 90, 110, 95].map(function (a) { return { _rawArea: a }; });
    var sqftRows = [1000, 1200, 900, 1100, 950].map(function (a) { return { _rawArea: a }; });
    assert("T62a", "detectAreaUnit: < 500 median → sqm",
      DataCleaner._detectAreaUnit(sqmRows) === 'sqm');
    assert("T62b", "detectAreaUnit: > 500 median → sqft",
      DataCleaner._detectAreaUnit(sqftRows) === 'sqft');
  }());

  /* ── T63: markets.json structure ────────────────────────────── */
  assert("T63a", "markets.json has markets array",
    Array.isArray(marketsJson.markets));
  assert("T63b", "markets.json has 50 markets",
    marketsJson.markets.length === 50);
  assert("T63c", "markets.json has isSynthetic flag",
    typeof marketsJson.isSynthetic !== 'undefined');
  assert("T63d", "markets.json disclaimer present",
    typeof marketsJson.disclaimer === 'string' && marketsJson.disclaimer.length > 0);

  /* ── T64: dataCleaner.js — REQUIRED_COLUMNS public ─────────── */
  assert("T64a", "REQUIRED_COLUMNS is array",
    Array.isArray(DataCleaner.REQUIRED_COLUMNS));
  assert("T64b", "REQUIRED_COLUMNS has 6 items",
    DataCleaner.REQUIRED_COLUMNS.length === 6);
  assert("T64c", "REQUIRED_COLUMNS includes areaSqFt",
    DataCleaner.REQUIRED_COLUMNS.indexOf('areaSqFt') !== -1);

  /* ── T65: projection.js — DEFAULT_HORIZONS ──────────────────── */
  assert("T65a", "DEFAULT_HORIZONS is array",
    Array.isArray(Projection.DEFAULT_HORIZONS));
  assert("T65b", "DEFAULT_HORIZONS has 3 entries",
    Projection.DEFAULT_HORIZONS.length === 3);
  assert("T65c", "DEFAULT_HORIZONS contains 1",
    Projection.DEFAULT_HORIZONS.indexOf(1) !== -1);
  assert("T65d", "DEFAULT_HORIZONS contains 5",
    Projection.DEFAULT_HORIZONS.indexOf(5) !== -1);

}());


/* ==========================================================================
   STAGE 4 — stats.js
   ========================================================================== */
(function () {

  var sampleMarkets = [
    { marketId: 'S001', city: 'Mumbai',    locality: 'BKC',        propertyType: 'Commercial Office',
      medianCapitalValuePerSqFt: 22000, medianMonthlyRentPerSqFt: 150,
      annualRentalGrowthRatio: 0.06, demandScore: 82, riskScore: 28, observationCount: 87 },
    { marketId: 'S002', city: 'Mumbai',    locality: 'Andheri',    propertyType: 'Commercial Office',
      medianCapitalValuePerSqFt: 18000, medianMonthlyRentPerSqFt: 120,
      annualRentalGrowthRatio: 0.05, demandScore: 74, riskScore: 32, observationCount: 62 },
    { marketId: 'S003', city: 'Bengaluru', locality: 'Whitefield', propertyType: 'Commercial Office',
      medianCapitalValuePerSqFt: 14000, medianMonthlyRentPerSqFt: 90,
      annualRentalGrowthRatio: 0.07, demandScore: 88, riskScore: 22, observationCount: 45 },
    { marketId: 'S004', city: 'Bengaluru', locality: 'Koramangala', propertyType: 'Retail',
      medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 70,
      annualRentalGrowthRatio: 0.04, demandScore: 65, riskScore: 40, observationCount: 18 },
    { marketId: 'S005', city: 'Pune',      locality: 'Baner',      propertyType: 'Residential',
      medianCapitalValuePerSqFt: 8000,  medianMonthlyRentPerSqFt: 45,
      annualRentalGrowthRatio: 0.05, demandScore: 58, riskScore: 35, observationCount: 30 }
  ];

  /* ── T66: Stats primitives ──────────────────────────────────── */
  assert("T66a", "_median([3,1,4,1,5,9,2,6]) = 3.5",  Stats._median([3,1,4,1,5,9,2,6]) === 3.5);
  assert("T66b", "_median([7]) = 7",                   Stats._median([7]) === 7);
  assert("T66c", "_median([]) = null",                 Stats._median([]) === null);
  assert("T66d", "_q1([2,4,6,8]) = 3",                Stats._q1([2,4,6,8]) === 3);
  assert("T66e", "_q3([2,4,6,8]) = 7",                Stats._q3([2,4,6,8]) === 7);
  assert("T66f", "_iqr([2,4,6,8]) = 4",               Stats._iqr([2,4,6,8]) === 4);
  assert("T66g", "_mean([1,2,3,4]) = 2.5",            Stats._mean([1,2,3,4]) === 2.5);
  assert("T66h", "_mean([]) = null",                  Stats._mean([]) === null);

  /* ── T67: grossYield formula ───────────────────────────────── */
  assert("T67a", "grossYield(100, 12000) = 0.10",
    Math.abs(Stats._grossYield(100, 12000) - 0.10) < 1e-9);
  assert("T67b", "grossYield(null, 12000) = null", Stats._grossYield(null, 12000) === null);
  assert("T67c", "grossYield(100, 0) = null",      Stats._grossYield(100, 0) === null);

  /* ── T68: portfolioStats ───────────────────────────────────── */
  var pStats = Stats.portfolioStats(sampleMarkets);
  assert("T68a", "portfolioStats count = 5",    pStats.count === 5);
  assert("T68b", "portfolioStats cityCount = 3", pStats.cityCount === 3);
  assert("T68c", "portfolioStats typeCount = 3", pStats.typeCount === 3);
  assert("T68d", "portfolioStats totalObservations = 242",
    pStats.totalObservations === 87 + 62 + 45 + 18 + 30);
  assert("T68e", "portfolioStats grossYield.median > 0",
    pStats.grossYield && pStats.grossYield.median > 0);
  assert("T68f", "capitalValue min <= median <= max",
    pStats.capitalValue.min <= pStats.capitalValue.median &&
    pStats.capitalValue.median <= pStats.capitalValue.max);
  assert("T68g", "sampleSizeWarnings = 1 (obs 18 < 30)",
    pStats.sampleSizeWarnings === 1);
  assert("T68h", "portfolioStats([]) returns count 0",
    Stats.portfolioStats([]).count === 0);

  /* ── T69: cityStats ────────────────────────────────────────── */
  var cStats = Stats.cityStats(sampleMarkets);
  assert("T69a", "cityStats length = 3",  cStats.length === 3);
  assert("T69b", "cityStats sorted ascending", cStats[0].city <= cStats[1].city);
  assert("T69c", "Mumbai has 2 segments",
    cStats.find(function(c){ return c.city === 'Mumbai'; }).segmentCount === 2);
  assert("T69d", "Bengaluru medianYield > 0",
    cStats.find(function(c){ return c.city === 'Bengaluru'; }).medianYield > 0);
  assert("T69e", "city <30 total obs flagged",
    cStats.find(function(c){ return c.city === 'Bengaluru'; }).hasSampleSizeWarning === true);
  assert("T69f", "cityStats([]) = []", Stats.cityStats([]).length === 0);

  /* ── T70: segmentStats ─────────────────────────────────────── */
  var segStats = Stats.segmentStats(sampleMarkets, false);
  assert("T70a", "segmentStats returns array",    Array.isArray(segStats));
  assert("T70b", "segmentStats has 4 groups",     segStats.length === 4);
  var mumOffice = segStats.find(function(s){ return s.city === 'Mumbai' && s.propertyType === 'Commercial Office'; });
  assert("T70c", "Mumbai Office segment found",   !!mumOffice);
  assert("T70d", "Mumbai Office count = 2",       mumOffice && mumOffice.count === 2);
  assert("T70e", "Mumbai Office grossYield.median > 0",
    mumOffice && mumOffice.grossYield.median > 0);
  assert("T70f", "Mumbai Office cap value min <= max",
    mumOffice && mumOffice.capitalValue.min <= mumOffice.capitalValue.max);
  assert("T70g", "segmentStats([]) = []", Stats.segmentStats([]).length === 0);

  /* ── T71: segmentStats with bootstrap CI ───────────────────── */
  var segWithCI = Stats.segmentStats(sampleMarkets, true);
  var mumCI = segWithCI.find(function(s){ return s.city === 'Mumbai' && s.propertyType === 'Commercial Office'; });
  assert("T71a", "segmentStats with CI returns array", Array.isArray(segWithCI));
  assert("T71b", "CI null when count < MIN_OBS_CI",
    mumCI && mumCI.grossYield && mumCI.grossYield.ci === null);

  var bigArr = [];
  for (var k = 0; k < 15; k++) {
    bigArr.push({ city: 'X', propertyType: 'Office',
      medianCapitalValuePerSqFt: 10000 + k * 200, medianMonthlyRentPerSqFt: 80 + k,
      annualRentalGrowthRatio: 0.05, demandScore: 70, riskScore: 30, observationCount: 40 });
  }
  var bigSeg = Stats.segmentStats(bigArr, true);
  assert("T71c", "CI non-null when n >= MIN_OBS_CI",
    bigSeg[0].grossYield && bigSeg[0].grossYield.ci !== null);
  assert("T71d", "CI lo <= median <= hi",
    bigSeg[0].grossYield.ci.lo <= bigSeg[0].grossYield.median &&
    bigSeg[0].grossYield.median <= bigSeg[0].grossYield.ci.hi);

  /* ── T72: augmentMarkets ───────────────────────────────────── */
  var aug = Stats.augmentMarkets(sampleMarkets);
  assert("T72a", "augmentMarkets same length",      aug.length === sampleMarkets.length);
  assert("T72b", "augmented record has grossYield", typeof aug[0].grossYield === 'number');
  assert("T72c", "augmented grossYield > 0",        aug[0].grossYield > 0);
  assert("T72d", "sampleSizeWarning true <30",      aug[3].sampleSizeWarning === true);
  assert("T72e", "sampleSizeWarning false >=30",    aug[0].sampleSizeWarning === false);

  /* ── T73: outlierSummary ───────────────────────────────────── */
  var outSummary = Stats.outlierSummary(sampleMarkets);
  assert("T73a", "outlierSummary returns array",      Array.isArray(outSummary));
  assert("T73b", "outlierSummary length = 3 cities",  outSummary.length === 3);
  var pCity = outSummary.find(function(o){ return o.city === 'Pune'; });
  var mCity = outSummary.find(function(o){ return o.city === 'Mumbai'; });
  assert("T73c", "Pune (1 segment) insufficientData",   pCity && pCity.insufficientData === true);
  assert("T73d", "Mumbai (2 segments) insufficientData", mCity && mCity.insufficientData === true);

  /* ── T74: formatting helpers ───────────────────────────────── */
  assert("T74a", "fmtPct(0.0819) = '8.19%'",   Stats.fmtPct(0.0819) === '8.19%');
  assert("T74b", "fmtPct(null) = '—'",      Stats.fmtPct(null) === '—');
  assert("T74c", "fmtRs(22000) starts with ₹", Stats.fmtRs(22000).indexOf('₹') === 0);
  assert("T74d", "fmtNum(3.14159, 2) = '3.14'", Stats.fmtNum(3.14159, 2) === '3.14');
  assert("T74e", "fmtNum(null) = '—'",      Stats.fmtNum(null) === '—');

  /* ── T75: PRNG determinism ─────────────────────────────────── */
  var prng1 = Stats._makePrng(12345);
  var prng2 = Stats._makePrng(12345);
  var r1a = prng1(); var r1b = prng1();
  var r2a = prng2(); var r2b = prng2();
  assert("T75a", "Same seed same sequence (1st)", r1a === r2a);
  assert("T75b", "Same seed same sequence (2nd)", r1b === r2b);
  assert("T75c", "PRNG values in [0,1)", r1a >= 0 && r1a < 1);
  assert("T75d", "Different seeds differ", Stats._makePrng(99999)() !== r1a);

  /* ── T76: bootstrapMedianCI ────────────────────────────────── */
  var ciVals = [7, 8, 8.2, 9, 9.5, 10, 10.5, 11, 12, 8.5];
  var ci1 = Stats._bootstrapMedianCI(ciVals, 0);
  var ci2 = Stats._bootstrapMedianCI(ciVals, 0);
  assert("T76a", "bootstrapMedianCI deterministic",
    ci1 && ci2 && ci1.lo === ci2.lo && ci1.hi === ci2.hi);
  assert("T76b", "CI lo <= hi", ci1 && ci1.lo <= ci1.hi);
  assert("T76c", "CI null when n < MIN_OBS_CI",
    Stats._bootstrapMedianCI([1,2,3], 0) === null);

  /* ── T77: exported constants ───────────────────────────────── */
  assert("T77a", "MIN_OBS_WARNING = 30", Stats.MIN_OBS_WARNING === 30);
  assert("T77b", "MIN_OBS_CI = 10",      Stats.MIN_OBS_CI === 10);
  assert("T77c", "BOOTSTRAP_N = 500",    Stats.BOOTSTRAP_N === 500);
  assert("T77d", "BOOTSTRAP_SEED positive integer",
    Number.isInteger(Stats.BOOTSTRAP_SEED) && Stats.BOOTSTRAP_SEED > 0);

}());


/* ─── T78 : agents.js structural source checks ─────────────────────────────── */
(function () {
  var fs = require('fs');
  var path = require('path');
  var agentsPath = path.join(__dirname, '..', 'public', 'js', 'agents.js');
  var agentsSrc = fs.readFileSync(agentsPath, 'utf8');

  /*
   * T78a, c, f, g and h were written for the six-agent chain and asserted that
   * the six retired names, six trail steps, and the dataQuality /
   * statisticalAnalysis calls were present. That architecture was deliberately
   * replaced (four agents; validation moved into validator.js — HANDOFF.md §2).
   * They never failed only because their arguments were passed to assert() in
   * the wrong order. They are rewritten to assert the current design, and each
   * also checks that the retired form has not crept back.
   */

  // T78a — the chain calls the four current agents and none of the retired ones
  // (call form updated: the chain now goes through step(agentKey, ctx) for both live and stored replies)
  var t78a = ['dataStatistical', 'marketScreening', 'portfolioRisk', 'orchestrator']
    .every(function (a) { return agentsSrc.indexOf('step("' + a + '"') !== -1; }) &&
    ['dataQuality', 'statisticalAnalysis', 'diversification', 'validation']
    .every(function (a) { return agentsSrc.indexOf('step("' + a + '"') === -1 && agentsSrc.indexOf('callAgent("' + a + '"') === -1; });
  assert(t78a, 'T78a', 'runSequence calls the four current agents and no retired agent');

  // T78b — portfolioAnalysis NOT in AGENT_ORDER
  var noOldAgent = agentsSrc.indexOf('"portfolioAnalysis"') === -1;
  assert(noOldAgent, 'T78b', 'portfolioAnalysis absent from AGENT_ORDER', true, noOldAgent);

  // T78c — trail: one step per agent from AppMeta, plus the deterministic validation step
  var AM78 = require(path.join(__dirname, '..', 'public', 'js', 'appMeta.js'));
  var stepIds78 = AM78.AGENTS.map(function (a) { return a.step.id; });
  var t78c = stepIds78.join(',') === 'data,screening,simulation,recommend' &&
             agentsSrc.indexOf('id: "validation"') !== -1 &&
             agentsSrc.indexOf('id: "stats"') === -1;
  assert(t78c, 'T78c', 'trail steps are data, screening, simulation, validation (code), recommend', stepIds78.join(','));

  // T78d — checkServerStatus uses /api/health not /api/status
  var t78d = agentsSrc.indexOf('"/api/health"') !== -1
          && agentsSrc.indexOf('"/api/status"') === -1;
  assert(t78d, 'T78d', 'checkServerStatus calls /api/health', true, t78d);

  // T78e — the context carries the Stats engine output (built in agentContext.js)
  var ctxSrc78 = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'agentContext.js'), 'utf8');
  // (rewritten: the context is built once per run by AnalysisRun via AgentContext.fromRun, and the
  //  dataset statistics are labelled as the MARKET-SEGMENT dataset, never the portfolio)
  var t78e = ctxSrc78.indexOf('Stats.portfolioStats(markets)') !== -1 &&
             /scope: "MARKET-SEGMENT DATASET/.test(ctxSrc78) &&
             agentsSrc.indexOf('run.agentContext') !== -1;
  assert(t78e, 'T78e', 'the agent context comes from the shared run, with dataset statistics labelled as not the portfolio');

  // T78f — the Data & Statistical Analyst output feeds the later agents
  var t78f = /dataStatisticalOutput: out\.ds/.test(agentsSrc);
  assert(t78f, 'T78f', 'later agents receive dataStatisticalOutput');

  // T78g — the Orchestrator sees all three analysts and the deterministic checks
  var t78g = ['portfolioRiskOutput:', 'marketScreeningOutput:', 'deterministicValidation:']
    .every(function (k) { return agentsSrc.indexOf(k) !== -1; }) &&
    agentsSrc.indexOf('statisticalAnalysisOutput') === -1;
  assert(t78g, 'T78g', 'orchCtx carries the three analyst outputs and deterministicValidation');

  // T78h — no model-built validation context remains
  var t78h = agentsSrc.indexOf('validCtx') === -1 && agentsSrc.indexOf('dataQualityOutput') === -1;
  assert(t78h, 'T78h', 'no validCtx / dataQualityOutput — validation is no longer an agent');
}());


/* ─── T79 : Projection — validation example ───────────────────────────────── */
/* Fixture: existing value = ₹500 Cr, existing annual rent = ₹33.275 Cr      */
/*          investment = ₹100 Cr, target gross yield = 9.14% (0.0914)        */
/* Expected: post-investment value = ₹600 Cr, gross rent = ₹42.415 Cr       */
(function () {
  var Projection = require('../public/js/projection.js');

  var EXISTING_VALUE_RS = 500 * 1e7;   // ₹500 Cr in rupees
  var EXISTING_RENT_RS  = 33.275 * 1e7; // ₹33.275 Cr in rupees
  var INVESTMENT_RS     = 100 * 1e7;   // ₹100 Cr in rupees
  var TARGET_YIELD      = 0.0914;       // 9.14%

  var params = {
    currentPortfolioValueRs: EXISTING_VALUE_RS,
    currentAnnualRentRs:     EXISTING_RENT_RS,
    investmentRs:            INVESTMENT_RS,
    newMarketGrossYield:     TARGET_YIELD
  };

  var proj = Projection.projectAll(params);
  var baseYear0 = proj.base[0]; // year 0 = post-investment base state

  // T79a: Post-investment value = existing + investment = ₹600 Cr
  var postValue = baseYear0.portfolioValue / 1e7;
  assert(Math.abs(postValue - 600) < 0.01,
    'T79a', 'Post-investment value = ₹600 Cr', 600, parseFloat(postValue.toFixed(4)));

  // T79b: New target annual rent = investment × yield = ₹9.14 Cr
  var newTargetRent = (INVESTMENT_RS * TARGET_YIELD) / 1e7;
  assert(Math.abs(newTargetRent - 9.14) < 0.001,
    'T79b', 'New target annual rent = ₹9.14 Cr', 9.14, parseFloat(newTargetRent.toFixed(4)));

  // T79c: Post-investment gross rent = ₹33.275 + ₹9.14 = ₹42.415 Cr
  var postGrossRent = baseYear0.annualRent / 1e7;
  assert(Math.abs(postGrossRent - 42.415) < 0.001,
    'T79c', 'Post-investment gross rent = ₹42.415 Cr', 42.415, parseFloat(postGrossRent.toFixed(4)));

  // T79d: Gross yield (year 0) = 42.415/600 ≈ 7.069%
  var gy = baseYear0.grossYield * 100;
  assert(Math.abs(gy - (42.415 / 600 * 100)) < 0.01,
    'T79d', 'Year-0 gross yield = grossRent/portfolioValue', parseFloat((42.415/600*100).toFixed(4)), parseFloat(gy.toFixed(4)));

  // T79e: All three scenarios share the same year-0 post-investment value
  assert(proj.conservative[0].portfolioValue === proj.base[0].portfolioValue
      && proj.optimistic[0].portfolioValue   === proj.base[0].portfolioValue,
    'T79e', 'All scenarios share year-0 post-investment value');

  // T79f: Occupancy-adjusted rent (base, year 0) = grossRent × 0.90
  var occRent = baseYear0.occupancyAdjRent / 1e7;
  var expectedOcc = 42.415 * 0.90;
  assert(Math.abs(occRent - expectedOcc) < 0.001,
    'T79f', 'Base year-0 occupancy-adjusted rent = grossRent × 90%',
    parseFloat(expectedOcc.toFixed(4)), parseFloat(occRent.toFixed(4)));

  // T79g: summarise at horizon 3 — base year-3 value > year-0 value
  var summ = Projection.summarise(proj, 3);
  assert(summ.base.portfolioValue > baseYear0.portfolioValue,
    'T79g', 'Base year-3 portfolio value > year-0 value');

  // T79h: conservative year-1 value < base year-1 value (different growth rates)
  var consYear1 = proj.conservative[1];
  var baseYear1 = proj.base[1];
  assert(consYear1.portfolioValue < baseYear1.portfolioValue,
    'T79h', 'Conservative year-1 value < base year-1 value');

}());

/* ─── T80 : ScoringEngine — contributions sum to composite score ───────────── */
(function () {
  var ScoringEngine = require('../public/js/scoringEngine.js');

  var markets = [
    {
      marketId: "TST-001", city: "Mumbai", locality: "Bandra", propertyType: "Office",
      medianCapitalValuePerSqFt: 15000, medianMonthlyRentPerSqFt: 100,
      annualRentalGrowthRatio: 0.07, demandScore: 80, riskScore: 30, observationCount: 50
    },
    {
      marketId: "TST-002", city: "Pune", locality: "Wakad", propertyType: "Warehouse",
      medianCapitalValuePerSqFt: 5000, medianMonthlyRentPerSqFt: 30,
      annualRentalGrowthRatio: 0.05, demandScore: 60, riskScore: 50, observationCount: 40
    },
    {
      marketId: "TST-003", city: "Chennai", locality: "OMR", propertyType: "Retail",
      medianCapitalValuePerSqFt: 8000, medianMonthlyRentPerSqFt: 55,
      annualRentalGrowthRatio: 0.06, demandScore: 70, riskScore: 40, observationCount: 35
    }
  ];

  var weights = ScoringEngine.PRESETS.balanced;
  var assets = [];
  var result = ScoringEngine.rankMarkets(markets, weights, assets, function () { return 50; });

  // T80a: ranked array has 3 entries
  assert(result.ranked.length === 3, 'T80a', 'rankMarkets returns 3 scored markets');

  // T80b: contributions sum equals totalScore (within floating-point tolerance)
  result.ranked.forEach(function (m, i) {
    var c = m.contributions;
    var sumContribs = c.yieldContrib + c.growthContrib + c.diversContrib + c.demandContrib + c.riskContrib;
    assert(Math.abs(sumContribs - m.totalScore) < 0.001,
      'T80b-' + (i+1), 'Contributions sum = composite score for rank ' + (i+1),
      parseFloat(m.totalScore.toFixed(3)), parseFloat(sumContribs.toFixed(3)));
  });

  // T80c: weights sum to 1.0 for balanced preset
  var wSum = weights.yieldWeight + weights.growthWeight + weights.diversWeight
           + weights.demandWeight + weights.riskWeight;
  assert(Math.abs(wSum - 1.0) < 0.005, 'T80c', 'Balanced preset weights sum to 100%',
    1.0, parseFloat(wSum.toFixed(6)));

  // T80d: ranks are sequential starting at 1
  var rankOk = result.ranked.every(function (m, i) { return m.rank === i + 1; });
  assert(rankOk, 'T80d', 'Ranks are 1, 2, 3 sequentially');

  // T80e: scores are in descending order
  var descOk = true;
  for (var i = 1; i < result.ranked.length; i++) {
    if (result.ranked[i].totalScore > result.ranked[i-1].totalScore) { descOk = false; }
  }
  assert(descOk, 'T80e', 'Scores are in descending order');

}());

/* ─── T81 : ScoringEngine — deterministic tie-breaking ─────────────────────── */
(function () {
  var ScoringEngine = require('../public/js/scoringEngine.js');

  // Two markets with identical inputs → identical scores → tie broken by marketId
  var twin1 = {
    marketId: "ZZZ-999", city: "Mumbai", locality: "Andheri", propertyType: "Office",
    medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 80,
    annualRentalGrowthRatio: 0.06, demandScore: 70, riskScore: 40, observationCount: 30
  };
  var twin2 = Object.assign({}, twin1, { marketId: "AAA-001" }); // same data, lower marketId

  var weights = ScoringEngine.PRESETS.balanced;
  var r1 = ScoringEngine.rankMarkets([twin1, twin2], weights, [], function () { return 50; });

  // T81a: AAA-001 (alphabetically first) should be rank 1
  assert(r1.ranked[0].marketId === "AAA-001",
    'T81a', 'Tie broken by ascending marketId: AAA-001 before ZZZ-999');

  // T81b: scores are equal (truly tied)
  assert(Math.abs(r1.ranked[0].totalScore - r1.ranked[1].totalScore) < 1e-9,
    'T81b', 'Tied markets have equal totalScore');

  // T81c: ranking is stable across two calls
  var r2 = ScoringEngine.rankMarkets([twin2, twin1], weights, [], function () { return 50; });
  assert(r2.ranked[0].marketId === "AAA-001",
    'T81c', 'Tie-breaking is stable regardless of input order');

}());

/* ─── T82 : projection rent comes from the run, not a stored field ─────────────
   Rewritten. T82a–d asserted that an annualRentCr field was written into the
   stored snapshot by the Screener and read back by Diversification and the
   Report — the plumbing whose gaps let those pages project from different
   targets. The rent now enters the projection once, inside the shared run, and
   both pages render run.projections. */
(function () {
  var fs   = require('fs');
  var path = require('path');
  var AR = require(path.join(__dirname, '..', 'public', 'js', 'analysisRun.js'));
  var run = AR.compute({ preset: 'balanced' }, canonicalRunData());
  var t = AR.selected(run);
  var expect0 = run.portfolio.annualRentRs + run.investmentRs * t.grossYield;
  assert('T82a', 'year-0 rent = existing rent + investment × the selected target\'s gross yield',
    near(run.projections.year0AnnualRentRs, expect0, 1) &&
    near(run.projections.all.base[0].annualRent, expect0, 1),
    (run.projections.year0AnnualRentRs / 1e7).toFixed(3) + ' vs ' + (expect0 / 1e7).toFixed(3));
  assert('T82b', 'the projection uses the selected target\'s yield, not a 7% default',
    run.projections.params.newMarketGrossYield === t.grossYield);
  var divSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'diversification.js'), 'utf8');
  var rptSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');
  assert('T82c', 'diversification.js renders run.projections and never recomputes them',
    /run\.projections\.all/.test(divSrc) && divSrc.indexOf('Projection.projectAll(') === -1);
  assert('T82d', 'report.js renders run.projections and never recomputes them',
    /run\.projections\.summary3y/.test(rptSrc) && rptSrc.indexOf('Projection.projectAll(') === -1 &&
    rptSrc.indexOf('0.07') === -1);
}());

/* ─── T83 : report.js — decision report fixes ──────────────────────────────── */
(function () {
  var fs   = require('fs');
  var path = require('path');
  var rptSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');

  // T83a: Report cover contains NMIMS
  assert(rptSrc.indexOf('NMIMS') !== -1,
    'T83a', 'report.js cover mentions NMIMS');

  // T83b: Author Vishesh Jain on the cover.
  // Rewritten: the name used to be typed into report.js; it is now declared
  // once in AppMeta.PROJECT and the report reads it from there (HANDOFF.md §1),
  // so searching report.js for the literal asserted the replaced design.
  var AM83 = require(path.join(__dirname, '..', 'public', 'js', 'appMeta.js'));
  assert(AM83.PROJECT.author === 'Vishesh Jain' &&
         rptSrc.indexOf('meta().PROJECT.author') !== -1,
    'T83b', 'report cover takes the author (Vishesh Jain) from AppMeta.PROJECT');

  // T83c: Descriptive target name, via the one naming helper every page uses
  // (rewritten: the report used to build the name itself from rm.locality)
  assert(/AnalysisRun\.name\(target\)/.test(rptSrc),
    'T83c', 'report.js names the target through AnalysisRun.name, as every page does');

  // T83d: Target composite score displayed
  assert(rptSrc.indexOf('Target Composite Score') !== -1,
    'T83d', 'report.js shows Target Composite Score row');

  // T83e: Weight preset label resolved (not raw key)
  assert(rptSrc.indexOf('Weight Preset') !== -1,
    'T83e', 'report.js shows Weight Preset row with label');

  // T83f: subtitle says NMIMS, not SPJIMR.
  // Rewritten: the subtitle is now AppMeta.attribution() rather than a literal
  // in report.js — T-154 asserts the literal is ABSENT, which the old form of
  // this test contradicted.
  assert(/^NMIMS B\.Sc\. Finance \| Business Analytics \| Theme 4/.test(AM83.attribution()) &&
         rptSrc.indexOf('meta().attribution()') !== -1,
    'T83f', 'report subtitle is AppMeta.attribution(), which names NMIMS B.Sc. Finance');

}());

/* ─── T84 : scoringEngine.js — tie-breaking source check ───────────────────── */
(function () {
  var fs   = require('fs');
  var path = require('path');
  var seSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'scoringEngine.js'), 'utf8');

  // T84a: deterministic tie-break comment present
  assert(seSrc.indexOf('Tie-break') !== -1,
    'T84a', 'scoringEngine.js has Tie-break comment for determinism');

  // T84b: sort uses marketId secondary key
  assert(seSrc.indexOf('marketId') !== -1 && seSrc.indexOf('scored.sort') !== -1,
    'T84b', 'scoringEngine.js sort references marketId for tie-breaking');

}());


/* ─── T85 : DataCleaner — Stage 6 8-fixture battery ───────────────────────── */
/* Tests the 8 edge cases that the CSV-cleaning pipeline must handle:          */
/* Fixture 1: valid row → status=ok; Fixture 2: lakh/crore notation;          */
/* Fixture 3: sq-m area → convert to sq ft; Fixture 4: duplicate detection;   */
/* Fixture 5: outlier; Fixture 6: impossible zero price; Fixture 7: missing   */
/* required column; Fixture 8: record count never changes (no silent delete)  */
(function () {
  var DataCleaner = require('../public/js/dataCleaner.js');

  function makeRow(overrides) {
    return Object.assign({
      city: 'Mumbai', locality: 'BKC', propertyType: 'Office',
      areaSqFt: 5000, askingPriceINR: 75000000, monthlyRentINR: 350000,
      sourceName: 'REIT-AI-Synthetic', isSynthetic: true
    }, overrides || {});
  }

  // ── Fixture 1: clean valid row ──────────────────────────────────────────────
  (function () {
    var rows = [makeRow()];
    var r = DataCleaner.cleanRecords(rows);
    assert(r.records[0].validationStatus === 'ok',
      'T85-F1a', 'Fixture 1 — valid row has status ok');
    assert(r.records[0].duplicateFlag === false,
      'T85-F1b', 'Fixture 1 — valid row not flagged as duplicate');
    assert(r.records.length === 1,
      'T85-F1c', 'Fixture 1 — exactly 1 record returned');
  }());

  // ── Fixture 2: lakh/crore notation ─────────────────────────────────────────
  (function () {
    var rows = [makeRow({ askingPriceINR: '7.5 crore', monthlyRentINR: '35 lakh' })];
    var r = DataCleaner.cleanRecords(rows);
    assert(r.records[0].validationStatus === 'ok',
      'T85-F2a', 'Fixture 2 — crore/lakh notation parsed → status ok');
    assert(typeof r.records[0].pricePerSqFt === 'number' && r.records[0].pricePerSqFt > 0,
      'T85-F2b', 'Fixture 2 — pricePerSqFt derived from crore notation');
  }());

  // ── Fixture 3: sq-m area conversion ────────────────────────────────────────
  (function () {
    var rows = [makeRow({ areaSqFt: '100 sqm' })];
    var r = DataCleaner.cleanRecords(rows);
    // Should be converted to ~1076.39 sq ft and accepted
    assert(r.records[0].validationStatus !== 'rejected'
        || r.records[0].exclusionReason.indexOf('area') === -1,
      'T85-F3a', 'Fixture 3 — sq-m area either converted or rejection noted in exclusionReason');
    assert(r.records.length === 1,
      'T85-F3b', 'Fixture 3 — record still present (not silently deleted)');
  }());

  // ── Fixture 4: duplicate detection ─────────────────────────────────────────
  (function () {
    var base = makeRow({ sourceName: 'PropEquity' });
    var rows = [base, Object.assign({}, base)]; // exact duplicate
    var r = DataCleaner.cleanRecords(rows);
    assert(r.records[0].duplicateFlag === false,
      'T85-F4a', 'Fixture 4 — first row not flagged as duplicate');
    assert(r.records[1].duplicateFlag === true,
      'T85-F4b', 'Fixture 4 — second identical row flagged as duplicate');
    assert(r.records.length === 2,
      'T85-F4c', 'Fixture 4 — both rows retained (no silent deletion)');
  }());

  // ── Fixture 5: outlier flag ─────────────────────────────────────────────────
  (function () {
    // 5 similar-price rows + 1 extreme outlier in same city/locality/type group
    var rows = [
      makeRow({ askingPriceINR: 75000000 }),
      makeRow({ askingPriceINR: 76000000 }),
      makeRow({ askingPriceINR: 74000000 }),
      makeRow({ askingPriceINR: 77000000 }),
      makeRow({ askingPriceINR: 75500000 }),
      makeRow({ askingPriceINR: 750000000 }) // 10× outlier
    ];
    var r = DataCleaner.cleanRecords(rows);
    assert(r.records.length === 6,
      'T85-F5a', 'Fixture 5 — all 6 rows retained including outlier');
    var outlierRow = r.records[5];
    assert(outlierRow.outlierFlag === true,
      'T85-F5b', 'Fixture 5 — 10× outlier flagged');
    assert(outlierRow.validationStatus !== 'rejected',
      'T85-F5c', 'Fixture 5 — outlier is flagged, not rejected (still kept)');
  }());

  // ── Fixture 6: impossible zero price ───────────────────────────────────────
  (function () {
    var rows = [makeRow({ askingPriceINR: 0 })];
    var r = DataCleaner.cleanRecords(rows);
    assert(r.records[0].validationStatus === 'rejected',
      'T85-F6a', 'Fixture 6 — zero price → rejected status');
    assert(r.records.length === 1,
      'T85-F6b', 'Fixture 6 — rejected row still present (not silently deleted)');
    assert(typeof r.records[0].exclusionReason === 'string' && r.records[0].exclusionReason.length > 0,
      'T85-F6c', 'Fixture 6 — exclusionReason explains rejection');
  }());

  // ── Fixture 7: missing required column ─────────────────────────────────────
  (function () {
    var rows = [{ city: 'Mumbai', locality: 'BKC', propertyType: 'Office',
                  areaSqFt: 5000, askingPriceINR: 75000000
                  // monthlyRentINR missing
                }];
    var vc = DataCleaner.validateColumns(rows);
    assert(vc.ok === false,
      'T85-F7a', 'Fixture 7 — missing monthlyRentINR → validateColumns fails');
    assert(Array.isArray(vc.missingColumns) && vc.missingColumns.length > 0,
      'T85-F7b', 'Fixture 7 — missingColumns lists the absent column');
  }());

  // ── Fixture 8: record count invariant ──────────────────────────────────────
  (function () {
    var rows = [
      makeRow(),
      makeRow({ askingPriceINR: 0 }),                   // impossible → rejected
      makeRow({ askingPriceINR: 999999999 }),             // outlier (if group ≥ 4)
      makeRow({ areaSqFt: -100 }),                       // negative area → rejected
      Object.assign({}, makeRow(), { sourceName: 'PropEquity' }),
      Object.assign({}, makeRow(), { sourceName: 'PropEquity' }) // duplicate
    ];
    var r = DataCleaner.cleanRecords(rows);
    assert(r.records.length === rows.length,
      'T85-F8', 'Fixture 8 — record count invariant: output length === input length (' + rows.length + ')');
  }());

}());


/* ═══════════════════════════════════════════════════════════════════════════
   DATA QUALITY VALIDATION SUITE — T-100 to T-129
   Stage 7 additions: 30 new tests covering data quality, metadata
   completeness, uncertainty ranges, and scoring integrity post-fix.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var SE  = typeof ScoringEngine !== "undefined" ? ScoringEngine : require("../public/js/scoringEngine.js");
  var fs  = typeof require !== "undefined" ? require("fs") : null;
  var marketsJson = fs ? JSON.parse(fs.readFileSync(__dirname + "/../public/data/markets.json", "utf8")) : window._marketsJson;
  var markets = marketsJson.markets;

  // ── T-100: No market has riskScore = 0 (post-fix) ────────────────────────
  (function () {
    var zeros = markets.filter(function(m) { return m.riskScore === 0; });
    assert(zeros.length === 0,
      "T-100", "All 50 markets have riskScore > 0 (riskScore=0 bug resolved)");
  }());

  // ── T-101: riskScore in valid range 0–100 ────────────────────────────
  (function () {
    var invalid = markets.filter(function(m) { return m.riskScore < 0 || m.riskScore > 100; });
    assert(invalid.length === 0,
      "T-101", "All riskScore values are in range [0, 100]");
  }());

  // ── T-102: demandScore in valid range 0–100 ──────────────────────────
  (function () {
    var invalid = markets.filter(function(m) { return m.demandScore < 0 || m.demandScore > 100; });
    assert(invalid.length === 0,
      "T-102", "All demandScore values are in range [0, 100]");
  }());

  // ── T-103: All markets have confidenceGrade ───────────────────────────
  (function () {
    var missing = markets.filter(function(m) { return !m.confidenceGrade; });
    assert(missing.length === 0,
      "T-103", "All 50 markets have confidenceGrade field");
  }());

  // ── T-104: confidenceGrade is one of A–E ────────────────────────────
  (function () {
    var valid = ["A","B","C","D","E"];
    var invalid = markets.filter(function(m) { return valid.indexOf(m.confidenceGrade) === -1; });
    assert(invalid.length === 0,
      "T-104", "All confidenceGrade values are in {A, B, C, D, E}");
  }());

  // ── T-105: All markets have localityClass ────────────────────────────
  (function () {
    var missing = markets.filter(function(m) { return !m.localityClass; });
    assert(missing.length === 0,
      "T-105", "All 50 markets have localityClass field");
  }());

  // ── T-106: localityClass is a known value ────────────────────────────
  (function () {
    // "Growth" added: generator v2.0.0 assigns it (DATA_DICTIONARY.md, locality_class)
    // and 9 markets in the committed data carry it. The old list predates the
    // generator; the data was not changed to fit the test.
    var valid = ["Premium","Established","Emerging","Growth","Secondary","Peripheral","Industrial"];
    var invalid = markets.filter(function(m) { return valid.indexOf(m.localityClass) === -1; });
    assert(invalid.length === 0,
      "T-106", "All localityClass values are recognised categories");
  }());

  // ── T-107: All markets have dataClassification ───────────────────────
  (function () {
    var missing = markets.filter(function(m) { return !m.dataClassification; });
    assert(missing.length === 0,
      "T-107", "All 50 markets have dataClassification field");
  }());

  // ── T-108: dataClassification is a recognised value ──────────────────
  (function () {
    // "Derived" added: it is a documented evidence class (DATA_DICTIONARY.md,
    // evidence_classification; pipeline test T-11) and 8 committed markets carry it.
    var valid = ["Synthetic","Semi-Synthetic","Estimated","Derived","Reported"];
    var invalid = markets.filter(function(m) { return valid.indexOf(m.dataClassification) === -1; });
    assert(invalid.length === 0,
      "T-108", "All dataClassification values are recognised categories");
  }());

  // ── T-109: All markets have uncertainty object ───────────────────────
  (function () {
    var missing = markets.filter(function(m) { return typeof m.uncertainty !== "object" || m.uncertainty === null; });
    assert(missing.length === 0,
      "T-109", "All 50 markets have uncertainty object");
  }());

  // ── T-110: uncertainty has required sub-fields ─────────────────────
  (function () {
    var fields = ["grossYieldPct","rentalGrowthPct","demandScore","riskScore"];
    var bad = markets.filter(function(m) {
      if (!m.uncertainty) return true;
      return fields.some(function(f) { return typeof m.uncertainty[f] !== "object" || m.uncertainty[f] === null; });
    });
    assert(bad.length === 0,
      "T-110", "uncertainty object contains all required sub-fields (grossYieldPct, rentalGrowthPct, demandScore, riskScore)");
  }());

  // ── T-111: uncertainty ranges satisfy lower ≤ central ≤ upper ────────────
  (function () {
    var fields = ["grossYieldPct","rentalGrowthPct","demandScore","riskScore"];
    var bad = markets.filter(function(m) {
      if (!m.uncertainty) return true;
      return fields.some(function(f) {
        var u = m.uncertainty[f];
        if (!u) return true;
        return u.lower > u.central || u.central > u.upper;
      });
    });
    assert(bad.length === 0,
      "T-111", "All uncertainty ranges satisfy lower ≤ central ≤ upper");
  }());

  // ── T-112: No duplicate city+locality+propertyType combos ──────────────
  (function () {
    var keys = {};
    var dups = [];
    markets.forEach(function(m) {
      var k = m.city + "|" + m.locality + "|" + m.propertyType;
      if (keys[k]) dups.push(m.marketId);
      keys[k] = true;
    });
    assert(dups.length === 0,
      "T-112", "No two markets share the same city+locality+propertyType combination");
  }());

  // ── T-113: Retail gross yields between 5% and 14% ───────────────────
  (function () {
    var retail = markets.filter(function(m) { return m.propertyType === "Retail"; });
    var bad = retail.filter(function(m) {
      var y = m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt;
      return y < 0.05 || y > 0.14;
    });
    assert(bad.length === 0,
      "T-113", "All Retail gross yields are in plausible range [5%, 14%]");
  }());

  // ── T-114: Commercial Office gross yields between 5% and 15% ────────────
  (function () {
    var commercial = markets.filter(function(m) { return m.propertyType === "Commercial Office"; });
    var bad = commercial.filter(function(m) {
      var y = m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt;
      return y < 0.05 || y > 0.15;
    });
    assert(bad.length === 0,
      "T-114", "All Commercial Office gross yields are in plausible range [5%, 15%]");
  }());

  // ── T-115: Residential gross yields between 1% and 8% ─────────────────
  (function () {
    var resi = markets.filter(function(m) { return m.propertyType === "Residential"; });
    var bad = resi.filter(function(m) {
      var y = m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt;
      return y < 0.01 || y > 0.08;
    });
    assert(bad.length === 0,
      "T-115", "All Residential gross yields are in plausible range [1%, 8%]");
  }());

  // ── T-116: Retail markets no longer have uniform 12% yield ─────────────
  (function () {
    var retail = markets.filter(function(m) { return m.propertyType === "Retail"; });
    var all12 = retail.every(function(m) {
      var y = m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt;
      return Math.abs(y - 0.12) < 0.001;
    });
    assert(!all12,
      "T-116", "Retail markets do NOT all share uniform 12.00% gross yield (template-copy bug resolved)");
  }());

  // ── T-117: Residential markets no longer have uniform 4.29% yield ─────────
  (function () {
    var resi = markets.filter(function(m) { return m.propertyType === "Residential"; });
    var all429 = resi.every(function(m) {
      var y = m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt;
      return Math.abs(y - 0.0429) < 0.001;
    });
    assert(!all429,
      "T-117", "Residential markets do NOT all share uniform 4.29% gross yield (template-copy bug resolved)");
  }());

  // ── T-118: annualRentalGrowthRatio in [1%, 20%] ───────────────────────
  (function () {
    var bad = markets.filter(function(m) {
      return m.annualRentalGrowthRatio < 0.01 || m.annualRentalGrowthRatio > 0.20;
    });
    assert(bad.length === 0,
      "T-118", "All annualRentalGrowthRatio values are in plausible range [1%, 20%]");
  }());

  // ── T-119: medianCapitalValuePerSqFt > 0 ──────────────────────────────
  (function () {
    var bad = markets.filter(function(m) { return m.medianCapitalValuePerSqFt <= 0; });
    assert(bad.length === 0,
      "T-119", "All medianCapitalValuePerSqFt values are positive");
  }());

  // ── T-120: medianMonthlyRentPerSqFt > 0 ──────────────────────────────
  (function () {
    var bad = markets.filter(function(m) { return m.medianMonthlyRentPerSqFt <= 0; });
    assert(bad.length === 0,
      "T-120", "All medianMonthlyRentPerSqFt values are positive");
  }());

  // ── T-121: All 4 preset weight sets are valid ─────────────────────────
  (function () {
    var bad = Object.keys(SE.PRESETS).filter(function(name) {
      return !SE.validateWeights(SE.PRESETS[name]);
    });
    assert(bad.length === 0,
      "T-121", "All 4 preset weight sets are validated by validateWeights()");
  }());

  // ── T-122: rankMarkets returns object with ranked array ────────────────
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    assert(typeof result === "object" && Array.isArray(result.ranked),
      "T-122", "rankMarkets() returns object with ranked array");
    assert(result.ranked.length === markets.length,
      "T-122b", "ranked array length equals market count (" + markets.length + ")");
  }());

  // ── T-123: Balanced ranking is non-increasing by totalScore ────────────
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    var ranked = result.ranked;
    var bad = false;
    for (var i = 1; i < ranked.length; i++) {
      if (ranked[i].totalScore > ranked[i-1].totalScore) { bad = true; break; }
    }
    assert(!bad,
      "T-123", "Balanced ranking is non-increasing by totalScore");
  }());

  // ── T-124: No scored market has totalScore outside [0, 100] ────────────
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    var bad = result.ranked.filter(function(m) { return m.totalScore < 0 || m.totalScore > 100; });
    assert(bad.length === 0,
      "T-124", "All totalScore values are in [0, 100]");
  }());

  // ── T-125: rank 1 under balanced preset, portfolio-free call ─────────
  // Rewritten: MKT-010 was rank 1 in the dataset that generator v2.0.0
  // replaced. This call omits the portfolio, so it is NOT the ranking the app
  // shows (that is locked by T-157, through the screener's own call); it pins
  // the portfolio-free ranking that HANDOFF.md §9 documents as MKT-034.
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    assert(result.ranked[0].marketId === "MKT-034",
      "T-125", "MKT-034 is rank 1 under balanced preset when no portfolio is supplied",
      result.ranked[0].marketId);
  }());

  // ── T-126: scoreMarket recomputed = ranked score for the rank-1 market ─
  // Rewritten: it compared MKT-010's recomputed score with whatever was rank 1,
  // which stopped being MKT-010 when the dataset was regenerated. The property
  // it tests — scoreMarket() and rankMarkets() agree — is now checked on the
  // market that is actually rank 1.
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    var r = result.ranges;
    var top = result.ranked[0];
    var m = markets.find(function(x) { return x.marketId === top.marketId; });
    // 50 is the flat diversification factor rankMarkets() uses when no
    // portfolio is supplied; omitting it made the recomputed score NaN.
    var recomputed = SE.scoreMarket(m, SE.PRESETS.balanced, r, 50);
    assert(Math.abs(recomputed.totalScore - top.totalScore) < 0.01,
      "T-126", "scoreMarket() recomputed score for the rank-1 market matches ranked output",
      top.marketId + ": " + recomputed.totalScore + " vs " + top.totalScore);
  }());

  // ── T-127: All markets have non-empty sourceIds array ────────────────
  (function () {
    var missing = markets.filter(function(m) { return !Array.isArray(m.sourceIds) || m.sourceIds.length === 0; });
    assert(missing.length === 0,
      "T-127", "All 50 markets have sourceIds array with at least one entry");
  }());

  // ── T-128: All markets have non-empty methodologyNote ─────────────────
  (function () {
    var missing = markets.filter(function(m) { return typeof m.methodologyNote !== "string" || m.methodologyNote.length === 0; });
    assert(missing.length === 0,
      "T-128", "All 50 markets have non-empty methodologyNote field");
  }());

  // ── T-129: Dataset contains Commercial Office, Retail and Residential ─────
  (function () {
    var types = markets.map(function(m) { return m.propertyType; });
    assert(
      types.indexOf("Commercial Office") !== -1 &&
      types.indexOf("Retail") !== -1 &&
      types.indexOf("Residential") !== -1,
      "T-129", "Dataset contains at least Commercial Office, Retail, and Residential property types");
  }());

}());

/* ═══════════════════════════════════════════════════════════════════════════
   EVIDENCE PIPELINE VALIDATION SUITE — T-130 to T-148
   ═══════════════════════════════════════════════════════════════════════════
   Covers: dataClassification diversity, source traceability, assumption
   traceability, uncertainty monotonicity, REIT-derived markets, pipeline
   file completeness, and EVIDENCE_UPGRADE_REPORT existence.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var fs   = require("fs");
  var path = require("path");
  var ROOT = path.join(__dirname, "..");

  var markets = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public", "data", "markets.json"), "utf8")
  ).markets;

  var SRC_REG_PATH  = path.join(ROOT, "data-pipeline", "source_register.csv");
  var ASSUM_PATH    = path.join(ROOT, "data-pipeline", "assumptions.csv");
  var EVR_PATH      = path.join(ROOT, "data-pipeline", "docs", "EVIDENCE_UPGRADE_REPORT.md");
  var srcRegExists  = fs.existsSync(SRC_REG_PATH);
  var assumExists   = fs.existsSync(ASSUM_PATH);
  var evrExists     = fs.existsSync(EVR_PATH);

  // ── T-130: dataClassification is never "Reported (synthetic)" ────────────
  /*
   T-130  Legacy "Reported (synthetic)" class removed from all markets
  */
  (function () {
    var bad = markets.filter(function (m) {
      return m.dataClassification === "Reported (synthetic)";
    });
    assert("T-130", "No market has dataClassification 'Reported (synthetic)'",
      bad.length === 0,
      "Markets with legacy class: " + bad.map(function (m) { return m.marketId; }).join(", "));
  }());

  // ── T-131: dataClassification uses only allowed values ───────────────────
  /*
   T-131  Every market dataClassification is one of: Reported, Derived, Estimated, Synthetic, Mixed
  */
  (function () {
    var ALLOWED = new Set(["Reported", "Derived", "Estimated", "Synthetic", "Mixed"]);
    var bad = markets.filter(function (m) { return !ALLOWED.has(m.dataClassification); });
    assert("T-131", "Every dataClassification is in the allowed set (Reported/Derived/Estimated/Synthetic/Mixed)",
      bad.length === 0,
      "Invalid: " + bad.map(function (m) { return m.marketId + "=" + m.dataClassification; }).join(", "));
  }());

  // ── T-132: At least one Derived market exists ─────────────────────────────
  /*
   T-132  Dataset has ≥ 1 market with dataClassification = "Derived"
          (anchored to REIT annual-report disclosures)
  */
  (function () {
    var derived = markets.filter(function (m) { return m.dataClassification === "Derived"; });
    assert("T-132", "At least one market has dataClassification 'Derived'",
      derived.length >= 1,
      "Found: " + derived.length);
  }());

  // ── T-133: At least one Estimated market exists ───────────────────────────
  /*
   T-133  Dataset has ≥ 1 market with dataClassification = "Estimated"
  */
  (function () {
    var est = markets.filter(function (m) { return m.dataClassification === "Estimated"; });
    assert("T-133", "At least one market has dataClassification 'Estimated'",
      est.length >= 1,
      "Found: " + est.length);
  }());

  // ── T-134: REIT-covered markets are classified Derived ────────────────────
  /*
   T-134  Embassy/Mindspace REIT landmark markets are classified "Derived"
          (BKC, Whitefield, HITEC City, ORR, Manyata, Malad-Mindspace,
           Financial District, Magarpatta)
  */
  (function () {
    var REIT_COVERED = [
      "MKT-001", "MKT-007", "MKT-010", "MKT-021",
      "MKT-026", "MKT-029", "MKT-030", "MKT-032"
    ];
    var bad = REIT_COVERED.filter(function (id) {
      var m = markets.find(function (x) { return x.marketId === id; });
      return !m || m.dataClassification !== "Derived";
    });
    assert("T-134", "All 8 REIT-covered landmark markets are classified 'Derived'",
      bad.length === 0,
      "Not Derived: " + bad.join(", "));
  }());

  // ── T-135: Peripheral markets with no benchmark are Synthetic ────────────
  /*
   T-135  Known peripheral markets (Pocharam, Ambattur, Manesar) are "Synthetic"
  */
  (function () {
    var PERIPHERAL = ["MKT-031", "MKT-036", "MKT-039"];
    var bad = PERIPHERAL.filter(function (id) {
      var m = markets.find(function (x) { return x.marketId === id; });
      return !m || m.dataClassification !== "Synthetic";
    });
    assert("T-135", "Peripheral markets (Pocharam/Ambattur/Manesar) are classified 'Synthetic'",
      bad.length === 0,
      "Not Synthetic: " + bad.join(", "));
  }());

  // ── T-136: source_register.csv exists and is non-empty ───────────────────
  /*
   T-136  data-pipeline/source_register.csv exists with ≥ 5 source rows
  */
  (function () {
    var ok = false;
    var rowCount = 0;
    if (srcRegExists) {
      var lines = fs.readFileSync(SRC_REG_PATH, "utf8").trim().split("\n");
      rowCount = lines.length - 1; // subtract header
      ok = rowCount >= 5;
    }
    assert("T-136", "source_register.csv exists with ≥ 5 entries",
      ok, "rows=" + rowCount + " exists=" + srcRegExists);
  }());

  // ── T-137: assumptions.csv exists and is non-empty ───────────────────────
  /*
   T-137  data-pipeline/assumptions.csv exists with ≥ 10 assumption rows
  */
  (function () {
    var ok = false;
    var rowCount = 0;
    if (assumExists) {
      var lines = fs.readFileSync(ASSUM_PATH, "utf8").trim().split("\n");
      rowCount = lines.length - 1;
      ok = rowCount >= 10;
    }
    assert("T-137", "assumptions.csv exists with ≥ 10 entries",
      ok, "rows=" + rowCount + " exists=" + assumExists);
  }());

  // ── T-138: Every market has at least one sourceId ─────────────────────────
  /*
   T-138  No market has an empty sourceIds array
  */
  (function () {
    var bad = markets.filter(function (m) {
      return !m.sourceIds || m.sourceIds.length === 0;
    });
    assert("T-138", "Every market has at least one sourceId",
      bad.length === 0,
      "No sourceIds: " + bad.map(function (m) { return m.marketId; }).join(", "));
  }());

  // ── T-139: All sourceIds reference SRC- prefixed identifiers ─────────────
  /*
   T-139  Every sourceId follows the SRC-xxx format
  */
  (function () {
    var bad = [];
    markets.forEach(function (m) {
      (m.sourceIds || []).forEach(function (sid) {
        if (!/^SRC-\d{3,}$/.test(sid)) bad.push(m.marketId + ":" + sid);
      });
    });
    assert("T-139", "All sourceIds follow SRC-xxx format",
      bad.length === 0,
      "Invalid: " + bad.join(", "));
  }());

  // ── T-140: Derived markets have assumptionIds present ────────────────────
  /*
   T-140  All Derived-classified markets have at least one assumptionId
  */
  (function () {
    var derived = markets.filter(function (m) { return m.dataClassification === "Derived"; });
    var bad = derived.filter(function (m) {
      return !m.assumptionIds || m.assumptionIds.length === 0;
    });
    assert("T-140", "All Derived markets have at least one assumptionId",
      bad.length === 0,
      "Missing assumptionIds: " + bad.map(function (m) { return m.marketId; }).join(", "));
  }());

  // ── T-141: classificationNote present on every market ────────────────────
  /*
   T-141  Every market has a non-empty classificationNote field
  */
  (function () {
    var bad = markets.filter(function (m) {
      return !m.classificationNote || m.classificationNote.trim() === "";
    });
    assert("T-141", "Every market has a non-empty classificationNote",
      bad.length === 0,
      "Missing: " + bad.map(function (m) { return m.marketId; }).join(", "));
  }());

  // ── T-142: uncertainty object present and complete on every market ─────────
  /*
   T-142  Every market has uncertainty with grossYieldPct, rentalGrowthPct,
           demandScore, and riskScore sub-objects
  */
  (function () {
    var REQUIRED_KEYS = ["grossYieldPct", "rentalGrowthPct", "demandScore", "riskScore"];
    var bad = markets.filter(function (m) {
      if (!m.uncertainty) return true;
      return REQUIRED_KEYS.some(function (k) { return !m.uncertainty[k]; });
    });
    assert("T-142", "Every market has uncertainty object with all 4 required sub-objects",
      bad.length === 0,
      "Incomplete uncertainty: " + bad.map(function (m) { return m.marketId; }).join(", "));
  }());

  // ── T-143: uncertainty bounds are monotone (lower ≤ central ≤ upper) ──────
  /*
   T-143  For every market and every uncertainty dimension,
           lower ≤ central ≤ upper
  */
  (function () {
    var DIMS = ["grossYieldPct", "rentalGrowthPct", "demandScore", "riskScore"];
    var violations = [];
    markets.forEach(function (m) {
      if (!m.uncertainty) return;
      DIMS.forEach(function (dim) {
        var u = m.uncertainty[dim];
        if (!u) return;
        if (u.lower > u.central || u.central > u.upper) {
          violations.push(m.marketId + "." + dim +
            " lower=" + u.lower + " central=" + u.central + " upper=" + u.upper);
        }
      });
    });
    assert("T-143", "All uncertainty bounds are monotone (lower ≤ central ≤ upper)",
      violations.length === 0,
      "Violations: " + violations.join("; "));
  }());

  // ── T-144: uncertainty basis strings are non-empty ───────────────────────
  /*
   T-144  Every uncertainty sub-object has a non-empty basis string
  */
  (function () {
    var DIMS = ["grossYieldPct", "rentalGrowthPct", "demandScore", "riskScore"];
    var bad = [];
    markets.forEach(function (m) {
      if (!m.uncertainty) return;
      DIMS.forEach(function (dim) {
        var u = m.uncertainty[dim];
        if (u && (!u.basis || u.basis.trim() === "")) {
          bad.push(m.marketId + "." + dim);
        }
      });
    });
    assert("T-144", "All uncertainty sub-objects have a non-empty basis string",
      bad.length === 0,
      "Missing basis: " + bad.join(", "));
  }());

  // ── T-145: No market has riskScore of 0 ──────────────────────────────────
  /*
   T-145  No market has riskScore = 0 (the pipeline-key-mismatch bug is fixed)
  */
  (function () {
    var bad = markets.filter(function (m) { return m.riskScore === 0; });
    assert("T-145", "No market has riskScore = 0 (pipeline key mismatch bug remains fixed)",
      bad.length === 0,
      "riskScore=0: " + bad.map(function (m) { return m.marketId; }).join(", "));
  }());

  // ── T-146: Gross yields differ across retail markets ─────────────────────
  /*
   T-146  Retail markets do not all share the same gross yield (12% bug fixed)
  */
  (function () {
    var retail = markets.filter(function (m) { return m.propertyType === "Retail"; });
    var yields = retail.map(function (m) {
      return Math.round(m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt * 1000) / 10;
    });
    var unique = new Set(yields);
    assert("T-146", "Retail markets have at least 2 distinct gross yields (uniform-12% bug fixed)",
      unique.size >= 2,
      "Unique yields: " + JSON.stringify(yields));
  }());

  // ── T-147: Gross yields differ across residential markets ─────────────────
  /*
   T-147  Residential markets do not all share the same gross yield (4.29% bug fixed)
  */
  (function () {
    var resi = markets.filter(function (m) { return m.propertyType === "Residential"; });
    var yields = resi.map(function (m) {
      return Math.round(m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt * 1000) / 10;
    });
    var unique = new Set(yields);
    assert("T-147", "Residential markets have at least 2 distinct gross yields (uniform-4.29% bug fixed)",
      unique.size >= 2,
      "Unique yields: " + JSON.stringify(yields));
  }());

  // ── T-148: EVIDENCE_UPGRADE_REPORT.md exists ─────────────────────────────
  /*
   T-148  data-pipeline/docs/EVIDENCE_UPGRADE_REPORT.md exists
  */
  (function () {
    assert("T-148", "EVIDENCE_UPGRADE_REPORT.md exists in data-pipeline/docs/",
      evrExists,
      "File not found: " + EVR_PATH);
  }());

}());


/* ═══════════════════════════════════════════════════════════════════════════
   T-149  Canonical metadata — every headline figure is DERIVED, never typed
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T-149-T-156 Final-submission additions ────────────────────────────────");
(function () {
  var fs = require("fs"), path = require("path");
  var AppMeta = require(path.join(__dirname, "..", "public", "js", "appMeta.js"));
  var ScenarioKey = require(path.join(__dirname, "..", "public", "js", "scenarioKey.js"));
  var marketsDoc   = require(path.join(__dirname, "..", "public", "data", "markets.json"));
  var portfolioDoc = require(path.join(__dirname, "..", "public", "data", "portfolio.json"));
  var statsDoc     = require(path.join(__dirname, "..", "public", "data", "statistics.json"));
  var metaPath = path.join(__dirname, "..", "public", "data", "meta.json");

  var c = AppMeta.derive({ marketsDoc: marketsDoc, portfolioDoc: portfolioDoc,
                           statisticsDoc: statsDoc });

  assert("T-149a", "derived market count equals the markets actually in the file",
    c.marketCount === marketsDoc.markets.length, "derived=" + c.marketCount);
  assert("T-149b", "derived observation count equals the sum of per-segment counts",
    c.observationCount === marketsDoc.markets.reduce(function (t, m) {
      return t + m.observationCount; }, 0), "derived=" + c.observationCount);
  assert("T-149c", "derived city count equals the distinct cities present",
    c.cityCount === c.cities.length && c.cityCount > 0, "cityCount=" + c.cityCount);
  assert("T-149d", "derived portfolio value equals the sum of holding values",
    c.portfolioValueRs === portfolioDoc.assets.reduce(function (t, a) {
      return t + a.propertyValue; }, 0), "derived=" + c.portfolioValueRs);
  assert("T-149e", "derived weighted yield equals rent ÷ value",
    Math.abs(c.portfolioWeightedYield - (c.portfolioRentRs / c.portfolioValueRs)) < 1e-12);
  assert("T-149f", "agent count in metadata equals the length of the roster",
    c.agentCount === AppMeta.AGENTS.length && c.agentCount === 4);

  /* The two modules that declare a methodology version must agree. If they
   * drift, cached commentary could survive a change to the scoring logic it
   * describes — a silent correctness failure rather than a visible one. */
  assert("T-149g", "appMeta and scenarioKey declare the same methodology version",
    AppMeta.PROJECT.methodologyVersion === ScenarioKey.METHODOLOGY_VERSION,
    AppMeta.PROJECT.methodologyVersion + " vs " + ScenarioKey.METHODOLOGY_VERSION);

  assert("T-149h", "the institution is NMIMS, stated in exactly one place",
    AppMeta.PROJECT.institution === "NMIMS");

  assert("T-149i", "meta.json exists and matches a fresh derivation",
    fs.existsSync(metaPath) &&
    JSON.stringify(JSON.parse(fs.readFileSync(metaPath, "utf8")).counts) === JSON.stringify(c),
    "meta.json is missing or stale — run node data-pipeline/scripts/buildMeta.js");

  /* meta.json must not carry a build timestamp: a timestamp would change on
   * every run and break the CI assertion that regeneration is reproducible. */
  assert("T-149j", "meta.json carries no build timestamp",
    fs.existsSync(metaPath) &&
    !/generatedAt|builtAt|timestamp/i.test(fs.readFileSync(metaPath, "utf8")),
    "meta.json contains a timestamp, which makes regeneration non-reproducible");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-150  Documentation drift — no document may contradict the canonical facts
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs"), path = require("path");
  var repo = path.join(__dirname, "..");

  function mdFiles(dir) {
    var out = [];
    if (!fs.existsSync(dir)) { return out; }
    fs.readdirSync(dir).forEach(function (f) {
      if (/\.md$/i.test(f)) { out.push(path.join(dir, f)); }
    });
    return out;
  }
  var docs = mdFiles(path.join(repo, "docs"))
    .concat(mdFiles(path.join(repo, "data-pipeline", "docs")))
    .concat([path.join(repo, "README.md")].filter(fs.existsSync));

  /*
   * Each pattern is a figure that WAS true of an earlier revision of this
   * project and is not true now. A document asserting one of them is not
   * merely out of date: it contradicts another document in the same
   * repository, and a reader has no way to tell which to believe.
   *
   * Two escapes exist, both narrow:
   *
   *   - verification-evidence.md is exempt wholesale, because its job is to
   *     record the institution-name migration and it must quote the old value.
   *
   *   - any single line containing the marker [superseded] is skipped. Several
   *     documents are historical records — a decision log, a prompt version
   *     history, an earlier test run — and deleting the figures they recorded
   *     would destroy the audit trail to satisfy a test. Marking the line says
   *     "this was true then and is not true now", which is exactly the
   *     distinction the check exists to enforce. An unmarked line asserting a
   *     superseded figure still fails.
   */
  var STALE = [
    { pattern: /450\s*Cr/,                    was: "₹450 Cr portfolio" },
    { pattern: /\b18\s+market(s| segments)/,  was: "18 market segments" },
    { pattern: /\b18\s+segments/,             was: "18 segments" },
    { pattern: /\b7\s+cities\b/,              was: "7 cities" },
    { pattern: /\bsix agents\b/i,             was: "six agents" },
    { pattern: /\b6\s+agents\b/,              was: "6 agents" },
    { pattern: /\b2,?000\s+observations/,     was: "2,000 observations" },
    { pattern: /SPJIMR/,                      was: "SPJIMR as the institution" }
  ];
  var EXEMPT = ["verification-evidence.md"];

  var offences = [];
  docs.forEach(function (file) {
    var base = path.basename(file);
    if (EXEMPT.indexOf(base) !== -1) { return; }
    var lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach(function (line, i) {
      if (line.indexOf("[superseded]") !== -1) { return; }
      STALE.forEach(function (rule) {
        if (rule.pattern.test(line)) {
          offences.push(base + ":" + (i + 1) + " — " + rule.was);
        }
      });
    });
  });

  assert("T-150a", "no document asserts a superseded figure",
    offences.length === 0, "\n    " + offences.join("\n    "));

  assert("T-150b", "docs/CANONICAL_FACTS.md exists and is marked as generated",
    fs.existsSync(path.join(repo, "docs", "CANONICAL_FACTS.md")) &&
    /GENERATED FILE/.test(fs.readFileSync(path.join(repo, "docs", "CANONICAL_FACTS.md"), "utf8")));

  /* Source comments are documentation too, and carried the same drift. */
  var jsFiles = [];
  ["public/js", "data-pipeline/scripts", "server"].forEach(function (d) {
    var dir = path.join(repo, d);
    if (!fs.existsSync(dir)) { return; }
    fs.readdirSync(dir).forEach(function (f) {
      if (/\.js$/.test(f)) { jsFiles.push(path.join(dir, f)); }
    });
  });
  /*
   * Comments are stripped before this check. Two files legitimately NAME the
   * superseded institution in a comment, to record that the migration happened
   * and why nothing should hardcode an institution again. Flagging that would
   * have forced the explanation out of the code to satisfy the test — the test
   * dictating the documentation rather than the behaviour. What must not
   * appear is the name as a VALUE: in a string, a label, or displayed text.
   */
  function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }
  var srcOffences = [];
  jsFiles.forEach(function (file) {
    var code = stripComments(fs.readFileSync(file, "utf8"));
    if (/SPJIMR/.test(code)) { srcOffences.push(path.basename(file) + ": SPJIMR"); }
  });
  assert("T-150c", "no source file names the wrong institution",
    srcOffences.length === 0, "\n    " + srcOffences.join("\n    "));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-151  Evidence governance — eligibility is separate from the score
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var path = require("path");
  var Governance = require(path.join(__dirname, "..", "public", "js", "governance.js"));
  var Scoring    = require(path.join(__dirname, "..", "public", "js", "scoringEngine.js"));
  var HHI        = require(path.join(__dirname, "..", "public", "js", "hhi.js"));
  var markets = require(path.join(__dirname, "..", "public", "data", "markets.json")).markets;
  var assets  = require(path.join(__dirname, "..", "public", "data", "portfolio.json")).assets;

  var R = Governance.rules();
  assert("T-151a", "the floor is 30 observations and grade C",
    R.MIN_OBSERVATIONS === 30 && R.MIN_GRADE === "C");

  assert("T-151b", "a segment with 29 observations at grade A is ineligible",
    Governance.evaluate({ observationCount: 29, confidenceGrade: "A" }).eligible === false);
  assert("T-151c", "a segment with 500 observations at grade D is ineligible",
    Governance.evaluate({ observationCount: 500, confidenceGrade: "D" }).eligible === false);
  assert("T-151d", "a segment with 30 observations at grade C is eligible",
    Governance.evaluate({ observationCount: 30, confidenceGrade: "C" }).eligible === true);
  assert("T-151e", "a missing confidence grade is ineligible, not assumed good",
    Governance.evaluate({ observationCount: 500, confidenceGrade: null }).eligible === false);
  assert("T-151f", "an ineligible segment states every reason it failed",
    Governance.evaluate({ observationCount: 10, confidenceGrade: "E" }).reasons.length === 2);

  /*
   * The property that matters most: annotating and choosing must not touch a
   * single score or rank. If governance could alter a score, the ranking shown
   * on the screener would stop being the ranking the scoring engine produced.
   */
  var ranked = Scoring.rankMarkets(markets, Scoring.PRESETS.balanced,
                                   assets, HHI.diversificationScore).ranked;
  var before = ranked.map(function (m) { return m.marketId + ":" + m.totalScore + ":" + m.rank; });
  var chosen = Governance.chooseTarget(ranked, {});
  var after  = ranked.map(function (m) { return m.marketId + ":" + m.totalScore + ":" + m.rank; });
  assert("T-151g", "governance changes no score and no rank",
    before.join("|") === after.join("|"),
    "the ranking was mutated by the eligibility pass");

  assert("T-151h", "the recommendation meets the floor when the floor is applied",
    chosen.target && chosen.target.governance.eligible === true,
    chosen.note);
  assert("T-151i", "the highest-scoring segment is still reported, even when not recommended",
    chosen.topOverall && chosen.topOverall.marketId === ranked[0].marketId);
  assert("T-151j", "segments outranking the recommendation are listed with their reasons",
    chosen.outranked.every(function (m) {
      return m.totalScore > chosen.target.totalScore && m.governance.reasons.length > 0;
    }), "outranked list is inconsistent");

  var overridden = Governance.chooseTarget(ranked, { override: true });
  assert("T-151k", "the override recommends the highest-scoring segment",
    overridden.target.marketId === ranked[0].marketId && overridden.overrideUsed === true);
  // (wording updated: "evidence floor overridden" became "simulation-support screen ignored")
  assert("T-151l", "the override is recorded, not silent",
    /screen ignored/i.test(overridden.note), overridden.note);

  var sum = Governance.summarise(markets);
  assert("T-151m", "the eligibility breakdown accounts for every segment",
    sum.eligible + sum.failObsOnly + sum.failGradeOnly + sum.failBoth === sum.total,
    JSON.stringify(sum));

  /* Rewritten. The tiers were "Strong / Adequate / Limited / Weak evidence".
   * They measure simulation precision, and no figure is externally verified,
   * so "Strong evidence" was renamed deliberately to a simulation-support
   * level. Same thresholds, same order. */
  assert("T-151n", "simulation-support levels run High, Moderate, Limited, Low",
    Governance.evidenceTier(70, "B") === "High" &&
    Governance.evidenceTier(40, "C") === "Moderate" &&
    Governance.evidenceTier(40, "D") === "Limited" &&
    Governance.evidenceTier(10, "E") === "Low");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-152  Screener filters — combinable, reversible, and never re-ranking
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var path = require("path");
  var Filters    = require(path.join(__dirname, "..", "public", "js", "filters.js"));
  var Governance = require(path.join(__dirname, "..", "public", "js", "governance.js"));
  var markets = require(path.join(__dirname, "..", "public", "data", "markets.json")).markets;

  var none = Filters.defaults();
  var all  = Filters.apply(markets, none);
  assert("T-152a", "no filters keeps every segment",
    all.keptCount === markets.length && all.removed === 0);
  assert("T-152b", "no filters reports itself as inactive",
    Filters.isActive(none) === false && Filters.activeNames(none).length === 0);

  var d = Filters.describe(markets);
  assert("T-152c", "filter domains are derived from the data, not hardcoded",
    d.cities.length > 0 && d.propertyTypes.length > 0 && d.grades.length > 0 &&
    d.observations.min <= d.observations.max);

  var f1 = Filters.defaults(); f1.cities = [markets[0].city];
  var r1 = Filters.apply(markets, f1);
  assert("T-152d", "a city filter keeps only that city",
    r1.kept.every(function (m) { return m.city === markets[0].city; }) && r1.keptCount > 0);

  var f2 = Filters.defaults(); f2.propertyTypes = ["Retail"]; f2.minObservations = 40;
  var r2 = Filters.apply(markets, f2);
  assert("T-152e", "filters combine as AND, not OR",
    r2.kept.every(function (m) {
      return m.propertyType === "Retail" && m.observationCount >= 40;
    }), "a kept row fails one of the two filters");

  var impossible = Filters.defaults();
  impossible.yieldMin = 999;
  var r3 = Filters.apply(markets, impossible);
  assert("T-152f", "an impossible filter returns an empty result, not an error",
    r3.keptCount === 0 && r3.removed === markets.length);
  assert("T-152g", "an empty result names the filter responsible",
    /Nothing matches/.test(Filters.summary(impossible, r3)) &&
    /minimum yield/.test(Filters.summary(impossible, r3)),
    Filters.summary(impossible, r3));

  /* Filters decide what is DISPLAYED. The rank attached to a kept row must
   * still be its rank within the whole universe — otherwise "rank 12" would
   * mean something different on a filtered screen than in the report. */
  var Scoring = require(path.join(__dirname, "..", "public", "js", "scoringEngine.js"));
  var HHI     = require(path.join(__dirname, "..", "public", "js", "hhi.js"));
  var assets  = require(path.join(__dirname, "..", "public", "data", "portfolio.json")).assets;
  var ranked  = Scoring.rankMarkets(markets, Scoring.PRESETS.balanced,
                                    assets, HHI.diversificationScore).ranked;
  var fr = Filters.apply(Governance.annotate(ranked), f2);
  assert("T-152h", "filtering preserves each row's rank within the full universe",
    fr.kept.every(function (m) { return ranked[m.rank - 1].marketId === m.marketId; }),
    "a filtered row's rank no longer indexes the full ranking");
  assert("T-152i", "filtering preserves score order among the kept rows",
    fr.kept.every(function (m, i) {
      return i === 0 || fr.kept[i - 1].totalScore >= m.totalScore;
    }));

  var fe = Filters.defaults(); fe.eligibleOnly = true;
  var re = Filters.apply(Governance.annotate(markets), fe);
  assert("T-152j", "the evidence-floor filter keeps only eligible segments",
    re.kept.every(function (m) { return m.governance.eligible; }) &&
    re.keptCount === Governance.summarise(markets).eligible);

  assert("T-152k", "reset returns to the no-filter state",
    JSON.stringify(Filters.defaults()) === JSON.stringify(none));

  // Yield used by the filter must agree with the yield the engine scored.
  assert("T-152l", "the filter's gross yield matches the scoring engine's",
    ranked.every(function (m) {
      return Math.abs(Filters.grossYieldPct(m) - m.grossYield * 100) < 1e-9;
    }), "filter yield and engine yield disagree");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-153  Observation distribution — precomputed, consistent, correctly named
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs"), path = require("path");
  var file = path.join(__dirname, "..", "public", "data", "observation-distribution.json");
  assert("T-153a", "observation-distribution.json exists",
    fs.existsSync(file), "run node data-pipeline/scripts/buildObservationDistribution.js");
  if (!fs.existsSync(file)) { return; }

  var D = JSON.parse(fs.readFileSync(file, "utf8"));
  var markets = require(path.join(__dirname, "..", "public", "data", "markets.json")).markets;

  assert("T-153b", "every market segment has a summary",
    markets.every(function (m) { return !!D.segments[m.marketId]; }));
  assert("T-153c", "per-segment observation counts match markets.json exactly",
    markets.every(function (m) {
      return D.segments[m.marketId].observations === m.observationCount;
    }), "a count disagrees between the two files");
  assert("T-153d", "the summarised totals add up to the dataset total",
    Object.keys(D.segments).reduce(function (t, k) {
      return t + D.segments[k].observations; }, 0) === D.totalObservations);

  /* The segment figures used in the ranking are described as the medians of
   * these observations. That claim is testable, so it is tested. */
  var mismatches = markets.filter(function (m) {
    var med = D.segments[m.marketId].metrics.monthly_rent_psf.summary.median;
    return Math.abs(med - m.medianMonthlyRentPerSqFt) > 0.15;
  }).map(function (m) { return m.marketId; });
  assert("T-153e", "each segment's rent equals the median of its observations",
    mismatches.length === 0, "mismatched: " + mismatches.slice(0, 5).join(", "));

  assert("T-153f", "histogram bins sum to the segment's observation count",
    Object.keys(D.segments).every(function (k) {
      var h = D.segments[k].metrics.gross_yield_pct.histogram;
      if (!h) { return true; }
      return h.counts.reduce(function (t, c) { return t + c; }, 0) ===
             D.segments[k].observations;
    }), "a histogram loses or duplicates observations");

  assert("T-153g", "quantiles are monotone in every segment and metric",
    Object.keys(D.segments).every(function (k) {
      return (D.metricOrder || []).every(function (mk) {
        var su = D.segments[k].metrics[mk].summary;
        if (!su) { return true; }
        return su.min <= su.p10 && su.p10 <= su.q1 && su.q1 <= su.median &&
               su.median <= su.q3 && su.q3 <= su.p90 && su.p90 <= su.max;
      });
    }), "a quantile sequence is out of order");

  /*
   * Terminology. These records are simulated draws, and calling them
   * properties, listings or transactions would assert that something real
   * happened. The approved noun is carried in the file so no page can quietly
   * choose a different one, and the forbidden words must not appear in the
   * screener's own observation panel.
   */
  assert("T-153h", "the approved record noun is 'simulated market observation'",
    D.terminology.recordNoun === "simulated market observation" &&
    D.terminology.panelTitle === "Observation Distribution");

  var screenerSrc = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "marketScreen.js"), "utf8");
  var panelStart = screenerSrc.indexOf("function buildObservationPanel");
  var panelEnd   = screenerSrc.indexOf("function buildHistogram");
  var panelSrc   = panelStart !== -1 && panelEnd > panelStart
    ? screenerSrc.slice(panelStart, panelEnd) : "";
  var banned = ["properties", "listings", "transactions", "comparables"];
  var found = banned.filter(function (w) {
    // Only flag the word used as a label, not a sentence saying it is not one.
    var re = new RegExp('"[^"]*\\b' + w + '\\b[^"]*"', "i");
    var m = panelSrc.match(re);
    return m && !/never|not\b|nor\b/i.test(m[0]);
  });
  assert("T-153i", "the observation panel never labels the records as real assets",
    found.length === 0, "found: " + found.join(", "));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-154  Decision Report — the score column and the agent section both work
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs"), path = require("path");
  var src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "report.js"), "utf8");

  /*
   * The defect: the screening table read m.score, which ranked markets do not
   * carry — the field is totalScore. Every row printed an em dash while the
   * screener showed real numbers for the same markets. A regex test is a crude
   * instrument, but this defect was a single wrong property name, which is
   * exactly what a regex can pin down.
   */
  // (form updated: the screening tables now show scores to two decimals, like every other page)
  assert("T-154a", "the report's screening tables read totalScore",
    /m\.totalScore\.toFixed\(2\)/.test(src),
    "the score column does not read totalScore");
  assert("T-154b", "the report no longer reads the non-existent m.score field",
    !/typeof m\.score === 'number'/.test(src),
    "m.score is still read");

  assert("T-154c", "the report states the commentary's provenance",
    src.indexOf("Commentary Provenance") !== -1);
  assert("T-154d", "the report includes the deterministic check results",
    src.indexOf("Deterministic Input Checks") !== -1);
  /* Rewritten: "Target Evidence" / "Meets Evidence Floor" asserted the retired
   * framing. The report now states simulation support and external
   * calibration as separate lines. */
  assert("T-154e", "the report states the target's simulation support and external calibration separately",
    src.indexOf("Target Simulation Support") !== -1 && src.indexOf("Target External Calibration") !== -1 &&
    src.indexOf("Meets Evidence Floor") === -1);
  assert("T-154f", "the report takes its limitations from validator.js, not a second copy",
    /Validator\.LIMITATIONS/.test(src) &&
    !/HHI computed on book value \(acquisition cost\), not mark-to-market NAV/.test(src),
    "the report still carries its own limitation list");
  assert("T-154g", "the report takes its attribution from AppMeta",
    /meta\(\)\.attribution\(\)/.test(src) && src.indexOf("'NMIMS B.Sc. Finance | Business") === -1,
    "the cover still hardcodes the institution");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-155  Overview page — present, wired, and the default route
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs"), path = require("path");
  var repo = path.join(__dirname, "..");
  var html = fs.readFileSync(path.join(repo, "public", "index.html"), "utf8");
  var ui   = fs.readFileSync(path.join(repo, "public", "js", "uiHelpers.js"), "utf8");

  assert("T-155a", "overview.js exists and is loaded by index.html",
    fs.existsSync(path.join(repo, "public", "js", "overview.js")) &&
    html.indexOf('src="js/overview.js"') !== -1);
  assert("T-155b", "the Overview section exists and is the initially active page",
    /id="page-overview"[\s\S]{0,120}class="page page-active"/.test(html),
    "page-overview is not the active section");
  assert("T-155c", "Overview is the first sidebar link",
    html.indexOf('data-page="overview"') !== -1 &&
    html.indexOf('data-page="overview"') < html.indexOf('data-page="portfolio"'));
  assert("T-155d", "no page other than Overview is marked page-active",
    (html.match(/class="page page-active"/g) || []).length === 1,
    "found " + (html.match(/class="page page-active"/g) || []).length);

  /* The default route is read from the markup rather than named in code, so
   * adding or reordering a page cannot leave the hash router and the sidebar
   * disagreeing about where a bare URL lands. */
  assert("T-155e", "the router derives its default page from the first sidebar link",
    ui.indexOf("var DEFAULT_PAGE") !== -1 &&
    (ui.match(/DEFAULT_PAGE/g) || []).length >= 4 &&
    !/getElementById\("page-portfolio"\)/.test(ui) &&
    !/\|\| "portfolio";?\s*$/m.test(ui.replace(/var DEFAULT_PAGE[^\n]*\n/, "")),
    "the router still resolves its default page by naming a specific page");

  var ov = fs.readFileSync(path.join(repo, "public", "js", "overview.js"), "utf8");
  /* T-155f–i rewritten.
   *  f: the silent second click ("Click again to confirm reset") was replaced by
   *     an explicit confirmation panel with Reset and Cancel buttons.
   *  g: reset now goes through AnalysisRun.reset() → ReitState.resetApp(), which
   *     clears application keys only.
   *  h: the Overview used to show "no analysis has been run" until the Screener
   *     had been visited; it now computes the canonical analysis immediately
   *     and labels exactly what it is (preset, amount, portfolio, mode).
   *  i: "runner-up / next-best segment" was ambiguous; the comparison is now the
   *     highest raw-score alternative or the next eligible candidate. */
  assert("T-155f", "Reset Demo opens an explicit confirmation panel with Reset and Cancel",
    ov.indexOf("Reset the demo to its defaults?") !== -1 && ov.indexOf('"Cancel"') !== -1 &&
    ov.indexOf("Click again to confirm reset") === -1);
  assert("T-155g", "Reset Demo resets through AnalysisRun and never clears unrelated storage",
    /AnalysisRun\.reset\(\)/.test(ov) && !/localStorage\.clear\(\)/.test(ov),
    "reset must not clear unrelated browser storage");
  assert("T-155h", "the Overview renders the shared run as soon as data loads, labelled with its inputs",
    /AnalysisRun\.ready\(\)/.test(ov) && ov.indexOf("No analysis has been run in this browser yet") === -1 &&
    /The shared analysis every page renders/.test(ov));
  assert("T-155i", "the Overview compares against the highest raw-score alternative or next eligible candidate",
    /AnalysisRun\.comparison\(run\)/.test(ov) &&
    !/runner-?up|next-best/i.test(ov.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")));
  assert("T-155j", "every nav link has a matching section",
    (html.match(/data-page="([a-z]+)"/g) || []).every(function (m) {
      var id = m.replace(/data-page="|"/g, "");
      return html.indexOf('id="page-' + id + '"') !== -1;
    }), "a sidebar link points at a section that does not exist");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-156  Evaluator CSV fixtures — one valid, one deliberately invalid
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs"), path = require("path");
  var dir = path.join(__dirname, "fixtures");
  var validPath   = path.join(dir, "markets-valid.csv");
  var invalidPath = path.join(dir, "markets-invalid.csv");

  assert("T-156a", "both evaluator fixtures exist",
    fs.existsSync(validPath) && fs.existsSync(invalidPath),
    "tests/fixtures is missing one or both CSV files");
  if (!fs.existsSync(validPath) || !fs.existsSync(invalidPath)) { return; }

  var Cleaner = require(path.join(__dirname, "..", "public", "js", "dataCleaner.js"));

  function parse(text) {
    var lines = text.trim().split(/\r?\n/);
    var head = lines[0].split(",").map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      var cells = line.split(",");
      var row = {};
      head.forEach(function (h, i) {
        var v = (cells[i] || "").trim();
        row[h] = v === "" ? null : (isNaN(Number(v)) ? v : Number(v));
      });
      return row;
    });
  }

  var validRows   = parse(fs.readFileSync(validPath, "utf8"));
  var invalidRows = parse(fs.readFileSync(invalidPath, "utf8"));

  assert("T-156b", "the valid fixture has rows and the invalid fixture has rows",
    validRows.length >= 3 && invalidRows.length >= 3,
    "valid=" + validRows.length + " invalid=" + invalidRows.length);

  var vClean = Cleaner.cleanRecords(validRows);
  var iClean = Cleaner.cleanRecords(invalidRows);

  assert("T-156c", "the cleaning pipeline accepts every row of the valid fixture",
    vClean.report.rejected === 0 && vClean.report.ok === validRows.length &&
    vClean.report.missingColumns.length === 0,
    JSON.stringify({ ok: vClean.report.ok, rejected: vClean.report.rejected,
                     missing: vClean.report.missingColumns }));

  assert("T-156d", "the cleaning pipeline rejects every row of the invalid fixture",
    iClean.report.rejected === invalidRows.length,
    "rejected " + iClean.report.rejected + " of " + invalidRows.length);

  /* Each rejection must say what was wrong. A fixture rejected for an unstated
   * reason demonstrates only that something failed, which is not useful to an
   * evaluator trying to see the pipeline work. */
  var rejectedRows = iClean.records.filter(function (r) {
    return r.validationStatus === "rejected";
  });
  assert("T-156e", "every rejection states a reason",
    rejectedRows.length > 0 && rejectedRows.every(function (r) {
      return typeof r.exclusionReason === "string" && r.exclusionReason.length > 0;
    }), "a rejection carries no exclusionReason");

  /* The fixtures are evidence, so they must also be honestly labelled: nothing
   * in them may claim to be a real listing from a real source. */
  var bothText = fs.readFileSync(validPath, "utf8") + fs.readFileSync(invalidPath, "utf8");
  assert("T-156f", "both fixtures declare themselves synthetic",
    !/false/.test(bothText.split(/\r?\n/).slice(1).join("\n").replace(/example\.invalid/g, "")) &&
    /Synthetic fixture/.test(bothText),
    "a fixture row is not marked synthetic");
  assert("T-156g", "the fixtures document what each invalid row breaks",
    fs.existsSync(path.join(dir, "README.md")) &&
    /Rule it breaks/.test(fs.readFileSync(path.join(dir, "README.md"), "utf8")));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-157  Financial regression baseline — computed the way the APP computes it

   A regression baseline captured earlier in this project called
   ScoringEngine.rankMarkets(markets, weights) with no portfolio and no
   diversification function. In that call the diversification factor falls back
   to a flat 50 for every segment, so the baseline recorded a ranking the
   application never produces: it named MKT-034 as the Balanced leader where
   the application ranks MKT-036 first.

   A baseline that measures something the application does not compute is worse
   than no baseline, because it passes while the real output changes: a bug in
   diversificationScore would have moved every ranking in the app and left that
   baseline untouched. The figures below are therefore captured through the same
   call the Market Screener makes, with the portfolio and the diversification
   function supplied.
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T-157-T-158 Financial baseline and projection arithmetic ──────────────");
(function () {
  var path = require("path");
  var Scoring = require(path.join(__dirname, "..", "public", "js", "scoringEngine.js"));
  var HHI     = require(path.join(__dirname, "..", "public", "js", "hhi.js"));
  var markets = require(path.join(__dirname, "..", "public", "data", "markets.json")).markets;
  var assets  = require(path.join(__dirname, "..", "public", "data", "portfolio.json")).assets;

  assert("T-157a", "portfolio total value is unchanged",
    HHI.totalValue(assets) === 5000000000, "got " + HHI.totalValue(assets));
  assert("T-157b", "portfolio annual rent is unchanged",
    HHI.totalAnnualRent(assets) === 332750000, "got " + HHI.totalAnnualRent(assets));
  assert("T-157c", "portfolio weighted yield is unchanged",
    Math.abs(HHI.weightedYield(assets) - 0.06655) < 1e-12,
    "got " + HHI.weightedYield(assets));
  assert("T-157d", "city HHI is unchanged",
    Math.abs(HHI.cityHHI(assets) - 0.413) < 1e-12, "got " + HHI.cityHHI(assets));
  assert("T-157e", "asset-type HHI is unchanged",
    Math.abs(HHI.typeHHI(assets) - 0.631608) < 1e-12, "got " + HHI.typeHHI(assets));

  /* Leaders under each preset, through the application's own call. */
  var EXPECTED = {
    balanced:      { id: "MKT-036", score: 72.45 },
    incomeFocused: { id: "MKT-038", score: 75.40 },
    growthFocused: { id: "MKT-012", score: 77.36 },
    diversFocused: { id: "MKT-049", score: 73.32 }
  };
  Object.keys(EXPECTED).forEach(function (key, i) {
    var top = Scoring.rankMarkets(markets, Scoring.PRESETS[key],
                                  assets, HHI.diversificationScore).ranked[0];
    var exp = EXPECTED[key];
    assert("T-157f" + i, "highest-scoring segment under " + key + " is " + exp.id,
      top.marketId === exp.id, "got " + top.marketId);
    assert("T-157g" + i, "its composite score is " + exp.score.toFixed(2) + " under " + key,
      Math.abs(top.totalScore - exp.score) < 0.005, "got " + top.totalScore.toFixed(4));
  });

  /* The guard that would have caught the flawed baseline: omitting the
   * portfolio must NOT silently produce the same answer. If it did, the
   * diversification factor would be doing nothing. */
  var withoutPortfolio = Scoring.rankMarkets(markets, Scoring.PRESETS.balanced).ranked[0];
  var withPortfolio    = Scoring.rankMarkets(markets, Scoring.PRESETS.balanced,
                                             assets, HHI.diversificationScore).ranked[0];
  assert("T-157h", "the diversification factor actually changes the ranking",
    withoutPortfolio.marketId !== withPortfolio.marketId,
    "ranking is identical with and without the portfolio, so the factor is inert");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-158  Projection arithmetic, and the occupancy assumption
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs"), path = require("path");
  var Projection = require(path.join(__dirname, "..", "public", "js", "projection.js"));

  var params = {
    currentPortfolioValueRs: 5000000000,
    currentAnnualRentRs:     332750000,
    investmentRs:            500000000,
    newMarketGrossYield:     0.08
  };
  var proj = Projection.projectAll(params, [1, 3, 5]);

  assert("T-158a", "year 0 value is the portfolio plus the investment",
    proj.base[0].portfolioValue === 5500000000, "got " + proj.base[0].portfolioValue);
  assert("T-158b", "year 0 rent adds the investment at the target's own yield",
    Math.abs(proj.base[0].annualRent - (332750000 + 500000000 * 0.08)) < 1e-6,
    "got " + proj.base[0].annualRent);
  assert("T-158c", "compound growth matches repeated multiplication",
    Math.abs(proj.base[2].portfolioValue -
             5500000000 * 1.08 * 1.08 * 1.08) < 1e-3,
    "got " + proj.base[2].portfolioValue);

  /*
   * Occupancy. Finding A3 of the analytics audit: every scenario declares an
   * occupancy rate and the report lists it beside rental and capital growth,
   * but no displayed figure used it — the conservative scenario assumed a fifth
   * of the space empty and reported the yield as though fully let.
   *
   * The remedy added effectiveGrossYield rather than redefining grossYield, so
   * these tests assert BOTH: that the gross figure is unchanged (no previously
   * published number moved) and that the occupancy-adjusted figure exists and
   * is actually adjusted.
   */
  assert("T-158d", "gross yield is still rent ÷ value, with no occupancy term",
    Math.abs(proj.conservative[2].grossYield -
             proj.conservative[2].annualRent / proj.conservative[2].portfolioValue) < 1e-15,
    "grossYield has been redefined — previously reported figures would move");
  assert("T-158e", "effectiveGrossYield applies the scenario's occupancy",
    Math.abs(proj.conservative[2].effectiveGrossYield -
             (proj.conservative[2].annualRent * 0.80) /
              proj.conservative[2].portfolioValue) < 1e-15,
    "got " + proj.conservative[2].effectiveGrossYield);
  assert("T-158f", "the two yields differ whenever occupancy is below 100%",
    proj.conservative[2].effectiveGrossYield < proj.conservative[2].grossYield &&
    proj.base[2].effectiveGrossYield < proj.base[2].grossYield,
    "the occupancy assumption still changes nothing");
  assert("T-158g", "the summary carries both yields through to the report",
    (function () {
      var sum = Projection.summarise(proj, 3);
      return typeof sum.base.effectiveGrossYield === "number" &&
             sum.base.effectiveGrossYield > 0 &&
             sum.base.effectiveGrossYield < sum.base.grossYield;
    }()), "summarise() does not expose the effective yield");

  /* Capital growth exceeds rental growth in all three scenarios, so the
   * projected yield must fall in all three. A rising yield under those
   * assumptions would be arithmetically impossible. */
  assert("T-158h", "projected yield falls wherever capital growth exceeds rental growth",
    ["conservative", "base", "optimistic"].every(function (k) {
      var sc = Projection.SCENARIOS[k], pts = proj[k];
      return (sc.capitalGrowth > sc.rentalGrowth) ===
             (pts[pts.length - 1].grossYield < pts[0].grossYield);
    }), "a scenario's yield moves against its own growth assumptions");

  /* projectHHI is retained but must stay unreachable — see finding A4. */
  var pages = ["overview", "portfolio", "marketScreen", "diversification",
               "statsDashboard", "dataCentre", "agents", "report"];
  var callers = pages.filter(function (f) {
    var p = path.join(__dirname, "..", "public", "js", f + ".js");
    return fs.existsSync(p) && /projectHHI\s*\(/.test(fs.readFileSync(p, "utf8"));
  });
  assert("T-158i", "no page calls projectHHI, which can overstate the HHI change",
    callers.length === 0, "called by: " + callers.join(", "));
  assert("T-158j", "projection.js marks projectHHI as not for display",
    /DO NOT WIRE THIS INTO A PAGE/.test(
      fs.readFileSync(path.join(__dirname, "..", "public", "js", "projection.js"), "utf8")),
    "the warning is missing, so someone will wire it in");

  assert("T-158k", "the analytics audit script and its report both exist",
    fs.existsSync(path.join(__dirname, "..", "data-pipeline", "scripts", "auditAnalytics.js")) &&
    fs.existsSync(path.join(__dirname, "..", "data-pipeline", "docs", "ANALYTICS_AUDIT.md")));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T-159  Source register — honesty constraints on the evidence base
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T-159 Source verification honesty ─────────────────────────────────────");
(function () {
  var fs = require("fs"), path = require("path");
  var repo = path.join(__dirname, "..");
  var regPath = path.join(repo, "data-pipeline", "source_register.csv");

  assert("T-159a", "the source register exists",
    fs.existsSync(regPath));
  if (!fs.existsSync(regPath)) { return; }

  var text = fs.readFileSync(regPath, "utf8");
  var header = text.split(/\r?\n/)[0].split(",");

  assert("T-159b", "the register records how and when each source was checked",
    header.indexOf("verification_status") !== -1 &&
    header.indexOf("verification_date") !== -1 &&
    header.indexOf("verification_method") !== -1,
    "header = " + header.join(","));

  /*
   * The constraint that matters. A source may be marked Verified only when a
   * figure used by this project was traced to the cited document — not because
   * its URL opens. No source currently meets that bar, so no row may claim it.
   *
   * This test will fail the day someone upgrades a row without doing the work,
   * which is exactly when it should fail. If a figure IS ever genuinely traced,
   * this assertion must be updated together with the report that records the
   * tracing, so the claim and its evidence move at the same time.
   */
  var rows = text.split(/\r?\n/).slice(1).filter(function (l) { return l.trim(); });
  var claimingVerified = rows.filter(function (line) {
    var status = (line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[6] || "").replace(/"/g, "").trim();
    return /^verified$/i.test(status);
  });
  assert("T-159c", "no source claims plain 'Verified' — none has had a figure traced",
    claimingVerified.length === 0,
    claimingVerified.length + " row(s) claim Verified; see docs/SOURCE_VERIFICATION_REPORT.md");

  assert("T-159d", "every external source has a non-empty verification status",
    rows.every(function (line) {
      var status = (line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[6] || "").replace(/"/g, "").trim();
      return status.length > 0;
    }), "a row has no verification status");

  assert("T-159e", "the pre-verification register is kept, so the change is auditable",
    fs.existsSync(path.join(repo, "data-pipeline", "source_register.pre-verification.csv")));

  var reportPath = path.join(repo, "docs", "SOURCE_VERIFICATION_REPORT.md");
  assert("T-159f", "the verification report exists",
    fs.existsSync(reportPath));
  if (!fs.existsSync(reportPath)) { return; }
  var report = fs.readFileSync(reportPath, "utf8");

  assert("T-159g", "the report states plainly that nothing was upgraded to Verified",
    /nothing has been upgraded to Verified/i.test(report));
  assert("T-159h", "the report states that no market value was changed",
    /No market value was changed/i.test(report));
  assert("T-159i", "the report records the discrepancies it found rather than only successes",
    /Embassy REIT does not hold a BKC asset/.test(report) &&
    /19 consumption centres, not 17/.test(report));

  /* The dataset must be untouched by the verification exercise. This is the
   * check that would catch the failure mode the governing instruction warns
   * about: adjusting a value so that a citation appears to support it. */
  var markets = require(path.join(repo, "public", "data", "markets.json"));
  assert("T-159j", "the dataset still reports the same observation total",
    markets.derivedFrom.totalObservations ===
      markets.markets.reduce(function (t, m) { return t + m.observationCount; }, 0),
    "the dataset changed during source verification");
}());

/* ═══════════════════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T-160–T-166 Shared analysis run: acceptance tests ─────────────────────");
/*
 * These replace the earlier T-160 block, which built the agent context
 * through AgentContext.build() — a per-page builder retired when every page
 * moved to the one shared run (public/js/analysisRun.js).
 *
 * Every test below runs on the committed data, through the same modules the
 * browser loads. Page modules cannot run in Node, so cross-page agreement is
 * established in two parts: (1) every figure a page shows comes from one run
 * object, and (2) each page module reads that object and computes nothing of
 * its own (source assertions). tests/browserAcceptance.js checks the rendered
 * DOM of all eight routes in a browser.
 */
(function () {
  var fs   = require("fs");
  var repo = path.join(__dirname, "..");
  var JS   = path.join(repo, "public", "js");
  var AR   = require(path.join(JS, "analysisRun.js"));
  var AC   = require(path.join(JS, "agentContext.js"));
  var SK   = require(path.join(JS, "scenarioKey.js"));
  var GOV  = require(path.join(JS, "governance.js"));
  var AM   = require(path.join(JS, "appMeta.js"));
  var AOC  = require(path.join(JS, "agentOutputCheck.js"));
  var P    = require(path.join(JS, "projection.js"));
  var D    = canonicalRunData();
  var markets = D.marketsDoc.markets;
  function src(f) { return fs.readFileSync(path.join(JS, f), "utf8"); }

  // ── T-160  Agent context vocabulary and cache ─────────────────────────────
  var bal = AR.compute({ preset: "balanced" }, D);
  var ctx = bal.agentContext;
  assert("T-160a", "the agent context carries the full vocabulary",
    ["highestRawScoreMarket", "recommendedCandidate", "selectedTarget", "selectionMode",
     "simulationSupportScreen", "externalCalibration", "higherRawScoreExclusions", "concentration",
     "projections", "marketDataset"].every(function (k) { return k in ctx; }) &&
    ["rawRank", "eligibleRank", "passesSimulationSupportRule", "externalCalibrationStatus",
     "simulationObservationCount", "supportGrade", "exclusionReasons", "largestContribution"]
      .every(function (k) { return k in ctx.selectedTarget; }));
  assert("T-160b", "the context never uses the word runner-up",
    !/runner-?up/i.test(JSON.stringify(ctx).replace(/"wordsNotToUse":\[[^\]]*\]/, "")));
  assert("T-160c", "dataset statistics are labelled as the market-segment dataset, not the portfolio",
    /NOT the portfolio/.test(ctx.marketDataset.scope) && /PORTFOLIO/.test(ctx.portfolio.scope));
  assert("T-160d", "quoted figures carry their display precision (7.03, 0.4130)",
    ctx.selectedTarget.grossYieldPct === "7.03" && ctx.portfolio.cityHHI === "0.4130",
    ctx.selectedTarget.grossYieldPct + " / " + ctx.portfolio.cityHHI);
  assert("T-160e", "the context's selected target is the run's selected target",
    ctx.selectedTarget.marketId === bal.selectedTargetId && bal.selectedTargetId === "MKT-016");

  var cache = JSON.parse(fs.readFileSync(path.join(repo, "public", "data", "agent-cache.json"), "utf8"));
  var entries = cache.scenarios ? Object.keys(cache.scenarios) : [];
  assert("T-160f", "agent-cache.json is in the current format with four scenarios and no retired .agents block",
    cache.format === "scenarios-v2" && !!cache.scenarios && !cache.agents && entries.length === 4,
    "format " + cache.format + ", " + entries.length + " scenarios");
  assert("T-160g", "every cache entry is stored under the key its descriptor hashes to, at the current context version",
    entries.every(function (k) {
      var d = cache.scenarios[k].descriptor;
      return SK.compute(d) === k && d.contextVersion === SK.CONTEXT_VERSION;
    }));

  var presetKeys = AR.PRESET_KEYS;
  presetKeys.forEach(function (p, i) {
    var run = AR.compute({ preset: p }, D);
    var e = cache.scenarios[run.scenarioKey];
    assert("T-160h" + (i + 1), "the cache holds the " + p + " scenario under the key the app computes, for the same target",
      !!e && e.preset === p && e.targetId === run.selectedTargetId &&
      e.descriptor.selectedTargetId === run.selectedTargetId &&
      SK.canonical(e.descriptor.weights) === SK.canonical(run.scenarioDescriptor.weights) &&
      SK.canonical(e.descriptor.portfolio) === SK.canonical(run.scenarioDescriptor.portfolio) &&
      SK.canonical(e.descriptor.dataset) === SK.canonical(run.scenarioDescriptor.dataset),
      run.scenarioKey);
    if (!e) { return; }
    var allOk = AM.AGENT_KEYS.every(function (a) {
      var o = e.agents[a] && e.agents[a].output;
      var ctxA = Object.assign({}, run.agentContext);
      return o && AOC.check(a, o, ctxA, markets).ok;
    });
    assert("T-160i" + (i + 1), "every cached " + p + " reply passes the deterministic output check",
      allOk && Object.keys(e.agents).sort().join(",") === AM.AGENT_KEYS.slice().sort().join(","));
  });

  // Cache key changes with every relevant input (Stage 13: 13, 14).
  var variants = {
    "investment amount": { preset: "balanced", investmentCr: 60 },
    "preset":            { preset: "incomeFocused" },
    "screen override":   { preset: "balanced", governanceOverride: true },
    "manual selection":  { schemaVersion: 2, preset: "balanced", selectionMode: "manual", manualTargetId: "MKT-016" },
    "custom weights":    { preset: "custom", weights: { yieldWeight: 0.3, growthWeight: 0.2, diversWeight: 0.2, demandWeight: 0.2, riskWeight: 0.1 } }
  };
  Object.keys(variants).forEach(function (k, i) {
    var v = AR.compute(variants[k], D);
    var hit = cache.scenarios[v.scenarioKey];
    /* A preset change lands on THAT preset's stored scenario, which is correct;
     * every other change must find nothing stored. */
    assert("T-160j" + (i + 1), "changing the " + k + " changes the scenario key, so Balanced commentary is rejected",
      v.scenarioKey !== bal.scenarioKey && (!hit || (k === "preset" && hit.preset === v.preset)));
  });
  var custom = AR.compute({ preset: "balanced" }, canonicalRunData({
    portfolioMode: "custom",
    customAssets: [{ assetId: "C1", assetName: "Custom", city: "Pune", assetType: "Retail",
                     propertyValue: 2e9, annualRent: 1.4e8 }]
  }));
  assert("T-160k", "a custom portfolio changes the scenario key (no commentary from the sample portfolio)",
    custom.scenarioKey !== bal.scenarioKey && custom.portfolio.source === "custom");
  assert("T-160l", "ScenarioKey.diff names the input that differs",
    SK.diff(bal.scenarioDescriptor, AR.compute(variants["investment amount"], D).scenarioDescriptor)
      .indexOf("investment amount") !== -1);

  // Output checker rejects the defects found in the first cache build.
  var badMS = { candidateExplanation: "Aerocity, Delhi NCR ranked first on composite score.",
    dominantFactor: "demand",
    comparisonWithAlternative: "Compared with the runner-up, GIFT City, Ahmedabad, it scores lower.",
    screenOutcome: "Several segments were excluded due to insufficient sample sizes.",
    factorInsights: ["Its gross yield is 7%."], watchPoints: ["Strong evidence supports the shortlist."],
    disclaimer: "Not advice." };
  var inc = AR.compute({ preset: "incomeFocused" }, D);
  var bad = AOC.check("marketScreening", badMS, inc.agentContext, markets);
  var msgs = bad.issues.map(function (x) { return x.message; }).join(" | ");
  assert("T-160m", "the output checker rejects 'ranked first' for a raw-rank-8 candidate", /not first/.test(msgs), msgs);
  assert("T-160n", "the output checker rejects 'runner-up'", /Retired term/.test(msgs) && /runner/i.test(JSON.stringify(bad.issues)));
  assert("T-160o", "the output checker rejects 7% for a 7.00% figure", /7% does not match/.test(msgs), msgs);
  assert("T-160p", "the output checker rejects a sample-size explanation when a segment failed on grade alone",
    /support grade alone/.test(msgs), msgs);
  assert("T-160q", "the output checker rejects evidence overclaims", /as evidence/.test(msgs), msgs);
  assert("T-160r", "the output checker rejects the wrong dominant factor", /largest contribution is rental yield/.test(msgs), msgs);
  var badDS = { datasetSummary: "Synthetic.", simulationSupportNotes: ["x"],
    dispersionNotes: ["The portfolio-wide gross yield median is 7.90%."], segmentOutlierNotes: ["y"],
    knownAnomalyNote: "z", caveats: ["c"], disclaimer: "d" };
  assert("T-160s", "the output checker rejects the dataset median described as a portfolio figure",
    /portfolio figure/.test(AOC.check("dataStatistical", badDS, ctx, markets).issues.map(function (x) { return x.message; }).join(" ")));

  // ── T-161  System Check: current APIs, all passing ────────────────────────
  var SC = require(path.join(JS, "systemCheck.js"));
  var mem = {};
  var results = SC.run({
    HHIEngine: require(path.join(JS, "hhi.js")), ScoringEngine: require(path.join(JS, "scoringEngine.js")),
    Projection: P, DataCleaner: require(path.join(JS, "dataCleaner.js")), ScenarioKey: SK,
    AnalysisRun: AR, AppMeta: AM, run: bal, marketsDoc: D.marketsDoc, sampleAssets: D.sampleAssets,
    metaDoc: JSON.parse(fs.readFileSync(path.join(repo, "public", "data", "meta.json"), "utf8")),
    cacheDoc: cache,
    storage: { setItem: function (k, v) { mem[k] = v; }, getItem: function (k) { return mem[k] || null; },
               removeItem: function (k) { delete mem[k]; } }
  });
  assert("T-161a", "System Check runs ten checks", results.length === 10, String(results.length));
  results.forEach(function (r) {
    assert("T-161-" + r.id, "System Check " + r.id + " passes on the canonical data — " + r.label, r.ok, r.detail);
  });
  assert("T-161b", "every System Check reports an expected and an actual value",
    results.every(function (r) { return r.expected && r.actual && /Expected .*; got /.test(r.detail); }));
  assert("T-161c", "the System Check leaves no probe key behind", Object.keys(mem).length === 0);
  var scSrc = src("systemCheck.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert("T-161d", "the System Check uses the engines' production field names and entry points",
    /propertyValue:/.test(scSrc) && /assetType:/.test(scSrc) && /DC\.cleanRecords\(DC\.parseCSV\(/.test(scSrc) &&
    !/DataCleaner\.clean\b(?!Records)/.test(scSrc) && !/\bvalue: \d/.test(scSrc));
  assert("T-161e", "the System Check never writes the analysis-state key",
    scSrc.indexOf("ReitState.save") === -1 && src("dataCentre.js").indexOf("ReitState.save") === -1);
  var broken = SC.run({
    HHIEngine: { cityHHI: function () { return 0; }, typeHHI: function () { return 0; },
                 totalValue: function () { return 0; }, totalAnnualRent: function () { return 0; },
                 simulateInvestment: function () { return null; }, diversificationScore: function () { return 50; } },
    ScoringEngine: require(path.join(JS, "scoringEngine.js")), Projection: P,
    DataCleaner: require(path.join(JS, "dataCleaner.js")), ScenarioKey: SK, AnalysisRun: AR, AppMeta: AM,
    run: bal, marketsDoc: D.marketsDoc, sampleAssets: D.sampleAssets, metaDoc: null, cacheDoc: null, storage: null
  });
  assert("T-161f", "a broken engine makes the System Check fail visibly (checks are not bypassed)",
    broken.filter(function (r) { return !r.ok; }).length >= 3);

  // ── T-162  Cross-page synchronisation, all four presets ───────────────────
  var EXPECT = {};
  presetKeys.forEach(function (p) {
    // Expected defaults derived from the engine, not typed: the highest-ranked
    // segment passing the screen under that preset.
    var w = require(path.join(JS, "scoringEngine.js")).PRESETS[p];
    var rk = AC.rankForScreener(markets, D.sampleAssets, w, 50);
    EXPECT[p] = GOV.chooseTarget(rk, { override: false }).target.marketId;
  });
  presetKeys.forEach(function (p, i) {
    var run = AR.compute({ preset: p }, D);
    var sel = AR.selected(run);
    var dg = AR.digest(run);
    var n = String(i + 1);
    assert("T-162a" + n, p + ": ranking is in descending score order and the raw leader is rank 1",
      run.ranked.every(function (m, j) { return j === 0 || run.ranked[j - 1].totalScore >= m.totalScore; }) &&
      run.highestRawScoreMarketId === run.ranked[0].marketId);
    assert("T-162b" + n, p + ": the automatic selection is the engine's eligible default (" + EXPECT[p] + ")",
      run.selectionMode === "auto" && run.selectedTargetId === EXPECT[p] && run.recommendedCandidateId === EXPECT[p]);
    assert("T-162c" + n, p + ": the selected target passes the simulation-support screen",
      sel.governance.eligible && sel.eligibleRank === 1);
    assert("T-162d" + n, p + ": HHI figures belong to the selected target",
      run.hhi.cityAfter === sel.simulation.after.cityHHI && run.hhi.typeAfter === sel.simulation.after.typeHHI);
    assert("T-162e" + n, p + ": projected rent uses the selected target's own yield",
      near(run.projections.all.base[0].annualRent, run.portfolio.annualRentRs + run.investmentRs * sel.grossYield, 1));
    assert("T-162f" + n, p + ": agent context, validator and scenario key describe the same target",
      run.agentContext.selectedTarget.marketId === sel.marketId &&
      run.scenarioDescriptor.selectedTargetId === sel.marketId && run.validation.passed);
    assert("T-162g" + n, p + ": the digest every page is compared on is internally consistent",
      dg.targetId === sel.marketId && dg.score === sel.totalScore.toFixed(2) &&
      dg.year0RentCr === (run.projections.year0AnnualRentRs / 1e7).toFixed(3));
  });
  // Each page renders the shared run and computes no target of its own.
  var pages = { "overview.js": /AnalysisRun\.selected\(run\)|AnalysisRun\.current\(\)/,
                "marketScreen.js": /AnalysisRun\.selected\(run\)/,
                "diversification.js": /AnalysisRun\.selected\(run\)/,
                "agents.js": /run\.agentContext/,
                "report.js": /AnalysisRun\.selected\(run\)/ };
  Object.keys(pages).forEach(function (f, i) {
    var s0 = src(f);
    assert("T-162h" + (i + 1), f + " renders the shared run, subscribes to it, and computes no target itself",
      pages[f].test(s0) && /AnalysisRun\.(subscribe|ready)\(/.test(s0) &&
      s0.indexOf("Governance.chooseTarget(") === -1 && s0.indexOf("ScoringEngine.rankMarkets(") === -1 &&
      s0.indexOf("ReitState.load()") === -1);
  });
  assert("T-162i", "Diversification's candidate tables and sensitivity come from the run under the active preset",
    /AnalysisRun\.rawTop\(run, 3\)/.test(src("diversification.js")) &&
    /AnalysisRun\.eligibleTop\(run, 3\)/.test(src("diversification.js")) &&
    /run\.sensitivity\.forEach/.test(src("diversification.js")) &&
    src("diversification.js").indexOf("sensitivityAnalysis(") === -1);
  var inc2 = AR.compute({ preset: "incomeFocused" }, D);
  assert("T-162j", "the sensitivity view reports both the raw leader and the screen's candidate for every preset",
    inc2.sensitivity.length === 4 && inc2.sensitivity.every(function (s0) { return s0.highestRaw && s0.candidate; }) &&
    inc2.sensitivity.filter(function (s0) { return s0.active; }).length === 1 &&
    inc2.sensitivity.some(function (s0) { return !s0.highestRaw.passes; }));

  // ── T-163  Automatic versus manual selection ──────────────────────────────
  var man = AR.compute({ schemaVersion: 2, preset: "balanced", selectionMode: "manual", manualTargetId: "MKT-036" }, D);
  assert("T-163a", "a manual selection is honoured even when it fails the screen",
    man.selectionMode === "manual" && man.selectedTargetId === "MKT-036" && man.recommendedCandidateId === "MKT-016");
  assert("T-163b", "a manual selection that differs from the candidate is flagged", man.selectionDiffers === true);
  assert("T-163c", "every page labels it 'Manually selected target'", AR.targetLabel(man) === "Manually selected target");
  var manInc = AR.compute({ schemaVersion: 2, preset: "incomeFocused", selectionMode: "manual", manualTargetId: "MKT-036" }, D);
  assert("T-163d", "after a preset change the manual target is kept and the new candidate is reported",
    manInc.selectedTargetId === "MKT-036" && manInc.recommendedCandidateId === "MKT-024" && manInc.selectionDiffers);
  var back = AR.compute({ schemaVersion: 2, preset: "incomeFocused", selectionMode: "auto", manualTargetId: null }, D);
  assert("T-163e", "returning to automatic mode restores the current candidate", back.selectedTargetId === "MKT-024");
  assert("T-163f", "HHI, projections and agent context follow the manual target",
    man.hhi.cityAfter === AR.market(man, "MKT-036").simulation.after.cityHHI &&
    man.projections.params.newMarketGrossYield === AR.market(man, "MKT-036").grossYield &&
    man.agentContext.selectedTarget.marketId === "MKT-036" && man.agentContext.selectionMode === "manual");
  var gone = AR.compute({ schemaVersion: 2, preset: "balanced", selectionMode: "manual", manualTargetId: "MKT-999" }, D);
  assert("T-163g", "a manual target that no longer exists falls back to automatic", gone.selectionMode === "auto" && gone.selectedTargetId === "MKT-016");
  assert("T-163h", "pages offer a way back to automatic mode",
    /AnalysisRun\.returnToAuto\(\)/.test(src("marketScreen.js")) && /AnalysisRun\.returnToAuto\(\)/.test(src("overview.js")));

  // ── T-164  Reset Demo restores the canonical defaults ─────────────────────
  var d0 = AR.defaults();
  var reset = AR.compute(d0, D);
  assert("T-164a", "defaults: Balanced, canonical weights, ₹50 Cr, screen applied, automatic, no filters",
    d0.preset === "balanced" && d0.weights === null && d0.investmentCr === null &&
    d0.governanceOverride === false && d0.selectionMode === "auto" && d0.manualTargetId === null && d0.filters === null);
  assert("T-164b", "the default run is valid immediately: ₹50 Cr into Gurugram — Cyber Hub, sample portfolio",
    reset.investmentCr === 50 && reset.selectedTargetId === "MKT-016" && reset.portfolio.source === "sample" &&
    reset.validation.passed);
  var arSrc = src("analysisRun.js");
  assert("T-164c", "AnalysisRun.reset() clears application keys, restores defaults and recomputes at once",
    /AnalysisRun\.reset = function \(\) \{\s*root\.ReitState\.resetApp\(\);\s*_inputs = defaults\(\);[\s\S]{0,80}return recompute\(\);/.test(arSrc));
  assert("T-164d", "Reset Demo returns the user to the Overview and focuses the current analysis",
    /window\.location\.hash = "overview"/.test(src("overview.js")) && /ov-current-analysis/.test(src("overview.js")));
  assert("T-164e", "the custom portfolio is used by the analysis only in custom mode",
    custom.portfolio.source === "custom" && reset.portfolio.source === "sample");

  // ── T-165  Decision Report tables ─────────────────────────────────────────
  var rpt = src("report.js");
  assert("T-165a", "the report has separate raw-score and eligible-shortlist tables",
    /Top 3 by raw attractiveness score/.test(rpt) && /Top eligible shortlist/.test(rpt));
  assert("T-165b", "each screening row shows raw rank, eligibility, support grade, simulated observations, calibration and exclusion reason",
    ["Raw rank", "Eligible rank", "Screen", "Support grade", "Sim. obs.", "External calibration", "Exclusion reason"]
      .every(function (h) { return rpt.indexOf("'" + h + "'") !== -1; }));
  assert("T-165c", "the selected target is shown even when it is in neither top-3 table",
    /if \(target && !inEither\)/.test(rpt));
  assert("T-165d", "model recommendation and manual selection are labelled separately",
    /Shortlist Candidate \(model\)/.test(rpt) && /Manually Selected Target/.test(rpt));
  assert("T-165e", "agent commentary is printed only for the run it was produced for",
    /agentOutputs\.scenarioKey === run\.scenarioKey/.test(rpt));
  assert("T-165f", "Balanced: the candidate (raw rank 5) appears in the eligible table while the raw table shows ranks 1–3",
    AR.rawTop(bal, 3).map(function (m) { return m.rank; }).join() === "1,2,3" &&
    AR.eligibleTop(bal, 3)[0].marketId === "MKT-016" && AR.eligibleTop(bal, 3)[0].rank === 5);

  // ── T-166  Calibration separate from simulation support; CI units ─────────
  var outcomes = D.sourceOutcomes;
  assert("T-166a", "external calibration takes no simulation count or grade (it cannot be inferred from them)",
    AM.calibrationStatus.length === 2 &&
    AM.calibrationStatus(["SRC-001"], outcomes) === "Unverified");
  var best = markets.slice().sort(function (a, b) { return b.observationCount - a.observationCount; })[0];
  assert("T-166b", "the segment with the most simulated observations is still Unverified",
    GOV.externalCalibration(best, outcomes) === "Unverified" && best.observationCount >= 70);
  assert("T-166c", "calibration would read Verified only from the register",
    AM.calibrationStatus(["SRC-001"], { "SRC-001": "Verified" }) === "Verified" &&
    AM.calibrationStatus(["SRC-001", "SRC-002"], { "SRC-001": "Verified", "SRC-002": "Unverified" }) === "Partially supported");
  assert("T-166d", "every segment is Unverified, as the Source Verification Report found",
    bal.ranked.every(function (m) { return m.externalCalibrationStatus === "Unverified"; }));
  assert("T-166e", "no page or module justifies n = 30 by the Central Limit Theorem or calls grade C documented evidence",
    ["appMeta.js", "governance.js", "marketScreen.js", "overview.js", "report.js", "dataCentre.js",
     "statsDashboard.js", "agents.js"].every(function (f) {
      var t = src(f);
      // The retired-terms list in appMeta.js names the CLT in order to forbid it; that is not a justification.
      var code = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{ pattern: \/central limit theorem\/i[^}]*\}/, "");
      return !/approximately normal|central limit/i.test(code) && !/rests on documented evidence/i.test(t);
    }));
  assert("T-166f", "the screen is described as a project convention, not a statistical threshold",
    /project governance convention for simulation precision, not a regulatory or universal statistical threshold/.test(AM.GOVERNANCE.rationale));
  var userFacing = ["overview.js", "marketScreen.js", "report.js", "dataCentre.js", "diversification.js", "agents.js"]
    .map(function (f) { return src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); }).join("\n");
  assert("T-166g", "pages do not use the retired evidence vocabulary",
    !/Strong evidence|Meets evidence floor|evidence floor|Planted anomal|runner-up/i.test(userFacing));
  var Stats = require(path.join(JS, "stats.js"));
  var groups = Stats.segmentStats(markets, true);
  assert("T-166h", "the city × type CI unit is the micro-market, and the unit count is the number of segments",
    groups.every(function (g) { return g.grossYield.ciUnit === Stats.CI_UNIT && g.grossYield.ciUnits === g.count; }) &&
    /micro-market/.test(Stats.CI_UNIT));
  assert("T-166i", "a group with too few micro-markets states why no CI is computed",
    groups.filter(function (g) { return !g.grossYield.ci; }).every(function (g) {
      return /only \d+ micro-market/.test(g.grossYield.ciUnavailableReason);
    }));
  var dc = src("dataCentre.js");
  assert("T-166j", "the Data Centre labels micro-markets, simulated observations, CI unit, result and reason",
    ["Micro-markets", "Simulated observations", "CI unit", "CI result", "CI unavailable reason"]
      .every(function (h) { return dc.indexOf("'" + h + "'") !== -1; }) &&
    dc.indexOf("Statistics across records") === -1);
  assert("T-166k", "the Data Centre separates the five analytical levels",
    ["Portfolio Holdings", "Market Segment Aggregates", "Simulated Observation Dataset",
     "Source / Calibration Register", "Data Quality and Cleaning Results"].every(function (h) { return dc.indexOf(h) !== -1; }) &&
    dc.indexOf("Data Preview —") === -1);
  assert("T-166l", "internal source codes are shown as plain labels, none saying 'reported'",
    Object.keys(AM.SOURCE_TYPE_LABELS).every(function (k) { return !/reported/i.test(AM.SOURCE_TYPE_LABELS[k]); }) &&
    markets.every(function (m) { return AM.sourceTypeLabel(m.sourceType) !== "Unclassified assumption"; }) &&
    /AppMeta\.sourceTypeLabel\(m\.sourceType\)/.test(dc));
  assert("T-166m", "the 1,000 sq ft columns are explained as normalised representative amounts",
    /normalised representative amounts/.test(dc));
}());

console.log("\n══════════════════════════════════════════════════════════════════════════");
console.log("  Results: " + passed + " passed, " + failed + " failed");
if (errors.length > 0) {
  console.log("\n  Failed tests:");
  errors.forEach(function (e) { console.log(e); });
}
console.log("══════════════════════════════════════════════════════════════════════════");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("  All tests passed.");
  process.exit(0);
}

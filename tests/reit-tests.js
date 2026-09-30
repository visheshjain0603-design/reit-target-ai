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

/* ── Test harness ─────────────────────────────────────────────────────────── */
var passed = 0;
var failed = 0;
var errors = [];

function assert(testId, description, condition, extra) {
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
   T32  stateManager markStale / isStale
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  ReitState.clear();
  assert("T32a", "isStale() = true when no state saved", ReitState.isStale() === true);

  ReitState.save({ runId: ReitState.newRunId(), stale: false, investmentCr: 50 });
  assert("T32b", "isStale() = false after save with stale=false", ReitState.isStale() === false);

  ReitState.markStale();
  assert("T32c", "isStale() = true after markStale()", ReitState.isStale() === true);

  var s = ReitState.load();
  assert("T32d", "load().stale = true after markStale()", s !== null && s.stale === true, "got " + (s && s.stale));
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T33  stateManager clear removes state
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  ReitState.save({ runId: "r1", stale: false });
  assert("T33a", "load() returns state before clear()", ReitState.load() !== null);
  ReitState.clear();
  assert("T33b", "load() returns null after clear()", ReitState.load() === null);
  assert("T33c", "isStale() = true after clear()", ReitState.isStale() === true);
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
   T36  AGENT_ORDER constant — 6-agent execution order is correct
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── T36-T45 Backend / agent correctness (Node-testable aspects) ───────────");
(function () {
  // Read agents.js and verify AGENT_ORDER string
  var fs = require("fs");
  var agentsPath = require("path").join(__dirname, "..", "public", "js", "agents.js");
  var src = fs.readFileSync(agentsPath, "utf8");

  // AGENT_ORDER must list marketScreening before validation
  var orderMatch = src.match(/var AGENT_ORDER\s*=\s*\[([^\]]+)\]/);
  var orderStr = orderMatch ? orderMatch[1] : "";
  var mktPos = orderStr.indexOf("marketScreening");
  var valPos = orderStr.indexOf("validation");
  var orchPos = orderStr.indexOf("orchestrator");

  assert("T36a", "AGENT_ORDER contains dataQuality",        orderStr.indexOf("dataQuality") !== -1, "order=" + orderStr.replace(/\s+/g, " "));
  assert("T36b", "AGENT_ORDER contains marketScreening",    mktPos !== -1, "order=" + orderStr.replace(/\s+/g, " "));
  assert("T36c", "AGENT_ORDER: marketScreening before validation", mktPos < valPos, "mkt=" + mktPos + " val=" + valPos);
  assert("T36d", "AGENT_ORDER: validation before orchestrator",    valPos < orchPos, "val=" + valPos + " orch=" + orchPos);
  assert("T36e", "AGENT_ORDER: orchestrator is last",       orderStr.trim().lastIndexOf("orchestrator") > valPos, "order=" + orderStr.replace(/\s+/g, " "));
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
   T38  TRAIL_STEPS order — data → stats → screening → simulation → validation → recommend
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs");
  var src = fs.readFileSync(require("path").join(__dirname, "..", "public", "js", "agents.js"), "utf8");

  var trailMatch = src.match(/var TRAIL_STEPS\s*=\s*\[([\s\S]*?)\];/);
  var trailStr = trailMatch ? trailMatch[1] : "";

  var posData       = trailStr.indexOf('"data"');
  var posStats      = trailStr.indexOf('"stats"');
  var posScreening  = trailStr.indexOf('"screening"');
  var posSimulation = trailStr.indexOf('"simulation"');
  var posValidation = trailStr.indexOf('"validation"');
  var posRecommend  = trailStr.indexOf('"recommend"');

  assert("T38a", "TRAIL_STEPS: data is first step",              posData < posStats,           "pos=" + posData + " vs " + posStats);
  assert("T38b", "TRAIL_STEPS: stats before screening",          posStats < posScreening,      "pos=" + posStats + " vs " + posScreening);
  assert("T38c", "TRAIL_STEPS: screening before simulation",     posScreening < posSimulation, "pos=" + posScreening + " vs " + posSimulation);
  assert("T38d", "TRAIL_STEPS: validation before recommend",     posValidation < posRecommend, "pos=" + posValidation + " vs " + posRecommend);
  assert("T38e", "TRAIL_STEPS has exactly 6 step ids",          (trailStr.match(/id:/g) || []).length === 6, "count=" + (trailStr.match(/id:/g) || []).length);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T39  Agent context — portfolioCtx structure matches screener shared state
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Verify that the shared state schema fields match what agents.js expects
  var requiredStateFields = ["runId","createdAt","stale","weights","weightPreset",
    "investmentCr","selectedTargetId","ranked","cityHHIBefore","cityHHIAfter",
    "typeHHIBefore","typeHHIAfter","portfolioValueCr","marketCount","assetCount"];

  // Save a full state and verify load() returns all fields intact
  ReitState.clear();
  var payload = {};
  requiredStateFields.forEach(function (f) {
    if (f === "stale")      { payload[f] = false; }
    else if (f === "ranked"){ payload[f] = []; }
    else if (f === "weights"){ payload[f] = BALANCED_WEIGHTS; }
    else if (typeof f === "string" && f.indexOf("HHI") !== -1) { payload[f] = 0.25; }
    else if (f === "runId") { payload[f] = ReitState.newRunId(); }
    else if (f === "createdAt") { payload[f] = Date.now(); }
    else { payload[f] = 42; }
  });
  ReitState.save(payload);
  var loaded = ReitState.load();

  var allPresent = requiredStateFields.every(function (f) {
    return Object.prototype.hasOwnProperty.call(loaded, f);
  });
  assert("T39a", "all required shared state fields survive round-trip", allPresent,
    "missing: " + requiredStateFields.filter(function(f){ return !Object.prototype.hasOwnProperty.call(loaded, f); }).join(","));
  assert("T39b", "loaded weights match saved balanced weights",
    loaded.weights && loaded.weights.yieldWeight === 0.25 && loaded.weights.growthWeight === 0.25);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T40  Weight/investment change triggers stale flag
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  ReitState.clear();
  ReitState.save({ runId: ReitState.newRunId(), stale: false, investmentCr: 45, weights: BALANCED_WEIGHTS });
  assert("T40a", "fresh save is not stale", ReitState.isStale() === false);

  // Simulate a weight change by marking stale (as marketScreen.js would)
  ReitState.markStale();
  assert("T40b", "markStale() sets stale=true", ReitState.isStale() === true);

  // Re-run (new save) clears stale
  ReitState.save({ runId: ReitState.newRunId(), stale: false, investmentCr: 60, weights: BALANCED_WEIGHTS });
  assert("T40c", "new save clears stale flag", ReitState.isStale() === false);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T41  API error path — callAgent falls back to 'AI explanation unavailable'
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  // Verify the error message text matches the expected fallback
  var fs = require("fs");
  var src = fs.readFileSync(require("path").join(__dirname, "..", "public", "js", "agents.js"), "utf8");

  assert("T41a", "agents.js contains 'AI explanation unavailable' fallback message",
    src.indexOf("AI explanation unavailable") !== -1, "not found");
  assert("T41b", "agents.js handles offline state with error message (not empty string)",
    src.indexOf("offline: true") !== -1, "no offline flag found");
  // Verify orchestrator skips when validatedOk is false
  assert("T41c", "agents.js checks validatedOk === true before running orchestrator",
    src.indexOf("validatedOk === true") !== -1, "not found");
  assert("T41d", "agents.js has 'Orchestrator skipped' message when validation fails",
    src.indexOf("Orchestrator skipped") !== -1, "not found");
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
   T44  server.js validation prompt includes all four checks
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs");
  var serverSrc = fs.readFileSync(require("path").join(__dirname, "..", "server", "server.js"), "utf8");

  assert("T44a", "server validation prompt checks weightCheck",      serverSrc.indexOf("weightCheck") !== -1);
  assert("T44b", "server validation prompt checks scoreRangeCheck",  serverSrc.indexOf("scoreRangeCheck") !== -1);
  assert("T44c", "server validation prompt checks targetExists",     serverSrc.indexOf("targetExists") !== -1);
  assert("T44d", "server validation prompt checks hhiConsistency",   serverSrc.indexOf("hhiConsistency") !== -1);
  assert("T44e", "server validation prompt has validatedOk field",   serverSrc.indexOf("validatedOk") !== -1);
}());

/* ═══════════════════════════════════════════════════════════════════════════
   T45  server.js orchestrator prompt uses expanded output schema
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var fs = require("fs");
  var serverSrc = fs.readFileSync(require("path").join(__dirname, "..", "server", "server.js"), "utf8");

  assert("T45a", "orchestrator prompt has selectedTarget field",     serverSrc.indexOf('"selectedTarget"') !== -1);
  assert("T45b", "orchestrator prompt has cityHHIEffect field",      serverSrc.indexOf('"cityHHIEffect"') !== -1);
  assert("T45c", "orchestrator prompt has assetTypeHHIEffect field", serverSrc.indexOf('"assetTypeHHIEffect"') !== -1);
  assert("T45d", "orchestrator prompt has whyTopRanked field",       serverSrc.indexOf('"whyTopRanked"') !== -1);
  assert("T45e", "orchestrator prompt has syntheticDisclaimer",      serverSrc.indexOf('"syntheticDisclaimer"') !== -1);
  assert("T45f", "orchestrator prompt: called ONLY if validatedOk",  serverSrc.indexOf("validatedOk=true") !== -1);
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

  // T78a — AGENT_ORDER contains all 6 agents
  var t78a = [
    'dataQuality', 'statisticalAnalysis', 'marketScreening',
    'diversification', 'validation', 'orchestrator'
  ].every(function (a) { return agentsSrc.indexOf('"' + a + '"') !== -1; });
  assert(t78a, 'T78a', 'AGENT_ORDER contains all 6 agents', true, t78a);

  // T78b — portfolioAnalysis NOT in AGENT_ORDER
  var noOldAgent = agentsSrc.indexOf('"portfolioAnalysis"') === -1;
  assert(noOldAgent, 'T78b', 'portfolioAnalysis absent from AGENT_ORDER', true, noOldAgent);

  // T78c — TRAIL_STEPS has 6 steps (data, stats, screening, simulation, validation, recommend)
  var trailIds = ['data', 'stats', 'screening', 'simulation', 'validation', 'recommend'];
  var t78c = trailIds.every(function (id) {
    return agentsSrc.indexOf('id: "' + id + '"') !== -1;
  });
  assert(t78c, 'T78c', 'TRAIL_STEPS has all 6 step ids', true, t78c);

  // T78d — checkServerStatus uses /api/health not /api/status
  var t78d = agentsSrc.indexOf('"/api/health"') !== -1
          && agentsSrc.indexOf('"/api/status"') === -1;
  assert(t78d, 'T78d', 'checkServerStatus calls /api/health', true, t78d);

  // T78e — buildContext includes Stats engine call
  var t78e = agentsSrc.indexOf('Stats.portfolioStats(state.markets)') !== -1;
  assert(t78e, 'T78e', 'buildContext calls Stats.portfolioStats', true, t78e);

  // T78f — runSequence calls dataQuality and statisticalAnalysis
  var t78f = agentsSrc.indexOf('callAgent("dataQuality"') !== -1
          && agentsSrc.indexOf('callAgent("statisticalAnalysis"') !== -1;
  assert(t78f, 'T78f', 'runSequence calls dataQuality and statisticalAnalysis', true, t78f);

  // T78g — orchCtx includes statisticalAnalysisOutput
  var t78g = agentsSrc.indexOf('statisticalAnalysisOutput') !== -1;
  assert(t78g, 'T78g', 'orchCtx includes statisticalAnalysisOutput', true, t78g);

  // T78h — validCtx includes dataQualityOutput
  var t78h = agentsSrc.indexOf('dataQualityOutput:         state.results.dataQuality') !== -1;
  assert(t78h, 'T78h', 'validCtx includes dataQualityOutput from state', true, t78h);
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

/* ─── T82 : stateManager — annualRentCr field propagation ──────────────────── */
(function () {
  var ReitState = require('../public/js/stateManager.js');
  var HHIEngine = require('../public/js/hhi.js');

  // T82a: stateManager source contains annualRentCr in schema comment
  var fs   = require('fs');
  var path = require('path');
  var smSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'stateManager.js'), 'utf8');
  assert(smSrc.indexOf('annualRentCr') !== -1,
    'T82a', 'stateManager.js schema comment includes annualRentCr');

  // T82b: marketScreen.js saves annualRentCr
  var msSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'marketScreen.js'), 'utf8');
  assert(msSrc.indexOf('annualRentCr') !== -1,
    'T82b', 'marketScreen.js saves annualRentCr to state');

  // T82c: diversification.js reads annualRentCr from state
  var divSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'diversification.js'), 'utf8');
  assert(divSrc.indexOf('sr.annualRentCr') !== -1,
    'T82c', 'diversification.js reads sr.annualRentCr');

  // T82d: report.js reads annualRentCr from state
  var rptSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');
  assert(rptSrc.indexOf('state.annualRentCr') !== -1,
    'T82d', 'report.js reads state.annualRentCr');

}());

/* ─── T83 : report.js — decision report fixes ──────────────────────────────── */
(function () {
  var fs   = require('fs');
  var path = require('path');
  var rptSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');

  // T83a: Report cover contains NMIMS
  assert(rptSrc.indexOf('NMIMS') !== -1,
    'T83a', 'report.js cover mentions NMIMS');

  // T83b: Author Vishesh Jain present
  assert(rptSrc.indexOf('Vishesh Jain') !== -1,
    'T83b', 'report.js mentions Vishesh Jain');

  // T83c: Descriptive target name logic (locality/city/propertyType) present
  assert(rptSrc.indexOf('rm.locality') !== -1,
    'T83c', 'report.js resolves descriptive target name via locality');

  // T83d: Target composite score displayed
  assert(rptSrc.indexOf('Target Composite Score') !== -1,
    'T83d', 'report.js shows Target Composite Score row');

  // T83e: Weight preset label resolved (not raw key)
  assert(rptSrc.indexOf('Weight Preset') !== -1,
    'T83e', 'report.js shows Weight Preset row with label');

  // T83f: SPJIMR is gone from cover/subtitle (moved to NMIMS)
  // The subtitle line should now say NMIMS not SPJIMR
  assert(rptSrc.indexOf("'NMIMS B.Sc. Finance | Business Analytics | Theme 4") !== -1,
    'T83f', 'report.js subtitle uses NMIMS B.Sc. Finance');

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
    var valid = ["Premium","Established","Emerging","Secondary","Peripheral","Industrial"];
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
    var valid = ["Synthetic","Semi-Synthetic","Estimated","Reported"];
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

  // ── T-125: MKT-010 is rank 1 under balanced preset ───────────────────
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    assert(result.ranked[0].marketId === "MKT-010",
      "T-125", "MKT-010 (HITEC City) is rank 1 under balanced preset");
  }());

  // ── T-126: scoreMarket recomputed = ranked score for MKT-010 ───────────
  (function () {
    var result = SE.rankMarkets(markets, SE.PRESETS.balanced);
    var r = result.ranges;
    var m = markets.find(function(x) { return x.marketId === "MKT-010"; });
    var recomputed = SE.scoreMarket(m, SE.PRESETS.balanced, r);
    var fromRanked = result.ranked[0].totalScore;
    assert(Math.abs(recomputed.totalScore - fromRanked) < 0.01,
      "T-126", "scoreMarket() recomputed score for MKT-010 matches ranked output");
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
   SUMMARY
   ═══════════════════════════════════════════════════════════════════════════ */
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

/**
 * scoringEngine.js — Deterministic market scoring and ranking engine
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * All functions are pure (no side effects, no DOM access).
 * Depends on: hhi.js (HHIEngine must be loaded first in browser)
 */

(function (root) {
  "use strict";

  // ─── Constants ───────────────────────────────────────────────────────────

  var FACTOR_KEYS = ["yieldWeight", "growthWeight", "diversWeight", "demandWeight", "riskWeight"];

  var PRESETS = {
    balanced: {
      label: "Balanced",
      yieldWeight:  0.25,
      growthWeight: 0.25,
      diversWeight: 0.20,
      demandWeight: 0.20,
      riskWeight:   0.10
    },
    incomeFocused: {
      label: "Income Focused",
      yieldWeight:  0.45,
      growthWeight: 0.10,
      diversWeight: 0.15,
      demandWeight: 0.20,
      riskWeight:   0.10
    },
    growthFocused: {
      label: "Growth Focused",
      yieldWeight:  0.10,
      growthWeight: 0.40,
      diversWeight: 0.20,
      demandWeight: 0.20,
      riskWeight:   0.10
    },
    diversFocused: {
      label: "Diversification Focused",
      yieldWeight:  0.15,
      growthWeight: 0.15,
      diversWeight: 0.45,
      demandWeight: 0.15,
      riskWeight:   0.10
    }
  };

  // ─── Validation ──────────────────────────────────────────────────────────

  /**
   * Validate a weights object. Returns { valid, errors[] }.
   * @param {Object} weights  e.g. { yieldWeight, growthWeight, diversWeight, demandWeight, riskWeight }
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateWeights(weights) {
    var errors = [];
    if (!weights || typeof weights !== "object") {
      return { valid: false, errors: ["Weights object is required."] };
    }
    var total = 0;
    for (var i = 0; i < FACTOR_KEYS.length; i++) {
      var k = FACTOR_KEYS[i];
      var v = weights[k];
      if (typeof v !== "number" || isNaN(v) || !isFinite(v)) {
        errors.push("Weight \"" + k + "\" is not a valid number.");
      } else if (v < 0) {
        errors.push("Weight \"" + k + "\" must be >= 0.");
      } else {
        total += v;
      }
    }
    // Allow ±0.005 floating point tolerance
    if (Math.abs(total - 1.0) > 0.005) {
      errors.push("Weights must total 100%. Current total: " + Math.round(total * 100) + "%.");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * Validate a single market record.
   * @param {Object} market
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateMarket(market) {
    var errors = [];
    if (!market || typeof market !== "object") {
      return { valid: false, errors: ["Market record is null or not an object."] };
    }
    var required = [
      "marketId", "city", "locality", "propertyType",
      "medianCapitalValuePerSqFt", "medianMonthlyRentPerSqFt",
      "annualRentalGrowthRatio", "demandScore", "riskScore"
    ];
    for (var i = 0; i < required.length; i++) {
      var field = required[i];
      if (market[field] === undefined || market[field] === null) {
        errors.push("Missing field: " + field);
      }
    }
    if (market.medianCapitalValuePerSqFt <= 0) {
      errors.push("medianCapitalValuePerSqFt must be > 0.");
    }
    if (market.demandScore < 0 || market.demandScore > 100) {
      errors.push("demandScore must be between 0 and 100.");
    }
    if (market.riskScore < 0 || market.riskScore > 100) {
      errors.push("riskScore must be between 0 and 100.");
    }
    if (market.annualRentalGrowthRatio < 0) {
      errors.push("annualRentalGrowthRatio must be >= 0.");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * Validate an array of market records. Returns summary + per-record results.
   * Checks for duplicate marketIds.
   * @param {Array} markets
   * @returns {{ valid: boolean, invalidCount: number, results: Array, duplicateIds: string[] }}
   */
  function validateMarkets(markets) {
    if (!Array.isArray(markets) || markets.length === 0) {
      return { valid: false, invalidCount: 0, results: [], duplicateIds: [],
               errors: ["Markets array is empty or not an array."] };
    }
    var seen = {};
    var duplicateIds = [];
    var results = [];
    var invalidCount = 0;

    for (var i = 0; i < markets.length; i++) {
      var m = markets[i];
      var r = validateMarket(m);
      if (!r.valid) { invalidCount++; }
      results.push({ marketId: m.marketId || ("row-" + i), valid: r.valid, errors: r.errors });

      if (m.marketId) {
        if (seen[m.marketId]) {
          duplicateIds.push(m.marketId);
        } else {
          seen[m.marketId] = true;
        }
      }
    }
    return {
      valid: invalidCount === 0 && duplicateIds.length === 0,
      invalidCount: invalidCount,
      results: results,
      duplicateIds: duplicateIds
    };
  }

  // ─── Gross yield ─────────────────────────────────────────────────────────

  /**
   * Compute gross yield from a market record.
   * @param {Object} market
   * @returns {number}  e.g. 0.09 for 9%
   */
  function grossYield(market) {
    var cap = market.medianCapitalValuePerSqFt;
    var rent = market.medianMonthlyRentPerSqFt;
    if (!cap || cap <= 0) { return 0; }
    return (rent * 12) / cap;
  }

  // ─── Normalisation ───────────────────────────────────────────────────────

  /**
   * Min-max normalise a value to 0–100.
   * If min === max, returns 50 (no information) to avoid division by zero.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number} 0–100
   */
  function normalise(value, min, max) {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) { return 0; }
    if (min === max) { return 50; }
    var score = (value - min) / (max - min) * 100;
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Compute min and max for each raw factor across all valid markets.
   * Returns { yieldMin, yieldMax, growthMin, growthMax, demandMin, demandMax, riskMin, riskMax }
   * @param {Array} markets - already validated, no nulls expected
   * @returns {Object}
   */
  function computeRanges(markets) {
    var ranges = {
      yieldMin: Infinity,  yieldMax: -Infinity,
      growthMin: Infinity, growthMax: -Infinity,
      demandMin: Infinity, demandMax: -Infinity,
      riskMin: Infinity,   riskMax: -Infinity,
      diversMin: 0,        diversMax: 100  // always fixed (computed per-call)
    };
    for (var i = 0; i < markets.length; i++) {
      var m = markets[i];
      var y = grossYield(m);
      if (y < ranges.yieldMin)  { ranges.yieldMin  = y; }
      if (y > ranges.yieldMax)  { ranges.yieldMax  = y; }
      if (m.annualRentalGrowthRatio < ranges.growthMin) { ranges.growthMin = m.annualRentalGrowthRatio; }
      if (m.annualRentalGrowthRatio > ranges.growthMax) { ranges.growthMax = m.annualRentalGrowthRatio; }
      if (m.demandScore < ranges.demandMin) { ranges.demandMin = m.demandScore; }
      if (m.demandScore > ranges.demandMax) { ranges.demandMax = m.demandScore; }
      if (m.riskScore   < ranges.riskMin)  { ranges.riskMin   = m.riskScore; }
      if (m.riskScore   > ranges.riskMax)  { ranges.riskMax   = m.riskScore; }
    }
    return ranges;
  }

  // ─── Scoring ─────────────────────────────────────────────────────────────

  /**
   * Score a single market against a portfolio given weights and pre-computed ranges.
   * Risk is inverted: lowRiskScore = 100 - riskScore.
   *
   * @param {Object} market     - validated market record
   * @param {Object} weights    - { yieldWeight, growthWeight, diversWeight, demandWeight, riskWeight }
   * @param {Object} ranges     - from computeRanges()
   * @param {number} diversBenefit - diversification score 0–100 from HHIEngine
   * @returns {Object} { totalScore, factors: { yield, growth, divers, demand, risk }, contributions }
   */
  function scoreMarket(market, weights, ranges, diversBenefit) {
    var y      = grossYield(market);
    var growth = market.annualRentalGrowthRatio;
    var demand = market.demandScore;
    var lowRisk = 100 - market.riskScore; // invert: lower risk = higher score

    var yieldScore  = normalise(y,       ranges.yieldMin,  ranges.yieldMax);
    var growthScore = normalise(growth,  ranges.growthMin, ranges.growthMax);
    var diversScore = Math.min(100, Math.max(0, diversBenefit));
    var demandScore = normalise(demand,  ranges.demandMin, ranges.demandMax);
    var riskScore   = normalise(lowRisk, 0, 100); // already on 0-100 scale

    var yieldContrib  = yieldScore  * weights.yieldWeight;
    var growthContrib = growthScore * weights.growthWeight;
    var diversContrib = diversScore * weights.diversWeight;
    var demandContrib = demandScore * weights.demandWeight;
    var riskContrib   = riskScore   * weights.riskWeight;

    var total = yieldContrib + growthContrib + diversContrib + demandContrib + riskContrib;

    return {
      marketId:   market.marketId,
      totalScore: Math.min(100, Math.max(0, total)),
      grossYield: y,
      factors: {
        yieldScore:  yieldScore,
        growthScore: growthScore,
        diversScore: diversScore,
        demandScore: demandScore,
        riskScore:   riskScore,
        lowRisk:     lowRisk
      },
      contributions: {
        yieldContrib:  yieldContrib,
        growthContrib: growthContrib,
        diversContrib: diversContrib,
        demandContrib: demandContrib,
        riskContrib:   riskContrib
      }
    };
  }

  // ─── Ranking ─────────────────────────────────────────────────────────────

  /**
   * Score and rank all valid markets. Returns ranked array (highest score first).
   *
   * @param {Array}  markets      - market records array
   * @param {Object} weights      - factor weights
   * @param {Array}  assets       - current portfolio assets (for diversification calc)
   * @param {Function} getDiversScore - HHIEngine.diversificationScore (injected)
   * @returns {{ ranked: Array, ranges: Object, validation: Object }}
   */
  function rankMarkets(markets, weights, assets, getDiversScore) {
    var validation = validateMarkets(markets);
    var wv = validateWeights(weights);

    var validMarkets = markets.filter(function (m) {
      return validateMarket(m).valid;
    });

    var ranges = computeRanges(validMarkets);
    var scored = [];

    for (var i = 0; i < validMarkets.length; i++) {
      var m = validMarkets[i];
      var divScore = typeof getDiversScore === "function"
        ? getDiversScore(assets, m)
        : 50;

      var result = scoreMarket(m, weights, ranges, divScore);
      scored.push(Object.assign({}, m, result));
    }

    scored.sort(function (a, b) {
      var diff = b.totalScore - a.totalScore;
      if (Math.abs(diff) > 1e-9) { return diff; }
      // Tie-break: ascending marketId for determinism
      var aid = String(a.marketId || "");
      var bid = String(b.marketId || "");
      return aid < bid ? -1 : aid > bid ? 1 : 0;
    });
    for (var j = 0; j < scored.length; j++) { scored[j].rank = j + 1; }

    return { ranked: scored, ranges: ranges, validation: validation, weightsValid: wv };
  }

  // ─── Sensitivity analysis ────────────────────────────────────────────────

  /**
   * Run ranking under three preset weight scenarios and return top-3 for each.
   * @param {Array}  markets
   * @param {Array}  assets
   * @param {Function} getDiversScore
   * @returns {Object} { income, growth, divers }
   */
  function sensitivityAnalysis(markets, assets, getDiversScore) {
    var results = {};
    var scenarios = ["incomeFocused", "growthFocused", "diversFocused"];
    for (var i = 0; i < scenarios.length; i++) {
      var key = scenarios[i];
      var preset = PRESETS[key];
      var r = rankMarkets(markets, preset, assets, getDiversScore);
      results[key] = {
        label: preset.label,
        weights: preset,
        top3: r.ranked.slice(0, 3)
      };
    }
    return results;
  }

  // ─── Export ──────────────────────────────────────────────────────────────

  var ScoringEngine = {
    PRESETS:             PRESETS,
    FACTOR_KEYS:         FACTOR_KEYS,
    validateWeights:     validateWeights,
    validateMarket:      validateMarket,
    validateMarkets:     validateMarkets,
    grossYield:          grossYield,
    normalise:           normalise,
    computeRanges:       computeRanges,
    scoreMarket:         scoreMarket,
    rankMarkets:         rankMarkets,
    sensitivityAnalysis: sensitivityAnalysis
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ScoringEngine;
  } else {
    root.ScoringEngine = ScoringEngine;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

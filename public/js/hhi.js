/**
 * hhi.js — Deterministic HHI and portfolio analytics engine
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * All functions are pure (no side effects, no DOM access).
 * Input: portfolio assets array from portfolio.json
 * Values: propertyValue and annualRent are in rupees (not crore).
 */

(function (root) {
  "use strict";

  // ─── Internal helpers ────────────────────────────────────────────────────

  /**
   * Group asset values by a key field, returning { key: totalValue }.
   * @param {Array} assets
   * @param {string} field  - e.g. "city" or "assetType"
   * @returns {Object}
   */
  function groupBy(assets, field) {
    var result = {};
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      var key = a[field] || "Unknown";
      result[key] = (result[key] || 0) + (a.propertyValue || 0);
    }
    return result;
  }

  // ─── City / property-type allocation ────────────────────────────────────

  /**
   * Returns allocation by city: { city: { value, share } }
   * @param {Array} assets
   * @returns {Object}
   */
  function cityAllocation(assets) {
    var totals = groupBy(assets, "city");
    var grand = 0;
    var keys = Object.keys(totals);
    for (var i = 0; i < keys.length; i++) { grand += totals[keys[i]]; }
    var result = {};
    for (var i = 0; i < keys.length; i++) {
      var c = keys[i];
      result[c] = { value: totals[c], share: grand > 0 ? totals[c] / grand : 0 };
    }
    return result;
  }

  /**
   * Returns allocation by property type: { type: { value, share } }
   * @param {Array} assets
   * @returns {Object}
   */
  function typeAllocation(assets) {
    var totals = groupBy(assets, "assetType");
    var grand = 0;
    var keys = Object.keys(totals);
    for (var i = 0; i < keys.length; i++) { grand += totals[keys[i]]; }
    var result = {};
    for (var i = 0; i < keys.length; i++) {
      var t = keys[i];
      result[t] = { value: totals[t], share: grand > 0 ? totals[t] / grand : 0 };
    }
    return result;
  }

  // ─── HHI ────────────────────────────────────────────────────────────────

  /**
   * Herfindahl-Hirschman Index from an array of share values (0–1).
   * Returns a value between 1/n (perfectly diversified) and 1 (monopoly).
   * Returns 0 if shares array is empty.
   * @param {number[]} shares
   * @returns {number}
   */
  function computeHHI(shares) {
    if (!shares || shares.length === 0) { return 0; }
    var hhi = 0;
    for (var i = 0; i < shares.length; i++) {
      var s = shares[i];
      if (typeof s !== "number" || isNaN(s) || !isFinite(s)) { continue; }
      hhi += s * s;
    }
    return hhi;
  }

  /**
   * City HHI for a set of assets.
   * @param {Array} assets
   * @returns {number}
   */
  function cityHHI(assets) {
    var alloc = cityAllocation(assets);
    var shares = Object.keys(alloc).map(function (k) { return alloc[k].share; });
    return computeHHI(shares);
  }

  /**
   * Property-type HHI for a set of assets.
   * @param {Array} assets
   * @returns {number}
   */
  function typeHHI(assets) {
    var alloc = typeAllocation(assets);
    var shares = Object.keys(alloc).map(function (k) { return alloc[k].share; });
    return computeHHI(shares);
  }

  // ─── Portfolio metrics ───────────────────────────────────────────────────

  /**
   * Total portfolio value in rupees.
   * @param {Array} assets
   * @returns {number}
   */
  function totalValue(assets) {
    var sum = 0;
    for (var i = 0; i < assets.length; i++) { sum += assets[i].propertyValue || 0; }
    return sum;
  }

  /**
   * Total annual rent in rupees.
   * @param {Array} assets
   * @returns {number}
   */
  function totalAnnualRent(assets) {
    var sum = 0;
    for (var i = 0; i < assets.length; i++) { sum += assets[i].annualRent || 0; }
    return sum;
  }

  /**
   * Weighted portfolio yield (annual rent / total value).
   * @param {Array} assets
   * @returns {number}  e.g. 0.06655 for 6.655%
   */
  function weightedYield(assets) {
    var val = totalValue(assets);
    var rent = totalAnnualRent(assets);
    return val > 0 ? rent / val : 0;
  }

  // ─── Post-investment simulation ──────────────────────────────────────────

  /**
   * Simulate adding a new investment into a target market.
   *
   * @param {Array}  assets        - existing portfolio assets
   * @param {Object} market        - target market object from markets.json
   * @param {number} investmentRs  - investment amount in RUPEES
   * @returns {Object} { assets, newAsset, portfolio metrics (before + after) }
   */
  function simulateInvestment(assets, market, investmentRs) {
    if (!market || typeof investmentRs !== "number" || investmentRs <= 0) {
      return null;
    }

    // Estimate annual rent from gross yield
    var grossYield = (market.medianMonthlyRentPerSqFt * 12) / market.medianCapitalValuePerSqFt;
    var estimatedAnnualRent = investmentRs * grossYield;

    var newAsset = {
      assetId: "SIM-" + market.marketId,
      assetName: market.locality + " — " + market.propertyType + " (Simulated)",
      city: market.city,
      locality: market.locality,
      assetType: market.propertyType,
      propertyValue: investmentRs,
      annualRent: estimatedAnnualRent,
      isSynthetic: true,
      sourceType: "simulation"
    };

    var before = {
      totalValue: totalValue(assets),
      totalAnnualRent: totalAnnualRent(assets),
      weightedYield: weightedYield(assets),
      cityHHI: cityHHI(assets),
      typeHHI: typeHHI(assets),
      cityAllocation: cityAllocation(assets),
      typeAllocation: typeAllocation(assets)
    };

    var postAssets = assets.concat([newAsset]);

    var after = {
      totalValue: totalValue(postAssets),
      totalAnnualRent: totalAnnualRent(postAssets),
      weightedYield: weightedYield(postAssets),
      cityHHI: cityHHI(postAssets),
      typeHHI: typeHHI(postAssets),
      cityAllocation: cityAllocation(postAssets),
      typeAllocation: typeAllocation(postAssets)
    };

    return {
      newAsset: newAsset,
      postAssets: postAssets,
      before: before,
      after: after,
      investmentRs: investmentRs,
      grossYield: grossYield
    };
  }

  /**
   * Compare two portfolios for before-vs-after display.
   * Returns delta object with signed changes and direction flags.
   * @param {Object} before - metrics object
   * @param {Object} after  - metrics object
   * @returns {Object}
   */
  function compareMetrics(before, after) {
    function delta(b, a, label) {
      var d = a - b;
      return {
        before: b,
        after: a,
        delta: d,
        improved: d < 0,   // lower HHI = better diversification
        label: label
      };
    }
    return {
      cityHHI: delta(before.cityHHI, after.cityHHI, "City HHI"),
      typeHHI:  delta(before.typeHHI,  after.typeHHI,  "Asset-Type HHI"),
      weightedYield: {
        before: before.weightedYield,
        after:  after.weightedYield,
        delta:  after.weightedYield - before.weightedYield,
        improved: after.weightedYield >= before.weightedYield,
        label: "Weighted Yield"
      },
      totalValue: {
        before: before.totalValue,
        after:  after.totalValue,
        delta:  after.totalValue - before.totalValue,
        label: "Total Portfolio Value"
      },
      totalAnnualRent: {
        before: before.totalAnnualRent,
        after:  after.totalAnnualRent,
        delta:  after.totalAnnualRent - before.totalAnnualRent,
        label: "Annual Rent"
      }
    };
  }

  /**
   * Compute diversification benefit score (0–100) for a given market.
   * A market in a new city adds more diversification value than one in an existing city.
   * A new property type is valued higher than an existing property type.
   *
   * @param {Array}  assets   - existing portfolio assets
   * @param {Object} market   - target market
   * @returns {number} 0–100
   */
  function diversificationScore(assets, market) {
    var cityAlloc = cityAllocation(assets);
    var typeAlloc = typeAllocation(assets);
    var existingCities = Object.keys(cityAlloc);
    var existingTypes  = Object.keys(typeAlloc);

    var cityShare = cityAlloc[market.city] ? cityAlloc[market.city].share : 0;
    var typeShare = typeAlloc[market.propertyType] ? typeAlloc[market.propertyType].share : 0;

    // New city = max bonus; high existing share = low benefit
    var cityBenefit = existingCities.indexOf(market.city) === -1 ? 1.0 : Math.max(0, 1 - cityShare * 2);
    var typeBenefit = existingTypes.indexOf(market.propertyType) === -1 ? 1.0 : Math.max(0, 1 - typeShare * 2);

    // Weighted 60% city, 40% type
    var raw = cityBenefit * 0.6 + typeBenefit * 0.4;
    return Math.min(100, Math.max(0, raw * 100));
  }

  // ─── Export ──────────────────────────────────────────────────────────────

  var HHIEngine = {
    cityAllocation:       cityAllocation,
    typeAllocation:       typeAllocation,
    computeHHI:           computeHHI,
    cityHHI:              cityHHI,
    typeHHI:              typeHHI,
    totalValue:           totalValue,
    totalAnnualRent:      totalAnnualRent,
    weightedYield:        weightedYield,
    simulateInvestment:   simulateInvestment,
    compareMetrics:       compareMetrics,
    diversificationScore: diversificationScore
  };

  // Support both browser global and CommonJS (for tests)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = HHIEngine;
  } else {
    root.HHIEngine = HHIEngine;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

/**
 * projection.js — Scenario projection engine for REIT Target AI
 *
 * NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo
 *
 * Pure functions only. No DOM, no fetch.
 * Dual CommonJS + browser-global export.
 *
 * Formulas:
 *   Projected Rent      = Current Rent  × (1 + g)^n
 *   Projected Value     = Current Value × (1 + c)^n
 *   Gross Yield         = Projected Annual Rent / Projected Value
 *   Effective Yield     = (Projected Annual Rent × occupancy) / Projected Value
 *
 * Three scenarios (conservative / base / optimistic) applied to each horizon.
 *
 * ON THE TWO YIELDS
 * -----------------
 * Each scenario declares an occupancy rate, and the report lists it in the
 * assumptions table beside rental and capital growth — which reads as though
 * all three drive the projection. Until now only two did. Gross yield is rent
 * over value by definition and correctly ignores vacancy, so the arithmetic was
 * never wrong; but the conservative scenario assumed a fifth of the space was
 * empty and still reported a yield as though the portfolio were fully let, and
 * an assumption that is displayed yet changes nothing invites the reader to
 * believe it was applied.
 *
 * So effectiveGrossYield is now returned alongside grossYield, and the two are
 * labelled distinctly wherever they appear. grossYield itself is UNCHANGED —
 * adding a field alters no figure the project has previously reported, whereas
 * redefining grossYield would silently restate every projection in the
 * documentation. See data-pipeline/docs/ANALYTICS_AUDIT.md, finding A3.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Projection = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Scenario assumptions ─────────────────────────────────── */
  var SCENARIOS = {
    conservative: {
      label:           'Conservative',
      rentalGrowth:    0.03,   // 3% p.a.
      capitalGrowth:   0.04,   // 4% p.a.
      occupancy:       0.80,   // 80%
      description:     'Muted rental growth (3%), modest capital appreciation (4%), 80% occupancy.'
    },
    base: {
      label:           'Base',
      rentalGrowth:    0.06,   // 6% p.a.
      capitalGrowth:   0.08,   // 8% p.a.
      occupancy:       0.90,   // 90%
      description:     'Market-average rental growth (6%), solid capital appreciation (8%), 90% occupancy.'
    },
    optimistic: {
      label:           'Optimistic',
      rentalGrowth:    0.10,   // 10% p.a.
      capitalGrowth:   0.12,   // 12% p.a.
      occupancy:       0.95,   // 95%
      description:     'Strong rental growth (10%), high capital appreciation (12%), 95% occupancy.'
    }
  };

  var DEFAULT_HORIZONS = [1, 3, 5]; // years

  /* ── Single scenario projection ───────────────────────────── */
  /**
   * projectScenario(params, scenario, horizons)
   *
   * @param {Object} params
   *   currentPortfolioValueRs   — total portfolio value in INR
   *   currentAnnualRentRs       — total annual rent in INR
   *   investmentRs              — new investment amount in INR
   *   newMarketGrossYield       — estimated gross yield of the new market (decimal)
   * @param {Object} scenario  — from SCENARIOS (rentalGrowth, capitalGrowth, occupancy)
   * @param {number[]} horizons — years to project (default [1, 3, 5])
   * @returns {Object[]} array of { year, portfolioValue, annualRent, grossYield, occupancyAdjRent }
   */
  function projectScenario(params, scenario, horizons) {
    horizons = horizons || DEFAULT_HORIZONS;

    var v0  = (params.currentPortfolioValueRs || 0) + (params.investmentRs || 0);
    var r0  = (params.currentAnnualRentRs     || 0) +
              (params.investmentRs || 0) * (params.newMarketGrossYield || 0);
    var g   = scenario.rentalGrowth;
    var c   = scenario.capitalGrowth;
    var occ = scenario.occupancy;

    var points = [];

    // Year 0 (current state)
    points.push({
      year:                0,
      portfolioValue:      v0,
      annualRent:          r0,
      grossYield:          v0 > 0 ? r0 / v0 : 0,
      occupancyAdjRent:    r0 * occ,
      effectiveGrossYield: v0 > 0 ? (r0 * occ) / v0 : 0,
      occupancy:           occ
    });

    horizons.forEach(function (n) {
      var vn  = v0 * Math.pow(1 + c, n);
      var rn  = r0 * Math.pow(1 + g, n);
      points.push({
        year:                n,
        portfolioValue:      vn,
        annualRent:          rn,
        grossYield:          vn > 0 ? rn / vn : 0,
        occupancyAdjRent:    rn * occ,
        effectiveGrossYield: vn > 0 ? (rn * occ) / vn : 0,
        occupancy:           occ
      });
    });

    return points;
  }

  /* ── All scenarios ────────────────────────────────────────── */
  /**
   * projectAll(params, horizons)
   *
   * @param {Object} params — same as projectScenario
   * @param {number[]} [horizons] — defaults to [1, 3, 5]
   * @returns {Object} { conservative: [], base: [], optimistic: [], assumptions: {} }
   */
  function projectAll(params, horizons) {
    horizons = horizons || DEFAULT_HORIZONS;
    var result = { assumptions: {} };
    Object.keys(SCENARIOS).forEach(function (key) {
      var s = SCENARIOS[key];
      result[key] = projectScenario(params, s, horizons);
      result.assumptions[key] = {
        label:         s.label,
        rentalGrowth:  s.rentalGrowth,
        capitalGrowth: s.capitalGrowth,
        occupancy:     s.occupancy,
        description:   s.description
      };
    });
    return result;
  }

  /* ── HHI projection — UNUSED, AND NOT FOR DISPLAY ─────────── */
  /**
   * projectHHI(hhiBefore, hhiAfter, horizons)
   *
   * DO NOT WIRE THIS INTO A PAGE. No page calls it, and it should stay that
   * way. It is retained only so that the reasoning below is not lost.
   *
   * It interpolates linearly from the before-HHI toward the after-HHI and then
   * multiplies the change by a per-scenario damping factor of 0.6, 1.0 or 1.3.
   * The optimistic factor therefore projects a concentration improvement 30%
   * LARGER than the investment being modelled actually produces, from a
   * multiplier with no mechanism behind it.
   *
   * The deeper problem is that it treats HHI after a known investment as a
   * forecast. It is not a forecast: it is arithmetic on the resulting holdings,
   * and HHIEngine.simulateInvestment already computes it exactly. Projecting it
   * forward would require modelling how each holding's VALUE grows relative to
   * the others, which this function does not do and the project does not claim
   * to do.
   *
   * See data-pipeline/docs/ANALYTICS_AUDIT.md, finding A4.
   *
   * @returns {Object} { conservative: [], base: [], optimistic: [] }
   *   each array: [{ year, cityHHI, typeHHI }]
   */
  function projectHHI(hhiBefore, hhiAfter, horizons) {
    horizons = horizons || DEFAULT_HORIZONS;
    var cityDelta = (hhiAfter.cityHHI || 0) - (hhiBefore.cityHHI || 0);
    var typeDelta = (hhiAfter.typeHHI || 0) - (hhiBefore.typeHHI || 0);
    var maxYr     = Math.max.apply(null, horizons);

    function makeSeries(dampFactor) {
      var pts = [{ year: 0, cityHHI: hhiBefore.cityHHI || 0, typeHHI: hhiBefore.typeHHI || 0 }];
      horizons.forEach(function (n) {
        var frac = n / (maxYr || 1);
        pts.push({
          year:    n,
          cityHHI: Math.max(0, Math.min(1, (hhiBefore.cityHHI || 0) + cityDelta * frac * dampFactor)),
          typeHHI: Math.max(0, Math.min(1, (hhiBefore.typeHHI || 0) + typeDelta * frac * dampFactor))
        });
      });
      return pts;
    }

    return {
      conservative: makeSeries(0.6),
      base:         makeSeries(1.0),
      optimistic:   makeSeries(1.3)
    };
  }

  /* ── Summary comparison ───────────────────────────────────── */
  /**
   * summarise(projections, horizon)
   * Extracts key metrics at a specific horizon for all three scenarios.
   *
   * @returns {Object} { conservative: {}, base: {}, optimistic: {} }
   *   each: { portfolioValue, annualRent, grossYield, occupancyAdjRent, change }
   */
  function summarise(projections, horizon) {
    horizon = horizon || 3;
    var result = {};
    ['conservative', 'base', 'optimistic'].forEach(function (key) {
      var pts = projections[key] || [];
      var now = pts[0] || {};
      var target = pts.find ? pts.find(function (p) { return p.year === horizon; }) : null;
      if (!target) target = pts[pts.length - 1] || {};
      result[key] = {
        portfolioValue:      target.portfolioValue      || 0,
        annualRent:          target.annualRent          || 0,
        grossYield:          target.grossYield          || 0,
        occupancyAdjRent:    target.occupancyAdjRent    || 0,
        effectiveGrossYield: target.effectiveGrossYield || 0,
        occupancy:           target.occupancy           || 0,
        changeValuePct:   now.portfolioValue > 0 ?
          ((target.portfolioValue - now.portfolioValue) / now.portfolioValue) * 100 : 0,
        changeRentPct:    now.annualRent > 0 ?
          ((target.annualRent - now.annualRent) / now.annualRent) * 100 : 0
      };
    });
    return result;
  }

  /* ── Public API ───────────────────────────────────────────── */
  return {
    SCENARIOS:       SCENARIOS,
    DEFAULT_HORIZONS: DEFAULT_HORIZONS,
    projectScenario: projectScenario,
    projectAll:      projectAll,
    projectHHI:      projectHHI,
    summarise:       summarise
  };
}));

/* stats.js — Segment-level statistical analysis engine
 * NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo
 *
 * Pure functions — no DOM, no fetch, no side effects.
 * Dual export: CommonJS (Node tests) + browser global (window.Stats).
 *
 * All input is the `markets` array from markets.json.
 * Bootstrap CIs use a seeded LCG PRNG for full reproducibility.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Stats = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Constants ────────────────────────────────────────────────── */
  var MIN_OBS_WARNING = 30;      // sample-size warning threshold
  var MIN_OBS_CI      = 10;      // minimum UNITS needed to compute a CI

  /* The unit of the city × property-type bootstrap is the MICRO-MARKET: each
   * group's confidence interval is bootstrapped across its segments' medians,
   * not across simulated observations. A group with 300 observations spread
   * over 3 micro-markets therefore has 3 units, not 300 — which is why the
   * table previously showed hundreds of observations beside "n<10". */
  var CI_UNIT = "micro-market (segment median)";
  var BOOTSTRAP_N     = 500;     // bootstrap iterations
  var BOOTSTRAP_SEED  = 20260919; // fixed seed for reproducibility
  var CI_LEVEL        = 0.95;    // 95% confidence interval

  /* ── Seeded LCG PRNG ──────────────────────────────────────────── */
  // Linear Congruential Generator — deterministic, no dependencies.
  // Parameters from Numerical Recipes.
  function makePrng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ── Array statistics helpers ──────────────────────────────────── */
  function sortedCopy(arr) {
    return arr.slice().sort(function (a, b) { return a - b; });
  }

  function median(arr) {
    if (!arr || arr.length === 0) { return null; }
    var s = sortedCopy(arr);
    var mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  }

  function q1(arr) {
    if (!arr || arr.length < 2) { return null; }
    var s = sortedCopy(arr);
    var lower = s.slice(0, Math.floor(s.length / 2));
    return median(lower);
  }

  function q3(arr) {
    if (!arr || arr.length < 2) { return null; }
    var s = sortedCopy(arr);
    var upper = s.slice(Math.ceil(s.length / 2));
    return median(upper);
  }

  function iqr(arr) {
    var q1v = q1(arr);
    var q3v = q3(arr);
    if (q1v === null || q3v === null) { return null; }
    return q3v - q1v;
  }

  function mean(arr) {
    if (!arr || arr.length === 0) { return null; }
    var sum = 0;
    for (var i = 0; i < arr.length; i++) { sum += arr[i]; }
    return sum / arr.length;
  }

  function minVal(arr) {
    if (!arr || arr.length === 0) { return null; }
    return Math.min.apply(null, arr);
  }

  function maxVal(arr) {
    if (!arr || arr.length === 0) { return null; }
    return Math.max.apply(null, arr);
  }

  /* ── Bootstrap CI ─────────────────────────────────────────────── */
  /**
   * Bootstrap 95% CI for the median of `values`.
   * Uses a seeded PRNG offset by `seedOffset` for unique per-metric reproducibility.
   * Returns { lo, hi } or null if n < MIN_OBS_CI.
   */
  function bootstrapMedianCI(values, seedOffset) {
    if (!values || values.length < MIN_OBS_CI) { return null; }
    var prng = makePrng(BOOTSTRAP_SEED + (seedOffset || 0));
    var n = values.length;
    var bootstrapMedians = [];

    for (var b = 0; b < BOOTSTRAP_N; b++) {
      var sample = [];
      for (var j = 0; j < n; j++) {
        sample.push(values[Math.floor(prng() * n)]);
      }
      bootstrapMedians.push(median(sample));
    }

    bootstrapMedians.sort(function (a, b) { return a - b; });
    var alpha = 1 - CI_LEVEL;
    var loIdx = Math.floor(alpha / 2 * BOOTSTRAP_N);
    var hiIdx = Math.floor((1 - alpha / 2) * BOOTSTRAP_N) - 1;

    return {
      lo: bootstrapMedians[loIdx],
      hi: bootstrapMedians[hiIdx]
    };
  }

  /* ── Gross yield ──────────────────────────────────────────────── */
  function grossYield(monthlyRentPerSqFt, capitalValuePerSqFt) {
    if (!monthlyRentPerSqFt || !capitalValuePerSqFt || capitalValuePerSqFt === 0) {
      return null;
    }
    return (monthlyRentPerSqFt * 12) / capitalValuePerSqFt;
  }

  /* ── Per-market augmentation ──────────────────────────────────── */
  /**
   * Augments each market record with derived fields:
   * - grossYield (decimal, e.g. 0.082)
   * - sampleSizeWarning (bool)
   */
  function augmentMarkets(markets) {
    return markets.map(function (m) {
      var gy = grossYield(m.medianMonthlyRentPerSqFt, m.medianCapitalValuePerSqFt);
      return Object.assign({}, m, {
        grossYield: gy,
        sampleSizeWarning: (m.observationCount || 0) < MIN_OBS_WARNING
      });
    });
  }

  /* ── Segment stats (grouped by city + propertyType) ──────────── */
  /**
   * Computes summary statistics across all markets within each
   * city × propertyType segment.
   *
   * Returns an array of segment objects:
   * {
   *   city, propertyType, count,
   *   capitalValue:  { min, q1, median, q3, max, iqr, mean, ci },
   *   monthlyRent:   { min, q1, median, q3, max, iqr, mean, ci },
   *   grossYield:    { min, q1, median, q3, max, iqr, mean, ci },
   *   rentalGrowth:  { min, q1, median, q3, max, iqr, mean, ci },
   *   demandScore:   { min, q1, median, q3, max, iqr, mean, ci },
   *   riskScore:     { min, q1, median, q3, max, iqr, mean, ci },
   *   totalObservations,
   *   hasSampleSizeWarning
   * }
   */
  function segmentStats(markets, includeCI) {
    if (!markets || markets.length === 0) { return []; }

    // Group by city + propertyType
    var groups = {};
    markets.forEach(function (m) {
      var key = m.city + '||' + m.propertyType;
      if (!groups[key]) {
        groups[key] = { city: m.city, propertyType: m.propertyType, markets: [] };
      }
      groups[key].markets.push(m);
    });

    return Object.keys(groups).map(function (key, idx) {
      var g = groups[key];
      var ms = g.markets;

      function pluck(field) {
        return ms.map(function (m) { return m[field]; }).filter(function (v) { return v != null; });
      }

      function pluckYield() {
        return ms.map(function (m) {
          return grossYield(m.medianMonthlyRentPerSqFt, m.medianCapitalValuePerSqFt);
        }).filter(function (v) { return v != null; });
      }

      function statBlock(vals, ciSeedBase) {
        var ci = (includeCI && vals.length >= MIN_OBS_CI)
          ? bootstrapMedianCI(vals, ciSeedBase)
          : null;
        return {
          ciUnit: CI_UNIT,
          ciUnits: vals.length,
          ciUnavailableReason: ci ? null
            : (includeCI ? "only " + vals.length + " micro-market" + (vals.length === 1 ? "" : "s") +
               "; a bootstrap of segment medians needs at least " + MIN_OBS_CI : "not requested"),
          min:    minVal(vals),
          q1:     q1(vals),
          median: median(vals),
          q3:     q3(vals),
          max:    maxVal(vals),
          iqr:    iqr(vals),
          mean:   mean(vals),
          n:      vals.length,
          ci:     ci
        };
      }

      // seed offsets per metric (keeps bootstraps independent)
      var seedBase = idx * 10;

      var capVals    = pluck('medianCapitalValuePerSqFt');
      var rentVals   = pluck('medianMonthlyRentPerSqFt');
      var yieldVals  = pluckYield();
      var growthVals = pluck('annualRentalGrowthRatio');
      var demandVals = pluck('demandScore');
      var riskVals   = pluck('riskScore');

      var totalObs = ms.reduce(function (s, m) { return s + (m.observationCount || 0); }, 0);

      return {
        city:              g.city,
        propertyType:      g.propertyType,
        count:             ms.length,
        capitalValue:      statBlock(capVals,    seedBase),
        monthlyRent:       statBlock(rentVals,   seedBase + 1),
        grossYield:        statBlock(yieldVals,  seedBase + 2),
        rentalGrowth:      statBlock(growthVals, seedBase + 3),
        demandScore:       statBlock(demandVals, seedBase + 4),
        riskScore:         statBlock(riskVals,   seedBase + 5),
        totalObservations: totalObs,
        hasSampleSizeWarning: ms.some(function(m){ return (m.observationCount||0) < MIN_OBS_WARNING; })
      };
    });
  }

  /* ── City-level rollup ─────────────────────────────────────────── */
  /**
   * Aggregates all market records per city, giving a city-level
   * summary for the overview table.
   */
  function cityStats(markets) {
    if (!markets || markets.length === 0) { return []; }

    var cities = {};
    markets.forEach(function (m) {
      var c = m.city;
      if (!cities[c]) { cities[c] = []; }
      cities[c].push(m);
    });

    return Object.keys(cities).sort().map(function (city) {
      var ms = cities[city];
      var yieldVals = ms.map(function (m) {
        return grossYield(m.medianMonthlyRentPerSqFt, m.medianCapitalValuePerSqFt);
      }).filter(function (v) { return v != null; });

      var capVals = ms.map(function (m) { return m.medianCapitalValuePerSqFt; });
      var totalObs = ms.reduce(function (s, m) { return s + (m.observationCount || 0); }, 0);
      var types = ms.map(function (m) { return m.propertyType; });
      var uniqueTypes = types.filter(function (t, i) { return types.indexOf(t) === i; });

      return {
        city:            city,
        segmentCount:    ms.length,
        propertyTypes:   uniqueTypes,
        totalObservations: totalObs,
        medianCapitalValue: median(capVals),
        minYield:        minVal(yieldVals),
        maxYield:        maxVal(yieldVals),
        medianYield:     median(yieldVals),
        hasSampleSizeWarning: ms.some(function(m){ return (m.observationCount||0) < MIN_OBS_WARNING; }),

        /*
         * The three fields below exist because hasSampleSizeWarning is a bare
         * boolean: the only NUMBER sitting beside it used to be segmentCount,
         * so a reader (including the Data Quality agent) would pair the two and
         * report "Delhi NCR (9 segments)" as a sample-size warning — when 9 is
         * the count of market segments in that city, not a sample size, and is
         * in fact among the highest in the dataset. These name the quantity the
         * warning is actually about.
         */
        minObsThreshold:      MIN_OBS_WARNING,
        segmentsBelowMinObs:  ms.filter(function(m){ return (m.observationCount||0) < MIN_OBS_WARNING; }).length,
        smallestSegmentObs:   ms.reduce(function(acc, m){
                                var n = m.observationCount || 0;
                                return acc === null ? n : Math.min(acc, n);
                              }, null)
      };
    });
  }

  /* ── Portfolio-level summary ───────────────────────────────────── */
  /**
   * Computes summary stats across ALL markets (portfolio-wide view).
   */
  function portfolioStats(markets) {
    if (!markets || markets.length === 0) {
      return { count: 0, message: 'No market data available.' };
    }

    var capVals    = markets.map(function (m) { return m.medianCapitalValuePerSqFt; });
    var rentVals   = markets.map(function (m) { return m.medianMonthlyRentPerSqFt; });
    var yieldVals  = markets.map(function (m) {
      return grossYield(m.medianMonthlyRentPerSqFt, m.medianCapitalValuePerSqFt);
    }).filter(function (v) { return v != null; });
    var growthVals = markets.map(function (m) { return m.annualRentalGrowthRatio; });
    var demandVals = markets.map(function (m) { return m.demandScore; });
    var riskVals   = markets.map(function (m) { return m.riskScore; });

    var totalObs  = markets.reduce(function (s, m) { return s + (m.observationCount || 0); }, 0);
    var cities    = markets.map(function (m) { return m.city; })
                           .filter(function (c, i, a) { return a.indexOf(c) === i; });
    var types     = markets.map(function (m) { return m.propertyType; })
                           .filter(function (t, i, a) { return a.indexOf(t) === i; });

    return {
      count:              markets.length,
      cityCount:          cities.length,
      typeCount:          types.length,
      totalObservations:  totalObs,

      capitalValue: {
        min:    minVal(capVals),
        median: median(capVals),
        max:    maxVal(capVals),
        iqr:    iqr(capVals)
      },
      monthlyRent: {
        min:    minVal(rentVals),
        median: median(rentVals),
        max:    maxVal(rentVals),
        iqr:    iqr(rentVals)
      },
      grossYield: {
        min:    minVal(yieldVals),
        median: median(yieldVals),
        max:    maxVal(yieldVals),
        iqr:    iqr(yieldVals)
      },
      rentalGrowth: {
        min:    minVal(growthVals),
        median: median(growthVals),
        max:    maxVal(growthVals)
      },
      demandScore: {
        min:    minVal(demandVals),
        median: median(demandVals),
        max:    maxVal(demandVals)
      },
      riskScore: {
        min:    minVal(riskVals),
        median: median(riskVals),
        max:    maxVal(riskVals)
      },
      sampleSizeWarnings: markets.filter(function (m) {
        return (m.observationCount || 0) < MIN_OBS_WARNING;
      }).length
    };
  }

  /* ── Outlier-flagged summary ──────────────────────────────────── */
  /**
   * Returns per-segment outlier counts using 1.5×IQR rule
   * applied to grossYield and capitalValue within each city.
   * (Uses market-level values, not pre-cleaned records.)
   */
  function outlierSummary(markets) {
    if (!markets || markets.length === 0) { return []; }

    var cities = {};
    markets.forEach(function (m) {
      if (!cities[m.city]) { cities[m.city] = []; }
      cities[m.city].push(m);
    });

    var result = [];
    Object.keys(cities).sort().forEach(function (city) {
      var ms = cities[city];
      var yieldVals = ms.map(function (m) {
        return grossYield(m.medianMonthlyRentPerSqFt, m.medianCapitalValuePerSqFt);
      });
      var capVals = ms.map(function (m) { return m.medianCapitalValuePerSqFt; });

      function countOutliers(vals) {
        var q1v = q1(vals);
        var q3v = q3(vals);
        if (q1v === null || q3v === null) { return 0; }
        var lo = q1v - 1.5 * (q3v - q1v);
        var hi = q3v + 1.5 * (q3v - q1v);
        return vals.filter(function (v) { return v < lo || v > hi; }).length;
      }

      result.push({
        city:          city,
        segmentCount:  ms.length,
        yieldOutliers: (ms.length >= 4) ? countOutliers(yieldVals) : null,
        capOutliers:   (ms.length >= 4) ? countOutliers(capVals)   : null,
        insufficientData: ms.length < 4
      });
    });

    return result;
  }

  /* ── Formatting helpers ───────────────────────────────────────── */
  function fmtRs(val) {
    if (val == null) { return '—'; }
    if (val >= 1e7) { return '₹' + (val / 1e7).toFixed(2) + ' Cr/sq ft'; }
    if (val >= 1e5) { return '₹' + (val / 1e5).toFixed(2) + ' L/sq ft'; }
    return '₹' + Math.round(val).toLocaleString('en-IN') + '/sq ft';
  }

  function fmtPct(val) {
    if (val == null) { return '—'; }
    return (val * 100).toFixed(2) + '%';
  }

  function fmtNum(val, dp) {
    if (val == null) { return '—'; }
    return val.toFixed(dp != null ? dp : 1);
  }

  /* ── Public API ───────────────────────────────────────────────── */
  return {
    // Core analysis
    segmentStats:    segmentStats,
    cityStats:       cityStats,
    portfolioStats:  portfolioStats,
    outlierSummary:  outlierSummary,
    augmentMarkets:  augmentMarkets,

    // Exposed primitives for testing
    _median:    median,
    _q1:        q1,
    _q3:        q3,
    _iqr:       iqr,
    _mean:      mean,
    _grossYield: grossYield,
    _bootstrapMedianCI: bootstrapMedianCI,
    _makePrng:  makePrng,

    // Formatting
    fmtRs:   fmtRs,
    fmtPct:  fmtPct,
    fmtNum:  fmtNum,

    // Constants (readable by tests)
    MIN_OBS_WARNING: MIN_OBS_WARNING,
    MIN_OBS_CI:      MIN_OBS_CI,
    CI_UNIT:         CI_UNIT,
    BOOTSTRAP_N:     BOOTSTRAP_N,
    BOOTSTRAP_SEED:  BOOTSTRAP_SEED
  };
}));

/**
 * filters.js — Market Screener filter model
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Fifty market segments is more than fits comfortably on one screen and more
 * than a reader can hold in mind. The screener previously offered only "show
 * top 10" or "show all 50", which meant the only way to answer a question such
 * as "which retail segments in tier-2 cities pass the simulation-support screen" was to
 * read every row.
 *
 * This module holds the filter LOGIC, separately from the controls that drive
 * it, for two reasons. It can be unit-tested without a browser — a filter that
 * silently drops rows is exactly the kind of defect a test should catch and a
 * glance at a screen will not. And the screener can show how many segments
 * each filter removed, which matters: a filtered table that looks complete but
 * is not is worse than no filter at all.
 *
 * Design decisions worth stating:
 *
 *   - Filters NEVER rescore or reorder. They decide which rows are displayed.
 *     The composite score and rank attached to a segment are the score and
 *     rank within the full fifty-segment universe, so a rank of 12 in a
 *     filtered view still means twelfth of fifty, not twelfth of what is on
 *     screen. Re-ranking the subset would silently change the meaning of a
 *     number the rest of the application also displays.
 *
 *   - The numeric bounds are derived from the data, not hardcoded, so a
 *     regenerated dataset cannot leave a slider whose range excludes real
 *     values.
 *
 *   - An empty result is a legitimate answer and is reported as such, with the
 *     filters that caused it, rather than rendered as an empty table.
 *
 * Pure module: no DOM, no network, no clock reads.
 */

(function (root) {
  "use strict";

  /* Treat a bound as "not set" when it equals the domain edge, so a slider
   * left alone never counts as an active filter. */
  function isSet(v) { return typeof v === "number" && isFinite(v); }

  /** A filter state with nothing applied. */
  function defaults() {
    return {
      cities:        [],     // empty = all
      propertyTypes: [],
      localityClasses: [],
      grades:        [],
      yieldMin:      null, yieldMax:  null,   // percent, e.g. 8.25
      growthMin:     null, growthMax: null,   // percent
      riskMax:       null,                    // 0–100, lower is better
      minObservations: null,                  // count
      eligibleOnly:  false                    // passes the simulation-support screen
    };
  }

  /**
   * The domains the controls should offer: every value that actually occurs,
   * plus the real numeric range of each measure.
   */
  function describe(markets) {
    var list = markets || [];
    function uniqSorted(fn) {
      var seen = {};
      list.forEach(function (m) {
        var v = fn(m);
        if (v !== undefined && v !== null && v !== "") { seen[v] = true; }
      });
      return Object.keys(seen).sort();
    }
    function range(fn) {
      var vals = list.map(fn).filter(function (v) { return typeof v === "number" && isFinite(v); });
      if (!vals.length) { return { min: 0, max: 0 }; }
      return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
    }

    return {
      cities:          uniqSorted(function (m) { return m.city; }),
      propertyTypes:   uniqSorted(function (m) { return m.propertyType; }),
      localityClasses: uniqSorted(function (m) { return m.localityClass; }),
      grades:          uniqSorted(function (m) { return m.confidenceGrade; }),
      yieldPct:        range(function (m) { return grossYieldPct(m); }),
      growthPct:       range(function (m) { return (m.annualRentalGrowthRatio || 0) * 100; }),
      riskScore:       range(function (m) { return m.riskScore; }),
      observations:    range(function (m) { return m.observationCount; })
    };
  }

  /**
   * Gross yield in percent. Prefers the value the scoring engine already
   * attached (so a filtered table and the score agree exactly) and falls back
   * to deriving it from rent and capital value for an unscored record.
   */
  function grossYieldPct(m) {
    if (typeof m.grossYield === "number" && isFinite(m.grossYield)) {
      return m.grossYield * 100;
    }
    var cap = m.medianCapitalValuePerSqFt;
    if (!cap) { return 0; }
    return ((m.medianMonthlyRentPerSqFt || 0) * 12 / cap) * 100;
  }

  /** Does one segment pass? Returns the names of the filters it failed. */
  function failures(market, f) {
    f = f || defaults();
    var out = [];

    if (f.cities && f.cities.length && f.cities.indexOf(market.city) === -1) {
      out.push("city");
    }
    if (f.propertyTypes && f.propertyTypes.length &&
        f.propertyTypes.indexOf(market.propertyType) === -1) {
      out.push("property type");
    }
    if (f.localityClasses && f.localityClasses.length &&
        f.localityClasses.indexOf(market.localityClass) === -1) {
      out.push("locality class");
    }
    if (f.grades && f.grades.length &&
        f.grades.indexOf(market.confidenceGrade) === -1) {
      out.push("Assumption Support Grade");
    }

    var y = grossYieldPct(market);
    if (isSet(f.yieldMin) && y < f.yieldMin) { out.push("minimum yield"); }
    if (isSet(f.yieldMax) && y > f.yieldMax) { out.push("maximum yield"); }

    var g = (market.annualRentalGrowthRatio || 0) * 100;
    if (isSet(f.growthMin) && g < f.growthMin) { out.push("minimum growth"); }
    if (isSet(f.growthMax) && g > f.growthMax) { out.push("maximum growth"); }

    if (isSet(f.riskMax) && (market.riskScore || 0) > f.riskMax) { out.push("maximum risk"); }

    if (isSet(f.minObservations) &&
        (market.observationCount || 0) < f.minObservations) {
      out.push("minimum simulated observations");
    }

    if (f.eligibleOnly) {
      var gov = market.governance ||
                (typeof root !== "undefined" && root.Governance
                  ? root.Governance.evaluate(market) : null);
      if (gov && !gov.eligible) { out.push("simulation-support screen"); }
    }

    return out;
  }

  function passes(market, f) { return failures(market, f).length === 0; }

  /**
   * Apply the filters.
   * Returns the kept rows in their original order, plus a breakdown of how many
   * rows each filter removed — so the interface can explain an empty result
   * instead of leaving the reader to guess which control caused it.
   */
  function apply(markets, f) {
    var list = markets || [];
    f = f || defaults();
    var kept = [];
    var removedBy = {};

    list.forEach(function (m) {
      var fails = failures(m, f);
      if (!fails.length) { kept.push(m); return; }
      fails.forEach(function (name) {
        removedBy[name] = (removedBy[name] || 0) + 1;
      });
    });

    return {
      kept:      kept,
      total:     list.length,
      keptCount: kept.length,
      removed:   list.length - kept.length,
      removedBy: removedBy,
      active:    activeNames(f)
    };
  }

  /** Names of the filters currently doing something. */
  function activeNames(f) {
    f = f || defaults();
    var out = [];
    if (f.cities && f.cities.length)                 { out.push("city"); }
    if (f.propertyTypes && f.propertyTypes.length)   { out.push("property type"); }
    if (f.localityClasses && f.localityClasses.length) { out.push("locality class"); }
    if (f.grades && f.grades.length)                 { out.push("Assumption Support Grade"); }
    if (isSet(f.yieldMin) || isSet(f.yieldMax))      { out.push("yield range"); }
    if (isSet(f.growthMin) || isSet(f.growthMax))    { out.push("growth range"); }
    if (isSet(f.riskMax))                            { out.push("maximum risk"); }
    if (isSet(f.minObservations))                    { out.push("minimum simulated observations"); }
    if (f.eligibleOnly)                              { out.push("simulation-support screen"); }
    return out;
  }

  function isActive(f) { return activeNames(f).length > 0; }

  /** One sentence describing what is currently applied. */
  function summary(f, result) {
    var names = activeNames(f);
    if (!names.length) {
      return "No filters applied — showing all " +
             (result ? result.total : "") + " market segments.";
    }
    var head = (result ? result.keptCount + " of " + result.total + " segments" : "Filtered") +
               " match " + names.length + " active filter" + (names.length === 1 ? "" : "s") +
               ": " + names.join(", ") + ".";
    if (result && result.keptCount === 0) {
      var worst = Object.keys(result.removedBy).sort(function (a, b) {
        return result.removedBy[b] - result.removedBy[a];
      })[0];
      head += " Nothing matches. The filter excluding the most segments is “" +
              worst + "” (" + result.removedBy[worst] + " of " + result.total + ").";
    }
    return head;
  }

  var Filters = {
    defaults:      defaults,
    describe:      describe,
    grossYieldPct: grossYieldPct,
    failures:      failures,
    passes:        passes,
    apply:         apply,
    activeNames:   activeNames,
    isActive:      isActive,
    summary:       summary
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Filters;
  } else {
    root.Filters = Filters;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

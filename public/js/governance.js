/**
 * governance.js — the simulation-support screen for the shortlist candidate
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHAT THIS DECIDES, AND WHAT IT DOES NOT
 * ---------------------------------------
 * The composite score measures how attractive a segment looks on five weighted
 * factors. It says nothing about how precisely the simulation pins those
 * figures down. Under the Balanced preset the highest raw-score segment,
 * Ambattur, rests on 26 simulated observations and Assumption Support Grade D;
 * the shortlist therefore applies a second, independent test:
 *
 *            score  ->  how attractive the segment looks           (unchanged here)
 *           screen  ->  is the simulation behind it precise enough  (this module)
 *      calibration  ->  has any cited source been traced            (AppMeta.calibrationStatus)
 *
 * The screen tests simulation support ONLY. Passing it does not mean the
 * figures are true of the real market — external calibration is a separate
 * status, and it is Unverified for every segment. So the output of this module
 * is a "shortlist candidate", never an evidence-qualified recommendation.
 *
 * Scoring is untouched: no score changes and no row moves. The highest
 * raw-score market is always shown with the reason it was passed over, and the
 * user can ignore the screen explicitly; the report records that they did.
 *
 * The thresholds live in appMeta.js (AppMeta.GOVERNANCE). They are a project
 * governance convention for simulation precision, not a regulatory or
 * universal statistical threshold.
 *
 * Pure module: no DOM, no network, no clock reads.
 */

(function (root) {
  "use strict";

  function meta() {
    if (typeof module !== "undefined" && module.exports) { return require("./appMeta.js"); }
    return root.AppMeta;
  }

  function rules() {
    var m = meta();
    return (m && m.GOVERNANCE) || {
      MIN_OBSERVATIONS: 30, MIN_GRADE: "C", GRADE_ORDER: ["A", "B", "C", "D", "E"]
    };
  }

  /** Lower index = better grade. Returns -1 for an unknown grade. */
  function gradeIndex(grade, order) {
    return order.indexOf(String(grade || "").toUpperCase());
  }

  /**
   * Evaluate one segment against the simulation-support screen.
   * Returns the two component tests separately, because "too few simulated
   * draws" and "assumptions graded below C" are different problems — and the
   * agent commentary must never attribute an exclusion to the wrong one.
   */
  function evaluate(market) {
    var R = rules();
    var order = R.GRADE_ORDER;
    var obs   = (market && market.observationCount) || 0;
    var grade = (market && market.confidenceGrade) || null;

    var gi    = gradeIndex(grade, order);
    var floor = gradeIndex(R.MIN_GRADE, order);

    var obsOk   = obs >= R.MIN_OBSERVATIONS;
    // A missing grade fails: an unclassified assumption set cannot be said to
    // meet a classification threshold.
    var gradeOk = gi !== -1 && gi <= floor;

    var reasons = [], reasonCodes = [];
    if (!obsOk) {
      reasons.push("only " + obs + " simulated observations (screen requires " + R.MIN_OBSERVATIONS + ")");
      reasonCodes.push("observations");
    }
    if (!gradeOk) {
      reasons.push(grade
        ? "Assumption Support Grade " + grade + " (screen requires " + R.MIN_GRADE + " or better)"
        : "no Assumption Support Grade recorded");
      reasonCodes.push("grade");
    }

    var eligible = obsOk && gradeOk;
    return {
      marketId:    market && market.marketId,
      eligible:    eligible,
      passesSimulationSupportRule: eligible,
      obsOk:       obsOk,
      gradeOk:     gradeOk,
      observations: obs,
      simulationObservationCount: obs,
      grade:        grade,
      supportGrade: grade,
      minObservations: R.MIN_OBSERVATIONS,
      minGrade:        R.MIN_GRADE,
      reasons:     reasons,
      reasonCodes: reasonCodes,
      failsOn:     eligible ? null
                 : (!obsOk && !gradeOk) ? "both"
                 : (!obsOk ? "simulated observations" : "support grade"),
      /* Short phrase for a table cell, with a symbol so the status never rests
       * on colour alone. It describes the SIMULATION, never the investment. */
      label:       eligible ? "\u2713 Passes simulation-support screen"
                            : "\u2717 Fails simulation-support screen",
      tier:        evidenceTier(obs, grade, order)
    };
  }

  /**
   * Simulation support level, for display beside the score. Combines the draw
   * count and the Assumption Support Grade into one word. It describes the
   * PRECISION of the simulation around its assumptions — not evidence. The
   * previous labels ("Strong", "Adequate") read as statements about real-world
   * evidence, which nothing in this project can support.
   */
  function evidenceTier(obs, grade, order) {
    order = order || rules().GRADE_ORDER;
    var gi = gradeIndex(grade, order);
    if (gi === -1) { return "Unclassified"; }
    if (obs >= 60 && gi <= 1) { return "High"; }        // 60+ draws, grade A or B
    if (obs >= 30 && gi <= 2) { return "Moderate"; }    // passes the screen
    if (obs >= 30 || gi <= 2) { return "Limited"; }     // one of the two holds
    return "Low";                                       // neither holds
  }

  /** Attach .governance to every market in a list. Does not reorder or rescore. */
  function annotate(markets) {
    return (markets || []).map(function (m) {
      m.governance = evaluate(m);
      return m;
    });
  }

  /**
   * Choose the shortlist candidate.
   *
   * @param {Array}  ranked    already scored and sorted, highest score first
   * @param {Object} opts      { override: boolean }
   * @returns {Object}
   *   target        the recommended segment (null if none can be chosen)
   *   topOverall    the highest-scoring segment, whether or not it is eligible
   *   outranked     segments scoring above the target that failed the floor
   *   overrideUsed  true when the floor was deliberately lifted
   *   note          one sentence explaining the outcome, for display and the report
   */
  function chooseTarget(ranked, opts) {
    var list = annotate((ranked || []).slice());
    var override = !!(opts && opts.override);
    var topOverall = list[0] || null;

    if (override) {
      return {
        target:       topOverall,
        topOverall:   topOverall,
        outranked:    [],
        overrideUsed: true,
        eligibleCount: list.filter(function (m) { return m.governance.eligible; }).length,
        note: topOverall
          ? "Simulation-support screen ignored. The candidate is the highest raw-score market, " +
            (topOverall.governance.eligible
              ? "which also passes the screen."
              : "which fails it (" + topOverall.governance.reasons.join("; ") + ").")
          : "No segments available."
      };
    }

    var eligible = list.filter(function (m) { return m.governance.eligible; });
    var target = eligible[0] || null;

    if (!target) {
      return {
        target:       null,
        topOverall:   topOverall,
        outranked:    list.slice(),
        overrideUsed: false,
        eligibleCount: 0,
        note: "No segment passes the simulation-support screen (" + rules().rule +
              "), so no shortlist candidate is named. The ranking is still shown in full."
      };
    }

    var outranked = list.filter(function (m) {
      return !m.governance.eligible && m.totalScore > target.totalScore;
    });

    return {
      target:       target,
      topOverall:   topOverall,
      outranked:    outranked,
      overrideUsed: false,
      eligibleCount: eligible.length,
      note: outranked.length === 0
        ? "The highest raw-score market also passes the simulation-support screen, so it is the shortlist candidate."
        : outranked.length + " segment" + (outranked.length === 1 ? "" : "s") +
          " scored above the shortlist candidate but " + (outranked.length === 1 ? "fails" : "fail") +
          " the simulation-support screen, so the candidate is the highest-ranked segment that passes it: " +
          (target.locality || target.marketId) + ", " + (target.city || "") +
          " (raw rank " + target.rank + ", score " +
          (typeof target.totalScore === "number" ? target.totalScore.toFixed(2) : "—") + ")."
    };
  }

  /** Counts for a summary line: how much of the universe passes the screen. */
  function summarise(markets) {
    var list = annotate((markets || []).slice());
    var R = rules();
    return {
      total:       list.length,
      eligible:    list.filter(function (m) { return m.governance.eligible; }).length,
      failObsOnly: list.filter(function (m) { return !m.governance.obsOk && m.governance.gradeOk; }).length,
      failGradeOnly: list.filter(function (m) { return m.governance.obsOk && !m.governance.gradeOk; }).length,
      failBoth:    list.filter(function (m) { return !m.governance.obsOk && !m.governance.gradeOk; }).length,
      minObservations: R.MIN_OBSERVATIONS,
      minGrade:        R.MIN_GRADE
    };
  }

  /** External calibration for one segment, from the register outcomes only. */
  function externalCalibration(market, outcomes) {
    var m = (typeof module !== "undefined" && module.exports) ? require("./appMeta.js") : root.AppMeta;
    return m.calibrationStatus(market && market.sourceIds, outcomes || {});
  }

  var Governance = {
    externalCalibration: externalCalibration,
    evaluate:     evaluate,
    evidenceTier: evidenceTier,
    annotate:     annotate,
    chooseTarget: chooseTarget,
    summarise:    summarise,
    rules:        rules
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Governance;
  } else {
    root.Governance = Governance;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

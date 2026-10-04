/**
 * governance.js — evidence eligibility for a recommendation
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * The composite score measures how attractive a market segment looks. It says
 * nothing whatever about how well that appearance is supported by evidence.
 * Those are different questions, and conflating them produced a result the
 * project could not defend: under the Balanced preset the highest-scoring
 * segment was Ambattur, Chennai, whose estimate rests on 26 simulated
 * observations and carries confidence grade D. It was being presented as the
 * recommendation with no qualification at all, ahead of segments with three
 * times the supporting evidence.
 *
 * Scoring is therefore left completely untouched — the ranking below is the
 * same ranking as before, in the same order, with the same numbers — and
 * eligibility is applied as a SECOND, independent dimension:
 *
 *            score  →  how attractive the segment looks
 *       eligibility  →  whether the evidence can carry a recommendation
 *
 * The recommendation defaults to the highest-scoring ELIGIBLE segment. The
 * highest-scoring segment overall is still shown, still with its real score,
 * labelled with why it was not recommended. Nothing is hidden and no number is
 * altered; the user can lift the floor with an explicit override, and the
 * report records that they did.
 *
 * The thresholds live in appMeta.js (AppMeta.GOVERNANCE) so they are stated
 * once for the whole project. Both are descriptive conventions adopted for
 * this academic project, NOT regulatory requirements.
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
   * Evaluate one market segment against the evidence floor.
   * Returns the two component tests separately, because "fails on sample size"
   * and "fails on evidence grade" are different problems with different fixes.
   */
  function evaluate(market) {
    var R = rules();
    var order = R.GRADE_ORDER;
    var obs   = (market && market.observationCount) || 0;
    var grade = (market && market.confidenceGrade) || null;

    var gi    = gradeIndex(grade, order);
    var floor = gradeIndex(R.MIN_GRADE, order);

    var obsOk   = obs >= R.MIN_OBSERVATIONS;
    // An unknown or missing grade fails: absence of evidence about the
    // evidence is not evidence that the evidence is good.
    var gradeOk = gi !== -1 && gi <= floor;

    var reasons = [];
    if (!obsOk) {
      reasons.push("only " + obs + " observations, below the floor of " + R.MIN_OBSERVATIONS);
    }
    if (!gradeOk) {
      reasons.push(grade
        ? "confidence grade " + grade + ", below the floor of " + R.MIN_GRADE
        : "no confidence grade recorded");
    }

    return {
      marketId:    market && market.marketId,
      eligible:    obsOk && gradeOk,
      obsOk:       obsOk,
      gradeOk:     gradeOk,
      observations: obs,
      grade:        grade,
      minObservations: R.MIN_OBSERVATIONS,
      minGrade:        R.MIN_GRADE,
      reasons:     reasons,
      /* Short phrase for a table cell. Deliberately describes the EVIDENCE,
       * never the investment: "Limited evidence" is a statement about the
       * dataset, whereas "risky" would be a statement about the asset, which
       * this test is not entitled to make. */
      label:       (obsOk && gradeOk) ? "Meets evidence floor" : "Below evidence floor",
      tier:        evidenceTier(obs, grade, order)
    };
  }

  /**
   * A four-step evidence tier, for the second axis of the two-dimensional
   * display. Combines sample size and grade so the reader sees strength of
   * evidence at a glance next to the score, rather than having to compare two
   * numbers in two different units.
   */
  function evidenceTier(obs, grade, order) {
    order = order || rules().GRADE_ORDER;
    var gi = gradeIndex(grade, order);
    if (gi === -1) { return "Unclassified"; }
    if (obs >= 60 && gi <= 1) { return "Strong"; }      // 60+ observations, grade A or B
    if (obs >= 30 && gi <= 2) { return "Adequate"; }    // 30+ observations, grade C or better
    if (obs >= 30 || gi <= 2) { return "Limited"; }     // one of the two holds
    return "Weak";                                      // neither holds
  }

  /** Attach .governance to every market in a list. Does not reorder or rescore. */
  function annotate(markets) {
    return (markets || []).map(function (m) {
      m.governance = evaluate(m);
      return m;
    });
  }

  /**
   * Choose the segment to recommend.
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
          ? "Evidence floor overridden. The recommendation is the highest-scoring segment, " +
            (topOverall.governance.eligible
              ? "which also meets the floor."
              : "which does not meet it (" + topOverall.governance.reasons.join("; ") + ").")
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
        note: "No segment meets the evidence floor of " + rules().MIN_OBSERVATIONS +
              " observations and grade " + rules().MIN_GRADE + " or better, so no " +
              "recommendation is made. The ranking is still shown in full."
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
        ? "The highest-scoring segment also meets the evidence floor."
        : outranked.length + " segment" + (outranked.length === 1 ? "" : "s") +
          " scored above the recommendation but did not meet the evidence floor, so the " +
          "recommendation is the highest-scoring segment that did: " +
          (target.locality || target.marketId) + ", " + (target.city || "") +
          " (rank " + target.rank + ", score " +
          (typeof target.totalScore === "number" ? target.totalScore.toFixed(1) : "—") + ")."
    };
  }

  /** Counts for a summary line: how much of the universe clears the floor. */
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

  var Governance = {
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

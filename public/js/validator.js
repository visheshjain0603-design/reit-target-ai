/**
 * validator.js — deterministic pre-flight checks on the analytical inputs
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS IS NOT AN AGENT
 * ------------------------
 * Until now these checks were performed by a sixth Gemini agent. That was the
 * wrong tool for the job, and not merely an inefficient one.
 *
 * Every question asked here has exactly one correct answer that arithmetic can
 * establish: do the five factor weights total 100%, does every composite score
 * fall inside 0–100, does the market the user selected actually appear in the
 * ranking, do the HHI figures quoted in the context match the figures the
 * simulation produced. A language model answering those questions can be
 * wrong, cannot show its working, and — because its verdict gated the
 * Orchestrator — a wrong verdict either suppressed a valid recommendation or
 * waved through an invalid one. It also consumed a sixth of a small free-tier
 * daily quota to compute something the browser can compute exactly, offline,
 * in under a millisecond.
 *
 * So the checks moved into code. The consequences are worth stating plainly:
 *
 *   - the verdict is reproducible: identical inputs always give the identical
 *     verdict, which an examiner can re-derive by hand
 *   - it works with no network, no API key and no quota
 *   - each check reports the numbers it compared, so a failure says what was
 *     wrong rather than that something was
 *   - the language models are left doing only what they are actually good at,
 *     which is explaining figures that have already been computed
 *
 * Pure module: no DOM, no network, no clock reads.
 */

(function (root) {
  "use strict";

  /* Tolerances. Floating-point arithmetic means an exact equality test on a
   * sum of five sliders, or on an HHI recomputed from the same assets, will
   * fail for reasons that have nothing to do with correctness. These bounds
   * are tight enough to catch a real error and loose enough to ignore the
   * last bits of a double. */
  var WEIGHT_SUM_TOLERANCE = 0.005;    // ±0.5 of a percentage point in total
  var HHI_TOLERANCE        = 5e-4;     // HHI is reported to four decimals
  var SCORE_MIN            = 0;
  var SCORE_MAX            = 100;

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* The agent context states quoted figures as fixed-decimal strings so their
   * display precision survives JSON. Read them back as numbers here. */
  function n(v) {
    if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) { return Number(v); }
    return v;
  }
  function pfNumbers(pf) {
    if (!pf) { return null; }
    return { totalValueCr: n(pf.totalValueCr), annualRentCr: n(pf.annualRentCr),
             weightedYieldPct: n(pf.weightedYieldPct), cityHHI: n(pf.cityHHI),
             assetTypeHHI: n(pf.assetTypeHHI) };
  }

  function check(id, label, passed, detail) {
    return { id: id, label: label, passed: !!passed, detail: detail };
  }

  // ─── Individual checks ────────────────────────────────────────────────────

  /** Do the five factor weights total 100%? */
  function checkWeights(weights) {
    var keys = ["yieldWeight", "growthWeight", "diversWeight", "demandWeight", "riskWeight"];
    if (!weights || typeof weights !== "object") {
      return check("weights", "Factor weights total 100%", false, "No weights supplied.");
    }
    var missing = keys.filter(function (k) { return !isNum(weights[k]); });
    if (missing.length) {
      return check("weights", "Factor weights total 100%", false,
                   "Not a number: " + missing.join(", ") + ".");
    }
    var negative = keys.filter(function (k) { return weights[k] < 0; });
    if (negative.length) {
      return check("weights", "Factor weights total 100%", false,
                   "Negative weight: " + negative.join(", ") + ".");
    }
    var total = keys.reduce(function (s, k) { return s + weights[k]; }, 0);
    var ok = Math.abs(total - 1) <= WEIGHT_SUM_TOLERANCE;
    return check("weights", "Factor weights total 100%", ok,
                 "Sum of the five weights is " + (total * 100).toFixed(2) + "%" +
                 (ok ? "." : ", which is outside 100% ± " +
                       (WEIGHT_SUM_TOLERANCE * 100).toFixed(1) + "pp."));
  }

  /** Is every composite score inside 0–100? */
  function checkScoreRange(ranked) {
    var list = ranked || [];
    if (!list.length) {
      return check("scoreRange", "Composite scores within 0–100", false, "No ranked markets.");
    }
    var bad = [];
    var lo = Infinity, hi = -Infinity;
    list.forEach(function (m) {
      var s = isNum(m.totalScore) ? m.totalScore : null;
      if (s === null) { bad.push((m.marketId || "?") + " (not a number)"); return; }
      if (s < lo) { lo = s; }
      if (s > hi) { hi = s; }
      if (s < SCORE_MIN || s > SCORE_MAX) { bad.push((m.marketId || "?") + " = " + s.toFixed(2)); }
    });
    return check("scoreRange", "Composite scores within 0–100", bad.length === 0,
                 bad.length
                   ? "Outside range: " + bad.slice(0, 5).join(", ") +
                     (bad.length > 5 ? " and " + (bad.length - 5) + " more." : ".")
                   : list.length + " scores span " + lo.toFixed(2) + " to " + hi.toFixed(2) + ".");
  }

  /** Is the ranking actually sorted by descending score? */
  function checkRankingOrder(ranked) {
    var list = ranked || [];
    if (list.length < 2) {
      return check("rankOrder", "Ranking sorted by descending score", list.length === 1,
                   list.length ? "Single market; order is trivially correct." : "No ranked markets.");
    }
    for (var i = 1; i < list.length; i++) {
      var prev = list[i - 1], cur = list[i];
      if (!isNum(prev.totalScore) || !isNum(cur.totalScore)) { continue; }
      // A later market may equal the previous score (ties are broken by id),
      // but it must never exceed it.
      if (cur.totalScore - prev.totalScore > 1e-9) {
        return check("rankOrder", "Ranking sorted by descending score", false,
                     "Rank " + (i + 1) + " (" + cur.marketId + ", " + cur.totalScore.toFixed(4) +
                     ") scores above rank " + i + " (" + prev.marketId + ", " +
                     prev.totalScore.toFixed(4) + ").");
      }
    }
    return check("rankOrder", "Ranking sorted by descending score", true,
                 list.length + " markets in non-increasing score order.");
  }

  /** Does the selected target appear in the ranking? */
  function checkTargetPresent(selectedTargetId, ranked) {
    var list = ranked || [];
    if (!selectedTargetId) {
      return check("target", "Selected target is in the ranking", false, "No target selected.");
    }
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].marketId === selectedTargetId) { found = list[i]; break; }
    }
    return check("target", "Selected target is in the ranking", !!found,
                 found
                   ? selectedTargetId + " is at rank " + found.rank + " of " + list.length + "."
                   : selectedTargetId + " does not appear among the " + list.length +
                     " ranked markets.");
  }

  /**
   * Do the HHI figures in the context match a fresh recomputation?
   *
   * This is the check that most justifies being deterministic. It does not ask
   * whether the numbers look plausible; it recomputes them from the portfolio
   * and compares. A language model could only ever have guessed.
   */
  function checkHHIConsistency(context, assets, hhiEngine) {
    var label = "Portfolio HHI figures reproduce";
    var pf = pfNumbers(context && context.portfolio);
    if (!pf || !assets || !assets.length || !hhiEngine) {
      return check("hhi", label, false, "Portfolio, assets or HHI engine unavailable.");
    }
    var cityActual = hhiEngine.cityHHI(assets);
    var typeActual = hhiEngine.typeHHI(assets);
    var cityDiff = Math.abs(cityActual - (pf.cityHHI || 0));
    var typeDiff = Math.abs(typeActual - (pf.assetTypeHHI || 0));
    var ok = cityDiff <= HHI_TOLERANCE && typeDiff <= HHI_TOLERANCE;
    return check("hhi", label, ok,
                 ok
                   ? "City HHI " + cityActual.toFixed(4) + " and asset-type HHI " +
                     typeActual.toFixed(4) + " recomputed from the " + assets.length +
                     " holdings and matched the context."
                   : "Recomputed city HHI " + cityActual.toFixed(4) + " vs context " +
                     (pf.cityHHI) + "; recomputed asset-type HHI " + typeActual.toFixed(4) +
                     " vs context " + (pf.assetTypeHHI) + ".");
  }

  /**
   * Does the portfolio's weighted yield equal rent ÷ value?
   * An independent arithmetic identity, so an inconsistency here means one of
   * the three figures reached the context from the wrong place.
   */
  function checkYieldIdentity(context) {
    var label = "Weighted yield equals rent ÷ value";
    var pf = pfNumbers(context && context.portfolio);
    if (!pf || !isNum(pf.totalValueCr) || !isNum(pf.annualRentCr) || !isNum(pf.weightedYieldPct)) {
      return check("yieldIdentity", label, false, "Portfolio value, rent or yield missing.");
    }
    if (pf.totalValueCr === 0) {
      return check("yieldIdentity", label, false, "Portfolio value is zero.");
    }
    var implied = (pf.annualRentCr / pf.totalValueCr) * 100;
    var diff = Math.abs(implied - pf.weightedYieldPct);
    var ok = diff <= 0.01;   // reported to three decimals
    return check("yieldIdentity", label, ok,
                 (ok ? "" : "Mismatch: ") +
                 "₹" + pf.annualRentCr + " Cr ÷ ₹" + pf.totalValueCr +
                 " Cr = " + implied.toFixed(3) + "%, context states " +
                 pf.weightedYieldPct + "%.");
  }

  /** Is the synthetic-data disclosure present in the context sent to the models? */
  function checkSyntheticDisclosure(context) {
    var label = "Synthetic-data notice present in model context";
    var note = (context && context.dataNote) || "";
    var ok = /synthetic/i.test(String(note));
    return check("synthetic", label, ok,
                 ok ? "Context carries: “" + note + "”"
                    : "No synthetic-data notice found in the context. The models must " +
                      "never be given this data without it.");
  }

  /** Is the investment amount a sane positive figure? */
  function checkInvestment(context) {
    var label = "Investment amount is positive and finite";
    var v = context ? context.investmentCr : null;
    var ok = isNum(v) && v > 0;
    return check("investment", label, ok,
                 ok ? "₹" + v + " Cr." : "Investment amount is " + String(v) + ".");
  }

  // ─── Fixed, non-negotiable limitations ────────────────────────────────────

  /*
   * These were previously produced by the Validation agent, which meant the
   * list of the project's own methodological limitations varied in wording and
   * membership from run to run, and vanished entirely when the model was
   * unreachable. A project's limitations are not a matter of opinion and do not
   * depend on an API being up, so they are stated here, once.
   */
  var LIMITATIONS = [
    "All data is synthetic. No observation corresponds to a real property, tenant or transaction.",
    "Gross yield only — no management fees, vacancy allowance, tax, leverage or transaction costs.",
    "HHI is computed on book value, not on a mark-to-market valuation.",
    "Scenario projections apply flat growth rates; no correlation structure or Monte Carlo simulation.",
    "Market estimates are medians of a seeded simulation, not observed transaction prices.",
    "No regulatory review against the SEBI (Real Estate Investment Trusts) Regulations, 2014.",
    "Language-model commentary interprets figures computed elsewhere; it neither verifies nor recalculates them.",
    "External calibration is Unverified: none of the cited source documents was located and no figure was traced to a source (docs/SOURCE_VERIFICATION_REPORT.md).",
    "More simulated observations narrow a segment's estimate around the project's assumed distribution; they are not market evidence. The simulation-support screen is a project convention, not a statistical or regulatory threshold.",
    "The shortlist candidate is an exploratory model output, not an investment recommendation; further evidence collection and due diligence would be required."
  ];

  // ─── Public entry point ───────────────────────────────────────────────────

  /**
   * Run every check. Returns the full result, including each check's detail, so
   * the interface can show the working rather than a bare pass or fail.
   *
   * @param {Object} input
   *   context   the analytical context that would be sent to the models
   *   ranked    the ranked market array
   *   assets    portfolio assets
   *   hhiEngine HHIEngine (injected, so this module stays dependency-free)
   * @returns {{ passed, checks, failed, limitations, summary }}
   */
  function validate(input) {
    input = input || {};
    var ctx    = input.context || null;
    var ranked = input.ranked  || [];
    var assets = input.assets  || [];
    var hhi    = input.hhiEngine ||
                 (typeof root !== "undefined" ? root.HHIEngine : null) || null;

    var checks = [
      checkWeights(ctx && ctx.weights),
      checkScoreRange(ranked),
      checkRankingOrder(ranked),
      checkTargetPresent(ctx && ctx.selectedTarget ? ctx.selectedTarget.marketId : null, ranked),
      checkHHIConsistency(ctx, assets, hhi),
      checkYieldIdentity(ctx),
      checkInvestment(ctx),
      checkSyntheticDisclosure(ctx)
    ];

    var failed = checks.filter(function (c) { return !c.passed; });

    return {
      passed:      failed.length === 0,
      checks:      checks,
      failed:      failed,
      limitations: LIMITATIONS,
      summary:     failed.length === 0
        ? "All " + checks.length + " deterministic checks passed."
        : failed.length + " of " + checks.length + " deterministic checks failed: " +
          failed.map(function (c) { return c.label; }).join("; ") + "."
    };
  }

  var Validator = {
    WEIGHT_SUM_TOLERANCE: WEIGHT_SUM_TOLERANCE,
    HHI_TOLERANCE:        HHI_TOLERANCE,
    LIMITATIONS:          LIMITATIONS,
    validate:             validate,
    checkWeights:         checkWeights,
    checkScoreRange:      checkScoreRange,
    checkRankingOrder:    checkRankingOrder,
    checkTargetPresent:   checkTargetPresent,
    checkHHIConsistency:  checkHHIConsistency,
    checkYieldIdentity:   checkYieldIdentity,
    checkInvestment:      checkInvestment,
    checkSyntheticDisclosure: checkSyntheticDisclosure
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Validator;
  } else {
    root.Validator = Validator;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

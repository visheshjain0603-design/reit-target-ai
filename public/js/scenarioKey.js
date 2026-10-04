/**
 * scenarioKey.js — canonical scenario identity for cached agent commentary
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS EXISTS
 * ---------------
 * Cached Gemini commentary describes one specific analytical scenario. The
 * application, however, is interactive: the user can change factor weights,
 * the investment amount, the selected target market, or the portfolio itself.
 * Any of those changes the deterministic result — and therefore invalidates
 * commentary written about the previous result.
 *
 * Keying the cache by weight-preset NAME alone is not sufficient. Two runs can
 * both be "balanced" yet differ in investment amount or selected target, and
 * the cached narrative would then confidently describe a market the table no
 * longer recommends. That is worse than showing nothing: it is a wrong answer
 * presented with the same authority as a right one.
 *
 * This module reduces every input that can change the analysis to a single
 * canonical string, then hashes it. Commentary is served from cache only when
 * that hash matches exactly.
 *
 * FIELDS IN THE KEY
 *   datasetVersion     generator version, observation count, market count, as-of date
 *   portfolioF         asset count, total value, sorted asset identities
 *   weights            every factor weight, canonically ordered and rounded
 *   investmentCr       the amount being deployed
 *   selectedTarget     the market every page analyses
 *   selectionMode      "auto" (the screen's candidate) or "manual" (the user's pick)
 *   governanceOverride whether the simulation-support screen was ignored
 *   recommendedCandidate  the screen's shortlist candidate, even when a manual
 *                      target is selected — commentary compares the two
 *   topRanked          the leading markets and their scores
 *   methodologyVersion bumped by hand when scoring logic changes
 *   contextVersion     bumped by hand when the agent context or prompts change
 *
 * All functions are pure. No DOM access, no network, no clock reads — the same
 * inputs always produce the same key, in the browser and in Node alike.
 */

(function (root) {
  "use strict";

  /*
   * Bump this by hand whenever the scoring or simulation methodology changes
   * in a way that alters results. That invalidates every existing cache entry,
   * which is the intended effect: commentary written under the old methodology
   * no longer describes what the engine now produces.
   */
  var METHODOLOGY_VERSION = "1.0.0";

  /*
   * Bump when the CONTEXT sent to the agents, or their prompts, change shape.
   * Scores do not move when this changes, but commentary written against the
   * old vocabulary ("evidence floor", "runner-up") no longer describes what the
   * application displays, so it must stop matching.
   */
  var CONTEXT_VERSION = "2";

  /* Rounding applied before hashing, so floating-point noise cannot cause a
   * spurious cache miss. Weights and scores are compared at these precisions. */
  var WEIGHT_DP = 6;
  var SCORE_DP  = 4;
  var MONEY_DP  = 3;
  var TOP_N     = 5;   // how many ranked markets participate in the identity

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function round(v, dp) {
    if (typeof v !== "number" || !isFinite(v)) { return null; }
    var f = Math.pow(10, dp);
    return Math.round(v * f) / f;
  }

  /**
   * djb2-style 32-bit hash, rendered as hex. Matches the hashing style already
   * used server-side so the two are recognisably the same technique.
   *
   * This is a fingerprint for cache matching, NOT a security primitive. It is
   * not used to authenticate anything, so collision resistance beyond "two
   * different scenarios almost never collide" is not required.
   */
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h & h;
    }
    return (h >>> 0).toString(16);
  }

  /** Stable stringify: object keys sorted, so property order cannot vary. */
  function canonical(value) {
    if (value === null || value === undefined) { return "null"; }
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (k) {
        return JSON.stringify(k) + ":" + canonical(value[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  // ─── Component fingerprints ───────────────────────────────────────────────

  /**
   * Dataset identity. Taken from markets.json's derivedFrom block where
   * present, so regenerating the observations changes the key automatically.
   */
  function datasetFingerprint(marketsDoc) {
    var d = (marketsDoc && marketsDoc.derivedFrom) || {};
    var markets = (marketsDoc && marketsDoc.markets) || [];
    return {
      generatorVersion:  d.generatorVersion || "unknown",
      totalObservations: d.totalObservations || null,
      marketCount:       markets.length,
      dataAsOf:          (marketsDoc && marketsDoc.dataAsOf) || null
    };
  }

  /**
   * Portfolio identity. Deliberately includes each asset's identity and value,
   * not merely the count — swapping one asset for another of equal value is a
   * different portfolio and must invalidate the cache.
   */
  function portfolioFingerprint(assets) {
    var list = assets || [];
    var ids = list.map(function (a) {
      return (a.assetId || a.assetName || "?") + ":" + round(a.propertyValue, 0);
    }).sort();
    return {
      assetCount: list.length,
      totalValue: round(list.reduce(function (s, a) { return s + (a.propertyValue || 0); }, 0), 0),
      assetsHash: hash(ids.join("|"))
    };
  }

  var FACTOR_KEYS = ["demandWeight", "diversWeight", "growthWeight", "riskWeight", "yieldWeight"];

  /** Weight identity: the five factor weights only, rounded and ordered.
   * Preset objects also carry a display label; it is not a weight and must not
   * make two identical weightings hash differently. */
  function weightsFingerprint(weights) {
    var w = weights || {};
    var out = {};
    FACTOR_KEYS.forEach(function (k) { out[k] = round(w[k], WEIGHT_DP); });
    return out;
  }

  /**
   * Ranking identity: the leading markets and their composite scores. Included
   * because commentary discusses the top picks by name. If the ranking shifts,
   * the narrative is stale even when weights and portfolio are unchanged.
   */
  function rankingFingerprint(ranked) {
    return (ranked || []).slice(0, TOP_N).map(function (m) {
      /* totalScore is the field ScoringEngine.rankMarkets() actually sets. This
       * previously read only compositeScore and score, neither of which a
       * ranked market carries, so every score in the key was null and a change
       * of score that left the order intact could not invalidate the cache. */
      var s = typeof m.totalScore === "number" ? m.totalScore
            : typeof m.compositeScore === "number" ? m.compositeScore
            : (typeof m.score === "number" ? m.score : null);
      return {
        marketId: m.marketId || null,
        score: round(s, SCORE_DP)
      };
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Build the full scenario descriptor. Returned as an object (not just a
   * hash) so the UI can show precisely which field differs when a cache misses.
   *
   * @param {Object} input
   *   marketsDoc     parsed markets.json (for dataset identity)
   *   assets         portfolio assets array
   *   weights        factor weights in use
   *   investmentCr   investment amount in crore
   *   selectedTargetId  marketId of the target every page analyses
   *   selectionMode     "auto" | "manual"
   *   governanceOverride  true when the simulation-support screen was ignored
   *   recommendedCandidateId  the screen's candidate (may differ from the target)
   *   ranked         ranked market array
   */
  function describe(input) {
    input = input || {};
    return {
      methodologyVersion: METHODOLOGY_VERSION,
      contextVersion:     CONTEXT_VERSION,
      dataset:            datasetFingerprint(input.marketsDoc),
      portfolio:          portfolioFingerprint(input.assets),
      weights:            weightsFingerprint(input.weights),
      investmentCr:       round(input.investmentCr, MONEY_DP),
      selectedTargetId:   input.selectedTargetId || null,
      selectionMode:      input.selectionMode === "manual" ? "manual" : "auto",
      governanceOverride: !!input.governanceOverride,
      recommendedCandidateId: input.recommendedCandidateId || null,
      topRanked:          rankingFingerprint(input.ranked)
    };
  }

  /** The canonical hash for a scenario descriptor (or raw input). */
  function compute(input) {
    var d = (input && input.methodologyVersion) ? input : describe(input);
    return hash(canonical(d));
  }

  /**
   * Compare two descriptors and name the fields that differ.
   * Used to tell the user WHY cached commentary was not used, rather than
   * silently falling back.
   */
  function diff(a, b) {
    if (!a || !b) { return ["scenario descriptor missing"]; }
    var fields = ["methodologyVersion", "contextVersion", "dataset", "portfolio", "weights",
                  "investmentCr", "selectedTargetId", "selectionMode", "governanceOverride",
                  "recommendedCandidateId", "topRanked"];
    var LABEL = {
      methodologyVersion: "scoring methodology",
      contextVersion:     "agent context version",
      dataset:            "dataset version",
      portfolio:          "portfolio",
      weights:            "factor weights",
      investmentCr:       "investment amount",
      selectedTargetId:   "selected target market",
      selectionMode:      "selection mode (automatic or manual)",
      governanceOverride: "simulation-support screen setting",
      recommendedCandidateId: "shortlist candidate",
      topRanked:          "market ranking"
    };
    var out = [];
    fields.forEach(function (f) {
      if (canonical(a[f]) !== canonical(b[f])) { out.push(LABEL[f] || f); }
    });
    return out;
  }

  /** True only when every component matches exactly. */
  function matches(a, b) {
    return diff(a, b).length === 0;
  }

  var ScenarioKey = {
    METHODOLOGY_VERSION: METHODOLOGY_VERSION,
    CONTEXT_VERSION:     CONTEXT_VERSION,
    TOP_N:               TOP_N,
    describe:            describe,
    compute:             compute,
    diff:                diff,
    matches:             matches,
    canonical:           canonical,
    hash:                hash,
    datasetFingerprint:  datasetFingerprint,
    portfolioFingerprint: portfolioFingerprint,
    weightsFingerprint:  weightsFingerprint,
    rankingFingerprint:  rankingFingerprint
  };

  // Support both browser global and CommonJS (for tests)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ScenarioKey;
  } else {
    root.ScenarioKey = ScenarioKey;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

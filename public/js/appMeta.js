/**
 * appMeta.js — the project's single canonical source of counts and labels
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS EXISTS
 * ---------------
 * Figures such as "50 market segments", "2,156 observations", "10 holdings"
 * and "₹500 Cr" were previously written out by hand in the README, in ten
 * documents, in page subtitles, in source comments and in test expectations.
 * Every time the dataset was regenerated, some of those copies were updated
 * and some were not, and the project then stated two different facts about
 * itself in two different places. A reader cannot tell which copy is right,
 * so every copy becomes untrustworthy.
 *
 * This module fixes the problem in the only way that lasts: nothing counts
 * anything by hand. Counts are DERIVED from the data files at run time, and
 * labels live here once.
 *
 *   - counts and figures  ->  AppMeta.derive(docs)   (computed, never typed)
 *   - names and labels    ->  AppMeta.PROJECT        (typed once, here)
 *   - governance rules    ->  AppMeta.GOVERNANCE     (typed once, here)
 *   - the agent roster    ->  AppMeta.AGENTS         (typed once, here)
 *
 * data-pipeline/scripts/buildMeta.js runs the same derivation in Node and
 * writes public/data/meta.json plus docs/CANONICAL_FACTS.md, so the prose
 * documentation quotes the same computed numbers the application displays.
 *
 * Pure module: no DOM, no network, no clock reads.
 */

(function (root) {
  "use strict";

  /* ─── Labels: typed once, nowhere else ──────────────────────────────────
   * Institution note: this project is submitted at NMIMS. An earlier
   * revision carried "SPJIMR" in several files; docs/verification-evidence.md
   * records that migration. Nothing should hardcode an institution name
   * again — read it from here.
   */
  var PROJECT = {
    appName:        "REIT Target AI",
    tagline:        "Decision support for REIT target-market selection",
    institution:    "NMIMS",
    programme:      "B.Sc. Finance",
    course:         "Business Analytics",
    theme:          "Theme 4 — Building Agents/Artifacts Using Generative AI",
    themeShort:     "BA Theme 4",
    author:         "Vishesh Jain",
    academicSession: "2026",

    /* Bumped by hand only when scoring or simulation logic changes results.
     * Kept identical to ScenarioKey.METHODOLOGY_VERSION; the test suite
     * asserts the two agree, so they cannot drift apart silently. */
    methodologyVersion: "1.0.0",

    dataIsSynthetic: true,
    syntheticNotice: "All data in this application is synthetic and was created for academic " +
                     "demonstration only. It does not describe any real property, tenant, " +
                     "transaction or market, and must not be used for any investment decision.",
    publicUrl:      "https://visheshjain0603-design.github.io/reit-target-ai/"
  };

  /* ─── Recommendation governance ────────────────────────────────────────
   * A market segment with 26 observations and a confidence grade of E can
   * still win the composite score, because the score measures attractiveness
   * and says nothing about how well the underlying estimate is supported.
   * Presenting such a segment as a recommendation without qualification
   * overstates what the data can carry, so eligibility is a separate test
   * from the score, applied and displayed independently.
   */
  var GOVERNANCE = {
    MIN_OBSERVATIONS: 30,
    MIN_GRADE:        "C",             // "C+" in prose: A, B or C qualifies
    GRADE_ORDER:      ["A", "B", "C", "D", "E"],
    rationale: "Thirty observations is the conventional floor at which the sampling " +
               "distribution of a mean is treated as approximately normal, and grade C " +
               "is the lowest grade whose estimate rests on documented evidence rather " +
               "than assumption alone. Both are descriptive conventions adopted for this " +
               "project, not regulatory thresholds.",
    overrideLabel: "Include segments that do not meet the evidence floor",
    overrideNote:  "Overriding shows every segment in the ranking. Segments below the " +
                   "floor stay marked, and the report records that the override was used."
  };

  /* ─── The agent roster ─────────────────────────────────────────────────
   * Four agents, not six. Two of the original six were removed for reasons
   * that are methodological rather than cosmetic:
   *
   *   Data Quality + Statistical Analysis were one job split in two. Both
   *   received the same statistical context and both commented on sample
   *   sizes and dispersion, so their outputs overlapped and occasionally
   *   disagreed with each other in wording.
   *
   *   Validation was never a language task at all. Every check it performed
   *   — do the weights total 100%, are the scores within range, is the
   *   selected target present in the ranking, do the HHI figures agree — is
   *   a deterministic arithmetic comparison with a single correct answer.
   *   Asking a language model to perform it introduced the possibility of a
   *   wrong verdict on a question that cannot be wrong when computed.
   *   It is now validator.js, runs before any model call, and its result
   *   gates the Orchestrator.
   */
  var AGENTS = [
    {
      key:   "dataStatistical",
      label: "Data & Statistical Analyst",
      purpose: "Reads the dataset's quality and its descriptive statistics together: " +
               "sample sizes, dispersion, correlation structure and the anomalies the " +
               "detectors found.",
      step:  { id: "data", label: "Dataset read and described" },
      legacy: ["dataQuality", "statisticalAnalysis"]
    },
    {
      key:   "marketScreening",
      label: "Market Screening Analyst",
      purpose: "Explains why the leading segment scored as it did, and how the " +
               "runner-up differs from it.",
      step:  { id: "screening", label: "Ranking interpreted" },
      legacy: ["marketScreening"]
    },
    {
      key:   "portfolioRisk",
      label: "Portfolio Risk & Scenario Analyst",
      purpose: "Interprets the concentration (HHI) change this investment would cause " +
               "and what the scenario projections imply.",
      step:  { id: "simulation", label: "Concentration and scenarios interpreted" },
      legacy: ["diversification", "portfolioAnalysis"]
    },
    {
      key:   "orchestrator",
      label: "Investment Orchestrator",
      purpose: "Combines the three analyses into one recommendation with its rationale " +
               "and risk warnings. Runs only after the deterministic checks pass.",
      step:  { id: "recommend", label: "Recommendation synthesised" },
      legacy: ["orchestrator"]
    }
  ];

  var AGENT_KEYS = AGENTS.map(function (a) { return a.key; });

  /** Map a legacy agent name onto its current one, or null if unknown. */
  function resolveAgentKey(name) {
    for (var i = 0; i < AGENTS.length; i++) {
      if (AGENTS[i].key === name) { return AGENTS[i].key; }
      if (AGENTS[i].legacy.indexOf(name) !== -1) { return AGENTS[i].key; }
    }
    return null;
  }

  function agent(key) {
    var k = resolveAgentKey(key);
    for (var i = 0; i < AGENTS.length; i++) { if (AGENTS[i].key === k) { return AGENTS[i]; } }
    return null;
  }

  /* ─── Derivation: every number below is computed, none is typed ──────── */

  function uniq(list) {
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v === undefined || v === null || v === "") { continue; }
      if (!seen[v]) { seen[v] = true; out.push(v); }
    }
    return out;
  }

  function sum(list) {
    var t = 0;
    for (var i = 0; i < list.length; i++) { t += (list[i] || 0); }
    return t;
  }

  /**
   * Derive every canonical count from the loaded data documents.
   *
   * @param {Object} docs
   *   marketsDoc    parsed public/data/markets.json
   *   portfolioDoc  parsed public/data/portfolio.json
   *   statisticsDoc parsed public/data/statistics.json   (optional)
   * @returns {Object} counts, all computed
   */
  function derive(docs) {
    docs = docs || {};
    var mDoc = docs.marketsDoc    || {};
    var pDoc = docs.portfolioDoc  || {};
    var sDoc = docs.statisticsDoc || null;

    var markets = mDoc.markets || [];
    var assets  = pDoc.assets  || [];
    var derivedFrom = mDoc.derivedFrom || {};

    var totalValueRs = sum(assets.map(function (a) { return a.propertyValue; }));
    var totalRentRs  = sum(assets.map(function (a) { return a.annualRent; }));

    var grades = {};
    markets.forEach(function (m) {
      var g = m.confidenceGrade || "unknown";
      grades[g] = (grades[g] || 0) + 1;
    });

    var obsCounts = markets.map(function (m) { return m.observationCount || 0; });

    return {
      marketCount:  markets.length,
      cityCount:    uniq(markets.map(function (m) { return m.city; })).length,
      cities:       uniq(markets.map(function (m) { return m.city; })).sort(),
      propertyTypeCount: uniq(markets.map(function (m) { return m.propertyType; })).length,
      propertyTypes:     uniq(markets.map(function (m) { return m.propertyType; })).sort(),
      localityClasses:   uniq(markets.map(function (m) { return m.localityClass; })).sort(),
      confidenceGradeCounts: grades,

      observationCount: sum(obsCounts),
      observationsPerMarketMin: obsCounts.length ? Math.min.apply(null, obsCounts) : 0,
      observationsPerMarketMax: obsCounts.length ? Math.max.apply(null, obsCounts) : 0,

      assetCount:        assets.length,
      portfolioValueRs:  totalValueRs,
      portfolioValueCr:  totalValueRs / 1e7,
      portfolioRentRs:   totalRentRs,
      portfolioRentCr:   totalRentRs / 1e7,
      portfolioWeightedYield: totalValueRs ? totalRentRs / totalValueRs : 0,

      datasetName:       mDoc.datasetName || null,
      dataAsOf:          mDoc.dataAsOf    || null,
      generatorVersion:  derivedFrom.generatorVersion || null,
      seed:              (sDoc && sDoc.seed) || null,
      plantedAnomalies:  (sDoc && sDoc.outlierDetection && sDoc.outlierDetection.groundTruth &&
                          sDoc.outlierDetection.groundTruth.planted) || null,
      contaminationPct:  (sDoc && sDoc.outlierDetection && sDoc.outlierDetection.groundTruth &&
                          sDoc.outlierDetection.groundTruth.contaminationPct) || null,
      marketsBelowObsFloor: markets.filter(function (m) {
                              return (m.observationCount || 0) < GOVERNANCE.MIN_OBSERVATIONS;
                            }).length,

      agentCount:        AGENTS.length,
      presetCount:       4,
      methodologyVersion: PROJECT.methodologyVersion
    };
  }

  /** Format a rupee amount in crore, the unit this project reports in. */
  function cr(rs, dp) {
    if (typeof rs !== "number" || !isFinite(rs)) { return "—"; }
    return "₹" + (rs / 1e7).toFixed(dp === undefined ? 2 : dp) + " Cr";
  }

  /** Thousands separators, so "2,156" is never typed by hand either. */
  function num(n) {
    if (typeof n !== "number" || !isFinite(n)) { return "—"; }
    return n.toLocaleString("en-IN");
  }

  var AppMeta = {
    PROJECT:     PROJECT,
    GOVERNANCE:  GOVERNANCE,
    AGENTS:      AGENTS,
    AGENT_KEYS:  AGENT_KEYS,
    agent:            agent,
    resolveAgentKey:  resolveAgentKey,
    derive:      derive,
    cr:          cr,
    num:         num,

    /** One-line attribution used on the report cover and the page footer. */
    attribution: function () {
      return PROJECT.institution + " " + PROJECT.programme + " | " +
             PROJECT.course + " | " + PROJECT.theme;
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppMeta;
  } else {
    root.AppMeta = AppMeta;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

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
    publicUrl:      "https://visheshjain0603-design.github.io/reit-target-ai/",
    repoName:       "reit-target-ai",
    repoUrl:        "https://github.com/visheshjain0603-design/reit-target-ai"
  };

  /* ─── Customer, business problem and use cases ─────────────────────────
   * Stated once. The Overview renders it, buildMeta.js copies it into
   * meta.json, and the generated "customer-and-use-cases" block carries the
   * same words into the README, the project report and CANONICAL_FACTS.md, so
   * the wording cannot drift between the application and the documents.
   * Each use case names the pages where it is carried out.
   */
  var CUSTOMER = {
    primaryUser: "REIT investment analysts and acquisition committees evaluating where a " +
                 "proposed new investment should be allocated.",
    businessProblem: "A REIT must balance income, growth, demand, risk and portfolio " +
                     "diversification when choosing its next target market, while " +
                     "understanding the reliability and limitations of the supporting data.",
    useCases: [
      { text: "Diagnose geographic and asset-type concentration in the existing portfolio.",
        pages: ["portfolio", "diversification"] },
      { text: "Rank target markets using adjustable business priorities.",
        pages: ["screener"] },
      { text: "Compare the highest raw-score market with the highest-ranked market passing " +
              "the simulation-support screen.",
        pages: ["screener", "overview"] },
      { text: "Simulate yield, concentration and scenario effects of a proposed investment.",
        pages: ["diversification"] },
      { text: "Produce deterministic validation and Gemini-assisted interpretation.",
        pages: ["agents"] },
      { text: "Generate a printable decision report for management discussion.",
        pages: ["report"] }
    ]
  };

  /** A repository-relative path as a link a reader can actually open. */
  function docUrl(relPath) {
    return PROJECT.repoUrl + "/blob/main/" + String(relPath).replace(/^\/+/, "");
  }

  /* ─── The simulation-support screen ────────────────────────────────────
   * The composite score measures attractiveness. It says nothing about how
   * precisely the simulation pins down a segment's figures, and nothing at all
   * about whether those figures match the real market. Three things are kept
   * apart, and must not be confused anywhere in the application:
   *
   *   1. attractiveness   the five-factor composite score
   *   2. simulation support   how many seeded draws stand behind a segment's
   *                       medians, how wide their P10–P90 spread is, and the
   *                       project's own Assumption Support Grade
   *   3. external calibration   whether a cited source was located and the
   *                       figure traced to it — see EXTERNAL_CALIBRATION
   *
   * The screen below tests (2) only. More simulated draws make a segment's
   * estimated median more precise around the ASSUMED distribution; they do not
   * narrow the P10–P90 spread of the observations themselves (that describes
   * the assumed distribution), and they do not create market evidence, so
   * passing the screen never implies that a segment is externally supported.
   * docs/SCREEN_SENSITIVITY.md measures both quantities and shows the shortlist
   * under thresholds of 25, 30 and 40 draws and grade B or C.
   *
   * An earlier revision justified n = 30 by the Central Limit Theorem and
   * described grade C as resting on "documented evidence". Neither holds: the
   * project ranks medians of synthetic draws, not sample means, and no cited
   * document was ever located (docs/SOURCE_VERIFICATION_REPORT.md).
   */
  var GOVERNANCE = {
    name:             "Simulation-support screen",
    MIN_OBSERVATIONS: 30,              // simulated draws behind the segment's medians
    MIN_GRADE:        "C",             // Assumption Support Grade: A, B or C qualifies
    GRADE_ORDER:      ["A", "B", "C", "D", "E"],
    rule: "at least 30 simulated observations and Assumption Support Grade C or better",
    rationale: "A transparent project convention chosen by the authors, not a regulatory or " +
               "universal statistical threshold. More draws make a segment's estimated median " +
               "more precise; they do not narrow the P10–P90 spread of its simulated observations. " +
               "Thirty is a chosen minimum, not a proven sufficient sample. Grade C or better " +
               "excludes the assumption sets the authors graded D (estimated from comparable " +
               "segments) or E (placeholder). Passing the screen says nothing about real-market accuracy.",
    overrideLabel: "Ignore the simulation-support screen (make the highest raw-score market the candidate)",
    overrideNote:  "With the screen ignored, the candidate is simply the highest raw-score market. " +
                   "Segments that fail the screen stay marked, and the report records that the " +
                   "screen was ignored."
  };

  /* The A–E grade is assigned by the project to each segment's ASSUMPTION SET
   * (data-pipeline/market_universe.csv). It records the kind of benchmark the
   * assumptions were meant to follow and how wide a band was assumed around
   * them. It is an internal classification: none of the benchmarks it refers
   * to has been located or traced, so it is not an evidence grade. */
  var SUPPORT_GRADES = {
    label: "Assumption Support Grade",
    definition: "An author-assigned simulation convention: the project's internal A–E " +
                "classification of how a segment's assumptions were intended to be constructed " +
                "and how wide a band was assumed around them. It is not an evidence grade: none " +
                "of the benchmarks it refers to has been externally verified, and it is separate " +
                "from the legacy sourceType label.",
    grades: {
      A: "Assumptions intended to follow a named primary benchmark; narrowest assumed band (±5–8%).",
      B: "Assumptions intended to follow a primary or secondary benchmark with minor interpolation (±10–12%).",
      C: "City-level benchmark adjusted by a locality-class multiplier (±15–20%).",
      D: "Estimated from comparable segments; wide assumed band (±20–30%).",
      E: "Placeholder assumptions; widest assumed band (±30–40%)."
    }
  };

  /* ─── External calibration ─────────────────────────────────────────────
   * Derived ONLY from the source register's verification outcomes, never from
   * simulation count or grade. A segment is:
   *   Verified             every external source it cites was located and the figure traced
   *   Partially supported  at least one cited source was located and a figure traced
   *   Unverified           no cited figure has been traced
   * The register records zero located documents, so every segment is
   * Unverified until that changes in the register itself.
   */
  var EXTERNAL_CALIBRATION = {
    label:    "External calibration",
    STATUSES: ["Verified", "Partially supported", "Unverified"],
    basis:    "Source Verification Report: 0 of 12 cited documents located, 0 figures traced, " +
              "no source upgraded to Verified.",
    reportPath: "docs/SOURCE_VERIFICATION_REPORT.md"
  };

  /** Classify one register row's verification_status text. */
  function sourceOutcome(statusText) {
    var t = String(statusText || "").trim();
    if (/^verified\b/i.test(t) && !/not\s+verified/i.test(t)) { return "Verified"; }
    if (/partially supported|figure traced/i.test(t))          { return "Partially supported"; }
    if (/^n\/a|internal/i.test(t))                              { return "Internal"; }
    return "Unverified";
  }

  /**
   * External calibration for a segment from the outcomes of the sources it
   * cites. Takes no observation count and no grade — by construction it cannot
   * be inferred from simulation precision.
   */
  function calibrationStatus(sourceIds, outcomes) {
    var ids = (sourceIds || []).filter(function (id) {
      return outcomes && outcomes[id] && outcomes[id] !== "Internal";
    });
    if (!ids.length) { return "Unverified"; }
    var verified = ids.filter(function (id) { return outcomes[id] === "Verified"; }).length;
    var partial  = ids.filter(function (id) { return outcomes[id] === "Partially supported"; }).length;
    if (verified === ids.length) { return "Verified"; }
    if (verified + partial > 0)  { return "Partially supported"; }
    return "Unverified";
  }

  /* ─── Controlled glossary ──────────────────────────────────────────────
   * The words every page, the agent context, the report and the documentation
   * must use for the same concepts. tests/reit-tests.js checks the documents
   * against it, and the agent output checker rejects the retired terms.
   */
  var TERMS = {
    attractivenessScore: { label: "Composite attractiveness score",
      definition: "The five-factor weighted score (rental yield, rental growth, diversification, demand, low market risk), 0–100." },
    rawRank: { label: "Raw rank",
      definition: "Position among all segments by composite attractiveness score alone." },
    highestRawScoreMarket: { label: "Highest raw-score market",
      definition: "Raw rank 1, whether or not it passes the simulation-support screen." },
    simulationSupportScreen: { label: "Simulation-support screen",
      definition: "At least 30 simulated observations and Assumption Support Grade C or better. A project governance convention for simulation precision." },
    eligibleRank: { label: "Eligible rank",
      definition: "Position among the segments that pass the simulation-support screen." },
    shortlistCandidate: { label: "Shortlist candidate",
      definition: "The highest-ranked candidate passing the simulation-support screen: an exploratory model output, not an investment recommendation." },
    nextEligibleCandidate: { label: "Next eligible candidate",
      definition: "Eligible rank 2." },
    selectedTarget: { label: "Selected target",
      definition: "The segment every page analyses. In automatic mode it is the shortlist candidate; in manual mode it is the user's choice." },
    manualTarget: { label: "Manually selected target",
      definition: "A selected target chosen by the user rather than by the screen." },
    simulatedObservations: { label: "Simulated market observations",
      definition: "Seeded draws from the project's generator. Not properties, listings or transactions." },
    supportGrade: { label: "Assumption Support Grade", definition: SUPPORT_GRADES.definition },
    externalCalibration: { label: "External calibration status",
      definition: "Verified, Partially supported or Unverified, from the source register only." },
    knownSyntheticAnomalies: { label: "Known synthetic anomalies",
      definition: "Anomalies the generator inserted deliberately, recorded separately as ground truth." }
  };

  /* Phrases that describe the retired framing. Pages, agent output and current
   * documentation must not use them. */
  var RETIRED_TERMS = [
    { pattern: /\bstrong evidence\b/i,        use: "simulation support" },
    { pattern: /\bevidence floor\b/i,         use: "simulation-support screen" },
    { pattern: /\bmeets the floor\b/i,        use: "passes the simulation-support screen" },
    { pattern: /\bdocumented evidence\b/i,    use: "external calibration (Unverified)" },
    { pattern: /\bconfidence grade\b/i,       use: "Assumption Support Grade" },
    { pattern: /\brunner-?up\b/i,             use: "highest raw-score alternative / next eligible candidate" },
    { pattern: /\bplanted anomal/i,            use: "known synthetic anomalies" },
    { pattern: /central limit theorem/i,       use: "(remove — not applicable)" }
  ];

  /* The Agent Output page is offered only on a local copy (siteMode.js): the
   * public site cannot hold an API key, so it shows the deterministic analysis
   * only. `?publicSite=1` forces the public behaviour for testing. */
  function agentsAvailable(loc) {
    loc = loc || (typeof location !== "undefined" ? location : null);
    if (!loc) { return true; }
    if (/[?&]publicSite=1\b/.test(loc.search || "")) { return false; }
    return loc.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(loc.hostname || "");
  }
  var AGENTS_LOCAL_ONLY = "The Gemini agents run only on a local copy of the application: live for any " +
    "settings with the local proxy (node server/server.js, then http://localhost:3001), or as stored " +
    "commentary for the four presets at their defaults on a local static server. The public site shows " +
    "the deterministic analysis only.";

  /* Display labels for the internal sourceType codes in markets.json. None
   * says "reported": no reported figure has been verified, so a label that
   * implied one would contradict the Source Verification Report. */
  var SOURCE_TYPE_LABELS = {
    reported_tier1:                 "Legacy label: benchmark-based record — source cited, not located",
    estimated_tier3:                "Legacy label: city benchmark × locality multiplier — source cited, not located",
    estimated_synthetic:            "Legacy label: estimated by synthetic interpolation",
    synthetic_academic_placeholder: "Legacy label: synthetic academic record (first-generation dataset)"
  };

  function sourceTypeLabel(code) {
    return SOURCE_TYPE_LABELS[code] || "Unclassified assumption";
  }

  /* Fixed next-step wording for every candidate while calibration is unverified. */
  var CANDIDATE_CAVEAT = "Exploratory shortlist only. External calibration remains unverified — " +
    "proceed to further evidence collection and due diligence before any real decision.";

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
      purpose: "Explains why the shortlist candidate scored as it did, and how it " +
               "differs from the highest raw-score market and the next eligible candidate.",
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
      purpose: "Combines the three analyses into one structured summary of the selected " +
               "target, its screening basis, risks and next steps. Runs only after the " +
               "deterministic checks pass.",
      step:  { id: "recommend", label: "Summary of the selected target synthesised" },
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
      externalCalibrationStatus: "Unverified",   // overridden by buildMeta from the register
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
    CUSTOMER:    CUSTOMER,
    GOVERNANCE:  GOVERNANCE,
    SUPPORT_GRADES:       SUPPORT_GRADES,
    EXTERNAL_CALIBRATION: EXTERNAL_CALIBRATION,
    TERMS:                TERMS,
    RETIRED_TERMS:        RETIRED_TERMS,
    agentsAvailable:      agentsAvailable,
    AGENTS_LOCAL_ONLY:    AGENTS_LOCAL_ONLY,
    CANDIDATE_CAVEAT:     CANDIDATE_CAVEAT,
    SOURCE_TYPE_LABELS:   SOURCE_TYPE_LABELS,
    sourceTypeLabel:      sourceTypeLabel,
    sourceOutcome:        sourceOutcome,
    calibrationStatus:    calibrationStatus,
    docUrl:               docUrl,
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

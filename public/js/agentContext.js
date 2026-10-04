/**
 * agentContext.js — the deterministic context sent to the Gemini agents
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * ONE VOCABULARY, BUILT FROM THE SHARED RUN
 * -----------------------------------------
 * The agents interpret; they never calculate, rank or validate. Everything
 * they may say about a number must therefore already be in this context, under
 * a name that cannot be misread. The first cache build showed what happens
 * otherwise:
 *
 *   - the dataset-wide median gross yield (across 50 market segments) was
 *     supplied as "portfolioStats" and described as the portfolio's yield;
 *   - "runner-up" meant raw rank 2 to one agent and the next eligible segment
 *     to another, so two different markets were each called the runner-up;
 *   - a candidate at raw rank 8 was said to have "ranked first";
 *   - exclusions were attributed to sample size when the segment had failed on
 *     its support grade alone.
 *
 * So the context now carries explicit fields — rawRank, eligibleRank,
 * highestRawScoreMarket, recommendedCandidate, selectedTarget, selectionMode,
 * passesSimulationSupportRule, simulationObservationCount, supportGrade,
 * externalCalibrationStatus and exact exclusion reasons — and every figure at
 * the precision the interface displays it. "Runner-up" does not appear.
 *
 * It is built from the shared analysis run (analysisRun.js), so the context
 * the Agents page sends, the context buildAgentCache.js stores commentary
 * against, and the figures every other page displays are one object.
 *
 * Pure: no DOM, no network, no clock reads.
 */

(function (root) {
  "use strict";

  function dep(name, file) {
    if (typeof module !== "undefined" && module.exports) { return require("./" + file); }
    return root[name];
  }

  function r(v, dp) {
    if (typeof v !== "number" || !isFinite(v)) { return null; }
    var f = Math.pow(10, dp);
    return Math.round(v * f) / f;
  }

  /* Figures the models may quote are supplied as fixed-decimal STRINGS. A JSON
   * number cannot carry its display precision — 7.00 serialises as 7 and 0.4130
   * as 0.413 — so the model could not know that the interface shows "7.00%",
   * and wrote "7%". As strings, the precision travels with the figure, and the
   * output checker requires it to be quoted exactly. */
  function fx(v, dp) {
    return typeof v === "number" && isFinite(v) ? v.toFixed(dp) : null;
  }

  /**
   * Rank all markets the way the Market Screener does, with the portfolio and
   * the diversification function, and attach each market's HHI simulation.
   */
  function rankForScreener(markets, assets, weights, investmentCr) {
    var SE = dep("ScoringEngine", "scoringEngine.js");
    var H  = dep("HHIEngine", "hhi.js");
    var res = SE.rankMarkets(markets, weights, assets, H.diversificationScore);
    var investmentRs = Math.round(investmentCr * 1e7);
    for (var i = 0; i < res.ranked.length; i++) {
      res.ranked[i].simulation = investmentRs > 0
        ? H.simulateInvestment(assets, res.ranked[i], investmentRs)
        : null;
    }
    return res.ranked;
  }

  /** The default investment: 10% of portfolio value, in crore (₹50 Cr for the sample). */
  function defaultInvestmentCr(assets) {
    var H = dep("HHIEngine", "hhi.js");
    return Math.round(H.totalValue(assets) / 1e7 * 0.10 * 100) / 100;
  }

  function nameOf(m) {
    return m ? (m.locality || m.marketId) + ", " + m.city : null;
  }

  var FACTOR_NAMES = {
    yieldContrib: "rental yield", growthContrib: "rental growth", diversContrib: "diversification",
    demandContrib: "demand", riskContrib: "low market risk"
  };

  /** The factor contributing most to the score — supplied so it is never guessed. */
  function largest(c) {
    var best = null;
    Object.keys(FACTOR_NAMES).forEach(function (k) {
      if (typeof c[k] === "number" && (!best || c[k] > c[best])) { best = k; }
    });
    return best ? { factor: FACTOR_NAMES[best], contribution: fx(c[best], 2) } : null;
  }

  /** Every figure about one segment, at display precision, under one vocabulary. */
  function marketSummary(m) {
    if (!m) { return null; }
    var g = m.governance || {};
    var u = (m.uncertainty && m.uncertainty.grossYieldPct) || null;
    var c = m.contributions || {};
    var f = m.factors || {};
    return {
      marketId:          m.marketId,
      name:              nameOf(m),
      city:              m.city,
      propertyType:      m.propertyType,
      rawRank:           m.rank,
      eligibleRank:      typeof m.eligibleRank === "number" ? m.eligibleRank : null,
      compositeScore:    fx(m.totalScore, 2),
      grossYieldPct:     fx(m.grossYield * 100, 2),
      rentalGrowthPct:   fx(m.annualRentalGrowthRatio * 100, 2),
      demandScore:       m.demandScore,
      riskScore:         m.riskScore,
      factorScores: {
        rentalYield:     fx(f.yieldScore, 2),
        rentalGrowth:    fx(f.growthScore, 2),
        diversification: fx(f.diversScore, 2),
        demand:          fx(f.demandScore, 2),
        lowMarketRisk:   fx(f.riskScore, 2)
      },
      contributions: {
        rentalYield:     fx(c.yieldContrib, 2),
        rentalGrowth:    fx(c.growthContrib, 2),
        diversification: fx(c.diversContrib, 2),
        demand:          fx(c.demandContrib, 2),
        lowMarketRisk:   fx(c.riskContrib, 2)
      },
      largestContribution: largest(c),
      passesSimulationSupportRule: !!g.eligible,
      simulationObservationCount:  m.observationCount,
      supportGrade:      m.confidenceGrade || null,
      simulationSupportLevel: g.tier || null,
      exclusionReasons:  g.reasons || [],
      failsScreenOn:     g.failsOn || null,
      externalCalibrationStatus: m.externalCalibrationStatus || "Unverified",
      grossYieldP10toP90Pct: u ? { lower: fx(u.lower, 2), upper: fx(u.upper, 2) } : null
    };
  }

  /**
   * Build the agent context from the shared analysis run.
   *
   * @param {Object} run    AnalysisRun.compute() result
   * @param {Object} data   { marketsDoc, statisticsDoc } — for dataset-level figures
   */
  function fromRun(run, data) {
    var AppMeta = dep("AppMeta", "appMeta.js");
    var Stats   = dep("Stats", "stats.js");
    data = data || {};
    var markets = (data.marketsDoc && data.marketsDoc.markets) || [];
    var R = AppMeta.GOVERNANCE;

    var byId = {};
    run.ranked.forEach(function (m) { byId[m.marketId] = m; });
    var selected    = byId[run.selectedTargetId] || null;
    var recommended = byId[run.recommendedCandidateId] || null;
    var rawLeader   = byId[run.highestRawScoreMarketId] || null;
    var eligible    = run.ranked.filter(function (m) { return m.governance && m.governance.eligible; });

    /* The segment compared against the selected target: the highest raw-score
     * market when that is a different segment, otherwise the next eligible
     * candidate. Named for what it is, never "runner-up". */
    var nextEligible = null;
    for (var i = 0; i < eligible.length; i++) {
      if (!selected || eligible[i].marketId !== selected.marketId) { nextEligible = eligible[i]; break; }
    }

    var higherRawScoreExclusions = run.ranked.filter(function (m) {
      return selected && m.totalScore > selected.totalScore && !(m.governance && m.governance.eligible);
    }).map(function (m) {
      return {
        marketId: m.marketId, name: nameOf(m), rawRank: m.rank,
        compositeScore: fx(m.totalScore, 2),
        simulationObservationCount: m.observationCount,
        supportGrade: m.confidenceGrade || null,
        failsScreenOn: m.governance.failsOn,
        exclusionReasons: m.governance.reasons
      };
    });

    var hhi = run.hhi || {};
    var proj = run.projections || {};
    var scenarios = {};
    if (proj.summary3y) {
      ["conservative", "base", "optimistic"].forEach(function (k) {
        var s = proj.summary3y[k];
        if (!s) { return; }
        scenarios[k] = {
          portfolioValueCr:   fx(s.portfolioValue / 1e7, 2),
          annualRentCr:       fx(s.annualRent / 1e7, 2),
          grossYieldPct:      fx(s.grossYield * 100, 2),
          effectiveYieldPct:  fx(s.effectiveGrossYield * 100, 2),
          valueChangePct:     fx(s.changeValuePct, 1)
        };
      });
    }

    var dataset = null;
    if (Stats && markets.length) {
      var ps = Stats.portfolioStats(markets);
      var below = markets.filter(function (m) { return (m.observationCount || 0) < R.MIN_OBSERVATIONS; });
      var citiesBelow = {};
      below.forEach(function (m) { citiesBelow[m.city] = (citiesBelow[m.city] || 0) + 1; });
      dataset = {
        scope: "MARKET-SEGMENT DATASET — the " + markets.length + " candidate segments, " +
               "NOT the portfolio. Never describe these figures as the portfolio's.",
        segmentCount:            ps.count,
        simulatedObservations:   ps.totalObservations,
        medianOfSegmentGrossYieldsPct: fx(ps.grossYield.median * 100, 2),
        segmentGrossYieldRangePct: { min: fx(ps.grossYield.min * 100, 2), max: fx(ps.grossYield.max * 100, 2) },
        segmentsBelowObservationThreshold: below.length,
        smallestSegmentObservations: Math.min.apply(null, markets.map(function (m) { return m.observationCount || 0; })),
        largestSegmentObservations:  Math.max.apply(null, markets.map(function (m) { return m.observationCount || 0; })),
        segmentsBelowThresholdByCity: citiesBelow
      };
    }

    var segmentOutliers = null;
    if (Stats && markets.length) {
      segmentOutliers = {
        definition: "Tukey 1.5×IQR fences applied to the SEGMENT MEDIAN gross yield and capital value " +
                    "within each city that has at least 4 segments. These are unusual segments, " +
                    "not anomalous observations.",
        byCity: Stats.outlierSummary(markets).map(function (o) {
          return { city: o.city, segments: o.segmentCount,
                   yieldOutlierSegments: o.yieldOutliers, capitalValueOutlierSegments: o.capOutliers,
                   tooFewSegmentsToTest: o.insufficientData };
        })
      };
    }

    var anomalies = null;
    var sd = data.statisticsDoc;
    if (sd && sd.outlierDetection && sd.outlierDetection.groundTruth) {
      anomalies = {
        definition: "Known synthetic anomalies inserted deliberately by the generator; the list is held " +
                    "separately as ground truth. Detector results are on the Statistics page.",
        known:            sd.outlierDetection.groundTruth.planted,
        contaminationPct: sd.outlierDetection.groundTruth.contaminationPct
      };
    }

    var pf = run.portfolio;
    return {
      dataNote: "SYNTHETIC ACADEMIC DATA — not real market values",
      contextVersion: run.scenarioDescriptor ? run.scenarioDescriptor.contextVersion : null,
      runNote: "",

      terminology: {
        rawRank:        AppMeta.TERMS.rawRank.definition,
        eligibleRank:   AppMeta.TERMS.eligibleRank.definition,
        highestRawScoreMarket: AppMeta.TERMS.highestRawScoreMarket.definition,
        shortlistCandidate:    AppMeta.TERMS.shortlistCandidate.definition,
        selectedTarget:        AppMeta.TERMS.selectedTarget.definition,
        simulationSupportScreen: AppMeta.TERMS.simulationSupportScreen.definition,
        supportGrade:   AppMeta.SUPPORT_GRADES.definition,
        externalCalibration: AppMeta.TERMS.externalCalibration.definition,
        simulatedObservations: AppMeta.TERMS.simulatedObservations.definition,
        wordsNotToUse:  ["runner-up", "ranked first (for anything but raw rank 1)",
                         "strong evidence", "evidence floor", "verified", "statistically significant",
                         "portfolio median (for dataset figures)"]
      },

      weights:      run.weights,
      weightsPct: {
        rentalYield:     Math.round(run.weights.yieldWeight * 100),
        rentalGrowth:    Math.round(run.weights.growthWeight * 100),
        diversification: Math.round(run.weights.diversWeight * 100),
        demand:          Math.round(run.weights.demandWeight * 100),
        lowMarketRisk:   Math.round(run.weights.riskWeight * 100)
      },
      preset:        run.preset,
      presetLabel:   run.presetLabel,
      investmentCr:  run.investmentCr,
      selectionMode: run.selectionMode,
      screenIgnored: run.governanceOverride,

      portfolio: {
        scope:            "PORTFOLIO — the " + pf.assetCount + " existing holdings (" + pf.source + " portfolio).",
        assetCount:       pf.assetCount,
        totalValueCr:     fx(pf.totalValueRs / 1e7, 2),
        annualRentCr:     fx(pf.annualRentRs / 1e7, 3),
        weightedYieldPct: fx(pf.weightedYield * 100, 3),
        cityHHI:          fx(pf.cityHHI, 4),
        assetTypeHHI:     fx(pf.typeHHI, 4)
      },

      simulationSupportScreen: {
        rule:                        R.rule,
        minSimulatedObservations:    R.MIN_OBSERVATIONS,
        minSupportGrade:             R.MIN_GRADE,
        nature:                      R.rationale,
        segmentsPassing:             eligible.length,
        segmentsTotal:               run.ranked.length
      },
      externalCalibration: {
        status: "Unverified",
        basis:  AppMeta.EXTERNAL_CALIBRATION.basis,
        consequence: AppMeta.CANDIDATE_CAVEAT
      },

      highestRawScoreMarket: marketSummary(rawLeader),
      recommendedCandidate:  marketSummary(recommended),
      selectedTarget:        selected ? Object.assign(marketSummary(selected), {
                               selectionMode: run.selectionMode,
                               sameAsRecommendedCandidate: !!recommended && recommended.marketId === selected.marketId
                             }) : null,
      comparisonMarket:      rawLeader && selected && rawLeader.marketId !== selected.marketId
                               ? Object.assign(marketSummary(rawLeader), { role: "Highest raw-score alternative" })
                               : (nextEligible ? Object.assign(marketSummary(nextEligible), { role: "Next eligible candidate" }) : null),
      nextEligibleCandidate: marketSummary(nextEligible),
      rawTop5:               run.ranked.slice(0, 5).map(marketSummary),
      eligibleTop3:          eligible.slice(0, 3).map(marketSummary),
      higherRawScoreExclusions: higherRawScoreExclusions,

      concentration: selected ? {
        cityHHIBefore:       fx(hhi.cityBefore, 4),
        cityHHIAfter:        fx(hhi.cityAfter, 4),
        cityHHIChange:       fx(hhi.cityAfter - hhi.cityBefore, 4),
        assetTypeHHIBefore:  fx(hhi.typeBefore, 4),
        assetTypeHHIAfter:   fx(hhi.typeAfter, 4),
        assetTypeHHIChange:  fx(hhi.typeAfter - hhi.typeBefore, 4),
        weightedYieldBeforePct: fx(hhi.weightedYieldBefore * 100, 3),
        weightedYieldAfterPct:  fx(hhi.weightedYieldAfter * 100, 3),
        benchmarks: "HHI above 0.25 concentrated; 0.15 to 0.25 moderate; below 0.15 diversified. Descriptive only."
      } : null,

      projections: selected ? {
        horizonYears:        3,
        assumptions:         "Flat growth rates; no leverage, tax, fees or transaction costs. Effective yield applies the scenario occupancy.",
        year0AnnualRentCr:   fx(proj.year0AnnualRentRs / 1e7, 3),
        year0PortfolioValueCr: fx(proj.year0PortfolioValueRs / 1e7, 2),
        targetAnnualRentCr:  fx(proj.targetAnnualRentRs / 1e7, 3),
        scenarios:           scenarios
      } : null,

      marketDataset:          dataset,
      segmentMedianOutliers:  segmentOutliers,
      knownSyntheticAnomalies: anomalies
    };
  }

  /**
   * Replace the Orchestrator's headline figures with the deterministic ones.
   * Kept for outputs produced under the earlier schema, which carried
   * compositeScore, expectedYieldPct and investmentAmount as model-written
   * fields; the model filled expectedYieldPct inconsistently. Current prompts
   * no longer ask for figures at all — the page renders them from the context.
   * Where an old figure differed it is kept in _modelFigures, not discarded.
   *
   * Pure: returns a new output object; the input is not modified.
   */
  function applyDeterministicFigures(output, ctx) {
    if (!output || typeof output !== "object" || output.raw !== undefined) { return output; }
    var t = ctx && ctx.selectedTarget;
    if (!t) { return output; }
    var exact = {
      compositeScore:   parseFloat(t.compositeScore),
      expectedYieldPct: parseFloat(t.grossYieldPct),
      investmentAmount: "₹" + ctx.investmentCr + " Cr"
    };
    var out = Object.assign({}, output);
    var differed = {};
    Object.keys(exact).forEach(function (k) {
      if (out[k] === undefined) { return; }
      if (out[k] !== exact[k]) { differed[k] = out[k]; }
      out[k] = exact[k];
    });
    if (Object.keys(differed).length) { out._modelFigures = differed; }
    return out;
  }

  var AgentContext = {
    fromRun:             fromRun,
    marketSummary:       marketSummary,
    applyDeterministicFigures: applyDeterministicFigures,
    rankForScreener:     rankForScreener,
    defaultInvestmentCr: defaultInvestmentCr
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AgentContext;
  } else {
    root.AgentContext = AgentContext;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

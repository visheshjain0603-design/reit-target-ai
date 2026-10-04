/**
 * agentContext.js — the context object sent to the Gemini agents
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * Two callers must build exactly the same context: the Agents page in the
 * browser, and data-pipeline/scripts/buildAgentCache.js, which pre-generates
 * the commentary served when the proxy is unreachable. The cache is keyed by
 * ScenarioKey, so if the two built their inputs differently the stored
 * commentary would either never match or — worse — match while describing a
 * context the page never sent. One implementation removes that possibility.
 *
 * Pure: no DOM, no network, no clock reads. The caller supplies runNote.
 */

(function (root) {
  "use strict";

  function dep(name, file) {
    if (typeof module !== "undefined" && module.exports) { return require("./" + file); }
    return root[name];
  }

  /**
   * Rank all markets the way the Market Screener does, with the portfolio and
   * the diversification function, and attach each market's HHI simulation.
   */
  function rankForScreener(markets, assets, weights, investmentCr) {
    var SE = dep("ScoringEngine", "scoringEngine.js");
    var H  = dep("HHIEngine", "hhi.js");
    var r = SE.rankMarkets(markets, weights, assets, H.diversificationScore);
    var investmentRs = Math.round(investmentCr * 1e7);
    for (var i = 0; i < r.ranked.length; i++) {
      r.ranked[i].simulation = investmentRs > 0
        ? H.simulateInvestment(assets, r.ranked[i], investmentRs)
        : null;
    }
    return r.ranked;
  }

  /** The screener's default investment: 10% of portfolio value, in crore. */
  function defaultInvestmentCr(assets) {
    var H = dep("HHIEngine", "hhi.js");
    return Math.round(H.totalValue(assets) / 1e7 * 0.10 * 100) / 100;
  }

  /**
   * The evidence-floor picture, for the model context and for display.
   * Reads the figures the Market Screener recorded where available, so the two
   * pages cannot describe the same run differently, and recomputes only as a
   * fallback.
   */
  function governanceContext(ranked, run) {
    var Governance = dep("Governance", "governance.js");
    if (!Governance) { return null; }
    var R = Governance.rules();
    var chosen = Governance.chooseTarget(ranked || [], {
      override: !!(run && run.governanceOverride)
    });
    var sel = null;
    var selId = (run && run.selectedTargetId) ||
                (chosen.target ? chosen.target.marketId : null);
    for (var i = 0; i < (ranked || []).length; i++) {
      if (ranked[i].marketId === selId) { sel = ranked[i]; break; }
    }
    var selGov = sel ? (sel.governance || Governance.evaluate(sel)) : null;

    return {
      rule: "A segment is eligible to be recommended only with at least " +
            R.MIN_OBSERVATIONS + " simulated market observations and confidence grade " +
            R.MIN_GRADE + " or better. This is an evidence test applied alongside the " +
            "composite score. It never changes a score or a rank.",
      minObservations:      R.MIN_OBSERVATIONS,
      minConfidenceGrade:   R.MIN_GRADE,
      overrideInEffect:     !!(run && run.governanceOverride),
      eligibleSegmentCount: chosen.eligibleCount,
      recommendedSegment:   chosen.target ? chosen.target.marketId : null,
      highestScoringSegment: chosen.topOverall ? chosen.topOverall.marketId : null,
      segmentsOutrankingRecommendation: chosen.outranked.map(function (m) {
        var g = m.governance || Governance.evaluate(m);
        return {
          marketId: m.marketId, city: m.city, locality: m.locality,
          score: parseFloat(m.totalScore.toFixed(2)),
          reason: g.reasons.join("; ")
        };
      }),
      selectedSegmentMeetsFloor: selGov ? selGov.eligible : null,
      selectedSegmentEvidence:   selGov
        ? { tier: selGov.tier, observations: selGov.observations, grade: selGov.grade,
            reasons: selGov.reasons }
        : null,
      note: chosen.note
    };
  }

  /**
   * Build the agent context.
   *
   * @param {Object} input
   *   markets   market array
   *   assets    portfolio assets
   *   run       the Market Screener's saved run (ReitState), or null
   *   runNote   human-readable provenance line, supplied by the caller
   * @returns {{ ctx, ranked, selectedMarket }}
   *   ranked is the array the scenario key must be computed from.
   */
  function build(input) {
    var SE = dep("ScoringEngine", "scoringEngine.js");
    var H  = dep("HHIEngine", "hhi.js");
    var Governance = dep("Governance", "governance.js");
    var Stats = dep("Stats", "stats.js");

    var markets = input.markets || [];
    var assets  = input.assets  || [];
    var run     = input.run || null;

    var weights, investmentCr, ranked, selectedId;
    if (run && !run.stale) {
      weights      = run.weights || SE.PRESETS.balanced;
      investmentCr = run.investmentCr || 45;
      ranked       = run.ranked || [];
      selectedId   = run.selectedTargetId;
    } else {
      weights      = SE.PRESETS.balanced;
      investmentCr = defaultInvestmentCr(assets);
      ranked       = rankForScreener(markets, assets, weights, investmentCr);
      /* Same default as the Market Screener: the evidence-floor recommendation,
       * not rank 1. This path previously chose rank 1, so a visitor who opened
       * the Agents page before the Screener was shown a different target from
       * the one the Screener recommends for identical inputs. */
      var chosen = Governance
        ? Governance.chooseTarget(ranked, { override: false })
        : { target: ranked[0] || null, topOverall: ranked[0] || null };
      var pick = chosen.target || chosen.topOverall;
      selectedId = pick ? pick.marketId : null;
    }

    var selectedMarket = null;
    for (var j = 0; j < ranked.length; j++) {
      if (ranked[j].marketId === selectedId) { selectedMarket = ranked[j]; break; }
    }
    if (!selectedMarket && ranked.length > 0) { selectedMarket = ranked[0]; }

    var totalVal  = H.totalValue(assets);
    var totalRent = H.totalAnnualRent(assets);
    var wYield    = H.weightedYield(assets);
    var cHHI      = H.cityHHI(assets);
    var tHHI      = H.typeHHI(assets);

    function summarise(m) {
      var sim = m.simulation || null;
      return {
        rank:           m.rank,
        marketId:       m.marketId,
        city:           m.city,
        locality:       m.locality,
        propertyType:   m.propertyType,
        totalScore:     parseFloat(m.totalScore.toFixed(2)),
        grossYieldPct:  parseFloat((m.grossYield * 100).toFixed(2)),
        annualGrowthPct: parseFloat((m.annualRentalGrowthRatio * 100).toFixed(1)),
        demandScore:    m.demandScore,
        riskScore:      m.riskScore,
        factors:        m.factors,
        contributions:  m.contributions,
        simulation: sim ? {
          investmentCr: investmentCr,
          before: {
            cityHHI:       parseFloat(sim.before.cityHHI.toFixed(4)),
            typeHHI:       parseFloat(sim.before.typeHHI.toFixed(4)),
            weightedYield: parseFloat((sim.before.weightedYield * 100).toFixed(3))
          },
          after: {
            cityHHI:       parseFloat(sim.after.cityHHI.toFixed(4)),
            typeHHI:       parseFloat(sim.after.typeHHI.toFixed(4)),
            weightedYield: parseFloat((sim.after.weightedYield * 100).toFixed(3))
          }
        } : null
      };
    }

    var top3 = ranked.slice(0, 3).map(summarise);

    var statsContext = null;
    if (Stats && markets.length > 0) {
      try {
        statsContext = {
          portfolioStats: Stats.portfolioStats(markets),
          cityStats:      Stats.cityStats(markets),
          outlierSummary: Stats.outlierSummary(markets)
        };
      } catch (e) {
        statsContext = null;
      }
    }

    /* selectedTarget was previously looked up in top3 and fell back to top3[0]
     * when absent. Under the evidence floor the recommendation is often below
     * rank 3 (rank 5 under Balanced, rank 8 under Income), so the models were
     * told the selected target was rank 1 — the segment the floor had just
     * rejected — while the governance block beside it named a different one. */
    var selectedTarget = selectedMarket
      ? (top3.find(function (t) { return t.marketId === selectedMarket.marketId; }) ||
         summarise(selectedMarket))
      : null;

    var ctx = {
      dataNote: "SYNTHETIC ACADEMIC DATA — not real market values",
      runNote:  input.runNote || "",
      portfolio: {
        // assetCount was previously omitted. With no asset count in context the
        // Data Quality agent inferred one from the only other count it could
        // see (the 50 market segments) and reported "a portfolio of 50 assets".
        // The portfolio actually holds 10.
        assetCount:       assets.length,
        totalValueCr:     parseFloat((totalVal / 1e7).toFixed(3)),
        annualRentCr:     parseFloat((totalRent / 1e7).toFixed(3)),
        weightedYieldPct: parseFloat((wYield * 100).toFixed(3)),
        cityHHI:          parseFloat(cHHI.toFixed(4)),
        assetTypeHHI:     parseFloat(tHHI.toFixed(4))
      },
      investmentCr:     investmentCr,
      weights:          weights,
      top3Ranked:       top3,

      /* Evidence governance. Supplied so the models can state WHY the
       * recommendation is what it is without being able to infer that a score
       * was adjusted — it never is. Without this block the Market Screening
       * agent, seeing a recommendation that was not rank 1, had no way to
       * explain it and tended to invent a reason. */
      governance:       governanceContext(ranked, run),
      selectedTarget:   selectedTarget,
      statsContext:     statsContext
    };

    return { ctx: ctx, ranked: ranked, selectedMarket: selectedMarket };
  }

  /**
   * Replace the Orchestrator's headline figures with the deterministic ones.
   *
   * The Orchestrator returns compositeScore, expectedYieldPct and
   * investmentAmount, and the page and the report show them as headline
   * figures. Its prompt does not define expectedYieldPct, and in the first
   * cache build the model filled it with the target's gross yield under two
   * presets and with the portfolio's post-investment yield under the other two
   * — so the card labelled "Expected Gross Yield" showed 6.29% for a segment
   * whose gross yield is 2.66%. Every figure the models are shown already
   * exists in the context, so the headline takes it from there. Where the
   * model's figure differed it is kept in _modelFigures, not discarded.
   *
   * Pure: returns a new output object; the input is not modified.
   */
  function applyDeterministicFigures(output, ctx) {
    if (!output || typeof output !== "object" || output.raw !== undefined) { return output; }
    var t = ctx && ctx.selectedTarget;
    if (!t) { return output; }
    var exact = {
      compositeScore:   t.totalScore,
      expectedYieldPct: t.grossYieldPct,
      investmentAmount: "₹" + ctx.investmentCr + " Cr"
    };
    var out = Object.assign({}, output);
    var differed = {};
    Object.keys(exact).forEach(function (k) {
      if (out[k] !== undefined && out[k] !== exact[k]) { differed[k] = out[k]; }
      out[k] = exact[k];
    });
    if (Object.keys(differed).length) { out._modelFigures = differed; }
    return out;
  }

  var AgentContext = {
    applyDeterministicFigures: applyDeterministicFigures,
    build:               build,
    governanceContext:   governanceContext,
    rankForScreener:     rankForScreener,
    defaultInvestmentCr: defaultInvestmentCr
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AgentContext;
  } else {
    root.AgentContext = AgentContext;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

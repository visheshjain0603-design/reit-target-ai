/**
 * analysisRun.js — the one analysis every page renders
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS EXISTS
 * ---------------
 * Previously the Market Screener computed a snapshot and wrote it to
 * localStorage, and each other page read that snapshot at a moment of its own
 * choosing. Diversification read it once, when the application loaded. After
 * the user switched from Balanced to Income Focused, Overview, Agents and the
 * Report described Aerocity while Diversification went on analysing Gurugram —
 * Cyber Hub, and its Top 3 and projections still showed Balanced results.
 * Nothing was wrong with any single page; the pages simply held different
 * copies of the analysis.
 *
 * The fix is structural. There is exactly one analysis object, computed here,
 * deterministically, from:
 *
 *     inputs   preset · exact weights · investment amount · screen override ·
 *              selection mode · manual target · filters        (persisted)
 *     data     markets.json · the ACTIVE portfolio (sample or custom) ·
 *              source-verification outcomes · statistics.json  (loaded once)
 *
 * The controller holds it in memory. Any change of input goes through
 * AnalysisRun.update(), which recomputes and notifies every subscribed page in
 * the same tick. No page computes a target, an HHI figure or a projection of
 * its own; every page reads them from the run.
 *
 * SELECTION RULES
 *   auto    the selected target is the shortlist candidate: the highest-ranked
 *           segment passing the simulation-support screen (or the highest
 *           raw-score market when the screen is explicitly ignored). Any change
 *           of preset, weights, amount, portfolio or screen moves it.
 *   manual  the user's chosen segment stays selected across changes, labelled
 *           "Manually selected target" on every page; when it differs from the
 *           current shortlist candidate every page says so. returnToAuto()
 *           restores the automatic rule.
 *
 * compute() is pure and runs identically in Node (tests, cache builder) and in
 * the browser. The controller below it is browser-only.
 */

(function (root) {
  "use strict";

  var SCHEMA_VERSION = 2;
  var PRESET_KEYS = ["balanced", "incomeFocused", "growthFocused", "diversFocused"];
  var FACTOR_KEYS = ["yieldWeight", "growthWeight", "diversWeight", "demandWeight", "riskWeight"];

  function dep(name, file) {
    if (typeof module !== "undefined" && module.exports) { return require("./" + file); }
    return root[name];
  }

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  // ─── Inputs ───────────────────────────────────────────────────────────────

  function defaults() {
    return {
      schemaVersion:      SCHEMA_VERSION,
      preset:             "balanced",
      weights:            null,      // null = the preset's own weights
      investmentCr:       null,      // null = 10% of the active portfolio (₹50 Cr for the sample)
      governanceOverride: false,
      selectionMode:      "auto",
      manualTargetId:     null,
      filters:            null       // null = no filters (display only; never affects the run)
    };
  }

  function factorWeights(w) {
    var out = {};
    FACTOR_KEYS.forEach(function (k) { out[k] = w && isNum(w[k]) ? w[k] : 0; });
    return out;
  }

  /**
   * Bring any stored object to the current input schema. Schema-1 snapshots
   * (written by the old screener, carrying a full ranking) are migrated by
   * reading only their inputs. They did not distinguish an automatic pick from a
   * deliberate one, so selection returns to automatic.
   */
  function normaliseInputs(raw) {
    var SE = dep("ScoringEngine", "scoringEngine.js");
    var out = defaults();
    if (!raw || typeof raw !== "object") { return out; }

    var preset = raw.preset || raw.weightPreset;
    if (PRESET_KEYS.indexOf(preset) !== -1) {
      out.preset = preset;
    } else if (preset === "custom" && raw.weights && SE.validateWeights(factorWeights(raw.weights)).valid) {
      out.preset  = "custom";
      out.weights = factorWeights(raw.weights);
    }

    if (isNum(raw.investmentCr) && raw.investmentCr > 0 && raw.investmentCr <= 100000) {
      out.investmentCr = raw.investmentCr;
    }
    out.governanceOverride = !!raw.governanceOverride;

    if (raw.schemaVersion === SCHEMA_VERSION && raw.selectionMode === "manual" && raw.manualTargetId) {
      out.selectionMode  = "manual";
      out.manualTargetId = String(raw.manualTargetId);
    }
    if (raw.schemaVersion === SCHEMA_VERSION && raw.filters && typeof raw.filters === "object") {
      out.filters = raw.filters;
    }
    return out;
  }

  function presetWeights(inputs) {
    var SE = dep("ScoringEngine", "scoringEngine.js");
    if (inputs.preset === "custom" && inputs.weights) { return factorWeights(inputs.weights); }
    return factorWeights(SE.PRESETS[inputs.preset] || SE.PRESETS.balanced);
  }

  function presetLabel(key) {
    var SE = dep("ScoringEngine", "scoringEngine.js");
    if (SE.PRESETS[key]) { return SE.PRESETS[key].label; }
    return key === "custom" ? "Custom weights" : "Balanced";
  }

  // ─── Portfolio ────────────────────────────────────────────────────────────

  function activePortfolio(data) {
    var custom = (data.customAssets || []).filter(function (a) {
      return a && isNum(a.propertyValue) && a.propertyValue > 0 && a.city && a.assetType;
    });
    if (data.portfolioMode === "custom" && custom.length) {
      return { source: "custom", assets: custom, note: null };
    }
    return {
      source: "sample",
      assets: data.sampleAssets || [],
      note: data.portfolioMode === "custom"
        ? "The custom portfolio is empty, so the analysis uses the sample portfolio."
        : null
    };
  }

  // ─── The computation ──────────────────────────────────────────────────────

  /**
   * @param {Object} inputs  normalised inputs
   * @param {Object} data    { marketsDoc, sampleAssets, portfolioMode, customAssets,
   *                           sourceOutcomes, statisticsDoc }
   * @returns {Object} the analysis run
   */
  function compute(inputs, data) {
    var SE  = dep("ScoringEngine", "scoringEngine.js");
    var H   = dep("HHIEngine", "hhi.js");
    var Gov = dep("Governance", "governance.js");
    var P   = dep("Projection", "projection.js");
    var SK  = dep("ScenarioKey", "scenarioKey.js");
    var AC  = dep("AgentContext", "agentContext.js");
    var V   = dep("Validator", "validator.js");

    inputs = normaliseInputs(inputs);
    data = data || {};
    var markets = (data.marketsDoc && data.marketsDoc.markets) || [];
    var pf = activePortfolio(data);
    var assets = pf.assets;

    var weights = presetWeights(inputs);
    var weightsValid = SE.validateWeights(weights).valid;
    if (!weightsValid) { weights = factorWeights(SE.PRESETS.balanced); }

    var investmentCr = isNum(inputs.investmentCr) ? inputs.investmentCr : AC.defaultInvestmentCr(assets);
    var investmentRs = Math.round(investmentCr * 1e7);

    var ranked = AC.rankForScreener(markets, assets, weights, investmentCr);
    var chosen = Gov.chooseTarget(ranked, { override: inputs.governanceOverride });

    var outcomes = data.sourceOutcomes || {};
    var eligibleRank = 0;
    ranked.forEach(function (m) {
      m.governance = m.governance || Gov.evaluate(m);
      m.eligibleRank = m.governance.eligible ? ++eligibleRank : null;
      m.externalCalibrationStatus = Gov.externalCalibration(m, outcomes);
    });

    var byId = {};
    ranked.forEach(function (m) { byId[m.marketId] = m; });

    var recommended = chosen.target || null;
    var selectionMode = inputs.selectionMode;
    var manualTargetId = inputs.manualTargetId;
    if (selectionMode === "manual" && !byId[manualTargetId]) {
      selectionMode = "auto";          // the chosen market no longer exists in this dataset
      manualTargetId = null;
    }
    var selected = selectionMode === "manual" ? byId[manualTargetId] : recommended;

    var hhi = null, projections = null;
    if (selected && selected.simulation) {
      var sim = selected.simulation;
      hhi = {
        cityBefore: sim.before.cityHHI,  cityAfter: sim.after.cityHHI,
        typeBefore: sim.before.typeHHI,  typeAfter: sim.after.typeHHI,
        weightedYieldBefore: sim.before.weightedYield,
        weightedYieldAfter:  sim.after.weightedYield,
        valueBeforeRs: sim.before.totalValue, valueAfterRs: sim.after.totalValue,
        rentBeforeRs:  sim.before.totalAnnualRent, rentAfterRs: sim.after.totalAnnualRent
      };
      var params = {
        currentPortfolioValueRs: H.totalValue(assets),
        currentAnnualRentRs:     H.totalAnnualRent(assets),
        investmentRs:            investmentRs,
        newMarketGrossYield:     selected.grossYield
      };
      var all = P.projectAll(params);
      projections = {
        params:   params,
        all:      all,
        summary3y: P.summarise(all, 3),
        horizons: P.DEFAULT_HORIZONS,
        targetAnnualRentRs:    investmentRs * selected.grossYield,
        year0AnnualRentRs:     params.currentAnnualRentRs + investmentRs * selected.grossYield,
        year0PortfolioValueRs: params.currentPortfolioValueRs + investmentRs
      };
    }

    /* Sensitivity: the same portfolio and amount under each preset, reporting
     * BOTH the highest raw-score market and the screen's candidate, so an
     * ineligible segment is never presented as a preset's recommendation. */
    var sensitivity = PRESET_KEYS.map(function (key) {
      var w = factorWeights(SE.PRESETS[key]);
      var rk = SE.rankMarkets(markets, w, assets, H.diversificationScore).ranked;
      var ch = Gov.chooseTarget(rk, { override: false });
      return {
        preset: key,
        label: SE.PRESETS[key].label,
        weights: w,
        active: inputs.preset === key,
        highestRaw: rk[0] ? summary(rk[0]) : null,
        candidate:  ch.target ? summary(ch.target) : null
      };
      function summary(m) {
        var g = m.governance || Gov.evaluate(m);
        return { marketId: m.marketId, name: (m.locality || m.marketId) + ", " + m.city,
                 rawRank: m.rank, score: m.totalScore, grossYield: m.grossYield,
                 passes: g.eligible, reasons: g.reasons };
      }
    });

    var totalValueRs = H.totalValue(assets);
    var run = {
      schemaVersion:  SCHEMA_VERSION,
      inputs:         inputs,
      preset:         inputs.preset,
      presetLabel:    presetLabel(inputs.preset),
      weights:        weights,
      weightsValid:   weightsValid,
      investmentCr:   investmentCr,
      investmentRs:   investmentRs,
      governanceOverride: !!inputs.governanceOverride,
      selectionMode:  selectionMode,
      manualTargetId: selectionMode === "manual" ? manualTargetId : null,

      portfolio: {
        source:       pf.source,
        note:         pf.note,
        assetCount:   assets.length,
        totalValueRs: totalValueRs,
        annualRentRs: H.totalAnnualRent(assets),
        weightedYield: H.weightedYield(assets),
        cityHHI:      H.cityHHI(assets),
        typeHHI:      H.typeHHI(assets),
        fingerprint:  SK.portfolioFingerprint(assets)
      },
      dataset: {
        fingerprint: SK.datasetFingerprint(data.marketsDoc),
        marketCount: markets.length,
        observationCount: markets.reduce(function (t, m) { return t + (m.observationCount || 0); }, 0)
      },

      ranked:                  ranked,
      eligibleCount:           eligibleRank,
      highestRawScoreMarketId: ranked[0] ? ranked[0].marketId : null,
      recommendedCandidateId:  recommended ? recommended.marketId : null,
      selectedTargetId:        selected ? selected.marketId : null,
      selectionDiffers:        !!(selected && recommended && selected.marketId !== recommended.marketId),
      governanceNote:          chosen.note,
      outrankedCount:          chosen.outranked ? chosen.outranked.length : 0,

      targetSupport: selected ? {
        passes:   selected.governance.eligible,
        reasons:  selected.governance.reasons,
        simulationObservationCount: selected.observationCount,
        supportGrade:  selected.confidenceGrade || null,
        supportLevel:  selected.governance.tier,
        grossYieldP10toP90: (selected.uncertainty && selected.uncertainty.grossYieldPct) || null,
        externalCalibrationStatus: selected.externalCalibrationStatus
      } : null,

      hhi:          hhi,
      projections:  projections,
      sensitivity:  sensitivity
    };

    run.scenarioDescriptor = SK.describe({
      marketsDoc:             data.marketsDoc,
      assets:                 assets,
      weights:                weights,
      investmentCr:           investmentCr,
      selectedTargetId:       run.selectedTargetId,
      selectionMode:          selectionMode,
      governanceOverride:     run.governanceOverride,
      recommendedCandidateId: run.recommendedCandidateId,
      ranked:                 ranked
    });
    run.scenarioKey = SK.compute(run.scenarioDescriptor);

    run.agentContext = AC.fromRun(run, data);
    run.validation = V.validate({
      context: run.agentContext, ranked: ranked, assets: assets, hhiEngine: H
    });
    run.assets = assets;
    return run;
  }

  // ─── Read helpers every page uses ─────────────────────────────────────────

  function market(run, id) {
    if (!run || !id) { return null; }
    for (var i = 0; i < run.ranked.length; i++) {
      if (run.ranked[i].marketId === id) { return run.ranked[i]; }
    }
    return null;
  }

  function name(m) { return m ? (m.locality || m.marketId) + ", " + m.city : "—"; }

  function selected(run)    { return market(run, run && run.selectedTargetId); }
  function recommended(run) { return market(run, run && run.recommendedCandidateId); }
  function rawLeader(run)   { return market(run, run && run.highestRawScoreMarketId); }

  function rawTop(run, n)      { return (run ? run.ranked : []).slice(0, n || 3); }
  function eligibleTop(run, n) {
    return (run ? run.ranked : []).filter(function (m) { return m.governance && m.governance.eligible; })
                                  .slice(0, n || 3);
  }

  /** The heading every page shows above the selected target. */
  function targetLabel(run) {
    if (!run || !run.selectedTargetId) { return "No shortlist candidate"; }
    if (run.selectionMode === "manual") { return "Manually selected target"; }
    return run.governanceOverride ? "Highest raw-score market (screen ignored)" : "Shortlist candidate";
  }

  /**
   * The segment to compare the selected target with: the highest raw-score
   * market when that is a different segment (it will usually fail the screen),
   * otherwise the next eligible candidate.
   */
  function comparison(run) {
    var sel = selected(run);
    if (!sel) { return null; }
    var raw = rawLeader(run);
    if (raw && raw.marketId !== sel.marketId) {
      return { market: raw, role: "Highest raw-score alternative" };
    }
    var el = (run.ranked || []).filter(function (m) {
      return m.governance && m.governance.eligible && m.marketId !== sel.marketId;
    })[0];
    return el ? { market: el, role: "Next eligible candidate" } : null;
  }

  /** The figures the acceptance tests compare across pages. */
  function digest(run) {
    var sel = selected(run);
    var p = run && run.projections;
    return {
      preset:        run ? run.preset : null,
      selectionMode: run ? run.selectionMode : null,
      targetId:      sel ? sel.marketId : null,
      targetName:    name(sel),
      score:         sel ? sel.totalScore.toFixed(2) : null,
      grossYieldPct: sel ? (sel.grossYield * 100).toFixed(2) : null,
      cityHHIAfter:  run && run.hhi ? run.hhi.cityAfter.toFixed(4) : null,
      typeHHIAfter:  run && run.hhi ? run.hhi.typeAfter.toFixed(4) : null,
      year0RentCr:   p ? (p.year0AnnualRentRs / 1e7).toFixed(3) : null,
      base3yValueCr: p ? (p.summary3y.base.portfolioValue / 1e7).toFixed(2) : null,
      base3yRentCr:  p ? (p.summary3y.base.annualRent / 1e7).toFixed(2) : null,
      scenarioKey:   run ? run.scenarioKey : null
    };
  }

  var AnalysisRun = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PRESET_KEYS:    PRESET_KEYS,
    defaults:       defaults,
    normaliseInputs: normaliseInputs,
    compute:        compute,
    market:         market,
    name:           name,
    selected:       selected,
    recommended:    recommended,
    rawLeader:      rawLeader,
    rawTop:         rawTop,
    eligibleTop:    eligibleTop,
    targetLabel:    targetLabel,
    comparison:     comparison,
    digest:         digest
  };

  // ─── Browser controller ───────────────────────────────────────────────────

  if (typeof module === "undefined" || !module.exports) {
    var _data = null, _inputs = null, _run = null, _error = null;
    var _subs = [], _ready = null;

    function fetchJson(url, optional) {
      return fetch(url).then(function (r) {
        if (!r.ok) { if (optional) { return null; } throw new Error(url + " returned " + r.status); }
        return r.json();
      }).catch(function (e) { if (optional) { return null; } throw e; });
    }

    function loadData() {
      return Promise.all([
        fetchJson("data/markets.json"),
        fetchJson("data/portfolio.json"),
        fetchJson("data/statistics.json", true),
        fetchJson("data/meta.json", true)
      ]).then(function (res) {
        _data = {
          marketsDoc:     res[0],
          portfolioDoc:   res[1],
          sampleAssets:   (res[1] && res[1].assets) || [],
          statisticsDoc:  res[2],
          metaDoc:        res[3],
          sourceOutcomes: (res[3] && res[3].sourceVerification && res[3].sourceVerification.outcomes) || {}
        };
      });
    }

    function refreshPortfolio() {
      _data.portfolioMode = root.ReitState.portfolioMode();
      _data.customAssets  = root.ReitState.customPortfolio();
    }

    function notify() {
      _subs.slice().forEach(function (fn) {
        try { fn(_run); } catch (e) {
          if (root.console) { root.console.warn("AnalysisRun subscriber failed:", e); }
        }
      });
    }

    function recompute() {
      refreshPortfolio();
      _run = compute(_inputs, _data);
      _run.generatedAt = new Date().toISOString();
      _run.runId = root.ReitState.newRunId();
      notify();
      return _run;
    }

    function persist() {
      var toSave = Object.assign({}, _inputs);
      root.ReitState.save(toSave);
    }

    AnalysisRun.ready = function () {
      if (!_ready) {
        _ready = loadData().then(function () {
          _inputs = normaliseInputs(root.ReitState.load());
          refreshPortfolio();
          _run = compute(_inputs, _data);
          _run.generatedAt = new Date().toISOString();
          _run.runId = root.ReitState.newRunId();
          return _run;
        }).catch(function (e) { _error = e; throw e; });
      }
      return _ready;
    };

    AnalysisRun.current = function () { return _run; };
    AnalysisRun.inputs  = function () { return _inputs ? Object.assign({}, _inputs) : null; };
    AnalysisRun.data    = function () { return _data; };
    AnalysisRun.error   = function () { return _error; };

    /** Change one or more inputs, recompute, persist, and re-render every page. */
    AnalysisRun.update = function (patch) {
      if (!_data) { return null; }
      _inputs = normaliseInputs(Object.assign({}, _inputs, patch || {}, { schemaVersion: SCHEMA_VERSION }));
      persist();
      return recompute();
    };

    AnalysisRun.selectManually = function (marketId) {
      return AnalysisRun.update({ selectionMode: "manual", manualTargetId: marketId });
    };

    AnalysisRun.returnToAuto = function () {
      return AnalysisRun.update({ selectionMode: "auto", manualTargetId: null });
    };

    /** The portfolio page calls this after any change to holdings or mode. */
    AnalysisRun.portfolioChanged = function () {
      if (!_data) { return null; }
      return recompute();
    };

    /**
     * Reset Demo: application-owned keys only; sample portfolio; Balanced;
     * canonical weights; default ₹50 Cr; screen applied; automatic selection;
     * no filters. Recomputes immediately, so no page has to be visited first.
     */
    AnalysisRun.reset = function () {
      root.ReitState.resetApp();
      _inputs = defaults();
      if (!_data) { return null; }
      return recompute();
    };

    /** Subscribe to every recompute. Returns an unsubscribe function. */
    AnalysisRun.subscribe = function (fn) {
      _subs.push(fn);
      return function () { _subs = _subs.filter(function (f) { return f !== fn; }); };
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AnalysisRun;
  } else {
    root.AnalysisRun = AnalysisRun;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

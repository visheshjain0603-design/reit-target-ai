/**
 * agents.js — Agent Recommendations page controller
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * READS from shared analysis state (ReitState) written by marketScreen.js.
 * Builds Gemini agent context from shared run — never re-scores independently.
 *
 * Depends on: hhi.js (HHIEngine), scoringEngine.js (ScoringEngine),
 *             stateManager.js (ReitState), uiHelpers.js
 */

(function () {
  "use strict";

  var ROOT_ID  = "agents-content";
  var API_BASE = "http://localhost:3001";

  // ─── State ─────────────────────────────────────────────────────────────────

  var state = {
    markets:       [],
    assets:        [],
    sharedRun:     null,    // from ReitState
    selectedMarket: null,
    portfolioCtx:  null,
    serverOnline:  null,    // null=unchecked, true, false
    serverGemini:  false,
    serverModel:   null,
    running:       false,
    trail:         [],      // stepId strings of completed steps
    trailStatus:   {},      // stepId -> "pending"|"running"|"completed"|"failed"
    results:       {},      // agentType -> { output, error, offline }
    loading:       true,
    error:         null
  };

  // Correct execution order: Data Quality → Statistical Analysis → Market Screening → Diversification → Validation → Orchestrator
  var AGENT_ORDER = [
    "dataQuality", "statisticalAnalysis", "marketScreening", "diversification", "validation", "orchestrator"
  ];

  var AGENT_LABELS = {
    dataQuality:         "Data Quality",
    statisticalAnalysis: "Statistical Analysis",
    marketScreening:     "Market Screening",
    diversification:     "Diversification",
    validation:          "Validation",
    orchestrator:        "Investment Orchestrator"
  };

  // Plain-English description of each agent's job, shown under the card title
  // so a reader can tell what they are looking at without reading the prompt.
  var AGENT_PURPOSE = {
    dataQuality:         "Checks whether the underlying dataset is trustworthy enough to analyse — sample sizes, outliers, and gaps.",
    statisticalAnalysis: "Describes the spread of yields and risk across the markets the engine scored.",
    marketScreening:     "Explains why the top-ranked market came out ahead, and what the runners-up offer.",
    diversification:     "Interprets the concentration (HHI) numbers — how much this investment spreads the portfolio out.",
    validation:          "Re-checks the engine's own arithmetic and flags anything inconsistent before a recommendation is made.",
    orchestrator:        "Combines all of the above into a single recommendation with its rationale and risk warnings."
  };

  // Trail steps in correct order: data → stats → screening → simulation → validation → recommend
  var TRAIL_STEPS = [
    { id: "data",       label: "Data quality assessed",         agent: "dataQuality" },
    { id: "stats",      label: "Statistical analysis complete", agent: "statisticalAnalysis" },
    { id: "screening",  label: "Markets scored and ranked",     agent: "marketScreening" },
    { id: "simulation", label: "Diversification simulated",     agent: "diversification" },
    { id: "validation", label: "Inputs validated",              agent: "validation" },
    { id: "recommend",  label: "Recommendation synthesised",    agent: "orchestrator" }
  ];

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    showLoading(root);

    // Initialise trail statuses to pending
    TRAIL_STEPS.forEach(function (s) { state.trailStatus[s.id] = "pending"; });

    Promise.all([
      fetch("data/markets.json").then(function (r) { return r.json(); }),
      fetch("data/portfolio.json").then(function (r) { return r.json(); })
    ]).then(function (results) {
      state.markets = results[0].markets || [];
      state.assets  = results[1].assets  || [];
      state.sharedRun = ReitState.load();

      buildContext();
      state.loading = false;
      checkServerStatus().then(function () { render(root); });
    }).catch(function (err) {
      state.loading = false;
      state.error = "Could not load data: " + err.message;
      render(root);
    });
  }

  // ─── Build context from shared run ────────────────────────────────────────

  function buildContext() {
    var run = state.sharedRun;

    // Use shared run data if present and not stale; fall back to fresh calculation
    var weights, investmentCr, ranked, selectedId;
    if (run && !run.stale) {
      weights      = run.weights || ScoringEngine.PRESETS.balanced;
      investmentCr = run.investmentCr || 45;
      ranked       = run.ranked || [];
      selectedId   = run.selectedTargetId;
    } else {
      weights      = ScoringEngine.PRESETS.balanced;
      investmentCr = Math.round(HHIEngine.totalValue(state.assets) / 1e7 * 0.10 * 100) / 100;
      var r = ScoringEngine.rankMarkets(state.markets, weights, state.assets, HHIEngine.diversificationScore);
      var investmentRs = Math.round(investmentCr * 1e7);
      for (var i = 0; i < r.ranked.length; i++) {
        r.ranked[i].simulation = investmentRs > 0
          ? HHIEngine.simulateInvestment(state.assets, r.ranked[i], investmentRs)
          : null;
      }
      ranked     = r.ranked;
      selectedId = ranked.length > 0 ? ranked[0].marketId : null;
    }

    // Find selected market
    state.selectedMarket = null;
    for (var j = 0; j < ranked.length; j++) {
      if (ranked[j].marketId === selectedId) {
        state.selectedMarket = ranked[j];
        break;
      }
    }
    if (!state.selectedMarket && ranked.length > 0) {
      state.selectedMarket = ranked[0];
    }

    var totalVal  = HHIEngine.totalValue(state.assets);
    var totalRent = HHIEngine.totalAnnualRent(state.assets);
    var wYield    = HHIEngine.weightedYield(state.assets);
    var cHHI      = HHIEngine.cityHHI(state.assets);
    var tHHI      = HHIEngine.typeHHI(state.assets);

    var top3 = ranked.slice(0, 3).map(function (m) {
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
    });

    // Augment context with statistical engine output when available
    var statsContext = null;
    if (typeof Stats !== "undefined" && state.markets.length > 0) {
      try {
        statsContext = {
          portfolioStats: Stats.portfolioStats(state.markets),
          cityStats:      Stats.cityStats(state.markets),
          outlierSummary: Stats.outlierSummary(state.markets)
        };
      } catch (e) {
        statsContext = null;
      }
    }

    state.portfolioCtx = {
      dataNote: "SYNTHETIC ACADEMIC DATA — not real market values",
      runNote:  run && !run.stale
        ? "Results from Market Screener run at " + new Date(run.createdAt).toLocaleTimeString()
        : "Fallback: fresh calculation (Market Screener not yet run)",
      portfolio: {
        // assetCount was previously omitted. With no asset count in context the
        // Data Quality agent inferred one from the only other count it could
        // see (the 50 market segments) and reported "a portfolio of 50 assets".
        // The portfolio actually holds 10.
        assetCount:       (state.assets || []).length,
        totalValueCr:     parseFloat((totalVal / 1e7).toFixed(3)),
        annualRentCr:     parseFloat((totalRent / 1e7).toFixed(3)),
        weightedYieldPct: parseFloat((wYield * 100).toFixed(3)),
        cityHHI:          parseFloat(cHHI.toFixed(4)),
        assetTypeHHI:     parseFloat(tHHI.toFixed(4))
      },
      investmentCr:     investmentCr,
      weights:          weights,
      top3Ranked:       top3,
      selectedTarget:   state.selectedMarket
        ? top3.find(function (t) { return t.marketId === state.selectedMarket.marketId; }) || top3[0]
        : top3[0] || null,
      statsContext: statsContext
    };
  }

  // ─── Server status ─────────────────────────────────────────────────────────

  function checkServerStatus() {
    return fetch(API_BASE + "/api/health", { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.serverOnline  = d.status === "ok";
        state.serverGemini  = !!d.geminiConfigured;
        state.serverModel   = d.model || null;
      })
      .catch(function () { state.serverOnline = false; });
  }

  function showLoading(root) {
    root.innerHTML = "";
    var p = document.createElement("p");
    p.className = "loading-msg";
    p.textContent = "Preparing agent system…";
    root.appendChild(p);
  }

  // ─── Main render ───────────────────────────────────────────────────────────

  function render(root) {
    root.innerHTML = "";

    if (state.error) {
      var errEl = document.createElement("p");
      errEl.className = "error-msg";
      errEl.textContent = state.error;
      root.appendChild(errEl);
      return;
    }

    root.appendChild(buildStatusBar());

    // Stale run warning
    if (!state.sharedRun || state.sharedRun.stale) {
      root.appendChild(buildStaleNote());
    }

    root.appendChild(buildContextSummary());
    root.appendChild(buildTrail());
    root.appendChild(buildRunButton());

    if (Object.keys(state.results).length > 0) {
      root.appendChild(buildAgentResults());
    }
  }

  // ─── Status bar ───────────────────────────────────────────────────────────

  function buildStatusBar() {
    var div = document.createElement("div");

    if (state.serverOnline === true && state.serverGemini) {
      div.className = "reit-agent-status-bar reit-status-online";
      setText(div, "✓  Backend online — Gemini configured ("
        + (state.serverModel || "model") + ")");
    } else if (state.serverOnline === true && !state.serverGemini) {
      div.className = "reit-agent-status-bar reit-status-warn";
      setText(div, "⚠  Backend online but Gemini API key not set — AI explanation unavailable. Deterministic results still work.");
    } else if (state.serverOnline === false) {
      div.className = "reit-agent-status-bar reit-status-offline";
      setText(div, "⚠  Backend offline — start the proxy: cd server && node server.js"
        + "  |  Deterministic analysis is still available.");
    } else {
      div.className = "reit-agent-status-bar reit-status-checking";
      setText(div, "Checking backend status…");
    }

    return div;
  }

  function setText(el, text) {
    el.textContent = text;
  }

  // ─── Stale note ───────────────────────────────────────────────────────────

  function buildStaleNote() {
    var div = document.createElement("div");
    div.className = "reit-stale-banner";
    div.textContent = state.sharedRun
      ? "⚠  Analysis context is outdated. The agent context below uses a fallback calculation. Go to Market Screener to refresh."
      : "ℹ  No screener run found. Using default weights and top-ranked market. Go to Market Screener to set your parameters.";
    return div;
  }

  // ─── Context summary ──────────────────────────────────────────────────────

  function buildContextSummary() {
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Analysis Context";
    div.appendChild(h);

    if (!state.portfolioCtx) { return div; }

    var pf = state.portfolioCtx.portfolio;
    var run = state.sharedRun;
    var items = [
      ["Investment Amount", "₹" + state.portfolioCtx.investmentCr + " Cr"],
      ["Portfolio Value",   "₹" + pf.totalValueCr + " Cr"],
      ["Weighted Yield",    pf.weightedYieldPct + "%"],
      ["City HHI",          pf.cityHHI],
      ["Asset-type HHI",    pf.assetTypeHHI],
      ["Selected Target",   state.selectedMarket
        ? state.selectedMarket.locality + ", " + state.selectedMarket.city
          + " (Score: " + state.selectedMarket.totalScore.toFixed(1) + ")"
        : "Top-ranked by score"],
      ["Weights",           run && !run.stale
        ? (run.weightPreset || "custom") + " — "
          + "Yield " + Math.round(state.portfolioCtx.weights.yieldWeight * 100) + "% / "
          + "Growth " + Math.round(state.portfolioCtx.weights.growthWeight * 100) + "% / "
          + "Diversification " + Math.round(state.portfolioCtx.weights.diversWeight * 100) + "% / "
          + "Demand " + Math.round(state.portfolioCtx.weights.demandWeight * 100) + "% / "
          + "Risk " + Math.round(state.portfolioCtx.weights.riskWeight * 100) + "%"
        : "Balanced (default)"]
    ];

    var tbl = document.createElement("table");
    tbl.className = "reit-context-table";
    items.forEach(function (item) {
      var tr = document.createElement("tr");
      var td1 = document.createElement("td"); td1.className = "reit-ctx-label"; td1.textContent = item[0];
      var td2 = document.createElement("td"); td2.className = "reit-ctx-value"; td2.textContent = item[1];
      tr.appendChild(td1); tr.appendChild(td2);
      tbl.appendChild(tr);
    });
    div.appendChild(tbl);

    // Top 3 preview
    var top3 = state.portfolioCtx.top3Ranked;
    if (top3 && top3.length > 0) {
      var topH = document.createElement("p");
      topH.className = "reit-top3-heading";
      topH.textContent = "Top 3 by composite score:";
      div.appendChild(topH);

      top3.forEach(function (m) {
        var row = document.createElement("div");
        row.className = "reit-top3-row";
        row.textContent = "#" + m.rank + "  " + m.locality + ", " + m.city
          + " — Score: " + m.totalScore.toFixed(1)
          + "  |  Yield: " + m.grossYieldPct.toFixed(2) + "%"
          + "  |  Risk: " + m.riskScore + "/100 — lower is better";
        div.appendChild(row);
      });
    }

    return div;
  }

  // ─── Activity trail ───────────────────────────────────────────────────────

  function buildTrail() {
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Activity Trail";
    div.appendChild(h);

    var list = document.createElement("ol");
    list.className = "reit-trail-list";

    TRAIL_STEPS.forEach(function (step, idx) {
      var status = state.trailStatus[step.id] || "pending";
      var li = document.createElement("li");
      li.className = "reit-trail-step reit-trail-" + status;

      var icon = document.createElement("span");
      icon.className = "reit-trail-icon";
      if (status === "completed") {
        icon.textContent = "✔";
        icon.className += " reit-trail-ok";
      } else if (status === "failed") {
        icon.textContent = "✖";
        icon.className += " reit-trail-err";
      } else if (status === "running") {
        icon.textContent = "⏳";
        icon.className += " reit-trail-run";
      } else {
        // pending — show numbered bullet, NOT a circle that looks done
        icon.textContent = (idx + 1) + ".";
        icon.className += " reit-trail-pending-icon";
      }

      var label = document.createElement("span");
      label.className = "reit-trail-label";
      label.textContent = step.label;

      var statusLabel = document.createElement("span");
      statusLabel.className = "reit-trail-status-label";
      statusLabel.textContent =
        status === "completed" ? "Completed"
        : status === "failed"  ? "Failed"
        : status === "running" ? "Running…"
        : "Pending";

      li.appendChild(icon);
      li.appendChild(label);
      li.appendChild(statusLabel);
      list.appendChild(li);
    });

    div.appendChild(list);
    return div;
  }

  // ─── Run button ───────────────────────────────────────────────────────────

  function buildRunButton() {
    var div = document.createElement("div");
    div.className = "reit-run-section";

    var canRun = state.serverOnline === true && state.serverGemini && !state.running;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reit-run-btn";
    btn.textContent = state.running ? "Running agents…" : "Run Agent Analysis";
    btn.disabled = !canRun;
    if (!canRun && !state.running) {
      btn.title = state.serverOnline !== true
        ? "Backend offline — start the proxy server first"
        : !state.serverGemini
        ? "Gemini API key not configured in server/.env"
        : "";
    }
    btn.addEventListener("click", function () { startAgentRun(); });
    div.appendChild(btn);

    var note = document.createElement("p");
    note.className = "reit-run-note";
    note.textContent = "All financial calculations are deterministic. "
      + "Gemini agents provide interpretation only — they do not recalculate or change values.";
    div.appendChild(note);

    return div;
  }

  // ─── Agent run sequence ───────────────────────────────────────────────────

  function startAgentRun() {
    state.running = true;
    state.trail   = [];
    state.results = {};
    TRAIL_STEPS.forEach(function (s) { state.trailStatus[s.id] = "pending"; });
    var root = document.getElementById(ROOT_ID);
    if (root) { render(root); }
    runSequence(root);
  }

  // Correct order: Data Quality → Statistical Analysis → Market Screening → Diversification → Validation → Orchestrator
  // Orchestrator only runs when Validation returns validatedOk=true
  function runSequence(root) {
    var ctx = state.portfolioCtx;

    var dqCtx = Object.assign({}, ctx, { statsContext: ctx.statsContext || null });

    setTrailStatus("data", "running", root);
    callAgent("dataQuality", dqCtx, function (dqRes) {
      state.results.dataQuality = dqRes;
      setTrailStatus("data", dqRes.error ? "failed" : "completed", root);

      var saCtx = Object.assign({}, ctx, {
        statsContext:      ctx.statsContext || null,
        dataQualityOutput: dqRes.output || null
      });

      setTrailStatus("stats", "running", root);
      callAgent("statisticalAnalysis", saCtx, function (saRes) {
        state.results.statisticalAnalysis = saRes;
        setTrailStatus("stats", saRes.error ? "failed" : "completed", root);

        setTrailStatus("screening", "running", root);
        callAgent("marketScreening", ctx, function (mktRes) {
        state.results.marketScreening = mktRes;
        setTrailStatus("screening", mktRes.error ? "failed" : "completed", root);

        setTrailStatus("simulation", "running", root);
        callAgent("diversification", ctx, function (divRes) {
          state.results.diversification = divRes;
          setTrailStatus("simulation", divRes.error ? "failed" : "completed", root);

          setTrailStatus("validation", "running", root);
          var validCtx = Object.assign({}, ctx, {
            weightsTotal: (function () {
              var t = 0;
              var w = ctx.weights;
              ["yieldWeight","growthWeight","diversWeight","demandWeight","riskWeight"]
                .forEach(function (k) { t += (w[k] || 0); });
              return parseFloat(t.toFixed(4));
            }()),
            marketCount:               state.markets.length,
            validMarkets:              ScoringEngine.validateMarkets(state.markets),
            dataQualityOutput:         state.results.dataQuality.output         || null,
            statisticalAnalysisOutput: state.results.statisticalAnalysis.output || null,
            marketScreeningOutput:     state.results.marketScreening.output      || null,
            diversificationOutput:     state.results.diversification.output      || null
          });
          callAgent("validation", validCtx, function (valRes) {
            state.results.validation = valRes;
            setTrailStatus("validation", valRes.error ? "failed" : "completed", root);

            // Orchestrator ONLY runs if validation passed
            // Accept validatedOk=true, OR all individual checks passing (guards against
            // Gemini setting validatedOk=false due to minor data-quality warnings while
            // all structural checks still pass).
            var _vout = (valRes.output) || {};
            // If server returned { raw: "..." } (JSON parse failed), try parsing it now
            if (_vout.raw && typeof _vout.raw === "string") {
              try { _vout = JSON.parse(_vout.raw); } catch(e) {
                // also try stripping markdown fences
                try {
                  var _stripped = _vout.raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
                  _vout = JSON.parse(_stripped);
                } catch(e2) { /* leave as raw */ }
              }
            }
            var _checksPass = _vout.weightCheck === "pass" &&
                              _vout.scoreRangeCheck === "pass" &&
                              _vout.targetExists === true &&
                              _vout.hhiConsistency === "pass";
            var validatedOk = _vout.validatedOk === true || _checksPass;
            if (!validatedOk) {
              setTrailStatus("recommend", "failed", root);
              state.results.orchestrator = {
                output: null,
                error: "Orchestrator skipped — validation did not pass. Check the Validation output above."
              };
              state.running = false;
              if (root) { render(root); }
              return;
            }

            setTrailStatus("recommend", "running", root);
            var orchCtx = Object.assign({}, ctx, {
              dataQualityOutput:          state.results.dataQuality.output          || null,
              statisticalAnalysisOutput:  state.results.statisticalAnalysis.output  || null,
              marketScreeningOutput:      state.results.marketScreening.output       || null,
              diversificationOutput:      state.results.diversification.output       || null,
              validationOutput:           state.results.validation.output            || null
            });
            callAgent("orchestrator", orchCtx, function (orchRes) {
              state.results.orchestrator = orchRes;
              setTrailStatus("recommend", orchRes.error ? "failed" : "completed", root);
              state.running = false;
              if (root) { render(root); }
            });
          });
        });
      });
      }); // statisticalAnalysis
    }); // dataQuality
  }

  function setTrailStatus(stepId, status, root) {
    state.trailStatus[stepId] = status;
    if (root) { render(root); }
  }

  /*
   * Pre-generated agent replies, loaded lazily from data/agent-cache.json.
   *
   * The proxy on :3001 cannot exist on a static deployment, and free-tier
   * Gemini quota is small enough that a live demo can fail for reasons that
   * have nothing to do with the project. When the proxy is unreachable the
   * app serves the cached reply instead, so the page is still complete.
   *
   * Cached replies are flagged with fromCache so the card can say plainly
   * that it is pre-generated. They are never passed off as a live call.
   */
  var _agentCache = null;          // null = not yet attempted
  var _agentCachePending = null;   // in-flight promise, so we fetch once

  function loadAgentCache() {
    if (_agentCache !== null) { return Promise.resolve(_agentCache); }
    if (_agentCachePending) { return _agentCachePending; }
    _agentCachePending = fetch("data/agent-cache.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { _agentCache = (j && j.agents) || false; return _agentCache; })
      .catch(function () { _agentCache = false; return false; });
    return _agentCachePending;
  }

  /** Resolve one agent from cache, or null when there is nothing cached. */
  function cachedAgent(agentType) {
    return loadAgentCache().then(function (cache) {
      if (!cache || !cache[agentType]) { return null; }
      var c = cache[agentType];
      return {
        output: c.output,
        model: c.model,
        error: null,
        fromCache: true,
        cachedAt: c.cachedAt
      };
    });
  }

  function callAgent(agentType, context, callback) {
    if (state.serverOnline !== true || !state.serverGemini) {
      cachedAgent(agentType).then(function (hit) {
        if (hit) { return callback(hit); }
        callback({
          output: null,
          error:  "AI explanation unavailable — backend offline or Gemini API key not set. Deterministic results are still valid.",
          offline: true
        });
      });
      return;
    }
    fetch(API_BASE + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentType: agentType, context: context })
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (e) { throw new Error(e.error || r.statusText); });
      }
      return r.json();
    }).then(function (data) {
      callback({ output: data.output, model: data.model, error: null });
    }).catch(function (err) {
      // A live call that fails (quota exhausted, connection dropped) falls back
      // to the cached reply rather than leaving the card blank.
      cachedAgent(agentType).then(function (hit) {
        if (hit) { hit.liveError = err.message; return callback(hit); }
        callback({ output: null, error: "AI explanation unavailable: " + err.message });
      });
    });
  }

  // ─── Agent result cards ───────────────────────────────────────────────────

  function buildAgentResults() {
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Agent Outputs";
    div.appendChild(h);

    AGENT_ORDER.forEach(function (key) {
      var res = state.results[key];
      if (!res) { return; }
      div.appendChild(buildAgentCard(key, res));
    });

    return div;
  }

  function buildAgentCard(agentType, res) {
    var card = document.createElement("div");
    card.className = "reit-agent-card";

    // Header
    var header = document.createElement("div");
    header.className = "reit-agent-card-header";
    var title = document.createElement("h3");
    title.textContent = AGENT_LABELS[agentType] + " Agent";
    header.appendChild(title);
    if (res.model) {
      var modelTag = document.createElement("span");
      modelTag.className = "reit-model-tag";
      modelTag.textContent = res.model;
      header.appendChild(modelTag);
    }
    card.appendChild(header);

    if (AGENT_PURPOSE[agentType]) {
      var purpose = document.createElement("p");
      purpose.className = "reit-agent-purpose";
      purpose.textContent = AGENT_PURPOSE[agentType];
      card.appendChild(purpose);
    }

    /*
     * A cached reply must never read as a live one. Say so on the card,
     * with when it was generated and why the cache was used.
     */
    if (res.fromCache) {
      var banner = document.createElement("p");
      banner.className = "reit-cached-banner";
      var when = "";
      try {
        when = res.cachedAt ? new Date(res.cachedAt).toLocaleString() : "";
      } catch (e) { when = res.cachedAt || ""; }
      banner.textContent = "Pre-generated response" + (when ? " from " + when : "") +
        " — " + (res.liveError
          ? "the live call failed (" + res.liveError + "), so the stored reply is shown."
          : "the Gemini proxy is not running, so the stored reply is shown.");
      card.appendChild(banner);
    }

    // Error / offline state
    if (res.error || res.offline) {
      var errWrap = document.createElement("div");
      errWrap.className = "reit-agent-unavailable";

      var errMsg = document.createElement("p");
      errMsg.className = "reit-agent-unavail-msg";
      errMsg.textContent = res.error || "AI explanation unavailable";
      errWrap.appendChild(errMsg);

      // Stage 11: show clear offline explanation
      if (res.offline) {
        var offlineExpl = document.createElement("div");
        offlineExpl.className = "reit-agent-offline-expl";

        var exTitle = document.createElement("p");
        exTitle.className = "reit-agent-offline-title";
        exTitle.textContent = "Why is the AI explanation unavailable?";
        offlineExpl.appendChild(exTitle);

        var reasons = [
          "This application uses a local Gemini proxy server (server/server.js) to call the Google Gemini API.",
          "Either that proxy is not running, or the Gemini endpoint stayed busy across every retry attempt.",
          "The deterministic analysis (scoring, HHI, projections) is fully complete and accurate without it.",
          "The AI agents only add natural-language interpretation on top of those deterministic results."
        ];
        var ul = document.createElement("ul");
        ul.className = "reit-agent-offline-list";
        reasons.forEach(function (r) {
          var li = document.createElement("li");
          li.textContent = r;
          ul.appendChild(li);
        });
        offlineExpl.appendChild(ul);

        var startCmd = document.createElement("p");
        startCmd.className = "reit-agent-offline-cmd";
        startCmd.textContent = "To start the proxy: open a terminal → cd server → npm start  (then reload this page)";
        offlineExpl.appendChild(startCmd);

        errWrap.appendChild(offlineExpl);
      }

      card.appendChild(errWrap);
      return card;
    }

    if (!res.output) {
      var noOut = document.createElement("p");
      noOut.textContent = "No output received.";
      card.appendChild(noOut);
      return card;
    }

    card.appendChild(buildOutputFields(res.output));

    if (res.output.disclaimer) {
      var disc = document.createElement("p");
      disc.className = "reit-agent-disclaimer";
      disc.textContent = res.output.disclaimer;
      card.appendChild(disc);
    }

    return card;
  }

  // Keys to hide from the rendered output (internal/technical)
  var HIDDEN_KEYS = { disclaimer: true, _model: true, syntheticDisclaimer: true };

  // Short scalar values the Orchestrator returns that read better as a row of
  // headline figures than as ordinary labelled paragraphs.
  var HEADLINE_KEYS = ["selectedTarget", "investmentAmount", "compositeScore", "expectedYieldPct"];

  // Keys that show a pass/fail badge
  var CHECK_KEYS = { weightCheck: true, scoreRangeCheck: true, hhiConsistency: true };

  // Human-friendly label overrides
  var FIELD_LABELS = {
    overallQuality:          "Overall Data Quality",
    dataSummary:             "Data Summary",
    sampleSizeWarnings:      "Sample Size Warnings",
    outlierNotes:            "Outlier Notes",
    pipelineSummary:         "How the Data Was Processed",
    recommendations:         "What Would Improve the Data",
    keyFindings:             "Key Findings",
    yieldDistribution:       "Yield Distribution",
    riskDistribution:        "Risk Distribution",
    yieldAnalysis:           "Yield Analysis",
    capitalValueAnalysis:    "Capital Value Analysis",
    cityComparison:          "City-by-City Comparison",
    typeComparison:          "Property-Type Comparison",
    statisticalCaveats:      "Statistical Caveats",
    topPickExplanation:      "Top Pick — Why This Market?",
    factorInsights:          "What Drove the Score",
    watchPoints:             "Watch Points",
    alternativesExplanation: "Alternative Markets",
    strategyAlignment:       "Strategy Alignment",
    cityHHIInterpretation:   "City Diversification (HHI)",
    typeHHIInterpretation:   "Asset-Type Diversification (HHI)",
    assetHHIInterpretation:  "Asset-Type Diversification (HHI)",
    yieldImpact:             "Effect on Portfolio Yield",
    overallAssessment:       "Overall Assessment",
    recommendedAllocation:   "Recommended Allocation",
    weightCheck:             "Weight Check",
    scoreRangeCheck:         "Score Range Check",
    targetExists:            "Target in Top Markets",
    hhiConsistency:          "HHI Consistency",
    dataQuality:             "Data Quality Note",
    inconsistencies:         "Inconsistencies Found",
    limitations:             "Limitations",
    validatedOk:             "Validation Passed",
    executiveSummary:        "Executive Summary",
    topRecommendation:       "Top Recommendation",
    rationale:               "Rationale",
    riskWarnings:            "Risk Warnings",
    academicDisclaimer:      "Academic Disclaimer",
    selectedTarget:          "Recommended Market",
    investmentAmount:        "Investment Amount",
    compositeScore:          "Composite Score",
    expectedYieldPct:        "Expected Gross Yield",
    cityHHIEffect:           "Effect on City Concentration",
    assetTypeHHIEffect:      "Effect on Asset-Type Concentration",
    whyTopRanked:            "Why This Market Ranked First",
    importantRisks:          "Important Risks",
    raw:                     "AI Response"
  };

  function friendlyLabel(k) {
    return FIELD_LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function buildOutputFields(output) {
    // If raw field, try to parse it first
    if (output && output.raw && typeof output.raw === "string") {
      try {
        var parsed = JSON.parse(output.raw);
        output = parsed;
      } catch(e) {
        try {
          var stripped = output.raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          output = JSON.parse(stripped);
        } catch(e2) { /* keep raw */ }
      }
    }

    var div = document.createElement("div");
    div.className = "reit-agent-output";

    // Lead with the headline numbers when the agent returned them, so the
    // recommendation is readable at a glance before the narrative fields.
    var headline = HEADLINE_KEYS.filter(function (k) {
      var v = output[k];
      return v !== undefined && v !== null && v !== "" && typeof v !== "object";
    });
    if (headline.length) {
      var statRow = document.createElement("div");
      statRow.className = "reit-output-stats";
      headline.forEach(function (k) {
        var stat = document.createElement("div");
        stat.className = "reit-output-stat";
        var sLabel = document.createElement("div");
        sLabel.className = "reit-output-stat-label";
        sLabel.textContent = friendlyLabel(k);
        var sVal = document.createElement("div");
        sVal.className = "reit-output-stat-value";
        sVal.textContent = (k === "expectedYieldPct" && typeof output[k] === "number")
          ? output[k] + "%"
          : String(output[k]);
        stat.appendChild(sLabel);
        stat.appendChild(sVal);
        statRow.appendChild(stat);
      });
      div.appendChild(statRow);
    }

    Object.keys(output).forEach(function (k) {
      if (HIDDEN_KEYS[k]) { return; }
      if (headline.indexOf(k) !== -1) { return; }   // already shown above
      var val = output[k];

      var field = document.createElement("div");
      field.className = "reit-output-field";

      var label = document.createElement("div");
      label.className = "reit-output-field-label";
      label.textContent = friendlyLabel(k);
      field.appendChild(label);

      // Pass/fail badge
      if (CHECK_KEYS[k]) {
        var badge = document.createElement("span");
        var passed = (val === "pass" || val === true);
        badge.className = "reit-check-badge reit-check-" + (passed ? "pass" : "fail");
        badge.textContent = passed ? "✓ Pass" : "✗ Fail";
        field.appendChild(badge);

      // Boolean (targetExists, validatedOk)
      } else if (typeof val === "boolean") {
        var boolBadge = document.createElement("span");
        boolBadge.className = "reit-check-badge reit-check-" + (val ? "pass" : "fail");
        boolBadge.textContent = val ? "✓ Yes" : "✗ No";
        field.appendChild(boolBadge);

      // Array
      } else if (Array.isArray(val)) {
        if (val.length === 0) {
          var none = document.createElement("p");
          none.className = "reit-output-text reit-output-none";
          none.textContent = "None";
          field.appendChild(none);
        } else {
          var ul = document.createElement("ul");
          ul.className = "reit-output-list";
          val.forEach(function (item) {
            var li = document.createElement("li");
            li.textContent = typeof item === "object" ? JSON.stringify(item) : String(item);
            ul.appendChild(li);
          });
          field.appendChild(ul);
        }

      // Nested object
      } else if (typeof val === "object" && val !== null) {
        var nestedDiv = document.createElement("div");
        nestedDiv.className = "reit-output-nested";
        Object.keys(val).forEach(function (nk) {
          var nv = val[nk];
          var nRow = document.createElement("div");
          nRow.className = "reit-output-nested-row";
          var nLabel = document.createElement("span");
          nLabel.className = "reit-output-nested-label";
          nLabel.textContent = friendlyLabel(nk) + ":";
          var nVal = document.createElement("span");
          nVal.className = "reit-output-nested-val";
          nVal.textContent = typeof nv === "object" ? JSON.stringify(nv) : String(nv);
          nRow.appendChild(nLabel);
          nRow.appendChild(nVal);
          nestedDiv.appendChild(nRow);
        });
        field.appendChild(nestedDiv);

      // Plain text
      } else {
        var p = document.createElement("p");
        p.className = "reit-output-text";
        p.textContent = String(val);
        field.appendChild(p);
      }

      div.appendChild(field);
    });
    return div;
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  /**
   * refreshContext() — re-reads ReitState and re-renders the context panel
   * WITHOUT disturbing an in-progress agent run. Called when the user
   * navigates back to the Agents page so the latest screener weights/ranked
   * list are always reflected.
   */
  function refreshContext() {
    if (state.running) { return; }          // never interrupt a live run
    var fresh = ReitState.load();
    if (!fresh) { return; }
    // Only refresh if the run is newer than what we have cached
    var cachedAt = state.sharedRun ? (state.sharedRun.createdAt || 0) : 0;
    if (fresh.createdAt && fresh.createdAt <= cachedAt) { return; }
    state.sharedRun = fresh;
    buildContext();
    var root = document.getElementById(ROOT_ID);
    if (root) { render(root); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
      // Re-read shared state whenever the user navigates to this page
      window.addEventListener("hashchange", function () {
        if (window.location.hash === "#agents") { refreshContext(); }
      });
      // MutationObserver as belt-and-braces (same pattern as report.js)
      var observer = new MutationObserver(function () {
        var page = document.getElementById("page-agents");
        if (page && page.classList.contains("page-active")) { refreshContext(); }
      });
      var main = document.getElementById("main-content");
      if (main) { observer.observe(main, { subtree: true, attributes: true, attributeFilter: ["class"] }); }
    });
  } else {
    init();
    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#agents") { refreshContext(); }
    });
    var observer = new MutationObserver(function () {
      var page = document.getElementById("page-agents");
      if (page && page.classList.contains("page-active")) { refreshContext(); }
    });
    var main = document.getElementById("main-content");
    if (main) { observer.observe(main, { subtree: true, attributes: true, attributeFilter: ["class"] }); }
  }

}());

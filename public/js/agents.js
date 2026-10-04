/**
 * agents.js — Agent Output page controller
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Four Gemini agents interpret the SHARED analysis run (analysisRun.js). They
 * never calculate, rank or validate: the context they receive is built by
 * agentContext.js from the same run every other page renders, eight
 * deterministic checks (validator.js) gate the Orchestrator, and every reply is
 * checked against the context (agentOutputCheck.js) before it is displayed.
 *
 * THREE PROVENANCES, AND NO FOURTH
 *   live           a Gemini call made just now for this exact run. Only possible
 *                  when the page is served by the local proxy (node server/server.js
 *                  → http://localhost:3001); on any other origin the proxy is not
 *                  probed at all, so a static deployment logs no failed requests.
 *   cache          stored commentary whose scenario key matches this run exactly
 *                  (public/data/agent-cache.json, built by buildAgentCache.js)
 *   deterministic  no commentary; the deterministic figures stand alone
 * Commentary written for a different configuration is never displayed. When
 * the run changes, results produced for the previous run are discarded.
 */

(function () {
  "use strict";

  var ROOT_ID    = "agents-content";
  var PROXY_PORT = "3001";
  /* Live calls only from the proxy's own origin. */
  var LIVE_ORIGIN = (typeof location !== "undefined" && location.port === PROXY_PORT &&
                     /^https?:$/.test(location.protocol)) ? location.origin : null;

  // ─── State ─────────────────────────────────────────────────────────────────

  var state = {
    run:          null,
    loading:      true,
    error:        null,
    serverOnline: null,     // null = not probed, true, false
    serverGemini: false,
    serverModel:  null,
    cache:        null,     // scenarios object, false = unavailable, null = not loaded
    cacheMatch:   false,
    cacheMismatch: null,    // fields that differ from the nearest stored scenario
    running:      false,
    shown:        false,    // results are on screen
    mode:         null,     // "live" | "cache"
    results:      {},       // agentKey -> { output, model, provenance, check, cachedAt, error }
    resultsKey:   null,     // scenario key the results belong to
    trailStatus:  {}
  };

  /* THE ROSTER COMES FROM appMeta.js, so this page, the server prompts, the
   * report and the documentation cannot disagree about the agents. */
  function roster() {
    return (typeof AppMeta !== "undefined" && AppMeta.AGENTS) ? AppMeta.AGENTS : [];
  }

  var AGENT_ORDER  = roster().map(function (a) { return a.key; });
  var AGENT_LABELS = {};
  var AGENT_PURPOSE = {};
  roster().forEach(function (a) {
    AGENT_LABELS[a.key]  = a.label;
    AGENT_PURPOSE[a.key] = a.purpose;
  });

  /*
   * Five trail steps for four agents: "Inputs validated" is performed by
   * validator.js in code — eight arithmetic checks with one correct answer
   * each — and gates the Orchestrator. It is marked deterministic because
   * presenting it as a model call would misdescribe the system.
   */
  var TRAIL_STEPS = roster().map(function (a) {
    return { id: a.step.id, label: a.step.label, agent: a.key, deterministic: false };
  });
  (function insertValidationStep() {
    var at = -1;
    for (var i = 0; i < TRAIL_STEPS.length; i++) {
      if (TRAIL_STEPS[i].agent === "orchestrator") { at = i; break; }
    }
    var step = { id: "validation", label: "Inputs validated (deterministic, no model call)",
                 agent: null, deterministic: true };
    if (at === -1) { TRAIL_STEPS.push(step); } else { TRAIL_STEPS.splice(at, 0, step); }
  }());

  function resetTrail() {
    TRAIL_STEPS.forEach(function (s) { state.trailStatus[s.id] = "pending"; });
  }

  function universe() {
    var d = AnalysisRun.data();
    return (d && d.marketsDoc && d.marketsDoc.markets) || [];
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    showLoading(root);
    resetTrail();

    Promise.all([AnalysisRun.ready(), checkServerStatus(), loadAgentCache()]).then(function (res) {
      state.run = res[0];
      state.loading = false;
      updateCacheMatch();
      render(root);
    }).catch(function (err) {
      state.loading = false;
      state.error = "Could not load the dataset: " + err.message + ". Reload the page to try again.";
      render(root);
    });

    AnalysisRun.subscribe(function (run) {
      state.run = run;
      if (state.resultsKey && state.resultsKey !== run.scenarioKey && !state.running) {
        clearResults();      // commentary about another configuration is never kept on screen
      }
      updateCacheMatch();
      render(root);
    });
  }

  function clearResults() {
    state.results = {};
    state.resultsKey = null;
    state.shown = false;
    state.mode = null;
    resetTrail();
    publish();
  }

  // ─── Server and cache ─────────────────────────────────────────────────────

  function checkServerStatus() {
    if (!LIVE_ORIGIN) { state.serverOnline = false; return Promise.resolve(); }
    return fetch(LIVE_ORIGIN + "/api/health")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.serverOnline = d.status === "ok";
        state.serverGemini = !!d.geminiConfigured;
        state.serverModel  = d.model || null;
      })
      .catch(function () { state.serverOnline = false; });
  }

  function loadAgentCache() {
    return fetch("data/agent-cache.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { state.cache = (j && j.scenarios) || false; })
      .catch(function () { state.cache = false; });
  }

  function liveAvailable() {
    return state.serverOnline === true && state.serverGemini;
  }

  /** Does stored commentary exist for exactly this run? If not, say why. */
  function updateCacheMatch() {
    state.cacheMatch = false;
    state.cacheMismatch = null;
    if (!state.run || !state.cache) { return; }
    if (state.cache[state.run.scenarioKey]) { state.cacheMatch = true; return; }
    var names = Object.keys(state.cache);
    if (!names.length) { return; }
    var nearest = names.filter(function (k) { return state.cache[k].preset === state.run.preset; })[0] || names[0];
    state.cacheMismatch = ScenarioKey.diff(state.cache[nearest].descriptor, state.run.scenarioDescriptor);
  }

  // ─── Running the chain ────────────────────────────────────────────────────

  function callLive(agentKey, ctx) {
    return fetch(LIVE_ORIGIN + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentType: agentKey, context: ctx })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { throw new Error(j.detail || j.error || r.statusText); }
        return { output: j.output, model: j.model, provenance: "live" };
      });
    });
  }

  function fromCache(agentKey) {
    var entry = state.cache && state.cache[state.run.scenarioKey];
    var c = entry && entry.agents && entry.agents[agentKey];
    if (!c) { return Promise.reject(new Error("No stored commentary for this agent and configuration.")); }
    return Promise.resolve({ output: c.output, model: c.model, cachedAt: c.cachedAt,
                             provenance: "cache", scenarioLabel: entry.label });
  }

  function step(agentKey, ctx) {
    var call = state.mode === "live" ? callLive(agentKey, ctx) : fromCache(agentKey);
    return call.then(function (res) {
      res.check = AgentOutputCheck.check(agentKey, res.output, ctx, universe());
      return res;
    }).catch(function (err) {
      return { output: null, provenance: "deterministic", error: err.message };
    });
  }

  function start(mode) {
    var root = document.getElementById(ROOT_ID);
    var run = state.run;
    state.mode = mode;
    state.running = true;
    state.shown = true;
    state.results = {};
    state.resultsKey = run.scenarioKey;
    resetTrail();
    render(root);

    var base = run.agentContext;
    var out = {};
    function set(id, status) { state.trailStatus[id] = status; render(root); }

    set("data", "running");
    step("dataStatistical", base).then(function (ds) {
      state.results.dataStatistical = ds; out.ds = ds.output;
      set("data", ds.error ? "failed" : "completed");
      set("screening", "running");
      return step("marketScreening", Object.assign({}, base, { dataStatisticalOutput: out.ds || null }));
    }).then(function (mk) {
      state.results.marketScreening = mk; out.mk = mk.output;
      set("screening", mk.error ? "failed" : "completed");
      set("simulation", "running");
      return step("portfolioRisk", Object.assign({}, base, {
        dataStatisticalOutput: out.ds || null, marketScreeningOutput: out.mk || null }));
    }).then(function (rk) {
      state.results.portfolioRisk = rk; out.rk = rk.output;
      set("simulation", rk.error ? "failed" : "completed");

      // ── Deterministic gate. No model, no network, no quota. ──
      var v = run.validation;
      set("validation", v.passed ? "completed" : "failed");
      if (!v.passed) {
        set("recommend", "failed");
        state.results.orchestrator = { output: null, provenance: "deterministic",
          error: "No synthesis was produced. " + v.summary + " These are arithmetic checks on the " +
                 "analysis inputs, not AI judgements — see the panel above for what was compared." };
        return null;
      }
      set("recommend", "running");
      return step("orchestrator", Object.assign({}, base, {
        dataStatisticalOutput: out.ds || null,
        marketScreeningOutput: out.mk || null,
        portfolioRiskOutput:   out.rk || null,
        deterministicValidation: {
          passed: v.passed, summary: v.summary,
          checks: v.checks.map(function (c) { return { label: c.label, passed: c.passed, detail: c.detail }; }),
          limitations: v.limitations
        }
      })).then(function (or) {
        state.results.orchestrator = or;
        set("recommend", or.error ? "failed" : "completed");
      });
    }).then(function () {
      state.running = false;
      if (state.resultsKey !== state.run.scenarioKey) { clearResults(); }   // the run changed mid-chain
      publish();
      render(root);
    });
  }

  function hide() {
    clearResults();
    render(document.getElementById(ROOT_ID));
    var b = document.querySelector("#" + ROOT_ID + " .reit-run-btn");
    if (b) { b.focus(); }
  }

  /** Make the outputs available to the Decision Report, tagged with their run. */
  function publish() {
    if (!state.resultsKey || !Object.keys(state.results).length) {
      window._reitAgentOutputs = undefined;
    } else {
      var pub = { scenarioKey: state.resultsKey, _provenance: {}, _checks: {} };
      Object.keys(state.results).forEach(function (k) {
        var r = state.results[k];
        if (r && r.output) { pub[k] = r.output; }
        pub._provenance[k] = r ? r.provenance : null;
        pub._checks[k] = r && r.check ? r.check : null;
      });
      window._reitAgentOutputs = pub;
    }
    document.dispatchEvent(new CustomEvent("reit:agent-outputs"));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function showLoading(root) {
    root.innerHTML = "";
    var p = document.createElement("p");
    p.className = "loading-msg";
    p.setAttribute("role", "status");
    p.textContent = "Preparing the agent context…";
    root.appendChild(p);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }

  function render(root) {
    if (!root) { return; }
    root.innerHTML = "";
    if (state.error) {
      var errEl = el("p", "error-msg", state.error);
      errEl.setAttribute("role", "alert");
      root.appendChild(errEl);
      return;
    }
    if (state.loading || !state.run) { showLoading(root); return; }

    root.appendChild(buildStatusBar());
    root.appendChild(buildContextSummary());
    root.appendChild(buildTrail());
    root.appendChild(buildRunButton());
    root.appendChild(buildValidationPanel());
    if (state.shown && Object.keys(state.results).length) {
      root.appendChild(buildAgentResults());
    }
  }

  function buildStatusBar() {
    var div = el("div", "reit-agent-status-bar");
    div.setAttribute("role", "status");
    if (liveAvailable()) {
      div.className += " reit-status-online";
      div.textContent = "✓ Live mode — served by the local proxy, Gemini configured (" +
        (state.serverModel || "model") + ").";
    } else if (state.serverOnline === true) {
      div.className += " reit-status-warn";
      div.textContent = "⚠ The local proxy is running but no Gemini API key is configured in server/.env. " +
        "Pre-generated commentary is still available for the four presets at their defaults.";
    } else if (LIVE_ORIGIN) {
      div.className += " reit-status-offline";
      div.textContent = "⚠ The local proxy did not respond. Start it with node server/server.js. " +
        "The deterministic analysis is unaffected.";
    } else {
      div.className += " reit-status-static";
      div.textContent = "Static mode — this page is not served by the local Gemini proxy, so live calls are " +
        "not available here. Pre-generated commentary is available for the four presets at their " +
        "defaults. For live commentary run node server/server.js and open http://localhost:3001.";
    }
    return div;
  }

  function buildContextSummary() {
    var run = state.run;
    var ctx = run.agentContext;
    var div = el("div", "reit-section");
    var h = el("h2", null, "Analysis Context");
    h.id = "agents-context-h";
    div.appendChild(h);
    div.appendChild(el("p", "reit-note",
      "The deterministic figures the agents are given — the same shared analysis every page renders. " +
      "The agents may quote these figures; they may not change them."));

    var t = ctx.selectedTarget;
    var rec = ctx.recommendedCandidate;
    var raw = ctx.highestRawScoreMarket;
    var items = [
      [AnalysisRun.targetLabel(run), t ? t.name + " (" + t.marketId + ")" : "None"],
      ["Raw rank / eligible rank", t ? t.rawRank + " of " + run.ranked.length + " / " +
        (t.eligibleRank ? t.eligibleRank + " of " + run.eligibleCount : "— (fails the screen)") : "—"],
      ["Composite attractiveness score", t ? t.compositeScore + " / 100" : "—"],
      ["Gross yield", t ? t.grossYieldPct + "%" : "—"],
      ["Simulation support", t ? (t.passesSimulationSupportRule ? "✓ Passes" : "✗ Fails") +
        " the screen — " + t.simulationObservationCount + " simulated observations, Assumption Support Grade " +
        (t.supportGrade || "—") : "—"],
      ["External calibration", t ? t.externalCalibrationStatus : "—"],
      ["Shortlist candidate (model)", rec ? rec.name + " — raw rank " + rec.rawRank : "None"],
      ["Highest raw-score market", raw ? raw.name + " — " + raw.compositeScore +
        (raw.passesSimulationSupportRule ? " (passes the screen)" : " (fails: " + raw.exclusionReasons.join("; ") + ")") : "—"],
      ["Investment amount", AppMeta.cr(run.investmentRs, 2)],
      ["Weights", run.presetLabel + " — Yield " + ctx.weightsPct.rentalYield + "% / Growth " +
        ctx.weightsPct.rentalGrowth + "% / Diversification " + ctx.weightsPct.diversification +
        "% / Demand " + ctx.weightsPct.demand + "% / Risk " + ctx.weightsPct.lowMarketRisk + "%"],
      ["Portfolio", ctx.portfolio.assetCount + " holdings, ₹" + ctx.portfolio.totalValueCr + " Cr, weighted yield " +
        ctx.portfolio.weightedYieldPct + "%"],
      ["City HHI", ctx.concentration ? ctx.concentration.cityHHIBefore + " → " + ctx.concentration.cityHHIAfter : "—"],
      ["Asset-type HHI", ctx.concentration ? ctx.concentration.assetTypeHHIBefore + " → " + ctx.concentration.assetTypeHHIAfter : "—"],
      ["Simulation-support screen", ctx.simulationSupportScreen.segmentsPassing + " of " +
        ctx.simulationSupportScreen.segmentsTotal + " segments pass (" + ctx.simulationSupportScreen.rule + ")" +
        (run.governanceOverride ? " — ignored for this run" : "")]
    ];

    var tbl = el("table", "reit-context-table");
    tbl.setAttribute("aria-labelledby", h.id);
    if (t) { tbl.setAttribute("data-target-id", t.marketId); }
    tbl.setAttribute("data-selection-mode", run.selectionMode);
    var tb = document.createElement("tbody");
    items.forEach(function (item) {
      var tr = document.createElement("tr");
      var th = el("th", "reit-ctx-label", item[0]);
      th.setAttribute("scope", "row");
      tr.appendChild(th);
      tr.appendChild(el("td", "reit-ctx-value", item[1]));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    div.appendChild(tbl);
    return div;
  }

  function buildTrail() {
    var div = el("div", "reit-section");
    div.appendChild(el("h2", null, "Activity Trail"));
    var list = el("ol", "reit-trail-list");
    TRAIL_STEPS.forEach(function (stepDef, idx) {
      var status = state.trailStatus[stepDef.id] || "pending";
      var li = el("li", "reit-trail-step reit-trail-" + status);
      var icon = el("span", "reit-trail-icon");
      if (status === "completed")    { icon.textContent = "✔"; icon.className += " reit-trail-ok"; }
      else if (status === "failed")  { icon.textContent = "✖"; icon.className += " reit-trail-err"; }
      else if (status === "running") { icon.textContent = "⏳"; icon.className += " reit-trail-run"; }
      else { icon.textContent = (idx + 1) + "."; icon.className += " reit-trail-pending-icon"; }
      var label = el("span", "reit-trail-label", stepDef.label);
      if (stepDef.deterministic) {
        label.className += " reit-trail-deterministic";
        label.title = "Performed in code by validator.js. No Gemini call, no API quota.";
      }
      var sl = el("span", "reit-trail-status-label",
        status === "completed" ? "Completed" : status === "failed" ? "Failed"
        : status === "running" ? "Running…" : "Pending");
      li.appendChild(icon); li.appendChild(label); li.appendChild(sl);
      list.appendChild(li);
    });
    div.appendChild(list);
    return div;
  }

  function buildRunButton() {
    var div = el("div", "reit-run-section");
    var btn = el("button", "reit-run-btn");
    btn.type = "button";
    var note = el("p", "reit-run-note");

    if (state.running) {
      btn.textContent = "Running agents…";
      btn.disabled = true;
    } else if (liveAvailable()) {
      btn.textContent = state.shown && state.mode === "live" ? "Run Agent Analysis Again" : "Run Agent Analysis";
      btn.addEventListener("click", function () { start("live"); });
      note.textContent = "Makes " + AGENT_ORDER.length + " live Gemini calls for this exact configuration.";
    } else if (state.cacheMatch) {
      if (state.shown && state.mode === "cache") {
        btn.textContent = "Hide Pre-generated Analysis";
        btn.setAttribute("aria-pressed", "true");
        btn.addEventListener("click", hide);
      } else {
        btn.textContent = "Show Pre-generated Analysis";
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", function () { start("cache"); });
      }
      note.textContent = "Stored commentary whose scenario key matches this exact run. It is stored text, " +
        "not a live model call, and it was checked against the deterministic figures before it was saved.";
    } else {
      btn.textContent = "Run Agent Analysis";
      btn.disabled = true;
      note.textContent = state.cacheMismatch && state.cacheMismatch.length
        ? "No pre-generated commentary matches this configuration — it differs from the stored analysis by: " +
          state.cacheMismatch.join(", ") + ". Commentary written for another configuration is deliberately not " +
          "shown. Choose a preset at its defaults, or run the local proxy for live commentary."
        : "No pre-generated commentary is available, and live calls need the local proxy.";
      note.className += " reit-run-note-warn";
    }
    div.appendChild(btn);
    div.appendChild(note);
    div.appendChild(el("p", "reit-run-note",
      "All financial calculations are deterministic, and so are the eight input checks that gate the " +
      "Orchestrator. The " + AGENT_ORDER.length + " Gemini agents provide interpretation only — they do not " +
      "calculate, rank, validate or change any value."));
    return div;
  }

  function buildValidationPanel() {
    var v = state.run.validation;
    var div = el("div", "reit-section reit-validation-panel");
    var h = el("h2", null, "Deterministic Input Checks");
    h.id = "agents-checks-h";
    div.appendChild(h);
    div.appendChild(el("p", "reit-validation-intro",
      "Performed in code for the current run, before any model call: arithmetic comparisons with one correct " +
      "answer each. They need no API key and give the same verdict every time for the same inputs."));
    div.appendChild(el("p", "reit-validation-summary " + (v.passed ? "reit-validation-pass" : "reit-validation-fail"),
      (v.passed ? "✓ " : "✗ ") + v.summary));

    var tbl = el("table", "reit-validation-table");
    tbl.setAttribute("aria-labelledby", h.id);
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["Check", "Result", "What was compared"].forEach(function (t) {
      var th = el("th", null, t); th.setAttribute("scope", "col"); hr.appendChild(th);
    });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tbody = document.createElement("tbody");
    v.checks.forEach(function (c) {
      var tr = document.createElement("tr");
      var th = el("th", null, c.label); th.setAttribute("scope", "row"); tr.appendChild(th);
      var tdR = document.createElement("td");
      tdR.appendChild(el("span", "reit-check-badge reit-check-" + (c.passed ? "pass" : "fail"), c.passed ? "✓ Pass" : "✗ Fail"));
      tr.appendChild(tdR);
      tr.appendChild(el("td", "reit-validation-detail", c.detail));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    div.appendChild(tbl);

    var details = el("details", "reit-expandable");
    details.appendChild(el("summary", null, "Stated limitations of this analysis (" + v.limitations.length + ")"));
    var ul = el("ul", "reit-validation-limits");
    v.limitations.forEach(function (l) { ul.appendChild(el("li", null, l)); });
    details.appendChild(ul);
    div.appendChild(details);
    return div;
  }

  // ─── Agent cards ──────────────────────────────────────────────────────────

  function buildAgentResults() {
    var div = el("div", "reit-section");
    div.appendChild(el("h2", null, "Agent Outputs"));
    AGENT_ORDER.forEach(function (key) {
      if (state.results[key]) { div.appendChild(buildAgentCard(key, state.results[key])); }
    });
    return div;
  }

  /** Deterministic figures shown above each agent's prose — never taken from it. */
  function factsFor(agentKey) {
    var ctx = state.run.agentContext;
    var t = ctx.selectedTarget, c = ctx.concentration, d = ctx.marketDataset;
    if (agentKey === "dataStatistical" && d) {
      return [["Segments", d.segmentCount], ["Simulated observations", AppMeta.num(d.simulatedObservations)],
              ["Segments under " + ctx.simulationSupportScreen.minSimulatedObservations + " obs.", d.segmentsBelowObservationThreshold],
              ["Median of segment gross yields (dataset, not portfolio)", d.medianOfSegmentGrossYieldsPct + "%"]];
    }
    if (agentKey === "marketScreening" && t) {
      var cm = ctx.comparisonMarket;
      return [[AnalysisRun.targetLabel(state.run), t.name], ["Raw rank", t.rawRank],
              ["Eligible rank", t.eligibleRank || "—"], ["Score", t.compositeScore],
              [cm ? cm.role : "Comparison", cm ? cm.name + " — " + cm.compositeScore : "—"]];
    }
    if (agentKey === "portfolioRisk" && c) {
      var base = ctx.projections && ctx.projections.scenarios.base;
      return [["City HHI", c.cityHHIBefore + " → " + c.cityHHIAfter],
              ["Asset-type HHI", c.assetTypeHHIBefore + " → " + c.assetTypeHHIAfter],
              ["Weighted yield", c.weightedYieldBeforePct + "% → " + c.weightedYieldAfterPct + "%"],
              ["Base case, 3 years", base ? "₹" + base.portfolioValueCr + " Cr value, ₹" + base.annualRentCr + " Cr rent" : "—"]];
    }
    if (agentKey === "orchestrator" && t) {
      return [[AnalysisRun.targetLabel(state.run), t.name], ["Investment", AppMeta.cr(state.run.investmentRs, 2)],
              ["Composite score", t.compositeScore], ["Expected gross yield", t.grossYieldPct + "%"],
              ["Simulation support", t.passesSimulationSupportRule ? "✓ Passes the screen" : "✗ Fails the screen"],
              ["External calibration", t.externalCalibrationStatus]];
    }
    return [];
  }

  function buildAgentCard(agentKey, res) {
    var card = el("div", "reit-agent-card");
    var header = el("div", "reit-agent-card-header");
    header.appendChild(el("h3", null, AGENT_LABELS[agentKey] + " Agent"));
    if (res.model) { header.appendChild(el("span", "reit-model-tag", res.model)); }
    card.appendChild(header);
    if (AGENT_PURPOSE[agentKey]) { card.appendChild(el("p", "reit-agent-purpose", AGENT_PURPOSE[agentKey])); }

    var banner = el("p", "reit-prov-banner reit-prov-" + res.provenance);
    if (res.provenance === "live") {
      banner.textContent = "Live Gemini interpretation — generated just now for this exact configuration" +
        (res.model ? " using " + res.model + "." : ".");
    } else if (res.provenance === "cache") {
      var when = "";
      try { when = res.cachedAt ? new Date(res.cachedAt).toLocaleString() : ""; } catch (e) { when = res.cachedAt || ""; }
      banner.textContent = "Pre-generated interpretation" + (res.scenarioLabel ? " (" + res.scenarioLabel + ")" : "") +
        (when ? ", generated " + when : "") + " — every input matches the stored analysis. Stored text, not a live call.";
    } else {
      banner.textContent = "Deterministic output only — no AI interpretation is shown.";
    }
    card.appendChild(banner);

    var facts = factsFor(agentKey);
    if (facts.length) {
      var stats = el("div", "reit-output-stats");
      facts.forEach(function (f) {
        var s = el("div", "reit-output-stat");
        s.appendChild(el("div", "reit-output-stat-label", f[0]));
        s.appendChild(el("div", "reit-output-stat-value", f[1]));
        stats.appendChild(s);
      });
      card.appendChild(stats);
      card.appendChild(el("p", "reit-output-stat-source",
        "Figures above are taken from the deterministic analysis, not from the model."));
    }

    if (res.error || !res.output) {
      card.appendChild(el("p", "reit-agent-unavailable", res.error || "No output."));
      return card;
    }

    if (res.check) {
      if (res.check.ok) {
        card.appendChild(el("p", "reit-check-ok",
          "✓ Consistency check passed — no market, rank, figure or exclusion reason in this text contradicts " +
          "the analysis. The check finds specific kinds of error; it cannot prove the prose true."));
      } else {
        var warn = el("div", "reit-check-warn");
        warn.setAttribute("role", "note");
        warn.appendChild(el("p", null, "⚠ Consistency check: " + res.check.issues.length +
          " statement(s) below do not match the deterministic analysis. The figures above are authoritative."));
        var ul = el("ul");
        res.check.issues.slice(0, 8).forEach(function (i) {
          ul.appendChild(el("li", null, (AgentOutputCheck.FIELD_LABELS[i.field.replace(/\[\d+\]$/, "")] || i.field) +
            ": " + i.message));
        });
        warn.appendChild(ul);
        card.appendChild(warn);
      }
    }

    card.appendChild(renderOutput(agentKey, res.output));
    return card;
  }

  function renderOutput(agentKey, output) {
    var div = el("div", "reit-agent-output");
    var schema = AgentOutputCheck.SCHEMAS[agentKey];
    var keys = schema ? schema.required : Object.keys(output);
    keys.forEach(function (k) {
      if (k === "disclaimer" || k.charAt(0) === "_") { return; }
      var val = output[k];
      if (val === undefined || val === null || val === "") { return; }
      var field = el("div", "reit-output-field");
      field.appendChild(el("div", "reit-output-field-label", AgentOutputCheck.FIELD_LABELS[k] || k));
      if (Array.isArray(val)) {
        var ul = el("ul", "reit-output-list");
        val.forEach(function (x) { ul.appendChild(el("li", null, String(x))); });
        field.appendChild(ul);
      } else {
        field.appendChild(el("p", "reit-output-text", String(val)));
      }
      div.appendChild(field);
    });
    if (output.disclaimer) { div.appendChild(el("p", "reit-output-disclaimer", output.disclaimer)); }
    return div;
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());

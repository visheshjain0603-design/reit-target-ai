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
    marketsDoc:    null,    // full markets.json, for the dataset fingerprint
    rankedForKey:  [],      // ranking used when building the scenario key
    sharedRun:     null,    // from ReitState
    selectedMarket: null,
    portfolioCtx:  null,
    serverOnline:  null,    // null=unchecked, true, false
    serverGemini:  false,
    serverModel:   null,
    cacheMatch:    false,   // a stored analysis exists for the scenario on screen
    running:       false,
    trail:         [],      // stepId strings of completed steps
    trailStatus:   {},      // stepId -> "pending"|"running"|"completed"|"failed"
    results:       {},      // agentType -> { output, error, offline }
    validation:    null,    // Validator.validate() result — deterministic, no model
    loading:       true,
    error:         null
  };

  /*
   * THE ROSTER COMES FROM appMeta.js, NOT FROM HERE.
   *
   * Four agents, down from six. The roster, their labels, their plain-English
   * purposes and their trail steps are all declared once in AppMeta.AGENTS so
   * that this page, the server's prompts, the report and the documentation
   * cannot disagree about how many agents there are or what they are called.
   * The previous revision listed them in four separate places and the page
   * subtitle named a "Validation agent" that had a different job from the one
   * the server actually prompted.
   */
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
   * The trail has five steps for four agents, because one step is not an agent.
   *
   * "Inputs validated" sits between the analysts and the Orchestrator and is
   * performed by validator.js in code — eight arithmetic checks, offline, with
   * one correct answer each. It is shown in the trail because it genuinely
   * happens and genuinely gates the Orchestrator; it is marked as
   * deterministic because presenting it as another model call would misdescribe
   * what the system does and overstate what the models were asked to do.
   */
  var TRAIL_STEPS = roster().map(function (a) {
    return { id: a.step.id, label: a.step.label, agent: a.key, deterministic: false };
  });
  (function insertValidationStep() {
    var at = -1;
    for (var i = 0; i < TRAIL_STEPS.length; i++) {
      if (TRAIL_STEPS[i].agent === "orchestrator") { at = i; break; }
    }
    var step = {
      id: "validation",
      label: "Inputs validated (deterministic, no model call)",
      agent: null,
      deterministic: true
    };
    if (at === -1) { TRAIL_STEPS.push(step); } else { TRAIL_STEPS.splice(at, 0, step); }
  }());

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
      state.marketsDoc = results[0] || null;   // keep the whole doc: derivedFrom carries the dataset version
      state.markets = results[0].markets || [];
      state.assets  = results[1].assets  || [];
      state.sharedRun = ReitState.load();

      buildContext();
      state.loading = false;
      Promise.all([checkServerStatus(), checkCacheMatch()])
        .then(function () { render(root); });
    }).catch(function (err) {
      state.loading = false;
      state.error = "Could not load data: " + err.message;
      render(root);
    });
  }

  // ─── Build context from shared run ────────────────────────────────────────

  /*
   * The context itself is built by agentContext.js, shared with
   * data-pipeline/scripts/buildAgentCache.js. The cached commentary is keyed by
   * ScenarioKey over these same inputs, so building them in one place is what
   * guarantees a cache hit describes the context this page would have sent.
   */
  function buildContext() {
    var run = state.sharedRun;
    var built = AgentContext.build({
      markets: state.markets,
      assets:  state.assets,
      run:     run,
      runNote: run && !run.stale
        ? "Results from Market Screener run at " + new Date(run.createdAt).toLocaleTimeString()
        : "Fallback: fresh calculation (Market Screener not yet run)"
    });

    state.selectedMarket = built.selectedMarket;
    // Keep the ranking that produced this context — the scenario key includes
    // the leading markets, so it must be the same array the agents saw.
    state.rankedForKey = built.ranked;
    state.portfolioCtx = built.ctx;
  }

  // ─── Deterministic check panel ────────────────────────────────────────────

  /*
   * Shows every check, its verdict AND the figures it compared. A bare
   * "validation passed" badge asks the reader to take the system's word for it;
   * showing that city HHI 0.4130 was recomputed from ten holdings and matched
   * the context lets them check the claim themselves, which is the whole point
   * of making these checks deterministic.
   */
  function buildValidationPanel() {
    var v = state.validation;
    var div = document.createElement("div");
    div.className = "reit-section reit-validation-panel";

    var h = document.createElement("h2");
    h.textContent = "Deterministic Input Checks";
    div.appendChild(h);

    var intro = document.createElement("p");
    intro.className = "reit-validation-intro";
    intro.textContent = "Performed in code, before any model call. These eight checks are " +
      "arithmetic comparisons with one correct answer each, so they need no API key, " +
      "consume no quota, and give the same verdict every time for the same inputs. " +
      "They replace the Validation agent of the earlier six-agent design, whose verdict " +
      "on these same questions could be wrong.";
    div.appendChild(intro);

    var banner = document.createElement("p");
    banner.className = "reit-validation-summary " +
      (v.passed ? "reit-validation-pass" : "reit-validation-fail");
    banner.textContent = v.summary;
    div.appendChild(banner);

    var tbl = document.createElement("table");
    tbl.className = "reit-validation-table";
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["Check", "Result", "What was compared"].forEach(function (t) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = t;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    var tbody = document.createElement("tbody");
    (v.checks || []).forEach(function (c) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      th.textContent = c.label;
      tr.appendChild(th);

      var tdR = document.createElement("td");
      var badge = document.createElement("span");
      badge.className = "reit-check-badge reit-check-" + (c.passed ? "pass" : "fail");
      badge.textContent = c.passed ? "✓ Pass" : "✗ Fail";
      tdR.appendChild(badge);
      tr.appendChild(tdR);

      var tdD = document.createElement("td");
      tdD.className = "reit-validation-detail";
      tdD.textContent = c.detail;
      tr.appendChild(tdD);

      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    div.appendChild(tbl);

    if (v.limitations && v.limitations.length) {
      var lh = document.createElement("p");
      lh.className = "reit-validation-limits-title";
      lh.textContent = "Stated limitations of this analysis";
      div.appendChild(lh);

      var ln = document.createElement("p");
      ln.className = "reit-note";
      ln.textContent = "These are fixed properties of the method, not model output. " +
        "The earlier design asked an agent to list them, so their wording and membership " +
        "varied between runs and they disappeared entirely when the model was unreachable.";
      div.appendChild(ln);

      var ul = document.createElement("ul");
      ul.className = "reit-validation-limits";
      v.limitations.forEach(function (l) {
        var li = document.createElement("li");
        li.textContent = l;
        ul.appendChild(li);
      });
      div.appendChild(ul);
    }

    return div;
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

  /*
   * Whether pre-generated commentary exists for exactly the scenario on screen.
   * Without this the Run button required a live proxy, so on the static
   * deployment — where the proxy never exists — the cache could not be reached
   * at all and every visitor saw the button disabled.
   */
  function checkCacheMatch() {
    return loadAgentCache().then(function (scenarios) {
      var here = scenarios ? currentScenario() : null;
      state.cacheMatch = !!(here && scenarios[ScenarioKey.compute(here)]);
    }).catch(function () { state.cacheMatch = false; });
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

    /* The deterministic checks are shown whenever they have run, pass or fail,
     * and before the agent cards. They are the part of this page that does not
     * depend on a model being reachable, so they are also the part a reader
     * should see first. */
    if (state.validation) {
      root.appendChild(buildValidationPanel());
    }

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
      ["Evidence floor",    (function () {
        var g = state.portfolioCtx.governance;
        if (!g) { return "not evaluated"; }
        return g.eligibleSegmentCount + " of " + state.markets.length +
               " segments meet it (\u2265" + g.minObservations + " observations, grade " +
               g.minConfidenceGrade + "+)" + (g.overrideInEffect ? " — overridden" : "");
      }())],
      ["Target evidence",   (function () {
        var g = state.portfolioCtx.governance;
        if (!g || !g.selectedSegmentEvidence) { return "—"; }
        var e = g.selectedSegmentEvidence;
        return e.tier + " — grade " + (e.grade || "?") + ", " + e.observations + " observations" +
               (g.selectedSegmentMeetsFloor ? "" : " (below the floor)");
      }())],
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
      if (step.deterministic) {
        label.className += " reit-trail-deterministic";
        label.title = "Performed in code by validator.js. No Gemini call, no API quota, " +
                      "and the same inputs always give the same verdict.";
      }

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

    var live    = state.serverOnline === true && state.serverGemini;
    var canRun  = (live || state.cacheMatch) && !state.running;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reit-run-btn";
    /* Offline with a matching cache, the button says it will show stored
     * text, so it cannot be mistaken for a live call before it is pressed. */
    btn.textContent = state.running ? "Running agents…"
      : live ? "Run Agent Analysis"
      : state.cacheMatch ? "Show Pre-generated Analysis"
      : "Run Agent Analysis";
    btn.disabled = !canRun;
    if (!canRun && !state.running) {
      btn.title = state.serverOnline !== true
        ? "Backend offline and no pre-generated analysis matches this configuration — start the proxy server"
        : !state.serverGemini
        ? "Gemini API key not configured in server/.env"
        : "";
    }
    btn.addEventListener("click", function () { startAgentRun(); });
    div.appendChild(btn);

    var note = document.createElement("p");
    note.className = "reit-run-note";
    note.textContent = "All financial calculations are deterministic, and so are the eight " +
      "input checks that gate the recommendation. The " + AGENT_ORDER.length +
      " Gemini agents provide interpretation only — they do not recalculate, rank, " +
      "validate or change any value.";
    div.appendChild(note);

    return div;
  }

  // ─── Agent run sequence ───────────────────────────────────────────────────

  function startAgentRun() {
    state.running = true;
    state.trail      = [];
    state.results    = {};
    state.validation = null;
    TRAIL_STEPS.forEach(function (s) { state.trailStatus[s.id] = "pending"; });
    var root = document.getElementById(ROOT_ID);
    if (root) { render(root); }
    runSequence(root);
  }

  /*
   * The chain: three analysts, then the deterministic checks, then — only if
   * those pass — the Orchestrator.
   *
   * Each analyst sees the outputs of the analysts before it, as before. The
   * difference from the previous six-agent version is where the gate sits. It
   * used to be a model's opinion of whether the inputs were sound; it is now
   * eight arithmetic comparisons with one correct answer each, so the gate
   * cannot be wrong, cannot fail because an API was busy, and reports the
   * numbers it compared when it does fail.
   */
  function runSequence(root) {
    var ctx = state.portfolioCtx;

    setTrailStatus("data", "running", root);
    callAgent("dataStatistical", ctx, function (dsRes) {
      state.results.dataStatistical = dsRes;
      setTrailStatus("data", dsRes.error ? "failed" : "completed", root);

      var screenCtx = Object.assign({}, ctx, {
        dataStatisticalOutput: dsRes.output || null
      });

      setTrailStatus("screening", "running", root);
      callAgent("marketScreening", screenCtx, function (mktRes) {
        state.results.marketScreening = mktRes;
        setTrailStatus("screening", mktRes.error ? "failed" : "completed", root);

        var riskCtx = Object.assign({}, ctx, {
          dataStatisticalOutput: dsRes.output  || null,
          marketScreeningOutput: mktRes.output || null
        });

        setTrailStatus("simulation", "running", root);
        callAgent("portfolioRisk", riskCtx, function (riskRes) {
          state.results.portfolioRisk = riskRes;
          setTrailStatus("simulation", riskRes.error ? "failed" : "completed", root);

          // ── Deterministic gate. No model, no network, no quota. ──
          setTrailStatus("validation", "running", root);
          var validation = runDeterministicChecks();
          state.validation = validation;
          setTrailStatus("validation", validation.passed ? "completed" : "failed", root);

          if (!validation.passed) {
            /* The Orchestrator is not called. This is not a failure of the AI
             * layer and must not be reported as one: the inputs themselves did
             * not reconcile, and a recommendation built on inputs that do not
             * reconcile would be worthless however fluently it were written. */
            setTrailStatus("recommend", "failed", root);
            state.results.orchestrator = {
              output: null,
              provenance: "deterministic",
              error: "No recommendation was synthesised. " + validation.summary +
                     " These are arithmetic checks on the analysis inputs, not AI " +
                     "judgements — see the panel above for what was compared."
            };
            finishRun(root);
            return;
          }

          setTrailStatus("recommend", "running", root);
          var orchCtx = Object.assign({}, ctx, {
            dataStatisticalOutput: dsRes.output   || null,
            marketScreeningOutput: mktRes.output  || null,
            portfolioRiskOutput:   riskRes.output || null,
            deterministicValidation: {
              passed:  validation.passed,
              summary: validation.summary,
              checks:  validation.checks.map(function (c) {
                return { label: c.label, passed: c.passed, detail: c.detail };
              }),
              limitations: validation.limitations
            }
          });
          callAgent("orchestrator", orchCtx, function (orchRes) {
            // Headline score, yield and amount come from the engine, not the model.
            if (orchRes && orchRes.output) {
              orchRes.output = AgentContext.applyDeterministicFigures(orchRes.output, ctx);
            }
            state.results.orchestrator = orchRes;
            setTrailStatus("recommend", orchRes.error ? "failed" : "completed", root);
            finishRun(root);
          });
        });
      });
    });
  }

  /**
   * Run validator.js against the context the agents were given.
   *
   * Deliberately validates the SAME object that is sent to the models, not a
   * freshly built one. Validating a different object would test the validator
   * rather than the analysis.
   */
  function runDeterministicChecks() {
    if (typeof Validator === "undefined") {
      return {
        passed: false,
        checks: [],
        failed: [],
        limitations: [],
        summary: "validator.js is not loaded, so the deterministic checks could not run. " +
                 "The Orchestrator is not called without them."
      };
    }
    return Validator.validate({
      context:   state.portfolioCtx,
      ranked:    state.rankedForKey || [],
      assets:    state.assets,
      hhiEngine: typeof HHIEngine !== "undefined" ? HHIEngine : null
    });
  }

  /**
   * Publish the run so the Decision Report can include it.
   *
   * report.js reads window._reitAgentOutputs. Nothing ever wrote it, so
   * section 5 of the report said "No agent output available" even directly
   * after a successful run. It is written here, keyed by the current agent
   * names, with the orchestrator also exposed under its own key because that
   * is the shape the report consumes.
   */
  function finishRun(root) {
    state.running = false;

    var published = {};
    Object.keys(state.results).forEach(function (k) {
      var r = state.results[k];
      if (r && r.output) { published[k] = r.output; }
    });
    published._provenance = {};
    Object.keys(state.results).forEach(function (k) {
      var r = state.results[k];
      published._provenance[k] = r ? (r.provenance || (r.offline ? "deterministic" : "live")) : null;
    });
    published._validation = state.validation;
    window._reitAgentOutputs = published;

    if (root) { render(root); }
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
      .then(function (j) { _agentCache = (j && j.scenarios) || false; return _agentCache; })
      .catch(function () { _agentCache = false; return false; });
    return _agentCachePending;
  }

  /**
   * Describe the scenario currently on screen, for cache matching.
   * Returns null if the scenario-key module or its inputs are unavailable, in
   * which case no cache will be served — failing closed rather than open.
   */
  function currentScenario() {
    if (typeof ScenarioKey === "undefined") { return null; }
    var ctx = state.portfolioCtx;
    if (!ctx) { return null; }
    try {
      return ScenarioKey.describe({
        marketsDoc:       state.marketsDoc || null,
        assets:           state.assets,
        weights:          ctx.weights,
        investmentCr:     ctx.investmentCr,
        selectedTargetId: ctx.selectedTarget ? ctx.selectedTarget.marketId : null,
        ranked:           state.rankedForKey || []
      });
    } catch (e) { return null; }
  }

  /**
   * Resolve one agent from cache — but ONLY when the cached scenario matches
   * the scenario on screen in every respect.
   *
   * This is the guard that stops the app presenting commentary about a market
   * the table no longer recommends. Changing the weights, the investment
   * amount, the selected target, the portfolio or the dataset all produce a
   * different scenario key, and therefore a miss.
   *
   * Returns:
   *   { ...payload, provenance: "cache" }  on an exact match
   *   { mismatch: [fields] }               when a cache exists but for another scenario
   *   null                                 when nothing is cached at all
   */
  function cachedAgent(agentType) {
    return loadAgentCache().then(function (scenarios) {
      if (!scenarios) { return null; }
      var here = currentScenario();
      if (!here) { return null; }
      var key = ScenarioKey.compute(here);
      var entry = scenarios[key];

      if (!entry || !entry.agents || !entry.agents[agentType]) {
        // A cache exists but not for this scenario. Report which inputs differ,
        // using the nearest stored scenario, so the UI can explain the miss.
        var names = Object.keys(scenarios);
        var why = ["this configuration has no cached analysis"];
        if (names.length) {
          var d = ScenarioKey.diff(scenarios[names[0]].descriptor, here);
          if (d.length) { why = d; }
        }
        return { mismatch: why };
      }

      var c = entry.agents[agentType];
      return {
        output:     c.output,
        model:      c.model,
        error:      null,
        fromCache:  true,
        provenance: "cache",
        cachedAt:   c.cachedAt,
        scenarioLabel: entry.label || null
      };
    });
  }

  /*
   * Three, and only three, possible provenances for what a card shows:
   *
   *   "live"            a Gemini call made just now for this exact scenario
   *   "cache"           stored commentary whose scenario key matches exactly
   *   "deterministic"   no AI interpretation; the deterministic figures stand alone
   *
   * There is deliberately no fourth state in which commentary from a different
   * scenario is displayed. A confidently-worded paragraph about the wrong
   * market is more damaging than no paragraph at all.
   */
  function offlineResult(mismatchFields) {
    return {
      output: null,
      provenance: "deterministic",
      offline: true,
      mismatch: mismatchFields || null,
      error: mismatchFields && mismatchFields.length
        ? "No AI interpretation for this configuration — it differs from the stored analysis by: " +
          mismatchFields.join(", ") + ". The deterministic results below are unaffected."
        : "AI explanation unavailable — backend offline or Gemini API key not set. Deterministic results are still valid."
    };
  }

  function callAgent(agentType, context, callback) {
    if (state.serverOnline !== true || !state.serverGemini) {
      cachedAgent(agentType).then(function (hit) {
        if (hit && hit.provenance === "cache") { return callback(hit); }
        callback(offlineResult(hit && hit.mismatch));
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
      callback({ output: data.output, model: data.model, error: null, provenance: "live" });
    }).catch(function (err) {
      // A live call that fails (quota exhausted, connection dropped) falls back
      // to the cached reply rather than leaving the card blank.
      cachedAgent(agentType).then(function (hit) {
        if (hit && hit.provenance === "cache") {
          hit.liveError = err.message;
          return callback(hit);
        }
        var res = offlineResult(hit && hit.mismatch);
        res.error = "AI explanation unavailable: " + err.message +
                    (hit && hit.mismatch ? " (and no cached analysis matches this configuration)" : "");
        callback(res);
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
     * Every card states its own provenance. The reader should never have to
     * guess whether a paragraph came from a live model call, from storage, or
     * whether there is no AI interpretation at all.
     */
    var prov = res.provenance ||
               (res.fromCache ? "cache" : (res.offline ? "deterministic" : "live"));
    var banner = document.createElement("p");

    if (prov === "live") {
      banner.className = "reit-prov-banner reit-prov-live";
      banner.textContent = "Live Gemini interpretation — generated just now for this exact configuration" +
        (res.model ? " using " + res.model + "." : ".");
      card.appendChild(banner);

    } else if (prov === "cache") {
      var when = "";
      try { when = res.cachedAt ? new Date(res.cachedAt).toLocaleString() : ""; }
      catch (e) { when = res.cachedAt || ""; }
      banner.className = "reit-prov-banner reit-prov-cache";
      banner.textContent = "Matching cached interpretation" +
        (res.scenarioLabel ? " (" + res.scenarioLabel + ")" : "") +
        (when ? ", generated " + when : "") +
        " — every input matches the stored analysis" +
        (res.liveError ? "; the live call failed (" + res.liveError + ")." : ".") +
        " This is stored text, not a live model call.";
      card.appendChild(banner);

    } else if (prov === "deterministic") {
      banner.className = "reit-prov-banner reit-prov-deterministic";
      banner.textContent = res.mismatch && res.mismatch.length
        ? "Deterministic output only. No AI interpretation is shown because this " +
          "configuration differs from the stored analysis by: " + res.mismatch.join(", ") +
          ". Commentary written for a different configuration is deliberately not displayed."
        : "Deterministic output only. The Gemini proxy is unavailable and no cached " +
          "analysis matches this configuration.";
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
  var HIDDEN_KEYS = { disclaimer: true, _model: true, syntheticDisclaimer: true, _modelFigures: true };

  // Short scalar values the Orchestrator returns that read better as a row of
  // headline figures than as ordinary labelled paragraphs.
  var HEADLINE_KEYS = ["selectedTarget", "investmentAmount", "compositeScore", "expectedYieldPct"];

  /* Keys that render as a pass/fail badge. Kept generic: no current agent
   * returns a pass/fail field, but a cached reply from the earlier design
   * still renders legibly rather than as the bare word "pass". */
  var CHECK_KEYS = { weightCheck: true, scoreRangeCheck: true, hhiConsistency: true };

  // Human-friendly label overrides
  var FIELD_LABELS = {
    overallQuality:          "Overall Data Quality",
    dispersionNotes:         "Dispersion and Spread",
    dominantFactor:          "Largest Contributing Factor",
    runnerUpComparison:      "How the Runner-Up Differs",
    evidenceNote:            "Evidence Basis for the Recommendation",
    evidenceBasis:           "Evidence Basis",
    residualConcentration:   "Concentration Remaining After Investment",
    scenarioInterpretation:  "What the Scenarios Imply",
    projectionCaveats:       "Projection Caveats",
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
    /* The five labels for the retired Validation agent's output fields
     * (weightCheck, scoreRangeCheck, targetExists, hhiConsistency,
     * validatedOk) were removed with it. No agent returns those keys now:
     * the checks are performed by validator.js and rendered by
     * buildValidationPanel(), which labels each check from the check itself. */
    dataQuality:             "Data Quality Note",
    inconsistencies:         "Inconsistencies Found",
    limitations:             "Limitations",
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
      if (headline.indexOf("expectedYieldPct") !== -1 || headline.indexOf("compositeScore") !== -1) {
        var src = document.createElement("p");
        src.className = "reit-output-stat-source";
        src.textContent = "Score, gross yield and amount are taken from the deterministic engine, " +
          "not from the model.";
        div.appendChild(src);
      }
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

      // Boolean
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

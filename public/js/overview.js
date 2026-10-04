/**
 * overview.js — Executive Overview, the application's landing page
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * The application opened on Portfolio Analysis, which is a detail page. A
 * reader arriving for the first time was shown ten synthetic holdings with no
 * statement of what the system is for, what the dataset is, what it had
 * concluded, or what it is not allowed to be used for. The analysis existed
 * but nothing presented it.
 *
 * This page answers four questions in order, before any detail:
 *
 *   1. What is this, and what is the data?        (canonical facts)
 *   2. What has it concluded, on what evidence?   (the current run)
 *   3. Where do I look next?                      (the route map)
 *   4. What must I not do with it?                (the limits)
 *
 * It computes nothing of its own. Every figure is read from the shared run
 * written by the Market Screener, or derived through AppMeta from the data
 * files, so this page cannot state a number that disagrees with the page the
 * number came from. When the screener has not run, it says so rather than
 * quietly showing defaults that look like results.
 *
 * Depends on: appMeta.js, stateManager.js, governance.js, scoringEngine.js,
 *             hhi.js, uiHelpers.js
 */

(function () {
  "use strict";

  var ROOT_ID = "overview-content";

  var data = {
    marketsDoc:    null,
    portfolioDoc:  null,
    statisticsDoc: null,
    counts:        null,
    loaded:        false,
    error:         null
  };

  // ─── Small builders ────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }

  function card(label, value, sub, cls) {
    var c = el("div", "reit-ov-card" + (cls ? " " + cls : ""));
    c.appendChild(el("div", "reit-ov-card-label", label));
    c.appendChild(el("div", "reit-ov-card-value", value));
    if (sub) { c.appendChild(el("div", "reit-ov-card-sub", sub)); }
    return c;
  }

  function section(title, introText) {
    var s = el("section", "reit-section reit-ov-section");
    s.appendChild(el("h2", null, title));
    if (introText) { s.appendChild(el("p", "reit-ov-intro", introText)); }
    return s;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    root.innerHTML = "";
    root.appendChild(el("p", "loading-msg", "Loading overview…"));

    Promise.all([
      fetch("data/markets.json").then(function (r) { return r.json(); }),
      fetch("data/portfolio.json").then(function (r) { return r.json(); }),
      fetch("data/statistics.json").then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
    ]).then(function (res) {
      data.marketsDoc    = res[0];
      data.portfolioDoc  = res[1];
      data.statisticsDoc = res[2];
      data.counts = AppMeta.derive({
        marketsDoc:    data.marketsDoc,
        portfolioDoc:  data.portfolioDoc,
        statisticsDoc: data.statisticsDoc
      });
      data.loaded = true;
      render();
    }).catch(function (err) {
      data.error = "Could not load the dataset: " + err.message;
      render();
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function render() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    root.innerHTML = "";

    if (data.error) {
      root.appendChild(el("p", "error-msg", data.error));
      return;
    }
    if (!data.loaded) {
      root.appendChild(el("p", "loading-msg", "Loading overview…"));
      return;
    }

    root.appendChild(buildWhatThisIs());
    root.appendChild(buildCurrentRun());
    root.appendChild(buildRouteMap());
    root.appendChild(buildLimits());
    root.appendChild(buildResetBar());
  }

  // ─── 1. What this is ───────────────────────────────────────────────────────

  function buildWhatThisIs() {
    var c = data.counts;
    var s = section("What this is",
      AppMeta.PROJECT.appName + " ranks synthetic REIT target market segments against a " +
      "synthetic portfolio, using a deterministic scoring engine. " + c.agentCount +
      " Gemini agents explain the results; they do not compute them, and the checks that " +
      "gate the recommendation are performed in code rather than by a model. " +
      AppMeta.attribution() + ".");

    var grid = el("div", "reit-ov-grid");
    grid.appendChild(card("Market segments", AppMeta.num(c.marketCount),
      c.cityCount + " cities · " + c.propertyTypeCount + " property types"));
    grid.appendChild(card("Simulated observations", AppMeta.num(c.observationCount),
      c.observationsPerMarketMin + "–" + c.observationsPerMarketMax + " per segment"));
    grid.appendChild(card("Portfolio", AppMeta.cr(c.portfolioValueRs, 0),
      c.assetCount + " holdings · " + (c.portfolioWeightedYield * 100).toFixed(2) +
      "% weighted gross yield"));
    grid.appendChild(card("Planted anomalies",
      c.plantedAnomalies === null ? "—" : AppMeta.num(c.plantedAnomalies),
      c.contaminationPct === null ? "ground truth held separately"
        : c.contaminationPct + "% contamination, ground truth held separately"));
    s.appendChild(grid);

    var prov = el("p", "reit-ov-provenance");
    prov.textContent = "Dataset: generator " + c.generatorVersion + ", seed " + c.seed +
      ", as of " + c.dataAsOf + ". Scoring methodology " + c.methodologyVersion +
      ". Every figure on this page is derived from the data files, not written by hand " +
      "— see docs/CANONICAL_FACTS.md.";
    s.appendChild(prov);

    return s;
  }

  // ─── 2. The current run ────────────────────────────────────────────────────

  function buildCurrentRun() {
    var run = (typeof ReitState !== "undefined") ? ReitState.load() : null;

    if (!run) {
      var s0 = section("Current analysis",
        "No analysis has been run in this browser yet.");
      var p = el("p", "reit-ov-empty",
        "Open the Market Screener to score the " + data.counts.marketCount +
        " segments against the portfolio. Nothing is shown here until you do, because " +
        "default figures presented on this page would read as results.");
      s0.appendChild(p);
      s0.appendChild(linkButton("Go to Market Screener", "screener"));
      return s0;
    }

    var s = section("Current analysis",
      run.stale
        ? "This run is marked out of date because an input changed after it was computed. " +
          "Re-run the Market Screener before relying on it."
        : "Computed by the Market Screener. Every page in this application reads these " +
          "same figures.");

    if (run.stale) {
      s.appendChild(el("p", "reit-stale-banner",
        "⚠ Out of date — re-run the Market Screener."));
    }

    var ranked = run.ranked || [];
    var target = null;
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].marketId === run.selectedTargetId) { target = ranked[i]; break; }
    }

    var grid = el("div", "reit-ov-grid");

    if (target) {
      var gov = (typeof Governance !== "undefined") ? Governance.evaluate(target) : null;
      grid.appendChild(card("Recommended target",
        (target.locality || target.marketId) + ", " + target.city,
        target.propertyType + " · rank " + target.rank + " of " + ranked.length));
      grid.appendChild(card("Composite score",
        (typeof target.totalScore === "number" ? target.totalScore.toFixed(1) : "—") + " / 100",
        "Attractiveness on the five weighted factors"));
      grid.appendChild(card("Evidence",
        gov ? gov.tier : "—",
        gov ? ("grade " + (gov.grade || "?") + ", " + gov.observations + " observations" +
               (gov.eligible ? " — meets the floor" : " — below the floor")) : "",
        gov && !gov.eligible ? "reit-ov-card-warn" : "reit-ov-card-ok"));
    } else {
      grid.appendChild(card("Recommended target", "none",
        run.governanceNote || "No segment met the evidence floor."));
    }

    grid.appendChild(card("Investment", AppMeta.cr((run.investmentCr || 0) * 1e7, 2),
      presetLabel(run.weightPreset) + " weights"));

    if (typeof run.cityHHIBefore === "number" && typeof run.cityHHIAfter === "number") {
      grid.appendChild(card("City concentration",
        run.cityHHIBefore.toFixed(4) + " → " + run.cityHHIAfter.toFixed(4),
        hhiVerdict(run.cityHHIBefore, run.cityHHIAfter)));
    }
    if (typeof run.typeHHIBefore === "number" && typeof run.typeHHIAfter === "number") {
      grid.appendChild(card("Asset-type concentration",
        run.typeHHIBefore.toFixed(4) + " → " + run.typeHHIAfter.toFixed(4),
        hhiVerdict(run.typeHHIBefore, run.typeHHIAfter)));
    }

    s.appendChild(grid);

    /* The governance outcome in words. This is the part a reader is most
     * likely to misread — a recommendation that is not rank 1 looks like a
     * mistake until the reason is stated — so it is stated here, on the
     * landing page, not only on the screener. */
    if (run.governanceNote) {
      var note = el("p", "reit-ov-gov-note" +
        (run.targetMeetsFloor === false ? " reit-ov-gov-warn" : ""));
      note.textContent = run.governanceNote;
      s.appendChild(note);
    }
    if (run.governanceOverride) {
      s.appendChild(el("p", "reit-ov-gov-warn",
        "The evidence floor is currently overridden, so the recommendation is the " +
        "highest-scoring segment regardless of how well it is evidenced."));
    }
    if (run.userOverrodeTarget) {
      s.appendChild(el("p", "reit-ov-gov-note",
        "The target was chosen manually and differs from the segment the evidence " +
        "floor would have recommended."));
    }

    s.appendChild(buildRunnerUp(ranked, target));
    s.appendChild(linkButton("Open the Decision Report", "report"));
    return s;
  }

  /**
   * Target against runner-up.
   *
   * A single recommendation invites the question "compared with what?", and the
   * screener's fifty-row table does not answer it: the reader has to hold two
   * rows in mind and subtract. This puts the two side by side and names the
   * factors on which each is stronger, which is the comparison an examiner is
   * most likely to ask for.
   */
  function buildRunnerUp(ranked, target) {
    var wrap = el("div", "reit-ov-compare");
    if (!target || ranked.length < 2) { return wrap; }

    var runnerUp = null;
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].marketId !== target.marketId) { runnerUp = ranked[i]; break; }
    }
    if (!runnerUp) { return wrap; }

    wrap.appendChild(el("h3", null, "Target against the next-best segment"));
    wrap.appendChild(el("p", "reit-note",
      "The runner-up is the highest-scoring segment other than the target. " +
      "A difference of a point or two on a 0–100 composite is not a meaningful " +
      "separation; the factor rows below show where the two actually differ."));

    var tbl = document.createElement("table");
    tbl.className = "reit-compare-table";

    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["Measure",
     (target.locality || target.marketId) + " (target)",
     (runnerUp.locality || runnerUp.marketId) + " (runner-up)",
     "Difference"].forEach(function (h) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    function govOf(m) {
      return (typeof Governance !== "undefined") ? Governance.evaluate(m) : null;
    }
    var tg = govOf(target), rg = govOf(runnerUp);

    var rows = [
      ["Composite score", num(target.totalScore, 1), num(runnerUp.totalScore, 1),
       delta(target.totalScore, runnerUp.totalScore, 1)],
      ["Gross yield", pct(target.grossYield), pct(runnerUp.grossYield),
       delta(target.grossYield * 100, runnerUp.grossYield * 100, 2) + "pp"],
      ["Rental growth", pct(target.annualRentalGrowthRatio), pct(runnerUp.annualRentalGrowthRatio),
       delta(target.annualRentalGrowthRatio * 100, runnerUp.annualRentalGrowthRatio * 100, 2) + "pp"],
      ["Demand score", num(target.demandScore, 0), num(runnerUp.demandScore, 0),
       delta(target.demandScore, runnerUp.demandScore, 0)],
      ["Risk score (lower is better)", num(target.riskScore, 1), num(runnerUp.riskScore, 1),
       delta(target.riskScore, runnerUp.riskScore, 1)],
      ["Observations", String(target.observationCount || "—"), String(runnerUp.observationCount || "—"),
       delta(target.observationCount, runnerUp.observationCount, 0)],
      ["Confidence grade", target.confidenceGrade || "—", runnerUp.confidenceGrade || "—", "—"],
      ["Evidence tier", tg ? tg.tier : "—", rg ? rg.tier : "—", "—"],
      ["City", target.city || "—", runnerUp.city || "—",
       target.city === runnerUp.city ? "same city" : "different cities"],
      ["Property type", target.propertyType || "—", runnerUp.propertyType || "—",
       target.propertyType === runnerUp.propertyType ? "same type" : "different types"]
    ];

    var tbody = document.createElement("tbody");
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      th.textContent = r[0];
      tr.appendChild(th);
      r.slice(1).forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    /* Diversification is the one factor on which "different city" and
     * "different type" are the whole story, so it is called out rather than
     * left for the reader to infer from the two rows above. */
    if (target.city !== runnerUp.city || target.propertyType !== runnerUp.propertyType) {
      wrap.appendChild(el("p", "reit-note",
        "Because the two sit in different " +
        (target.city !== runnerUp.city ? "cities" : "property types") +
        ", they affect portfolio concentration differently — see the Diversification page " +
        "for the before-and-after figures for each."));
    }

    return wrap;
  }

  function num(v, dp) {
    return typeof v === "number" && isFinite(v) ? v.toFixed(dp) : "—";
  }
  function pct(ratio) {
    return typeof ratio === "number" && isFinite(ratio) ? (ratio * 100).toFixed(2) + "%" : "—";
  }
  function delta(a, b, dp) {
    if (typeof a !== "number" || typeof b !== "number" || !isFinite(a) || !isFinite(b)) {
      return "—";
    }
    var d = a - b;
    return (d > 0 ? "+" : "") + d.toFixed(dp);
  }

  function hhiVerdict(before, after) {
    var d = after - before;
    var level = after < 0.15 ? "diversified" : (after < 0.25 ? "moderate" : "concentrated");
    if (d < -0.0001) { return "improves by " + Math.abs(d).toFixed(4) + ", still " + level; }
    if (d >  0.0001) { return "worsens by " + d.toFixed(4) + ", " + level; }
    return "unchanged, " + level;
  }

  function presetLabel(key) {
    if (typeof ScoringEngine !== "undefined" && ScoringEngine.PRESETS &&
        ScoringEngine.PRESETS[key]) {
      return ScoringEngine.PRESETS[key].label;
    }
    return key === "custom" ? "Custom" : (key || "Balanced");
  }

  // ─── 3. Route map ──────────────────────────────────────────────────────────

  function linkButton(text, page) {
    var a = document.createElement("a");
    a.className = "reit-ov-link-btn";
    a.href = "#" + page;
    a.textContent = text;
    return a;
  }

  function buildRouteMap() {
    var s = section("Where to look",
      "The pages below follow the order the analysis runs in.");
    var list = el("ol", "reit-ov-routes");

    [
      ["portfolio", "Portfolio Analysis",
       "The " + data.counts.assetCount + " synthetic holdings the analysis starts from."],
      ["screener", "Market Screener",
       "Scores and ranks all " + data.counts.marketCount + " segments. Filters, the " +
       "evidence floor, and the per-segment observation distributions live here."],
      ["diversification", "Diversification",
       "What the investment does to geographic and asset-class concentration."],
      ["statsdash", "Statistical Analysis",
       "The whole " + AppMeta.num(data.counts.observationCount) + "-record dataset: " +
       "distributions, correlation structure, regression, and anomaly-detection " +
       "performance measured against known ground truth."],
      ["agents", "Agent Output",
       data.counts.agentCount + " Gemini agents interpreting the figures, plus the " +
       "deterministic checks that gate the recommendation."],
      ["datacentre", "Data Centre",
       "Provenance, the cleaning pipeline, and the evidence behind each segment."],
      ["report", "Decision Report",
       "The whole chain in one printable document."]
    ].forEach(function (r) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + r[0];
      a.textContent = r[1];
      a.className = "reit-ov-route-link";
      li.appendChild(a);
      li.appendChild(el("span", "reit-ov-route-desc", " — " + r[2]));
      list.appendChild(li);
    });

    s.appendChild(list);
    return s;
  }

  // ─── 4. Limits ─────────────────────────────────────────────────────────────

  function buildLimits() {
    var s = section("What this cannot be used for", AppMeta.PROJECT.syntheticNotice);

    var list = el("ul", "reit-ov-limits");
    var limits = (typeof Validator !== "undefined" && Validator.LIMITATIONS)
      ? Validator.LIMITATIONS
      : ["All data is synthetic."];
    limits.forEach(function (l) {
      list.appendChild(el("li", null, l));
    });
    s.appendChild(list);

    s.appendChild(el("p", "reit-ov-limits-note",
      "This list is fixed in code (validator.js), not generated by a model, so it cannot " +
      "vary between runs or disappear when the API is unreachable."));
    return s;
  }

  // ─── Reset ─────────────────────────────────────────────────────────────────

  /*
   * Reset Demo exists because the application remembers deliberately: weights,
   * investment amount, selected target and the evidence-floor override all
   * persist in localStorage so a reload does not discard the user's work. That
   * is right for a working session and wrong for a demonstration, where the
   * previous viewer's settings would silently shape what the next one sees.
   *
   * It clears only this application's own state, and it asks first, because the
   * action discards work and cannot be undone.
   */
  function buildResetBar() {
    var wrap = el("div", "reit-ov-reset");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reit-ov-reset-btn";
    btn.textContent = "Reset demo";
    btn.addEventListener("click", function () {
      if (btn.getAttribute("data-confirming") === "yes") {
        doReset();
        return;
      }
      btn.setAttribute("data-confirming", "yes");
      btn.textContent = "Click again to confirm reset";
      btn.className = "reit-ov-reset-btn reit-ov-reset-confirm";
    });
    wrap.appendChild(btn);

    wrap.appendChild(el("p", "reit-ov-reset-note",
      "Clears the saved weights, investment amount, selected target and evidence-floor " +
      "override, then reloads with the defaults. Affects only this browser; the dataset " +
      "and the documents are untouched."));
    return wrap;
  }

  function doReset() {
    try {
      if (typeof ReitState !== "undefined") { ReitState.clear(); }
    } catch (e) { /* storage may be unavailable; the reload still helps */ }
    try {
      delete window._reitAgentOutputs;
    } catch (e) { window._reitAgentOutputs = undefined; }

    if (typeof showToast === "function") {
      showToast("Demo reset — reloading with default settings.");
    }
    window.location.hash = "overview";
    window.location.reload();
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  function refreshIfVisible() {
    var page = document.getElementById("page-overview");
    if (page && page.classList.contains("page-active") && data.loaded) { render(); }
  }

  function boot() {
    init();
    /* Re-render on navigation back to this page: the run summary is read from
     * shared state, which the screener may have rewritten in the meantime. */
    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#overview" || window.location.hash === "") {
        refreshIfVisible();
      }
    });
    var observer = new MutationObserver(refreshIfVisible);
    var main = document.getElementById("main-content");
    if (main) {
      observer.observe(main, { subtree: true, attributes: true, attributeFilter: ["class"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

}());

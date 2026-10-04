/**
 * overview.js — Executive Overview, the application's landing page
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Answers four questions in order, before any detail:
 *
 *   1. What is this, and what is the data?        (canonical facts)
 *   2. What does the current analysis show?       (the shared run)
 *   3. Where do I look next?                      (the route map)
 *   4. What must I not do with it?                (the limits)
 *
 * It computes nothing of its own. The current analysis is the shared run from
 * analysisRun.js — the same object every other page renders — so this page
 * cannot name a different target from the Screener, Diversification, the
 * Agents page or the Report. The run is computed as soon as the data loads,
 * so the Overview no longer depends on the Screener having been opened first.
 *
 * Depends on: appMeta.js, analysisRun.js, governance.js, validator.js, uiHelpers.js
 */

(function () {
  "use strict";

  var ROOT_ID = "overview-content";

  var view = {
    counts:     null,
    loaded:     false,
    error:      null,
    confirming: false,      // Reset Demo confirmation panel open
    resetDone:  false       // show the post-reset status once
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

  function section(title, introText, id) {
    var s = el("section", "reit-section reit-ov-section");
    var h = el("h2", null, title);
    if (id) { h.id = id; h.setAttribute("tabindex", "-1"); }
    s.appendChild(h);
    if (introText) { s.appendChild(el("p", "reit-ov-intro", introText)); }
    return s;
  }

  function link(text, href, external) {
    var a = el("a", null, text);
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener"; }
    return a;
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  /* A visible skeleton rather than a blank area while the data loads, so the
   * page never looks empty or finished before it is. */
  function skeleton(root) {
    root.innerHTML = "";
    var wrap = el("div", "reit-skeleton-wrap");
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    wrap.appendChild(el("span", "reit-sr-only", "Loading the overview…"));
    for (var i = 0; i < 3; i++) {
      var block = el("div", "reit-skeleton-block");
      block.setAttribute("aria-hidden", "true");
      block.appendChild(el("div", "reit-skeleton-line reit-skeleton-title"));
      var grid = el("div", "reit-skeleton-grid");
      for (var j = 0; j < 4; j++) { grid.appendChild(el("div", "reit-skeleton-card")); }
      block.appendChild(grid);
      wrap.appendChild(block);
    }
    root.appendChild(wrap);
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    skeleton(root);

    AnalysisRun.ready().then(function () {
      var d = AnalysisRun.data();
      view.counts = AppMeta.derive({
        marketsDoc:    d.marketsDoc,
        portfolioDoc:  d.portfolioDoc,
        statisticsDoc: d.statisticsDoc
      });
      view.loaded = true;
      render();
    }).catch(function (err) {
      view.error = "Could not load the dataset: " + err.message + ". Reload the page to try again.";
      render();
    });

    AnalysisRun.subscribe(function () { if (view.loaded) { render(); } });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function render() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }

    if (view.error) {
      root.innerHTML = "";
      var e = el("p", "error-msg", view.error);
      e.setAttribute("role", "alert");
      root.appendChild(e);
      return;
    }
    if (!view.loaded) { skeleton(root); return; }

    root.innerHTML = "";
    root.appendChild(buildWhatThisIs());
    root.appendChild(buildCurrentRun(AnalysisRun.current()));
    root.appendChild(buildRouteMap());
    root.appendChild(buildLimits());
    root.appendChild(buildResetBar());
  }

  // ─── 1. What this is ───────────────────────────────────────────────────────

  function buildWhatThisIs() {
    var c = view.counts;
    var s = section("What this is",
      AppMeta.PROJECT.appName + " ranks synthetic REIT target market segments against a " +
      "synthetic portfolio, using a deterministic scoring engine. " + c.agentCount +
      " Gemini agents explain the results; they do not compute, rank or validate them. " +
      AppMeta.attribution() + ".");

    var grid = el("div", "reit-ov-grid");
    grid.appendChild(card("Market segments", AppMeta.num(c.marketCount),
      c.cityCount + " cities · " + c.propertyTypeCount + " property types"));
    grid.appendChild(card("Simulated market observations", AppMeta.num(c.observationCount),
      c.observationsPerMarketMin + "–" + c.observationsPerMarketMax + " per segment"));
    grid.appendChild(card("Portfolio", AppMeta.cr(c.portfolioValueRs, 0),
      c.assetCount + " holdings · " + (c.portfolioWeightedYield * 100).toFixed(2) +
      "% weighted gross yield"));
    grid.appendChild(card("Known synthetic anomalies",
      c.plantedAnomalies === null ? "—" : AppMeta.num(c.plantedAnomalies),
      c.contaminationPct === null ? "inserted by the generator; ground truth held separately"
        : c.contaminationPct + "% of observations, inserted by the generator; ground truth held separately"));
    s.appendChild(grid);

    var prov = el("p", "reit-ov-provenance");
    prov.appendChild(document.createTextNode(
      "Dataset: generator " + c.generatorVersion + ", seed " + c.seed + ", as of " + c.dataAsOf +
      ". Scoring methodology " + c.methodologyVersion + ". Every figure on this page is derived " +
      "from the data files, not written by hand — see "));
    prov.appendChild(link("docs/CANONICAL_FACTS.md", AppMeta.docUrl("docs/CANONICAL_FACTS.md"), true));
    prov.appendChild(document.createTextNode(" in the repository."));
    s.appendChild(prov);
    return s;
  }

  // ─── 2. The current analysis ───────────────────────────────────────────────

  function buildCurrentRun(run) {
    var s = section("Current analysis",
      "The shared analysis every page renders: " + run.presetLabel + ", " +
      AppMeta.cr(run.investmentRs, 2) + ", " + run.portfolio.source + " portfolio, " +
      (run.selectionMode === "manual" ? "manual selection" : "automatic selection") + ".",
      "ov-current-analysis");

    if (view.resetDone) {
      var done = el("p", "reit-ov-reset-status",
        "✓ Demo reset — sample portfolio, Balanced preset, " + AppMeta.cr(run.investmentRs, 2) +
        ", simulation-support screen applied, automatic selection, no filters.");
      done.setAttribute("role", "status");
      s.appendChild(done);
    }

    if (run.portfolio.note) { s.appendChild(el("p", "reit-ov-gov-note", run.portfolio.note)); }

    var target = AnalysisRun.selected(run);
    var grid = el("div", "reit-ov-grid");

    if (target) {
      var gov = target.governance;
      var tc = card(AnalysisRun.targetLabel(run),
        AnalysisRun.name(target),
        target.propertyType + " · raw rank " + target.rank + " of " + run.ranked.length +
        (target.eligibleRank ? " · eligible rank " + target.eligibleRank : ""));
      tc.setAttribute("data-target-id", target.marketId);
      tc.setAttribute("data-selection-mode", run.selectionMode);
      grid.appendChild(tc);
      grid.appendChild(card("Composite attractiveness score",
        target.totalScore.toFixed(2) + " / 100",
        "Five weighted factors — " + run.presetLabel));
      grid.appendChild(card("Simulation support",
        (gov.eligible ? "✓ Passes screen" : "✗ Fails screen") + " · " + gov.tier,
        target.observationCount + " simulated observations · Assumption Support Grade " + (gov.grade || "—"),
        gov.eligible ? "reit-ov-card-ok" : "reit-ov-card-warn"));
      grid.appendChild(card("External calibration", target.externalCalibrationStatus,
        "No cited source located or traced", "reit-ov-card-warn"));
    } else {
      grid.appendChild(card("Shortlist candidate", "None", run.governanceNote));
    }

    grid.appendChild(card("Investment", AppMeta.cr(run.investmentRs, 2),
      run.presetLabel + (run.preset === "custom" ? "" : " weights")));

    if (run.hhi) {
      grid.appendChild(card("City concentration",
        run.hhi.cityBefore.toFixed(4) + " → " + run.hhi.cityAfter.toFixed(4),
        hhiVerdict(run.hhi.cityBefore, run.hhi.cityAfter)));
      grid.appendChild(card("Asset-type concentration",
        run.hhi.typeBefore.toFixed(4) + " → " + run.hhi.typeAfter.toFixed(4),
        hhiVerdict(run.hhi.typeBefore, run.hhi.typeAfter)));
    }
    s.appendChild(grid);

    if (run.selectionMode === "manual") {
      var rec = AnalysisRun.recommended(run);
      var mn = el("p", "reit-ov-gov-warn",
        "Manually selected target. " + (rec
          ? "The current shortlist candidate is " + AnalysisRun.name(rec) + " (raw rank " + rec.rank + ")" +
            (run.selectionDiffers ? " — ⚠ different from the manual selection." : " — the same segment.")
          : "No segment passes the simulation-support screen under these settings."));
      s.appendChild(mn);
      var back = el("button", "reit-btn reit-btn--secondary reit-return-auto", "Return to automatic recommendation");
      back.type = "button";
      back.addEventListener("click", function () { AnalysisRun.returnToAuto(); });
      s.appendChild(back);
    } else if (run.governanceNote) {
      s.appendChild(el("p", "reit-ov-gov-note", run.governanceNote));
    }
    if (run.governanceOverride) {
      s.appendChild(el("p", "reit-ov-gov-warn",
        "The simulation-support screen is currently ignored, so the candidate is the highest " +
        "raw-score market regardless of simulation support."));
    }
    s.appendChild(el("p", "reit-ov-caveat", AppMeta.CANDIDATE_CAVEAT));

    s.appendChild(buildComparison(run, target));
    s.appendChild(linkButton("Open the Decision Report", "report"));
    return s;
  }

  /**
   * The selected target against the most relevant alternative.
   *
   * When the highest raw-score market is a different segment, that is the
   * comparison a reader asks for ("why not the top scorer?"), and it usually
   * fails the screen — so it is called the "highest raw-score alternative",
   * never the "next-best segment". When the target IS the top scorer, the
   * comparison is the next eligible candidate.
   */
  function buildComparison(run, target) {
    var wrap = el("div", "reit-ov-compare");
    var cmp = AnalysisRun.comparison(run);
    if (!target || !cmp) { return wrap; }
    var other = cmp.market;
    var role = cmp.role;

    var hid = "ov-compare-heading";
    var h = el("h3", null, "Selected target against the " + role.toLowerCase());
    h.id = hid;
    wrap.appendChild(h);
    wrap.appendChild(el("p", "reit-note",
      role === "Highest raw-score alternative"
        ? "The highest raw-score alternative scores above the selected target on attractiveness" +
          (other.governance.eligible ? "." : " but fails the simulation-support screen, so it is not the shortlist candidate.") +
          " Score differences are computed from unrounded scores and shown to two decimals."
        : "The next eligible candidate is the second-highest segment passing the simulation-support " +
          "screen. Score differences are computed from unrounded scores and shown to two decimals."));

    var tbl = document.createElement("table");
    tbl.className = "reit-compare-table";
    tbl.setAttribute("aria-labelledby", hid);

    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["Measure",
     AnalysisRun.name(target) + " (selected target)",
     AnalysisRun.name(other) + " (" + role.toLowerCase() + ")",
     "Difference"].forEach(function (text) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = text;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    var tg = target.governance, og = other.governance;
    var rows = [
      ["Composite attractiveness score", num(target.totalScore, 2), num(other.totalScore, 2),
       delta(target.totalScore, other.totalScore, 2)],
      ["Raw rank", String(target.rank), String(other.rank), "—"],
      ["Simulation-support screen",
       tg.eligible ? "✓ Passes" : "✗ Fails — " + tg.reasons.join("; "),
       og.eligible ? "✓ Passes" : "✗ Fails — " + og.reasons.join("; "), "—"],
      ["Eligible rank", target.eligibleRank ? String(target.eligibleRank) : "— (fails screen)",
       other.eligibleRank ? String(other.eligibleRank) : "— (fails screen)", "—"],
      ["Simulated observations", String(target.observationCount), String(other.observationCount),
       delta(target.observationCount, other.observationCount, 0)],
      ["Assumption Support Grade", target.confidenceGrade || "—", other.confidenceGrade || "—", "—"],
      ["Simulation support level", tg.tier, og.tier, "—"],
      ["External calibration", target.externalCalibrationStatus, other.externalCalibrationStatus, "—"],
      ["Gross yield", pct(target.grossYield), pct(other.grossYield),
       delta(target.grossYield * 100, other.grossYield * 100, 2) + "pp"],
      ["Rental growth", pct(target.annualRentalGrowthRatio), pct(other.annualRentalGrowthRatio),
       delta(target.annualRentalGrowthRatio * 100, other.annualRentalGrowthRatio * 100, 2) + "pp"],
      ["Demand score", num(target.demandScore, 1), num(other.demandScore, 1),
       delta(target.demandScore, other.demandScore, 1)],
      ["Risk score (lower is better)", num(target.riskScore, 1), num(other.riskScore, 1),
       delta(target.riskScore, other.riskScore, 1)],
      ["City", target.city, other.city, target.city === other.city ? "same city" : "different cities"],
      ["Property type", target.propertyType, other.propertyType,
       target.propertyType === other.propertyType ? "same type" : "different types"]
    ];

    var tbody = document.createElement("tbody");
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      th.textContent = r[0];
      tr.appendChild(th);
      r.slice(1).forEach(function (v) { tr.appendChild(el("td", null, v)); });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    var scroll = el("div", "reit-table-scroll");
    scroll.appendChild(tbl);
    wrap.appendChild(scroll);
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
    var level = after < 0.15 ? "diversified" : (after <= 0.25 ? "moderate" : "concentrated");
    if (d < -0.0001) { return "improves by " + Math.abs(d).toFixed(4) + ", still " + level; }
    if (d >  0.0001) { return "worsens by " + d.toFixed(4) + ", " + level; }
    return "unchanged, " + level;
  }

  // ─── 3. Route map ──────────────────────────────────────────────────────────

  function linkButton(text, page) {
    var a = el("a", "reit-ov-link-btn", text);
    a.href = "#" + page;
    return a;
  }

  function buildRouteMap() {
    var s = section("Where to look",
      "The pages below follow the order the analysis runs in. All of them render the same analysis.");
    var list = el("ol", "reit-ov-routes");

    [
      ["portfolio", "Portfolio Analysis",
       "The " + view.counts.assetCount + " synthetic holdings the analysis starts from, or your own custom portfolio."],
      ["screener", "Market Screener",
       "Scores and ranks all " + view.counts.marketCount + " segments. Presets, weights, the " +
       "simulation-support screen, manual selection, filters and the per-segment simulated distributions live here."],
      ["diversification", "Diversification",
       "What the investment in the selected target does to geographic and asset-class concentration, and the projections."],
      ["statsdash", "Statistical Analysis",
       "The " + AppMeta.num(view.counts.observationCount) + " simulated market observations: " +
       "distributions, stratified correlation, regression and known-anomaly detection."],
      ["agents", "Agent Output",
       view.counts.agentCount + " Gemini agents interpreting the selected target's figures, plus the " +
       "deterministic checks that gate the Orchestrator."],
      ["datacentre", "Data Centre",
       "Holdings, segment aggregates, the simulated observations, the source register and data quality."],
      ["report", "Decision Report",
       "The whole chain in one printable document."]
    ].forEach(function (r) {
      var li = document.createElement("li");
      var a = el("a", "reit-ov-route-link", r[1]);
      a.href = "#" + r[0];
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
    (typeof Validator !== "undefined" && Validator.LIMITATIONS
      ? Validator.LIMITATIONS : ["All data is synthetic."]).forEach(function (l) {
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
   * Reset Demo restores the canonical analysis without a reload: sample
   * portfolio, Balanced preset and weights, the default ₹50 Cr, the screen
   * applied, automatic selection, no filters. It touches only this
   * application's storage keys. A custom portfolio is user work, so it is
   * kept (inactive) rather than deleted.
   *
   * The confirmation is an explicit panel stating what will happen, with a
   * Reset and a Cancel button — not a button that silently changes its label
   * and waits for a second click.
   */
  function buildResetBar() {
    var wrap = el("div", "reit-ov-reset");

    if (!view.confirming) {
      var btn = el("button", "reit-ov-reset-btn", "Reset demo…");
      btn.type = "button";
      btn.id = "ov-reset-open";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.addEventListener("click", function () {
        view.confirming = true;
        render();
        var c = document.getElementById("ov-reset-confirm");
        if (c) { c.focus(); }
      });
      wrap.appendChild(btn);
      wrap.appendChild(el("p", "reit-ov-reset-note",
        "Restores the default analysis for this browser. The dataset and documents are untouched."));
      return wrap;
    }

    var panel = el("div", "reit-ov-reset-panel");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-labelledby", "ov-reset-title");
    panel.setAttribute("aria-describedby", "ov-reset-desc");
    var title = el("h3", null, "Reset the demo to its defaults?");
    title.id = "ov-reset-title";
    panel.appendChild(title);
    var desc = el("div");
    desc.id = "ov-reset-desc";
    desc.appendChild(el("p", null, "This will immediately restore:"));
    var ul = el("ul");
    ["the sample portfolio (a custom portfolio, if you made one, is kept but no longer used)",
     "the Balanced preset and its canonical weights",
     "the default investment of ₹50.00 Cr (10% of the sample portfolio)",
     "the simulation-support screen, applied",
     "automatic selection of the shortlist candidate (any manual selection is cleared)",
     "no screener filters, and no agent commentary from the previous run"].forEach(function (t) {
      ul.appendChild(el("li", null, t));
    });
    desc.appendChild(ul);
    panel.appendChild(desc);

    var row = el("div", "reit-ov-reset-actions");
    var yes = el("button", "reit-ov-reset-btn reit-ov-reset-confirm", "Reset to defaults");
    yes.type = "button";
    yes.id = "ov-reset-confirm";
    yes.addEventListener("click", doReset);
    var no = el("button", "reit-btn reit-btn--outline", "Cancel");
    no.type = "button";
    no.id = "ov-reset-cancel";
    no.addEventListener("click", cancelReset);
    row.appendChild(yes);
    row.appendChild(no);
    panel.appendChild(row);
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); cancelReset(); }
    });
    wrap.appendChild(panel);
    return wrap;
  }

  function cancelReset() {
    view.confirming = false;
    render();
    var b = document.getElementById("ov-reset-open");
    if (b) { b.focus(); }
  }

  function doReset() {
    view.confirming = false;
    view.resetDone = true;
    try { delete window._reitAgentOutputs; } catch (e) { window._reitAgentOutputs = undefined; }
    AnalysisRun.reset();          // recomputes and re-renders every page
    if (window.location.hash !== "#overview") { window.location.hash = "overview"; }
    render();
    var h = document.getElementById("ov-current-analysis");
    if (h) { h.focus(); }
    if (typeof showToast === "function") { showToast("Demo reset to the default analysis.", "success"); }
    setTimeout(function () { view.resetDone = false; }, 0);
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());

/**
 * diversification.js — Diversification (HHI) page controller
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Renders the shared analysis run (analysisRun.js) and nothing else. The
 * target named at the top, every HHI figure, the two candidate tables and
 * every projection come from the same run object the Overview, Screener,
 * Agents page and Report render, and the page re-renders whenever that run
 * changes.
 *
 * It previously read a stored snapshot ONCE, when the application loaded. After
 * a preset change the other pages moved to the new target while this page went
 * on analysing the old one, and its Top 3 still showed Balanced results.
 *
 * Depends on: analysisRun.js, hhi.js, projection.js, appMeta.js, charts.js
 */

(function () {
  "use strict";

  var ROOT_ID = "hhi-content";

  var view = { run: null, loading: true, error: null };

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    showLoading(root);

    AnalysisRun.ready().then(function (run) {
      view.loading = false;
      view.run = run;
      render(root);
    }).catch(function (err) {
      view.loading = false;
      view.error = "Could not load the dataset: " + err.message + ". Reload the page to try again.";
      render(root);
    });

    AnalysisRun.subscribe(function (run) {
      view.run = run;
      render(root);
    });
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  function showLoading(root) {
    root.innerHTML = "";
    var p = document.createElement("p");
    p.className = "loading-msg";
    p.setAttribute("role", "status");
    p.textContent = "Loading the portfolio and the current analysis…";
    root.appendChild(p);
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  function render(root) {
    root.innerHTML = "";

    if (view.error) {
      var errEl = document.createElement("p");
      errEl.className = "error-msg";
      errEl.setAttribute("role", "alert");
      errEl.textContent = view.error;
      root.appendChild(errEl);
      return;
    }
    if (view.loading || !view.run) { showLoading(root); return; }

    root.appendChild(buildCurrentHHI());

    if (!AnalysisRun.selected(view.run)) {
      var none = document.createElement("p");
      none.className = "reit-stale-banner";
      none.textContent = view.run.governanceNote;
      root.appendChild(none);
      root.appendChild(buildTop3Section());
      root.appendChild(buildSensitivitySection());
      return;
    }

    root.appendChild(buildSimulationSection());
    root.appendChild(buildTop3Section());
    root.appendChild(buildSensitivitySection());
    if (typeof Projection !== "undefined") {
      root.appendChild(buildProjectionSection());
    }
  }

  // ─── Current portfolio HHI ────────────────────────────────────────────────

  function buildCurrentHHI() {
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Current Portfolio Concentration";
    div.appendChild(h);

    var run = view.run;
    var assets = run.assets;
    var cityHHI = run.portfolio.cityHHI;
    var typeHHI = run.portfolio.typeHHI;

    var grid = document.createElement("div");
    grid.className = "reit-metrics-grid";

    grid.appendChild(buildHHICard("City HHI", cityHHI, null));
    grid.appendChild(buildHHICard("Asset-type HHI", typeHHI, null));
    grid.appendChild(buildMetricCard("Portfolio Value", "₹" + (run.portfolio.totalValueRs / 1e7).toFixed(1) + " Cr", null));
    grid.appendChild(buildMetricCard("Assets", run.portfolio.assetCount +
      (run.portfolio.source === "custom" ? " (custom portfolio)" : " (sample portfolio)"), null));

    div.appendChild(grid);

    // City and type allocation tables
    var allocDiv = document.createElement("div");
    allocDiv.className = "reit-alloc-wrap";
    allocDiv.appendChild(buildAllocTable("City Allocation", HHIEngine.cityAllocation(assets)));
    allocDiv.appendChild(buildAllocTable("Asset-type Allocation", HHIEngine.typeAllocation(assets)));
    div.appendChild(allocDiv);

    return div;
  }

  function buildHHICard(label, value, delta) {
    var card = document.createElement("div");
    card.className = "reit-metric-card";
    var band = hhiBand(value);
    var ariaDesc = label + ": " + value.toFixed(4) + " (" + band.label + ")";
    if (delta !== null) {
      ariaDesc += ". Change: " + (delta < 0 ? "" : "+") + delta.toFixed(4) + ", " +
        (delta < -0.0001 ? "Concentration improved" : delta > 0.0001 ? "Concentration worsened" : "Unchanged");
    }
    card.setAttribute("aria-label", ariaDesc);
    if (delta !== null) {
      card.className += (delta < -0.0001) ? " reit-improved"
                       : (delta >  0.0001) ? " reit-worsened"
                       : " reit-neutral";
    }

    var lbl = document.createElement("div");
    lbl.className = "reit-metric-label";
    lbl.textContent = label;
    card.appendChild(lbl);

    var val = document.createElement("div");
    val.className = "reit-metric-value";
    val.textContent = value.toFixed(4);
    card.appendChild(val);

    var tag = document.createElement("div");
    tag.className = "reit-hhi-band " + band.cls;
    tag.setAttribute("aria-hidden", "true");
    tag.setAttribute("data-tip", band.label === "Diversified" ? "HHI < 0.15 — low concentration"
      : band.label === "Moderate" ? "HHI 0.15–0.25 — moderate concentration"
      : "HHI > 0.25 — high concentration");
    tag.textContent = band.label;
    card.appendChild(tag);

    if (delta !== null) {
      var dEl = document.createElement("div");
      dEl.className = "reit-metric-delta";
      dEl.textContent = (delta < 0 ? "" : "+") + delta.toFixed(4)
        + (delta < -0.0001 ? " ↓ Concentration improved"
           : delta >  0.0001 ? " ↑ Concentration worsened"
           : " Unchanged");
      card.appendChild(dEl);
    }

    return card;
  }

  function buildMetricCard(label, value, state_ignored) {
    var card = document.createElement("div");
    card.className = "reit-metric-card";
    var lbl = document.createElement("div");
    lbl.className = "reit-metric-label";
    lbl.textContent = label;
    var val = document.createElement("div");
    val.className = "reit-metric-value";
    val.textContent = value;
    card.appendChild(lbl);
    card.appendChild(val);
    return card;
  }

  function hhiBand(hhi) {
    if (hhi < 0.15)  { return { label: "Diversified",   cls: "reit-band-div" }; }
    if (hhi <= 0.25) { return { label: "Moderate",      cls: "reit-band-mod" }; }
    return                    { label: "Concentrated",  cls: "reit-band-con" };
  }

  /* Stage 4: HHI business interpretation */
  function hhiBusinessText(before, after, delta, dimension) {
    var beforeBand = hhiBand(before).label;
    var afterBand  = hhiBand(after).label;
    var dimLabel   = dimension === "city" ? "geographic" : "asset-type";
    if (delta < -0.0001) {
      if (beforeBand !== afterBand) {
        return "Moving from " + beforeBand + " to " + afterBand
          + " — " + dimLabel + " concentration risk reduced significantly.";
      }
      return dimLabel.charAt(0).toUpperCase() + dimLabel.slice(1)
        + " concentration decreasing — portfolio becoming more diversified.";
    }
    if (delta > 0.0001) {
      if (beforeBand !== afterBand) {
        return "Moving from " + beforeBand + " to " + afterBand
          + " — " + dimLabel + " concentration risk increased.";
      }
      return dimLabel.charAt(0).toUpperCase() + dimLabel.slice(1)
        + " concentration increasing — consider markets in other " + (dimension === "city" ? "cities" : "asset types") + ".";
    }
    return dimLabel.charAt(0).toUpperCase() + dimLabel.slice(1)
      + " concentration unchanged — negligible HHI impact.";
  }

  function buildAllocTable(title, alloc) {
    var div = document.createElement("div");
    div.className = "reit-alloc-block";

    var h = document.createElement("h3");
    h.textContent = title;
    div.appendChild(h);

    var tbl = document.createElement("table");
    tbl.className = "reit-alloc-table";
    var cap = document.createElement("caption");
    cap.className = "reit-sr-only";
    cap.textContent = title + ": share of current portfolio value";
    tbl.appendChild(cap);

    var keys = Object.keys(alloc).sort(function (a, b) {
      return alloc[b].share - alloc[a].share;
    });
    keys.forEach(function (k) {
      var tr = document.createElement("tr");
      var td1 = document.createElement("td"); td1.textContent = k;
      var td2 = document.createElement("td");
      td2.textContent = (alloc[k].share * 100).toFixed(1) + "%";
      var share = alloc[k].share;
      var bar = document.createElement("div");
      bar.className = "reit-alloc-bar";
      bar.style.width = (share * 100).toFixed(1) + "%";
      td2.appendChild(bar);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbl.appendChild(tr);
    });

    div.appendChild(tbl);
    return div;
  }

  // ─── Simulation section ───────────────────────────────────────────────────

  function buildSimulationSection() {
    var run = view.run;
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Simulated Investment";
    div.appendChild(h);

    /* The target is the run's selected target — never a fallback to rank 1. */
    var target = AnalysisRun.selected(run);
    var sim = target.simulation;
    var gov = target.governance;

    var info = document.createElement("p");
    info.className = "reit-sim-info";
    info.setAttribute("data-target-id", target.marketId);
    info.setAttribute("data-selection-mode", run.selectionMode);
    info.textContent = AnalysisRun.targetLabel(run) + ": " + AnalysisRun.name(target) +
      " (" + target.propertyType + ", raw rank " + target.rank +
      (target.eligibleRank ? ", eligible rank " + target.eligibleRank : "") + ") — Investment: " +
      AppMeta.cr(run.investmentRs, 2) + " — " + run.presetLabel;
    div.appendChild(info);

    var support = document.createElement("p");
    support.className = "reit-sim-support";
    support.textContent = "Simulation support: " + (gov.eligible ? "✓ passes" : "✗ fails") +
      " the simulation-support screen (" + target.observationCount + " simulated observations, " +
      "Assumption Support Grade " + (gov.grade || "—") + (gov.eligible ? "" : "; " + gov.reasons.join("; ")) +
      "). External calibration: " + target.externalCalibrationStatus + ".";
    div.appendChild(support);

    if (run.selectionMode === "manual") {
      var rec = AnalysisRun.recommended(run);
      var mn = document.createElement("p");
      mn.className = "reit-stale-banner";
      mn.textContent = "Manually selected target." + (run.selectionDiffers && rec
        ? " ⚠ The current shortlist candidate is " + AnalysisRun.name(rec) + "; this page analyses the manual selection."
        : "");
      div.appendChild(mn);
    }

    // Before/After cards — CITY HHI
    var citySection = document.createElement("div");
    citySection.className = "reit-hhi-section";
    citySection.setAttribute("role", "region");
    citySection.setAttribute("aria-label", "Geographic (City) HHI Analysis");
    var cityH = document.createElement("h3");
    cityH.textContent = "Geographic Concentration (City HHI)";
    citySection.appendChild(cityH);

    var cityGrid = document.createElement("div");
    cityGrid.className = "reit-ba-grid";

    var cityDelta = sim.after.cityHHI - sim.before.cityHHI;
    cityGrid.appendChild(buildBACard("Before", sim.before.cityHHI, null));
    cityGrid.appendChild(buildBACard("After", sim.after.cityHHI, cityDelta));
    citySection.appendChild(cityGrid);
    // Stage 4: Business interpretation
    var cityInterp = document.createElement("p");
    cityInterp.className = "reit-hhi-interp";
    cityInterp.textContent = hhiBusinessText(sim.before.cityHHI, sim.after.cityHHI, cityDelta, "city");
    citySection.appendChild(cityInterp);
    div.appendChild(citySection);

    // Before/After cards — TYPE HHI
    var typeSection = document.createElement("div");
    typeSection.className = "reit-hhi-section";
    typeSection.setAttribute("role", "region");
    typeSection.setAttribute("aria-label", "Asset-Type HHI Analysis");
    var typeH = document.createElement("h3");
    typeH.textContent = "Asset-type Concentration (Asset-type HHI)";
    typeSection.appendChild(typeH);

    var typeGrid = document.createElement("div");
    typeGrid.className = "reit-ba-grid";

    var typeDelta = sim.after.typeHHI - sim.before.typeHHI;
    typeGrid.appendChild(buildBACard("Before", sim.before.typeHHI, null));
    typeGrid.appendChild(buildBACard("After", sim.after.typeHHI, typeDelta));
    typeSection.appendChild(typeGrid);
    // Stage 4: Business interpretation
    var typeInterp = document.createElement("p");
    typeInterp.className = "reit-hhi-interp";
    typeInterp.textContent = hhiBusinessText(sim.before.typeHHI, sim.after.typeHHI, typeDelta, "type");
    typeSection.appendChild(typeInterp);
    div.appendChild(typeSection);

    // Yield and value — neutral metric display (no "Improved" for value)
    var yieldSection = document.createElement("div");
    yieldSection.className = "reit-hhi-section";
    yieldSection.setAttribute("role", "region");
    yieldSection.setAttribute("aria-label", "Weighted Yield Analysis");
    var yieldH = document.createElement("h3");
    yieldH.textContent = "Portfolio Metrics";
    yieldSection.appendChild(yieldH);

    var metGrid = document.createElement("div");
    metGrid.className = "reit-ba-grid";

    var yieldDelta = sim.after.weightedYield - sim.before.weightedYield;
    metGrid.appendChild(buildYieldBACard("Weighted Yield Before", sim.before.weightedYield));
    metGrid.appendChild(buildYieldDeltaCard("Weighted Yield After", sim.after.weightedYield, yieldDelta));

    // Portfolio value: show Increased/Decreased, NOT "Improved"
    var valueBefore = sim.before.totalValue / 1e7;
    var valueAfter  = sim.after.totalValue  / 1e7;
    var valueDelta  = valueAfter - valueBefore;
    metGrid.appendChild(buildValueCard("Portfolio Value Before", valueBefore));
    metGrid.appendChild(buildValueDeltaCard("Portfolio Value After", valueAfter, valueDelta));

    yieldSection.appendChild(metGrid);
    div.appendChild(yieldSection);

    // Chart 4: HHI Before/After bar comparison
    if (typeof Charts !== 'undefined') {
      var hhiCompareWrap = document.createElement("div");
      hhiCompareWrap.className = "reit-hhi-section";
      hhiCompareWrap.setAttribute("role", "region");
      hhiCompareWrap.setAttribute("aria-label", "HHI Before vs After Comparison Chart");
      var hhiCompH = document.createElement("h3");
      hhiCompH.textContent = "Concentration Index — Before vs After";
      hhiCompareWrap.appendChild(hhiCompH);
      var hhiCompId = "div-hhi-compare-chart";
      var hhiCompEl = document.createElement("div");
      hhiCompEl.id = hhiCompId;
      hhiCompareWrap.appendChild(hhiCompEl);
      div.appendChild(hhiCompareWrap);
      /* Deferred: the chart is drawn into the container by id, and this
       * section is attached to the page only after it is returned. */
      setTimeout(function () { Charts.renderHHICompare(hhiCompId, sim.before, sim.after); }, 0);
    }

    return div;
  }

  function buildBACard(label, hhi, delta) {
    var card = document.createElement("div");
    var cls = "reit-ba-card";
    var baBand = hhiBand(hhi);
    var baAria = label + ": " + hhi.toFixed(4) + " (" + baBand.label + ")";
    if (delta !== null) {
      baAria += ". Delta: " + (delta < 0 ? "" : "+") + delta.toFixed(4) + ", " +
        (delta < -0.0001 ? "Concentration improved" : delta > 0.0001 ? "Concentration worsened" : "Unchanged");
    }
    if (delta !== null) {
      cls += delta < -0.0001 ? " reit-ba-improved" : delta > 0.0001 ? " reit-ba-worsened" : "";
    }
    card.className = cls;
    card.setAttribute("aria-label", baAria);

    var lbl = document.createElement("div");
    lbl.className = "reit-ba-label";
    lbl.setAttribute("aria-hidden", "true");
    lbl.textContent = label;
    card.appendChild(lbl);

    var val = document.createElement("div");
    val.className = "reit-ba-value";
    val.setAttribute("aria-hidden", "true");
    val.textContent = hhi.toFixed(4);
    card.appendChild(val);

    var tag = document.createElement("div");
    tag.className = "reit-hhi-band " + baBand.cls;
    tag.setAttribute("aria-hidden", "true");
    tag.setAttribute("data-tip", baBand.label === "Diversified" ? "HHI < 0.15 — low concentration"
      : baBand.label === "Moderate" ? "HHI 0.15–0.25 — moderate concentration"
      : "HHI > 0.25 — high concentration");
    tag.textContent = baBand.label;
    card.appendChild(tag);

    if (delta !== null) {
      var dEl = document.createElement("div");
      dEl.className = "reit-ba-delta";
      dEl.textContent = (delta < 0 ? "" : "+") + delta.toFixed(4)
        + (delta < -0.0001 ? " — Concentration improved"
           : delta > 0.0001 ? " — Concentration worsened"
           : " — Unchanged");
      card.appendChild(dEl);
    }

    return card;
  }

  function buildYieldBACard(label, yld) {
    var card = document.createElement("div");
    card.className = "reit-ba-card";
    var lbl = document.createElement("div"); lbl.className = "reit-ba-label"; lbl.textContent = label;
    var val = document.createElement("div"); val.className = "reit-ba-value"; val.textContent = (yld * 100).toFixed(3) + "%";
    card.appendChild(lbl); card.appendChild(val);
    return card;
  }

  function buildYieldDeltaCard(label, yld, delta) {
    var card = document.createElement("div");
    card.className = "reit-ba-card" + (delta >= 0 ? " reit-ba-improved" : " reit-ba-worsened");
    var lbl = document.createElement("div"); lbl.className = "reit-ba-label"; lbl.textContent = label;
    var val = document.createElement("div"); val.className = "reit-ba-value"; val.textContent = (yld * 100).toFixed(3) + "%";
    var dEl = document.createElement("div"); dEl.className = "reit-ba-delta";
    dEl.textContent = (delta >= 0 ? "+" : "") + (delta * 100).toFixed(3)
      + "pp — Yield " + (delta >= 0 ? "improved" : "worsened");
    card.appendChild(lbl); card.appendChild(val); card.appendChild(dEl);
    return card;
  }

  function buildValueCard(label, valueCr) {
    var card = document.createElement("div");
    card.className = "reit-ba-card";
    var lbl = document.createElement("div"); lbl.className = "reit-ba-label"; lbl.textContent = label;
    var val = document.createElement("div"); val.className = "reit-ba-value"; val.textContent = "₹" + valueCr.toFixed(1) + " Cr";
    card.appendChild(lbl); card.appendChild(val);
    return card;
  }

  function buildValueDeltaCard(label, valueCr, deltaCr) {
    var card = document.createElement("div");
    card.className = "reit-ba-card";  // no improved/worsened — value increase is neutral
    var lbl = document.createElement("div"); lbl.className = "reit-ba-label"; lbl.textContent = label;
    var val = document.createElement("div"); val.className = "reit-ba-value"; val.textContent = "₹" + valueCr.toFixed(1) + " Cr";
    var dEl = document.createElement("div"); dEl.className = "reit-ba-delta";
    dEl.textContent = (deltaCr >= 0 ? "Increased by ₹" : "Decreased by ₹")
      + Math.abs(deltaCr).toFixed(1) + " Cr";
    card.appendChild(lbl); card.appendChild(val); card.appendChild(dEl);
    return card;
  }

  // ─── Candidate tables ─────────────────────────────────────────────────────

  /*
   * Two tables, each labelled for what it is. Raw-score leaders are the top of
   * the attractiveness ranking under the ACTIVE preset; several of them usually
   * fail the simulation-support screen. The eligible shortlist is the top of the
   * segments that pass. An ineligible segment is never called a recommendation.
   */
  function buildTop3Section() {
    var run = view.run;
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Candidates under the " + run.presetLabel + " preset";
    div.appendChild(h);

    div.appendChild(candidateTable("Raw-score leaders — top 3 by composite attractiveness score",
      AnalysisRun.rawTop(run, 3), "div-raw-top3"));
    div.appendChild(candidateTable("Eligible shortlist — top 3 passing the simulation-support screen",
      AnalysisRun.eligibleTop(run, 3), "div-eligible-top3"));

    var note = document.createElement("p");
    note.className = "reit-note";
    note.textContent = "HHI interpretation: < 0.15 = Diversified  |  0.15–0.25 = Moderate  |  > 0.25 = Concentrated. "
      + "A market may improve geographic concentration but worsen asset-type concentration — both are shown separately. "
      + "Descriptive portfolio concentration indicator only; not a regulatory classification.";
    div.appendChild(note);
    return div;
  }

  function candidateTable(title, list, id) {
    var run = view.run;
    var wrap = document.createElement("div");
    var h = document.createElement("h3");
    h.id = id + "-h";
    h.textContent = title;
    wrap.appendChild(h);

    var tbl = document.createElement("table");
    tbl.className = "reit-sim-table";
    tbl.id = id;
    tbl.setAttribute("aria-labelledby", h.id);

    var thead = document.createElement("thead");
    var hrow = document.createElement("tr");
    ["Raw rank", "Eligible rank", "Market", "Type", "Score", "Gross Yield", "Screen",
     "City HHI Δ", "Type HHI Δ", "Role"].forEach(function (t) {
      var th = document.createElement("th"); th.setAttribute("scope", "col"); th.textContent = t; hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    tbl.appendChild(thead);

    var tbody = document.createElement("tbody");
    list.forEach(function (m) {
      var tr = document.createElement("tr");
      if (m.marketId === run.selectedTargetId) { tr.className = "reit-selected-row"; }
      var cityDelta = m.simulation ? m.simulation.after.cityHHI - m.simulation.before.cityHHI : null;
      var typeDelta = m.simulation ? m.simulation.after.typeHHI - m.simulation.before.typeHHI : null;
      var role = m.marketId === run.selectedTargetId ? AnalysisRun.targetLabel(run)
               : m.marketId === run.recommendedCandidateId ? "Shortlist candidate"
               : m.marketId === run.highestRawScoreMarketId ? "Highest raw-score market" : "—";
      [m.rank, m.eligibleRank || "—", AnalysisRun.name(m), m.propertyType,
       m.totalScore.toFixed(2), (m.grossYield * 100).toFixed(2) + "%",
       m.governance.eligible ? "✓ Passes" : "✗ Fails (" + m.governance.failsOn + ")",
       cityDelta !== null ? (cityDelta < 0 ? "" : "+") + cityDelta.toFixed(4) + " " + deltaWord(cityDelta) : "—",
       typeDelta !== null ? (typeDelta < 0 ? "" : "+") + typeDelta.toFixed(4) + " " + deltaWord(typeDelta) : "—",
       role
      ].forEach(function (c, ci) {
        var td = document.createElement("td");
        td.textContent = c;
        if (ci === 7 && cityDelta !== null) { td.className = hhiDeltaClass(cityDelta); }
        if (ci === 8 && typeDelta !== null) { td.className = hhiDeltaClass(typeDelta); }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    var scroll = document.createElement("div");
    scroll.className = "reit-table-scroll";
    scroll.appendChild(tbl);
    wrap.appendChild(scroll);
    return wrap;
  }

  function deltaWord(d) {
    return d < -0.0001 ? "(improved)" : d > 0.0001 ? "(worsened)" : "(unchanged)";
  }

  function hhiDeltaClass(delta) {
    if (delta < -0.0001) { return "reit-hhi-improved"; }
    if (delta >  0.0001) { return "reit-hhi-worsened"; }
    return "reit-hhi-neutral";
  }

  // ─── Sensitivity analysis section ─────────────────────────────────────────

  /*
   * For each preset, with the current portfolio and amount: the highest
   * raw-score segment AND the highest candidate passing the screen. Showing
   * only the raw leader would present segments that fail the screen as each
   * preset's recommendation.
   */
  function buildSensitivitySection() {
    var run = view.run;
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Sensitivity Analysis — every preset";
    div.appendChild(h);

    var note = document.createElement("p");
    note.className = "reit-note";
    note.textContent = "The same portfolio and " + AppMeta.cr(run.investmentRs, 2) + " investment under each weight preset. " +
      "Each card shows the highest raw-score segment and the highest-ranked candidate passing the simulation-support " +
      "screen; they differ whenever the top scorer fails the screen. The active preset is marked.";
    div.appendChild(note);

    var grid = document.createElement("div");
    grid.className = "reit-sensitivity-grid";

    run.sensitivity.forEach(function (sc) {
      var card = document.createElement("div");
      card.className = "reit-sensitivity-card" + (sc.active ? " reit-sensitivity-active" : "");

      var title = document.createElement("h3");
      title.textContent = sc.label + (sc.active ? " (active)" : "");
      card.appendChild(title);

      var w = sc.weights;
      var wLine = document.createElement("p");
      wLine.className = "reit-sensitivity-weights";
      wLine.textContent = "Yield " + Math.round(w.yieldWeight * 100) + "%, "
        + "growth " + Math.round(w.growthWeight * 100) + "%, "
        + "diversification " + Math.round(w.diversWeight * 100) + "%, "
        + "demand " + Math.round(w.demandWeight * 100) + "%, "
        + "risk " + Math.round(w.riskWeight * 100) + "%";
      card.appendChild(wLine);

      var raw = document.createElement("div");
      raw.className = "reit-sensitivity-top";
      raw.textContent = "Highest raw score: " + sc.highestRaw.name + " — " + sc.highestRaw.score.toFixed(2) +
        (sc.highestRaw.passes ? " (✓ passes screen)" : " (✗ fails screen)");
      card.appendChild(raw);

      var cand = document.createElement("p");
      cand.className = "reit-sensitivity-detail";
      cand.textContent = sc.candidate
        ? "Shortlist candidate: " + sc.candidate.name + " — raw rank " + sc.candidate.rawRank +
          ", score " + sc.candidate.score.toFixed(2) + ", gross yield " + (sc.candidate.grossYield * 100).toFixed(2) + "%"
        : "Shortlist candidate: none passes the screen";
      card.appendChild(cand);

      grid.appendChild(card);
    });

    div.appendChild(grid);
    return div;
  }

  // ─── Scenario Projection Section (Stage 6) ────────────────────────────────

  function buildProjectionSection() {
    var div = document.createElement("div");
    div.className = "reit-section";

    var heading = document.createElement("h2");
    heading.textContent = "Scenario Projections";
    div.appendChild(heading);

    var note = document.createElement("p");
    note.className = "reit-text-muted";
    note.textContent = "Three scenarios — Conservative, Base, Optimistic — over 1, 3 and 5 years. "
      + "Formula: Projected Value = Current Value × (1 + capital growth)^n. "
      + "Occupancy-adjusted rent = Projected Rent × occupancy rate. "
      + "Assumptions are illustrative; no leverage, tax or transaction costs are modelled.";
    div.appendChild(note);

    /* The projections are the run's, computed once from the selected target's
     * own gross yield, so this table and the Decision Report are the same
     * numbers by construction. */
    var run = view.run;
    var projTarget = AnalysisRun.selected(run);
    var projections = run.projections.all;
    var horizons    = run.projections.horizons;

    var basis = document.createElement("p");
    basis.className = "reit-text-muted";
    basis.setAttribute("data-year0-rent", (run.projections.year0AnnualRentRs / 1e7).toFixed(3));
    basis.textContent = "Year 0 annual rent = existing rent " + AppMeta.cr(run.projections.params.currentAnnualRentRs, 3) +
      " + " + AppMeta.cr(run.investmentRs, 2) + " × " + AnalysisRun.name(projTarget) + " gross yield " +
      (projTarget.grossYield * 100).toFixed(2) + "% (" + AppMeta.cr(run.projections.targetAnnualRentRs, 3) +
      ") = " + AppMeta.cr(run.projections.year0AnnualRentRs, 3) + ".";
    div.appendChild(basis);

    // Assumptions table
    var assumpHeading = document.createElement("h3");
    assumpHeading.textContent = "Scenario Assumptions";
    div.appendChild(assumpHeading);

    var assumpTable = document.createElement("table");
    assumpTable.className = "reit-table";
    var acap = document.createElement("caption");
    acap.className = "reit-sr-only";
    acap.textContent = "Scenario assumptions: rental growth, capital growth and occupancy";
    assumpTable.appendChild(acap);
    var aThead = document.createElement("thead");
    var aHRow  = document.createElement("tr");
    ["Scenario", "Rental Growth p.a.", "Capital Growth p.a.", "Occupancy", "Description"].forEach(function (h) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = h;
      aHRow.appendChild(th);
    });
    aThead.appendChild(aHRow);
    assumpTable.appendChild(aThead);
    var aTbody = document.createElement("tbody");
    Object.keys(Projection.SCENARIOS).forEach(function (key) {
      var sc = Projection.SCENARIOS[key];
      var row = document.createElement("tr");
      [
        sc.label,
        (sc.rentalGrowth * 100).toFixed(0) + "%",
        (sc.capitalGrowth * 100).toFixed(0) + "%",
        (sc.occupancy * 100).toFixed(0) + "%",
        sc.description
      ].forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v;
        row.appendChild(td);
      });
      aTbody.appendChild(row);
    });
    assumpTable.appendChild(aTbody);
    div.appendChild(assumpTable);

    // Projection table (rows = scenarios, cols = horizons)
    var projHeading = document.createElement("h3");
    projHeading.textContent = "Projected Portfolio Value";
    div.appendChild(projHeading);

    var projTable = document.createElement("table");
    projTable.className = "reit-table";
    projTable.id = "div-projections";
    projTable.setAttribute("data-base3y-value", (run.projections.summary3y.base.portfolioValue / 1e7).toFixed(2));
    projTable.setAttribute("data-base3y-rent", (run.projections.summary3y.base.annualRent / 1e7).toFixed(2));
    var pcap = document.createElement("caption");
    pcap.className = "reit-table-caption";
    pcap.textContent = "Projected portfolio value for " + AnalysisRun.name(projTarget) + " by scenario and year";
    projTable.appendChild(pcap);
    var pThead = document.createElement("thead");
    var pHRow  = document.createElement("tr");
    var pHeaders = ["Scenario", "Year 0 (current)"].concat(horizons.map(function (y) { return "Year " + y; }));
    pHeaders.forEach(function (h) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = h;
      pHRow.appendChild(th);
    });
    pThead.appendChild(pHRow);
    projTable.appendChild(pThead);

    var pTbody = document.createElement("tbody");
    ["conservative", "base", "optimistic"].forEach(function (key) {
      var pts = projections[key];
      var row = document.createElement("tr");
      var labelTd = document.createElement("td");
      labelTd.textContent = Projection.SCENARIOS[key].label;
      labelTd.style.fontWeight = "600";
      row.appendChild(labelTd);
      pts.forEach(function (pt) {
        var td = document.createElement("td");
        td.textContent = "₹" + (pt.portfolioValue / 1e7).toFixed(1) + " Cr";
        row.appendChild(td);
      });
      pTbody.appendChild(row);
    });
    projTable.appendChild(pTbody);
    div.appendChild(projTable);

    // Gross Rent and Occupancy-Adjusted Rent tables
    var rentHeading = document.createElement("h3");
    rentHeading.textContent = "Projected Annual Rent";
    div.appendChild(rentHeading);

    var rentTable = document.createElement("table");
    rentTable.className = "reit-table";
    var rcap = document.createElement("caption");
    rcap.className = "reit-sr-only";
    rcap.textContent = "Projected annual rent, gross and occupancy-adjusted, by scenario and year";
    rentTable.appendChild(rcap);
    var rThead = document.createElement("thead");
    var rHRow  = document.createElement("tr");
    ["Scenario", "Year 0 (Gross)", "Year 0 (Occ-Adj)"].concat(horizons.reduce(function (acc, y) {
      return acc.concat(["Year " + y + " (Gross)", "Year " + y + " (Occ-Adj)"]);
    }, [])).forEach(function (h) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = h;
      rHRow.appendChild(th);
    });
    rThead.appendChild(rHRow);
    rentTable.appendChild(rThead);

    var rTbody = document.createElement("tbody");
    ["conservative", "base", "optimistic"].forEach(function (key) {
      var pts = projections[key];
      var row = document.createElement("tr");
      var labelTd = document.createElement("td");
      labelTd.textContent = Projection.SCENARIOS[key].label;
      labelTd.style.fontWeight = "600";
      row.appendChild(labelTd);
      pts.forEach(function (pt) {
        var tdG = document.createElement("td");
        tdG.textContent = "₹" + (pt.annualRent / 1e7).toFixed(3) + " Cr";
        row.appendChild(tdG);
        var tdO = document.createElement("td");
        tdO.textContent = "₹" + (pt.occupancyAdjRent / 1e7).toFixed(3) + " Cr";
        row.appendChild(tdO);
      });
      rTbody.appendChild(row);
    });
    rentTable.appendChild(rTbody);
    div.appendChild(rentTable);

    var rentNote = document.createElement("p");
    rentNote.className = "reit-text-muted";
    rentNote.textContent = "Gross Rent = rent before occupancy adjustment. "
      + "Occ-Adj Rent = Gross Rent × scenario occupancy rate (80% / 90% / 95%). "
      + "Year 0 figures: Existing annual rent + new target's estimated annual rent.";
    div.appendChild(rentNote);

    // Canvas for line chart
    var chartWrap = document.createElement("div");
    chartWrap.className = "reit-chart-wrap";
    var canvas = document.createElement("canvas");
    canvas.id     = "projection-line-chart";
    canvas.width  = 560;
    canvas.height = 280;
    canvas.setAttribute("aria-label", "Scenario projection line chart");
    chartWrap.appendChild(canvas);
    div.appendChild(chartWrap);

    // Render line chart after appending to DOM (deferred)
    setTimeout(function () {
      if (typeof Charts !== "undefined") {
        Charts.renderScenarioLine(canvas, projections);
      }
    }, 0);

    // Disclaimer
    var disc = document.createElement("p");
    disc.className = "reit-report__disclaimer";
    disc.textContent = "Projections are illustrative only. Projected Rent = Current Rent × (1+g)^n; "
      + "Projected Value = Current Value × (1+c)^n. "
      + "No leverage, tax, vacancy costs, transaction fees or cap-rate expansion are modelled. "
      + "This is a SYNTHETIC academic dataset. Not investment advice.";
    div.appendChild(disc);

    return div;
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());

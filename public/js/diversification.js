/**
 * diversification.js — Diversification (HHI) page controller
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * READS from shared analysis state (ReitState) written by marketScreen.js.
 * If state is stale or absent, prompts user to run the Market Screener first.
 *
 * Depends on: hhi.js (HHIEngine), scoringEngine.js (ScoringEngine),
 *             stateManager.js (ReitState), uiHelpers.js
 */

(function () {
  "use strict";

  var ROOT_ID = "hhi-content";

  // ─── State ────────────────────────────────────────────────────────────────

  var state = {
    markets:       [],
    assets:        [],
    portfolioValue: 0,
    sharedRun:     null,   // loaded from ReitState
    loading:       true,
    error:         null
  };

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    showLoading(root);

    Promise.all([
      fetch("data/markets.json").then(function (r) { return r.json(); }),
      fetch("data/portfolio.json").then(function (r) { return r.json(); })
    ]).then(function (results) {
      state.markets       = results[0].markets || [];
      state.assets        = results[1].assets  || [];
      state.portfolioValue = HHIEngine.totalValue(state.assets);
      state.sharedRun      = ReitState.load();
      state.loading        = false;
      render(root);
    }).catch(function (err) {
      state.loading = false;
      state.error = "Could not load data: " + err.message;
      render(root);
    });
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  function showLoading(root) {
    root.innerHTML = "";
    var p = document.createElement("p");
    p.className = "loading-msg";
    p.textContent = "Loading portfolio data…";
    root.appendChild(p);
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  function render(root) {
    root.innerHTML = "";

    if (state.error) {
      var errEl = document.createElement("p");
      errEl.className = "error-msg";
      errEl.textContent = state.error;
      root.appendChild(errEl);
      return;
    }

    // Stale / missing state banner
    if (!state.sharedRun || state.sharedRun.stale) {
      root.appendChild(buildStaleBanner());
    }

    // Always show current portfolio HHI even without a screener run
    root.appendChild(buildCurrentHHI());

    // Simulation results only if we have a valid (non-stale) run
    if (state.sharedRun && !state.sharedRun.stale) {
      root.appendChild(buildSimulationSection());
      root.appendChild(buildTop3Section());
      root.appendChild(buildSensitivitySection());
      // Stage 6: Scenario projections
      if (typeof Projection !== "undefined") {
        root.appendChild(buildProjectionSection());
      }
    }
  }

  // ─── Stale banner ─────────────────────────────────────────────────────────

  function buildStaleBanner() {
    var div = document.createElement("div");
    div.className = "reit-stale-banner";
    var icon = document.createElement("span");
    icon.textContent = "ℹ️";
    var msg = document.createElement("span");
    msg.textContent = state.sharedRun
      ? "The analysis is outdated — weights or investment amount changed. Run the Market Screener to refresh."
      : "No analysis has been run yet. Go to the Market Screener to score and rank markets first.";
    div.appendChild(icon);
    div.appendChild(msg);

    var link = document.createElement("a");
    link.href = "#screener";
    link.className = "reit-stale-link";
    link.textContent = "→ Go to Market Screener";
    div.appendChild(link);
    return div;
  }

  // ─── Current portfolio HHI ────────────────────────────────────────────────

  function buildCurrentHHI() {
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Current Portfolio Concentration";
    div.appendChild(h);

    var cityHHI = HHIEngine.cityHHI(state.assets);
    var typeHHI = HHIEngine.typeHHI(state.assets);

    var grid = document.createElement("div");
    grid.className = "reit-metrics-grid";

    grid.appendChild(buildHHICard("City HHI", cityHHI, null));
    grid.appendChild(buildHHICard("Asset-type HHI", typeHHI, null));
    grid.appendChild(buildMetricCard("Portfolio Value", "₹" + (state.portfolioValue / 1e7).toFixed(1) + " Cr", null));
    grid.appendChild(buildMetricCard("Assets", state.assets.length, null));

    div.appendChild(grid);

    // City and type allocation tables
    var allocDiv = document.createElement("div");
    allocDiv.className = "reit-alloc-wrap";
    allocDiv.appendChild(buildAllocTable("City Allocation", HHIEngine.cityAllocation(state.assets)));
    allocDiv.appendChild(buildAllocTable("Asset-type Allocation", HHIEngine.typeAllocation(state.assets)));
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
    var run = state.sharedRun;
    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Simulated Investment";
    div.appendChild(h);

    // Find selected target in ranked list
    var target = null;
    if (run.ranked) {
      for (var i = 0; i < run.ranked.length; i++) {
        if (run.ranked[i].marketId === run.selectedTargetId) {
          target = run.ranked[i];
          break;
        }
      }
      if (!target && run.ranked.length > 0) { target = run.ranked[0]; }
    }

    if (!target || !target.simulation) {
      var noSim = document.createElement("p");
      noSim.textContent = "No simulation available. Run the Market Screener first.";
      div.appendChild(noSim);
      return div;
    }

    var sim = target.simulation;

    // Target info
    var info = document.createElement("p");
    info.className = "reit-sim-info";
    info.textContent = "Target: " + target.locality + ", " + target.city
      + " (" + target.propertyType + ") — Investment: ₹" + run.investmentCr + " Cr";
    div.appendChild(info);

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
      Charts.renderHHICompare(hhiCompId, sim.before, sim.after);
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

  // ─── Top 3 table ──────────────────────────────────────────────────────────

  function buildTop3Section() {
    var run = state.sharedRun;
    if (!run || !run.ranked) { return document.createDocumentFragment(); }

    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Top 3 Target Markets";
    div.appendChild(h);

    var tbl = document.createElement("table");
    tbl.className = "reit-sim-table";

    var thead = document.createElement("thead");
    var hrow = document.createElement("tr");
    ["Rank", "Market", "City", "Type", "Score", "Gross Yield",
     "City HHI Δ", "City Δ Label",
     "Type HHI Δ", "Type Δ Label"
    ].forEach(function (h) {
      var th = document.createElement("th"); th.textContent = h; hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    tbl.appendChild(thead);

    var tbody = document.createElement("tbody");
    var top3 = run.ranked.slice(0, 3);
    top3.forEach(function (m) {
      var tr = document.createElement("tr");
      var cityDelta = null, typeDelta = null;
      if (m.simulation) {
        cityDelta = m.simulation.after.cityHHI - m.simulation.before.cityHHI;
        typeDelta = m.simulation.after.typeHHI - m.simulation.before.typeHHI;
      }
      var cityLabel = cityDelta !== null
        ? (cityDelta < -0.0001 ? "Improved" : cityDelta > 0.0001 ? "Worsened" : "Unchanged") : "—";
      var typeLabel = typeDelta !== null
        ? (typeDelta < -0.0001 ? "Improved" : typeDelta > 0.0001 ? "Worsened" : "Unchanged") : "—";

      var cells = [
        m.rank,
        m.locality,
        m.city,
        m.propertyType,
        m.totalScore.toFixed(1),
        (m.grossYield * 100).toFixed(2) + "%",
        cityDelta !== null ? (cityDelta < 0 ? "" : "+") + cityDelta.toFixed(4) : "—",
        cityLabel,
        typeDelta !== null ? (typeDelta < 0 ? "" : "+") + typeDelta.toFixed(4) : "—",
        typeLabel
      ];
      cells.forEach(function (c, ci) {
        var td = document.createElement("td");
        td.textContent = c;
        if (ci === 7) { td.className = cityDelta !== null ? hhiDeltaClass(cityDelta) : ""; }
        if (ci === 9) { td.className = typeDelta !== null ? hhiDeltaClass(typeDelta) : ""; }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    tbl.appendChild(tbody);
    div.appendChild(tbl);

    // Explanatory note about HHI for each dimension
    var note = document.createElement("p");
    note.className = "reit-note";
    note.textContent = "HHI interpretation: < 0.15 = Diversified  |  0.15–0.25 = Moderate  |  > 0.25 = Concentrated. "
      + "A market may improve geographic concentration but worsen asset-type concentration — both are shown separately. "
      + "Descriptive portfolio concentration indicator only; not a regulatory classification.";
    div.appendChild(note);

    return div;
  }

  function hhiDeltaClass(delta) {
    if (delta < -0.0001) { return "reit-hhi-improved"; }
    if (delta >  0.0001) { return "reit-hhi-worsened"; }
    return "reit-hhi-neutral";
  }

  // ─── Sensitivity analysis section ─────────────────────────────────────────

  function buildSensitivitySection() {
    var run = state.sharedRun;
    if (!run) { return document.createDocumentFragment(); }

    var div = document.createElement("div");
    div.className = "reit-section";

    var h = document.createElement("h2");
    h.textContent = "Sensitivity Analysis — Top 1 by Scenario";
    div.appendChild(h);

    var note = document.createElement("p");
    note.className = "reit-note";
    note.textContent = "Shows the #1 ranked market under three alternative weight scenarios. "
      + "Ranking shifts confirm the model responds meaningfully to investor priorities.";
    div.appendChild(note);

    var sa = ScoringEngine.sensitivityAnalysis(
      state.markets, state.assets, HHIEngine.diversificationScore
    );

    var grid = document.createElement("div");
    grid.className = "reit-sensitivity-grid";

    var scenarios = ["incomeFocused", "growthFocused", "diversFocused"];
    scenarios.forEach(function (key) {
      var scenario = sa[key];
      if (!scenario || !scenario.top3 || !scenario.top3[0]) { return; }
      var top = scenario.top3[0];

      var card = document.createElement("div");
      card.className = "reit-sensitivity-card";

      var title = document.createElement("h3");
      title.textContent = scenario.label;
      card.appendChild(title);

      var weights = scenario.weights;
      var wLine = document.createElement("p");
      wLine.className = "reit-sensitivity-weights";
      wLine.textContent = "Yield " + Math.round(weights.yieldWeight * 100) + "% · "
        + "Growth " + Math.round(weights.growthWeight * 100) + "% · "
        + "Diversification " + Math.round(weights.diversWeight * 100) + "% · "
        + "Demand " + Math.round(weights.demandWeight * 100) + "% · "
        + "Risk " + Math.round(weights.riskWeight * 100) + "%";
      card.appendChild(wLine);

      var topLine = document.createElement("div");
      topLine.className = "reit-sensitivity-top";
      topLine.textContent = "#1: " + top.locality + ", " + top.city
        + " — Score: " + top.totalScore.toFixed(1);
      card.appendChild(topLine);

      var yield2 = document.createElement("p");
      yield2.className = "reit-sensitivity-detail";
      yield2.textContent = "Gross yield: " + (top.grossYield * 100).toFixed(2) + "%"
        + "  ·  Risk score: " + top.riskScore;
      card.appendChild(yield2);

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

    var sr = state.sharedRun;
    // Resolve selected target's gross yield from ranked list
    var projTarget = null;
    if (sr.ranked && sr.selectedTargetId) {
      for (var pi = 0; pi < sr.ranked.length; pi++) {
        if (sr.ranked[pi].marketId === sr.selectedTargetId) {
          projTarget = sr.ranked[pi]; break;
        }
      }
    }
    if (!projTarget && sr.ranked && sr.ranked.length > 0) { projTarget = sr.ranked[0]; }
    var targetGrossYield = projTarget ? (projTarget.grossYield || 0) : 0.07;

    var params = {
      currentPortfolioValueRs: (sr.portfolioValueCr || 0) * 1e7,
      currentAnnualRentRs:     (sr.annualRentCr || 0) * 1e7,
      investmentRs:            (sr.investmentCr || 0) * 1e7,
      newMarketGrossYield:     targetGrossYield
    };

    var projections = Projection.projectAll(params);
    var horizons    = Projection.DEFAULT_HORIZONS;

    // Assumptions table
    var assumpHeading = document.createElement("h3");
    assumpHeading.textContent = "Scenario Assumptions";
    div.appendChild(assumpHeading);

    var assumpTable = document.createElement("table");
    assumpTable.className = "reit-table";
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

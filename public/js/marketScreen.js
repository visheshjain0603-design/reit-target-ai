/**
 * marketScreen.js — Market Screener page controller
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WRITES the shared analysis state (ReitState) after every scoring run.
 * Diversification and Agent Output pages READ from that state.
 *
 * Depends on: hhi.js (HHIEngine), scoringEngine.js (ScoringEngine),
 *             stateManager.js (ReitState), uiHelpers.js
 */

(function () {
  "use strict";

  var ROOT_ID = "screener-content";

  // ─── State ────────────────────────────────────────────────────────────────

  var state = {
    markets:      [],
    assets:       [],
    portfolioValue: 0,
    weights:      null,
    weightPreset: "balanced",
    investmentCr: 0,
    ranked:       [],
    expanded:     null,   // marketId of the one open breakdown row (null = none)
    selectedId:   null,
    loading:      true,
    error:        null,
    showAll:      false   // true = show all 18; false = show top 10 + button
  };

  var TOP_N = 10;  // rows shown before "Show all" button

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    showLoading(root);

    // Try to restore previous selectedId and investmentCr from shared state
    var saved = ReitState.load();
    if (saved) {
      if (saved.selectedTargetId) { state.selectedId = saved.selectedTargetId; }
      if (saved.investmentCr > 0) { state.investmentCr = saved.investmentCr; }
      if (saved.weights && ScoringEngine.validateWeights(saved.weights).valid) {
        state.weights = saved.weights;
        state.weightPreset = saved.weightPreset || "custom";
      }
    }

    Promise.all([
      fetch("data/markets.json").then(function (r) { return r.json(); }),
      fetch("data/portfolio.json").then(function (r) { return r.json(); })
    ]).then(function (results) {
      state.markets = results[0].markets || [];
      state.assets  = results[1].assets  || [];
      state.portfolioValue = HHIEngine.totalValue(state.assets);

      if (!state.weights || !ScoringEngine.validateWeights(state.weights).valid) {
        state.weights      = Object.assign({}, ScoringEngine.PRESETS.balanced);
        state.weightPreset = "balanced";
      }
      if (state.investmentCr <= 0) {
        state.investmentCr = Math.round(state.portfolioValue / 1e7 * 0.10 * 100) / 100;
      }

      runScoring();
      state.loading = false;
      render(root);
    }).catch(function (err) {
      state.loading = false;
      state.error = "Could not load data: " + err.message;
      render(root);
    });
  }

  // ─── Scoring ───────────────────────────────────────────────────────────────

  function runScoring() {
    var investmentRs = Math.round(state.investmentCr * 1e7);
    var r = ScoringEngine.rankMarkets(
      state.markets, state.weights, state.assets, HHIEngine.diversificationScore
    );

    // Attach simulation (before/after HHI) for every market
    for (var i = 0; i < r.ranked.length; i++) {
      r.ranked[i].simulation = investmentRs > 0
        ? HHIEngine.simulateInvestment(state.assets, r.ranked[i], investmentRs)
        : null;
    }
    state.ranked = r.ranked;

    // Persist to shared state
    var top = state.ranked[0] || null;
    var targetId = state.selectedId || (top ? top.marketId : null);
    // Make sure selectedId is actually in ranked list; if not, fall back to #1
    var found = false;
    for (var j = 0; j < state.ranked.length; j++) {
      if (state.ranked[j].marketId === targetId) { found = true; break; }
    }
    if (!found) { targetId = top ? top.marketId : null; }
    state.selectedId = targetId;

    var cityBefore  = null, cityAfter  = null;
    var typeBefore  = null, typeAfter  = null;
    if (top && top.simulation) {
      cityBefore = top.simulation.before.cityHHI;
      cityAfter  = top.simulation.after.cityHHI;
      typeBefore = top.simulation.before.typeHHI;
      typeAfter  = top.simulation.after.typeHHI;
    }

    ReitState.save({
      runId:            ReitState.newRunId(),
      createdAt:        Date.now(),
      stale:            false,
      weights:          state.weights,
      weightPreset:     state.weightPreset,
      investmentCr:     state.investmentCr,
      selectedTargetId: state.selectedId,
      ranked:           state.ranked,
      cityHHIBefore:    cityBefore,
      cityHHIAfter:     cityAfter,
      typeHHIBefore:    typeBefore,
      typeHHIAfter:     typeAfter,
      portfolioValueCr: parseFloat((state.portfolioValue / 1e7).toFixed(3)),
      annualRentCr:     parseFloat((HHIEngine.totalAnnualRent(state.assets) / 1e7).toFixed(5)),
      marketCount:      state.markets.length,
      assetCount:       state.assets.length
    });
  }

  // ─── Loading / error ───────────────────────────────────────────────────────

  function showLoading(root) {
    root.innerHTML = "";
    var p = document.createElement("p");
    p.className = "loading-msg";
    p.textContent = "Scoring markets…";
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

    root.appendChild(buildControlPanel());
    root.appendChild(buildRankedTable());

    // Chart: Yield vs Capital Value scatter (Chart 2)
    if (state.ranked && state.ranked.length > 0 && typeof Charts !== 'undefined') {
      var scatterWrap = document.createElement("div");
      scatterWrap.className = "reit-section";
      var scatterTitle = document.createElement("h3");
      scatterTitle.textContent = "Yield vs Capital Value";
      scatterWrap.appendChild(scatterTitle);
      var scatterNote = document.createElement("p");
      scatterNote.className = "reit-note";
      scatterNote.textContent = "Each point represents a market segment. Size indicates observation count.";
      scatterWrap.appendChild(scatterNote);
      var scatterCanvas = document.createElement("canvas");
      scatterCanvas.width = 600;
      scatterCanvas.height = 300;
      scatterCanvas.setAttribute("aria-label", "Scatter chart: rental growth (X) vs gross yield (Y) by property type; bubble size = demand score");
      scatterWrap.appendChild(scatterCanvas);
      root.appendChild(scatterWrap);
      // Defer render until next frame so canvas is in DOM
      setTimeout(function () {
        Charts.renderScatterChart(scatterCanvas, state.markets, state.ranked);
      }, 0);
    }
  }

  // ─── Control panel ─────────────────────────────────────────────────────────

  function buildControlPanel() {
    var panel = document.createElement("div");
    panel.className = "reit-control-panel";

    // Investment amount
    panel.appendChild(buildInvestmentRow());

    // Preset buttons
    panel.appendChild(buildPresetRow());

    // Weight sliders
    panel.appendChild(buildWeightSliders());

    return panel;
  }

  function buildInvestmentRow() {
    var row = document.createElement("div");
    row.className = "reit-investment-row";

    var label = document.createElement("label");
    label.textContent = "Investment Amount (₹ Cr)";
    label.className = "reit-weight-label";

    var input = document.createElement("input");
    input.type = "number";
    input.min  = "1";
    input.max  = "500";
    input.step = "1";
    input.value = state.investmentCr;
    input.className = "reit-investment-input";
    input.addEventListener("change", function () {
      var v = parseFloat(this.value);
      if (v > 0 && isFinite(v)) {
        state.investmentCr = v;
        runScoring();
        render(document.getElementById(ROOT_ID));
      }
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function buildPresetRow() {
    var row = document.createElement("div");
    row.className = "reit-preset-row";

    var label = document.createElement("span");
    label.className = "reit-preset-label";
    label.textContent = "Preset:";
    row.appendChild(label);

    var presets = ["balanced", "incomeFocused", "growthFocused", "diversFocused"];
    presets.forEach(function (key) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reit-preset-btn" + (state.weightPreset === key ? " reit-preset-active" : "");
      btn.textContent = ScoringEngine.PRESETS[key].label;
      btn.addEventListener("click", function () {
        state.weights      = Object.assign({}, ScoringEngine.PRESETS[key]);
        state.weightPreset = key;
        runScoring();
        render(document.getElementById(ROOT_ID));
      });
      row.appendChild(btn);
    });

    return row;
  }

  function buildWeightSliders() {
    var wrap = document.createElement("div");
    wrap.className = "reit-weight-sliders";

    var factors = [
      { key: "yieldWeight",  label: "Rental Yield" },
      { key: "growthWeight", label: "Rental Growth" },
      { key: "diversWeight", label: "Diversification" },
      { key: "demandWeight", label: "Demand Strength" },
      { key: "riskWeight",   label: "Low Market Risk" }
    ];

    var total = 0;
    factors.forEach(function (f) { total += (state.weights[f.key] || 0); });
    var totalPct = Math.round(total * 100);
    var totalValid = Math.abs(total - 1.0) <= 0.005;

    var totalRow = document.createElement("div");
    totalRow.className = "reit-weight-total" + (totalValid ? " reit-weight-ok" : " reit-weight-err");
    totalRow.textContent = "Total: " + totalPct + "% " + (totalValid ? "✓" : "— weights must sum to 100%");
    wrap.appendChild(totalRow);

    factors.forEach(function (f) {
      var row = document.createElement("div");
      row.className = "reit-weight-row";

      var lbl = document.createElement("span");
      lbl.className = "reit-weight-label";
      lbl.textContent = f.label;

      var slider = document.createElement("input");
      slider.type  = "range";
      slider.min   = "0";
      slider.max   = "100";
      slider.step  = "5";
      slider.value = Math.round((state.weights[f.key] || 0) * 100);
      slider.className = "reit-weight-slider";

      var valSpan = document.createElement("span");
      valSpan.className = "reit-weight-value";
      valSpan.textContent = slider.value + "%";

      slider.addEventListener("input", function () {
        valSpan.textContent = this.value + "%";
      });
      slider.addEventListener("change", function () {
        state.weights[f.key] = parseInt(this.value, 10) / 100;
        state.weightPreset = "custom";
        var wv = ScoringEngine.validateWeights(state.weights);
        if (wv.valid) {
          runScoring();
        }
        render(document.getElementById(ROOT_ID));
      });

      row.appendChild(lbl);
      row.appendChild(slider);
      row.appendChild(valSpan);
      wrap.appendChild(row);
    });

    return wrap;
  }

  // ─── Ranked table ──────────────────────────────────────────────────────────

  function buildRankedTable() {
    var wrap = document.createElement("div");

    if (!state.ranked || state.ranked.length === 0) {
      var msg = document.createElement("p");
      msg.textContent = "No valid markets to rank.";
      wrap.appendChild(msg);
      return wrap;
    }

    var wv = ScoringEngine.validateWeights(state.weights);
    if (!wv.valid) {
      var errMsg = document.createElement("p");
      errMsg.className = "reit-weight-err-msg";
      errMsg.textContent = "Weights are invalid: " + wv.errors.join("; ");
      wrap.appendChild(errMsg);
      return wrap;
    }

    var visibleRows = state.showAll ? state.ranked : state.ranked.slice(0, TOP_N);

    var tbl = document.createElement("table");
    tbl.className = "reit-ranked-table";

    // Header
    var thead = document.createElement("thead");
    var hrow  = document.createElement("tr");
    var headers = [
      "#", "Market", "City", "Type", "Score",
      "Gross Yield", "Growth", "Demand",
      "City HHI Δ", "Type HHI Δ",
      "Obs.", "Conf.", "Detail", "Select"
    ];
    headers.forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    tbl.appendChild(thead);

    var tbody = document.createElement("tbody");

    visibleRows.forEach(function (m) {
      // Main data row
      var tr = document.createElement("tr");
      tr.className = "reit-market-row" + (m.marketId === state.selectedId ? " reit-selected-row" : "");

      var cityDelta = null, typeDelta = null;
      if (m.simulation) {
        cityDelta = m.simulation.after.cityHHI - m.simulation.before.cityHHI;
        typeDelta = m.simulation.after.typeHHI - m.simulation.before.typeHHI;
      }

      var cells = [
        { text: m.rank },
        { text: m.locality },
        { text: m.city },
        { text: m.propertyType },
        { text: m.totalScore.toFixed(1) },
        { text: (m.grossYield * 100).toFixed(2) + "%" },
        { text: (m.annualRentalGrowthRatio * 100).toFixed(1) + "%" },
        { text: m.demandScore },
        { text: cityDelta !== null ? formatHHIDelta(cityDelta) : "—", cls: cityDelta !== null ? hhiDeltaClass(cityDelta) : "" },
        { text: typeDelta !== null ? formatHHIDelta(typeDelta) : "—", cls: typeDelta !== null ? hhiDeltaClass(typeDelta) : "" },
        { text: m.observationCount || "—" },
        { conf: m.confidenceGrade || null }
      ];

      cells.forEach(function (c) {
        var td = document.createElement("td");
        if (c.conf !== undefined) {
          // Confidence badge cell
          if (c.conf) {
            var badge = document.createElement("span");
            badge.className = "reit-conf-badge reit-conf-" + c.conf.toLowerCase();
            badge.title = "Data confidence grade " + c.conf + " (A=highest, E=lowest)";
            badge.textContent = c.conf;
            td.appendChild(badge);
          } else {
            td.textContent = "—";
          }
        } else {
          td.textContent = c.text;
        }
        if (c.cls) { td.className = c.cls; }
        tr.appendChild(td);
      });

      // Detail toggle
      var tdDetail = document.createElement("td");
      var detailBtn = document.createElement("button");
      detailBtn.type = "button";
      detailBtn.className = "reit-breakdown-toggle";
      var isOpen = state.expanded === m.marketId;
      detailBtn.textContent = isOpen ? "▲ Hide" : "▼ Show";
      detailBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      detailBtn.addEventListener("click", function () {
        state.expanded = (state.expanded === m.marketId) ? null : m.marketId;
        render(document.getElementById(ROOT_ID));
      });
      tdDetail.appendChild(detailBtn);
      tr.appendChild(tdDetail);

      // Select target
      var tdSel = document.createElement("td");
      var selBtn = document.createElement("button");
      selBtn.type = "button";
      selBtn.className = "reit-select-btn" + (m.marketId === state.selectedId ? " reit-select-active" : "");
      selBtn.textContent = m.marketId === state.selectedId ? "✓ Selected" : "Select";
      selBtn.addEventListener("click", function () {
        state.selectedId = m.marketId;
        // Update shared state selectedTargetId
        var saved = ReitState.load();
        if (saved) {
          saved.selectedTargetId = m.marketId;
          ReitState.save(saved);
        }
        render(document.getElementById(ROOT_ID));
      });
      tdSel.appendChild(selBtn);
      tr.appendChild(tdSel);

      tbody.appendChild(tr);

      // Breakdown row (expanded)
      if (state.expanded === m.marketId) {
        var expandTr = document.createElement("tr");
        expandTr.className = "reit-breakdown-wrap";
        var expandTd = document.createElement("td");
        expandTd.colSpan = headers.length;
        expandTd.appendChild(buildBreakdown(m));
        expandTr.appendChild(expandTd);
        tbody.appendChild(expandTr);
      }
    });

    tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    // Show all / show less button
    if (state.ranked.length > TOP_N) {
      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "reit-show-all-btn";
      toggleBtn.textContent = state.showAll
        ? "Show top " + TOP_N + " only"
        : "Show all " + state.ranked.length + " markets";
      toggleBtn.addEventListener("click", function () {
        state.showAll = !state.showAll;
        render(document.getElementById(ROOT_ID));
      });
      wrap.appendChild(toggleBtn);
    }

    return wrap;
  }

  function formatHHIDelta(delta) {
    var sign = delta < 0 ? "" : "+";
    return sign + delta.toFixed(4);
  }

  function hhiDeltaClass(delta) {
    if (delta < -0.0001) { return "reit-hhi-improved"; }
    if (delta >  0.0001) { return "reit-hhi-worsened"; }
    return "reit-hhi-neutral";
  }

  // ─── Score breakdown panel ─────────────────────────────────────────────────

  function buildBreakdown(m) {
    var div = document.createElement("div");
    div.className = "reit-breakdown-inner";

    var tbl = document.createElement("table");
    tbl.className = "reit-breakdown-table";

    var rows = [
      ["Factor", "Raw value", "Normalised (0–100)", "Weight", "Contribution"],
      [
        "Rental Yield",
        (m.grossYield * 100).toFixed(2) + "%",
        m.factors.yieldScore.toFixed(1),
        Math.round(state.weights.yieldWeight * 100) + "%",
        m.contributions.yieldContrib.toFixed(2)
      ],
      [
        "Rental Growth",
        (m.annualRentalGrowthRatio * 100).toFixed(1) + "%",
        m.factors.growthScore.toFixed(1),
        Math.round(state.weights.growthWeight * 100) + "%",
        m.contributions.growthContrib.toFixed(2)
      ],
      [
        "Diversification",
        "—",
        m.factors.diversScore.toFixed(1),
        Math.round(state.weights.diversWeight * 100) + "%",
        m.contributions.diversContrib.toFixed(2)
      ],
      [
        "Demand Strength",
        m.demandScore,
        m.factors.demandScore.toFixed(1),
        Math.round(state.weights.demandWeight * 100) + "%",
        m.contributions.demandContrib.toFixed(2)
      ],
      [
        "Low Market Risk",
        "Risk score: " + m.riskScore + " → inverted: " + m.factors.lowRisk,
        m.factors.riskScore.toFixed(1),
        Math.round(state.weights.riskWeight * 100) + "%",
        m.contributions.riskContrib.toFixed(2)
      ],
      [
        "Composite Score", "", "", "", m.totalScore.toFixed(2)
      ]
    ];

    rows.forEach(function (r, i) {
      var tr = document.createElement("tr");
      if (i === 0) { tr.className = "reit-breakdown-header"; }
      if (i === rows.length - 1) { tr.className = "reit-breakdown-total"; }
      r.forEach(function (cell) {
        var el = document.createElement(i === 0 ? "th" : "td");
        el.textContent = cell;
        tr.appendChild(el);
      });
      tbl.appendChild(tr);
    });

    div.appendChild(tbl);

    // HHI simulation sub-section
    if (m.simulation) {
      var hhiDiv = document.createElement("div");
      hhiDiv.className = "reit-breakdown-hhi";
      var hh = document.createElement("p");
      hh.className = "reit-breakdown-hhi-title";
      hh.textContent = "HHI impact of ₹" + state.investmentCr + " Cr investment:";
      hhiDiv.appendChild(hh);

      var hhiTbl = document.createElement("table");
      hhiTbl.className = "reit-hhi-mini-table";
      var hrow = document.createElement("tr");
      ["Metric", "Before", "After", "Change", "Assessment"].forEach(function (h) {
        var th = document.createElement("th"); th.textContent = h; hrow.appendChild(th);
      });
      hhiTbl.appendChild(hrow);

      var sim = m.simulation;
      var cityDelta = sim.after.cityHHI - sim.before.cityHHI;
      var typeDelta = sim.after.typeHHI - sim.before.typeHHI;

      [
        {
          label: "City HHI",
          before: sim.before.cityHHI,
          after: sim.after.cityHHI,
          delta: cityDelta
        },
        {
          label: "Asset-type HHI",
          before: sim.before.typeHHI,
          after: sim.after.typeHHI,
          delta: typeDelta
        }
      ].forEach(function (row) {
        var tr = document.createElement("tr");
        var improved = row.delta < -0.0001;
        var worsened = row.delta >  0.0001;
        var assessment = improved ? "Concentration improved" : worsened ? "Concentration worsened" : "Unchanged";
        var cls = improved ? "reit-hhi-improved" : worsened ? "reit-hhi-worsened" : "reit-hhi-neutral";

        [row.label,
         row.before.toFixed(4),
         row.after.toFixed(4),
         (row.delta < 0 ? "" : "+") + row.delta.toFixed(4),
         assessment
        ].forEach(function (cell, ci) {
          var td = document.createElement("td");
          if (ci >= 3) { td.className = cls; }
          td.textContent = cell;
          tr.appendChild(td);
        });
        hhiTbl.appendChild(tr);
      });

      hhiDiv.appendChild(hhiTbl);
      div.appendChild(hhiDiv);
    }

    // Uncertainty ranges (v2.0)
    var mkt = null;
    for (var i = 0; i < state.markets.length; i++) {
      if (state.markets[i].marketId === m.marketId) { mkt = state.markets[i]; break; }
    }
    if (mkt && mkt.uncertainty) {
      var u = mkt.uncertainty;
      var uDiv = document.createElement("div");
      uDiv.className = "reit-uncertainty-panel";
      var uTitle = document.createElement("p");
      uTitle.className = "reit-uncertainty-title";
      uTitle.textContent = "Uncertainty ranges (90% credible interval):";
      uDiv.appendChild(uTitle);
      var uTbl = document.createElement("table");
      uTbl.className = "reit-uncertainty-table";
      var uHead = document.createElement("tr");
      ["Factor", "Lower", "Central", "Upper", "Basis"].forEach(function (h) {
        var th = document.createElement("th"); th.textContent = h; uHead.appendChild(th);
      });
      uTbl.appendChild(uHead);
      var uRows = [];
      if (u.grossYieldPct) { uRows.push({ label: "Gross Yield", d: u.grossYieldPct, fmt: function(v){ return v.toFixed(2) + "%"; } }); }
      if (u.rentalGrowthPct) { uRows.push({ label: "Rental Growth", d: u.rentalGrowthPct, fmt: function(v){ return v.toFixed(2) + "%"; } }); }
      if (u.demandScore) { uRows.push({ label: "Demand Score", d: u.demandScore, fmt: function(v){ return v.toFixed(0); } }); }
      if (u.riskScore) { uRows.push({ label: "Risk Score", d: u.riskScore, fmt: function(v){ return v.toFixed(0); } }); }
      uRows.forEach(function (row) {
        var tr = document.createElement("tr");
        [row.label, row.fmt(row.d.lower), row.fmt(row.d.central), row.fmt(row.d.upper), row.d.basis || "—"]
          .forEach(function (cell) {
            var td = document.createElement("td"); td.textContent = cell; tr.appendChild(td);
          });
        uTbl.appendChild(tr);
      });
      uDiv.appendChild(uTbl);
      if (mkt.methodologyNote) {
        var mNote = document.createElement("p");
        mNote.className = "reit-methodology-note";
        mNote.textContent = "ⓘ " + mkt.methodologyNote;
        uDiv.appendChild(mNote);
      }
      if (mkt.comparabilityWarning) {
        var cWarn = document.createElement("p");
        cWarn.className = "reit-comparability-warning";
        cWarn.textContent = "⚠ " + mkt.comparabilityWarning;
        uDiv.appendChild(cWarn);
      }
      div.appendChild(uDiv);
    }

    // Chart 3: Factor contribution bars
    if (typeof Charts !== 'undefined') {
      var fbId = "sc-fb-" + String(m.marketId).replace(/[^a-zA-Z0-9]/g, "_");
      var fbWrap = document.createElement("div");
      fbWrap.id = fbId;
      fbWrap.style.marginTop = "0.75rem";
      div.appendChild(fbWrap);
      Charts.renderFactorBars(fbId, [m], 1);
    }

    return div;
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());

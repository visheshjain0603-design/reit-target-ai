/**
 * marketScreen.js — Market Screener page controller
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WRITES the shared analysis state (ReitState) after every scoring run.
 * Overview, Diversification, Agent Output and Decision Report READ it.
 *
 * Depends on: hhi.js, scoringEngine.js, stateManager.js, uiHelpers.js,
 *             appMeta.js, governance.js, filters.js, charts.js
 *
 * THREE THINGS THIS PAGE KEEPS SEPARATE, DELIBERATELY
 * ---------------------------------------------------
 *   scoring      how attractive a segment looks, from the five weighted
 *                factors. Unchanged by anything below: filters and the
 *                evidence floor never rescore or reorder a single row.
 *
 *   evidence     whether the segment's estimate rests on enough data to carry
 *                a recommendation (governance.js). Shown beside the score as a
 *                second axis, never folded into it.
 *
 *   display      which of the fifty rows are on screen (filters.js). Ranks
 *                shown are always ranks within the full fifty, so "rank 12"
 *                means twelfth of fifty even in a three-row filtered view.
 *
 * Conflating any two of these would make a number mean something different on
 * this page than it means on every other page.
 */

(function () {
  "use strict";

  var ROOT_ID = "screener-content";

  // ─── State ────────────────────────────────────────────────────────────────

  var state = {
    markets:        [],
    assets:         [],
    marketsDoc:     null,
    portfolioValue: 0,
    weights:        null,
    weightPreset:   "balanced",
    investmentCr:   0,
    ranked:         [],        // all 50, scored and ordered — never filtered
    filters:        null,
    filterDomains:  null,
    filtersOpen:    false,
    govOverride:    false,
    governance:     null,      // result of Governance.chooseTarget
    expanded:       null,      // marketId of the one open breakdown row
    selectedId:     null,
    obsDist:        null,      // observation-distribution.json, loaded lazily
    obsDistPending: null,
    loading:        true,
    error:          null,
    showAll:        false
  };

  var TOP_N = 10;   // rows shown before "show all"

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    showLoading(root);

    state.filters = Filters.defaults();

    // Restore what the user last chose, where it is still valid.
    var saved = ReitState.load();
    if (saved) {
      if (saved.selectedTargetId) { state.selectedId = saved.selectedTargetId; }
      if (saved.investmentCr > 0)  { state.investmentCr = saved.investmentCr; }
      if (saved.governanceOverride) { state.govOverride = true; }
      if (saved.weights && ScoringEngine.validateWeights(saved.weights).valid) {
        state.weights = saved.weights;
        state.weightPreset = saved.weightPreset || "custom";
      }
    }

    Promise.all([
      fetch("data/markets.json").then(function (r) { return r.json(); }),
      fetch("data/portfolio.json").then(function (r) { return r.json(); })
    ]).then(function (results) {
      state.marketsDoc     = results[0];
      state.markets        = results[0].markets || [];
      state.assets         = results[1].assets  || [];
      state.portfolioValue = HHIEngine.totalValue(state.assets);
      state.filterDomains  = Filters.describe(state.markets);

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

    for (var i = 0; i < r.ranked.length; i++) {
      r.ranked[i].simulation = investmentRs > 0
        ? HHIEngine.simulateInvestment(state.assets, r.ranked[i], investmentRs)
        : null;
    }
    state.ranked = r.ranked;

    /* Evidence eligibility, computed on the full ranking. This annotates and
     * chooses; it does not reorder. state.ranked stays in score order. */
    state.governance = Governance.chooseTarget(state.ranked, { override: state.govOverride });

    /*
     * Which segment is the target?
     *
     * An explicit choice by the user wins, always — including a choice of a
     * segment below the evidence floor, because the override toggle is not the
     * only way to express that intent and second-guessing a direct click would
     * be worse than honouring it. The segment stays marked either way.
     *
     * With no explicit choice, the default is the governance recommendation,
     * NOT simply rank 1. Before this page applied an evidence floor the default
     * was rank 1 outright, which under three of the four presets meant
     * recommending a segment built on 26 observations at confidence grade D.
     */
    var explicit = null;
    if (state.selectedId) {
      for (var j = 0; j < state.ranked.length; j++) {
        if (state.ranked[j].marketId === state.selectedId) { explicit = state.ranked[j]; break; }
      }
    }
    var target = explicit ||
                 state.governance.target ||
                 state.governance.topOverall ||
                 null;
    state.selectedId = target ? target.marketId : null;

    var top = state.ranked[0] || null;
    var cityBefore = null, cityAfter = null, typeBefore = null, typeAfter = null;
    /* The HHI before/after figures recorded for the rest of the application
     * must describe the SELECTED target, not rank 1. They previously described
     * rank 1 regardless of what the user had chosen, so the Diversification
     * page and the report could show the concentration effect of a different
     * market from the one named beside it. */
    if (target && target.simulation) {
      cityBefore = target.simulation.before.cityHHI;
      cityAfter  = target.simulation.after.cityHHI;
      typeBefore = target.simulation.before.typeHHI;
      typeAfter  = target.simulation.after.typeHHI;
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
      assetCount:       state.assets.length,

      // Evidence governance, recorded so the report can state it rather than
      // recompute it and risk disagreeing with what the user saw.
      governanceOverride:   state.govOverride,
      recommendedTargetId:  state.governance.target ? state.governance.target.marketId : null,
      topOverallId:         top ? top.marketId : null,
      outrankedCount:       state.governance.outranked.length,
      eligibleCount:        state.governance.eligibleCount,
      governanceNote:       state.governance.note,
      targetMeetsFloor:     target ? !!(target.governance && target.governance.eligible) : null,
      userOverrodeTarget:   !!(explicit && state.governance.target &&
                               explicit.marketId !== state.governance.target.marketId)
    });
  }

  function rerender() {
    var root = document.getElementById(ROOT_ID);
    if (root) { render(root); }
  }

  function rescoreAndRender() {
    runScoring();
    rerender();
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

    root.appendChild(buildRecommendationBanner());
    root.appendChild(buildControlPanel());
    root.appendChild(buildFilterPanel());
    root.appendChild(buildRankedTable());
    root.appendChild(buildScatter());
  }

  // ─── Recommendation banner (two-dimensional result) ───────────────────────

  function buildRecommendationBanner() {
    var wrap = document.createElement("div");
    wrap.className = "reit-rec-banner";
    var g = state.governance;
    if (!g) { return wrap; }

    var R = Governance.rules();

    var h = document.createElement("h2");
    h.className = "reit-rec-title";
    h.textContent = "Recommended target";
    wrap.appendChild(h);

    var target = null;
    for (var i = 0; i < state.ranked.length; i++) {
      if (state.ranked[i].marketId === state.selectedId) { target = state.ranked[i]; break; }
    }

    if (!target) {
      var none = document.createElement("p");
      none.className = "reit-rec-none";
      none.textContent = g.note;
      wrap.appendChild(none);
      return wrap;
    }

    /* Two columns, two dimensions. Score on the left, strength of evidence on
     * the right, each with its own units. A single blended "quality" figure was
     * considered and rejected: it would have hidden exactly the trade-off the
     * reader needs to see. */
    var grid = document.createElement("div");
    grid.className = "reit-rec-grid";

    grid.appendChild(recCell("Segment",
      (target.locality || target.marketId) + ", " + target.city,
      target.propertyType + " · " + (target.localityClass || "—") + " · rank " +
      target.rank + " of " + state.ranked.length));

    grid.appendChild(recCell("Composite score",
      target.totalScore.toFixed(1) + " / 100",
      "How attractive the segment looks on the five weighted factors"));

    var gov = target.governance || Governance.evaluate(target);
    grid.appendChild(recCell("Evidence",
      gov.tier + " — grade " + (gov.grade || "?") + ", " + gov.observations + " obs",
      gov.eligible
        ? "Meets the floor of " + R.MIN_OBSERVATIONS + " observations and grade " + R.MIN_GRADE
        : "Below the floor: " + gov.reasons.join("; ")));

    grid.appendChild(recCell("Investment",
      AppMeta.cr(state.investmentCr * 1e7, 2),
      ScoringEngine.PRESETS[state.weightPreset]
        ? ScoringEngine.PRESETS[state.weightPreset].label + " weights"
        : "Custom weights"));

    wrap.appendChild(grid);

    var note = document.createElement("p");
    note.className = "reit-rec-note" +
      (gov.eligible ? " reit-rec-note-ok" : " reit-rec-note-warn");
    note.textContent = g.note;
    wrap.appendChild(note);

    /* When the highest-scoring segment is not the recommendation, show it
     * anyway, with its real score and the reason. Hiding it would be the wrong
     * kind of tidy: the reader is entitled to see what the score alone would
     * have chosen. */
    if (g.topOverall && g.topOverall.marketId !== target.marketId) {
      var tg = g.topOverall.governance || Governance.evaluate(g.topOverall);
      var alt = document.createElement("p");
      alt.className = "reit-rec-alt";
      alt.textContent = "Highest score overall: " +
        (g.topOverall.locality || g.topOverall.marketId) + ", " + g.topOverall.city +
        " at " + g.topOverall.totalScore.toFixed(1) + " / 100 — " +
        (tg.eligible ? "not selected because another segment was chosen explicitly."
                     : "not recommended because it is below the evidence floor (" +
                       tg.reasons.join("; ") + ").");
      wrap.appendChild(alt);
    }

    wrap.appendChild(buildOverrideToggle());
    return wrap;
  }

  function recCell(label, value, sub) {
    var cell = document.createElement("div");
    cell.className = "reit-rec-cell";
    var l = document.createElement("div");
    l.className = "reit-rec-cell-label";
    l.textContent = label;
    var v = document.createElement("div");
    v.className = "reit-rec-cell-value";
    v.textContent = value;
    cell.appendChild(l);
    cell.appendChild(v);
    if (sub) {
      var s = document.createElement("div");
      s.className = "reit-rec-cell-sub";
      s.textContent = sub;
      cell.appendChild(s);
    }
    return cell;
  }

  function buildOverrideToggle() {
    var R = Governance.rules();
    var row = document.createElement("div");
    row.className = "reit-gov-override";

    var id = "gov-override";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = state.govOverride;
    cb.addEventListener("change", function () {
      state.govOverride = this.checked;
      /* Clear any explicit pick so the toggle visibly does something: with a
       * manual selection still in place the recommendation would not move and
       * the control would look broken. */
      state.selectedId = null;
      rescoreAndRender();
    });

    var label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = R.overrideLabel;

    row.appendChild(cb);
    row.appendChild(label);

    var note = document.createElement("p");
    note.className = "reit-gov-override-note";
    note.textContent = R.overrideNote + " Floor: " + R.MIN_OBSERVATIONS +
      " observations and grade " + R.MIN_GRADE + " or better. " + R.rationale;
    row.appendChild(note);

    return row;
  }

  // ─── Control panel ─────────────────────────────────────────────────────────

  function buildControlPanel() {
    var panel = document.createElement("div");
    panel.className = "reit-control-panel";
    panel.appendChild(buildInvestmentRow());
    panel.appendChild(buildPresetRow());
    panel.appendChild(buildWeightSliders());
    return panel;
  }

  function buildInvestmentRow() {
    var row = document.createElement("div");
    row.className = "reit-investment-row";

    var input = document.createElement("input");
    input.type = "number";
    input.min  = "1";
    input.max  = "500";
    input.step = "1";
    input.id    = "screener-investment";
    input.value = state.investmentCr;
    input.className = "reit-investment-input";
    input.addEventListener("change", function () {
      var v = parseFloat(this.value);
      if (v > 0 && isFinite(v)) {
        state.investmentCr = v;
        rescoreAndRender();
      }
    });

    var label = document.createElement("label");
    label.textContent = "Investment Amount (₹ Cr)";
    label.className = "reit-weight-label";
    label.setAttribute("for", input.id);

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

    ["balanced", "incomeFocused", "growthFocused", "diversFocused"].forEach(function (key) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reit-preset-btn" + (state.weightPreset === key ? " reit-preset-active" : "");
      btn.setAttribute("aria-pressed", state.weightPreset === key ? "true" : "false");
      btn.textContent = ScoringEngine.PRESETS[key].label;
      btn.addEventListener("click", function () {
        state.weights      = Object.assign({}, ScoringEngine.PRESETS[key]);
        state.weightPreset = key;
        /* A new preset produces a new ranking, so a target chosen under the old
         * one is no longer a considered choice. Clear it and let governance
         * pick again. */
        state.selectedId = null;
        rescoreAndRender();
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
    totalRow.setAttribute("role", "status");
    totalRow.textContent = "Total: " + totalPct + "% " + (totalValid ? "✓" : "— weights must sum to 100%");
    wrap.appendChild(totalRow);

    factors.forEach(function (f) {
      var row = document.createElement("div");
      row.className = "reit-weight-row";

      var slider = document.createElement("input");
      slider.type  = "range";
      slider.min   = "0";
      slider.max   = "100";
      slider.step  = "5";
      slider.id    = "w-" + f.key;
      slider.value = Math.round((state.weights[f.key] || 0) * 100);
      slider.className = "reit-weight-slider";

      var lbl = document.createElement("label");
      lbl.className = "reit-weight-label";
      lbl.textContent = f.label;
      lbl.setAttribute("for", slider.id);

      var valSpan = document.createElement("span");
      valSpan.className = "reit-weight-value";
      valSpan.textContent = slider.value + "%";

      slider.addEventListener("input", function () {
        valSpan.textContent = this.value + "%";
      });
      slider.addEventListener("change", function () {
        state.weights[f.key] = parseInt(this.value, 10) / 100;
        state.weightPreset = "custom";
        state.selectedId = null;
        if (ScoringEngine.validateWeights(state.weights).valid) {
          runScoring();
        }
        rerender();
      });

      row.appendChild(lbl);
      row.appendChild(slider);
      row.appendChild(valSpan);
      wrap.appendChild(row);
    });

    return wrap;
  }

  // ─── Filters ───────────────────────────────────────────────────────────────

  function filterResult() {
    return Filters.apply(Governance.annotate(state.ranked), state.filters);
  }

  function buildFilterPanel() {
    var wrap = document.createElement("section");
    wrap.className = "reit-filter-panel";
    wrap.setAttribute("aria-labelledby", "filter-toggle");

    var result = filterResult();
    var active = Filters.activeNames(state.filters);

    var head = document.createElement("div");
    head.className = "reit-filter-head";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "filter-toggle";
    toggle.className = "reit-filter-toggle";
    toggle.setAttribute("aria-expanded", state.filtersOpen ? "true" : "false");
    toggle.setAttribute("aria-controls", "filter-body");
    toggle.textContent = (state.filtersOpen ? "▲ " : "▼ ") + "Filters" +
      (active.length ? " (" + active.length + " active)" : "");
    toggle.addEventListener("click", function () {
      state.filtersOpen = !state.filtersOpen;
      rerender();
    });
    head.appendChild(toggle);

    var count = document.createElement("span");
    count.className = "reit-filter-count";
    count.setAttribute("role", "status");
    count.textContent = Filters.summary(state.filters, result);
    head.appendChild(count);

    if (active.length) {
      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "reit-filter-reset";
      reset.textContent = "Reset filters";
      reset.addEventListener("click", function () {
        state.filters = Filters.defaults();
        rerender();
      });
      head.appendChild(reset);
    }

    wrap.appendChild(head);

    var body = document.createElement("div");
    body.id = "filter-body";
    body.className = "reit-filter-body";
    if (!state.filtersOpen) { body.hidden = true; }

    var d = state.filterDomains || Filters.describe(state.markets);

    body.appendChild(checkGroup("City", "cities", d.cities));
    body.appendChild(checkGroup("Property type", "propertyTypes", d.propertyTypes));
    body.appendChild(checkGroup("Locality class", "localityClasses", d.localityClasses));
    body.appendChild(checkGroup("Confidence grade", "grades", d.grades,
      "A is best, E weakest. Grades record how well a segment's estimate is evidenced."));

    body.appendChild(numberPair("Gross yield (%)", "yieldMin", "yieldMax",
      d.yieldPct.min, d.yieldPct.max, 0.1));
    body.appendChild(numberPair("Rental growth (% p.a.)", "growthMin", "growthMax",
      d.growthPct.min, d.growthPct.max, 0.1));
    body.appendChild(numberSingle("Maximum risk score", "riskMax",
      d.riskScore.min, d.riskScore.max, 1,
      "Risk runs 0–100 and lower is better, so this is an upper bound."));
    body.appendChild(numberSingle("Minimum observations", "minObservations",
      d.observations.min, d.observations.max, 1,
      "Simulated market observations behind the segment's median. Range in this dataset: " +
      d.observations.min + "–" + d.observations.max + "."));

    body.appendChild(eligibleOnlyRow());

    wrap.appendChild(body);

    /* An empty result is reported, never rendered as a blank table. */
    if (result.keptCount === 0 && active.length) {
      var empty = document.createElement("p");
      empty.className = "reit-filter-empty";
      empty.textContent = "No market segment matches every active filter. " +
        "Reset the filters, or relax the one excluding the most segments.";
      wrap.appendChild(empty);
    }

    return wrap;
  }

  function fieldset(legendText, hint) {
    var fs = document.createElement("fieldset");
    fs.className = "reit-filter-group";
    var lg = document.createElement("legend");
    lg.textContent = legendText;
    fs.appendChild(lg);
    if (hint) {
      var h = document.createElement("p");
      h.className = "reit-filter-hint";
      h.textContent = hint;
      fs.appendChild(h);
    }
    return fs;
  }

  function checkGroup(legendText, key, options, hint) {
    var fs = fieldset(legendText, hint);
    (options || []).forEach(function (opt) {
      var id = "f-" + key + "-" + String(opt).replace(/[^a-zA-Z0-9]/g, "_");
      var wrapper = document.createElement("span");
      wrapper.className = "reit-filter-check";

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.checked = (state.filters[key] || []).indexOf(opt) !== -1;
      cb.addEventListener("change", function () {
        var list = (state.filters[key] || []).slice();
        var at = list.indexOf(opt);
        if (this.checked && at === -1) { list.push(opt); }
        if (!this.checked && at !== -1) { list.splice(at, 1); }
        state.filters[key] = list;
        rerender();
      });

      var lb = document.createElement("label");
      lb.setAttribute("for", id);
      lb.textContent = String(opt);

      wrapper.appendChild(cb);
      wrapper.appendChild(lb);
      fs.appendChild(wrapper);
    });
    return fs;
  }

  function numberInput(key, placeholder, min, max, step) {
    var inp = document.createElement("input");
    inp.type = "number";
    inp.className = "reit-filter-number";
    inp.id = "f-" + key;
    inp.step = String(step);
    inp.min  = String(Math.floor(min * 10) / 10);
    inp.max  = String(Math.ceil(max * 10) / 10);
    inp.placeholder = placeholder;
    inp.value = (state.filters[key] === null || state.filters[key] === undefined)
      ? "" : state.filters[key];
    inp.addEventListener("change", function () {
      var raw = this.value.trim();
      state.filters[key] = raw === "" ? null : parseFloat(raw);
      if (state.filters[key] !== null && !isFinite(state.filters[key])) {
        state.filters[key] = null;
      }
      rerender();
    });
    return inp;
  }

  function numberPair(legendText, minKey, maxKey, lo, hi, step) {
    var fs = fieldset(legendText,
      "Range in this dataset: " + lo.toFixed(2) + " to " + hi.toFixed(2) + ". Leave blank for no bound.");
    var minIn = numberInput(minKey, "min " + lo.toFixed(1), lo, hi, step);
    var maxIn = numberInput(maxKey, "max " + hi.toFixed(1), lo, hi, step);

    var l1 = document.createElement("label");
    l1.setAttribute("for", minIn.id); l1.textContent = "From";
    var l2 = document.createElement("label");
    l2.setAttribute("for", maxIn.id); l2.textContent = "to";

    fs.appendChild(l1); fs.appendChild(minIn);
    fs.appendChild(l2); fs.appendChild(maxIn);
    return fs;
  }

  function numberSingle(legendText, key, lo, hi, step, hint) {
    var fs = fieldset(legendText, hint);
    var inp = numberInput(key, String(Math.round(hi)), lo, hi, step);
    var lb = document.createElement("label");
    lb.setAttribute("for", inp.id);
    lb.textContent = legendText;
    lb.className = "reit-sr-only";
    fs.appendChild(lb);
    fs.appendChild(inp);
    return fs;
  }

  function eligibleOnlyRow() {
    var R = Governance.rules();
    var fs = fieldset("Evidence floor",
      "Show only segments with at least " + R.MIN_OBSERVATIONS +
      " observations and confidence grade " + R.MIN_GRADE + " or better.");
    var id = "f-eligibleOnly";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = !!state.filters.eligibleOnly;
    cb.addEventListener("change", function () {
      state.filters.eligibleOnly = this.checked;
      rerender();
    });
    var lb = document.createElement("label");
    lb.setAttribute("for", id);
    lb.textContent = "Segments meeting the evidence floor only";
    var sum = Governance.summarise(state.markets);
    var note = document.createElement("p");
    note.className = "reit-filter-hint";
    note.textContent = sum.eligible + " of " + sum.total + " segments meet it (" +
      sum.failGradeOnly + " fail on grade alone, " + sum.failObsOnly +
      " on sample size alone, " + sum.failBoth + " on both).";
    fs.appendChild(cb);
    fs.appendChild(lb);
    fs.appendChild(note);
    return fs;
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

    var result = filterResult();
    var rows = result.kept;
    if (!rows.length) { return wrap; }

    var visibleRows = state.showAll ? rows : rows.slice(0, TOP_N);

    var tbl = document.createElement("table");
    tbl.className = "reit-ranked-table";

    var cap = document.createElement("caption");
    cap.className = "reit-table-caption";
    cap.textContent = "Market segments in composite-score order. Rank is the position " +
      "within all " + state.ranked.length + " segments, not within the filtered view. " +
      "Evidence is a separate judgement from score.";
    tbl.appendChild(cap);

    var headers = [
      "#", "Market", "City", "Type", "Score", "Evidence",
      "Gross Yield", "Growth", "Demand",
      "City HHI Δ", "Type HHI Δ",
      "Obs.", "Conf.", "Detail", "Select"
    ];

    var thead = document.createElement("thead");
    var hrow  = document.createElement("tr");
    headers.forEach(function (h) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = h;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    tbl.appendChild(thead);

    var tbody = document.createElement("tbody");

    visibleRows.forEach(function (m) {
      var gov = m.governance || Governance.evaluate(m);

      var tr = document.createElement("tr");
      tr.className = "reit-market-row" +
        (m.marketId === state.selectedId ? " reit-selected-row" : "") +
        (gov.eligible ? "" : " reit-row-below-floor");

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
        { evidence: gov },
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
        if (c.evidence) {
          var tier = document.createElement("span");
          tier.className = "reit-evidence-badge reit-evidence-" +
            c.evidence.tier.toLowerCase();
          tier.textContent = c.evidence.tier;
          tier.title = c.evidence.eligible
            ? c.evidence.label
            : c.evidence.label + ": " + c.evidence.reasons.join("; ");
          td.appendChild(tier);
        } else if (c.conf !== undefined) {
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
      detailBtn.setAttribute("aria-label",
        (isOpen ? "Hide" : "Show") + " score breakdown for " + m.locality + ", " + m.city);
      detailBtn.addEventListener("click", function () {
        state.expanded = (state.expanded === m.marketId) ? null : m.marketId;
        if (state.expanded) { ensureObsDist(); }
        rerender();
      });
      tdDetail.appendChild(detailBtn);
      tr.appendChild(tdDetail);

      // Select target
      var tdSel = document.createElement("td");
      var selBtn = document.createElement("button");
      selBtn.type = "button";
      selBtn.className = "reit-select-btn" + (m.marketId === state.selectedId ? " reit-select-active" : "");
      selBtn.textContent = m.marketId === state.selectedId ? "✓ Selected" : "Select";
      selBtn.setAttribute("aria-label",
        "Select " + m.locality + ", " + m.city + " as the investment target" +
        (gov.eligible ? "" : " (below the evidence floor)"));
      selBtn.addEventListener("click", function () {
        state.selectedId = m.marketId;
        rescoreAndRender();
      });
      tdSel.appendChild(selBtn);
      tr.appendChild(tdSel);

      tbody.appendChild(tr);

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

    /*
     * Why the two HHI delta columns repeat across rows.
     *
     * Geographic concentration depends on how much capital sits in each CITY,
     * not on which locality inside that city receives it. Investing a fixed
     * amount in any Pune market therefore moves the city HHI by exactly the
     * same amount. The same holds for the asset-type column: every Commercial
     * Office market shifts the type HHI identically.
     *
     * The repetition is arithmetically correct, but it reads as copy-paste
     * unless stated, so it is stated.
     */
    var hhiNote = document.createElement("p");
    hhiNote.className = "reit-note reit-hhi-note";
    hhiNote.textContent =
      "Note on the two HHI columns: markets in the same city show an identical " +
      "City HHI change because geographic concentration depends on the amount " +
      "allocated to the city, not on which locality within it is chosen. " +
      "Likewise, markets sharing a property type show an identical Type HHI " +
      "change. The repeated values are correct, not duplicated rows.";
    wrap.appendChild(hhiNote);

    if (rows.length > TOP_N) {
      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "reit-show-all-btn";
      toggleBtn.textContent = state.showAll
        ? "Show top " + TOP_N + " only"
        : "Show all " + rows.length + (Filters.isActive(state.filters) ? " matching" : "") + " markets";
      toggleBtn.addEventListener("click", function () {
        state.showAll = !state.showAll;
        rerender();
      });
      wrap.appendChild(toggleBtn);
    }

    return wrap;
  }

  function formatHHIDelta(delta) {
    return (delta < 0 ? "" : "+") + delta.toFixed(4);
  }

  function hhiDeltaClass(delta) {
    if (delta < -0.0001) { return "reit-hhi-improved"; }
    if (delta >  0.0001) { return "reit-hhi-worsened"; }
    return "reit-hhi-neutral";
  }

  // ─── Observation Distribution ──────────────────────────────────────────────

  /*
   * Loaded lazily and once. The summaries are precomputed by
   * data-pipeline/scripts/buildObservationDistribution.js, so nothing is
   * reduced in the browser: expanding a row reads a small object and draws it.
   */
  function ensureObsDist() {
    if (state.obsDist !== null || state.obsDistPending) { return; }
    state.obsDistPending = fetch("data/observation-distribution.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { state.obsDist = j || false; rerender(); })
      .catch(function () { state.obsDist = false; rerender(); });
  }

  function buildObservationPanel(marketId) {
    var panel = document.createElement("div");
    panel.className = "reit-obs-panel";

    var doc = state.obsDist;
    var title = document.createElement("p");
    title.className = "reit-obs-title";
    title.textContent = doc && doc.terminology
      ? doc.terminology.panelTitle
      : "Observation Distribution";
    panel.appendChild(title);

    if (doc === null) {
      var loading = document.createElement("p");
      loading.className = "reit-note";
      loading.textContent = "Loading observation summaries…";
      panel.appendChild(loading);
      return panel;
    }
    if (doc === false || !doc.segments || !doc.segments[marketId]) {
      var miss = document.createElement("p");
      miss.className = "reit-note";
      miss.textContent = "Observation summaries are unavailable for this segment. " +
        "Regenerate them with: node data-pipeline/scripts/buildObservationDistribution.js";
      panel.appendChild(miss);
      return panel;
    }

    var seg = doc.segments[marketId];
    var term = doc.terminology;

    /*
     * Terminology. The records summarised below are SIMULATED MARKET
     * OBSERVATIONS — draws from this project's seeded generator. They are not
     * properties, listings, transactions or comparables, and the panel never
     * calls them any of those things, because each of those words would assert
     * that something real took place.
     */
    var intro = document.createElement("p");
    intro.className = "reit-obs-intro";
    intro.textContent = seg.observations + " " + term.recordNounPlural + " behind this segment. " +
      term.explanation;
    panel.appendChild(intro);

    var tbl = document.createElement("table");
    tbl.className = "reit-obs-table";

    var cap = document.createElement("caption");
    cap.className = "reit-table-caption";
    cap.textContent = "Distribution of the " + seg.observations + " " + term.recordNounPlural +
      " for " + seg.locality + ", " + seg.city + ". The segment figures used in the ranking " +
      "are the medians in this table.";
    tbl.appendChild(cap);

    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["Measure", "Min", "P10", "Q1", "Median", "Q3", "P90", "Max", "Mean", "SD"]
      .forEach(function (h) {
        var th = document.createElement("th");
        th.setAttribute("scope", "col");
        th.textContent = h;
        hr.appendChild(th);
      });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    var tbody = document.createElement("tbody");
    (doc.metricOrder || Object.keys(seg.metrics)).forEach(function (key) {
      var met = seg.metrics[key];
      if (!met || !met.summary) { return; }
      var s = met.summary;
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      th.textContent = met.label + (met.unit ? " (" + met.unit + ")" : "");
      tr.appendChild(th);
      ["min", "p10", "q1", "median", "q3", "p90", "max", "mean", "sd"].forEach(function (k) {
        var td = document.createElement("td");
        td.textContent = s[k] === null || s[k] === undefined ? "—" : String(s[k]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    panel.appendChild(tbl);

    // Text histogram of gross yield — readable without a canvas, and prints.
    var yieldMetric = seg.metrics.gross_yield_pct;
    if (yieldMetric && yieldMetric.histogram) {
      panel.appendChild(buildHistogram(yieldMetric, seg, term));
    }

    var disc = document.createElement("p");
    disc.className = "reit-obs-disclaimer";
    disc.textContent = doc.disclaimer;
    panel.appendChild(disc);

    return panel;
  }

  function buildHistogram(metric, seg, term) {
    var h = metric.histogram;
    var wrap = document.createElement("div");
    wrap.className = "reit-obs-hist";

    var t = document.createElement("p");
    t.className = "reit-obs-hist-title";
    t.textContent = metric.label + " distribution across the " + seg.observations + " " +
      term.recordNounPlural + " (" + h.counts.length + " equal-width bins, " +
      h.lower + "–" + h.upper + metric.unit + ")";
    wrap.appendChild(t);

    var max = Math.max.apply(null, h.counts) || 1;
    var list = document.createElement("table");
    list.className = "reit-obs-hist-table";

    h.counts.forEach(function (count, i) {
      var lo = h.lower + i * h.binWidth;
      var hi = lo + h.binWidth;
      var tr = document.createElement("tr");

      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      th.textContent = lo.toFixed(metric.dp) + "–" + hi.toFixed(metric.dp);
      tr.appendChild(th);

      var tdBar = document.createElement("td");
      var bar = document.createElement("span");
      bar.className = "reit-obs-bar";
      bar.style.width = Math.round((count / max) * 100) + "%";
      /* The bar is decorative; the count beside it carries the information, so
       * a screen reader is not left describing a width. */
      bar.setAttribute("aria-hidden", "true");
      tdBar.appendChild(bar);
      tr.appendChild(tdBar);

      var tdN = document.createElement("td");
      tdN.className = "reit-obs-hist-count";
      tdN.textContent = count === 0 ? "0" : String(count);
      tr.appendChild(tdN);

      list.appendChild(tr);
    });

    wrap.appendChild(list);
    return wrap;
  }

  // ─── Score breakdown panel ─────────────────────────────────────────────────

  function buildBreakdown(m) {
    var div = document.createElement("div");
    div.className = "reit-breakdown-inner";

    var tbl = document.createElement("table");
    tbl.className = "reit-breakdown-table";

    var rows = [
      ["Factor", "Raw value", "Normalised (0–100)", "Weight", "Contribution"],
      ["Rental Yield", (m.grossYield * 100).toFixed(2) + "%",
       m.factors.yieldScore.toFixed(1),
       Math.round(state.weights.yieldWeight * 100) + "%",
       m.contributions.yieldContrib.toFixed(2)],
      ["Rental Growth", (m.annualRentalGrowthRatio * 100).toFixed(1) + "%",
       m.factors.growthScore.toFixed(1),
       Math.round(state.weights.growthWeight * 100) + "%",
       m.contributions.growthContrib.toFixed(2)],
      ["Diversification", "—",
       m.factors.diversScore.toFixed(1),
       Math.round(state.weights.diversWeight * 100) + "%",
       m.contributions.diversContrib.toFixed(2)],
      ["Demand Strength", m.demandScore,
       m.factors.demandScore.toFixed(1),
       Math.round(state.weights.demandWeight * 100) + "%",
       m.contributions.demandContrib.toFixed(2)],
      ["Low Market Risk",
       "Risk score: " + m.riskScore + " → inverted: " + m.factors.lowRisk,
       m.factors.riskScore.toFixed(1),
       Math.round(state.weights.riskWeight * 100) + "%",
       m.contributions.riskContrib.toFixed(2)],
      ["Composite Score", "", "", "", m.totalScore.toFixed(2)]
    ];

    rows.forEach(function (r, i) {
      var tr = document.createElement("tr");
      if (i === 0) { tr.className = "reit-breakdown-header"; }
      if (i === rows.length - 1) { tr.className = "reit-breakdown-total"; }
      r.forEach(function (cell) {
        var el = document.createElement(i === 0 ? "th" : "td");
        if (i === 0) { el.setAttribute("scope", "col"); }
        el.textContent = cell;
        tr.appendChild(el);
      });
      tbl.appendChild(tr);
    });

    div.appendChild(tbl);

    // Evidence statement for this segment — the second dimension, in words.
    var gov = m.governance || Governance.evaluate(m);
    var R = Governance.rules();
    var evid = document.createElement("p");
    evid.className = "reit-breakdown-evidence" +
      (gov.eligible ? " reit-evidence-ok" : " reit-evidence-warn");
    evid.textContent = "Evidence: " + gov.tier + ". " +
      gov.observations + " simulated market observations, confidence grade " +
      (gov.grade || "unrecorded") + ". " +
      (gov.eligible
        ? "Meets the recommendation floor of " + R.MIN_OBSERVATIONS +
          " observations and grade " + R.MIN_GRADE + " or better."
        : "Below the recommendation floor — " + gov.reasons.join("; ") +
          ". The composite score above is unaffected by this; it measures " +
          "attractiveness, not how well the estimate is supported.");
    div.appendChild(evid);

    // HHI simulation
    if (m.simulation) {
      var hhiDiv = document.createElement("div");
      hhiDiv.className = "reit-breakdown-hhi";
      var hh = document.createElement("p");
      hh.className = "reit-breakdown-hhi-title";
      hh.textContent = "HHI impact of " + AppMeta.cr(state.investmentCr * 1e7, 2) + " investment:";
      hhiDiv.appendChild(hh);

      var hhiTbl = document.createElement("table");
      hhiTbl.className = "reit-hhi-mini-table";
      var hrow = document.createElement("tr");
      ["Metric", "Before", "After", "Change", "Assessment"].forEach(function (h) {
        var th = document.createElement("th");
        th.setAttribute("scope", "col");
        th.textContent = h;
        hrow.appendChild(th);
      });
      hhiTbl.appendChild(hrow);

      var sim = m.simulation;
      [
        { label: "City HHI", before: sim.before.cityHHI, after: sim.after.cityHHI,
          delta: sim.after.cityHHI - sim.before.cityHHI },
        { label: "Asset-type HHI", before: sim.before.typeHHI, after: sim.after.typeHHI,
          delta: sim.after.typeHHI - sim.before.typeHHI }
      ].forEach(function (row) {
        var tr = document.createElement("tr");
        var improved = row.delta < -0.0001;
        var worsened = row.delta >  0.0001;
        var assessment = improved ? "Concentration improved"
                       : worsened ? "Concentration worsened" : "Unchanged";
        var cls = improved ? "reit-hhi-improved"
                : worsened ? "reit-hhi-worsened" : "reit-hhi-neutral";

        [row.label, row.before.toFixed(4), row.after.toFixed(4),
         (row.delta < 0 ? "" : "+") + row.delta.toFixed(4), assessment
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

    // Uncertainty ranges from the source record
    var mkt = null;
    for (var i = 0; i < state.markets.length; i++) {
      if (state.markets[i].marketId === m.marketId) { mkt = state.markets[i]; break; }
    }
    if (mkt && mkt.uncertainty) {
      div.appendChild(buildUncertainty(mkt));
    }

    // Observation Distribution — the records the medians above came from
    div.appendChild(buildObservationPanel(m.marketId));

    // Factor contribution bars
    if (typeof Charts !== "undefined") {
      var fbId = "sc-fb-" + String(m.marketId).replace(/[^a-zA-Z0-9]/g, "_");
      var fbWrap = document.createElement("div");
      fbWrap.id = fbId;
      fbWrap.style.marginTop = "0.75rem";
      div.appendChild(fbWrap);
      Charts.renderFactorBars(fbId, [m], 1);
    }

    return div;
  }

  function buildUncertainty(mkt) {
    var u = mkt.uncertainty;
    var uDiv = document.createElement("div");
    uDiv.className = "reit-uncertainty-panel";
    var uTitle = document.createElement("p");
    uTitle.className = "reit-uncertainty-title";
    uTitle.textContent = "Uncertainty ranges (empirical P10–P90 of this segment's observations):";
    uDiv.appendChild(uTitle);

    var uTbl = document.createElement("table");
    uTbl.className = "reit-uncertainty-table";
    var uHead = document.createElement("tr");
    ["Factor", "Lower", "Central", "Upper", "Basis"].forEach(function (h) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = h;
      uHead.appendChild(th);
    });
    uTbl.appendChild(uHead);

    var uRows = [];
    function pct(v) { return v.toFixed(2) + "%"; }
    function int(v) { return v.toFixed(0); }
    if (u.grossYieldPct)   { uRows.push({ label: "Gross Yield",   d: u.grossYieldPct,   fmt: pct }); }
    if (u.rentalGrowthPct) { uRows.push({ label: "Rental Growth", d: u.rentalGrowthPct, fmt: pct }); }
    if (u.demandScore)     { uRows.push({ label: "Demand Score",  d: u.demandScore,     fmt: int }); }
    if (u.riskScore)       { uRows.push({ label: "Risk Score",    d: u.riskScore,       fmt: int }); }

    uRows.forEach(function (row) {
      var tr = document.createElement("tr");
      [row.label, row.fmt(row.d.lower), row.fmt(row.d.central), row.fmt(row.d.upper),
       row.d.basis || "—"].forEach(function (cell) {
        var td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
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
    if (mkt.comparabilityWarning && mkt.comparabilityWarning !== "None") {
      var cWarn = document.createElement("p");
      cWarn.className = "reit-comparability-warning";
      cWarn.textContent = "⚠ " + mkt.comparabilityWarning;
      uDiv.appendChild(cWarn);
    }
    return uDiv;
  }

  // ─── Scatter chart ─────────────────────────────────────────────────────────

  function buildScatter() {
    var wrap = document.createElement("div");
    if (!state.ranked || !state.ranked.length || typeof Charts === "undefined") { return wrap; }

    wrap.className = "reit-section";
    var title = document.createElement("h3");
    /* Previously titled "Yield vs Capital Value", which did not match what
     * charts.js plots: renderScatterChart puts rental growth on X and gross
     * yield on Y. Capital value is not an axis at all. */
    title.textContent = "Gross Yield vs Rental Growth";
    wrap.appendChild(title);

    var note = document.createElement("p");
    note.className = "reit-note";
    note.textContent = "Each point is one market segment. Horizontal axis is annual rental " +
      "growth, vertical axis is gross yield. Point size indicates the number of simulated " +
      "market observations behind that segment.";
    wrap.appendChild(note);

    var canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 300;
    canvas.setAttribute("aria-label",
      "Scatter chart: rental growth on the horizontal axis against gross yield on the " +
      "vertical axis, one point per market segment, coloured by property type.");
    wrap.appendChild(canvas);

    setTimeout(function () {
      Charts.renderScatterChart(canvas, state.markets, state.ranked);
    }, 0);

    return wrap;
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());

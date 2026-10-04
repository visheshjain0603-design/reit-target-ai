// ================================================================
// portfolio.js — REIT Target AI
// ----------------------------------------------------------------
// Renders the Portfolio page. Supports two modes:
//   "sample"  — loads data/portfolio.json (read-only, synthetic)
//   "custom"  — CRUD via localStorage (user data, no Firebase)
//
// Fixes applied in this version:
//   Fix 1 — Annual rent displayed to 3 dp; yield displayed to 3 dp.
//   Fix 2 — "Expiry Soon" uses dataAsOf + 12 calendar months,
//            not today's date. Pure YYYY-MM-DD string arithmetic.
//
// Dependencies (loaded before this file):
//   js/istTime.js    — istParts()
//   js/uiHelpers.js  — formatINR, formatINRCr, formatPercent,
//                       formatNumber, formatDisplayDate, formatHHI,
//                       showToast
//
// What this file IS NOT:
//   No Firebase · No Supabase · No Tally · No Gemini
//   No API keys · No scoring logic · No CSV upload
// ================================================================

(function () {
  "use strict";

  // ── Constants ─────────────────────────────────────────────────
  var DATA_URL           = "data/portfolio.json";
  var STORAGE_KEY        = "reit_custom_portfolio";
  var STORAGE_MODE_KEY   = "reit_portfolio_mode";
  var LOW_OCC_THRESHOLD  = 0.80;
  var NEAR_EXPIRY_MONTHS = 12;
  var ROOT_ID            = "portfolio-content";

  var ASSET_TYPES = [
    "Commercial Office",
    "Retail",
    "Residential",
    "Industrial",
    "Hospitality",
    "Mixed Use"
  ];

  // ── Application state ─────────────────────────────────────────
  var state = {
    mode:        "sample",  // "sample" | "custom"
    sampleData:  null,       // cached from fetch
    customAssets: [],        // array of asset objects (values in rupees)
    formOpen:    false,
    editingId:   null,       // null = add; string = assetId being edited
    formErrors:  {},         // fieldId → error string
    opener:      null,       // id of the control that opened the form, for focus return
    focusForm:   false,      // move focus into the form on the next render
    returnFocusTo: null      // id to focus on the next render
  };

  function openForm(editingId, openerId) {
    state.formOpen   = true;
    state.editingId  = editingId;
    state.formErrors = {};
    state.opener     = openerId;
    state.focusForm  = true;
    var root = document.getElementById(ROOT_ID);
    if (root) { renderAll(root); }
  }

  function closeForm() {
    state.formOpen   = false;
    state.editingId  = null;
    state.formErrors = {};
    state.returnFocusTo = state.opener;
    state.opener = null;
    var root = document.getElementById(ROOT_ID);
    if (root) { renderAll(root); }
  }

  /* Focus management for the Add/Edit form: focus enters the form when it
   * opens and returns to the control that opened it when it closes. */
  function applyFocus(root) {
    if (state.formOpen && state.focusForm) {
      state.focusForm = false;
      var first = root.querySelector(".reit-asset-form input:not([disabled]), .reit-asset-form select");
      if (first) { first.focus(); }
      return;
    }
    if (state.returnFocusTo) {
      var t = document.getElementById(state.returnFocusTo) ||
              root.querySelector("#pf-add-asset, #pf-start-blank");
      state.returnFocusTo = null;
      if (t) { t.focus(); }
    }
  }

  // ── localStorage helpers ──────────────────────────────────────
  function loadCustomFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { return []; }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function saveCustomToStorage(assets) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(assets)); }
    catch (e) { /* quota exceeded — silent */ }
    notifyAnalysis();
  }

  /* The analysis uses the ACTIVE portfolio. Any change to the custom holdings
   * or to the mode recomputes the shared run, so every page — targets, HHI,
   * projections, agent context — follows the portfolio the user is looking at. */
  function notifyAnalysis() {
    if (typeof AnalysisRun !== "undefined" && AnalysisRun.portfolioChanged) {
      AnalysisRun.portfolioChanged();
    }
  }

  function loadModeFromStorage() {
    try { return localStorage.getItem(STORAGE_MODE_KEY) || "sample"; }
    catch (e) { return "sample"; }
  }

  function saveModeToStorage(mode) {
    try { localStorage.setItem(STORAGE_MODE_KEY, mode); }
    catch (e) {}
    notifyAnalysis();
  }

  // ── Crore ↔ rupee conversion ──────────────────────────────────
  // All values stored internally in rupees so computeMetrics is unchanged.
  function crToRupees(cr) {
    // Round to avoid floating-point drift (e.g. 33.275 * 1e7 = 332749999.99...)
    return Math.round(Number(cr) * 1e7);
  }

  function rupeesToCr(rupees) {
    // Returns a JS number — the number input handles display precision
    return Number(rupees) / 1e7;
  }

  // ── Safe formatting helpers (delegate to uiHelpers.js) ────────
  function fmt_INRCr(v, d) {
    if (typeof formatINRCr === "function") { return formatINRCr(v, d); }
    return "₹" + (Number(v) / 1e7).toFixed(d !== undefined ? d : 2) + " Cr";
  }
  function fmt_Pct(v, d) {
    if (typeof formatPercent === "function") { return formatPercent(v, d); }
    return (Number(v) * 100).toFixed(d !== undefined ? d : 1) + "%";
  }
  function fmt_Num(v, d) {
    if (typeof formatNumber === "function") { return formatNumber(v, d); }
    return Number(v).toLocaleString("en-IN");
  }
  function fmt_Date(iso) {
    if (typeof formatDisplayDate === "function") { return formatDisplayDate(iso); }
    return String(iso);
  }
  function fmt_HHI(v) {
    if (typeof formatHHI === "function") { return formatHHI(v); }
    return Number(v).toFixed(4);
  }

  // ── IST-safe today as YYYY-MM-DD ─────────────────────────────
  function todayISO() {
    if (typeof istParts === "function") {
      var p = istParts(new Date().toISOString());
      if (p && p.date) { return p.date; }
    }
    return new Date().toISOString().slice(0, 10);
  }

  // ── Add N calendar months to a YYYY-MM-DD (Fix 2) ────────────
  // Pure string arithmetic — no Date() object, no timezone risk.
  function addMonthsISO(iso, n) {
    var parts = String(iso).split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1; // 0-indexed
    var d = parseInt(parts[2], 10);
    m += n;
    while (m >= 12) { m -= 12; y += 1; }
    while (m < 0)   { m += 12; y -= 1; }
    var mm = m + 1; // back to 1-indexed
    return y
      + "-" + (mm < 10 ? "0" : "") + mm
      + "-" + (d  < 10 ? "0" : "") + d;
  }

  // Fix 2: flag only when leaseExpiry is within [dataAsOf, dataAsOf+12m]
  function isExpirySoon(leaseExpiry, dataAsOf) {
    if (!leaseExpiry || !dataAsOf) { return false; }
    var cutoff = addMonthsISO(dataAsOf, NEAR_EXPIRY_MONTHS);
    return leaseExpiry >= dataAsOf && leaseExpiry <= cutoff;
  }

  // ── Metrics computation ───────────────────────────────────────
  function computeMetrics(data) {
    var assets      = data.assets || [];
    var totalValue  = 0;
    var totalRent   = 0;
    var totalArea   = 0;
    var occupiedArea = 0;
    var cityValue   = {};
    var typeValue   = {};

    assets.forEach(function (a) {
      totalValue   += a.propertyValue || 0;
      totalRent    += a.annualRent    || 0;
      totalArea    += a.totalArea     || 0;
      occupiedArea += a.occupiedArea  || 0;

      var city = a.city      || "Unknown";
      var type = a.assetType || "Unknown";
      cityValue[city] = (cityValue[city] || 0) + (a.propertyValue || 0);
      typeValue[type] = (typeValue[type] || 0) + (a.propertyValue || 0);
    });

    var weightedYield   = totalValue > 0 ? totalRent    / totalValue : 0;
    var areaWeightedOcc = totalArea  > 0 ? occupiedArea / totalArea  : 0;

    var cityPct = {};
    var typePct = {};
    Object.keys(cityValue).forEach(function (k) {
      cityPct[k] = totalValue > 0 ? cityValue[k] / totalValue : 0;
    });
    Object.keys(typeValue).forEach(function (k) {
      typePct[k] = totalValue > 0 ? typeValue[k] / totalValue : 0;
    });

    var numCities = Object.keys(cityPct).length;
    var numTypes  = Object.keys(typePct).length;

    return {
      totalValue:      totalValue,
      totalRent:       totalRent,
      totalArea:       totalArea,
      occupiedArea:    occupiedArea,
      assetCount:      assets.length,
      numCities:       numCities,
      numTypes:        numTypes,
      weightedYield:   weightedYield,
      areaWeightedOcc: areaWeightedOcc,
      cityPct:         cityPct,
      typePct:         typePct,
      cityHHI:         hhi(cityPct),
      typeHHI:         hhi(typePct)
    };
  }

  function hhi(pctMap) {
    var sum = 0;
    Object.keys(pctMap).forEach(function (k) { sum += pctMap[k] * pctMap[k]; });
    return sum;
  }

  // ── Synthetic-data guard (sample mode only) ───────────────────
  function validateSynthetic(data) {
    if (!data.isSynthetic) {
      throw new Error("Dataset isSynthetic flag is not true — refusing to render.");
    }
    var assets = data.assets || [];
    for (var i = 0; i < assets.length; i++) {
      if (!assets[i].isSynthetic) {
        throw new Error("Asset " + assets[i].assetId + " isSynthetic flag is not true.");
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }

    state.customAssets = loadCustomFromStorage();
    var savedMode = loadModeFromStorage();
    state.mode = (savedMode === "custom") ? "custom" : "sample";

    showLoading(root);

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) { throw new Error("HTTP " + res.status); }
        return res.json();
      })
      .then(function (data) {
        validateSynthetic(data);
        state.sampleData = data;
        renderAll(root);
        /* Reset Demo on the Overview returns the analysis to the sample
         * portfolio; follow it here so the two pages cannot disagree. */
        if (typeof AnalysisRun !== "undefined") {
          AnalysisRun.subscribe(function () {
            var mode = ReitState.portfolioMode();
            if (mode !== state.mode) {
              state.mode = mode;
              state.formOpen = false;
              state.editingId = null;
              renderAll(root);
            }
          });
        }
      })
      .catch(function (err) {
        showError(root, err.message || String(err));
      });
  }

  // ── Master render ─────────────────────────────────────────────
  function renderAll(root) {
    while (root.firstChild) { root.removeChild(root.firstChild); }
    root.appendChild(buildModeToggle());

    if (state.mode === "sample") {
      renderSample(root);
    } else {
      renderCustom(root);
    }
    applyFocus(root);
  }

  // ── Mode toggle ───────────────────────────────────────────────
  function buildModeToggle() {
    var bar = document.createElement("div");
    bar.className = "reit-mode-bar";

    var label = document.createElement("span");
    label.className = "reit-mode-label";
    label.textContent = "Portfolio data:";
    bar.appendChild(label);

    ["sample", "custom"].forEach(function (m) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reit-mode-btn" + (state.mode === m ? " mode-active" : "");
      btn.textContent = m === "sample" ? "Sample Portfolio" : "Custom Portfolio";
      btn.addEventListener("click", function () { switchMode(m); });
      bar.appendChild(btn);
    });

    return bar;
  }

  function switchMode(mode) {
    state.mode = mode;
    state.formOpen = false;
    state.editingId = null;
    state.formErrors = {};
    saveModeToStorage(mode);
    var root = document.getElementById(ROOT_ID);
    if (root) { renderAll(root); }
  }

  // ── Sample mode ───────────────────────────────────────────────
  function renderSample(root) {
    var data    = state.sampleData;
    var metrics = computeMetrics(data);
    renderPortfolioContent(root, data, metrics, data.dataAsOf || todayISO(), false);
  }

  // ── Custom mode ───────────────────────────────────────────────
  function renderCustom(root) {
    // Empty state with no form open → show "start blank / copy" prompt
    if (state.customAssets.length === 0 && !state.formOpen) {
      renderCustomEmpty(root);
      return;
    }

    var dataAsOf = todayISO();
    var data = {
      datasetName: "Custom Portfolio",
      dataAsOf:    dataAsOf,
      currency:    "INR",
      areaUnit:    "sq_ft",
      isSynthetic: false,
      assets:      state.customAssets
    };
    var metrics = computeMetrics(data);
    renderPortfolioContent(root, data, metrics, dataAsOf, true);
  }

  function renderCustomEmpty(root) {
    var div = document.createElement("div");
    div.className = "reit-custom-empty";

    var h3 = document.createElement("h3");
    h3.textContent = "No custom assets yet";
    div.appendChild(h3);

    var p = document.createElement("p");
    p.textContent = "Start with a blank portfolio and add assets one by one, or copy the sample data as a starting point.";
    div.appendChild(p);

    var btnRow = document.createElement("div");
    btnRow.className = "reit-empty-btns";

    var btnBlank = document.createElement("button");
    btnBlank.type = "button";
    btnBlank.className = "reit-btn reit-btn-primary";
    btnBlank.textContent = "Start Blank — Add First Asset";
    btnBlank.id = "pf-start-blank";
    btnBlank.addEventListener("click", function () { openForm(null, "pf-start-blank"); });
    btnRow.appendChild(btnBlank);

    var btnCopy = document.createElement("button");
    btnCopy.type = "button";
    btnCopy.className = "reit-btn reit-btn-secondary";
    btnCopy.textContent = "Copy from Sample Portfolio";
    btnCopy.addEventListener("click", function () { copyFromSample(); });
    btnRow.appendChild(btnCopy);

    div.appendChild(btnRow);
    root.appendChild(div);
  }

  function copyFromSample() {
    if (!state.sampleData || !state.sampleData.assets) { return; }
    state.customAssets = state.sampleData.assets.map(function (a) {
      return {
        assetId:             a.assetId,
        assetName:           a.assetName,
        city:                a.city,
        locality:            a.locality,
        assetType:           a.assetType,
        propertyValue:       a.propertyValue,
        annualRent:          a.annualRent,
        totalArea:           a.totalArea,
        occupiedArea:        a.occupiedArea,
        occupancyRate:       a.occupancyRate,
        estimatedGrossYield: a.estimatedGrossYield,
        leaseExpiry:         a.leaseExpiry,
        tenantSector:        a.tenantSector,
        isSynthetic:         false,
        sourceType:          "user_custom"
      };
    });
    saveCustomToStorage(state.customAssets);
    var root = document.getElementById(ROOT_ID);
    if (root) { renderAll(root); }
  }

  // ── Core portfolio render (shared by both modes) ──────────────
  function renderPortfolioContent(root, data, metrics, dataAsOf, isCustom) {
    root.appendChild(buildBanner(data, isCustom));
    root.appendChild(buildPageHeader(data, isCustom));

    if (isCustom) {
      root.appendChild(buildCustomControls());
    }

    if (isCustom && state.formOpen) {
      root.appendChild(buildAssetForm());
    }

    // KPI cards — Fix 1: rent 3dp, yield 3dp
    root.appendChild(buildSummaryCards(metrics));

    root.appendChild(buildConcentrationSection(
      "Geographic Concentration", metrics.cityPct, metrics.cityHHI, "city"
    ));
    root.appendChild(buildConcentrationSection(
      "Asset-Type Concentration", metrics.typePct, metrics.typeHHI, "type"
    ));

    // Chart 6: City allocation bar chart
    if (typeof Charts !== 'undefined' && metrics.cityPct) {
      var allocSection = document.createElement("div");
      allocSection.className = "reit-section";
      allocSection.setAttribute("role", "region");
      allocSection.setAttribute("aria-label", "Portfolio Allocation Charts");
      var allocH = document.createElement("h3");
      allocH.textContent = "Portfolio Allocation by City";
      allocSection.appendChild(allocH);
      var cityAllocId = "pf-city-alloc-chart";
      var cityAllocEl = document.createElement("div");
      cityAllocEl.id = cityAllocId;
      allocSection.appendChild(cityAllocEl);
      root.appendChild(allocSection);
      Charts.renderAllocationBar(cityAllocId, metrics.cityPct, "City Allocation");
    }

    root.appendChild(buildAssetTable(data.assets, dataAsOf, isCustom));
  }

  // ── Banner ────────────────────────────────────────────────────
  function buildBanner(data, isCustom) {
    var div = document.createElement("div");
    div.className = "reit-synthetic-banner";

    var icon = document.createElement("span");
    icon.className = "reit-badge-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isCustom ? "ℹ" : "⚠";
    div.appendChild(icon);

    var msg = document.createElement("span");
    if (isCustom) {
      msg.textContent = "User-entered demonstration portfolio — stored only in this browser.";
    } else {
      msg.textContent = (data.datasetName || "Synthetic dataset") +
        " — All values are fictional and for academic demonstration only.";
    }
    div.appendChild(msg);

    return div;
  }

  // ── Page header ───────────────────────────────────────────────
  function buildPageHeader(data, isCustom) {
    var div = document.createElement("div");
    div.className = "reit-page-header";

    var h2 = document.createElement("h2");
    h2.textContent = isCustom ? "Custom Portfolio" : "Existing REIT Portfolio";
    div.appendChild(h2);

    var asof = document.createElement("div");
    asof.className = "reit-as-of";
    if (isCustom) {
      asof.textContent = "Data as of " + fmt_Date(data.dataAsOf) +
        " (today) · Currency: INR · Area: sq_ft";
    } else {
      asof.textContent = "Data as of " + fmt_Date(data.dataAsOf) +
        " · Currency: " + (data.currency || "INR") +
        " · Area: " + (data.areaUnit || "sq_ft");
    }
    div.appendChild(asof);

    return div;
  }

  // ── Custom controls (Add / Reset) ─────────────────────────────
  function buildCustomControls() {
    var bar = document.createElement("div");
    bar.className = "reit-custom-controls";

    var btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "reit-btn reit-btn-primary";
    btnAdd.textContent = "+ Add Asset";
    btnAdd.id = "pf-add-asset";
    btnAdd.setAttribute("aria-expanded", state.formOpen && state.editingId === null ? "true" : "false");
    btnAdd.addEventListener("click", function () { openForm(null, "pf-add-asset"); });
    bar.appendChild(btnAdd);

    var btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "reit-btn reit-btn-danger";
    btnReset.textContent = "Reset Custom Portfolio";
    btnReset.addEventListener("click", function () {
      if (window.confirm(
        "Reset the custom portfolio?\n\nAll custom assets will be permanently deleted from this browser."
      )) {
        state.customAssets = [];
        state.formOpen     = false;
        state.editingId    = null;
        state.formErrors   = {};
        saveCustomToStorage([]);
        var root = document.getElementById(ROOT_ID);
        if (root) { renderAll(root); }
      }
    });
    bar.appendChild(btnReset);

    return bar;
  }

  // ── Asset form ────────────────────────────────────────────────
  function buildAssetForm() {
    var isEdit = state.editingId !== null;
    var existing = null;
    if (isEdit) {
      state.customAssets.forEach(function (a) {
        if (a.assetId === state.editingId) { existing = a; }
      });
    }

    var panel = document.createElement("div");
    panel.className = "reit-form-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "pf-form-title");
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); closeForm(); }
    });

    var title = document.createElement("h3");
    title.className = "reit-form-title";
    title.id = "pf-form-title";
    title.textContent = isEdit ? "Edit Asset" : "Add New Asset";
    panel.appendChild(title);

    var form = document.createElement("form");
    form.className = "reit-asset-form";
    form.noValidate = true;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      handleFormSubmit();
    });

    var grid = document.createElement("div");
    grid.className = "reit-form-grid";

    var fields = [
      {
        id: "f-assetId", label: "Asset ID", type: "text",
        required: true, hint: "e.g. REIT-011",
        value: existing ? existing.assetId : "",
        disabled: isEdit  // cannot change the primary key
      },
      {
        id: "f-assetName", label: "Asset Name", type: "text",
        required: true, hint: "e.g. Sunrise Tower",
        value: existing ? existing.assetName : ""
      },
      {
        id: "f-city", label: "City", type: "text",
        required: true, hint: "e.g. Mumbai",
        value: existing ? existing.city : ""
      },
      {
        id: "f-locality", label: "Locality", type: "text",
        required: true, hint: "e.g. BKC",
        value: existing ? existing.locality : ""
      },
      {
        id: "f-assetType", label: "Property Type", type: "select",
        required: true, hint: "",
        value: existing ? existing.assetType : ""
      },
      {
        id: "f-propertyValue", label: "Property Value (₹ Cr)", type: "number",
        required: true, hint: "e.g. 125.00",
        value: existing ? rupeesToCr(existing.propertyValue) : ""
      },
      {
        id: "f-annualRent", label: "Annual Rent (₹ Cr)", type: "number",
        required: true, hint: "e.g. 9.000",
        value: existing ? rupeesToCr(existing.annualRent) : ""
      },
      {
        id: "f-totalArea", label: "Total Area (sq ft)", type: "number",
        required: true, hint: "e.g. 90000",
        value: existing ? existing.totalArea : ""
      },
      {
        id: "f-occupiedArea", label: "Occupied Area (sq ft)", type: "number",
        required: true, hint: "e.g. 86400",
        value: existing ? existing.occupiedArea : ""
      },
      {
        id: "f-leaseExpiry", label: "Lease Expiry (YYYY-MM-DD)", type: "text",
        required: true, hint: "e.g. 2030-03-31",
        value: existing ? existing.leaseExpiry : ""
      },
      {
        id: "f-tenantSector", label: "Tenant Sector", type: "text",
        required: true, hint: "e.g. IT Services",
        value: existing ? existing.tenantSector : ""
      }
    ];

    fields.forEach(function (f) {
      var group = document.createElement("div");
      group.className = "reit-form-group";

      var lbl = document.createElement("label");
      lbl.setAttribute("for", f.id);
      lbl.className = "reit-form-label";
      lbl.textContent = f.label + (f.required ? " *" : "");
      group.appendChild(lbl);

      var input;
      if (f.type === "select") {
        input = document.createElement("select");
        input.id   = f.id;
        input.name = f.id;
        input.className = "reit-form-input" + (state.formErrors[f.id] ? " has-error" : "");

        var optBlank = document.createElement("option");
        optBlank.value = "";
        optBlank.textContent = "Select type…";
        input.appendChild(optBlank);

        ASSET_TYPES.forEach(function (at) {
          var opt = document.createElement("option");
          opt.value = at;
          opt.textContent = at;
          if (f.value === at) { opt.selected = true; }
          input.appendChild(opt);
        });
      } else {
        input = document.createElement("input");
        input.type  = f.type === "number" ? "number" : "text";
        input.id    = f.id;
        input.name  = f.id;
        input.className = "reit-form-input" + (state.formErrors[f.id] ? " has-error" : "");
        input.placeholder = f.hint;
        if (f.type === "number") { input.step = "any"; input.min = "0"; }
        if (f.value !== "") { input.value = String(f.value); }
      }

      if (f.disabled) {
        input.disabled = true;
        input.title = "Asset ID cannot be changed after creation.";
      }

      group.appendChild(input);

      if (state.formErrors[f.id]) {
        var errSpan = document.createElement("span");
        errSpan.className = "reit-form-error";
        errSpan.textContent = state.formErrors[f.id];
        group.appendChild(errSpan);
      }

      grid.appendChild(group);
    });

    form.appendChild(grid);

    // Calculated-fields notice
    var preview = document.createElement("div");
    preview.className = "reit-form-preview";
    var previewText = document.createElement("span");
    previewText.textContent =
      "Calculated automatically — Yield = Annual Rent ÷ Property Value · " +
      "Occupancy = Occupied Area ÷ Total Area";
    preview.appendChild(previewText);
    form.appendChild(preview);

    // Submit / Cancel
    var btnRow = document.createElement("div");
    btnRow.className = "reit-form-btns";

    var btnSubmit = document.createElement("button");
    btnSubmit.type = "submit";
    btnSubmit.className = "reit-btn reit-btn-primary";
    btnSubmit.textContent = isEdit ? "Save Changes" : "Add Asset";
    btnRow.appendChild(btnSubmit);

    var btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "reit-btn reit-btn-secondary";
    btnCancel.textContent = "Cancel";
    btnCancel.addEventListener("click", closeForm);
    btnRow.appendChild(btnCancel);

    form.appendChild(btnRow);
    panel.appendChild(form);
    return panel;
  }

  // ── Form submission + validation ──────────────────────────────
  function handleFormSubmit() {
    var errors = {};

    function getVal(id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : "";
    }
    function getNum(id) {
      var el = document.getElementById(id);
      return el ? parseFloat(el.value) : NaN;
    }

    var assetId      = getVal("f-assetId");
    var assetName    = getVal("f-assetName");
    var city         = getVal("f-city");
    var locality     = getVal("f-locality");
    var assetType    = getVal("f-assetType");
    var propValCr    = getNum("f-propertyValue");
    var rentCr       = getNum("f-annualRent");
    var totalArea    = getNum("f-totalArea");
    var occupiedArea = getNum("f-occupiedArea");
    var leaseExpiry  = getVal("f-leaseExpiry");
    var tenantSector = getVal("f-tenantSector");

    // 1. Required
    if (!assetId)      { errors["f-assetId"]      = "Asset ID is required."; }
    if (!assetName)    { errors["f-assetName"]     = "Asset name is required."; }
    if (!city)         { errors["f-city"]          = "City is required."; }
    if (!locality)     { errors["f-locality"]      = "Locality is required."; }
    if (!assetType)    { errors["f-assetType"]     = "Property type is required."; }
    if (!tenantSector) { errors["f-tenantSector"]  = "Tenant sector is required."; }

    // 2. Numeric constraints
    if (isNaN(propValCr) || propValCr <= 0) {
      errors["f-propertyValue"] = "Property value must be greater than zero.";
    }
    if (isNaN(rentCr) || rentCr < 0) {
      errors["f-annualRent"] = "Annual rent cannot be negative.";
    }
    if (isNaN(totalArea) || totalArea <= 0) {
      errors["f-totalArea"] = "Total area must be greater than zero.";
    }
    if (isNaN(occupiedArea) || occupiedArea < 0) {
      errors["f-occupiedArea"] = "Occupied area cannot be negative.";
    }
    if (!isNaN(occupiedArea) && !isNaN(totalArea) && occupiedArea > totalArea) {
      errors["f-occupiedArea"] = "Occupied area cannot exceed total area.";
    }

    // 3. Lease expiry — valid YYYY-MM-DD
    if (!leaseExpiry) {
      errors["f-leaseExpiry"] = "Lease expiry is required.";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(leaseExpiry)) {
      errors["f-leaseExpiry"] = "Use YYYY-MM-DD format (e.g. 2030-03-31).";
    } else {
      var ep = leaseExpiry.split("-");
      var em = parseInt(ep[1], 10);
      var ed = parseInt(ep[2], 10);
      if (em < 1 || em > 12 || ed < 1 || ed > 31) {
        errors["f-leaseExpiry"] = "Invalid date — check month and day.";
      }
    }

    // 4. Duplicate ID (only on add; editingId is disabled on edit)
    if (!state.editingId && assetId && !errors["f-assetId"]) {
      var dupe = state.customAssets.some(function (a) { return a.assetId === assetId; });
      if (dupe) {
        errors["f-assetId"] = 'Asset ID "' + assetId + '" already exists. Use a unique ID.';
      }
    }

    if (Object.keys(errors).length > 0) {
      state.formErrors = errors;
      var root = document.getElementById(ROOT_ID);
      if (root) { renderAll(root); }
      return;
    }

    // Build asset object — store in rupees; compute derived fields
    var propValRupees  = crToRupees(propValCr);
    var rentRupees     = crToRupees(rentCr);
    var occ            = totalArea    > 0 ? Math.round(occupiedArea) / Math.round(totalArea) : 0;
    var yld            = propValRupees > 0 ? rentRupees / propValRupees : 0;

    var assetObj = {
      assetId:             assetId,
      assetName:           assetName,
      city:                city,
      locality:            locality,
      assetType:           assetType,
      propertyValue:       propValRupees,
      annualRent:          rentRupees,
      totalArea:           Math.round(totalArea),
      occupiedArea:        Math.round(occupiedArea),
      occupancyRate:       occ,
      estimatedGrossYield: yld,
      leaseExpiry:         leaseExpiry,
      tenantSector:        tenantSector,
      isSynthetic:         false,
      sourceType:          "user_custom"
    };

    if (state.editingId) {
      state.customAssets = state.customAssets.map(function (a) {
        return a.assetId === state.editingId ? assetObj : a;
      });
    } else {
      state.customAssets.push(assetObj);
    }

    saveCustomToStorage(state.customAssets);
    closeForm();
  }

  // ── KPI summary cards — Fix 1: 3dp for rent and yield ─────────
  function buildSummaryCards(m) {
    var grid = document.createElement("div");
    grid.className = "reit-summary-grid";

    var cityLabel = m.numCities + " " + (m.numCities === 1 ? "city" : "cities");
    var typeLabel = m.numTypes  + " asset " + (m.numTypes === 1 ? "type" : "types");

    var cards = [
      {
        label:  "Portfolio Value",
        value:  fmt_INRCr(m.totalValue, 2),
        sub:    "Total (all assets)",
        accent: "card-accent-blue"
      },
      {
        label:  "Annual Rent Income",
        value:  fmt_INRCr(m.totalRent, 3),        // Fix 1: 3 decimal places
        sub:    "Gross contractual rent",
        accent: "card-accent-green"
      },
      {
        label:  "Weighted Gross Yield",
        value:  fmt_Pct(m.weightedYield, 3),       // Fix 1: 3 decimal places
        sub:    "Annual rent ÷ portfolio value",
        accent: "card-accent-amber"
      },
      {
        label:  "Area-Wt. Occupancy",
        value:  fmt_Pct(m.areaWeightedOcc, 1),
        sub:    "Occupied ÷ total leasable area",
        accent: "card-accent-green"
      },
      {
        label:  "Total Assets",
        value:  fmt_Num(m.assetCount, 0),
        sub:    "Across " + cityLabel + " · " + typeLabel,
        accent: ""
      }
    ];

    cards.forEach(function (c) {
      var card = document.createElement("div");
      card.className = "reit-card" + (c.accent ? " " + c.accent : "");

      var lbl = document.createElement("div");
      lbl.className = "reit-card-label";
      lbl.textContent = c.label;
      card.appendChild(lbl);

      var val = document.createElement("div");
      val.className = "reit-card-value";
      val.textContent = c.value;
      card.appendChild(val);

      var sub = document.createElement("div");
      sub.className = "reit-card-sub";
      sub.textContent = c.sub;
      card.appendChild(sub);

      grid.appendChild(card);
    });

    return grid;
  }

  // ── Concentration section ─────────────────────────────────────
  function buildConcentrationSection(title, pctMap, hhiValue, kind) {
    var section = document.createElement("div");
    section.className = "reit-section";

    var titleEl = document.createElement("div");
    titleEl.className = "reit-section-title";

    var titleText = document.createElement("span");
    titleText.textContent = title;
    titleEl.appendChild(titleText);

    var hhiTag = document.createElement("span");
    hhiTag.className = "reit-hhi-tag";
    hhiTag.textContent = "HHI: " + fmt_HHI(hhiValue);
    titleEl.appendChild(hhiTag);

    section.appendChild(titleEl);

    var entries = Object.keys(pctMap).map(function (k) {
      return { key: k, pct: pctMap[k] };
    });
    entries.sort(function (a, b) { return b.pct - a.pct; });
    entries.forEach(function (e) {
      section.appendChild(buildBarRow(e.key, e.pct, kind));
    });

    return section;
  }

  function buildBarRow(label, pct, kind) {
    var row = document.createElement("div");
    row.className = "reit-bar-row";

    var lbl = document.createElement("div");
    lbl.className = "reit-bar-label";
    lbl.textContent = label;
    row.appendChild(lbl);

    var track = document.createElement("div");
    track.className = "reit-bar-track";

    var fill = document.createElement("div");
    fill.className = "reit-bar-fill " + barClass(label, kind);
    fill.style.width = fmt_Pct(pct, 1);
    track.appendChild(fill);
    row.appendChild(track);

    var pctEl = document.createElement("div");
    pctEl.className = "reit-bar-pct";
    pctEl.textContent = fmt_Pct(pct, 1);
    row.appendChild(pctEl);

    return row;
  }

  function barClass(label, kind) {
    if (kind === "city") {
      return "city-" + label.toLowerCase().replace(/\s+/g, "-");
    }
    if (kind === "type") {
      if (/commercial/i.test(label))  { return "type-commercial-office"; }
      if (/retail/i.test(label))      { return "type-retail"; }
      if (/residential/i.test(label)) { return "type-residential"; }
    }
    return "";
  }

  // ── Asset table — Fix 2: expiry uses dataAsOf ─────────────────
  function buildAssetTable(assets, dataAsOf, isCustom) {
    var bestYield = -Infinity;
    assets.forEach(function (a) {
      if ((a.estimatedGrossYield || 0) > bestYield) {
        bestYield = a.estimatedGrossYield;
      }
    });

    var wrapper = document.createElement("div");
    wrapper.className = "reit-table-wrapper";

    // Table sub-header
    var tblHeader = document.createElement("div");
    tblHeader.className = "reit-table-header";

    var tblTitle = document.createElement("span");
    tblTitle.className = "reit-table-title";
    tblTitle.textContent = "Asset Detail";
    tblHeader.appendChild(tblTitle);

    var tblCount = document.createElement("span");
    tblCount.className = "reit-table-count";
    tblCount.textContent = assets.length + " asset" + (assets.length !== 1 ? "s" : "");
    tblHeader.appendChild(tblCount);

    wrapper.appendChild(tblHeader);

    var table = document.createElement("table");
    table.className = "reit-table";
    var tcap = document.createElement("caption");
    tcap.className = "reit-sr-only";
    tcap.textContent = (isCustom ? "Custom" : "Sample") + " portfolio holdings";
    table.appendChild(tcap);

    // thead
    var thead = document.createElement("thead");
    var trHead = document.createElement("tr");
    var cols = [
      { text: "Asset",            cls: "" },
      { text: "City / Locality",  cls: "" },
      { text: "Type",             cls: "" },
      { text: "Value (Cr)",       cls: "num" },
      { text: "Annual Rent (Cr)", cls: "num" },
      { text: "Yield",            cls: "num" },
      { text: "Occupancy",        cls: "num" },
      { text: "Lease Expiry",     cls: "num" },
      { text: "Tenant Sector",    cls: "" }
    ];
    if (isCustom) { cols.push({ text: "Actions", cls: "num" }); }

    cols.forEach(function (c) {
      var th = document.createElement("th");
      th.textContent = c.text;
      if (c.cls) { th.className = c.cls; }
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    // tbody
    var tbody = document.createElement("tbody");
    assets.forEach(function (a) {
      var occ          = a.occupancyRate        || 0;
      var isLowOcc     = occ < LOW_OCC_THRESHOLD;
      var isNearExpiry = isExpirySoon(a.leaseExpiry, dataAsOf); // Fix 2
      var isBestYield  = (a.estimatedGrossYield || 0) === bestYield && bestYield > 0;

      var tr = document.createElement("tr");
      if (isNearExpiry)      { tr.classList.add("row-near-expiry"); }
      else if (isLowOcc)     { tr.classList.add("row-low-occupancy"); }

      tr.appendChild(buildNameCell(a, isLowOcc, isNearExpiry, isBestYield));
      addTd(tr, (a.city || "") + " · " + (a.locality || ""), "");

      var typeTd = document.createElement("td");
      typeTd.appendChild(buildTypePill(a.assetType || ""));
      tr.appendChild(typeTd);

      addTd(tr, fmt_INRCr(a.propertyValue, 2),        "num");
      addTd(tr, fmt_INRCr(a.annualRent, 3),           "num"); // 3dp per-row too
      addTd(tr, fmt_Pct(a.estimatedGrossYield, 2),    "num");
      addTd(tr, fmt_Pct(occ, 1),                      "num");
      addTd(tr, fmt_Date(a.leaseExpiry),              "num");
      addTd(tr, a.tenantSector || "—",                "");

      if (isCustom) {
        var actionTd = document.createElement("td");
        actionTd.className = "num";

        var btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "reit-tbl-btn reit-tbl-btn-edit";
        btnEdit.textContent = "Edit";
        btnEdit.id = "pf-edit-" + String(a.assetId).replace(/[^A-Za-z0-9_-]/g, "_");
        btnEdit.setAttribute("aria-label", "Edit " + a.assetName);
        // IIFE to capture assetId at loop iteration
        (function (id) {
          btnEdit.addEventListener("click", function () { startEdit(id); });
        }(a.assetId));
        actionTd.appendChild(btnEdit);

        var btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "reit-tbl-btn reit-tbl-btn-delete";
        btnDel.textContent = "Delete";
        btnDel.setAttribute("aria-label", "Delete " + a.assetName);
        (function (id, name) {
          btnDel.addEventListener("click", function () {
            if (window.confirm(
              'Delete asset "' + name + '"?\n\nThis cannot be undone.'
            )) {
              deleteAsset(id);
            }
          });
        }(a.assetId, a.assetName));
        actionTd.appendChild(btnDel);

        tr.appendChild(actionTd);
      }

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    wrapper.appendChild(buildFlagsLegend());
    return wrapper;
  }

  function startEdit(assetId) {
    openForm(assetId, "pf-edit-" + String(assetId).replace(/[^A-Za-z0-9_-]/g, "_"));
  }

  function deleteAsset(assetId) {
    state.customAssets = state.customAssets.filter(function (a) {
      return a.assetId !== assetId;
    });
    saveCustomToStorage(state.customAssets);
    var root = document.getElementById(ROOT_ID);
    if (root) { renderAll(root); }
  }

  // ── Name cell ─────────────────────────────────────────────────
  function buildNameCell(a, isLowOcc, isNearExpiry, isBestYield) {
    var td = document.createElement("td");

    var nameSpan = document.createElement("span");
    nameSpan.textContent = a.assetName || a.assetId || "—";
    td.appendChild(nameSpan);

    var idSpan = document.createElement("span");
    idSpan.style.fontSize   = "0.72rem";
    idSpan.style.color      = "var(--reit-text-muted, #757575)";
    idSpan.style.marginLeft = "0.3rem";
    idSpan.textContent = a.assetId ? "(" + a.assetId + ")" : "";
    td.appendChild(idSpan);

    if (isLowOcc) {
      var b1 = document.createElement("span");
      b1.className = "reit-badge badge-warning";
      b1.textContent = "Low Occ";
      td.appendChild(b1);
    }
    if (isNearExpiry) {
      var b2 = document.createElement("span");
      b2.className = "reit-badge badge-danger";
      b2.textContent = "Expiry Soon";
      td.appendChild(b2);
    }
    if (isBestYield) {
      var b3 = document.createElement("span");
      b3.className = "reit-badge badge-star";
      b3.textContent = "★ Best Yield";
      td.appendChild(b3);
    }
    return td;
  }

  function buildTypePill(type) {
    var span = document.createElement("span");
    span.className = "reit-type-pill";
    span.textContent = type;
    if (/commercial/i.test(type))  { span.classList.add("pill-commercial"); }
    else if (/retail/i.test(type)) { span.classList.add("pill-retail"); }
    else if (/residential/i.test(type)) { span.classList.add("pill-residential"); }
    return span;
  }

  function addTd(tr, text, cls) {
    var td = document.createElement("td");
    td.textContent = (text !== null && text !== undefined) ? String(text) : "—";
    if (cls) { td.className = cls; }
    tr.appendChild(td);
  }

  function buildFlagsLegend() {
    var div = document.createElement("div");
    div.className = "reit-flags-legend";
    [
      { swCls: "sw-occ", label: "Low occupancy (< 80%)" },
      { swCls: "sw-exp", label: "Lease expiry within 12 months of data date" }
    ].forEach(function (item) {
      var swatch = document.createElement("span");
      swatch.className = "legend-swatch " + item.swCls;
      swatch.setAttribute("aria-hidden", "true");
      var wrapper = document.createElement("span");
      wrapper.appendChild(swatch);
      wrapper.appendChild(document.createTextNode(" " + item.label));
      div.appendChild(wrapper);
    });
    return div;
  }

  // ── Loading / error states ────────────────────────────────────
  function showLoading(root) {
    while (root.firstChild) { root.removeChild(root.firstChild); }
    var div = document.createElement("div");
    div.className = "reit-loading";

    var spinner = document.createElement("div");
    spinner.className = "reit-loading-spinner";
    spinner.setAttribute("aria-label", "Loading portfolio data");
    div.appendChild(spinner);

    var msg = document.createElement("p");
    msg.textContent = "Loading portfolio data…";
    div.appendChild(msg);

    root.appendChild(div);
  }

  function showError(root, message) {
    while (root.firstChild) { root.removeChild(root.firstChild); }
    var box = document.createElement("div");
    box.className = "reit-error-box";

    var strong = document.createElement("strong");
    strong.textContent = "Could not load portfolio";
    box.appendChild(strong);

    var detail = document.createElement("p");
    detail.textContent = message || "Unknown error.";
    box.appendChild(detail);

    var hint = document.createElement("p");
    hint.style.marginTop  = "0.5rem";
    hint.style.fontStyle  = "italic";
    hint.textContent = "Make sure the local HTTP server is running: python3 -m http.server 8080";
    box.appendChild(hint);

    root.appendChild(box);
    if (typeof showToast === "function") {
      showToast("Portfolio load failed — " + (message || "unknown error"), "error");
    }
  }

  // ── Boot ─────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

}());

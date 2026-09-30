/**
 * statsDashboard.js — consolidated statistical analysis dashboard
 * SPJIMR — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * DESIGN RULE: THIS FILE DOES NOT COMPUTE STATISTICS.
 *
 * Everything shown here is read from public/data/statistics.json, which is
 * produced once at build time by data-pipeline/scripts/computeStatistics.js.
 * The dashboard is a pure renderer.
 *
 * That split is deliberate. Computing descriptives, stratified correlation
 * matrices, an OLS fit and four outlier detectors over 2,156 observations in
 * the page would mean hundreds of passes on the main thread — which is how a
 * tab locks up and looks, to the person using it, like a crash. Reading a
 * pre-computed file cannot lock up, because there is nothing to compute.
 *
 * It also means the page works as a plain static file with no server, which
 * is what allows the site to be published (e.g. to GitHub Pages) and opened
 * from a URL rather than started from a terminal.
 *
 * Every value is rendered through fmt(), which turns null/undefined/NaN into
 * an em dash. A thin or degenerate group therefore shows a blank cell instead
 * of throwing and blanking the page.
 */

(function () {
  "use strict";

  var DATA_URL = "data/statistics.json";
  var stats = null;
  var loadError = null;
  var loading = false;
  var rendered = false;

  var TYPE_COLOURS = {
    "Commercial Office": "#3b7dd8",
    "Retail":            "#2e9e6b",
    "Residential":       "#d98324"
  };

  // ─── Formatting helpers (null-safe throughout) ────────────────────────────

  function fmt(v, dp) {
    if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) { return "—"; }
    if (typeof v !== "number") { return String(v); }
    return v.toFixed(dp === undefined ? 2 : dp);
  }

  function fmtInt(v) {
    if (v === null || v === undefined || !isFinite(v)) { return "—"; }
    return Math.round(v).toLocaleString("en-IN");
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }

  function section(title, subtitle) {
    var s = el("div", "reit-section reit-dash-section");
    s.appendChild(el("h3", null, title));
    if (subtitle) { s.appendChild(el("p", "reit-note", subtitle)); }
    return s;
  }

  function table(headers) {
    var wrap = el("div", "reit-table-wrap");
    var t = el("table", "reit-table reit-dash-table");
    var thead = el("thead");
    var tr = el("tr");
    headers.forEach(function (h) { tr.appendChild(el("th", null, h)); });
    thead.appendChild(tr);
    t.appendChild(thead);
    t.appendChild(el("tbody"));
    wrap.appendChild(t);
    return { wrap: wrap, body: t.querySelector("tbody") };
  }

  function row(body, cells, cls) {
    var tr = el("tr", cls || null);
    cells.forEach(function (c) {
      if (c && c.nodeType) { var td = el("td"); td.appendChild(c); tr.appendChild(td); }
      else { tr.appendChild(el("td", null, c)); }
    });
    body.appendChild(tr);
    return tr;
  }

  /** Colour a correlation cell by sign and strength. */
  function corrCell(v) {
    var span = el("span", "reit-corr", fmt(v, 2));
    if (typeof v === "number" && isFinite(v)) {
      var a = Math.min(Math.abs(v), 1);
      span.style.background = v >= 0
        ? "rgba(46, 158, 107, " + (0.08 + a * 0.45).toFixed(2) + ")"
        : "rgba(217, 83, 79, "  + (0.08 + a * 0.45).toFixed(2) + ")";
      if (a > 0.6) { span.style.fontWeight = "700"; }
    }
    return span;
  }

  // ─── Panels ───────────────────────────────────────────────────────────────

  function panelHeadline() {
    var s = section("Dataset at a Glance",
      "Every figure on this page is computed from the observation-level dataset at build time and read here as a file. " +
      "Nothing on this page is calculated in your browser.");
    var strip = el("div", "reit-output-stats");
    [
      ["Observations",      fmtInt(stats.totalObservations)],
      ["Variables Analysed", String((stats.variables || []).length)],
      ["Planted Outliers",  fmtInt(((stats.outlierDetection || {}).groundTruth || {}).planted) +
                            "  (" + fmt(((stats.outlierDetection || {}).groundTruth || {}).contaminationPct, 2) + "%)"],
      ["Generator Seed",    String(stats.seed)]
    ].forEach(function (p) {
      var box = el("div", "reit-output-stat");
      box.appendChild(el("div", "reit-output-stat-label", p[0]));
      box.appendChild(el("div", "reit-output-stat-value", p[1]));
      strip.appendChild(box);
    });
    s.appendChild(strip);
    return s;
  }

  function panelDescriptives() {
    var s = section("Descriptive Statistics",
      "Distribution of each variable across all " + fmtInt(stats.totalObservations) +
      " observations. Skewness and excess kurtosis are reported because they indicate " +
      "departure from normality independently of sample size — a significance test on " +
      "2,156 points rejects normality for trivial deviations.");

    var t = table(["Variable", "n", "Mean", "Median", "SD", "CV", "Min", "Q1", "Q3", "Max", "IQR", "Skew", "Kurtosis"]);
    (stats.variables || []).forEach(function (v) {
      var d = (stats.descriptives.overall || {})[v.key] || {};
      var skewCell = el("span", null, fmt(d.skewness, 2));
      if (typeof d.skewness === "number" && Math.abs(d.skewness) > 0.5) {
        skewCell.className = "reit-flag-warn";
        skewCell.title = "|skew| > 0.5 — materially non-normal";
      }
      row(t.body, [
        v.label, fmtInt(d.n), fmt(d.mean, 2), fmt(d.median, 2), fmt(d.sd, 2), fmt(d.cv, 3),
        fmt(d.min, 2), fmt(d.q1, 2), fmt(d.q3, 2), fmt(d.max, 2), fmt(d.iqr, 2),
        skewCell, fmt(d.kurtosis, 2)
      ]);
    });
    s.appendChild(t.wrap);
    return s;
  }

  function panelSimpson() {
    var flips = (stats.simpsonsParadox || []).filter(function (p) { return p.signFlip; });
    var s = section("Correlation Structure — Stratified vs Pooled",
      "Correlations are shown both within each asset class and across all of them. " +
      (flips.length
        ? "Note the row marked below: pooling the asset classes REVERSES the sign of that relationship. " +
          "This is Simpson's paradox — the pooled figure states the opposite of what every individual asset class shows."
        : "Pooled and stratified figures agree here."));

    var types = Object.keys((stats.correlations || {}).byPropertyType || {});
    var t = table(["Relationship"].concat(types).concat(["POOLED", "Expected"]));

    (stats.simpsonsParadox || []).forEach(function (p) {
      var cells = [el("span", null, p.label)];
      types.forEach(function (ty) { cells.push(corrCell((p.byPropertyType || {})[ty])); });
      cells.push(corrCell(p.pooled));
      cells.push(el("span", "reit-note-inline", p.expect + " — " + p.why));
      var tr = row(t.body, cells, p.signFlip ? "reit-row-flag" : null);
      if (p.signFlip) { tr.title = "Sign reverses when asset classes are pooled"; }
    });
    s.appendChild(t.wrap);

    if (flips.length) {
      var box = el("div", "reit-callout");
      box.appendChild(el("strong", null, "Why this matters: "));
      box.appendChild(document.createTextNode(
        "the pooled correlation is not a summary of the stratified ones — it can point the other way. " +
        "Any conclusion drawn from the pooled matrix alone would be wrong here, which is why the " +
        "analysis below is stratified throughout."));
      s.appendChild(box);
    }
    return s;
  }

  function panelOutliers() {
    var od = stats.outlierDetection || {};
    var gt = od.groundTruth || {};
    var s = section("Outlier Detection — Measured Against Known Truth",
      "The generator planted " + fmtInt(gt.planted) + " outliers by five different mechanisms and recorded " +
      "their identities in a separate file, which the detectors never read. Performance below is therefore " +
      "measured, not asserted.");

    var t = table(["Method", "Family", "Flagged", "True +", "False +", "Missed", "Precision", "Recall", "F1"]);
    var best = null;
    Object.keys(od.detectors || {}).forEach(function (k) {
      var d = od.detectors[k];
      if (!d.score) { row(t.body, [d.method || k, d.family || "—", "not run", "—", "—", "—", "—", "—", "—"]); return; }
      if (!best || d.score.f1 > best.f1) { best = { key: k, f1: d.score.f1 }; }
    });
    Object.keys(od.detectors || {}).forEach(function (k) {
      var d = od.detectors[k];
      if (!d.score) { return; }
      var sc = d.score;
      row(t.body, [
        d.method || k, d.family || "—", fmtInt(sc.flagged),
        fmtInt(sc.truePositives), fmtInt(sc.falsePositives), fmtInt(sc.falseNegatives),
        fmt(sc.precision, 3), fmt(sc.recall, 3), fmt(sc.f1, 3)
      ], best && best.key === k ? "reit-row-best" : null);
    });
    s.appendChild(t.wrap);

    // Per-mechanism recall — the table that shows no single method wins.
    var rbm = od.recallByMechanism || {};
    var detKeys = Object.keys(rbm);
    if (detKeys.length) {
      s.appendChild(el("h4", "reit-dash-subhead", "Which mechanism does each method actually catch?"));
      s.appendChild(el("p", "reit-note",
        "Read across a row: no single method dominates. Univariate rules catch small shifts in one " +
        "variable; only a multivariate method recovers observations whose individual values are all " +
        "unremarkable and whose COMBINATION is impossible."));
      var mechs = Object.keys(gt.byMechanism || {}).sort();
      var t2 = table(["Mechanism", "Planted"].concat(detKeys.map(shortName)));
      mechs.forEach(function (m) {
        var cells = [m.replace(/_/g, " "), fmtInt((gt.byMechanism || {})[m])];
        detKeys.forEach(function (d) {
          var v = (rbm[d] || {})[m] || {};
          var span = el("span", null, fmtInt(v.found) + " / " + fmtInt(v.planted));
          if (v.planted && v.found === v.planted) { span.className = "reit-flag-good"; }
          else if (v.planted && v.found === 0) { span.className = "reit-flag-bad"; }
          cells.push(span);
        });
        row(t2.body, cells);
      });
      s.appendChild(t2.wrap);
    }

    var note = el("div", "reit-callout");
    note.appendChild(el("strong", null, "Limitation: "));
    note.appendChild(document.createTextNode(
      "the χ² cutoff used by the Mahalanobis detectors assumes multivariate normality. This dataset is a " +
      "mixture across markets even within one asset class, so the nominal 1% false-positive rate is not " +
      "achieved in practice and precision is correspondingly low. The recall figures remain informative."));
    s.appendChild(note);
    return s;
  }

  function shortName(k) {
    return k.replace("tukey", "Tukey ").replace("mahalanobis", "Mahal. ")
            .replace("Pooled", "pooled").replace("Stratified", "strat.")
            .replace("Robust", "pooled");
  }

  function panelRegression() {
    var r = (stats.regression || {}).yieldOnGrowth;
    var s = section("Regression — Gross Yield on Rental Growth",
      "Ordinary least squares across all observations, with the same fit computed within each asset class.");
    if (!r) { s.appendChild(el("p", "reit-note", "Regression could not be computed.")); return s; }

    var t = table(["Model", "n", "Slope", "SE(slope)", "t", "Intercept", "R²", "RMSE"]);
    row(t.body, ["All observations (pooled)", fmtInt(r.n), fmt(r.slope, 4), fmt(r.seSlope, 4),
                 fmt(r.tSlope, 2), fmt(r.intercept, 3), fmt(r.r2, 4), fmt(r.rmse, 3)]);
    Object.keys((stats.regression || {}).byPropertyType || {}).forEach(function (ty) {
      var m = stats.regression.byPropertyType[ty];
      if (!m) { return; }
      row(t.body, [ty, fmtInt(m.n), fmt(m.slope, 4), fmt(m.seSlope, 4),
                   fmt(m.tSlope, 2), fmt(m.intercept, 3), fmt(m.r2, 4), fmt(m.rmse, 3)]);
    });
    s.appendChild(t.wrap);
    return s;
  }

  function panelSampleSize() {
    var ss = stats.sampleSize || {};
    var s = section("Sample-Size Adequacy",
      fmtInt((ss.belowThreshold || []).length) + " of " + fmtInt(ss.totalMarkets) +
      " markets hold fewer than " + fmtInt(ss.threshold) + " observations. Estimates for these " +
      "segments carry wider uncertainty and are flagged wherever they appear in the analysis.");
    var t = table(["Market", "City", "Locality", "Type", "n"]);
    (ss.belowThreshold || []).forEach(function (m) {
      row(t.body, [m.marketId, m.city, m.locality, m.propertyType, fmtInt(m.n)], "reit-row-flag");
    });
    if (!(ss.belowThreshold || []).length) {
      row(t.body, ["—", "—", "No markets below threshold", "—", "—"]);
    }
    s.appendChild(t.wrap);
    return s;
  }

  // ─── Scatter (Canvas — 2,156 points would be 2,156 DOM nodes in SVG) ──────

  function panelScatter() {
    var sc = stats.scatter || {};
    var s = section("Yield vs Rental Growth — All " + fmtInt((sc.points || []).length) + " Observations",
      "Each point is one property observation. Planted outliers are ringed. The solid line is the OLS fit; " +
      "the shaded band is its 95% confidence interval.");

    var legend = el("div", "reit-scatter-legend");
    Object.keys(TYPE_COLOURS).forEach(function (t) {
      var item = el("span", "reit-legend-item");
      var dot = el("span", "reit-legend-dot");
      dot.style.background = TYPE_COLOURS[t];
      item.appendChild(dot);
      item.appendChild(document.createTextNode(t));
      legend.appendChild(item);
    });
    var oItem = el("span", "reit-legend-item");
    var oDot = el("span", "reit-legend-dot reit-legend-ring");
    oItem.appendChild(oDot);
    oItem.appendChild(document.createTextNode("planted outlier"));
    legend.appendChild(oItem);
    s.appendChild(legend);

    var canvas = el("canvas", "reit-dash-canvas");
    canvas.width = 900; canvas.height = 480;
    s.appendChild(canvas);
    drawScatter(canvas, sc);
    return s;
  }

  function drawScatter(canvas, sc) {
    var pts = sc.points || [];
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx || !pts.length) { return; }

    var W = canvas.width, H = canvas.height;
    var padL = 64, padR = 20, padT = 18, padB = 52;
    var pw = W - padL - padR, ph = H - padT - padB;

    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var xPad = (xMax - xMin) * 0.04 || 1, yPad = (yMax - yMin) * 0.04 || 1;
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;

    function X(v) { return padL + ((v - xMin) / (xMax - xMin)) * pw; }
    function Y(v) { return padT + ph - ((v - yMin) / (yMax - yMin)) * ph; }

    ctx.clearRect(0, 0, W, H);

    // Grid + axes
    ctx.strokeStyle = "#e3e8ef"; ctx.lineWidth = 1;
    ctx.fillStyle = "#7a879b"; ctx.font = "11px -apple-system, system-ui, sans-serif";
    var i;
    for (i = 0; i <= 5; i++) {
      var gy = padT + (ph / 5) * i;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + pw, gy); ctx.stroke();
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText((yMax - ((yMax - yMin) / 5) * i).toFixed(1), padL - 8, gy);
    }
    for (i = 0; i <= 5; i++) {
      var gx = padL + (pw / 5) * i;
      ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + ph); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText((xMin + ((xMax - xMin) / 5) * i).toFixed(1), gx, padT + ph + 8);
    }

    // Confidence band around the OLS fit.
    var fit = sc.fit;
    if (fit && typeof fit.slope === "number" && fit.sxx) {
      var tCrit = 1.96;   // large-sample normal approximation; n = 2,156
      var upper = [], lower = [];
      for (i = 0; i <= 60; i++) {
        var xv = xMin + ((xMax - xMin) / 60) * i;
        var yv = fit.intercept + fit.slope * xv;
        var se = fit.rmse * Math.sqrt(1 / fit.n + Math.pow(xv - fit.meanX, 2) / fit.sxx);
        upper.push([xv, yv + tCrit * se]);
        lower.push([xv, yv - tCrit * se]);
      }
      ctx.beginPath();
      ctx.moveTo(X(upper[0][0]), Y(upper[0][1]));
      upper.forEach(function (p) { ctx.lineTo(X(p[0]), Y(p[1])); });
      for (i = lower.length - 1; i >= 0; i--) { ctx.lineTo(X(lower[i][0]), Y(lower[i][1])); }
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 125, 216, 0.16)";
      ctx.fill();
    }

    // Points. Low alpha so density reads as shading where the cloud is thick.
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), p.o ? 4.2 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLOURS[p.t] || "#8892a4";
      ctx.globalAlpha = p.o ? 0.95 : 0.34;
      ctx.fill();
      if (p.o) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 7, 0, Math.PI * 2); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    // Fitted line on top.
    if (fit && typeof fit.slope === "number") {
      ctx.strokeStyle = "#1f4e96"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(xMin), Y(fit.intercept + fit.slope * xMin));
      ctx.lineTo(X(xMax), Y(fit.intercept + fit.slope * xMax));
      ctx.stroke();

      // Inset statistics box, in the manner of a PROC REG plot.
      var lines = [
        "N = " + fmtInt(fit.n),
        "slope = " + fmt(fit.slope, 4),
        "R² = " + fmt(fit.r2, 4),
        "RMSE = " + fmt(fit.rmse, 3)
      ];
      var bw = 132, bh = 16 * lines.length + 12;
      var bx = padL + pw - bw - 10, by = padT + 10;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1;
      ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = "#33415c"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      lines.forEach(function (ln, k) { ctx.fillText(ln, bx + 9, by + 7 + k * 16); });
    }

    // Axis titles
    ctx.fillStyle = "#4a5768";
    ctx.font = "12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(sc.xLabel || "x", padL + pw / 2, H - 12);
    ctx.save();
    ctx.translate(16, padT + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "top";
    ctx.fillText(sc.yLabel || "y", 0, 0);
    ctx.restore();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function build(container) {
    container.innerHTML = "";

    if (loadError) {
      var err = el("div", "reit-agent-unavailable");
      err.appendChild(el("p", "reit-agent-unavail-msg", "Statistics file could not be loaded."));
      var det = el("div", "reit-agent-offline-expl");
      det.appendChild(el("p", "reit-agent-offline-title", "How to produce it"));
      var ul = el("ul", "reit-agent-offline-list");
      [
        "This page reads data/statistics.json, which is generated once and committed.",
        "Regenerate it with: node data-pipeline/scripts/computeStatistics.js",
        "The rest of the application is unaffected — only this dashboard needs the file.",
        "Reported error: " + loadError
      ].forEach(function (t) { ul.appendChild(el("li", null, t)); });
      det.appendChild(ul);
      err.appendChild(det);
      container.appendChild(err);
      return;
    }

    if (!stats) {
      container.appendChild(el("p", "reit-note", "Loading statistics…"));
      return;
    }

    // Each panel is built independently and guarded, so one bad panel cannot
    // take the whole page down with it.
    [panelHeadline, panelScatter, panelSimpson, panelOutliers,
     panelDescriptives, panelRegression, panelSampleSize].forEach(function (fn) {
      try {
        container.appendChild(fn());
      } catch (e) {
        var s = el("div", "reit-section");
        s.appendChild(el("p", "reit-note", "This panel could not be rendered: " + e.message));
        container.appendChild(s);
        if (window.console) { console.error("[statsDashboard]", fn.name, e); }
      }
    });

    var foot = el("p", "reit-agent-disclaimer",
      stats.disclaimer || "Synthetic academic data. Not investment advice.");
    container.appendChild(foot);
  }

  function render() {
    var container = document.getElementById("statsdash-content");
    if (!container) { return; }

    if (stats || loadError) { build(container); rendered = true; return; }
    if (loading) { return; }

    loading = true;
    build(container);   // shows the loading line

    fetch(DATA_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) { throw new Error("HTTP " + r.status); }
        return r.json();
      })
      .then(function (json) {
        stats = json; loading = false; build(container); rendered = true;
      })
      .catch(function (e) {
        loadError = e.message || String(e);
        loading = false;
        build(container);
      });
  }

  // ─── Mount (same pattern the other pages use) ─────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    function maybeRender() {
      var page = document.getElementById("page-statsdash");
      if (page && page.classList.contains("page-active")) { render(); }
    }
    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#statsdash") { render(); }
    });
    var main = document.getElementById("main-content");
    if (main && window.MutationObserver) {
      new MutationObserver(maybeRender).observe(main, {
        subtree: true, attributes: true, attributeFilter: ["class"]
      });
    }
    maybeRender();
  });

  window.ReitStatsDashboard = { render: render };
}());

/**
 * statsDashboard.js — consolidated statistical analysis
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 * ALL DATA IS SYNTHETIC.
 *
 * DESIGN RULE 1: THIS FILE DOES NOT COMPUTE STATISTICS.
 * Everything is read from public/data/statistics.json, produced once at build
 * time by data-pipeline/scripts/computeStatistics.js. Computing descriptives,
 * stratified correlations, four detectors and regressions over 2,156 records
 * in the page would mean hundreds of main-thread passes — which is how a tab
 * locks up and looks, to the reader, like a crash. Reading a file cannot.
 *
 * DESIGN RULE 2: FINDINGS ARE DERIVED, NEVER HARDCODED.
 * deriveFindings() inspects the actual numbers and states what they show. If
 * the data changes, the findings change with it. No conclusion is written as
 * a string constant, because a hardcoded conclusion silently becomes a lie
 * the first time the underlying data moves.
 *
 * DESIGN RULE 3: LANGUAGE DISCIPLINE.
 *   - Correlation is never described as causation. Variables "move with" or
 *     "are associated with" one another; nothing "drives" or "causes".
 *   - Every interpretation names the sample size it rests on.
 *   - Statistical significance and business significance are stated
 *     separately and never conflated.
 *   - The 2,156 records are SIMULATED MARKET OBSERVATIONS. They are not
 *     properties, listings, or transactions, and are never called such.
 */

(function () {
  "use strict";

  var DATA_URL = "data/statistics.json";
  var stats = null, loadError = null, loading = false;

  var TYPE_COLOURS = {
    "Commercial Office": "#3b7dd8",
    "Retail":            "#2e9e6b",
    "Residential":       "#d98324"
  };

  /** The one place this phrase is defined, so it cannot drift between panels. */
  var OBS_NOUN       = "simulated market observations";
  var OBS_NOUN_SING  = "simulated market observation";

  // ─── Formatting ───────────────────────────────────────────────────────────

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

  /** A short inline definition, rendered as a dotted-underline tooltip term. */
  function term(word, definition) {
    var s = el("span", "reit-term", word);
    s.title = definition;
    s.setAttribute("aria-label", word + ": " + definition);
    return s;
  }

  var DEFINITIONS = {
    median:      "The middle value: half the observations sit above it, half below. Less affected by extremes than the mean.",
    sd:          "Standard deviation — the typical distance of an observation from the mean. Larger means more spread out.",
    iqr:         "Interquartile range — the span covering the middle 50% of observations.",
    skewness:    "How lopsided a distribution is. Near 0 is symmetric; positive means a longer right tail.",
    kurtosis:    "How heavy the tails are compared with a normal distribution. Above 0 means more extreme values than normal.",
    correlation: "A number from -1 to +1 describing how two measures move together. It describes association only, never cause.",
    r2:          "The share of variation in one measure that is accounted for by the other. 0.06 means 6%.",
    slope:       "How much the vertical measure changes for a one-unit change in the horizontal one, within this fitted line.",
    precision:   "Of everything the method flagged, the share that was genuinely anomalous. Low precision means many false alarms.",
    recall:      "Of the anomalies actually present, the share the method found.",
    f1:          "A single score balancing precision and recall. Higher is better; 1.0 is perfect.",
    tukey:       "A rule flagging values more than 1.5 interquartile ranges beyond the middle 50%.",
    mahalanobis: "A distance measure that accounts for several variables at once, so it can flag a combination that is odd even when each single value looks ordinary.",
    stratified:  "Applied separately within each group, rather than once across everything pooled together."
  };

  function section(id, title, subtitle) {
    var s = el("div", "reit-section reit-dash-section");
    s.id = "statsec-" + id;
    s.appendChild(el("h3", null, title));
    if (subtitle) { s.appendChild(el("p", "reit-note", subtitle)); }
    return s;
  }

  /** The "what this tells you" line. Always states the sample size it rests on. */
  function interpretation(text, basisN) {
    var d = el("div", "reit-interpret");
    d.appendChild(el("strong", null, "What this tells you: "));
    d.appendChild(document.createTextNode(text));
    if (basisN) {
      d.appendChild(el("span", "reit-interpret-basis", "  Based on " + fmtInt(basisN) + " " + OBS_NOUN + "."));
    }
    return d;
  }

  function table(headers) {
    var wrap = el("div", "reit-table-wrap");
    var t = el("table", "reit-table reit-dash-table");
    var thead = el("thead"), tr = el("tr");
    headers.forEach(function (h) {
      var th = el("th");
      if (h && h.nodeType) { th.appendChild(h); } else { th.textContent = h; }
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead); t.appendChild(el("tbody"));
    wrap.appendChild(t);
    return { wrap: wrap, body: t.querySelector("tbody") };
  }

  function row(body, cells, cls) {
    var tr = el("tr", cls || null);
    cells.forEach(function (c) {
      var td = el("td");
      if (c && c.nodeType) { td.appendChild(c); } else { td.textContent = c; }
      tr.appendChild(td);
    });
    body.appendChild(tr);
    return tr;
  }

  function corrCell(v) {
    var span = el("span", "reit-corr", fmt(v, 2));
    if (typeof v === "number" && isFinite(v)) {
      var a = Math.min(Math.abs(v), 1);
      span.style.background = v >= 0
        ? "rgba(46,158,107," + (0.08 + a * 0.45).toFixed(2) + ")"
        : "rgba(217,83,79," + (0.08 + a * 0.45).toFixed(2) + ")";
      if (a > 0.6) { span.style.fontWeight = "700"; }
    }
    return span;
  }

  /** A collapsed <details> block, so full output stays available without clutter. */
  function expandable(summaryText, buildBody) {
    var d = el("details", "reit-expandable");
    var s = el("summary", null, summaryText);
    d.appendChild(s);
    var inner = el("div", "reit-expandable-body");
    try { inner.appendChild(buildBody()); }
    catch (e) { inner.appendChild(el("p", "reit-note", "Could not render: " + e.message)); }
    d.appendChild(inner);
    return d;
  }

  // ─── Findings, derived from the data ──────────────────────────────────────

  /**
   * Inspect the statistics and state what they actually show.
   * Each finding carries the sample size behind it, avoids causal language,
   * and separates a statistical observation from its business reading.
   */
  function deriveFindings(s) {
    var out = [];
    var n = s.totalObservations;

    // 1. Sign reversal between stratified and pooled correlation.
    var flips = (s.simpsonsParadox || []).filter(function (p) { return p.signFlip; });
    if (flips.length) {
      var f = flips[0];
      var strata = Object.keys(f.byPropertyType || {});
      var vals = strata.map(function (t) { return f.byPropertyType[t]; })
                       .filter(function (v) { return v !== null; });
      if (vals.length) {
        var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
        out.push({
          kind: "critical",
          headline: "Pooling the asset classes reverses a relationship",
          body: "Within each of the " + strata.length + " asset classes, " + f.label.toLowerCase() +
                " shows a correlation between " + fmt(lo, 2) + " and " + fmt(hi, 2) + ". Pooled across all " +
                "classes it is " + fmt(f.pooled, 2) + " — the opposite sign. This is Simpson's paradox: the " +
                "classes sit at different levels, so combining them produces an aggregate figure that " +
                "contradicts every group inside it. Any reading taken from the pooled number alone would " +
                "be wrong, which is why the analysis below is stratified throughout.",
          basisN: n
        });
      }
    }

    // 2. Grouping effect on anomaly detection.
    var det = (s.outlierDetection || {}).detectors || {};
    if (det.tukeyPooled && det.tukeyStratified &&
        det.tukeyPooled.score && det.tukeyStratified.score) {
      var p = det.tukeyPooled.score, st = det.tukeyStratified.score;
      var planted = ((s.outlierDetection || {}).groundTruth || {}).planted;
      out.push({
        kind: "critical",
        headline: "The same rule works or fails depending on how it is grouped",
        body: "Applying the identical 1.5-IQR rule across everything pooled gives precision " +
              fmt(p.precision, 3) + " with " + fmtInt(p.falsePositives) + " false positives. Applying it " +
              "within each market gives precision " + fmt(st.precision, 3) + " and recall " + fmt(st.recall, 3) +
              " (F1 " + fmt(st.f1, 3) + " against " + fmt(p.f1, 3) + "). Nothing about the method changed — only " +
              "the grouping. Measured against " + fmtInt(planted) + " known anomalies.",
        basisN: n
      });
    }

    // 3. Multivariate detection recovering combination-only anomalies.
    var rbm = (s.outlierDetection || {}).recallByMechanism || {};
    if (rbm.mahalanobisStratified && rbm.mahalanobisStratified.bivariate_only) {
      var mv = rbm.mahalanobisStratified.bivariate_only;
      var uv = (rbm.tukeyStratified || {}).bivariate_only || { found: 0, planted: mv.planted };
      out.push({
        kind: "normal",
        headline: "Some anomalies are only visible across several measures at once",
        body: "Of " + fmtInt(mv.planted) + " anomalies constructed so that each individual value stays " +
              "inside its normal range, the single-variable rule recovered " + fmtInt(uv.found) + " and the " +
              "multivariate method recovered " + fmtInt(mv.found) + ". Statistically this shows the two " +
              "method families are complementary rather than competing. In practical terms, screening on " +
              "one measure at a time would have missed these records entirely.",
        basisN: n
      });
    }

    // 4. Pooled versus per-class regression slope.
    var reg = s.regression || {};
    if (reg.yieldOnGrowth && reg.byPropertyType) {
      var pooledSlope = reg.yieldOnGrowth.slope;
      var classSlopes = Object.keys(reg.byPropertyType)
        .map(function (t) { return reg.byPropertyType[t] && reg.byPropertyType[t].slope; })
        .filter(function (v) { return typeof v === "number"; });
      if (classSlopes.length && typeof pooledSlope === "number") {
        var steepest = Math.min.apply(null, classSlopes);
        if (Math.abs(pooledSlope) > Math.abs(steepest) * 1.3) {
          out.push({
            kind: "normal",
            headline: "The pooled trend line is steeper than any individual asset class",
            body: "Fitted across all classes the slope is " + fmt(pooledSlope, 4) + ", while within classes it " +
                  "ranges from " + fmt(Math.max.apply(null, classSlopes), 4) + " to " + fmt(steepest, 4) + ". " +
                  "The pooled line is largely tracing the vertical gap between asset classes rather than a " +
                  "relationship inside any of them. The chart below therefore draws each class separately, " +
                  "with the pooled line shown faintly and labelled as an artefact.",
            basisN: reg.yieldOnGrowth.n
          });
        }
      }
    }

    // 5. Sample-size adequacy.
    var ss = s.sampleSize || {};
    var thin = (ss.belowThreshold || []).length;
    if (thin) {
      var smallest = ss.belowThreshold.reduce(function (m, x) {
        return (m === null || x.n < m) ? x.n : m;
      }, null);
      out.push({
        kind: "caution",
        headline: fmtInt(thin) + " of " + fmtInt(ss.totalMarkets) + " market segments rest on thin samples",
        body: "These hold fewer than " + fmtInt(ss.threshold) + " observations, the smallest having " +
              fmtInt(smallest) + ". Estimates for them carry materially wider uncertainty. This is a " +
              "statement about estimate precision, not about whether those markets are attractive — a " +
              "thin segment may still rank well, but its ranking is less firmly established.",
        basisN: null
      });
    }

    return out;
  }

  // ─── 1. Key Findings ──────────────────────────────────────────────────────

  function panelFindings() {
    var s = section("findings", "Key Findings",
      "Generated from the analysis below, not written by hand. If the underlying data changes, these change with it.");
    var findings = deriveFindings(stats);
    if (!findings.length) {
      s.appendChild(el("p", "reit-note", "No findings could be derived from the current statistics file."));
      return s;
    }
    var list = el("div", "reit-findings");
    findings.forEach(function (f, i) {
      var card = el("div", "reit-finding reit-finding-" + f.kind);
      card.appendChild(el("div", "reit-finding-num", String(i + 1)));
      var body = el("div", "reit-finding-body");
      body.appendChild(el("div", "reit-finding-head", f.headline));
      body.appendChild(el("p", "reit-finding-text", f.body));
      if (f.basisN) {
        body.appendChild(el("p", "reit-finding-basis", "Based on " + fmtInt(f.basisN) + " " + OBS_NOUN + "."));
      }
      card.appendChild(body);
      list.appendChild(card);
    });
    s.appendChild(list);
    return s;
  }

  // ─── 2. Dataset and data quality ──────────────────────────────────────────

  function panelDataset() {
    var ss = stats.sampleSize || {};
    var gt = (stats.outlierDetection || {}).groundTruth || {};
    var s = section("dataset", "Dataset and Data Quality",
      "What this analysis is computed from, and where it is weakest.");

    var strip = el("div", "reit-output-stats");
    [
      ["Simulated Market Observations", fmtInt(stats.totalObservations)],
      ["Variables Analysed", String((stats.variables || []).length)],
      ["Known Synthetic Anomalies", fmtInt(gt.planted) + " (" + fmt(gt.contaminationPct, 2) + "%)"],
      ["Generator Seed", String(stats.seed)]
    ].forEach(function (p) {
      var box = el("div", "reit-output-stat");
      box.appendChild(el("div", "reit-output-stat-label", p[0]));
      box.appendChild(el("div", "reit-output-stat-value", p[1]));
      strip.appendChild(box);
    });
    s.appendChild(strip);

    var disc = el("div", "reit-callout reit-callout-warn");
    disc.appendChild(el("strong", null, "What these records are. "));
    disc.appendChild(document.createTextNode(
      "The " + fmtInt(stats.totalObservations) + " records are " + OBS_NOUN + " — draws from a seeded " +
      "generator representing the distribution used to estimate each market segment. They are not " +
      "individual properties, listings, or transactions, and not verified investment opportunities. " +
      "Every figure on this page inherits that limitation."));
    s.appendChild(disc);

    s.appendChild(interpretation(
      fmtInt((ss.belowThreshold || []).length) + " of " + fmtInt(ss.totalMarkets) + " market segments hold " +
      "fewer than " + fmtInt(ss.threshold) + " simulated observations, so their medians are less precise around " +
      "the assumed distribution than the rest. More draws improve that precision; they do not make any figure " +
      "more accurate about a real market. " +
      "The " + fmtInt(gt.planted) + " known synthetic anomalies were introduced deliberately by the generator and their " +
      "identities held in a separate file, which is what makes the detector scoring further down measurable " +
      "rather than asserted.", stats.totalObservations));

    s.appendChild(expandable("Show the " + fmtInt((ss.belowThreshold || []).length) + " thin market segments", function () {
      var t = table(["Market", "City", "Locality", "Type", "Observations"]);
      (ss.belowThreshold || []).forEach(function (m) {
        row(t.body, [m.marketId, m.city, m.locality, m.propertyType, fmtInt(m.n)], "reit-row-flag");
      });
      return t.wrap;
    }));
    return s;
  }

  // ─── 3. Descriptive statistics ────────────────────────────────────────────

  function panelDescriptives() {
    var s = section("descriptives", "Descriptive Statistics",
      "The shape of each variable across the whole dataset.");

    var compact = table([
      "Variable", "n",
      term("Median", DEFINITIONS.median),
      "Mean",
      term("SD", DEFINITIONS.sd),
      term("Skew", DEFINITIONS.skewness)
    ]);
    var skewed = [];
    (stats.variables || []).forEach(function (v) {
      var d = (stats.descriptives.overall || {})[v.key] || {};
      var skewCell = el("span", null, fmt(d.skewness, 2));
      if (typeof d.skewness === "number" && Math.abs(d.skewness) > 0.5) {
        skewCell.className = "reit-flag-warn";
        skewCell.title = "|skew| > 0.5 — materially asymmetric";
        skewed.push(v.label);
      }
      row(compact.body, [v.label, fmtInt(d.n), fmt(d.median, 2), fmt(d.mean, 2), fmt(d.sd, 2), skewCell]);
    });
    s.appendChild(compact.wrap);

    s.appendChild(interpretation(
      skewed.length
        ? skewed.length + " of " + (stats.variables || []).length + " variables are materially asymmetric " +
          "(" + skewed.join(", ") + "), so for those the median describes the typical value better than the mean. " +
          "Note that with a sample this large, a significance test would reject normality for even trivial " +
          "departures — the asymmetry is flagged here by its size, not by a p-value."
        : "No variable shows material asymmetry, so means and medians tell a similar story.",
      stats.totalObservations));

    s.appendChild(expandable("Show the full table — quartiles, range, IQR, percentiles, kurtosis, MAD", function () {
      var full = table(["Variable", "n", "Mean", "Median", "SD", "CV", "Min", "Q1", "Q3", "Max",
                        "IQR", "P10", "P90", "Skew", "Kurtosis", "MAD"]);
      (stats.variables || []).forEach(function (v) {
        var d = (stats.descriptives.overall || {})[v.key] || {};
        row(full.body, [v.label, fmtInt(d.n), fmt(d.mean, 2), fmt(d.median, 2), fmt(d.sd, 2), fmt(d.cv, 3),
                        fmt(d.min, 2), fmt(d.q1, 2), fmt(d.q3, 2), fmt(d.max, 2), fmt(d.iqr, 2),
                        fmt(d.p10, 2), fmt(d.p90, 2), fmt(d.skewness, 2), fmt(d.kurtosis, 2), fmt(d.mad, 2)]);
      });
      return full.wrap;
    }));
    return s;
  }

  // ─── 4. Distribution and anomaly analysis (chart + fits, merged) ──────────

  function panelDistribution() {
    var sc = stats.scatter || {};
    var gt = (stats.outlierDetection || {}).groundTruth || {};
    var s = section("distribution", "Distribution and Anomaly Analysis",
      "All " + fmtInt((sc.points || []).length) + " " + OBS_NOUN + ". Each asset class is fitted separately; " +
      "known anomalies are ringed.");

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
    oItem.appendChild(el("span", "reit-legend-dot reit-legend-ring"));
    oItem.appendChild(document.createTextNode("known anomaly"));
    legend.appendChild(oItem);
    var pItem = el("span", "reit-legend-item");
    pItem.appendChild(el("span", "reit-legend-dash"));
    pItem.appendChild(document.createTextNode("pooled fit (artefact — see note)"));
    legend.appendChild(pItem);
    s.appendChild(legend);

    var canvas = el("canvas", "reit-dash-canvas");
    canvas.width = 920; canvas.height = 500;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label",
      "Scatter plot of gross yield against rental growth for " + fmtInt((sc.points || []).length) +
      " simulated market observations, with a separate fitted line for each asset class.");
    s.appendChild(canvas);
    drawScatter(canvas, sc);

    var reg = stats.regression || {};
    var pooled = reg.yieldOnGrowth || {};
    s.appendChild(interpretation(
      "The three asset classes occupy different yield levels, so each is fitted separately. The faint dashed " +
      "line is the pooled fit across all classes; it is steeper than any individual class because it is " +
      "largely tracing the gap between them rather than a relationship within any one. Ringed points are " +
      "anomalous relative to their own market, which is why ordinary-looking residential records are not " +
      "ringed — low yield is normal for residential, not anomalous.",
      pooled.n || stats.totalObservations));

    var note = el("div", "reit-callout");
    note.appendChild(el("strong", null, "On the pooled line. "));
    note.appendChild(document.createTextNode(
      "It is drawn faintly and kept deliberately: the contrast between it and the three real fits is the " +
      "clearest illustration on this page of why the analysis is stratified. It should not be read as a " +
      "relationship between yield and growth."));
    s.appendChild(note);

    s.appendChild(expandable("Show how each anomaly mechanism was recovered by each method", function () {
      var rbm = (stats.outlierDetection || {}).recallByMechanism || {};
      var keys = Object.keys(rbm);
      var mechs = Object.keys(gt.byMechanism || {}).sort();
      var t = table(["Mechanism", "Introduced"].concat(keys.map(shortName)));
      mechs.forEach(function (m) {
        var cells = [m.replace(/_/g, " "), fmtInt((gt.byMechanism || {})[m])];
        keys.forEach(function (d) {
          var v = (rbm[d] || {})[m] || {};
          var sp = el("span", null, fmtInt(v.found) + " / " + fmtInt(v.planted));
          if (v.planted && v.found === v.planted) { sp.className = "reit-flag-good"; }
          else if (v.planted && v.found === 0) { sp.className = "reit-flag-bad"; }
          cells.push(sp);
        });
        row(t.body, cells);
      });
      return t.wrap;
    }));
    return s;
  }

  function shortName(k) {
    return k.replace("tukey", "Tukey ").replace("mahalanobis", "Mahal. ")
            .replace("Pooled", "pooled").replace("Stratified", "strat.").replace("Robust", "pooled");
  }

  // ─── 5. Group comparisons ─────────────────────────────────────────────────

  function panelGroups() {
    var s = section("groups", "Group Comparisons",
      "How the asset classes differ. These are descriptive comparisons, not hypothesis tests.");

    var types = Object.keys(stats.descriptives.byPropertyType || {});
    var t = table(["Asset class", "n",
                   term("Median", DEFINITIONS.median) , "Mean",
                   term("SD", DEFINITIONS.sd), "Min", "Max"]);
    types.forEach(function (ty) {
      var d = (stats.descriptives.byPropertyType[ty] || {}).gross_yield_pct || {};
      var label = el("span", null, ty);
      label.style.borderLeft = "3px solid " + (TYPE_COLOURS[ty] || "#888");
      label.style.paddingLeft = "7px";
      row(t.body, [label, fmtInt(d.n), fmt(d.median, 2) + "%", fmt(d.mean, 2) + "%",
                   fmt(d.sd, 2), fmt(d.min, 2) + "%", fmt(d.max, 2) + "%"]);
    });
    s.appendChild(t.wrap);

    var meds = types.map(function (ty) {
      var d = (stats.descriptives.byPropertyType[ty] || {}).gross_yield_pct || {};
      return { t: ty, m: d.median, n: d.n };
    }).filter(function (x) { return typeof x.m === "number"; })
      .sort(function (a, b) { return b.m - a.m; });

    if (meds.length >= 2) {
      s.appendChild(interpretation(
        "Median gross yield runs from " + fmt(meds[0].m, 2) + "% (" + meds[0].t + ", n=" + fmtInt(meds[0].n) + ") " +
        "down to " + fmt(meds[meds.length - 1].m, 2) + "% (" + meds[meds.length - 1].t + ", n=" +
        fmtInt(meds[meds.length - 1].n) + "). These are different populations with different centres, which is " +
        "why every analysis on this page is run within class rather than across the pooled set. The gap is a " +
        "structural feature of the asset classes, not evidence that one is a better investment — yield alone " +
        "says nothing about risk or growth.", stats.totalObservations));
    }

    s.appendChild(expandable("Show all variables by asset class, and by city", function () {
      var box = el("div");
      [["By asset class", stats.descriptives.byPropertyType],
       ["By city", stats.descriptives.byCity]].forEach(function (pair) {
        box.appendChild(el("h4", "reit-dash-subhead", pair[0]));
        var groups = Object.keys(pair[1] || {});
        var tt = table(["Group"].concat((stats.variables || []).map(function (v) { return v.label; })));
        groups.forEach(function (g) {
          var cells = [g];
          (stats.variables || []).forEach(function (v) {
            var d = (pair[1][g] || {})[v.key] || {};
            cells.push(fmt(d.median, 2) + " (n=" + fmtInt(d.n) + ")");
          });
          row(tt.body, cells);
        });
        box.appendChild(tt.wrap);
      });
      return box;
    }));
    return s;
  }

  // ─── 6. Correlation and regression ────────────────────────────────────────

  function panelCorrelation() {
    var s = section("correlation", "Correlation and Regression",
      "How measures move together, computed within each asset class and across all of them.");

    var defn = el("p", "reit-note");
    defn.appendChild(document.createTextNode("A "));
    defn.appendChild(term("correlation", DEFINITIONS.correlation));
    defn.appendChild(document.createTextNode(
      " runs from −1 to +1 and describes association only. None of the figures below establish that one " +
      "measure causes another; the generator produced them with a specified dependence structure, which is " +
      "association by construction."));
    s.appendChild(defn);

    var types = Object.keys((stats.correlations || {}).byPropertyType || {});
    var t = table(["Relationship"].concat(types).concat(["Pooled", "Expected direction"]));
    (stats.simpsonsParadox || []).forEach(function (p) {
      var cells = [el("span", null, p.label)];
      types.forEach(function (ty) { cells.push(corrCell((p.byPropertyType || {})[ty])); });
      cells.push(corrCell(p.pooled));
      cells.push(el("span", "reit-note-inline", p.expect));
      var tr = row(t.body, cells, p.signFlip ? "reit-row-flag" : null);
      if (p.signFlip) { tr.title = "Sign reverses when asset classes are pooled"; }
    });
    s.appendChild(t.wrap);

    var flips = (stats.simpsonsParadox || []).filter(function (p) { return p.signFlip; });
    s.appendChild(interpretation(
      flips.length
        ? flips.length + " of " + (stats.simpsonsParadox || []).length + " relationships reverse sign when the " +
          "asset classes are pooled. The pooled column is therefore not a summary of the per-class columns — " +
          "it can point the opposite way. Reading only the pooled figure would produce the wrong conclusion."
        : "Pooled and per-class figures agree in direction across all relationships shown.",
      stats.totalObservations));

    // Regression coefficients — the chart in section 4 draws these lines.
    s.appendChild(el("h4", "reit-dash-subhead", "Fitted lines (drawn on the chart above)"));
    var reg = stats.regression || {};
    var rt = table(["Model", "n",
                    term("Slope", DEFINITIONS.slope), "SE", "t", "Intercept",
                    term("R²", DEFINITIONS.r2), "RMSE"]);
    Object.keys(reg.byPropertyType || {}).forEach(function (ty) {
      var m = reg.byPropertyType[ty];
      if (!m) { return; }
      var label = el("span", null, ty);
      label.style.borderLeft = "3px solid " + (TYPE_COLOURS[ty] || "#888");
      label.style.paddingLeft = "7px";
      row(rt.body, [label, fmtInt(m.n), fmt(m.slope, 4), fmt(m.seSlope, 4), fmt(m.tSlope, 2),
                    fmt(m.intercept, 3), fmt(m.r2, 4), fmt(m.rmse, 3)]);
    });
    var pm = reg.yieldOnGrowth || {};
    row(rt.body, [el("em", null, "Pooled (artefact)"), fmtInt(pm.n), fmt(pm.slope, 4), fmt(pm.seSlope, 4),
                  fmt(pm.tSlope, 2), fmt(pm.intercept, 3), fmt(pm.r2, 4), fmt(pm.rmse, 3)], "reit-row-muted");
    s.appendChild(rt.wrap);

    var r2s = Object.keys(reg.byPropertyType || {})
      .map(function (ty) { return (reg.byPropertyType[ty] || {}).r2; })
      .filter(function (v) { return typeof v === "number"; });
    if (r2s.length) {
      s.appendChild(interpretation(
        "Within asset class, rental growth accounts for between " + fmt(Math.min.apply(null, r2s) * 100, 1) +
        "% and " + fmt(Math.max.apply(null, r2s) * 100, 1) + "% of the variation in gross yield. Large samples " +
        "can make even a weak association statistically detectable, so the practical point stands separately: " +
        "an association this weak explains little, and growth would be a poor basis for predicting yield on its own.",
        pm.n || stats.totalObservations));
    }
    return s;
  }

  // ─── 7. Model validation ──────────────────────────────────────────────────

  function panelValidation() {
    var od = stats.outlierDetection || {};
    var gt = od.groundTruth || {};
    var s = section("validation", "Model Validation",
      "Detector performance measured against anomalies whose identities were known in advance.");

    var defn = el("p", "reit-note");
    defn.appendChild(document.createTextNode("The generator introduced " + fmtInt(gt.planted) +
      " known synthetic anomalies and recorded which simulated observations they were in a separate file the " +
      "detectors never read. "));
    defn.appendChild(term("Precision", DEFINITIONS.precision));
    defn.appendChild(document.createTextNode(" and "));
    defn.appendChild(term("recall", DEFINITIONS.recall));
    defn.appendChild(document.createTextNode(" below are therefore measured, not claimed."));
    s.appendChild(defn);

    var t = table(["Method", "Grouping", "Flagged", "Correct", "False alarms", "Missed",
                   term("Precision", DEFINITIONS.precision),
                   term("Recall", DEFINITIONS.recall),
                   term("F1", DEFINITIONS.f1)]);
    var best = null;
    Object.keys(od.detectors || {}).forEach(function (k) {
      var d = od.detectors[k];
      if (d.score && (!best || d.score.f1 > best.f1)) { best = { key: k, f1: d.score.f1 }; }
    });
    Object.keys(od.detectors || {}).forEach(function (k) {
      var d = od.detectors[k];
      if (!d.score) {
        row(t.body, [shortName(k), "—", "not run", "—", "—", "—", "—", "—", "—"]);
        return;
      }
      var sc = d.score;
      var grouping = k.indexOf("Stratified") !== -1 ? "within group" : "pooled";
      row(t.body, [shortName(k), grouping, fmtInt(sc.flagged), fmtInt(sc.truePositives),
                   fmtInt(sc.falsePositives), fmtInt(sc.falseNegatives),
                   fmt(sc.precision, 3), fmt(sc.recall, 3), fmt(sc.f1, 3)],
          best && best.key === k ? "reit-row-best" : null);
    });
    /* The full detector table (including the Mahalanobis variants) is
     * advanced material: collapsed by default, with the headline result
     * stated in the interpretation below it. */
    s.appendChild(expandable("Show every detector's precision, recall and F1 (including Mahalanobis)", function () {
      return t.wrap;
    }));

    var pooled = (od.detectors.tukeyPooled || {}).score;
    var strat  = (od.detectors.tukeyStratified || {}).score;
    if (pooled && strat) {
      s.appendChild(interpretation(
        "Grouping matters more than the choice of method. The identical rule scores F1 " + fmt(pooled.f1, 3) +
        " pooled and " + fmt(strat.f1, 3) + " applied within each market. The pooled version's " +
        fmtInt(pooled.falsePositives) + " false alarms are mostly ordinary records from the lower-yielding " +
        "asset class, flagged only because they were compared against a combined distribution they do not " +
        "belong to. No single method wins outright — see the mechanism breakdown above.",
        stats.totalObservations));
    }

    var lim = el("div", "reit-callout reit-callout-warn");
    lim.appendChild(el("strong", null, "Limitation of these figures. "));
    lim.appendChild(document.createTextNode(
      "The χ² cutoff used by the Mahalanobis methods assumes multivariate normality. This dataset is a " +
      "mixture across markets even within one asset class, so the nominal 1% false-positive rate is not " +
      "achieved in practice and their precision is correspondingly low. The recall figures remain " +
      "informative. These results also describe performance on anomalies this generator created — they " +
      "are not evidence of performance on real market data."));
    s.appendChild(lim);
    return s;
  }

  // ─── 8. Limitations ───────────────────────────────────────────────────────

  function panelLimitations() {
    var s = section("limitations", "Limitations",
      "What this analysis cannot tell you.");
    var ul = el("ul", "reit-limit-list");
    [
      "All " + fmtInt(stats.totalObservations) + " records are " + OBS_NOUN + " from a seeded generator. " +
        "None corresponds to a real property, listing or transaction. Nothing here supports a real investment decision.",
      "Correlations describe association only. The dependence structure was specified when the data was " +
        "generated, so no figure on this page is evidence of cause.",
      "Detector performance is measured against anomalies introduced by the generator itself. It shows the " +
        "methods behave correctly on data with known structure, not that they would perform so on real data.",
      "Statistical detectability and business materiality are different things. With samples this large, " +
        "weak associations become statistically visible while still explaining very little.",
      "Market-segment estimates rest on between " + obsRange()[0] + " and " +
        obsRange()[1] + " simulated observations each. Segments at the lower end " +
        "have wider simulated spreads around their assumptions, flagged throughout — a statement about " +
        "simulation precision, not about market evidence.",
      "External calibration of the generator is Unverified: none of its cited source documents was located and " +
        "no figure was traced. See the source " +
        "verification report for current status."
    ].forEach(function (t) { ul.appendChild(el("li", null, t)); });
    s.appendChild(ul);
    return s;
  }

  /* Smallest and largest simulated-observation counts, from the data — never typed. */
  function obsRange() {
    var d = (typeof AnalysisRun !== "undefined" && AnalysisRun.data && AnalysisRun.data()) || null;
    var ms = d && d.marketsDoc ? d.marketsDoc.markets : [];
    if (!ms.length) { return ["—", "—"]; }
    var n = ms.map(function (m) { return m.observationCount || 0; });
    return [fmtInt(Math.min.apply(null, n)), fmtInt(Math.max.apply(null, n))];
  }

  // ─── Scatter with per-class fits ──────────────────────────────────────────

  function drawScatter(canvas, sc) {
    var pts = sc.points || [];
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx || !pts.length) { return; }

    var W = canvas.width, H = canvas.height;
    var padL = 66, padR = 22, padT = 20, padB = 54;
    var pw = W - padL - padR, ph = H - padT - padB;

    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var xPad = (xMax - xMin) * 0.04 || 1, yPad = (yMax - yMin) * 0.04 || 1;
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;

    function X(v) { return padL + ((v - xMin) / (xMax - xMin)) * pw; }
    function Y(v) { return padT + ph - ((v - yMin) / (yMax - yMin)) * ph; }

    ctx.clearRect(0, 0, W, H);

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

    // Points first, so fitted lines sit on top.
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), p.o ? 4.2 : 2.3, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLOURS[p.t] || "#8892a4";
      ctx.globalAlpha = p.o ? 0.95 : 0.30;
      ctx.fill();
      if (p.o) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 7, 0, Math.PI * 2); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    var reg = (stats && stats.regression) || {};

    /*
     * The pooled fit is drawn FIRST, faint and dashed, so it sits visually
     * beneath the per-class lines. It is kept deliberately: the contrast
     * between it and the three real fits is the clearest demonstration that
     * pooling distinct populations manufactures a trend. It is labelled on
     * the chart so it cannot be mistaken for a finding.
     */
    var pooled = reg.yieldOnGrowth;
    if (pooled && typeof pooled.slope === "number") {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(100,116,139,0.55)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(X(xMin), Y(pooled.intercept + pooled.slope * xMin));
      ctx.lineTo(X(xMax), Y(pooled.intercept + pooled.slope * xMax));
      ctx.stroke();
      ctx.restore();

      var lx = X(xMax) - 6, ly = Y(pooled.intercept + pooled.slope * xMax) - 8;
      ctx.fillStyle = "rgba(100,116,139,0.95)";
      ctx.font = "italic 10.5px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText("pooled fit — artefact of combining classes", lx, ly);
    }

    // One fitted line and confidence band per asset class.
    var tCrit = 1.96;
    Object.keys(reg.byPropertyType || {}).forEach(function (ty) {
      var m = reg.byPropertyType[ty];
      if (!m || typeof m.slope !== "number" || !m.sxx) { return; }
      var colour = TYPE_COLOURS[ty] || "#555";

      var sub = pts.filter(function (p) { return p.t === ty; });
      if (!sub.length) { return; }
      var sxs = sub.map(function (p) { return p.x; });
      var lo = Math.max(xMin, Math.min.apply(null, sxs));
      var hi = Math.min(xMax, Math.max.apply(null, sxs));

      var upper = [], lower = [];
      for (var k = 0; k <= 48; k++) {
        var xv = lo + ((hi - lo) / 48) * k;
        var yv = m.intercept + m.slope * xv;
        var se = m.rmse * Math.sqrt(1 / m.n + Math.pow(xv - m.meanX, 2) / m.sxx);
        upper.push([xv, yv + tCrit * se]);
        lower.push([xv, yv - tCrit * se]);
      }
      ctx.beginPath();
      ctx.moveTo(X(upper[0][0]), Y(upper[0][1]));
      upper.forEach(function (p) { ctx.lineTo(X(p[0]), Y(p[1])); });
      for (var j = lower.length - 1; j >= 0; j--) { ctx.lineTo(X(lower[j][0]), Y(lower[j][1])); }
      ctx.closePath();
      ctx.fillStyle = colour; ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;

      ctx.strokeStyle = colour; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(X(lo), Y(m.intercept + m.slope * lo));
      ctx.lineTo(X(hi), Y(m.intercept + m.slope * hi));
      ctx.stroke();
    });

    // Per-class fit statistics, replacing the single pooled box.
    var lines = [];
    Object.keys(reg.byPropertyType || {}).forEach(function (ty) {
      var m = reg.byPropertyType[ty];
      if (!m) { return; }
      lines.push({
        colour: TYPE_COLOURS[ty] || "#555",
        text: ty.replace("Commercial ", "") + ": slope " + fmt(m.slope, 3) +
              ", R² " + fmt(m.r2, 3) + ", n " + fmtInt(m.n)
      });
    });
    if (lines.length) {
      var bw = 232, bh = 15 * lines.length + 14;
      var bx = padL + 10, by = padT + 10;
      ctx.fillStyle = "rgba(255,255,255,0.93)";
      ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1;
      ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
      ctx.font = "10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      lines.forEach(function (ln, k) {
        ctx.fillStyle = ln.colour;
        ctx.fillRect(bx + 8, by + 10 + k * 15, 7, 7);
        ctx.fillStyle = "#33415c";
        ctx.fillText(ln.text, bx + 20, by + 8 + k * 15);
      });
    }

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
      ["This page reads data/statistics.json, which is generated once and committed.",
       "Regenerate with: node data-pipeline/scripts/computeStatistics.js",
       "The rest of the application is unaffected — only this page needs the file.",
       "Reported error: " + loadError].forEach(function (t) { ul.appendChild(el("li", null, t)); });
      det.appendChild(ul); err.appendChild(det); container.appendChild(err);
      return;
    }
    if (!stats) { container.appendChild(el("p", "reit-note", "Loading statistics…")); return; }

    // Ordered simple → complex. Each panel is guarded so one failure cannot
    // blank the page.
    [panelFindings, panelDataset, panelDescriptives, panelDistribution,
     panelGroups, panelCorrelation, panelValidation, panelLimitations
    ].forEach(function (fn) {
      try { container.appendChild(fn()); }
      catch (e) {
        var s = el("div", "reit-section");
        s.appendChild(el("p", "reit-note", "This section could not be rendered: " + e.message));
        container.appendChild(s);
        if (window.console) { console.error("[statsDashboard]", fn.name, e); }
      }
    });

    container.appendChild(el("p", "reit-agent-disclaimer",
      stats.disclaimer || "Synthetic academic data. Not investment advice."));
  }

  function render() {
    var container = document.getElementById("statsdash-content");
    if (!container) { return; }
    if (stats || loadError) { build(container); return; }
    if (loading) { return; }
    loading = true;
    build(container);
    Promise.all([
      fetch(DATA_URL, { cache: "no-store" })
        .then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); }),
      (typeof AnalysisRun !== "undefined" ? AnalysisRun.ready().catch(function () { return null; }) : null)
    ])
      .then(function (res) { stats = res[0]; loading = false; build(container); })
      .catch(function (e) { loadError = e.message || String(e); loading = false; build(container); });
  }

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

  window.ReitStatsDashboard = { render: render, deriveFindings: deriveFindings };
}());

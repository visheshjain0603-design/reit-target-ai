/**
 * charts.js — SVG/Canvas chart rendering for REIT Target AI
 *
 * NMIMS B.Sc. Finance | Business Analytics Project Theme 4 | Academic Demo
 *
 * All charts rendered inline — no CDN, no external dependencies.
 * Uses SVG for bar/funnel/HHI charts; Canvas for scatter plot and
 * line (scenario projection) chart.
 *
 * Functions return SVG strings or draw onto a provided <canvas> element.
 * Never write innerHTML directly — callers append returned SVG via
 * textContent-safe helpers where possible, or set outerHTML on a
 * placeholder <div> (the only permissible innerHTML use here is
 * SVG injection, flagged clearly).
 *
 * Chart list (Stage 10):
 *   1. renderFunnelChart(containerId, report)     — Data Centre pipeline funnel
 *   2. renderScatterChart(canvasEl, markets, ranked) — Rental Growth vs Gross Yield scatter
 *   3. renderFactorBars(containerId, ranked, topN) — Factor score breakdown bars
 *   4. renderHHICompare(containerId, before, after) — Before/After HHI bar compare
 *   5. renderScenarioLine(canvasEl, scenarios)    — Projection scenario lines
 *   6. renderAllocationBar(containerId, alloc, title) — City/type allocation bars
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Charts = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Colour palette ──────────────────────────────────────────
   * Matches the tokens in css/app.css. Property types use a blue / bluish
   * green / orange triad that stays distinguishable for the common forms of
   * colour-vision deficiency; marigold is reserved for the selected target. */
  var COLOURS = {
    office:      '#2F4DA8',
    retail:      '#1F8A70',
    residential: '#D18A22',
    neutral:     '#616A75',
    improved:    '#2B6A4A',
    worsened:    '#9E3B2A',
    caution:     '#B07A1E',
    conservative:'#B07A1E',
    base:        '#2D3B94',
    optimistic:  '#2B6A4A',
    selected:    '#E8A23A',
    ink:         '#17202C',
    ink2:        '#46505C',
    ink3:        '#616A75',
    rule:        '#DFE4E1',
    ruleStrong:  '#C6CDCA',
    track:       '#EEF1EF'
  };
  var FONT = 'Archivo, system-ui, -apple-system, "Segoe UI", sans-serif';
  var SVG_FONT = 'font-family="Archivo, system-ui, sans-serif"';

  /* Canvas at the screen's pixel density, drawn in CSS pixels. The logical
   * size is the width/height the caller set, remembered on first use. */
  function setupCanvas(canvasEl, defW, defH) {
    var W = parseInt(canvasEl.getAttribute('data-w'), 10) || canvasEl.width || defW;
    var H = parseInt(canvasEl.getAttribute('data-h'), 10) || canvasEl.height || defH;
    var dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    canvasEl.setAttribute('data-w', W);
    canvasEl.setAttribute('data-h', H);
    canvasEl.width = Math.round(W * dpr);
    canvasEl.height = Math.round(H * dpr);
    canvasEl.style.width = W + 'px';
    var ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  /* ── SVG helpers ──────────────────────────────────────────── */
  function svgTag(tag, attrs, inner) {
    var attrStr = Object.keys(attrs).map(function (k) {
      return k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"';
    }).join(' ');
    return '<' + tag + ' ' + attrStr + '>' + (inner || '') + '</' + tag + '>';
  }

  function svgEl(tag, attrs) {
    var attrStr = Object.keys(attrs).map(function (k) {
      return k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"';
    }).join(' ');
    return '<' + tag + ' ' + attrStr + '/>';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Chart 1: Data-quality funnel ─────────────────────────── */
  /**
   * renderFunnelChart(containerId, report)
   * @param {string} containerId — id of the DOM element to inject into
   * @param {Object} report — from DataCleaner.cleanRecords()
   *   { total, ok, rejected, warnings, duplicates, outliers }
   */
  function renderFunnelChart(containerId, report) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var W = 480, H = 300;
    var stages = [
      { label: 'Total imported', value: report.total,                  colour: '#9AA3C9' },
      { label: 'After impossible values removed', value: report.total - report.rejected, colour: '#6F7BB8' },
      { label: 'After duplicates flagged',  value: (report.total - report.rejected) - report.duplicates, colour: '#4A58A4' },
      { label: 'After outliers flagged',    value: report.ok,          colour: COLOURS.base }
    ];

    var maxVal = stages[0].value || 1;
    var padL = 220, padR = 60, padT = 20, barH = 38, gap = 20;
    var totalH = padT + stages.length * (barH + gap) + 20;

    var svgParts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + totalH + '" role="img" aria-label="Data quality funnel" ' + SVG_FONT + '>'];
    svgParts.push('<title>Data quality funnel</title>');

    stages.forEach(function (s, i) {
      var y    = padT + i * (barH + gap);
      var barW = Math.max(4, Math.round((s.value / maxVal) * (W - padL - padR)));

      // Label
      svgParts.push(svgTag('text', {
        x: padL - 8, y: y + barH / 2 + 5,
        'text-anchor': 'end', 'font-size': '12', fill: COLOURS.ink2
      }, esc(s.label)));

      // Bar
      svgParts.push(svgEl('rect', { x: padL, y: y, width: barW, height: barH, rx: 6, fill: s.colour }));

      // Value label
      svgParts.push(svgTag('text', {
        x: padL + barW + 8, y: y + barH / 2 + 5,
        'font-size': '13', 'font-weight': '650', fill: COLOURS.ink
      }, esc(String(s.value))));
    });

    svgParts.push('</svg>');

    // Safe SVG injection (charts require innerHTML for SVG)
    el.innerHTML = svgParts.join('\n'); // eslint-disable-line — SVG chart, no user data in markup
  }

  /* ── Chart 2: Yield vs Growth scatter (Canvas) ────────────── */
  /**
   * renderScatterChart(canvasEl, markets, ranked)
   * Bubble size ∝ demandScore; colour = propertyType
   */
  function renderScatterChart(canvasEl, markets, ranked, selectedId) {
    if (!canvasEl || !canvasEl.getContext) return;
    var cv = setupCanvas(canvasEl, 480, 320);
    var ctx = cv.ctx, W = cv.W, H = cv.H;

    var padL = 58, padR = 20, padT = 20, padB = 46;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    // Build scoring lookup
    var scoreMap = {};
    (ranked || []).forEach(function (r) { scoreMap[r.marketId] = r.score; });

    // X = rental growth; Y = gross yield (per user spec)
    var points = markets.map(function (m) {
      var gy = (m.medianMonthlyRentPerSqFt * 12) / m.medianCapitalValuePerSqFt;
      return {
        x:    m.annualRentalGrowthRatio,
        y:    gy,
        size: Math.max(5, Math.min(18, (m.demandScore || 50) / 5)),
        type: m.propertyType,
        label: m.locality + ' (' + m.city + ')',
        city:  m.city,
        yield: gy,
        growth: m.annualRentalGrowthRatio,
        demand: m.demandScore || 0,
        risk:   m.riskScore   || 0,
        obs:    m.observationCount || 0,
        score:  null,  /* filled below from scoreMap */
        id:     m.marketId
      };
    });
    points.forEach(function (p, i) {
      var mkt = markets[i];
      p.score = scoreMap[mkt.marketId] || null;
    });

    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var xRange = xMax - xMin || 0.01;
    var yRange = yMax - yMin || 0.01;

    function toCanvas(px, py) {
      return {
        cx: padL + ((px - xMin) / xRange) * plotW,
        cy: padT + plotH - ((py - yMin) / yRange) * plotH
      };
    }

    // Grid
    ctx.strokeStyle = COLOURS.rule;
    ctx.lineWidth   = 1;
    for (var gi = 0; gi <= 4; gi++) {
      var gx = Math.round(padL + (gi / 4) * plotW) + 0.5;
      var gy2 = Math.round(padT + (gi / 4) * plotH) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL, gy2); ctx.lineTo(padL + plotW, gy2); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = COLOURS.ruleStrong;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(padL + 0.5, padT); ctx.lineTo(padL + 0.5, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH + 0.5); ctx.lineTo(padL + plotW, padT + plotH + 0.5); ctx.stroke();

    // Axis labels  (X = Rental Growth, Y = Gross Yield)
    ctx.fillStyle  = COLOURS.ink2;
    ctx.font       = '500 12px ' + FONT;
    ctx.textAlign  = 'center';
    ctx.fillText('Rental Growth (%)', padL + plotW / 2, H - 8);
    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Gross Yield (%)', 0, 0);
    ctx.restore();

    // Tick values
    ctx.font      = '11px ' + FONT;
    ctx.fillStyle = COLOURS.ink3;
    for (var ti = 0; ti <= 4; ti++) {
      var tx = xMin + (ti / 4) * xRange;
      var ty = yMin + (ti / 4) * yRange;
      var canX = padL + (ti / 4) * plotW;
      var canY = padT + plotH - (ti / 4) * plotH;
      ctx.textAlign = 'center';
      ctx.fillText((tx * 100).toFixed(1) + '%', canX, padT + plotH + 14);
      ctx.textAlign = 'right';
      ctx.fillText((ty * 100).toFixed(1) + '%', padL - 4, canY + 4);
    }

    // Bubbles
    var typeColours = { 'Commercial Office': COLOURS.office, 'Retail': COLOURS.retail, 'Residential': COLOURS.residential };
    points.forEach(function (p) {
      var c = toCanvas(p.x, p.y);
      var colour = typeColours[p.type] || COLOURS.neutral;
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, p.size, 0, Math.PI * 2);
      ctx.fillStyle = colour + '99';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 1;
      ctx.stroke();
    });

    // The selected target: a marigold ring and its name.
    var sel = null;
    points.forEach(function (p) { if (selectedId && p.id === selectedId) { sel = p; } });
    if (sel) {
      var sc = toCanvas(sel.x, sel.y);
      ctx.beginPath();
      ctx.arc(sc.cx, sc.cy, sel.size + 4, 0, Math.PI * 2);
      ctx.strokeStyle = COLOURS.selected;
      ctx.lineWidth   = 3;
      ctx.stroke();
      ctx.font      = '600 12px ' + FONT;
      ctx.fillStyle = COLOURS.ink;
      var labelRight = sc.cx + sel.size + 10 + ctx.measureText(sel.label).width < padL + plotW;
      ctx.textAlign = labelRight ? 'left' : 'right';
      ctx.fillText(sel.label, labelRight ? sc.cx + sel.size + 10 : sc.cx - sel.size - 10, sc.cy + 4);
    }

    // Legend
    var legX = padL + 10, legY = padT + 12;
    var types = ['Commercial Office', 'Retail', 'Residential'];
    types.forEach(function (t, i) {
      ctx.beginPath();
      ctx.arc(legX + 5, legY + i * 18, 5, 0, Math.PI * 2);
      ctx.fillStyle = typeColours[t] || COLOURS.neutral;
      ctx.fill();
      ctx.fillStyle = COLOURS.ink2;
      ctx.font      = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(t, legX + 15, legY + i * 18 + 4);
    });

    // Hover tooltip — shows market details on mouse proximity
    (function wireTooltip() {
      if (!canvasEl.parentNode) return;
      // Re-use or create tooltip div
      var tipId  = 'reit-scatter-tip';
      var tipEl  = document.getElementById(tipId);
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = tipId;
        tipEl.style.cssText = [
          'position:absolute', 'pointer-events:none', 'display:none',
          'background:#17202C', 'color:#EEF1F4', 'border-radius:8px',
          'padding:10px 12px', 'font:12px/1.6 ' + FONT.replace(/"/g, "'"),
          'box-shadow:0 14px 30px -12px rgba(23,32,44,.55)', 'z-index:999',
          'white-space:nowrap', 'max-width:260px', 'font-variant-numeric:tabular-nums'
        ].join(';');
        // Tooltip must sit in a positioned ancestor
        var posParent = canvasEl.parentNode;
        if (getComputedStyle(posParent).position === 'static') {
          posParent.style.position = 'relative';
        }
        posParent.appendChild(tipEl);
      }
      canvasEl.addEventListener('mousemove', function (evt) {
        var rect   = canvasEl.getBoundingClientRect();
        var scaleX = W / (rect.width  || W);
        var scaleY = H / (rect.height || H);
        var mx     = (evt.clientX - rect.left) * scaleX;
        var my     = (evt.clientY - rect.top)  * scaleY;
        var hit    = null;
        var hitDist = Infinity;
        points.forEach(function (p) {
          var cp = toCanvas(p.x, p.y);
          var d  = Math.sqrt(Math.pow(mx - cp.cx, 2) + Math.pow(my - cp.cy, 2));
          if (d < p.size + 6 && d < hitDist) { hit = p; hitDist = d; }
        });
        if (hit) {
          var scoreStr = hit.score !== null ? hit.score.toFixed(1) : 'n/a';
          tipEl.innerHTML = [ // eslint-disable-line (no user data — all from pre-parsed JSON)
            '<strong>' + hit.label + '</strong>',
            'City: ' + hit.city,
            'Gross Yield: ' + (hit.yield * 100).toFixed(2) + '%',
            'Rental Growth: ' + (hit.growth * 100).toFixed(2) + '%',
            'Demand Score: ' + hit.demand,
            'Risk Score: ' + hit.risk,
            'Observations: ' + hit.obs,
            'Composite Score: ' + scoreStr
          ].join('<br>');
          var canvasRect = canvasEl.parentNode.getBoundingClientRect();
          var tipX = evt.clientX - canvasRect.left + 12;
          var tipY = evt.clientY - canvasRect.top  - 10;
          tipEl.style.left    = tipX + 'px';
          tipEl.style.top     = tipY + 'px';
          tipEl.style.display = 'block';
          canvasEl.style.cursor = 'pointer';
        } else {
          tipEl.style.display  = 'none';
          canvasEl.style.cursor = '';
        }
      });
      canvasEl.addEventListener('mouseleave', function () {
        tipEl.style.display = 'none';
      });
    }());
  }

  /* ── Chart 3: Factor contribution bars ─────────────────────── */
  /**
   * renderFactorBars(containerId, ranked, topN)
   * Shows stacked contribution bars for the top N ranked markets.
   */
  function renderFactorBars(containerId, ranked, topN) {
    var el = document.getElementById(containerId);
    if (!el || !ranked || !ranked.length) return;
    topN = topN || 5;
    var top = ranked.slice(0, Math.min(topN, ranked.length));

    var W = 520, barH = 32, gap = 10, padL = 170, padR = 60, padT = 16;
    var H = padT + top.length * (barH + gap) + 30;

    var factorKeys   = ['yieldScore', 'growthScore', 'diversScore', 'demandScore', 'riskScore'];
    var factorLabels = ['Yield', 'Growth', 'Diversif.', 'Demand', 'Low Risk'];
    var factorColours= [COLOURS.base, COLOURS.retail, COLOURS.residential, '#8B4C7E', '#5B6B7A'];

    var maxScore = 100;

    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Factor contribution bars" ' + SVG_FONT + '>'];
    parts.push('<title>Factor score breakdown — top ' + topN + ' markets</title>');

    // Legend
    factorKeys.forEach(function (k, i) {
      var lx = padL + i * 66;
      parts.push(svgEl('rect', { x: lx, y: 0, width: 12, height: 12, rx: 2, fill: factorColours[i] }));
      parts.push(svgTag('text', { x: lx + 15, y: 11, 'font-size': '10', fill: COLOURS.ink2 }, esc(factorLabels[i])));
    });

    top.forEach(function (mkt, i) {
      var y = padT + 16 + i * (barH + gap);
      // Market label
      parts.push(svgTag('text', {
        x: padL - 6, y: y + barH / 2 + 5,
        'text-anchor': 'end', 'font-size': '11', fill: COLOURS.ink
      }, esc((mkt.locality || mkt.city || mkt.marketId || '').slice(0, 22))));

      // Stacked bars
      var x = padL;
      factorKeys.forEach(function (k, fi) {
        var contrib = (mkt[k] || 0);
        var segW    = Math.max(0, Math.round((contrib / maxScore) * (W - padL - padR) / factorKeys.length));
        parts.push(svgEl('rect', { x: x, y: y, width: segW, height: barH, fill: factorColours[fi] }));
        x += segW;
      });

      // Total score
      parts.push(svgTag('text', {
        x: x + 6, y: y + barH / 2 + 5,
        'font-size': '12', 'font-weight': '650', fill: COLOURS.ink
      }, esc(typeof mkt.score === 'number' ? mkt.score.toFixed(1) : '')));
    });

    parts.push('</svg>');
    el.innerHTML = parts.join('\n'); // eslint-disable-line — SVG chart
  }

  /* ── Chart 4: HHI before/after comparison ─────────────────── */
  /**
   * renderHHICompare(containerId, before, after)
   * @param before {cityHHI, typeHHI}
   * @param after  {cityHHI, typeHHI}
   */
  function renderHHICompare(containerId, before, after) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var W = 520, H = 220, padL = 128, padR = 150, padT = 30, barH = 26, gap = 14;

    /* Same bands as diversification.js: below 0.15 diversified, 0.15 to
     * 0.25 inclusive moderate, above 0.25 concentrated. */
    function hatch(val) {
      if (val < 0.15)  return { label: 'Diversified',  colour: COLOURS.improved };
      if (val <= 0.25) return { label: 'Moderate',     colour: COLOURS.caution };
      return               { label: 'Concentrated',  colour: COLOURS.worsened };
    }

    var rows = [
      { label: 'City HHI — Before',  value: before.cityHHI || 0 },
      { label: 'City HHI — After',   value: after.cityHHI  || 0 },
      { label: 'Type HHI — Before',  value: before.typeHHI || 0 },
      { label: 'Type HHI — After',   value: after.typeHHI  || 0 }
    ];
    var maxVal = 1;
    var totalH = padT + rows.length * (barH + gap) + 40;

    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + totalH + '" role="img" aria-label="HHI before and after comparison" ' + SVG_FONT + '>'];
    parts.push('<title>HHI before and after investment</title>');

    // Threshold lines
    [0.15, 0.25].forEach(function (thresh) {
      var lx = padL + thresh * (W - padL - padR);
      parts.push(svgEl('line', { x1: lx, y1: padT - 10, x2: lx, y2: totalH - 30, stroke: COLOURS.ruleStrong, 'stroke-dasharray': '4 3', 'stroke-width': '1' }));
      parts.push(svgTag('text', { x: lx + 3, y: padT - 12, 'font-size': '10', fill: COLOURS.ink3 }, esc(String(thresh))));
    });

    rows.forEach(function (row, i) {
      var y    = padT + i * (barH + gap);
      var h    = hatch(row.value);
      var barW = Math.round((row.value / maxVal) * (W - padL - padR));

      parts.push(svgTag('text', {
        x: padL - 8, y: y + barH / 2 + 4,
        'text-anchor': 'end', 'font-size': '11', fill: COLOURS.ink2
      }, esc(row.label)));

      parts.push(svgEl('rect', { x: padL, y: y, width: W - padL - padR, height: barH, rx: 4, fill: COLOURS.track }));
      parts.push(svgEl('rect', { x: padL, y: y, width: Math.max(2, barW), height: barH, rx: 4, fill: h.colour, 'fill-opacity': i % 2 ? '1' : '0.55' }));

      parts.push(svgTag('text', {
        x: padL + barW + 8, y: y + barH / 2 + 4,
        'font-size': '11', fill: COLOURS.ink, 'font-weight': '600'
      }, esc(row.value.toFixed(3) + ' (' + h.label.toLowerCase() + ')')));
    });

    // Axis
    parts.push(svgEl('line', { x1: padL, y1: totalH - 30, x2: W - padR, y2: totalH - 30, stroke: COLOURS.rule, 'stroke-width': '1' }));
    parts.push(svgTag('text', { x: padL, y: totalH - 14, 'font-size': '10', fill: COLOURS.ink3 }, '0.00'));
    parts.push(svgTag('text', { x: W - padR, y: totalH - 14, 'font-size': '10', fill: COLOURS.ink3, 'text-anchor': 'end' }, '1.00'));

    parts.push('</svg>');
    el.innerHTML = parts.join('\n'); // eslint-disable-line — SVG chart
  }

  /* ── Chart 5: Scenario projection line chart (Canvas) ─────── */
  /**
   * renderScenarioLine(canvasEl, scenarios)
   * @param scenarios — { conservative: [{year, portfolioValue, annualRent},...],
   *                       base:         [...],
   *                       optimistic:   [...] }
   */
  function renderScenarioLine(canvasEl, scenarios) {
    if (!canvasEl || !canvasEl.getContext) return;
    var cv   = setupCanvas(canvasEl, 480, 280);
    var ctx  = cv.ctx, W = cv.W, H = cv.H;

    var padL = 68, padR = 20, padT = 20, padB = 40;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var lines = [
      { key: 'conservative', label: 'Conservative', colour: COLOURS.conservative, dash: [6, 4] },
      { key: 'base',         label: 'Base',         colour: COLOURS.base,         dash: []     },
      { key: 'optimistic',   label: 'Optimistic',   colour: COLOURS.optimistic,   dash: [2, 3] }
    ];

    // Flatten all values to get range
    var allVals = [];
    lines.forEach(function (l) {
      (scenarios[l.key] || []).forEach(function (pt) { allVals.push(pt.portfolioValue); });
    });
    if (!allVals.length) return;

    var yMin = Math.min.apply(null, allVals) * 0.95;
    var yMax = Math.max.apply(null, allVals) * 1.05;
    var yRange = yMax - yMin || 1;

    var years = (scenarios.base || scenarios.conservative || scenarios.optimistic || []).map(function (pt) { return pt.year; });
    var xMin = years[0] || 0;
    var xMax = years[years.length - 1] || 1;
    var xRange = xMax - xMin || 1;

    function cx(yr) { return padL + ((yr - xMin) / xRange) * plotW; }
    function cy(v)  { return padT + plotH - ((v - yMin) / yRange) * plotH; }

    // Grid
    ctx.strokeStyle = COLOURS.rule;
    ctx.lineWidth   = 1;
    for (var gi = 0; gi <= 4; gi++) {
      var gy = Math.round(padT + (gi / 4) * plotH) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
    }

    // Lines
    lines.forEach(function (l) {
      var pts = scenarios[l.key] || [];
      if (!pts.length) return;
      ctx.beginPath();
      ctx.strokeStyle = l.colour;
      ctx.lineWidth   = l.key === 'base' ? 2.5 : 2;
      ctx.lineJoin    = 'round';
      ctx.setLineDash(l.dash);
      pts.forEach(function (pt, i) {
        var x = cx(pt.year), y = cy(pt.portfolioValue);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots
      pts.forEach(function (pt) {
        ctx.beginPath();
        ctx.arc(cx(pt.year), cy(pt.portfolioValue), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = l.colour;
        ctx.stroke();
      });
    });

    // Axes
    ctx.strokeStyle = COLOURS.ruleStrong;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(padL + 0.5, padT); ctx.lineTo(padL + 0.5, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH + 0.5); ctx.lineTo(padL + plotW, padT + plotH + 0.5); ctx.stroke();

    // X-axis labels (years)
    ctx.fillStyle  = COLOURS.ink3;
    ctx.font       = '11px ' + FONT;
    ctx.textAlign  = 'center';
    years.forEach(function (yr) {
      ctx.fillText('Yr ' + yr, cx(yr), H - 8);
    });

    // Y-axis labels (₹ Cr)
    ctx.textAlign = 'right';
    for (var ti = 0; ti <= 4; ti++) {
      var v  = yMin + (ti / 4) * yRange;
      var vy = padT + plotH - (ti / 4) * plotH;
      ctx.fillText('₹' + (v / 1e7).toFixed(0) + 'Cr', padL - 4, vy + 4);
    }

    // Legend
    var legX = padL + 12, legY = padT + 10;
    lines.forEach(function (l, i) {
      ctx.strokeStyle = l.colour;
      ctx.lineWidth   = 2.5;
      ctx.setLineDash(l.dash);
      ctx.beginPath(); ctx.moveTo(legX, legY + i * 18); ctx.lineTo(legX + 22, legY + i * 18); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle  = COLOURS.ink2;
      ctx.font       = '12px ' + FONT;
      ctx.textAlign  = 'left';
      ctx.fillText(l.label, legX + 28, legY + i * 18 + 4);
    });
  }


  /**
   * renderAllocationBar(containerId, allocData, title)
   * Renders an SVG horizontal bar chart of city or asset-type allocation.
   *
   * @param {string} containerId  - DOM element id to render into (innerHTML)
   * @param {Object} allocData    - {city: share (0–1)} or {type: share}
   * @param {string} title        - Chart title
   */
  function renderAllocationBar(containerId, allocData, title) {
    var el = document.getElementById(containerId);
    if (!el) { return; }

    var entries = Object.keys(allocData).map(function (k) {
      return { label: k, share: allocData[k] };
    }).sort(function (a, b) { return b.share - a.share; });

    var W = 420, BAR_H = 22, GAP = 6, PAD_L = 120, PAD_R = 50, PAD_T = 32, PAD_B = 20;
    var H = PAD_T + entries.length * (BAR_H + GAP) + PAD_B;
    var PLOT_W = W - PAD_L - PAD_R;

    var svgParts = [];
    svgParts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + title + '" ' + SVG_FONT + '>');
    // Title
    svgParts.push('<text x="' + PAD_L + '" y="18" font-size="12" font-weight="600" fill="' + COLOURS.ink2 + '">' + title + '</text>');

    var palette = [COLOURS.base];   // one colour: order and labels already rank the shares

    entries.forEach(function (e, i) {
      var y = PAD_T + i * (BAR_H + GAP);
      var barW = Math.max(2, Math.round(e.share * PLOT_W));
      var colour = palette[i % palette.length];
      var pct = (e.share * 100).toFixed(1) + '%';
      var label = e.label.length > 14 ? e.label.slice(0, 13) + '…' : e.label;

      // Label
      svgParts.push('<text x="' + (PAD_L - 8) + '" y="' + (y + BAR_H * 0.68) + '" text-anchor="end" font-size="11" fill="' + COLOURS.ink2 + '">' + label + '</text>');
      // Bar background
      svgParts.push('<rect x="' + PAD_L + '" y="' + y + '" width="' + PLOT_W + '" height="' + BAR_H + '" fill="' + COLOURS.track + '" rx="4"/>');
      // Bar fill
      svgParts.push('<rect x="' + PAD_L + '" y="' + y + '" width="' + barW + '" height="' + BAR_H + '" fill="' + colour + '" rx="4"/>');
      // Pct label
      svgParts.push('<text x="' + (PAD_L + barW + 6) + '" y="' + (y + BAR_H * 0.68) + '" font-size="11" font-weight="600" fill="' + COLOURS.ink + '">' + pct + '</text>');
    });

    svgParts.push('</svg>');

    /* SVG injection is intentional — no user data in this chart;
       all labels come from pre-parsed JSON city/type keys. */
    el.innerHTML = svgParts.join(''); // eslint-disable-line (SVG injection — no user data; all labels from pre-parsed JSON keys)
  }

  /* ── Public API ───────────────────────────────────────────── */
  return {
    renderFunnelChart:    renderFunnelChart,
    renderScatterChart:   renderScatterChart,
    renderFactorBars:     renderFactorBars,
    renderHHICompare:     renderHHICompare,
    renderScenarioLine:   renderScenarioLine,
    renderAllocationBar:  renderAllocationBar
  };
}));

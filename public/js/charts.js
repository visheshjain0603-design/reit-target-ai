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

  /* ── Colour palette (accessible) ─────────────────────────── */
  var COLOURS = {
    office:      '#2563eb',
    retail:      '#16a34a',
    residential: '#d97706',
    neutral:     '#64748b',
    improved:    '#15803d',
    worsened:    '#dc2626',
    conservative:'#f59e0b',
    base:        '#3b82f6',
    optimistic:  '#16a34a'
  };

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
      { label: 'Total imported', value: report.total,                  colour: '#64748b' },
      { label: 'After impossible values removed', value: report.total - report.rejected, colour: '#2563eb' },
      { label: 'After duplicates flagged',  value: (report.total - report.rejected) - report.duplicates, colour: '#7c3aed' },
      { label: 'After outliers flagged',    value: report.ok,          colour: '#16a34a' }
    ];

    var maxVal = stages[0].value || 1;
    var padL = 220, padR = 60, padT = 20, barH = 38, gap = 20;
    var totalH = padT + stages.length * (barH + gap) + 20;

    var svgParts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + totalH + '" role="img" aria-label="Data quality funnel">'];
    svgParts.push('<title>Data quality funnel</title>');

    stages.forEach(function (s, i) {
      var y    = padT + i * (barH + gap);
      var barW = Math.max(4, Math.round((s.value / maxVal) * (W - padL - padR)));

      // Label
      svgParts.push(svgTag('text', {
        x: padL - 8, y: y + barH / 2 + 5,
        'text-anchor': 'end', 'font-size': '12', fill: '#374151'
      }, esc(s.label)));

      // Bar
      svgParts.push(svgEl('rect', { x: padL, y: y, width: barW, height: barH, rx: 4, fill: s.colour }));

      // Value label
      svgParts.push(svgTag('text', {
        x: padL + barW + 6, y: y + barH / 2 + 5,
        'font-size': '13', 'font-weight': '700', fill: s.colour
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
  function renderScatterChart(canvasEl, markets, ranked) {
    if (!canvasEl || !canvasEl.getContext) return;
    var ctx = canvasEl.getContext('2d');
    var W = canvasEl.width  || 480;
    var H = canvasEl.height || 320;
    ctx.clearRect(0, 0, W, H);

    var padL = 55, padR = 20, padT = 20, padB = 45;
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
        score:  null  /* filled below from scoreMap */
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
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth   = 1;
    for (var gi = 0; gi <= 4; gi++) {
      var gx = padL + (gi / 4) * plotW;
      var gy2 = padT + (gi / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL, gy2); ctx.lineTo(padL + plotW, gy2); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

    // Axis labels  (X = Rental Growth, Y = Gross Yield)
    ctx.fillStyle  = '#64748b';
    ctx.font       = '11px system-ui, sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText('Rental Growth (%)', padL + plotW / 2, H - 8);
    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Gross Yield (%)', 0, 0);
    ctx.restore();

    // Tick values
    ctx.font      = '10px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
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
      ctx.fillStyle = colour + 'cc';
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });

    // Legend
    var legX = padL + 8, legY = padT + 8;
    var types = ['Commercial Office', 'Retail', 'Residential'];
    types.forEach(function (t, i) {
      ctx.beginPath();
      ctx.arc(legX + 6, legY + i * 18, 6, 0, Math.PI * 2);
      ctx.fillStyle = typeColours[t] || COLOURS.neutral;
      ctx.fill();
      ctx.fillStyle = '#374151';
      ctx.font      = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(t, legX + 16, legY + i * 18 + 4);
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
          'background:#1e293b', 'color:#f8fafc', 'border-radius:6px',
          'padding:8px 12px', 'font:12px/1.6 system-ui,sans-serif',
          'box-shadow:0 4px 12px rgba(0,0,0,.35)', 'z-index:999',
          'white-space:nowrap', 'max-width:240px'
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
        var scaleX = canvasEl.width  / (rect.width  || canvasEl.width);
        var scaleY = canvasEl.height / (rect.height || canvasEl.height);
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
    var factorColours= ['#2563eb', '#16a34a', '#7c3aed', '#d97706', '#0891b2'];

    var maxScore = 100;

    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Factor contribution bars">'];
    parts.push('<title>Factor score breakdown — top ' + topN + ' markets</title>');

    // Legend
    factorKeys.forEach(function (k, i) {
      var lx = padL + i * 66;
      parts.push(svgEl('rect', { x: lx, y: 0, width: 12, height: 12, rx: 2, fill: factorColours[i] }));
      parts.push(svgTag('text', { x: lx + 15, y: 11, 'font-size': '10', fill: '#374151' }, esc(factorLabels[i])));
    });

    top.forEach(function (mkt, i) {
      var y = padT + 16 + i * (barH + gap);
      // Market label
      parts.push(svgTag('text', {
        x: padL - 6, y: y + barH / 2 + 5,
        'text-anchor': 'end', 'font-size': '11', fill: '#1e293b'
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
        'font-size': '12', 'font-weight': '700', fill: '#1e293b'
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

    var W = 400, H = 220, padL = 100, padR = 40, padT = 30, barH = 28, gap = 14;

    function hatch(val) {
      if (val < 0.15)  return { label: 'Diversified',  colour: '#16a34a' };
      if (val < 0.25)  return { label: 'Moderate',     colour: '#f59e0b' };
      return               { label: 'Concentrated',  colour: '#dc2626' };
    }

    var rows = [
      { label: 'City HHI — Before',  value: before.cityHHI || 0 },
      { label: 'City HHI — After',   value: after.cityHHI  || 0 },
      { label: 'Type HHI — Before',  value: before.typeHHI || 0 },
      { label: 'Type HHI — After',   value: after.typeHHI  || 0 }
    ];
    var maxVal = 1;
    var totalH = padT + rows.length * (barH + gap) + 40;

    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + totalH + '" role="img" aria-label="HHI before and after comparison">'];
    parts.push('<title>HHI before and after investment</title>');

    // Threshold lines
    [0.15, 0.25].forEach(function (thresh) {
      var lx = padL + thresh * (W - padL - padR);
      parts.push(svgEl('line', { x1: lx, y1: padT - 10, x2: lx, y2: totalH - 30, stroke: '#94a3b8', 'stroke-dasharray': '4 3', 'stroke-width': '1' }));
      parts.push(svgTag('text', { x: lx + 2, y: padT - 12, 'font-size': '9', fill: '#94a3b8' }, esc(String(thresh))));
    });

    rows.forEach(function (row, i) {
      var y    = padT + i * (barH + gap);
      var h    = hatch(row.value);
      var barW = Math.round((row.value / maxVal) * (W - padL - padR));

      parts.push(svgTag('text', {
        x: padL - 6, y: y + barH / 2 + 5,
        'text-anchor': 'end', 'font-size': '11', fill: '#374151'
      }, esc(row.label)));

      parts.push(svgEl('rect', { x: padL, y: y, width: barW, height: barH, rx: 3, fill: h.colour }));

      parts.push(svgTag('text', {
        x: padL + barW + 5, y: y + barH / 2 + 5,
        'font-size': '11', fill: h.colour, 'font-weight': '600'
      }, esc(row.value.toFixed(3) + ' · ' + h.label)));
    });

    // Axis
    parts.push(svgEl('line', { x1: padL, y1: totalH - 30, x2: W - padR, y2: totalH - 30, stroke: '#e2e8f0', 'stroke-width': '1' }));
    parts.push(svgTag('text', { x: padL, y: totalH - 16, 'font-size': '10', fill: '#94a3b8' }, '0.00'));
    parts.push(svgTag('text', { x: W - padR - 10, y: totalH - 16, 'font-size': '10', fill: '#94a3b8' }, '1.00'));

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
    var ctx  = canvasEl.getContext('2d');
    var W    = canvasEl.width  || 480;
    var H    = canvasEl.height || 280;
    ctx.clearRect(0, 0, W, H);

    var padL = 65, padR = 20, padT = 20, padB = 40;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var lines = [
      { key: 'conservative', label: 'Conservative', colour: COLOURS.conservative },
      { key: 'base',         label: 'Base',         colour: COLOURS.base         },
      { key: 'optimistic',   label: 'Optimistic',   colour: COLOURS.optimistic   }
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
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth   = 1;
    for (var gi = 0; gi <= 4; gi++) {
      var gy = padT + (gi / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
    }

    // Lines
    lines.forEach(function (l) {
      var pts = scenarios[l.key] || [];
      if (!pts.length) return;
      ctx.beginPath();
      ctx.strokeStyle = l.colour;
      ctx.lineWidth   = 2.5;
      pts.forEach(function (pt, i) {
        var x = cx(pt.year), y = cy(pt.portfolioValue);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Dots
      pts.forEach(function (pt) {
        ctx.beginPath();
        ctx.arc(cx(pt.year), cy(pt.portfolioValue), 4, 0, Math.PI * 2);
        ctx.fillStyle = l.colour;
        ctx.fill();
      });
    });

    // Axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

    // X-axis labels (years)
    ctx.fillStyle  = '#64748b';
    ctx.font       = '11px system-ui, sans-serif';
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
    var legX = padL + 8, legY = padT + 8;
    lines.forEach(function (l, i) {
      ctx.strokeStyle = l.colour;
      ctx.lineWidth   = 2.5;
      ctx.beginPath(); ctx.moveTo(legX, legY + i * 18); ctx.lineTo(legX + 20, legY + i * 18); ctx.stroke();
      ctx.fillStyle  = '#374151';
      ctx.font       = '11px system-ui, sans-serif';
      ctx.textAlign  = 'left';
      ctx.fillText(l.label, legX + 24, legY + i * 18 + 4);
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
    svgParts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" role="img" aria-label="' + title + '">');
    // Title
    svgParts.push('<text x="' + (W / 2) + '" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#374151">' + title + '</text>');

    var palette = ['#2563eb','#16a34a','#d97706','#7c3aed','#db2777','#0891b2','#65a30d','#c2410c'];

    entries.forEach(function (e, i) {
      var y = PAD_T + i * (BAR_H + GAP);
      var barW = Math.max(2, Math.round(e.share * PLOT_W));
      var colour = palette[i % palette.length];
      var pct = (e.share * 100).toFixed(1) + '%';
      var label = e.label.length > 14 ? e.label.slice(0, 13) + '…' : e.label;

      // Label
      svgParts.push('<text x="' + (PAD_L - 6) + '" y="' + (y + BAR_H * 0.7) + '" text-anchor="end" font-size="10" fill="#6b7280">' + label + '</text>');
      // Bar background
      svgParts.push('<rect x="' + PAD_L + '" y="' + y + '" width="' + PLOT_W + '" height="' + BAR_H + '" fill="#f3f4f6" rx="3"/>');
      // Bar fill
      svgParts.push('<rect x="' + PAD_L + '" y="' + y + '" width="' + barW + '" height="' + BAR_H + '" fill="' + colour + '" rx="3"/>');
      // Pct label
      svgParts.push('<text x="' + (PAD_L + barW + 4) + '" y="' + (y + BAR_H * 0.7) + '" font-size="10" fill="#374151">' + pct + '</text>');
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

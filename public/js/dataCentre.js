/**
 * dataCentre.js — Data Centre page controller for REIT Target AI
 *
 * NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo
 *
 * FIVE ANALYTICAL LEVELS, KEPT APART
 * ----------------------------------
 * This page previously mixed 50 market-level rows, 2,156 simulated
 * observations and city × property-type groupings under one "Data Preview"
 * heading, with "N" and "Obs" columns whose units differed, a confidence-
 * interval column that read "n<10" beside groups of hundreds of observations,
 * and internal codes such as "reported_tier1" shown as if a reported figure
 * existed. Each level now has its own section and its own units:
 *
 *   1. Portfolio Holdings                     the active portfolio
 *   2. Market Segment Aggregates — 50 rows    one row per segment (medians)
 *   3. Simulated Observation Dataset — 2,156 rows   the draws behind the medians
 *   4. Source / Calibration Register          what was cited, and what was found
 *   5. Data Quality and Cleaning Results      CSV import and the cleaning pipeline
 *
 * and the System Check (systemCheck.js) runs the production engines against
 * the current data. Large tables are collapsed by default.
 *
 * XSS policy: user-controlled text goes through textContent, never innerHTML.
 */

(function () {
  'use strict';

  var ROOT_ID = 'datacentre-content';

  var view = {
    loaded: false,
    error: null,
    csvRecords: [],          // last imported CSV, cleaned
    cleaningReport: null,    // last DataCleaner report
    csvFileName: null,
    obsPreview: null,        // first 100 simulated observations, loaded on request
    obsPreviewPending: false,
    checkResults: null
  };

  /* ── Helpers ──────────────────────────────────────────────── */
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }
  function td(text, cls) { return make('td', cls, text === null || text === undefined ? '—' : text); }
  function th(text, scope) { var h = make('th', null, text); if (scope) { h.setAttribute('scope', scope); } return h; }
  function fmtCr(rs, dp) { return typeof rs === 'number' && isFinite(rs) ? '₹' + (rs / 1e7).toFixed(dp === undefined ? 2 : dp) + ' Cr' : '—'; }
  function fmtPct(d)  { return typeof d === 'number' && isFinite(d) ? (d * 100).toFixed(2) + '%' : '—'; }
  function rs(n) { return typeof n === 'number' && isFinite(n) ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'; }
  function toast(msg, type) { if (typeof showToast === 'function') { showToast(msg, type); } }

  function section(num, title, intro, id) {
    var s = make('section', 'reit-section reit-dc-section');
    s.setAttribute('aria-labelledby', id);
    var h = make('h2', null, num ? num + '. ' + title : title);
    h.id = id;
    s.appendChild(h);
    if (intro) { s.appendChild(make('p', 'reit-text-muted', intro)); }
    return s;
  }

  /** A table, optionally inside a collapsed <details>, with a caption. */
  function table(caption, headers, rows, opts) {
    opts = opts || {};
    var t = make('table', 'reit-table' + (opts.compact ? ' reit-table--compact' : ''));
    if (opts.id) { t.id = opts.id; }
    var cap = make('caption', 'reit-table-caption', caption);
    t.appendChild(cap);
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    headers.forEach(function (h) { hr.appendChild(th(h, 'col')); });
    thead.appendChild(hr);
    t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.cls) { tr.className = r.cls; }
      (r.cells || r).forEach(function (c, i) {
        if (i === 0 && opts.rowHeader) { var h = th(c, 'row'); tr.appendChild(h); }
        else { tr.appendChild(td(c)); }
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    var scroll = make('div', 'reit-table-scroll');
    scroll.appendChild(t);
    if (!opts.collapsed) { return scroll; }
    var d = make('details', 'reit-expandable');
    d.appendChild(make('summary', null, opts.summary || ('Show the table (' + rows.length + ' rows)')));
    d.appendChild(scroll);
    return d;
  }

  /* ── 1. Portfolio Holdings ────────────────────────────────── */
  function buildHoldings(run) {
    var s = section(1, 'Portfolio Holdings — ' + run.portfolio.assetCount + ' rows',
      'The ' + (run.portfolio.source === 'custom' ? 'custom' : 'sample') + ' portfolio the analysis uses: ' +
      run.portfolio.assetCount + ' holdings, ' + fmtCr(run.portfolio.totalValueRs) + ' value, ' +
      fmtCr(run.portfolio.annualRentRs, 3) + ' annual rent, ' + fmtPct(run.portfolio.weightedYield) +
      ' weighted gross yield. Synthetic: no real property, tenant or lease.', 'dc-h-holdings');
    var rows = run.assets.map(function (a) {
      return [a.assetId, a.assetName, a.city, a.assetType, fmtCr(a.propertyValue),
              fmtCr(a.annualRent, 3), fmtPct(a.propertyValue ? a.annualRent / a.propertyValue : null),
              typeof a.occupancyRate === 'number' ? (a.occupancyRate * 100).toFixed(1) + '%' : '—'];
    });
    s.appendChild(table('Holdings in the active portfolio',
      ['Asset ID', 'Name', 'City', 'Asset type', 'Value', 'Annual rent', 'Gross yield', 'Occupancy'], rows,
      { rowHeader: true }));
    return s;
  }

  /* ── 2. Market Segment Aggregates ─────────────────────────── */
  function buildSegments(run, markets) {
    var s = section(2, 'Market Segment Aggregates — ' + markets.length + ' rows',
      'One row per candidate market segment. Every figure is the MEDIAN of that segment’s simulated ' +
      'market observations (section 3). These are the rows the scoring engine ranks.', 'dc-h-segments');

    s.appendChild(make('p', 'reit-note',
      'Notional 1,000 sq ft columns: the segment’s median value and median monthly rent per sq ft, ' +
      'each multiplied by a representative 1,000 sq ft. They put every segment on the same footing for ' +
      'comparison and in the same shape as an imported listing file, so the cleaning pipeline in section 5 ' +
      'can process them. They are normalised representative amounts, not listings or prices of any real unit.'));

    var byId = {};
    run.ranked.forEach(function (m) { byId[m.marketId] = m; });
    var rows = markets.map(function (m) {
      var r = byId[m.marketId] || {};
      var g = r.governance || Governance.evaluate(m);
      return [m.marketId, m.city, m.locality, m.propertyType,
              rs(m.medianCapitalValuePerSqFt), '₹' + m.medianMonthlyRentPerSqFt.toFixed(2),
              rs(m.medianCapitalValuePerSqFt * 1000), rs(m.medianMonthlyRentPerSqFt * 1000),
              fmtPct(m.medianMonthlyRentPerSqFt * 12 / m.medianCapitalValuePerSqFt),
              String(m.observationCount), m.confidenceGrade || '—',
              g.eligible ? '✓ Passes' : '✗ Fails',
              AppMeta.sourceTypeLabel(m.sourceType),
              r.externalCalibrationStatus || 'Unverified'];
    });
    s.appendChild(table('Market segment aggregates (segment medians of simulated observations)',
      ['Segment', 'City', 'Locality', 'Type', 'Median value ₹/sq ft', 'Median rent ₹/sq ft/month',
       'Notional value (1,000 sq ft)', 'Notional monthly rent (1,000 sq ft)', 'Gross yield',
       'Simulated observations', 'Assumption Support Grade', 'Simulation-support screen',
       'Assumption basis', 'External calibration'],
      rows, { collapsed: true, compact: true, id: 'dc-segment-table',
              summary: 'Show all ' + markets.length + ' segment rows' }));

    s.appendChild(buildGroupStats(markets));
    return s;
  }

  /* City and city × property-type statistics, with the CI unit stated. */
  function buildGroupStats(markets) {
    var wrap = make('div');
    wrap.appendChild(make('h3', null, 'Statistics across segment medians, by group'));
    wrap.appendChild(make('p', 'reit-note',
      'The unit in both tables is the MICRO-MARKET: each row summarises the medians of the segments in the ' +
      'group. "Micro-markets" counts those segments; "Simulated observations" counts the draws behind them. ' +
      'The 95% confidence interval is bootstrapped across segment medians (CI unit: ' + Stats.CI_UNIT + '), ' +
      Stats.BOOTSTRAP_N + ' resamples, seed ' + Stats.BOOTSTRAP_SEED + ', and needs at least ' + Stats.MIN_OBS_CI +
      ' micro-markets. Observation-level spread for each segment is the P10–P90 range on the Market Screener.'));

    var cRows = Stats.cityStats(markets).map(function (c) {
      return [c.city, String(c.segmentCount), String(c.totalObservations), c.propertyTypes.join(', '),
              c.medianCapitalValue != null ? rs(c.medianCapitalValue) : '—',
              Stats.fmtPct(c.minYield) + ' – ' + Stats.fmtPct(c.maxYield), Stats.fmtPct(c.medianYield),
              c.hasSampleSizeWarning ? '⚠ yes' : 'no'];
    });
    wrap.appendChild(table('By city (unit: micro-market)',
      ['City', 'Micro-markets', 'Simulated observations', 'Property types', 'Median value ₹/sq ft',
       'Gross yield range', 'Median gross yield', 'Any segment under 30 observations'], cRows,
      { rowHeader: true, compact: true }));

    var sRows = Stats.segmentStats(markets, true).map(function (g) {
      var y = g.grossYield;
      return [g.city + ' — ' + g.propertyType, String(g.count), String(g.totalObservations),
              Stats.fmtPct(y.median), y.ciUnit,
              y.ci ? Stats.fmtPct(y.ci.lo) + ' – ' + Stats.fmtPct(y.ci.hi) : 'Not computed',
              y.ciUnavailableReason || '—', y.iqr != null ? Stats.fmtPct(y.iqr) : '—',
              g.hasSampleSizeWarning ? '⚠ yes' : 'no'];
    });
    wrap.appendChild(table('By city × property type (unit: micro-market)',
      ['Group', 'Micro-markets', 'Simulated observations', 'Median gross yield (of segment medians)',
       'CI unit', 'CI result', 'CI unavailable reason', 'Gross yield IQR', 'Any segment under 30 observations'],
      sRows, { rowHeader: true, compact: true, collapsed: true, id: 'dc-group-table',
               summary: 'Show the city × property-type table (' + sRows.length + ' groups)' }));
    return wrap;
  }

  /* ── 3. Simulated Observation Dataset ─────────────────────── */
  function buildObservations(run, markets) {
    var total = markets.reduce(function (t, m) { return t + (m.observationCount || 0); }, 0);
    var s = section(3, 'Simulated Observation Dataset — ' + AppMeta.num(total) + ' rows',
      'Seeded draws from the project’s generator (version ' + ((markets[0] && markets[0].derivedFrom &&
      markets[0].derivedFrom.generatorVersion) || '—') + '), ' + Math.min.apply(null, markets.map(function (m) { return m.observationCount; })) +
      '–' + Math.max.apply(null, markets.map(function (m) { return m.observationCount; })) + ' per segment. They are simulated ' +
      'market observations — not properties, listings or transactions. More draws narrow a segment’s ' +
      'median around the ASSUMED distribution; they are not market evidence.', 'dc-h-observations');

    var byType = {};
    markets.forEach(function (m) { byType[m.propertyType] = (byType[m.propertyType] || 0) + m.observationCount; });
    s.appendChild(table('Simulated observations by property type',
      ['Property type', 'Simulated observations'],
      Object.keys(byType).sort().map(function (k) { return [k, AppMeta.num(byType[k])]; }), { rowHeader: true }));

    var actions = make('div', 'reit-control-row');
    if (!view.obsPreview) {
      var b = make('button', 'reit-btn reit-btn--outline', view.obsPreviewPending ? 'Loading…' : 'Load a 100-row preview');
      b.type = 'button';
      b.disabled = view.obsPreviewPending;
      b.addEventListener('click', loadObsPreview);
      actions.appendChild(b);
    }
    var dl = make('a', 'reit-btn reit-btn--outline', 'Open the full dataset (JSON, 1.1 MB)');
    dl.href = 'data/observations.json';
    dl.target = '_blank';
    dl.rel = 'noopener';
    actions.appendChild(dl);
    s.appendChild(actions);

    if (view.obsPreview) {
      var rows = view.obsPreview.map(function (o) {
        return [o.obs_id, o.market_id, o.city, o.locality, o.property_type,
                o.gross_yield_pct.toFixed(2) + '%', o.rental_growth_pct.toFixed(2) + '%',
                '₹' + o.monthly_rent_psf.toFixed(2), rs(o.sale_price_psf), o.occupancy_pct.toFixed(1) + '%'];
      });
      s.appendChild(table('First 100 of ' + AppMeta.num(total) + ' simulated market observations',
        ['Observation', 'Segment', 'City', 'Locality', 'Type', 'Gross yield', 'Rental growth',
         'Rent ₹/sq ft/month', 'Value ₹/sq ft', 'Occupancy'], rows,
        { collapsed: true, compact: true, id: 'dc-obs-preview', summary: 'Show the 100-row preview' }));
    }
    return s;
  }

  function loadObsPreview() {
    view.obsPreviewPending = true;
    render();
    fetch('data/observations.json').then(function (r) { return r.json(); }).then(function (j) {
      view.obsPreview = (j.observations || []).slice(0, 100);
      view.obsPreviewPending = false;
      render();
    }).catch(function (e) {
      view.obsPreviewPending = false;
      toast('Could not load the observation dataset: ' + e.message, 'error');
      render();
    });
  }

  /* ── 4. Source / Calibration Register ─────────────────────── */
  function buildRegister(run) {
    var meta = AnalysisRun.data().metaDoc;
    var sv = meta && meta.sourceVerification;
    var s = section(4, 'Source / Calibration Register' + (sv ? ' — ' + sv.rows.length + ' rows' : ''),
      'The sources the project’s assumptions cite, and what verification found. External calibration ' +
      'is derived from this register alone — never from simulation count or grade.', 'dc-h-register');
    if (!sv) {
      s.appendChild(make('p', 'reit-text-muted', 'The register summary (data/meta.json) could not be loaded.'));
      return s;
    }
    var counts = {};
    run.ranked.forEach(function (m) { counts[m.externalCalibrationStatus] = (counts[m.externalCalibrationStatus] || 0) + 1; });
    s.appendChild(make('p', 'reit-rec-caveat',
      'External calibration of the ' + run.ranked.length + ' segments: ' +
      Object.keys(counts).map(function (k) { return counts[k] + ' ' + k; }).join(', ') + '. ' + sv.summary));
    s.appendChild(table('Cited sources and verification outcome',
      ['Source', 'Publisher', 'Cited document', 'Outcome', 'Classification'],
      sv.rows.map(function (r) { return [r.id, r.publisher, r.title, r.outcome, r.classification]; }),
      { rowHeader: true, compact: true }));
    var p = make('p', 'reit-text-muted');
    p.appendChild(document.createTextNode('Method and full findings: '));
    var a = make('a', null, AppMeta.EXTERNAL_CALIBRATION.reportPath);
    a.href = AppMeta.docUrl(AppMeta.EXTERNAL_CALIBRATION.reportPath);
    a.target = '_blank';
    a.rel = 'noopener';
    p.appendChild(a);
    s.appendChild(p);
    return s;
  }

  /* ── 5. Data Quality and Cleaning Results ─────────────────── */
  function buildQuality() {
    var s = section(5, 'Data Quality and Cleaning Results',
      'Import a CSV of listing-style records to run the cleaning pipeline: column check, name ' +
      'standardisation, unit conversion, impossible-value rejection, duplicate and outlier flags. ' +
      'Imported files are checked here only; they never change the market segments or the analysis.',
      'dc-h-quality');

    var row = make('div', 'reit-control-row');
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.id = 'reit-csv-file-input';
    fileInput.className = 'reit-sr-only';
    fileInput.setAttribute('aria-label', 'Choose a CSV file to clean');
    fileInput.addEventListener('change', handleCSVUpload);
    row.appendChild(fileInput);

    var up = make('button', 'reit-btn reit-btn--primary', 'Import CSV');
    up.type = 'button';
    up.addEventListener('click', function () { fileInput.click(); });
    row.appendChild(up);

    var tpl = make('button', 'reit-btn reit-btn--outline', 'Download CSV template');
    tpl.type = 'button';
    tpl.addEventListener('click', downloadCSVTemplate);
    row.appendChild(tpl);

    if (view.cleaningReport) {
      var clr = make('button', 'reit-btn reit-btn--outline', 'Clear the imported file');
      clr.type = 'button';
      clr.addEventListener('click', function () {
        view.csvRecords = []; view.cleaningReport = null; view.csvFileName = null; render();
      });
      row.appendChild(clr);
    }
    s.appendChild(row);
    s.appendChild(make('p', 'reit-text-muted',
      'Test files: tests/fixtures/markets-valid.csv (all rows accepted) and tests/fixtures/markets-invalid.csv ' +
      '(every row rejected, each for one stated reason).'));

    if (!view.cleaningReport) {
      s.appendChild(make('p', 'reit-text-muted', 'No file imported in this session.'));
      return s;
    }
    s.appendChild(buildCleaningReport(view.cleaningReport));
    var rows = view.csvRecords.map(function (r) {
      return { cls: r.validationStatus === 'rejected' ? 'reit-row--rejected' : (r.validationStatus === 'warning' ? 'reit-row--warning' : ''),
               cells: [r.recordId, r.city, r.locality, r.propertyType,
                       typeof r.areaSqFt === 'number' ? r.areaSqFt.toFixed(0) : r.areaSqFt,
                       typeof r.askingPriceINR === 'number' ? rs(r.askingPriceINR) : r.askingPriceINR,
                       typeof r.monthlyRentINR === 'number' ? rs(r.monthlyRentINR) : r.monthlyRentINR,
                       r.duplicateFlag ? 'Yes' : 'No', r.outlierFlag ? 'Yes' : 'No',
                       r.validationStatus === 'rejected' ? '✗ Rejected' : r.validationStatus === 'warning' ? '⚠ Warning' : '✓ OK',
                       r.exclusionReason || '—'] };
    });
    s.appendChild(table('Imported rows after cleaning' + (view.csvFileName ? ' — ' + view.csvFileName : ''),
      ['Record', 'City', 'Locality', 'Type', 'Area (sq ft)', 'Asking price', 'Monthly rent',
       'Duplicate', 'Outlier', 'Status', 'Reason'], rows,
      { collapsed: rows.length > 20, compact: true, id: 'dc-csv-table' }));
    return s;
  }

  function buildCleaningReport(report) {
    var wrap = make('div');
    wrap.appendChild(make('h3', null, 'Cleaning pipeline report'));
    var summary = make('div', 'reit-quality-summary');
    summary.setAttribute('role', 'status');
    [['Total', report.total, ''], ['OK', report.ok, 'reit-quality-ok'],
     ['Rejected', report.rejected, 'reit-quality-rejected'], ['Warnings', report.warnings, 'reit-quality-warning'],
     ['Duplicates', report.duplicates, 'reit-quality-dup'], ['Outliers', report.outliers, 'reit-quality-outlier']
    ].forEach(function (it) {
      var chip = make('div', 'reit-quality-chip ' + it[2]);
      chip.appendChild(make('span', 'reit-quality-chip__num', it[1]));
      chip.appendChild(make('span', 'reit-quality-chip__lbl', it[0]));
      summary.appendChild(chip);
    });
    wrap.appendChild(summary);
    var chartDiv = make('div', 'reit-chart-wrap');
    chartDiv.id = 'dc-funnel-chart';
    wrap.appendChild(chartDiv);
    wrap.appendChild(table('Cleaning steps', ['Step', 'Status', 'Detail'],
      (report.steps || []).map(function (st) {
        return [st.step, st.status === 'passed' ? '✓ passed' : '✗ ' + st.status, st.detail || ''];
      }), { rowHeader: true }));
    var dl = make('button', 'reit-btn reit-btn--outline', 'Download cleaning report (CSV)');
    dl.type = 'button';
    dl.addEventListener('click', function () { downloadCleaningReport(report); });
    wrap.appendChild(dl);
    setTimeout(function () {
      if (typeof Charts !== 'undefined' && document.getElementById('dc-funnel-chart')) {
        Charts.renderFunnelChart('dc-funnel-chart', report);
      }
    }, 0);
    return wrap;
  }

  function handleCSVUpload(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function (e) { importCSVText(String(e.target.result), file.name); };
    reader.readAsText(file);
    ev.target.value = '';
  }

  /** Clean CSV text and show the result. Exposed for the acceptance tests. */
  function importCSVText(text, name) {
    try {
      var result = DataCleaner.cleanRecords(DataCleaner.parseCSV(text));
      view.csvRecords = result.records;
      view.cleaningReport = result.report;
      view.csvFileName = name || 'imported.csv';
      render();
      toast('CSV cleaned: ' + result.report.total + ' rows · ' + result.report.ok + ' OK · ' +
            result.report.rejected + ' rejected', result.report.rejected > 0 ? 'warn' : 'success');
      return result.report;
    } catch (err) {
      toast('CSV could not be parsed: ' + err.message, 'error');
      return null;
    }
  }

  function saveBlob(text, name) {
    var blob = new Blob([text], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadCSVTemplate() {
    saveBlob(DataCleaner.generateCSVTemplate(), 'reit-target-template.csv');
    toast('CSV template downloaded', 'success');
  }

  function downloadCleaningReport(report) {
    var lines = ['Step,Status,Detail'];
    (report.steps || []).forEach(function (st) {
      lines.push([st.step, st.status, (st.detail || '').replace(/,/g, ';')].join(','));
    });
    lines.push('', 'Metric,Count');
    ['total', 'ok', 'rejected', 'warnings', 'duplicates', 'outliers'].forEach(function (k) {
      lines.push(k + ',' + report[k]);
    });
    saveBlob(lines.join('\n'), 'reit-cleaning-report.csv');
  }

  /* ── System Check ─────────────────────────────────────────── */
  function buildSystemCheck() {
    var s = section(null, 'System Check',
      'Runs the production engines against the current data and the shared analysis run: HHI, scoring, ' +
      'projections, the cleaning pipeline, the shared run, the canonical counts and the pre-generated ' +
      'commentary. Each check shows what it expected and what it got. Running it changes nothing you saved.',
      'dc-h-check');
    var btn = make('button', 'reit-btn reit-btn--primary', '▶  Run System Check');
    btn.type = 'button';
    btn.id = 'dc-run-check';
    btn.addEventListener('click', runSystemCheck);
    s.appendChild(btn);

    var res = make('div', 'reit-system-check-results');
    res.id = 'dc-system-check-result';
    res.setAttribute('aria-live', 'polite');
    if (view.checkResults) {
      var passed = view.checkResults.filter(function (r) { return r.ok; }).length;
      var total = view.checkResults.length;
      var sum = make('p', 'reit-system-check-summary ' + (passed === total ? 'reit-chk-summary-pass' : 'reit-chk-summary-fail'),
        (passed === total ? '✓ ' : '✗ ') + passed + ' / ' + total + ' checks passed' +
        (passed === total ? '' : ' — ' + (total - passed) + ' failed; see the details below'));
      res.appendChild(sum);
      var ul = make('ul', 'reit-system-check-list');
      view.checkResults.forEach(function (r) {
        var li = make('li', 'reit-chk-item reit-chk-' + (r.ok ? 'pass' : 'fail'));
        li.appendChild(make('span', 'reit-chk-badge', r.ok ? '✓ Pass' : '✗ Fail'));
        li.appendChild(make('span', 'reit-chk-id', r.id));
        li.appendChild(make('span', 'reit-chk-label', r.label));
        li.appendChild(make('span', 'reit-chk-detail', r.detail));
        ul.appendChild(li);
      });
      res.appendChild(ul);
    }
    s.appendChild(res);
    return s;
  }

  function runSystemCheck() {
    var data = AnalysisRun.data();
    var storage = null;
    try { storage = window.localStorage; } catch (e) { storage = null; }
    fetch('data/agent-cache.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (cacheDoc) {
        view.checkResults = SystemCheck.run({
          HHIEngine: HHIEngine, ScoringEngine: ScoringEngine, Projection: Projection,
          DataCleaner: DataCleaner, ScenarioKey: ScenarioKey, AnalysisRun: AnalysisRun, AppMeta: AppMeta,
          run: AnalysisRun.current(), marketsDoc: data.marketsDoc, sampleAssets: data.sampleAssets,
          metaDoc: data.metaDoc, cacheDoc: cacheDoc, storage: storage
        });
        render();
        var b = document.getElementById('dc-run-check');
        if (b) { b.focus(); }
      });
  }

  /* ── Render ───────────────────────────────────────────────── */
  function render() {
    var root = document.getElementById(ROOT_ID);
    if (!root) { return; }
    root.innerHTML = '';
    if (view.error) {
      var e = make('p', 'error-msg', view.error);
      e.setAttribute('role', 'alert');
      root.appendChild(e);
      return;
    }
    if (!view.loaded) {
      var l = make('p', 'loading-msg', 'Loading the data layers…');
      l.setAttribute('role', 'status');
      root.appendChild(l);
      return;
    }
    var run = AnalysisRun.current();
    var markets = AnalysisRun.data().marketsDoc.markets;
    root.appendChild(make('p', 'reit-note',
      'Five analytical levels, kept apart: the portfolio, the 50 market-segment aggregates, the ' +
      AppMeta.num(run.dataset.observationCount) + ' simulated observations behind them, the source register, ' +
      'and data-quality results for imported files. All data is synthetic.'));
    root.appendChild(buildHoldings(run));
    root.appendChild(buildSegments(run, markets));
    root.appendChild(buildObservations(run, markets));
    root.appendChild(buildRegister(run));
    root.appendChild(buildQuality());
    root.appendChild(buildSystemCheck());
  }

  function init() {
    render();
    AnalysisRun.ready().then(function () {
      view.loaded = true;
      render();
    }).catch(function (err) {
      view.error = 'Could not load the dataset: ' + err.message + '. Reload the page to try again.';
      render();
    });
    AnalysisRun.subscribe(function () { if (view.loaded) { render(); } });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DataCentre = {
    importCSVText:     importCSVText,
    runSystemCheck:    runSystemCheck,
    getCheckResults:   function () { return view.checkResults; },
    getCleaningReport: function () { return view.cleaningReport; }
  };

}());

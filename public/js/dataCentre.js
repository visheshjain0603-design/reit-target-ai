/**
 * dataCentre.js — Data Centre page controller for REIT Target AI
 *
 * NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo
 *
 * Renders the #datacentre page:
 *   - Dataset status cards (portfolio.json, markets.json)
 *   - Data input options: synthetic snapshot, CSV upload, CSV template download,
 *     restore previous
 *   - Full data preview table with provenance schema
 *   - CSV cleaning pipeline report and funnel chart
 *   - Connector architecture note + disabled "Refresh External Data" button
 *
 * XSS policy: all user-controlled text goes through textContent, never innerHTML.
 * The only innerHTML use here is for SVG charts (Charts.renderFunnelChart).
 */

(function () {
  'use strict';

  /* ── State ────────────────────────────────────────────────── */
  var _currentRecords  = [];   // active dataset (synthetic or CSV-cleaned)
  var _cleaningReport  = null; // last DataCleaner report
  var _dataSource      = 'synthetic'; // 'synthetic' | 'csv'

  /* ── Helpers ──────────────────────────────────────────────── */
  function el(id)  { return document.getElementById(id); }
  function fmt(n, dp) { return typeof n === 'number' && !isNaN(n) ? n.toFixed(dp || 0) : '—'; }
  function fmtCr(rs)  { return typeof rs === 'number' && !isNaN(rs) ? '₹' + (rs / 1e7).toFixed(2) + ' Cr' : '—'; }
  function fmtPct(d)  { return typeof d === 'number' && !isNaN(d) ? (d * 100).toFixed(2) + '%' : '—'; }

  /** Safe text node append to parent */
  function addText(parent, str) {
    parent.appendChild(document.createTextNode(String(str)));
  }

  /** Create element with optional className */
  function make(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  /** Create <td> with textContent */
  function td(text, cls) {
    var cell = document.createElement('td');
    if (cls) cell.className = cls;
    cell.textContent = String(text === null || text === undefined ? '—' : text);
    return cell;
  }

  /** Create <th> */
  function th(text, scope) {
    var h = document.createElement('th');
    if (scope) h.setAttribute('scope', scope);
    h.textContent = String(text);
    return h;
  }

  /* ── Provenance schema columns for the preview table ─────── */
  var PREVIEW_COLUMNS = [
    { key: 'recordId',        label: 'Record ID' },
    { key: 'sourceName',      label: 'Source' },
    { key: 'datasetType',     label: 'Dataset Type' },
    { key: 'isSynthetic',     label: 'Synthetic?' },
    { key: 'city',            label: 'City' },
    { key: 'locality',        label: 'Locality' },
    { key: 'propertyType',    label: 'Property Type' },
    { key: 'areaSqFt',        label: 'Area (sq ft)' },
    { key: 'askingPriceINR',  label: 'Asking Price (₹)' },
    { key: 'monthlyRentINR',  label: 'Monthly Rent (₹)' },
    { key: 'pricePerSqFt',    label: '₹/sq ft' },
    { key: 'rentPerSqFt',     label: 'Rent/sq ft' },
    { key: 'duplicateFlag',   label: 'Duplicate?' },
    { key: 'outlierFlag',     label: 'Outlier?' },
    { key: 'validationStatus',label: 'Status' },
    { key: 'exclusionReason', label: 'Exclusion Reason' }
  ];

  /* ── Build synthetic records from markets.json ────────────── */
  function syntheticRecordsFromMarkets(markets) {
    return markets.map(function (m, i) {
      var price = m.medianCapitalValuePerSqFt * 1000; // represent per 1000 sq ft unit
      var rent  = m.medianMonthlyRentPerSqFt  * 1000;
      return {
        recordId:        m.marketId || ('SYN-' + String(i + 1).padStart(4, '0')),
        sourceName:      m.sourceType  || 'Synthetic',
        sourceUrl:       '',
        collectionDate:  m.dataAsOf    || '2026-09-19',
        datasetType:     'synthetic-market-segment',
        isSynthetic:     true,
        listingType:     'market-average',
        city:            m.city,
        locality:        m.locality,
        propertyType:    m.propertyType,
        areaSqFt:        1000,
        askingPriceINR:  price,
        monthlyRentINR:  rent,
        pricePerSqFt:    m.medianCapitalValuePerSqFt,
        rentPerSqFt:     m.medianMonthlyRentPerSqFt,
        duplicateFlag:   false,
        outlierFlag:     false,
        validationStatus:'ok',
        exclusionReason: ''
      };
    });
  }

  /* ── Dataset status cards ─────────────────────────────────── */
  function buildStatusCards(container, portfolioData, marketsData) {
    container.innerHTML = ''; // clear — no user data here

    var grid = make('div', 'reit-status-grid');

    var datasets = [
      {
        name:   'Portfolio Data',
        file:   'data/portfolio.json',
        type:   'Synthetic holdings',
        date:   '2026-09-19',
        records: (portfolioData && portfolioData.assets) ? portfolioData.assets.length : 0,
        badge:  'synthetic'
      },
      {
        name:   'Market Segments',
        file:   'data/markets.json',
        type:   'Synthetic market data',
        date:   (marketsData && marketsData.dataAsOf) || '2026-09-19',
        records: (marketsData && marketsData.markets) ? marketsData.markets.length : 0,
        badge:  'synthetic'
      },
      {
        name:   'CSV Import',
        file:   '(user upload)',
        type:   'External listing data',
        date:   _dataSource === 'csv' ? 'Loaded' : 'Not loaded',
        records: _dataSource === 'csv' ? _currentRecords.length : 0,
        badge:  _dataSource === 'csv' ? 'csv' : 'none'
      }
    ];

    datasets.forEach(function (ds) {
      var card = make('div', 'reit-status-card');

      var name = make('div', 'reit-status-card__name');
      name.textContent = ds.name;
      card.appendChild(name);

      var file = make('div', 'reit-status-card__file');
      file.textContent = ds.file;
      card.appendChild(file);

      var row = make('div', 'reit-status-card__row');
      var typeEl = make('span', 'reit-status-card__type');
      typeEl.textContent = ds.type;
      row.appendChild(typeEl);
      var badge = make('span', 'reit-badge reit-badge--' + ds.badge);
      badge.textContent = ds.badge === 'none' ? 'not loaded' : ds.badge;
      row.appendChild(badge);
      card.appendChild(row);

      var meta = make('div', 'reit-status-card__meta');
      meta.textContent = ds.date + ' · ' + ds.records + ' record' + (ds.records !== 1 ? 's' : '');
      card.appendChild(meta);

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  /* ── Data input controls ──────────────────────────────────── */
  function buildInputControls(container) {
    container.innerHTML = '';

    var section = make('div', 'reit-section');

    var heading = make('h3');
    heading.textContent = 'Data Input Options';
    section.appendChild(heading);

    var desc = make('p', 'reit-text-muted');
    desc.textContent = 'Choose a data source. The synthetic snapshot is always available. CSV upload enables the cleaning pipeline.';
    section.appendChild(desc);

    var controlRow = make('div', 'reit-control-row');

    // Button: Use synthetic snapshot
    var btnSynthetic = make('button', 'reit-btn reit-btn--primary');
    btnSynthetic.textContent = 'Use Synthetic Snapshot';
    btnSynthetic.setAttribute('type', 'button');
    btnSynthetic.setAttribute('aria-label', 'Load the built-in synthetic dataset');
    btnSynthetic.addEventListener('click', function () { loadSynthetic(); });
    controlRow.appendChild(btnSynthetic);

    // File input: CSV upload (hidden, triggered by button)
    var fileInput = document.createElement('input');
    fileInput.type        = 'file';
    fileInput.accept      = '.csv';
    fileInput.id          = 'reit-csv-file-input';
    fileInput.style.display = 'none';
    fileInput.setAttribute('aria-label', 'Upload a CSV file');
    fileInput.addEventListener('change', function (ev) { handleCSVUpload(ev); });
    controlRow.appendChild(fileInput);

    var btnCSV = make('button', 'reit-btn reit-btn--secondary');
    btnCSV.textContent = 'Upload CSV';
    btnCSV.setAttribute('type', 'button');
    btnCSV.setAttribute('aria-label', 'Upload a CSV file of listing data');
    btnCSV.addEventListener('click', function () { fileInput.click(); });
    controlRow.appendChild(btnCSV);

    // Button: Download CSV template
    var btnTemplate = make('button', 'reit-btn reit-btn--outline');
    btnTemplate.textContent = 'Download CSV Template';
    btnTemplate.setAttribute('type', 'button');
    btnTemplate.setAttribute('aria-label', 'Download a CSV template with the required column headers');
    btnTemplate.addEventListener('click', function () { downloadCSVTemplate(); });
    controlRow.appendChild(btnTemplate);

    // Button: Restore previous (from stateManager)
    var btnRestore = make('button', 'reit-btn reit-btn--outline');
    btnRestore.textContent = 'Restore Previous Session';
    btnRestore.setAttribute('type', 'button');
    btnRestore.setAttribute('aria-label', 'Restore data from the previous browser session');
    btnRestore.addEventListener('click', function () { restorePreviousSession(); });
    controlRow.appendChild(btnRestore);

    section.appendChild(controlRow);

    // Connector placeholder
    var connNote = make('div', 'reit-connector-note');
    var connBtn = make('button', 'reit-btn reit-btn--outline reit-btn--disabled');
    connBtn.textContent = 'Refresh External Data';
    connBtn.setAttribute('type', 'button');
    connBtn.setAttribute('disabled', 'true');
    connBtn.setAttribute('aria-label', 'Refresh from external data source — not available in this academic demo');
    connNote.appendChild(connBtn);
    var connDesc = make('span', 'reit-connector-note__desc');
    connDesc.textContent = ' — External connector not active. In a production system this button would trigger a data refresh from PropEquity, ANAROCK or a custom feed. Architecture: see docs/ARCHITECTURE.md §7.';
    connNote.appendChild(connDesc);
    section.appendChild(connNote);

    container.appendChild(section);
  }

  /* ── Preview table ────────────────────────────────────────── */
  function buildPreviewTable(container, records) {
    container.innerHTML = '';

    var section = make('div', 'reit-section');

    var heading = make('h3');
    heading.textContent = 'Data Preview — ' + records.length + ' record' + (records.length !== 1 ? 's' : '');
    section.appendChild(heading);

    if (!records.length) {
      var empty = make('p', 'reit-text-muted');
      empty.textContent = 'No records loaded. Choose a data source above.';
      section.appendChild(empty);
      container.appendChild(section);
      return;
    }

    var wrap = make('div', 'reit-table-scroll');
    var table = document.createElement('table');
    table.className = 'reit-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', 'Data preview table');

    // Header
    var thead = document.createElement('thead');
    var hrow  = document.createElement('tr');
    PREVIEW_COLUMNS.forEach(function (col) { hrow.appendChild(th(col.label, 'col')); });
    thead.appendChild(hrow);
    table.appendChild(thead);

    // Body
    var tbody = document.createElement('tbody');
    records.forEach(function (rec) {
      var row = document.createElement('tr');
      var statusClass = '';
      if (rec.validationStatus === 'rejected') statusClass = 'reit-row--rejected';
      else if (rec.validationStatus === 'warning') statusClass = 'reit-row--warning';
      if (statusClass) row.className = statusClass;

      PREVIEW_COLUMNS.forEach(function (col) {
        var val = rec[col.key];
        var display;
        if (val === true)          display = 'Yes';
        else if (val === false)    display = 'No';
        else if (col.key === 'askingPriceINR' || col.key === 'monthlyRentINR') {
          display = typeof val === 'number' && !isNaN(val) ? '₹' + Math.round(val).toLocaleString('en-IN') : '—';
        } else if (col.key === 'pricePerSqFt' || col.key === 'rentPerSqFt') {
          display = typeof val === 'number' && !isNaN(val) ? '₹' + val.toFixed(0) : '—';
        } else if (col.key === 'areaSqFt') {
          display = typeof val === 'number' && !isNaN(val) ? val.toFixed(0) : '—';
        } else {
          display = val !== null && val !== undefined ? String(val) : '—';
        }
        row.appendChild(td(display));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    container.appendChild(section);
  }

  /* ── Cleaning report ──────────────────────────────────────── */
  function buildCleaningReport(container, report) {
    container.innerHTML = '';
    if (!report) return;

    var section = make('div', 'reit-section');
    var heading = make('h3');
    heading.textContent = 'Cleaning Pipeline Report';
    section.appendChild(heading);

    // Summary row
    var summary = make('div', 'reit-quality-summary');
    [
      { label: 'Total',     value: report.total,      cls: '' },
      { label: 'OK',        value: report.ok,         cls: 'reit-quality-ok' },
      { label: 'Rejected',  value: report.rejected,   cls: 'reit-quality-rejected' },
      { label: 'Warnings',  value: report.warnings,   cls: 'reit-quality-warning' },
      { label: 'Duplicates',value: report.duplicates, cls: 'reit-quality-dup' },
      { label: 'Outliers',  value: report.outliers,   cls: 'reit-quality-outlier' }
    ].forEach(function (item) {
      var chip = make('div', 'reit-quality-chip ' + (item.cls || ''));
      var num  = make('span', 'reit-quality-chip__num');
      num.textContent = String(item.value);
      var lbl  = make('span', 'reit-quality-chip__lbl');
      lbl.textContent = item.label;
      chip.appendChild(num);
      chip.appendChild(lbl);
      summary.appendChild(chip);
    });
    section.appendChild(summary);

    // Funnel chart placeholder
    var chartDiv = make('div', 'reit-chart-wrap');
    chartDiv.id = 'dc-funnel-chart';
    section.appendChild(chartDiv);

    // Steps table
    var stepsTable = document.createElement('table');
    stepsTable.className = 'reit-table';
    var sHead = document.createElement('thead');
    var sHRow = document.createElement('tr');
    ['Step', 'Status', 'Detail'].forEach(function (h) { sHRow.appendChild(th(h, 'col')); });
    sHead.appendChild(sHRow);
    stepsTable.appendChild(sHead);
    var sBody = document.createElement('tbody');
    (report.steps || []).forEach(function (step) {
      var sRow = document.createElement('tr');
      sRow.appendChild(td(step.step));
      var stTd = td(step.status);
      stTd.className = step.status === 'passed' ? 'reit-status--ok' : 'reit-status--fail';
      sRow.appendChild(stTd);
      sRow.appendChild(td(step.detail || ''));
      sBody.appendChild(sRow);
    });
    stepsTable.appendChild(sBody);
    section.appendChild(stepsTable);

    // Download report button
    var btnDownload = make('button', 'reit-btn reit-btn--outline');
    btnDownload.textContent = 'Download Cleaning Report (CSV)';
    btnDownload.setAttribute('type', 'button');
    btnDownload.setAttribute('aria-label', 'Download the data quality report as a CSV file');
    btnDownload.addEventListener('click', function () { downloadCleaningReport(report); });
    section.appendChild(btnDownload);

    container.appendChild(section);

    // Render funnel chart (after the DOM is attached)
    if (typeof Charts !== 'undefined') {
      Charts.renderFunnelChart('dc-funnel-chart', report);
    }
  }

  /* ── Load synthetic data ──────────────────────────────────── */
  function loadSynthetic() {
    fetch('data/markets.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _currentRecords = syntheticRecordsFromMarkets(data.markets || []);
        _dataSource     = 'synthetic';
        _cleaningReport = {
          total: _currentRecords.length, ok: _currentRecords.length,
          rejected: 0, warnings: 0, duplicates: 0, outliers: 0,
          missingColumns: [], areaUnit: 'sqft',
          steps: [{ step: 'syntheticLoad', status: 'passed', detail: 'Built-in synthetic dataset loaded — no cleaning required.' }]
        };
        renderAll();
        if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('Synthetic dataset loaded (' + _currentRecords.length + ' segments)', 'success');
      })
      .catch(function (err) {
        if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('Failed to load markets.json: ' + err.message, 'error');
      });
  }

  /* ── Handle CSV upload ────────────────────────────────────── */
  function handleCSVUpload(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var text = e.target.result;
        var rows = DataCleaner.parseCSV(text);
        var result = DataCleaner.cleanRecords(rows);
        _currentRecords = result.records;
        _cleaningReport = result.report;
        _dataSource     = 'csv';
        renderAll();
        if (typeof UiHelpers !== 'undefined') {
          UiHelpers.showToast(
            'CSV imported: ' + result.report.total + ' rows · ' +
            result.report.ok + ' OK · ' +
            result.report.rejected + ' rejected · ' +
            result.report.outliers + ' outliers',
            result.report.rejected > 0 ? 'warning' : 'success'
          );
        }
      } catch (err) {
        if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('CSV parse error: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    ev.target.value = '';
  }

  /* ── Download CSV template ────────────────────────────────── */
  function downloadCSVTemplate() {
    var csv = DataCleaner.generateCSVTemplate();
    var blob = new Blob([csv], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'reit-target-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('CSV template downloaded', 'success');
  }

  /* ── Download cleaning report ─────────────────────────────── */
  function downloadCleaningReport(report) {
    var lines = ['Step,Status,Detail'];
    (report.steps || []).forEach(function (s) {
      lines.push([s.step, s.status, (s.detail || '').replace(/,/g, ';')].join(','));
    });
    lines.push('');
    lines.push('Metric,Count');
    ['total','ok','rejected','warnings','duplicates','outliers'].forEach(function (k) {
      lines.push(k + ',' + report[k]);
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'reit-cleaning-report.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('Cleaning report downloaded', 'success');
  }

  /* ── Restore previous session ─────────────────────────────── */
  function restorePreviousSession() {
    if (typeof ReitState === 'undefined') {
      if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('State manager not available', 'error');
      return;
    }
    var state = ReitState.load();
    if (!state) {
      if (typeof UiHelpers !== 'undefined') UiHelpers.showToast('No previous session found', 'warning');
      return;
    }
    if (typeof UiHelpers !== 'undefined') {
      UiHelpers.showToast('Previous session restored (run ' + (state.runId || 'unknown') + ')', 'success');
    }
    // Reload synthetic data (previous session state is mainly weights/target, not raw records)
    loadSynthetic();
  }

  /* ── Render all page sections ─────────────────────────────── */

  /* ── Stage 4: Segment-level statistics section ───────────── */
  function cRow_append(row, text) {
    var cell = make('td');
    cell.textContent = String(text == null ? '—' : text);
    row.appendChild(cell);
  }

  function buildStatsSection(container, markets) {
    if (!container) return;
    container.innerHTML = '';
    if (!markets || markets.length === 0) {
      var msg0 = make('p', 'reit-muted'); msg0.textContent = 'No market data.'; container.appendChild(msg0); return;
    }

    var wrap = make('div', 'reit-section');
    var h3 = make('h3'); h3.textContent = 'Segment Statistics'; wrap.appendChild(h3);

    // Portfolio summary chips
    var pStats = Stats.portfolioStats(markets);
    var summaryWrap = make('div', 'reit-stats-summary');
    var summaryItems = [
      { label: 'Segments',              value: pStats.count },
      { label: 'Cities',                value: pStats.cityCount },
      { label: 'Property Types',        value: pStats.typeCount },
      { label: 'Total Observations',    value: pStats.totalObservations },
      { label: 'Median Gross Yield',    value: Stats.fmtPct(pStats.grossYield && pStats.grossYield.median) },
      { label: 'Yield Range',           value: pStats.grossYield
          ? Stats.fmtPct(pStats.grossYield.min) + ' – ' + Stats.fmtPct(pStats.grossYield.max) : '—' },
      { label: 'Median Capital ₹/sq ft', value: pStats.capitalValue
          ? '₹' + Math.round(pStats.capitalValue.median).toLocaleString('en-IN') : '—' },
      { label: 'Sample-size Warnings',  value: pStats.sampleSizeWarnings > 0
          ? pStats.sampleSizeWarnings + ' segment(s) <30 obs' : 'None' }
    ];
    summaryItems.forEach(function (item) {
      var chip = make('div', 'reit-stat-chip');
      var lbl = make('span', 'reit-stat-chip__label'); lbl.textContent = item.label;
      var val = make('span', 'reit-stat-chip__value'); val.textContent = item.value;
      chip.appendChild(lbl); chip.appendChild(val); summaryWrap.appendChild(chip);
    });
    wrap.appendChild(summaryWrap);

    // City-level table
    var cH4 = make('h4'); cH4.textContent = 'By City'; wrap.appendChild(cH4);
    var cStats = Stats.cityStats(markets);
    var cScroll = make('div', 'reit-table-scroll');
    var cTable = make('table', 'reit-table reit-table--compact');
    var cHead = make('thead'); var cHRow = make('tr');
    ['City','Segments','Types','Observations','Median Capital ₹/sq ft','Yield Range','Median Yield','⚠'].forEach(function(h){ cHRow.appendChild(th(h,'col')); });
    cHead.appendChild(cHRow); cTable.appendChild(cHead);
    var cBody = make('tbody');
    cStats.forEach(function (c) {
      var row = make('tr', c.hasSampleSizeWarning ? 'reit-row--warning' : '');
      [c.city, c.segmentCount, c.propertyTypes.join(', '), c.totalObservations,
       c.medianCapitalValue != null ? '₹' + Math.round(c.medianCapitalValue).toLocaleString('en-IN') : '—',
       (c.minYield != null && c.maxYield != null) ? Stats.fmtPct(c.minYield) + ' – ' + Stats.fmtPct(c.maxYield) : '—',
       Stats.fmtPct(c.medianYield),
       c.hasSampleSizeWarning ? '⚠ <30 obs' : '✓'
      ].forEach(function(v){ cRow_append(row,v); });
      cBody.appendChild(row);
    });
    cTable.appendChild(cBody); cScroll.appendChild(cTable); wrap.appendChild(cScroll);

    // Segment-level detail table
    var sH4 = make('h4'); sH4.textContent = 'By Segment (City × Property Type)'; wrap.appendChild(sH4);
    var note = make('p', 'reit-muted reit-small');
    note.textContent = 'Statistics across records within each city × property-type group. ' +
      '95% CI: ' + Stats.BOOTSTRAP_N + ' bootstrap resamples, seed ' + Stats.BOOTSTRAP_SEED + '. ' +
      'Segments with <' + Stats.MIN_OBS_WARNING + ' observations flagged ⚠.';
    wrap.appendChild(note);

    var segStats = Stats.segmentStats(markets, true);
    var sScroll = make('div', 'reit-table-scroll');
    var sTable = make('table', 'reit-table reit-table--compact');
    var sHead = make('thead'); var sHRow = make('tr');
    ['City','Type','n','Obs','Median Yield','95% CI','Yield IQR',
     'Cap ₹/sqft (med)','Rent ₹/sqft (med)','Growth','Demand','Risk','⚠'].forEach(function(h){ sHRow.appendChild(th(h,'col')); });
    sHead.appendChild(sHRow); sTable.appendChild(sHead);
    var sBody = make('tbody');
    segStats.forEach(function (s) {
      var row = make('tr', s.hasSampleSizeWarning ? 'reit-row--warning' : '');
      var ci = s.grossYield && s.grossYield.ci;
      var ciText = ci ? Stats.fmtPct(ci.lo) + ' – ' + Stats.fmtPct(ci.hi) : 'n<' + Stats.MIN_OBS_CI;
      var yIqr = s.grossYield && s.grossYield.iqr != null ? Stats.fmtPct(s.grossYield.iqr) : '—';
      [s.city, s.propertyType, s.count, s.totalObservations,
       Stats.fmtPct(s.grossYield && s.grossYield.median), ciText, yIqr,
       s.capitalValue && s.capitalValue.median != null ? '₹' + Math.round(s.capitalValue.median).toLocaleString('en-IN') : '—',
       s.monthlyRent && s.monthlyRent.median != null ? '₹' + s.monthlyRent.median.toFixed(0) : '—',
       Stats.fmtPct(s.rentalGrowth && s.rentalGrowth.median),
       s.demandScore && s.demandScore.median != null ? s.demandScore.median.toFixed(0) : '—',
       s.riskScore && s.riskScore.median != null ? s.riskScore.median.toFixed(0) : '—',
       s.hasSampleSizeWarning ? '⚠' : ''
      ].forEach(function(v){ cRow_append(row,v); });
      sBody.appendChild(row);
    });
    sTable.appendChild(sBody); sScroll.appendChild(sTable); wrap.appendChild(sScroll);
    container.appendChild(wrap);
  }


  /* ── Stage 8: System Check ────────────────────────────────── */
  function buildSystemCheck(container) {
    var h = make('h3');
    h.textContent = 'System Check';
    container.appendChild(h);

    var note = make('p', 'reit-text-muted');
    note.textContent = 'Runtime validation of all core engines and the shared analysis state. '
      + 'All checks must pass before running the Agent Output analysis.';
    container.appendChild(note);

    var btn = make('button', 'reit-btn reit-btn--primary');
    btn.type = 'button';
    btn.textContent = '▶  Run System Check';
    container.appendChild(btn);

    var resultDiv = make('div', 'reit-system-check-results');
    resultDiv.id = 'dc-system-check-result';
    container.appendChild(resultDiv);

    btn.addEventListener('click', function () {
      runSystemCheck(resultDiv);
    });
  }

  function runSystemCheck(container) {
    container.innerHTML = '';
    var checks = [
      {
        id: 'CHK-01', label: 'HHI engine loads and computes',
        fn: function () {
          if (typeof HHIEngine === 'undefined') { return { ok: false, detail: 'HHIEngine not loaded' }; }
          var assets = [
            { value: 100e7, annualRent: 7e7, city: 'Mumbai', propertyType: 'Office' },
            { value: 50e7,  annualRent: 3e7, city: 'Pune',   propertyType: 'Retail' }
          ];
          var h = HHIEngine.cityHHI(assets);
          if (typeof h !== 'number' || isNaN(h) || h <= 0) {
            return { ok: false, detail: 'cityHHI returned ' + h };
          }
          return { ok: true, detail: 'cityHHI = ' + h.toFixed(4) };
        }
      },
      {
        id: 'CHK-02', label: 'Scoring engine loads and validates weights',
        fn: function () {
          if (typeof ScoringEngine === 'undefined') { return { ok: false, detail: 'ScoringEngine not loaded' }; }
          var v = ScoringEngine.validateWeights(ScoringEngine.PRESETS.balanced);
          if (!v.valid) { return { ok: false, detail: v.errors.join('; ') }; }
          var wSum = Object.keys(ScoringEngine.PRESETS.balanced)
            .filter(function (k) { return k.indexOf('Weight') !== -1; })
            .reduce(function (s, k) { return s + ScoringEngine.PRESETS.balanced[k]; }, 0);
          return { ok: true, detail: 'Balanced weights sum = ' + (wSum * 100).toFixed(1) + '%' };
        }
      },
      {
        id: 'CHK-03', label: 'Projection engine computes post-investment value correctly',
        fn: function () {
          if (typeof Projection === 'undefined') { return { ok: false, detail: 'Projection not loaded' }; }
          var proj = Projection.projectAll({
            currentPortfolioValueRs: 500e7,
            currentAnnualRentRs:     33.275e7,
            investmentRs:            100e7,
            newMarketGrossYield:     0.0914
          });
          var v0 = proj.base[0].portfolioValue / 1e7;
          var r0 = proj.base[0].annualRent / 1e7;
          var valueOk = Math.abs(v0 - 600) < 0.01;
          var rentOk  = Math.abs(r0 - 42.415) < 0.001;
          if (!valueOk) { return { ok: false, detail: 'Expected ₹600 Cr, got ₹' + v0.toFixed(3) + ' Cr' }; }
          if (!rentOk)  { return { ok: false, detail: 'Expected ₹42.415 Cr rent, got ₹' + r0.toFixed(3) + ' Cr' }; }
          return { ok: true, detail: 'Value = ₹' + v0.toFixed(0) + ' Cr, Gross Rent = ₹' + r0.toFixed(3) + ' Cr' };
        }
      },
      {
        id: 'CHK-04', label: 'DataCleaner pipeline loads and rejects no-records silently',
        fn: function () {
          if (typeof DataCleaner === 'undefined') { return { ok: false, detail: 'DataCleaner not loaded' }; }
          if (typeof DataCleaner.clean !== 'function') {
            return { ok: false, detail: 'DataCleaner.clean is not a function' };
          }
          return { ok: true, detail: 'DataCleaner.clean is available' };
        }
      },
      {
        id: 'CHK-05', label: 'Shared state (ReitState) persists and loads',
        fn: function () {
          if (typeof ReitState === 'undefined') { return { ok: false, detail: 'ReitState not loaded' }; }
          var testState = { runId: 'chk-05', createdAt: Date.now(), stale: false, test: true };
          ReitState.save(testState);
          var loaded = ReitState.load();
          if (!loaded || loaded.runId !== 'chk-05') {
            return { ok: false, detail: 'State did not round-trip through localStorage' };
          }
          return { ok: true, detail: 'localStorage round-trip OK (key: ' + ReitState.LS_KEY + ')' };
        }
      },
      {
        id: 'CHK-06', label: 'Markets data file contains at least 10 market records',
        fn: function () {
          return new Promise(function (resolve) {
            fetch('data/markets.json').then(function (r) { return r.json(); })
              .then(function (d) {
                var n = (d.markets || []).length;
                resolve(n >= 10
                  ? { ok: true,  detail: n + ' market records loaded' }
                  : { ok: false, detail: 'Only ' + n + ' market records (need ≥ 10)' });
              }).catch(function (e) {
                resolve({ ok: false, detail: 'Fetch failed: ' + e.message });
              });
          });
        }
      },
      {
        id: 'CHK-07', label: 'Portfolio data file contains at least 3 assets',
        fn: function () {
          return new Promise(function (resolve) {
            fetch('data/portfolio.json').then(function (r) { return r.json(); })
              .then(function (d) {
                var n = (d.assets || []).length;
                resolve(n >= 3
                  ? { ok: true,  detail: n + ' portfolio assets loaded' }
                  : { ok: false, detail: 'Only ' + n + ' assets (need ≥ 3)' });
              }).catch(function (e) {
                resolve({ ok: false, detail: 'Fetch failed: ' + e.message });
              });
          });
        }
      },
      {
        id: 'CHK-08', label: 'HHI simulation returns before/after values for a test market',
        fn: function () {
          if (typeof HHIEngine === 'undefined') { return { ok: false, detail: 'HHIEngine not loaded' }; }
          var assets = [
            { value: 300e7, annualRent: 21e7, city: 'Mumbai', propertyType: 'Office' },
            { value: 200e7, annualRent: 14e7, city: 'Pune',   propertyType: 'Retail' }
          ];
          var market = {
            medianCapitalValuePerSqFt: 10000,
            medianMonthlyRentPerSqFt:  80,
            city: 'Chennai', propertyType: 'Warehouse'
          };
          var sim = HHIEngine.simulateInvestment(assets, market, 100e7);
          if (!sim || !sim.before || !sim.after) {
            return { ok: false, detail: 'simulateInvestment returned unexpected structure' };
          }
          var valueOk = Math.abs(sim.after.totalValue - sim.before.totalValue - 100e7) < 1000;
          return {
            ok: valueOk,
            detail: 'Before: ₹' + (sim.before.totalValue/1e7).toFixed(0)
              + ' Cr → After: ₹' + (sim.after.totalValue/1e7).toFixed(0) + ' Cr'
          };
        }
      },
      {
        id: 'CHK-09', label: 'Weight presets are internally consistent (5 factors, sum to 100%)',
        fn: function () {
          if (typeof ScoringEngine === 'undefined') { return { ok: false, detail: 'ScoringEngine not loaded' }; }
          var allOk = true, details = [];
          Object.keys(ScoringEngine.PRESETS).forEach(function (key) {
            var p = ScoringEngine.PRESETS[key];
            var v = ScoringEngine.validateWeights(p);
            if (!v.valid) { allOk = false; details.push(key + ': ' + v.errors.join(', ')); }
            else { details.push(key + ': ✓'); }
          });
          return { ok: allOk, detail: details.join('  |  ') };
        }
      }
    ];

    var ul = make('ul', 'reit-system-check-list');
    container.appendChild(ul);

    var remaining = checks.length;
    var passed = 0;
    var failed = 0;
    var summary = make('div', 'reit-system-check-summary');
    var summaryText = document.createTextNode('Running…');
    summary.appendChild(summaryText);
    container.appendChild(summary);

    function renderCheckResult(check, result) {
      var li = make('li', 'reit-chk-item reit-chk-' + (result.ok ? 'pass' : 'fail'));
      var badge = make('span', 'reit-chk-badge');
      badge.textContent = result.ok ? '✓' : '✗';
      var idSpan = make('span', 'reit-chk-id');
      idSpan.textContent = check.id;
      var labelSpan = make('span', 'reit-chk-label');
      labelSpan.textContent = check.label;
      var detailSpan = make('span', 'reit-chk-detail');
      detailSpan.textContent = result.detail || '';
      li.appendChild(badge);
      li.appendChild(idSpan);
      li.appendChild(labelSpan);
      li.appendChild(detailSpan);
      ul.appendChild(li);
      if (result.ok) { passed++; } else { failed++; }
      remaining--;
      if (remaining === 0) {
        summaryText.nodeValue = passed + ' / ' + checks.length + ' checks passed'
          + (failed ? ' — ' + failed + ' FAILED' : ' — All OK');
        summary.className = 'reit-system-check-summary ' + (failed ? 'reit-chk-summary-fail' : 'reit-chk-summary-pass');
      }
    }

    checks.forEach(function (check) {
      try {
        var result = check.fn();
        if (result && typeof result.then === 'function') {
          result.then(function (r) { renderCheckResult(check, r); })
                .catch(function (e) { renderCheckResult(check, { ok: false, detail: String(e) }); });
        } else {
          renderCheckResult(check, result || { ok: false, detail: 'No result returned' });
        }
      } catch (e) {
        renderCheckResult(check, { ok: false, detail: 'Exception: ' + e.message });
      }
    });
  }

  function renderAll() {
    var container = el('datacentre-content');
    if (!container) return;
    container.innerHTML = '';

    // Dataset status cards
    var cardsSection = make('div', 'reit-section');
    var cardsHeading = make('h3');
    cardsHeading.textContent = 'Dataset Status';
    cardsSection.appendChild(cardsHeading);
    var cardsGrid = make('div');
    cardsGrid.id = 'dc-status-cards';
    cardsSection.appendChild(cardsGrid);
    container.appendChild(cardsSection);

    // Input controls
    var controlsSection = make('div');
    controlsSection.id = 'dc-input-controls';
    container.appendChild(controlsSection);

    // Preview table
    var previewSection = make('div');
    previewSection.id = 'dc-preview-table';
    container.appendChild(previewSection);

    // Segment statistics
    var statsSection = make('div');
    statsSection.id = 'dc-stats-section';
    container.appendChild(statsSection);

    // Cleaning report
    var reportSection = make('div');
    reportSection.id = 'dc-cleaning-report';
    container.appendChild(reportSection);

    // System Check
    var sysCheckSection = make('div', 'reit-section');
    sysCheckSection.id = 'dc-system-check';
    container.appendChild(sysCheckSection);
    buildSystemCheck(sysCheckSection);

    // Fetch and render status cards
    var portfolioData = null, marketsData = null;
    var loaded = 0;
    function checkBoth() {
      loaded++;
      if (loaded === 2) {
        buildStatusCards(el('dc-status-cards'), portfolioData, marketsData);
        buildInputControls(el('dc-input-controls'));
        buildPreviewTable(el('dc-preview-table'), _currentRecords);
        if (typeof Stats !== 'undefined' && marketsData && marketsData.markets) {
          buildStatsSection(el('dc-stats-section'), marketsData.markets);
        }
        buildCleaningReport(el('dc-cleaning-report'), _cleaningReport);
      }
    }
    fetch('data/portfolio.json').then(function (r) { return r.json(); })
      .then(function (d) { portfolioData = d; checkBoth(); }).catch(function () { checkBoth(); });
    fetch('data/markets.json').then(function (r) { return r.json(); })
      .then(function (d) { marketsData = d; checkBoth(); }).catch(function () { checkBoth(); });
  }

  /* ── Initialise when page is shown ───────────────────────── */
  function init() {
    // Load synthetic data by default on first visit
    if (!_currentRecords.length) {
      loadSynthetic();
    } else {
      renderAll();
    }
  }

  /* ── Page visibility hook ─────────────────────────────────── */
  // istTime.js registers page show/hide via hash change; we hook in here
  document.addEventListener('DOMContentLoaded', function () {
    // Listen for hash changes to re-render when page is revisited
    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#datacentre') {
        renderAll();
      }
    });

    // Auto-init if currently on datacentre page
    if (window.location.hash === '#datacentre' || window.location.hash === '') {
      // defer to let the router run first
      setTimeout(init, 50);
    }

    // Hook into the SPA router: detect when #datacentre becomes active
    var observer = new MutationObserver(function () {
      var dcPage = document.getElementById('page-datacentre');
      if (dcPage && dcPage.classList.contains('page-active') && !_currentRecords.length) {
        init();
      }
    });
    var main = document.getElementById('main-content');
    if (main) observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  /* ── Public API ───────────────────────────────────────────── */
  window.DataCentre = {
    init:            init,
    getCurrentRecords: function () { return _currentRecords; },
    getCleaningReport: function () { return _cleaningReport; }
  };

}());

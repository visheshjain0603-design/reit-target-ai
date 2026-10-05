/**
 * dataCleaner.js — CSV cleaning pipeline for REIT Target AI
 *
 * NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo
 *
 * Pure functions only. No DOM, no fetch, no side-effects.
 * Dual CommonJS + browser-global export (matches hhi.js / scoringEngine.js pattern).
 *
 * Pipeline steps (applied in order):
 *   1. validateColumns   — required columns present, no duplicates
 *   2. standardiseNames  — trim/lowercase city/locality/propertyType
 *   3. convertUnits      — lakh/crore notation → plain numbers; area to sq ft
 *                          from an explicitly declared unit only (never inferred
 *                          from the size of the numbers)
 *   4. rejectImpossible  — negative/zero prices, area < 10, area > 100000
 *   5. detectDuplicates  — exact match on source+locality+propertyType+area+price
 *   6. flagOutliers      — 1.5×IQR within city+locality+propertyType group
 *
 * Every input row is kept in output. Rows are never silently deleted.
 * Flags: duplicateFlag (boolean), outlierFlag (boolean),
 *        validationStatus ("ok"|"rejected"|"warning"), exclusionReason (string|"")
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DataCleaner = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Required columns ─────────────────────────────────────── */
  /* The template's area column is areaSqFt (square feet). Two other explicit
   * forms are accepted in its place: areaSqM (square metres), or a generic
   * `area` column whose unit is given row by row in `areaUnit` or chosen once
   * by the user at import. The unit is never inferred from the numbers: a
   * 300 sq ft shop is a valid 300 sq ft property. */
  var REQUIRED_COLUMNS = [
    'city', 'locality', 'propertyType',
    'areaSqFt', 'askingPriceINR', 'monthlyRentINR'
  ];

  var AREA_COLUMNS = ['areaSqFt', 'areaSqM', 'area'];

  var OPTIONAL_COLUMNS = [
    'recordId', 'sourceName', 'sourceUrl', 'collectionDate',
    'datasetType', 'isSynthetic', 'listingType', 'areaSqM', 'area', 'areaUnit'
  ];

  /* ── Unit helpers ─────────────────────────────────────────── */
  /**
   * parseIndianNumber(val)
   * Converts strings like "50 lakh", "1.2 crore", "₹1,20,000" to a plain number.
   * Returns the numeric value or NaN if unparseable.
   */
  function parseIndianNumber(val) {
    if (typeof val === 'number') return val;
    if (val === null || val === undefined) return NaN;
    var s = String(val).trim().toLowerCase().replace(/,/g, '').replace(/₹/g, '').trim();
    var croreMatch = s.match(/^([\d.]+)\s*crore?s?$/);
    if (croreMatch) return parseFloat(croreMatch[1]) * 1e7;
    var lakhMatch = s.match(/^([\d.]+)\s*lakh?s?$/);
    if (lakhMatch) return parseFloat(lakhMatch[1]) * 1e5;
    return parseFloat(s);
  }

  /**
   * sqmToSqft(val) — square metres to square feet. 1 ft = 0.3048 m exactly, so
   * 1 m² = 1 / 0.3048² ft² = 10.7639104167… ft². Applied once, only to an area
   * explicitly declared in square metres.
   */
  var SQFT_PER_SQM = 1 / (0.3048 * 0.3048);
  function sqmToSqft(val) {
    return val * SQFT_PER_SQM;
  }

  /**
   * normaliseUnit(text) — 'sqft' | 'sqm' | null (not stated) | 'unknown'.
   */
  function normaliseUnit(text) {
    if (text === null || text === undefined) return null;
    var t = String(text).trim().toLowerCase().replace(/[\s_.\-]/g, '');
    if (!t) return null;
    if (/^(sqft|sqfeet|squarefeet|squarefoot|ft2|ft²|sft)$/.test(t)) return 'sqft';
    if (/^(sqm|sqmetre|sqmeter|sqmetres|sqmeters|squaremetres|squaremeters|squaremetre|squaremeter|m2|m²)$/.test(t)) return 'sqm';
    return 'unknown';
  }

  /**
   * splitArea(val) — number and any unit written after it ("1,200 sq ft", "100 sqm").
   */
  function splitArea(val) {
    if (typeof val === 'number') return { value: val, unit: null };
    if (val === null || val === undefined || String(val).trim() === '') return { value: NaN, unit: null };
    var m = String(val).trim().match(/^([\d,]*\.?\d+)\s*(.*)$/);
    if (!m) return { value: NaN, unit: null };
    return { value: parseFloat(m[1].replace(/,/g, '')), unit: m[2] ? normaliseUnit(m[2]) : null };
  }

  var UNIT_LABEL = { sqft: 'square feet', sqm: 'square metres' };
  function rowsWord(n) { return n + (n === 1 ? ' row' : ' rows'); }

  /**
   * resolveArea(row, chosenUnit) — the row's area in sq ft, from an explicit unit.
   * Returns { areaSqFt, sourceUnit, rawValue, problem }.
   */
  function resolveArea(row, chosenUnit) {
    function has(k) { return row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== ''; }
    function fromColumn(col, declared) {
      var p = splitArea(row[col]);
      if (p.unit === 'unknown') return { problem: col + ' value "' + row[col] + '" has an unrecognised unit' };
      if (p.unit && p.unit !== declared) {
        return { problem: 'area unit conflict: column ' + col + ' is ' + UNIT_LABEL[declared] +
                          ' but the value "' + row[col] + '" says ' + UNIT_LABEL[p.unit] };
      }
      return { value: p.value, unit: declared };
    }
    var cands = [];
    if (has('areaSqFt')) cands.push(fromColumn('areaSqFt', 'sqft'));
    if (has('areaSqM'))  cands.push(fromColumn('areaSqM', 'sqm'));
    if (has('area')) {
      var rowUnit = has('areaUnit') ? normaliseUnit(row.areaUnit) : null;
      var p = splitArea(row.area);
      if (rowUnit === 'unknown') cands.push({ problem: 'areaUnit "' + row.areaUnit + '" is not sqft or sqm' });
      else if (p.unit === 'unknown') cands.push({ problem: 'area value "' + row.area + '" has an unrecognised unit' });
      else {
        var declaredUnits = [rowUnit, p.unit, chosenUnit || null].filter(Boolean);
        var distinct = declaredUnits.filter(function (u, i) { return declaredUnits.indexOf(u) === i; });
        if (!distinct.length) {
          cands.push({ problem: 'area unit not stated: add an areaUnit column (sqft or sqm), write the unit after the number, or choose the unit when importing' });
        } else if (distinct.length > 1) {
          cands.push({ problem: 'area unit conflict: the row and the import setting declare both square feet and square metres' });
        } else {
          cands.push({ value: p.value, unit: distinct[0] });
        }
      }
    }
    if (!cands.length) return { areaSqFt: NaN, sourceUnit: null, rawValue: NaN, problem: 'no area given' };
    var bad = cands.filter(function (c) { return c.problem; });
    if (bad.length) return { areaSqFt: NaN, sourceUnit: null, rawValue: NaN, problem: bad[0].problem };
    var inSqFt = cands.map(function (c) { return c.unit === 'sqm' ? sqmToSqft(c.value) : c.value; });
    // Several area columns filled in the same row must describe the same floor area.
    for (var i = 1; i < inSqFt.length; i++) {
      if (!(Math.abs(inSqFt[i] - inSqFt[0]) <= 0.01 * Math.max(Math.abs(inSqFt[0]), 1))) {
        return { areaSqFt: NaN, sourceUnit: null, rawValue: NaN,
                 problem: 'area columns disagree: ' + cands.map(function (c) { return c.value + ' ' + UNIT_LABEL[c.unit]; }).join(' vs ') };
      }
    }
    return { areaSqFt: inSqFt[0], sourceUnit: cands[0].unit, rawValue: cands[0].value, problem: '' };
  }

  /* ── Step 1: validateColumns ──────────────────────────────── */
  function validateColumns(rows) {
    if (!rows || !rows.length) {
      return { ok: false, missingColumns: REQUIRED_COLUMNS, extraColumns: [] };
    }
    var keys = Object.keys(rows[0]);
    var hasArea = AREA_COLUMNS.some(function (c) { return keys.indexOf(c) !== -1; });
    var missing = REQUIRED_COLUMNS.filter(function (c) {
      return c === 'areaSqFt' ? !hasArea : keys.indexOf(c) === -1;
    }).map(function (c) { return c === 'areaSqFt' ? 'areaSqFt (or areaSqM, or area with areaUnit)' : c; });
    var known = REQUIRED_COLUMNS.concat(OPTIONAL_COLUMNS);
    var extra = keys.filter(function (k) { return known.indexOf(k) === -1; });
    return { ok: missing.length === 0, missingColumns: missing, extraColumns: extra };
  }

  /* ── Step 2: standardiseNames ─────────────────────────────── */
  function standardiseNames(row) {
    var r = Object.assign({}, row);
    if (r.city)         r.city         = String(r.city).trim();
    if (r.locality)     r.locality     = String(r.locality).trim();
    if (r.propertyType) r.propertyType = String(r.propertyType).trim();
    // Normalise property type casing
    var pt = (r.propertyType || '').toLowerCase();
    if (pt === 'commercial office' || pt === 'office') r.propertyType = 'Commercial Office';
    else if (pt === 'retail')                          r.propertyType = 'Retail';
    else if (pt === 'residential')                     r.propertyType = 'Residential';
    return r;
  }

  /* ── Step 3: convertUnits ─────────────────────────────────── */
  function convertUnits(row, chosenUnit) {
    var r = Object.assign({}, row);
    var a = resolveArea(row, chosenUnit);
    r._rawArea = a.rawValue;
    r.areaSourceUnit = a.sourceUnit;
    r.areaSqFt = a.areaSqFt;
    r._areaProblem = a.problem;
    r.askingPriceINR  = parseIndianNumber(r.askingPriceINR);
    r.monthlyRentINR  = parseIndianNumber(r.monthlyRentINR);
    // Derived fields
    if (!isNaN(r.askingPriceINR) && !isNaN(r.areaSqFt) && r.areaSqFt > 0) {
      r.pricePerSqFt = r.askingPriceINR / r.areaSqFt;
    } else {
      r.pricePerSqFt = NaN;
    }
    if (!isNaN(r.monthlyRentINR) && !isNaN(r.areaSqFt) && r.areaSqFt > 0) {
      r.rentPerSqFt = r.monthlyRentINR / r.areaSqFt;
    } else {
      r.rentPerSqFt = NaN;
    }
    return r;
  }

  /* ── Step 4: rejectImpossible ─────────────────────────────── */
  function rejectImpossible(row) {
    var r = Object.assign({}, row);
    var reasons = [];
    if (r._areaProblem)                                reasons.push(r._areaProblem);
    else if (isNaN(r.areaSqFt) || r.areaSqFt < 10)     reasons.push('areaSqFt < 10');
    if (r.areaSqFt > 100000)                          reasons.push('areaSqFt > 100000');
    if (isNaN(r.askingPriceINR) || r.askingPriceINR <= 0) reasons.push('askingPriceINR ≤ 0');
    if (isNaN(r.monthlyRentINR) || r.monthlyRentINR <= 0) reasons.push('monthlyRentINR ≤ 0');
    r.validationStatus = reasons.length ? 'rejected' : (r.validationStatus || 'ok');
    r.exclusionReason  = reasons.join('; ');
    return r;
  }

  /* ── Step 5: detectDuplicates ─────────────────────────────── */
  function detectDuplicates(rows) {
    var seen = {};
    return rows.map(function (row) {
      var r = Object.assign({}, row);
      var key = [
        (r.sourceName || ''), (r.locality || ''), (r.propertyType || ''),
        Math.round(r.areaSqFt || 0), Math.round(r.askingPriceINR || 0)
      ].join('|').toLowerCase();
      if (seen[key]) {
        r.duplicateFlag = true;
        if (r.validationStatus !== 'rejected') r.validationStatus = 'warning';
        r.exclusionReason = (r.exclusionReason ? r.exclusionReason + '; ' : '') + 'duplicate';
      } else {
        r.duplicateFlag = false;
        seen[key] = true;
      }
      return r;
    });
  }

  /* ── Step 6: flagOutliers (1.5×IQR) ──────────────────────── */
  function quantile(sorted, q) {
    var idx = q * (sorted.length - 1);
    var lo  = Math.floor(idx);
    var hi  = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function flagOutliers(rows) {
    // Group by city + locality + propertyType
    var groups = {};
    rows.forEach(function (row, i) {
      var key = [(row.city || ''), (row.locality || ''), (row.propertyType || '')].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push({ idx: i, price: row.pricePerSqFt });
    });

    var outlierSet = {};
    Object.keys(groups).forEach(function (key) {
      var grp = groups[key].filter(function (g) { return !isNaN(g.price) && g.price > 0; });
      if (grp.length < 4) return; // too few to detect outliers
      var sorted = grp.map(function (g) { return g.price; }).sort(function (a, b) { return a - b; });
      var q1 = quantile(sorted, 0.25);
      var q3 = quantile(sorted, 0.75);
      var iqr = q3 - q1;
      var lo  = q1 - 1.5 * iqr;
      var hi  = q3 + 1.5 * iqr;
      grp.forEach(function (g) {
        if (g.price < lo || g.price > hi) outlierSet[g.idx] = true;
      });
    });

    return rows.map(function (row, i) {
      var r = Object.assign({}, row);
      r.outlierFlag = !!outlierSet[i];
      if (r.outlierFlag && r.validationStatus !== 'rejected') {
        r.validationStatus = 'warning';
        r.exclusionReason  = (r.exclusionReason ? r.exclusionReason + '; ' : '') + 'outlier (1.5×IQR)';
      }
      return r;
    });
  }

  /* ── Main pipeline ────────────────────────────────────────── */
  /**
   * cleanRecords(rows, options)
   *
   * @param {Object[]} rows - raw parsed CSV rows (all fields as strings)
   * @param {Object} [options] - { areaUnit: 'sqft' | 'sqm' } — the unit chosen by
   *   the user for a generic `area` column whose rows do not state one
   * @returns {Object} { records, report }
   *   records  — cleaned array (never shorter than input)
   *   report   — { total, ok, rejected, warnings, duplicates, outliers,
   *                missingColumns, areaUnit, steps[] }
   */
  function cleanRecords(rows, options) {
    var chosenUnit = options && options.areaUnit ? normaliseUnit(options.areaUnit) : null;
    if (chosenUnit === 'unknown') chosenUnit = null;
    if (!rows || !rows.length) {
      return {
        records: [],
        report: { total: 0, ok: 0, rejected: 0, warnings: 0, duplicates: 0, outliers: 0,
                  missingColumns: [], areaUnit: 'sqft', steps: [] }
      };
    }

    var colCheck = validateColumns(rows);
    if (!colCheck.ok) {
      return {
        records: rows,
        report: {
          total: rows.length, ok: 0, rejected: rows.length, warnings: 0,
          duplicates: 0, outliers: 0,
          missingColumns: colCheck.missingColumns, areaUnit: 'sqft', steps: [
            { step: 'validateColumns', status: 'failed', detail: 'Missing: ' + colCheck.missingColumns.join(', ') }
          ]
        }
      };
    }

    var steps = [{ step: 'validateColumns', status: 'passed', detail: 'All required columns present' }];

    // Step 2: standardise names
    var records = rows.map(standardiseNames);
    steps.push({ step: 'standardiseNames', status: 'passed', detail: 'City/locality/type trimmed and normalised' });

    // Step 3: convert units — each row's area from its explicitly declared unit
    records = records.map(function (r) { return convertUnits(r, chosenUnit); });
    var units = records.map(function (r) { return r.areaSourceUnit; }).filter(Boolean);
    var sqmRows = units.filter(function (u) { return u === 'sqm'; }).length;
    var areaUnit = !units.length ? 'none' : (sqmRows === 0 ? 'sqft' : (sqmRows === units.length ? 'sqm' : 'mixed'));
    var unitProblems = records.filter(function (r) { return r._areaProblem; }).length;
    steps.push({ step: 'convertUnits', status: 'passed',
      detail: 'Area units as declared (never inferred): ' + rowsWord(units.length - sqmRows) + ' in sq ft, ' + sqmRows +
              ' in sq m converted once (1 m² = 10.7639 sq ft)' + (unitProblems ? '; ' + rowsWord(unitProblems) + ' with a missing or conflicting unit' : '') +
              '; Indian number notation parsed' });

    // Step 4: reject impossible values
    records = records.map(rejectImpossible);
    var rejectedCount = records.filter(function (r) { return r.validationStatus === 'rejected'; }).length;
    steps.push({ step: 'rejectImpossible', status: 'passed', detail: rejectedCount + ' rows rejected (impossible values)' });

    // Step 5: detect duplicates
    records = detectDuplicates(records);
    var dupCount = records.filter(function (r) { return r.duplicateFlag; }).length;
    steps.push({ step: 'detectDuplicates', status: 'passed', detail: dupCount + ' duplicate rows flagged' });

    // Step 6: flag outliers
    records = flagOutliers(records);
    var outlierCount = records.filter(function (r) { return r.outlierFlag; }).length;
    steps.push({ step: 'flagOutliers', status: 'passed', detail: outlierCount + ' outlier rows flagged (1.5×IQR)' });

    // Add provenance defaults for missing fields
    records = records.map(function (r, i) {
      var out = Object.assign({}, r);
      if (!out.recordId)        out.recordId        = 'CSV-' + String(i + 1).padStart(4, '0');
      if (!out.sourceName)      out.sourceName       = 'CSV Import';
      if (!out.sourceUrl)       out.sourceUrl        = '';
      if (!out.collectionDate)  out.collectionDate   = new Date().toISOString().slice(0, 10);
      if (!out.datasetType)     out.datasetType      = 'csv-import';
      if (out.isSynthetic === undefined) out.isSynthetic = false;
      if (!out.listingType)     out.listingType      = 'unknown';
      if (!out.validationStatus) out.validationStatus = 'ok';
      if (!out.exclusionReason)  out.exclusionReason  = '';
      delete out._areaProblem;
      return out;
    });

    var okCount      = records.filter(function (r) { return r.validationStatus === 'ok'; }).length;
    var warnCount    = records.filter(function (r) { return r.validationStatus === 'warning'; }).length;

    return {
      records: records,
      report: {
        total:          records.length,
        ok:             okCount,
        rejected:       rejectedCount,
        warnings:       warnCount,
        duplicates:     dupCount,
        outliers:       outlierCount,
        missingColumns: [],
        areaUnit:       areaUnit,
        steps:          steps
      }
    };
  }

  /* ── CSV parser (RFC 4180, handles quoted fields) ─────────── */
  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];

    function parseLine(line) {
      var fields = [];
      var i = 0;
      while (i < line.length) {
        if (line[i] === '"') {
          var j = i + 1;
          var field = '';
          while (j < line.length) {
            if (line[j] === '"' && line[j + 1] === '"') { field += '"'; j += 2; }
            else if (line[j] === '"') { j++; break; }
            else { field += line[j]; j++; }
          }
          fields.push(field);
          if (line[j] === ',') j++;
          i = j;
        } else {
          var end = line.indexOf(',', i);
          if (end === -1) { fields.push(line.slice(i).trim()); break; }
          fields.push(line.slice(i, end).trim());
          i = end + 1;
        }
      }
      return fields;
    }

    var headers = parseLine(lines[0]);
    var rows = [];
    for (var li = 1; li < lines.length; li++) {
      var vals = parseLine(lines[li]);
      if (vals.length === 0) continue;
      var row = {};
      headers.forEach(function (h, idx) { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
      rows.push(row);
    }
    return rows;
  }

  /* ── CSV template generator ───────────────────────────────── */
  function generateCSVTemplate() {
    var cols = REQUIRED_COLUMNS.concat(OPTIONAL_COLUMNS);
    var header = cols.join(',');
    var example = [
      'CSV-0001', 'PropEquity', 'https://example.com', '2026-09-01',
      'transaction', 'false', 'sale',
      'Mumbai', 'BKC', 'Commercial Office',
      '5000', '75000000', '350000'
    ];
    // Pad/trim to col length (required cols first, then optional)
    var required_example = ['Mumbai', 'BKC', 'Commercial Office', '5000', '75000000', '350000'];
    var optional_example = ['CSV-0001', 'PropEquity', 'https://example.com', '2026-09-01', 'transaction', 'false', 'sale'];
    var full = required_example.concat(optional_example);
    // Reorder to match cols order
    var exampleRow = cols.map(function (c) {
      var ri = REQUIRED_COLUMNS.indexOf(c);
      var oi = OPTIONAL_COLUMNS.indexOf(c);
      if (ri !== -1) return required_example[ri] || '';
      if (oi !== -1) return optional_example[oi] || '';
      return '';
    });
    return header + '\n' + exampleRow.join(',');
  }

  /* ── Public API ───────────────────────────────────────────── */
  return {
    REQUIRED_COLUMNS:   REQUIRED_COLUMNS,
    OPTIONAL_COLUMNS:   OPTIONAL_COLUMNS,
    parseCSV:           parseCSV,
    validateColumns:    validateColumns,
    cleanRecords:       cleanRecords,
    generateCSVTemplate: generateCSVTemplate,
    /* Exposed for tests */
    _parseIndianNumber: parseIndianNumber,
    AREA_COLUMNS:       AREA_COLUMNS,
    SQFT_PER_SQM:       SQFT_PER_SQM,
    _sqmToSqft:         sqmToSqft,
    _resolveArea:       resolveArea,
    _normaliseUnit:     normaliseUnit,
    _flagOutliers:      flagOutliers,
    _detectDuplicates:  detectDuplicates
  };
}));

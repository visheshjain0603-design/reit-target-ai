/**
 * report.js — Decision Report page controller for REIT Target AI
 *
 * NMIMS B.Sc. Finance | BA Project Theme 4 | Academic Demo
 *
 * Renders the #report page:
 *   - Printable "Investment Decision Report" covering the full analysis chain
 *   - Portfolio summary, market screening results, diversification (HHI),
 *     scenario projections, agent recommendations
 *   - Print/PDF via window.print()
 *
 * All text is set via textContent — no innerHTML with user data.
 */

(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────────── */
  function el(id)  { return document.getElementById(id); }

  /* AppMeta is the project's single source of labels and counts. Fall back to
   * the bare minimum rather than throwing, so a missing script tag degrades
   * the report's cover rather than blanking the whole page. */
  function meta() {
    if (typeof AppMeta !== 'undefined') { return AppMeta; }
    return {
      PROJECT: { appName: 'REIT Target AI', author: '—', methodologyVersion: '—' },
      attribution: function () { return 'Academic demonstration'; },
      cr: fmtCr,
      num: function (n) { return String(n); }
    };
  }

  function make(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function txt(tag, text, cls) {
    var e = make(tag, cls);
    e.textContent = String(text === null || text === undefined ? '—' : text);
    return e;
  }

  function fmtCr(rs)  {
    return typeof rs === 'number' && !isNaN(rs) ? '₹' + (rs / 1e7).toFixed(2) + ' Cr' : '—';
  }
  function fmtPct(d)  {
    return typeof d === 'number' && !isNaN(d) ? (d * 100).toFixed(2) + '%' : '—';
  }
  function fmtCr3(rs) {
    return typeof rs === 'number' && !isNaN(rs) ? '₹' + (rs / 1e7).toFixed(3) + ' Cr' : '—';
  }
  function weightsLine(w) {
    return 'Yield ' + Math.round(w.yieldWeight * 100) + '% / Growth ' + Math.round(w.growthWeight * 100) +
      '% / Diversification ' + Math.round(w.diversWeight * 100) + '% / Demand ' +
      Math.round(w.demandWeight * 100) + '% / Risk ' + Math.round(w.riskWeight * 100) + '%';
  }

  /* One screening table: raw rank, eligibility, support grade, simulated
   * observations, external calibration and the exclusion reason on every row,
   * so the reader never has to infer why a top scorer was not shortlisted. */
  function screeningTable(title, list, run, id) {
    var wrap = make('div', 'reit-report__table-block');
    var h = make('h4', 'reit-report__sub-heading');
    h.id = id + '-h';
    h.textContent = title;
    wrap.appendChild(h);
    var table = document.createElement('table');
    table.className = 'reit-table reit-report__screen-table';
    table.id = id;
    table.setAttribute('aria-labelledby', h.id);
    var thead = document.createElement('thead');
    var hrow = document.createElement('tr');
    ['Raw rank', 'Eligible rank', 'Market', 'Type', 'Score', 'Gross Yield', 'Screen',
     'Support grade', 'Sim. obs.', 'External calibration', 'Exclusion reason', 'Role'].forEach(function (t) {
      var th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = t;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    list.forEach(function (m) {
      var g = m.governance;
      var role = m.marketId === run.selectedTargetId
        ? (run.selectionMode === 'manual' ? 'Manually selected target' : 'Shortlist candidate · selected')
        : m.marketId === run.recommendedCandidateId ? 'Shortlist candidate (model)'
        : m.marketId === run.highestRawScoreMarketId ? 'Highest raw-score market' : '—';
      var tr = document.createElement('tr');
      if (m.marketId === run.selectedTargetId) { tr.className = 'reit-report__selected-row'; }
      [String(m.rank), m.eligibleRank ? String(m.eligibleRank) : '—',
       AnalysisRun.name(m), m.propertyType, m.totalScore.toFixed(2), fmtPct(m.grossYield),
       g.eligible ? '✓ Passes' : '✗ Fails', m.confidenceGrade || '—', String(m.observationCount),
       m.externalCalibrationStatus, g.eligible ? '—' : g.reasons.join('; '), role
      ].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var scroll = make('div', 'reit-table-scroll');
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    return wrap;
  }

  function fmtHHI(v)  {
    if (typeof v !== 'number' || isNaN(v)) return '—';
    var label = v < 0.15 ? 'Diversified' : (v < 0.25 ? 'Moderate' : 'Concentrated');
    return v.toFixed(3) + ' (' + label + ')';
  }

  function today() {
    return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ── Section builder helpers ──────────────────────────────── */
  function sectionHeading(num, text) {
    var h = make('h2', 'reit-report__section-heading');
    h.textContent = num + '. ' + text;
    return h;
  }

  function kvRow(label, value, container) {
    var row = make('div', 'reit-report__kv-row');
    row.appendChild(txt('span', label, 'reit-report__kv-label'));
    row.appendChild(txt('span', value, 'reit-report__kv-value'));
    container.appendChild(row);
  }

  function disclaimer(text, container) {
    var d = make('p', 'reit-report__disclaimer');
    d.textContent = text;
    container.appendChild(d);
  }

  /* ── Build the report ─────────────────────────────────────── */
  function buildReport(container, run, agentOutputs) {
    container.innerHTML = '';

    // Cover
    var cover = make('div', 'reit-report__cover');
    cover.appendChild(txt('h1', 'REIT Target AI — Investment Decision Report', 'reit-report__title'));
    /* Identity comes from AppMeta so the cover, the footer, the page titles and
     * the documentation cannot name different institutions — which is exactly
     * what happened when an earlier revision carried SPJIMR in some files and
     * NMIMS in others. */
    cover.appendChild(txt('p', meta().attribution() + ' — Academic Demonstration', 'reit-report__subtitle'));
    cover.appendChild(txt('p', 'Author: ' + meta().PROJECT.author, 'reit-report__subtitle'));
    cover.appendChild(txt('p', 'Report date: ' + today(), 'reit-report__date'));
    cover.appendChild(txt('p', 'This report is generated from a SYNTHETIC dataset and is for academic demonstration only. It does not constitute investment advice.', 'reit-report__banner-disclaimer'));
    container.appendChild(cover);

    // Print button (hidden in print)
    var printBar = make('div', 'reit-report__print-bar no-print');
    var printBtn = make('button', 'reit-btn reit-btn--primary');
    printBtn.textContent = 'Print / Save as PDF';
    printBtn.setAttribute('type', 'button');
    printBtn.addEventListener('click', function () { window.print(); });
    printBar.appendChild(printBtn);

    var pdfNote = make('span', 'reit-report__pdf-note');
    pdfNote.textContent = '  To save as PDF: choose "Save as PDF" in your browser\'s print dialog.';
    printBar.appendChild(pdfNote);
    container.appendChild(printBar);

    /* ── § 1  Analysis Summary ── */
    var s1 = make('section', 'reit-report__section');
    s1.appendChild(sectionHeading(1, 'Analysis Summary'));
    var target = run ? AnalysisRun.selected(run) : null;
    var rec    = run ? AnalysisRun.recommended(run) : null;
    if (run) {
      kvRow('Portfolio', (run.portfolio.source === 'custom' ? 'Custom' : 'Sample') + ' — ' +
            run.portfolio.assetCount + ' holdings, ' + fmtCr(run.portfolio.totalValueRs) +
            ', weighted gross yield ' + fmtPct(run.portfolio.weightedYield), s1);
      kvRow('Market Segments Screened', String(run.ranked.length), s1);
      kvRow('Investment Amount', fmtCr(run.investmentRs), s1);
      kvRow('Weight Preset', run.presetLabel + ' — ' + weightsLine(run.weights), s1);
      kvRow('Selection Mode', run.selectionMode === 'manual'
            ? 'Manual — the target below was chosen by the user'
            : 'Automatic — the target is the shortlist candidate', s1);
      kvRow('Simulation-Support Screen', run.governanceOverride
            ? 'Ignored by the user — the candidate is the highest raw-score market'
            : 'Applied: ' + Governance.rules().rule, s1);

      var sub = make('h4', 'reit-report__sub-heading');
      sub.textContent = 'Model recommendation and selected target';
      s1.appendChild(sub);
      kvRow('Shortlist Candidate (model)', rec
            ? AnalysisRun.name(rec) + ' — raw rank ' + rec.rank + ', eligible rank ' + rec.eligibleRank +
              ', score ' + rec.totalScore.toFixed(2)
            : 'None — no segment passes the simulation-support screen', s1);
      kvRow(run.selectionMode === 'manual' ? 'Manually Selected Target' : 'Selected Target',
            target ? AnalysisRun.name(target) + ' (' + target.propertyType + ') — raw rank ' + target.rank +
              (target.eligibleRank ? ', eligible rank ' + target.eligibleRank : ', fails the screen') : '—', s1);
      if (run.selectionDiffers) {
        kvRow('Note', 'The manually selected target differs from the shortlist candidate. Sections 3 and 4 ' +
              'analyse the manually selected target.', s1);
      }
      if (target) {
        kvRow('Target Composite Score', target.totalScore.toFixed(2) + ' / 100', s1);
        kvRow('Target Simulation Support', (target.governance.eligible ? 'Passes' : 'Fails') +
              ' the simulation-support screen — ' + target.observationCount + ' simulated observations, ' +
              'Assumption Support Grade ' + (target.confidenceGrade || '—') +
              (target.governance.eligible ? '' : ' (' + target.governance.reasons.join('; ') + ')'), s1);
        kvRow('Target External Calibration', target.externalCalibrationStatus +
              ' — no cited source document has been located or traced', s1);
      }
      kvRow('Selection Basis', run.governanceNote, s1);
      disclaimer(AppMeta.CANDIDATE_CAVEAT, s1);
    } else {
      s1.appendChild(txt('p', 'The analysis has not loaded.', 'reit-text-muted'));
    }
    disclaimer('Portfolio data is entirely synthetic. Values represent no real assets, tenants or financial positions.', s1);
    container.appendChild(s1);

    /* ── § 2  Market Screening ── */
    var s2 = make('section', 'reit-report__section');
    s2.appendChild(sectionHeading(2, 'Market Screening Results'));
    if (run) {
      s2.appendChild(txt('p', 'Two tables, because they answer different questions. The first is the top of ' +
        'the attractiveness ranking; the second is the top of the segments that pass the simulation-support ' +
        'screen, which is where the shortlist candidate comes from. External calibration is Unverified for ' +
        'every segment.', 'reit-text-muted'));
      s2.appendChild(screeningTable('Top 3 by raw attractiveness score', AnalysisRun.rawTop(run, 3), run, 'rpt-raw-top3'));
      s2.appendChild(screeningTable('Top eligible shortlist (passing the simulation-support screen)',
        AnalysisRun.eligibleTop(run, 3), run, 'rpt-eligible-top3'));
      var inEither = AnalysisRun.rawTop(run, 3).concat(AnalysisRun.eligibleTop(run, 3))
        .some(function (m) { return target && m.marketId === target.marketId; });
      if (target && !inEither) {
        s2.appendChild(screeningTable('Selected target', [target], run, 'rpt-selected-row'));
      }
    } else {
      s2.appendChild(txt('p', 'No ranked markets available.', 'reit-text-muted'));
    }
    disclaimer('Scores use the ' + (run ? run.presetLabel : 'Balanced') + ' weight preset. All data is synthetic.', s2);
    container.appendChild(s2);

    /* ── § 3  Diversification (HHI) ── */
    var s3 = make('section', 'reit-report__section');
    s3.appendChild(sectionHeading(3, 'Portfolio Diversification (HHI) — ' +
      (target ? AnalysisRun.name(target) : 'no target')));
    if (run && run.hhi) {
      var grid = make('div', 'reit-report__hhi-grid');
      [
        { label: 'City HHI — Before',       value: fmtHHI(run.hhi.cityBefore) },
        { label: 'City HHI — After',         value: fmtHHI(run.hhi.cityAfter)  },
        { label: 'Asset-Type HHI — Before',  value: fmtHHI(run.hhi.typeBefore) },
        { label: 'Asset-Type HHI — After',   value: fmtHHI(run.hhi.typeAfter)  }
      ].forEach(function (item) { kvRow(item.label, item.value, grid); });
      s3.appendChild(grid);
    } else {
      s3.appendChild(txt('p', 'No selected target, so no concentration effect to report.', 'reit-text-muted'));
    }
    disclaimer('HHI thresholds: <0.15 = Diversified, 0.15–0.25 = Moderate, >0.25 = Concentrated. Descriptive benchmarks only — not regulatory thresholds.', s3);
    container.appendChild(s3);

    /* ── § 4  Scenario Projections ── */
    var s4 = make('section', 'reit-report__section');
    s4.appendChild(sectionHeading(4, 'Scenario Projections'));
    if (run && run.projections && typeof Projection !== 'undefined') {
      var summary = run.projections.summary3y;

      var assumpNote = make('p', 'reit-text-muted');
      assumpNote.textContent = 'Projected over a 3-year horizon from the post-investment '
        + 'portfolio value. Year 0 annual rent = existing portfolio rent ' + fmtCr3(run.projections.params.currentAnnualRentRs)
        + ' + the selected target\'s estimated rent at its own gross yield ' + fmtCr3(run.projections.targetAnnualRentRs)
        + ' = ' + fmtCr3(run.projections.year0AnnualRentRs) + '. Two yields are shown and they answer '
        + 'different questions: Gross Yield is rent ÷ value and ignores vacancy by '
        + 'definition, while Effective Yield applies the scenario\'s occupancy rate, so it '
        + 'is the figure the occupancy assumption actually affects. Neither deducts fees, '
        + 'tax or transaction costs. These are the same figures the Diversification page shows.';
      s4.appendChild(assumpNote);

      var projTable = document.createElement('table');
      projTable.className = 'reit-table';
      projTable.id = 'rpt-projections';
      var pcap = document.createElement('caption');
      pcap.className = 'reit-table-caption';
      pcap.textContent = 'Three-year projections for ' + (target ? AnalysisRun.name(target) : '—');
      projTable.appendChild(pcap);
      var pthead = document.createElement('thead');
      var phrow  = document.createElement('tr');
      ['Scenario', 'Portfolio Value (3yr)', 'Annual Rent (3yr)', 'Gross Yield (3yr)',
       'Effective Yield (3yr)', 'Value Change'].forEach(function (h) {
        var th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = h;
        phrow.appendChild(th);
      });
      pthead.appendChild(phrow);
      projTable.appendChild(pthead);

      var ptbody = document.createElement('tbody');
      ['conservative', 'base', 'optimistic'].forEach(function (key) {
        var s = summary[key];
        var row = document.createElement('tr');
        [
          Projection.SCENARIOS[key].label,
          fmtCr(s.portfolioValue),
          fmtCr(s.annualRent),
          fmtPct(s.grossYield),
          fmtPct(s.effectiveGrossYield),
          (s.changeValuePct >= 0 ? '+' : '') + s.changeValuePct.toFixed(1) + '%'
        ].forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = v;
          row.appendChild(td);
        });
        ptbody.appendChild(row);
      });
      projTable.appendChild(ptbody);
      s4.appendChild(projTable);

      // Assumptions table
      var assumpHeading = make('h4', 'reit-report__sub-heading');
      assumpHeading.textContent = 'Scenario Assumptions';
      s4.appendChild(assumpHeading);
      var assumpTable = document.createElement('table');
      assumpTable.className = 'reit-table';
      var athead = document.createElement('thead');
      var ahrow  = document.createElement('tr');
      ['Scenario', 'Rental Growth', 'Capital Growth', 'Occupancy', 'Description'].forEach(function (h) {
        var th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = h;
        ahrow.appendChild(th);
      });
      athead.appendChild(ahrow);
      assumpTable.appendChild(athead);
      var atbody = document.createElement('tbody');
      Object.keys(Projection.SCENARIOS).forEach(function (key) {
        var sc = Projection.SCENARIOS[key];
        var row = document.createElement('tr');
        [
          sc.label,
          fmtPct(sc.rentalGrowth),
          fmtPct(sc.capitalGrowth),
          fmtPct(sc.occupancy),
          sc.description
        ].forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = v;
          row.appendChild(td);
        });
        atbody.appendChild(row);
      });
      assumpTable.appendChild(atbody);
      s4.appendChild(assumpTable);
    } else {
      s4.appendChild(txt('p', 'Projection engine not available or no portfolio state found.', 'reit-text-muted'));
    }
    disclaimer('Projections apply flat growth rates to the whole portfolio; they are not '
      + 'derived from the target segment\'s own modelled growth. No leverage, tax or '
      + 'transaction fees are modelled, and vacancy enters only through the Effective Yield '
      + 'column. Not investment advice.', s4);
    container.appendChild(s4);

    /* ── § 5  Agent Commentary ── */
    var s5 = make('section', 'reit-report__section');
    s5.appendChild(sectionHeading(5, 'Agent Commentary'));
    /* Commentary is included only when it was produced for THIS run. Agent
     * output from a previous preset, amount or target is never printed beside
     * figures it does not describe. */
    var orch = agentOutputs && run && agentOutputs.scenarioKey === run.scenarioKey
      ? agentOutputs.orchestrator : null;
    if (orch && target) {
      kvRow('Selected Target', AnalysisRun.name(target) + ' (from the analysis, not the model)', s5);
      kvRow('Composite Score', target.totalScore.toFixed(2) + ' / 100', s5);
      kvRow('Gross Yield', fmtPct(target.grossYield), s5);
      if (agentOutputs._provenance && agentOutputs._provenance.orchestrator) {
        var provWord = { live: 'Live Gemini call made during this session for this exact run',
                         cache: 'Stored commentary whose scenario key matches this run exactly',
                         deterministic: 'No model commentary — deterministic figures only'
                       }[agentOutputs._provenance.orchestrator] || agentOutputs._provenance.orchestrator;
        kvRow('Commentary Provenance', provWord, s5);
      }
      [['Summary', orch.recommendationSummary], ['Screening Basis', orch.screeningBasis],
       ['Concentration Effect', orch.concentrationEffect], ['Next Steps', orch.nextSteps]
      ].forEach(function (pair) { if (pair[1]) { kvRow(pair[0], pair[1], s5); } });
      [['Key Strengths', orch.keyStrengths], ['Key Risks', orch.importantRisks]].forEach(function (pair) {
        if (!pair[1] || !pair[1].length) { return; }
        var hh = make('h4', 'reit-report__sub-heading');
        hh.textContent = pair[0];
        s5.appendChild(hh);
        var ul = make('ul', 'reit-report__list');
        pair[1].forEach(function (r) { var li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
        s5.appendChild(ul);
      });
      if (agentOutputs._checks && agentOutputs._checks.orchestrator && !agentOutputs._checks.orchestrator.ok) {
        disclaimer('Consistency check: ' + agentOutputs._checks.orchestrator.issues.length +
          ' statement(s) in this commentary did not match the deterministic figures; see the Agent Output page.', s5);
      }
    } else {
      s5.appendChild(txt('p', agentOutputs && agentOutputs.orchestrator
        ? 'The agent commentary in memory was produced for a different configuration, so it is not ' +
          'printed here. Open Agent Output to produce commentary for this run. Sections 1 to 4 do not depend on it.'
        : 'No agent commentary for this run. Open Agent Output to produce it. The deterministic analysis in ' +
          'sections 1 to 4 does not depend on it.', 'reit-text-muted'));
    }

    /*
     * The deterministic checks, reported separately from the agent commentary
     * because they are a different kind of claim. The commentary is a model's
     * description; these are arithmetic comparisons an examiner can redo by
     * hand from the figures in section 1.
     */
    if (run && run.validation) {
      var v = run.validation;
      var vh = make('h4', 'reit-report__sub-heading');
      vh.textContent = 'Deterministic Input Checks (performed in code, not by a model)';
      s5.appendChild(vh);
      kvRow('Result', v.summary, s5);
      var vTable = document.createElement('table');
      vTable.className = 'reit-table';
      var vThead = document.createElement('thead');
      var vHr = document.createElement('tr');
      ['Check', 'Result', 'What was compared'].forEach(function (h) {
        var th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = h;
        vHr.appendChild(th);
      });
      vThead.appendChild(vHr);
      vTable.appendChild(vThead);
      var vTbody = document.createElement('tbody');
      (v.checks || []).forEach(function (c) {
        var tr = document.createElement('tr');
        [c.label, c.passed ? 'Pass' : 'Fail', c.detail].forEach(function (cell) {
          var td = document.createElement('td');
          td.textContent = String(cell);
          tr.appendChild(td);
        });
        vTbody.appendChild(tr);
      });
      vTable.appendChild(vTbody);
      s5.appendChild(vTable);
    }

    disclaimer('Agent commentary is generated by Gemini on synthetic data. It interprets figures computed elsewhere; it neither verifies nor recalculates them, and it does not constitute investment advice.', s5);
    container.appendChild(s5);

    /* ── § 6  Limitations ── */
    var s6 = make('section', 'reit-report__section');
    s6.appendChild(sectionHeading(6, 'Known Limitations'));
    var limList = make('ul', 'reit-report__list');
    /* One list, in validator.js. This section previously carried its own copy,
     * so the report and the Agent Output page could state different limitations
     * for the same analysis. */
    var limits = (typeof Validator !== 'undefined' && Validator.LIMITATIONS)
      ? Validator.LIMITATIONS
      : ['All data is synthetic — no real portfolio, markets or transactions.'];
    limits.forEach(function (lim) {
      var li = document.createElement('li');
      li.textContent = lim;
      limList.appendChild(li);
    });
    s6.appendChild(limList);
    container.appendChild(s6);

    /* ── Footer ── */
    var footer = make('div', 'reit-report__footer');
    footer.appendChild(txt('p', meta().attribution() + ' | Academic demonstration only'));
    footer.appendChild(txt('p', 'Generated by ' + meta().PROJECT.appName +
      ' · scoring methodology ' + meta().PROJECT.methodologyVersion +
      ' · Gemini commentary on synthetic data'));
    container.appendChild(footer);
  }

  /* ── Agent outputs published by agents.js for the current run ── */
  function getAgentOutputs() {
    return typeof window._reitAgentOutputs !== 'undefined' ? window._reitAgentOutputs : null;
  }

  /* ── Render page ──────────────────────────────────────────── */
  function render() {
    var container = el('report-content');
    if (!container) return;
    var run = (typeof AnalysisRun !== 'undefined') ? AnalysisRun.current() : null;
    if (!run) {
      container.innerHTML = '';
      container.appendChild(txt('p', 'Loading the current analysis…', 'loading-msg'));
      return;
    }
    buildReport(container, run, getAgentOutputs());
  }

  /* The report re-renders on every change to the shared run, and whenever the
   * Agents page publishes new commentary. */
  function boot() {
    render();
    AnalysisRun.ready().then(render).catch(function (err) {
      var c = el('report-content');
      if (c) {
        c.innerHTML = '';
        var p = txt('p', 'Could not load the dataset: ' + err.message + '. Reload the page to try again.', 'error-msg');
        p.setAttribute('role', 'alert');
        c.appendChild(p);
      }
    });
    AnalysisRun.subscribe(render);
    document.addEventListener('reit:agent-outputs', render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ── Public API ───────────────────────────────────────────── */
  window.Report = { render: render };

}());

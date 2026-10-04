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
  function buildReport(container, state, agentOutputs) {
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

    /* ── § 1  Portfolio Summary ── */
    var s1 = make('section', 'reit-report__section');
    s1.appendChild(sectionHeading(1, 'Portfolio Summary'));
    if (state) {
      kvRow('Total Portfolio Value',      fmtCr((state.portfolioValueCr || 0) * 1e7), s1);
      // Composite score for selected target
      var selScore = '—';
      if (state.selectedTargetId && state.ranked && state.ranked.length) {
        for (var ssi = 0; ssi < state.ranked.length; ssi++) {
          if (state.ranked[ssi].marketId === state.selectedTargetId) {
            selScore = typeof state.ranked[ssi].totalScore === 'number'
              ? state.ranked[ssi].totalScore.toFixed(1) + ' / 100'
              : '—';
            break;
          }
        }
      }
      kvRow('Target Composite Score',     selScore, s1);
      kvRow('Number of Holdings',         String(state.assetCount  || '—'), s1);
      kvRow('Market Segments Screened',   String(state.marketCount || '—'), s1);
      kvRow('Investment Amount',          fmtCr((state.investmentCr || 0) * 1e7), s1);
      // Resolve weight preset label
      var presetKey = state.weightPreset || 'balanced';
      var presetLabel = presetKey.charAt(0).toUpperCase() + presetKey.slice(1);
      if (typeof ScoringEngine !== 'undefined' && ScoringEngine.PRESETS && ScoringEngine.PRESETS[presetKey]) {
        presetLabel = ScoringEngine.PRESETS[presetKey].label;
      }
      kvRow('Weight Preset',              presetLabel, s1);
      // Resolve descriptive name for selected target
      var selTargetLabel = '—';
      if (state.selectedTargetId && state.ranked && state.ranked.length) {
        for (var si = 0; si < state.ranked.length; si++) {
          var rm = state.ranked[si];
          if (rm.marketId === state.selectedTargetId) {
            selTargetLabel = (rm.locality || rm.city || rm.marketId)
              + ', ' + (rm.city || '')
              + ' (' + (rm.propertyType || '') + ')';
            break;
          }
        }
      }
      kvRow('Selected Target',            selTargetLabel, s1);

      /* Evidence governance. The report previously named a recommended market
       * with no statement of how well that market is evidenced, which is the
       * single most important qualification on the whole document: under three
       * of the four weight presets the highest-scoring segment rests on 26
       * simulated observations at confidence grade D. */
      var selTarget = null;
      if (state.selectedTargetId && state.ranked) {
        for (var gi = 0; gi < state.ranked.length; gi++) {
          if (state.ranked[gi].marketId === state.selectedTargetId) {
            selTarget = state.ranked[gi]; break;
          }
        }
      }
      if (selTarget && typeof Governance !== 'undefined') {
        var gov = Governance.evaluate(selTarget);
        var R   = Governance.rules();
        kvRow('Target Evidence',
              gov.tier + ' — confidence grade ' + (gov.grade || 'unrecorded') + ', ' +
              gov.observations + ' simulated market observations', s1);
        kvRow('Meets Evidence Floor',
              (gov.eligible ? 'Yes' : 'No') +
              ' (floor: at least ' + R.MIN_OBSERVATIONS + ' observations and grade ' +
              R.MIN_GRADE + ' or better)' +
              (gov.eligible ? '' : ' — ' + gov.reasons.join('; ')), s1);
        if (state.governanceOverride) {
          kvRow('Evidence Floor Override',
                'In effect — the recommendation is the highest-scoring segment ' +
                'regardless of how well it is evidenced', s1);
        }
        if (state.governanceNote) {
          kvRow('Selection Basis', state.governanceNote, s1);
        }
      }
    } else {
      s1.appendChild(txt('p', 'No analysis state found. Run the analysis on the Market Screener and Diversification pages first.', 'reit-text-muted'));
    }
    disclaimer('Portfolio data is entirely synthetic. Values represent no real assets, tenants or financial positions.', s1);
    container.appendChild(s1);

    /* ── § 2  Market Screening ── */
    var s2 = make('section', 'reit-report__section');
    s2.appendChild(sectionHeading(2, 'Market Screening Results'));
    if (state && state.ranked && state.ranked.length) {
      var top3 = state.ranked.slice(0, 3);
      var table = document.createElement('table');
      table.className = 'reit-table';
      var thead = document.createElement('thead');
      var hrow  = document.createElement('tr');
      ['Rank', 'Market', 'City', 'Type', 'Score', 'Gross Yield', 'Growth'].forEach(function (h) {
        var th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = h;
        hrow.appendChild(th);
      });
      thead.appendChild(hrow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      top3.forEach(function (m, i) {
        var row = document.createElement('tr');
        [
          String(i + 1),
          m.locality || m.city || m.marketId || '—',
          m.city || '—',
          m.propertyType || '—',
          /* BUG FIX. This read m.score, which ranked markets do not carry —
           * scoringEngine.js names the field totalScore. Every row in the
           * report's screening table therefore printed an em dash in the Score
           * column while the screener, reading the correct field, showed real
           * numbers for the same three markets. */
          typeof m.totalScore === 'number' ? m.totalScore.toFixed(1) : '—',
          fmtPct(m.grossYield),
          fmtPct(m.annualRentalGrowthRatio)
        ].forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = v;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      s2.appendChild(table);
    } else {
      s2.appendChild(txt('p', 'No ranked markets available. Run the Market Screener first.', 'reit-text-muted'));
    }
    disclaimer('Market segment scores use the Balanced weight preset unless changed by the user. All data is synthetic.', s2);
    container.appendChild(s2);

    /* ── § 3  Diversification (HHI) ── */
    var s3 = make('section', 'reit-report__section');
    s3.appendChild(sectionHeading(3, 'Portfolio Diversification (HHI)'));
    if (state) {
      var grid = make('div', 'reit-report__hhi-grid');
      [
        { label: 'City HHI — Before',       value: fmtHHI(state.cityHHIBefore) },
        { label: 'City HHI — After',         value: fmtHHI(state.cityHHIAfter)  },
        { label: 'Asset-Type HHI — Before',  value: fmtHHI(state.typeHHIBefore) },
        { label: 'Asset-Type HHI — After',   value: fmtHHI(state.typeHHIAfter)  }
      ].forEach(function (item) { kvRow(item.label, item.value, grid); });
      s3.appendChild(grid);
    } else {
      s3.appendChild(txt('p', 'No HHI data available. Run the Diversification analysis first.', 'reit-text-muted'));
    }
    disclaimer('HHI thresholds: <0.15 = Diversified, 0.15–0.25 = Moderate, >0.25 = Concentrated. Descriptive benchmarks only — not regulatory thresholds.', s3);
    container.appendChild(s3);

    /* ── § 4  Scenario Projections ── */
    var s4 = make('section', 'reit-report__section');
    s4.appendChild(sectionHeading(4, 'Scenario Projections'));
    if (state && typeof Projection !== 'undefined') {
      // Resolve selected target's gross yield
      var rptTarget = null;
      if (state.ranked && state.selectedTargetId) {
        for (var ri = 0; ri < state.ranked.length; ri++) {
          if (state.ranked[ri].marketId === state.selectedTargetId) {
            rptTarget = state.ranked[ri]; break;
          }
        }
      }
      if (!rptTarget && state.ranked && state.ranked.length) { rptTarget = state.ranked[0]; }
      var params = {
        currentPortfolioValueRs: (state.portfolioValueCr || 0) * 1e7,
        currentAnnualRentRs:     (state.annualRentCr || 0) * 1e7,
        investmentRs:            (state.investmentCr || 0) * 1e7,
        newMarketGrossYield:     rptTarget ? (rptTarget.grossYield || 0.07) : 0.07
      };
      var projections = Projection.projectAll(params);
      var summary     = Projection.summarise(projections, 3);

      var assumpNote = make('p', 'reit-text-muted');
      assumpNote.textContent = 'Projected over a 3-year horizon from the post-investment '
        + 'portfolio value. Year 0 annual rent = existing portfolio rent + the target\'s '
        + 'estimated rent at its own gross yield. Two yields are shown and they answer '
        + 'different questions: Gross Yield is rent \u00f7 value and ignores vacancy by '
        + 'definition, while Effective Yield applies the scenario\'s occupancy rate, so it '
        + 'is the figure the occupancy assumption actually affects. Neither deducts fees, '
        + 'tax or transaction costs. See the Diversification page for the full scenario tables.';
      s4.appendChild(assumpNote);

      var projTable = document.createElement('table');
      projTable.className = 'reit-table';
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

    /* ── § 5  Agent Recommendations ── */
    var s5 = make('section', 'reit-report__section');
    s5.appendChild(sectionHeading(5, 'Agent Recommendations'));
    if (agentOutputs && agentOutputs.orchestrator) {
      var orch = agentOutputs.orchestrator;
      kvRow('Selected Target',     orch.selectedTarget   || '—', s5);
      kvRow('Investment Amount',   orch.investmentAmount || '—', s5);
      kvRow('Composite Score',     typeof orch.compositeScore === 'number' ? orch.compositeScore.toFixed(1) : '—', s5);
      kvRow('Expected Gross Yield', typeof orch.expectedYieldPct === 'number' ? orch.expectedYieldPct.toFixed(2) + '%' : '—', s5);
      if (orch.evidenceBasis) { kvRow('Evidence Basis', orch.evidenceBasis, s5); }
      /* Provenance. A reader of a printed report cannot tell whether a paragraph
       * came from a live model call or from stored text, so the report says. */
      if (agentOutputs._provenance && agentOutputs._provenance.orchestrator) {
        var provWord = { live: 'Live Gemini call made during this session',
                         cache: 'Stored commentary whose scenario matched this run exactly',
                         deterministic: 'No model commentary — deterministic figures only'
                       }[agentOutputs._provenance.orchestrator] ||
                       agentOutputs._provenance.orchestrator;
        kvRow('Commentary Provenance', provWord, s5);
      }
      kvRow('City HHI Effect',     orch.cityHHIEffect    || '—', s5);
      kvRow('Asset-Type Effect',   orch.assetTypeHHIEffect || '—', s5);
      if (orch.whyTopRanked) {
        var whyHeading = make('h4', 'reit-report__sub-heading');
        whyHeading.textContent = 'Why Top-Ranked';
        s5.appendChild(whyHeading);
        s5.appendChild(txt('p', orch.whyTopRanked));
      }
      if (orch.importantRisks && orch.importantRisks.length) {
        var riskHeading = make('h4', 'reit-report__sub-heading');
        riskHeading.textContent = 'Key Risks';
        s5.appendChild(riskHeading);
        var ul = make('ul', 'reit-report__list');
        orch.importantRisks.forEach(function (r) {
          var li = document.createElement('li');
          li.textContent = r;
          ul.appendChild(li);
        });
        s5.appendChild(ul);
      }
      if (orch.syntheticDisclaimer) {
        disclaimer(orch.syntheticDisclaimer, s5);
      }
    } else {
      s5.appendChild(txt('p', 'No agent commentary available. Run the Agent Output analysis first. The deterministic analysis in sections 1 to 4 does not depend on it.', 'reit-text-muted'));
    }

    /*
     * The deterministic checks, reported separately from the agent commentary
     * because they are a different kind of claim. The commentary is a model's
     * description; these are arithmetic comparisons an examiner can redo by
     * hand from the figures in section 1.
     */
    if (agentOutputs && agentOutputs._validation) {
      var v = agentOutputs._validation;
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

  /* ── Gather agent outputs from stateManager or DOM ─────────── */
  function getAgentOutputs() {
    // The agents page controller stores outputs in a global when run
    if (typeof window._reitAgentOutputs !== 'undefined') return window._reitAgentOutputs;
    return null;
  }

  /* ── Render page ──────────────────────────────────────────── */
  function render() {
    var container = el('report-content');
    if (!container) return;

    var state        = (typeof ReitState !== 'undefined') ? ReitState.load() : null;
    var agentOutputs = getAgentOutputs();
    buildReport(container, state, agentOutputs);
  }

  /* ── Page visibility hook ─────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#report') render();
    });

    var observer = new MutationObserver(function () {
      var rPage = document.getElementById('page-report');
      if (rPage && rPage.classList.contains('page-active')) render();
    });
    var main = document.getElementById('main-content');
    if (main) observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  /* ── Public API ───────────────────────────────────────────── */
  window.Report = { render: render };

}());

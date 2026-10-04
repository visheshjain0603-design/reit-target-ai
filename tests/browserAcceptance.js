/**
 * browserAcceptance.js — end-to-end acceptance checks run INSIDE the application
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * The Node suite (tests/reit-tests.js) proves that every figure comes from one
 * analysis run and that every page module reads it. This script proves the
 * rendered pages agree: it drives the application through its own controls —
 * preset buttons, Select buttons, Reset Demo, Show/Hide pre-generated analysis,
 * the System Check, CSV import — and reads what each of the eight routes shows.
 *
 * How to run (no dependencies):
 *   1. Serve the REPOSITORY ROOT with any static server, e.g.
 *        python3 -m http.server 8778
 *      and open http://localhost:8778/public/index.html
 *   2. In the browser console (or a browser-automation tool):
 *        const s = await (await fetch("../tests/browserAcceptance.js")).text();
 *        (0, eval)(s);
 *        const r = await runAcceptance();   // r.summary, r.results
 *   3. Repeat at about 390 px wide for the mobile checks (runAcceptance({ mobile: true })).
 *
 * The script clears this application's own storage keys before starting and
 * finishes with Reset Demo, so it leaves the canonical state behind.
 */

/* global AnalysisRun, ReitState, DataCentre */
(function (root) {
  "use strict";

  var ROUTES = ["overview", "portfolio", "screener", "diversification", "statsdash", "agents", "datacentre", "report"];
  var ROOT_IDS = { overview: "overview-content", portfolio: "portfolio-content", screener: "screener-content",
                   diversification: "hhi-content", statsdash: "statsdash-content", agents: "agents-content",
                   datacentre: "datacentre-content", report: "report-content" };

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function go(route) {
    if (location.hash !== "#" + route) { location.hash = route; }
    await wait(350);
  }

  function q(sel, rootEl) { return (rootEl || document).querySelector(sel); }
  function qa(sel, rootEl) { return Array.prototype.slice.call((rootEl || document).querySelectorAll(sel)); }

  /** What each page says the target is, read from the rendered DOM. */
  async function targetsOnPages() {
    var out = {};
    await go("overview");        out.overview = attr(q("#overview-content [data-target-id]"));
    await go("screener");        out.screener = attr(q("#screener-content .reit-rec-banner[data-target-id]"));
    await go("diversification"); out.diversification = attr(q("#hhi-content .reit-sim-info[data-target-id]"));
    await go("agents");          out.agents = attr(q("#agents-content .reit-context-table[data-target-id]"));
    await go("report");          out.report = attr(q("#rpt-summary[data-target-id]"));
    return out;
  }
  function attr(el) {
    return el ? { id: el.getAttribute("data-target-id"), mode: el.getAttribute("data-selection-mode") } : null;
  }

  async function runAcceptance(opts) {
    opts = opts || {};
    var results = [];
    function check(id, label, ok, detail) {
      results.push({ id: id, label: label, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
    }

    // ── Start from a clean, canonical state ──────────────────────────────────
    ReitState.APP_KEYS.concat(["reit_system_check_probe"]).forEach(function (k) {
      if (k !== ReitState.CUSTOM_KEY) { try { localStorage.removeItem(k); } catch (e) {} }
    });
    await AnalysisRun.ready();
    AnalysisRun.reset();
    await wait(200);

    // ── 1. Every route renders, inactive pages are hidden ────────────────────
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      await go(r);
      await wait(r === "statsdash" ? 900 : 150);
      var el = document.getElementById(ROOT_IDS[r]);
      var text = el ? el.innerText : "";
      check("R-" + r, "route #" + r + " renders content", text.length > 200 && !/could not be loaded|Could not load/i.test(text),
            text.length + " chars");
      var hiddenOk = qa(".page").every(function (p) {
        var active = p.id === "page-" + r;
        return active ? !p.hasAttribute("hidden") : (p.hasAttribute("hidden") && p.hasAttribute("inert"));
      });
      check("A11Y-hidden-" + r, "only #" + r + " is exposed; other pages are hidden and inert", hiddenOk);
      if (opts.mobile) {
        var overflow = document.documentElement.scrollWidth - window.innerWidth;
        check("MOBILE-" + r, "no horizontal page overflow on #" + r + " at " + window.innerWidth + " px",
              overflow <= 1, "overflow " + overflow + " px");
      }
    }

    // ── 2. Reset Demo restores the canonical analysis immediately ────────────
    await go("screener");
    q('.reit-preset-btn[data-preset="incomeFocused"]').click();
    await wait(150);
    await go("overview");
    q("#ov-reset-open").click();
    await wait(100);
    var panel = q(".reit-ov-reset-panel");
    check("RESET-1", "Reset Demo opens an explicit confirmation panel with Reset and Cancel",
          !!panel && !!q("#ov-reset-confirm") && !!q("#ov-reset-cancel") &&
          document.activeElement === q("#ov-reset-confirm"));
    q("#ov-reset-cancel").click();
    await wait(100);
    check("RESET-2", "Cancel closes the panel, changes nothing and returns focus",
          !q(".reit-ov-reset-panel") && AnalysisRun.current().preset === "incomeFocused" &&
          document.activeElement === q("#ov-reset-open"));
    q("#ov-reset-open").click();
    await wait(100);
    q("#ov-reset-confirm").click();
    await wait(250);
    var run0 = AnalysisRun.current();
    var ovText = q("#overview-content").innerText;
    check("RESET-3", "after reset: Balanced, ₹50.00 Cr, automatic, sample portfolio, no filters",
          run0.preset === "balanced" && run0.investmentCr === 50 && run0.selectionMode === "auto" &&
          run0.portfolio.source === "sample" && !run0.governanceOverride && run0.inputs.filters === null,
          JSON.stringify(run0.inputs));
    check("RESET-4", "the Overview immediately shows a valid candidate and ₹50.00 Cr",
          /₹50\.00 Cr/.test(ovText) && /Gurugram — Cyber Hub, Delhi NCR/.test(ovText) && !/\bnone\b/i.test(q("#overview-content [data-target-id]").innerText),
          location.hash);
    check("RESET-5", "focus lands on the current analysis heading", document.activeElement && document.activeElement.id === "ov-current-analysis");

    // ── 3. Preset synchronisation across pages ───────────────────────────────
    var presets = ["balanced", "incomeFocused", "growthFocused", "diversFocused"];
    for (var p = 0; p < presets.length; p++) {
      var key = presets[p];
      await go("screener");
      q('.reit-preset-btn[data-preset="' + key + '"]').click();
      await wait(200);
      var run = AnalysisRun.current();
      var dg = AnalysisRun.digest(run);
      var pages = await targetsOnPages();
      var ids = Object.keys(pages).map(function (k) { return pages[k] && pages[k].id; });
      check("SYNC-" + key + "-target", key + ": Overview, Screener, Diversification, Agents and Report name the same target (" + dg.targetId + ")",
            ids.every(function (x) { return x === dg.targetId; }), JSON.stringify(pages));
      check("SYNC-" + key + "-candidate", key + ": the target is the run's shortlist candidate in automatic mode",
            run.selectionMode === "auto" && run.selectedTargetId === run.recommendedCandidateId);
      await go("diversification");
      var divBase = q("#div-projections") && q("#div-projections").getAttribute("data-base3y-value");
      var divRent0 = q("[data-year0-rent]") && q("[data-year0-rent]").getAttribute("data-year0-rent");
      var rawTable = q("#div-raw-top3") ? q("#div-raw-top3").innerText : "";
      var rawLeader = AnalysisRun.rawLeader(run);
      await go("report");
      var rptBase = q("#rpt-projections") && q("#rpt-projections").getAttribute("data-base3y-value");
      check("SYNC-" + key + "-projection", key + ": Diversification and Report show identical 3-year projections",
            divBase && divBase === rptBase && divBase === dg.base3yValueCr, divBase + " / " + rptBase);
      check("SYNC-" + key + "-rent", key + ": year-0 rent uses the target's own yield",
            divRent0 === dg.year0RentCr, divRent0 + " vs " + dg.year0RentCr);
      check("SYNC-" + key + "-top3", key + ": Diversification's raw-score table is the active preset's",
            rawTable.indexOf(AnalysisRun.name(rawLeader)) !== -1, AnalysisRun.name(rawLeader));
      var rptText = q("#report-content").innerText;
      check("SYNC-" + key + "-report", key + ": Report shows both tables and the candidate's row",
            !!q("#rpt-raw-top3") && !!q("#rpt-eligible-top3") &&
            q("#rpt-eligible-top3").innerText.indexOf(AnalysisRun.name(AnalysisRun.selected(run))) !== -1 &&
            rptText.indexOf(run.presetLabel) !== -1);
    }

    // ── 4. Manual selection ───────────────────────────────────────────────────
    await go("screener");
    q('.reit-preset-btn[data-preset="balanced"]').click();
    await wait(200);
    var showAll = qa("#screener-content .reit-show-all-btn")[0];
    if (showAll && /Show all/.test(showAll.textContent)) { showAll.click(); await wait(150); }
    var manualId = "MKT-036";
    var selBtn = qa("#screener-content .reit-select-btn").filter(function (b) {
      return /Ambattur/.test(b.getAttribute("aria-label") || "");
    })[0];
    selBtn.click();
    await wait(200);
    var manualPages = await targetsOnPages();
    check("MANUAL-1", "a manual selection is used by every page and labelled manual",
          Object.keys(manualPages).every(function (k) {
            return manualPages[k] && manualPages[k].id === manualId && manualPages[k].mode === "manual";
          }), JSON.stringify(manualPages));
    await go("overview");
    check("MANUAL-2", "the Overview labels it 'Manually selected target'",
          /Manually selected target/.test(q("#overview-content").innerText));
    await go("screener");
    q('.reit-preset-btn[data-preset="incomeFocused"]').click();
    await wait(200);
    var warn = q("#screener-content .reit-manual-differs");
    check("MANUAL-3", "after a preset change the manual target is kept and a warning names the new candidate",
          AnalysisRun.current().selectedTargetId === manualId && !!warn && /Aerocity/.test(warn.innerText), warn ? warn.innerText.slice(0, 120) : "no warning");
    q("#screener-content .reit-return-auto").click();
    await wait(200);
    check("MANUAL-4", "Return to automatic restores the current candidate",
          AnalysisRun.current().selectionMode === "auto" && AnalysisRun.current().selectedTargetId === "MKT-024");

    // ── 5. Pre-generated agent analysis ──────────────────────────────────────
    AnalysisRun.reset();
    await wait(150);
    await go("agents");
    var btn = q("#agents-content .reit-run-btn");
    var liveMode = /Run Agent Analysis/.test(btn.textContent) && !btn.disabled;
    if (!liveMode) {
      check("CACHE-1", "static mode offers the matching pre-generated analysis", /Show Pre-generated Analysis/.test(btn.textContent) && !btn.disabled, btn.textContent);
      btn.click();
      await wait(400);
      var cards = qa("#agents-content .reit-agent-card");
      check("CACHE-2", "four cards, each labelled as stored text for the Balanced preset",
            cards.length === 4 && cards.every(function (c) { return /Pre-generated interpretation \(Balanced preset\)/.test(c.innerText); }));
      check("CACHE-3", "every card passes the deterministic consistency check",
            qa("#agents-content .reit-check-ok").length === 4 && qa("#agents-content .reit-check-warn").length === 0);
      check("CACHE-4", "the button now reads 'Hide Pre-generated Analysis'",
            /Hide Pre-generated Analysis/.test(q("#agents-content .reit-run-btn").textContent));
      await go("report");
      check("CACHE-5", "the Report includes the commentary for this run, with provenance",
            /Stored commentary whose scenario key matches this run exactly/.test(q("#report-content").innerText));
      AnalysisRun.update({ investmentCr: 60 });
      await wait(200);
      await go("agents");
      var b2 = q("#agents-content .reit-run-btn");
      var note = q("#agents-content .reit-run-note-warn");
      check("CACHE-6", "changing the investment amount rejects the stored analysis and says why",
            b2.disabled && !!note && /investment amount/.test(note.innerText) && qa("#agents-content .reit-agent-card").length === 0,
            note ? note.innerText.slice(0, 140) : "");
      await go("report");
      check("CACHE-7", "the Report no longer prints commentary from the previous configuration",
            !/Stored commentary whose scenario key matches/.test(q("#report-content").innerText));
      AnalysisRun.update({ investmentCr: 50 });
      await wait(200);
      await go("agents");
      check("CACHE-8", "restoring ₹50 Cr makes the stored analysis available again",
            /Show Pre-generated Analysis/.test(q("#agents-content .reit-run-btn").textContent));
    } else {
      check("CACHE-LIVE", "live mode is available (served by the proxy with a key)", true, "live mode — cache checks skipped");
    }

    // ── 6. System Check ──────────────────────────────────────────────────────
    await go("datacentre");
    q("#dc-run-check").click();
    await wait(900);
    var cr = DataCentre.getCheckResults() || [];
    check("SYSCHECK", "System Check: every check passes", cr.length === 10 && cr.every(function (x) { return x.ok; }),
          cr.filter(function (x) { return !x.ok; }).map(function (x) { return x.id + ": " + x.detail; }).join(" | ") || cr.length + "/10");
    check("SYSCHECK-state", "running the System Check did not change the analysis",
          AnalysisRun.current().preset === "balanced" && AnalysisRun.current().selectedTargetId === "MKT-016");

    // ── 7. CSV fixtures ───────────────────────────────────────────────────────
    try {
      var valid = await (await fetch("../tests/fixtures/markets-valid.csv")).text();
      var invalid = await (await fetch("../tests/fixtures/markets-invalid.csv")).text();
      var rv = DataCentre.importCSVText(valid, "markets-valid.csv");
      check("CSV-1", "valid fixture: all 6 rows accepted", rv && rv.total === 6 && rv.ok === 6 && rv.rejected === 0, JSON.stringify(rv && { ok: rv.ok, rejected: rv.rejected }));
      var ri = DataCentre.importCSVText(invalid, "markets-invalid.csv");
      var rows = qa("#dc-csv-table tbody tr");
      check("CSV-2", "invalid fixture: every row rejected with a stated reason",
            ri && ri.total === 6 && ri.ok === 0 && rows.length === 6 &&
            rows.every(function (tr) { return /Rejected|Warning/.test(tr.innerText) && tr.lastChild.textContent !== "—"; }),
            JSON.stringify(ri && { ok: ri.ok, rejected: ri.rejected, warnings: ri.warnings }));
    } catch (e) {
      check("CSV", "CSV fixtures reachable (serve the repository root)", false, e.message);
    }

    // ── 8. Portfolio form focus management ───────────────────────────────────
    await go("portfolio");
    var customBtn = qa("#portfolio-content button").filter(function (b) { return /Custom Portfolio/.test(b.textContent); })[0];
    customBtn.click();
    await wait(200);
    var opener = q("#pf-add-asset") || q("#pf-start-blank");
    if (opener) {
      opener.click();
      await wait(150);
      var inForm = document.activeElement && document.activeElement.closest && document.activeElement.closest(".reit-asset-form");
      check("FOCUS-1", "focus moves into the Add Asset form", !!inForm, document.activeElement && document.activeElement.id);
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await wait(150);
      check("FOCUS-2", "Escape closes the form and returns focus to the opening button",
            !q(".reit-asset-form") && document.activeElement && document.activeElement.id === opener.id, document.activeElement && document.activeElement.id);
    }
    var sampleBtn = qa("#portfolio-content button").filter(function (b) { return /Sample Portfolio/.test(b.textContent); })[0];
    sampleBtn.click();
    await wait(150);

    // ── 9. Tables are labelled ───────────────────────────────────────────────
    var unlabelled = [];
    for (var k = 0; k < ROUTES.length; k++) {
      await go(ROUTES[k]);
      await wait(ROUTES[k] === "statsdash" ? 600 : 100);
      qa("#" + ROOT_IDS[ROUTES[k]] + " table.reit-table, #" + ROOT_IDS[ROUTES[k]] + " table.reit-sim-table, #" +
         ROOT_IDS[ROUTES[k]] + " table.reit-compare-table, #" + ROOT_IDS[ROUTES[k]] + " table.reit-context-table").forEach(function (t) {
        if (!t.querySelector("caption") && !t.getAttribute("aria-labelledby") && !t.getAttribute("aria-label")) {
          unlabelled.push(ROUTES[k] + ":" + (t.id || t.className));
        }
      });
    }
    check("A11Y-tables", "every principal table has a caption or an accessible name", unlabelled.length === 0, unlabelled.join(", "));

    // ── Leave the canonical state behind ─────────────────────────────────────
    AnalysisRun.reset();
    await go("overview");

    var passed = results.filter(function (x) { return x.ok; }).length;
    return { summary: passed + " / " + results.length + " acceptance checks passed" +
                      (opts.mobile ? " (mobile, " + window.innerWidth + " px)" : " (" + window.innerWidth + " px)"),
             passed: passed, total: results.length, results: results };
  }

  root.runAcceptance = runAcceptance;
}(typeof window !== "undefined" ? window : this));

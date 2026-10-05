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

    // ── 8a. Runbook exercises through the controls (expected values: data-pipeline/generated/runbook_expected.json) ──
    AnalysisRun.reset();
    await wait(200);
    function setVal(el, v) { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
    async function hhiText() { await go("diversification"); return q("#hhi-content").innerText; }
    // Exercise A: the amount moves concentration and projections, not scores.
    await go("screener");
    setVal(q("#screener-investment"), 75);
    await wait(250);
    var ra = AnalysisRun.current(), ta = AnalysisRun.selected(ra);
    check("EX-A1", "₹75 Cr typed into the amount: same candidate and score, city HHI 0.3293, asset-type HHI 0.6711",
          ra.investmentCr === 75 && ta.marketId === "MKT-016" && ta.totalScore.toFixed(2) === "67.71" &&
          ra.hhi.cityAfter.toFixed(4) === "0.3293" && ra.hhi.typeAfter.toFixed(4) === "0.6711" &&
          /0\.3293/.test(await hhiText()), ra.hhi.cityAfter.toFixed(4) + " / " + ra.hhi.typeAfter.toFixed(4));
    await go("screener");
    setVal(q("#w-yieldWeight"), 35);                       // 35+25+20+20+10 = 110: not applied
    await wait(250);
    var drafted = AnalysisRun.current();
    check("EX-A2", "a weight total of 110% is held as a draft: shown in red, not applied to the analysis",
          drafted.preset === "balanced" && !!q("#screener-content .reit-weight-err") &&
          /110/.test(q("#screener-content .reit-weight-total").innerText), q("#screener-content .reit-weight-total").innerText);
    setVal(q("#w-demandWeight"), 10);                      // now 35/25/20/10/10 = 100: applied
    await wait(300);
    var rc = AnalysisRun.current(), tc = AnalysisRun.selected(rc), lead = AnalysisRun.rawLeader(rc);
    check("EX-A3", "35/25/20/10/10 applies as Custom: candidate raw rank 6 (64.64), GIFT City the raw leader (75.87) failing the screen",
          rc.preset === "custom" && tc.marketId === "MKT-016" && tc.rank === 6 && tc.totalScore.toFixed(2) === "64.64" &&
          /GIFT City/.test(AnalysisRun.name(lead)) && lead.totalScore.toFixed(2) === "75.87" && !lead.governance.eligible,
          AnalysisRun.name(lead) + " " + lead.totalScore.toFixed(2) + "; candidate rank " + tc.rank);
    var pagesA = await targetsOnPages();
    check("EX-A4", "Overview, Screener, Diversification, Agents and Report name the same target for Exercise A",
          Object.keys(pagesA).every(function (k) { return pagesA[k] && pagesA[k].id === "MKT-016"; }), JSON.stringify(pagesA));
    // Invalid amount: visible feedback, nothing applied.
    await go("screener");
    setVal(q("#screener-investment"), -5);
    await wait(150);
    var note = q("#screener-investment-note");
    check("EX-INVALID", "a negative amount is not applied and the page says why",
          AnalysisRun.current().investmentCr === 75 && note && !note.hidden && /not a valid amount/.test(note.textContent) &&
          q("#screener-investment").value === "75", note && note.textContent);
    // Exercise B: a three-asset custom portfolio typed through the form; the typed ₹75 Cr is kept.
    var origConfirm = window.confirm; window.confirm = function () { return true; };
    await go("portfolio");
    var cbtn = qa("#portfolio-content button").filter(function (b) { return /Custom Portfolio/.test(b.textContent); })[0];
    cbtn.click(); await wait(200);
    var reset = qa("#portfolio-content button").filter(function (b) { return /Reset Custom Portfolio/.test(b.textContent); })[0];
    if (reset) { reset.click(); await wait(250); }
    var EXB = [["EX-1", "Exercise Office A", "Mumbai", "Andheri East", "Commercial Office", 60, 4.2, 300000, 285000, "2030-03-31", "IT"],
               ["EX-2", "Exercise Mall B", "Pune", "Kharadi", "Retail", 30, 2.1, 150000, 135000, "2029-06-30", "Retail"],
               ["EX-3", "Exercise Homes C", "Bengaluru", "Whitefield", "Residential", 10, 0.4, 80000, 72000, "2028-12-31", "Residential"]];
    var ids = ["f-assetId", "f-assetName", "f-city", "f-locality", "f-assetType", "f-propertyValue", "f-annualRent", "f-totalArea", "f-occupiedArea", "f-leaseExpiry", "f-tenantSector"];
    for (var e = 0; e < EXB.length; e++) {
      var openBtn = q("#pf-start-blank") || q("#pf-add-asset") ||
        qa("#portfolio-content button").filter(function (b) { return /Add Asset/.test(b.textContent); })[0];
      openBtn.click(); await wait(200);
      ids.forEach(function (id, n) { var f = document.getElementById(id); if (f) { f.value = String(EXB[e][n]); f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true })); } });
      var submit = qa(".reit-asset-form button").filter(function (b) { return /^Add Asset$/.test(b.textContent.trim()); })[0];
      submit.click(); await wait(300);
    }
    var rb = AnalysisRun.current();
    check("EX-B1", "the custom portfolio is active: ₹100.00 Cr, city and asset-type HHI 0.4600 before",
          rb.portfolio.source === "custom" && Math.round(rb.portfolio.totalValueRs / 1e7) === 100 &&
          rb.hhi.cityBefore.toFixed(4) === "0.4600" && rb.hhi.typeBefore.toFixed(4) === "0.4600",
          rb.portfolio.source + " " + rb.portfolio.totalValueRs / 1e7 + " " + rb.hhi.cityBefore.toFixed(4));
    check("EX-B2", "an amount the user typed (₹75 Cr) is kept when the portfolio changes; city HHI after 0.3339",
          rb.investmentCr === 75 && rb.hhi.cityAfter.toFixed(4) === "0.3339", rb.investmentCr + " / " + rb.hhi.cityAfter.toFixed(4));
    AnalysisRun.update({ investmentCr: null });            // back to the default: 10% of the active portfolio
    await wait(250);
    var rb2 = AnalysisRun.current();
    check("EX-B3", "with the default amount it is 10% of the custom portfolio (₹10 Cr): HHI after 0.3884 / 0.4876, year-0 rent ₹7.403 Cr",
          rb2.investmentCr === 10 && rb2.hhi.cityAfter.toFixed(4) === "0.3884" && rb2.hhi.typeAfter.toFixed(4) === "0.4876" &&
          (rb2.projections.year0AnnualRentRs / 1e7).toFixed(3) === "7.403", rb2.investmentCr + " " + rb2.hhi.cityAfter.toFixed(4));
    var resetB = qa("#portfolio-content button").filter(function (b) { return /Reset Custom Portfolio/.test(b.textContent); })[0];
    if (resetB) { await go("portfolio"); resetB = qa("#portfolio-content button").filter(function (b) { return /Reset Custom Portfolio/.test(b.textContent); })[0]; resetB.click(); await wait(250); }
    window.confirm = origConfirm;
    AnalysisRun.reset();
    await wait(200);
    check("EX-RESET", "Reset Demo after the exercises restores Balanced, ₹50 Cr, sample portfolio, automatic selection",
          AnalysisRun.current().preset === "balanced" && AnalysisRun.current().investmentCr === 50 &&
          AnalysisRun.current().portfolio.source === "sample" && AnalysisRun.current().selectionMode === "auto");

    // ── 8b. CSV area units through the import page ──────────────────────────
    var hdr = "city,locality,propertyType,{A},askingPriceINR,monthlyRentINR\n";
    var small = DataCentre.importCSVText(hdr.replace("{A}", "areaSqFt") + "Mumbai,Kala Ghoda,Retail,300,9000000,45000\nPune,Camp,Retail,250,6000000,30000\n", "small-shops.csv", null);
    var smallRows = qa("#dc-csv-table tbody tr").map(function (tr) { return tr.children[4].textContent; });
    check("CSV-3", "a file of 300 and 250 sq ft shops keeps 300 and 250 sq ft (no unit is inferred from small numbers)",
          small && small.ok === 2 && smallRows.join() === "300,250", smallRows.join());
    var generic = hdr.replace("{A}", "area") + "Mumbai,Kala Ghoda,Retail,100,9000000,45000\n";
    var noUnit = DataCentre.importCSVText(generic, "generic.csv", null);
    var reason = (qa("#dc-csv-table tbody tr")[0] || { lastChild: { textContent: "" } }).lastChild.textContent;
    var withM = DataCentre.importCSVText(generic, "generic.csv", "sqm");
    var conv = (qa("#dc-csv-table tbody tr")[0] || { children: [] }).children[4];
    check("CSV-4", "a generic area column without a unit is rejected with the reason; choosing square metres converts it once",
          noUnit && noUnit.rejected === 1 && /area unit not stated/.test(reason) && withM && withM.ok === 1 && conv && conv.textContent === "1076",
          reason + " | " + (conv && conv.textContent));
    check("CSV-5", "the import page offers the unit choice and states that units are never guessed",
          !!q("#reit-csv-area-unit") && /never guessed/.test(q("#datacentre-content").innerText));

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

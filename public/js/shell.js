/**
 * shell.js — the application frame: run summary and navigation marker
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Two small things around the pages, nothing inside them:
 *
 *   1. The sidebar names the current analysis — the selected target, preset,
 *      amount and selection mode — on every page, read from the same shared
 *      run every page renders. It computes nothing.
 *   2. The marigold marker beside the current page slides to the new page on
 *      navigation, so the move is seen rather than inferred, and the new page
 *      opens at its top.
 *
 * Depends on: analysisRun.js, appMeta.js (both optional: without them the
 * summary stays empty and the static marker in the stylesheet is used).
 */

(function () {
  "use strict";

  if (typeof document === "undefined") { return; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }

  // ─── Run summary ──────────────────────────────────────────────────────────

  var lastTargetId;

  function renderSummary(run) {
    var box = document.getElementById("run-summary");
    if (!box || !run || typeof AnalysisRun === "undefined") { return; }
    var target = AnalysisRun.selected(run);
    var targetId = target ? target.marketId : null;

    while (box.firstChild) { box.removeChild(box.firstChild); }
    box.appendChild(el("p", "run-summary__label", AnalysisRun.targetLabel(run)));
    var name = el("p", "run-summary__target", target ? AnalysisRun.name(target) : "None under these settings");
    box.appendChild(name);
    box.appendChild(el("p", "run-summary__meta",
      run.presetLabel + ", " + (typeof AppMeta !== "undefined" ? AppMeta.cr(run.investmentRs, 2) : "")));
    box.appendChild(el("p", "run-summary__meta",
      (run.selectionMode === "manual" ? "Manual selection" : "Automatic selection") +
      ", " + run.portfolio.source + " portfolio"));
    if (run.governanceOverride) {
      box.appendChild(el("p", "run-summary__flag", "Simulation-support screen ignored"));
    }

    var reduce = typeof Motion !== "undefined" && Motion.reduced();
    if (lastTargetId !== undefined && lastTargetId !== targetId && !reduce) {
      name.classList.add("m-fresh");
    }
    lastTargetId = targetId;
  }

  function initSummary() {
    if (typeof AnalysisRun === "undefined") { return; }
    AnalysisRun.ready().then(function () {
      renderSummary(AnalysisRun.current());
      AnalysisRun.subscribe(renderSummary);
    }).catch(function () { /* the pages report a load failure themselves */ });
  }

  // ─── Navigation marker ────────────────────────────────────────────────────

  function initIndicator() {
    var list = document.querySelector(".nav-list");
    if (!list) { return; }

    var marker = el("li", "nav-indicator");
    marker.setAttribute("aria-hidden", "true");
    marker.setAttribute("role", "presentation");
    list.appendChild(marker);

    var placed = false;

    function horizontal() {
      return window.getComputedStyle(list).display === "flex";
    }

    function place() {
      var active = list.querySelector(".nav-link.nav-active");
      if (!active) { return; }

      if (horizontal()) {
        /* Phone layout: the nav is a horizontal strip. Centre the current
         * page inside the strip without scrolling the page itself. */
        var left = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
        if (list.scrollTo) {
          list.scrollTo({ left: Math.max(0, left), behavior: placed ? "smooth" : "auto" });
        } else {
          list.scrollLeft = Math.max(0, left);
        }
        placed = true;
        return;
      }

      if (!placed) { marker.style.transition = "none"; }
      marker.style.transform = "translateY(" + (active.offsetTop + 9) + "px)";
      marker.style.height = Math.max(0, active.offsetHeight - 18) + "px";
      if (!placed) {
        list.classList.add("has-indicator");
        void marker.offsetHeight;          // commit the start position before enabling the slide
        marker.style.transition = "";
        placed = true;
      }
    }

    window.addEventListener("hashchange", place);
    window.addEventListener("resize", place);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(place); }
    place();
  }

  /* A new page starts at its top, not wherever the previous page was scrolled to. */
  function initScrollReset() {
    window.addEventListener("hashchange", function () {
      window.scrollTo(0, 0);
    });
  }

  function init() {
    initSummary();
    initIndicator();
    initScrollReset();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());

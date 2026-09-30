/**
 * stateManager.js — Shared analysis state for cross-page consistency
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Single source of truth: one localStorage key holds the full analysis run.
 * Market Screener WRITES. Diversification and Agent Output READ.
 * When investment/weights/portfolio change → markStale() → all pages show
 * a banner until the user re-runs the screener.
 *
 * State schema:
 * {
 *   runId:           string  (unique per run)
 *   createdAt:       number  (epoch ms)
 *   stale:           boolean
 *   weights:         Object  { yieldWeight, growthWeight, diversWeight, demandWeight, riskWeight }
 *   weightPreset:    string  e.g. "balanced"
 *   investmentCr:    number  e.g. 45
 *   selectedTargetId: string  marketId
 *   ranked:          Array   full ranked market list with simulation attached
 *   cityHHIBefore:   number
 *   cityHHIAfter:    number
 *   typeHHIBefore:   number
 *   typeHHIAfter:    number
 *   portfolioValueCr: number
 *   annualRentCr:    number  — total existing annual rent (from portfolio.json)
 *   marketCount:     number
 *   assetCount:      number
 * }
 */

(function (root) {
  "use strict";

  var LS_KEY = "reit_analysis_state";

  function save(stateObj) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(stateObj));
    } catch (e) { /* storage may be unavailable */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) { return null; }
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clear() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  function markStale() {
    var s = load();
    if (s) { s.stale = true; save(s); }
  }

  function isStale() {
    var s = load();
    return !s || !!s.stale;
  }

  /** Generate a simple unique run ID. */
  function newRunId() {
    return "run-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
  }

  var ReitState = {
    LS_KEY:    LS_KEY,
    save:      save,
    load:      load,
    clear:     clear,
    markStale: markStale,
    isStale:   isStale,
    newRunId:  newRunId
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReitState;
  } else {
    root.ReitState = ReitState;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

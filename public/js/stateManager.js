/**
 * stateManager.js — persistence for the analysis inputs and the portfolio mode
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHAT IS STORED, AND WHAT IS NOT
 * -------------------------------
 * Only the INPUTS of an analysis are persisted: preset, exact weights,
 * investment amount, screen override, selection mode, manual target, filters.
 * The analysis itself is never stored. analysisRun.js recomputes it from these
 * inputs and the data files whenever anything changes, and every page renders
 * that one in-memory result.
 *
 * The previous design stored a full computed snapshot written only by the
 * Market Screener. Each page read that snapshot at its own moment — the
 * Diversification page once, at load — so after a preset change the Agents
 * page and the Report described the new target while Diversification was
 * still analysing the old one. Storing inputs and recomputing removes the
 * possibility: there is nothing stale to read.
 *
 * Keys owned by this application (and the only ones Reset Demo touches):
 *   reit_analysis_state     analysis inputs (schema 2; schema 1 snapshots are migrated)
 *   reit_portfolio_mode     "sample" | "custom"
 *   reit_custom_portfolio   the user's custom holdings — USER WORK: never cleared
 *                           by Reset Demo, only deactivated
 */

(function (root) {
  "use strict";

  var LS_KEY         = "reit_analysis_state";
  var MODE_KEY       = "reit_portfolio_mode";
  var CUSTOM_KEY     = "reit_custom_portfolio";
  var SCHEMA_VERSION = 2;

  function storage() {
    try { return (typeof localStorage !== "undefined") ? localStorage : null; }
    catch (e) { return null; }
  }

  function readJson(key) {
    var ls = storage();
    if (!ls) { return null; }
    try {
      var raw = ls.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeJson(key, value) {
    var ls = storage();
    if (!ls) { return false; }
    try { ls.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  // ─── Analysis inputs ──────────────────────────────────────────────────────

  function save(inputs) { return writeJson(LS_KEY, inputs); }

  function load() { return readJson(LS_KEY); }

  function clear() {
    var ls = storage();
    if (!ls) { return; }
    try { ls.removeItem(LS_KEY); } catch (e) { /* storage unavailable */ }
  }

  /** Generate a run identifier for display. Not part of any cache key. */
  function newRunId() {
    return "run-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
  }

  // ─── Portfolio mode and custom holdings ───────────────────────────────────

  function portfolioMode() {
    var ls = storage();
    if (!ls) { return "sample"; }
    try { return ls.getItem(MODE_KEY) === "custom" ? "custom" : "sample"; }
    catch (e) { return "sample"; }
  }

  function setPortfolioMode(mode) {
    var ls = storage();
    if (!ls) { return; }
    try { ls.setItem(MODE_KEY, mode === "custom" ? "custom" : "sample"); } catch (e) {}
  }

  function customPortfolio() {
    var v = readJson(CUSTOM_KEY);
    return Array.isArray(v) ? v : [];
  }

  function saveCustomPortfolio(assets) {
    return writeJson(CUSTOM_KEY, Array.isArray(assets) ? assets : []);
  }

  /**
   * Reset Demo: clear the analysis inputs and return to the sample portfolio.
   * Touches only this application's keys — never localStorage.clear(), which
   * would destroy other applications' data on the same origin. The custom
   * portfolio is user work, so it is kept and simply made inactive.
   */
  function resetApp() {
    clear();
    setPortfolioMode("sample");
  }

  var ReitState = {
    LS_KEY:          LS_KEY,
    MODE_KEY:        MODE_KEY,
    CUSTOM_KEY:      CUSTOM_KEY,
    APP_KEYS:        [LS_KEY, MODE_KEY, CUSTOM_KEY],
    SCHEMA_VERSION:  SCHEMA_VERSION,
    save:            save,
    load:            load,
    clear:           clear,
    newRunId:        newRunId,
    portfolioMode:   portfolioMode,
    setPortfolioMode: setPortfolioMode,
    customPortfolio: customPortfolio,
    saveCustomPortfolio: saveCustomPortfolio,
    resetApp:        resetApp
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReitState;
  } else {
    root.ReitState = ReitState;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

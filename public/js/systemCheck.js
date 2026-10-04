/**
 * systemCheck.js — runtime checks of the production engines and the shared run
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY THIS IS A MODULE
 * --------------------
 * The System Check previously lived inside dataCentre.js and called the
 * engines with outdated signatures: test assets carried `value` and
 * `propertyType`, which HHIEngine does not read (it reads `propertyValue` and
 * `assetType`), so CHK-01 reported "cityHHI returned 0"; CHK-04 called
 * DataCleaner.clean, which does not exist; CHK-08 printed "₹0 Cr → ₹100 Cr"
 * and called that an HHI check. CHK-05 also overwrote the user's saved
 * analysis with a test record every time it ran.
 *
 * As a pure module the same checks run in the browser and in the Node test
 * suite (T-161), so an API change that breaks a check fails CI rather than
 * reaching the deployed page. Each check reports what it expected and what it
 * got, in the units the application displays.
 *
 * Pure: no DOM, no network. Storage is used only through env.storage, on a
 * dedicated key that is removed afterwards.
 */

(function (root) {
  "use strict";

  var CHECK_KEY = "reit_system_check_probe";

  function near(a, b, tol) { return typeof a === "number" && isFinite(a) && Math.abs(a - b) <= (tol || 1e-9); }

  /**
   * @param {Object} env
   *   HHIEngine, ScoringEngine, Projection, DataCleaner, ScenarioKey, AnalysisRun, AppMeta
   *   run         the current shared analysis run
   *   marketsDoc  parsed markets.json
   *   sampleAssets  portfolio.json assets
   *   metaDoc     parsed meta.json (canonical counts)
   *   cacheDoc    parsed agent-cache.json, or null
   *   storage     a localStorage-like object, or null
   * @returns {Array<{ id, label, ok, expected, actual, detail }>}
   */
  function run(env) {
    var out = [];
    function add(id, label, fn) {
      var r;
      try { r = fn(); } catch (e) { r = { ok: false, expected: "no exception", actual: "Exception: " + e.message }; }
      out.push({ id: id, label: label, ok: !!r.ok, expected: r.expected, actual: r.actual,
                 detail: "Expected " + r.expected + "; got " + r.actual + "." });
    }
    var H = env.HHIEngine, SE = env.ScoringEngine, P = env.Projection, DC = env.DataCleaner;
    var SK = env.ScenarioKey, AR = env.AnalysisRun, AM = env.AppMeta;
    var meta = (env.metaDoc && env.metaDoc.counts) || null;

    // CHK-01 — HHI with the production asset fields.
    add("CHK-01", "HHI engine computes city and asset-type concentration", function () {
      var assets = [
        { propertyValue: 100e7, annualRent: 7e7, city: "Mumbai", assetType: "Commercial Office" },
        { propertyValue:  50e7, annualRent: 3e7, city: "Pune",   assetType: "Retail" }
      ];
      var expect = Math.pow(2 / 3, 2) + Math.pow(1 / 3, 2);       // 0.5556
      var c = H.cityHHI(assets), t = H.typeHHI(assets);
      return { ok: near(c, expect, 1e-9) && near(t, expect, 1e-9),
               expected: "city HHI " + expect.toFixed(4) + " and asset-type HHI " + expect.toFixed(4) +
                         " for ₹100 Cr + ₹50 Cr in two cities and two types",
               actual: "city HHI " + (isFinite(c) ? c.toFixed(4) : c) + ", asset-type HHI " + (isFinite(t) ? t.toFixed(4) : t) };
    });

    // CHK-02 — scoring engine on the real dataset.
    add("CHK-02", "Scoring engine ranks every segment with valid weights", function () {
      var w = SE.PRESETS.balanced;
      var v = SE.validateWeights(w);
      var markets = env.marketsDoc.markets;
      var r = SE.rankMarkets(markets, w, env.sampleAssets, H.diversificationScore);
      var inRange = r.ranked.every(function (m) { return m.totalScore >= 0 && m.totalScore <= 100; });
      var sum = ["yieldWeight", "growthWeight", "diversWeight", "demandWeight", "riskWeight"]
        .reduce(function (s, k) { return s + w[k]; }, 0);
      return { ok: v.valid && inRange && r.ranked.length === markets.length,
               expected: "Balanced weights total 100.0% and " + markets.length + " scores within 0–100",
               actual: "weights total " + (sum * 100).toFixed(1) + "%, " + r.ranked.length + " scores, " +
                       (inRange ? "all" : "not all") + " within 0–100" };
    });

    // CHK-03 — projection arithmetic.
    add("CHK-03", "Projection engine computes the post-investment year-0 position", function () {
      var proj = P.projectAll({ currentPortfolioValueRs: 500e7, currentAnnualRentRs: 33.275e7,
                                investmentRs: 100e7, newMarketGrossYield: 0.0914 });
      var v0 = proj.base[0].portfolioValue / 1e7, r0 = proj.base[0].annualRent / 1e7;
      return { ok: near(v0, 600, 0.01) && near(r0, 42.415, 0.001),
               expected: "value ₹600.00 Cr and gross rent ₹42.415 Cr (₹33.275 Cr + ₹100 Cr × 9.14%)",
               actual: "value ₹" + v0.toFixed(2) + " Cr and gross rent ₹" + r0.toFixed(3) + " Cr" };
    });

    // CHK-04 — the cleaning pipeline through its real entry points.
    add("CHK-04", "CSV cleaning pipeline accepts a valid row and rejects an impossible one", function () {
      var csv = "city,locality,propertyType,areaSqFt,askingPriceINR,monthlyRentINR\n" +
                "Mumbai,Check Park,Commercial Office,5000,150000000,1000000\n" +
                "Pune,Zero Area,Commercial Office,0,80000000,600000\n";
      var res = DC.cleanRecords(DC.parseCSV(csv));
      var rej = res.records.filter(function (x) { return x.validationStatus === "rejected"; });
      return { ok: res.report.total === 2 && res.report.ok === 1 && res.report.rejected === 1 &&
                   rej.length === 1 && !!rej[0].exclusionReason,
               expected: "2 rows: 1 OK, 1 rejected with a stated reason",
               actual: res.report.total + " rows: " + res.report.ok + " OK, " + res.report.rejected + " rejected" +
                       (rej[0] ? " (“" + rej[0].exclusionReason + "”)" : "") };
    });

    // CHK-05 — the shared run is internally consistent, and storage round-trips
    // WITHOUT touching the user's saved analysis.
    add("CHK-05", "Shared analysis run is consistent and storage round-trips safely", function () {
      var rr = env.run;
      var sel = AR.market(rr, rr.selectedTargetId);
      var keyOk = SK.compute(rr.scenarioDescriptor) === rr.scenarioKey;
      var hhiOk = sel && sel.simulation && near(rr.hhi.cityAfter, sel.simulation.after.cityHHI) &&
                  near(rr.hhi.typeAfter, sel.simulation.after.typeHHI);
      var storeOk = true, storeNote = "storage unavailable (not required)";
      if (env.storage) {
        var probe = { probe: true, n: 42 };
        env.storage.setItem(CHECK_KEY, JSON.stringify(probe));
        var back = JSON.parse(env.storage.getItem(CHECK_KEY) || "null");
        env.storage.removeItem(CHECK_KEY);
        storeOk = !!back && back.n === 42;
        storeNote = storeOk ? "storage round-trip OK on a separate key" : "storage round-trip failed";
      }
      return { ok: !!sel && keyOk && hhiOk && storeOk,
               expected: "selected target present, HHI equal to its simulation, scenario key reproducible, storage round-trip",
               actual: (sel ? sel.marketId + " present" : "no selected target") + ", HHI " + (hhiOk ? "matches" : "differs") +
                       ", key " + (keyOk ? "reproduces" : "does not reproduce") + ", " + storeNote };
    });

    // CHK-06 — dataset size against the canonical metadata.
    add("CHK-06", "Market dataset matches the canonical counts", function () {
      var n = env.marketsDoc.markets.length;
      var obs = env.marketsDoc.markets.reduce(function (t, m) { return t + (m.observationCount || 0); }, 0);
      var en = meta ? meta.marketCount : 50, eo = meta ? meta.observationCount : 2156;
      return { ok: n === en && obs === eo,
               expected: en + " segments and " + AM.num(eo) + " simulated observations (meta.json)",
               actual: n + " segments and " + AM.num(obs) + " simulated observations" };
    });

    // CHK-07 — sample portfolio against the canonical metadata.
    add("CHK-07", "Sample portfolio matches the canonical figures", function () {
      var a = env.sampleAssets;
      var v = H.totalValue(a) / 1e7, r = H.totalAnnualRent(a) / 1e7;
      var ev = meta ? meta.portfolioValueCr : 500, er = meta ? meta.portfolioRentCr : 33.275;
      var en = meta ? meta.assetCount : 10;
      return { ok: a.length === en && near(v, ev, 0.005) && near(r, er, 0.0005),
               expected: en + " holdings, ₹" + ev.toFixed(2) + " Cr value, ₹" + er.toFixed(3) + " Cr rent",
               actual: a.length + " holdings, ₹" + v.toFixed(2) + " Cr value, ₹" + r.toFixed(3) + " Cr rent" };
    });

    // CHK-08 — HHI before and after a simulated investment.
    add("CHK-08", "HHI simulation reports concentration before and after an investment", function () {
      var assets = [
        { propertyValue: 100e7, annualRent: 7e7, city: "Mumbai", assetType: "Commercial Office" },
        { propertyValue:  50e7, annualRent: 3e7, city: "Pune",   assetType: "Retail" }
      ];
      var market = { marketId: "CHK", locality: "Check", city: "Chennai", propertyType: "Residential",
                     medianCapitalValuePerSqFt: 10000, medianMonthlyRentPerSqFt: 50 };
      var sim = H.simulateInvestment(assets, market, 50e7);
      var eb = Math.pow(2 / 3, 2) + Math.pow(1 / 3, 2);                     // ₹100 / ₹50 → 0.5556
      var ea = Math.pow(0.5, 2) + Math.pow(0.25, 2) + Math.pow(0.25, 2);   // ₹100 / ₹50 / ₹50 → 0.3750
      return { ok: !!sim && near(sim.before.cityHHI, eb, 1e-9) && near(sim.after.cityHHI, ea, 1e-9) &&
                   near(sim.after.totalValue - sim.before.totalValue, 50e7, 1),
               expected: "city HHI " + eb.toFixed(4) + " → " + ea.toFixed(4) + " and value ₹150.00 Cr → ₹200.00 Cr " +
                         "when ₹50 Cr is added in a third city",
               actual: sim ? "city HHI " + sim.before.cityHHI.toFixed(4) + " → " + sim.after.cityHHI.toFixed(4) +
                             " and value ₹" + (sim.before.totalValue / 1e7).toFixed(2) + " Cr → ₹" +
                             (sim.after.totalValue / 1e7).toFixed(2) + " Cr" : "no simulation returned" };
    });

    // CHK-09 — presets.
    add("CHK-09", "All four weight presets have five factors totalling 100%", function () {
      var bad = Object.keys(SE.PRESETS).filter(function (k) { return !SE.validateWeights(SE.PRESETS[k]).valid; });
      return { ok: Object.keys(SE.PRESETS).length === 4 && bad.length === 0,
               expected: "4 valid presets",
               actual: Object.keys(SE.PRESETS).length + " presets, " + (bad.length ? "invalid: " + bad.join(", ") : "all valid") };
    });

    // CHK-10 — the pre-generated commentary file the static deployment relies on.
    add("CHK-10", "Pre-generated agent commentary is in the current format", function () {
      var c = env.cacheDoc;
      if (!c) { return { ok: false, expected: "data/agent-cache.json with a scenarios block", actual: "file not loaded" }; }
      var keys = c.scenarios ? Object.keys(c.scenarios) : [];
      var ok = !!c.scenarios && !c.agents && keys.length === 4 && keys.every(function (k) {
        return SK.compute(c.scenarios[k].descriptor) === k &&
               c.scenarios[k].descriptor.contextVersion === SK.CONTEXT_VERSION;
      });
      return { ok: ok,
               expected: "4 scenarios, each stored under the key its descriptor hashes to, context version " + SK.CONTEXT_VERSION,
               actual: keys.length + " scenarios" + (c.agents ? ", retired .agents block present" : "") +
                       (ok ? ", keys and context version match" : ", keys or context version do not match") };
    });

    return out;
  }

  var SystemCheck = { run: run, CHECK_KEY: CHECK_KEY };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SystemCheck;
  } else {
    root.SystemCheck = SystemCheck;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

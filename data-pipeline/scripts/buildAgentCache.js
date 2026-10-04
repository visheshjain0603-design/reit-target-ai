/**
 * buildAgentCache.js — pre-generate agent commentary for each weight preset
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * PURPOSE
 * -------
 * The four Gemini agents are reached through a local Node proxy on port 3001.
 * That proxy cannot exist on a static host, and free-tier Gemini quota is
 * small enough that a live demo can fail through no fault of the project.
 *
 * This script runs the chain against the real API once per weight preset and
 * writes the replies to public/data/agent-cache.json. When the proxy is
 * unreachable the application serves a cached reply — but only for a scenario
 * whose ScenarioKey matches the one on screen exactly.
 *
 * WHAT A SCENARIO IS
 * ------------------
 * One entry per preset, as the Market Screener produces it when the user
 * clicks that preset and changes nothing else: the screener's default
 * investment (10% of portfolio value), the evidence-floor recommendation as
 * the selected target, no override. The context and the ranking come from
 * public/js/agentContext.js — the same module the Agents page uses — so the
 * stored commentary describes exactly the context the page would send.
 *
 * Any other configuration (custom weights, a different amount, a manually
 * chosen target, the floor overridden) has no cache entry, and the page says
 * so rather than showing commentary written for something else.
 *
 * THE CHAIN, as in agents.js runSequence():
 *   dataStatistical → marketScreening → portfolioRisk
 *   → Validator.validate()  (deterministic; the Orchestrator runs only if it passes)
 *   → orchestrator
 *
 * HONESTY REQUIREMENT
 * -------------------
 * Cached replies are labelled as pre-generated in the interface, with the
 * timestamp and model they came from. They are never presented as a live
 * call. Regenerate whenever the data, the portfolio or the methodology changes;
 * the scenario key changes with them, so stale entries stop matching anyway.
 *
 * Run (the proxy must be running on :3001 with its key in server/.env):
 *   node server/server.js &
 *   node data-pipeline/scripts/buildAgentCache.js
 *
 *   --dry-run   build every context, key and deterministic check; call nothing
 *               and write nothing. Needs no proxy and no key.
 */

"use strict";

var fs   = require("fs");
var path = require("path");
var http = require("http");

var PROJECT = path.join(__dirname, "..", "..");
var OUT     = path.join(PROJECT, "public", "data", "agent-cache.json");
var JS      = path.join(PROJECT, "public", "js");

var API_HOST = "localhost";
var API_PORT = parseInt(process.env.PORT || "3001", 10);
var DRY_RUN  = process.argv.indexOf("--dry-run") !== -1;

var ScoringEngine = require(path.join(JS, "scoringEngine.js"));
var HHIEngine     = require(path.join(JS, "hhi.js"));
var Governance    = require(path.join(JS, "governance.js"));
var Validator     = require(path.join(JS, "validator.js"));
var ScenarioKey   = require(path.join(JS, "scenarioKey.js"));
var AgentContext  = require(path.join(JS, "agentContext.js"));
var AppMeta       = require(path.join(JS, "appMeta.js"));

var marketsDoc = JSON.parse(fs.readFileSync(path.join(PROJECT, "public", "data", "markets.json"), "utf8"));
var portfolio  = JSON.parse(fs.readFileSync(path.join(PROJECT, "public", "data", "portfolio.json"), "utf8"));
var markets = marketsDoc.markets;
var assets  = portfolio.assets;

/* The four agent keys, in chain order, from the single roster declaration. */
var CHAIN = AppMeta.AGENTS.map(function (a) { return a.key; });

// ─── Scenario construction ──────────────────────────────────────────────────

/**
 * The run the Market Screener saves (ReitState) after the user picks a preset
 * and changes nothing else. Mirrors marketScreen.js runScoring(), then passes
 * through JSON exactly as localStorage would.
 */
function screenerRun(presetKey) {
  var weights = Object.assign({}, ScoringEngine.PRESETS[presetKey]);
  var investmentCr = AgentContext.defaultInvestmentCr(assets);
  var ranked = AgentContext.rankForScreener(markets, assets, weights, investmentCr);
  var chosen = Governance.chooseTarget(ranked, { override: false });
  var target = chosen.target || chosen.topOverall || null;
  return JSON.parse(JSON.stringify({
    stale:              false,
    weights:            weights,
    weightPreset:       presetKey,
    investmentCr:       investmentCr,
    selectedTargetId:   target ? target.marketId : null,
    ranked:             ranked,
    governanceOverride: false
  }));
}

function buildScenario(presetKey) {
  var label = ScoringEngine.PRESETS[presetKey].label || presetKey;
  var run = screenerRun(presetKey);
  var built = AgentContext.build({
    markets: markets,
    assets:  assets,
    run:     run,
    runNote: "Pre-generated agent cache — " + label + " preset, Market Screener defaults"
  });

  // Exactly the inputs agents.js currentScenario() hashes.
  var descriptor = ScenarioKey.describe({
    marketsDoc:       marketsDoc,
    assets:           assets,
    weights:          built.ctx.weights,
    investmentCr:     built.ctx.investmentCr,
    selectedTargetId: built.ctx.selectedTarget ? built.ctx.selectedTarget.marketId : null,
    ranked:           built.ranked
  });

  return {
    presetKey:  presetKey,
    label:      label,
    ctx:        built.ctx,
    ranked:     built.ranked,
    descriptor: descriptor,
    key:        ScenarioKey.compute(descriptor)
  };
}

// ─── Call the proxy ─────────────────────────────────────────────────────────

function callAgent(agentType, context) {
  return new Promise(function (resolve) {
    var body = JSON.stringify({ agentType: agentType, context: context });
    var req = http.request({
      hostname: API_HOST, port: API_PORT, path: "/api/agent", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, function (res) {
      var buf = "";
      res.on("data", function (c) { buf += c; });
      res.on("end", function () {
        try {
          var j = JSON.parse(buf);
          if (j.error) { return resolve({ ok: false, error: j.error + (j.detail ? " — " + j.detail : "") }); }
          resolve({ ok: true, output: j.output, model: j.model });
        } catch (e) { resolve({ ok: false, error: "unparseable reply: " + e.message }); }
      });
    });
    req.on("error", function (e) { resolve({ ok: false, error: e.message }); });
    req.write(body);
    req.end();
  });
}

function healthCheck() {
  return new Promise(function (resolve) {
    http.get({ hostname: API_HOST, port: API_PORT, path: "/api/health" }, function (res) {
      var buf = "";
      res.on("data", function (c) { buf += c; });
      res.on("end", function () {
        try { resolve(JSON.parse(buf)); } catch (e) { resolve(null); }
      });
    }).on("error", function () { resolve(null); });
  });
}

// ─── Run one scenario's chain, mirroring agents.js runSequence() ─────────────

async function runChain(sc, failures) {
  var agents = {};
  function record(agent, r) {
    if (r.ok) {
      agents[agent] = { output: r.output, model: r.model, cachedAt: new Date().toISOString(), isCached: true };
      console.log("OK   (" + Object.keys(r.output || {}).length + " fields, " + r.model + ")");
    } else {
      failures.push(sc.label + " / " + agent + ": " + r.error);
      console.log("FAIL " + String(r.error).slice(0, 80));
    }
    return r.ok ? r.output : null;
  }
  function line(agent) { process.stdout.write("    " + agent.padEnd(18)); }

  line("dataStatistical");
  var ds = record("dataStatistical", await callAgent("dataStatistical", sc.ctx));

  line("marketScreening");
  var mk = record("marketScreening", await callAgent("marketScreening",
    Object.assign({}, sc.ctx, { dataStatisticalOutput: ds })));

  line("portfolioRisk");
  var rk = record("portfolioRisk", await callAgent("portfolioRisk",
    Object.assign({}, sc.ctx, { dataStatisticalOutput: ds, marketScreeningOutput: mk })));

  var v = sc.validation;
  if (!v.passed) {
    console.log("    orchestrator      SKIPPED — deterministic checks failed: " + v.summary);
    failures.push(sc.label + " / orchestrator: not called, " + v.summary);
    return agents;
  }

  line("orchestrator");
  record("orchestrator", await callAgent("orchestrator", Object.assign({}, sc.ctx, {
    dataStatisticalOutput: ds,
    marketScreeningOutput: mk,
    portfolioRiskOutput:   rk,
    deterministicValidation: {
      passed:  v.passed,
      summary: v.summary,
      checks:  v.checks.map(function (c) { return { label: c.label, passed: c.passed, detail: c.detail }; }),
      limitations: v.limitations
    }
  })));
  return agents;
}

// ─── Main ───────────────────────────────────────────────────────────────────

(async function main() {
  var presetKeys = Object.keys(ScoringEngine.PRESETS);
  var scenarios = presetKeys.map(buildScenario);

  console.log((DRY_RUN ? "DRY RUN — no calls, nothing written\n" : "") +
              "Portfolio: " + assets.length + " assets   Agents: " + CHAIN.join(", ") + "\n");

  var keys = {};
  scenarios.forEach(function (sc) {
    sc.validation = Validator.validate({ context: sc.ctx, ranked: sc.ranked, assets: assets, hhiEngine: HHIEngine });
    var t = sc.ctx.selectedTarget;
    console.log("  " + sc.label.padEnd(24) + " key " + sc.key +
                "   target " + (t ? t.marketId + " (rank " + t.rank + ")" : "—") +
                "   checks " + (sc.validation.passed ? "pass" : "FAIL"));
    if (keys[sc.key]) { throw new Error("Two presets produced the same scenario key: " + keys[sc.key] + ", " + sc.label); }
    keys[sc.key] = sc.label;
  });

  if (DRY_RUN) { return; }

  var health = await healthCheck();
  if (!health) {
    console.error("\nProxy not reachable on :" + API_PORT + " — start it with: node server/server.js");
    process.exit(1);
  }

  var out = {};
  var failures = [];
  for (var i = 0; i < scenarios.length; i++) {
    var sc = scenarios[i];
    console.log("\n  " + sc.label);
    var agents = await runChain(sc, failures);
    if (Object.keys(agents).length) {
      out[sc.key] = {
        label:      sc.label + " preset",
        preset:     sc.presetKey,
        descriptor: sc.descriptor,
        agents:     agents
      };
    }
  }

  var expected = scenarios.length * CHAIN.length;
  if (failures.length) {
    /* A partial cache is not written. It would leave some cards with
     * commentary and others without for the same scenario, and the existing
     * file — whatever it is — stays in place to be rebuilt on the next run. */
    console.error("\n" + failures.length + " of " + expected + " calls failed — cache NOT written:");
    failures.forEach(function (f) { console.error("  " + f); });
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify({
    note: "Pre-generated Gemini agent responses, one scenario per weight preset at the " +
          "Market Screener's defaults. Served only when the local proxy is unreachable " +
          "AND the on-screen scenario key matches exactly. Labelled as cached in the " +
          "interface — these are NOT live calls.",
    builtAt:            new Date().toISOString(),
    format:             "scenarios-v1",
    methodologyVersion: ScenarioKey.METHODOLOGY_VERSION,
    agentKeys:          CHAIN,
    scenarios:          out
  }, null, 1) + "\n", "utf8");

  console.log("\nWrote public/data/agent-cache.json — " + Object.keys(out).length +
              " scenarios, " + expected + " agent replies");
}());

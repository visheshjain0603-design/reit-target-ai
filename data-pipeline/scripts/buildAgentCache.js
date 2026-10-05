/**
 * buildAgentCache.js — pre-generate agent commentary for each weight preset
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * PURPOSE
 * -------
 * The four Gemini agents are reached through a local Node proxy on port 3001,
 * which cannot exist on a static host. This script runs the chain against the
 * real API once per weight preset and writes the replies to
 * public/data/agent-cache.json. When the page is not served by the proxy, the
 * Agents page offers that stored commentary — but only for a run whose
 * ScenarioKey matches exactly.
 *
 * WHAT A SCENARIO IS
 * ------------------
 * One entry per preset at the application's canonical defaults: sample
 * portfolio, the default investment (10% of portfolio value, ₹50 Cr), the
 * simulation-support screen applied, automatic selection. Each scenario is the
 * SAME analysis object every page renders — public/js/analysisRun.js computes
 * it here exactly as it does in the browser — so stored commentary describes
 * exactly the context the page would send.
 *
 * VALIDATED BEFORE IT IS WRITTEN
 * ------------------------------
 * Every reply is checked by public/js/agentOutputCheck.js against the context
 * it was given: market IDs exist and are in the context, ranks match, figures
 * match the context at the stated precision, exclusion reasons match the
 * screen, retired terms and evidence overclaims are absent, the Orchestrator
 * names the selected target and states that calibration is unverified. A reply
 * that fails is sent back once or twice with the specific problems listed
 * (context.revisionNotes). If any reply still fails, NOTHING is written: a
 * partial or inconsistent cache would be worse than none.
 *
 * The scenario's target, preset, weights and fingerprints are also asserted
 * against the descriptor before writing.
 *
 * Run (proxy running with its key in server/.env — the key is never read here):
 *   node server/server.js &
 *   node data-pipeline/scripts/buildAgentCache.js
 *
 *   --dry-run   build every scenario, context, key and deterministic check;
 *               call nothing and write nothing. Needs no proxy and no key.
 */

"use strict";

var fs   = require("fs");
var path = require("path");
var http = require("http");

var PROJECT = path.join(__dirname, "..", "..");
var OUT     = path.join(PROJECT, "public", "data", "agent-cache.json");
var JS      = path.join(PROJECT, "public", "js");
var DATA    = path.join(PROJECT, "public", "data");

var API_HOST = "127.0.0.1";   // the proxy listens on loopback by default (server/server.js)
var API_PORT = parseInt(process.env.PORT || "3001", 10);
var DRY_RUN  = process.argv.indexOf("--dry-run") !== -1;
var MAX_REVISIONS = 2;

var AnalysisRun      = require(path.join(JS, "analysisRun.js"));
var AgentOutputCheck = require(path.join(JS, "agentOutputCheck.js"));
var ScenarioKey      = require(path.join(JS, "scenarioKey.js"));
var AppMeta          = require(path.join(JS, "appMeta.js"));

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

var marketsDoc    = readJson(path.join(DATA, "markets.json"));
var portfolioDoc  = readJson(path.join(DATA, "portfolio.json"));
var statisticsDoc = readJson(path.join(DATA, "statistics.json"));
var metaDoc       = readJson(path.join(DATA, "meta.json"));

var DATA_IN = {
  marketsDoc:     marketsDoc,
  sampleAssets:   portfolioDoc.assets,
  portfolioMode:  "sample",
  customAssets:   [],
  statisticsDoc:  statisticsDoc,
  sourceOutcomes: (metaDoc.sourceVerification && metaDoc.sourceVerification.outcomes) || {}
};

var CHAIN = AppMeta.AGENTS.map(function (a) { return a.key; });

// ─── Scenarios ──────────────────────────────────────────────────────────────

function buildScenario(presetKey) {
  var run = AnalysisRun.compute({ preset: presetKey }, DATA_IN);
  /* The scenario must be exactly what the application computes for this
   * preset at its defaults. */
  var d = run.scenarioDescriptor;
  if (d.selectedTargetId !== run.recommendedCandidateId || d.selectionMode !== "auto" ||
      d.governanceOverride !== false || d.contextVersion !== ScenarioKey.CONTEXT_VERSION) {
    throw new Error("Scenario " + presetKey + " is not at the canonical defaults.");
  }
  return { presetKey: presetKey, label: run.presetLabel, run: run, ctx: run.agentContext,
           descriptor: d, key: run.scenarioKey };
}

// ─── Proxy ──────────────────────────────────────────────────────────────────

function post(agentType, context) {
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

function health() {
  return new Promise(function (resolve) {
    http.get({ hostname: API_HOST, port: API_PORT, path: "/api/health" }, function (res) {
      var buf = "";
      res.on("data", function (c) { buf += c; });
      res.on("end", function () { try { resolve(JSON.parse(buf)); } catch (e) { resolve(null); } });
    }).on("error", function () { resolve(null); });
  });
}

/**
 * Call one agent, check the reply, and send it back with the specific
 * problems listed until it passes or the revision budget is spent.
 */
async function callChecked(agentKey, ctx, log) {
  var notes = null, last = null;
  for (var attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    var sendCtx = notes ? Object.assign({}, ctx, { revisionNotes: notes }) : ctx;
    var r = await post(agentKey, sendCtx);
    if (!r.ok) { return { ok: false, error: r.error, calls: attempt + 1 }; }
    var check = AgentOutputCheck.check(agentKey, r.output, ctx, marketsDoc.markets);
    last = { output: r.output, model: r.model, check: check, calls: attempt + 1 };
    if (check.ok) { last.ok = true; return last; }
    log("      revision " + (attempt + 1) + ": " + check.issues.length + " issue(s) — " +
        check.issues.slice(0, 3).map(function (i) { return i.message; }).join(" | "));
    notes = check.issues.map(function (i) {
      return (i.field ? i.field + ": " : "") + i.message + (i.text ? " (in: “" + i.text.slice(0, 160) + "”)" : "");
    });
  }
  last.ok = false;
  return last;
}

async function runChain(sc, log) {
  var out = {}, outputs = {}, calls = 0;
  function line(k) { process.stdout.write("    " + k.padEnd(18)); }
  function record(k, r) {
    calls += r.calls || 1;
    if (r.ok) {
      out[k] = { output: r.output, model: r.model, cachedAt: new Date().toISOString(), isCached: true,
                 checkedBy: "agentOutputCheck.js", checkPassed: true };
      outputs[k] = r.output;
      console.log("OK   (" + r.model + (r.calls > 1 ? ", " + r.calls + " calls" : "") + ")");
    } else {
      console.log("FAIL " + (r.error || (r.check ? r.check.issues.length + " issue(s) remain" : "unknown")));
      if (r.check) { r.check.issues.forEach(function (i) { console.log("        - " + i.field + ": " + i.message); }); }
    }
    return r.ok;
  }

  line("dataStatistical");
  if (!record("dataStatistical", await callChecked("dataStatistical", sc.ctx, log))) { return { ok: false, calls: calls }; }
  line("marketScreening");
  if (!record("marketScreening", await callChecked("marketScreening",
      Object.assign({}, sc.ctx, { dataStatisticalOutput: outputs.dataStatistical }), log))) { return { ok: false, calls: calls }; }
  line("portfolioRisk");
  if (!record("portfolioRisk", await callChecked("portfolioRisk",
      Object.assign({}, sc.ctx, { dataStatisticalOutput: outputs.dataStatistical,
                                  marketScreeningOutput: outputs.marketScreening }), log))) { return { ok: false, calls: calls }; }

  var v = sc.run.validation;
  if (!v.passed) { console.log("    orchestrator      SKIPPED — " + v.summary); return { ok: false, calls: calls }; }
  line("orchestrator");
  if (!record("orchestrator", await callChecked("orchestrator", Object.assign({}, sc.ctx, {
      dataStatisticalOutput: outputs.dataStatistical,
      marketScreeningOutput: outputs.marketScreening,
      portfolioRiskOutput:   outputs.portfolioRisk,
      deterministicValidation: {
        passed: v.passed, summary: v.summary,
        checks: v.checks.map(function (c) { return { label: c.label, passed: c.passed, detail: c.detail }; }),
        limitations: v.limitations
      }
    }), log))) { return { ok: false, calls: calls }; }

  return { ok: true, agents: out, calls: calls };
}

// ─── Main ───────────────────────────────────────────────────────────────────

(async function main() {
  var scenarios = AnalysisRun.PRESET_KEYS.map(buildScenario);

  console.log((DRY_RUN ? "DRY RUN — no calls, nothing written\n" : "") +
              "Portfolio: " + portfolioDoc.assets.length + " holdings   Agents: " + CHAIN.join(", ") +
              "   Context version " + ScenarioKey.CONTEXT_VERSION + "\n");

  var seen = {};
  scenarios.forEach(function (sc) {
    var t = sc.ctx.selectedTarget;
    console.log("  " + sc.label.padEnd(24) + " key " + sc.key + "   target " + t.marketId +
                " (raw rank " + t.rawRank + ", eligible rank " + t.eligibleRank + ")" +
                "   checks " + (sc.run.validation.passed ? "pass" : "FAIL"));
    if (seen[sc.key]) { throw new Error("Two presets produced the same scenario key."); }
    seen[sc.key] = true;
  });
  if (DRY_RUN) { return; }

  if (!(await health())) {
    console.error("\nProxy not reachable on :" + API_PORT + " — start it with: node server/server.js");
    process.exit(1);
  }

  var out = {}, totalCalls = 0;
  for (var i = 0; i < scenarios.length; i++) {
    var sc = scenarios[i];
    console.log("\n  " + sc.label);
    var res = await runChain(sc, function (m) { console.log(m); });
    totalCalls += res.calls;
    if (!res.ok) {
      console.error("\n" + sc.label + " did not produce four checked replies — cache NOT written (" +
                    totalCalls + " API calls made).");
      process.exit(1);
    }
    out[sc.key] = {
      label:      sc.label + " preset",
      preset:     sc.presetKey,
      targetId:   sc.descriptor.selectedTargetId,
      descriptor: sc.descriptor,
      agents:     res.agents
    };
  }

  fs.writeFileSync(OUT, JSON.stringify({
    note: "Pre-generated Gemini agent responses, one scenario per weight preset at the application's " +
          "canonical defaults. Served only when the page is not using the live proxy AND the scenario key " +
          "matches exactly. Every reply passed agentOutputCheck.js before it was written. Labelled as " +
          "stored text in the interface — these are NOT live calls.",
    builtAt:            new Date().toISOString(),
    format:             "scenarios-v2",
    methodologyVersion: ScenarioKey.METHODOLOGY_VERSION,
    contextVersion:     ScenarioKey.CONTEXT_VERSION,
    agentKeys:          CHAIN,
    apiCalls:           totalCalls,
    scenarios:          out
  }, null, 1) + "\n", "utf8");

  console.log("\nWrote public/data/agent-cache.json — " + Object.keys(out).length + " scenarios, " +
              (Object.keys(out).length * CHAIN.length) + " checked replies, " + totalCalls + " API calls.");
}());

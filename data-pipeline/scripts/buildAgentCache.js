/**
 * buildAgentCache.js — capture one full agent run to a committed file
 * SPJIMR — BA Theme 4 (Academic Demo).  ALL DATA IS SYNTHETIC.
 *
 * PURPOSE
 * -------
 * The six Gemini agents are reached through a local Node proxy on port 3001.
 * That proxy cannot exist on a static host, and free-tier Gemini quota is
 * small enough that a live demo can fail through no fault of the project.
 *
 * This script runs the chain once against the real API and writes the replies
 * to public/data/agent-cache.json. The application falls back to that file
 * whenever the proxy is unreachable, so:
 *
 *   - the published site shows complete agent output with no server at all
 *   - a viva demo cannot be derailed by a quota wall or a dropped connection
 *
 * HONESTY REQUIREMENT
 * -------------------
 * Cached replies are labelled as pre-generated in the interface, and carry
 * the timestamp and model they came from. They must never be presented as a
 * live call. Regenerate them whenever the underlying data changes, or the
 * commentary will describe a dataset that no longer exists.
 *
 * Run (the proxy must be running on :3001):
 *   node server/server.js &
 *   node data-pipeline/scripts/buildAgentCache.js
 */

"use strict";

var fs   = require("fs");
var path = require("path");
var http = require("http");

var PROJECT = path.join(__dirname, "..", "..");
var OUT     = path.join(PROJECT, "public", "data", "agent-cache.json");

var API_HOST = "localhost";
var API_PORT = parseInt(process.env.PORT || "3001", 10);

var Stats = require(path.join(PROJECT, "public", "js", "stats.js"));
var HHI   = require(path.join(PROJECT, "public", "js", "hhi.js"));
var Scoring = require(path.join(PROJECT, "public", "js", "scoringEngine.js"));

var markets   = JSON.parse(fs.readFileSync(path.join(PROJECT, "public", "data", "markets.json"), "utf8")).markets;
var portfolio = JSON.parse(fs.readFileSync(path.join(PROJECT, "public", "data", "portfolio.json"), "utf8"));

// ─── Rebuild the same context the browser sends ─────────────────────────────

var assets   = portfolio.assets;
var totalVal = assets.reduce(function (s, a) { return s + a.propertyValue; }, 0);
var totalRent = assets.reduce(function (s, a) { return s + a.annualRent; }, 0);
var wYield   = totalVal ? totalRent / totalVal : 0;

var cityHHI = HHI.cityHHI ? HHI.cityHHI(assets) : null;
var typeHHI = HHI.typeHHI ? HHI.typeHHI(assets) : null;

var weights = (Scoring.PRESETS && Scoring.PRESETS.balanced) || null;

// rankMarkets returns { ranked, ranges, validation, weightsValid } — not a
// bare array. Unwrap defensively so a future shape change fails loudly here
// rather than silently caching an empty top-3.
var rankResult = (Scoring.rankMarkets && weights) ? Scoring.rankMarkets(markets, weights) : null;
var ranked = rankResult && Array.isArray(rankResult.ranked) ? rankResult.ranked
           : (Array.isArray(rankResult) ? rankResult : null);
if (!ranked) {
  throw new Error("rankMarkets did not yield a ranked array — got: " +
                  JSON.stringify(rankResult && Object.keys(rankResult)));
}
var top3 = ranked.slice(0, 3);

var statsContext = {
  portfolioStats: Stats.portfolioStats(markets),
  cityStats:      Stats.cityStats(markets),
  outlierSummary: Stats.outlierSummary(markets)
};

var investmentCr = Math.round(totalVal / 1e7 * 0.10 * 100) / 100;

var baseContext = {
  dataNote: "SYNTHETIC ACADEMIC DATA — not real market values",
  runNote:  "Pre-generated agent cache build",
  portfolio: {
    assetCount:       assets.length,
    totalValueCr:     parseFloat((totalVal / 1e7).toFixed(3)),
    annualRentCr:     parseFloat((totalRent / 1e7).toFixed(3)),
    weightedYieldPct: parseFloat((wYield * 100).toFixed(3)),
    cityHHI:          cityHHI !== null ? parseFloat(cityHHI.toFixed(4)) : null,
    assetTypeHHI:     typeHHI !== null ? parseFloat(typeHHI.toFixed(4)) : null
  },
  investmentCr:   investmentCr,
  weights:        weights,
  top3Ranked:     top3,
  selectedTarget: top3[0] || null,
  statsContext:   statsContext
};

var CHAIN = ["dataQuality", "statisticalAnalysis", "marketScreening",
             "diversification", "validation", "orchestrator"];

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

// ─── Run the chain sequentially, mirroring the app's order ──────────────────

(async function main() {
  console.log("Building agent cache against http://" + API_HOST + ":" + API_PORT);
  console.log("Portfolio: " + assets.length + " assets, ₹" +
              (totalVal / 1e7).toFixed(0) + " Cr   Top pick: " +
              (top3[0] ? top3[0].city + " / " + top3[0].locality : "—") + "\n");

  var cache = {};
  var results = {};
  var failures = [];

  for (var i = 0; i < CHAIN.length; i++) {
    var agent = CHAIN[i];
    var ctx = Object.assign({}, baseContext);

    // Later agents in the chain see the earlier agents' output, as in the app.
    if (agent === "orchestrator" || agent === "validation") {
      ctx.priorAgentOutputs = results;
    }

    process.stdout.write("  " + agent.padEnd(22));
    var r = await callAgent(agent, ctx);
    if (r.ok) {
      results[agent] = r.output;
      cache[agent] = {
        output: r.output,
        model:  r.model,
        cachedAt: new Date().toISOString(),
        isCached: true
      };
      console.log("OK   (" + Object.keys(r.output || {}).length + " fields, " + r.model + ")");
    } else {
      failures.push(agent + ": " + r.error);
      console.log("FAIL " + r.error.slice(0, 80));
    }
  }

  if (!Object.keys(cache).length) {
    console.error("\nNo agent returned successfully — cache NOT written.");
    console.error("Is the proxy running?  node server/server.js");
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify({
    note: "Pre-generated Gemini agent responses. Served when the local proxy is " +
          "unreachable (for example on a static deployment). Clearly labelled as " +
          "cached in the interface — these are NOT live calls.",
    builtAt: new Date().toISOString(),
    datasetObservations: 2156,
    agents: cache
  }, null, 1), "utf8");

  console.log("\nWrote public/data/agent-cache.json — " +
              Object.keys(cache).length + " of " + CHAIN.length + " agents cached");
  if (failures.length) {
    console.log("Missing (will show as unavailable when offline):");
    failures.forEach(function (f) { console.log("  " + f); });
  }
}());

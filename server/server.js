/**
 * server.js — Local Gemini API proxy for REIT Target AI
 * NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * IMPORTANT: The GEMINI_API_KEY is read from .env and NEVER sent to the browser.
 *
 * Start:  node server.js          (or: npm start)
 * Requires Node.js >= 18 (matches server/package.json)
 *
 * Routes:
 *   POST /api/agent      — run one agent call
 *   GET  /api/status     — health check + model info
 *   GET  /               — serves public/ as static files
 */

"use strict";

var http   = require("http");
var https  = require("https");
var fs     = require("fs");
var path   = require("path");
var url    = require("url");

// ─── Load .env ──────────────────────────────────────────────────────────────

(function loadDotEnv() {
  var envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) { return; }
  var lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line[0] === "#") { continue; }
    var eq = line.indexOf("=");
    if (eq === -1) { continue; }
    var key = line.slice(0, eq).trim();
    var val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) { process.env[key] = val; }
  }
}());

var API_KEY   = process.env.GEMINI_API_KEY || "";
var MODEL     = process.env.GEMINI_MODEL   || "gemini-3.1-flash-lite";   // same default as .env.example
var PORT      = parseInt(process.env.PORT  || "3001", 10);
/* Loopback by default: the development proxy is reachable only from this
 * machine. Serving it to a network is an explicit choice (REIT_HOST=0.0.0.0),
 * never a silent default, because the proxy spends the configured API key. */
var HOST      = process.env.REIT_HOST || "127.0.0.1";
var PUBLIC_DIR = path.join(__dirname, "..", "public");

// Output budget per agent call. Must be generous enough for the full JSON
// object each agent returns; see the thinkingConfig note in callGemini().
var MAX_OUTPUT_TOKENS = parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || "4096", 10);

// Transient-failure retry settings. The Gemini endpoint intermittently returns
// 429/500/503 ("model is currently experiencing high demand"). Because the
// agents run back to back, a single un-retried blip made individual agent cards
// show "AI explanation unavailable" at random.
var MAX_RETRIES  = parseInt(process.env.GEMINI_MAX_RETRIES || "3", 10);
var RETRY_BASE_MS = 800;

// Models tried in order. Free-tier quota is counted per model per day, so
// listing several gives the demo a much larger combined allowance: when the
// first model's daily quota runs out the next one takes over automatically.
// Override with GEMINI_FALLBACK_MODELS (comma-separated) in server/.env.
var FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ||
                       "gemini-3.1-flash-lite,gemini-3.5-flash,gemini-2.5-flash-lite")
                      .split(",")
                      .map(function (s) { return s.trim(); })
                      .filter(Boolean);

var MODEL_CHAIN = [MODEL].concat(FALLBACK_MODELS.filter(function (m) { return m !== MODEL; }));

// ─── Response cache (in-memory, by content hash) ─────────────────────────────

var _agentCache = {};
var CACHE_MAX = 50;  // max entries before oldest are evicted

function simpleHash(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h & h; // force 32-bit
  }
  return (h >>> 0).toString(16);
}

function cacheKey(agentType, context) {
  return agentType + ':' + simpleHash(JSON.stringify(context));
}

function cacheGet(key) {
  return _agentCache[key] || null;
}

function cachePut(key, value) {
  // Evict oldest entry when at capacity
  var keys = Object.keys(_agentCache);
  if (keys.length >= CACHE_MAX) {
    delete _agentCache[keys[0]];
  }
  _agentCache[key] = value;
}



// ─── MIME types for static serving ──────────────────────────────────────────

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv":  "text/csv; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt":  "text/plain; charset=utf-8"
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(res, status, body) {
  var payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  });
  res.end(payload);
}

function readBody(req, callback) {
  var chunks = [];
  req.on("data", function (c) { chunks.push(c); });
  req.on("end", function () {
    try {
      callback(null, JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch (e) {
      callback(new Error("Invalid JSON body."));
    }
  });
  req.on("error", callback);
}

function serveStatic(reqPath, res) {
  var safePath = path.join(PUBLIC_DIR, path.normalize(reqPath));
  // Prevent directory traversal
  if (safePath.indexOf(PUBLIC_DIR) !== 0) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    var indexPath = path.join(safePath, "index.html");
    if (fs.existsSync(indexPath)) { safePath = indexPath; }
    else {
      res.writeHead(404);
      res.end("Not found: " + reqPath);
      return;
    }
  }
  var ext  = path.extname(safePath).toLowerCase();
  var mime = MIME[ext] || "application/octet-stream";
  var data = fs.readFileSync(safePath);
  res.writeHead(200, {
    "Content-Type": mime,
    // Development server: never let the browser serve a stale copy of the app
    // after an edit. Without this, Safari kept running an old agents.js even
    // after the file on disk had changed.
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma":        "no-cache",
    "Expires":       "0"
  });
  res.end(data);
}

// ─── Gemini API call ─────────────────────────────────────────────────────────

/**
 * Call Gemini generateContent API.
 * @param {string} systemInstruction  - agent system prompt
 * @param {string} userPrompt         - JSON context + question
 * @returns {Promise<{text: string}>}
 */
function callGemini(systemInstruction, userPrompt, modelName, responseSchema) {
  var activeModel = modelName || MODEL;
  return new Promise(function (resolve, reject) {
    if (!API_KEY) {
      return reject(new Error("GEMINI_API_KEY is not set. Add it to server/.env."));
    }

    var body = JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        // Gemini 3.x models "think" before answering, and thinking tokens are
        // drawn from the SAME budget as maxOutputTokens. With the previous
        // 1024-token budget, ~979 tokens were consumed by internal reasoning,
        // leaving too few for the answer: responses came back truncated
        // (invalid JSON) or completely empty. These agents only interpret
        // numbers that have already been computed deterministically in the
        // browser, so no internal reasoning is required.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    });
    if (responseSchema) {
      /* Hold the model to the exact output shape: prose fields only, no
       * figures it could fill inconsistently. */
      var parsedBody = JSON.parse(body);
      parsedBody.generationConfig.responseSchema = responseSchema;
      body = JSON.stringify(parsedBody);
    }

    var apiPath = "/v1beta/models/" + activeModel + ":generateContent?key=" + API_KEY;
    var options = {
      hostname: "generativelanguage.googleapis.com",
      port: 443,
      path: apiPath,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    var req = https.request(options, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        try {
          var raw = Buffer.concat(chunks).toString("utf8");
          var parsed = JSON.parse(raw);
          if (parsed.error) {
            var apiErr = new Error("Gemini API error: " + parsed.error.message);
            var msg = parsed.error.message || "";
            apiErr.statusCode = res.statusCode;
            apiErr.model      = activeModel;

            // Distinguish a hard quota wall from a momentary blip. A free-tier
            // key allows only ~20 requests PER DAY on some models, and one
            // "Run Agent Analysis" spends four of them. Waiting will not clear
            // that, so the caller should switch models instead of sleeping.
            apiErr.quotaExhausted =
              parsed.error.status === "RESOURCE_EXHAUSTED" ||
              /exceeded your current quota|quota|billing/i.test(msg);

            apiErr.retryable = !apiErr.quotaExhausted &&
                               (isRetryableStatus(res.statusCode) ||
                                /high demand|overload|try again later|rate limit/i.test(msg));

            // Honour the server's own advice on when to retry, when offered.
            var details = parsed.error.details || [];
            for (var d = 0; d < details.length; d++) {
              var rd = details[d].retryDelay;
              if (rd) {
                var secs = parseFloat(String(rd).replace("s", ""));
                if (!isNaN(secs)) { apiErr.retryAfterMs = Math.round(secs * 1000); }
              }
            }
            return reject(apiErr);
          }

          var cand = (parsed.candidates && parsed.candidates[0]) || null;
          if (!cand) { return reject(new Error("Gemini returned no candidates.")); }

          // Concatenate every non-thought text part. Gemini 3.x may split the
          // answer across parts and interleaves "thought" parts that must not
          // be treated as content.
          var parts = (cand.content && cand.content.parts) || [];
          var text = parts
            .filter(function (p) { return p && p.text && p.thought !== true; })
            .map(function (p) { return p.text; })
            .join("");

          if (cand.finishReason === "MAX_TOKENS") {
            return reject(new Error(
              "Gemini hit the output token limit (" + MAX_OUTPUT_TOKENS + ") and the " +
              "reply was cut off mid-JSON. Raise GEMINI_MAX_OUTPUT_TOKENS in server/.env."
            ));
          }
          if (!text) {
            return reject(new Error(
              "Empty response from Gemini (finishReason: " + (cand.finishReason || "unknown") + ")."
            ));
          }
          resolve({ text: text, model: activeModel });
        } catch (e) {
          reject(new Error("Failed to parse Gemini response: " + e.message));
        }
      });
    });
    req.on("error", function (e) {
      e.retryable = true;   // network blips are always worth one more try
      reject(e);
    });
    req.write(body);
    req.end();
  });
}

/**
 * Turn Gemini's reply into an object, tolerating the three shapes it can take:
 * clean JSON, JSON fenced in a ```json block (with or without leading
 * whitespace), or JSON preceded/followed by stray prose. Falls back to
 * { raw: text } only when nothing parseable can be recovered.
 */
function extractJson(text) {
  if (typeof text !== "string") { return { raw: String(text) }; }

  var attempts = [];
  attempts.push(text);

  // Strip markdown fences anywhere in the string, not just at position 0.
  var fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) { attempts.push(fenced[1]); }

  // Last resort: slice from the first brace to the last matching one.
  var first = text.indexOf("{");
  var last  = text.lastIndexOf("}");
  if (first !== -1 && last > first) { attempts.push(text.slice(first, last + 1)); }

  for (var i = 0; i < attempts.length; i++) {
    var candidate = String(attempts[i]).trim();
    if (!candidate) { continue; }
    try {
      var obj = JSON.parse(candidate);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) { return obj; }
    } catch (e) { /* try the next shape */ }
  }
  return { raw: text };
}

/** HTTP statuses worth retrying: rate limit + server-side transient faults. */
function isRetryableStatus(code) {
  return code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
}

/**
 * callGemini with exponential backoff on transient failures.
 * Permanent errors (bad key, unknown model, malformed request) fail fast so
 * the real problem is not hidden behind four slow retries.
 */
function callGeminiWithRetry(systemInstruction, userPrompt, modelName, attempt, schema) {
  attempt = attempt || 0;
  return callGemini(systemInstruction, userPrompt, modelName, schema).catch(function (err) {
    if (!err.retryable || attempt >= MAX_RETRIES) { throw err; }
    var waitMs = err.retryAfterMs ||
                 (RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 250));
    console.log("  ↻ transient Gemini error on " + (modelName || MODEL) + " (" +
                err.message.slice(0, 70) + "), retry " + (attempt + 1) + "/" +
                MAX_RETRIES + " in " + waitMs + "ms");
    return new Promise(function (r) { setTimeout(r, waitMs); })
      .then(function () {
        return callGeminiWithRetry(systemInstruction, userPrompt, modelName, attempt + 1, schema);
      });
  });
}

/**
 * Try each model in MODEL_CHAIN in turn.
 *
 * Free-tier quota is counted PER MODEL PER DAY, and on some models the
 * allowance is as low as 20 requests, which a handful of analysis runs exhaust.
 * When a model reports RESOURCE_EXHAUSTED there is nothing
 * to wait for, so we move straight to the next model rather than failing the
 * agent card. Transient errors are still retried on the current model first.
 */
function callGeminiWithFallback(systemInstruction, userPrompt, idx, schema) {
  idx = idx || 0;
  var modelName = MODEL_CHAIN[idx];
  return callGeminiWithRetry(systemInstruction, userPrompt, modelName, 0, schema)
    .catch(function (err) {
      var hasNext = idx + 1 < MODEL_CHAIN.length;
      if (err.quotaExhausted && hasNext) {
        console.warn("  ⚠ " + modelName + " daily quota exhausted — falling back to " +
                     MODEL_CHAIN[idx + 1]);
        return callGeminiWithFallback(systemInstruction, userPrompt, idx + 1, schema);
      }
      // An unusable model name (404/400) should also not block the demo.
      if (!err.quotaExhausted && hasNext &&
          (err.statusCode === 404 || err.statusCode === 400)) {
        console.warn("  ⚠ " + modelName + " unusable (" + err.statusCode +
                     ") — falling back to " + MODEL_CHAIN[idx + 1]);
        return callGeminiWithFallback(systemInstruction, userPrompt, idx + 1, schema);
      }
      if (err.quotaExhausted) {
        err.message = "Daily free-tier quota is used up on every configured model (" +
                      MODEL_CHAIN.join(", ") + "). It resets at midnight Pacific time. " +
                      "The deterministic analysis on this page is unaffected.";
      }
      throw err;
    });
}

// ─── Agent system prompts ────────────────────────────────────────────────────

/*
 * FOUR AGENTS, NOT SIX.
 *
 * The original design had six. Two were removed for reasons that are
 * methodological rather than a matter of tidiness:
 *
 *   Data Quality and Statistical Analysis were one job split in two. Both
 *   received the same statistical context, both commented on sample sizes and
 *   dispersion, and their outputs therefore overlapped — occasionally
 *   describing the same figure in two incompatible ways in the same run. They
 *   are now one agent with one view of the dataset.
 *
 *   Validation was never a language task. Every check it made — do the weights
 *   total 100%, are the scores inside 0–100, is the selected target present in
 *   the ranking, do the HHI figures reproduce — has exactly one correct answer
 *   that arithmetic establishes. A model could get it wrong, and because its
 *   verdict gated the Orchestrator, a wrong verdict either suppressed a valid
 *   recommendation or admitted an invalid one. Those checks are now
 *   public/js/validator.js: deterministic, offline, reproducible, and run
 *   BEFORE any model call. The Orchestrator is reached only when they pass.
 *
 * What this buys, beyond correctness: a free-tier key allows very few requests
 * per model per day, and the old chain spent six of them per analysis run. It
 * now spends four, and the one check that must never be wrong no longer
 * depends on a network call at all.
 *
 * Every prompt below is constrained the same way: the figures are computed
 * deterministically in the browser, and the agent's only job is to explain
 * them. None of them may recalculate, rank, or introduce a number.
 */

/* The response schemas are shared with the browser and the cache builder, so the
 * shape the model is held to and the shape the output checker verifies are one
 * definition (public/js/agentOutputCheck.js). */
var AgentOutputCheck = require(path.join(__dirname, "..", "public", "js", "agentOutputCheck.js"));

/* Rules every agent follows. Stated once so the four prompts cannot drift. */
var COMMON_RULES = [
  "SHARED RULES (all four agents):",
  "A. The data is SYNTHETIC. Say so. Nothing here describes a real property, market or transaction.",
  "B. You interpret figures that were computed deterministically. Never calculate, estimate, rank, re-rank or validate anything.",
  "C. Quote every figure EXACTLY as the context writes it, with the same decimals: \"7.00%\" not \"7%\", \"0.4130\" not \"0.413\", \"67.71\" not \"67.7\". Never introduce a figure that is not in the context.",
  "D. Use the context's vocabulary: raw rank, eligible rank, highest raw-score market, shortlist candidate, selected target, next eligible candidate, highest raw-score alternative, simulation-support screen, simulated observations, Assumption Support Grade, external calibration. NEVER write \"runner-up\", \"evidence floor\", \"confidence grade\" or \"strong evidence\".",
  "E. A segment's rank is its rawRank (or its eligibleRank among segments passing the screen). Never say a segment \"ranked first\" unless its rawRank is 1.",
  "F. When you say why a segment fails the simulation-support screen, use ITS OWN exclusionReasons / failsScreenOn: some fail on simulated observations, some on Assumption Support Grade alone, some on both. Never attribute a grade-only failure to sample size.",
  "G. Simulation support is NOT evidence. More simulated observations make a segment's estimated median more precise around the project's assumed distribution; they do not narrow the P10–P90 spread of the simulated observations and do not show that the figures are true of any real market. The P10–P90 range is the spread of the simulated observations (their middle 80%), never a confidence interval. Thirty observations is a project convention chosen by the authors, not a statistical guarantee. External calibration is Unverified for every segment.",
  "H. Figures in marketDataset describe the 50 candidate market segments, NOT the portfolio. Figures in portfolio describe the existing holdings. Never mix them.",
  "I. Refer to records as simulated market observations — never properties, listings or transactions.",
  "J. If the context contains revisionNotes, your previous answer broke the rules listed there. Correct every one.",
  "K. Write plain English. Never write context field names such as rawRank, eligibleRank, factorScores, grossYieldPct or recommendedCandidate — say \"raw rank 8\", \"rental yield factor score\", \"gross yield 7.00%\".",
  "L. selectionMode \"auto\" means the selected target IS the shortlist candidate; never call it manually selected. Only when selectionMode is \"manual\" is it a manually selected target.",
  "M. Write money as ₹<figure> Cr, for example \"₹692.84 Cr\", never a bare number.",
  "N. Respond ONLY with JSON matching the required schema. No markdown."
].join("\n");

var AGENT_PROMPTS = {

  dataStatistical: [
    "You are the Data & Statistical Analyst for REIT Target AI, an academic demonstration system.",
    "Your role: describe the market-segment dataset (marketDataset), its simulation support (how many simulated observations stand behind each segment, by city), the spread of segment gross yields, the segment-median outliers (segmentMedianOutliers, using its definition), and the known synthetic anomalies (knownSyntheticAnomalies).",
    "Name cities and counts from segmentsBelowThresholdByCity, smallestSegmentObservations and segmentsBelowObservationThreshold. Write numbers, never field names.",
    COMMON_RULES
  ].join("\n"),

  marketScreening: [
    "You are the Market Screening Analyst for REIT Target AI, an academic demonstration system.",
    "Your role: explain why the selected target (selectedTarget) scored as it did, using its contributions and factorScores; name its dominant factor; compare it with comparisonMarket, calling that segment by its exact role (comparisonMarket.role); and explain the simulation-support screen outcome for the segments listed in higherRawScoreExclusions.",
    "State the selected target's rawRank and eligibleRank exactly. If selectionMode is \"manual\", say it is a manually selected target and name the shortlist candidate (recommendedCandidate).",
    "The composite score measures attractiveness only. The screen is a separate test of simulation support. Never imply a score was adjusted.",
    COMMON_RULES
  ].join("\n"),

  portfolioRisk: [
    "You are the Portfolio Risk & Scenario Analyst for REIT Target AI, an academic demonstration system.",
    "Your role: interpret the concentration block (city and asset-type HHI before and after investing in the selected target), the portfolio weighted yield before and after, and the three-year projections block.",
    "HHI above 0.25 is concentrated, 0.15 to 0.25 moderate, below 0.15 diversified — descriptive benchmarks, not regulatory thresholds. Never use 'safe' or 'dangerous'. A lower HHI is better diversified; state the concentration that REMAINS after the investment.",
    "State the projection assumptions (flat growth, no leverage, tax, fees or transaction costs) before what they show.",
    COMMON_RULES
  ].join("\n"),

  orchestrator: [
    "You are the Investment Orchestrator for REIT Target AI, an academic demonstration system.",
    "You receive the three analysts' outputs and the result of the deterministic checks performed in code. You are called only because those checks passed. The checks are arithmetic, not opinion: do not re-perform them or claim to have verified anything.",
    "Your role: synthesise the analyses into one structured summary of the SELECTED TARGET. recommendationSummary must name selectedTarget.name and its role: \"shortlist candidate\" (the highest-ranked candidate passing the simulation-support screen) or \"manually selected target\". This is an exploratory model candidate, never an investment recommendation.",
    "screeningBasis: why the screen produced this candidate, citing each higher raw-score segment's own exclusion reason. nextSteps MUST state that external calibration remains unverified and that further evidence collection and due diligence are required before any real decision.",
    "importantRisks must include at least one risk arising from the data itself (synthetic data, simulation-only support, unverified calibration).",
    COMMON_RULES
  ].join("\n")
};

/*
 * Legacy agent names from the six-agent design. Requests naming one of these
 * are served by the agent that absorbed its job rather than rejected, so an
 * older cached scenario file or a bookmarked request keeps working. Nothing in
 * the current application sends these.
 */
var LEGACY_AGENT_ALIASES = {
  dataQuality:         "dataStatistical",
  statisticalAnalysis: "dataStatistical",
  portfolioAnalysis:   "portfolioRisk",
  diversification:     "portfolioRisk"
};

/* The deterministic checks replaced the validation agent outright. A request
 * for it is not an alias to anything — answering it with model prose would
 * reintroduce exactly the problem the change removed — so it is refused with
 * an explanation of where the checks now live. */
var RETIRED_AGENTS = {
  validation: "The validation agent was replaced by deterministic checks in " +
              "public/js/validator.js, which run in the browser before any model call. " +
              "There is no model prompt for it, by design."
};

function resolveAgentType(name) {
  if (AGENT_PROMPTS[name]) { return name; }
  if (LEGACY_AGENT_ALIASES[name]) { return LEGACY_AGENT_ALIASES[name]; }
  return null;
}

// ─── /api/agent handler ──────────────────────────────────────────────────────

var VALID_AGENTS = Object.keys(AGENT_PROMPTS);

function handleAgentRequest(req, res) {
  readBody(req, function (err, body) {
    if (err) { return jsonResponse(res, 400, { error: err.message }); }

    var agentType = body.agentType;
    var context   = body.context;

    if (RETIRED_AGENTS[agentType]) {
      return jsonResponse(res, 410, { error: "Agent retired", detail: RETIRED_AGENTS[agentType] });
    }
    var resolved = resolveAgentType(agentType);
    if (!resolved) {
      return jsonResponse(res, 400, {
        error: "Invalid agentType. Must be one of: " + VALID_AGENTS.join(", ")
      });
    }
    agentType = resolved;
    if (!context || typeof context !== "object") {
      return jsonResponse(res, 400, { error: "context must be a JSON object." });
    }

    var systemPrompt = AGENT_PROMPTS[agentType];
    var userPrompt   = "ANALYTICAL CONTEXT (pre-calculated by deterministic JS engine):\n" +
                       JSON.stringify(context, null, 2) +
                       "\n\nProvide your structured JSON analysis.";

    var ck = cacheKey(agentType, context);
    var cachedResult = cacheGet(ck);
    if (cachedResult) {
      return jsonResponse(res, 200, { agentType: agentType, output: cachedResult.output,
                                      model: cachedResult.model, fromCache: true });
    }

    callGeminiWithFallback(systemPrompt, userPrompt, 0, AgentOutputCheck.SCHEMAS[agentType]).then(function (result) {
      var parsed = extractJson(result.text);
      cachePut(ck, { output: parsed, model: result.model });
      jsonResponse(res, 200, { agentType: agentType, model: result.model, output: parsed });
    }).catch(function (e) {
      // Log server-side only — do NOT expose API key or internal paths
      console.error("[agent/" + agentType + "] Gemini error:", e.message);
      jsonResponse(res, 503, {
        error: "AI explanation unavailable",
        detail: e.message.indexOf("API_KEY") !== -1
          ? "API key not configured. Add GEMINI_API_KEY to server/.env."
          : e.message
      });
    });
  });
}


// ─── /api/agents/analyse — sequential four-agent chain ──────────────────────

/* The chain is three analysts then the orchestrator. Validation is no longer a
 * link in it: it runs deterministically in the browser before the chain starts,
 * and the chain is not entered at all when it fails. */
var ANALYSE_CHAIN = [
  "dataStatistical",
  "marketScreening",
  "portfolioRisk",
  "orchestrator"
];

function runChain(context, chainResults, idx, callback) {
  if (idx >= ANALYSE_CHAIN.length) {
    return callback(null, chainResults);
  }

  var agentType = ANALYSE_CHAIN[idx];

  // Build agent-specific context
  var agentCtx = Object.assign({}, context, chainResults);

  /* The Orchestrator runs only when the browser's deterministic checks passed.
   * The caller reports that result in context.deterministicValidation; a
   * request that omits it is treated as not having run the checks, because
   * assuming success would defeat the gate. */
  if (agentType === "orchestrator") {
    var dv = context && context.deterministicValidation;
    if (!dv || dv.passed !== true) {
      chainResults.orchestratorOutput = {
        error: "Orchestrator skipped — the deterministic checks did not pass" +
               (dv && dv.summary ? ": " + dv.summary : " (no check result supplied).")
      };
      return runChain(context, chainResults, idx + 1, callback);
    }
  }

  var key = cacheKey(agentType, agentCtx);
  var cached = cacheGet(key);
  if (cached) {
    chainResults[agentType + "Output"] = Object.assign({}, cached.output, { _model: cached.model, fromCache: true });
    return runChain(context, chainResults, idx + 1, callback);
  }

  var systemPrompt = AGENT_PROMPTS[agentType];
  var userPrompt   = "ANALYTICAL CONTEXT (pre-calculated by deterministic JS engine):\n" +
                     JSON.stringify(agentCtx, null, 2) +
                     "\n\nProvide your structured JSON analysis.";

  callGeminiWithFallback(systemPrompt, userPrompt, 0, AgentOutputCheck.SCHEMAS[agentType]).then(function (result) {
    var parsed = extractJson(result.text);
    parsed._model = result.model;
    cachePut(key, { output: parsed, model: result.model });
    chainResults[agentType + "Output"] = parsed;
    runChain(context, chainResults, idx + 1, callback);
  }).catch(function (e) {
    console.error("[analyse/" + agentType + "] Gemini error:", e.message);
    chainResults[agentType + "Output"] = {
      error: "AI explanation unavailable",
      offline: true
    };
    runChain(context, chainResults, idx + 1, callback);
  });
}

function handleAnalyseRequest(req, res) {
  readBody(req, function (err, body) {
    if (err) { return jsonResponse(res, 400, { error: err.message }); }
    var context = body.context;
    if (!context || typeof context !== "object") {
      return jsonResponse(res, 400, { error: "context must be a JSON object." });
    }

    if (!API_KEY) {
      return jsonResponse(res, 503, {
        error: "AI explanation unavailable",
        detail: "GEMINI_API_KEY not configured. Add it to server/.env."
      });
    }

    runChain(context, {}, 0, function (err, results) {
      jsonResponse(res, 200, {
        chain:   ANALYSE_CHAIN,
        outputs: results,
        model:   MODEL,
        timestamp: new Date().toISOString()
      });
    });
  });
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

var server = http.createServer(function (req, res) {
  var parsed  = url.parse(req.url);
  var reqPath = parsed.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
    });
    res.end();
    return;
  }

  // API routes

  if (reqPath === "/api/health" && req.method === "GET") {
    return jsonResponse(res, 200, {
      status:           "ok",
      model:            MODEL,
      geminiConfigured: !!API_KEY,
      timestamp:        new Date().toISOString(),
      agents:           Object.keys(AGENT_PROMPTS),
      cacheSize:        Object.keys(_agentCache).length
    });
  }

  // Clear the in-memory response cache without restarting the process, so a
  // fresh set of agent answers can be requested during a demo.
  if (reqPath === "/api/cache/clear" && (req.method === "POST" || req.method === "GET")) {
    var cleared = Object.keys(_agentCache).length;
    _agentCache = {};
    console.log("Agent response cache cleared (" + cleared + " entries).");
    return jsonResponse(res, 200, { status: "ok", cleared: cleared });
  }

  if (reqPath === "/api/agents/analyse" && req.method === "POST") {
    return handleAnalyseRequest(req, res);
  }

  if (reqPath === "/api/status" && req.method === "GET") {
    return jsonResponse(res, 200, {
      status: "ok",
      model: MODEL,
      geminiConfigured: !!API_KEY,
      timestamp: new Date().toISOString()
    });
  }

  if (reqPath === "/api/agent" && req.method === "POST") {
    return handleAgentRequest(req, res);
  }

  // Static files
  if (req.method === "GET") {
    return serveStatic(reqPath === "/" ? "/index.html" : reqPath, res);
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, HOST, function () {
  console.log("REIT Target AI server running at http://localhost:" + PORT +
              (HOST === "127.0.0.1" ? " (loopback only)" : " (listening on " + HOST + " — reachable from the network)"));
  console.log("Agents: " + Object.keys(AGENT_PROMPTS).join(", ") +
              "  (validation is deterministic, in public/js/validator.js)");
  console.log("Gemini model: " + MODEL +
              "  (thinking off, maxOutputTokens " + MAX_OUTPUT_TOKENS +
              ", up to " + MAX_RETRIES + " retries)");
  if (!API_KEY) {
    console.warn("[WARN] GEMINI_API_KEY not set. Add it to server/.env. Deterministic features still work.");
  }
});

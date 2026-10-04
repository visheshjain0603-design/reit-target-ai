/**
 * server.js — Local Gemini API proxy for REIT Target AI
 * NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * IMPORTANT: The GEMINI_API_KEY is read from .env and NEVER sent to the browser.
 *
 * Start:  node server.js          (or: npm start)
 * Requires Node.js >= 16
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
var MODEL     = process.env.GEMINI_MODEL   || "gemini-2.0-flash-001";
var PORT      = parseInt(process.env.PORT  || "3001", 10);
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
function callGemini(systemInstruction, userPrompt, modelName) {
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
          resolve({ text: text, model: MODEL });
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
function callGeminiWithRetry(systemInstruction, userPrompt, modelName, attempt) {
  attempt = attempt || 0;
  return callGemini(systemInstruction, userPrompt, modelName).catch(function (err) {
    if (!err.retryable || attempt >= MAX_RETRIES) { throw err; }
    var waitMs = err.retryAfterMs ||
                 (RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 250));
    console.log("  ↻ transient Gemini error on " + (modelName || MODEL) + " (" +
                err.message.slice(0, 70) + "), retry " + (attempt + 1) + "/" +
                MAX_RETRIES + " in " + waitMs + "ms");
    return new Promise(function (r) { setTimeout(r, waitMs); })
      .then(function () {
        return callGeminiWithRetry(systemInstruction, userPrompt, modelName, attempt + 1);
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
function callGeminiWithFallback(systemInstruction, userPrompt, idx) {
  idx = idx || 0;
  var modelName = MODEL_CHAIN[idx];
  return callGeminiWithRetry(systemInstruction, userPrompt, modelName)
    .catch(function (err) {
      var hasNext = idx + 1 < MODEL_CHAIN.length;
      if (err.quotaExhausted && hasNext) {
        console.warn("  ⚠ " + modelName + " daily quota exhausted — falling back to " +
                     MODEL_CHAIN[idx + 1]);
        return callGeminiWithFallback(systemInstruction, userPrompt, idx + 1);
      }
      // An unusable model name (404/400) should also not block the demo.
      if (!err.quotaExhausted && hasNext &&
          (err.statusCode === 404 || err.statusCode === 400)) {
        console.warn("  ⚠ " + modelName + " unusable (" + err.statusCode +
                     ") — falling back to " + MODEL_CHAIN[idx + 1]);
        return callGeminiWithFallback(systemInstruction, userPrompt, idx + 1);
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

var AGENT_PROMPTS = {

  dataStatistical: [
    "You are the Data & Statistical Analyst for REIT Target AI, an academic demonstration system.",
    "Your role: describe the dataset's quality AND its descriptive statistics together — sample sizes, dispersion, spread of yields and risk, and any anomalies already identified.",
    "Rules:",
    "1. Comment ONLY on the figures provided. Do NOT invent, recalculate or extrapolate any value.",
    "2. State plainly that ALL data is SYNTHETIC and was generated for academic illustration.",
    "3. Identify sample-size weaknesses. A segment is under-powered when its observationCount is below minObsThreshold. Base this on segmentsBelowMinObs and smallestSegmentObs — NEVER on segmentCount, which counts how many market segments a city contains and is not a sample size at all. Write it in plain English, naming the actual numbers and never the field names: e.g. \"Kolkata: all 3 segments rest on fewer than 30 observations (smallest 26)\".",
    "4. Prefer median and IQR over mean and standard deviation where both are provided, and say why when you do.",
    "5. Where a pooled figure and a within-group figure disagree, report BOTH and attribute the difference to the grouping. Do not present the pooled figure alone.",
    "6. Refer to the records as simulated market observations. Never call them properties, listings or transactions.",
    "7. Do NOT present any of this as investment advice.",
    '8. Respond ONLY with valid JSON: { "overallQuality": "good|fair|poor", "dataSummary": "...", "sampleSizeWarnings": ["..."], "dispersionNotes": ["..."], "keyFindings": ["..."], "outlierNotes": ["..."], "statisticalCaveats": ["..."], "disclaimer": "..." }'
  ].join("\n"),

  marketScreening: [
    "You are the Market Screening Analyst for REIT Target AI, an academic demonstration system.",
    "Your role: explain WHY the recommended segment scored as it did, and how the runner-up differs from it, using the pre-calculated factor scores and contributions provided.",
    "Rules:",
    "1. Do NOT invent scores or rankings. Refer only to the provided data.",
    "2. Explain the scoring methodology in terms of the five factors: rental yield, rental growth, diversification benefit, demand strength and low market risk.",
    "3. Name the single factor that contributed most to the leading score, and the factor on which the runner-up is stronger. These contributions are given to you; do not estimate them.",
    "4. The composite score measures attractiveness only. Evidence strength is a SEPARATE judgement supplied as governance data. If the recommended segment is not the highest-scoring one, say so and give the evidence reason provided — never imply the score was adjusted, because it was not.",
    "5. State that ALL data is SYNTHETIC.",
    '6. Respond ONLY with valid JSON: { "topPickExplanation": "...", "dominantFactor": "...", "runnerUpComparison": "...", "factorInsights": ["..."], "watchPoints": ["..."], "evidenceNote": "...", "disclaimer": "..." }'
  ].join("\n"),

  portfolioRisk: [
    "You are the Portfolio Risk & Scenario Analyst for REIT Target AI, an academic demonstration system.",
    "Your role: interpret the before-and-after Herfindahl-Hirschman Index (HHI) figures AND the scenario projections provided, as one assessment of what this investment would do to the portfolio.",
    "Rules:",
    "1. Do NOT use the labels 'safe' or 'dangerous' for HHI levels — use 'concentrated', 'moderate' or 'diversified'.",
    "2. HHI above 0.25 = concentrated; 0.15-0.25 = moderate; below 0.15 = diversified. These are descriptive benchmarks, not regulatory thresholds.",
    "3. A lower HHI after the investment means improved diversification. Quote the actual before and after values.",
    "4. Do NOT recalculate anything. Comment only on the provided values.",
    "5. When projections are provided, state what they assume (flat growth rates, no leverage, no transaction costs, no tax) before stating what they show.",
    "6. Identify the concentration that remains AFTER the investment, not only the improvement. An improvement from 0.63 to 0.58 is still concentrated.",
    "7. State that ALL data is SYNTHETIC.",
    '8. Respond ONLY with valid JSON: { "cityHHIInterpretation": "...", "typeHHIInterpretation": "...", "residualConcentration": "...", "yieldImpact": "...", "scenarioInterpretation": "...", "projectionCaveats": ["..."], "overallAssessment": "...", "disclaimer": "..." }'
  ].join("\n"),

  orchestrator: [
    "You are the Investment Orchestrator for REIT Target AI, an academic demonstration system.",
    "You receive the outputs of the Data & Statistical Analyst, the Market Screening Analyst and the Portfolio Risk & Scenario Analyst, together with the result of a DETERMINISTIC validation performed in code.",
    "IMPORTANT: You are called ONLY because those deterministic checks passed. The checks are arithmetic, not opinion: do not re-litigate them, re-perform them, or claim to have verified anything yourself.",
    "Your role: synthesise the three analyses into one structured final recommendation.",
    "Rules:",
    "1. Include only what is supported by the agent outputs and the analytical context provided.",
    "2. Do NOT invent new analysis, recalculate scores, or cite any figure not in the context.",
    "3. 'selectedTarget' MUST be the segment named as the recommendation in the context. That is not always the highest-scoring segment: an evidence floor applies. If the two differ, say so in 'evidenceBasis' and give the reason from the governance data.",
    "4. State clearly that this is an ACADEMIC DEMONSTRATION on SYNTHETIC data and is NOT investment advice.",
    "5. 'importantRisks' must include at least one risk arising from the data itself (sample size, evidence grade, or the synthetic nature of the dataset), not only market risks.",
    '6. Respond ONLY with valid JSON: { "selectedTarget": "...", "investmentAmount": "₹<N> Cr", "compositeScore": 0, "expectedYieldPct": 0, "evidenceBasis": "...", "cityHHIEffect": "...", "assetTypeHHIEffect": "...", "whyTopRanked": "...", "importantRisks": ["..."], "syntheticDisclaimer": "...", "disclaimer": "..." }'
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
      return jsonResponse(res, 200, { agentType: agentType, output: cachedResult, fromCache: true });
    }

    callGeminiWithFallback(systemPrompt, userPrompt).then(function (result) {
      var parsed = extractJson(result.text);
      cachePut(ck, parsed);
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


// ─── /api/agents/analyse — sequential 6-agent chain ────────────────────────

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
    chainResults[agentType + "Output"] = Object.assign({}, cached, { fromCache: true });
    return runChain(context, chainResults, idx + 1, callback);
  }

  var systemPrompt = AGENT_PROMPTS[agentType];
  var userPrompt   = "ANALYTICAL CONTEXT (pre-calculated by deterministic JS engine):\n" +
                     JSON.stringify(agentCtx, null, 2) +
                     "\n\nProvide your structured JSON analysis.";

  callGeminiWithFallback(systemPrompt, userPrompt).then(function (result) {
    var parsed = extractJson(result.text);
    parsed._model = result.model;
    cachePut(key, parsed);
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

server.listen(PORT, function () {
  console.log("REIT Target AI server running at http://localhost:" + PORT);
  console.log("Agents: " + Object.keys(AGENT_PROMPTS).join(", ") +
              "  (validation is deterministic, in public/js/validator.js)");
  console.log("Gemini model: " + MODEL +
              "  (thinking off, maxOutputTokens " + MAX_OUTPUT_TOKENS +
              ", up to " + MAX_RETRIES + " retries)");
  if (!API_KEY) {
    console.warn("[WARN] GEMINI_API_KEY not set. Add it to server/.env. Deterministic features still work.");
  }
});

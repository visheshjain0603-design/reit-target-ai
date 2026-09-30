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
// 429/500/503 ("model is currently experiencing high demand"). Because the six
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
            // "Run Agent Analysis" spends six of them. Waiting will not clear
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
 * allowance is as low as 20 requests — which one six-agent analysis run
 * nearly exhausts. When a model reports RESOURCE_EXHAUSTED there is nothing
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

var AGENT_PROMPTS = {


  dataQuality: [
    "You are the Data Quality Agent for REIT Target AI, an academic demonstration system.",
    "Your role: review the data quality metrics provided and explain any issues, warnings, or limitations that could affect the investment analysis.",
    "Rules:",
    "1. Comment only on the data quality metrics provided — do NOT invent additional issues.",
    "2. Flag that ALL data is SYNTHETIC and created for academic illustration.",
    "3. Identify any sample-size warnings. A segment is under-powered when its observationCount is below minObsThreshold. Base this on segmentsBelowMinObs and smallestSegmentObs — NEVER on segmentCount, which counts how many market segments a city contains and is not a sample size at all. Write the warning in plain English for a non-technical reader, naming the actual numbers and never the field names: e.g. \"Kolkata: all 3 segments have fewer than 30 observations (smallest 26)\".",
    "4. Flag any outlier segments or cleaning pipeline rejections.",
    "5. Do NOT present this as real investment advice.",
    '6. Respond ONLY with valid JSON: { "overallQuality": "good|fair|poor", "dataSummary": "...", "sampleSizeWarnings": ["..."], "outlierNotes": ["..."], "pipelineSummary": "...", "recommendations": ["..."], "disclaimer": "..." }'
  ].join("\n"),

  statisticalAnalysis: [
    "You are the Statistical Analysis Agent for REIT Target AI, an academic demonstration system.",
    "Your role: interpret the segment-level descriptive statistics provided, highlighting yield spreads, capital value ranges, and diversification patterns across cities and property types.",
    "Rules:",
    "1. Comment ONLY on the statistics provided — do NOT invent or recalculate values.",
    "2. Use median and IQR rather than mean and standard deviation where provided.",
    "3. If bootstrap confidence intervals are provided, reference them when assessing reliability.",
    "4. Flag that ALL data is SYNTHETIC.",
    "5. Do NOT present this as real investment advice.",
    '6. Respond ONLY with valid JSON: { "keyFindings": ["..."], "yieldAnalysis": "...", "capitalValueAnalysis": "...", "cityComparison": "...", "typeComparison": "...", "statisticalCaveats": ["..."], "disclaimer": "..." }'
  ].join("\n"),

  portfolioAnalysis: [
    "You are the Portfolio Analysis Agent for REIT Target AI, an academic demonstration system.",
    "Your role: analyse the EXISTING synthetic REIT portfolio and explain concentration risks, yield profile, and lease risks.",
    "Rules:",
    "1. Base ALL observations on the JSON data provided. Do NOT invent values.",
    "2. Do NOT recalculate values — comment on the pre-calculated ones.",
    "3. Do NOT present this as real investment advice.",
    "4. Flag that this is a SYNTHETIC academic dataset.",
    "5. Respond ONLY with valid JSON: { \"summary\": \"...\", \"concentrationRisks\": [\"...\"], \"yieldObservations\": [\"...\"], \"leaseRisks\": [\"...\"], \"disclaimer\": \"...\" }"
  ].join("\n"),

  marketScreening: [
    "You are the Market Screening Agent for REIT Target AI, an academic demonstration system.",
    "Your role: explain WHY the top-ranked target markets scored highly, using the pre-calculated factor scores and contributions provided.",
    "Rules:",
    "1. Do NOT invent scores or rankings. Refer only to provided data.",
    "2. Explain the scoring METHODOLOGY (yield, growth, diversification, demand, low-risk).",
    "3. Flag that data is SYNTHETIC.",
    "4. Respond ONLY with valid JSON: { \"topPickExplanation\": \"...\", \"factorInsights\": [\"...\"], \"watchPoints\": [\"...\"], \"disclaimer\": \"...\" }"
  ].join("\n"),

  diversification: [
    "You are the Diversification Agent for REIT Target AI, an academic demonstration system.",
    "Your role: interpret the before-vs-after Herfindahl-Hirschman Index (HHI) results provided.",
    "Rules:",
    "1. Do NOT use the labels 'safe' or 'dangerous' for HHI levels — use 'concentrated', 'moderate', 'diversified'.",
    "2. HHI above 0.25 = concentrated; 0.15-0.25 = moderate; below 0.15 = diversified.",
    "3. Lower HHI after investment means improved diversification.",
    "4. Do NOT recalculate. Comment only on provided values.",
    "5. Flag SYNTHETIC data.",
    "6. Respond ONLY with valid JSON: { \"cityHHIInterpretation\": \"...\", \"typeHHIInterpretation\": \"...\", \"yieldImpact\": \"...\", \"overallAssessment\": \"...\", \"disclaimer\": \"...\" }"
  ].join("\n"),

  validation: [
    "You are the Validation Agent for REIT Target AI, an academic demonstration system.",
    "Your role: check the analytical inputs for completeness, consistency and methodological limitations.",
    "Rules:",
    "1. Check: are all five weight values present and summing to 100%? Return weightCheck='pass' or 'fail'.",
    "2. Check: are all scores in the 0–100 range? Return scoreRangeCheck='pass' or 'fail'.",
    "3. Check: does the selected target appear in the top-ranked markets list? Return targetExists=true/false.",
    "4. Check: do the city HHI and asset-type HHI values in the context match what the simulation reports? Return hhiConsistency='pass' or 'fail'.",
    "5. Check: are synthetic-data limitations disclosed in the context?",
    "6. Identify methodological limitations (gross yield only, no leverage, synthetic data, no transaction costs).",
    "7. Return validatedOk=true ONLY if: weightCheck=pass AND scoreRangeCheck=pass AND targetExists=true AND hhiConsistency=pass AND no critical inconsistencies.",
    "8. Respond ONLY with valid JSON: { \"weightCheck\": \"pass|fail\", \"scoreRangeCheck\": \"pass|fail\", \"targetExists\": true|false, \"hhiConsistency\": \"pass|fail\", \"dataQuality\": \"...\", \"inconsistencies\": [\"...\"], \"limitations\": [\"...\"], \"validatedOk\": true|false, \"disclaimer\": \"...\" }"
  ].join("\n"),

  orchestrator: [
    "You are the Investment Orchestrator for REIT Target AI, an academic demonstration system.",
    "You receive VALIDATED outputs from the Portfolio Analysis, Market Screening, Diversification and Validation agents.",
    "IMPORTANT: You are called ONLY because the Validation Agent returned validatedOk=true.",
    "Your role: synthesise all four agent outputs into one structured final recommendation.",
    "Rules:",
    "1. Only include insights that are supported by the agent outputs and the analytical context provided.",
    "2. Do NOT invent new analysis, recalculate scores, or cite financial figures not in the context.",
    "3. Clearly state this is for ACADEMIC DEMONSTRATION on SYNTHETIC DATA.",
    "4. A recommendation here is NOT real investment advice.",
    "5. The 'selectedTarget' must be the highest-scoring market from the pre-calculated context.",
    '6. Respond ONLY with valid JSON: { "selectedTarget": "...", "investmentAmount": "\u20b9<N> Cr", "compositeScore": 0, "expectedYieldPct": 0, "cityHHIEffect": "...", "assetTypeHHIEffect": "...", "whyTopRanked": "...", "importantRisks": ["..."], "syntheticDisclaimer": "...", "disclaimer": "..." }'
  ].join("\n")
};

// ─── /api/agent handler ──────────────────────────────────────────────────────

var VALID_AGENTS = Object.keys(AGENT_PROMPTS);

function handleAgentRequest(req, res) {
  readBody(req, function (err, body) {
    if (err) { return jsonResponse(res, 400, { error: err.message }); }

    var agentType = body.agentType;
    var context   = body.context;

    if (!agentType || VALID_AGENTS.indexOf(agentType) === -1) {
      return jsonResponse(res, 400, { error: "Invalid agentType. Must be one of: " + VALID_AGENTS.join(", ") });
    }
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

var ANALYSE_CHAIN = [
  "dataQuality",
  "statisticalAnalysis",
  "marketScreening",
  "diversification",
  "validation",
  "orchestrator"
];

function runChain(context, chainResults, idx, callback) {
  if (idx >= ANALYSE_CHAIN.length) {
    return callback(null, chainResults);
  }

  var agentType = ANALYSE_CHAIN[idx];

  // Build agent-specific context
  var agentCtx = Object.assign({}, context, chainResults);

  // Orchestrator only runs when validation passed
  if (agentType === "orchestrator") {
    var valOut = chainResults.validationOutput;
    if (!valOut || valOut.validatedOk !== true) {
      chainResults.orchestratorOutput = { error: "Orchestrator skipped — validation did not pass." };
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
  console.log("Gemini model: " + MODEL +
              "  (thinking off, maxOutputTokens " + MAX_OUTPUT_TOKENS +
              ", up to " + MAX_RETRIES + " retries)");
  if (!API_KEY) {
    console.warn("[WARN] GEMINI_API_KEY not set. Add it to server/.env. Deterministic features still work.");
  }
});

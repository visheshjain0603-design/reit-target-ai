/**
 * agentOutputCheck.js — strict schemas and a deterministic consistency check
 * for the four agents' output
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * WHY
 * ---
 * The first cache build was fluent and wrong in small ways: a dataset-wide
 * median called the portfolio's yield, two different markets each called "the
 * runner-up", a raw-rank-8 candidate said to have "ranked first", exclusions
 * blamed on sample size when the segment had failed on its grade alone, 7.00%
 * written as 7%. Each is checkable against the deterministic context, so it is
 * checked — before anything is written to the cache, and again whenever a live
 * reply is displayed.
 *
 * Two layers:
 *   SCHEMAS   the exact JSON shape each agent must return. The server passes
 *             them to Gemini as responseSchema, so the model returns prose
 *             fields only — no number fields it could fill inconsistently.
 *             Headline figures are rendered from the context, never from prose.
 *   check()   reads the prose and flags any statement that contradicts the
 *             context: unknown markets, rank claims, exclusion reasons, figures
 *             that match nothing in the context (or match at the wrong
 *             precision), retired terminology, and evidence overclaims.
 *
 * It cannot prove prose true. It can prove specific kinds of statement false,
 * and those are the kinds the first build got wrong.
 *
 * Pure: no DOM, no network, no clock reads. Shared by server.js (schemas),
 * buildAgentCache.js (gate before writing) and agents.js (live display).
 */

(function (root) {
  "use strict";

  function meta() {
    if (typeof module !== "undefined" && module.exports) { return require("./appMeta.js"); }
    return root.AppMeta;
  }

  // ─── Schemas ──────────────────────────────────────────────────────────────

  function str(d)  { return { type: "STRING", description: d }; }
  function list(d) { return { type: "ARRAY", items: { type: "STRING" }, description: d }; }
  function obj(props, order) {
    return { type: "OBJECT", properties: props, required: order, propertyOrdering: order };
  }

  var SCHEMAS = {
    dataStatistical: obj({
      datasetSummary:         str("What the market-segment dataset is and how large it is. Synthetic."),
      simulationSupportNotes: list("Segments with few simulated observations, by city, with exact counts from the context."),
      dispersionNotes:        list("Spread of segment gross yields and other figures, quoting the context."),
      segmentOutlierNotes:    list("Segment-median outliers by city, using the definition in the context."),
      knownAnomalyNote:       str("The known synthetic anomalies, as defined in the context."),
      caveats:                list("Limits: synthetic data, simulation precision is not market evidence, calibration unverified."),
      disclaimer:             str("Academic demonstration; not investment advice.")
    }, ["datasetSummary", "simulationSupportNotes", "dispersionNotes", "segmentOutlierNotes",
        "knownAnomalyNote", "caveats", "disclaimer"]),

    marketScreening: obj({
      candidateExplanation:      str("Why the selected target scored as it did, citing its factor contributions in plain words."),
      dominantFactor:            str("The factor contributing most to the selected target's score: exactly the factor named in the selected target's largestContribution, in plain words."),
      comparisonWithAlternative: str("How the selected target differs from the comparison segment in the context, calling that segment by its exact role in plain words (highest raw-score alternative, or next eligible candidate)."),
      screenOutcome:             str("Why segments above the target were not shortlisted, using their exact reasons."),
      factorInsights:            list("Short observations on individual factors, quoting the context."),
      watchPoints:               list("What to check next. Include that external calibration is unverified."),
      disclaimer:                str("Academic demonstration; not investment advice.")
    }, ["candidateExplanation", "dominantFactor", "comparisonWithAlternative", "screenOutcome",
        "factorInsights", "watchPoints", "disclaimer"]),

    portfolioRisk: obj({
      cityConcentration:      str("City HHI before and after, quoting the four-decimal figures."),
      assetTypeConcentration: str("Asset-type HHI before and after, quoting the four-decimal figures."),
      residualConcentration:  str("Concentration remaining after the investment."),
      yieldImpact:            str("Portfolio weighted yield before and after, quoting the context."),
      scenarioInterpretation: str("What the three-year scenario projections show, after stating their assumptions."),
      projectionCaveats:      list("Assumptions and limits of the projections."),
      overallAssessment:      str("One-paragraph assessment of the concentration effect."),
      disclaimer:             str("Academic demonstration; not investment advice.")
    }, ["cityConcentration", "assetTypeConcentration", "residualConcentration", "yieldImpact",
        "scenarioInterpretation", "projectionCaveats", "overallAssessment", "disclaimer"]),

    orchestrator: obj({
      recommendationSummary: str("Names the selected target and its role (shortlist candidate or manually selected target)."),
      screeningBasis:        str("How the simulation-support screen produced this candidate, with exact exclusion reasons."),
      concentrationEffect:   str("The HHI effect of the investment, quoting the context."),
      keyStrengths:          list("Strengths of the selected target, quoting the context."),
      importantRisks:        list("Risks, including at least one about the data: synthetic, simulation-only, calibration unverified."),
      nextSteps:             str("Must say that external calibration remains unverified and that further evidence collection and due diligence are required."),
      disclaimer:            str("Academic demonstration; not investment advice.")
    }, ["recommendationSummary", "screeningBasis", "concentrationEffect", "keyStrengths",
        "importantRisks", "nextSteps", "disclaimer"])
  };

  /** Display labels for the agent cards and the report. */
  var FIELD_LABELS = {
    datasetSummary: "Dataset Summary", simulationSupportNotes: "Simulation Support",
    dispersionNotes: "Dispersion", segmentOutlierNotes: "Segment-Median Outliers",
    knownAnomalyNote: "Known Synthetic Anomalies", caveats: "Caveats",
    candidateExplanation: "Why the Target Scored as It Did", dominantFactor: "Dominant Factor",
    comparisonWithAlternative: "Comparison", screenOutcome: "Simulation-Support Screen",
    factorInsights: "Factor Insights", watchPoints: "Watch Points",
    cityConcentration: "City Concentration", assetTypeConcentration: "Asset-Type Concentration",
    residualConcentration: "Residual Concentration", yieldImpact: "Yield Impact",
    scenarioInterpretation: "Scenario Interpretation", projectionCaveats: "Projection Caveats",
    overallAssessment: "Overall Assessment",
    recommendationSummary: "Summary", screeningBasis: "Screening Basis",
    concentrationEffect: "Concentration Effect", keyStrengths: "Key Strengths",
    importantRisks: "Key Risks", nextSteps: "Next Steps", disclaimer: "Disclaimer"
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function sentences(text) {
    return String(text || "").split(/(?<=[.;!?])\s+(?=[A-Z0-9("“])/);
  }

  var NEGATION = /\b(not|no|never|none|cannot|can't|neither|nor|zero|without|un\w+|lack|lacks|absent)\b/i;

  /** Distinctive names under which a segment can be mentioned in prose. */
  function aliases(m) {
    var out = [m.locality];
    var parts = String(m.locality).split(" — ");
    if (parts.length === 2 && parts[1].length >= 5) { out.push(parts[1]); }
    var paren = String(m.locality).split(" (")[0];
    if (paren !== m.locality && paren.length >= 5) { out.push(paren); }
    return out;
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /** Markets mentioned in a sentence, by ID or name, resolved to segment objects. */
  function mentions(sentence, universe, inContext) {
    var found = {};
    var ids = sentence.match(/MKT-\d{3}/g) || [];
    ids.forEach(function (id) { found[id] = true; });
    var byName = {};
    universe.forEach(function (m) {
      aliases(m).forEach(function (a) {
        var re = new RegExp("(^|[^A-Za-z])" + escapeRe(a) + "($|[^A-Za-z])", "i");
        if (re.test(sentence)) { (byName[a.toLowerCase()] = byName[a.toLowerCase()] || []).push(m); }
      });
    });
    Object.keys(byName).forEach(function (k) {
      var cands = byName[k];
      // Drop a shorter alias match that is part of a longer matched name ("Cyber Hub" within the full name).
      if (cands.length === 1) { found[cands[0].marketId] = true; return; }
      var ctxCands = cands.filter(function (m) { return inContext[m.marketId]; });
      var pick = ctxCands.length === 1 ? ctxCands : cands.filter(function (m) {
        return new RegExp(escapeRe(m.propertyType), "i").test(sentence);
      });
      if (pick.length === 1) { found[pick[0].marketId] = true; }
      else { found["AMBIGUOUS:" + k] = true; }
    });
    return Object.keys(found);
  }

  /**
   * Every figure the context states, at the precision it is stated at. Quoted
   * figures arrive as fixed-decimal strings ("7.00", "0.4130"), so their
   * literal decimals ARE the display precision. Weights, stated as fractions,
   * may also be quoted as whole percentages.
   */
  function numericWhitelist(ctx) {
    var allowed = [];
    function decimals(text) {
      var i = text.indexOf(".");
      return i === -1 ? 0 : text.length - i - 1;
    }
    /* Each figure is tagged with whether it is a percentage, so "7%" can only
     * match a percentage figure — never a raw rank of 7 or a count. */
    function add(v, dp, pct) { allowed.push({ v: v, dp: dp, pct: !!pct }); }
    function isPctPath(path) {
      var k = path[path.length - 1] || "", full = path.join(".");
      return /Pct$/i.test(k) || /Pct\./.test(full);
    }
    function walk(node, path) {
      if (typeof node === "number" && isFinite(node)) {
        add(node, decimals(String(node)), isPctPath(path));
        if (path[0] === "weights") { add(Math.round(node * 100), 0, true); }
        return;
      }
      if (typeof node === "string") {
        var re = /(\d+(?:,\d{3})*(?:\.\d+)?)(\s*%)?/g, m;
        while ((m = re.exec(node)) !== null) {
          var clean = m[1].replace(/,/g, "");
          add(parseFloat(clean), decimals(clean), !!m[2] || isPctPath(path));
        }
        return;
      }
      if (Array.isArray(node)) { node.forEach(function (x, i) { walk(x, path.concat(String(i))); }); return; }
      if (node && typeof node === "object") {
        Object.keys(node).forEach(function (k) { walk(node[k], path.concat(k)); });
      }
    }
    walk(ctx, []);
    return allowed;
  }

  /**
   * Positions of every reference to a segment in a sentence: names and IDs,
   * and role phrases ("the selected target", "the highest raw-score
   * alternative") resolved to the segment the context gives that role.
   */
  function references(sentence, universe, inContext, ctx) {
    var out = [];
    var lower = sentence.toLowerCase();
    var idRe = /MKT-\d{3}/g, m;
    while ((m = idRe.exec(sentence)) !== null) { out.push({ pos: m.index, id: m[0] }); }
    universe.forEach(function (mk) {
      aliases(mk).forEach(function (a) {
        var re = new RegExp("(^|[^A-Za-z])(" + escapeRe(a) + ")($|[^A-Za-z])", "gi"), x;
        while ((x = re.exec(sentence)) !== null) {
          var same = universe.filter(function (u) {
            return aliases(u).some(function (b) { return b.toLowerCase() === a.toLowerCase(); });
          });
          var pick = same.length === 1 ? same : same.filter(function (u) { return inContext[u.marketId]; });
          if (pick.length === 1) { out.push({ pos: x.index + x[1].length, id: pick[0].marketId }); }
        }
      });
    });
    var roles = [
      [/(selected target|the target\b|manually selected)/g, ctx.selectedTarget],
      [/shortlist candidate/g, ctx.recommendedCandidate],
      [/highest raw[- ]score (market|alternative|segment)/g, ctx.highestRawScoreMarket],
      [/next eligible candidate/g, ctx.nextEligibleCandidate]
    ];
    roles.forEach(function (r) {
      if (!r[1]) { return; }
      var y;
      while ((y = r[0].exec(lower)) !== null) { out.push({ pos: y.index, id: r[1].marketId }); }
    });
    out.sort(function (p, q) { return p.pos - q.pos; });
    return out;
  }

  function numberAllowed(token, allowed, isPct) {
    var clean = token.replace(/,/g, "");
    var v = parseFloat(clean);
    var d = clean.indexOf(".") === -1 ? 0 : clean.length - clean.indexOf(".") - 1;
    for (var i = 0; i < allowed.length; i++) {
      var a = allowed[i];
      if (a.dp !== d) { continue; }
      if (isPct && !a.pct) { continue; }
      var f = Math.pow(10, d);
      if (Math.abs(Math.round(a.v * f) / f - v) < 1e-9) { return true; }
    }
    return false;
  }

  // ─── The check ────────────────────────────────────────────────────────────

  /**
   * @param {string} agentKey   one of the four keys
   * @param {Object} output     parsed model output
   * @param {Object} ctx        the context the model was given (AgentContext.fromRun)
   * @param {Array}  universe   all market records, for name resolution
   * @returns {{ ok: boolean, issues: Array<{field, message, text}> }}
   */
  function check(agentKey, output, ctx, universe) {
    var issues = [];
    function flag(field, message, text) {
      issues.push({ field: field, message: message, text: text ? String(text).slice(0, 240) : "" });
    }
    var schema = SCHEMAS[agentKey];
    if (!schema) { return { ok: false, issues: [{ field: "", message: "Unknown agent " + agentKey, text: "" }] }; }
    if (!output || typeof output !== "object" || output.raw !== undefined) {
      return { ok: false, issues: [{ field: "", message: "Output is not the required JSON object.", text: "" }] };
    }

    // 1. Shape.
    schema.required.forEach(function (k) {
      var spec = schema.properties[k], v = output[k];
      if (v === undefined || v === null || v === "") { flag(k, "Required field missing."); return; }
      if (spec.type === "STRING" && typeof v !== "string") { flag(k, "Must be a string."); }
      if (spec.type === "ARRAY" && (!Array.isArray(v) || v.some(function (x) { return typeof x !== "string"; }))) {
        flag(k, "Must be a list of strings.");
      }
    });
    Object.keys(output).forEach(function (k) {
      if (!schema.properties[k] && k.charAt(0) !== "_") { flag(k, "Field not in the schema."); }
    });

    universe = universe || [];
    var byId = {};
    universe.forEach(function (m) { byId[m.marketId] = m; });
    var ctxText = JSON.stringify(ctx || {});
    var inContext = {};
    universe.forEach(function (m) { if (ctxText.indexOf('"' + m.marketId + '"') !== -1) { inContext[m.marketId] = true; } });

    var ctxMarkets = {};
    [ctx.selectedTarget, ctx.recommendedCandidate, ctx.highestRawScoreMarket, ctx.nextEligibleCandidate,
     ctx.comparisonMarket].concat(ctx.rawTop5 || [], ctx.eligibleTop3 || [], ctx.higherRawScoreExclusions || [])
      .forEach(function (s) { if (s && s.marketId) { ctxMarkets[s.marketId] = Object.assign({}, ctxMarkets[s.marketId] || {}, s); } });

    var allowed = numericWhitelist(ctx);
    var datasetMedian = ctx.marketDataset ? ctx.marketDataset.medianOfSegmentGrossYieldsPct : null;
    var selId = ctx.selectedTarget ? ctx.selectedTarget.marketId : null;
    var recId = ctx.recommendedCandidate ? ctx.recommendedCandidate.marketId : null;
    var gradeOnlyExclusions = (ctx.higherRawScoreExclusions || []).filter(function (x) {
      return x.failsScreenOn === "support grade";
    });
    var AM = meta();

    var texts = [];
    Object.keys(schema.properties).forEach(function (k) {
      var v = output[k];
      if (typeof v === "string") { texts.push({ field: k, text: v }); }
      else if (Array.isArray(v)) { v.forEach(function (x, i) { texts.push({ field: k + "[" + i + "]", text: String(x) }); }); }
    });

    texts.forEach(function (t) {
      sentences(t.text).forEach(function (sn) {
        var negated = NEGATION.test(sn);

        // 2. Retired terminology and overclaims.
        (AM.RETIRED_TERMS || []).forEach(function (rt) {
          if (rt.pattern.test(sn)) { flag(t.field, "Retired term — use “" + rt.use + "”.", sn); }
        });
        if (/\b(strong|robust|solid|good|adequate|sufficient|reliable|documented|empirical|real-world|market)\s+evidence\b/i.test(sn) && !negated) {
          flag(t.field, "Treats simulation support as evidence.", sn);
        }
        if (/statistically\s+(significant|reliable|robust|valid|sound)/i.test(sn) && !negated) {
          flag(t.field, "Statistical overclaim about simulated data.", sn);
        }
        if (/\b30\b[^.]{0,80}\b(ensur|guarant|reliab|robust|statistic|valid|confiden)/i.test(sn) && !negated) {
          flag(t.field, "Overstates what 30 simulated observations establish.", sn);
        }
        if (/\b(is|are|was|were|been|externally|independently)\s+verified\b/i.test(sn) && !negated) {
          flag(t.field, "Claims verification; external calibration is Unverified.", sn);
        }
        if (/ranked\s+(first|1st|top)|ranks\s+(first|1st)|top-ranked|number one|#1\b|highest-ranked/i.test(sn) &&
            !/eligible|passing|passes|screen|shortlist/i.test(sn)) {
          var ms = mentions(sn, universe, inContext).filter(function (x) { return x.indexOf("AMBIGUOUS") === -1; });
          if (ms.length === 1 && ctxMarkets[ms[0]] && ctxMarkets[ms[0]].rawRank !== 1) {
            flag(t.field, ms[0] + " is raw rank " + ctxMarkets[ms[0]].rawRank + ", not first.", sn);
          }
        }

        // 2b. Selection mode and field-name leakage.
        if (ctx.selectionMode === "auto" && /manual(ly)?\s+(selected|chosen|selection)/i.test(sn) && !negated) {
          flag(t.field, "Calls the target manually selected; this run selects automatically (shortlist candidate).", sn);
        }
        if (ctx.selectionMode === "manual" && ctx.selectedTarget && !ctx.selectedTarget.sameAsRecommendedCandidate &&
            /shortlist candidate/i.test(sn)) {
          var mm = mentions(sn, universe, inContext);
          if (mm.length === 1 && mm[0] === selId) {
            flag(t.field, "Calls the manually selected target the shortlist candidate.", sn);
          }
        }
        var leak = sn.match(/\b(rawRank|eligibleRank|factorScores?|grossYieldPct|rentalGrowthPct|compositeScore|demandScore|riskScore|recommendedCandidate|selectedTarget|highestRawScoreMarket|comparisonMarket|failsScreenOn|exclusionReasons|passesSimulationSupportRule|simulationObservationCount|supportGrade|lowMarketRisk|rentalYield|rentalGrowth|marketDataset|weightsPct)\b/);
        if (leak) { flag(t.field, "Uses the field name \u201C" + leak[1] + "\u201D instead of plain English.", sn); }

        // 3. Portfolio versus dataset.
        if (datasetMedian !== null && /portfolio/i.test(sn) &&
            new RegExp("(^|[^0-9.])" + escapeRe(String(datasetMedian)) + "\\s*%").test(sn)) {
          flag(t.field, "Describes the market-dataset median (" + datasetMedian + "%) as a portfolio figure.", sn);
        }
        if (/portfolio-wide[^.]*median|median[^.]*portfolio-wide/i.test(sn)) {
          flag(t.field, "“portfolio-wide median” — dataset figures are not the portfolio's.", sn);
        }

        // 4. Markets.
        var found = mentions(sn, universe, inContext);
        found.forEach(function (id) {
          if (id.indexOf("AMBIGUOUS") === 0) { return; }
          if (!byId[id]) { flag(t.field, id + " does not exist.", sn); }
          else if (!inContext[id]) { flag(t.field, id + " (" + byId[id].locality + ") is not in the context.", sn); }
        });
        var named = found.filter(function (id) { return ctxMarkets[id]; });

        // 5. Rank claims, each attributed to the nearest preceding reference
        //    in the sentence — a named segment or a role phrase.
        var refList = references(sn, universe, inContext, ctx);
        var rankRe = /\b(raw|eligible)?\s*rank(?:ed|s)?\s*(?:of\s+)?(?:#|no\.?\s*)?(\d{1,2})\b/gi, rm;
        while ((rm = rankRe.exec(sn)) !== null) {
          var owner = null;
          for (var ri = 0; ri < refList.length; ri++) {
            if (refList[ri].pos <= rm.index) { owner = refList[ri].id; }
          }
          if (!owner && refList.length) { owner = refList[0].id; }
          if (!owner || !ctxMarkets[owner]) { continue; }
          var mk = ctxMarkets[owner], n = parseInt(rm[2], 10), kind = (rm[1] || "").toLowerCase();
          var ok = kind === "eligible" ? mk.eligibleRank === n
                 : kind === "raw" ? mk.rawRank === n
                 : (mk.rawRank === n || mk.eligibleRank === n);
          if (!ok) {
            flag(t.field, owner + " is raw rank " + mk.rawRank +
              (mk.eligibleRank ? ", eligible rank " + mk.eligibleRank : "") + "; the text says " + rm[0].trim() + ".", sn);
          }
        }

        // 6. Exclusion reasons.
        if (/(exclu|bypass|fail|did not pass|not eligible|ineligible|screened out|passed over|not shortlisted)/i.test(sn)) {
          var saysObs   = /(observation|draw|sample)/i.test(sn);
          var saysGrade = /grade/i.test(sn);
          var excluded = named.filter(function (id) { return id !== selId && id !== recId; });
          var higherIds = {};
          (ctx.higherRawScoreExclusions || []).forEach(function (x) { higherIds[x.marketId] = true; });
          var claimsHigher = /(higher|above|outrank|top-scoring|better-scoring)[^.;]{0,30}(score|rank)/i.test(sn) ||
                             /(score|rank)[^.;]{0,15}(higher|above)/i.test(sn);
          if (claimsHigher && !(ctx.higherRawScoreExclusions || []).length && !negated) {
            flag(t.field, "No segment scores above the selected target, so none was excluded for scoring higher.", sn);
          }
          excluded.forEach(function (id) {
            var mk2 = ctxMarkets[id];
            if (claimsHigher && (ctx.higherRawScoreExclusions || []).length && !higherIds[id] &&
                id !== (ctx.highestRawScoreMarket && ctx.highestRawScoreMarket.marketId)) {
              flag(t.field, id + " does not score above the selected target.", sn);
            }
            if (mk2.passesSimulationSupportRule === true) {
              flag(t.field, id + " passes the screen; it was not excluded by it.", sn);
              return;
            }
            var fo = mk2.failsScreenOn;
            if (saysObs && !saysGrade && fo === "support grade") {
              flag(t.field, id + " fails on support grade alone, not on simulated observations.", sn);
            }
            if (saysGrade && !saysObs && fo === "simulated observations") {
              flag(t.field, id + " fails on simulated observations alone, not on support grade.", sn);
            }
          });
          /* A generic claim that the higher-scoring segments were excluded for
           * sample size, when some failed on grade alone. A sentence describing
           * the observation threshold itself ("10 segments fall below the
           * 30-observation threshold") is a true statement about that criterion
           * and is not checked here. */
          var aboutExclusion = /(higher|above|outrank|bypass|exclu|passed over|not shortlisted|shortlist)/i.test(sn);
          var aboutThreshold = /(threshold|fewer than|below\s+\d|under\s+\d)/i.test(sn);
          if (!excluded.length && saysObs && !saysGrade && gradeOnlyExclusions.length && !negated &&
              aboutExclusion && !aboutThreshold) {
            flag(t.field, "Attributes the exclusions to sample size, but " +
              gradeOnlyExclusions.map(function (x) { return x.name; }).join(", ") +
              " failed on support grade alone.", sn);
          }
        }

        // 7a. Counts of segments passing or failing the screen.
        var scr = ctx.simulationSupportScreen;
        if (scr && /screen/i.test(sn)) {
          var cm2, cntRe = /\b(\d{1,2})\s+(?:of\s+(?:the\s+)?\d{1,2}\s+)?(?:market\s+|candidate\s+)?segments?\b([^.;]{0,90})/gi;
          while ((cm2 = cntRe.exec(sn)) !== null) {
            var nn = parseInt(cm2[1], 10), rest = cm2[2];
            var failing = scr.segmentsTotal - scr.segmentsPassing;
            if (/\bfail/i.test(rest) && nn !== failing) {
              flag(t.field, nn + " segments said to fail the screen; " + failing + " fail it.", sn);
            } else if (/\bpass/i.test(rest) && !/\bfail/i.test(rest) && nn !== scr.segmentsPassing) {
              flag(t.field, nn + " segments said to pass the screen; " + scr.segmentsPassing + " pass it.", sn);
            }
          }
        }

        // 7. Figures.
        var numRe = /(?<![A-Za-z\d\-.₹])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s*%|\s*pp)?(?![\d])/g, nm;
        while ((nm = numRe.exec(sn)) !== null) {
          var tok = nm[1], isPct = !!nm[2];
          var val = parseFloat(tok.replace(/,/g, ""));
          if (/^(19|20)\d\d$/.test(tok)) { continue; }                          // years
          if (!isPct && tok.indexOf(".") === -1 && val <= 12) { continue; }      // small counts
          if (!numberAllowed(tok, allowed, isPct)) {
            flag(t.field, (isPct ? tok + "%" : tok) + " does not match any figure in the context at that precision.", sn);
          }
        }
      });
    });

    // 7b. The dominant factor is a deterministic fact, not a judgement.
    if (agentKey === "marketScreening" && ctx.selectedTarget && ctx.selectedTarget.largestContribution) {
      var want = ctx.selectedTarget.largestContribution.factor;
      var got = String(output.dominantFactor || "").toLowerCase();
      var names = ["rental yield", "rental growth", "diversification", "demand", "low market risk"];
      var said = names.filter(function (nm) { return got.indexOf(nm) !== -1; });
      if (got.indexOf(want) === -1 || said.length !== 1) {
        flag("dominantFactor", "The largest contribution is " + want + " (" +
          ctx.selectedTarget.largestContribution.contribution + "); the text names " +
          (said.length ? said.join(", ") : "\u201C" + got + "\u201D") + ".", output.dominantFactor);
      }
    }

    // 8. Target consistency.
    if (agentKey === "orchestrator" && ctx.selectedTarget) {
      var summary = String(output.recommendationSummary || "");
      var tgt = byId[selId];
      var hit = tgt && aliases(tgt).some(function (a) { return summary.toLowerCase().indexOf(a.toLowerCase()) !== -1; });
      if (!hit && summary.indexOf(selId) === -1) {
        flag("recommendationSummary", "Does not name the selected target (" + (tgt ? tgt.locality : selId) + ").", summary);
      }
      sentences(summary).forEach(function (sn) {
        if (!/(selected|recommend|shortlist candidate)/i.test(sn)) { return; }
        var ids = mentions(sn, universe, inContext).filter(function (id) { return ctxMarkets[id]; });
        if (ids.length === 1 && ids[0] !== selId && ids[0] !== recId) {
          flag("recommendationSummary", ids[0] + " is described as selected or recommended; the target is " + selId + ".", sn);
        }
      });
      var nextText = String(output.nextSteps || "");
      if (!/unverified/i.test(nextText) || !/due diligence/i.test(nextText)) {
        flag("nextSteps", "Must state that external calibration remains unverified and that due diligence is required.", nextText);
      }
    }

    var seen = {};
    issues = issues.filter(function (i) {
      var k = i.field + "|" + i.message + "|" + i.text;
      if (seen[k]) { return false; }
      seen[k] = true;
      return true;
    });
    return { ok: issues.length === 0, issues: issues };
  }

  var AgentOutputCheck = {
    SCHEMAS:      SCHEMAS,
    FIELD_LABELS: FIELD_LABELS,
    check:        check,
    numericWhitelist: numericWhitelist,
    mentions:     mentions,
    references:   references
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AgentOutputCheck;
  } else {
    root.AgentOutputCheck = AgentOutputCheck;
  }

}(typeof globalThis !== "undefined" ? globalThis : this));

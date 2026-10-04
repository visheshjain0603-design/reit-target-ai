/**
 * motion.js — motion that shows what changed
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * Every page controller re-renders its whole root whenever the shared analysis
 * changes, so the DOM itself cannot say what is new. This module watches each
 * page root, compares what was rendered with what was there before, and
 * animates only the difference:
 *
 *   - ranked rows glide from their old position to their new one (FLIP);
 *   - the candidate plate settles when the selected target changes;
 *   - a figure whose value changed glows briefly, then settles;
 *   - bars and charts draw in when their data is new or has changed;
 *   - content that has just been opened (a score breakdown, an agent card,
 *     the reset panel) eases in.
 *
 * It never changes text, values, order, focus or attributes the application
 * reads: it only adds short-lived classes and transforms. With
 * prefers-reduced-motion set it does nothing at all.
 *
 * Depends on: nothing. Loaded before the page controllers; it observes them.
 */

(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined" ||
      typeof MutationObserver === "undefined") { return; }

  var ROOT_IDS = ["overview-content", "portfolio-content", "screener-content", "hhi-content",
                  "agents-content", "datacentre-content", "statsdash-content", "report-content"];

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(mq && mq.matches); }

  /* Label → value pairs whose change is worth pointing out. */
  var CELLS = [
    { sel: ".reit-rec-cell",    label: ".reit-rec-cell-label",    value: ".reit-rec-cell-value" },
    { sel: ".reit-ov-card",     label: ".reit-ov-card-label",     value: ".reit-ov-card-value" },
    { sel: ".reit-metric-card", label: ".reit-metric-label",      value: ".reit-metric-value" },
    { sel: ".reit-ba-card",     label: ".reit-ba-label",          value: ".reit-ba-value" },
    { sel: ".reit-output-stat", label: ".reit-output-stat-label", value: ".reit-output-stat-value" },
    { sel: ".reit-card",        label: ".reit-card-label",        value: ".reit-card-value" },
    { sel: ".reit-quality-chip", label: ".reit-quality-chip__lbl", value: ".reit-quality-chip__num" }
  ];

  /* Things that ease in when they first appear. */
  var OPENABLE = [".reit-breakdown-wrap", ".reit-agent-card", ".reit-ov-reset-panel", ".reit-form-panel",
                  ".reit-system-check-list"];

  var BARS = ".reit-alloc-bar, .reit-bar-fill";
  var CHARTS = "canvas, svg[role='img']";
  var CHANGE_WINDOW_MS = 800;
  var OPEN_WINDOW_MS = 400;

  var EASE = "cubic-bezier(0.2, 0, 0, 1)";

  var state = {};          // root id → { snap, changedAt }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function text(el) { return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
  function visible(el) { return !!(el && el.offsetParent !== null); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* A row's position inside its own table, so content changing above the
   * table (a longer note, an opened filter panel) is not mistaken for a move. */
  function rowTop(el) {
    var t = el.closest("table") || el.parentNode;
    return el.getBoundingClientRect().top - t.getBoundingClientRect().top;
  }

  /* Remove a motion class once its own (finite) animations have finished, so
   * a page shown again later does not replay them. Animations on a hidden
   * page never start, so the class waits until the page is shown. */
  function settle(el, cls) {
    function done() {
      if (!el.getAnimations) { el.classList.remove(cls); return; }
      var busy = el.getAnimations({ subtree: true }).some(function (a) {
        var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        return t && t.iterations !== Infinity && (a.playState === "running" || a.playState === "pending");
      });
      if (!busy) {
        el.classList.remove(cls);
        el.removeEventListener("animationend", done);
      }
    }
    el.addEventListener("animationend", done);
  }

  function mark(el, cls) {
    if (!el || el.classList.contains(cls)) { return; }
    el.classList.add(cls);
    settle(el, cls);
  }

  // ─── Snapshot of what a root shows ────────────────────────────────────────

  function plateKey(el) {
    var holder = el.hasAttribute("data-target-id") ? el : el.closest("[data-target-id]");
    return holder ? holder.getAttribute("data-target-id") + "|" + holder.getAttribute("data-selection-mode") : "";
  }

  function snapshot(root) {
    var s = { visible: visible(root), cells: {}, plates: {}, rows: {}, opened: {}, charts: {},
              trail: {}, selected: null, size: 0 };

    CELLS.forEach(function (c) {
      each(root.querySelectorAll(c.sel), function (el) {
        var l = el.querySelector(c.label), v = el.querySelector(c.value);
        if (!l || !v) { return; }
        s.cells[c.sel + "|" + text(l)] = { el: el, value: text(v) };
        s.size++;
      });
    });

    each(root.querySelectorAll(".reit-plate, .reit-ov-card--target"), function (el) {
      s.plates[el.classList.contains("reit-plate") ? "plate" : "ov-target"] = { el: el, value: plateKey(el) };
      s.size++;
    });

    each(root.querySelectorAll("[data-flip-id]"), function (el, i) {
      s.rows[el.getAttribute("data-flip-id")] = { el: el, top: rowTop(el), index: i };
      s.size++;
    });

    var sel = root.querySelector(".reit-selected-row[data-flip-id]");
    s.selected = sel ? sel.getAttribute("data-flip-id") : null;

    OPENABLE.forEach(function (q) {
      each(root.querySelectorAll(q), function (el, i) {
        var key = q + "|" + (el.getAttribute("data-motion-key") ||
          text(el.querySelector("h3, h2, .reit-form-title")) || i);
        s.opened[key] = { el: el, index: i };
      });
    });

    each(root.querySelectorAll(CHARTS), function (el, i) {
      var holder = el.parentNode && el.parentNode.id ? el.parentNode.id : "chart-" + i;
      s.charts[holder] = { el: el, sig: el.tagName === "svg" ? text(el) : null };
    });

    each(root.querySelectorAll(".reit-trail-step"), function (li) {
      var icon = li.querySelector(".reit-trail-icon");
      s.trail[text(li.querySelector(".reit-trail-label"))] = { el: icon, value: li.className };
    });

    return s;
  }

  // ─── Comparing two snapshots ──────────────────────────────────────────────

  /* Rows that stayed glide from where they were; rows that arrived fade in.
   * Returns true only when the ORDER changed (a re-ranking), not when rows
   * merely shifted because a breakdown opened or a filter removed others. */
  function flip(prev, cur) {
    if (!prev) { return false; }
    var common = Object.keys(cur.rows).filter(function (id) { return prev.rows[id]; });
    var before = common.slice().sort(function (a, b) { return prev.rows[a].index - prev.rows[b].index; });
    var after  = common.slice().sort(function (a, b) { return cur.rows[a].index - cur.rows[b].index; });
    var reordered = before.join() !== after.join();
    if (!prev.visible || !cur.visible) { return reordered; }

    var hadRows = Object.keys(prev.rows).length > 0;
    var entering = 0;
    Object.keys(cur.rows).forEach(function (id) {
      var r = cur.rows[id], p = prev.rows[id];
      if (p) {
        var dy = p.top - r.top;
        if (Math.abs(dy) > 2) {
          r.el.animate([{ transform: "translateY(" + dy + "px)" }, { transform: "none" }],
                       { duration: 460, easing: EASE });
        }
      } else if (hadRows) {
        r.el.animate([{ opacity: 0 }, { opacity: 1 }],
                     { duration: 280, delay: Math.min(entering++, 12) * 18, easing: EASE, fill: "backwards" });
      }
    });
    return reordered;
  }

  function highlightSelected(prev, cur, root) {
    if (!prev || !cur.selected || prev.selected === cur.selected || !cur.visible) { return; }
    var row = root.querySelector('.reit-selected-row[data-flip-id="' + cur.selected + '"]');
    if (!row) { return; }
    each(row.children, function (td) {
      td.animate([{ backgroundColor: "#F6D9A3" }, { backgroundColor: "#FCF4E3" }],
                 { duration: 900, easing: EASE });
    });
  }

  function compare(root) {
    var id = root.id;
    var rec = state[id] || (state[id] = { snap: null, changedAt: -Infinity, openedAt: {} });
    var prev = rec.snap;
    var cur = snapshot(root);
    var first = !prev || prev.size === 0;
    var changed = first;

    // The plate: new target, or a target that changed.
    Object.keys(cur.plates).forEach(function (k) {
      var p = prev && prev.plates[k];
      if (!p || p.value !== cur.plates[k].value) {
        mark(cur.plates[k].el, "m-fresh");
        changed = true;
      }
    });

    // Figures whose value changed since the last render.
    if (!first) {
      Object.keys(cur.cells).forEach(function (k) {
        var p = prev.cells[k], c = cur.cells[k];
        if (p && p.value !== c.value) {
          changed = true;
          if (!c.el.classList.contains("reit-ov-card--target")) { mark(c.el, "m-changed"); }
        }
      });
    }

    if (flip(prev, cur)) { changed = true; }
    highlightSelected(prev, cur, root);

    /* Newly opened content. A page may re-render several times in quick
     * succession (the agent chain renders after every step), replacing the
     * element each time, so anything that appeared in the last moment keeps
     * its entrance on the replacement too. */
    if (prev) {
      var t = now();
      Object.keys(cur.opened).forEach(function (k) {
        if (!prev.opened[k]) { rec.openedAt[k] = t; }
        if (t - (rec.openedAt[k] || -Infinity) < OPEN_WINDOW_MS) {
          var o = cur.opened[k];
          o.el.style.setProperty("--m-i", String(o.index));
          mark(o.el, "m-fresh");
        }
      });
      Object.keys(cur.trail).forEach(function (k) {
        var p = prev.trail[k], c = cur.trail[k];
        if (p && p.value !== c.value && c.el) { mark(c.el, "m-fresh"); }
      });
    }

    if (changed) { rec.changedAt = now(); }
    var recent = now() - rec.changedAt < CHANGE_WINDOW_MS;

    // Bars draw in with the data they show.
    if (recent) {
      var groups = {};
      each(root.querySelectorAll(BARS), function (bar) {
        var g = bar.closest("table, .reit-section") || root;
        var n = groups[g.className] = (groups[g.className] || 0) + 1;
        bar.style.setProperty("--m-i", String(n - 1));
        mark(bar, "m-fresh");
      });
    }

    // Charts: an SVG whose text changed, or any chart drawn while the data is fresh.
    Object.keys(cur.charts).forEach(function (k) {
      var c = cur.charts[k], p = prev && prev.charts[k];
      var svgChanged = c.sig !== null && (!p || p.sig !== c.sig);
      if ((c.sig !== null ? svgChanged && (recent || !p) : recent) && !c.el.classList.contains("m-chart")) {
        c.el.classList.add("m-chart");
        mark(c.el, "m-fresh");
      }
    });

    rec.snap = cur;
  }

  /* Before a person's action re-renders a page, record where its rows are
   * now, so the glide starts from what they were looking at. */
  function remeasure() {
    ROOT_IDS.forEach(function (id) {
      var root = document.getElementById(id);
      var rec = state[id];
      if (!root || !rec || !rec.snap) { return; }
      rec.snap.visible = visible(root);
      each(root.querySelectorAll("[data-flip-id]"), function (el) {
        var r = rec.snap.rows[el.getAttribute("data-flip-id")];
        if (r) { r.top = rowTop(el); }
      });
    });
  }

  // ─── Wiring ───────────────────────────────────────────────────────────────

  function watch(root) {
    var queued = false;
    var obs = new MutationObserver(function () {
      if (queued) { return; }
      queued = true;
      Promise.resolve().then(function () {
        queued = false;
        if (reduced()) { state[root.id] = { snap: snapshot(root), changedAt: -Infinity, openedAt: {} }; return; }
        try { compare(root); } catch (e) { /* motion is never allowed to break a page */ }
      });
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  function init() {
    ROOT_IDS.forEach(function (id) {
      var root = document.getElementById(id);
      if (root) { watch(root); }
    });
    ["click", "change", "keydown"].forEach(function (type) {
      document.addEventListener(type, remeasure, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.Motion = { reduced: reduced };
}());

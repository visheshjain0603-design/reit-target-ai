/**
 * siteMode.js — where the Agent Output page is offered.
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * The public site (GitHub Pages) cannot hold an API key, so it cannot call
 * Gemini. Rather than show stored commentary for four fixed settings, the
 * public site does not offer the Agent Output page at all. A local copy —
 * the live proxy on localhost:3001, or any static server on localhost —
 * keeps the page: live interpretation for any settings through the proxy,
 * or the four stored analyses as a no-key fallback.
 *
 * Loaded after appMeta.js and before uiHelpers.js, so the router never sees
 * the hidden page. `?publicSite=1` forces the public behaviour on a local
 * copy, for testing.
 */
(function () {
  "use strict";
  if (typeof document === "undefined") { return; }
  if (window.AppMeta && AppMeta.agentsAvailable()) {
    document.documentElement.setAttribute("data-agents", "on");
    return;
  }
  document.documentElement.setAttribute("data-agents", "off");
  var link = document.querySelector('.nav-link[data-page="agents"]');
  if (link && link.parentNode && link.parentNode.parentNode) { link.parentNode.parentNode.removeChild(link.parentNode); }
  var page = document.getElementById("page-agents");
  if (page && page.parentNode) { page.parentNode.removeChild(page); }
}());

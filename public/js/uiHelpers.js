// ================================================================
// uiHelpers.js — REIT Target AI
// ----------------------------------------------------------------
// Safe, dependency-free formatting and UI utilities.
//
// What this file IS:
//   - INR currency formatting
//   - Percentage formatting (decimal ratio input, e.g. 0.0614 → "6.14%")
//   - HHI display (decimal 0–1 input, no concentration labels)
//   - Date display (IST via istTime.js; plain YYYY-MM-DD split directly)
//   - Toast notifications (safe DOM construction)
//   - Single-page navigation (hash-based, portfolio fallback)
//   - Progressive-enhancement flag
//
// What this file IS NOT:
//   - No Firebase
//   - No Supabase
//   - No Tally / Gmail / Google Drive
//   - No Firestore collection names
//   - No API keys or credentials
//   - No rental-manager page logic
// ================================================================


// ── Progressive enhancement flag ─────────────────────────────────
// Adding this class to <html> lets CSS hide all pages except the
// active one. Without JS the class is never added, so all sections
// render stacked and remain readable.
document.documentElement.classList.add("js-enabled");


// ================================================================
// CURRENCY — Indian Rupee
// ================================================================

/**
 * formatINR(amount)
 * Returns a formatted INR string with Indian grouping (e.g. "₹1,23,456").
 * Returns "—" for null, undefined, NaN, or blank strings.
 */
function formatINR(amount) {
  if (amount === null || amount === undefined) return "—";
  if (typeof amount === "string" && amount.trim() === "") return "—";
  if (isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount));
}

/**
 * formatINRCr(amount)
 * Converts raw rupees to crores with 2 decimal places.
 * e.g. 12500000 → "₹1.25 Cr"
 * Returns "—" for null, undefined, NaN, or blank strings.
 */
function formatINRCr(amount, decimals) {
  if (amount === null || amount === undefined) return "—";
  if (typeof amount === "string" && amount.trim() === "") return "—";
  if (isNaN(Number(amount))) return "—";
  var d = (decimals === undefined || decimals === null) ? 2 : decimals;
  return "₹" + (Number(amount) / 1e7).toFixed(d) + " Cr";
}


// ================================================================
// PERCENTAGES
// ================================================================

/**
 * formatPercent(value, decimals)
 * value is a decimal ratio between 0 and 1.
 * Multiplied by 100 before display.
 * formatPercent(0.0614, 2) → "6.14%"
 * decimals defaults to 1.
 * Returns "—" for null, undefined, NaN, or blank strings.
 */
function formatPercent(value, decimals) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  if (isNaN(Number(value))) return "—";
  var d = (decimals === undefined || decimals === null) ? 1 : decimals;
  return (Number(value) * 100).toFixed(d) + "%";
}


// ================================================================
// NUMBERS
// ================================================================

/**
 * formatNumber(value, decimals)
 * Indian locale number grouping without currency symbol.
 * Both minimumFractionDigits and maximumFractionDigits are set to d,
 * so the requested decimal places are always preserved.
 * e.g. formatNumber(1234567, 0)    → "12,34,567"
 *      formatNumber(1234567.5, 2)  → "12,34,567.50"
 * Returns "—" for null, undefined, NaN, or blank strings.
 */
function formatNumber(value, decimals) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  if (isNaN(Number(value))) return "—";
  var d = (decimals === undefined || decimals === null) ? 0 : decimals;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  }).format(Number(value));
}


// ================================================================
// DATES — IST display via istTime.js
// ================================================================

/**
 * formatDisplayDate(iso)
 * Plain YYYY-MM-DD strings are split directly — no Date() object,
 * no timezone conversion — preventing the IST +5:30 day-shift bug.
 * Full ISO strings with a time component are passed to istParts()
 * for timezone-aware conversion to DD/MM/YYYY in IST.
 * Depends on istParts() from istTime.js (loaded before this file).
 * Returns "—" for missing, blank, or unparseable values.
 */
function formatDisplayDate(iso) {
  if (!iso) return "—";
  if (typeof iso === "string" && iso.trim() === "") return "—";

  // Plain date — split directly, never pass through new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) {
    var parts = String(iso).split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0]; // DD/MM/YYYY
  }

  // Full ISO datetime — convert via istParts (from istTime.js)
  if (typeof istParts !== "function") return String(iso).slice(0, 10);
  var p = istParts(iso);
  if (!p || !p.date) return "—";
  var dp = p.date.split("-");
  if (dp.length !== 3) return p.date;
  return dp[2] + "/" + dp[1] + "/" + dp[0]; // DD/MM/YYYY
}


// ================================================================
// HHI DISPLAY
// ================================================================

/**
 * formatHHI(value)
 * value is a decimal between 0 and 1.
 * Displays as: "0.5400 (5,400 / 10,000)"
 * No low/moderate/high labels — US DOJ merger thresholds are not
 * portfolio-diversification standards.
 * Returns "—" for null, undefined, NaN, or blank strings.
 */
function formatHHI(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  if (isNaN(Number(value))) return "—";
  var n = Number(value);
  var score = Math.round(n * 10000);
  return n.toFixed(4) + " (" + score.toLocaleString("en-IN") + " / 10,000)";
}


// ================================================================
// TOAST NOTIFICATIONS
// Safe DOM construction — textContent only, never innerHTML.
// ================================================================

/**
 * showToast(message, type)
 * type: "info" | "success" | "warn" | "error"
 * Appends a self-dismissing toast to #toast-container.
 */
function showToast(message, type) {
  var container = document.getElementById("toast-container");
  if (!container) return;

  var validTypes = ["info", "success", "warn", "error"];
  var safeType = validTypes.includes(type) ? type : "info";

  var toast = document.createElement("div");
  toast.className = "toast toast-" + safeType;
  toast.setAttribute("role", safeType === "error" ? "alert" : "status");

  var text = document.createElement("span");
  text.textContent = message; // textContent — never innerHTML
  toast.appendChild(text);

  container.appendChild(toast);

  setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.35s ease";
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 380);
  }, 3500);
}


// ================================================================
// SINGLE-PAGE NAVIGATION
// Hash-based. Reads data-page on <a> elements in the sidebar.
// Falls back to the FIRST nav link if the hash does not match any page id.
// ================================================================

(function () {
  var NAV_LINKS = document.querySelectorAll(".nav-link[data-page]");

  /*
   * The default page is read from the markup — the first sidebar link — rather
   * than named here. The previous version hardcoded "portfolio" in three
   * places, so adding the Overview page as the landing page would have meant
   * finding all three, and missing one would have produced an app that landed
   * on Overview from a click but on Portfolio from a bare URL.
   */
  var DEFAULT_PAGE = (NAV_LINKS.length && NAV_LINKS[0].getAttribute("data-page")) || "portfolio";

  function showPage(pageId) {
    var safeId = String(pageId).replace(/[^a-z0-9-_]/gi, "");
    var pages = document.querySelectorAll(".page");
    var target = document.getElementById("page-" + safeId);

    // ── Fallback: invalid or missing hash → the first sidebar page ──
    if (!target) {
      safeId = DEFAULT_PAGE;
      target = document.getElementById("page-" + DEFAULT_PAGE);
    }

    /* Inactive pages are hidden from assistive technology as well as from
     * sight: `hidden` removes them from the accessibility tree and `inert`
     * keeps their controls out of the tab order, so a screen reader never
     * reads seven pages the user cannot see. */
    pages.forEach(function (section) {
      var active = section === target;
      section.classList.toggle("page-active", active);
      if (active) {
        section.removeAttribute("hidden");
        section.removeAttribute("inert");
        section.removeAttribute("aria-hidden");
      } else {
        section.setAttribute("hidden", "");
        section.setAttribute("inert", "");
        section.setAttribute("aria-hidden", "true");
      }
    });

    NAV_LINKS.forEach(function (link) {
      var isActive = link.getAttribute("data-page") === safeId;
      link.classList.toggle("nav-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  var focusOnNavigate = false;

  function handleHashChange() {
    var hash = window.location.hash.replace("#", "") || DEFAULT_PAGE;
    showPage(hash);
    /* After a sidebar click, move focus to the new page's heading so keyboard
     * and screen-reader users land at the top of what they asked for. */
    if (focusOnNavigate) {
      focusOnNavigate = false;
      var active = document.querySelector(".page.page-active h1");
      if (active) {
        active.setAttribute("tabindex", "-1");
        active.focus();
      }
    }
  }

  // Intercept clicks — prevent full navigation, update hash instead.
  NAV_LINKS.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var page = link.getAttribute("data-page");
      focusOnNavigate = true;
      if (window.location.hash === "#" + page) { handleHashChange(); }
      else { window.location.hash = page; }
    });
  });

  window.addEventListener("hashchange", handleHashChange);

  // On load, read the hash or fall back to the first sidebar page.
  handleHashChange();
}());

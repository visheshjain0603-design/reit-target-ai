// ================================================================
// istTime.js — UTC timestamp → IST display parts
// ----------------------------------------------------------------
// Pure engine — no DOM, no Firestore, no `store`. Unit-tested by
// tests/istTime.test.js via `node --test`.
//
// WHY THIS EXISTS
// Records store their time as `new Date().toISOString()`, which is UTC. That
// is correct storage. But a screen that slices the string directly —
// `ts.substring(0,10)` for the date, `ts.substring(11,19)` for the time —
// renders UTC while the rest of the app speaks IST, so every value reads 5:30
// early. Worse, anything between 00:00 and 05:30 IST shows the PREVIOUS DAY'S
// DATE, because that instant is still yesterday in UTC. On an audit trail a
// wrong date is worse than a wrong time: it can point at the wrong day's work.
//
// THE FORM THIS DELIBERATELY AVOIDS
// `330 - d.getTimezoneOffset()` looks like it generalises, but it double-counts
// for a viewer already in IST and yields IST+5:30. That bug shipped here once —
// the "Re-stamp Digital Signatures" maintenance job exists to clean up after it.
// Adding a fixed offset to the epoch and reading back through getUTC* is the
// form dataLayer.js settled on, and it gives the same answer no matter what
// timezone the viewer's machine is set to.
// ================================================================

// India Standard Time is UTC+05:30 and observes no daylight saving, so a
// constant is correct here in a way it would not be for most zones.
var IST_OFFSET_MINUTES = 330;

function _istPad2(n) { return String(n).length < 2 ? "0" + n : String(n); }

/**
 * iso — an ISO-8601 string (or a Date). Anything unparseable yields blanks
 *       rather than "NaN", so a malformed record renders as an empty cell
 *       instead of shouting at the user.
 *
 * Returns { date: "YYYY-MM-DD", time: "HH:MM:SS" }, both in IST.
 * Callers should use `.date` for filtering as well as display — comparing a
 * user-picked date against a UTC-derived one is the same bug wearing a hat.
 */
function istParts(iso) {
  if (!iso) return { date: "", time: "" };
  var d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };

  var ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60000);
  return {
    date: ist.getUTCFullYear() + "-" + _istPad2(ist.getUTCMonth() + 1) + "-" + _istPad2(ist.getUTCDate()),
    time: _istPad2(ist.getUTCHours()) + ":" + _istPad2(ist.getUTCMinutes()) + ":" + _istPad2(ist.getUTCSeconds())
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { IST_OFFSET_MINUTES: IST_OFFSET_MINUTES, istParts: istParts };
}

/**
 * browserSmokeTest.js — run the browser acceptance checks headlessly (optional)
 * REIT Target AI | NMIMS B.Sc. Finance — BA Theme 4 (Academic Demo)
 *
 * A thin Playwright wrapper around tests/browserAcceptance.js, so the same
 * checks can run without a person at the browser. Playwright is NOT a project
 * dependency; install it only if you want this runner:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8778          # from the repository root
 *   node tests/browserSmokeTest.js
 *
 * Writes tests/acceptance-results.json (desktop and 390 px runs, plus every
 * console error seen) and refreshes docs/screenshots/. The same harness can be
 * run by hand in any browser — see the header of tests/browserAcceptance.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8778/public/index.html";
const HARNESS = fs.readFileSync(path.join(__dirname, "browserAcceptance.js"), "utf8");
const SHOTS = path.join(__dirname, "..", "docs", "screenshots");

async function run(browser, viewport, mobile) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.goto(BASE + "#overview");
  await page.waitForTimeout(1500);
  await page.evaluate(HARNESS);
  const result = await page.evaluate((m) => window.runAcceptance({ mobile: m }), mobile);
  if (!mobile) {
    for (const route of ["overview", "screener", "diversification", "agents", "datacentre", "report"]) {
      await page.evaluate((r) => { location.hash = r; }, route);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, route + ".png") });
    }
  } else {
    await page.screenshot({ path: path.join(SHOTS, "overview-mobile-390px.png") });
  }
  await page.close();
  return Object.assign(result, { viewport, consoleErrors });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const desktop = await run(browser, { width: 1440, height: 1000 }, false);
  const mobile = await run(browser, { width: 390, height: 844 }, true);
  await browser.close();
  const out = { runner: "tests/browserSmokeTest.js (Playwright)", runAt: new Date().toISOString(), desktop, mobile };
  fs.writeFileSync(path.join(__dirname, "acceptance-results.json"), JSON.stringify(out, null, 1) + "\n");
  console.log("Desktop: " + desktop.summary + " — console errors: " + desktop.consoleErrors.length);
  console.log("Mobile:  " + mobile.summary + " — console errors: " + mobile.consoleErrors.length);
  const ok = desktop.passed === desktop.total && mobile.passed === mobile.total &&
             !desktop.consoleErrors.length && !mobile.consoleErrors.length;
  process.exit(ok ? 0 : 1);
})();

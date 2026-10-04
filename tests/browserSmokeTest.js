const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8777/index.html';
const PAGES = ['overview','portfolio','screener','diversification','statsdash','agents','datacentre','report'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const results = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  const pageErrors = [];
  const failedReq = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('requestfailed', r => failedReq.push(r.url() + ' :: ' + (r.failure()||{}).errorText));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  for (const p of PAGES) {
    const before = consoleErrors.length + pageErrors.length;
    await page.goto(BASE + '#' + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const active = await page.evaluate(() => {
      const el = document.querySelector('.page.page-active');
      return el ? el.id : null;
    });
    const content = await page.evaluate(() => {
      const el = document.querySelector('.page.page-active');
      if (!el) return { len: 0, text: '' };
      const t = el.innerText || '';
      return { len: t.trim().length, text: t.trim().slice(0, 240) };
    });
    const loading = await page.evaluate(() => {
      const el = document.querySelector('.page.page-active');
      return el ? !!el.querySelector('.loading-msg') : false;
    });
    const err = await page.evaluate(() => {
      const el = document.querySelector('.page.page-active');
      const e = el ? el.querySelector('.error-msg') : null;
      return e ? e.textContent : null;
    });
    await page.screenshot({ path: `shot-${p}.png`, fullPage: false });
    results.push({ page: p, active, chars: content.len, stillLoading: loading, errorMsg: err,
                   newErrors: consoleErrors.length + pageErrors.length - before,
                   head: content.text.replace(/\n/g,' | ').slice(0,160) });
  }

  // Interaction checks on the screener
  await page.goto(BASE + '#screener', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const inter = {};
  inter.recBanner = await page.evaluate(() => {
    const b = document.querySelector('.reit-rec-banner');
    return b ? b.innerText.replace(/\n/g,' | ').slice(0,300) : null;
  });
  // open filters
  await page.click('#filter-toggle');
  await page.waitForTimeout(300);
  inter.filterOpen = await page.evaluate(() => {
    const b = document.getElementById('filter-body');
    return b ? !b.hidden : false;
  });
  inter.filterGroups = await page.evaluate(() => document.querySelectorAll('.reit-filter-group').length);
  // apply a retail filter
  const retail = await page.$('#f-propertyTypes-Retail');
  if (retail) { await retail.click(); await page.waitForTimeout(400); }
  inter.afterRetail = await page.evaluate(() => {
    const c = document.querySelector('.reit-filter-count');
    return c ? c.textContent : null;
  });
  inter.rowsAfterRetail = await page.evaluate(() =>
    document.querySelectorAll('.reit-ranked-table tbody tr.reit-market-row').length);
  // reset
  const reset = await page.$('.reit-filter-reset');
  if (reset) { await reset.click(); await page.waitForTimeout(400); }
  inter.afterReset = await page.evaluate(() => {
    const c = document.querySelector('.reit-filter-count');
    return c ? c.textContent : null;
  });
  // override toggle
  const ov = await page.$('#gov-override');
  if (ov) { await ov.click(); await page.waitForTimeout(600); }
  inter.afterOverride = await page.evaluate(() => {
    const n = document.querySelector('.reit-rec-note');
    return n ? n.textContent.slice(0,200) : null;
  });
  if (ov) { await (await page.$('#gov-override')).click(); await page.waitForTimeout(600); }
  // expand a row -> observation panel
  const detail = await page.$('.reit-breakdown-toggle');
  if (detail) { await detail.click(); await page.waitForTimeout(1200); }
  inter.obsPanel = await page.evaluate(() => {
    const p = document.querySelector('.reit-obs-panel');
    return p ? p.innerText.replace(/\n/g,' | ').slice(0,300) : null;
  });
  inter.obsHistRows = await page.evaluate(() =>
    document.querySelectorAll('.reit-obs-hist-table tr').length);
  await page.screenshot({ path: 'shot-screener-expanded.png', fullPage: false });

  // report after a screener run
  await page.goto(BASE + '#report', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  inter.reportScores = await page.evaluate(() => {
    const tbl = document.querySelectorAll('.reit-table')[0];
    if (!tbl) return null;
    return Array.from(tbl.querySelectorAll('tbody tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join(' | '));
  });
  inter.reportEvidence = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.reit-report__kv-row'))
      .map(r => r.textContent);
    return rows.filter(r => /Evidence|Score|Selection Basis/i.test(r)).slice(0,8);
  });
  await page.screenshot({ path: 'shot-report.png', fullPage: false });

  // mobile viewport
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobErrors = [];
  mob.on('pageerror', e => mobErrors.push(String(e)));
  await mob.goto(BASE + '#screener', { waitUntil: 'networkidle' });
  await mob.waitForTimeout(900);
  inter.mobileHorizontalOverflow = await mob.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  inter.mobileErrors = mobErrors.length;
  await mob.screenshot({ path: 'shot-mobile-screener.png', fullPage: false });

  fs.writeFileSync('smoke-results.json', JSON.stringify({
    results, inter,
    consoleErrors: consoleErrors.slice(0, 20),
    pageErrors: pageErrors.slice(0, 20),
    failedRequests: failedReq.slice(0, 20)
  }, null, 1));
  await browser.close();
  console.log(JSON.stringify({ results, inter }, null, 1));
  console.log('consoleErrors', consoleErrors.length, 'pageErrors', pageErrors.length, 'failedReq', failedReq.length);
  if (consoleErrors.length) console.log(consoleErrors.slice(0,10));
  if (pageErrors.length) console.log(pageErrors.slice(0,10));
  if (failedReq.length) console.log(failedReq.slice(0,10));
})();

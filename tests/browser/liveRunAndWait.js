const btn = document.querySelector('#agents-content .reit-run-btn');
const before = btn ? btn.textContent.trim() : 'no button';
const run = AnalysisRun.current ? AnalysisRun.current() : null;
const t0 = performance.now(); const started = new Date().toISOString();
if (btn) btn.click();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 240; i++) {
  await sleep(500);
  const cards = [...document.querySelectorAll('.reit-agent-card')];
  const done = cards.length === 4 && cards.every(c => /Consistency check|Withheld|unavailable|No synthesis|Deterministic output/.test(c.textContent));
  const running = /Running|Generating/.test((document.querySelector('#agents-content .reit-run-btn')||{}).textContent || '');
  if (done && !running) break;
}
const ms = Math.round(performance.now() - t0);
const cards = [...document.querySelectorAll('.reit-agent-card')].map(c => {
  const h = c.querySelector('h3'); const t = c.textContent;
  return (h ? h.textContent.trim() : '?') + ' | model:' + ((c.querySelector('.reit-model-tag')||{}).textContent || '-') +
    ' | live:' + /Live Gemini interpretation/.test(t) + ' | check:' + (/Consistency check passed after one revision/.test(t) ? 'passed after revision' : /Consistency check passed/.test(t) ? 'passed' : /Withheld/.test(t) ? 'WITHHELD' : 'none');
});
const r = window._reitAgentOutputs;
return JSON.stringify({ button: before, started, durationMs: ms, scenarioKey: r && r.scenarioKey, cards,
  trail: [...document.querySelectorAll('.reit-trail-step, .reit-trail li')].map(x => x.textContent.replace(/\s+/g,' ').trim()).slice(0,6),
  deterministic: (document.body.textContent.match(/All 8 deterministic checks passed|\d of 8 deterministic checks[^.]*/)||['?'])[0] }, null, 1);

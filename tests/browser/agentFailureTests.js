const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const realFetch = window.fetch.bind(window);
const sent = [];
async function runChain(mock) {
  window.fetch = function (url, opts) {
    if (String(url).indexOf('/api/agent') === -1) return realFetch(url, opts);
    const body = JSON.parse(opts.body); sent.push(body);
    return mock(body);
  };
  const btn = document.querySelector('#agents-content .reit-run-btn'); btn.click();
  for (let i = 0; i < 60; i++) { await sleep(250); const o = window._reitAgentOutputs; if (o && Object.keys(o._provenance || {}).length >= 3 && !/Running/.test(btn.textContent)) break; }
  await sleep(400);
  return [...document.querySelectorAll('.reit-agent-card')].map(c => (c.querySelector('h3')||{}).textContent + ' :: ' +
    (/Withheld/.test(c.textContent) ? 'WITHHELD' : /Fresh generation was unavailable/.test(c.textContent) ? 'UNAVAILABLE' :
     /Pre-generated/.test(c.textContent) ? 'STORED' : /Consistency check passed/.test(c.textContent) ? 'PASSED' : 'OTHER'));
}
const json = (status, obj) => Promise.resolve(new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } }));
const out = {};
// 1. network failure
out.network = await runChain(() => Promise.reject(new TypeError('Failed to fetch')));
out.networkDeterministic = /All 8 deterministic checks passed/.test(document.body.textContent);
location.hash = 'report'; await sleep(900);
out.networkReport = /No agent commentary for this run|withheld/.test(document.getElementById('report-content').textContent);
location.hash = 'agents'; await sleep(900);
// 2. quota exhausted
out.quota = await runChain(() => json(429, { error: 'Gemini quota exhausted for today', detail: 'RESOURCE_EXHAUSTED' }));
// 3. orchestrator fails the check twice → withheld; data agent good
sent.length = 0;
out.quarantine = await runChain((b) => json(200, { output: b.agentType === 'orchestrator' ? window.__BADORCH : window.__GOOD[b.agentType], model: 'mock' }));
out.repairAttempted = sent.filter(b => b.agentType === 'orchestrator').length === 2 && !!sent.filter(b => b.agentType === 'orchestrator')[1].context.revisionNotes;
out.publishedOrchestrator = !!(window._reitAgentOutputs && window._reitAgentOutputs.orchestrator);
location.hash = 'report'; await sleep(900);
out.reportWithheld = /failed the consistency check and is withheld/.test(document.getElementById('report-content').textContent);
out.reportShowsBadText = /99\.99/.test(document.getElementById('report-content').textContent);
location.hash = 'agents'; await sleep(900);
// 4. data agent fails twice → withheld and NOT passed downstream
sent.length = 0;
const badData = JSON.parse(JSON.stringify(window.__GOOD.dataStatistical)); badData.datasetSummary = 'The dataset of 999 segments is verified market evidence with 30 observations guaranteeing reliability.';
out.downstream = await runChain((b) => json(200, { output: b.agentType === 'dataStatistical' ? badData : window.__GOOD[b.agentType], model: 'mock' }));
const ms = sent.find(b => b.agentType === 'marketScreening');
out.dataWithheldFromNextAgent = !!ms && ms.context.dataStatisticalOutput === null;
window.fetch = realFetch;
return JSON.stringify(out, null, 1);

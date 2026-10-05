# Browser scripts for the agent tests

These scripts drive the real pages in WebKit. They are run by hand; their
results from the final run are in `tests/evidence/`.

| Script | What it does | Needs |
|---|---|---|
| `liveRunAndWait.js` (with `setupExerciseA2.js`) | Sets runbook Exercise A2 (custom 35/25/20/10/10, ₹75 Cr), presses **Run Agent Analysis** and records each agent's provenance, check result, the trail and the duration | `node server/server.js` with a key in `server/.env` (makes real calls) |
| `agentFailureTests.js` | Replaces only the `/api/agent` request and checks: network failure, quota error (HTTP 429), a reply that fails the consistency check twice (withheld, kept out of the report), and that a withheld reply is not passed to the next agent | the proxy serving the page; no API calls are made |
| `staleCommentaryTest.js` | Static mode: stored commentary is labelled as stored, appears only at an exactly matching configuration, and disappears from Agent Output and the Decision Report when the amount changes | any static server for the repository |

`runInWebKit.swift` runs a setup script and then an async script in an
off-screen WebKit view on macOS:

```bash
swift tests/browser/runInWebKit.swift "http://localhost:3001/#overview" tests/browser/setupExerciseA2.js tests/browser/liveRunAndWait.js
```

`agentFailureTests.js` expects `window.__GOOD` (four schema-valid replies) and
`window.__BADORCH` (an Orchestrator reply with a wrong market and score) to be
defined by the setup script; the final run built them from the live run in
`tests/evidence/live-gemini-run-20261005.json`.

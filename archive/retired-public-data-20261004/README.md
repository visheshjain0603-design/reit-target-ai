# Retired public data — archived 4 October 2026

Moved here from `public/data/` so that GitHub Pages stops publishing them.
Nothing in the application reads any file in this folder. Nothing was deleted.

| File | Was at | What it is |
|---|---|---|
| `markets.backup-v1-20260920.json` | `public/data/` | `markets.json` from the v1 dataset, before generator v2.0.0 regenerated the observations (20 September 2026). |
| `markets.prerun-20260930-185608.json` | `public/data/_to_delete/` | Snapshot taken before the 30 September pipeline run. Byte-identical to `public/data/markets.json` on the day it was archived. |
| `agent-cache.six-agent-20261001.json` | `public/data/agent-cache.json` | Pre-generated commentary in the retired six-agent format (`.agents`, not `.scenarios`), from agents `dataQuality`, `statisticalAnalysis`, `marketScreening`, `diversification`, `validation`, `orchestrator`. The application cannot read this format. Kept as the record of what the old chain said; replaced by a rebuild with `data-pipeline/scripts/buildAgentCache.js`. |

Use `git log --follow <file>` for history.

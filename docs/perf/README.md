# Performance measurements

Everything runs locally and offline: no production server, no Riot API, no real player data (the simulator, a synthetic history and a synthetic server database from `packages/sim`).

```powershell
pnpm perf --label before          # everything (~15 min); writes docs/perf/results/before.json
pnpm perf --label x --only server # parts: bundle, desktop (cold start), clicks (replays + clicks), bench, server, fallow; --quick for a short run
pnpm perf --label x --only desktop --cold-starts 200   # app loading at p50/p95/p99: a p99 needs at least 100 runs (--flows 200 with --only server for the /me/profile and meta fetches)
pnpm perf:compare before after    # markdown before → after table with budgets (scripts/perf/budgets.json)
pnpm perf:screens before          # screenshots + view dumps of every screen into docs/perf/results/before/
pnpm perf:guard before after      # regression guard: dumps equal, pixels equal (timer ring masked), overflow 0
```

Cold starts ask the real Data Dragon unless `LDC_PERF_DDRAGON_DIR` names a copy of a panel's Data Dragon cache (any profile's `ddragon` folder): then a local stub (`scripts/perf/ddragon-stub.ts`) serves it, with `LDC_PERF_DDRAGON_DELAYS` on `versions.json`: a number of ms, `hang` (never answers) or `tail` (the delays seen from the real CDN).

How it works: `LDC_PERF=out.json` (dev builds only) makes the panel record marks, every ViewState push, the renderer's commits, long tasks, frames, clicks and memory, then quit (`apps/desktop/src/main/perf.ts`, `src/renderer/perf.ts`). `scripts/perf/desktop.ts` runs it against the mock League client; `scripts/perf/server.ts` builds a synthetic database and benchmarks this branch's built server on port 8799 with autocannon; `apps/desktop/bench` and `packages/sim/bench` are micro benchmarks. Medians and p95 from at least 10 runs or 30 samples; changes under 5% or inside the spread are noise.

Results: [REPORT.md](REPORT.md).

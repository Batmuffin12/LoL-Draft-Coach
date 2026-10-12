# Performance report: panel and server

Measured with `pnpm perf` (see [README.md](README.md)) on one machine, offline: the panel on the simulator and a synthetic 1,000-game history, the server on a synthetic database on localhost. Medians unless marked; p95 for the panel, p99 for server latency.

## Where we are now (baseline, `main` 330bd0c, v0.7.8)

Budgets met: **22 of 23**. The one over: the full profile download.

| Area | Metric | Baseline | Budget |
| --- | --- | --- | --- |
| Cold start | process start → first full screen | 724 ms (p95 742) | ≤ 2 s ✔ |
| | … of which the main process loads the profile | 372 ms | |
| | ViewState pushes until then | 57 | |
| Champ select | event → painted (mid-counter replay) | 10.8 ms (p95 19.0) | p95 ≤ 50 ✔ |
| | building the view in main per draft event | 1.3 ms (p95 1.9) | |
| | ViewState size per push | 43 kB | |
| | pushes per draft event | 2; 34% of pushes repeat the one before | |
| | React commit per push | 0.2 ms (p95 0.3) | |
| Renderer | long tasks over 50 ms | none | none ✔ |
| | frames (timer ring) | 16.7 ms (p95 16.8) | 60 fps ✔ |
| | heap growth between replays | 0.08–0.23 MB | none ✔ |
| Clicks → next paint | lobby tab / locked-in tab / pill / "If not" | p95 15.9 / 16.7 / 16.4 / 16.6 ms | p95 ≤ 100 ✔ |
| Main process (bench) | load a 1,000-game history | 423 ms | |
| | a new meta snapshot | 298 ms | |
| Server | wake-up (process start → first 200) | 134 ms | ≤ 1 s ✔ |
| | `/health`, `/config`, `/meta` p99 (10 connections) | 5–8 ms | ≤ 50 ✔ |
| | `/config` with its ETag | **200, never 304** (12.6 kB each time) | |
| | `/me/profile` full, 1,000 games | p99 **2,327 ms** (10 conn.), 207 ms alone; 1.86 MB gzip, 14 MB JSON | p99 ≤ 200 ✘ |
| | `/me/profile?since` | p99 46 ms | ≤ 200 ✔ |
| Startup round trips | panel start → profile, meta, config in | 3 requests, 282 ms; the next start the same (14 MB again) | |
| Code health (fallow) | issues / duplication / health | 43 / 2.3% / 78.4 | |

Full numbers: [results/baseline.json](results/baseline.json); screens: [results/baseline/](results/baseline/).

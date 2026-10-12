# Perf run: progress log

Unattended optimisation run (prompt: [OPTIMIZE-PROMPT.md](OPTIMIZE-PROMPT.md)). Worktree `C:\fullstack\ldc-perf`, branch `perf/optimize` from `main` (330bd0c, v0.7.8). If the context is compacted: re-read this file and carry on from the first unchecked box.

## Plan

1. Harness (`scripts/perf/`, `pnpm perf`, `pnpm perf:compare`, `pnpm perf:screens`, `pnpm perf:guard`), baseline numbers and baseline screens.
2. Read the hot paths, rank candidates by budget first, then gain ÷ risk.
3. One optimisation per commit, measured, guarded (view dumps + screenshots identical).
4. After-numbers, report, changelog, PR, summary artifact.

## Checklist

- [x] Worktree, `.env` copied, `pnpm install`, Electron installed
- [x] `pnpm typecheck && pnpm test` green before any change (527 tests)
- [x] Desktop perf aid `LDC_PERF` (main `src/main/perf.ts`, renderer `src/renderer/perf.ts`, profiling build via `LDC_PERF_PROFILING=1`)
- [x] Synthetic history `history()` in packages/sim (+ test)
- [x] Desktop driver `scripts/perf/desktop.ts` (startup, replay with clicks, screens)
- [x] Server bench `scripts/perf/server.ts` (synthetic DB, cold start, autocannon, jobs, query plans)
- [x] Micro benches (`apps/desktop/bench/coach.bench.ts`, `packages/sim/bench/engine-meta.bench.ts`, runner `scripts/perf/microbench.ts`)
- [x] fallow (config `.fallowrc.jsonc`)
- [x] `run.mjs`, `compare.mjs`, `budgets.json`, `screens.mjs`, `guard.mjs`, `image-diff.cjs`
- [x] Baseline screens `docs/perf/results/baseline/` (guard re-run on unchanged code: all match)
- [ ] Baseline numbers `pnpm perf --label baseline`, REPORT.md "Where we are now"
- [ ] Commit the harness
- [ ] Phase 2: ranked list
- [ ] Phase 3: optimisations
- [ ] Phase 4: after numbers, REPORT.md, README.md, CHANGELOG, CLAUDE.md status, PR, artifact

## Ranked candidates

(filled after the baseline)

## Log

- 10:00 Setup done; baseline tests green.
- 10:15 First probes: cold start ≈ 0.7 s to the first full screen; loading a 1,000-game profile blocks the main process ≈ 370 ms (`profiles:profile`), a new meta snapshot ≈ 310 ms; a champ select update costs ≈ 1–2 ms in main and makes 2 pushes; ~40% of pushes are identical (apart from a timestamp) to the one before.
- 10:30 Server probes: `/config` never answers 304 to a gzip client (the compress middleware turns its ETag weak, `W/"…"`, and the route compares strongly), so the panel downloads the whole config on every champ select. Full `/me/profile` (1,000 games) ≈ 210 ms alone, p99 ≈ 2.4 s with 10 connections; `?since` p99 ≈ 50 ms.

## Decisions for the owner

- The benchmarks use a **synthetic** server database (`.local/perf-server`, built from packages/sim: one user with 1,000 games, 20,000 collector games, a snapshot built by the real `publishSnapshot`) instead of a copy of `apps/server/data/ldc.sqlite`: repeatable, holds no real player, and the local DB had only 200 games and a 264-game snapshot (not representative). The server runs with no Riot key and no admin token, so it cannot call Riot.
- Dev tools added for measuring: `tsx` and `autocannon` (root devDependencies), `@ldc/sim` and `@ldc/lcu` as root devDependencies (the perf scripts use them), `@ldc/meta` as a devDependency of `@ldc/sim` (the meta bench). No runtime dependency added.
- Vitest 5 dropped `bench()`, so the micro benches use a 40-line runner (`scripts/perf/microbench.ts`) run with tsx.

## Tried and reverted

(none yet)

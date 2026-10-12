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
- [x] Baseline numbers `pnpm perf --label baseline`, REPORT.md "Where we are now"
- [x] Commit the harness
- [x] Phase 2: ranked list
- [x] Phase 3: optimisations (in the order above)
- [x] Phase 4: after numbers, REPORT.md, README.md, CHANGELOG, CLAUDE.md status, PR, artifact

## Ranked candidates

Baseline: 22/23 budgets met. Over budget: full `GET /me/profile` (p99 2,327 ms at 10 connections, 207 ms alone).

1. **Full profile (over budget).** Server: send the stored summary JSON as is instead of parsing 1,000 summaries (drizzle json mode) and stringifying them again. Panel: keep the matches on disk so a start asks `?since=` (today every app start downloads 1.86 MB gzip / 14 MB JSON again, since the match cache is in memory only).
2. **`/config` never 304** to gzip clients (compress makes the ETag weak; the route compares strongly): weak comparison as HTTP says. Saves 12.6 kB + parsing per start and per champ select.
3. **Main-process profile load 372 ms / new snapshot 298 ms** (cold start 724 ms): profile, then memoize or speed up the hot engine/view work.
4. **Pushes:** 57 until the first full screen, 2 per draft event, 34% repeat the previous one: send at most one per event-loop turn, skip exact repeats.
5. Renderer: the champ select screen re-renders all of it 4×/s for the timer (530 commits/min, 0.2 ms each): within budget, small.
6. fallow findings (14 unused exports, class members flagged by the fluent sim builders are false positives).

## Log

- 10:00 Setup done; baseline tests green.
- 10:15 First probes: cold start ≈ 0.7 s to the first full screen; loading a 1,000-game profile blocks the main process ≈ 370 ms (`profiles:profile`), a new meta snapshot ≈ 310 ms; a champ select update costs ≈ 1–2 ms in main and makes 2 pushes; ~40% of pushes are identical (apart from a timestamp) to the one before.
- 10:30 Server probes: `/config` never answers 304 to a gzip client (the compress middleware turns its ETag weak, `W/"…"`, and the route compares strongly), so the panel downloads the whole config on every champ select. Full `/me/profile` (1,000 games) ≈ 210 ms alone, p99 ≈ 2.4 s with 10 connections; `?since` p99 ≈ 50 ms.

- 10:50 `/config` 304 fix (weak ETag comparison): 200/12.6 kB → 304/0 B per check. Committed 8ed9b99.
- 11:05 `/me/profile` built from the stored summary text (no parse/stringify): alone 207 → 152 ms; 10 connections p99 2,327 → ~1,000 ms. Committed 2447156.
- 11:20 Tried: explicit async gzip on the thread pool (−13% p99 at 10 connections, nothing alone: reverted, simpler without) and a per-user gzip cache keyed by the JSON's hash (p99 → 369 ms at 10 connections, but up to ~60 MB of memory on a 256 MB server for a request real users rarely repeat: reverted).
- 11:40 Panel keeps its matches on disk; server got additive `ids=` / `timelines=1` on `/me/profile`. Next start 282 ms / 14.06 MB → 78 ms / 37 kB. Committed c3ca01f, 42c99bf.
- 12:00 CPU profile of the coach: `empiricalPercentile` (linear scan) was ~90% of a profile load. Binary search: load a history 423 → 72 ms, new snapshot 298 → 46 ms. Guard: all screens identical. Committed 80e159d. (Harness fix: wipe the panel's app state between runs, the advice log leaked into screens; fca9287.)
- 12:15 StatePusher (one push per event-loop turn, skip repeats): pushes to first screen 57 → 9, pushes/min −57%, repeats 34% → 3%. Cold start (with the engine fix) 724 → 412 ms. Guard all identical. Committed 4901ba9.
- 12:25 Tried: minify the main bundle (1.85 → 0.95 MB): main script start 100 → 97 ms, first full screen unchanged (noise): reverted (worse stack traces for no gain).

- 12:30 fallow cleanup (unused exports, `HowYouPlay`, shared's zod): issues 43 → 28. Committed 9e35ade. Stopping rule: every budget met but the full profile at 10 connections, and the remaining options there trade memory or bytes; three tries there brought no acceptable gain.
- 13:10 `pnpm perf --label after`, screens `after`, guard baseline → after: every screen matches. Budgets 22/23 → 22/23. REPORT.md, CHANGELOG (Unreleased), CLAUDE.md status written.

- Follow-up (owner asked for the "Left for later" items that are right to do now): playstyle per-matches cache (new snapshot 45 → 7.5 ms, f92395a) and main-process GC in the perf probe (fa3c12e). `pnpm perf --label final`, guard baseline → final: every screen matches. Budgets 23/24. Not done on purpose: timer isolation (gain too small) and the full-profile gzip cache (server memory).

## Decisions for the owner

- The benchmarks use a **synthetic** server database (`.local/perf-server`, built from packages/sim: one user with 1,000 games, 20,000 collector games, a snapshot built by the real `publishSnapshot`) instead of a copy of `apps/server/data/ldc.sqlite`: repeatable, holds no real player, and the local DB had only 200 games and a 264-game snapshot (not representative). The server runs with no Riot key and no admin token, so it cannot call Riot.
- Dev tools added for measuring: `tsx` and `autocannon` (root devDependencies), `@ldc/sim` and `@ldc/lcu` as root devDependencies (the perf scripts use them), `@ldc/meta` as a devDependency of `@ldc/sim` (the meta bench). No runtime dependency added.
- **Full `/me/profile` at 10 concurrent requests stays over budget** (p99 925 ms; 150 ms alone). Options if you want it under 200 ms: a per-user cache of the gzipped response (memory: ~1.9 MB per active user) or storing match summaries precompressed. I left it: the panel now downloads the full history only on registration, after sign-out, or from an older server.
- **Endpoints that can be removed later: none.** All API changes are additive (`/me/profile?ids=` and `?timelines=1`). Once every installed panel is at this version, nothing old needs to go; the old full-profile path stays the fallback for first starts.
- **Deploy order:** the server and the panel can ship in any order. A new panel against an old server sees no `timelineIds` and falls back to the full download (today's behaviour); an old panel against the new server is unchanged, and gets the `/config` 304 fix at once.
- **Missing timeout (out of scope, noted only):** `ServerClient.send` calls `fetch` with no timeout or AbortSignal (`apps/desktop/src/main/server-client.ts`). A server that accepts the connection but never answers would leave the profile load (and the config/meta refresh) waiting forever, with the panel showing "loading". The wake-up retries only cover errors and 502–504.
- **Disk cache size:** `profile-matches.json` holds your whole history as the server sent it (~14 MB for 1,000 games) in the app's profile folder. It's your own anonymised data, like the dev-mode `matches-v2` cache; deleted on sign-out and on "Delete my data".
- **fallow config** (`.fallowrc.jsonc`) marks tests, benches, scenarios and scripts as entry points; the 23 remaining "unused class members" are false positives (fluent sim builders, the LCU connector used through its interface), and jev's zod stays because jev is frozen.
- Vitest 5 dropped `bench()`, so the micro benches use a 40-line runner (`scripts/perf/microbench.ts`) run with tsx.

## Tried and reverted

- Async gzip of `/me/profile` on the thread pool: −13% p99 at 10 connections, no change for one request. Reverted for simplicity.
- Per-user cache of the gzipped profile (keyed by a SHA-256 of the JSON): p99 at 10 connections 932 → 369 ms, but costs up to 1.9 MB per cached user on a 256 MB server, for a request the panel now rarely makes. Reverted.
- Minified main bundle: within noise for cold start. Reverted.

## Summary page

https://claude.ai/artifact/PngMfMhFWup1ZHstpQ3tmv (PR: https://github.com/Batmuffin12/LoL-Draft-Coach/pull/2)

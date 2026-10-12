# Prompt: optimize the desktop panel and the server (unattended run)

You are working alone for several hours. The owner is away and **will not answer**. Never ask a question and never wait for approval; decide using the rules below and write every decision you would have asked about in `docs/perf/PROGRESS.md` under "Decisions for the owner". Read `CLAUDE.md` and `docs/SPEC.md` first: their hard rules win over anything here.

## Goal

Make LoL Draft Coach faster and smoother, in the Electron panel (main process + React renderer) and in the server (Hono + SQLite), **without changing what the user sees or what the coach suggests**. Prove every gain with numbers: measure a baseline first, then measure again after each change, and finish with a before → after report.

## Setup (do this first)

1. Work in a separate worktree so you don't collide with the milestone-8 work in the main checkout:
   `git -C C:\fullstack\lol-draft-coach worktree add C:\fullstack\ldc-perf -b perf/optimize main`, then work only in `C:\fullstack\ldc-perf`. Copy `.env` from the main checkout (it's gitignored; never commit it). Run `pnpm install`, then `node apps/desktop/node_modules/electron/install.js` if Electron is missing.
2. Check `pnpm typecheck && pnpm test` passes before you change anything.
3. Create `docs/perf/PROGRESS.md`: the plan, a checklist of the phases below, and a log. Update it after every step, so that if your context is compacted you can re-read it and carry on.

## Hard limits for this run

- **No production load.** Never benchmark the Railway server, never run `collect`, never call the Riot API in a benchmark, never change `.railway/**` or run `infra:apply`. Benchmarks use a local server (`pnpm local:server` on :8788 with the local DB) or fixtures.
- **Offline, repeatable desktop runs:** a throwaway profile (`LDC_USER_DATA_DIR` in `.local/perf-profile`), the simulator (`pnpm --filter @ldc/sim mock <scenario>` + `LDC_LCU_OVERRIDE` + `LDC_META_FILE`), and a synthetic history (`LDC_PROFILE_FILE`, built with `packages/sim` — never commit your own games or Riot ID).
- **No behaviour change.** Same suggestions, same wording, same layout. Guard it (see "Regression guard").
- **Don't merge to `main`, don't tag, don't deploy.** Finish with a pushed branch and a PR.
- Commits: one optimization per commit, Conventional Commits, `pnpm typecheck && pnpm test` gating with `&&` (never pipe test output into grep before committing), stage explicit paths, check `git diff --cached`, push after every commit. End commit messages with the attribution lines your session gives you.
- Don't add or upgrade a dependency unless it's a dev tool for measuring (fallow, autocannon, tinybench-style benches via `vitest bench`, `@playwright/test`), or the measured gain is large and it adds no runtime weight; note any you add in PROGRESS.md.

## Budgets: when it's optimized enough

These are the targets (from Google's RAIL model and Chrome's 50 ms long-task limit, applied to this app). Store them in `scripts/perf/budgets.json` so `pnpm perf:compare` marks every metric **within** or **over** budget.

| Area | Budget | Why |
| --- | --- | --- |
| Click → next paint (lobby tab, Locked-in tab, pill, "If not" pick) | p95 ≤ 100 ms (aim 50) | Under 100 ms feels instant |
| ViewState update in champ select (build in main + send + render) | p95 ≤ 50 ms | The panel never lags behind the draft |
| A single long task in the renderer | none over 50 ms | Longer, and a click can feel stuck |
| Animation (timer ring) | 60 fps, frames ≤ 16 ms | Smooth motion |
| Cold start → first full screen | ≤ 2 s (aim 1 s) | Ready before champ select starts |
| Server, cached endpoints (`/health`, `/config`, `/meta` 304) | p99 ≤ 50 ms locally | The network should be the only wait |
| Server, `GET /me/profile` | p99 ≤ 200 ms locally | Database work, still not noticeable |
| Server wake-up (process start → first 200) | ≤ 1 s, not counting Railway's own wake | What you feel when it was asleep |
| Panel memory after 60 s of replay | no growth between repeated replays | A leak slows long sessions |

**Stopping rule.** Work on the metrics that are over budget first, worst first. Once an area is within budget it's optimized enough: after that, keep a change there only if it's small and safe (or a fallow cleanup). Stop optimizing when every budget is met, or when three changes in a row bring no gain beyond the noise. Then go to Phase 4. A budget you can't meet goes in the report with the reason and what it would take.

## Phase 1 — Measurement harness (commit it; it stays in the repo)

Build `scripts/perf/` plus a root `pnpm perf` that runs everything and writes `docs/perf/results/<label>.json`, and `pnpm perf:compare <a> <b>` that prints a markdown before → after table. Every timing metric: at least 10 runs (startup) or 30 samples, report **median and p95**, plus the spread; note machine, Node, Electron versions and that runs were on the same machine. Treat a change under 5% or inside the run-to-run spread as noise.

**Desktop (main + renderer)** — add a dev-only `LDC_PERF=out.json` aid in the style of `LDC_SCREENSHOT` (never active in packaged builds), using `performance.mark/measure` in both processes:
- Cold start: process start → `app.whenReady` → window created → renderer first paint → first `ViewState` received → first full screen rendered; then quit. 10 cold launches.
- State pipeline while replaying a sim champ select at a fixed speed (e.g. `mid-counter`, `locked-solid`, `full-game`): per push, the time to build the `ViewState` in main, its size in bytes, pushes per minute, and how many pushes were identical to the one before.
- Renderer: React `<Profiler>` commit durations per push (count, median, p95, total), long tasks over 50 ms (`PerformanceObserver`), and the time from a click on a lobby tab / Locked-in tab / pill to the next paint.
- Memory and CPU: `app.getAppMetrics()` per process and the renderer heap after 60 s of replay.
- Bundle: the renderer JS/CSS and main-bundle sizes from the build output.
- Optional if it works first time: drive the same flows with Playwright's `_electron.launch()`; otherwise the env-var aid is enough.

**Server** — against the local server only:
- `autocannon` (warm-up, then e.g. `-c 10 -d 20`) on `GET /health`, `GET /config` and `GET /meta/:band` (each with and without `If-None-Match`), and `GET /me/profile` for a local test user (create it with a local invite). Record req/s, latency p50 / p97.5 / p99, non-2xx count (must be 0, or the numbers are measuring failures), and response bytes.
- Cold start: process start → first 200 on `/health` (Railway sleeps, so wake-up time is what users feel). 10 runs.
- Jobs on fixtures or the local DB with no Riot calls: snapshot build / aggregation time, one user sync from recorded data, and the hot queries' `EXPLAIN QUERY PLAN`.
- Engine and meta: `vitest bench` for scoring a draft (`packages/engine`) and aggregating a band (`packages/meta`).

**Code health** — `npx fallow` (all analyses), `npx fallow dupes`, `npx fallow health`, with `--format json` saved in the results. Record the dead-code counts, duplication %, and the health score. If fallow won't run on this Windows checkout, use `npx knip` for dead code and note it.

Before any optimization, also save the **baseline screenshots and view dumps** of every screen listed in "Regression guard" to `docs/perf/results/baseline/` (`LDC_SCREENSHOT` + `LDC_VIEW_DUMP`, same scenarios and synthetic history every time); save the after set to `docs/perf/results/after/` at the end. The final artifact compares the two.

Then run `pnpm perf --label baseline` and write the baseline into `docs/perf/REPORT.md` ("Where we are now").

## Phase 2 — Research and plan

Read the hot paths end to end before changing anything: LCU events → `personal-coach.ts` / `coach.ts` → the view builders (`draft-view`, `loadout-view`, `stats-view`, `style-view`, `month-view`, …) → the IPC push in `apps/desktop/src/main/index.ts` → `App.tsx` and the screens; `server-client.ts` (requests at startup, ETags, retries); the server's routes, jobs and DB access. Use the baseline numbers to rank the candidates: first whatever fixes a metric that's over budget, then by expected gain ÷ risk; and write the ranked list in PROGRESS.md. Things worth checking (verify each against the code and the numbers; don't assume):
- Pushes: identical or bursty `ViewState`s (coalesce WebSocket bursts, skip unchanged pushes), recomputing views or engine scores that didn't change (memoize by draft/phase key), big payloads sent every time.
- Renderer: whole-tree re-renders on every push (`React.memo`, stable props, splitting state), formatters or arrays built per render, `useFits` / layout measuring loops, image decoding and caching for Data Dragon icons, costly CSS (shadows, filters, blur) on large areas.
- Main process: synchronous file or JSON work on the hot path, config parsed more than once, timers that run when nothing changed, startup work that could wait until after the first paint.
- Desktop ↔ server round trips: count the requests the panel makes at startup, after a game and per champ select. Chatty patterns are fair game: several calls where one would do, one call per id where a batch would do, the same data fetched twice, fields sent that the panel never reads, a request that blocks the first paint and could run after it.
- Server: response compression, ETag/304 coverage, prepared statements and indexes, SQLite pragmas (WAL, `synchronous`), work done per request that could be cached per snapshot, cold-start imports.
- Fallow findings: dead files, unused exports and types, duplicated blocks. Review each one yourself; never apply `fallow fix` blindly. Keep things used by tests, dev aids, scripts or fixtures, and anything the spec plans to use.

## Phase 3 — Optimize, one change at a time

For each item on the ranked list: make the change → `pnpm typecheck && pnpm test` → run the relevant part of `pnpm perf` → keep it only if it's a real gain beyond the noise (or a pure cleanup from fallow with no cost) → commit with the measured effect in the message body (e.g. "lobby tab switch p95 38 → 21 ms") → log it in PROGRESS.md. If it doesn't help, revert it and log why. Add a test for any new logic (caching, coalescing, skipping pushes), including its invalidation.

## Changing the server API (allowed)

You may change the endpoints when the numbers show it helps: batch endpoints in place of one call per id, one combined startup call in place of several, slimmer responses, pagination, better caching headers. Rules:
- **Additive and backward compatible.** Add the new endpoint (or an optional parameter) next to the old one, move the panel to it, and keep the old one working. Production panels that are already installed only change when the owner deploys the server and ships a new build, which can happen at different times. List every endpoint that can be removed later in "Decisions for the owner"; don't remove it yourself.
- Validate the new request and response with Zod on both sides. Keep auth, ownership and rate limits exactly as strict as before: a batch must never return another user's data, and it needs a size limit.
- Add server tests for the new endpoint (happy path, auth, oversize batch) and desktop tests for the client.
- Measure it: round trips and total time for the flow before → after (e.g. "startup: 5 requests, 820 ms → 2 requests, 310 ms" on the local server), and add it to the report.
- The Riot API side stays within the rules in CLAUDE.md: no new Riot calls in benchmarks, and the rate limits come from config. Batching or caching Riot calls inside the server is fine if the tests cover it.

## Regression guard (run before each commit that touches the desktop, and at the end)

- `LDC_VIEW_DUMP` on the same sim scenarios and synthetic history must be identical to the baseline dumps, apart from timestamps.
- `LDC_SCREENSHOT` of every screen (Connect, Ban, Pick, Locked in Runes/Build/Matchups & plan, Last game, Style, Pool, New, This month, Next game) must show overflow 0, and look the same as the baseline (compare the images).
- The LCU writer still runs only on a click; the renderer stays UI only; no hardcoded game data; nothing from `config/` moves into code.

## Phase 4 — Finish

1. `pnpm perf --label after` and `pnpm perf:compare baseline after`.
2. Write `docs/perf/REPORT.md`: **Where we were** (baseline), **Where we are now** (after), the before → after table for every metric with the % change, the changes that made each gain, what you tried and reverted, fallow's before → after, and what's left (ideas you didn't do, and why). Keep `docs/perf/README.md` short: how to run `pnpm perf` and compare.
3. Add a CHANGELOG entry under a new "Unreleased" heading and update the status row in `CLAUDE.md`. Don't bump versions (the owner tags on merge).
4. Push, then open a PR to `main` with `gh pr create` whose description holds the summary table. Don't merge it.
5. **Publish a summary artifact for the owner** (a private page, made with the Artifact tool after loading its design skill; screenshots go in as supporting files or `data:` images, under the size limit). Put its link in the PR, at the end of PROGRESS.md and in your last message. It holds, top to bottom:
   - **Verdict**: one short paragraph. Did anything break (yes/no), how many budgets are met before → after, and the 3–5 biggest gains with numbers.
   - **Nothing broke**: for every screen (Connect, Ban, Pick, Locked in Runes / Build / Matchups & plan, Last game, Style, Pool, New, This month, Next game), the baseline screenshot and the after screenshot side by side at 440 × 720, each with its overflow (must be 0) and whether its view dump matches the baseline. Show any difference highlighted, and say why it's expected. Also: typecheck and test results (counts), and the checks for the click-only LCU writer and the UI-only renderer.
   - **Optimization summary**: the before → after table for every metric (median, p95, % change, green for better, amber for worse, and its budget with **within** / **over** before and after), a small chart for the main ones (cold start, ViewState build time and size, render commit p95, tab switch, server p99 per endpoint, startup round trips), fallow's before → after, and the list of changes with the gain each one made.
   - **Tried and reverted**, **Decisions for the owner** (including endpoints that can be removed later) and **Left for later**.
   - The PR link and how to re-run the numbers (`pnpm perf`, `pnpm perf:compare baseline after`).
   The screenshots come from the synthetic history and the simulator, so they hold no real player data; check that before publishing.
6. Remove the worktree only if everything is pushed: leave it in place otherwise.

Out of scope for this run (the owner will do it next): the server error handling, timeouts and the UI states for each error. If you find a case where a missing timeout makes the panel hang, write it down in "Decisions for the owner" instead of building it.

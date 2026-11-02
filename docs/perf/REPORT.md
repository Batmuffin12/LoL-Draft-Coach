# Performance report: panel and server

Measured with `pnpm perf` (see [README.md](README.md)) on one machine (AMD Ryzen 7 7800X3D, 16 threads, Node 24.14, Electron 44.5.1), offline: the panel on the simulator and a synthetic 1,000-game history, the server on a synthetic database on localhost. Medians unless marked; p95 for the panel, p99 for server latency. Changes under 5% or inside the baseline runs' spread count as noise.

Budgets met: **22/23 → 22/23**. The one over, before and after: the full `/me/profile` download with 10 connections at once (2,327 → 925 ms p99, budget 200). Nothing the user sees changed: every screen's view dump and pixels match the baseline (`pnpm perf:guard baseline after`).

## Where we were (baseline, `main` 330bd0c, v0.7.8)

| Area | Metric | Baseline | Budget |
| --- | --- | --- | --- |
| Cold start | process start → first full screen | 724 ms (p95 742) | ≤ 2 s ✔ |
| | … of which the main process loads the profile | 372 ms | |
| | ViewState pushes until then | 57 | |
| Champ select | event → painted (mid-counter replay) | 10.8 ms (p95 19.0) | p95 ≤ 50 ✔ |
| | building the view in main per draft event | 1.3 ms (p95 1.9) | |
| | ViewState size per push | 43 kB | |
| | pushes per draft event | 2; 34% of pushes repeat the one before | |
| | React commit per render | 0.2 ms (p95 0.3) | |
| Renderer | long tasks over 50 ms | none | none ✔ |
| | frames (timer ring) | 16.7 ms (p95 16.8) | 60 fps ✔ |
| | heap growth between replays | 0.08–0.23 MB | none ✔ |
| Clicks → next paint | lobby tab / locked-in tab / pill / "If not" | p95 15.9 / 16.7 / 16.4 / 16.6 ms | p95 ≤ 100 ✔ |
| Main process (bench) | load a 1,000-game history / a new meta snapshot | 423 / 298 ms | |
| Server | wake-up (process start → first 200) | 134 ms | ≤ 1 s ✔ |
| | `/health`, `/config`, `/meta` p99 (10 connections) | 5–8 ms | ≤ 50 ✔ |
| | `/config` with its ETag | **200, never 304** (12.6 kB each time) | |
| | `/me/profile` full (1,000 games) | p99 **2,327 ms** (10 conn.), 207 ms alone; 1.86 MB gzip / 14 MB JSON | p99 ≤ 200 ✘ |
| | `/me/profile?since` | p99 46 ms | ≤ 200 ✔ |
| Startup round trips | panel start → profile, meta, config in | 3 requests, 274 ms; the next start the same, 14 MB again | |
| Code health (fallow) | issues / unused exports / duplication / health | 43 / 14 / 2.3% / 78.4 | |

## Where we are now (after, branch `perf/optimize`)

| Metric | Before | After | Change | Budget before → after |
| --- | --- | --- | --- | --- |
| Cold start → first full screen | 724 ms | 422 ms | −42% | within → within |
| Main process busy during cold start | 380 ms | 105 ms | −72% | |
| … loading the 1,000-game profile | 372 ms | 87 ms | −77% | |
| Pushes until the full screen | 57 | 9 | −84% | |
| Bench: load a 1,000-game history | 423 ms | 69 ms | −84% | |
| Bench: a new meta snapshot | 298 ms | 45 ms | −85% | |
| Bench: one champ select update (locked in) | 1.8 ms | 1.1 ms | −37% | |
| Draft event → painted, p95 (mid-counter) | 19.0 ms | 19.9 ms | noise | within → within |
| Pushes per minute in champ select | 199 | 85 | −57% | |
| Pushes repeating the one before | 34% | 3% | −92% | |
| React commits per minute in champ select | 530 | 416 | −21% | |
| Longest renderer task | 0 ms | 0 ms | – | within → within |
| Frame p95 (timer ring) | 16.8 ms | 16.8 ms | – | within → within |
| Heap growth between replays | 0.23 MB | 0.24 MB | noise | within → within |
| Clicks → next paint, p95 (lobby tab / locked tab / pill / If not) | 15.9 / 16.7 / 16.4 / 16.6 ms | 16.7 / 17.3 / 16.6 / 14.6 ms | noise | within → within |
| Server wake-up | 134 ms | 133 ms | noise | within → within |
| `/config` with its ETag | 200, 12.6 kB, p99 5 ms | 304, 0 B, p99 0 ms | −100% bytes | within → within |
| `/me/profile` full, 10 connections, p99 | 2,327 ms | 925 ms | −60% | **over → over** |
| `/me/profile` full, alone, p50 | 207 ms | 150 ms | −28% | |
| `/me/profile?since`, p99 | 46 ms | 31 ms | −33% | within → within |
| Panel's next start (config + profile + meta) | 274 ms, 14.06 MB | 83 ms, 37 kB | −70%, −99.7% | |
| Panel's first start | 278 ms to the profile | 231 ms | −17% | |
| fallow issues / unused exports | 43 / 14 | 28 / 0 | −35% | |
| Renderer JS / main bundle | 280 kB / 1.84 MB | 280 kB / 1.85 MB | – | |

Full table: `pnpm perf:compare baseline after` ([results/baseline.json](results/baseline.json), [results/after.json](results/after.json)); screens: [results/baseline/](results/baseline/), [results/after/](results/after/) with `guard.json`.

## The changes that made the gains

1. **`fix(server)`: `/config` answers 304 to gzip clients.** The compress middleware makes a gzipped body's ETag weak (`W/"…"`); the panel sent that back and the route compared strongly, so every start and every champ select downloaded the whole config. If-None-Match is compared weakly now (RFC 9110). 12.6 kB → 0 per check.
2. **`perf(server)`: `/me/profile` sends the stored match JSON as is** instead of parsing 1,000 summaries and stringifying them again. Alone 207 → 150 ms; at 10 connections p99 2,327 → ~925 ms; `?since` 46 → 31 ms.
3. **`feat(server)` + `perf(desktop)`: the panel keeps your matches on disk** (`profile-matches.json`) and a start asks `?since=…&timelines=1`; games it lacks or the server has updated since come by name (`ids=`, new and additive). Next start 274 ms / 14 MB → 83 ms / 37 kB.
4. **`perf(engine)`: binary search in `empiricalPercentile`.** A CPU profile showed the linear scan was ~90% of the main process's work when the profile or meta changes. Load a history 423 → 69 ms, new snapshot 298 → 45 ms; cold start 724 → ~420 ms.
5. **`perf(desktop)`: one ViewState push per event-loop turn, never the same twice** (`StatePusher`). Pushes to the first screen 57 → 9, per minute −57%, repeats 34% → 3%.
6. **`refactor`: dead code fallow found.** 14 exports used only in their own file, the unused `HowYouPlay` component, `shared`'s unused zod dependency. fallow issues 43 → 28.

## Tried and reverted

- **Gzip `/me/profile` explicitly on libuv's thread pool**: −13% p99 at 10 connections, no change for one request. Not worth the extra code.
- **Cache the gzipped profile per user** (keyed by a SHA-256 of the JSON): p99 at 10 connections 932 → 369 ms, still over budget, and up to 1.9 MB per cached user on a server with a 256 MB heap, for a request the panel now rarely makes.
- **Minify the main bundle** (1.85 → 0.95 MB): main script start 100 → 97 ms, the first full screen unchanged. Noise, and worse stack traces.

## Follow-up (same day, after the first report)

Two items from "What's left" done, measured as `final` (`pnpm perf:compare after final`):

| Metric | after | final | Change |
| --- | --- | --- | --- |
| Bench: a new meta snapshot | 44.6 ms | 7.5 ms | −83% |
| Bench: load a 1,000-game history | 69.0 ms | 62.0 ms | −10% |
| Main heap after 60 s (full-game / lobby replay) | 65.4 / 72.9 MB (not after GC) | 24.1 / 22.9 MB (after a full GC) | measurement fixed |
| Main heap growth between replays (new budget ≤ 1 MB) | – | 0.01 MB | within |
| Cold start → first full screen | 422 ms | 422 ms | – |

7. **`perf(engine)`: playstyle reuses each role's games and metric values per matches array** (a WeakMap: the profile's array is replaced, never changed). The style, its numbers, the focus and the month read the same metrics from the same games; a new snapshot no longer recomputes them.
8. **`chore(perf)`: main-process heap samples after a real full GC** (`--expose-gc` via `v8.setFlagsFromString`, dev builds under `LDC_PERF` only), plus a `mainHeapGrowth` budget.

Budgets met with the new one: 23/24. Draft-update medians in this run read ~18 ms (10–12 before) while p95 stayed 20–22 ms and click medians fell: both are aligned to the 60 Hz frame and flip between runs; neither change touches the draft path. Not done, on purpose: the timer isolation (0.2 ms a commit) and the full-profile cache (memory on the server).

## Code health: fallow 80.6 → 90.5 (owner's request)

Measured with `npx fallow health` (fallow 3.33.1, formula v3: 100 minus capped penalties). No code was excluded from the analysis to get there; `.railway/railway.ts` was added to it.

| Penalty | Before | After | What changed |
| --- | --- | --- | --- |
| Unused / misplaced dependencies | 5.9 | 0 | The perf harness became its own private package (`@ldc/perf`, scripts/perf) declaring what it imports; `selfsigned` dropped from apps/desktop (only packages/lcu uses it); jev's unused `zod` dropped (manifest only); fallow now reads `.railway/railway.ts`, which uses the `railway` SDK. |
| Hotspot (`personal-coach.ts`: most changed and complex) | 3.3 | 0 | Its view builders moved, verbatim, into pure modules (role-view, pick-card, draft-facts, last-game-view, game-wait, client-state, plus style/focus/loadout-import): 1,015 → 639 lines, complexity density 0.42 → 0.33, hotspot score 61.8 → 48.5 (fallow counts 50 and up). |
| Functions over 60 lines (per 1,000) | 7.9 (15.8) | 7.2 (14.4) | `onDraft`, `updateRoleAdvice`, `createApp`, the panel's `main`, sim `history`, the mock client's `start` split into named parts. |
| Critical complexity / coupling | 0.4 / 1.9 | 0.4 / 1.9 | Not touched: `buildLoadout`, `scoreCandidate` and `learningPlan` are core engine logic; coupling is a few widely imported modules (`shared/view.ts`, `ChampIcon`). |
| **Score** | **80.6 (B)** | **90.5 (A)** | |

Same behaviour throughout: 552 tests (5 new for the extracted helpers), the regression guard on every screen after each step, a live replay with clicks, and the coach bench unchanged (history 63 ms, snapshot 8 ms).

## Re-check after the code-health changes (`final` → `post-fallow`)

A full `pnpm perf --label post-fallow` on the branch head (112bd08), compared with `final` (`pnpm perf:compare final post-fallow`): budgets 23/24 → 23/24, the regression guard matches every screen, and every metric is within noise:

| Metric | final | post-fallow |
| --- | --- | --- |
| Cold start → first full screen | 422 ms | 426 ms |
| Bench: load a history / new snapshot / champ select update | 62.0 / 7.5 / 0.95 ms | 63.3 / 7.5 / 0.92 ms |
| Draft event → painted, p95 (mid-counter) | 22.1 ms | 22.1 ms |
| Pushes per minute / repeats (mid-counter) | 85 / 3% | 85 / 3% |
| Clicks → next paint, p95 | 16.9–18.2 ms | 16.9–17.6 ms |
| Longest renderer task / frame p95 / heap growth | 0 ms / 16.8 ms / 0.23 MB | 0 ms / 16.8 ms / 0.24 MB |
| Server: wake-up / `/me/profile` alone p50 / `?since` p99 | 135 / 149 / 30 ms | 131 / 149 / 30 ms |
| Panel's next start | 77 ms, 37 kB | 81 ms, 37 kB |

One number looked worse: the main process's profile load during cold start, 81.7 → 87–90 ms over three runs. Bisected: the commit just before the refactor, measured the same day, gives 83–86 ms, so the refactor's share is ~3 ms (~4%, under the 5% noise line and inside the runs' spread); the rest is the machine since `final`. A first-call profile load in plain Node is the same before and after (median 96 vs 95 ms over 8 fresh processes), and the first full screen doesn't move.

## M8 power spikes (`post-fallow` → `m8`, branch `milestone-8-spikes`, 2026-10-12)

`pnpm perf --label m8`, `pnpm perf:compare post-fallow m8`: budgets 23/24 → 23/24 (the same one over). Cold start to the first full screen 426 → 429 ms (noise); champ select updates, clicks, frames and the server within noise. One real change: a new meta snapshot in the main process costs 7.5 → 8.7 ms (+1.2 ms), the spike index built per snapshot. fallow health 91 (A); `personal-coach.ts` stays at 48.5.

Regression guard (`pnpm perf:screens m8`, `pnpm perf:guard baseline m8`): overflow 0 on all 12 screens, pixels identical except 15 px of icon noise on Matchups. View dumps differ only where M8 adds data: `copy.build.spikeNote` / `spikeTip` (the Build tab's spike wording, in every dump's copy) and an empty `loadout.spikeSlots` on the pick and locked-in screens (the scenarios' snapshots carry no passing spike check, so no step is marked). Your item timing doesn't appear in the guard: the synthetic history has no timelines on the learned champion.

Server: measuring spikes on the production copy (62,617 timeline games) takes 100 s per hourly run on this PC, against 37 s for band 2's whole snapshot; peak memory 483 MB, streamed. Since the check fails, `meta.v1.json` `spikes.publish` is off: the hourly run skips it and the panel hides spikes as built.

## v1.0.5: starting without waiting on Data Dragon (`2a21d97`, 2026-11-02)

The start waited for `versions.json` before connecting to the client, with no timeout: a slow answer held up everything and a hung one left the panel stuck (reproduced against a local stub). Now the last patch loads from disk, the coach starts once the page first asks for state (a busy main process holds up the page's paint), and new patches arrive in the background.

`scripts/perf/interleave.mjs`, 48face4 (v1.0.4's start plus the stub) against 2a21d97: N 1,000 per version in 10 interleaved batches, on a quiet machine (CPU 2–4% before and after), with the stub's delay tail on `versions.json`. No lost launches. Results: `v1.0.4-stub-loading.json`, `v1.0.5-loading.json`. In brackets, each number's 95% interval. The tail is modelled on the CDN delays seen in the v1.0.3 and v1.0.4 runs, not new CDN measurements.

| ms | Before p50 | p95 | p99 | max | After p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Client connected | 368 [367–369] | 393 [392–395] | 701 [692–1794] | 10,897 | 356 [355–357] | 368 [367–369] | 380 [373–394] | 405 |
| First paint | 351 [351–352] | 368 [366–371] | 384 [376–393] | 439 | 378 [377–379] | 401 [399–406] | 415 [412–424] | 434 |
| First screen | 321 [321–321] | 336 [335–339] | 351 [347–363] | 460 | 338 [338–338] | 347 [346–348] | 356 [351–366] | 373 |
| Full screen | 518 [517–519] | 548 [544–552] | 845 [837–1936] | 11,056 | 507 [506–508] | 524 [523–526] | 537 [532–563] | 679 |

The tail is gone. First paint and first screen are later at the median (+27 and +17 ms; this comparison also includes the other v1.0.5 work), within their budgets. Launch to quit: at most 925 ms after, 11,277 ms before.

Under load (14 of 16 threads kept busy, CPU 97–99%, N 200 per version): no lost launches, no launch over 1.6 s, full screen p99 957 → 801 ms. An earlier run of the fix with other agents on the machine lost at least one launch in one batch (exit null, which fits the harness's 180 s kill) and had one slow batch, both on the final build; neither came back and the cause wasn't found. Lost launches now count as `desktop.coldStart.lost` and don't end the run.

`pnpm perf --label v1.0.5 --cold-starts 200 --flows 200`, `pnpm perf:compare v1.0.4 v1.0.5`: budgets 39/40 → 39/40, the same one over (the full `/me/profile` at 10 connections, 722 → 724 ms p99). Its cold starts used the stub; v1.0.4's used the real CDN. Overflow 0 on all 17 screens (`v1.0.5/overflow.json`); there is no v1.0.4 screen set to compare with.

- **State push size**, no budget: +3.7–3.8 kB in every scenario (mid-counter 52.7 → 56.4 kB, lobby 14.4 → 18.2 kB). Sending takes the same time, and the update budgets hold.
- **Explore's calls**, no budget (`apps/desktop/bench`, in the main process, without IPC): Browse list 0.17 ms the first time, one champion 0.24 ms, My games 0.21 ms for 1,000 games, a 156 kB answer. The bench's snapshot is a small simulator scenario (list 4.6 kB, champion 32 kB), so a full band's list and champion will cost more; not measured here.
- **One number didn't repeat:** the run recorded IPC latency of 15 ms (full-game) and 10.8 ms (lobby), and full-game update p95 33 ms. Re-running the clicks step gave 0.8 and 0.5 ms and 19.6 ms, and three alternating full-game replays of both builds gave 1–2 ms and about 20 ms on each, so it isn't the code. `v1.0.5.json` keeps the first run's numbers.

## What's left

- **The full profile at 10 connections stays over budget** (925 ms p99). Gzip of 14 MB costs ~105 ms per request and the JSON ~15 ms; to get under 200 ms with 10 at once it would take a cache of compressed responses (memory on a small server) or precompressed match summaries. With the panel's disk cache a full download happens only on registration, after sign-out, or against an older server, one request at a time (150 ms alone, within budget), so I left it.
- **Champ select timer**: the whole screen re-renders 4×/s for the countdown; a commit costs 0.2 ms, so isolating the timer isn't worth it now.
- The lobby replay's "commits per minute" rose because coalescing shortened the span its denominator uses (a 10 s run of clicks); its pushes per minute fell 57% like the others.

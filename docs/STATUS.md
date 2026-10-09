# Status (one place to look)

Updated 2026-10-09 (v0.7.4). Started 2026-10-08 when three Claude sessions were consolidated into one. The roadmap and task list are in the tracker: https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD (M9 friends release v1.0.0, M10 in game, M11 personal engine, M12 meta signal quality).

## Live

- **v0.7.4** on `main` and in production (2026-10-09): 1,000-game history loaded in the background, four timeline goals, how a champion wins, comfort fixes, the audit fixes and the collector boost (CHANGELOG.md). v0.7.3 before it.

## Committed, not released

### `milestone-8-spikes` (worktree `C:\fullstack\lol-draft-coach-m8`): power spikes

- **Built:**
  - SpikeAggregator;
  - `pnpm --filter @ldc/server spikes` (split-half check, older vs newer, `--windows` sweep);
  - spikes and spikeCheck in every snapshot;
  - display gated on the check (game plan, New tab, Build);
  - your first-item timing vs typical;
  - item-specific spikes.
- **Result on 10,336 production games:**
  - the first version's "item spikes" were really the champion's game phase (placebo r 0.74–0.92);
  - item-specific spikes are noise today (r 0.07–0.16), so nothing is shown.
- **Not merged:** it branched before v0.7.3 and before the new timeline fields. Expect conflicts in `packages/riot-api/src/timeline.ts`, `schemas.ts`, shared `MatchTimeline` and `timeline.test.ts`; keep both sets of fields.

## Waiting on the owner

1. **Power spikes:** wait for about 6–10× more games (re-check around Oct 12/15, tracker spk-3, log 058), or show the stable game-phase window now ("strongest from about minute X": r 0.61, 90% same direction at 8 min).
2. **`pnpm infra:apply`** (between collector runs): `pnpm infra:apply` for "deploy only after CI passes" (`.railway/railway.ts`).

## Next, in order

1. Watch the first hourly run after v0.7.4 (memory, boosted run, backfill); then check Railway usage after a day.
2. ops-5: merge `main` into `milestone-8-spikes`, resolving the timeline conflicts.
3. spk-7: add "spike info is passive, never pushed" to SPEC compliance, before v0.8.0.
4. ops-7: fix the rest of the SPEC drift (data model, pruning, drop `POST /recommend`).
5. M9, starting with ops-2 (GitHub Releases on the public repo) and m9-2 (product numbers).

## Later

- Re-run `pnpm --filter @ldc/server spikes` on a fresh production copy around Oct 12 (copy steps: docs/CLOUD.md).
- Try "fights won" as the spike measure once kill data builds up.
- Re-run the backtest after a few days of production collection.

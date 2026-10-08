# Status (one place to look)

Updated 2026-10-08, 23:10, when three Claude sessions were consolidated into one. The roadmap and task list are in the tracker: https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD (M9 friends release v1.0.0, M10 in game, M11 personal engine, M12 meta signal quality).

## Live

- **v0.7.3** on `main` and in production (`/health` says 0.7.3). It includes role goals from your first games in a role (b041ae3, cherry-picked as dc9d161) and the server reporting its real version.

## Committed, not released

### `milestone-7-grow`: 12 commits after v0.7.3 (candidate v0.7.4)

- **Audit fixes, from running the coach on the owner's games and 13,414 production games:**
  - rune/item lifts need a real difference (z ≥ 2), and swaps come only from the page's two trees;
  - power curve said only beyond chance;
  - the goal's "typical" from your rank (as on Style), and its why line says where it was measured;
  - "ahead of its jungle opponent";
  - no pool hole for needs the role rarely fills;
  - Playmaking (CC) axis dropped;
  - "typical in your rank" instead of "rank average".
- **New role goals:**
  - gold lead on your lane opponent at 14 (top, mid);
  - CS lead at 10 (bot);
  - wards placed before 14 (support);
  - early dragons, grubs and herald (jungle).
  - Timelines now keep CS per minute, vision wards and epic monsters (riot-api).
- **Dev aid:** `LDC_VIEW_DUMP`.
- **Already shipped from this period:** matchup/duo prior 400 (48f8339) and the per-role goal lists with tips (a424e0d) went out in v0.7.3.

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

1. **Try the panel and ship v0.7.4:** merge `milestone-7-grow` into `main`, tag, deploy. The rune-lift fix and the new goals need the server to run the new code.
2. **Power spikes:** wait for about 6–10× more games (re-check around Oct 12/15, tracker spk-3, log 058), or show the stable game-phase window now ("strongest from about minute X": r 0.61, 90% same direction at 8 min).
3. **Old branches:** `docs/roadmap-m9-m12` and `fix/v0.7.3` are merged. Delete them (local and origin) only with your OK.
4. **At a merge:** `pnpm infra:apply` for "deploy only after CI passes" (`.railway/railway.ts`).

## Next, in order

1. v0.7.4 from `milestone-7-grow` (after the owner tries it).
2. ops-5: merge `main` into `milestone-8-spikes`, resolving the timeline conflicts.
3. spk-7: add "spike info is passive, never pushed" to SPEC compliance, before v0.8.0.
4. ops-7: fix the rest of the SPEC drift (data model, pruning, drop `POST /recommend`).
5. M9, starting with ops-2 (GitHub Releases on the public repo) and m9-2 (product numbers).

## Later

- Re-run `pnpm --filter @ldc/server spikes` on a fresh production copy around Oct 12 (copy steps: docs/CLOUD.md).
- Try "fights won" as the spike measure once kill data builds up.
- Re-run the backtest after a few days of production collection.

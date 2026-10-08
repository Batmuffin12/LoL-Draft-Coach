# Engine upgrade plan (written 2026-10-08)

What to upgrade in the engine after v0.7.0, in order, and how to add **power spikes** (for example "Master Yi's first item is a big spike"). Builds on [research/REVIEW-2026-10.md](../research/REVIEW-2026-10.md) (§5, §7) and [research/LEARNING.md](../research/LEARNING.md). Effort: S ≈ hours, M ≈ 1–2 days, L ≈ a week.

## Where the engine stands

- **Draft scoring (v2):** after the production backtest (13,414 band-2 games, pair prior 60 → 400), draft-level predictions are a small real gain over side-only, and shown chances are within ~3 points of actual. Meta is the only term that clearly helps; lane, counter and synergy are still mostly prior at this volume.
- **Personal term:** the biggest real effect (the owner's own curve: 41–45% on champions with under 20 games, ~57% from 20 on) is still set by hand.
- **Items:** our #1 ≈ "most bought" (46.9% vs 49.2% top-1), with a small positive win-added signal. D36 todo still open.
- **Data is the limit for everything statistical.** Timelines are on half of band 2 and all of band 3.

## Can we get power spikes? Yes: infer them from our own timelines

Riot gives no spike data: Data Dragon has item stats, not "when a champion is strong". Guide sites can't be scraped (spec, terms), and hand-typed lists would break "never hardcode game data". But **the collector already stores, per collected game with a timeline, each player's gold every minute and every item purchase with its second** (`MatchTimeline`). That is enough to *measure* a spike.

### Method

For every player-game with a timeline, take the minute `t` their k-th completed item finished (completed = `completedItems()` rules already in config). Compare their **gold lead over the lane opponent** in the minutes after `t` with the minutes before. Then take that champion's average, minus the role's average, so the general "items make everyone stronger" effect cancels out. A champion whose lead grows much faster than its role's right after item k has a spike at item k. Also record the typical minute item k is done in your rank.

### Feasibility check (done today, read-only, 975 games with timelines from the local sample)

| Champion (role) | Games | First item done | Lead swing vs role (3 min after − before) |
| --- | --- | --- | --- |
| Kha'Zix (jungle) | 73 | 9.9 min | +199 gold (z 2.4) |
| Miss Fortune (bot) | 74 | 11.4 min | +225 (z 2.2) |
| Yone (top / mid) | 75 / 69 | 13.7 / 13.2 min | +183 / +181 |
| Zed (mid) | 66 | 10.9 min | +196 |
| **Master Yi (jungle)** | **86** | **11.0 min** | **+93 (z ≈ 1.2, not yet significant)** |
| Galio, Cho'Gath, Sejuani, Yorick, Veigar | 25–60 | — | −190 to −430 (no first-item spike) |

The pattern makes sense: snowballing champions (assassins, skirmishers, lane bullies) spike on their first item, while tanks and scalers don't. But at 20–90 games per champion this is borderline (with ~150 champion-roles, a few z ≈ 2.4 can be chance). **Rough data needed:** ~300–400 timeline games per champion-role for a +100 gold swing to be clear. That's about 4–5× today's sample per band, or ~1.5× if spikes are pooled across bands. A spike belongs to the champion more than to a rank, so pooling is sensible.

**Split-half check (M8, same 975 games, `pnpm --filter @ldc/server spikes`):** measured on two halves of the games, the first-three-item swings of 87 champion-role events correlate at only **0.09**, and 8 of 114 events reach z ≥ 2, about what chance gives. So the table above is mostly noise at this size; the pattern only *looked* right. Nothing is shown in the app until the check passes on production data (target: correlation ≥ 0.5 and ≥ 80% same direction at z ≥ 2). Production collects ~7k games a day with timelines (kills and levels too) from the v0.7.0 deploy on.

### Better signals with small data additions

| Add to `summarizeTimeline` | Unlocks | Cost |
| --- | --- | --- |
| Champion kills `[sec, killer, victim, assist bitmask]` (participant indexes only, no IDs) | **Fights won** (takedowns − deaths per minute) after vs before item k: more direct than gold; also "when you die" (review §5.6) | S, a few hundred bytes per game |
| Level per minute (from `participantFrames.level`) | **Level spikes** by the same method (e.g. level 6 for ultimate-dependent champions), measured over every level rather than a hard-coded list | S |
| Time-matched comparison: at minute m, players on this champion with item k done vs not yet | Removes the "later = more fighting" trend and the "ahead players finish items sooner" bias better than before/after | M (aggregation only) |

Per *specific* item (Kraken vs BotRK on Yi) only once a champion-item pair has enough games; until then, report per slot (1st / 2nd / 3rd completed item).

### Where it shows

- **New tab learning plan:** "Strongest once its first item is done (Kraken Slayer, ~11:00 in your rank): fight then; before it, farm" next to the measured power curve.
- **Game plan tab after lock-in:** your spike and the enemy laner's spike, as a timeline: "you spike at item 1 (~11:00), Darius at level 6 and item 1".
- **Build tab:** a mark on the spike item.
- **Personal:** your own first-item time on the champion (user sync already fetches timelines for your 30 newest games) vs your rank's typical time: "you finish it at 13:40, players in your rank at 11:00". This is a measurable goal, so it can feed the growth / "This game" focus.
- **In game (M9): passive only.** The panel may show "your spike: item 1 ✓" when the player looks at it, but **no pushed power-spike notifications and no commands** ("X hit level 6" alerts are prohibited by the Overwolf/Riot compliance rules quoted in the review §6.8). Add this to SPEC before M9.

Compliance otherwise holds: champion-level aggregates from anonymous collected rows, no player identifiers, nothing hand-typed.

## The plan, in order

| # | Step | Why | Effort | Done when |
| --- | --- | --- | --- | --- |
| 1 | **Ship v0.7.0** (owner tries M7, merge, tag) | Don't mix engine work into an unreleased milestone | — | Tagged |
| 2 | **Timeline data (done 2026-10-08, ships with v0.7.0):** kill events + level per minute in `MatchTimeline` (shared type, `summarizeTimeline`, Zod, sim); `meta.v1.json` timeline share back toward 1 in band 2 once the collector's budget allows (review §3) | Every spike and "when you die" feature needs it | S–M | New rows carry kills and levels; `/health` timeline count/run |
| 3 | **`SpikeAggregator` in `packages/meta`** (pure): per champion-role, pooled across bands: item-slot spikes (gold swing and fights won, time-matched), level spikes, typical completion minute, n and a shrunk estimate (empirical-Bayes toward the role average). Snapshot field `spikes`; server schema; desktop check | The measurement | M | Unit tests on sim timelines with a planted spike |
| 4 | **Validate spikes before showing them:** split-half check (estimates from odd days predict even days), list the top/bottom 20 for the owner to sanity-check, show only above a z threshold and n minimum (config) | Avoid showing noise as fact | S | Split-half correlation reported in research |
| 5 | **Show spikes:** engine `powerSpikes()` + explain wording; New tab line, game plan tab, Build tab mark | The feature | M | Screenshots via sim scenarios at 440 × 720 |
| 6 | **Personal item timing:** your k-th item minute per champion vs band; candidate metric for growth / "This game" focus | Concrete, measurable lane/farm feedback | S–M | Shows on your own Lillia/Yi games |
| 7 | **Fit the experience curve** (review §7 #7): from users' time-ordered games, fit the personal term's scale and the learning penalty; re-base comfort on the champion's band win rate (no double counting) | The biggest real effect in the engine, still hand-set | M | Personal-term interval excludes 0 in the backtest |
| 8 | **Separate `pWin` from ranking `utility`** and uncertainty-based labels (review §7 #9) | The shown % stays a probability | M | ECE < 0.01 on held-out games |
| 9 | **Lane signal from gold@15 + class-level prior** (review §7 #13) | Win/loss matchups stay noise even at the cap; gold@15 is far less noisy | M | Lane term ablation improves the backtest |
| 10 | **Item engine (D36):** per champion-role expected win given game state (minute, lane gold diff) for win-added; tune items 4–5 by situation | Items still ≈ most bought | M–L | Item backtest top-1 beats most bought |
| 11 | **Learning plan from data:** `settleGames` per champion from the measured experience curve instead of three difficulty buckets | Ties the New tab to measured learning curves | M | Owner's curve and pooled users' curves |

Steps 2–6 are the power-spike feature (one milestone-sized chunk, roughly a week). Steps 7–10 are the scoring upgrade and each waits on its backtest. Re-run `pnpm --filter @ldc/server backtest` on a fresh production copy (docs/CLOUD.md) before and after each scoring change.

## Owner decisions (2026-10-08)

1. **Power spikes are their own milestone: M8 (v0.8.0)**, after v0.7.0; in game and polish moves to M9 (SPEC roadmap updated).
2. **Spikes pool all rank bands.**
3. **Timelines on every Gold–Plat game: approved.** Done on `milestone-7-grow` so production collects spike data from the v0.7.0 deploy on: `timelineShare` 1, run budget 2400 s (docs/CLOUD.md), and timelines keep champion kills and levels per minute (step 2 of the plan). Older stored rows have neither; the aggregator must skip them.

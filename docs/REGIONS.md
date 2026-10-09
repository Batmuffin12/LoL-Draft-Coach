# Should the collector add NA and KR? (decided 2026-10-09)

The owner asked: "regions might mess with the algorithm; find how different the data is and decide." This file holds the measurement and the decision.

## What was measured

On 2026-10-09, a local collector (the same code and settings as production, the personal key, whose limits are per region) collected Gold to Platinum solo-queue games on NA and KR for about an hour. Each was compared with the production EUW copy (18,180 games in the same band). Script: `compare.cjs` in the session scratchpad. It measures:

- **Picks:** how alike the pick rates per champion and role are (correlation), and how many of the 20 most picked champion-roles are shared.
- **Win rates:** for every champion-role with ≥ 5 games in the region and ≥ 50 in EUW, a z-score of the difference. If both regions had the same win rates, the sum of z² would be about the number of champion-roles. "Excess" is how far above that it is, in standard deviations.
- **Pace:** game length, kills, CS at 10 minutes, deaths before 14 minutes, and the lane gold gap at 15 minutes.

| | NA (397 games) | KR (314 games) | EUW (18,180) |
| --- | --- | --- | --- |
| Pick-rate correlation with EUW | **0.96** | **0.87** | 1 |
| Top-20 picks shared with EUW | **16 of 20** | **9 of 20** | 20 |
| Win rates: sum z² vs expected | 186 vs 204 (−0.9 sd) | 177 vs 165 (+0.7 sd) | – |
| Win-rate gaps with \|z\| ≥ 3 | 0 (chance ≈ 0.6) | 0 (chance ≈ 0.4) | – |
| Game length | 30.0 min | **28.2 min** | 30.5 min |
| Kills per game | 64.8 | **61.2** | 68.0 |
| CS at 10 min (laners) | 65.2 | 67.5 | 66.3 |
| Deaths before 14 min | 2.28 | 2.49 | 2.35 |
| Lane gold gap at 15 min | 1,141 | 1,240 | 1,151 |

**What the sample can and can't show.** With ~400 games, a champion-role has ~20 games, so one win rate is ±11 points. The pooled test can rule out regional win-rate differences that average more than about 5 points per champion. It can't rule out the 1–3 point differences that matter for picks. Picks and pace are measured well even at this size.

## Decision

**Don't add either region now.**

- **KR is a different game.** Only 9 of its 20 most picked champion-roles match EUW, and its games are 2.3 minutes shorter with fewer kills. Pooling it would shift matchup and item data toward a meta our users don't play. This is the risk the owner raised. KR: no.
- **NA looks like EUW** in picks and pace, and shows no win-rate difference this sample could detect. It would be nearly free volume: Riot's limits are per region, so it wouldn't slow the EUW collector. But all our users play on EUW. EUW production already has 24.5k games and grows every hour. And the backtest says the draft terms that need more games (matchups, synergy) barely predict wins (`inChance` is meta + personal). More volume isn't the bottleneck yet. NA: not now.

**When to revisit NA:** if a backtest shows a term limited by EUW volume (matchups or items with too few games), collect ≥ 3,000 NA games and repeat this test. The small-difference test needs about that many. If it stays clean, add NA as a weighted, flagged source (lower weight than EUW, never for the band's own champion win rates).

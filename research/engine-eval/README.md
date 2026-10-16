# Engine review (2026-10-17)

Research only: no app code, config or production settings changed. The readable summary is the artifact **[Coach Engine Review](https://claude.ai/artifact/C1rUPSxybT2G9f63sqBTo3)**; this folder keeps the sourced notes behind it.

## Data

A production copy taken on 2026-10-17 (deleted after the run): 50,067 Gold–Plat games (11.3 days), 13,963 Iron–Silver, 34,754 Emerald–Diamond (builds), 1,235 of the group's own games (3 players), 23 advice-log records. Experiments re-implemented the shipped terms in Python and scored them on time-ordered held-out games; the app's own `pnpm --filter @ldc/server backtest` was run on the same copy as a cross-check (per-pick log-loss 0.6928 vs 0.6931 for a coin, calibrated).

## Results

| Engine | Result |
| --- | --- |
| Pick ranking (champion strength in band) | 53.4 % of 12,000 new Gold–Plat games called right; gain over side-only 0.0037 log-loss [0.0019, 0.0057]. Logistic regression on champion-role one-hots: the same. LightGBM worse (0.0022), factorization machine worse than side-only. |
| Lane, counter, synergy | + lane pairs and jungle/bot duos: +0.0003 over champion strength, inside the noise, at 44k games. |
| Data volume | The shipped prior (150 games) is too weak below ~20k games (overconfident; worse than side-only at 2.5k); heavier smoothing or a fitted model gains from 5k. The gain was still rising at 44k. Iron–Silver (14k) shows no significant signal. |
| Shown chance (champion part) | Calibrated: 46.7 % shown → 46.8 % won; 53.2 % → 51.9 % (top bin a little high). 87 % of picks are shown between 47.5 % and 52.5 %. |
| Personal ("You") term | Group curve: 40.8 % on a champion's first game in the role, 52.5 % at 20–49, 56.5 % at 50+. Against each player's own average, no measurable held-out gain (Δ log-loss +0.0002 [−0.0050, +0.0055], 354 test games). |
| Runes, spells, starting items | Chosen by smoothed past win rate: promised +1.9 to +2.6 points over the most popular option, delivered −0.2 to +0.6 on newer games (CIs include 0). Option effects barely repeat (r 0.05–0.23). The most popular option matches more players (rune page 35 % vs 25 %). |
| Items | Win added repeats weakly (r 0.21 over 1,838 champion-slot-items); the best-win-added item beat the most bought by +0.5 points [+0.05, +0.99] on newer games. Shipped ranking ignores win added (`winAddedScale` 0). |
| Skill order, boots | Large, stable "effects" that come from game length and the result (in-game choices), not evidence that a choice wins. |
| Enemy pick prediction (bans) | From pick shares: top-1 7.6 %, top-10 47 % (Gold–Plat); 11 % and 54 % (Iron–Silver). |
| Break nudge | After 2+ losses in a session: 37.1 % won (70 games) vs 48.4 % otherwise. |

## The test tool has drifted

- Since `rating.inChance` became `["meta", "personal"]` (2026-10-09), the per-pick term ablations and the team/prior sweeps in `backtest-cli.ts` print identical rows, and "Engine as is" at the draft level is not the shipped mix.
- The draft-level features average each term over the ten picks, which shrinks the champion term tenfold (reported gain 0.0009 instead of 0.0037; fitted weight 6.7).
- The personal backtest compares against a flat 50 %, so it credits the term for differences between players.
- Priors are chosen on the test games; runes, spells, starting items, bans, "Clear pick", new champions, goals and pool tiers have no test.

## Notes (every claim sourced and marked by how closely it was read)

- [draft_models.md](notes/draft_models.md): draft win models, data needs, DraftGap and LoLDraftAI source.
- [draft_decisions.md](notes/draft_decisions.md): picking with unknown enemy picks, bans, opponent modelling, recommender evaluation.
- [evaluation_methods.md](notes/evaluation_methods.md): metrics, power, drift, off-policy evaluation, regression gates.
- [personal_modeling.md](notes/personal_modeling.md): player-champion skill, learning curves, TrueSkill 2, privacy of mastery data.
- [builds_ingame.md](notes/builds_ingame.md): item/rune recommendation, causal win added, in-game win probability, power spikes.
- [ml_engineering.md](notes/ml_engineering.md): training and serving options in TypeScript/Electron, EBM export, drift, cost.

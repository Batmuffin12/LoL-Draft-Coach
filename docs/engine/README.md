# Engine scorecard

Is the advice getting better or worse? `pnpm --filter @ldc/server scorecard` answers on a copy of the production database (docs/CLOUD.md "Copy the production database"; keep it outside the repo and delete it after). Background: the engine review of 2026-10-17 (research/engine-eval on its branch, https://claude.ai/artifact/C1rUPSxybT2G9f63sqBTo3) and decision D37.

```bash
export NODE_OPTIONS=--max-old-space-size=14000 DATABASE_PATH=/path/to/ldc.sqlite
pnpm --filter @ldc/server scorecard --label 2026-10-19            # the current config, saved here in scorecards/
pnpm --filter @ldc/server scorecard --set rating.priorGames.meta=300 --set loadout.pickBy=winRate
pnpm --filter @ldc/server scorecard --compare 2026-10-19-baseline 2026-10-19-tuned
```

Flags: `--bands 1,2`, `--folds 3`, `--fold-games 4000`, `--check-games 8000`, `--skip personal,loadout,items,ingame`. `--set` takes any engine config path; the value is read as JSON when it parses (`'rating.priorGames.metaByBand={"3":1000}'`).

## What it measures

Every number comes from games newer than the data behind it.

| Section | How | Main number |
| --- | --- | --- |
| Draft, per band | The newest 3 blocks of up to 4,000 games, each predicted from a snapshot of every game before it. A game's prediction: blue's side rate plus each pick's rating points for the terms in the shown chance (`rating.inChance`), blue minus red. | `gainVsSide`: log-loss minus the side-only baseline's on the same games (below 0 = the draft adds something), with a 95% interval. Also accuracy, AUC, calibration (ECE, and the slope: 1 = right, above 1 = too timid, below 1 = too bold) and the per-pick shown chance's calibration. |
| Personal | Users' own games after their first 20, comfort rebuilt from earlier games only, predictions starting from the player's own earlier win rate. | `gainVsOff`: with the personal term minus without. |
| Rune pages, spells | Builds from the oldest 75% of bands 2+3, checked on the newest games: did the player take what we suggest, and how did those players do against everyone on the same champion and role? | `delivered` (win points), next to `taken` (share of players) and what the build's win rates `promised`. |
| Items | The item backtest: builds learned once from the oldest 75%, then every completed-item purchase in the newest games is ranked from the draft and the items already finished. Top 1 / top 3 vs the real purchase, for ours and for plain "most bought" (`items.popular.*`); win added (result minus the expected win at that minute and gold lead) of purchases matching each #1. With `--set`, the current config is scored on the same purchases as `items.current.*`. | `oursVsPopular`: where our #1 and the most-bought #1 differ, win added of buying ours minus buying the most bought, with a 95% interval (above 0 = our advice is better). |
| In game | One logistic regression per checkpoint minute (`meta.v1.json` `winModel.minutes`) on what the scoreboard shows: team kills, levels, CS, held items' value, epic monsters. Never gold. | `gainVsSide`, accuracy and AUC per minute. |

## The rule

A candidate (`--set`) is scored on the same games as the current config, and the difference is paired, which is far more sensitive than comparing two runs. **Ship it when a main number gets better (its interval clear of 0) and nothing gets worse**; the tool prints the verdict. Rune pages, spells and items aren't paired: compare their numbers with a run of the current config. Saved runs (`--label`) track the engine as data grows; compare their intervals, since the games differ.

Tuning on the same games again and again overfits them: re-check a setting on a newer production copy before building on it.

## Results

| Run | Draft Iron–Silver / Gold–Plat / Emerald–Diamond (gain vs side, accuracy) | Rune page taken / delivered | In game, minute 10 / 15 / 20 accuracy |
| --- | --- | --- | --- |
| [2026-10-19 baseline](scorecards/2026-10-19-baseline.json) | −0.0039 · 53.8%, −0.0043 · 53.6%, −0.0003 · 52.4% | 24% / −0.70 pts | 67% / 72% / 77% |
| [2026-10-19 tuned (v1.0.3)](scorecards/2026-10-19-tuned.json) | −0.0039 · 53.8%, −0.0044 · 53.8%, −0.0015 · 52.4% | 35% / −0.63 pts | 67% / 72% / 77% |

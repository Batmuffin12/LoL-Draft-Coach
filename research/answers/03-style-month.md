# 3. Style tab and monthly report

Research run 2026-10-09. Status: **done, pending production measurements** (η² by champion, within-player SD per axis, csPerMinute win split; listed at the end).

Access note: mobalytics.gg, help.op.gg, dl.acm.org, medium.com and reddit.com return 403 to our fetcher. Mobalytics' GPI was read through third-party descriptions and search summaries; Reddit only through search summaries. Where that matters it is said next to the claim.

## Short answer

1. **Our 7 axes mix three kinds of thing.** Some measure a habit or early skill the player controls (early farm, early deaths, control wards). Some mostly measure the champion's kit or the result (damage share, damage per minute, solo kills, dragon/baron/turret totals, gold per minute). One (roaming) has no working metric. Keep 6 axes, rebuild their metrics from early and habit fields, score kit-sensitive metrics against the same champion, and drop roaming until a timeline metric exists.
2. **Score champion-adjusted, role-referenced.** Compare the player's value with the typical value of *the same champion in the same role and band* (shrunk toward the role when the champion has few games), then place that difference on the role's spread. This is what Riot's own mastery grade, STRATZ's IMP, OpenDota's benchmarks and the SIDO model do. Our band data (15–60k games) is enough for per-champion **means**, not per-champion quantiles.
3. **Prefer early and habit metrics; drop whole-game totals** (gold/min, dragon, baron and turret takedowns, damage/min, deaths by champions). Shares (kill participation, team damage share) are less outcome-bound than totals but kit-bound: champion-adjust them or leave them out.
4. **The month report should lead with what the player controls** (games, focus goals met, the axes that really moved), then champion-pool health, then rank and win rate with an honest "no clear change" when the sample can't tell. Tilt and time of day: show at most a behaviour count (e.g. "queued right after 2 losses 6 times"), never a personal win-rate claim, because 40 games can't support one.
5. **Over 40 vs 40 games an axis must move by roughly 7–11 points (0–100) before the change is real, and a win rate by about 22 points.** Today's rule ("within ±2 is flat") calls 58–74 % of axes "changed" when nothing changed (simulation below). Use a per-player Welch test with z = 2.4 across the 6 axes (≈10 % chance of any false "changed" per report), and non-overlapping game sets.

---

## Q1. Which axes are meaningful? Which are really "what champion you play"?

### What comparable products use

| Product | Axes / inputs | Reference group | Source (date) |
| --- | --- | --- | --- |
| Mobalytics GPI | 8 areas: Aggression, Consistency, Farming, Fighting, Survivability, Teamplay, Versatility, Vision. Weighted by role ("Vision is a lot more important for Junglers and Supports than ADCs"). 0–100 where 0 ≈ Bronze, 100 ≈ Challenger. Needs ≥ 20 ranked games, updates about every 10. | Role (and tier scale) | [mobalytics.gg/gpi](https://mobalytics.gg/gpi/) (search summary; page blocks fetch), [Wikipedia: Mobalytics](https://en.wikipedia.org/wiki/Mobalytics), [Esports Insider, Aug 2017](https://esportsinsider.com/2017/08/great-really-mobalytics-releases-gamer-performer-index) (search summary) |
| Riot champion mastery grade (S+ … D) | "a mix of core game metrics that Riot is confident cannot be abused through means such as exclusively farming or spam warding" | **Same champion + position, same region** ("Vel'Koz bottom lane compared only to other Vel'Koz bottom players") | [LoL wiki: Champion Mastery](https://wiki.leagueoflegends.com/en-us/Champion_Mastery), [Riot support: Champion Mastery Guide](https://support-leagueoflegends.riotgames.com/hc/en-us/articles/204211284-Champion-Mastery-Guide) (2024 system) |
| OP.GG OP Score | 0–10 per game from role, laning, kills, deaths, damage, wards, objective damage; recomputed every 5 min; MVP/ACE badges | Role, outcome-weighted | [OP.GG help: OP Score explained](https://help.op.gg/hc/en-us/articles/31088715328665-OP-Score-explained) (search summary; 403) |
| STRATZ IMP (Dota 2) | 27 metrics, weighted by a neural net for win probability; "higher values are not necessarily better" | **Same hero, lane, role, skill bracket and match duration** | [STRATZ knowledge base #23](https://github.com/STRATZ-Esports/knowledge-base/issues/23), [STRATZ Medium "IMP: Decoding your performance"](https://medium.com/stratz/imp-decoding-your-performance-c251dcb42b93) (search summary) |
| OpenDota benchmarks | GPM, XPM, last hits, kills per min … as percentiles | **Same hero** across skill levels | [OpenDota blog, Apr 2016](https://blog.opendota.com/2016/04/10/benchmarks/), [ROpenDota manual](https://search.r-project.org/CRAN/packages/ROpenDota/ROpenDota.pdf) |
| SIDO model (paper) | Gold (resource gain) and damage (resource use) | Hierarchical Bayes with a **champion random effect**; ≥ 30 accounts per champion-role | [Zhang & Naidu, arXiv 2403.04873, Mar 2024](https://arxiv.org/html/2403.04873v1) |
| PandaSkill (paper) | 15 end-game stats → per-role model of win probability → percentile | Role only; uses "the outcome of the game as a proxy for the player's performance" | [arXiv 2501.10049, Jan 2025](https://arxiv.org/html/2501.10049) |

**Pattern.** The systems that grade *a player's habits* (Riot mastery grade, STRATZ, OpenDota, SIDO) all compare against the same champion/hero in the same position. The systems that compare by role only (GPI, PandaSkill, OP Score) either weight areas by role or train on the result.

### Criticism of player scores

- **Score padding / not measuring impact.** OP Score users report easy MVP/ACE by "playing safe, farming CS, padding assists, and placing 4+ control wards" and advise cross-checking it ([talk.op.gg user test](https://talk.op.gg/s/lol/tip/6668446/), search summary). Riot built its mastery grade from metrics "that cannot be abused … by exclusively farming or spam warding" ([LoL wiki](https://wiki.leagueoflegends.com/en-us/Champion_Mastery)), which admits the same risk. Implication for us: a habit axis must not reward volume alone (use per-minute rates, and value control wards and ward clearing, not raw ward count).
- **Outcome leakage.** PandaSkill's authors state the score uses the game result as a proxy for performance ([arXiv 2501.10049](https://arxiv.org/html/2501.10049)); STRATZ trains IMP on win probability. Such scores reward being on the winning team. Our pilot (ROLE-GOALS.md) found win splits of 0.3–0.7 on whole-game totals: same problem.
- **Kit dependence.** STRATZ says openly that "different heroes vary in their average IMP scores … a feature rather than a bug" ([STRATZ KB #23](https://github.com/STRATZ-Esports/knowledge-base/issues/23)); for a *style* tab that is a bug: a Malphite player would read "low fighting" because Malphite deals little damage.
- Kit dependence in League numbers: champion averages of kill participation run from ~58–61 % on enchanters and engage supports (Yuumi 61.2 %, Rell 59.4 %, Sona 58 %) while carries lead *kill share* instead (Twitch 32 %, Samira 31.7 %) ([lolprofile.net kill participation](https://lolprofile.net/kill-participation), 30-day ranked window; search summary, page 403). A role-only percentile would rank a Yuumi player "high fighting" for picking Yuumi.
- GPI: Mobalytics itself wrote that its post-game GPI was "a bit misleading because Consistency and Versatility were impossible to evaluate within one game", and that it wanted to move GPI "to be role specific, and making sure that no roles see irrelevant information" ([Mobalytics changelog v.005, Dec 2017](https://medium.com/mobalytics/changelog-v-005-12-04-2017-7e8c15f9083d), search summary; page 403). Independent player criticism of GPI: **no evidence found** in fetchable sources (Reddit unreachable; searches for "GPI inaccurate", "GPI champion dependent", "Mobalytics review GPI" returned press coverage and Mobalytics' own posts). Mobalytics' own scale ("only Challenger can reach 100") means a Gold player's scores sit low by design, which players report as discouraging (search summary of [mobalytics.gg/gpi](https://mobalytics.gg/gpi/); unverified).

### Our axes, judged

| Axis | Verdict | Why |
| --- | --- | --- |
| earlyPressure | **Keep, rebuild** | Lane diffs at 10/14 and takedowns before X min are early. `maxCsAdvantageOnLaneOpponent` (whole-game, never negative), `enemyJungleMonsterKills` (win split 0.33) and `laningPhaseGoldExpAdvantage` (binary-ish) out (ROLE-GOALS pilot). |
| fighting | **Keep only champion-adjusted**, shares only | `teamDamagePercentage`, `damagePerMinute`, `soloKills` are kit-bound (SIDO uses damage as its main *champion-adjusted* stat); `damagePerMinute` is also whole-game. Kill participation depends on the team and kit. Keep KP + damage share, champion-adjusted; drop damage/min and solo kills. |
| farming | **Keep** | Early lane minions / jungle CS before 10 are early and habit. Drop `goldPerMinute` (whole-game, win split high). Not for support. |
| vision | **Keep** | Control wards and ward takedowns are the best habit metrics in the pilot (win split ≈ 0, rank gap largest). Drop `visionScoreAdvantageLaneOpponent` (unbounded ratio). |
| riskControl ("staying alive") | **Keep** | `earlyDeaths` is early; deaths/min is confounded (win split −0.3 to −0.47) but players expect "deaths" here; keep it as the second metric, champion-adjusted. Drop `deathsByEnemyChamps` (duplicate of deaths). |
| objectives | **Keep, early only** | Dragon, baron and turret takedowns follow the result (win split 0.3–0.7). Use `earlyEpicMonsterTakedowns` and `turretPlatesTaken`. |
| roaming | **Drop for now** | Its three challenge fields are mostly 0 or missing in our pilot; patch 26.16 penalises heavy early roaming for supports ([Riot patch 26.16](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes)). Re-add when a timeline metric exists (takedowns in another lane before 14 min). |
| playmaking (CC) | Already dropped | Correct: CC is the kit. |

Mobalytics' *Consistency* idea is worth keeping, but as a monthly-report line (spread of per-game scores), not an axis.

## Q2. Champion-relative or role-relative?

**Decision: champion-adjusted, role-referenced, with shrinkage.**

For player *p*'s game on champion *c* in role *r*, metric *m*:

```
champMean*(c,r,m) = (n_c * mean_c + k * mean_r) / (n_c + k)       // shrunk toward the role
adjusted          = value − champMean*(c,r,m) + mean_r
score             = percentile of `adjusted` among the role's champion-centred values
```

- The role's reference distribution must itself be champion-centred (each collected value minus its champion's shrunk mean, plus the role mean); otherwise adjusted values would be scored against a spread that still includes champion differences, and every percentile would be squeezed toward 50.
- `k` (prior games) ≈ 50: with n_c = 50 the champion mean counts half. That follows the SIDO choice of ≥ 30 accounts per champion-role ([arXiv 2403.04873](https://arxiv.org/html/2403.04873v1)) and standard empirical-Bayes shrinkage; it is a starting value to check with the measurement below.
- **Is our data enough?** A band with 30k games has 300k player-games, ≈ 60k per role. Spread over ~170 champions with very uneven play rates, popular champion-roles get thousands of games, rare ones tens. Means (one number per champion-role-metric) are stable from ~50 games; 21-point quantiles per champion would need several hundred. So: means per champion, quantiles per role. Snapshot cost: ≈ 170 champions × ~2 roles × ~14 metrics ≈ 5k numbers per band.
- Metrics with little champion effect lose nothing from adjustment (the shift is ≈ 0), so one rule for all metrics is simpler than a per-metric switch.

**Measure on production (needed to confirm):** per band, role and metric, the share of variance explained by champion (η² from a one-way ANOVA on champion). Expect high η² for damage share, damage/min, CC, solo kills, KP; low for control wards and early deaths. If η² < 0.05 for a metric, the adjustment is harmless and can stay; if η² > 0.3, champion adjustment is mandatory (or drop the metric).

## Q3. Most reliable metric per axis, least confounded by winning

Split from ROLE-GOALS: **early** = decided by ~14 min; **habit** = the player controls it whatever the result; **whole-game** = follows the result. "ch." = `challenges.`.

| Axis | top | jungle | middle | bottom | utility |
| --- | --- | --- | --- | --- | --- |
| earlyPressure | laneGoldDiffAt14, laneCsDiffAt10, ch.takedownsFirstXMinutes | ch.killsOnLanersEarlyJungleAsJungler, ch.takedownsFirstXMinutes | laneGoldDiffAt14, laneCsDiffAt10, ch.takedownsFirstXMinutes | laneGoldDiffAt14, laneCsDiffAt10, ch.takedownsFirstXMinutes | laneGoldDiffAt14, ch.takedownsFirstXMinutes |
| farming | ch.laneMinionsFirst10Minutes, csPerMinute | ch.jungleCsBefore10Minutes, csPerMinute | same as top | same as top | — (no axis) |
| vision | ch.controlWardsPlaced, wardsPlacedBefore14 | ch.controlWardsPlaced, ch.wardTakedowns, wardsPlacedBefore14 | as top | as top | ch.controlWardsPlaced, ch.wardTakedowns, ch.visionScorePerMinute |
| riskControl | earlyDeaths, deathsPerMinute | same | same | same | same |
| objectives | earlyEpicMonsterTakedowns, ch.turretPlatesTaken | earlyEpicMonsterTakedowns, ch.riftHeraldTakedowns* | as top | as top | earlyEpicMonsterTakedowns, ch.turretPlatesTaken |
| fighting (champion-adjusted) | ch.killParticipation, ch.teamDamagePercentage | same | same | same | ch.killParticipation |

\* `riftHeraldTakedowns` is a whole-game count but herald (and grubs) only exist early, so it is effectively early. Notes:
- `csPerMinute` is whole-game but largely a habit; profile guides name CS/min by role as one of the three most useful profile stats ([Wombo Combo](https://www.wombocombo.gg/blog/summoner-lookup/understanding-summoner-profile-stats)), and GPI's farming area uses CS/gold/XP per minute split by game phase (GPI page, search summary). Its win split is **not yet measured** in our pilot: measure it, keep it second and champion-adjusted, and drop it if its win split is like gold/min's (≥ 0.3).
- `controlWardsPlaced` is a per-game count; longer games give more. Prefer a per-minute rate (new derived metric `controlWardsPerMinute`) once added.
- `takedownsFirstXMinutes`: Riot doesn't document X (ROLE-GOALS). Keep, but don't label it "before 10 min" in text until verified.
- Per-role pruning already happens automatically for jungle-only/laner-only fields (they read as null). Support farming must be removed explicitly (support CS is penalised by role quests, [Sheep Esports](https://www.sheepesports.com/articles/league-of-legends-introduces-role-quests-in-2026-all-rewards/en)).

## Q4. The monthly report: what players want, what motivates, what discourages

### Evidence

- **Task-focused beats self-focused feedback.** Kluger & DeNisi's meta-analysis (607 effects, 23,663 observations): feedback helps on average (d = 0.41) but **over a third of feedback interventions lowered performance**, and the risk rises as feedback draws attention to the self instead of the task ([Kluger & DeNisi 1996, abstract](https://pluto.huji.ac.il/%7Emskluger/files/Download/Kluger%20&%20%20DeNisi%20abstract.doc); [SWOV summary](https://swov.nl/nl/publicatie/effects-feedback-interventions-performance-historical-review-meta-analysis-and); [Psych Safety field guide](https://explore.psychsafety.com/n/kluger-denisi-1996/)). → "Control wards: 2.1 → 2.8 per game" (task), never "you got worse at vision" (self).
- **Positive feedback keeps people playing; negative feedback lowers felt competence.** In a game experiment, negative feedback decreased competence but increased immediate play; positive feedback was "more powerful in fostering long-term motivation" ([Burgers et al. 2015, *Computers in Human Behavior*](https://research.vu.nl/ws/files/1237378/Burgers%20Eden%20van%20Engelenburg%20Buningh%20(2015).pdf)); SDT's need for competence predicts enjoyment and future play ([Przybylski, Deci, Rigby & Ryan 2014](https://selfdeterminationtheory.org/wp-content/uploads/2014/07/2014_PrzyDeciRigbyRyan_JPSP1.pdf)). → Lead with goals met and real improvements; show a fall only when it passes the rule, and pair it with the one action that fixes it.
- **Visible progress toward a goal raises effort** (goal-gradient; [UX Planet](https://uxplanet.org/persuasive-ux-goal-gradient-effect-users-retention-e65d7e767225), [Built for Mars](https://builtformars.com/ux-glossary/goal-gradient-effect)). Practitioner sources, weaker evidence. → "Focus goal met in 14 of 22 games" with a bar.
- **Reflection needs the user to act on it** (Li, Dey & Forlizzi 2010 stage model: collection → integration → reflection → action; [paper](https://courses.cs.washington.edu/courses/cse440/15au/readings/PersonalInformatics-Li2010.pdf), [Quantified Self](https://quantifiedself.com/blog/a-stage-based-model-of-personal-informatics-systems/)). → End the report with next month's one focus.

### Each candidate section

| Section | Show? | Why |
| --- | --- | --- |
| Games played, goals met | **Yes, first** | Under the player's control; motivating (above). Fix the REVIEW finding that the "Goals met" tile shows 9 but lists 1. |
| Style axes that moved | **Yes, second**, only axes that pass the rule; others as "steady" | 6 axes × noise ⇒ many false moves today (Q5). |
| Champion-pool health | **Yes** | Mastery matters: < 10k mastery ≈ 44 % win rate, > 10k ≈ 50 %, flat after ([itero.gg, 1M+ games](https://www.itero.gg/articles/mastery-a-statistical-summary)); one-tricks average ~55 % ([LoLalytics 1-trick tier](https://lolalytics.com/lol/tierlist/?tier=1trick), [dodge.gg](https://www.dodge.gg/en-US/lol/news/best-one-trick-champions-2026)). Show: share of games on champions with ≥ 20 career games, new champions tried, top 3 with games (not per-champion win-rate deltas from 5-game samples). |
| Rank and LP | **Yes, third** | Players expect it, but it is the most outcome-driven and noisiest; show start → now and the daily LP line if the server keeps it; no verdict words. |
| Win rate vs last month | **Yes, with "no clear change"** unless the two-proportion test passes (needs ~22 points at 40 vs 40). |
| Consistency | **Optional** | GPI has it. The SD of 40 per-game scores has ~11 % relative error, fine for "steadier / more up-and-down than last month" when the change passes an F-test; low priority. |
| Tilt (after losses) | **Behaviour count only** | Population data: win rate ≈ 51 % → 50.4 % → 48.8 % after 0/1/2 losses; Gold players who took a 5–20 min break after 2 losses won ~3 % more; reversed in Diamond I ([itero.gg tilt study, 100k games](https://www.itero.gg/articles/lol-tilt); [LoLTheory](https://blog.loltheory.gg/cant-end-on-a-loss-league/); [ACM CHI PLAY 2024, 597,680 games](https://dl.acm.org/doi/fullHtml/10.1145/3665463.3678787), search summary: longer breaks after losses outperform instant re-queue). A 1–3 point effect can't be seen in one player's 40 games, so show "queued within 10 min after 2 losses: 6 times" plus the population fact, never "you lose more after losses". |
| Time of day | **No** | Evidence is about sleep and cognition in general ([Frontiers 2021](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.697535/full), [pess.blog 2021](https://pess.blog/2021/03/10/its-time-to-play-discussing-circadian-rhythm-and-esport-performance-tim-smithies/), [ACM CHI PLAY 2024 "Day 'n' Nite"](https://dl.acm.org/doi/10.1145/3665463.3678796)); split into 3–4 time buckets, 40 games give ~10 per bucket: no test can pass. Revisit at 200+ games. |

## Q5. Showing a trend honestly

**Today's rule is wrong in two ways.**
1. `report.ts` compares overlapping samples: "now" is the recency-weighted style over *all* games up to now, "start" over all games before the month. The month's games are partly diluted into history, and the two are not independent, so no test applies.
2. `MonthReport.tsx` calls any |Δ| ≥ 2 "changed".

**Simulation** (null hypothesis: no real change; per-game axis scores normal with the player's own SD; 20,000 runs of two independent blocks of n games, 6 axes each; "needed" = 2.4 · SD · √(2/n)):

| per-game SD | games per side | "changed" under ±2 rule | 95th pct of |Δ| | needed at z = 2.4 | any of 6 axes falsely "changed", z = 1.96 / 2.4 |
| --- | --- | --- | --- | --- | --- |
| 12 | 40 | 58 % | 5.2 | 6.4 | 28 % / 10 % |
| 16 | 40 | 67 % | 7.1 | 8.6 | 28 % / 11 % |
| 20 | 40 | 74 % | 8.8 | 10.7 | 28 % / 11 % |
| 16 | 20 | 77 % | 10.0 | 12.1 | 30 % / 12 % |

Win rate, 1.96·SE of the difference: 31 points at 20 vs 20, **22 at 40 vs 40**, 15.5 at 80 vs 80.

This matches the sport-science literature: in basketball, ~30 games per group detect only a *medium* change (d > 0.5), ~190 a small one ([Research Quarterly for Exercise and Sport, 2019](https://www.tandfonline.com/doi/abs/10.1080/02701367.2019.1597243)); minimal-detectable-change estimates are themselves unstable below ~30 samples ([BMC Sports Sci Med Rehabil, 2026 Monte Carlo](https://link.springer.com/article/10.1186/s13102-026-01987-0); [Eur J Appl Physiol 2025 review](https://pmc.ncbi.nlm.nih.gov/articles/PMC12174282/)). Assumes independent games; streaks make real thresholds a little larger.

**Rule ("changed").** For each axis, with this period's games A and the previous period's games B (non-overlapping, unweighted, per-game axis scores, champion-adjusted):
- both sides ≥ `minGamesPerSide` (15), else "not enough games";
- Welch: `|meanA − meanB| ≥ z · sqrt(sA²/nA + sB²/nB)` with `z = 2.4` (≈ 10 % chance of any false "changed" among 6 axes);
- and `|meanA − meanB| ≥ minChange` (5 points) so a tiny but "significant" change from a heavy month stays "steady";
- show the change as from → to with a plain verb ("up", "down", "steady"); colour only "changed" ones.

Win rate: two-proportion z-test with the same z; otherwise "no clear change" and show both rates.

**Must measure on production:** the within-player per-game SD of each axis score (median over players with ≥ 40 games per role). If it is ≈ 16, 40 vs 40 games need ≈ 9 points. Use the measured SD only to tune `minChange`; the rule itself uses each player's own SD.

## Deliverable

### Recommended axis set

Six axes: **earlyPressure, farming, vision, riskControl, objectives, fighting** (fighting labelled "compared with others on your champion"). Per-role metrics: table in Q3. Roaming: removed until a timeline metric exists.

### Scoring decision

Champion-adjusted, role-referenced, with shrinkage (Q2). Fallback when the snapshot has no champion means (e.g. "games" reference mode): today's role percentiles, and hide the fighting axis.

### Monthly report layout (top to bottom, fits 440 × 720)

1. **This month:** games played; focus goals met "X of Y games" with a bar (the list matches the number).
2. **What moved:** up to 3 axes that pass the rule ("Vision up: control wards 1.2 → 2.0 per game"); then one line "Steady: farming, staying alive, …". A fall is shown with its metric and next action, never as a verdict.
3. **Champion pool:** % of games on champions with ≥ 20 career games; new champions tried; top 3 by games.
4. **Rank:** start → now (+ LP line if kept); win rate this vs last month, or "no clear change (40 games is too few to tell)".
5. **Habits (optional):** "queued straight after 2 losses: N times"; consistency only if it passed its test.
6. **Next month's focus:** one goal (from growth focus).

## What to change in the code or config

1. `report.ts`: compare **non-overlapping** sets (period vs previous period, or last N vs previous N games), unweighted per-game axis scores; return per axis `{ from, to, nFrom, nTo, changed: "up" | "down" | "steady" | null }` using the rule above. Same for win rate.
2. `MonthReport.tsx`: drop the ±2 rule; colour only `changed`; order sections as in the layout.
3. `playstyle.ts`: expose per-game axis scores (needed for the test) and support champion adjustment: `readMetric` value → `value − champMean* + roleMean` when the snapshot carries champion means.
4. `packages/meta` aggregator: per band, role and metric store champion means with n (`championMeans`) and quantiles of champion-centred values; keep the raw quantiles for the growth focus until it is switched.
5. Add derived metric `controlWardsPerMinute`; later a timeline metric for roaming (takedowns in another lane before 14 min).
6. Production measurements: η² by champion per metric; within-player per-game SD per axis; `csPerMinute` win split per role; check `takedownsFirstXMinutes`' X.

Proposed `playstyle` and `report` blocks for `config/engine.v1.json` (same shape as today, plus optional `roles` per axis to restrict an axis to roles, and new `champion` and trend fields):

```json
{
  "playstyle": {
    "halfLifeDays": 60,
    "minGamesPerRole": 8,
    "minMetrics": 2,
    "minReferenceSamples": 20,
    "champion": { "adjust": true, "priorGames": 50 },
    "axes": {
      "earlyPressure": {
        "metrics": [
          "laneGoldDiffAt14",
          "laneCsDiffAt10",
          "challenges.takedownsFirstXMinutes",
          "challenges.killsOnLanersEarlyJungleAsJungler"
        ]
      },
      "farming": {
        "metrics": [
          "challenges.laneMinionsFirst10Minutes",
          "challenges.jungleCsBefore10Minutes",
          "csPerMinute"
        ],
        "roles": ["top", "jungle", "middle", "bottom"]
      },
      "vision": {
        "metrics": [
          "challenges.controlWardsPlaced",
          "challenges.wardTakedowns",
          "wardsPlacedBefore14",
          "challenges.visionScorePerMinute"
        ]
      },
      "riskControl": {
        "metrics": ["-earlyDeaths", "-deathsPerMinute"]
      },
      "objectives": {
        "metrics": [
          "earlyEpicMonsterTakedowns",
          "challenges.turretPlatesTaken",
          "challenges.riftHeraldTakedowns"
        ]
      },
      "fighting": {
        "metrics": ["challenges.killParticipation", "challenges.teamDamagePercentage"],
        "championAdjustedOnly": true
      }
    }
  },
  "report": {
    "days": 30,
    "maxChampions": 3,
    "minPriorGames": 5,
    "trend": { "minGamesPerSide": 15, "z": 2.4, "minChange": 5 },
    "comfortGames": 20
  }
}
```

Notes on the JSON: `roles`, `champion`, `championAdjustedOnly`, `trend` and `comfortGames` are new keys; the config Zod schema must accept them. `visionScorePerMinute` reads `challenges.visionScorePerMinute` as today; for laners it will usually rank low but adds signal. Utility's `vision` axis keeps `visionScorePerMinute`; other roles rely on control wards and early wards (pilot: vision score has a weak win split, ROLE-GOALS).

## Self-check

- Q1–Q5 answered; GPI-specific criticism marked "no evidence found" (sources blocked).
- No champion or item lists; all thresholds are config.
- Riot rules: only the player's own games and anonymous band aggregates; no other player identified.
- Statistics: every shown change passes a test; whole-game totals removed or champion-adjusted shares only.
- JSON parses; new keys listed.

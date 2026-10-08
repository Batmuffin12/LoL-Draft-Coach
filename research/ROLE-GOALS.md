# Role-based growth goals: research

Oct 8, 2026 · research only (no code or config changed). Machine-readable proposal: [role-goals.proposal.json](role-goals.proposal.json).

**Question.** After each game the coach shows one improvement goal. Today it comes from the player's main role. Which measurable habits should each role (top, jungle, middle, bottom, utility) be judged on, so the goal can follow the role played in that game?

**Short answer.** Each role gets a short ranked list of **early** (decided by about 14 min) and **habit** metrics. Whole-game totals stay out of the goal pool because they mostly follow the result. Five of the goals need new timeline metrics; the rest use fields we already store. The ranking below is a prior: the engine's own per-band importance check (`metricImportance` in `packages/engine/src/growth.ts`) should keep the final say once production data is large enough.

## 1. How strong is the evidence?

Be clear about this first: **no published study ranks per-role, per-habit stats for solo queue.** What exists:

| Source | What it shows | Limits |
| --- | --- | --- |
| [Hojaji et al. 2025, *Computers in Human Behavior Reports*](https://doaj.org/article/dc43dcec52764f6fbd06ce940fd9ae72) (154k Riot API games) | Top KPIs for winning: fewer turrets lost, bounty level, turrets destroyed, less damage taken, dragons. Higher-skilled players spend more time near key objectives, which shows in ward placement and vision control. | Abstract only (the full text is paywalled for us). Team-level outcomes, not per-role habits. |
| [Junior & Campelo, arXiv 2309.02449](https://arxiv.org/pdf/2309.02449) | Early on, kills, dragons and towers drive win prediction; total gold and first blood matter more as the game goes on. | Seen through its abstract and search summaries. Team-level. |
| [Applied Sciences 2025, 15(10) 5241](https://www.mdpi.com/2076-3417/15/10/5241) | `goldAtFifteenDiff` is one of the few significant predictors (with rank difference and streak difference). | Seen through search summaries (the page blocks our fetcher). |
| [HUCAPP 2022 (SciTePress)](https://www.scitepress.org/Papers/2022/108959/108959.pdf) | Champion level and total minions killed have the largest SHAP impact. Fitted role weights came out almost equal (0.1996–0.2006): "the influence of the different roles on the overall result is negligible". | Uses whole-game stats (outcome-confounded). Small (2,901 matches for role weights). |
| [SIDO model, arXiv 2403.04873](https://arxiv.org/html/2403.04873v1) (GM/Challenger solo queue) | Pro junglers' biggest edge over other high-elo junglers is **gold denied to enemies at 7–15 min**. Pro supports stand out on enemy damage prevented. | Gold and damage only; no vision, CS or deaths. |
| [Slotboom 2021, Tilburg thesis](http://arno.uvt.nl/show.cgi?fid=156282) (pro games) | Objectives matter most, then player-vs-player, then minions; vision helps less ("increase the chance of winning by small bits"). | Pro play, team level. |
| [WARDS white paper (Univ. of York / SDU)](https://gdlt.sdu.dk/wp-content/uploads/2022/06/White-Paper_Dispersing-the-fog-of-war_-A-new-approach-to-ward-evaluation-in-MOBAs-.pdf), [paper](https://eprints.whiterose.ac.uk/170119/) | Total vision score matches the winning team about 69% of the time, but vision score "has a built-in bias towards the winning team" and is only measured at game end. | Team-level. The ward-value model was tested in Dota 2. |
| [Collective intelligence study, arXiv 2506.02706](https://arxiv.org/html/2506.02706v1) (31k EU ranked games) | Diamond+ teams spread assists more evenly than Silver-and-below teams. | Team-level graph metrics; no per-role habits. |
| **Our own pilot** (this repo, below) | Per-role spread, win split and Gold–Plat vs Emerald–Diamond means for every candidate field. | 400 games, patches 16.17–16.19, only bands 2–3. A pilot, not a result. |

Coaching sources (opinion, marked as such) supply the "keep in mind" tips: [Dignitas](https://dignitas.gg/articles/how-to-measure-the-best-stats-for-performance-in-league-of-legends), [dodge.gg jungle 2026](https://www.dodge.gg/en-US/lol/news/jungle-guide-2026), [LoLTheory vision score](https://blog.loltheory.gg/vision-score-lol/), [LoLTheory roaming](https://blog.loltheory.gg/roaming-lol/), [games.gg ADC](https://games.gg/league-of-legends/guides/league-of-legends-adc-guide/), [games.gg top](https://games.gg/league-of-legends/guides/league-of-legends-top-lane-guide/), [games.gg jungle](https://games.gg/league-of-legends/guides/league-of-legends-jungle-guide/), [Mobalytics mid](https://mobalytics.gg/blog/lol-4-tips-to-impact-the-map-as-the-mid-laner/), [Mobalytics warding](https://mobalytics.gg/blog/lol-warding-guide/), [Mobalytics low-elo ADC](https://mobalytics.gg/blog/lol-how-to-climb-in-low-elo-adc/), [WeCoach support](https://wecoach.gg/blog/article/all-you-need-to-know-about-support-coaching-in-league-of-legends), [WeCoach jungle](https://wecoach.gg/blog/article/how-to-play-jungle-in-league-of-legends), [BrokenBlade top course (Aim Lab)](https://aimlabs.com/courses/4qBvXtzyjCLj6P1U3BEiu2/lessons/396FG909okx7V58Wz938nz), [Mobafire support tips](https://www.mobafire.com/league-of-legends/blog/ch33syb0y8/15-tips-for-supports).

**Conflicts between sources.**
- Vision: the WARDS paper links team vision score to winning (69%). Slotboom says vision matters little in pro play. Dignitas says vision score "measures the activity … not the quality". Our pilot finds almost no win split for per-player `visionScorePerMinute` (0.05–0.14). Conclusion: count vision **habits** (control wards, ward clearing, early wards), and don't use vision score as proof of winning.
- CS benchmarks: guides disagree on what "good" CS is ([Boosting Market](https://boostingmarket.com/blogs/lol-cs-per-minute-by-rank/) vs [Dignitas](https://dignitas.gg/articles/how-to-measure-the-best-stats-for-performance-in-league-of-legends) "about 10 per minute"). This is one more reason the app sets targets from its own band data (hard constraint 3), not from guides.

### 1.1 The game in 2026 (role quests)

Patch 26.1 added **role quests** for every position ([Sheep Esports](https://www.sheepesports.com/articles/league-of-legends-introduces-role-quests-in-2026-all-rewards/en)): top, mid and bot get rewards for playing out their lane, and solo laners get less minion gold and XP outside their lane early on. Patch 26.16 ([Riot](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes)) "penalize[s] heavy early game roaming" for supports and raised the support penalty on minions outside bot lane to −33% until level 5. Two consequences for goals:
- **Lane CS at 10 is even more central for top, mid and bot** in 2026, because the quests reward farming in your own lane.
- **Don't push supports to roam more.** The roaming metrics fit as context, not as a "higher is better" support goal. The old support-quest fields (`completeSupportQuestInTime`, `fasterSupportQuestCompletion`) exist in Riot's schema but **never appeared** in our 2026 games.

## 2. Field check

**All 29 `challenges` fields named in the brief exist** in Riot's Match-V5 `ChallengesDto` (checked against the community-maintained mirror of Riot's API reference, [riotapi-schema openapi-3.0.0.json](https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.json); official page: [developer.riotgames.com/apis#match-v5](https://developer.riotgames.com/apis#match-v5)). Riot doesn't document what they mean, so the meanings below come from community challenge lists ([darkintaqt](https://challenges.darkintaqt.com/challenges)) plus our pilot data.

Pilot: a read-only script over the local collector DB (`apps/server/data/ldc.sqlite`): 400 ranked games, 800 player-games per role, band 2 (Gold–Plat, 271 games) and band 3 (Emerald–Diamond, 129 games). "Win split" = win rate of games above the role median minus games below it, the same test as `metricImportance`. A large win split on a whole-game total means it follows the result. On an early metric, it means the habit matters.

| Field | Finding | Verdict |
| --- | --- | --- |
| `laneMinionsFirst10Minutes` | Dense for top, mid and bot (means 66 / 70 / 60). Bands 2→3: +3.8 / +4.6 / +3.2. Win split 0.08–0.13. | **Good**, early. Not for support or jungle. |
| `jungleCsBefore10Minutes` | Jungle mean 62; bands 2→3 +3.9. Zero for laners except lane-swap games. | **Good**, jungle only. |
| `takedownsFirstXMinutes` | Our config labels it "before 10 min". Riot doesn't document X. Win split 0.21–0.25 in every role. | Good, early, but **X is unverified**. |
| `earlyLaningPhaseGoldExpAdvantage`, `laningPhaseGoldExpAdvantage` | **0/1 flags** (lead of 20%+ gold and XP over the lane opponent at about 7 / 14 min; [darkintaqt](https://challenges.darkintaqt.com/challenges), [TrueMain #1364](https://github.com/ilyanfraimbault/TrueMain/issues/1364)). Nonzero in only 7–19% of games. | **Bad as a goal**: no spread to set a target from. Replace with `laneGoldDiffAt14` (new). |
| `maxCsAdvantageOnLaneOpponent` | The **largest** lead at any point in the game; never negative (mean about 30 for every role, even supports). | Whole-game and one-sided. Avoid. Replace with `laneCsDiffAt10` (new). |
| `turretPlatesTaken` | Plates the player **took part in** (not team-identical: only 22 of 800 teams had all five players equal, yet top averages 10.4). Win split **0.49–0.63**, the highest of any early field. | Early (plates fall at 14 min), but shared with the team and closely tied to winning lane. Usable for top, mid and bot, ranked lower. |
| `killsOnLanersEarlyJungleAsJungler` | Jungle only (missing for other roles). Mean 1.2, win split 0.10. | Good, jungle early. |
| `initialCrabCount` | Jungle mean 0.97, almost always 0, 1 or 2; win split 0.05. | **Little spread.** Not a goal (keep as a tip). |
| `enemyJungleMonsterKills` | Jungle bands 2→3: 9.3→11.7, but win split 0.33. | Whole-game (confounded). Avoid. |
| `moreEnemyJungleThanOpponent` | **Broken values**: both junglers get about −43 to −53 (e.g. −53.0000000894). 0 for every non-jungler. | **Unreliable.** Avoid. |
| `killsOnOtherLanesEarlyJungleAsLaner` | Nonzero in only 6–23% of laner games. | Too sparse for a target. Avoid. |
| `getTakedownsInAllLanesEarlyJungleAsLaner` | 0 in about 99% of games (9 of 800 mids). | **Always 0 in practice.** Avoid. |
| `visionScorePerMinute` | Support 2.31 (bands 2→3: 2.23→2.46), jungle 0.87, laners 0.65–0.77. Win split ≤ 0.14. | Whole-game, but only weakly confounded here. Riot's formula discounts redundant and safe wards ([wiki](https://wiki.leagueoflegends.com/en-us/Vision_score)). Lower-ranked goal for supports. |
| `controlWardsPlaced` | Support 3.68, **bands 2→3: 3.28→4.50** (the largest relative rank gap in the pilot). Win split 0.04. Laners average 0.35–0.60. | **Best habit metric.** |
| `wardTakedowns` | Support 6.7, jungle 3.6 (bands 2→3: 3.31→4.26). Win split ≈ 0. | **Good habit** for support and jungle. |
| `visionScoreAdvantageLaneOpponent` | An unbounded ratio from −1 to 16.8, median 0. | Whole-game and unstable. Avoid. |
| `killParticipation` | Win split ≈ 0 in every role (a share, so losing teams aren't penalised). | Doesn't separate. Fine as a playstyle axis, not as a goal. |
| `dragonTakedowns`, `turretTakedowns`, `goldPerMinute`, `damagePerMinute`, `deathsByEnemyChamps`, deaths/min | Win split 0.3–0.7 (deaths −0.3 to −0.47). | **Whole-game (confounded).** Avoid as goals. |
| `wardTakedownsBefore20M`, `scuttleCrabKills`, `maxLevelLeadLaneOpponent`, support-quest fields | In the schema but **never present** in our 2026 games. | Don't rely on them. |
| `earlyDeaths` (ours, from the timeline) | Stamped by `deathsBefore()` when a timeline is fetched (collector with `earlyDeathsSec`, user sync). The local pilot DB was collected without it. | Good, early. Needs a timeline for every goal game. |

**Timeline fields available** (Riot schema, `EventsTimeLineDto` and `ParticipantFrameDto`): frames every 60 s with `minionsKilled`, `jungleMinionsKilled`, `totalGold`, `xp`, `level`, `position{x,y}`. Events carry `type`, `timestamp`, `participantId`, `creatorId`, `wardType`, `killerId`, `victimId`, `assistingParticipantIds`, `killerTeamId`, `monsterType`, `monsterSubType`, `buildingType`, `laneType`, `teamId`, `position`. **Today `summarizeTimeline` keeps only gold per minute, items and skills**, so every new metric below must be computed when the timeline is fetched (as `earlyDeaths` is) and stamped on the participant.

## 3. Goals per role

Phase key: **early** = measured by about 14 min, before most games are decided. **habit** = an action the player controls whatever the result. **whole-game (confounded)** = a total that mostly follows the result.

Rank notes follow the brief's split: **low = Iron–Gold**, **high = Platinum+**. Where the pilot has numbers, they compare our band 2 (Gold–Plat) with band 3 (Emerald–Diamond); we have no Iron–Silver or Master+ data yet. Everything else in the rank notes is coaching opinion.

### Top

| # | Goal (label) | Metric | Dir. | Phase | Computed |
| --- | --- | --- | --- | --- | --- |
| 1 | lane cs at 10 min | `challenges.laneMinionsFirst10Minutes` | higher | early | existing |
| 2 | deaths before 14 min | `earlyDeaths` | lower | early | existing |
| 3 | gold lead on your lane opponent at 14 min | `laneGoldDiffAt14` | higher | early | new |
| 4 | turret plates | `challenges.turretPlatesTaken` | higher | early | existing |
| 5 | control wards placed | `challenges.controlWardsPlaced` | higher | habit | existing |

1. **Lane CS at 10.** Minion kills drive both gold and XP. Minions killed is among the strongest per-player predictors in the [HUCAPP 2022](https://www.scitepress.org/Papers/2022/108959/108959.pdf) SHAP analysis, and gold at 15 is significant in [Applied Sciences 2025](https://www.mdpi.com/2076-3417/15/10/5241). The top role quest rewards lane farming ([Sheep Esports](https://www.sheepesports.com/articles/league-of-legends-introduces-role-quests-in-2026-all-rewards/en)). Pilot: rises with rank (65.3→69.0), low win split (0.08), so it measures skill, not the result.
   - Keep in mind: *Last-hit first, trade second: a lost minion wave costs more than a won trade.* · *Recall after crashing a wave into their tower, not mid-wave.* · *Use Teleport early to get back to lane fast and save the next wave.*
   - Rank: low elo, focus on clean last-hitting (opinion, [LoLTheory top](https://blog.loltheory.gg/how-to-play-top-lol/)). High elo, wave control (freeze, slow push) matters more ([WeCoach top](https://wecoach.gg/blog/article/best-league-of-legends-top-lane-guide), [BrokenBlade](https://aimlabs.com/courses/4qBvXtzyjCLj6P1U3BEiu2/lessons/396FG909okx7V58Wz938nz)).
2. **Early deaths.** Top is the most isolated lane; early deaths give away gold, plates and waves, and ganks are the main threat ([games.gg top](https://games.gg/league-of-legends/guides/league-of-legends-top-lane-guide/)). Counting only deaths before 14 avoids the end-of-game confound (deaths/min win split −0.38 in the pilot).
   - Keep in mind: *Ward river or tri-brush before you push past the middle of the lane.* · *If you can't see the enemy jungler, assume they're near your lane.* · *Recall before you're too low to fight one more trade.*
   - Rank: same advice everywhere. Low elo, more deaths come from chasing kills (opinion, [games.gg top](https://games.gg/league-of-legends/guides/league-of-legends-top-lane-guide/)).
3. **Gold lead at 14 (new).** Gold difference at 15 is one of the few significant predictors in [Applied Sciences 2025](https://www.mdpi.com/2076-3417/15/10/5241). [Dignitas](https://dignitas.gg/articles/how-to-measure-the-best-stats-for-performance-in-league-of-legends) calls GD@15 an easy read on early activity. It replaces Riot's 0/1 lane-lead flags with a number that has a spread. Caveat: matchup and jungle attention shape it (opinion; that's why it's ranked 3rd).
   - Keep in mind: *Trade when your wave is bigger than theirs.* · *Count plates: every plate is gold your opponent doesn't get.*
   - Rank: fits high elo better, where lanes are decided by small edges (opinion).
4. **Turret plates.** Early (plates fall at 14 min) and the field with the strongest win link in the pilot (0.51), but it counts plates the player helped with, so it's partly the team's work. Turrets are the top KPI in [Hojaji 2025](https://doaj.org/article/dc43dcec52764f6fbd06ce940fd9ae72).
   - Keep in mind: *After a kill or their recall, hit the tower before you back.* · *Void Grubs speed up tower damage: join the grub fight when your wave is pushed.*
   - Rank: low elo, players often recall or roam without taking free plates (opinion).
5. **Control wards.** Habit; top averages only 0.35 per game in the pilot, so one more ward is a cheap gain. See the vision evidence in section 1.
   - Keep in mind: *Buy one control ward on your first back and put it in river or tri-brush.*
   - Rank: mostly a low-elo goal; high-elo top laners already do it (opinion).

### Jungle

| # | Goal (label) | Metric | Dir. | Phase | Computed |
| --- | --- | --- | --- | --- | --- |
| 1 | jungle cs at 10 min | `challenges.jungleCsBefore10Minutes` | higher | early | existing |
| 2 | gank kills before 10 min | `challenges.killsOnLanersEarlyJungleAsJungler` | higher | early | existing |
| 3 | deaths before 14 min | `earlyDeaths` | lower | early | existing |
| 4 | early dragons, grubs and herald | `earlyEpicMonsterTakedowns` | higher | early | new |
| 5 | enemy wards cleared | `challenges.wardTakedowns` | higher | habit | existing |
| 6 | control wards placed | `challenges.controlWardsPlaced` | higher | habit | existing |

1. **Jungle CS at 10.** Farm is the jungler's main income. [dodge.gg](https://www.dodge.gg/en-US/lol/news/jungle-guide-2026) frames the role as a choice every 30 seconds between farming, ganking, objectives and invading; [WeCoach](https://wecoach.gg/blog/article/how-to-play-jungle-in-league-of-legends) gives a full six-camp clear as the standard. Pilot: rises with rank (61.1→65.1), low win split (0.09).
   - Keep in mind: *Finish your full clear before ganking unless a lane is clearly gankable.* · *Never walk past a camp that's up: take it on the way.* · *If a gank fails, go straight back to farm.*
   - Rank: low elo, too many forced ganks and too little farm ([Mobalytics low-elo jungle](https://mobalytics.gg/blog/lol-how-to-climb-low-elo-jungler/), opinion). High elo, farm is the baseline and tempo decides (opinion).
2. **Gank kills before 10.** Early pressure is the role's purpose. The pro edge in [SIDO](https://arxiv.org/html/2403.04873v1) is gold denied to enemies at 7–15 min, and gank kills are the countable piece of that. Pilot: rises with rank (1.14→1.29), win split 0.10.
   - Keep in mind: *Gank when two of these hold: enemy pushed, no flash, no ward, your laner has CC.* · *Come from behind the enemy, not up the lane.* · *Gank level 3, level 6 or right after your first item.*
   - Rank: low elo, gank the lane that's winning or has CC rather than the one crying (opinion, [games.gg jungle](https://games.gg/league-of-legends/guides/league-of-legends-jungle-guide/)). High elo, gank timing follows enemy tracking and the enemy jungler's position (opinion).
   - Caveat: small counts (often 0–2); the target step should stay small.
3. **Early deaths.** Dying early as a jungler loses farm, a camp timer and objective control.
   - Keep in mind: *Track the enemy jungler: if you saw them top, path bot.* · *Don't invade without lane priority from the nearby laners.*
4. **Early objectives (new).** Turrets and dragons dominate win prediction ([Hojaji 2025](https://doaj.org/article/dc43dcec52764f6fbd06ce940fd9ae72), [Junior & Campelo](https://arxiv.org/pdf/2309.02449)), and higher-skilled players spend more time near objectives (Hojaji). Whole-game `dragonTakedowns` follows the result (win split 0.60), so this counts only before 14 min.
   - Keep in mind: *Ward the next objective 60 s before it spawns.* · *Start dragon or grubs only when your nearby lanes can move first.* · *Keep Smite up for the objective.*
   - Rank: low elo, many dragons go uncontested; take them (opinion). High elo, trade objectives across the map (opinion).
5. **Ward clearing.** Habit; win split ≈ 0 in the pilot, yet it rises with rank (3.31→4.26). Denying vision also adds to vision score ([wiki](https://wiki.leagueoflegends.com/en-us/Vision_score)).
   - Keep in mind: *Swap to sweeper once your early ganks are done.* · *Sweep the objective area before a fight.*
6. **Control wards.** Habit (bands 2→3: 0.95→1.13).
   - Keep in mind: *Put a control ward on your side of the next objective.*

### Middle

| # | Goal (label) | Metric | Dir. | Phase | Computed |
| --- | --- | --- | --- | --- | --- |
| 1 | lane cs at 10 min | `challenges.laneMinionsFirst10Minutes` | higher | early | existing |
| 2 | deaths before 14 min | `earlyDeaths` | lower | early | existing |
| 3 | takedowns before 10 min | `challenges.takedownsFirstXMinutes` | higher | early | existing |
| 4 | gold lead on your lane opponent at 14 min | `laneGoldDiffAt14` | higher | early | new |
| 5 | turret plates | `challenges.turretPlatesTaken` | higher | early | existing |
| 6 | control wards placed | `challenges.controlWardsPlaced` | higher | habit | existing |

1. **Lane CS at 10.** Same evidence as top. Mid shows the largest rank gap in the pilot (68.6→73.1). The mid role quest rewards lane play too.
   - Keep in mind: *Shove the wave before you roam so you lose no minions.* · *Use the cannon wave timing to recall.*
   - Rank: low elo, roam less and farm more until CS is solid (opinion, [LoLTheory roaming](https://blog.loltheory.gg/roaming-lol/)).
2. **Early deaths.** Mid is in reach of both junglers; dying gives the enemy mid free roams.
   - Keep in mind: *Keep a ward on one side of mid and play toward it.* · *When their jungler is missing, stop pushing past half the lane.*
3. **Takedowns before 10.** Captures roams and skirmishes, the mid laner's map impact ([Mobalytics mid](https://mobalytics.gg/blog/lol-4-tips-to-impact-the-map-as-the-mid-laner/)). We use it instead of `killsOnOtherLanesEarlyJungleAsLaner` because that field is too sparse (nonzero in 23% of games). Pilot: rises with rank (4.29→4.69), win split 0.21.
   - Keep in mind: *Roam right after you push or kill your laner, never mid-wave.* · *Roam to lanes with CC or kill pressure; skip lanes that can't follow.*
   - Rank: high elo, roam timing and following the jungler matter more; low elo, CS first (opinion).
4. **Gold lead at 14 (new).** As for top.
5. **Turret plates.** As for top; mid's tower is the shortest walk for plates.
6. **Control wards.** Habit (mean 0.60).
   - Keep in mind: *Keep one control ward in a mid-lane side brush or river.*

### Bottom

| # | Goal (label) | Metric | Dir. | Phase | Computed |
| --- | --- | --- | --- | --- | --- |
| 1 | lane cs at 10 min | `challenges.laneMinionsFirst10Minutes` | higher | early | existing |
| 2 | deaths before 14 min | `earlyDeaths` | lower | early | existing |
| 3 | cs lead on your lane opponent at 10 min | `laneCsDiffAt10` | higher | early | new |
| 4 | turret plates | `challenges.turretPlatesTaken` | higher | early | existing |
| 5 | takedowns before 10 min | `challenges.takedownsFirstXMinutes` | higher | early | existing |

1. **Lane CS at 10.** An ADC is the role most built on farm. [games.gg ADC](https://games.gg/league-of-legends/guides/league-of-legends-adc-guide/): "losing a few CS is better than dying". Bot role quest rewards (extra item slot) come from lane farm ([Sheep Esports](https://www.sheepesports.com/articles/league-of-legends-introduces-role-quests-in-2026-all-rewards/en)). Pilot: 58.7→61.9.
   - Keep in mind: *Under tower: let the tower hit melee minions twice, then last-hit; hit casters once first.* · *Crash the wave before you recall.*
   - Rank: low elo, CS is the biggest gap (opinion, [Mobalytics low-elo ADC](https://mobalytics.gg/blog/lol-how-to-climb-in-low-elo-adc/)).
2. **Early deaths.** A 2v2 plus the jungler means bot gets ganked most; deaths there also give dragon to the enemy.
   - Keep in mind: *Don't trade when their wave is bigger: minion aggro hurts.* · *Stand behind your minions against hooks and skillshots.*
3. **CS lead at 10 (new).** This is CSD@10, the classic laning stat. It separates "farmed well" from "farmed well in an easy lane". Replaces `maxCsAdvantageOnLaneOpponent` (one-sided max).
   - Keep in mind: *Punish their last hits with an auto when your support zones them.*
4. **Turret plates.** Pilot win split 0.62 for bottom, the highest of any lane.
   - Keep in mind: *After a won fight or a dragon, hit plates before you back.*
5. **Takedowns before 10.** Early 2v2 kills.
   - Keep in mind: *Fight when your support's engage and your level spike line up.*
   - Rank: high elo, focus on level 2 and level 6 timings (opinion).

### Utility (support)

| # | Goal (label) | Metric | Dir. | Phase | Computed |
| --- | --- | --- | --- | --- | --- |
| 1 | control wards placed | `challenges.controlWardsPlaced` | higher | habit | existing |
| 2 | wards placed before 14 min | `wardsPlacedBefore14` | higher | early | new |
| 3 | enemy wards cleared | `challenges.wardTakedowns` | higher | habit | existing |
| 4 | deaths before 14 min | `earlyDeaths` | lower | early | existing |
| 5 | vision score per minute | `challenges.visionScorePerMinute` | higher | whole-game (confounded) | existing |

1. **Control wards.** The clearest rank gap in the pilot (Gold–Plat 3.28 vs Emerald–Diamond 4.50 per game, +37%) and no win split (0.04): a skill habit, not a by-product of winning. Vision control is half of the support role in every coaching source ([WeCoach support](https://wecoach.gg/blog/article/all-you-need-to-know-about-support-coaching-in-league-of-legends), [Mobalytics warding](https://mobalytics.gg/blog/lol-warding-guide/)). Supports' 2026 rewards include a control-ward slot ([Sheep Esports](https://www.sheepesports.com/articles/league-of-legends-introduces-role-quests-in-2026-all-rewards/en)).
   - Keep in mind: *Buy a control ward on every back.* · *Place it where you'll fight next: dragon pit edge or river bush.* · *A control ward in your inventory gives no vision: place it.*
   - Rank: low elo, the habit itself is the win; high elo, placement and timing (opinion, [LoLTheory](https://blog.loltheory.gg/vision-score-lol/)).
2. **Wards before 14 (new).** Vision placed early, before the result shows. This avoids the winning-team bias of end-of-game vision score ([WARDS paper](https://gdlt.sdu.dk/wp-content/uploads/2022/06/White-Paper_Dispersing-the-fog-of-war_-A-new-approach-to-ward-evaluation-in-MOBAs-.pdf)).
   - Keep in mind: *Use your support item's wards right away.* · *Ward river before the enemy jungler's first gank (about 3:00).*
3. **Ward clearing.** Habit (bands 2→3: 6.50→7.11; win split 0.01).
   - Keep in mind: *Swap to sweeper once your support item's quest is done.* · *Sweep before dragon, not during it.*
4. **Early deaths.** Supports die early while roaming and warding alone ([Mobafire support tips](https://www.mobafire.com/league-of-legends/blog/ch33syb0y8/15-tips-for-supports): roam only when it is safe).
   - Keep in mind: *Ward from behind your team's side of the river, not deep alone.* · *Roam only when your ADC can stay safe without you.*
   - Rank: 26.16 penalises heavy early support roaming ([Riot](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes)). Low elo, roam less (opinion).
5. **Vision score per minute.** The familiar number (bands 2→3: 2.23→2.46), but a whole-game total biased toward the winning team ([WARDS](https://gdlt.sdu.dk/wp-content/uploads/2022/06/White-Paper_Dispersing-the-fog-of-war_-A-new-approach-to-ward-evaluation-in-MOBAs-.pdf)) that rewards activity over quality ([Dignitas](https://dignitas.gg/articles/how-to-measure-the-best-stats-for-performance-in-league-of-legends)). Keep it last; use only when the habits above are already at target.
   - Keep in mind: *Wards in unwarded spots score more than wards next to others.*

**Not proposed for support:** `takedownsFirstXMinutes` and roaming metrics. They rise with rank in the pilot (5.75→6.19), but 26.16 now penalises heavy early support roaming, so a "higher is better" goal would push against the game. They could become playstyle context.

## 4. Metrics to avoid as goals

| Metric | Why not |
| --- | --- |
| Kills, deaths, KDA, `deathsByEnemyChamps`, deaths/min | Follow the result (deaths/min win split −0.38). KDA "does not tell the full story" ([Dignitas](https://dignitas.gg/articles/how-to-measure-the-best-stats-for-performance-in-league-of-legends)). Use `earlyDeaths`. |
| `goldPerMinute`, `damagePerMinute`, `csPerMinute` (whole game) | Follow the result (win split 0.13–0.41). Damage depends on the champion (Dignitas: Karthus vs Galio). |
| `teamDamagePercentage`, `enemyChampionImmobilizations`, `soloKills`, `ccPerMinute` | Set by the champion's kit, not a habit (enemyChampionImmobilizations: support 38 vs ADC 9). Playstyle axes only. |
| `dragonTakedowns`, `riftHeraldTakedowns`, `baronTakedowns`, `turretTakedowns`, `objectiveDamagePerMinute` | Whole game, so they follow the winner (dragon/turret win split 0.48–0.73). Use `earlyEpicMonsterTakedowns`. |
| `killParticipation` | No win split in any role. A good playstyle descriptor, not a goal. |
| `earlyLaningPhaseGoldExpAdvantage`, `laningPhaseGoldExpAdvantage` | 0/1 flags; there's no target to step toward. |
| `maxCsAdvantageOnLaneOpponent` | A max over the whole game, never negative. |
| `visionScoreAdvantageLaneOpponent` | Unbounded ratio (up to 16.8), whole-game. |
| `moreEnemyJungleThanOpponent` | Values look broken (−43 to −53 for both junglers). |
| `initialCrabCount` | Little spread (0–2; mean 0.97). |
| `killsOnOtherLanesEarlyJungleAsLaner`, `getTakedownsInAllLanesEarlyJungleAsLaner` | Mostly 0. |
| `enemyJungleMonsterKills` | Rises with rank, but whole-game and win split 0.33. |
| Support `laneMinionsFirst10Minutes` / CS | Set by role-quest rules (patch 26.16), not skill. |
| `wardTakedownsBefore20M`, `scuttleCrabKills`, `maxLevelLeadLaneOpponent`, support-quest fields | In the schema, never in our 2026 data. |

**Changes implied for the current config** (for the owner, not done here): `growth.metrics` in `config/engine.v1.json` includes `initialCrabCount` (no spread). It also includes `turretPlatesTaken` and `visionScorePerMinute` as candidates for every role. The proposal limits each one to the roles where it fits.

## 5. New metrics (from the timeline)

Indexes: `frames[n]` is the frame at minute n (Riot frames come every 60,000 ms). `me` is the player's `participantId`. "Lane opponent" means the enemy participant with the same `teamPosition`: only their **anonymous numbers in this game** are used, as Riot's own `…LaneOpponent` challenges do. Skip the metric when the game has no such frame or no unique opponent (remakes, swaps).

| Metric | Computation | Roles | Used as goal |
| --- | --- | --- | --- |
| `laneCsDiffAt10` | `frames[10].participantFrames[me].(minionsKilled + jungleMinionsKilled)` minus the same for the lane opponent | top, middle, bottom | bottom |
| `laneGoldDiffAt14` | `frames[14].participantFrames[me].totalGold` minus the lane opponent's | top, middle, bottom | top, middle |
| `wardsPlacedBefore14` | Count `WARD_PLACED` events with `creatorId == me`, `timestamp < 840000`, `wardType` in {`YELLOW_TRINKET`, `SIGHT_WARD`, `CONTROL_WARD`, `BLUE_TRINKET`} (excludes `UNDEFINED` and `TEEMO_MUSHROOM`) | utility, jungle | utility |
| `earlyEpicMonsterTakedowns` | Count `ELITE_MONSTER_KILL` with `timestamp < 840000`, `monsterType` in {`DRAGON`, `HORDE`, `RIFTHERALD`}, `killerTeamId == my team` and `killerId == me` or `me` in `assistingParticipantIds`. **Verify** that `assistingParticipantIds` is filled on these events; fallback: my `position` in the nearest frame within 2,000 units of the event `position` | jungle, utility | jungle |
| `wardsKilledBefore14` | Count `WARD_KILL` with `killerId == me` and `timestamp < 840000` | utility, jungle | none (early twin of `wardTakedowns`) |
| `jungleCsAt4` | `frames[4].participantFrames[me].jungleMinionsKilled` (did the first full clear finish; six camps ≈ 24 CS per [dodge.gg](https://www.dodge.gg/en-US/lol/news/jungle-guide-2026)) | jungle | none (descriptive) |
| `firstBackSec` / `firstBackGold` | First `ITEM_PURCHASED` by `me` after 90,000 ms that doesn't follow my own death (`CHAMPION_KILL` with `victimId == me`) within 60 s; gold = sum of Data Dragon `gold.total` for purchases within 20 s of it, minus `ITEM_UNDO`. Approximate: there's no recall event | top, middle, bottom, utility | none (direction unclear: an early low-HP back can be right) |
| `jungleLanePresenceBefore10` | Frames 3–10 where my `position` is within 2,000 units of an allied laner's `position` (minute granularity, so coarse) | jungle | none (descriptive) |
| `supportAwayFromBotBefore14` | Frames 3–14 where my `position` is more than 3,000 units from my bot laner's | utility | none: context only, given patch 26.16 |

Timeline frames are a minute apart, so position-based metrics are rough: fine for "how often", not "when exactly".

## 6. Notes on rank

- **The pilot covers only Gold–Plat vs Emerald–Diamond.** The gaps are modest (+3–5 lane CS at 10, +1.2 support control wards, +1 jungle ward clear). We have no Iron–Silver or Master+ data, so the low/high notes above are coaching opinion unless they quote the pilot.
- **Targets come from the band (hard constraint 3).** The app's step toward the band's typical value (`growth.targetStep`) already adapts per rank, so no fixed numbers are needed here. Guide benchmarks disagree (section 1) and aren't used.
- **Low elo (Iron–Gold), opinion:** basics first: lane CS, early deaths, buying and placing control wards. Our view: low-elo games are lost more to deaths and missed farm than to macro.
- **High elo (Platinum+), opinion:** lane-opponent diffs (`laneCsDiffAt10`, `laneGoldDiffAt14`), early objectives and ward clearing become the better separators, because most players already farm and ward.

## 7. Summary

1. Strongest: early lane CS (`laneMinionsFirst10Minutes`, `jungleCsBefore10Minutes`) and support control wards rise with rank in our pilot and barely track the result, so they measure skill. That makes them the best first goals.
2. Strongest: whole-game totals (dragons, turrets, gold/min, deaths/min) track the result 3–7 times more than early metrics; the pilot confirms the outcome confound from the literature, so keep them out of the goal pool.
3. Field issues: all 29 fields exist, but several make poor goals: 0/1 flags (`laningPhaseGoldExpAdvantage`), one-sided maxima (`maxCsAdvantageOnLaneOpponent`), broken values (`moreEnemyJungleThanOpponent`), no spread (`initialCrabCount`).
4. Uncertainty: no published study ranks per-role habits for solo queue. Our ranking rests on a 400-game pilot (bands 2–3 only) plus coaching opinion; re-run on the production DB per role and band before shipping.
5. Uncertainty: `takedownsFirstXMinutes`'s X is undocumented. `turretPlatesTaken` is shared credit. 2026 role quests (support roaming penalties in 26.16) may shift support metrics patch by patch.

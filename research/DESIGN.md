# Phase 4 — Coaching design

Goal: a "pro player friend" that knows **your** playstyle and pool, reads the **current meta in your rank**, and advises picks, bans, runes and items, **always explaining why**; recommends **new champions** that fit you; and makes **growth** visible.

Design principles (all from the spec or Phase 3):

1. **Rules and statistics before ML.** Every number shown can be traced to counted games. (Benchmark lesson: complex models add little; DraftGap shows additive statistics work.)
2. **Pure engine.** All logic below lives in `packages/engine` as pure functions; inputs are plain data, weights and thresholds are in `config/engine.v2.json`.
3. **Never hardcode game data.** Roles, items, runes, champion traits come from Data Dragon, the LCU/CommunityDragon game-data files, and our collector.
4. **"Not enough data" beats a guess.** Every statistic carries its sample size; below a config minimum it's hidden.
5. **Only you.** Other players appear only as anonymous aggregates (band statistics, or the other nine participants of *your* games as a baseline). No names, no per-person stats. Compliance boundary unchanged.

---

## 1. Inputs and outputs

### Inputs

| Input | Shape (TypeScript, abbreviated) | Source | Refresh |
| --- | --- | --- | --- |
| Draft | `DraftState` (existing, sanitised) | LCU WebSocket | live |
| Pickable champions | `ChampionId[]` | LCU | per champ select |
| Your games | `PlayerGameV2[]` — existing `PlayerGame` + `kills, deaths, assists, cs, gold, visionScore, durationSec, items[], perks, spells[], challenges: Partial<Record<string, number>>`, `laneOpponentChampionId` | Match-V5 (your matches only) | new games every session |
| Your timelines (optional) | per game: CS/gold/XP at 10 and 15 min, item purchase order, skill order | Match-V5 timeline | lazily, last 50 games |
| Your mastery | `MasteryEntry[]` (existing) | Champion-Mastery-V4 | per session |
| Your rank / band | tier → band (existing) | LCU / League-V4 | per session; daily snapshot for growth |
| Champion traits | `ChampionTraits { id, riot: { roles[], damageType, attackType, difficulty, style, damage, durability, crowdControl, mobility, utility, tagPrimary, tagSecondary }, measured: ChampionAttributes + powerCurve }` | LCU `/lol-game-data/assets/v1/champions/{id}.json` or CommunityDragon (Riot ratings) + collector (measured) | per patch |
| Meta tables | `ChampionRoleStats { championId, role, band, games, wins, picks, bans }`, `MatchupStats { a, roleA, b, roleB, band, games, wins }`, `DuoStats` (same shape, allies), `BuildStats` (rune pages, item sequences, spells, skill orders with games/wins), `MetricReference` (per role & band: percentiles of each playstyle metric), `MetricImportance` (per role & band) | Collector | hourly |
| Items/runes catalogue | Data Dragon `item.json`, `runesReforged.json`, `summoner.json` | Data Dragon | per patch |
| Live game (in-game only) | `allgamedata` (champions, items, levels, scores; only what the client shows) | Live Client Data API | every ~5 s in game |
| Advice log | `AdviceRecord { gameId, shown: Recommendation[], picked, followed, result }` | our server | per game |

### Outputs

| Output | When | Shape |
| --- | --- | --- |
| Ban suggestions | ban phase | top 3 `{ championId, threat, reasons[] }` |
| Pick suggestions | pick phase, live | top 3 `Recommendation { championId, expectedWin, terms: Term[], confidence: "clear" \| "close" \| "thin", reasons: Reason[], whyNot?: Reason }` |
| Loadout | after lock-in (hover too) | `{ runes: RunePage + reasons, spells, skillOrder, starting, core[], situational[] (each with reason) }` |
| Live item advice | in game | next-item category + reason |
| Playstyle card | lobby / profile | 8 axes `{ score 0–100, n, sentence }` |
| Pool view | lobby / profile | tiers (core / secondary / learning / dormant) + coverage holes per role |
| New champions | profile | top 3 per role `{ championId, fit, reasons[], firstGamesPlan }` |
| Growth | post-game, profile | current focus `{ metric, you, band median, target, progress }`, history, monthly report |

---

## 2. Playstyle profiling

### Axes

Each axis is the mean of **percentiles** of a few metrics, compared to a **reference distribution for the same role and band**. Until the collector exists, the reference is the other participants in the same role from the player's own games (their lane opponents) — same elo, same patches, anonymous. Every metric is optional (A7): an axis needs ≥ 2 of its metrics present.

| Axis | Metrics (Match-V5 `participants[*]` / `challenges.*`) | Sentence template (example) |
| --- | --- | --- |
| **Early pressure** | `challenges.takedownsFirstXMinutes`, `earlyLaningPhaseGoldExpAdvantage`, `laningPhaseGoldExpAdvantage`, `maxCsAdvantageOnLaneOpponent`, `turretPlatesTaken`; jungle: `killsOnLanersEarlyJungleAsJungler`, `initialCrabCount`, `enemyJungleMonsterKills` | "You play for an early lead: top {pct}% of {role} players in your rank at gold/XP lead by 14 min." |
| **Fighting** | `challenges.killParticipation`, `teamDamagePercentage`, `damagePerMinute`, `soloKills` | "You're in most fights: {kp}% kill participation." |
| **Farming** | (`totalMinionsKilled` + `neutralMinionsKilled`)/min, `challenges.laneMinionsFirst10Minutes`, `jungleCsBefore10Minutes`, `goldPerMinute` | "Your farming is {below/around/above} your rank: {cs10} CS at 10 vs {median}." |
| **Vision** | `challenges.visionScorePerMinute`, `controlWardsPlaced`, `wardTakedowns`, `visionScoreAdvantageLaneOpponent` | |
| **Risk control** (inverse of deaths) | deaths/min, `deathsByEnemyChamps`, `survivedSingleDigitHpCount` (lower weight) | "You die less than most: {d} deaths per game vs {median}." |
| **Objectives** | `dragonTakedowns`, `riftHeraldTakedowns`, `baronTakedowns`, `turretTakedowns`, `damageDealtToObjectives`/min | |
| **Roaming / map** | `challenges.killsOnOtherLanesEarlyJungleAsLaner`, `getTakedownsInAllLanesEarlyJungleAsLaner`, jungle: `moreEnemyJungleThanOpponent` | |
| **Playmaking (CC)** | `timeCCingOthers`/min, `challenges.enemyChampionImmobilizations`, `pickKillWithAlly` | |

Plus two **preference** descriptors (what you choose, not how well you play):

- **Champion taste vector**: comfort-weighted mean of the `ChampionTraits` of champions you play (e.g. "mobile, physical, melee skirmishers; you avoid immobile mages").
- **Game-length tendency**: your smoothed win rate in short (< `shortGameMin`) vs long (> `longGameMin`) games, and the average power curve of your pool. "You win early games (61%) far more than long ones (44%)."

### Computation

```
percentile(metric value of game g) vs reference[role][band][metric]       (empirical CDF)
axisGame(g)   = mean of available metric percentiles                         (≥ minMetrics)
axis(player)  = recency-weighted mean over games in that role (half-life from config)
shown         = round(100 · axis), with n = number of games; hidden if n < minGamesPerRole
```

Per role, because a support's farming is not a mid's. The card shows the player's main role by default with a role switcher.

**Why percentiles, not z-scores or ML:** robust to skew (kills are skewed), bounded 0–100, explainable as "top X%".

---

## 3. Champion-pool model

Builds on existing `computeComfort` (skill + form). Adds classification and coverage.

| Tier | Rule (config thresholds) | Shown as |
| --- | --- | --- |
| **Core** | comfort ≥ `pool.coreMin` and weighted games in role ≥ `pool.coreGames` | "Main" |
| **Secondary** | comfort ≥ `pool.secondaryMin` | "Comfortable" |
| **Learning** | first game within `pool.learningWindowDays` and games < `pool.coreGames` | "Learning" (protected from penalties: see §4 personal term) |
| **Dormant** | mastery ≥ `pool.dormantMastery` but no game in `pool.dormantDays` | "Rusty" |

**Coverage**: for each role, test whether at least one Core/Secondary champion "covers" each draft need. Needs are computed from `ChampionTraits` (measured first, Riot ratings as fallback):

| Need | Covered when a pool champion has | Hole message |
| --- | --- | --- |
| Magic damage | `magicShare ≥ coverage.damageShare` | "No AP option in your {role} pool" |
| Physical damage | `physicalShare ≥ coverage.damageShare` | |
| Frontline | `frontline ≥ teamNeeds.frontlineThreshold` | |
| Engage | `engage ≥ teamNeeds.engageThreshold` | |
| Blind-pick safety | low matchup variance (§4 blind safety) in the band | "No safe blind pick: you often have to pick first" |
| Early / late | power curve slope sign | "All your picks scale; nothing to punish early" |

Hole **importance** is measured from your own games where possible: share of your losses where the team lacked that need (e.g. "your team had < 20% magic damage in 4 of your last 10 losses"). This links the advice to your experience.

---

## 4. Meta-weighted recommendation

### Model: additive ratings (Elo / log-odds), à la DraftGap

Work in **rating points**: `rating(w) = −400·log10(1/w − 1)`, `win(r) = 1 / (1 + 10^(−r/400))`. Ratings add up; each term is a **delta over what was already expected**, so nothing is double-counted. Smoothing: shrink observed wins toward the *expected* win rate with `k` prior games (config per term, "risk level").

For candidate `c` in role `r`, band `b`, enemies `E`, allies `A`:

| Term | Definition | Data | Existing factor it replaces |
| --- | --- | --- | --- |
| `meta` | `rating(smoothed WR of c in r,b)` (prior: c's WR over all bands/longer window) | ChampionRoleStats | `metaStrength` (null today) |
| `lane` | for the revealed enemy in `r`: `rating(smoothed matchup WR) − expected`, expected = `meta_c − meta_e` | MatchupStats | `laneMatchup` |
| `counter` | Σ over other revealed enemies of the same delta, × `counter.weight` (< 1: cross-lane effects are weaker) | MatchupStats (any role pair) | `counterValue` |
| `synergy` | Σ over allies of duo delta | DuoStats | *new* |
| `team` | team-needs score (existing `scoreTeamNeeds`) mapped to rating: `(score − 0.5) · team.ratingScale` | ChampionTraits | `teamNeeds` |
| `personal` | `rating(your smoothed WR on c in r) − rating(band WR of c in r)` blended with comfort; **unfamiliarity penalty** `−personal.learningPenalty · e^(−games/personal.learningScale)` | your games + mastery | `comfort` |

```
total(c)       = Σ_term weight_band[term] · term(c)
expectedWin(c) = win(total(c))                (shown as "≈ 54% in this draft")
```

Band weights stay in config (`bands.{id}.{term}`), so the spec's "weights per rank band" survives. Lower bands weight `personal` higher (comfort matters more at Gold than meta), matching the current v1 numbers' intent.

**Why replace the weighted average of 0–1 factors?** Today's `combineFactors` averages incomparable 0–1 scores; a "0.7 comfort" and "0.7 team needs" aren't the same size of advantage. Ratings put every factor on one scale (win-rate points), so (a) the total is a predicted win chance, (b) each reason can say "+2.3%", (c) the "why not X" diff is meaningful. Migration: keep `FactorScores` for the UI bars (map each term to 0–1 via `win(term)`), add `terms` with deltas.

### Pick-order awareness

Known from `DraftState.actions` + local cell: how many enemy picks are still to come, and whether the lane opponent is revealed.

- **Lane opponent unknown ("blind")**: `lane` = expected delta over the band's pick-rate distribution of champions in role `r` (excluding banned/taken), and `blindRisk` = the 20th-percentile delta. Score uses `lane_expected − blind.riskAversion · max(0, −blindRisk)`. Reason: "Safe blind: no common counter worse than −2%."
- **Revealed**: exact `lane` term. Reason: "Counters {enemy}: +3.1% vs the normal matchup (1,240 games)."
- **Last pick**: `counter` weight raised by `pickOrder.lastPickCounterBoost`.

### Ban suggestions

For each champion `e` that the enemy could plausibly pick in any role (pick rate ≥ `bans.minPickRate` in the band):

```
threat(e) = pickRate(e) · max(0, −Δ(e vs your top-3 likely picks in your role))  +  bans.metaWeight · max(0, meta(e))
```

Excludes champions allies are hovering (visible to you) and your own pool's Core picks. Reasons: "Banned for you: Zed beats 2 of your 3 mid picks (−4% avg) and is picked in 9% of games."

### Loadout (runes, spells, skill order, items)

Source: collector `BuildStats` for (champion, role) in your band **plus the band above** (spec: builds from band + one above).

| Choice | Rule | Explanation template |
| --- | --- | --- |
| Rune page | Among pages with pick share ≥ `builds.minShare`, highest smoothed WR (prior = champion WR). If the lane matchup has ≥ `builds.minMatchupGames`, use matchup-conditioned page. | "Most successful page in Gold–Emerald ({n} games, {wr}%)." / "Into {enemy}: players switch to {keystone} ({lift}× more often) and win {wr}%." |
| Each rune (chips) | **Situational lift**: how much more often a rune is picked when the enemy has trait T (high magic share, high burst, healing) vs not. | "Bone Plating: taken 2.1× more vs burst lanes; Zed is 92% physical burst." |
| Spells | Most picked pair with WR guard (same rule). | |
| Skill order | Most common max order from timelines (`SKILL_LEVEL_UP` events). | |
| Starting items, core | Most common first-completed 2–3 legendary sequence; "completed item" = Data Dragon item with no `into` and cost ≥ `items.legendaryMinGold` (derived, not listed). | "Core: {a} → {b}; {n} games, {wr}%." |
| Situational items | Same **lift** method on items vs enemy traits (heals: measured `effectiveHealAndShielding`/`totalHeal` per champion; magic share; frontline). | "Mortal Reminder: bought 3× more vs heavy healing; enemy Soraka + Aatrox heal for 30% of their damage." |

The lift method finds anti-heal, MR, armour answers **from data** without listing them in code — compliant with no-hardcoding, and automatically right after item reworks.

### Live item adjustments (in game)

From the Live Client Data API (only what the client shows): enemy items and scores → enemy damage profile weighted by each enemy's gold proxy (item value from Data Dragon + kills). Rule: if the profile shifts so that the highest-lift situational item changes vs the pre-game plan, suggest it as the next item with reason "Enemy {champ} is ahead (3/0, 2 items) and 85% of their team's item gold is physical → armour next." No enemy cooldowns, no hidden info.

---

## 5. Explain-why layer

```
Term     { name, delta (rating), deltaWin (percentage points), evidence: { games, value, baseline, source } }
Reason   { templateId, slots: Record<string, string | number>, weight = |deltaWin| }
```

1. Every term produces 0–2 reasons with its evidence. Reasons below `explain.minDeltaWin` (e.g. 0.5 pp) or with games < minimum are dropped.
2. Sort by weight; show the top `explain.maxReasons` (3). Positive first, then the biggest negative as a caveat ("but: −2% into Teemo").
3. **Why not X**: X = your highest-comfort champion for the role if it isn't #1. Diff the terms of #1 and X; the largest positive difference becomes "Picked over your {X} because …".
4. **Confidence** (replaces Jev's confidence in the UI, D10):
   - `thin` if the top term's evidence has < `explain.minGames`;
   - `clear` if `expectedWin(#1) − expectedWin(#2) ≥ explain.clearGap`;
   - else `close`.
5. **Templates** live in a versioned file (`config/explain.v1.json` with ids → English strings), filled only from term slots → can't invent numbers.
6. **Optional LLM rewording** (later): send the structured reasons, not raw data; after the response, **verify** every number in the output appears in the input slots (regex extract) — otherwise show the template text. Cache by draft hash.

---

## 6. New-champion recommender

### Candidates
Champions not in your pool for role `r` (games in role < `newChamps.maxGames`, mastery < `newChamps.maxMastery`), that are **meta in role `r`** (existing `roleFit` = "meta"), and owned or not (owned flagged; unowned is fine: "costs 6300 BE").

### Score
```
fit(c) = w.similarity · cos(traits(c), tasteVector(r))        // plays like what you like
       + w.gap        · holeFill(c, pool(r))                   // covers a hole from §3
       + w.meta       · win(meta(c, r, b)) normalised           // strong in your rank now
       + w.ease       · (1 − difficulty(c)/maxDifficulty)       // Riot's difficulty rating
       + w.style      · styleMatch(c, playstyle axes)           // e.g. high Early pressure → early power curve
       − w.overlap    · max cos(traits(c), traits(p)) for p in Core   // don't suggest a clone of your main
```
`traits` vector = Riot ratings (damage, durability, crowdControl, mobility, utility, difficulty, style; damageType & attackType one-hot; tags one-hot) + measured (magic share, frontline, engage, power-curve slope), each standardised across all champions. `tasteVector` = comfort-weighted mean of Core/Secondary traits in that role.

`styleMatch` rules (config, small and explicit), e.g. Early pressure ≥ 70 → prefer negative power-curve slope; Roaming ≥ 70 → prefer mobility; Risk control ≤ 30 → prefer durability/escape.

### Output
Top 3 per role, each with reasons (templated): "Plays like your Viego (mobile, physical skirmisher)", "Adds the AP damage your jungle pool lacks", "Strong in Gold–Plat right now (52.4%, 9,800 games)", "Moderate difficulty". Plus a **first games plan**: "Try it in 3–5 Normal Draft games; build {core}; your focus: {growth focus}". The recommender never suggests more than one new champion per role while one is in "Learning".

### Learning follow-up
Once you play it, it's tracked as "Learning": the coach shows your form vs the band's early-games-on-champion baseline, and graduates it to Secondary/Core by the §3 rules.

---

## 7. Growth tracking

| Piece | Rule |
| --- | --- |
| **Snapshots** | After each new game: recompute axes over the last `growth.window` (20) games in that role; store `{date, axis values, rank}`. Daily League-V4 rank snapshot. |
| **Focus selection** | Candidate metrics = those measurable from one game (prefer `challenges`/summary fields; timeline ones when fetched). `impact(m) = max(0, bandMedian(m) − you(m)) / spread(m) · importance(m, role, band)`. `importance` = how strongly the metric separates wins from losses in the band (collector: difference in win rate between top and bottom halves of the metric, per role — a simple measured number). Pick the top metric on your **main champion & role**. |
| **Target** | `you + growth.targetStep · (bandMedian − you)` (e.g. halfway). |
| **Progress** | Rolling mean over the last `growth.checkGames` (10) games on that role. Met when ≥ target in the rolling mean; then celebrate and pick the next focus. |
| **Post-game card** (F6) | Advice shown, pick, followed?, result, the largest term (e.g. "Lane matchup was −4%"), focus metric this game vs target. |
| **Monthly report** (F8) | Axis trend arrows, per-champion form trend, focus targets met, rank trend. Language avoids judging single games. |

Why this design: it gives **one** concrete thing, chosen by evidence that it matters *in your rank and role*, on a champion you actually play, with a number you can move in a few games.

---

## 8. Learning loop (tuning)

- `advice_log` stores the full term breakdown per shown recommendation and the result.
- **Calibration check** (monthly, offline script): bucket `expectedWin` vs actual results across all users; if over-confident, raise smoothing `k`. Not automatic.
- **Weight tuning** later: logistic regression of result on term values over logged games (needs ~500+ games; until then hand-tuned config). Recommendations stay explainable because the model form doesn't change, only weights.

---

## 9. Config additions (`config/engine.v2.json`)

`terms.{meta,lane,counter,synergy,team,personal}.priorGames`, `bands.{id}.{term}` weights, `personal.learningPenalty`, `personal.learningScale`, `blind.riskAversion`, `pickOrder.lastPickCounterBoost`, `bans.{minPickRate,metaWeight}`, `builds.{minShare,minMatchupGames}`, `items.legendaryMinGold`, `explain.{minDeltaWin,maxReasons,minGames,clearGap}`, `pool.{coreMin,coreGames,secondaryMin,learningWindowDays,dormantMastery,dormantDays}`, `coverage.damageShare`, `newChamps.{maxGames,maxMastery,weights}`, `playstyle.{halfLifeDays,minGamesPerRole,minMetrics,axes:{name:[metric ids]}}`, `growth.{window,targetStep,checkGames}`. New `config/explain.v1.json` (templates). v1 stays loadable until the migration ships.

Note: axis → metric lists are **metric names from the Riot API**, not game facts, so keeping them in config is consistent with the no-hardcoding rule (they say *which Riot fields to read*, like queue ids in `app.v1.json`).

## 10. Compliance check per feature

| Feature | Risk | Mitigation |
| --- | --- | --- |
| Playstyle baseline from lane opponents in your games | Analysing other players | Aggregated into percentile references only; never stored with identity (current `minimizeMatch` already drops PUUIDs); never displayed per player. |
| Bans | none | Draft only. |
| Live item advice | "info previously unknown to the player" | Only Live Client Data API fields (what the scoreboard shows). No timers. |
| Rune/item import | "dictating decisions"; LCU writes | User click only; never on champ select actions (D6, needs approval). |
| Friends' leaderboard (F11) | sharing personal data | Opt-in, friends only, own data only; later. |
| Arena | augment stats | Arena queues not supported; never compute augment stats. |

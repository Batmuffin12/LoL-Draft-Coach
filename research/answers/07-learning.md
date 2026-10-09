# 7. Learning a new champion

Research run 2026-10-09 against Data Dragon `16.20.1` and CommunityDragon `latest` (patch 26.20). Builds on [research/LEARNING.md](../LEARNING.md) (2026-10-08), [01-language.md](01-language.md) (wording of the New tab lines), [02-goals.md](02-goals.md) (process goals, targets, when a change is real) and [04-runes.md](04-runes.md) (CommunityDragon tags, `<status>` crowd-control classes). Status: done.

## Summary (the strongest findings)

1. **New champions cost wins, by a measurable and champion-dependent amount.** Riot: even easy champions gain about 4 points of win rate over the first ~15 games; Yasuo, Katarina and Nidalee keep improving to ~100 games (2020). iTero (1M+ Gold games, patch 13.7, 2023): about 44% win rate below 10k mastery, break-even at ~12k mastery (~20 games); jungle loses the most, bot lane the least. League of Graphs (patch 16.19, 2026): average +3.6 points for players with 50+ ranked games, from +9.9 (Nilah) to −2.9 (Maokai). Three independent sources agree on direction and order of size; they disagree on the exact break-even, which depends on champion and role. **The New tab's "about N games" and "learn it outside ranked" are well supported.**
2. **Spread the games out.** The only LoL-specific study (Vardal, Bonometti, Drachen, Wade & Stafford, *PLOS ONE* 2022; 162k players, 16M ranked games): players who spread their first 95 games over more days ended with higher gold per minute (d = 0.15) and KDA (d = 0.27). Halo data (Huang et al. 2017): 4–8 matches a week gave the most skill per match; breaks of 1–2 days cost nothing, a 30-day break cost ~10 matches. Stafford & Dewar 2014 (850k players of a browser game): the same. Effects are small and observational. "Blocks of 2–3 games" is coaching advice (Dignitas) and not tested directly; "several days, not one long session" has the better evidence.
3. **CommunityDragon gives a learner real, per-patch mechanics; Match-V5 gives habits to measure.** The champion file `plugins/rcp-be-lol-game-data/global/default/v1/champions/{id}.json` has per-spell cooldowns by rank, ranges, costs, charges (`ammo`), the ability preview video (`abilityVideoPath`, served at 200 OK), Riot's difficulty (1–3), damage type and attack type. So "Charm (E) comes back every 12 s at rank 1" is derivable without a hand list. Match-V5 `challenges` has `skillshotsHit`, `skillshotsDodged`, `abilityUses`, `landSkillShotsEarlyGame` and the participant has `spell1Casts`…`spell4Casts`: a learner's spell use can be compared with the band's players on the same champion.
4. **"Similar champions transfer skill" has no direct quantitative evidence in League.** Riot says champions with "more familiar mechanics" are learned faster (opinion of designers, 2020). Learning science supports near transfer between closely matched tasks and finds no far transfer (Sala & Gobet, second-order meta-analysis, 2019). The only LoL recommender built on transfer (Heo et al., arXiv, May 2026) validates nothing. Similarity stays in the score, but as a reasonable assumption, not a measured effect; we can measure it on our own users later.
5. **Ease should weigh more than it does, and Data Dragon's difficulty has a bug for us.** Champion difficulty is the best-supported predictor of the learning cost (all three sources in point 1). Data Dragon gives difficulty 0 for Akshan, Rell, Seraphine and Vex, which `newchamps.ts` reads as "easy" (0 ≤ `easyMax`). CommunityDragon's `tacticalInfo.difficulty` (1–3, what the client shows) is complete and maintained.

---

## Q1. What helps players learn a champion fastest?

### Evidence

| Claim | Evidence | Sources (date) |
| --- | --- | --- |
| **The first games cost wins, so learn outside ranked.** | Riot: ~4 points over ~15 games for easy champions, long tails for hard ones. iTero: ~44% under 10k mastery; ~20 games to break even. League of Graphs: +3.6 on average for 50+ games, spread −2.9 to +9.9 by champion. Mechanic: normal and ranked queues keep separate matchmaking ratings, so normal losses don't cost LP or ranked MMR (secondary sources only; Riot has no current support page on it). | [Riot /dev: Balancing new champions (2020-07-06)](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/), [iTero, Mastery: a statistical summary (2023, patch 13.7)](https://www.itero.gg/articles/mastery-a-statistical-summary), [League of Graphs, win rate by experience (patch 16.19; 403 to our fetch, numbers from the indexed page)](https://www.leagueofgraphs.com/champions/winrates-by-xp), [Riot /dev: Champion balance framework (2019-05-30)](https://www.leagueoflegends.com/en-au/news/dev/dev-champion-balance-framework/) ("steep mastery curves … much higher win rate when played by experienced players"), [Guild Order: queue structure](https://guildorder.com/games/league/wiki/ranked-queue-structure) |
| **Spread practice over days.** | LoL ranked: more days between game 1 and game 95 → slightly higher final GPM (d 0.15) and KDA (d 0.27); the total spacing matters, not where the breaks fall. Halo: 4–8 matches/week most skill per match; >64/week most total gain; 1–2-day breaks cost nothing, 30 days ≈ 10 matches to recover. Browser game: first 10 plays spread over >24 h → higher later scores. | [Vardal et al. 2022, PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0275843), [Huang et al. 2017, "Master Maker", Topics in Cognitive Science](https://jeffhuang.com/papers/MasterMaker_TOPICS17.pdf) via [Brown University summary (2017-02-27)](https://www.brown.edu/news/2017-02-27/gameskill), [Stafford & Dewar 2014, Psychological Science](https://www.researchgate.net/publication/222524262_Spacing_practice_sessions_across_days_benefits_the_learning_of_motor_skills) (cited in Vardal et al.) |
| **Practise the kit before games (Practice Tool), briefly.** | Coaches: 5–10 min of combos before a game; never test a new combo in ranked; Practice Tool for ranges and combos, bots/customs only for the kit. Elite StarCraft players warm up their routines at the start of a match. No controlled study of the Practice Tool itself. | [Dignitas, How to master a champion (2021-11-10)](https://dignitas.gg/articles/how-to-master-a-champion-in-league-of-legends), [Mobalytics, combos](https://mobalytics.gg/blog/lol-how-to-learn-and-practice-combos/), [MOBAFire forum](https://www.mobafire.com/league-of-legends/forum/new-player-help/what-is-the-best-way-to-learn-a-new-champion-7321), [Brown summary of Huang et al.](https://www.brown.edu/news/2017-02-27/gameskill) |
| **Watch good players on it, actively.** | Motor learning: watching a model plus practice beats practice alone; large effect on movement form (d 0.77), small on outcome (d 0.17). Expert and self models work about equally. Coaches: watch high-elo games and replays of your hard matchups, take notes, try one thing next game. | [Ashford, Bennett & Davids 2006 meta-analysis (summary)](https://e-space.mmu.ac.uk/84598), [Observational learning in PE, systematic review 2022](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9407861/), [Dignitas (2021)](https://dignitas.gg/articles/how-to-master-a-champion-in-league-of-legends), Mobalytics, *5 things you can learn by watching streamers* (403 to our fetch; indexed text only) |
| **One focus per game, reviewed after.** | Already established in 01 and 02 (process goals d 1.36 vs outcome d 0.09; external focus; one cue). | [02-goals.md Q6](02-goals.md), [01-language.md Q1](01-language.md) |
| **One new champion at a time; mixing several is not proven better.** | Contextual interference (random vs blocked practice of several skills) helps retention in the lab (SMD 0.75) but is small and not significant in applied settings (SMD 0.34); a 2025 review calls the effect contested. Coaches say a small pool (one main, 2–3 per role). No evidence for learning two champions at once. | [CI and transfer meta-analysis 2024](https://www.researchgate.net/publication/383141462_The_effect_of_contextual_interference_on_transfer_in_motor_learning_-_a_systematic_review_and_meta-analysis), [Advancing contextual interference (2025)](https://link.springer.com/article/10.1007/s10648-025-10043-1), [Dignitas champion pool](https://dignitas.gg/articles/start-climbing-elo-know-how-to-build-your-champion-pool), [lol-brain: how many champions](https://www.lol-brain.com/blog/how-many-champions-should-you-main) |

### Conflicting views

- **Spacing.** A 2026 *Scientific Reports* study found spaced practice had "limited or no effects" on motor *sequence* learning ([link](https://www.nature.com/articles/s41598-026-52702-5), seen in search, not fetched). The game studies are observational: in Vardal et al. players who spaced more started *worse* (r = −0.295), which the authors say may hide or bias the effect. Huang et al. show that more matches per week still gives the most total gain. **Conclusion:** spacing is a small, plausible benefit per game played. Say "spread your first games over several days" as a suggestion, never a rule, and never as "play less".
- **Blocks of 2–3 games.** Only coaching opinion (Dignitas). It is consistent with the per-match efficiency data but not tested. Keep as wording, mark as advice.
- **How many games until it "settles".** 15 (Riot, easy), ~20 (iTero, all champions), 30+ (Riot, hard), 50+ (League of Graphs' "experienced" bucket). The current config (15 / 20 / 30 by difficulty) sits inside the evidence.

### Ranked answer (Q1)

1. Learn it outside ranked for the first games (strong: three data sources + a mechanic).
2. Spread the first games over several days (moderate: one LoL study, two other games, small effects).
3. Watch a good player on it, then try one thing (moderate: motor-learning meta-analysis + coaching).
4. Short Practice Tool warm-up for the combo (coaching consensus; no controlled study).
5. One focus per game, checked after (strong, from sections 1–2).
6. Blocks of 2–3 games (coaching opinion only).

---

## Q2. Which facts about a champion help a learner most?

### What we checked in the data (2026-10-09)

**CommunityDragon champion file** (`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/{id}.json`). Example, Ahri (103):

| Field | Value | Use for a learner |
| --- | --- | --- |
| `tacticalInfo` | `{ style: 10, difficulty: 2, damageType: "kMagic", attackType: "ranged" }` | Riot's 1–3 difficulty (complete; the client shows it) |
| `playstyleInfo` | `{ damage: 3, durability: 1, crowdControl: 2, mobility: 3, utility: 1 }` | Riot's own ratings; we already measure better ones |
| `spells[].cooldownCoefficients` | Q `7…`, W `9,8,7,6,5,4`, E `12…`, R `140,120,100,…` | cooldown per rank (first 5 = ranks; a 6th is padding, R has 3 real ranks: use `maxLevel`) |
| `spells[].range` | Q 970, W 700, E 975, R 450 | spell reach |
| `spells[].ammo` | Teemo R: `ammoRechargeTime [35,30,25]`, `maxAmmo [3,4,5]`; `cooldownCoefficients` then holds the 0.25 s recast lock | charge spells must read `ammo`, not the cooldown |
| `spells[].abilityVideoPath` | `champion-abilities/0103/ability_0103_Q1.webm` | Riot's spell preview clip; `https://d28xe8vt774jo5.cloudfront.net/<path>` returned 200 `video/webm` (undocumented host) |
| `spells[].dynamicDescription` | text with `<status>Charms</status>`, `<magicDamage>` | crowd-control class per spell (04-runes §2.5 method) |

Data Dragon `champion/{Name}.json` has the same cooldowns (`cooldownBurn` "8/7.5/7/6.5/6") and ranges, plus `allytips` / `enemytips` (Riot-written; 149 and 147 of 173 champions have them; some are years old).

**The `.bin.json` file** (`game/data/characters/<internal>/<internal>.bin.json`) needs the *internal* name (`monkeyking`, not `wukong`: 404) and lists 47 entries for Wukong, including internal sub-spells, basic attacks, ranges of 10000 for self-casts and a padding value at index 0. **Not usable for learner text**; use the plugin file.

**Match-V5** (checked in the community OpenAPI schema, [riotapi-schema](https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.json)): `challenges.skillshotsHit`, `challenges.skillshotsDodged`, `challenges.abilityUses`, `challenges.landSkillShotsEarlyGame`, `challenges.dodgeSkillShotsSmallWindow`; participant `spell1Casts`…`spell4Casts`. Our summariser keeps all numeric `challenges` already (`packages/riot-api/src/summarize.ts`), but not `spellNCasts`. No cast *order* exists anywhere in the API, so combos can't be measured.

### The facts, ranked by evidence, with where they come from

| # | Fact | Evidence it helps | Derive from data? | Status |
| --- | --- | --- | --- | --- |
| 1 | **Which lanes to start into / avoid** | Coaches (Mobalytics matchups, Dignitas replays of hard matchups); matchup size is measured | Yes: band lane matchups (`deltaWin`) | shown |
| 2 | **When it's strong: early or late** | Dignitas: "knowing when a champion is strongest will help aid you in your decision making"; Mobalytics power spikes | Yes: power curve, gold at 15 | shown |
| 3 | **Skill order** | Coaches; mechanic (which spell gets ranks) | Yes: timelines | shown |
| 4 | **Its key spell and how often it's up** | Trading "in turns" (key spell up, theirs down) is the core laning advice in every source in LEARNING.md §5 | **Yes, new:** CDragon cooldown + `<status>` class + range (rule below) | proposed |
| 5 | **What each spell looks like** | Observational learning (Ashford, d 0.77 on movement form) | **Yes, new:** `abilityVideoPath` per spell | proposed (check policy, §10) |
| 6 | **Spell use vs players on it** (skillshots landed early, casts per minute) | A habit (02: process goals first); early numbers avoid the "loser dies more" bias | **Yes, new:** band quantiles per champion of `landSkillShotsEarlyGame`, `abilityUses`/min | proposed (needs aggregation) |
| 7 | **How it wins** (won vs lost means) | Measured; 01 asks for early metrics only | Yes | shown |
| 8 | **Level and item spikes** | Coaches (levels 2, 3, 6; item completions) | Partly: level 6 / ult ranks from `maxLevel`; item timings belong to section 8 | section 8 |
| 9 | **Combos** | Coaches; no data | **No:** no cast order in Match-V5, no Riot combo data. Only Riot's `allytips` text, which isn't a combo list and is missing for 24 champions | not doable |
| 10 | **Its job** (class) | Dignitas champion identity | Yes: Data Dragon tag / CDragon `roles` | shown |

### The "strong window" rule (Q2's example), made data-driven

The question: could CDragon give "its strong window is when Q is up (every 8 s)"? **Yes, with a rule and three cautions.**

Rule (no champion or spell names in config):
1. Candidates: the non-ultimate spells (`spellKey` q/w/e) whose `dynamicDescription` contains a crowd-control `<status>` (classes from 04-runes §2.5), else the one with the highest base damage coefficient; ties → longest rank-1 cooldown.
2. Its cooldown at rank 1 and at max rank (`cooldownCoefficients[0]` and `[maxLevel-1]`), or `ammoRechargeTime` when `ammo.maxAmmo` > 1.
3. Show only in champ select and post-game, for **your** champion: "Charm (E) is your catch: back every 12 s. Trade when it's up; after a miss you have 12 s without it."

Cautions:
- **Ability haste** lowers every cooldown; say "at rank 1, before haste" or show the range "12 s → 12 s".
- **Not the enemy's cooldowns in game.** The spec bans enemy cooldown tracking in game. Static facts about your own champion before the game are fine; don't add "the enemy's key spell is down" timers.
- **Which spell matters is a judgement.** The rule picks the crowd-control or burst spell; for champions where that's wrong the line is misleading. Check its output on all 173 champions once and show it only where the rule is unambiguous (exactly one CC spell). Opinion: this covers most mages, supports and fighters; marksmen will often have none, and then the line is omitted.

---

## Q3. How should a new champion be recommended?

### Is there evidence that similar champions transfer skill?

| Source | What it says | Strength |
| --- | --- | --- |
| [Riot /dev (2020-07)](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/) | "Champions with more familiar mechanics will avoid some of the struggle"; unique playstyles take time | designers' statement, no numbers |
| [Sala & Gobet 2019, second-order meta-analysis](https://pure.fujita-hu.ac.jp/en/publications/near-and-far-transfer-in-cognitive-training-a-second-order-meta-a/), [Gobet & Sala 2023](https://journals.sagepub.com/doi/10.1177/17456916221091830) | Near transfer (to closely similar tasks) exists; far transfer is ~0 across 332 samples, video games included | strong, general |
| [Heo, Kadiyam & Panthi, arXiv 2605.18338 (2026-05-03)](https://arxiv.org/html/2605.18338) | Recommender with "indirect familiarity" (similarity to mastered champions) and archetype guardrails; **reports no validation**, a case study of one player | none |
| [Collaborative filtering recommenders, arXiv 2006.10191 (2020)](https://arxiv.org/pdf/2006.10191), [ICCS 2023](https://www.iccs-meeting.org/archive/iccs2023/papers/140760152.pdf) | Players prefer recommendations from similar players' pools over random ones | preference, not performance |

**Conclusion:** no study measures whether players do better on a new champion that resembles their main. Near transfer makes it plausible *when the shared part is the hard part* (same mechanics: skillshot mage → skillshot mage; same job: engage tank → engage tank). The current traits (Riot ratings, class tags, damage split, frontline, engage) describe the **job**, not the **mechanics**. Opinion: add mechanics-like traits from CDragon (`attackType`, number of CC spells, number of dashes from `dynamicDescription`, charge spells), which make similarity closer to "plays with the same hands".

### Recommended method

Keep the four-part score. Change weights and inputs by the strength of evidence:

| Part | Evidence | Change |
| --- | --- | --- |
| **ease** | strong (three data sources: learning cost rises with difficulty) | raise weight 0.4 → 0.8; use CDragon `tacticalInfo.difficulty` (1–3) when Data Dragon's is 0 or missing |
| **meta** (smoothed band win rate) | strong as a fact, but a new player's win rate on it will be ~44–48% for the first ~20 games whatever the meta | keep 0.8 |
| **similarity** | plausible, unmeasured | keep 1.0 but add mechanics traits; say "plays like X" only as a description, never "you'll learn it faster" |
| **gap** | game mechanic (draft needs) | keep |
| **role** | iTero: jungle most sensitive to experience, bot least | opinion: no per-role weight until we measure it (below) |

And show the learning cost honestly: "Expect to win fewer of your first games on it" in the reason list for hard champions (from config thresholds, no number unless measured).

### What to measure on the production copy

1. **Your own mastery curve** (per user, from up to 1,000 own games): for each champion with ≥ 15 games, win rate and two early metrics (CS at 10, deaths before 14) by game number 1–5, 6–10, 11–20, 21+, against the same user's established champions in the role. Pooled over users: the learning cost by Riot difficulty (1–3) and by role. Significance: report per bucket only when the 95% interval excludes 0 (02-goals Q3 rules).
2. **Transfer**: in the same pooled data, regress the first-10-games drop on cosine similarity (the `newchamps.ts` traits) to the user's prior core. Power: with a small private group this will likely be inconclusive; record it as "not measured" until ≥ ~200 first-champion runs.
3. **Band-level mastery buckets** (optional, costs API calls): for one random participant per collected match, one Champion-Mastery-V4 call; store only `(championId, role, masteryBucket, win)`, no PUUID. That is +1 call per 2 (match + timeline), i.e. ~50% more calls per wake-up on a personal key: only if the collector budget allows (config `meta.v1.json` budget).

---

## Deliverable

### What to show while learning (ranked by evidence)

1. **Stage + "first games outside ranked"** (strong). Already shown.
2. **One focus per game with your own number** (strong). Already shown.
3. **Matchups to start into / avoid** (measured). Already shown.
4. **About how many games it takes** (strong, three sources). Already shown; add "spread over several days" (moderate).
5. **When it's strong** (power curve, gold at 15; measured). Already shown.
6. **Skill order** (measured). Already shown.
7. **Its key spell: what it does and how often it's up** (new; mechanic from CDragon + coaching consensus on trading).
8. **Spell previews** (new; observational learning; Riot clips from CDragon paths).
9. **Spell use against players on it** (new; habit; needs per-champion quantiles).
10. **How it wins** (measured; early metrics only, per 01).
11. **Its job** (class). Lowest: least specific.

### What we can derive, and how

| Fact | Source | Method |
| --- | --- | --- |
| Difficulty 1–3 | CDragon `tacticalInfo.difficulty` | read; fall back to DD `info.difficulty` only when > 0 |
| Key spell, cooldown, range, charges | CDragon `spells[]` | rule in Q2 |
| Spell clip | CDragon `abilityVideoPath` | URL; renderer plays on click |
| Attack type, damage type | CDragon `tacticalInfo` | read (similarity traits) |
| Skillshots landed early, spell uses/min | Match-V5 `challenges` | per-champion band quantiles in the snapshot |
| Learning cost by game number | user history | Q3 measurement 1 |
| Combos, item spikes | none | not derivable (items: section 8) |

### Config proposals (fit `config/engine.v1.json` → `newChamps`)

```json
{
  "newChamps": {
    "weights": { "similarity": 1, "gap": 0.6, "meta": 0.8, "ease": 0.8, "overlap": 1 },
    "difficultySource": "cdragon",
    "cdragonDifficulty": { "easyMax": 1, "hardMin": 3 },
    "learn": {
      "spreadDays": 3,
      "keySpell": {
        "statusClasses": ["reducible", "unreducible"],
        "requireUnique": true,
        "showMaxRank": true
      },
      "spellUse": {
        "metrics": ["challenges.landSkillShotsEarlyGame", "challenges.abilityUses/min"],
        "minGames": 200
      }
    }
  }
}
```

`statusClasses` names the crowd-control classes of 04-runes §2.5 and §8 (`ccClasses`; slows excluded) (a category, not a list of spells). `abilityUses/min` follows the existing per-minute metric naming only if `readMetric` supports it; otherwise add a derived metric.

---

## Self-check

- Every question answered: Q1 (practice modes, games in a row, replays/one-tricks), Q2 (facts, derivable vs not, the cooldown example), Q3 (method, transfer evidence: "no direct evidence found", searched: Riot dev blogs, arXiv/Scholar "champion recommendation", "skill transfer similar champions", Dota 2 hero-pool studies, near/far transfer meta-analyses).
- Respects the rules: no champion, item or spell names in config; key-spell text only for your own champion, pre-game and post-game; no enemy cooldown timers in game; no other players' identities (mastery sampling stores no PUUID); every new number is a measured quantile or a static game value.
- Three sources per key claim: learning cost (Riot, iTero, League of Graphs); spacing (Vardal, Huang, Stafford & Dewar); observation (Ashford, PE review, Dignitas); transfer (Riot statement, Sala & Gobet, arXiv: and stated as unmeasured). "Blocks of 2–3" and "Practice Tool" rest on coaching sources only and are marked so.
- Dates: Riot 2019/2020 and iTero 2023 predate the current game; League of Graphs (patch 16.19) confirms the same size of effect now.

---

## What to change in the code or config

1. **Fix difficulty 0** (`packages/engine/src/newchamps.ts`, both `recommendNewChampions` and `learningPlan`): Data Dragon 16.20.1 has `info.difficulty = 0` for 4 champions, which counts as "easy" and full ease. Treat 0 as unknown, and prefer CDragon `tacticalInfo.difficulty` (1–3) through `packages/ddragon` (adapter), with `newChamps.cdragonDifficulty` cut points.
2. **Raise `newChamps.weights.ease` 0.4 → 0.8** (difficulty is the best-supported predictor of learning cost).
3. **Add "spread your first games over several days"** to the stage text (`explain.v1.json`, `newchamp.learn.*`), as advice ("a few games a day beats one long session"), with `learn.spreadDays` in config.
4. **Key spell line** (new): extend the ddragon/CDragon adapter to load per-spell `cooldownCoefficients`, `range`, `ammo`, `maxLevel` and `<status>` classes (reuse the 04-runes tagger); add `keySpell` to `LearningPlan`; wording in `explain.v1.json`. Pre-game and post-game only, own champion only.
5. **Spell previews** (new, after a policy check in section 10): expose `abilityVideoPath` per spell; play on click in the New tab. Treat the CDN host as configurable (`config/app.v1.json`), since it is undocumented.
6. **Spell-use habit** (new): in `packages/meta`, per-champion-role quantiles of `challenges.landSkillShotsEarlyGame` and ability uses per minute (min games from config); offer it as a `learn` focus candidate. Optionally add `spell1Casts`…`spell4Casts` to `summarize.ts` for a later "which spell you use least" check.
7. **Similarity traits**: add CDragon `attackType` and counts of CC spells / dashes / charge spells to `traits()`; keep the "like X" reason descriptive only.
8. **Measure** on the production copy: personal mastery curves pooled by difficulty and role, and the transfer regression (Q3). Until then, keep `settleGames` 15/20/30.

## Sources

- Riot Games, [/dev: Balancing new champions](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/) (2020-07-06); [/dev: Champion balance framework](https://www.leagueoflegends.com/en-au/news/dev/dev-champion-balance-framework/) (2019-05-30)
- iTero, [Mastery: a statistical summary of 1M+ games](https://www.itero.gg/articles/mastery-a-statistical-summary) (2023, patch 13.7; also on [Substack](https://jackjgaming.substack.com/p/mastery-a-statistical-summary-of))
- League of Graphs, [Win rate by experience](https://www.leagueofgraphs.com/champions/winrates-by-xp) (patch 16.19; fetch blocked, indexed text)
- Vardal, Bonometti, Drachen, Wade & Stafford, [Mind the gap: distributed practice enhances performance in a MOBA game](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0275843), PLOS ONE 2022
- Huang, Yan, Cheung, Nagappan & Zimmermann, [Master Maker](https://jeffhuang.com/papers/MasterMaker_TOPICS17.pdf), Topics in Cognitive Science 2017; [Brown University summary](https://www.brown.edu/news/2017-02-27/gameskill)
- Stafford & Dewar, Tracing the trajectory of skill learning with a very large sample of online game players, Psychological Science 25(2), 2014 (via Vardal et al.)
- [Spaced practice … limited or no effects on motor sequence learning](https://www.nature.com/articles/s41598-026-52702-5), Scientific Reports 2026 (search result, not fetched)
- Ashford, Bennett & Davids 2006, observational modelling meta-analysis ([record](https://e-space.mmu.ac.uk/84598)); [Observational learning in PE, systematic review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9407861/) (2022)
- Contextual interference: [transfer meta-analysis (2024)](https://www.researchgate.net/publication/383141462_The_effect_of_contextual_interference_on_transfer_in_motor_learning_-_a_systematic_review_and_meta-analysis), [Advancing contextual interference (2025)](https://link.springer.com/article/10.1007/s10648-025-10043-1)
- Sala & Gobet, [Near and far transfer in cognitive training: a second-order meta-analysis](https://pure.fujita-hu.ac.jp/en/publications/near-and-far-transfer-in-cognitive-training-a-second-order-meta-a/) (2019); Gobet & Sala, [Cognitive training: a field in search of a phenomenon](https://journals.sagepub.com/doi/10.1177/17456916221091830) (2023)
- Heo, Kadiyam & Panthi, [Robust player-conditional champion ranking](https://arxiv.org/html/2605.18338), arXiv 2026-05-03; [Collaborative filtering champion recommendation](https://arxiv.org/pdf/2006.10191) (2020); [ICCS 2023 champion recommendation](https://www.iccs-meeting.org/archive/iccs2023/papers/140760152.pdf)
- Dignitas, [How to master a champion](https://dignitas.gg/articles/how-to-master-a-champion-in-league-of-legends) (2021-11-10), [Champion pool](https://dignitas.gg/articles/start-climbing-elo-know-how-to-build-your-champion-pool); Mobalytics, [combos](https://mobalytics.gg/blog/lol-how-to-learn-and-practice-combos/); [MOBAFire forum](https://www.mobafire.com/league-of-legends/forum/new-player-help/what-is-the-best-way-to-learn-a-new-champion-7321); [lol-brain](https://www.lol-brain.com/blog/how-many-champions-should-you-main)
- Data: CommunityDragon [champion 103](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/103.json), [17](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/17.json), [monkeyking.bin.json](https://raw.communitydragon.org/latest/game/data/characters/monkeyking/monkeyking.bin.json); Data Dragon [championFull 16.20.1](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/championFull.json); [riotapi-schema OpenAPI](https://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.json); [Guild Order queue structure](https://guildorder.com/games/league/wiki/ranked-queue-structure)

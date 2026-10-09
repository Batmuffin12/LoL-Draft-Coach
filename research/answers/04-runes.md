# 4. Runes in champ select: valid suggestions with real reasons

Research run 2026-10-09 against the live game data of that day: Data Dragon `16.20.1` and CommunityDragon `latest` (= `16.20.8248524`, the public patch 26.20). Status: done.

Access note: mobalytics.gg, u.gg and dotesports block our fetcher (HTTP 403), so their pages are seen only through search summaries. Op.gg, lolalytics, metabot.gg, skill-capped and the League wiki were read in full. The Riot data files were downloaded and inspected with scripts (kept outside the repo; their output is quoted below).

## Summary (the strongest findings)

1. **The rune game changed under the question.** Three of its examples no longer exist on patch 26.20:
   - armor and magic resist shards were removed in 14.2 (Riot's stated reason: the choice was too obvious);
   - Legend: Tenacity was removed in 14.10;
   - Unflinching no longer gives tenacity; since 14.2 it gives armor and magic resist *while* you are crowd-controlled.

   The only tenacity left in runes is the 15% defense shard. **No current rune reacts to damage type** (magic vs physical), so the `magic` and `physical` lifts we show for runes have no mechanic behind them: they are correlation by construction.
2. **CommunityDragon `perks.json` can tag runes by effect for every patch; Data Dragon cannot.** `runesReforged.json` has only names and plain text, and no shards at all. CDragon has:
   - Riot's own recommender categories (`recommendationDescriptorAttributes`: kDurability, kHealing, kMoveSpeed, …);
   - tooltip markup (`<scaleArmor>`, `<healing>`, `<speed>`, `<status>`);
   - keyword links (`LinkTooltip_Description_ImpairMov`, `…_Takedown`);
   - `perkstyles.json` row labels (Resistance, Vitality, …);
   - **`endOfGameStatDescs`**: what each rune's three Match-V5 `var1..var3` numbers mean ("Total Damage Blocked", "Total Healing", "Seconds in combat with bonus resistances").
3. **The best reason is a measured mechanic, not a lift.** Match-V5 already sends each rune's end-of-game output (`perks.styles[].selections[].var1..3`). From it we can say "into lanes like this, Second Wind healed 1.6× as much per minute". That is a measured effect of the rune's mechanic. Our `summarize.ts` drops these numbers today.
4. **Win-rate claims for one rune swap are almost never honest at our sample sizes.**
   - Same-champion differences between the Resistance-row runes are 0.1–0.7 points (metabot.gg, 158k games, patch 26.19).
   - Detecting 2 points needs about 9,800 games per arm.
   - Show win numbers only from a pooled, stratified test (below), and expect it to pass rarely.
5. **Rune IDs get reused for new runes.**
   - ID 8230 was Phase Rush on 16.8 and Stormraider's Surge from 16.9, with a different mechanic.
   - Stats must be keyed by rune *and* text version.
   - `majorChangePatchVersion` helps but isn't reliable; diffing the versioned CDragon text is.
6. **Enemy crowd control can be typed from data too.**
   - CDragon champion files mark crowd control in spell text with `<status>` tags ("Stuns", "Knocked Up", "Suppresses").
   - On 26.20, 160 of 173 champions have at least one tag.
   - This separates CC that tenacity and Cleanse shorten (stun, root, charm, fear, …) from CC they don't (airborne, suppression). That difference is the whole point of a tenacity suggestion.

---

## 0. What the current game has (patch 26.20; Data Dragon 16.20.1)

From `perkstyles.json` (CDragon) and confirmed by `runesReforged.json` (Data Dragon) and the League wiki's Rune page ([wiki: Rune](https://wiki.leagueoflegends.com/en-us/Rune), last updated V26.06):

| Tree | Keystones | Row 1 | Row 2 | Row 3 |
| --- | --- | --- | --- | --- |
| Precision | Press the Attack, Lethal Tempo, Fleet Footwork, Conqueror | Absorb Life, Triumph, Presence of Mind | Legend: Alacrity, Legend: Haste, Legend: Bloodline | Coup de Grace, Cut Down, Last Stand |
| Domination | Electrocute, Dark Harvest, Hail of Blades | Cheap Shot, Taste of Blood, Sudden Impact | Sixth Sense, Grisly Mementos, Deep Ward | Treasure Hunter, Relentless Hunter, Ultimate Hunter |
| Sorcery | Summon Aery, Arcane Comet, Stormraider's Surge, Deathfire Touch | Axiom Arcanist, Manaflow Band, Nimbus Cloak | Transcendence, Celerity, Absolute Focus | Scorch, Waterwalking, Gathering Storm |
| Resolve | Grasp of the Undying, Aftershock, Guardian | Demolish, Font of Life, Shield Bash | Conditioning, Second Wind, Bone Plating | Overgrowth, Revitalize, Unflinching |
| Inspiration | Glacial Augment, Unsealed Spellbook, First Strike | Hextech Flashtraption, Magical Footwear, Cash Back | Triple Tonic, Time Warp Tonic, Biscuit Delivery | Cosmic Insight, Approach Velocity, Jack of All Trades |
| Shards | Offense: Adaptive Force, Attack Speed, Ability Haste | Flex: Adaptive Force, Move Speed, Health Scaling | Defense: Health (+65), Tenacity and Slow Resist (+15%), Health Scaling | |

(This table is context for this answer, not a list for the code: the code reads it from `perkstyles.json` every patch.)

The changes that matter for the question, each confirmed in at least two places:

- **Armor/MR shards are gone since 14.2.** Riot's patch notes give the reason: "When choosing between Armor and Magic Resist shards, it's generally clear which is the better option (am I laning against Zed or Lissandra?)". Wrong choices in unusual matchups also distorted the stats: they "contribute to strong statistical performances on these mages (despite not actually being as powerful as stats would suggest)" ([Patch 14.2 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-2-notes/), Jan 2024). Also in [Dexerto](https://www.dexerto.com/league-of-legends/league-of-legends-patch-14-2-notes-2467731/), [GameRiv](https://gameriv.com/new-rune-shard-changes-in-lol-patch-14-2/) and in the live `perkstyles.json`. The old IDs 5002 (Armor) and 5003 (Magic Resist) are still in `perks.json` but in no slot. **Question 1's "armor vs magic resist shards" decision no longer exists.**
- **Legend: Tenacity was removed in 14.10**, replaced by Legend: Haste ([wiki: Rune](https://wiki.leagueoflegends.com/en-us/Rune), [GameLeap 14.10](https://www.gameleap.com/articles/lol-patch-14-10-all-new-runes-and-rune-changes)). Guides that still recommend it are outdated: [lolnow.gg's tenacity guide](https://lolnow.gg/lol-tenacity/) still lists it, which is a good example of why we read runes from data, not articles.
- **Unflinching** was reworked in 14.2. It now gives "10 bonus armor and 10 bonus magic resistance" while you are crowd-controlled by champions, plus 2 s after (10 flat since V25.09) ([wiki: Unflinching](https://wiki.leagueoflegends.com/en-us/Unflinching); `perks.json` longDesc "Gain 10 Armor and Magic Resist when crowd controlled and for 2 seconds after").
- **Tenacity in runes** is now only the 15% defense shard ([wiki: Tenacity](https://wiki.leagueoflegends.com/en-us/Tenacity): "The only current rune source listed is: Tenacity and slow resist rune shard").
- **Nullifying Orb** (the anti-magic-burst rune) was removed in V25.S1.1 ([wiki: Rune](https://wiki.leagueoflegends.com/en-us/Rune)).
- **Stormraider's Surge and Deathfire Touch returned in 26.9** ([esports.gg](https://esports.gg/news/league-of-legends/deathfire-touch-stormraiders-surge-returns-in-lol-2026-season-2/), [hexgate](https://hexgate.app/blog/deathfire-touch-stormraiders-surge/), `perks.json` `majorChangePatchVersion: "16.9"`). Stormraider's took over Phase Rush's ID 8230 (see §2.6).
- **Cut Down** is no longer an anti-tank rune. It's "8% more damage to champions who have more than 60% health" (`perks.json`, 26.20), so the classic "Cut Down vs tanks" advice is obsolete.

---

## 1. Which rune decisions depend on the enemy, and why

Method: a decision is listed when **(a)** the rune's own text gives a mechanic whose value depends on what the enemy does, and **(b)** at least three independent guides from 2024–2026 make that choice by matchup. The mechanic column quotes the 26.20 text. "Detect" says how to measure the enemy trait from data we have or can get (§1.2).

### 1.1 The decision table

| # | Decision (row-mates) | Enemy trait it answers | Mechanic (26.20 text) | How to detect the trait | Sources (guides by matchup) |
| --- | --- | --- | --- | --- | --- |
| R1 | **Second Wind** over Bone Plating / Conditioning (Resolve "Resistance" row) | **Lane poke**: frequent ranged damage you can't trade back | "After taking damage from an enemy champion, heal for 4% of your missing health over 10s"; the heal grows with damage already taken | Lane opponent `attackType: ranged` (CDragon `tacticalInfo`) **and** high early damage to champions (timeline `damageStats.totalDamageDoneToChampions` at 10–14 min, percentile in band) | [riftfeed, 2024-02](https://riftfeed.gg/guides/lol-runes-how-important-are-bone-plating-and-second-wind) ("Quinn could easily proc the Bone Plating and wait out its effect"); [skill-capped Ornn 26.20](https://www.skill-capped.com/lol/guides/builds/ornn/top) ("Second Wind instead against ranged or poke-heavy lanes"); [skill-capped Aatrox 26.20](https://www.skill-capped.com/lol/guides/builds/aatrox/top) ("Bone Plating vs burst traders, Second Wind otherwise"); [wiki: Second Wind](https://wiki.leagueoflegends.com/en-us/Second_Wind) |
| R2 | **Bone Plating** over Second Wind / Conditioning | **Lane burst in short combos**: several hits in a row from one champion | After a champion damages you, "the next 3 spells or attacks you receive from them deal 30-60 less damage", 1.5 s, 55 s cooldown; only against the champion that triggered it | Lane opponent's early damage arriving in short bursts. Best: death-recap events (`CHAMPION_KILL.victimDamageReceived`: instances per champion in the recap window). Simpler proxy: melee lane opponent with high early damage and high engage | [wiki: Bone Plating](https://wiki.leagueoflegends.com/en-us/Bone_Plating) ("Best against: multiple rapid hits or ability chains from a single opponent"); riftfeed (Ornn vs Riven: "excels at small trades"); skill-capped Aatrox and [K'Sante 26.20](https://www.skill-capped.com/lol/guides/builds/ksante/top) ("against burst champions like Riven and Jax") |
| R3 | **Conditioning** over Second Wind / Bone Plating | **No strong lane threat; long game**, and your champion multiplies resists | "After 12 min gain +8 Armor and +8 Magic Resist and increase your Armor and Magic Resist by 3%" | No lane-poke or lane-burst flag on the opponent; your champion's power curve rises late (measured `powerCurve`); your page already stacks resists | skill-capped Ornn ("Conditioning is preferred because Ornn's passive grants up to 30% bonus armor and magic resist"); [wiki: Conditioning](https://wiki.leagueoflegends.com/en-us/Conditioning); [metabot compare 26.19](https://metabot.gg/en/league/rune/8473/compare) (Conditioning 0.7 points above Bone Plating on the same champions: the default, not a counter) |
| R4 | **Unflinching** over Overgrowth / Revitalize (Resolve "Vitality" row) | **Crowd control you get hit by during trades** (any kind: the effect is armor/MR while CC'd, so knock-ups count too) | "Gain 10 Armor and Magic Resist when crowd controlled and for 2 seconds after" | Enemy team's (lane-weighted) CC seconds dealt (`engage` = Match-V5 `timeCCingOthers` percentile, already measured) | skill-capped Aatrox ("pivot to Unflinching vs champions who CC during trades like Riven, Ornn, and Chogath"); [wiki: Unflinching](https://wiki.leagueoflegends.com/en-us/Unflinching); [metabot Unflinching](https://metabot.gg/en/league/rune/8242/overview). Only two guides say this by matchup: **medium evidence** |
| S1 | **Tenacity and Slow Resist shard** over Health (+65) (defense shard) | **Tenacity-reducible CC**: stun, root, charm, fear, taunt, silence, slow. Not knock-ups or suppression | "+15% Tenacity and Slow Resist". Tenacity "does NOT reduce duration of: Airborne, Drowsy, Nearsight, Stasis, Suppression" ([wiki: Tenacity](https://wiki.leagueoflegends.com/en-us/Tenacity)) | `engage` × the share of the enemy's CC that tenacity reduces (CDragon `<status>` words, §2.5) | [unrankedsmurfs 2025-01](https://www.unrankedsmurfs.com/blog/league-of-legends-tenacity-explained); search-summarised guides ("Take Health over Tenacity unless you are into a heavy crowd control lane"; "If their engage is knockups and suppression, tenacity does nothing at all"); skill-capped Ornn (Tenacity "valuable against heavy CC enemies"); Riot 14.2 notes (the new row is meant as "Durability vs Tenacity" choice) |
| S2 | Health Scaling vs Adaptive Force vs Move Speed (flex shard) | Weak link to the enemy: longer lanes/games favour scaling health | "+10-180 Health (based on level)" | Not proposed as an enemy rule | Conflicting: one guide says scaling health is "almost never correct", another that "top lane is long enough that scaling Health is also defensible" (search-summarised). **No enemy rule: keep the page's shard.** |
| K1 | **Keystone into a ranged lane opponent** (melee top/mid): Grasp → Aftershock / Fleet / Electrocute / Aery | Lane opponent is **ranged** (you can't trade evenly) | Grasp needs "your next basic attack on a champion" every 4 s in combat; ranged opponents deny melee autos | `attackType` of you and the lane opponent (CDragon `tacticalInfo.attackType`) | skill-capped K'Sante ("Grasp… best for melee matchups"; "Aftershock: Take this into ranged matchups"); skill-capped Aatrox (Electrocute vs ranged tops); skill-capped Ornn (Aery vs Vayne/Quinn); search-summarised Fleet ("hard poke or range matchups"). The **chosen** keystone varies by champion, so it comes from data (matchup pages), not a rule (§4) |
| K2 | Grasp vs Conqueror (melee vs melee) | **Short trades vs extended fights**: Grasp = short trades/tank lanes, Conqueror = long fights | Conqueror stacks over 5 s of continuous damage and heals at 12 stacks | Not cleanly measurable per opponent today. Use matchup pages (§4) | search-summarised Mobalytics/skill-capped (Conqueror "best into most bruiser and extended trade lanes"; Grasp "short-trade tank lanes") |
| K3 | Stormraider's Surge (kite out) | Melee lane opponent; you deal burst | "Dealing 25% of a champion's maximum health within 3s grants Move Speed and 50% Slow Resistance" | Opponent melee; your champion's damage profile | [metabot Stormraider's](https://metabot.gg/en/league/rune/8230/overview) ("versus melee matchups to kite them out"); hexgate; returned in 26.9: **little evidence yet** |
| P1 | **Cleanse** (2nd summoner, carries) | **Reducible hard CC** that locks you down | Data Dragon: "Removes all disables (excluding suppression and airborne) and summoner spell debuffs … and gives Tenacity" | Same as S1, lane-weighted; bot-lane opponents count double | [Dignitas 2020](https://dignitas.gg/articles/blogs/League-of-Legends/14636/summoner-spell-rundown-a-guide-for-league-of-legends) ("squishy hypercarry against an all-in lane like Leona-Tristana"); [Dignitas spell school](https://dignitas.gg/articles/blogs/League-of-Legends/14039/summoner-spell-school-a-league-of-legends-guide) ("Swap to Cleanse when the enemy lane is built around one piece of hard lockdown"); [boostingmarket](https://boostingmarket.com/blogs/lol-summoner-spells-guide/) ("Cleanse against lockdown"). Conflict: boostingmarket says Cleanse beats suppression; Data Dragon's own text says it doesn't, and Data Dragon wins |
| P2 | **Exhaust** / Barrier | **Assassins and divers** that burst a carry | Exhaust "slows target enemy champion and reduces their damage dealt"; Barrier "Gain a brief Shield" | CDragon `roles` contains `assassin`, or high engage plus high early damage on melee champions | Dignitas ("their team is nothing but Assassins or Fighters alongside hypercarries"); Dignitas spell school (Barrier vs Zed/Talon); boostingmarket ("Exhaust → blunting threats") |
| P3 | **Ignite** (and later Grievous Wounds items) | **Healing** | Data Dragon: Ignite "reduces healing effects on them" | Existing `heal` trait (Match-V5 `totalHeal` percentile) | Dignitas ("counter healing champions"); boostingmarket; [wiki summoner spells](https://wiki.leagueoflegends.com/en-us/Ignite). Items are section 5 |
| P4 | **Teleport** instead of Ignite (top) | **Lane you can't win**: un-interactive or ranged | Teleport lets you return to lane without losing minions | Your champion's measured matchup into the lane opponent (`goldAt15` diff, matchup win rate) clearly negative | skill-capped Aatrox ("swap to Teleport in tough or un-interactive lanes like Quinn, Malphite"); Dignitas ("in losing matchups as a safety net"); boostingmarket |

**Decisions in the question that do not depend on the enemy (today):**

- **Armor vs MR shards** no longer exist (above).
- **Magic vs physical damage**: no current rune or shard depends on damage type. Conditioning and Unflinching give both resists, and Bone Plating reduces all damage, "including true damage" ([wiki](https://wiki.leagueoflegends.com/en-us/Bone_Plating)). Magic/physical stays an *item* trait (section 5).
- **Legend row, offense shards, Domination/Sorcery/Inspiration minor runes**: none of the 2024–26 guides we read switch these by enemy, except one Legend: Haste note ("in matchups where you scale or autos aren't as valuable", skill-capped Aatrox). One source isn't enough.

### 1.2 Enemy traits we need (and what we have)

| Trait | Used by | Have today? | How to get it from data |
| --- | --- | --- | --- |
| `engage` (CC dealt) | R4 | yes (`timeCCingOthers` percentile) | — |
| `ccReducible` (CC that tenacity/Cleanse shorten) | S1, P1 | no | `engage` × share of the champion's CDragon `<status>` CC words in the reducible class (§2.5) |
| `heal` | P3 | yes | — |
| `laneRanged` (opponent ranged, you melee) | R1, K1, K3 | no | CDragon `champions/{id}.json` → `tacticalInfo.attackType` ("ranged"/"melee"). Data Dragon `stats.attackrange` also splits cleanly on 26.20: no champion between 225 and 300 range. Shapeshifters (Jayce, Nidalee, Elise) and Kayle get one value: a known gap |
| `lanePoke` (early chip damage) | R1 | no | Timeline `participantFrames[].damageStats.totalDamageDoneToChampions` at minute 10 (or 14), per champion-role, as a percentile among champions in the band. An early number, so it doesn't follow the result much ([timeline fields](https://www.mintlify.com/mangeloni30/agent-lol/api/timeline), [Cassiopeia docs](https://cassiopeia.readthedocs.io/en/stable/cassiopeia/match.html)) |
| `laneBurst` (short combos) | R2, P2 | no | Phase 1: CDragon `roles` includes `assassin`, or melee + high `lanePoke`. Phase 2: `CHAMPION_KILL.victimDamageReceived` (the death recap): the killer's share of the damage and the number of instances inside the recap |
| `assassin` | P2 | no | CDragon `roles` (Riot-authored class tags, e.g. Ahri `["mage","assassin"]`) |
| `frontline`, `physical`, `magic` | items only | yes | Drop from rune lifts (no rune mechanic depends on them) |

---

## 2. Tagging runes from data, not a hand list

### 2.1 What each file offers (inspected 2026-10-09)

| Field | Data Dragon `runesReforged.json` 16.20.1 | CDragon `perks.json` / `perkstyles.json` 26.20 |
| --- | --- | --- |
| IDs, names, tree, row | yes (`slots[].runes[]`) | yes, plus **row labels** (`slotLabel`: "Resistance", "Vitality", …) and slot `type` (`kKeyStone`, `kMixedRegularSplashable`, `kStatMod`) |
| Stat shards | **absent** | yes (IDs 5001–5013, three `kStatMod` rows) |
| Text | `shortDesc`, `longDesc` (plain HTML) | `shortDesc`, `longDesc`, `tooltip` with **semantic markup** (`<scaleArmor>`, `<scaleMR>`, `<healing>`, `<shield>`, `<speed>`, `<status>`, `<trueDamage>`, `<magicDamage>`) and **keyword links** (`LinkTooltip_Description_ImpairMov`, `…_ImpairAct`, `…_Immobilize`, `…_Takedown`, `…_MS`, `…_CDR`, `…_Adaptive`) |
| Riot's own categories | none | `recommendationDescriptorAttributes` on minor runes (`kDurability`, `kHealing`, `kUtility`, `kMoveSpeed`, `kBurstDamage`, `kDamagePerSecond`, `kCooldown`, `kGold`, `kMana`, weights summing to 10); `recommendationDescriptor` text on keystones ("Burst Defenses", "Drain Opponents", "Poke Damage", "Rush of Movement", "Slow Enemies") |
| What Match-V5 `var1..3` mean | none | **`endOfGameStatDescs`**: e.g. Bone Plating `["Total Damage Blocked: @eogvar1@"]` |
| Change marker | none | `majorChangePatchVersion` (e.g. 8230 "16.9") |

Patch alignment: CDragon serves versioned folders (`https://raw.communitydragon.org/16.20/…/perks.json` answers 200). `16.19` and `16.20` are identical for all 103 perks. Fetch the folder matching Data Dragon's version, not `latest`, so tags and names never come from different patches. `packages/ddragon` already fetches `perks.json` and `perkstyles.json` (for shards) from `latest`.

### 2.2 The tagging method (three layers, all from data)

1. **Structure** (`perkstyles.json`): a swap suggestion must replace a **row-mate**, i.e. the same `slotLabel` in the same tree (or, in the secondary tree, any non-keystone row). This is how the client works, and it makes every suggestion a concrete "swap X → Y".
2. **Mechanic tags**: regex rules over the CDragon fields, kept in versioned config (`config/rune-tags.v1.json`, §8). Rules name **game concepts** (trigger: "after taking champion damage", "while crowd-controlled", "after N minutes"; effect: "resists", "flat damage reduction", "missing-health heal", "tenacity"). They never name runes. Riot's `recommendationDescriptorAttributes` is a second, coarser signal (`kHealing`, `kDurability`).
3. **Measured output**: `endOfGameStatDescs` gives each `var` a label. A small label grammar (blocked/mitigated/reduced → *damage prevented*; healing/health restored → *healing*; shield → *shielding*; "seconds … resistances" → *time active*) tells us which Match-V5 number measures the mechanic. §3 uses it to measure the effect against each enemy trait.

Layers 1–2 decide **which runes are candidates** for a trait. Layer 3 **confirms with our own games** that the mechanic actually does more against that trait. A text rule that misfires is then caught by data rather than shown to players.

### 2.3 The rules applied to patch 26.20 (real output)

Output of the rule set in §8 on `perks.json` 26.20 (script run 2026-10-09). The columns are Riot's category, our tags, and the `var` labels:

| ID | Rune | Row | Riot category | Tags from the rules | Match-V5 `var` meaning |
| --- | --- | --- | --- | --- | --- |
| 8444 | Second Wind | Resolve/Resistance | kHealing:10 | trigger.championDamageTaken, effect.missingHealthHeal | v1 Total Healing |
| 8473 | Bone Plating | Resolve/Resistance | kDurability:10 | trigger.championDamageTaken, effect.flatDamageReduction | v1 Total Damage Blocked |
| 8429 | Conditioning | Resolve/Resistance | kDurability:10 | trigger.afterMinutes, effect.resists | v1 % of game active; v2 bonus armor; v3 bonus MR |
| 8242 | Unflinching | Resolve/Vitality | kDurability:4 kUtility:6 | trigger.whileCC, effect.resists | v1 Seconds in combat with bonus resistances |
| 8451 | Overgrowth | Resolve/Vitality | kDurability:10 | trigger.nearMinionsMonsters, effect.maxHealth | v1 Total Bonus Max Health |
| 8453 | Revitalize | Resolve/Vitality | kHealing:10 | trigger.lowHealth, effect.healShieldPower | v1 Bonus Healing; v2 Bonus Shielding |
| 5013 | Tenacity and Slow Resist | Shard/Defense | — | effect.tenacity, effect.slowResist | — (shards have no var) |
| 5011 | Health | Shard/Defense | — | effect.health, effect.maxHealth | — |
| 8437 | Grasp of the Undying | Resolve/keystone | "Drain Opponents" | trigger.everyNSecondsInCombat, effect.heal, effect.maxHealth | v1 damage; v2 healing |
| 8439 | Aftershock | Resolve/keystone | "Burst Defenses" | trigger.ownImpair, effect.resists, effect.maxHealth | v1 damage; v2 Total Damage Mitigated |
| 8021 | Fleet Footwork | Precision/keystone | "Movement, Health Recovery" | trigger.nearMinionsMonsters, effect.heal, effect.moveSpeed | v1 Total Healing |
| 8230 | Stormraider's Surge | Sorcery/keystone | "Rush of Movement" | effect.moveSpeed, effect.slowResist | v1 activations |
| 9111 | Triumph | Precision/Heroism | kDurability:2 kHealing:8 | trigger.takedown, effect.missingHealthHeal, effect.heal | v1 health restored; v2 bonus gold |
| 8139 | Taste of Blood | Domination/Malice | kHealing:10 | effect.heal | v1 Total Healing |
| 8126 | Cheap Shot | Domination/Malice | kBurstDamage:5 kDamagePerSecond:5 | trigger.ownImpair | v1 damage |

Coverage on 26.20: every rune that §1 needs gets the tags its decision uses. Known misses, which is why layer 3 exists:
- Absorb Life gets no text tag (its text, "Killing a target restores health", has no `<healing>` markup); Riot's `kHealing` still catches it.
- "trigger.lowHealth" also fires on Revitalize ("below 40% health"), which is correct but not an enemy trait.

**The `var` meanings were checked against real API payloads, not only the labels:**
- Riot's own Match-V5 sample (gist by RiotTuxedo) has Triumph `var1: 636, var2: 140` (health restored; bonus gold, i.e. 7 takedowns × 20), Conqueror `var1: 527` (healing) and Bone Plating `var1: 438` (damage blocked) ([gist](https://gist.github.com/RiotTuxedo/c8e2d29d12fc1e405ade267def036362)).
- A 2024 Riot developer-relations issue shows Bone Plating `var1: 2278` and Unflinching `var1: 150` ([issue #1018](https://github.com/RiotGames/developer-relations/issues/1018), Dec 2024).

These are two payloads plus the published labels. Riot doesn't document `var1..3` in the API reference, so treat the mapping as **reliable but undocumented**, and check it with a test on fresh matches each season.

### 2.4 Summoner spells, same method

Data Dragon `summoner.json` 16.20.1 descriptions (CLASSIC mode) carry the mechanic:
- Cleanse "Removes all disables (excluding suppression and airborne) … and gives Tenacity";
- Ignite "reduces healing effects";
- Exhaust "reduces their damage dealt";
- Barrier "Gain a brief Shield";
- Heal "Restores Health".

The same rule file tags them (`effect.removesDisables`, `effect.antiHeal`, `effect.reducesTargetDamage`, `effect.shield`, `effect.heal`). The parenthesised exclusion becomes `excludes: airborne, suppression`, the same CC classes as §2.5. There are no `var` stats for spells; evidence for spells is adoption (§3.3) only.

### 2.5 Enemy crowd-control types, from CDragon champion text

CDragon `champions/{id}.json` spell `dynamicDescription` wraps crowd control in `<status>` tags (Ahri E: `<status>Charms</status>`). A config list of **CC verb stems** sorts them into three classes:
- *reducible*: stun, root, snare, charm, fear, flee, taunt, silence, sleep, blind, polymorph, ground, disarm, berserk, immobilize;
- *slow*;
- *unreducible*: knock, airborne, suppress, pull, push, stasis, displace, drowsy.

This vocabulary comes from the [Tenacity](https://wiki.leagueoflegends.com/en-us/Tenacity) mechanic. It is a game rule, not a champion list. On 26.20:

- 173 live champions; 160 have at least one classified CC tag (13 have none, i.e. no hard CC).
- Unclassified words were "disabling" (7), "immobilizing/-ed/-es" (12), "back"/"up" (split "Knocking Back/Up" tags) and "berserk". Add "immobiliz" to *reducible*; treat "disabling" as unknown, i.e. count the CC seconds without a class.
- Examples: Leona reducible 3, slow 2, unreducible 0; Yasuo 0/0/3 (knock-ups only: **tenacity useless, Unflinching still works**); Malzahar 1/0/1 (silence + suppression); Darius 0/2/2 (slow + pull).

With `engage` (how much CC the champion actually lands, measured) this gives `ccReducible = engage × reducibleShare`. Its counterpart, `engage × unreducibleShare`, matters for Unflinching (works on all CC) but not for the tenacity shard or Cleanse.

### 2.6 Pitfalls found

- **ID reuse.** 8230 is "Phase Rush" in CDragon 16.8 and "Stormraider's Surge" from 16.9: same ID, different mechanic. 8 perks changed text between 16.8 and 16.20 (Aftershock, Fleet Footwork, Hail of Blades, Arcane Comet, Aery, Guardian, Jack of All Trades, Stormraider's), and Deathfire Touch (8992) is new. Key rune stats by `(runeId, textHash)` or drop games older than the last text change. Our 30-day window shortens but does not remove the problem.
- **`majorChangePatchVersion` is not reliable on its own.** It says "14.1" for Axiom Arcanist, Sixth Sense, Grisly Mementos and Deep Ward. The wiki dates Nullifying Orb's removal, and these runes' arrival, to V25.S1.1 (game version 15.1). Diffing versioned CDragon texts is the reliable change detector.
- **Old guides.** Several 2024–25 guides still describe Legend: Tenacity, armor/MR shards or tenacity-Unflinching. Data beats articles for the "what does it do now" half; articles are only used for the "which decisions matter" half.

---

## 3. How to explain a suggestion, and the evidence rule

### 3.1 The shape of a reason

One suggestion = one line, at most two clauses:
1. **The enemy fact and the mechanic** (always): what the enemy does + what the rune does about it, worded from tags.
2. **The measured backing** (only if it passes §3.2): preferably the rune's measured output into such teams, otherwise adoption; win rate almost never.

"More people take it against physical teams" can **never** be the first clause: it's why the algorithm noticed the rune, not why the rune works (the owner's point).

### 3.2 The evidence rule (tiers)

Let `T` be the enemy trait, `r` the candidate rune and `x` the rune it would replace (its row-mate on the page).

**Tier 0: no suggestion.** The rune isn't shown if any of these hold:
- `T` is at or below the band cut (current `traitIntensity` = 0);
- no row-mate of a page rune carries a tag that the trait rule (§8, `runeRules`) links to `T`;
- for `ccReducible`: the enemy CC is mostly unreducible (tenacity shard, Cleanse).

**Tier 1: mechanic only, "Worth a look".**
- Needs: trait above the cut, the tag matches, and the rune is a row-mate.
- Shown as an option with clause 1 only.
- The mechanic is a game rule (Riot's text), so this is honest without a number. It stays a hover-level tip, never replaces the page's rune by itself, and is limited to `maxSituational` (3).

**Tier 2: measured mechanic, "Swap".** Tier 1 plus the rune's own output (its `var`, per minute) is higher into high-`T` games than into low-`T` games:
- **ratio ≥ 1.25** (config) and one-sided **z ≥ 3** on the log ratio (Welch);
- computed **separately in wins and in losses**, and both must pass the ratio. The losing side takes more damage, so whole-game rune output follows the result ("Whole-game totals follow the result");
- pooled over all champions that take the rune in that role and band, after dividing each game's output by that champion's median. The mechanic belongs to the rune and the enemy, not to our champion, so pooling is valid and gives thousands of games instead of dozens;
- needs ≥ 30 games on each side in each result stratum (config).

**Tier 3: adoption, extra clause only.** The existing lift (players take `r` more into high-`T` teams), with:
- `z ≥ 3` instead of 2, or Benjamini–Hochberg at q = 0.05 across one snapshot's tests;
- shown as two rates ("38% of Darius players take it into teams like this, 12% usually"), not "2.4×";
- never the only reason.

**Tier 4: win, extra clause only, rarely.** The within-champion win-rate difference of `r` vs `x` in high-`T` games:
- pooled across champions with Mantel–Haenszel (stratified by champion-role), lower bound of the 95% CI > 0, and ≥ 2,000 games per arm;
- shown as "+x points", never "wins 2% more" for one champion.

Why the bar is high:

- **Effect size.** Same-champion differences between Bone Plating, Second Wind and Conditioning are 0.1–0.7 points ([metabot.gg](https://metabot.gg/en/league/rune/8473/compare), 158,864 games, patch 26.19).
  - To detect a 2-point difference at 50% win rate (two-sided α 0.05, power 0.8) you need n = (1.96 + 0.84)² · 2 · 0.25 / 0.02² ≈ **9,800 games per arm**; 1 point ≈ 39,200.
  - A band has 15–60k games, i.e. about 1,000 per champion-role on average. Per-champion rune win claims are therefore below the noise floor; only pooled tests can ever pass.
- **Selection.**
  - Situational runes are taken *because* the lane is hard (e.g. Second Wind into a ranged counter), so their raw win rate is biased down.
  - The reverse happened with shards: Riot found that wrong shard choices made some mages look "more powerful than stats would suggest" ([14.2 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-2-notes/)).
  - Raw win rate per rune is therefore not a reason.
- **Multiple testing.**
  - Today's lift runs about 30 runes × 5 traits per champion-role build (≈ 250 builds per band), tens of thousands of tests. At z ≥ 2 (one-sided p ≈ 0.023), hundreds of lifts would pass by chance even if nothing were real.
  - Restricting to tag-matched (rune, trait) pairs cuts the tests about 25×, and z ≥ 3 (p ≈ 0.0013) leaves about 2 false lifts per band.
- **Matchup sample sizes on the big sites are tiny.** Lolalytics' Urgot-vs-Lulu matchup page rests on **3 games** ([lolalytics](https://www.lolalytics.com/lol/urgot/vs/lulu/build/?vslane=top)); op.gg shows shards only in aggregate (e.g. "Adaptive Force 65.16%, 3,688 games, 49.43% win rate", [op.gg Darius](https://www.op.gg/lol/champions/darius/runes/top)). Showing "highest-win" matchup pages without a test is what we should avoid.

### 3.3 Templates (slots only; each under 90 characters)

Proposed for `config/explain.v1.json` → `templates`. `{effect}` is filled from the tag phrases in `runeEffects` below (wording per *tag*, not per rune). `{stat}` is filled from the `var` label grammar.

```json
{
  "templates": {
    "loadout.rune.swap": "Swap {from:rune} → {to:rune}: {why}",
    "loadout.rune.why.lanePoke": "{enemy:champion} pokes you from range; {to:rune} {effect}",
    "loadout.rune.why.laneBurst": "{enemy:champion} trades in quick combos; {to:rune} {effect}",
    "loadout.rune.why.engage": "{count} of them crowd-control you in fights; {to:rune} {effect}",
    "loadout.rune.why.ccReducible": "{count} of them stun, root or charm; {to:rune} {effect}",
    "loadout.rune.why.laneQuiet": "No poke or burst threat in lane; {to:rune} {effect}",
    "loadout.rune.measured": "Into teams like this it {stat} {ratio}× as much a minute ({games} games)",
    "loadout.rune.adoption": "{share:pct}% of {champion:champion} players take it into teams like this ({base:pct}% usually)",
    "loadout.rune.won": "{delta:signedPct1} points with it vs {from:rune} in such games ({games} games)",
    "loadout.shard.ccReducible": "{count} of them stun, root or charm: tenacity cuts that short",
    "loadout.shard.ccUnreducible": "Their crowd control is knock-ups: tenacity won't help, keep Health",
    "loadout.spell.why": "{spell:spell} into this team: {reason}",
    "loadout.page.matchup.adoption": "Into {enemy:champion}: {count} of {games} players switch to this page"
  },
  "runeEffects": {
    "trigger.championDamageTaken+effect.missingHealthHeal": "heals back chip damage between trades",
    "trigger.championDamageTaken+effect.flatDamageReduction": "blocks part of their next three hits",
    "trigger.afterMinutes+effect.resists": "adds armor and magic resist later in the game",
    "trigger.whileCC+effect.resists": "gives armor and magic resist while you're crowd-controlled",
    "effect.tenacity": "shortens stuns, roots and slows",
    "effect.removesDisables": "removes stuns and roots (not knock-ups or suppression)",
    "effect.antiHeal": "cuts their healing",
    "effect.reducesTargetDamage": "cuts one diver's damage",
    "effect.shield": "absorbs a burst"
  },
  "runeStats": {
    "healing": "healed",
    "damagePrevented": "blocked",
    "timeActive": "was active"
  }
}
```

Examples (all numbers would come from the engine, these are illustrative):
- "Swap Bone Plating → Second Wind: Teemo pokes you from range; Second Wind heals back chip damage between trades"
- "Into teams like this it healed 1.6× as much a minute (2,140 games)"
- "3 of them stun, root or charm: tenacity cuts that short"

A fixed phrase like "(not knock-ups or suppression)" restates Data Dragon's own text. If the parsed exclusion list changes in a patch, the test in §8 fails, so the wording can't silently go stale.

---

## 4. When to suggest a different keystone or secondary tree

**Evidence found:**
- Guides switch keystones by matchup routinely: K'Sante Grasp → Aftershock into ranged; Aatrox Conqueror → Electrocute into ranged; Ornn Grasp → Aery into Vayne/Quinn; Fleet "in hard poke or range matchups" (sources in R1–K1).
- **We found no published measurement showing that matchup-specific pages beat the standard page in solo queue.** Searched: arXiv/Google Scholar ("rune recommendation", "rune enemy team composition"); competitor docs (op.gg, lolalytics, u.gg via search, metabot); Riot's rune recommender; GitHub.
- The only "matchup-aware runes" project found ([lol-rune-ai](https://github.com/marcusamm/lol-rune-ai)) is an unvalidated prototype.
- Riot's own client recommender (since 12.23) is role-based and per patch, not per matchup ([leagueclassic rune recommender](https://leagueclassic.wiki/tools/rune-recommender/), [hexgate on rune import](https://hexgate.app/blog/auto-import-runes-lol/); dotesports' original article was blocked).
- Opinion, marked as such: the mechanics argument for K1 is strong (Grasp needs your autos on a champion; a ranged opponent denies them), so the guides' consensus is plausible. The size of the win effect is unknown.

**Rule:**

1. **Keystone or tree changes only through the matchup page**, never through a tag rule. Which keystone replaces Grasp depends on the champion's kit (Aftershock for K'Sante, Electrocute for Aatrox). Data (what players of *this* champion do into *this* opponent) is the only non-hand-written source.
2. Suggest the matchup page when all of these hold:
   - your band (plus the band above) has ≥ `minMatchupGames` games of the matchup (raise from 25 to **50**);
   - the matchup's most common page differs from the usual page in keystone or secondary tree;
   - its adoption into this opponent is significantly above its base adoption (z ≥ 3, same test as the lift);
   - **and** a mechanic flag supports it: for K1, `laneRanged` (you melee, they ranged); for a change to a sustain or resists tree, `lanePoke` or `laneBurst`.
3. The reason is adoption + the mechanic flag ("Into Quinn: 41 of 80 players switch to Aftershock; she's ranged, so Grasp procs less"), **not the matchup win rate.** Today's `loadout.page.matchup` template shows a win rate from as few as 25 games (± 10 points of noise); replace it with the adoption template above.
4. Without a matchup page, a ranged opponent produces at most a Tier-1 note on the keystone ("Grasp needs autos on them; they're ranged"), not a suggested page.
5. Shards and minor-rune swaps from §1 apply on top of whichever page is chosen.

---

## 5. Stat shards: what sites recommend by matchup, and why

- **Big sites:**
  - **op.gg** shows shards only as aggregate pick and win rate per champion and role, with no matchup advice ([op.gg Darius runes](https://www.op.gg/lol/champions/darius/runes/top));
  - **lolalytics** has matchup pages with rune pages per opponent but tiny samples (3 games in the example above);
  - **u.gg** and **Mobalytics** pages could not be fetched (403). Search summaries describe u.gg as showing "every rune option with its actual win rate contribution" and filters by opponent ([noping 2026](https://noping.com/blog/op-gg-u-gg-mobalytics-e-lolpros-como-usar-dados-para-subir-de-elo-no-lol-em-2026)): data, no stated reasoning.
- **Guides:** the only shard choice they still tie to the enemy is **Tenacity vs Health in the defense row**, against heavy *reducible* CC. Sources: skill-capped Ornn 26.20; unrankedsmurfs 2025; search-summarised 2025–26 guides including "if their engage is knockups and suppression, tenacity does nothing at all"; [wiki: Tenacity](https://wiki.leagueoflegends.com/en-us/Tenacity) for the mechanic.
  - Conflict: whether scaling health is ever right in the flex row ("almost never" vs "defensible top"). No enemy-based rule there.
- **Riot's intent** (14.2): remove the obvious armor-vs-MR read and make the rows "Adaptive Force vs Move Speed / Tenacity vs Durability", "not as punishing when improperly selected" ([14.2 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-2-notes/)). Shard choices matter less than before by design.

**Recommendation:**
- Keep the page's shards (most common or best common).
- Suggest one swap only: **defense row Health → Tenacity when `ccReducible` is high**; reverse it ("keep Health") when the team's CC is mostly unreducible.
- Shards have no `var` output, so evidence stops at Tier 1 + Tier 3 (adoption).

---

## 6. The same structure for items (section 5)

The same pattern carries over:
- **traits** (§1.2) → **tags** from data: Data Dragon items have `tags` (e.g. "SpellBlock", "Armor", "Tenacity", "LifeSteal"), `stats` and descriptions with `<passive>`/keyword markup;
- **Tier 1** mechanic → **Tier 2** measured mechanic (no `var` for items; use item-specific, early-game outcomes) → **Tier 3** adoption → **Tier 4** win.

For items the damage-type traits (`magic`, `physical`) are valid, because resist items are damage-type specific. Mercury's Treads answers `ccReducible`, and Grievous Wounds items answer `heal`.

---

## 7. Self-check

- Every numbered question is answered:
  - Q1 in §1 (table, with mechanic and detection);
  - Q2 in §2 (method with real 26.20 output; limits stated);
  - Q3 in §3 (templates and tiered evidence rule with sample sizes);
  - Q4 in §4 (rule; "no published evidence" stated with what was searched);
  - Q5 in §5 (site practices; two sites unreachable, said so).
- Nothing hardcoded:
  - every rune, champion and number comes from CDragon, Data Dragon or our collector;
  - config holds only concept regexes, CC verb classes (a game rule from the Tenacity page) and wording per tag;
  - rune names in this file are examples from the 26.20 data, not inputs.
- Riot rules: suggestions only (the import button stays the existing flag-gated writer); enemy data is champion-level aggregate, with no player identities; champ select only.
- Statistics: whole-game rune outputs are stratified by result; win numbers need pooled tests with ≥ 2,000 per arm; adoption is never the only reason.
- Claims with three or more independent sources: R1, R2, S1, P1, P2, P3, P4, K1. R4, K2 and K3 are marked weaker. Mechanics come from Riot's own files (one official source suffices).
- JSON below is valid and fits the current shapes: `meta.v1.json` `builds.lift`, `engine.v1.json` `loadout`, `explain.v1.json` `templates`.

---

## 8. What to change in the code or config

1. **Keep rune outputs.**
   - `packages/riot-api/src/schemas.ts` / `summarize.ts`: keep `var1..var3` per selection (`perks.vars: number[][]`, 6 × 3 ints per participant).
   - Add the lane opponent's timeline `damageStats.totalDamageDoneToChampions` at minutes 10 and 14 to the summary.
   - Optional, phase 2: per-kill `victimDamageReceived` instance counts for `laneBurst`.
2. **New champion attributes** (`ChampionAttributes`, built in `packages/meta`):
   - `attackType` and `roles` (from CDragon `champions/{id}.json`, in `packages/ddragon`);
   - `ccClasses` (shares of reducible / slow / unreducible `<status>` words);
   - `lanePoke` (percentile of early damage to champions).
   - New traits `ccReducible`, `lanePoke`, `laneRanged`, `laneBurst`, `assassin` in `ENEMY_TRAITS` for runes and spells. Keep `magic`/`physical`/`frontline` for items only.
3. **Rune tags** in `packages/ddragon`:
   - fetch `perks.json`/`perkstyles.json` from the versioned CDragon folder matching the Data Dragon version, not `latest`;
   - compute tags with the rules below;
   - store a `textHash` per rune;
   - a Vitest test fails if a rune row-mate of a trait rule ends up with no tags, or if a `var` label doesn't parse.
4. **Rune stats keyed by text version**: drop games played before a rune's last text change (by diffing versioned CDragon files), so Phase Rush games never count for Stormraider's Surge.
5. **`packages/meta/src/builds.ts`**:
   - add `runeEffects` (Tier 2: per rune × trait, the pooled per-minute output ratio, stratified by result, with z);
   - restrict `lift` to tag-matched (rune, trait) pairs and raise `minZ` to 3;
   - add the pooled Mantel–Haenszel win test (Tier 4).
6. **`packages/engine/src/loadout.ts`**:
   - `situationalRunes` becomes a list of row-mate swaps (`from`, `to`) gated by `runeRules`;
   - reasons follow §3.1 (mechanic first, then measured, adoption or win);
   - the matchup page needs the §4 conditions and uses the adoption template;
   - add the defense-shard swap and the second-summoner swap with the same rules.
7. **Remove** `templates.loadout.rune.lift.magic` and `…physical` (no rune mechanic depends on damage type). Keep the item ones.
8. **Config** (all valid JSON):

`config/rune-tags.v1.json` (new):

```json
{
  "version": 1,
  "description": "Rune and summoner-spell tags from CommunityDragon perks.json / Data Dragon summoner.json text and markup, plus the crowd-control classes of champion <status> words. Rules name game concepts, never runes or champions.",
  "perkRules": {
    "trigger.championDamageTaken": { "field": "longDesc", "re": "after taking damage from an enemy champion" },
    "trigger.whileCC": { "field": "longDesc", "re": "(while|when) (afflicted with |receiving )?crowd control|crowd controlled" },
    "trigger.afterMinutes": { "field": "longDesc", "re": "after [0-9]+ min" },
    "trigger.lowHealth": { "field": "longDesc", "re": "below [0-9]+% (of your )?(max(imum)? )?health" },
    "trigger.takedown": { "field": "keywords", "re": "Takedown" },
    "trigger.ownImpair": { "field": "keywords", "re": "ImpairMov|ImpairAct|Immobilize" },
    "trigger.nearMinionsMonsters": { "field": "longDesc", "re": "minions|monsters" },
    "trigger.everyNSecondsInCombat": { "field": "longDesc", "re": "every [0-9]+s in combat" },
    "effect.resists": { "field": "markup", "re": "scaleArmor|scaleMR" },
    "effect.flatDamageReduction": { "field": "longDesc", "re": "deal [^.]*less damage" },
    "effect.missingHealthHeal": { "field": "longDesc", "re": "missing health" },
    "effect.heal": { "field": "markup", "re": "^healing$" },
    "effect.healShieldPower": { "field": "longDesc", "re": "heals? and shields?" },
    "effect.shield": { "field": "markup", "re": "^shield$" },
    "effect.maxHealth": { "field": "markup", "re": "scaleHealth" },
    "effect.moveSpeed": { "field": "markup", "re": "^speed$" },
    "effect.tenacity": { "field": "text", "re": "tenacity" },
    "effect.slowResist": { "field": "text", "re": "slow resist" }
  },
  "spellRules": {
    "effect.removesDisables": { "re": "removes all disables" },
    "effect.antiHeal": { "re": "reduces healing" },
    "effect.reducesTargetDamage": { "re": "reduces their damage" },
    "effect.shield": { "re": "shield" },
    "effect.heal": { "re": "restores health" }
  },
  "spellExclusions": { "re": "\\(excluding ([^)]+)\\)" },
  "statLabels": {
    "damagePrevented": "blocked|mitigated|reduced",
    "healing": "healing|health restored",
    "shielding": "shield",
    "timeActive": "seconds .*resist|percent of game active"
  },
  "ccClasses": {
    "reducible": "stun|root|snare|charm|fear|flee|taunt|silenc|sleep|blind|polymorph|ground|disarm|berserk|immobiliz",
    "slow": "slow",
    "unreducible": "knock|airborne|suppress|pull|push|stasis|displace|drowsy"
  }
}
```

`config/engine.v1.json` → `loadout` (new keys next to the current ones):

```json
{
  "runeRules": [
    { "trait": "lanePoke", "laneOnly": true, "requireTags": ["trigger.championDamageTaken", "effect.missingHealthHeal"] },
    { "trait": "laneBurst", "laneOnly": true, "requireTags": ["trigger.championDamageTaken", "effect.flatDamageReduction"] },
    { "trait": "engage", "laneOnly": false, "requireTags": ["trigger.whileCC", "effect.resists"] },
    { "trait": "ccReducible", "laneOnly": false, "requireTags": ["effect.tenacity"], "shardRow": "Defense" }
  ],
  "spellRules": [
    { "trait": "ccReducible", "requireTags": ["effect.removesDisables"], "roles": ["bottom", "middle"] },
    { "trait": "assassin", "requireTags": ["effect.reducesTargetDamage"] },
    { "trait": "heal", "requireTags": ["effect.antiHeal"] }
  ],
  "minUnreducibleShareToBlockTenacity": 0.5,
  "minMatchupGames": 50,
  "matchupPageMinZ": 3
}
```

`config/meta.v1.json` → `builds` (`lift` changed, `runeEffects` and `runeWin` new):

```json
{
  "lift": { "priorGames": 20, "minGames": 10, "minLift": 1.3, "maxPerBuild": 12, "minZ": 3, "tagMatchedOnly": true },
  "runeEffects": { "minGamesPerStratum": 30, "minRatio": 1.25, "minZ": 3, "perMinute": true, "stratifyByResult": true, "normalizeByChampionMedian": true },
  "runeWin": { "minGamesPerArm": 2000, "ciLevel": 0.95, "pooled": "mantelHaenszelByChampionRole" }
}
```

9. **Measure on the production copy before shipping** (we don't know these yet):
   - (a) the distribution of Second Wind / Bone Plating / Unflinching `var1` per minute by `lanePoke` / `engage` side, in wins and losses separately, to calibrate `minRatio`;
   - (b) how many (rune, trait) pairs pass Tier 2 per band;
   - (c) how many matchup pages pass the §4 test with `minMatchupGames: 50`;
   - (d) how often `ccReducible` is high but the CC is mostly unreducible (the case where today's lift would wrongly suggest tenacity).

## Sources

Riot and data files:
- [Patch 14.2 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-2-notes/) (Jan 2024).
- [CDragon perks.json](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json) and perkstyles.json (16.20, also 16.19 and 16.8 for diffs).
- [Data Dragon runesReforged 16.20.1](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/runesReforged.json); summoner.json and champion.json 16.20.1.
- CDragon `champions/{id}.json` (all 173).
- [Riot Match-V5 sample gist](https://gist.github.com/RiotTuxedo/c8e2d29d12fc1e405ade267def036362); [developer-relations #1018](https://github.com/RiotGames/developer-relations/issues/1018) (Dec 2024).

League wiki (read 2026-10-09):
- [Rune](https://wiki.leagueoflegends.com/en-us/Rune) (V26.06);
- [Unflinching](https://wiki.leagueoflegends.com/en-us/Unflinching), [Bone Plating](https://wiki.leagueoflegends.com/en-us/Bone_Plating), [Second Wind](https://wiki.leagueoflegends.com/en-us/Second_Wind), [Conditioning](https://wiki.leagueoflegends.com/en-us/Conditioning), [Tenacity](https://wiki.leagueoflegends.com/en-us/Tenacity).

Guides:
- skill-capped patch 26.20: [Ornn](https://www.skill-capped.com/lol/guides/builds/ornn/top), [Aatrox](https://www.skill-capped.com/lol/guides/builds/aatrox/top), [K'Sante](https://www.skill-capped.com/lol/guides/builds/ksante/top);
- [riftfeed](https://riftfeed.gg/guides/lol-runes-how-important-are-bone-plating-and-second-wind) (2024-02-01);
- [unrankedsmurfs tenacity](https://www.unrankedsmurfs.com/blog/league-of-legends-tenacity-explained) (2025-01);
- [lolnow tenacity](https://lolnow.gg/lol-tenacity/) (outdated, cited as such);
- Dignitas [spell rundown](https://dignitas.gg/articles/blogs/League-of-Legends/14636/summoner-spell-rundown-a-guide-for-league-of-legends) (2020-08, checked against 26.20 spell text) and [spell school](https://dignitas.gg/articles/blogs/League-of-Legends/14039/summoner-spell-school-a-league-of-legends-guide);
- [boostingmarket spells](https://boostingmarket.com/blogs/lol-summoner-spells-guide/).

Data sites:
- metabot.gg [Bone Plating compare](https://metabot.gg/en/league/rune/8473/compare) (26.19), [Stormraider's](https://metabot.gg/en/league/rune/8230/overview), [Unflinching](https://metabot.gg/en/league/rune/8242/overview);
- [op.gg Darius runes](https://www.op.gg/lol/champions/darius/runes/top);
- [lolalytics Urgot vs Lulu](https://www.lolalytics.com/lol/urgot/vs/lulu/build/?vslane=top).

News on 2024–26 rune changes:
- [esports.gg](https://esports.gg/news/league-of-legends/deathfire-touch-stormraiders-surge-returns-in-lol-2026-season-2/), [hexgate](https://hexgate.app/blog/deathfire-touch-stormraiders-surge/);
- [GameLeap 14.10](https://www.gameleap.com/articles/lol-patch-14-10-all-new-runes-and-rune-changes), [Dexerto 14.2](https://www.dexerto.com/league-of-legends/league-of-legends-patch-14-2-notes-2467731/), [GameRiv 14.2](https://gameriv.com/new-rune-shard-changes-in-lol-patch-14-2/).

Timeline fields: [agent-lol timeline docs](https://www.mintlify.com/mangeloni30/agent-lol/api/timeline), [Cassiopeia match docs](https://cassiopeia.readthedocs.io/en/stable/cassiopeia/match.html).

Searched without finding rune-specific evidence: arXiv/Scholar "rune recommendation" (found only champion and item recommenders: [DraftRec](https://arxiv.org/pdf/2204.12750), [item recommender thesis](https://www.cs.ru.nl/bachelors-theses/2019/Robin_Smit___4043561___A_machine_learning_approach_for_recommending_items_in_League_of_Legends.pdf)), [lol-rune-ai](https://github.com/marcusamm/lol-rune-ai).

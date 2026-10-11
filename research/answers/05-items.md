# 5. Items: the item engine

Research run 2026-10-09 against the live game data of that day: Data Dragon `16.20.1`, CommunityDragon `16.20` (the public patch 26.20). Status: done (first full version; see "Open leads" at the end).

Access note: u.gg, mobalytics.gg and medium.com block our fetcher (HTTP 403), so they are seen only through search summaries and are never the only source for a claim. Riot's /dev blog, lolalytics, metabot.gg, buildzcrank, loltheory, the League wiki, two arXiv/academic PDFs and a 2024 master's thesis (Aalto University) were read in full. The Riot data files were downloaded and inspected with scripts (kept outside the repo; their output is quoted below).

## Summary (the strongest findings)

1. **Our "win added" is a known method with a name: Win Probability Added (WPA).**
   - Sports analytics has used it since the 1970s ([MLB glossary](https://www.mlb.com/glossary/advanced-stats/win-probability-added), [Tango wiki archive](https://tangotiger.net/wiki_archive/Win_Probability_Added.html)).
   - A 2024 master's thesis formalised it for League items: it trained an in-game win model on 400,000 patch-14.15 games and ranked Shen's first items by mean WPA ([Jalovaara 2024, Aalto](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf)). Its author later founded coachless.gg.
   - Two 2026 commercial sites use the same idea: [buildzcrank](https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/) ("purchase win probability", "win probability added") and [loltheory](https://blog.loltheory.gg/in-game-item-recommendations/) (corrects for gold differences).
   - So the direction is right. Our weak points are the **state model** (minute × team gold, coarse bins), the **timing of the state** (we take it at completion, which is partly after the decision), and the **lack of a significance test**.
2. **Nobody publishes a causal item effect with a confidence interval.**
   - The academic item recommenders (Dota 2 and League, 2018–2023) learn *what players, or winners, bought*. They are scored on "did we predict the next purchase" (Recall@k), not on win effect ([Dallmann et al. 2022](https://arxiv.org/pdf/2201.08724); [Novack, HT4Rec4U](https://zacharynovack.github.io/lol_item_rec.pdf)).
   - The one outcome-based League recommender found puts items into an ANN win predictor and explains it with LIME. It used 1,000 matches and has no confounding control ([Smit 2019, Radboud BSc](https://www.cs.ru.nl/bachelors-theses/2019/Robin_Smit___4043561___A_machine_learning_approach_for_recommending_items_in_League_of_Legends.pdf)).
   - The thesis's own headline (Titanic Hydra +1.46 points vs Sunfire −0.51, n = 2,189 and 3,004) is **not significant** by our bar: the standard error of that difference is about 1.4 points (§2.3).
   - Item effects are 0–2 points. At a band's ~1,000 games per champion-role they cannot be resolved per champion. **Popularity is the right default. Win numbers should override it only with a pooled test that passes** (§2.4).
3. **Riot ships its own "what this item counters" tags, and we can read them.**
   - CommunityDragon's `items.cdtb.bin.json` (the game's own item data, 16 MB) has 22 `ItemAdviceAttribute` records. Each pairs an item property with the enemy property it answers: `HealingReduction → Healing`, `Tenacity → CC`, `AntiSuppression → StrongCC`, `MagicResist → AP`, `Armor → AD`, `AntiShielding → Shields`, `CritDamageReduction → Crit`, `AutoAttackDamageReduction → Attacks`, `PercentArmorPen → HighArmor`, …
   - 70 of the 118 completed Summoner's Rift items carry at least one of them (§3.2). This is the item counterpart of the rune `recommendationDescriptorAttributes` found in [04-runes.md](04-runes.md) §2.1.
   - It's Riot's classification, read every patch, with no hand list.
4. **Data Dragon alone gets only part of the way.**
   - Its `tags` and `stats` give resist types (Armor, SpellBlock) reliably.
   - But `stats` has no tenacity, penetration or ability haste, and **no tag marks Grievous Wounds or anti-shield**. Those live only in the description text (`<keyword>40% Wounds</keyword>`, `Shield Reaver`).
   - It also marks 36 Arena and alternate-mode copies (IDs ≥ 100000, e.g. 323075 "Thornmail", 2,650 gold) as available on map 11. `completedItems()` would accept them today.
5. **First-item timing should be split into two habits, not shown as one number.**
   - "14:30 vs typical 13:10" mixes *income* (CS, kills: when you had earned the item's cost) and *spending* (how long gold sat unspent before you went back).
   - Match-V5 timelines have both `totalGold` and `currentGold` per minute. We store only `totalGold` today.
   - Each half is a measured fact about the player's own game with a clear action. Neither needs a correlational "players who finish earlier win more" claim (§4).

---

## 1. How the big sites rank items, and what is wrong with item win rates

### 1.1 What the sites do (checked 2026-10-09)

| Site | Ranking rule | Source |
| --- | --- | --- |
| **u.gg** | "Recommended build" = the **most frequent** build whose win rate is **above the champion's baseline**. Default filter: most common role, Platinum+, all regions, current patch. Shows "Core items" (3) then "Fourth/Fifth item options". | u.gg FAQ via search summary (403 to our fetcher); same wording on its build pages ([Ornn](https://u.gg/lol/champions/ornn/build)) and in [lolnow's u.gg guide](https://lolnow.gg/u-gg/) |
| **lolalytics** | Item columns per slot (1st…6th) with win rate, pick rate and games. Separate "Highest win" and "Most common" builds. Set statistics three ways: *Exact* ("no more, no less are built"), *Actually built* (3–5 item sequences) and *Extrapolated* (combined from per-item progressions). Sett 16.20: 22,162 games; e.g. "Overlord's Bloodmail 58.76% \| 708". | [lolalytics Sett](https://lolalytics.com/lol/sett/build/) (read in full) |
| **op.gg** | Build blocks (starters, boots, core 3-item sets) by pick rate with win rate beside them. | [op.gg Darius runes/items](https://www.op.gg/lol/champions/darius/runes/top) (seen in 04-runes); no methodology page found |
| **metabot.gg** | A table of every item ranked **by raw win rate**. Mejai's Soulstealer tops it at 76.2% win rate with 1.39% pick rate (26.19). No method or sample size stated. | [metabot items](https://metabot.gg/en/league/items/win-rate) (read in full) |
| **Mobalytics** | Curated builds by its own coaches next to stats. | search summaries only; no method page found |
| **Riot (in-game shop)** | "Based on internal patch-to-patch data for optimal purchases on the played champion, on average." Effective against specific enemies, updates as you and the enemies buy items. | [wiki: Shop](https://wiki.leagueoflegends.com/en-us/Shop); the counters live in the game files (§3.2) |
| **buildzcrank / loltheory / coachless** (2026) | Purchase-time win probability and win probability added, adjusted for gold state. | [buildzcrank](https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/), [loltheory](https://blog.loltheory.gg/in-game-item-recommendations/), [mein-mmo on coachless](https://mein-mmo.de/en/youtuber-writes-masters-thesis-on-lol-creating-the-strongest-jungler-of-the-new-season,1554268/) |

Takeaway: the big three sites rank by **popularity first**, with win rate as a filter (u.gg) or a column beside it (lolalytics, op.gg). Only the small newer sites try to remove purchase-state bias, and none of them publishes a significance test.

### 1.2 The criticism (at least 3 sources each)

| Bias | What happens | Sources |
| --- | --- | --- |
| **Purchase state** ("win-more") | Items bought when ahead look strong, items bought when behind look weak. Mejai's ~76–80% because "you only buy Mejai's after you've built an early lead"; defensive items look bad because they are bought when losing ("Zhonya's paradox"). | Riot: "Winrate has long been an unreliable stat for judging an item's power because purchase timings and champion selection so heavily biased these numbers" ([/dev: Updated approach to item balancing](https://www.leagueoflegends.com/en-gb/news/dev/dev-updated-approach-to-item-balancing/), Sep 2020); [loltheory](https://blog.loltheory.gg/in-game-item-recommendations/); [buildzcrank](https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/) (Jul 2026); [Jalovaara 2024](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf) §4.2 "Action selection bias" |
| **Slot / order** | Items without a fixed slot can't be compared by win rate. Riot judged Mythics by win rate *only* because they competed for the same first slot at a similar price; for Legendaries it used purchase rate only. | [Riot /dev 2020](https://www.leagueoflegends.com/en-gb/news/dev/dev-updated-approach-to-item-balancing/); lolalytics' per-slot columns; Jalovaara restricts to the *first* legendary for the same reason |
| **Game length (survivorship)** | 4th–6th items exist only in long games, and long games have their own win rate per champion. | [Jalovaara](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf) §5.1 (late-game samples "significantly smaller"); our own [REVIEW-2026-10](../REVIEW-2026-10.md) §4 ("late items exist only in long games") |
| **Enemy composition** | Situational items follow the enemy draft, which has its own win chance. Jalovaara found Sunfire Aegis vs magic laners "only purchased … when Shen's team is winning". | [Jalovaara](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf) Table 9; [REVIEW-2026-10](../REVIEW-2026-10.md) §4; [loltheory](https://blog.loltheory.gg/in-game-item-recommendations/) ("actual enemy matchups") |
| **Who buys it** | Off-meta items are bought by one-tricks, so the item's win rate is partly the player's skill ("one-trick tax"). The popular default is bought by everyone, including wrongly. | [loltheory](https://blog.loltheory.gg/in-game-item-recommendations/); [Jalovaara](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf) ("the default option … incorrectly being bought in every scenario, possibly deflating its" WPA) |
| **Noise** | One player's choice moves the team's result little, and teammates' play hides it. Effects must be averaged over thousands of purchases. | [Jalovaara](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf) §4.2 item 3; [Hardball Times, 10 lessons on WPA](https://tht.fangraphs.com/10-lessons-i-have-learned-about-win-probability-added/) (2014: WPA "is still not as predictive" as context-neutral stats) |

Conflicting view: Riot (2020) treats win rate as **valid for a fixed slot with similar prices**. That is the strongest argument *for* comparing items **within a slot**, as we do. It supports per-slot ranking. It doesn't rescue raw win rate across slots.

---

## 2. Is "win added at purchase time" a known method? Better ones

### 2.1 What we do today

`packages/meta/src/builds.ts` (`ExpectedWinFitter`, `winAdded`):
- A band-wide table gives E(win | minute bin, team gold-difference bin): bins at 10/15/20/25/30 min and ±1k/2.5k/5k gold, smoothed toward 50%.
- For each completed item in slot k, it sums (result − E(state at the completion second)), shrunk by `winAddedPriorGames: 300`.

This is exactly Jalovaara's "mean win probability added" with the effect window running to game end:

> W(d) = w(z) − w(x), averaged over purchases d of item a in similar states; "the player should select the action with the highest mean win probability added in states similar to x" ([Jalovaara 2024](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf), eq. 4–10).

Because w(z) = the result at the end, our version equals his.

### 2.2 Where it goes wrong (each one fixable)

1. **The state is taken after the decision.**
   - We read the state at the **completion** second. Completion time depends on the item's price (2,800 vs 3,300 gold) and on how the game went while building it.
   - The decision is made earlier: when the previous item finished, or when the first component was bought.
   - Measuring at completion lets a cheap item "inherit" an earlier, often better, state. Causal-inference texts call this conditioning on a post-treatment variable. Robins' g-methods exist exactly because, in sequential decisions, later states are affected by earlier choices ("treatment-confounder feedback", [Naimi, Cole & Kennedy 2017, PMC5308856](https://pmc.ncbi.nlm.nih.gov/articles/PMC5308856); [MetricGate: marginal structural models](https://metricgate.com/docs/marginal-structural-model/); [sequential g-estimation](https://metricgate.com/docs/sequential-g-estimation)).
   - Fix: take the state at the **decision point** (§2.4).
2. **The state model is too coarse.**
   - ±1k gold is one bin, and lane state is invisible (REVIEW §4).
   - The thesis model uses positions, levels, gold, damage dealt and taken, and K/D/A per player (Table 5), and reaches 75.9% accuracy with 0.90% calibration error.
   - We don't need a neural net, but we need at least team gold diff (continuous), the **player's lane gold diff**, minute, and the enemy traits the item answers.
3. **Comparison against "nothing".**
   - Win added compares an item with "the average team in this state". It does not compare it with the **alternatives the player had at that slot**.
   - Anything that makes *every* purchase look good (e.g. completing on time) is credited to whichever item is popular.
   - The decision question is "A or B here", so compare A with B at the same decision point.
4. **No significance test.** `winAddedPriorGames` shrinks toward 0 but never asks whether the difference is real. With per-item n of 50–500 the standard error is 2–7 points (§2.3). Most of today's ordering is noise. That fits the backtest: our #1 matches the most-bought item less often (46.9% vs 49.2%), and the gain for following it (+0.5 vs −0.2) has no interval.
5. **Late slots are survivorship-biased.** Slot 4+ exists only in games that lasted. Compare items only **within a slot and within game-length strata**, or restrict win numbers to slots 1–3 (as Riot and Jalovaara did).
6. **The backtest scores imitation.**
   - "Top-1 equals the most-bought item" is the recommender-paper metric (Recall@1). It rewards copying.
   - A better engine *should* disagree with popularity sometimes. The right check is held-out **value**: did games that followed our pick do better *than comparable games that didn't*, with a confidence interval (§2.5)?

### 2.3 How much data an item claim needs

A WPA residual (result − expected) has variance ≈ E[w(1−w)] ≈ 0.24 for w in 0.4–0.6.
- **Standard error of one item's mean WPA:** √(0.24/n). That is 1.1 points at n = 2,000, 2.2 at 500, 4.9 at 100.
- **Comparing two items A vs B:** SE = √(0.24/nA + 0.24/nB).
  - Jalovaara's Titanic Hydra (n 2,189) vs Sunfire (n 3,004): SE ≈ 1.39 points, difference 1.97 → z ≈ 1.4, **not significant at 95%**.
  - His Heartsteel vs Sunfire into magic laners (n 304 vs 213): SE ≈ 4.4 points for a 0.5-point difference. Pure noise, which he labels "tentative".
- **Detecting a 2-point difference** at α = 0.05 two-sided with power 0.8 needs n ≈ (1.96 + 0.84)² · 2 · 0.24 / 0.02² ≈ **9,400 purchases per item**. A 1-point difference needs about 37,600. (Same arithmetic as 04-runes §3.2.)
- **What a band can supply:** 15–60k games, i.e. ~1,000 per champion-role and ~400 for the 2nd most common first item. **Per-champion item win claims are below the noise floor.** Only pooled claims (one item vs its slot-mates, across all champions of a class or all buyers in a situation) can pass.

### 2.4 The recommended method: decision-point comparison with a pooled test

The method has four parts: the decision record, a pooled state model, the comparison, and a significance gate.

**Unit: a decision.** One record per (game, player, slot k) for the first three completed items (boots separately). It holds:
- **Decision time t₀:** when the previous completed item finished (slot 1: the first component purchase after the opening back, or 0 s). Use the first purchase of a component that builds into the chosen item. The timeline's `ITEM_PURCHASED` events give it.
- **State x at t₀:** minute; team gold diff (continuous); the player's **lane gold diff** vs their lane opponent; enemy-team traits (§3); and the items already owned.
- **Action a:** the completed item.
- **Outcome y:** the win.

**Step 1: a pooled state model, not per champion.** Fit
> logit P(win | x) = α\_{champion-role} + f(minute) · teamGoldDiff + g(minute) · laneGoldDiff + Σ β\_t · enemyTrait\_t

on all decisions of the band at slot k. This is a logistic regression with a champion-role offset and a few minute-spline interactions, about 30 parameters, fitted in `packages/meta`. It replaces the 6 × 7 table. It is the "outcome model" of the doubly robust estimator below. Evaluate it by held-out log-loss and calibration, as the draft engine is evaluated (REVIEW §backtest).

**Step 2: compare items at the same decision.** For a champion-role and slot k with candidate items A₁…A_m (the ones bought ≥ `minItemGames`), estimate each item's effect **relative to the slot's average decision**:
- Plain version (what we can ship first): τ(A) = mean over A's decisions of (y − ŵ(x)) − mean over all slot-k decisions of (y − ŵ(x)). This is WPA, but taken at the decision time with the better state model, and *relative to the slot*, so "finished something on time" cancels out.
- Doubly robust version (later, when n allows): augmented inverse-probability weighting (AIPW) with a multinomial propensity π(A | x). This is the standard estimator for "which of several treatments" in observational data. It is consistent if *either* the outcome model or the propensity model is right ([MetricGate: MSM/IPW](https://metricgate.com/docs/marginal-structural-model/); [Naimi et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5308856)).
  - Trim decisions with π < 0.05 (no overlap: the item is never bought in such states, so there is nothing to compare against).
  - **Matched pairs** on (minute bin, team-gold bin, lane-gold bin, enemy-trait side) are a simpler, explainable alternative with the same idea. They lose more data.

**Step 3: pool and shrink.**
- An item's effect at a slot is pooled across all champions of the band that buy it at that slot. A Mantel–Haenszel-style weighted mean over champion-role strata, with weights n_A·n_rest/(n_A + n_rest) per stratum.
- Then shrink with empirical Bayes: the prior variance is estimated from the spread of τ across items, the James–Stein idea.
- The per-champion number is shown only if that champion alone passes the gate.

**Step 4: the evidence gate (same tiers as runes, 04-runes §3.2).**
- **Default (no claim):** the rank is popularity at that slot, *in states like this one* (share of slot-k decisions, optionally within the enemy-trait side). This is what the big sites do, and what our backtest says is hard to beat.
- **Override:** an item moves above the popular one only if its pooled τ minus the popular item's τ has a **95% lower bound > 0**, with ≥ 2,000 decisions per arm (config). It is then shown as "+x points at slot k (pooled, n)". Never "wins 2% more" for one champion.
- **Multiple testing:** ≈ 8 items × 3 slots × ~250 builds per band is thousands of comparisons. Use Benjamini–Hochberg at q = 0.05 per snapshot, or z ≥ 3.

**Order of the first three items as one choice.**
- Lolalytics' "Exact" sets and u.gg's "core 3" treat the path as one option.
- Statistically a path is a 3-slot treatment *sequence*. Its effect is exactly what g-methods estimate, and the number of distinct paths is large, so per-path n is tiny.
- Recommendation: **show the most common 3-item path (popularity)**. Allow slot-wise overrides by the gate above. Rank whole paths by win only if a path has ≥ 2,000 games, which happens in few champion-roles.
- Opinion: within a band, the path's order rarely flips between the top two paths; slot-wise decisions capture most of it.

### 2.5 How to evaluate the engine (replaces "top-1 = most bought")

On the held-out games (time split, as in the draft backtest):
- **Imitation (keep, as a sanity number):** top-1 agreement with the actual purchase. It should stay close to popularity's. Falling far below means the engine is noisy.
- **Value:**
  - For each held-out decision, residual r = y − ŵ(x).
  - Compare mean r where the player bought our #1 against mean r where they bought something else, **within the same slot and champion-role** (stratified difference with a 95% CI).
  - Do the same for "popularity's #1".
  - The engine is better only if its CI-backed value is higher than popularity's. Today's +0.5 vs −0.2 is the uncorrected version of this.
- **Calibration of the state model:** expected calibration error and reliability bins, as in the thesis (0.90% ECE there).

---

## 3. Situational items from data tags

### 3.1 The decision table (mechanic, Riot's tag, our enemy trait)

| Item decision | Game mechanic (current text) | Riot advice attribute (bin) → enemy property | Our enemy trait today | Gap |
| --- | --- | --- | --- | --- |
| Anti-heal | "Grievous Wounds": 40% less healing and regeneration (incl. life steal, omnivamp); **not** shields ([wiki: Grievous Wounds](https://wiki.leagueoflegends.com/en-us/Grievous_Wounds), 40% since V13.1b) | `HealingReduction → Healing` | `heal` (percentile) | — |
| Magic resist | MR reduces magic damage only ([wiki: Magic resistance](https://wiki.leagueoflegends.com/en-us/Magic_resistance)) | `MagicResist → AP` | `magicShare` | — |
| Armor | Armor reduces physical damage only ([wiki: Armor](https://wiki.leagueoflegends.com/en-us/Armor)) | `Armor → AD` | `physicalShare` | — |
| Tenacity / cleanse | Tenacity shortens most CC, not airborne or suppression; QSS/Mercurial remove CC "excluding Airborne"; Mikael's also excludes suppression (item text 16.20) | `Tenacity → CC`, `AntiSuppression → StrongCC` | `engage` | CC class split (04-runes §2.5: reducible / unreducible) |
| Anti-shield | Serpent's Fang "reduces Shields they gain" | `AntiShielding → Shields` | none | **new trait `shield`** |
| Crit reduction | Randuin's "30% less damage from Critical Strikes" | `CritDamageReduction → Crit` | none | **new trait `crit`** |
| vs auto-attacks | Steelcaps "Reduces incoming damage from Attacks by 10%"; Frozen Heart slows attack speed | `AutoAttackDamageReduction`, `AttackSpeedSlow → Attacks` | none | **new trait `attacks`** |
| vs burst | stasis (Zhonya's), lifeline shields, spell shields | `BurstDamageReduction → BurstDamage` | none | trait possible later (open lead) |
| Penetration | % armor pen and % max-health damage vs tanky teams; lethality and flat pen vs squishy | `PercentArmorPen → HighArmor`, `PercentMagicPen → HighMR`, `PercentHealthDamage → HighHealth`, `Lethality → LowArmor`, `FlatMagicPen → LowMR` | `frontline` | — |
| vs slows | slow resist | `SlowResist → Slows` | none | slow class from 04-runes §2.5 |
| Mobility | `StickingPower`/`AntiKiting → Kiting`, `Kiting → Immobile`, `Engage → LongRange`, `Disengage → Engage`, `Harass → NoSustain` | | `engage` (only for Disengage) | later; weak mechanics for advice |

Every row except the last three can be served by traits we already measure, or by **three new traits that are also measured, not listed**:
- `shield`: enemy shielding per minute, as a band percentile like `heal`. Sources:
  - Match-V5 participant `totalDamageShieldedOnTeammates`, present in Riot's sample payload ([RiotTuxedo gist](https://gist.github.com/RiotTuxedo/c8e2d29d12fc1e405ade267def036362));
  - the `challenges` value `effectiveHealAndShielding`, which our summaries already keep as a numeric challenge.
  - Caveat: shields a champion puts on itself are not in the teammates field. Self-shielders would be under-counted, so check against `effectiveHealAndShielding` before use.
- `crit`: the enemy champion-role's **share of crit items** in our own band builds (items whose bin has `mFlatCritChanceMod > 0`).
- `attacks`: the enemy champion-role's share of items with attack speed or on-hit (`mPercentAttackSpeedMod > 0` or the "OnHit" category). A measured auto-attack reliance.

The last two come from data we already aggregate (`builds`): what the enemy champion usually buys tells us how it deals damage.

### 3.2 Tagging items from data (inspected 2026-10-09)

| What | Data Dragon `item.json` 16.20.1 | CDragon `items.json` (rcp-be) | CDragon `items.cdtb.bin.json` (game data) |
| --- | --- | --- | --- |
| Tags | `tags` (32 values: Armor, SpellBlock, Tenacity, LifeSteal, ArmorPenetration, …) | `categories` (the same list) | `mCategories` (same) |
| Numbers | `stats`: only 12 fields; **no tenacity, penetration, ability haste, slow resist, heal-and-shield power** | none | all mods: `mPercentTenacityItemMod`, `mPercentArmorPenetrationMod`, `PhysicalLethality`, `mPercentMagicPenetrationMod`, `mPercentSlowResistMod`, `mPercentHealingAmountMod`, … |
| Effect numbers | in text only; 5 SR items have broken placeholders ("reduces Shields they gain by %": Serpent's Fang, Voltaic Cyclosword, Experimental Hexplate…) | same text | `mDataValues` with names: `GrievousAmount 0.4`, `GrievousDuration 3`, `TenacityAmount`, `ShieldAmount`, `SlowAmount`, `DamageReduction`, … |
| Riot's counter tags | none | none | **`mItemAdviceAttributes`** → 22 `ItemAdviceAttribute` records (`mAttribute`, localisation key `Shop_Advice_CounteredAttribute_<X>`) |
| Unique-passive groups | none | none | `mItemGroups` (e.g. `LastWhisper`, `LifelineItems`, `Quicksilver`, `VoidPen`, `Boots`) |
| Change marker | none | none | `LastMajorChangeMajorPatchVersion/Minor` (on 78 items) |

**Riot's item advice, as read from the 16.20 file:**

| Advice attribute → counters | SR completed items carrying it (16.20, canonical IDs < 100000) |
| --- | --- |
| HealingReduction → Healing | Thornmail, Mortal Reminder, Morellonomicon, Chempunk Chainsword |
| MagicResist → AP | Force of Nature, Hollow Radiance, Jak'Sho, Maw of Malmortius, Spirit Visage, Abyssal Mask, Kaenic Rookern, Banshee's Veil, Mercury's Treads, Wit's End |
| Armor → AD | Zeke's, Guardian Angel, Death's Dance, Jak'Sho, Sunfire Aegis, Randuin's, Iceborn Gauntlet, Thornmail, Plated Steelcaps, Zhonya's, Frozen Heart, Dead Man's Plate, Unending Despair |
| Tenacity → CC | Edge of Night, Iceborn Gauntlet, Banshee's Veil, Mikael's Blessing, Mercury's Treads, Boots of Swiftness, Mercurial Scimitar |
| AntiSuppression → StrongCC | Mercurial Scimitar |
| AntiShielding → Shields | Serpent's Fang |
| CritDamageReduction → Crit | Randuin's Omen |
| AutoAttackDamageReduction / AttackSpeedSlow → Attacks | Randuin's, Plated Steelcaps / Frozen Heart |
| BurstDamageReduction → BurstDamage | Guardian Angel, Death's Dance, Locket, Eclipse, Archangel's, Maw, Sterak's, Knight's Vow, Zhonya's, Immortal Shieldbow |
| PercentArmorPen → HighArmor | Black Cleaver, Voltaic Cyclosword, Terminus, Hubris, Profane Hydra, Lord Dominik's, Serylda's Grudge |
| PercentMagicPen → HighMR | Terminus, Cryptbloom, Void Staff |
| PercentHealthDamage → HighHealth | Black Cleaver, Eclipse, BotRK, Lord Dominik's, Liandry's |

(This table shows that the method works on the current patch. It isn't a list for the code: the code reads it from the file every patch.)

**Checks of Riot's tags against mechanics:**
- The anti-heal set equals the set whose text has `<keyword>… Wounds</keyword>` (4 of 4 completed items; the components Executioner's, Oblivion Orb and Bramble Vest are also tagged by text). This matches the wiki's 7 Grievous Wounds sources.
- Riot's `Tenacity → CC` is broader than the tenacity stat:
  - it includes Banshee's and Edge of Night (spell shields) and Boots of Swiftness (slow resist, no tenacity);
  - it leaves out Chainlaced Crushers and Endless Hunger, which *do* have `mPercentTenacityItemMod`.
  - So Riot's tag means "helps against CC", and the bin stats say *how*. Use both: Riot's tag for "this item answers CC", the stat or text for the mechanic sentence ("30% tenacity" vs "blocks one ability").
- Data Dragon's `Tenacity` tag is also loose: Mercurial, Mikael's and Protoplasm Harness carry it without the tenacity stat (they cleanse, or it's conditional). Its `Armor`/`SpellBlock` tags agree with the bin stats on every canonical SR item except one component (Shattered Armguard).

**Answer to Q3: can tags come from Data Dragon, with no hand list?**
- **Partly.**
  - Data Dragon `tags` + `stats` are enough for the resist rows (armor vs physical, MR vs magic).
  - A description regex over Riot markup adds anti-heal (`Wounds`), anti-shield (`Shields`), cleanse ("Remove all crowd control") and stasis (`<keyword>Stasis</keyword>`).
- **Fully, with one more file:** CDragon's game bin gives Riot's own counter tags plus exact numbers, so the rules shrink to "read `mItemAdviceAttributes`".
  - Caveat: the bin is a datamined export, larger (16 MB), and has unhashed keys (`{b1891df6}`).
  - Use it **on the server, once per patch**, with the Data Dragon + text rules as fallback and as a cross-check (a test fails if they disagree on anti-heal, MR or armor).

**Pitfalls found:**
- **Mode copies flagged as SR.** Data Dragon 16.20.1 marks 36 items with IDs ≥ 100000 (prefixes 32… and 66…, e.g. 323075 Thornmail at 2,650 gold, 663193 Gargoyle Stoneplate) as `maps["11"]: true` and purchasable. `isCompletedItem()` would accept them.
  - Rule (no list): a candidate must be **seen in the band's ranked purchases** (we have `itemRoles`; ranked Match-V5 never contains these IDs).
  - As a structural backstop: drop an item if another purchasable item with the same name has a lower ID.
- **Broken placeholders** in Data Dragon descriptions ("by %"): never quote numbers from Data Dragon text; take numbers from the bin's `mDataValues` or say the mechanic without a number.
- **Item ID reuse and reworks:** the bin's `LastMajorChange…` gives a change marker (e.g. Voltaic Cyclosword 16.9). As with runes, key item stats by (itemId, text hash) or drop games from before the last change.

### 3.3 The rule set

The rules work like the rune rules: a rule links an enemy trait to an item **property**, never to an item. Property sources, in order: Riot advice attribute (bin), then stat (bin, or Data Dragon `stats`), then text regex (Data Dragon description).

The evidence tiers carry over from 04-runes §3.2:

- **Tier 0 (none):**
  - the trait is at or below the band cut;
  - or no candidate item for the champion-role (seen in its builds ≥ `itemMinShare`) has a property linked to the trait;
  - or for `ccReducible`: the enemy CC is mostly unreducible (then tenacity is useless; only `AntiSuppression` and cleanse-type properties count).
- **Tier 1, "Worth a look" (mechanic only):** the trait is above the cut and the item has the linked property and fits the role. Clause 1 only. At most `maxSituational`.
- **Tier 2, measured mechanic:**
  - Items have no `var1..3`, but Match-V5 has outcome numbers per *mechanic*: `damageSelfMitigated`, `totalHeal` of enemies, the `challenges` heal and shield fields.
  - Anti-heal example: enemy healing per minute when someone on our team had a Wounds item vs not, **within the same enemy champions** (enemy champion-role strata), separately in wins and losses (whole-game totals follow the result).
  - Ratio ≥ 1.25 and z ≥ 3 as for runes. Resist items: "damage taken per minute from the matching type" is in Match-V5 (`physicalDamageTaken`, `magicDamageTaken`); `damageSelfMitigated` per minute is the measured effect.
- **Tier 3, adoption (extra clause):** the existing lift (players buy it more into high-trait teams), at z ≥ 3. Shown as two rates.
- **Tier 4, win (extra clause, rarely):** the §2.4 pooled decision-point test restricted to high-trait decisions.

### 3.4 Real output on patch 26.20 (rules of §5 applied to 16.20 data)

Run on the 118 canonical completed SR items (IDs < 100000, purchasable on map 11, completed or upgraded boots):
- 70 have at least one Riot advice attribute; the other 48 are pure damage or utility items, as expected.
- Example rows, all produced by the script:

| ID | Item | Riot advice | Tags from stats and text |
| --- | --- | --- | --- |
| 3033 | Mortal Reminder | HealingReduction | stat.armorPen, text.antiHeal |
| 3165 | Morellonomicon | HealingReduction | stat.health, text.antiHeal |
| 3111 | Mercury's Treads | Tenacity, MagicResist | stat.magicResist, stat.tenacity |
| 3047 | Plated Steelcaps | AutoAttackDamageReduction, Armor | stat.armor, text.attackReduction |
| 3139 | Mercurial Scimitar | AntiSuppression, Tenacity | stat.magicResist (cleanse active in text) |
| 3143 | Randuin's Omen | CritDamageReduction, AutoAttackDamageReduction, Armor | stat.armor, stat.health, text.critReduction |
| 6695 | Serpent's Fang | AntiShielding | stat.armorPen, text.antiShield |
| 2504 | Kaenic Rookern | MagicResist | stat.magicResist, text.antiMagicShield |
| 3157 | Zhonya's Hourglass | Armor, BurstDamageReduction | stat.armor, text.stasis |
| 3135 | Void Staff | PercentMagicPen | stat.magicPen |

Examples of the explained output, using the §6 templates:
- *Enemy Soraka/Aatrox-style healing (heal trait above the cut), ADC role, Mortal Reminder in the role's builds* → "Their team heals a lot. Mortal Reminder cuts healing by 40% (Grievous Wounds)." Plus, if Tier 3 passes: "Bought by 41% of players into teams like this, 9% usually."
- *Enemy CC mostly suppression/knock-ups* → Mercury's Treads is **not** suggested for tenacity (tenacity doesn't shorten airborne or suppression). Mercurial Scimitar is suggested only if the role buys it.

(Percentages in examples are placeholders, not measured.)

---

## 4. First item timing: what comparison is meaningful

**Is "your first item at 14:30 vs typical 13:10" meaningful?** Only if it is (a) compared like for like, (b) robust to noise, and (c) split into causes the player can act on.

1. **Like for like.** Compare with the band's distribution for the **same champion-role and the same first item** (else the same item price band). Item cost differs by up to 1,300 gold between first items (2,200–3,500 in 16.20). We already have `minute` per item-slot in builds; extend it to quantiles (p25, p50, p75).
2. **Robust.** Use the player's **median over their last ≥ 10 games** on that champion-role vs the band median. Show it only if a bootstrap 95% CI of the difference excludes 0 and |difference| ≥ `minSeconds` (config, e.g. 45 s; opinion).
3. **Split into two habits** (needs `currentGold` per frame, Match-V5 `participantFrames[].currentGold`; field list in the Match-V5 DTOs, e.g. [riot-apy](https://riot-apy.readthedocs.io/en/latest/riot_apy.classes.html)):
   - **Income:** the first minute when `totalGold − startingGold` ≥ the cost of the first item plus what was spent on other things (starter, wards, potions; all from `ITEM_PURCHASED` events). Compare with the band's same quantile. The lever is CS and early kills. It links to the existing gold@15 and CS goals (02-goals).
   - **Spending delay:** completion second minus the second the item became affordable. Equivalently, the integral of `currentGold` above the next component's price. The lever is back timing.
   - Both are **facts measured in the player's own game**. "You had 3,000 gold at 12:40 but completed at 14:30" needs no correlational claim, so it fits "correlation is not a reason".
4. **Don't sell timing as a cause of winning.** Sites claim "hitting your spike on schedule is the key predictor of winning" ([buildzcrank](https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/)). But early completion is itself caused by being ahead (the same purchase-state bias as §1.2). We may say *how much later* and *why* (income vs spending), not "this cost you x% win chance". The one exception is if a band-level test of income-matched timing passes, i.e. same gold, later completion. It hasn't been run; we don't know.

What to measure on the production copy:
- Per champion-role and first item: the completion-second quantiles.
- The share of the difference explained by income vs spending (the median split above).
- How stable a player's median is over 10 vs 20 games (bootstrap width), to set `minGames`.

---

## 5. Explanation format

One line, at most two clauses, as for runes (04-runes §3.1). The **first clause is always the enemy fact plus the mechanic**; numbers appear only from Tier 2–4 tests that passed.

| Case | Template (slots only) |
| --- | --- |
| Core item, no claim | "{item}: the usual {ordinal} item on {champion} ({share}% of games in your rank)." |
| Core item, pooled win test passed | "{item}: {ordinal} item; +{points} pts win chance vs the other {ordinal}-item choices (n = {n}, all {class} players)." |
| Situational, Tier 1 | "Their team {traitPhrase}. {item} {mechanicPhrase}." e.g. "Their team heals a lot. Mortal Reminder cuts healing by 40%." |
| Situational, Tier 2 | "…; into teams like this, teams with it cut enemy healing by {ratio}× more." |
| Situational, Tier 3 | "…; bought by {high}% of {champion} players into teams like this, {low}% usually." |
| Not suggested | (nothing; we never explain an absent suggestion unless asked) |
| Timing (post-game / Style) | "First item at {mm:ss}, {delta} later than usual for {item}: {incomeDelta} from farm, {spendDelta} with gold unspent." |

`mechanicPhrase` comes from the property, with numbers from the bin's `mDataValues` (`GrievousAmount 0.4` → "40%"), never from Data Dragon text. All wording goes in `config/explain.v1.json`, as today.

---

## 6. What to change in the code or config

1. **Candidate filter.**
   - `completedItems()` must also require the item to be seen in band purchases (`itemRoles`), or drop same-name items with higher IDs. Today it accepts 36 mode copies (323075 Thornmail, …).
   - Cache the set per patch (REVIEW: `personal-coach.ts` rescans the catalog).
2. **`packages/ddragon`:** fetch CDragon `items.cdtb.bin.json` from the **versioned** folder matching Data Dragon (`/16.20/`, not `latest`), **server-side once per patch**. Extract per item: `mItemAdviceAttributes` (resolved to names), the stat mods, `mDataValues`, `mItemGroups` and `LastMajorChange…`. Publish the small extracted table (≈118 rows) in `GET /config` or the meta snapshot, not the 16 MB file.
3. **`config/item-tags.v1.json` (new):**
   ```json
   {
     "version": 1,
     "sources": ["riotAdvice", "binStats", "ddragonText"],
     "textRules": {
       "antiHeal": "<keyword>\\d*%?\\s*Wounds</keyword>|Grievous Wounds",
       "antiShield": "reduces? Shields|Shield Reaver",
       "spellShield": "Spell Shield",
       "cleanse": "Remove all crowd control",
       "stasis": "<keyword>Stasis</keyword>",
       "critReduction": "less damage from Critical Strikes",
       "attackReduction": "incoming damage from Attacks"
     },
     "statRules": {
       "armor": "mFlatArmorMod",
       "magicResist": "mFlatSpellBlockMod",
       "tenacity": "mPercentTenacityItemMod",
       "slowResist": "mPercentSlowResistMod",
       "armorPen": ["mPercentArmorPenetrationMod", "PhysicalLethality", "mFlatArmorPenetrationMod"],
       "magicPen": ["mPercentMagicPenetrationMod", "mFlatMagicPenetrationMod"]
     },
     "traitRules": {
       "heal": { "riotAdvice": ["HealingReduction"], "tags": ["text.antiHeal"] },
       "magic": { "riotAdvice": ["MagicResist"], "tags": ["stat.magicResist"] },
       "physical": { "riotAdvice": ["Armor", "AutoAttackDamageReduction"], "tags": ["stat.armor"] },
       "engage": { "riotAdvice": ["Tenacity", "AntiSuppression"], "tags": ["stat.tenacity", "text.cleanse"] },
       "frontline": { "riotAdvice": ["PercentArmorPen", "PercentMagicPen", "PercentHealthDamage"], "tags": [] },
       "shield": { "riotAdvice": ["AntiShielding"], "tags": ["text.antiShield"] },
       "crit": { "riotAdvice": ["CritDamageReduction"], "tags": ["text.critReduction"] },
       "attacks": { "riotAdvice": ["AutoAttackDamageReduction", "AttackSpeedSlow"], "tags": ["text.attackReduction"] }
     },
     "ccReducibleOnly": ["stat.tenacity"]
   }
   ```
   `ENEMY_TRAITS` gains `shield`, `crit` and `attacks`, all measured (§3.1). `engage` splits into `ccReducible` / `ccUnreducible` as in 04-runes §2.5.
4. **`packages/meta/src/builds.ts`, win added → decision-point comparison:**
   - (a) Record the state at the **decision time** (previous completion, or the first component of this item), not at completion.
   - (b) Replace `ExpectedWinFitter`'s 6 × 7 table with a pooled logistic state model (minute splines × team gold diff, lane gold diff, enemy traits, champion-role offset).
   - (c) Publish per item-slot: the sum of residuals, the sum of squared residuals and n, so the client or the server can compute τ relative to the slot and its standard error.
   - (d) Add item-level pooling across champions (MH weights) for the override test.
   - (e) Keep `minute`, and add completion-second quantiles p25/p50/p75 per item-slot.
5. **`config/meta.v1.json` → `builds`:**
   ```json
   {
     "itemEffect": {
       "stateAt": "decision",
       "model": "logistic",
       "slots": 3,
       "minDecisionsPerArm": 2000,
       "ciLevel": 0.95,
       "fdrQ": 0.05,
       "propensityTrim": 0.05
     },
     "timingQuantiles": [0.25, 0.5, 0.75]
   }
   ```
   Remove `winAddedPriorGames` once τ has a standard error.
6. **`config/engine.v1.json` → `loadout`:**
   - Rank by popularity at the slot (`shareScale`).
   - `winAddedScale` applies **only to effects that passed the gate** (others count 0).
   - The `negativeGuard` sort uses the CI upper bound < 0, not the point estimate.
   - Situational items need a tag match (Tier 1) before any lift counts. Raise `lift.minZ` in meta from 2 to 3.
7. **Timeline summary (`packages/riot-api/src/timeline.ts`, `MatchTimeline`):** store `currentGold` per frame next to `gold` (totalGold). It enables the income vs spending split (§4). It is small: 10 × ~30 ints per game.
8. **Backtest (`backtest-cli.ts`):**
   - Add the §2.5 value test (stratified residual difference with CI, ours vs popularity).
   - Keep top-1 agreement only as a sanity check.
   - Fix the `now: Date.now()` cut-time bug already noted in REVIEW.
9. **Explanations (`config/explain.v1.json`):** add the §5 templates. The mechanic phrases come from tags; numbers come from `mDataValues`.
10. **Measure on the production copy:**
    - (a) per-slot n distribution, i.e. how many champion-roles reach 2,000 decisions per arm (expected: very few, so pooled claims are the norm);
    - (b) the new state model's log-loss vs today's table;
    - (c) completion-second quantiles and the income/spending split;
    - (d) anti-heal Tier 2: enemy healing per minute with vs without a Wounds item on our team, by enemy champion-role, in wins and in losses separately.

---

## 7. Self-check

- Q1 (sites, criticism): answered in §1, with ≥ 3 sources per bias. Op.gg's and Mobalytics' methods are **not documented publicly**: no method page found (searched their sites and news); stated as such.
- Q2 (known method, better ones): §2. WPA is known ([MLB](https://www.mlb.com/glossary/advanced-stats/win-probability-added), [Tango](https://tangotiger.net/wiki_archive/Win_Probability_Added.html), [Jalovaara](https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf), [buildzcrank](https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/)). Matching, propensity and AIPW are proposed; the path-as-one-choice question is addressed. No published League item study with propensity or matching was found (searched arXiv and Google results for "propensity", "causal", "item", "League", "Dota").
- Q3 (situational, tags): §3. Answer: partly from Data Dragon, fully with the CDragon bin. Real 16.20 output is included. No hand-written item list is part of the solution; the tables show the output on this patch.
- Q4 (timing): §4, with what to measure.
- Rules respected:
  - Suggest, never decide: the output is options with reasons.
  - Other players' identities: enemy traits are champion-level aggregates.
  - No Arena data: Arena items are filtered out by the purchase-data rule.
  - Correlation is never the first clause.
  - Every shown number passes a test.
- Config JSON in §6 is valid JSON. Its shape follows the existing `builds` and `loadout` blocks; `item-tags.v1.json` is new.

## Sources

- Riot Games, "/dev: Updated Approach to Item Balancing", 14 Sep 2020: https://www.leagueoflegends.com/en-gb/news/dev/dev-updated-approach-to-item-balancing/
- P. Jalovaara, "Win probability estimation for strategic decision-making in esports", Master's thesis, Aalto University, 26 Aug 2024: https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf
- mein-mmo, on the thesis and coachless.gg: https://mein-mmo.de/en/youtuber-writes-masters-thesis-on-lol-creating-the-strongest-jungler-of-the-new-season,1554268/
- buildzcrank, "Why League of Legends item win rate stats lie to you", 1 Jul 2026: https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/
- loltheory, "You're building the same thing every game": https://blog.loltheory.gg/in-game-item-recommendations/
- T. Svojanovsky, "The hidden bias in League of Legends item win rates" (Shen/Heartsteel; 403 to our fetcher, search summary only): https://tomas-svojanovsky.medium.com/the-hidden-bias-in-league-of-legends-item-win-rates-a-data-driven-analysis-of-shen-and-heartsteel-b1a1ecbfd174
- lolalytics, Sett build 16.20: https://lolalytics.com/lol/sett/build/
- metabot.gg, items by win rate 26.19: https://metabot.gg/en/league/items/win-rate
- u.gg build pages / FAQ (via search summaries): https://u.gg/lol/champions/ornn/build, https://u.gg/faq; https://lolnow.gg/u-gg/
- A. Dallmann et al., "Sequential Item Recommendation in the MOBA Game Dota 2", arXiv 2201.08724, Jan 2022: https://arxiv.org/pdf/2201.08724
- Z. Novack, "Personalized Sequential Recommendation for Adaptive Itemization in MOBA Games" (HT4Rec4U): https://zacharynovack.github.io/lol_item_rec.pdf
- R. Smit, "A machine learning approach for recommending items in League of Legends", BSc thesis, Radboud 2019: https://www.cs.ru.nl/bachelors-theses/2019/Robin_Smit___4043561___A_machine_learning_approach_for_recommending_items_in_League_of_Legends.pdf
- MLB glossary, Win Probability Added: https://www.mlb.com/glossary/advanced-stats/win-probability-added
- Tango wiki archive, Win Probability Added: https://tangotiger.net/wiki_archive/Win_Probability_Added.html
- D. Studeman, "10 lessons I have learned about Win Probability Added", Hardball Times, 29 Apr 2014: https://tht.fangraphs.com/10-lessons-i-have-learned-about-win-probability-added/
- Naimi, Cole, Kennedy, "An introduction to g methods", 2017: https://pmc.ncbi.nlm.nih.gov/articles/PMC5308856
- MetricGate docs, marginal structural models / sequential g-estimation: https://metricgate.com/docs/marginal-structural-model/, https://metricgate.com/docs/sequential-g-estimation
- League wiki: Grievous Wounds https://wiki.leagueoflegends.com/en-us/Grievous_Wounds ; Shop https://wiki.leagueoflegends.com/en-us/Shop ; Tenacity https://wiki.leagueoflegends.com/en-us/Tenacity
- Riot data: Data Dragon item.json 16.20.1 https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/item.json ; CDragon items.json https://raw.communitydragon.org/16.20/plugins/rcp-be-lol-game-data/global/default/v1/items.json ; CDragon items.cdtb.bin.json https://raw.communitydragon.org/16.20/game/items.cdtb.bin.json
- Match-V5 timeline DTO fields (currentGold, totalGold): https://riot-apy.readthedocs.io/en/latest/riot_apy.classes.html

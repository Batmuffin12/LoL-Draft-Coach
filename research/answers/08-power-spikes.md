# 8. Power spikes

Research done 2026-10-09. Builds on [05-items.md](05-items.md) (WPA, purchase-state bias, item effects of 0–2 points), [06-draft-engine.md](06-draft-engine.md) and the M8 work in [docs/ENGINE-PLAN.md](../../docs/ENGINE-PLAN.md) (first production test on 10,336 games, 2026-10-08).

## Summary (the strongest findings)

1. **Nobody publishes an item-specific spike measurement.**
   - Stats sites measure a champion's **game phase**: win rate by game length (League of Graphs, SeeMeta, metabot, LeagueMath) or early/mid/late ratings from kit analysis, not match data (Mobalytics).
   - The only published "item timing" method is STRATZ's for Dota 2: the slope of win rate against completion minute. It does not control for being ahead, and its authors say so.
   - No League or Dota study was found that separates "item X" from "game phase" with a matched, event-study or difference-in-differences design. Our M8 result (game phase stable, item-specific part noise) is new evidence, not a failure of a known method.
2. **Our production numbers imply the item-specific part is small, not just under-sampled.**
   - Split-half r ≈ 0.12 at ~200 games per champion-role per half implies a true spread across champions of only about **0.03 σ**: roughly ±30 gold per 3-minute window (§1.4).
   - The game phase has a larger true spread: about **3× the item-specific one at 8-minute windows** (r 0.61 vs 0.16), 1.6× at 3 minutes (r 0.21 vs 0.09).
   - To show item-specific spikes with reliability 0.8 would need roughly **6,000 games per champion-role**. A band at its 50k cap has ~1,000 for a typical champion-role; all collected bands pooled at the cap roughly 3,000 (R ≈ 0.67). The bigger point: even measured perfectly, ±30 gold per 3 minutes is about a tenth of a kill, too small to coach on.
3. **The better design exists and is cheap to try once: a stacked event study with not-yet-finished controls** (risk-set matching, Li, Propert & Rosenbaum 2001; Callaway & Sant'Anna 2021). It fixes two real flaws of today's own-placebo design (§1.3). But it buys validity, not precision. It won't turn r 0.12 into 0.5.
4. **"Fights won after the purchase" is known only in pieces.**
   - Fight detection from kill clusters is published: ~1M fights from ~200k ranked games, Baek & Kwon, IEEE CoG 2026.
   - Valuing kills by win-probability change is published: Maymin, "smart kills and worthless deaths".
   - Nobody publishes "fights won within N minutes after item k". Our kill events (no positions) give a usable net-takedowns count, but by our estimate it is **not more sensitive than gold**: standardized effect ≈ 0.09 vs 0.125 (§2.3). Measure it once on production; don't build on it first.
5. **What players use spike information for is simple:** when to fight and when to wait ("don't fight before your item", "play safe when the enemy hits 6"), and which game phase their pick wants. Every guide and the market leader's overlay present it as **early / mid / late**. The minimum useful form is a phase line, **"gains most from about minute X"**, plus the champion's typical first-item minute in your rank as a plain timeline marker. That is what our data already supports (§3).

---

## Q1. How others measure power spikes, and whether anyone separates the item from the game phase

### 1.1 What the sites do (checked 2026-10-09)

| Who | Measure | Problem |
| --- | --- | --- |
| **League of Graphs**, **SeeMeta** | Win rate by game duration. SeeMeta: early 0–15 min vs late 36+ min; "scaling" = late − early. Patch 26.20, 10,367 matches, 2026-10-08. Examples: Braum +18.9, Xayah −25.8 (73.7% early). | Game length is an **outcome**: a team that is winning ends early. A 73.7% "early" win rate on a small bucket mostly says who wins short games (stomps, early surrenders), not when a champion is strong. SeeMeta says scaling "shifts with … sample size". |
| **metabot.gg** | "Late game win rate" per champion (Bel'Veth 60.0%, Kayle 57.2%), 1.6M matches, patch 26.19. No threshold or n per champion stated. | Same conditioning on game length; no method published. |
| **LeagueMath** (2014–2015) | "Advantage" = P(win \| game length) in 2-minute buckets, 20–60 min, 736k NA solo-queue games. An earlier post compared average win and loss times (50k Diamond+ games). | Same. The author notes thin buckets (Kalista 93 games at 58–60 min). Of the win-time version he says it is "probably too rough to draw any conclusions from": SD 7–8 min vs a 3.5-min spread between champions, and "any measure that puts Nasus in the middle is not likely a good measure of early- vs. late-game power". Old (seasons 4–5), but the method is the one sites still use. |
| **Mobalytics** | Stoplight ratings (green, yellow, red) per champion for early (first 15 min), mid (~15–30, from the first tower) and late (30+) game, on the champion page and in the overlay. | Mobalytics' own blog says the colours are "calculated according to the features of a champion's kit such as their base stats and scaling ratios … ability designs and cooldown rhythms": **kit analysis, not match data**. "Guidelines, not laws." A 2019 review describes it the same way. |
| **Lolalytics** | No time curve on the build page. It does note that its level-15 skill order "quotes higher win rates" because winners reach level 15 more. | A site documenting the "state at the event" bias for levels. |
| **STRATZ (Dota 2)** | Win rate against completion minute for a hero's top 3 expensive items (> 2,000 gold), top 20 hero-item pairs by volume, one week of games. Fitted only in a band around the average timing (the translation calls it a "69% interval"), where the fall is roughly linear. Reported as a gradient (e.g. −2%/min for Armlet on Dragon Knight). 95% CIs from a Bernoulli model. | Being ahead causes both early items and wins, and the authors say they "cannot be fully sure" timing isn't just a different strategy. Measures the importance of timing, not the item's effect. |
| **Guides** (Mobalytics blog, BoostRoom 2026-04, Hexiled 2025-11, Eloking glossary) | Level 2/3, 6, 11, 16; first core item; "timing spikes" (enemy Flash down, wave crash). | Qualitative. No numbers. |

**Conclusion.** The industry measures game phase by **win rate by game length** and item timing by **win rate by completion minute**. Both condition on something the result causes:
- long games for scaling;
- early completion for items.

This is the same purchase-state bias as 05-items §1.2. ElbroC's TFT piece (2023) makes the same survivorship point for late-game units. In a 96M-match MOBA study (Honor of Kings, 2019), surrender is most likely in the first minutes it's allowed and falls with duration, so the "early" bucket is largely surrendered games. For champion phase, LeagueMath's author reached the same verdict from the other side: game-length measures are too rough.

There is one honest conflict here. Sites with millions of games (metabot 1.6M) do get stable late-game win rates, and the phase labels players see agree with them broadly (Bel'Veth and Kayle on top). Stable is not unbiased, though: the late bucket's win rate mixes "strong late" with "the kind of game this champion drags out". The better-supported view is that game-length win rates give the right *direction* for strong scalers but can't place a spike in time.

**Our gold-lead swing is better than both.** It is measured at each minute inside every game, not by filtering on game length. One caveat: from ~minute 25 only games still going are in the curve, so late minutes are mildly survivorship-biased too.

### 1.2 Published methods that could separate the item from the phase

None applied to MOBA items was found. Searched: arXiv, Google results for "event study"/"difference-in-differences"/"causal" + "item"/"League"/"Dota", STRATZ blog, OpenDota, Jalovaara's thesis (05-items). The closest in-game causal work is a League *patch* study with heterogeneous treatment effects (FDG 2021, arXiv 2110.14632), not items.

The general methods that fit our setup:

| Method | Idea for us | Source |
| --- | --- | --- |
| **Risk-set matching** | When a player finishes item k at minute m, match them to a player on the same champion-role who, at minute m, has the same item count, a similar lead and a similar recent lead trend, but has **not yet** finished item k. Compare what happens next. | Li, Propert & Rosenbaum, JASA 2001; R package `rsmatch` |
| **Staggered DiD / event study with not-yet-treated controls** | The same idea, as an estimator. Each completion minute is a "cohort". Compare its lead change with not-yet-finished players over the same minutes. Average over cohorts. Avoids the bad comparisons of a plain two-way fixed-effects regression when effects differ by timing. | Callaway & Sant'Anna 2021; Sun & Abraham 2021; Borusyak, Jaravel & Spiess (arXiv 2108.12419) |
| **Landmark analysis / immortal-time bias** | Never classify a player-game by an event that happens later ("finished item 1 by 12:00") and then compare outcomes from an earlier time. Fix the landmark minute and use only what's known then. | Immortal-time literature (e.g. MetricGate explainer; arXiv 2312.06155) |
| **Anticipation ("Ashenfelter's dip")** | Players **back** to buy. The minute before completion contains a recall, so the lead dips before "treatment" and recovers after, for every item. The role subtraction cancels the average dip, but champions with longer walks or different back patterns differ. | Ashenfelter's dip and anticipation in event studies (`did` package vignette; arXiv 2512.06804) |
| **Random-effects variance (τ²)** | Don't ask "is champion X's spike significant?" first. Ask "how big is the true spread of item-specific spikes across champions?" (DerSimonian–Laird τ² from per-champion estimates and their SEs). If τ is tiny, no amount of shrinkage makes per-champion spikes worth showing. | DerSimonian & Laird 1986 (MetricGate docs; arXiv 1904.01948) |

### 1.3 Two flaws in today's item-specific measure (`fe2d7ab`, `baselineSec`)

Today: item-specific = the player's swing at their own completion second minus the **same player's** swing at the role's usual second for that event.

1. **It only identifies from timing deviation.**
   - If a player finishes near the role's usual time (|own − usual| ≪ window), the two windows overlap, and the difference is ~0 by construction.
   - With completion times spread ±2 min and a 3-min window, most players contribute almost nothing. The rest are the early and late finishers: the selected players (ahead or behind) we wanted to avoid.
   - This also explains why longer windows look "better" for game phase but not for the item.
2. **It doubles the noise.** The difference of two swings of the same size has about twice the variance, unless the windows overlap, and then flaw 1 applies.

The risk-set design (§1.2) instead compares **different players at the same minute**. The phase cancels because both are at minute m on the same champion. It needs no own-placebo window. It still has the "ahead players finish sooner" problem, but that is handled by matching on lead and trend at m (observed covariates), not by subtraction.

### 1.4 What the production numbers already tell us (my calculation from ENGINE-PLAN's table)

**The reliability formula.** For a champion-role estimate with true spread τ across champions and sampling SE = σ/√n, the split-half correlation is r = τ² / (τ² + σ²/n_half).

**Item-specific part.**
- The 10,336 games give ~100k player-games over roughly 250 champion-roles with ≥ `minGames`: about 400 per champion-role, ~200 per half.
- r ≈ 0.12 (3–5 min windows) → τ²/(σ²/200) = 0.136 → **τ ≈ 0.026 σ**.
- The local feasibility table gives σ ≈ 700–900 gold for a 3-min swing (z and n of Kha'Zix and Miss Fortune: σ = effect·√n/z). The item-specific difference has a larger σ, ~1,000–1,300.
- So **τ ≈ 25–35 gold per 3 minutes**.

**Game phase** (r 0.61 at 8 min): τ ≈ 0.09 σ, against τ ≈ 0.03 σ for the item-specific part at the same 8-minute window (r 0.16): about **3×** the spread. At 3 minutes the ratio is ~1.6× (r 0.21 vs 0.09).

**Games needed per champion-role** for a per-champion estimate with reliability R: n = R/(1−R) · (σ/τ)².

| What | R = 0.5 | R = 0.8 |
| --- | --- | --- |
| Game phase (τ ≈ 0.09 σ) | ~125 | ~500 |
| Item-specific (τ ≈ 0.026 σ) | ~1,500 | **~5,900** |

This agrees with ENGINE-PLAN's Spearman–Brown estimate (6–10× the games). It adds the reason: **the effects themselves are small**, consistent with 05-items (item effects of 0–2 win points). It also tells us that a better estimator (§1.3) can't fix it. Only τ can, and τ is a property of the game.

These are back-of-envelope numbers from aggregate r. The τ² measurement in "What to change" replaces them with a direct estimate.

---

## Q2. "Fights won within N minutes after the purchase"

### 2.1 Is it a known metric?

**As one metric: no evidence found.** Searched: arXiv/Google for "fights won" + "item"/"purchase"/"after completing", STRATZ and OpenDota blogs, LOL_teamfight_Lab, the Jalovaara thesis. The parts are known:

- **Detecting fights from kill events.**
  - Baek & Kwon (IEEE CoG 2026, code `Lunecid/LOL_teamfight_Lab`): temporal clustering of `CHAMPION_KILL` events (15 s merge window), spatial validation (≥ 2 alive players per team within 1,800 units), diameter split at 4,000 units.
  - 994,365 fights from ~200k ranked matches (~4.8 per match).
  - Predicting the winner from the pre-fight state reaches only AUC ≈ 0.67. Fights are noisy even with 146 features.
- **Valuing kills by their effect.** Maymin, "Smart kills and worthless deaths" (JQAS 17(1), 2021; NESSIS 2017 talk):
  - calibrates an in-game win-probability model on millions of ranked games;
  - defines a worthless death as one that doesn't raise the team's win probability;
  - finds that actions conditioned on win-probability change track team results far better than raw kills and deaths.
  - For us: a plain takedown count is a weak proxy for "fights won".
- **Per-player kill rates around a time** are what our `fights` field already counts: net takedowns (kills + assists − deaths) in the window after minus before.

### 2.2 What our data can and can't do

- We store `kills: [sec, killer, victim, assists]` with **no positions**. Match-V5 `CHAMPION_KILL` events do have `position` (Cassiopeia's Event model lists `position`, `killer_id`, `victim_id`, `assisting_participants`). Adding x/y costs ~4 bytes per kill and would allow Baek & Kwon's spatial split. Optional.
- Without positions, use **time clusters only**: kills within 15 s of each other, chained, form one fight. This merges simultaneous skirmishes in different lanes, which is acceptable for a per-player count.
- **"Fight won" for the player** = their team got more kills than it lost in that cluster, among clusters the player took part in (killer, victim or assist). It is Bernoulli, so its variance is known (p(1−p) ≤ 0.25).

### 2.3 How many games it needs (estimate, to be measured)

**Net-takedown swing (today's `fights`).**
- Assume mid-game rates of ~0.4 takedowns/min and ~0.15 deaths/min per player in Gold–Plat.
- A 3-min window holds ~1.7 events; with overdispersion ~1.5 its variance is ~2.6. After minus before: σ ≈ 2.3.
- A spike that adds 0.2 net takedowns per 3 min (≈ one more takedown every 15 minutes) is a standardized effect of **0.09**. The ENGINE-PLAN gold effect (+100 gold over σ ≈ 800) is **0.125**.
- **n for z = 2.8 (α 0.05, power 0.8): (2.8/0.09)² ≈ 1,000 games per champion-role** vs ~500 for gold.

**Fight win share.** With ~1–2 player fights per window, it is a Bernoulli with n ≈ 1.5 per game. To see +5 points (55% vs 50%) needs (2.8·0.5/0.05)² ≈ 780 fights ≈ **~500 games** per champion-role and slot.

**Conclusion.** Neither fight metric is clearly more sensitive than gold.
- Kills are already in gold (~300 gold each), and gold adds CS, which is noise for "fighting power".
- Fight win share removes the CS noise, which is why it might do better; that is a guess.
- Measure the standardized effect d = |mean| / σ of gold, net takedowns and fight win share on the production copy. Use the most sensitive one.

---

## Q3. What players use spike information for, and the minimum useful form

### 3.1 Uses (guides, 2025–2026, at least 3 sources each)

1. **When to fight and when to wait.**
   - "Don't fight until our next item"; never engage right before your own spike; don't fight on 1,500+ unspent gold (BoostRoom 2026).
   - Force fights in your windows and avoid the opponent's (Hexiled 2025).
   - "Capitalize on your champion's power spikes … recognize enemy power spikes to avoid disadvantageous fights" (Eloking).
2. **The enemy's level 6.**
   - "Back off for 20 seconds, enemy mid is about to hit 6" (BoostRoom); "play 10 seconds safer" when the enemy hits 6 first.
   - Mobalytics' beginner guide treats level 6 as the main lane breakpoint.
   - This is in-game, and our in-game rule is passive only (ENGINE-PLAN, M9).
3. **Picking for a game phase.**
   - Early, mid and late ratings (Mobalytics champion pages and overlay, by role).
   - "Scaling" pages (SeeMeta, metabot, League of Graphs) exist so players can pick for the game length they expect.

### 3.2 The minimum useful form

- **Format.** Every source presents spikes as **coarse phases or a short list of moments**, not as numbers. Mobalytics' three stoplights (0–15, ~15–30, 30+ min) is the market leader's form. No site shows confidence or sample sizes.
- **Smallest honest version for us (opinion, from §1.4).**
  - A single **phase line** per champion-role: "Gains most on its lane opponent from about minute 14 to 22" (or "early: until ~12").
  - In the game plan: your line and the enemy laner's line side by side. "You: from ~minute 22. Darius: minutes 6–14. Avoid long trades before ~14; your side of the game is after 22."
  - A **plain marker** of the champion's typical first-item minute in your rank ("first item usually done ~11:00"). It is a descriptive fact, not a spike claim, so it needs no causal test, only enough completions for a stable median.
  - The personal comparison already built (your first-item minute vs your rank), split into income and spending as 05-items §4 recommends.
- **What not to ship yet:** "spikes at Kraken Slayer" or any per-item spike, and level spikes other than as a measured phase (Deliverable, step 4).

---

## Deliverable: the measurement method

### Step 1 (ship): the game-phase curve per champion-role

- For every player-game with a timeline and minute f, lead(f) = gold − lane opponent's gold.
- Per champion-role and **2-minute bin** b (3–5, 5–7, … up to 29–31), take the mean slope Δlead per minute.
  - Bins with < `minBinGames` games are dropped. This also limits the late-game survivorship of §1.1.
- Subtract the role's mean slope in the same bin; smooth over ±1 bin.
- Shrink each bin toward 0 with the empirical-Bayes prior: τ² estimated across champion-roles by DerSimonian–Laird, not a fixed `priorGames`.
- From the curve:
  - **gain window** = the longest run of bins where the shrunk curve's 90% interval is above 0;
  - **weak window** = the same below 0.
  - Phrase as "from about minute X to Y".
  - If neither window exists, say nothing (the champion is even all game).
- **Gate:**
  - the split-half check on the **curve's windows** (the same windows in both halves, ≥ 80% bin-sign agreement);
  - τ² > 0 with a 95% CI (Q test).
  - Today's result (r 0.61 at 8 min) says this passes now.
- **Sample size:** ~125 games per champion-role for reliability 0.5, ~500 for 0.8 (§1.4). Show from `minGames` 200, so a band at the cap covers almost every champion-role; with all bands pooled, most do today.

### Step 2 (measure once, decide): is item-specific worth chasing?

1. **Risk-set design.**
   - For each completion of item k on champion-role C at minute m, take up to 3 controls: same C, item count k−1 at m, not finished item k by m.
   - Match on lead(m) bin, lead(m) − lead(m−3) bin, and the opponent's completed-item count at m.
   - Effect = treated Δlead(m → m+w) − controls' Δlead.
   - Item-specific spike of C at slot k = effect_C − effect_role.
   - This is the "not-yet-treated" control of Callaway & Sant'Anna; m stratifies the cohorts.
2. **Estimate τ² across champion-roles** (DerSimonian–Laird) for gold, net takedowns and fight win share, at w = 3 and 5.
3. **Decision rule** (config):
   - If τ < `minItemSpread` (e.g. 75 gold per 3 min, opinion: about a quarter of a kill), **stop**: item-specific spikes are not a feature of this game at our data size.
   - Else: n per champion-role for R = 0.8 (§1.4 formula), and show only champion-roles that have it.

### Step 3 (later, if Step 2 passes): per-item (Kraken vs BotRK)

Only through 05-items' pooled decision-point machinery. Never per champion at < 2,000 completions per arm.

### Step 4: levels

- Measure level swings by the same risk-set design (same minute, reached level L vs not yet). Report them only as part of the phase line, e.g. "from level 6 (~minute 7)", if the level-6 effect beats the role's with the same gate.
- The level at which a champion first puts a point in R comes from our `skills` data (median level of the first R point per champion), so ultimate timing is measured, not hardcoded.

### Expected sizes at today's volume

| Data | Phase line | Item-specific |
| --- | --- | --- |
| 10k games all bands (today) | passes (r 0.61) | noise (r 0.09–0.16) |
| 50k-per-band cap, pooled ~150k | reliable for nearly all champion-roles | R ≈ 0.67 for a median champion-role (~3,000 games), if τ holds; still only ±30 gold per 3 min |

---

## What to change in the code or config

1. **`packages/meta` `SpikeAggregator`:** add a `phase` output: per champion-role, the slope by 2-minute bin minus the role's, shrunk by a DL τ², and the gain and weak windows. Add to `ChampionSpikes` as `phase: { from: number; to: number; kind: "gain" | "weak" }[]`, with n.
2. **Spike check:** add a window-level split-half check for the phase, and a τ² report (DL) for every event kind in `pnpm --filter @ldc/server spikes`. Report r **per n bucket** (100–200, 200–400, 400+) instead of one r across all champion-roles, which small-n cells drag down.
3. **Replace the own-placebo `baselineSec` design** with the risk-set comparison (§Deliverable step 2) in the spikes CLI only. Don't ship it in the snapshot until τ passes.
4. **Fights:** in the CLI, compute fights by 15 s kill clusters and the fight win share. Report the standardized effect d for gold, net takedowns and fight share side by side. Optional: store kill `x,y` (Match-V5 `position`) in `MatchTimeline.kills` to allow the spatial split.
5. **Desktop / engine:** show the phase line in the New tab and game plan, and the typical first-item minute as a marker. Hide item spikes (Build-tab mark) until Step 2 passes. Wording in `explain.v1.json`, e.g. `"spikePhaseGain": "Gains most on its lane opponent from about minute {from} to {to}"`.
6. **Config** (shape of the current `meta.v1.json` `spikes` and `engine.v1.json` `spikes`; new keys are additions):

```json
{
  "spikes": {
    "windowMinutes": 3,
    "itemSlots": 3,
    "minGames": 60,
    "priorGames": 100,
    "checkZ": 2,
    "phase": { "binMinutes": 2, "fromMinute": 3, "toMinute": 31, "minBinGames": 40, "minGames": 200, "interval": 0.9 },
    "itemDesign": "riskSet",
    "riskSet": { "controls": 3, "leadBin": 500, "trendBin": 300 }
  }
}
```

```json
{
  "spikes": {
    "minCorrelation": 0.5,
    "minAgreement": 0.8,
    "minZ": 2,
    "minGold": 50,
    "max": 2,
    "timingMinGames": 2,
    "timingSlowMinutes": 1.5,
    "showPhase": true,
    "showItemSpikes": false,
    "minItemSpread": 75
  }
}
```

---

## Self-check

- **Q1:** answered (§1.1–1.4). "No published method separates item from phase" was searched as listed in §1.2.
- **Q2:** answered. "Not a known single metric" (searches in §2.1); sample sizes are estimates with the assumptions stated, plus what to measure.
- **Q3:** answered, with the minimum form.
- **Deliverable:** a method with sample sizes, and the minimum version.
- **Respects the constraints:**
  - nothing hardcoded (phases, ultimate level and minutes all measured);
  - anonymous aggregates only;
  - no in-game push;
  - every shown number gated;
  - no correlational reason given to the player (the phase line is a measured description of the champion's gold trajectory, and the item marker is descriptive).
- **Config JSON** is valid and only adds keys.
- **Weak points:**
  - τ values are back-calculated from aggregate r, not measured.
  - The fight-rate assumptions are mine.
  - The "strongest from minute X" wording has no user test.

## Sources

- SeeMeta, LoL champion scaling by game duration (patch 26.20, read 2026-10-09): https://seemeta.com/en/lol/scaling
- metabot.gg, late-game win rate (26.19, read 2026-10-09): https://metabot.gg/en/league/champions/late-game-win-rate
- LeagueMath, Marksman strength over time (2015): https://www.leaguemath.com/marksman-strength-over-time/
- League of Graphs (win rate by game duration; site blocks fetching, described via SeeMeta): https://www.leagueofgraphs.com/
- Lolalytics Master Yi build page (skill order note): https://lolalytics.com/lol/masteryi/build/
- STRATZ, Dota 2 Item Timings (Russian translation read in full): https://github.com/leamare/articles/blob/master/translations/dota-2-item-timings-stratz.md ; original https://medium.com/stratz/dota-2-item-timings-22d2dbd76bc4
- Mobalytics overlay (power spikes per role, early/mid/late): https://mobalytics.gg/lol-overlay/ (blocked; summarised in search results); The Game Haus on Mobalytics' stoplight spikes (2019-06-14): https://thegamehaus.com/esports/league-of-legends-why-mobalytics-new-champion-section-should-be-a-noobs-first-stop/2019/06/14/
- Mobalytics, 5 types of power spikes: https://mobalytics.gg/blog/5-types-league-of-legends-power-spikes-examples/ (blocked; search summary)
- BoostRoom, LoL Power Spikes 2026 (2026-04-13): https://boostroom.com/blog/understanding-power-spikes-levels-items-and-timing-your-fights
- Hexiled Gaming, Power spikes guide (2025-11-12): https://hexiledgaming.com/power-spikes-guide/
- Eloking glossary, power spike: https://eloking.com/glossary/lol/power-spike
- buildzcrank, Why item win rate stats lie (2026-07-01): https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/
- ElbroC, 5 biases in TFT stats analysis (2023-09-18): https://elbroc.substack.com/p/5-biases-that-stop-you-from-mastering-tft-stats-analysis-e1242ef92911
- Baek & Kwon, kill-conditioned engagement outcome prediction (IEEE CoG 2026), code: https://github.com/Lunecid/LOL_teamfight_Lab
- Maymin, Smart kills and worthless deaths, JQAS 17(1) 2021: https://ideas.repec.org/a/bpj/jqsprt/v17y2021i1p11-27n3.html ; https://www.degruyterbrill.com/document/doi/10.1515/jqas-2019-0096/html ; NESSIS 2017 talk: https://www.nessis.org/nessis17/Maymin.pdf
- Mobalytics, How to understand power spikes using Mobalytics (phases and how colours are calculated): https://mobalytics.gg/blog/how-to-understand-power-spikes-using-mobalytics/ (blocked; search summary)
- LeagueMath, Champion win and lose times (season 4): https://www.leaguemath.com/champion-win-and-lose-times/
- Cheng et al. 2019, team composition in Honor of Kings (96M matches; surrender by duration): https://arxiv.org/abs/1902.06432
- Heterogeneous effects of software patches in a MOBA (FDG 2021): https://arxiv.org/abs/2110.14632
- Li, Propert & Rosenbaum 2001, balanced risk set matching (via `rsmatch`): https://search.r-project.org/CRAN/refmans/rsmatch/html/brsmatch.html ; https://skent259.r-universe.dev/rsmatch/doc/risk-set-matching-with-rsmatch.html
- Staggered DiD (Callaway & Sant'Anna; Sun & Abraham): https://bookdown.org/mike/data_analysis/staggered-difference-in-differences.html ; Borusyak, Jaravel & Spiess: https://arxiv.org/pdf/2108.12419
- Immortal time bias and landmark analysis: https://metricgate.com/blogs/immortal-time-bias/ ; https://arxiv.org/abs/2312.06155
- Anticipation / Ashenfelter's dip in event studies: https://cran.rstudio.com/web/packages/did/vignettes/extensions.html ; https://arxiv.org/pdf/2512.06804
- DerSimonian–Laird τ²: https://metricgate.com/docs/random-effects-meta-dersimonian-laird/ ; https://arxiv.org/pdf/1904.01948
- Spearman–Brown: https://real-statistics.com/reliability/internal-consistency-reliability/split-half-methodology/spearman-browns-predicted-reliability/
- Match-V5 timeline event fields (position on kills): https://cassiopeia.readthedocs.io/en/latest/cassiopeia/match.html
- Jalovaara 2024, win probability for items (Aalto): https://sal.aalto.fi/publications/pdf-files/theses/mas/tjal24a_public.pdf

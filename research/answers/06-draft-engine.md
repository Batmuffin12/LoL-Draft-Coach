# 6. The draft engine: what really predicts a solo-queue win

2026-10-09 · research only (no code or config changed). Covers section 6 of [RESEARCH-QUESTIONS.md](../RESEARCH-QUESTIONS.md). Builds on [REVIEW-2026-10.md](../REVIEW-2026-10.md) §1.1, §5 (backtests), [ENGINE-PLAN.md](../../docs/ENGINE-PLAN.md) and [11-data-sources.md](11-data-sources.md). Opinion is marked **(opinion)**. Rating points are the engine's unit: 400·log10(odds); near 50 %, **1 pp ≈ 7 points** (`rating.ts`).

## Summary

1. **The draft alone predicts little, and that is normal.** Published solo-queue models that see only the ten champions reach **53–57 % accuracy**. DraftRec's benchmark, on 280k top-0.1 % Korean games, has champions-only logistic regression at **53.2 %** and its best champions-only model at **54.3 %** ([DraftRec, WWW 2022, Table 9](https://arxiv.org/pdf/2204.12750)). LoLDraftAI reports **56 %** on millions of games, with good calibration ([LoLDraftAI, 2025-09-04](https://loldraftai.com/blog/loldraftai-explained)). Our production result (log-loss 0.6928 vs 0.6932) sits at the low end of that range. More matchup tuning will not change the picture much.
2. **Who plays the champion matters more than which champion it is.** Adding each player's history lifts DraftRec from 54.3 % to **56.2 %**. That is the largest single gain in the table. In Dota 2, hero-only models reach 58.7 %, and adding player history lifts them to 71.5 % ([Yang et al. 2017](https://arxiv.org/abs/1701.03162)). The often-quoted **75 %** ([Do et al., FDG 2021](https://arxiv.org/abs/2108.02799)) is inflated: it uses the season win rate on the champion, and the predicted game is part of that season (checked in the paper's text, see Q1). Treat it as a ceiling, not a target.
3. **Mastery effect:** about **−10 pp on a champion's first ~8 games**, back to even at about **20 games**, and almost flat after that. iTero measured this on 1M Gold games ([iTero](https://www.itero.gg/articles/mastery-a-statistical-summary)). Riot's blog says it too: about +4 pp over the first 15 games even on easy champions, and a long tail past 100 games on hard ones ([Riot, 2020](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/)). The owner's own curve agrees. The effect is **2–4× bigger than any matchup**. The personal term should be **an experience curve on an absolute scale** (games and mastery), scaled by a **measured** champion difficulty. It should not be a percentile within the player's own pool. Formula in Q2.
4. **Early-game matchups:** gold@15 is a **much less noisy** lane signal. Our estimate is roughly 5–10× fewer games for the same precision; the exact factor depends on the spread of lane gold, which we must measure (Q3). But gold is not winning: scaling champions lose lanes and win games. Use it as the **prior mean** for the lane matchup's win effect, through a slope fitted per role, and let win/loss data override it as games pile up. Do not use it as the win effect itself.
5. **Patch diffs work, but only with CommunityDragon.** On patch 26.20 (Data Dragon 16.20.1) I diffed both sources against Riot's patch notes. A filtered diff of **CommunityDragon champion `.bin.json`** files found **16 of 16** changed champions, with **0 false flags** among the 157 unchanged ones. It also found **all 3** changed Summoner's Rift items. A **Data Dragon** diff found only **6 of 16** champions and 1 of 3 items. Data Dragon's `attackdamageperlevel` is **0 for all 173 champions**, so it missed both AD-growth changes (Ashe, Lucian). The method and filters are in Q4.
6. **Off-role or autofill: no published controlled number.** Riot clearly treats autofill as a handicap. The 2026 changes pair autofilled players against each other (91 % of cases), give the team with more autofilled players "slightly higher MMR players", and protect LP ([Riot, /dev Ranked 2026](https://www.leagueoflegends.com/en-gb/news/dev/dev-ranked-2026/), [Inven Global](https://www.invenglobal.com/articles/23754/lol-autofill-matchmaking-hits-91-dodge-rate-drops-to-3)). But Riot publishes no win-rate gap. Measure it on our users' own games (Q5).
7. **Drop or demote:** the pool-relative mastery percentile; comfort win rates shrunk toward the player's own average with k = 10; the Team term inside the probability; cross-lane counters and duos as independent probability terms at today's volume; Data Dragon as a patch-change detector.

---

## Q1. How much does the draft predict in solo queue?

### Evidence

| Source (date) | Data | Champions only | With player info | Notes |
| --- | --- | --- | --- | --- |
| [DraftRec, Lee et al., WWW 2022](https://arxiv.org/pdf/2204.12750) (Table 9, after the draft) | 279,893 LoL games, top 0.1 % KR, Jun–Sep 2021; time split 85/5/10 | LR **53.2 %**, NN 53.4 %, HOI 53.4 %, NeuralAC 53.5 %, DraftRec-no-history **54.3 %** | OptMatch 54.5 %, DraftRec **56.2 %** | Same table for Dota 2: LR 61.3 % is the best; history adds nothing (short histories). Gains from history level off at about 50 past games (Fig. 7). |
| [LoLDraftAI explained (2025-09-04)](https://loldraftai.com/blog/loldraftai-explained); [home page](https://loldraftai.com) | "millions" of ranked games; inputs: champions, patch, elo | **56 %** (56.7 %; 57.7 % with runes on the home page) | — | Calibrated ("predicting 51 % → ~51 %"). Their own words: "draft is only a small part of solo queue". Vendor numbers, no public test protocol. |
| [Do et al., FDG 2021](https://arxiv.org/abs/2108.02799) (read in full) | **5,000** NA games, Iron–Diamond, 2020 | — | **75.1 %** (DNN), 73–75 % for other models | Features: mastery points and the **2020 season win rate on the champion**. The match is "their most recent ranked match" of that season, so the **predicted game is inside the season win rate**: leakage. The paper also says that the "majority of pre-match predictors have an accuracy around 55–60 %". It found that games played on the champion (season and recent) had no effect, while mastery and win rate did. |
| [Yang, Qin & Lei 2017](https://arxiv.org/abs/1701.03162) | 78,362 Dota 2 games | **58.7 %** | 71.5 % | Dota has no fixed roles; heroes vary more. |
| [Semenov et al. 2017](https://www.researchgate.net/publication/313010005_Performance_of_Machine_Learning_Algorithms_in_Predicting_Game_Outcome_from_Drafts_in_Dota_2) | Dota 2 drafts by skill bracket | AUC **0.66–0.70**, higher in higher skill brackets | — | The draft predicts more at higher skill. This fits our band weights (band 1 lowest). |
| [iTero, The Draft Model](https://itero.gg/articles/the-draft-model) (via [REVIEW §1.1](../REVIEW-2026-10.md)) | pro games | — | odds 63–65 % → 70–73 % with the draft | "~7.5 % of a game is influenced by the drafting phase" (pro, coordinated teams). |
| [winrate.gg benchmark (2026-04-28)](https://winrate.gg/articles/draft-recommendation-benchmark) | 20,000 Gold+ games | When the champion actually picked was a tool's #1, its team won 58.7 % (winrate.gg), 52.7 % (iTero), 48.5 % (LoLDraftAI) | — | Written by one of the vendors. It measures agreement, not causation: a tool that ranks comfort picks first will "win" here (the vendor says "correlation, not a causal experiment"). |

**Best achievable with champions only: about 54–57 % accuracy.** That means real differences between reasonable picks of **±1–3 pp**, as the review found. Higher numbers in the literature use player features or pro play, or leak the result.

### Matchups vs synergy vs composition

| Signal | Effect size | Sources |
| --- | --- | --- |
| Lane matchup | Explains **~14 %** of the variation in a champion's performance; 5–29 % by champion; top 17 %, bot 11 % (Plat+, 2021) | [LeaguePhD](https://leaguephd.com/en/blog/dont-pick-a-champion-just-based-on-your-lane-matchup/); typical pair deltas 1–4 pp ([REVIEW §3](../REVIEW-2026-10.md)) |
| Role interactions that matter | DraftRec's attention concentrates on **top–jungle, mid–jungle and ADC–support**; other cross-role pairs get little weight | [DraftRec §5.5, Fig. 4](https://arxiv.org/pdf/2204.12750) |
| Team damage mix | Win rate is about 50 % or more while AD is **20–80 %** of team damage, and lower outside that range; full AP is punished more than full AD | [iTero draft-sq](https://www.itero.gg/articles/draft-sq) (no p-values given) |
| Champion strength (meta) | Most champions sit at **46–54 %** | [iTero draft-sq](https://www.itero.gg/articles/draft-sq); win rates are kept near 50 % by patching ([Kica et al., WPI](https://web.cs.wpi.edu/~claypool/papers/lol-crawler/paper.pdf)) |
| Our backtest | Meta alone is the only term with a real gain at the draft level; lane, counter, synergy and Team are indistinguishable from chance or worse; pairs need far more smoothing (best pair prior 400 or more) | [REVIEW §5.3 and the production backtest](../REVIEW-2026-10.md) |

**Conflicting views.** Do et al. conclude "players should only play champions that they have mastered … regardless of team composition". LoLDraftAI and winrate.gg sell composition models. Both views hold in their own scope. Champion strength plus composition is worth a few points of accuracy. Player–champion experience is worth more, but it is personal: no meta snapshot can see it. For a personal coach, the experience term is the larger lever **(opinion, consistent with all sources above)**.

---

## Q2. The mastery effect, by champion difficulty, and priors for the personal term

### Evidence

| Source (date) | Finding |
| --- | --- |
| [iTero, Mastery: a statistical summary (2023-04-24)](https://www.itero.gg/articles/mastery-a-statistical-summary), [same post](https://jackjgaming.substack.com/p/mastery-a-statistical-summary-of), [iTero draft-sq](https://www.itero.gg/articles/draft-sq) | 1M+ solo games, patch 13.7, about Gold, NA/EUW/KR. Under 5k mastery **41.5 %**; under 10k about **44 %**; break-even at **~12k** (≈ **20 games** at their ~600 points per game); 50k–1M 51.77 %; over 1M 51.73 %; 500k+ 54.5 %. 2.5k→7.5k mastery ≈ **+8 pp**; 75k→175k < 1 pp. About 20 % of players are on a champion under 10k. The effect is biggest in **jungle** and smallest for **ADC**. |
| [Riot, /dev: Balancing New Champions (2020-07-06)](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/) | "Even an easy-to-learn champion … will likely increase in win rate by **4 %** over the first ~15 games." Easy champions have steep curves that settle fast (Neeko). Hard ones keep improving to the **100th game or beyond** (Yasuo, Katarina, Nidalee). Riot now releases champions at their long-term balance, so first-week win rates look weak. |
| [League of Graphs, win rate by experience (patch 16.19)](https://www.leagueofgraphs.com/champions/winrates-by-xp) (page blocks fetching; numbers via search snippets) | Win rate at **50+ ranked games** vs the champion's Plat+ win rate: Nilah **+9.9 pp**, Karthus +8.8, Hecarim +8.0, Camille +7.6, A. Sol +7.3, Taliyah +7.2 | A public, per-champion curve exists. We can't use it as a list ("nothing hardcoded"), but it shows the spread between champions: from about +2 to +10 pp. |
| [iTero, How useful is a champion's win rate?](https://www.itero.gg/articles/how-useful-is-a-champions-win-rate) | Qiyana mid: under 45 % for first-timers, 55 %+ with mastery; Malzahar: about 1 pp drop for newcomers. | Again: a large spread between champions. |
| [LeagueMath, champion difficulty (2015, patches 5.3–5.12)](https://www.leaguemath.com/champion-difficulty/) | 2.1M NA games. **Measured difficulty** = slope of the champion's win rate across leagues (Bronze→Challenger), or its Bronze win rate. Riot's 1–10 difficulty often **disagrees** with it (Heimerdinger: Riot 8, measured 1.0; Morgana: Riot 1, measured 5.7). | Old, but the method is still sound. We have win rate per band already. |
| Owner's own history ([REVIEW](../REVIEW-2026-10.md)) | 41–45 % on champions with under 20 games, ~57 % from 20 games on. | One player, with survivorship (see caveat). |
| [Do et al. 2021](https://arxiv.org/abs/2108.02799) | Mastery points and the champion win rate correlate with the result; **games played (season or last 20) did not**. | Small sample (5k), leakage; weak evidence against "games" as the unit. |

**Caveat (survivorship).** All the curves above are **cross-sectional**: they compare different players at different mastery. Players who keep playing a champion are the ones who win with it. So the *within-player* learning curve is probably flatter than 41.5 % → 52 %. The review's plan is the right fix: fit the curve on users' own games in time order, with a per-user intercept ([REVIEW §5.3 item 7](../REVIEW-2026-10.md)). Use the published curves as the **prior** until that fit exists.

**Mastery points changed in 2024.** Since patch 14.10, points depend on your grade relative to teammates, win/loss and game length, and levels need Marks of Mastery ([Riot support](https://support.riotgames.com/en-us/league-of-legends/rewards/champion-mastery-guide), [masterychart](https://masterychart.com/blog/champion-mastery-rework/), [Mobalytics](https://mobalytics.gg/?p=74433)). iTero's "600 points per game" (2023) no longer holds. **Convert mastery to games with a per-player ratio** from champions whose games are all in the user's history.

### Can published curve shapes be priors? Yes, as a formula

Proposed personal term, in rating points, for player p on champion c:

```
personal(p, c) = experience(n_eff, m_c) + skill(p, c)

experience(n, m) = −P0 · m · exp(−n / (τ0 · m))
n_eff  = max(games on c in history (any role, recency-weighted),
             masteryPoints_c / pointsPerGame_p)
pointsPerGame_p = median over the player's champions with ≥ 5 games in history of
             (mastery gained while those games were played) / games
             (fallback: config value)
m_c    = clamp(exp(β · z_c), mMin, mMax)        // difficulty multiplier, 1 = average champion
skill(p, c) = ratingOf(shrunk own win rate on c) − ratingOf(c's band win rate),
             shrunk with k ≈ 100 games toward the band rate
```

**Starting values, calibrated to the evidence (to be refitted):**

- **P0 ≈ 100 points, τ0 ≈ 10 games.** At m = 1: about −10 pp averaged over the first 8 games (iTero 41.5 % vs a 51.7 % plateau); −2 pp at 20 games (iTero break-even ~20); −0.3 pp at 40.
- **mMin ≈ 0.4, mMax ≈ 2.0.** An easy champion (m 0.4) starts at −40 points (−6 pp) and recovers within ~10 games. This is the order of Riot's "+4 % over 15 games". A hard champion (m 2) starts at −200 points (−27 pp is too much, so also cap at `maxPenalty` ≈ 120 points ≈ −16 pp). It is still about −1.5 pp at 60 games, which matches Riot's "long tail" and League of Graphs' +7–10 pp at 50+ games.
- **k ≈ 100 for skill.** Ranked matchmaking pushes everyone toward 50 %. The true spread of one player's win rate on one champion around the band rate is probably only about 5 pp (**an estimate; measure it from users' games**). Then k = p(1−p)/τ² = 0.25/0.05² = **100 games**. Today's k = 10, set relative to the player's own average, makes 10 lucky games look like real skill. It also double-counts champion strength (meta already has it).

**Where z_c (difficulty) comes from, in order of preference. All are data, none is a list:**

1. **Measured learning gap per champion** from anonymous mastery buckets on collected rows: the champion's win rate on games with low mastery (under ~10 games' worth) vs high mastery, in the band, shrunk to the mean gap. This is the best source. Cost: one Champion-Mastery-V4 call per participant (10 per match). Do it on a sample of matches (for example 1 in 5) and store only the bucket, never the PUUID. Check this against the no-brokering rule first (the review raises the same point).
2. **Cross-band slope** (LeagueMath's method): the champion's win rate in band 4 minus band 1, shrunk. We already have the data. The slope mixes "hard to learn" with "strong at high skill", so it is a proxy.
3. **Riot's own rating** as a weak fallback: Data Dragon `info.difficulty` (1–10) or CommunityDragon `tacticalInfo.difficulty` (1–3). Both verified in the 16.20 files. LeagueMath shows these often disagree with measured difficulty, so give this source little weight.

Combine as `z_c = shrink(z_measured, toward z_fallback)`, β ≈ 0.35 (so ±2 z → m from 0.5 to 2.0) **(opinion: starting value, refit)**.

What this replaces: `percentile(mastery, pool)` (half of every pool gets a penalty, even a 300k champion), `learningPenalty` as a flat −50 cliff, and `comfortScale` 160 as a hand-set scale.

---

## Q3. Matchups from early stats (gold or CS at 10–15)

### Is it a known, better signal?

- **Early gold predicts the result strongly.** On ~10k Diamond–Master solo games, team gold difference at 10 minutes alone gives **72.4 %** accuracy, and gold + XP + kills + deaths give 73.1 % ([CMU capstone 2024](https://www.stat.cmu.edu/capstoneresearch/spring2024/460files/team17.pdf), Kaggle "Diamond ranked games (10 min)"). Lee et al. report 73 % at 15 minutes with in-game data, as cited by [Do et al.](https://arxiv.org/abs/2108.02799). In pro play, +750 gold at 15 ≈ 60 % and +1,500 ≈ 70 % ([Pinnacle EGR](https://www.pinnacle.com/en/esports-hub/betting-articles/league-of-legends/gold-difference-at-15-minutes/rqg29g3m6jhppqpc)).
- **Stats sites show early-lane numbers.** u.gg shows Gold Differential @15 in its game analysis ([lolnow on u.gg](https://lolnow.gg/u-gg/)). I could not confirm a per-matchup GD@15 column on Lolalytics or u.gg: both block fetching. **Not verified.**
- **No paper found that compares matchup estimates from gold@15 with those from win/loss.** Searched: Google/Bing-style web search for "gold diff 15 matchup sample size", LeaguePhD, Lolalytics, u.gg, academic terms. So the rest of this section is reasoning plus a measurement plan.

### Why it should need fewer games (reasoning, to be measured)

For a win/loss pair delta, SE = √(0.25/n). ±2 pp at 1 SE needs **~625 games**; ±1 pp needs ~2,500. Lane gold@15 difference per game has some spread σ_G (**measure it; expect very roughly 1,500–2,500 gold in solo queue**). A 300-gold matchup effect (our `laneGoldGap` threshold) at SE 100 needs n = (σ_G/100)², or about **225–625 games**. In win terms, 300 lane gold is only about 1–3 pp, using the team slope above (0.0003–0.0005 logit per gold) as a rough upper bound for one lane. Per unit of effect, gold is roughly **5–10× more precise** than win/loss **(estimate)**.

### Why gold is not the answer by itself

- **Scaling and tempo:** a Kayle or Kassadin can lose lane gold and win the game. The [ENGINE-PLAN feasibility check](../../docs/ENGINE-PLAN.md) found tanks and scalers had no first-item spike.
- **Lane gold includes jungle help:** jungle presence in that lane is mixed in.
- **Gold is a "how the lane goes" fact, not a win chance.** It is good for coaching text ("usually ~300 gold behind at 15 vs X; you win later") even where it doesn't move the probability.

### Recommended use

1. **Show** gold@15 per matchup as the lane fact. It has its own significance check: n ≥ 100 and |mean| > 2·SE. Use it in the game plan card the review asked for.
2. **Win model:** lane matchup effect posterior = shrink(pair win delta, toward prior μ, k_pair). The prior is μ = β_role · shrink(GD15_pair) + class-level term. Fit β_role per role by weighted regression of pair win deltas on pair GD15 deltas, across pairs with many games. Fit k_pair by method of moments (the review's §5.2).
3. **Games needed:** with this prior, a pair becomes useful once its GD15 has n ≈ 100–300. That is about 10× sooner than win/loss alone.

**Measure on the production copy:** σ_G per role; split-half reliability of pair GD15 vs pair win delta (odd vs even days); the correlation between the two across pairs with ≥ 300 games; then the backtest ablation (lane term from win/loss vs from the GD15 prior).

---

## Q4. Patch changes

### How sites handle a new patch

| Source | Practice |
| --- | --- |
| [LoLDraftAI (2025-09)](https://loldraftai.com/blog/loldraftai-explained) | "Expect a few days delay after new patches. Early patch data may be combined with the previous patch data." Patch is a model input. |
| [Riot August on stats sites (2020)](https://devtrackers.gg/leagueoflegends/p/8fc2d1be-riot-august-u-gg-data-is-garbage) | "Early in a patch when only a few days of data have been collected … even plat+ data is unreliable." Sites are good for *relative* balance, not exact win rates. |
| Lolalytics ([home](https://lolalytics.com/), [Gamer Codex](https://thegamercodex.com/en/league-of-legends/tools/lolalytics)) | Shows each champion's win-rate change vs the previous patch. Third-party write-ups warn that buffed champions are noisiest early because many players are new to them (not verified on Lolalytics itself). |
| [Kica et al., WPI (2016)](https://web.cs.wpi.edu/~claypool/papers/lol-crawler/paper.pdf) | 465k games over 160 patches. Patches pull win rates toward 50 %. **Selection effect:** Urgot's win rate fell after 8 buffs because his pick rate doubled with players new to him. Kalista's rose after nerfs because of changes to *other* champions. |
| [Riot (2020)](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/) | New champions now ship at their long-term balance, so their first weeks look weak: the learning curve, not power. |

**How fast does a changed champion settle? No direct published measurement found** (searched: "win rate stabilize days patch", Riot dev blogs, Lolalytics, Reddit). From the sources above, an early-patch win rate is biased by **who** plays the champion, not only by noise. If a buff doubles a champion's pick rate and the new half plays at the mastery curve's −10 pp, the observed win rate understates the buff by up to **~5 pp** in the first days **(arithmetic from the iTero curve, not a measurement)**. This is the same size as typical patch changes.

### Diffing game data between versions: tested on 26.20

I diffed versions 16.19 → 16.20 (patch 26.20, live 2026-10-06/07) against [Riot's patch notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/). The notes list 16 Summoner's Rift champions (Ambessa, Ashe, Cassiopeia, Diana, Kennen, Kindred, K'Sante, Lillia, Lucian, Mordekaiser, Neeko, Smolder, Swain, Tahm Kench, Vayne, Yunara), 3 SR items (Experimental Hexplate, Hextech Rocketbelt, Runaan's Hurricane), and no runes. The diff scripts are ~30 lines of Python each. They were run read-only in the scratchpad and are not in the repo.

| Source and method | Champions found | False flags | Items found |
| --- | --- | --- | --- |
| Data Dragon `championFull.json` (stats, spells; ignoring lore, skins, tips) | **6 / 16** (Cassiopeia, K'Sante, Lillia, Mordekaiser, Swain, Vayne) | 1 (Kha'Zix: description text only) | `item.json`: **1 / 3** (Rocketbelt, description only) |
| CommunityDragon `game/data/characters/<alias>/<alias>.bin.json`, all leaves | 16 / 16 | almost every champion (event enums, hashed objects, mode overrides) | — |
| **CommunityDragon bin, filtered** (below) | **16 / 16** | **0 / 157** unchanged champions | `game/items.cdtb.bin.json`: **3 / 3** (3073, 3085, 3152), plus 4 small changes not in the notes (3068, 6660, 6664 and a variant); check those by hand |

**Why Data Dragon fails.** `stats.attackdamageperlevel` is **0 for all 173 champions** in 16.20.1, so the Ashe and Lucian AD-growth changes are invisible. Spell `effect`/`effectBurn` arrays are stale or empty for reworked kits; values now live in the game's `DataValues` and `mSpellCalculations` ([PlaZma PR on Data Dragon + CommunityDragon](https://github.com/HaitoDann/PlaZma/pull/19), [riot-api-libraries docs](https://riot-api-libraries.readthedocs.io/en/latest/ddragon.html)). Don't use Data Dragon to detect changes.

**The filtered CommunityDragon diff (the method):**

1. On a new Data Dragon version, the CommunityDragon path is its `major.minor` (`16.20`). Keep the previous one.
2. For each champion (alias from Data Dragon ids, lower-cased), fetch `raw.communitydragon.org/<v>/game/data/characters/<alias>/<alias>.bin.json` for both versions. Each file is 45–120 KB, ~25 MB per patch on the server, once per patch, cached.
3. Flatten to paths. Keep numeric leaves whose path matches:
   - `CharacterRecords/Root/` base stats and per-level stats;
   - `mSpell/DataValues`, `mSpell/Cooldown`, `cooldownTime`, `mana`, `castRange`, `mSpellCalculations`.
4. Drop:
   - `DataValuesModeOverride` and mode blocks (ARAM/Mayhem changes appear there; for example Garen's and Thresh's Mayhem changes were correctly ignored);
   - `EventsToTrack` and `mClientData`;
   - paths under a top-level hash key `{xxxxxxxx}` (renamed objects caused all the raw false flags: Lee Sin, Yasuo, Ekko …);
   - paths present in only one version.
5. Compare values rounded to 4 decimals. Raw floats flagged Varus over 0.03 vs 0.030000001. Ignore rank index 0 and indexes above the spell's max rank. Cassiopeia's W "cooldown 14 → 16" was index 6, an unused rank.
6. Items: `game/items.cdtb.bin.json`, entries `Items/<id>`, same rules. Restrict to Summoner's Rift items (Data Dragon `maps["11"]`, purchasable).
7. Output: a **changed set** per patch (champions, items), with the changed paths for a human check. **Don't infer buff or nerf direction.** Lower cooldowns are buffs and higher damage is a buff, so the signs disagree; use the data for direction.
8. Runes: **not tested** (26.20 had no rune changes). CommunityDragon `perks.json` is the obvious source; test on the next patch with rune changes.

Is it reliable? On this one patch: recall 100 %, precision 100 % for champions after filtering. **One patch is a small test: re-run on the next 2–3 patches before relying on it.** It is Riot data published by a community mirror, which "never hardcode" allows. [11-data-sources](11-data-sources.md) already rates CommunityDragon as allowed, cached per patch.

### What to do with the changed set (aggregation)

- **Unchanged champions:** pool the previous patch at near-full weight. Patches move them only slightly (and indirectly, like Kalista).
- **Changed champions and items** (and matchups or duos that include one): weight previous-patch games at **~0.3** and the new patch at 1. Shrink the new-patch win rate toward the previous-patch value with k ≈ 1,000 games: the spread of real patch-to-patch changes is about 1.5 pp, and k = 0.25/0.015² ≈ 1,100 **(estimate; measure the spread of changes for flagged champions)**.
- **Show** "changed this patch, few games yet" on flagged champions, instead of a confident number.
- **Measure settling:** for each flagged champion, the daily new-patch win rate vs its value at patch end. Report the days until it stays within ±1 pp. Also report pick-rate change × mastery-bucket mix, if mastery buckets are collected. This answers "how fast" with our own data in 2–3 patches.

---

## Q5. Off-role and autofill

| Source | Finding |
| --- | --- |
| [Riot, /dev: Ranked 2026 (2025-12-01)](https://www.leagueoflegends.com/en-gb/news/dev/dev-ranked-2026/) | Autofill parity: autofilled players are matched against autofilled players in the same position. Otherwise each team gets the same number, and as a last resort "the team with more autofilled players will have slightly higher MMR players". Aegis of Valor gives double LP or no LP loss at grade C+. You can no longer ban an ally's hovered champion. |
| [Inven Global, Riot briefing (July 2026)](https://www.invenglobal.com/articles/23754/lol-autofill-matchmaking-hits-91-dodge-rate-drops-to-3) | Autofilled vs autofilled in the same lane: 35 % → **91 %**. |
| [iTero mastery (2023)](https://www.itero.gg/articles/mastery-a-statistical-summary) | The experience effect is biggest in **jungle**, smallest for ADC: role-specific skill matters. |
| [Eaton, Mendonça & Sangster, HFES 2018](https://journals.sagepub.com/doi/10.1177/1541931218621030) | Role familiarity (the same person in the carry role) has a positive effect on team performance. |
| [Ask Riot: Autofill in Ranked (2020)](https://www.leagueoflegends.com/en-us/news/dev/ask-riot-autofill-in-ranked/) | Explains why autofill exists; no numbers. |

**No published, controlled measurement of the off-role win-rate cost was found.** Searched: Riot dev blogs and Ask Riot, iTero, Reddit and boards (the old boards are offline), academic search for role experience. Riot's MMR compensation and LP protection show that Riot measures a real cost. It doesn't publish the number. Since parity (91 %), the *net* cost in a game is smaller: both lanes are usually off-role. The cost against an on-role opponent remains in the other 9 %, plus your champion-experience cost.

**What to do:**

- Model off-role as **two experience curves**: champion (Q2) and role, `role(n_role) = −R0 · exp(−n_role / τ_role)`. Here n_role = games in that role among the last 1,000 (recency-weighted). Champion experience carries across roles; only the role term changes. This replaces `unplayedRoleShare` 0.6 (hand-set).
- **Starting value (assumption, not evidence): R0 ≈ 35 points (−5 pp), τ_role ≈ 15 games.** Fit it before showing any number.
- **Measure** on users' own history: win rate (and early metrics: CS@10, deaths before 14) by role-experience bucket, with a per-user intercept. The collector cannot measure this, because collected rows have no history. Per-user volume is small, so pool all users. Report the coefficient with its interval; show it only if the interval excludes 0.
- **Autofilled mode (product):** when the assigned role is one the player rarely plays, rank picks by **experience first** (lowest learning cost in this role among champions you know), then meta. Mention Aegis (grade C+), as [REVIEW §6.5](../REVIEW-2026-10.md) proposed. **(opinion)**

---

## Deliverable

### Ranked draft signals (Gold–Plat solo queue)

| # | Signal | Expected effect | Data needed to use it | Sources |
| --- | --- | --- | --- | --- |
| 1 | **Your experience on the champion** (games, mastery) | −10 pp on the first ~8 games, ~0 at ~20 (average champion); from about −5 pp (easy) to −15 pp (hard), recovering in 10 to 60+ games | Own history + mastery (have) | iTero, Riot, League of Graphs, owner's curve, Do et al. (direction) |
| 2 | **Your role experience** (autofill/off-role) | Unknown; Riot compensates for it. Assumed −5 pp at zero until measured | Own history by role (have) | Riot Ranked 2026, Inven, iTero (jungle), Eaton et al. |
| 3 | **Champion strength in band, this patch** (meta) | ±1–4 pp (most champions 46–54 %) | Collected band data (have); patch-aware weights | iTero, Kica et al., our backtest (only real gain) |
| 4 | **Lane matchup** | ±1–4 pp; ~14 % of the variation in champion performance | ~100–300 games/pair via the GD15 prior; ~2,500 by win/loss alone for ±1 pp | LeaguePhD, review §3, Q3 |
| 5 | **Jungle–lane and ADC–support pairs** | Small, pairwise; ±1–2 pp **(estimate)** | ≥ 2,500 games/pair, or a class-level prior | DraftRec attention, backtest (synergy alone was a loss before smoothing) |
| 6 | **Team damage mix** (AD share outside 20–80 %) | A few pp at the extremes only | Champion damage attributes (have) | iTero; our Team term showed no gain |
| 7 | Other cross-lane counters, other duos | ≈ 0 at our volume | — | Backtest |

### Priors for the personal term

The formula and starting values are in Q2: `P0 = 100`, `τ0 = 10`, `β = 0.35`, `m ∈ [0.4, 2.0]`, `maxPenalty = 120`, `skill k = 100`. The role term is in Q5: `R0 = 35`, `τ_role = 15` (assumption). All are refitted on users' time-ordered games, with the backtest the review describes.

### Patch-diff method

Filtered CommunityDragon `.bin.json` diff (Q4): 16/16 champions and 3/3 items on 26.20, 0 false flags. Use the changed set to down-weight previous-patch games for those champions only.

### What to drop

- `percentile(mastery, pool)` in comfort (`comfort.ts:97`): penalises half of every pool.
- Comfort win rates shrunk toward the player's own average with `smoothingK` 10: too little smoothing, and it double-counts meta. Replace with the `skill` term (k ≈ 100, toward the band rate).
- `learningPenalty` as a flat cliff; `comfortScale` as a hand-set scale; `unplayedRoleShare`.
- Team, cross-lane counter and synergy terms **inside the shown probability** at today's volume. Keep them only as ranking tie-breakers or warnings ("full AD") until a backtest shows a gain.
- `lastPickCounterBoost` inside `expectedWin` (it's a utility, not a probability; review §5.2).
- Data Dragon as a source of champion numbers for change detection.

---

## What to change in the code or config

Each change waits on the backtest, as in ENGINE-PLAN step 7. The JSON fits the current shapes as **new keys**; old keys stay until the new path is tested.

1. **`packages/engine/src/comfort.ts` + `live.ts`:** compute `n_eff` (own games, or mastery ÷ per-player points per game) and the experience curve with the difficulty multiplier. Compute `skill` as the shrunk own win rate minus the champion's band win rate. Remove the pool percentile from the personal term. Proposed `config/engine.v1.json` → `rating.personal` additions:

```json
{
  "experience": {
    "penalty": 100,
    "tauGames": 10,
    "maxPenalty": 120,
    "difficultyBeta": 0.35,
    "minMultiplier": 0.4,
    "maxMultiplier": 2.0,
    "pointsPerGameFallback": 700,
    "minGamesForPointsRatio": 5
  },
  "skill": { "priorGames": 100, "maxPoints": 60 },
  "role": { "penalty": 35, "tauGames": 15, "historyGames": 1000 }
}
```

   `pointsPerGameFallback` 700 is a placeholder **(assumption)**: post-14.10 points per game are not published; take the median from users' data.
2. **`packages/meta`:** per champion-role `difficulty`. First the cross-band slope (we have the data). Later the mastery-bucket gap, if the anonymous mastery bucket is approved (it costs calls; check the no-brokering rule). Fallback: `info.difficulty` from Data Dragon (`packages/ddragon`).
3. **`packages/meta` / server meta job:** a `PatchDiff` step. It fetches CommunityDragon bins for the new and previous version (new adapter function next to `packages/ddragon`, cached per patch), outputs `changed: { champions: [], items: [] }` in the snapshot, and applies the weights. Proposed `config/meta.v1.json` → `aggregation.patch`:

```json
{
  "patch": {
    "changedPreviousWeight": 0.3,
    "unchangedPreviousWeight": 0.9,
    "changedPriorGames": 1000,
    "diffDecimals": 4
  }
}
```

4. **Lane term:** a GD15 prior per pair with a fitted per-role slope. Fit `k_pair` by method of moments (review §5.2.1). Show GD15 as the lane fact once n ≥ 100 and |mean| > 2·SE.
5. **Backtest additions (production copy):**
   - the personal term on users' time-ordered games (per-user intercept);
   - σ_G and split-half reliability of GD15 per pair;
   - the GD15 prior ablation;
   - daily settling of flagged champions over 2–3 patches;
   - an off-role coefficient from users' games.
6. **Autofilled mode** in the panel (rank by experience first; Aegis C+ hint). Today `packages/lcu` reads only `assignedPosition` (`schemas.ts:13`). Autofill can be inferred by comparing it with the player's own role history. Alternatively, find a read-only LCU field that says the role was filled; that is not checked here **(opinion: product, not engine)**.

---

## Self-check

- **Q1:** answered (53–57 %, sources: DraftRec Table 9 read from the PDF, LoLDraftAI, Do et al. read in full, Yang, Semenov). Matchups vs synergy vs composition: LeaguePhD, DraftRec, iTero and our backtest.
- **Q2:** answered (iTero, Riot, League of Graphs, LeagueMath, owner). The formula uses data only (games, mastery, measured difficulty, Riot's difficulty fields); no champion list. Survivorship caveat stated.
- **Q3:** partly answered. No paper compares gold vs win/loss matchup estimates; the reasoning and the measurement plan are given, and the per-matchup columns on sites are marked unverified.
- **Q4:** answered, with an original test against official patch notes (one patch; re-test advised). The "settle speed" has no published number; marked, with how to measure it.
- **Q5:** no published number; marked; indirect evidence from 4 sources; measurement plan.
- **Riot rules:** all suggestions are pre-game; only the player's own history; collector stays anonymous (the mastery bucket is flagged for a no-brokering check); nothing in game.
- **Statistics:** every number to be shown has a significance or n gate; correlation is not given to the player as a reason (experience and patch changes are mechanics; GD15 is a measured lane fact).
- **JSON:** both blocks are valid JSON, as new keys inside existing objects (`rating.personal`, `aggregation`).
- **Sources:** WebFetch summaries can be wrong. Its first summary of Do et al. invented a "57 % champions-only" row, and the PDF text was checked instead. League of Graphs, Lolalytics, Medium and ScienceDirect blocked fetching; their claims are marked as from snippets.

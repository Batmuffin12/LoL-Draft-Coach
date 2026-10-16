# Build recommendation, causal "win added", in-game win probability and power spikes in MOBAs

Source labels: **[full]** full paper or page read; **[abs]** abstract or landing page only; **[snip]** search-result snippet or summary only (page not opened); **[mkt]** vendor marketing or self-reported claim. Numbers are quoted as reported. Research date 2026-10-17.

## 1. Which methods exist for item/build recommendation in MOBAs (frequency and association rules, sequence models, context-aware models), and how were they evaluated?

### Takeaway
Every published MOBA item recommender I found learns to imitate what players bought, and some train only on what winners bought. That covers association rules, multi-label classifiers, a Transformer with team and enemy context, and RNN or Transformer next-purchase models. All are scored on purchase-prediction metrics. None measured win-rate lift or a causal effect, and the only user study had 16 participants. Two results matter most for us:
- **Current inventory and purchase order give the biggest accuracy gain.** Dota 2 Rec@3 goes from 0.29 (popularity) to 0.52 (last-item Markov) to 0.74 (GRU).
- **Enemy and role context adds about 1 point of precision** when the task is predicting purchases (TTIR ablation).

Commercial systems (Riot's shop, Dota Plus, LoLTheory) combine a "usually built next" step with an enemy-context step. None of them publishes an evaluation.

### Cited Findings
- **Association rules vs classifiers (LoL, RecSys 2019) [full].**
  - Data: 184,070 ranked EU and NA matches from Kaggle, reduced to *winning* matches of season 7. Each instance is a champion, its items, and the enemy champions.
  - Methods: Apriori and Eclat rules mined per champion, compared with a decision tree, logistic regression and an MLP.
  - Results at 6 items: Apriori P 0.40, R 0.62, F1 0.48, MAP 0.58. MLP P 0.44, R 0.69, F1 0.53, MAP 0.74, MRR 0.81. At 1 item, MLP precision is 0.71 vs 0.23 for Apriori.
  - Grouped by itemset size, the MLP reached 80% MAP@6, random ≈15%, and a champion-based Most Popular only ≈20%. The authors read this as items being "dependent on the current situation".
  - Source: [Araujo, Rios & Parra 2019 preprint](https://dparra.sitios.ing.uc.cl/pdfs/MOBArecsys2019-preprint.pdf)
- **TTIR, a Transformer with team and enemy context (LoL, RecSys 2020) [full].**
  - Model: encodes all 10 champions with role embeddings and outputs the 6 most probable items per player.
  - Training: "supervised only with the items selected by each champion of the winning team" so that "the likelihood of recommending the best items is maximised in order to win".
  - Data: 157,584 season-7 ranked matches (same Kaggle source), 136 champions, 89 completed items (basic, advanced and consumable items removed), 1,261,280 / 314,560 train/test instances.
  - Results (P@6 / R@6 / MAP@6):

    | Model | P@6 | R@6 | MAP@6 |
    |---|---|---|---|
    | TTIR | 0.492 | 0.756 | 0.805 |
    | CNN | 0.484 | 0.744 | 0.795 |
    | MLP | 0.476 | 0.732 | 0.785 |
    | Logistic | 0.393 | 0.607 | 0.714 |
    | Decision tree | 0.319 | 0.491 | 0.648 |

    P@1 is 0.803 for TTIR vs 0.790 for the CNN.
  - Ablation: removing enemy embeddings drops P@6 from 0.492 to 0.487; removing enemies and roles drops it to 0.479.
  - Source: [Villa, Araujo, Cattan & Parra 2020](https://arxiv.org/abs/2007.15236)
- **TTIR's preliminary user survey [full].**
  - 16 respondents: college LoL players recruited from Facebook groups.
  - Ratings out of 10: recommendation quality 7.98 ± 1.22; usefulness of the attention heat map as an explanation 6.9 ± 2.15. Newer players rated both higher.
  - Critical comments asked for "with which item I need to start and the sequence to progress", and for explanations covering grievous wounds, armor penetration and magic resist.
  - Source: [Villa et al. 2020](https://arxiv.org/abs/2007.15236)
- **Next-purchase sequence models (Dota 2) [full].**
  - Data: Dota-350k, 348,642 Ranked All Pick matches from a single day (16 Apr 2020, patch 7.25c). It has 3.49 M purchase sessions, 212 items, 119 heroes and a mean of about 43 purchases per session. The split is chronological, 94/1/5 by match.
  - Rec@3 (NDCG@3 where given):

    | Model | Rec@3 |
    |---|---|
    | Popularity | 0.294 (NDCG@3 0.219) |
    | First-order Markov | 0.520 |
    | Logistic regression (Looi et al.) | 0.579 |
    | MLP | 0.661 |
    | GRU | 0.736 (NDCG@3 0.631) |
    | NARM | 0.685 |
    | BERT4Rec | 0.648 |
    | SASRec | 0.412 |

    On a 39,921-match OpenDota set, GRU scores 0.783, LR 0.651 and SASRec 0.447.
  - The authors find "RNN-based models ... outperform the more recent Transformer-based architectures". Adding match context is left as future work.
  - Source: [Dallmann, Kohlmann, Zoller & Hotho 2022](https://arxiv.org/abs/2201.08724)
- **Looi et al. (Dota 2) [cited via reference list, not opened].** The logistic-regression baseline above is Looi, Dhaliwal, Alhajj & Rokne, "Recommender System for Items in Dota 2", IEEE Transactions on Games, doi 10.1109/TG.2018.2844121. — [Dallmann et al. 2022 PDF](https://arxiv.org/pdf/2201.08724)
- **HT4Rec [abs via snippet].**
  - A contextual encoder produces a character-item representation "contextualized by the other participants". A sequential encoder then predicts the next item.
  - Reported to beat well-known sequential recommenders on a Dota 2 dataset. I did not see the numbers.
  - Source: [HT4Rec abstract (DOI 10.1145/3511047.3537667)](https://unpaywall.org/10.1145%2F3511047.3537667)
- **OpenAI Five [snip of the paper].** Item purchases and ability builds were not learned:
  - consumables were restocked by rule;
  - other items and ability upgrades followed fixed schedules;
  - those schedules were randomly perturbed during training.
  - Source: [Berner et al. 2019](https://arxiv.org/abs/1912.06680)
- **Riot's in-client shop (2020 design) [full].**
  - The Recommended page uses "a full tree of what your champion could build based on high level player data" and ranks likely next purchases from what you already own.
  - A second step reads enemy stats in that game ("damage done, CC, healing, resistances, and many others") to mark "good against" items.
  - Riot "displays this info to you but you decide".
  - It started with hand-entered builds and then switched to "real player data".
  - Source: [Riot dev post, Sep 2020](https://www.leagueoflegends.com/en-us/news/dev/preseason-item-shop-update/)
- **Dota Plus Assistant [snip; press quoting Valve; mkt].**
  - Item builds are tailored to lane, teammates and opponents, with three build options per game.
  - It recalculates after you buy something off-plan.
  - Claimed basis: "data from millions of recent games at each skill bracket".
  - Sources: [esportstales](https://www.esportstales.com/dota-2/dota-plus-the-new-battle-pass-summary-of-main-features); [Lowyat](https://lowyat.net/2018/157463/valves-dota-plus-subscription-service-provides-game-stats-suggestions/autoload)
- **LoLTheory [mkt, full page].**
  - An overlay that "updates your item recommendations every time an enemy buys an item". It shows three suggestions with reason labels such as "Generally Good".
  - Claims its model "corrects for known biases in item win rate data": snowball items, defensive items and player experience.
  - No backtest, sample size or validation is published.
  - Source: [LoLTheory](https://blog.loltheory.gg/what-is-loltheory/)
- **iTero [mkt].**
  - Its drafting coach recommends champions, bans, runes and items.
  - Claims draft-only prediction where betting companies average about 62% and its founder about 67%.
  - Sources: [iTero](https://www.itero.gg/articles/how-can-ai-help-me-improve-at-gaming); [iTero × Overwolf](https://itero.gg/articles/overwolf)

### Inferences
- **Imitation is not effect.** Training on winners' items (Araujo, TTIR) mixes an item's value with simply being ahead: winners finish more items and buy snowball items. Published metrics therefore cannot support a "win added" claim. Our win-added ranking aims higher than anything published. Our backtest result (top-1 46.9% vs most-bought 49.2%) is in effect an imitation metric.
- **These numbers don't conflict with ours.** Araujo's Most Popular scoring ≈20% MAP@6 and Dallmann's popularity scoring 0.29 Rec@3 seem to contradict our "#1 ≈ most bought". They answer different tasks: predicting a whole situational item set, or the exact next purchase in sequence. Our backtest asks for the top completed item for a champion and slot, where popularity is strong.
- **Offline metric for in-game advice.** For "one item + two alternatives", the comparable metric is Rec@3 of the next completed item. On Dota 2, imitation reached about 0.74 (GRU) while popularity alone reached 0.29. The candidate step must therefore condition on current inventory and minute, as Riot's tree approach does.
- **Test situational value where it applies.** Enemy context barely changes average purchase prediction (TTIR loses only 0.5–1.3 points of P@6 without it). Test situational advice on the subset of games where the visible enemy team is extreme (heavy healing, mostly physical damage, many tanks), not on all games.
- **The survey comments match our layout.** Users asked for start items, order and the reason. Our build layout covers all three. The reason should be built from enemy facts the player can see.

### Gaps
- I found no item recommender evaluated by win-rate lift, an A/B test or player outcomes. TTIR's N=16 survey is the only user evidence.
- I found no Honor of Kings item-recommendation paper; searches returned only build guides.
- Riot's current shop algorithm and Dota Plus's method are unpublished.
- HT4Rec's numbers and venue are not verified.
- I found no LoL next-item sequence model trained on Riot API timelines.

## 2. How can the causal "win added" of an item, rune or spell choice be estimated from observational games?

Covers confounding by game state, skill and game length, the methods that address it, and sports-analytics analogues.

### Takeaway
"Actual result minus expected win at the moment of purchase" is the MOBA counterpart of three sports metrics: WPA in baseball, VAEP and EPV in soccer and basketball, and Q-value metrics in hockey. Measuring at the purchase time already removes the worst survivorship error, that late items exist only in long games.

It is still confounded by why the item was chosen:
- snowball items are bought when ahead;
- defensive items are bought when an enemy is fed;
- experienced players choose better items and also win more.

The established tools are:
- target-trial emulation, with time zero at the purchase decision;
- active-comparator contrasts: A vs B in the same slot and state;
- propensity or doubly-robust weighting, with overlap checks;
- confidence intervals clustered by game.

Sports work shows those intervals are much wider than practitioners assume.

### Cited Findings
- **WPA [snip].** WPA is the change in win expectancy from the start to the end of a play, so it depends on context. FanGraphs calls it descriptive and weak for prediction. Leverage indices (pLI, gmLI) and WPA/LI give context-neutral versions. — [FanGraphs](https://blogs.fangraphs.com/get-to-know-wpa/)
- **VAEP [abs/snip].** Values each on-ball action by how it changes the probabilities of scoring and of conceding. It uses CatBoost classifiers on 11,565 games and does not capture off-ball work. — [Decroos et al., KDD 2019](https://arxiv.org/abs/1802.07127)
- **EPV [abs].** Real-time expected points of a basketball possession, from a multiresolution stochastic process. Its transition models are hierarchical and "pool information across players". — [Cervone et al., JASA 2016](https://arxiv.org/abs/1408.0777)
- **Q-function valuation [abs].** Deep RL on about 3 M NHL events learns action values. The Goal Impact Metric sums a player's action Q-values; it is stable over a season and correlates with success and salary. — [Liu & Schulte, IJCAI 2018](https://arxiv.org/abs/1805.11088)
- **nflfastR [snip].** Its WP model is a raw XGBoost model. — [fastrmodels manual](https://brieger.esalq.usp.br/CRAN/web/packages/fastrmodels/refman/fastrmodels.html)
- **WP models are noisy because all plays in a game share one outcome [full].**
  - Setup: a simulated football game with known true WP.
  - Effective sample size:
    - 4,101 games (~16 seasons, 56 plays per game) had an ESS of 2,291 (56%);
    - 2,050 games gave 645 (31%);
    - 8,202 games gave 6,911 (84%).

    In the authors' words, "we have half as much data as we think".
  - Coverage of nominal 90% intervals: the standard bootstrap covered 60% (mean width 2.7 WP points), the cluster bootstrap 71% (3.6), and the randomized cluster bootstrap 76% (4.2). Reaching 90% coverage needed a width of 6.3.
  - Advice: keep all plays, but resample by game.
  - Quotes: "The point estimates alone may not be trustworthy"; "It may be disastrous to make decisions at the game-states for which intervals never cover."
  - Source: [Brill, Yurko & Wyner, JQAS 2025](https://arxiv.org/abs/2406.16171)
- **Decisions from WP models [abs/snip].** Bootstrapped uncertainty in the "optimal" fourth-down call "is far greater than that currently expressed". The authors recommend an option only when the model is confident it beats every alternative, and they find far fewer obvious decisions. — [Brill, Yurko & Wyner, The American Statistician 2025](https://arxiv.org/abs/2311.03490)
- **Target-trial emulation [abs/snip].** Time zero should be the moment eligibility is met and a strategy is assigned. Misalignment produces immortal time bias and other "self-inflicted injuries". — [Hernán et al., J Clin Epi 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5124536/)
- **Remedies for immortal time [snip; secondary sources].**
  - a sequence of emulated trials, each with its own time zero;
  - exposure modelled as time-varying;
  - landmark analysis, which classifies exposure at a landmark and drops earlier events (the results depend on the landmark chosen);
  - clone-censor-weight, which has caveats.
  - Sources: [MetricGate](https://metricgate.com/docs/immortal-time-bias-correction/); [lecture slides, Univ. Milano-Bicocca](https://www.dismeq.unimib.it/sites/st03/files/Allegati/2026-06/Immortal%20person-time%20bias.pdf)
- **Active comparator, new-user design [abs].** Compare people who start a treatment with people who start a clinically relevant alternative. This emulates a head-to-head trial and reduces confounding by indication. — [Lund, Richardson & Stürmer 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4778958/)
- **Causal work on Dota 2 data exists only as student theses [snip].**
  - a g-formula estimate of the effect of picking Pudge: about −0.28 pp;
  - a front-door adjustment using the enemy's Hurricane Pike as mediator, which the author judged not valid;
  - IPW for team diversity, which came out close to the unadjusted result.
  - Sources: [TU Delft repository](https://repository.tudelft.nl/file/File_5ce00e7a-5c05-4bd0-852c-60c2b37095d4); [TU Delft repository](https://repository.tudelft.nl/file/File_9c7753e0-0460-4cc2-90ab-c4203ef559b1). I did not verify which file holds which claim.
- **Practitioners describe selection in item win rates [snip; opinions].**
  - High-win items tend to be low-pick snowball buys. — [RankedBoost](https://rankedboost.com/league-of-legends/best-items-tier-list)
  - Hubris's win rate is inflated because players buy it while already snowballing. — [Reddit comment](https://lr.psf.lt/r/Rengarmains/comments/1ka9hmc/phreak_on_rengar_259/mpmtn3b/?context=3)
  - End-of-game inventory stats are "highly misleading": holding an early item at the end signals doing poorly. — [UBC course project](https://www.cs.ubc.ca/~tmm/courses/547-14/projects/ben-giovanni/proposal.pdf)
- **Player experience as a confounder [mkt, full page].** In patch 13.1, Gragas junglers averaged 14.6 games on the champion vs 47.3 for Shaco. With Shaco's experience distribution, Gragas's win rate would be 1.6 pp higher. — [LoLTheory](https://blog.loltheory.gg/personalized-and-fixed-recommendations/)
- **A concrete "late-only" bias [full].** Lolalytics measures Skill Order at level 15, so its win rates run higher: it is "measured much later in games with a higher proportion of the winning side having higher levels". Skill Priority, measured at level 10, has more games and lower win rates. — [Lolalytics](https://lolalytics.com/lol/ezreal/vs/leblanc/build/)

### Inferences
- **Our metric is a two-variable landmark WP model.** The expected-win table (minute × team gold difference) means win added = effect + leftover confounding + noise. The largest confounders missing from the table:
  - own lane state: gold and level against the lane opponent. Team gold can hide a fed enemy laner.
  - enemy composition: defensive and anti-heal buys are prompted by the threat itself, so they look bad;
  - player experience and skill;
  - recall timing;
  - patch.
- **A ladder of estimators, cheapest first:**
  1. **Active comparator in the same slot and state.** For the k-th completed item on a champion (or champion class), compare A vs B, matched on minute bucket and state. The outcome is Y − WP(state), with a bootstrap confidence interval clustered by game.
  2. **Overlap or propensity weighting.** Model P(A vs B | state, visible enemy facts, band, champion). Drop states where one option is never chosen, since they can't be compared. Overlap weights target exactly the states where the advice is a real choice.
  3. **Doubly robust (AIPW) with cross-fitting.** It needs only the outcome model or the propensity model to be correct.
  4. **Sequential trial emulation for timing questions** ("finish now vs later"): one trial per minute, with players who have not yet bought as controls.
  5. **The decision rule from Brill et al.** Show a non-default item as better only when its lower bound beats the most-bought item. Otherwise show the most-bought item and label the alternatives "situational". This also explains why our #1 ≈ most bought: the revealed preference of thousands of players is a strong prior.
- **A lower-variance second outcome.** Also measure ΔWP over the next few minutes, in the VAEP or Q-value style; the final result absorbs many later events. A short horizon undervalues scaling items, so report both.
- **Placebos.** Our game-phase placebo generalises to:
  - fake purchase times;
  - the enemy laner's purchase;
  - the WP trend before the purchase, which should be flat after matching.

### Gaps
- I found no peer-reviewed causal estimate (propensity, doubly robust or target trial) of item, rune or spell effects in LoL or Dota, only student theses.
- LoLTheory's correction method is unpublished.
- I found no esports paper that names immortal-time or survivorship bias for late items. Lolalytics's skill-order note is the closest.

## 3. Which in-game win-probability models for LoL use only scoreboard-visible data, how accurate are they by minute, and how do we value buying item A vs B?

### Takeaway
- **The Riot/AWS broadcast WP** is XGBoost trained on all pro games since patch 10.4. It uses game time, gold share, team XP, players alive, towers, dragons and soul, objective and buff timers, and side. No accuracy is published, and it does not model team composition or scaling.
- **Academic models** reach AUC 0.71, 0.82 and 0.87 at 10, 15 and 20 minutes (Challenger LoL), and about 78–79% accuracy at 10 minutes in Honor of Kings. In HoK, "the team with more gold wins" alone scores 78.4% at 10 minutes.
- **Live Client coverage.** The Live Client Data API exposes nearly every broadcast feature except gold, and gold can be approximated from every player's visible items.
- **Feasibility.** A scoreboard-only WP model is feasible if it is trained on the same visible features rebuilt from timelines.

### Cited Findings
- **Live Client Data API (local, `https://127.0.0.1:2999/liveclientdata/`) [full].**
  - `activeplayer`: `abilities`, `championStats`, `currentGold`, `fullRunes`, `level`. Gold is given only for the local player.
  - `playerlist`, per player: `championName`, `isBot`, `isDead`, `items`, `level`, `position`, `respawnTimer`, `runes`, `scores`, `skinID`, `summonerName`, `riotId`, `summonerSpells`, `team`.
  - `playerscores`: `kills`, `deaths`, `assists`, `creepScore`, `wardScore`.
  - `playeritems`: `itemID`, `price`, `count`, `slot`, `canUse`, `consumable`, `displayName` and more.
  - `playermainrunes`: keystone, primary and secondary tree, for any player.
  - `gamestats`: `gameTime`, `gameMode`, `mapName`, `mapNumber`, `mapTerrain`.
  - The page gives no polling-rate guidance.
  - Policy quotes: "Products must not use or incorporate information not present in the game client"; "Products cannot identify or analyze players who are deliberately hidden by the game."
  - Source: [Riot developer docs](https://developer.riotgames.com/docs/lol)
- **Live Client events [full].**
  - Riot's sample lists: `GameStart`, `MinionsSpawning`, `FirstBrick`, `TurretKilled`, `InhibKilled`, `DragonKill` (`DragonType`, `Stolen`), `HeraldKill`, `BaronKill`, `ChampionKill` (`VictimName`, `KillerName`, `Assisters`), `Multikill`, `Ace`.
  - Every event has `EventID` and `EventTime`.
  - Source: [Riot sample events](https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json)
- **Riot/AWS Win Probability [full].**
  - Definition: "how often teams won given a similar situation previously".
  - Model: XGBoost, "trained using all professional LoL Esports games since patch 10.4", and retrained as new results come in.
  - Features: game time, gold percentage, total team XP, players alive, tower kills, dragon kills including soul, Herald, inhibitor, Baron and Elder timers, the number of players with the Baron or Elder buff, and side.
  - Limits: "WP models aren't meant to predict which team will win at any given point in time". Team composition strength and scaling are listed as future additions.
  - It was tested at MSI 2023 under the name "Win Expectancy".
  - Source: [LoL Esports dev diary](https://lolesports.com/en-US/news/dev-diary-win-probability-powered-by-aws-at-worlds)
- **AWS's account [full; partly mkt].**
  - Uses "a dozen gameplay data points", including per-player and team gold percentage and downtime waiting to respawn.
  - Makes a new prediction every second.
  - Runs on SageMaker with online and offline feature stores and patch-aware data selection.
  - No accuracy is published. A viewer survey after MSI 2023 found 63% recalled the stat, 94% found it useful and about 80% liked or loved it.
  - Source: [AWS for Games blog](https://aws.amazon.com/blogs/gametech/riot-games-and-aws-bring-esports-win-probability-stat-to-2023-league-of-legends-world-championships-broadcasts)
- **Challenger LoL with minute-level causal features (SBGames 2026) [full].**
  - Riot API match and timeline data are rebuilt as minute states "using only information observable up to each minute".
  - Features: composition; gold, XP, combat, farming and vision; objectives; structures; itemization; lane pressure.
  - Evaluation: 450 test matches, using "risk sets" (only matches still running at that minute).
  - Results:

    | Minute | Matches | AUC | Accuracy | Brier |
    |---|---|---|---|---|
    | 10 | 450 | 0.710 | 0.651 | 0.218 |
    | 15 | 450 | 0.821 | 0.744 | 0.173 |
    | 20 | 426 | 0.872 | 0.784 | 0.149 |
    | 25 | 372 | 0.886 | 0.812 | 0.136 |

    ECE was 0.035–0.074, after temperature scaling. Event forecasting over the next 1 to 5 minutes improved weighted F1 from 0.536 to 0.678.
  - Source: [da Silva & Lopes, SBGames 2026](https://sol.sbc.org.br/index.php/sbgames/article/view/45416)
- **Elapsed-fraction framing.** The same paper notes that earlier LoL work predicts "after a fixed fraction of the match has passed", while live use needs absolute minutes [full]. — [da Silva & Lopes 2026](https://sol.sbc.org.br/index.php/sbgames/article/view/45416)
  - That earlier work: LightGBM averaged 81.62% accuracy at 60–80% of elapsed time; logistic regression and gradient boosting did better early in the game [abs]. — [Junior & Campelo 2023](https://arxiv.org/abs/2309.02449)
- **RNN on competitive LoL matches [snip via secondary sources].** Silva, Pappa & Chaimowicz (SBGames 2018) report 63.91% accuracy in the earliest window, rising to 83.54% in the 20–25 minute window. — [Junior & Campelo 2023](https://arxiv.org/abs/2309.02449); [Bahrololloomi et al. 2022](https://www.scitepress.org/Papers/2022/108959/108959.pdf)
- **Honor of Kings [full HTML].**
  - Data: 184,362 games from the top 1% of players, giving 5.25 M frames at one every 30 s. The test set is 10,000 games.
  - Features: team gold difference, kill difference, tower differences, neutral-objective differences, minion positions and hero IDs.
  - Accuracy (%) by minute:

    | Model | 5 min | 10 min | 15 min | 20+ min |
    |---|---|---|---|---|
    | "More gold wins" heuristic | 69.2 | 78.4 | 73.0 | 63.0 |
    | Fully connected | 69.3 | 79.3 | 75.0 | 70.0 |
    | LSTM | 69.4 | 78.4 | 76.3 | 66.5 |
    | Logistic regression | 63.8 | 78.2 | 70.5 | 56.6 |
    | TSSTN (interpretable) | 69.2 | 78.5 | 73.4 | 67.8 |

  - TSSTN's per-feature contribution is a learned time-dependent weight × a per-group win score.
  - Source: [Yang et al.](https://arxiv.org/abs/2008.06313)
- **Dota 2 pro live prediction [abs].** Accuracy reaches "up to 85%" after five minutes. Models trained on mixed-rank public games predict pro games with slightly lower accuracy. — [Hodge et al., IEEE ToG](https://eprints.whiterose.ac.uk/152931/); [mixed-rank preprint](https://arxiv.org/abs/1711.06498)
- **WP-weighted kills [abs/snip].** "Smart kills" and "worthless deaths" re-weight kills and deaths by whether the team benefited. They were tested on hundreds of thousands of amateur games. — [Maymin, NESSIS 2017](https://www.nessis.org/nessis17/Maymin.pdf)

### Inferences
- **Feature parity with the broadcast model.** Everything it uses except gold is available in the Live Client API, though some only as proxies:
  - XP appears only as `level`;
  - players alive come from `isDead` and `respawnTimer`;
  - towers, inhibitors, dragons, soul, Herald and Baron come from events;
  - buff timers come from event times plus durations from game data (config or CommunityDragon, never hardcoded).
- **Gold proxy.** Estimate each player's gold as inventory value (Data Dragon item cost × count, keyed by `itemID`). Add the local player's `currentGold`. Whether `price` means the full cost or the combine cost is unverified. Enemies' unspent gold is unknown, up to roughly one recall's worth.
- **Train on what the client shows.** Rebuild our timelines in that visible form: inventory value from item events, not `totalGold`. Then training and serving match. Use absolute minutes, calibrate per minute, and evaluate on risk sets.
- **Expected accuracy.** Gold–Plat games should be noisier than Challenger or pro games: plan for AUC around 0.7 at 10 minutes and around 0.8 by 15–20 minutes. HoK's accuracy falls after 10 minutes because the games still running are the balanced ones. Per-minute calibration therefore matters, and late expected-win cells sit near 50%, so their residuals are mostly noise.
- **Valuing item A vs B, three routes:**
  1. Plug A and B into a WP model with item features (an S-learner). This is confounded and extrapolates.
  2. A Q-style model of WP a few minutes ahead, given the state and the purchase.
  3. The causal contrast from section 2, added to the current WP.

  Show a number only when its interval excludes zero (Brill). Otherwise show "the usual next item" with a context reason. An item's effect in WP points scales with leverage, which is high in close games and low in decided ones, so a relative effect may display more stably than raw WP points.
- **Draft prior.** The broadcast model ignores composition and scaling. Our engine v2 draft rating can enter as a prior whose weight decays over the game.

### Gaps
- I found no published LoL WP model restricted to Live-Client-visible data (no exact gold).
- No accuracy or calibration has been published for the Riot/AWS model, and I found no LCK-specific model documentation.
- I found no accuracy-by-minute curves for Gold–Plat solo queue.
- Not verified: what `price` means in `playeritems`, and whether the in-game scoreboard shows any gold difference.

## 4. How are runes, summoner spells and skill orders recommended and evaluated?

### Takeaway
I found no academic work on recommending runes, summoner spells or skill orders. In practice, tools publish per-champion, per-role frequency and win-rate tables refreshed each patch:
- Riot's Rune Recommender offers up to three sets and optional spells;
- third-party sites label options "Most Popular" vs "Highest WR".

The known failure modes:
- "Highest WR" options often rest on small samples;
- skill-order win rates measured at high levels are biased toward winners.

Bots and assistants script skill orders (OpenAI Five) or suggest them from bracket data (Dota Plus).

### Cited Findings
- **Riot's Rune Recommender [snip of wiki].**
  - Offers up to three sets per champion and role, refreshed each patch from current data.
  - Can optionally suggest summoner spell loadouts; the toggle persists across lobbies.
  - Assigns the recommended page automatically if the player has no valid page.
  - Source: [League of Legends Wiki](https://wiki.leagueoflegends.com/en-us/Rune)
- **Lolalytics [full].**
  - Rune stats are quoted for the primary keystone.
  - "Skill Priority is measured at level 10": larger sample, lower win rates.
  - "Skill Order is measured at level 15": smaller sample, higher win rates, because winners reach higher levels.
  - The two "may not match in cases where multiple Skill Orders are viable".
  - Source: [Lolalytics](https://lolalytics.com/lol/ezreal/vs/leblanc/build/)
- **Mobalytics labels [snip].** For Urgot top, Press the Attack with Black Cleaver is labelled "Most Popular" at 53.7% WR, and Conqueror with Black Cleaver is labelled "Highest WR" at 58.3%. — [Mobalytics](https://mobalytics.gg/lol/champions/urgot/build/top)
- **u.gg [snip].** Pages present "the highest win rate" build, and one Urgot jungle snapshot showed 58.73% WR on 63 matches. — [u.gg](https://u.gg/lol/champions/Urgot/build/jungle)
- **A Riot designer on sample sizes [full].** Third-party sites are good for relative balance in Plat+ but "a lot worse at determining exact winrate/power levels". Example: Ivern at 59% in Master+ on only 120 games. — [Riot August via devtrackers](https://devtrackers.gg/leagueoflegends/p/8fc2d1be-riot-august-u-gg-data-is-garbage)
- **OpenAI Five [snip].** Ability upgrades followed a fixed schedule, randomized during training. — [Berner et al. 2019](https://arxiv.org/abs/1912.06680)
- **Dota Plus [snip; mkt].** Also suggests ability builds from bracket data. — [esportstales](https://www.esportstales.com/dota-2/dota-plus-the-new-battle-pass-summary-of-main-features)
- **iTero [mkt].** Claims to recommend runes and items. — [iTero](https://www.itero.gg/articles/how-can-ai-help-me-improve-at-gaming)
- **Academic searches [snip].** Two searches found only champion-recommendation papers, such as SVD collaborative filtering ([arXiv 2006.10191](https://arxiv.org/pdf/2006.10191)) and an ICCS 2023 comparison finding that a player's own champion stats matter most ([ICCS 2023](https://www.iccs-meeting.org/archive/iccs2023/papers/140760152.pdf)). None covered runes, spells or skill order.

### Inferences
- **Runes and spells are pre-game choices**, so the main confounders are the matchup and the player's type. Our draft rating (engine v2) gives a natural minute-0 expected win: win added for a rune = Y − the draft-based expected win. Compare within the same matchup or lane opponent, shrink toward the most popular option, and highlight an alternative only when its interval excludes zero.
- **Measure skill order at an early, fixed point**: the order of the first three points and the first max by level 9, in games that reached that level. Do not use level-15 measurement (Lolalytics's own note shows its bias). Effects are probably tiny, so present the most common order with its frequency.
- **Summoner spells** have few options and strong role conventions (Flash plus a role spell), so cells are large. Matchup-specific swaps, such as Ignite vs Teleport, are good candidates for an active-comparator contrast.

### Gaps
- Riot's rune recommender scoring (win rate vs pick rate vs sample size) is unpublished.
- I found no ML papers or user studies on rune, spell or skill-order recommendation.
- No tool documents its "recommended" selection rule.

## 5. How can power spikes be measured, and what should we show if item-specific spikes can't be detected?

Covers event studies and difference-in-differences around item completion, time-matched comparisons, synthetic controls, level spikes and published measurements.

### Takeaway
Public "power spike" content is either qualitative (Mobalytics) or anecdotal (InvenGlobal). The only quantitative signals tools publish are game-length curves: win rate by game duration, or early (≤25 min) vs late (≥35 min). That is the same kind of curve we found stable. I found no published, validated measurement of item-specific spikes.

Event studies around item completion face four problems:
- completion timing is staggered and endogenous;
- effects differ between players, which biases standard event-study regressions;
- recalls create mechanical dips around the purchase;
- completing an item adds only a small step on top of components already bought.

Better designs compare players matched on time and state, against players who have not yet completed the item, with pre-trend checks. The honest product answer is to show game-phase curves, level and ultimate timing, and item timing against rank norms.

### Cited Findings
- **Definition [snip].** Mobalytics: "a point in time or a stage of progression whereby a champ has exceptional strength relative to other champs in a game". It lists five qualitative types, including item spikes, with examples from around patch 6.20. — [Mobalytics](https://mobalytics.gg/blog/5-types-league-of-legends-power-spikes-examples/)
- **Anecdotal case analysis [snip].** Ezreal's spike is Muramana plus Iceborn Gauntlet, around 25 minutes; Aphelios spikes at three items. The supporting records are small: Ezreal went 3–12 in the LCK and 25–16 in the LPL. — [InvenGlobal](https://www.invenglobal.com/articles/11475/is-200-years-too-much-for-ezreal-to-handle-a-look-into-ezreals-dreadful-performance-in-the-lck)
- **Game-length curves are what tools publish [snip].**
  - lolprofile.net "scaling": win rate by game length over the last 30 days of ranked games, recomputed during the day. — [lolprofile](https://lolprofile.net/es/scaling)
  - metabot.gg "falloff": early is ≤25 minutes and late is ≥35 minutes. On patch 26.19 its top fall-offs were Heimerdinger −10.7, Illaoi −8.0 and Ziggs −7.9. — [metabot.gg](https://metabot.gg/en/league/champions/falloff)
- **iTero [snip].** Searches found no power-spike or live win-probability feature. — [iTero](https://itero.gg)
- **Event studies with staggered timing [abs + docs].** When effects differ across adoption cohorts, the lead and lag coefficients of the standard fixed-effects event-study regression are contaminated by effects from other periods. The interaction-weighted estimator fixes this but still assumes parallel trends, and thin control groups inflate its variance. — [Sun & Abraham, J. Econometrics 2021](https://arxiv.org/abs/1804.05785); [diff-diff docs](https://diff-diff.readthedocs.io/en/latest/api/_autosummary/diff_diff.SunAbraham.html); [MetricGate](https://metricgate.com/docs/sun-abraham-estimator)
- **Time-matched designs [abs/snip].**
  - Set time zero when eligibility is met. — [Hernán et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5124536/)
  - Run a sequence of trials, each with its own time zero. — [MetricGate](https://metricgate.com/docs/immortal-time-bias-correction/)
- **Level-based measurement bias [full].** Win rates measured at higher levels over-represent winners. — [Lolalytics](https://lolalytics.com/lol/ezreal/vs/leblanc/build/)
- **A comparable null result [full].** Even on Challenger data, a "lock-in" detector (the moment a game becomes decided) "remained exploratory rather than a validated detector". — [da Silva & Lopes 2026](https://sol.sbc.org.br/index.php/sbgames/article/view/45416)

### Inferences
- **Likely reasons our item-spike measure fails split-half:**
  1. **Completion is a small step.** Components are bought earlier, so the jump at completion is only the final combine plus the passive.
  2. **Recalls create a mechanical pattern.** Completion happens at base, after a recall that costs farm and XP and before the walk back to lane. That gives a V-shape in lane gold difference, and lane opponents often recall at the same time.
  3. **Timing is endogenous.** Early completers were already ahead, so leads regress toward the mean afterwards. Effects also differ between early and late completers, which biases standard event studies (Sun & Abraham).
  4. **Gold lead is an indirect, slow proxy** for fighting strength.
  5. **Noise dominates.** A split-half r of 0.02–0.10 gives full-sample reliability of 0.04–0.18 (Spearman–Brown, 2r/(1+r)). Reaching 0.7 would take about 10–58× more data: roughly 0.6–3.6 M games with timelines, or 3 months to over a year at about 7k games a day. Item balance does not stay fixed that long.
  6. **Opponents' items** complete at similar times.

  The game-phase curve's r of 0.67 implies a full-sample reliability of about 0.80.
- **Better design if we retry: sequential trial emulation per minute.**
  - At minute t, take laners who did not have item k at t−1. Compare those who complete it at t with those who have not yet, matched on state and on the trend over t−3 to t−1.
  - Outcomes over t+1 to t+5: lane kills and deaths, solo kills, objective participation, ΔWP.
  - Pool items by class.
  - Keep the fake-time placebo and pre-trend checks.
  - Synthetic control is built for a few treated units with long pre-periods, so with thousands of short, noisy events, matched or weighted not-yet-treated comparisons are the practical substitute.
- **Level spikes.** Level-ups don't depend on a trip to base, which removes the recall problem. Use the same design: reached level 6 first vs not yet, with the ultimate's unlock levels taken from game data. Run the split-half test before showing anything.
- **What to show instead.** None of these are pushed notifications; all are shown only when the player looks.
  - the game-phase curve, which is reliable;
  - level and ultimate milestones as facts from game data;
  - the player's item timing against the norm for their rank (first-item timing already ships);
  - item count against the lane opponent's visible items, as a description only.

### Gaps
- Neither Mobalytics nor iTero (nor any other tool I found) publishes a measured spike method.
- I found no academic event study of item completion in MOBAs.
- Level-spike evidence is untested.
- I could not confirm whether League of Graphs shows win rate by game duration.

## 6. How many games does each method need, and how should estimates be pooled?

Covers games per champion-item or champion-rune combination, and pooling by item class, champion class or hierarchical models.

### Takeaway
- **Single win rate:** about 2,400 games for ±2 pp at 95% confidence.
- **Comparing two alternatives:** about 4,400 games per arm to detect 3 pp, or about 9,800 to detect 2 pp, at 80% power.
- **Residualizing helps:** subtracting a calibrated WP model's prediction cuts the games needed by roughly the Brier score divided by 0.25, a factor of 0.6–0.9 depending on the minute.
- **Within-game dependence hurts:** it lowers the effective sample size (Brill et al.: about 56% of games).
- **Consequence:** most per-champion item contrasts are underpowered at about 50k games per band.
- **Remedy:** partial pooling by item class × champion class (empirical Bayes or a hierarchical model), shrinking toward the most-bought item.

### Cited Findings
- **Effective sample size [full].** About 56% of the number of games at 4,101 games, 31% at 2,050 and 84% at 8,202. Intervals must be built by resampling games. — [Brill, Yurko & Wyner 2025](https://arxiv.org/abs/2406.16171)
- **Small samples shown as "real" [full].** Ivern at 59% on 120 Master+ games. — [Riot August](https://devtrackers.gg/leagueoflegends/p/8fc2d1be-riot-august-u-gg-data-is-garbage)
- **u.gg [snip].** A 58.73% WR on 63 matches. — [u.gg](https://u.gg/lol/champions/Urgot/build/jungle)
- **Mobalytics [snip].** The "Highest WR" option (58.3%) vs "Most Popular" (53.7%). — [Mobalytics](https://mobalytics.gg/lol/champions/urgot/build/top)
- **High tiers are thin even at large totals [full].** In op.gg data from 2016 covering about 15 M games in a month, champions averaged 321 games at Master and 94 at Challenger, and no error bars were shown. — [Nelson Minar](https://www.somebits.com/~nelson/lolwinrates.html)
- **Lolalytics coverage [full].** "Unlike other stat sites we include 100% of a brackets champions played". — [Lolalytics](https://lolalytics.com/lol/ezreal/vs/leblanc/build/)
- **Empirical Bayes shrinkage [snip].** A beta prior fitted on batters with ≥500 at-bats (α ≈ 96.9, β ≈ 275) pulls low-information estimates toward the mean. Because better hitters get more at-bats, the extension is beta-binomial regression with sample size as a covariate. — [Robinson, empirical Bayes](https://www.r-bloggers.com/2015/09/understanding-empirical-bayes-estimation-using-baseball-statistics/); [beta-binomial regression](https://www.r-bloggers.com/2016/05/understanding-beta-binomial-regression-using-baseball-statistics/)
- **Hierarchical pooling in sports value models [abs].** EPV's transition models are hierarchical and pool across players. — [Cervone et al. 2016](https://arxiv.org/abs/1408.0777)
- **Brier scores [full].** A Challenger WP model scored 0.218, 0.173 and 0.149 at 10, 15 and 20 minutes. These are used for the variance arithmetic below. — [da Silva & Lopes 2026](https://sol.sbc.org.br/index.php/sbgames/article/view/45416)

### Inferences
These are my own calculations, using the binomial variance p(1−p) ≈ 0.25.
- **One win rate.** The 95% half-width is 1.96 × 0.5 / √n:

  | Games (n) | 95% half-width |
  |---|---|
  | 100 | ±9.8 pp |
  | 400 | ±4.9 pp |
  | 1,000 | ±3.1 pp |
  | 2,500 | ±2.0 pp |
  | 10,000 | ±1.0 pp |

- **Two alternatives at 80% power, α = 0.05.** Games per arm ≈ 3.92 / Δ²:

  | Difference to detect (Δ) | Games per arm |
  |---|---|
  | 1 pp | 39,200 |
  | 2 pp | 9,800 |
  | 3 pp | 4,356 |
  | 5 pp | 1,568 |

- **Gain from residualizing.** For a calibrated model, the variance of the residual Y − WP equals its Brier score. Using the Brier values above, the games needed shrink by a factor of about 0.87 at 10 minutes, 0.69 at 15 and 0.60 at 20. Gold–Plat will gain less than Challenger.
- **What our data can detect.** Suppose a champion-role has about 2,000 games in the window and its second-choice item takes about 25% (500 games) against about 1,500 for the top item. The minimum detectable difference is about 2.8 × √(0.25/500 + 0.25/1,500) ≈ 7.2 pp raw, or about 5.6 pp residualized at a Brier score of 0.15. Only large item effects are detectable per champion. That fits "#1 ≈ most bought, small positive signal".
- **Pooling recipe:**
  - Level 0: an item's effect in slot k across all champions.
  - Level 1: item class × champion class. Classes come from Data Dragon item tags and stats and from champion tags, so nothing is hardcoded.
  - Level 2: champion × item deviations, shrunk by n / (n + K), where K = σ²_resid / τ² and τ² is the true between-champion variance, estimated as the variance of observed effects minus the mean sampling variance. Example: if τ = 2 pp and σ² = 0.15–0.25, then K ≈ 375–625 games. A champion-item with that many games keeps half of its own deviation.
  - Set the prior mean to 0 relative to the most-bought item.
  - Pool across patches with the existing half-life, and reset items whose stats changed in Data Dragon diffs.
  - Treat bands as deviations from a shared mean.
- **Runes and spells** follow the same arithmetic. Keystone splits are often lopsided, so the minority keystone's games set the limit.
- **Display thresholds.** Never show an unshrunk win rate below about 1,000 games. Label whether an estimate is shrunk or raw. Use the Brill-style decision rule from section 2 instead of a fixed games threshold.

### Gaps
- I found no MOBA paper fitting hierarchical or empirical-Bayes models to item or rune effects.
- No stats site publishes its minimum-sample or shrinkage rules.
- Gold–Plat-specific Brier or calibration curves for scoreboard-only WP models were not found, so the variance-reduction factors above come from Challenger data.

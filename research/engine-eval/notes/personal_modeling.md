# Modelling the personal part of a pick: player-champion skill, learning curves, off-role and tilt, from a few users plus anonymous population data

Evidence labels used below: **[FT]** = full text read (paper PDF/HTML or full page); **[AB]** = abstract, search snippet or a secondary summary only (treat numbers as unverified); **[CODE]** = this repository. **Within-player** = the same player's games compared over time. **Cross-sectional** = different players compared at different experience levels (subject to survivorship). The prior research already in hand (iTero 1M-game mastery curve, Riot 2020 new-champion blog, League of Graphs, LeagueMath difficulty, Do et al. 2021, DraftRec, the survivorship caveat, the proposed `personal = −P0·m·exp(−n/(τ0·m)) + shrunk skill` formula) is not repeated, except where a new source changes how to use it.

## 1. Methods for estimating player-specific skill on a specific character from few games, and how they model learning

### Takeaway
The best-documented industrial design is Microsoft's TrueSkill 2. It gives each player a base skill plus a correlated per-mode offset, and the authors propose the same for per-character skill in LoL and Dota. Learning enters as a learned, front-loaded "experience offset" added after every game (a non-parametric array capped at 200 games). Hyperparameters are learned from big data and borrowed from a similar population when data are small. For 5–10 users, the core is empirical-Bayes or hierarchical shrinkage with two requirements. First, the shrinkage strength k = p(1−p)/τ² must be estimated, not hand-set. Second, the prior mean must depend on experience n (Robinson's beta-binomial-regression lesson). A fixed k ≈ 5–10 toward the player's own average does neither.

### Cited Findings

**Microsoft: TrueSkill 2 (Minka, Cleven, Zaykov, MSR-TR-2018-8) [FT]**
- TrueSkill 2 adds player experience, squad membership, kill counts, tendency to quit and skill in other modes to TrueSkill. It "predicts historical match outcomes with 68% accuracy, compared to 52% accuracy for TrueSkill" (Halo 5). — [TrueSkill 2 paper (PDF)](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Experience evidence [within-player-ish, by matches played].** Halo 5 players with 0–8 previous matches won 45–46 % while classic TrueSkill expected 48–49 %. At 9 matches they won 47 % and at 10+ matches 49 %. "Players tend to increase in skill as they play the game, with the largest increases happening at the beginning." — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Learning model.** `skill_{t+L} ~ N(skill_t + experienceOffset(min(experience_t, 200)), γ²)`, where experience = matches played in the current mode before t, "capped at 200 to limit the number of parameters", and experienceOffset is "an array of 200 tunable parameters per game mode". "Each player receives a small increment to their skill rating after playing a match, regardless of the outcome". The increments are small relative to a win/loss update, so repeated losses still lower the rating. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- After the change, expected win rates for new players track the actual ones (for example 43–44 % expected vs 45–46 % actual at 0–3 matches). The model still slightly underestimates them "because many of the players considered 'new' in our test set are not actually new players". This is the left-censoring problem of experience counts. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Lapse.** Win rate falls with days since the last match: 49 % at 0–1 day, 43 % at 7–9 days, while TrueSkill expected about 48 %. Once the experience effect was added, "the correct trend with lapse emerged automatically" (TrueSkill 2 expected 48 % → 42 %), so no lapse term was needed. The model also has a per-time drift: skill changes "with the passage of time" between matches (their eq. 3, after Dangauthier et al. and Glickman). — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Per-mode skill.** Skill ratings in two Halo 5 modes correlate at 0.6. The model is `skill_{i,d} = w_d·base_i + offset_{i,d}`: base and offsets each drift per match and over time, and the offset receives the experienceOffset for that mode. "When a player starts a new mode, their skill rating from other modes is borrowed". Once many matches have been played in a mode, other modes barely move it. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Explicit per-character proposal for LoL/Dota.** "A player can be given a different skill rating with each character, and these can be correlated… If you beat someone who is playing a character for the first time, you should not get the same rating change as beating their best character." A single matchmaking rating is the average of the per-character ratings weighted by pick probability. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Other evidence terms.**
  - The previous match's kill rate predicts the next result beyond the rating: 43 % win rate at 0–0.4 kills/min vs 59 % at 3.6–4.0, against 48–50 % expected.
  - Quitters of the previous match won 44–46 % vs 47–49 % expected, so TrueSkill 2 updates a quit as a loss.
  - Squads: groups of 2–3 matched the additive assumption (50 % vs 50 %). Offsets were needed from squad size 4 (57 % vs 52 %).
  - — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Fitting.** Parameters are random variables with broad priors. EP runs for the skills and Rprop for point-estimated parameters, taking about 100 forward-backward sweeps. "This approximation breaks down for game modes with less than 1000 matches. For such modes, we used the parameters estimated from the most similar popular mode." Gears of War 4 updates skills online and, before each season, recomputes "all skills and model parameters… using batch inference (TrueSkill Through Time)". — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Related work cited inside TrueSkill 2.** Chen et al. [2016] "used a model where each player had a different (but unchanging) skill rating for each character". Glickman [2001] (Glicko-2) gives each player "an additional number describing their skill volatility, which could evolve over time". — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Deployment.** Gears of War 4, then Halo 5, Gears 5, Halo Infinite and Forza Motorsport (MSR page, via search) [AB]. — [MSR publication page](https://www.microsoft.com/en-us/research/publication/trueskill-2-improved-bayesian-skill-rating-system/)

**Player × champion terms in LoL: Chen, Sun, El-Nasr, Nguyen (Meaningful Play 2016; arXiv 2017) [FT]**
- **Data.**
  - LoL: 231,212 ranked NA 2015 matches crawled from 972 Challenger/Master seed players, covering 93,098 players and 129 champions.
  - Dota 2: 195,538 ranked matches, 117,874 players (anonymous players pooled into one "universal anonymous player") and 111 heroes.
  - — [arXiv 1702.06253](https://arxiv.org/pdf/1702.06253)
- **Model.** L2-regularised logistic regression on ±1 indicator features for players (P), champions (C) and player×champion pairs (PC). The regularisation strength C was grid-searched over 0.001–1000 with 10-fold CV. The player-champion skill is static: there is no learning term. — [arXiv 1702.06253](https://arxiv.org/pdf/1702.06253)
- **LoL test accuracy.** P 56.75 %, C 55.62 %, P+C 58.82 %, P+C+PC 60.24 %, so the player×champion terms add +1.42 pp and the gain is significant. TrueSkill, evaluated on a time-ordered 90/10 split, scored 55.24 %, and the majority class 53.22 %. In Dota 2, PC added only 0.13 pp (not significant). — [arXiv 1702.06253](https://arxiv.org/pdf/1702.06253)
- Veteran interviewees: "Even veteran players can master only a couple of champions. Therefore champion-specific skills should be accounted." — [arXiv 1702.06253](https://arxiv.org/pdf/1702.06253)

**Rating systems from 2021–2025 (no per-character learning)**
- **PandaSkill (PandaScore, 2025) [AB].**
  - A machine-learning model scores each player's in-game performance from their statistics, with each role modelled separately.
  - The scores feed OpenSkill in a free-for-all format, so ratings respond to individual performance rather than only to wins and losses.
  - A regional rating is paired with a meta-rating for each region's strength.
  - Applied to 5 years of pro LoL, it predicts outcomes better and agrees more with experts.
  - — [arXiv 2501.10049](https://arxiv.org/html/2501.10049v2)
- **Elo-MMR (Ebtekar & Liu, WWW 2021) [AB].** A Bayesian generalisation of Glicko to an unbounded number of players. It is robust to extreme performances and incentive-aligned, its accuracy "rivals or surpasses" existing systems, and it is up to an order of magnitude faster. The abstract mentions no per-character or experience component. — [arXiv 2101.00400](https://arxiv.org/pdf/2101.00400)

**Shrinkage with few trials: empirical Bayes and partial pooling**
- **Robinson's empirical Bayes.** The beta prior is fitted by maximum likelihood on batters with ≥ 500 at-bats, and the estimate is `(H + α0)/(AB + α0 + β0)`. A beta-binomial fit gave α ≈ 75, β ≈ 222 (≈ 297 pseudo-at-bats). "If we have very little evidence (4 hits out of 10) we move it a lot." [FT] — [Robinson, Understanding empirical Bayes estimation](https://www.r-bloggers.com/2015/10/understanding-empirical-bayes-estimation-using-baseball-statistics/)
- **Robinson's beta-binomial regression [FT].** "Better hitters get more at-bats", so a single prior overestimates low-AB batters. The fix is a prior mean that depends on AB, fitted with gamlss: μ = 0.1426 + 0.0153·log(AB), σ = exp(−6.2935) ≈ 0.00185. The fetch summary computes α0+β0 = 1/σ ≈ 540. With this fix the prior mean is "lower for batters with low AB and about the same for high-AB batters". In code: `ebbr::add_ebb_estimate(method = "gamlss", mu_predictors = ~ log10(AB))`. — [Robinson, Understanding beta binomial regression](https://www.r-bloggers.com/2016/05/understanding-beta-binomial-regression-using-baseball-statistics/)
- **Stan partial-pooling case study (Carpenter; Efron–Morris data: 18 players × 45 at-bats, rest of season held out).** Priors: φ ~ U(0,1), κ ~ Pareto(1, 1.5). The pooling strength κ (pseudo-trials) had posterior mean 110, median 64 and an 80 % interval of about (25, 211). Another part of the page says "roughly (25, 225)", probably from a different run. "The exact variance in the population is not well constrained by only 18 trials of size 45." [FT for the model sections; the held-out comparison section was not read] — [Stan case study: pool-binary-trials](https://mc-stan.org/learn-stan/case-studies/pool-binary-trials.html)
- **Variance decomposition.** var(observed) = var(true talent) + var(luck), with var(luck) ≈ p(1−p)/n for a binomial rate. The share to regress toward the mean is var(luck)/var(observed). Tango's team-level MLB version: "add 69 games of average performance" [AB]. — [FanGraphs: Randomness, Stabilization & Regression](https://blogs.fangraphs.com/randomness-stabilization-regression); [THT: Do teams improve by firing their managers?](https://tht.fangraphs.com/tht-live/do-teams-improve-by-firing-their-managers/)

**Shape of learning curves**
- **Heathcote, Brown & Mewhort (2000), "The power law repealed" [AB].**
  - 40 datasets, 7,910 learning series, 475 subjects, 24 experiments.
  - The exponential fit better than the power function "in all the unaveraged data sets".
  - Averaging across subjects biased the fit toward the power function.
  - They proposed APEX, an exponential with an extra "pre-experimental practice" parameter.
  - — [Wikipedia: Power law of practice](https://en.wikipedia.org/wiki/Power_law_of_practice); [Univ. of Newcastle repository record](https://ogma.newcastle.edu.au/vital/access/%20/manager/Repository/uon:2058)
- **Evans, Brown, Mewhort & Heathcote (2018), "Refining the Law of Practice" [AB].** This Bayesian reanalysis supported a delayed exponential law in "a clear majority of paradigms". Both laws assume a steadily decreasing rate of gain, and the authors note clear exceptions. — [UTas figshare](https://figshare.utas.edu.au/articles/journal_contribution/Refining_the_Law_of_Practice/22964183)

### Inferences

**Recommended model**
- TrueSkill 2 maps almost one to one onto our problem. Recommended structure, on the log-odds scale, for user u, champion c, role r and time-ordered game g:
  `logit P(win_g) = α_u + s_{band,c,r} + E(n_{u,c,g}; m_c) + δ_{u,c} + ρ_{u,r} [+ optional x_g·β]`. The terms:
  - α_u: user intercept.
  - s: champion-role strength in the user's band, already in engine v2 snapshots.
  - E: experience offset, a function of prior games on c, using the proposed exponential.
  - δ: persistent player-champion deviation, drawn from N(0, τ²).
  - ρ: role offset (see Q4).
  - x_g·β: optional extras (duo, lapse, session) that start shrunk to 0.
- This is TrueSkill 2's "base + correlated offset + experienceOffset" with LoL champions in place of Halo modes. The **personal term** shown for a candidate pick is `E(n) + E[δ | data] + ρ`.

**Shrinkage strength**
- **Estimate k from data.** On the probability scale near 50 %, k (pseudo-games of shrinkage) = 0.25/τ², where τ is the true spread of player-champion deviations *after* the experience curve is removed:

  | τ (pp) | 3 | 4 | 5 | 6 | 8 | 10 | 16 | 22 |
  |---|---|---|---|---|---|---|---|---|
  | k (games) | 278 | 156 | 100 | 69 | 39 | 25 | 10 | 5 |

  The current hand-set k ≈ 5–10 implies τ ≈ 16–22 pp, which is implausibly large for a residual skill difference. More likely, k ≈ 5–10 has been absorbing the experience effect. Once E(n) is in the model, expect k in the tens to low hundreds. Then a champion's own record carries half the weight only after about 40–100+ games, and the experience curve carries almost all the signal below about 20 games.
- **Estimating τ.** Take each user-champion cell's residual record (wins minus the summed model-expected wins, divided by n_i). Use method of moments, τ̂² = weighted mean(r_i² − p̄(1−p̄)/n_i) truncated at 0, or fit a logistic GLMM with a `(1 | user:champion)` random intercept. All users' cells are pooled: about 10 users × 20–60 champions ≈ 200–600 cells. Given the Stan case study (18 groups × 45 trials gave κ uncertain by about 8×), expect τ̂ to remain uncertain by roughly ±30–50 %. Use an informative prior on τ (for example half-normal centred around 4–6 pp) and refit as data grow.
- **Robinson's lesson applies twice over.** Players play more games on champions they are good at, and they improve as they play. So the prior mean for a champion with n games must be a function of n. The proposed −P0·m·exp(−n/(τ0·m)) term is exactly that function. Shrinking a 3-game champion toward the player's own average, as the current term does, overstates it.

**Curve shape and learning**
- **Exponential vs power.** Individual curves are exponential, and averaged curves look like power laws (Heathcote 2000). So the exponential per user-champion is the right shape. However, if P0 and τ0 are fitted to population or cross-sectional curves, the tail will come out too long: heterogeneity in τ0 across players and champions makes the average power-like. Letting τ0 scale with difficulty m, as the formula already does, absorbs part of this.
- **Transfer and prior experience.** APEX's "pre-experimental practice" parameter maps to transfer from similar champions (same class or role) and to pre-window games. Use an effective count `n_eff = n_window + n_pre + w·n_similar`. This mirrors TrueSkill 2's borrowing of base skill across modes.
- **Parametric vs non-parametric.** TrueSkill 2 learns a non-parametric curve (200 parameters per mode) because it has millions of matches. With 5–10 users only a 2–3-parameter curve (P0, τ0, perhaps a difficulty slope) is identifiable. Check the parametric curve against binned estimates (n = 0, 1–2, 3–5, 6–10, 11–20, 21–40, 41+) from pooled user data and from population buckets (Q6).

**Rust and other evidence**
- **Lapse ("rust").** TrueSkill 2 found that lapse effects were explained by experience plus time drift. Huang 2013 (Q2) found that a 30-day break is roughly 10 matches of lost skill, recovered in about 10 matches. A cheap implementation is to decay n_eff with days since the champion was last played. Only add this if a backtest shows it helps.
- **Performance-based evidence.** TrueSkill 2's kill-rate result and PandaSkill suggest that per-game performance carries more information per game than a win/loss bit. For the newest 30 games we have timelines, so z-scores of gold or CS difference at 15 minutes, normalised by the band's champion-role distribution from collector timelines, could be auxiliary evidence for δ_{u,c}. This is optional, and it carries a confounding risk from role and champion norms.

**Fitting and caveats**
- **Online plus batch.** Mirror Gears of War 4. In the app, update each δ online after every game with a Gaussian/logistic (Glicko-like) update: posterior precision += p(1−p), mean += s²·(y − p). Separately, batch-refit the hyperparameters (P0, τ0, τ, role offsets) offline on all users' time-ordered games and ship them in versioned config. This keeps `packages/engine` pure.
- **Chen et al.'s gain is probably optimistic.** Their logistic models used random 10-fold CV, so later games informed player-champion weights, while their TrueSkill baseline was time-ordered. Their +1.42 pp accuracy from player×champion terms at Challenger/Master is likely an optimistic upper bound, and it is in line with DraftRec's +1.9 pp.
- **Policy constraint on display.** Riot prohibits "MMR or ELO calculators" (Q5/Q6). Show the personal term as an adjustment to win chance or as advice, never as a per-champion rating or ladder-like number.

### Gaps
- No published Valve, EA or Activision work on per-character skill or learning curves was found. EA's EOMM concerns engagement and streaks (Q4).
- PandaSkill and Elo-MMR were read only at abstract level, so their exact accuracy figures are unverified.
- No published estimate of τ (the spread of player-champion skill after experience) for LoL at any rank was found. Chen et al. report only accuracy deltas.
- The held-out comparison section of the Stan case study (which pooling model wins on rest-of-season data) was not read.
- Glicko-2 was not read directly; it is described here only via TrueSkill 2's related-work section.

## 2. Within-player vs cross-sectional learning curves, and designs that remove survivorship and selection

### Takeaway
Within-player studies agree that improvement is front-loaded:
- Halo 5: 45 % → 49 % win rate over about 10 matches.
- New LoL accounts: performance "tapered off after approximately 100 matches".
- Halo Reach: the median player's skill rises steadily.

Almost every published design conditions on survival (≥ 40, 100 or 150 games), and dropout depends on outcomes: players take breaks after losses, and in Halo the players who improved actually played fewer total games. No public within-player, per-champion learning curve for LoL was found. The clean design for us is time-ordered "games on this champion before this one", with user and user-champion effects, using **all** games including champions the user abandoned.

### Cited Findings

**Halo Reach: Huang, Zimmermann, Nagappan, Harrison, Phillips (CHI 2013, Microsoft Research) [FT] [within-player]**
- **Data.** The release-week cohort of 3.2 million players, with every match over 7 months. Skill is the TrueSkill μ. Half of Team Slayer players played ≥ 40 matches and a quarter ≥ 95. — [Huang et al. 2013 (PDF)](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)
- **Play intensity.** Players at 4–8 games/week "seem to do best". Players at > 64/week gained the most skill over time. "Those who play more frequently per week tend to start as less skilled players, but improve more rapidly." — [Huang et al. 2013](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)
- **Breaks.** Skill change in the game before a break is negative: players "take breaks more often when they lose". "A 30 day break correlates with a skill drop of 10 matches of play", and 10 matches later skill returns to its pre-break value. A 60-day break does not cost twice a 30-day one. — [Huang et al. 2013](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)
- **Selection.** Skill trajectories were analysed for players with ≥ 100 games, over their first 100 games. The most common pattern was a slow steady increase and the second most common a slow decline. "Players who improved in the first 100 games actually ended up playing fewer total games." Skill change in the first 100 games predicts final skill; games per week predicts total games; and the explained variance "can only go half-way". — [Huang et al. 2013](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)

**Halo 5: TrueSkill 2 [FT] [by-experience bins, test set]**
- Win rate rises from 45 % (0 previous matches) to 49 % (10+), and "many… 'new'… are not actually new players". — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)

**League of Legends new accounts: Vardal et al. 2022, "Mind the gap" (PLoS ONE) [FT] [within-player, survival-conditioned]**
- **Data.** 482,415 new LoL accounts provided by Riot (2016 season); 162,417 kept with 100 ranked solo/duo matches each. Performance is gold per minute (GPM) and KDA. MMR was excluded as proprietary and mostly driven by outcome. — [PMC9565695](https://pmc.ncbi.nlm.nih.gov/articles/PMC9565695/)
- **Curve.** "A sharp initial climb with decelerating gains" that "tapered off after approximately 100 matches". No functional form was fitted. Dropping players with < 100 games removed about two-thirds of the data, and survivorship was not explicitly addressed. — [PMC9565695](https://pmc.ncbi.nlm.nih.gov/articles/PMC9565695/)
- **Spacing.** Spacing is the days between match 1 and match 95, and players were subsampled to similar initial GPM/KDA. At matches 96–100, the widest-spacing group had +6.91 GPM (95 % CI 3.74–10.07, d = 0.146) and +0.49 KDA (d = 0.265). Linear R² was only 0.005 and 0.003. The timing of long breaks had no significant effect (η² < 0.01). — [PMC9565695](https://pmc.ncbi.nlm.nih.gov/articles/PMC9565695/)

**League of Legends new accounts: Aung et al. 2018 (IEEE CIG; one co-author at Riot Games) [FT] [within-player, survival-conditioned]**
- **Data.** 413,341 new accounts in 2016, 313,184 after preprocessing, all with ≥ 150 ranked games and Riot's hidden MMR. Accounts with > 3,000 matches (shared or bot) and server migrants were excluded. — [White Rose eprint](https://eprints.whiterose.ac.uk/id/eprint/132541/)
- **Learning rate.** The learning rate (slope of MMR over the first 10 matches) predicts mean MMR over the last 10 matches with r² of 0.26–0.38 by server (0.345 overall). The random-walk null gives r² = 0.008. Predictive power rose "approximately linear[ly]… up to 40 games". Classifiers for the season's top 0.05 % reached ROC AUC 0.888 (logistic regression) and 0.878 (random forest). — [White Rose eprint](https://eprints.whiterose.ac.uk/id/eprint/132541/)

**League of Legends, long run: Sapienza et al. 2018 (R. Soc. Open Sci.) [FT] [within-player]**
- **Data.** 16,665 players with ≥ 10 matches; about 242k solo-queue matches, May 2014–Jan 2016. — [PMC6030337](https://pmc.ncbi.nlm.nih.gov/articles/PMC6030337/)
- **Finding.** Team win fraction shows no long-term improvement with experience (ρ = 0.02), and KDA reverts to a mean of about 2.7. — [PMC6030337](https://pmc.ncbi.nlm.nih.gov/articles/PMC6030337/)

**Chess: Vaci et al. 2019 (PNAS) [AB] [within-player longitudinal]**
- Over whole careers, intelligence and practice both affect skill acquisition, and "more intelligent individuals benefited more from practice" (a non-linear interaction). — [Northumbria research portal](https://researchportal.northumbria.ac.uk/en/publications/the-joint-influence-of-intelligence-and-practice-on-skill-develop/)
- ChessBase reports n = 90 Austrian players and criticises possible sampling bias. — [ChessBase](https://en.chessbase.com/newsroom/post/do-chess-players-and-scientists-need-intelligence)

**Riot: per-champion "mastery curves" [AB] [champion-level; method not disclosed in what was read]**
- Riot projects a new champion's mastery curve (win-rate gain over games played) to set balance targets, so that it doesn't judge champions on learning-phase results. — [Riot /dev: Balancing new champions](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/)

**Shape:** see Heathcote 2000 in Q1. Averaged curves look like power laws; individual curves are exponential.

### Inferences
- **Four selection mechanisms bias any naive curve.**
  1. Between-player selection (cross-sectional): better players accumulate more games on a champion.
  2. Within-player champion selection: users drop champions after early losses. Huang's "breaks after losses" is the session-level analogue.
  3. Survival conditioning: "champions with ≥ N games" conditions on the future trajectory.
  4. Left-censoring: games before the 1,000-game window are invisible, which is TrueSkill 2's "not actually new".

  The owner's 41–45 % (< 20 games) vs 57 % (≥ 20 games) gap mixes all four with real learning, so it is an upper bound on within-player learning.
- **Recommended design on our users' data.**
  - For every game g, compute `n_before(u, c, g)` = window games on c before g + `n_pre(u, c)` (estimated from mastery, Q3).
  - Fit a logistic mixed model on **all** games (abandoned champions included), with E(n) fixed effects and `(1 | user:champion)` random intercepts.
  - If abandonment depends only on observed past results (missing at random), likelihood-based mixed models stay valid. This rests on standard missing-data theory, not on a source read here. Conditioning on "champions that reached N games" does not stay valid.
- **Diagnostics worth running.**
  - Among champions that reached ≥ 20 games, compare the win rate in games 1–10 with games 11–20. This is a survival-conditioned within-champion gain, so read it as an upper bound.
  - The win rate on champions abandoned before 10 games shows the selection effect.
  - A shuffle or random-walk null (Aung) of each user's game order checks that slope estimates aren't artefacts.
- **Account-level new-player curves aren't the right prior.** Vardal and Aung measure whole-game learning by brand-new accounts, which flattens around 100 games. Our users are experienced, so the relevant effect is champion-specific learning on top of a stable general skill. Expect a smaller and faster curve than new-account curves. Riot's "+4 % over ~15 games even on easy champions" from the prior research is the better prior.
- **Prior settings from cross-sectional curves.** Use cross-sectional curves (iTero, League of Graphs, Blitz, Q6 population buckets) for the *ceiling and shape* prior, and the users' within-player data for the *slope*. Center the P0 prior at the lower (within-player) end of the population estimates, since cross-sectional gaps include selection.

### Gaps
- No public within-player, per-champion learning curve for LoL (or per-hero for Dota 2 or Overwatch) was found. Riot's champion mastery curves are cited, but their method was not visible in what was read.
- Stafford & Dewar 2014 (Axon, about 850k players) and Landfried et al. 2019 (TrueSkill Through Time learning curves) were not read.
- No study applying player fixed effects to champion experience in any MOBA was found.

## 3. League-specific evidence 2023–2026: mastery, experience win rates, the 2024 mastery rework, difficulty

### Takeaway
Since patch 14.10 (15 May 2024), mastery points still mean "experience": more points for higher grades and wins. Levels are now uncapped, and progress is gated by Marks of Mastery earned from per-split grade milestones. Old points were kept. So Champion-Mastery-V4 `championPoints` is a cumulative, all-modes, grade- and win-weighted experience proxy. It is good for population buckets and for estimating a user's pre-window games, but it is not a game count. The old ~600 points/game conversion no longer holds. Riot itself now uses the end-of-game mastery **grade** as a performance bar (Aegis of Valor, 2026). New cross-sectional per-champion experience tables exist (Blitz.gg, patch 26.11), with the usual survivorship caveat.

### Cited Findings
- **Riot /dev, "Updating champion mastery" (5 Jan 2024, Riot Revenancer) [FT].**
  - Mastery score represents experience, with "more awarded for higher grades".
  - "We are uncapping mastery levels."
  - Marks of Mastery required: none for levels 1–4, 1 per level for 5–9, 2 per level for 10+.
  - Per-champion milestones each split: M1 = 1 B + 4 grades ≥ D−; M2 = 1 A + 4; M3 and M4 = 1 S + 4 each; then a repeating 3 S + 7.
  - "We won't be resetting progress"; large existing scores get bonus Marks.
  - Mastery is "the way many players express skill growth, especially for those who don't play Ranked".
  - — [Riot /dev: Updating champion mastery](https://www.leagueoflegends.com/en-us/news/dev/dev-updating-champion-mastery/)
- **Masterychart (fan site) [FT].**
  - Launched in patch 14.10, 15 May 2024.
  - Points depend on "personal stats, team performance, game duration, and whether you win or lose".
  - Premade bonus: +2 % (duo), +4 %, +6 %, +10 % (five).
  - Per-level points: 1,800 / 4,200 / 6,600 / 9,000 (+1 Mark) / 10,000 (+1) / 11,000 (+1, levels 7–9) / 11,000 (+2, level 10+).
  - The old score was converted to the new system.
  - — [Masterychart: Champion mastery rework](https://masterychart.com/blog/champion-mastery-rework/)
- **Mobalytics [AB].** The rework moves "away from ally-dependent point gains" toward comparing your performance against your allies, and losses reward more than before if you play well. — [Mobalytics](https://mobalytics.gg/?p=74433)
- **Pre-rework conversion (patch 13.7) [AB].** About 100–300 points per loss and 900–1,100 per win, averaging about 600 per game (community estimate). — [iTero mastery summary](https://www.itero.gg/articles/mastery-a-statistical-summary)
- **Riot /dev, "Ranked 2026" (1 Dec 2025) [FT].** Aegis of Valor gives double LP or no LP loss on an autofilled game "if you get a mastery score of C or higher". — [Riot /dev: Ranked 2026](https://www.leagueoflegends.com/en-us/news/dev/dev-ranked-2026)
- **Blitz.gg [AB; page returned 403].** Per-champion win rate by games-on-champion tier (5+, 20+, 50+, 100+), labelled patch 26.11. This is cross-sectional. — [Blitz.gg champion mastery](https://blitz.gg/lol/champions/champion-mastery)
- **Riot balance framework (2019) [AB].** "Average Play" is everyone below the top 10 % of solo queue, which covers our Gold–Platinum users. — [Riot /dev: Champion balance framework](https://www.leagueoflegends.com/en-us/news/dev/dev-champion-balance-framework/)
- **[CODE]** The repo already validates Champion-Mastery-V4 fields `championId`, `championLevel`, `championPoints`, `lastPlayTime` and `milestoneGrades` ("End-of-game grades for the current mastery milestone"). — [packages/riot-api/src/schemas.ts](../../../packages/riot-api/src/schemas.ts)

### Inferences
- **Mastery → games needs per-user calibration after 14.10.** Points per game now depend on grade, win and premade size, and the fixed ~600/game figure predates the rework. The server already syncs users, so store the user's mastery list per sync. Then estimate the user's own points per game as Δpoints / Δgames on each champion between syncs.
- **Pre-window games.** `n_pre(u,c) ≈ max(0, points_at_window_start − 0) / ppg_u`, where points_at_window_start = current points − (window games on c × ppg_u). Mastery also accrues in ARAM and normals, so n_pre counts all-mode experience. Treat it with a discount weight (for example 0.5), to be fitted.
- **Backtests must avoid look-ahead.** Current mastery includes games after the predicted game. Estimate n_pre once, then add only the window games before g.
- **`milestoneGrades` is a small, free, recent per-champion performance signal**, like TrueSkill 2's kill-rate evidence. Its semantics (which games, and how many) are unclear. Riot's own use of "C or higher" as a fairness bar suggests grades are a role-relative performance score.
- **Difficulty.** Cross-sectional per-champion tier gains (for example 5+ → 50+ games on Blitz) can seed the difficulty multiplier m_c, but they are inflated by survivorship. Shrink them toward the cross-champion mean and let the users' within-player data correct the overall scale.

### Gaps
- No official per-game point formula for post-14.10 mastery was found (fan sites list level thresholds only), so the number of games behind a mastery level is unknown.
- It was not checked whether Match-V5 exposes the end-of-game mastery grade per participant.
- No 2023–2026 Riot statement with numbers on win rate by mastery or games played was found (beyond the 2020 blog already in hand). Whether Lolalytics offers a mastery filter could not be confirmed.

## 4. Off-role/autofill, tilt and streaks, session length, time of day (2022–2026 evidence)

### Takeaway
All four effects are small, heavily confounded, and partly masked by MMR-based matchmaking:
- **Sessions:** LoL performance falls by about 8–10 % from the first to the last game of sessions with 3+ games (2018; shuffle-controlled but confounded by stopping rules).
- **Streaks:** losing streaks correlate with slightly worse performance among top players (CHI PLAY 2024, "small").
- **Tilt:** a blog finds a 48.8 % win rate after two losses, with no skill control.
- **Lapse:** Halo 5 shows a 49 % → 43 % lapse effect, explained by experience.
- **Time of day:** chess shows shifts in decision style during the day, but not in performance.

No public 2022–2026 effect size for autofill or off-role win rate was found. Riot's 2026 changes treat autofill as a fairness problem and use mastery grade ≥ C as the bar. None of these terms should move pick scores before they are validated on our users' data.

### Cited Findings

**Off-role / autofill**
- **Riot Ranked 2026 [FT].**
  - Autofill Parity: the matchmaker "will first attempt to match an autofilled player against another autofilled player in the same position". Otherwise "the team with more autofilled players will have slightly higher MMR players".
  - Autofilled matchups are "not a very common occurrence today".
  - "Being able to play other roles confidently makes everyone better at the game."
  - Priority-role players get Aegis rewards "at roughly the same cadence" as autofilled players.
  - The post describes no role-specific MMR and gives no autofill win-rate numbers.
  - — [Riot /dev: Ranked 2026](https://www.leagueoflegends.com/en-us/news/dev/dev-ranked-2026)
- **2019 matchmaking fix [AB].** Before the change, 11.4 % of games had uneven autofill; after it, 0.97 % (Riot's Yetter via Upcomer). — [Upcomer](https://www.upcomer.com/league-of-legends-update-sees-major-matchmaking-improvements/)
- **Deng et al. 2024 (CHI PLAY Companion; 597,680 top-player matches) [AB].** "Consistent champion and lane choice" was linked to better performance. Players kept their champion and lane during winning streaks and switched during losing streaks. — [HKBU record, DOI 10.1145/3665463.3678787](https://scholars.hkbu.edu.hk/en/publications/streaks-and-coping-decoding-player-performance-in-league-of-legen/)
- **Analogue from TrueSkill 2 [FT].** Skill in two Halo 5 modes correlates at only 0.6. That supports a base-plus-offset model across roles, rather than one shared skill. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)

**Tilt and streaks**
- **Deng et al. 2024 [AB].** Winning streaks went with better performance and losing streaks with worse: "significant but small" correlations. Players took longer breaks after both. Breaks "slightly" improved performance after losses and had no significant effect after wins. — [HKBU record](https://scholars.hkbu.edu.hk/en/publications/streaks-and-coping-decoding-player-performance-in-league-of-legen/)
- **iTero tilt article (100k+ games; Gold and Diamond I) [FT, blog].**
  - After 2 consecutive losses, "a 48.8% chance of winning their next game". The author's own caveat: losing players "might just be worse than the average".
  - In Gold, after 2 losses, playing on with no break gave the lowest win rate. A short break gave "more than 3%" above the group average. Long breaks (3–4 h on average) reverted to it.
  - In Diamond I, playing immediately was slightly better and short breaks "considerably decrease" the win rate.
  - — [iTero: LoL tilt](https://itero.gg/articles/lol-tilt)
- **Riot (Feb 2024) [AB].** "Losers' queue doesn't exist." — [devtrackers](https://devtrackers.gg/leagueoflegends/p/1e570d00-existence-of-loser-queue-a-statistical-analysis)
- **TrueSkill 2 [FT].** Quitting the previous match goes with a lower next-match win rate (44–46 % vs 47–49 % expected). — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Huang 2013 [FT].** Breaks follow skill drops; players "take breaks more often when they lose". — [Huang et al. 2013](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)
- **EA, EOMM (WWW 2017) [AB].** Fairness-based matchmaking isn't always best for engagement. The authors optimise matchmaking for engagement using churn risk that depends on recent win/loss patterns (data from an EA game). — [arXiv 1702.06820](https://arxiv.org/pdf/1702.06820)
- **Penn State qualitative study [AB].** Both winning and losing streaks hurt player experience, and players disengaged to cope. — [Penn State record](https://pure.psu.edu/en/publications/playing-with-streakiness-in-online-games-how-players-perceive-and/)

**Session length and lapse**
- **Sapienza et al. 2018 (LoL) [FT].**
  - A session is consecutive matches with ≤ 15-minute breaks.
  - In sessions of ≥ 3 matches, performance falls "by more than 10% and 8%" from the first to the last match for win rate and KDA ("8–10 %" on average). Whether these are relative or absolute declines is not stated clearly.
  - Longer sessions show a brief warm-up gain first.
  - Shuffling each player's match order removes the decline.
  - Players in the top 5 % by matches played decline much less, and they also play longer sessions.
  - — [PMC6030337](https://pmc.ncbi.nlm.nih.gov/articles/PMC6030337/)
- **TrueSkill 2 lapse table [FT].** 49 % win rate at 0–1 day since the last match vs 43 % at 7–9 days; the trend is explained once experience is modelled. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Huang 2013 [FT].** A 30-day break is about 10 matches of skill, recovered in about 10 matches. — [Huang et al. 2013](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)
- **Vardal 2022 [FT].** Spreading the first 100 games over more days gave d = 0.15–0.27 better performance at games 96–100. — [PMC9565695](https://pmc.ncbi.nlm.nih.gov/articles/PMC9565695/)

**Time of day**
- **Online chess servers (Leone, Fernandez Slezak, Golombek, Sigman) [AB].** "Reliable diurnal rhythms" in activity and decision policy: morning play is slower and more careful, later play faster and less accurate, "without daily changes in performance". Chronotype had no significant effect on performance. — [CONICET record](https://ri.conicet.gov.ar/handle/11336/66003); [APS summary](https://www.psychologicalscience.org/news/minds-business/is-there-an-ideal-time-of-day-for-decision-making.html)
- **Kao 2019 (FDG) [AB].** In a survey of 504 players, FPS players *report* feeling most successful from 6 pm to midnight. This is self-report, not measured performance. — [Kao 2019 (PDF)](https://people.csail.mit.edu/dkao/pdf/kao2019fdg3.pdf)

### Inferences

**How these effects get confounded**
- **Matchmaking masks win-rate effects.** After losses, a player's MMR drops and their next opponents are weaker, so the expected win rate is pulled back toward 50 %. Any tilt or streak effect measured on *win rate* is therefore biased toward zero compared with performance measures. Riot's "Autofill Parity" (giving the more-autofilled team slightly higher-MMR players) shows Riot treats autofill as a handicap it partly offsets. Measured off-role win-rate gaps in ranked will be smaller than the real performance gap.
- **Stopping-rule confound.** Players stop after losses (Huang; Sapienza could predict session end from recent performance), so the *last* game of a session is more often a loss by construction. Shuffling destroys that dependence, so Sapienza's shuffle control does not rule it out. To test session fatigue on our users, model game k's result only among sessions that continued past k, or drop each session's last game.
- **Between-player confound.** The iTero 48.8 % compares different players. Use within-user comparisons (user fixed effects): for example, each user's win rate after 2 losses vs their own baseline.

**Off-role**
- Implement the role offset TrueSkill-2 style: ρ_{u,r} ~ N(ρ_off·[r is off-role for u], τ_r²), where off-role means outside the user's top-2 roles by trailing frequency. Fit ρ_off by pooling users.
- Precision: if about 10 % of a user's 1,000 games are off-role, that is about 100 games, giving a per-user SE of about 5 pp. Pooled over 10 users the SE is about 1.6 pp. A real off-role penalty of 3–5 pp would therefore be detectable in the pooled data but not per user.

**What to do with tilt, session and time-of-day terms**
- Expected sizes are a few pp at most, and per-user power is weak: a 500/500 split has an SE of about 3.2 pp. Keep these terms out of the pick score.
- Use them only for the existing break suggestion, and only if a pooled within-user backtest shows an effect, for example the user's last-session-game-excluded win rate after 2+ losses without a ≥ 15-minute break.

### Gaps
- No 2022–2026 public effect size for autofilled or off-role players' win rate was found from Riot, op.gg, u.gg, League of Graphs or academic work.
- Riot's 2019 Position Ranks dev diary (which may contain per-position skill data) could not be retrieved: it redirects, and the archive was blocked.
- Effect sizes in Deng et al. 2024 are not available from the abstract.
- No LoL-specific time-of-day performance study was found.
- No study was found that controls for MMR-driven opponent changes when measuring tilt in LoL.

## 5. Fitting and validating a personal model with 5–10 users

### Takeaway
Don't try to learn between-user variance from 5–10 users. Instead:
- Give each user a fixed intercept; it is well determined from up to 1,000 games, with an SE of about 1.6 pp.
- Learn the player-champion spread τ and the experience-curve parameters by pooling all users' user-champion cells, under informative priors from population curves.
- Borrow champion and band strength from the collector, as TrueSkill 2 does for small modes.
- Update online per game.

Validate by rolling-origin, time-ordered prediction of each user's later games against simple baselines, with leave-one-user-out hyperparameters. Expect to detect only personal effects whose true spread is about 3 pp or more.

### Cited Findings
- **TrueSkill 2 [FT].** Parameter estimation "breaks down for game modes with less than 1000 matches", and such modes use "the parameters estimated from the most similar popular mode". Production runs online updates plus a batch refit each season. — [TrueSkill 2](https://www.microsoft.com/en-us/research/uploads/prod/2018/03/trueskill2.pdf)
- **Stan case study [FT].** With 18 groups × 45 trials, the pooling pseudo-count κ had an 80 % interval of about 25–211, "not well constrained". — [Stan case study](https://mc-stan.org/learn-stan/case-studies/pool-binary-trials.html)
- **Few clusters [AB].**
  - With very few clusters, maximum-likelihood variance components are unstable or biased and may come out as zero. Sensible variance priors stabilise Bayesian estimates (citing McNeish 2016a). There is no consensus on default priors, and *inaccurate* informative priors can bias more than frequentist estimates. — [arXiv 2509.00636](https://arxiv.org/pdf/2509.00636); [PMC7868428](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7868428/)
  - Counterpoint: REML with t-based inference can handle few clusters without going Bayesian (McNeish, "No need to turn Bayesian…"). — [University of Copenhagen record](https://test01.ku.dk/:obvius/pureproxy/3974268/da/publications/no-need-to-turn-bayesian-in-multilevel-analysis-with-few-clusters)
- **Robinson's beta-binomial regression [FT].** Make the prior mean depend on the number of trials when trial count correlates with talent. — [Robinson 2016](https://www.r-bloggers.com/2016/05/understanding-beta-binomial-regression-using-baseball-statistics/)
- **Aung 2018 [FT].** Early-game prediction improves roughly linearly up to 40 initial games. **Huang 2013 [FT]:** skill change in early matches predicts later skill. — [Aung et al.](https://eprints.whiterose.ac.uk/id/eprint/132541/); [Huang et al.](https://thomas-zimmermann.com/publications/files/huang-chi-2013.pdf)
- **Chen et al. [FT].** The TrueSkill baseline was evaluated time-ordered (first 90 % train, latest 10 % test), while the regression models used random 10-fold CV. — [arXiv 1702.06253](https://arxiv.org/pdf/1702.06253)
- **Showing uncertainty [AB].**
  - Quantile dotplots (Kay, Kola, Hullman, Munson, CHI 2016) made people's probability estimates tighter than density plots (about 1.15× less variance) on small mobile screens. — [UW IDL: When(ish) is my bus?](https://idl.uw.edu/papers/when-ish-is-my-bus)
  - In an incentivised experiment, quantile dotplots and CDFs led to better decisions (Fernandes et al., CHI 2018). — [UW IDL: Uncertainty displays…](https://idl.uw.edu/papers/uncertainty-bus)
- **Riot General Policies [FT].** "Products cannot create alternatives for official skill ranking systems such as the ranked ladder. Prohibited alternatives include MMR or ELO calculators." — [Riot Developer Portal: General policies](https://developer.riotgames.com/policies/general)

### Inferences

**Recipe**
1. **Per-game features (time-ordered, no look-ahead).**
   - n_before(u,c,g) plus n_pre(u,c), from mastery calibrated per user (Q3).
   - Days since the last game on c.
   - Role, and an off-role flag.
   - Duo flag (in Halo 5, squads of 2–3 needed no offset, so test duo before adding it).
   - The band's champion-role strength from the snapshot of that time, or the current snapshot as an approximation.
2. **Hyperparameter fit (offline, pooled over all users).** A logistic GLMM with:
   - fixed effects: user intercepts α_u and the exponential E(n; P0, τ0, m_c);
   - random effects: `(1 | user:champion)` with SD τ;
   - role offsets ρ.

   Use informative priors: P0 and τ0 from the population curves already in hand, pulled toward their within-player end; τ ~ half-normal(≈ 5 pp on the probability scale, ≈ 0.2 logits); ρ_off ~ N(−3 pp, 3 pp). Tools: brms/Stan or PyMC offline; or a small Laplace/EP approximation in TypeScript if it must run on the server. Output: versioned values in `config/engine.v*.json`.
3. **Online updates in the app.** Per user-champion, keep a Gaussian posterior for δ on the logit scale. After each game: s² ← 1/(1/s² + p(1−p)), μ ← μ + s²(y − p), where p includes E(n). This is the TrueSkill/Glicko-style filter, and it keeps the engine pure.
4. **Refits.** Monthly, or every 200 new user games, re-run step 2. This mirrors TrueSkill 2's per-season batch refit.

**Validation protocol**
- **Rolling origin.** For each user, predict games 301–1,000 one at a time, using only earlier games, with hyperparameters fitted on the *other* users plus this user's past games (leave-one-user-out). This prevents a user's future from leaking through τ or P0.
- **Metrics.** Log loss and Brier score per game, plus a calibration slope and intercept.
- **Baselines.**
  - B0: the user's trailing win rate.
  - B1: B0 + band champion strength (engine v2 without the personal term).
  - B2: the current hand-set personal term.
  - M: the new model.
  - Ablations: E(n) only; δ only; with and without n_pre.
- **Inference across users.** Use a paired per-game log-loss difference with a block bootstrap (blocks of a user-week). Report per user and pooled. With only 5–10 users, cluster-level confidence intervals will be wide; say so.
- **Power check (rough).** If the personal term's true spread across games is σ_d (probability scale), the expected log-loss gain is about 2σ_d² nats per game, with a per-game SD of about 2σ_d.

  | σ_d | expected gain (nats/game) | z on 5,000 held-out games |
  |---|---|---|
  | 5 pp | 0.005 | ≈ 3.5 |
  | 3 pp | 0.0018 | ≈ 2.1 |
  | 2 pp | 0.0008 | ≈ 1.4 (likely invisible) |

  With 5–10 users × 700 held-out games, only a meaningful personal term can be confirmed. Plan for "no detectable gain" as a valid result.

**Minimum games**

| n games on a champion | 10 | 20 | 50 | 100 | 200 |
|---|---|---|---|---|---|
| Binomial SE at 50 % | 15.8 pp | 11.2 pp | 7.1 pp | 5.0 pp | 3.5 pp |
| Reliability n/(n+k), k = 40 | 0.20 | 0.33 | 0.56 | 0.71 | 0.83 |
| Reliability n/(n+k), k = 100 | 0.09 | 0.17 | 0.33 | 0.50 | 0.67 |

Below about 20 games, a champion's own record should barely move δ, and the experience curve should dominate. Show "personal" claims only when the posterior SD of the combined personal term is below a threshold (for example 4 pp). Otherwise say "too few games on this champion: the estimate is from your experience level".

**Showing uncertainty in a 440 × 720 panel**
- Use frequency framing ("about 11 in 20 games like this") or a 20-dot quantile strip in place of ± intervals, together with the existing sample-size confidence labels.
- Never show a per-champion rating number. It risks looking like an "MMR/ELO calculator" under Riot policy.

### Gaps
- There are no esports-specific guidelines for models fitted on as few as 5–10 people; the guidance above transfers from multilevel statistics.
- The real values of τ, P0 and τ0 for our users are unknown until fitted. The power estimates above are back-of-envelope.
- Gelman's 2019 post on fitting multilevel models with few groups could not be fetched (403).

## 6. Privacy-preserving population data: mastery buckets on anonymous rows, and other routes to an experience curve

### Takeaway
One Champion-Mastery-V4 call per seed adds about 9 % to the collector's calls (about 1 extra per 11) and gives an experience bucket for each of the seed's ~5 collected games. The by-PUUID endpoint the repo already uses returns every champion in one call. Riot's written rules, as read, forbid four things:
- de-anonymising players who can't be identified from visible information;
- selling or sublicensing the API;
- violating privacy;
- MMR/Elo calculators.

They say nothing explicit about aggregate statistics. However, collector rows keep the public `matchId`, so a bucket written onto a participant row is **pseudonymous, not anonymous**: Match-V5 maps the matchId back to PUUIDs. The cleanest design is to compute the bucket during collection, throw away the PUUID and mastery list, and store only aggregate counters. Add within-seed paired counts if a within-player estimate is wanted. Update the product description in the Developer Portal before enabling it.

### Cited Findings
- **Riot General Policies [FT].**
  - "Products cannot de-anonymize players who cannot reasonably be identified from visible information."
  - "Products cannot create alternatives for official skill ranking systems such as the ranked ladder." "Prohibited alternatives include MMR or ELO calculators."
  - "Products should use supported services from Riot Games for data ingestion."
  - "Do not use a Production API key to run multiple projects (one product per key)."
  - The page as fetched did not address data brokering, aggregate statistics or data retention.
  - — [Riot Developer Portal: General policies](https://developer.riotgames.com/policies/general)
- **Riot API Terms [FT].**
  - Prohibited: "Distributing, selling, transferring, encumbering, sublicensing, renting, loaning, lending or leasing the Riot Games API"; "Using the Riot Games API for any Application to violate anyone's privacy rights"; "Using the Riot Games API to collect any additional information about the Game or Game users". Only this fragment of the last item was verified; the summariser said it bars collecting data beyond what Riot provides or the API permits.
  - GDPR: Riot passes end-user deletion requests to developers as "a list of identifiers (e.g. accountId)".
  - On termination, developers must "delete all of the Game Information in Your possession".
  - "Game Information" means "metadata arising from the Game regarding user profiles, user gameplay history, statistics…".
  - — [Riot Developer Portal: API Terms](https://developer.riotgames.com/terms)
- **[CODE] The collector today.**
  - For each seed it calls `matchIdsByPuuid` with `count = matchesPerPlayer`.
  - Config: `matchesPerPlayer: 5`, `lookbackDays: 10`, `timelineShare: 1`, `maxStoredMatches: 50000`. That is about 1 + 2×5 = 11 calls per seed.
  - The `matches` table is keyed by the public `matchId`, and the stored summary JSON includes `matchId` and per-participant data.
  - — [apps/server/src/collector.ts](../../../apps/server/src/collector.ts); [config/meta.v1.json](../../../config/meta.v1.json); [apps/server/src/db/schema.ts](../../../apps/server/src/db/schema.ts); [packages/shared/src/index.ts](../../../packages/shared/src/index.ts)
- **[CODE] Project rules.**
  - The personal key covers "only a small private group".
  - "New features must be added to the product's description in the Developer Portal."
  - "PUUIDs are per key."
  - "Collector rows are stored without PUUIDs or names."
  - — [CLAUDE.md](../../../CLAUDE.md)
- **Chen et al. [FT].** In Dota 2, anonymous players were pooled into one "universal anonymous player". In LoL, artificially anonymising the same share of players lowered accuracy, while player and player-champion terms still helped. The authors partly blame anonymity for the Dota result. Anonymous population data cannot support per-player terms; it can only support feature-based curves. — [arXiv 1702.06253](https://arxiv.org/pdf/1702.06253)

### Inferences

**Options for a population experience curve without identities, best first**

**Option A: mastery bucket, aggregate-only (cross-sectional; cheap).**
- When collecting a seed, call Champion-Mastery-V4 by PUUID once and look up the seed's points on the champion played in each of their ≤ 5 new games.
- Bucket the points (for example < 10k, 10–30k, 30–75k, 75–150k, 150k+), or convert them to estimated games once points/game is calibrated (Q3).
- Increment `exp_counters(band, championId, role, bucket, day) += {games, wins}`. Keep the PUUID and the mastery list only in memory.
- Cost: +1 call per seed, about 9 %.
- Look-ahead bias is small, because games are at most 10 days old, so mastery includes only a few later games. Coarse buckets absorb this.
- What you get: a band-specific, current-patch, EUW version of the iTero curve, about 50k labelled player-games per band per collection window (1 per game, from the seed's side).
- The curve is still **cross-sectional**, with the survivorship caveat. Use it only for curve shape and difficulty priors.
- Suppress small cells when publishing, for example by requiring at least 20 games per cell.

**Option B: within-seed paired counts, aggregate-only (within-player; cheap but noisy).**
- When a seed's ≤ 5 games include champions in different buckets, each pair of games forms a within-player comparison.
- Store only aggregate discordant-pair counts per (band, bucket_low, bucket_high): "the high-bucket game won and the low-bucket game lost" vs the reverse.
- The Mantel-Haenszel or conditional odds ratio then estimates the experience effect with the seed's general skill (a player fixed effect) cancelled out. No identifiers or row links are stored.
- Champion strength must be adjusted for. Either stratify the counts by expected-win bins taken from the band snapshot, or store sums of expected values per cell.
- It remains biased by *why* players choose low-mastery champions (counterpicks, autofill), but it removes between-player selection, which is the biggest bias in cross-sectional curves.

**Option C: opt-in users (within-player; exact).**
- The 5–10 users' own time-ordered histories give exact n_before counts. This is the only fully within-player source. It is small, but it is the right source for the *slope*. Combine it with A/B as priors (Q5).

**Option D: no collection.**
- Use published curves (iTero, League of Graphs, Blitz, Riot's 2020 blog) as fixed priors. This has zero policy surface, but the curves aren't specific to band or patch.

**Why per-row storage is a problem**
- Writing the bucket onto the participant rows of stored matches would satisfy "no PUUIDs" literally, but not anonymity. Anyone with an API key can re-fetch the matchId, and the seed is the participant common to their 5 stored matches.
- Mastery is publicly visible (on profiles and stats sites), so this would not reveal hidden information. Even so, aggregate-only storage keeps the dataset outside "personal data" and makes Riot's GDPR deletion forwarding moot. It also matches the project rule "other players only as anonymous aggregates".

**Policy reading**
- Option A/B as described store only aggregate statistics of public data. They identify no one, sell nothing, and are shown to no one as individual data. This is consistent with the rules quoted above.
- Two open points. First, the API-Terms item about collecting "any additional information about the Game or Game users" was seen only as a fragment. Second, any new data use must be added to the product description in the Developer Portal (project rule).
- If in doubt, ask Riot through the Developer Portal before switching it on.
- Never surface any bucket or experience information about the *other* players in a user's draft. That stays forbidden: sanitizeChampSelect / sanitizeLiveGame.

**Rate budget**
- Under the personal key (20 req/s, 100 req/2 min), +9 % calls means about 9 % fewer collected games per wake-up at a fixed budget. During a boost run, consider sampling mastery for only a fraction of seeds (for example 50 %); that is enough for the curve.

### Gaps
- No Riot document was found that speaks directly to storing derived per-participant features from other players for aggregate statistics. The General Policies page fetched did not mention data brokering or aggregates. The "data brokering" rule in this project's SPEC could not be traced to a current Riot page in this session.
- The full sentence of the API-Terms clause about collecting "additional information" was not verified.
- [CODE] The repo already calls `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` and parses the reply as a list of all champions ([packages/riot-api/src/client.ts](../../../packages/riot-api/src/client.ts) line ~145; `MasteryListSchema` in [schemas.ts](../../../packages/riot-api/src/schemas.ts)), so one call per seed is enough. This was not re-checked against Riot's API reference page.
- How much Option B's within-seed estimate is biased by champion choice (counterpicks, autofill) is untested. A simulation with `packages/sim` could check it.

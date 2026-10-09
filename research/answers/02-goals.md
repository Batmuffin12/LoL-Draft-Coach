# 2. Goals per role, and accurate targets

2026-10-09 · research only (no code or config changed). Covers section 2 of [RESEARCH-QUESTIONS.md](../RESEARCH-QUESTIONS.md). Builds on [ROLE-GOALS.md](../ROLE-GOALS.md) (which metrics each role gets) and [01-language.md](01-language.md) (how the tips are worded). Opinion is marked **(opinion)**.

## Summary

1. **Step size.** Sport research favours **moderate** goals over hard ones. In the sport meta-analysis, moderate goals had effect size d = 0.53, hard ones 0.41 and easy ones 0.07. Business research says "harder is better, as long as the person can reach it". Measure the step in units of the player's own game-to-game spread (σ), not as a share of the gap. A step of **about 0.5 σ, never below the smallest worthwhile change (0.2 of the band's spread) and never past the reference**, is moderate. It is also the smallest change that 10–20 games can tell apart from noise.
2. **Rank.** Adjacent tiers differ by only about 5–7% on lane CS. That is already a "moderate" step (≤ 5% above current is a classic sport rule of thumb). The default reference should stay **your own band's median**. Switch to the **next band's median** only when you are at or above your band's median on every candidate ("climbing mode"). Published per-rank numbers are weak: one large dataset from 2015 and guide tables with no stated method. **Our own collector per band is the best source we have.**
3. **"Goal met" needs both a size check and a noise check.** Your recent mean must reach the target, and the improvement over a **shrunk** baseline must have z ≥ 1.64 (one-sided). Require at least 5 games. With 10 baseline and 10 recent games, only changes of about **0.6–0.7 σ** stand out from noise. Count metrics (deaths) are noisier than rates (CS) at the same mean, so they need more games or bigger changes. Checking after every game inflates false "met" verdicts, so calibrate the threshold with a simulation test.
4. **Goal choice.** Replace the median split. It throws away information and still mixes cause and effect. Use a **per-band, per-role logistic regression on one early metric at a time**. Its controls are pre-game only: own champion strength, matchup and side. It **never controls for mediators** like gold. For lane metrics, use the **difference to the lane opponent in the same game**. The coefficient turns directly into "wins per 100 games", the unit 01-language asks for. All of this works on the collector data we already have.
5. **Habits first for beginners.** Process goals beat outcome goals by a wide margin in sport (d 1.36 vs 0.09). Learners who start with process goals and later move to outcome goals do best. Novices on complex tasks do better with learning goals. So rank **habit** metrics (control wards, wards before 14) and **own-output** metrics (CS at 10, early deaths) ahead of **relative outcome** metrics (CS or gold lead, plates, takedowns) for low bands and for players new to a role. Every goal's tip should be a process ("This game, try …").
6. **Per champion.** Yes, for metrics where the champion explains a real share of the spread (jungle CS at 10, early takedowns). Blend the champion's typical value with the role's, weighted by games (empirical Bayes). Habits (control wards) stay role-level.

---

## Q1. Targets: how big a step?

### Evidence

| Source | Finding | Notes |
| --- | --- | --- |
| Locke & Latham 2002, *American Psychologist*, "Building a practically useful theory of goal setting" ([PDF](https://www-2.rotman.utoronto.ca/facbios/file/09%20-%20Locke%20&%20Latham%202002%20AP.pdf)); summary via [search of the paper](https://med.stanford.edu/content/dam/sm/s-spire/documents/PD.locke-and-latham-retrospective_Paper.pdf) | Harder goals bring more performance, along a straight line, while the person is committed and able. Goal-difficulty effect sizes d = .52–.82. Performance levels off when ability runs out or commitment lapses. | Mostly lab and workplace tasks. We could not parse the PDF text; numbers via search summaries of the paper. |
| Kyllo & Landers 1995, sport meta-analysis (cited in [Healy, Tincknell-Smith & Ntoumanis 2018, Oxford Research Encyclopedia](https://selfdeterminationtheory.org/wp-content/uploads/2019/08/2018_HealyTinckell-SmithNtoumanis_OxfordREP.pdf) and [summaries](https://pmc.ncbi.nlm.nih.gov/articles/PMC3588684)) | Overall g = 0.34. **Moderate goals d = 0.53, difficult 0.41, easy 0.07.** Absolute specific goals 0.93 vs relative goals 0.27. Short-term 0.38, long-term 0.19, both 0.48. | Healy et al.: "athletes should pursue moderately difficult goals"; the sport findings are "less robust" than business ones because sport results depend on teammates and opponents. **That fits League well.** |
| Weinberg 2013, as quoted in [Healy et al. 2018](https://selfdeterminationtheory.org/wp-content/uploads/2019/08/2018_HealyTinckell-SmithNtoumanis_OxfordREP.pdf) | "Immediate goals should be set at no more than 5% above current performance". Too hard hurts motivation and persistence; too easy breeds complacency. | Rule of thumb, criticised in the same source as fitting only outcome or performance numbers. |
| [Williamson et al. 2022, *Int. Rev. Sport Exerc. Psychol.*](https://www.tandfonline.com/doi/full/10.1080/1750984X.2022.2116723) (27 studies; [summary](https://ro.uow.edu.au/test2021/6227)) | **Process goals d = 1.36, performance goals 0.44, outcome goals 0.09.** Process goals also raised self-efficacy (d = 1.11). | The strongest recent sport evidence. The page blocks our fetcher; numbers come from the abstract (two indexes agree). |
| [Wilson et al. 2019, *Nature Communications*, "The Eighty Five Percent Rule"](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579) | Under their assumptions, learning is fastest at about 85% success (15.87% errors) per trial. | A model of binary learning trials. The authors say the human optimum "is determined empirically". It argues for **per-game success often enough to keep going**, not for a target. |
| [Hopkins 2004, *Sportscience*, "How to interpret changes in an athletic performance test"](https://sportsci.org/jour/04/wghtests.htm) | Smallest worthwhile change: **0.2 of the between-athlete SD** in team sports, or 0.3 of an athlete's within-athlete variation in individual sports. Use repeated tests and averaging because noise often exceeds that change. | Gives us the floor for a step. |
| [Seijts & Latham 2005, *Academy of Management Executive*](https://wku.edu/cebs/doctorate/documents/readings/seijts_latham_2005_learning_vs_performance_goals.pdf) | When acquiring knowledge or skill, rather than effort, is what's needed, "a specific challenging **learning** rather than an outcome goal should be set". Example of proximal sub-goals: "a few hundredths of a second each day". | Supports small, near-term steps and habit-type goals for new players (Q6). |

**Conflicting views.** Work and lab research says harder is better (linear); sport research says moderate beats difficult. Sport is closer to us: results depend on teammates and opponents, and our players set no goals themselves. **We follow the sport evidence.** The 85% rule seems to call for much easier targets. But it is about trial-by-trial learning on binary tasks, not goal size, so we use it only as a check: the per-game "reached it" rate shouldn't fall so low that players give up.

### What this means for our formula

Today: `target = baseline + 0.5 × (typical − baseline)`. Problems:
- **The step grows with the gap.** A player far below typical gets a large target, exactly where sport research says goals are too hard. A player just below gets a step smaller than the game-to-game noise, which can't be checked.
- **No unit of noise.** The same step means very different things for CS at 10 (wide spread) and for early deaths (small counts).
- **Regression to the mean (RTM).** The goal is chosen where your baseline is *worst*. Part of that low value is bad luck and will come back by itself, so the coach "detects" progress that isn't real ([Barnett, van der Pols & Dobson 2005, *Int. J. Epidemiol.*](https://www.ovid.com/journals/ijepi/pdf/00004345-200502000-00042~regression-to-the-mean-what-it-is-and-how-to-deal-with-it): RTM grows "when follow-up measurements are only examined on a sub-sample selected using a baseline value"). Baseball handles the same problem by shrinking small samples toward the league mean with weight n/(n+k), where k is the sample size at which the stat "stabilizes" ([FanGraphs, Staude 2013](https://blogs.fangraphs.com/randomness-stabilization-regression); [Carleton's stabilization work via Baseball Prospectus](https://www.baseballprospectus.com/?p=14215)).

### Recommended target formula

Notation for one metric (`s` = +1 when more is better, −1 when fewer is better):
- `m`: reference (Q2), `σ_band`: the band's spread (IQR / 1.349, from the quantiles we already serve), `s_own`: your per-game SD over your role games (for counts: `max(sample variance, mean)`, a Poisson floor).
- `n0` baseline games, mean `b`.

1. **Shrink the baseline:** `b̃ = (n0·b + k·m) / (n0 + k)`, where `k = priorGames` (config, default 5). The ideal k is `s_own² / σ_between²` (per-game noise over real player differences), measured per metric (see "What to measure").
2. **Gap:** `gap = s·(m − b̃)`. If `gap < 0.2·σ_band` (inside the smallest worthwhile change, per Hopkins), the metric is **not a candidate**: you are already typical.
3. **Step:** `step = clamp(targetStep·gap, minStep·σ_band, maxStep·s_own)`, then `step = min(step, gap)`. Use `minStep = 0.2`, `maxStep = 0.5`, `targetStep = 0.5`. If the lower bound is above the upper one, use the lower bound.
4. **Target:** `target = b̃ + s·step`.

Why 0.5 σ for the upper bound:
- At your baseline, a single game beats a target 0.5 σ above it about **31%** of the time (normal approximation; 0.25 σ: 40%). Once you've reached it, about 50%. That is challenging without being out of reach (opinion, combining Kyllo & Landers with the 85% rule).
- Any smaller and the coach can't confirm it within 20 games (Q3).

Rank-specific steps: **no evidence found** that the step itself should depend on rank. Searched: goal-setting meta-analyses (Kyllo & Landers, Williamson), Hopkins, and esports goal-setting studies ([JEGE 2025 pilot](https://journals.humankinetics.com/view/journals/jege/3/1/article-jege.2024-0048.xml) looks at goal systems in team talk, not goal size). The band already enters through `m` and `σ_band`.

## Q2. Rank: your band's median or the next one?

### Published per-rank numbers

| Source | Date / size | Metric by tier | Weight |
| --- | --- | --- | --- |
| [LeagueMath, "Farm and wards per league per role"](https://www.leaguemath.com/farm-and-wards-per-league-per-role/) | Patch 5.5 (2015), 415,860 NA ranked games | **Lane CS/min**: top 4.70 (Bronze) → 5.12 → 5.46 (Gold) → 5.69 (Plat) → 5.86 (Diamond) → 5.99 → 6.05 (Challenger); mid 4.22 → 4.61 → 4.96 → 5.22 → 5.45 → 5.73 → 5.88; ADC 5.11 → 5.55 → 5.88 → 6.09 → 6.27 → 6.43 → 6.49. **Wards/min**: support 0.51 (Bronze) → 0.69 (Gold) → 0.82 (Diamond) → 0.94 (Challenger); ADC *falls* 0.18 → 0.14; jungle 0.21 → 0.38. | Only large dataset found. 11 years old: the game, minion gold and support item have changed. Use for **shape**, not values. |
| Our pilot ([ROLE-GOALS.md](../ROLE-GOALS.md) §2), patches 16.17–16.19, 400 games | 2026 | Lane CS at 10, bands 2→3 (Gold–Plat → Emerald–Diamond): top 65.3→69.0, mid 68.6→73.1, bot 58.7→61.9; jungle CS at 10 61.1→65.1; support control wards 3.28→4.50; jungle ward takedowns 3.31→4.26; support vision/min 2.23→2.46. | Current game; small, two bands only. |
| [Boosting Market, CS/min by rank](https://boostingmarket.com/blogs/lol-cs-per-minute-by-rank/) and [vision score by rank](https://boostingmarket.com/blogs/lol-vision-score-by-rank/) (2026) | No sample size or patch. Says "Riot publishes no official vision score distribution" and uses "the boost accounts we run". | CS/min ranges, e.g. Gold ADC/mid 5.5–7, Diamond 7.5–9; support vision score Gold 30–40, Diamond 52–65. | Low: stated method is a boosting service's own accounts. |
| [VictoryView, CS/min (2026-04)](https://victoryview.gg/blog/cs-per-minute-the-most-honest-metric-in-competitive-lol), [HighGround](https://www.highgroundgaming.com/good-cs-per-minute-lol/), [LeagueFeed](https://leaguefeed.net/best-farm-score-in-10-minutes/) | No data source. | CS at 10: 80+ strong, 70–80 average, 60–70 weak, under 60 poor. No per-rank split. | Low. These "averages" sit above our pilot's measured Gold–Diamond means (59–73), so guide benchmarks overstate the typical player. |
| Deaths before 14, turret plates, control wards by rank | No evidence found. Searched: "deaths per game by rank", op.gg tier statistics ([op.gg/lol/statistics/tiers](https://op.gg/lol/statistics/tiers) loads its numbers dynamically, so our fetcher saw none), lolprofile (blocks fetching), Kaggle datasets (mostly Diamond+ or pro). | — | Measure it ourselves (below). |

**Shape across ranks (2015 data plus our pilot):**
- Lane CS rises steadily with rank, about **5–7% per adjacent tier** (Gold → Plat: top +4%, mid +5%, ADC +4%; pilot band 2 → 3: +5–7%).
- Support warding rises the most: +10–20% per tier in 2015, and control wards +37% from band 2 to band 3 in the pilot.
- Jungle *minion* CS doesn't rise. LeagueMath's reading: "skilled junglers quickly converge to some (optimal?) level of farming… After that, climbing ranks depends on something other than … these simple statistics".
- ADC wards fall with rank.

**So: next band's median or your own?**
- One tier is about 5% on lane CS, which matches Weinberg's "≤ 5% above current". For a player at their band's median, the next band's median is a moderate goal.
- For a player well below their own band's median, the next band is a long-term, outcome-type target, and sport evidence ranks long-term goals lower (d 0.19 vs 0.38 for short-term; Kyllo & Landers).
- Ranked matchmaking puts you with players of similar MMR, so beating your own band's typical player is what moves you up (opinion).

**Recommendation:**
- Keep `m` = **your band's median**.
- When every candidate is at or above your band's median ("all met", today's `focus: null`), switch `m` to the **next band's median** and say so ("Toward {nextBand}").
- At the top band, use your band's 75th percentile.
- This needs the server to send the next band's references, which it already computes.

## Q3. Measuring progress: when is a change real?

### Evidence

- **Noise versus the smallest worthwhile change.** Hopkins ([2004](https://sportsci.org/jour/04/wghtests.htm)) judges an individual's change as beneficial, trivial or unclear against the smallest worthwhile change and the measurement noise. He advises repeated tests and averaging.
- **Reliable change index.** In clinical practice, Jacobson & Truax 1991 call a change reliable when `(post − pre) / SE_diff > 1.96`, where `SE_diff` comes from the measure's noise ([metricgate summary](https://metricgate.com/docs/reliability-of-change-scores/), [Behavior Therapist 2025 intro](https://digitaleditions.sheridan.com/article/Introduction+to+Reliable+Treatment+Change%3A+Individual+and+Group+Applications/4959365/844132/article.html)).
- **Peeking.** Re-testing after every new data point and stopping at the first "significant" result inflates false positives. Ten looks at a nominal 5% give close to 20% ([Evan Miller, "How Not To Run an A/B Test"](https://www.evanmiller.org/how-not-to-run-an-ab-test.html); Armitage, McPherson & Rowe 1969, via [r-bloggers](https://www.r-bloggers.com/2014/06/weekend-at-bernoullis/)). Our goal card re-checks after every game, so this applies.
- **Counts versus rates.** Early deaths are a small count. Their variance is about equal to the mean (Poisson) or larger (overdispersion). At dispersion 1.5 a comparison needs about 50% more samples than the Poisson model ([metricgate negative-binomial sample size](https://metricgate.com/docs/sample-size-parallel-count); [PMC2631439](https://pmc.ncbi.nlm.nih.gov/articles/PMC2631439)).
- **Run rules.** Control charts flag a shift when 8 (Western Electric) or 9 (Nelson) points in a row fall on one side of the centre line. By chance, 9 in a row happens with probability 2·0.5⁹ ≈ 0.004 ([metricgate on Western Electric vs Nelson](https://metricgate.com/blogs/western-electric-vs-nelson-rules-spc/)).

### How many games? (in units of your per-game SD σ)

Smallest true improvement that the test detects, one-sided, comparing `n1` recent games with `n0` baseline games: `Δ = (z_α + z_power)·σ·√(1/n1 + 1/n0)`.

| n0 baseline | n1 recent | z = 1.28 (90%), 50% power | z = 1.64 (95%), 50% power | z = 1.64, 80% power |
| --- | --- | --- | --- | --- |
| 10 | 5 | 0.70 σ | 0.90 σ | 1.36 σ |
| 10 | 10 | 0.57 σ | 0.73 σ | 1.11 σ |
| 10 | 20 | 0.50 σ | 0.64 σ | 0.96 σ |
| 20 | 10 | 0.50 σ | 0.64 σ | 0.96 σ |
| 20 | 20 | 0.40 σ | 0.52 σ | 0.78 σ |

Reading:
- With today's 10 + 10 games, only improvements of about 0.6–0.7 σ show up reliably. **A baseline of 20 games is worth more than a longer check window.**
- Counts versus rates. For early deaths at a mean of 1.5 per game, σ ≈ √1.5 ≈ 1.2 (more with overdispersion). So 0.5 σ ≈ 0.6 fewer deaths per game: a large relative change.
- For CS at 10 we don't know σ yet. It is the within-player per-game SD (measure it). Guide ranges suggest roughly 8–15 CS **(assumption, to be measured)**, so 0.5 σ ≈ 4–8 CS. That matches the pilot's band-to-band gap.
- **Rule of thumb:** rates like CS at 10 can be judged after about 10 games. Small counts (deaths, gank kills, plates) need about 20 games or a larger change.

### Rules

- **Goal met:** all three must hold:
  - `n1 ≥ metGames.min` (5);
  - `you ≥ target` (direction-adjusted);
  - `z = s·(you − b̃) / (s_own·√(1/n1 + 1/n0)) ≥ metZ` (1.64).

  The mean condition checks size, the z condition checks noise. `b̃` is the shrunk baseline, so regression to the mean doesn't count as progress.
- **Calibrate `metZ` by simulation.** Add a Vitest property test that feeds the rule games with no real change (normal for rates, negative binomial for counts), re-checked after every game up to `maxGames`. Pick `metZ` so false "met" stays ≤ 10%. Peeking with 15–20 looks may push it to about 2.0.
- **Switch goal (suggest, never force):**
  1. **Met** → show "goal met" and offer the next candidate.
  2. **Stuck:** after `switch.maxGames` (20) on this goal without "met" and with z < `switch.stuckZ` (0.5) → offer "Try a different goal?". The player chooses (01-language rule 11).
  3. **Role change:** the goal follows the last game's role, as `focusAfterLastGame` does now.
- **Slipped back (opinion):** if a met goal's metric later falls below `b̃` again over 10 games, it may return as a candidate. Keep it at its old target rather than recomputing.
- **Display.** Keep the per-game dots (`recent`). They show the hit rate (about 31% at the start, about 50% at the target). Show "Few games yet" until `n1 ≥ 5` (01-language rule 12).
- **State.** The rules need "games since this goal was set". Today `pickFocus` is stateless. Either keep the goal start in the advice log (server) or local settings, or stay stateless with `baseline = games before the last checkGames, up to 20` and `window = 30`.

## Q4. Choosing the goal: better than a median split

**Problems with the current method** (`metricImportance`: win rate above the median minus below):
- **It wastes data.** Median splits are "rarely defensible" and lose information ([MacCallum et al. 2002, *Psychological Methods*](https://psychology.psy.sunysb.edu/attachment/measures/content/maccallum_on_dichotomizing.pdf); in one example the continuous variable explained 31% more variance than its median split).
- **It mixes cause and effect.** It is a raw association. Even before 14 minutes, a winning draft or a strong jungler raises both your CS and your win rate.
- **Whole-game stats are worse.** PandaSkill ([arXiv 2501.10049](https://arxiv.org/html/2501.10049)), a per-role pro rating, uses end-game stats and admits the circularity. Its top feature in every role is KLA, which is exactly the outcome confound we avoid.

**Options on our data** (per band, 15–60k games; anonymous rows; Match-V5 + timelines):

| Method | What it fixes | Feasible? |
| --- | --- | --- |
| A. Early-only metrics (≤ 14 min) | Removes most reverse causation (the late-game "losers die more") | **Already done** via `growth.roles`. |
| B. **Logistic regression per band and role, one metric at a time, pre-game controls only** | Uses the full continuous metric. Controls for draft strength. | **Yes**: pure, in `packages/meta`. Controls: own champion's band win rate, lane matchup prior (both from our snapshot), side. **Not** gold, XP, kills or game length: they are mediators or outcomes, and adjusting for them hides the effect ([Schisterman et al. 2009, overadjustment bias](https://www.educa.saludpublica.uchile.cl/espsystem/files/t/asignaturas_bibliografia/2461/archivos/Schisterman%20et%20al.%202009%20Overadjustment.pdf)). One metric per model: reading several coefficients from one model is the "Table 2 fallacy" ([Westreich & Greenland 2013 via PMC](https://pmc.ncbi.nlm.nih.gov/articles/3626058)). |
| C. **Lane-opponent difference** (`me − opponent` in the same game) | Cancels whatever both laners share in that game: patch, game pace, both junglers' attention on the lane | **Yes** for lane metrics. The opponent's anonymous numbers in the same game are already used for `laneCsDiffAt10`/`laneGoldDiffAt14` ([ROLE-GOALS §5](../ROLE-GOALS.md)). It is the same idea as Riot's own `…LaneOpponent` challenges. |
| D. Within-player (fixed effects) | Removes stable skill differences | **Not on collector data** (no PUUIDs, by rule). Only possible on registered users' own histories, which are too few. |
| E. Gold-at-15 style win models ([Applied Sciences 2025](https://www.mdpi.com/2076-3417/15/10/5241); [Junior & Campelo, arXiv 2309.02449](https://arxiv.org/pdf/2309.02449)) | Confirm early gold leads predict wins | Context only: team-level, not per habit. |

**Recommendation: B for every metric, plus C for lane-relative metrics.**
- Turn the coefficient β (per one band-SD of the metric) into **wins per 100 games per band-SD**: `25·β` near a 50% win rate, because the logistic slope there is p(1−p) = 0.25.
- `importance` = that number. It needs the significance check ("every shown number must survive"): drop metrics whose 95% interval includes 0. At 15–60k games most will pass, so also require at least `minImportance` wins per 100 (config).
- **Impact for ranking candidates:** `impact = importance × (s·(m − b̃) / σ_band)`, the expected extra wins per 100 games from closing your gap. It uses the same units as the "why" text.
- **It is still a measured association, not a mechanic.** By the "statistics" rule, the "why" line should give the mechanic (01-language rule 5). The number only ranks the candidates and sizes the claim.

**What to measure** (on the production DB, per band and role): β with and without controls for each `growth.roles` metric. Large drops after adding controls show where draft strength drives the metric. Also compare the ranking with today's median split.

## Q5. Per champion

**Evidence:**
- Riot's own post-game grades compare you "against other players on the same champion and position" in your region, percentile-based ([LoLTheory, how S grades work](https://blog.loltheory.gg/how-to-get-s-in-lol/); same claim in [HighGround](https://www.highgroundgaming.com/?p=39281) and the [League wiki](https://wiki.leagueoflegends.com/en-us/Mastery)). Riot has published no formula.
- Dignitas notes damage depends on the kit (Karthus vs Galio) ([Dignitas](https://dignitas.gg/articles/how-to-measure-the-best-stats-for-performance-in-league-of-legends)).
- SIDO ([arXiv 2403.04873](https://arxiv.org/html/2403.04873v1)) "accounts for player role and champion, both key factors which drastically impact how a player is evaluated".
- A 2026 systematic review asks for role-specific metrics ([Sharpe et al. 2026](https://journals.sagepub.com/doi/10.1177/17479541251381652)).

**Recommendation:**
- **Typical value, empirical-Bayes blend:** `m_c = (n_c·median_c + K·median_role) / (n_c + K)`. `n_c` is the band's games on that champion in that role; `K` (config `championPriorGames`, default 200 **(opinion)**) is the number of games at which the champion's own median gets half the weight. This is the same shrinkage as in Q1, at champion level.
- **Use it only for kit-driven metrics.** Use champion values when the champion explains at least `championShareMin` (0.10, **measure**) of the metric's spread in the band (η², the share of variance between champions). Expected kit-driven metrics: jungle CS at 10 (clear speed), takedowns before 10, gank kills, early deaths for some champions. Expected role-level: control wards, wards before 14, ward clearing (habits).
- **Applies when the focus is on a champion** (`championId` set, i.e. ≥ `minGames` on your main). Otherwise use the role value, as now.
- **Don't use "winning players' mean"** from "how each champion wins" as a target. It follows the result even for early metrics. Use it in the Learn panel, not for goals.

## Q6. Habits versus outcomes

**Evidence:**
- Process goals d = 1.36 vs outcome 0.09 ([Williamson et al. 2022](https://www.tandfonline.com/doi/full/10.1080/1750984X.2022.2116723)).
- Learners who **shifted from process goals to outcome goals** beat those who kept process goals only, who beat those with outcome goals only. They also gained more self-efficacy and interest ([Zimmerman & Kitsantas 1997, dart throwing, 90 learners](https://www.scinapse.io/papers/2055605826); [summary](https://coachsci.sdsu.edu/csa/vol93/zimmerma.htm)).
- When people lack the knowledge, learning goals beat performance goals ([Seijts & Latham 2005](https://wku.edu/cebs/doctorate/documents/readings/seijts_latham_2005_learning_vs_performance_goals.pdf); Winters & Latham 1996, as summarised by [ProgressFocused](https://progressfocused.com/2016/09/which-types-of-goals-when.html)).
- In our pilot, habits barely track the result (control wards win split 0.04) yet rise with rank (+37%). They measure skill, not luck ([ROLE-GOALS §2](../ROLE-GOALS.md)).

**Classification of the current goal metrics:**

| Kind | Metrics | Player controls it? |
| --- | --- | --- |
| **habit** (process) | `controlWardsPlaced`, `wardsPlacedBefore14`, `wardTakedowns` | Fully |
| **output** (own performance, early) | `laneMinionsFirst10Minutes`, `jungleCsBefore10Minutes`, `earlyDeaths` | Mostly; the opponent and junglers interfere |
| **relative** (outcome vs opponent or team) | `laneCsDiffAt10`, `laneGoldDiffAt14`, `turretPlatesTaken` (shared credit), `takedownsFirstXMinutes`, `killsOnLanersEarlyJungleAsJungler`, `earlyEpicMonsterTakedowns`, `visionScorePerMinute` (whole game) | Partly |

Not measured yet but habit-type: first recall timing (`firstBackSec`, ROLE-GOALS §5, direction unclear, so not a goal), jungle full clear done (`jungleCsAt4`).

**Recommendation:**
- Multiply `impact` by a per-kind weight that depends on the band and on games in the role:
  - **beginner** (band 0–1, or fewer than `minGames` in the role): habit 1.0, output 1.0, relative 0.5;
  - **others:** 1.0 / 1.0 / 1.0.
- The weights are **opinion**, set from the direction of the evidence, not from data.
- Every goal, whatever its kind, is shown with **a process tip** (Q7). The number is the score; the tip is the process goal for this game. This follows the process-then-outcome sequence (Zimmerman & Kitsantas).

## Q7. Tips per role and metric

**Sources** (coaching opinion unless noted; dates given):
- [dodge.gg jungle guide](https://www.dodge.gg/en-US/lol/news/jungle-guide-2026) (2026-03-24): gank checklist "2+ conditions"; farm vs gank order; no Smite, no objective; "forcing ganks on already-losing lanes" is a listed mistake.
- [Dignitas laning basics](https://dignitas.gg/articles/a-guide-to-understanding-the-basics-of-the-laning-phase-in-league-of-legends) (2023-04-14): "poke your enemy … whenever they go to last hit"; shove or recall to avoid ganks; ward the Scuttle area.
- [Dignitas support vision](https://dignitas.gg/articles/the-ward-game-improving-your-vision-control-as-a-support) (2022-06-20): river bush ward north of bot lane; recall "a little more than a minute before the major objective"; "do not start destroying the ward as you're taking the dragon"; deep wards when the enemy jungler is on the far side.
- [Dignitas last-hitting](https://dignitas.gg/articles/how-to-last-hit-like-a-pro-a-guide-to-improve-your-creep-score) and [Boosteria CS fundamentals](https://boosteria.org/guides/csing-fundamentals-last-hitting-wave-management-trading-league-legends): under tower, melee take two tower shots then your hit; casters take one hit before the tower shot.
- [Notionz laning](https://notionz.io/gaming/league-of-legends-laning-phase-guide/) and [Mobalytics "how to stop dying"](https://mobalytics.gg/blog/5-ways-to-get-better-at-surviving-laning-phase/) (search summaries only): ward against early ganks; a sudden change in the opponent's aggression signals a gank.
- [Mobalytics recall timers](https://mobalytics.gg/blog/lol-5-best-recall-timers/) and [metabot recall guide](https://metabot.gg/en/league/guides/when-to-recall-back-timing-economy) (search summary): recall on the cannon wave crash, with gold for a component.
- [games.gg ADC](https://games.gg/league-of-legends/guides/league-of-legends-adc-guide/) ("losing a few CS is better than dying") and [Riot patch 26.16](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes) (support roaming penalty), as already used in ROLE-GOALS.

**Evidence ranking** (order inside each list):
1. Tips backed by a game mechanic and at least two coaching sources (last-hitting under tower, shove before roaming or recalling, warding river against ganks, recalling before objectives) come first.
2. Single-source tips come next.
3. Our own opinions come last.

No tip mentions the score (01-language), uses "never/always", or gives patch-dependent spawn times. All tips follow 01-language's "When X, do Y" form at about 60–75 characters.

```json
{
  "top:challenges.laneMinionsFirst10Minutes": [
    "When a minion is about to die, last-hit it before you trade.",
    "When melee minions reach your tower, hit after two tower shots.",
    "When the wave crashes into their tower, recall then."
  ],
  "top:earlyDeaths": [
    "When their jungler isn't on the map, stay on your half of the lane.",
    "When you push past the middle, ward river or tri-brush first.",
    "When your opponent suddenly turns aggressive, back off: a gank may come."
  ],
  "top:laneGoldDiffAt14": [
    "When your wave is bigger than theirs, trade.",
    "When you can't win trades, last-hit under your tower and give up nothing.",
    "When they recall or die, hit the tower before you back."
  ],
  "top:challenges.turretPlatesTaken": [
    "When your opponent recalls or dies, hit the tower before you back.",
    "When your wave is pushed and grubs are contested, join the grub fight."
  ],
  "top:challenges.controlWardsPlaced": [
    "When you first back, buy a control ward for river or tri-brush.",
    "When your control ward is cleared, buy a new one on your next back."
  ],
  "jungle:challenges.jungleCsBefore10Minutes": [
    "When no lane is gankable after your clear, keep farming.",
    "When you pass a camp that's up, take it on the way.",
    "When a gank fails, go straight back to your camps."
  ],
  "jungle:challenges.killsOnLanersEarlyJungleAsJungler": [
    "Gank when two hold: enemy pushed, no Flash, no ward, your laner has CC.",
    "When you gank, come from behind the enemy, not up the lane.",
    "When a lane is losing badly, gank a lane that can follow up instead."
  ],
  "jungle:earlyDeaths": [
    "When you saw their jungler on one side, play on the other side.",
    "When your nearby laners can't move first, skip the invade.",
    "When an objective area is dark, ward or sweep before you walk in."
  ],
  "jungle:earlyEpicMonsterTakedowns": [
    "When an objective spawns in about a minute, recall and buy wards.",
    "When Smite is on cooldown, wait for it before you start an objective.",
    "When their jungler shows on the far side, take the objective."
  ],
  "jungle:challenges.wardTakedowns": [
    "When your early ganks are done, swap to Oracle Lens.",
    "When an objective is coming up, sweep its area before the fight."
  ],
  "jungle:challenges.controlWardsPlaced": [
    "When you back before an objective, place a control ward on your side of it."
  ],
  "middle:challenges.laneMinionsFirst10Minutes": [
    "When you want to roam, push the wave first so you lose no minions.",
    "When you push a cannon wave into their tower, recall then.",
    "When a trade would cost you a wave, take the minions instead."
  ],
  "middle:earlyDeaths": [
    "When one side of mid is warded, play toward that side.",
    "When their jungler is missing, stop pushing past half the lane.",
    "When your wards run out, stay closer to your tower."
  ],
  "middle:challenges.takedownsFirstXMinutes": [
    "When you've pushed or killed your laner, roam; not mid-wave.",
    "When you roam, pick a lane with CC or kill pressure.",
    "When your jungler moves near your lane, push and go with them."
  ],
  "middle:laneGoldDiffAt14": [
    "When your wave is bigger than theirs, trade.",
    "When they recall or die, hit the tower before you back.",
    "When their mid leaves lane, ping it, then hit their tower."
  ],
  "middle:challenges.turretPlatesTaken": [
    "When their mid leaves lane, ping it, then hit their tower.",
    "When they recall or die, hit the tower before you back."
  ],
  "middle:challenges.controlWardsPlaced": [
    "When you back, place a control ward in a mid side brush or river."
  ],
  "bottom:challenges.laneMinionsFirst10Minutes": [
    "When melee minions reach your tower, hit after two tower shots.",
    "When casters reach your tower, hit once before the tower shot.",
    "When you want to recall, crash the wave first."
  ],
  "bottom:earlyDeaths": [
    "When their wave is bigger, skip the trade: minions hit you too.",
    "When they have a hook or skillshot, stand behind your minions.",
    "When a fight is lost, give up the wave rather than die for it."
  ],
  "bottom:laneCsDiffAt10": [
    "When they walk up to last-hit, hit them if your range is longer.",
    "When your support zones them, take every minion you can.",
    "When you trade, keep last-hitting between your autos."
  ],
  "bottom:challenges.turretPlatesTaken": [
    "When you win a fight or take dragon, hit plates before you back."
  ],
  "bottom:challenges.takedownsFirstXMinutes": [
    "When you hit a level first or their key spell is down, fight.",
    "When your support engages, follow at once."
  ],
  "utility:challenges.controlWardsPlaced": [
    "When you back, buy a control ward.",
    "When you place it, pick the next fight: dragon pit edge or river bush.",
    "When a control ward sits in your inventory, it gives no vision: place it."
  ],
  "utility:wardsPlacedBefore14": [
    "When your support item has a ward charge, use it.",
    "When you walk back to lane, ward the river bush on the way.",
    "When lane starts, trinket the nearest lane bush."
  ],
  "utility:challenges.wardTakedowns": [
    "When your support item's quest is done, swap to Oracle Lens.",
    "When an objective is coming up, sweep before it, not during it."
  ],
  "utility:earlyDeaths": [
    "When you ward alone, ward from your side of the river.",
    "When your ADC can't stay safe alone, stay in lane.",
    "When their jungler isn't seen, skip unwarded bushes."
  ],
  "utility:challenges.visionScorePerMinute": [
    "When an objective spawns in about a minute, ward around it.",
    "When their jungler shows on the far side, ward their jungle."
  ]
}
```

Notes:
- Two lines ("When melee minions reach your tower…", "When their mid leaves lane…") are shared across roles on purpose.
- The utility vision-score tips replace the score-gaming line, as 01-language asks.
- "Gank when two hold…" keeps the checklist form; it is the one tip that isn't "When X". At 70 characters it is above the 60 aim.
- Game facts to re-check each season: the tower and minion damage rule, Oracle Lens, the support item quest, Void Grubs.

## Deliverable: config proposal

Fits `growth` in `config/engine.v1.json`. The new fields are additions, so the Zod schema in `packages/engine/src/config.ts` needs them. `roles` stays as in today's config.

```json
{
  "growth": {
    "window": 30,
    "checkGames": 10,
    "minGames": 8,
    "targetStep": 0.5,
    "step": { "minBandSd": 0.2, "maxOwnSd": 0.5 },
    "priorGames": 5,
    "reference": { "default": "band", "whenAllMet": "nextBand", "topBandQuantile": 0.75 },
    "met": { "minGames": 5, "z": 1.64 },
    "switch": { "maxGames": 20, "stuckZ": 0.5 },
    "importance": { "method": "logit", "controls": ["championWinRate", "matchupPrior", "side"], "minWinsPer100": 1 },
    "minImportance": 0.01,
    "champion": { "priorGames": 200, "minShare": 0.1 },
    "kinds": {
      "habit": ["challenges.controlWardsPlaced", "wardsPlacedBefore14", "challenges.wardTakedowns"],
      "output": ["challenges.laneMinionsFirst10Minutes", "challenges.jungleCsBefore10Minutes", "earlyDeaths"],
      "relative": ["laneCsDiffAt10", "laneGoldDiffAt14", "challenges.turretPlatesTaken", "challenges.takedownsFirstXMinutes", "challenges.killsOnLanersEarlyJungleAsJungler", "earlyEpicMonsterTakedowns", "challenges.visionScorePerMinute"]
    },
    "kindWeight": {
      "beginner": { "habit": 1, "output": 1, "relative": 0.5 },
      "default": { "habit": 1, "output": 1, "relative": 1 }
    },
    "beginnerBands": [0, 1]
  }
}
```

`minImportance` changes meaning: from a win-rate share (0.02) to a share of wins per band-SD (0.01 = 1 win per 100 games).

## What to measure on the production copy

1. **Per-game SD (within player)** for each `growth.roles` metric. Use registered users' histories, since collector rows have no player key. Also the between-player SD from band quantiles minus within. Gives `σ`, the stabilization `k = s²/σ²_between`, and checks the CS-at-10 assumption (8–15).
2. **Dispersion of early deaths, gank kills and plates** (variance / mean). Above 1.3, use the negative-binomial floor in the count variance.
3. **Logistic β per band and role** for each metric: (a) raw, (b) with pre-game controls, (c) lane metrics as opponent differences. Compare the rankings with today's median split.
4. **Champion share (η²)** per metric and role, to set `champion.minShare` and the list of kit-driven metrics.
5. **Band-to-band steps** for each metric across all bands (we only have bands 2–3 in the pilot). These are the per-rank reference values the web couldn't supply. They also check the 5–7%-per-tier pattern.
6. **Simulation** (no data needed): false "met" rate of the rule under no change, per metric type, to calibrate `met.z`.

## What to change in the code or config

1. `packages/engine/src/growth.ts` `pickFocus`:
   - shrink the baseline (`priorGames`);
   - compute `s_own` (Poisson floor for counts);
   - new step clamp (`step.minBandSd`, `step.maxOwnSd`);
   - skip metrics inside the smallest worthwhile change;
   - `done` = size and z check (`met`);
   - add `z` and `n1` to `FocusMetric` for the UI.
2. Switch rule: keep the goal start (advice log or local settings) and offer "Try a different goal?" after `switch.maxGames`, so the player chooses.
3. Reference: when all are met, fetch the next band's references and show "Toward {nextBand}"; at the top band, use p75.
4. Replace `metricImportance` (median split):
   - add a logistic fit per band, role and metric in `packages/meta` (pure), with pre-game controls and opponent differences for lane metrics;
   - serve `importance` as wins per 100 per band-SD with its confidence interval;
   - keep the median split as a fallback for "games" mode (thin data).
5. `impact` = importance × standardized gap × `kindWeight` for the player's band and experience.
6. Champion references: the server serves per-champion medians and n per band and role for kit-driven metrics; the engine blends them (`champion.priorGames`).
7. `config/explain.v1.json` `tips`: replace with the JSON above (adds the new metrics' tips: `laneGoldDiffAt14`, `laneCsDiffAt10`, `earlyEpicMonsterTakedowns`, `wardsPlacedBefore14`, utility early deaths and vision). `growth.goalHint` ("{step:pct}% of the way") no longer fits a σ-based step; reword per 01-language, e.g. "Next step: {target}".
8. `config/engine.v1.json` `growth`: add the fields above. Remove `challenges.initialCrabCount` from `growth.metrics`, which has no spread (ROLE-GOALS §4).
9. Tests:
   - the false-"met" simulation;
   - the RTM case: a noisy worst metric shouldn't show progress without a real change;
   - a count metric needs more games than a rate metric for the same relative change.

## Open leads

- op.gg's tier statistics page loads per-tier in-game stats dynamically. A browser read could give current per-tier deaths, CS and vision, as a check of our band data.
- The full texts of Williamson et al. 2022 and Locke & Latham 2002 were not readable by our fetcher. Effect sizes come from abstracts and indexes (two or more agree for each).
- [The Practice Behaviors of Expert League of Legends Players (2025)](https://www.tandfonline.com/doi/pdf/10.1080/10447318.2025.2527842) may have per-tier practice data. Not read.

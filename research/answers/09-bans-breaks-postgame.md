# 9. Bans, breaks, post-game

Research date: 2026-10-09. Builds on [01-language](01-language.md) (wording rules, `{x:per100}`), [03-style-month](03-style-month.md) (tilt as a behaviour count) and [06-draft-engine](06-draft-engine.md) (the draft predicts little; champion strength is the one real gain). Code read: `packages/engine/src/session.ts`, `suggestBans` in `packages/engine/src/live.ts`, `packages/engine/src/postgame.ts`, `packages/lcu/src/sanitize.ts`, `config/engine.v1.json` (`session`, `rating.bans`), `config/explain.v1.json` (`ban.*`, `session.*`, `postgame.*`).

## Short answer

1. **Bans.** No published study measures what one solo-queue ban is worth, and our own arithmetic says it's a few tenths of a point at most. The best-supported rule is the expected-value one that data sites use: **how likely the enemy is to pick it (pick rate among games where it was available, i.e. corrected for bans) × how much it wins when they do** ([LoLalytics PBI](https://lolalytics.com/lol/tierlist/)). Because champion strength is the only draft term that beat a coin flip on our data (06), **ban the strongest common champion for your lane first; ban a counter to your own pick only when that matchup is measured, large and the counter is common**. Ban rate measures fear and frustration as much as power: show it, never rank by it. Two code fixes: correct the pick rate for bans, and never suggest a champion a teammate is already hovering to ban.
2. **Breaks.** In LoL, losing streaks go with slightly worse next games, and win rate drifts down over long sessions (3 large observational studies). But the effect is small (1–3 points), observational, partly selection, reversed in one high-rank sample, and absent within players in the best chess study. "A short break after 2 losses" is *weakly* supported (one community analysis for Gold, one peer-reviewed short paper for top Korean players). **Keep the trigger (2 losses, or a long session), but ask instead of advise. Drop the personal "your record after 2 losses" line: no single player has enough games for it to pass a significance check.** Suppress the prompt once the player has already taken a break.
3. **Post-game.** One task-focused point beats a report card. Feedback aimed at the person or a grade harms performance in about a third of studies; feedback on the task and the process helps. Lead with what went right when it's real (novices respond to positive feedback, people learn less from their own failures), then give **one** thing for the next game, tied to the current focus goal. Show the same card after wins and losses, and never grade the pick by the result (outcome bias). "When you died" lands well if it is **early deaths with their times and what the enemy took next**. "Gold vs your lane opponent" lands only if compared with **what's typical for that matchup**; otherwise it blames the player for a losing matchup.

---

## 9.1 Bans in solo queue

### What the sources say

| Claim | Evidence | Sources |
| --- | --- | --- |
| Data sites rank global bans by **expected value**: win-rate edge × pick rate, with pick rate corrected for bans. | LoLalytics: "PBI = (win − AvgWinofTier) × 100 × pick / (100 − ban). Champions with a high PBI are very likely to be contested picks, very strong in the current meta and are optimal global bans against the enemy team." | [LoLalytics tier list (PBI definition), fetched 2026-10-09](https://lolalytics.com/lol/tierlist/) |
| Coaches split into "ban the patch's strongest" and "ban your own counter"; most say the strongest first, your counter when it's common or you blind-pick. | Boosting Market (2026-07): Gold/Plat ban patch-strong picks (their rule of thumb: 53 %+ at 10 %+ pick rate); when autofilled, ban the strongest jungler. Esports Talk (2018): "ban for your team" first, then personal counters ("a bit selfish"). Dignitas (2023): ban by what your champion can't handle (e.g. hook champions if you play an immobile one). Sheep Esports search summary: "if you have a hard time finding out what your opponent likes to play, consider banning your own counters". | [Boosting Market draft guide (2026-07-12)](https://boostingmarket.com/blogs/lol-draft-phase-guide/), [Esports Talk ban priority (2018-07-27)](https://www.esportstalk.com/blog/determining-league-of-legends-ban-priority-4107/), [Dignitas, most banned champions (2023-07-24)](https://dignitas.gg/articles/evaluating-league-s-most-banned-champions) |
| **Ban rate is not a strength signal.** Players ban out of frustration and fear; high ban rates persist at sub-50 % win rates. | Dignitas: one champion at a 39 % ban rate while its win rate "slipped sub 50 %"; bans are driven by "exploit" reputations and by playstyles that "nullify the concept of fun". LeagueMath (2015, 300k NA games): bans shift by league (Bronze bans "champions that can go off and carry", Master+ agrees on a few game-swinging picks); no link to win rate shown. Riot's balance team uses presence (pick + ban) for pro play, not ban rate as power in solo queue. | [Dignitas (2023)](https://dignitas.gg/articles/evaluating-league-s-most-banned-champions), [LeagueMath S5 bans per league](https://www.leaguemath.com/top-bans-per-league/), [Riot /dev: Balancing for pro play](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-for-pro-play/) (search summary), [WeCoach most banned (search summary)](https://wecoach.gg/blog/article/10-most-banned-champions-in-league-of-legends) |
| Comfort beats counter-picking in solo queue, so protecting your own pool matters more than chasing counters. | Boosting Market: a "53 % comfort pick beats a 47 % counter pick"; 06-draft-engine: own experience on the champion is the biggest measured effect (≈ 45 % under 20 games vs ≈ 54 % after). | [Boosting Market (2026)](https://boostingmarket.com/blogs/lol-draft-phase-guide/), [06-draft-engine](06-draft-engine.md) |
| The draft as a whole predicts little in solo queue, so any single ban is worth little. | Our 13,414-game backtest: draft terms log-loss 0.6928 vs 0.6932 (coin flip); only champion strength gained (06). | [06-draft-engine](06-draft-engine.md) |
| Riot 2026: you can no longer ban an ally's hovered champion (to cut tilt before the game). | Riot /dev Ranked 2026. | [Riot /dev: Ranked 2026 (2025-12-01)](https://www.leagueoflegends.com/en-gb/news/dev/dev-ranked-2026/) |
| Competitors' "suggested bans" (Porofessor) come from scouting the **enemy players'** champion pools. | Comparison reviews (2026). We can't do that: no identities of other players. | [Buildzcrank comparison (2026)](https://buildzcrank.com/en/blog/mobalytics-vs-blitz-vs-porofessor/) |

**No evidence found** for a measured win-rate effect of "ban your counter" vs "ban the strongest" in solo queue. Searched: "how much do bans matter solo queue", "ban value formula", academic draft papers ([Art of Drafting, RecSys 2018](https://web.cs.ucla.edu/~yzsun/papers/2018_recsys_drafting.pdf); [BPCoach 2023](https://arxiv.org/pdf/2311.05912); [pick/ban victory prediction, pro games](https://www.researchgate.net/publication/356873227_Feature_Analysis_to_League_of_Legends_Victory_Prediction_on_the_Picks_and_Bans_Phase)), which all model **pro** drafts where both teams coordinate. Reddit (r/summonerschool) could not be read (blocks fetching, pullpush rate-limited).

### The arithmetic (ours; the shape holds for any numbers)

A ban removes champion *c* from the game. Its value to your team is

```
value(c) ≈ P(the enemy team picks c | c available) × Δwin(your team | enemy has c)
```

- `P(enemy picks c in role r | available) ≈ ½ × pickRate(c, r) / (1 − banRate(c))`. Our `pickRate` is the share of *matches* with *c* in that role on either team (`meta-index.ts`), so the enemy side gets half. Dividing by (1 − ban rate) is LoLalytics' correction: a champion banned in 40 % of games is picked in 1/0.6 of the games where it can be.
- `Δwin` for **your lane** = its strength there + its matchup edge against what you're likely to pick (only if the enemy laner picks after you; in solo queue that's about half the time, set by lobby order, not by role).
- `Δwin` for **another lane** = its strength there. Win is shared, so a 54 % bot laner hurts your team as much as a 54 % top laner. The reason to weight your own lane higher is a division of labour (four teammates also ban, most for their own lanes) and that you know your lane. **That's opinion, not measured.**

Example of the scale: a champion picked in 12 % of your role's matches, banned in 20 %, with a 3-point edge: ½ × 0.12 / 0.8 × 0.03 ≈ **0.2 win points**. That's why the ban list should be quick and quiet, and never show a big "win added" number.

### Recommendation

1. **Rank bans by expected value in win points** (the formula above), not by today's mix of `laneShare × (−beats)` + `laneShare × metaWeight × strength`. Keep `protectPicks` (never ban what you'd pick) and keep excluding ally picks.
2. **Counter-bans only when the matchup is real.** Count the matchup term only if `n ≥ minGames.pair` *and* |z| ≥ 2 (the same evidence rule as runes in 04), and multiply it by `counterPickShare` (the chance the enemy laner picks after you, 0.5 by default, later measured from LCU pick order in recorded drafts).
3. **Exclude champions a teammate is hovering to ban** (in-progress ban actions of allies with a champion id). Today `unavailableChampions()` only counts completed actions and picks, so we can suggest the same ban a teammate is about to make.
4. **Ban rate stays as context, never as a reason to ban.** Keep the `ban.banRate` line but word it as what others do.
5. **Autofill:** when the assigned role isn't the player's usual one, the "your lane" term should use the assigned role (it does, via `ctx.role`); the protected picks then come from that role's suggestions.

### Ban wording (≤ 90 characters, slots only)

```json
{
  "ban.meta": ["Strong in {band} {role}: wins {winRate:pct}% of {games} games, picked in {pickRate:pct}%"],
  "ban.meta.row": ["Strong in {band} {role}"],
  "ban.counters": ["Beats your {pick:champion}: {delta:per100} more wins per 100 ({games} games)"],
  "ban.counters.row": ["Beats your {pick:champion} ({games} games)"],
  "ban.popular": ["Common in {band} {role} ({pickRate:pct}% of games); too few games for its win rate"],
  "ban.banRate": ["{band} players ban it in {banRate:pct}% of games"],
  "ban.banRate.row": ["Often banned in {band}"],
  "ban.offRole": ["Strong in {band} {role}, not your lane: a ban for the team"]
}
```

---

## 9.2 Breaks and tilt

### What the sources say

| Finding | Data | Sources |
| --- | --- | --- |
| **Win rate after losses (LoL, population):** ≈ 51 % → 50.4 % → 48.8 % after 0/1/2 losses in a row. In **Gold**, players who took a short break (≈ 20 min) after 2 losses won ≈ 51.8 % vs ≈ 48.8 % with no break (+3 points); 3–4 h breaks went back to average. In **Diamond I** it reversed: no break slightly better, short break worse. | 100k games, Riot API, 2020; observational, no within-player control. The author calls the causes "speculative". | [iTero, Analyzing tilt (2020-05-28)](https://www.itero.gg/articles/lol-tilt), [same on Medium/TDS](https://medium.com/data-science/analyzing-tilt-to-win-more-games-league-of-legends-347de832a5b1), cited by [LoLTheory (2026-08)](https://blog.loltheory.gg/cant-end-on-a-loss-league/) |
| **Streaks (LoL, top players):** "significant but small correlations": winning streaks go with better performance, losing streaks with worse. Players took longer breaks after streaks; after **losses** a longer break "slightly improved performance", after wins no effect. Players switch champion and lane during losing streaks; staying consistent went with better performance. | 597,680 matches, Korea top ≈ 3 %, CHI PLAY Companion 2024 (short paper). | [Deng, Trepanowski, Li, Zhang, Bujić, Hamari 2024](https://doi.org/10.1145/3665463.3678787) (abstract via [Semantic Scholar](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/3665463.3678787)) |
| **Session length (LoL):** win rate falls by about 10 % from the first to the last game of sessions of 3+ games; KDA ≈ 8 %. Experienced players fall less. Session = games ≤ 15 min apart (the median break of active players). | 242k solo games, 16,665 players, 2014–2016. | [Sapienza, Zeng, Bessi, Lerman, Ferrara 2018, R. Soc. Open Sci.](https://pmc.ncbi.nlm.nih.gov/articles/PMC6030337/) |
| **Session length (LoL):** "significant decreases in individual performance relative to the number of consecutively played matches … a considerable decline in the win rate". A search summary quotes a fall "from 55.4 % to 32 %" after some point (not verified: full text blocked). | 5,000 players, CHI PLAY 2023. | [Bikas, Pfau, Muender, Alexandrovsky, Malaka 2023](https://dl.acm.org/doi/10.1145/3573382.3616073) |
| **Chess, within players: no consistent effect.** Hierarchical Bayesian model controlling for rating difference and colour: "little evidence for experiential effects that are consistent across all players"; some individuals show them. | Lichess, 590k bullet games (1700–1900) and 197k (GMs), 2025. | [Gee, Seese, Curley, Ward 2025 (arXiv 2503.21713)](https://arxiv.org/html/2503.21713) |
| **Chess, pooled: a clear effect.** Last game's result predicts the next (b = 0.25 on log-odds); visible up to 7 games back. | 1M Lichess games (2014), mixed-effects logistic regression; a blog, not peer reviewed; does not control for rating drift. | [Sean Devine, Tilt and hype in online chess (2021-08-22)](http://seandevine.org/blog/chessBlog.html) |
| **Tilt** = frustration escalating into anger, with worse attention and performance; onset with stressors, lasting ≈ 30 min. Gaming experience and adaptive emotion regulation protect. | Interviews (27) + survey (488), 2024; qualitative study of gamers (2025). | [Bonilla et al. 2024, Frontiers in Psychology](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1409368/pdf), [Cregan, Toth, Campbell 2025, Cyberpsychology](https://journals.sagepub.com/doi/10.1089/cyber.2024.0320), [Leis et al. 2024, stressors & coping in esports (systematic review)](https://www.tandfonline.com/doi/full/10.1080/1750984X.2024.2386528) |
| **Breaks in general:** micro-breaks (≤ 10 min) reduce fatigue (d = 0.35) and raise vigour (d = 0.36) but don't significantly lift performance (d = 0.16); longer breaks lift it more; "recovering from highly depleting tasks may need more than 10-minute breaks". | Meta-analysis, 22 samples, N = 2,335, PLOS ONE 2022. | [Albulescu et al. 2022](https://doaj.org/article/c6f37b6ba159469296b2cb968b65505f) ([ScienceDaily summary](https://www.sciencedaily.com/releases/2022/08/220831152754.htm)) |
| **Riot on "losers queue":** ranked matches on rating only, not on loss streaks. | Riot Phroxzon, 2024-02 and 2025-07. | [X, 2024-02](https://x.com/RiotPhroxzon/status/1756511358571643286), [Dexerto](https://www.dexerto.com/league-of-legends/lead-lol-dev-finally-confirms-if-losers-queue-actually-exists-2527357/), [Dot Esports](https://dotesports.com/league-of-legends/news/get-good-lol-balance-boss-declares-losers-queue-doesnt-exist) |
| Players **notice losing streaks more** than winning ones and read them as the system working against them. | CHI 2018 interview/survey study. | [Kou, Li, Gui, Suzuki-Gill 2018](https://dl.acm.org/doi/10.1145/3173574.3174152) (abstract via search summary) |

### How strong is "take a break after 2 losses"?

- **For:** three independent LoL datasets (iTero 2020, Deng 2024, Sapienza 2018) agree that results dip after losing streaks and across long sessions; two (iTero, Deng) find that breaks after losses go with a small recovery. Tilt research gives a mechanism (anger, attention) and a time scale (≈ 30 min). Coaches give the same advice ([Dignitas, coping with a loss streak](https://dignitas.gg/articles/how-to-cope-with-a-loss-streak-in-league); [LoLTheory 2026](https://blog.loltheory.gg/cant-end-on-a-loss-league/), which is opinion built on the same studies).
- **Against:** all LoL evidence is observational. Players who lose twice include more who are above their skill level (their rating catches up), which lowers the next game without any tilt. Ranked matchmaking then gives them easier opponents, which pulls the other way. Who takes a break is self-selected. The one within-player study with rating controls (chess, 2025) finds no consistent effect. The Diamond I reversal (iTero) says the rule isn't universal.
- **Verdict:** the effect is real enough to *offer* a break, too small and too uncertain to *tell* the player that a break "usually helps". It's 1–3 points at population level and invisible in one player's games.

### Can a player's own record pass a significance check? No.

Today `session.record` quotes "your record right after 2 losses in a row" from `minGames: 8` games. With *n* games after a streak, the standard error of a win rate is √(0.25/n):

| n | SE | 95 % interval |
| --- | --- | --- |
| 8 | 17.7 pts | ± 35 pts |
| 40 | 7.9 pts | ± 15 pts |
| 150 | 4.1 pts | ± 8 pts |

Detecting the real-world size (≈ 3 points) with 80 % power needs ≈ (1.96 + 0.84)² × 0.25 / 0.03² ≈ **2,200 post-streak games** — more than any player's 1,000-game history holds. Even a 10-point gap needs ≈ 200. So the personal record will almost never pass; when it seems to, it's mostly noise. Follow 03: **show behaviour counts** ("queued within {minutes} min after {streak} losses: {count} times"), never a personal win-rate claim. The collector stores no PUUIDs, so we can't build sessions from band data either; a population number would have to be a cited external figure, which the "nothing hardcoded" rule forbids in text.

### Wording: what works for a break prompt

| Finding | Source |
| --- | --- |
| Controlling language ("should", "must") raises reactance and anger; autonomy-supportive wording reduces defiance. Neither changes intentions much. | [Legate/Nguyen et al. 2022, PNAS, 25,718 people in 89 countries](https://pmc.ncbi.nlm.nih.gov/articles/PMC9295806/); [Miller et al., controlling language and reactance (search summary)](https://www.researchgate.net/publication/229790957_Psychological_Reactance_and_Promotional_Health_Messages_The_Effects_of_Controlling_Language_Lexical_Concreteness_and_the_Restoration_of_Freedom) |
| Break pop-ups move few people. Adding self-appraisal and normative content **doubled** stops (0.67 % → 1.39 %). The better message ended with "Taking a break often helps, and you can choose the duration of the break." | [Auer & Griffiths 2015, 1.6M slot sessions](https://pmc.ncbi.nlm.nih.gov/articles/PMC4369874/); later RCT: limited effects ([PubMed 34366941](https://pubmed.ncbi.nlm.nih.gov/34366941/)) |
| Interview study of LoL players and coaches: ending a session is driven by performance satisfaction or frustration, team dynamics and aspirations; coaching shapes how sessions are structured. | [Seim, Strobel, Gerling, Alexandrovsky 2025, FDG](https://dl.acm.org/doi/10.1145/3723498.3723804) (abstract) |
| 01-language rule 11: suggest, no absolutes; offer a choice ("Good moment for a short break?"). | [01-language](01-language.md) |

So: **a question, the player's own fact (the streak or the game count), an optional suggested length from config, and a one-click "queue anyway"**. Expect most players to keep playing; that's fine. Show it once per streak, not after every game, and not when they've already rested.

### Proposed config (engine)

```json
{
  "session": {
    "gapMinutes": 45,
    "lossStreak": 2,
    "longSession": 6,
    "minGames": 8,
    "restMinutes": 20,
    "breakMinutes": 20,
    "showRecord": false,
    "lossStreakBands": { "4": 3 }
  }
}
```

- `restMinutes` (new): if the last game ended at least this long ago, the player has had a break: don't show the prompt. Today, a player who takes the suggested 20-minute break still sees "2 losses in a row" because the gap (45 min) keeps the session open.
- `breakMinutes` (new): the suggested length shown in the text. iTero's ≈ 20 min and the ≈ 30 min tilt duration both support 20–30; the micro-break meta-analysis says under 10 isn't enough.
- `showRecord` (new, false): turns off the personal win-rate line (it can't pass a significance check).
- `lossStreakBands` (new, optional): per band (key = band `id` in `rank-bands.v1.json`) a different streak length. iTero's Diamond I reversal suggests a higher threshold at the top. Diamond I sits in band 3 ("Emerald to Diamond") whose bulk is Emerald, so the example applies it only to band 4 (Master+). **Opinion from one source; leave it out until users are there.**
- `longSession` 6: supported in direction (Sapienza: decline across 3+ games; Bikas: sharp decline later), not in its exact value. Keep it.

### Break wording (≤ 90 characters)

```json
{
  "session.losses": ["{streak} losses in a row. Good moment for a {minutes}-minute break?", "{streak} losses in a row. Break, or one more?"],
  "session.long": ["{games} games this session. Good moment for a {minutes}-minute break?"],
  "session.why": ["Results dip a little after loss streaks; a short break may reset it"],
  "session.queue": ["Matchmaking uses your rating, not your streak"],
  "session.count": ["Queued within {minutes} min after {streak} losses: {count} times this month"]
}
```

`session.why` and `session.queue` are hover lines (mechanism, no numbers). `session.count` is for the monthly report (03).

---

## 9.3 Post-game feedback

### What the sources say

| Finding | Source |
| --- | --- |
| Feedback improves performance on average (d = 0.41), but **over a third of feedback interventions made performance worse**. The further feedback moves from the task toward the self, the worse it does. | [Kluger & DeNisi 1996, Psychological Bulletin, 607 effect sizes](https://scholars.huji.ac.il/testmihal/publications/effects-feedback-interventions-performance-historical-review-meta-analysis) ([summary](https://explore.psychsafety.com/n/kluger-denisi-1996/)) |
| Task, process and self-regulation feedback help; feedback about the self (praise, grades of the person) generally doesn't. | [Hattie & Timperley 2007, Review of Educational Research](https://www.aitsl.edu.au/docs/default-source/research-evidence/spotlight/feedback.pdf) |
| **Novices seek and respond to positive feedback; experts to negative.** Positive feedback raises commitment; negative feedback says where to spend effort. | [Finkelstein & Fishbach 2012, J. Consumer Research](https://blogs.cuit.columbia.edu/sf2559/files/2011/08/FF_JCR_Feedback.pdf) |
| People **learn less from their own failures** than from successes (ego threat, they tune out); they learn equally from *others'* failures. Remove the ego from failure feedback. | [Eskreis-Winkler & Fishbach 2019, Psychological Science](https://www.chicagobooth.edu/review/2019/december/learn-failing-not-so-easy) ([APS summary](https://www.psychologicalscience.org/news/minds-business/do-we-really-learn-from-our-mistakes.html)) |
| Feedback after relatively good trials helps learning (motor learning). **But** a 2022 meta-analysis found the motivational effects in this literature heavily inflated by reporting bias and small samples; corrected, they're close to zero. Treat "positive first" as low-cost, not as proven to speed learning. | [Chiviacowsky & Wulf 2007](https://eric.ed.gov/?id=EJ847344); [McKay et al. 2022 (reporting bias)](https://www.researchgate.net/publication/362637382_The_combination_of_reporting_bias_and_underpowered_study_designs_have_substantially_exaggerated_the_motor_learning_benefits_of_self-controlled_practice_and_enhanced_expectancies_A_meta-analysis) |
| Feedback after *every* trial was long thought to create dependency (guidance hypothesis); a later meta-analysis found no clear evidence for it. Per-game feedback is fine; keeping it short is the point. | [Salmoni/Winstein & Schmidt summary](https://en.cognitivepsychology.com/Psychological_Knowledge_of_Results); [McKay et al. 2022, reduced-frequency meta-analysis](https://www.researchgate.net/publication/355263800_Meta-analysis_of_reduced_relative_feedback_frequency_effect_on_motor_learning_and_performance) |
| **Outcome bias:** the same decision is rated better after a good result. A post-game review that grades the pick by the win teaches the wrong lesson. | [Baron & Hershey 1988](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/baron-hershey-jpsp1988.pdf); [replication 2025 (PMC12372742)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12372742/) |
| League coaching: one thing to work on per game; review **deaths**, not counts: "when you die matters more than how often"; a death before an objective is the costly one. | [VictoryView (2026-04)](https://victoryview.gg/blog/deaths-in-league-of-legends-the-most-underrated-stat); [Dignitas, loss streaks: review the early game and your deaths](https://dignitas.gg/articles/how-to-cope-with-a-loss-streak-in-league); [LoL Sensei, VOD review: one thing per pass (search summary)](https://www.lolsensei.com/en/blog/vod-review-self-analysis); [01-language](01-language.md) (one focus per game) |
| Single grades frustrate when opaque: players can't tell why a game was an A+ and not an S. Mobalytics itself called its per-game GPI "a bit misleading". | [GameFAQs, S-grade thread](https://gamefaqs.gamespot.com/boards/954437-league-of-legends/71791437); [LoLTheory, how grades work](https://blog.loltheory.gg/how-to-get-s-in-lol/); 03-style-month (GPI) |
| Players want contextualised, not dense, data; information density and context were the main design problems in a LoL feedback study (survey N = 175). | [Rijnders, Wallner, Bernhaupt 2022, PACM HCI](https://dl.acm.org/doi/abs/10.1145/3549506) |
| Gold difference to the lane opponent at 10/15 is the standard laning measure (Oracle's Elixir GD@10/15, CSD, XPD: player minus opponent). Team GD@15 maps strongly to wins in pro play (+750 ≈ 60 %, +1500 ≈ 70 %). It mixes in the matchup, the junglers and the result. | [Oracle's Elixir data dictionary](https://lol.timsevenhuysen.com/matchdata/match-data-dictionary/); [Pinnacle on the EGR model (2020)](https://www.pinnacle.com/en/esports-hub/betting-articles/league-of-legends/gold-difference-at-15-minutes/rqg29g3m6jhppqpc); 02-goals (lane-opponent differences cancel shared game factors) |

### One thing, not a report card

The card should answer "what do I do next game?" in one line, with at most two supporting lines. Order:

1. **Focus result** (process, own numbers): the current goal metric this game against its target. If reached or better than the player's own baseline, say so first (novices respond to positive feedback; costs nothing). Never praise the person ("great job"); name the thing.
2. **Next game:** one tip for the focus (the tips from 02-goals). Same focus across games; don't switch the point every game.
3. **Draft line** (kept from today): win chance at lock-in, as a probability, never a grade. Same wording after a win and a loss.
4. **More (closed by default):** "when you died" and "gold vs lane opponent", below.

After a **loss**, keep the card identical in structure and impersonal ("the lane vs {enemy}", not "you lost the lane"). People tune out their own failures; a fixed format and task language reduce the ego threat.

### "When you died" (from the timeline; early only)

- Use deaths before 14 minutes (02's `earlyDeaths` window): the result hasn't decided them yet.
- For each: the time, and whether the enemy took a dragon, Herald/Grubs, tower or plate within `objectiveWindowSec` after it (Match-V5 timeline `ELITE_MONSTER_KILL`, `BUILDING_KILL`, `TURRET_PLATE_DESTROYED` by the other team). Objective names come from the timeline's monster type mapped through game data, not a hand list.
- Whether the enemy jungler took part (by role, never by name) — ties it to a warding or tracking tip.
- No positions on a map at first (needs more UI); times and "what followed" are enough to act on.

### "Gold vs your lane opponent" (only with a matchup baseline)

- Show `laneGoldDiffAt14` against **the typical value for this matchup in the band**, not against zero. A −600 in a lane that's typically −500 is a normal game; the raw number blames the player for the draft.
- Needs per-matchup means of `laneGoldDiffAt14` in the snapshot (n per pair). Show only when the pair has `minGames.pair` games; else compare with the role's typical spread and say so.
- The opponent appears only as their champion (no name, no rank): within the rules.

### Post-game wording (≤ 90 characters; adds to 01's `postgame.*`)

```json
{
  "postgame.focus.met": ["Focus reached: {metric} {value} (target {target})"],
  "postgame.focus.better": ["{metric}: {value}, better than your usual {baseline}"],
  "postgame.focus.missed": ["{metric}: {value} (target {target})"],
  "postgame.next": ["Next game: {tip}"],
  "postgame.predicted": ["Win chance at lock-in: {win:pct}%. A chance, not a grade"],
  "postgame.deaths.early": ["Before {minute} min you died {count}×: at {times}"],
  "postgame.deaths.objective": ["{count} of them came right before their {objective}"],
  "postgame.deaths.jungle": ["Their jungler was in on {count} of your early deaths"],
  "postgame.deaths.none": ["No deaths before {minute} min"],
  "postgame.lane.gold": ["Gold vs their {enemy:champion} at 14: {diff}; typical here: {typical}"],
  "postgame.lane.goldRole": ["Gold vs their {enemy:champion} at 14: {diff} ({band} typical: {typical})"]
}
```

### Proposed config (engine)

```json
{
  "postgame": {
    "earlyMinute": 14,
    "objectiveWindowSec": 60,
    "maxLines": 3,
    "laneGoldMinPairGames": 30
  }
}
```

`earlyMinute` matches 02's early window; `objectiveWindowSec` 60 is opinion (a death that long before an objective takes the player out of the fight: respawn timers before 14 are ≈ 10–25 s, plus walking back); measure how often deaths precede objectives at 30/60/90 s on production data before fixing it. `laneGoldMinPairGames` should equal `minGames.pair` if that's already ≥ 30.

---

## What to measure on our data

1. **Ban value:** per band and role, the PBI-style value with and without the ban correction; check the top 3 differ from today's `threat` ranking and by how much.
2. **Counter-pick share:** from recorded LCU drafts (fixtures and, later, the advice log), how often the enemy laner locks after the player. Replaces `counterPickShare` 0.5.
3. **Early deaths before objectives:** share of pre-14 deaths followed by an enemy objective within 30/60/90 s, by role.
4. **`laneGoldDiffAt14` per matchup:** mean and n per pair per band; the share of pairs that reach 30 games.
5. **Break prompt uptake** (from users who opt in to the advice log): after a prompt, minutes until the next queue. A behaviour count, not a win rate.

## What to change in the code or config

1. **`packages/engine/src/live.ts` `suggestBans`:** compute threat in win points: `½ × pickRate / (1 − banRate)` × (strength + `counterPickShare` × significant matchup edge) for your lane, × `offRoleWeight` × strength for other lanes. Add the |z| ≥ 2 check for the counter term. New `rating.bans` fields: `counterPickShare` (0.5), `banCorrection` (true), `counterMinZ` (2).
2. **`packages/lcu/src/sanitize.ts` / `personal-coach.ts`:** pass allies' in-progress ban hovers to `suggestBans` as `exclude` (ally ban actions with `inProgress && championId > 0`).
3. **`packages/engine/src/session.ts`:** add `restMinutes` (no prompt if the last game ended ≥ that long ago) and `breakMinutes` (slot in the text); return `record: null` unless `showRecord` is true; later, optional `lossStreakBands`. Update the zod schema in `config.ts`.
4. **`config/explain.v1.json`:** replace `session.*` with the question forms above; add `session.why`, `session.queue`, `session.count`; add `ban.offRole`; switch `ban.counters*` to `{delta:per100}` (01); add the `postgame.*` keys above.
5. **`packages/engine/src/postgame.ts`:** add the focus result (metric, value, target, own baseline), the next-game tip, and the early-death lines from the timeline; cap visible lines at `postgame.maxLines`; keep the same structure for wins and losses.
6. **`packages/meta`:** add per-matchup `laneGoldDiffAt14` means with n to the snapshot (pure aggregation), so the gold line can compare with the matchup.
7. **Monthly report (03):** the tilt line is the `session.count` behaviour count.

## Self-check

- Every question in section 9 answered: bans (9.1), breaks and tilt with wording (9.2), post-game feedback, one point vs report card, "when you died" and "gold vs lane opponent" (9.3).
- Riot rules: no other player's identity (opponent and jungler by champion or role only; no scouting of enemy pools); suggest, never decide (break is a question; bans are suggestions); post-game uses only the player's own match and timeline.
- Statistics: the personal tilt record is dropped because it can't pass a significance check; counter-bans need |z| ≥ 2; gold vs opponent compared with the matchup's typical; deaths limited to before 14 to avoid result-driven totals; no correlation given as a reason (break hover states a mechanism and a hedged population finding).
- Nothing hardcoded: all numbers in text are slots; thresholds in config; objective names from timeline data.
- Templates checked under 90 characters by a script with long fills ("Aurelion Sol", band "Emerald to Diamond", a 40-character metric label, 4-digit numbers); all 5 JSON blocks parse.
- Sources: ≥ 3 independent per key claim (bans: LoLalytics, Boosting Market, Esports Talk, Dignitas, our backtest; breaks: iTero, Deng 2024, Sapienza 2018, Bikas 2023, Gee 2025 against; feedback: Kluger & DeNisi, Hattie & Timperley, Finkelstein & Fishbach, Eskreis-Winkler & Fishbach). Conflicts stated (Diamond I reversal; chess within-player null; motor-learning bias).
- Not reachable: Reddit (blocked), full texts of Deng 2024, Bikas 2023, Kou 2018 and Rijnders 2022 (ACM blocks fetching; abstracts used). A session with a browser could extract Deng's effect sizes and Bikas' per-game win-rate curve.

# Open research questions (2026-10-09)

**To start:** open a new Claude session in this repo and paste:

```
Read research/RESEARCH-QUESTIONS.md, including "How to work" at the end, and do that research as a long-running task: hours, not minutes. Work in a git worktree on a new branch research/answers so you never touch the main checkout. Use one subagent per topic (sections 1–11) for the searching, with the thorough ("extended") web search mode and full-page fetches of the best sources. Then check, merge and write each answer yourself. Start with 1–4 and 11, then 5–8, then 9–10. Write each answer to research/answers/<topic>.md and commit and push it as soon as it's done. Keep research/answers/PROGRESS.md up to date so a new session can continue where you stopped. Research only: don't change code or config.
```

For a research session. Read `CLAUDE.md`, `docs/SPEC.md`, `research/ROLE-GOALS.md`, `research/LEARNING.md` and `research/REVIEW-2026-10.md` first. Answer in `research/answers/<topic>.md`, one file per topic below. Cite every claim with a link. Mark opinion as opinion. Where a recommendation becomes config, give it as JSON that fits the current config shape.

## What every answer must respect

- **Data we have.** Per player:
  - up to 1,000 of their own games (Match-V5 participant stats, `challenges` and timelines: gold, CS, level per minute; item, skill, kill, ward and epic-monster events);
  - mastery and rank.
- **Data per band.** Per rank band, about 15–60k collected games:
  - champion and role stats, matchups, duos, builds and runes;
  - measured champion attributes: damage split, frontline, crowd control and heal percentiles, power curve, gold at 15;
  - per-role metric quantiles, and how each champion wins (won vs lost means).
- **Data Dragon and CommunityDragon** for static data (champions, spells, items, runes and their text).
- **Nothing hardcoded.** Champions, items, runes, numbers and meta all come from data or versioned config. A research answer can propose a *rule* or *category*, but not a hand-written list of champions or items.
- **Riot rules.**
  - Suggest, never decide.
  - No identities of other players.
  - Post-game and champ select only; in-game uses only what the client shows.
  - No Arena augment or item win rates.
- **Statistics.**
  - Every shown number must survive a significance check.
  - Whole-game totals follow the result (the losing team dies more), so prefer early-game numbers and habits.
  - Correlation is not a reason we can give the player; only a game mechanic or a measured effect is.

---

## 1. Coaching language: clearer sentences in League terms (priority)

**Today:** the panel's sentences are templates in `config/explain.v1.json`, filled with our numbers. Examples:

> It wins with more early gank kills: 1.4 in wins, 0.9 in losses (you: 1.1)
>
> No jungle matchup swings it much in your rank (27 measured): a safe blind pick

The owner finds some lines vague, generic or lecturing ("learn what each spell does").

**Questions:**
1. How do good coaches (high-elo coaches, coaching sites, pro analysts) phrase advice so a Gold player acts on it? Find concrete patterns: verbs, length, one idea per line, the number first or last, "you" vs "players".
2. Collect League vocabulary players use and understand by rank: "wave", "prio", "tempo", "reset", "crash", "cheater recall", "power spike", "lane state", "trade window", "gank angle". Which terms confuse Iron to Gold players, and what should we say instead?
3. How should a number be framed so it means something: percent vs "1 in 3 games", per-game counts vs per-minute rates, "you vs typical in your rank"?
4. For each line type below, propose 2–3 better templates: goal title, goal why, "keep in mind" tips, how a champion wins, matchups, power curve, skill order, gold at 15, post-game "biggest plus/minus", the break suggestion, pool gaps.
   - Keep each template under 90 characters.
   - Use slots only, no hand-written numbers.
5. What do players find patronising or useless in coaching tools? Look at reviews and Reddit threads on op.gg, Mobalytics, Blitz, Porofessor, iTero and coach apps.

**Deliverable:** a style guide (10–15 rules with examples), a vocabulary list with plain alternatives, and proposed templates per line type as JSON.

## 2. Goals per role, and accurate targets (priority)

**Today** (`packages/engine/src/growth.ts`, `research/ROLE-GOALS.md`):
- each role has a goal list;
- the goal is the metric where you're furthest below typical, weighted by how much it separates wins from losses;
- the target is halfway from your baseline to the rank median;
- progress is your last 10 games against it.

**Questions:**
1. **Targets.** Halfway to the median: how big should the step be, and should it depend on the gap, the metric's spread, or your rank? What does sports-science or deliberate-practice research say about goal size (achievable but stretching)?
2. **Rank.** Should a Gold player aim at Platinum's median instead of Gold's? How do the role metrics change from Iron to Diamond? Look for published per-rank numbers (CS at 10, deaths before 14, vision, plates).
3. **Measuring progress.** How many games do you need to tell a real improvement from noise for a count metric (deaths) vs a rate (CS at 10)? Give a statistical rule for "goal met" and for "switch goal".
4. **Choosing the goal.** Importance today is a median split of win rate, which still mixes cause and effect. Look for better methods: per-game logistic regression with game-state controls, comparing players with their lane opponent, or using only before-14-minute data. Which is feasible on our data?
5. **Per champion.** Should a goal be set per champion (Kindred's CS is not Naafiri's CS)? We now measure how each champion wins; how should the champion's typical values replace the role's?
6. **Habits vs outcomes.** Which goals are habits (control wards bought, first recall timing) and which are outcomes (CS lead)? Should beginners get habits first?
7. **Tips.** For each role and goal metric, collect the concrete, checkable actions coaches give ("place a control ward on every back before 2 items"). We have 2–3 per goal; find better ones and rank them by evidence.

**Deliverable:** a target formula with its parameters, a progress and "goal met" rule, a goal-choice method, per-rank reference values with sources, and improved tips per role and metric (JSON shaped like `explain.tips`).

## 3. Style tab and monthly report (priority)

**Today:**
- **Style:** 7 axes per role, each 0–100 against your rank: early pressure, fighting, farming, vision, staying alive, objectives, roaming. Each axis is the mean percentile of several Match-V5 metrics. Playmaking (CC) was dropped because it measured the champion's kit.
- **Monthly report:** games, win rate vs the month before, rank start → now, goals met, the axes at month start vs now, and top champions with their change.

**Questions:**
1. Which axes do players and coaches find meaningful? Is our axis set right, and is any axis really "what champion you play" rather than "how you play"? Damage share, kill participation and CC all depend on the champion. How do Mobalytics' GPI and similar scores define their axes, and what criticism do they get?
2. Should axes be measured against the same **champion's** typical instead of the role's, so kit doesn't decide the score? Is our data enough for that?
3. Which metric per axis is the most reliable and least confounded by winning? Use the "early / habit / whole-game" split from ROLE-GOALS.
4. **Monthly report:** what do players want to see after a month?
   - rank and LP trend;
   - consistency (spread of performance);
   - champion pool health;
   - goals met;
   - tilt patterns (results after losses);
   - time of day.

   What's motivating and what's discouraging (e.g. a falling axis)?
5. How should "trend" be shown honestly? Over 40 games, a change of how many points is real?

**Deliverable:** a recommended axis set with metrics per axis and per role; a decision on champion- vs role-relative scoring; a monthly report layout (what to show, in what order, with the statistical rule for "changed").

## 4. Runes in champ select: valid suggestions with real reasons (priority)

**Today:**
- the rune page comes from the best common page for your champion and role in your rank (win rate, share);
- "swap in" suggestions come from **lift**: a rune taken more often against teams high in a trait (physical, magic, frontline, engage, heal), now with a significance check (z ≥ 2) and only from the page's two trees.

The owner's point: "more people take it against physical teams" is why the algorithm noticed it, not a reason to give the player.

**Questions:**
1. Which rune decisions really depend on the enemy team or lane opponent, according to game mechanics and expert guides? Examples:
   - Second Wind vs poke;
   - Bone Plating vs burst;
   - Conditioning vs long fights;
   - Unflinching / Legend: Tenacity vs crowd control;
   - armor vs magic resist shards;
   - Cleanse/Exhaust/Ignite summoner choices;
   - keystone by matchup (Grasp vs Conqueror vs Phase Rush).

   Map each decision to the enemy trait it answers and the mechanic behind it.
2. Can we tell what a rune does **from data, not a hand list**? Look at CommunityDragon `perks.json` (stat IDs, tooltips), Data Dragon `runesReforged.json` and their fields. Is there a reliable way to tag runes (e.g. "reduces damage taken from champions", "heals", "tenacity") so a rule like "vs heavy crowd control → tenacity runes" works for every patch?
3. How should a suggestion be explained? Give the mechanic, then the measured backing. For example: "Their team has 3 champions with hard crowd control → Unflinching (tenacity): players on this champion take it 2× as often into such teams, and win 2% more with it." What evidence threshold makes the second half honest?
4. When should we suggest a different **keystone** or **secondary tree**, not just one rune? What's the evidence that matchup-specific pages beat the standard page in solo queue?
5. Stat shards: what do sites (u.gg, Mobalytics, op.gg) recommend by matchup, and why?

**Deliverable:**
- a table of rune decisions → enemy trait → mechanic → how to detect the trait from our data;
- a method to tag runes from CDragon or Data Dragon fields (with examples on the current patch);
- explanation templates;
- the evidence rule.

The same structure should work for situational items (section 5).

---

## 5. Items: the item engine (second)

**Today:** items are ranked by "win added" (the result minus the expected win for the game state at purchase time). On production data:
- our #1 matches the most-bought item less often than popularity itself does (46.9% vs 49.2% top-1);
- purchases of our #1 go with +0.5 points of win chance, against −0.2 otherwise.

**Questions:**
1. How do the big sites rank items (pick rate, win rate, "build order" vs "core")? What criticism is there of win rate for items (purchase-time bias, game state, item order)?
2. Is "win added at purchase time" a known method? Look for better ones: matched pairs on game state, propensity scores, or the order of the first three items as one choice.
3. **Situational items:** like section 4, map each item decision to the enemy trait and mechanic (Grievous Wounds vs healing, Mercury's Treads vs crowd control, armor vs physical). Can item tags come from Data Dragon (`tags`, `stats`, description), with no hand list?
4. **First item timing and power spikes:** what's a meaningful "your first item at 14:30 vs typical 13:10" comparison?

**Deliverable:** an item ranking method with its statistical basis, situational item rules from data tags, and the explanation format.

## 6. The draft engine: what really predicts a solo-queue win (second)

**Today:** on 13,414 production games, the draft terms barely beat a coin flip after we smoothed matchups and duos (log-loss 0.6928 vs 0.6932). The biggest real effect is the player's own experience on the champion (our learning curve: about 45% under 20 games, about 54% after).

**Questions:**
1. What does published research find about how much the draft predicts in solo queue? Look for draft models, win prediction from champions only, and the effect of matchups vs synergy vs team composition. Find the best achievable accuracy with champions only.
2. **Mastery effect:** use [iTero's study of 1M+ games](https://www.itero.gg/articles/mastery-a-statistical-summary) and Riot's dev blog on mastery curves. What's the win-rate effect of games or mastery on a champion, by champion difficulty? Could we use the published per-champion curve shapes as priors (no hand lists: as a formula of difficulty or measured data)?
3. **Matchups from early stats** (gold or CS at 10–15) instead of win/loss: is that a known, better signal? How many games per matchup are needed?
4. **Patch changes:** how do sites handle a new patch? Detecting which champions or items changed by diffing Data Dragon between versions: what fields change, is it reliable, and how fast does a changed champion's win rate settle?
5. **Off-role and autofill:** what's the measured cost of playing a champion in a role you rarely play?

**Deliverable:** a ranked list of draft signals with expected effect sizes and sources, priors for the personal term, a patch-diff method, and what to drop.

## 7. Learning a new champion (second)

**Questions:**
1. What helps players learn a champion fastest? Practice Tool vs normal games vs ranked, number of games in a row, watching replays or one-tricks.
2. Which **facts about a champion** help a learner most? Power spikes, skill order, combos, matchups to avoid, what the champion "wants" (lane, skirmish, scale). Which of these can we derive from our data, and which would need text we can't hardcode? Could CommunityDragon's spell data (cooldowns, ranges) give "its strong window is when Q is up (every 8 s)"?
3. How should a new champion be **recommended**? We use similarity to your main or comfortable champions, pool gaps, meta strength and ease. Is there evidence for "similar champions transfer skill"?

**Deliverable:** what to show while learning (ranked by evidence), what we can derive from data, and the recommendation method.

## 8. Power spikes (second, milestone 8)

**Today:** item spikes on 10,336 production games turned out to be the champion's game phase. Item-specific spikes are noise today (r 0.07–0.16).

**Questions:**
1. How do others measure power spikes (win rate by game minute, by item count, by level)? Are there published methods that separate "item X" from "game phase"?
2. Is "fights won within N minutes after the purchase" (from kill events) a known metric? How many games does it need?
3. What do players use spike information for in practice, and what's the minimum useful form ("strongest from about minute 18")?

**Deliverable:** a measurement method with sample-size estimates, and the minimum version worth shipping.

## 9. Bans, breaks, post-game (third)

1. **Bans in solo queue:** ban your own counters, the meta's best, or what your team can't handle? Is there evidence?
2. **Breaks and tilt:** what does research (gaming or psychology) say about loss streaks, session length and performance? Is "take a break after 2 losses" supported, and what's the best wording?
3. **Post-game:** what feedback after a game do players value (one thing, not a report card)? How do "when you died" and "your gold vs your lane opponent" insights land?

## 10. Riot policy and product numbers (before the friends release)

1. **Riot's developer policies** for coaching apps in 2026:
   - What exactly is allowed in champ select and in game?
   - What do apps like Porofessor, Mobalytics and Blitz do that we may or may not do?
   - The production key application: what does Riot ask for, how long does it take, and what are the rate limits?
2. **How to measure that the coach helps** without A/B testing on a handful of friends. Candidates: champion-pool health, goals met, win rate on comfort vs off-pool picks, rank trend. What do other tools report?

---

## 11. More data than the Riot API (priority)

**Today:** our data comes from the Riot API (personal key: 100 calls per 2 minutes, one region), Data Dragon, CommunityDragon and the local League client (LCU, reads only). The key's rate limit is the bottleneck: power spikes need about 60–100k games, per-champion numbers need more, and a public release needs a production key.

**Questions:**
1. **Open datasets of League games:**
   - Kaggle, Hugging Face, GitHub, academic datasets (DraftRec, the "LoL ranked games" sets, Zilean's data, …).
   - For each:
     - size;
     - patch or season;
     - ranks and regions;
     - what fields (draft only, end-of-game stats, timelines);
     - licence;
     - how fresh.
   - Is any of it current enough (patch 16.x / 2026) to use for meta, or only for methods and priors (e.g. learning curves, which change slowly)?
2. **Public APIs that serve League data:**
   - official ones: Riot's other APIs (Challenges-V1, Clash, Spectator-V5, League-Exp-V4, Account-V1 for other regions);
   - third-party ones with a documented API:
     - Mobalytics, op.gg, u.gg, lolalytics;
     - Blitz, Porofessor;
     - iTero;
     - Leaguepedia (pro games);
     - Oracle's Elixir (pro games CSVs);
     - Meraki Analytics (clean static champion and item data).
   - For each:
     - what it serves;
     - rate limits;
     - terms of use (may a coaching app use it, may we store it);
     - whether it needs a key or partnership;
     - how stable it is.
   - **Mark clearly anything that is scraping or against terms: we won't use those.**
3. **Aggregated stats we could use as priors** without collecting them ourselves: champion win rates by rank, matchup tables, mastery curves, item and rune win rates. Who publishes them openly (with an API or download) and under what licence?
4. **More from Riot itself:**
   - What does a production key give (rate limits, regions) and what does Riot require for it?
   - Can one app use several regions to collect more games (EUW + EUNE + NA)?
   - Are there Riot data programs or partnerships for analytics apps?
   - What's allowed on caching and storing Match-V5 data?
5. **More from the local client (LCU, reads only):**
   - What else does it expose that we don't use? Candidates:
     - match history beyond Match-V5 (customs, other modes);
     - challenges;
     - the player's own stats;
     - honor;
     - champ select timers;
     - replay files (.rofl: can their data be read, and is that allowed?).
   - What is documented (Hextech docs, lcu-explorer), and what does Riot allow?
6. **The Live Client Data API (in game, milestone 10):** exactly what fields are available, how often, and what Riot allows a coaching app to do with them.
7. **Crowd data:** could our users' own games (with consent, anonymous) feed the meta instead of only the collector? What do privacy rules and Riot's policies say?

**Deliverable:** a table of every source (what, freshness, size, cost, terms: allowed / unclear / not allowed, how to access), a short list of the 3–5 worth adding with the work each needs, and what to ask Riot for at the production key.

## How to work

### Depth (this is a long-running task)

- **Plan first.** For each topic, list the sub-questions and where answers are likely to be before searching: coaching sites, Riot dev blogs and developer docs, papers (Google Scholar, arXiv), GitHub, Kaggle, Reddit (r/summonerschool, r/leagueoflegends), competitor docs and changelogs.
- **Search wide, then deep.** Use the thorough web search mode. Fetch the full page of every source you rely on, not just the snippet. Follow good sources to their own sources.
- **Bar for an answer:**
  - at least 3 independent sources per key claim (1 is enough for official Riot docs);
  - conflicting views stated, with which is better supported and why;
  - dates noted (anything from before 2024 is checked against the current game).
- **Self-check before finishing a topic:**
  - every question answered, or marked "no evidence found" with what was searched;
  - every recommendation fits "What every answer must respect";
  - every config proposal is valid JSON in our shapes.
- **Save as you go.**
  - Commit and push each answer file when it's done.
  - Keep research/answers/PROGRESS.md: topics done, in progress, open leads.
  - If the session stops, a new one continues from PROGRESS.md.
- **Use subagents for breadth:** one per topic for searching and reading. The main session checks their findings, removes duplicates, and writes the answer.
- **Don't guess.** "We don't know" with what was tried beats a confident guess.

### Scope and order

- Start with sections 1–4 and 11 (owner priority), then 5–8, then 9–10.
- For each: search widely (coaching sites, Riot dev blogs, research papers, Reddit, competitor docs), then check claims against our data constraints.
- Where a question needs our own data to answer, say exactly what to measure, and we'll run it on the production copy.
- End each answer with a short "what to change in the code or config" list.

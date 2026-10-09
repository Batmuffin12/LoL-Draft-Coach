# 1. Coaching language: clearer sentences in League terms

Research run 2026-10-09. Status: **done (first full pass)**; open leads at the end.

**Access note.** reddit.com (all hosts), mobalytics.gg, gamefaqs.com and medium.com block our fetcher, and the search tool refuses `reddit.com` as a domain. So Reddit threads, GameFAQs threads and Mobalytics' own pages are seen only through search-engine summaries or third-party write-ups. Where a claim rests on such a summary, it says so. Question 5 is the weakest part of this answer for that reason.

**Short answer.**
- Good League coaching lines have one shape: **when X happens, do Y** (a game cue, then a verb), one idea per line, about the player's next game. This matches the strongest behaviour-change evidence we found (if-then plans, d ≈ 0.65 over 94 tests).
- Numbers land best as **counts out of a fixed number** ("4 of your last 10 games", "3 more wins per 100 games"), not as percentage-point deltas ("+2.1%") or "1 in X". Win-rate decimals are noise at our sample sizes.
- Lead with a **word that carries the verdict** ("Favoured", "Hard", "Safe to pick first") and put the number after it. People scanning a list read about two words.
- The lines that read as lecturing are the ones that are **obvious, not checkable, or about the player instead of the game** ("learn what each spell does", "a short break usually helps"). The fix is a concrete cue and a concrete action, or the player's own number.
- Several of our current lines give a **correlation as the reason** ("players on the better half win X points more"). The spec's statistics rule forbids that. Give the game mechanic as the reason, and the numbers as size, not cause.

---

## Q1. How good coaches phrase advice so a Gold player acts on it

### What we found

| Pattern | Evidence | Sources |
| --- | --- | --- |
| **Condition first, then a verb.** Coaches write "If the wave has just crashed into their tower, move…", "When your opponent recalls, push the wave in before rotating", "Can my lane opponent kill me if I overextend?". | Seen in every League guide we read in full. Outside League, if-then plans ("implementation intentions") are among the strongest single behaviour-change techniques: d = 0.65 across 94 tests. In sport the evidence is mixed: about a dozen small experiments, with results that depend on the athlete's beliefs. | [LoL Sensei mid guide (2026-08)](https://www.lolsensei.com/en/blog/mid-lane-guide), [Dignitas on priority (2021-06)](https://dignitas.gg/articles/priority-and-its-importance-in-league-of-legends), [LoL Theory wave guide (2026-08)](https://blog.loltheory.gg/wave-management-league-of-legends/), [Gollwitzer & Sheeran 2006](https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes), [Hirsch et al. 2020, if-then plans in an endurance task](https://pmc.ncbi.nlm.nih.gov/articles/PMC7177509) |
| **One focus per game, a short list per coaching session.** | Dignitas: "write down what you want to learn this game", then check it afterwards. Paid-coaching pages promise "a short list of things to drill" and "clear points to work on before the next session". In sport coaching, verbal cues are kept to one or two words and the number of instructions is kept "minimal". | [Dignitas fundamentals (2020-09)](https://dignitas.gg/articles/the-fundamentals-for-improving-at-league-of-legends-as-an-average-player), [WeCoach service page](https://wecoach.gg/league-of-legends), [WeCoach blog (2025-05)](https://wecoach.gg/blog/article/should-i-get-league-of-legends-coaching), [NSCA: instructions and cues for sprinting](https://www.nsca.com/contentassets/149a04fefb5340d4914290480580b1d6/coaching-instructions-and-cues-for-enhancing-sprint-performance.pdf), [Benz et al., verbal instructions and cues](https://www.researchgate.net/profile/Adam-Benz/publication/268505943_Verbal_Instructions_and_Cues_Providing_These_for_Enhancement_of_Athletic_Performance/links/546cedac0cf26e95bc3ca981/Verbal-Instructions-and-Cues-Providing-These-for-Enhancement-of-Athletic-Performance.pdf) |
| **Point at the game, not at the player.** Good cues name something on the screen (the wave, the tower, a ward, the enemy jungler), not the player's body or character ("be more careful"). | Motor learning: an "external focus" (on the effect in the world) beats an "internal" one across tasks, skill levels and ages. Feedback research: feedback about the task helps on average, while feedback that draws attention to the self ("you're bad at…") lowers performance in over a third of cases. | [Wulf, 15-year review (2013)](https://gwulf.faculty.unlv.edu/wp-content/uploads/2018/11/Wulf_AF_review_2013.pdf), [Kluger & DeNisi 1996 meta-analysis](https://www.mrbartonmaths.com/resourcesnew/8.%20Research/Marking%20and%20Feedback/The%20effects%20of%20feedback%20interventions.pdf), [Hattie & Timperley 2007](https://journals.sagepub.com/doi/abs/10.3102/003465430298487) |
| **Specific beats general.** Coaches avoid "ward more"; they say where and when. Riot found that telling a penalised player exactly what they did changed behaviour more than a general warning. | Coaching pages; Riot's 2013 GDC talk on reform cards. | [WeCoach](https://wecoach.gg/blog/article/is-league-of-legends-coaching-worth-it-an-in-depth-evaluation), [Riot at GDC 2013 (Game Developer)](https://www.gamedeveloper.com/design/gdc-riot-experimentally-investigates-online-toxicity), [NN/g: be specific, plain words](https://www.nngroup.com/articles/first-2-words-a-signal-for-scanning/) |
| **"You" for your own data and actions; "players in Gold" for others' data.** | Tailored messages ("you", your numbers) beat generic ones, but only a little (r ≈ 0.07 over 57 studies). Coaches address the student as "you". Saying "you" about a population number would be dishonest, so name the group. | [Noar et al. 2007](https://pubmed.ncbi.nlm.nih.gov/17592961/) |
| **Suggest; don't command.** Avoid "must", "always", "never" in advice. | Mixed evidence. Controlling words ("must", "should") raised reactance and lowered persuasion in several health-message studies. A 2019 experiment (n = 606) found no effect of "could" vs "should" when people were already motivated. Boxing coaches whose feedback was less controlling and more positive were more often in winning corners (correlational). **Reading:** imperatives are fine in a tip the player chose to follow; absolutes and "should" are not needed anywhere. | [Altendorf et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6393822/), [reactance and controlling language](https://www.researchgate.net/publication/303429945_Persuasion_and_Psychological_Reactance_The_Effects_of_Explicit_High-Controlling_Language), [Halperin, Wulf et al. 2016, boxing corners](https://gwulf.faculty.unlv.edu/wp-content/uploads/2014/05/Halperin_Wulf_coaching_cues_boxing_PSE_20161.pdf) |
| **Number placement: verdict word first, number second.** | People scanning a list see about the first two words (about 11 characters). Numerals catch the eye even inside skipped text. So the first words must carry the meaning; the number can come later and still be seen. | [NN/g: first 2 words (2009)](https://www.nngroup.com/articles/first-2-words-a-signal-for-scanning/), [NN/g: show numbers as numerals (2007)](https://www.nngroup.com/articles/web-writing-show-numbers-as-numerals/) |

**Conflicting views.**
- *Autonomy-supportive wording.* OPTIMAL theory (Wulf & Lewthwaite) says choice and supportive wording improve learning. A 2023 meta-analysis (McKay et al.) found these benefits were inflated by small studies and reporting bias, and a 2024 review found few of the studies measured motivation at all. The external-focus finding is the better supported of the three. We use autonomy only as a tone rule (no "must"), not as a promise of better learning. Sources: [OPTIMAL theory](https://gwulf.faculty.unlv.edu/wp-content/uploads/2014/05/Wulf_Lewthwaite_OPTIMAL_Theory_2016.pdf), [McKay et al. 2023](https://raw.github.com/cartermaclab/carterlab-papers/main/2023_mckay-etal_the-combination-of-reporting-bias-and-underpowered-study-designs-has-substantially-exaggerated-the-motor-learning-benefits-of.pdf), [Is the motivational pillar of OPTIMAL theory motivating? (SportRxiv)](https://sportrxiv.org/index.php/server/preprint/view/390).
- *Gain vs loss framing* ("you gain a wave" vs "you lose a wave"): a meta-analysis of 93 studies found gain frames only slightly more persuasive for prevention behaviours (r = 0.03, mostly from dental-hygiene studies); a 2019 sport-messaging experiment found few effects at all. Not worth a rule. Sources: [O'Keefe & Jensen 2007](https://pubmed.ncbi.nlm.nih.gov/17934941/), [Littlejohn & Young 2019](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.00431/epub).

**Length.** No League source gives a number. Sport cues are one or two words; our panel has more room. Our existing 90-character cap per line is a fair compromise, and tips should aim at about 60 (one clause plus one action). This is opinion, based on the scanning and cue evidence above.

---

## Q2. League vocabulary: what Iron to Gold players understand

**How we judged it.** There's no survey of term understanding by rank. We used two proxies:
1. whether **beginner glossaries** define the term at all (four checked: [LoL Theory (2026-08)](https://blog.loltheory.gg/league-of-legends-terminology/), [MetaBot (2026-10)](https://metabot.gg/en/league/guides/terms-glossary-acronyms), [Hotspawn (2026-04)](https://www.hotspawn.com/league-of-legends/guide/league-of-legends-terms), [Disciplined Jungler lexicon](https://disciplinedjungler.com/lexicon/));
2. whether their **definitions agree**. When four glossaries define a word four ways, a Gold player won't read it the way we mean it.

Coaching sources also say wave control isn't well understood below Gold. LoL Theory: "In Silver and below, you can freeze and opponents often have no idea how to respond". MetaBot: "Bronze–Gold: micro mistakes bottleneck; Plat+: macro decides games". Low-quality SEO coaching pages say the same; we count them only as weak support ([League Coach Merch](https://www.leaguecoachmerch.com/league-coaching-for-low-elo/)).
| Term | In beginner glossaries? | Do definitions agree? | Use it? | Say instead (or with it) |
| --- | --- | --- | --- | --- |
| wave / minion wave | 4 of 4 | yes | **yes** | "wave" |
| CS / last-hit | 4 of 4 | yes | **yes** | "CS", "last-hit" |
| recall / back | 4 of 4 | yes | **yes** | "recall" |
| gank | 4 of 4 | yes | **yes** | "gank" |
| power spike | 3 of 4 | yes | **yes**, with what it is | "strong from its first item", "strong at level 6" |
| trade | 3 of 4 | partly (lane trade, or trading objectives across the map) | **yes in lane context** | "trade (hit them while they hit you)" in tips only |
| AD / AP | defined everywhere; the shop uses it | yes | **yes**; shorter than "physical/magic damage" | "AP champion", "full AD team" |
| CC / engage / tank | yes | yes | **yes** | "CC", "engage", "tank" |
| freeze / slow push / shove (crash) | 3 of 4 | **no**: Hotspawn's "freeze" and "slow push" contradict LoL Theory's | **only with the action spelled out** | "keep the wave near your tower", "let your wave build up", "push the wave into their tower" |
| prio / priority | 3 of 4 (not MetaBot) | roughly ("can move first") | **avoid in short lines** | "your wave is pushed, so you can move first" |
| tempo | 3 of 4 | **no**: "timing over the opponent", "who has the initiative", "time after a full clear" | **avoid** | name the action: "you can take a camp or plate before they're back" |
| reset | 2 of 4 | **no**: recall; the wave bouncing back; regrouping after a fight | **avoid** | "recall", "the wave bounces back" |
| bounce | 2 of 4 | yes | only in tips that explain it | "the wave pushes back toward you" |
| cheater recall | 0 of 4 (LS's term; advanced guides only) | n/a | **avoid** | "recall after you shove the wave in; you miss nothing" |
| lane state | 0 of 4 | n/a | **avoid** | "where the wave is" |
| trade window | 0 of 4 | n/a | **avoid** | "when their key spell is down" |
| gank angle | 0 of 4 | n/a | **avoid** | "come from behind them, not up the lane" |
| plates | 1 of 4 | yes | **yes**; the client shows plates | "turret plates" |
| tri-brush, pixel brush | 0 of 4 | n/a | only in tips for that role | "the three bushes near top/bot river" |
| sweeper / control ward | yes | yes | **yes** | |
| "matchup delta", "lift", "GD@15" (site jargon) | stat sites only; Lolalytics needs a help page for its two kinds of delta | n/a | **avoid** | "more wins per 100 games", "taken twice as often", "gold up at {minute} min" |
| our own: "the better half", "spreads", "points" | n/a | n/a | **avoid** | see Q3 |

Sources for the stat-site jargon: [Lolalytics delta explained (blog)](https://strugglestreet517728256.wordpress.com/2018/04/10/season-8-games-168-173-what-is-matchup-delta/), [u.gg counter pages (GD15)](https://u.gg/lol/champions/sett/counter). Tempo definitions: [Hotspawn](https://www.hotspawn.com/league-of-legends/guide/league-of-legends-terms), [MetaBot](https://metabot.gg/en/league/guides/terms-glossary-acronyms), [Disciplined Jungler](https://disciplinedjungler.com/lexicon/), [LoL Sensei](https://www.lolsensei.com/en/blog/mid-lane-guide).

**Rule of thumb:** if a term names something the **client shows** (wave, CS, plates, wards, AD/AP, Flash, level), use it. If it names a **plan** (tempo, prio, lane state, cheater recall), say the action instead.

**Worth testing with the friends group (cheap, 10 minutes):** show five people ten lines and ask each to say in their own words what the line tells them to do. Count misreadings per line. That would replace our glossary proxy with real evidence for our users.

---

## Q3. How to frame a number so it means something

| Question | Finding | Sources |
| --- | --- | --- |
| Percent or "1 in 3"? | **Counts out of a fixed number** ("3 of 10", "30 of 100") are understood better than percentages, by both experts and lay people (Cochrane review, 35 studies). But **"1 in X"** makes a risk feel bigger than the same "N in X·N" (seven experiments; meta-analysis g = 0.42). So use "N of M" with a fixed M, not "1 in 3". | [Cochrane, Akl et al. 2011](https://www.cochrane.org/evidence/CD006776_using-different-statistical-formats-presenting-health-information), [Gigerenzer, What are natural frequencies? (2011)](http://library.mpib-berlin.mpg.de/ft/gg/gg_what_2011.pdf), [1-in-X effect (Pighin et al.)](https://ideas.repec.org/a/sae/medema/v38y2018i3p366-376.html) |
| Win-rate differences | "+2.1%" is ambiguous: percent or percentage points? The two are routinely blurred, even by journalists. "**2 more wins per 100 games**" says the same thing with no ambiguity. Relative numbers ("2× as often") feel bigger and persuade more, but don't improve understanding; and about half of people misread large relative changes ("110% more" read as 10% more), numerate or not. Give the base rate with them. | [Ipsos statistics research](https://www.ipsos.com/en-uk/ipsos-statistics-research), [percent vs points explainer](https://codesignal.com/learn/courses/percentages-in-news-and-statistics/lessons/percent-versus-percentage-points), [Fisher & Mormann 2022, off-by-100% bias](https://www.smu.edu/cox/coxtoday-magazine/2022-02-28-consumer-marketing-math-even-the-numerate-are-off-by-100), [Cochrane](https://www.cochrane.org/evidence/CD006776_using-different-statistical-formats-presenting-health-information) |
| Decimals | At 1,000 games a win rate has a standard error of about 1.6 points (√(0.25/1000)); at 200 games, about 3.5. A first decimal ("51.3%") is noise, and so is "+0.4%". **Whole numbers.** iTero makes the same point for players: "67% of 3 games… might as well read 'between 0–100%'". | arithmetic; [iTero, how useful is a champion's win rate (2023)](https://www.itero.gg/articles/how-useful-is-a-champions-win-rate) |
| Per game or per minute? | Coaches and benchmark pages use both: **CS at 10 min** and **CS per minute**. Per-minute rates mix in the late game and game length; a count by a fixed minute ("by 10 min", "before 14 min") doesn't, and a player can check it on the in-game clock. This also fits the spec's rule to prefer early numbers. Use counts by a fixed minute for goals, per-minute only for vision score and CS over the whole game, and say "a game" for averages ("1.4 deaths a game"). | [Boosting Market CS by rank](https://boostingmarket.com/blogs/lol-cs-per-minute-by-rank/), [High Ground Gaming CS/min](https://www.highgroundgaming.com/good-cs-per-minute-lol/), [WeCoach CS guide](https://wecoach.gg/blog/article/how-to-cs-better-in-league-of-legends) |
| "You vs typical in your rank" | Show both numbers, **and** a verdict word. In the classic energy-bill study, telling people only the average pulled those who were *better* than average back toward it (the "boomerang"). Adding an evaluative sign (a smiley) stopped that. Our playstyle levels ("Strength", "Room to grow") already do this. Keep them, and never show a comparison without one. | [Schultz et al. 2007 (summary)](https://www.bitbybitbook.com/en/running-experiments/beyond-simple/), [Schultz et al. 2018 reprise](https://www.scranton.edu/faculty/nolan/pdfs/social-norms-reprise_perspectives_schultz-et-al2018.pdf) |
| Name the group | "Typical in your rank" is vaguer than "typical in Gold". Use the band name ({band}). Call a median "typical", not "average". | opinion, from the specificity evidence in Q1 |
| Sample size in the line | "(27 measured)" or "(1,204 games)" in every line is noise to a Gold player: role-specific, in-context numbers are what players want ([Sharpe et al. 2025, focus groups](https://journals.sagepub.com/doi/10.1177/17479541251381652)). Show the sample only when it's **thin** ("few games yet") and put exact counts in the hover. | opinion, built on the scanning evidence |

**Number rules in one place:**
1. Win-rate differences: whole numbers, "N more wins per 100 games", the direction in words ("more"/"fewer"), never a signed percent.
2. Shares: whole percent ("42% of players"), or "N of your last M games" for the player's own record.
3. Counts: "1.4 a game" for averages under 10 (one decimal); whole numbers from 10 up (CS, gold).
4. Gold: round to the nearest 50 or 100 ("about 400 gold up"). A plate's worth of noise isn't a fact.
5. Never "1 in X". Never a relative number ("2×") without the base ("taken in 6 of 10 games, vs 3 of 10 usually").
6. A number that fails the significance check is not shown; the line says "about even" or is dropped.

---

## Q4. Better templates per line type

Rules used: under 90 characters (checked with long fills: "Aurelion Sol", metric labels up to 40 characters, band "Emerald"); slots only, no hand-written numbers; first two words carry the verdict.

**New slot format needed:** `{x:per100}`. A 0..1 difference shown as a **whole, unsigned** number per 100 games (0.021 → "2"); the template's words carry the direction. Below 0.5, the engine should not produce the line at all (rule 6). "per 100" in a template is the unit of that slot, like "%" after `{x:pct}`, not a data number. If the owner prefers no digits in templates at all, the formatter can append the unit itself (`{delta:per100}` → "2 more wins per 100 games" would then need direction-specific formats, so we kept the unit in the template). **New slots:** `{minute}` (from the metric's definition), `{lateMin}`/`{earlyMin}` (the power-curve split, from config), `{met}`, `{need}`, `{tip}`, `{wins}` where marked. Every one comes from engine or config numbers.

Each line type lists the current template, what's wrong with it, and 2–3 options (first = recommended).

### Goal title (`growth.title.*`)
Now: "More early gank kills" / "Fewer deaths before 14 min". It names a stat, not something to do, and has no target.
```json
{
  "growth.title.more": ["Get to {target} {metric}", "Aim for {target}+ {metric}"],
  "growth.title.less": ["Keep {metric} to {target} or fewer", "{target} or fewer {metric}"],
  "growth.title.<metric> (optional per-metric override, new)": {
    "growth.title.earlyDeaths": "{target} or fewer deaths before {minute} min",
    "growth.title.challenges.laneMinionsFirst10Minutes": "Last-hit {target} minions by {minute} min",
    "growth.title.challenges.controlWardsPlaced": "Place {target} control wards a game"
  }
}
```

### Goal why (`growth.why.*`)
Now: "Why this: in {band}, {role} players on the better half here win {gap:pct} points more of their games than the other half." It's 100+ characters, "the better half" and "points" are our jargon, and the reason given is a correlation, which the spec's statistics rule forbids as a reason. **Replace it with the mechanic (per metric, wording only) plus your number against typical.** The win gap can stay in the hover, labelled as a link, not a cause.
```json
{
  "growth.why.size": ["You: {you}. Typical {role} in {band}: {typical}", "{band} {role} players get {typical}; you get {you}"],
  "growth.why.size.games": ["You: {you}. Typical {role} in your games: {typical}"],
  "growth.why.<metric> (new, wording only)": {
    "growth.why.earlyDeaths": "Each early death hands your opponent gold, XP and a free wave",
    "growth.why.challenges.laneMinionsFirst10Minutes": "Minions are most of your lane gold: missed CS delays your first item",
    "growth.why.challenges.controlWardsPlaced": "A control ward shows and disables enemy wards near it until it's killed",
    "growth.why.challenges.killsOnLanersEarlyJungleAsJungler": "An early gank kill puts a lane ahead and frees you to take objectives",
    "growth.why.challenges.jungleCsBefore10Minutes": "Camps are your income: missed camps mean a lower level at the next fight",
    "growth.why.challenges.visionScorePerMinute": "Wards show ganks and objective setups before they happen",
    "growth.why.challenges.turretPlatesTaken": "Plates are extra gold that only exists early: take them while you can"
  },
  "growth.why.hover (new)": ["{band} games above typical here: {gap:per100} more wins per 100 (a link, not a cause)"]
}
```

### "Keep in mind" tips (`tips.<role>:<metric>`)
Most current tips already follow the coach pattern. Section 2 owns which tips to give; this section only gives the **form**:
- **When {cue}, {verb} {object}.** A cue the player can see on screen, one action.
- At most about 60 characters. No numbers that aren't game-clock or engine numbers.
- No tips about the score itself ("Wards in unwarded spots score more…" teaches gaming the metric; the Mobalytics position quoted by [TurboSmurfs (2026-08)](https://turbosmurfs.gg/article/vision-score-in-league-of-legends-guide-and-tips-to-improve) is "don't aim for a number").
- Label: "This game, try" instead of "Keep in mind" (an action, and a single game).

Rewrites of the weakest current ones (same JSON shape as `explain.tips`):
```json
{
  "middle:challenges.laneMinionsFirst10Minutes": [
    "Shove the wave before you roam so you lose no minions.",
    "Recall right after you push a cannon wave into their tower."
  ],
  "bottom:challenges.takedownsFirstXMinutes": [
    "Fight when you hit a level first or their key spell is down."
  ],
  "utility:challenges.visionScorePerMinute": [
    "Ward where their jungler walks next, not next to another ward."
  ],
  "top:laneGoldDiffAt14": [
    "Trade when your wave is bigger than theirs.",
    "After a kill or their recall, hit the tower before you back."
  ]
}
```

### How a champion wins (`newchamp.learn.win.*`)
Now: "It wins with more early gank kills: 1.4 in wins, 0.9 in losses (you: 1.1)". "It wins with" implies a cause, "it" is vague, and three bare numbers follow. Fix: a header line that says what the list is, then short rows. Only early or habit metrics belong here, since whole-game totals follow the result.
```json
{
  "newchamp.learn.wins.head (new)": ["What its won games in {band} have more of"],
  "newchamp.learn.win.more.you": [
    "{metric}: {winners} in wins, {losers} in losses · you {you}",
    "Winning {champion:champion} players: {winners} {metric}. You: {you}",
    "Its wins in {band} average {winners} {metric}; its losses {losers}"
  ],
  "newchamp.learn.win.more": ["{metric}: {winners} in wins, {losers} in losses"]
}
```

### Matchups (`lane.*`, `counter.*`, `synergy.*`, `blind.*`, `newchamp.learn.evenMatchups`)
Now: "+2.1% into Darius (412 games)"; "No jungle matchup swings it much in your rank (27 measured): a safe blind pick". Signed percents, a decimal, and the sample in every line.
```json
{
  "lane.good": ["Favoured vs {enemy:champion}: {delta:per100} more wins per 100 games", "Good lane vs {enemy:champion} ({delta:per100} more wins per 100)"],
  "lane.bad": ["Hard vs {enemy:champion}: {delta:per100} fewer wins per 100 games", "Tough lane vs {enemy:champion} ({delta:per100} fewer wins per 100)"],
  "lane.even (new)": ["About even vs {enemy:champion}"],
  "counter.good": ["Good into their {enemy:champion}: {delta:per100} more wins per 100"],
  "counter.bad": ["Weak into their {enemy:champion}: {delta:per100} fewer wins per 100"],
  "synergy.good": ["Pairs well with your {ally:champion}: {delta:per100} more wins per 100"],
  "blind.safe": ["Safe to pick first: its worst common {role} matchup costs {worst:per100} per 100", "Safe first pick: no common {role} counter"],
  "blind.risky": ["Risky to pick first: {enemy:champion} beats it ({delta:per100} fewer wins per 100)"],
  "newchamp.learn.evenMatchups": ["Safe to pick first: none of its {count} {role} matchups in {band} is lopsided", "No {role} counter in {band}: safe to pick first"],
  "plan.lane.hard": ["Hard lane vs {enemy:champion}: farm safe and ping your jungler when they push"]
}
```

### Power curve (`power.*`, `newchamp.learn.late/early/evenCurve`)
Now: "Scales: wins 53.1% of long games vs 48.2% of short ones". "Long" and "short" are undefined; decimals.
```json
{
  "power.late": ["Stronger late: wins {late:pct}% of games over {lateMin} min, {early:pct}% of shorter", "Scales: wins more of long games ({late:pct}%) than short ones ({early:pct}%)"],
  "power.early": ["Stronger early: wins {early:pct}% of games under {earlyMin} min, {late:pct}% of longer"],
  "newchamp.learn.evenCurve": ["As strong early as late: {early:pct}% in short games, {late:pct}% in long"],
  "power.late.plan (new)": ["Scales: farm safe early, fight once your build is done"],
  "power.early.plan (new)": ["Strong early: look for fights and plates before the enemy scales"]
}
```

### Skill order (`newchamp.learn.skills`)
Now: "Skills: start Q W E; max Q E W (61% of players)". Fine; use the "Q > E > W" notation every build site uses for the max order.
```json
{
  "newchamp.learn.skills": ["Level up {first}, then max {order} ({share:pct}% of {band} players)", "Max {order} (start {first}): what {share:pct}% of players do"]
}
```
(`{order}` rendered with " > " between keys, which is a renderer change, not wording.)

### Gold at 15 (`power.lane*`, `newchamp.learn.gold.*`)
Now: "Usually behind its top opponent: 312 gold down at 15 minutes (1,204 games); plays for later". "Plays for later" is a claim we only have if the power curve says so.
```json
{
  "newchamp.learn.gold.ahead": ["Wins lane: usually {gold} gold up on its {role} opponent at {minute} min", "Lane bully: about {gold} gold ahead at {minute} min"],
  "newchamp.learn.gold.behind": ["Usually {gold} gold down at {minute} min: farm safe, don't force trades", "Weak lane: about {gold} gold behind at {minute} min"],
  "newchamp.learn.gold.even": ["Even lane: usually within {gold} gold of its {role} opponent at {minute} min"]
}
```
(`{minute}` is the timeline minute the engine measures gold at, from config; today's templates hard-code "15".)

### Post-game "biggest plus/minus" (`postgame.*`)
Now: "Biggest minus: duos with your team (−1.4%)". Abstract nouns and a signed percent. Name the actual thing, and end the card with one thing for the next game (section 9 decides which).
```json
{
  "postgame.lane.edge": ["Your edge: the lane vs {enemy:champion}, worth {delta:per100} wins per 100", "Helped most: your lane vs {enemy:champion}"],
  "postgame.lane.bad": ["Your hurdle: the lane vs {enemy:champion}, costing {delta:per100} wins per 100", "Hurt most: your lane vs {enemy:champion}"],
  "postgame.meta.edge": ["Your edge: {champion:champion} is strong in {band} right now"],
  "postgame.meta.bad": ["Your hurdle: {champion:champion} is weak in {band} right now"],
  "postgame.personal.edge": ["Your edge: your experience on {champion:champion}"],
  "postgame.personal.bad": ["Your hurdle: few recent games on {champion:champion}"],
  "postgame.counter.bad": ["Your hurdle: their {enemy:champion} is strong into your pick"],
  "postgame.team.bad": ["Your hurdle: your team was short on {need}"],
  "postgame.next (new)": ["Next game: {tip}"]
}
```

### Break suggestion (`session.*`)
Now: "3 losses in a row. A short break before the next game usually helps." "Usually helps" is a claim we haven't backed (section 9), and it tells the player what to do. Ask instead, or show the player's own record when it passes the significance check.
```json
{
  "session.losses": ["{streak} losses in a row. Good moment for a short break?", "{streak} losses in a row. Break, or one more?"],
  "session.long": ["{games} games this session. Good moment for a short break?"],
  "session.record": ["After {streak} losses in a row you've won {wins} of your next {games}"]
}
```

### Pool gaps (`pool.hole.*`)
Now: "No magic-damage pick" + "Your team lacked it in 5 of your last 7 mid losses". "Magic-damage pick" is long for "AP"; counting only losses is a selection bias (the same could be true of wins).
```json
{
  "pool.hole.magic": ["No AP champion in your {role} pool", "Your {role} pool is all AD: add one AP pick"],
  "pool.hole.physical": ["No AD champion in your {role} pool", "Your {role} pool is all AP: add one AD pick"],
  "pool.hole.frontline": ["No tank or frontline in your {role} pool"],
  "pool.hole.engage": ["No engage champion in your {role} pool"],
  "pool.hole.evidence": ["Your team was short on it in {lacking} of your last {games} {role} games"],
  "pool.hole.coveredBy": ["Easy adds: {champions}", "Try {champions}"]
}
```

### Also worth changing (same rules)
```json
{
  "meta.strong": "Strong in {band} {role} now: wins {winRate:pct}% of {games} games",
  "confidence.thin": "Few games yet: treat as a hint",
  "focus.label (new)": "This game, try",
  "growth.progress (new)": "Hit it in {met} of your last {games} games"
}
```

---

## Q5. What players find patronising or useless in coaching tools

The evidence here is **thin**: Reddit, GameFAQs and Mobalytics block our fetcher, and the comparison articles we could read are written by competing apps. Each point below has at least one independent source; we mark where it's only a search summary.

1. **Stats without context, the same for every role or champion.** Peer-reviewed focus groups (15 competitive players): "Different roles have different win conditions, so measuring performance the same way across roles doesn't make sense"; "stats like KDA and gold per minute are useful but incomplete". Same point in GameFAQs threads on Mobalytics ("useless and doesn't help at all"; tips that are "pointless irrelevant information"; search summary only). → Our lines must say the role and rank, and stick to early metrics. [Sharpe et al. 2025](https://journals.sagepub.com/doi/10.1177/17479541251381652), [GameFAQs thread](https://gamefaqs.gamespot.com/boards/954437-league-of-legends/76504712?page=1).
2. **Telling players what happened, not what to do.** "Looking at your win rate… tells you that you're stuck, but it doesn't tell you how to get unstuck"; "op.gg… just stats, no actionable feedback"; "vague grade letters". → Every goal needs a "This game, try" action. [Buildzcrank on item win rates (competitor, 2026-07)](https://buildzcrank.com/en/blog/why-lol-item-win-rate-stats-lie/), [League Coach Merch on op.gg](https://www.leaguecoachmerch.com/using-op-gg-in-coaching/), [Buildzcrank comparison (competitor)](https://buildzcrank.com/en/blog/mobalytics-vs-blitz-vs-porofessor/).
3. **Advice that doesn't change with the game.** The most common criticism of auto-imported builds: the page "does not change when the enemy team turns out to be three AP champions". → Situational lines must name the enemy trait. [Hexgate (competitor, 2026-09)](https://hexgate.app/blog/mobalytics-alternatives/), [Buildzcrank](https://buildzcrank.com/en/blog/mobalytics-vs-blitz-vs-porofessor/).
4. **Showing other players' records causes tilt.** Porofessor's tags ("chain loses") get players tilted or dodging before the game starts (GameFAQs, search summary). Our rules already forbid it. [GameFAQs thread](https://gamefaqs.gamespot.com/boards/954437-league-of-legends/80797147).
5. **Chasing the number.** Vision score targets make people "place wards to place wards"; Mobalytics itself says not to aim for a number. → Tips about the game, never about the score. [TurboSmurfs (2026-08)](https://turbosmurfs.gg/article/vision-score-in-league-of-legends-guide-and-tips-to-improve).
6. **Lecturing (from research, not reviews).** Feedback about the person rather than the task makes things worse in a third of cases; "must/should" wording can make people argue back. The owner's own example, "learn what each spell does", is obvious, can't be checked, and has no cue. [Kluger & DeNisi 1996](https://www.mrbartonmaths.com/resourcesnew/8.%20Research/Marking%20and%20Feedback/The%20effects%20of%20feedback%20interventions.pdf), [reactance study](https://www.researchgate.net/publication/303429945_Persuasion_and_Psychological_Reactance_The_Effects_of_Explicit_High-Controlling_Language).

**Not found:** a review or thread that calls a League tool "patronising" in so many words. App-store and Overwolf reviews of Mobalytics and iTero are almost all about performance, ads and price, or are uncritically positive ([Overwolf: Mobalytics](https://www.overwolf.com/app/mobalytics-mobalytics), [Overwolf: iTero](https://www.overwolf.com/app/itero_gaming-itero_drafting_coach), [Trustpilot: Mobalytics](https://www.trustpilot.com/review/mobalytics.gg)). Searched: Reddit-keyword searches (Mobalytics GPI useless, ward more, Porofessor tilt), GameFAQs, Trustpilot, Overwolf, comparison blogs, HCI papers on esports analytics.

---

## Style guide (13 rules)

1. **One idea per line.** If a line has "and", it's probably two lines.
   - ✗ "Ward river and track their jungler and recall on cannon waves"
   - ✓ "Ward river before you push past the middle of the lane"
2. **Tips: when X, do Y.** A cue on the screen, then a verb.
   - ✗ "Be careful of ganks"
   - ✓ "If you can't see their jungler, stay on your half of the lane"
3. **Point at the game, not at the player.** Name the wave, a ward, the tower or the enemy, never the player's character.
   - ✗ "You're too aggressive"
   - ✓ "Stop pushing past half the lane when their jungler is missing"
4. **First two words carry the verdict.**
   - ✗ "Into Darius, the matchup is +2.1%"
   - ✓ "Favoured vs Darius: 2 more wins per 100 games"
5. **The reason is a mechanic, not a correlation.** The numbers say how big; the game says why.
   - ✗ "Players on the better half win 6 points more"
   - ✓ "Each early death hands your opponent gold, XP and a free wave"
6. **Win-rate differences as wins per 100 games, in whole numbers, with the direction in words.**
   - ✗ "−1.4%"
   - ✓ "1 fewer win per 100 games"
7. **Counts out of a fixed number; never "1 in X"; never "2×" without the base.**
   - ✗ "Taken 2.1× more vs CC-heavy teams"
   - ✓ "Taken in 6 of 10 games vs heavy CC, 3 of 10 otherwise"
8. **Name the group.** "you" only for the player's own numbers; "{band} {role} players" for others'; the champion's name, not "it", when the line stands alone.
   - ✗ "It wins with more early gank kills"
   - ✓ "Winning Kindred players: 1.4 early gank kills. You: 1.1"
9. **Compare with a verdict.** Never "you vs typical" alone: add "Strength" / "Room to grow".
10. **Words the client shows, not plans.** Wave, CS, plates, AD/AP, Flash: yes. Tempo, prio, lane state, cheater recall: say the action instead (see the vocabulary list).
11. **Suggest; no absolutes.** No "must", "should", "always", "never" in advice. Offer a choice where the player decides (breaks, picks).
    - ✗ "You should take a break"
    - ✓ "Good moment for a short break?"
12. **Show the sample only when it's thin.** "Few games yet" in words; exact counts in the hover.
13. **Nothing obvious, nothing unmeasurable.** If every player already knows it or nobody can check it after the game, cut it.
    - ✗ "Learn what each spell does"
    - ✓ "First game on it: try each spell on a Practice Tool dummy, then play Normal Draft" (one place, one action, checkable)

---

## Vocabulary list (plain alternatives)

| Avoid (in short lines) | Say | Why |
| --- | --- | --- |
| tempo | "you can take a camp or plate before they're back" | four definitions across glossaries |
| prio / priority | "your wave is pushed, so you can move first" | not in every beginner glossary; abstract |
| reset | "recall" or "the wave bounces back" | three different meanings |
| cheater recall | "recall right after you shove the wave in" | coined by LS; advanced guides only |
| lane state | "where the wave is" | in no beginner glossary |
| trade window | "when their key spell is down" | in no beginner glossary |
| gank angle | "come from behind them, not up the lane" | in no beginner glossary |
| freeze | "keep the wave near your tower" | glossaries contradict each other |
| slow push | "let your wave build up" | same |
| shove / crash | "push the wave into their tower" | fine for most, but the plain form costs only a few words |
| magic / physical damage | AP / AD | shorter; the shop uses it |
| delta, lift, GD@15 | "more wins per 100 games", "taken twice as often (6 of 10 vs 3 of 10)", "gold up at {minute} min" | stat-site jargon |
| percentage points, "+2.1%" | "2 more wins per 100 games" | percent vs points confusion |
| "the better half", "spreads", "measured" | "players above typical", (drop), (drop) | our internal jargon |
| "in your rank" | "in Gold" ({band}) | more concrete |
| "plays for later" | "stronger late: wins N% of games over M min" | only when the power curve says so |

---

## What to change in the code or config

1. **`config/explain.v1.json`:** replace the templates listed under Q4 with the recommended (first) options. All fit the current flat `templates` shape.
2. **Engine/formatter: add a `{x:per100}` slot format** (whole, unsigned, a 0..1 difference × 100). Use it for every win-rate difference (`lane.*`, `counter.*`, `synergy.*`, `blind.*`, `whyNot.*`, `postgame.*`, `ban.counters*`, `loadout.*` win added). Drop `signedPct1` from player-facing text.
3. **Use `pct`, not `pct1`, for win rates** everywhere (`meta.*`, `loadout.page*`, `loadout.spells`, `trend.win`, `power.*`).
4. **Goal "why":** replace `growth.why.band` / `growth.why.games` with a per-metric mechanic line (`growth.why.<metric>`, new keys, wording only) plus `growth.why.size`. Move the win gap to a hover, worded as a link. This needs a fallback when a metric has no mechanic line (show only `growth.why.size`).
5. **Goal title:** use the target in the title (`growth.title.more/less` with `{target}`); optional per-metric override keys. Needs a `{minute}` slot from the metric definition (e.g. a `minute` field on `metrics.<id>` in explain.v1.json).
6. **"How it wins":** add a header line (`newchamp.learn.wins.head`) and shorten the rows; restrict to early/habit metrics (coordinate with section 2/3).
7. **Power curve:** pass the long/short split in minutes (`{lateMin}`, `{earlyMin}`) from config into `power.*`.
8. **Sample sizes:** remove `({games} games)` from panel lines where the data passes the significance check; keep it in hovers; show "Few games yet" in words when thin.
9. **Session break:** reword `session.*` as a question; show `session.record` only when it passes the significance check (section 9 decides the evidence).
10. **Pool gaps:** count the lacking trait over all recent games in the role, not losses only (`pool.hole.evidence`), and use AD/AP names.
11. **FocusCard label:** "Keep in mind" → "This game, try" (`apps/desktop/src/renderer/components/FocusCard.tsx`; better as a template key `focus.label`).
12. **Tips:** remove score-gaming tips (`utility:challenges.visionScorePerMinute`), apply the "when X, do Y" form to the rest (section 2 owns their content).
13. **A lint test** in the engine package: every template in `explain.v1.json` under 90 characters, no digits outside slots (except the unit "per 100" and the existing metric labels), no "must/should/always/never" in advice templates, no "1 in".
14. **Cheap user test before v0.8:** 5 friends × 10 lines, "say what this tells you to do"; rewrite any line two or more people misread.

## Open leads

- Reddit (r/summonerschool, r/leagueoflegends) threads on Mobalytics GPI and Porofessor could not be read; a session with a browser could fill Q5 with direct quotes.
- High-elo coaches' spoken phrasing (Coach Curtis / Broken by Concept, LS, Skill Capped) is in videos and podcasts we didn't transcribe.
- No source measures term understanding by rank; the friends test above would be the first data.

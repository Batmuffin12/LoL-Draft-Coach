# Learning a new champion — what coaches say, and what the New tab does with it

Research run 2026-10-08 for the New tab. Sources at the end. Where sources disagree or are thin, it says so.

## What coaches and data agree on

1. **Learning takes games, and the first ones lose more.** Riot measures a "mastery curve": how much a player's win rate rises with games on a champion. Even an easy champion gains about 4% win rate over the first ~15 games; hard or unusual ones (Azir, Zoe) gain ~11% over 30, and some (Yasuo, Katarina, Nidalee) keep improving past 100. A fan study of 1M+ games puts the break-even (50% win rate) at about 20 games of experience. Coach Curtis (Broken by Concept) suggests 15–30 games to establish comfort. **So: don't judge a champion on its first games, and learn it outside ranked.**
2. **Before the first game, practise the kit.** Practice Tool or a custom game for combos and spell ranges; Dignitas recommends 5–10 minutes of combo practice before each game; Mobalytics advises never trying a new combo in ranked. Read what each spell does, not only the combo order.
3. **First games: understand, don't win.** Learn when the champion is strong (its level, item and phase spikes; Dignitas: "learn which phase your champion is strongest in and why") and what its kit is built to do (its win condition, from its class and ability text). Normal games are for testing its limits.
4. **One focus per game, set before you queue, checked after.** Dignitas: decide what you want to learn before the game, concentrate on that one thing, don't measure the game by the result, and review afterwards. Play in blocks of 2–3 games with a review, not 8 in a row.
5. **Keep your fundamentals while the kit takes your attention.** Coaches note that most trouble on a new champion is CS, positioning and dying, not the champion. Role basics while learning:
   - **Top / mid:** trade in turns (your key spell up, theirs down) and don't die early; mid learns its trading pattern and roam windows.
   - **Jungle:** "keep up in farm: while learning that's more important than anything else"; gank when the champion is strong (ultimate up, item done).
   - **Bot:** attack range and fight windows; farm safely until then.
   - **Support:** when it can fight in lane (level-ups, enemy spells down), vision when it can't.
6. **Choose your first matchups.** Learn the champion into lanes it does well into first; avoid (or ban) its worst ones until you know it.

## What the New tab does with it (engine `learningPlan`, config `newChamps.learn`)

| Coaching point | In the app |
| --- | --- |
| Stages | `practice` (0 games: Practice Tool, Normal Draft; a hard champion adds "practise before each game"), `first` (< `firstGames`: learn the spells, not the win), `building` (one thing per game, review). |
| One focus per game | **This game** box: the growth metric that dropped most on this champion against your other champions in the role (in spreads of your usual, ≥ `dropMin`), held at your usual; else your growth goal in the role; else the role's basic (`basics`: early deaths top/mid, jungle CS jungle, lane CS bot, vision support) at your usual. Your games on it as filled/empty squares. |
| Don't judge early | "Play it in blocks of 2 to 3 games; players keep improving for about N games": `settleGames` by Riot difficulty (15 / 20 / 30). |
| Its job | A line per Data Dragon class (first tag): Assassin, Fighter, Mage, Marksman, Tank, Support. |
| Role basics | A cue per role (wording in `explain.v1.json`). |
| When it's strong | Measured power curve (wins more of long or short games) from the band's data. |
| First matchups | "Easier first games into …" / "Avoid or ban while learning: …" from measured lane matchups in your rank. |

All wording is in `config/explain.v1.json`, all thresholds in `config/engine.v1.json`. Numbers in the text come from the engine.

**Not done (would need data we don't have):** per-champion level/item spikes and combos (no source we may use; Data Dragon has no spike data), and a personal mastery curve (your win rate by game number on a champion): possible later from collected games.

## Sources

- Riot, [/dev: Balancing new champions](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/) (mastery curves; ~4% over 15 games; long tails)
- [Mastery: a statistical summary of 1M+ games](https://jackjgaming.substack.com/p/mastery-a-statistical-summary-of) (~44% under 10k mastery; break-even ~20 games)
- Dignitas, [How to master a champion](https://dignitas.gg/articles/how-to-master-a-champion-in-league-of-legends) (basics first, spikes, combo warm-up, blocks of 2–3 games, review)
- Dignitas, [Fundamentals for improving as an average player](https://dignitas.gg/articles/the-fundamentals-for-improving-at-league-of-legends-as-an-average-player) (one focus per game, ignore the result, review)
- Dignitas, [Understanding champion identity](https://dignitas.gg/articles/how-to-have-a-game-plan-understanding-champion-identity-in-league-of-legends)
- Mobalytics, [How to learn and practice combos](https://mobalytics.gg/blog/lol-how-to-learn-and-practice-combos/), [win conditions](https://mobalytics.gg/blog/how-to-recognize-your-win-conditions-in-league-of-legends/), [learning a matchup](https://mobalytics.gg/blog/how-to-learn-a-matchup-in-league-of-legends/), [jungle tips](https://mobalytics.gg/blog/lol-6-tips-better-jungler/), [power spikes](https://mobalytics.gg/blog/how-to-understand-power-spikes-using-mobalytics/)
- Broken by Concept (Coach Curtis), [podcast](https://podtail.com/podcast/broken-by-concept/) (one core champion first; 15–30 games for comfort; secondary summary, episode not checked directly)
- [Laning trading fundamentals](https://metabot.gg/en/league/guides/laning-phase-trading-fundamentals), [dodge.gg jungle guide 2026](https://www.dodge.gg/en-US/lol/news/jungle-guide-2026), [LoL Theory support guide](https://blog.loltheory.gg/how-to-play-support-lol) (role basics)
- [MOBAFire forum: learning a new champion](https://www.mobafire.com/league-of-legends/forum/new-player-help/what-is-the-best-way-to-learn-a-new-champion-7321) (community; bots only for the kit, then normals)

# Wording test (5 friends, before v0.8)

The owner approved this test on 2026-10-09. It checks that the panel's lines make sense to players who didn't build it. It takes about 10 minutes per person. Run it in person or on a call, not as a form: what people say out loud while reading is the useful part.

## How to run it

1. Ask each friend separately. Don't explain the app first: say only "this is a draft helper for League".
2. Show one line at a time, exactly as written below. They are filled in as the panel shows them.
3. For each line, ask the three questions. Write down their words, not your summary.
4. Don't correct them or explain until the end.

**Questions per line**
- A. "In your own words, what is this telling you?"
- B. "Would you do anything differently because of it? What?"
- C. "Is any word or number unclear?"

**Pass rule:** a line passes when at least 4 of 5 friends answer A correctly, in substance. A line that fails gets rewritten in `config/explain.v1.json` and tested again with 2 new people.

## The 10 lines

| # | Where it shows | Line | Correct meaning (for the tester only) |
| --- | --- | --- | --- |
| 1 | Picks: matchup | Favoured into Darius: 3 more wins per 100 games (1,240 games) | Out of 100 games against Darius, this pick wins about 3 more than usual. |
| 2 | Picks: matchup | But hard into Malphite: 4 fewer wins per 100 games (860 games) | Against Malphite it wins about 4 fewer of 100 games. |
| 3 | Picks: blind pick | Risky blind pick: 5 fewer wins per 100 into Teemo (410 games) | Picking it before seeing your lane opponent is risky: one common opponent beats it. |
| 4 | Bans | Beats your Ahri: 3 fewer wins per 100 for you; in 12% of mid games | Ban it because it beats the champion you'd play, and it's picked often. |
| 5 | Picks: your experience | New to you: expect a few learning games | You haven't played it, so expect to lose a bit more at first. |
| 6 | Picks: filled | You're filled: support is 3% of your last 100 games. Picks lean on champions you know | You got a role you rarely play; suggestions favour champions you already know. |
| 7 | Goal | Each early death hands your opponent gold, XP and a free wave. You: 2.1. Typical mid player in Gold to Platinum: 1.2 | Dying early is costly, and you die early more than typical players at your rank. |
| 8 | Runes | Their team has a lot of crowd control. Unflinching: Gain Armor and Magic Resist when receiving crowd control. | Take this rune because their team stuns or slows a lot, and it makes you tougher when that happens. |
| 9 | Items | Their team heals a lot: Mortal Reminder cuts their healing (Wounds) | Buy it to reduce their healing. |
| 10 | Picks: draft synergy | Works with your Nautilus: 2 more wins per 100 (640 games) | This champion does a bit better alongside your Nautilus. |

## Final question (after all 10)

"Which line would you most want to see during champ select, and which one would you skip?"

## Results

| Friend | Rank | Lines failed (A) | Unclear words (C) | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

# What to change, in plain words (2026-10-09)

From the 11 research answers (`research/answers/`) and today's backtest on 18,783 production games.

**How to read this:**
- Each line is one change: **what** changes, **what you'd see**, and **why**.
- **Size:** S = an hour or two, M = about a day, L = several days.
- **⚑** means it needs your decision first.

---

## The big picture in five sentences

1. **What predicts wins:** what you pick in the draft predicts the game only a little (53–57% at best, anywhere). Your **experience on the champion** and the **champion's strength in your rank** are the only parts that really count. Lane matchups, counters and synergy add nothing measurable.
2. **What the coach should focus on:** the coach is most useful when it helps you **play what you know and get better at it**, not when it ranks picks by tiny matchup edges.
3. **The rule on numbers:** every number we show must be real (passing a significance check), and every reason must be a **game reason** ("this rune gives tenacity, their team has 3 stuns"), never "more players did this".
4. **How we judge goals and progress:** small changes over a few games are mostly luck. Goals, "changed this month" and "goal met" need proper statistics, or they lie.
5. **Riot's rules:** everything we ship today is allowed. Riot now bans in-game spike alerts and pushed in-game advice, so those stay out.

---

## Top 10 to do first (my recommendation)

| # | Change | Size | Why first |
|---|---|---|---|
| 1 | Add Riot's required trademark sentence to the app's notice | S | Required by Riot, one line |
| 2 | Remove counter, synergy and team from the shown "Chance %" | S | They add nothing, and make high numbers 2–4 points too high |
| 3 | Lower the "You" effect to half its strength, and base it on games played and mastery | M | It's the biggest real effect, and it's tuned too strong today |
| 4 | Remove rune suggestions that have no game reason (all "vs physical/magic" runes) | S | No rune reacts to damage type: these are pure correlation |
| 5 | Fix the monthly report's "changed" rule | S | Today it marks 58–74% of axes as changed for a player who didn't change at all |
| 6 | Fix bugs: Arena items counted as normal items; difficulty 0 counted as "easy"; suggesting a ban your teammate is already hovering | S | Wrong data shown today |
| 7 | Rewrite the goal's "why" line as a game reason, not "the better half win X more" | S | Our own spec forbids correlation as a reason |
| 8 | Show numbers as "2 more wins per 100 games", not "+2.1%" | S | Clearer for players, per the language research |
| 9 | Items: default to what most players buy; only claim "wins more" when a pooled test backs it | M | Our #1 matches the most-bought item less often than popularity does (45% vs 49%) |
| 10 | Power spikes (M8): ship "gains most on its lane opponent from about minute X to Y", not item spikes | M | Item spikes are too small to measure. This closes the open M8 decision |

---

## By where you'd notice it

### Champ select: picks

- **Shown "Chance %" uses only what's real** (S). Champion strength in your rank plus your experience on it.
  - **You'd see:** honest percentages; no "56%" that wins 51%.
  - **Why:** today's backtest shows counter, synergy and team add nothing, and the high numbers run 2–4 points high.
- **The "You" column becomes an experience curve** (M).
  - **You'd see:** a first game on a champion costs clearly; from about 20 games it's a plus.
  - **How:** built from your games on it, your mastery and the champion's measured difficulty, instead of hand-set numbers.
  - **Why:** three sources and our own data (43% on a first game, 52–55% after 20) agree.
- **Off-role / autofill mode** (M) ⚑.
  - **You'd see:** when you're filled into a role you rarely play, picks lean even more on what you know.
  - **Needs:** a decision on how to detect "filled".

### Champ select: bans

- **Ban by how often you'd meet the champion × how strong it is** (M).
  - **You'd see:** fewer "frustration bans" from ban rate alone.
  - **Why:** counters are counted only when that matchup's edge is real.
- **Never suggest the ban your teammate is already hovering** (S). This is a bug today.

### Champ select: runes, spells, items

- **Remove rune suggestions with no mechanic** (S): the damage-type "lift" runes.
- **Runes by what they do, from Riot's own data** (L).
  - **How:** CommunityDragon's rune data tags every rune automatically: heals, tenacity, resistances, "after taking champion damage". The rule says why.
  - **You'd see, for example:** "Their team has 3 stuns → Unflinching gives resistances while you're crowd-controlled."
  - **Then a measured backing:** "players took it 2× as often here", and a win number only when a pooled test passes. Expect that to be rare.
- **Measure what runes actually did** (M).
  - **How:** Riot's match data includes each rune's own numbers (damage blocked, healing), which we drop today.
  - **You'd see:** "into lanes like this, Second Wind healed 1.6× as much".
- **Riot's own recommended page as a fallback** (S). It's in CommunityDragon, dated this patch.
- **Situational items from Riot's "counters" tags** (M).
  - **You'd see:** "They heal a lot → anti-heal item" with the reason, for 70 of 118 items, no hand lists.
  - **Also:** new enemy traits: shields, crit, auto-attackers.
- **Items default to what players buy most** (M). "Wins more" only when a test pooled across champions passes. Better item scoring (judged at the moment of choosing, compared with the other items for that slot) comes later.
- **Fix: Arena and other-mode item copies are treated as normal items** (S). It's a bug.

### After lock-in and post-game

- **Post-game card: one point, not a report card** (M).
  - **You'd see:** your goal result, then one tip for the next game, with the same card after wins and losses.
  - **Also:** "when you died" (deaths before 14 and what the enemy took next), and your gold vs your lane opponent compared with what's typical for that matchup.
  - **Why:** feedback aimed at the person instead of the task made performance worse in over a third of studies.
- **Power spikes, as a strong phase** (M).
  - **You'd see:** "Gains most on its lane opponent from about minute 14 to 20", plus the typical first-item minute. Champ select and build only, never in game.

### Your goal (Last game tab)

- **Goal size from your own consistency** (M).
  - **How:** a step of about half your usual game-to-game spread, and never past the typical for your rank.
  - **You'd see:** goals that are reachable, not random jumps.
- **"Goal met" needs a real change** (M).
  - **How:** at target, a noise check, and at least 5 games; luck no longer counts as progress.
  - **You'd see:** fewer fake "met" ticks.
- **Choose the goal by what it's worth in wins** (L).
  - **How:** a proper model per rank, comparing you with your lane opponent, instead of "winners vs losers".
- **Habits first for newer players** (S). Control wards and early deaths before outcomes like the CS lead.
- **Better tips, "when X happens, do Y"** (S). New tips for all 27 role-and-goal pairs; the vision-score-gaming tip is removed.
- **The "why" line becomes a game reason** (S), with the size of your gap. The win numbers move to a hover.
- **Next rank's typical only once all goals are met** (S).
- **A "try a different goal?" button** after a while, so you choose (S).

### Style tab and monthly report

- **Score each axis against the same champion, not the whole role** (L).
  - **You'd see:** playing Naafiri no longer means "low CC"; your style reflects you, not the kit.
- **Six axes from early-game numbers and habits** (M). Roaming is dropped until we can measure it from timelines.
- **"Changed" only when it's real** (S).
  - **How:** a proper test, plus a 5-point minimum, comparing two separate sets of games.
  - **You'd see:** far fewer arrows, but true ones.
- **Monthly report order** (S): games and goals met, what really moved, your champion pool, then rank and win rate. Tilt shows only as how many games you queued right after a loss.

### New tab (learning a champion)

- **Fix: difficulty 0 counts as "easy"** (S). It's a bug (Akshan, Rell, Seraphine, Vex). Use CommunityDragon's difficulty.
- **Give ease more weight when suggesting new champions** (S). 0.4 → 0.8: difficulty best predicts how hard the start is.
- **"Spread your first games over several days"** (S). Better supported than "blocks of 2–3".
- **Key-spell line** (M), for example "Your Q is back every 8 s at rank 5". It comes from CommunityDragon spell data, with no hand lists.
- **"Plays like your X" stays a hint, not a promise** (S). There's no evidence that skill carries over between similar champions.

### Breaks

- **Ask, don't tell** (S): "2 losses in a row. Take a short break?"
- **No repeat prompt** once you already rested (S).
- **Drop the personal "your record after 2 losses" line** (S). Proving it needs about 2,200 games after streaks, more than anyone has.

### Wording everywhere

- **Plain style rules** (S–M):
  - one idea per line, under 90 characters;
  - "when X, do Y";
  - whole numbers ("2 more wins per 100 games");
  - client words (wave, CS, plates, AD/AP), not "prio", "tempo", "lane state".
  - A test checks every template against these rules.
- **A 10-minute check with 5 friends** before v0.8 ⚑: "say what this line tells you to do".

### Server and data

- **Detect what each patch changed** (M).
  - **How:** compare CommunityDragon's data between versions. It found 16/16 changed champions on the last patch.
  - **Then:** changed champions lose weight from older games, and unchanged ones keep theirs.
- **Collect from NA and Korea too** (M) ⚑. About 3× more games on the same key. EUNE adds nothing: it shares EUW's limit.
- **Store a few more numbers per game** (S): current gold per minute (item timing), rune numbers (rune effects), LP (rank trend).
- **Users' own games in the meta** (M) ⚑. Anonymous and with opt-out, off by default.
- **Third-party stats sites:** none usable. Their terms forbid it.

### Rules, release and proving it helps

- **Riot's trademark sentence in the notice** (S): required.
- **Spec and CLAUDE.md:** add Riot's 25.17 rules (no in-game spike alerts, no pushed advice, no enemy timers) (S).
- **Developer Portal description:** list the client endpoints, including our 3 click-only writes (S).
- **Stay invite-only** while we're on the personal key (no change). Riot counts open betas as "public".
- **Production key** ⚑: apply early. Approvals have taken 1–7+ months. Needs a landing page, terms, privacy policy, screenshots and a test invite.
- **Prove the coach helps** (M):
  - compare each player with their own games before they installed it;
  - track games on known champions, advice taken, goals met and breaks taken;
  - win rate can't show it with a few friends.
  - A small `product-numbers` command would print this.

---

## What I'd skip or postpone

- **Item spikes** (vs the strong phase): too small to measure with our data (~6,000 games per champion needed).
- **Matchup/synergy tables as pick drivers:** no measurable value. Keep them as information only.
- **A logistic item model and matched comparisons:** wait until the simple popularity-first change is in and measured.
- **Spell preview videos:** nice, but the video host is undocumented, and they need a policy check.
- **Replay files:** Riot is closing them to third parties.

## Decisions I need from you (⚑)

1. Off-role/autofill mode: build it, and how to detect "filled"?
2. A 5-friend wording test before v0.8?
3. Add NA and KR to the collector?
4. Users' own games in the meta (opt-out)?
5. When to apply for the production key?

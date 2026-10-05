# Phase 3 — Competitors and feature ideas

Researched 2026-10-05.

## 1. Landscape

| Tool | Type | What it does well | What it does badly / gaps | Price | Source |
| --- | --- | --- | --- | --- | --- |
| **Blitz.gg** | Desktop (standalone, no Overwolf) | Best-in-class auto-import of runes, spells, item sets on lock-in; stable; multi-game | Heavy ads on free tier; generic meta builds; little "why"; no personal growth model | Free + Premium | [buildzcrank review](https://buildzcrank.com/en/blog/best-league-of-legends-app-2026/), [1v9 list](https://1v9.gg/blog/best-league-of-legends-companion-apps) |
| **Mobalytics** | Overwolf app + site | GPI: 8 skill areas (Aggression, Consistency, Farming, Fighting, Survivability, Teamplay, Versatility, Vision) scored 0–100; post-game report against your own average; guides | Overwolf resource use, ads, "feature depth may overwhelm casual players"; GPI is ML and opaque | Free + Premium | [Mobalytics GPI](https://mobalytics.gg/gpi/), [buildzcrank](https://buildzcrank.com/en/blog/best-league-of-legends-app-2026/) |
| **Porofessor** | Overwolf | Huge history (League of Graphs), live game breakdowns, 9M+ users | Teammate/enemy scouting is its core (we refuse that); performance issues, dated UI, ads | Free (ads) | [buildzcrank](https://buildzcrank.com/en/blog/best-league-of-legends-app-2026/) |
| **iTero** | Overwolf + standalone | "Explains why" for draft picks; trained models on team composition; 500+ account stats compared against your elo; "top 3 things to improve" macro coach; composition-based runes/items (anti-heal, anti-shield) | Lobby scouting of other players; ML black box; benchmark shows its top picks barely beat average (52.9 % when the pick was in its top 10) | Free + Premium | [itero.gg](https://www.itero.gg/), [Overwolf listing](https://www.overwolf.com/app/itero_gaming-itero_drafting_coach), [winrate.gg benchmark](https://winrate.gg/articles/draft-recommendation-benchmark) |
| **winrate.gg** | Draft AI | Best calibrated in a 20,000-game benchmark (55.1 % when pick in top 10; top-ranked picks 58.7 %) using gradient-boosted trees on 58 hand-engineered features | Not personalised; the benchmark is by winrate.gg itself (bias risk) | — | [benchmark](https://winrate.gg/articles/draft-recommendation-benchmark) |
| **LoLDraftAI** | Open-source neural draft model | Open source | 49.8 % in the same benchmark — worse than random top-10 | free | [benchmark](https://winrate.gg/articles/draft-recommendation-benchmark) |
| **DraftGap** | Open-source (MIT) desktop/site, syncs with LCU | Transparent, statistics-only: Elo-style ratings, per-matchup and per-duo **deltas over expectation**, Bayesian prior with a user-chosen "risk level"; shows each contributing matchup | Not personalised (no comfort); data pipeline calls lolalytics' internal endpoints (`apps/dataset/src/lolalytics/*`) — a sourcing route we can't copy | free | [repo](https://github.com/vigovlugt/draftgap) (code read locally) |
| **buildzcrank** | Standalone | Item advice that adapts to live game state, gold diffs, enemy comp; no ads | Build-only | free | [buildzcrank](https://buildzcrank.com/en/blog/best-league-of-legends-app-2026/) |
| **LoL Recommender** | Website | "Find your next main": by Riot ID, by champions you like, or by tags; role-aware | Hand-assigned tags; doesn't explain why; Plat+ data only | free | [lolrecommender.com/about](https://www.lolrecommender.com/about) |
| **HakkoAI** | Screen-reading LLM companion | Voice tips in game, "memory" of the player, companionship | ~4 s latency, voice distraction; LLM can invent things | $9.99–19.99/month | [Hakko blog](https://www.hakko.ai/blog/article/lol-ai-coach/) |
| **U.GG / OP.GG apps** | Desktop + sites | Massive samples, fast build pages, rune import | Generic (rank-wide) advice; ads | Free + ads | (not reviewed in the sources above; general knowledge, low weight) |

## 2. What the market tells us

1. **Rune/item import is table stakes.** Every major app does it; players expect one click. (→ DECISIONS D6: needs a narrow LCU write exception.)
2. **"Why" is the differentiator, and nobody does it well.** iTero claims explanations but its model is a black box; DraftGap shows raw matchup numbers without a story; LoL Recommender says nothing. Explanations built from the actual factor breakdown (our engine) are a real gap.
3. **Personalisation is the other gap.** The benchmark author notes personalised models were *not tested* and could "widen performance gaps". None of the draft tools blend *your* comfort with the meta in a transparent way; Mobalytics/iTero personalise *analysis*, not *picks*.
4. **Fancy models don't win by much.** The best draft model's top picks win 58.7 % vs ~50 % baseline; a neural net did worse than chance. A transparent additive model (DraftGap-style) + comfort is a reasonable, explainable target. The single biggest lever left on the table is the player's own comfort, which none of them model well.
5. **Growth tools are analytics dashboards** (GPI, 500 stats). Players get numbers, not a plan. A "pro friend" should give *one* focus at a time, tied to the champions you actually play.
6. **Scouting other players is the most popular feature we will never build** (Porofessor, iTero lobby scouting). Compliance is a feature: "we never look at anyone but you" is a selling point for friends worried about bans.
7. **Ads and Overwolf weight are the top complaints.** A small, ad-free standalone Electron panel is itself an advantage.

## 3. Ideas to borrow

| From | Idea | How we'd adapt it |
| --- | --- | --- |
| DraftGap | Elo/log-odds additivity: champion strength + matchup deltas + duo deltas, each measured as *actual minus expected*, smoothed with prior games | Use the same maths for `metaStrength`, `laneMatchup`, `counterValue` and a new `synergy` term (DESIGN.md §4). It makes every number explainable ("+2.1 % vs Darius on top of Garen's normal win rate"). |
| DraftGap | User-selectable "risk level" = how many prior games to shrink toward | Map to our existing `smoothingK`; expose as "Safe / Balanced / Bold" in settings later. |
| Mobalytics | Small fixed set of named skill axes, compared to *your own* average | Our playstyle profile uses ~8 named axes, but computed with transparent percentile rules, not ML (DESIGN.md §2). |
| iTero | "Top 3 things to improve" | Growth module gives **one focus at a time** with a measurable target (DESIGN.md §6). |
| iTero / buildzcrank | Composition-aware items (anti-heal, armour vs fed AD) | Rules on Data Dragon item stats + enemy damage profile; live adjustments via Live Client Data API. |
| LoL Recommender | Recommend by Riot ID, by "champions I like", or by tags | New-champion recommender with all three entry points, but **with reasons** and meta/difficulty context. |
| Blitz | Import on lock-in | Import on an explicit click (not automatic) to stay within "suggest, never decide". |

## 4. Original feature ideas (beyond the spec)

Each one is about understanding *why* and feeling growth. Effort: S/M/L.

| # | Feature | What the player sees | Why it helps growth | Effort |
| --- | --- | --- | --- | --- |
| F1 | **"Why this, not that"** | Under pick #1: "Picked over your Garen because Garen is −3 % into Teemo and your team has no magic damage." Built from the factor difference between #1 and the player's most-played champion. | Teaches the trade-off, not just the answer. | S |
| F2 | **Confidence labels from sample size** | "Clear pick" / "Close call" / "Not enough data" — derived from score gaps and sample counts (replaces the Jev confidence in the spec). | Honest; stops players over-trusting thin data. | S |
| F3 | **Playstyle card** | 6–8 named axes (e.g. Early pressure, Teamfight presence, Farming, Vision, Survival, Scaling, Roaming) with a one-line sentence each: "You take fights early: 68 % kill participation before 15 min, top 20 % of your band." | The player sees themselves described like a coach would. | M |
| F4 | **"Champions you'd like" (pool expansion)** | 3 champions not in your pool, each with: similarity to champions you already play well, how it covers a hole in your pool (e.g. "you have no AP pick for mid"), meta strength in your band, difficulty. | The stated goal: new champions that fit you. | M |
| F5 | **Pool health check** | "Your jungle pool is 3 physical champions; one AP option would cover drafts like today's (your team was all AD in 4 of your last 10 losses)." | Turns losses into a concrete pool action. | M |
| F6 | **Post-game "advice vs result" card** | After the game: what we suggested, what you picked, result, and the one factor that mattered (e.g. "Lane matchup was −4 %; you went 0/3 by 10 min — expected"). Stored in the advice log. | Closes the learning loop; makes the coach accountable. | M |
| F7 | **One focus at a time (growth plan)** | "This week: CS at 10 min on Viego. You: 58, your band's Viego players: 66. Target: 62." Progress bar across games; replaced by the next focus once met. | Feeling of growth with a measurable, personal target. | M |
| F8 | **Monthly growth report** | Rank, LP is noisy; instead show trend lines on the playstyle axes and per-champion form, plus "focus targets met". | Shows progress even in a losing streak. | S (after F3/F7) |
| F9 | **Rune & item "why" chips** | Each rune/item choice carries a short reason: "Bone Plating: enemy lane is burst (Zed: 92 % physical burst damage)", "Mortal Reminder: enemy has 2 healers". | Builds itemisation intuition. | M |
| F10 | **Practice-mode for drafts** | The mock LCU (already built) replays a recorded draft and asks "what would you pick?" before revealing the coach's ranking. Uses the user's own pool. | Drafting practice without queueing; reuses existing test infra. | S |
| F11 | **Friends' leaderboard of focus streaks** | Opt-in, only between consenting friends, only their own data. | Social motivation without scouting anyone. Must stay opt-in (privacy). | M |
| F12 | **Patch diff for your pool** | On a new patch: "Your champions this patch: Viego +1.8 % (buffed), Lee Sin −1.2 %." | Keeps the pool current with the meta. | S (after collector) |

Rejected ideas (and why): lobby scouting of teammates/enemies (Riot policy + spec); enemy cooldown timers (banned 2025); auto-lock/auto-import on lock (dictates decisions); LLM-only advice (can invent stats; templates first); Arena augment stats (banned).

# LoL Draft Coach — Product Spec

Oct 4, 2026 · @ofek

## Overview

LoL Draft Coach is an installable Windows app that coaches you through champion select like a pro analyst. It knows your account, champion pool and recent form, watches the draft live, and recommends what to pick, ban and build, with the reasoning behind each choice.

The problem it solves: most players lose games in draft by picking out of habit, ignoring team composition, or using outdated builds. Existing tools show generic tier lists; this one combines the live meta with your personal strengths and explains its thinking so you learn to draft better yourself.

The product has three parts: a desktop overlay (ow-electron), a backend server that serves recommendations, and a collector that keeps the meta data current around the clock.

Scope: personal use for you and a few friends, Gold to Platinum on EUW, for about $5 per month (Railway Hobby plan).

## Core features

The app covers the whole game, from the ban phase to the post-game review.

| Phase         | Feature                | What the player sees                                                                                       |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ban phase     | Ban suggestions        | Top 3 bans that threaten your pool and role                                                                |
| Pick phase    | Pick coach             | Top 3 picks, ranked, with pro-style reasoning; updates as each enemy locks in                              |
| Pick phase    | Pick-order awareness   | Safe blind picks when you pick early, counter-picks when you pick late                                     |
| After lock-in | Full loadout           | Runes, summoner spells, skill order, starting items and core build; one-click import of runes, item set and summoner spells |
| In game       | Live build adjustments | Next item plus 2 alternatives that adapt to the game, from Riot's Live Client Data API: both teams' items, who is fed, who keeps killing you, what your allies already cover, and your own gold and inventory (for example, armor when the enemy ADC is fed; skip anti-heal if an ally has it; buy the component you can afford now). Ranked by win added at the moment of purchase, never raw item win rate |
| After game    | Learning loop          | Records whether you followed the advice and the result, so recommendations adapt to you                    |
| Lobby / profile | Playstyle card       | Eight named axes (early pressure, fighting, farming, vision, risk control, objectives, roaming, playmaking) as "top X%" of your role and rank |
| Lobby / profile | Pool and gaps        | Your pool as main / comfortable / learning / rusty, and what it lacks per role (for example, no AP jungler) |
| Profile       | New champions          | Champions that play like the ones you're good at, fill a gap, are strong in your rank, with reasons        |
| After game / profile | Growth focus    | One measurable focus at a time (for example, CS at 10 on your main) with a target and progress; monthly report |

Rune page, item set and summoner spell import happen **only when the player clicks**; the app never picks, bans or locks (see Compliance).

Supported queues at launch: Ranked Solo/Duo, Ranked Flex and Normal Draft. ARAM and Arena come later with their own logic; Arena augment and item win rates are never shown.

## How recommendations work

A scoring engine ranks every champion you own; an LLM only explains the result. Keeping the numbers in code means the reasoning can never invent stats.

Each candidate gets a score from six factors:

| Factor        | What it measures                                                      | Source                                                    |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Comfort       | Your win rate, games played and mastery, weighted toward recent games | Your Match-V5 history, Champion-Mastery-V4                |
| Lane matchup  | Win rate against the enemy laner, once revealed                       | Live meta pipeline                                        |
| Team needs    | AD/AP balance, frontline, engage, early vs. scaling                   | Draft state + champion attributes derived from match data |
| Counter value | How well it answers all enemy picks                                   | Live meta pipeline                                        |
| Synergy       | How well it does with the allies already picked                       | Live meta pipeline                                        |
| Meta strength | Current win and pick rate, trend direction                            | Live meta pipeline                                        |

From the live-meta milestone on, factors are scored in **rating points** (log-odds, as in the open-source DraftGap): each factor is a delta over what was already expected, smoothed toward that expectation with prior games, and they add up to a predicted win chance for the draft ("≈ 54%"). This keeps every reason on one scale ("+2.1% into Darius, 1,240 games") and makes "why this over your usual pick" meaningful. Details: [research/DESIGN.md](../research/DESIGN.md) §4.

Factor weights live in a versioned config file, one set per rank band, not in code, so they can be tuned without a release. Scores are precomputed during the ban phase so the top picks appear instantly when your turn starts.

The explanation is generated from templates filled with the factor breakdown (for example: "Your team has no frontline and Ornn is +3% into their dive comp, so Ornn over your comfort Aatrox"). Each pick also shows "why not your usual pick" and a confidence label computed from our own data: **Clear pick** (a clear gap to #2), **Close call**, or **Not enough data** (thin samples). Templates are free, instant and can never invent a stat. Claude's API is an optional later layer for more natural, coach-like wording; its output is checked so it can only repeat numbers the templates gave it.

## Jev decision layer (optional, off the critical path)

**Decision (Oct 5, 2026):** Jev has no public docs or key yet, so nothing depends on it. Confidence labels come from our own sample sizes (above). The adapter stays in `packages/jev` behind `JEV_ENABLED=false`; the rest of this section applies only if Jev becomes usable.

[Jev](https://www.infoq.com/news/2026/10/typesafe-ai-jev-released/) from TypeSafe AI is a decision model: it returns typed answers (yes/no, one of N, a score) with a probability and a confidence value instead of text. It assists the scoring engine; it never replaces the real match data.

| Use                       | Question type    | Example question                                                                                            |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Team comp reading         | One of N + score | Is the enemy team engage, poke, split-push or none of these? How much does our team need a frontline, 0–10? |
| Final pick                | One of N         | Given the top 5 candidates with their stats and the draft, which is best?                                   |
| Ban suggestions           | One of N         | Which of these champions is the biggest threat to our pool?                                                 |
| In-game build adjustments | One of N         | Next item: armor, magic resist, or no change?                                                               |

Rules for using Jev:

- Always include a "none of these" or "no change" option; Jev always picks a listed option, even when none fits.
- Send the live stats in the state, so decisions use our current meta data, not Jev's training.
- Act only above a confidence threshold; below it, fall back to the scoring engine's ranking.
- Show the confidence to the player ("clear pick" vs. "close call").
- Keep Jev behind its own adapter; it launched on September 15, 2026, so its API and pricing may change.

## Data sources

All data is current: Data Dragon defines what exists this patch, the collector defines what is strong right now, and your history defines what you play well.

| Source                                                                                                             | Used for                                                              | Notes                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [League Client API (LCU)](https://github.com/CommunityDragon/awesome-league)                                       | Live draft, your summoner, owned champions, rune page import          | Local HTTPS + WebSocket via the lockfile; unofficial, so it can change without notice |
| [Riot Games API](https://developer.riotgames.com/docs/lol)                                                         | Account-V1, Match-V5 (with timelines), Champion-Mastery-V4, League-V4 | Personal key: covers you and a small private group, not a public release              |
| Data Dragon                                                                                                        | Champions, items, runes, icons for the current patch                  | Checked on every launch via versions.json; refreshed automatically on a new patch     |
| [Live Client Data API](https://developer.riotgames.com/docs/lol) (`https://127.0.0.1:2999/liveclientdata/`)       | In-game items, levels and scores for next-item advice                 | Official Riot API, local, no key; only what the scoreboard shows                      |
| LCU game data / [CommunityDragon](https://www.communitydragon.org/documentation)                                  | Riot's champion ratings (damage, durability, CC, mobility, utility, difficulty, class tags) for champion similarity | Same file the client uses; CommunityDragon mirrors it for the server                  |
| [Overwolf game events](https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/league-of-legends/) | Optional: a true in-game overlay window                               | Enabled per app by Overwolf; not needed for in-game data                              |
| Live meta pipeline (our collector)                                                                                 | Win rates, matchups, counters, builds, trends                         | See below                                                                             |
| Esports data (optional)                                                                                            | Pro-play pick priority                                                | For example Leaguepedia; check its terms                                              |

**Live meta pipeline.** The collector runs continuously:

1. Read each user's rank, then fetch EUW players in the matching rank bands from League-V4.
2. Pull their newest ranked games and timelines from Match-V5.
3. Weight each game by recency (a rolling window, not patch buckets), so the meta shifts smoothly as players find new builds.
4. Recompute win rates, matchups, counters, builds, rune pages and skill orders about every hour.
5. Flag trending champions whose pick or win rate is rising fast.
6. Show "not enough data" for new champions instead of guessing.

**Rank bands.** The meta differs by rank, so all stats are split into bands. Each user's band is detected automatically from the client and updates as they climb.

| Band | Tiers              |
| ---- | ------------------ |
| 1    | Iron to Silver     |
| 2    | Gold to Platinum   |
| 3    | Emerald to Diamond |
| 4    | Master and above   |

- Win rates and matchups come from the user's own band.
- Builds, runes and skill orders come from the user's band plus the one above.
- The collector only gathers bands someone in the group plays in, to stay within the personal key's limits and the $5 budget.

For this group, the collector gathers band 2 (Gold to Platinum) for win rates and matchups, and band 3 (Emerald to Diamond) only for builds, runes and skill orders. Bands 1 and 4 are skipped until someone plays there.

We never scrape other stats sites or resell Riot data.

## Architecture

Every outside service sits behind its own adapter, so when Riot changes something, one module changes and the rest of the app stays untouched.

&#91;embedded content: system architecture · desktop app, backend, external services\]

**Decision (Oct 5, 2026): the server ships data, the desktop scores drafts.** The server holds the one Riot API key, fetches each user's games, runs the collector, and publishes an hourly **meta snapshot** per rank band plus a **profile** per user and the scoring **config**. The desktop downloads these and runs the same pure engine locally on every draft update. This makes picks instant in champ select, keeps working on the last snapshot if the server is briefly down, costs almost no server CPU, and the live draft never leaves the player's PC. Weights, thresholds and templates are served from `/config`, so tuning doesn't need an app release. The server can optionally call Claude for coach-style wording. All API keys (Riot, Claude) live only on the server.

**Code structure** (one TypeScript repo):

| Folder                                                   | Responsibility                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/desktop`                                           | Overlay UI and client connections                                                |
| `apps/server`                                            | API (users, profiles, meta snapshots, config, advice log) and background jobs: user sync, collector, hourly aggregation; one process |
| `packages/engine`                                        | Scoring, playstyle, pool, new champions, growth and explanation templates as pure functions, no network calls |
| `packages/meta`                                          | Pure aggregation of collected matches into stats, matchups, duos and builds     |
| `packages/riot-api`, `packages/lcu`, `packages/live-client`, `packages/ddragon` | One adapter per outside service (Overwolf later, only for an overlay window) |
| `packages/jev`                                           | Jev adapter, frozen behind a disabled flag (optional)                            |
| `packages/shared`                                        | Data types used everywhere                                                       |

**Maintainability practices:**

- Validate all incoming data with Zod, so a renamed Riot field fails with a clear error.
- Keep scoring weights and settings in versioned config files; never hardcode game data (see Build details).
- Record real champ selects as test fixtures and replay them in tests.
- Run tests and type checks in GitHub Actions on every change.
- Ship with an auto-updater and crash reporting (for example, Sentry); alert when the collector stops receiving data.
- Run a release check around every patch, about every two weeks.
- Host on Railway Hobby ($5 per month, including $5 of usage): the API and collector run as one small Node.js service (256 to 512 MB RAM), with SQLite on a Railway volume. Set a usage limit in Railway so a bug cannot run up the bill.

## Build details

Nothing about champions, items, runes, patches or the meta is hardcoded: every game fact comes from live data and is recomputed as the meta moves. Code holds logic only.

### No-hardcoding rules

| What                                                          | Comes from                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Champions, items, runes, summoner spells, icons               | Data Dragon, current version from versions.json                     |
| Current patch                                                 | versions.json and the client version                                |
| Rank tiers and divisions                                      | League-V4 responses                                                 |
| Win rates, matchups, counters, builds, skill orders           | Collector, per rank band, recency weighted                          |
| Champion attributes (damage type, frontline, CC, power curve) | Derived from Match-V5 stats and timelines, recomputed with the meta |
| Item categories for in-game adjustments                       | Data Dragon item stats (armor, magic resist, and so on)             |
| Item answer classes (anti-heal, penetration…) and substitutes | Derived from collector purchase lift; never a hand-made list        |
| Gold value per stat point, buy paths                          | Data Dragon basic items and `from` / `into`, per patch              |
| Jev question options                                          | Built per request from current candidates and items                 |
| Riot rate limits                                              | Read from Riot's rate-limit response headers                        |
| Scoring weights, thresholds, smoothing values                 | Config with defaults; later tuned from the advice log               |

Champion attributes are measured, not labelled by hand:

- **Damage type:** share of physical, magic and true damage dealt.
- **Frontline:** damage taken and self-mitigated per minute.
- **Engage and CC:** time spent crowd-controlling others.
- **Power curve:** win rate by game length and gold difference at 15 minutes.

A reworked or newly buffed champion updates automatically. An optional overrides file exists only for corrections and is empty by default.

### Stack

| Area              | Choice                                            |
| ----------------- | ------------------------------------------------- |
| Language and repo | TypeScript (strict), pnpm workspaces, Node 22 LTS |
| Desktop           | ow-electron, React, Vite                          |
| Server            | Hono                                              |
| Database          | SQLite via better-sqlite3 and Drizzle             |
| Validation        | Zod                                               |
| Tests             | Vitest                                            |

### API contract

The desktop app talks only to our server; each friend gets a bearer token, stored hashed on the server. Friends register with a one-time **invite code** from the owner; the Riot ID is read from the League client they are logged into (Riot Sign-On needs a production key).

| Endpoint                | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `POST /users`           | Invite code + Riot ID in; returns the user's token                                          |
| `GET /me/profile`       | The user's minimised games, mastery, band, playstyle, pool and growth (incremental)         |
| `POST /me/sync`         | Fetch the user's new games now (after a game ends)                                          |
| `DELETE /me`            | Delete all of the user's data                                                               |
| `GET /meta/:band`       | Meta snapshot for a band: champion stats, matchups, duos, builds (with ETag)                |
| `GET /config`           | Engine weights, thresholds and explanation templates (with ETag)                            |
| `POST /advice`          | Advice given, whether it was followed, and the outcome                                      |
| `GET /health`           | Collector status, time of newest data, current patch                                        |
| `POST /recommend`       | Debug only: same engine run server-side                                                     |

### Rate-limit sharing

One limiter wraps every Riot API call and follows the limits Riot reports in its response headers. It has two priorities: user requests always go first; the collector uses the remaining capacity. On a 429 response it waits for the Retry-After time.

### Low sample sizes

Win rates are smoothed toward the champion's average in that band:

```latex
\text{smoothed win rate} = \frac{\text{wins} + k \cdot \text{base}}{\text{games} + k}
```

Below a minimum game count the app shows "not enough data" instead of a number. Both k and the minimum live in config.

### Data model

| Table               | Holds                                                       |
| ------------------- | ----------------------------------------------------------- |
| users               | Riot ID, PUUID, hashed token, current band                  |
| matches             | Match ID, patch, band, queue, date                          |
| participants        | Per-player champion, role, items, runes, stats              |
| champion_stats      | Win and pick rate per champion, role, band and patch window |
| matchups            | Win rate per champion pair and role, per band               |
| builds              | Item paths, rune pages and skill orders with win rates      |
| item_purchases      | Completed items from timelines: slot, minute, game state and enemy profile at purchase, result (no PUUIDs) |
| champion_attributes | Derived attributes per champion and patch window            |
| advice_log          | Advice given, whether followed, game result                 |
| invites             | One-time invite codes (hashed), who used them               |
| user_matches        | Which participant in a stored match is the user             |
| meta_snapshots      | Published snapshot per band and version                     |
| growth_snapshots    | Playstyle axes and rank over time; current growth focus     |

Matches older than about two patches are pruned to keep the database small.

### Development setup

- The League client only runs on Windows, so develop and test live features there.
- Record real champ select sessions as fixtures and run a mock LCU server in tests.
- Secrets live in `.env` locally and in Railway variables in production.
- The server and collector are separate modules that run in one process on Railway.
- Add a `CLAUDE.md` in the repo pointing to this spec.

## Compliance with Riot policy

The app must stay within Riot's rules so users never risk their accounts. These are hard product rules, not preferences:

- **No game memory access.** Riot blocks memory access for unknown third-party apps from October 6, 2026 ([Riot Support](https://support.riotgames.com/en-us/riot/performance/game-memory-access-removed-for-third-party-apps)). Use only the LCU, the Riot API, Riot's Live Client Data API and (optionally) Overwolf events.
- **Suggest, never decide.** Riot does not approve apps that dictate player decisions ([Riot Developer Portal](https://developer.riotgames.com/docs/lol)). Show ranked options with reasoning; never auto-pick, auto-ban or auto-lock. The only League client writes allowed are **creating a rune page, writing an item set and setting the player's own two summoner spells, each only on an explicit click by the player**; nothing ever acts on champ select picks, bans or locks.
- **In-game advice uses only what the client shows** (Live Client Data API). No enemy cooldown or ultimate tracking (banned by Riot since March 2025). Live game data passes through `sanitizeLiveGame()` (packages/live-client), which drops every Riot ID and summoner name, before it reaches the engine or the UI. Item advice always offers alternatives and never buys anything.
- **Riot notice.** Show "LoL Draft Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties" where players can see it.
- **No player identities in ranked champ select.** Score champions and the draft only, never teammates' names, ranks or histories.
- **No Arena augment or item win rates**, anywhere in the app.
- **No data brokering.** Riot data is not resold or passed to other companies.
- **Production key and Overwolf review** only if this ever becomes public; the personal key covers you and a small private group.

## Risks and open questions

The biggest risk is depending on interfaces Riot can change or restrict at any time.

| Risk                                                     | Impact                                     | Mitigation                                                                     |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| LCU endpoints change                                     | Champ select reading breaks                | Adapter layer, schema validation, recorded fixtures, release check every patch |
| Personal key rate limits                                 | Fewer matches per rank band                | Collect only the bands the group plays in; keep about two patches of data      |
| Railway usage exceeds the $5 credit                      | Higher bill                                | One combined service, SQLite on a volume, usage limit set in Railway           |
| Overwolf events not enabled                              | No in-game overlay                         | Ship champ select panel first as plain Electron                                |
| Riot policy tightens                                     | Features must be removed                   | Policy rules kept in one place; features behind flags                          |
| Jev is new; API or pricing changes, or it is unavailable | Comp reading and in-game decisions degrade | Own adapter; engine-only fallback; confidence threshold                        |
| LLM latency or cost (optional layer)                     | Slow or expensive explanations             | Templates by default; LLM only as an opt-in layer                              |

Decisions (all answered):

- [ ] Personal tool only, or a public product? Decided: personal use plus a few friends.
- [ ] Region: decided, EUW.
- [ ] Ranks: decided, Gold to Platinum.
- [ ] Budget: decided, Railway Hobby at $5 per month (Oracle Cloud Always Free as the $0 fallback).
- [ ] Rune and item-set import: decided, allowed on an explicit click only.
- [ ] Where drafts are scored: decided, on the desktop from server snapshots.
- [ ] Jev: decided, optional and off the critical path.
- [ ] Coaching scope: decided, add playstyle, new champions and growth tracking.

## Roadmap

Revised Oct 5, 2026 after the research in [research/ROADMAP.md](../research/ROADMAP.md). Milestones 1 and 2 are done. Each milestone is usable on its own; 3 and 4 form the MVP.

1. **Foundation** (v0.1.0, done): repo setup, LCU adapter, live champ select in an Electron panel.
2. **Personal coach** (v0.2.0, done): your match history, comfort and team-needs scoring, top 3 picks from your pool.
3. **Server and friends** (v0.3.0): Hono + SQLite server holding the one Riot key, invite codes and tokens, server-side sync of each user's games (keeping the richer match data), desktop in server mode, CI, Windows installer with auto-update. Done when a friend gets picks without a Riot key on their PC.
4. **The coach explains** (v0.4.0): reasons, "why not your usual pick", confidence labels; playstyle card; pool tiers and gaps. Done when the panel explains every pick from your own data.
5. **Live meta** (v0.5.0): collector and hourly snapshots for EUW bands; rating-based engine with matchup, counter, synergy and meta factors; blind-pick safety; ban suggestions. Done when stats refresh hourly and enemy picks change the ranking.
6. **Loadout** (v0.6.0): runes, spells, skill order and items; situational choices found from data with reasons; one-click import on click. Item-ranking groundwork: match timelines, `item_purchases`, win added at purchase time, and the pure `rankItems()` engine function.
7. **Grow** (v0.7.0, done; v0.7.1–v0.7.2 added the game plan, break suggestion, learning a champion and goals per role): new-champion recommender, growth focus, post-game card, monthly report.
8. **Power spikes** (v0.8.0, added Oct 8, 2026 by the owner): each champion's item and level spikes measured from collected timelines (gold lead and fights won around each completed item and level, against the role average, all rank bands pooled), shown in the New tab, the game plan and the build, plus your own item timing against your rank. Plan: [ENGINE-PLAN.md](ENGINE-PLAN.md). Done when spikes pass a split-half check and show for champions with enough games.
   Exit rule: if the check still fails on Oct 15, 2026, v0.8.0 ships with spikes hidden behind the check and your own item timing shown.

Revised Oct 8, 2026 (owner): the old milestone 9 ("In game and polish") is split so friends get the app before in-game work, and the engine upgrades in [ENGINE-PLAN.md](ENGINE-PLAN.md) (steps 7–11) get milestones of their own. The first build for friends stays v1.0.0; later milestones are minors of 1.x.

9. **Friends release** (v1.0.0): a public download that updates itself (GitHub Releases), crash reports (Sentry), a backup of user data, product numbers that show whether the coach helps (games on champions you know, comfort vs off-pool results, goals met, breaks taken), an install guide for friends, a patch-day checklist, and the product description on Riot's Developer Portal brought up to date. Done when two friends installed from the public link, an update arrived on its own, a test crash reached Sentry and the product numbers show their first week.
10. **In game** (v1.1.0): `PersonalCoach` split finished; the item engine revisited with production data (D36); `packages/live-client` (read-only, `sanitizeLiveGame()`), checked on a recorded live game (A15); next-item advice from both teams' items and your gold, as options the player looks at, never alerts pushed on game events. Done when the item backtest beats the plain core build and a real game shows the next item with two alternatives and no player names.
11. **Personal engine** (v1.2.0, needs a few weeks of friends' games): the experience curve fitted from users' games (comfort re-based on the champion's band win rate), a calibrated shown chance kept apart from the ranking score, the learning plan from the measured curve, an autofilled mode. Done when the personal term's interval excludes 0 in the backtest and shown chances are calibrated (ECE < 0.01).
12. **Meta signal quality** (v1.3.0, needs more collected games): lane matchups from gold at 15 with a class-level fallback, patch-aware weighting, priors per pair type with effective sample sizes. Done when the lane term improves the backtest.

Later, each on its own trigger: production key (more than ~10 users or any public sharing; apply about two months ahead), optional Claude wording with a spend cap, code signing, an Overwolf overlay window, Flex and duo data.

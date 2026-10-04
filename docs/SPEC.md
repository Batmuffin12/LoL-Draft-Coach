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
| After lock-in | Full loadout           | Runes, summoner spells, skill order, starting items and core build; one-click import of runes and item set |
| In game       | Live build adjustments | Hotkey overlay that adapts items to the game (for example, armor when the enemy ADC is fed)                |
| After game    | Learning loop          | Records whether you followed the advice and the result, so recommendations adapt to you                    |

Supported queues at launch: Ranked Solo/Duo, Ranked Flex and Normal Draft. ARAM and Arena come later with their own logic; Arena augment and item win rates are never shown.

## How recommendations work

A scoring engine ranks every champion you own; an LLM only explains the result. Keeping the numbers in code means the reasoning can never invent stats.

Each candidate gets a score from five factors:

| Factor        | What it measures                                                      | Source                                                    |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Comfort       | Your win rate, games played and mastery, weighted toward recent games | Your Match-V5 history, Champion-Mastery-V4                |
| Lane matchup  | Win rate against the enemy laner, once revealed                       | Live meta pipeline                                        |
| Team needs    | AD/AP balance, frontline, engage, early vs. scaling                   | Draft state + champion attributes derived from match data |
| Counter value | How well it answers all enemy picks                                   | Live meta pipeline                                        |
| Meta strength | Current win and pick rate, trend direction                            | Live meta pipeline                                        |

Factor weights live in a versioned config file, one set per rank band, not in code, so they can be tuned without a release. Scores are precomputed during the ban phase so the top picks appear instantly when your turn starts.

The explanation is generated from templates filled with the factor breakdown and Jev's decisions (for example: "The enemy is a dive comp (91% confidence) and your team has no frontline, so Ornn over your comfort Aatrox"). Templates are free, instant and can never invent a stat. Claude's API is an optional later layer for more natural, coach-like wording.

## Jev decision layer

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
| [Overwolf game events](https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/league-of-legends/) | In-game data for the overlay                                          | Enabled per app by Overwolf                                                           |
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

The desktop app sends the live draft to the Recommendation API and gets back picks and reasoning. The server asks Jev for typed decisions and can optionally call Claude for coach-style text. All API keys (Riot, Jev, Claude) live only on the server.

**Code structure** (one TypeScript repo):

| Folder                                                   | Responsibility                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/desktop`                                           | Overlay UI and client connections                                                |
| `apps/server`                                            | Recommendation API                                                               |
| `apps/collector`                                         | Match collection and meta recalculation; runs in the same process as the server  |
| `packages/engine`                                        | Scoring logic and explanation templates as pure functions, no network calls      |
| `packages/riot-api`, `packages/lcu`, `packages/overwolf` | One adapter per outside service                                                  |
| `packages/jev`                                           | Jev adapter: question definitions, confidence thresholds, fallback to the engine |
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

The desktop app talks only to our server; each friend gets a bearer token, stored hashed on the server.

| Endpoint             | Purpose                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /users`        | Register a user by Riot ID; returns their token                                                |
| `POST /recommend`    | Draft state in; ranked picks or bans with factor breakdown, Jev confidence and explanation out |
| `GET /loadout`       | Runes, spells, skill order and items for a champion, role and band                             |
| `POST /games/result` | Advice given, whether it was followed, and the outcome                                         |
| `GET /health`        | Collector status, time of newest data, current patch                                           |

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
| champion_attributes | Derived attributes per champion and patch window            |
| advice_log          | Advice given, whether followed, game result                 |

Matches older than about two patches are pruned to keep the database small.

### Development setup

- The League client only runs on Windows, so develop and test live features there.
- Record real champ select sessions as fixtures and run a mock LCU server in tests.
- Secrets live in `.env` locally and in Railway variables in production.
- The server and collector are separate modules that run in one process on Railway.
- Add a `CLAUDE.md` in the repo pointing to this spec.

## Compliance with Riot policy

The app must stay within Riot's rules so users never risk their accounts. These are hard product rules, not preferences:

- **No game memory access.** Riot blocks memory access for unknown third-party apps from October 6, 2026 ([Riot Support](https://support.riotgames.com/en-us/riot/performance/game-memory-access-removed-for-third-party-apps)). Use only the LCU, the Riot API and Overwolf events.
- **Suggest, never decide.** Riot does not approve apps that dictate player decisions ([Riot Developer Portal](https://developer.riotgames.com/docs/lol)). Show ranked options with reasoning; never auto-pick, auto-ban or auto-lock.
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
- [ ] Budget: decided, Railway Hobby at $5 per month.

## Roadmap

Build in five milestones, each usable on its own:

1. **Foundation:** repo setup, LCU adapter, live champ select printed to a basic Electron panel. Done when a real draft shows up live.
2. **Personal coach:** pull your match history, scoring engine on comfort and team needs, top 3 picks in the panel. Done when it recommends from your pool.
3. **Live meta:** server, collector and database for EUW; matchup, counter and build data feed the engine. Done when stats refresh hourly.
4. **Pro reasoning and loadout:** template explanations, Jev decision layer (comp reading, final pick, bans), runes, spells, skill order, one-click import. Optional Claude explanations after that.
5. **Product polish:** in-game Overwolf overlay, installer and auto-updates, crash reporting, learning loop, then share the installer with friends.

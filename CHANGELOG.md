# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the milestone tags.

## [Unreleased] — milestone 7, Grow (v0.7.0 once the owner has tried it)

### Added
- **Last game** (lobby tab, opened first after a game): the post-game card. The coach remembers what it showed when you locked in (your pick and the suggestions, champion ids and numbers only), takes the game id when the game starts and sends the record when it ends (`POST /advice`, `advice_log`, deleted with "Delete my data"). The card shows your pick, the result once the game is in your history, the suggestions with yours lit, whether you took one, the term that mattered most and the prediction. A dodge leaves nothing behind.
- **Your focus** (under the post-game card): one measurable thing to improve on your main champion and role, chosen where you're furthest below typical and it matters most for winning in your role and rank; a target halfway to typical; your last 10 games against it. Band snapshots now carry each metric's importance (the win-rate gap between its top and bottom halves). The post-game card shows the focus metric in that game.
- **New** (lobby tab): champions to learn per role: meta in your rank, not in your pool, like the champions you play well (Data Dragon ratings and tags, measured attributes), filling a pool gap, easy enough; never a clone of your main, and one at a time while you're learning one. Champions you don't own are allowed and tagged (owned ones read from the client). A first-games plan for the top one.
- **Monthly report** (Style › This month): games and win rate against the month before, your rank then and now (the server keeps your rank per day), each style axis then and now, your champions' form, focus targets met. Trends only, never a single game.
- **Draft simulator** (`packages/sim`): any champ select in a few lines (`draft().me("middle").hover(103).enemy(238).stopAt("my-pick")`), synthetic meta snapshots with thin or solid data on purpose, scenarios, and `pnpm --filter @ldc/sim mock <scenario>` for the panel; dev aid `LDC_META_FILE` coaches from a snapshot file.
- Design system synced with the app (its stylesheet is the app's `styles.css`), with the M7 screens.
- Dev aid: `LDC_SCREENSHOT_CLICK="Style>This month"` clicks a sequence and matches a button by the start of its text.

### Changed
- Lobby tabs: Last game · Style · Pool · New. The "no champ select yet" hint shows only before your history has loaded, and closed role heads are tighter, so every tab fits 440 × 720 for players with many roles.

## [0.6.2] — 2026-10-06 — Panel redesign

### Changed
- **Panel redesign** to the LoL Draft Coach design system: a 440 × 720 window that zooms with the client, Barlow fonts, a phase band with the timer and your lane opponent, flat sections. Every screen fits without scrolling.
- **Tables, like the build sites** (u.gg, op.gg, Mobalytics): picks are a table (Win, Lane, You, Team in points of win chance; click a row for its reasons, + green, − amber, the why-not line in gold); bans are a table (Hurts, Win, Pick, Ban, one reason per row; bans for your hover marked "Vs your hover", 5 rows).
- **After lock-in: Runes · Build · Matchups.** Runes on their full trees with the taken ones lit and the stat shards, the page's win rate and games, one Swap line per situational rune; spells and a Q/W/E/R × 1–18 skill grid (the ultimate at 6, 11, 16). Build: start and boots with their numbers, then items by slot (1st–4th) with the average minute, the top item over the next option, pick % and win added; with thin data the core plus the "Later: pick by situation" pool. Matchups: your champion against each enemy (your lane first) and with each ally: your win rate, edge over the expectation, games.
- **Lobby**: your pool as a table (Tier, Games, Win); as many roles open as fit, the others as one-line summaries you can open.
- **Thin data** (D31): no win rates quoted; numbers show games instead ("20 games"), item cells show pick %, and matchups without pair games say so in one line. The data note is one line, the full text on hover.
- **Bans**: "Hurts" is a bar against the biggest threat in the list (exact points on hover); reason lines say what the columns don't ("Strong in bot in your rank").
- **Positions as players know them**: Support, Mid and Bot instead of Riot's utility, middle and bottom, in labels and in reasons (`role.<id>` in `config/explain.v1.json`).
- Each build item is shown once (not again under "Vs this team"); a slot with no second common item says so.

### Fixed
- **Your record vs the "You" column**: when your recent games on a champion lower the pick, the engine now says why as a caveat ("No recent mid games on it", "Little recent form on it: …") instead of listing your mastery as a plus.
- **Stat shards** come from CommunityDragon's game data when the client doesn't list them (they were missing with the mock client).
- A ban's win and pick rates are judged in your role only when it's picked there often enough (the ban engine's threshold), else in its main role.

### Added
- View data for the tables: ban threat in points and win/pick/ban rates (no ban rate on older snapshots), whole rune paths from Data Dragon and stat shard rows from the client (read only, `/lol-perks/v1/styles`), win rate and games per loadout choice, pick share and win added per item option, the average minute per item slot (engine), starting item counts, and matchups against and with each champion in the draft.
- Dev aid: `LDC_SCREENSHOT_CLICK=Build` clicks a button (e.g. a tab) before the screenshot.

## [0.6.1] — 2026-10-06

### Added
- **Import runes & spells** (one button): on your click, creates the rune page and sets your own two summoner spells in champ select; a spell already on a key keeps it (Flash stays on D or F). Within Riot's policy (D34): your choice, on a click, never automatic; nothing else in champ select is touched.
- **Full build in the item set** (D35): five items plus boots, as Start, Boots, Core (items 1–3), Later (items 4–5), what to buy against this enemy team ("Vs heavy healing", …) and Other options.
- **Later: pick by situation** (D36): with few games, the build is a 3-item core plus a pool of later items to choose from, each with its reason, instead of a shaky 4th and 5th item.
- **Situational** row in the loadout: items your role buys more often against teams like this one, with the reason.

## [0.6.0] — 2026-10-06 — Milestone 6: Loadout

After you lock in, the "Your pick" card shows a full loadout for your champion, role and this enemy team, with the numbers behind each choice, and can import it into the client on your click.

### Added
- **Timelines** (Riot adapter + collector): each collected game also gets its Match-V5 timeline, reduced to gold per minute, item events and skill order with no player identifiers (`collector.timelineShare`). The collector also samples the band above yours for builds (`buildBandShare`; Emerald–Diamond for Gold–Platinum), as the spec asks.
- **Builds** (`@ldc/meta`, in each band's snapshot): per champion and role, from your band plus the one above: rune pages, summoner spells, skill order (first points and max order), starting items, the first completed items, rune pages into common lane opponents.
- **Win added** per item and build slot: the buyer's result minus the expected win for the game state when the item was bought (minute × team gold difference), so items bought by players already ahead don't look strong. Never raw item win rate.
- **Situational runes and items** by lift: taken more often against enemy teams high in magic or physical damage, frontline, crowd control or healing (healing is now measured per champion). Found from data, never from item lists.
- **`rankItems()`** (engine, pure): ranks each slot by win added plus lift for this enemy team; items with clearly negative win added are never #1. The same function will rank live items in milestone 8.
- **Your pick card**: runes (with "Consider" chips for situational runes), spells, skill order, starting items and the build (top item per slot, alternatives on hover), each with a reason ("+1.2% win added as item 1, where 66% buy it (200 games)"; "Bought 3.0× more vs magic-heavy teams; theirs deals 68% magic damage").
- **One-click import** (on your click only): "Import runes" creates one "LDC:" rune page (and reuses it next time); "Import item set" saves an item set for the champion. A separate importer is the only code that writes to the client and refuses every other call; switch: `app.import.enabled`.
- **Item backtest**: `pnpm --filter @ldc/server backtest` also replays held-out timelines and reports our top-1/top-3 hit rate vs "most bought" and the win added when players agreed with us.
- **Lane gold at 15** (the other half of the power curve): picks say "Usually ahead in lane: +350 gold over its opponent at 15 minutes" when clear. Information only.
- Data Dragon: item costs and build paths, rune and summoner spell names and icons; the server keeps a cached copy next to its database.
- **Few games? Still a loadout, labelled a rough guide** (D31): below 100 games the champion's other roles fill in runes and skill order, your own games on the champion come first ("Your usual page: 10 of your 25 Naafiri games"), choices are the most taken ones and no win rates are quoted.
- **Items follow your lane** (D32): items and starting items never come from other roles; role-locked items (jungle companions, support quest items) are found from who buys them; your lane opponent counts double; common lane matchups get their own start and first item ("Into Zed: …").
- **Boots** on their own row, and **role quests** (D33): quest rewards are found from data (held but never bought, e.g. tier-3 boots in mid) and a Quest row says what your quest turns your boots or starting items into; rewards are never suggested as purchases.
- The Your pick card and its loadout stay up after champ select ends, until the game is over (custom games close champ select seconds after you lock in).
- `pnpm local:server` / `pnpm local:desktop`: test a branch against a local server with its own panel profile.

### Fixed
- The hourly snapshot job now fits the server's 256 MB heap at full size (50k games per band): compact matchup counting (an M5 issue that would have appeared as the database filled up), bounded build counters, smaller snapshots (pairs need 5 games).
- Wording missing from an older server's config falls back to the app's own, instead of showing ids.

## [0.5.0] — 2026-10-06 — Milestone 5: Live meta

The coach now knows what is strong in your rank right now, and enemy picks change its advice.

### Added
- **Collector** (server): samples Gold–Platinum players from League-V4 and stores their recent ranked games, anonymised (no PUUIDs or names; only a page cursor is kept between runs). Runs in one bounded wake-up (`POST /admin/collect`, owner token) inside Riot's rate limit, at collector priority so players' own requests go first. Settings in `config/meta.v1.json`; local runs with `pnpm --filter @ldc/server collect`.
- **`@ldc/meta`**: pure, streaming aggregation into a snapshot per rank band: recency-weighted champion stats per role, lane and cross-lane matchups, ally duos, measured champion attributes and playstyle references.
- **`GET /meta/:band`** (registered users, gzipped, ETag) and **`GET /config`** (ETag). `/health` shows the patch, the newest game and the collector's last run.
- **Engine v2** (used when a snapshot is loaded): every pick gets a predicted win chance ("≈ 54%") from six terms in rating points — meta strength, lane matchup, counters, synergy, team needs and your comfort — each a change over what was expected, smoothed toward it with prior games. Reasons quote the numbers: "+3.1% into Zed (1,240 games)".
  - Enemy roles are inferred from the band's data; a revealed lane opponent changes the ranking.
  - Blind picks are rated by their likely opponents ("Safe blind pick" / "Risky blind pick"); counters count more when you pick last.
  - Strong champions you haven't played can be suggested, with a learning cost.
  - "Why not your usual pick" names the term that decided it.
- **Ban suggestions** in your ban turn: champions picked often in your band that beat your best picks or are simply strong; never your own top picks or an ally's.
- **Your pick**: after you lock in, the panel shows your champion with its predicted win chance and reasons, instead of suggestions.
- Desktop: downloads and caches the band's snapshot (revalidated at most every 30 minutes) and keeps coaching from the cached copy when the server is down; the status line shows the meta's patch, size and age. Uses the server's scoring config (validated, cached), so tuning needs no release.
- Playstyle percentiles use the band's references once a snapshot is loaded.
- **Ban rates**: stored games keep each team's bans (champion ids only); suggested bans say "Banned in 36% of games in your rank".
- **Trending champions** (spec, collector step 5): champion-roles whose pick or win rate rose clearly in the last 3 days (size and statistical thresholds in `config/meta.v1.json`); picks and bans say so. Information only.
- **Power curve** (game-length half): each champion's win rate in short vs long games; picks say "Scales: wins 55.0% of long games vs 47.0% of short ones" when clear. The gold-at-15 half needs timelines (milestone 6).
- **Backtest**: `pnpm --filter @ldc/server backtest` checks engine v2's predictions on held-out collected games (log-loss vs a coin flip with a game-level interval, calibration, each term alone, setting sweeps).
- `/health` flags a stale collector (no new game for 6 hours) without failing the health check.
- Railway (as code, applied at the merge): `ldc-meta-wake` hourly cron (the server still sleeps between wake-ups; est. +$1.40/month) and daily volume backups (docs/CLOUD.md).

### Changed
- Comfort outweighs meta, but every champion you're comfortable on counts the same, so the draft chooses among them instead of always your single most-played champion; a never-played champion starts well behind (D25).
- Team-needs strength cut 40 → 10 after the first backtest showed it made predictions worse (D24).

### Fixed
- Your own locked-in champion no longer shows as "banned or taken".
- A champion that clearly plays a role in the band no longer gets the off-meta penalty there.
- A rank-band change during a meta download is queued, not dropped.

## [0.4.3] — 2026-10-05

### Added
- `pnpm riot:key RGAPI-... [--personal]`: checks a new Riot key, updates `.env` and the Railway service, and waits until the live server uses it. (Development keys can't be refreshed automatically; Riot only allows regenerating them by hand.)
- `/health` reports `riotKey` as `"ok"`, `"rejected"` (e.g. an expired development key) or `"missing"`.

### Changed
- Railway workspace usage limits set (soft $20, hard $25), with a review date in docs/CLOUD.md.
- Release plan recorded: first build for friends will be v1.0.0.

## [0.4.2] — 2026-10-05

### Added
- Railway infrastructure as code: `.railway/railway.ts` (service, volume, domain, sleep, limits, non-secret variables), applied with no drift; `pnpm infra:plan` / `pnpm infra:apply`.
- `docs/CLOUD.md`: what runs, every cost choice and its trade-off, expected monthly cost, how to check usage, and a cost log.

### Changed
- Cost: the service sleeps when unused. The background sync timer is off on Railway (`SYNC_INTERVAL_MINUTES=0`); a user's games sync when they open the app (if older than `SYNC_STALE_MINUTES`) and after each game. Heap capped at 256 MB; 1 vCPU / 512 MB container limits.
- The desktop app retries for up to ~19 s while a sleeping server wakes up (502/503/504 or dropped connections).
- `railway.json` removed (deprecated Config as Code; Railway can't use both).

## [0.4.1] — 2026-10-05

### Added
- `POST /admin/invites` (owner-only, `ADMIN_TOKEN` bearer): create invite codes from your PC without shell access to the server. Answers 404 without the right token.
- First deployment on Railway (project `lol-draft-coach`, service `ldc-server`, volume at `/data`).

### Changed
- `docs/DEPLOY.md`: invites from your PC; usage limits apply to the whole Railway workspace.

## [0.4.0] — 2026-10-05 — Milestone 4: The coach explains

Completes the MVP (milestones 3 + 4): friends can use it, and it says why.

### Added
- **Why, not just what.** Pick reasons are structured (template id + the engine's numbers); all wording lives in `config/explain.v1.json`, so text can never invent a stat.
  - "Why not your usual pick": e.g. "Your Naafiri is banned or taken", "Picked over your X: your team needs magic damage", or that it's off-meta in the role.
  - Confidence label from our own data: Clear pick / Close call / Not much data yet (replaces Jev's confidence in the UI).
- **Your style** (lobby): 8 axes per role (early pressure, fighting, farming, vision, staying alive, objectives, roaming, playmaking) as percentiles of Riot's per-player metrics against the other players in that role in your matches, each with its strongest piece of evidence. Metric lists and labels are config.
- **Your roles and pool** (lobby): champions per role as Main / Comfortable / Learning / Rusty, and the draft needs your main picks don't cover (magic, physical, frontline, crowd control), shown only when your own losses back them up, plus the learning or rusty champions that would cover each gap.

### Changed
- Direct (dev-only) mode now caches the same anonymised match summaries as the server (`matches-v2`), so every feature works in both modes.
- `recommendPicks` returns structured reasons; `advisePicks` adds the why-not line and confidence.

## [0.3.0] — 2026-10-05 — Milestone 3: Server and friends

Friends can now use the coach with their own accounts. The Riot API key lives only on the server.

### Added
- `apps/server` (Hono + SQLite via better-sqlite3 + Drizzle), deployable to Railway (`railway.json`, `docs/DEPLOY.md`).
  - One-time invite codes (`invite` command), registration by Riot ID through Account-V1, hashed bearer tokens, `GET/DELETE /me` (deleting removes all of a user's data).
  - Server-side sync of each user's games, mastery, ranked entries and band, on registration and every 30 minutes while they're active. Matches are stored anonymised (no PUUIDs or names) and shared between friends who played together.
  - Richer match data kept for the coaching milestones: KDA, CS, gold, vision, items, spells, rune pages and Riot's `challenges` metrics (124 per player in live EUW games).
  - `GET /me/profile` (incremental with `?since=`, gzip), `POST/GET /me/sync`, `/health`, per-client rate limit on registration.
- Desktop server mode: connect with a server address and invite code (Riot ID read from the logged-in client), account footer with sign out and data deletion, detection of a different account in the client.
- Windows installer (electron-builder NSIS); `LDC_SERVER_URL` bakes in the server address; opt-in auto-update via `LDC_UPDATE_URL`.
- GitHub Actions CI on Ubuntu and Windows, with a check that blocks committed keys and tokens.
- Riot "isn't endorsed" notice in the panel.
- Research and revised roadmap (`research/`), with the approved decisions written into `docs/SPEC.md` and `CLAUDE.md`.

### Changed
- Calling the Riot API from the desktop is now development-only ("direct mode"); packaged builds always use the server.
- `PersonalCoach` gets the player's history from a `ProfileSource` (server or direct) instead of loading it itself.

## [0.2.5] — 2026-10-05

### Fixed
- Champions were suggested (and listed in "Your roles") for roles they aren't played in, e.g. Naafiri bot from a single game or Vi support from a tiny sample. Off-meta picks now need `roles.offMetaMinGames` games in the role, data-derived role shares need `roles.minRoleSamples` observations, and role advice follows the same rules as picks.

## [0.2.4] — 2026-10-05

### Changed
- Comfort is now two signals (weights in `config/engine.v1.json`):
  - **Champion skill** (any role, fades slowly): mastery, mastery milestone grades (S…D), and a long-window win rate. Mastery fades only after months without playing the champion.
  - **Current form** (this role, fades quickly): recent games and win rate in the role.
- History raised to 200 games; match ids are paged past Match-V5's 100-per-call limit.

### Added
- "Your roles" in the lobby: each role with games, win rate and best champions, ranked by recent results. Roles under the minimum game count show "not enough games". Information only.
- Pick reasons include mastery grades.
- Clear dialog when `RIOT_PLATFORM`/`RIOT_REGION` in `.env` isn't a valid routing value.

## [0.2.3] — 2026-10-05

### Changed
- Role eligibility uses Riot's recommended positions from the client plus other players' games; your own off-meta picks (e.g. a fun jungle pick) are still suggested but tagged "off-meta" and penalised (`roles.offMetaPenalty`).
- Comfort is role-aware: games on a champion in other roles count only partly (`comfort.offRoleGameWeight`).

## [0.2.2] — 2026-10-05

### Added
- Demo mode: the mock client replays a recorded draft while the panel loads your real history from `RIOT_ID`, so suggestions can be tested without playing a game.

## [0.2.1] — 2026-10-05

### Fixed
- Match history never loaded with the League client open: the client's PUUID is not valid for the Riot API (PUUIDs are encrypted per API key). The account is now resolved from the client's Riot ID through Account-V1.
- `RIOT_ID` must be quoted in `.env` (`#` starts a comment); documented in `.env.example`, with a clearer error.

### Added
- First real (anonymised) champ select fixture: Ranked Flex, replayed in tests.

## [0.2.0] — 2026-10-05 — Milestone 2: Personal coach

### Added
- `packages/riot-api`: Riot API adapter (Account-V1, Match-V5, Champion-Mastery-V4, League-V4) with Zod validation.
  - One rate limiter that learns limits from Riot's rate-limit headers, queues user requests before collector requests, and waits Retry-After on 429.
  - Clear "renew your development key" error on 401/403, then fails fast.
- `packages/engine`: pure scoring functions.
  - Comfort factor (recency-weighted, smoothed win rate, experience, mastery).
  - Champion attributes measured from match stats (damage type, frontline, CC, roles).
  - Team-needs factor (damage balance, frontline, engage).
  - `recommendPicks` ranks the player's own pool for their role with a factor breakdown.
- Versioned config: `config/engine.v1.json` (weights per rank band), `config/rank-bands.v1.json`, `config/app.v1.json`, `config/jev.v1.json`.
- `packages/jev`: adapter interface, mock and engine fallback behind `JEV_ENABLED=false` (real client is a TODO).
- Desktop panel shows the top 3 picks from your own champion pool, your rank band and history loading progress; match history is cached locally with identities stripped.

## [0.1.0] — 2026-10-05 — Milestone 1: Foundation

### Added
- pnpm monorepo (TypeScript strict, Node 22 target, Vitest) with `packages/shared` types.
- `packages/lcu`: League client adapter.
  - Credential discovery from the `LeagueClientUx.exe` command line (CIM), with lockfile fallback.
  - Read-only HTTPS client and WAMP WebSocket subscriber; auto-reconnect when the client restarts.
  - Loose Zod schemas for champ select, gameflow, ranked and current summoner (checked against a live client).
  - `sanitizeChampSelect()` compliance boundary: champions and draft only, never player identities.
  - Anonymising fixture recorder (`pnpm --filter @ldc/lcu record`) and a mock LCU server that replays fixtures (`pnpm --filter @ldc/lcu mock`).
  - Synthetic draft-pick fixture.
- `packages/ddragon`: Data Dragon adapter; newest version from `versions.json`, full refresh on a new patch, disk cache with offline fallback.
- `apps/desktop`: Electron (ow-electron-compatible) + React + Vite panel that docks next to the League client and shows the live draft (picks, hovers, bans, timer, your turn).

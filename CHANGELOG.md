# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the milestone tags.

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

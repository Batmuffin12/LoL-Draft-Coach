# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the milestone tags.

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

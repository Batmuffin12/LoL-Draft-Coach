# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the milestone tags.

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

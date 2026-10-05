# Phase 5 — Architecture

Builds on the existing stack (D3): TypeScript strict, pnpm monorepo, Electron + React + Vite, Zod, Vitest; adds the spec's Hono + SQLite (better-sqlite3 + Drizzle) server on Railway.

## 1. Target shape

```
 Friend's PC (Windows)                                    Railway (one Node service, SQLite on a volume)
┌──────────────────────────────────────────────┐        ┌─────────────────────────────────────────────────────┐
│ apps/desktop (Electron, ow-electron-safe)    │        │ apps/server (Hono)                                  │
│  main:                                       │ HTTPS  │  /users /me/profile /meta/:band /config /advice ... │
│   LCU adapter ── sanitizeChampSelect ──┐     │◄──────►│  auth: per-user bearer token (hashed)               │
│   Live Client Data adapter (in game) ──┤     │        │  jobs: user-sync (your matches) ─┐                  │
│   engine (pure, same package) ◄────────┘     │        │        collector (band matches) ─┼─► riot-api       │
│   server client (profile, meta snapshot)     │        │        aggregator (hourly)  ─────┘  (ONE key,       │
│   local cache (last snapshot, offline)       │        │  DB: users, matches, participants, aggregates,      │
│  renderer: React panel (UI only)             │        │      advice_log, growth                             │
└──────────────────────────────────────────────┘        └─────────────────────────────────────────────────────┘
        ▲ never leaves the PC: the live draft,                  ▲ Riot API key lives only here
          other players' anything                               ▲ Data Dragon / CommunityDragon per patch
```

### Key choice: engine runs on the desktop, server ships data snapshots (D17 — spec deviation, needs approval)

The spec has `POST /recommend` (draft in → picks out). Proposed instead: the server publishes a compact **meta snapshot** per band (champion-role stats, matchups, duos, builds, metric references; est. 1–5 MB gzipped JSON, refreshed hourly) and a **profile** per user (their minimised games, mastery, playstyle, pool, focus). The desktop runs the same pure engine locally on each draft update.

| | Server-side `/recommend` (spec) | Local engine + snapshots (proposed) |
| --- | --- | --- |
| Latency in champ select | network round trip per draft event (~10–30 events per draft) | instant (in-memory) |
| Server outage during a draft | no picks | works on last snapshot |
| Server CPU/cost | scoring for every draft event of every user | one hourly aggregation; tiny |
| Privacy | the live draft goes to the server | the draft never leaves the PC |
| Updating logic | server deploy | app update — **but** weights/thresholds/templates are config fetched from `/config`, so most tuning needs no release |
| Advice log | server sees advice directly | desktop posts `POST /advice` after each game (needed anyway for results) |

Keep `POST /recommend` as a thin debug endpoint later (same engine package) — cheap to add, useful for tests. The spec's goal (server serves recommendations; keys only on the server) is met: the server serves the *data* recommendations are made from, and no key reaches the client.

## 2. Multi-user without Riot Sign-On

RSO needs a production key (DATA_SOURCES.md). For 5–10 friends:

1. **Invite code**: the owner runs `pnpm --filter @ldc/server invite` → one-time code. Friend installs the app, pastes the code.
2. **Riot ID from the client**: the desktop reads `gameName#tagLine` from the LCU (`/lol-summoner/v1/current-summoner`, already implemented) — so the account is whatever is logged into that PC's League client, not typed by hand.
3. `POST /users {inviteCode, riotId}` → server resolves PUUID via Account-V1 (server key), stores `users` row, returns a **bearer token** (random 32 bytes, stored as SHA-256 hash, spec). Token saved by the desktop in Electron `safeStorage` (OS-encrypted).
4. Optional ownership check for later/public (50 users): **profile-icon challenge** — server asks the user to set a specific summoner icon for a minute and verifies it via Summoner-V4 `profileIconId`. Free, no RSO. Not needed for friends with invite codes.
5. One account per token; a user can add alternate accounts (smurfs) as separate profiles.
6. `DELETE /me` deletes all their data (API Terms deletion duties; friendly).

## 3. Server (`apps/server`, new)

| Module | Responsibility |
| --- | --- |
| `http/` (Hono) | Routes (§5), Zod-validated bodies, bearer auth middleware, rate limiting per token (cheap, in memory). |
| `db/` (Drizzle + better-sqlite3) | Schema §6, migrations, pruning. WAL mode. |
| `jobs/user-sync` | On register and every ~30 min per active user: new match ids → fetch matches (+ timelines for the last 50) → minimise → store → recompute profile (engine functions). `user` priority in the limiter. |
| `jobs/collector` | Continuous, `collector` priority: League-V4 entries for the configured bands' tiers/divisions → sample players → their recent ranked match ids → fetch new matches (timelines for a configurable share, e.g. 30%) → store participants. Skips matches already stored. |
| `jobs/aggregator` | Hourly: recency-weighted (half-life config) counts → champion-role stats, matchups, duos, builds (pages, item sequences, spells, skill orders), situational lifts, champion attributes & power curves, metric references and importance. Writes `meta_snapshot` rows per band (JSON blob + version). |
| `jobs/patch` | On new Data Dragon version: refresh static data + CommunityDragon champion files; tag new matches with patch; prune matches older than `retention.patches` (spec: ~2). |
| `health` | `/health`: newest match time, collector rate, patch, queue depths. Alert = Railway's restart policy + a daily "collector stale" check that logs an error (Sentry later). |

All Riot calls go through the existing `@ldc/riot-api` `RateLimiter` (priorities already built). Aggregation maths live in a **new pure package `@ldc/meta`** (counts → stats) so it's unit-tested without a DB, same rule as the engine.

## 4. Desktop changes (`apps/desktop`)

| Change | Why |
| --- | --- |
| Split `PersonalCoach` into `AccountService` (LCU identity, band), `ProfileSource` (server client; local-dev fallback = current direct Riot API mode), `MetaSource` (snapshot download + cache), `DraftAdvisor` (engine calls → view), `GameWatcher` (gameflow → post-game advice report). | W10; makes server mode and local mode swappable and testable. |
| New `packages/live-client` adapter (port 2999, read-only, Zod) used by `GameWatcher` in the `InProgress` phase. | D7 in-game item advice without Overwolf. |
| `packages/lcu`: add game-data champion read (`/lol-game-data/assets/v1/champions/{id}.json`). Separate, flag-gated `lcu-write` module with exactly two calls (rune page, item set) **only if D6 is approved**. | D8 traits; spec's one-click import, kept isolated so the "GET only" guarantee stays auditable. |
| Views: Lobby (roles, playstyle card, focus), Champ select (bans, picks with reasons/why-not/confidence, loadout after hover/lock), In game (next item), Post-game card, Profile (pool, new champions, growth). Keep 340-px docked panel; add a wider "Profile" window. | Outputs from DESIGN.md §1. |
| Settings: server URL, invite code, account, "Safe/Balanced/Bold" risk level, data deletion. | Multi-user onboarding. |
| `RIOT_API_KEY` in the desktop becomes **dev-only** ("local mode" for the owner, off in packaged builds). | W1: keys never ship. |
| Installer: electron-builder NSIS + electron-updater with a **generic provider** pointing at a public static location (a public "releases" GitHub repo or Cloudflare R2 free tier). | Private GitHub releases would need a token inside the app. Unsigned at first (SmartScreen "More info → Run anyway"); signing later (DATA_SOURCES §8). |
| Legal notice "isn't endorsed by Riot Games…" in About/footer. | Riot general policy. |

## 5. API contract (revised from the spec)

| Endpoint | Purpose | Spec |
| --- | --- | --- |
| `POST /users` `{inviteCode, riotId}` → `{token}` | Register | kept (+ invite code) |
| `GET /me/profile?since=` | Your games (minimised), mastery, band, playstyle, pool, focus, growth history; incremental | **new** (replaces local loading) |
| `POST /me/sync` | Ask the server to fetch new games now (after a game ends) | **new** |
| `GET /meta/:band` (ETag) | Meta snapshot for a band (+ the band above for builds) | **new** (replaces `/recommend` as the main path) |
| `GET /config` (ETag) | `engine.v2.json`, `explain.v1.json`, app config | **new** (tune without releases) |
| `GET /static/traits/:patch` | Champion traits (Riot ratings + measured) | **new** |
| `POST /advice` | Advice shown, pick, followed, result, terms (spec's `/games/result`) | renamed/kept |
| `GET /loadout` | Folded into the meta snapshot (builds per champion-role) | merged |
| `POST /recommend` | Debug/testing only | demoted |
| `GET /health` | Collector status, newest data, patch | kept |
| `DELETE /me` | Delete my data | **new** |

## 6. Data model (SQLite)

| Table | Holds | Notes |
| --- | --- | --- |
| `users` | id, puuid (server-key encrypted), riot id, token hash, band, created, last_sync | spec |
| `invites` | code hash, used_by, expires | new |
| `matches` | match_id, patch, queue, band, ended_at, duration, source (`user` / `collector`) | spec |
| `participants` | match_id, team, champion, role, win, items, perks (page), spells, kda, cs, gold, damage split, taken/mitigated, cc, vision, selected `challenges` (JSON) | spec; **no PUUID for collector rows** — only aggregates are needed; user rows link to `user_matches` |
| `user_matches` | user_id, match_id, participant index | which participant is the user |
| `timelines_min` | match_id, participant, cs/gold/xp @10/@15, item purchase sequence, skill order | minimised timeline |
| `champion_stats`, `matchups`, `duos`, `builds`, `lifts`, `champion_attributes`, `metric_reference` | aggregates per band & window | spec + new |
| `meta_snapshots` | band, version, created, gzip JSON | served by `/meta` |
| `advice_log` | user, game, shown (JSON terms), picked, followed, result | spec |
| `growth_snapshots`, `focus` | user, date, axes JSON, rank; current focus & history | new |

Size estimate **(est.)**: 100k collector matches × 10 participants × ~0.5 KB ≈ 500 MB + timelines-min ~100 MB → fits Railway's 5 GB volume with 2-patch pruning.

## 7. Packages: keep / add / change / remove

| Package / feature | Decision | Reason |
| --- | --- | --- |
| `packages/shared` | **Keep**, extend types (Term, Reason, Recommendation v2, PlaystyleAxis…) | Shared contract desktop↔server. |
| `packages/lcu` | **Keep**; add game-data read; optional isolated `lcu-write` (D6) | Solid; compliance boundary. |
| `packages/riot-api` | **Keep**; add timeline + League-V4 by tier/division | Reused by the server unchanged. |
| `packages/ddragon` | **Keep**; add CommunityDragon champion traits loader (or new `@ldc/cdragon`) | Static data per patch. |
| `packages/engine` | **Keep and extend** (rating terms, playstyle, pool, new champs, growth, explain, loadout) | Pure-function core; tests stay fast. |
| `packages/meta` | **Add** | Pure aggregation for the collector. |
| `packages/live-client` | **Add** | In-game advice (D7). |
| `packages/jev` | **Keep frozen, off the critical path** (D10) | No docs/key; confidence comes from our data. Revisit if Jev publishes an API. |
| `packages/overwolf` | **Defer** (only for an in-game overlay window) | Live Client Data API covers the data need. |
| `apps/server` | **Add** (Hono + Drizzle + jobs) | Multi-user is impossible without it (W1). |
| `apps/desktop` local Riot API mode | **Keep for dev only** | Owner can develop offline from the server. |
| Docking via koffi/user32 | **Keep** | Works; window geometry only. |
| `config/engine.v1.json` | **Keep** until v2 ships, then remove | Versioned config migration. |
| Sentry, GitHub Actions | **Add** GitHub Actions early (free for private repos within minutes quota); Sentry free tier later | CI protects the "never commit failing code" rule. |

## 8. Cost

| Item | 1 user | 5–10 friends | 50 users |
| --- | --- | --- | --- |
| Riot API | $0 (personal key) | $0 (personal) | $0 (production key, free, needs review) |
| Server + collector | $0 (local) or $5 | Railway Hobby ~$5–8/month **(est.)**, or Oracle free $0 | Railway ~$8–15/month **(est.)** (more RAM for aggregation, more users) |
| Data Dragon / CDragon / LCU / Live Client | $0 | $0 | $0 |
| CI (GitHub Actions) | $0 | $0 | $0 |
| Installer hosting (R2 / public repo) | $0 | $0 | $0 |
| Optional LLM wording (§9) | ~$1–4/month | ~$5–40/month | ~$45–190/month |
| Code signing (optional) | — | — | ~$10/month or ~$100–300/year **(est.)** |

## 9. Optional LLM explanation layer — cost

Rewords the template reasons into one coach-like sentence; never adds facts (DESIGN.md §5 number check). Prices from the Claude API reference (2026-09-25 table): Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 4.5 $1 / $5 per million input / output tokens. Assume ~800 input + ~150 output tokens per call, ~20 calls per user per day (picks, bans, loadout, post-game):

| Model | Per call | Per user per month (600 calls) | 10 users | 50 users |
| --- | --- | --- | --- | --- |
| Claude Haiku 4.5 | $0.00155 | ~$0.93 | ~$9 | ~$47 |
| Claude Sonnet 5.5 | $0.0031 | ~$1.86 | ~$19 | ~$93 |
| Claude Opus 5.5 | $0.0062 | ~$3.72 | ~$37 | ~$186 |

Prompt caching won't help much at ~800-token prompts (below typical minimum cacheable prefix sizes). Caching *responses* by draft state hash cuts calls further. Recommendation: **templates only for MVP**; add LLM wording as an opt-in setting, keys on the server only, with a monthly spend cap. It's the first place money would be spent, and it's optional.

## 10. Security & privacy checklist

- Riot key, Claude key: server env only (Railway variables). Never in the desktop build (CI check: grep the packaged app for `RGAPI-`).
- Tokens hashed (SHA-256) server-side; desktop stores them with `safeStorage`.
- HTTPS only (Railway provides TLS).
- Collector rows stored without PUUIDs or names.
- `DELETE /me`; prune by patch; on Riot API termination, wipe the volume.
- Renderer stays sandboxed, no Node, no secrets (current design).

## 11. Testing strategy (extends today's)

| Layer | Tests |
| --- | --- |
| engine, meta | Pure unit tests with synthetic stats; property tests for rating additivity (e.g. deltas sum, smoothing → expectation at 0 games). |
| server | Hono `app.request()` tests with an in-memory SQLite; Riot API mocked with recorded JSON fixtures (anonymised, same rule as LCU fixtures). |
| collector | Replay a fixture set of 50 matches → snapshot golden file. |
| desktop | Existing mock LCU + a mock server (Hono in-process) + a mock Live Client server; replay the recorded draft. |
| CI | GitHub Actions: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` on every push (Windows runner for desktop-specific tests, Ubuntu for the rest). |

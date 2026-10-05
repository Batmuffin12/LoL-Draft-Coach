# CLAUDE.md — LoL Draft Coach

**The source of truth is [docs/SPEC.md](docs/SPEC.md). Read it before doing any work.** If a prompt conflicts with the spec, follow the spec and say so. The research behind the current plan (sources, design, architecture) is in [research/](research/ROADMAP.md).

## Current status (update this as it changes)

| Item | Status |
| --- | --- |
| Riot API key | Development key (expires every 24h) in `.env` and on the Railway service. Swap both with `pnpm riot:key RGAPI-... [--personal]`; `/health` shows `riotKey: "rejected"` when it has expired. Personal key applied for. The key lives only on the server (and the local .env for dev). |
| Overwolf | Developer access **pending** and no longer needed for data: in-game data comes from Riot's Live Client Data API. Overwolf is optional, only for an overlay window later. Keep `apps/desktop` ow-electron-compatible: only standard Electron APIs. |
| Jev (TypeSafe AI) | **Optional, off the critical path** (decided Oct 5, 2026). `packages/jev` stays frozen behind `JEV_ENABLED=false`. Confidence labels come from our own sample sizes. Do not guess Jev's API. |
| Sentry | Milestone 8. |
| Releases | Nothing published yet. First build for friends = **v1.0.0**; choose the public update location then (docs/DEPLOY.md). |
| Railway limits | Workspace soft $20 / hard $25, set 2026-10-05 for the period ending 2026-10-16: review then (docs/CLOUD.md). |
| Railway | Live: project `lol-draft-coach`, service `ldc-server` (europe-west4), https://ldc-server-production-c9e7.up.railway.app. Infrastructure is code in `.railway/railway.ts` (`pnpm infra:plan` / `pnpm infra:apply`); never change settings in the dashboard. Costs and the cost log: `docs/CLOUD.md`. The service sleeps when unused: no background timers that make outbound requests. |
| Milestones | 1 (v0.1.0), 2 (v0.2.0), 3 (v0.3.0, server + friends) and 4 (v0.4.0, the coach explains) done: the MVP. Next: 5 live meta (collector, rating-based engine v2), then 6 loadout, 7 grow, 8 in game + polish. Progress tracker: https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD |
| Fixtures | Synthetic draft + one real Ranked Flex recording (`packages/lcu/fixtures/recorded/`). Record more with `pnpm --filter @ldc/lcu record`. |
| Gotchas | Git Bash rewrites args like `/data` into Windows paths: use `MSYS_NO_PATHCONV=1` for railway CLI calls with absolute paths. Run Railway IaC through `pnpm infra:plan` (the SDK can't launch the npm `.cmd` shim of the CLI). better-sqlite3 13 ships prebuilt binaries: do NOT add it to `onlyBuiltDependencies` (that triggers a node-gyp build that fails without VS tools). Don't leave a shell `cd`-ed inside node_modules on Windows (file locks break pnpm). The LCU PUUID is NOT valid for the Riot API (per-key encrypted PUUIDs): resolve gameName#tagLine via Account-V1. `RIOT_ID` must be quoted in .env. A fresh dev key can take ~30s to activate. |

Direct mode (dev only): in a development build with `RIOT_API_KEY` set and `SERVER_URL` empty, the desktop **main process** calls the Riot API itself (`DirectProfileSource`). Packaged builds always use the server (`ServerProfileSource`, `profileMode()`). The key never reaches the renderer.

## Hard rules (from the spec)

- **Never hardcode game data**: champions, items, runes, summoner spells, patches, rank tiers, queue IDs, rate limits, meta stats. They come from Data Dragon, the LCU / CommunityDragon game data, the Riot API, our collector, or versioned config in `config/`.
- **Every outside service sits behind its own adapter** (`packages/lcu`, `packages/riot-api`, `packages/ddragon`, `packages/live-client`, `packages/jev`, later `packages/overwolf`).
- **Riot compliance**:
  - No game memory access. Use only the LCU, the Riot API, the Live Client Data API and (optionally, later) Overwolf events.
  - Suggest, never decide: never auto-pick, auto-ban, auto-lock, or call any LCU endpoint that acts on champ select. The LCU HTTP client only does reads (GET) and WebSocket subscribes. **Single exception (approved Oct 5, 2026):** a separate, flag-gated LCU writer may create a rune page and write an item set, and only in direct response to the player clicking an import button. No other LCU writes, ever.
  - Never show teammates' or enemies' names, ranks or histories. Draft data passes through `sanitizeChampSelect()` (packages/lcu) before it reaches the engine or the UI. Only the local player's own identity is used, and only for their own data. Other players appear only as anonymous aggregates.
  - In-game advice uses only what the client shows (Live Client Data API). No enemy cooldown or ultimate tracking.
  - No Arena augment or item win rates anywhere.
  - No data brokering. Collector rows are stored without PUUIDs or names.
  - Show the Riot "isn't endorsed by Riot Games" notice in the app.
- **Riot API keys and other secrets never ship in the desktop app.** They live in the server's environment (Railway variables) or the local `.env` (gitignored) for development. Keep `.env.example` up to date.
- Validate all incoming data with Zod. LCU and Riot schemas are loose: they check the fields we use and tolerate new ones.
- Engine (`packages/engine`) and aggregation (`packages/meta`) are pure functions: no network, no filesystem. Weights per rank band live in `config/engine.v*.json`. The desktop scores drafts locally from server snapshots; the server never needs the live draft.
- Every package has Vitest tests. `pnpm test` and `pnpm typecheck` must pass before you finish.

## Git rules (follow these for the whole project)

- Work on one branch per milestone (`milestone-1-foundation`, `milestone-2-personal-coach`, `milestone-3-server`, and so on), created from `main`.
- Commit after every completed, working step: small commits, one logical change each, using Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`).
- Run tests and type checks before every commit (`pnpm typecheck && pnpm test`). Never commit failing code.
- Push to the remote after every commit.
- When a milestone is done and all tests pass, merge its branch into `main`, tag the merge (`v0.1.0` for milestone 1, `v0.2.0` for milestone 2, and so on), and push the tag.
- Update `CHANGELOG.md` at each tag with what changed.
- Never commit secrets, API keys or tokens. Check the staged diff (`git diff --cached`) before each commit.
- Recorded champ select fixtures must be anonymised before committing: strip Riot IDs, PUUIDs, summoner names and any other player identifiers. The recorder anonymises on write. Raw recordings go to the gitignored `packages/lcu/fixtures/raw/`, and a test fails if a committed fixture contains identifier fields.
- Never force-push, rewrite history, or delete branches or tags without asking the owner first.
- If something breaks, fix it with a new commit or revert to a tag; never edit published history.

## Commands

```powershell
pnpm install
pnpm typecheck        # tsc --noEmit across all packages
pnpm test             # vitest across all packages
pnpm desktop          # build + launch the Electron panel
pnpm --filter @ldc/lcu record   # record a live champ select into an anonymised fixture
pnpm --filter @ldc/lcu mock     # fake League client replaying a fixture; then set LDC_LCU_OVERRIDE as printed
pnpm --filter @ldc/server dev   # run the server locally (reads .env); SERVER_URL=http://localhost:8787 puts the desktop in server mode
pnpm --filter @ldc/server invite "note"   # create a one-time invite code
pnpm --filter @ldc/desktop dist:win      # Windows installer (LDC_SERVER_URL, LDC_UPDATE_URL: see docs/DEPLOY.md)
```

Dev aids: `LDC_USER_DATA_DIR` (throwaway app profile), `LDC_SCREENSHOT=path.png` (+ `LDC_SCREENSHOT_DELAY_MS`) saves a screenshot of the panel and quits.

## Layout

- `apps/desktop`: Electron (ow-electron-compatible) + React + Vite panel. Main process = adapters + engine; renderer = UI only.
- `apps/server`: Hono + SQLite (better-sqlite3 + Drizzle). Users, invites, profiles, meta snapshots, config, advice log; jobs for user sync, collector and hourly aggregation, all in one process.
- `packages/shared`: shared types. `packages/lcu`, `packages/riot-api`, `packages/ddragon`, `packages/jev` (frozen), later `packages/live-client`: adapters. `packages/engine`: scoring. Later `packages/meta`: aggregation.
- `config/`: `engine.v1.json` (factor weights per band, smoothing, playstyle axes, pool thresholds), `explain.v1.json` (all wording of reasons, axis/metric labels and formats; text never contains numbers the engine didn't produce), `rank-bands.v1.json` (tier → band), `app.v1.json` (supported queues, history size), `jev.v1.json` (thresholds). Loaded at runtime; the server will serve them from `/config`.
- `.railway/railway.ts`: Railway infrastructure as code (service, volume, domain, sleep, limits, non-secret variables). `docs/CLOUD.md`: cost choices and cost log.
- `research/`: the Oct 5, 2026 research and roadmap (data sources, competitors, design, architecture, decisions, assumptions).
- Node 22 LTS target (`.nvmrc`), TypeScript strict, ESM.

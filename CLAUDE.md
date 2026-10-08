# CLAUDE.md — LoL Draft Coach

**The source of truth is [docs/SPEC.md](docs/SPEC.md). Read it before doing any work.** If a prompt conflicts with the spec, follow the spec and say so. The research behind the current plan (sources, design, architecture) is in [research/](research/ROADMAP.md).

## Current status (update this as it changes)

| Item | Status |
| --- | --- |
| Riot API key | **Personal key** (approved 2026-10-08, never expires; 20 req/s, 100 req/2 min) in `.env` and on the Railway service (`RIOT_KEY_TYPE=personal`). Swap both with `pnpm riot:key RGAPI-... [--personal]`; `/health` shows `riotKey: "rejected"` if Riot revokes it. A personal key covers only a small private group: going public needs a production key and Riot's approval. New features must be added to the product's description in the Developer Portal. PUUIDs are per key: a key change makes stored PUUIDs invalid; sync and registration recover them by Riot ID (live once v0.7.0 is on main). The key lives only on the server (and the local .env for dev). |
| Overwolf | Developer access **pending** and no longer needed for data: in-game data comes from Riot's Live Client Data API. Overwolf is optional, only for an overlay window later. Keep `apps/desktop` ow-electron-compatible: only standard Electron APIs. |
| Jev (TypeSafe AI) | **Optional, off the critical path** (decided Oct 5, 2026). `packages/jev` stays frozen behind `JEV_ENABLED=false`. Confidence labels come from our own sample sizes. Do not guess Jev's API. |
| Sentry | Milestone 9. |
| Releases | Nothing published yet. First build for friends = **v1.0.0**; choose the public update location then (docs/DEPLOY.md). |
| Railway limits | Workspace soft $20 / hard $25, set 2026-10-05 for the period ending 2026-10-16: review then (docs/CLOUD.md). |
| Railway | Live: project `lol-draft-coach`, service `ldc-server` (europe-west4), https://ldc-server-production-c9e7.up.railway.app. Infrastructure is code in `.railway/railway.ts` (`pnpm infra:plan` / `pnpm infra:apply`); never change settings in the dashboard. Costs and the cost log: `docs/CLOUD.md`. The service sleeps when unused: no background timers that make outbound requests. |
| Milestones | 1 (v0.1.0), 2 (v0.2.0), 3 (v0.3.0, server + friends), 4 (v0.4.0, the coach explains), 5 (v0.5.0, live meta: hourly collector, engine v2, bans) and 6 (v0.6.0, loadout: runes, shards, spells, skills, boots, role quests, items by win added, click-only import) done. v0.6.1 added one-click spells (with the rune page), the full-build item set and a "Later: pick by situation" pool for thin data; todo: revisit the item engine with production data (D36). v0.6.2 is the panel redesign to the design system (https://claude.ai/artifact/P9odVMtkmLEyxFW6LgmRxu): tables and build-site layouts (picks, bans, Runes · Build · Matchups, pool), every screen fits 440 × 720 without scrolling; the owner keeps the denser type scale (`--fs-*` in styles.css). Milestone 6 is closed. **Now: M7 grow on branch `milestone-7-grow`: all features built (post-game card + advice log, growth focus, new champions, monthly report, draft simulator, design system synced); waiting for the owner to try it before the v0.7.0 release. Progress and open questions in [docs/M7-PLAN.md](docs/M7-PLAN.md).** **M8 power spikes on branch `milestone-8-spikes` (worktree `../lol-draft-coach-m8`, from `milestone-7-grow`): all steps built; showing spikes waits for production data to pass the split-half check (progress in [docs/ENGINE-PLAN.md](docs/ENGINE-PLAN.md)).** 9 in game + polish. Item ranking needs more data: re-run the backtest after a few days of production collection (D30). The suggestion engine needs an upgrade later, once production data builds up (owner, 2026-10-06): re-run `pnpm --filter @ldc/server backtest` first. Progress tracker: https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD |
| Fixtures | Synthetic draft + one real Ranked Flex recording (`packages/lcu/fixtures/recorded/`). Record more with `pnpm --filter @ldc/lcu record`. |
| Gotchas | Git Bash rewrites args like `/data` into Windows paths: use `MSYS_NO_PATHCONV=1` for railway CLI calls with absolute paths. Run Railway IaC through `pnpm infra:plan` (the SDK can't launch the npm `.cmd` shim of the CLI). better-sqlite3 13 ships prebuilt binaries: do NOT add it to `onlyBuiltDependencies` (that triggers a node-gyp build that fails without VS tools). Don't leave a shell `cd`-ed inside node_modules on Windows (file locks break pnpm). The LCU PUUID is NOT valid for the Riot API (per-key encrypted PUUIDs): resolve gameName#tagLine via Account-V1. `RIOT_ID` must be quoted in .env. A fresh dev key can take ~30s to activate. Changing `.railway/**` (or anything in the server watchPatterns) redeploys `ldc-server` and cuts a running collector wake-up short (runs start at minute 7 each hour and last ~40 min); the next run recovers. Railway volume backups are Pro-plan only (this workspace is Hobby): there are none (docs/CLOUD.md). In Git Bash, don't put backticks inside `node -e "..."` or sed scripts (the shell runs them); edit files with the Edit tool instead. |

Direct mode (dev only): in a development build with `RIOT_API_KEY` set and `SERVER_URL` empty, the desktop **main process** calls the Riot API itself (`DirectProfileSource`). Packaged builds always use the server (`ServerProfileSource`, `profileMode()`). The key never reaches the renderer.

## Hard rules (from the spec)

- **Never hardcode game data**: champions, items, runes, summoner spells, patches, rank tiers, queue IDs, rate limits, meta stats. They come from Data Dragon, the LCU / CommunityDragon game data, the Riot API, our collector, or versioned config in `config/`.
- **Every outside service sits behind its own adapter** (`packages/lcu`, `packages/riot-api`, `packages/ddragon`, `packages/live-client`, `packages/jev`, later `packages/overwolf`).
- **Riot compliance**:
  - No game memory access. Use only the LCU, the Riot API, the Live Client Data API and (optionally, later) Overwolf events.
  - Suggest, never decide: never auto-pick, auto-ban, auto-lock, or call any LCU endpoint that acts on champ select. The LCU HTTP client only does reads (GET) and WebSocket subscribes. **Single exception (approved Oct 5, 2026; summoner spells added Oct 6, 2026):** a separate, flag-gated LCU writer may create a rune page, write an item set, and set the player's own two summoner spells in champ select (`PATCH /lol-champ-select/v1/session/my-selection` with `spell1Id`/`spell2Id` only), and only in direct response to the player clicking an import button. No other LCU writes, ever: never a champion, pick, ban, lock or skin.
  - Never show teammates' or enemies' names, ranks or histories. Draft data passes through `sanitizeChampSelect()` (packages/lcu) and live game data through `sanitizeLiveGame()` (packages/live-client, milestone 9) before it reaches the engine or the UI. Only the local player's own identity is used, and only for their own data. Other players appear only as anonymous aggregates.
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
pnpm --filter @ldc/sim mock mid-counter   # fake client on a simulated draft (packages/sim/scenarios); prints LDC_LCU_OVERRIDE and LDC_META_FILE
pnpm --filter @ldc/server dev   # run the server locally (reads .env); SERVER_URL=http://localhost:8787 puts the desktop in server mode
pnpm --filter @ldc/server invite "note"   # create a one-time invite code
pnpm --filter @ldc/server collect --seconds 120   # one collector wake-up against DATABASE_PATH (reads .env); production uses POST /admin/collect hourly
pnpm --filter @ldc/server backtest                # check engine v2's predictions on held-out collected games (DATABASE_PATH)
pnpm local:server                 # this branch's server on :8788 with the local DB (apps/server/data); reads .env, adds the local settings, prints them
pnpm local:desktop                # the panel against it (server mode, own profile in .local/desktop-profile); run in a second terminal
pnpm --filter @ldc/desktop dist:win      # Windows installer (LDC_SERVER_URL, LDC_UPDATE_URL: see docs/DEPLOY.md)
```

Dev aids: `LDC_USER_DATA_DIR` (throwaway app profile), `LDC_META_FILE=snapshot.json` (development builds: coach from that meta snapshot instead of the server, e.g. a simulator scenario's), `LDC_PROFILE_FILE=history.json` (development builds: your history from a saved `{ matches, masteries }` file, no Riot key needed), `LDC_SCREENSHOT=path.png` (+ `LDC_SCREENSHOT_DELAY_MS`, `LDC_SCREENSHOT_CLICK=Build` to open a tab first) saves a screenshot of the panel and quits (it logs how far the scrolling area overflows).

Testing the desktop against live meta data locally (the dev app otherwise runs in direct mode, which has no meta):
1. Collect real games into a local DB (gitignored): `pnpm --filter @ldc/server collect --seconds 600` (writes `apps/server/data/ldc.sqlite`; ~30 games/min on a dev key).
2. Run the server on it, from `apps/server` (PowerShell): `$env:PORT="8788"; $env:SYNC_INTERVAL_MINUTES="0"; npx tsx --env-file=../../.env src/main.ts` (`.env`'s `ADMIN_TOKEN` and Riot key are used; `pnpm ... dev` doesn't read `.env`).
3. Get an invite (`POST /admin/invites` with the token), set `SERVER_URL=http://localhost:8788` in `.env`, start `pnpm desktop` and register with the invite in the panel.
4. Mock client: `pnpm --filter @ldc/lcu mock synthetic-draft-pick 1` (has a ban phase and a planning hover) or `recorded/real-ranked-flex-jungle`. A server process serves the config it loaded at startup: restart it after changing `config/`.
5. Undo afterwards: remove `SERVER_URL` from `.env`, "Sign out" in the panel.

## Layout

- `apps/desktop`: Electron (ow-electron-compatible) + React + Vite panel. Main process = adapters + engine; renderer = UI only.
- `apps/server`: Hono + SQLite (better-sqlite3 + Drizzle). Users, invites, profiles, meta snapshots, config, advice log; jobs for user sync, collector and hourly aggregation, all in one process.
- `packages/sim`: draft simulator for tests and dev: `draft().me("middle").hover(103).enemy(238).stopAt("my-pick").build()` gives any champ select as a fixture; `meta()` builds a synthetic snapshot with chosen games (thin or solid on purpose); ready-made scenarios in `packages/sim/scenarios`.
- `packages/shared`: shared types. `packages/lcu`, `packages/riot-api`, `packages/ddragon`, `packages/jev` (frozen), later `packages/live-client`: adapters. `packages/engine`: scoring (v1 from your own data; v2 in rating points from a band's `MetaSnapshot`, used when one is loaded). `packages/meta`: pure aggregation of collected matches into snapshots (`BandAggregator`).
- `config/`: `engine.v1.json` (factor weights per band, smoothing, playstyle axes, pool thresholds; `rating`: engine v2 term weights per band, priors, blind-pick, bans), `meta.v1.json` (aggregation window/half-life and the collector's per-wake budget), `explain.v1.json` (all wording of reasons, axis/metric labels and formats; text never contains numbers the engine didn't produce), `rank-bands.v1.json` (tier → band), `app.v1.json` (supported queues, history size), `jev.v1.json` (thresholds). Loaded at runtime; the server serves the scoring config from `GET /config` (ETag).
- `.railway/railway.ts`: Railway infrastructure as code (service, volume, domain, sleep, limits, non-secret variables). `docs/CLOUD.md`: cost choices and cost log.
- `research/`: the Oct 5, 2026 research and roadmap (data sources, competitors, design, architecture, decisions, assumptions).
- Node 22 LTS target (`.nvmrc`), TypeScript strict, ESM.

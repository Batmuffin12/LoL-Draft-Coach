# CLAUDE.md — LoL Draft Coach

**The source of truth is [docs/SPEC.md](docs/SPEC.md). Read it before doing any work.** If a prompt conflicts with the spec, follow the spec and say so.

## Current status (update this as it changes)

| Item | Status |
| --- | --- |
| Riot API key | Development key (expires every 24h) in `.env` as `RIOT_API_KEY`. Personal key applied for. |
| Overwolf | Developer access **pending**. Build nothing that needs Overwolf. Keep `apps/desktop` ow-electron-compatible: only standard Electron APIs, no native Electron forks. |
| Jev (TypeSafe AI) | **No key or docs yet.** `packages/jev` holds only the adapter interface + a mock, behind `JEV_ENABLED=false`. Do not guess Jev's real API. |
| Sentry | Skipped for now. |
| Railway | Not used until milestone 3. |
| Milestones | 1 (foundation, v0.1.0) and 2 (personal coach, v0.2.0) done. Next: 3 (server + collector, Railway). |
| Fixtures | Only a synthetic fixture so far. Record a real champ select with `pnpm --filter @ldc/lcu record` and commit it (it is anonymised on write). |

Interim deviation (agreed with the owner): until `apps/server` exists (milestone 3), the desktop **main process** calls the Riot API with the key from the local `.env`. The key never reaches the renderer. Move these calls behind the server in milestone 3.

## Hard rules (from the spec)

- **Never hardcode game data**: champions, items, runes, summoner spells, patches, rank tiers, queue IDs, rate limits, meta stats. They come from Data Dragon, the LCU, the Riot API, or versioned config in `config/`.
- **Every outside service sits behind its own adapter** (`packages/lcu`, `packages/riot-api`, `packages/ddragon`, `packages/jev`, later `packages/overwolf`).
- **Riot compliance**:
  - No game memory access. Use only the LCU, the Riot API and (later) Overwolf events.
  - Suggest, never decide: never auto-pick, auto-ban, auto-lock, or call any LCU endpoint that acts on champ select. The LCU client in this repo only does reads (GET) and WebSocket subscribes.
  - Never show teammates' or enemies' names, ranks or histories. Draft data passes through `sanitizeChampSelect()` (packages/lcu) before it reaches the engine or the UI. Only the local player's own identity is used, and only for their own data.
  - No Arena augment or item win rates anywhere.
  - No data brokering.
- Validate all incoming data with Zod. LCU schemas are loose: they check the fields we use and tolerate new ones.
- Engine (`packages/engine`) is pure functions: no network, no filesystem. Weights per rank band live in `config/engine.v*.json`.
- Secrets live only in `.env` (gitignored). Keep `.env.example` up to date.
- Every package has Vitest tests. `pnpm test` and `pnpm typecheck` must pass before you finish.

## Git rules (follow these for the whole project)

- Work on one branch per milestone (`milestone-1-foundation`, `milestone-2-personal-coach`, and so on), created from `main`.
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
```

## Layout

- `apps/desktop`: Electron (ow-electron-compatible) + React + Vite panel. Main process = adapters + engine; renderer = UI only.
- `packages/shared`: shared types. `packages/lcu`, `packages/riot-api`, `packages/ddragon`, `packages/jev`: adapters. `packages/engine`: scoring.
- `config/`: `engine.v1.json` (factor weights per band, smoothing), `rank-bands.v1.json` (tier → band), `app.v1.json` (supported queues, history size), `jev.v1.json` (thresholds). Loaded at runtime.
- TODOs carried forward: lane matchup / counter / meta factors (M3), timelines + power curve attribute (M3), templates + Jev + loadout (M4), Overwolf, installer, Sentry, GitHub Actions (M5).
- Node 22 LTS target (`.nvmrc`), TypeScript strict, ESM.

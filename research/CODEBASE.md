# Phase 1 — Codebase review

Snapshot: `main` @ `912fd98` (v0.2.5), 2026-10-05. 32 commits, 96 tracked files, ~4,000 lines of TypeScript.
Baseline health: `pnpm typecheck` clean; `pnpm test` → **117 tests passing** (shared 2, jev 6, riot-api 13, ddragon 6, engine 39, lcu 31, desktop 20).

## 1. Tech stack

| Area | What is used | Where |
| --- | --- | --- |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess`, ESM, `module: preserve` / `moduleResolution: bundler`, `noEmit` (type-check only) | `tsconfig.base.json` |
| Compiler | TypeScript **7** (`typescript ^7.0.2`, the Go-native compiler) used only for `tsc --noEmit` type checks | root `package.json` |
| Runtime | Node 22 LTS (`.nvmrc`, `engines.node >=22`) | |
| Monorepo | pnpm 10 workspaces (`apps/*`, `packages/*`); packages export raw `.ts` (`"exports": "./src/index.ts"`), no build step for libraries | `pnpm-workspace.yaml` |
| Desktop shell | Electron 44 (plain, kept ow-electron-compatible: only standard Electron APIs) | `apps/desktop` |
| UI | React 19 + Vite 8 (renderer), plain CSS | `apps/desktop/src/renderer` |
| Main-process bundling | esbuild 0.28 (`scripts/build-main.mjs` → `dist/main/index.cjs`, `dist/preload/index.cjs`) | `apps/desktop/scripts` |
| Native | `koffi` FFI to `user32.dll` (FindWindowW / GetWindowRect) to dock next to the client — window geometry only, no process memory | `apps/desktop/src/main/dock.ts` |
| Validation | Zod 4 (`z.looseObject` for external payloads, `z.prettifyError` for messages) | every adapter, all config |
| Networking | Node `https` + `ws` 8 for the LCU (self-signed localhost cert), global `fetch` for Riot API / Data Dragon | `packages/lcu`, `packages/riot-api`, `packages/ddragon` |
| Config | `.env` via `dotenv` (secrets), versioned JSON in `config/*.v1.json` (weights, bands, queues) validated at load | `apps/desktop/src/main/env.ts`, `config.ts` |
| Tests | Vitest 5; mock LCU server (HTTPS + WAMP WebSocket with `selfsigned` certs) replays recorded fixtures | `packages/*/test`, `apps/desktop/test` |
| Dev scripts | `tsx` for the recorder and mock CLIs | `packages/lcu` |
| Planned (spec, not built) | Hono server, SQLite (better-sqlite3 + Drizzle), Railway Hobby, Sentry, GitHub Actions, Overwolf ow-electron | `docs/SPEC.md` |

**How it runs.** `pnpm desktop` → esbuild bundles main + preload, Vite builds the renderer, Electron starts. The main process loads `.env` (Riot key, Riot ID, routing), discovers the League client's credentials (process command line via CIM, lockfile fallback), connects to the LCU over HTTPS + WebSocket, loads Data Dragon, pulls the player's last 200 games from the Riot API, and pushes a `ViewState` object to the renderer over IPC. The renderer is UI only (`contextIsolation`, `sandbox`, no Node).

## 2. Architecture

```
                 ┌───────────────────────── apps/desktop (Electron) ──────────────────────────┐
League client ──►│ main: LcuConnector ─► sanitizeChampSelect ─► PersonalCoach ─► ViewState ──►│ IPC ─► renderer (React)
 (LCU, local)    │        DataDragon ───────────────────────────►    │                         │
Riot API ◄──────►│        RiotApi + RateLimiter ◄── loadProfile ◄────┘ (MatchStore: JSON cache)│
Data Dragon ────►│        engine: computeComfort / deriveChampionAttributes / recommendPicks   │
                 └─────────────────────────────────────────────────────────────────────────────┘
```

| Module | Responsibility | Quality notes |
| --- | --- | --- |
| `packages/shared` | Logic-level types: `DraftState`, `DraftSlot`, `PickRecommendation`, `FactorScores`, `CoachStatus`. `Position` is a free string (no hardcoded role list). | Small and clean. |
| `packages/lcu` | Credential discovery, read-only HTTPS client (GET only, by design), WAMP subscriber with reconnect, loose Zod schemas, **`sanitizeChampSelect()` compliance boundary** (allowlist copy: no names/PUUIDs leave the adapter), anonymising fixture recorder, mock LCU server. | Strongest package. Compliance enforced structurally, not by convention. |
| `packages/riot-api` | Account-V1, Match-V5 (ids + match), Champion-Mastery-V4, League-V4. One `RateLimiter` that learns limits from `X-App-Rate-Limit` / `X-Method-Rate-Limit` headers, two priorities (user > collector), Retry-After on 429, fail-fast after a 401/403 with a "renew your dev key" message. | Ready to be reused server-side unchanged. No timeline endpoint yet. |
| `packages/ddragon` | `versions.json` → download champion/item/runesReforged/summoner for the newest patch, disk cache, offline fallback, `patch` event. | Items, runes and spells are loaded and validated but **not used anywhere yet**. |
| `packages/engine` | Pure functions. `computeComfort` (skill = mastery percentile + milestone grades + long-window WR; form = recent in-role WR + experience; Bayesian smoothing toward the player's own average), `deriveChampionAttributes` (damage split, frontline & CC percentiles, role shares — measured from match data), `scoreTeamNeeds`, `roleFit` (meta / off-meta / excluded), `recommendPicks`, `adviseRoles`. A purity test fails if the engine imports network/fs. | Clear, small, well tested (39 tests). Explanations are fact strings ("12 recent jungle games, 58% win rate"), not reasons. |
| `packages/jev` | Interface + `DisabledJev` + `MockJev` + `decideWithFallback` (confidence thresholds, "none of these" option). | Placeholder only; flag off. |
| `apps/desktop` main | `Coach` (draft → view), `PersonalCoach` (account resolution, band, history loading, comfort cache, picks), `profile.ts` (paged Match-V5 loading through a local cache), `match-store.ts` (minimised matches, one JSON per match, folder per hashed PUUID), docking, env/config loading. | `PersonalCoach` mixes 5 concerns (see weaknesses). |
| `apps/desktop` renderer | One `App.tsx`: status line, draft (bans, slots, timer), top-3 picks with factor bars and reasons, "Your roles" in the lobby. | Functional, plain. |
| `config/` | `engine.v1.json` (weights per band + all smoothing/threshold knobs), `rank-bands.v1.json`, `app.v1.json` (queues 420/440/400, 200 games), `jev.v1.json`. | Good: every tunable is out of code. `jev.v1.json` isn't loaded by anything yet. |

## 3. What works today

1. **Live draft panel**: docks beside the client, shows picks, hovers, bans, timer and "your turn"; survives client restarts.
2. **Personal pick suggestions** (top 3) from the player's own pool for the assigned role, from 200 recent Ranked Solo/Flex/Normal Draft games plus mastery:
   - comfort split into long-term *skill* and short-term *form*;
   - role-awareness (Riot's recommended positions from the LCU + positions measured from other players in your games), off-meta picks tagged and penalised;
   - team needs (AD/AP balance, frontline, engage) once allies are known.
3. **Role advice in the lobby** ("Your roles", ranked by recent results).
4. **Rank band** from the client or League-V4.
5. **Compliance**: read-only LCU, sanitised draft, anonymised fixtures with a test guarding them, no identities shown.
6. **Dev ergonomics**: mock client replaying a real recorded draft ("demo mode"), screenshot env hook, clear `.env` errors.

## 4. What is weak or missing (relative to the new goal)

Ordered by how much each blocks the "pro player friend" goal.

| # | Weakness | Evidence | Consequence |
| --- | --- | --- | --- |
| W1 | **Single-user by construction.** The Riot key lives in each user's `.env` and is read by the desktop main process. | `apps/desktop/src/main/index.ts:404`, CLAUDE.md "interim deviation" | Every friend would need their own developer key, renewed every 24 h. Not shareable. Distributing one key inside an installer would leak it. |
| W2 | **No meta at all.** `laneMatchup`, `counterValue`, `metaStrength` are hardcoded `null`. | `packages/engine/src/recommend.ts:466-468` | First pick = pure comfort. Enemy picks have zero effect on the score. "Based on the current meta" is not possible yet. |
| W3 | **Recommendations never leave the pool.** Candidates are only champions in `comfort` (games or mastery). | `recommend.ts:455` | No "new champion to learn" feature possible on the current path; no ban suggestions. |
| W4 | **No playstyle model.** Stored matches keep only damage split, damage taken, CC time and result; items, runes, KDA, vision, gold/CS, `challenges` and timelines are thrown away at `minimizeMatch`. | `apps/desktop/src/main/match-store.ts:473-498` | Can't describe *how* the player plays (aggressive early, scaling, roaming…). The data is already downloaded and then discarded; re-fetching 200 matches is needed once the schema grows. |
| W5 | **Explanations are facts, not reasons.** `reasons: string[]` lists stats; there is no "why this over that", no counterfactual, no confidence. | `recommend.ts:470-486` | The "explain WHY" goal isn't met. |
| W6 | **No runes / items / spells / skill order.** Data Dragon loads them; nothing uses them. | `packages/ddragon/src/index.ts:465-470` | Half the goal (runes, itemization) is absent. |
| W7 | **No memory of advice or outcomes.** Nothing records what was suggested, what was picked, or the result. | — | No learning loop, no growth tracking, no tuning signal for weights. |
| W8 | **Champion attributes come from ~2,000 biased samples** (the 10 participants in the player's own 200 games), `minAttributeSamples: 3`. | `config/engine.v1.json`, `personal-coach.ts:683` | Frontline/engage percentiles are noisy for rarely-seen champions; fine as a stopgap, should come from the collector. |
| W9 | **Slow first load.** Up to 6 id calls + 200 match calls through a limit of 100 requests / 2 min (dev & personal keys). | `apps/desktop/src/main/profile.ts` | ~4 minutes before the first full profile on a fresh install (partial picks appear every 10 matches, which helps). |
| W10 | **`PersonalCoach` is a god class**: account resolution, band detection, history loading, comfort cache, draft scoring and view mapping in one 250-line class. | `apps/desktop/src/main/personal-coach.ts` | Moving logic to a server (milestone 3) means splitting it first. |
| W11 | **Jev dependency in the spec** is a product launched 2026-09-15 with no docs or key yet. | `packages/jev`, SPEC "Jev decision layer" | Milestone 4 as specced is blocked on a third party. The engine can deliver the same value with rules (see DESIGN.md). |
| W12 | **No CI, installer, auto-update or crash reporting.** | spec milestone 5 | Sharing with friends today means "clone the repo and install Node". |
| W13 | Minor: `config/jev.v1.json` unused; positions shown as raw lower-case LCU strings (`utility`); one JSON file per cached match with no index or pruning. | | Cosmetic / housekeeping. |

## 5. What to build on (keep)

- The adapter layout and Zod-at-the-boundary pattern — exactly what a multi-user server needs.
- `RateLimiter` — header-driven, priority-aware; drop-in for the server and collector.
- `sanitizeChampSelect()` + read-only LCU — the compliance story is solid; keep it as a hard boundary.
- The engine's style: pure functions, every knob in versioned config, Bayesian smoothing, "not enough data" instead of guessing. The new playstyle/recommender/growth logic should be written the same way (DESIGN.md).
- Fixture recording + mock LCU — makes the new features testable without playing.

## 6. Implications for the plan

1. Multi-user (W1) forces the server forward: friends cannot each hold a Riot key, so a backend holding **one** key is the first thing to build, before more scoring features. This is milestone 3 in the spec anyway.
2. The richest free data we have is the player's **own match history** (Match-V5 `participants[*].challenges` has ~120 per-player metrics; timelines add per-minute gold/XP/CS). Playstyle profiling (W4) is mostly a matter of *not throwing that data away*.
3. Meta (W2) needs either our own collector (spec) or a legal third-party source; Phase 2 decides which.
4. Runes/items (W6) can start from aggregates over collected matches; Data Dragon gives names and stats only.

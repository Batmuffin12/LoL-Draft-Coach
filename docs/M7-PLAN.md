# Milestone 7 — Grow (v0.7.0): plan

Written 2026-10-06, right after v0.6.2, so a fresh session can start M7 from the repo alone. The source of truth is still [SPEC.md](SPEC.md); the design behind each feature is in [research/DESIGN.md](../research/DESIGN.md) §6–8 and [research/ROADMAP.md](../research/ROADMAP.md) (M7). Progress goes to the tracker: https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD (tasks `m7-1` … `m7-5`).

## Scope (SPEC: "7. Grow")

| Tracker | Feature | SPEC / design |
| --- | --- | --- |
| m7-5 | **Draft simulator** for tests and dev (owner, 2026-10-06) | not in SPEC; supports everything below |
| m7-3 | **Post-game card + advice log** (`POST /advice`, `advice_log` table) | SPEC "After game: learning loop", API table; DESIGN §7 (F6), §8 |
| m7-2 | **Growth focus**: one measurable focus at a time, target, progress | SPEC feature table; DESIGN §7 |
| m7-1 | **New-champion recommender**: top 3 per role with reasons and a first-games plan | SPEC feature table; DESIGN §6 |
| m7-4 | **Monthly report**: axis trends, focus targets met, rank trend | DESIGN §7 (F8) |

Branch: `milestone-7-grow` (created from `main` at v0.6.2). Merge and tag `v0.7.0` when all of it works and the owner has tried it.

## Order of work (each stage = small commits, tests, a tracker update)

1. **Draft simulator (m7-5) first**, so every later stage can be tested with any team.
   - A builder that produces a sanitised champ select session plus a step-by-step frame timeline in the existing `Fixture` format (`packages/lcu/src/fixture.ts`), e.g. `sim().me("middle").ally("jungle", 254).enemy(238).hover(103).ban(...)`, with phases (planning, bans, picks, finalization) and timers.
   - A synthetic `MetaSnapshot` builder (test helper) where you choose each champion's games, so "thin" and "solid" data can both be produced on purpose (solid = at least `loadout.solidGames` games).
   - Hook it into `pnpm --filter @ldc/lcu mock` (a scenario file instead of a recorded fixture) so `LDC_SCREENSHOT` runs and manual tests can use it.
   - Champion ids in scenarios are test data; app code still never hardcodes game data.
2. **Advice log + post-game card (m7-3).**
   - Desktop: when you lock in, remember what was shown (top picks with terms, your pick, its loadout). A small `GameWatcher` on gameflow `EndOfGame` posts it to `POST /advice` with the game id; the result comes from the user sync (Match-V5) and is joined server-side.
   - Server: `advice_log` table (user id, game id, shown advice as JSON, followed?, result), covered by `DELETE /me` and the "Delete my data" button. Only the player's own data, never other players.
   - Panel: a post-game card in the lobby after a game: advice shown, what you picked, followed or not, result, the largest term ("Lane matchup was −4.0"), and (after stage 3) the focus metric this game vs its target.
3. **Growth focus (m7-2).**
   - `packages/meta`: per role and band, how strongly each playstyle metric separates wins from losses (`importance`), next to the existing `references` quantiles in the snapshot.
   - `packages/engine` (pure): pick the focus on your main champion and role: `impact = max(0, median − you) / spread × importance`; target `you + growth.targetStep × (median − you)`; progress = rolling mean over `growth.checkGames` games. New `growth` config block (`window`, `targetStep`, `checkGames`).
   - Server: `growth_snapshots` (axes and rank over time, current focus), in `GET /me/profile`.
   - Panel: "Your focus" in the lobby (Your style tab), and on the post-game card.
4. **New-champion recommender (m7-1).**
   - Traits: Data Dragon `champion.json` `info` (attack, defense, magic, difficulty) and `tags` (the schema is loose; `build()` doesn't read them yet), plus measured attributes from the snapshot.
   - Engine (pure): DESIGN §6 score (similarity to your taste in the role, fills a pool hole, meta strength, ease, style match, minus overlap with your core), top 3 per role, reasons from `explain` templates, "first games plan". Never more than one new champion per role while one is "Learning". New `newChamps` config block.
   - Panel: a third lobby tab ("New for you") or rows under Your pool; a table like the others.
5. **Monthly report (m7-4).** From `growth_snapshots`: axis trend arrows, per-champion form, focus targets met, rank trend. Wording never judges single games.
6. **Release:** versions 0.7.0, CHANGELOG, CLAUDE.md status, merge, tag, push (the server redeploys; avoid minutes :07–:22 when the collector runs).

## Decide with the owner at the start

- The order above (simulator first) and whether all four features ship in v0.7.0 or the monthly report waits.
- Where the post-game card lives (lobby after the game, until dismissed?) and where the new champions go (lobby tab vs profile window).
- Whether new-champion suggestions may include champions the player doesn't own.
- New screens have no design in the design system (https://claude.ai/artifact/P9odVMtkmLEyxFW6LgmRxu): design them with the existing components (Section, tables, Notice, Segmented) at the owner's denser type scale, or update the design system first.

## Rules that matter for M7

- Everything in CLAUDE.md (compliance, Zod, adapters, pure engine/meta, config not code, Vitest, commit gates). Especially: other players never appear by name or rank; the advice log and growth data hold only the player's own data; `DELETE /me` removes them.
- Every screen fits 440 × 720 without scrolling (check with `LDC_SCREENSHOT`; it logs the overflow; `LDC_SCREENSHOT_CLICK=<button text>` opens a tab first). The owner prefers smaller, denser text over cutting content.
- Production has meta for Gold to Platinum (band 2) only so far; growth medians and importance need that band's data. Local testing: `pnpm local:server` / `pnpm local:desktop` (a local DB in `apps/server/data`), or the production server with an invite (docs/DEPLOY.md §2).
- Railway: only through `.railway/railway.ts`; the server must stay sleepable (no background timers making outbound requests).

## Starting M7 in a new session

1. `git checkout milestone-7-grow && git pull` and `pnpm install`.
2. Read CLAUDE.md, docs/SPEC.md and this file; read the tracker's M7 tasks.
3. Confirm the decisions above with the owner, then start with stage 1.

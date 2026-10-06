# Milestone 7 — Grow (v0.7.0): plan

Written 2026-10-06, right after v0.6.2, so a fresh session can start M7 from the repo alone. The source of truth is still [SPEC.md](SPEC.md); the design behind each feature is in [research/DESIGN.md](../research/DESIGN.md) §6–8 and [research/ROADMAP.md](../research/ROADMAP.md) (M7). Progress goes to the tracker: https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD (tasks `m7-1` … `m7-5`).

## Scope (SPEC: "7. Grow")

| Tracker | Feature | SPEC / design |
| --- | --- | --- |
| m7-0 | **Design system for the whole app** (owner, 2026-10-06) | the design system artifact; the base for every new screen |
| m7-5 | **Draft simulator** for tests and dev (owner, 2026-10-06) | not in SPEC; supports everything below |
| m7-3 | **Post-game card + advice log** (`POST /advice`, `advice_log` table) | SPEC "After game: learning loop", API table; DESIGN §7 (F6), §8 |
| m7-2 | **Growth focus**: one measurable focus at a time, target, progress | SPEC feature table; DESIGN §7 |
| m7-1 | **New-champion recommender**: top 3 per role with reasons and a first-games plan | SPEC feature table; DESIGN §6 |
| m7-4 | **Monthly report**: axis trends, focus targets met, rank trend | DESIGN §7 (F8) |

Branch: `milestone-7-grow` (created from `main` at v0.6.2). Merge and tag `v0.7.0` when all of it works and the owner has tried it.

## Order of work (each stage = small commits, tests, a tracker update)

0. **Design system first (m7-0)**, so new screens are built from our own design system (owner: "update first so we have a design working for the whole app").
   - The "LoL Draft Coach" design system (https://claude.ai/artifact/P9odVMtkmLEyxFW6LgmRxu) describes the redesign before the owner's changes. Bring it in line with the app as shipped in v0.6.2: the denser type scale (`--fs-*` in `apps/desktop/src/renderer/styles.css`: body 14, reasons 13, labels and micro 12, hero 32), and the components and patterns added since (Hurts bar, ban reason lines, thin-data "N games" stat, matchups without pair games, lobby roles opening as many as fit with one-line summaries, the empty item cell, the Q/W/E/R skill grid, Support/Mid/Bot names, one-line data note). Update tokens, README rules, layout.md and the component previews to match the code; the code is the reference for what shipped.
   - Then add the M7 screens and components to it before building them: post-game card, "Your focus" (growth), new champions table, monthly report. Where they live in the panel (decision 2) is worked out here, with previews.
   - Load the `artifact-design` skill before editing the artifact; read it with the Artifact tool, and update it in place (same URL).
1. **Draft simulator (m7-5)**, so every later stage can be tested with any team (no UI; can run alongside stage 0).
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

## Owner decisions (2026-10-06)

1. **Order:** confirmed as above (design system, simulator, post-game card, growth focus, new champions, monthly report); all four features ship in v0.7.0.
2. **Where the post-game card and new champions live:** not decided; work it out in stage 0 with design-system previews, then ask the owner.
3. **Unowned champions:** yes, new-champion suggestions may include champions the player doesn't own (say so in the row, e.g. "not owned").
4. **Design:** update the design system first, for the whole app, and build new components from it (stage 0).

## Progress

- **Stage 0 done (2026-10-06):** the design system (version 9) matches v0.6.2 class for class (`bundle.css` is `styles.css`), and has the M7 components (`PostGameCard`, `FocusCard`, `NewChampTable`, `TrendTable`, `FormTable`, `ClosedSection`) and screens (Last game, New, Monthly report). **Proposed placement (decision 2, owner to confirm):** lobby tabs **Last game · Style · Pool · New**; Last game opens first after a game (post-game card, then Your focus); the monthly report opens from a closed "This month" head at the end of Style. Built this way unless the owner says otherwise.
- **Stage 1 done (2026-10-06):** `packages/sim` (its own package, since it needs both the LCU fixture format and the meta types): `draft()` builder with phases, sides, timers and stop points (`planning` … `game-end`), `meta()` synthetic snapshots, scenarios, `pnpm --filter @ldc/sim mock <scenario>`, and the desktop's `LDC_META_FILE` dev aid.

## Rules that matter for M7

- Everything in CLAUDE.md (compliance, Zod, adapters, pure engine/meta, config not code, Vitest, commit gates). Especially: other players never appear by name or rank; the advice log and growth data hold only the player's own data; `DELETE /me` removes them.
- Every screen fits 440 × 720 without scrolling (check with `LDC_SCREENSHOT`; it logs the overflow; `LDC_SCREENSHOT_CLICK=<button text>` opens a tab first). The owner prefers smaller, denser text over cutting content.
- Production has meta for Gold to Platinum (band 2) only so far; growth medians and importance need that band's data. Local testing: `pnpm local:server` / `pnpm local:desktop` (a local DB in `apps/server/data`), or the production server with an invite (docs/DEPLOY.md §2).
- Railway: only through `.railway/railway.ts`; the server must stay sleepable (no background timers making outbound requests).

## Starting M7 in a new session

1. `git checkout milestone-7-grow && git pull` and `pnpm install`.
2. Read CLAUDE.md, docs/SPEC.md and this file; read the tracker's M7 tasks.
3. The owner decisions are above; start with stage 0 (design system), with stage 1 (simulator) alongside if useful.

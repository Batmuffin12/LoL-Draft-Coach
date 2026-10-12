# Next phase: state and data (written 2026-10-12, after v0.7.9)

The facts a new session needs to pick up the next phase without re-deriving them. Read with [PROMPT.md](PROMPT.md), `CLAUDE.md` and `docs/SPEC.md` (the spec wins on conflicts).

## Where things are

| What | State |
| --- | --- |
| `main` | **v0.7.9** (tag on `036a3cf`, 2026-10-12): performance and code health. Production runs it (`/health` → `0.7.9`). |
| Production | Railway `ldc-server`, https://ldc-server-production-c9e7.up.railway.app. Collector wakes at minute 7 each hour for ~40 min; a push to `main` that touches `apps/server/**`, `packages/**`, `config/**`, `pnpm-lock.yaml` or `.railway/**` redeploys and cuts a running collector short: push outside :07–:47. |
| `milestone-8-spikes` | Power spikes (M8), worktree `C:\fullstack\lol-draft-coach-m8`. 10 commits ahead of `main`, **149 behind** (CI red until `main` is merged in). Exit rule: **Oct 15** (below). |
| Roadmap tracker | https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD (artifact database: `tasks`, `log` collections; write with ArtifactData, pin `if_version`). |
| Perf report | `docs/perf/REPORT.md`; summary page https://claude.ai/artifact/PngMfMhFWup1ZHstpQ3tmv. |
| Code health | fallow 3.33.1 health **90.5 (A)**. Keep it ≥ 90: `npx -y fallow@3.33.1 health --score --hotspots`. |
| Tests | 552 (Vitest), `pnpm typecheck && pnpm test`. |

## What v0.7.7 – v0.7.9 changed that matters for the next phase

- **PersonalCoach is split** (v0.7.9): `apps/desktop/src/main/personal-coach.ts` keeps state, events and glue; pure view builders live in `role-view.ts` (pool advice, roles, pick lists, queue preview), `pick-card.ts` (Your pick card, bans, draft notes), `draft-facts.ts` (lockedPick, laneOpponent, banningNow, blindDraft, draftScoring, queue support), `last-game-view.ts`, `game-wait.ts` (NewGameWaiter), `client-state.ts`, plus `style-view.ts` / `focus-view.ts` / `loadout-import.ts`. This was roadmap task **m10-1** (done). New coach features go into these modules, not into the class.
- **State pushes** go through `StatePusher` (`apps/desktop/src/main/state-pusher.ts`): one ViewState per event-loop turn, never an exact repeat.
- **Panel keeps matches on disk** (`profile-matches.json` in the app's profile) and starts with `GET /me/profile?since=…&timelines=1`, asking `?ids=` for missing or updated games (both server params additive).
- **`/config` answers 304** (weak ETag comparison) — the panel no longer downloads the config at every champ select.
- **Perf harness** (`@ldc/perf`, `scripts/perf`): `pnpm perf --label x`, `pnpm perf:compare a b`, `pnpm perf:screens x`, `pnpm perf:guard baseline x` (regression guard: view dumps + pixels + overflow on 12 screens). Budgets in `scripts/perf/budgets.json`; 23/24 met (the full profile with 10 concurrent requests is over, on purpose).

## Open work, in order (from the tracker, checked against git on 2026-10-12)

### Now: M8 power spikes (v0.8.0)

| Task | State | Notes |
| --- | --- | --- |
| ops-5 Merge `main` into `milestone-8-spikes` | **done** (4f4517a) | A merge, not a rebase. Expect conflicts in `personal-coach.ts`: M8's spike lines (game plan, New tab, Build tab) were written against the old class; port them into `pick-card.ts` (plan), `role-view.ts`/`newchamps-view.ts` (New tab) and the loadout views. |
| spk-3 Spike check on production data | blocked (data) | Oct 8 on 10,336 games: item-specific spikes r 0.07–0.16 (noise); the game-phase effect was what looked like spikes (fixed in fe2d7ab). **Oct 12 re-check not run:** with Railway CLI 5.63.1, `railway ssh -s ldc-server -- "cmd"` (and plain `ssh <user>@ssh.railway.com "cmd"`) returns an account summary instead of running the command in the container, so the docs/CLOUD.md copy fails; the owner needs to find the new route (an interactive `railway ssh` session, or an `ssh -T` tool from that summary). Then re-check on a fresh production copy (docs/CLOUD.md "Copy the production database"): `pnpm --filter @ldc/server spikes --windows 2,3,4,5,6,8`. Pass = split-half correlation ≥ 0.5 and ≥ 80% same direction at z ≥ 2. Delete the copy afterwards. |
| spk-7 SPEC: spike info is passive | to do | Before v0.8.0 merges: spikes only on screens the player opens; no pushed "X hit level 6" alerts (Riot/Overwolf compliance). |
| spk-8 Merge and tag v0.8.0 | to do | **Exit rule (Oct 15):** if the check passes, spikes show for champions that pass; if it still fails, ship with spikes hidden behind the check (as built) and your own item timing (spk-6) visible. |

### Then: M9 friends release (v1.0.0)

| Task | Notes |
| --- | --- |
| **Error handling, timeouts, UI states** (owner's next item, not yet a tracker task) | `ServerClient.send` has no fetch timeout or AbortSignal: a server that accepts and never answers leaves the panel loading forever. Add timeouts, and a clear panel state for each failure (asleep / unreachable / 401 / 5xx / bad response). Wake-up retries today only cover errors and 502–504. |
| ops-2 Public download that updates itself | GitHub Releases on this public repo (electron-builder github publish target, no token in the app). **The first GitHub Release is v1.0.0**: never publish one earlier (installed panels treat it as an update). |
| m8-2 Crash reports (Sentry) | Free plan; `beforeSend` strips Riot IDs, PUUIDs and Windows user paths. |
| m9-5 Friends' install guide and patch-day checklist | |
| m9-6 Update the product on Riot's Developer Portal | The owner does it. |
| m9-7 Merge, tag v1.0.0, send invites | Personal key: a small private group (~10). |

### Dated

- **Oct 16:** ops-1 review Railway limits (soft $20 / hard $25) against docs/CLOUD.md.

### Later milestones (unchanged)

M10 in game (v1.1.0; m6-10 item engine first, m10-3 live-client adapter, m8-1 next item), M11 personal engine (v1.2.0; needs friends' games), M12 meta signal quality (v1.3.0; needs more games). Triggers: production key (>~10 users), Claude wording, code signing, Overwolf overlay, Flex/duo.

## Gotchas learned in this run (on top of CLAUDE.md's)

- **Worktrees on Windows:** `git worktree remove --force` unregisters but often can't delete the folder (locked node_modules); `rm -rf` the folder afterwards. A fresh worktree has no `.local/`: `mkdir -p .local` before redirecting logs there.
- **Editing files through Python heredocs:** `\b`, `\d` and similar in Python string literals get eaten or turned into control characters; regexes got corrupted once. Use the Edit tool for regex lines, or write the Python script to a file first.
- **Perf runs share one app profile** (`.local/perf-profile`): the driver wipes app state (advice log, account, caches) before each launch; keep it that way or screens leak state between runs.
- **Quick perf mode** (`--quick`, 20 s replays) can end mid-replay: a click metric with 0 samples there isn't a regression.
- **Main-process `gc()`** in perf runs comes from `v8.setFlagsFromString` (`--js-flags` reaches only renderers).
- **fallow** counts every arrow callback as a function: event-wiring code is dense by nature; keep logic out of `personal-coach.ts` so its hotspot score stays under 50 (48.5 now).

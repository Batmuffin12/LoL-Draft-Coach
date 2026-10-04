# LoL Draft Coach — Build Guide

Oct 4, 2026 · @ofek

Follow these steps in order: finish the checklist, then send the three prompts to Claude Code one at a time, testing after each.

## Before you start

Tick these off before sending the first prompt. Start the two approvals today, since they take time.

- [x] Apply for a Riot personal API key at developer.riotgames.com (until approved, use the development key, which expires every 24 hours).
- [ ] Request Overwolf developer access with League game events enabled (only the in-game overlay needs it).
- [ ] Create a private GitHub repo for the project.
- [x] Make sure `git push` works from your Windows PC (gh CLI or SSH).
- [ ] Get a Jev API key from TypeSafe AI and the link to its docs.
- [x] Have your Railway account ready.
- [ ] Collect your friends' Riot IDs (EUW).
- [ ] Export the LoL Draft Coach spec as Markdown and save it in the repo as `docs/SPEC.md`.
- [ ] Open Claude Code in the repo folder on your Windows PC, with League installed.

## Step 1: Foundation

Paste this prompt into Claude Code. It will ask you for your keys and repo first, then set up git and build the live champ select panel.

When it finishes: follow its manual test steps in a real champ select, and check that the `v0.1.0` and `v0.2.0` tags are on GitHub.

```
You are building "LoL Draft Coach". The full product spec is in docs/SPEC.md. Read it completely before doing anything; it is the source of truth. If something in this prompt conflicts with the spec, follow the spec and tell me.

STEP 1: GATHER INPUTS FIRST
Before writing any code, ask me for everything you need in one message, then wait for my answers. At minimum:
- Riot API key (personal or development key)
- My Riot ID and my friends' Riot IDs (all on EUW)
- League of Legends install path (default C:\Riot Games\League of Legends)
- Whether I have Overwolf developer access and an app ID yet
- Jev (TypeSafe AI) API key and a link to its docs. Jev is a new model; do not guess its API from memory, use the docs I give you
- Railway project details (whether a project and volume already exist)
- Optional: Sentry DSN
- The URL of the private GitHub repo for this project
- Confirmation that git push works from this machine (gh CLI or SSH). If it doesn't, help me set it up before writing code
Add anything else you find you need. If I don't have something yet, design around it and mark it as a TODO.

STEP 2: SET UP GIT
Before any feature work:
- Connect to the remote, create main, and push an initial commit with docs/SPEC.md, CLAUDE.md, README.md, .gitignore and .env.example.
- .gitignore must exclude: .env files, SQLite database files, node_modules, build output, installers, logs, and any local config with keys.
- Add the git rules below to CLAUDE.md so every future session follows them.

GIT RULES (follow these for the whole project)
- Work on one branch per milestone (milestone-1-foundation, milestone-2-personal-coach, and so on), created from main.
- Commit after every completed, working step: small commits, one logical change each, using Conventional Commits (feat:, fix:, test:, chore:, docs:, refactor:).
- Run tests and type checks before every commit. Never commit failing code.
- Push to the remote after every commit.
- When a milestone is done and all tests pass, merge its branch into main, tag the merge (v0.1.0 for milestone 1, v0.2.0 for milestone 2, and so on), and push the tag.
- Update CHANGELOG.md at each tag with what changed.
- Never commit secrets, API keys or tokens. Check the staged diff before each commit.
- Recorded champ select fixtures must be anonymised before committing: strip Riot IDs, PUUIDs, summoner names and any other player identifiers.
- Never force-push, rewrite history, or delete branches or tags without asking me first.
- If something breaks, fix it with a new commit or revert to a tag; never edit published history.

STEP 3: VERIFY CURRENT APIS
Do not rely on memory for external APIs. Check current docs for: Riot API (Account-V1, Match-V5, Champion-Mastery-V4, League-V4), Data Dragon, the League Client API (LCU), and Overwolf ow-electron.

STEP 4: BUILD MILESTONES 1 AND 2 FROM THE SPEC
- Monorepo using the exact stack in the spec's "Build details" section: pnpm workspaces, TypeScript strict, Node 22, the folder structure from the spec.
- CLAUDE.md summarising the spec's rules and the git rules for future sessions.
- packages/lcu: lockfile discovery, HTTPS + WebSocket client, Zod validation of champ select, gameflow and ranked data. Include a fixture recorder that saves real champ select sessions, and a mock LCU server that replays them for tests.
- packages/riot-api: one rate limiter that reads Riot's rate-limit headers (never hardcoded limits), with a priority queue (user requests first, collector second) and Retry-After handling on 429.
- Data Dragon loader: detects the newest version from versions.json and refreshes all static data on a new patch.
- packages/engine: pure functions, no network calls. Implement the comfort and team-needs factors first, with weights read from versioned config per rank band.
- apps/desktop: plain Electron (ow-electron-compatible) panel docked next to the League client that shows the live draft and the top 3 picks from my own champion pool.

HARD RULES (from the spec)
- Never hardcode game data: champions, items, runes, patches, rank tiers, rate limits, or meta stats. All of it comes from live data or config.
- Every outside service sits behind its own adapter.
- Riot compliance: no game memory access; never auto-pick, auto-ban or auto-lock; never show teammates' or enemies' names, ranks or histories in ranked champ select.
- Keep secrets in .env, never in code; keep .env.example up to date.
- Write Vitest tests for every package; tests and type checks must pass before you finish.

WHEN DONE
Summarise what you built, what is still a TODO, and the exact steps for me to test it manually on Windows with a real champ select. Also list the commits, branches and tags you created, and confirm everything is pushed.
```

## Step 2: Server and live meta

Send this once Step 1 works. It builds the server, the match collector and the full recommendations, and deploys to Railway.

When it finishes: deploy to Railway with its instructions, set a usage limit in Railway, test a champ select against the live server, and check that the `v0.3.0` and `v0.4.0` tags are on GitHub.

```
Continue building LoL Draft Coach from docs/SPEC.md and CLAUDE.md. Build milestones 3 and 4.

Follow the git rules in CLAUDE.md: work on a new branch for each milestone, commit and push after every working step, and merge to main with a version tag when the milestone's tests pass.

- apps/server (Hono) and apps/collector as separate modules running in one Node process, as the spec describes.
- SQLite via better-sqlite3 + Drizzle with the tables from the spec's "Data model", including migrations. Prune matches older than about two patches.
- Collector for EUW: band 2 (Gold to Platinum) for win rates and matchups, band 3 (Emerald to Diamond) for builds, runes and skill orders only. Bands come from config. Recency-weighted rolling window, hourly recalculation, trending-champion detection.
- Champion attributes derived from match data (damage type, frontline, CC, power curve), exactly as the spec's "No-hardcoding rules" describe. Optional overrides file, empty by default.
- Bayesian win-rate smoothing and a minimum game count, both from config.
- Every endpoint in the spec's "API contract", with per-user bearer tokens stored hashed.
- Engine: add lane matchup, counter value and meta strength factors.
- packages/jev: Jev adapter using the docs I gave you. Question options built per request from current data, always include a "none of these" or "no change" option, confidence threshold from config, and fallback to the engine's ranking when confidence is low or Jev is unavailable.
- Template-based explanations built from the factor breakdown and Jev's answers.
- Loadout: runes, summoner spells, skill order and items, with one-click import of the rune page and item set through the LCU. Ban suggestions.
- Connect the desktop app to the server instead of computing locally.
- Railway deployment: config for one service, SQLite on a volume, environment variables, and instructions for setting a usage limit.

Same hard rules as before. Tests and type checks must pass.

WHEN DONE
Summarise the work, list TODOs, and give me deployment steps for Railway and manual test steps. Also list the commits, branches and tags you created, and confirm everything is pushed.
```

## Step 3: In-game overlay, polish and test plan

Send this once Step 2 works. It adds the in-game overlay, the installer for friends, and a full test plan, then runs all automated tests.

When it finishes: run the manual tests from `docs/TEST_PLAN.md` in the order it gives, install on a friend's PC, and check that the `v0.5.0` tag is on GitHub.

```
Continue building LoL Draft Coach from docs/SPEC.md and CLAUDE.md. Build milestone 5 and then the test plan.

Follow the git rules in CLAUDE.md: work on a new branch for each milestone, commit and push after every working step, and merge to main with a version tag when the milestone's tests pass.

- packages/overwolf + in-game overlay using Overwolf game events (if my Overwolf access is still pending, build it behind a feature flag and tell me).
- In-game build adjustments using Jev, with item categories derived from Data Dragon item stats.
- Learning loop: record advice given, whether it was followed, and the result through POST /games/result.
- Windows installer and auto-updates that I can share privately with friends.
- Optional crash reporting if I gave you a Sentry DSN.
- GitHub Actions running tests and type checks on every push.

Then write docs/TEST_PLAN.md covering:
1. Unit tests: engine, smoothing, attribute derivation, rate limiter, Zod schemas.
2. Integration tests: replay recorded champ select fixtures through the mock LCU and check the recommendations.
3. Manual tests on Windows: a custom game draft lobby for champ select, rune and item set import, and the Practice Tool for the in-game overlay.
4. Server tests: Railway smoke test, token auth, collector health, rate-limit behaviour under load.
5. Patch-change test: simulate a new Data Dragon version and check that everything refreshes.
6. Friend onboarding: install on a second PC, register, and get recommendations.
7. Fallback tests: Jev unavailable, server offline, LCU not running.

Run every automated test, fix failures, and commit the test plan.

WHEN DONE
Give me a final report: what works, what is untested, and the order to run the manual tests in. Also list the commits, branches and tags you created, and confirm everything is pushed.
```

## If something breaks

Each version tag is a restore point. Tell Claude Code what you want in plain words; it follows the git rules in `CLAUDE.md`.

| Situation                             | What to tell Claude Code                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| The last change broke something       | "Revert the last commit and push."                                                    |
| A whole milestone went wrong          | "Go back to v0.2.0 on a new branch so I can compare."                                 |
| A bug in one feature                  | "Fix the bug in a new commit on a fix/ branch, then merge."                           |
| You're not sure what changed          | "Show me the commits since v0.3.0 and summarise them."                                |
| Riot changes the client after a patch | "Record a new champ select fixture, update the LCU adapter, and tag a patch version." |

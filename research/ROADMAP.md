# Roadmap — from draft helper to "pro player friend"

Research run 2026-10-05, branch `research/coach-plan`. Details: [CODEBASE](CODEBASE.md) · [DATA_SOURCES](DATA_SOURCES.md) · [COMPETITORS](COMPETITORS.md) · [DESIGN](DESIGN.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DECISIONS](DECISIONS.md) · [ASSUMPTIONS](ASSUMPTIONS.md). No source code was changed.

---

## Morning summary (read this first)

**Where you are.** The app works for one person: it watches your champ select, loads your last 200 games and mastery, and suggests 3 champions from your pool with their stats. The code is clean, well tested (117 tests passing) and already split into adapters plus a pure scoring engine, so we keep the stack and build on it. Three things stop it from being the coach you described:

1. **Your friends can't use it.** The Riot key sits in your `.env`. Riot forbids putting a key in an app you hand out, and friends can't share yours. So the **server comes first**: it holds the one key, fetches each friend's games, and the app talks to the server.
2. **It knows nothing about the meta or the enemy.** Three of the five scoring factors are empty. Picks are based only on what you've played, and enemy picks don't change anything.
3. **It reports numbers but doesn't explain.** "12 games, 58% win rate" says what, not why, and nothing covers runes, items, new champions or growth.

**Where meta data comes from.** We can't scrape op.gg or u.gg: OP.GG's terms forbid it, and the spec does too. OP.GG has an official AI endpoint, but its data terms aren't published, so it's off unless they give written permission. The clean option is the spec's plan: **our own collector** pulls Gold–Plat games from the Riot API. The API is free, and the personal key's limit (100 calls per 2 minutes, about 72,000 calls a day) is enough for one rank band. The real cost is hosting: about **$5–8/month on Railway**, or **$0 on Oracle's free tier** if you're OK running a server yourself. Up to about 10 friends, the personal key is fine. At **50 users you need a production key**: it's free, but Riot reviews a working prototype first.

**How the coach will think.** No black-box AI. Every number comes from counted games:
- **Picks**: each champion gets a predicted win chance built from parts you can see: its strength in your rank, its matchup with the enemy laner, how it does against the other enemies and with your allies, what your team is missing, and **your own** results on it, including a small penalty for champions you've barely played. This is the method the open-source tool DraftGap uses, plus the personal part none of the big apps do well. Each part becomes a reason: "+3% into Darius (1,240 games)". The UI also shows "Picked over your Garen because…" and a **Clear pick / Close call / Not enough data** label based on sample sizes.
- **Runes and items**: the most successful pages and builds in your rank and the one above. Situational picks (anti-heal, armour, magic resist) are found **from data**: whatever players buy much more often against healers or burst. This keeps "no hardcoded game data" and fixes itself after item reworks. In game, item advice reads Riot's official **Live Client Data API**, so it no longer waits for Overwolf.
- **Your playstyle**: 8 axes (early pressure, fighting, farming, vision, risk control, objectives, roaming, playmaking). Each is a "top X%" score against players in your role and rank, built from stats Riot already sends us and we currently throw away.
- **New champions**: champions that play like the ones you're good at, fill a gap in your pool (for example, "no AP jungler"), are strong in your rank right now, and aren't too hard to learn. Similarity uses Riot's own champion ratings (damage, durability, crowd control, mobility, utility, difficulty) plus measured stats. The coach suggests one new champion per role at a time.
- **Growth**: **one focus at a time**. It picks the stat where you're furthest behind your rank and that actually decides games in your role, then sets a target halfway to the median: "CS at 10 on Viego: you 58, rank median 66, target 62." The coach tracks it game by game, celebrates when you hit it, and moves to the next focus. A post-game card compares the advice with what happened.

**What I'd add, remove and change, and why.**

| | Item | Why |
| --- | --- | --- |
| ➕ | `apps/server` (Hono + SQLite on Railway), invite codes, bearer tokens | Multi-user is impossible otherwise (the key can't ship). |
| ➕ | `packages/meta` (pure aggregation), collector + hourly snapshots | Legal meta data. |
| ➕ | `packages/live-client` | In-game item advice without Overwolf. |
| ➕ | Engine v2: rating-based terms, explanations, playstyle, pool, new champions, growth | The goal itself. Pure functions like today. |
| ➕ | GitHub Actions CI, Windows installer with auto-update | Shareable and safe to change. |
| 🔁 | Split `PersonalCoach` (one class doing 5 jobs) into account / profile / meta / draft / game services | Needed to swap local data for server data. |
| 🔁 | Keep the richer match data (`challenges`, items, runes, timelines) instead of discarding it | Playstyle and builds need it; already downloaded. |
| 🔁 | Engine scores in win-chance points instead of averaging 0–1 factors | One scale, so reasons can say "+2%" and "why not X" makes sense. |
| 🔁 | The server sends **data snapshots**, and the app scores the draft locally (the spec had the server score each draft) | Instant in champ select, works if the server blips, almost free to host, and your draft never leaves your PC. **Needs your OK** (spec change). |
| ⏸️ | Jev: frozen, off the critical path | No API docs or key. The confidence label comes from our own sample sizes instead. **Needs your OK** (spec change). |
| ⏸️ | Overwolf: deferred | Only needed for a real in-game overlay window. The data comes from Riot's Live Client API. |
| ⏸️ | LLM wording (Claude): later and opt-in | Templates are free and can't invent stats. Claude would cost about $1–4 per user per month. |
| ➖ | Riot key in the desktop app (becomes dev-only) | Can't ship to friends. |
| ➖ | Lobby scouting, enemy timers, auto-lock, Arena stats: never | Riot policy. "We only look at you" is part of the pitch. |

**The single biggest decision for you:** one-click **rune and item-set import** is something every competitor has, but CLAUDE.md allows only read (GET) calls to the League client. I propose a narrow exception: two write calls (rune page and item set), only when you click, never touching pick, ban or lock. Until you decide, the plan shows the loadout without import.

---

## Phased plan (value ÷ effort, MVP first)

Milestone numbers continue the spec's (M1, M2 done). Each one gets its own branch, commits, tag and changelog entry, as CLAUDE.md requires. Effort is a rough guide: S ≈ 1 focused session, M ≈ 2–4, L ≈ 5+.

### MVP = M3 + M4: "friends can use it, and it explains itself"

**M3: Server and friends (v0.3.0)**: value ★★★★★, effort M
1. `apps/server` skeleton: Hono, Drizzle + better-sqlite3, migrations, `/health`. Railway deploy with a usage limit set.
2. `users` and `invites`, `POST /users` (invite code + Riot ID read from the client) → hashed token; `DELETE /me`.
3. `user-sync` job: the existing `riot-api` + limiter, run on the server. Stores the **richer** minimised matches: KDA, CS, gold, vision, items, runes, spells, `challenges`, lane opponent.
4. `GET /me/profile` (incremental) and `POST /me/sync`.
5. Desktop: split `PersonalCoach`; add `ProfileSource` (server mode, plus the current direct mode for dev only); add settings (server URL, invite code); store the token with `safeStorage`.
6. GitHub Actions CI. electron-builder installer + auto-update from a public location. Riot legal notice.
*Done when:* a friend installs the app, pastes an invite code, and sees today's top-3 picks from their own pool without any Riot key on their PC.

**M4: The coach explains (v0.4.0)**: value ★★★★☆, effort M. Needs no meta data yet.
1. Engine: explanation layer (`Term` / `Reason`, templates in `config/explain.v1.json`, "why not X", confidence labels) on the existing comfort and team-needs factors.
2. Engine: playstyle axes (percentiles against lane opponents from your own games), plus your champion taste and game-length tendency.
3. Engine: pool tiers (main / comfortable / learning / rusty) and coverage holes per role.
4. Desktop: lobby view with the playstyle card, pool and holes; picks with reasons and confidence.
*Done when:* the panel says *why*, describes your style, and names a hole in your pool, all from your own data.

### M5: Live meta (v0.5.0): value ★★★★★, effort L
1. `riot-api`: timeline endpoint and League-V4 by tier/division.
2. `packages/meta`: recency-weighted aggregation into champion-role stats, matchups, duos, measured champion attributes and power curves, and metric references/importance per role and band.
3. Server collector (band 2 for win rates, band 3 too for builds) and hourly aggregator → `meta_snapshots`. `/meta/:band` and `/config` with ETags. Patch job and pruning.
4. Engine v2: rating terms (meta, lane, counter, synergy, team, personal with the unfamiliarity penalty), pick-order awareness (blind safety), ban suggestions. Playstyle percentiles switch to band references.
5. Desktop `MetaSource` (download and cache the snapshot; runs on the last one if the server is down).
*Done when:* the stats refresh hourly, enemy picks change the ranking, and bans appear.

### M6: Loadout (v0.6.0): value ★★★★☆, effort M
Runes, spells, skill order, starting and core items from `BuildStats`. Matchup-conditioned rune pages when the sample is big enough. Situational runes and items by **lift**, each with a reason chip. Optional one-click import if D6 is approved.

### M7: Grow (v0.7.0): value ★★★★☆, effort M
New-champion recommender (traits from the LCU / CommunityDragon plus measured stats, with reasons and a first-games plan). Growth focus (selection, target, rolling progress). Post-game card through `POST /advice` (also the advice log). Monthly report. Practice-draft mode on the mock client (F10).

### M8: In game and polish (v0.8.0): value ★★★☆☆, effort M
`packages/live-client` with next-item advice. Sentry (free tier). Patch-day release checklist. Optional LLM wording with a spend cap. Production-key application if you're past about 10 users. Then a code-signing certificate if friends complain about the SmartScreen warning.

### Later or optional
Overwolf overlay window. Friends' opt-in focus leaderboard (F11). Patch diff for your pool (F12). Pro-play signal from Leaguepedia. Tuning weights by logistic regression once about 500 logged games exist. Asking OP.GG for permission to use their endpoint.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| LCU changes after a patch | High (every few months) | Draft reading breaks | Already mitigated: Zod loose schemas, recorded fixtures, mock client; re-record each patch. |
| Personal key judged "public" as friends grow | Med | Key revoked | Stay ≤ ~10 users on the personal key; apply for production before inviting more (A5). |
| Collector sample too small in a band | Med | Noisy matchups | Smoothing toward expectation, "not enough data" labels, longer window, production key. |
| Railway bill > $5 | Med | Small cost | Usage cap in Railway; 256–512 MB; Oracle free as fallback (D4). |
| `challenges` fields renamed or removed | Med | Playstyle axes lose metrics | All optional; axis needs ≥ 2 metrics; Zod loose; field list in config. |
| Riot policy tightens (e.g. on rune import) | Low–Med | Feature removal | Features behind flags; policy rules in one place (CLAUDE.md). |
| Explanations feel generic | Med | Low trust | "Why not X", numbers with sample sizes, post-game accountability card. |
| The unfamiliarity penalty is a guess at first (A10) | High | Mis-ranks new champions | Config default; measure from the advice log; explain it ("you've played it twice"). |
| Scope creep (8 milestones) | High | Never "done" | MVP (M3 + M4) is useful on its own; every milestone ships something visible. |
| Single owner maintenance | High | Patch-day breakage | CI, fixtures, health endpoint, patch checklist. |

## How to share it with friends

**Now (5–10 friends, personal key)**
1. You deploy the server to Railway (one service and a volume; env: `RIOT_API_KEY`, `RIOT_KEY_TYPE=personal`; set a usage limit).
2. Run `invite` once per friend and send them the code privately.
3. The friend downloads the installer from the public releases link and runs it. Windows SmartScreen will warn because the installer is unsigned: "More info → Run anyway". Tell them in advance.
4. They open League, open the app, and paste the code. The app reads their Riot ID from the client, and the server loads their history (a few minutes the first time).
5. Updates install themselves (electron-updater). They can delete their data any time in Settings.

**Later (about 50 users)**
Apply for a production key with the working prototype, then switch to Riot Sign-On or the icon-check verification. Consider code signing. Keep the free tier free (Riot policy if you ever charge).

## Decisions waiting for you (spec or CLAUDE.md changes)

1. **D6**: allow two LCU write calls (rune page, item set) on an explicit click only. *Recommended: yes.*
2. **D17**: the server ships data snapshots and the app scores drafts locally, instead of `POST /recommend` per draft. *Recommended: yes.*
3. **D10**: drop Jev from the critical path and use data-based confidence labels. *Recommended: yes.*
4. **New goal items not in the spec**: playstyle profile, new-champion recommender, growth focus. *Recommended: add them to SPEC.md as milestones M4 and M7.*
5. **Hosting**: Railway ($5–8) or Oracle Always Free ($0, you run the VM). *Recommended: Railway.*
6. **OP.GG**: email them about using their official endpoint? *Optional; not needed for the plan.*

## Gaps and things I couldn't verify

- **u.gg's terms page** couldn't be fetched. I assumed it forbids scraping like OP.GG's does (A3, med).
- **Match-V5 method rate limits** aren't published. The plan uses the app limit, and the limiter reads the real limits from headers (A6).
- **`challenges` field names** come from a library's type definitions (riven), not a live response. Check them against one real match before coding (A7).
- **Hosting and snapshot sizes** are estimates (A8, A12). Measure after M5.
- **Competitor claims** come from review sites and one self-published benchmark (A9). They're used only for qualitative lessons.
- **The unfamiliarity penalty size** is a placeholder (A10).

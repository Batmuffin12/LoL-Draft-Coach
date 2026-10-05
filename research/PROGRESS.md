# Research progress

Autonomous overnight planning run, started 2026-10-05. Plan only: nothing outside `research/` is modified.
Branch: `research/coach-plan` (created from `main` @ 912fd98).

Re-read this file and `DECISIONS.md` after any context compaction.

| Phase | File | Status |
| --- | --- | --- |
| 1. Codebase | CODEBASE.md | done |
| 2. Data sources | DATA_SOURCES.md | done |
| 3. Competitors | COMPETITORS.md | done |
| 4. Design | DESIGN.md | done |
| 5. Architecture | ARCHITECTURE.md | done |
| 6. Roadmap | ROADMAP.md | done |

## Log

- Phase 1: read every source file, config, test list, SPEC.md, BUILD-GUIDE.md, CHANGELOG. Baseline: `pnpm typecheck` clean, `pnpm test` 117 tests passing across 7 packages.
- Phase 2: Riot key tiers/limits/policies, local APIs (LCU game-data, Live Client Data API), static data, meta options, capacity at 1/10/50 users, hosting. Decisions D4–D8, assumptions A3–A8.
- Phase 3: 11 tools reviewed (Blitz, Mobalytics, Porofessor, iTero, winrate.gg, LoLDraftAI, DraftGap — code read, buildzcrank, LoL Recommender, HakkoAI, U.GG/OP.GG). 12 feature ideas F1–F12. Decisions D9–D11.
- Phase 4: inputs/outputs, playstyle axes (verified challenges field names via riven docs), pool tiers & coverage, rating-based engine v2, pick order, bans, loadout via lift, live items, explain layer, new-champion recommender, growth, config keys, compliance table. Decisions D12–D16, assumptions A10–A11.
- Phase 5: target shape, local engine + snapshots (D17), multi-user via invites (D18), server modules/jobs, desktop refactor, revised API, data model, keep/add/remove table, costs incl. LLM (pricing from claude-api skill), security, testing. Decisions D17–D21, assumptions A12–A14.
- Phase 6: ROADMAP.md with morning summary, add/remove/refactor table, M3–M8 plan (MVP = M3+M4), risks, sharing steps, 6 decisions awaiting the owner, unverified gaps. Run complete.

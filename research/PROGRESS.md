# Research progress

Autonomous overnight planning run, started 2026-10-05. Plan only: nothing outside `research/` is modified.
Branch: `research/coach-plan` (created from `main` @ 912fd98).

Re-read this file and `DECISIONS.md` after any context compaction.

| Phase | File | Status |
| --- | --- | --- |
| 1. Codebase | CODEBASE.md | done |
| 2. Data sources | DATA_SOURCES.md | done |
| 3. Competitors | COMPETITORS.md | pending |
| 4. Design | DESIGN.md | pending |
| 5. Architecture | ARCHITECTURE.md | pending |
| 6. Roadmap | ROADMAP.md | pending |

## Log

- Phase 1: read every source file, config, test list, SPEC.md, BUILD-GUIDE.md, CHANGELOG. Baseline: `pnpm typecheck` clean, `pnpm test` 117 tests passing across 7 packages.
- Phase 2: Riot key tiers/limits/policies, local APIs (LCU game-data, Live Client Data API), static data, meta options, capacity at 1/10/50 users, hosting. Decisions D4–D8, assumptions A3–A8.

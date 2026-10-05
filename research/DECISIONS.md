# Decisions log

Running log of what was decided during the research run and why. Newest last.

| # | Decision | Why |
| --- | --- | --- |
| D1 | Write research on a branch `research/coach-plan`, not on `main`. | CLAUDE.md git rules: one branch per piece of work, never commit straight to main. Only files under `research/` are added. |
| D2 | Treat `docs/SPEC.md` as the baseline and the new goal (coach that knows your playstyle, explains why, suggests new champions, growth, multi-user) as an extension of it. Where they differ, the research says so explicitly. | CLAUDE.md: "If a prompt conflicts with the spec, follow the spec and say so." The new goal mostly extends the spec; the differences are logged in ROADMAP.md as proposed spec changes for the owner to approve. |
| D3 | Keep the existing stack (TypeScript strict, pnpm monorepo, Electron + React + Vite, Zod, Vitest; Hono + SQLite planned). | The prompt requires building on the stack unless there's a strong reason; the codebase is clean and well tested, and nothing found justifies a rewrite. |

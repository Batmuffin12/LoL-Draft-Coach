# Prompt: the next phase (M8 exit, then M9 friends release)

You are continuing LoL Draft Coach after v0.7.9. Read, in order: `CLAUDE.md`, `docs/SPEC.md` (wins on conflicts), [STATE.md](STATE.md) (where everything is, open tasks, gotchas), `docs/ENGINE-PLAN.md` on `milestone-8-spikes` (the M8 plan and its production test). The roadmap tracker is https://claude.ai/artifact/M8ftC66LNAy3neFgxvFasD: update its `tasks` and add a `log` entry after each step (ArtifactData, pin `if_version`).

## Work in this order

1. **M8 branch up to date.** In the worktree `C:\fullstack\lol-draft-coach-m8`, merge `main` into `milestone-8-spikes` (merge, never rebase). Port the spike lines into the split coach modules (STATE.md); `pnpm typecheck && pnpm test` green; push; CI green.
2. **Spike re-check on production data.** Copy the production DB (docs/CLOUD.md "Copy the production database to your PC"; read-only SQLite backup over `railway ssh`, into the gitignored `apps/server/data/`), run `pnpm --filter @ldc/server spikes --windows 2,3,4,5,6,8`, record the numbers in `docs/ENGINE-PLAN.md` (M8 progress) and the tracker, **delete the copy**. Never commit it.
3. **Ship M8 by Oct 15** under the exit rule: spikes shown only where the check passes, else hidden behind the check with your own item timing visible. Write the "spike info is passive" SPEC line first. Run the regression guard (`pnpm perf:screens m8` + `pnpm perf:guard baseline m8`, expected differences only where spikes or item timing appear: say why for each) and `pnpm perf:compare` against the last results. Merge into `main`, tag v0.8.0, changelog. Push to `main` outside minute :07–:47 (collector).
4. **M9, starting with error handling:** fetch timeouts in `ServerClient`, and a clear panel state for every server failure; then the self-updating download (GitHub Releases, first release = v1.0.0 only), Sentry, the install guide and patch-day checklist. One commit per change; tests for every new branch of logic.

## Rules that bit before

- Shared checkout: another session may commit; stage explicit paths, check `git diff --cached`.
- Never force-push or rewrite history; never publish a GitHub Release before v1.0.0.
- Keep fallow ≥ 90 (`npx -y fallow@3.33.1 health --score --hotspots`) and the perf budgets (`pnpm perf:compare`); new coach logic goes into the pure view modules, not into `PersonalCoach`.
- Behaviour changes need the regression guard to explain every difference; performance claims need numbers from `pnpm perf`.
- End commits with the attribution lines your session gives you.

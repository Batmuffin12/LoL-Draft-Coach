# Patch-day checklist (owner)

League patches about every two weeks. The app takes game data from Data Dragon, the client and the collector, so a patch needs no release, but the League client's local API (LCU) can change without notice. Run this on patch day, after the client has updated. About 20 minutes, plus a look at the numbers the next day.

## Patch day

1. **Data Dragon has the patch.** `curl -s https://ddragon.leagueoflegends.com/api/versions.json | head -c 60`: the first version is the new patch. The app picks it up at its next start (it checks `versions.json` on every launch); open the panel and check its header shows the new patch and new champions or items appear.
2. **The champ select API still reads.** Record a real champ select with the new client (any Normal Draft or Ranked game): `pnpm --filter @ldc/lcu record`. It writes an anonymised fixture into `packages/lcu/fixtures/recorded/`. Then `pnpm --filter @ldc/lcu test`: the fixture tests replay every recording there, the new one included, and fail if a field the app reads moved (or if a fixture still holds a player identifier). Commit the new fixture on a `fix/lcu-<patch>` branch with any fix it needed, and release a patch version.
3. **Imports still work.** In that champ select, lock in and click **Import** once: the rune page, item set and spells must appear in the client. (These are the only writes the app makes; a changed LCU endpoint shows here first.)
4. **The server sees the patch.** `curl -s https://ldc-server-production-c9e7.up.railway.app/health`: `status` ok, `riotKey` ok, `patch` the new one within a few hours, `collector.stale` false.
5. **Release check.** `pnpm typecheck && pnpm test` on `main`; if anything moved, fix it on a `fix/*` branch and release a patch version (docs/DEPLOY.md "Releases").

## The day after

6. **Collector and snapshot.** `/health` again: `newestMatchAt` within the last hour, the band 2 snapshot's `matches` not falling, `backup.stale` false.
7. **Crash reports.** Sentry: no new issue since the patch (a renamed LCU field usually shows as a Zod error with the field's path).
8. **Meta moves.** Open the panel in a champ select: picks and builds should start reflecting the patch as new games come in (the aggregation window is recency-weighted, so this takes a day or two, not a reset).

Write down anything that broke and how it was fixed in `CHANGELOG.md` with the patch release.

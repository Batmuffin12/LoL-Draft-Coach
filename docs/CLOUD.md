# Cloud: Railway setup and cost

The single place to track how LoL Draft Coach runs in the cloud and what it costs. Update the **cost log** at the bottom whenever you check usage or change a setting.

## What runs

| Resource | Name | Where | Notes |
| --- | --- | --- | --- |
| Project | `lol-draft-coach` | Workspace "ofek ben simchon's Projects" | Environment `production` |
| Service | `ldc-server` | `europe-west4` (Netherlands) | Built from GitHub `Batmuffin12/LoL-Draft-Coach`, branch `main`; deploys on push when server files change |
| Volume | `ldc-server-volume` | mounted at `/data` | SQLite database (`/data/ldc.sqlite`), 5 GB max, alerts at 80/95/100% |
| Domain | `ldc-server-production-c9e7.up.railway.app` | | Health check: `/health` |

## Infrastructure as code

[`.railway/railway.ts`](../.railway/railway.ts) is the source of truth for the setup above: build, start command, sleep, limits, region, volume, domain and non-secret variables. Change it there, never in the dashboard, so git history is the history of the cloud.

```powershell
pnpm infra:plan    # preview what would change on Railway (read-only)
pnpm infra:apply   # apply the changes (asks to confirm)
```

- **Secrets** (`RIOT_API_KEY`, `ADMIN_TOKEN`) and `RIOT_KEY_TYPE` are `preserve()` in the file, so their values stay only in Railway. Change them with `railway variables --service ldc-server --set "RIOT_API_KEY=..."`.
- **Drift check:** `pnpm infra:plan` should print "already up to date". If it lists changes nobody made in code, someone changed the dashboard; copy the change into the file or apply the file.
- **Ordering:** a service can't be managed by both IaC and the old `railway.json`, which was removed when IaC was adopted (2026-10-05). When changing the build or start command, `infra:apply` first, then push the code that needs it.
- `scripts/railway-iac.mjs` wraps the CLI. On Windows, an npm-installed Railway CLI is a `.cmd` shim that the IaC SDK can't run; the wrapper points it at the real `railway.exe`.

## Cost choices

Railway bills **usage**: memory at about $10 per GB-month, CPU at about $20 per vCPU-month, volume at $0.15 per GB-month and egress at $0.05 per GB, on top of the Hobby plan's $5/month, which includes $5 of usage across the **whole workspace** ([pricing](https://railway.com/pricing)). The other projects in the workspace already use more than $5, so every cent this service uses is billed.

| Choice | Setting | Why | Trade-off |
| --- | --- | --- | --- |
| **Sleep when unused** | `sleepApplication: true` | No compute is billed while asleep. The service sleeps 5–10 min after its last outbound traffic ([Railway docs](https://docs.railway.com/reference/app-sleeping)). | The first request after sleeping takes a few seconds and can return a 502. The desktop app retries for up to ~19 s (`WAKE_RETRY_DELAYS_MS`). |
| **No background timer** | `SYNC_INTERVAL_MINUTES=0` | A timer that syncs users every few minutes would keep the service awake. Games now sync when a player opens the app (if older than `SYNC_STALE_MINUTES=30`) and after each game ends. | Data is only as fresh as the last time someone used the app, which is all the app needs. |
| **Small heap** | `node --max-old-space-size=256` | Memory is billed per GB-minute; V8 keeps the heap small instead of growing toward the container limit. Measured idle: ~81 MB. | A sync of 200 games fits easily; raise it if the collector (milestone 5) needs more. |
| **Hard ceilings** | 1 vCPU, 512 MB | A runaway bug can't scale the bill. Usage, not the limit, is billed. | Raise if the collector needs it. |
| **One replica, one region** | 1 × `europe-west4` | Friends are on EUW; Riot's `europe` routing is there too. | No redundancy (fine for a friends' app). |
| **Fewer deploys** | `watchPatterns` | Only server-relevant changes rebuild and redeploy. | |
| **Fast hand-over** | `overlapSeconds: 0`, `drainingSeconds: 10` | A volume can't be shared, so no overlap; old containers stop quickly. | A few seconds of downtime per deploy. |
| **Small transfers** | gzip on API responses; `?since=` incremental profiles | A full 200-game profile is 632 KB gzipped (7.9 MB raw), and later fetches only send new games. | |
| **Small data** | 200 games per user, orphaned matches deleted | Volume stays in the MB range. | |
| **Hourly wake, not always on** | `ldc-meta-wake` cron → `POST /admin/collect` | The collector runs inside the server (a volume attaches to one service only), and only when woken; no timer keeps it awake. | The meta refreshes hourly, not continuously. A rejected dev key stops collecting; snapshots keep the last data. |
| **Bounded meta data** | `maxStoredMatches` 50k per band, `windowDays` 30, only the `challenges` fields the engine reads | Caps disk (~650 MB per band) and keeps aggregation streaming inside the 256 MB heap. | |

### Expected monthly cost (est.)

Assumes 5–10 friends with the service awake about 4 hours a day in total:

| | Awake 4 h/day (with sleep) | Always on |
| --- | --- | --- |
| Memory (~0.1 GB) | ~$0.17 | ~$1.00 |
| CPU (~0.02 vCPU average) | ~$0.07 | ~$0.40 |
| Volume (<0.5 GB) | <$0.08 | <$0.08 |
| Egress (<1 GB) | <$0.05 | <$0.05 |
| **This service** | **≈ $0.30** | **≈ $1.50** |

Plus the Hobby plan's $5/month, which you pay anyway for the other projects.

### What would change the picture

- **Milestone 5 (collector), as built.** The `ldc-meta-wake` cron service (`curlimages/curl`, `7 * * * *`) POSTs `/admin/collect` once an hour and exits after a few seconds. The server wakes, collects for at most `collector.budgetSeconds` (900 s) or `maxMatchesPerRun` (450 matches) inside Riot's rate limit, aggregates, publishes the snapshots, then sleeps again: awake about 20–25 min per hour. Estimate: memory ~0.15 GB × ~37% of the month ≈ $0.55, CPU ~0.1 vCPU while awake ≈ $0.75, volume ≤ 0.7 GB (50k matches per band at ~13 KB) ≈ $0.10, cron container ≈ $0: **about +$1.40/month** (est.; measure after a week). Cheaper knobs: a smaller `budgetSeconds` in `config/meta.v1.json`, or a sparser `cronSchedule` (e.g. every 2 hours) in `.railway/railway.ts`.
- **More users** mean more awake hours; costs stay well under $5 for dozens of friends (est.).
- **The workspace limit.** Usage limits are per workspace and have no expiry. Currently set: **soft $20 (email alert), hard $25** (2026-10-05), meant for the billing period ending **2026-10-16**. Review then: keep, change (`railway usage limit set --target workspace --soft 20 --hard 25 --workspace "ofek ben simchon's Projects"`) or remove (`railway usage limit remove --workspace "ofek ben simchon's Projects"`).

## Backups and restore

**There are no backups yet.** Railway's volume backups are a [Pro-plan feature](https://docs.railway.com/volumes/backups); this workspace is on Hobby, where the schedule is silently ignored (tried 2026-10-06), so it was removed from `.railway/railway.ts`.

What a lost volume would cost: the `users` and `invites` tables can't be re-created (everyone registers again with a new invite). Everything else comes back on its own: each user's games re-sync from Riot when they open the app, and the collector refills the meta within days. A free alternative (an owner-only download of the users and invites to your PC) is a possible follow-up.

## Riot API key

Development keys expire every 24 h and can only be regenerated by hand at https://developer.riotgames.com (login + captcha; automating that would break Riot's terms). The personal key, once approved, never expires. To swap the key everywhere in one go:

```sh
pnpm riot:key RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx              # development key
pnpm riot:key RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --personal   # the personal key
```

It checks the key with Riot, updates `.env`, sets it on Railway (which redeploys) and waits until `/health` reports `"riotKey":"ok"`. `/health` shows `"rejected"` when Riot refuses the key, e.g. the day after a development key was issued.

## How to check

```sh
railway usage projects --workspace "ofek ben simchon's Projects"   # cost so far this billing period, per project
railway metrics --service ldc-server --since 7d                      # CPU, memory, network, volume
railway service status --service ldc-server                          # deployment state (SLEEPING when asleep)
```

## Cost log

| Date | Event | This project (period to date) | Workspace | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-05 | First deploy (0.4.0), 200-game sync for one user | $0.0002 | $11.88 | Idle memory 81 MB, CPU < 0.01 vCPU |
| 2026-10-05 | IaC adopted; sleep on, background timer off, 256 MB heap, 1 vCPU / 512 MB limits | | | Expected ≈ $0.30/month (see above). Memory after deploy: 31 MB; service seen `SLEEPING` while idle |
| 2026-10-05 | Workspace limits set: soft $20, hard $25 | | $11.88 | Review on 2026-10-16 (end of billing period) |
| 2026-10-05 | M5 collector and the `ldc-meta-wake` cron written; `infra:plan` shows 1 to add. **Not applied yet** | | | Expected ≈ +$1.40/month. Apply after M5 is merged and deployed. Local run: 60 matches, 73 Riot calls, 13 s |
| 2026-10-05 | Daily volume backups added to `.railway/railway.ts` (`infra:plan`: 1 change); applied together with the cron at the M5 merge | | | Est. cents per month; check after a week |
| 2026-10-06 | v0.5.0 deployed; `ldc-meta-wake` hourly cron applied. Volume backups **not** applied: Pro-plan only (workspace is on Hobby); removed from the IaC file | | | Cron as estimated (+$1.40/month); no backup cost |
| 2026-10-06 | M6 (branch): the collector also fetches each game's timeline (`timelineShare` 1) and collects the band above (Emerald–Diamond) for builds (`buildBandShare` 0.3) | | | Same awake time (the 900 s budget is unchanged), so no extra CPU or memory; about a third fewer games per hour (each timeline is one more Riot call). A stored game grows from ~13 KB to ~22–28 KB, and band 3 is stored too: volume up to ~2.5 GB at the 50k-per-band cap ≈ +$0.30/month (est.) |
| 2026-10-06 | M6 (branch): snapshot memory measured at full size (a synthetic 50k Gold–Plat + 15k Emerald–Diamond DB, champions spread wider than real): the first version ran out of the 256 MB heap (M5's matchup counting alone held ~170 MB). Fixed: compact pair counter, bounded option and opponent counters, expected win fitted in pass 1, at most 8 items per slot, matchup pages/items only where they differ from the usual. Now completes under a 200 MB heap | | | Each wake-up at full size spends ~70 s aggregating (≈ +1 min awake per hour, cents per month). The band snapshot grows to ~2.5 MB gzipped (was ~0.1 MB); the desktop downloads it at most every 30 minutes when it changed (egress cents per month for a few users) |
| 2026-10-08 | M7 (branch), from the October review: collector run budget 900 → 1800 s (`maxMatchesPerRun` 450 → 900), `lookbackDays` 10 (was the 30-day window), win-rate-band `timelineShare` 1 → 0.5 (build band stays 1), no timelines for remakes | | | The run used ~29 % of the key. Expect ~2.5× more Gold–Plat games per day. Awake ≈ +15 min per hour ≈ +$1.40/month (est., same rate as the cron entry). Check after a week |

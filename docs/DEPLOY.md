# Deploy and share — LoL Draft Coach

How to put the coach server on Railway and give the app to friends. One-time setup takes about 20 minutes.

## 1. Deploy the server on Railway

The live setup is already defined in code: [`.railway/railway.ts`](../.railway/railway.ts). Cost choices and how to check usage are in [docs/CLOUD.md](CLOUD.md). It is deployed today as project `lol-draft-coach`, service `ldc-server`, at `https://ldc-server-production-c9e7.up.railway.app`.

To recreate it (for example in a new workspace):

1. `railway login`, then `railway init --name lol-draft-coach` in the repo (creates and links the project).
2. In `.railway/railway.ts`, remove the `networking.serviceDomains` entry (the old domain belongs to the old project), then `pnpm infra:apply`. This creates the service from GitHub, the `/data` volume and all non-secret settings.
3. Set the secrets (they are never in the file):

   ```sh
   railway variables --service ldc-server --set "RIOT_API_KEY=RGAPI-..." --set "RIOT_KEY_TYPE=personal" --set "ADMIN_TOKEN=<32+ random characters>"
   ```
4. `railway domain --service ldc-server`, then put the new domain back into `networking.serviceDomains` and run `pnpm infra:plan`, which should be up to date.
5. Check `https://<domain>/health`: you should see `"status":"ok"` and `"riotKey":"ok"` (`"rejected"` means Riot refused the key, for example an expired development key; `"missing"` means none is set).
6. Usage limits are per **workspace**: set a hard limit above what the workspace's other projects already use (see docs/CLOUD.md).

Pushes to `main` that touch the server, the packages, `config/` or `.railway/` redeploy it. Railway uses `/health` to decide whether a deploy succeeded. The service sleeps when unused (no compute billed); the first request wakes it in a few seconds.

Swapping the Riot key (daily for a development key; once for the personal key): `pnpm riot:key RGAPI-... [--personal]` updates `.env` and Railway and waits for the server (see docs/CLOUD.md).

## 2. Create an invite for each friend

Each invite works once and lasts 14 days. Only a hash of each code is stored, so copy the code when it's printed. Your own account works the same way: create an invite for yourself.

**From your PC (recommended).** Set `ADMIN_TOKEN` (at least 32 random characters) in the Railway variables and the same value in your local `.env`, then:

```powershell
$t = (Select-String -Path .env -Pattern "^ADMIN_TOKEN=(.+)$").Matches.Groups[1].Value
Invoke-RestMethod -Method Post -Uri https://<your-domain>/admin/invites -Headers @{ Authorization = "Bearer $t" } -ContentType "application/json" -Body '{"note":"for Dana","days":14}'
```

Without a valid token, `/admin/invites` answers 404, as if it didn't exist.

**From the container** (needs an SSH key registered with `railway ssh keys add`):

```sh
railway ssh --service <service> -- node apps/server/dist/invite.js "for Dana" --days 30
```

## 3. Build the installer

On your Windows PC:

```powershell
$env:LDC_SERVER_URL = "https://<your-domain>"   # prefilled in the app, so friends only paste the code
$env:LDC_SENTRY_DSN = "https://<key>@<org>.ingest.sentry.io/<project>"   # crash reports (optional, below)
pnpm --filter @ldc/desktop dist:win
```

The installer is written to `apps/desktop/release/LoL-Draft-Coach-Setup-<version>.exe`.

### Crash reports (Sentry)

Installers built with `LDC_SENTRY_DSN` send crash reports to Sentry; without it they send nothing. One-time setup: a free Sentry account (Developer plan), a project of type **Electron**, and its DSN from Project Settings → Client Keys (the DSN isn't a secret: it only allows sending events).

- What is sent: uncaught errors in the app (main process, plus renderer and native crashes), a "server config rejected" warning when the server's scoring config doesn't fit this app version, and release-health sessions. Every string is scrubbed before it leaves the PC (`apps/desktop/src/main/crash-reports.ts`): Riot IDs, PUUIDs, app tokens, Riot keys and the Windows user name in paths; the user, host name and request headers are dropped.
- Cost: the SDK starts before the window (Electron requires it), ~60 ms on the owner's PC, only in builds with a DSN. The server has no Sentry: loading the SDK there takes ~0.7 s on every wake-up; Railway's logs and `/health` cover it.
- Test it: start a development build with `LDC_SENTRY_DSN=<dsn>` and `LDC_CRASH_TEST=1`; ~8 s after the panel opens it sends a "test crash" error. Check that it appears in Sentry with no Riot ID or user name in it.

### Releases and automatic updates

Nothing is published yet. The first build shared with friends is **v1.0.0**; until then versions stay 0.x and installers are local test builds (`dist:win` never publishes). **Never publish a GitHub Release before v1.0.0**: installed apps take any published release as an update.

Updates come from this repo's **GitHub Releases** (the repo is public, so installed apps read releases without a token; no token ships in the app). Every installer carries that location in `resources/app-update.yml`. To release a version (1.0.0 or later), after merging and tagging it:

```powershell
pnpm --filter @ldc/desktop release
```

The script refuses a version below 1.0.0, uncommitted changes, a HEAD without the `v<version>` tag, or a missing GitHub token (it takes `gh auth token`; the token is only used to upload). It builds the installer and uploads it with its `.blockmap` and `latest.yml` as a **draft** release. Check the draft on GitHub (release notes from the changelog), then **Publish**: from then on installed apps download it in the background on their next start and install it when they close.

Elsewhere instead (for example if the repo goes private): build with `LDC_UPDATE_URL=<public URL>` (generic provider, e.g. a Cloudflare R2 bucket) and upload the same three files there; the release script refuses to run with it set.

## 4. What a friend does

Send them the landing page (`site/`, published to GitHub Pages by `.github/workflows/pages.yml` on pushes to `main`; one-time: repo Settings → Pages → Source: GitHub Actions) or [INSTALL.md](INSTALL.md), plus their invite code. The page's download button points at the newest release's installer and says "Coming soon" until the first release is published. In short:

1. Download and run `LoL-Draft-Coach-Setup-<version>.exe`. The installer isn't code-signed yet, so Windows SmartScreen will warn: click **More info → Run anyway**. Tell friends this in advance.
2. Open League of Legends and log in.
3. Open LoL Draft Coach, paste the invite code and click **Connect**. The app reads their Riot ID from the client. The first load of their last 200 games takes a few minutes while the server fetches them.
4. From then on, the panel docks next to the client and suggests picks in champ select.

They can sign out or delete everything the coach stores about them from the panel footer.

## Limits to keep in mind

- **Personal key:** fine for you and a small group of friends (about 10). Before inviting many more, apply for a production key (free, needs this working prototype). See `research/DATA_SOURCES.md`.
- **Costs:** Railway Hobby is $5/month including $5 of usage. Expect about $5–8 with the collector added in milestone 5. Oracle Cloud Always Free is the $0 alternative.
- **Data:** only each user's own games are stored, without other players' names or IDs. Deleting a user removes their games too.

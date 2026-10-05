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
5. Check `https://<domain>/health`: you should see `"status":"ok"` and `"riotKey":true`.
6. Usage limits are per **workspace**: set a hard limit above what the workspace's other projects already use (see docs/CLOUD.md).

Pushes to `main` that touch the server, the packages, `config/` or `.railway/` redeploy it. Railway uses `/health` to decide whether a deploy succeeded. The service sleeps when unused (no compute billed); the first request wakes it in a few seconds.

When the personal Riot key arrives: `railway variables --service ldc-server --set "RIOT_API_KEY=..." --set "RIOT_KEY_TYPE=personal"`.

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
pnpm --filter @ldc/desktop dist:win
```

The installer is written to `apps/desktop/release/LoL-Draft-Coach-Setup-<version>.exe`.

### Optional: automatic updates

The repo is private, and a GitHub token must never ship inside the app, so updates need a public download location:

- **Option A (simplest):** create a separate **public** GitHub repo, for example `LoL-Draft-Coach-releases`, that holds only releases. Build with
  `$env:LDC_UPDATE_URL = "https://github.com/<you>/LoL-Draft-Coach-releases/releases/latest/download"`, then attach the installer, its `.blockmap` and `latest.yml` (all in `release/`) to a new release in that repo.
- **Option B:** a Cloudflare R2 bucket with public access (free up to 10 GB). Upload the same three files and set `LDC_UPDATE_URL` to the bucket's public URL.

Apps built with `LDC_UPDATE_URL` check for a new version on start, download it in the background, and install it when the app closes. Apps built without it never check.

## 4. What a friend does

1. Download and run `LoL-Draft-Coach-Setup-<version>.exe`. The installer isn't code-signed yet, so Windows SmartScreen will warn: click **More info → Run anyway**. Tell friends this in advance.
2. Open League of Legends and log in.
3. Open LoL Draft Coach, paste the invite code and click **Connect**. The app reads their Riot ID from the client. The first load of their last 200 games takes a few minutes while the server fetches them.
4. From then on, the panel docks next to the client and suggests picks in champ select.

They can sign out or delete everything the coach stores about them from the panel footer.

## Limits to keep in mind

- **Personal key:** fine for you and a small group of friends (about 10). Before inviting many more, apply for a production key (free, needs this working prototype). See `research/DATA_SOURCES.md`.
- **Costs:** Railway Hobby is $5/month including $5 of usage. Expect about $5–8 with the collector added in milestone 5. Oracle Cloud Always Free is the $0 alternative.
- **Data:** only each user's own games are stored, without other players' names or IDs. Deleting a user removes their games too.

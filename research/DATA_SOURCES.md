# Phase 2 — Data sources

Researched 2026-10-05. Every fact has a source; numbers that are my own estimates are marked **(est.)**.

## 1. Summary

| Need | Best legal source | Cost | Verdict |
| --- | --- | --- | --- |
| Live draft, owned champions, your rank, Riot's role list per champion | **LCU** (local client API) — already built | free | Keep. Unofficial but tolerated; read-only. |
| Your match history, mastery, rank | **Riot API** (Match-V5, Champion-Mastery-V4, League-V4, Account-V1) | free | Keep. Needs **one** server-held key for multi-user. |
| Meta: champion WR/PR, matchups, counters, builds, runes, skill orders | **Our own collector** on the Riot API (spec's plan) | free (API) + hosting | Only clean source. Third-party sites forbid scraping. |
| Static game data (names, icons, item stats, runes, spells) | **Data Dragon** — already built | free | Keep. |
| Champion "shape" for similarity (damage/durability/CC/mobility/utility ratings, difficulty, damage type, class tags) | **LCU game-data plugin** (`/lol-game-data/assets/v1/champions/{id}.json`), mirrored by **CommunityDragon** | free | **Add.** Riot's own data, key input for the new-champion recommender. |
| In-game state for live item advice | **Live Client Data API** (`https://127.0.0.1:2999/liveclientdata/*`), official Riot | free | **Add instead of waiting for Overwolf.** |
| Pro play pick priority (optional) | Leaguepedia Cargo API (CC BY-SA 3.0), Oracle's Elixir CSVs | free | Later, optional. |
| Natural-language explanations (optional) | Templates first; Claude API later | templates free | See ARCHITECTURE.md. |

## 2. Riot Games API

### Key tiers

| Key | Who it's for | Rate limits | Expiry / process | Source |
| --- | --- | --- | --- | --- |
| Development | Prototyping, "not meant for public consumption" | 20 req / 1 s, 100 req / 2 min | Deactivates every 24 h | [Riot portal docs](https://developer.riotgames.com/docs/portal) |
| Personal | "just the developer or a small private community"; "may not run your application for public consumption" | 20 req / 1 s, 100 req / 2 min, **never raised** | No expiry; registered without verification | [Riot portal docs](https://developer.riotgames.com/docs/portal) |
| Production | "large communities or the Internet as a whole" | 500 req / 10 s, 30,000 req / 10 min (can be raised for good standing + community benefit) | Requires a **working prototype** and product registration + audit; new features need approval | [Riot portal docs](https://developer.riotgames.com/docs/portal), [General policies](https://developer.riotgames.com/policies/general) |

- App and method limits are **per region / routing value** ([HexDocs rate limiting](https://github.com/CommunityDragon/HexDocs/blob/master/lol/riotapi/rate-limiting.md)). EUW platform calls (`euw1`) and regional calls (`europe`) are separate buckets. Our `RateLimiter` already keys scopes per host, so it handles this.
- Method limits for Match-V5 are not published in a stable doc; they come back in `X-Method-Rate-Limit`. Our limiter reads them. For planning, the **app limit (100 / 2 min)** is the binding one on a personal key.

### Policy rules that shape the design

| Rule | Quote / source | Design impact |
| --- | --- | --- |
| Don't ship the key in a binary | "Do not include your API key in your code, especially if you plan on distributing a binary." ([General policies](https://developer.riotgames.com/policies/general)); "You may not sell, transfer, sublicense or otherwise disclose Your API Key(s)" ([API Terms](https://developer.riotgames.com/terms)) | **Friends cannot get the key in the installer, and friends cannot share your key.** A server must hold it. This is the main reason to build the server first. |
| One product per production key | "Do not use a Production API key to run multiple projects" ([General policies](https://developer.riotgames.com/policies/general)) | One key for desktop + server + collector is fine (one product). |
| Free tier required if monetised | "You must have a free tier of access for players" ([General policies](https://developer.riotgames.com/policies/general)) | Not relevant now; noted for later. |
| Legal notice | "[Your product] isn't endorsed by Riot Games…" readily visible ([General policies](https://developer.riotgames.com/policies/general)) | Add to the panel's About/footer. |
| No dictating decisions | "Apps that dictate player decisions" are unapproved ([LoL docs](https://developer.riotgames.com/docs/lol)) | Already a hard rule: rank options with reasons; never a single "do this". |
| No hidden-player analysis | "Products cannot identify or analyze players who are deliberately hidden by the game" ([LoL docs](https://developer.riotgames.com/docs/lol)) | `sanitizeChampSelect()` stays the boundary. |
| No Arena augment/item win rates | ([LoL docs](https://developer.riotgames.com/docs/lol)) | Already a hard rule. |
| No info "previously unknown to the player" | ([LoL docs](https://developer.riotgames.com/docs/lol)) | In-game advice may use only what the player can see (Live Client Data API content is fine; it is what the client shows). |
| Enemy ultimate timers banned (since 2025-03-13) | ([Buildzcrank summary](https://buildzcrank.com/en/blog/riot-api-and-third-party-apps-what-is-allowed/)) | Never add cooldown tracking of enemies. |
| Memory access blocked for unknown apps from **2026-10-06** | ([Riot Support](https://support.riotgames.com/en-us/riot/performance/game-memory-access-removed-for-third-party-apps)) | We never read memory; LCU + Riot API + Live Client Data API only. |
| On termination, delete all Game Information | ([API Terms](https://developer.riotgames.com/terms)) | Keep stored data prunable (spec: ~2 patches). Support "delete my data" per user. |
| RSO (Riot Sign On) only for production keys | ([Riot dev support — VALORANT/RSO](https://support-developer.riotgames.com/hc/en-us/articles/22698769097107-VALORANT)) | Friends can't log in with Riot accounts until production. Use an invite token + Riot ID for now (spec's design), and verify ownership another way (see ARCHITECTURE.md). |

### Endpoints we use or should add

| Endpoint | Use | Status |
| --- | --- | --- |
| Account-V1 by-riot-id | Riot ID → PUUID (PUUIDs are per-key encrypted; LCU PUUID ≠ API PUUID) | built |
| Match-V5 ids-by-puuid, match | Personal history; collector input | built |
| **Match-V5 timeline** | Per-minute gold/XP/CS, item purchase order, skill order, kills by minute → playstyle (early vs late), power curves, real build paths | **add** |
| Champion-Mastery-V4 by-puuid | Pool, skill signal, grades | built |
| League-V4 entries-by-puuid | Band | built |
| **League-V4 entries by queue/tier/division** (+ challenger/grandmaster/master leagues) | Collector seed players per band | **add** (spec step 1) |

### What the data already contains (and we discard)

Match-V5 `participants[*]` carries, beyond what `minimizeMatch` keeps: kills/deaths/assists, gold, CS, vision score, wards, items 0–6, summoner spells, `perks` (full rune page), `challenges` (a large object of derived per-player metrics such as kill participation, damage per minute, early laning advantages, solo kills, skillshots dodged), `teamPosition`, and team objectives. Exact `challenges` keys must be read from a live response before coding (Zod loose schema, optional fields) — **do not trust a remembered list**. This is the raw material for playstyle profiling (DESIGN.md §2).

## 3. Riot local APIs (no key, no rate limit)

| API | What | Legal status |
| --- | --- | --- |
| LCU (`https://127.0.0.1:<port>`, lockfile auth) | Champ select, owned champions, ranked stats, recommended positions, **game-data plugin** (champion summary incl. `tacticalInfo`, `playstyleInfo`, `championTagInfo`, roles), rune pages, item sets | Unofficial, tolerated. Read-only today. **Write calls** (rune page, item set import) are used by every major tool, but CLAUDE.md currently allows only GET → needs an explicit owner decision (see DECISIONS.md D6). |
| Live Client Data API (`https://127.0.0.1:2999/liveclientdata/allgamedata`, `/activeplayer`, …) | During a game: all champions, items, levels, scores, events, the active player's full stats | **Official**, documented by Riot ([LoL docs](https://developer.riotgames.com/docs/lol); sample: [liveclientdata_sample.json](https://static.developer.riotgames.com/docs/lol/liveclientdata_sample.json)). Gives us the in-game build-adjustment input **without Overwolf**. |

Example of the champion data (Aatrox, from [CommunityDragon mirror](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/266.json)): `roles: ["fighter"]`, `tacticalInfo {style 3, difficulty 3, damageType kPhysical, attackType melee}`, `playstyleInfo {damage 3, durability 3, crowdControl 2, mobility 2, utility 2}`, `championTagInfo {primary "Sustained Damage", secondary "Self Healing"}`. These are Riot's own designer ratings — perfect, explainable features for "champions like the ones you play". Read them from the LCU when the client is open, and from CommunityDragon on the server (it mirrors the same file). CommunityDragon is community-run and acknowledged by Riot ([CommunityDragon docs](https://www.communitydragon.org/documentation)); no published rate limit, so cache per patch.

## 4. Static data

| Source | Content | Notes |
| --- | --- | --- |
| Data Dragon | Champions, items (with stats), runesReforged, summoner spells, icons, `versions.json` | Built. Updated per patch, sometimes late ([LoL docs](https://developer.riotgames.com/docs/lol)). |
| CommunityDragon | Raw client/game files incl. the LCU game-data plugin; more accurate ability data | Use for champion playstyle ratings on the server. |
| Meraki Analytics `lolstaticdata` | Champion & item data parsed from the wiki: positions, attack type, resource, accurate ability numbers ([repo](https://github.com/meraki-analytics/lolstaticdata), CDN `cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json`) | Optional. Wiki-derived and community-maintained; prefer Riot's own fields. |

## 5. Meta data: legal options

| Option | Legal? | Cost | Quality | Verdict |
| --- | --- | --- | --- | --- |
| Scrape op.gg / u.gg / lolalytics / Mobalytics | **No.** OP.GG ToS forbids "scraping or data mining" and "automated scripts to collect information" ([OP.GG Terms](https://op.gg/lol/policies/agreement)); u.gg terms not retrievable here, assume the same (A3). The spec forbids it too. | — | — | **Rejected.** |
| OP.GG MCP server (`https://mcp-api.op.gg/mcp`, official OP.GG org on GitHub, exposes champion builds, counters, tier lists) ([repo](https://github.com/opgginc/opgg-mcp)) | **Unclear.** The code is MIT; that says nothing about the *data*. Terms of use for the endpoint aren't published; OP.GG's site ToS requires prior written consent for automated collection. | free (?) | High (huge sample) | **Not without written permission.** Worth an email to OP.GG asking for permission for a non-commercial friends tool; until then, not used. Logged as A4. |
| **Own collector on the Riot API** (spec) | Yes — the intended use of Match-V5 | free API; hosting $0–5 | Good enough in one band with ~50–100k matches per 2 patches (est., §6) | **Primary.** |
| Pro play (Leaguepedia Cargo API, CC BY-SA 3.0; Oracle's Elixir free CSVs) ([Leaguepedia dev docs](https://lol.fandom.com/wiki/Category:Developer_Documentation), [Oracle's Elixir downloads](https://oracleselixir.com/tools/downloads)) | Yes, with attribution | free | Small samples, different meta than Gold–Plat | Later, as a "pros are picking this" flavour signal only. |

## 6. Capacity and cost: 1 user vs 50 users

Assumptions **(est.)**: a new user's onboarding = 200 matches + ~6 id pages + mastery + league + account ≈ 210 calls (with timelines: ≈ 410). A regular user plays ~5 games/day → ~10 calls/day (20 with timelines). Personal-key capacity = 100 calls / 2 min = **72,000 calls/day per routing value** (Match-V5 calls all go to `europe`).

| | 1 user | 5–10 friends (spec scope) | 50 users |
| --- | --- | --- | --- |
| Key type allowed | Personal | Personal ("small private community") | **Production** — 50 people is no longer "small private" in any defensible reading (A5). Apply once the prototype works; free. |
| Onboarding load | 210–410 calls, ~4–8 min first load (est.) | same per user, serialised | 50 × 410 = 20,500 calls ≈ 7 h on a personal key; ≈ 7 min on production limits (est.) |
| Daily user traffic | ~20 calls | ~200 calls | ~1,000 calls |
| Left for the collector per day (personal key) | ~71,900 calls → ~36k matches+timelines/day | ~71,800 | ~71,000 |
| Meta sample per 2-week patch window | ~500k matches possible; **~100k is enough** for champion WR + lane matchups in one band (est.: ~170 champion-role pairs, each match yields 10 champion samples and 5 lane pairs) | same | same; production key makes this ~10× faster |
| Riot API cost | $0 | $0 | $0 |
| Hosting | $0 (local) | $0–5/month (§7) | $5–10/month (§7) |
| Data Dragon / CDragon / LCU / Live Client | $0 | $0 | $0 |

Conclusion: **the Riot API is never the cost**; the personal key's rate limit is generous enough for the collector of one band. The real constraints are (1) the key can't leave the server, (2) 50 users need a production key, (3) the collector must run continuously, which rules out sleeping free tiers.

## 7. Hosting options (for the server + collector)

| Host | Free? | Fits a 24/7 collector + SQLite? | Notes |
| --- | --- | --- | --- |
| Railway Hobby (spec) | $5/month incl. $5 usage | Yes | RAM $10/GB-month, vCPU $20/vCPU-month, volume $0.15/GB-month, max volume 5 GB ([Railway pricing](https://railway.com/pricing)). A 512 MB, mostly idle Node process ≈ $5 RAM + ~$1–3 CPU → **likely $5–8/month** (est.). |
| Oracle Cloud Always Free | **Yes** | Yes (VM, real disk) | Up to 4 ARM OCPUs / 24 GB RAM, 200 GB storage; card required; idle VMs can be reclaimed ([comparison](https://snapdeploy.dev/state-of-free-hosting), [FlyWP](https://flywp.com/blog/9769/)). Most power for $0, but you run the VM (updates, TLS, backups). |
| Render free | Yes | **No** — sleeps after 15 min idle, no persistent disk on free | ([comparison](https://snapdeploy.dev/blog/free-cloud-deployment-platforms-2026-comparison)) |
| Koyeb free | Yes (card since Feb 2026) | Barely: 0.1 vCPU, 512 MB, 2 GB SSD | ([comparison](https://snapdeploy.dev/blog/free-docker-hosting-2026-platforms-compared)) |
| Fly.io | No (2-h trial) | — | ([ExpressTech](https://expresstech.io/7-fly-io-alternatives-in-2026-real-pricing-after-the-free-tier-died/)) |
| Cloudflare Workers + D1 free | Yes | **No for the collector**: 10 ms CPU per request/cron on free; fine for a thin API (100k req/day, D1 5 GB) ([Cloudflare limits summary](https://www.srvrlss.io/provider/cloudflare/)) | Not worth splitting the stack for. |
| Owner's own Windows PC | Yes | Only while it's on | Fine for the 1-user phase (what we do today). |

**Recommendation:** keep Railway Hobby as the default (simplest, already in the spec, $5 is the agreed budget). Document Oracle Always Free as the $0 alternative if the bill creeps past $5. Decision D4.

## 8. Where paying becomes worthwhile

| Trigger | Pay for | Why |
| --- | --- | --- |
| Railway usage > $5 for 2 months | Stay on Railway and accept ~$8, or move to Oracle free | Time vs money; Railway is zero-ops. |
| > ~20 active users or > 1 band collected | Production key (free) + Railway ~$10 | More collector throughput and RAM for aggregation. |
| Want natural, coach-like text | LLM API (opt-in, cached per draft state) | Templates are free and sufficient for MVP. |
| Want signed Windows installer without SmartScreen warnings | Code-signing certificate (~$100–300/year, or Azure Trusted Signing ~$10/month) **(est., verify before buying)** | Only matters once friends complain about the warning. |

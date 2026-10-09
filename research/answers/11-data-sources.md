# 11. More data than the Riot API

Researched 2026-10-09. All web pages were read on that date; dates of the sources are given where they matter. Opinion is marked **(opinion)**; my own arithmetic is marked **(est.)**.

## Short answer

1. **No third party will give us meta data we may store.** op.gg, Mobalytics and Blitz forbid scraping in their terms; LoLalytics says its API "may not be used by third parties"; u.gg has no API and grants no licence. All of these are **not allowed**. The OP.GG MCP server is an official endpoint, but has no published terms for app use: **unclear**, not usable without written permission.
2. **Open datasets exist, and one is current** (EUW, patches 16.13–16.18, 77k games with per-minute timelines), but it is ~97% Master+ and the "MIT"/"CC0" labels on Kaggle cannot relicense Riot's game data: the uploaders don't own it. Use datasets **offline, for methods and slow-changing priors** (learning curves, the shape of power curves, backtests), never shipped as our meta.
3. **The cheapest new source is Riot's own client data, already one HTTP GET away:** CommunityDragon's `champion-rune-recommendations.json` (Riot's recommended rune page + summoner spells per champion and position, refreshed 2026-09-29) and the LCU's end-of-game stats, honor, challenges and match-history plugins.
4. **The real lever for volume is the rate limit, and rate limits are per routing value.** EUW and EUNE share the `europe` bucket for Match-V5, so adding EUNE adds seed players but no throughput. Adding `americas` (NA) and `asia` (KR) triples collector throughput even on the personal key. The production key is ~60× the personal key per region: 30,000 req / 10 min vs 100 req / 2 min.
5. **Our users' own synced matches can feed the meta** (the same Match-V5 data, already stored). That fits Riot's "aggregate player stats (no specific players)" use case, but needs de-duplication and a per-user cap so a few friends don't dominate a band.
6. **Replays are closing, not opening:** from patch 26.21 third-party apps lose replay downloads, and `.rofl` files lost their stats JSON in 13.20. **Not worth building on.**

---

## Q1. Open datasets of League games

Metadata read on 2026-10-09 from the Kaggle API (`/api/v1/datasets/view/<ref>` and `/datasets/list?search=…`) and the Hugging Face API (`/api/datasets?search=…`, `?author=gptilt`).

| Dataset | Size | Patch / season | Ranks, region | Fields | Licence label | Fresh enough for meta? |
| --- | --- | --- | --- | --- | --- | --- |
| [nathansmallcalder / ranked post-match and timeline](https://www.kaggle.com/datasets/nathansmallcalder/league-of-legends-ranked-post-match-and-timeline) | 77,135 matches, 112,862 player-games, 3.2M per-minute rows; 551 MB | **16.13–16.18** (summer 2026) | "roughly 97%" Master–Challenger; EUW; crawled outward from one seed player | end-of-game stats + per-minute gold, XP, CS, damage, items, map position; 9 CSVs | MIT | Patch yes, ranks no (our bands are mostly below Master) |
| [californianbill / Patch 25.14+ ranked games](https://www.kaggle.com/datasets/californianbill/patch-25-14-lol-league-of-legends-ranked-games) | 101,843 matches; 1.3 GB zipped, 9 GB raw | 25.14+ (Aug 2025) | Plat 18.9k, Emerald 15.2k, Diamond 21.1k, Master 39k, Challenger 7.8k; NA | raw Match-V5 JSON incl. `challenges`; no timelines; a player list with ranks | CC0 | No (a year old) |
| [nathansmallcalder / match interval snapshots 2026](https://www.kaggle.com/datasets/nathansmallcalder/league-of-legends-match-interval-snapshots-2026) | 39,954 matches → 2.11M 5-minute snapshots | 2025/26 | "high-elo and standard"; EUW | lane-level gold/XP diffs, objectives, items per 5 min | "Other" | Partly (Feb 2026) |
| [nathansmallcalder / 80k matches](https://www.kaggle.com/datasets/nathansmallcalder/lol-match-history-and-summoner-data-80k-matches) | ~80k matches | 2025/26 | mixed | end-of-game stats + summoner data | "Other" | No (Jan 2026) |
| [mrbridge / jungler ranked EUW 2026](https://www.kaggle.com/datasets/mrbridge/lol-jungler-ranked-euw-2026) | 1,625 games | 2026 | Iron–Diamond, EUW | 26 jungle KPIs per game | CC BY-SA 4.0 | Too small; useful as a jungle-KPI method reference |
| [jakubkrasuski / Season 15 ranked](https://www.kaggle.com/datasets/jakubkrasuski/league-of-legends-ranked-match-data-season-15) | 31 MB | early 2025 | EUNE | end-of-game + mastery | CC BY-SA 4.0 | No |
| [gptilt (Hugging Face)](https://huggingface.co/gptilt): `lol-basic-matches-challenger-10k`, `lol-ultimate-events-challenger-10m`, `lol-ultimate-snapshot-challenger-15min` | 10k matches; 10M enriched timeline events | May–July 2025 | Challenger; Americas, Asia, Europe splits | matches; timeline events with inventories and levels at each event | none stated on the ranked sets | No |
| [gptilt/lol-esports-matches](https://huggingface.co/datasets/gptilt/lol-esports-matches) | 100k–1M rows | pro, updated 2026-09-27 | pro play | drafts + results (from Leaguepedia) | CC BY-SA 3.0 | Yes, but pro only |
| [BoostedJonP/league_of_legends_match_data](https://huggingface.co/datasets/BoostedJonP/league_of_legends_match_data) | 10k–100k rows | Aug 2025 | ranked solo | per-player stats **including `puuid`, `summoner_name`, Riot ID** | Apache-2.0 | No; and it carries identities (we must not ingest those columns) |
| [DraftRec](https://github.com/dojeon-ai/DraftRec) ([paper, WWW 2022](https://arxiv.org/abs/2204.12750), [ACM](https://dl.acm.org/doi/fullHtml/10.1145/3485447.3512278)) | 279,893 matches, 62,466 players, 156 champions; ~16 GB player histories | 2021 | Diamond 2–Challenger ("top 0.1%"), KR | pick order + each player's prior history + result | code repo only | No; methods only (personalised draft model) |
| Classics: [bobbyscience Diamond 10-min](https://www.kaggle.com/datasets/bobbyscience/league-of-legends-diamond-ranked-games-10-min) (2020, 26k downloads), [datasnaek 50k](https://www.kaggle.com/datasets/datasnaek/league-of-legends) (2017), [paololol 180k](https://www.kaggle.com/datasets/paololol/league-of-legends-ranked-matches) (2014–17), [gyejr95 KR Master+ 108k](https://www.kaggle.com/datasets/gyejr95/league-of-legendslol-ranked-games-2020-ver1) (2020), [karlorusovan Emerald/Diamond @15 min](https://www.kaggle.com/datasets/karlorusovan/league-of-legends-soloq-matches-at-10-minutes-2024) (2024, 24k) | 10k–180k | 2014–2024 | mostly Diamond+ | 10/15-minute snapshots or end stats | CC0 / CC BY / Apache / other | No |
| Pro play: [chuckephron competitive 2015–18](https://www.kaggle.com/datasets/chuckephron/leagueoflegends), [Oracle's Elixir mirror on Kaggle](https://www.kaggle.com/datasets/lauffing/oracles-elixir-league-of-legends-pro-play-data), [DeusExMachina1993/LoL-Draft](https://github.com/DeusExMachina1993/LoL-Draft) (RecBole-format pro drafts, monthly from Leaguepedia, CC BY-SA 4.0) | small | various | pro | drafts, results | various | Pro meta only |

**Is any of it current enough for meta?** Only the 16.13–16.18 EUW set is from this year's patches, and it is high-elo and four patches behind (Data Dragon is at 16.20.1 today, [versions.json](https://ddragon.leagueoflegends.com/api/versions.json)). Our bands are mostly below Master, and the spec's meta window is ~2 patches ([meta.v1.json](../../config/meta.v1.json): `windowDays` 30). So: **no dataset replaces the collector.**

**What datasets are good for (opinion, backed by the topic constraints):**
- **Priors that change slowly:** how fast win rate climbs with games played on a champion (learning curves), the *shape* of gold/XP curves by minute and role, how often lane leads at 10/15 min convert. The 16.13–16.18 set has per-minute timelines for 112k player-games, which is more than our timeline collection has for high elo.
- **Backtests and method checks:** run `pnpm --filter @ldc/server backtest`-style evaluation of engine v2 on an independent set to see whether our draft weights generalise. Distribution shift (high elo, older patch) must be stated next to any number.
- **Not for shown numbers:** anything we show players must come from our own current-band data and survive the significance check ("What every answer must respect").

**Licence caveat (important):** Riot's API Terms define "Game Information" as Riot's ("metadata arising from the Game regarding user profiles, user gameplay history, statistics…") and forbid "distributing, selling, transferring… the Riot Games API, any component thereof" ([API Terms](https://developer.riotgames.com/terms), last updated 2013-12-09). Oracle's Elixir states the same principle for its own CSVs: game statistics "are the property of Riot Games" and use "must follow Riot Games' terms and policies" ([Oracle's Elixir downloads](https://oracleselixir.com/tools/downloads), via search excerpt; the page blocks fetching). A Kaggle "CC0" or "MIT" label is the uploader's claim over their *compilation*, not a licence to Riot's data. **Treat every Riot-derived dataset as "Riot data under Riot's terms": use internally, don't redistribute, strip any identity columns.** Some sets (e.g. BoostedJonP's) include PUUIDs and Riot IDs: drop them on import, or don't import.

## Q2. Public APIs that serve League data

### Riot's other APIs (official; our key)

| API | What it serves | Use for us | Notes |
| --- | --- | --- | --- |
| **Match-V5** (+ timeline) | match + per-minute timeline | already the collector | `/replays` endpoint is losing third-party access (see Q5) |
| **League-Exp-V4** `entries/{queue}/{tier}/{division}?page=` | ladder entries incl. apex tiers, paged | collector seeding per band | same data as League-V4 entries; one paged endpoint for all tiers ([RiotWatcher docs](https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/ChallengesApiV1.html), [Postman collection](https://www.postman.com/riftnemesis/riotapi/collection/3lz9qto/riotapi)) |
| **Challenges-V1** | a player's challenge levels; `/challenges/percentiles` = share of players at each level | little: the per-game numbers we need are already in Match-V5 `challenges` | per-player, so only for the local user |
| **Clash-V1** | Clash teams and rosters | **no**: shows other players' teams | identity risk |
| **Spectator-V5** | the live game of a PUUID | **no**: it identifies the other nine players | Riot announced on 2025-10-17 it would deactivate it "to prevent third party applications from deanonymizing players" ([RiotGamesDevRel](https://x.com/RiotGamesDevRel/status/1979263978787246391)); one report says it was back on 2025-10-21 ([Soren.com](https://x.com/sorencom/status/1980651354377818369)) while third-party *live spectate* was removed ([League of Legends](https://x.com/LeagueOfLegends/status/1980434309736771638)). Conflicting; irrelevant for us either way. |
| **Account-V1** in other regions | Riot ID ↔ PUUID | already used (`europe`); `americas`/`asia` only if we add players there | PUUIDs are per key |

### Third parties

| Source | What | API? | Terms (read directly where the site allowed) | Verdict |
| --- | --- | --- | --- | --- |
| **op.gg** | builds, counters, tier lists | official **MCP server** `https://mcp-api.op.gg/mcp` (code MIT) ([repo](https://github.com/opgginc/opgg-mcp)) | Site terms (updated **2026-09-14**): prohibited "scraping or data mining", "use automated scripts to collect information", and "No Site Content may be … copied, distributed, … reproduced, republished, downloaded" ([OP.GG Terms](https://op.gg/lol/policies/agreement)). The MCP repo publishes no data terms or rate limits. | Site: **not allowed**. MCP: **unclear** → only with written permission |
| **LoLalytics** | stats per champion/rank | private JSON API | "This is a private API for the sole use of visitors to the website lolalytics.com. All data inside this API is Copyright LoLalytics Limited and may not be used by third parties." Hopes to release "a public API with a managable portion of our data" someday ([a3.lolalytics.com](https://a3.lolalytics.com/)) | **Not allowed** (re-check yearly for the promised public API) |
| **u.gg** | stats, builds | none public; third-party wrappers ([example](https://github.com/Zadag/simple-u.gg-api)) parse its tables | Terms (last updated 2018-05-25) grant no licence to data and add a non-disclosure clause; robots.txt asserts EU DSM Art. 4 content-signal reservations ([u.gg ToS](https://u.gg/terms-of-service), [robots.txt](https://u.gg/robots.txt)) | **Not allowed** (wrappers are scraping) |
| **Mobalytics** | stats, builds, coaching | no public API | Prohibits access "through the use of any engine, software, tool, agent, device or mechanism (including spiders, robots, crawlers, data mining tools…)" ([Mobalytics Terms](https://mobalytics.gg/terms/), via search excerpt: page returns 403 to fetchers) | **Not allowed** |
| **Blitz** | app + site stats | no public API | Terms (2022-08-05): "prohibited from copying, reproducing, modifying, distributing… the contents of the Services for any purposes" and may not "use the materials for any commercial purpose, or for any public display" ([Blitz ToS](https://blitz.gg/legal/terms-of-service), read with curl) | **Not allowed** |
| **Porofessor** | live-game lookups | no public API | Approved by Riot as an app ([Porofessor on X](https://x.com/PorofessorGG/status/1560340532685062147)); terms page not fetchable; no data licence offered | **Not allowed** (no licence) |
| **iTero** | AI draft coach (Overwolf) | no public API; publishes Riot-API tutorials ([iTero](https://www.itero.gg/articles/riot-api)) | none for data | **Not allowed** / not available |
| **Leaguepedia** (Fandom) | pro games, drafts, rosters via MediaWiki Cargo API | yes, `action=cargoquery` | content CC BY-SA 3.0; unauthenticated Cargo queries throttled to roughly 1 req/min, errors come back in an HTTP 200 body ([mediawiki-api list](https://lists.wikimedia.org/hyperkitty/list/mediawiki-api@lists.wikimedia.org/thread/A6VWUYRHLGGJWZ3USGEBQJSDMX6A4YCM/?sort=date), [Leaguepedia dev blog](https://lol.fandom.com/wiki/Leaguepedia:Dev_Blog/2021), [hextechdocs](https://hextechdocs.dev/gathering-lolesports-data/)) | **Allowed with attribution** (pro only) |
| **Oracle's Elixir** | pro match CSVs, one row per player and team per game | downloads, updated daily | free "for use by analysts, commentators, and fans"; stats are Riot's property, use must follow Riot's policies; parts from Leaguepedia under CC BY-SA 3.0 ([downloads](https://oracleselixir.com/tools/downloads), [GRID note](https://grid.gg/oracles-elixir-brings-cutting-edge-valorant-stats-to-esports-fans/)) | **Allowed** (pro only, attribution) |
| **GRID** | official esports data (live game state, drafts) | commercial | Riot's exclusive esports data partner since Dec 2023 ([GRID](https://grid.gg/riot-games-and-grid-announce-exclusive-global-esports-data-partnership/), [SVG](https://www.sportsvideo.org/2023/12/04/riot-games-and-grid-announce-exclusive-global-esports-data-partnership/), [Esports Insider](https://esportsinsider.com/2023/11/riot-games-grid-major-data-partnership-acquires-equity-stake)) | Pro only, paid; **not useful** for solo queue |
| **Meraki Analytics** `lolstaticdata` | champion and item data parsed from the wiki (ability numbers, positions) | CDN `cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json` | code MIT; asks users to cache ([repo](https://github.com/meraki-analytics/lolstaticdata)) | Allowed, but **stale**: CDN `champions.json` last modified **2025-08-01**, last commit 2025-11-12 (checked 2026-10-09). Don't depend on it. |
| **CommunityDragon** | raw client files incl. the LCU game-data plugin | static files, `raw.communitydragon.org/latest/…` | community-run; recognised in Riot's own docs ecosystem ([CommunityDragon](https://www.communitydragon.org/documentation)); no published rate limit, so cache per patch | **Allowed**; current (`content-metadata.json` = 16.20) |

## Q3. Aggregated stats we could use as priors

| Who publishes | What | Licence | Usable? |
| --- | --- | --- | --- |
| **Riot via the client (CommunityDragon / LCU)** | `champion-rune-recommendations.json`: 1,993 recommended rune pages + summoner spells for 256 champions, per position (TOP 287, JUNGLE 281, MIDDLE 270, BOTTOM 145, UTILITY 261 on Summoner's Rift, plus ARAM), newest `recommendationId` dated 2026-09-29 ([file](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-rune-recommendations.json)); same data from the LCU at `GET /lol-perks/v1/recommended-pages/champion/{championId}/position/{position}/map/{mapId}`. `roles`, `tacticalInfo`, `playstyleInfo` per champion. | Riot's own data, served to every client | **Yes.** A Riot-made prior for runes and spells per champion-position, and a fallback when a band is thin. Not a win rate, so no significance issue; label it "Riot's recommended page". |
| Riot Challenges-V1 percentiles | share of players at each challenge level | Riot API | Weak: not about winning |
| Open datasets (Q1) | anything we compute from them | Riot data under Riot's terms | **Internal priors only** (learning curves, curve shapes), never shown as numbers |
| Leaguepedia / Oracle's Elixir | pro pick/ban rates, pro win rates | CC BY-SA 3.0 / free with attribution | Only as a labelled "pros pick this" flavour; pro meta ≠ solo queue in our bands |
| op.gg, u.gg, LoLalytics, Mobalytics, Blitz, METAsrc | champion WR by rank, matchups, builds | proprietary, no licence | **Not allowed** |

No one publishes solo-queue champion win rates by rank, matchups or item win rates under an open licence with a download or API (searched Kaggle, Hugging Face, GitHub and the sites' own terms). **No evidence found** of an open, current source.

## Q4. More from Riot itself

**Production key** ([Riot portal](https://developer.riotgames.com/docs/portal)):
- Limits: 500 req / 10 s and 30,000 req / 10 min, "enforced per region"; can be raised for apps "in good standing" with "strong community benefit" that have "steadily outgrown" it. Personal key: 20 req / 1 s, 100 req / 2 min, never raised. So production ≈ **60×** personal per region (3,000 vs 50 requests per minute, est.).
- Requires: "a working prototype"; for "large communities or the Internet as a whole"; one product per key ([General Policies](https://developer.riotgames.com/policies/general), updated 2025-05-29). Community checklists add: a public website with Terms of Service and a privacy policy, domain verification (riot.txt), screenshots, a description focused on helping players improve, and clean rate-limit handling ([riot-api-libraries](https://riot-api-libraries.readthedocs.io/en/latest/applications.html), [TrueMain issue #1363](https://github.com/ilyanfraimbault/TrueMain/issues/1363), Sept 2026).
- Review time: stated ~2 weeks / 1–3 weeks, but real cases run much longer: one app pending since 2026-02-14 (7+ months, three unanswered tickets, [developer-relations #1192](https://github.com/RiotGames/developer-relations/issues/1192)); another since 2025-12-23 ([#1127](https://github.com/riotgames/developer-relations/issues/1127)). **Apply early; plan for months.**
- RSO (Riot Sign-On) is only for production apps ([Riot dev support](https://support-developer.riotgames.com/hc/en-us/articles/22698769097107-VALORANT)).
- Key change ⇒ new PUUIDs (already handled: CLAUDE.md, recovery by Riot ID).

**Several regions?** Yes, one key works on every routing host; limits are counted per routing value ([portal](https://developer.riotgames.com/docs/portal), [HexDocs rate limiting](https://github.com/CommunityDragon/HexDocs/blob/master/lol/riotapi/rate-limiting.md)). But Match-V5 is called on the **regional** host, and EUW1, EUN1, TR1, ME1 and RU all map to `europe` ([Riven route.rs](https://github.com/MingweiSamuel/Riven/blob/v/2.x.x/riven/src/consts/route.rs), [Riot LoL docs routing values](https://developer.riotgames.com/docs/lol)). So:
- **EUW + EUNE**: more seed players (League-V4 is per platform), **no more Match-V5 throughput** (same `europe` bucket).
- **EUW + NA + KR**: three buckets (`europe`, `americas`, `asia`) ⇒ ~3× collector throughput on the same key (est.). Cost: a different player base per region (meta differs a little by region; stats sites pool them). Our `RateLimiter` already scopes per host.
- The API Terms allow "only one (1) developer account" ([API Terms](https://developer.riotgames.com/terms)): extra keys/accounts to multiply limits are **not allowed**.

**Data programs or partnerships for analytics apps?** None found for solo-queue data. Riot's only data partnership is esports (GRID, above). Riot's approved production use cases include "Training tools that allow players to view their own match histories and aggregate stats" and "Aggregate player stats (no specific players)" ([LoL docs](https://developer.riotgames.com/docs/lol)). **No evidence found** of a bulk-data or research programme (searched the portal, developer-relations GitHub, Riot DevRel posts).

**Caching and storing Match-V5:** no retention limit is written anywhere in the portal, General Policies or API Terms (checked all three). What is written: delete all Game Information if the API Terms end; GDPR deletion requests are forwarded to developers as identifier lists, which we must honour ([API Terms](https://developer.riotgames.com/terms), GDPR section); no "data broker" between the API and another company ([LoL docs](https://developer.riotgames.com/docs/lol)); charging for access to Game Information needs Riot's prior written approval (API Terms, Licensed Uses). Our bounded window (`windowDays` 30, `maxStoredMatches` 50k per band) is already conservative.

## Q5. More from the local client (LCU, reads only)

Riot: the League Client API "is not officially supported for use with third party applications… no guarantees of full documentation, service uptime, or change communication" ([LoL docs](https://developer.riotgames.com/docs/lol)); register the app and say which endpoints you use ([Hextechdocs LCU FAQ](https://hextechdocs.dev/lcu-api-faq/)). Endpoint list below is from the community swagger dump for client **16.19** (1,318 paths, updated 2026-09-24, [hasagi-types swagger.json](https://raw.githubusercontent.com/dysolix/hasagi-types/main/swagger.json); browsable at [swagger.dysolix.dev](https://swagger.dysolix.dev/lcu/), [lcu.vivide.re](https://lcu.vivide.re/)). We use 12 today (`packages/lcu`).

| Endpoint (GET) | What | Worth it? |
| --- | --- | --- |
| `/lol-end-of-game/v1/eog-stats-block` | the local player's end-of-game screen stats, seconds after the game | **Yes**: post-game card without waiting for Match-V5 to publish the match |
| `/lol-perks/v1/recommended-pages/champion/{id}/position/{pos}/map/{map}` | Riot's recommended rune page (also in CommunityDragon, see Q3) | **Yes** (prior for runes; topic 4) |
| `/lol-champ-select/v1/session/timer` | phase + time left | Yes, small: show "time left" so suggestions arrive before the timer (the session WebSocket already carries `timer`) |
| `/lol-match-history/v1/products/lol/current-summoner/matches`, `/games/{gameId}`, `/game-timelines/{gameId}` | the local player's recent games incl. other queues and customs | Maybe: only the local player's list; Match-V5 already has ranked. Customs must never be shown publicly without opt-in ([LoL docs](https://developer.riotgames.com/docs/lol)) |
| `/lol-challenges/v1/challenges/local-player`, `/summary-player-data/local-player` | own challenge progress | Low |
| `/lol-honor-v2/v1/profile`, `/recognition-history` | own honor level and recognitions | Maybe: a soft "attitude" line in the monthly report (topic 9); own data only |
| `/lol-champion-mastery/v1/local-player/champion-mastery` | mastery without an API call | Yes, small: saves server calls; same data as Champion-Mastery-V4 |
| `/lol-ranked/v1/current-ranked-stats` | already used | — |
| `/lol-replays/v1/metadata/{gameId}`, `rofls/path` | replay metadata, local files | **No** (see below) |
| Anything with `{puuid}` of another player, `recently-played-summoners` | other players | **Not allowed** (identities) |

**Replays (.rofl):** the header holds JSON metadata, but `statsJson` has been empty since patch 13.20 ([developer-relations #831](https://github.com/RiotGames/developer-relations/issues/831), still open); the event stream is proprietary and encrypted ([ROFL-Player wiki](https://github.com/fraxiinus/ROFL-Player/wiki/ROFL-Format-Information), [maknee 2025](https://maknee.github.io/blog/2025/League-Data-Scraping/), [lolrofl-rs](https://github.com/Ayowel/lolrofl-rs): "development stopped as Vanguard does not allow me to run the game anymore"). Riot is restricting replays: only your own games, and "third-party apps and websites will lose access to replay downloads entirely", delayed from 26.20 to **26.21**, because replay and memory access "have been used by cheat developers" ([MMOHuts, 2026-10-07](https://mmohuts.com/news/riot-delays-league-of-legends-replay-privacy-change-to-patch-26-21), [Strafe](https://www.strafe.com/news/read/riot-changes-lol-replay-system-sparking-community-backlash/), [Altchar](https://altchar.com/game-news/league-of-legends-replay-changes-limit-access-to-other-players-matches-aexI42C14UGd)). Decoding the stream would be reverse engineering. **Not allowed / not worth it.**

## Q6. The Live Client Data API (milestone 8/10)

Official, local only, `https://127.0.0.1:2999/liveclientdata/…`, served by the game client while a game runs ([LoL docs](https://developer.riotgames.com/docs/lol)). Endpoints: `allgamedata`, `activeplayer`, `activeplayername`, `activeplayerabilities`, `activeplayerrunes`, `playerlist`, `playerscores?riotId=`, `playersummonerspells?riotId=`, `playermainrunes?riotId=`, `playeritems?riotId=`, `eventdata`, `gamestats`. Fields, from Riot's [sample response](https://static.developer.riotgames.com/docs/lol/liveclientdata_sample.json) and [event sample](https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json):

- **Active player only:** level, `currentGold`, full `championStats` (AD, AP, armor, MR, penetration and lethality, attack speed, crit, cooldown reduction, health, resource, move speed, tenacity, life steal, spell vamp, range), abilities (levels, names, raw descriptions), full rune page incl. stat shards.
- **All ten players:** champion, team, position, level, items (with slot, count, price), `scores` (kills, deaths, assists, creepScore, wardScore), summoner spells, keystone + trees, `isDead`, `respawnTimer`, skin, `isBot`, and `summonerName`/`riotId` (**identities: must be stripped by `sanitizeLiveGame()`**).
- **Game:** `gameMode`, `gameTime`, map.
- **Events:** GameStart, MinionsSpawning, FirstBrick, TurretKilled, InhibKilled, DragonKill (type, stolen), HeraldKill, BaronKill, ChampionKill, Multikill, Ace (each with killer/assister **names**; strip them too).
- **Not available:** other players' gold, cooldowns, ultimate state, positions on the map, vision. Good: Riot bans enemy cooldown/ultimate timers anyway.
- **Frequency:** no update rate is documented ([LoL docs](https://developer.riotgames.com/docs/lol)); it's a pull API. Poll at ~1–2 s **(opinion)**; there is no rate limit since it's local.
- **What Riot allows:** in-game products may not give "game-session-specific information that would be previously unknown to the player" and may not "dictate player decisions" ([LoL docs](https://developer.riotgames.com/docs/lol)). Everything in this API is already visible on the scoreboard, so build-adjustment advice ("they have 3 armor items → consider penetration") is fine as a suggestion. No other players' names, ranks or histories (our hard rule).

## Q7. Crowd data from our users

- **What we already have:** every user's synced Match-V5 games (`matches` / `user_matches` tables, up to 200 per user). Each is a normal ranked match with ten participants, the same shape as a collected match.
- **Riot's rules:** "Aggregate player stats (no specific players)" is an approved production use case; no "data broker"; no hidden or session-specific info ([LoL docs](https://developer.riotgames.com/docs/lol)). Pooling users' matches into band aggregates is the same kind of processing as the collector. Users' own data shown back to them is the "training tools… own match histories" case.
- **Privacy law:** aggregates that can't identify anyone are outside GDPR ([Recital 26](https://gdpr-info.eu/recitals/no-26/)); pseudonymous data (e.g. a stored match ID that anyone with a key can look up) is still personal data ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-personal-data/), [IAPP](https://iapp.org/news/a/looking-to-comply-with-gdpr-heres-a-primer-on-anonymization-and-pseudonymization), [activeMind](https://www.activemind.legal/guides/anonymisation/)). Our stored matches keep `match_id`, so raw rows are pseudonymous: keep the bounded window, honour Riot's GDPR deletion lists, and keep only aggregates beyond the window. Snapshots (aggregates) are anonymous.
- **Consent:** our users register with an invite; add one line to registration and the privacy policy that their games also count, anonymously, in the meta, with an opt-out **(opinion; needed anyway for the production-key application's privacy policy)**.
- **Statistics:** friends' games are not a random sample (the same few players, the same champions). Count each `match_id` once (it may also have been collected), and cap any one user's share of a band (e.g. ≤ 5% of that band's matches) so they don't tilt champion numbers **(opinion)**.
- **Not crowd data:** other players' champ-select hovers, live-game names, replay files. Those stay out.

---

## Deliverable: every source

| Source | What | Freshness | Size | Cost | Terms | How to access |
| --- | --- | --- | --- | --- | --- | --- |
| Riot Match-V5 (+ timeline) | matches, per-minute timelines | live | unlimited, rate-limited | free | **allowed** | our collector; personal key 100 req / 2 min per routing value |
| Riot League-V4 / League-Exp-V4 | ladder by tier/division | live | all ranked players | free | **allowed** | collector seeding |
| Riot Challenges-V1 | challenge levels, percentiles | live | per player | free | allowed | low value |
| Riot Clash-V1, Spectator-V5 | teams, live games | live | — | free | allowed by Riot, **not allowed by our rules** (identities) | — |
| Riot production key | 500 / 10 s, 30,000 / 10 min per region | — | ~60× personal | free | allowed after approval | portal application; months of wait possible |
| Other regions (NA `americas`, KR `asia`) | more Match-V5 buckets | live | ~3× throughput | free | **allowed** (one key, one account) | add routing values to the collector |
| Data Dragon | static data | per patch (16.20.1) | small | free | **allowed** | in use |
| CommunityDragon game data | champion attributes, **rune recommendations**, queues, perks | per patch (16.20) | small | free | **allowed** (community, cache per patch) | static JSON |
| LCU (local, GET only) | champ select, own eog stats, mastery, honor, challenges, recommended pages | live | own data | free | **allowed, unsupported** | `packages/lcu` |
| Live Client Data API | in-game state (visible info) | ~live | own game | free | **allowed** (official) | `packages/live-client` (M8) |
| Replays / `.rofl` | encrypted stream; empty `statsJson` | — | — | — | **not allowed / closing** (26.21) | — |
| Users' synced matches (crowd) | Match-V5 of our users | live | 200 per user | free | **allowed** as anonymous aggregates | merge into band aggregation |
| Kaggle 16.13–16.18 EUW timelines | 77k matches, 3.2M minute rows | 2026 | 551 MB | free | **unclear** (Riot data; use internally) | Kaggle download |
| Kaggle 25.14 NA Plat+ raw Match-V5 | 102k matches | 2025 | 9 GB | free | **unclear** (same) | Kaggle download |
| Other Kaggle / HF / DraftRec | older or high-elo sets | 2014–2025 | 10k–280k | free | **unclear**; some carry identities | offline only |
| Leaguepedia Cargo | pro games, drafts | daily | all pro | free | **allowed** (CC BY-SA 3.0, attribution) | `cargoquery`, ~1 req/min |
| Oracle's Elixir | pro CSVs | daily | all pro | free | **allowed** (attribution, Riot's terms) | CSV download |
| GRID | official esports data | live | pro | paid | allowed by contract | not for us |
| Meraki lolstaticdata | wiki-parsed champion/item data | **stale** (Aug 2025) | small | free | allowed (MIT) | don't use |
| OP.GG MCP server | builds, counters, tiers | live | huge | free? | **unclear** (no data terms) | only with written permission |
| op.gg site, u.gg, LoLalytics, Mobalytics, Blitz, Porofessor, iTero, METAsrc | meta stats | live | huge | — | **not allowed** (scraping / no licence) | — |

### The 3–5 worth adding, and the work each needs

1. **Riot's recommended rune pages (CommunityDragon / LCU).** Fetch `champion-rune-recommendations.json` per patch on the server next to the champion data (or read the LCU endpoint on the desktop); Zod-validate loosely; expose as a prior in the loadout: when a band's rune data is thin, start from Riot's page and say so. ~1 day. Fits "nothing hardcoded" (Riot data, refreshed per patch).
2. **More routing values for the collector.** Make the collector's region list config (`meta.v1.json`), seed from `na1` and `kr` ladders, call Match-V5 on `americas`/`asia`, tag each match with its region, and decide per band whether to pool regions. ~2–3 days. Triples throughput on the personal key; check Railway awake-time cost (each wake-up runs ~30 min; more buckets = more matches per wake, not longer wakes).
3. **Users' own matches into the meta (crowd data).** In the aggregation job, include `user_matches` rows of the band, de-duplicated by `match_id`, with a per-user cap; add the consent line and opt-out. ~1–2 days.
4. **LCU end-of-game stats for the post-game card.** Read `/lol-end-of-game/v1/eog-stats-block` when gameflow reaches `EndOfGame`, validate loosely, show the card immediately, replace with Match-V5 data when it arrives. ~1 day.
5. **One open dataset for offline priors and backtests (optional).** Download the 16.13–16.18 EUW timeline set locally (not committed, not shipped), drop identity columns, and use it to fit slow priors (learning curve slope, gold-curve shapes) and to backtest engine v2 out-of-sample. Results go into config as numbers with a note of the source and its bias (high elo). ~2 days.

Not recommended: any third-party stats site, replay parsing, Meraki (stale), pro data except as a later "pros pick this" flavour.

### What to ask Riot for at the production key

- The production key for one product (desktop app + server + collector), with **Match-V5 on `europe`, `americas` and `asia`** at the standard limits; ask whether pooling regions for aggregate band statistics is fine.
- Confirmation that **storing collected Match-V5 data for a 30-day window and keeping anonymous aggregates longer** is acceptable, and the GDPR deletion channel we must subscribe to.
- Confirmation that the **LCU endpoints we use** (list them: champ select session/timer, perks pages/recommended pages, item sets, my-selection spells write, end-of-game stats, mastery, honor) are fine, including the click-only writes approved by the owner.
- Confirmation that **pooling consenting users' own matches** into anonymous meta aggregates is fine.
- **RSO** for sign-in instead of invite codes (production only).
- Ask the queue status after 3 weeks via the developer-relations channel; real waits run 1–7+ months.

## What to change in the code or config

1. Collector regions: today the collector uses one platform/region pair from the environment (`RIOT_PLATFORM=euw1`, `RIOT_REGION=europe`, `apps/server/src/env.ts`). Add an optional list to the existing `collector` block of `config/meta.v1.json`, defaulting to the env pair so nothing changes until it's filled in; tag each stored match with its platform (new `matches.platform` column). Proposed addition to the `collector` object (other keys unchanged):

   ```json
   {
     "collector": {
       "routes": [
         { "platform": "euw1", "regional": "europe" },
         { "platform": "na1", "regional": "americas" },
         { "platform": "kr", "regional": "asia" }
       ],
       "poolRoutesInBand": true
     }
   }
   ```

   Start with only the `euw1` entry, and add the others after measuring Railway wake-up time.
2. `packages/ddragon` (or a CommunityDragon adapter next to it): fetch and cache `champion-rune-recommendations.json` per patch; serve it with the meta snapshot so the loadout can fall back to Riot's page.
3. `packages/lcu`: add GET readers for `/lol-end-of-game/v1/eog-stats-block` and `/lol-champ-select/v1/session/timer` (loose Zod); keep all `{puuid}` and `recently-played-summoners` endpoints out.
4. `apps/server` meta job: include users' synced matches in band aggregation, de-duplicated by `match_id`, with a per-user cap; add an opt-out flag per user (new `users` column). Proposed new top-level block in `config/meta.v1.json`, off by default:

   ```json
   {
     "crowd": { "enabled": false, "maxShareOfBandPerUser": 0.05 }
   }
   ```
5. Privacy text (registration + future privacy policy page): one sentence that the user's games count anonymously in the meta; needed for the production-key application anyway.
6. `research/DATA_SOURCES.md`: mark Meraki as stale, Spectator-V5 and replays as off-limits, and note that EUNE shares the `europe` bucket.
7. Nothing for third-party stats sites: they stay out.

## Self-check

- Q1–Q7 answered; "no evidence found" stated for open solo-queue win-rate sources and for a Riot data programme, with what was searched.
- Every recommendation keeps: suggest-never-decide, no other players' identities (Spectator, Clash, LCU `{puuid}` endpoints, Live Client names excluded), no Arena data, nothing hardcoded (rune recommendations and regions come from Riot data or config).
- Key claims with fewer than 3 independent sources: production-key wait times (two GitHub issues + one checklist, all community; Riot's own figure is ~2 weeks), Mobalytics' terms (search excerpt only: the page blocks fetchers), Spectator-V5 status (two conflicting posts). Official Riot docs are used alone where they are the source.
- Config snippets are proposals; the field names must be fitted to the current `meta.v1.json` shape before use.

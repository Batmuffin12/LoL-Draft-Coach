# 10. Riot policy and product numbers

Researched 2026-10-09. Every web page was read on that date; the source's own date is given where it matters. Riot's official pages are quoted from a full download of the page text (curl), not from snippets. Opinion is marked **(opinion)**; my own arithmetic is marked **(est.)**. Builds on [11-data-sources.md](11-data-sources.md), which already covers the production key's rate limits, the review queue and Riot's data terms; those are only summarised here.

## Short answer

1. **Everything we ship today is allowed, and our rules are stricter than Riot's in two places.** Champ select suggestions, the post-game card, the monthly report and the click-only rune/item/spell import all fit Riot's written policy. Approved apps (Blitz, U.GG, OP.GG Desktop) import runes and items *automatically* on lock-in; we only do it on a click. Keep that: it costs nothing and is the safest reading of "should not remove game decisions".
2. **The new hard line since patch 25.17 (Aug 2025) is in game:** Riot no longer approves apps that *notify* players of a power spike ("Garen just leveled up to 6"), *dictate* player actions from the game state, or track enemy ability or summoner-spell cooldowns. So **power spike info is fine before the game and in the build, but never as an in-game alert**, and in-game next-item advice must be something the player looks at (options), never a pushed instruction.
3. **Our Riot notice is missing its second sentence.** Both of Riot's policy pages require the trademark line ("Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."). `apps/desktop/src/renderer/screens/common.tsx:9` has only the first. A one-line fix.
4. **Two things to tell Riot in the product description now:** the list of League Client (LCU) endpoints we use, including the three click-only writes (Riot: "We need to know which endpoints you're using and how you're using them"), and every new feature (policy: "Any new features or changes to a product must be audited"). The v1.0.0 public download is fine on the personal key *only while the server stays invite-only*: "public consumption includes open alpha/beta tests".
5. **Win rate cannot show that the coach helps.** Matchmaking pushes every player towards 50% (Riot), and detecting a 3-point win-rate gain needs ~4,300 games per arm (est.), years of a friend group's games. Measure **behaviour the coach targets** (games on known champions, advice taken, goals met, breaks taken), compare each user **with their own pre-install history** (we already sync up to 1,000 past games per user), and treat rank trend as a slow, descriptive guardrail. No competitor has published a causal result; the only public numbers (Mobalytics 2018, a 2026 draft-AI benchmark) are correlations that their own authors or methods can't separate from selection.

---

## Q1. Riot's developer policies for coaching apps in 2026

### The rules that apply to us (official text)

Riot has two layers: the **General Policies** (all games, [last updated 2025-05-29](https://developer.riotgames.com/policies/general)) and the **League of Legends Developer API Policy** on the [LoL docs page](https://developer.riotgames.com/docs/lol). Quoted verbatim from both (downloaded 2026-10-09):

**Game integrity (LoL page):**
- "Products must not use or incorporate information not present in the game client that would give players a competitive edge (e.g., automatically or manually allowing tracking enemy ultimate cooldowns), especially when such data is not already accessible through regular gameplay."
- "Products should increase, and not decrease the diversity of game decisions (builds, compositions, characters, decks)."
- "Products should not remove game decisions, but may highlight decisions that are important and give multiple choices to help players make good decisions."
- "Products cannot create alternatives for official skill ranking systems such as the ranked ladder. Prohibited alternatives include MMR or ELO calculators."
- "Products cannot identify or analyze players who are deliberately hidden by the game." (General Policies: "cannot de-anonymize players who cannot reasonably be identified from visible information.")

**Use cases (LoL page):**
- Approved examples for production keys include "Showing (self) player stats", "Training tools that allow players to view their own match histories and aggregate stats", "Game overlays that provide static data that is available prior to the game", "Aggregate player stats (no specific players)".
- Will not be approved: "Products cannot display win rates for Augments or Arena Mode items"; "Products may not provide any game-session-specific information that would be previously unknown to the player"; "Apps that dictate player decisions"; custom-game match history shown publicly without opt-in.

**Everything else that touches us:**
- No "data broker" between the API and another company; one product per production key; key never in distributed code.
- Registration: "If your product serves players, you must register it with us… You must make sure its description and metadata are kept up to date with the current version of your product." General: "Any new features or changes to a product must be audited through the product's page in the Developer Portal."
- League Client API: "not officially supported for use with third party applications"; "Whether you're combining the Riot Games API and League Client API, or doing something by only using the League Client endpoints, we need to know about it… We need to know which endpoints you're using and how you're using them."
- Legal boilerplate, "readily visible to players": "[Your product] isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc." (General). The LoL page has the same two sentences in slightly different words.
- Monetisation (only relevant if we ever charge): registered and Approved/Acknowledged, a free tier, transformative content; "You may not place advertisements in Riot properties, which include in-game, loading screens, and the Riot Client" (added in the 2025-05-29 update; [Eloking report](https://eloking.com/blog/lol-riot-bans-overlay-advertisements)).
- What Riot wants to see when reviewing ([portal docs](https://developer.riotgames.com/docs/portal)): "We want to see product that help players get better at our games, or track their growth. What we don't want to see are products that solve our games or make everything too simple."

### The changes since 2024 (dated)

| Date | Change | Sources |
| --- | --- | --- |
| Nov 2022 | Ranked Solo/Duo champ select hides non-party names; apps must show "Ally 1…4" consistently | [Riot dev update, Fall 2022](https://www.leagueoflegends.com/en-us/news/dev/matchmaking-and-champion-select-fall-2022/), [Overwolf LoL compliance](https://dev.overwolf.com/ow-native/guides/game-compliance/riot-games/), [Dot Esports](https://dotesports.com/league-of-legends/news/lol-players-agree-small-but-significant-change-was-one-of-riots-best-decisions) |
| Apr 2024 | Vanguard in LoL: "Apps developed using the LCU and in-game APIs are still expected to work"; memory readers stop working | [Riot DevRel Vanguard FAQ](https://www.riotgames.com/en/DevRel/vanguard-faq) |
| 2025-03-13 | Enemy ultimate timers banned, "automatic or manual"; apps that keep them lose their key | [Riot DevRel on X](https://x.com/RiotGamesDevRel/status/1899532362637250955), [zleague](https://www.zleague.gg/theportal/league-of-legends-riot-bans-third-party-enemy-ultimate-timer-apps-players-react/), [gaming.news](https://gaming.news/news/2025-03-11/riot-bans-ultimate-timer-overlays-in-league-of-legends-after-community-backlash/) |
| 2025-05-29 | General Policies update: no ads in Riot properties (in game, loading screen, client) | [General Policies](https://developer.riotgames.com/policies/general), [Eloking](https://eloking.com/blog/lol-riot-bans-overlay-advertisements), [buildzcrank](https://buildzcrank.com/en/blog/riot-api-and-third-party-apps-what-is-allowed/) |
| Aug 2025, patch 25.17 | No longer approved: "notifying players of a power spike (e.g. Garen just leveled up to 6), dictating player actions, and tr[acking enemy ability/summoner spell cooldowns]". Riot builds jungle timers and spell tracking into the game instead | [Riot DevRel on X](https://x.com/RiotGamesDevRel/status/1961628936665964578) (snippet; X blocks fetching), [Patch 25.17 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-25-17-notes/), [Destructoid](https://www.destructoid.com/league-of-legends-25-17-patch-notes-xin-zhao-rework-third-party-app-changes-and-more/), [Overwolf LoL compliance](https://dev.overwolf.com/ow-native/guides/game-compliance/riot-games/) |
| Oct 2025 | Spectator-V5 deactivated "to prevent third party applications from deanonymizing players" (status since then conflicting; see 11) | [11-data-sources.md](11-data-sources.md#q2-public-apis-that-serve-league-data) |
| 2026-10-06 | Game memory access blocked by default for unknown third-party apps (grace until April 2027 for approved tools) | [Riot Support](https://support.riotgames.com/en-us/riot/performance/game-memory-access-removed-for-third-party-apps) |
| patch 26.21 | Third-party apps lose replay downloads | [11-data-sources.md](11-data-sources.md#q5-more-from-the-local-client-lcu-reads-only) |

Overwolf's compliance page (Riot's rules as Overwolf enforces them; undated) lists for LoL, verbatim: "It is strictly prohibited to provide: Notifications that alert players when a power spike hits (e.g. X champion has hit level 6). Notifications that dictate player action based on the current game state (e.g. Enemy champion is underleveled, go gank top lane). Tracking of enemy ability cooldowns, or facilitating players tracking these with timers. Tracking of enemy summoner spells cooldowns, or facilitating players tracking these with timers." It also says Riot does **not** approve any aggregation or display of **Brawl** or **League Classic** data ([Overwolf](https://dev.overwolf.com/ow-native/guides/game-compliance/riot-games/)). Our queues are 420/440/400 only (`config/app.v1.json`; the collector takes 420), so we comply.

**One conflict:** buildzcrank (a competitor's blog, June 2026) says "summoner spell timers… for your own team" stay allowed, while Overwolf's list bans only *enemy* spell tracking. Both agree enemy timers are out; we have none, so it doesn't matter to us.

### What the big apps do, and where we differ

Third-party descriptions below come from competitors' own blogs and help pages, so treat feature lists as approximate (they are marketing). Three independent write-ups agree on the main points.

| App | Champ select | In game | Post game | Imports | Sources |
| --- | --- | --- | --- | --- | --- |
| **Porofessor** | Build suggestions; its "live game lookup" (rank, win rate, main role, streak and "one-trick" tags for all ten players) works wherever names are visible: the **loading screen**, and champ select outside Ranked Solo/Duo (Flex, normals) and for your own party. In Solo/Duo champ select, Riot's "Ally 1–4" rule hides teammates (a competitor's review still describes it as a champ select feature; I found no Porofessor page saying how it handles Solo/Duo) | Jungle/ward timers, objective reminders, static build | Little | Runes on click | [hexgate, 2026-10-07](https://hexgate.app/blog/mobalytics-vs-porofessor/), [buildzcrank](https://buildzcrank.com/en/blog/best-league-of-legends-app-2026/), [FileHorse](https://www.filehorse.com/download-porofessor/) |
| **Mobalytics** | Draft analysis, rune import | Overlay with CS benchmarks, "power spike timers", objective reminders | GPI score (Farming, Fighting, Vision, Survivability, Aggression, Consistency), match breakdown | Click or auto | same, [hexgate auto-import](https://hexgate.app/blog/auto-import-runes-lol/) |
| **Blitz** | Builds, auto import | Overlays | Basic | **Automatic** on lock-in: runes, items; spells opt-in (off by default) | [Blitz support](https://support.blitz.gg/hc/en-us/articles/360032708372-Auto-Import-For-Items-Runes-Summoners-) (via search excerpt; 403 to fetchers), [hexgate](https://hexgate.app/blog/auto-import-runes-lol/), [buildzcrank](https://buildzcrank.com/en/blog/best-league-of-legends-app-2026/) |
| **U.GG / OP.GG Desktop** | Builds, tier lists | Overlays | Profile stats | Automatic runes and items | [hexgate](https://hexgate.app/blog/auto-import-runes-lol/) |
| **iTero** | AI draft coach with win chance | Little | Analysis | Click | [iTero](https://www.itero.gg/), [hexgate](https://hexgate.app/blog/auto-import-runes-lol/) |

How they describe compliance: they all say the same three things: they use Riot's official APIs and the client's own interfaces, they don't read game memory or inject, and they hold Riot approval ([hexgate](https://hexgate.app/blog/mobalytics-vs-porofessor/), [buildzcrank](https://buildzcrank.com/en/blog/riot-api-and-third-party-apps-what-is-allowed/), [Mobalytics on Vanguard](https://mobalytics.gg/blog/lol-vanguard-and-mobalytics/)). None publishes its Riot approval letter.

**What they do that we may not or will not do:**
- **Scouting other players** (Porofessor's ten-player lookup, Mobalytics' "opponent breakdowns"): allowed by Riot from the loading screen on, when names are visible; **not allowed by our own rule** (no other players' names, ranks or histories). Keep our rule: it is also the safe side of "cannot identify or analyze players who are deliberately hidden".
- **"Power spike timers" in an in-game overlay** (Mobalytics, as described by a competitor in Oct 2026): if these are alerts, they are what 25.17 banned; a passive "strong from minute N" label is not clearly covered. **Unclear**; we don't need it in game.
- **Automatic import on lock-in** (Blitz, U.GG, OP.GG): tolerated by Riot for years, but we keep click-only (owner decision D34; Riot: "should not remove game decisions").
- **Ads in overlays**: banned since 2025-05-29. Not planned.

### Allowed / not allowed / unclear: our features

| Feature (status) | Verdict | Why (rule) | Conditions we must keep |
| --- | --- | --- | --- |
| Champ select pick suggestions with reasons (shipped) | **Allowed** | "may highlight decisions that are important and give multiple choices"; long-running draft tools (iTero, Blitz, Mobalytics) operate openly with Riot keys | Always 3 options, never auto-pick/lock; nothing about teammates' identities (`sanitizeChampSelect()`), also in Flex and Normal Draft, where the client shows names and Riot's anonymity rule doesn't apply; comfort-first keeps decisions diverse ("increase, and not decrease the diversity of game decisions") |
| Ban suggestions (shipped) | **Allowed** | same | Options only; never call a ban endpoint |
| Predicted draft win chance "≈ 54%" (shipped) | **Allowed** | Not an "MMR or ELO calculator": it rates champions, not players. iTero and others show draft win chances | Never estimate a player's MMR or "true rank" |
| One-click rune page, item set, own summoner spells (shipped) | **Allowed** | Client's own interfaces doing what the player could do by hand; Riot approved apps auto-import ([hexgate](https://hexgate.app/blog/auto-import-runes-lol/)); Vanguard FAQ: LCU apps "expected to work" | Click only; writer whitelist (`packages/lcu/src/writer.ts`); **list the write endpoints in the Developer Portal description** (LCU rule). Riot never published an approved-endpoint list since the [2019 LCU policy](https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy) (which said "Only endpoints on our approved list are allowed" and barred LCU apps for players in **Korea**) |
| Pre-game power spike info ("strong from about minute 18", item spikes in the build, New tab) (M8) | **Allowed** | "Game overlays that provide static data that is available prior to the game"; it's aggregate data | Shown in champ select, profile and build, not as an in-game event |
| In-game power spike **notifications** (anyone's, incl. "you just hit 6") | **Not allowed** | 25.17 policy; Overwolf list | Never build |
| In-game passive label of your own spike ("your next item completes your spike") | **Unclear** | Not a notification and not hidden info, but close to the banned example; no written guidance | Don't build without asking Riot; if asked, phrase as build info, never as "go fight now" |
| In-game next-item advice with 2 alternatives (M10) | **Allowed with care** | All inputs are on the scoreboard (items, levels, KDA), so not "previously unknown"; options, not an order. But "Notifications that dictate player action based on the current game state" are banned | Pull, not push: the player opens it (spec already says "never alerts pushed on game events"); always 3 options; no enemy cooldowns; `sanitizeLiveGame()` drops names. Add it to the Portal description before release |
| "Who keeps killing you" / "who is fed" inside next-item reasons (M10) | **Allowed** | Scoreboard data | Champion names only, never Riot IDs |
| Overlay window over the game (later) | **Allowed** | Vanguard FAQ: "Overlays… using the API, game client, and in-game APIs should continue to function" | No ads in it; no timers of enemy abilities/spells; no alerts on game events; Overwolf version needs Overwolf's own approval |
| Post-game card (shipped) | **Allowed** | "Training tools that allow players to view their own match histories" | Own data; other players only as champion + role ("your lane opponent's Darius") |
| Monthly report, style axes, goals (shipped) | **Allowed** | "track their growth" is what Riot wants | Don't present a computed skill rating as a rank/MMR ("Products cannot create alternatives for official skill ranking systems") |
| Break suggestion after losses (shipped) | **Allowed** | No game policy touches it | Suggest, never block |
| Meta snapshots from collected games (shipped) | **Allowed** | "Aggregate player stats (no specific players)" | No PUUIDs or names stored; no Arena/augments; no Brawl or League Classic |
| Users' own games pooled into the meta (proposed in 11) | **Allowed** | same | Consent line + opt-out |
| Friends' release v1.0.0 on a public download link, personal key (M9) | **Allowed while invite-only** | Personal key: "small private community"; "You may not run your application for public consumption using a personal key… public consumption includes open alpha/beta tests" ([portal](https://developer.riotgames.com/docs/portal)) | Server keeps rejecting users without an invite; don't advertise the link; production key before any open sign-up |
| Showing teammates'/enemies' ranks or histories (never) | **Not allowed** (by us); in ranked champ select also by Riot | "cannot identify or analyze players who are deliberately hidden" | Never |
| Arena augment or item win rates (never) | **Not allowed** | explicit | Never |

## Q1c. The production key

Summary of 11 (not repeated in detail): 500 req / 10 s and 30,000 req / 10 min per region, ~60× the personal key; one product per key; stated review ~2 weeks, real waits 1–7+ months ([11-data-sources.md](11-data-sources.md#q4-more-from-riot-itself)).

**What Riot asks for** (official, [LoL docs](https://developer.riotgames.com/docs/lol) and [portal](https://developer.riotgames.com/docs/portal)):
- Production keys are "for larger-size, professional projects"; Riot asks "Is the use case good and approved?" and "Does the developer show they will deliver on that use case?"
- Evidence, one or more of: an established brand; "New app that is fully functional and testable by Riot"; "Prototype that is mostly testable by Riot"; mockups; a deck. "Riot needs to see the user flow… such as account creation process, login pipeline"; "You must also send a link to a working site, mockup, prototype, or rendering where it is easy to understand the user flows".
- Product verification (domain ownership through a `riot.txt` file) ([riot-api-libraries](https://riot-api-libraries.readthedocs.io/en/latest/applications.html), [Riot portal docs](https://developer.riotgames.com/docs/portal): "we'll ask you to verify your product").
- "If your website isn't complete, we're unlikely to approve your product."

**What goes wrong in practice:** one 2026 rejection said "The link that you've included does not work or leads to a blank page… we cannot verify what your project is intended to do", and the rejected app could no longer reply in the portal ([developer-relations #1139](https://github.com/riotgames/developer-relations/issues/1139)); several 2026 applications have waited 38 days to 7+ months ([#1197](https://github.com/RiotGames/developer-relations/issues/1197), [#1192](https://github.com/RiotGames/developer-relations/issues/1192), [#1153](https://github.com/RiotGames/developer-relations/issues/1153)). Another desktop-app project (TrueMain, Sept 2026) is asking DevRel the same questions we would: whether an approved LCU endpoint list still exists, whether click-only rune writes are fine ([TrueMain #1680](https://github.com/ilyanfraimbault/TrueMain/issues/1680)); no answer yet.

**Steps for us (opinion, built from the above):**
1. Now (personal key): keep the product description current: features, the LCU endpoints (reads and the three click-only writes), "invite-only, about N friends". Policy requires it and it seeds the production application.
2. About two months before going beyond ~10 users (spec trigger): a public landing page on our own domain with screenshots, the user flow (install → sign in → champ select → import click), Terms of Service, privacy policy (incl. what we store, `DELETE /me`, the crowd-data line from 11), the Riot notice; `riot.txt` on that domain.
3. Register the production product (it's a separate product registration from the personal one) with a working build Riot can test: an installer link plus a test invite code, or RSO later. The 2026 rejection above shows a link that "works for us" isn't enough: test it from outside.
4. Ask the questions from 11's "What to ask Riot" list, plus: is a passive in-game "your build spike" label acceptable; is the in-game next-item panel (pull, 3 options) acceptable.
5. On approval: the key change invalidates stored PUUIDs; recovery by Riot ID already exists (CLAUDE.md).

---

## Q2. How to measure that the coach helps, without A/B tests

### Why the obvious numbers fail

- **Win rate drifts to 50% by design.** Riot: "we try our best to give both teams about a 50% chance of winning every game", and LP gains shrink "until the two [MMR and rank] are about the same" ([Riot Support, MMR, Rank and LP](https://support.riotgames.com/en-us/league-of-legends/gameplay/mmr-rank-and-lp)); a Riot matchmaking lead: "Aim for as close to 50% every time" ([Dot Esports](https://dotesports.com/league-of-legends/news/riot-dev-responds-to-claims-league-ranked)). A player who gets better wins more only until they climb; the gain shows as **rank**, slowly, not as win rate.
- **A/B testing is out of reach.** To detect 50% → 53% win rate (a large effect for a tool) with 80% power at α = 0.05 needs n = (1.96 + 0.84)² · (0.25 + 0.249) / 0.03² ≈ **4,350 games per arm** (est.). Five friends at ~40 ranked games a month make ~200 games a month: about 22 months per arm, 3.6 years for both (est.). Kohavi et al. build A/B practice on products running "more than 20,000 controlled experiments a year" ([Trustworthy Online Controlled Experiments](https://www.cambridge.org/core/books/trustworthy-online-controlled-experiments/sample-ratio-mismatch-and-other-trustrelated-guardrail-metrics/8DBB0F59AC7729D7BC6B94690DB9CCD5)); we have the opposite situation.
- **"Followed the advice → won more" is confounded.** Players follow advice when it matches what they wanted (often a comfort pick), so followed games differ before the game starts. The 2026 draft-AI benchmark says so itself: "correlation, not causal", "comfort picks and individual player skill weren't controlled" ([winrate.gg benchmark, 2026-04-28](https://winrate.gg/articles/draft-recommendation-benchmark); written by a competitor, which also benefits from the result).
- **Regression to the mean.** A goal is chosen where you are furthest below typical, so that metric will tend to improve next month even if nothing changed ([Barnett et al. 2005, IJE](https://pubmed.ncbi.nlm.nih.gov/15333621/): RTM is strongest "when follow-up measurements are only examined on a sub-sample selected using a baseline value"). "Goals met" alone overstates the coach's effect.

### What other tools report

| Tool | What they report | Method | Weakness |
| --- | --- | --- | --- |
| Mobalytics (2018, NA, 1.72M players, 110k users) | "53.7% of Mobalytics users climbed at least one division, whereas 42.3% of non-Mobalytics users"; frequent users 17.8% more likely to climb | users vs non-users over one season ([Mobalytics ladder research](https://mobalytics.gg/lol-ladder-research/), via search excerpt; the page returns 403) | Self-selection: players who install a coaching tool are the ones trying to climb. No pre-period comparison |
| iTero | "From our initial tests we've found that players using our recommendations consistently win more game— it's as simple as that" (no numbers or method given); top-1 recommendations won 52.7% in a third-party benchmark | win rate of games where the pick matched a recommendation ([iTero](https://www.itero.gg/articles/draft-sq), [winrate.gg](https://winrate.gg/articles/draft-recommendation-benchmark)) | Prediction accuracy, not help: a recommender that names already-strong picks "wins" without changing anyone's choice |
| winrate.gg benchmark (2026) | 58.7% top-1 for its own model, 52.7% iTero, 48.5% LoLDraftAI on 20k Gold+ games | hide one pick, ask each model, compare win rates when the real pick was in its top N | Same as above; author is a competitor |
| Mobalytics GPI | per-skill scores over time | descriptive tracking | No claim of causation |
| Coaching services | "85% of coached players improve 2+ divisions within 10 sessions" ([search result](https://www.eloascend.com/blog/lol-coaching-guide)) | not stated | Marketing; no method |

**No causal study of any League companion tool was found** (searched Google Scholar-style queries, arXiv, the tools' blogs, Reddit). The academic work found is on rating players ([PandaSkill, arXiv 2501.10049](https://arxiv.org/pdf/2501.10049)), not on tools helping them.

### The design that fits a handful of friends (opinion, backed by the methods below)

Use **each user as their own control**, with the install date as the intervention:
- **We already have the "before" period.** Sync loads up to 1,000 past games per user (`config/app.v1.json` `history.matchCount`), all from before they installed. That's a natural baseline no competitor study used.
- **Friends install on different days**, which makes this a *multiple-baseline design across participants*: if a change appears in each person right after their own start date and not at calendar dates, a shared outside cause (a patch, the season start) is unlikely. Single-case design standards ask for at least three such staggered starts and about five data points per phase ([WWC single-case design standards, Kratochwill et al. 2010](https://ies.ed.gov/ncee/WWC/Docs/ReferenceResources/wwc_scd.pdf); [Kratochwill & Levin et al. working paper](https://wcer.wisc.edu/wp-content/uploads/sites/348/2026/08/WCER_WorkingPaper_Swoboda-Kratochwill-Levin_2010.12.20.pdf)). With weekly points, that's ~5 weeks before and after per user.
- **Analyse each metric as an interrupted time series**: weekly values, a segmented regression with a level change and a slope change at install, against the pre-install trend ([Bernal, Cummins & Gasparrini 2017, IJE tutorial](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5407170/)). The tutorial's warnings apply: season starts and patches are "time-varying confounders", and weekly values are autocorrelated.
- **Pick the metrics HEART-style** (goal → signal → metric; [Rodden, Hutchinson & Fu 2010, Google](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); summaries: [Product Compass](https://www.productcompass.pm/p/the-google-heart-framework), [Pratt IXD](https://ixd.prattsi.org/2018/12/googles-heart-framework-measuring-and-tracking-progress-towards-key-goals/)): **behaviour the coach asks for** is the primary signal (it moves within weeks), outcomes are slow guardrails. Kohavi's "guardrail metrics" idea fits here: numbers that must not get worse (crashes, panel too slow to help).

### Recommended success metrics, and how to compute them from our data

All per user, weekly, ranked games only (queues 420/440; 400 kept separate), pre-install vs post-install. "Install" = `users.created_at`. Show the owner the per-user before/after and the pooled median; never a single headline "the coach wins you X%".

| # | Metric (role) | Definition | From our data | Rule for "changed" |
| --- | --- | --- | --- | --- |
| M1 | **Games on champions you know** (primary; spec M9 item) | share of ranked games on a champion that was *main* or *comfortable* in your pool **at the time of the game** (pool computed from games before it) | `user_matches` + `matches.summary`; pool by the engine's pool function replayed per game date | two-proportion test pre vs post, z ≥ 1.96; plus ITS level change |
| M2 | **Comfort vs off-pool result gap** (spec M9 item; descriptive) | win rate and gold/CS diff at 15 on known vs other champions | same + timelines | Show as context, not as proof: off-pool picks are often autofill or new-champion games. Don't claim causation |
| M3 | **Advice taken** (adoption, HEART "task success") | share of logged games where `pick.championId` is in `shown` (top 1 / top 3) | `advice_log` (`advice.pick`, `advice.shown`) | trend only; also report "ignored" picks, the coach should learn from them |
| M4 | **Draft-adjusted result** (outcome, honest version of "followed → won") | mean of `result − pick.expectedWin` for followed vs not followed | `advice_log` joined to the match result by `gameId` | Needs a calibrated `expectedWin` first (spec M11: ECE < 0.01). Until then show only M3. Even then it's confounded by why the player followed |
| M5 | **Goal progress, net of regression to the mean** | goals met per month (02-goals rule: recent mean reaches target and z ≥ 1.64 against a *shrunk* baseline), plus the change in the goal metric for the same metric in the user's **pre-install** history over the same game count | engine growth replayed per date; **store each goal when set** (metric, baseline, target, set date) so later config changes don't rewrite history | the pre-install "control" change estimates RTM; the coach's credit is the difference |
| M6 | **Breaks taken** (spec M9 item) | share of loss streaks ≥ `session.lossStreak` followed by a gap ≥ `session.gapMinutes`, before vs after install; and result of the next game | match start/end times in `matches`; config `engine.v1.json` `session` | two-proportion test; small n, report raw counts |
| M7 | **Rank trend** (slow outcome guardrail) | weekly LP-equivalent: tier/division → number (from `rank-bands`/League-V4 order) × 100 + LP; slope before vs after | `rank_history` (daily) + League-V4 history; **needs LP stored** (today `RankedEntry` keeps tier, rank, wins, losses, not `leaguePoints`) | ITS slope change; with < 10 users, descriptive only |
| M8 | **Engagement** (HEART: engagement, retention) | share of ranked games where the panel was open in champ select (`advice_log` rows / ranked games); weekly active users; import clicks | `advice_log`, `users.last_seen_at`, an import counter | trend; a falling share means the coach stopped being useful before any outcome moves |
| M9 | **Guardrails** | crash-free sessions (Sentry, M9), suggestion latency in champ select, import failures | Sentry; desktop log counters | must not get worse |

Statistics notes:
- With 5–10 users, results per user are anecdotes and the pooled number is a few dozen games per week; say so in the report. Use the per-metric "changed" rules from [03-style-month.md](03-style-month.md#q5-showing-a-trend-honestly) (non-overlapping periods, Welch, z = 2.4 when testing several metrics together) so we don't read noise as progress.
- Prefer M1, M3, M5, M6 (behaviour, weeks to move) over M2, M4, M7 (outcomes, months and confounded). This matches "Whole-game totals follow the result… prefer early-game numbers and habits".
- No external comparison group: friends who install are motivated (Mobalytics' self-selection problem). The pre-install period of the same person is the only fair control we have.

---

## What to change in the code or config

1. **Riot notice** (`apps/desktop/src/renderer/screens/common.tsx:9`): add the second sentence, "Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc." Also update the quote in `docs/SPEC.md` (Compliance) so the spec and app match the [General Policies](https://developer.riotgames.com/policies/general).
2. **Developer Portal description** (not code; M9 task "product description… brought up to date"): list every feature by phase, the LCU endpoints (reads: champ-select session, pickable champions, owned champions, gameflow, current summoner, ranked stats, perks pages/styles/perks/recommended positions; click-only writes: `POST/PUT /lol-perks/v1/pages`, `PUT /lol-item-sets/v1/item-sets/{id}/sets`, `PATCH /lol-champ-select/v1/session/my-selection` with `spell1Id`/`spell2Id` only), "invite-only, about N friends", and add each new feature before it ships (M8 spikes, M10 in-game items).
3. **SPEC / CLAUDE.md compliance list**: add the 25.17 rule: "No in-game notifications of power spikes (anyone's), no advice pushed on game events, no enemy ability or summoner-spell timers"; add "No Brawl or League Classic data"; add "No ads in the overlay or anywhere in game". Mark the in-game "your build spike" label as needing Riot's OK first.
4. **M8 power spikes**: show only in champ select, the build, the New tab and the game plan; never through `packages/live-client` events.
5. **M10 next-item advice**: keep it pull-only with 3 options; no toast or sound on game events; add a test that `packages/live-client` output never triggers a UI notification.
6. **Server registration gate**: keep `POST /users` invite-only for as long as the personal key is used; a test already guards invites; add a short comment that this is what keeps v1.0.0 "not public consumption".
7. **Product numbers (M9, m9-2)**:
   - add `leaguePoints` to `RankedEntry` and an `lp` column to `rank_history` (M7);
   - add a `goal_history` table (user, metric, role, champion, baseline, target, set_at, met_at) written when the growth focus changes (M5);
   - add a small counter for import clicks and panel-open-in-champ-select (M8), own data only;
   - a `product-numbers` CLI on the server (like `backtest`) that prints M1–M8 per user, pre vs post install, with the "changed" rule. Proposed config, new top-level block in `config/engine.v1.json` next to `report` (or its own `config/product.v1.json`):

   ```json
   {
     "productNumbers": {
       "queues": [420, 440],
       "bucketDays": 7,
       "minWeeksPerPhase": 5,
       "minUsersForPooled": 3,
       "zChanged": 2.4,
       "knownPoolTiers": ["main", "comfortable"],
       "adviceTopN": 3
     }
   }
   ```
8. **Production key prep** (later trigger): landing page on our own domain with screenshots, user flow, Terms, privacy policy, Riot notice, `riot.txt`; a test invite for Riot's reviewers.

## Self-check

- Q1 (allowed in champ select and in game; what Porofessor, Mobalytics, Blitz do; production key asks, time, limits) and Q2 (measuring without A/B; candidates; what others report) are answered. "No evidence found": no causal study of a League companion tool (searched arXiv, Scholar-style queries, tool blogs); no public Riot list of approved LCU endpoints since 2019.
- Official Riot rules are quoted from Riot's own pages (1 source each, as allowed). Third-party claims with 3+ sources: auto-import by approved apps (Blitz help, hexgate, buildzcrank), 25.17 restrictions (Riot DevRel post, patch notes, Destructoid, Overwolf), ultimate-timer ban (Riot DevRel, zleague, gaming.news). Weak: competitor feature lists come from competitors' blogs (hexgate, buildzcrank are themselves apps); Mobalytics' study is read from a search excerpt (403).
- Recommendations keep suggest-never-decide, no identities, no Arena, nothing hardcoded (queues and tiers come from config; the config block is valid JSON).

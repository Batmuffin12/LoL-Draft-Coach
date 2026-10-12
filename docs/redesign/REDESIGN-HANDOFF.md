# Panel redesign v2: handoff

**For:** the Claude Code session that builds it in `Batmuffin12/LoL-Draft-Coach`
**From:** the design session of 2026-10-10 and 2026-10-11, signed off by the owner
**Design canvas:** https://claude.ai/code/artifact/a677e879-1456-4c4c-9b5b-be34546e0b99 (the "Final" row, bottom)
**Design system:** LoL Draft Coach, https://claude.ai/code/artifact/b363bca5-38a1-4353-b220-3b88f6bf8afa (same tokens as `apps/desktop/src/renderer/styles.css`)
**Mockups in this folder:** `mockups/*.html`, one per screen. Open them in a browser: each is a static 440 × 720 picture of the screen. They are the visual target. The numbers in them are sample data: never copy a number, champion, item or rune from a mockup into code.

---

## 1. What and why

Rebuild seven panel screens to match the approved mockups. Three complaints drive this:

1. **The #1 suggestion doesn't stand out**, and the reasons are spread across five columns.
2. **Data is crammed for no reason.** Lobby tabs pack everything into the top half and leave the bottom empty. Text is cut with "…" (for example the This month "Games" tile: "bot 34% · jung…") and the Riot notice is clipped at the bottom.
3. **Hard to scan.** Pool gaps appear as three stacked warning rows. Style and This month are long lists of numbers.

| Screen | Mockup | Component today |
| --- | --- | --- |
| Champ select (pick) | `mockups/ChampSelect.html` | `screens/ChampSelectScreen.tsx`, `PhaseBar`, `PickTable` |
| Locked in (3 tabs) | `mockups/LockedIn-Runes.html`, `LockedIn-Build.html`, `LockedIn-Matchups.html` | `screens/LockedInScreen.tsx`, `Loadout.tsx`, `RunePage`, `SkillGrid`, `BuildPath`, `ItemMatrix` |
| Lobby › Last game | `mockups/LastGame.html` | `LobbyScreen.tsx › LastGame`, `PostGameCard`, `FocusCard` |
| Lobby › Style | `mockups/Style.html` | `LobbyScreen.tsx › Style`, `PlaystyleAxis`, `StyleNumbers` |
| Lobby › This month | `mockups/Month.html` | `LobbyScreen.tsx › Month`, `MonthReport` |
| Lobby › Pool | `mockups/Pool.html` | `LobbyScreen.tsx › Pool`, `PoolTable`, `Notice` |
| Connect | `mockups/Connect.html` | `screens/ConnectScreen.tsx` |

These screens are **not** redesigned but must pick up the shared changes in section 3: the ban screen, Lobby › New, the undocked draft board, and the hover-pick Runes and Build tabs in champ select.

---

## 2. Rules for every screen (do not break these)

All of these already come from `docs/SPEC.md`, `CLAUDE.md` and the design system README. The redesign tightens them:

- **Fits 440 × 720 with no scrollbar**, at zoom 1, on every screen. If a screen overflows, first remove repetition, then close a secondary block, then tighten spacing. Never shrink below the type scale and never cut text. Check with `LDC_SCREENSHOT` (it logs the overflow): the overflow must be **0**.
- **No text is ever cut.** No `text-overflow: ellipsis`, no `-webkit-line-clamp`, no "…" anywhere. Remove the `.one-line` and `.clamp2` uses on these screens, and remove the classes when nothing uses them. Long text wraps between words.
- **Tokens only.** Colors, spacing (2, 4, 6, 8, 10, 12, 16, 20, 24), radii (3, 4, pill, circles for runes and dots) and type all come from the `:root` variables in `styles.css`. No new hex values in components. The mockups use the same variable names (`--bg`, `--card`, `--line-strong`, `--gold-tint`, `--positive`, `--negative`, `--track` …), so they map one to one.
- **Type scale only** (`--fs-*`): hero 32, number 22, title 20, heading 16, body 14, caption 13, label 12, micro 12, legal 11. **One hero number per screen**: the timer in champ select, the goal value on Last game, the current win rate on This month. Tabular figures everywhere.
- **Color meaning:** gold means you and the brand. `positive` (green) raises your chance and `negative` (amber) lowers it, always with a printed sign and a true minus (−). Red only for the enemy, destructive actions and the timer at 10 s or less. Win rates are colored from 50%: above 50.5% `positive`, below 49.5% `negative`.
- **One primary button per screen** (`btn primary`: gold border, `--gold-tint` fill, `--gold-bright` text).
- **Accessible:** real `<button>`, `<input>` and `<label>` elements, a 2px gold focus ring with offset on everything focusable, an `aria-label` on icon-only buttons, and charts in SVG with `role="img"` and an `aria-label` that says what they show.
- **Voice:** "you" and "your team", never other players' names. Suggest, never decide. Describe a single game, never grade it. No emoji, no exclamation marks.
- **Riot notice:** in full in the lobby footer and on Connect. It must be fully visible: it is clipped today.
- **No hardcoded game data** (hard rule). Every name, number, icon and label comes from the view state, Data Dragon or `config/explain.v1.json`. Any new wording goes into `explain.v1.json`. Wording never contains a number the engine didn't produce.
- **Compliance stays as is:** the import button still only acts on a click, and the LCU writer is unchanged.

---

## 3. Shared changes

### 3.1 `styles.css`
- **Text utilities:** keep the existing `.label`, `.caption` and `.micro`, and add `.t-hero`, `.t-number`, `.t-title` and `.t-heading` with the same values as the mockups. Better still, reuse names you already have, as long as each one maps to a `--fs-*` variable.
- **`.you` surface:** a `--frame` border and `--gold-tint` fill, radius 4. Use it for the suggested pick and the "Your next step" card.
- **Lobby spacing:** section padding goes to 12px 16px (`--space-6`, `--space-7`) and the gap stays 8. The owner wants lobby screens less crammed. Champ select and Locked in keep 10px.
- **Segmented tab gap:** stays 20px (`--space-8`).
- **Remove dead classes** once nothing uses them, for example `.strip`, `.numgrid`, `.trends2` and `.how` if they become unused.

### 3.2 Header (`StatusHeader`)
No change. It is the same on every screen, Connect included: status dot, "Draft Coach", the patch chip when known, dock and close buttons.

### 3.3 Lobby footer (`AccountFooter`)
- First row: your Riot ID (when registered), then "Sign out" and "Delete my data" as foot links.
- Then the full Riot notice in `legal`, wrapping and fully visible. Deleting your data is still confirmed in place in the footer.

### 3.4 Notices
- Problems stay one `Notice` each.
- **Progress** messages ("Loading your match history: 120 of 400", "Loading your older games: 412 to go") become a slim progress row instead of a boxed notice: a micro text line with the percentage on the right and a 3px `--track` bar with a `--gold` fill (see `mockups/Pool.html` in the design canvas's refined row for the look). Only add the bar when a done/total is known.

---

## 4. Screen by screen

Each section lists the layout top to bottom, where every value comes from, and the states to handle.

### 4.1 Champ select, pick turn (`mockups/ChampSelect.html`)

**Band (replaces `PhaseBar`'s look; keep its logic):**
- Background `--gold-tint` and a `--frame` bottom border **on your turn only**. When it isn't your turn, the band is flat with no tint.
- **Timer ring, 64px:** an SVG circle, `--track` behind and `--gold` showing the time left (`secondsLeft / totalSeconds`). The number `Math.ceil(secondsLeft)` sits in the middle in `hero`.
  - At 10 s or less on your turn, the ring and the number turn `--red`.
  - Without a `totalSeconds`, show the number with no ring.
- **Text column:** a `label` with the phase ("Champ select"), then the call in `title`, uppercase, `--gold-bright` on your turn ("Your pick", "Your ban", "Your team is picking" …), then the context in `caption`/`text` ("Bot · against Caitlyn").
- Keep `aria-live="polite"`.

**Section "We suggest":**
- The head carries the confidence chip on the right (`pickAdvice.confidence`). It is green-bordered for "clear"; for close and thin, keep the current chip styles.
- **Suggested-pick card (`.you`):**
  - Champion icon at 64, framed in gold.
  - Name in `title`.
  - Under it, a `micro` line with your record on that champion in this role: tier label, games and WR, taken from `state.roles` (find the role matching `pickRole`, then the champion in its `pool`). Leave the line out if the champion isn't in your pool.
  - On the right, `expectedWin` in `number` with "win chance" under it. The mockup shows it green, but the existing `PickTable` comment says the chance compares your options and gets no good/bad colour. Follow the code comment and use `text` (decision 4 in section 9).
- **Three term tiles (You · Meta · Lane):**
  - Built from `pickColumns(picks[0].terms)`: `you`, `meta`, `lane`. Each tile is a `label` and the value in `heading`, signed and toned with `tone()`.
  - A null term shows "—" in `muted`.
  - The tooltips keep today's column titles ("Into their laner (for information …)").
  - The Team (Draft) term isn't a tile. It reaches the player through the reasons.
- **Reason lines** (the owner asked for these explicitly):
  - `pickReasons(picks[0].reasons, 5)`, each line marked + (`positive`) or − (`negative`).
  - Then `pickAdvice.whyNot` as a gold line with ›.
  - `filledNote` and `enemyNotes`, when present, go as one caption line above the card. Watch the 720 limit: when they are present, drop to four reasons.

**Section "If not {champion}":**
- `picks[1..3]` as three equal buttons in a grid: icon 34, name in `heading`, then a micro line with the chance and the first positive reason, wrapping.
- Clicking one makes it the selected pick: the card, tiles and reasons switch to it, like the selected row in `PickTable` today. When the draft moves on to a new #1, reset to #1.

**Footer:** "Suggestions only. You choose and lock your champion."

**Keep:**
- Hovering a champion still shows the Picks · Runes · Build `Segmented` under the band. Runes and Build render the bodies of the Runes and Build tabs from 4.2 (with their own footer import button).
- The undocked draft board stays as it is.
- The empty and loading captions stay as today.

**Ban turn (not redesigned):** use the new band (ring, tint, "Your ban") over the existing `BanTable` and the ban footer.

### 4.2 Locked in, three tabs (`mockups/LockedIn-Runes.html`, `LockedIn-Build.html`, `LockedIn-Matchups.html`)

All three tabs share the band and the footer.

**Band:**
- `YouStrip` as today: icon 44 framed, a gold `label` "Locked in · Bot vs Caitlyn", name in `title`, `WinChance` on the right.
- Under it, a `Segmented` row: **Runes · Build · Matchups & plan**.
  - Runes opens first. Plan has no tab of its own any more: it's the top of Matchups & plan.

**Footer (Runes and Build):**
- One primary, full-width "Import runes, spells & items" button. It runs the existing rune import (page plus spells), then the item-set import: one click, one busy state ("Importing…").
- Show it only when `loadout.canImport`. If only one kind can be imported, the label says so ("Import runes & spells" or "Import item set").
- `importMessage` shows under the button after it runs.
- Under the button, `LoadoutSource` as a micro line ("From 2,140 games in Gold to Platinum · rough guide"). It wraps and is never cut.
- On Matchups & plan, the footer is only a micro source line.

**Runes tab:**
1. **Runes:** the head carries `Stat` (WR · games) on the right. Body: **the existing `RunePage`, unchanged** (full trees, taken runes lit, shards, swap lines). The owner explicitly wants the current look.
2. **Summoner spells & skill order:** **the existing `SkillGrid`, unchanged** (spells, Priority keycaps, the Q/W/E/R × 1–18 grid).

**Build tab (new `BuildPath` layout, replaces `BuildPath` and `ItemMatrix`):**
- The head is "Build path", with the micro "pick rate · ★ adds the most" on the right.
- **One horizontal row of five columns:** Start, Boots, Item 1, Item 2, Item 3. A 2px `--line` connector runs behind the main icons.
- **Each column, top to bottom:**
  - its label in `micro`/`text`
  - the minute in `micro` ("11 min" from `items[i].minute`; "0 min" for Start; boots from their slot when known). Leave it out when it is null.
  - the main item icon at 32 (core items framed gold)
  - the main item's pick rate in `micro`/`text` (`top.share`, whole percent), plus a gold ★ on the option with the biggest `winAdded` in the build
  - then "or" and **up to two alternatives**, each a 22px icon with its pick rate (`alternatives[0..1]`, `share`), from `loadout.items[i].alternatives` and `loadout.boots.alternatives`
  - **no alternative:** the micro "No other common pick", wrapping
  - **Start:** the starting items with their counts ("+1 potion"); no alternatives
- **Thin data** (no ranked items): fall back to `commonPath.items` with no pick rates. The source line says "rough guide".
- **Power spike:** the minute line reads "18 min · spike" in gold, but only if the engine exposes a spike (M8, `docs/ENGINE-PLAN.md`). Otherwise leave it out.
- Every icon's tooltip is its name plus its reasons.
- **"Vs this team":** `loadout.situational` icons at 22, plus a caption with the item names and reasons. Wrap it, never cut it.
- **"Later: pick by situation":** `loadout.laterPool[0..2]`, one row each: icon 22 plus "Name — reason".
- `loadout.quest`, when present, is one more row like "Vs this team".
- None of this needs new data: `share`, `winAdded`, `alternatives` and `minute` already exist on `LoadoutView`.

**Matchups & plan tab (replaces `PlanTab` and `MatchupsTab`; keep their logic):**
1. **Game plan:** `pick.plan` as lines with a gold ›, in `text`. Empty: today's caption.
2. **Against their team** (`pick.matchups.against`):
   - The micro "vs what both champions predict" on the right of the head.
   - **Your lane opponent first, as a `.you` row:** icon 28 framed, name in `heading`, then "{role} · your lane". On the right, the verdict word plus its signed delta in `heading`, toned ("Hard −0.8", "Favoured +0.6", "Even"), and under it the micro "{winRate} WR · {games} games".
   - The other enemies in the same row style, without the frame.
   - Seats not picked yet: one micro line ("Top: not picked yet").
   - Pairs with no games: one line of 20px icons plus "No games yet with {names}", wrapping. Same rules as `MatchupTable` today.
3. **With your team** (`pick.matchups.with`): the same rows. Your lane partner gets "· your lane partner".
- Keep the `VERDICT_DEAD_ZONE` logic and the "Even" dead zone.
- The delta now shows in the row instead of only in the tooltip, because the owner wants all the data visible.

**States:** no loadout shows "No build data for {champion} in this role yet." on Runes and Build. No live meta shows the Matchups captions from today. The note "Champ select is over …" stays a notice.

### 4.3 Lobby › Last game (`mockups/LastGame.html`)

**Tabs:** Last game · Style · Pool · New · This month (unchanged).

**Result band** (full width, `--warn-tint` background on a loss, `--gold-tint` on a win, flat while the result is pending):
- Icon 44 framed.
- The result in `title`, uppercase: "Victory" in `positive`, "Defeat" in `negative`, "Result soon" in `muted`.
- `caption`/`text`: "{champion} · {role} · {minutes} min · {ago}".
- `micro`: the verdict and prediction combined ("You took the coach’s #1 pick: 51% when you locked in"), from `verdict` and `prediction`.

**Section "What decided the draft":**
- **New data:** the terms at lock-in, as signed points.
  - Add `terms: { label: string; deltaWin: number }[]` to `PostGameView`, from the advice log (the log already stores what was shown at lock-in; store the top terms too if it doesn't).
  - Show up to three, biggest absolute value first.
- Each row: label (120px), a diverging bar on `--track` centered at 0 (`positive` to the right, `negative` to the left, scaled to the biggest value), and the value in `heading`, signed.
- **Fallback when there are no terms** (old log entries): today's `lines` as + / − reason lines.

**Section "Your goal" (from `state.focus` and `lastGame.focus`):**
- The head shows the role on the right ("Bot").
- `focus.title` in `title`.
- **Goal ring, 88px:** a 3px circle border, `positive` when the goal was met in this game and `negative` when not. Inside it, this game's value in `hero` (`lastGame.focus.value`) and "this game" in micro. Without a last-game focus, show `focus.youText` with "your average".
- **Beside the ring:**
  - "Goal met: {goalText}" / "Goal not met: {goalText}" in `heading`, toned.
  - Caption: "Your average is {youText}. {typicalLine}".
  - 10 squares of 20px from `focus.recent`, oldest first: gold when met, outlined in `--line-strong` when not.
  - Micro: "{n} of your last {N} met it", plus ", the last {k} in a row" when k ≥ 3. Add the wording to `explain.v1.json`.
- **"Next game":** a gold `label` plus `focus.tips[0]` as one caption line. Other tips go in its tooltip.
- **No duplicate goal line:** the old "GOAL Deaths before 14 min: 2 this game · goal 2.4" line on the result card is gone, because the ring shows it.

**Empty:** no last game shows the current caption. No focus hides the section.

### 4.4 Lobby › Style (`mockups/Style.html`)

**Role pills** replace the role sub-tabs:
- "Bot · 50", "Jungle · 18" … from `playstyle[].role` and `.games`, using the `pill` style.
- On the right, the micro "dashed = rank average".
- Keep each role's summary as the pill's `title`.

**Radar (new component `StyleRadar`, inline SVG):**
- Size 406 × about 220. One spoke per `axes[]` entry, in config order, with an outer ring at 100.
- A dashed `--line-strong` polygon at 50 (the rank average).
- Your polygon: `--gold` stroke and `--gold-tint` fill, with points at `score / 100` of the radius.
- Each label: the axis name in display 12/600 `text`, then the score toned (`level` high → `positive`, low → `negative`, mid → `text`). Anchor left labels at the end and right labels at the start, and keep them clear of the polygon.
- Clicking a label, or a list fallback for screen readers, shows the axis `metrics`, like `PlaystyleAxis` does today. Keep that detail reachable: a tooltip per label is the minimum.

**Summary sentence** under the radar (caption, `text`):
- New wording in `explain.v1.json`, built from the high and low axes, for example "You out-farm your rank and win lane early. Vision and early deaths hold you back."
- Use a sentence part per axis and level. It is not free text, and it contains no numbers.

**Section "Your numbers vs your rank":**
- One row per `numbers[]` entry (6 rows): label (118px), a bullet track, then "{you} vs {typical}" on the right, `you` in `heading` toned by `tone`.
- **Bullet track:** 6px on `--track`, with a 2px `--line-strong` tick at 50% (the rank average) and a 14px dot for you. The dot is green when better, amber when worse, `text` when neutral, with a `--bg` ring.
- **New data on `NumberView`:** `relative: number`, from −1 to 1, how far you are from typical with lower-is-better already turned around. The dot sits at `50% + relative × 50%`. Compute it in the main process (`style-view.ts`) and clamp it.
- Under the rows, the micro "Right of the line is better, even for deaths."

**Moved, not lost:**
- The `how` block (pool focus, classes, damage split) and the `side` line no longer show by default.
- Add them as one `ClosedSection` "How you play" under the numbers, if the screen still fits; otherwise put them in the "Your numbers" head's tooltip.
- Don't delete `HowYouPlay`.

**Empty:** the current caption.

### 4.5 Lobby › This month (`mockups/Month.html`)

**Header section:**
- Head: "{period} · {games} games" in a gold label, and "{n} games before" on the right.
- The win-rate line: the previous rate in `number`/`muted`, "→", the current rate in `hero`, toned from 50%, then a caption "win rate, up 3 points on the 30 days before" (or "down"; new wording).
  - **New data:** `MonthView.winRate: { from: number | null; to: number }` and `gamesBefore`. Today these live inside the `strip` strings: don't parse strings, add the fields in `month-view.ts`.
- **Role split:**
  - **New data:** `MonthView.roles: { role: string; share: number }[]`, sorted.
  - One 8px stacked bar with 2px gaps, colors in order `--gold`, `--frame`, `--line-strong`, `--card-raised`, `--line`. Under it the full legend: "Bot 34% · Jungle 28% · Mid 22% · Top 10% · Support 6%". The top role is in `text`, the rest `muted`.
  - This fixes the cut "bot 34% · jung…" tile.

**Section "Your {role} style, before → now" (new component `SlopeChart`, SVG 406 × 196):**
- Two columns, BEFORE and NOW, with each axis from `m.axes` as a line from `from` to `to`. Score scale 30–75 or the data range: y = top + (max − score) × k.
- `changed === "up"`: `positive`, 2.5px, with dots at both ends. `"down"`: `negative` the same way. `"steady"` or null: `--line-strong` at 1.5px and 0.7 opacity.
- **Labels:**
  - The left column only labels changed lines ("Farming 62").
  - The right column labels every line, "{to} {name}", plus a signed change for changed lines ("+9", "−7").
  - If two right-hand labels would sit closer than 14px, nudge them apart.
- An axis with `from === null` gets no line: just its right-hand label in `muted`.
- Micro under the chart: "Grey lines: no real change over {games} games."

**Raw number trends (`m.stats`) (decision by default):**
- Show only the rows with a real change (`tone !== null`), as caption lines under the chart: "CS per min 7.1 → 7.9" toned.
- Show at most three; if there are more, add "+2 more" with the rest in a tooltip.
- Leave out the steady rows (the micro line already says grey means no change).

**Section "Champions this month":**
- `m.champions[0..2]` as three equal cards (`--card`): icon 28, name in `heading`, and a micro line with the toned win rate and "· {games} games".
- `m.focusLine` sits on the right of the head ("top 3: 70% of games, 58% before").

**Goals (`m.focus`):**
- Keep it as one line when it fits: "Goals met: {first}" plus "and n more" with the rest in a tooltip, and the current goal in gold.
- Otherwise move it into the head of the Champions section.

**Footer:** the account footer.

### 4.6 Lobby › Pool (`mockups/Pool.html`)

**Role pills:**
- One per role with enough data. On the right, "{games} games · {WR}% WR" in micro (wrapping, never cut: the "50% W…" cut in today's head is a bug).

**Coverage matrix (new component `PoolCoverage`, replaces the `PoolTable` rows and the hole `Notice`s):**
- **Columns:** the role's pool, main and comfortable first, then learning and rusty, at most 3 to 4 columns at 72px.
  - Each column head: icon 34 (the main is framed gold), name in `heading`, and a micro line with "{games} · {WR}%" for listed champions or the tier label ("rusty", "learning").
  - Rusty and learning columns are at 0.7 opacity.
  - More champions than fit: list the extra rusty ones in one micro line under the matrix ("Also rusty: Riven, Irelia"). Wrap it, never cut it.
- **Rows:** the pool needs from the engine (`PoolNeed`: magic, physical, frontline, engage). Labels come from `explain.v1.json`: add `pool.need.{need}` labels "Magic damage", "Physical damage", "Frontline", "Crowd control".
  - A need nothing in the main or comfortable tiers covers gets its label in `negative`.
- **Cells:** a 14px dot, filled `--positive` when the champion covers the need and dashed `--line-strong` when it doesn't.
- **New data:** `RoleView.coverage`:

  ```ts
  { needs: { need: PoolNeed; label: string; gap: boolean }[];
    covers: Record<number /* championId */, PoolNeed[]> }
  ```

  Build it in the main process (`personal-coach.ts`, next to where `holes` are mapped) with the engine's existing `covers(attributes, need, cfg.coverage)` over the `limited` champions in `packages/engine/src/pool.ts`. Export what you need from the engine. It stays pure, with unit tests.
- The legend in micro: "● covers it · ○ doesn’t. Rusty: no games lately."
- A champion with no measured attributes: its cells show "—" in `muted`, never a guess.

**Section "Your next step"** (from `holes`, biggest first):
- When `holes[0].coveredBy` has a champion: a `.you` card with icon 34, "Play {champion} again" in `heading`/`gold-bright`, then a caption explaining which gaps it fills, using the needs it covers (new wording), plus the evidence (`holes[0].evidence`) as its tooltip.
  - **New data:** `coveredBy` is a display string today; add `coveredByChampion: ChampView | null` and the list of needs it fills.
- **Still missing:** for holes nothing you know covers, a caption "Still missing: crowd control. None of your top champions bring it." plus a secondary button "See new champions" that switches to the New tab.
- **No holes:** one caption, "Your pool covers what your team usually needs in {role}." (new wording).

### 4.7 Connect (`mockups/Connect.html`)

- The header as everywhere else.
- **Centered intro, padding 40/24:** "Connect to your coach" in `title`, and the caption "Picks from your own pool, with the reasons."
- **Form:**
  - The `label` "Invite code", centered.
  - The code as **three 4-character inputs** (mono 16, 44px tall, 96px wide) with "–" between them.
    - Pasting a full code ("ABCD-EFGH-IJKL", with or without dashes or spaces) into any box fills all three.
    - Typing past 4 characters moves to the next box, and Backspace on an empty box goes back.
    - Uppercase on input.
    - The joined value goes to `window.coach.register(serverUrl, code)` exactly as today.
    - Each box has an `aria-label` ("Invite code, part 1 of 3").
  - The League client line: "● League client found: {Riot ID}" with a green dot when `status.lcu === "connected"`. Otherwise "Open the League client and log in first." in `muted`, and the button disabled.
  - The primary, full-width "Connect" button (44px). Busy: "Connecting…".
  - An error (`account.message` on error, unregistered or mismatch) shows as a caption in `negative` under the button. Mismatch keeps its "Different account" title instead of the intro.
- **How it works:** three numbered lines (gold numbers): "In champ select …", "When you lock in …", "After the game …" (new wording).
- **Footer:**
  - "Server: {address} · Change". Change reveals the server address input in place; it is prefilled from `account.serverUrl ?? account.defaultServerUrl`, so the user doesn't have to type the server.
  - Then the full Riot notice.

---

## 5. Data changes, all of them

All in the main process and engine. The renderer stays UI only. Every new field gets a test and is added to the snapshot contract test (`apps/desktop/test/snapshot-contract.test.ts`).

| Where | Field | Source |
| --- | --- | --- |
| `PostGameView` | `terms: { label; deltaWin }[]` | advice log at lock-in (`advice-log.ts`, `advice-store.ts`): store the top terms when a pick is logged |
| `NumberView` | `relative: number` (−1..1, better is positive) | `style-view.ts`, from you, typical and lower-is-better |
| `MonthView` | `winRate: { from; to }`, `gamesBefore`, `roles: { role; share }[]` | `month-view.ts` (the data already exists behind `strip`) |
| `RoleView` | `coverage: { needs; covers }` | `personal-coach.ts` plus `covers()` from `packages/engine/src/pool.ts` |
| `PoolHoleView` | `coveredByChampion: ChampView \| null`, `fills: PoolNeed[]` | `personal-coach.ts` |
| `explain.v1.json` | `pool.need.*`, style summary parts, month win-rate line, goal streak line, Connect "how it works" lines, Pool "no gaps" and "next step" lines | wording only, no numbers in the templates |

Keep the old fields while anything still reads them, then remove them in the same change.

---

## 6. Out of scope

- Engine scoring, weights, the collector and the server. Exception: the small data fields in section 5.
- Lobby › New, beyond the shared styles.
- The in-game overlay, Overwolf, and the M8 power-spike logic itself (only show a spike if the engine already gives one).
- Images: champion, item and rune art still comes from Data Dragon at runtime. The mockups use monograms only because they can't load art.

---

## 7. How to check it's done

1. `pnpm typecheck && pnpm test`: green.
2. **Screenshots** of every screen with the mock client and the simulator. Each must log an overflow of 0 and visually match its mockup.
   - Champ select: `pnpm --filter @ldc/sim mock mid-counter`, then `LDC_SCREENSHOT=cs.png`.
   - Ban screen: `mid-ban`.
   - Locked in, solid and thin data: `locked-solid` and `locked-thin`, each with `LDC_SCREENSHOT_CLICK=Build` and `LDC_SCREENSHOT_CLICK=Matchups & plan` as well as the default Runes tab.
   - Lobby tabs: `LDC_SCREENSHOT_CLICK=Style`, `Pool`, `This month`, `Last game`.
   - Connect: a fresh `LDC_USER_DATA_DIR` in server mode.
3. **States:**
   - Thin data, with the "rough guide" line.
   - No live meta: chances show "—", the tiles show "—", and the empty captions appear.
   - A loss and a win, and the pending result.
   - No focus, no last game.
   - A role with no holes.
   - A long champion name (Kog’Maw, Nunu & Willump) and a long Riot ID, to check wrapping.
   - The timer at 10 s or less.
4. **Grep the renderer:** no `ellipsis`, no `line-clamp`, and no hex colors outside `:root`.
5. **Keyboard:** Tab reaches every button, tab, pill, alternative and code box, and the focus ring is visible.
6. `LDC_VIEW_DUMP`: every number on screen comes from the dump.

---

## 8. Process (from CLAUDE.md)

- Branch `feat/panel-redesign-v2` from `main`. Small Conventional Commits, one per screen or shared piece, with `pnpm typecheck && pnpm test` before each. Push after each commit.
- Suggested order:
  1. Shared styles, header, footer and notices.
  2. Data fields in section 5, with tests.
  3. Connect.
  4. Champ select.
  5. Locked in.
  6. Last game.
  7. Style.
  8. This month.
  9. Pool.
- Release it as a version per CLAUDE.md's versioning rules (one version for every package), update `CHANGELOG.md`, and tag.
- Afterwards: the design system's `components/bundle.css` mirrors `styles.css` class for class, so tell the owner the design system needs a resync to v-next.
- Don't force-push and don't rewrite history.

## 9. Decisions made by default (tell the owner in the PR)

1. **Locked in:** three tabs, Runes · Build · Matchups & plan. The real rune trees, skill grid and build alternatives can't all fit in 720px on one screen, and the owner wants Matchups kept.
2. **Style:** "How you play" (damage split, classes, pool focus) and the blue/red side line kept as a closed section.
3. **This month:** raw number trends shown only when they changed, at most three.
4. **Champ select:** the win chance on the suggested-pick card stays uncolored (it compares options), as the code comment in `PickTable` says, even though the mockup shows it green.

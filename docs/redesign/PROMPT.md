You're implementing the approved panel redesign for LoL Draft Coach.

Before writing any code:
1. Read `CLAUDE.md` and `docs/SPEC.md`. They win if anything below conflicts with them; say so if that happens.
2. Read `docs/redesign/REDESIGN-HANDOFF.md` in full. It's the spec for this work: layout, data mapping, states, new data fields, checks and decisions.
3. Open every mockup in `docs/redesign/mockups/`: ChampSelect, LockedIn-Runes, LockedIn-Build, LockedIn-Matchups, LastGame, Style, Month, Connect, Pool. Each one is a static 440 × 720 picture of a final screen and is the visual target. The numbers in them are sample data: never copy a value, champion, item or rune into code.
4. Look at the current code for each screen (`apps/desktop/src/renderer/screens`, `components`, `styles.css`) and at the view types (`apps/desktop/src/shared/view.ts`).

Then give me a short plan before you change anything:
- the files you'll touch per screen
- the new view fields and where they come from
- anything in the handoff you think is wrong or won't fit in 720px

Wait for my OK on the plan.

After I approve, work on a branch `feat/panel-redesign-v2` from `main`, in the order in section 8 of the handoff:
1. shared styles, header, footer and notices
2. the data fields, with tests
3. Connect
4. Champ select
5. Locked in
6. Last game
7. Style
8. This month
9. Pool

For each screen:
- build it to match the mockup and the handoff, with tokens and the type scale only
- run `pnpm typecheck && pnpm test`
- take an `LDC_SCREENSHOT` with the mock client or simulator scenario listed in section 7. Confirm the overflow is 0 and check the screenshot against the mockup. Fix any difference before moving on.
- commit (Conventional Commits) and push

Things I care about on Locked in (section 4.2 of the handoff):
- It has three tabs: Runes · Build · Matchups & plan.
- Runes and the skill grid keep their current look: reuse `RunePage` and `SkillGrid` as they are.
- The Build tab must show the alternative items. Under each main item, show up to two alternatives (icon plus pick rate) from `items[].alternatives` and `boots.alternatives`, the main item's pick rate, and a ★ on the item that adds the most. Show "No other common pick" when there is none.
- Matchups stay. Put the game plan first. Then your lane opponent as a highlighted row with the verdict and signed delta visible ("Hard −0.8"), the win rate and the games. Then the other enemies, then your team.

Hard rules for the whole job:
- No scrollbar on any screen at 440 × 720.
- Never cut text: no ellipsis, no line-clamp, no "…". Text wraps.
- No hardcoded game data.
- New wording goes in `config/explain.v1.json`.
- The renderer stays UI only.
- The import still only acts on a click.
- Show the Riot notice in full.

When all seven screens are done:
1. Run the full check list in section 7, including the edge states and the keyboard pass.
2. Bump the version and update `CHANGELOG.md` per CLAUDE.md.
3. Open a PR with:
   - a screenshot of each screen next to its mockup
   - the decisions in section 9, called out for me to confirm
   - a note that the design system needs a resync from `styles.css`

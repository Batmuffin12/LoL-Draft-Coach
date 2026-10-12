# LoL Draft Coach: install guide

A panel next to the League client that suggests picks, bans and builds in champ select, from your own games and the current meta in your rank. It only suggests: it never picks, bans or locks for you.

You need: Windows 10 or 11, League of Legends on EUW, and an **invite code** from the person who sent you this page (each code works once).

## 1. Install

1. Download `LoL-Draft-Coach-Setup-<version>.exe` from the link you were given (the project's GitHub Releases page).
2. Run it. Windows will say **"Windows protected your PC"**, because the app isn't code-signed (signing costs money for a small private app). Click **More info**, then **Run anyway**.
3. Choose where to install (the default is fine) and finish. A desktop shortcut "LoL Draft Coach" is created.

## 2. Connect

1. Open League of Legends and log in **first**: the app reads your Riot ID from the client, so you never type it.
2. On your invite page, click **Open LoL Draft Coach**: the app opens with your code filled in. (Or open it from the desktop shortcut and paste the code.)
3. Click **Connect**.
4. The first time, the server loads your recent ranked and draft games. Your newest games arrive within a few minutes; older ones keep loading in the background (the panel shows how many are left).

## 3. Use it

- The panel docks to the right of the League client and follows it.
- **Champ select**: suggested picks for your role with reasons, ban suggestions, and once you lock in: runes, summoner spells, skill order and build. **Import** writes the rune page, item set and spells into the client, only when you click it.
- **Between games**: your last game, your playstyle against your rank, your champion pool, champions worth learning, and a monthly report.
- Works in Ranked Solo/Duo, Ranked Flex and Normal Draft.

## Updates

The app updates itself: when a new version exists, it downloads in the background and installs the next time you close the app. You don't need to do anything.

## When something goes wrong

- **"Can't reach the coach server" / "still starting up"**: the server sleeps when nobody uses it and takes up to a minute to wake. The panel keeps coaching from your games saved on your PC and tries again by itself.
- **"This app is set up for X, but the League client is logged in as Y"**: the app belongs to one League account. To switch, click **Sign out** (bottom of the panel) and connect again with a new invite code.
- **The panel doesn't appear next to the client**: make sure League is open and logged in; restart the app.
- Anything else: tell the person who invited you. When the app crashes it sends a crash report so it can be fixed; reports never contain your Riot ID, your account or your Windows user name.

## Your data

- The server keeps your own games (from Riot's official API), what the coach suggested in your games, and your rank over time. Other players in your games are never stored by name or ID, and the app never shows teammates' or opponents' names, ranks or histories.
- **Delete my data** (bottom of the panel) deletes everything the server stores about you and signs you out. **Sign out** only forgets the connection on this PC.
- To uninstall: Windows **Settings → Apps → Installed apps → LoL Draft Coach → Uninstall**.

---

LoL Draft Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

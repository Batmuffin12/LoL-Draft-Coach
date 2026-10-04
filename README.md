# LoL Draft Coach

A Windows app that coaches you through League of Legends champion select: it watches the draft live and suggests picks from your own champion pool, with the reasoning behind each one. It only ever **suggests** — it never picks, bans or locks for you.

The full product spec is in [docs/SPEC.md](docs/SPEC.md). Notes for contributors (and Claude Code sessions) are in [CLAUDE.md](CLAUDE.md).

## Requirements

- Windows with the League of Legends client installed
- Node.js 22 LTS (see `.nvmrc`) and pnpm 10
- A Riot API key from https://developer.riotgames.com

## Setup

```powershell
pnpm install
copy .env.example .env   # then fill in RIOT_API_KEY and RIOT_ID
pnpm test                # unit + integration tests
pnpm typecheck
pnpm desktop             # build and start the champ select panel
```

Try the panel without playing a game: run `pnpm --filter @ldc/lcu mock` in one terminal (or `pnpm --filter @ldc/lcu mock recorded/real-ranked-flex-jungle` for the real recording), then in another terminal set the printed `LDC_LCU_OVERRIDE` value and run `pnpm desktop`. The mock replays the draft in a loop and the panel loads your own history from `RIOT_ID`, so the suggestions are real. In the real client, a Practice Tool or custom game champ select also works and can be left without penalty.

Record a real champ select as a test fixture (anonymised automatically): `pnpm --filter @ldc/lcu record`, then enter champ select.

## Repo layout

| Folder | What it does |
| --- | --- |
| `apps/desktop` | Electron panel docked next to the League client |
| `packages/lcu` | League Client API adapter (lockfile, HTTPS, WebSocket), fixture recorder, mock LCU |
| `packages/riot-api` | Riot API adapter with header-driven rate limiter |
| `packages/ddragon` | Data Dragon adapter (champions, items, runes, spells) |
| `packages/engine` | Pure scoring functions (comfort, team needs) |
| `packages/jev` | Jev decision adapter (interface + mock only, flag off) |
| `packages/shared` | Shared types |
| `config/` | Versioned engine weights and rank band config |

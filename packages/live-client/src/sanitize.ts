import { z } from "zod";
import type { LiveEvent, LiveGame, LivePlayer } from "@ldc/shared";

/**
 * Loose schemas of the Live Client Data API (`/liveclientdata/allgamedata`): they check the
 * fields we use and let everything else through, so new fields from Riot don't break the app.
 */
const num = z.number().catch(0);
const str = z.string().catch("");

const PlayerSchema = z
  .object({
    championName: str,
    team: str,
    position: str.optional(),
    level: num,
    isDead: z.boolean().catch(false),
    respawnTimer: num,
    isBot: z.boolean().catch(false),
    items: z.array(z.object({ itemID: z.number(), count: num, slot: num }).loose()).catch([]),
    scores: z.object({ kills: num, deaths: num, assists: num, creepScore: num, wardScore: num }).loose().catch({ kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 }),
  })
  .loose();

export const AllGameDataSchema = z
  .object({
    activePlayer: z.object({ currentGold: z.number().optional() }).loose().catch({}),
    allPlayers: z.array(PlayerSchema),
    events: z.object({ Events: z.array(z.object({ EventID: num, EventName: str, EventTime: num }).loose()).catch([]) }).loose().catch({ Events: [] }),
    gameData: z.object({ gameMode: str, gameTime: num, mapNumber: num }).loose(),
  })
  .loose();

/** Keys that hold a player's name or Riot ID, in players and the active player. */
const NAME_KEYS = ["summonerName", "riotId", "riotIdGameName", "riotIdTagLine"] as const;
/** Event fields that name a player or a game object (a turret, minion or monster), and the detail key for an object. */
const ACTOR_KEYS = { KillerName: "killerObject", VictimName: "victimObject" } as const;
/** Event details that are game facts, never people. */
const DETAIL_KEYS = ["TurretKilled", "InhibKilled", "InhibRespawningSoon", "InhibRespawned", "DragonType", "Stolen", "KillStreak", "AcingTeam"] as const;

/** Every name string the raw data holds for a player (summoner name, Riot ID and its parts). */
function namesOf(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of NAME_KEYS) if (typeof p[k] === "string" && p[k]) out.push(p[k] as string);
  if (typeof p.riotIdGameName === "string" && typeof p.riotIdTagLine === "string") out.push(`${p.riotIdGameName}#${p.riotIdTagLine}`);
  return out;
}

/**
 * All player names in a raw response: what must never appear in anything we keep. A tag line on
 * its own ("EUW", "1234") names nobody and matches ordinary data, so only full names and Riot IDs.
 */
export function playerNames(raw: unknown): string[] {
  const r = raw as { activePlayer?: Record<string, unknown>; allPlayers?: Record<string, unknown>[] };
  const tags = new Set([...(r.allPlayers ?? []), r.activePlayer ?? {}].map((p) => p.riotIdTagLine));
  const all = [...(r.allPlayers ?? []).flatMap(namesOf), ...(r.activePlayer ? namesOf(r.activePlayer) : [])];
  return [...new Set(all.filter((n) => n.length > 0 && !tags.has(n)))];
}

/**
 * The live game without any player identity (CLAUDE.md "Riot compliance"): names and Riot IDs
 * are dropped, events point at players by index, and an event field that isn't a known player
 * keeps only game-object names (turrets, minions, monsters). Null when the response isn't a game.
 */
export function sanitizeLiveGame(raw: unknown): LiveGame | null {
  const parsed = AllGameDataSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const rawPlayers = (raw as { allPlayers: Record<string, unknown>[] }).allPlayers;
  const index = new Map<string, number>();
  rawPlayers.forEach((p, i) => {
    for (const n of namesOf(p)) index.set(n, i);
  });
  const active = (raw as { activePlayer?: Record<string, unknown> }).activePlayer ?? {};
  const me = namesOf(active).map((n) => index.get(n)).find((i) => i !== undefined) ?? null;

  const players: LivePlayer[] = d.allPlayers.map((p) => ({
    championName: p.championName,
    team: p.team,
    position: p.position ?? "",
    level: p.level,
    isDead: p.isDead,
    respawnTimer: p.respawnTimer,
    isBot: p.isBot,
    items: p.items.map((it) => ({ itemId: it.itemID, count: it.count, slot: it.slot })),
    scores: { kills: p.scores.kills, deaths: p.scores.deaths, assists: p.scores.assists, creepScore: p.scores.creepScore, wardScore: p.scores.wardScore },
  }));

  const who = (v: unknown): number | null => (typeof v === "string" ? (index.get(v) ?? null) : null);
  const events: LiveEvent[] = d.events.Events.map((e) => {
    const r = e as Record<string, unknown>;
    const detail: Record<string, string | number | boolean> = {};
    for (const k of DETAIL_KEYS) {
      const v = r[k];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") detail[k] = v;
    }
    // A non-player actor (a turret, minion or monster) is kept as a game object name.
    for (const [k, out] of Object.entries(ACTOR_KEYS)) {
      const v = r[k];
      if (typeof v === "string" && !index.has(v) && /^(Turret|Barracks|Minion|SRU_|Dragon|Baron|Herald|Horde|Atakhan|Unknown)/.test(v)) detail[out] = v;
    }
    const assisters = Array.isArray(r.Assisters) ? r.Assisters.map(who).filter((i): i is number => i !== null) : [];
    return {
      id: e.EventID,
      type: e.EventName,
      time: e.EventTime,
      killer: who(r.KillerName ?? r.Acer ?? r.Recipient),
      victim: who(r.VictimName),
      assisters,
      ...(Object.keys(detail).length ? { detail } : {}),
    };
  });

  return {
    gameTime: d.gameData.gameTime,
    gameMode: d.gameData.gameMode,
    mapNumber: d.gameData.mapNumber,
    me,
    myGold: typeof d.activePlayer.currentGold === "number" ? d.activePlayer.currentGold : null,
    players,
    events,
  };
}

/**
 * Where a name from `names` is left in `value` (empty when clean): the leak check. Looks at text
 * values only (keys and numbers can't hold a name): a value equal to a name, ignoring case, or
 * containing a name of 5+ characters. Returns the paths, never the names.
 */
export function leakPaths(value: unknown, names: readonly string[], path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leakPaths(v, names, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leakPaths(v, names, `${path}.${k}`));
  if (typeof value !== "string") return [];
  const v = value.toLowerCase();
  return names.some((n) => n.length >= 3 && (v === n.toLowerCase() || (n.length >= 5 && v.includes(n.toLowerCase())))) ? [path] : [];
}

/** Names from `names` that are left in `value` (empty when clean), by the same rule as `leakPaths`. */
export function leakedNames(value: unknown, names: readonly string[]): string[] {
  return names.filter((n) => leakPaths(value, [n]).length > 0);
}

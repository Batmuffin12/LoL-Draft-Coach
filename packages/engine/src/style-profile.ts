import type { ChampionId, Position, UserMatch } from "@ldc/shared";
import type { EngineConfig } from "./config";
import { measureMetrics, type MetricReference, type MetricResult } from "./playstyle";

export type StyleConfig = NonNullable<EngineConfig["style"]>;

/** How you play in one role, beside the axes: headline numbers, pool focus, classes and damage. */
export interface StyleProfile {
  role: Position;
  /** Your games in the role behind focus, classes and damage (the last `window`). */
  games: number;
  /** Headline numbers against your rank (same reference as the axes), in config order. */
  headline: MetricResult[];
  /** Champions you played in those games, and the share of them on your top N. */
  focus: { champions: number; top: { n: number; share: number }[] };
  /** Data Dragon's first tag of each game's champion, as a share of games, most first. */
  classes: { tag: string; share: number }[];
  /** Your damage to champions by type, as shares (null without any damage). */
  damage: { physical: number; magic: number; true: number } | null;
}

const mine = (m: UserMatch) => m.match.participants[m.me];

/**
 * How you play in a role (pure, your own games only; others appear only as the anonymous
 * reference). Null below the playstyle's minimum games in the role.
 */
export function styleProfile(
  matches: UserMatch[],
  role: Position,
  now: number,
  cfg: { playstyle: EngineConfig["playstyle"]; style: StyleConfig },
  tagsOf: (id: ChampionId) => string[] | undefined,
  bandReferences?: Record<string, MetricReference>,
): StyleProfile | null {
  const inRole = matches.filter((m) => mine(m)?.position === role).sort((a, b) => b.match.endedAt - a.match.endedAt);
  if (!role || inRole.length < cfg.playstyle.minGamesPerRole) return null;
  const headline = measureMetrics(matches, role, cfg.style.headline[role] ?? cfg.style.headline.default ?? [], now, cfg.playstyle, bandReferences) ?? [];
  const recent = inRole.slice(0, cfg.style.window);

  const perChamp = new Map<ChampionId, number>();
  for (const m of recent) perChamp.set(mine(m)!.championId, (perChamp.get(mine(m)!.championId) ?? 0) + 1);
  const counts = [...perChamp.values()].sort((a, b) => b - a);
  const top = cfg.style.focusTop.map((n) => ({ n, share: counts.slice(0, n).reduce((a, b) => a + b, 0) / recent.length }));

  const perTag = new Map<string, number>();
  for (const m of recent) {
    const tag = tagsOf(mine(m)!.championId)?.[0];
    if (tag) perTag.set(tag, (perTag.get(tag) ?? 0) + 1);
  }
  const classes = [...perTag]
    .map(([tag, n]) => ({ tag, share: n / recent.length }))
    .filter((c) => c.share >= cfg.style.minClassShare)
    .sort((a, b) => b.share - a.share || a.tag.localeCompare(b.tag))
    .slice(0, cfg.style.maxClasses);

  let physical = 0;
  let magic = 0;
  let trueDamage = 0;
  for (const m of recent) {
    const p = mine(m)!;
    physical += p.physicalDamage;
    magic += p.magicDamage;
    trueDamage += p.trueDamage;
  }
  const total = physical + magic + trueDamage;
  const damage = total > 0 ? { physical: physical / total, magic: magic / total, true: trueDamage / total } : null;

  return { role, games: recent.length, headline, focus: { champions: perChamp.size, top }, classes, damage };
}

/** Win rate on each side of the map, and whether the gap is real (two-proportion z test). */
export interface SideSplit {
  blue: { games: number; winRate: number };
  red: { games: number; winRate: number };
  /** The side you really do better on, or null when the gap could be chance. */
  better: "blue" | "red" | null;
}

/** Your win rate by side over all your games (every role). Null without games on both sides. */
export function sideSplit(matches: UserMatch[], cfg: StyleConfig["side"]): SideSplit | null {
  let blueWins = 0;
  let blueGames = 0;
  let redWins = 0;
  let redGames = 0;
  for (const m of matches) {
    const p = mine(m);
    if (!p) continue;
    if (p.teamId === cfg.blueTeamId) {
      blueGames++;
      if (p.win) blueWins++;
    } else {
      redGames++;
      if (p.win) redWins++;
    }
  }
  if (!blueGames || !redGames) return null;
  const blue = blueWins / blueGames;
  const red = redWins / redGames;
  const pooled = (blueWins + redWins) / (blueGames + redGames);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / blueGames + 1 / redGames));
  const d = blue - red;
  const real = blueGames >= cfg.minGames && redGames >= cfg.minGames && Math.abs(d) >= cfg.minDiff && (se === 0 || Math.abs(d) / se >= cfg.z);
  return { blue: { games: blueGames, winRate: blue }, red: { games: redGames, winRate: red }, better: real ? (d > 0 ? "blue" : "red") : null };
}

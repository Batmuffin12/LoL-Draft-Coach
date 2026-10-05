import type { ChampionId, Position } from "@ldc/shared";
import { computeComfort, halfLifeWeight, mixAvailable, winComponent } from "./comfort";
import type { EngineConfig } from "./config";
import type { MasteryEntry, PlayerGame } from "./types";

export interface RoleAdvice {
  role: Position;
  games: number;
  winRate: number;
  /** False below roleAdvice.minGames: shown as "not enough games", never ranked above roles with data. */
  enoughData: boolean;
  /** Role familiarity in [0, 1]: recency-weighted win rate (smoothed) and experience. */
  score: number;
  /** The player's best champions in this role, by comfort. */
  topChampions: ChampionId[];
}

/**
 * Ranks the roles the player has played by how well they do there lately
 * (information for the lobby; it never sets positions). Roles come from the
 * player's own Match-V5 history, not from a fixed list.
 */
export function adviseRoles(games: PlayerGame[], masteries: MasteryEntry[], now: number, cfg: EngineConfig): RoleAdvice[] {
  const ra = cfg.roleAdvice;
  const weight = (g: PlayerGame) => halfLifeWeight(now - g.endedAt, ra.halfLifeDays);
  const total = games.reduce((s, g) => s + weight(g), 0);
  const base = total > 0 ? games.reduce((s, g) => s + (g.win ? weight(g) : 0), 0) / total : 0.5;

  const roles = [...new Set(games.map((g) => g.position).filter(Boolean))];
  return roles
    .map((role) => {
      const list = games.filter((g) => g.position === role);
      const w = list.reduce((s, g) => s + weight(g), 0);
      const wWins = list.reduce((s, g) => s + (g.win ? weight(g) : 0), 0);
      const win = winComponent(wWins, w, base, cfg.comfort);
      const experience = 1 - Math.exp(-w / ra.experienceScaleGames);
      const comfort = computeComfort(games, masteries, now, cfg.comfort, role);
      const topChampions = [...comfort.values()]
        .filter((c) => (c.gamesInRole ?? 0) > 0)
        .sort((a, b) => b.score - a.score || a.championId - b.championId)
        .slice(0, ra.topChampions)
        .map((c) => c.championId);
      return {
        role,
        games: list.length,
        winRate: list.filter((g) => g.win).length / list.length,
        enoughData: list.length >= ra.minGames,
        score: mixAvailable([
          { value: win.value, weight: ra.mix.winRate },
          { value: experience, weight: ra.mix.experience },
        ]),
        topChampions,
      };
    })
    .sort((a, b) => Number(b.enoughData) - Number(a.enoughData) || b.score - a.score || b.games - a.games);
}

import type { ChampionId, Position, UserMatch } from "@ldc/shared";
import type { EngineConfig } from "./config";
import { roleFit } from "./recommend";
import type { ChampionAttributes, ComfortStats, MasteryEntry } from "./types";

const DAY_MS = 86_400_000;

export type PoolTier = "main" | "comfortable" | "learning" | "rusty";
export type PoolNeed = "magic" | "physical" | "frontline" | "engage";

export interface PoolChampion {
  championId: ChampionId;
  tier: PoolTier;
  /** Games in this role (from the player's history). */
  games: number;
  winRate: number | null;
  /** Comfort score 0..1 for this role. */
  comfort: number;
  /** Learning champions only: how far along (games of all roles) and when it settles. */
  progress?: LearningProgress;
}

export interface LearningProgress {
  games: number;
  /** It stays "learning" up to this many games. */
  maxGames: number;
  /** Days left in the learning window. */
  daysLeft: number;
}

export interface PoolHole {
  need: PoolNeed;
  /** Learning or rusty champions in this pool that would cover the need. */
  coveredBy: ChampionId[];
  /** The player's losses in this role where their team lacked this need. */
  lossesLacking: number;
  losses: number;
}

export interface RolePool {
  role: Position;
  champions: PoolChampion[];
  /**
   * Needs no main or comfortable champion covers (judged only when attributes are known),
   * that the player's losses back up; most frequent in losses first.
   */
  holes: PoolHole[];
}

const covers = (a: ChampionAttributes, need: PoolNeed, cov: EngineConfig["pool"]["coverage"]) =>
  need === "magic"
    ? a.magicShare >= cov.damageShare
    : need === "physical"
      ? a.physicalShare >= cov.damageShare
      : need === "frontline"
        ? a.frontline >= cov.frontline
        : a.engage >= cov.engage;

const NEEDS: PoolNeed[] = ["magic", "physical", "frontline", "engage"];

/**
 * The player's champion pool for one role, in tiers, and the draft needs it doesn't
 * cover. Tiers come from comfort (computed for this role), first/last play times and
 * mastery; holes from measured champion attributes. Each hole carries evidence from
 * the player's own losses in the role (how often their team lacked that need).
 */
export function analyzePool(input: {
  role: Position;
  comfort: Map<ChampionId, ComfortStats>;
  masteries: MasteryEntry[];
  matches: UserMatch[];
  attributes: Map<ChampionId, ChampionAttributes>;
  intendedPositions: Map<ChampionId, Position[]>;
  now: number;
  config: EngineConfig;
}): RolePool {
  const { role, comfort, attributes, now, config } = input;
  const cfg = config.pool;

  const firstPlayed = new Map<ChampionId, number>();
  for (const m of input.matches) {
    const p = m.match.participants[m.me];
    if (p) firstPlayed.set(p.championId, Math.min(firstPlayed.get(p.championId) ?? Infinity, m.match.endedAt));
  }
  const mastery = new Map(input.masteries.map((m) => [m.championId, m]));

  const champions: PoolChampion[] = [];
  for (const c of comfort.values()) {
    const fit = roleFit(c.championId, c, role, input.intendedPositions, attributes, config.roles);
    const games = c.gamesInRole ?? 0;
    const entry = { championId: c.championId, games, winRate: c.winRateInRole, comfort: c.score };
    const first = firstPlayed.get(c.championId);
    const m = mastery.get(c.championId);
    if (fit && games >= cfg.coreGames && c.score >= cfg.coreMin) champions.push({ ...entry, tier: "main" });
    else if (fit && games > 0 && first !== undefined && now - first <= cfg.learningWindowDays * DAY_MS && c.games <= cfg.learningMaxGames)
      champions.push({
        ...entry,
        tier: "learning",
        progress: { games: c.games, maxGames: cfg.learningMaxGames, daysLeft: Math.max(1, Math.ceil(cfg.learningWindowDays - (now - first) / DAY_MS)) },
      });
    else if (fit && games > 0 && c.score >= cfg.secondaryMin) champions.push({ ...entry, tier: "comfortable" });
    else if (
      // Rusty: lots of mastery, not played for a while, and a real role fit here (not just the player's own games).
      m &&
      m.points >= cfg.dormantMastery &&
      m.lastPlayTime !== undefined &&
      now - m.lastPlayTime >= cfg.dormantDays * DAY_MS &&
      (input.intendedPositions.get(c.championId)?.includes(role) ?? false)
    )
      champions.push({ ...entry, tier: "rusty" });
  }
  const order: Record<PoolTier, number> = { main: 0, comfortable: 1, learning: 2, rusty: 3 };
  champions.sort((a, b) => order[a.tier] - order[b.tier] || b.comfort - a.comfort || a.championId - b.championId);
  const limited = (["main", "comfortable", "learning", "rusty"] as PoolTier[]).flatMap((t) =>
    champions.filter((c) => c.tier === t).slice(0, cfg.maxPerTier),
  );

  // Holes: judged only on main + comfortable champions with measured attributes.
  const reliable = limited.filter((c) => c.tier === "main" || c.tier === "comfortable").map((c) => attributes.get(c.championId)).filter((a): a is ChampionAttributes => !!a);
  const holes: PoolHole[] = [];
  if (reliable.length) {
    const losses = input.matches.filter((m) => {
      const p = m.match.participants[m.me];
      return p && p.position === role && !p.win;
    });
    for (const need of NEEDS) {
      if (reliable.some((a) => covers(a, need, cfg.coverage))) continue;
      const lossesLacking = losses.filter((m) => {
        const me = m.match.participants[m.me]!;
        const team = m.match.participants.filter((p) => p.teamId === me.teamId);
        if (need === "magic" || need === "physical") {
          const magic = team.reduce((s, p) => s + p.magicDamage, 0);
          const total = team.reduce((s, p) => s + p.magicDamage + p.physicalDamage + p.trueDamage, 0) || 1;
          const share = need === "magic" ? magic / total : 1 - magic / total;
          return share < 1 - cfg.coverage.damageShare;
        }
        return !team.some((p) => {
          const a = attributes.get(p.championId);
          return a ? covers(a, need, cfg.coverage) : false;
        });
      }).length;
      // Shown when the player's own losses back it up (or there are too few losses to judge).
      if (losses.length < cfg.minLossesForEvidence || lossesLacking / losses.length >= cfg.minLossShare) {
        const coveredBy = limited
          .filter((c) => c.tier === "learning" || c.tier === "rusty")
          .filter((c) => {
            const a = attributes.get(c.championId);
            return a ? covers(a, need, cfg.coverage) : false;
          })
          .map((c) => c.championId);
        holes.push({ need, coveredBy, lossesLacking, losses: losses.length });
      }
    }
    holes.sort((a, b) => b.lossesLacking / Math.max(1, b.losses) - a.lossesLacking / Math.max(1, a.losses));
  }
  return { role, champions: limited, holes };
}

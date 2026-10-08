import { z } from "zod";
import type { FactorName, RankBandId } from "@ldc/shared";

const weight = z.number().min(0);
export const FactorWeightsSchema = z.object({
  comfort: weight,
  teamNeeds: weight,
  laneMatchup: weight,
  counterValue: weight,
  metaStrength: weight,
}) satisfies z.ZodType<Record<FactorName, number>>;
export type FactorWeights = z.infer<typeof FactorWeightsSchema>;

const unit = z.number().min(0).max(1);

export const EngineConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  bands: z.record(z.string().regex(/^\d+$/), FactorWeightsSchema),
  comfort: z.object({
    smoothingK: z.number().min(0),
    experienceScaleGames: z.number().positive(),
    winRateSpread: z.number().positive(),
    /** Champion skill: transfers across roles and fades slowly. */
    skill: z.object({
      halfLifeDays: z.number().positive(),
      /** Mastery counts half as much after this many days without playing the champion. */
      masteryStaleHalfLifeDays: z.number().positive(),
      /** Mastery milestone grades, worst to best. */
      gradeScale: z.array(z.string()).min(2),
      mix: z.object({ mastery: weight, grades: weight, winRate: weight }),
    }),
    /** Current form: recent games in the role. */
    form: z.object({
      halfLifeDays: z.number().positive(),
      /** Weight of games played on the champion in other roles (0..1). */
      offRoleGameWeight: unit,
      mix: z.object({ winRate: weight, experience: weight }),
    }),
    mix: z.object({ skill: weight, form: weight }),
  }),
  roleAdvice: z.object({
    halfLifeDays: z.number().positive(),
    experienceScaleGames: z.number().positive(),
    /** Below this many games in a role, it's shown as "not enough games". */
    minGames: z.number().int().min(1),
    topChampions: z.number().int().positive(),
    mix: z.object({ winRate: weight, experience: weight }),
  }),
  teamNeeds: z.object({
    minAttributeSamples: z.number().int().min(1),
    targetMagicShare: unit,
    frontlineThreshold: unit,
    engageThreshold: unit,
    reasonMinNeed: unit,
    reasonMinFit: unit,
    dimensions: z.object({ damageBalance: weight, frontline: weight, engage: weight }),
  }),
  roles: z.object({
    /** A role counts as meta for a champion when at least this share of other players' games are in it... */
    minRoleShare: unit,
    /** ...and the champion has been seen in at least this many of their games (small samples are noise). */
    minRoleSamples: z.number().int().min(1),
    /** Score reduction for picks you play in a role that isn't meta for the champion (0..1). */
    offMetaPenalty: unit,
    /** Games you need in a role before an off-meta champion is suggested there. */
    offMetaMinGames: z.number().int().min(1),
  }),
  /** Playstyle axes: percentiles of Riot metrics against others in the same role. */
  playstyle: z.object({
    halfLifeDays: z.number().positive(),
    /** Games in a role (and per axis) before a playstyle is shown. */
    minGamesPerRole: z.number().int().min(1),
    /** Metrics a single game needs for an axis to count it. */
    minMetrics: z.number().int().min(1),
    /** Reference values a metric needs before it is used. */
    minReferenceSamples: z.number().int().min(1),
    axes: z.record(z.string(), z.object({ metrics: z.array(z.string().regex(/^-?[\w.]+$/)).min(1) })),
  }),
  /** Growth focus (DESIGN §7): one measurable thing at a time, with a target and progress. */
  growth: z.object({
    /** Your most recent games in the role that count. */
    window: z.number().int().min(2),
    /** The last games that measure progress; the target is set from the games before them. */
    checkGames: z.number().int().min(1),
    /** The target is this share of the way from your baseline to typical. */
    targetStep: z.number().positive().max(1),
    /** Games needed in the role (and on a champion to focus on it alone). */
    minGames: z.number().int().min(1),
    /** A metric must separate wins from losses by at least this much win rate to be a focus. */
    minImportance: z.number().min(0),
  }),
  /** Deaths before this minute count as early deaths (the "earlyDeaths" metric, from timelines). */
  earlyDeathsMinute: z.number().positive().default(14),
  /** The game plan after lock-in: when its lines are said (all from measured snapshot data). */
  plan: z.object({
    /** A lane within this change in win chance (0..1) either way is "even". */
    evenWin: unit,
    /** The teams' mean (long − short game win rate) must differ by this much to say who scales. */
    scalingGap: unit,
    /** Their damage is called physical or magic from this share. */
    damageShare: unit,
    /** Their engage champion is named from this crowd-control percentile. */
    engageMin: unit,
  }),
  /**
   * Session check (the October 2026 review): after a losing streak or a long session, suggest a
   * short break, with your own record after such streaks. Your games only.
   */
  session: z.object({
    /** Games that end within this many minutes of each other (and of now) are one session. */
    gapMinutes: z.number().positive(),
    /** Losses in a row in this session that bring up the check. */
    lossStreak: z.number().int().min(1),
    /** Games in one session that bring up the check. */
    longSession: z.number().int().min(2),
    /** Games after such a streak needed before your own record is quoted. */
    minGames: z.number().int().min(1),
  }),
  /** Monthly report (DESIGN §7, F8). */
  report: z.object({
    /** The period, in days, compared with the same length of time before it. */
    days: z.number().int().min(1),
    maxChampions: z.number().int().min(1),
    /** Games on a champion before the period needed to show its change. */
    minPriorGames: z.number().int().min(1),
  }),
  /** New-champion recommender (DESIGN §6). */
  newChamps: z.object({
    /** Champions you played fewer games of in the role (and with less mastery) count as new. */
    maxGames: z.number().int().min(0),
    maxMastery: z.number().min(0),
    /** Meta in the role: at least this many games and this pick rate in your band. */
    minGames: z.number().int().min(1),
    minPickRate: unit,
    /** Smoothing toward the role's average win rate, and the win-rate difference that counts as fully strong. */
    priorGames: z.number().min(0),
    metaScale: z.number().positive(),
    /** Riot difficulty (0–10): up to easyMax is easy, from hardMin hard. */
    easyMax: z.number(),
    hardMin: z.number(),
    /** Similarity (−1…1) to say "plays like your X", and above which a champion counts as a clone. */
    likeMin: z.number(),
    cloneCut: z.number().max(0.99),
    topN: z.number().int().min(1),
    /** "Try it in 3 to 5 Normal Draft games." */
    planGames: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    weights: z.object({ similarity: z.number(), gap: z.number(), meta: z.number(), ease: z.number(), overlap: z.number() }),
  }),
  /** Champion pool tiers per role, and the draft needs the pool should cover. */
  pool: z.object({
    /** Main: at least coreGames in the role and comfort >= coreMin. */
    coreMin: unit,
    coreGames: z.number().int().min(1),
    /** Comfortable: comfort >= secondaryMin. */
    secondaryMin: unit,
    /** Learning: first played within learningWindowDays and at most learningMaxGames games. */
    learningWindowDays: z.number().positive(),
    learningMaxGames: z.number().int().min(1),
    /** Rusty: at least dormantMastery points, unplayed for dormantDays, and a listed role fit. */
    dormantMastery: z.number().min(0),
    dormantDays: z.number().positive(),
    maxPerTier: z.number().int().min(1),
    /** A champion covers a need at these measured levels (shares and percentiles, 0..1). */
    coverage: z.object({ damageShare: unit, frontline: unit, engage: unit }),
    /** A hole is shown only when the team lacked it in at least this share of the player's losses in the role... */
    minLossShare: unit,
    /** ...unless there are fewer losses than this to judge by (then it's shown without evidence). */
    minLossesForEvidence: z.number().int().min(1),
  }),
  /**
   * Engine v2 (live meta): every factor is a term in rating points (400·log10 odds), each a
   * change over what was already expected, smoothed toward that expectation. Used when a
   * meta snapshot is loaded; the factor weights in `bands` are the fallback without one.
   */
  rating: z.object({
    /** Term weights per rank band. */
    bands: z.record(z.string().regex(/^\d+$/), z.object({ meta: weight, lane: weight, counter: weight, synergy: weight, team: weight, personal: weight })),
    /** Prior games: how strongly thin statistics are pulled toward what was expected. */
    priorGames: z.object({ meta: z.number().min(0), pair: z.number().min(0) }),
    /** Statistics with fewer games are not shown as reasons ("not enough data"). */
    minGames: z.object({ meta: z.number().int().min(0), pair: z.number().int().min(0) }),
    /** Cross-lane opponents and allies matter less than the lane opponent (0..1). */
    counterWeight: unit,
    synergyWeight: unit,
    /** Rating points off a pick the player plays in a role that isn't meta for the champion. */
    offMetaPenalty: z.number().min(0),
    /** Team needs (0..1, 0.5 = neutral) to rating points: (score - 0.5) · ratingScale. */
    teamRatingScale: z.number().min(0),
    personal: z.object({
      /** Comfort (0..1) to rating points: (comfort - neutralComfort) · comfortScale. */
      comfortScale: z.number().min(0),
      neutralComfort: unit,
      /**
       * Comfort stops adding above this level: every champion the player is comfortable on
       * gets the same bonus, so the draft (meta, matchups, team) decides between them
       * instead of always the single most-played one.
       */
      fullComfort: unit,
      /** Rating points for a champion the player has never played; also the floor for low comfort. */
      learningPenalty: z.number().min(0),
      /** Suggest champions the player hasn't played yet (they carry the learning penalty). */
      includeUnplayed: z.boolean(),
    }),
    /** Lane opponent unknown: expected matchup over likely opponents, minus a share of the bad tail. */
    blind: z.object({
      riskAversion: z.number().min(0),
      /** Quantile (0..1) of the opponents' matchup deltas taken as the bad tail. */
      riskQuantile: unit,
      /** Most-played opponents considered. */
      maxOpponents: z.number().int().min(1),
      /** A blind pick is "safe" when its bad tail is no worse than this (rating points). */
      safeMaxLoss: z.number().min(0),
    }),
    /** The counter term counts this much more when every enemy has picked. */
    lastPickCounterBoost: z.number().min(1),
    bans: z.object({
      /** Champions picked in fewer games than this share (0..1) aren't considered. */
      minPickRate: unit,
      /** Weight of a champion's own strength next to how badly it beats your picks. */
      metaWeight: z.number().min(0),
      /** Share (0..1) of a champion's strength that counts when it plays a lane other than yours. */
      offRoleWeight: unit,
      /** Extra bans shown for a champion the player hovers; fewer when it's already the #1 suggested pick. */
      hoverTopN: z.number().int().min(0),
      hoverTopNWhenSuggested: z.number().int().min(0),
      /** How many of your best picks a ban should protect. */
      protectPicks: z.number().int().min(1),
      topN: z.number().int().min(1),
    }),
    explain: z.object({
      /** Terms smaller than this change in win chance (0..1) give no reason. */
      minDeltaWin: unit,
      maxReasons: z.number().int().min(1),
      /** Predicted win-chance gap (0..1) between #1 and #2 for a "clear pick". */
      clearGapWin: unit,
      /** Never a "clear pick" when your own games take more than this (0..1) off its win chance (new or weak for you). */
      clearMaxPersonalLossWin: unit,
      /** A champion's power curve is mentioned when long- and short-game win rates differ by this much (0..1). */
      powerCurveGap: unit,
      /** Mentioned when the champion is this much gold ahead of (or behind) its lane opponent at 15 minutes on average. */
      laneGoldGap: z.number().min(0),
      /** Factor bars: this change in win chance fills a bar from the middle to the end. */
      barScaleWin: z.number().positive(),
    }),
  }),
  /** Loadout after lock-in: runes, spells, skill order and items (DESIGN.md "Loadout", "Item ranking"). */
  loadout: z.object({
    /** What counts as a completed item (derived from Data Dragon). */
    items: z.object({ mapId: z.string().min(1), legendaryMinGold: z.number().min(0) }),
    /** An option (page, spells, …) needs this share of the champion-role's games to be suggested… */
    minShare: unit,
    /** …and this many games. */
    minGames: z.number().int().min(1),
    /** Win rates of options are smoothed toward the champion-role's win rate with this many games. */
    priorGames: z.number().min(0),
    /** A rune page into the lane opponent is used when the matchup has this many games. */
    minMatchupGames: z.number().int().min(1),
    /** Item ranking (rankItems): candidates need this share of the slot's purchases. */
    itemMinShare: unit,
    /** Rating points per unit of win added (log-odds scale ≈ 400 / ln 10 × 4 near 50%). */
    winAddedScale: z.number().min(0),
    /** Rating points per unit of ln(share at the slot): what players commonly buy there is the prior that win added moves away from. */
    shareScale: z.number().min(0),
    /** Rating points per unit of ln(lift), scaled by how far the enemy team is above the band in the trait. */
    liftScale: z.number().min(0),
    /** An item whose win added is below this (0..1, negative) is never the top pick at its slot. */
    negativeGuard: z.number().max(0),
    /** Situational runes/items need at least this lift to be shown, and at most this many are shown. */
    minLift: z.number().min(1),
    maxSituational: z.number().int().min(0),
    /** Alternatives shown next to the top item per slot. */
    alternatives: z.number().int().min(0),
    /**
     * Below this many games a build is a rough guide: it pools the champion's other roles, prefers
     * your own games on it (at least personalMinGames), picks the most taken options and hides win rates.
     */
    solidGames: z.number().int().min(1),
    /** Your lane opponent counts this many times in the enemy team's traits (items answer your lane first). */
    laneWeight: z.number().min(1),
    /** An item is suggested in a role only if at least this share of its buyers play that role (role-locked items stay in their role). */
    minItemRoleShare: z.number().min(0).max(1),
    personalMinGames: z.number().int().min(1),
    /** Thin data: this many items stay a fixed core; later ones become a pool of up to laterPoolSize to choose from. */
    coreSlots: z.number().int().min(1),
    laterPoolSize: z.number().int().min(0),
    /** Build slots (completed items) the loadout ranks. */
    slots: z.number().int().min(1),
  }),
  topN: z.number().int().positive(),
});
export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type RatingConfig = EngineConfig["rating"];
export type LoadoutConfig = EngineConfig["loadout"];

export const RankBandConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  bands: z.array(z.object({ id: z.number().int(), name: z.string(), tiers: z.array(z.string()) })).min(1),
  defaultBand: z.number().int(),
  rankedQueueTypesByPriority: z.array(z.string()),
});
export type RankBandConfig = z.infer<typeof RankBandConfigSchema>;

export class ConfigError extends Error {}

function parse<T extends z.ZodType>(schema: T, name: string, json: unknown): z.infer<T> {
  const r = schema.safeParse(json);
  if (!r.success) throw new ConfigError(`Invalid ${name}:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export function parseEngineConfig(json: unknown): EngineConfig {
  return parse(EngineConfigSchema, "engine config", json);
}

export function parseRankBandConfig(json: unknown): RankBandConfig {
  const cfg = parse(RankBandConfigSchema, "rank band config", json);
  if (!cfg.bands.some((b) => b.id === cfg.defaultBand)) throw new ConfigError(`defaultBand ${cfg.defaultBand} is not a defined band`);
  return cfg;
}

/** Band for a tier string (case-insensitive); null when the tier isn't mapped. */
export function bandForTier(tier: string | null | undefined, cfg: RankBandConfig): RankBandId | null {
  if (!tier) return null;
  const t = tier.toUpperCase();
  return cfg.bands.find((b) => b.tiers.some((x) => x.toUpperCase() === t))?.id ?? null;
}

/**
 * Picks the band from a list of (queueType, tier) entries — e.g. LCU ranked stats or
 * League-V4 entries — preferring queues in the configured order. Falls back to defaultBand.
 */
export function bandFromRankedEntries(entries: { queueType: string; tier: string }[], cfg: RankBandConfig): RankBandId {
  for (const queueType of cfg.rankedQueueTypesByPriority) {
    const band = bandForTier(entries.find((e) => e.queueType === queueType)?.tier, cfg);
    if (band !== null) return band;
  }
  return cfg.defaultBand;
}

export function weightsForBand(band: RankBandId, cfg: EngineConfig): FactorWeights {
  const w = cfg.bands[String(band)];
  if (!w) throw new ConfigError(`No factor weights configured for band ${band}`);
  return w;
}

export const AppConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  history: z.object({
    matchCount: z.number().int().positive().max(1000),
    queues: z.array(z.number().int()).min(1),
    /** Your newest games that also get their timeline (one more Riot call each): when you die, your gold at 15. */
    timelineCount: z.number().int().min(0).optional(),
  }),
  supportedQueues: z.array(z.number().int()),
  /** One-click import of the rune page and item set into the client (only on the player's click). Off when missing. */
  import: z.object({ enabled: z.boolean() }).default({ enabled: false }),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function parseAppConfig(json: unknown): AppConfig {
  return parse(AppConfigSchema, "app config", json);
}

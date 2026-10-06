import { z } from "zod";

/**
 * Zod schemas for the LCU payloads we read. They are deliberately loose: they check
 * the fields we use and let unknown fields through, because the LCU is unofficial and
 * gains fields between patches. A renamed or retyped field we rely on fails loudly.
 */

export const ChampSelectPlayerSchema = z.looseObject({
  cellId: z.number().int(),
  championId: z.number().int().default(0),
  championPickIntent: z.number().int().default(0),
  assignedPosition: z.string().default(""),
  team: z.number().int().optional(),
});

export const ChampSelectActionSchema = z.looseObject({
  id: z.number().int(),
  actorCellId: z.number().int(),
  championId: z.number().int().default(0),
  completed: z.boolean(),
  isAllyAction: z.boolean().default(false),
  isInProgress: z.boolean().default(false),
  type: z.string(),
});

export const ChampSelectSessionSchema = z.looseObject({
  actions: z.array(z.array(ChampSelectActionSchema)).default([]),
  bans: z
    .looseObject({
      myTeamBans: z.array(z.number().int()).default([]),
      theirTeamBans: z.array(z.number().int()).default([]),
    })
    .default({ myTeamBans: [], theirTeamBans: [] }),
  isCustomGame: z.boolean().default(false),
  localPlayerCellId: z.number().int(),
  myTeam: z.array(ChampSelectPlayerSchema),
  theirTeam: z.array(ChampSelectPlayerSchema).default([]),
  timer: z.looseObject({
    phase: z.string(),
    adjustedTimeLeftInPhase: z.number().default(0),
  }),
});
export type ChampSelectSession = z.infer<typeof ChampSelectSessionSchema>;

export const GameflowPhaseSchema = z.string();

export const GameflowSessionSchema = z.looseObject({
  phase: z.string(),
  gameData: z
    .looseObject({
      queue: z.looseObject({ id: z.number().int() }).optional(),
      /** The game's id (once it starts): the local player's own game, to find it in their Match-V5 history. */
      gameId: z.number().int().optional(),
    })
    .optional(),
});
export type GameflowSession = z.infer<typeof GameflowSessionSchema>;

/** Ranked stats of the local player only. Tier strings stay strings; bands come from config. */
export const RankedStatsSchema = z.looseObject({
  queues: z
    .array(
      z.looseObject({
        queueType: z.string(),
        tier: z.string().default(""),
        division: z.string().default(""),
      }),
    )
    .default([]),
});
export type RankedStats = z.infer<typeof RankedStatsSchema>;

/**
 * The local player's own summoner. Note: this PUUID is not valid for the Riot API
 * (which uses per-key encrypted PUUIDs); resolve gameName#tagLine via Account-V1 instead.
 */
export const CurrentSummonerSchema = z.looseObject({
  puuid: z.string().optional(),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
});
export type CurrentSummoner = z.infer<typeof CurrentSummonerSchema>;

export const PickableChampionIdsSchema = z.array(z.number().int());

/**
 * Riot's own recommended positions per champion (keyed by champion id as a string),
 * maintained by Riot each patch. Unofficial like all LCU data.
 */
export const RecommendedPositionsSchema = z.record(
  z.string().regex(/^\d+$/),
  z.looseObject({ recommendedPositions: z.array(z.string()).default([]) }),
);

/** Every perk the client knows (runes and stat shards), with its name and the client's icon path. */
export const PerksSchema = z.array(z.looseObject({ id: z.number().int(), name: z.string(), iconPath: z.string().default("") }));
export type Perk = z.infer<typeof PerksSchema>[number];

/** Rune paths with their slots (perk ids per row); the stat shard rows are the slots of type "kStatMod". */
export const PerkStylesSchema = z.array(
  z.looseObject({ id: z.number().int(), slots: z.array(z.looseObject({ type: z.string().default(""), perks: z.array(z.number().int()).default([]) })).default([]) }),
);

export class LcuSchemaError extends Error {
  constructor(
    readonly endpoint: string,
    readonly issues: string,
  ) {
    super(`LCU response for ${endpoint} did not match the expected shape (the client may have changed):\n${issues}`);
  }
}

export function parseLcu<T extends z.ZodType>(schema: T, endpoint: string, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new LcuSchemaError(endpoint, z.prettifyError(result.error));
  return result.data;
}

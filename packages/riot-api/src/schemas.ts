import { z } from "zod";

/** Account-V1 AccountDto. */
export const AccountSchema = z.looseObject({
  puuid: z.string().min(1),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

export const MatchIdsSchema = z.array(z.string());

/** Match-V5 ParticipantDto: only the fields we use are required. */
export const ParticipantSchema = z.looseObject({
  puuid: z.string(),
  championId: z.number().int(),
  teamId: z.number().int(),
  teamPosition: z.string().default(""),
  win: z.boolean(),
  physicalDamageDealtToChampions: z.number().default(0),
  magicDamageDealtToChampions: z.number().default(0),
  trueDamageDealtToChampions: z.number().default(0),
  totalDamageTaken: z.number().default(0),
  damageSelfMitigated: z.number().default(0),
  timeCCingOthers: z.number().default(0),
  kills: z.number().default(0),
  deaths: z.number().default(0),
  assists: z.number().default(0),
  totalMinionsKilled: z.number().default(0),
  neutralMinionsKilled: z.number().default(0),
  goldEarned: z.number().default(0),
  visionScore: z.number().default(0),
  damageDealtToObjectives: z.number().default(0),
  item0: z.number().int().default(0),
  item1: z.number().int().default(0),
  item2: z.number().int().default(0),
  item3: z.number().int().default(0),
  item4: z.number().int().default(0),
  item5: z.number().int().default(0),
  item6: z.number().int().default(0),
  summoner1Id: z.number().int().default(0),
  summoner2Id: z.number().int().default(0),
  /** Rune page: styles[0] is primary, styles[1] secondary; statPerks are the shards. */
  perks: z
    .looseObject({
      statPerks: z.record(z.string(), z.number()).default({}),
      styles: z
        .array(
          z.looseObject({
            style: z.number().int(),
            selections: z.array(z.looseObject({ perk: z.number().int() })).default([]),
          }),
        )
        .default([]),
    })
    .optional(),
  /** Riot's derived per-player metrics. Values are mostly numbers; some are arrays. Field names vary by patch. */
  challenges: z.record(z.string(), z.unknown()).optional(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

/** Match-V5 MatchDto. */
export const MatchSchema = z.looseObject({
  metadata: z.looseObject({ matchId: z.string() }),
  info: z.looseObject({
    gameCreation: z.number(),
    gameDuration: z.number(),
    gameEndTimestamp: z.number().optional(),
    gameVersion: z.string().default(""),
    queueId: z.number().int(),
    participants: z.array(ParticipantSchema),
  }),
});
export type Match = z.infer<typeof MatchSchema>;

/** Champion-Mastery-V4 ChampionMasteryDto. */
export const MasteryListSchema = z.array(
  z.looseObject({
    championId: z.number().int(),
    championLevel: z.number().int(),
    championPoints: z.number(),
    lastPlayTime: z.number().optional(),
    /** End-of-game grades for the current mastery milestone, e.g. ["S", "A+"]. */
    milestoneGrades: z.array(z.string()).optional(),
  }),
);
export type Mastery = z.infer<typeof MasteryListSchema>[number];

/** League-V4 LeagueEntryDTO (tiers stay strings; bands come from config). */
export const LeagueEntriesSchema = z.array(
  z.looseObject({
    queueType: z.string(),
    tier: z.string(),
    rank: z.string().optional(),
    wins: z.number().int().optional(),
    losses: z.number().int().optional(),
  }),
);
export type LeagueEntry = z.infer<typeof LeagueEntriesSchema>[number];

/**
 * League-V4 LeagueEntryDTO from the by-tier list ("entries/{queue}/{tier}/{division}").
 * Only the PUUID is used (summonerId is deprecated); it is never stored with collected matches.
 */
export const LeaguePlayersSchema = z.array(
  z.looseObject({
    puuid: z.string().min(1),
    queueType: z.string(),
    tier: z.string(),
    rank: z.string().optional(),
  }),
);
export type LeaguePlayer = z.infer<typeof LeaguePlayersSchema>[number];

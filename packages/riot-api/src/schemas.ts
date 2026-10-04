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

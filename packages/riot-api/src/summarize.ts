import { normalizePosition, type MatchSummary, type ParticipantSummary } from "@ldc/shared";
import type { Match, Participant } from "./schemas";

function summarizePerks(p: Participant): ParticipantSummary["perks"] {
  const [primary, secondary] = p.perks?.styles ?? [];
  if (!primary || !secondary) return null;
  return {
    primaryStyle: primary.style,
    subStyle: secondary.style,
    runes: [...primary.selections, ...secondary.selections].map((s) => s.perk),
    statPerks: Object.values(p.perks?.statPerks ?? {}),
  };
}

/** Keeps the numeric `challenges` values only (some are arrays or objects). */
function numericChallenges(raw: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

/**
 * Reduces a Match-V5 match to a MatchSummary. All player identifiers (PUUIDs, names,
 * summoner ids) are dropped here, at the adapter boundary.
 */
export function summarizeMatch(match: Match): MatchSummary {
  const info = match.info;
  // Match-V5 gameDuration is in seconds for current matches.
  const durationSec = info.gameDuration;
  return {
    matchId: match.metadata.matchId,
    queueId: info.queueId,
    gameVersion: info.gameVersion,
    endedAt: info.gameEndTimestamp ?? info.gameCreation + durationSec * 1000,
    durationSec,
    participants: info.participants.map((p) => ({
      championId: p.championId,
      teamId: p.teamId,
      position: normalizePosition(p.teamPosition),
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      gold: p.goldEarned,
      visionScore: p.visionScore,
      physicalDamage: p.physicalDamageDealtToChampions,
      magicDamage: p.magicDamageDealtToChampions,
      trueDamage: p.trueDamageDealtToChampions,
      damageTaken: p.totalDamageTaken,
      selfMitigated: p.damageSelfMitigated,
      ccSeconds: p.timeCCingOthers,
      objectiveDamage: p.damageDealtToObjectives,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
      spells: [p.summoner1Id, p.summoner2Id],
      perks: summarizePerks(p),
      challenges: numericChallenges(p.challenges),
    })),
  };
}

/** Index of the participant with this PUUID, or -1. The PUUID itself is never stored. */
export function participantIndex(match: Match, puuid: string): number {
  return match.info.participants.findIndex((p) => p.puuid === puuid);
}

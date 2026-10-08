import { ITEM_BOUGHT, ITEM_DESTROYED, ITEM_SOLD, type MatchTimeline } from "@ldc/shared";
import type { Match, Timeline } from "./schemas";

/**
 * Reduces a Match-V5 timeline to a MatchTimeline: gold per minute, item events and skill
 * order per participant, indexed like the match's participants. PUUIDs are only used here
 * to line the two up and are dropped. Undone purchases and sales are removed.
 */
/**
 * Each participant's deaths to champions before `beforeSec` (from CHAMPION_KILL events), indexed
 * like the match's participants: for the "deaths before 14 min" metric.
 */
export function deathsBefore(timeline: Timeline, match: Match, beforeSec: number): number[] {
  const byPuuid = new Map(match.info.participants.map((p, i) => [p.puuid, i]));
  const indexOf = new Map<number, number>();
  for (const p of timeline.info.participants) {
    const i = byPuuid.get(p.puuid);
    if (i !== undefined) indexOf.set(p.participantId, i);
  }
  const out = match.info.participants.map(() => 0);
  for (const frame of timeline.info.frames) {
    for (const e of frame.events) {
      if (e.type !== "CHAMPION_KILL" || e.victimId === undefined || e.timestamp / 1000 >= beforeSec) continue;
      const i = indexOf.size ? indexOf.get(e.victimId) : e.victimId - 1;
      if (i !== undefined && i >= 0 && i < out.length) out[i]!++;
    }
  }
  return out;
}

/** The summary with each participant's early deaths stamped on (see `deathsBefore`). */
export function withEarlyDeaths<T extends { participants: object[] }>(summary: T, deaths: number[]): T {
  return { ...summary, participants: summary.participants.map((p, i) => (deaths[i] === undefined ? p : { ...p, earlyDeaths: deaths[i] })) };
}

export function summarizeTimeline(timeline: Timeline, match: Match): MatchTimeline {
  const indexOf = new Map<number, number>();
  const byPuuid = new Map(match.info.participants.map((p, i) => [p.puuid, i]));
  for (const p of timeline.info.participants) {
    const i = byPuuid.get(p.puuid);
    if (i !== undefined) indexOf.set(p.participantId, i);
  }
  // Older timelines may lack the participant list: participantId n is then the n-th participant.
  const index = (id: number | undefined) => (id === undefined ? undefined : indexOf.size ? indexOf.get(id) : id >= 1 && id <= match.info.participants.length ? id - 1 : undefined);

  const n = match.info.participants.length;
  const gold: number[][] = Array.from({ length: n }, () => []);
  const skills: number[][] = Array.from({ length: n }, () => []);
  const levels: number[][] = Array.from({ length: n }, () => []);
  const items: [number, number, number, number][] = [];
  const kills: [number, number, number, number][] = [];
  const cs: number[][] = Array.from({ length: n }, () => []);
  const wards: [number, number][] = [];
  const monsters: [number, number, number, number][] = [];
  const bitsOf = (ids: number[] | undefined) =>
    (ids ?? []).reduce((bits, id) => {
      const a = index(id);
      return a === undefined ? bits : bits | (1 << a);
    }, 0);

  for (const frame of timeline.info.frames) {
    for (const pf of Object.values(frame.participantFrames)) {
      const i = index(pf.participantId);
      if (i === undefined) continue;
      gold[i]!.push(Math.round(pf.totalGold));
      if (pf.level !== undefined) levels[i]!.push(pf.level);
      if (pf.minionsKilled !== undefined) cs[i]!.push(pf.minionsKilled + (pf.jungleMinionsKilled ?? 0));
    }
    for (const e of frame.events) {
      if (e.type === "CHAMPION_KILL") {
        const victim = index(e.victimId);
        if (victim === undefined) continue;
        kills.push([Math.round(e.timestamp / 1000), e.killerId ? (index(e.killerId) ?? -1) : -1, victim, bitsOf(e.assistingParticipantIds)]);
        continue;
      }
      if (e.type === "ELITE_MONSTER_KILL") {
        monsters.push([Math.round(e.timestamp / 1000), e.killerId ? (index(e.killerId) ?? -1) : -1, bitsOf(e.assistingParticipantIds), e.killerTeamId ?? 0]);
        continue;
      }
      if (e.type === "WARD_PLACED") {
        // Vision wards only (a champion's own traps and the like have other types).
        const placer = index(e.creatorId);
        if (placer !== undefined && /_(WARD|TRINKET)$/.test(e.wardType ?? "")) wards.push([Math.round(e.timestamp / 1000), placer]);
        continue;
      }
      const i = index(e.participantId);
      if (i === undefined) continue;
      const sec = Math.round(e.timestamp / 1000);
      switch (e.type) {
        case "ITEM_PURCHASED":
          if (e.itemId) items.push([i, sec, ITEM_BOUGHT, e.itemId]);
          break;
        case "ITEM_SOLD":
          if (e.itemId) items.push([i, sec, ITEM_SOLD, e.itemId]);
          break;
        case "ITEM_DESTROYED":
          if (e.itemId) items.push([i, sec, ITEM_DESTROYED, e.itemId]);
          break;
        case "ITEM_UNDO": {
          // Undoing a purchase takes beforeId back; undoing a sale gives afterId back.
          const [kind, id] = e.beforeId ? [ITEM_BOUGHT, e.beforeId] : [ITEM_SOLD, e.afterId ?? 0];
          for (let k = items.length - 1; k >= 0; k--) {
            const it = items[k]!;
            if (it[0] === i && it[2] === kind && it[3] === id) {
              items.splice(k, 1);
              // A purchase also destroyed the components it was built from at the same moment.
              if (kind === ITEM_BOUGHT) {
                for (let d = items.length - 1; d >= k; d--) {
                  const x = items[d]!;
                  if (x[0] === i && x[2] === ITEM_DESTROYED && x[1] === it[1]) items.splice(d, 1);
                }
              }
              break;
            }
          }
          break;
        }
        case "SKILL_LEVEL_UP":
          if (e.skillSlot && (e.levelUpType ?? "NORMAL") === "NORMAL") skills[i]!.push(e.skillSlot);
          break;
      }
    }
  }
  // Levels only when every participant has one per frame (older timelines may lack them).
  const withLevels = levels.every((l, i) => l.length === gold[i]!.length && l.length > 0);
  const withCs = cs.every((c, i) => c.length === gold[i]!.length && c.length > 0);
  return { gold, items, skills, ...(withLevels ? { levels } : {}), kills, ...(withCs ? { cs } : {}), wards, monsters };
}

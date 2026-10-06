import { ITEM_BOUGHT, ITEM_DESTROYED, ITEM_SOLD, type MatchTimeline } from "@ldc/shared";
import type { Match, Timeline } from "./schemas";

/**
 * Reduces a Match-V5 timeline to a MatchTimeline: gold per minute, item events and skill
 * order per participant, indexed like the match's participants. PUUIDs are only used here
 * to line the two up and are dropped. Undone purchases and sales are removed.
 */
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
  const items: [number, number, number, number][] = [];

  for (const frame of timeline.info.frames) {
    for (const pf of Object.values(frame.participantFrames)) {
      const i = index(pf.participantId);
      if (i !== undefined) gold[i]!.push(Math.round(pf.totalGold));
    }
    for (const e of frame.events) {
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
  return { gold, items, skills };
}

import type { ChampionId, Position, Reason } from "@ldc/shared";
import type { EngineConfig } from "./config";
import type { MetaIndex } from "./meta-index";

export type SpikesConfig = EngineConfig["spikes"];

/** A power spike worth showing: a completed item or a level after which the champion gains clearly more than its role. */
export interface PowerSpike {
  kind: "item" | "level";
  /** The item slot (1 = first completed item) or the level. */
  at: number;
  /** About when it happens (mean minute in collected games). */
  minute: number;
  /** Extra gold lead gained over the lane opponent in the minutes after it, beyond the role (shrunk). */
  gold: number;
  z: number;
  games: number;
  /** The item usually completed in that slot by this champion in this role (its build's most common core path). */
  itemId: number | null;
}

/** Whether the snapshot's spikes repeated on two halves of the games well enough to be shown. */
export function spikesTrusted(index: MetaIndex, cfg: SpikesConfig): boolean {
  const c = index.snapshot.spikeCheck;
  return !!c && c.goldCorrelation !== null && c.goldCorrelation >= cfg.minCorrelation && c.signAgreement !== null && c.signAgreement >= cfg.minAgreement;
}

/**
 * A champion's power spikes in a role (docs/ENGINE-PLAN.md): measured from collected timelines,
 * only when the snapshot's split-half check passes and only spikes clearly above noise
 * (|z| ≥ minZ, at least minGold), strongest first, at most `max`, then in time order. Empty
 * when nothing qualifies. Pure.
 */
export function powerSpikes(index: MetaIndex, championId: ChampionId, role: Position, cfg: SpikesConfig): PowerSpike[] {
  if (!spikesTrusted(index, cfg)) return [];
  const mine = index.snapshot.spikes?.find((c) => c.championId === championId && c.role === role);
  if (!mine) return [];
  const core = index.build(championId, role)?.core[0]?.items ?? [];
  return mine.spikes
    .filter((s) => s.goldZ >= cfg.minZ && s.gold >= cfg.minGold)
    .sort((a, b) => b.goldZ - a.goldZ)
    .slice(0, cfg.max)
    .map((s) => ({ kind: s.kind, at: s.at, minute: s.minute, gold: s.gold, z: s.goldZ, games: s.n, itemId: s.kind === "item" ? (core[s.at - 1] ?? null) : null }))
    .sort((a, b) => a.minute - b.minute);
}

/** A spike as a reason (`spike.<who>.item` with the item, `.slot` without one, or `.level`); `who` picks the wording: your pick, your lane opponent, or a champion you learn. */
export function spikeReason(s: PowerSpike, who: "you" | "enemy" | "learn", champion: ChampionId): Reason {
  const minute = Math.round(s.minute);
  if (s.kind === "level") return { id: `spike.${who}.level`, slots: { champion, level: s.at, minute } };
  return s.itemId !== null
    ? { id: `spike.${who}.item`, slots: { champion, item: s.itemId, slot: s.at, minute } }
    : { id: `spike.${who}.slot`, slots: { champion, slot: s.at, minute } };
}

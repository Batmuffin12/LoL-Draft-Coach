import type { ChampionId, Position, UserMatch } from "@ldc/shared";
import type { EngineConfig } from "./config";
import { readMetric } from "./playstyle";

export type GrowthConfig = EngineConfig["growth"];
type PlaystyleConfig = EngineConfig["playstyle"];

/** A band reference for one metric: evenly spaced quantiles (min … max) and, when measured, its importance. */
export interface GrowthReference {
  n: number;
  quantiles: number[];
  importance?: number;
}

/**
 * How strongly a metric separates wins from losses: the win rate of the games above the median
 * minus the games below it (a simple measured number; negative when more is worse). Games equal
 * to the median go to whichever side keeps the halves most even, never split by input order, so
 * whole-number metrics with many ties (deaths, plates) are measured fairly.
 */
export function metricImportance(samples: { value: number; win: boolean }[]): number {
  if (samples.length < 2) return 0;
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!.value;
  const rate = (xs: typeof sorted) => xs.filter((x) => x.win).length / xs.length;
  const splits = [
    [sorted.filter((x) => x.value > median), sorted.filter((x) => x.value <= median)],
    [sorted.filter((x) => x.value >= median), sorted.filter((x) => x.value < median)],
  ].filter(([hi, lo]) => hi!.length && lo!.length);
  if (!splits.length) return 0;
  const [hi, lo] = splits.reduce((a, b) => (Math.min(a[0]!.length, a[1]!.length) >= Math.min(b[0]!.length, b[1]!.length) ? a : b));
  return rate(hi!) - rate(lo!);
}

export interface FocusMetric {
  metric: string;
  lowerIsBetter: boolean;
  /** Your mean over your last `checkGames` games. */
  you: number;
  /** Your mean over the games before those: where the target was set from. */
  baseline: number;
  /** A step from your baseline toward typical (`targetStep`). */
  target: number;
  /** The median in your role (and rank, with the band's data). */
  typical: number;
  importance: number;
  impact: number;
  /** Your last games on it, oldest first: whether each reached the target. */
  recent: boolean[];
  /** Your recent mean has reached the target. */
  done: boolean;
}

export interface GrowthFocus {
  role: Position;
  /** Your main champion in the role, when you have enough games on it (else the whole role). */
  championId: ChampionId | null;
  /** The one thing to work on now (null: every candidate is met or none matters). */
  focus: FocusMetric | null;
  /** Targets reached, most important first. */
  met: FocusMetric[];
  /** Where the typical values and importance came from. */
  reference: "band" | "games";
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const at = (q: number[], f: number) => q[Math.round(f * (q.length - 1))]!;

/**
 * The growth focus (DESIGN §7): on your main champion and role, the metric where you are
 * furthest below typical, scaled by how much it separates wins from losses in that role:
 * impact = max(0, typical − you) / spread × importance. Pure; stateless: the target is set
 * from your games before the last `checkGames`, and those last games are the progress.
 */
export function pickFocus(
  matches: UserMatch[],
  role: Position,
  cfg: { growth: GrowthConfig; playstyle: PlaystyleConfig },
  bandReferences?: Record<string, GrowthReference>,
): GrowthFocus | null {
  const g = cfg.growth;
  const inRole = [...matches].sort((a, b) => b.match.endedAt - a.match.endedAt).filter((m) => m.match.participants[m.me]?.position === role).slice(0, g.window);
  if (!role || inRole.length < g.minGames) return null;

  const counts = new Map<ChampionId, number>();
  for (const m of inRole) {
    const id = m.match.participants[m.me]!.championId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const [mainId, mainGames] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  const championId = mainGames >= g.minGames ? mainId : null;
  const games = championId === null ? inRole : inRole.filter((m) => m.match.participants[m.me]!.championId === championId);
  const recentGames = games.slice(0, g.checkGames);
  const older = games.slice(g.checkGames);
  const baseGames = older.length >= Math.ceil(g.checkGames / 2) ? older : games;

  const metrics = [...new Set(Object.values(cfg.playstyle.axes).flatMap((a) => a.metrics))];
  const useBand = Object.values(bandReferences ?? {}).some((r) => r.importance !== undefined && r.n >= cfg.playstyle.minReferenceSamples);
  const candidates: FocusMetric[] = [];
  for (const raw of metrics) {
    const lowerIsBetter = raw.startsWith("-");
    const metric = lowerIsBetter ? raw.slice(1) : raw;
    const s = lowerIsBetter ? -1 : 1;

    // Typical, spread and importance: the band's, else the other players in your role in your own games.
    let typical: number;
    let spread: number;
    let importance: number;
    const band = bandReferences?.[metric];
    if (useBand) {
      if (!band || band.importance === undefined || band.n < cfg.playstyle.minReferenceSamples || band.quantiles.length < 3) continue;
      typical = at(band.quantiles, 0.5);
      spread = at(band.quantiles, 0.75) - at(band.quantiles, 0.25);
      importance = band.importance;
    } else {
      const others = matches.flatMap((m) =>
        m.match.participants
          .filter((p, i) => i !== m.me && p.position === role)
          .flatMap((p) => {
            const value = readMetric(p, m.match.durationSec, metric);
            return value === null ? [] : [{ value, win: p.win }];
          }),
      );
      if (others.length < cfg.playstyle.minReferenceSamples) continue;
      const sorted = others.map((o) => o.value).sort((a, b) => a - b);
      typical = at(sorted, 0.5);
      spread = at(sorted, 0.75) - at(sorted, 0.25);
      importance = metricImportance(others);
    }
    if (!(spread > 0) || s * importance < g.minImportance) continue;

    const valuesOf = (ms: UserMatch[]) => ms.flatMap((m) => {
      const v = readMetric(m.match.participants[m.me]!, m.match.durationSec, metric);
      return v === null ? [] : [v];
    });
    const base = valuesOf(baseGames);
    const recentValues = valuesOf(recentGames);
    if (base.length < Math.ceil(g.minGames / 2) || !recentValues.length) continue;
    const baseline = mean(base);
    const gap = s * (typical - baseline);
    if (gap <= 0) continue;
    const target = baseline + g.targetStep * (typical - baseline);
    const you = mean(recentValues);
    candidates.push({
      metric,
      lowerIsBetter,
      you,
      baseline,
      target,
      typical,
      importance,
      impact: (gap / spread) * s * importance,
      recent: [...recentValues].reverse().map((v) => s * (v - target) >= 0),
      done: s * (you - target) >= 0,
    });
  }
  candidates.sort((a, b) => b.impact - a.impact);
  return { role, championId, focus: candidates.find((c) => !c.done) ?? null, met: candidates.filter((c) => c.done), reference: useBand ? "band" : "games" };
}

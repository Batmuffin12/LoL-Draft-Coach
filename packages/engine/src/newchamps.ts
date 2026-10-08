import type { ChampionId, ChampionInfo, Position, Reason, UserMatch } from "@ldc/shared";
import type { EngineConfig } from "./config";
import type { MetaIndex } from "./meta-index";
import type { LearningProgress, PoolNeed, RolePool } from "./pool";
import type { ChampionAttributes, MasteryEntry } from "./types";
import { readMetric } from "./playstyle";
import { deltaWin } from "./rating";
import { powerSpikes, type PowerSpike } from "./spikes";

export type NewChampsConfig = EngineConfig["newChamps"];

export interface NewChampion {
  championId: ChampionId;
  /** The total score (weights from config) and its parts, for tuning. */
  fit: number;
  parts: { similarity: number; gap: number; meta: number; ease: number; overlap: number };
  /** The main or comfortable champion of yours it's most like (null without one to compare). */
  like: ChampionId | null;
  /** Its win rate in your role and rank (smoothed) and the games behind it. */
  winRate: number;
  games: number;
  /** 1 easy, 2 medium, 3 hard (Riot's difficulty rating, cut points in config). */
  ease: 1 | 2 | 3;
  /** Null when ownership is unknown (no client). */
  owned: boolean | null;
  /** Pool gaps it covers. */
  covers: PoolNeed[];
  reasons: Reason[];
}

export interface NewChampAdvice {
  role: Position;
  picks: NewChampion[];
  /**
   * A champion you're already learning in this role. One new champion per role at a time:
   * the picks are then "after it", for when it has settled.
   */
  learning: { championId: ChampionId; progress: LearningProgress | null } | null;
}

export interface NewChampInput {
  role: Position;
  pool: RolePool;
  /** Your games per champion in this role. */
  playedInRole: Map<ChampionId, number>;
  masteries: MasteryEntry[];
  index: MetaIndex;
  /** Data Dragon ratings and tags per champion. */
  champions: (id: ChampionId) => Pick<ChampionInfo, "info" | "tags"> | undefined;
  attributes: Map<ChampionId, ChampionAttributes>;
  /** Champions you own (from the client), or null when unknown. */
  owned: Set<ChampionId> | null;
  config: NewChampsConfig;
  coverage: EngineConfig["pool"]["coverage"];
}

/**
 * A champion as numbers for similarity: Riot's ratings (0–1), class tags one-hot, and
 * measured damage type, frontline and engage when known. Tags come from Data Dragon.
 */
function traits(id: ChampionId, input: NewChampInput, tagNames: string[]): number[] | null {
  const c = input.champions(id);
  if (!c?.info) return null;
  const a = input.attributes.get(id);
  const tags = new Set(c.tags ?? []);
  return [
    c.info.attack / 10,
    c.info.defense / 10,
    c.info.magic / 10,
    // Tags count half as much as the ratings: a second tag shouldn't outweigh how the champion plays.
    ...tagNames.map((t) => (tags.has(t) ? 0.5 : 0)),
    a ? a.magicShare : c.info.magic / 10,
    a ? a.frontline : c.info.defense / 10,
    a ? a.engage : 0.5,
  ];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

const covers = (a: ChampionAttributes | undefined, need: PoolNeed, cov: NewChampInput["coverage"]) =>
  !!a &&
  (need === "magic" ? a.magicShare >= cov.damageShare : need === "physical" ? a.physicalShare >= cov.damageShare : need === "frontline" ? a.frontline >= cov.frontline : a.engage >= cov.engage);

/**
 * New champions to learn for a role (DESIGN §6): meta in your role and rank, not in your pool;
 * scored by how much they play like what you're good at, a gap they fill, their strength in
 * your rank and how easy they are, minus being a clone of your main. Pure.
 */
export function recommendNewChampions(input: NewChampInput): NewChampAdvice {
  const { role, pool, index, config: cfg } = input;
  const current = pool.champions.find((c) => c.tier === "learning");
  const learning = current ? { championId: current.championId, progress: current.progress ?? null } : null;

  const mastery = new Map(input.masteries.map((m) => [m.championId, m.points]));
  const core = pool.champions.filter((c) => c.tier === "main" || c.tier === "comfortable");
  const roleStats = index.championsIn(role);
  const tagNames = [...new Set(roleStats.flatMap((s) => input.champions(s.championId)?.tags ?? []))].sort();
  // Traits centred on the role's average champion, so similarity says "like this one, unlike the rest".
  const raw = roleStats.map((s) => traits(s.championId, input, tagNames)).filter((t): t is number[] => t !== null);
  const center = raw.length ? raw[0]!.map((_, i) => raw.reduce((acc, t) => acc + t[i]!, 0) / raw.length) : null;
  const centred = (id: ChampionId) => {
    const t = traits(id, input, tagNames);
    return t && center ? t.map((x, i) => x - center[i]!) : null;
  };

  // Your taste in the role: the comfort-weighted mean of your main and comfortable champions' traits.
  const coreTraits = core.flatMap((c) => {
    const t = centred(c.championId);
    return t ? [{ id: c.championId, t, w: c.comfort }] : [];
  });
  const wSum = coreTraits.reduce((s, c) => s + c.w, 0);
  const taste = coreTraits.length && wSum > 0 ? coreTraits[0]!.t.map((_, i) => coreTraits.reduce((s, c) => s + c.w * c.t[i]!, 0) / wSum) : null;

  const holes = pool.holes.map((h) => h.need);
  const total = roleStats.reduce((s, c) => s + c.games, 0);
  const meanWin = total > 0 ? roleStats.reduce((s, c) => s + c.wins, 0) / total : 0.5;
  const out: NewChampion[] = [];
  for (const s of roleStats) {
    const id = s.championId;
    if (s.n < cfg.minGames || index.pickRate(id, role) < cfg.minPickRate) continue;
    if ((input.playedInRole.get(id) ?? 0) >= cfg.maxGames || (mastery.get(id) ?? 0) >= cfg.maxMastery) continue;
    if (core.some((c) => c.championId === id) || id === learning?.championId) continue;
    const t = centred(id);
    const info = input.champions(id)?.info;
    if (!t || !info) continue;

    const similarity = taste ? cosine(t, taste) : 0;
    let like: ChampionId | null = null;
    let overlapCos = 0;
    for (const c of coreTraits) {
      const cos = cosine(t, c.t);
      if (cos > overlapCos) {
        overlapCos = cos;
        like = c.id;
      }
    }
    const filled = holes.filter((n) => covers(input.attributes.get(id), n, input.coverage));
    // Smoothed toward the role's average, as everywhere else.
    const winRate = (s.wins + cfg.priorGames * meanWin) / (s.games + cfg.priorGames);
    const meta = Math.max(-1, Math.min(1, (winRate - meanWin) / cfg.metaScale));
    const ease = 1 - info.difficulty / 10;
    const overlap = Math.max(0, overlapCos - cfg.cloneCut) / Math.max(1e-9, 1 - cfg.cloneCut);
    const parts = { similarity, gap: filled.length ? 1 : 0, meta, ease, overlap };
    const w = cfg.weights;
    const fit = w.similarity * similarity + w.gap * parts.gap + w.meta * meta + w.ease * ease - w.overlap * overlap;
    const easeLevel: 1 | 2 | 3 = info.difficulty <= cfg.easyMax ? 1 : info.difficulty >= cfg.hardMin ? 3 : 2;

    const reasons: Reason[] = [];
    if (like !== null && overlapCos >= cfg.likeMin) reasons.push({ id: "newchamp.like", slots: { like } });
    for (const need of filled) reasons.push({ id: `newchamp.gap.${need}`, slots: { role } });
    if (meta > 0) reasons.push({ id: "newchamp.meta", slots: { winRate, games: s.n } });
    reasons.push({ id: `newchamp.ease.${easeLevel === 1 ? "easy" : easeLevel === 3 ? "hard" : "medium"}`, slots: {} });
    const owned = input.owned ? input.owned.has(id) : null;
    if (owned === false) reasons.push({ id: "newchamp.notOwned", slots: {} });
    out.push({ championId: id, fit, parts, like: overlapCos >= cfg.likeMin ? like : null, winRate, games: s.n, ease: easeLevel, owned, covers: filled, reasons });
  }
  out.sort((a, b) => b.fit - a.fit || a.championId - b.championId);
  return { role, picks: out.slice(0, cfg.topN), learning };
}

/** A lane opponent of the champion you're learning, measured in your rank. */
export interface LearningMatchup {
  championId: ChampionId;
  /** Win-chance difference over what both champions usually win (deltaWin), and the games behind it. */
  deltaWin: number;
  games: number;
}

/**
 * Where you are with a new champion, by your games on it in the role: before the first game
 * (practise its kit), the first games (learn what each spell does, ignore the result), then
 * building up (one measured thing per game).
 */
export type LearningStage = "practice" | "first" | "building";

/** The one thing to watch in your next game on the champion. */
export interface LearningFocus {
  metric: string;
  lowerIsBetter: boolean;
  /**
   * Why this one: it dropped on the champion against your other champions in the role ("drop"),
   * it's your growth goal in the role ("goal"), or it's the role's basic while learning ("basic").
   */
  source: "drop" | "goal" | "basic";
  /** Your mean on the champion (null before your first game on it). */
  value: number | null;
  /** Your mean on your other champions in the role (null with too few games). */
  usual: number | null;
  target: number;
  /** Your last games on it, oldest first: whether each reached the target. */
  recent: boolean[];
}

export interface LearningPlan {
  stage: LearningStage;
  /** 1 easy, 2 medium, 3 hard (null without Riot's rating). */
  ease: 1 | 2 | 3 | null;
  /** About how many games players keep improving fast on a new champion this hard (config). */
  settleGames: number;
  /** Your games on it in the role. */
  record: { games: number; wins: number };
  focus: LearningFocus | null;
  /** Its class (Data Dragon's first tag), for its job in a game. */
  job: string | null;
  /** Opponents in the same role it does best and worst into (beyond `evenWin`), at most `count` each. */
  good: LearningMatchup[];
  hard: LearningMatchup[];
  /** Whether it wins more of long or short games (beyond `scalingGap`), when its power curve is measured. */
  curve: { late: boolean; early: number; lateRate: number } | null;
  /** Its measured power spikes in the role (empty until the snapshot's spikes pass their check). */
  spikes: PowerSpike[];
}

export interface LearningPlanInput {
  championId: ChampionId;
  role: Position;
  matches: UserMatch[];
  index: MetaIndex | null;
  /** Data Dragon's rating and tags for it. */
  champion: Pick<ChampionInfo, "info" | "tags"> | undefined;
  /** Your growth goal, used when it's in this role. */
  goal: { role: Position; metric: string; lowerIsBetter: boolean; target: number } | null;
  config: Pick<EngineConfig, "rating" | "plan" | "growth" | "newChamps" | "spikes">;
  /** Opponents listed per side. */
  count?: number;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = avg(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const parseMetric = (raw: string) => (raw.startsWith("-") ? { metric: raw.slice(1), lowerIsBetter: true } : { metric: raw, lowerIsBetter: false });

/**
 * How to learn a champion (coaching practice, research/LEARNING.md): a stage from your games
 * on it; one thing to watch per game (where you dropped on it against your usual in the role,
 * else your growth goal there, else the role's basic held at your usual); its job from its
 * class; the lane opponents to start into and to avoid while learning; when it's strong; and
 * how many games to give it before judging it. Champions and aggregates only. Pure.
 */
export function learningPlan(input: LearningPlanInput): LearningPlan {
  const { championId: id, role, index, config } = input;
  const nc = config.newChamps;
  const learn = nc.learn;
  const count = input.count ?? 2;
  const inRole = input.matches.filter((m) => m.match.participants[m.me]?.position === role).sort((a, b) => a.match.endedAt - b.match.endedAt);
  const mine = inRole.filter((m) => m.match.participants[m.me]!.championId === id);
  const usualGames = inRole.filter((m) => m.match.participants[m.me]!.championId !== id).slice(-config.growth.window);
  const record = { games: mine.length, wins: mine.filter((m) => m.match.participants[m.me]!.win).length };
  const stage: LearningStage = mine.length === 0 ? "practice" : mine.length < learn.firstGames ? "first" : "building";

  const difficulty = input.champion?.info?.difficulty;
  const ease = difficulty === undefined ? null : difficulty <= nc.easyMax ? 1 : difficulty >= nc.hardMin ? 3 : 2;
  const settleGames = learn.settleGames[ease === 1 ? "easy" : ease === 3 ? "hard" : "medium"];

  const read = (games: UserMatch[], metric: string) =>
    games.flatMap((m) => {
      const v = readMetric(m.match.participants[m.me]!, m.match.durationSec, metric);
      return v === null ? [] : [v];
    });
  const focusOn = (metric: string, lowerIsBetter: boolean, source: LearningFocus["source"], target: number | null): LearningFocus | null => {
    const values = read(mine, metric);
    const usual = read(usualGames, metric);
    const usualMean = usual.length >= learn.usualMinGames ? avg(usual) : null;
    const t = target ?? usualMean;
    if (t === null) return null;
    const met = (v: number) => (lowerIsBetter ? v <= t : v >= t);
    return { metric, lowerIsBetter, source, value: values.length ? avg(values) : null, usual: usualMean, target: t, recent: values.slice(-config.growth.checkGames).map(met) };
  };

  // What the champion costs you while learning it: the growth metric furthest below your usual, in spreads of your usual.
  let focus: LearningFocus | null = null;
  if (mine.length >= learn.focusMinGames) {
    let best = learn.dropMin;
    for (const raw of config.growth.metrics ?? []) {
      const { metric, lowerIsBetter } = parseMetric(raw);
      const values = read(mine, metric);
      const usual = read(usualGames, metric);
      if (values.length < learn.focusMinGames || usual.length < learn.usualMinGames) continue;
      const spread = sd(usual);
      if (spread <= 0) continue;
      const drop = (lowerIsBetter ? avg(values) - avg(usual) : avg(usual) - avg(values)) / spread;
      if (drop >= best) {
        best = drop;
        focus = focusOn(metric, lowerIsBetter, "drop", null);
      }
    }
  }
  const goal = input.goal;
  if (!focus && goal && goal.role === role) focus = focusOn(goal.metric, goal.lowerIsBetter, "goal", goal.target);
  const basic = learn.basics[role];
  if (!focus && basic) {
    const { metric, lowerIsBetter } = parseMetric(basic);
    focus = focusOn(metric, lowerIsBetter, "basic", null);
  }

  const opponents = index
    ? index
        .opponentsOf(id, role)
        .map((o) => {
          const d = index.matchupDelta(id, role, o, role);
          return { championId: o, deltaWin: deltaWin(d.delta), games: d.n };
        })
        .filter((o) => o.games >= config.rating.minGames.pair)
    : [];
  const good = opponents
    .filter((o) => o.deltaWin >= config.plan.evenWin)
    .sort((a, b) => b.deltaWin - a.deltaWin || a.championId - b.championId)
    .slice(0, count);
  const hard = opponents
    .filter((o) => o.deltaWin <= -config.plan.evenWin)
    .sort((a, b) => a.deltaWin - b.deltaWin || a.championId - b.championId)
    .slice(0, count);

  const pc = index?.attributes.get(id)?.powerCurve;
  const minCurve = config.rating.minGames.meta;
  const curve =
    pc && pc.early.games >= minCurve && pc.late.games >= minCurve && Math.abs(pc.late.winRate - pc.early.winRate) >= config.plan.scalingGap
      ? { late: pc.late.winRate > pc.early.winRate, early: pc.early.winRate, lateRate: pc.late.winRate }
      : null;
  const spikes = index ? powerSpikes(index, id, role, config.spikes) : [];
  return { stage, ease, settleGames, record, focus, job: input.champion?.tags?.[0] ?? null, good, hard, curve, spikes };
}

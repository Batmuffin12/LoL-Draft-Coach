import type {
  BanSuggestion,
  ChampionAttributes,
  ChampionId,
  FactorScores,
  PickAdvice,
  PickRecommendation,
  Position,
  RankBandId,
  Reason,
  Term,
  TermName,
} from "@ldc/shared";
import type { RatingConfig } from "./config";
import { placeDraft, type PlacedChampion } from "./draft-roles";
import { reason, type Confidence } from "./explain";
import type { MetaIndex } from "./meta-index";
import { deltaWin, weightedQuantile, winOf } from "./rating";
import { roleFit, usualPick, type RecommendInput } from "./recommend";
import { scoreTeamNeeds, teamProfile } from "./team-needs";
import type { ComfortStats } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface LiveInput extends RecommendInput {
  /** The band's meta snapshot, indexed. */
  index: MetaIndex;
  band: RankBandId;
}

/** A scored candidate with what the explanation needs. */
interface Scored {
  pick: PickRecommendation;
  /** Weighted rating per term. */
  parts: Record<TermName, number>;
  /** Champions behind the lane and counter reasons. */
  laneEnemy: ChampionId | null;
}

interface DraftContext {
  role: Position | null;
  allies: PlacedChampion[];
  enemies: PlacedChampion[];
  laneEnemy: PlacedChampion | null;
  /** Every enemy has picked (the local player picks last on their side of the draft). */
  lastPick: boolean;
  attributes: Map<ChampionId, ChampionAttributes>;
  unavailable: Set<ChampionId>;
}

function context(input: LiveInput): DraftContext {
  const { draft, index, role } = input;
  const { allies, enemies } = placeDraft(draft, index, role);
  // Measured attributes from the band (big sample), the player's own games as the fallback.
  const attributes = new Map([...input.attributes, ...index.attributes]);
  return {
    role,
    allies,
    enemies,
    laneEnemy: role ? (enemies.find((e) => e.role === role) ?? null) : null,
    lastPick: draft.theirTeam.length > 0 && draft.theirTeam.every((s) => s.championId > 0),
    attributes,
    unavailable: input.unavailable,
  };
}

/** Converts a weighted rating to the 0..1 bar the panel shows (0.5 = no effect). */
const bar = (points: number, cfg: RatingConfig) => clamp01(0.5 + deltaWin(points) / (2 * cfg.explain.barScaleWin));

function personalRating(c: ComfortStats | undefined, cfg: RatingConfig): number {
  const p = cfg.personal;
  if (!c || (c.games === 0 && c.masteryPoints === 0)) return -p.learningPenalty;
  return Math.max(-p.learningPenalty, p.comfortScale * (Math.min(c.score, p.fullComfort) - p.neutralComfort));
}

/** Comfort reasons (the player's own record), as in engine v1. */
function comfortReasons(c: ComfortStats | undefined, role: Position | null): Reason[] {
  if (!c || (c.games === 0 && c.masteryPoints === 0)) return [];
  const out: Reason[] = [];
  if (role && c.gamesInRole && c.winRateInRole !== null) {
    out.push(
      c.games > c.gamesInRole
        ? reason("comfort.roleWithAll", { games: c.gamesInRole, role, winRate: c.winRateInRole, allGames: c.games })
        : reason("comfort.role", { games: c.gamesInRole, role, winRate: c.winRateInRole }),
    );
  } else if (c.games > 0 && c.winRate !== null) {
    out.push(reason(role ? "comfort.otherRoles" : "comfort.any", { games: c.games, winRate: c.winRate }));
  }
  if (c.masteryLevel !== null) {
    const kPoints = Math.round(c.masteryPoints / 1000);
    out.push(c.grades.length ? reason("mastery.grades", { level: c.masteryLevel, kPoints, grades: c.grades.join(" ") }) : reason("mastery", { level: c.masteryLevel, kPoints }));
  }
  return out;
}

/** "Trending in jungle: picked in 9% of games, up from 4%" when the band flags the champion-role. */
function trendReason(index: MetaIndex, id: ChampionId, role: Position): Reason | null {
  const t = index.trend(id, role);
  if (!t) return null;
  if (t.rising === "both") {
    return reason("trend.both", { role, pickRecent: t.pickRate.recent, pickBefore: t.pickRate.before, winRecent: t.winRate.recent, winBefore: t.winRate.before });
  }
  return t.rising === "pick"
    ? reason("trend.pick", { role, recent: t.pickRate.recent, before: t.pickRate.before })
    : reason("trend.win", { role, recent: t.winRate.recent, before: t.winRate.before, games: t.games.recent });
}

/** A reason with its importance (absolute change in win chance) and sign. */
interface Weighted {
  r: Reason;
  weight: number;
  positive: boolean;
}

function scoreCandidate(id: ChampionId, comfort: ComfortStats | undefined, offMeta: boolean, input: LiveInput, ctx: DraftContext): Scored {
  const { index, config } = input;
  const cfg = config.rating;
  const w = cfg.bands[String(input.band)] ?? cfg.bands[Object.keys(cfg.bands)[0]!]!;
  const role = ctx.role ?? index.mainRole(id) ?? "";
  const notes: Weighted[] = [];
  const note = (r: Reason, points: number) => {
    const d = deltaWin(points);
    if (Math.abs(d) >= cfg.explain.minDeltaWin) notes.push({ r, weight: Math.abs(d), positive: d > 0 });
  };

  // Meta: the champion's strength in this role and band.
  const metaStat = index.champion(id, role);
  // An off-meta pick (the player's habit, not the champion's usual role) starts behind.
  const meta = w.meta * index.metaRating(id, role) - (offMeta ? cfg.offMetaPenalty : 0);
  if (metaStat.n >= cfg.minGames.meta) {
    note(reason(meta >= 0 ? "meta.strong" : "meta.weak", { winRate: metaStat.wins / metaStat.games, games: metaStat.n, role }), meta);
  }
  // Rising in the band lately: information only (no evidence yet that trends add to the win chance).
  const rising = trendReason(index, id, role);
  if (rising) notes.push({ r: rising, weight: cfg.explain.minDeltaWin, positive: true });

  // Lane: the revealed opponent, or (blind) the likely ones.
  let lane = 0;
  let laneGames = 0;
  if (ctx.laneEnemy) {
    const d = index.matchupDelta(id, role, ctx.laneEnemy.championId, ctx.laneEnemy.role);
    lane = w.lane * d.delta;
    laneGames = d.n;
    if (d.n >= cfg.minGames.pair) note(reason(lane >= 0 ? "lane.good" : "lane.bad", { enemy: ctx.laneEnemy.championId, delta: deltaWin(lane), games: d.n }), lane);
  } else if (ctx.role) {
    const opponents = index
      .championsIn(role)
      .filter((o) => o.championId !== id && !ctx.unavailable.has(o.championId))
      .slice(0, cfg.blind.maxOpponents)
      .map((o) => ({ o, d: index.matchupDelta(id, role, o.championId, role) }));
    const total = opponents.reduce((s, x) => s + x.o.games, 0);
    if (total > 0) {
      const expected = opponents.reduce((s, x) => s + x.o.games * x.d.delta, 0) / total;
      const tail = weightedQuantile(opponents.map((x) => ({ value: x.d.delta, weight: x.o.games })), cfg.blind.riskQuantile);
      lane = w.lane * (expected - cfg.blind.riskAversion * Math.max(0, -tail));
      laneGames = opponents.reduce((s, x) => s + x.d.n, 0);
      const known = opponents.filter((x) => x.d.n >= cfg.minGames.pair);
      if (known.length) {
        const worst = known.reduce((a, b) => (b.d.delta < a.d.delta ? b : a));
        if (-tail <= cfg.blind.safeMaxLoss) notes.push({ r: reason("blind.safe", { role, worst: deltaWin(worst.d.delta) }), weight: cfg.explain.minDeltaWin, positive: true });
        else note(reason("blind.risky", { enemy: worst.o.championId, delta: deltaWin(worst.d.delta), games: worst.d.n }), Math.min(lane, worst.d.delta));
      }
    }
  }

  // Counter: the other revealed enemies, at reduced weight (more when picking last).
  let counter = 0;
  let counterGames = 0;
  const boost = ctx.lastPick ? cfg.lastPickCounterBoost : 1;
  for (const e of ctx.enemies) {
    if (e === ctx.laneEnemy) continue;
    const d = index.matchupDelta(id, role, e.championId, e.role);
    const points = w.counter * cfg.counterWeight * boost * d.delta;
    counter += points;
    counterGames += d.n;
    if (d.n >= cfg.minGames.pair) note(reason(points >= 0 ? "counter.good" : "counter.bad", { enemy: e.championId, delta: deltaWin(points), games: d.n }), points);
  }

  // Synergy: with the allies already picked.
  let synergy = 0;
  let synergyGames = 0;
  for (const a of ctx.allies) {
    const d = index.duoDelta(id, role, a.championId, a.role);
    const points = w.synergy * cfg.synergyWeight * d.delta;
    synergy += points;
    synergyGames += d.n;
    if (d.n >= cfg.minGames.pair && points > 0) note(reason("synergy.good", { ally: a.championId, delta: deltaWin(points), games: d.n }), points);
  }

  // Team needs: what the team lacks (damage type, frontline, engage), from measured attributes.
  const teamScore = scoreTeamNeeds(ctx.attributes.get(id), teamProfile(ctx.allies.map((a) => a.championId), ctx.attributes), config.teamNeeds);
  const team = w.team * ((teamScore.score ?? 0.5) - 0.5) * cfg.teamRatingScale;
  for (const r of teamScore.reasons) note(r, team);

  // Personal: the player's comfort, or the cost of learning a new champion.
  const personal = w.personal * personalRating(comfort, cfg);
  const unplayed = !comfort || (comfort.games === 0 && comfort.masteryPoints === 0);
  if (unplayed) note(reason("personal.new", {}), personal);
  else for (const r of comfortReasons(comfort, input.role)) notes.push({ r, weight: Math.abs(deltaWin(personal)), positive: personal >= 0 });
  if (offMeta && input.role) {
    const listed = input.intendedPositions.get(id);
    notes.push({ r: listed?.length ? reason("offMeta.usual", { role: input.role, usual: listed.join(" / ") }) : reason("offMeta", { role: input.role }), weight: 0, positive: false });
  }

  const parts: Record<TermName, number> = { meta, lane, counter, synergy, team, personal };
  const total = meta + lane + counter + synergy + team + personal;
  const expectedWin = winOf(total);
  const terms: Term[] = (
    [
      ["meta", meta, metaStat.n],
      ["lane", lane, laneGames],
      ["counter", counter, counterGames],
      ["synergy", synergy, synergyGames],
      ["team", team, 0],
      ["personal", personal, comfort?.games ?? 0],
    ] as const
  ).map(([name, points, games]) => ({ name, rating: points, deltaWin: deltaWin(points), games }));
  const factors: FactorScores = {
    comfort: bar(personal, cfg),
    teamNeeds: teamScore.score === null ? null : bar(team, cfg),
    laneMatchup: ctx.laneEnemy || ctx.role ? bar(lane, cfg) : null,
    counterValue: ctx.enemies.length > (ctx.laneEnemy ? 1 : 0) ? bar(counter + synergy, cfg) : null,
    metaStrength: metaStat.n > 0 ? bar(meta, cfg) : null,
  };

  // Strongest supporting reasons first, then the single biggest caveat.
  const positives = notes.filter((n) => n.positive).sort((a, b) => b.weight - a.weight);
  const caveat = notes.filter((n) => !n.positive).sort((a, b) => b.weight - a.weight)[0];
  const max = cfg.explain.maxReasons;
  const reasons = [...positives.slice(0, caveat ? max - 1 : max), ...(caveat ? [caveat] : [])].map((n) => n.r);

  return {
    pick: { championId: id, score: expectedWin, expectedWin, terms, factors, reasons, offMeta },
    parts,
    laneEnemy: ctx.laneEnemy?.championId ?? null,
  };
}

/**
 * Role fit with the band's data too: a champion is meta in a role when enough of its
 * collected games (at least roles.minRoleSamples) are played there, even if Riot's
 * recommended positions or the measured attributes don't say so.
 */
function liveRoleFit(id: ChampionId, comfort: ComfortStats, input: LiveInput, ctx: DraftContext): ReturnType<typeof roleFit> {
  const fit = roleFit(id, comfort, ctx.role, input.intendedPositions, ctx.attributes, input.config.roles);
  if (fit === "meta" || !ctx.role) return fit;
  const { roles } = input.config;
  const share = input.index.roleDistribution(id).get(ctx.role) ?? 0;
  return input.index.champion(id, ctx.role).n >= roles.minRoleSamples && share >= roles.minRoleShare ? "meta" : fit;
}

/** Candidates: the player's pool that fits the role, plus (optionally) pickable champions that are meta there. */
function candidates(input: LiveInput, ctx: DraftContext): { id: ChampionId; comfort: ComfortStats | undefined; offMeta: boolean }[] {
  const { comfort, config, index } = input;
  const pickable = new Set(input.pickable);
  const out = new Map<ChampionId, { id: ChampionId; comfort: ComfortStats | undefined; offMeta: boolean }>();
  for (const [id, c] of comfort) {
    if (ctx.unavailable.has(id) || (pickable.size && !pickable.has(id))) continue;
    const fit = liveRoleFit(id, c, input, ctx);
    if (fit) out.set(id, { id, comfort: c, offMeta: fit === "offMeta" });
  }
  if (config.rating.personal.includeUnplayed && ctx.role && pickable.size) {
    for (const s of index.championsIn(ctx.role)) {
      if (out.has(s.championId) || ctx.unavailable.has(s.championId) || !pickable.has(s.championId)) continue;
      if (s.n < config.rating.minGames.meta) continue;
      const share = index.roleDistribution(s.championId).get(ctx.role) ?? 0;
      if (share < config.roles.minRoleShare && !input.intendedPositions.get(s.championId)?.includes(ctx.role)) continue;
      out.set(s.championId, { id: s.championId, comfort: undefined, offMeta: false });
    }
  }
  return [...out.values()];
}

const byScore = (a: Scored, b: Scored) => b.pick.score - a.pick.score || a.pick.championId - b.pick.championId;

function scoreAll(input: LiveInput): { ctx: DraftContext; all: Scored[] } {
  const ctx = context(input);
  const all = candidates(input, ctx).map((c) => scoreCandidate(c.id, c.comfort, c.offMeta, input, ctx));
  return { ctx, all: all.sort(byScore) };
}

/**
 * Engine v2: ranks picks by predicted win chance in this draft, from the band's live meta
 * (strength, lane matchup or blind-pick safety, counters, synergy), the team's needs and the
 * player's own comfort. Every number in a reason comes from these terms. Pure: no I/O.
 */
export function adviseLivePicks(input: LiveInput): PickAdvice {
  const { all } = scoreAll(input);
  const cfg = input.config.rating;
  const picks = all.slice(0, input.config.topN).map((s) => s.pick);
  const top = all[0];
  if (!top) return { picks, whyNot: null, confidence: null };

  // Thin when the meta has too few games of the champion in this role; else clear or close by the predicted gap.
  const metaGames = top.pick.terms?.find((t) => t.name === "meta")?.games ?? 0;
  const runnerUp = all[1];
  const confidence: Confidence =
    metaGames < cfg.minGames.meta ? "thin" : !runnerUp || top.pick.score - runnerUp.pick.score >= cfg.explain.clearGapWin ? "clear" : "close";

  let whyNot: Reason | null = null;
  const usual = usualPick({ ...input, attributes: new Map([...input.attributes, ...input.index.attributes]) });
  if (usual && usual.championId !== top.pick.championId) {
    const champion = usual.championId;
    const pickable = new Set(input.pickable);
    const scored = all.find((s) => s.pick.championId === champion);
    if (input.unavailable.has(champion)) whyNot = reason("whyNot.unavailable", { champion });
    else if (pickable.size && !pickable.has(champion)) whyNot = reason("whyNot.notPickable", { champion });
    else if (scored?.pick.offMeta && !top.pick.offMeta && input.role) whyNot = reason("whyNot.offMeta", { champion, role: input.role });
    else if (scored) {
      // The term where #1 gains most over the usual pick.
      let best: TermName | null = null;
      let gain = 0;
      for (const name of Object.keys(top.parts) as TermName[]) {
        const g = top.parts[name] - scored.parts[name];
        if (g > gain) [best, gain] = [name, g];
      }
      if (best && deltaWin(gain) >= cfg.explain.minDeltaWin) {
        whyNot = reason(`whyNot.${best}`, { champion, delta: deltaWin(gain), ...(best === "lane" && top.laneEnemy ? { enemy: top.laneEnemy } : {}) });
      }
    }
  }
  return { picks, whyNot, confidence };
}

/**
 * How a champion the player has already locked in looks in this draft: predicted win
 * chance, terms and reasons, scored like a suggestion. The champion itself is not treated
 * as taken (it's the player's own pick).
 */
export function assessPick(input: LiveInput, championId: ChampionId): PickRecommendation {
  const unavailable = new Set(input.unavailable);
  unavailable.delete(championId);
  const own = { ...input, unavailable };
  const ctx = context(own);
  const comfort = input.comfort.get(championId);
  const fit = comfort ? liveRoleFit(championId, comfort, own, ctx) : "meta";
  return scoreCandidate(championId, comfort, fit === "offMeta", own, ctx).pick;
}

/**
 * Ban suggestions for the ban phase: champions that are picked often in the band and
 * either beat the player's best picks for their role or are simply strong. Champions the
 * player would pick, allies have shown, or that are already gone are never suggested.
 */
export function suggestBans(input: LiveInput): BanSuggestion[] {
  const { index, config } = input;
  const cfg = config.rating;
  const { ctx, all } = scoreAll(input);
  const protect = all.slice(0, cfg.bans.protectPicks);
  const excluded = new Set<ChampionId>([...ctx.unavailable, ...ctx.allies.map((a) => a.championId), ...protect.map((p) => p.pick.championId)]);
  const role = ctx.role;

  const seen = new Set<ChampionId>();
  const out: BanSuggestion[] = [];
  for (const s of index.snapshot.champions) {
    if (seen.has(s.championId) || excluded.has(s.championId)) continue;
    seen.add(s.championId);
    const eRole = index.mainRole(s.championId);
    if (!eRole) continue;
    const pickRate = index.pickRate(s.championId, eRole);
    if (pickRate < cfg.bans.minPickRate) continue;

    const meta = index.metaRating(s.championId, eRole);
    // How much it beats the picks we'd make (lane matchups when it plays our role, else cross-lane at counter weight).
    let beats = 0;
    let games = 0;
    if (protect.length) {
      for (const p of protect) {
        const d = index.matchupDelta(p.pick.championId, role ?? eRole, s.championId, eRole);
        beats += (eRole === role ? 1 : cfg.counterWeight) * d.delta;
        games += d.n;
      }
      beats /= protect.length;
    }
    const threat = pickRate * (Math.max(0, -beats) + cfg.bans.metaWeight * Math.max(0, meta));
    if (threat <= 0) continue;

    const reasons: Reason[] = [];
    if (-beats >= Math.abs(meta) * cfg.bans.metaWeight && games >= cfg.minGames.pair) {
      reasons.push(reason("ban.counters", { picks: protect.length, delta: deltaWin(beats), pickRate }));
    } else if (index.champion(s.championId, eRole).n >= cfg.minGames.meta) {
      const st = index.champion(s.championId, eRole);
      reasons.push(reason("ban.meta", { winRate: st.wins / st.games, pickRate, role: eRole }));
    } else {
      // Too few games to quote a win rate: say what is known.
      reasons.push(reason("ban.popular", { pickRate, role: eRole }));
    }
    const rising = trendReason(index, s.championId, eRole);
    if (rising) reasons.push(rising);
    // How often players in the band ban it, once enough games carried ban data.
    const banned = index.banRate(s.championId);
    if (banned && banned.games >= cfg.minGames.meta) reasons.push(reason("ban.banRate", { banRate: banned.rate }));
    out.push({ championId: s.championId, threat, reasons });
  }
  return out.sort((a, b) => b.threat - a.threat || a.championId - b.championId).slice(0, cfg.bans.topN);
}

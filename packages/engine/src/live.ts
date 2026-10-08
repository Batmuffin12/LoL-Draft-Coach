import { buildLoadout, type Loadout } from "./loadout";
import { mergeBuilds, type PersonalBuild } from "./loadout-sources";
import type { LoadoutConfig } from "./config";
import type {
  BanSuggestion,
  ChampionBuild,
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

/**
 * Why comfort lowers a pick (the personal term is negative): your recent record on it, as a
 * caveat (template ids end in .weak, so the panel shows them in amber).
 */
function comfortCaveat(c: ComfortStats, role: Position | null): Reason {
  if (role) {
    return c.gamesInRole && c.winRateInRole !== null
      ? reason("comfort.role.weak", { games: c.gamesInRole, role, winRate: c.winRateInRole })
      : reason("comfort.none.weak", { role });
  }
  return c.games > 0 && c.winRate !== null ? reason("comfort.any.weak", { games: c.games, winRate: c.winRate }) : reason("comfort.none.any.weak", {});
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
  /** Your own record lowers the pick: always shown, beside the biggest other caveat. */
  own?: boolean;
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
  // Power curve (information only): does it win short games or long ones?
  const curve = ctx.attributes.get(id)?.powerCurve;
  if (curve && curve.early.games >= cfg.minGames.meta && curve.late.games >= cfg.minGames.meta) {
    const gap = curve.late.winRate - curve.early.winRate;
    if (Math.abs(gap) >= cfg.explain.powerCurveGap) {
      const slots = { early: curve.early.winRate, late: curve.late.winRate };
      notes.push({ r: reason(gap > 0 ? "power.late" : "power.early", slots), weight: cfg.explain.minDeltaWin, positive: true });
    }
  }
  // Lane gold at 15 (information only, like the power curve).
  const lane15 = curve?.goldAt15;
  if (lane15 && lane15.games >= cfg.minGames.meta && Math.abs(lane15.diff) >= cfg.explain.laneGoldGap) {
    notes.push({ r: reason(lane15.diff > 0 ? "power.laneAhead" : "power.laneBehind", { gold: Math.abs(lane15.diff), games: lane15.games }), weight: cfg.explain.minDeltaWin, positive: true });
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
  else if (personal >= 0) for (const r of comfortReasons(comfort, input.role)) notes.push({ r, weight: Math.abs(deltaWin(personal)), positive: true });
  // Comfort lowers the pick: say why, so the reasons agree with the sign of the term.
  else notes.push({ r: comfortCaveat(comfort!, input.role), weight: Math.abs(deltaWin(personal)), positive: false, own: true });
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

  // Strongest supporting reasons first, then the single biggest caveat (plus your own record when it lowers the pick).
  const positives = notes.filter((n) => n.positive).sort((a, b) => b.weight - a.weight);
  const biggest = notes.filter((n) => !n.positive && !n.own).sort((a, b) => b.weight - a.weight)[0];
  const caveats = [biggest, notes.find((n) => n.own)].filter((n): n is Weighted => n !== undefined).sort((a, b) => b.weight - a.weight);
  const max = cfg.explain.maxReasons;
  const reasons = [...positives.slice(0, Math.max(0, max - caveats.length)), ...caveats].map((n) => n.r);

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
  // A pick that is new (or weak) for you is never "clear": your experience is the biggest single factor.
  const metaGames = top.pick.terms?.find((t) => t.name === "meta")?.games ?? 0;
  const personal = top.pick.terms?.find((t) => t.name === "personal")?.deltaWin ?? 0;
  const runnerUp = all[1];
  const clearGap = !runnerUp || top.pick.score - runnerUp.pick.score >= cfg.explain.clearGapWin;
  const confidence: Confidence =
    metaGames < cfg.minGames.meta ? "thin" : clearGap && personal >= -cfg.explain.clearMaxPersonalLossWin ? "clear" : "close";

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
/**
 * The loadout for the local player's champion in this draft, from the band's builds:
 * enemies and the lane opponent are placed the same way as for picks. Null without a build.
 */
export function draftLoadout(
  input: LiveInput,
  championId: ChampionId,
  config: LoadoutConfig,
  personal: PersonalBuild | null = null,
  boots: ReadonlySet<number> = new Set(),
  buildsFrom?: (itemId: number) => number[],
): Loadout | null {
  const cuts = input.index.snapshot.traitCuts;
  const all = input.index.buildsOf(championId);
  if (!cuts || (!all.length && !personal)) return null;
  // Your role's build; when the band has none for this role yet, an empty one (the other roles and your own games fill in).
  const role = input.role ?? all[0]?.role ?? "";
  const build =
    all.find((b) => b.role === role) ??
    ({ championId, role, n: 0, timelineN: 0, games: 0, wins: 0, pages: [], spells: [], skills: [], starting: [], core: [], items: [], lifts: [], matchupPages: [] } as ChampionBuild);
  const ctx = context(input);
  return buildLoadout({
    build,
    pooled: mergeBuilds([build, ...all.filter((b) => b !== build)].filter((b) => b.n > 0)),
    personal,
    boots,
    ...(buildsFrom ? { buildsFrom } : {}),
    ...(input.index.snapshot.roleRewards?.[role] ? { roleRewards: input.index.snapshot.roleRewards[role] } : {}),
    ...(input.index.snapshot.itemRoles ? { itemRoles: input.index.snapshot.itemRoles } : {}),
    enemies: ctx.enemies.map((e) => e.championId),
    laneOpponent: ctx.laneEnemy?.championId ?? null,
    attributes: ctx.attributes,
    traitCuts: cuts,
    config,
  });
}

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
 * Extra bans for the champion the player hovers before (or during) bans: what counters it in
 * their lane, without repeating `alreadySuggested`. Only `bans.hoverTopNWhenSuggested` (1) when
 * the hovered champion is already the #1 suggested pick (the main list protects it), else
 * `bans.hoverTopN` (3).
 */
export function suggestHoverBans(input: LiveInput, hovered: ChampionId, alreadySuggested: ChampionId[]): BanSuggestion[] {
  const { bans } = input.config.rating;
  const isTopPick = adviseLivePicks(input).picks[0]?.championId === hovered;
  return suggestBans(input, { protect: [hovered], exclude: alreadySuggested, topN: isTopPick ? bans.hoverTopNWhenSuggested : bans.hoverTopN });
}

export interface BanOptions {
  /** Protect these champions instead of the player's top recommended picks (e.g. the champion they hover). */
  protect?: ChampionId[];
  /** Champions not to suggest (e.g. already in another ban list). */
  exclude?: Iterable<ChampionId>;
  /** How many to return (default: config bans.topN). */
  topN?: number;
}

/**
 * Ban suggestions for the ban phase: champions that are picked often in the band and
 * either beat the player's best picks for their role or are simply strong. Champions the
 * player would pick, allies have shown, or that are already gone are never suggested.
 */
export function suggestBans(input: LiveInput, opts: BanOptions = {}): BanSuggestion[] {
  const { index, config } = input;
  const cfg = config.rating;
  const { ctx, all } = scoreAll(input);
  const recommended = all.slice(0, cfg.bans.protectPicks).map((s) => s.pick.championId);
  const protect = opts.protect ?? recommended;
  // Never suggest banning a champion the player might pick (their recommendations or the protected ones).
  const excluded = new Set<ChampionId>([...ctx.unavailable, ...ctx.allies.map((a) => a.championId), ...recommended, ...protect, ...(opts.exclude ?? [])]);
  const role = ctx.role;

  const seen = new Set<ChampionId>();
  const out: BanSuggestion[] = [];
  for (const s of index.snapshot.champions) {
    if (seen.has(s.championId) || excluded.has(s.championId)) continue;
    seen.add(s.championId);
    const id = s.championId;
    const strength = (r: Position) => cfg.bans.metaWeight * Math.max(0, index.metaRating(id, r));

    // Your lane: how often it's picked in your role × (how badly it beats the picks we'd
    // recommend you + its own strength there). Without a known role, judge it in its main role.
    const laneRole = role ?? index.mainRole(id);
    if (!laneRole) continue;
    const laneShare = index.pickRate(id, laneRole);
    let worst: { pick: ChampionId; delta: number; games: number } | null = null;
    let beats = 0;
    if (laneShare >= cfg.bans.minPickRate && protect.length) {
      for (const pid of protect) {
        const d = index.matchupDelta(pid, laneRole, id, laneRole);
        beats += d.delta;
        if (d.n >= cfg.minGames.pair && (!worst || d.delta < worst.delta)) worst = { pick: pid, delta: d.delta, games: d.n };
      }
      beats /= protect.length;
    }
    const counterThreat = laneShare >= cfg.bans.minPickRate ? laneShare * Math.max(0, -beats) : 0;
    const laneMetaThreat = laneShare >= cfg.bans.minPickRate ? laneShare * strength(laneRole) : 0;

    // Other lanes: only a fraction of their strength (a strong bot laner is your team's problem
    // more than yours). Skipped when your role is unknown (the main role already counted).
    let offRoleThreat = 0;
    let offRole: Position | null = null;
    if (role) {
      for (const r of index.roles) {
        if (r === role) continue;
        const share = index.pickRate(id, r);
        if (share < cfg.bans.minPickRate) continue;
        const t = share * cfg.bans.offRoleWeight * strength(r);
        if (!offRole || t > offRoleThreat) offRole = r;
        offRoleThreat += t;
      }
    }
    const threat = counterThreat + laneMetaThreat + offRoleThreat;
    if (threat <= 0) continue;

    const reasons: Reason[] = [];
    const describeRole = offRoleThreat > counterThreat + laneMetaThreat && offRole ? offRole : laneRole;
    const share = index.pickRate(id, describeRole);
    if (describeRole === laneRole && worst && worst.delta < 0 && counterThreat >= laneMetaThreat) {
      reasons.push(reason("ban.counters", { pick: worst.pick, delta: deltaWin(worst.delta), games: worst.games, pickRate: share, role: laneRole }));
    } else if (index.champion(id, describeRole).n >= cfg.minGames.meta) {
      const st = index.champion(id, describeRole);
      reasons.push(reason("ban.meta", { winRate: st.wins / st.games, pickRate: share, role: describeRole }));
    } else {
      // Too few games to quote a win rate: say what is known.
      reasons.push(reason("ban.popular", { pickRate: share, role: describeRole }));
    }
    const eRole = describeRole;
    const rising = trendReason(index, s.championId, eRole);
    if (rising) reasons.push(rising);
    // How often players in the band ban it, once enough games carried ban data.
    const banned = index.banRate(s.championId);
    if (banned && banned.games >= cfg.minGames.meta) reasons.push(reason("ban.banRate", { banRate: banned.rate }));
    out.push({ championId: s.championId, threat, reasons });
  }
  return out.sort((a, b) => b.threat - a.threat || a.championId - b.championId).slice(0, opts.topN ?? cfg.bans.topN);
}

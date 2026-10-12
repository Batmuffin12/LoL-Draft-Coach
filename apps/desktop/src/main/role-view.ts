import { adviseLivePicks, advisePicks, poolCoverage, renderReason, weightsForBand, type adviseRoles, type ChampionAttributes, type ComfortStats, type EngineConfig, type MetaIndex, type RolePool } from "@ldc/engine";
import type { ChampionId, PickAdvice, Position, RankBandId } from "@ldc/shared";
import { POOL_COLUMNS, type PickView, type PoolNeed, type RoleView, type ViewState } from "../shared/view";
import type { LoadedConfig } from "./config";
import { blindDraft } from "./draft-facts";
import { champView, type ChampionLookup } from "./draft-view";
import { reasonView } from "./reason-view";
import { listText } from "./style-view";

/**
 * The views the coach builds from its role and pick advice (lobby roles and pools, the pick lists of
 * champ select and the queue preview). Pure: everything comes in as arguments.
 */

/**
 * The Pool tab's matrix and next step for one role: which needs each champion in the pool brings
 * (measured attributes only), the gaps (the role's holes), the champion you know that fills the
 * biggest one, what nothing you know covers, and the champions that didn't fit in the matrix.
 */
export function poolAdvice(
  role: Position,
  pool: RolePool | null,
  attributes: Map<ChampionId, ChampionAttributes>,
  coverage: EngineConfig["pool"]["coverage"],
  templates: Record<string, string>,
  lookup: ChampionLookup,
): Pick<RoleView, "coverage" | "nextStep" | "missing" | "noGaps" | "also"> {
  const say = (id: string, slots: Record<string, string | number> = {}) => renderReason({ id, slots }, templates, (id) => lookup(id)?.name ?? `#${id}`);
  const noGaps = say("pool.noGaps", { role });
  if (!pool || !pool.champions.length) return { coverage: null, nextStep: null, missing: null, noGaps, also: null };
  const holes = pool.holes;
  const gaps = new Set(holes.map((h) => h.need));
  const covers = poolCoverage(pool.champions.slice(0, POOL_COLUMNS), attributes, coverage);
  const words = (needs: PoolNeed[]) => listText(needs.map((n) => say(`pool.needWord.${n}`)), templates);
  const first = holes.find((h) => h.coveredBy.length);
  const champ = first ? pool.champions.find((c) => c.championId === first.coveredBy[0]) : undefined;
  const view = champ ? champView(champ.championId, lookup) : null;
  const fills = champ ? holes.filter((h) => h.coveredBy.includes(champ.championId)).map((h) => h.need) : [];
  const open = holes.filter((h) => !h.coveredBy.length).map((h) => h.need);
  const extra = pool.champions.slice(POOL_COLUMNS);
  const tiers = [...new Set(extra.map((c) => c.tier))];
  return {
    coverage: {
      // Only what champions in this role usually bring (a bot laner isn't judged on frontline).
      needs: pool.needs.map((need) => ({ need, label: say(`pool.need.${need}`), gap: gaps.has(need) })),
      covers: Object.fromEntries(covers),
    },
    nextStep:
      champ && view
        ? {
            champion: view,
            title: say(champ.tier === "learning" ? "pool.next.learning" : "pool.next.rusty", { champion: view.name }),
            text: say("pool.next.why", { needs: words(fills), role }),
            evidence: first && first.losses > 0 ? say("pool.hole.evidence", { lacking: first.lossesLacking, losses: first.losses, role }) : null,
          }
        : null,
    missing: open.length ? say("pool.missing", { needs: words(open), role, n: open.length }) : null,
    noGaps,
    also: tiers.length
      ? tiers
          .map((t) =>
            say("pool.also", {
              tier: say(`pool.tier.${t}`).toLowerCase(),
              champions: extra
                .filter((c) => c.tier === t)
                .map((c) => lookup(c.championId)?.name ?? `#${c.championId}`)
                .join(", "),
            }),
          )
          .join(". ")
      : null,
  };
}

/** What one role's view needs besides the role and its pool. */
export interface RoleViewContext {
  attributes: Map<ChampionId, ChampionAttributes>;
  coverage: EngineConfig["pool"]["coverage"];
  templates: Record<string, string>;
  lookup: ChampionLookup;
}

/** One role in the lobby: your record there, your pool with its tiers, its holes and the next step. */
export function roleView(r: ReturnType<typeof adviseRoles>[number], pool: RolePool | null, ctx: RoleViewContext): RoleView {
  const { lookup, templates } = ctx;
  const say = (id: string, slots: Record<string, string | number> = {}) => renderReason({ id, slots }, templates, String);
  return {
    role: r.role,
    games: r.games,
    winRate: r.winRate,
    score: r.score,
    enoughData: r.enoughData,
    pool: (pool?.champions ?? []).map((c) => ({
      champion: champView(c.championId, lookup)!,
      tier: c.tier,
      tierLabel: say(`pool.tier.${c.tier}`),
      games: c.games,
      winRate: c.winRate,
    })),
    holes: (pool?.holes ?? []).map((h) => {
      const first = h.coveredBy[0];
      return {
        need: h.need,
        text: say(`pool.hole.${h.need}`),
        evidence: h.losses > 0 ? say("pool.hole.evidence", { lacking: h.lossesLacking, losses: h.losses, role: r.role }) : null,
        coveredBy: h.coveredBy.length
          ? say("pool.hole.coveredBy", {
              champions: h.coveredBy
                .map((id) => {
                  const c = pool!.champions.find((x) => x.championId === id)!;
                  return `${champView(id, lookup)!.name} (${say(`pool.tier.${c.tier}`).toLowerCase()})`;
                })
                .join(" and "),
            })
          : null,
        coveredByChampion: first !== undefined ? champView(first, lookup) : null,
        fills: first !== undefined ? (pool?.holes ?? []).filter((x) => x.coveredBy.includes(first)).map((x) => x.need) : [],
      };
    }),
    ...poolAdvice(r.role, pool, ctx.attributes, ctx.coverage, templates, lookup),
  };
}

type Say = (r: Parameters<typeof renderReason>[0]) => string;

/** Suggested picks as the panel shows them. */
export function pickViews(picks: PickAdvice["picks"], lookup: ChampionLookup, say: Say): PickView[] {
  return picks.map((p) => ({
    champion: champView(p.championId, lookup)!,
    score: p.score,
    expectedWin: p.expectedWin ?? null,
    factors: p.factors,
    terms: p.terms ?? [],
    reasons: p.reasons.map((r) => reasonView(r, say)),
    offMeta: p.offMeta,
  }));
}

/** Why not another pick, and how sure the advice is. */
export function adviceNotes(advice: PickAdvice, say: Say): { whyNot: string | null; confidence: { level: NonNullable<PickAdvice["confidence"]>; label: string } | null } {
  return {
    whyNot: advice.whyNot ? say(advice.whyNot) : null,
    confidence: advice.confidence ? { level: advice.confidence, label: say({ id: `confidence.${advice.confidence}`, slots: {} }) } : null,
  };
}

/** Picks shown per queued role. */
const PREVIEW_PICKS = 3;

export interface QueuePreviewContext {
  owned: Set<ChampionId> | null;
  comfortFor: (role: Position) => Map<ChampionId, ComfortStats>;
  attributes: Map<ChampionId, ChampionAttributes>;
  intendedPositions: Map<ChampionId, Position[]>;
  config: LoadedConfig;
  band: RankBandId;
  index: MetaIndex | null;
  lookup: ChampionLookup;
}

/** In the lobby with roles chosen: your best picks for each, ranked as a blind pick (nobody else has picked yet). Roles without picks are left out. */
export function queuePreviewRoles(positions: Position[], ctx: QueuePreviewContext): NonNullable<ViewState["queuePreview"]>["roles"] {
  const { engine, explain } = ctx.config;
  const nameOf = (id: number) => ctx.lookup(id)?.name ?? `#${id}`;
  const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, explain.templates, nameOf);
  const roles = positions.map((position) => {
    const input = {
      draft: blindDraft(position),
      pickable: ctx.owned ? [...ctx.owned] : [],
      unavailable: new Set<ChampionId>(),
      comfort: ctx.comfortFor(position),
      attributes: ctx.attributes,
      intendedPositions: ctx.intendedPositions,
      role: position,
      weights: weightsForBand(ctx.band, engine),
      config: engine,
    };
    const advice: PickAdvice = ctx.index ? adviseLivePicks({ ...input, index: ctx.index, band: ctx.band, filled: false }) : advisePicks(input, explain.settings);
    return { role: position, picks: pickViews(advice.picks.slice(0, PREVIEW_PICKS), ctx.lookup, say), ...adviceNotes(advice, say) };
  });
  return roles.filter((r) => r.picks.length);
}

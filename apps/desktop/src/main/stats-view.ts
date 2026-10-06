import { deltaWin, placeDraft, type MetaIndex, type PlacedChampion, type Stat } from "@ldc/engine";
import type { BanSuggestion, ChampionId, DraftState, Position } from "@ldc/shared";
import type { BanView, MatchupRowView } from "../shared/view";
import { champView, type ChampionLookup } from "./draft-view";

const rate = (s: Stat) => (s.games > 0 ? s.wins / s.games : null);

/**
 * A ban suggestion's numbers for the ban table: the win chance it costs you (points, negative)
 * and its win, pick and ban rates in the band, judged in your role when it's played there,
 * else in its main role.
 */
export function banNumbers(index: MetaIndex, ban: BanSuggestion, role: Position | null): Pick<BanView, "threat" | "winRate" | "pickRate" | "banRate"> {
  const id = ban.championId;
  const r = role && index.champion(id, role).games > 0 ? role : index.mainRole(id);
  return {
    threat: -deltaWin(ban.threat),
    winRate: r ? rate(index.champion(id, r)) : null,
    pickRate: r ? index.pickRate(id, r) : null,
    banRate: index.banRate(id)?.rate ?? null,
  };
}

/**
 * Your champion against each enemy and with each ally in the draft, from the band's
 * matchups and duos. Roles come from the engine's draft-role guess (the client hides enemy
 * roles). Your lane opponent comes first; seats that haven't picked are rows without a
 * champion, in the roles nobody has taken yet. Null without a role for you.
 */
export function draftMatchups(
  draft: DraftState,
  index: MetaIndex,
  me: ChampionId,
  myRole: Position | null,
  lookup: ChampionLookup,
): { against: MatchupRowView[]; with: MatchupRowView[] } | null {
  const role = myRole ?? index.mainRole(me);
  if (!role) return null;
  const { allies, enemies } = placeDraft(draft, index, role);

  const row = (c: PlacedChampion, ally: boolean): MatchupRowView => {
    const s = ally ? index.duo(me, role, c.championId, c.role) : index.matchup(me, role, c.championId, c.role);
    const d = ally ? index.duoDelta(me, role, c.championId, c.role) : index.matchupDelta(me, role, c.championId, c.role);
    return {
      champion: champView(c.championId, lookup),
      role: c.role,
      lane: !ally && c.role === role,
      winRate: rate(s),
      delta: s.games > 0 ? deltaWin(d.delta) : null,
      games: s.n,
    };
  };
  /** Rows for the seats that haven't picked, in the roles still open. */
  const open = (seats: number, taken: Position[]): MatchupRowView[] =>
    index.roles
      .filter((r) => !taken.includes(r))
      .slice(0, Math.max(0, seats))
      .map((r) => ({ champion: null, role: r, lane: false, winRate: null, delta: null, games: 0 }));

  const against = enemies.map((e) => row(e, false)).sort((a, b) => Number(b.lane) - Number(a.lane));
  const allyRows = allies.map((a) => row(a, true));
  return {
    against: [...against, ...open(draft.theirTeam.length - enemies.length, enemies.map((e) => e.role))],
    with: [...allyRows, ...open(draft.myTeam.length - 1 - allies.length, [role, ...allies.map((a) => a.role)])],
  };
}

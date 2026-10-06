import type { StaticData } from "@ldc/ddragon";
import { renderReason, type Loadout, type RankBandConfig } from "@ldc/engine";
import type { ChampionId, Reason, RankBandId } from "@ldc/shared";
import type { IconView, LoadoutItemView, LoadoutView } from "../shared/view";

export interface LoadoutViewDeps {
  data: StaticData | null;
  templates: Record<string, string>;
  championName: (id: ChampionId) => string;
  bands: RankBandConfig;
  band: RankBandId;
  canImport: boolean;
}

/** Builds what the "Your pick" card shows from an engine loadout: Data Dragon names and icons, reasons in words. */
export function toLoadoutView(l: Loadout, deps: LoadoutViewDeps): LoadoutView {
  const d = deps.data;
  const icon = (map: ReadonlyMap<number, { name: string; iconUrl: string }> | undefined, id: number): IconView => {
    const x = map?.get(id);
    return { id, name: x?.name ?? `#${id}`, iconUrl: x?.iconUrl ?? null };
  };
  const item = (id: number) => icon(d?.itemInfo, id);
  const rune = (id: number) => icon(d?.runeInfo, id);
  const names = { item: (id: number) => item(id).name, rune: (id: number) => rune(id).name };
  const say = (r: Reason) => renderReason(r, deps.templates, deps.championName, names);
  const first = (rs: Reason[]) => (rs[0] ? say(rs[0]) : null);
  const key = (slot: number) => renderReason({ id: `skill.key.${slot}`, slots: {} }, deps.templates, deps.championName);
  const withReasons = (v: IconView, rs: Reason[]): LoadoutItemView => ({ ...v, reasons: rs.map(say) });

  const ids = deps.bands.bands.map((b) => b.id).sort((a, b) => a - b);
  const sourceBands = [deps.band, ids[ids.indexOf(deps.band) + 1]].filter((b): b is number => b !== undefined);
  const source = sourceBands.map((b) => deps.bands.bands.find((x) => x.id === b)?.name ?? String(b)).join(" + ");

  return {
    games: l.games,
    source,
    thinNote: l.source.thin
      ? [
          renderReason({ id: l.source.pooled ? "loadout.thin.pooled" : "loadout.thin", slots: { roleGames: l.source.roleGames, games: l.source.games, role: l.role, champion: l.championId } }, deps.templates, deps.championName),
          ...(l.source.personalGames ? [renderReason({ id: "loadout.thin.personal", slots: { personalGames: l.source.personalGames } }, deps.templates, deps.championName)] : []),
        ].join(". ")
      : null,
    page: l.page
      ? { primary: rune(l.page.value.primaryStyle), secondary: rune(l.page.value.subStyle), runes: l.page.value.runes.map(rune), reason: first(l.page.reasons) }
      : null,
    situationalRunes: l.situationalRunes.map((r) => withReasons(rune(r.runeId), r.reasons)),
    spells: l.spells ? { spells: l.spells.value.map((id) => icon(d?.spellInfo, id)), reason: first(l.spells.reasons) } : null,
    skills: l.skills ? { first: l.skills.value.first.map(key), order: l.skills.value.order.map(key), reason: first(l.skills.reasons) } : null,
    starting: l.starting ? { items: l.starting.value.map(item), reason: first(l.starting.reasons) } : null,
    quest: l.quest.map((q) => withReasons(item(q.itemId), q.reasons)),
    boots: l.boots ? { top: withReasons(item(l.boots.top.itemId), l.boots.top.reasons), alternatives: l.boots.alternatives.map((a) => withReasons(item(a.itemId), a.reasons)) } : null,
    items: l.items.map((s) => ({ slot: s.slot, top: withReasons(item(s.top.itemId), s.top.reasons), alternatives: s.alternatives.map((a) => withReasons(item(a.itemId), a.reasons)) })),
    commonPath: !l.items.length && l.core ? { items: l.core.value.map(item), reason: first(l.core.reasons) } : null,
    canImport: deps.canImport,
  };
}

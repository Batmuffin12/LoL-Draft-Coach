import type { IconView, LoadoutItemView, RuneTreeView } from "../../shared/view";
import { ChampIcon } from "./ChampIcon";

const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

function Tree({ tree, chosen, keystones }: { tree: RuneTreeView; chosen: Set<number>; keystones: boolean }) {
  return (
    <div className="tree">
      <div className="tree-head">
        <ChampIcon champ={tree.style} kind="game" round size={20} lit />
        <span className="label">{tree.style.name}</span>
      </div>
      {tree.rows.map((row, ri) => (
        <div key={ri} className={keystones && ri === 0 ? "tree-row keys" : "tree-row"}>
          {row.map((r) => {
            const on = chosen.has(r.id);
            return <ChampIcon key={r.id} champ={r} kind="game" round size={keystones && ri === 0 ? 30 : 22} state={on ? "picked" : "off"} lit={on} title={on ? `${r.name} (take this)` : r.name} />;
          })}
        </div>
      ))}
    </div>
  );
}

export interface RunePageProps {
  primary: RuneTreeView;
  secondary: RuneTreeView;
  /** The chosen rune ids (keystone first). */
  runes: IconView[];
  shards: { rows: IconView[][]; chosen: number[] } | null;
  /** Runes worth a swap against this team, one line each. */
  swaps: LoadoutItemView[];
}

/** The page on its full trees, like the build sites: taken runes lit, the rest grey. Then one line per situational swap. */
export function RunePage({ primary, secondary, runes, shards, swaps }: RunePageProps) {
  const chosen = new Set(runes.map((r) => r.id));
  return (
    <div className="runes">
      <div className="trees">
        <Tree tree={primary} chosen={chosen} keystones />
        <div className="right">
          <Tree tree={secondary} chosen={chosen} keystones={false} />
          {shards && (
            <div className="tree shards" aria-label="Stat mods" title="Stat mods">
              {shards.rows.map((row, ri) => (
                <div key={ri} className="tree-row">
                  {row.map((s, si) => {
                    const on = shards.chosen[ri] === si;
                    return <ChampIcon key={si} champ={s} kind="game" round size={18} state={on ? "picked" : "off"} lit={on} />;
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {swaps.map((s) => (
        <div key={s.id} className="swap" title={[s.name, ...s.reasons].join("\n")}>
          <ChampIcon champ={s} kind="game" round size={20} />
          <span className="one-line">
            <b>Swap in {s.name}</b>
            {s.reasons[0] && <span className="muted">{` — ${lower(s.reasons[0])}`}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

import type { LoadoutView } from "../../shared/view";
import { rate } from "../format";
import { ChampIcon } from "./ChampIcon";
import { Stat } from "./SkillGrid";

type Starting = NonNullable<LoadoutView["starting"]>;
type Boots = NonNullable<LoadoutView["boots"]>;

/** Start and boots side by side, each with its numbers. The core is the item matrix's top row. */
export function BuildPath({ starting, boots }: { starting: Starting | null; boots: Boots | null }) {
  const bootsTip = boots && [boots.top, ...boots.alternatives].map((o) => `${o.name} ${rate(o.share)}`).join(" · ");
  return (
    <div className="path2">
      <div className="stage" title={[starting?.items.map((i) => i.name).join(", "), starting?.reason].filter(Boolean).join("\n") || undefined}>
        <span className="label lbl">Starter</span>
        {starting ? (
          <>
            <div className="icons">
              {starting.items.map((it, i) => (
                <ChampIcon key={it.id} champ={it} kind="game" size={30} count={starting.counts[i]} title="" />
              ))}
            </div>
            <Stat winRate={starting.winRate} n={starting.games} />
          </>
        ) : (
          <span className="caption">No common start yet.</span>
        )}
      </div>
      <div className="stage" title={[bootsTip, boots?.top.reasons[0]].filter(Boolean).join("\n") || undefined}>
        <span className="label lbl">Boots</span>
        {boots ? (
          <>
            <div className="icons">
              {[boots.top, ...boots.alternatives].slice(0, 3).map((o, i) => (
                <ChampIcon key={o.id} champ={o} kind="game" size={i ? 22 : 30} lit={i === 0} title="" />
              ))}
            </div>
            <span className="stat">
              <b>{rate(boots.top.share)}</b> pick rate
            </span>
          </>
        ) : (
          <span className="caption">No common boots yet.</span>
        )}
      </div>
    </div>
  );
}

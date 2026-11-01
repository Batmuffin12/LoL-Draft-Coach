import type { FactItem, FactRow } from "../../shared/view";
import { cx, tip } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Icons in a row beside their labels. */
const ICON_SIZE = 18;

function Entry({ item, iconOnly }: { item: FactItem; iconOnly: boolean }) {
  return (
    <span className="fact-item" {...tip(item.title)}>
      {item.champion && <ChampIcon champ={item.champion} size={ICON_SIZE} />}
      {!(iconOnly && item.champion) && <span className="wrap">{item.text}</span>}
    </span>
  );
}

export interface FactsProps {
  rows: FactRow[];
  /** A row's text entries side by side instead of one per line (champions always are), where height is short. */
  flow?: boolean;
  /** Champion entries as icons only, their names on hover: for many champions in little room. */
  iconOnly?: boolean;
  /** Room for longer labels ("Also comfortable"). */
  wide?: boolean;
}

/** Labelled rows: a short label on the left, its values as separate entries on the right. */
export function Facts({ rows, flow = false, iconOnly = false, wide = false }: FactsProps) {
  return (
    <div className={cx("facts", wide && "wide")}>
      {rows.map((r) => (
        <div key={r.label} className="fact">
          <span className="fact-label">{r.label}</span>
          <span className={cx("fact-items", (flow || r.items.every((i) => i.champion)) && "flow")}>
            {r.items.map((item, i) => (
              <Entry key={i} item={item} iconOnly={iconOnly} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

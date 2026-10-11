import type { IconView, ItemOptionView, LoadoutView } from "../../shared/view";
import { rate, signedPctOrDash, t } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Item columns after Start and Boots (the core). */
const CORE_SLOTS = 3;
/** Other picks under each main item. */
const ALTERNATIVES = 2;

type Option = IconView & { reasons?: string[]; share?: number; winAdded?: number | null };

interface Column {
  key: string;
  label: string;
  minute: number | null;
  main: Option;
  /** The core build's items get the gold ring. */
  core: boolean;
  /** Null: no pick rates to show (the start, the common path with thin data). */
  alternatives: ItemOptionView[] | null;
  /** The start's other items: "+1 Health Potion". */
  extras: string[];
}

const tip = (o: Option) =>
  [
    o.name,
    o.share === undefined ? null : `Bought by ${rate(o.share)} of players`,
    o.winAdded == null ? null : `Players who bought it won ${signedPctOrDash(o.winAdded)} points vs what their game state predicted`,
    ...(o.reasons ?? []),
  ]
    .filter(Boolean)
    .join("\n");

/** The columns of the path: Start, Boots, then the core items (ranked, or the common path with thin data). */
function columns(l: LoadoutView): Column[] {
  const out: Column[] = [];
  const s = l.starting;
  if (s?.items[0]) {
    out.push({
      key: "start",
      label: t("build.start"),
      minute: 0,
      main: { ...s.items[0], reasons: [s.items.map((i, k) => `${s.counts[k] ?? 1} × ${i.name}`).join(", "), ...(s.reason ? [s.reason] : [])] },
      core: false,
      alternatives: null,
      extras: s.items.slice(1).map((i, k) => `+${s.counts[k + 1] ?? 1} ${i.name}`),
    });
  }
  if (l.boots) out.push({ key: "boots", label: t("build.boots"), minute: null, main: l.boots.top, core: false, alternatives: l.boots.alternatives.slice(0, ALTERNATIVES), extras: [] });
  if (l.items.length) {
    for (const [i, slot] of l.items.slice(0, CORE_SLOTS).entries())
      out.push({ key: `item${slot.slot}`, label: t("build.item", { n: i + 1 }), minute: slot.minute, main: slot.top, core: true, alternatives: slot.alternatives.slice(0, ALTERNATIVES), extras: [] });
  } else {
    for (const [i, item] of (l.commonPath?.items ?? []).slice(0, CORE_SLOTS).entries())
      out.push({ key: `common${i}`, label: t("build.item", { n: i + 1 }), minute: null, main: { ...item, reasons: l.commonPath?.reason ? [l.commonPath.reason] : [] }, core: true, alternatives: null, extras: [] });
  }
  return out;
}

/** The option in a column that adds the most (positive win added only): one ★ per column at most. */
function starOf(c: Column): number | null {
  // A star compares options: none for a column without other picks.
  if (!c.alternatives?.length) return null;
  const options = [c.main as ItemOptionView, ...c.alternatives];
  let best: number | null = null;
  options.forEach((o, i) => {
    if (o.winAdded != null && o.winAdded > 0 && (best === null || o.winAdded > options[best]!.winAdded!)) best = i;
  });
  return best;
}

function Star() {
  return (
    <span className="gold" aria-label="adds the most">
      {" ★"}
    </span>
  );
}

/**
 * The build as one row of columns (Start, Boots, Item 1–3): each with its minute, the main item
 * and its pick rate, then up to two other picks with theirs. ★ marks what adds the most in a column.
 */
export function BuildPath({ loadout }: { loadout: LoadoutView }) {
  const cols = columns(loadout);
  if (!cols.length) return <span className="caption">Not enough purchases to rank items yet.</span>;
  return (
    <div className="path">
      <span className="connector" aria-hidden="true" />
      {cols.map((c) => {
        const star = starOf(c);
        return (
          <div key={c.key} className="col">
            <span className="micro text">{c.label}</span>
            <span className="micro">{c.minute === null ? " " : t("build.minutes", { n: Math.round(c.minute) })}</span>
            <span className="main" tabIndex={0} aria-label={tip(c.main)}>
              <ChampIcon champ={c.main} kind="game" size={32} lit={c.core} title={tip(c.main)} />
            </span>
            {c.main.share !== undefined && c.alternatives && (
              <span className="micro text">
                {rate(c.main.share)}
                {star === 0 && <Star />}
              </span>
            )}
            {c.extras.map((e) => (
              <span key={e} className="micro text">
                {e}
              </span>
            ))}
            {c.alternatives &&
              (c.alternatives.length ? (
                <>
                  <span className="micro">{t("build.or")}</span>
                  {c.alternatives.map((a, i) => (
                    <span key={a.id} className="opt" tabIndex={0} aria-label={tip(a)}>
                      <ChampIcon champ={a} kind="game" size={22} title={tip(a)} />
                      <span className="micro">
                        {rate(a.share)}
                        {star === i + 1 && <Star />}
                      </span>
                    </span>
                  ))}
                </>
              ) : (
                <span className="micro">{t("build.noAlt")}</span>
              ))}
          </div>
        );
      })}
    </div>
  );
}

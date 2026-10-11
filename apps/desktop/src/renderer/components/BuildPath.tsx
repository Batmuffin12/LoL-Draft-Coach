import type { IconView, ItemOptionView, LoadoutView } from "../../shared/view";
import { cx, rate, signedPctOrDash, t } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Core item rows after Start and Boots. */
const CORE_SLOTS = 4;
/** Other picks beside each main item. */
const ALTERNATIVES = 2;

type Option = IconView & { reasons?: string[]; share?: number; winAdded?: number | null };

interface Step {
  key: string;
  label: string;
  minute: number | null;
  main: Option;
  /** The core build's items get the gold ring. */
  core: boolean;
  /** Null: no pick rates to show (the start, the common path with thin data). */
  alternatives: ItemOptionView[] | null;
  /** The start's other items with how many (2 potions, a ward), shown as icons. */
  extras: { item: IconView; count: number }[];
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

/** The steps of the path: Start, Boots, then the core items (ranked, or the common path with thin data). */
function steps(l: LoadoutView): Step[] {
  const out: Step[] = [];
  const s = l.starting;
  if (s?.items[0]) {
    out.push({
      key: "start",
      label: t("build.start"),
      minute: 0,
      main: { ...s.items[0], reasons: [s.items.map((i, k) => `${s.counts[k] ?? 1} × ${i.name}`).join(", "), ...(s.reason ? [s.reason] : [])] },
      core: false,
      alternatives: null,
      extras: s.items.slice(1).map((item, k) => ({ item, count: s.counts[k + 1] ?? 1 })),
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

/** The option in a step that adds the most (positive win added, and only when there's something to compare): one ★ per step at most. */
function starOf(c: Step): number | null {
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
 * The build, one row per step (Start, Boots, Items 1–4): when, the main item with its name and
 * pick rate, then up to two other picks with theirs. ★ marks what adds the most in a step.
 */
export function BuildPath({ loadout }: { loadout: LoadoutView }) {
  const rows = steps(loadout);
  if (!rows.length) return <span className="caption">Not enough purchases to rank items yet.</span>;
  return (
    <div className="path" role="table" aria-label="Build path">
      {rows.map((c) => {
        const star = starOf(c);
        return (
          <div key={c.key} className="step" role="row">
            <span className="when">
              <span className="micro text">{c.label}</span>
              {c.minute !== null && <span className="micro">{t("build.minutes", { n: Math.round(c.minute) })}</span>}
            </span>
            <span className="main" tabIndex={0} aria-label={tip(c.main)} title={tip(c.main)}>
              <ChampIcon champ={c.main} kind="game" size={32} lit={c.core} title="" />
              <span className="nm">
                <span className="text">{c.main.name}</span>
              </span>
            </span>
            <span className={cx("rate", star === 0 && "best")}>
              {c.main.share !== undefined && c.alternatives && (
                <>
                  {rate(c.main.share)}
                  {star === 0 && <Star />}
                </>
              )}
            </span>
            <span className="alts-col">
              {c.extras.map((e) => (
                <span key={e.item.id} className="opt" tabIndex={0} aria-label={`${e.count} × ${e.item.name}`} title={`${e.count} × ${e.item.name}`}>
                  <ChampIcon champ={e.item} kind="game" size={22} count={e.count} title="" />
                </span>
              ))}
              {c.alternatives &&
                (c.alternatives.length ? (
                  c.alternatives.map((a, i) => (
                    <span key={a.id} className="opt" tabIndex={0} aria-label={tip(a)} title={tip(a)}>
                      <ChampIcon champ={a} kind="game" size={22} title="" />
                      <span className="micro">
                        {rate(a.share)}
                        {star === i + 1 && <Star />}
                      </span>
                    </span>
                  ))
                ) : (
                  <span className="micro">{t("build.noAlt")}</span>
                ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

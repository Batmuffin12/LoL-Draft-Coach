import type { PickView, PoolChampView, ReasonView } from "../../shared/view";
import { cx, pct, pickColumns, pickReasons, rate, signedOrDash, t, tone } from "../format";
import { ChampIcon } from "./ChampIcon";
import { OffMetaChip } from "./Chip";

/** The three parts of the chance shown as tiles; the team part reaches you through the reasons. */
const TILES = [
  { key: "you", label: "You", title: "Your experience on it in this role, and your record on it" },
  { key: "meta", label: "Meta", title: "Its strength in your rank" },
  { key: "lane", label: "Lane", title: "Into their laner (for information: matchups barely change who wins)" },
] as const;

/** The short part of a reason, before its numbers: "Strong in mid in your rank: 51.7% …" → "Strong in mid in your rank". */
export function reasonHeadline(r: ReasonView): string {
  const i = r.text.indexOf(":");
  return i > 0 ? r.text.slice(0, i) : r.text;
}

export interface SuggestedPickProps {
  pick: PickView;
  /** The selected pick is #1: "Picked over your usual X because …" shows under its reasons. */
  first: boolean;
  whyNot: string | null;
  /** Your record on it in this role (your pool), or null when it isn't in your pool. */
  record: PoolChampView | null;
  /** Reason lines under the tiles (fewer when the draft notes take a line). */
  maxReasons: number;
}

/** The suggested pick: a gold card with its chance, the You · Meta · Lane tiles, and its reasons. */
export function SuggestedPick({ pick, first, whyNot, record, maxReasons }: SuggestedPickProps) {
  const cols = pickColumns(pick.terms);
  return (
    <>
      <div className="you pick-card">
        <ChampIcon champ={pick.champion} size={64} framed />
        <div className="who">
          <span className="t-title nm">
            {pick.champion.name} {pick.offMeta && <OffMetaChip />}
          </span>
          {record && (
            <span className="micro">{t("pick.record", { tier: record.tierLabel, games: record.games, wr: rate(record.winRate, 1) })}</span>
          )}
        </div>
        {/* No good/bad colour: the chance compares your options in this draft, and #1 is the best one even below 50%. */}
        <div className="chance" title="Its strength in your rank plus your experience on it">
          <span className="t-number">{pick.expectedWin === null ? "—" : pct(pick.expectedWin)}</span>
          <span className="micro">{t("pick.chance")}</span>
        </div>
      </div>
      <div className="tiles">
        {TILES.map((c) => (
          <div key={c.key} className="tile" title={c.title}>
            <span className="label">{c.label}</span>
            <span className={cx("t-heading", cols[c.key] === null ? "muted" : tone(cols[c.key]))}>{signedOrDash(cols[c.key])}</span>
          </div>
        ))}
      </div>
      <ul className="reasons">
        {pickReasons(pick.reasons, maxReasons).map((r) => (
          <li key={r.text} className={r.negative ? "but" : undefined}>
            {r.text}
          </li>
        ))}
        {first && whyNot && <li className="why">{whyNot}</li>}
      </ul>
    </>
  );
}

/** The other suggestions as equal buttons: icon, name, chance and its first plus. Clicking one shows it in the card. */
export function OtherPicks({ picks, onSelect }: { picks: { pick: PickView; index: number }[]; onSelect: (index: number) => void }) {
  return (
    <div className="alts">
      {picks.map(({ pick, index }) => {
        const plus = pick.reasons.find((r) => !r.negative);
        const line = [pick.expectedWin === null ? null : pct(pick.expectedWin), plus ? reasonHeadline(plus).replace(/^./, (c) => c.toLowerCase()) : null].filter(Boolean).join(" · ");
        return (
          <button key={pick.champion.id} type="button" className="alt" onClick={() => onSelect(index)} title={[pick.champion.name, ...pick.reasons.map((r) => r.text)].join("\n")}>
            <ChampIcon champ={pick.champion} size={34} title="" />
            <span className="t-heading">{pick.champion.name}</span>
            {line && <span className="micro">{line}</span>}
          </button>
        );
      })}
    </div>
  );
}

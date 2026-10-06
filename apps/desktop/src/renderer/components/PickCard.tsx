import type { PickAdviceView, PickView } from "../../shared/view";
import { cx, pickReasons, signed, TERM_LABEL, thinTerm, topTerms } from "../format";
import { ChampIcon } from "./ChampIcon";
import { OffMetaChip } from "./Chip";
import { DeltaBar } from "./DeltaBar";
import { WinChance } from "./WinChance";

export interface PickCardProps {
  pick: PickView;
  rank: number;
  open: boolean;
  onOpen: () => void;
  minGames?: PickAdviceView["minGames"];
  /** "Picked over your usual X because …" (the #1 pick only). */
  whyNot?: string | null;
}

/** One suggested pick. Open: portrait, name, win chance, three signed terms and the reasons. Closed: a 68px row. */
export function PickCard({ pick, rank, open, onOpen, minGames, whyNot }: PickCardProps) {
  const terms = topTerms(pick.terms, 3);
  if (open) {
    // Without terms (no live meta) the reasons get the room.
    const reasons = pickReasons(pick.reasons, terms.length ? 3 : 4);
    return (
      <li className="pick open">
        <div className="pick-top">
          <ChampIcon champ={pick.champion} size={52} framed />
          <div className="pick-name">
            <span className="rank">
              #{rank}
              {rank === 1 ? " Best pick" : ""}
            </span>
            <span className="nm">
              {pick.champion.name}
              {pick.offMeta && <OffMetaChip />}
            </span>
          </div>
          <WinChance value={pick.expectedWin} size="hero" />
        </div>
        {terms.length > 0 && (
          <div className="terms">
            {terms.map((t) => (
              <DeltaBar key={t.name} term={t} thin={thinTerm(t, minGames)} />
            ))}
          </div>
        )}
        {(reasons.length > 0 || whyNot) && (
          <ul className="reasons">
            {reasons.map((r) => (
              <li key={r.text} className={r.negative ? "but" : undefined}>
                {r.text}
              </li>
            ))}
            {whyNot && <li className="why">{whyNot}</li>}
          </ul>
        )}
      </li>
    );
  }
  const lead = terms[0];
  return (
    <li className="pick">
      <button className="row-btn" onClick={onOpen} aria-expanded={false} title={pick.reasons.map((r) => r.text).join("\n")}>
        <ChampIcon champ={pick.champion} size={40} />
        <div className="pick-name">
          <span className="nm">
            <span className="rank">#{rank}</span>
            {pick.champion.name}
            {pick.offMeta && <OffMetaChip />}
          </span>
          {lead ? (
            <span className="caption">
              {TERM_LABEL[lead.name]} <strong className={lead.deltaWin >= 0 ? "pos" : "neg"}>{signed(lead.deltaWin)}</strong>
            </span>
          ) : (
            pick.reasons[0] && <span className={cx("caption", pick.reasons[0].negative && "neg")}>{pick.reasons[0].text}</span>
          )}
        </div>
        <WinChance value={pick.expectedWin} size="row" showVs={false} />
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

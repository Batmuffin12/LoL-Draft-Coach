import type { BanView, ViewState } from "../../shared/view";
import { ChampIcon } from "./ChampIcon";
import { Section } from "./Section";

function Bans({ bans, start }: { bans: BanView[]; start: number }) {
  return (
    <ol className="ban-list">
      {bans.map((b, i) => (
        <li key={b.champion.id} className="ban" title={b.reasons.join("\n")}>
          <ChampIcon champ={b.champion} size={40} />
          <div className="body">
            <span className="heading">
              <span className="rank">#{start + i}</span>
              {b.champion.name}
            </span>
            {b.reasons[0] && <span className="caption">{b.reasons[0]}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Rows that fit 720px with the phase band: cut bans before shrinking type. */
const MAX_BANS = 6;

/** Suggested bans, then extra bans that protect the champion you're hovering. */
export function BanList({ bans, hover }: { bans: BanView[]; hover: ViewState["hoverBans"] }) {
  return (
    <>
      <Section title="Suggested bans">
        {bans.length > 0 ? <Bans bans={bans} start={1} /> : <p className="caption">Ban suggestions need the live meta for your rank.</p>}
      </Section>
      {hover && hover.bans.length > 0 && (
        <Section title={`Against your ${hover.champion.name}`} gold={false}>
          <Bans bans={hover.bans.slice(0, Math.max(1, MAX_BANS - bans.length))} start={bans.length + 1} />
        </Section>
      )}
    </>
  );
}

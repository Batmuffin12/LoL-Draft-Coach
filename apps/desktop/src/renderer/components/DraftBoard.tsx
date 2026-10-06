import type { ChampView, DraftView, SlotView } from "../../shared/view";
import { cx, positionLabel } from "../format";
import { ChampIcon } from "./ChampIcon";

/** A seat: champion and position only, never a player. */
function Seat({ slot }: { slot: SlotView }) {
  const shown = slot.champion ?? slot.hover;
  const state = slot.champion ? "picked" : slot.hover ? "hover" : "empty";
  const name = shown ? shown.name : slot.actingType === "ban" ? "Banning" : slot.actingType ? "Picking" : "—";
  return (
    <div className={cx("seat", slot.isLocalPlayer && "me")}>
      <ChampIcon champ={shown} state={state} size={48} me={slot.isLocalPlayer} acting={!!slot.actingType && !slot.isLocalPlayer} />
      <span className={cx("nm", !slot.champion && "dim")}>{name}</span>
      <span className="seat-pos">{slot.isLocalPlayer ? "You" : positionLabel(slot.position)}</span>
    </div>
  );
}

function Team({ side, title, slots, bans }: { side: "ally" | "enemy"; title: string; slots: SlotView[]; bans: ChampView[] }) {
  return (
    <div className={cx("team", side)}>
      <div className="team-head">
        <span className="side" aria-hidden="true" />
        <span className="label">{title}</span>
        <span className="bans" title="Bans">
          {bans.map((b, i) => (
            <ChampIcon key={`${b.id}-${i}`} champ={b} size={24} state="banned" />
          ))}
        </span>
      </div>
      <div className="seats">
        {slots.map((s) => (
          <Seat key={s.cellId} slot={s} />
        ))}
      </div>
    </div>
  );
}

/** Both teams, five across. Undocked only: docked, the client already shows the draft. */
export function DraftBoard({ draft }: { draft: DraftView }) {
  return (
    <div className="board">
      <Team side="ally" title="Your team" slots={draft.myTeam} bans={draft.myBans} />
      <Team side="enemy" title="Enemy team" slots={draft.theirTeam} bans={draft.theirBans} />
    </div>
  );
}

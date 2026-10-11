import { useEffect, useState } from "react";
import type { ViewState } from "../../shared/view";
import { ConfidenceChip } from "../components/Chip";
import { Pills } from "../components/Pills";
import { Section } from "../components/Section";
import { OtherPicks, SuggestedPick } from "../components/SuggestedPick";
import { Window } from "../components/Window";
import { positionLabel, t } from "../format";
import { AccountFooter, Header, Notices } from "./common";
import { LobbyScreen } from "./LobbyScreen";

type Preview = NonNullable<ViewState["queuePreview"]>;

/**
 * In the lobby with roles chosen, before the queue pops: your best picks for each role as a blind
 * pick (primary role first), so you can plan. Champ select replaces it with the real draft.
 * "Your stats" goes back to the lobby tabs.
 */
export function QueueScreen({ state, preview }: { state: ViewState; preview: Preview }) {
  const [stats, setStats] = useState(false);
  const [role, setRole] = useState(preview.roles[0]!.role);
  const [sel, setSel] = useState(0);
  const cur = preview.roles.find((r) => r.role === role) ?? preview.roles[0]!;
  const firstId = cur.picks[0]?.champion.id;
  useEffect(() => setSel(0), [firstId, cur.role]);
  if (stats) return <LobbyScreen state={state} onBack={() => setStats(false)} />;
  const pick = cur.picks[sel] ?? cur.picks[0]!;
  const at = cur.picks.indexOf(pick);
  const record = state.roles.find((r) => r.role === cur.role)?.pool.find((c) => c.champion.id === pick.champion.id) ?? null;
  return (
    <Window
      variant="lobby"
      header={<Header state={state} />}
      band={
        <section className="phase">
          <div className="what">
            <span className="t-title t-call call">{t("queue.call")}</span>
            <span className="caption ctx">{t("queue.context", { role: positionLabel(cur.role) })}</span>
          </div>
          <button type="button" className="foot-link" onClick={() => setStats(true)}>
            {t("queue.stats")}
          </button>
        </section>
      }
      footer={<AccountFooter account={state.account} />}
    >
      <Notices state={state} />
      <section className="section pills-row">
        <Pills label="Role" options={preview.roles.map((r, i) => ({ value: r.role, label: positionLabel(r.role), title: i === 0 ? t("queue.primary") : t("queue.secondary") }))} value={cur.role} onChange={setRole} />
      </section>
      <Section title={t("pick.head")} aside={<ConfidenceChip confidence={cur.confidence} />}>
        <SuggestedPick pick={pick} first={at === 0} whyNot={cur.whyNot} record={record} maxReasons={4} />
      </Section>
      {cur.picks.length > 1 && (
        <Section title={t("pick.ifNot", { champion: pick.champion.name })} gold={false}>
          <OtherPicks picks={cur.picks.map((p, index) => ({ pick: p, index })).filter((p) => p.index !== at)} onSelect={setSel} />
        </Section>
      )}
    </Window>
  );
}

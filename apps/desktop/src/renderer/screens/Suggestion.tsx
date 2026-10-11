import { useEffect, useState } from "react";
import type { ViewState } from "../../shared/view";
import { ConfidenceChip } from "../components/Chip";
import { Pills } from "../components/Pills";
import { Section } from "../components/Section";
import { OtherPicks, SuggestedPick } from "../components/SuggestedPick";
import { positionLabel, t } from "../format";

type Preview = NonNullable<ViewState["queuePreview"]>;

/**
 * The lobby's Suggestion tab, in a lobby with roles chosen before the queue pops: your best picks
 * for each role as a blind pick (primary role first), so you can plan. Champ select replaces it
 * with the real draft.
 */
export function Suggestion({ state, preview }: { state: ViewState; preview: Preview }) {
  const [role, setRole] = useState(preview.roles[0]!.role);
  const [sel, setSel] = useState(0);
  const cur = preview.roles.find((r) => r.role === role) ?? preview.roles[0]!;
  const firstId = cur.picks[0]?.champion.id;
  useEffect(() => setSel(0), [firstId, cur.role]);
  const pick = cur.picks[sel] ?? cur.picks[0]!;
  const at = cur.picks.indexOf(pick);
  const record = state.roles.find((r) => r.role === cur.role)?.pool.find((c) => c.champion.id === pick.champion.id) ?? null;
  return (
    <>
      <section className="section pills-row">
        <Pills
          label="Role"
          options={preview.roles.map((r, i) => ({ value: r.role, label: positionLabel(r.role), title: i === 0 ? t("queue.primary") : t("queue.secondary") }))}
          value={cur.role}
          onChange={setRole}
          end={t("queue.context")}
        />
      </section>
      <Section title={t("pick.head")} aside={<ConfidenceChip confidence={cur.confidence} />}>
        <SuggestedPick pick={pick} first={at === 0} whyNot={cur.whyNot} record={record} maxReasons={4} />
      </Section>
      {cur.picks.length > 1 && (
        <Section title={t("pick.ifNot", { champion: pick.champion.name })} gold={false}>
          <OtherPicks picks={cur.picks.map((p, index) => ({ pick: p, index })).filter((p) => p.index !== at)} onSelect={setSel} />
        </Section>
      )}
    </>
  );
}

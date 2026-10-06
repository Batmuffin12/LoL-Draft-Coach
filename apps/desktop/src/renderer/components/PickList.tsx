import { useEffect, useState } from "react";
import type { PickAdviceView, PickView } from "../../shared/view";
import { ConfidenceChip } from "./Chip";
import { PickCard } from "./PickCard";
import { Section } from "./Section";

export interface PickListProps {
  picks: PickView[];
  advice: PickAdviceView;
  emptyText?: string;
}

/** The suggested picks: #1 open, the others as rows you can open. */
export function PickList({ picks, advice, emptyText }: PickListProps) {
  const [open, setOpen] = useState(0);
  const first = picks[0]?.champion.id;
  // A new #1 (the draft moved on) opens again.
  useEffect(() => setOpen(0), [first]);
  return (
    <Section title="Suggested picks" aside={picks.length > 0 && <ConfidenceChip confidence={advice.confidence} />}>
      {picks.length === 0 && <p className="caption">{emptyText ?? "Suggestions appear during champ select."}</p>}
      <ol className="pick-list">
        {picks.map((p, i) => (
          <PickCard key={p.champion.id} pick={p} rank={i + 1} open={i === open} onOpen={() => setOpen(i)} minGames={advice.minGames} whyNot={i === 0 ? advice.whyNot : null} />
        ))}
      </ol>
    </Section>
  );
}

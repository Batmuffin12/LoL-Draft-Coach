import type { LoadoutItemView, LoadoutView, MyPickView } from "../../shared/view";
import { t } from "../format";
import { BuildPath } from "./BuildPath";
import { ChampIcon } from "./ChampIcon";
import { MatchupTable } from "./MatchupTable";
import { RunePage } from "./RunePage";
import { Section } from "./Section";
import { SkillGrid, Stat } from "./SkillGrid";

export type LoadoutTab = "runes" | "build" | "matchups";

/** Rows in "Later: pick by situation". */
const LATER_ROWS = 3;

const tip = (i: LoadoutItemView) => [i.name, ...i.reasons].join("\n");
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

/** Item icons with the items named and their reasons, wrapping ("Vs this team", the role quest). */
function ItemLine({ items }: { items: LoadoutItemView[] }) {
  return (
    <div className="item-line">
      <span className="icons">
        {items.map((i) => (
          <ChampIcon key={i.id} champ={i} kind="game" size={22} title={tip(i)} />
        ))}
      </span>
      <span className="caption">
        {items.map((i, k) => (
          <span key={i.id}>
            {k > 0 && "; "}
            <b className="text">{i.name}</b>
            {i.reasons[0] ? ` ${lower(i.reasons[0])}` : ""}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Runes on their full trees with the page's numbers; then spells and the skill grid (both as they were). */
export function RunesTab({ loadout: l }: { loadout: LoadoutView }) {
  const p = l.page;
  return (
    <>
      {p && (
        <Section title="Runes" aside={<Stat winRate={p.winRate} n={p.games} title={p.reason ?? undefined} />}>
          {p.primaryTree && p.secondaryTree ? (
            <RunePage primary={p.primaryTree} secondary={p.secondaryTree} runes={p.runes} shards={p.shardRows} swaps={l.situationalRunes} />
          ) : (
            <div className="icons">
              {[...p.runes, ...p.shards].map((r, i) => (
                <ChampIcon key={`${r.id}-${i}`} champ={r} kind="game" round size={i === 0 ? 30 : 22} />
              ))}
            </div>
          )}
        </Section>
      )}
      {(l.spells || l.skills) && (
        <Section title="Summoner spells & skill order">
          <SkillGrid spells={l.spells} skills={l.skills} />
        </Section>
      )}
    </>
  );
}

/** The build path with the other picks, what to buy against this team, the later pool and the role quest. */
export function BuildTab({ loadout: l }: { loadout: LoadoutView }) {
  // Each item once: what the path or the Later pool already show isn't repeated under "Vs this team".
  const shown = new Set([
    ...(l.starting?.items.map((i) => i.id) ?? []),
    ...(l.boots ? [l.boots.top, ...l.boots.alternatives].map((o) => o.id) : []),
    ...l.items.flatMap((s) => [s.top, ...s.alternatives].map((o) => o.id)),
    ...(l.commonPath?.items.map((i) => i.id) ?? []),
    ...l.laterPool.slice(0, LATER_ROWS).map((i) => i.id),
  ]);
  const vsTeam = l.situational.filter((i) => !shown.has(i.id));
  // The note says only what the path shows: ★ needs win added, pick rates need ranked items.
  const stars = [...l.items.flatMap((s) => [s.top, ...s.alternatives]), ...(l.boots ? [l.boots.top, ...l.boots.alternatives] : [])].some((o) => o.winAdded !== null);
  const note = stars ? t("build.note") : l.items.length > 0 || l.boots !== null ? t("build.noteRate") : t("build.noteThin");
  return (
    <>
      <Section title={t("build.head")} aside={<span className="micro">{note}</span>}>
        <BuildPath loadout={l} />
      </Section>
      {vsTeam.length > 0 && (
        <Section title={t("build.vsTeam")}>
          <ItemLine items={vsTeam} />
        </Section>
      )}
      {l.quest.length > 0 && (
        <Section title={t("build.quest")}>
          <ItemLine items={l.quest} />
        </Section>
      )}
      {l.laterPool.length > 0 && (
        <Section title={t("build.later")} gold={false}>
          {l.laterPool.slice(0, LATER_ROWS).map((i) => (
            <div key={i.id} className="later-row" title={tip(i)}>
              <ChampIcon champ={i} kind="game" size={22} title="" />
              <span className="caption">
                <span className="text">{i.name}</span>
                {i.reasons[0] ? ` — ${lower(i.reasons[0])}` : ""}
              </span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

/** How this game is likely to go, then your champion against their team (your lane first) and with yours. */
export function MatchupsPlanTab({ pick }: { pick: MyPickView }) {
  const m = pick.matchups;
  return (
    <>
      <Section title={t("plan.head")}>
        {pick.plan.length ? (
          <ul className="reasons plan-lines">
            {pick.plan.map((line) => (
              <li key={line} className="why">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">{t("plan.empty")}</p>
        )}
      </Section>
      {m ? (
        <>
          <Section title={t("matchups.against")} aside={<span className="micro">{t("matchups.note")}</span>}>
            <MatchupTable rows={m.against} />
          </Section>
          <Section title={t("matchups.with")} gold={false}>
            <MatchupTable rows={m.with} />
          </Section>
        </>
      ) : (
        <Section title={t("matchups.against")}>
          <p className="caption">{t("matchups.empty")}</p>
        </Section>
      )}
    </>
  );
}

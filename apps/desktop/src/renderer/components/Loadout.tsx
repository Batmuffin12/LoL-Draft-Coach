import type { LoadoutItemView, LoadoutView, MyPickView, RunePageView } from "../../shared/view";
import { gameCount, isThin, rate, t, tip as focusTip } from "../format";
import { useFitLevel } from "../hooks";
import { shownPage, type RuneChoice } from "../rune-choice";
import { BuildPath } from "./BuildPath";
import { ChampIcon } from "./ChampIcon";
import { MatchupTable } from "./MatchupTable";
import { ChoiceGroup } from "./ChoiceGroup";
import { RunePage } from "./RunePage";
import { Section } from "./Section";
import { SkillGrid, Stat } from "./SkillGrid";

export type LoadoutTab = "runes" | "build" | "matchups";

/** Rows in "Later: pick by situation". */
const LATER_ROWS = 3;

const tip = (i: LoadoutItemView) => [i.name, ...i.reasons].join("\n");
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

/** One row per item: its icon and name, then why, on hover only when `brief` ("Vs this team", the role quest, "Later: pick by situation"). */
function ItemRows({ items, brief }: { items: LoadoutItemView[]; brief: boolean }) {
  return (
    <div className="item-rows">
      {items.map((i) => (
        <div key={i.id} className="later-row" {...focusTip(tip(i))}>
          <ChampIcon champ={i} kind="game" size={22} title="" />
          <span className="caption wrap">
            <b className="text">{i.name}</b>
            {!brief && i.reasons[0] ? ` — ${lower(i.reasons[0])}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A rune option's numbers: how many take it and how it does ("15% · 55% WR"); games for a matchup page, which has no share, and in place of a win rate from too few games. */
function optionNumbers(o: RunePageView): string {
  const count = gameCount(o.games);
  const thin = o.winRate === null || isThin(o.games);
  return [o.share !== null ? rate(o.share) : thin ? null : count, thin ? count : t("runes.optionWinRate", { rate: rate(o.winRate) })].filter(Boolean).join(" · ");
}

/** What a rune option is and its numbers, on one line ("Second · 15% · 55% WR"). */
export function optionText(o: RunePageView): string {
  return [o.optionLabel, optionNumbers(o)].filter(Boolean).join(" · ");
}

/** One rune page on its trees, under a switch when there are `options` to choose from, else under a head with its numbers. */
export function RuneOptions({ page: p, options, choose, maxSwaps }: { page: RunePageView; options: RunePageView[]; choose: (key: string) => void; maxSwaps?: number | undefined }) {
  const head = options.length ? { className: "rune-options" } : { title: t("runes.tab"), aside: <Stat winRate={p.winRate} n={p.games} title={p.reason ?? undefined} /> };
  return (
    <Section {...head}>
      {options.length > 0 && <div data-tour="rune-options"><ChoiceGroup fill label={t("runes.options")} options={options.map((o) => ({ value: o.key, label: o.optionLabel ?? "", sub: optionNumbers(o), title: o.reason ?? undefined }))} value={p.key} onChange={choose} /></div>}
      {p.primaryTree && p.secondaryTree ? (
        <RunePage primary={p.primaryTree} secondary={p.secondaryTree} runes={p.runes} shards={p.shardRows} swaps={p.situationalRunes} {...(maxSwaps === undefined ? {} : { maxSwaps })} />
      ) : (
        <div className="icons">
          {[...p.runes, ...p.shards].map((r, i) => (
            <ChampIcon key={`${r.id}-${i}`} champ={r} kind="game" round size={i === 0 ? 30 : 22} />
          ))}
        </div>
      )}
    </Section>
  );
}

/** Runes on their full trees with the page's numbers, or a switch in place of that head when there's a second option; then spells and the skill grid (both as they were). */
export function RunesTab({ loadout: l, runes }: { loadout: LoadoutView; runes: RuneChoice }) {
  const p = shownPage(l, runes.key);
  const options = l.page && l.pageAlt ? [l.page, l.pageAlt] : [];
  // With swaps and a notice or import result the screen runs short: first the second swap moves to hover, then the spells' head goes, then the first swap moves to hover too.
  const level = useFitLevel(p?.key, 3);
  return (
    <>
      {p && <RuneOptions page={p} options={options} choose={runes.choose} maxSwaps={level > 2 ? 0 : level > 0 ? 1 : undefined} />}
      {(l.spells || l.skills) && (
        <Section title={level > 1 ? undefined : t("build.spellsSkills")}>
          <SkillGrid spells={l.spells} skills={l.skills} />
        </Section>
      )}
    </>
  );
}

/**
 * The build path with the other picks, what to buy against this team, the later pool and the role quest.
 * `winAdded`: the path shows each item's win added, for looking things up with no draft to answer.
 */
export function BuildTab({ loadout: l, winAdded = false }: { loadout: LoadoutView; winAdded?: boolean }) {
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
  const base = stars ? t(winAdded ? "build.noteWinAdded" : "build.note") : l.items.length > 0 || l.boots !== null ? t("build.noteRate") : t("build.noteThin");
  const note = l.spikeSlots.length ? `${base} · ${t("build.spikeNote")}` : base;
  // A full build with a notice or import result: first the items' reasons move to hover, then the path's rows get tighter, then the role quest moves to hover.
  const level = useFitLevel(l.games, 3);
  const questTip = level > 2 ? l.quest.map(tip).join("\n") : "";
  return (
    <>
      <Section title={t("build.head")} aside={<span className="micro" {...focusTip(questTip)}>{note}</span>}>
        <BuildPath loadout={l} tight={level > 1} winAdded={winAdded} />
      </Section>
      {vsTeam.length > 0 && (
        <Section title={t("build.vsTeam")}>
          <ItemRows items={vsTeam} brief={level > 0} />
        </Section>
      )}
      {l.quest.length > 0 && level < 3 && (
        <Section title={t("build.quest")}>
          <ItemRows items={l.quest} brief={level > 0} />
        </Section>
      )}
      {l.laterPool.length > 0 && (
        <Section title={t("build.later")}>
          <ItemRows items={l.laterPool.slice(0, LATER_ROWS)} brief={level > 0} />
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
          <Section title={t("matchups.with")}>
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

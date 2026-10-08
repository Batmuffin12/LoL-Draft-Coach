import type { LoadoutItemView, LoadoutView, MyPickView } from "../../shared/view";
import { Button } from "./Button";
import { BuildPath } from "./BuildPath";
import { ChampIcon } from "./ChampIcon";
import { ItemMatrix, type MatrixSlot } from "./ItemMatrix";
import { MatchupTable } from "./MatchupTable";
import { RunePage } from "./RunePage";
import { Section } from "./Section";
import { SkillGrid, Stat } from "./SkillGrid";

export type LoadoutTab = "plan" | "runes" | "build" | "matchups";

export interface LoadoutProps {
  loadout: LoadoutView;
  /** Called only from the player's click on an import button. */
  onImport: (kind: "runes" | "items") => void;
  busy: "runes" | "items" | null;
  importMessage: string | null;
}

/** Item columns in the matrix (1st–4th); with thin data the core only, then the "Later" pool. */
const MATRIX_SLOTS = 4;

const tip = (i: LoadoutItemView) => [i.name, ...i.reasons].join("\n");
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

function ImportButton({ kind, label, busy, onImport }: { kind: "runes" | "items"; label: string; busy: LoadoutProps["busy"]; onImport: LoadoutProps["onImport"] }) {
  const title =
    kind === "runes"
      ? "Creates (or updates) an 'LDC:' rune page and sets your two summoner spells in champ select (Flash keeps its key)"
      : "Saves an item set for this champion; it shows in the shop in game";
  return (
    <Button variant="primary" small disabled={busy !== null} onClick={() => onImport(kind)} title={title}>
      {busy === kind ? "Importing…" : label}
    </Button>
  );
}

/** A labelled row of item icons with one line of text (the "Vs this team" and quest rows). */
function ItemRow({ label, items, note }: { label: string; items: LoadoutItemView[]; note: string | null }) {
  return (
    <div className="item-row" title={note ?? undefined}>
      <span className="label k">{label}</span>
      <span className="icons">
        {items.map((i) => (
          <ChampIcon key={i.id} champ={i} kind="game" size={22} title={tip(i)} />
        ))}
      </span>
      {note && <span className="caption one-line">{note}</span>}
    </div>
  );
}

/** Runes on their full trees with the page's numbers and import; then spells and the skill grid. */
export function RunesTab({ loadout: l, onImport, busy, importMessage }: LoadoutProps) {
  const label = "Import";
  const button = l.canImport && (l.page || l.spells) ? <ImportButton kind="runes" label={label} busy={busy} onImport={onImport} /> : null;
  const message = importMessage && <span className="caption text">{importMessage}</span>;
  const p = l.page;
  return (
    <>
      {p && (
        <Section
          title="Runes"
          aside={
            <>
              <Stat winRate={p.winRate} n={p.games} title={p.reason ?? undefined} />
              {button}
            </>
          }
        >
          {p.primaryTree && p.secondaryTree ? (
            <RunePage primary={p.primaryTree} secondary={p.secondaryTree} runes={p.runes} shards={p.shardRows} swaps={l.situationalRunes} />
          ) : (
            <div className="icons">
              {[...p.runes, ...p.shards].map((r, i) => (
                <ChampIcon key={`${r.id}-${i}`} champ={r} kind="game" round size={i === 0 ? 30 : 22} />
              ))}
            </div>
          )}
          {message}
        </Section>
      )}
      {(l.spells || l.skills) && (
        <Section title="Summoner spells & skill order" aside={p ? null : button}>
          <SkillGrid spells={l.spells} skills={l.skills} />
          {!p && message}
        </Section>
      )}
    </>
  );
}

/** Start and boots with import; then the items by slot with their numbers, the strongest situational reason, and the extra rows. */
export function BuildTab({ loadout: l, onImport, busy, importMessage }: LoadoutProps) {
  const canImport = l.canImport && (l.items.length > 0 || l.commonPath || l.starting);
  const button = canImport ? <ImportButton kind="items" label="Import item set" busy={busy} onImport={onImport} /> : null;
  const slots: MatrixSlot[] = l.items.length
    ? l.items.slice(0, MATRIX_SLOTS).map((s) => ({ slot: s.slot, minute: s.minute, options: [s.top, ...s.alternatives].map((o) => ({ item: o, share: o.share, winAdded: o.winAdded })) }))
    : (l.commonPath?.items.slice(0, MATRIX_SLOTS).map((item, i) => ({ slot: i + 1, minute: null, options: [{ item, share: null, winAdded: null }] })) ?? []);
  // The most telling reason: a top item bought for this draft (a reason before its numbers line), else the first item's.
  // Only a reason the cells don't already show: a top item bought for this draft.
  const telling = l.items.find((s) => s.top.reasons.length > 1)?.top;
  // Each item once: what the matrix or the Later pool already show isn't repeated under "Vs this team".
  const shown = new Set([...slots.flatMap((s) => s.options.map((o) => o.item.id)), ...l.laterPool.map((i) => i.id)]);
  const vsTeam = l.situational.filter((i) => !shown.has(i.id));
  // With thin data the caption would only repeat the pick rate already in the cells.
  const thin = !l.items.some((s) => s.top.winAdded !== null);
  const caption = thin && l.laterPool.length ? null : telling?.reasons[0] ? `${telling.name}: ${lower(telling.reasons[0])}` : (l.commonPath?.reason ?? null);
  return (
    <>
      <Section title="Starter items & boots" aside={button}>
        <BuildPath starting={l.starting} boots={l.boots} />
        {importMessage && <span className="caption text">{importMessage}</span>}
      </Section>
      <Section title="Core build" aside={
          slots.length > 0 && l.items.length > 0 ? (
            <span className="micro">
              {[l.items.some((s) => s.top.winAdded !== null) ? "pick rate · ★ helps most" : "pick rate", l.spikeSlots.length ? "gold = power spike" : null].filter(Boolean).join(" · ")}
            </span>
          ) : null
        }
      >
        {slots.length > 0 ? <ItemMatrix slots={slots} spikes={l.spikeSlots} /> : <span className="caption">Not enough purchases to rank items yet.</span>}
        {caption && (
          <span className="caption clamp2" title={caption}>
            {caption}
          </span>
        )}
        {l.laterPool.length > 0 && (
          <div className="later">
            <span className="label" title={l.laterNote ?? undefined}>
              Later: pick by situation
            </span>
            {l.laterPool.slice(0, 3).map((i) => (
              <div key={i.id} className="later-row" title={tip(i)}>
                <ChampIcon champ={i} kind="game" size={22} title="" />
                <span className="caption one-line">
                  <span className="text">{i.name}</span>
                  {i.reasons[0] ? ` — ${lower(i.reasons[0])}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        {vsTeam.length > 0 && <ItemRow label="Vs this team" items={vsTeam} note={vsTeam[0]?.reasons[0] ?? null} />}
        {l.quest.length > 0 && <ItemRow label="Quest" items={l.quest} note={l.quest[0]?.reasons[0] ?? null} />}
      </Section>
    </>
  );
}

/** Your champion against their team (your lane first), then with your team. */
/** How this game is likely to go, in a few lines (champions and measured aggregates only). */
export function PlanTab({ pick }: { pick: MyPickView }) {
  return (
    <Section title="Game plan">
      {pick.plan.length ? (
        <ul className="reasons">
          {pick.plan.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="caption">The plan needs the live meta for your rank and your lane opponent's pick.</p>
      )}
    </Section>
  );
}

export function MatchupsTab({ pick }: { pick: MyPickView }) {
  const m = pick.matchups;
  if (!m) {
    return (
      <Section title="Matchups">
        <p className="caption">Matchups need the live meta for your rank.</p>
      </Section>
    );
  }
  return (
    <>
      <Section title="Against their team">
        <MatchupTable rows={m.against} title="Enemy" />
      </Section>
      <Section title="With your team" gold={false}>
        <MatchupTable rows={m.with} title="Ally" />
      </Section>
    </>
  );
}

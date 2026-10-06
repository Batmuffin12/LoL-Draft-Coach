import type { IconView, LoadoutItemView, LoadoutView } from "../../shared/view";
import { Button } from "./Button";
import { ChampIcon } from "./ChampIcon";
import { Section } from "./Section";
import { SkillOrder } from "./SkillOrder";

export type LoadoutTab = "runes" | "build";

export interface LoadoutProps {
  loadout: LoadoutView;
  view: LoadoutTab;
  /** Called only from the player's click on an import button. */
  onImport: (kind: "runes" | "items") => void;
  busy: "runes" | "items" | null;
  importMessage: string | null;
}

const tip = (i: LoadoutItemView) => [i.name, ...i.reasons].join("\n");
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

function ImportButton({ kind, label, busy, onImport }: { kind: "runes" | "items"; label: string; busy: LoadoutProps["busy"]; onImport: LoadoutProps["onImport"] }) {
  const title =
    kind === "runes"
      ? "Creates (or updates) an 'LDC:' rune page and sets your two summoner spells in champ select (Flash keeps its key)"
      : "Saves an item set for this champion; it shows in the shop in game";
  return (
    <Button variant="primary" disabled={busy !== null} onClick={() => onImport(kind)} title={title}>
      {busy === kind ? "Importing…" : label}
    </Button>
  );
}

function IconRow({ icons, size }: { icons: (IconView | LoadoutItemView)[]; size: number }) {
  return (
    <div className="lo-icons">
      {icons.map((i, n) => (
        <ChampIcon key={`${i.id}-${n}`} champ={i} kind="game" size={size} title={"reasons" in i ? tip(i) : i.name} />
      ))}
    </div>
  );
}

/** Runes, shards and the situational swaps; then spells and the skill order. */
function RunesTab({ loadout: l, onImport, busy, importMessage }: Omit<LoadoutProps, "view">) {
  const label = l.page && l.spells ? "Import runes & spells" : l.page ? "Import runes" : "Import spells";
  const button = l.canImport && (l.page || l.spells) ? <ImportButton kind="runes" label={label} busy={busy} onImport={onImport} /> : null;
  const message = importMessage && <span className="caption text">{importMessage}</span>;
  const keystone = l.page?.runes[0];
  return (
    <>
      {l.page && keystone && (
        <Section title="Runes" aside={button}>
          <div className="lo-row center">
            <ChampIcon champ={keystone} kind="game" round size={30} />
            <div className="lo-body">
              <span className="heading">{keystone.name}</span>
              <div className="lo-icons">
                {l.page.runes.slice(1).map((r, i) => (
                  <ChampIcon key={`${r.id}-${i}`} champ={r} kind="game" round size={20} />
                ))}
                {l.page.shards.length > 0 && <span className="divider" aria-hidden="true" />}
                {l.page.shards.map((s, i) => (
                  <ChampIcon key={`s${s.id}-${i}`} champ={s} kind="game" round size={18} />
                ))}
              </div>
            </div>
          </div>
          {l.page.reason && <span className="caption">{l.page.reason}</span>}
          {l.situationalRunes.map((r) => (
            <div key={r.id} className="notice info" title={tip(r)}>
              <span className="g">Swap</span>
              <span>
                <strong>{r.name}</strong>
                {r.reasons[0] ? `: ${lower(r.reasons[0])}` : ""}
              </span>
            </div>
          ))}
          {message}
        </Section>
      )}
      {(l.spells || l.skills) && (
        <Section title="Spells & skills" aside={l.page ? null : button}>
          <div className="two">
            {l.spells ? (
              <div className="lo-body">
                <IconRow icons={l.spells.spells} size={30} />
                <span className="heading">{l.spells.spells.map((s) => s.name).join(" + ")}</span>
              </div>
            ) : (
              <span />
            )}
            {l.skills && <SkillOrder first={l.skills.first} order={l.skills.order} />}
          </div>
          {(l.spells?.reason || l.skills?.reason) && (
            <span className="caption">{[l.spells?.reason, l.skills?.reason && (l.spells?.reason ? `Skills: ${lower(l.skills.reason)}` : l.skills.reason)].filter(Boolean).join(". ")}</span>
          )}
          {!l.page && message}
        </Section>
      )}
    </>
  );
}

/** Start, boots, the core items as numbered tiles, then later and situational items. */
function BuildTab({ loadout: l, onImport, busy, importMessage }: Omit<LoadoutProps, "view">) {
  const canImport = l.canImport && (l.items.length > 0 || l.commonPath || l.starting);
  const button = canImport ? <ImportButton kind="items" label="Import item set" busy={busy} onImport={onImport} /> : null;
  const path: { item: IconView & { reasons?: string[] }; alts: LoadoutItemView[] }[] = l.items.length
    ? l.items.map((s) => ({ item: s.top, alts: s.alternatives }))
    : (l.commonPath?.items.map((item) => ({ item, alts: [] })) ?? []);
  const lead = l.items[0]?.top;
  const unique = (icons: IconView[]) => [...new Set(icons.map((i) => i.name))].join(", ");
  const extras = [
    { label: "Later", icons: l.laterPool, note: l.laterNote },
    { label: "Vs them", icons: l.situational, note: l.situational[0]?.reasons[0] ?? null },
    { label: "Quest", icons: l.quest, note: l.quest[0]?.reasons[0] ?? null },
  ].filter((x) => x.icons.length > 0);
  return (
    <>
      <Section title="Start & boots" aside={button}>
        {l.starting ? (
          <div className="lo-row center" title={l.starting.reason ?? undefined}>
            <IconRow icons={l.starting.items} size={30} />
            <span className="caption one-line">{unique(l.starting.items)}</span>
          </div>
        ) : (
          <span className="caption">No common start yet.</span>
        )}
        {l.boots && (
          <div className="lo-row center">
            <ChampIcon champ={l.boots.top} kind="game" size={30} title={tip(l.boots.top)} />
            <div className="lo-body">
              <span className="heading one-line">{l.boots.top.name}</span>
              {l.boots.top.reasons[0] && <span className="caption">{l.boots.top.reasons[0]}</span>}
            </div>
            {l.boots.alternatives.length > 0 && (
              <span className="alts">
                <span className="micro">or</span>
                {l.boots.alternatives.map((a) => (
                  <ChampIcon key={a.id} champ={a} kind="game" size={20} title={tip(a)} />
                ))}
              </span>
            )}
          </div>
        )}
        {importMessage && <span className="caption text">{importMessage}</span>}
      </Section>
      {(path.length > 0 || extras.length > 0) && (
        <Section title="Core items">
          {path.length > 0 && (
            <div className="path" role="list" aria-label="Build order" style={{ gridTemplateColumns: `repeat(${Math.max(3, Math.min(path.length, 4))}, 1fr)` }}>
              {path.slice(0, 4).map((s, i) => (
                <div key={`${s.item.id}-${i}`} className="step" role="listitem" title={[s.item.name, ...(s.item.reasons ?? [])].join("\n")}>
                  <span className="no">{i + 1}</span>
                  <ChampIcon champ={s.item} kind="game" size={36} />
                  <span className="nm">{s.item.name}</span>
                  {s.alts.length > 0 && (
                    <span className="alt">
                      <span className="or">or</span>
                      {s.alts.map((a) => (
                        <ChampIcon key={a.id} champ={a} kind="game" size={20} title={tip(a)} />
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {lead?.reasons[0] ? (
            <span className="caption">
              {lead.name}: {lower(lead.reasons[0])}
            </span>
          ) : (
            l.commonPath?.reason && <span className="caption">{l.commonPath.reason}</span>
          )}
          {extras.length > 0 && (
            <div className="extras">
          {extras.map((x) => (
            <div key={x.label} className="lo-row center extra" title={x.note ?? undefined}>
              <span className="label k">{x.label}</span>
              <IconRow icons={x.icons} size={20} />
              {x.note && <span className="caption one-line">{x.note}</span>}
            </div>
          ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** The champion's loadout as two tabs. The source line ("From 2,140 games in …") goes in the window footer. */
export function Loadout({ view, ...rest }: LoadoutProps) {
  return view === "runes" ? <RunesTab {...rest} /> : <BuildTab {...rest} />;
}

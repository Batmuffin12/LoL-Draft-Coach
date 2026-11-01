import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { filterExplore, type ExploreChampionView, type ExploreFilter, type ExploreList, type ExploreRow, type ExploreSort, type OwnRecord } from "../../shared/explore";
import type { MatchupRowView, ViewState } from "../../shared/view";
import { ChampIcon } from "../components/ChampIcon";
import { BuildTab, RuneOptions } from "../components/Loadout";
import { MatchupTable } from "../components/MatchupTable";
import { RoleChoice } from "../components/ChoiceGroup";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { SkillGrid } from "../components/SkillGrid";
import { browseEmptyKey, cx, gameCount, games, positionLabel, rate, rateOf, record, roleName, t, tip, winToneOf } from "../format";
import { useFetched, useFitLevel } from "../hooks";

export type DetailTab = "runes" | "build" | "matchups";

/** Browse's state, kept in the lobby: it survives opening a champion and leaving the tab. */
export interface BrowseState {
  filter: ExploreFilter;
  open: { id: number; role: string } | null;
  tab: DetailTab;
}

export const initialBrowse: BrowseState = { filter: { search: "", role: "", sort: "winRate" }, open: null, tab: "runes" };

const SORTS: ExploreSort[] = ["winRate", "pickRate", "banRate", "yours"];

/** When to ask the main process again: the live data or your games changed. */
function exploreKey(state: ViewState): string {
  const { meta, status } = state;
  return [meta?.state === "ready" ? meta.createdAt : "", status.profile.state === "ready" ? status.profile.games : "", status.patch ?? ""].join("|");
}

/** Champions > Browse: the list, or the champion opened from it. */
export function Browse({ state, browse, onBrowse }: { state: ViewState; browse: BrowseState; onBrowse: (next: BrowseState) => void }) {
  const key = exploreKey(state);
  const list = useFetched(() => window.coach.exploreList(), key, null);
  const scrollTop = useRef(0);
  const opened = useRef<string | null>(null);
  if (browse.open) return <ChampionLoader open={browse.open} fetchKey={key} tab={browse.tab} onTab={(tab) => onBrowse({ ...browse, tab })} onBack={() => onBrowse({ ...browse, open: null })} />;
  if (list === undefined) return <Section title={t("tabs.browse")}><p className="caption">{t("explore.loading")}</p></Section>;
  if (list === null) return <Section title={t("tabs.browse")}><p className="caption">{t(browseEmptyKey(state))}</p></Section>;
  return (
    <BrowseList
      list={list}
      filter={browse.filter}
      minGames={state.limits.minGames}
      scrollTop={scrollTop}
      opened={opened}
      onFilter={(filter) => onBrowse({ ...browse, filter })}
      onOpen={(id, role) => onBrowse({ ...browse, open: { id, role }, tab: "runes" })}
    />
  );
}

const rowId = (r: Pick<ExploreRow, "id" | "role">) => `${r.id}|${r.role}`;

/** One champion in a role. A button: the whole row opens it, from the mouse or the keyboard. */
function Row({ row, onOpen }: { row: ExploreRow; onOpen: (row: ExploreRow) => void }) {
  const wr = winToneOf(row.winRate, row.games);
  const label = t("explore.rowLabel", {
    name: row.name,
    role: positionLabel(row.role),
    winRate: rateOf(row.winRate, row.games),
    games: gameCount(row.games),
    pickRate: rate(row.pickRate, 1),
    banRate: rate(row.banRate, 1),
    yours: row.yours?.games ?? 0,
  });
  return (
    <button type="button" className="trow" data-row={rowId(row)} aria-label={label} onClick={() => onOpen(row)}>
      <span className="c-champ">
        <ChampIcon champ={row} size={28} title="" lazy />
        <span className="nm col">
          {row.name}
          <span className="why">{`${positionLabel(row.role)} · ${gameCount(row.games)}`}</span>
        </span>
      </span>
      <span className={cx("c-num", wr)}>{rateOf(row.winRate, row.games)}</span>
      <span className="c-num plain">{rate(row.pickRate, 1)}</span>
      <span className="c-num plain">{rate(row.banRate, 1)}</span>
      <span className={cx("c-num plain", !row.yours && "muted")}>{row.yours ? games(row.yours.games) : "·"}</span>
    </button>
  );
}

/** Only redrawn when the rows change, not on every state the panel receives. */
const Rows = memo(function Rows({ rows, onOpen }: { rows: ExploreRow[]; onOpen: (row: ExploreRow) => void }) {
  return (
    <>
      {rows.map((r) => (
        <Row key={rowId(r)} row={r} onOpen={onOpen} />
      ))}
    </>
  );
});

/** Search, role and sort over a list that scrolls inside its own area: the page stays fixed. Says whose numbers these are. */
export function BrowseList({
  list,
  filter,
  minGames,
  scrollTop,
  opened,
  onFilter,
  onOpen,
}: {
  list: ExploreList;
  filter: ExploreFilter;
  minGames: number;
  /** Where the list was, and the row last opened: Back returns to them. */
  scrollTop: MutableRefObject<number>;
  opened: MutableRefObject<string | null>;
  onFilter: (filter: ExploreFilter) => void;
  onOpen: (id: number, role: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sort = !list.hasBans && filter.sort === "banRate" ? "winRate" : filter.sort;
  const rows = useMemo(() => filterExplore(list.rows, { ...filter, sort }, minGames), [list.rows, filter, sort, minGames]);
  const open = useRef(onOpen);
  open.current = onOpen;
  const openRow = useRef((r: ExploreRow) => {
    opened.current = rowId(r);
    open.current(r.id, r.role);
  }).current;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollTop = scrollTop.current;
    if (opened.current) el.querySelector<HTMLElement>(`[data-row="${opened.current}"]`)?.focus({ preventScroll: true });
    opened.current = null;
  }, []);
  const change = (next: Partial<ExploreFilter>) => {
    scrollTop.current = 0;
    if (box.current) box.current.scrollTop = 0;
    onFilter({ ...filter, ...next });
  };
  const where = filter.role ? positionLabel(filter.role) : t("explore.all");
  return (
    <Section className="explore">
      <input type="search" className="search" placeholder={t("explore.search")} aria-label={t("explore.search")} value={filter.search} onChange={(e) => change({ search: e.target.value })} />
      <RoleChoice all roles={list.roles} value={filter.role} onChange={(role) => change({ role })} />
      <span className="micro" {...tip(t("explore.sourceTip", { patch: list.patch ?? "—" }))}>
        {t("explore.source", { rank: list.rank, games: games(list.matches), n: list.matches })}
      </span>
      <div className="table explore-table">
        <div className="thead">
          <span>{t("explore.col.champion")}</span>
          {SORTS.map((s) => {
            const off = s === "banRate" && !list.hasBans;
            return (
              <button key={s} type="button" className={cx("sort", s === sort && "on")} aria-pressed={s === sort} disabled={off} {...tip(off ? t("explore.tip.noBans") : t(`explore.tip.${s}`))} onClick={() => change({ sort: s })}>
                {t(`explore.col.${s}`)}
              </button>
            );
          })}
        </div>
        <div className="explore-list" ref={box} onScroll={(e) => (scrollTop.current = e.currentTarget.scrollTop)}>
          <Rows rows={rows} onOpen={openRow} />
          {rows.length === 0 && (
            <p className="caption none">
              {!filter.search ? t("explore.noRows", { role: where }) : filter.role ? t("explore.noMatchRole", { search: filter.search, role: where }) : t("explore.noMatch", { search: filter.search })}{" "}
              {filter.search && (
                <button type="button" className="foot-link" onClick={() => change({ search: "" })}>
                  {t("explore.clear")}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Your record on a champion in a word: games, wins–losses and win rate (neutral and whole below the shared minimum). */
function OwnLine({ own }: { own: OwnRecord }) {
  const wr = own.wins / own.games;
  return (
    <span className="micro end-note" {...tip(t("explore.youTip"))}>
      {t("explore.you", { games: gameCount(own.games), record: record(own.games, own.wins), rate: rateOf(wr, own.games) })}
    </span>
  );
}

function ChampionLoader({ open, fetchKey, tab, onTab, onBack }: { open: { id: number; role: string }; fetchKey: string; tab: DetailTab; onTab: (tab: DetailTab) => void; onBack: () => void }) {
  const view = useFetched(() => window.coach.exploreChampion(open.id, open.role), `${open.id}|${open.role}|${fetchKey}`, null);
  if (view) return <ChampionPage view={view} tab={tab} onTab={onTab} onBack={onBack} />;
  return (
    <Section>
      <BackButton onBack={onBack} />
      <p className="caption">{t(view === null ? "explore.gone" : "explore.loading")}</p>
    </Section>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // Opened from the keyboard: focus starts here, where the row's button used to be.
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <button type="button" ref={ref} className="btn ghost small back" onClick={onBack}>
      {`‹ ${t("explore.back")}`}
    </button>
  );
}

/** A champion in a role: its numbers and your record, then runes, build and matchups. Everything fits without scrolling. */
export function ChampionPage({ view: v, tab, onTab, onBack }: { view: ExploreChampionView; tab: DetailTab; onTab: (tab: DetailTab) => void; onBack: () => void }) {
  const wr = winToneOf(v.winRate, v.games);
  // Builds take in the rank above for more games; everything else here is your rank alone. Each tab says which it shows.
  const builds = tab !== "matchups" && v.loadout !== null;
  const note = builds ? t("explore.buildsFrom", { source: v.loadout!.source }) : t("explore.playersIn", { rank: v.rank });
  return (
    <>
      <section className="section explore-head">
        <div className="explore-who">
          <BackButton onBack={onBack} />
          <ChampIcon champ={v.champion} size={32} />
          <span className="t-heading">{v.champion.name}</span>
          <span className="micro">{positionLabel(v.role)}</span>
          {v.yours && <OwnLine own={v.yours} />}
        </div>
        <div className="explore-stats">
          <span>
            <b className={wr === "flat" ? undefined : wr}>{rateOf(v.winRate, v.games)}</b> {t("explore.stat.winRate")}
          </span>
          <span>
            <b>{rate(v.pickRate, 1)}</b> {t("explore.stat.pickRate")}
          </span>
          <span>
            <b>{rate(v.banRate, 1)}</b> {t("explore.stat.banRate")}
          </span>
          <span>
            <b>{games(v.games)}</b> {t("explore.stat.games", { n: v.games })}
          </span>
        </div>
      </section>
      <Segmented<DetailTab>
        options={[
          { value: "runes", label: t("runes.tab") },
          { value: "build", label: t("build.tab") },
          { value: "matchups", label: t("matchups.tab") },
        ]}
        value={tab}
        onChange={onTab}
        end={note}
        endTitle={builds && v.loadout!.sourceAbove ? t("explore.buildsTip", { rank: v.rank }) : undefined}
      />
      {tab === "matchups" ? <Matchups view={v} /> : v.loadout ? tab === "runes" ? <Runes view={v} /> : <Build view={v} /> : <Section><p className="caption">{t("explore.noBuild", { champion: v.champion.name, role: roleName(v.role) })}</p></Section>}
    </>
  );
}

/** The pages players take, under a switch; each with how many take it and how it does. */
function Runes({ view: v }: { view: ExploreChampionView }) {
  const [key, setKey] = useState<string | null>(null);
  const page = v.pages.find((p) => p.key === key) ?? v.pages[0];
  return (
    <>
      {v.loadout?.thinNote && (
        <Section>
          <p className="caption">{v.loadout.thinNote}</p>
        </Section>
      )}
      {page ? <RuneOptions page={page} options={v.pages.length > 1 ? v.pages : []} choose={setKey} /> : <Section><p className="caption">{t("explore.noBuild", { champion: v.champion.name, role: roleName(v.role) })}</p></Section>}
    </>
  );
}

/** Spells, skills, the most taken path, then the items one by one with their pick rate and win added. */
function Build({ view: v }: { view: ExploreChampionView }) {
  const l = v.loadout!;
  // With a notice above, the screen runs short: the core build goes, since the path below shows its items too, then the skills' level grid, keeping their max order.
  const level = useFitLevel(v.champion.id, 3);
  const core = l.items.length > 0 && level < 2 ? v.core : null;
  return (
    <>
      {(l.spells || l.skills) && (
        <Section>
          <SkillGrid spells={l.spells} skills={l.skills} noGrid={level > 2} />
        </Section>
      )}
      {core && (
        <Section className="core-row">
          <span className="label">{t("explore.core")}</span>
          <span className="icons">
            {core.items.map((i) => (
              <ChampIcon key={i.id} champ={i} kind="game" size={24} />
            ))}
          </span>
          <span className="micro end-note">{t("explore.coreShare", { rate: rate(core.share), count: gameCount(core.games) })}</span>
        </Section>
      )}
      <BuildTab loadout={l} winAdded />
    </>
  );
}

/** The lane opponents it does best and worst against, with games, and what + and − mean. */
function Matchups({ view: v }: { view: ExploreChampionView }) {
  // A long screen: the note moves to hover over the heads; with a notice above too, one row less each way.
  const level = useFitLevel(v.champion.id, 2);
  const rows = (list: MatchupRowView[]) => (level > 1 ? list.slice(0, -1) : list);
  const [best, worst] = [rows(v.matchups.best), rows(v.matchups.worst)];
  if (!v.matchups.best.length && !v.matchups.worst.length) return <Section><p className="caption">{t("explore.noMatchups")}</p></Section>;
  const note = t("explore.matchupsNote");
  return (
    <>
      {level === 0 && (
        <Section>
          <p className="micro">{note}</p>
        </Section>
      )}
      {best.length > 0 && (
        <Section title={t("explore.best")} aside={level > 0 ? <span className="micro" {...tip(note)}>{t("matchups.note")}</span> : undefined}>
          <MatchupTable rows={best} />
        </Section>
      )}
      {worst.length > 0 && (
        <Section title={t("explore.worst")}>
          <MatchupTable rows={worst} />
        </Section>
      )}
    </>
  );
}

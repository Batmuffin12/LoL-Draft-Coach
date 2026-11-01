import { useMemo, useState } from "react";
import { championRecords, filterMyGames, kda, type ChampionRecord, type MyGameRow, type MyGames as MyGamesData, type MyGamesFilter } from "../../shared/explore";
import type { ChampView, ViewState } from "../../shared/view";
import { ChampIcon } from "../components/ChampIcon";
import { Pills } from "../components/Pills";
import { Section } from "../components/Section";
import { cx, gameCount, lobbyEmpty, positionLabel, rateOf, record, shortDate, t, tip, winToneOf } from "../format";
import { useFetched } from "../hooks";

/** Rows drawn at once: a long history adds more on request, so opening the tab stays quick. */
const PAGE = 200;

type View = "recent" | "champions";

/** Me > My games: your own games from the history on this PC, so it works with the client closed. */
export function MyGames({ state }: { state: ViewState }) {
  const { profile } = state.status;
  const key = profile.state === "ready" ? `ready|${profile.games}` : profile.state;
  const data = useFetched(() => window.coach.exploreGames(), key, null);
  if (data === undefined) return <Section title={t("tabs.games")}><p className="caption">{t("explore.loading")}</p></Section>;
  if (!data?.games.length) return <Section title={t("tabs.games")}><p className="caption">{lobbyEmpty(state.status, "games")}</p></Section>;
  return <MyGamesList data={data} now={Date.now()} />;
}

const noChampion: ChampView = { id: 0, name: "", iconUrl: null };

function GameRow({ game: g, champion, now }: { game: MyGameRow; champion: ChampView; now: number }) {
  const date = shortDate(g.endedAt, now);
  const minutes = g.durationSec / 60;
  const result = t(g.win ? "games.win" : "games.loss");
  return (
    <div className="trow" role="listitem" aria-label={t("games.rowLabel", { name: champion.name, role: positionLabel(g.role), date, result, kills: g.kills, deaths: g.deaths, assists: g.assists, cs: g.cs })}>
      <span className="c-champ">
        <ChampIcon champ={champion} size={28} title="" lazy />
        <span className="nm col">
          {champion.name}
          <span className="why">{[positionLabel(g.role), date].filter(Boolean).join(" · ")}</span>
        </span>
      </span>
      <span className={cx("c-num plain", g.win ? "pos" : "neg")}>{result}</span>
      <span className="c-num plain">{`${g.kills}/${g.deaths}/${g.assists}`}</span>
      <span className="c-num plain" {...tip(t("games.csTip", { cs: g.cs, minutes: Math.round(minutes), perMinute: minutes > 0 ? (g.cs / minutes).toFixed(1) : "—" }))}>
        {g.cs}
      </span>
    </div>
  );
}

function RecordRow({ row: r, champion, onShow }: { row: ChampionRecord; champion: ChampView; onShow: () => void }) {
  const wr = r.wins / r.games;
  const tone = winToneOf(wr, r.games);
  return (
    <button type="button" className="trow" aria-label={t("games.championLabel", { name: champion.name, games: gameCount(r.games), record: record(r.games, r.wins), rate: rateOf(wr, r.games) })} onClick={onShow}>
      <span className="c-champ">
        <ChampIcon champ={champion} size={28} title="" lazy />
        <span className="nm">{champion.name}</span>
      </span>
      <span className="c-num plain">{r.games}</span>
      <span className="c-num plain">{record(r.games, r.wins)}</span>
      <span className={cx("c-num plain", tone)}>{rateOf(wr, r.games)}</span>
      <span className="c-num plain">{kda(r).toFixed(1)}</span>
    </button>
  );
}

/** Your games or your record per champion, with filters for champion and role, in a list that scrolls inside its own area. */
export function MyGamesList({ data, now }: { data: MyGamesData; now: number }) {
  const [view, setView] = useState<View>("recent");
  const [filter, setFilter] = useState<MyGamesFilter>({ championId: 0, role: "" });
  const [shown, setShown] = useState(PAGE);
  const champions = useMemo(() => new Map(data.champions.map((c) => [c.id, c])), [data.champions]);
  const inRole = useMemo(() => filterMyGames(data.games, { championId: 0, role: filter.role }), [data.games, filter.role]);
  const games = useMemo(() => filterMyGames(inRole, { championId: filter.championId, role: "" }), [inRole, filter.championId]);
  const records = useMemo(() => championRecords(view === "champions" ? games : inRole), [view, games, inRole]);
  const change = (next: Partial<MyGamesFilter>) => {
    setShown(PAGE);
    setFilter((f) => ({ ...f, ...next }));
  };
  const champion = (id: number) => champions.get(id) ?? noChampion;
  const wins = games.filter((g) => g.win).length;
  const left = games.length - shown;
  return (
    <Section className="explore">
      <Pills<View>
        compact
        label={t("games.views")}
        options={[
          { value: "recent", label: t("games.recent") },
          { value: "champions", label: t("games.byChampion") },
        ]}
        value={view}
        onChange={setView}
        end={games.length ? t("games.summary", { games: gameCount(games.length), rate: rateOf(wins / games.length, games.length) }) : ""}
      />
      <div className="games-filters">
        <select className="select" aria-label={t("label.champion")} value={filter.championId} onChange={(e) => change({ championId: Number(e.target.value) })}>
          <option value={0}>{t("games.allChampions")}</option>
          {championRecords(inRole).map((r) => (
            <option key={r.championId} value={r.championId}>{`${champion(r.championId).name} (${r.games})`}</option>
          ))}
        </select>
        <Pills compact label={t("label.role")} options={[{ value: "", label: t("explore.all") }, ...data.roles.map((r) => ({ value: r, label: positionLabel(r) }))]} value={filter.role} onChange={(role) => change({ role })} />
      </div>
      {games.length === 0 ? (
        <p className="caption none">
          {t("games.noMatch")}{" "}
          <button type="button" className="foot-link" onClick={() => change({ championId: 0, role: "" })}>
            {t("games.clear")}
          </button>
        </p>
      ) : view === "recent" ? (
        <div className="table games-table">
          <div className="thead">
            <span>{t("games.col.champion")}</span>
            <span className="c-num">{t("games.col.result")}</span>
            <span className="c-num">{t("games.col.kda")}</span>
            <span className="c-num">{t("games.col.cs")}</span>
          </div>
          <div className="explore-list" role="list">
            {games.slice(0, shown).map((g) => (
              <GameRow key={g.matchId} game={g} champion={champion(g.championId)} now={now} />
            ))}
            {left > 0 && (
              <button type="button" className="foot-link more" onClick={() => setShown((n) => n + PAGE)}>
                {t("games.more", { n: Math.min(left, PAGE) })}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="table records-table">
          <div className="thead">
            <span>{t("games.col.champion")}</span>
            <span className="c-num">{t("games.col.games")}</span>
            <span className="c-num">{t("games.col.record")}</span>
            <span className="c-num">{t("label.winRate")}</span>
            <span className="c-num">{t("games.col.kda")}</span>
          </div>
          <div className="explore-list">
            {records.map((r) => (
              <RecordRow
                key={r.championId}
                row={r}
                champion={champion(r.championId)}
                onShow={() => {
                  change({ championId: r.championId });
                  setView("recent");
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

import { POOL_COLUMNS, type ViewState } from "../../shared/view";
import { Button } from "../components/Button";
import { ChampIcon } from "../components/ChampIcon";
import { Facts } from "../components/Facts";
import { RoleChoice } from "../components/ChoiceGroup";
import { PoolCoverage, PoolLegend } from "../components/PoolCoverage";
import { Section } from "../components/Section";
import { gameCount, lobbyEmpty, pct, roleName, t, tip } from "../format";
import { useFitLevel, useRolePill } from "../hooks";

/** Your pool per role: what each champion covers against what a team needs, then your next step. */
export function Pool({ state, onNewChamps }: { state: ViewState; onNewChamps: () => void }) {
  // Roles with too few games to judge have no pool to show: left out, so the others fit.
  const list = state.roles.filter((r) => r.enoughData);
  const [sub, setSub] = useRolePill(list.map((r) => r.role));
  // A big pool: first the extra champions' names move to hover, then the legend and the note under what's missing.
  const level = useFitLevel(sub, 2);
  if (!list.length) return <Section title={t("pool.head")}><p className="caption">{lobbyEmpty(state.status, "pool", { n: state.limits.poolGames })}</p></Section>;
  const stats = (r: ViewState["roles"][number]) => `${gameCount(r.games)} · ${pct(r.winRate)} WR`;
  const r = list.find((x) => x.role === sub) ?? list[0]!;
  const columns = r.pool.slice(0, POOL_COLUMNS);
  const next = r.nextStep;
  return (
    <>
      <section className="section">
        <RoleChoice
          roles={list.map((x) => x.role)}
          about={(role) => {
            const x = list.find((y) => y.role === role)!;
            return [stats(x), x.pool.slice(0, 3).map((c) => c.champion.name).join(", ")].filter(Boolean).join(" · ");
          }}
          value={r.role}
          onChange={setSub}
          end={stats(r)}
        />
        {columns.length > 0 && r.coverage ? (
          <>
            <PoolCoverage pool={columns} coverage={r.coverage} />
            {r.also.length > 0 && <Facts rows={r.also} iconOnly={level > 0} wide />}
            {level < 2 && <PoolLegend />}
          </>
        ) : (
          <p className="caption">{t("pool.none", { role: roleName(r.role) })}</p>
        )}
      </section>
      <Section title={t("pool.next")} gold>
        {next && (
          <div className="you next-step" {...tip(next.evidence)}>
            <ChampIcon champ={next.champion} size={34} />
            <span className="who">
              <span className="t-heading gold-bright">{next.title}</span>
              <Facts rows={[next.adds]} flow />
            </span>
          </div>
        )}
        {r.missing ? (
          <div className="missing">
            <span className="who" {...tip(level < 2 ? null : r.missing.note)}>
              <Facts rows={[r.missing.row]} flow />
              {level < 2 && <span className="micro">{r.missing.note}</span>}
            </span>
            <Button onClick={onNewChamps}>{t("pool.seeNew")}</Button>
          </div>
        ) : (
          !next && <span className="caption">{r.noGaps}</span>
        )}
      </Section>
    </>
  );
}

import { formatMetric, metricLabel, renderReason, spikeReason, type ExplainConfig, type LearningMatchup, type LearningPlan, type NewChampAdvice } from "@ldc/engine";
import type { Reason } from "@ldc/shared";
import type { ChampView, FactItem, FactRow, LearnView, NewChampRoleView } from "../shared/view";

export interface NewChampsViewDeps {
  explain: ExplainConfig;
  champion: (id: number) => ChampView | null;
  championName: (id: number) => string;
  /** "Try it in 3 to 5 Normal Draft games." */
  /** Item names for spike lines ("#id" when unknown). */
  itemName?: (id: number) => string;
  planGames: [number, number];
  /** "Play it in blocks of 2 to 3 games." */
  blockGames: [number, number];
  /** How to learn a champion in the role (stage, focus, matchups, power curve); null without data. */
  plan: (championId: number) => LearningPlan | null;
  /** Thresholds for "how it plays" (percentiles) and the gold gap at 15 that counts as even. */
  learn?: { profile: { high: number; low: number }; laneGoldEven: number };
}

const EASE = { 1: "easy", 2: "medium", 3: "hard" } as const;
/** Reasons the table's columns already show. */
const COLUMN_REASONS = /^newchamp\.(meta|ease\.)/;
/** What a first look at a champion can do without when room is short: how to skill it, how it wins and its matchups stay. */
const MINOR_ROWS = new Set(["profile", "spike", "timing", "curve", "gold", "record"]);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A learning plan as the New tab shows it: the stage, the one thing to watch next game, then
 * only what the data says about this champion: how it wins in your rank (with your numbers on
 * it), when it's strong, its matchups and your record on it. No generic advice.
 */
export function learnView(p: LearningPlan, role: string, championId: number, deps: Pick<NewChampsViewDeps, "explain" | "champion" | "championName" | "itemName" | "blockGames" | "learn">): LearnView {
  const { explain } = deps;
  const t = explain.templates;
  const say = (r: Reason) => renderReason(r, t, deps.championName, deps.itemName ? { item: deps.itemName } : {});
  const sayId = (id: string, slots: Reason["slots"] = {}) => say({ id, slots });
  const pct = (v: number) => {
    const s = (v * 100).toFixed(1);
    return v > 0 ? `+${s}%` : `${s.replace("-", "\u2212")}%`;
  };
  const champions = (xs: LearningMatchup[]): FactItem[] => xs.map((x) => ({ text: `${deps.championName(x.championId)} ${pct(x.deltaWin)}`, champion: deps.champion(x.championId) }));

  let focus: LearnView["focus"] = null;
  if (p.focus) {
    const f = p.focus;
    const fmt = (v: number) => formatMetric(v, f.metric, explain);
    const slots = {
      metric: metricLabel(f.metric, explain),
      role,
      goal: say({ id: `growth.goal.${f.lowerIsBetter ? "less" : "more"}`, slots: { target: fmt(f.target) } }),
      value: f.value === null ? "" : fmt(f.value),
      usual: f.usual === null ? "" : fmt(f.usual),
    };
    const id = f.source === "drop" ? "newchamp.focus.drop" : `newchamp.focus.${f.source}${f.value === null ? "" : ".value"}`;
    focus = { text: say({ id, slots }), recent: f.recent };
  }

  const lines: FactRow[] = [];
  /** A row of plain text entries, each starting with a capital. */
  const row = (label: string, ...items: (string | null)[]) => {
    const minor = MINOR_ROWS.has(label) ? { minor: true } : {};
    lines.push({ label: sayId(`newchamp.label.${label}`), items: items.filter((x): x is string => x !== null).map((x) => ({ text: capitalize(x) })), ...minor });
  };
  const cfgLearn = deps.learn;
  // How it plays: only what stands out (a damage type that dominates, high or low frontline and crowd control).
  if (p.profile && cfgLearn) {
    const { high, low } = cfgLearn.profile;
    const trait = (id: string) => sayId(`newchamp.profile.${id}`);
    row(
      "profile",
      trait(p.profile.physical >= high ? "physical" : p.profile.magic >= high ? "magic" : "mixed"),
      p.profile.frontline >= high ? trait("tanky") : p.profile.frontline <= low ? trait("fragile") : null,
      p.profile.engage >= high ? trait("cc") : p.profile.engage <= low ? trait("nocc") : null,
    );
  }
  if (p.skills) {
    const key = (slot: number) => t[`skill.key.${slot}`] ?? String(slot);
    row("skills", sayId("newchamp.learn.skills.first", { first: p.skills.first.map(key).join(", ") }), sayId("newchamp.learn.skills.order", { order: p.skills.order.map(key).join(", then "), share: p.skills.share }));
  }
  if (p.wins.length) {
    row(
      "wins",
      ...p.wins.map((w) => {
        const fmt = (v: number) => formatMetric(v, w.metric, explain);
        return sayId(`newchamp.learn.win.${w.lowerIsBetter ? "less" : "more"}${w.you === null ? "" : ".you"}`, { metric: metricLabel(w.metric, explain), winners: fmt(w.winners), losers: fmt(w.losers), you: w.you === null ? "" : fmt(w.you) });
      }),
    );
  }
  // Its measured spikes, and your own first-item timing on it (both only when measured).
  if (p.spikes.length) row("spike", ...p.spikes.flatMap((s) => [say(spikeReason(s, "learn", championId)), sayId(`spike.learn.do.${s.kind}`)]));
  if (p.timing) {
    const { games, you, typical, slow } = p.timing;
    row(
      "timing",
      sayId("newchamp.learn.timing.you", { games, you: you.toFixed(1) }),
      typical === null ? null : sayId("newchamp.learn.timing.typical", { typical: typical.toFixed(1) }),
      typical !== null && slow ? sayId("newchamp.learn.timing.slow") : null,
    );
  }
  if (p.curve) row("curve", sayId(p.curve.late ? "newchamp.learn.late" : "newchamp.learn.early"), sayId("newchamp.learn.curve.rates", { early: p.curve.early, late: p.curve.lateRate }));
  else if (p.evenCurve) row("curve", sayId("newchamp.learn.evenCurve"), sayId("newchamp.learn.curve.rates", { early: p.evenCurve.early, late: p.evenCurve.late }));
  if (p.good.length) lines.push({ label: sayId("newchamp.label.good"), items: champions(p.good) });
  if (p.hard.length) lines.push({ label: sayId("newchamp.label.hard"), items: champions(p.hard) });
  if (p.evenMatchups) row("even", sayId("newchamp.learn.evenMatchups", { role, count: p.evenMatchups }), sayId("newchamp.learn.evenMatchups.blind"));
  if (p.laneGold && cfgLearn) {
    const gold = Math.round(Math.abs(p.laneGold.diff));
    const even = gold < cfgLearn.laneGoldEven;
    const behind = !even && p.laneGold.diff < 0;
    row("gold", sayId(even ? "newchamp.learn.gold.even" : behind ? "newchamp.learn.gold.behind" : "newchamp.learn.gold.ahead", { gold, role }), behind ? sayId("newchamp.learn.gold.later") : null);
  }
  if (p.record.games > 0) row("record", sayId("newchamp.learn.record", { wins: p.record.wins, losses: p.record.games - p.record.wins }));
  return { stage: sayId(`newchamp.stage.${p.stage}.label`), focus, lines };
}

/** New champions for a role as the lobby shows them, with how to learn the one you're on or the top one. */
export function newChampsView(a: NewChampAdvice, deps: NewChampsViewDeps): NewChampRoleView {
  const say = (r: Reason) => renderReason(r, deps.explain.templates, deps.championName);
  const top = a.picks[0];
  const learnOf = (id: number) => {
    const p = deps.plan(id);
    return p ? learnView(p, a.role, id, deps) : null;
  };
  let plan: string | null = null;
  let planLearn: LearnView | null = null;
  let learning: NewChampRoleView["learning"] = null;
  if (a.learning) {
    const { championId, progress: p } = a.learning;
    learning = {
      title: say({ id: "newchamp.learning", slots: { champion: championId } }),
      champion: deps.champion(championId),
      progress: p
        ? say({ id: p.daysLeft === 1 ? "newchamp.learning.progress.oneDay" : "newchamp.learning.progress", slots: { games: Math.min(p.games, p.maxGames), max: p.maxGames, days: p.daysLeft } })
        : null,
      // The build is left out: champ select shows it when you play the champion.
      learn: learnOf(championId) ?? { stage: "", focus: null, lines: [] },
      after: say({ id: "newchamp.after", slots: { champion: championId } }),
      why: say({ id: "newchamp.after.why", slots: {} }),
    };
  } else if (top) {
    const [from, to] = deps.planGames;
    plan = say({ id: "newchamp.plan", slots: { champion: top.championId, from, to } });
    planLearn = learnOf(top.championId);
  }
  return {
    role: a.role,
    picks: a.picks.flatMap((p) => {
      const champion = deps.champion(p.championId);
      if (!champion) return [];
      return [
        {
          champion,
          like: p.like !== null ? deps.champion(p.like) : null,
          winRate: p.winRate,
          games: p.games,
          ease: p.ease,
          easeLabel: say({ id: `newchamp.easeShort.${EASE[p.ease]}`, slots: {} }),
          owned: p.owned,
          // The line under the row says only what the columns don't: a pool gap it fills, "not owned"
          // (Plays like, Win % and Difficulty are columns; with no "plays like" match that reason stays).
          reasons: p.reasons.filter((r) => !COLUMN_REASONS.test(r.id) && !(p.like !== null && r.id === "newchamp.like")).map(say),
        },
      ];
    }),
    learning,
    plan,
    planLearn,
  };
}

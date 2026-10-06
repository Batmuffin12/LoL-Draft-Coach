import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AdviceRecord, ParticipantSummary, UserMatch } from "@ldc/shared";
import { adviceOutcome, parseExplainConfig, renderReason } from "../src/index";

const explain = parseExplainConfig(JSON.parse(readFileSync(new URL("../../../config/explain.v1.json", import.meta.url), "utf8")));
const name = (id: number) => ({ 103: "Ahri", 99: "Lux", 245: "Ekko" })[id] ?? `#${id}`;
const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, explain.templates, name);

const term = (n: "lane" | "personal" | "team" | "meta", deltaWin: number) => ({ name: n, rating: deltaWin * 4, deltaWin, games: 100 });
const record = (pick: number, over: Partial<AdviceRecord> = {}): AdviceRecord => ({
  gameId: 7123456789,
  queueId: 420,
  role: "middle",
  band: 2,
  lockedAt: 1000,
  pick: { championId: pick, expectedWin: pick === 103 ? 0.54 : 0.49, terms: pick === 103 ? [term("lane", 0.021), term("personal", -0.006)] : [term("team", -0.011), term("lane", 0.004)] },
  shown: [
    { championId: 103, expectedWin: 0.54, terms: [] },
    { championId: 245, expectedWin: 0.52, terms: [] },
    { championId: 99, expectedWin: 0.51, terms: [] },
  ],
  ...over,
});
const participant = (championId: number, win: boolean): ParticipantSummary =>
  ({ championId, teamId: 100, position: "middle", win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0, physicalDamage: 0, magicDamage: 0, trueDamage: 0, damageTaken: 0, selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0 }) as ParticipantSummary;
const match = (id: string, championId: number, win: boolean): UserMatch => ({
  match: { matchId: id, queueId: 420, gameVersion: "16.19.1", endedAt: 5000, durationSec: 1870, participants: [participant(1, !win), participant(championId, win)] },
  me: 1,
});

describe("adviceOutcome", () => {
  it("joins the advice with your game by the client's game id and describes the draft", () => {
    const o = adviceOutcome(record(103), [match("EUW1_1", 103, false), match("EUW1_7123456789", 103, true)], 0.003);
    expect(o.game).toEqual({ matchId: "EUW1_7123456789", win: true, minutes: 31, endedAt: 5000 });
    expect(o.rank).toBe(1);
    expect(o.lines.map(say)).toEqual(["Biggest plus: your lane matchup (+2.1%)", "Win chance when you locked in: 54%"]);
  });

  it("says where your pick was, or that it was your own; costs are caveats", () => {
    const own = adviceOutcome(record(157), [], 0.003);
    expect(own.game).toBeNull();
    expect(own.rank).toBe(0);
    expect(own.lines[0]!.id).toBe("postgame.team.bad");
    expect(own.lines.map(say)).toEqual(["Biggest minus: what your team needed (-1.1%)", "Win chance when you locked in: 49% (the #1 suggestion, Ahri, had 54%)"]);
    expect(adviceOutcome(record(99), [], 0.003).rank).toBe(3);
  });

  it("leaves out terms too small to matter and predictions the engine didn't make", () => {
    const r = record(103, { pick: { championId: 103, expectedWin: null, terms: [term("lane", 0.001)] } });
    expect(adviceOutcome(r, [], 0.003).lines).toEqual([]);
  });
});

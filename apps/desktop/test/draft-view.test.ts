import { describe, expect, it } from "vitest";
import type { DraftAction, DraftState } from "@ldc/shared";
import { PhaseLength, toDraftView } from "../src/main/draft-view";

const action = (id: number, inProgress: boolean): DraftAction => ({ id, type: "pick", actorCellId: id, championId: 0, completed: false, inProgress, isAllyAction: true });
const draft = (timeLeftMs: number, timerPhase = "BAN_PICK", actions: DraftAction[] = [action(1, true)]): DraftState => ({
  timerPhase,
  timeLeftMs,
  isCustomGame: true,
  localCellId: 1,
  myTeam: [],
  theirTeam: [],
  myBans: [],
  theirBans: [],
  actions,
});

describe("PhaseLength", () => {
  it("keeps the first time left seen in a phase while the timer runs down", () => {
    const phase = new PhaseLength();
    expect(phase.observe(draft(30_000))).toBe(30_000);
    expect(phase.observe(draft(21_500))).toBe(30_000);
    expect(phase.observe(draft(4_000))).toBe(30_000);
  });

  it("starts a new length on the next turn, the next timer phase or a reset timer", () => {
    const phase = new PhaseLength();
    phase.observe(draft(30_000));
    expect(phase.observe(draft(27_000, "BAN_PICK", [action(1, false), action(2, true)]))).toBe(27_000);
    expect(phase.observe(draft(10_000, "FINALIZATION", []))).toBe(10_000);
    expect(phase.observe(draft(12_000, "FINALIZATION", []))).toBe(12_000);
    phase.reset();
    expect(phase.observe(draft(5_000, "FINALIZATION", []))).toBe(5_000);
  });
});

describe("toDraftView", () => {
  it("shows the phase length in whole seconds", () => {
    expect(toDraftView(draft(19_400), () => undefined, 0, 30_000).totalSeconds).toBe(30);
    // Without a remembered length, the time left is the length.
    expect(toDraftView(draft(19_400), () => undefined, 0).totalSeconds).toBe(19);
  });
});

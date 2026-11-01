import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { PhaseBar } from "../src/renderer/components/PhaseBar";
import { ago, setCopy, t } from "../src/renderer/format";
import { waitingText } from "../src/renderer/screens/ChampSelectScreen";
import { metaChip } from "../src/renderer/screens/common";
import { ConnectScreen } from "../src/renderer/screens/ConnectScreen";
import { emptyViewState, type AccountView, type DraftView, type ViewState } from "../src/shared/view";

const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
const MIN = 60_000;

beforeAll(() => setCopy(copy));

describe("panel wording", () => {
  it("every fixed key the renderer names is in the explain config", () => {
    const dir = join(__dirname, "../src/renderer");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f));
    const keys = files.flatMap((f) => [...readFileSync(join(dir, f), "utf8").matchAll(/\bt\(\s*"([\w.]+)"/g)].map((m) => m[1]!));
    expect(keys.length).toBeGreaterThan(50);
    expect([...new Set(keys)].filter((k) => copy[k] === undefined)).toEqual([]);
  });

  it("the chip always says Patch, and the hover says your rank, not a band number", () => {
    const meta: ViewState["meta"] = { state: "ready", band: 2, patch: "16.19", matches: 1240, createdAt: 0, offline: false };
    expect(metaChip(null, "16.18", 0).text).toBe("Patch 16.18");
    const ready = metaChip(meta, "16.18", 30 * MIN);
    expect(ready.text).toBe("Patch 16.19");
    expect(ready.title).toBe("Live data for your rank: 1,240 recent ranked games, updated 30 min ago");
    expect(ready.title).not.toMatch(/band/);
    expect(metaChip({ ...meta, offline: true }, null, 0).text).toBe("Patch 16.19 · offline");
    expect(metaChip({ ...meta, patch: null }, null, 0).text).toBe("Live data");
    expect(metaChip(null, null, 0).text).toBeNull();
  });

  it("says just now, never 0 min ago", () => {
    expect(ago(0, 0)).toBe("just now");
    expect(ago(0, 12 * MIN)).toBe("12 min ago");
    expect(ago(0, 180 * MIN)).toBe("3 h ago");
    expect(ago(0, 30 * 60 * MIN)).toBe("yesterday");
    expect(ago(0, 4 * 24 * 60 * MIN)).toBe("4 days ago");
  });

  it("the phase band speaks plainly", () => {
    const seat = (actingType: string | null) => ({ actingType }) as DraftView["myTeam"][number];
    const draft = (timerPhase: string, mine: string | null = null, theirs: string | null = null) => ({ timerPhase, myTeam: [seat(mine)], theirTeam: [seat(theirs)] });
    expect(waitingText(draft("BAN_PICK", "pick"))).toBe("Your team is picking");
    expect(waitingText(draft("BAN_PICK", null, "ban"))).toBe("Their team is banning");
    expect(waitingText(draft("FINALIZATION"))).toBe("Set your runes and spells");
    expect(waitingText(draft("BAN_PICK"))).toBe("Waiting for the next turn");
    const html = renderToStaticMarkup(createElement(PhaseBar, { timerPhase: "FINALIZATION", localAction: null, secondsLeft: 20, totalSeconds: 30, waitingText: "x" }));
    expect(html).toContain("Last changes");
    expect(html).not.toContain("Finalization");
  });

  it("one label per concept, and Try new named as its tab", () => {
    expect(t("label.winRate")).toBe("WR");
    expect(Object.values(copy).filter((v) => /Win %|Enemy team|Vs your hover|rank band|vs what both champions/i.test(v))).toEqual([]);
    expect(t("new.head", { role: "mid" })).toContain(t("tabs.new"));
    expect(t("pool.seeNew")).toContain(t("tabs.new"));
  });

  it("the client found without a Riot ID has no dangling colon", () => {
    const account = { state: "unregistered", serverUrl: "https://x", defaultServerUrl: null, clientRiotId: null, inviteCode: null, message: null } as unknown as AccountView;
    const state: ViewState = { ...emptyViewState(), account, status: { ...emptyViewState().status, lcu: "connected" } };
    const html = renderToStaticMarkup(createElement(ConnectScreen, { state, account }));
    expect(html).toContain("League client found");
    expect(html).not.toContain("League client found:");
    const named = renderToStaticMarkup(createElement(ConnectScreen, { state, account: { ...account, clientRiotId: "Me#EUW" } }));
    expect(named).toContain("League client found:");
    expect(named).toContain("Me#EUW");
  });
});

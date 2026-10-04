// Builds the synthetic, identity-free 5v5 draft-pick fixture used by tests.
// Usage: node scripts/make-synthetic-fixture.mjs > fixtures/synthetic-draft-pick.json
// Champion ids here are test data only; the app never reads them from code.
const positions = ["top", "jungle", "middle", "bottom", "utility"];
const local = 2;
const player = (cellId, team) => ({
  cellId,
  team,
  assignedPosition: team === 1 ? positions[cellId] : "",
  championId: 0,
  championPickIntent: 0,
  selectedSkinId: 0,
  spell1Id: 4,
  spell2Id: 14,
  entitledFeatureType: "NONE",
});
const s = {
  actions: [],
  bans: { myTeamBans: [], theirTeamBans: [], numBans: 10 },
  benchChampions: [],
  benchEnabled: false,
  isCustomGame: false,
  isSpectating: false,
  hasSimultaneousBans: true,
  hasSimultaneousPicks: false,
  localPlayerCellId: local,
  myTeam: [0, 1, 2, 3, 4].map((c) => player(c, 1)),
  theirTeam: [5, 6, 7, 8, 9].map((c) => player(c, 2)),
  timer: { phase: "PLANNING", adjustedTimeLeftInPhase: 30000, totalTimeInPhase: 30000, isInfinite: false, internalNowInEpochMs: 0 },
  trades: [],
};
let id = 1;
const bansMine = [238, 157, 64, 119, 22];
const bansTheirs = [266, 99, 53, 412, 81];
const action = (c, type) => ({ id: id++, actorCellId: c, championId: 0, completed: false, isAllyAction: c >= 0 && c < 5, isInProgress: false, type, pickTurn: 1 });
s.actions.push([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => action(c, "ban")));
s.actions.push([action(-1, "ten_bans_reveal")]);
const order = [[0], [5, 6], [1, 2], [7, 8], [3, 4], [9]];
for (const g of order) s.actions.push(g.map((c) => action(c, "pick")));
const picks = { 0: 86, 1: 32, 2: 103, 3: 51, 4: 111, 5: 54, 6: 59, 7: 21, 8: 25, 9: 122 };

const clone = (o) => JSON.parse(JSON.stringify(o));
const cell = (c) => (c < 5 ? s.myTeam[c] : s.theirTeam[c - 5]);
const frames = [];
let t = 0;
const emit = (dt) => {
  t += dt;
  frames.push({ t, uri: "/lol-champ-select/v1/session", eventType: "Update", data: clone(s) });
};

// Planning: the local player declares an intent.
cell(local).championPickIntent = 103;
const snapshot = clone(s);

// Ban phase.
s.timer.phase = "BAN_PICK";
s.actions[0].forEach((a) => (a.isInProgress = true));
emit(2000);
s.actions[0].forEach((a, i) => {
  a.championId = i < 5 ? bansMine[i] : bansTheirs[i - 5];
  a.completed = true;
  a.isInProgress = false;
});
s.actions[1][0].completed = true;
s.bans.myTeamBans = bansMine;
s.bans.theirTeamBans = bansTheirs;
emit(28000);

// Pick turns: allies' hovers are visible, enemies are hidden until they lock.
for (let gi = 0; gi < order.length; gi++) {
  const group = s.actions[2 + gi];
  group.forEach((a) => {
    a.isInProgress = true;
    if (a.actorCellId < 5) {
      a.championId = picks[a.actorCellId];
      cell(a.actorCellId).championId = picks[a.actorCellId];
    }
  });
  emit(1000);
  group.forEach((a) => {
    a.championId = picks[a.actorCellId];
    a.completed = true;
    a.isInProgress = false;
    cell(a.actorCellId).championId = picks[a.actorCellId];
    cell(a.actorCellId).championPickIntent = 0;
  });
  emit(15000);
}
s.timer.phase = "FINALIZATION";
emit(500);
t += 30000;
frames.push({ t, uri: "/lol-champ-select/v1/session", eventType: "Delete", data: null });
frames.push({ t, uri: "/lol-gameflow/v1/gameflow-phase", eventType: "Update", data: "GameStart" });

const fixture = {
  format: 1,
  description:
    "Synthetic 5v5 draft pick with no real players. Local player is cell 2 (middle). Built from the LCU session shape; supplement with real recordings.",
  recordedAt: "2026-10-05T00:00:00.000Z",
  snapshots: {
    "/lol-gameflow/v1/gameflow-phase": "ChampSelect",
    "/lol-gameflow/v1/session": { phase: "ChampSelect", gameData: { queue: { id: 400, type: "NORMAL" } } },
    "/lol-champ-select/v1/session": snapshot,
    // Same shape as /lol-perks/v1/recommended-champion-positions (test data, subset).
    "/lol-perks/v1/recommended-champion-positions": Object.fromEntries(
      Object.entries({
        12: ["UTILITY"], 21: ["BOTTOM"], 22: ["BOTTOM"], 25: ["UTILITY", "MIDDLE"], 32: ["JUNGLE"], 51: ["BOTTOM"],
        54: ["TOP"], 59: ["JUNGLE"], 84: ["MIDDLE", "TOP"], 86: ["TOP"], 103: ["MIDDLE"], 111: ["UTILITY"],
        122: ["TOP"], 157: ["MIDDLE", "TOP"], 202: ["BOTTOM"], 238: ["MIDDLE"], 245: ["JUNGLE", "MIDDLE"], 950: ["JUNGLE", "MIDDLE"],
      }).map(([id, p]) => [id, { recommendedPositions: p }]),
    ),
    "/lol-champ-select/v1/pickable-champion-ids": [12, 21, 22, 25, 32, 51, 53, 54, 59, 64, 81, 84, 86, 99, 103, 111, 114, 119, 122, 157, 236, 238, 245, 266, 412, 516],
  },
  frames,
};
process.stdout.write(JSON.stringify(fixture, null, 2) + "\n");

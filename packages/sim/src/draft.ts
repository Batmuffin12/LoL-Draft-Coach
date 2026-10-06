import type { Fixture } from "@ldc/lcu";

/**
 * Draft simulator: builds a whole champ select (both teams, roles, bans, hovers, timers) in a
 * few lines and returns it in the recorded-fixture format, so unit tests, the mock League
 * client and `LDC_SCREENSHOT` runs can use any team. Champion ids here are test data chosen
 * by the scenario author; app code still never hardcodes game data.
 *
 *   draft().me("middle").hover(103).bans([238, 157], [55]).ally("top", 86).enemy(238, "middle").pick(103).build()
 */

/** Where the simulated draft stops: the last frame is that moment, so a screenshot or test sees it. */
export type DraftStop =
  | "planning" // declaring your pick, before bans
  | "my-ban" // the ban phase, your ban in progress
  | "bans-done" // bans revealed, before the first pick
  | "my-pick" // your pick in progress (everything before it played)
  | "locked" // right after your lock-in
  | "finalization" // every pick in, finalization timer running
  | "game-start" // champ select closed, game starting (the default)
  | "game-end"; // the game played and ended (gameflow InProgress, then EndOfGame)

const STOP_ORDER: DraftStop[] = ["planning", "my-ban", "bans-done", "my-pick", "locked", "finalization", "game-start", "game-end"];

/** Seconds per timer phase. */
export interface DraftTimers {
  planning: number;
  ban: number;
  pick: number;
  finalization: number;
}

export interface DraftOptions {
  /** Queue id served in the gameflow session (test data; the app checks it against config). */
  queueId?: number;
  /** Blue side picks first. */
  side?: "blue" | "red";
  custom?: boolean;
  description?: string;
}

/** Positions as the LCU names them, in the usual cell order. */
const POSITIONS = ["top", "jungle", "middle", "bottom", "utility"];

interface Seat {
  cellId: number;
  team: 1 | 2;
  position: string;
  championId: number;
  intent: number;
}

interface Action {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isAllyAction: boolean;
  isInProgress: boolean;
  type: string;
  pickTurn: number;
}

export class DraftSim {
  private myPosition = "middle";
  private allyOrder = [...POSITIONS];
  private allies = new Map<string, number>();
  private enemies: { championId: number; position: string }[] = [];
  private myHover = 0;
  private myPick = 0;
  private allyBans: number[] = [];
  private enemyBans: number[] = [];
  private ownedIds: number[] | null = null;
  private recommended: Record<number, string[]> = {};
  private stop: DraftStop = "game-start";
  private times: DraftTimers = { planning: 30, ban: 30, pick: 30, finalization: 30 };

  constructor(private readonly opts: DraftOptions = {}) {}

  /** Your assigned position (default middle). */
  me(position: string): this {
    this.myPosition = position;
    return this;
  }

  /** Your team's positions in cell (= pick) order; default top, jungle, middle, bottom, utility. */
  order(positions: string[]): this {
    if (positions.length !== 5 || new Set(positions).size !== 5) throw new Error("order needs five different positions");
    this.allyOrder = [...positions];
    return this;
  }

  /** The champion an ally at this position locks in. */
  ally(position: string, championId: number): this {
    this.allies.set(position, championId);
    return this;
  }

  /** The next champion their team locks in (in their pick order); the position is usually hidden in ranked. */
  enemy(championId: number, position = ""): this {
    if (this.enemies.length >= 5) throw new Error("their team has five picks already");
    this.enemies.push({ championId, position });
    return this;
  }

  /** The champion you declare in planning and hover until your turn. */
  hover(championId: number): this {
    this.myHover = championId;
    return this;
  }

  /** The champion you lock in (default: your hover). */
  pick(championId: number): this {
    this.myPick = championId;
    return this;
  }

  /** Bans by your team and theirs (up to five each, in cell order; 0 = no ban). */
  bans(ally: number[], enemy: number[] = []): this {
    if (ally.length > 5 || enemy.length > 5) throw new Error("five bans per team at most");
    this.allyBans = [...ally];
    this.enemyBans = [...enemy];
    return this;
  }

  /** Champions you can pick (the client's pickable list). Default: your hover and pick. */
  owned(championIds: number[]): this {
    this.ownedIds = [...championIds];
    return this;
  }

  /** The client's recommended positions per champion (LCU perks data), e.g. { 103: ["MIDDLE"] }. */
  positions(byChampion: Record<number, string[]>): this {
    this.recommended = { ...byChampion };
    return this;
  }

  timers(t: Partial<DraftTimers>): this {
    this.times = { ...this.times, ...t };
    return this;
  }

  /** Stop the replay at this moment (default: game-start). */
  stopAt(stop: DraftStop): this {
    this.stop = stop;
    return this;
  }

  build(): Fixture {
    return buildDraft(this.spec());
  }

  private spec(): DraftSpec {
    if (!this.allyOrder.includes(this.myPosition)) throw new Error(`unknown position "${this.myPosition}"`);
    const pick = this.myPick || this.myHover;
    const picks = [...[...this.allies].filter(([p]) => p !== this.myPosition).map(([, c]) => c), ...this.enemies.map((e) => e.championId), pick].filter(Boolean);
    const dup = picks.find((c, i) => picks.indexOf(c) !== i);
    if (dup) throw new Error(`champion ${dup} is picked twice`);
    const banned = picks.find((c) => this.allyBans.includes(c) || this.enemyBans.includes(c));
    if (banned) throw new Error(`champion ${banned} is banned and picked`);
    return {
      ...this.opts,
      myPosition: this.myPosition,
      allyOrder: this.allyOrder,
      allies: this.allies,
      enemies: this.enemies,
      myHover: this.myHover,
      myPick: pick,
      allyBans: this.allyBans,
      enemyBans: this.enemyBans,
      owned: this.ownedIds ?? [...new Set([this.myHover, pick].filter(Boolean))],
      recommended: this.recommended,
      stop: this.stop,
      times: this.times,
    };
  }
}

/** Starts a simulated draft. */
export function draft(opts: DraftOptions = {}): DraftSim {
  return new DraftSim(opts);
}

interface DraftSpec extends DraftOptions {
  myPosition: string;
  allyOrder: string[];
  allies: Map<string, number>;
  enemies: { championId: number; position: string }[];
  myHover: number;
  myPick: number;
  allyBans: number[];
  enemyBans: number[];
  owned: number[];
  recommended: Record<number, string[]>;
  stop: DraftStop;
  times: DraftTimers;
}

const SESSION = "/lol-champ-select/v1/session";
const PHASE = "/lol-gameflow/v1/gameflow-phase";
const GAMEFLOW = "/lol-gameflow/v1/session";

function buildDraft(s: DraftSpec): Fixture {
  const blue = (s.side ?? "blue") === "blue";
  const allyBase = blue ? 0 : 5;
  const enemyBase = blue ? 5 : 0;
  const myCell = allyBase + s.allyOrder.indexOf(s.myPosition);
  const stopAt = STOP_ORDER.indexOf(s.stop);
  const reached = (stop: DraftStop) => stopAt <= STOP_ORDER.indexOf(stop);

  const seats: Seat[] = [
    ...s.allyOrder.map((position, i): Seat => ({ cellId: allyBase + i, team: blue ? 1 : 2, position, championId: 0, intent: 0 })),
    ...[0, 1, 2, 3, 4].map((i): Seat => ({ cellId: enemyBase + i, team: blue ? 2 : 1, position: s.enemies[i]?.position ?? "", championId: 0, intent: 0 })),
  ];
  const seat = (cell: number) => seats.find((x) => x.cellId === cell)!;
  const mine = seat(myCell);
  mine.intent = s.myHover;
  const finalPick = (cell: number): number => {
    if (cell === myCell) return s.myPick;
    const st = seat(cell);
    if (st.team === seat(allyBase).team) return s.allies.get(st.position) ?? 0;
    return s.enemies[cell - enemyBase]?.championId ?? 0;
  };

  // Actions: ten simultaneous bans, the reveal, then the snake pick order (first side 1, 2, 2, 2, 2, 1).
  let nextId = 1;
  const act = (actorCellId: number, type: string, isAllyAction: boolean): Action => ({ id: nextId++, actorCellId, championId: 0, completed: false, isAllyAction, isInProgress: false, type, pickTurn: 1 });
  const ally = (i: number) => allyBase + i;
  const enemy = (i: number) => enemyBase + i;
  const first = blue ? ally : enemy;
  const second = blue ? enemy : ally;
  const firstIsAlly = blue;
  const banGroup = [...[0, 1, 2, 3, 4].map((i) => act(ally(i), "ban", true)), ...[0, 1, 2, 3, 4].map((i) => act(enemy(i), "ban", false))];
  const reveal = [act(-1, "ten_bans_reveal", false)];
  const pickCells: [number[], boolean][] = [
    [[first(0)], firstIsAlly],
    [[second(0), second(1)], !firstIsAlly],
    [[first(1), first(2)], firstIsAlly],
    [[second(2), second(3)], !firstIsAlly],
    [[first(3), first(4)], firstIsAlly],
    [[second(4)], !firstIsAlly],
  ];
  const pickGroups = pickCells.map(([cells, isAlly]) => cells.map((c) => act(c, "pick", isAlly)));
  const actions: Action[][] = [banGroup, reveal, ...pickGroups];

  const myTeamBans: number[] = [];
  const theirTeamBans: number[] = [];
  const timer = { phase: "PLANNING", adjustedTimeLeftInPhase: s.times.planning * 1000, totalTimeInPhase: s.times.planning * 1000, isInfinite: false, internalNowInEpochMs: 0 };
  const setTimer = (phase: string, seconds: number) => Object.assign(timer, { phase, adjustedTimeLeftInPhase: seconds * 1000, totalTimeInPhase: seconds * 1000 });

  const session = () => {
    const allies = seats.filter((x) => x.team === mine.team);
    const others = seats.filter((x) => x.team !== mine.team);
    const player = (x: Seat) => ({
      cellId: x.cellId,
      team: x.team,
      assignedPosition: x.position,
      championId: x.championId,
      championPickIntent: x.intent,
      selectedSkinId: 0,
      spell1Id: 0,
      spell2Id: 0,
      entitledFeatureType: "NONE",
    });
    return structuredClone({
      actions,
      bans: { myTeamBans, theirTeamBans, numBans: 10 },
      benchChampions: [],
      benchEnabled: false,
      isCustomGame: s.custom ?? false,
      isSpectating: false,
      hasSimultaneousBans: true,
      hasSimultaneousPicks: false,
      localPlayerCellId: myCell,
      myTeam: allies.map(player),
      theirTeam: others.map(player),
      timer,
      trades: [],
    });
  };

  const queue = { id: s.queueId ?? 420, type: s.custom ? "CUSTOM" : "RANKED_SOLO_5x5" };
  const snapshots: Record<string, unknown> = {
    [PHASE]: "ChampSelect",
    [GAMEFLOW]: { phase: "ChampSelect", gameData: { queue } },
    [SESSION]: session(),
    "/lol-perks/v1/recommended-champion-positions": Object.fromEntries(Object.entries(s.recommended).map(([id, p]) => [id, { recommendedPositions: p }])),
    "/lol-champ-select/v1/pickable-champion-ids": s.owned,
  };

  const frames: Fixture["frames"] = [];
  let t = 0;
  const frame = (uri: string, data: unknown, eventType = "Update") => frames.push({ t, uri, eventType, data });
  const done = () => ({ format: 1 as const, description: s.description ?? describe(s), recordedAt: "simulated", snapshots, frames });

  if (reached("planning")) return done();

  // Ban phase: every ban in progress at once (your hover stays declared).
  t += s.times.planning * 1000;
  setTimer("BAN_PICK", s.times.ban);
  for (const a of banGroup) a.isInProgress = true;
  frame(SESSION, session());
  if (reached("my-ban")) return done();

  t += Math.max(1, s.times.ban - 5) * 1000;
  banGroup.forEach((a, i) => {
    const id = (a.isAllyAction ? s.allyBans[i] : s.enemyBans[i - 5]) ?? 0;
    Object.assign(a, { championId: id, completed: true, isInProgress: false });
    if (id) (a.isAllyAction ? myTeamBans : theirTeamBans).push(id);
  });
  Object.assign(reveal[0]!, { completed: true });
  setTimer("BAN_PICK", s.times.pick);
  frame(SESSION, session());
  if (reached("bans-done")) return done();

  for (const group of pickGroups) {
    const mineNow = group.some((a) => a.actorCellId === myCell);
    t += 1000;
    setTimer("BAN_PICK", s.times.pick);
    for (const a of group) {
      a.isInProgress = true;
      // Allies hover what they lock; their team's hovers are hidden; yours is your declared hover.
      if (a.actorCellId === myCell) a.championId = s.myHover || s.myPick;
      else if (a.isAllyAction) a.championId = finalPick(a.actorCellId);
    }
    frame(SESSION, session());
    if (mineNow && reached("my-pick")) return done();

    t += (s.times.pick - 10) * 1000;
    for (const a of group) {
      const c = finalPick(a.actorCellId);
      Object.assign(a, { championId: c, completed: c > 0, isInProgress: false });
      seat(a.actorCellId).championId = c;
      if (a.actorCellId === myCell) mine.intent = 0;
    }
    frame(SESSION, session());
    if (mineNow && reached("locked")) return done();
  }

  t += 1000;
  setTimer("FINALIZATION", s.times.finalization);
  frame(SESSION, session());
  if (reached("finalization")) return done();

  t += s.times.finalization * 1000;
  frame(SESSION, null, "Delete");
  frame(PHASE, "GameStart");
  if (reached("game-start")) return done();

  t += 5000;
  frame(PHASE, "InProgress");
  frame(GAMEFLOW, { phase: "InProgress", gameData: { queue } });
  t += 5000;
  frame(PHASE, "EndOfGame");
  frame(GAMEFLOW, { phase: "EndOfGame", gameData: { queue } });
  return done();
}

function describe(s: DraftSpec): string {
  const enemy = s.enemies.map((e) => e.championId).join(", ") || "none";
  return `Simulated draft: you ${s.myPosition}${s.myPick ? ` on ${s.myPick}` : ""}, their picks ${enemy}, stops at ${s.stop}.`;
}

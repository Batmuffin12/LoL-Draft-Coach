/**
 * Server measurements for `pnpm perf`, all local: a synthetic database (.local/perf-server, made
 * from packages/sim: no real player), this branch's built server (apps/server/dist) on a local
 * port with no Riot key and no admin token, so nothing can reach Riot or production.
 *
 *   tsx scripts/perf/server.ts <out.json> [--quick]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { get } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import autocannon from "autocannon";
import { MatchSchema, type Match } from "../../packages/riot-api/src/index";
import type { MatchSummary, UserMatch } from "@ldc/shared";
import { history } from "@ldc/sim";
import { openDb, type Db } from "../../apps/server/src/db";
import { schema } from "../../apps/server/src/db";
import { findConfigDir, loadServerConfig } from "../../apps/server/src/config";
import { publishSnapshot } from "../../apps/server/src/meta-job";
import { syncUser, type SyncRiot } from "../../apps/server/src/sync";
import { startupFlow } from "./flow";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverDir = join(root, "apps", "server");
const dir = join(root, ".local", "perf-server");
const dbPath = join(dir, "ldc.sqlite");
const PORT = 8799;
const TOKEN = "perf-token-synthetic-user-0000000000";
const BAND = 2;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();
const config = loadServerConfig(findConfigDir(root));
const quick = process.argv.includes("--quick");

/** Synthetic matches with ids unique to a prefix (several histories never share a match id). */
function games(seed: number, count: number, prefix: string, days = 365): UserMatch[] {
  return history({ now, games: count, days, seed }).matches.map((m) => ({ ...m, match: { ...m.match, matchId: m.match.matchId.replace("SIM1_", `${prefix}_`) } }));
}

function insertMatches(db: Db, list: UserMatch[], source: "user" | "collector", band: number | null): void {
  const stmt = db.$client.prepare(
    "INSERT OR IGNORE INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, source, stored_at, band) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.$client.transaction(() => {
    for (const { match: m } of list) stmt.run(m.matchId, m.queueId, m.gameVersion, m.endedAt, m.durationSec, JSON.stringify(m), source, now, band);
  })();
}

/** The benchmark database: one user with a full 1,000-game history, collector games and a band snapshot. */
async function buildDb(): Promise<{ snapshotMs: number; collectorGames: number }> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const db = openDb(dbPath);
  const user = db
    .insert(schema.users)
    .values({ puuid: "perf-synthetic", gameName: "Perf", tagLine: "SIM", tokenHash: sha256(TOKEN), band: BAND, createdAt: now, lastSyncAt: now, lastSeenAt: now, ranked: [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", wins: 120, losses: 110 }], historyBacklog: 0 })
    .returning()
    .get();
  const h = history({ now, games: config.app.history.matchCount, days: 365, seed: 7 });
  insertMatches(db, h.matches, "user", null);
  const um = db.$client.prepare("INSERT INTO user_matches (user_id, match_id, participant_index, ended_at) VALUES (?, ?, ?, ?)");
  db.$client.transaction(() => {
    for (const m of h.matches) um.run(user.id, m.match.matchId, m.me, m.match.endedAt);
  })();
  db.insert(schema.userMasteries).values({ userId: user.id, data: h.masteries, updatedAt: now }).run();
  for (let d = 0; d < 100; d++) {
    db.insert(schema.rankHistory).values({ userId: user.id, day: new Date(now - d * 86_400_000).toISOString().slice(0, 10), queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II" }).run();
  }
  for (let i = 0; i < 20; i++) {
    const m = h.matches[i]!;
    const me = m.match.participants[m.me]!;
    const option = { championId: me.championId, expectedWin: 0.52, terms: [{ name: "you", rating: 30, deltaWin: 0.03, games: 40 }] };
    const record = { gameId: Number(m.match.matchId.split("_")[1]), queueId: 420, role: me.position, band: BAND, lockedAt: m.match.endedAt - m.match.durationSec * 1000, pick: option, shown: [option, option, option] };
    db.insert(schema.adviceLog).values({ userId: user.id, gameId: record.gameId, lockedAt: record.lockedAt, championId: me.championId, advice: record as never, createdAt: now }).run();
  }
  // Collector games for the band and the band above (builds use both).
  const perHistory = 1_000;
  const histories = quick ? 4 : 20;
  for (let i = 0; i < histories; i++) insertMatches(db, games(100 + i, perHistory, `C${i}`, config.meta.aggregation.windowDays), "collector", i % 4 === 3 ? BAND + 1 : BAND);
  const start = performance.now();
  await publishSnapshot(db, BAND, { meta: config.meta, bands: config.bands, engine: config.engine }, now, { buildBands: [BAND + 1], items: null });
  const snapshotMs = performance.now() - start;
  db.$client.pragma("wal_checkpoint(TRUNCATE)");
  db.$client.close();
  return { snapshotMs, collectorGames: perHistory * histories };
}

/** A Match-V5 payload from a synthetic summary, the user (puuid "sync-me") at the summary's `me`. */
function rawMatch(m: UserMatch): Match {
  const s: MatchSummary = m.match;
  return MatchSchema.parse({
    metadata: { matchId: s.matchId },
    info: {
      gameCreation: s.endedAt - s.durationSec * 1000,
      gameDuration: s.durationSec,
      gameEndTimestamp: s.endedAt,
      gameVersion: s.gameVersion,
      queueId: s.queueId,
      participants: s.participants.map((p, i) => ({
        puuid: i === m.me ? "sync-me" : `other-${i}`,
        championId: p.championId,
        teamId: p.teamId,
        teamPosition: p.position.toUpperCase(),
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        totalMinionsKilled: p.cs,
        goldEarned: p.gold,
        visionScore: p.visionScore,
        physicalDamageDealtToChampions: p.physicalDamage,
        magicDamageDealtToChampions: p.magicDamage,
        challenges: p.challenges,
        item0: p.items[0],
        summoner1Id: p.spells[0],
        summoner2Id: p.spells[1],
      })),
    },
  });
}

/** One user sync of 200 new games from recorded payloads (no network): the server's own work per sync. */
async function syncJob(): Promise<{ ms: number; games: number }> {
  const db = openDb(":memory:");
  const user = db.insert(schema.users).values({ puuid: "sync-me", gameName: "Sync", tagLine: "SIM", tokenHash: sha256("sync"), createdAt: now }).returning().get();
  const list = games(9, 200, "S");
  const raw = new Map(list.map((m) => [m.match.matchId, rawMatch(m)]));
  const ids = list.map((m) => m.match.matchId);
  const riot: SyncRiot = {
    accountByRiotId: async (gameName, tagLine) => ({ puuid: "sync-me", gameName, tagLine }),
    masteriesByPuuid: async () => [{ championId: 103, championLevel: 7, championPoints: 120_000 }],
    leagueEntriesByPuuid: async () => [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", wins: 10, losses: 8 }],
    matchIdsByPuuid: async (_p, q = {}) => (q.queue === 420 ? ids.slice(q.start ?? 0, (q.start ?? 0) + (q.count ?? 20)) : []),
    match: async (id) => raw.get(id) ?? null,
  };
  const start = performance.now();
  const r = await syncUser(db, riot, user, { history: { ...config.app.history, timelineCount: 0 }, bands: config.bands }, now);
  const ms = performance.now() - start;
  db.$client.close();
  return { ms, games: r.newMatches };
}

/** The hot queries' plans (SQLite EXPLAIN QUERY PLAN), to check they use indexes. */
function queryPlans(): Record<string, string[]> {
  const db = openDb(dbPath);
  const plans: Record<string, string> = {
    "profile matches": "SELECT m.summary, um.participant_index FROM user_matches um JOIN matches m ON m.match_id = um.match_id WHERE um.user_id = 1 AND um.ended_at > 0 ORDER BY um.ended_at DESC",
    "profile match ids": "SELECT match_id FROM user_matches WHERE user_id = 1 ORDER BY ended_at DESC",
    "user by token": `SELECT * FROM users WHERE token_hash = '${sha256(TOKEN)}'`,
    "recent advice": "SELECT advice FROM advice_log WHERE user_id = 1 ORDER BY locked_at DESC, id DESC LIMIT 20",
    "rank history": "SELECT day, queue_type, tier, rank FROM rank_history WHERE user_id = 1 AND day > '2026-01-01' ORDER BY day",
    "meta snapshot": "SELECT * FROM meta_snapshots WHERE band = 2",
    "health: collector freshness": "SELECT max(stored_at) AS t FROM matches WHERE source = 'collector'",
  };
  const out: Record<string, string[]> = {};
  for (const [name, sql] of Object.entries(plans)) out[name] = (db.$client.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((r) => r.detail);
  db.$client.close();
  return out;
}

function startServer(): ChildProcess {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(RIOT_|ADMIN_TOKEN|BACKUP_|SERVER_URL)/.test(k)) env[k] = v;
  return spawn(process.execPath, ["dist/main.js"], {
    cwd: serverDir,
    env: { ...env, PORT: String(PORT), DATABASE_PATH: dbPath, SYNC_INTERVAL_MINUTES: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitHealthy(timeoutMs = 20_000): Promise<number> {
  const start = performance.now();
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.status === 200) return performance.now() - start;
    } catch {
      // Not listening yet.
    }
    if (performance.now() - start > timeoutMs) throw new Error("server did not become healthy");
    await sleep(5);
  }
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((r) => {
    child.once("exit", () => r());
    child.kill();
  });
}

/** Process start → first 200 on /health, `runs` times. */
async function coldStarts(runs: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i <= runs; i++) {
    const start = performance.now();
    const child = startServer();
    await waitHealthy();
    if (i > 0) out.push(performance.now() - start);
    await stop(child);
  }
  return out;
}

interface Bench {
  name: string;
  path: string;
  headers: Record<string, string>;
  /** The status every response should have (304 for a matching ETag). */
  expect: number;
  connections?: number;
}

/** One request as sent on the wire (no decompression): status, encoding and bytes. */
function wire(path: string, headers: Record<string, string>): Promise<{ status: number; bytes: number; encoding: string | null; etag: string | null }> {
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port: PORT, path, headers }, (res) => {
      let bytes = 0;
      res.on("data", (d: Buffer) => (bytes += d.length));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, bytes, encoding: (res.headers["content-encoding"] as string | undefined) ?? null, etag: (res.headers.etag as string | undefined) ?? null }));
    }).on("error", reject);
  });
}

async function load(b: Bench, seconds: number) {
  const url = `http://127.0.0.1:${PORT}${b.path}`;
  const one = await wire(b.path, b.headers);
  const opts = { url, connections: b.connections ?? 10, headers: b.headers };
  await autocannon({ ...opts, duration: Math.min(3, seconds) }); // warm-up
  const r = await autocannon({ ...opts, duration: seconds });
  const statuses = (r as unknown as { statusCodeStats?: Record<string, { count: number }> }).statusCodeStats ?? {};
  const unexpected = Object.entries(statuses).reduce((n, [code, v]) => n + (Number(code) === b.expect ? 0 : v.count), 0);
  return {
    name: b.name,
    connections: opts.connections,
    status: one.status,
    expect: b.expect,
    wireBytes: one.bytes,
    contentEncoding: one.encoding,
    reqPerSec: r.requests.average,
    latency: { p50: r.latency.p50, p975: r.latency.p97_5, p99: r.latency.p99, max: r.latency.max, mean: r.latency.mean },
    requests: r.requests.total,
    statuses: Object.fromEntries(Object.entries(statuses).map(([k, v]) => [k, v.count])),
    unexpected,
    errors: r.errors,
    throughputBytesPerSec: r.throughput.average,
  };
}

const out = process.argv[2]!;
const db = await buildDb();
process.stdout.write(`bench db: ${db.collectorGames} collector games, snapshot built in ${Math.round(db.snapshotMs)} ms\n`);
const sync = await syncJob();
process.stdout.write(`sync of ${sync.games} games: ${Math.round(sync.ms)} ms\n`);
const cold = await coldStarts(quick ? 3 : 10);
process.stdout.write(`cold starts: ${cold.map((x) => Math.round(x)).join(", ")} ms\n`);

const child = startServer();
await waitHealthy();
const gzip = { "accept-encoding": "gzip, deflate" };
const auth = { ...gzip, authorization: `Bearer ${TOKEN}` };
// The ETag as the panel stores it: from a gzip response, as Node's fetch receives it.
const etag = async (path: string, headers: Record<string, string>) => (await wire(path, headers)).etag ?? "";
const configTag = await etag("/config", gzip);
const metaTag = await etag(`/meta/${BAND}`, auth);
const since = now - 3 * 86_400_000;
const benches: Bench[] = [
  { name: "GET /health", path: "/health", headers: gzip, expect: 200 },
  { name: "GET /config", path: "/config", headers: gzip, expect: 200 },
  { name: "GET /config (304)", path: "/config", headers: { ...gzip, "if-none-match": configTag }, expect: 304 },
  { name: `GET /meta/${BAND}`, path: `/meta/${BAND}`, headers: auth, expect: 200 },
  { name: `GET /meta/${BAND} (304)`, path: `/meta/${BAND}`, headers: { ...auth, "if-none-match": metaTag }, expect: 304 },
  { name: "GET /me/profile", path: "/me/profile", headers: auth, expect: 200 },
  { name: "GET /me/profile (1 connection)", path: "/me/profile", headers: auth, expect: 200, connections: 1 },
  { name: "GET /me/profile?since", path: `/me/profile?since=${since}`, headers: auth, expect: 200 },
];
const seconds = quick ? 5 : 20;
const results = [];
for (const b of benches) {
  const r = await load(b, seconds);
  results.push(r);
  process.stdout.write(`${b.name}: ${Math.round(r.reqPerSec)} req/s, p99 ${r.latency.p99} ms, ${r.wireBytes} B, unexpected ${r.unexpected}\n`);
}
// The panel's startup round trips (first start, then the next start with its caches), 5 times each.
const flows = [];
for (let i = 0; i < 5; i++) flows.push(await startupFlow(`http://127.0.0.1:${PORT}`, TOKEN, "Perf#SIM", BAND, join(dir, "panel")));
const f = flows.at(-1)!;
process.stdout.write(`startup flow: first ${f.first.requests.length} requests ${Math.round(f.first.totalMs)} ms, next ${f.next.requests.length} requests ${Math.round(f.next.totalMs)} ms\n`);
await stop(child);
writeFileSync(out, JSON.stringify({ db, sync, coldStartMs: cold, endpoints: results, flows, queryPlans: queryPlans() }, null, 1));

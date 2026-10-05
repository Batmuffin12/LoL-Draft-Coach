import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { RiotApiError, RiotKeyError } from "@ldc/riot-api";
import { timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { newestPatch } from "@ldc/meta";
import { AccountError, createInvite, deleteUser, publicUser, registerUser, touchUser, userByToken, type AccountLookup, type User } from "./accounts";
import { bearerToken, sha256 } from "./auth";
import type { Db } from "./db";
import { metaSnapshots } from "./db/schema";
import { WindowLimiter } from "./limits";
import type { MetaJob } from "./meta-job";
import { loadProfile } from "./profile";
import type { SyncScheduler } from "./sync-scheduler";

export interface AppDeps {
  db: Db;
  version: string;
  /** Null when the server has no Riot API key: registration answers 503. */
  riot: AccountLookup | null;
  /** True once Riot has rejected the key (e.g. an expired development key). */
  riotKeyRejected?: () => boolean;
  /** Runs user syncs; null when the server has no Riot key. */
  sync?: Pick<SyncScheduler, "request" | "state" | "forget"> | null;
  now?: () => number;
  /** Registration attempts allowed per client per minute. */
  registerPerMinute?: number;
  /**
   * When set, GET /me/profile starts a background sync if the user's games are older than
   * this (ms). Keeps data fresh without a timer, so the server can sleep when unused.
   */
  syncWhenStaleMs?: number | null;
  /** Enables POST /admin/invites and POST /admin/collect for the owner (bearer token). */
  adminToken?: string | null;
  /** The hourly collector/aggregator; null when not configured. */
  meta?: Pick<MetaJob, "run" | "running" | "lastRun"> | null;
  /** Served by GET /config (scoring weights, thresholds and wording); absent: no route. */
  publicConfig?: Record<string, unknown> | null;
}

/** Collector status and data freshness for /health. */
function metaHealth(deps: AppDeps) {
  const snaps = deps.db
    .select({ band: metaSnapshots.band, createdAt: metaSnapshots.createdAt, matches: metaSnapshots.matches, patch: metaSnapshots.patch, newestMatchAt: metaSnapshots.newestMatchAt })
    .from(metaSnapshots)
    .all();
  const last = deps.meta?.lastRun() ?? null;
  return {
    patch: newestPatch(snaps.map((s) => s.patch)),
    newestMatchAt: snaps.length ? Math.max(...snaps.map((s) => s.newestMatchAt ?? 0)) || null : null,
    collector: {
      running: deps.meta?.running ?? false,
      lastRun: last && { startedAt: last.startedAt, finishedAt: last.finishedAt, newMatches: last.newMatches, riotCalls: last.riotCalls, error: last.error },
      snapshots: snaps.map((s) => ({ band: s.band, createdAt: s.createdAt, matches: s.matches })),
    },
  };
}

const InviteBody = z.object({
  note: z.string().max(100).optional(),
  days: z.number().positive().max(365).optional(),
});

type Env = { Variables: { user: User } };

const RegisterBody = z.object({
  inviteCode: z.string().min(1).max(64),
  riotId: z.string().min(3).max(64),
});

const ACCOUNT_ERROR_STATUS = { invalid_riot_id: 400, invite_invalid: 403, riot_id_not_found: 404 } as const;

/** Client address behind Railway's proxy (first X-Forwarded-For hop), for rate limiting only. */
function clientKey(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * Builds the HTTP API. Pure wiring: no listening socket, so tests call
 * `app.request()` directly.
 */
export function createApp(deps: AppDeps): Hono<Env> {
  const now = deps.now ?? Date.now;
  const registerLimiter = new WindowLimiter(deps.registerPerMinute ?? 10, 60_000);
  const app = new Hono<Env>();
  // Profiles are large JSON (a full history is several MB); gzip shrinks them ~5x.
  app.use(compress());

  app.get("/health", (c) => {
    let database: "ok" | "error" = "ok";
    try {
      deps.db.$client.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }
    return c.json(
      {
        status: database === "ok" ? "ok" : "degraded",
        version: deps.version,
        database,
        // "missing": no key configured; "rejected": Riot refused it (dev keys expire every 24 h).
        riotKey: !deps.riot ? "missing" : deps.riotKeyRejected?.() ? "rejected" : "ok",
        ...(database === "ok" ? metaHealth(deps) : {}),
      },
      database === "ok" ? 200 : 503,
    );
  });

  // Owner-only routes (bearer ADMIN_TOKEN); they don't exist when no token is set.
  if (deps.adminToken) {
    const expected = sha256(deps.adminToken);
    const adminLimiter = new WindowLimiter(20, 60_000);
    const requireAdmin = createMiddleware(async (c, next) => {
      if (!adminLimiter.allow(clientKey(c), now())) return c.json({ error: "rate_limited" }, 429);
      const token = bearerToken(c.req.header("authorization"));
      // Compare fixed-length hashes in constant time.
      if (!token || !timingSafeEqual(Buffer.from(sha256(token)), Buffer.from(expected))) return c.json({ error: "not_found" }, 404);
      await next();
    });
    app.use("/admin/*", requireAdmin);

    // Create invite codes without shell access to the server.
    app.post("/admin/invites", async (c) => {
      const body = InviteBody.safeParse(await c.req.json().catch(() => ({})));
      if (!body.success) return c.json({ error: "invalid_body", message: "Send { note?, days? }." }, 400);
      const { code, expiresAt } = createInvite(deps.db, { note: body.data.note, ttlDays: body.data.days ?? 14, now: now() });
      return c.json({ code, expiresAt }, 201);
    });

    // The hourly wake-up (a Railway cron calls this): collect, aggregate, publish, then idle.
    app.post("/admin/collect", (c) => {
      if (!deps.meta) return c.json({ error: "meta_unavailable", message: "The meta job isn't configured." }, 503);
      const alreadyRunning = deps.meta.running;
      deps.meta.run().catch((err: unknown) => console.error("meta run failed:", err));
      return c.json({ started: !alreadyRunning, running: true }, 202);
    });
  }

  // Scoring config (weights, thresholds, wording), so tuning needs no app release.
  if (deps.publicConfig) {
    const body = JSON.stringify(deps.publicConfig);
    const etag = `"${sha256(body).slice(0, 32)}"`;
    app.get("/config", (c) => {
      if (c.req.header("if-none-match") === etag) return c.body(null, 304, { etag });
      return c.body(body, 200, { "content-type": "application/json", etag });
    });
  }

  app.post("/users", async (c) => {
    if (!registerLimiter.allow(clientKey(c), now())) return c.json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
    const body = RegisterBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body", message: "Send { inviteCode, riotId }." }, 400);
    if (!deps.riot) return c.json({ error: "riot_unavailable", message: "The server has no Riot API key configured." }, 503);
    try {
      const { token, user } = await registerUser(deps.db, deps.riot, body.data, now());
      touchUser(deps.db, user, now());
      // First sync runs in the background; the app polls GET /me/sync for progress.
      deps.sync?.request(user.id).catch(() => {});
      return c.json({ token, user: publicUser(user) }, 201);
    } catch (err) {
      if (err instanceof AccountError) return c.json({ error: err.code, message: err.message }, ACCOUNT_ERROR_STATUS[err.code]);
      if (err instanceof RiotKeyError) return c.json({ error: "riot_unavailable", message: "The server's Riot API key was rejected." }, 503);
      if (err instanceof RiotApiError) return c.json({ error: "riot_error", message: `Riot API error (HTTP ${err.status}). Try again shortly.` }, 502);
      throw err;
    }
  });

  // Everything under /me needs a valid bearer token.
  const requireUser = createMiddleware<Env>(async (c, next) => {
    const token = bearerToken(c.req.header("authorization"));
    const user = token ? userByToken(deps.db, token) : null;
    if (!user) return c.json({ error: "unauthorized", message: "Missing or unknown token. Register again with an invite code." }, 401);
    touchUser(deps.db, user, now());
    c.set("user", user);
    await next();
  });
  app.use("/me", requireUser);
  app.use("/me/*", requireUser);
  app.use("/meta/*", requireUser);

  app.get("/me", (c) => c.json({ user: publicUser(c.get("user")) }));

  app.get("/me/profile", (c) => {
    const raw = c.req.query("since");
    const since = raw === undefined ? undefined : Number(raw);
    if (since !== undefined && !Number.isFinite(since)) return c.json({ error: "invalid_since", message: "since must be epoch milliseconds." }, 400);
    const user = c.get("user");
    if (deps.sync && deps.syncWhenStaleMs && (user.lastSyncAt === null || now() - user.lastSyncAt > deps.syncWhenStaleMs)) {
      deps.sync.request(user.id).catch(() => {});
    }
    return c.json({ ...loadProfile(deps.db, user, since), sync: deps.sync?.state(user.id) ?? { state: "idle" } });
  });

  app.post("/me/sync", (c) => {
    if (!deps.sync) return c.json({ error: "riot_unavailable", message: "The server has no Riot API key configured." }, 503);
    const user = c.get("user");
    deps.sync.request(user.id).catch(() => {});
    return c.json({ sync: deps.sync.state(user.id) }, 202);
  });

  app.get("/me/sync", (c) => c.json({ sync: deps.sync?.state(c.get("user").id) ?? { state: "idle" } }));

  // Meta snapshot for a band (anonymous aggregates; for registered users only, no data brokering).
  app.get("/meta/:band", (c) => {
    const band = Number(c.req.param("band"));
    if (!Number.isInteger(band)) return c.json({ error: "invalid_band", message: "band must be a number." }, 400);
    const row = deps.db.select().from(metaSnapshots).where(eq(metaSnapshots.band, band)).get();
    if (!row) return c.json({ error: "no_snapshot", message: `No meta snapshot for band ${band} yet.` }, 404);
    const headers = { etag: row.etag, "cache-control": "private, no-cache" };
    if (c.req.header("if-none-match") === row.etag) return c.body(null, 304, headers);
    // Stored gzipped; sent as is to clients that accept gzip (every real one does).
    if (/\bgzip\b/.test(c.req.header("accept-encoding") ?? "")) {
      return c.body(new Uint8Array(row.body), 200, { ...headers, "content-type": "application/json", "content-encoding": "gzip" });
    }
    return c.body(gunzipSync(row.body).toString("utf8"), 200, { ...headers, "content-type": "application/json" });
  });

  app.delete("/me", (c) => {
    deleteUser(deps.db, c.get("user").id);
    deps.sync?.forget(c.get("user").id);
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

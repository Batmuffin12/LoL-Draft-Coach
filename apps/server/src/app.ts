import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { RiotApiError, RiotKeyError } from "@ldc/riot-api";
import { AccountError, deleteUser, publicUser, registerUser, userByToken, type AccountLookup, type User } from "./accounts";
import { bearerToken } from "./auth";
import type { Db } from "./db";
import { WindowLimiter } from "./limits";

export interface AppDeps {
  db: Db;
  version: string;
  /** Null when the server has no Riot API key: registration answers 503. */
  riot: AccountLookup | null;
  now?: () => number;
  /** Registration attempts allowed per client per minute. */
  registerPerMinute?: number;
}

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
        riotKey: deps.riot !== null,
        // Filled in by the collector (milestone 5).
        patch: null,
        newestMatchAt: null,
      },
      database === "ok" ? 200 : 503,
    );
  });

  app.post("/users", async (c) => {
    if (!registerLimiter.allow(clientKey(c), now())) return c.json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
    const body = RegisterBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body", message: "Send { inviteCode, riotId }." }, 400);
    if (!deps.riot) return c.json({ error: "riot_unavailable", message: "The server has no Riot API key configured." }, 503);
    try {
      const { token, user } = await registerUser(deps.db, deps.riot, body.data, now());
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
    c.set("user", user);
    await next();
  });
  app.use("/me", requireUser);
  app.use("/me/*", requireUser);

  app.get("/me", (c) => c.json({ user: publicUser(c.get("user")) }));

  app.delete("/me", (c) => {
    deleteUser(deps.db, c.get("user").id);
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

import { Hono } from "hono";
import type { Db } from "./db";

export interface AppDeps {
  db: Db;
  version: string;
  now?: () => number;
}

/**
 * Builds the HTTP API. Pure wiring: no listening socket, so tests call
 * `app.request()` directly.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

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
        // Filled in by the collector (milestone 5).
        patch: null,
        newestMatchAt: null,
      },
      database === "ok" ? 200 : 503,
    );
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

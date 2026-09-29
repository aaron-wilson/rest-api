import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import type { parseEnv } from "./config/env";
import { createLogger } from "./logger";
import { createTripService } from "./service/trips";
import { createMemoryStore } from "./store/memory";
import { StoreConflict, type TripStore } from "./store/port";

export type Config = ReturnType<typeof parseEnv>;
export function createApp(config: Config, store: TripStore = createMemoryStore()) {
  const trips = createTripService({ store });
  const app = new Hono();
  const log = createLogger(config.logLevel);
  app.use("*", cors({ origin: config.corsOrigin }));
  app.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ error: "Invalid request" }, 400);
    if (error instanceof StoreConflict) return c.json({ error: "Version conflict" }, 409);
    log("error", "request_error", { name: error.name });
    return c.json({ error: "Internal server error" }, 500);
  });
  app.post("/trips", async (c) => c.json(await trips.create("demo", await c.req.json()), 201));
  app.get("/trips/:id", async (c) => {
    const trip = await trips.get("demo", c.req.param("id"));
    return trip ? c.json(trip) : c.json({ error: "Trip not found" }, 404);
  });
  app.get("/trips", async (c) => c.json(await trips.list("demo", 20, c.req.query("cursor"))));
  app.get("/hello", (c) =>
    c.json({
      message: "Hello from REST API!",
      timestamp: new Date().toISOString(),
      framework: "Hono",
      runtime: "Bun",
    })
  );
  app.get("/health", (c) =>
    c.json({ status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() })
  );
  app.get("/", (c) =>
    c.json({
      message: "Welcome to the REST API",
      version: "1.0.0",
      endpoints: ["/hello", "/health"],
    })
  );
  return app;
}

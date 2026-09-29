import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { ZodError, type z } from "zod";
import type { parseEnv } from "./config/env";
import { ActivityNotFound, InvalidTripEdit, tripSchema } from "./domain/trip";
import { createLogger } from "./logger";
import { createTripService, TripNotFound } from "./service/trips";
import { selectStore } from "./store/select";
import { InvalidCursor, StoreConflict, type TripStore } from "./store/port";
import { selectAuth } from "./auth/select";
import { demoAuth } from "./auth/demo";
import { Unauthorized, type AuthPort } from "./auth/port";
import {
  activityCreateSchema,
  activityUpdateSchema,
  batchRequestSchema,
  createTripSchema,
  dayCreateSchema,
  dayUpdateSchema,
  idSchema,
  pinRequestSchema,
  preferencesRequestSchema,
  swapRequestSchema,
  updateRequestSchema,
  versionSchema,
} from "./routes/schemas";
import { openApiDocument } from "./openapi";

export type Config = ReturnType<typeof parseEnv>;
class BadRequest extends Error {}
class TooManyRequests extends Error {}
const require = createRequire(import.meta.url);
const swaggerRoot = require("swagger-ui-dist/absolute-path")() as string;
const MAX_BODY_BYTES = 65536;

async function body<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new BadRequest("Request too large");
  const text = await c.req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new BadRequest("Request too large");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new BadRequest("Invalid JSON");
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequest("Invalid request");
  return parsed.data;
}
function id(value: string) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new BadRequest("Invalid ID");
  return parsed.data;
}
function versionedEditError(error: unknown): never {
  if (error instanceof ZodError) throw new BadRequest("Invalid request");
  throw error;
}

export function createApp(
  config: Config,
  store: TripStore = selectStore(config),
  auth: AuthPort = selectAuth(config)
) {
  if (config.appMode === "live" && auth === demoAuth)
    throw new Error("Demo auth is unavailable in live mode");
  const trips = createTripService({ store });
  const app = new Hono();
  const log = createLogger(config.logLevel);
  const limits = new Map<string, { start: number; count: number }>();
  app.use(
    "*",
    cors({
      origin: config.corsOrigin,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
    })
  );
  app.use("*", async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
    if (c.req.path !== "/health") {
      const key = createHash("sha256")
        .update(c.req.header("authorization") ?? "anonymous")
        .digest("hex");
      const now = Date.now();
      const current = limits.get(key);
      if (current && now - current.start < 60_000) {
        if (current.count >= config.rateLimitPerMinute)
          throw new TooManyRequests("Rate limit exceeded");
        current.count++;
      } else limits.set(key, { start: now, count: 1 });
      if (limits.size > 10000)
        for (const [entry, state] of limits) if (now - state.start >= 60_000) limits.delete(entry);
      if (limits.size > 10000) limits.delete(limits.keys().next().value ?? "");
    }
    await next();
  });
  app.onError((error, c) => {
    if (
      error instanceof BadRequest ||
      error instanceof InvalidCursor ||
      error instanceof InvalidTripEdit
    )
      return c.json({ error: error.message }, 400);
    if (error instanceof Unauthorized) return c.json({ error: "Unauthorized" }, 401);
    if (error instanceof TripNotFound || error instanceof ActivityNotFound)
      return c.json({ error: "Not found" }, 404);
    if (error instanceof StoreConflict) return c.json({ error: "Version conflict" }, 409);
    if (error instanceof TooManyRequests) return c.json({ error: "Rate limit exceeded" }, 429);
    log("error", "request_error", { name: error.name });
    return c.json({ error: "Internal server error" }, 500);
  });
  const owner = async (c: Context) => (await auth.authenticate(c.req.header("authorization"))).id;
  const load = async (ownerId: string, tripId: string) => {
    const trip = await trips.get(ownerId, tripId);
    if (!trip) throw new TripNotFound("Trip not found");
    return trip;
  };
  const edit = async (ownerId: string, tripId: string, version: number, changes: unknown) => {
    try {
      return await trips.update(ownerId, tripId, version, changes);
    } catch (error) {
      return versionedEditError(error);
    }
  };

  app.post("/trips", async (c) =>
    c.json(await trips.create(await owner(c), await body(c, createTripSchema)), 201)
  );
  app.post("/trips/batch", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, batchRequestSchema);
    return c.json({ items: await trips.batch(ownerId, input.ids) });
  });
  app.get("/trips", async (c) => {
    const ownerId = await owner(c);
    const limit = c.req.query("limit") === undefined ? 20 : Number(c.req.query("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequest("Invalid limit");
    return c.json(await trips.list(ownerId, limit, c.req.query("cursor")));
  });
  app.get("/trips/:id", async (c) => c.json(await load(await owner(c), id(c.req.param("id")))));
  app.patch("/trips/:id", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const input = await body(c, updateRequestSchema);
    const current = await load(ownerId, tripId);
    if (!tripSchema.safeParse({ ...current, ...input.changes }).success)
      throw new BadRequest("Invalid request");
    return c.json(await edit(ownerId, tripId, input.version, input.changes));
  });
  app.delete("/trips/:id", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, versionSchema);
    await trips.delete(ownerId, id(c.req.param("id")), input.version);
    return c.body(null, 204);
  });
  app.post("/trips/:id/pin", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, pinRequestSchema);
    return c.json(
      await trips.pin(ownerId, id(c.req.param("id")), input.version, input.activityId, input.pinned)
    );
  });
  app.post("/trips/:id/swap", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, swapRequestSchema);
    return c.json(
      await trips.swap(
        ownerId,
        id(c.req.param("id")),
        input.version,
        input.activityId,
        input.replacement
      )
    );
  });
  app.put("/trips/:id/preferences", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, preferencesRequestSchema);
    return c.json(
      await edit(ownerId, id(c.req.param("id")), input.version, { preferences: input.preferences })
    );
  });
  app.post("/trips/:id/days", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const input = await body(c, dayCreateSchema);
    const trip = await load(ownerId, tripId);
    return c.json(await edit(ownerId, tripId, input.version, { days: [...trip.days, input.day] }));
  });
  app.patch("/trips/:id/days/:dayId", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const dayId = id(c.req.param("dayId"));
    const input = await body(c, dayUpdateSchema);
    const trip = await load(ownerId, tripId);
    if (!trip.days.some((day) => day.id === dayId)) throw new TripNotFound("Day not found");
    return c.json(
      await edit(ownerId, tripId, input.version, {
        days: trip.days.map((day) => (day.id === dayId ? { ...day, ...input.changes } : day)),
      })
    );
  });
  app.delete("/trips/:id/days/:dayId", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const dayId = id(c.req.param("dayId"));
    const input = await body(c, versionSchema);
    const trip = await load(ownerId, tripId);
    if (!trip.days.some((day) => day.id === dayId)) throw new TripNotFound("Day not found");
    return c.json(
      await edit(ownerId, tripId, input.version, {
        days: trip.days.filter((day) => day.id !== dayId),
      })
    );
  });
  app.post("/trips/:id/days/:dayId/activities", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const dayId = id(c.req.param("dayId"));
    const input = await body(c, activityCreateSchema);
    const trip = await load(ownerId, tripId);
    if (!trip.days.some((day) => day.id === dayId)) throw new TripNotFound("Day not found");
    return c.json(
      await edit(ownerId, tripId, input.version, {
        days: trip.days.map((day) =>
          day.id === dayId ? { ...day, activities: [...day.activities, input.activity] } : day
        ),
      })
    );
  });
  app.patch("/trips/:id/activities/:activityId", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const activityId = id(c.req.param("activityId"));
    const input = await body(c, activityUpdateSchema);
    const trip = await load(ownerId, tripId);
    if (!trip.days.some((day) => day.activities.some((activity) => activity.id === activityId)))
      throw new ActivityNotFound("Activity not found");
    return c.json(
      await edit(ownerId, tripId, input.version, {
        days: trip.days.map((day) => ({
          ...day,
          activities: day.activities.map((activity) =>
            activity.id === activityId ? { ...activity, ...input.changes } : activity
          ),
        })),
      })
    );
  });
  app.delete("/trips/:id/activities/:activityId", async (c) => {
    const ownerId = await owner(c);
    const tripId = id(c.req.param("id"));
    const activityId = id(c.req.param("activityId"));
    const input = await body(c, versionSchema);
    const trip = await load(ownerId, tripId);
    if (!trip.days.some((day) => day.activities.some((activity) => activity.id === activityId)))
      throw new ActivityNotFound("Activity not found");
    return c.json(
      await edit(ownerId, tripId, input.version, {
        days: trip.days.map((day) => ({
          ...day,
          activities: day.activities.filter((activity) => activity.id !== activityId),
        })),
      })
    );
  });
  app.post("/trips/:id/share", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, versionSchema);
    return c.json(await trips.share(ownerId, id(c.req.param("id")), input.version));
  });
  app.delete("/trips/:id/share", async (c) => {
    const ownerId = await owner(c);
    const input = await body(c, versionSchema);
    return c.json(await trips.revoke(ownerId, id(c.req.param("id")), input.version));
  });
  app.get("/shared/:ownerId/:tripId/:token", async (c) => {
    const shared = await trips.publicByToken(
      c.req.param("token"),
      c.req.param("ownerId"),
      id(c.req.param("tripId"))
    );
    return shared ? c.json(shared) : c.json({ error: "Not found" }, 404);
  });
  app.get("/openapi.json", (c) => c.json(openApiDocument));
  app.get("/docs", (c) =>
    c.html(
      `<!doctype html><html><head><title>Wander REST API</title><link rel="stylesheet" href="/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/docs/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui'});</script></body></html>`
    )
  );
  app.get("/docs/swagger-ui.css", (c) =>
    c.body(readFileSync(`${swaggerRoot}/swagger-ui.css`), 200, { "content-type": "text/css" })
  );
  app.get("/docs/swagger-ui-bundle.js", (c) =>
    c.body(readFileSync(`${swaggerRoot}/swagger-ui-bundle.js`), 200, {
      "content-type": "application/javascript",
    })
  );
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
      endpoints: ["/hello", "/health", "/docs"],
    })
  );
  return app;
}

import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";
import { demoTrips } from "../src/store/fixtures";
import { createMemoryStore } from "../src/store/memory";
import type { AuthPort } from "../src/auth/port";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});
async function start(app: ReturnType<typeof createApp>) {
  server = await new Promise<Server>((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () =>
      resolve(started)
    );
  });
  return server;
}
const token = "Bearer demo";
const body = (version: number) => ({ version });
const fixture = demoTrips()[0];
if (!fixture) throw new Error("Missing fixture");

it("serves an owned trip lifecycle and a revocable public projection over HTTP", async () => {
  const store = createMemoryStore();
  const api = await start(createApp(parseEnv({}), store));
  expect((await request(api).get("/trips")).status).toBe(401);
  expect((await request(api).get("/trips").set("Authorization", "Bearer wrong")).status).toBe(401);
  const created = await request(api).post("/trips").set("Authorization", token).send({
    city: fixture.city,
    preferences: fixture.preferences,
    days: fixture.days,
  });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const list = await request(api).get("/trips?limit=1").set("Authorization", token);
  expect(list.body.items).toHaveLength(1);
  const batch = await request(api)
    .post("/trips/batch")
    .set("Authorization", token)
    .send({ ids: [id, "30000000-0000-4000-8000-000000000099"] });
  expect(batch.body.items.map((item: { id: string }) => item.id)).toEqual([id]);
  const preferences = await request(api)
    .put(`/trips/${id}/preferences`)
    .set("Authorization", token)
    .send({ version: 1, preferences: { interests: ["art"], pace: "relaxed" } });
  expect(preferences.status).toBe(200);
  expect(preferences.body.version).toBe(2);
  expect(
    (
      await request(api)
        .put(`/trips/${id}/preferences`)
        .set("Authorization", token)
        .send({ version: 1, preferences: fixture.preferences })
    ).status
  ).toBe(409);
  const activityId = fixture.days[0]?.activities[0]?.id;
  if (!activityId) throw new Error("Missing activity");
  const pinned = await request(api)
    .post(`/trips/${id}/pin`)
    .set("Authorization", token)
    .send({ version: 2, activityId, pinned: true });
  expect(pinned.body.days[0].activities[0].pinned).toBe(true);
  expect(
    (
      await request(api)
        .post(`/trips/${id}/swap`)
        .set("Authorization", token)
        .send({
          version: 3,
          activityId,
          replacement: { id: activityId, title: "New", pinned: false },
        })
    ).status
  ).toBe(400);
  const shared = await request(api)
    .post(`/trips/${id}/share`)
    .set("Authorization", token)
    .send(body(3));
  expect(shared.status).toBe(200);
  const publicPath = `/shared/demo/${id}/${shared.body.token}`;
  const publicView = await request(api).get(publicPath);
  expect(publicView.body).toHaveProperty("city", fixture.city);
  expect(publicView.body).not.toHaveProperty("ownerId");
  expect(publicView.body).not.toHaveProperty("preferences");
  const revoked = await request(api)
    .delete(`/trips/${id}/share`)
    .set("Authorization", token)
    .send(body(4));
  expect(revoked.status).toBe(200);
  expect((await request(api).get(publicPath)).status).toBe(404);
  expect(
    (await request(api).delete(`/trips/${id}`).set("Authorization", token).send(body(5))).status
  ).toBe(204);
  expect((await request(api).get(`/trips/${id}`).set("Authorization", token)).status).toBe(404);
});

it("isolates owners, rejects expired shares, and enforces body and rate limits", async () => {
  const store = createMemoryStore();
  await store.reset([
    {
      ...fixture,
      share: {
        token: "x".repeat(32),
        createdAt: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-02T00:00:00.000Z",
      },
    },
  ]);
  const auth: AuthPort = {
    async authenticate(header) {
      if (header === "Bearer alice") return { id: "demo" };
      if (header === "Bearer bob") return { id: "bob" };
      throw new Error("unauthorized test token");
    },
  };
  const api = await start(createApp(parseEnv({}), store, auth));
  expect(
    (await request(api).get(`/trips/${fixture.id}`).set("Authorization", "Bearer bob")).status
  ).toBe(404);
  expect(
    (
      await request(api)
        .post("/trips/batch")
        .set("Authorization", "Bearer bob")
        .send({ ids: [fixture.id] })
    ).body.items
  ).toEqual([]);
  expect((await request(api).get(`/shared/demo/${fixture.id}/${"x".repeat(32)}`)).status).toBe(404);
  expect(
    (
      await request(api)
        .post("/trips")
        .set("Authorization", "Bearer alice")
        .send({ city: "x".repeat(70000) })
    ).status
  ).toBe(400);
  const limited = createApp(parseEnv({ RATE_LIMIT_PER_MINUTE: "1" }));
  const first = await limited.request("/trips", { headers: { authorization: token } });
  const second = await limited.request("/trips", { headers: { authorization: token } });
  expect(first.status).toBe(200);
  expect(second.status).toBe(429);
});

it("edits days and activities with versioned HTTP operations", async () => {
  const store = createMemoryStore();
  await store.write(fixture, null);
  const api = await start(createApp(parseEnv({}), store));
  const tripPath = `/trips/${fixture.id}`;
  const newDay = { id: "10000000-0000-4000-8000-000000000099", date: "2026-10-02", activities: [] };
  const added = await request(api)
    .post(`${tripPath}/days`)
    .set("Authorization", token)
    .send({ version: 1, day: newDay });
  expect(added.body.days).toHaveLength(2);
  const patched = await request(api)
    .patch(`${tripPath}/days/${newDay.id}`)
    .set("Authorization", token)
    .send({ version: 2, changes: { date: "2026-10-03" } });
  expect(patched.body.days[1].date).toBe("2026-10-03");
  const activity = { id: "20000000-0000-4000-8000-000000000099", title: "Museum", pinned: false };
  const withActivity = await request(api)
    .post(`${tripPath}/days/${newDay.id}/activities`)
    .set("Authorization", token)
    .send({ version: 3, activity });
  expect(withActivity.body.days[1].activities).toHaveLength(1);
  const updated = await request(api)
    .patch(`${tripPath}/activities/${activity.id}`)
    .set("Authorization", token)
    .send({ version: 4, changes: { title: "Gallery" } });
  expect(updated.body.days[1].activities[0].title).toBe("Gallery");
  const removed = await request(api)
    .delete(`${tripPath}/activities/${activity.id}`)
    .set("Authorization", token)
    .send(body(5));
  expect(removed.body.days[1].activities).toEqual([]);
  const withoutDay = await request(api)
    .delete(`${tripPath}/days/${newDay.id}`)
    .set("Authorization", token)
    .send(body(6));
  expect(withoutDay.body.days).toHaveLength(1);
  const duplicate = await request(api)
    .patch(tripPath)
    .set("Authorization", token)
    .send({ version: 7, changes: { days: [fixture.days[0], fixture.days[0]] } });
  expect(duplicate.status).toBe(400);
  expect((await store.get("demo", fixture.id))?.version).toBe(7);
});

it("serves the generated OpenAPI snapshot and local Swagger assets", async () => {
  const api = await start(createApp(parseEnv({})));
  const spec = await request(api).get("/openapi.json");
  expect(spec.status).toBe(200);
  expect(spec.body).toEqual(
    JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"))
  );
  expect(Object.keys(spec.body.paths)).toContain("/trips/batch");
  const docs = await request(api).get("/docs");
  expect(docs.status).toBe(200);
  expect(docs.text).toContain("swagger-ui-bundle.js");
  expect((await request(api).get("/docs/swagger-ui.css")).status).toBe(200);
});

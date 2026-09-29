/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, it } from "vitest";
import { createMemoryStore } from "../src/store/memory";
import { demoTrips } from "../src/store/fixtures";
import { StoreConflict } from "../src/store/port";
import { createTripService } from "../src/service/trips";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";
import { tripSchema } from "../src/domain/trip";

const fixture = demoTrips()[0];
if (!fixture) throw new Error("Missing fixture");
const authHeaders = { authorization: "Bearer demo" };
function service() {
  const store = createMemoryStore();
  const trips = createTripService({
    store,
    now: () => "2026-10-02T00:00:00.000Z",
    id: () => "30000000-0000-4000-8000-000000000001",
    token: () => "a".repeat(32),
  });
  return { store, trips };
}
it("applies update, pin, swap and private share projection rules", async () => {
  const { store, trips } = service();
  await store.write(fixture, null);
  const updated = await trips.update("demo", fixture.id, 1, { city: "Porto" });
  expect(updated.version).toBe(2);
  await expect(trips.update("demo", fixture.id, 1, { city: "Rome" })).rejects.toBeInstanceOf(
    StoreConflict
  );
  const activityId = fixture.days[0]?.activities[0]?.id ?? "";
  const pinned = await trips.pin("demo", fixture.id, 2, activityId, true);
  expect(pinned.days[0]?.activities[0]?.pinned).toBe(true);
  expect(
    pinned.days.flatMap((day) => day.activities).filter((activity) => activity.pinned)
  ).toHaveLength(1);
  await expect(
    trips.swap("demo", fixture.id, 3, activityId, { id: activityId, title: "New", pinned: false })
  ).rejects.toThrow("Pinned");
  await trips.pin("demo", fixture.id, 3, activityId, false);
  const swapped = await trips.swap("demo", fixture.id, 4, activityId, {
    id: activityId,
    title: "New",
    pinned: false,
  });
  expect(
    swapped.days.flatMap((day) => day.activities).filter((activity) => activity.title === "New")
  ).toHaveLength(1);
  const share = await trips.share("demo", fixture.id, 5);
  const publicView = await trips.publicByToken(share.token, "demo", fixture.id);
  expect(publicView).toHaveProperty("city", "Porto");
  expect(publicView).not.toHaveProperty("ownerId");
  expect(publicView).not.toHaveProperty("preferences");
  expect(await trips.publicByToken("wrong", "demo", fixture.id)).toBeNull();
});
it("rejects duplicate day and activity IDs without storing changes", async () => {
  const { store, trips } = service();
  await store.write(fixture, null);
  const firstDay = fixture.days[0]!;
  const firstActivity = firstDay.activities[0]!;
  const secondDay = { ...firstDay, id: "10000000-0000-4000-8000-000000000099" };
  for (const days of [
    [{ ...firstDay, activities: [firstActivity, { ...firstActivity }] }],
    [firstDay, { ...secondDay, activities: [{ ...firstActivity }] }],
    [firstDay, { ...firstDay }],
  ]) {
    await expect(
      trips.create("demo", { city: "Test", preferences: fixture.preferences, days })
    ).rejects.toThrow();
    await expect(trips.update("demo", fixture.id, 1, { days })).rejects.toThrow();
    expect(await store.get("demo", fixture.id)).toEqual(fixture);
  }
});
it("creates and reads a trip through Hono", async () => {
  const app = createApp(parseEnv({}));
  const created = await app.request("/trips", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify({
      city: fixture.city,
      days: fixture.days,
      preferences: fixture.preferences,
    }),
  });
  expect(created.status).toBe(201);
  const trip = (await created.json()) as { id: string };
  expect((await app.request(`/trips/${trip.id}`, { headers: authHeaders })).status).toBe(200);
  expect(
    (await app.request("/trips/30000000-0000-4000-8000-000000000099", { headers: authHeaders }))
      .status
  ).toBe(404);
});
it("classifies malformed client requests and masks unexpected store failures", async () => {
  const app = createApp(parseEnv({}));
  const badJson = await app.request("/trips", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: "{",
  });
  expect(badJson.status).toBe(400);
  expect((await app.request("/trips?cursor=bad!", { headers: authHeaders })).status).toBe(400);
  const duplicate = await app.request("/trips", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify({
      city: fixture.city,
      preferences: fixture.preferences,
      days: [
        {
          ...fixture.days[0],
          activities: [fixture.days[0]!.activities[0], fixture.days[0]!.activities[0]],
        },
      ],
    }),
  });
  expect(duplicate.status).toBe(400);
  const failingStore = {
    ...createMemoryStore(),
    list: async () => {
      throw new Error("PRIVATE_STORE_SENTINEL");
    },
  };
  const failure = await createApp(parseEnv({}), failingStore).request("/trips", {
    headers: authHeaders,
  });
  expect(failure.status).toBe(500);
  expect(await failure.text()).not.toContain("PRIVATE_STORE_SENTINEL");
  const invalidInternalStore = {
    ...createMemoryStore(),
    write: async () => {
      tripSchema.parse({ ...fixture, id: "PRIVATE_WRITE_SENTINEL" });
    },
  };
  const internalFailure = await createApp(parseEnv({}), invalidInternalStore).request("/trips", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify({
      city: fixture.city,
      preferences: fixture.preferences,
      days: fixture.days,
    }),
  });
  expect(internalFailure.status).toBe(500);
  expect(await internalFailure.text()).not.toContain("PRIVATE_WRITE_SENTINEL");
});

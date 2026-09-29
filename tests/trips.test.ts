import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/store/memory";
import { demoTrips } from "../src/store/fixtures";
import { StoreConflict } from "../src/store/port";
import { createTripService } from "../src/service/trips";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";

const fixture = demoTrips()[0];
if (!fixture) throw new Error("Missing fixture");
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
describe("memory trip contract", () => {
  it("isolates owners and copies stored documents", async () => {
    const { store } = service();
    await store.reset(demoTrips());
    expect(await store.get("other", fixture.id)).toBeNull();
    const trip = await store.get("demo", fixture.id);
    if (!trip) throw new Error("Missing trip");
    trip.city = "Changed";
    expect((await store.get("demo", fixture.id))?.city).toBe("Lisbon");
    expect(await store.batch("other", [fixture.id])).toEqual([]);
    expect(await store.delete("demo", "missing", 1)).toBe(false);
  });
  it("pages in stable ID order and rejects invalid cursors", async () => {
    const { store } = service();
    await store.reset(demoTrips().reverse());
    const first = await store.list("demo", 2);
    expect(first.items.map((trip) => trip.city)).toEqual(["Lisbon", "Kyoto"]);
    expect(first.nextCursor).toBeTruthy();
    expect(
      (await store.list("demo", 2, first.nextCursor ?? undefined)).items.map((trip) => trip.city)
    ).toEqual(["Montreal"]);
    await expect(store.list("demo", 2, "bad!")).rejects.toThrow("Invalid cursor");
  });
  it("rejects stale writes and deletes", async () => {
    const { store } = service();
    await store.write(fixture, null);
    await expect(store.write(fixture, null)).rejects.toBeInstanceOf(StoreConflict);
    await expect(store.delete("demo", fixture.id, 2)).rejects.toBeInstanceOf(StoreConflict);
  });
});
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
  await expect(
    trips.swap("demo", fixture.id, 3, activityId, { id: activityId, title: "New", pinned: false })
  ).rejects.toThrow("Pinned");
  await trips.pin("demo", fixture.id, 3, activityId, false);
  await trips.swap("demo", fixture.id, 4, activityId, {
    id: activityId,
    title: "New",
    pinned: false,
  });
  const share = await trips.share("demo", fixture.id, 5);
  const publicView = await trips.publicByToken(share.token, "demo", fixture.id);
  expect(publicView).toHaveProperty("city", "Porto");
  expect(publicView).not.toHaveProperty("ownerId");
  expect(publicView).not.toHaveProperty("preferences");
  expect(await trips.publicByToken("wrong", "demo", fixture.id)).toBeNull();
});
it("creates and reads a trip through Hono", async () => {
  const app = createApp(parseEnv({}));
  const created = await app.request("/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: fixture.city,
      days: fixture.days,
      preferences: fixture.preferences,
    }),
  });
  expect(created.status).toBe(201);
  const trip = (await created.json()) as { id: string };
  expect((await app.request(`/trips/${trip.id}`)).status).toBe(200);
  expect((await app.request("/trips/missing")).status).toBe(404);
});

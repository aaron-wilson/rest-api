import type { Trip } from "../domain/trip";
import { InvalidCursor, StoreConflict, type TripStore } from "./port";

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function cursorFor(id: string) {
  return Buffer.from(id).toString("base64url");
}
function parseCursor(cursor: string) {
  const id = Buffer.from(cursor, "base64url").toString();
  if (!id || cursorFor(id) !== cursor) throw new InvalidCursor("Invalid cursor");
  return id;
}
export function createMemoryStore(): TripStore {
  const records = new Map<string, Trip>();
  const key = (ownerId: string, id: string) => `${ownerId}\0${id}`;
  return {
    async get(ownerId, id) {
      return structuredClone(records.get(key(ownerId, id)) ?? null);
    },
    async list(ownerId, limit, cursor) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid limit");
      const after = cursor ? parseCursor(cursor) : "";
      const matching = [...records.values()]
        .filter((trip) => trip.ownerId === ownerId && compareIds(trip.id, after) > 0)
        .sort((a, b) => compareIds(a.id, b.id));
      const items = matching.slice(0, limit);
      const last = items.at(-1);
      return {
        items: structuredClone(items),
        nextCursor: matching.length > limit && last ? cursorFor(last.id) : null,
      };
    },
    async write(trip, expectedVersion) {
      const parsed = records.get(key(trip.ownerId, trip.id));
      if (
        (parsed?.version ?? null) !== expectedVersion ||
        (expectedVersion !== null && trip.version !== expectedVersion + 1) ||
        (expectedVersion === null && trip.version !== 1)
      )
        throw new StoreConflict("Stale trip version");
      records.set(key(trip.ownerId, trip.id), structuredClone(trip));
    },
    async delete(ownerId, id, expectedVersion) {
      const existing = records.get(key(ownerId, id));
      if (!existing) return false;
      if (existing.version !== expectedVersion) throw new StoreConflict("Stale trip version");
      return records.delete(key(ownerId, id));
    },
    async batch(ownerId, ids) {
      return structuredClone(
        ids.map((id) => records.get(key(ownerId, id))).filter((trip): trip is Trip => Boolean(trip))
      );
    },
    async reset(trips = []) {
      records.clear();
      for (const trip of trips) records.set(key(trip.ownerId, trip.id), structuredClone(trip));
    },
  };
}

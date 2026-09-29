import { randomBytes, randomUUID } from "node:crypto";
import {
  createTripSchema,
  createTrip,
  pinActivity,
  publicTrip,
  swapActivity,
  updateTrip,
  updateTripSchema,
  activitySchema,
  type Trip,
} from "../domain/trip";
import type { TripStore } from "../store/port";

export interface TripDeps {
  store: TripStore;
  now?: () => string;
  id?: () => string;
  token?: () => string;
}
export class TripNotFound extends Error {}
export function createTripService({
  store,
  now = () => new Date().toISOString(),
  id = randomUUID,
  token = () => randomBytes(24).toString("base64url"),
}: TripDeps) {
  async function requireTrip(ownerId: string, tripId: string) {
    const trip = await store.get(ownerId, tripId);
    if (!trip) throw new TripNotFound("Trip not found");
    return trip;
  }
  return {
    get: (ownerId: string, tripId: string) => store.get(ownerId, tripId),
    list: (ownerId: string, limit: number, cursor?: string) => store.list(ownerId, limit, cursor),
    batch: (ownerId: string, ids: string[]) => store.batch(ownerId, ids),
    async create(ownerId: string, input: unknown) {
      const data = createTripSchema.parse(input);
      const trip = createTrip(ownerId, data, id(), now());
      await store.write(trip, null);
      return trip;
    },
    async update(ownerId: string, tripId: string, version: number, changes: unknown) {
      const trip = await requireTrip(ownerId, tripId);
      const updated = updateTrip(trip, updateTripSchema.parse(changes), now());
      await store.write(updated, version);
      return updated;
    },
    async pin(
      ownerId: string,
      tripId: string,
      version: number,
      activityId: string,
      pinned: boolean
    ) {
      const trip = await requireTrip(ownerId, tripId);
      const updated = pinActivity(trip, activityId, pinned, now());
      await store.write(updated, version);
      return updated;
    },
    async swap(
      ownerId: string,
      tripId: string,
      version: number,
      activityId: string,
      replacement: unknown
    ) {
      const trip = await requireTrip(ownerId, tripId);
      const updated = swapActivity(trip, activityId, activitySchema.parse(replacement), now());
      await store.write(updated, version);
      return updated;
    },
    async share(ownerId: string, tripId: string, version: number) {
      const trip = await requireTrip(ownerId, tripId);
      const timestamp = now();
      const updated: Trip = {
        ...trip,
        share: {
          token: token(),
          createdAt: timestamp,
          expiresAt: new Date(Date.parse(timestamp) + 7 * 86400_000).toISOString(),
        },
        updatedAt: timestamp,
        version: trip.version + 1,
      };
      await store.write(updated, version);
      return updated.share;
    },
    async revoke(ownerId: string, tripId: string, version: number) {
      const trip = await requireTrip(ownerId, tripId);
      const updated = updateTrip(trip, {}, now());
      updated.share = null;
      await store.write(updated, version);
      return updated;
    },
    async delete(ownerId: string, tripId: string, version: number) {
      const deleted = await store.delete(ownerId, tripId, version);
      if (!deleted) throw new TripNotFound("Trip not found");
    },
    async publicByToken(shareToken: string, ownerId: string, tripId: string) {
      const trip = await store.get(ownerId, tripId);
      return trip?.share?.token === shareToken && trip.share.expiresAt > now()
        ? publicTrip(trip)
        : null;
    },
  };
}

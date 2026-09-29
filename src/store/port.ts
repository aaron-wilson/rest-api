import type { Trip } from "../domain/trip";
export class StoreConflict extends Error {}
export class InvalidCursor extends Error {}
export class StoreUnavailable extends Error {}
export interface TripStore {
  get(ownerId: string, id: string): Promise<Trip | null>;
  list(
    ownerId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: Trip[]; nextCursor: string | null }>;
  write(trip: Trip, expectedVersion: number | null): Promise<void>;
  delete(ownerId: string, id: string, expectedVersion: number): Promise<boolean>;
  batch(ownerId: string, ids: string[]): Promise<Trip[]>;
  reset(trips?: Trip[]): Promise<void>;
}

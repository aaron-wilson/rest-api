/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";
import type { TripStore } from "../src/store/port";
import { InvalidCursor, StoreConflict } from "../src/store/port";
import { demoTrips } from "../src/store/fixtures";

export function tripStoreContract(
  name: string,
  freshStore: () => TripStore,
  cleanup?: (store: TripStore) => Promise<void>
) {
  async function withStore(run: (store: TripStore) => Promise<void>) {
    const store = freshStore();
    try {
      await run(store);
    } finally {
      await cleanup?.(store);
    }
  }
  describe(name, () => {
    it("isolates owners, missing IDs and all read/write boundaries", () =>
      withStore(async (store) => {
        const input = demoTrips();
        const original = structuredClone(input[0]!);
        await store.reset(input);
        input[0]!.city = "changed reset input";
        input[0]!.days[0]!.activities[0]!.title = "changed reset nested input";
        expect(await store.get("other", original.id)).toBeNull();
        expect(await store.batch("other", [original.id])).toEqual([]);
        expect(await store.batch("demo", ["missing", original.id, "missing"])).toEqual([original]);
        const fromGet = (await store.get("demo", original.id))!;
        fromGet.city = "changed get";
        fromGet.days[0]!.activities[0]!.title = "changed get nested";
        const fromBatch = (await store.batch("demo", [original.id]))[0]!;
        fromBatch.city = "changed batch";
        fromBatch.days[0]!.activities[0]!.title = "changed batch nested";
        const fromList = (await store.list("demo", 1)).items[0]!;
        fromList.city = "changed list";
        fromList.days[0]!.activities[0]!.title = "changed list nested";
        expect(await store.get("demo", original.id)).toEqual(original);
        expect(await store.delete("demo", "missing", 1)).toBe(false);
        const written = {
          ...structuredClone(original),
          id: "a0000000-0000-4000-8000-000000000001",
        };
        await store.write(written, null);
        written.city = "changed write";
        written.days[0]!.activities[0]!.title = "changed write nested";
        expect((await store.get("demo", written.id))?.city).toBe(original.city);
        expect((await store.get("demo", written.id))?.days[0]?.activities[0]?.title).toBe(
          original.days[0]?.activities[0]?.title
        );
      }));
    it("enforces versions on writes and deletes", () =>
      withStore(async (store) => {
        const trip = demoTrips()[0]!;
        await store.write(trip, null);
        await expect(store.write(trip, null)).rejects.toBeInstanceOf(StoreConflict);
        await expect(store.delete("demo", trip.id, 2)).rejects.toBeInstanceOf(StoreConflict);
        await store.write({ ...trip, version: 2 }, 1);
        expect((await store.get("demo", trip.id))?.version).toBe(2);
        expect(await store.delete("other", trip.id, 2)).toBe(false);
        expect(await store.delete("demo", trip.id, 2)).toBe(true);
        expect(await store.get("demo", trip.id)).toBeNull();
      }));
    it("pages every mixed-case ID exactly once in code-unit order", () =>
      withStore(async (store) => {
        const fixture = demoTrips()[0]!;
        const ids = [
          "a0000000-0000-4000-8000-000000000001",
          "B0000000-0000-4000-8000-000000000001",
          "c0000000-0000-4000-8000-000000000001",
        ];
        await store.reset(ids.map((id) => ({ ...structuredClone(fixture), id })));
        const seen: string[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < ids.length; page++) {
          const result = await store.list("demo", 1, cursor);
          expect(result.items).toHaveLength(1);
          seen.push(result.items[0]!.id);
          cursor = result.nextCursor ?? undefined;
          if (page < ids.length - 1) expect(result.nextCursor).not.toBeNull();
          else expect(result.nextCursor).toBeNull();
        }
        expect(seen).toEqual([ids[1], ids[0], ids[2]]);
        await expect(store.list("demo", 1, "bad!")).rejects.toBeInstanceOf(InvalidCursor);
        expect((await store.list("other", 10)).items).toEqual([]);
      }));
  });
}

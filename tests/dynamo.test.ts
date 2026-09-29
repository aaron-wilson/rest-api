import { describe, expect, it, vi } from "vitest";
import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { createDynamoStore } from "../src/store/dynamo";
import { demoTrips } from "../src/store/fixtures";
import { StoreConflict, StoreUnavailable } from "../src/store/port";

function fakeClient(send: (command: unknown) => Promise<unknown>) {
  return { send } as unknown as DynamoDBDocumentClient;
}
const trip = demoTrips()[0];
if (!trip) throw new Error("Missing fixture");

describe("DynamoDB adapter", () => {
  it("uses owner keys and conditional versions", async () => {
    const send = vi.fn(async (command: unknown) => {
      void command;
      return {};
    });
    const store = createDynamoStore(fakeClient(send), "Trips");
    await store.write(trip, null);
    const create = send.mock.calls[0]?.[0];
    expect(create).toBeInstanceOf(PutCommand);
    expect((create as PutCommand).input).toMatchObject({
      TableName: "Trips",
      ConditionExpression: "attribute_not_exists(PK)",
      Item: { PK: "OWNER#demo", SK: `TRIP#${trip.id}`, version: 1 },
    });
    await store.write({ ...trip, version: 2 }, 1);
    expect((send.mock.calls[1]?.[0] as PutCommand).input.ConditionExpression).toBe(
      "#v = :expected"
    );
    await expect(store.write(trip, 1)).rejects.toBeInstanceOf(StoreConflict);
    send.mockRejectedValueOnce(
      Object.assign(new Error("private"), { name: "ConditionalCheckFailedException" })
    );
    await expect(store.write({ ...trip, version: 2 }, 1)).rejects.toBeInstanceOf(StoreConflict);
  });
  it("validates stored responses and normalizes provider failures", async () => {
    const malformed = createDynamoStore(
      fakeClient(async () => ({ Item: { ...trip, city: "" } })),
      "Trips"
    );
    await expect(malformed.get("demo", trip.id)).rejects.toBeInstanceOf(StoreUnavailable);
    const unavailable = createDynamoStore(
      fakeClient(async () => {
        throw new Error("PRIVATE_PROVIDER_SENTINEL");
      }),
      "Trips"
    );
    await expect(unavailable.get("demo", trip.id)).rejects.toThrow("Trip store unavailable");
  });
  it("uses key order for paging and retries unprocessed batch keys", async () => {
    const second = { ...trip, id: "B0000000-0000-4000-8000-000000000001" };
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof QueryCommand) {
        expect(command.input.ExpressionAttributeValues).toMatchObject({ ":pk": "OWNER#demo" });
        return { Items: [trip, second], LastEvaluatedKey: undefined };
      }
      if (command instanceof BatchGetCommand) {
        return send.mock.calls.filter((call) => call[0] instanceof BatchGetCommand).length === 1
          ? {
              Responses: { Trips: [trip] },
              UnprocessedKeys: { Trips: { Keys: [{ PK: "OWNER#demo", SK: `TRIP#${second.id}` }] } },
            }
          : { Responses: { Trips: [second] } };
      }
      if (command instanceof GetCommand) return { Item: trip };
      return {};
    });
    const store = createDynamoStore(fakeClient(send), "Trips");
    const page = await store.list("demo", 1);
    expect(page.items).toEqual([trip]);
    expect(page.nextCursor).toBeTruthy();
    expect(
      (await store.batch("demo", [second.id, trip.id, "missing"])).map((item) => item.id)
    ).toEqual([second.id, trip.id]);
  });
});

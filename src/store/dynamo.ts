import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { tripSchema, type Trip } from "../domain/trip";
import { InvalidCursor, StoreConflict, StoreUnavailable, type TripStore } from "./port";

const pk = (ownerId: string) => `OWNER#${ownerId}`;
const sk = (id: string) => `TRIP#${id}`;
const key = (ownerId: string, id: string) => ({ PK: pk(ownerId), SK: sk(id) });
const cursorFor = (id: string) => Buffer.from(id).toString("base64url");
function parseCursor(cursor: string) {
  const id = Buffer.from(cursor, "base64url").toString();
  if (!id || cursorFor(id) !== cursor) throw new InvalidCursor("Invalid cursor");
  return id;
}
function parseTrip(item: unknown): Trip {
  const parsed = tripSchema.safeParse(item);
  if (!parsed.success) throw new StoreUnavailable("Invalid stored trip");
  return parsed.data;
}
function providerError(error: unknown): never {
  if (
    error instanceof StoreConflict ||
    error instanceof InvalidCursor ||
    error instanceof StoreUnavailable
  )
    throw error;
  throw new StoreUnavailable("Trip store unavailable");
}
function isConditional(error: unknown) {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}
export function createDynamoStore(
  client: DynamoDBDocumentClient,
  table: string,
  allowReset = false
): TripStore {
  async function get(ownerId: string, id: string) {
    try {
      const result = await client.send(
        new GetCommand({ TableName: table, Key: key(ownerId, id), ConsistentRead: true })
      );
      if (!result.Item) return null;
      const trip = parseTrip(result.Item);
      if (trip.ownerId !== ownerId || trip.id !== id)
        throw new StoreUnavailable("Invalid stored trip");
      return trip;
    } catch (error) {
      return providerError(error);
    }
  }
  return {
    get,
    async list(ownerId, limit, cursor) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid limit");
      const after = cursor ? parseCursor(cursor) : "";
      const items: Trip[] = [];
      let start: Record<string, unknown> | undefined;
      try {
        do {
          const result = await client.send(
            new QueryCommand({
              TableName: table,
              KeyConditionExpression: "PK = :pk AND SK > :after",
              ExpressionAttributeValues: { ":pk": pk(ownerId), ":after": sk(after) },
              ExclusiveStartKey: start,
              Limit: limit + 1 - items.length,
              ConsistentRead: true,
            })
          );
          for (const item of result.Items ?? []) {
            const trip = parseTrip(item);
            if (trip.ownerId !== ownerId) throw new StoreUnavailable("Invalid stored owner");
            items.push(trip);
          }
          start = result.LastEvaluatedKey;
        } while (items.length <= limit && start);
        const page = items.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page,
          nextCursor: items.length > limit && last ? cursorFor(last.id) : null,
        };
      } catch (error) {
        return providerError(error);
      }
    },
    async write(trip, expectedVersion) {
      if (
        (expectedVersion === null && trip.version !== 1) ||
        (expectedVersion !== null && trip.version !== expectedVersion + 1)
      )
        throw new StoreConflict("Stale trip version");
      try {
        await client.send(
          new PutCommand({
            TableName: table,
            Item: { ...trip, ...key(trip.ownerId, trip.id) },
            ConditionExpression:
              expectedVersion === null ? "attribute_not_exists(PK)" : "#v = :expected",
            ExpressionAttributeNames: expectedVersion === null ? undefined : { "#v": "version" },
            ExpressionAttributeValues:
              expectedVersion === null ? undefined : { ":expected": expectedVersion },
          })
        );
      } catch (error) {
        if (isConditional(error)) throw new StoreConflict("Stale trip version");
        providerError(error);
      }
    },
    async delete(ownerId, id, expectedVersion) {
      try {
        await client.send(
          new DeleteCommand({
            TableName: table,
            Key: key(ownerId, id),
            ConditionExpression: "#v = :expected",
            ExpressionAttributeNames: { "#v": "version" },
            ExpressionAttributeValues: { ":expected": expectedVersion },
          })
        );
        return true;
      } catch (error) {
        if (isConditional(error)) {
          if (!(await get(ownerId, id))) return false;
          throw new StoreConflict("Stale trip version");
        }
        return providerError(error);
      }
    },
    async batch(ownerId, ids) {
      if (ids.length === 0) return [];
      const unique = [...new Set(ids)];
      const found = new Map<string, Trip>();
      try {
        for (let offset = 0; offset < unique.length; offset += 100) {
          let request: Record<
            string,
            { Keys: Record<string, string>[]; ConsistentRead?: boolean }
          > = {
            [table]: {
              Keys: unique.slice(offset, offset + 100).map((id) => key(ownerId, id)),
              ConsistentRead: true,
            },
          };
          for (let attempt = 0; attempt < 5; attempt++) {
            const result = await client.send(new BatchGetCommand({ RequestItems: request }));
            for (const item of result.Responses?.[table] ?? []) {
              const trip = parseTrip(item);
              if (trip.ownerId !== ownerId) throw new StoreUnavailable("Invalid stored owner");
              found.set(trip.id, trip);
            }
            const pending = result.UnprocessedKeys?.[table];
            if (!pending?.Keys?.length) break;
            if (attempt === 4) throw new StoreUnavailable("Trip store unavailable");
            request = {
              [table]: { Keys: pending.Keys as Record<string, string>[], ConsistentRead: true },
            };
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(25 * 2 ** attempt + Math.random() * 10, 250))
            );
          }
        }
        return ids.flatMap((id) => {
          const trip = found.get(id);
          return trip ? [structuredClone(trip)] : [];
        });
      } catch (error) {
        return providerError(error);
      }
    },
    async reset(trips = []) {
      if (!allowReset) throw new StoreUnavailable("Reset disabled");
      try {
        let start: Record<string, unknown> | undefined;
        do {
          const result = await client.send(
            new ScanCommand({
              TableName: table,
              ProjectionExpression: "PK, SK",
              ExclusiveStartKey: start,
            })
          );
          for (const item of result.Items ?? [])
            await client.send(
              new DeleteCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK } })
            );
          start = result.LastEvaluatedKey;
        } while (start);
        for (const trip of trips)
          await client.send(
            new PutCommand({ TableName: table, Item: { ...trip, ...key(trip.ownerId, trip.id) } })
          );
      } catch (error) {
        providerError(error);
      }
    },
  };
}

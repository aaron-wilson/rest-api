import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { parseEnv } from "../config/env";
import { createDynamoStore } from "./dynamo";
import { createMemoryStore } from "./memory";

export function selectStore(config: ReturnType<typeof parseEnv>) {
  if (config.storeProvider === "memory") return createMemoryStore();
  if (!config.dynamoTable) throw new Error("DynamoDB table required");
  const endpoint = config.dynamoEndpoint;
  const client = new DynamoDBClient({
    region: config.awsRegion,
    ...(endpoint
      ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
      : {}),
  });
  return createDynamoStore(
    DynamoDBDocumentClient.from(client),
    config.dynamoTable,
    Boolean(endpoint)
  );
}

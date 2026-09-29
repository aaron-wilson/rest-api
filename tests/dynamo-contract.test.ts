import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { it } from "vitest";
import { parseEnv } from "../src/config/env";
import { createDynamoStore } from "../src/store/dynamo";
import { tripStoreContract } from "./store-contract";

if (process.env.RUN_DYNAMO_CONTRACT === "1") {
  const config = parseEnv(process.env);
  if (!config.dynamoEndpoint || !config.dynamoTable)
    throw new Error("DynamoDB Local endpoint and table required for contract test");
  const table = config.dynamoTable;
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: config.awsRegion,
      endpoint: config.dynamoEndpoint,
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    })
  );
  tripStoreContract(
    "DynamoDB Local trip store",
    () => createDynamoStore(client, table, true),
    async (store) => {
      await store.reset();
    }
  );
} else
  it.skip("DynamoDB Local contract requires RUN_DYNAMO_CONTRACT=1", () => {
    throw new Error("Local database required");
  });

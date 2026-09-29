import { CreateTableCommand, DynamoDBClient, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { parseEnv } from "../src/config/env";

const config = parseEnv(process.env);
if (config.storeProvider !== "dynamo" || !config.dynamoEndpoint || !config.dynamoTable)
  throw new Error("Local DynamoDB endpoint and table are required");
const client = new DynamoDBClient({
  region: config.awsRegion,
  endpoint: config.dynamoEndpoint,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
try {
  await client.send(
    new CreateTableCommand({
      TableName: config.dynamoTable,
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );
} catch (error) {
  if (!(error instanceof Error && error.name === "ResourceInUseException")) throw error;
}
await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: config.dynamoTable });
process.stdout.write("Local trip table ready\n");
client.destroy();

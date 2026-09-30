import { parseEnv } from "../src/config/env";
import { demoTrips } from "../src/store/fixtures";
import { selectStore } from "../src/store/select";

const config = parseEnv(process.env);
if (config.storeProvider !== "dynamo" || !config.dynamoEndpoint)
  throw new Error("seed:once requires an explicit local DynamoDB endpoint");
await selectStore(config).reset(demoTrips());
process.stdout.write("Local trip table reset and seeded\n");

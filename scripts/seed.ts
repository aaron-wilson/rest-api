import { serve } from "@hono/node-server";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";
import { createLogger } from "../src/logger";
import { demoTrips } from "../src/store/fixtures";
import { createMemoryStore } from "../src/store/memory";

const config = parseEnv(process.env);
const store = createMemoryStore();
await store.reset(demoTrips());
serve({ fetch: createApp(config, store).fetch, port: config.port });
createLogger(config.logLevel)("info", "seeded_server_start", {
  port: config.port,
  trips: demoTrips().length,
});

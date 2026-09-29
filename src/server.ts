import { createApp } from "./app";
import { parseEnv } from "./config/env";
import { createLogger } from "./logger";

const config = parseEnv(process.env);
const log = createLogger(config.logLevel);
log("info", "server_start", { port: config.port });
export default { port: config.port, fetch: createApp(config).fetch };

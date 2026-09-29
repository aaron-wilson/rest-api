import { createApp } from "./app";
import { parseEnv } from "./config/env";
import { createLogger } from "./logger";

const config = parseEnv(process.env);
const log = createLogger(config.logLevel);
log("info", "server_start", { port: config.port });
const app = createApp(config);
export default {
  port: config.port,
  fetch(request: Request, server: { requestIP(request: Request): { address: string } | null }) {
    return app.fetch(request, { server });
  },
};

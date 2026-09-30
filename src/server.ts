import { createApp } from "./app";
import type { parseEnv } from "./config/env";
import { createLogger } from "./logger";

export function serverOptions(config: ReturnType<typeof parseEnv>) {
  const log = createLogger(config.logLevel);
  log("info", "server_start", { port: config.port });
  const app = createApp(config);
  return {
    port: config.port,
    fetch(request: Request, server: { requestIP(request: Request): { address: string } | null }) {
      return app.fetch(request, { server });
    },
  };
}

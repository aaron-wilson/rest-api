import { createApp } from "./app";
import { summarizeConfig, type RestConfig } from "./config/env";
import { createLogger } from "./logger";

export function serverOptions(config: RestConfig) {
  const log = createLogger(config.logLevel);
  log("info", "config_summary", summarizeConfig(config));
  log("info", "server_start", { port: config.port });
  const app = createApp(config);
  return {
    port: config.port,
    fetch(request: Request, server: { requestIP(request: Request): { address: string } | null }) {
      return app.fetch(request, { server });
    },
  };
}

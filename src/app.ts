import { Hono } from "hono";
import { cors } from "hono/cors";
import type { parseEnv } from "./config/env";
import { createLogger } from "./logger";

export type Config = ReturnType<typeof parseEnv>;
export function createApp(config: Config) {
  const app = new Hono();
  const log = createLogger(config.logLevel);
  app.use("*", cors({ origin: config.corsOrigin }));
  app.onError((error, c) => {
    log("error", "request_error", { name: error.name });
    return c.json({ error: "Internal server error" }, 500);
  });
  app.get("/hello", (c) =>
    c.json({
      message: "Hello from REST API!",
      timestamp: new Date().toISOString(),
      framework: "Hono",
      runtime: "Bun",
    })
  );
  app.get("/health", (c) =>
    c.json({ status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() })
  );
  app.get("/", (c) =>
    c.json({
      message: "Welcome to the REST API",
      version: "1.0.0",
      endpoints: ["/hello", "/health"],
    })
  );
  return app;
}

import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";

const config = parseEnv({});
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});
describe("REST foundation", () => {
  it("parses defaults and rejects malformed values without echoing values", () => {
    expect(config.port).toBe(3000);
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => parseEnv({ PORT: "secret" })).toThrow("PORT");
    expect(() => parseEnv({ CORS_ORIGIN: "secret" })).toThrow("CORS_ORIGIN");
  });
  it("serves health over HTTP", async () => {
    server = await new Promise<Server>((resolve) => {
      const started = serve(
        { fetch: createApp(config).fetch, port: 0, hostname: "127.0.0.1" },
        () => resolve(started)
      );
    });
    const response = await request(server).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("healthy");
  });
  it("hides internal errors", async () => {
    const app = createApp(config);
    app.get("/error", () => {
      throw new Error("private detail");
    });
    const response = await app.request("/error");
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});

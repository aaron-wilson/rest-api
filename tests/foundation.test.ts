import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { parseEnv, summarizeConfig } from "../src/config/env";
import { serverOptions } from "../src/server";

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
  it("validates selected storage and telemetry without echoing values", () => {
    const rejected: [Record<string, string>, string][] = [
      [{ PROVIDER_STORE: "dynamo" }, "DYNAMO_TABLE"],
      [{ PROVIDER_STORE: "dynamo", DYNAMO_TABLE: "bad table PRIVATE_SENTINEL" }, "DYNAMO_TABLE"],
      [
        { DYNAMO_ENDPOINT: "http://PRIVATE_SENTINEL.example:8000", DYNAMO_TABLE: "wander-local" },
        "DYNAMO_ENDPOINT",
      ],
      [{ TELEMETRY_MODE: "otlp" }, "OTEL_EXPORTER_OTLP_ENDPOINT"],
      [
        { TELEMETRY_MODE: "otlp", OTEL_EXPORTER_OTLP_ENDPOINT: "http://u:PRIVATE_SENTINEL@c:4318" },
        "OTEL_EXPORTER_OTLP_ENDPOINT",
      ],
      [{ APP_MODE: "live", COGNITO_CLIENT_ID: "PRIVATE_SENTINEL" }, "Cognito settings"],
    ];
    for (const [input, key] of rejected) {
      let message = "";
      try {
        parseEnv(input);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message).toContain(key);
      expect(message).not.toContain("PRIVATE_SENTINEL");
    }
    // Blank optional settings stay valid while their adapter is not selected.
    expect(
      parseEnv({ DYNAMO_TABLE: "", DYNAMO_ENDPOINT: "", OTEL_EXPORTER_OTLP_ENDPOINT: "" })
        .storeProvider
    ).toBe("memory");
  });
  it("summarizes selections without tables, endpoints or identifiers", () => {
    expect(summarizeConfig(config)).toEqual({ auth: "demo", store: "memory", telemetry: "off" });
    const selected = parseEnv({
      PROVIDER_STORE: "dynamo",
      DYNAMO_TABLE: "private-table",
      DYNAMO_ENDPOINT: "http://dynamodb:8000",
      TELEMETRY_MODE: "otlp",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
    });
    const summary = summarizeConfig(selected);
    expect(summary).toEqual({ auth: "demo", store: "dynamo", telemetry: "otlp" });
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    serverOptions(selected);
    const lines = write.mock.calls.join(" ");
    write.mockRestore();
    expect(lines).toContain('"event":"config_summary"');
    expect(lines).toContain('"store":"dynamo"');
    expect(lines).not.toMatch(/private-table|collector|dynamodb:8000/);
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

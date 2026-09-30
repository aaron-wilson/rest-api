import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../src/config/env";
import { startTelemetry } from "../src/otel/init";
import { createLogger } from "../src/logger";

describe("telemetry boundary", () => {
  it("does not create exporters in the default mode", () => {
    expect(startTelemetry(parseEnv({}))).toBeNull();
  });

  it("accepts only an OTLP URL when enabled", () => {
    expect(() => parseEnv({ TELEMETRY_MODE: "otlp" })).toThrow("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  it("drops unapproved log fields", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    createLogger("info")("error", "request_error", { name: "Error", token: "private" });
    createLogger("info")("error", "request_error", { name: "token=private" });
    expect(write.mock.calls.join(" ")).not.toContain("private");
    write.mockRestore();
  });
});

it("exports server failures once and leaves client rejections and health UNSET", async () => {
  const { NodeSDK, tracing, metrics, logs } = await import("@opentelemetry/sdk-node");
  const exporter = new tracing.InMemorySpanExporter();
  const metricExporter = new metrics.InMemoryMetricExporter(
    metrics.AggregationTemporality.CUMULATIVE
  );
  const reader = new metrics.PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000,
  });
  const logExporter = new logs.InMemoryLogRecordExporter();
  const sdk = new NodeSDK({
    spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
    metricReader: reader,
    logRecordProcessors: [new logs.SimpleLogRecordProcessor(logExporter)],
  });
  sdk.start();
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const { createApp } = await import("../src/app");
    const app = createApp(parseEnv({ RATE_LIMIT_PER_MINUTE: "1" }), undefined, undefined, (c) =>
      c.req.path === "/failure" ? "failure" : "client"
    );
    app.get("/failure", () => {
      throw new Error("PRIVATE_TELEMETRY_SENTINEL");
    });
    const statuses = [];
    for (const path of ["/failure", "/trips", "/trips", "/health"])
      statuses.push((await app.request(path)).status);
    expect(statuses).toEqual([500, 401, 429, 200]);
    const spans = exporter.getFinishedSpans().filter((span) => span.name === "http.rest");
    expect.soft(spans.map((span) => span.status.code)).toEqual([2, 0, 0, 0]);
    await reader.forceFlush();
    const failures = metricExporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .filter((metric) => metric.descriptor.name === "wander.operation.errors")
      .flatMap((metric) => metric.dataPoints)
      .filter((point) => point.attributes.operation === "http.rest");
    expect.soft(failures.map((point) => point.value)).toEqual([1]);
    const exported = JSON.stringify({
      spans: spans.map((span) => ({
        status: span.status,
        attributes: span.attributes,
        events: span.events,
      })),
      metrics: metricExporter.getMetrics(),
      logs: logExporter
        .getFinishedLogRecords()
        .map((record) => ({ body: record.body, attributes: record.attributes })),
    });
    expect(exported).not.toContain("PRIVATE_TELEMETRY_SENTINEL");
  } finally {
    await sdk.shutdown();
    write.mockRestore();
  }
});

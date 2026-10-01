import { context, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";

export type LogLevel = "debug" | "info" | "warn" | "error";
const rank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
// Only these fields are ever written, and only when their value has a harmless shape.
const WORD_FIELDS = new Set(["name", "classification", "auth", "store", "telemetry"]);
const WORD = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export function createLogger(minimum: LogLevel) {
  return (level: LogLevel, event: string, fields: Record<string, string | number> = {}) => {
    if (rank[level] < rank[minimum]) return;
    const safe = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) =>
        key === "port"
          ? Number.isInteger(value)
          : WORD_FIELDS.has(key) && typeof value === "string" && WORD.test(value)
      )
    );
    const span = trace.getSpan(context.active())?.spanContext();
    const correlation =
      span?.traceId && span.traceId !== "00000000000000000000000000000000"
        ? { trace_id: span.traceId, span_id: span.spanId }
        : {};
    process.stderr.write(`${JSON.stringify({ level, event, ...safe, ...correlation })}\n`);
    logs.getLogger("wander-rest").emit({
      severityText: level.toUpperCase(),
      body: event,
      attributes: { ...safe, ...correlation },
    });
  };
}

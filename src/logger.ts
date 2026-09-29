export type LogLevel = "debug" | "info" | "warn" | "error";
const rank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
export function createLogger(minimum: LogLevel) {
  return (level: LogLevel, event: string, fields: Record<string, string | number> = {}) => {
    if (rank[level] < rank[minimum]) return;
    process.stderr.write(`${JSON.stringify({ level, event, ...fields })}\n`);
  };
}

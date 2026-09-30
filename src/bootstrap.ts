import { parseEnv } from "./config/env";
import { startTelemetry } from "./otel/init";

const config = parseEnv(process.env);
const sdk = startTelemetry(config);
const { default: server } = await import("./server");
Bun.serve(server);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void sdk?.shutdown().finally(() => process.exit(0));
  });
}

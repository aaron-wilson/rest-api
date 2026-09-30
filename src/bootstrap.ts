import { parseEnv } from "./config/env";
import { startTelemetry } from "./otel/init";

const config = parseEnv(process.env);
const sdk = startTelemetry(config);
const { serverOptions } = await import("./server");
Bun.serve(serverOptions(config));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (!sdk) process.exit(0);
    else void sdk.shutdown().finally(() => process.exit(0));
  });
}

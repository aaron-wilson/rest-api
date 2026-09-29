import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGIN: z
    .string()
    .url()
    .refine(
      (value) =>
        (() => {
          try {
            return new URL(value).origin === value;
          } catch {
            return false;
          }
        })(),
      "must be an origin"
    )
    .default("http://localhost:3001"),
  PROVIDER_STORE: z.enum(["memory", "dynamo"]).default("memory"),
  DYNAMO_TABLE: z.string().min(3).optional(),
  AWS_REGION: z.string().min(1).default("us-east-1"),
  DYNAMO_ENDPOINT: z.string().url().optional(),
});

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(
    Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, value === "" ? undefined : value])
    )
  );
  if (!result.success) {
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`
    );
  }
  if (result.data.PROVIDER_STORE === "dynamo" && !result.data.DYNAMO_TABLE)
    throw new Error("Invalid configuration: DYNAMO_TABLE");
  if (result.data.DYNAMO_ENDPOINT) {
    const endpoint = new URL(result.data.DYNAMO_ENDPOINT);
    if (endpoint.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(endpoint.hostname))
      throw new Error("Invalid configuration: DYNAMO_ENDPOINT");
  }
  return Object.freeze({
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    corsOrigin: result.data.CORS_ORIGIN,
    storeProvider: result.data.PROVIDER_STORE,
    dynamoTable: result.data.DYNAMO_TABLE,
    awsRegion: result.data.AWS_REGION,
    dynamoEndpoint: result.data.DYNAMO_ENDPOINT,
  });
}

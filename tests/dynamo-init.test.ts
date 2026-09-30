import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";

it("waits for local DynamoDB before creating and checking the table", async () => {
  const calls: string[] = [];
  let probes = 0;
  const server = createServer((request, response) => {
    const action = String(request.headers["x-amz-target"]).split(".").at(-1) ?? "";
    calls.push(action);
    response.setHeader("content-type", "application/x-amz-json-1.0");
    if (action === "ListTables" && ++probes === 1) {
      response.writeHead(400);
      response.end(JSON.stringify({ __type: "ResourceNotFoundException", message: "Starting" }));
    } else {
      response.end(
        JSON.stringify(
          action === "ListTables" ? { TableNames: [] } : { Table: { TableStatus: "ACTIVE" } }
        )
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  const child = spawn("bun", ["--no-env-file", "run", "scripts/init-dynamo.ts"], {
    env: {
      ...process.env,
      PROVIDER_STORE: "dynamo",
      DYNAMO_TABLE: "wander-local",
      DYNAMO_ENDPOINT: `http://127.0.0.1:${address.port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  const timeout = setTimeout(() => child.kill(), 8000);
  try {
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    expect(status, output).toBe(0);
    expect(calls).toEqual(["ListTables", "ListTables", "CreateTable", "DescribeTable"]);
    expect(output).toContain("Local trip table ready");
  } finally {
    clearTimeout(timeout);
    child.kill();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 10000);

import { readFileSync, writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import { openApiDocument } from "../src/openapi";

const path = new URL("../docs/openapi.json", import.meta.url);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check"))
  throw new Error("Use --check to validate, or no arguments to regenerate");
const snapshot = await format(JSON.stringify(openApiDocument), {
  ...(await resolveConfig(path.pathname)),
  parser: "json",
});
if (args[0] === "--check") {
  if (readFileSync(path, "utf8") !== snapshot) throw new Error("OpenAPI snapshot drift");
  process.stdout.write("OpenAPI snapshot matches the schema\n");
} else {
  writeFileSync(path, snapshot);
}

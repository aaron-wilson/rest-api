import { writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import { openApiDocument } from "../src/openapi";

const path = new URL("../docs/openapi.json", import.meta.url);
writeFileSync(
  path,
  await format(JSON.stringify(openApiDocument), {
    ...(await resolveConfig(path.pathname)),
    parser: "json",
  })
);

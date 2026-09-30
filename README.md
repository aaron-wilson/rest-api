# Wander REST API

The Bun/Hono domain service owns trips, days, activities, preferences and share links. Zod validates HTTP boundaries and generates the committed OpenAPI contract. Memory and DynamoDB DocumentClient adapters share ownership, pagination and conditional-version semantics; GraphQL accesses these records through REST rather than owning a second database adapter.

## Local use

Use Bun 1.2.21 and the committed Bun lockfile. Install dependencies explicitly with `bun install --frozen-lockfile` before using checks. With installed dependencies:

```sh
bun --no-env-file src/bootstrap.ts
```

Defaults are port 3000, demo identity and memory persistence. Private routes require `Authorization: Bearer demo`; public shared projections omit ownership data. `GET /health`, `/openapi.json` and `/docs` are local endpoints; Swagger assets are served locally. Memory resets on restart. `PROVIDER_STORE=dynamo` requires `DYNAMO_TABLE`; a local `DYNAMO_ENDPOINT` selects DynamoDB Local without a cloud account. Table initialization and destructive demo seeding are separate explicit commands.

`.env.example` documents runtime settings, and `infra/.env.example` documents deploy-time inputs. `APP_MODE=live` requires matching Cognito pool/client configuration and accepts verified access tokens only. Invalid live configuration fails startup; demo auth is not a fallback. `CORS_ORIGIN` is a single allowed origin and `RATE_LIMIT_PER_MINUTE` bounds requests.

## Checks and implementation status

From a sibling workspace with the hub's platform toolchain installed:

```sh
node ../graph-rest-react-stack/scripts/verify-repo.mjs rest-api
```

The entrypoint runs direct Prettier/ESLint/types, Bun-driven Vitest unit/contracts/bound-server integration, OpenAPI drift, the Bun build, CDK assertions and credential-free synth. DynamoDB Local's separate opt-in contract requires its emulator:

```sh
PROVIDER_STORE=dynamo DYNAMO_TABLE=wander-local DYNAMO_ENDPOINT=http://127.0.0.1:8000 RUN_DYNAMO_CONTRACT=1 bun --no-env-file --bun node_modules/.bin/vitest run tests/dynamo-contract.test.ts
```

OpenTelemetry traces, metrics and correlated structured logs are implemented; `TELEMETRY_MODE=off` exports nothing by default. OTLP collector/New Relic routing is optional. `infra/` defines private ECS Fargate, scoped task roles, deploy-time SSM references, DynamoDB access and alarms; offline template assertions do not prove an AWS deployment. Docker/Compose and DynamoDB Local acceptance need Docker. Real Cognito, cloud DynamoDB, AWS deployment and external telemetry exports remain live-unverified. All workflow definitions remain disabled templates; there is no active CI badge or automatic deployment.

The sibling hub's learning index and verification record describe the assembled journey and evidence. This API does not call planning vendors or host the frontend.

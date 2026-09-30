# rest-api

> TypeScript-first REST service with Bun, Hono, Zod, OpenAPI, and DynamoDB.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Database](#database)
- [Authentication & Security](#authentication--security)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Observability](#observability)

---

## Overview

The REST layer owns trip rules and persistence: trips, days, activities, preferences, and share links. It demonstrates validated HTTP boundaries, interchangeable stores, and conditional writes.

- Hono routes with Zod validation and generated OpenAPI
- Memory defaults and an optional DynamoDB DocumentClient adapter
- Ownership checks, version conflicts, public projections and Cognito auth

---

## Tech Stack

| Layer                     | Technology                                | Role                                       |
| ------------------------- | ----------------------------------------- | ------------------------------------------ |
| Language                  | TypeScript 5.9.2                          | Typed domain and HTTP contracts            |
| Runtime / package manager | Bun 1.2.21                                | Execution, bundling and locked installs    |
| Framework                 | Hono 4.9.6                                | Routes and middleware                      |
| Validation / docs         | Zod 3.25.76 · Swagger UI 5.33             | Runtime schemas and generated OpenAPI      |
| Persistence               | DynamoDB SDK 3.1142 · DocumentClient      | Ownership, paging and conditional versions |
| Authentication            | Cognito · aws-jwt-verify 5.2.1            | Verify live access tokens                  |
| Testing                   | Vitest 5.0.2 · Supertest 7.3              | Store contracts and real HTTP integration  |
| Deployment                | Docker · CDK · ECS Fargate · internal ALB | Private domain service                     |
| Observability             | OpenTelemetry API 1.9 / SDK 0.203         | Traces, metrics and correlated logs        |

---

## Getting Started

Use Bun 1.2.21; Node 24 is the tooling baseline.

```sh
bun install --frozen-lockfile
bun run dev
```

Health: http://localhost:3000/health. Swagger UI: `/docs`; contract: `/openapi.json`. Private demo requests use `Authorization: Bearer demo`. Docker is optional for source development; the [hub](https://github.com/aaron-wilson/graph-rest-react-stack) runs the full container alternative.

---

## Configuration

[.env.example](.env.example) documents actual names: `PROVIDER_STORE`, `DYNAMO_TABLE`, `DYNAMO_ENDPOINT`, `CORS_ORIGIN` and `RATE_LIMIT_PER_MINUTE`. Bun loads local env files. Defaults require no credentials; Cognito settings are required only for `APP_MODE=live`. Deployment inputs live in [infra/.env.example](infra/.env.example).

---

## Database

Memory resets on restart. `PROVIDER_STORE=dynamo` selects DynamoDB and requires `DYNAMO_TABLE`; a local `DYNAMO_ENDPOINT` selects the emulator. Both adapters enforce ownership and optimistic concurrency. `dynamo:init` creates the local table; `seed:once` explicitly resets local data.

---

## Authentication & Security

Cognito verifies access tokens in live mode; demo identity is explicit. Private routes enforce ownership, Zod validation, rate limits and a single allowed CORS origin. Public shares omit private ownership data.

---

## Testing

```sh
bun run typecheck
bun run lint
bun --no-env-file --bun run test
bun run build
bun run spec:check
```

`spec:check` compares the generated contract without writing files; `spec:snapshot` deliberately updates it after schema changes. `test:dynamo` needs initialized DynamoDB Local and its explicit endpoint/table settings. Infrastructure scripts use the sibling hub's installed platform toolchain.

---

## CI/CD

Disabled GitHub Actions templates cover checks and manual deployment. `infra/` defines private Fargate tasks, DynamoDB IAM, health checks and a CPU alarm; shared resources live in the hub's CDK app. Templates and offline synth are implemented; Docker/live AWS acceptance remains pending.

---

## Observability

OpenTelemetry exports are off by default. Set `TELEMETRY_MODE=otlp` and `OTEL_EXPORTER_OTLP_ENDPOINT` for traces, metrics and redacted logs. Optional New Relic forwarding is handled by the hub collector.

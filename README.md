# rest-api

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/aaron-wilson/rest-api/actions/workflows/ci.yml/badge.svg)](https://github.com/aaron-wilson/rest-api/actions)

> A TypeScript-first, ESM-native REST API built with Bun, Hono, and AWS infrastructure for secure, scalable, and maintainable services.

---

## Table of Contents

* [Overview](#overview)
* [Tech Stack](#tech-stack)
* [Getting Started](#getting-started)
* [Configuration](#configuration)
* [Database](#database)
* [Authentication & Security](#authentication--security)
* [Testing](#testing)
* [CI/CD](#cicd)
* [Observability](#observability)
* [Contributing](#contributing)
* [License](#license)

---

## Overview

This repository implements a REST API using **Bun** as the runtime and **Hono** as the TypeScript-first framework. It provides a type-safe, high-performance, and maintainable backend with AWS integration for database, authentication, and deployment.

Key features:

* Fully typed REST routes with Hono and Zod validation
* OpenAPI spec generation for documentation and client SDKs
* Scalable AWS DynamoDB data layer with TypeScript DTOs
* Cognito JWT authentication middleware
* Built-in rate limiting, CORS, and input validation
* Unit, integration, and e2e testing with Vitest, Supertest, and Playwright
* CI/CD pipeline deploying Docker images to ECS Fargate via GitHub Actions and AWS CDK
* Observability using OpenTelemetry and New Relic

---

## Tech Stack

| Layer                     | Technology                                                                                                                | Reasoning / Explanation                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / Package Manager | [Bun](https://bun.sh)                                                                                                     | High-performance JavaScript/TypeScript runtime with native bundler and ESM-first support. Improves startup and build times.      |
| REST Framework            | [Hono](https://hono.dev)                                                                                                  | TypeScript-first, fully typed routing framework optimized for speed and simplicity. Supports middleware and OpenAPI integration. |
| Validation                | [Zod](https://zod.dev)                                                                                                    | Runtime schema validation for request and response objects; ensures type-safe data.                                              |
| API Documentation         | OpenAPI / Swagger UI                                                                                                      | Auto-generated OpenAPI JSON enables client SDK generation and interactive docs.                                                  |
| Database                  | [AWS DynamoDB (DocumentClient)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)       | Managed, scalable NoSQL database ideal for serverless REST APIs. TypeScript DTOs enforce structure and type safety.              |
| Authentication            | [AWS Cognito](https://aws.amazon.com/cognito/)                                                                            | Secure JWT authentication with middleware for token verification.                                                                |
| Security                  | Rate limiting, CORS, Input Validation                                                                                     | Protects endpoints from abuse, cross-origin attacks, and invalid inputs.                                                         |
| Testing                   | [Vitest](https://vitest.dev), [Supertest](https://github.com/visionmedia/supertest), [Playwright](https://playwright.dev) | Vitest for unit tests, Supertest for API integration, and Playwright for REST + frontend e2e scenarios.                          |
| CI/CD                     | GitHub Actions + Docker + ECS Fargate + AWS CDK                                                                           | Automates build, test, and deployment. Infrastructure as code ensures reproducibility and scalability.                           |
| Secrets Management        | AWS SSM Parameter Store / Secrets Manager                                                                                 | Secure storage and retrieval of sensitive credentials.                                                                           |
| Observability             | [OpenTelemetry](https://opentelemetry.io/) → [New Relic](https://newrelic.com/)                                           | Logs, metrics, and traces for monitoring, alerting, and performance analysis.                                                    |

---

## Getting Started

### Prerequisites

* [Bun](https://bun.sh) installed
* [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials
* Node.js (for local compatibility testing)
* Docker (for containerized development/testing)

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/rest-api.git
cd rest-api

# Install dependencies with Bun
bun install

# Start local server (hot reload supported)
bun run dev
```

* API playground available at `http://localhost:3000`
* Hot-reloads on code changes
* Environment variables auto-loaded from `.env`

---

## Configuration

Store sensitive or environment-specific configuration in `.env` or AWS Secrets Manager/Parameter Store. Example `.env`:

```env
AWS_REGION=us-east-1
DYNAMO_TABLE_NAME=my-table
COGNITO_USER_POOL_ID=your-user-pool-id
RATE_LIMIT=100
CORS_ORIGIN=*
```

TypeScript DTOs ensure runtime safety and predictable structure.

---

## Database

* **AWS DynamoDB** with **DocumentClient** for flexible, schema-less storage.
* TypeScript DTOs enforce type-safe requests/responses.
* Supports atomic updates, conditional writes, and high scalability.

```ts
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
```

---

## Authentication & Security

* **Cognito JWT verification middleware** secures endpoints.
* **Rate limiting** and **CORS** protect API from abuse.
* **Zod validation** ensures correct input/output data.

```ts
app.use(jwtMiddleware({ userPoolId: process.env.COGNITO_USER_POOL_ID }));
```

---

## Testing

* **Unit Tests**: Vitest ensures isolated function-level validation.
* **Integration Tests**: Supertest verifies REST API endpoints.
* **E2E Tests**: Playwright handles full-stack scenarios combining frontend and REST API.

```bash
# Run all unit tests
bun run vitest
```

---

## CI/CD

* **GitHub Actions** automates build, test, and Docker image creation.
* Deploys to **AWS ECS Fargate** behind an **ALB**.
* **AWS CDK** manages infrastructure: clusters, services, task definitions, and log groups.

```yaml
# Example CI step
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: bun install
      - run: bun run vitest
      - run: docker build -t my-api .
      - run: cdk deploy
```

---

## Observability

* **OpenTelemetry** collects logs, metrics, and traces.
* **New Relic** dashboards monitor API performance, errors, and latency.

---

## Contributing

We welcome contributions! Please follow our guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -m 'Add new feature'`)
4. Push to branch (`git push origin feature/my-feature`)
5. Open a pull request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

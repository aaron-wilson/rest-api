import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { daySchema, tripSchema } from "./domain/trip";
import {
  activityCreateSchema,
  activityUpdateSchema,
  batchRequestSchema,
  createTripSchema,
  dayCreateSchema,
  dayUpdateSchema,
  pinRequestSchema,
  preferencesRequestSchema,
  swapRequestSchema,
  updateRequestSchema,
  versionSchema,
} from "./routes/schemas";

const jsonSchema = (schema: z.ZodTypeAny) => {
  const { $schema: _schema, ...result } = zodToJsonSchema(schema, { target: "openApi3" });
  void _schema;
  return result;
};
const publicSchema = z.object({
  id: z.string().uuid(),
  city: z.string(),
  days: z.array(daySchema),
  updatedAt: z.string().datetime(),
});
const listSchema = z.object({ items: z.array(tripSchema), nextCursor: z.string().nullable() });
type Tag = "Trips" | "Itinerary" | "Sharing" | "System";
function operation(
  summary: string,
  request?: z.ZodTypeAny,
  response: z.ZodTypeAny = tripSchema,
  publicAccess = false,
  successStatus: 200 | 201 | 204 = 200,
  tag: Tag = "Trips"
) {
  return {
    summary,
    tags: [tag],
    security: publicAccess ? [] : [{ bearerAuth: [] }],
    ...(request
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(request) } },
          },
        }
      : {}),
    responses: {
      [successStatus]:
        successStatus === 204
          ? { description: "Deleted" }
          : {
              description: "Success",
              content: { "application/json": { schema: jsonSchema(response) } },
            },
      "400": { description: "Invalid request" },
      ...(publicAccess ? {} : { "401": { description: "Missing or invalid bearer token" } }),
      "404": { description: "Not found" },
      ...(publicAccess ? {} : { "409": { description: "Version conflict" } }),
      "429": { description: "Rate limit exceeded" },
    },
  };
}
const itinerary = (summary: string, request: z.ZodTypeAny) =>
  operation(summary, request, tripSchema, false, 200, "Itinerary");
const healthSchema = z.object({
  status: z.literal("healthy"),
  uptime: z.number(),
  timestamp: z.string().datetime(),
});
const description = [
  "Stores trips for their owners. Every write carries the trip `version` it was based on and",
  "fails with `409` when the stored trip has moved on.",
  "",
  "## Authorization",
  "",
  "Routes marked with a lock require `Authorization: Bearer <token>` and answer `401` without",
  "it. Select **Authorize** and enter the token alone, without the `Bearer` prefix.",
  "",
  "- `APP_MODE=demo`: the token is `demo`. This page enters it for you.",
  "- `APP_MODE=live`: use a Cognito access token issued to the configured app client.",
  "",
  "Routes without a lock are public: the shared-trip projection and the health check.",
].join("\n");
const tripId = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const dayId = {
  name: "dayId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const activityId = {
  name: "activityId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const withParams = (params: object[], methods: object) =>
  Object.fromEntries(
    Object.entries(methods).map(([method, value]) => [method, { ...value, parameters: params }])
  );
export const openApiDocument = {
  openapi: "3.0.3",
  info: { title: "Wander REST API", version: "1.0.0", description },
  servers: [{ url: "/" }],
  tags: [
    { name: "Trips", description: "Owned trips. Bearer token required." },
    {
      name: "Itinerary",
      description: "Days and activities of an owned trip. Bearer token required.",
    },
    {
      name: "Sharing",
      description: "Create or revoke a share link; read a shared trip without a token.",
    },
    { name: "System", description: "Service status. Public." },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "The token alone, without the Bearer prefix. In demo mode it is `demo`.",
      },
    },
  },
  paths: {
    "/trips": {
      get: {
        ...operation("List owned trips", undefined, listSchema),
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
      },
      post: operation("Create trip", createTripSchema, tripSchema, false, 201),
    },
    "/trips/batch": {
      post: operation(
        "Batch read owned trips",
        batchRequestSchema,
        z.object({ items: z.array(tripSchema) })
      ),
    },
    "/trips/{id}": withParams([tripId], {
      get: operation("Read owned trip"),
      patch: operation("Update trip", updateRequestSchema),
      delete: operation("Delete trip", versionSchema, z.null(), false, 204),
    }),
    "/trips/{id}/pin": withParams([tripId], { post: itinerary("Pin activity", pinRequestSchema) }),
    "/trips/{id}/swap": withParams([tripId], {
      post: itinerary("Swap activity", swapRequestSchema),
    }),
    "/trips/{id}/preferences": withParams([tripId], {
      put: itinerary("Update preferences", preferencesRequestSchema),
    }),
    "/trips/{id}/days": withParams([tripId], { post: itinerary("Add day", dayCreateSchema) }),
    "/trips/{id}/days/{dayId}": withParams([tripId, dayId], {
      patch: itinerary("Update day", dayUpdateSchema),
      delete: itinerary("Delete day", versionSchema),
    }),
    "/trips/{id}/days/{dayId}/activities": withParams([tripId, dayId], {
      post: itinerary("Add activity", activityCreateSchema),
    }),
    "/trips/{id}/activities/{activityId}": withParams([tripId, activityId], {
      patch: itinerary("Update activity", activityUpdateSchema),
      delete: itinerary("Delete activity", versionSchema),
    }),
    "/trips/{id}/share": withParams([tripId], {
      post: operation(
        "Create share link",
        versionSchema,
        z.object({ token: z.string(), createdAt: z.string(), expiresAt: z.string() }),
        false,
        200,
        "Sharing"
      ),
      delete: operation("Revoke share link", versionSchema, tripSchema, false, 200, "Sharing"),
    }),
    "/shared/{ownerId}/{tripId}/{token}": withParams(
      [
        { name: "ownerId", in: "path", required: true, schema: { type: "string" } },
        { name: "tripId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        { name: "token", in: "path", required: true, schema: { type: "string" } },
      ],
      { get: operation("Read public share", undefined, publicSchema, true, 200, "Sharing") }
    ),
    "/health": {
      get: {
        summary: "Service status",
        tags: ["System"],
        security: [],
        responses: {
          "200": {
            description: "The service is running",
            content: { "application/json": { schema: jsonSchema(healthSchema) } },
          },
        },
      },
    },
  },
};

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
function operation(
  summary: string,
  request?: z.ZodTypeAny,
  response: z.ZodTypeAny = tripSchema,
  publicAccess = false,
  successStatus: 200 | 201 | 204 = 200
) {
  return {
    summary,
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
      "401": { description: "Unauthorized" },
      "404": { description: "Not found" },
      "409": { description: "Version conflict" },
      "429": { description: "Rate limit exceeded" },
    },
  };
}
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
  info: { title: "Wander REST API", version: "1.0.0" },
  servers: [{ url: "/" }],
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
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
    "/trips/{id}/pin": withParams([tripId], { post: operation("Pin activity", pinRequestSchema) }),
    "/trips/{id}/swap": withParams([tripId], {
      post: operation("Swap activity", swapRequestSchema),
    }),
    "/trips/{id}/preferences": withParams([tripId], {
      put: operation("Update preferences", preferencesRequestSchema),
    }),
    "/trips/{id}/days": withParams([tripId], { post: operation("Add day", dayCreateSchema) }),
    "/trips/{id}/days/{dayId}": withParams([tripId, dayId], {
      patch: operation("Update day", dayUpdateSchema),
      delete: operation("Delete day", versionSchema),
    }),
    "/trips/{id}/days/{dayId}/activities": withParams([tripId, dayId], {
      post: operation("Add activity", activityCreateSchema),
    }),
    "/trips/{id}/activities/{activityId}": withParams([tripId, activityId], {
      patch: operation("Update activity", activityUpdateSchema),
      delete: operation("Delete activity", versionSchema),
    }),
    "/trips/{id}/share": withParams([tripId], {
      post: operation(
        "Create share link",
        versionSchema,
        z.object({ token: z.string(), createdAt: z.string(), expiresAt: z.string() })
      ),
      delete: operation("Revoke share link", versionSchema),
    }),
    "/shared/{ownerId}/{tripId}/{token}": withParams(
      [
        { name: "ownerId", in: "path", required: true, schema: { type: "string" } },
        { name: "tripId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        { name: "token", in: "path", required: true, schema: { type: "string" } },
      ],
      { get: operation("Read public share", undefined, publicSchema, true) }
    ),
  },
};

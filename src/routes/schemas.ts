import { z } from "zod";
import {
  activitySchema,
  createTripSchema,
  daySchema,
  preferencesSchema,
  updateTripSchema,
} from "../domain/trip";

export const idSchema = z.string().uuid();
export const versionSchema = z.object({ version: z.number().int().positive() });
export const updateRequestSchema = versionSchema.extend({ changes: updateTripSchema });
export const pinRequestSchema = versionSchema.extend({ activityId: idSchema, pinned: z.boolean() });
export const swapRequestSchema = versionSchema.extend({
  activityId: idSchema,
  replacement: activitySchema,
});
export const batchRequestSchema = z.object({ ids: z.array(idSchema).max(100) });
export const dayCreateSchema = versionSchema.extend({ day: daySchema });
export const dayUpdateSchema = versionSchema.extend({
  changes: daySchema.omit({ id: true }).partial(),
});
export const activityCreateSchema = versionSchema.extend({ activity: activitySchema });
export const activityUpdateSchema = versionSchema.extend({
  changes: activitySchema.omit({ id: true }).partial(),
});
export const preferencesRequestSchema = versionSchema.extend({ preferences: preferencesSchema });
export { createTripSchema };

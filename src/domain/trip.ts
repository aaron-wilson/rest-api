import { z } from "zod";

export const activitySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  pinned: z.boolean(),
});
export const daySchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  activities: z.array(activitySchema).max(20),
});
export const preferencesSchema = z.object({
  interests: z.array(z.string().trim().min(1).max(80)).max(20),
  pace: z.enum(["relaxed", "balanced", "busy"]),
});
export const shareLinkSchema = z.object({
  token: z.string().min(32),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export class ActivityNotFound extends Error {}
export class InvalidTripEdit extends Error {}
const tripObjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().trim().min(1),
  city: z.string().trim().min(1).max(100),
  preferences: preferencesSchema,
  days: z.array(daySchema).min(1).max(30),
  share: shareLinkSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});
const uniqueEntities = (days: z.infer<typeof daySchema>[]) => {
  const dayIds = new Set<string>();
  const activityIds = new Set<string>();
  for (const day of days) {
    if (dayIds.has(day.id)) return false;
    dayIds.add(day.id);
    for (const activity of day.activities) {
      if (activityIds.has(activity.id)) return false;
      activityIds.add(activity.id);
    }
  }
  return true;
};
const uniqueDays = { message: "Duplicate day or activity ID" };
export const tripSchema = tripObjectSchema.refine((trip) => uniqueEntities(trip.days), uniqueDays);
export const createTripSchema = tripObjectSchema
  .pick({ city: true, preferences: true, days: true })
  .refine((trip) => uniqueEntities(trip.days), uniqueDays);
export const updateTripSchema = tripObjectSchema
  .pick({ city: true, preferences: true, days: true })
  .partial();
export type Trip = z.infer<typeof tripSchema>;
export type CreateTrip = z.infer<typeof createTripSchema>;

export function createTrip(ownerId: string, input: CreateTrip, id: string, now: string): Trip {
  return tripSchema.parse({
    ...createTripSchema.parse(input),
    id,
    ownerId,
    share: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
}

export function updateTrip(
  trip: Trip,
  changes: z.infer<typeof updateTripSchema>,
  now: string
): Trip {
  return tripSchema.parse({ ...trip, ...changes, updatedAt: now, version: trip.version + 1 });
}
export function pinActivity(trip: Trip, activityId: string, pinned: boolean, now: string): Trip {
  let found = false;
  const days = trip.days.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => {
      if (activity.id !== activityId) return activity;
      found = true;
      return { ...activity, pinned };
    }),
  }));
  if (!found) throw new ActivityNotFound("Activity not found");
  return updateTrip(trip, { days }, now);
}
export function swapActivity(
  trip: Trip,
  activityId: string,
  replacement: z.infer<typeof activitySchema>,
  now: string
): Trip {
  if (
    trip.days.some((day) =>
      day.activities.some(
        (activity) => activity.id === replacement.id && activity.id !== activityId
      )
    )
  )
    throw new InvalidTripEdit("Duplicate activity ID");
  let found = false;
  const days = trip.days.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => {
      if (activity.id !== activityId) return activity;
      if (activity.pinned) throw new InvalidTripEdit("Pinned activity cannot be swapped");
      found = true;
      return replacement;
    }),
  }));
  if (!found) throw new ActivityNotFound("Activity not found");
  return updateTrip(trip, { days }, now);
}
export function publicTrip(trip: Trip) {
  return { id: trip.id, city: trip.city, days: trip.days, updatedAt: trip.updatedAt };
}

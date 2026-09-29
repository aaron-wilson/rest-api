import type { Trip } from "../domain/trip";
const cities = ["Lisbon", "Kyoto", "Montreal"];
export function demoTrips(): Trip[] {
  return cities.map((city, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ownerId: "demo",
    city,
    preferences: { interests: ["food", "walking"], pace: "balanced" },
    days: [
      {
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        date: "2026-10-01",
        activities: [
          {
            id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            title: `Explore ${city}`,
            pinned: false,
          },
        ],
      },
    ],
    share: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    version: 1,
  }));
}

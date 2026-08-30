import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getLocationCuisineStats } from "@/lib/gemini";

const schema = z.object({
  cuisineType: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const body = schema.parse(await readJson(request).catch(() => ({})));
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, session.restaurantId))
      .limit(1);
    if (!restaurant) return jsonError("Restaurant not found", 404);

    const city = body.city || restaurant.city;
    if (!city) {
      return jsonError("Set restaurant city first for location insights");
    }

    const stats = await getLocationCuisineStats({
      cuisineType: body.cuisineType || restaurant.cuisineType,
      city,
      region: body.region ?? restaurant.region,
      country: body.country ?? restaurant.country,
    });

    return jsonOk({ stats });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Location insights failed";
    return jsonError(message, 500);
  }
}

export async function GET() {
  // Convenience: same as POST with restaurant defaults
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, session.restaurantId))
    .limit(1);
  if (!restaurant) return jsonError("Restaurant not found", 404);
  if (!restaurant.city) {
    return jsonError("Set restaurant city first for location insights");
  }

  try {
    const stats = await getLocationCuisineStats({
      cuisineType: restaurant.cuisineType,
      city: restaurant.city,
      region: restaurant.region,
      country: restaurant.country,
    });
    return jsonOk({ stats });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Location insights failed";
    return jsonError(message, 500);
  }
}

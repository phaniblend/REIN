import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { dishFoodCosts } from "@/lib/food-cost";
import { getLocationCuisineStats } from "@/lib/gemini";

async function peerCount(cuisine: string, city: string) {
  const rows = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(
      sql`lower(${restaurants.cuisineType}) = ${cuisine.toLowerCase()} and lower(${restaurants.city}) = ${city.toLowerCase()} and ${restaurants.isTest} = false`,
    );
  return rows;
}

async function withSource(input: {
  cuisineType: string;
  city: string;
  region: string;
  country: string;
}) {
  const peers = await peerCount(input.cuisineType, input.city);
  if (peers.length >= 5) {
    const percents: number[] = [];
    for (const peer of peers) {
      const costs = await dishFoodCosts(peer.id);
      for (const cost of costs) {
        if (cost.foodCostPercent !== null) percents.push(cost.foodCostPercent);
      }
    }
    const food =
      percents.length > 0
        ? percents.reduce((sum, value) => sum + value, 0) / percents.length
        : 0;
    return {
      source: { kind: "restaurants" as const, count: peers.length },
      stats: {
        cuisineType: input.cuisineType,
        locationLabel: [input.city, input.region, input.country].filter(Boolean).join(", "),
        sampleConfidence: "high" as const,
        disclaimer: `from ${peers.length} restaurants`,
        averages: {
          foodCostPercentOfSales: Math.round(food),
          grocerySpendVsTheoreticalUsagePercent: 0,
          groceryBoughtVsSoldRatio: 0,
          typicalGrossMarginPercent: Math.round(100 - food),
          spoilageWastePercentOfPurchases: 0,
          unaccountedShrinkPercentOfUsage: 0,
        },
        notes: [`Food cost is the average recipe cost across ${peers.length} restaurants sharing this cuisine and city.`],
        benchmarks: [
          {
            metric: "Food cost",
            value: Math.round(food),
            unit: "%",
            interpretation: `from ${peers.length} restaurants`,
          },
        ],
      },
    };
  }
  const stats = await getLocationCuisineStats(input);
  return {
    source: { kind: "estimate" as const, count: peers.length },
    stats: {
      ...stats,
      disclaimer: `estimate · ${stats.disclaimer}`,
    },
  };
}

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

    const payload = await withSource({
      cuisineType: body.cuisineType || restaurant.cuisineType,
      city,
      region: body.region ?? restaurant.region,
      country: body.country ?? restaurant.country,
    });

    return jsonOk(payload);
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
    const payload = await withSource({
      cuisineType: restaurant.cuisineType,
      city: restaurant.city,
      region: restaurant.region,
      country: restaurant.country,
    });
    return jsonOk(payload);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Location insights failed";
    return jsonError(message, 500);
  }
}

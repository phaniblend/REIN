import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { locations, restaurants, shiftCounts } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { computeAvT } from "@/lib/avt";
import { countWindowStart } from "@/lib/count-window";
import { posCoverage } from "@/lib/pos-sync";
import { binsFor, ensureLocationBins, setBin } from "@/lib/active-location";
import { num } from "@/lib/utils";

const schema = z.object({
  /** Blind physical counts keyed by ingredientId */
  counts: z.record(z.string().uuid(), z.number().nonnegative()),
  openingStocks: z.record(z.string().uuid(), z.number().nonnegative()).optional(),
  sinceHours: z.number().positive().default(16),
  commitStock: z.boolean().default(true),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = schema.parse(await readJson(request));
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, session.restaurantId))
      .limit(1);
    if (!restaurant) return jsonError("Restaurant not found", 404);

    const threshold = num(restaurant.varianceThresholdPercent, 5);
    const [lastClose] = await db
      .select({
        closedAt: sql<Date | null>`max(${shiftCounts.createdAt})`,
      })
      .from(shiftCounts)
      .where(eq(shiftCounts.restaurantId, session.restaurantId));
    const since = countWindowStart(lastClose?.closedAt, Date.now(), body.sinceHours);
    const location = await ensureLocationBins(session.restaurantId);
    const [first] = await db
      .select()
      .from(locations)
      .where(eq(locations.restaurantId, session.restaurantId))
      .limit(1);
    const bins = await binsFor(location.id);
    const onHand = Object.fromEntries(bins);

    const results = await computeAvT({
      restaurantId: session.restaurantId,
      physicalCounts: body.counts,
      openingStocks: body.openingStocks,
      since,
      thresholdPercent: threshold,
      onHand,
      locationId: location.id,
      includeLegacy: first?.id === location.id,
    });

    const saved = [];
    for (const row of results) {
      const [savedRow] = await db
        .insert(shiftCounts)
        .values({
          restaurantId: session.restaurantId,
          ingredientId: row.ingredientId,
          countedBy: session.id,
          physicalCount: row.physicalEndingCount.toFixed(3),
          theoreticalBalance: (
            row.openingStock +
            row.receivedPurchases -
            row.theoreticalUsage -
            row.loggedKitchenWastage -
            row.returnedDishWaste
          ).toFixed(3),
          variance: row.totalVariance.toFixed(3),
          unaccountedCost: row.unaccountedCost.toFixed(2),
        })
        .returning();
      saved.push(savedRow);

      if (body.commitStock) {
        await setBin(location.id, row.ingredientId, row.physicalEndingCount);
      }
    }

    const alerts = results.filter((r) => r.exceedsThreshold);

    const coverage = await posCoverage(session.restaurantId, since);

    return jsonOk({
      thresholdPercent: threshold,
      results,
      alerts,
      savedCount: saved.length,
      posCoverage: coverage,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Shift reconciliation failed", 500);
  }
}

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ingredients,
  menuItems,
  orderItems,
  orders,
  recipeBoms,
  stockReceipts,
  wastageLogs,
} from "@/db/schema";
import { num } from "@/lib/utils";

export type IngredientAvT = {
  ingredientId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  openingStock: number;
  receivedPurchases: number;
  physicalEndingCount: number;
  actualUsage: number;
  theoreticalUsage: number;
  totalVariance: number;
  loggedKitchenWastage: number;
  returnedDishWaste: number;
  unaccountedLoss: number;
  unaccountedCost: number;
  variancePercentOfTheoretical: number | null;
  exceedsThreshold: boolean;
};

/**
 * Actual vs Theoretical engine (SDD §2.1)
 * Theoretical = Σ(qty sold × recipe qty × (1 + shrinkage%))
 * Actual = opening + purchases − ending physical count
 * Unaccounted = variance − (kitchen waste + returned waste)
 */
export async function computeAvT(params: {
  restaurantId: string;
  physicalCounts: Record<string, number>;
  /** Opening stock snapshot at shift start; defaults to currentStock + actualUsage approx via counts */
  openingStocks?: Record<string, number>;
  since?: Date;
  thresholdPercent: number;
}): Promise<IngredientAvT[]> {
  const since = params.since ?? new Date(Date.now() - 1000 * 60 * 60 * 16);

  const stockRows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, params.restaurantId));

  const ingredientIds = stockRows.map((i) => i.id);
  if (ingredientIds.length === 0) return [];

  const receiptRows = await db
    .select({
      ingredientId: stockReceipts.ingredientId,
      qty: sql<string>`coalesce(sum(${stockReceipts.quantity}), 0)`,
    })
    .from(stockReceipts)
    .where(
      and(
        eq(stockReceipts.restaurantId, params.restaurantId),
        gte(stockReceipts.receivedAt, since),
        inArray(stockReceipts.ingredientId, ingredientIds),
      ),
    )
    .groupBy(stockReceipts.ingredientId);

  const wasteRows = await db
    .select({
      ingredientId: wastageLogs.ingredientId,
      kind: wastageLogs.kind,
      qty: sql<string>`coalesce(sum(${wastageLogs.quantity}), 0)`,
    })
    .from(wastageLogs)
    .where(
      and(
        eq(wastageLogs.restaurantId, params.restaurantId),
        gte(wastageLogs.createdAt, since),
        inArray(wastageLogs.ingredientId, ingredientIds),
      ),
    )
    .groupBy(wastageLogs.ingredientId, wastageLogs.kind);

  const soldBom = await db
    .select({
      ingredientId: recipeBoms.ingredientId,
      theoretical: sql<string>`coalesce(sum(
        ${orderItems.quantity}::numeric *
        ${recipeBoms.grossQuantity}::numeric *
        (1 + coalesce(${recipeBoms.shrinkageMarginPercent}, 0) / 100.0)
      ), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .innerJoin(recipeBoms, eq(recipeBoms.menuItemId, menuItems.id))
    .where(
      and(
        eq(orders.restaurantId, params.restaurantId),
        gte(orders.createdAt, since),
        inArray(orderItems.status, ["SERVED", "PREPARING", "RETURNED"]),
        inArray(recipeBoms.ingredientId, ingredientIds),
      ),
    )
    .groupBy(recipeBoms.ingredientId);

  const receiptsMap = Object.fromEntries(
    receiptRows.map((r) => [r.ingredientId, num(r.qty)]),
  );
  const theoreticalMap = Object.fromEntries(
    soldBom.map((r) => [r.ingredientId, num(r.theoretical)]),
  );

  const kitchenWaste: Record<string, number> = {};
  const returnedWaste: Record<string, number> = {};
  for (const row of wasteRows) {
    const q = num(row.qty);
    if (row.kind === "KITCHEN_SPOILED") {
      kitchenWaste[row.ingredientId] = (kitchenWaste[row.ingredientId] ?? 0) + q;
    } else if (row.kind === "POS_RETURNED_WASTE") {
      returnedWaste[row.ingredientId] = (returnedWaste[row.ingredientId] ?? 0) + q;
    }
  }

  return stockRows
    .filter((row) => params.physicalCounts[row.id] !== undefined)
    .map((row) => {
      const ending = params.physicalCounts[row.id];
      const received = receiptsMap[row.id] ?? 0;
      // Prefer explicit opening snapshot; else treat currentStock as pre-count on-hand
      // after receipts already applied in stock ledger.
      const openingStock =
        params.openingStocks?.[row.id] !== undefined
          ? params.openingStocks[row.id]
          : num(row.currentStock);

      const physicalEndingCount = ending;
      const actualUsage = openingStock + received - physicalEndingCount;
      const theoreticalUsage = theoreticalMap[row.id] ?? 0;
      const totalVariance = actualUsage - theoreticalUsage;
      const loggedKitchenWastage = kitchenWaste[row.id] ?? 0;
      const returnedDishWaste = returnedWaste[row.id] ?? 0;
      const unaccountedLoss =
        totalVariance - (loggedKitchenWastage + returnedDishWaste);
      const costPerUnit = num(row.costPerUnit);
      const variancePercentOfTheoretical =
        theoreticalUsage > 0 ? (unaccountedLoss / theoreticalUsage) * 100 : null;
      const exceedsThreshold =
        variancePercentOfTheoretical !== null &&
        Math.abs(variancePercentOfTheoretical) > params.thresholdPercent;

      return {
        ingredientId: row.id,
        name: row.name,
        unit: row.unit,
        costPerUnit,
        openingStock,
        receivedPurchases: received,
        physicalEndingCount,
        actualUsage,
        theoreticalUsage,
        totalVariance,
        loggedKitchenWastage,
        returnedDishWaste,
        unaccountedLoss,
        unaccountedCost: unaccountedLoss * costPerUnit,
        variancePercentOfTheoretical,
        exceedsThreshold,
      };
    });
}

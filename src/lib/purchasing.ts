import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  ingredients,
  menuItems,
  orderItems,
  orders,
  posItemMappings,
  posSaleLines,
  integrationConnections,
  recipeBoms,
  supplierItems,
  suppliers,
} from "@/db/schema";
import { num } from "@/lib/utils";

export type SuggestedLine = {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  supplierName: string | null;
  supplierId: string | null;
};

/** Par minus on-hand minus expected usage, rounded up to the supplier pack. */
export async function suggestPurchaseLines(
  restaurantId: string,
  onHand?: Map<string, number>,
): Promise<SuggestedLine[]> {
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sales = await db
    .select({
      qty: posSaleLines.qty,
      dishId: posItemMappings.dishId,
      soldAt: posSaleLines.soldAt,
    })
    .from(posSaleLines)
    .innerJoin(
      integrationConnections,
      eq(posSaleLines.connectionId, integrationConnections.id),
    )
    .innerJoin(posItemMappings, eq(posItemMappings.posItemId, posSaleLines.posItemId))
    .where(
      and(
        eq(integrationConnections.restaurantId, restaurantId),
        eq(posItemMappings.status, "confirmed"),
        gte(posSaleLines.soldAt, since),
      ),
    );
  const tickets = await db
    .select({
      qty: orderItems.quantity,
      dishId: orderItems.menuItemId,
      soldAt: orders.createdAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.source, "restman"),
        gte(orders.createdAt, since),
      ),
    );
  const boms = await db.select().from(recipeBoms);
  const dishes = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId));
  const dishIds = new Set(dishes.map((row) => row.id));
  const daily: Record<string, number> = {};
  const addSale = (dishId: string, qty: number) => {
    if (!dishIds.has(dishId)) return;
    for (const line of boms) {
      if (line.menuItemId !== dishId) continue;
      const yieldPct = Math.max(num(line.yieldPercent), 1);
      daily[line.ingredientId] =
        (daily[line.ingredientId] ?? 0) +
        qty * num(line.grossQuantity) * (100 / yieldPct);
    }
  };
  for (const sale of sales) addSale(sale.dishId, num(sale.qty) / 7);
  for (const ticket of tickets) addSale(ticket.dishId, num(ticket.qty) / 7);

  const packs = await db
    .select({
      ingredientId: supplierItems.ingredientId,
      packSize: supplierItems.packSize,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
    })
    .from(supplierItems)
    .innerJoin(suppliers, eq(supplierItems.supplierId, suppliers.id))
    .where(eq(suppliers.restaurantId, restaurantId));
  const packByIngredient = new Map(packs.map((row) => [row.ingredientId, row]));

  const lines: SuggestedLine[] = [];
  for (const item of stock) {
    const par = num(item.parLevel);
    if (par <= 0) continue;
    const expected = daily[item.id] ?? 0;
    const have = onHand?.get(item.id) ?? num(item.currentStock);
    let need = par - have - expected;
    if (need <= 0) continue;
    const pack = packByIngredient.get(item.id);
    const packSize = Math.max(num(pack?.packSize), 1);
    need = Math.ceil(need / packSize) * packSize;
    lines.push({
      ingredientId: item.id,
      name: item.name,
      unit: item.unit,
      qty: need,
      supplierId: pack?.supplierId ?? null,
      supplierName: pack?.supplierName ?? null,
    });
  }
  return lines;
}

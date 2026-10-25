import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  ingredients,
  integrationConnections,
  menuItems,
  orderItems,
  orders,
  posItemMappings,
  posSaleLines,
  recipeBoms,
} from "@/db/schema";
import { num } from "@/lib/utils";

export type PrepLine = {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
};

/** Trailing four weeks of this weekday, times the recipe. */
export async function prepListFor(restaurantId: string, day = new Date()) {
  const weekday = day.getDay();
  const since = new Date(day.getTime() - 28 * 24 * 60 * 60 * 1000);
  const sales = await db
    .select({
      qty: posSaleLines.qty,
      soldAt: posSaleLines.soldAt,
      dishId: posItemMappings.dishId,
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
      soldAt: orders.createdAt,
      dishId: orderItems.menuItemId,
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
  const byDish: Record<string, { qty: number; days: Set<string> }> = {};
  const add = (dishId: string, qty: number, soldAt: Date) => {
    if (soldAt.getDay() !== weekday) return;
    const key = soldAt.toISOString().slice(0, 10);
    const row = byDish[dishId] ?? { qty: 0, days: new Set<string>() };
    row.qty += qty;
    row.days.add(key);
    byDish[dishId] = row;
  };
  for (const sale of sales) add(sale.dishId, num(sale.qty), sale.soldAt);
  for (const ticket of tickets) add(ticket.dishId, num(ticket.qty), ticket.soldAt);

  const dishes = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId));
  const names = new Map(dishes.map((row) => [row.id, row.name]));
  const boms = await db.select().from(recipeBoms);
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  const stockById = new Map(stock.map((row) => [row.id, row]));
  const usage: Record<string, number> = {};
  const dishesToday: { name: string; qty: number }[] = [];
  for (const [dishId, row] of Object.entries(byDish)) {
    const days = Math.max(row.days.size, 1);
    const avg = row.qty / days;
    if (names.has(dishId)) dishesToday.push({ name: names.get(dishId)!, qty: avg });
    for (const line of boms) {
      if (line.menuItemId !== dishId) continue;
      const yieldPct = Math.max(num(line.yieldPercent), 1);
      usage[line.ingredientId] =
        (usage[line.ingredientId] ?? 0) + avg * num(line.grossQuantity) * (100 / yieldPct);
    }
  }
  const lines: PrepLine[] = [];
  for (const [ingredientId, qty] of Object.entries(usage)) {
    const item = stockById.get(ingredientId);
    if (!item) continue;
    lines.push({ ingredientId, name: item.name, unit: item.unit, qty });
  }
  lines.sort((a, b) => a.name.localeCompare(b.name));
  return { lines, dishes: dishesToday };
}

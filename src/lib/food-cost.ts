import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, menuItems, recipeBoms } from "@/db/schema";
import { num } from "@/lib/utils";

export type DishCost = {
  dishId: string;
  foodCost: number;
  foodCostPercent: number | null;
  overTarget: boolean;
};

const TARGET_PERCENT = 35;

export async function dishFoodCosts(restaurantId: string): Promise<DishCost[]> {
  const dishes = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId));
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  const costById = new Map(stock.map((row) => [row.id, num(row.costPerUnit)]));
  const boms = await db.select().from(recipeBoms);
  const byDish = new Map<string, typeof boms>();
  for (const line of boms) {
    const list = byDish.get(line.menuItemId) ?? [];
    list.push(line);
    byDish.set(line.menuItemId, list);
  }

  return dishes.map((dish) => {
    const lines = byDish.get(dish.id) ?? [];
    let foodCost = 0;
    for (const line of lines) {
      const yieldPct = Math.max(num(line.yieldPercent), 1);
      const shrink = 1 + num(line.shrinkageMarginPercent) / 100;
      const qty = num(line.grossQuantity) * shrink * (100 / yieldPct);
      foodCost += qty * (costById.get(line.ingredientId) ?? 0);
    }
    const price = num(dish.sellingPrice);
    const foodCostPercent = price > 0 ? (foodCost / price) * 100 : null;
    return {
      dishId: dish.id,
      foodCost,
      foodCostPercent,
      overTarget: foodCostPercent !== null && foodCostPercent > TARGET_PERCENT,
    };
  });
}

export { TARGET_PERCENT };

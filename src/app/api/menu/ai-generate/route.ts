import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, menuItems, recipeBoms, restaurants } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { suggestMenuAndRecipes } from "@/lib/gemini";

/** Batched Gemini calls for a full ~40-item menu can take 1–2 minutes. */
export const maxDuration = 300;

const schema = z.object({
  focus: z.string().optional(),
  count: z.number().int().min(1).max(48).optional(),
  persist: z.boolean().default(true),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
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

    const existingIngredients = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.restaurantId, session.restaurantId));

    const suggestion = await suggestMenuAndRecipes({
      cuisineType: restaurant.cuisineType,
      restaurantName: restaurant.name,
      city: restaurant.city,
      region: restaurant.region,
      country: restaurant.country,
      currency: restaurant.currency,
      existingIngredients: existingIngredients.map((i) => i.name),
      focus: body.focus,
      count: body.count,
    });

    if (!body.persist) {
      return jsonOk({ suggestion, persisted: [] });
    }

    // Full regenerate replaces draft/pending AI stubs so runs don't stack (6+6…).
    // Approved items are kept.
    await db
      .delete(menuItems)
      .where(
        and(
          eq(menuItems.restaurantId, session.restaurantId),
          inArray(menuItems.menuApprovalStatus, [
            "PENDING_APPROVAL",
            "DRAFT",
          ]),
        ),
      );

    const persisted = [];

    for (const item of suggestion.items) {
      const bomLinks: {
        ingredientId: string;
        grossQuantity: string;
        shrinkageMarginPercent: string;
      }[] = [];

      for (const ing of item.ingredients) {
        const existing = existingIngredients.find(
          (e) => e.name.toLowerCase() === ing.name.toLowerCase(),
        );
        let ingredientId = existing?.id;
        if (!ingredientId) {
          const [created] = await db
            .insert(ingredients)
            .values({
              restaurantId: session.restaurantId,
              name: ing.name,
              category: ing.category,
              unit: ing.unit,
              costPerUnit: (ing.estimatedCostPerUnit ?? 1).toFixed(2),
              currentStock: "0.000",
            })
            .returning();
          existingIngredients.push(created);
          ingredientId = created.id;
        }
        bomLinks.push({
          ingredientId,
          grossQuantity: ing.grossQuantity.toFixed(3),
          shrinkageMarginPercent: ing.shrinkageMarginPercent.toFixed(2),
        });
      }

      const [menuItem] = await db
        .insert(menuItems)
        .values({
          restaurantId: session.restaurantId,
          name: item.name,
          category: item.category,
          sellingPrice: item.sellingPrice.toFixed(2),
          menuApprovalStatus: "PENDING_APPROVAL",
          recipeApprovalStatus: "PENDING_APPROVAL",
        })
        .returning();

      if (bomLinks.length) {
        await db.insert(recipeBoms).values(
          bomLinks.map((b) => ({
            menuItemId: menuItem.id,
            ...b,
          })),
        );
      }

      persisted.push(menuItem);
    }

    return jsonOk({ suggestion, persisted });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Menu generation failed";
    return jsonError(message, 500);
  }
}

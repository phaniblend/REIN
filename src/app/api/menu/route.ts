import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, menuItems, recipeBoms } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  sellingPrice: z.number().positive(),
  recipe: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        grossQuantity: z.number().positive(),
        shrinkageMarginPercent: z.number().min(0).max(50).default(0),
      }),
    )
    .default([]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, session.restaurantId))
    .orderBy(asc(menuItems.name));

  if (items.length === 0) return jsonOk({ menuItems: [] });

  const boms = await db
    .select({
      id: recipeBoms.id,
      menuItemId: recipeBoms.menuItemId,
      ingredientId: recipeBoms.ingredientId,
      grossQuantity: recipeBoms.grossQuantity,
      shrinkageMarginPercent: recipeBoms.shrinkageMarginPercent,
      ingredientName: ingredients.name,
      ingredientUnit: ingredients.unit,
      ingredientCategory: ingredients.category,
    })
    .from(recipeBoms)
    .innerJoin(ingredients, eq(ingredients.id, recipeBoms.ingredientId))
    .where(
      inArray(
        recipeBoms.menuItemId,
        items.map((i) => i.id),
      ),
    );

  return jsonOk({
    menuItems: items.map((item) => ({
      ...item,
      recipe: boms.filter((b) => b.menuItemId === item.id),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = createSchema.parse(await readJson(request));
    const [item] = await db
      .insert(menuItems)
      .values({
        restaurantId: session.restaurantId,
        name: body.name,
        category: body.category,
        sellingPrice: body.sellingPrice.toFixed(2),
        menuApprovalStatus: "DRAFT",
        recipeApprovalStatus: "DRAFT",
      })
      .returning();

    if (body.recipe.length) {
      await db.insert(recipeBoms).values(
        body.recipe.map((r) => ({
          menuItemId: item.id,
          ingredientId: r.ingredientId,
          grossQuantity: r.grossQuantity.toFixed(3),
          shrinkageMarginPercent: r.shrinkageMarginPercent.toFixed(2),
        })),
      );
    }

    return jsonOk({ menuItem: item }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to create menu item", 500);
  }
}

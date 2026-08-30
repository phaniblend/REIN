import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, menuItems, recipeBoms } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const lineSchema = z.object({
  ingredientId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  unit: z.enum(["KG", "G", "L", "ML", "PIECE", "PACKET"]).optional(),
  grossQuantity: z.number().positive(),
  shrinkageMarginPercent: z.number().min(0).max(50).default(5),
  costPerUnit: z.number().positive().optional(),
});

const bodySchema = z.object({
  lines: z.array(lineSchema).min(1),
  finalize: z.boolean().default(false),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  const { id } = await context.params;

  try {
    const body = bodySchema.parse(await readJson(request));

    const [item] = await db
      .select()
      .from(menuItems)
      .where(
        and(eq(menuItems.id, id), eq(menuItems.restaurantId, session.restaurantId)),
      )
      .limit(1);
    if (!item) return jsonError("Menu item not found", 404);

    const existingIngredients = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.restaurantId, session.restaurantId));

    const bomRows: {
      menuItemId: string;
      ingredientId: string;
      grossQuantity: string;
      shrinkageMarginPercent: string;
    }[] = [];

    for (const line of body.lines) {
      let ingredientId = line.ingredientId;
      if (ingredientId) {
        const found = existingIngredients.find((i) => i.id === ingredientId);
        if (!found) return jsonError("Ingredient not found for this restaurant");
      } else {
        const name = line.name?.trim();
        if (!name) return jsonError("Each line needs an ingredient");
        const existing = existingIngredients.find(
          (i) => i.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) {
          ingredientId = existing.id;
        } else {
          const [created] = await db
            .insert(ingredients)
            .values({
              restaurantId: session.restaurantId,
              name,
              category: line.category?.trim() || "General",
              unit: line.unit ?? "G",
              costPerUnit: (line.costPerUnit ?? 1).toFixed(2),
              currentStock: "0.000",
            })
            .returning();
          existingIngredients.push(created);
          ingredientId = created.id;
        }
      }

      bomRows.push({
        menuItemId: id,
        ingredientId: ingredientId!,
        grossQuantity: line.grossQuantity.toFixed(3),
        shrinkageMarginPercent: line.shrinkageMarginPercent.toFixed(2),
      });
    }

    await db.delete(recipeBoms).where(eq(recipeBoms.menuItemId, id));
    await db.insert(recipeBoms).values(bomRows);

    const updates: Partial<typeof menuItems.$inferInsert> = {
      recipeApprovalStatus: body.finalize ? "APPROVED" : "PENDING_APPROVAL",
    };
    if (body.finalize) {
      updates.chefSignedAt = new Date();
    }

    const [menuItem] = await db
      .update(menuItems)
      .set(updates)
      .where(eq(menuItems.id, id))
      .returning();

    return jsonOk({ menuItem, lines: bomRows.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to save recipe", 500);
  }
}

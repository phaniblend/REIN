import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, stockReceipts } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { num } from "@/lib/utils";
import { sql } from "drizzle-orm";

const schema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  supplierNote: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "STOCK_CLERK", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = schema.parse(await readJson(request));
    const [ing] = await db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.id, body.ingredientId),
          eq(ingredients.restaurantId, session.restaurantId),
        ),
      )
      .limit(1);
    if (!ing) return jsonError("Ingredient not found", 404);

    const [receipt] = await db
      .insert(stockReceipts)
      .values({
        restaurantId: session.restaurantId,
        ingredientId: body.ingredientId,
        receivedBy: session.id,
        quantity: body.quantity.toFixed(3),
        unitCost: body.unitCost.toFixed(2),
        supplierNote: body.supplierNote,
      })
      .returning();

    const nextStock = num(ing.currentStock) + body.quantity;
    await db
      .update(ingredients)
      .set({
        currentStock: nextStock.toFixed(3),
        costPerUnit: body.unitCost.toFixed(2),
      })
      .where(eq(ingredients.id, ing.id));

    return jsonOk({ receipt, currentStock: nextStock }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to record receipt", 500);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const rows = await db
    .select({
      id: stockReceipts.id,
      ingredientId: stockReceipts.ingredientId,
      ingredientName: ingredients.name,
      quantity: stockReceipts.quantity,
      unitCost: stockReceipts.unitCost,
      supplierNote: stockReceipts.supplierNote,
      receivedAt: stockReceipts.receivedAt,
    })
    .from(stockReceipts)
    .innerJoin(ingredients, eq(ingredients.id, stockReceipts.ingredientId))
    .where(eq(stockReceipts.restaurantId, session.restaurantId))
    .orderBy(sql`${stockReceipts.receivedAt} desc`)
    .limit(50);

  return jsonOk({ receipts: rows });
}

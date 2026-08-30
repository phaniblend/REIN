import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, wastageLogs } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { num } from "@/lib/utils";
import { and } from "drizzle-orm";

const schema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  kind: z
    .enum(["KITCHEN_SPOILED", "POS_RETURNED_WASTE", "POS_RETURNED_REUSED"])
    .default("KITCHEN_SPOILED"),
  reason: z.string().min(2),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const rows = await db
    .select({
      id: wastageLogs.id,
      ingredientId: wastageLogs.ingredientId,
      ingredientName: ingredients.name,
      quantity: wastageLogs.quantity,
      kind: wastageLogs.kind,
      reason: wastageLogs.reason,
      createdAt: wastageLogs.createdAt,
    })
    .from(wastageLogs)
    .innerJoin(ingredients, eq(ingredients.id, wastageLogs.ingredientId))
    .where(eq(wastageLogs.restaurantId, session.restaurantId))
    .orderBy(desc(wastageLogs.createdAt))
    .limit(50);

  return jsonOk({ wastage: rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
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

    const [log] = await db
      .insert(wastageLogs)
      .values({
        restaurantId: session.restaurantId,
        ingredientId: body.ingredientId,
        loggedBy: session.id,
        quantity: body.quantity.toFixed(3),
        kind: body.kind,
        reason: body.reason,
      })
      .returning();

    // Spoiled / wasted reduces on-hand; reused returns to stock (no deduct)
    if (body.kind !== "POS_RETURNED_REUSED") {
      const next = Math.max(0, num(ing.currentStock) - body.quantity);
      await db
        .update(ingredients)
        .set({ currentStock: next.toFixed(3) })
        .where(eq(ingredients.id, ing.id));
    }

    return jsonOk({ wastage: log }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to log wastage", 500);
  }
}

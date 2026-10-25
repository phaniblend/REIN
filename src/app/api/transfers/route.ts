import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  ingredients,
  locationStock,
  locations,
  stockTransfers,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { num } from "@/lib/utils";

const schema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  qty: z.number().positive(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can move stock", 403);
  const body = schema.parse(await readJson(request));
  if (body.fromLocationId === body.toLocationId) {
    return jsonError("Pick two different locations", 400);
  }
  const locs = await db
    .select()
    .from(locations)
    .where(eq(locations.restaurantId, session.restaurantId));
  const allowed = new Set(locs.map((row) => row.id));
  if (!allowed.has(body.fromLocationId) || !allowed.has(body.toLocationId)) {
    return jsonError("Location not found", 404);
  }
  const [item] = await db
    .select()
    .from(ingredients)
    .where(
      and(
        eq(ingredients.id, body.ingredientId),
        eq(ingredients.restaurantId, session.restaurantId),
      ),
    )
    .limit(1);
  if (!item) return jsonError("Stock item not found", 404);
  const [fromBin] = await db
    .select()
    .from(locationStock)
    .where(
      and(
        eq(locationStock.locationId, body.fromLocationId),
        eq(locationStock.ingredientId, body.ingredientId),
      ),
    )
    .limit(1);
  if (!fromBin || num(fromBin.qty) < body.qty) {
    return jsonError("Not enough stock at the source location", 400);
  }
  const [toBin] = await db
    .select()
    .from(locationStock)
    .where(
      and(
        eq(locationStock.locationId, body.toLocationId),
        eq(locationStock.ingredientId, body.ingredientId),
      ),
    )
    .limit(1);
  await db
    .update(locationStock)
    .set({ qty: (num(fromBin.qty) - body.qty).toFixed(3) })
    .where(eq(locationStock.id, fromBin.id));
  if (toBin) {
    await db
      .update(locationStock)
      .set({ qty: (num(toBin.qty) + body.qty).toFixed(3) })
      .where(eq(locationStock.id, toBin.id));
  } else {
    await db.insert(locationStock).values({
      locationId: body.toLocationId,
      ingredientId: body.ingredientId,
      qty: body.qty.toFixed(3),
    });
  }
  const [transfer] = await db
    .insert(stockTransfers)
    .values({
      restaurantId: session.restaurantId,
      fromLocationId: body.fromLocationId,
      toLocationId: body.toLocationId,
      ingredientId: body.ingredientId,
      qty: body.qty.toFixed(3),
      createdBy: session.id,
    })
    .returning();
  return jsonOk({ transfer }, { status: 201 });
}

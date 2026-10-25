import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { ingredients, locationStock, locations } from "@/db/schema";
import { ensureLocation } from "@/lib/pos-sync";
import { num } from "@/lib/utils";

export async function activeLocation(restaurantId: string) {
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.restaurantId, restaurantId));
  const fallback = rows[0] ?? (await ensureLocation(restaurantId));
  const jar = await cookies();
  const picked = jar.get("rm_location")?.value;
  return rows.find((row) => row.id === picked) ?? fallback;
}

/** Copy restaurant on-hand into the first location once, so older stock is not lost. */
export async function ensureLocationBins(restaurantId: string) {
  const location = await activeLocation(restaurantId);
  const existing = await db
    .select({ id: locationStock.id })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .where(eq(locations.restaurantId, restaurantId))
    .limit(1);
  if (existing.length) return location;
  const items = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  if (items.length) {
    await db.insert(locationStock).values(
      items.map((item) => ({
        locationId: location.id,
        ingredientId: item.id,
        qty: item.currentStock,
      })),
    );
  }
  return location;
}

export async function binsFor(locationId: string) {
  const rows = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.locationId, locationId));
  return new Map(rows.map((row) => [row.ingredientId, num(row.qty)]));
}

async function writeRestaurantTotal(ingredientId: string) {
  const bins = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.ingredientId, ingredientId));
  const total = bins.reduce((sum, row) => sum + num(row.qty), 0);
  await db
    .update(ingredients)
    .set({ currentStock: total.toFixed(3) })
    .where(eq(ingredients.id, ingredientId));
  return total;
}

export async function bumpBin(locationId: string, ingredientId: string, delta: number) {
  const [ing] = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.id, ingredientId))
    .limit(1);
  const [bin] = await db
    .select()
    .from(locationStock)
    .where(
      and(
        eq(locationStock.locationId, locationId),
        eq(locationStock.ingredientId, ingredientId),
      ),
    )
    .limit(1);
  const others = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.ingredientId, ingredientId));
  const starting = bin
    ? num(bin.qty)
    : others.length === 0
      ? num(ing?.currentStock)
      : 0;
  const next = Math.max(0, starting + delta);
  if (bin) {
    await db
      .update(locationStock)
      .set({ qty: next.toFixed(3) })
      .where(eq(locationStock.id, bin.id));
  } else {
    await db.insert(locationStock).values({
      locationId,
      ingredientId,
      qty: next.toFixed(3),
    });
  }
  const total = await writeRestaurantTotal(ingredientId);
  return { onHand: next, restaurantTotal: total };
}

export async function setBin(locationId: string, ingredientId: string, qty: number) {
  const next = Math.max(0, qty);
  const [bin] = await db
    .select()
    .from(locationStock)
    .where(
      and(
        eq(locationStock.locationId, locationId),
        eq(locationStock.ingredientId, ingredientId),
      ),
    )
    .limit(1);
  if (bin) {
    await db
      .update(locationStock)
      .set({ qty: next.toFixed(3) })
      .where(eq(locationStock.id, bin.id));
  } else {
    await db.insert(locationStock).values({
      locationId,
      ingredientId,
      qty: next.toFixed(3),
    });
  }
  return writeRestaurantTotal(ingredientId);
}

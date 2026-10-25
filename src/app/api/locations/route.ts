import { eq } from "drizzle-orm";
import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/db";
import { ingredients, locationStock, locations } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { ensureLocation } from "@/lib/pos-sync";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  const location = await ensureLocation(session.restaurantId);
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.restaurantId, session.restaurantId));
  const stockRows = await db
    .select()
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .where(eq(locations.restaurantId, session.restaurantId));
  if (stockRows.length === 0) {
    const items = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.restaurantId, session.restaurantId));
    if (items.length) {
      await db.insert(locationStock).values(
        items.map((item) => ({
          locationId: location.id,
          ingredientId: item.id,
          qty: item.currentStock,
        })),
      );
    }
  }
  const bins = await db
    .select({
      locationId: locationStock.locationId,
      ingredientId: locationStock.ingredientId,
      qty: locationStock.qty,
      name: ingredients.name,
      unit: ingredients.unit,
    })
    .from(locationStock)
    .innerJoin(ingredients, eq(locationStock.ingredientId, ingredients.id))
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .where(eq(locations.restaurantId, session.restaurantId));
  const jar = await cookies();
  const activeId = jar.get("rm_location")?.value ?? location.id;
  return jsonOk({
    locations: rows,
    stock: bins,
    activeLocationId: rows.some((row) => row.id === activeId) ? activeId : location.id,
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  timezone: z.string().min(1).max(80).default("America/Chicago"),
  closeHour: z.number().int().min(0).max(23).default(22),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can add a location", 403);
  const body = createSchema.parse(await readJson(request));
  const [created] = await db
    .insert(locations)
    .values({
      restaurantId: session.restaurantId,
      name: body.name.trim(),
      timezone: body.timezone,
      closeHour: String(body.closeHour),
    })
    .returning();
  const items = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, session.restaurantId));
  if (items.length) {
    await db.insert(locationStock).values(
      items.map((item) => ({
        locationId: created.id,
        ingredientId: item.id,
        qty: "0.000",
      })),
    );
  }
  return jsonOk({ location: created }, { status: 201 });
}

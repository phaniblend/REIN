import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { activeLocation, binsFor, ensureLocationBins, setBin } from "@/lib/active-location";
import { num } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.enum(["KG", "G", "L", "ML", "PIECE", "PACKET"]),
  costPerUnit: z.number().nonnegative(),
  currentStock: z.number().nonnegative().default(0),
  parLevel: z.number().nonnegative().optional(),
  shelfLifeDays: z.number().positive().optional(),
  allergens: z.string().max(200).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const location = await ensureLocationBins(session.restaurantId);
  const bins = await binsFor(location.id);
  const rows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, session.restaurantId))
    .orderBy(asc(ingredients.name));

  return jsonOk({
    locationId: location.id,
    locationName: location.name,
    ingredients: rows.map((row) => ({
      ...row,
      currentStock: (bins.get(row.id) ?? num(row.currentStock)).toFixed(3),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = createSchema.parse(await readJson(request));
    const name = body.name.trim();
    const [duplicate] = await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(
        and(
          eq(ingredients.restaurantId, session.restaurantId),
          sql`lower(${ingredients.name}) = ${name.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (duplicate) {
      return jsonError(`An ingredient named "${name}" already exists`, 409);
    }

    const [row] = await db
      .insert(ingredients)
      .values({
        restaurantId: session.restaurantId,
        name,
        category: body.category,
        unit: body.unit,
        costPerUnit: body.costPerUnit.toFixed(2),
        currentStock: "0.000",
        parLevel: body.parLevel?.toFixed(3),
        shelfLifeDays: body.shelfLifeDays?.toFixed(1),
        allergens: body.allergens?.trim() ?? "",
      })
      .returning();
    const location = await activeLocation(session.restaurantId);
    await setBin(location.id, row.id, body.currentStock);
    const [saved] = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, row.id))
      .limit(1);
    return jsonOk({ ingredient: saved }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to create ingredient", 500);
  }
}

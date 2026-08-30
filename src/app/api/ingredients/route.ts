import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.enum(["KG", "G", "L", "ML", "PIECE", "PACKET"]),
  costPerUnit: z.number().nonnegative(),
  currentStock: z.number().nonnegative().default(0),
  parLevel: z.number().nonnegative().optional(),
  shelfLifeDays: z.number().positive().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const rows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, session.restaurantId))
    .orderBy(asc(ingredients.name));

  return jsonOk({ ingredients: rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = createSchema.parse(await readJson(request));
    const [row] = await db
      .insert(ingredients)
      .values({
        restaurantId: session.restaurantId,
        name: body.name,
        category: body.category,
        unit: body.unit,
        costPerUnit: body.costPerUnit.toFixed(2),
        currentStock: body.currentStock.toFixed(3),
        parLevel: body.parLevel?.toFixed(3),
        shelfLifeDays: body.shelfLifeDays?.toFixed(1),
      })
      .returning();
    return jsonOk({ ingredient: row }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to create ingredient", 500);
  }
}
